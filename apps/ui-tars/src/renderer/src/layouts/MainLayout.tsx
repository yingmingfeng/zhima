import { useEffect, useState } from 'react';
import { Outlet } from 'react-router';
import { PanelLeft, Search, Menu } from 'lucide-react';
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

function Toolbar({
  onSearchClick,
  disableDrag,
}: {
  onSearchClick: () => void;
  disableDrag?: boolean;
}) {
  const { toggleSidebar, open } = useSidebar();

  // 监听 Ctrl+B 快捷键切换侧边栏
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'b') {
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleSidebar]);

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
            <button className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-black/8 dark:hover:bg-white/10">
              <Menu size={16} className="text-sidebar-foreground" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={4}>
            <span>更多</span>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-black/8 dark:hover:bg-white/10"
              onClick={toggleSidebar}
            >
              <PanelLeft size={16} className="text-sidebar-foreground" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={4}>
            <span>{open ? '隐藏任务栏' : '显示任务栏'}</span>
            <kbd className="ml-2 text-xs text-text-tertiary">Ctrl B</kbd>
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
          <TooltipContent side="bottom" sideOffset={4}>
            <span>搜索</span>
            <kbd className="ml-2 text-xs text-text-tertiary">Ctrl G</kbd>
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

export function MainLayout() {
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <SidebarProvider
      style={{ '--sidebar-width-icon': '72px' }}
      className="flex h-screen w-full flex-col bg-sidebar"
    >
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
