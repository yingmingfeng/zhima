import { useCallback, useMemo, useState } from 'react';
import { Outlet } from 'react-router';
import { PanelLeft, Search } from 'lucide-react';
import { AppSidebar } from '@/renderer/src/components/SideBar/app-sidebar';
import {
  SidebarInset,
  SidebarProvider,
  useSidebar,
} from '@renderer/components/ui/sidebar';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@renderer/components/ui/tooltip';
import { WindowControls } from '@renderer/components/Common/WindowControls';
import { SearchDialog } from '@renderer/components/SearchDialog';
import { isWindows } from '@renderer/utils/os';
import { useShortcuts } from '@renderer/hooks/useShortcuts';
import { DEFAULT_SHORTCUTS, formatShortcutLabel } from '@shared/shortcuts';

function Toolbar({
  onSearchClick,
  disableDrag,
}: {
  onSearchClick: () => void;
  disableDrag?: boolean;
}) {
  const { toggleSidebar, open } = useSidebar();

  // 从共享映射表动态读取快捷键标签
  const platform = isWindows ? 'win' : 'mac';
  const sidebarLabel = formatShortcutLabel(
    DEFAULT_SHORTCUTS.find((s) => s.id === 'sidebar.toggle')!,
    platform,
  );
  const searchLabel = formatShortcutLabel(
    DEFAULT_SHORTCUTS.find((s) => s.id === 'search.open')!,
    platform,
  );

  return (
    <div
      className="relative z-20 flex h-14 shrink-0 items-center pl-2"
      style={{
        '-webkit-app-region': isWindows && !disableDrag ? 'drag' : 'no-drag',
      }}
    >
      {/* 左侧：侧边栏切换 + 搜索 */}
      <div
        className="px-2 flex items-center gap-2"
        style={{ '-webkit-app-region': 'no-drag' }}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-black/8 dark:hover:bg-white/10"
              onClick={toggleSidebar}
            >
              <PanelLeft size={16} className="text-sidebar-foreground" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={0}>
            <span>{open ? '隐藏任务栏' : '显示任务栏'}</span>
            <kbd className="ml-2 text-xs text-text-tertiary">
              {sidebarLabel}
            </kbd>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-black/8 dark:hover:bg-white/10"
              onClick={onSearchClick}
            >
              <Search size={16} className="text-sidebar-foreground" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={0}>
            <span>搜索</span>
            <kbd className="ml-2 text-xs text-text-tertiary">{searchLabel}</kbd>
          </TooltipContent>
        </Tooltip>
      </div>

      {/* 分隔线 */}
      <div className="mx-1.5 h-5 w-px shrink-0 bg-border" />

      {/* 中间：留空区域（预留给未来功能） */}
      <div className="flex flex-1 items-center" />

      {/* 右侧：窗口控制按钮 */}
      {isWindows && <WindowControls />}
    </div>
  );
}

/** 快捷键注册器（放在 SidebarProvider 内部，可访问 useSidebar） */
function ShortcutRegistrar({ onToggleSearch }: { onToggleSearch: () => void }) {
  const { toggleSidebar } = useSidebar();

  const handlers = useMemo(
    () => ({
      'sidebar.toggle': toggleSidebar,
      'search.open': onToggleSearch,
    }),
    [toggleSidebar, onToggleSearch],
  );
  useShortcuts(handlers);

  return null;
}

export function MainLayout() {
  const [searchOpen, setSearchOpen] = useState(false);
  const toggleSearch = useCallback(() => setSearchOpen((prev) => !prev), []);

  return (
    <SidebarProvider
      style={{ '--sidebar-width-icon': '72px' }}
      className="flex h-screen w-full flex-col bg-sidebar"
    >
      <ShortcutRegistrar onToggleSearch={toggleSearch} />
      <Toolbar
        onSearchClick={() => setSearchOpen(true)}
        disableDrag={searchOpen}
      />
      <div className="flex flex-1 overflow-hidden">
        <AppSidebar />
        <SidebarInset className="flex-1 bg-background">
          <Outlet />
        </SidebarInset>
      </div>
      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </SidebarProvider>
  );
}
