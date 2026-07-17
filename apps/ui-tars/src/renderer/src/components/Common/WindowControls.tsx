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
      {/* Minimize */}
      <button
        className="group flex w-12 items-center justify-center transition-colors hover:bg-[#e5e5e5] dark:hover:bg-[#333333]"
        onClick={() => window.electron.windowControls.minimize()}
        title="Minimize"
      >
        <SvgIcon
          name="window-minimize"
          size={11}
          className="text-[#24262b] dark:text-[#cccccc]"
        />
      </button>

      {/* Maximize / Restore */}
      <button
        className="group flex w-12 items-center justify-center transition-colors hover:bg-[#e5e5e5] dark:hover:bg-[#333333]"
        onClick={handleMaximize}
        title={isMaximized ? 'Restore' : 'Maximize'}
      >
        {isMaximized ? (
          <SvgIcon
            name="window-restore"
            size={14}
            className="text-[#24262b] dark:text-[#cccccc]"
          />
        ) : (
          <SvgIcon
            name="window-maximize"
            size={11}
            className="text-[#24262b] dark:text-[#cccccc]"
          />
        )}
      </button>

      {/* Close */}
      <button
        className="group flex w-12 items-center justify-center transition-colors hover:bg-[#e81123]"
        onClick={() => window.electron.windowControls.close()}
        title="Close"
      >
        <SvgIcon
          name="window-close"
          size={22}
          className="text-[#24262b] group-hover:text-white dark:text-[#cccccc]"
        />
      </button>
    </div>
  );
}
