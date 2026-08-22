/**
 * 托盘触发的 DSH 交互控制器（挂载于主窗口全局）：
 * - 切换 profile：未 boot 时直接切换（无代价）；已 boot 时弹确认 dialog（会重启会话、替换窗口）
 * - 切换运行模式（内置/外部）：统一用模态框 dialog（确认 + 处理中状态）
 * - 结果反馈：主进程广播的进度/成功/失败 toast（loading 会被后续消息 dismiss）
 */
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/renderer/src/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/renderer/src/components/ui/dialog';
import { Input } from '@/renderer/src/components/ui/input';

type DshRunMode = 'builtin' | 'external';

type DshShellMode = 'compatibility' | 'advanced';

interface PendingModeSwitch {
  mode: DshRunMode;
  needsStop: boolean;
}

interface ModeDialogState {
  mode: DshRunMode;
  needsStop: boolean;
}

interface ProfileChangeDialog {
  profileName: string;
  added: string[];
  removed: string[];
}

const DEFAULT_PORT = 3080;

export function DshTrayController() {
  const [modeDialogState, setModeDialogState] =
    useState<ModeDialogState | null>(null);
  const [profileDialogName, setProfileDialogName] = useState<string | null>(
    null,
  );
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');
  const [portValue, setPortValue] = useState(String(DEFAULT_PORT));
  const [processing, setProcessing] = useState(false);
  const [shellModeDialog, setShellModeDialog] = useState<DshShellMode | null>(
    null,
  );
  const [shellModeProcessing, setShellModeProcessing] = useState(false);
  const [profileChange, setProfileChange] =
    useState<ProfileChangeDialog | null>(null);
  const [profileChangeProcessing, setProfileChangeProcessing] = useState(false);
  const pendingModeRef = useRef<PendingModeSwitch | null>(null);

  useEffect(() => {
    // profile 切换：未 boot 直接切换，已 boot 弹确认 dialog。
    const offProfile = window.dsh.onProfileSwitchRequest(
      ({ name, isBooted }) => {
        if (!isBooted) {
          // 未 boot，无代价直接切换，结果 toast 由主进程统一广播。
          void window.dsh.confirmProfileSwitch(name, true);
          return;
        }
        // 已 boot，需确认（会重启会话、替换窗口）
        setProfileDialogName(name);
      },
    );

    const offMode = window.dsh.onModeSwitchRequest(
      ({ mode, port, needsStop }) => {
        pendingModeRef.current = { mode, needsStop: needsStop ?? false };
        setPortValue(String(port ?? DEFAULT_PORT));
        setProcessing(false);
        setModeDialogState({ mode, needsStop: needsStop ?? false });
      },
    );

    // loading toast 需主动 dismiss，否则"正在停止内置 DSH…"会一直转。
    let loadingId: string | number | undefined;
    const offToast = window.dsh.onToast(({ message, type }) => {
      if (type === 'loading') {
        loadingId = toast.loading(message);
        return;
      }
      if (loadingId !== undefined) {
        toast.dismiss(loadingId);
        loadingId = undefined;
      }
      if (type === 'error') toast.error(message);
      else toast.success(message);
    });

    const offCreate = window.dsh.onProfileCreateRequest(() => {
      setNewProfileName('');
      setCreateDialogOpen(true);
    });

    const offShellMode = window.dsh.onShellModeSwitchRequest(({ mode }) => {
      setShellModeProcessing(false);
      setShellModeDialog(mode);
    });

    // 检测到当前选中 profile 插件变化 → 弹 diff dialog 引导重启。
    const offProfileChanged = window.dsh.onProfileChangedRequest((payload) => {
      setProfileChangeProcessing(false);
      setProfileChange({
        profileName: payload.profileName,
        added: payload.added ?? [],
        removed: payload.removed ?? [],
      });
    });

    return () => {
      offProfile();
      offMode();
      offToast();
      offCreate();
      offShellMode();
      offProfileChanged();
    };
  }, []);

  const confirmModeSwitch = async (): Promise<void> => {
    const pending = pendingModeRef.current;
    if (!pending) return;
    if (pending.mode === 'external') {
      const port = Number.parseInt(portValue, 10);
      if (!Number.isInteger(port) || port <= 0 || port > 65535) {
        toast.error('端口号无效，请输入 1-65535 之间的数字');
        return;
      }
      setProcessing(true);
      const result = await window.dsh.confirmModeSwitch('external', port, true);
      setProcessing(false);
      setModeDialogState(null);
      if (result && !result.ok) {
        toast.error(
          typeof result.error === 'string' ? result.error : '切换失败',
        );
      }
    } else {
      setProcessing(true);
      const result = await window.dsh.confirmModeSwitch(
        'builtin',
        undefined,
        true,
      );
      setProcessing(false);
      setModeDialogState(null);
      if (result && !result.ok) {
        toast.error(
          typeof result.error === 'string' ? result.error : '切换失败',
        );
      }
    }
  };

  const cancelModeSwitch = (): void => {
    const pending = pendingModeRef.current;
    setModeDialogState(null);
    if (!pending) return;
    if (pending.mode === 'external') {
      void window.dsh.confirmModeSwitch('external', undefined, false);
    } else {
      void window.dsh.confirmModeSwitch('builtin', undefined, false);
    }
  };

  const modeDialogTitle = (): string => {
    if (!modeDialogState) return '';
    if (processing) {
      if (modeDialogState.mode === 'external') {
        return modeDialogState.needsStop
          ? '正在停止内置 DSH…'
          : '正在切换为外部模式…';
      }
      return '正在切换为内置模式…';
    }
    return modeDialogState.mode === 'external'
      ? '连接外部 DSH 实例'
      : '切换到内置模式';
  };

  const confirmProfileSwitch = (): void => {
    const name = profileDialogName;
    setProfileDialogName(null);
    if (name) void window.dsh.confirmProfileSwitch(name, true);
  };

  const cancelProfileSwitch = (): void => {
    const name = profileDialogName;
    setProfileDialogName(null);
    if (name) void window.dsh.confirmProfileSwitch(name, false);
  };

  const confirmProfileCreate = (): void => {
    const name = newProfileName.trim();
    setCreateDialogOpen(false);
    if (name) void window.dsh.confirmProfileCreate(name, true);
  };

  const cancelProfileCreate = (): void => {
    setCreateDialogOpen(false);
    void window.dsh.confirmProfileCreate('', false);
  };

  const confirmShellModeSwitch = async (): Promise<void> => {
    const mode = shellModeDialog;
    if (!mode) return;
    setShellModeProcessing(true);
    const result = await window.dsh.confirmShellModeSwitch(mode, true);
    setShellModeProcessing(false);
    setShellModeDialog(null);
    if (result && !result.ok) {
      toast.error(typeof result.error === 'string' ? result.error : '切换失败');
    }
  };

  const cancelShellModeSwitch = (): void => {
    const mode = shellModeDialog;
    setShellModeDialog(null);
    if (mode) void window.dsh.confirmShellModeSwitch(mode, false);
  };

  const confirmProfileChangeRestart = async (): Promise<void> => {
    setProfileChangeProcessing(true);
    const result = await window.dsh.confirmProfileChangedRestart(true);
    setProfileChangeProcessing(false);
    setProfileChange(null);
    if (result && !result.ok) {
      toast.error(typeof result.error === 'string' ? result.error : '重启失败');
    }
  };

  const dismissProfileChange = (): void => {
    setProfileChange(null);
    void window.dsh.confirmProfileChangedRestart(false);
  };

  return (
    <>
      {/* 模式切换 dialog（内置/外部） */}
      <Dialog
        open={modeDialogState !== null}
        onOpenChange={(open) => {
          if (!processing && !open) cancelModeSwitch();
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{modeDialogTitle()}</DialogTitle>
          </DialogHeader>
          {!modeDialogState ? null : processing ? (
            <p className="text-sm text-muted-foreground">
              {modeDialogState.mode === 'external'
                ? modeDialogState.needsStop
                  ? '正在停止内置 DSH，请稍候…'
                  : '正在切换为外部模式，请稍候…'
                : '正在切换为内置模式，请稍候…'}
            </p>
          ) : modeDialogState.mode === 'external' ? (
            <>
              <p className="text-sm text-muted-foreground">
                请输入外部 DSH 实例的端口号（默认 {DEFAULT_PORT}）：
              </p>
              <Input
                value={portValue}
                onChange={(e) => setPortValue(e.target.value)}
                placeholder={String(DEFAULT_PORT)}
                inputMode="numeric"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void confirmModeSwitch();
                }}
              />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              确定要切换到内置模式吗？将由 zhima 主进程内置启动 DSH。
            </p>
          )}
          <DialogFooter>
            {!processing && modeDialogState && (
              <>
                <Button variant="ghost" onClick={cancelModeSwitch}>
                  取消
                </Button>
                {modeDialogState.mode === 'external' && (
                  <Button
                    variant="outline"
                    onClick={() => setPortValue(String(DEFAULT_PORT))}
                  >
                    使用默认端口 {DEFAULT_PORT}
                  </Button>
                )}
                <Button onClick={() => void confirmModeSwitch()}>确定</Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* profile 切换确认 dialog（仅已 boot 时出现） */}
      <Dialog
        open={profileDialogName !== null}
        onOpenChange={(open) => {
          if (!open) cancelProfileSwitch();
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>切换配置文件</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            确定要切换到配置文件 &ldquo;{profileDialogName}&rdquo;
            吗？切换会重启 DSH 会话，当前打开的 DSH 窗口会被替换。
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={cancelProfileSwitch}>
              取消
            </Button>
            <Button onClick={confirmProfileSwitch}>确定</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 窗口模式切换确认 dialog（兼容/增强，会重启 DSH 会话并重建窗口） */}
      <Dialog
        open={shellModeDialog !== null}
        onOpenChange={(open) => {
          if (!shellModeProcessing && !open) cancelShellModeSwitch();
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>切换窗口模式</DialogTitle>
          </DialogHeader>
          {shellModeProcessing ? (
            <p className="text-sm text-muted-foreground">
              正在切换窗口模式，请稍候…
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              确定要切换到
              {shellModeDialog === 'advanced' ? '增强模式' : '兼容模式'}吗？
              切换会重启 DSH 会话并重建窗口（增强模式使用无边框原生材质 +
              三栏布局）。
            </p>
          )}
          <DialogFooter>
            {!shellModeProcessing && (
              <>
                <Button variant="ghost" onClick={cancelShellModeSwitch}>
                  取消
                </Button>
                <Button onClick={() => void confirmShellModeSwitch()}>
                  确定
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 新建配置文件 dialog */}
      <Dialog
        open={createDialogOpen}
        onOpenChange={(open) => {
          if (!open) cancelProfileCreate();
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>创建并启动配置</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            创建一个可用于桌面界面的配置，并在下一次启动时使用。
          </p>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">配置名称</label>
            <Input
              value={newProfileName}
              onChange={(e) => setNewProfileName(e.target.value)}
              placeholder="例如：work"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmProfileCreate();
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={cancelProfileCreate}>
              取消
            </Button>
            <Button onClick={confirmProfileCreate}>+ 创建并启动</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 插件变化检测 dialog（需重启生效，git diff 风格 +/-） */}
      <Dialog
        open={profileChange !== null}
        onOpenChange={(open) => {
          if (!open && !profileChangeProcessing) dismissProfileChange();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>检测到插件变化</DialogTitle>
          </DialogHeader>
          {profileChangeProcessing ? (
            <p className="text-sm text-muted-foreground">
              正在重启 DSH 会话并重新加载插件，请稍候…
            </p>
          ) : profileChange ? (
            <>
              <p className="text-sm text-muted-foreground">
                profile &ldquo;{profileChange.profileName}&rdquo;
                的插件发生了变化，需要重启 DSH 会话才能生效。
              </p>
              <pre className="max-h-48 overflow-auto rounded border bg-muted p-3 text-xs leading-relaxed">
                {profileChange.added.map((item) => (
                  <div key={`+${item}`} className="text-green-600">
                    + {item}
                  </div>
                ))}
                {profileChange.removed.map((item) => (
                  <div key={`-${item}`} className="text-red-600">
                    - {item}
                  </div>
                ))}
                {profileChange.added.length === 0 &&
                  profileChange.removed.length === 0 && (
                    <div className="text-muted-foreground">（无差异）</div>
                  )}
              </pre>
              <p className="text-xs text-muted-foreground">
                如果现在不重启，也可以在托盘菜单里点击「重新加载插件」稍后生效。
              </p>
            </>
          ) : null}
          <DialogFooter>
            {!profileChangeProcessing && (
              <>
                <Button variant="ghost" onClick={dismissProfileChange}>
                  稍后（托盘重启）
                </Button>
                <Button onClick={() => void confirmProfileChangeRestart()}>
                  立即重启
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
