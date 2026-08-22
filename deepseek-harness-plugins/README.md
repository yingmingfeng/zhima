# deepseek-harness-plugins

DSH 自定义插件目录。按插件运行形态分类存放。

## 目录约定

| 目录 | 放什么 |
|---|---|
| [`host/`](./host/) | 宿主插件：`apply()` 在 Node 主进程跑逻辑（工具、服务、定时器、事件订阅） |
| [`client/`](./client/) | Client 插件：纯浏览器端（皮肤、DOM/CSS、React 组件） |
| [`hybrid/`](./hybrid/) | host 与 client **两边都有实质逻辑**的插件 |

> 注：client 插件的构建产物天然带 host 半（`lib/index.js`，通常 `apply()` 为空）——这是 DSH 打包结构，不算"双端"。只有 host 半有**真实逻辑**、且 client 半也有**真实逻辑**时才归 `hybrid/`。

## 加载

- **host 插件**：在 [`cordis.yml`](./cordis.yml) 里以 `file:///` 绝对路径注册（指向 `src/index.ts`），一次 `--patch` 全部加载。
- **client 插件**：通过 package.json 的 `dsh.client` 声明由 boot graph 自动加载（经 `dsh plugin --profile <name> add` 安装）。
- **hybrid 插件**：host 半走 `cordis.yml`，client 半走 `dsh.client`。

## 相关文档

- 加载机制：[`../personal_docs/DSH-开发问题记录/01-Client插件加载机制.md`](../personal_docs/DSH-开发问题记录/01-Client插件加载机制.md)
- host/client 区别：[`../personal_docs/DSH-开发问题记录/02-宿主插件与Client插件区别.md`](../personal_docs/DSH-开发问题记录/02-宿主插件与Client插件区别.md)
- Profile 插件安装与卸载：[`../personal_docs/DSH-开发问题记录/03-Profile插件安装与卸载.md`](../personal_docs/DSH-开发问题记录/03-Profile插件安装与卸载.md)
