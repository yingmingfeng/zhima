/**
 * Copyright (c) 2026 yingmingfeng
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 内置模式下对"当前选中 profile 的用户插件集合"做卡片式对比：
 * 由调用方在「检查插件变更」（托盘手动触发）时调用一次 check()。
 *
 * 背景：DSH 对插件 add/remove 无热加载（watchUserPatches 只 watch 用户 patch 文件，
 * 不监听 bundle 列表/插件目录），插件变化只能靠"重建会话树（重新 boot）"生效。
 * 这里提供轻量感知：boot 时记基线（= zhima 当前实际加载的插件），
 * 之后 check() 只读对比、不更新基线；重启插件（重新 boot）后基线才重置。
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** profile 的"插件签名"：反映用户已安装的 out-of-tree 插件集合。 */
export interface PluginSignature {
  /** profile/package.json 的 dsh.profile.bundles（排序去重）。 */
  bundles: string[];
  /** node_modules 顶层非 @deepseek-ai/@zhima 的用户包名（含 scope 展开），代表用户自己装的插件。 */
  userPackages: string[];
}

/** 一次签名对比的差异。 */
export interface PluginDiff {
  added: string[];
  removed: string[];
}

/** 内置内置插件 scope（这些是 DSH 自带的，不属于用户安装的插件，不纳入签名）。 */
const BUILTIN_SCOPES = new Set(['@deepseek-ai', '@zhima']);

/**
 * 读取当前 profile 的插件签名。
 * @param profileDir - 选中 profile 的目录（~/.dsh/profiles/<name>）。
 */
export function readPluginSignature(profileDir: string): PluginSignature {
  const bundles = readProfileBundles(profileDir);
  const userPackages = readUserPackages(join(profileDir, 'node_modules'));
  return { bundles, userPackages };
}

/** 读 profile/package.json 的 dsh.profile.bundles（缺失/损坏时回退空数组）。 */
function readProfileBundles(profileDir: string): string[] {
  try {
    const manifest = JSON.parse(
      readFileSync(join(profileDir, 'package.json'), 'utf8'),
    ) as { dsh?: { profile?: { bundles?: unknown } } };
    const raw = manifest?.dsh?.profile?.bundles;
    if (!Array.isArray(raw)) return [];
    return [
      ...new Set(
        raw.filter((item): item is string => typeof item === 'string'),
      ),
    ].sort();
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw cause;
  }
}

/** 扫描 profile/node_modules 下由用户安装的（非内置 scope）顶层包。 */
function readUserPackages(nodeModulesDir: string): string[] {
  const out: string[] = [];
  if (!existsSync(nodeModulesDir)) return out;
  for (const entry of readdirSync(nodeModulesDir, { withFileTypes: true })) {
    const name = entry.name;
    if (name.startsWith('@')) {
      if (BUILTIN_SCOPES.has(name) || !entry.isDirectory()) continue;
      const scopeDir = join(nodeModulesDir, name);
      if (!existsSync(scopeDir)) continue;
      for (const sub of readdirSync(scopeDir, { withFileTypes: true })) {
        if (sub.isDirectory() && !sub.name.startsWith('.')) {
          out.push(`${name}/${sub.name}`);
        }
      }
    } else if (!name.startsWith('.') && !BUILTIN_SCOPES.has(name)) {
      out.push(name);
    }
  }
  return out.sort();
}

/** 对比两个签名，返回新增/移除的包。 */
export function diffSignatures(
  prev: PluginSignature,
  curr: PluginSignature,
): PluginDiff {
  const prevSet = new Set([...prev.bundles, ...prev.userPackages]);
  const currSet = new Set([...curr.bundles, ...curr.userPackages]);
  const added = [...currSet].filter((item) => !prevSet.has(item)).sort();
  const removed = [...prevSet].filter((item) => !currSet.has(item)).sort();
  return { added, removed };
}

/** 插件变化检测器：持有上次基线，check() 时对比当前签名。 */
export interface PluginChangeDetector {
  /** 执行一次检查。有变化返回 diff（并更新基线，避免重复提示）；无变化返回 null。 */
  check(): PluginDiff | null;
}

/**
 * 创建插件变化检测器：基线固定为创建时（zhima 最近一次 boot 后）的磁盘签名。
 * 基线代表"zhima 当前实际加载的插件"；check() 只读对比、不更新基线，
 * 重启插件（重新 boot）后才会重建为新磁盘签名。
 */
export function createPluginChangeDetector(
  profileDir: string,
): PluginChangeDetector {
  const baseline = readPluginSignature(profileDir);
  return {
    check() {
      const current = readPluginSignature(profileDir);
      const diff = diffSignatures(baseline, current);
      if (diff.added.length === 0 && diff.removed.length === 0) return null;
      return diff;
    },
  };
}
