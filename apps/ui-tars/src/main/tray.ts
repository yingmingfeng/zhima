/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { Menu, Tray, app, nativeImage } from 'electron';
import path from 'path';

import { StatusEnum } from '@ui-tars/shared/types';

import { exportLogs } from '@main/logger';
import { showWindow } from '@main/window';

import { store } from './store/create';
import { server } from '@main/ipcRoutes';

import {
  IPC_DSH_MODE_SWITCH_REQUEST,
  IPC_DSH_PROFILE_SWITCH_REQUEST,
  IPC_DSH_PROFILE_CREATE_REQUEST,
  IPC_DSH_SHELL_MODE_SWITCH_REQUEST,
} from '../shared/ipc-channels';

import { checkPluginChangesNow, getDshState, restartDshSession } from './dsh';
import { listDshProfiles } from './dsh/profile';
import {
  getDshRunMode,
  getDshShellMode,
  getExternalDshPort,
  getSelectedDshProfile,
  type DshShellMode,
} from './dsh/state';
import { isDshSessionRunning } from './dsh/boot';
import { getActiveDshCtx } from './dsh/boot';
import { windowManager } from './services/windowManager';

export let tray: Tray | null = null;

/** 请求渲染进程确认切换 profile（主窗口 show + dialog 询问，仅已 boot 时询问）。 */
function requestProfileSwitch(name: string): void {
  void showWindow();
  windowManager.broadcast(IPC_DSH_PROFILE_SWITCH_REQUEST, {
    name,
    isBooted: isDshSessionRunning(),
  });
}

/** 请求渲染进程确认/输入切换运行模式（附带当前端口与是否需要停止内置 boot）。 */
function requestModeSwitch(mode: 'builtin' | 'external'): void {
  void showWindow();
  windowManager.broadcast(IPC_DSH_MODE_SWITCH_REQUEST, {
    mode,
    port: getExternalDshPort(),
    needsStop: mode === 'external' && getActiveDshCtx() !== undefined,
  });
}

/** 请求渲染进程确认切换窗口呈现模式（兼容/增强，重启 DSH 会话）。 */
function requestShellModeSwitch(mode: DshShellMode): void {
  void showWindow();
  windowManager.broadcast(IPC_DSH_SHELL_MODE_SWITCH_REQUEST, { mode });
}

/** 构建托盘右键菜单（每次右键重建，保证 radio 勾选/置灰最新）。 */
function buildTrayMenu(): Menu {
  const isBooting = getDshState() === 'booting';
  const mode = getDshRunMode();
  const currentProfile = getSelectedDshProfile();

  const running = getActiveDshCtx() !== undefined;
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

  const shellMode = getDshShellMode();
  const shellModeLabel = isBooting
    ? '窗口模式（切换中…）'
    : `窗口模式（${shellMode === 'advanced' ? '增强' : '兼容'}）`;
  const profileLabel = isBooting
    ? '配置文件（切换中…）'
    : `配置文件（${currentProfile}）`;

  // 窗口模式子菜单：仅内置模式（advanced-shell 插件由 builtin boot 注入）。
  const shellModeSubmenu: Electron.MenuItemConstructorOptions[] = [
    {
      label: '兼容模式',
      type: 'radio',
      checked: shellMode === 'compatibility',
      enabled: !isBooting,
      click: () => {
        if (shellMode !== 'compatibility')
          requestShellModeSwitch('compatibility');
      },
    },
    {
      label: '增强模式',
      type: 'radio',
      checked: shellMode === 'advanced',
      enabled: !isBooting,
      click: () => {
        if (shellMode !== 'advanced') requestShellModeSwitch('advanced');
      },
    },
  ];

  // 配置文件子菜单仅在内置模式显示；切换中（booting）整体置灰。
  const profileSubmenu: Electron.MenuItemConstructorOptions[] = [
    ...listDshProfiles().map((profile) => ({
      label: profile.name,
      type: 'radio' as const,
      checked: profile.name === currentProfile,
      enabled: !isBooting,
      click: () => {
        if (profile.name !== currentProfile) requestProfileSwitch(profile.name);
      },
    })),
    { type: 'separator' as const },
    {
      label: '新建配置文件…',
      click: () => {
        void showWindow();
        windowManager.broadcast(IPC_DSH_PROFILE_CREATE_REQUEST, undefined);
      },
    },
  ];

  const template: Electron.MenuItemConstructorOptions[] = [
    { label: '打开 zhima', click: () => showWindow() },
    { label: '导出 zhima 日志', click: () => exportLogs() },
    { type: 'separator' },
    { label: dshModeLabel, submenu: modeSubmenu },
    ...(mode === 'builtin'
      ? [
          {
            label: shellModeLabel,
            enabled: !isBooting,
            submenu: shellModeSubmenu,
          },
          {
            label: profileLabel,
            enabled: !isBooting,
            submenu: profileSubmenu,
          },
          // 重新加载插件：仅内置树在跑时出现（配合外置 add/remove 插件后的生效）。
          ...(running
            ? [
                {
                  label: `检查插件变更（${currentProfile}）`,
                  enabled: !isBooting,
                  click: () => {
                    void checkPluginChangesNow();
                  },
                },
                {
                  label: isBooting ? '重新加载插件（切换中…）' : '重新加载插件',
                  enabled: !isBooting,
                  click: () => {
                    void restartDshSession();
                  },
                },
              ]
            : []),
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

  // 右键动态弹出菜单（每次重建，保证 DSH profile/模式 radio 勾选与置灰最新）
  tray.on('right-click', () => {
    tray?.popUpContextMenu(buildTrayMenu());
  });

  return tray;
}
