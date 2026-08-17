/* eslint-disable */
import vm from 'vm';
import { PluginRuntimeStateMachine } from './PluginRuntimeStateMachine';
import { PluginReceivableEvent } from './PluginEventBus';
import { electronAPI as electronToolkitPreload } from '@electron-toolkit/preload';

/**
 * 宿主提供的 API（原 EffixApi，迁移后重命名）
 */
export interface PluginHostApi {
  db: DBInstanceType;
  sessionPreloadPath: string;
  mainWindow: BrowserWindow;
  remoteMain: typeof remoteMain;
  log?: typeof log;
  nativeAddon: typeof global.NATIVE_ADDONS;
  localPlugins: typeof global.LOCAL_PLUGINS;
}

/**
 * 插件配置 api
 */
export interface PluginConfigApi {
  get<T = any>(): Promise<T | null>;
  set<T = any>(data: T): Promise<void>;
  delete(): Promise<void>;
  onChange(callback: (newData: any) => void): () => void;
}

/**
 * @electron-toolkit 提供的 api
 */
export interface ElectronToolkit {
  utils: ElectronToolkitUtilsProxy;
  preload: typeof electronToolkitPreload;
}

/**
 * 插件实例应导出的对象结构
 */
export interface PluginExports {
  activate(): Promise<void>;
  deactivate(): Promise<void>;
}

/**
 * 插件中创建的 timers
 */
export type Timers = {
  timeouts: Set<NodeJS.Timeout>;
  intervals: Set<NodeJS.Timeout>;
  immediates: Set<NodeJS.Immediate>;
};

/**
 * setTimeout、setInterval、setImmediate 的代理对象
 */
export type TimerProxy = {
  setTimeout(callback: (_: void) => void, delay?: number): NodeJS.Timeout;
  setTimeout<TArgs extends any[]>(
    callback: (...args: TArgs) => void,
    delay?: number,
    ...args: TArgs
  ): NodeJS.Timeout;
  clearTimeout(timeout: NodeJS.Timeout | string | number | undefined): void;
  setInterval(callback: (_: void) => void, delay?: number): NodeJS.Timeout;
  setInterval<TArgs extends any[]>(
    callback: (...args: TArgs) => void,
    delay?: number,
    ...args: TArgs
  ): NodeJS.Timeout;
  clearInterval(timeout: NodeJS.Timeout | string | number | undefined): void;
  setImmediate(callback: (_: void) => void): NodeJS.Immediate;
  setImmediate<TArgs extends any[]>(
    callback: (...args: TArgs) => void,
    ...args: TArgs
  ): NodeJS.Immediate;
  clearImmediate(immediate: NodeJS.Immediate | undefined): void;
};

type IpcMainEvent = Electron.IpcMainEvent;
type IpcMainInvokeEvent = Electron.IpcMainInvokeEvent;

export type IpcEventListenerMap = Map<
  string,
  Set<(event: Electron.IpcMainEvent, ...args: any[]) => void>
>;

export type IpcInvokeHandlerMap = Map<
  string,
  (event: Electron.IpcMainInvokeEvent, ...args: any[]) => Promise<any> | any
>;

export interface IpcMainProxy {
  on(
    channel: string,
    listener: (event: IpcMainEvent, ...args: any[]) => void,
  ): void;
  off(
    channel: string,
    listener: (event: IpcMainEvent, ...args: any[]) => void,
  ): void;
  once(
    channel: string,
    listener: (event: IpcMainEvent, ...args: any[]) => void,
  ): void;
  addListener?: IpcMainProxy['on'];
  removeListener?: IpcMainProxy['off'];
  removeAllListeners(channel: string): void;
  handle(
    channel: string,
    listener: (event: IpcMainInvokeEvent, ...args: any[]) => Promise<any> | any,
  ): void;
  handleOnce(
    channel: string,
    listener: (event: IpcMainInvokeEvent, ...args: any[]) => Promise<any> | any,
  ): void;
  removeHandler(channel: string): void;
}

export type Accelerator = Electron.Accelerator;

export interface GlobalShortcutProxy {
  register(accelerator: Accelerator, callback: () => void): boolean;
  registerAll(accelerators: Accelerator[], callback: () => void): void;
  unregister(accelerator: Accelerator): void;
  unregisterAll(): void;
  isRegistered(accelerator: Accelerator): boolean;
}

export type PluginPathTypes =
  | 'home'
  | 'appData'
  | 'userData'
  | 'sessionData'
  | 'temp'
  | 'exe'
  | 'module'
  | 'desktop'
  | 'documents'
  | 'downloads'
  | 'music'
  | 'pictures'
  | 'videos'
  | 'recent'
  | 'logs'
  | 'crashDumps';

export interface AppProxy {
  isPackaged: boolean;
  on(event: PluginReceivableEvent, callback: () => void | Promise<void>): void;
  isActivated(): boolean;
  whenActivated(): Promise<void>;
  getVersion(): string;
  getPath(type: PluginPathTypes): string;
  getName(): string;
}

export interface ProcessProxy {}

interface Is {
  dev: boolean;
}

interface Platform {
  isWindows: boolean;
  isMacOS: boolean;
  isLinux: boolean;
}

export interface ElectronToolkitUtilsProxy {
  is: Is;
  platform: Platform;
}

export interface PluginRecord {
  packageJson: PluginPackageJson;
  pluginPathData: PluginPathData;
  exports: PluginExports;
  sandboxObject: any;
  sandboxContext: vm.Context;
  stateMachine: PluginRuntimeStateMachine;
  timers: Timers;
  ipcEventListeners: IpcEventListenerMap;
  ipcInvokeHandlers: IpcInvokeHandlerMap;
}

export interface PluginPackageJson {
  name: string;
  version: string;
  description?: string;
  main?: string;
  nodeModulePath?: string;
  author?: string;
  homepage?: string;
  server?: {
    host?: string;
    port: number;
  };
  env?: {
    NODE_ENV: 'development' | 'production' | 'test';
  };
}

export interface PluginPathData {
  pluginPath: string;
  nodeModulePath: string;
  rendererUrl: string;
}
