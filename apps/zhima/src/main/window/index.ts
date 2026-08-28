/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { BrowserWindow } from 'electron';

import { logger } from '@main/logger';
import * as env from '@main/env';

import { createWindow } from './createWindow';

let mainWindow: BrowserWindow | null = null;

export function showInactive() {
  if (mainWindow) {
    // eslint-disable-next-line no-unused-expressions
    mainWindow.showInactive();
  }
}

export function show() {
  if (mainWindow) {
    mainWindow.show();
  }
}

export function createMainWindow(
  options?: { showInBackground?: boolean },
) {
  mainWindow = createWindow({
    routerPath: '/',
    width: 1440,
    height: 672,
    alwaysOnTop: false,
    // 启动优化：splash 等待窗口显示期间主窗口只在后台创建，不 show 抢焦点
    showInBackground: options?.showInBackground,
  });

  mainWindow.on('close', (event) => {
    logger.info('mainWindow closed');
    // 关闭即隐藏到托盘（桌面 Agent 驻留，DSH 会话/托盘菜单仍在），不销毁窗口。
    // 用户从托盘"打开 zhima"恢复；真正退出走托盘"退出"(app.quit → before-quit 里 destroy)。
    // 原实现仅 macOS 隐藏，Windows/Linux 直接销毁窗口且置 null，一关就触发
    // window-all-closed → 退出，导致点击关闭即闪退。
    if (env.isMacOS) {
      event.preventDefault();

      // Black screen on window close in fullscreen mode
      // https://github.com/electron/electron/issues/20263#issuecomment-633179965
      if (mainWindow?.isFullScreen()) {
        mainWindow?.setFullScreen(false);

        mainWindow?.once('leave-full-screen', () => {
          mainWindow?.hide();
        });
      } else {
        mainWindow?.hide();
      }
    } else {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  return mainWindow;
}

export function setContentProtection(enable: boolean) {
  mainWindow?.setContentProtection(enable);
}

export async function showWindow() {
  mainWindow?.setContentProtection(false);
  mainWindow?.setIgnoreMouseEvents(false);
  mainWindow?.show();
  mainWindow?.restore();
}

export async function hideMainWindow() {
  try {
    mainWindow?.setContentProtection(true);
    mainWindow?.setAlwaysOnTop(true);
    mainWindow?.setFocusable(false);
    mainWindow?.hide();
  } catch (error) {
    logger.error('[hideMainWindow]', error);
  }
}

export async function showMainWindow() {
  try {
    mainWindow?.setContentProtection(false);
    setTimeout(() => {
      mainWindow?.setAlwaysOnTop(false);
    }, 100);
    mainWindow?.setFocusable(true);
    mainWindow?.show();
  } catch (error) {
    logger.error('[showMainWindow]', error);
  }
}
