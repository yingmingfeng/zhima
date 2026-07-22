import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { MessageCircle, Folder } from 'lucide-react';

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@renderer/components/ui/command';
import { useSession } from '@renderer/hooks/useSession';
import { Operator } from '@main/store/types';

interface SearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SearchDialog({ open, onOpenChange }: SearchDialogProps) {
  const { sessions, getSession } = useSession();
  const navigate = useNavigate();

  // session.id -> session.name 映射，供自定义过滤使用
  const sessionNameMap = useMemo(() => {
    const map = new Map<string, string>();
    sessions.forEach((s) => map.set(s.id, s.name));
    return map;
  }, [sessions]);

  // 自定义过滤：仅按 session.name 匹配，value(id)不参与搜索
  const filterFn = (value: string, search: string) => {
    const name = sessionNameMap.get(value) ?? '';
    return name.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
  };

  const handleSessionSelect = async (sessionId: string) => {
    const session = await getSession(sessionId);
    if (!session) return;

    const operator = session.meta.operator || Operator.LocalComputer;
    const isFree = session.meta.isFree ?? true;

    const getRouter = () => {
      if (
        operator === Operator.RemoteBrowser ||
        operator === Operator.RemoteComputer
      ) {
        if (isFree) {
          return '/free-remote';
        }
        return '/paid-remote';
      }
      return '/local';
    };

    navigate(getRouter(), {
      state: {
        operator,
        sessionId,
        isFree,
        from: 'history',
      },
    });

    onOpenChange(false);
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      commandProps={{ filter: filterFn }}
    >
      <CommandInput placeholder="搜索任务名称及内容" />
      <CommandList>
        <CommandEmpty>未找到相关任务</CommandEmpty>
        <CommandGroup>
          {sessions.map((session) => (
            <CommandItem
              key={session.id}
              value={session.id}
              onSelect={() => handleSessionSelect(session.id)}
              className="justify-between"
            >
              <div className="flex items-center gap-2 min-w-0">
                <MessageCircle className="h-4 w-4 shrink-0 text-text-tertiary" />
                <span className="truncate">{session.name}</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Folder className="h-4 w-4 text-text-quaternary" />
                <span className="text-[11px] text-text-tertiary">Default</span>
              </div>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
