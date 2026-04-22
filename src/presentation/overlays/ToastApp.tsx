import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { emit, listen } from "@tauri-apps/api/event";
import { positionNearTaskbar, readPositionConfig, type WindowPositionOverride } from "@shared/utils/windowPosition";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { CheckCircle2, XCircle, Info, ArrowDownToLine, X } from "lucide-react";
import {
  OVERLAY_EVENTS,
  type ToastMessagePayload,
  type ToastVariant,
} from "@shared/types/overlayEvents";

const TOAST_WIDTH = 320;
const TOAST_HEIGHT = 88;

const appWindow = getCurrentWindow();

interface ToastState {
  variant: ToastVariant;
  message: string;
  visible: boolean;
  actionLabel?: string;
  actionEvent?: string;
}

const VARIANT_STYLES: Record<
  ToastVariant,
  { border: string; icon: React.ReactNode; text: string }
> = {
  success: {
    border: "border-green-500",
    icon: <CheckCircle2 size={18} className="text-green-400 shrink-0" />,
    text: "text-green-100",
  },
  error: {
    border: "border-red-500",
    icon: <XCircle size={18} className="text-red-400 shrink-0" />,
    text: "text-red-100",
  },
  info: {
    border: "border-blue-500",
    icon: <Info size={18} className="text-blue-400 shrink-0" />,
    text: "text-blue-100",
  },
  update: {
    border: "border-violet-500",
    icon: <ArrowDownToLine size={18} className="text-violet-400 shrink-0" />,
    text: "text-violet-100",
  },
};

export function ToastApp() {
  const [toast, setToast] = useState<ToastState>({
    variant: "info",
    message: "",
    visible: false,
    actionLabel: undefined,
    actionEvent: undefined,
  });
  const [animating, setAnimating] = useState(false);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const posOverrideRef = useRef<WindowPositionOverride | null>(null);

  // Lê config de posicionamento uma única vez — sem SQLite a cada toast
  useEffect(() => {
    readPositionConfig().then((cfg) => { posOverrideRef.current = cfg; }).catch(() => {});
  }, []);

  // Escuta eventos de toast
  useEffect(() => {
    const unlisten = listen<ToastMessagePayload>(OVERLAY_EVENTS.TOAST_MESSAGE, ({ payload }) => {
      positionNearTaskbar(appWindow, { width: TOAST_WIDTH, height: TOAST_HEIGHT }, posOverrideRef.current ?? undefined).catch(() => {});
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);

      setToast({
        variant: payload.variant,
        message: payload.message,
        visible: true,
        actionLabel: payload.actionLabel,
        actionEvent: payload.actionEvent,
      });
      setAnimating(true);

      const duration = payload.duration ?? 3500;
      dismissTimerRef.current = setTimeout(() => {
        setAnimating(false);
        setTimeout(() => {
          setToast((t) => ({ ...t, visible: false }));
          appWindow.hide().catch(() => {});
        }, 300); // aguarda fade-out
      }, duration);
    });
    return () => {
      unlisten.then((fn) => fn());
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  }, []);

  function handleDismiss() {
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    setAnimating(false);
    setTimeout(() => {
      setToast((t) => ({ ...t, visible: false }));
      appWindow.hide().catch(() => {});
    }, 300);
  }

  async function handleAction(actionEvent: string) {
    handleDismiss();
    const mainWin = await WebviewWindow.getByLabel("main");
    if (mainWin) {
      await mainWin.show();
      await mainWin.setFocus();
    }
    await emit(actionEvent, null);
  }

  if (!toast.visible) return null;

  const styles = VARIANT_STYLES[toast.variant];

  return (
    <div
      className={`
        w-screen h-screen flex items-center gap-3 px-4
        bg-gray-900 border border-gray-700 border-l-4 rounded-xl shadow-2xl
        transition-all duration-300 ease-out
        ${styles.border}
        ${animating ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}
      `}
    >
      {styles.icon}
      <p className={`flex-1 text-sm leading-tight ${styles.text}`}>{toast.message}</p>
      {toast.actionLabel && toast.actionEvent && (
        <button
          onClick={() => handleAction(toast.actionEvent!)}
          className="text-xs font-medium text-violet-300 hover:text-violet-100 shrink-0 transition-colors px-2 py-1 rounded-lg border border-violet-700 hover:border-violet-500"
        >
          {toast.actionLabel}
        </button>
      )}
      <button
        onClick={handleDismiss}
        className="text-gray-500 hover:text-gray-300 shrink-0 transition-colors"
      >
        <X size={14} />
      </button>
    </div>
  );
}
