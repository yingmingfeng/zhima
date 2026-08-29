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
import { showWindow } from '@main/window';
import { closeSplashWindow } from '@main/window/splash';
import { windowManager } from '@main/services/windowManager';
import { IPC_DSH_TOAST, IPC_DSH_PROFILE_CHANGED } from '@shared/ipc-channels';

import type { Context } from '@deepseek-ai/cordis';
import {
  DSH_HOME,
  bootDsh,
  disposeDsh as disposeDshBoot,
  getActiveDshCtx,
  setDshExitHandler,
} from './boot';
import {
  getLastKnownGoodProfile,
  markDshProfileHealthy,
} from './profile-state';
import { ensureDefaultProfileExists } from './profile';
import {
  injectRendererBootProbe,
  registerRendererBootRoute,
  type RendererBootReport,
} from './renderer-boot';
import {
  createPluginChangeDetector,
  type PluginChangeDetector,
} from './plugin-watch';
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
  setDshRunMode,
  setExternalDshPort,
  type DshRunMode,
} from './state';

/** DSH 生命周期状态，渲染进程按钮据此显示加载态。 */
export type DshState = 'idle' | 'booting' | 'ready' | 'error';

let state: DshState = 'idle';
const stateListeners = new Set<(next: DshState) => void>();

/** 当前 boot 的 profile（builtin 模式；renderer healthy 上报时提升为 lastKnownGood）。 */
let activeDshProfileName: string | undefined;

/** 插件变化基线（内置模式）：boot 时记录当前 profile 签名，供「检查插件变更」手动对比。 */
let pluginChangeDetector: PluginChangeDetector | undefined;
let pluginChangeProfile: string | undefined;

/**
 * DSH 后端是否在运行（托盘「内置模式·运行中」据此同步）。
 * 内置模式走 in-process boot（bootDsh），「运行中」以 Cordis 树 ctx 存活为准。
 */
export function isDshBackendRunning(): boolean {
  return getActiveDshCtx() !== undefined;
}

function clearPluginDetector(): void {
  pluginChangeDetector = undefined;
  pluginChangeProfile = undefined;
}

/** 记录当前 profile 的检测器基线。每次 boot 都重建（基线=本次实际加载的插件）。 */
function ensurePluginDetector(profileName: string): void {
  if (getDshRunMode() !== 'builtin') {
    clearPluginDetector();
    return;
  }
  // boot 意味着 zhima 重新加载了当前磁盘插件，基线应重置为本次实际加载的集合。
  clearPluginDetector();
  pluginChangeProfile = profileName;
  pluginChangeDetector = createPluginChangeDetector(
    resolveProfileDir(profileName, DSH_HOME),
  );
}

/**
 * 手动触发一次插件变化检查（托盘「检查插件变更」）：对比 boot 时基线。
 * 显示主窗口 + loading toast；有变化弹 diff dialog，无变化 toast 提示。
 * 无后台轮询/窗口事件，仅用户点击时检查。
 */
export async function checkPluginChangesNow(): Promise<void> {
  if (getDshRunMode() !== 'builtin') return;
  if (getActiveDshCtx() === undefined) return;
  if (!pluginChangeDetector) return;
  void showWindow(); // 让 zhima 主窗口可见，toast/dialog 才有处展示
  broadcastDshToast('正在检查插件变更…', 'loading');
  try {
    // 检查本身轻量，留一点时间让 loading 可见。
    await new Promise((resolve) => setTimeout(resolve, 300));
    const diff = pluginChangeDetector.check();
    if (diff && (diff.added.length > 0 || diff.removed.length > 0)) {
      windowManager.broadcast(IPC_DSH_PROFILE_CHANGED, {
        profileName: pluginChangeProfile,
        added: diff.added,
        removed: diff.removed,
      });
      broadcastDshToast('检测到插件变化，需要重启才能生效', 'success');
    } else {
      broadcastDshToast('插件没有变化', 'success');
    }
  } catch (cause) {
    logger.error('[dsh] check plugins failed:', cause);
    broadcastDshToast(
      `检查插件变更失败：${cause instanceof Error ? cause.message : String(cause)}`,
      'error',
    );
  }
}

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
 * - builtin：in-process boot（bootDsh，Electron 主进程原生读 asar，闭包无需 unpack）
 * - external：连接外部手动启动的实例，不可达则 toast 报错
 */
export async function openDshWindow(): Promise<void> {
  if (state === 'booting') return;
  if (state === 'ready' && showDshWindow()) return;

  setState('booting');
  try {
    const { ctx, port, profileName } = await bootDshSession();
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
    ensurePluginDetector(profileName ?? DEFAULT_DSH_PROFILE);
    setState('ready');
  } catch (cause) {
    logger.error('[dsh] open failed:', cause);
    setState('error');
    // 打开失败必须让前端可见：主进程统一广播 error toast（渲染进程 onToast 订阅）。
    broadcastDshToast(
      `DSH 窗口打开失败：${cause instanceof Error ? cause.message : String(cause)}`,
      'error',
    );
    throw cause;
  }
}

/**
 * 启动时自动打开 DSH（配合 splash 等待窗口）：
 * builtin 模式后台执行 openDshWindow（in-process boot → 建窗），完成后关 splash
 * 露出 DSH 窗口；失败时关 splash 回退显示 zhima 主窗口（失败 toast 已由 openDshWindow
 * 内部广播）。external 模式不做自动连接（外部实例未必在跑），直接关 splash。
 * 不阻塞 initializeApp：splash 的关闭时机与 boot 启动耗时自然同步。
 */
export async function autoOpenDshOnStartup(): Promise<void> {
  if (getDshRunMode() !== 'builtin') {
    closeSplashWindow();
    return;
  }
  try {
    await openDshWindow();
  } catch (cause) {
    // openDshWindow 已记日志 + toast + 置 error 态；此处仅负责收尾 splash 并回退主窗口
    logger.error('[dsh] auto open on startup failed:', cause);
    void showWindow();
  } finally {
    closeSplashWindow();
  }
}

/**
 * 统一 DSH 会话启动：builtin 与 external 均走 in-process boot（bootDsh）。
 * 说明：曾采用 dsh CLI 独立进程方案（spawn 内置 node.exe 作外置 node），但生产下
 * 需把完整闭包（@deepseek-ai/* + 第三方）物理 unpack 到 app.asar.unpacked，安装/体积
 * 代价大；且 CLI 入口要从 asar 重定位到 unpacked，链路复杂。故回退为 in-process
 * boot——Electron 主进程原生可读 asar，闭包无需 unpack，链路最简。守护进程留待后续。
 */
async function bootDshSession(): Promise<{
  ctx?: Context;
  port: number;
  profileName: string;
}> {
  const inProcess = await bootDsh();
  return {
    ctx: inProcess.ctx,
    port: inProcess.port,
    profileName: inProcess.profileName,
  };
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
 * 重新加载插件：重启当前 profile 的 DSH 会话（dispose + 重新 boot）。
 * 用于用户在外部安装/移除了插件后手动生效。仅内置模式；有窗口时复用窗口 reload。
 */
export async function restartDshSession(): Promise<void> {
  if (getDshRunMode() !== 'builtin') {
    throw new Error('外部模式不支持重新加载插件');
  }
  const hadWindow = hasDshWindow();
  if (hadWindow) hideDshWindow();
  rendererBootRouteRegistered = false;
  await disposeDshBoot();
  setState('booting'); // 切换中：托盘「重新加载插件」置灰
  broadcastDshToast('正在重新加载插件…', 'loading');
  try {
    const { ctx, port, profileName } = await bootDshSession();
    if (profileName) activeDshProfileName = profileName;
    if (ctx && !rendererBootRouteRegistered) {
      registerRendererBootRoute(ctx, handleRendererBootReport);
      rendererBootRouteRegistered = true;
    }
    if (hadWindow) {
      const win = reloadDshWindow(`http://127.0.0.1:${port}/`);
      injectRendererBootProbe(win.webContents);
    }
    ensurePluginDetector(profileName ?? DEFAULT_DSH_PROFILE);
    setState('ready');
    broadcastDshToast('插件已重新加载', 'success');
  } catch (cause) {
    logger.error('[dsh] reload plugins failed:', cause);
    setState('error');
    broadcastDshToast(
      `重新加载失败：${cause instanceof Error ? cause.message : String(cause)}`,
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
    // 先持久化选择，即使后续失败端口/模式也已记住。
    setExternalDshPort(targetPort);
    setDshRunMode('external');
    if (getActiveDshCtx() !== undefined) {
      rendererBootRouteRegistered = false;
      await disposeDshBoot();
    }
    const hadWindow = hasDshWindow();
    // 切换模式须重建窗口（材质因模式不同：内置=增强无边框，外部=原生框）。
    if (hadWindow) closeDshWindow();
    if (hadWindow) {
      const reachable = await checkExternalReachable(targetPort);
      if (reachable) {
        const win = createDshWindow(`http://127.0.0.1:${targetPort}/`);
        injectRendererBootProbe(win.webContents);
        setState('ready');
        broadcastDshToast(
          `已连接外部 DSH 实例（端口 ${targetPort}）`,
          'success',
        );
      } else {
        setState('idle');
        broadcastDshToast(
          `无法连接外部 DSH 实例 http://127.0.0.1:${targetPort}/，请先手动启动 DSH`,
          'error',
        );
      }
    } else {
      broadcastDshToast(`已切换为外部模式（端口 ${targetPort}）`, 'success');
    }
    return;
  }
  setDshRunMode('builtin');
  const hadWindow = hasDshWindow();
  // 外部窗口是原生框，切回内置需重建为增强窗口。
  if (hadWindow) closeDshWindow();
  if (hadWindow) {
    // 从 external 切回 builtin 必须重置 boot 单例：external 模式下 bootDsh 缓存的是
    // 无 ctx 的连接结果（只含 port/profileName），不重置则 openDshWindow 复用该结果，
    // 仍走检测外部实例分支而报「无法连接外部」，且 getActiveDshCtx() 一直为空。
    rendererBootRouteRegistered = false;
    await disposeDshBoot();
    // 内置：in-process boot 已就绪则复用，否则重新 boot（openDshWindow 内部处理）。
    await openDshWindow();
  } else {
    broadcastDshToast('已切换为内置模式', 'success');
  }
}

/** 关闭 DSH 窗口（harness 保持 boot，下次打开即复用）。 */
export function closeDsh(): void {
  closeDshWindow();
}

/** 退出 zhima 前的清理：dispose in-process 树 + 关窗口。 */
export async function disposeDsh(): Promise<void> {
  closeDshWindow();
  await disposeDshBoot();
  clearPluginDetector();
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
