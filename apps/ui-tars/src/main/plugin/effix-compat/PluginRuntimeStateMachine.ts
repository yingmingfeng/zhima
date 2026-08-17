import { LoggerFactory } from './LoggerAdapter';

export type PluginInstallStatus = 'uninstalled' | 'installed';
export type PluginEnableStatus = 'enabled' | 'disabled';

export type PluginRuntimeStatus =
  | 'pending'
  | 'loading'
  | 'loaded'
  | 'activating'
  | 'activated'
  | 'deactivating'
  | 'deactivated'
  | 'destroying'
  | 'destroyed'
  | 'failed';

export type PluginStatus =
  | PluginInstallStatus
  | PluginEnableStatus
  | PluginRuntimeStatus;

export type PluginRuntimeEvent =
  | 'load'
  | 'loadSuccess'
  | 'loadFailed'
  | 'activate'
  | 'activationSuccess'
  | 'activationFailed'
  | 'deactivate'
  | 'deactivationSuccess'
  | 'deactivationFailed'
  | 'destroy'
  | 'destroySuccess'
  | 'destroyFailed';

const log = LoggerFactory.getMainLogger().scope(
  'effix-compat/PluginStateMachine',
);

export class PluginRuntimeStateMachine {
  private pluginName: string;
  private state: PluginRuntimeStatus = 'pending';

  constructor(pluginName: string) {
    if (!pluginName)
      throw new Error(
        '[PluginRuntimeStateMachine.constructor] pluginName is required',
      );
    this.pluginName = pluginName;
  }

  private static readonly rules: Record<
    PluginRuntimeStatus,
    Partial<Record<PluginRuntimeEvent, PluginRuntimeStatus>>
  > = {
    pending: { load: 'loading' },
    loading: { loadSuccess: 'loaded', loadFailed: 'failed' },
    loaded: { activate: 'activating' },
    activating: { activationSuccess: 'activated', activationFailed: 'failed' },
    activated: { deactivate: 'deactivating' },
    deactivating: {
      deactivationSuccess: 'deactivated',
      deactivationFailed: 'failed',
    },
    deactivated: { destroy: 'destroying' },
    destroying: { destroySuccess: 'destroyed', destroyFailed: 'failed' },
    destroyed: {},
    failed: {},
  };

  getStatus() {
    return this.state;
  }

  transition(event: PluginRuntimeEvent): boolean {
    log.info(
      `[PluginRuntimeStateMachine.transition] "${this.pluginName}" 触发事件："${event}" 当前状态:"${this.state}" 尝试进行状态转换中... `,
    );
    if (!this.can(event)) {
      throw new Error(
        `[PluginRuntimeStateMachine.transition] Invalid transition currentState:${this.state} event:${event}`,
      );
    }
    const next = this.getNextState(event);
    if (next === undefined) {
      throw new Error(
        `[PluginRuntimeStateMachine.transition] cant get next state currentState:${this.state} event:${event}`,
      );
    }
    log.info(
      `[PluginRuntimeStateMachine.transition] "${this.pluginName}" 状态转换成功 ${this.state} → ${next} (via '${event}')`,
    );
    this.state = next;
    return true;
  }

  private getNextState(
    event: PluginRuntimeEvent,
  ): PluginRuntimeStatus | undefined {
    return PluginRuntimeStateMachine.rules[this.state]?.[event];
  }

  forceSet(status: PluginRuntimeStatus): Boolean {
    if (!this.isValidState(status)) {
      throw new Error(
        `[PluginRuntimeStateMachine.transition] Invalid status: ${status}`,
      );
    }
    this.state = status;
    return true;
  }

  private isValidState(state: string): state is PluginRuntimeStatus {
    return [
      'pending',
      'loading',
      'loaded',
      'activating',
      'activated',
      'deactivating',
      'deactivated',
      'failed',
    ].includes(state);
  }

  toJSON() {
    return {
      pluginName: this.pluginName,
      state: this.state,
    };
  }

  can(event: PluginRuntimeEvent): boolean {
    const nextState = this.getNextState(event);
    return nextState !== undefined;
  }
}
