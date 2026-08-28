/**
 * 侧边栏 Tab 切换栏
 * 使用 animated-tabs 实现滑动指示器动画
 * Tab 值与路由前缀一一对应：work / computer / browser
 */
import { useLocation, useNavigate } from 'react-router';
import { useMemo } from 'react';
import { BookOpen, Monitor, Globe } from 'lucide-react';

import {
  Tabs,
  TabsList,
  TabsTrigger,
} from '@renderer/components/ui/animated-tabs';

export type SidebarTab = 'work' | 'computer' | 'browser';

/** 从当前 URL 路径推导所属 tab */
export function getTabFromPath(pathname: string): SidebarTab {
  if (pathname.startsWith('/computer')) return 'computer';
  if (pathname.startsWith('/browser')) return 'browser';
  return 'work';
}

/** tab → 该 tab 下「新建任务」的首页路径 */
export function getTabHomePath(tab: SidebarTab): string {
  return `/${tab}`;
}

const tabs: { value: SidebarTab; label: string; icon: typeof BookOpen }[] = [
  { value: 'work', label: 'Work', icon: BookOpen },
  { value: 'computer', label: 'Computer', icon: Monitor },
  { value: 'browser', label: 'Browser', icon: Globe },
];

const TAB_INDEX: Record<string, number> = { work: 0, computer: 1, browser: 2 };

export function NavTabs() {
  const location = useLocation();
  const navigate = useNavigate();
  const activeTab = useMemo(
    () => getTabFromPath(location.pathname),
    [location.pathname],
  );

  return (
    <Tabs
      value={activeTab}
      onValueChange={(v) => navigate(getTabHomePath(v as SidebarTab))}
      getOrder={(v) => TAB_INDEX[v] ?? 0}
    >
      <TabsList className="ml-[7px] mr-2 h-auto w-fit">
        {tabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value} className="px-2 py-1">
            <span className="flex items-center justify-center w-0 mr-0.5 overflow-hidden opacity-0 transition-all duration-150 ease-out group-data-[state=active]:w-4 group-data-[state=active]:mr-[5px] group-data-[state=active]:mt-[0.5px] group-data-[state=active]:opacity-100 shrink-0">
              <tab.icon className="w-4 h-4" />
            </span>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
