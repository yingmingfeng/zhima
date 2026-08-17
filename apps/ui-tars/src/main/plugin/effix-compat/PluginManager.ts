import vm from 'vm';
import {
  IpcEventListenerMap,
  IpcInvokeHandlerMap,
  PluginExports,
  Timers,
} from './types';
import { pluginLoader, PluginLoader } from './PluginLoader';
import { pluginEventBus, PluginEventBus } from './PluginEventBus';
import { PluginRuntimeStateMachine } from './PluginRuntimeStateMachine';
import { PluginRecord, PluginPackageJson, PluginPathData } from './types';
import { LoggerFactory } from './LoggerAdapter';
import R from './R';
import { ipcMain } from 'electron';
import { globalShortcutManager } from './GlobalShortcutManager';
const log = LoggerFactory.getMainLogger().scope('effix-compat/PluginManager');

export class PluginManager {
  private static instance: PluginManager;
  private pluginRegistry = new Map<string, PluginRecord>();
  private loader: PluginLoader;
  private eventBus: PluginEventBus;

  private constructor() {
    this.eventBus = pluginEventBus;
    this.loader = pluginLoader;
  }

  static getInstance(): PluginManager {
    if (!this.instance) {
      this.instance = new PluginManager();
    }
    return this.instance;
  }

  /**
   * 启动插件
   */
  async startPlugin(
    pluginPackageJson: PluginPackageJson,
    pluginPathData: PluginPathData,
    hostApi: any,
  ): Promise<R> {
    const pluginName = pluginPackageJson.name;
    const pluginPath = pluginPathData.pluginPath;
    const nodeModulePath = pluginPathData.nodeModulePath;
    const pluginVersion = pluginPackageJson.version;
    try {
      const record = this.createPluginRecord(
        pluginName,
        pluginPath,
        pluginVersion,
      );
      record.packageJson = pluginPackageJson;
      record.pluginPathData = pluginPathData;

      // 加载脚本
      await this.eventBus.emit(pluginName, 'before-load');
      record.stateMachine.transition('load');
      const loadResult = await this.loader.loadScript(
        pluginName,
        pluginPath,
        nodeModulePath,
        hostApi,
        record,
      );
      if (loadResult.code === R.SUCCESS) {
        record.stateMachine.transition('loadSuccess');
        await this.eventBus.emit(pluginName, 'loaded');
      } else {
        record.stateMachine.transition('loadFailed');
        return R.errorMD(
          `[PluginManager.startPlugin] loadFailed msg:${loadResult.msg}`,
          loadResult.data,
        );
      }

      // 激活插件
      await this.eventBus.emit(pluginName, 'before-activate');
      record.stateMachine.transition('activate');
      const activateResult = await this.loader.activate(record);
      if (activateResult.code === R.SUCCESS) {
        record.stateMachine.transition('activationSuccess');
        await this.eventBus.emit(pluginName, 'activated');
      } else {
        record.stateMachine.transition('activationFailed');
        return R.errorMD(
          `[PluginManager.startPlugin] activationFailed msg:${activateResult.msg}`,
          activateResult.data,
        );
      }

      return R.ok();
    } catch (e) {
      return R.errorMD(`[PluginManager.startPlugin] error:${e.message}`, e);
    }
  }

  private createPluginRecord(
    pluginName: string,
    pluginPath: string,
    pluginVersion: string,
  ): PluginRecord {
    const stateMachine = new PluginRuntimeStateMachine(pluginName);
    const timers: Timers = {
      timeouts: new Set<NodeJS.Timeout>(),
      intervals: new Set<NodeJS.Timeout>(),
      immediates: new Set<NodeJS.Immediate>(),
    };
    const ipcEventListeners: IpcEventListenerMap = new Map();
    const ipcInvokeHandlers: IpcInvokeHandlerMap = new Map();

    const record: PluginRecord = {
      packageJson: {} as PluginPackageJson,
      pluginPathData: {} as PluginPathData,
      exports: {} as PluginExports,
      sandboxObject: {} as any,
      sandboxContext: {} as vm.Context,
      stateMachine: stateMachine,
      timers: timers,
      ipcEventListeners: ipcEventListeners,
      ipcInvokeHandlers: ipcInvokeHandlers,
    };
    this.pluginRegistry.set(pluginName, record);
    return record;
  }

  /**
   * 停止插件
   */
  async stopPlugin(pluginName: string): Promise<R> {
    const record = this.pluginRegistry.get(pluginName);

    await this.eventBus.emit(pluginName, 'before-deactivate');
    record.stateMachine.transition('deactivate');
    const deactivateResult = await this.loader.deactivate(record);
    if (deactivateResult.code === R.SUCCESS) {
      record.stateMachine.transition('deactivationSuccess');
      await this.eventBus.emit(pluginName, 'deactivated');
    } else {
      record.stateMachine.transition('deactivationFailed');
      return R.errorMD(
        `[PluginManager.stopPlugin] deactivationFailed msg:${deactivateResult.msg}`,
        deactivateResult.data,
      );
    }
    return R.ok();
  }

  /**
   * 销毁插件占用的资源
   */
  async destroyPlugin(pluginName: string): Promise<R> {
    const record = this.pluginRegistry.get(pluginName);

    await this.eventBus.emit(pluginName, 'before-destroy');
    record.stateMachine.transition('destroy');

    try {
      this.clearTimer(record);
      this.clearIpcListeners(record);
      this.clearGlobalShortcuts(record);
      this.eventBus.removeAll(pluginName);
      this.pluginRegistry.delete(pluginName);

      record.stateMachine.transition('destroySuccess');
      await this.eventBus.emit(pluginName, 'destroyed');
      return R.ok();
    } catch (e) {
      record.stateMachine.transition('destroyFailed');
      return R.errorMD(
        `[PluginManager.destroyPlugin] destroyFailed msg:${e.msg}`,
        e,
      );
    }
  }

  private clearTimer(record: PluginRecord): void {
    if (record.timers) {
      record.timers.timeouts.forEach(clearTimeout);
      record.timers.intervals.forEach(clearInterval);
      record.timers.immediates.forEach(clearImmediate);

      record.timers.timeouts.clear();
      record.timers.intervals.clear();
      record.timers.immediates.clear();
    }
  }

  private clearIpcListeners(record: PluginRecord): void {
    for (const [channel, listeners] of record.ipcEventListeners) {
      for (const listener of Array.from(listeners)) {
        ipcMain.removeListener(channel, listener);
      }
    }
    record.ipcEventListeners.clear();

    for (const channel of record.ipcInvokeHandlers.keys()) {
      ipcMain.removeHandler(channel);
    }
    record.ipcInvokeHandlers.clear();
  }

  private clearGlobalShortcuts(record: PluginRecord): void {
    globalShortcutManager.unregisterAllByPluginId(
      'appPlugin',
      record.packageJson.name,
    );
  }

  // --- 查询 ---
  getState(pluginName: string): string {
    const record = this.pluginRegistry.get(pluginName);
    if (!record) {
      return 'unknown';
    }
    return record.stateMachine.getStatus();
  }

  hasPlugin(pluginName: string): boolean {
    return this.pluginRegistry.has(pluginName);
  }
}

export const pluginManager = PluginManager.getInstance();
