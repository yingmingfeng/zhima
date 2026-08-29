/**
 * DSH profile 组装：复用 dsh 标准 web profile（dsh-base + dsh-web-app），
 * 强制 webserver 绑定 127.0.0.1:0（loopback 随机端口），并把 agent-presets
 * 显式指向 dsh 自带预设目录（否则会话恢复时 preset 找不到）。
 *
 * 参考 dsh-plugin-desktop/src/profile.ts 裁剪：砍掉 desktop-shell 插件注入、
 * picker/pwsh 替换、模式切换等桌面专属逻辑。zhima 本身就是壳，
 * 不需要 dsh 的 desktop-shell 插件，窗口由 main/dsh/runtime.ts 自建。
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { isDev } from '@main/env';

import {
  composeEntries,
  healProfilesModuleFallback,
  initProfile,
  loadProfile,
  resolveProfileDir,
} from '@deepseek-ai/dsh-app-boot';
import type { EntryOptions } from '@deepseek-ai/cordis-plugin-loader';
import type { PatchOptions } from '@deepseek-ai/cordis-plugin-include';

import { DEFAULT_DSH_PROFILE } from './state';

const BIN_NAME = 'zhima-dsh';

/** zhima 内置插件容器包：聚合 packages/dsh-overlay 下所有内置插件。 */
const INNER_PLUGINS_PACKAGE = '@zhima/dsh-overlay';

/** 内置插件裸包 scope（与插件包名一致）。 */
const INNER_PLUGINS_SCOPE = '@dsh-overlay';

/** 内置插件在容器目录下的分组子目录（参考 DSH bundle 的 base/web 分层）。 */
const OVERLAY_GROUPS = ['base-overlay', 'web-overlay'] as const;

/** zhima-desktop profile 声明的 bundle 列表：官方 base/web-app + zhima 两个 overlay bundle。 */
const ZHIMA_DESKTOP_BUNDLES = [
  '@deepseek-ai/dsh-base',
  '@deepseek-ai/dsh-web-app',
  '@zhima/dsh-base-overlay',
  '@zhima/dsh-web-overlay',
];

/** 确保默认 profile 的 manifest 声明 zhima 的 4 bundles（bundle 机制由 profile manifest 驱动）。 */
function ensureZhimaBundlesDeclared(profileDir: string): void {
  const manifestPath = join(profileDir, 'package.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const current = manifest.dsh?.profile?.bundles;
  if (
    Array.isArray(current) &&
    current.join('|') === ZHIMA_DESKTOP_BUNDLES.join('|')
  ) {
    return;
  }
  manifest.dsh = {
    ...(manifest.dsh ?? {}),
    profile: {
      ...(manifest.dsh?.profile ?? {}),
      bundles: ZHIMA_DESKTOP_BUNDLES,
    },
  };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
}

/**
 * 把 zhima 的两个 overlay bundle（base-overlay/web-overlay）link 进
 * profiles/node_modules/@zhima/，使 dsh-app-boot 的 resolveBundleDir（从 profile
 * 目录或 install 树解析 bundle）能按裸包名找到它们。
 */
export function linkOverlayBundles(homeDir: string): void {
  const linkRoot = join(join(homeDir, 'profiles'), 'node_modules', '@zhima');
  for (const group of OVERLAY_GROUPS) {
    const bundleDir = join(innerPluginsRoot(), group);
    if (!existsSync(join(bundleDir, 'package.json'))) continue;
    const bundlePkg = JSON.parse(
      readFileSync(join(bundleDir, 'package.json'), 'utf8'),
    ) as { name?: string };
    if (bundlePkg.name === undefined || !bundlePkg.name.startsWith('@zhima/')) {
      continue;
    }
    const linkPath = join(linkRoot, bundlePkg.name.slice('@zhima/'.length));
    if (existsSync(linkPath)) continue;
    mkdirSync(linkRoot, { recursive: true });
    symlinkSync(
      bundleDir,
      linkPath,
      process.platform === 'win32' ? 'junction' : 'dir',
    );
  }
}

/** dev 下定位内置插件目录：先在 base/web 两组子目录里找，退回容器根平铺。 */
function locateOverlayPluginDir(
  containerDir: string,
  shortName: string,
): string {
  for (const group of OVERLAY_GROUPS) {
    const candidate = join(containerDir, group, shortName);
    if (existsSync(join(candidate, 'package.json'))) return candidate;
  }
  return join(containerDir, shortName);
}

/** dev 下定位 overlay bundle 目录（base/web 分组本身，name 匹配）。 */
function locateOverlayBundleDir(
  containerDir: string,
  packageName: string,
): string | undefined {
  for (const group of OVERLAY_GROUPS) {
    const candidate = join(containerDir, group);
    if (!existsSync(join(candidate, 'package.json'))) continue;
    try {
      const name = (
        JSON.parse(readFileSync(join(candidate, 'package.json'), 'utf8')) as {
          name?: string;
        }
      ).name;
      if (name === packageName) return candidate;
    } catch {
      // manifest 缺失忽略
    }
  }
  return undefined;
}

/** 内置插件容器根目录（package.json 与 cordis.patch.yml 同目录）。 */
function innerPluginsRoot(): string {
  const require = createRequire(__filename);
  return dirname(require.resolve(`${INNER_PLUGINS_PACKAGE}/package.json`));
}

/**
 * 把容器声明的所有 @dsh-overlay/* 内置插件 link 进
 * $DSH_HOME/profiles/node_modules/@dsh-overlay/，使 ClientModuleRegistry
 * （以 profile 目录为 createRequire 基准）与 ESM overlay 都能按裸包名解析。
 * healProfilesModuleFallback 只覆盖 @deepseek-ai/dsh 依赖闭包，不含内置插件，
 * 新增插件只需加入容器 dependencies + cordis.patch.yml，
 * 无需改此处代码。
 */
export function linkInnerPlugins(homeDir: string): void {
  const containerDir = innerPluginsRoot();
  const containerPkg = JSON.parse(
    readFileSync(join(containerDir, 'package.json'), 'utf8'),
  ) as { dependencies?: Record<string, string> };
  const linkRoot = join(
    join(homeDir, 'profiles'),
    'node_modules',
    INNER_PLUGINS_SCOPE,
  );
  // 子插件定位：dev 下 pnpm 不把容器依赖提升到顶层，子插件聚合在容器目录
  // 的 base/web 分组下（packages/dsh-overlay/{base,web}-overlay/<name>）；
  // prod 下 forge 把每个子插件单独 copy 到 node_modules/@dsh-overlay/<name> + asar.unpacked，
  // 须经 createRequire 在 app 依赖树寻址（asar 自动转发 unpacked）。
  const resolveFromMain = createRequire(__filename);
  // 收集需 link 的内置插件：容器直接依赖的 @dsh-overlay/*，以及各 overlay bundle
  // （@zhima/dsh-*-overlay）依赖的 @dsh-overlay/*（插件聚合在 bundle 下）。
  const pluginSpecifiers = new Set<string>();
  for (const specifier of Object.keys(containerPkg.dependencies ?? {})) {
    if (specifier.startsWith(`${INNER_PLUGINS_SCOPE}/`)) {
      pluginSpecifiers.add(specifier);
      continue;
    }
    if (!specifier.startsWith('@zhima/')) continue;
    const bundleDir = !isDev
      ? dirname(resolveFromMain.resolve(`${specifier}/package.json`))
      : locateOverlayBundleDir(containerDir, specifier);
    if (bundleDir === undefined) continue;
    try {
      const bundlePkg = JSON.parse(
        readFileSync(join(bundleDir, 'package.json'), 'utf8'),
      ) as { dependencies?: Record<string, string> };
      for (const dep of Object.keys(bundlePkg.dependencies ?? {})) {
        if (dep.startsWith(`${INNER_PLUGINS_SCOPE}/`))
          pluginSpecifiers.add(dep);
      }
    } catch {
      // bundle manifest 缺失忽略
    }
  }
  for (const specifier of pluginSpecifiers) {
    const shortName = specifier.slice(INNER_PLUGINS_SCOPE.length + 1);
    const packageDir = !isDev
      ? dirname(resolveFromMain.resolve(`${specifier}/package.json`))
      : locateOverlayPluginDir(containerDir, shortName);
    if (!existsSync(join(packageDir, 'package.json'))) continue;
    const linkPath = join(linkRoot, shortName);
    if (existsSync(linkPath)) continue;
    mkdirSync(linkRoot, { recursive: true });
    symlinkSync(
      packageDir,
      linkPath,
      process.platform === 'win32' ? 'junction' : 'dir',
    );
  }
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
    initProfile(profileDir, ZHIMA_DESKTOP_BUNDLES);
  }
  // 已存在时也确保 manifest 声明 zhima 的 4 bundles（bundle 机制由 manifest 驱动）。
  ensureZhimaBundlesDeclared(profileDir);
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
  profileName: string = DEFAULT_DSH_PROFILE,
): PreparedDshProfile {
  const require = createRequire(__filename);
  const installAnchor = require.resolve('@deepseek-ai/dsh/package.json');
  const profileDir = resolveProfileDir(profileName, homeDir);
  mkdirSync(profileDir, { recursive: true });

  if (!existsSync(join(profileDir, 'package.json'))) {
    initProfile(profileDir, ZHIMA_DESKTOP_BUNDLES);
  } else if (profileName === DEFAULT_DSH_PROFILE) {
    // 默认 profile 已存在时也确保 manifest 声明 zhima 的 4 bundles；
    // 自定义 profile 保持用户自己的配置，不强加 zhima bundles。
    ensureZhimaBundlesDeclared(profileDir);
  }
  // 维护 $home/profiles/node_modules 扁平回退，让 in-box 插件从任意 profile 可解析。
  healProfilesModuleFallback(installAnchor, homeDir);
  // 把内置插件容器声明的所有 @dsh-overlay/* link 进同一回退，供 client/host 加载。
  linkInnerPlugins(homeDir);
  // 把 zhima 的两个 overlay bundle 也 link 进去，供 resolveBundleDir 按裸包名解析。
  linkOverlayBundles(homeDir);

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

  // zhima 定制由 profile manifest 的 4 bundles（官方 dsh-base/dsh-web-app + zhima
  // base-overlay/web-overlay）自动提供：loadProfile 已把各 bundle 的 patch 读入
  // basePatches，无需在此手动注入（原 loadBuiltinPluginPatches 已由 bundle 机制取代）。

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

  return {
    homeDir,
    installAnchor,
    rootConfig,
    bareModuleBaseUrl: pathToFileURL(join(profileDir, 'package.json')).href,
    patches,
  };
}
