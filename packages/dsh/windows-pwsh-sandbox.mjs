/**
 * Electron adapter for the upstream Windows ACL PowerShell executor (H5).
 * Ported from dsh-plugin-desktop/src/windows-pwsh-sandbox.ts。
 * 独立 ESM 模块，被 Cordis Loader 动态 import（profile patch 以 file:// URL 引用）。
 * 核心：固定 pwsh 路径（避开 PATH 便携 pwsh）+ 为 ACL runner argv 插入 Node-mode trampoline。
 */
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { win32 } from 'node:path';
import { SandboxPwshExecutor } from '@deepseek-ai/dsh-pwsh-sandbox';

const RUN_AS_NODE = 'ELECTRON_RUN_AS_NODE';
const UPSTREAM_RUNNER = fileURLToPath(
  import.meta.resolve('@deepseek-ai/dsh-sandbox-windows-acl/runner'),
);
const DESKTOP_TRAMPOLINE = fileURLToPath(
  new URL('./windows-acl-runner.mjs', import.meta.url),
);

/** Windows PowerShell 路径，不依赖 PATH 提供的便携运行时。 */
export function desktopWindowsPwshPath(env, platform, exists = existsSync) {
  if (platform !== 'win32') return undefined;
  const programFiles = env.ProgramFiles ?? 'C:\\Program Files';
  const systemRoot = env.SystemRoot ?? 'C:\\Windows';
  const candidates = [
    win32.join(programFiles, 'PowerShell', '7', 'pwsh.exe'),
    win32.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
  ];
  return candidates.find((candidate) => exists(candidate));
}

/** 保留显式用户配置，否则避免 ACL 沙箱里 PATH 解析的便携 pwsh。 */
export function desktopWindowsPwshConfig(config, env, platform, exists = existsSync) {
  if (config.pwshPath !== undefined && config.pwshPath.length > 0) return config;
  const pwshPath = desktopWindowsPwshPath(env, platform, exists);
  return pwshPath === undefined ? config : { ...config, pwshPath };
}

/** 为 exact upstream ACL runner launch 插入 Node-mode trampoline。 */
export function adaptWindowsAclExecution(spec, argv, adaptation) {
  const [program, runner, ...args] = argv;
  if (
    adaptation.platform !== 'win32' ||
    !adaptation.electron ||
    program !== adaptation.execPath ||
    runner !== adaptation.upstreamRunner
  ) {
    return { spec, argv };
  }
  const env = { ...spec.env };
  for (const key of Object.keys(env)) {
    if (key.toUpperCase() === RUN_AS_NODE) delete env[key];
  }
  env[RUN_AS_NODE] = '1';
  return {
    spec: { ...spec, env },
    argv: [adaptation.execPath, adaptation.trampoline, adaptation.upstreamRunner, ...args],
  };
}

/** PowerShell 沙箱 provider：只修复 Electron 宿主下的 Windows ACL 启动。 */
export class DesktopWindowsPwshSandbox extends SandboxPwshExecutor {
  constructor(ctx, config) {
    super(ctx, desktopWindowsPwshConfig(config, process.env, process.platform));
  }

  adapt(spec, argv) {
    return adaptWindowsAclExecution(spec, argv, {
      platform: process.platform,
      electron: process.versions.electron !== undefined,
      execPath: process.execPath,
      upstreamRunner: UPSTREAM_RUNNER,
      trampoline: DESKTOP_TRAMPOLINE,
    });
  }

  async runArgv(spec, argv) {
    const adapted = this.adapt(spec, argv);
    return super.runArgv(adapted.spec, adapted.argv);
  }

  startArgv(spec, argv) {
    const adapted = this.adapt(spec, argv);
    return super.startArgv(adapted.spec, adapted.argv);
  }
}

export default DesktopWindowsPwshSandbox;
