/**
 * 托盘触发的 DSH 交互控制器（挂载于主窗口全局）：
 * - 切换运行模式（内置/外部）：统一用模态框 dialog（确认 + 处理中状态）。
 *   切外部时内置 CLI 保留后台（方案 B），不提示「停止内置」。
 * - 插件变化检测：弹 diff dialog 引导重启
 * - 结果反馈：主进程广播的进度/成功/失败 toast（loading 会被后续消息 dismiss）
 *
 * zhima 固定使用 zhima-desktop profile + 增强模式，无 profile/窗口模式切换。
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

interface PendingModeSwitch {
  mode: DshRunMode;
}

interface ModeDialogState {
  mode: DshRunMode;
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
  const [portValue, setPortValue] = useState(String(DEFAULT_PORT));
  const [processing, setProcessing] = useState(false);
  const [profileChange, setProfileChange] =
    useState<ProfileChangeDialog | null>(null);
  const [profileChangeProcessing, setProfileChangeProcessing] = useState(false);
  const pendingModeRef = useRef<PendingModeSwitch | null>(null);

  useEffect(() => {
    const offMode = window.dsh.onModeSwitchRequest(({ mode, port }) => {
      pendingModeRef.current = { mode };
      setPortValue(String(port ?? DEFAULT_PORT));
      setProcessing(false);
      setModeDialogState({ mode });
    });

    // loading toast 需主动 dismiss，否则"正在切换为外部模式…"会一直转。
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
      offMode();
      offToast();
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
      return modeDialogState.mode === 'external'
        ? '正在切换为外部模式…'
        : '正在切换为内置模式…';
    }
    return modeDialogState.mode === 'external'
      ? '连接外部 DSH 实例'
      : '切换到内置模式';
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
                ? '正在切换为外部模式，请稍候…'
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
              确定要切换到内置模式吗？将由 zhima 内置启动 DSH。
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