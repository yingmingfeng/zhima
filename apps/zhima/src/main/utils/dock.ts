/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { app } from 'electron';
import { Promisable } from 'type-fest';

export const ensureDockIsShowing = async (action: () => Promisable<void>) => {
  const dock = app.dock;
  if (!dock) return action();
  const wasDockShowing = dock.isVisible();
  if (!wasDockShowing) {
    await dock.show();
  }

  await action();

  if (!wasDockShowing) {
    dock.hide();
  }
};

export const ensureDockIsShowingSync = (action: () => void) => {
  const dock = app.dock;
  if (!dock) return action();
  const wasDockShowing = dock.isVisible();
  if (!wasDockShowing) {
    dock.show();
  }

  action();

  if (!wasDockShowing) {
    dock.hide();
  }
};
