import { useCallback, useEffect, useRef, useState } from 'react';

export interface ToastItem {
  id: number;
  message: string;
  type: 'success' | 'error';
}

interface ToastProps {
  toast: ToastItem;
  onDismiss: (id: number) => void;
}

function Toast({ toast, onDismiss }: ToastProps) {
  const [hovering, setHovering] = useState(false);
  const dismiss = useCallback(() => onDismiss(toast.id), [onDismiss, toast.id]);

  useEffect(() => {
    if (hovering) return;
    const timer = setTimeout(dismiss, 3000);
    return () => clearTimeout(timer);
  }, [hovering, dismiss]);

  return (
    <div
      className={`gfe-toast gfe-toast--${toast.type}`}
      role="alert"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <span className="gfe-toast__icon" aria-hidden="true">
        {toast.type === 'success' ? '✓' : '✕'}
      </span>
      <span className="gfe-toast__msg">{toast.message}</span>
      <button
        type="button"
        className="gfe-toast__close"
        aria-label="Dismiss"
        onClick={dismiss}
      >
        ×
      </button>
    </div>
  );
}

interface ToastContainerProps {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null;
  return (
    <div className="gfe-toast-container" aria-live="polite">
      {toasts.map((t) => (
        <Toast key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

// ── Hook ──────────────────────────────────────────────────────
let nextId = 1;

export function useToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counterRef = useRef(nextId);

  const addToast = useCallback((type: ToastItem['type'], message: string) => {
    const id = counterRef.current++;
    setToasts((prev) => [...prev.slice(-2), { id, type, message }]);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, addToast, dismissToast };
}
