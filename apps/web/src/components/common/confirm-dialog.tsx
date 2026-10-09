'use client';

import { create } from 'zustand';
import { AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

type ConfirmOptions = {
  title: string;
  description?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
};

type ConfirmState = ConfirmOptions & {
  open: boolean;
  resolve?: (value: boolean) => void;
};

const useConfirmStore = create<ConfirmState>(() => ({ open: false, title: '' }));

/**
 * Reemplazo de window.confirm() con un diálogo accesible y coherente con el diseño:
 *   if (await confirm({ title: '¿Eliminar producto?', destructive: true })) { ... }
 */
export function confirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    useConfirmStore.getState().resolve?.(false);
    useConfirmStore.setState({
      description: undefined,
      confirmText: undefined,
      cancelText: undefined,
      destructive: false,
      ...options,
      open: true,
      resolve,
    });
  });
}

export function ConfirmDialogHost() {
  const state = useConfirmStore();

  const close = (value: boolean) => {
    state.resolve?.(value);
    useConfirmStore.setState({ open: false, resolve: undefined });
  };

  return (
    <Dialog open={state.open} onOpenChange={(open) => !open && close(false)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-start gap-3">
            {state.destructive && (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <AlertTriangle className="h-5 w-5" />
              </div>
            )}
            <div className="space-y-1.5 text-left">
              <DialogTitle>{state.title}</DialogTitle>
              {state.description && <DialogDescription>{state.description}</DialogDescription>}
            </div>
          </div>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => close(false)}>
            {state.cancelText ?? 'Cancelar'}
          </Button>
          <Button variant={state.destructive ? 'destructive' : 'default'} onClick={() => close(true)} autoFocus>
            {state.confirmText ?? 'Confirmar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
