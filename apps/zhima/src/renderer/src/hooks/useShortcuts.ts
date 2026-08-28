/**
 * Copyright (c) 2026 yingmingfeng
 *
 * 渲染进程快捷键 hook
 * 从共享映射表读取定义，统一注册所有渲染进程快捷键
 */
import { useEffect } from 'react';

import { DEFAULT_SHORTCUTS, matchesEvent } from '@shared/shortcuts';

/**
 * 渲染进程快捷键 hook
 * 在 MainLayout 的 ShortcutRegistrar 中调用，集中注册所有快捷键
 *
 * @param handlers - 快捷键处理器映射，key 为 shortcut id（如 'sidebar.toggle'）
 */
export function useShortcuts(handlers: Record<string, () => void>): void {
  useEffect(() => {
    // 只注册 scope 为 renderer 的快捷键
    const rendererShortcuts = DEFAULT_SHORTCUTS.filter(
      (s) => s.scope === 'renderer',
    );

    const handleKeyDown = (e: KeyboardEvent) => {
      for (const shortcut of rendererShortcuts) {
        if (matchesEvent(shortcut, e)) {
          e.preventDefault();
          const handler = handlers[shortcut.id];
          handler?.();
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlers]);
}
