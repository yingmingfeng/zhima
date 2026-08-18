/**
 * DSH 门面：主进程对外 API + 状态机。
 *
 * 三者分离：
 * - packages/dsh        —— 依赖容器（90+ @deepseek-ai 包）
 * - src/main/dsh/        —— 本目录：主进程使用代码
 * - ~/.zhima/.dsh        —— dsh 用户数据（profile/session/凭据，见 boot.ts DSH_HOME）
 *
 * 状态仅在主进程维护，通过订阅（当前转发到所有 zhima 窗口）通知渲染进程。
 */
import { logger } from '@main/logger';

import {
  bootDsh,
  disposeDsh as disposeDshBoot,
  setDshExitHandler,
} from './boot';
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

/**
 * 打开 DSH 窗口：首次触发懒加载 boot，之后复用单例。
 * boot 期间状态为 booting（按钮显示加载）；boot 失败切 error 并抛出。
 */
export async function openDshWindow(): Promise<void> {
  if (state === 'booting') return;
  if (state === 'ready' && showDshWindow()) return;

  setState('booting');
  try {
    const { port } = await bootDsh();
    createDshWindow(`http://127.0.0.1:${port}/`);
    setState('ready');
  } catch (cause) {
    logger.error('[dsh] open failed:', cause);
    setState('error');
    throw cause;
  }
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

/** 初始化门面：挂接 DSH 窗口「请求退出」回调（关窗口而非退出 zhima）。 */
export function initDshFacade(): void {
  setDshExitHandler(() => closeDsh());
}
