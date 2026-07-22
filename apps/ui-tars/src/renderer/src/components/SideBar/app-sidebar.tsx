/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { useCallback, useState, type ComponentProps } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Pencil, Folder, Clock, Puzzle } from 'lucide-react';

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

import { Operator } from '@main/store/types';
import { useGlobalSettings, GlobalSettings } from '../Settings/global';
import { useStore } from '../../hooks/useStore';
import { StatusEnum } from '@ui-tars/sdk';
import { NavDialog } from '../AlertDialog/navDialog';
import { api } from '../../api';

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

  const needsConfirm =
    status === StatusEnum.RUNNING ||
    status === StatusEnum.CALL_USER ||
    status === StatusEnum.PAUSE;

  // 导航项：新建任务 / 项目 / 自动化 / 插件
  const navItems = [
    { title: '新建任务', icon: Pencil, path: '/' },
    // { title: '项目', icon: Folder, path: '/projects' },
    { title: '自动化', icon: Clock, path: '/automation' },
    { title: '插件', icon: Puzzle, path: '/plugins' },
  ];

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
        // deleteSession 已经清理了状态，只需导航到首页
        await navigate('/');
      }
    },
    [currentSessionId, deleteSession, navigate],
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
        <SidebarContent className="gap-1 overflow-visible">
          {/* 导航项：新建任务 / 项目 / 自动化 / 插件 */}
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
            history={sessions}
            onSessionClick={handleSessionClick}
            onSessionDelete={onSessionDelete}
          />
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
