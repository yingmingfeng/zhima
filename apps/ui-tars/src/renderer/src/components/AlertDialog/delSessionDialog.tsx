/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@renderer/components/ui/alert-dialog';

interface DeleteSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void | Promise<void>;
}

export function DeleteSessionDialog({
  open,
  onOpenChange,
  onConfirm,
}: DeleteSessionDialogProps) {
  const [deleting, setDeleting] = useState(false);

  const handleConfirm = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (deleting) return;
    setDeleting(true);
    try {
      await onConfirm();
    } finally {
      setDeleting(false);
      onOpenChange(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>删除会话</AlertDialogTitle>
          <AlertDialogDescription>
            确定要删除此会话吗？此操作无法撤销。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction
            className="bg-red-500 hover:bg-red-600"
            onClick={handleConfirm}
            disabled={deleting}
          >
            {deleting ? '删除中...' : '删除'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
