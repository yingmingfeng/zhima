/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { electronApp, optimizer } from '@electron-toolkit/utils';
import {
  app,
  BrowserView,
  BrowserWindow,
  desktopCapturer,
  ipcMain,
  session,
  WebContentsView,
  screen,
} from 'electron';
import squirrelStartup from 'electron-squirrel-startup';
import ElectronStore from 'electron-store';

import * as env from '@main/env';
import { logger } from '@main/logger';
import { registerShortcuts } from '@main/shortcuts';
import { createMainWindow } from '@main/window/index';
import { registerIpcMain } from '@ui-tars/electron-ipc/main';
import { ipcRoutes } from './ipcRoutes';

import { UTIOService } from './services/utio';
import { store } from './store/create';
import { SettingStore } from './store/setting';
import { createTray } from './tray';
import { registerSettingsHandlers } from './services/settings';
import { sanitizeState } from './utils/sanitizeState';
import { windowManager } from './services/windowManager';
import { checkBrowserAvailability } from './services/browserCheck';
import {
  IPC_GET_STATE,
  IPC_WINDOW_MINIMIZE,
  IPC_WINDOW_MAXIMIZE,
  IPC_WINDOW_CLOSE,
  IPC_WINDOW_IS_MAXIMIZED,
  IPC_SUBSCRIBE,
  IPC_UTIO_SHARE_REPORT,
  IPC_DSH_OPEN,
  IPC_DSH_GET_STATE,
  IPC_DSH_STATE_CHANGED,
  IPC_DSH_PROFILE_SWITCH_CONFIRM,
  IPC_DSH_MODE_SWITCH_CONFIRM,
  IPC_DSH_PROFILE_CREATE_CONFIRM,
  IPC_DSH_SHELL_MODE_SWITCH_CONFIRM,
  IPC_DSH_PROFILE_CHANGED_RESTART,
} from '../shared/ipc-channels';
import {
  disposeDsh,
  getDshState,
  handleProfileCreate,
  initDshFacade,
  openDshWindow,
  restartDshSession,
  selectDshMode,
  selectDshProfile,
  selectDshShellMode,
  subscribeDshState,
} from './dsh';

const { isProd } = env;

// 在应用初始化之前启用辅助功能支持
app.commandLine.appendSwitch('force-renderer-accessibility');

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (squirrelStartup) {
  app.quit();
}

// M1 单实例锁：重复启动直接退出，避免两实例并发读写 ~/.dsh 等共享数据。
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
}

logger.debug('[env]', env);

ElectronStore.initRenderer();

if (isProd) {
  import('source-map-support').then(({ default: sourceMapSupport }) => {
    sourceMapSupport.install();
  });
}

const initializeApp = async () => {
  const isAccessibilityEnabled = app.isAccessibilitySupportEnabled();
  logger.info('isAccessibilityEnabled', isAccessibilityEnabled);
  if (env.isMacOS) {
    app.setAccessibilitySupportEnabled(true);
    const { ensurePermissions } = await import('@main/utils/systemPermissions');

    const ensureScreenCapturePermission = ensurePermissions();
    logger.info('ensureScreenCapturePermission', ensureScreenCapturePermission);
  }

  await checkBrowserAvailability();

  logger.info('createTray');
  // Tray
  await createTray();

  // Send app launched event
  await UTIOService.getInstance().appLaunched();

  logger.info('createMainWindow');
  let mainWindow = createMainWindow();

  session.defaultSession.setDisplayMediaRequestHandler(
    (_request, callback) => {
      desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
        const primaryDisplay = screen.getPrimaryDisplay();
        const primarySource = sources.find(
          (source) => source.display_id === primaryDisplay.id.toString(),
        );

        callback({ video: primarySource!, audio: 'loopback' });
      });
    },
    { useSystemPicker: false },
  );

  logger.info('mainZustandBridge');

  const { unsubscribe } = registerIPCHandlers([mainWindow]);

  app.on('window-all-closed', () => {
    logger.info('window-all-closed');
    // 全部窗口关闭时不退出，驻留托盘（zhima 是桌面 Agent，DSH 会话/托盘菜单仍在）。
    // 用户通过托盘"打开 zhima"恢复窗口，托盘"退出"才真正退出。
    // 原实现 non-macOS 直接 app.quit()，导致主窗口一关应用就退出（闪退/误退）。
    // Tray 持有事件句柄可保活；不调用 app.quit() 即持续驻留，退出生效路径留给托盘/quit。
  });

  // DSH 清理守卫：dsh 曾启动过则先异步 dispose Cordis 树，再真正退出，避免残留子进程
  // H1：dispose 若挂起（如活动子进程），5s 超时强制退出，避免应用卡死在退出。
  const DSH_DISPOSE_TIMEOUT_MS = 5000;
  let dshCleanupDone = false;
  app.on('before-quit', (event) => {
    logger.info('before-quit');
    const windows = BrowserWindow.getAllWindows();
    windows.forEach((window) => window.destroy());

    if (dshCleanupDone || getDshState() === 'idle') return;
    event.preventDefault();
    dshCleanupDone = true;
    const forceExitTimer = setTimeout(() => {
      logger.warn('[dsh] dispose 超时，强制退出');
      app.exit(1);
    }, DSH_DISPOSE_TIMEOUT_MS);
    void disposeDsh().finally(() => {
      clearTimeout(forceExitTimer);
      app.quit();
    });
  });

  // H1：Ctrl+C / SIGTERM → 走正常 quit 流程（触发上面守卫 dispose）。
  const handleTermSignal = (signal: NodeJS.Signals): void => {
    logger.info('received', signal, ', quitting');
    app.quit();
  };
  process.on('SIGINT', handleTermSignal);
  process.on('SIGTERM', handleTermSignal);

  app.on('quit', () => {
    logger.info('app quit');
    unsubscribe();
  });

  app.on('activate', () => {
    logger.info('app activate');
    if (!mainWindow || mainWindow.isDestroyed()) {
      mainWindow = createMainWindow();
    } else {
      if (!mainWindow.isVisible()) {
        mainWindow.show();
      }
      mainWindow.focus();
    }
  });

  // M1：二次启动时聚焦已有主窗口。
  app.on('second-instance', () => {
    logger.info('second-instance, focus main window');
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  logger.info('initializeApp end');

  // Check and update remote presets
  const settings = SettingStore.getStore();
  if (
    settings.presetSource?.type === 'remote' &&
    settings.presetSource.autoUpdate
  ) {
    try {
      await SettingStore.importPresetFromUrl(settings.presetSource.url!, true);
    } catch (error) {
      logger.error('Failed to update preset:', error);
    }
  }
};

/**
 * Register IPC handlers
 */
const registerIPCHandlers = (
  wrappers: (BrowserWindow | WebContentsView | BrowserView)[],
) => {
  ipcMain.handle(IPC_GET_STATE, () => {
    const state = store.getState();
    return sanitizeState(state);
  });

  // 窗口控制
  ipcMain.handle(IPC_WINDOW_MINIMIZE, () => {
    const win = BrowserWindow.getFocusedWindow();
    win?.minimize();
  });

  ipcMain.handle(IPC_WINDOW_MAXIMIZE, () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win?.isMaximized()) {
      win.unmaximize();
    } else {
      win?.maximize();
    }
  });

  ipcMain.handle(IPC_WINDOW_CLOSE, () => {
    const win = BrowserWindow.getFocusedWindow();
    win?.close();
  });

  ipcMain.handle(IPC_WINDOW_IS_MAXIMIZED, () => {
    const win = BrowserWindow.getFocusedWindow();
    return win?.isMaximized() ?? false;
  });

  // DSH 集成
  initDshFacade();

  ipcMain.handle(IPC_DSH_OPEN, async () => {
    try {
      await openDshWindow();
      return { ok: true as const };
    } catch (cause) {
      logger.error('[dsh] open-window failed:', cause);
      return {
        ok: false as const,
        error: cause instanceof Error ? cause.message : String(cause),
      };
    }
  });
  ipcMain.handle(IPC_DSH_GET_STATE, () => getDshState());
  subscribeDshState((next) => {
    windowManager.broadcast(IPC_DSH_STATE_CHANGED, next);
  });

  ipcMain.handle(
    IPC_DSH_PROFILE_SWITCH_CONFIRM,
    async (_event, payload: { name?: string; confirmed?: boolean }) => {
      try {
        if (payload?.confirmed && payload.name) {
          await selectDshProfile(payload.name);
        }
        return { ok: true as const };
      } catch (cause) {
        logger.error('[dsh] profile switch failed:', cause);
        return {
          ok: false as const,
          error: cause instanceof Error ? cause.message : String(cause),
        };
      }
    },
  );
  ipcMain.handle(
    IPC_DSH_MODE_SWITCH_CONFIRM,
    async (
      _event,
      payload: {
        mode?: 'builtin' | 'external';
        port?: number;
        confirmed?: boolean;
      },
    ) => {
      try {
        if (payload?.confirmed && payload.mode) {
          await selectDshMode(payload.mode, payload.port);
        }
        return { ok: true as const };
      } catch (cause) {
        logger.error('[dsh] mode switch failed:', cause);
        return {
          ok: false as const,
          error: cause instanceof Error ? cause.message : String(cause),
        };
      }
    },
  );
  ipcMain.handle(
    IPC_DSH_SHELL_MODE_SWITCH_CONFIRM,
    async (
      _event,
      payload: { mode?: 'compatibility' | 'advanced'; confirmed?: boolean },
    ) => {
      try {
        if (payload?.confirmed && payload.mode) {
          await selectDshShellMode(payload.mode);
        }
        return { ok: true as const };
      } catch (cause) {
        logger.error('[dsh] shell mode switch failed:', cause);
        return {
          ok: false as const,
          error: cause instanceof Error ? cause.message : String(cause),
        };
      }
    },
  );
  ipcMain.handle(
    IPC_DSH_PROFILE_CREATE_CONFIRM,
    async (_event, payload: { name?: string; confirmed?: boolean }) => {
      try {
        await handleProfileCreate(
          payload?.name ?? '',
          payload?.confirmed ?? false,
        );
        return { ok: true as const };
      } catch (cause) {
        logger.error('[dsh] profile create failed:', cause);
        return {
          ok: false as const,
          error: cause instanceof Error ? cause.message : String(cause),
        };
      }
    },
  );
  ipcMain.handle(
    IPC_DSH_PROFILE_CHANGED_RESTART,
    async (_event, payload: { restart?: boolean }) => {
      try {
        if (payload?.restart) {
          await restartDshSession();
        }
        return { ok: true as const };
      } catch (cause) {
        logger.error('[dsh] reload plugins failed:', cause);
        return {
          ok: false as const,
          error: cause instanceof Error ? cause.message : String(cause),
        };
      }
    },
  );

  // 初始化时注册已有窗口
  wrappers.forEach((wrapper) => {
    if (wrapper instanceof BrowserWindow) {
      windowManager.registerWindow(wrapper);
    }
  });

  // 仅向未销毁的窗口发送状态
  ipcMain.on(IPC_SUBSCRIBE, (state: unknown) => {
    const sanitizedState = sanitizeState(state as Record<string, unknown>);
    windowManager.broadcast('subscribe', sanitizedState);
  });

  const unsubscribe = store.subscribe((state: unknown) =>
    ipcMain.emit('subscribe', state),
  );

  // TODO: move to ipc routes
  ipcMain.handle(IPC_UTIO_SHARE_REPORT, async (_, params) => {
    await UTIOService.getInstance().shareReport(params);
  });

  registerSettingsHandlers();
  // register ipc services routes
  registerIpcMain(ipcRoutes);

  return { unsubscribe };
};

/**
 * Add event listeners...
 */

// 残留的旧逻辑已删除：模块级 window-all-closed → app.quit() 与"关窗驻留托盘"设计冲突。
// 当前窗口关闭即隐藏（window/index.ts close 拦截），全关也不退出，托盘常驻（main.ts initializeApp 内注册）。

app
  .whenReady()
  .then(async () => {
    // M1：未持有单实例锁时已在模块顶层 app.quit()，不再初始化。
    if (!hasSingleInstanceLock) return;

    electronApp.setAppUserModelId('com.electron');

    // Default open or close DevTools by F12 in development
    // and ignore CommandOrControl + R in production.
    // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window);
      // 生产环境经设置项 enableProdDevtools 排错时允许 F12 开关 devtools。
      // optimizer.watchWindowShortcuts 在 prod 只屏蔽 Ctrl+R 不响应 F12，这里单独补一个。
      if (!env.isDev && SettingStore.get('enableProdDevtools')) {
        window.webContents.on('before-input-event', (_e, input) => {
          if (input.type === 'keyDown' && input.code === 'F12') {
            if (window.webContents.isDevToolsOpened()) {
              window.webContents.closeDevTools();
            } else {
              window.webContents.openDevTools({ mode: 'detach' });
            }
          }
        });
      }
    });

    await initializeApp();

    // 注册主进程快捷键
    registerShortcuts();

    logger.info('app.whenReady end');
  })
  .catch(console.log);
