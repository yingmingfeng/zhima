/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
/// <reference types="vite/client" />

import { ElectronHandler } from '../../preload/index';

interface Window {
  electron: ElectronHandler;
  platform: NodeJS.Platform;
  zutron: any;
}

declare module 'react' {
  interface CSSProperties {
    '-webkit-app-region'?: 'drag' | 'no-drag';
    // React 对 kebab-case 的 -webkit-app-region 会 warning "Did you mean WebkitAppRegion?"，
    // 用 camelCase WebkitAppRegion 消除该 warning；此处补类型声明。
    WebkitAppRegion?: 'drag' | 'no-drag';
    '--sidebar-width-icon'?: string;
  }
}
