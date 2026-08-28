/**
 * Copyright (c) 2026 yingmingfeng
 *
 * 主进程快捷键集中管理
 * 从共享映射表读取定义，统一注册所有主进程快捷键
 */
import { globalShortcut, app } from 'electron';

import { logger } from './logger';
import { DEFAULT_SHORTCUTS, toElectronAccelerator } from '@shared/shortcuts';

/**
 * 注册所有主进程快捷键
 * 在 app ready 后调用
 */
export function registerShortcuts(): void {
  // 只注册 scope 为 main 的快捷键
  const mainShortcuts = DEFAULT_SHORTCUTS.filter((s) => s.scope === 'main');

  for (const shortcut of mainShortcuts) {
    const accelerator = toElectronAccelerator(shortcut);

    // 冲突检测：检查是否已被系统或其他应用占用
    if (globalShortcut.isRegistered(accelerator)) {
      logger.warn(
        `[Shortcuts] 快捷键 "${accelerator}" (${shortcut.description}) 已被占用，跳过注册`,
      );
      continue;
    }

    // 注意：主进程快捷键的 handler 需要通过 IPC 通知渲染进程
    // 当前无主进程级快捷键，后续添加时需在此处实现 handler
    const success = globalShortcut.register(accelerator, () => {
      logger.info(`[Shortcuts] 触发: ${accelerator} → ${shortcut.description}`);
    });

    if (!success) {
      logger.error(
        `[Shortcuts] 快捷键 "${accelerator}" (${shortcut.description}) 注册失败`,
      );
    } else {
      logger.info(
        `[Shortcuts] 已注册: ${accelerator} → ${shortcut.description}`,
      );
    }
  }
}

/**
 * 注销所有主进程快捷键
 * 在 app will-quit 时调用
 */
export function unregisterShortcuts(): void {
  // globalShortcut 在 app ready 前不可用；未 ready 时 registerShortcuts 也没执行过，无需清理。
  if (!app.isReady()) return;
  globalShortcut.unregisterAll();
  logger.info('[Shortcuts] 已注销所有主进程快捷键');
}

/**
 * 检查指定快捷键是否可用（未被占用）
 * 用于添加新快捷键前的冲突预检
 */
export function isShortcutAvailable(
  shortcut: Pick<(typeof DEFAULT_SHORTCUTS)[number], 'key' | 'modifiers'>,
): boolean {
  return !globalShortcut.isRegistered(toElectronAccelerator(shortcut));
}

// 应用退出时自动清理
app.on('will-quit', () => {
  unregisterShortcuts();
});
