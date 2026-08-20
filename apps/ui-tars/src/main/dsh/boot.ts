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

const BIN_NAME = 'zhima-dsh';

/**
 * dsh home 落点：dsh 官方默认（~/.dsh，可通过 DSH_HOME 覆盖）。
 * 直接继承既有凭据/设置/会话，与独立运行的 dsh 共享一份用户数据。
 */
export const DSH_HOME = resolveDshHome();

/** 一次成功 boot 后的句柄。 */
export interface DshBootResult {
  /** 已启动的 Cordis 根上下文（dev 模式下为 undefined）。 */
  ctx?: Context;
  /** webServer 实际监听的 loopback 端口。 */
  port: number;
}

let bootTask: Promise<DshBootResult> | undefined;

/** 当前 boot/已 boot 状态；undefined 表示尚未发起过 boot。 */
export function isDshBooted(): boolean {
  return bootTask !== undefined;
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
  // DSH_WEB_DEV=true：连接外部 harness dev 实例，跳过内部 boot
  if (process.env.DSH_WEB_DEV === 'true') {
    const port = Number(process.env.DSH_WEB_PORT) || 3080;
    logger.info(
      '[dsh] dev mode: 连接外部 dev 实例 http://127.0.0.1:' +
        String(port) +
        '/',
    );
    return { port };
  }

  mkdirSync(DSH_HOME, { recursive: true });
  const prepared = prepareDshProfile(DSH_HOME);

  logger.info('[dsh] booting profile:', prepared.rootConfig);

  const ctx = await boot(
    BIN_NAME,
    prepared.rootConfig,
    prepared.patches,
    async (hostCtx) => {
      // 强制 loopback 绑定：--host 127.0.0.1 --port 0（随机端口）。
      provideCmdline(hostCtx, {
        args: ['--host', '127.0.0.1', '--port', '0', '--no-open'],
        exit: () => onDshExitRequest?.(),
      });
    },
    prepared.bareModuleBaseUrl,
  );

  const port = (ctx as Context & { webServer?: { port?: number } }).webServer
    ?.port;
  if (typeof port !== 'number') {
    throw new Error('[dsh] boot 后未发现 webServer.port，web UI 无法定位');
  }

  logger.info('[dsh] booted, web server on 127.0.0.1:', port);
  return { ctx, port };
}

/** 终止 dsh 的 Cordis 插件树（幂等），供退出 zhima 时调用。 */
export async function disposeDsh(): Promise<void> {
  const task = bootTask;
  bootTask = undefined;
  if (task === undefined) return;
  try {
    const { ctx } = await task;
    if (ctx) await ctx.fiber.dispose();
  } catch (cause) {
    logger.error('[dsh] dispose failed:', cause);
  }
  logger.info('[dsh] disposed');
}
