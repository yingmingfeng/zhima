/**
 * Copyright (c) 2026 yingmingfeng
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * DSH 启动等待页（/splash 路由）：
 * 应用启动时由主进程 splash 窗口加载（HashRouter hash '#/splash'），
 * 黑色进度条从左到右循环滑动展示加载状态；DSH CLI 就绪后窗口被关闭。
 * 纯展示页：不发起请求、不依赖业务状态。
 */
import logo from '@resources/logo-vector.png?url';

export default function Splash() {
  return (
    <div
      style={{
        boxSizing: 'border-box',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 22,
        background: '#ffffff',
        borderRadius: 14,
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.18)',
        overflow: 'hidden',
        userSelect: 'none',
        cursor: 'default',
      }}
    >
      <img src={logo} alt="Zhima" style={{ width: 56, height: 56, objectFit: 'contain' }} />
      {/* 进度条：浅灰轨道 + 黑色 bar 从左到右循环滑动 */}
      <div
        style={{
          position: 'relative',
          width: 220,
          height: 4,
          borderRadius: 2,
          background: '#ececec',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '36%',
            height: '100%',
            borderRadius: 2,
            background: '#111111',
            animation: 'splash-slide 1.4s cubic-bezier(0.45, 0, 0.55, 1) infinite',
          }}
        />
      </div>
      <div
        style={{
          fontSize: 15,
          color: '#1f2329',
          letterSpacing: '0.2px',
          fontFamily:
            "'Segoe UI', 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif",
        }}
      >
        正在启动 DSH 服务，请稍候…
      </div>
      <style>{`
        @keyframes splash-slide {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(278%); }
        }
      `}</style>
    </div>
  );
}
