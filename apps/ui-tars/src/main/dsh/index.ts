/**
 * DSH 门面：主进程对外 API + 状态机。
 *
 * 三者分离：
 * - packages/dsh        —— 依赖容器（90+ @deepseek-ai 包）
 * - src/main/dsh/        —— 本目录：主进程使用代码
 * - ~/.dsh              —— dsh 用户数据（profile/session/凭据，见 boot.ts DSH_HOME）
 *
 * 状态仅在主进程维护，通过订阅（当前转发到所有 zhima 窗口）通知渲染进程。
 */
import { app, dialog } from 'electron';
import { installFailLoud } from '@deepseek-ai/dsh-app-boot';

import { logger } from '@main/logger';

import {
  bootDsh,
  disposeDsh as disposeDshBoot,
  setDshExitHandler,
} from './boot';
import {
  getLastKnownGoodProfile,
  markDshProfileHealthy,
} from './profile-state';
import { DSH_PROFILE_NAME } from './profile';
import {
  injectRendererBootProbe,
  registerRendererBootRoute,
  type RendererBootReport,
} from './renderer-boot';
import { closeDshWindow, createDshWindow, showDshWindow } from './runtime';

/** DSH 生命周期状态，渲染进程按钮据此显示加载态。 */
export type DshState = 'idle' | 'booting' | 'ready' | 'error';

let state: DshState = 'idle';
const stateListeners = new Set<(next: DshState) => void>();

function setState(next: DshState): void {
  if (state === next) return;
  state = next;
  logger.info('[dsh] state ->', next);
  for (const listener of stateListeners) listener(next);
}

/** 订阅状态变化；返回退订函数。 */
export function subscribeDshState(
  listener: (next: DshState) => void,
): () => void {
  stateListeners.add(listener);
  return () => stateListeners.delete(listener);
}

/** 当前状态。 */
export function getDshState(): DshState {
  return state;
}

/** 上报路由只注册一次（webServer.register 重复注册会抛错）。 */
let rendererBootRouteRegistered = false;

/** M3：处理 renderer boot 上报。healthy 仅记录；failed 打日志 + 记诊断信息。 */
let lastRendererError: string | undefined;
export function getLastRendererError(): string | undefined {
  return lastRendererError;
}

function handleRendererBootReport(report: RendererBootReport): void {
  if (report.status === 'healthy') {
    lastRendererError = undefined;
    // H3：UI 确证健康后才提升 lastKnownGood。
    markDshProfileHealthy(DSH_PROFILE_NAME);
    logger.info('[dsh] renderer boot healthy');
  } else {
    lastRendererError = report.error ?? report.plugins.join(', ');
    const lastKnownGood = getLastKnownGoodProfile();
    logger.error(
      '[dsh] renderer boot failed:',
      lastRendererError,
      '(failed plugins:',
      report.plugins.join(', ') + ')',
      lastKnownGood === undefined
        ? '(无 lastKnownGood 记录)'
        : `(lastKnownGood=${lastKnownGood}，若 DSH 窗口异常可手动清理 ~/.dsh/profiles 恢复)`,
    );
  }
}

/**
 * 打开 DSH 窗口：首次触发懒加载 boot，之后复用单例。
 * boot 期间状态为 booting（按钮显示加载）；boot 失败切 error 并抛出。
 */
export async function openDshWindow(): Promise<void> {
  if (state === 'booting') return;
  if (state === 'ready' && showDshWindow()) return;

  setState('booting');
  try {
    const { ctx, port } = await bootDsh();

    // dev 模式下检查外部 dev 实例是否可达
    if (!ctx) {
      const reachable = await checkDshDevReachable(port);
      if (!reachable) {
        setState('idle');
        dialog.showErrorBox(
          'DSH Dev 实例未启动',
          `无法连接到 http://127.0.0.1:${port}/\n\n` +
            '请先在 deepseek-harness 目录中执行：\n' +
            '  pnpm run dev:web\n' +
            '  pnpm dsh web\n\n' +
            '然后重试。',
        );
        return;
      }
    }

    if (ctx && !rendererBootRouteRegistered) {
      registerRendererBootRoute(ctx, handleRendererBootReport);
      rendererBootRouteRegistered = true;
    }
    const win = createDshWindow(`http://127.0.0.1:${port}/`);
    // M3：注入 boot 探针，UI 未就绪也能被主进程感知。
    injectRendererBootProbe(win.webContents);
    setState('ready');
  } catch (cause) {
    logger.error('[dsh] open failed:', cause);
    setState('error');
    throw cause;
  }
}

/** 探测 DSH dev 实例是否可达，2 秒超时。 */
function checkDshDevReachable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = fetch(`http://127.0.0.1:${port}/`, {
      method: 'HEAD',
      signal: AbortSignal.timeout(2000),
    });
    req.then(
      () => resolve(true),
      () => resolve(false),
    );
  });
}

/** 关闭 DSH 窗口（harness 保持 boot，下次打开即复用）。 */
export function closeDsh(): void {
  closeDshWindow();
}

/** 退出 zhima 前的清理：dispose Cordis 树 + 关窗口。 */
export async function disposeDsh(): Promise<void> {
  closeDshWindow();
  await disposeDshBoot();
  setState('idle');
}

const BIN_NAME = 'zhima-dsh';

/** 初始化门面：挂接 DSH 窗口「请求退出」回调 + 安装 fail-loud 兜底。 */
export function initDshFacade(): void {
  setDshExitHandler(() => closeDsh());

  // H2 fail-loud：未处理异常/unhandledRejection 显式打 stderr + 带标签退出，
  // 而不是主进程静默挂掉。release 钩子尽力 dispose dsh 树。
  installFailLoud(
    BIN_NAME,
    {
      on: (event, handler) => process.on(event, handler),
      off: (event, handler) => process.off(event, handler),
      stderr: process.stderr,
      exit: (code) => app.exit(code),
    },
    () => disposeDshBoot(),
  );
}
