# Commit 规范

## 标准约定式提交（Conventional Commits）

```
<type>(<scope>): <subject>

<body>

<footer>
```

### type（必填）

| 类型 | 说明 |
|------|------|
| `feat` | 新功能 |
| `fix` | 修复 bug |
| `docs` | 文档变更 |
| `refactor` | 重构（既不修复 bug 也不添加功能） |
| `test` | 添加或修改测试 |
| `chore` | 构建过程、依赖管理、工具配置等杂项 |
| `ci` | CI/CD 配置变更 |
| `style` | 代码格式（不影响逻辑的空白、分号等） |
| `perf` | 性能优化 |
| `release` | 版本发布 |

### scope（可选）

表示影响范围，例如：`agent`、`nsis`、`config`、`ui`。尽量简短。

### subject（必填）

- 使用祈使句、一般现在时（"add" 而非 "added" 或 "adds"）
- 首字母不大写
- 结尾不加句号
- 中文或英文均可，但同一个项目内保持一致

### body（可选）

- 说明为什么要做这个变更、怎么做的
- 每行不超过 72 个字符

### footer（可选）

- BREAKING CHANGE: 破坏性变更说明
- 关联 Issue：`Closes #123`, `Fixes #456`

---

## zhima 的提交风格

参考上游 ui-tars-desktop 的主流格式：

```
<type>(<scope>): <description>
```

实际示例：

```
feat(agent): 支持工作流录制和回放
fix(nsis): 修复快捷方式目标路径错误
chore: 删除废弃的 bytecodePlugin 配置
docs: 更新安装说明
refactor(ui): 重构设置页面布局
```

要点：

- `type` 小写
- `scope` 可选，小写括号包围
- `type` 和 `subject` 之间加空格
- subject 中文或英文均可，保持项目内一致
- 无需在末尾加 `(#PR-number)`——那是上游带 PR 编号的格式，zhima 不需要

### 首 commit 特殊格式

```
feat: 基于 ui-tars-desktop 创建

来源: https://github.com/bytedance/ui-tars-desktop
基线: <commit-hash>

变更:
- 注释 bytecodePlugin（修复生产构建白屏）
- renderer 添加 base: './'（修复资源路径）
- 新增 NSIS 安装包支持
- 修复命名一致性
```

---

## 提交粒度

- 允许一次提交包含多个关联改动，但 body 必须逐项列出所有变更（格式：`- 变更：背景`）
- 不拆分未独立验证的改动——整体测试通过即整体提交

## 给 AI 的指引

当被要求生成 commit message 时，使用上述格式：

```
<type>(<scope>): <中文或英文描述>
```

type 根据实际变更内容从上方表格中选择。scope 如果明显则加上，不明显可省略。描述用祈使语气，简洁不啰嗦。
