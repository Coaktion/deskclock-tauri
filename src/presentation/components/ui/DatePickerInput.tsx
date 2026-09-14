import { CalendarDays } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatBrDate, maskBrDate, parseBrDate } from "@shared/utils/calendarGrid";
import { todayISO } from "@shared/utils/time";
import { Calendar } from "./Calendar";
import { Field } from "./Field";
import { Input } from "./Input";

/**
 * Campo de data: a caixa do formulário mais o `Calendar` num painel ancorado.
 *
 * **O campo aceita digitação.** Ele era `readOnly`, e chegar a uma data de um
 * ano atrás custava doze cliques na seta — que é o caminho do lançamento
 * retroativo, justamente a tela em que a data raramente é perto de hoje. A
 * máscara é do `calendarGrid`, e o valor só sobe quando os oito dígitos formam
 * uma data que existe: enquanto não formam, o que se vê é o rascunho, e o valor
 * de fora fica onde estava.
 *
 * **O painel vai em portal `fixed`**, e não no fluxo, porque a maior parte dos
 * call sites está dentro do corpo rolante de um `Modal` — no fluxo, o
 * `overflow` do corpo cortaria o calendário na primeira linha que passasse da
 * borda.
 */
interface DatePickerInputProps {
  /** ISO `AAAA-MM-DD`, ou `""`. */
  value: string;
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
  /**
   * Mostra "Limpar", que emite `onChange("")`.
   *
   * **Desligado por padrão, e é decisão declarada.** Vazio não é estado válido
   * em todo call site: o Lançamento Manual navega o dia por este valor, e limpar
   * ali deixaria a tela sem data nenhuma para mostrar. Quem aceita vazio liga a
   * prop; quem não aceita não ganha um botão que quebra a própria tela.
   */
  clearable?: boolean;
}

/** Altura estimada do painel, para decidir se ele abre para baixo ou para cima. */
const PANEL_HEIGHT = 320;
const PANEL_WIDTH = 264;

export function DatePickerInput({
  value,
  onChange,
  placeholder = "DD/MM/AAAA",
  className = "",
  maxDate,
  invalid = false,
  label,
  clearable = false,
}: DatePickerInputProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  // O que está escrito no campo enquanto se digita. `null` = mostrar o `value`
  // formatado; só há rascunho durante a digitação.
  const [rascunho, setRascunho] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const painelRef = useRef<HTMLDivElement>(null);

  const maxISO = maxDate
    ? `${maxDate.getFullYear()}-${String(maxDate.getMonth() + 1).padStart(2, "0")}-${String(maxDate.getDate()).padStart(2, "0")}`
    : undefined;

  useEffect(() => {
    if (!open) return;

    function handleClickFora(e: MouseEvent) {
      const alvo = e.target as Node;
      if (inputRef.current?.contains(alvo) || painelRef.current?.contains(alvo)) return;
      setOpen(false);
    }
    // O painel é `fixed`: rolar a página o deixaria para trás do campo, e
    // reposicioná-lo a cada quadro custaria mais do que fechar.
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
    setOpen(true);
  }

  function escolher(iso: string) {
    onChange(iso);
    setRascunho(null);
    setOpen(false);
    inputRef.current?.focus();
  }

  function handleDigitacao(e: React.ChangeEvent<HTMLInputElement>) {
    const texto = maskBrDate(e.target.value);
    setRascunho(texto);
    const iso = parseBrDate(texto);
    if (iso && (!maxISO || iso <= maxISO)) onChange(iso);
    // Apagar o campo até esvaziá-lo é a outra forma de limpar, e só vale onde
    // vazio é estado válido — a mesma regra do botão.
    if (texto === "" && clearable) onChange("");
  }

  /**
   * Os dois contratos do §7 vistos de dentro: com o painel aberto o Enter é
   * daqui — fecha e marca a tecla como consumida, para o formulário em volta não
   * submeter junto; fechado, deixa subir para o `useSubmitOnEnter`. O ESC fecha
   * o painel e **também** é consumido, ou o modal em volta fecharia junto.
   *
   * ↓ e Espaço abrem, e existem para quem chegou ao campo pelo teclado.
   */
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      if (!open) return;
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (e.key === "Escape" && open) {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown" || (e.key === " " && rascunho === null)) {
      e.preventDefault();
      if (!open) abrir();
    }
  }

  const controle = (
    <Input
      ref={inputRef}
      variant={label ? "bare" : "boxed"}
      invalid={label ? false : invalid}
      value={rascunho ?? formatBrDate(value)}
      placeholder={placeholder}
      inputMode="numeric"
      maxLength={10}
      onChange={handleDigitacao}
      onBlur={() => setRascunho(null)}
      onClick={() => !open && abrir()}
      onKeyDown={handleKeyDown}
      className="font-mono tabular-nums"
    />
  );

  return (
    <>
      {label ? (
        <Field
          label={label}
          className={className}
          boxClassName={`flex items-center pr-2 ${invalid ? "border-danger!" : ""}`}
        >
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
            // O ESC precisa ser tratado aqui **também**: com o foco numa célula,
            // o `onKeyDown` do campo não é atravessado, e a tecla chegaria ao
            // `useGlobalShortcuts` — que é do `document` e esconde a janela do
            // app. Consumida, ela fecha só o painel (§7, contrato 3).
            onKeyDown={(e) => {
              if (e.key !== "Escape") return;
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
              inputRef.current?.focus();
            }}
            style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999 }}
            className="bg-surface border border-border-subtle rounded-card shadow-(--shadow-overlay) p-2"
          >
            <Calendar
              value={value}
              onSelect={escolher}
              maxISO={maxISO}
              footer={
                <>
                  <button
                    type="button"
                    onClick={() => escolher(todayISO())}
                    className="text-micro font-medium text-accent-text px-1.5 py-0.75 rounded-chip hover:bg-raised transition-colors"
                  >
                    Hoje
                  </button>
                  {clearable && (
                    <button
                      type="button"
                      onClick={() => {
                        onChange("");
                        setRascunho(null);
                        setOpen(false);
                      }}
                      className="ml-auto text-micro font-medium text-fg-muted px-1.5 py-0.75 rounded-chip hover:bg-raised hover:text-fg transition-colors"
                    >
                      Limpar
                    </button>
                  )}
                </>
              }
            />
          </div>,
          document.body
        )}
    </>
  );
}
