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

interface PendingModeSwitch {
  mode: DshRunMode;
  needsStop: boolean;
}

interface ModeDialogState {
  mode: DshRunMode;
  needsStop: boolean;
}

const DEFAULT_PORT = 3080;

export function DshTrayController() {
  const [modeDialogState, setModeDialogState] =
    useState<ModeDialogState | null>(null);
  const [profileDialogName, setProfileDialogName] = useState<string | null>(
    null,
  );
  const [portValue, setPortValue] = useState(String(DEFAULT_PORT));
  const [processing, setProcessing] = useState(false);
  const pendingModeRef = useRef<PendingModeSwitch | null>(null);

  useEffect(() => {
    // profile 切换：未 boot 直接切换，已 boot 弹确认 dialog。
    const offProfile = window.dsh.onProfileSwitchRequest(
      ({ name, isBooted }) => {
        if (!isBooted) {
          // 未 boot，无代价直接切换
          void window.dsh.confirmProfileSwitch(name, true);
          toast.success(`已切换到配置文件 ${name}（下次打开生效）`);
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

    return () => {
      offProfile();
      offMode();
      offToast();
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
    </>
  );
}
