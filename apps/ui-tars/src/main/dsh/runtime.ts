/**
 * DSH 窗口运行时：创建独立 BrowserWindow 加载 dsh web UI 的 loopback URL。
 *
 * 参考 dsh-plugin-desktop/src/electron-runtime.ts 裁剪：只保留窗口部分，
 * 砍掉托盘/更新/终端/主题联动。zhima 不依赖 dsh 的 desktop-shell 插件，
 * 窗口完全由本文件自建并管理。
 */
import { BrowserWindow, shell } from 'electron';

import { logger } from '@main/logger';

import { getDshRunMode, getDshShellMode, type DshShellMode } from './state';

/** DSH 窗口尺寸，参照 dsh-desktop 的默认窗口规格。 */
const DEFAULT_WINDOW_CONFIG = {
  width: 1280,
  height: 840,
  minWidth: 900,
  minHeight: 640,
};

/** advanced 无边框材质仅支持 win32/darwin（参考 dsh-plugin-desktop/src/window-options.ts）。 */
const SUPPORTS_ADVANCED =
  process.platform === 'win32' || process.platform === 'darwin';

/** Windows 标题栏 overlay 高度，与 advanced-shell 插件的 window-chrome.ts 常量一致。 */
const WINDOWS_TITLEBAR_HEIGHT = 32;

/**
 * 是否应用 advanced 窗口材质。
 * 仅内置模式（advanced-shell 客户端插件由 zhima 在 builtin boot 时注入，
 * external 连接的外部实例不会加载它）且平台支持时启用。
 */
function isAdvancedWindow(mode: DshShellMode): boolean {
  return (
    mode === 'advanced' && SUPPORTS_ADVANCED && getDshRunMode() === 'builtin'
  );
}

/**
 * 按呈现模式构建 BrowserWindow 选项。
 * - advanced（win32）：隐藏标题栏 + 原生 overlay 控件 + mica 材质
 * - advanced（darwin）：hiddenInset 红绿灯 + vibrancy + 透明
 * - compatibility：原生框 + 白底
 */
function shellWindowOptions(
  mode: DshShellMode,
): Electron.BrowserWindowConstructorOptions {
  const base: Electron.BrowserWindowConstructorOptions = {
    ...DEFAULT_WINDOW_CONFIG,
    autoHideMenuBar: true,
    title: 'DeepSeek Harness',
    backgroundColor: '#ffffff',
    // 远程内容页面：保持隔离，不注入 preload/Node 能力。
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  };
  if (!isAdvancedWindow(mode)) return base;
  if (process.platform === 'win32') {
    return {
      ...base,
      backgroundColor: '#00000000',
      titleBarStyle: 'hidden',
      titleBarOverlay: {
        color: '#00000000',
        symbolColor: '#7f858f',
        height: WINDOWS_TITLEBAR_HEIGHT,
      },
      backgroundMaterial: 'mica',
      hasShadow: true,
      roundedCorners: true,
      thickFrame: true,
    };
  }
  return {
    ...base,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    transparent: true,
    backgroundColor: '#00000000',
    vibrancy: 'sidebar',
    visualEffectState: 'followWindow',
  };
}

/** 渲染器 URL：advanced 模式追加模式/平台标记，供页面内 advanced-shell client 解析。 */
function rendererUrl(baseUrl: string, mode: DshShellMode): string {
  if (!isAdvancedWindow(mode)) return baseUrl;
  const url = new URL(baseUrl);
  url.searchParams.set('dsh-desktop-mode', 'advanced');
  url.searchParams.set('dsh-desktop-platform', process.platform);
  return url.href;
}

/** 维护中的 DSH 窗口（单例），关闭后清空以便下次重建。 */
let dshWindow: BrowserWindow | null = null;

/** 当前加载的 loopback origin（导航守卫用；切换 profile 复用窗口后更新）。 */
let currentUrlRoot = '';

/** 当前 DSH 窗口是否仍可用。 */
export function hasDshWindow(): boolean {
  return dshWindow !== null && !dshWindow.isDestroyed();
}

/** 显示并聚焦当前 DSH 窗口；窗口已销毁时返回 false。 */
export function showDshWindow(): boolean {
  if (!hasDshWindow()) return false;
  const win = dshWindow!;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  return true;
}

/**
 * 创建（或复用聚焦）DSH 窗口并加载给定 loopback URL。
 * @param url - webServer 的实际地址（http://127.0.0.1:<port>）。
 */
export function createDshWindow(url: string): BrowserWindow {
  if (hasDshWindow()) {
    showDshWindow();
    return dshWindow!;
  }

  const mode = getDshShellMode();
  const win = new BrowserWindow(shellWindowOptions(mode));
  const targetUrl = rendererUrl(url, mode);

  currentUrlRoot = new URL(targetUrl).origin;

  // 导航守卫（M2）：仅放行同 origin；离开 loopback 一律拦截并转系统浏览器。
  // 用 origin 严格比较而非前缀匹配（避免 http://127.0.0.1:54321.evil.com 逃逸）。
  // currentUrlRoot 可变：切换 profile 复用窗口换端口后 guard 跟随新 origin。
  const isSameOrigin = (targetUrl: string): boolean => {
    try {
      return new URL(targetUrl).origin === currentUrlRoot;
    } catch {
      return false;
    }
  };
  const guard = (event: Electron.Event, targetUrl: string): void => {
    if (!isSameOrigin(targetUrl)) {
      event.preventDefault();
      shell.openExternal(targetUrl);
    }
  };
  // will-redirect 覆盖页面内 302/307 跳转（will-navigate 不触发该场景）。
  win.webContents.on('will-navigate', guard);
  win.webContents.on('will-redirect', guard);
  win.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    shell.openExternal(targetUrl);
    return { action: 'deny' };
  });

  win.on('closed', () => {
    dshWindow = null;
  });

  void win.loadURL(targetUrl);
  dshWindow = win;
  logger.info('[dsh] window created, url:', targetUrl);
  return win;
}

/** 关闭 DSH 窗口（不断言 harness，下次打开直接复用已 boot 的实例）。 */
export function closeDshWindow(): void {
  if (hasDshWindow()) {
    dshWindow!.destroy();
  }
  dshWindow = null;
}

/** 隐藏 DSH 窗口（任务栏消失）：切换 profile 期间让用户以为窗口关闭。 */
export function hideDshWindow(): void {
  if (hasDshWindow()) dshWindow!.hide();
}

/**
 * 复用当前窗口加载新 URL 并重新显示（切换 profile 后载入新实例）。
 * 窗口未打开时退化为创建新窗口。
 */
export function reloadDshWindow(url: string): BrowserWindow {
  if (!hasDshWindow()) return createDshWindow(url);
  const win = dshWindow!;
  const targetUrl = rendererUrl(url, getDshShellMode());
  currentUrlRoot = new URL(targetUrl).origin;
  void win.loadURL(targetUrl);
  win.show();
  win.focus();
  logger.info('[dsh] window reloaded, url:', targetUrl);
  return win;
}
