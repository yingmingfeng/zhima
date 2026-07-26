/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from 'react';
import { useLocation, useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import { MessageCirclePlus, Clock, LayoutGrid } from 'lucide-react';

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@renderer/components/ui/sidebar';
import { DragArea } from '@renderer/components/Common/drag';
import { useSession } from '@renderer//hooks/useSession';

import { NavHistory } from './nav-history';
import { NavSettings } from './nav-footer';
import { NavTabs, getTabFromPath, type SidebarTab } from './nav-tabs';

import { Operator } from '@main/store/types';
import { useGlobalSettings, GlobalSettings } from '../Settings/global';
import { useStore } from '../../hooks/useStore';
import { StatusEnum } from '@ui-tars/sdk';
import { NavDialog } from '../AlertDialog/navDialog';
import { api } from '../../api';

/** tab → 对应的 Operator 类型（用于过滤任务列表） */
const TAB_OPERATOR_MAP: Record<SidebarTab, Operator[]> = {
  work: [Operator.LocalComputer],
  computer: [Operator.RemoteComputer],
  browser: [Operator.RemoteBrowser, Operator.LocalBrowser],
};

/** tab 顺序索引，用于判断滑动方向 */
const TAB_ORDER: Record<SidebarTab, number> = {
  work: 0,
  computer: 1,
  browser: 2,
};

export function AppSidebar({ ...props }: ComponentProps<typeof Sidebar>) {
  const { currentSessionId, sessions, getSession, deleteSession } =
    useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const { openSettings } = useGlobalSettings();
  const { status } = useStore();
  const [isNavDialogOpen, setNavDialogOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<{
    type: 'session';
    id: string;
  } | null>(null);

  // 按 tab 保存 session 列表展开状态，切换 tab 时恢复
  const [tabFolderOpen, setTabFolderOpen] = useState<
    Record<SidebarTab, boolean>
  >({
    work: true,
    computer: true,
    browser: true,
  });

  // 底部渐变是否显示（内容可滚动且未到底部时显示）
  const [showGradient, setShowGradient] = useState(false);
  const handleScrollStateChange = useCallback((show: boolean) => {
    setShowGradient(show);
  }, []);

  const needsConfirm =
    status === StatusEnum.RUNNING ||
    status === StatusEnum.CALL_USER ||
    status === StatusEnum.PAUSE;

  // 当前激活的 Tab（从 URL 推导）
  const activeTab = useMemo(
    () => getTabFromPath(location.pathname),
    [location.pathname],
  );

  // 记录上一个 tab 和方向，用于判断动画方向（仅在 tab 切换时使用）
  // 用 ref 捕获切换瞬间的方向值，避免 mode="wait" 导致新元素挂载时 direction 已重置为 0
  const prevTabRef = useRef<SidebarTab | null>(null);
  const directionRef = useRef(0);

  if (prevTabRef.current !== null && prevTabRef.current !== activeTab) {
    directionRef.current =
      TAB_ORDER[activeTab] > TAB_ORDER[prevTabRef.current] ? 1 : -1;
  }
  prevTabRef.current = activeTab;

  // 纯水平滑动动画（无淡入淡出）
  // 使用函数式 variants：在动画解析时（而非渲染时）读取 directionRef，
  // 确保 AnimatePresence exit 动画能拿到最新方向值
  const slideVariants = useMemo(
    () => ({
      initial: (dir: number) => ({ x: dir * 30, opacity: 0 }),
      animate: { x: 0, opacity: 1 },
      exit: (dir: number) => ({ x: dir * -30, opacity: 0 }),
    }),
    [],
  );

  // 导航项：路径随 tab 切换（/work/plugin-market 等）
  const navItems = useMemo(
    () => [
      { title: '新建任务', icon: MessageCirclePlus, path: `/${activeTab}` },
      {
        title: '插件市场',
        icon: LayoutGrid,
        path: `/${activeTab}/plugin-market`,
      },
      { title: '自动化', icon: Clock, path: `/${activeTab}/automation` },
    ],
    [activeTab],
  );

  // 按 tab 过滤任务列表
  const filteredSessions = useMemo(() => {
    const allowedOps = TAB_OPERATOR_MAP[activeTab];
    return sessions.filter((s) => {
      const op = s.meta.operator || Operator.LocalComputer;
      return allowedOps.includes(op);
    });
  }, [sessions, activeTab]);

  /** 判断导航项是否处于 active 状态 */
  const isActive = (path: string) => location.pathname === path;

  const onSessionClick = useCallback(
    async (sessionId: string) => {
      const session = await getSession(sessionId);
      if (!session) return;

      const operator = session.meta.operator || Operator.LocalComputer;
      const isFree = session.meta.isFree ?? true;

      const getRouter = () => {
        if (
          operator === Operator.RemoteBrowser ||
          operator === Operator.RemoteComputer
        ) {
          if (isFree) {
            return '/free-remote';
          }
          return '/paid-remote';
        }

        return '/local';
      };

      navigate(getRouter(), {
        state: {
          operator,
          sessionId,
          isFree,
          from: 'history',
        },
      });
    },
    [getSession, navigate],
  );

  const handleNavClick = useCallback(
    (path: string) => {
      navigate(path);
    },
    [navigate],
  );

  const handleSessionClick = useCallback(
    (sessionId: string) => {
      if (needsConfirm) {
        setPendingAction({ type: 'session', id: sessionId });
        setNavDialogOpen(true);
      } else {
        onSessionClick(sessionId);
      }
    },
    [needsConfirm],
  );

  const onConfirm = useCallback(async () => {
    await api.stopRun();
    await api.clearHistory();

    if (pendingAction?.type === 'session') {
      await onSessionClick(pendingAction.id);
    }
    setPendingAction(null);
    setNavDialogOpen(false);
  }, [pendingAction, onSessionClick]);

  const onCancel = useCallback(() => {
    setPendingAction(null);
    setNavDialogOpen(false);
  }, []);

  const onSessionDelete = useCallback(
    async (sessionId: string) => {
      const wasCurrent = currentSessionId === sessionId;
      await deleteSession(sessionId);
      if (wasCurrent) {
        // deleteSession 已经清理了状态，导航回当前 tab 首页
        await navigate(`/${activeTab}`);
      }
    },
    [currentSessionId, deleteSession, navigate, activeTab],
  );

  return (
    <>
      <Sidebar
        variant="inset"
        collapsible="offcanvas"
        className="select-none border-r-0 pt-14"
        {...props}
      >
        <DragArea></DragArea>
        {/* Tab 切换栏 */}
        <div className="px-0 pt-0.5 pb-2.5">
          <NavTabs />
        </div>
        <SidebarContent className="gap-1 !overflow-hidden relative">
          {/* 底部滚动提示渐变：滚动到底部或无需滚动时隐藏 */}
          <div
            className="absolute bottom-0 left-0 right-0 h-24 z-10 pointer-events-none"
            style={{
              display: showGradient ? 'block' : 'none',
              background:
                'linear-gradient(to bottom, transparent 0%, var(--sidebar) 100%)',
            }}
          />
          <AnimatePresence mode="wait" custom={directionRef.current}>
            <motion.div
              key={activeTab}
              custom={directionRef.current}
              variants={slideVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="flex flex-col gap-1 flex-1 min-h-0"
            >
              {/* 导航项：新建任务 / 插件 / 自动化 */}
              <SidebarGroup className="px-2 py-0">
                <SidebarMenu className="gap-1">
                  {navItems.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        className="font-medium"
                        isActive={isActive(item.path)}
                        onClick={() => handleNavClick(item.path)}
                      >
                        <item.icon />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroup>
              {/* 任务列表 */}
              <NavHistory
                currentSessionId={currentSessionId}
                history={filteredSessions}
                onSessionClick={handleSessionClick}
                onSessionDelete={onSessionDelete}
                onNewSession={() => navigate(`/${activeTab}`)}
                defaultOpen={tabFolderOpen[activeTab]}
                onOpenChange={(open) =>
                  setTabFolderOpen((prev) => ({ ...prev, [activeTab]: open }))
                }
                onScrollStateChange={handleScrollStateChange}
              />
            </motion.div>
          </AnimatePresence>
        </SidebarContent>
        <SidebarFooter className="p-0">
          <NavSettings onClick={openSettings} />
        </SidebarFooter>
      </Sidebar>
      <GlobalSettings />
      <NavDialog
        open={isNavDialogOpen}
        onOpenChange={onCancel}
        onConfirm={onConfirm}
      />
    </>
  );
}
