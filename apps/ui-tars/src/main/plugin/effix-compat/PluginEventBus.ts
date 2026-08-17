import { LoggerFactory } from './LoggerAdapter';
const log = LoggerFactory.getMainLogger().scope('effix-compat/PluginEventBus');

export type PluginInstallEvents =
  | 'before-install'
  | 'installed'
  | 'before-uninstall'
  | 'uninstalled';

export type PluginEnableEvents =
  | 'before-enable'
  | 'enabled'
  | 'before-disable'
  | 'disabled';

export type PluginRuntimeEvents =
  | 'before-load'
  | 'loaded'
  | 'before-activate'
  | 'activated'
  | 'before-deactivate'
  | 'deactivated'
  | 'before-destroy'
  | 'destroyed';

export type PluginEvents =
  | PluginInstallEvents
  | PluginEnableEvents
  | PluginRuntimeEvents;

export type PluginReceivableEvent =
  | 'before-activate'
  | 'activated'
  | 'before-deactivate';

type Listener = () => void | Promise<void>;

export class PluginEventBus {
  private static instance: PluginEventBus;
  private events = new Map<string, Map<PluginEvents, Set<Listener>>>();

  private constructor() {}

  static getInstance(): PluginEventBus {
    if (!this.instance) {
      this.instance = new PluginEventBus();
    }
    return this.instance;
  }

  async emit(pluginName: string, event: PluginEvents): Promise<void> {
    log.info(
      `[PluginEventBus.emit] "${pluginName}" 触发事件:"${event}"中......`,
    );
    const eventMap = this.events.get(pluginName);
    if (!eventMap) {
      log.info(`[PluginEventBus.emit] "${pluginName}" eventMap为空,暂无监听器`);
      return;
    }

    const listeners = eventMap.get(event);
    if (!listeners || listeners.size === 0) {
      log.info(
        `[PluginEventBus.emit] "${pluginName}" eventMap非空,但事件"${event}"上暂无监听器`,
      );
      return;
    }
    for (const listener of listeners) {
      try {
        await Promise.resolve(listener());
      } catch (err) {
        throw new Error(
          `[PluginEventBus.emit] "${pluginName}" event:${event} handler error:`,
          err,
        );
      }
    }
    log.info(`[PluginEventBus.emit] "${pluginName}" "${event}"事件触发成功`);
  }

  on(pluginName: string, event: PluginEvents, listener: Listener): () => void {
    if (!this.events.has(pluginName)) {
      this.events.set(pluginName, new Map());
    }

    const eventMap = this.events.get(pluginName)!;
    if (!eventMap.has(event)) {
      eventMap.set(event, new Set());
    }

    const listeners = eventMap.get(event)!;
    listeners.add(listener);

    return () => {
      listeners.delete(listener);
    };
  }

  removeAll(pluginName: string) {
    this.events.delete(pluginName);
  }

  removeEvent(pluginName: string, event: PluginEvents) {
    const eventMap = this.events.get(pluginName);
    if (eventMap) {
      eventMap.delete(event);
    }
  }
}

export const pluginEventBus = PluginEventBus.getInstance();
