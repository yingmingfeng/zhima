import { readFileSync } from 'node:fs';

import pkg from '../package.json';

/**
 * 主进程构建需 externalize 的包：
 * - apps/ui-tars 的直接依赖
 * - packages/dsh 容器声明的 dsh 运行时包（纯 ESM + 原生模块，必须保持 require(esm) 直连，
 *   不能打进 CJS bundle；运行时从根 node_modules 解析）
 */
export const getExternalPkgs = () => {
  const { platform } = process;

  let dshDeps: string[] = [];
  try {
    const dshPkg = JSON.parse(
      readFileSync(
        new URL('../../packages/dsh/package.json', import.meta.url),
        'utf8',
      ),
    ) as { dependencies?: Record<string, string> };
    dshDeps = Object.keys(dshPkg.dependencies ?? {});
  } catch {
    // packages/dsh 尚未就绪时降级为空，避免构建失败
  }

  return [
    ...Object.keys(pkg.dependencies),
    ...dshDeps,
    ...(platform === 'darwin'
      ? ['@computer-use/libnut-darwin']
      : platform === 'win32'
        ? ['@computer-use/libnut-win32']
        : platform === 'linux'
          ? ['@computer-use/libnut-linux']
          : []),
  ];
};
