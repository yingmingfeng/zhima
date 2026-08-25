/**
 * Copyright (c) 2026 yingmingfeng
 * SPDX-License-Identifier: Apache-2.0
 *
 * 侧边栏底部：设置图标 + 更新按钮
 */
import { useEffect } from 'react';
import { Settings, ArrowDown } from 'lucide-react';
import { useAnimate } from 'motion/react';

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@renderer/components/ui/tooltip';

export function NavSettings({ onClick }: { onClick?: () => void }) {
  const [scope, animate] = useAnimate();

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      // 初始状态
      animate('.ripple-1', { scale: 0, opacity: 0 }, { duration: 0 });
      animate('.ripple-2', { scale: 0, opacity: 0 }, { duration: 0 });
      animate('.icon-slider', { y: 0 }, { duration: 0 });

      while (!cancelled) {
        // ① 波纹扩散（从图标中心扩散至整个按钮）
        await animate(
          '.ripple-1',
          { scale: [0, 2.5], opacity: [0.6, 0] },
          { duration: 1.8, ease: 'easeOut' },
        );
        if (cancelled) break;

        // ② 箭头向下移出按钮底部 + 淡出（确保离开时完全不可见）
        await animate(
          '.icon-slider',
          { y: 18, opacity: [1, 0] },
          { duration: 0.35, ease: 'easeIn' },
        );
        if (cancelled) break;

        // ③ 瞬移到顶部 + 滑入回原位（单次 keyframe 动画，避免 duration:0 时序问题）
        //    y: -18→-10（不可见区域）→0（原位）; opacity: 0→0→1
        await animate(
          '.icon-slider',
          { y: [-18, -10, 0], opacity: [0, 0, 1] },
          { duration: 0.5, ease: 'easeOut' },
        );
        if (cancelled) break;

        // 停顿：箭头归位后等待一段时间再启动下一次波纹
        await new Promise((r) => setTimeout(r, 600));

        // ④ 波纹②扩散
        await animate(
          '.ripple-2',
          { scale: [0, 2.5], opacity: [0.6, 0] },
          { duration: 1.8, ease: 'easeOut' },
        );
        if (cancelled) break;

        // ⑤ 箭头向下移出 + 淡出
        await animate(
          '.icon-slider',
          { y: 18, opacity: [1, 0] },
          { duration: 0.35, ease: 'easeIn' },
        );
        if (cancelled) break;

        // ⑥ 瞬移到顶部 + 滑入
        await animate(
          '.icon-slider',
          { y: [-18, -10, 0], opacity: [0, 0, 1] },
          { duration: 0.5, ease: 'easeOut' },
        );
        if (cancelled) break;

        // 重置波纹，停顿后循环
        animate('.ripple-1', { scale: 0, opacity: 0 }, { duration: 0 });
        animate('.ripple-2', { scale: 0, opacity: 0 }, { duration: 0 });
        await new Promise((r) => setTimeout(r, 600));
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [animate]);

  return (
    <div
      className="flex items-center justify-between rounded-lg"
      style={{
        padding: '6px 12px',
        height: '32px',
      }}
    >
      {/* 左侧：设置图标（与上方 folder icon 中心对齐） */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className="flex items-center justify-center w-6.5 h-6.5 rounded shrink-0 ml-0 transition-colors hover:bg-[var(--more-ops-btn-hover-bg)] text-[var(--sidebar-foreground)]"
            onClick={onClick}
          >
            <Settings className="w-4 h-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={4}>
          设置
        </TooltipContent>
      </Tooltip>

      {/* 右侧：更新按钮（有更新时显示） */}
      {true && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              ref={scope}
              className="relative overflow-hidden flex items-center gap-1.5 px-2 py-1 rounded-full shrink-0 text-xs font-semibold"
              style={{
                backgroundColor: 'var(--update-btn-bg)',
                color: 'var(--update-btn-text)',
              }}
              onClick={() => {
                // TODO: 触发更新流程
                console.log('开始更新...');
              }}
            >
              {/* 波纹①②：交替扩散 */}
              <span
                className="ripple-1 absolute rounded-full pointer-events-none"
                style={{
                  width: 40,
                  height: 40,
                  left: 12,
                  top: '50%',
                  marginTop: -20,
                  marginLeft: -20,
                  backgroundColor: 'var(--update-btn-text)',
                  willChange: 'transform, opacity',
                  transform: 'scale(0)',
                  opacity: 0,
                }}
              />
              <span
                className="ripple-2 absolute rounded-full pointer-events-none"
                style={{
                  width: 40,
                  height: 40,
                  left: 12,
                  top: '50%',
                  marginTop: -20,
                  marginLeft: -20,
                  backgroundColor: 'var(--update-btn-text)',
                  willChange: 'transform, opacity',
                  transform: 'scale(0)',
                  opacity: 0,
                }}
              />
              {/* 箭头：按钮 overflow-hidden 裁剪出入 */}
              <span
                className="icon-slider relative z-[1] flex"
                style={{ willChange: 'transform' }}
              >
                <ArrowDown className="w-2 h-2" />
              </span>
              <span className="relative z-[1]">更新</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={4}>
            AI 回答中，请在回答结束后更新
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
