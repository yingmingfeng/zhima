/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { VlmModeEnum } from '../constants';
import { Message, PredictionParsed, GUIAgentError, StatusEnum } from './index';
import { ShareVersion } from './share';

/**
 * 单轮对话记录，继承自 {@link Message}（from + value），
 * 扩展了截图、屏幕上下文、模型预测结果等 Agent 运行时数据。
 *
 * 一条 Conversation 对应 Agent 循环中的一轮交互：
 *   human → 截图 + 用户指令 → 模型推理 → 解析出 action → 执行 → 下一轮
 */
export interface Conversation extends Message {
  /** 本轮推理的耗时统计（ms） */
  timing?: {
    start: number;
    end: number;
    cost: number;
  };
  /** 本轮截图的 base64 编码，仅在包含 <image> 时存在 */
  screenshotBase64?: string;
  /** 截图的屏幕上下文信息 */
  screenshotContext?: {
    size: {
      /** 物理设备宽度（px） */
      width: number;
      /** 物理设备高度（px） */
      height: number;
    };
    /** 截图 MIME 类型，如 image/png */
    mime?: string;
    /** 屏幕缩放因子（Device Pixel Ratio），用于坐标换算 */
    scaleFactor?: number;
  };
  /** 模型输出的结构化解析结果，每元素对应一个预测动作 */
  predictionParsed?: PredictionParsed[];
}

/**
 * Computer Use 完整数据结构，用于录制回放与分享。
 * 包含一次 Agent 任务从启动到结束的完整上下文：
 * 模型配置、系统提示词、所有对话轮次、运行状态与错误信息。
 *
 * @deprecated 请使用 {@link GUIAgentData} 代替
 */
export interface ComputerUseUserData extends GUIAgentData {
  /** 模型详情（已废弃，信息已合并入 GUIAgentData） */
  modelDetail: {
    name: string;
    provider: string;
    baseUrl: string;
    maxLoop: number;
  };
}

/**
 * GUI Agent 核心数据结构，承载一次完整 Agent 任务的全部信息。
 * 是录制、分享、回放等功能的数据载体。
 */
export interface GUIAgentData {
  /** 数据格式版本，用于分享数据的向前兼容 */
  version: ShareVersion;
  /** 用户下达的操作指令（自然语言） */
  instruction: string;
  /** 系统提示词，定义 Agent 的角色与行为约束 */
  systemPrompt: string;
  /** 使用的模型名称 */
  modelName: string;
  /** VLM 运行模式：chat（纯对话）或 agent（自主操作） */
  mode?: VlmModeEnum;
  /** 任务记录时间戳（ms） */
  logTime: number;
  /** Agent 当前运行状态 */
  status: StatusEnum;
  /** 错误信息摘要 */
  errMsg?: string;
  /** 结构化错误对象，包含错误码等详细信息 */
  error?: GUIAgentError;
  /** 所有对话轮次，按时间顺序排列 */
  conversations: Conversation[];
}
