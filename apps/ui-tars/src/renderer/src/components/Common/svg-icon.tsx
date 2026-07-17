/**
 * Generic SVG icon component.
 *
 * Usage:
 *   <SvgIcon name="window-minimize" size={16} className="text-gray-500" />
 *
 * SVG files should be placed in `src/renderer/src/icons/` directory.
 * SVGs must use `fill="currentColor"` to support CSS color control.
 */
import type { CSSProperties } from 'react';

// Eagerly load all SVG files as raw strings at build time
// Note: glob pattern is relative to Vite root (src/renderer)
const svgModules = import.meta.glob('/src/icons/*.svg', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

interface SvgIconProps {
  /** SVG file name without extension (e.g. "window-minimize") */
  name: string;
  /** Icon size in pixels (width & height). Defaults to 16 */
  size?: number | string;
  /** Additional CSS class */
  className?: string;
  /** Inline styles */
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
