/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { useLocation } from 'react-router';
import { motion } from 'motion/react';
import {
  MoreVertical,
  Trash2,
  ChevronRight,
  Folder,
  Maximize2,
  Minimize2,
  ListFilter,
  MessageCirclePlus,
  Pin,
  List,
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
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
  useSidebar,
} from '@renderer/components/ui/sidebar';
import {
  Collapsible,
  CollapsibleTrigger,
} from '@renderer/components/ui/collapsible';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@renderer/components/ui/tooltip';
import { SessionItem } from '@renderer/db/session';
import { ShareOptions } from './share';

import { DeleteSessionDialog } from '@renderer/components/AlertDialog/delSessionDialog';

export function NavHistory({
  currentSessionId,
  history,
  onSessionClick,
  onSessionDelete,
  onNewSession,
  defaultOpen = true,
  onOpenChange,
  onScrollStateChange,
}: {
  currentSessionId: string;
  history: SessionItem[];
  onSessionClick: (id: string) => void;
  onSessionDelete: (id: string) => void;
  onNewSession?: () => void;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** 滚动状态变化回调，true = 需要显示渐变（可滚动且未到底部） */
  onScrollStateChange?: (showGradient: boolean) => void;
}) {
  const [isShareConfirmOpen, setIsShareConfirmOpen] = useState(false);
  const [id, setId] = useState('');
  const [dropdownOpenId, setDropdownOpenId] = useState<string | null>(null);
  const [isFolderOpen, setIsFolderOpen] = useState(defaultOpen);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null,
  );
  const [contentHeight, setContentHeight] = useState(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const animatedRef = useRef<HTMLDivElement>(null);

  const { setOpen, state } = useSidebar();
  const location = useLocation();

  // 用 ResizeObserver 持续监听内部内容高度，避免每次 history 变化都强制同步重排
  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setContentHeight(entry.contentRect.height);
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // 路由变化时，若跳转到非会话页面（如首页、插件市场等），清除选中态
  useEffect(() => {
    const isSessionPage = ['/local', '/free-remote', '/paid-remote'].includes(
      location.pathname,
    );
    if (!isSessionPage) {
      setSelectedSessionId(null);
    }
  }, [location.pathname]);

  // 监听滚动 + 内容高度变化，通过回调通知父组件控制底部渐变显隐
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const checkScroll = () => {
      const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 2;
      const isScrollable = el.scrollHeight > el.clientHeight;
      onScrollStateChange?.(isScrollable && !isAtBottom);
    };

    // 初始检测（等 motion.div 动画完成后再读取 scrollHeight）
    const initTimer = setTimeout(checkScroll, 150);

    el.addEventListener('scroll', checkScroll, { passive: true });

    // 观察 motion.div（动画容器）：动画过程中高度持续变化，ResizeObserver 在动画完成时触发
    // 此时 scrollRef.scrollHeight 已反映最终内容高度，checkScroll 读取到正确值
    let animatedObserver: ResizeObserver | undefined;
    if (animatedRef.current && typeof ResizeObserver !== 'undefined') {
      animatedObserver = new ResizeObserver(checkScroll);
      animatedObserver.observe(animatedRef.current);
    }

    // 观察 contentRef（内容 div）：增删 item 时高度立即变化，但 motion.div 动画尚未完成
    // 延迟到动画结束后再检测（兜底）
    let contentObserver: ResizeObserver | undefined;
    let contentTimer: ReturnType<typeof setTimeout> | undefined;
    if (contentRef.current && typeof ResizeObserver !== 'undefined') {
      contentObserver = new ResizeObserver(() => {
        clearTimeout(contentTimer);
        contentTimer = setTimeout(checkScroll, 150);
      });
      contentObserver.observe(contentRef.current);
    }

    return () => {
      clearTimeout(initTimer);
      clearTimeout(contentTimer);
      el.removeEventListener('scroll', checkScroll);
      animatedObserver?.disconnect();
      contentObserver?.disconnect();
    };
  }, [history.length, onScrollStateChange]);

  // 同步全局 currentSessionId 到本地选中态（如通过页面创建新 session 时）
  // 仅在会话页面时同步，避免 tab 切换后从全局状态恢复选中态
  useEffect(() => {
    const isSessionPage = ['/local', '/free-remote', '/paid-remote'].includes(
      location.pathname,
    );
    if (isSessionPage && currentSessionId) {
      setSelectedSessionId(currentSessionId);
    }
  }, [currentSessionId, location.pathname]);

  const handleHistory = () => {
    if (state === 'collapsed') {
      setOpen(true);
      setTimeout(() => {
        handleOpenChange(true);
      }, 10);
    }
  };

  /** 展开/收缩：声明式动画，高度由内层 ResizeObserver 提供 */
  const handleOpenChange = useCallback(
    (open: boolean) => {
      setIsFolderOpen(open);
      onOpenChange?.(open);
    },
    [onOpenChange],
  );

  const handleDelete = (sessionId: string) => {
    setDropdownOpenId(null);
    setTimeout(() => {
      setId(sessionId);
      setIsShareConfirmOpen(true);
    }, 50);
  };

  const handleSessionClick = (sessionId: string) => {
    setSelectedSessionId(sessionId);
    onSessionClick(sessionId);
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
                  className="p-1.5 rounded-lg hover:bg-neutral-200 text-neutral-400 transition-colors"
                  onClick={() => handleOpenChange(!isFolderOpen)}
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
                <button className="ml-[1px] p-1.5 rounded-lg hover:bg-neutral-200 text-neutral-400 transition-colors">
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
          className="flex-1 min-h-0 overflow-y-scroll relative"
        >
          <SidebarMenu className="gap-0">
            {/* "默认"文件夹 */}
            <Collapsible
              asChild
              open={isFolderOpen}
              onOpenChange={handleOpenChange}
              className="group/collapsible"
            >
              <SidebarMenuItem className="w-full flex flex-col">
                <CollapsibleTrigger asChild>
                  <SidebarMenuButton className="!pr-1 !rounded-lg text-neutral-500 hover:!text-neutral-500 hover:!bg-[var(--sidebar-item-hover-bg)] data-[active=true]:bg-transparent group/folder">
                    <div className="relative flex items-center justify-center w-4 h-4">
                      <Folder className="absolute inset-0 m-auto w-4 h-4 opacity-100 group-hover/folder:opacity-0" />
                      <ChevronRight
                        className={`absolute inset-0 m-auto w-3 h-3 opacity-0 group-hover/folder:opacity-100 ${isFolderOpen ? 'rotate-90' : 'rotate-0'}`}
                      />
                    </div>
                    <span>默认</span>
                    {onNewSession && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            className="ml-auto p-1 rounded-md invisible group-hover/folder:visible hover:bg-[var(--new-session-btn-hover-bg)] text-[var(--new-session-btn-icon)] hover:text-[var(--foreground)]"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedSessionId(null);
                              onNewSession();
                            }}
                          >
                            <MessageCirclePlus className="w-4 h-4" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" sideOffset={4}>
                          在 默认 中新建任务
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </SidebarMenuButton>
                </CollapsibleTrigger>
                <motion.div
                  ref={animatedRef}
                  initial={false}
                  animate={{ height: isFolderOpen ? contentHeight : 0 }}
                  transition={{ duration: 0.08, ease: 'easeIn' }}
                  className="w-full overflow-hidden will-change-[height]"
                >
                  <div ref={contentRef}>
                    <SidebarMenuSub className="!mr-0 !ml-0 !border-l-0 !px-0 !gap-[1.5px] rounded-lg">
                      {history.map((item) => {
                        const isSelected = selectedSessionId === item.id;

                        return (
                          <SidebarMenuSubItem
                            key={item.id}
                            className="group/item"
                          >
                            <div
                              className={`relative flex items-center w-full rounded-lg cursor-pointer ${isSelected ? '' : 'hover:bg-[var(--sidebar-item-hover-bg)]'}`}
                              style={{
                                ...(isSelected
                                  ? {
                                      backgroundColor:
                                        'var(--sidebar-item-selected-bg)',
                                    }
                                  : {}),
                                paddingLeft: '5px',
                                paddingRight: '6px',
                                height: '36px',
                              }}
                              onClick={() => handleSessionClick(item.id)}
                            >
                              {/* 左侧置顶按钮（始终占位，CSS group-hover 控制显隐） */}
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    className="flex items-center justify-center w-5 h-5 rounded shrink-0 transition-opacity opacity-0 group-hover/item:opacity-100 text-[var(--icon-tertiary)] hover:text-[var(--icon-default-hover)]"
                                    onClick={(e) => e.stopPropagation()}
                                    tabIndex={-1}
                                  >
                                    <Pin className="w-[15px] h-[15pxS] " />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="top" sideOffset={4}>
                                  置顶任务
                                </TooltipContent>
                              </Tooltip>

                              {/* 会话名称 */}
                              <span
                                className="flex-1 truncate text-sm ml-2"
                                style={{ color: 'var(--foreground)' }}
                              >
                                {item.name}
                              </span>

                              {/* 右侧操作区 */}
                              <div className="flex items-center gap-0.5 shrink-0">
                                {/* 更多操作按钮（始终占位，CSS group-hover 控制显隐） */}
                                <DropdownMenu
                                  open={dropdownOpenId === item.id}
                                  onOpenChange={(isOpen) =>
                                    setDropdownOpenId(isOpen ? item.id : null)
                                  }
                                >
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <DropdownMenuTrigger asChild>
                                        <button
                                          className="flex items-center justify-center w-6 h-6 mr-1 rounded-lg shrink-0 transition-opacity opacity-0 group-hover/item:opacity-100 text-[var(--icon-default)] hover:text-[var(--icon-default-hover)] hover:bg-[var(--more-ops-btn-hover-bg)]"
                                          onClick={(e) => e.stopPropagation()}
                                          tabIndex={-1}
                                        >
                                          <MoreVertical className="w-4 h-4 " />
                                        </button>
                                      </DropdownMenuTrigger>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" sideOffset={4}>
                                      更多操作
                                    </TooltipContent>
                                  </Tooltip>
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

                                {/* 文件管理按钮 */}
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      className={`flex items-center justify-center w-6 h-6 rounded-lg shrink-0 transition-colors text-[var(--icon-default)] hover:text-[var(--icon-default-hover)] ${isSelected ? 'opacity-100' : 'opacity-0 group-hover/item:opacity-100'}`}
                                      style={{
                                        backgroundColor: 'var(--background)',
                                        border:
                                          '1px solid var(--file-mgmt-btn-border)',
                                      }}
                                      onClick={(e) => e.stopPropagation()}
                                      tabIndex={-1}
                                    >
                                      <List className="w-4 h-4" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" sideOffset={4}>
                                    文件管理
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                            </div>
                          </SidebarMenuSubItem>
                        );
                      })}
                    </SidebarMenuSub>
                  </div>
                </motion.div>
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
