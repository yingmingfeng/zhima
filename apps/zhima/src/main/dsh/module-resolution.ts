/**
 * Copyright (c) 2026 yingmingfeng
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Electron 宿主内把 DSH 插件裸包名解析锚定到 profile 目录。
 *
 * Electron 主进程不可用 node-addon-require-builtin（缺 V8 embedder 符号），
 * cordis-plugin-loader 的 include 退化为 `import('@dsh-external/...')`，
 * 从 zhima bundle 向上找 node_modules 而找不到 out-of-tree 插件。
 * 解法：registerHooks（ESM）+ Module._resolveFilename（CJS）双路桥接，
 * 强制以 profile 为基准解析，完全绕开 addon。
 *
 * 参考：社区版 deepseek-harness-desktop 的 `src/module-resolution.ts`
 */
import Module from 'node:module';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  PackageOverlayNotFoundError,
  findOverlayPackage,
  packageNameFromSpecifier,
  resolveOverlayPackage,
  type PackageOverlaySelection,
} from './package-overlay';

// @types/node 20 未导出 registerHooks（Node 22.15+ 才有），运行时 Node 24 可用。
type RegisterHooksFn = (options: {
  resolve?: (
    specifier: string,
    context: { parentURL?: string },
    nextResolve: (
      specifier: string,
      context?: { parentURL?: string },
    ) => { url: string },
  ) => { url: string };
}) => { deregister(): void };
const registerHooksFn = (
  Module as typeof Module & { registerHooks?: RegisterHooksFn }
).registerHooks;

// 以当前模块（zhima bundle）为基准解析真实路径。即使 DSH 包被 rollup 内联进 bundle，
// require.resolve 仍是运行时解析，指向 node_modules 里的真实文件。
const requireFromBundle = createRequire(__filename);
const LOADER_ENTRY_URL = pathToFileURL(
  requireFromBundle.resolve('@deepseek-ai/cordis-plugin-loader'),
).href;
// 安装树锚点用 bundle 自身（apps/zhima/dist/main/main.js）而非某个 DSH 包：
// findPackageJSON 从它向上爬，既能命中 apps/zhima/node_modules（@dsh-overlay/*、@zhima/*
// 等宿主包含包都 link 在那里），也能命中根 node_modules（@deepseek-ai/* 全部 hoisted
// 在那）。若锚到 @deepseek-ai/dsh/package.json（根树），爬不上 apps/zhima/node_modules，
// 导致 @dsh-overlay/windows-pwsh-sandbox 这类宿主插件解析失败（ERR_MODULE_NOT_FOUND）。
const INSTALL_PACKAGE_URL = pathToFileURL(__filename).href;

// loader 内联进 bundle 时，它的运行时 `import(name)` 的 parentURL 就是 bundle 自身
// （错误信息里的 "imported from ...dist/main/main.js"），而非真实 loader 文件。
const BUNDLE_ENTRY_URL = pathToFileURL(__filename).href;

/** 是否为 loader 运行裸包名 import 的来源模块（真实 loader 或内联它的 bundle）。 */
function isLoaderOrigin(parentURL: string | undefined): boolean {
  if (parentURL === undefined) return false;
  if (parentURL === LOADER_ENTRY_URL || parentURL === BUNDLE_ENTRY_URL)
    return true;
  // Windows 驱动器号大小写保险：pathToFileURL 与 ESM loader 可能保留不同大小写。
  return (
    parentURL.toLowerCase() === LOADER_ENTRY_URL.toLowerCase() ||
    parentURL.toLowerCase() === BUNDLE_ENTRY_URL.toLowerCase()
  );
}

interface CommonJsModuleResolver {
  _resolveFilename(
    request: string,
    parent: { filename?: string } | null | undefined,
    isMain: boolean | undefined,
    options?: unknown,
  ): string;
}

function packageNameFromManifestSpecifier(
  specifier: string,
): string | undefined {
  const suffix = '/package.json';
  if (!specifier.endsWith(suffix)) return undefined;
  const packageName = specifier.slice(0, -suffix.length);
  return packageNameFromSpecifier(packageName) === packageName
    ? packageName
    : undefined;
}

/** loader 的请求是否需要 Node 包解析。 */
function isBareSpecifier(specifier: string): boolean {
  return (
    !specifier.startsWith('.') &&
    !specifier.startsWith('/') &&
    !URL.canParse(specifier)
  );
}

/**
 * 把 cordis-plugin-loader 的裸包名解析锚定到指定 profile。
 * @param profileBaseUrl - profile 内负责插件依赖的 package.json file URL。
 * @returns 幂等的清理函数。
 */
export function installProfilePackageResolver(
  profileBaseUrl: string,
): () => void {
  if (typeof registerHooksFn !== 'function') {
    throw new Error('[dsh] registerHooks unavailable: Node version too old');
  }
  const profileManifestPath = fileURLToPath(profileBaseUrl);
  const profileDirPath = dirname(profileManifestPath);

  /** parent 是否落在 profile 目录内（含 manifest 自身），大小写/分隔符归一。 */
  const isUnderProfileDir = (parentFilename: string | undefined): boolean => {
    if (parentFilename === undefined) return false;
    const norm = (p: string) => p.replace(/\\/g, '/').toLowerCase();
    const parentNorm = norm(parentFilename);
    const dirNorm = norm(profileDirPath);
    const manifestNorm = norm(profileManifestPath);
    return (
      parentNorm === manifestNorm ||
      parentNorm === dirNorm ||
      parentNorm.startsWith(dirNorm + '/')
    );
  };

  // CJS 侧：ClientModuleRegistry 用 createRequire(ctx.baseUrl) 解析 browser bundle
  // 的 manifest，ESM hook 观察不到该 CJS 查找。DSH 的 client-modules 等插件用
  // createRequire(profile 目录) 再 resolve('<pkg>/package.json')（parent 是目录，
  // 目录 URL 会合成 <dir>/noop.js 作父模块），原先只拦"parent === profile manifest"
  // 的精确请求会漏掉它。故放宽为：parent 落在 profile 目录内且请求是包 manifest 时，
  // 走 overlay 重定向（in-box 包→asar 安装树、out-of-tree 包→profile 真实路径），
  // 跳过指向 app.asar 的坏符号链接；overlay 找不到时回退默认解析。
  const commonJsModule = Module as unknown as CommonJsModuleResolver;
  const previousResolveFilename = commonJsModule._resolveFilename;
  const overlayResolveFilename: CommonJsModuleResolver['_resolveFilename'] =
    function (this: CommonJsModuleResolver, request, parent, isMain, options) {
      const packageName = isUnderProfileDir(parent?.filename)
        ? packageNameFromManifestSpecifier(request)
        : undefined;
      if (packageName !== undefined) {
        const overlay = findOverlayPackage(packageName, {
          installPackageUrl: INSTALL_PACKAGE_URL,
          profilePackageUrl: profileBaseUrl,
        });
        if (overlay !== undefined) return overlay.selected.manifestPath;
      }
      return previousResolveFilename.call(
        this,
        request,
        parent,
        isMain,
        options,
      );
    };
  commonJsModule._resolveFilename = overlayResolveFilename;

  // ESM 侧：拦截 loader 入口对裸包名的 import，并按 overlay 重定向解析基准；
  // 同时追踪 overlay 选出的包模块图，图内裸包名解析失败时回退到 profile 重试。
  const overlayModuleUrls = new Set<string>();
  const hooks = registerHooksFn({
    resolve(specifier, context, nextResolve) {
      const packageName = isLoaderOrigin(context.parentURL)
        ? packageNameFromSpecifier(specifier)
        : undefined;
      if (packageName !== undefined) {
        let overlay: PackageOverlaySelection;
        try {
          overlay = resolveOverlayPackage(packageName, {
            installPackageUrl: INSTALL_PACKAGE_URL,
            profilePackageUrl: profileBaseUrl,
          });
        } catch (cause) {
          // 两侧都没有的裸包（如 bundle 里与插件无关的动态 import）交给默认解析，
          // 避免误伤正常加载。
          if (cause instanceof PackageOverlayNotFoundError) {
            return nextResolve(specifier, context);
          }
          throw cause;
        }
        const resolved =
          overlay.selected.source === 'profile'
            ? nextResolve(specifier, { ...context, parentURL: profileBaseUrl })
            : // install 源：从安装树锚点解析，而非 loader 所在位置（loader 的
              // node_modules 里没有 @dsh-overlay/* 等宿主包，需从 app 依赖树解析）。
              nextResolve(specifier, {
                ...context,
                parentURL: INSTALL_PACKAGE_URL,
              });
        overlayModuleUrls.add(resolved.url);
        return resolved;
      }
      if (
        context.parentURL === undefined ||
        !overlayModuleUrls.has(context.parentURL)
      ) {
        return nextResolve(specifier, context);
      }
      if (!isBareSpecifier(specifier)) {
        const resolved = nextResolve(specifier, context);
        if (specifier.startsWith('.')) overlayModuleUrls.add(resolved.url);
        return resolved;
      }
      try {
        const resolved = nextResolve(specifier, context);
        overlayModuleUrls.add(resolved.url);
        return resolved;
      } catch (cause) {
        if ((cause as NodeJS.ErrnoException).code !== 'ERR_MODULE_NOT_FOUND')
          throw cause;
        const resolved = nextResolve(specifier, {
          ...context,
          parentURL: profileBaseUrl,
        });
        overlayModuleUrls.add(resolved.url);
        return resolved;
      }
    },
  });
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    hooks.deregister();
    if (commonJsModule._resolveFilename === overlayResolveFilename) {
      commonJsModule._resolveFilename = previousResolveFilename;
    }
  };
}
