/**
 * zhima DSH 运行状态持久化：运行模式（内置/外部）、选中 profile、外部端口。
 *
 * 状态文件位于 Electron userData/profile-selection/state.json（与 DSH Desktop
 * 的 profile-selection 结构一致），是 zhima 应用私有状态，不污染 ~/.dsh
 * （~/.dsh 是 dsh 官方用户数据，凭据/设置/会话/profile 由 dsh 生态读写）。
 * 运行模式取代了原来的 DSH_WEB_DEV / DSH_WEB_PROFILE 环境变量：
 * 切换无需重启 zhima，直接持久化后按需生效。
 */
import { app } from 'electron';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

/** DSH 运行模式：builtin=主进程内置 boot；external=连接外部手动启动的实例。 */
export type DshRunMode = 'builtin' | 'external';

/** zhima DSH 私有状态目录（Electron userData/dsh/profile-selection，与 DSH Desktop 对齐）。 */
export const DSH_STATE_DIR = join(
  app.getPath('userData'),
  'dsh',
  'profile-selection',
);

const STATE_FILE = join(DSH_STATE_DIR, 'state.json');

/** 默认 profile：本质是 web profile，仅名称换成 zhima-desktop（后续迭代差异）。 */
export const DEFAULT_DSH_PROFILE = 'zhima-desktop';

/** 外部模式默认端口（dsh web 默认 3080）。 */
export const DEFAULT_EXTERNAL_PORT = 3080;

interface ZhimaDshStateV1 {
  version: 1;
  /** 当前运行模式。 */
  mode: DshRunMode;
  /** 内置模式下加载的 profile。 */
  selectedProfile: string;
  /** 外部模式连接端口。 */
  externalPort: number;
}

function defaultState(): ZhimaDshStateV1 {
  return {
    version: 1,
    mode: 'builtin',
    selectedProfile: DEFAULT_DSH_PROFILE,
    externalPort: DEFAULT_EXTERNAL_PORT,
  };
}

function readState(): ZhimaDshStateV1 {
  try {
    if (existsSync(STATE_FILE)) {
      const parsed: unknown = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        (parsed as { version?: unknown }).version === 1
      ) {
        const value = parsed as Partial<ZhimaDshStateV1>;
        return {
          version: 1,
          mode: value.mode === 'external' ? 'external' : 'builtin',
          selectedProfile:
            typeof value.selectedProfile === 'string' &&
            value.selectedProfile.length > 0
              ? value.selectedProfile
              : DEFAULT_DSH_PROFILE,
          externalPort:
            typeof value.externalPort === 'number' &&
            Number.isInteger(value.externalPort) &&
            value.externalPort > 0 &&
            value.externalPort <= 65535
              ? value.externalPort
              : DEFAULT_EXTERNAL_PORT,
        };
      }
    }
  } catch {
    // 状态文件损坏时回退默认，不阻塞后续流程
  }
  return defaultState();
}

/** 原子写状态文件（临时文件 + rename），避免半写状态。 */
function writeState(state: ZhimaDshStateV1): void {
  mkdirSync(DSH_STATE_DIR, { recursive: true });
  const temporary = `${STATE_FILE}.${process.pid}.tmp`;
  try {
    writeFileSync(temporary, JSON.stringify(state, null, 2) + '\n', 'utf8');
    renameSync(temporary, STATE_FILE);
  } finally {
    try {
      if (existsSync(temporary)) unlinkSync(temporary);
    } catch {
      // 清理失败不影响主流程
    }
  }
}

/** 当前运行模式（默认 builtin）。 */
export function getDshRunMode(): DshRunMode {
  return readState().mode;
}

/** 内置模式下选中的 profile（默认 zhima-desktop）。 */
export function getSelectedDshProfile(): string {
  return readState().selectedProfile;
}

/** 外部模式连接端口（默认 3080）。 */
export function getExternalDshPort(): number {
  return readState().externalPort;
}

/** 持久化运行模式。 */
export function setDshRunMode(mode: DshRunMode): void {
  const state = readState();
  writeState({ ...state, mode });
}

/** 持久化选中的 profile。 */
export function setSelectedDshProfile(profile: string): void {
  const state = readState();
  writeState({ ...state, selectedProfile: profile });
}

/** 持久化外部模式端口。 */
export function setExternalDshPort(port: number): void {
  const state = readState();
  writeState({ ...state, externalPort: port });
}
