/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 *
 * Portions Copyright 2024-present zutron. All rights reserved.
 * Use of this source code is governed by a MIT license that can be
 * found in https://github.com/goosewobbler/zutron
 */
/**
 * 渲染进程全局状态管理 Hook。
 *
 * 核心职责：
 * 将主进程（Main Process）中的 AppState 通过 IPC 桥接同步到渲染进程，
 * 并包装为 Zustand React Hook，使各组件可以响应式地订阅主进程状态变化。
 *
 * 数据流：
 *   主进程 Store（AppState，唯一数据源）
 *     → preload/index.ts 通过 contextBridge 暴露 window.zustandBridge
 *       → bridge.getState()  获取初始状态（IPC invoke）
 *       → bridge.subscribe() 监听状态变更推送（IPC on）
 *     → Zustand vanilla store 接收并存储状态
 *       → useZustandStore React Hook 订阅状态变化，驱动组件重渲染
 *
 * 设计说明：
 * - 状态完全由主进程掌控（single source of truth），渲染进程只做镜像订阅
 * - 渲染进程无法直接 setState，所有状态变更必须通过 IPC 通知主进程
 * - 基于 zutron 项目的桥接模式改造，适配 Electron IPC 通信
 */

import { useStore as useZustandStore, type StoreApi } from 'zustand';
import { createStore as createZustandStore } from 'zustand/vanilla';
import type { AppState } from '@main/store/types';

/**
 * IPC 桥接接口，由 preload 脚本通过 contextBridge 注入到 window 对象。
 * 定义了渲染进程与主进程之间的状态同步契约。
 */
export interface Handlers<S extends AnyState> {
  /** 通过 IPC invoke 获取主进程的完整状态快照 */
  getState(): Promise<S>;
  /**
   * 订阅主进程的状态变更推送。
   * @param callback - 主进程状态变更时的回调，接收最新状态
   * @returns 取消订阅的清理函数
   */
  subscribe(callback: (newState: S) => void): () => void;
}

type AnyState = Record<string, unknown>;

/**
 * 创建与主进程同步的 Zustand vanilla store。
 *
 * 该 store 本身不持有任何业务状态的初始值（返回空对象 {}），
 * 所有状态数据均通过 bridge 从主进程获取并同步：
 * 1. subscribe — 监听主进程推送的状态变更，实时调用 setState 更新本地镜像
 * 2. getState  — 获取初始状态快照，完成首次数据填充
 *
 * @param bridge - preload 注入的 IPC 桥接对象
 * @returns Zustand vanilla store，状态与主进程保持最终一致
 */
const createStore = <S extends AnyState>(bridge: Handlers<S>): StoreApi<S> => {
  const store = createZustandStore<Partial<S>>(
    (setState: StoreApi<S>['setState']) => {
      // 订阅主进程状态变更推送，收到新状态后同步到本地 store
      bridge.subscribe((state) => setState(state));

      // 获取初始状态快照，完成 store 的首次数据填充
      bridge.getState().then((state) => setState(state));

      // 初始返回空对象，所有状态键的值均由主进程提供
      return {};
    },
  );

  return store as StoreApi<S>;
};

/** 从 StoreApi 中提取状态类型 T */
type ExtractState<S> = S extends { getState: () => infer T } ? T : never;

/**
 * 只读 Store API 类型，仅暴露读取和订阅能力，
 * 不包含 setState 等写入方法，确保渲染进程无法直接修改状态。
 */
type ReadonlyStoreApi<T> = Pick<
  StoreApi<T>,
  'getState' | 'getInitialState' | 'subscribe'
>;

/**
 * 绑定到特定 store 的 Hook 类型。
 * - 无参调用：返回完整状态
 * - 传入 selector：返回选中片段，实现细粒度订阅，避免不必要的重渲染
 */
type UseBoundStore<S extends ReadonlyStoreApi<unknown>> = {
  (): ExtractState<S>;
  <U>(selector: (state: ExtractState<S>) => U): U;
} & S;

/**
 * 将 IPC bridge 封装为可在 React 组件中使用的 Zustand Hook。
 *
 * 流程：
 * 1. 调用 createStore 创建与主进程同步的 vanilla store
 * 2. 将 vanilla store 包装为 React Hook（useZustandStore）
 * 3. 将 store 的 getState / subscribe 等方法合并到 Hook 函数上，
 *    使其既可以作为 Hook 调用，也可以直接调用 getState() 获取当前快照
 *
 * @param bridge - preload 注入的 IPC 桥接对象（window.zustandBridge）
 * @returns 绑定了主进程状态的 React Hook
 */
const createUseStore = <S extends AppState>(
  bridge: Handlers<S>,
): UseBoundStore<StoreApi<S>> => {
  console.log('bridge', bridge);
  // 创建与主进程保持同步的 vanilla store
  const vanillaStore = createStore<S>(bridge);
  // 包装为 React Hook，支持 selector 细粒度订阅
  const useBoundStore = (selector: (state: S) => unknown) =>
    useZustandStore(vanillaStore, selector);

  // 将 vanilla store 的 API（getState, subscribe 等）合并到 Hook 函数上
  Object.assign(useBoundStore, vanillaStore);

  return useBoundStore as UseBoundStore<StoreApi<S>>;
};

/**
 * 全局状态 Hook —— 渲染进程中所有组件通过此 Hook 订阅主进程状态。
 *
 * 使用方式：
 * - 订阅全部状态：`const state = useStore()`
 * - 细粒度订阅：`const messages = useStore(state => state.messages)`
 * - 直接读取快照：`const state = useStore.getState()`
 */
export const useStore = createUseStore<AppState>(window.zustandBridge);

/**
 * 直接获取当前状态快照（非响应式）。
 * 适用于在非 React 上下文中读取最新状态，如工具函数或事件处理中。
 */
export const getState = useStore.getState;
