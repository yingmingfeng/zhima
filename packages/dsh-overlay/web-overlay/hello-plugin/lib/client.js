window.__ModuleLoader__.load({
	id: "@dsh-overlay/hello-plugin",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		//#region src/client/index.ts
		/**
		* hello-plugin 客户端入口
		* 在浏览器环境中运行，可以访问 window.electron。
		* 以 DSH client 插件形式导出（apply），DSH loader 要求插件是函数或带 apply 方法的对象。
		*/
		function apply(_ctx) {
			if (typeof window !== "undefined" && "electron" in window) {
				console.log("[hello-plugin] ✅ 检测到 Electron 环境！preload 注入成功");
				const electronAPI = window.electron;
				console.log("[hello-plugin] available APIs:", Object.keys(electronAPI ?? {}));
			} else {
				console.warn("[hello-plugin] ⚠️ 未检测到 Electron 环境");
				console.warn("[hello-plugin] 这意味着 preload 脚本未加载或 window.electron 未暴露");
				console.warn("[hello-plugin] 请检查：");
				console.warn("[hello-plugin]   1. BrowserWindow 是否配置了 preload 脚本");
				console.warn("[hello-plugin]   2. contextBridge.exposeInMainWorld 是否正确调用");
			}
		}
		//#endregion
		exports.apply = apply;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map