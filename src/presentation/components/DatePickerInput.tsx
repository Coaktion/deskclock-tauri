import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { DayPicker } from "react-day-picker";
import { ptBR } from "react-day-picker/locale";
import "react-day-picker/style.css";

interface DatePickerInputProps {
  value: string; // ISO date YYYY-MM-DD ou ""
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

function isoToDate(iso: string): Date | undefined {
  if (!iso) return undefined;
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function dateToIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDisplay(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

const CALENDAR_HEIGHT = 320;

export function DatePickerInput({
  value,
  onChange,
  placeholder = "DD/MM/AAAA",
  className = "",
}: DatePickerInputProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const inputRef = useRef<HTMLInputElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (
        inputRef.current && !inputRef.current.contains(target) &&
        calendarRef.current && !calendarRef.current.contains(target)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    if (!open) return;
    function close() { setOpen(false); }
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  function handleOpen() {
    if (!inputRef.current) return;
    const rect = inputRef.current.getBoundingClientRect();
    const topBelow = rect.bottom + 4;
    const topAbove = rect.top - CALENDAR_HEIGHT - 4;
    const fitsBelow = topBelow + CALENDAR_HEIGHT <= window.innerHeight - 8;
    const preferred = fitsBelow ? topBelow : topAbove;
    // garante que não sai do viewport nem pelo topo nem pelo fundo
    const top = Math.max(8, Math.min(preferred, window.innerHeight - CALENDAR_HEIGHT - 8));
    setPos({
      top,
      left: Math.min(rect.left, window.innerWidth - 280),
    });
    setOpen((o) => !o);
  }

  function handleSelect(date: Date | undefined) {
    if (date) {
      onChange(dateToIso(date));
      setOpen(false);
    }
  }

  return (
    <div className={className}>
      <input
        ref={inputRef}
        type="text"
        readOnly
        value={formatDisplay(value)}
        placeholder={placeholder}
        onClick={handleOpen}
        className="w-full px-2.5 py-1.5 text-sm bg-gray-800 border border-gray-700 rounded text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 cursor-pointer"
      />
      {open && createPortal(
        <div
          ref={calendarRef}
          data-datepicker-portal
          style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999 }}
          className="bg-gray-900 border border-gray-700 rounded-lg shadow-xl p-2"
        >
          <DayPicker
            mode="single"
            selected={isoToDate(value)}
            onSelect={handleSelect}
            locale={ptBR}
            defaultMonth={isoToDate(value) ?? new Date()}
            classNames={{
              root: "text-sm",
              month_caption: "text-gray-200 font-medium text-sm mb-1",
              nav: "flex items-center gap-1",
              button_previous: "p-1 text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded",
              button_next: "p-1 text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded",
              weeks: "mt-1",
              weekdays: "flex",
              weekday: "w-8 h-7 flex items-center justify-center text-xs text-gray-500 font-normal",
              week: "flex",
              day: "w-8 h-8 flex items-center justify-center",
              day_button: "w-8 h-8 flex items-center justify-center text-xs text-gray-300 hover:bg-gray-700 rounded transition-colors",
              selected: "bg-blue-600 rounded text-white",
              today: "text-blue-400 font-semibold",
              outside: "opacity-30",
              disabled: "opacity-20 cursor-not-allowed",
            }}
          />
        </div>,
        document.body
      )}
    </div>
  );
}
