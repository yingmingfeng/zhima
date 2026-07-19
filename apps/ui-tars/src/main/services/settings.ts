/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { ipcMain } from 'electron';
import { SettingStore } from '../store/setting';
import { logger } from '../logger';
import { LocalStore } from '@main/store/validate';
import {
  IPC_SETTING_GET,
  IPC_SETTING_CLEAR,
  IPC_SETTING_RESET_PRESET,
  IPC_SETTING_UPDATE,
  IPC_SETTING_IMPORT_PRESET_FROM_TEXT,
  IPC_SETTING_IMPORT_PRESET_FROM_URL,
  IPC_SETTING_UPDATE_PRESET_FROM_REMOTE,
} from '../../shared/ipc-channels';

export function registerSettingsHandlers() {
  /**
   * Get setting
   */
  ipcMain.handle(IPC_SETTING_GET, () => {
    return SettingStore.getStore();
  });

  /**
   * Clear setting
   */
  ipcMain.handle(IPC_SETTING_CLEAR, () => {
    SettingStore.clear();
  });

  /**
   * Reset setting preset
   */
  ipcMain.handle(IPC_SETTING_RESET_PRESET, () => {
    SettingStore.getInstance().delete('presetSource');
  });

  /**
   * Update setting
   */
  ipcMain.handle(IPC_SETTING_UPDATE, async (_, settings: LocalStore) => {
    SettingStore.setStore(settings);
  });

  /**
   * Import setting preset from text
   */
  ipcMain.handle(
    IPC_SETTING_IMPORT_PRESET_FROM_TEXT,
    async (_, yamlContent) => {
      try {
        const newSettings =
          await SettingStore.importPresetFromText(yamlContent);
        SettingStore.setStore(newSettings);
      } catch (error) {
        logger.error('Failed to import preset:', error);
        throw error;
      }
    },
  );

  /**
   * Import setting preset from url
   */
  ipcMain.handle(
    IPC_SETTING_IMPORT_PRESET_FROM_URL,
    async (_, url, autoUpdate) => {
      try {
        const newSettings = await SettingStore.fetchPresetFromUrl(url);
        SettingStore.setStore({
          ...newSettings,
          presetSource: {
            type: 'remote',
            url: url,
            autoUpdate: autoUpdate,
            lastUpdated: Date.now(),
          },
        });
      } catch (error) {
        logger.error('Failed to import preset from URL:', error);
        throw error;
      }
    },
  );

  /**
   * Update setting preset from url
   */
  ipcMain.handle(IPC_SETTING_UPDATE_PRESET_FROM_REMOTE, async () => {
    const settings = SettingStore.getStore();
    if (settings.presetSource?.type === 'remote' && settings.presetSource.url) {
      const newSettings = await SettingStore.fetchPresetFromUrl(
        settings.presetSource.url,
      );
      SettingStore.setStore({
        ...newSettings,
        presetSource: {
          type: 'remote',
          url: settings.presetSource.url,
          autoUpdate: settings.presetSource.autoUpdate,
          lastUpdated: Date.now(),
        },
      });
    } else {
      throw new Error('No remote preset configured');
    }
  });
}
