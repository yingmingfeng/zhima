/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * ChatInput 组件 —— 聊天输入框组件
 *
 * 这是 Agent 交互界面的核心输入组件，负责：
 * 1. 接收用户输入的指令（instructions）
 * 2. 支持通过 Enter 键或点击按钮发送指令，启动 Agent 运行
 * 3. 在 Agent 运行中显示「停止」按钮，允许用户中断执行
 * 4. 处理特殊的 CALL_USER 状态 —— 当 Agent 需要用户确认/补充信息时，
 *    输入框会切换为「回复模式」，展示 Agent 上次的人类指令并允许用户继续发送
 * 5. 根据当前选择的 Operator（操作器类型）自动同步设置
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';

// IMAGE_PLACEHOLDER: 当消息内容仅为图片时使用的占位符文本，用于过滤纯图片消息
import { IMAGE_PLACEHOLDER } from '@ui-tars/shared/constants';
// StatusEnum: Agent 运行状态的枚举值，包括 INIT(初始化)、RUNNING(运行中)、CALL_USER(等待用户)等
import { StatusEnum } from '@ui-tars/shared/types';

// useRunAgent: 封装了 Agent 启动/停止逻辑的自定义 Hook
import { useRunAgent } from '@renderer/hooks/useRunAgent';
// useStore: 全局状态管理 Hook，提供 status、messages、instructions 等响应式数据
import { useStore } from '@renderer/hooks/useStore';

// UI 组件：Tooltip（工具提示）、Button（按钮）、Textarea（文本域），均来自项目内部的 shadcn/ui 封装
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@renderer/components/ui/tooltip';
import { Button } from '@renderer/components/ui/button';
// import { useScreenRecord } from '@renderer/hooks/useScreenRecord';
// api: 渲染进程与主进程通信的 IPC 桥接 API，这里用于 clearHistory 清除历史
import { api } from '@renderer/api';

// lucide-react 图标库中的图标
// Play: 播放/继续图标，用于 CALL_USER 状态下继续执行
// Send: 发送图标，用于正常发送消息
// Square: 方形图标，用于停止 Agent 运行
// Loader2: 加载动画图标，表示 Agent 正在运行中
import { Play, Send, Square, Loader2 } from 'lucide-react';
import { Textarea } from '@renderer/components/ui/textarea';
// useSession: 会话管理 Hook，提供获取/更新会话信息和聊天消息列表的能力
import { useSession } from '@renderer/hooks/useSession';

// Operator: 操作器类型枚举，定义了 Agent 可以操控的目标环境
import { Operator } from '@main/store/types';
// useSetting: 设置管理 Hook，用于读写应用配置（这里用于同步 operator 设置）
import { useSetting } from '../../hooks/useSetting';

/**
 * ChatInput 组件定义
 *
 * @param props.operator - 当前选中的操作器类型（本地电脑/本地浏览器/远程电脑/远程浏览器）
 * @param props.sessionId - 当前会话的唯一标识，用于关联消息和操作到特定会话
 * @param props.disabled - 外部控制的禁用标志，为 true 时发送按钮不可点击
 * @param props.checkBeforeRun - 可选的前置校验函数，在 Agent 启动前调用，
 *                                返回 false 则取消执行（常用于检查配置是否完整等场景）
 */
const ChatInput = ({
  operator,
  sessionId,
  disabled,
  checkBeforeRun,
}: {
  operator: Operator;
  sessionId: string;
  disabled: boolean;
  checkBeforeRun?: () => Promise<boolean>;
}) => {
  // ========== 状态与数据源 ==========

  // 从全局 Store 中获取响应式状态：
  // - status: Agent 当前运行状态（INIT / RUNNING / CALL_USER 等）
  // - savedInstructions: 上一次保存的指令（在 CALL_USER 状态下用于回显）
  // - messages: 当前会话的所有消息列表
  // - restUserData: 用户附带的额外数据（如截图等），会随指令一起传递给 Agent
  const {
    status,
    instructions: savedInstructions,
    messages,
    restUserData,
  } = useStore();

  // localInstructions: 输入框中用户正在编辑的文本内容（本地受控状态）
  const [localInstructions, setLocalInstructions] = useState('');

  // useRunAgent: 获取 Agent 的启动（run）和停止（stopAgentRuning）方法
  const { run, stopAgentRuning } = useRunAgent();

  // useSession: 获取会话管理能力
  // - getSession: 根据 sessionId 获取会话详情
  // - updateSession: 更新会话的元信息（名称、meta 等）
  // - chatMessages: 当前会话的聊天消息列表（作为 Agent 的历史上下文）
  const { getSession, updateSession, chatMessages } = useSession();

  // useSetting: 获取/更新应用设置，这里主要用于同步 operator 类型到全局配置
  const { settings, updateSetting } = useSetting();

  // textareaRef: 文本域的 DOM 引用，用于组件挂载时自动聚焦
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // running: 派生状态 —— Agent 是否正在运行中
  const running = status === StatusEnum.RUNNING;

  // ========== Effects ==========

  // 组件挂载时自动聚焦到输入框，提升用户体验（用户无需手动点击即可开始输入）
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, []);

  // 监听 Agent 状态变化（当前为空实现，预留扩展点）
  // 当 status 不是 INIT 时可以做一些副作用处理，如滚动到底部、显示状态提示等
  useEffect(() => {
    if (status === StatusEnum.INIT) {
      return;
    }
  }, [status]);

  // 当外部传入的 operator 类型变化时，同步更新到全局设置中
  // 这确保了 Agent 运行时使用的操作器与 UI 上选择的一致
  // 支持的操作器：RemoteComputer(远程电脑)、RemoteBrowser(远程浏览器)、
  //               LocalComputer(本地电脑)、LocalBrowser(本地浏览器)
  useEffect(() => {
    switch (operator) {
      case Operator.RemoteComputer:
        updateSetting({ ...settings, operator: Operator.RemoteComputer });
        break;
      case Operator.RemoteBrowser:
        updateSetting({ ...settings, operator: Operator.RemoteBrowser });
        break;
      case Operator.LocalComputer:
        updateSetting({ ...settings, operator: Operator.LocalComputer });
        break;
      case Operator.LocalBrowser:
        updateSetting({ ...settings, operator: Operator.LocalBrowser });
        break;
      default:
        // 未识别的操作器类型默认回退到「本地电脑」
        updateSetting({ ...settings, operator: Operator.LocalComputer });
        break;
    }
  }, [operator]);

  // ========== 辅助函数 ==========

  /**
   * 获取当前要发送的指令内容
   *
   * 优先级逻辑：
   * 1. 如果用户在输入框中输入了内容 → 使用输入框内容
   * 2. 如果当前处于 CALL_USER 状态（Agent 等待用户响应）且存在之前保存的指令 → 使用保存的指令
   * 3. 否则返回空字符串（按钮将被禁用）
   *
   * 这个设计允许在 CALL_USER 场景下，用户无需重新输入，可以直接「继续」上次的指令
   */
  const getInstantInstructions = () => {
    if (localInstructions?.trim()) {
      return localInstructions;
    }
    if (isCallUser && savedInstructions?.trim()) {
      return savedInstructions;
    }
    return '';
  };

  /**
   * 启动 Agent 运行
   *
   * 执行流程：
   * 1. 如果提供了 checkBeforeRun 校验函数，先执行校验；校验不通过则中止
   * 2. 获取要发送的指令内容
   * 3. 获取当前会话的历史消息作为 Agent 的上下文
   * 4. 更新会话元信息（将会话名称设为当前指令，合并用户附带的额外数据）
   * 5. 调用 run() 启动 Agent，传入指令、历史消息和完成回调
   * 6. 启动成功后清空输入框
   */
  const startRun = async () => {
    // 前置校验：允许外部在启动前做额外检查（如验证 API Key 是否配置等）
    if (checkBeforeRun) {
      const checked = await checkBeforeRun();

      if (!checked) {
        return;
      }
    }

    // 确定最终要发送的指令文本
    const instructions = getInstantInstructions();

    console.log('startRun', instructions, restUserData);

    // 获取当前会话的聊天历史，作为 Agent 的上下文记忆
    let history = chatMessages;

    // 获取会话详情并更新会话元信息
    const session = await getSession(sessionId);
    await updateSession(sessionId, {
      name: instructions, // 用当前指令作为会话名称（方便在会话列表中识别）
      meta: {
        ...session!.meta, // 保留已有的 meta 信息
        ...(restUserData || {}), // 合并用户附带的额外数据（如截图等）
      },
    });

    // 启动 Agent 执行
    // 参数：指令文本、历史消息、成功启动后的回调（清空输入框）
    run(instructions, history, () => {
      setLocalInstructions('');
    });
  };

  /**
   * 键盘事件处理 —— 支持 Enter 键快捷发送
   *
   * 规则：
   * - 输入法组合状态（isComposing）下不触发，避免中文输入过程中误提交
   * - 单独按 Enter → 发送消息
   * - Shift + Enter → 换行（不发送）
   * - Meta/Cmd + Enter → 换行（不发送）
   * - 输入内容为空时按 Enter 不触发
   */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // 输入法正在组合输入（如中文、日文输入法），不处理
    if (e.nativeEvent.isComposing) {
      return;
    }

    // `enter` to submit
    if (
      e.key === 'Enter' &&
      !e.shiftKey &&
      !e.metaKey &&
      getInstantInstructions()
    ) {
      e.preventDefault();

      startRun();
    }
  };

  // ========== 派生状态 ==========

  // isCallUser: Agent 是否处于「等待用户响应」状态
  // 当 Agent 执行过程中需要用户确认或补充信息时，会进入此状态
  const isCallUser = useMemo(() => status === StatusEnum.CALL_USER, [status]);

  // lastHumanMessage: 从消息列表中找到最后一条来自人类（非图片）的消息内容
  // 用途：在 Agent 运行中时，将此消息显示在输入框的 placeholder 中，
  //       让用户看到自己上次发送的指令
  // 过滤逻辑：排除 value 为 IMAGE_PLACEHOLDER 的纯图片消息
  const lastHumanMessage =
    [...(messages || [])]
      .reverse()
      .find((m) => m?.from === 'human' && m?.value !== IMAGE_PLACEHOLDER)
      ?.value || '';

  /**
   * 停止 Agent 运行
   *
   * 执行流程：
   * 1. 调用 stopAgentRuning 终止 Agent 的执行，成功后清空输入框
   * 2. 调用 api.clearHistory() 清除主进程中的历史对话记录，
   *    确保下次启动时 Agent 从干净的状态开始
   */
  const stopRun = async () => {
    await stopAgentRuning(() => {
      setLocalInstructions('');
    });
    await api.clearHistory();
  };

  /**
   * 根据当前状态渲染不同的操作按钮
   *
   * 三种状态对应三种按钮：
   * 1. Agent 运行中（running）→ 显示「停止」按钮（Square 图标），点击后停止 Agent
   * 2. Agent 等待用户（isCallUser）且输入框为空 → 显示「继续」按钮（Play 图标，粉色），
   *    带有 Tooltip 提示用户这是用于响应 Agent 的 CALL_USER 请求
   * 3. 默认状态 → 显示「发送」按钮（Send 图标），输入为空或外部 disabled 时禁用
   */
  const renderButton = () => {
    // 状态1: Agent 正在运行 → 显示停止按钮
    if (running) {
      return (
        <Button
          variant="secondary"
          size="icon"
          className="h-8 w-8"
          onClick={stopRun}
        >
          <Square className="h-4 w-4" />
        </Button>
      );
    }

    // 状态2: Agent 等待用户响应，且用户尚未输入新内容 → 显示带提示的「继续」按钮
    if (isCallUser && !localInstructions) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="secondary"
                size="icon"
                className="h-8 w-8 bg-pink-100 hover:bg-pink-200 text-pink-500 border-pink-200"
                onClick={startRun}
                disabled={!getInstantInstructions()}
              >
                <Play className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p className="whitespace-pre-line">
                send last instructions when you done for ui-tars&apos;s
                &apos;CALL_USER&apos;
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    // 状态3: 默认 → 显示普通发送按钮
    return (
      <Button
        variant="secondary"
        size="icon"
        className="h-8 w-8"
        onClick={startRun}
        disabled={!getInstantInstructions() || disabled}
      >
        <Send className="h-4 w-4" />
      </Button>
    );
  };

  // ========== 渲染 ==========

  return (
    <div className="px-4 w-full">
      <div className="flex flex-col space-y-4">
        {/* 输入框容器：使用 relative 定位，按钮通过 absolute 定位叠加在输入框右下角 */}
        <div className="relative w-full">
          <Textarea
            ref={textareaRef}
            /**
             * placeholder 动态显示逻辑（按优先级）：
             * 1. CALL_USER 状态且有保存的指令 → 显示保存的指令（提示用户这是 Agent 等待的内容）
             * 2. Agent 运行中且有历史人类消息且消息数 > 1 → 显示上一条人类消息（让用户看到自己发了什么）
             * 3. 默认 → 显示通用提示语
             */
            placeholder={
              isCallUser && savedInstructions
                ? `${savedInstructions}`
                : running && lastHumanMessage && messages?.length > 1
                  ? lastHumanMessage
                  : 'What can I do for you today?'
            }
            className="min-h-[120px] rounded-2xl resize-none px-4 pb-16" // 调整内边距
            value={localInstructions}
            // Agent 运行中或外部禁用时，输入框不可编辑
            disabled={running || disabled}
            onChange={(e) => setLocalInstructions(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          {/* 按钮区域：绝对定位在输入框右下角，包含加载动画和操作按钮 */}
          <div className="absolute right-4 bottom-4 flex items-center gap-2">
            {/* Agent 运行中时显示旋转加载图标，提供视觉反馈 */}
            {running && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
            {/* 根据状态渲染不同的操作按钮（停止/继续/发送） */}
            {renderButton()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatInput;
