// 从本地 deepseek-harness 源码 pack 出 tgz 到 vendor/，并把 package.json 的
// file: 依赖改写为 file:./vendor/<name>-<version>.tgz，从而避免从 npm 下载。
//
// 用法：node packages/dsh/pack.mjs
// 重复执行安全：每次都会重新从 harness 覆盖 pack 当前依赖清单里的 @deepseek-ai/* 包。

import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const harnessRoot = resolve(__dirname, '../../deepseek-harness')
const vendorDir = join(__dirname, 'vendor')
const pkgJsonPath = join(__dirname, 'package.json')

// 扫描 harness 的 workspace 成员，建立 package name -> 源码目录 映射。
function scanHarnessPackages() {
  const map = new Map()
  const add = (dir) => {
    const mf = join(dir, 'package.json')
    if (!existsSync(mf)) return
    const m = JSON.parse(readFileSync(mf, 'utf8'))
    if (m.name && m.name.startsWith('@deepseek-ai/')) map.set(m.name, dir)
  }
  const listDirs = (base) => readdirSync(base, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => join(base, e.name))
  for (const dir of listDirs(join(harnessRoot, 'vendor'))) add(dir)
  for (const group of listDirs(join(harnessRoot, 'packages'))) {
    for (const dir of listDirs(group)) add(dir)
  }
  for (const dir of listDirs(join(harnessRoot, 'apps'))) add(dir)
  return map
}

const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8'))
const harnessPackages = scanHarnessPackages()
mkdirSync(vendorDir, { recursive: true })

const next = {}
let packed = 0
for (const [name, spec] of Object.entries(pkg.dependencies)) {
  const dir = harnessPackages.get(name)
  if (dir === undefined) {
    // 非 @deepseek-ai/* 依赖，或 harness 里已不存在的包，原样保留。
    next[name] = spec
    continue
  }
  const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  const unscoped = name.replace(/^@/, '').replace('/', '-')
  const tgz = `${unscoped}-${manifest.version}.tgz`
  execSync(`pnpm --dir "${dir}" pack --pack-destination "${vendorDir}"`, {
    stdio: ['ignore', 'ignore', 'inherit'],
    maxBuffer: 100 * 1024 * 1024,
  })
  const out = join(vendorDir, tgz)
  if (!existsSync(out)) throw new Error(`pack 后未找到 ${tgz}（${name} @ ${dir}）`)
  next[name] = `file:./vendor/${tgz}`
  packed += 1
}

pkg.dependencies = next
writeFileSync(pkgJsonPath, `${JSON.stringify(pkg, null, 2)}\n`)
console.log(`pack.mjs: 已 pack ${packed} 个包到 ${vendorDir}`)
