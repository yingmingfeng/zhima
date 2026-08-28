/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Agent 运行控制 Hook。
 *
 * 职责：
 * 1. 权限校验 — 本地操作器（LocalBrowser / LocalComputer）启动前检查辅助功能 & 屏幕录制权限
 * 2. 数据准备 — 将用户指令、当前对话、历史会话消息通过 IPC 同步到主进程
 * 3. 启停控制 — 调用主进程的 runAgent / stopRun 来驱动 Agent 循环
 *
 * 数据流：
 *   渲染进程（本文件）
 *     → IPC invoke → 主进程 agentRoute（setInstructions / setMessages / setSessionHistoryMessages）
 *     → IPC invoke → 主进程 agentRoute.runAgent → runAgent() 服务启动 Agent 循环
 */

import { toast } from 'sonner';

import { Conversation } from '@zhima/shared/types';
import { getState } from '@renderer/hooks/useStore';

import { usePermissions } from './usePermissions';
import { useSetting } from './useSetting';
import { api } from '@renderer/api';
import { ConversationWithSoM } from '@shared/agent/types';
import { Message } from '@zhima/shared/types';
import { Operator } from '@/main/store/types';

/**
 * 将 ConversationWithSoM[] 历史转换为 Message[]，供主进程 Agent 循环消费。
 *
 * 转换规则：
 * - human 消息：保留 value 非空且非 `<image>` 占位符的条目（即用户实际输入的指令）
 * - gpt 消息：从 predictionParsed 中提取有语义的内容：
 *   - 优先取 `finished` 动作的 content（Agent 任务完成时的总结）
 *   - 其次取 `call_user` 动作的 thought（Agent 请求用户介入时的思考）
 *   - 其他动作（click / type / scroll 等）不纳入对话历史
 *
 * @param history - 包含 SoM 标注的完整对话历史
 * @returns 过滤后的纯文本消息序列（human/gpt 交替）
 */
const filterAndTransformWithMap = (
  history: ConversationWithSoM[],
): Message[] => {
  return history
    .map((conv) => {
      // ── human 消息：只保留有实际文本内容的用户输入 ──
      if (conv.from === 'human' && conv.value && conv.value !== '<image>') {
        return {
          from: conv.from,
          value: conv.value,
        };
      }
      // ── gpt 消息：从结构化预测中提取语义内容 ──
      else if (conv.from === 'gpt' && conv.predictionParsed?.length) {
        // 优先：Agent 完成任务的 finished 动作
        const finished = conv.predictionParsed.find(
          (p) => p.action_type === 'finished' && p.action_inputs?.content,
        );
        if (finished) {
          return {
            from: conv.from,
            value: finished.action_inputs!.content!,
          };
        }

        // 其次：Agent 请求用户介入的 call_user 动作
        const callUser = conv.predictionParsed.find(
          (p) => p.action_type === 'call_user' && p.thought,
        );
        if (callUser) {
          return {
            from: conv.from,
            value: callUser.thought!,
          };
        }

        // 其他动作（click / type / scroll 等）不纳入对话历史
        return undefined;
      } else {
        return undefined;
      }
    })
    .filter((msg): msg is Message => msg !== undefined);
};

/**
 * Agent 运行控制 Hook。
 * 提供 `run`（启动 Agent）和 `stopAgentRuning`（停止 Agent）两个方法。
 */
export const useRunAgent = () => {
  const { settings } = useSetting();
  const { ensurePermissions } = usePermissions();

  /**
   * 启动 Agent 执行流程。
   *
   * 执行步骤：
   * 1. 权限检查 — 本地操作器需要辅助功能 + 屏幕录制权限
   * 2. 构造本轮用户消息（initialMessages）
   * 3. 通过 IPC 将指令、对话历史、会话历史同步到主进程 store
   * 4. 调用主进程 runAgent 启动 Agent 循环
   *
   * @param value - 用户输入的自然语言指令
   * @param history - 当前会话的完整对话历史（含 SoM 标注）
   * @param callback - Agent 启动后的回调（通常用于清空输入框等 UI 操作）
   */
  const run = async (
    value: string,
    history: ConversationWithSoM[],
    callback: () => void = () => {},
  ) => {
    const operator = settings.operator;

    // ── Step 1: 权限校验 ──
    // 本地操作器（浏览器 / 电脑）依赖系统级权限才能截屏和模拟操作
    if (
      (operator === Operator.LocalBrowser || Operator.LocalComputer) &&
      !(ensurePermissions?.accessibility && ensurePermissions?.screenCapture)
    ) {
      const permissionsText = [
        !ensurePermissions?.screenCapture ? 'screenCapture' : '',
        !ensurePermissions?.accessibility ? 'Accessibility' : '',
      ]
        .filter(Boolean)
        .join(' and ');

      toast.warning(
        `Please grant the required permissions(${permissionsText})`,
      );
      return;
    }

    // ── Step 2: 构造本轮用户消息 ──
    const initialMessages: Conversation[] = [
      {
        from: 'human',
        value,
        timing: { start: Date.now(), end: Date.now(), cost: 0 },
      },
    ];

    // 从主进程 store 获取当前已有的对话消息（跨轮次累积）
    const currentMessages = getState().messages;
    console.log('initialMessages', initialMessages, currentMessages.length);

    // ── Step 3: 将历史转换为 Agent 可消费的 Message[] 格式 ──
    const sessionHistory = filterAndTransformWithMap(history);

    // ── Step 4: 通过 IPC 并行同步三类数据到主进程 ──
    await Promise.all([
      // 设置本轮用户指令
      api.setInstructions({ instructions: value }),
      // 追加本轮用户消息到对话列表（主进程侧）
      api.setMessages({ messages: [...currentMessages, ...initialMessages] }),
      // 设置会话历史（过滤后的纯文本消息，供模型上下文使用）
      api.setSessionHistoryMessages({
        messages: sessionHistory,
      }),
    ]);

    // ── Step 5: 启动 Agent 循环 ──
    // 主进程会依次：截图 → 调模型 → 解析动作 → 执行 → 循环
    await api.runAgent();

    callback();
  };

  /**
   * 停止正在运行的 Agent。
   * 主进程会 abort 当前请求、重置状态、恢复窗口焦点。
   *
   * @param callback - 停止后的回调（通常用于清空输入框等 UI 操作）
   */
  const stopAgentRuning = async (callback: () => void = () => {}) => {
    await api.stopRun();
    callback();
  };

  return { run, stopAgentRuning };
};
