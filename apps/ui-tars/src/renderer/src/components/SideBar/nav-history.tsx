/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  MoreHorizontal,
  Trash2,
  ChevronRight,
  Laptop,
  Compass,
  Folder,
  Maximize2,
  Minimize2,
  ListFilter,
} from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@renderer/components/ui/dropdown-menu';
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from '@renderer/components/ui/sidebar';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@renderer/components/ui/collapsible';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@renderer/components/ui/tooltip';
import { SessionItem } from '@renderer/db/session';
import { ShareOptions } from './share';

import { Operator } from '@main/store/types';
import { DeleteSessionDialog } from '@renderer/components/AlertDialog/delSessionDialog';

const getIcon = (operator: Operator, isActive: boolean) => {
  const isRemote =
    operator === Operator.RemoteComputer || operator === Operator.RemoteBrowser;
  const isComputer =
    operator === Operator.LocalComputer || operator === Operator.RemoteComputer;

  const MainIcon = isComputer ? Laptop : Compass;

  return (
    <div className="relative flex items-center gap-1">
      <MainIcon className="w-4 h-4" />
      <div
        className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full text-[6px] flex items-center justify-center font-bold leading-none bg-white border border-gray-500 ${isActive ? 'text-neutral-700 border-neutral-700' : 'text-neutral-500 border-neutral-500'}`}
      >
        {isRemote ? 'R' : 'L'}
      </div>
    </div>
  );
};

export function NavHistory({
  currentSessionId,
  history,
  onSessionClick,
  onSessionDelete,
}: {
  currentSessionId: string;
  history: SessionItem[];
  onSessionClick: (id: string) => void;
  onSessionDelete: (id: string) => void;
}) {
  const [isShareConfirmOpen, setIsShareConfirmOpen] = useState(false);
  const [id, setId] = useState('');
  const [isFolderOpen, setIsFolderOpen] = useState(true);
  const [dropdownOpenId, setDropdownOpenId] = useState<string | null>(null);
  const [isScrolledToBottom, setIsScrolledToBottom] = useState(true);
  const { setOpen, state } = useSidebar();
  const scrollRef = useRef<HTMLDivElement>(null);

  /** 检测滚动位置，判断是否到达底部 */
  const checkScrollBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 2;
    setIsScrolledToBottom(atBottom);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', checkScrollBottom);
    return () => el.removeEventListener('scroll', checkScrollBottom);
  }, [checkScrollBottom]);

  const handleHistory = () => {
    if (state === 'collapsed') {
      setOpen(true);
      setTimeout(() => {
        setIsFolderOpen(true);
      }, 10);
    }
  };

  /** 展开/收缩所有对话 */
  const handleToggleAll = useCallback(() => {
    setIsFolderOpen((prev) => !prev);
  }, []);

  const handleDelete = (sessionId: string) => {
    setDropdownOpenId(null);
    setTimeout(() => {
      setId(sessionId);
      setIsShareConfirmOpen(true);
    }, 50);
  };

  return (
    <>
      <SidebarGroup className="px-2 pt-2 pb-2 flex flex-col flex-1 min-h-0">
        {/* 任务列表标题行 */}
        <div className="flex items-center justify-between px-2 pt-1.5 pb-0">
          <button
            className="text-sm font-medium text-neutral-500 hover:text-neutral-700 transition-colors bg-transparent border-none outline-none flex items-center gap-1.5"
            onClick={handleHistory}
          >
            <span>任务列表</span>
          </button>
          <div className="flex items-center gap-0.5">
            {/* 展开/收缩所有对话 */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="p-1.5 rounded-lg hover:bg-neutral-200 text-neutral-400  transition-colors"
                  onClick={handleToggleAll}
                >
                  {isFolderOpen ? (
                    <Minimize2 className="w-3.5 h-3.5" />
                  ) : (
                    <Maximize2 className="w-3.5 h-3.5" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={0}>
                {isFolderOpen ? '收起全部' : '展开全部'}
              </TooltipContent>
            </Tooltip>
            {/* 视图选项（占位） */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button className="ml-[1px] p-1.5 rounded-lg hover:bg-neutral-200 text-neutral-400  transition-colors">
                  <ListFilter className="w-4 h-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={0}>
                视图选项
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* 可滚动的任务列表区域 */}
        <div
          ref={scrollRef}
          className="flex-1 min-h-0 overflow-y-auto relative"
        >
          <SidebarMenu className="gap-0">
            {/* "默认"文件夹 */}
            <Collapsible
              asChild
              open={isFolderOpen}
              onOpenChange={setIsFolderOpen}
              className="group/collapsible"
            >
              <SidebarMenuItem className="w-full flex flex-col">
                <CollapsibleTrigger asChild>
                  <SidebarMenuButton className="!pr-2 text-neutral-500 hover:text-neutral-700 hover:bg-transparent data-[active=true]:bg-transparent">
                    <Folder className="w-4 h-4" />
                    <span>默认</span>
                    <ChevronRight className="ml-auto w-3.5 h-3.5 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                  </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent className="w-full">
                  <SidebarMenuSub className="!mr-0 !pr-1 !ml-0 !border-l-0 !px-1">
                    {history.map((item) => (
                      <SidebarMenuSubItem key={item.id} className="group/item">
                        <SidebarMenuSubButton
                          className={`hover:bg-neutral-100 hover:text-neutral-600 cursor-pointer ${item.id === currentSessionId ? 'text-neutral-700 bg-white hover:bg-white' : 'text-neutral-500'}`}
                          onClick={() => onSessionClick(item.id)}
                        >
                          {getIcon(
                            item.meta.operator,
                            item.id === currentSessionId,
                          )}
                          <span className="max-w-38">{item.name}</span>
                        </SidebarMenuSubButton>
                        <DropdownMenu
                          open={dropdownOpenId === item.id}
                          onOpenChange={(isOpen) =>
                            setDropdownOpenId(isOpen ? item.id : null)
                          }
                        >
                          <DropdownMenuTrigger asChild>
                            <SidebarMenuAction className="invisible group-hover/item:visible [&[data-state=open]]:visible mt-1">
                              <MoreHorizontal />
                              <span className="sr-only">More</span>
                            </SidebarMenuAction>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            className="rounded-lg"
                            side={'right'}
                            align={'start'}
                          >
                            <ShareOptions sessionId={item.id} />
                            <DropdownMenuItem
                              className="text-red-400 focus:bg-red-50 focus:text-red-500"
                              onClick={() => handleDelete(item.id)}
                            >
                              <Trash2 className="text-red-400" />
                              <span>Delete</span>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                </CollapsibleContent>
              </SidebarMenuItem>
            </Collapsible>
          </SidebarMenu>
        </div>
      </SidebarGroup>
      <DeleteSessionDialog
        open={isShareConfirmOpen}
        onOpenChange={setIsShareConfirmOpen}
        onConfirm={() => onSessionDelete(id)}
      />
    </>
  );
}
