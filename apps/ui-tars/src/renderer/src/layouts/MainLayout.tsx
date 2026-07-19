import { Outlet } from 'react-router';
import { PanelLeft, Search } from 'lucide-react';
import { AppSidebar } from '@/renderer/src/components/SideBar/app-sidebar';
import {
  SidebarInset,
  SidebarProvider,
  useSidebar,
} from '@renderer/components/ui/sidebar';
import { WindowControls } from '@renderer/components/Common/WindowControls';
import { isWindows } from '@renderer/utils/os';

function Toolbar() {
  const { toggleSidebar } = useSidebar();

  return (
    <div
      className="relative z-20 flex h-14 shrink-0 items-center pl-1.5"
      style={{ '-webkit-app-region': isWindows ? 'drag' : 'no-drag' }}
    >
      {/* 左侧：侧边栏切换 + 搜索 */}
      <div
        className="px-2 flex items-center gap-2"
        style={{ '-webkit-app-region': 'no-drag' }}
      >
        <button
          className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-black/8 dark:hover:bg-white/10"
          onClick={toggleSidebar}
          title="Toggle Sidebar"
        >
          <PanelLeft size={16} className="text-[#404040] dark:text-[#a1a1a1]" />
        </button>
        <button
          className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-black/8 dark:hover:bg-white/10"
          title="Search"
        >
          <Search size={16} className="text-[#404040] dark:text-[#a1a1a1]" />
        </button>
      </div>

      {/* 分隔线 */}
      <div className="mx-1.5 h-5 w-px shrink-0 bg-border" />

      {/* 中间：留空区域（预留给未来功能） */}
      <div
        className="flex flex-1 items-center"
        style={{ '-webkit-app-region': isWindows ? 'drag' : 'no-drag' }}
      />

      {/* 右侧：窗口控制按钮 */}
      {isWindows && <WindowControls />}
    </div>
  );
}

export function MainLayout() {
  return (
    <SidebarProvider
      style={{ '--sidebar-width-icon': '72px' }}
      className="flex h-screen w-full flex-col bg-sidebar"
    >
      <Toolbar />
      <div className="flex flex-1 overflow-hidden">
        <AppSidebar />
        <SidebarInset className="flex-1 bg-background">
          <Outlet />
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
