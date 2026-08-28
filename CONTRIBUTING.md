# 贡献指南

首先，感谢您抽出时间贡献本项目！❤️

我们欢迎并重视各种类型的贡献。在做出贡献之前，请务必阅读相关章节。这将使我们维护者的工作更加轻松，也让所有参与者的体验更加顺畅。社区期待您的贡献！🎉

> 如果您喜欢这个项目，但暂时没有时间贡献，那也没关系。还有其他简单的方式可以支持本项目并表达您的感谢，我们同样非常欢迎：
> - 给项目点 Star
> - 在社交媒体上分享本项目
> - 在您的项目自述文件中引用本项目
> - 在本地技术交流活动中提及本项目，并告诉您的朋友/同事

## 我有问题 / 报告 Bug

> 如果您想提问或报告 Bug，我们假设您已经阅读了可用的文档。

在提问之前，建议先搜索现有的 [Issues](https://github.com/yingmingfeng/zhima/issues) 寻找答案。如果您找到了相关 issue 但仍需澄清，可以在该 issue 中写下您的问题。同样建议先在互联网上搜索答案。

如果经过以上步骤您仍然需要提问或澄清，我们建议：

- 创建一个 [Issue](https://github.com/yingmingfeng/zhima/issues/new)
- 提供尽可能多的上下文信息，描述您遇到的问题
- 提供项目和平台版本信息（nodejs、npm 等），视情况提供相关细节

我们会尽快处理该 issue。

## 我想贡献力量

### 前置条件

- [Node.js](https://nodejs.org/en/download/) >= 20
- [pnpm](https://pnpm.io/installation) >= 9

#### 技术栈

这是一个 [Monorepo](https://pnpm.io/workspaces) 项目，包含以下技术：

- 跨平台框架：[Electron](https://www.electronjs.org/)
- 界面框架：
  - [React](https://react.dev/)
  - [Vite](https://vitejs.dev/)
- 状态管理与通信：
  - [Zustand](https://zustand.docs.pmnd.rs/)
  - [@zhima/electron-ipc](https://github.com/yingmingfeng/zhima/tree/main/packages/zhima/electron-ipc)
- 自动化框架/工具包：
  - [nut.js](https://nutjs.dev/)
- 测试框架：
  - [Vitest](https://vitest.dev/)
  - [Playwright](https://playwright.dev/)

### 项目结构

```bash
.
├── README.md
├── apps
│   └── zhima
│       └── src
│           ├── main
│           ├── preload
│           └── renderer
│ 
├── packages
│   ├── agent-infra
│   │   ├── browser
│   │   ├── browser-use
│   │   ├── logger
│   │   ├── mcp-client
│   │   ├── mcp-servers
│   │   ├── search
│   │   └── shared
│   ├── common
│   │   ├── configs
│   │   └── electron-build
│   └── zhima
│       ├── action-parser
│       ├── cli
│       ├── electron-ipc
│       ├── operators
│       ├── sdk
│       ├── shared
│       ├── tsconfig.node.json
│       ├── utio
│       └── visualizer
└── vitest.*.mts            # 单元测试配置
```

> **注意**：`src` 目录位于顶层目录而非 `apps/{main,preload,renderer}` 目录下，这是因为 Electron Forge 之前不支持 Pnpm 的 hoisting 机制（[electron/forge#2633](https://github.com/electron/forge/issues/2633)），需要将 `src` 目录放置在顶层。

#### 克隆仓库

```bash
$ git clone https://github.com/yingmingfeng/zhima.git
$ cd zhima
```

### 开发

#### 安装依赖

```bash
$ pnpm install
```

#### 运行应用

```bash
$ pnpm run dev    # 启动芝麻 (Zhima)
```

应用启动后，您可以在应用界面中看到芝麻 (Zhima) 的界面。

> **注意**：在 MacOS 上，您需要为运行命令的应用（如 iTerm2、Terminal）授予相应权限。

#### 主进程重载

默认情况下，`pnpm run dev` 仅支持前端热模块替换（HMR）热更新。如果您需要在调试时同时重载主进程，可以执行 `pnpm run dev:w`。

```bash
$ pnpm run dev:w
```

#### 构建

在当前系统下运行 `pnpm run build`，构建产物将输出到 `out/*` 目录。

要构建其他系统的产物，请运行：
- Mac x64：`pnpm run publish:mac-x64`
- Mac ARM：`pnpm run publish:mac-arm64`
- Windows x64：`pnpm run publish:win32`
- Windows ARM：`pnpm run publish:win32-arm64`

### 文档

文档位于 `docs/*.md` 目录中，采用 Markdown 格式。目前尚未建立文档站点，但 `docs/*.md` 目录未来将会转换为文档站点。

## 代码风格指南

### 预提交钩子

我们使用 [Husky](https://typicode.github.io/husky/#/) 和 [lint-staged](https://github.com/okonet/lint-staged) 来强制执行预提交钩子。这些钩子包括：

- `prettier --write` — 格式化代码
- `npm run typecheck` — 严格检查类型

### 提交信息

我们使用 [Conventional Commits](https://www.conventionalcommits.org/) 来规范化提交信息格式。

### CI / 测试

每次 PR 或主分支推送都会触发 CI 流水线，运行单元测试和 E2E 测试。

#### 单元测试

```bash
pnpm run test
```

#### E2E 测试

```bash
pnpm run test:e2e
```

## 提交变更

- 将您的更改推送到您 fork 仓库的特性分支
- 向本仓库提交 Pull Request
- 在您的 PR 中接受 CLA
