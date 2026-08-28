/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import mediumZoom, { type Zoom } from 'medium-zoom';
import React, { useEffect, useRef, useState } from 'react';

interface ImageProps {
  src: string;
  alt: string;
}

export const SnapshotImage: React.FC<ImageProps> = (props) => {
  const { src, alt } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [containerHeight, setContainerHeight] = useState(0);

  // 监听容器高度变化，用像素值显式设置图片高度
  // 这样图片高度只跟随容器高度（flex 分配，不随宽度变化）
  useEffect(() => {
    if (!containerRef.current) return;

    const updateHeight = () => {
      if (containerRef.current) {
        setContainerHeight(containerRef.current.clientHeight);
      }
    };

    updateHeight();

    const observer = new ResizeObserver(updateHeight);
    observer.observe(containerRef.current);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let zoom: Zoom | undefined;
    const initZoom = () => {
      if (imgRef.current) {
        zoom = mediumZoom(imgRef.current, {
          background: 'rgba(0,0,0,.7)',
          margin: 50,
        });
      }
    };
    requestAnimationFrame(initZoom);
    return () => {
      zoom?.detach();
      zoom?.close();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="flex-1 min-h-0 flex items-center justify-center overflow-hidden"
    >
      <img
        ref={imgRef}
        src={src}
        style={{
          height: containerHeight ? `${containerHeight}px` : 'auto',
          width: 'auto',
        }}
        className="block select-none"
        alt={alt}
      />
    </div>
  );
};
