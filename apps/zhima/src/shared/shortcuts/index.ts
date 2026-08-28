/**
 * Copyright (c) 2026 yingmingfeng
 *
 * 快捷键映射表（主进程/渲染进程共享）
 * 所有快捷键定义集中在此，通过工具函数转换为各进程所需格式
 */
import type { ShortcutDefinition } from './types';

export type { ShortcutDefinition } from './types';

/**
 * 默认快捷键映射表
 * 新增快捷键时在此数组中添加即可
 * 用户自定义快捷键后续可通过覆盖此表实现
 */
export const DEFAULT_SHORTCUTS: ShortcutDefinition[] = [
  {
    id: 'sidebar.toggle',
    key: 'b',
    modifiers: { ctrl: true },
    description: '切换侧边栏',
    category: 'view',
    scope: 'renderer',
  },
  {
    id: 'search.open',
    key: 'g',
    modifiers: { ctrl: true },
    description: '打开搜索对话框',
    category: 'navigation',
    scope: 'renderer',
  },
];

/**
 * 将快捷键定义转换为 Electron globalShortcut 的 accelerator 格式
 * 主进程使用
 *
 * @example
 * toElectronAccelerator({ key: 'b', modifiers: { ctrl: true } })
 * // => 'CommandOrControl+B'
 * toElectronAccelerator({ key: 'p', modifiers: { ctrl: true, shift: true } })
 * // => 'CommandOrControl+Shift+P'
 */
export function toElectronAccelerator(
  shortcut: Pick<ShortcutDefinition, 'key' | 'modifiers'>,
): string {
  const parts: string[] = [];
  if (shortcut.modifiers.ctrl) parts.push('CommandOrControl');
  if (shortcut.modifiers.shift) parts.push('Shift');
  if (shortcut.modifiers.alt) parts.push('Alt');
  if (shortcut.modifiers.meta) parts.push('Super');
  parts.push(
    shortcut.key.length === 1 ? shortcut.key.toUpperCase() : shortcut.key,
  );
  return parts.join('+');
}

/**
 * 判断 KeyboardEvent 是否匹配快捷键定义
 * 渲染进程使用
 *
 * 注意：ctrl 修饰键在 macOS 上自动匹配 metaKey（Cmd），
 * 因为 macOS 用户习惯用 Cmd 而非 Ctrl
 */
export function matchesEvent(
  shortcut: Pick<ShortcutDefinition, 'key' | 'modifiers'>,
  e: KeyboardEvent,
): boolean {
  const m = shortcut.modifiers;
  // ctrl 修饰键同时匹配 ctrlKey 和 metaKey（跨平台兼容）
  const ctrlOk = m.ctrl ? e.ctrlKey || e.metaKey : !e.ctrlKey && !e.metaKey;
  const shiftOk = m.shift ? e.shiftKey : !e.shiftKey;
  const altOk = m.alt ? e.altKey : !e.altKey;
  const metaOk = m.meta ? e.metaKey : true; // meta 通常与 ctrl 互斥，不做强制排除
  return (
    ctrlOk &&
    shiftOk &&
    altOk &&
    metaOk &&
    e.key.toLowerCase() === shortcut.key.toLowerCase()
  );
}

/**
 * 将快捷键定义格式化为展示标签（用于 Tooltip / 设置界面）
 *
 * @example
 * formatShortcutLabel({ key: 'b', modifiers: { ctrl: true } }, 'win')
 * // => 'Ctrl+B'
 * formatShortcutLabel({ key: 'b', modifiers: { ctrl: true } }, 'mac')
 * // => '⌘B'
 */
export function formatShortcutLabel(
  shortcut: Pick<ShortcutDefinition, 'key' | 'modifiers'>,
  platform: 'win' | 'mac' = 'win',
): string {
  const m = shortcut.modifiers;
  const parts: string[] = [];

  if (platform === 'mac') {
    if (m.ctrl) parts.push('⌃');
    if (m.alt) parts.push('⌥');
    if (m.shift) parts.push('⇧');
    if (m.ctrl || m.meta) parts.push('⌘');
  } else {
    if (m.ctrl || m.meta) parts.push('Ctrl');
    if (m.shift) parts.push('Shift');
    if (m.alt) parts.push('Alt');
  }

  // 主键首字母大写
  const displayKey =
    shortcut.key.length === 1 ? shortcut.key.toUpperCase() : shortcut.key;
  parts.push(displayKey);

  return platform === 'mac' ? parts.join('') : parts.join('+');
}
