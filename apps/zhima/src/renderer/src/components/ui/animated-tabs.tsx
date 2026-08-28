/**
 * Animated Tabs — animate-ui 风格
 * 基于 motion/react 实现滑动指示器动画
 * 与 shadcn Tabs (radix-ui) 完全独立，互不干扰
 */
'use client';

import {
  useState,
  useRef,
  type ReactNode,
  createContext,
  useContext,
} from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@renderer/utils';

/* ------------------------------------------------------------------ */
/*  Context                                                           */
/* ------------------------------------------------------------------ */

interface TabsCtx {
  value: string;
  setValue: (v: string) => void;
  direction: number;
}
const TabsContext = createContext<TabsCtx>({
  value: '',
  setValue: () => {},
  direction: 0,
});

/* ------------------------------------------------------------------ */
/*  Tabs (Root)                                                       */
/* ------------------------------------------------------------------ */

interface TabsProps {
  defaultValue?: string;
  value?: string;
  onValueChange?: (v: string) => void;
  /** 返回 tab 值的顺序索引，用于判断滑动方向；默认用字符串比较 */
  getOrder?: (v: string) => number;
  className?: string;
  children: ReactNode;
}

function Tabs({
  defaultValue,
  value: controlledValue,
  onValueChange,
  getOrder,
  className,
  children,
}: TabsProps) {
  const [internalValue, setInternalValue] = useState(defaultValue ?? '');
  const prevValueRef = useRef<string>(defaultValue ?? '');
  const directionRef = useRef(0);

  const value = controlledValue ?? internalValue;

  // 计算切换方向：新值索引 > 旧值索引 → 向右(1)，反之向左(-1)
  if (prevValueRef.current !== value) {
    if (getOrder) {
      directionRef.current =
        getOrder(value) > getOrder(prevValueRef.current) ? 1 : -1;
    } else {
      directionRef.current = value > prevValueRef.current ? 1 : -1;
    }
    prevValueRef.current = value;
  }

  const setValue = (v: string) => {
    if (!controlledValue) setInternalValue(v);
    onValueChange?.(v);
  };

  return (
    <TabsContext.Provider
      value={{ value, setValue, direction: directionRef.current }}
    >
      <div className={cn('flex flex-col', className)}>{children}</div>
    </TabsContext.Provider>
  );
}

/* ------------------------------------------------------------------ */
/*  TabsList — 带滑动指示器的标签栏                                     */
/* ------------------------------------------------------------------ */

interface TabsListProps {
  className?: string;
  children: ReactNode;
}

function TabsList({ className, children }: TabsListProps) {
  return (
    <div
      role="tablist"
      className={cn(
        'relative flex items-center gap-1 rounded-lg bg-tab-bg p-[3px]',
        className,
      )}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  TabsTrigger — 单个标签按钮 + 滑动背景                              */
/* ------------------------------------------------------------------ */

interface TabsTriggerProps {
  value: string;
  className?: string;
  children: ReactNode;
}

function TabsTrigger({ value, className, children }: TabsTriggerProps) {
  const { value: selected, setValue } = useContext(TabsContext);
  const isActive = selected === value;
  const ref = useRef<HTMLButtonElement>(null);

  return (
    <button
      ref={ref}
      role="tab"
      aria-selected={isActive}
      data-state={isActive ? 'active' : 'inactive'}
      className={cn(
        'group relative z-[1] flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] transition-colors',
        isActive
          ? '!text-tab-foreground'
          : '!text-tab-foreground hover:bg-tab-hover-bg',
        className,
      )}
      style={{ fontFamily: 'var(--tab-font)' }}
      onClick={() => setValue(value)}
    >
      {isActive && (
        <motion.span
          layoutId="animated-tab-indicator"
          className="absolute inset-0 rounded-md bg-tab-active-bg shadow-sm"
          transition={{ type: 'tween', duration: 0.15, ease: 'easeInOut' }}
        />
      )}
      <span className="relative z-[1] flex items-center">{children}</span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  TabsContent — 带方向感知水平滑动动画的内容面板                       */
/* ------------------------------------------------------------------ */

interface TabsContentProps {
  value: string;
  className?: string;
  children: ReactNode;
}

function TabsContent({ value, className, children }: TabsContentProps) {
  const { value: selected, direction } = useContext(TabsContext);
  const isActive = selected === value;

  const contentVariants = {
    initial: (dir: number) => ({ x: dir * 24, opacity: 0 }),
    animate: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: dir * -24, opacity: 0 }),
  };

  return (
    <AnimatePresence mode="wait" custom={direction} initial={false}>
      {isActive && (
        <motion.div
          key={value}
          custom={direction}
          variants={contentVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={{ duration: 0.18, ease: 'easeInOut' }}
          role="tabpanel"
          className={cn('flex-1', className)}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
