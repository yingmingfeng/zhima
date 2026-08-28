/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { Route, HashRouter, Routes, Navigate } from 'react-router';
import { lazy, Suspense } from 'react';
import { Toaster } from 'sonner';

import { MainLayout } from './layouts/MainLayout';
import { DshTrayController } from './components/DshTrayController';

import './styles/globals.css';

const Home = lazy(() => import('./pages/home'));
const LocalOperator = lazy(() => import('./pages/local'));
const FreeRemoteOperator = lazy(() => import('./pages/remote/free'));
const Projects = lazy(() => import('./pages/projects'));
const Automation = lazy(() => import('./pages/automation'));
const PluginMarket = lazy(() => import('./pages/plugins'));
// const PaidRemoteOperator = lazy(() => import('./pages/remote/paid'));

const Widget = lazy(() => import('./pages/widget'));
const Splash = lazy(() => import('./pages/splash'));

export default function App() {
  return (
    <HashRouter>
      <Suspense
        fallback={
          <div className="loading-container">
            <div className="loading-spinner" />
          </div>
        }
      >
        <Routes>
          <Route element={<MainLayout />}>
            {/* 默认路径重定向到 Work tab */}
            <Route path="/" element={<Navigate to="/work" replace />} />

            {/* Tab 驱动路由：/work | /computer | /browser */}
            <Route path="/work">
              <Route index element={<Home />} />
              <Route path="plugin-market" element={<PluginMarket />} />
              <Route path="automation" element={<Automation />} />
            </Route>
            <Route path="/computer">
              <Route index element={<Home />} />
              <Route path="plugin-market" element={<PluginMarket />} />
              <Route path="automation" element={<Automation />} />
            </Route>
            <Route path="/browser">
              <Route index element={<Home />} />
              <Route path="plugin-market" element={<PluginMarket />} />
              <Route path="automation" element={<Automation />} />
            </Route>

            {/* 任务执行页（不归属特定 tab） */}
            <Route path="/local" element={<LocalOperator />} />
            <Route path="/free-remote" element={<FreeRemoteOperator />} />
            <Route path="/projects" element={<Projects />} />
            {/* <Route path="/paid-remote" element={<PaidRemoteOperator />} /> */}
          </Route>

          <Route path="/widget" element={<Widget />} />
          {/* DSH 启动等待页：主进程 splash 窗口专用 */}
          <Route path="/splash" element={<Splash />} />
        </Routes>
        <Toaster
          position="top-right"
          offset={{ top: '48px' }}
          mobileOffset={{ top: '48px' }}
        />
        <DshTrayController />
      </Suspense>
    </HashRouter>
  );
}
