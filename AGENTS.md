# AGENTS.md

This file provides guidance to Codex when working in this repository. **仅包含编码必需的上下文**。

> 📖 涉及以下内容时，查阅对应的策略文件：
> - **生成文档**（SDD、TDD、SPEC、Knowledge 等）→ [`policies/doc-language.md`](./policies/doc-language.md)
> - **修改 README** → [`policies/readme-sync.md`](./policies/readme-sync.md)
> - **提交代码** → [`policies/commit.md`](./policies/commit.md)（或直接看 `COMMIT-GUIDE.md`）
> - **推送代码前** → [`policies/pre-push.md`](./policies/pre-push.md)
- **涉及版本号** → [`policies/versioning.md`](./policies/versioning.md)

## 项目简介

**芝麻 (Zhima)** — 基于 [UI-TARS Desktop](https://github.com/bytedance/ui-tars-desktop) 的 GUI Agent 桌面端，独立演进版。通过视觉-语言模型理解屏幕内容，实现自然语言驱动的桌面自动化。

## 构建与开发

```bash
# 安装依赖（根目录执行）
pnpm install

# 开发模式（热更新）
cd apps/ui-tars && pnpm dev

# 调试模式（带 DevTools）
cd apps/ui-tars && pnpm debug

# 类型检查 / Lint / 格式化
cd apps/ui-tars && pnpm typecheck
pnpm lint
pnpm format

# 测试（全部 / 单个 / E2E）
pnpm test
cd apps/ui-tars && pnpm test -- -t "test name"
cd apps/ui-tars && pnpm test:e2e

# 生产构建 + 打包
cd apps/ui-tars && pnpm build
cd apps/ui-tars && pnpm make
```

依赖 pnpm workspace（`pnpm@9.10.0`），首次 install 在根目录执行。

## 技术栈

| 层 | 技术 |
|---|---|
| 桌面框架 | Electron 34 + electron-vite + electron-forge |
| 前端 | React 19 + TypeScript + Tailwind CSS 4 + Zustand |
| 构建 | Turbo + electron-vite + Vite 6 |
| 测试 | Vitest (unit) + Playwright (e2e) |
| 代码质量 | ESLint + Prettier + Commitlint + Husky + lint-staged |

## 关键配置

- `electron.vite.config.ts` — 三入口构建（已注释 `bytecodePlugin`，修复白屏）
- `forge.config.ts` — 打包配置（含自定义 NSIS，支持自定义路径）
- `vitest.workspace.mts` — 测试工作区

## 构建产物

- `apps/ui-tars/dist/` — 编译产出
- `apps/ui-tars/out/` — 安装包目录

## 与上游差异

基线 commit `7986f5a`，源自 [UI-TARS Desktop](https://github.com/bytedance/ui-tars-desktop)。主要改动：

1. 注释 `bytecodePlugin`（修复生产白屏）
2. renderer 添加 `base: './'`（修复资源路径）
3. 新增 NSIS 安装包（支持自定义安装路径）
4. 统一命名为 `UI-TARS`（无空格）
5. 添加 `productName`
