/**
 * Logger 适配器
 * effix 使用 LoggerFactory.getMainLogger().scope('xxx') 模式
 * zhima 使用 electron-log 直接导出
 * 此模块提供兼容层，使迁移代码无需修改日志调用方式
 */
import log from 'electron-log';

/**
 * 模拟 effix 的 LoggerFactory 接口
 * 返回一个带 scope 方法的对象，与 electron-log 的 logger.scope 行为一致
 */
export const LoggerFactory = {
  getMainLogger() {
    return {
      scope(name: string) {
        return log.scope(name);
      },
    };
  },
  /**
   * 为应用插件创建日志记录器
   * effix 中此方法会创建独立的日志文件，这里简化为 scope 日志
   */
  getApplicationPluginLogger(pluginName: string, _appPluginNeedTime = false) {
    return log.scope(`plugin:${pluginName}`);
  },
};
