// 根据插件目录名（如 maid-atelier）在 host/client/hybrid 三个子目录中定位插件，
// 输出其绝对路径或 package.json 里的包名（name），供 dsh-dev-add/remove cmd 使用。
// 用法:
//   node resolve-plugin.mjs path <插件目录名>   -> 打印插件目录绝对路径
//   node resolve-plugin.mjs name <插件目录名>   -> 打印包名（如 @dsh-external/dsh-client-ui-skin-maid-atelier）
// 找不到或缺少 name 时以非零码退出，不打印任何内容。
import { readFileSync } from 'node:fs'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const pluginsRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const [mode, folder] = process.argv.slice(2)

if ((mode !== 'path' && mode !== 'name') || folder === undefined) {
  process.exit(2)
}

for (const kind of ['host', 'client', 'hybrid']) {
  const dir = join(pluginsRoot, kind, folder)
  const pkgPath = join(dir, 'package.json')
  if (!existsSync(pkgPath)) continue
  if (mode === 'path') {
    process.stdout.write(dir)
    process.exit(0)
  }
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  if (typeof pkg.name === 'string' && pkg.name.length > 0) {
    process.stdout.write(pkg.name)
    process.exit(0)
  }
  process.exit(3)
}

process.exit(1)
