/**
 * DSH 窗口运行时：创建独立 BrowserWindow 加载 dsh web UI 的 loopback URL。
 *
 * 参考 dsh-plugin-desktop/src/electron-runtime.ts 裁剪：只保留窗口部分，
 * 砍掉托盘/更新/终端/主题联动。zhima 不依赖 dsh 的 desktop-shell 插件，
 * 窗口完全由本文件自建并管理。
 */
import { BrowserWindow, shell } from 'electron';

import { logger } from '@main/logger';

/** DSH 窗口尺寸，参照 dsh-desktop 的默认窗口规格。 */
const DEFAULT_WINDOW_CONFIG = {
  width: 1280,
  height: 840,
  minWidth: 900,
  minHeight: 640,
};

/** 维护中的 DSH 窗口（单例），关闭后清空以便下次重建。 */
let dshWindow: BrowserWindow | null = null;

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

  const win = new BrowserWindow({
    ...DEFAULT_WINDOW_CONFIG,
    autoHideMenuBar: true,
    title: 'DeepSeek Harness',
    backgroundColor: '#ffffff',
    webPreferences: {
      // 远程内容页面：保持隔离，不注入 preload/Node 能力。
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const urlRoot = new URL(url).origin;

  // 导航守卫（M2）：仅放行同 origin；离开 loopback 一律拦截并转系统浏览器。
  // 用 origin 严格比较而非前缀匹配（避免 http://127.0.0.1:54321.evil.com 逃逸）。
  const isSameOrigin = (targetUrl: string): boolean => {
    try {
      return new URL(targetUrl).origin === urlRoot;
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

  void win.loadURL(url);
  dshWindow = win;
  logger.info('[dsh] window created, url:', url);
  return win;
}

/** 关闭 DSH 窗口（不断言 harness，下次打开直接复用已 boot 的实例）。 */
export function closeDshWindow(): void {
  if (hasDshWindow()) {
    dshWindow!.destroy();
  }
  dshWindow = null;
}
