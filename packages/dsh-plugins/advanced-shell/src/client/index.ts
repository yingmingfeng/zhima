/**
 * zhima 桌面窗口增强（advanced shell）客户端入口。
 *
 * 裁剪自 dsh-plugin-desktop 的 src/client/index.ts：只保留 advanced shell
 * 部分，砍掉 settings / workspace-folder-drop / directory-picker / boot-health。
 * 通过 window.location.search 的 dsh-desktop-mode 标记判断当前 BrowserWindow
 * 呈现模式；仅 advanced 模式接管 root 槽（AdvancedFrame）。
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
import { applyAdvancedShell } from './advanced-shell';
import { parseDesktopClientEnvironment } from './environment';

export { applyAdvancedShell } from './advanced-shell';
export { parseDesktopClientEnvironment } from './environment';
export type {
  DesktopClientEnvironment,
  DesktopClientMode,
  DesktopClientPlatform,
} from './environment';

/** Services required by the advanced presentation. */
export const inject = ['slots', 'theme'];

/** Register desktop-owned client surfaces for the current BrowserWindow mode. */
export function apply(ctx: ClientContext): void {
  const environment = parseDesktopClientEnvironment(window.location.search);
  if (!environment) return;
  if (environment.mode === 'advanced') applyAdvancedShell(ctx, environment);
}
