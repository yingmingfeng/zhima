/**
 * DSH 相关 IPC 通道常量
 */

/** 打开 DSH 窗口（渲染进程 → 主进程，invoke） */
export const IPC_DSH_OPEN = 'dsh:open';

/** 查询当前 DSH 状态（渲染进程 → 主进程，invoke） */
export const IPC_DSH_GET_STATE = 'dsh:get-state';

/** 状态变更推送（主进程 → 渲染进程，event） */
export const IPC_DSH_STATE_CHANGED = 'dsh:state-changed';

/** 请求确认切换 profile（主进程 → 渲染进程，event，payload: string profileName） */
export const IPC_DSH_PROFILE_SWITCH_REQUEST = 'dsh:profile-switch-request';

/** 确认/取消切换 profile（渲染进程 → 主进程，invoke，payload: { name, confirmed }） */
export const IPC_DSH_PROFILE_SWITCH_CONFIRM = 'dsh:profile-switch-confirm';

/** 请求切换运行模式（主进程 → 渲染进程，event，payload: 'builtin' | 'external'） */
export const IPC_DSH_MODE_SWITCH_REQUEST = 'dsh:mode-switch-request';

/** 确认/取消切换运行模式（渲染进程 → 主进程，invoke，payload: { mode, port?, confirmed }） */
export const IPC_DSH_MODE_SWITCH_CONFIRM = 'dsh:mode-switch-confirm';

/** DSH 进度/结果 toast（主进程 → 渲染进程，event，payload: { message, type }） */
export const IPC_DSH_TOAST = 'dsh:toast';
