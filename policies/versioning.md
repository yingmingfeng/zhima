# 版本号规范

本项目遵循 [语义化版本控制（SemVer）](https://semver.org/lang/zh-CN/)：`MAJOR.MINOR.PATCH`。

## 格式

```
<主版本号>.<次版本号>.<修订号>
```

## 规则

| 版本位 | 何时增加 | 示例 |
|--------|---------|------|
| **主版本号 (MAJOR)** | 不兼容的API/功能变更，重大重写 | `1.0.0` → `2.0.0` |
| **次版本号 (MINOR)** | 向下兼容的新功能、新特性 | `1.0.0` → `1.1.0` |
| **修订号 (PATCH)** | 向下兼容的 bug 修复、微小调整 | `1.0.0` → `1.0.1` |

## 当前状态

- 当前版本：**`0.2.4`**（继承自上游 UI-TARS Desktop）
- 阶段：`0.x.y` 表示**初始开发阶段**，任何内容都可能随时变化
- zhima 的版本号**独立于上游**，不与 UI-TARS Desktop 或 Agent TARS 的版本号关联

## 版本锚定

zhima 自 `7986f5a` commit 从 UI-TARS Desktop fork 出来，此时上游版本为 `0.2.4`。zhima 沿用了这个版本号作为**起点**，后续版本将基于 zhima 自身的变更独立递增：

| 版本 | 说明 |
|------|------|
| `0.2.4` | Fork 起点，与上游功能一致 |
| `0.3.0` 起 | zhima 独立发展，新增功能后递增次版本号 |

## 版本定义位置

- 主版本号：`apps/ui-tars/package.json` 中的 `version` 字段
- 打包产物：`forge.config.ts` 引用该版本号生成安装包名
- CI/CD：Release 流程使用该版本号创建 GitHub Release

## 更新时机

- **功能开发完成准备发版时**更新版本号，而不是开发过程中
- 每次发版前，由维护者手动更新 `apps/ui-tars/package.json` 中的 `version`
- 同步更新 `CHANGELOG.md`（若存在）和 release notes

> 详细发布流程见 `COMMIT-GUIDE.md` 中的 release 类型说明。
