/**
 * Copyright (c) 2026 yingmingfeng
 *
 * 快捷键定义类型
 */

/** 快捷键定义 */
export interface ShortcutDefinition {
  /** 唯一标识，如 'sidebar.toggle' */
  id: string;
  /** 主键，如 'b'、'g'、'F12' */
  key: string;
  /** 修饰键 */
  modifiers: {
    ctrl?: boolean; // Win:Ctrl / macOS:Cmd
    shift?: boolean;
    alt?: boolean; // Win:Alt / macOS:Option
    meta?: boolean; // Win:Win / macOS:Cmd（通常与 ctrl 二选一）
  };
  /** 功能描述（中文） */
  description: string;
  /** 分组（用于设置界面分类展示） */
  category: 'general' | 'navigation' | 'view' | 'agent';
  /** 作用域：渲染进程 or 主进程 */
  scope: 'renderer' | 'main';
}
