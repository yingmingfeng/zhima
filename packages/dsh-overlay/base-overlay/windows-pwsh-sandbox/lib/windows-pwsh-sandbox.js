import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { app } from "electron";
import { SandboxPwshExecutor } from "@deepseek-ai/dsh-pwsh-sandbox";
//#region src/windows-pwsh-sandbox.ts
/**
* Windows ACL 沙箱的 pwsh shell 适配：让 DSH 的沙箱 runner 用 zhima 内置的真实
* node.exe 而不是 process.execPath（Electron，DSH 默认拿它当假 node）。
*
* 机制：子类化上游 `SandboxPwshExecutor`（ctx.shell 提供者），在其 runArgv/startArgv
* 里把 `[process.execPath, runner.js, ...]` 改写为 `[内置node.exe, 真实runner.js, ...]`。
* runner 脚本路径：
* - dev：仓库 node_modules 真实路径（真 node 可读）。
* - 打包：app.asar.unpacked 下的真实路径（真 node 读不了 asar，需 forge unpack）。
* 真 node 无假 node 的 0xC0000142/挂起缺陷，也不需要 ELECTRON_RUN_AS_NODE / RunAsNode fuse。
*
* 这是 zhima 自有包（cordis profile patch 替换上游 pwsh-sandbox 提供者），不改 DSH 源码。
*/
/** ACL runner 脚本的绝对路径（真实目录，真 node 可读）。 */
function aclRunnerPath() {
	if (!app.isPackaged) return fileURLToPath(import.meta.resolve("@deepseek-ai/dsh-sandbox-windows-acl/runner"));
	return join(process.resourcesPath, "app.asar.unpacked", "node_modules", "@deepseek-ai", "dsh-sandbox-windows-acl", "lib", "runner.js");
}
/** 内置真实 node.exe 的绝对路径（dev: 仓库 resources；打包: resourcesPath）。 */
function bundledNodePath() {
	if (!app.isPackaged) return resolve(process.cwd(), "resources", "bin", "node.exe");
	return join(process.resourcesPath, "bin", "node.exe");
}
/**
* 把上游 ACL runner 的启动 argv 改写为用内置 node.exe 跑真 runner。
* 仅命中 Windows + `[process.execPath, dsh-sandbox-windows-acl/runner, ...]` 时改写，
* 其余原样透传（linux/mac 走系统 bwrap/seatbelt，不动）。
*/
function adaptArgv(argv) {
	const [program, runner, ...rest] = argv;
	if (process.platform !== "win32" || program !== process.execPath || typeof runner !== "string" || !runner.includes("dsh-sandbox-windows-acl")) return argv;
	return [
		bundledNodePath(),
		aclRunnerPath(),
		...rest
	];
}
/** 沙箱 pwsh shell 提供者（cordis ctx.shell）。 */
var ZhimaWindowsPwshSandbox = class extends SandboxPwshExecutor {
	/** @inheritdoc */
	async runArgv(spec, argv) {
		return super.runArgv(spec, adaptArgv(argv));
	}
	/** @inheritdoc */
	startArgv(spec, argv) {
		return super.startArgv(spec, adaptArgv(argv));
	}
};
//#endregion
export { ZhimaWindowsPwshSandbox, ZhimaWindowsPwshSandbox as default };
