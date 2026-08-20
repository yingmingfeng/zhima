/**
 * DSH profile 组装：复用 dsh 标准 web profile（dsh-base + dsh-web-app），
 * 强制 webserver 绑定 127.0.0.1:0（loopback 随机端口），并把 agent-presets
 * 显式指向 dsh 自带预设目录（否则会话恢复时 preset 找不到）。
 *
 * 参考 dsh-plugin-desktop/src/profile.ts 裁剪：砍掉 desktop-shell 插件注入、
 * picker/pwsh 替换、模式切换等桌面专属逻辑。zhima 本身就是壳，
 * 不需要 dsh 的 desktop-shell 插件，窗口由 main/dsh/runtime.ts 自建。
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

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

const BIN_NAME = 'zhima-dsh';
export const DSH_PROFILE_NAME = 'web';

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
): PreparedDshProfile {
  const require = createRequire(__filename);
  const installAnchor = require.resolve('@deepseek-ai/dsh/package.json');
  const profileDir = resolveProfileDir(DSH_PROFILE_NAME, homeDir);
  mkdirSync(profileDir, { recursive: true });

  if (!existsSync(join(profileDir, 'package.json'))) {
    initProfile(profileDir, [...PROFILE_TEMPLATES.web]);
  }
  // 维护 $home/profiles/node_modules 扁平回退，让 in-box 插件从任意 profile 可解析。
  healProfilesModuleFallback(installAnchor, homeDir);

  const profile = loadProfile(
    BIN_NAME,
    DSH_PROFILE_NAME,
    installAnchor,
    homeDir,
  );
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
