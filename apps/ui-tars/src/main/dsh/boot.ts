/**
 * DSH boot 单例：懒加载 dsh 的 Cordis 插件树，首次 boot 持有 ctx 后复用。
 *
 * 参考 dsh-plugin-desktop/src/main.ts 的 boot 主线裁剪：
 * 只保留 boot() 调用 + webServer loopback 强制；砍掉 profile 回滚/pnpm 运行时/通知。
 */
import { mkdirSync } from 'node:fs';

import { boot } from '@deepseek-ai/dsh-app-boot';
import { provideCmdline } from '@deepseek-ai/dsh-cmdline';
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths';
import type { Context } from '@deepseek-ai/cordis';

import { logger } from '@main/logger';

import { prepareDshProfile } from './profile';
import {
  getDshRunMode,
  getExternalDshPort,
  getSelectedDshProfile,
} from './state';
import { installProfilePackageResolver } from './module-resolution';

const BIN_NAME = 'zhima-dsh';

/**
 * dsh home 落点：dsh 官方默认（~/.dsh，可通过 DSH_HOME 覆盖）。
 * 直接继承既有凭据/设置/会话，与独立运行的 dsh 共享一份用户数据。
 */
export const DSH_HOME = resolveDshHome();

/** 一次成功 boot 后的句柄。 */
export interface DshBootResult {
  /** 已启动的 Cordis 根上下文（external 模式下为 undefined）。 */
  ctx?: Context;
  /** webServer 实际监听的 loopback 端口。 */
  port: number;
  /** 内置模式下实际 boot 的 profile；external 模式为空串。 */
  profileName: string;
}

let bootTask: Promise<DshBootResult> | undefined;

/** 当前 boot/已 boot 状态；undefined 表示尚未发起过 boot。 */
export function isDshBooted(): boolean {
  return bootTask !== undefined;
}

/** 真实的内置 Cordis 树 ctx（external 模式无 ctx，不视为需停止的内置 boot）。 */
let activeCtx: Context | undefined;

/** 是否确有内置 Cordis 树在跑（用于判断切外部前是否需停止内置 boot）。 */
export function getActiveDshCtx(): Context | undefined {
  return activeCtx;
}

/** 请求 Web UI 退出时关闭 DSH 窗口（不退出 zhima）。由 index.ts 注入。 */
let onDshExitRequest: (() => void) | undefined;
export function setDshExitHandler(handler: () => void): void {
  onDshExitRequest = handler;
}

/**
 * 懒加载 boot dsh 插件树（单例）。
 * 首次调用执行 Cordis 插件树 boot，之后复用同一个 ctx。
 * 供 openDshWindow（点击按钮）与 disposeDsh（退出清理）共用。
 */
export function bootDsh(): Promise<DshBootResult> {
  if (bootTask === undefined) {
    bootTask = doBoot();
  }
  return bootTask;
}

async function doBoot(): Promise<DshBootResult> {
  // external 模式：连接外部手动启动的 dsh 实例，跳过内部 boot
  if (getDshRunMode() === 'external') {
    const port = getExternalDshPort();
    logger.info(
      '[dsh] external mode: 连接外部实例 http://127.0.0.1:' +
        String(port) +
        '/',
    );
    return { port, profileName: '' };
  }

  mkdirSync(DSH_HOME, { recursive: true });
  const profileName = getSelectedDshProfile();
  const prepared = prepareDshProfile(DSH_HOME, process.platform, profileName);

  // 以 profile 目录为基准解析 out-of-tree 插件（如皮肤 @dsh-external/...）。
  // Electron 主进程不可用 node-addon-require-builtin，靠 Node 解析 Hook 桥接。
  const releasePackageResolver = installProfilePackageResolver(
    prepared.bareModuleBaseUrl,
  );

  logger.info('[dsh] booting profile:', prepared.rootConfig);

  let ctx: Context;
  try {
    ctx = await boot(
      BIN_NAME,
      prepared.rootConfig,
      prepared.patches,
      async (hostCtx) => {
        // 解析桥随插件树生命周期存活：插件/皮肤运行期仍可能懒加载或 HMR。
        hostCtx.effect(
          () => releasePackageResolver,
          'zhima-dsh: profile package resolution',
        );
        // 强制 loopback 绑定：--host 127.0.0.1 --port 0（随机端口）。
        provideCmdline(hostCtx, {
          args: ['--host', '127.0.0.1', '--port', '0', '--no-open'],
          exit: () => onDshExitRequest?.(),
        });
      },
      prepared.bareModuleBaseUrl,
    );
  } catch (cause) {
    releasePackageResolver();
    throw cause;
  }

  const port = (ctx as Context & { webServer?: { port?: number } }).webServer
    ?.port;
  if (typeof port !== 'number') {
    throw new Error('[dsh] boot 后未发现 webServer.port，web UI 无法定位');
  }

  activeCtx = ctx;
  logger.info('[dsh] booted, web server on 127.0.0.1:', port);
  return { ctx, port, profileName };
}

/** 终止 dsh 的 Cordis 插件树（幂等），供退出 zhima 时调用。 */
export async function disposeDsh(): Promise<void> {
  const task = bootTask;
  bootTask = undefined;
  activeCtx = undefined;
  if (task === undefined) return;
  try {
    const { ctx } = await task;
    if (ctx) await ctx.fiber.dispose();
  } catch (cause) {
    logger.error('[dsh] dispose failed:', cause);
  }
  logger.info('[dsh] disposed');
}
