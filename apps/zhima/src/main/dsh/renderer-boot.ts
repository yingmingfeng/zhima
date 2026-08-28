/**
 * M3 renderer boot health：让「boot() 成功但 web UI 没起来」可见可诊断。
 *
 * 参考 dsh-plugin-desktop/src/renderer-boot.ts + client/boot-health.ts 裁剪：
 * - 主进程在 webServer 注册上报路由（与 dsh 同 path，未来接真实 client Loader 报告也兼容）
 * - DSH 窗口加载后注入探针：以 `window.__DSH_BOOT__` 出现 + 页面有内容为「就绪」信号，
 *   超时未就绪则上报 failed —— 捕获「UI 彻底没起来」这类 boot() 看不到的失败。
 */
import type { IncomingMessage, ServerResponse } from 'node:http';

import type { Context } from '@deepseek-ai/cordis';
// 加载 webServer 的 Context 声明合并。
import type {} from '@deepseek-ai/dsh-host-webserver';

import { logger } from '@main/logger';

export const RENDERER_BOOT_REPORT_PATH = '/_dsh/desktop/renderer-boot';

/** dsh 与桌面宿主之间的 renderer 启动结果契约（与上游保持一致）。 */
export type RendererBootReport =
  | { status: 'healthy' }
  | { status: 'failed'; plugins: string[]; error?: string };

const MAX_REPORT_BYTES = 16 * 1024;
const MAX_FAILED_PLUGINS = 64;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseReport(value: unknown): RendererBootReport | undefined {
  if (!isRecord(value)) return undefined;
  if (value.status === 'healthy') return { status: 'healthy' };
  if (
    value.status !== 'failed' ||
    !Array.isArray(value.plugins) ||
    value.plugins.length > MAX_FAILED_PLUGINS
  ) {
    return undefined;
  }
  if (
    !value.plugins.every(
      (plugin) =>
        typeof plugin === 'string' && plugin.length > 0 && plugin.length <= 512,
    )
  ) {
    return undefined;
  }
  if (
    value.error !== undefined &&
    (typeof value.error !== 'string' || value.error.length > 12 * 1024)
  ) {
    return undefined;
  }
  return {
    status: 'failed',
    plugins: [...value.plugins],
    ...(value.error === undefined ? {} : { error: value.error }),
  };
}

async function readReport(
  req: IncomingMessage,
): Promise<RendererBootReport | undefined> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const bytes: Buffer = Buffer.isBuffer(chunk)
      ? chunk
      : Buffer.from(chunk as Uint8Array);
    size += bytes.byteLength;
    if (size > MAX_REPORT_BYTES) return undefined;
    chunks.push(bytes);
  }
  try {
    return parseReport(
      JSON.parse(
        Buffer.concat(
          chunks as unknown as readonly Uint8Array<ArrayBufferLike>[],
        ).toString('utf8'),
      ),
    );
  } catch {
    return undefined;
  }
}

function finish(res: ServerResponse, statusCode: number): void {
  res.statusCode = statusCode;
  res.end();
}

/** 校验并转发一条同源 renderer Loader 结果。 */
export async function handleRendererBootRequest(
  req: IncomingMessage,
  res: ServerResponse,
  expectedOrigin: string,
  report: (value: RendererBootReport) => void,
): Promise<void> {
  if (req.method !== 'POST') return finish(res, 405);
  if (req.headers.origin !== expectedOrigin) return finish(res, 403);
  if (
    req.headers['content-type']?.split(';', 1)[0]?.trim().toLowerCase() !==
    'application/json'
  ) {
    return finish(res, 415);
  }
  const value = await readReport(req);
  if (value === undefined) return finish(res, 400);
  report(value);
  finish(res, 204);
}

/**
 * 在已 boot 的 ctx 上注册 renderer boot 上报路由。
 * @returns 移除路由的 disposer（重复注册会抛错，调用方需保证只注册一次）。
 */
export function registerRendererBootRoute(
  ctx: Context,
  onReport: (report: RendererBootReport) => void,
): () => void {
  const expectedOrigin = `http://127.0.0.1:${String(ctx.webServer.port)}`;
  return ctx.webServer.register({
    kind: 'exact',
    path: RENDERER_BOOT_REPORT_PATH,
    handler: (req, res) => {
      void handleRendererBootRequest(req, res, expectedOrigin, onReport);
    },
  });
}

/**
 * 向 DSH 窗口注入 boot 探针：轮询 `window.__DSH_BOOT__`，就绪上报 healthy，超时上报 failed。
 * 注入失败只告警，不阻塞窗口使用。
 */
export function injectRendererBootProbe(
  webContents: Electron.WebContents,
  timeoutMs = 15000,
): void {
  const script = `(async () => {
    const path = ${JSON.stringify(RENDERER_BOOT_REPORT_PATH)};
    const deadline = Date.now() + ${timeoutMs};
    const post = (report) =>
      fetch(path, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(report),
      }).catch(() => {});
    while (Date.now() < deadline) {
      try {
        const boot = window.__DSH_BOOT__;
        const hasContent = document.body && document.body.children.length > 0;
        if (boot && typeof boot === 'object' && hasContent) {
          await post({ status: 'healthy' });
          return;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 500));
    }
    await post({
      status: 'failed',
      plugins: ['web-boot-timeout'],
      error: 'web UI ${timeoutMs}ms 内未就绪',
    });
  })();`;

  void webContents.executeJavaScript(script, true).catch((cause: unknown) => {
    logger.warn('[dsh] renderer boot 探针执行失败:', cause);
  });
}
