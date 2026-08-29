/**
 * Copyright (c) 2026 yingmingfeng
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * DSH 启动等待窗口（splash）：
 * 应用启动时显示，遮盖后台 DSH boot 的启动耗时；DSH 就绪、窗口建立后关闭，
 * 用户视角即「splash → DSH 窗口」无缝衔接。
 *
 * 加载独立的静态页 resources/splash.html（内联 CSS 的 logo + loading 动画），
 * 不经过 renderer/React/dev server：保证 splash 立即可见，避免因获取整个 renderer
 * bundle 首屏而加载不出来。纯静态页无需 preload/contextIsolation 特殊处理。
 *
 * 窗口特性：frameless 透明卡片、置顶、不进任务栏、不可聚焦（不抢焦点，
 * DSH 窗口 show 时仍能拿到前台激活）。
 */
import path from 'node:path';

import { app, BrowserWindow } from 'electron';

import { logger } from '@main/logger';

const SPLASH_CONFIG = {
  width: 300,
  height: 216,
} as const;

/** 单例窗口；null = 未创建或已关闭。 */
let splashWindow: BrowserWindow | null = null;

/** splash 是否正在显示。 */
export function hasSplashWindow(): boolean {
  return splashWindow !== null && !splashWindow.isDestroyed();
}

/** 加载独立的静态 splash 页（resources/splash.html）。 */
function loadSplashRenderer(win: BrowserWindow): void {
  const splashHtml = path.join(app.getAppPath(), 'resources', 'splash.html');
  void win.loadFile(splashHtml);
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
  });
  splashWindow.setAlwaysOnTop(true, 'screen-saver');
  splashWindow.center();
  loadSplashRenderer(splashWindow);
  // 立即显示（不等 ready-to-show），保证 splash 立即出现。初始化 DSH boot 的耗时由 splash 盖住。
  splashWindow.showInactive();
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
