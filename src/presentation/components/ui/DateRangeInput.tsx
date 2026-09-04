import { CalendarDays } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatBrDate } from "@shared/utils/calendarGrid";
import {
  DATE_RANGE_LABELS,
  dateRangeFor,
  matchDateRange,
  type DateRangeId,
} from "@shared/utils/datePresets";
import { Calendar } from "./Calendar";
import { Field } from "./Field";
import { Input } from "./Input";

/**
 * Campo de **período**: uma caixa para as duas pontas, com o trilho de atalhos
 * ao lado do calendário.
 *
 * Era dois `DatePickerInput` e uma seta no meio, e em quatro telas — Exportação,
 * Agenda, Histórico e os apontamentos. Duas delas resolviam à mão o que o par
 * tem de resolver junto: o clamp mútuo (`if (d > toDate) setToDate(d)`) estava
 * escrito nos `onChange` do `ImportCalendarModal`, e quem escrevesse o terceiro
 * par teria de lembrar dele de novo.
 *
 * **O trilho não entra em toda tela.** No Histórico e nos apontamentos os
 * atalhos já existem como `FilterPill` fora do campo, e `custom` é justamente o
 * "eu escolho as datas" — o trilho ali seria a segunda grafia da mesma tabela.
 * Por isso a lista de atalhos é prop, e não um padrão embutido.
 */
interface DateRangeInputProps {
  /** ISO `AAAA-MM-DD`, ou `""`. */
  startDate: string;
  /** ISO `AAAA-MM-DD`, ou `""`. */
  endDate: string;
  /** As duas pontas mudam juntas — é o que absorve o clamp do call site. */
  onChange: (start: string, end: string) => void;
  /**
   * Quais atalhos o trilho mostra, na ordem. A lista é da tela porque o que faz
   * sentido nela depende do que a tela olha: a Exportação olha para trás, a
   * Agenda tem a semana que vem à frente.
   */
  presets?: DateRangeId[];
  label?: string;
  className?: string;
  placeholder?: string;
}

/** Passado, que é o recorte de quem exporta horas já trabalhadas. */
const PRESETS_PADRAO: DateRangeId[] = [
  "today",
  "yesterday",
  "thisWeek",
  "lastWeek",
  "thisMonth",
  "lastMonth",
  "last30",
];

const PANEL_HEIGHT = 340;
const PANEL_WIDTH = 400;

export function DateRangeInput({
  startDate,
  endDate,
  onChange,
  presets = PRESETS_PADRAO,
  label,
  className = "",
  placeholder = "Escolher período",
}: DateRangeInputProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  /**
   * A ponta que o próximo clique preenche. Aberto o painel com um período
   * completo, o primeiro clique **recomeça** — é o que dispensa um botão
   * "limpar" para reescolher, e é como todo seletor de período se comporta.
   */
  const [aguardandoFim, setAguardandoFim] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const painelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handleClickFora(e: MouseEvent) {
      const alvo = e.target as Node;
      if (inputRef.current?.contains(alvo) || painelRef.current?.contains(alvo)) return;
      setOpen(false);
    }
    // O painel é `fixed`: rolar a página o deixaria para trás do campo.
    function fechar() {
      setOpen(false);
    }

    document.addEventListener("mousedown", handleClickFora);
    window.addEventListener("scroll", fechar, true);
    window.addEventListener("resize", fechar);
    return () => {
      document.removeEventListener("mousedown", handleClickFora);
      window.removeEventListener("scroll", fechar, true);
      window.removeEventListener("resize", fechar);
    };
  }, [open]);

  function abrir() {
    const campo = inputRef.current;
    if (!campo) return;
    const rect = campo.getBoundingClientRect();
    const abaixo = rect.bottom + 4;
    const cabeAbaixo = abaixo + PANEL_HEIGHT <= window.innerHeight - 8;
    const preferido = cabeAbaixo ? abaixo : rect.top - PANEL_HEIGHT - 4;
    setPos({
      top: Math.max(8, Math.min(preferido, window.innerHeight - PANEL_HEIGHT - 8)),
      left: Math.max(8, Math.min(rect.left, window.innerWidth - PANEL_WIDTH - 8)),
    });
    setAguardandoFim(false);
    setOpen(true);
  }

  function fechar() {
    setOpen(false);
    setAguardandoFim(false);
  }

  /**
   * O clique no dia: o primeiro ancora, o segundo fecha o período.
   *
   * **A ordem em que se clica não importa** — clicar o fim antes do início troca
   * as pontas em vez de recusar. É o clamp que os call sites faziam à mão, agora
   * numa regra só.
   */
  function escolherDia(iso: string) {
    if (!aguardandoFim) {
      onChange(iso, "");
      setAguardandoFim(true);
      return;
    }
    const [inicio, fim] = iso < startDate ? [iso, startDate] : [startDate, iso];
    onChange(inicio, fim);
    setAguardandoFim(false);
    setOpen(false);
    inputRef.current?.focus();
  }

  function aplicarAtalho(id: DateRangeId) {
    const { start, end } = dateRangeFor(id);
    onChange(start, end);
    setAguardandoFim(false);
    setOpen(false);
    inputRef.current?.focus();
  }

  /** Ver `DatePickerInput`: o mesmo contrato de ESC e Enter (§7). */
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      if (!open) return;
      e.preventDefault();
      fechar();
      return;
    }
    if (e.key === "Escape" && open) {
      e.preventDefault();
      e.stopPropagation();
      fechar();
      return;
    }
    if (e.key === "ArrowDown" || e.key === " ") {
      e.preventDefault();
      if (!open) abrir();
    }
  }

  /**
   * O papel de cada célula no intervalo.
   *
   * O `!` no texto da ponta de fim não é enfeite: a classe base do `Calendar` já
   * escreveu `text-fg-secondary` para ela, e entre duas cores de texto quem
   * ganha é a ordem em que o Tailwind **emite** os utilitários, não a ordem em
   * que eles aparecem no `className`. É a mesma armadilha da sombra de sobreposição.
   * A ponta de início não precisa: para ela o `Calendar` já pinta o acento,
   * porque é ela que vai em `value`.
   */
  function classeDaCelula(iso: string): string {
    if (!startDate || !endDate) return "";
    if (iso === endDate) return "bg-accent text-white!";
    if (iso > startDate && iso < endDate) return "bg-accent/15";
    return "";
  }

  const texto = startDate
    ? `${formatBrDate(startDate)} → ${endDate ? formatBrDate(endDate) : "…"}`
    : "";
  const atalhoAtivo = startDate && endDate ? matchDateRange(startDate, endDate, presets) : null;

  const controle = (
    <Input
      ref={inputRef}
      variant={label ? "bare" : "boxed"}
      readOnly
      value={texto}
      placeholder={placeholder}
      onClick={() => !open && abrir()}
      onKeyDown={handleKeyDown}
      className="cursor-pointer font-mono tabular-nums"
    />
  );

  return (
    <>
      {label ? (
        <Field label={label} className={className} boxClassName="flex items-center pr-2">
          {controle}
          <CalendarDays size={14} className="text-fg-muted shrink-0" aria-hidden="true" />
        </Field>
      ) : (
        <div className={className}>{controle}</div>
      )}

      {open &&
        createPortal(
          <div
            ref={painelRef}
            data-datepicker-portal
            // O ESC também aqui: com o foco numa célula ou no trilho, o
            // `onKeyDown` do campo não é atravessado e a tecla chegaria ao
            // `useGlobalShortcuts`, que esconde a janela do app (§7).
            onKeyDown={(e) => {
              if (e.key !== "Escape") return;
              e.preventDefault();
              e.stopPropagation();
              fechar();
              inputRef.current?.focus();
            }}
            style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999 }}
            className="bg-surface border border-border-subtle rounded-card shadow-(--shadow-overlay) p-2 flex gap-2"
          >
            {presets.length > 0 && (
              <div className="flex flex-col gap-px w-32 pr-2 border-r border-border-subtle">
                <span className="text-overline uppercase text-fg-muted px-2 py-1.5">Períodos</span>
                {presets.map((id) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={atalhoAtivo === id}
                    onClick={() => aplicarAtalho(id)}
                    className={`text-left text-sm font-medium px-2 py-1.5 rounded-control transition-colors ${
                      atalhoAtivo === id
                        ? "bg-accent/15 text-accent-text"
                        : "text-fg-secondary hover:bg-raised hover:text-fg"
                    }`}
                  >
                    {DATE_RANGE_LABELS[id]}
                  </button>
                ))}
              </div>
            )}

            <Calendar
              value={startDate}
              onSelect={escolherDia}
              cellClassName={classeDaCelula}
              footer={
                <span className="text-micro text-fg-muted font-mono tabular-nums">
                  {aguardandoFim || (startDate && !endDate)
                    ? "Escolha o fim do período"
                    : startDate
                      ? `${formatBrDate(startDate)} → ${formatBrDate(endDate)}`
                      : "Escolha o início do período"}
                </span>
              }
            />
          </div>,
          document.body
        )}
    </>
  );
}
