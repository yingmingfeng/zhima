/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { IpcRendererEvent, contextBridge, ipcRenderer } from 'electron';
// import { preloadZustandBridge } from 'zutron/preload';

import type { UTIOPayload } from '@ui-tars/utio';

import type { AppState, LocalStore } from '@main/store/types';
import {
  IPC_SETTING_GET,
  IPC_SETTING_CLEAR,
  IPC_SETTING_UPDATE,
  IPC_SETTING_IMPORT_PRESET_FROM_TEXT,
  IPC_SETTING_IMPORT_PRESET_FROM_URL,
  IPC_SETTING_UPDATE_PRESET_FROM_REMOTE,
  IPC_SETTING_RESET_PRESET,
  IPC_SETTING_UPDATED,
  IPC_WINDOW_MINIMIZE,
  IPC_WINDOW_MAXIMIZE,
  IPC_WINDOW_CLOSE,
  IPC_WINDOW_IS_MAXIMIZED,
  IPC_GET_STATE,
  IPC_SUBSCRIBE,
  IPC_UTIO_SHARE_REPORT,
  IPC_DSH_OPEN,
  IPC_DSH_GET_STATE,
  IPC_DSH_STATE_CHANGED,
  IPC_DSH_PROFILE_SWITCH_REQUEST,
  IPC_DSH_PROFILE_SWITCH_CONFIRM,
  IPC_DSH_MODE_SWITCH_REQUEST,
  IPC_DSH_MODE_SWITCH_CONFIRM,
  IPC_DSH_TOAST,
} from '../shared/ipc-channels';

export type Channels = '';

const electronHandler = {
  ipcRenderer: {
    invoke: (channel: string, ...args: unknown[]) =>
      ipcRenderer.invoke(channel, ...args),
    sendMessage(channel: Channels, ...args: unknown[]) {
      ipcRenderer.send(channel, ...args);
    },
    on(channel: Channels, func: (...args: unknown[]) => void) {
      const subscription = (_event: IpcRendererEvent, ...args: unknown[]) =>
        func(...args);
      ipcRenderer.on(channel, subscription);

      return () => {
        ipcRenderer.removeListener(channel, subscription);
      };
    },
    once(channel: Channels, func: (...args: unknown[]) => void) {
      ipcRenderer.once(channel, (_event, ...args) => func(...args));
    },
  },
  utio: {
    shareReport: (params: UTIOPayload<'shareReport'>) =>
      ipcRenderer.invoke(IPC_UTIO_SHARE_REPORT, params),
  },
  setting: {
    getSetting: () => ipcRenderer.invoke(IPC_SETTING_GET),
    clearSetting: () => ipcRenderer.invoke(IPC_SETTING_CLEAR),
    updateSetting: (setting: Partial<LocalStore>) =>
      ipcRenderer.invoke(IPC_SETTING_UPDATE, setting),
    importPresetFromText: (yamlContent: string) =>
      ipcRenderer.invoke(IPC_SETTING_IMPORT_PRESET_FROM_TEXT, yamlContent),
    importPresetFromUrl: (url: string, autoUpdate: boolean) =>
      ipcRenderer.invoke(IPC_SETTING_IMPORT_PRESET_FROM_URL, url, autoUpdate),
    updatePresetFromRemote: () =>
      ipcRenderer.invoke(IPC_SETTING_UPDATE_PRESET_FROM_REMOTE),
    resetPreset: () => ipcRenderer.invoke(IPC_SETTING_RESET_PRESET),
    onUpdate: (callback: (setting: LocalStore) => void) => {
      const handler = (_, state) => callback(state);
      ipcRenderer.on(IPC_SETTING_UPDATED, handler);
      return () => {
        ipcRenderer.off(IPC_SETTING_UPDATED, handler);
      };
    },
  },
  windowControls: {
    minimize: () => ipcRenderer.invoke(IPC_WINDOW_MINIMIZE),
    maximize: () => ipcRenderer.invoke(IPC_WINDOW_MAXIMIZE),
    close: () => ipcRenderer.invoke(IPC_WINDOW_CLOSE),
    isMaximized: () => ipcRenderer.invoke(IPC_WINDOW_IS_MAXIMIZED),
  },
};

/** DSH 运行模式（与主进程 state.ts 保持一致）。 */
export type DshRunMode = 'builtin' | 'external';

/** DSH 门面：渲染进程通过 window.dsh 访问。 */
const dshApi = {
  /** 打开 DSH 窗口（首次触发懒加载 boot）。 */
  open: () => ipcRenderer.invoke(IPC_DSH_OPEN),
  /** 查询当前 DSH 状态：idle | booting | ready | error。 */
  getState: () => ipcRenderer.invoke(IPC_DSH_GET_STATE),
  /** 订阅 DSH 状态变更；返回退订函数。 */
  onStateChanged: (callback: (state: string) => void) => {
    const handler = (_event: unknown, state: string) => callback(state);
    ipcRenderer.on(IPC_DSH_STATE_CHANGED, handler);
    return () => {
      ipcRenderer.off(IPC_DSH_STATE_CHANGED, handler);
    };
  },
  /** 订阅切换 profile 请求（托盘点选后触发）；payload 含 profile 名与是否已 boot。 */
  onProfileSwitchRequest: (
    callback: (payload: { name: string; isBooted: boolean }) => void,
  ) => {
    const handler = (
      _event: unknown,
      payload: { name: string; isBooted: boolean },
    ) => callback(payload);
    ipcRenderer.on(IPC_DSH_PROFILE_SWITCH_REQUEST, handler);
    return () => {
      ipcRenderer.off(IPC_DSH_PROFILE_SWITCH_REQUEST, handler);
    };
  },
  /** 确认/取消切换 profile。 */
  confirmProfileSwitch: (name: string, confirmed: boolean) =>
    ipcRenderer.invoke(IPC_DSH_PROFILE_SWITCH_CONFIRM, { name, confirmed }),
  /** 订阅切换运行模式请求（托盘点选后触发）；返回退订函数。 */
  onModeSwitchRequest: (
    callback: (payload: {
      mode: DshRunMode;
      port?: number;
      needsStop?: boolean;
    }) => void,
  ) => {
    const handler = (
      _event: unknown,
      payload: { mode: DshRunMode; port?: number; needsStop?: boolean },
    ) => callback(payload);
    ipcRenderer.on(IPC_DSH_MODE_SWITCH_REQUEST, handler);
    return () => {
      ipcRenderer.off(IPC_DSH_MODE_SWITCH_REQUEST, handler);
    };
  },
  /** 确认/取消切换运行模式（external 时携带端口）。 */
  confirmModeSwitch: (
    mode: DshRunMode,
    port: number | undefined,
    confirmed: boolean,
  ) =>
    ipcRenderer.invoke(IPC_DSH_MODE_SWITCH_CONFIRM, { mode, port, confirmed }),
  /** 订阅 DSH 进度/结果 toast；返回退订函数。 */
  onToast: (callback: (payload: { message: string; type: string }) => void) => {
    const handler = (
      _event: unknown,
      payload: { message: string; type: string },
    ) => callback(payload);
    ipcRenderer.on(IPC_DSH_TOAST, handler);
    return () => {
      ipcRenderer.off(IPC_DSH_TOAST, handler);
    };
  },
};

export type DshApi = typeof dshApi;

// Initialize zustand bridge
const zustandBridge = {
  getState: () => ipcRenderer.invoke(IPC_GET_STATE),
  subscribe: (callback) => {
    const subscription = (_: unknown, state: AppState) => callback(state);
    ipcRenderer.on(IPC_SUBSCRIBE, subscription);

    return () => ipcRenderer.off(IPC_SUBSCRIBE, subscription);
  },
};

// Expose both electron and zutron handlers
contextBridge.exposeInMainWorld('electron', electronHandler);
contextBridge.exposeInMainWorld('zustandBridge', zustandBridge);
contextBridge.exposeInMainWorld('platform', process.platform);
contextBridge.exposeInMainWorld('dsh', dshApi);

export type ElectronHandler = typeof electronHandler;
