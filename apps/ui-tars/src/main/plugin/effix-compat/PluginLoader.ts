import * as fs from 'fs';
import electron, { app, ipcMain } from 'electron';
import vm from 'vm';
import path from 'path';
import Module, { builtinModules } from 'module';
import { LoggerFactory } from './LoggerAdapter';
import {
  is as electronIs,
  platform as electronPlatform,
} from '@electron-toolkit/utils';
import { electronAPI as electronToolkitPreload } from '@electron-toolkit/preload';
import {
  ElectronToolkitUtilsProxy,
  ElectronToolkit,
  PluginHostApi,
  PluginExports,
  PluginRecord,
  TimerProxy,
  IpcMainProxy,
  GlobalShortcutProxy,
  Accelerator,
  AppProxy,
  PluginPathTypes,
} from './types';
import { PluginEventBus, PluginReceivableEvent } from './PluginEventBus';
import R from './R';
import { globalShortcutManager } from './GlobalShortcutManager';
import { PluginManager } from './PluginManager';
const log = LoggerFactory.getMainLogger().scope('effix-compat/PluginLoader');

export class PluginLoader {
  private static instance: PluginLoader;
  private moduleCache = new Map<string, any>();
  private scriptCache = new Map<string, vm.Script>();
  private sandboxContext: vm.Context;
  private sandboxObject: any;

  constructor() {}

  static getInstance(): PluginLoader {
    if (!this.instance) {
      this.instance = new PluginLoader();
    }
    return this.instance;
  }

  /**
   * 创建自定义 require 函数，用于在插件环境中安全加载模块
   * - 内置模块 → 宿主加载
   * - node_modules 模块 → fakeModule 加载（global 是宿主）
   * - 相对路径模块 → vm.runInContext 沙箱加载
   */
  private createRequireProxy(
    pluginPath: string,
    nodeModulePath: string,
  ): (id: string) => any {
    const moduleCache = this.moduleCache;
    const scriptCache = this.scriptCache;
    const sandboxContext = this.sandboxContext;
    const sandboxObject = this.sandboxObject;
    const Module = require('module') as typeof import('module');
    const hostRequire = require;

    const fakeModule = new Module(pluginPath, null);
    fakeModule.filename = pluginPath;

    const pluginPaths: string[] = [];
    let dir = path.dirname(nodeModulePath);
    while (true) {
      pluginPaths.push(path.join(dir, 'node_modules'));
      const parent = path.dirname(dir);
      if (dir === parent) break;
      dir = parent;
    }
    fakeModule.paths = pluginPaths;
    log.info(
      `[PluginLoader.createRequireProxy] fakeModule.paths: ${fakeModule.paths}`,
    );

    const fakeModuleRequire = fakeModule.require.bind(fakeModule);

    function runInSandbox(
      resolvedPath: string,
      parentRequire: (id: string) => any,
    ): any {
      log.info(
        `[PluginLoader.createRequireProxy.runInSandbox] 解析后的绝对路径: ${resolvedPath}`,
      );
      const basename = path.basename(resolvedPath);
      const injectedKeys = [
        'exports',
        'module',
        'require',
        '__filename',
        '__dirname',
      ];
      const initialKeys = new Set(Object.keys(sandboxObject));
      const originals: any = {};

      for (const key of injectedKeys) {
        originals[key] = sandboxObject[key];
      }

      const module = { exports: {} };
      sandboxObject.module = module;
      sandboxObject.exports = module.exports;
      sandboxObject.require = parentRequire;
      sandboxObject.__filename = resolvedPath;
      sandboxObject.__dirname = path.dirname(resolvedPath);

      try {
        let script = scriptCache.get(resolvedPath);
        if (!script) {
          const code = fs.readFileSync(resolvedPath, 'utf8');
          const wrappedCode = Module.wrap(code);
          script = new vm.Script(wrappedCode, { filename: resolvedPath });
          scriptCache.set(resolvedPath, script);
        }
        log.info(
          `[PluginLoader.createRequireProxy.runInSandbox] ${basename} load执行中...`,
        );

        const fn: Function = script.runInContext(sandboxContext, {
          timeout: 10000,
        });

        fn.call(
          sandboxObject,
          sandboxObject.exports,
          sandboxObject.require,
          sandboxObject.module,
          sandboxObject.__filename,
          sandboxObject.__dirname,
        );

        log.info(
          `[PluginLoader.createRequireProxy.runInSandbox] ${basename} load执行结束`,
        );
        log.info(
          `[PluginLoader.createRequireProxy.runInSandbox] ${basename} 导出对象keys: ${Object.keys(sandboxObject.module.exports)}`,
        );
        return sandboxObject.module.exports;
      } catch (e) {
        log.error(
          `❌ [PluginLoader.createRequireProxy.runInSandbox] ${basename} load执行异常: \nStack: ${e.stack}`,
        );
        throw new Error(e);
      } finally {
        log.info(
          `[PluginLoader.createRequireProxy.runInSandbox] ${basename} 恢复sandboxObject中...`,
        );
        for (const key of injectedKeys) {
          sandboxObject[key] = originals[key];
        }

        const currentKeys = Object.keys(sandboxObject);
        for (const key of currentKeys) {
          if (!initialKeys.has(key) && !injectedKeys.includes(key)) {
            log.info(
              `[PluginLoader.createRequireProxy.runInSandbox] ${basename} 清理新增的全局变量: ${key}`,
            );
            delete sandboxObject[key];
          }
        }
        log.info(
          `[PluginLoader.createRequireProxy.runInSandbox] ${basename} sandboxObject恢复成功 keys: ${Object.keys(sandboxObject.module.exports)}`,
        );
      }
    }

    return function requireProxy(id: string): any {
      if (builtinModules.includes(id) || id.startsWith('node:')) {
        log.info(
          `[PluginLoader.createRequireProxy.requireProxy] Node模块: ${id}`,
        );
        return hostRequire(id);
      }

      if (id.startsWith('.') || path.isAbsolute(id)) {
        log.info(
          `[PluginLoader.createRequireProxy.requireProxy] 相对路径模块: ${id}`,
        );
        try {
          // @ts-ignore
          const resolvedPath = Module._resolveFilename(id, fakeModule, false);

          if (moduleCache.has(resolvedPath)) {
            log.info(
              `[PluginLoader.createRequireProxy.requireProxy] ${id} 缓存命中`,
            );
            return moduleCache.get(resolvedPath);
          }
          log.info(
            `[PluginLoader.createRequireProxy.requireProxy] ${id} 缓存未命中`,
          );
          const result = runInSandbox(resolvedPath, requireProxy);
          moduleCache.set(resolvedPath, result);
          return result;
        } catch (err) {
          throw new Error(`无法加载相对路径模块 "${id}": ${err.message}`);
        }
      }

      log.info(
        `[PluginLoader.createRequireProxy.requireProxy] 其他模块: ${id}`,
      );
      return fakeModuleRequire(id);
    };
  }

  /**
   * 加载插件脚本
   */
  async loadScript(
    pluginName: string,
    pluginPath: string,
    nodeModulePath: string,
    hostApi: PluginHostApi,
    record: PluginRecord,
  ): Promise<R> {
    try {
      log.info(`[PluginLoader.loadScript] "${pluginName}" 开始加载插件脚本...`);
      const code = await fs.promises.readFile(pluginPath, 'utf-8');
      const wrappedCode = Module.wrap(code);
      const script = new vm.Script(wrappedCode, { filename: pluginPath });
      this.scriptCache.set(pluginPath, script);

      const sandboxObject = this.createSandbox(pluginName, hostApi, record);
      record.sandboxObject = sandboxObject;
      this.sandboxObject = sandboxObject;

      const sandboxContext = vm.createContext(sandboxObject);
      record.sandboxContext = sandboxContext;
      this.sandboxContext = sandboxContext;

      const pluginRequire = this.createRequireProxy(pluginPath, nodeModulePath);
      sandboxObject.require = pluginRequire;

      const fn: Function = script.runInContext(sandboxContext, {
        timeout: 10000,
      });
      fn.call(
        sandboxObject,
        sandboxObject.exports,
        sandboxObject.require,
        sandboxObject.module,
        sandboxObject.__filename,
        sandboxObject.__dirname,
      );

      const exports = sandboxContext.module.exports as PluginExports;
      this.moduleCache.set(pluginPath, exports);
      log.info(
        `[PluginLoader.load] sandboxContext.module.exports keys: ${Object.keys(exports)}`,
      );

      if (!exports || typeof exports !== 'object') {
        return R.errorM(
          '[PluginLoader.loadScript] 插件exports必须导出一个对象',
        );
      }
      record.exports = exports;
      return R.ok();
    } catch (error: any) {
      log.error(
        `[PluginLoader.loadScript] 加载脚本时出现错误, ${error.message} \nStack:${error.stack}`,
      );
      return R.errorMD(`加载脚本时出现错误, ${error.message}`, error.stack);
    }
  }

  async activate(record: PluginRecord): Promise<R> {
    const { exports } = record;
    try {
      if (typeof exports.activate === 'function') {
        await exports.activate();
      } else {
        log.error(
          `[PluginLoader.activate] 插件激活失败, activate is not a function`,
        );
        return R.errorM(`插件激活失败, activate is not a function`);
      }
      return R.ok();
    } catch (error: any) {
      log.error(
        `[PluginLoader.activate] 插件激活失败, ${error.message} \nStack:${error.stack}`,
      );
      return R.errorMD(`插件激活失败, ${error.message}`, error.stack);
    }
  }

  async deactivate(record: PluginRecord): Promise<R> {
    const { exports } = record;
    try {
      if (typeof exports.deactivate === 'function') {
        await exports.deactivate();
      } else {
        log.error(
          `[PluginLoader.deactivate] 插件注销失败, deactivate is not a function`,
        );
        return R.errorM(`插件注销失败, deactivate is not a function`);
      }
      return R.ok();
    } catch (error: any) {
      log.error(
        `[PluginLoader.deactivate] 插件注销失败, ${error.message} \nStack:${error.stack}`,
      );
      return R.errorMD(`插件注销失败, ${error.message}`, error.stack);
    }
  }

  /**
   * 创建沙箱环境
   */
  private createSandbox(
    pluginName: string,
    hostApi: PluginHostApi,
    record: PluginRecord,
  ): any {
    const module = { exports: {} };
    const processLog = LoggerFactory.getApplicationPluginLogger(
      pluginName,
      true,
    );
    hostApi.log = processLog;
    const timerProxy = this.createTimerProxy(record);
    const IpcMainProxy = this.createIpcMainProxy(record);
    const GlobalShortcutProxy = this.createGlobalShortcutProxy(record);
    const appProxy = this.createAppProxy(record);
    const processProxy = this.createProcessProxy(record);
    const electronToolkitUtilsProxy =
      this.createElectronToolkitUtilsProxy(record);
    const electronToolkit: ElectronToolkit = {
      utils: electronToolkitUtilsProxy,
      preload: electronToolkitPreload,
    };
    const sandbox = {
      // ========== Node.js 核心 ==========
      process: processProxy,
      Buffer: global.Buffer,

      require: null as any,
      module: module,
      exports: module.exports,
      __filename: record.pluginPathData.pluginPath,
      __dirname: path.dirname(record.pluginPathData.pluginPath),

      // ========== Electron ==========
      electron: {
        ...electron,
        ipcMain: IpcMainProxy,
        globalShortcut: GlobalShortcutProxy,
      },
      electronToolkit: electronToolkit,

      // ========== 自定义 API ==========
      appPlugin: appProxy,
      effix: hostApi,

      // ========== 定时器（已代理） ==========
      setTimeout: timerProxy.setTimeout,
      clearTimeout: timerProxy.clearTimeout,
      setInterval: timerProxy.setInterval,
      clearInterval: timerProxy.clearInterval,
      setImmediate: timerProxy.setImmediate,
      clearImmediate: timerProxy.clearImmediate,

      // ========== 工具函数 ==========
      console: console,
      atob: global.atob,
      btoa: global.btoa,
      structuredClone: global.structuredClone,

      // ========== Web API / 现代标准 ==========
      fetch: global.fetch,
      Headers: global.Headers,
      Request: global.Request,
      Response: global.Response,
      URL: global.URL,
      URLSearchParams: global.URLSearchParams,
      TextEncoder: global.TextEncoder,
      TextDecoder: global.TextDecoder,
      AbortController: global.AbortController,
      ReadableStream: global.ReadableStream,
      WritableStream: global.WritableStream,
      TransformStream: global.TransformStream,
      EventTarget: global.EventTarget,
      Event: global.Event,
      CustomEvent: global.CustomEvent,
      FormData: global.FormData,
      Blob: global.Blob,
      File: global.File,
      DOMException: global.DOMException,
      crypto: global.crypto || require('crypto').webcrypto,

      // ========== 全局指向自己 ==========
      global: null as any,
      globalThis: null as any,
    };
    sandbox.global = sandbox;
    sandbox.globalThis = sandbox;

    return sandbox;
  }

  private createTimerProxy(record: PluginRecord): TimerProxy {
    return {
      setTimeout(
        callback: (...args: any[]) => void,
        delay?: number,
        ...args: any[]
      ) {
        const timeout = setTimeout(callback, delay, ...args);
        record.timers.timeouts.add(timeout);
        log.info(
          `[PluginLoader.createTimerProxy.setTimeout] "${record.packageJson.name}" 成功注册定时器 timeout:${timeout}`,
        );
        return timeout;
      },
      clearTimeout(timeout: NodeJS.Timeout) {
        if (timeout) {
          clearTimeout(timeout);
          record.timers.timeouts.delete(timeout);
          log.info(
            `[PluginLoader.createTimerProxy.clearTimeout] "${record.packageJson.name}" 成功删除定时器 timeout:${timeout}`,
          );
        }
      },
      setInterval(
        callback: (...args: any[]) => void,
        delay?: number,
        ...args: any[]
      ) {
        const interval = setInterval(callback, delay, ...args);
        record.timers.intervals.add(interval);
        log.info(
          `[PluginLoader.createTimerProxy.setInterval] "${record.packageJson.name}" 成功注册定时器 interval:${interval}`,
        );
        return interval;
      },
      clearInterval(interval: NodeJS.Timeout) {
        if (interval) {
          clearInterval(interval);
          record.timers.intervals.delete(interval);
          log.info(
            `[PluginLoader.createTimerProxy.clearInterval] "${record.packageJson.name}" 成功删除定时器 interval:${interval}`,
          );
        }
      },
      setImmediate(callback: (...args: any[]) => void, ...args: any[]) {
        const immediate = setImmediate(callback, ...args);
        record.timers.immediates.add(immediate);
        log.info(
          `[PluginLoader.createTimerProxy.setImmediate] "${record.packageJson.name}" 成功注册定时器 immediate:${immediate}`,
        );
        return immediate;
      },
      clearImmediate(immediate: NodeJS.Immediate) {
        if (immediate) {
          clearImmediate(immediate);
          record.timers.immediates.delete(immediate);
          log.info(
            `[PluginLoader.createTimerProxy.clearImmediate] "${record.packageJson.name}" 成功删除定时器 immediate:${immediate}`,
          );
        }
      },
    };
  }

  private createIpcMainProxy(record: PluginRecord): IpcMainProxy {
    const safeIpcMain: IpcMainProxy = {
      on(
        channel: string,
        listener: (event: Electron.IpcMainEvent, ...args: any[]) => void,
      ) {
        ipcMain.on(channel, listener);
        let listeners = record.ipcEventListeners.get(channel);
        if (!listeners) {
          listeners = new Set();
          record.ipcEventListeners.set(channel, listeners);
        }
        listeners.add(listener);
        log.info(
          `[PluginLoader.createSafeIpcMain.on] "${record.packageJson.name}" on("${channel}") 成功`,
        );
      },

      off(
        channel: string,
        listener: (event: Electron.IpcMainEvent, ...args: any[]) => void,
      ) {
        ipcMain.off(channel, listener);
        const listeners = record.ipcEventListeners.get(channel);
        if (listeners) {
          listeners.delete(listener);
          if (listeners.size === 0) {
            record.ipcEventListeners.delete(channel);
          }
        }
        log.info(
          `[PluginLoader.createSafeIpcMain.off] "${record.packageJson.name}" off("${channel}") 成功`,
        );
      },

      once(
        channel: string,
        listener: (event: Electron.IpcMainEvent, ...args: any[]) => void,
      ) {
        const wrappedListener = (
          event: Electron.IpcMainEvent,
          ...args: any[]
        ) => {
          try {
            return listener(event, ...args);
          } finally {
            const listeners = record.ipcEventListeners.get(channel);
            if (listeners) {
              listeners.delete(wrappedListener);
              if (listeners.size === 0) {
                record.ipcEventListeners.delete(channel);
              }
            }
          }
        };
        ipcMain.once(channel, wrappedListener);

        let listeners = record.ipcEventListeners.get(channel);
        if (!listeners) {
          listeners = new Set();
          record.ipcEventListeners.set(channel, listeners);
        }
        listeners.add(wrappedListener);
        log.info(
          `[PluginLoader.createSafeIpcMain.once] "${record.packageJson.name}" once("${channel}") 成功`,
        );
      },

      removeAllListeners(channel: string) {
        if (typeof channel !== 'string') {
          throw new Error(
            '[PluginLoader.createSafeIpcMain.removeAllListeners] channel parameter is required',
          );
        }
        ipcMain.removeAllListeners(channel);
        record.ipcEventListeners.delete(channel);
        log.info(
          `[PluginLoader.createSafeIpcMain.removeAllListeners] "${record.packageJson.name}" removeAllListeners("${channel}") 成功`,
        );
      },

      handle(
        channel: string,
        listener: (
          event: Electron.IpcMainInvokeEvent,
          ...args: any[]
        ) => Promise<any> | any,
      ) {
        ipcMain.handle(channel, listener);
        record.ipcInvokeHandlers.set(channel, listener);
        log.info(
          `[PluginLoader.createSafeIpcMain.handle] "${record.packageJson.name}" handle("${channel}") 成功`,
        );
      },

      handleOnce(
        channel: string,
        listener: (
          event: Electron.IpcMainInvokeEvent,
          ...args: any[]
        ) => Promise<any> | any,
      ) {
        ipcMain.handleOnce(channel, listener);
        record.ipcInvokeHandlers.set(channel, listener);
        log.info(
          `[PluginLoader.createSafeIpcMain.handleOnce] "${record.packageJson.name}" handleOnce("${channel}") 成功`,
        );
      },

      removeHandler(channel: string) {
        ipcMain.removeHandler(channel);
        record.ipcInvokeHandlers.delete(channel);
        log.info(
          `[PluginLoader.createSafeIpcMain.removeHandler] "${record.packageJson.name}" removeHandler("${channel}") 成功`,
        );
      },
    };

    safeIpcMain.addListener = safeIpcMain.on;
    safeIpcMain.removeListener = safeIpcMain.off;

    return safeIpcMain;
  }

  private createGlobalShortcutProxy(record: PluginRecord): GlobalShortcutProxy {
    const safeGlobalShortCut: GlobalShortcutProxy = {
      register(
        accelerator: Accelerator,
        callback: () => void,
        description?: string,
      ): boolean {
        return globalShortcutManager.register(
          accelerator,
          'appPlugin',
          record.packageJson.name,
          callback,
          description,
        );
      },

      registerAll(
        accelerators: Accelerator[],
        callback: () => void,
        description?: string,
      ): boolean {
        return globalShortcutManager.registerAll(
          accelerators,
          'appPlugin',
          record.packageJson.name,
          callback,
          description,
        );
      },

      unregister(accelerator: Accelerator): void {
        globalShortcutManager.unregister(accelerator);
      },

      unregisterAll(): void {
        globalShortcutManager.unregisterAllByPluginId(
          'appPlugin',
          record.packageJson.name,
        );
      },

      isRegistered(accelerator: Accelerator): boolean {
        return globalShortcutManager.isRegistered(accelerator);
      },
    };

    return safeGlobalShortCut;
  }

  createAppProxy(record: PluginRecord): AppProxy {
    const service = PluginEventBus.getInstance();

    return {
      isPackaged: app.isPackaged,

      on(event: PluginReceivableEvent, callback: () => void | Promise<void>) {
        const allowedEvents: PluginReceivableEvent[] = [
          'before-activate',
          'activated',
          'before-deactivate',
        ];
        if (!allowedEvents.includes(event)) {
          log.warn(
            `[PluginLifecycleContext.on] Event "${event}" is not allowed.`,
          );
          return () => {};
        }
        return service.on(record.packageJson.name, event, callback);
      },

      isActivated(): boolean {
        return (
          PluginManager.getInstance().getState(record.packageJson.name) ===
          'activated'
        );
      },

      whenActivated(): Promise<void> {
        if (this.isActivated()) {
          return Promise.resolve();
        }
        return new Promise((resolve) => {
          const unwatch = service.on(
            record.packageJson.name,
            'activated',
            () => {
              log.info(
                `[PluginLifecycleContext.whenActivated] 插件已激活 :${record.packageJson.name}, 触发whenActivated().then(callback)`,
              );
              unwatch();
              resolve();
            },
          );
          if (this.isActivated()) {
            log.info(
              `[PluginLifecycleContext.whenActivated] 防止竞态检查-插件已激活 :${record.packageJson.name}`,
            );
            unwatch();
            resolve();
          }
        });
      },

      getVersion(): string {
        return record.packageJson.version;
      },

      getPath(type: PluginPathTypes): string {
        switch (type) {
          case 'userData':
            return path.join(
              app.getPath(type),
              `./zhima-appPlugins-userData/${record.packageJson.name}`,
            );
          default:
            return '';
        }
      },

      getName(): string {
        return record.packageJson.name;
      },
    };
  }

  createProcessProxy(record: PluginRecord): any {
    return {
      platform: process.platform,
      env: {
        ELECTRON_RENDERER_URL: `http://${record.packageJson.server.host}:${record.packageJson.server.port}`,
        NODE_ENV: record.packageJson.env.NODE_ENV,
        LANG: process.env.LANG,
      },
      stderr: {
        fd: process.stderr.fd,
      },
    };
  }

  createElectronToolkitUtilsProxy(
    record: PluginRecord,
  ): ElectronToolkitUtilsProxy {
    return {
      is: {
        dev: record.packageJson.env.NODE_ENV === 'development',
      },
      platform: electronPlatform,
    };
  }
}

export const pluginLoader = PluginLoader.getInstance();
