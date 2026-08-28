/**
 * Copyright (c) 2026 yingmingfeng
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * DSH 启动等待窗口（splash）：
 * 应用启动时显示，遮盖后台 DSH CLI 的启动耗时；CLI 就绪、DSH 窗口建立后关闭，
 * 用户视角即「splash → DSH 窗口」无缝衔接。
 *
 * 加载 renderer 的 /splash 路由页（HashRouter）：dev 用 `rendererUrl + '#/splash'`
 * （dev server 是 path 形式 URL，路由状态只认 hash，与 ScreenMarker 的 widget 窗口
 * 同构）；prod 用 loadFile 的 hash 选项。
 *
 * 窗口特性：frameless 透明卡片、置顶、不进任务栏、不可聚焦（不抢焦点，
 * DSH 窗口 show 时仍能拿到前台激活）。必须挂 preload：renderer 入口全局挂载的
 * DshTrayController 等组件依赖 window.dsh / window.electron。
 */
import path from 'node:path';

import { BrowserWindow, app } from 'electron';

import * as env from '@main/env';
import { logger } from '@main/logger';

const SPLASH_CONFIG = {
  width: 380,
  height: 220,
} as const;

/** 单例窗口；null = 未创建或已关闭。 */
let splashWindow: BrowserWindow | null = null;

/** splash 是否正在显示。 */
export function hasSplashWindow(): boolean {
  return splashWindow !== null && !splashWindow.isDestroyed();
}

/** 加载 renderer 的 /splash 路由（dev: path URL + hash；prod: loadFile + hash）。 */
function loadSplashRenderer(win: BrowserWindow): void {
  if (!app.isPackaged && env.rendererUrl) {
    void win.loadURL(env.rendererUrl + '#/splash');
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/index.html'), {
      hash: '#/splash',
    });
  }
}

/** 创建并显示 splash（幂等：已显示则复用）。居中、置顶、不抢焦点。 */
export function showSplashWindow(): void {
  if (hasSplashWindow()) return;
  splashWindow = new BrowserWindow({
    ...SPLASH_CONFIG,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    focusable: false,
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    webPreferences: {
      // renderer 入口全局组件依赖 window.dsh / window.electron，preload 必须挂
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
    },
  });
  splashWindow.setAlwaysOnTop(true, 'screen-saver');
  splashWindow.center();
  loadSplashRenderer(splashWindow);
  splashWindow.once('ready-to-show', () => {
    splashWindow?.showInactive();
  });
  splashWindow.on('closed', () => {
    splashWindow = null;
  });
  logger.info('[splash] shown');
}

/** 关闭 splash（幂等）。DSH 窗口就绪或启动失败回退时调用。 */
export function closeSplashWindow(): void {
  if (!hasSplashWindow()) return;
  splashWindow!.destroy();
  splashWindow = null;
  logger.info('[splash] closed');
}
