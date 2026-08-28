/**
 * hello-plugin（host 端）：DSH 插件加载测试。
 *
 * host 端运行在 Node 主进程，没有 window/preload 概念；
 * Electron preload 注入检测放在 client 端（src/client/index.ts，浏览器环境）。
 */
import type { Context } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';

export const name = 'hello-plugin';

export interface Config {
  greeting: string;
  maxRetries: number;
  verbose?: boolean;
}

export const Config: Schema<Config> = Schema.object({
  greeting: Schema.string().default('Hello'),
  maxRetries: Schema.number().default(3),
  verbose: Schema.boolean().default(false),
});

export function apply(ctx: Context, config: Config) {
  console.log(
    `[hello-plugin] plugin loaded! greeting=${config.greeting} maxRetries=${config.maxRetries} verbose=${config.verbose}`,
  );
  // client 端（浏览器）会检测 Electron preload 注入；host 端无需额外逻辑。
}