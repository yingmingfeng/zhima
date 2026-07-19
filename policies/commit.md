# Git 提交规范

本项目的 Git commit 遵循 `COMMIT-GUIDE.md`，核心格式：

```
<type>(<scope>): <subject>
```

## 类型（type）

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

## 规则

- type 小写，必填
- scope 可选，小写括号包围，如 `(agent)`、`(nsis)`、`(config)`
- subject 使用祈使语气，中文或英文均可
- 一个 commit 只做一件事

> 详细规则和示例见 [`COMMIT-GUIDE.md`](../COMMIT-GUIDE.md)
