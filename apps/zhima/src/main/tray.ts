/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { Menu, Tray, app, nativeImage } from 'electron';
import path from 'path';

import { StatusEnum } from '@zhima/shared/types';

import { exportLogs } from '@main/logger';
import { showWindow } from '@main/window';

import { store } from './store/create';
import { server } from '@main/ipcRoutes';
import { IPC_DSH_MODE_SWITCH_REQUEST } from '../shared/ipc-channels';

import {
  checkPluginChangesNow,
  getDshState,
  isDshBackendRunning,
  restartDshSession,
} from './dsh';
import { getDshRunMode, getExternalDshPort } from './dsh/state';
import { windowManager } from './services/windowManager';

export let tray: Tray | null = null;

/** 请求渲染进程确认/输入切换运行模式（附带当前端口）。 */
function requestModeSwitch(mode: 'builtin' | 'external'): void {
  void showWindow();
  windowManager.broadcast(IPC_DSH_MODE_SWITCH_REQUEST, {
    mode,
    port: getExternalDshPort(),
  });
}

/**
 * 构建托盘右键菜单（每次右键重建，保证 radio 勾选/置灰最新）。
 * zhima 固定用 zhima-desktop profile + 增强模式，故无 profile/窗口模式切换；
 * 仅保留运行模式（内置/外部）与插件重载。
 */
function buildTrayMenu(): Menu {
  const isBooting = getDshState() === 'booting';
  const mode = getDshRunMode();

  const running = isDshBackendRunning();
  const builtinLabel = running ? '内置模式 · 运行中' : '内置模式 · 空闲';
  // 顶层菜单标题带「二级状态」，便于一眼看清当前所处模式（与子菜单 radio 一致）。
  const dshModeLabel =
    mode === 'builtin'
      ? `DSH 模式（内置 · ${running ? '运行中' : '空闲'}）`
      : 'DSH 模式（外部）';
  const modeSubmenu: Electron.MenuItemConstructorOptions[] = [
    {
      label: builtinLabel,
      type: 'radio',
      checked: mode === 'builtin',
      click: () => {
        if (mode !== 'builtin') requestModeSwitch('builtin');
      },
    },
    {
      label:
        mode === 'external'
          ? `外部模式（端口 ${getExternalDshPort()}）`
          : '外部模式',
      type: 'radio',
      checked: mode === 'external',
      click: () => {
        if (mode !== 'external') requestModeSwitch('external');
      },
    },
  ];

  const template: Electron.MenuItemConstructorOptions[] = [
    { label: '打开 zhima', click: () => showWindow() },
    { label: '导出 zhima 日志', click: () => exportLogs() },
    { type: 'separator' },
    { label: dshModeLabel, submenu: modeSubmenu },
    // 重新加载插件：仅内置树在跑时出现（配合外部 add/remove 插件后的生效）。
    ...(mode === 'builtin' && running
      ? [
          {
            label: '检查插件变更',
            enabled: !isBooting,
            click: () => {
              void checkPluginChangesNow();
            },
          },
          {
            label: isBooting
              ? '重新加载插件（切换中…）'
              : '重新加载插件',
            enabled: !isBooting,
            click: () => {
              void restartDshSession();
            },
          },
        ]
      : []),
    { type: 'separator' },
    { label: '退出', click: () => app.quit() },
  ];

  return Menu.buildFromTemplate(template);
}

export async function createTray() {
  // 创建两种状态的图标
  const normalIcon = nativeImage
    .createFromPath(path.join(__dirname, '../../resources/logo-vector.png'))
    .resize({ width: 32, height: 32 });

  const pauseIcon = nativeImage
    .createFromPath(
      path.join(__dirname, '../../resources/tray-pause-light.png'),
    )
    .resize({ width: 16, height: 16 });

  tray = new Tray(normalIcon);
  // 初始化状态
  tray?.setImage(normalIcon);

  // 点击处理函数（RUNNING 时点击 = 停止运行）
  const handleTrayClick = async () => {
    await server.stopRun();
  };

  // 监听状态变化
  store?.subscribe((state, prevState) => {
    if (state.status !== prevState.status) {
      if (state.status === StatusEnum.RUNNING) {
        tray?.setImage(pauseIcon);
        tray?.on('click', handleTrayClick);
      } else {
        tray?.setImage(normalIcon);
        tray?.removeListener('click', handleTrayClick);
      }
    }
  });

  // 右键动态弹出菜单（每次重建，保证 DSH 模式 radio 勾选与置灰最新）
  tray.on('right-click', () => {
    tray?.popUpContextMenu(buildTrayMenu());
  });

  return tray;
}