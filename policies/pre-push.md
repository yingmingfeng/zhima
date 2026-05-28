# 推送前检查清单

在推送代码前，确认以下事项：

## 1. .gitignore 覆盖

`.planning/`、`.claude/`、`CLAUDE.md`、`.understand-anything`、`kc-exe-analysis/`、`PROJECT.md` 是否被正确忽略。

## 2. 敏感内容

API Key、密码、内网地址、Token 是否被误提交。

## 3. 项目无关文件

个人笔记、分析文档、上游遗留配置是否被误加入提交。

## 4. README 同步

`README.md` 和 `README.en.md` 是否都已更新，内容是否对等。

## 5. 上游引用

- `forge.config.ts` 的 publisher 地址 → 指向 `yingmingfeng/zhima`
- `SECURITY.md` 的漏洞报告链接 → 指向 `yingmingfeng/zhima`
- 文档中的仓库链接、社区链接 → 指向 `yingmingfeng/zhima`
