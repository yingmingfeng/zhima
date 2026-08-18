/**
 * H3 last-known-good 只读侧：记录 profile 启动健康状态。
 *
 * 状态文件存于 DSH_HOME 下，renderer 上报 healthy 时把当前 profile 提升为 lastKnownGood；
 * 失败时日志给出 lastKnownGood + 手动恢复提示。自动回滚/relaunch 留后续里程碑。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { logger } from '@main/logger';

import { DSH_HOME } from './boot';

interface DshProfileStateV1 {
  version: 1;
  lastKnownGood?: string;
}

const STATE_FILE = join(DSH_HOME, 'profile-state.json');

function readState(): DshProfileStateV1 {
  try {
    if (existsSync(STATE_FILE)) {
      const parsed: unknown = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        (parsed as { version?: unknown }).version === 1
      ) {
        return parsed as DshProfileStateV1;
      }
    }
  } catch {
    // 状态文件损坏时回退默认，不阻塞 boot
  }
  return { version: 1 };
}

function writeState(state: DshProfileStateV1): void {
  mkdirSync(dirname(STATE_FILE), { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n');
}

/** 标记 profile 健康（renderer 上报 healthy 时调用），提升为 lastKnownGood。 */
export function markDshProfileHealthy(profileName: string): void {
  const state = readState();
  if (state.lastKnownGood === profileName) return;
  state.lastKnownGood = profileName;
  writeState(state);
  logger.info('[dsh] lastKnownGood profile =', profileName);
}

/** 读取 lastKnownGood profile（后续回滚/诊断用）。 */
export function getLastKnownGoodProfile(): string | undefined {
  return readState().lastKnownGood;
}
