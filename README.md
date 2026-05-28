<picture>
  <img alt="芝麻 Banner" src="./images/tars.png">
</picture>

<br/>

<div align="center">

[English](./README.en.md) | 简体中文

[![GitHub Release](https://img.shields.io/github/v/release/yingmingfeng/zhima?style=for-the-badge&colorA=1a1a2e&colorB=3B82F6)](https://github.com/yingmingfeng/zhima/releases)
[![License](https://img.shields.io/badge/License-Apache%202.0-8B5CF6?style=for-the-badge&colorA=1a1a2e)](LICENSE)
[![GitHub Stars](https://img.shields.io/github/stars/yingmingfeng/zhima?style=for-the-badge&colorA=1a1a2e&colorB=F59E0B)](https://github.com/yingmingfeng/zhima/stargazers)

</div>

<br/>

> 一颗芝麻虽小，但能榨出油。
>
> 一个桌面操作虽碎，但能被自动化。

**芝麻 (Zhima)** 是一款桌面 GUI Agent，通过视觉-语言模型理解屏幕内容，实现自然语言驱动的桌面自动化操作。

芝麻源自 [UI-TARS Desktop](https://github.com/bytedance/ui-tars-desktop)（ByteDance 开源的 GUI Agent 桌面端），基于其核心的视觉-语言模型驱动能力进行独立演进。UI-TARS 提供了一套通过视觉理解来操作电脑的基础框架，但作为开源项目其更新节奏已放缓。芝麻在此基础上修复了原生构建缺陷，并沿自己的路线发展。

> 📌 **当前状态**：芝麻刚完成分支创建，目前与上游 UI-TARS Desktop 功能基本一致，主要变更为构建修复和安装包增强。后续将逐步加入工作流录制、垂直场景深耕等差异化功能。

## 目录

- [核心定位](#核心定位)
- [功能特性](#功能特性)
- [快速开始](#快速开始)
- [与上游对比](#与上游对比)
- [发展路线](#发展路线)
- [贡献指南](#贡献指南)
- [许可证](#许可证)

## 核心定位

**不是"AI 助手"，而是"桌面自动化执行器"。**

区别于通用 AI 桌面助手，芝麻的核心使命是：让用户通过**录制 + 人工干预**的方式，教会 AI 执行复杂的、多步骤的专业软件操作流程。

| 场景 | 示例 |
|------|------|
| 🎨 专业设计软件 | Photoshop 批量处理、3D 建模重复操作 |
| 📄 办公软件 | Word/WPS 批量排版、Excel 复杂数据处理 |
| 🏢 企业系统 | 没有 API 的老旧系统、内部 OA 流程自动化 |
| 🧪 测试验收 | 桌面应用自动化测试、UI 回归验证 |

这些场景的共同特点：操作链路长、步骤机械重复、但路径相对固定。纯靠模型推理无法稳定完成，但通过**人演示 → AI 学习 → 人纠错**的循环，可以逐步固化为自动化工作流。

AI 模型能力的提升对芝麻不是威胁，而是杠杆。模型越强，能理解和执行的流程就越复杂，芝麻所能覆盖的场景就越广。那些机械化的专业软件操作流程，本质上承载的是行业特有的业务知识，而不是通用推理能力——后者是模型擅长的，前者正是芝麻要积累的。

## 功能特性

- 🤖 **自然语言控制** — 用自然语言描述需求，VLM 理解屏幕后自动执行
- 🖥️ **视觉理解** — 基于截图识别，无需 API 或 DOM 访问
- 🎯 **精准桌面操控** — 通过 nut-js 控制鼠标、键盘、UI 元素
- 💻 **跨平台** — 支持 Windows 和 macOS
- 🔄 **实时反馈** — 状态实时显示、思考链路可视化
- 🔐 **模型无关** — 支持 OpenAI 兼容 API、本地模型（Ollama/Qwen）、私有化部署
- 📦 **工作流录制** — 录制、回放、优化多步操作流程（规划中）

## 快速开始

### 环境要求

- Node.js >= 20.x
- pnpm >= 9.10.0

### 开发模式

```bash
# 安装依赖（在项目根目录执行）
pnpm install

# 启动开发模式（热更新）
cd apps/ui-tars && pnpm dev

# 类型检查
cd apps/ui-tars && pnpm typecheck

# Lint
pnpm lint
```

### 构建打包

```bash
# 生产构建 + 打包安装包
cd apps/ui-tars && pnpm build
cd apps/ui-tars && pnpm make
```

> 📖 详细使用说明请查看 [快速开始](./docs/quick-start.md)。

## 与上游对比

| 方面 | UI-TARS Desktop（上游） | 芝麻（Zhima） |
|------|------------------------|--------------|
| 构建稳定性 | `bytecodePlugin` 导致生产白屏 | 已修复 |
| Renderer 资源路径 | 生产环境资源加载失败 | 已修复（`base: './'`） |
| Windows 打包 | 仅 Squirrel 安装包 | 新增 NSIS，支持自定义安装路径 |
| 产品命名 | 不一致（含空格） | 统一为 `UI-TARS` |
| 更新节奏 | 已放缓 | 主动维护 |
| 目标定位 | 通用 GUI Agent 研究 | **工作流自动化 + 企业场景** |

## 发展路线

```
开源社区版（免费）
  ├── 核心 Agent 能力（鼠标键盘操控、视觉理解） ✓
  ├── 工作流录制与回放（规划中）
  ├── 本地模型支持 ✓
  └── 个人日常使用

企业版（付费 - 远期规划）
  ├── 工作流模板库（云端同步与分享）
  ├── 团队协作
  ├── 私有化部署 + 管理后台
  └── 企业系统集成
```

## 贡献指南

欢迎贡献！请阅读 [CONTRIBUTING.md](./CONTRIBUTING.md) 了解指南。

## 许可证

本项目基于 Apache License 2.0 开源。

---

*基于 [UI-TARS Desktop](https://github.com/bytedance/ui-tars-desktop)（commit `7986f5a`）构建，延续 Apache 2.0 许可。*
