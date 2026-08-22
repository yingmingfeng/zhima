/**
 * DSH 门面：主进程对外 API + 状态机。
 *
 * 三者分离：
 * - packages/dsh        —— 依赖容器（90+ @deepseek-ai 包）
 * - src/main/dsh/        —— 本目录：主进程使用代码
 * - ~/.dsh              —— dsh 用户数据（profile/session/凭据，见 boot.ts DSH_HOME）
 *
 * 运行模式（内置/外部）与 profile 选择持久化在 Electron userData/profile-selection/
 * （与 DSH Desktop 结构一致），取代原 DSH_WEB_DEV / DSH_WEB_PROFILE 环境变量：切换无需重启 zhima。
 * 状态仅在主进程维护，通过订阅（当前转发到所有 zhima 窗口）通知渲染进程。
 */
import { app } from 'electron';
import { installFailLoud, resolveProfileDir } from '@deepseek-ai/dsh-app-boot';

import { logger } from '@main/logger';
import { windowManager } from '@main/services/windowManager';
import { IPC_DSH_TOAST } from '@shared/ipc-channels';

import {
  DSH_HOME,
  bootDsh,
  disposeDsh as disposeDshBoot,
  getActiveDshCtx,
  isDshBooted,
  setDshExitHandler,
} from './boot';
import {
  getLastKnownGoodProfile,
  markDshProfileHealthy,
} from './profile-state';
import {
  createProfile,
  ensureDefaultProfileExists,
  dshProfileExists,
} from './profile';
import {
  injectRendererBootProbe,
  registerRendererBootRoute,
  type RendererBootReport,
} from './renderer-boot';
import {
  closeDshWindow,
  createDshWindow,
  hasDshWindow,
  hideDshWindow,
  reloadDshWindow,
  showDshWindow,
} from './runtime';
import {
  DEFAULT_DSH_PROFILE,
  getDshRunMode,
  getExternalDshPort,
  getSelectedDshProfile,
  setDshRunMode,
  setExternalDshPort,
  setSelectedDshProfile,
  type DshRunMode,
} from './state';

/** DSH 生命周期状态，渲染进程按钮据此显示加载态。 */
export type DshState = 'idle' | 'booting' | 'ready' | 'error';

let state: DshState = 'idle';
const stateListeners = new Set<(next: DshState) => void>();

/** 当前 boot 的 profile（builtin 模式；renderer healthy 上报时提升为 lastKnownGood）。 */
let activeDshProfileName: string | undefined;

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

/** 上报路由只注册一次（webServer.register 重复注册会抛错）；dispose 后重置。 */
let rendererBootRouteRegistered = false;

/** M3：处理 renderer boot 上报。healthy 仅记录；failed 打日志 + 记诊断信息。 */
let lastRendererError: string | undefined;
export function getLastRendererError(): string | undefined {
  return lastRendererError;
}

function handleRendererBootReport(report: RendererBootReport): void {
  if (report.status === 'healthy') {
    lastRendererError = undefined;
    // H3：UI 确证健康后才提升 lastKnownGood（切换 profile 后为新 profile 记录）。
    markDshProfileHealthy(activeDshProfileName ?? DEFAULT_DSH_PROFILE);
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

/** 广播 DSH toast 到所有 zhima 窗口（切换进度/结果反馈）。 */
function broadcastDshToast(
  message: string,
  type: 'success' | 'error' | 'loading',
): void {
  windowManager.broadcast(IPC_DSH_TOAST, { message, type });
}

/**
 * 打开 DSH 窗口：按当前运行模式分流。
 * - builtin：内部 boot（用选中的 profile）；profile 缺失时默认 zhima-desktop 自动创建
 * - external：连接外部手动启动的实例，不可达则 toast 报错
 */
export async function openDshWindow(): Promise<void> {
  if (state === 'booting') return;
  if (state === 'ready' && showDshWindow()) return;

  // builtin 模式：校验 profile 可用（默认 zhima-desktop 自动创建，自定义须已存在）
  if (getDshRunMode() === 'builtin') {
    const profileName = getSelectedDshProfile();
    if (profileName !== DEFAULT_DSH_PROFILE && !dshProfileExists(profileName)) {
      broadcastDshToast(
        `profile "${profileName}" 尚未创建，请先用 dsh 命令创建`,
        'error',
      );
      logger.warn(
        '[dsh] profile not found:',
        profileName,
        resolveProfileDir(profileName, DSH_HOME),
      );
      return;
    }
  }

  setState('booting');
  try {
    const { ctx, port, profileName } = await bootDsh();
    if (profileName) activeDshProfileName = profileName;

    // external 模式：检查外部实例是否可达
    if (!ctx) {
      const reachable = await checkExternalReachable(port);
      if (!reachable) {
        setState('idle');
        broadcastDshToast(
          `无法连接外部 DSH 实例 http://127.0.0.1:${port}/，请先手动启动 DSH`,
          'error',
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

/** 探测外部 DSH 实例是否可达，2 秒超时。 */
function checkExternalReachable(port: number): Promise<boolean> {
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

/**
 * 切换 profile（仅内置模式）：持久化选择 → 重启 DSH 会话（复用窗口）。
 * 若 DSH 从未 boot（窗口未开），只持久化，下次打开生效。
 */
export async function selectDshProfile(name: string): Promise<void> {
  if (getDshRunMode() !== 'builtin') {
    throw new Error('外部模式不支持切换 profile');
  }
  if (name !== DEFAULT_DSH_PROFILE && !dshProfileExists(name)) {
    throw new Error(`profile "${name}" 尚未创建`);
  }
  if (name === getSelectedDshProfile()) return;

  setSelectedDshProfile(name);
  // 无窗口时只改选择，下次打开生效（主进程统一广播结果，避免重复 toast）。
  if (!isDshBooted()) {
    broadcastDshToast(`已切换到配置文件 ${name}（下次打开生效）`, 'success');
    return;
  }

  const hadWindow = hasDshWindow();
  if (hadWindow) hideDshWindow();
  rendererBootRouteRegistered = false;
  await disposeDshBoot();
  setState('booting'); // 切换中：托盘「配置文件」菜单置灰
  broadcastDshToast(`正在切换配置文件 → ${name}…`, 'loading');
  try {
    const { ctx, port, profileName } = await bootDsh();
    if (profileName) activeDshProfileName = profileName;
    if (ctx && !rendererBootRouteRegistered) {
      registerRendererBootRoute(ctx, handleRendererBootReport);
      rendererBootRouteRegistered = true;
    }
    if (hadWindow) {
      const win = reloadDshWindow(`http://127.0.0.1:${port}/`);
      injectRendererBootProbe(win.webContents);
    }
    setState('ready');
    broadcastDshToast(`已切换到配置文件 ${name}`, 'success');
  } catch (cause) {
    logger.error('[dsh] profile switch failed:', cause);
    setState('error');
    broadcastDshToast(
      `切换失败：${cause instanceof Error ? cause.message : String(cause)}`,
      'error',
    );
    throw cause;
  }
}

/**
 * 切换运行模式（内置/外部）。
 * 切 external：若内置 boot 已启动，先 dispose（renderer 侧会显示"正在停止内置 DSH…"）。
 */
export async function selectDshMode(
  mode: DshRunMode,
  port?: number,
): Promise<void> {
  if (mode === 'external') {
    const targetPort = port ?? getExternalDshPort();
    // 先持久化选择，即使停止内置失败端口/模式也已记住。
    setExternalDshPort(targetPort);
    setDshRunMode('external');
    // 仅确有内置 Cordis 树在跑时才需要停止（external 模式的假 boot 无需停止）。
    if (getActiveDshCtx() !== undefined) {
      broadcastDshToast('正在停止内置 DSH…', 'loading');
      try {
        rendererBootRouteRegistered = false;
        await disposeDshBoot();
      } finally {
        closeDshWindow();
        setState('idle');
      }
      broadcastDshToast('内置 DSH 已停止', 'success');
    }
    broadcastDshToast(
      `已切换为外部模式（端口 ${targetPort}），请手动启动 DSH 实例`,
      'success',
    );
    return;
  }
  setDshRunMode('builtin');
  broadcastDshToast('已切换为内置模式', 'success');
}

/**
 * 创建新 profile 并切换到它（打开 DSH 窗口）。
 * profile 用 web 模板初始化，名称校验 + 重复检查后创建。
 */
export async function handleProfileCreate(
  name: string,
  confirmed: boolean,
): Promise<void> {
  if (!confirmed || !name) return;
  createProfile(name, DSH_HOME);
  setSelectedDshProfile(name);
  // 首次打开：用新 profile boot + 建窗
  await openDshWindow();
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
  // 启动时确保默认 profile（zhima-desktop）存在：不存在则用 web 模板创建，
  // 让托盘「配置文件」菜单与磁盘一致，避免虚拟项与实际目录脱节。
  ensureDefaultProfileExists(DSH_HOME);

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
