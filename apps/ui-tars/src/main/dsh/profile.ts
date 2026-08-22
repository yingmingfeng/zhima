/**
 * DSH profile 组装：复用 dsh 标准 web profile（dsh-base + dsh-web-app），
 * 强制 webserver 绑定 127.0.0.1:0（loopback 随机端口），并把 agent-presets
 * 显式指向 dsh 自带预设目录（否则会话恢复时 preset 找不到）。
 *
 * 参考 dsh-plugin-desktop/src/profile.ts 裁剪：砍掉 desktop-shell 插件注入、
 * picker/pwsh 替换、模式切换等桌面专属逻辑。zhima 本身就是壳，
 * 不需要 dsh 的 desktop-shell 插件，窗口由 main/dsh/runtime.ts 自建。
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { resolveDshHome } from '@deepseek-ai/dsh-home-paths';
import {
  PROFILE_TEMPLATES,
  composeEntries,
  healProfilesModuleFallback,
  initProfile,
  loadProfile,
  resolveProfileDir,
} from '@deepseek-ai/dsh-app-boot';
import type { EntryOptions } from '@deepseek-ai/cordis-plugin-loader';
import type { PatchOptions } from '@deepseek-ai/cordis-plugin-include';

import { DEFAULT_DSH_PROFILE, getSelectedDshProfile } from './state';

const BIN_NAME = 'zhima-dsh';

/**
 * profile 是否可加载：官方模板（web）首次使用会自动初始化；自定义 profile 必须
 * 已初始化（目录下存在 package.json），否则 openDshWindow 会弹窗拦截 boot。
 */
export function dshProfileExists(name: string): boolean {
  if (PROFILE_TEMPLATES[name] !== undefined) return true;
  return existsSync(
    join(resolveProfileDir(name, resolveDshHome()), 'package.json'),
  );
}

/**
 * 确保默认 profile（zhima-desktop）存在：不存在时用 web 模板创建，存在则跳过。
 * 启动时调用一次即可，让托盘「配置文件」菜单显示的 zhima-desktop 与磁盘一致。
 * cordis.yml 由 prepareDshProfile() 在 boot 时自动创建，此处不需要额外处理。
 */
export function ensureDefaultProfileExists(homeDir: string): void {
  const profileDir = resolveProfileDir(DEFAULT_DSH_PROFILE, homeDir);
  mkdirSync(profileDir, { recursive: true });
  if (!existsSync(join(profileDir, 'package.json'))) {
    initProfile(profileDir, [...PROFILE_TEMPLATES.web]);
  }
}

/** 一个已发现或可自动创建的 DSH profile（托盘切换用）。 */
export interface DshProfileSummary {
  name: string;
  dir: string;
  exists: boolean;
  selectable: boolean;
}

/** 列出可选 profile：扫描 $DSH_HOME/profiles + 虚拟默认项（zhima-desktop / 官方模板）。 */
export function listDshProfiles(): DshProfileSummary[] {
  const home = resolveDshHome();
  const profilesDir = join(home, 'profiles');
  const seen = new Map<string, DshProfileSummary>();
  try {
    for (const entry of readdirSync(profilesDir, { withFileTypes: true })) {
      if (
        entry.name === 'node_modules' ||
        (!entry.isDirectory() && !entry.isSymbolicLink())
      ) {
        continue;
      }
      const dir = join(profilesDir, entry.name);
      if (!existsSync(join(dir, 'package.json'))) continue;
      seen.set(entry.name, {
        name: entry.name,
        dir,
        exists: true,
        selectable: true,
      });
    }
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') throw cause;
  }
  // 虚拟默认项：zhima-desktop（不存在自动创建）+ 官方模板中 web-capable 的
  // （含 dsh-web-app，如 web）。headless 等无 Web UI 的官方模板不列出，
  // zhima 需要 webServer 提供 DSH 界面。
  const WEB_BUNDLE = '@deepseek-ai/dsh-web-app';
  const webTemplateNames = Object.entries(PROFILE_TEMPLATES)
    .filter(([, bundles]) => bundles.includes(WEB_BUNDLE))
    .map(([name]) => name);
  for (const name of [DEFAULT_DSH_PROFILE, ...webTemplateNames]) {
    if (seen.has(name)) continue;
    seen.set(name, {
      name,
      dir: resolveProfileDir(name, home),
      exists: false,
      selectable: true,
    });
  }
  const priority = (name: string): number =>
    name === DEFAULT_DSH_PROFILE
      ? 0
      : PROFILE_TEMPLATES[name] !== undefined
        ? 1
        : 2;
  return [...seen.values()].sort((left, right) => {
    const diff = priority(left.name) - priority(right.name);
    if (diff !== 0) return diff;
    return left.name < right.name ? -1 : left.name > right.name ? 1 : 0;
  });
}

// H4：Windows 目录选择器 auto 后端 → browse 后端 + surface。
const DIRECTORY_PICKER_ROW_ID = 'directory-picker';
const AUTO_PICKER_PACKAGE = '@deepseek-ai/dsh-host-directory-picker-auto';
const BROWSE_PICKER_BACKEND = '@deepseek-ai/dsh-host-directory-picker-browse';
const BROWSE_PICKER_SURFACE =
  '@deepseek-ai/dsh-client-ui-directory-picker-browse';

/** dsh 主包自带的 agent presets 目录（standard/code/minimal/cordis）。 */
function shippedPresetRoot(): string {
  const require = createRequire(__filename);
  return join(
    dirname(require.resolve('@deepseek-ai/dsh/package.json')),
    'config',
    'agent-presets',
  );
}

/** 读取 Loader 行的对象 config，宽容处理非对象值。 */
function rowConfig(row: EntryOptions | undefined): Record<string, unknown> {
  const config = row?.config;
  return config !== null && typeof config === 'object' && !Array.isArray(config)
    ? (config as Record<string, unknown>)
    : {};
}

/** 组合后的一次 boot 输入，直接喂给 dsh-app-boot 的 boot()。 */
export interface PreparedDshProfile {
  /** dsh home 根目录（默认 ~/.dsh）。 */
  homeDir: string;
  /** 安装锚点：dsh 主包 package.json（bundle 解析第一优先）。 */
  installAnchor: string;
  /** 空 root config（插件组合全部走 patches）。 */
  rootConfig: string;
  /** bare import 解析起点：profile 目录的 package.json。 */
  bareModuleBaseUrl: string;
  /** 完整有序 patch 列表（bundle 层 + profile 层 + agent-presets + webserver）。 */
  patches: PatchOptions[];
}

/**
 * 组装并持久化 web profile，返回本次 boot 输入。
 * profile 目录不存在时用官方 web 模板初始化（与 `dsh --profile web` 一致）。
 */
export function prepareDshProfile(
  homeDir: string,
  platform: NodeJS.Platform = process.platform,
  profileName: string = getSelectedDshProfile(),
): PreparedDshProfile {
  const require = createRequire(__filename);
  const installAnchor = require.resolve('@deepseek-ai/dsh/package.json');
  const profileDir = resolveProfileDir(profileName, homeDir);
  mkdirSync(profileDir, { recursive: true });

  if (!existsSync(join(profileDir, 'package.json'))) {
    initProfile(profileDir, [...PROFILE_TEMPLATES.web]);
  }
  // 维护 $home/profiles/node_modules 扁平回退，让 in-box 插件从任意 profile 可解析。
  healProfilesModuleFallback(installAnchor, homeDir);

  const profile = loadProfile(BIN_NAME, profileName, installAnchor, homeDir);
  const rootConfig = join(profileDir, 'cordis.yml');
  if (!existsSync(rootConfig)) writeFileSync(rootConfig, '[]\n');

  const basePatches: PatchOptions[] = [
    ...profile.layers.flatMap((layer) => layer.patches),
    ...profile.patches,
  ];

  // agent-presets：显式指向 dsh 自带预设目录。缺失时恢复既有会话会报
  // `preset "standard" not found (available: none)`。
  const rows = new Map<string, EntryOptions>();
  for (const row of composeEntries([basePatches])) {
    if (typeof row.id === 'string') rows.set(row.id, row);
  }
  const presets = rows.get('agent-presets');
  const patches: PatchOptions[] = [...basePatches];
  if (presets !== undefined) {
    patches.push({
      id: 'agent-presets',
      config: {
        ...rowConfig(presets),
        roots: [{ path: shippedPresetRoot(), trust: 'system' }],
      },
    });
  }

  if (platform === 'win32') {
    // H4：目录选择器 auto 后端在宿主壳里可能无响应，换成 browse 后端 + surface。
    const directoryPicker = rows.get(DIRECTORY_PICKER_ROW_ID);
    if (directoryPicker !== undefined) {
      patches.push(
        {
          id: DIRECTORY_PICKER_ROW_ID,
          name: AUTO_PICKER_PACKAGE,
          disabled: true,
        },
        {
          insert: [
            {
              id: 'desktop-directory-picker-browse-host',
              name: BROWSE_PICKER_BACKEND,
            },
            {
              id: 'desktop-directory-picker-browse-surface',
              name: BROWSE_PICKER_SURFACE,
            },
          ],
        },
      );
    }

    // 默认 full-access：dsh 沙箱 workspace-write 在 Windows/Electron 会冻结主进程（上游 bug），
    // read-only 会弹控制台黑窗导致 pwsh 转圈（未解决）。默认 full-access 才能开箱即用；
    // 用户切到沙箱模式需自行承担风险。
    const permission = rows.get('permission');
    if (permission !== undefined) {
      patches.push({
        id: 'permission',
        config: {
          ...rowConfig(permission),
          defaultPreset: 'danger-full-access',
        },
      });
    }
  }

  // 强制 loopback 绑定是宿主安全不变量，不是用户配置。
  patches.push({
    id: 'webserver',
    disabled: false,
    config: { host: '127.0.0.1', port: 0 },
  });

  return {
    homeDir,
    installAnchor,
    rootConfig,
    bareModuleBaseUrl: pathToFileURL(join(profileDir, 'package.json')).href,
    patches,
  };
}
