/**
 * Copyright (c) 2026 yingmingfeng
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 包覆盖选择：在安装树与 profile 目录之间按 SemVer 择优，决定裸包名从哪解析。
 *
 * 参考：社区版 deepseek-harness-desktop 的 `src/package-overlay.ts`
 * （@types/node 20 未导出 findPackageJSON，运行时 Node 24 可用，这里手动取用）
 */
import Module from 'node:module';
import { readFileSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import { compare, valid } from 'semver';

const BIN_NAME = 'zhima-dsh';
const MAX_MANIFEST_BYTES = 1024 * 1024;
const MAX_VERSION_LENGTH = 128;

// @types/node 20 未导出 findPackageJSON（Node 22.16+ 才有），运行时 Node 24 可用。
const findPackageJSON = (
  Module as typeof Module & {
    findPackageJSON(specifier: string, baseURL: string): string | undefined;
  }
).findPackageJSON;

export type PackageOverlaySource = 'install' | 'profile';

export interface PackageOverlayCandidate {
  readonly packageName: string;
  readonly packageDir: string;
  readonly manifestPath: string;
  readonly version?: string;
  readonly source: PackageOverlaySource;
}

export interface PackageOverlaySelection {
  readonly packageName: string;
  readonly selected: PackageOverlayCandidate;
  readonly install?: PackageOverlayCandidate;
  readonly profile?: PackageOverlayCandidate;
}

export interface PackageOverlayOptions {
  /** 安装树内某包 package.json 的 file URL（解析锚点）。 */
  readonly installPackageUrl: string;
  /** 当前 profile 的 package.json file URL。 */
  readonly profilePackageUrl: string;
}

export class PackageOverlayNotFoundError extends Error {
  constructor(packageName: string) {
    super(
      `${BIN_NAME}: cannot resolve package ${JSON.stringify(packageName)} ` +
        'from the installation tree or active Profile',
    );
    this.name = 'PackageOverlayNotFoundError';
  }
}

function missingPackage(cause: unknown): boolean {
  return (
    (cause as NodeJS.ErrnoException | null)?.code === 'ERR_MODULE_NOT_FOUND'
  );
}

function readCandidate(
  packageName: string,
  packageUrl: string,
  source: PackageOverlaySource,
): PackageOverlayCandidate | undefined {
  let manifestPath: string | undefined;
  try {
    manifestPath = findPackageJSON(packageName, packageUrl);
  } catch (cause) {
    if (missingPackage(cause)) return undefined;
    throw cause;
  }
  if (manifestPath === undefined) return undefined;
  const size = statSync(manifestPath).size;
  if (size > MAX_MANIFEST_BYTES) {
    throw new Error(
      `${BIN_NAME}: ${source} package manifest is too large for ${packageName}`,
    );
  }
  let manifest: unknown;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown;
  } catch (cause) {
    throw new Error(
      `${BIN_NAME}: cannot read ${source} package manifest for ${packageName}: ` +
        `${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
  if (
    manifest === null ||
    typeof manifest !== 'object' ||
    Array.isArray(manifest) ||
    (manifest as { name?: unknown }).name !== packageName
  ) {
    throw new Error(
      `${BIN_NAME}: ${source} package identity is invalid for ${packageName}`,
    );
  }
  const version = (manifest as { version?: unknown }).version;
  const comparableVersion =
    typeof version === 'string' &&
    version.length > 0 &&
    version.length <= MAX_VERSION_LENGTH &&
    valid(version) !== null
      ? version
      : undefined;
  return {
    packageName,
    packageDir: dirname(manifestPath),
    manifestPath,
    source,
    ...(comparableVersion === undefined ? {} : { version: comparableVersion }),
  };
}

/** 从一个 loader 裸包说明符提取 npm 包根名。 */
export function packageNameFromSpecifier(
  specifier: string,
): string | undefined {
  if (
    specifier.length === 0 ||
    specifier.startsWith('.') ||
    specifier.startsWith('/') ||
    specifier.startsWith('#') ||
    URL.canParse(specifier)
  ) {
    return undefined;
  }
  const parts = specifier.split('/');
  if (specifier.startsWith('@')) {
    if (parts.length < 2 || parts[0]?.length === 0 || parts[1]?.length === 0) {
      return undefined;
    }
    return `${parts[0]}/${parts[1]}`;
  }
  return parts[0]?.length === 0 ? undefined : parts[0];
}

/** 用安装树/profile overlay 规则定位一个包根。 */
export function findOverlayPackage(
  packageName: string,
  options: PackageOverlayOptions,
): PackageOverlaySelection | undefined {
  if (packageNameFromSpecifier(packageName) !== packageName) {
    throw new Error(
      `${BIN_NAME}: package overlay requires one exact npm package name`,
    );
  }
  const install = readCandidate(
    packageName,
    options.installPackageUrl,
    'install',
  );
  let profile: PackageOverlayCandidate | undefined;
  try {
    profile = readCandidate(packageName, options.profilePackageUrl, 'profile');
  } catch (cause) {
    // profile 副本元数据损坏时，以可用的安装树包为稳定兜底；
    // 安装树元数据本身损坏会在进入此分支前就抛错，不会被 profile 掩盖。
    if (install === undefined) throw cause;
    return { packageName, selected: install, install };
  }
  if (install === undefined && profile === undefined) return;
  const selected =
    install === undefined
      ? profile!
      : profile === undefined
        ? install
        : // 同版本（含仅 build 元数据差异）时以安装树为确定性平局判定；
          // 任一侧版本缺失或非法则不可比，同样保留安装树。
          profile.version !== undefined &&
            install.version !== undefined &&
            compare(profile.version, install.version) > 0
          ? profile
          : install;
  return {
    packageName,
    selected,
    ...(install === undefined ? {} : { install }),
    ...(profile === undefined ? {} : { profile }),
  };
}

/** 解析一个包根，两侧都没有时抛出 PackageOverlayNotFoundError。 */
export function resolveOverlayPackage(
  packageName: string,
  options: PackageOverlayOptions,
): PackageOverlaySelection {
  const selection = findOverlayPackage(packageName, options);
  if (selection === undefined)
    throw new PackageOverlayNotFoundError(packageName);
  return selection;
}
