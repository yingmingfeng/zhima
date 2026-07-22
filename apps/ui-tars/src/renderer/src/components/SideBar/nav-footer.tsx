/**
 * Copyright (c) 2026 yingmingfeng
 * SPDX-License-Identifier: Apache-2.0
 *
 * 侧边栏底部：设置入口 + 更新按钮
 */
import { Settings, Download } from 'lucide-react';

import {
  SidebarMenu,
  SidebarMenuButton,
} from '@renderer/components/ui/sidebar';

interface NavSettingsProps {
  onClick: () => void;
}

export function NavSettings({ onClick }: NavSettingsProps) {
  return (
    <div className="flex items-center justify-between px-3 py-2">
      {/* 左侧：设置图标（头像占位） */}
      <SidebarMenu>
        <SidebarMenuButton
          className="!h-auto !p-1.5 hover:bg-neutral-100"
          onClick={onClick}
        >
          <Settings className="w-4 h-4 text-neutral-500" />
        </SidebarMenuButton>
      </SidebarMenu>

      {/* 右侧：更新按钮 */}
      <button
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-neutral-800 text-white text-xs font-medium hover:bg-neutral-700 transition-colors cursor-pointer"
        title="检查更新"
      >
        <Download className="w-3.5 h-3.5" />
        <span>更新</span>
      </button>
    </div>
  );
}
