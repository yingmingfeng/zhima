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
      ipcRenderer.on(IPC_SETTING_UPDATED, (_, state) => callback(state));
    },
  },
  windowControls: {
    minimize: () => ipcRenderer.invoke(IPC_WINDOW_MINIMIZE),
    maximize: () => ipcRenderer.invoke(IPC_WINDOW_MAXIMIZE),
    close: () => ipcRenderer.invoke(IPC_WINDOW_CLOSE),
    isMaximized: () => ipcRenderer.invoke(IPC_WINDOW_IS_MAXIMIZED),
  },
};

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

export type ElectronHandler = typeof electronHandler;
