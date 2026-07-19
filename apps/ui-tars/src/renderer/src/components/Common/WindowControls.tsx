/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { useEffect, useState } from 'react';
import { SvgIcon } from './svg-icon';

export function WindowControls() {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    window.electron.windowControls.isMaximized().then(setIsMaximized);
  }, []);

  const handleMaximize = async () => {
    await window.electron.windowControls.maximize();
    setIsMaximized((prev) => !prev);
  };

  return (
    <div
      className="flex h-full items-stretch"
      style={{ '-webkit-app-region': 'no-drag' }}
    >
      {/* 最小化 */}
      <button
        className="group flex w-12 items-center justify-center transition-colors hover:bg-window-control-hover"
        onClick={() => window.electron.windowControls.minimize()}
        title="Minimize"
      >
        <SvgIcon
          name="window-minimize"
          size={11}
          className="text-window-control-icon"
        />
      </button>

      {/* 最大化 / 还原 */}
      <button
        className="group flex w-12 items-center justify-center transition-colors hover:bg-window-control-hover"
        onClick={handleMaximize}
        title={isMaximized ? 'Restore' : 'Maximize'}
      >
        {isMaximized ? (
          <SvgIcon
            name="window-restore"
            size={14}
            className="text-window-control-icon"
          />
        ) : (
          <SvgIcon
            name="window-maximize"
            size={11}
            className="text-window-control-icon"
          />
        )}
      </button>

      {/* 关闭 */}
      <button
        className="group flex w-12 items-center justify-center transition-colors hover:bg-window-control-close-hover"
        onClick={() => window.electron.windowControls.close()}
        title="Close"
      >
        <SvgIcon
          name="window-close"
          size={22}
          className="text-window-control-icon group-hover:text-white"
        />
      </button>
    </div>
  );
}
