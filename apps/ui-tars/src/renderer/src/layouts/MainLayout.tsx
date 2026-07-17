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
import { cn } from '@renderer/utils';

function Toolbar() {
  const { toggleSidebar } = useSidebar();

  return (
    <div
      className={cn(
        'relative z-20 flex h-14 shrink-0 items-center pl-1.5',
        isWindows
          ? 'bg-[#F5F5F5] dark:bg-[#262626]'
          : 'bg-white dark:bg-[#171717]',
      )}
      style={{ '-webkit-app-region': isWindows ? 'drag' : 'no-drag' }}
    >
      {/* Left: sidebar toggle + search */}
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

      {/* Separator */}
      <div className="mx-1.5 h-5 w-px shrink-0 bg-border" />

      {/* Middle: empty space (for future features) */}
      <div
        className="flex flex-1 items-center"
        style={{ '-webkit-app-region': isWindows ? 'drag' : 'no-drag' }}
      />

      {/* Right: window controls */}
      {isWindows && <WindowControls />}
    </div>
  );
}

export function MainLayout() {
  return (
    <SidebarProvider
      style={{ '--sidebar-width-icon': '72px' }}
      className="flex h-screen w-full flex-col"
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
