import { useEffect, useRef, useState } from "react";
import { getCurrentWindow, primaryMonitor } from "@tauri-apps/api/window";
import { PhysicalPosition } from "@tauri-apps/api/dpi";
import { listen } from "@tauri-apps/api/event";
import { CheckCircle2, XCircle, Info, X } from "lucide-react";
import { OVERLAY_EVENTS, type ToastMessagePayload, type ToastVariant } from "@shared/types/overlayEvents";

const TOAST_WIDTH = 320;
const TOAST_HEIGHT = 72;

const appWindow = getCurrentWindow();

interface ToastState {
  variant: ToastVariant;
  message: string;
  visible: boolean;
}

const VARIANT_STYLES: Record<ToastVariant, { border: string; icon: React.ReactNode; text: string }> = {
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
};

export function ToastApp() {
  const [toast, setToast] = useState<ToastState>({
    variant: "info",
    message: "",
    visible: false,
  });
  const [animating, setAnimating] = useState(false);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Posiciona no canto inferior direito do monitor primário ao montar
  useEffect(() => {
    primaryMonitor().then((monitor) => {
      if (!monitor) return;
      const x = monitor.position.x + monitor.size.width - TOAST_WIDTH - 20;
      const y = monitor.position.y + monitor.size.height - TOAST_HEIGHT - 52;
      appWindow.setPosition(new PhysicalPosition(x, y)).catch(() => {});
    });
  }, []);

  // Escuta eventos de toast
  useEffect(() => {
    const unlisten = listen<ToastMessagePayload>(
      OVERLAY_EVENTS.TOAST_MESSAGE,
      ({ payload }) => {
        if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);

        setToast({ variant: payload.variant, message: payload.message, visible: true });
        setAnimating(true);

        const duration = payload.duration ?? 3500;
        dismissTimerRef.current = setTimeout(() => {
          setAnimating(false);
          setTimeout(() => {
            setToast((t) => ({ ...t, visible: false }));
            appWindow.hide().catch(() => {});
          }, 300); // aguarda fade-out
        }, duration);
      },
    );
    return () => {
      unlisten.then((fn) => fn());
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleDismiss() {
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    setAnimating(false);
    setTimeout(() => {
      setToast((t) => ({ ...t, visible: false }));
      appWindow.hide().catch(() => {});
    }, 300);
  }

  if (!toast.visible) return null;

  const styles = VARIANT_STYLES[toast.variant];

  return (
    <div
      className={`
        w-full h-full flex items-center gap-3 px-4
        bg-gray-900 border border-gray-700 border-l-4 rounded-xl shadow-2xl
        transition-all duration-300 ease-out
        ${styles.border}
        ${animating ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}
      `}
    >
      {styles.icon}
      <p className={`flex-1 text-sm leading-tight ${styles.text}`}>{toast.message}</p>
      <button
        onClick={handleDismiss}
        className="text-gray-500 hover:text-gray-300 shrink-0 transition-colors"
      >
        <X size={14} />
      </button>
    </div>
  );
}
