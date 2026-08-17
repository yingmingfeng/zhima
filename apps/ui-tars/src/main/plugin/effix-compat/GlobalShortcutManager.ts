import { globalShortcut } from 'electron';
import { LoggerFactory } from './LoggerAdapter';
import { Accelerator } from './types';

const log = LoggerFactory.getMainLogger().scope(
  'effix-compat/GlobalShortcutManager',
);

export type ShortcutSource = 'host' | 'appPlugin' | 'uiPlugin';

export interface ShortcutRecord {
  accelerator: Accelerator;
  source: ShortcutSource;
  pluginId: string;
  description?: string;
}

export interface CheckResult {
  available: boolean;
  record?: ShortcutRecord;
  message?: string;
}

class GlobalShortcutManager {
  private static instance: GlobalShortcutManager;
  private registry: Map<string, ShortcutRecord> = new Map();

  private constructor() {}

  public static getInstance(): GlobalShortcutManager {
    if (!GlobalShortcutManager.instance) {
      GlobalShortcutManager.instance = new GlobalShortcutManager();
    }
    return GlobalShortcutManager.instance;
  }

  public check(accelerator: Accelerator): CheckResult {
    accelerator = accelerator.toLowerCase();
    if (this.registry.has(accelerator)) {
      const record = this.registry.get(accelerator)!;
      const message = `快捷键 '${accelerator}' 已被宿主或插件注册. record:${record}}.`;
      log.info(`[GlobalShortcutManager.check] ${message}`);
      return { available: false, message };
    }
    if (globalShortcut.register(accelerator, () => {})) {
      globalShortcut.unregister(accelerator);
      log.info(
        `[GlobalShortcutManager.check] 快捷键 '${accelerator}' 可以注册.`,
      );
      return { available: true };
    } else {
      const message = `快捷键 '${accelerator}' 已被其他应用程序占用.`;
      log.info(`[GlobalShortcutManager.check] ${message}`);
      return { available: false, message };
    }
  }

  public add(
    accelerator: Accelerator,
    source: ShortcutSource,
    pluginId: string,
    description?: string,
  ): void {
    accelerator = accelerator.toLowerCase();
    if (this.registry.has(accelerator)) {
      log.info(
        `[GlobalShortcutManager.add] fail to add. Shortcut '${accelerator}' has already added .Source:${source} PluginId:'${pluginId}' Description:'${description}'.`,
      );
      return;
    }
    const record: ShortcutRecord = {
      accelerator,
      source,
      pluginId,
      description,
    };
    log.info(
      `[GlobalShortcutManager.add] success to add. Shortcut '${accelerator}'. Source:${source} PluginId:'${pluginId}' Description:'${description}'.`,
    );
    this.registry.set(accelerator, record);
  }

  public register(
    accelerator: Accelerator,
    source: ShortcutSource,
    pluginId: string,
    callback: () => void,
    description?: string,
  ): boolean {
    const checkResult = this.check(accelerator);
    if (checkResult.available) {
      const isRegistered = globalShortcut.register(accelerator, callback);
      if (isRegistered) {
        log.info(
          `[GlobalShortcutManager.register] success to register. Shortcut '${accelerator}'. Source:${source} PluginId:'${pluginId}' Description:'${description}'.`,
        );
        this.add(accelerator, source, pluginId, description);
      } else {
        log.info(
          `[GlobalShortcutManager.register] fail to register. check is pass but register failed. Shortcut '${accelerator}'. Source:${source} PluginId:'${pluginId}' Description:'${description}'.`,
        );
      }
      return isRegistered;
    } else {
      log.info(
        `[GlobalShortcutManager.register] fail to register. check is not pass. Shortcut '${accelerator}'. Source:${source} PluginId:'${pluginId}' Description:'${description}'.`,
      );
      return false;
    }
  }

  public registerAll(
    accelerators: Accelerator[],
    source: ShortcutSource,
    pluginId: string,
    callback: () => void,
    description?: string,
  ): boolean {
    const successList: Accelerator[] = [];
    for (const acc of accelerators) {
      const isRegistered = this.register(
        acc,
        source,
        pluginId,
        callback,
        description,
      );
      if (isRegistered) {
        successList.push(acc);
      } else {
        for (const acc of successList) {
          this.unregister(acc);
        }
        return false;
      }
    }
    return true;
  }

  public delete(accelerator: Accelerator): void {
    accelerator = accelerator.toLowerCase();
    if (this.registry.delete(accelerator)) {
      log.info(
        `[GlobalShortcutManager.delete] Shortcut '${accelerator}' delete success`,
      );
    } else {
      log.debug(
        `[GlobalShortcutManager.delete] Shortcut '${accelerator}' has not registered`,
      );
    }
  }

  public unregister(accelerator: Accelerator): void {
    globalShortcut.unregister(accelerator);
    this.delete(accelerator);
  }

  public unregisterAllByPluginId(
    source: ShortcutSource,
    pluginId: string,
  ): void {
    for (const [accelerator, record] of this.registry) {
      if (record.source === source && record.pluginId === pluginId) {
        globalShortcut.unregister(accelerator);
        this.delete(accelerator);
      }
    }
  }

  public isRegistered(accelerator: Accelerator): boolean {
    const checkResult = this.check(accelerator);
    return !checkResult.available;
  }

  public getAllRecords(): ReadonlyArray<ShortcutRecord> {
    return Array.from(this.registry.values()).map((record) => ({ ...record }));
  }
}

export const globalShortcutManager = GlobalShortcutManager.getInstance();
