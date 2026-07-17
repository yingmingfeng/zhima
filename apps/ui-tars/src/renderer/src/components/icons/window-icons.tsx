/**
 * Custom window control icons using iconfont SVG assets.
 * Designed to be API-compatible with lucide-react icons.
 */
import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & {
  /** Icon size (width & height). Defaults to viewBox size. */
  size?: number | string;
};

/** 窗口最小化图标（横线） */
export function WindowMinimizeIcon({ size, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 1024 1024"
      width={size ?? '1em'}
      height={size ?? '1em'}
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path d="M1017.87875555 479.24337778m0 34.13333333l0 0q0 34.13333333-34.13333333 34.13333334l-949.19111111 0q-34.13333333 0-34.13333333-34.13333334l0 0q0-34.13333333 34.13333333-34.13333333l949.19111111 0q34.13333333 0 34.13333333 34.13333333Z" />
    </svg>
  );
}

/** 窗口关闭图标（X） */
export function WindowCloseIcon({ size, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 1024 1024"
      width={size ?? '1em'}
      height={size ?? '1em'}
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path d="M507.168 473.232L716.48 263.936a16 16 0 0 1 22.624 0l11.312 11.312a16 16 0 0 1 0 22.624L541.12 507.168 750.4 716.48a16 16 0 0 1 0 22.624l-11.312 11.312a16 16 0 0 1-22.624 0L507.168 541.12 297.872 750.4a16 16 0 0 1-22.624 0l-11.312-11.312a16 16 0 0 1 0-22.624l209.296-209.312-209.296-209.296a16 16 0 0 1 0-22.624l11.312-11.312a16 16 0 0 1 22.624 0l209.296 209.296z" />
    </svg>
  );
}

/** 窗口最大化图标（方框，窗口未最大化时显示） */
export function WindowMaximizeIcon({ size, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 1024 1024"
      width={size ?? '1em'}
      height={size ?? '1em'}
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path d="M832 96H192A96 96 0 0 0 96 192v640A96 96 0 0 0 192 928h640a96 96 0 0 0 96-96V192A96 96 0 0 0 832 96z m-640 64h640a32 32 0 0 1 32 32v640a32 32 0 0 1-32 32H192a32 32 0 0 1-32-32V192a32 32 0 0 1 32-32z" />
    </svg>
  );
}

/** 窗口还原图标（重叠方框，窗口已最大化时显示） */
export function WindowRestoreIcon({ size, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 1024 1024"
      width={size ?? '1em'}
      height={size ?? '1em'}
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path d="M714.666667 256H138.666667a53.393333 53.393333 0 0 0-53.333334 53.333333v576a53.393333 53.393333 0 0 0 53.333334 53.333334h576a53.393333 53.393333 0 0 0 53.333333-53.333334V309.333333a53.393333 53.393333 0 0 0-53.333333-53.333333z m10.666666 629.333333a10.666667 10.666667 0 0 1-10.666666 10.666667H138.666667a10.666667 10.666667 0 0 1-10.666667-10.666667V309.333333a10.666667 10.666667 0 0 1 10.666667-10.666666h576a10.666667 10.666667 0 0 1 10.666666 10.666666z m213.333334-746.666666v565.333333a21.333333 21.333333 0 0 1-42.666667 0V138.666667a10.666667 10.666667 0 0 0-10.666667-10.666667H320a21.333333 21.333333 0 0 1 0-42.666667h565.333333a53.393333 53.393333 0 0 1 53.333334 53.333334z" />
    </svg>
  );
}
