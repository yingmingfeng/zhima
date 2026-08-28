/**
 * 通用 SVG 图标组件。
 *
 * 用法：
 *   <SvgIcon name="window-minimize" size={16} className="text-gray-500" />
 *
 * SVG 文件存放于 `src/renderer/src/icons/` 目录。
 * SVG 必须使用 `fill="currentColor"` 以支持 CSS 颜色控制。
 */
import type { CSSProperties } from 'react';

// 构建时预加载所有 SVG 文件为原始字符串
// 注意：glob 路径相对于 Vite root（src/renderer）
const svgModules = import.meta.glob('/src/icons/*.svg', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

interface SvgIconProps {
  /** SVG 文件名（不含 .svg 后缀，如 "window-minimize"） */
  name: string;
  /** 图标尺寸（宽度和高度），默认 16 */
  size?: number | string;
  /** 附加 CSS 类名 */
  className?: string;
  /** 内联样式 */
  style?: CSSProperties;
}

export function SvgIcon({ name, size = 16, className, style }: SvgIconProps) {
  const svgContent = svgModules[`/src/icons/${name}.svg`];

  if (!svgContent) {
    if (import.meta.env.DEV) {
      console.warn(`[SvgIcon] SVG file not found: ${name}.svg`);
    }
    return null;
  }

  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: typeof size === 'number' ? `${size}px` : size,
        height: typeof size === 'number' ? `${size}px` : size,
        lineHeight: 0,
        ...style,
      }}
      dangerouslySetInnerHTML={{ __html: svgContent }}
    />
  );
}
