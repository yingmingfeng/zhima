/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * 系统权限检查 Hook。
 *
 * 职责：
 * 通过 SWR (全称是 stale-while-revalidate（过期时重新验证）)轮询主进程的系统权限状态，确保 Agent 运行前
 * 「屏幕录制」和「辅助功能」两项 macOS 系统权限已授予。
 *
 * 数据流：
 *   渲染进程（本文件）
 *     → useStore 订阅主进程 store.ensurePermissions
 *     → SWR 定时/聚焦触发重新校验
 *     → IPC invoke → 主进程 permissionRoute.getEnsurePermissions
 *       → macOS: 调用 node-mac-permissions 检查真实权限状态
 *       → 其他 OS: 直接返回 { screenCapture: true, accessibility: true }
 *
 * 使用场景：
 *   useRunAgent.ts 在启动 Agent 前调用 ensurePermissions 判断权限是否就绪，
 *   未就绪时 toast 警告用户并阻止启动。
 */

import useSWR from 'swr';

import { useStore } from '@renderer/hooks/useStore';
import { api } from '@renderer/api';

/**
 * 获取系统权限状态并提供手动重新校验的方法。
 *
 * @returns
 * - `ensurePermissions` — 当前权限快照 `{ screenCapture?: boolean; accessibility?: boolean }`
 * - `getEnsurePermissions` — 触发一次权限重新校验（返回最新状态）
 */
export const usePermissions = () => {
  // 从主进程 store 订阅权限状态，状态变化时自动触发组件重渲染
  const ensurePermissions = useStore((store) => store.ensurePermissions);

  /**
   * 使用 SWR 管理权限状态的轮询与刷新。
   *
   * 校验逻辑：
   * 1. 先检查本地缓存（ensurePermissions）是否已包含全部 true
   * 2. 若已全部授权 → 直接返回缓存，无需 IPC 调用
   * 3. 若未全部授权 → 通过 IPC 调用主进程 getEnsurePermissions 重新检测
   */
  const { mutate: getEnsurePermissions } = useSWR(
    'permissions',
    async () => {
      const hasPermissionsData = Object.values(ensurePermissions || {});
      const hasAllPermissions =
        hasPermissionsData.length > 0 &&
        hasPermissionsData.every((permission) => permission === true);

      // 权限未全部授予时，请求主进程重新检测
      if (!hasAllPermissions) {
        return await api.getEnsurePermissions();
      }
      // 权限已全部授予，直接返回缓存
      return ensurePermissions;
    },
    {
      // 窗口重新获得焦点时重新校验（用户可能刚去系统设置里授权了）
      revalidateOnFocus: true,
      // 组件挂载时立即校验一次
      revalidateOnMount: true,
      // 聚焦触发校验的节流间隔，避免频繁切换窗口时重复 IPC 调用
      focusThrottleInterval: 500,
    },
  );

  return { ensurePermissions, getEnsurePermissions };
};
