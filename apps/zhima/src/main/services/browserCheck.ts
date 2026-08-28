/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
// [停用 browser-use] import { DefaultBrowserOperator } from '@zhima/operator-browser';
// [停用 browser-use] import { logger } from '@main/logger';
// [停用 browser-use] import { store } from '@main/store/create';

/**
 * Check if there is a browser available in the system
 */
// [停用 browser-use] 整个函数依赖 @zhima/operator-browser，已随 browser-use 一并停用，仅保留 computer-use。
export async function checkBrowserAvailability(): Promise<boolean> {
  return false;
  /*
  try {
    logger.info('Checking browser availability...');
    const available = DefaultBrowserOperator.hasBrowser();
    logger.info(`Browser availability: ${available}`);
    store.setState({ browserAvailable: available });
    return available;
  } catch (error) {
    logger.error('Error checking browser availability:', error);
    store.setState({ browserAvailable: false });
    return false;
  }
  */
}
