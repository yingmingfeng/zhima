/**
 * 同步 DSH-better-sidebar 源码构建产物到 zhima 内置插件目录。
 *
 * 源码：deepseek-harness-plugins/hybrid/DSH-better-sidebar（独立 git，可跟随上游）
 * 产物：packages/dsh-overlay/DSH-better-sidebar（zhima 内置插件，走 advanced-shell 的加载机制）
 *
 * 用法：node deepseek-harness-plugins/scripts/sync-better-sidebar.mjs
 * 跟随上游更新后，重跑本脚本即可重建内置产物。
 */
import { execSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PLUGINS_ROOT = join(__dirname, '..') // deepseek-harness-plugins
const SRC = join(PLUGINS_ROOT, 'hybrid', 'DSH-better-sidebar')
const DEST = join(PLUGINS_ROOT, '..', 'packages', 'dsh-overlay', 'DSH-better-sidebar')

if (!existsSync(join(SRC, 'package.json'))) {
  console.error(`[sync] 源码目录不存在：${SRC}`)
  process.exit(1)
}

// 1. 构建源码（install 装依赖，build 生成 lib/）
console.log('[sync] 1/4 安装依赖并构建源码...')
execSync('pnpm install', { cwd: SRC, stdio: 'inherit' })
execSync('pnpm build', { cwd: SRC, stdio: 'inherit' })

// 2. 校验产物
const libDir = join(SRC, 'lib')
if (!existsSync(join(libDir, 'index.js')) || !existsSync(join(libDir, 'client.js'))) {
  console.error('[sync] 构建产物不完整：缺少 lib/index.js 或 lib/client.js')
  process.exit(1)
}

// 3. 清空并重建内置目录
console.log('[sync] 2/4 重建内置目录...')
rmSync(DEST, { recursive: true, force: true })
mkdirSync(DEST, { recursive: true })

// 4. 复制构建产物 + 运行时文件（内置不走 bundle 机制，不复制 cordis.patch.yml，
//    统一由 packages/dsh-overlay/cordis.patch.yml 根清单注入）
console.log('[sync] 3/4 复制产物...')
cpSync(libDir, join(DEST, 'lib'), { recursive: true })
for (const file of ['LICENSE']) {
  const src = join(SRC, file)
  if (existsSync(src)) cpSync(src, join(DEST, file))
}

// 5. 生成内置 package.json（保留运行时字段，去掉构建相关和 dsh.bundle）
console.log('[sync] 4/4 生成内置 package.json...')
const pkg = JSON.parse(readFileSync(join(SRC, 'package.json'), 'utf8'))
// 内置加载只走根清单（packages/dsh-overlay/cordis.patch.yml）的 insert，不经过
// npm bundle 机制，所以只保留 dsh.client（client 注入声明），去掉 dsh.bundle。
const builtin = {
  name: '@dsh-overlay/better-sidebar',
  version: pkg.version,
  description: pkg.description,
  private: true,
  type: 'module',
  main: pkg.main,
  types: pkg.types,
  exports: pkg.exports,
  engines: pkg.engines,
  dsh: {
    client: pkg.dsh?.client,
  },
  dependencies: pkg.dependencies,
  peerDependencies: pkg.peerDependencies,
  peerDependenciesMeta: pkg.peerDependenciesMeta,
  files: ['lib', 'LICENSE'],
}
writeFileSync(join(DEST, 'package.json'), JSON.stringify(builtin, null, 2) + '\n')

console.log(`[sync] 完成：内置产物位于 ${DEST}`)
console.log('[sync] 提示：别忘了在 packages/dsh-overlay/cordis.patch.yml 注册，并让 zhima 根 pnpm install 补装依赖')
