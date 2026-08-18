/**
 * DSH 相关 IPC 通道常量
 */

/** 打开 DSH 窗口（渲染进程 → 主进程，invoke） */
export const IPC_DSH_OPEN = 'dsh:open';

/** 查询当前 DSH 状态（渲染进程 → 主进程，invoke） */
export const IPC_DSH_GET_STATE = 'dsh:get-state';

/** 状态变更推送（主进程 → 渲染进程，event） */
export const IPC_DSH_STATE_CHANGED = 'dsh:state-changed';
