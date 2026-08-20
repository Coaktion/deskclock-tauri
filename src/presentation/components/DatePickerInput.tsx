import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { DayPicker } from "react-day-picker";
import { ptBR } from "react-day-picker/locale";
import "react-day-picker/style.css";
import { Field, Input } from "@presentation/components/ui";

interface DatePickerInputProps {
  value: string; // ISO date YYYY-MM-DD ou ""
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  maxDate?: Date;
  /** Marca o campo como inválido — quem valida é o formulário, não o picker. */
  invalid?: boolean;
  /**
   * Rótulo encaixado na borda (`fieldStyles`). Com ele o campo passa a ler como
   * os de hora e duração; sem ele, mantém a casca própria de antes.
   */
  label?: string;
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
  maxDate,
  invalid = false,
  label,
}: DatePickerInputProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const inputRef = useRef<HTMLInputElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (
        inputRef.current &&
        !inputRef.current.contains(target) &&
        calendarRef.current &&
        !calendarRef.current.contains(target)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    if (!open) return;
    function close() {
      setOpen(false);
    }
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

  /**
   * Mesma regra do dropdown do `Autocomplete`: calendário aberto, o Enter é
   * daqui — fecha e marca a tecla como consumida, para o formulário em volta
   * não submeter junto. Fechado, deixa subir para o `useSubmitOnEnter`.
   *
   * O campo é `readOnly` e só abria no clique; ↓ e Espaço existem para quem
   * chegou até ele pelo teclado ter como abri-lo sem submeter o formulário.
   */
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      if (!open) return;
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown" || e.key === " ") {
      e.preventDefault();
      if (!open) handleOpen();
    }
  }

  function handleSelect(date: Date | undefined) {
    if (date) {
      onChange(dateToIso(date));
      setOpen(false);
    }
  }

  const field = label ? (
    <Field label={label} className={className} boxClassName={invalid ? "border-danger!" : ""}>
      <Input
        ref={inputRef}
        variant="bare"
        readOnly
        value={formatDisplay(value)}
        placeholder={placeholder}
        onClick={handleOpen}
        onKeyDown={handleKeyDown}
        className="cursor-pointer"
      />
    </Field>
  ) : (
    <div className={className}>
      <Input
        ref={inputRef}
        readOnly
        invalid={invalid}
        value={formatDisplay(value)}
        placeholder={placeholder}
        onClick={handleOpen}
        onKeyDown={handleKeyDown}
        className="cursor-pointer"
      />
    </div>
  );

  return (
    <>
      {field}
      {open &&
        createPortal(
          <div
            ref={calendarRef}
            data-datepicker-portal
            style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999 }}
            className="bg-surface border border-border rounded-card shadow-xl p-2"
          >
            <DayPicker
              mode="single"
              selected={isoToDate(value)}
              onSelect={handleSelect}
              locale={ptBR}
              defaultMonth={isoToDate(value) ?? new Date()}
              disabled={maxDate ? { after: maxDate } : undefined}
              endMonth={maxDate}
              classNames={{
                root: "text-sm",
                month_caption: "text-fg-secondary font-medium text-sm mb-1",
                nav: "flex items-center gap-1",
                button_previous: "p-1 text-fg-muted hover:text-fg hover:bg-raised rounded-control",
                button_next: "p-1 text-fg-muted hover:text-fg hover:bg-raised rounded-control",
                weeks: "mt-1",
                weekdays: "flex",
                weekday:
                  "w-8 h-7 flex items-center justify-center text-sm text-fg-muted font-normal",
                week: "flex",
                day: "w-8 h-8 flex items-center justify-center",
                day_button:
                  "w-8 h-8 flex items-center justify-center text-sm font-mono tabular-nums text-fg-secondary hover:bg-raised rounded-control transition-colors",
                selected: "bg-accent rounded-control text-white",
                today: "text-accent-text font-semibold",
                outside: "opacity-30",
                disabled: "opacity-20 cursor-not-allowed",
              }}
            />
          </div>,
          document.body
        )}
    </>
  );
}
