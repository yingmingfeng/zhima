/**
 * DSH CLI 启动器：spawn 内置 node + dsh CLI 独立进程，替代主进程 in-process boot。
 *
 * 目标：把 DSH 后端的 boot 成本移出主进程（避免阻塞主进程事件循环/其他渲染进程），
 * 且 dsh CLI 天然是独立进程，为后续「守护进程常驻（quit 后免 boot 秒开）」铺路。
 * 参考 dsh-plugin-desktop 的 dsh shim 思路，但直接用 zhima 内置真实 node.exe
 * （resources/bin/node.exe），不依赖 ELECTRON_RUN_AS_NODE。
 *
 * ⚠️ 已暂缓（2026-08-28）：生产下 CLI 是**外部 node.exe 进程，读不了 asar**，
 * 其运行时依赖闭包（@deepseek-ai/dsh 全家 + 第三方，约 425 包 / 4.9 万文件）必须是
 * 物理文件。打包期整包 unpack 会回退「问题四」的安装速度优化（unpacked 回到 4.9 万、
 * 安装 30s+）。当前内置模式改走 in-process boot（bootDsh）。恢复本模式的两条路：
 *   ① CLI 运行时物理化：forge 构建期把闭包从 asar 提取到 %LOCALAPPDATA% 缓存 + junction
 *      （~150 行，磁盘 +300MB，首开等待）
 *   ② electron-as-node + 解析桥 hook：跑通 fuse 打开 + spawn 改造 + profile 基准解析
 *      hook（需联调迭代，README 见个人文档「生产构建问题记录/03」）
 * 本文件保留未删，供后续恢复。
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import { app } from 'electron';

import { logger } from '@main/logger';

import { linkInnerPlugins, linkOverlayBundles } from './profile';

const BOOT_TIMEOUT_MS = 60000;

/** 内置真实 node.exe（dev: apps/zhima/resources/bin；prod: resourcesPath/bin）。 */
function bundledNodePath(): string {
  if (app.isPackaged) return join(process.resourcesPath, 'bin', 'node.exe');
  return join(app.getAppPath(), 'resources', 'bin', 'node.exe');
}

/** dsh CLI 入口（@deepseek-ai/dsh 的 bin.dsh 指向 lib/bin.js）。 */
function dshCliEntryPath(): string {
  const require = createRequire(__filename);
  return require.resolve('@deepseek-ai/dsh/lib/bin.js');
}

export interface DshCliLaunch {
  /** webServer 实际监听的 loopback 端口。 */
  port: number;
  /** web UI loopback URL。 */
  url: string;
  /** dsh CLI 子进程（dispose/重启时由调用方管理）。 */
  child: ChildProcess;
}

/**
 * spawn dsh CLI 独立进程，boot 指定 profile。
 * zhima 定制由 profile manifest 声明的 4 bundles（官方 base/web-app + base-overlay/web-overlay）
 * 自动提供——CLI 的 loadProfile 会读 manifest bundles 并逐层取 patch，无需 --patch。
 * 通过解析 CLI stdout 的 `dsh web: http://127.0.0.1:<port>` 发现端口。
 * @param homeDir - ~/.dsh（注入 DSH_HOME，与内置 boot 共享一份用户数据）。
 * @param profileName - 要 boot 的 profile（如 zhima-desktop）。
 */
export function spawnDshCli(
  homeDir: string,
  profileName: string,
): Promise<DshCliLaunch> {
  // 内置插件与 overlay bundle 的 bare import 在 CLI 进程内以 profile 目录为解析基准，
  // 先确保 @dsh-overlay/* 与 @zhima/dsh-*-overlay 已 link 进 profiles/node_modules。
  linkInnerPlugins(homeDir);
  linkOverlayBundles(homeDir);
  const nodePath = bundledNodePath();
  const cliEntry = dshCliEntryPath();
  // dsh launcher 参数（--profile）在前；--host 等非 launcher flag 作为
  // inner args 传给 booted 树（web app）。不能写 `web` 命令——web 命令不吃 --profile。
  const args = [
    '--profile',
    profileName,
    '--host',
    '127.0.0.1',
    '--port',
    '0',
    '--no-open',
  ];
  logger.info('[dsh] spawn CLI:', cliEntry);

  const child = spawn(nodePath, [cliEntry, ...args], {
    env: {
      ...process.env,
      DSH_HOME: homeDir,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  return new Promise<DshCliLaunch>((resolveLaunch, reject) => {
    let stdoutBuf = '';
    let stderrBuf = '';
    let settled = false;
    const PORT_RE = /http:\/\/127\.0\.0\.1:(\d+)/;
    const fail = (message: string, cause?: unknown): void => {
      if (settled) return;
      settled = true;
      logger.error('[dsh] CLI 启动失败:', message);
      if (stderrBuf) logger.error('[dsh] CLI stderr:', stderrBuf.slice(-2000));
      reject(
        cause === undefined
          ? new Error(message)
          : new Error(message, { cause }),
      );
      try {
        child.kill();
      } catch {
        // 进程已退出，忽略
      }
    };
    const timer = setTimeout(
      () =>
        fail(
          `[dsh] CLI 启动超时（${BOOT_TIMEOUT_MS}ms）未发现端口，stderr: ${stderrBuf.slice(-800)}`,
        ),
      BOOT_TIMEOUT_MS,
    );
    child.stdout?.on('data', (data: Buffer) => {
      stdoutBuf += data.toString('utf8');
      const match = PORT_RE.exec(stdoutBuf);
      if (match !== null && !settled) {
        settled = true;
        clearTimeout(timer);
        const port = Number(match[1]);
        logger.info('[dsh] CLI booted, web server on 127.0.0.1:', port);
        resolveLaunch({
          port,
          url: `http://127.0.0.1:${port}/`,
          child,
        });
      }
    });
    child.stderr?.on('data', (data: Buffer) => {
      stderrBuf += data.toString('utf8');
    });
    child.on('error', (error) =>
      fail(`[dsh] CLI spawn 失败: ${error.message}`, error),
    );
    child.on('exit', (code, signal) => {
      if (!settled) {
        fail(
          `[dsh] CLI 进程提前退出 code=${String(code)} signal=${String(signal)}`,
        );
      }
    });
  });
}