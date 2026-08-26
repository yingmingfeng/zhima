/**
 * The following code is modified based on
 * https://github.com/timfish/forge-externals-plugin/blob/master/index.js
 *
 * MIT License
 * Copyright (c) 2021 Tim Fish
 * https://github.com/timfish/forge-externals-plugin/blob/master/LICENSE
 */
import Module from 'node:module';
import { Walker, DepType } from 'flora-colossus';
import { dirname } from 'path';
import { pathToFileURL } from 'node:url';
import { findUpSync } from './findUp';

// @types/node 20 未导出 findPackageJSON（Node 22.16+ 才有），运行时 Node 22.16+ 可用。
const findPackageJSONFn = (
  Module as typeof Module & {
    findPackageJSON(specifier: string, baseURL: string): string | undefined;
  }
).findPackageJSON;

export const getModuleRoot = (cwd: string, pkgName: string): string => {
  let moduleEntryPath;
  try {
    moduleEntryPath = dirname(
      require.resolve(`${pkgName}/package.json`, {
        paths: [cwd || process.cwd()],
      }),
    );
  } catch (error) {
    try {
      // 某些包（如 koffi/pnpm/cmdk）exports 未暴露 ./package.json，
      // fallback 用主入口解析是正常预期路径，成功时不打印误导性 warn。
      moduleEntryPath = dirname(
        require.resolve(pkgName, {
          paths: [cwd || process.cwd()],
        }),
      );
    } catch {
      // ESM-only 包（exports 只有 import 条件、无 require 条件、无 main，如
      // oniguruma-parser、@earendil-works/pi-ai）连主入口也解析不到。用
      // Module.findPackageJSON 直接从 node_modules 定位 package.json（不受
      // exports 限制），否则这些闭包包会被 cleanSources 跳过、打包缺包。
      const manifest = findPackageJSONFn(
        pkgName,
        pathToFileURL((cwd || process.cwd()) + '/').href,
      );
      if (manifest === undefined) {
        throw new Error(
          `getModuleRoot: cannot locate package.json for ${pkgName}`,
        );
      }
      moduleEntryPath = dirname(manifest);
    }
  }
  let pkgPath = findUpSync('package.json', {
    cwd: moduleEntryPath,
  });

  if (!pkgPath) {
    return '';
  }

  let currentDir = dirname(pkgPath);
  let isMatched = false;

  while (pkgPath && !isMatched) {
    try {
      const pkg = require(pkgPath);
      if (pkg.name === pkgName) {
        isMatched = true;
        break;
      }

      currentDir = dirname(currentDir);
      pkgPath = findUpSync('package.json', {
        cwd: currentDir,
      });
    } catch (err) {
      console.warn('Failed to read package.json:', err);
      break;
    }
  }

  if (!isMatched || !pkgPath) {
    return '';
  }

  const moduleRoot = dirname(pkgPath);
  return moduleRoot;
};

export async function getExternalPkgsDependencies(
  pkgNames: string[],
  cwd: string = process.cwd(),
): Promise<
  {
    name: string;
    path: string;
  }[]
> {
  const dependenciesMap = new Map<string, { name: string; path: string }>();
  pkgNames.forEach((name) => {
    dependenciesMap.set(name, { name, path: getModuleRoot(cwd, name) });
  });

  for (const pkgName of pkgNames) {
    try {
      const moduleRoot = getModuleRoot(cwd, pkgName);
      // console.log('moduleRoot', moduleRoot);

      const walker = new Walker(moduleRoot);
      // These are private so it's quite nasty!
      // @ts-ignore
      walker.modules = [];
      // @ts-ignore
      await walker.walkDependenciesForModule(moduleRoot, DepType.PROD);
      // @ts-ignore
      walker.modules
        .filter((dep: any) => dep.nativeModuleType === DepType.PROD)
        .forEach((dep: any) =>
          dependenciesMap.set(dep.name, {
            name: dep.name,
            path: dep.path,
          }),
        );

      // @ts-ignore
      // console.log('walker.modules', walker.modules);
    } catch (error) {
      console.warn('error', error);
    }
  }

  return Array.from(dependenciesMap.values());
}
