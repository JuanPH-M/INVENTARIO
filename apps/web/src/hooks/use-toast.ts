import * as React from 'react';
import type { ToastProps } from '@/components/ui/toast';

const TOAST_LIMIT = 5;
const TOAST_REMOVE_DELAY = 5000;

type ToasterToast = ToastProps & {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactElement;
};

let count = 0;
function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER;
  return count.toString();
}

type State = { toasts: ToasterToast[] };

const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
const listeners: Array<(state: State) => void> = [];
let memoryState: State = { toasts: [] };

function dispatch(action: { type: 'ADD_TOAST' | 'REMOVE_TOAST' | 'UPDATE_TOAST' | 'DISMISS_TOAST'; toast?: Partial<ToasterToast>; toastId?: string }) {
  if (action.type === 'ADD_TOAST') {
    memoryState = { toasts: [action.toast as ToasterToast, ...memoryState.toasts].slice(0, TOAST_LIMIT) };
  } else if (action.type === 'UPDATE_TOAST') {
    memoryState = { toasts: memoryState.toasts.map((t) => (t.id === action.toast?.id ? { ...t, ...action.toast } : t)) };
  } else if (action.type === 'DISMISS_TOAST') {
    const { toastId } = action;
    if (toastId) {
      if (!toastTimeouts.has(toastId)) {
        toastTimeouts.set(toastId, setTimeout(() => { toastTimeouts.delete(toastId); dispatch({ type: 'REMOVE_TOAST', toastId }); }, TOAST_REMOVE_DELAY));
      }
      memoryState = { toasts: memoryState.toasts.map((t) => (t.id === toastId || toastId === undefined ? { ...t, open: false } : t)) };
    }
  } else if (action.type === 'REMOVE_TOAST') {
    memoryState = { toasts: action.toastId === undefined ? [] : memoryState.toasts.filter((t) => t.id !== action.toastId) };
  }
  listeners.forEach((l) => l(memoryState));
}

function toast(props: Omit<ToasterToast, 'id'>) {
  const id = genId();
  const dismiss = () => dispatch({ type: 'DISMISS_TOAST', toastId: id });
  dispatch({ type: 'ADD_TOAST', toast: { ...props, id, open: true, onOpenChange: (open) => { if (!open) dismiss(); } } });
  return { id, dismiss, update: (p: ToasterToast) => dispatch({ type: 'UPDATE_TOAST', toast: { ...p, id } }) };
}

function useToast() {
  const [state, setState] = React.useState<State>(memoryState);
  React.useEffect(() => {
    listeners.push(setState);
    return () => { const i = listeners.indexOf(setState); if (i > -1) listeners.splice(i, 1); };
  }, []);
  return { ...state, toast, dismiss: (id?: string) => dispatch({ type: 'DISMISS_TOAST', toastId: id }) };
}

export { useToast, toast };
