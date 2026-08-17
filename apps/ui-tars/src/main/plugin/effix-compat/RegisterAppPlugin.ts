/* eslint-disable */
import path from 'path';
import { PluginHostApi } from './types';
import { LoggerFactory } from './LoggerAdapter';
import { pluginManager } from './PluginManager';
import R from './R';
import { PluginPackageJson, PluginPathData } from './types';
const log = LoggerFactory.getMainLogger().scope(
  'effix-compat/RegisterAppPlugin',
);

class RegisterAppPlugin {
  private static instance: RegisterAppPlugin;

  static getInstance(): RegisterAppPlugin {
    if (!RegisterAppPlugin.instance) {
      RegisterAppPlugin.instance = new RegisterAppPlugin();
    }
    return RegisterAppPlugin.instance;
  }

  private hooks: { onReady: Array<(ctx: any) => void> } = {
    onReady: [],
  };

  private constructor() {}

  /**
   * 测试加载 ttime 插件（与 effix 中的测试方式一致）
   */
  testVmTtime = async (hostApi: PluginHostApi) => {
    const dirname = path.resolve('E:/ElectronProject/effix-plugins');
    const pluginRootPath = path.resolve(dirname, 'ttime-electron-vite');

    const pluginPackageJson: PluginPackageJson = {
      name: 'time-translate',
      version: '0.9.2',
      description: '一款简洁、高效、高颜值的输入、截图、划词翻译软件',
      main: './out/main/index.js',
      nodeModulePath: './node_modules',
      author: 'byliangcheng',
      homepage: 'https://ttime.timerecord.cn/',
      server: { host: 'localhost', port: 9098 },
      env: {
        NODE_ENV: 'production',
      },
    };
    const pluginData: PluginPathData = {
      pluginPath: path.resolve(pluginRootPath, pluginPackageJson.main),
      nodeModulePath: path.resolve(
        pluginRootPath,
        pluginPackageJson.nodeModulePath,
      ),
      rendererUrl: `http://${pluginPackageJson.server.host ?? 'localhost'}:${pluginPackageJson.server.port}`,
    };

    log.info(
      '[RegisterAppPlugin.testVmTtime] pluginPackageJson ',
      pluginPackageJson,
    );
    log.info('[RegisterAppPlugin.testVmTtime] pluginData ', pluginData);

    const startPluginResult = await pluginManager.startPlugin(
      pluginPackageJson,
      pluginData,
      hostApi,
    );
    if (startPluginResult.code === R.SUCCESS) {
      log.info('[RegisterAppPlugin.testVmTtime] 插件已启动');
    } else {
      log.error(
        `[RegisterAppPlugin.testVmTtime] 插件启动失败 失败信息:${startPluginResult.msg} \n错误栈:${startPluginResult.data}`,
      );
    }
  };
}

export default RegisterAppPlugin.getInstance();
