import { MessageCirclePlus } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Card } from '@renderer/components/ui/card';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@renderer/components/ui/tabs';
import { Button } from '@renderer/components/ui/button';
import { SidebarTrigger, useSidebar } from '@renderer/components/ui/sidebar';
import { NavHeader } from '@renderer/components/Detail/NavHeader';
import { ScrollArea } from '@renderer/components/ui/scroll-area';

import { useStore } from '@renderer/hooks/useStore';
import { useSession } from '@renderer/hooks/useSession';
import Prompts from '../../components/Prompts';
import { IMAGE_PLACEHOLDER } from '@ui-tars/shared/constants';
import {
  AssistantTextMessage,
  ErrorMessage,
  HumanTextMessage,
  LoadingText,
  ScreenshotMessage,
} from '../../components/RunMessages/Messages';
import ThoughtChain from '../../components/ThoughtChain';
import { api } from '../../api';
import ImageGallery from '../../components/ImageGallery';
import { PredictionParsed, StatusEnum } from '@ui-tars/shared/types';
import { RouterState } from '../../typings';
import ChatInput from '../../components/ChatInput';
import { NavDialog } from '../../components/AlertDialog/navDialog';
import {
  checkVLMSettings,
  LocalSettingsDialog,
} from '../../components/Settings/local';
import { sleep } from '@ui-tars/shared/utils';

/**
 * 从预测步骤中提取 finished 动作的内容
 * 当模型判断任务完成时，会输出 action_type='finished' 的步骤，其 content 即为最终回复文本
 */
const getFinishedContent = (predictionParsed?: PredictionParsed[]) =>
  predictionParsed?.find(
    (step) =>
      step.action_type === 'finished' &&
      typeof step.action_inputs?.content === 'string' &&
      step.action_inputs.content.trim() !== '',
  )?.action_inputs?.content as string | undefined;

/**
 * 本地 Operator 聊天主页面
 * 左侧：对话消息列表 + 输入框
 * 右侧：截图预览面板
 */
const LocalOperator = () => {
  // 路由状态：携带 sessionId、operator 等上下文信息
  const state = useLocation().state as RouterState;
  const navigate = useNavigate();
  const { setOpen } = useSidebar();

  // 从全局 store 获取运行状态、消息列表、思考状态、错误信息
  const { status, messages = [], thinking, errorMsg } = useStore();
  // 用于自动滚动到底部
  const containerRef = useRef<HTMLDivElement>(null);
  // 建议提示词列表（当前为空，预留扩展）
  const suggestions: string[] = [];
  // 当前选中的截图索引（用于右侧图片画廊高亮）
  const [selectImg, setSelectImg] = useState<number | undefined>(undefined);
  // 初始化的 sessionId，用于防止重复初始化
  const [initId, setInitId] = useState('');
  // 会话管理：当前会话ID、切换会话、更新消息、创建会话、聊天消息列表
  const {
    currentSessionId,
    setActiveSession,
    updateMessages,
    createSession,
    chatMessages,
  } = useSession();
  // 待确认的导航操作（新建聊天 or 返回主页）
  const [pendingAction, setPendingAction] = useState<'newChat' | 'back' | null>(
    null,
  );
  // 导航确认弹窗开关
  const [isNavDialogOpen, setNavDialogOpen] = useState(false);
  // 本地设置弹窗开关（VLM 未配置时弹出）
  const [localOpen, setLocalOpen] = useState(false);

  // 初始化：根据路由传入的 sessionId 激活对应会话（不自动收起侧边栏）
  useEffect(() => {
    const update = async () => {
      if (state.sessionId) {
        await setActiveSession(state.sessionId);
        setInitId(state.sessionId);
      }
    };
    update();
  }, [state.sessionId]);

  // 消息同步：将全局 store 中的新消息合并到当前会话的聊天消息中
  useEffect(() => {
    // 会话尚未初始化完成，跳过
    if (initId !== state.sessionId) {
      return;
    }

    // 路由 sessionId 与当前会话不一致，跳过
    if (
      state.sessionId &&
      currentSessionId &&
      state.sessionId !== currentSessionId
    ) {
      return;
    }

    if (messages.length) {
      // 用「内容+来源+时间」构造唯一标识，避免重复消息
      const existingMessagesSet = new Set(
        chatMessages.map(
          (msg) => `${msg.value}-${msg.from}-${msg.timing?.start}`,
        ),
      );
      // 过滤出尚未合并的新消息
      const newMessages = messages.filter(
        (msg) =>
          !existingMessagesSet.has(
            `${msg.value}-${msg.from}-${msg.timing?.start}`,
          ),
      );
      const allMessages = [...chatMessages, ...newMessages];

      updateMessages(state.sessionId, allMessages);
    }
  }, [
    initId,
    state.sessionId,
    currentSessionId,
    chatMessages.length,
    messages.length,
  ]);

  // 消息/思考/错误变化时，自动滚动到聊天列表底部
  useEffect(() => {
    setTimeout(() => {
      containerRef.current?.scrollIntoView(false);
    }, 100);
  }, [messages, thinking, errorMsg]);

  // 选择建议提示词，设置为主进程指令
  const handleSelect = async (suggestion: string) => {
    await api.setInstructions({ instructions: suggestion });
  };

  // 选中某条消息的截图，右侧画廊联动高亮
  const handleImageSelect = async (index: number) => {
    setSelectImg(index);
  };

  // 判断是否需要弹窗确认：运行中 / 等待用户操作 / 暂停 状态下导航需确认
  const needsConfirm =
    status === StatusEnum.RUNNING ||
    status === StatusEnum.CALL_USER ||
    status === StatusEnum.PAUSE;

  // 创建新会话并跳转
  const onNewChat = useCallback(async () => {
    const session = await createSession('New Session', {
      operator: state.operator,
    });

    navigate('/local', {
      state: {
        operator: state.operator,
        sessionId: session?.id,
        from: 'new',
      },
    });
  }, []);

  // 返回主页
  const onBack = useCallback(async () => {
    navigate('/');
  }, []);

  // 点击「新建聊天」：运行中需弹窗确认，否则直接创建
  const handleNewChat = useCallback(() => {
    if (needsConfirm) {
      setPendingAction('newChat');
      setNavDialogOpen(true);
    } else {
      onNewChat();
    }
  }, [needsConfirm]);

  // 点击「返回」：运行中需弹窗确认，否则直接返回
  const handleBack = useCallback(() => {
    if (needsConfirm) {
      setPendingAction('back');
      setNavDialogOpen(true);
    } else {
      onBack();
    }
  }, [needsConfirm]);

  // 弹窗确认回调：停止运行 → 清空历史 → 执行待确认的导航操作
  const onConfirm = useCallback(async () => {
    await api.stopRun();
    await api.clearHistory();

    if (pendingAction === 'newChat') {
      await onNewChat();
    } else if (pendingAction === 'back') {
      await onBack();
    }
    setPendingAction(null);
    setNavDialogOpen(false);
  }, [pendingAction]);

  // 弹窗取消回调
  const onCancel = useCallback(() => {
    setPendingAction(null);
    setNavDialogOpen(false);
  }, []);

  // 设置弹窗提交后关闭，延迟 200ms 等待动画结束
  const handleLocalSettingsSubmit = async () => {
    setLocalOpen(false);
    await sleep(200);
  };

  // 设置弹窗直接关闭
  const handleLocalSettingsClose = () => {
    setLocalOpen(false);
  };

  // 发送消息前检查 VLM 配置，未配置则弹出设置弹窗
  const checkVLM = async () => {
    const hasVLM = await checkVLMSettings();
    if (hasVLM) {
      return true;
    } else {
      setLocalOpen(true);
      return false;
    }
  };

  // 渲染左侧聊天消息列表
  const renderChatList = () => {
    return (
      <ScrollArea className="h-full px-4">
        <div ref={containerRef}>
          {/* 空会话时展示建议提示词 */}
          {!chatMessages?.length && suggestions?.length > 0 && (
            <Prompts suggestions={suggestions} onSelect={handleSelect} />
          )}

          {chatMessages?.map((message, idx) => {
            // 用户消息
            if (message?.from === 'human') {
              if (message?.value === IMAGE_PLACEHOLDER) {
                // 截图占位符，渲染为可点击的截图消息卡片
                return (
                  <ScreenshotMessage
                    key={`message-${idx}`}
                    onClick={() => handleImageSelect(idx)}
                  />
                );
              }

              // 普通文本消息
              return (
                <HumanTextMessage
                  key={`message-${idx}`}
                  text={message?.value}
                />
              );
            }

            // AI 消息：解析预测步骤
            const { predictionParsed, screenshotBase64WithElementMarker } =
              message;

            // 提取 finished 步骤的最终回复文本
            const finishedStep = getFinishedContent(predictionParsed);

            return (
              <div key={idx}>
                {/* 思维链步骤展示 */}
                {predictionParsed?.length ? (
                  <ThoughtChain
                    steps={predictionParsed}
                    hasSomImage={!!screenshotBase64WithElementMarker}
                    onClick={() => handleImageSelect(idx)}
                  />
                ) : null}

                {/* 任务完成时的最终回复 */}
                {!!finishedStep && <AssistantTextMessage text={finishedStep} />}
              </div>
            );
          })}

          {/* 思考中加载动画 */}
          {thinking && <LoadingText text={'Thinking...'} />}
          {/* 错误提示 */}
          {errorMsg && <ErrorMessage text={errorMsg} />}
        </div>
      </ScrollArea>
    );
  };

  return (
    <div className="flex flex-col w-full h-full">
      {/* 顶部导航栏：显示 operator 名称 + 返回按钮 */}
      <NavHeader
        title={state.operator}
        onBack={handleBack}
        docUrl="https://github.com/bytedance/UI-TARS-desktop/"
      ></NavHeader>
      <div className="px-5 pb-5 flex flex-1 gap-5">
        {/* 左侧面板：聊天区域（2/5 宽度） */}
        <Card className="flex-1 basis-2/5 px-0 py-4 gap-4 h-[calc(100vh-76px)]">
          {/* 工具栏：侧边栏开关 + 新建聊天按钮 */}
          <div className="flex items-center justify-between w-full px-4">
            <SidebarTrigger
              variant="secondary"
              className="size-8"
            ></SidebarTrigger>
            <Button variant="outline" size="sm" onClick={handleNewChat}>
              <MessageCirclePlus />
              New Chat
            </Button>
          </div>
          {/* 消息列表 */}
          {renderChatList()}
          {/* 底部输入框，发送前会先检查 VLM 配置 */}
          <ChatInput
            disabled={false}
            operator={state.operator}
            sessionId={state.sessionId}
            checkBeforeRun={checkVLM}
          />
        </Card>
        {/* 右侧面板：截图预览（3/5 宽度） */}
        <Card className="flex-1 basis-3/5 p-3 h-[calc(100vh-76px)]">
          <Tabs defaultValue="screenshot" className="flex-1">
            <TabsList>
              <TabsTrigger value="screenshot">ScreenShot</TabsTrigger>
            </TabsList>
            <TabsContent value="screenshot">
              <ImageGallery
                messages={chatMessages}
                selectImgIndex={selectImg}
              />
            </TabsContent>
          </Tabs>
        </Card>
      </div>
      {/* 导航确认弹窗：运行中切换会话时弹出 */}
      <NavDialog
        open={isNavDialogOpen}
        onOpenChange={onCancel}
        onConfirm={onConfirm}
      />
      {/* VLM 设置弹窗：未配置模型时弹出引导 */}
      <LocalSettingsDialog
        isOpen={localOpen}
        onSubmit={handleLocalSettingsSubmit}
        onClose={handleLocalSettingsClose}
      />
    </div>
  );
};

export default LocalOperator;
