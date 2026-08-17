/**
 * effix 应用插件系统兼容层
 *
 * 从 effix 1:1 迁移的 vm 沙箱插件加载系统
 * 包含：PluginManager、PluginLoader、PluginEventBus、
 *       PluginRuntimeStateMachine、GlobalShortcutManager、R
 */
export { PluginManager, pluginManager } from './PluginManager';
export { PluginLoader, pluginLoader } from './PluginLoader';
export { PluginEventBus, pluginEventBus } from './PluginEventBus';
export { PluginRuntimeStateMachine } from './PluginRuntimeStateMachine';
export { globalShortcutManager } from './GlobalShortcutManager';
export { default as R } from './R';
export { default as registerAppPlugin } from './RegisterAppPlugin';
export type {
  PluginHostApi,
  PluginRecord,
  PluginExports,
  PluginPackageJson,
  PluginPathData,
  PluginEvents,
  PluginReceivableEvent,
  Timers,
  TimerProxy,
  IpcMainProxy,
  GlobalShortcutProxy,
  AppProxy,
  ElectronToolkit,
  ElectronToolkitUtilsProxy,
  PluginPathTypes,
  Accelerator,
} from './types';
