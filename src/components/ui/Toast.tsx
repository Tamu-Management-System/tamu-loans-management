import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import styles from "./Toast.module.css";

interface ToastOptions {
  message: string;
  /** e.g. { label: "Undo", onClick: … } */
  action?: { label: string; onClick: () => void };
}

const ToastContext = createContext<(options: ToastOptions) => void>(() => {});

const DURATION_MS = 2600;
const DURATION_WITH_ACTION_MS = 6000;

/** Short confirmation at the bottom of the screen, optionally with an Undo button. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastOptions | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const showToast = useCallback((options: ToastOptions) => {
    window.clearTimeout(timer.current);
    setToast(options);
    timer.current = window.setTimeout(() => setToast(null), options.action ? DURATION_WITH_ACTION_MS : DURATION_MS);
  }, []);

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <div className={`${styles.toast} ${toast ? styles.visible : ""}`} role="status" aria-live="polite">
        {toast && (
          <>
            <span>{toast.message}</span>
            {toast.action && (
              <button
                type="button"
                onClick={() => {
                  toast.action!.onClick();
                  setToast(null);
                }}
              >
                {toast.action.label}
              </button>
            )}
          </>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
