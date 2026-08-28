/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { get, set, del, entries, createStore } from 'idb-keyval';
import { v4 } from 'uuid';
import { Operator } from '@main/store/types';

/**
 * 会话元信息，描述一次 Agent 会话的运行环境配置。
 * 使用索引签名 `[key: string]: any` 以支持未来扩展自定义字段。
 */
export interface SessionMetaInfo {
  /** 操作器类型（本地电脑 / 浏览器等） */
  operator: Operator;
  /** Agent 操作的工作目录，AI 产出的文件默认存放于此 */
  workspacePath?: string;
  [key: string]: any;
}

/**
 * 单条会话记录，对应侧边栏会话列表中的一个条目。
 * 仅管理会话元数据，不包含具体聊天消息（消息由独立模块管理）。
 */
export interface SessionItem {
  /** 唯一标识，格式: session_{timestamp}_{uuid} */
  id: string;
  /** 会话名称，用户可编辑 */
  name: string;
  /** 会话元信息（操作器类型、工作目录等） */
  meta: SessionMetaInfo;
  /** 创建时间戳（ms） */
  createdAt: number;
  /** 最后更新时间戳（ms），每次修改自动刷新 */
  updatedAt: number;
}

/** IndexedDB 数据库名称 */
const DBName = 'ui_zhima_db';

/**
 * 会话专用的 IndexedDB store 实例。
 * 使用 idb-keyval 的 createStore 隔离到独立的 object store ("sessions")，
 * 避免与同数据库下其他 store 互相干扰。
 */
const sessionStore = createStore(DBName, 'sessions');

/**
 * 会话管理器 —— 提供会话的 CRUD 操作。
 * 底层基于 IndexedDB（通过 idb-keyval），数据在渲染进程内持久化。
 */
export class SessionManager {
  /**
   * 创建新会话并写入 IndexedDB。
   * @param name - 会话名称
   * @param meta - 会话元信息，默认使用本地电脑操作器
   * @returns 创建完成的会话对象
   */
  async createSession(
    name: string,
    meta: SessionMetaInfo = { operator: Operator.LocalComputer },
  ): Promise<SessionItem> {
    const now = Date.now();
    const session: SessionItem = {
      // ID 由时间戳 + UUID 组成，兼顾排序性与全局唯一性
      id: `session_${now}_${v4()}`,
      name,
      createdAt: now,
      updatedAt: now,
      meta,
    };

    await set(session.id, session, sessionStore);
    return session;
  }

  /**
   * 根据 ID 获取单个会话。
   * @returns 会话对象，不存在时返回 null / undefined
   */
  async getSession(id: string): Promise<SessionItem | null | undefined> {
    return await get(id, sessionStore);
  }

  /**
   * 获取所有会话，按存储顺序返回。
   * 注意：此处未做排序，如需按时间排序请在调用侧处理。
   */
  async getAllSessions(): Promise<SessionItem[]> {
    const items = await entries(sessionStore);
    return items.map(([_, value]) => value as SessionItem);
  }

  /**
   * 部分更新会话的名称或元信息，自动刷新 updatedAt。
   * @param id - 目标会话 ID
   * @param updates - 需要更新的字段（name / meta）
   * @returns 更新后的会话，会话不存在时返回 null
   */
  async updateSession(
    id: string,
    updates: Partial<Pick<SessionItem, 'name' | 'meta'>>,
  ): Promise<SessionItem | null> {
    const session = await this.getSession(id);
    if (!session) return null;

    const updatedSession: SessionItem = {
      ...session,
      ...updates,
      updatedAt: Date.now(),
    };

    await set(id, updatedSession, sessionStore);
    return updatedSession;
  }

  /**
   * 删除指定会话。
   * @returns 是否删除成功（会话不存在时返回 false）
   */
  async deleteSession(id: string): Promise<boolean> {
    const session = await this.getSession(id);
    if (!session) return false;

    await del(id, sessionStore);
    return true;
  }
}

/** 全局单例，整个渲染进程共享同一个 SessionManager 实例以保证数据一致性 */
export const sessionManager = new SessionManager();
