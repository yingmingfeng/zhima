/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import fs, { readdirSync } from 'node:fs';
import { cp, readdir } from 'node:fs/promises';
import path, { resolve } from 'node:path';

import { MakerDMG } from '@electron-forge/maker-dmg';
import { MakerZIP } from '@electron-forge/maker-zip';
import { build as nsisBuild } from 'app-builder-lib';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import type { ForgeConfig } from '@electron-forge/shared-types';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import setLanguages from 'electron-packager-languages';
import { rimraf, rimrafSync } from 'rimraf';

import pkg from './package.json';
import { getExternalPkgs } from './scripts/getExternalPkgs';
import {
  getModuleRoot,
  getExternalPkgsDependencies,
  hooks,
} from '@common/electron-build';

const keepModules = new Set([
  ...getExternalPkgs(),
  '@computer-use/mac-screen-capture-permissions',
]);

// 读取 packages/dsh-overlay/ 下所有内置插件的包名，打包时一并保留。
// 插件分两层：base-overlay（后端）/ web-overlay（UI），逐个扫描两组子目录。
// 这些是 workspace 包，pnpm link 不会在打包后保留，必须显式加入白名单。
const dshPluginsDir = resolve(__dirname, '../../packages/dsh-overlay');
const OVERLAY_GROUPS = ['base-overlay', 'web-overlay'];
const builtinPluginNames: string[] = [];
function collectBuiltinPlugins(groupDir: string): void {
  let entries: ReturnType<typeof readdirSync>;
  try {
    entries = readdirSync(groupDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    // dsh-better-sidebar 暂未启用且其独立 pnpm-workspace 未链接到根 node_modules，
    // getModuleRoot 找不到它会报 copy 错误；等真正启用并链接后再移除该排除。
    if (entry.name === 'DSH-better-sidebar') continue;
    const pkgPath = resolve(groupDir, entry.name, 'package.json');
    try {
      const pluginPkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      if (pluginPkg.name) {
        keepModules.add(pluginPkg.name);
        builtinPluginNames.push(pluginPkg.name);
      }
    } catch {}
  }
}
for (const group of OVERLAY_GROUPS) {
  collectBuiltinPlugins(resolve(dshPluginsDir, group));
}
// @zhima/dsh 是 DSH 容器：仅 build 期靠 packages/dsh/vendor/*.tgz 让 pnpm 解压出
// @deepseek-ai/* 到根 node_modules。它 main/exports 为空、运行时不执行任何代码，
// 且无任何运行时代码引用它，故从打包产物剔除（源码 packages/dsh 仍保留供 build 期使用）。
keepModules.delete('@zhima/dsh');

/**
 * 内置插件（packages/dsh-overlay/ 下的 workspace 包）打包后保留运行时最小集，
 * 剔除源码/构建文件，避免体积冗余和源码暴露。
 */
function pruneBuiltinPlugin(dir: string): void {
  const rm = (p: string) => {
    if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
  };
  for (const sub of [
    'src',
    'build',
    'test',
    'tests',
    'scripts',
    'docs',
    '.vscode',
  ]) {
    rm(path.join(dir, sub));
  }
  for (const file of fs.readdirSync(dir)) {
    // 构建/配置/说明文件
    if (
      /^(tsconfig.*\.json|.*\.config\.(ts|js|mjs|cjs)|vite\.config|dsh\.plugin\.json|\.gitignore|\.npmignore)$/.test(
        file,
      )
    ) {
      rm(path.join(dir, file));
      continue;
    }
    // README 等 Markdown，保留 LICENSE*（许可证文件保留，可能无扩展名或带 .md/.txt）
    if (/\.md$/i.test(file) && !/^license/i.test(file)) {
      rm(path.join(dir, file));
    }
  }
  // 清理泄漏的 devDeps（纯类型 / 构建时依赖），保留运行时依赖
  const nm = path.join(dir, 'node_modules');
  if (fs.existsSync(nm)) {
    rm(path.join(nm, '@types'));
  }
}

// koffi / node-addon-require-builtin 的本地绑定走 optionalDependencies，而 keepModules
// 闭包只遍历 dependencies，导致绑定包（@koromix/koffi-win32-x64 等）从未打进产物——
// 运行时 koffi require 会因找不到绑定而报错。加入 needSubDependencies 用 flora-colossus
// （会遍历 optionalDependencies 且只取当前平台已安装的绑定）补拷，与 sharp 原生绑定同机制。
const needSubDependencies = [
  '@computer-use/node-mac-permissions',
  'sharp',
  'koffi',
  'node-addon-require-builtin',
];

/**
 * 一次性收集生产依赖闭包（BFS，visited 去重）。
 * 比 getExternalPkgsDependencies（对每个种子包逐个 Walker 遍历完整依赖树，
 * 共享依赖重复遍历，110 个包时极慢）快很多：每个包只读一次 package.json。
 * 仅遍历 dependencies（生产依赖），不含 dev/peer。
 */
async function collectProdDeps(
  seeds: string[],
  root: string,
): Promise<string[]> {
  const visited = new Set<string>();
  const queue = [...seeds];
  while (queue.length > 0) {
    const name = queue.shift()!;
    if (visited.has(name)) continue;
    visited.add(name);
    try {
      const moduleRoot = resolveInnerPluginRoot(root, name);
      if (!moduleRoot) continue;
      const pkg = JSON.parse(
        fs.readFileSync(path.join(moduleRoot, 'package.json'), 'utf8'),
      );
      for (const dep of Object.keys(pkg.dependencies ?? {})) {
        if (!visited.has(dep)) queue.push(dep);
      }
    } catch {
      // 单个包解析失败不影响整体闭包
    }
  }
  return [...visited];
}
/**
 * 定位包源目录：@dsh-overlay/* 内置插件聚合在容器目录
 * （packages/dsh-overlay/<name>）且 pnpm 不提升到依赖树顶层，getModuleRoot
 * 找不到，走容器目录拼接；其余包仍走 getModuleRoot。
 */
function resolveInnerPluginRoot(projectRoot: string, item: string): string {
  if (item.startsWith('@dsh-overlay/')) {
    const shortName = item.slice('@dsh-overlay/'.length);
    for (const group of OVERLAY_GROUPS) {
      const candidate = resolve(dshPluginsDir, group, shortName);
      if (fs.existsSync(path.join(candidate, 'package.json'))) return candidate;
    }
    return resolve(dshPluginsDir, shortName);
  }
  if (item.startsWith('@zhima/')) {
    // overlay bundle（@zhima/dsh-base-overlay 等）：遍历分组目录按包名匹配
    for (const group of OVERLAY_GROUPS) {
      const candidate = resolve(dshPluginsDir, group);
      const pkgPath = path.join(candidate, 'package.json');
      if (!fs.existsSync(pkgPath)) continue;
      const name = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')).name;
      if (name === item) return candidate;
    }
  }
  return getModuleRoot(projectRoot, item);
}
const ignorePattern = new RegExp(
  `^/node_modules/(?!${[...keepModules].join('|')})`,
);
// 方案 1：收窄 unpack 白名单到"真原生模块 + 内置插件"。
// 其余运行时依赖（@deepseek-ai/* 全纯 JS）放回 asar 单文件打包——安装慢的主因是
// unpacked 逐文件复制，收窄后 unpacked 从几百上千文件骤降，安装/卸载提速。
// 原生清单依据运行时闭包 + subDependencies 扫描得出；@koromix/koffi-* 与
// node-addon-require-builtin-* 走 optionalDependencies 当前未进闭包，预留以防随包分发
// （另有 AutoUnpackNativesPlugin 在打包期扫描 .node 兜底）。
// 内置插件放 unpacked：cordis 按包名 require/import 加载，且在运行时可能被补丁/热更，
// 放 asar（只读、路径带 app.asar 前缀）有加载失败风险，放 unpacked 保持普通文件寻址。
const unpackGlobs = [
  '@computer-use/libnut-*',
  '@computer-use/mac-screen-capture-permissions',
  '@computer-use/node-mac-permissions',
  // windows-acl 沙箱 runner 由内置真实 node.exe 执行（非 Electron），读不了 asar；
  // 整包 unpack 到 app.asar.unpacked，其 lib/runner.js 与依赖的 koffi 绑定才能被寻址。
  '@deepseek-ai/dsh-sandbox-windows-acl',
  '@img/sharp-*',
  'koffi',
  '@koromix/koffi-*',
  'node-pty',
  'node-addon-require-builtin',
  'node-addon-require-builtin-*',
  ...builtinPluginNames,
];
const unpack = `**/node_modules/{${unpackGlobs.join(',')}}/**/*`;

console.log('keepModules', Object.keys(pkg.dependencies));
console.log('needSubDependencies', needSubDependencies);
const keepLanguages = new Set(['en', 'en_GB', 'en-US', 'en_US']);
const noopAfterCopy = (
  _buildPath,
  _electronVersion,
  _platform,
  _arch,
  callback,
) => callback();

const enableOsxSign =
  process.env.APPLE_ID &&
  process.env.APPLE_PASSWORD &&
  process.env.APPLE_TEAM_ID;

// remove folders & files not to be included in the app
async function cleanSources(
  buildPath,
  _electronVersion,
  platform,
  _arch,
  callback,
) {
  // folders & files to be included in the app
  const appItems = new Set([
    'dist',
    'node_modules',
    'package.json',
    'resources',
  ]);

  if (platform === 'darwin' || platform === 'mas') {
    const frameworkResourcePath = resolve(
      buildPath,
      '../../Frameworks/Electron Framework.framework/Versions/A/Resources',
    );

    for (const file of readdirSync(frameworkResourcePath)) {
      if (file.endsWith('.lproj') && !keepLanguages.has(file.split('.')[0]!)) {
        rimrafSync(resolve(frameworkResourcePath, file));
      }
    }
  }

  const projectRoot = path.resolve(__dirname, '.');

  // 补全 keepModules 的生产依赖闭包：keepModules 只列了直接声明的依赖
  // （@deepseek-ai/*、内置插件等），但它们的间接依赖（如 @deepseek-ai/dsh-app-boot
  // 依赖 js-yaml）不在其中。用 BFS 一次性收集完整闭包（visited 去重，速度快），
  // 避免运行时 ERR_MODULE_NOT_FOUND。
  const transitiveDeps = await collectProdDeps([...keepModules], projectRoot);
  for (const dep of transitiveDeps) keepModules.add(dep);

  // Keep only node_modules to be included in the app
  await Promise.all([
    ...(await readdir(buildPath).then((items) =>
      items
        .filter((item) => !appItems.has(item))
        .map((item) => rimraf(path.join(buildPath, item))),
    )),
    ...(await readdir(path.join(buildPath, 'node_modules')).then((items) =>
      items
        .filter((item) => !keepModules.has(item))
        .map((item) => rimraf(path.join(buildPath, 'node_modules', item))),
    )),
  ]);

  await Promise.all(
    Array.from(keepModules.values()).map(async (item) => {
      // Check is exist
      if (fs.existsSync(path.join(buildPath, 'node_modules', item))) {
        // eslint-disable-next-line array-callback-return
        return;
      }

      try {
        const moduleRoot = resolveInnerPluginRoot(projectRoot, item);

        if (fs.existsSync(moduleRoot)) {
          const dest = path.join(buildPath, 'node_modules', item);
          // dereference 必须为 true：源目录的 node_modules 内含指向同级插件目录的
          // symlink，Windows 非 Admin/开发者模式下重建 symlink 会 EPERM，导致
          // cp 中途抛错中止、打包产物残缺；解引用成真实文件复制则无此问题
          await cp(moduleRoot, dest, { recursive: true, dereference: true });
          // 内置插件（packages/dsh-overlay/ 下的 workspace 包）会带源码/构建文件，
          // 只保留运行时产物（lib + package.json + cordis.patch.yml + LICENSE + 运行时依赖），
          // 剔除 src/build/tsconfig/README 等（体积冗余 + 暴露源码）。
          if (
            moduleRoot.includes(
              `${path.sep}packages${path.sep}dsh-overlay${path.sep}`,
            )
          ) {
            pruneBuiltinPlugin(dest);
          }
        }
      } catch (error) {
        console.error('copy_current_node_modules_error', error);
        return;
      }

      return;
    }),
  );

  const subDependencies = await getExternalPkgsDependencies(
    needSubDependencies,
    projectRoot,
  );
  await Promise.all(
    Array.from(subDependencies.values()).map((subDependency) => {
      if (
        fs.existsSync(path.join(buildPath, 'node_modules', subDependency.name))
      ) {
        return;
      }

      if (fs.existsSync(subDependency.path)) {
        return cp(subDependency.path, path.join(buildPath, 'node_modules', subDependency.name), {
          recursive: true,
          // 同上：源路径内可能含 symlink，Windows 下重建会 EPERM
          dereference: true,
        });
      }
      return;
    }),
  );

  callback();
}

console.log('ignorePattern', ignorePattern);

/**
 * Custom NSIS maker using app-builder-lib (electron-builder) directly.
 * Generates a Windows NSIS installer that supports custom install paths.
 */
class MakerNSIS {
  name = 'nsis';
  platforms = ['win32'];
  __isElectronForgeMaker = true;
  config: Record<string, any>;

  constructor(config?: Record<string, any>) {
    this.config = config || {};
  }

  isSupportedOnCurrentPlatform() {
    return process.platform === 'win32';
  }

  prepareConfig(_targetArch: string) {
    // no special preparation needed
  }

  ensureExternalBinariesExist() {
    // No external binaries required; app-builder-lib bundles its own NSIS compiler
  }

  clone() {
    return new MakerNSIS(this.config);
  }

  async make({
    dir,
    makeDir,
    targetArch,
  }: {
    dir: string;
    makeDir: string;
    targetArch: string;
  }) {
    const output = await nsisBuild({
      prepackaged: dir,
      config: {
        directories: { output: path.resolve(makeDir) },
        nsis: this.config,
      },
      win: [`nsis:${targetArch}`],
    });

    // NSIS CRC check can fail when the installer exe is modified after compilation.
    // Using the 'include' option adds !addincludedir which silently breaks NSIS
    // include resolution. Instead, patch the generated installer's firstheader
    // to set FH_FLAGS_NO_CRC, which disables the CRC integrity check at runtime.
    //
    // NSIS firstheader layout (fileform.h):
    //   offset 0:  flags      (4 bytes, uint32 LE)
    //   offset 4:  siginfo    (4 bytes, 0xDEADBEEF)
    //   offset 8:  nsinst[3]  (12 bytes, "NullsoftInst")
    //   offset 20: length_of_header
    //   offset 24: length_of_all_following_data
    //
    // FH_FLAGS_NO_CRC = 0x04 (bit 2) — disables CRC check
    // FH_FLAGS_FORCE_CRC = 0x08 (bit 3) — forces CRC even with /NCRC (DO NOT USE)
    for (const file of output) {
      if (file.endsWith('.exe')) {
        const buf = fs.readFileSync(file);
        const sig = Buffer.from('NullsoftInst');
        const sigOffset = buf.indexOf(sig);
        if (sigOffset > 0) {
          // "NullsoftInst" starts at offset 8 of firstheader, so flags = sigOffset - 8
          const flagsOffset = sigOffset - 8;
          const flags = buf.readUInt32LE(flagsOffset);
          buf.writeUInt32LE(flags | 0x04, flagsOffset);
          fs.writeFileSync(file, buf);
          console.log('Patched NSIS CRC: ' + path.basename(file));
        }
      }
    }

    return output;
  }
}

const config: ForgeConfig = {
  packagerConfig: {
    name: 'Zhima',
    icon: 'resources/icon',
    extraResource: [
      './resources/app-update.yml',
      // Windows pwsh 沙箱专用的内置 node.exe 只在 Windows 打包带（沙箱修复本身 Windows
      // 限定）；目录被 git 忽略、随本地文件存在，需按根 README「构建打包」预置。
      ...(process.platform === 'win32' ? ['./resources/bin'] : []),
    ],
    asar: {
      unpack,
    },
    ignore: [ignorePattern],
    prune: false,
    afterCopy: [
      cleanSources,
      process.platform !== 'win32'
        ? noopAfterCopy
        : setLanguages([...keepLanguages.values()]),
    ],
    executableName: 'zhima',
    ...(enableOsxSign
      ? {
          osxSign: {
            keychain: process.env.KEYCHAIN_PATH,
            optionsForFile: () => ({
              entitlements: 'build/entitlements.mac.plist',
            }),
          },
          osxNotarize: {
            appleId: process.env.APPLE_ID!,
            appleIdPassword: process.env.APPLE_PASSWORD!,
            teamId: process.env.APPLE_TEAM_ID!,
          },
        }
      : {}),
  },
  rebuildConfig: {},
  publishers: [
    {
      name: '@electron-forge/publisher-github',
      config: {
        repository: { owner: 'yingmingfeng', name: 'zhima' },
        draft: true,
        force: true,
        generateReleaseNotes: true,
      },
    },
  ],
  makers: [
    new MakerZIP({}, ['darwin']),
    // MakerSquirrel 已注释：改用 NSIS 作为唯一 Windows 安装器
    // new MakerSquirrel({
    //   // CamelCase version without spaces
    //   name: 'UiTars',
    //   setupIcon: 'resources/icon.ico',
    // }),
    new MakerNSIS({
      artifactName: `Zhima-Setup-${pkg.version}.exe`,
      oneClick: false,
      perMachine: false,
      allowToChangeInstallationDirectory: true,
      createDesktopShortcut: true,
      createStartMenuShortcut: true,
      shortcutName: '芝麻',
      uninstallDisplayName: '芝麻',
      installerIcon: 'resources/icon.ico',
      uninstallerIcon: 'resources/icon.ico',
    }),
    // https://github.com/electron/forge/issues/3712
    new MakerDMG({
      overwrite: true,
      background: 'static/dmg-background.png',
      // icon: 'static/dmg-icon.icns',
      iconSize: 160,
      format: 'UDZO',
      additionalDMGOptions: { window: { size: { width: 660, height: 400 } } },
      contents: (opts) => [
        { x: 180, y: 170, type: 'file', path: opts.appPath },
        { x: 480, y: 170, type: 'link', path: '/Applications' },
      ],
    }),
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    // https://github.com/microsoft/playwright/issues/28669#issuecomment-2268380066
    ...(process.env.CI === 'e2e'
      ? []
      : [
          new FusesPlugin({
            version: FuseVersion.V1,
            // DSH 沙箱 runner 已由 zhima 改用内置真实 node.exe（@dsh-overlay/windows-pwsh-sandbox
            // 插件 + profile.ts 提供者替换），不再依赖 ELECTRON_RUN_AS_NODE，
            // 故可保持 RunAsNode=false 的加固。
            [FuseV1Options.RunAsNode]: false,
            [FuseV1Options.EnableCookieEncryption]: true,
            [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
            [FuseV1Options.EnableNodeCliInspectArguments]: false,
            [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: false,
            [FuseV1Options.OnlyLoadAppFromAsar]: true,
          }),
        ]),
  ],
  hooks: {
    postMake: async (forgeConfig, makeResults) => {
      return await hooks.postMake?.(forgeConfig, makeResults);
    },
  },
};

export default config;
