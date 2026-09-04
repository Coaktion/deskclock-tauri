import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  MONTH_ABBR,
  MONTH_NAMES,
  WEEKDAY_INITIALS,
  WEEKDAY_NAMES,
  YEAR_PAGE_SIZE,
  monthCells,
  monthOf,
  toISODate,
  yearPage,
} from "@shared/utils/calendarGrid";
import { todayISO } from "@shared/utils/time";
import { IconButton } from "./IconButton";

/**
 * A grade de datas, sem campo e sem popover — quem os desenha é o
 * `DatePickerInput` (data única) e o `DateRangeInput` (período).
 *
 * **O título tem dois alvos, não um.** Clicar no mês abre a grade de meses;
 * clicar no ano abre a de anos. Foi assim que o modelo foi escolhido, e a
 * diferença para o botão único que cicla as três vistas é que ali chegar ao ano
 * custa dois cliques e um deles passa por uma tela que não se queria ver.
 *
 * **Hoje é ponto, seleção é fundo.** Enquanto os dois pintavam caixa — que é o
 * que a folha do `react-day-picker` fazia —, o mês corrente abria mostrando
 * duas datas com aparência de escolhidas.
 */

type View = "days" | "months" | "years";

interface CalendarProps {
  /** ISO da data escolhida, ou `""`. No período, é a ponta em foco. */
  value: string;
  onSelect: (iso: string) => void;
  /** Nenhuma data depois desta pode ser escolhida. */
  maxISO?: string;
  /** Pinta a célula com o papel que ela tem no intervalo (usado pelo período). */
  cellClassName?: (iso: string) => string;
  /** Rodapé do painel — "Hoje / Limpar" no campo de data, o resumo no período. */
  footer?: React.ReactNode;
}

const CELL = "w-8 h-8 grid place-items-center rounded-control transition-colors";

export function Calendar({ value, onSelect, maxISO, cellClassName, footer }: CalendarProps) {
  const hoje = todayISO();
  const inicial = monthOf(value) ?? monthOf(hoje)!;

  const [view, setView] = useState<View>("days");
  const [{ year, month }, setPos] = useState(inicial);
  const [focused, setFocused] = useState(value || hoje);

  // Ajuste em render, não em efeito: quando o valor muda por fora (o botão
  // "Hoje", um atalho do trilho, a digitação no campo), a vista precisa saltar
  // para o mês daquela data antes de pintar — num efeito, o painel desenharia
  // uma vez o mês errado.
  const [valorAnterior, setValorAnterior] = useState(value);
  if (value !== valorAnterior) {
    setValorAnterior(value);
    const alvo = monthOf(value);
    if (alvo && (alvo.year !== year || alvo.month !== month)) setPos(alvo);
    if (value) setFocused(value);
  }

  const gridRef = useRef<HTMLDivElement>(null);
  const precisaFocar = useRef(false);
  useEffect(() => {
    // O DOM é a única casa do foco: mudar `focused` reordena o `tabIndex`, mas
    // não move o cursor do teclado. Só corre quando a navegação partiu daqui —
    // sem a trava, abrir o painel roubaria o foco do campo que o abriu.
    if (!precisaFocar.current) return;
    precisaFocar.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-iso="${focused}"]`)?.focus();
  }, [focused]);

  const cells = monthCells(year, month);
  const bloqueado = (iso: string) => (maxISO ? iso > maxISO : false);

  function irParaMes(passo: number) {
    setPos(({ year: y, month: m }) => {
      const d = new Date(y, m + passo, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  /** O passo do ‹ › muda com a vista: mês, ano, e a página de 12 anos. */
  function navegar(passo: number) {
    if (view === "days") return irParaMes(passo);
    if (view === "months") return setPos((p) => ({ ...p, year: p.year + passo }));
    setPos((p) => ({ ...p, year: p.year + passo * YEAR_PAGE_SIZE }));
  }

  function moverFoco(dias: number) {
    const base = new Date(focused + "T12:00:00");
    base.setDate(base.getDate() + dias);
    const alvo = toISODate(base);
    if (bloqueado(alvo)) return;
    setFocused(alvo);
    precisaFocar.current = true;
    const m = monthOf(alvo)!;
    if (m.year !== year || m.month !== month) setPos(m);
  }

  /**
   * Navegação por seta dentro da grade. Existe porque o `react-day-picker` a
   * tinha: sair dele sem isto trocaria uma dependência por uma regressão de
   * teclado, que é o tipo de perda que não aparece em nenhuma tela.
   *
   * ESC e Enter **não** são tratados aqui — são do container (§7), e consumi-los
   * neste nível esconderia o Enter que o campo usa para confirmar o que se
   * digitou.
   */
  function handleGridKeyDown(e: React.KeyboardEvent) {
    const passos: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
      PageUp: -28,
      PageDown: 28,
    };
    const passo = passos[e.key];
    if (passo === undefined) return;
    e.preventDefault();
    moverFoco(passo);
  }

  const tituloAno = (
    <button
      type="button"
      onClick={() => setView(view === "years" ? "days" : "years")}
      aria-expanded={view === "years"}
      className="px-1.5 py-1 rounded-chip text-sm font-semibold text-fg hover:bg-raised transition-colors font-mono tabular-nums"
    >
      {year}
    </button>
  );

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-0.5 pb-0.5">
        {view === "years" ? (
          <span className="px-1.5 py-1 text-sm font-semibold text-fg font-mono tabular-nums">
            {yearPage(year)[0]} – {yearPage(year)[YEAR_PAGE_SIZE - 1]}
          </span>
        ) : (
          <>
            {view === "days" && (
              <button
                type="button"
                onClick={() => setView("months")}
                aria-expanded={false}
                className="px-1.5 py-1 rounded-chip text-sm font-semibold text-fg hover:bg-raised transition-colors"
              >
                {MONTH_NAMES[month]}
              </button>
            )}
            {tituloAno}
          </>
        )}
        <div className="ml-auto flex gap-0.5">
          <IconButton
            icon={<ChevronLeft size={14} />}
            title="Anterior"
            variant="neutral"
            size="sm"
            onClick={() => navegar(-1)}
          />
          <IconButton
            icon={<ChevronRight size={14} />}
            title="Próximo"
            variant="neutral"
            size="sm"
            onClick={() => navegar(1)}
          />
        </div>
      </div>

      {view === "days" && (
        <div>
          <div className="grid grid-cols-7">
            {WEEKDAY_INITIALS.map((letra, i) => (
              <span
                key={WEEKDAY_NAMES[i]}
                aria-hidden="true"
                className="w-8 h-6 grid place-items-center text-nav font-medium text-fg-muted"
              >
                {letra}
              </span>
            ))}
          </div>
          <div ref={gridRef} className="grid grid-cols-7" onKeyDown={handleGridKeyDown}>
            {cells.map((cell) => {
              const selecionado = cell.iso === value;
              const desabilitado = bloqueado(cell.iso);
              const marca = [
                cell.outside && !selecionado ? "text-fg-muted opacity-45" : "text-fg-secondary",
                cell.iso === hoje && !selecionado ? "text-accent-text font-semibold" : "",
                selecionado ? "bg-accent text-white" : "hover:bg-raised hover:text-fg",
                cellClassName?.(cell.iso) ?? "",
              ]
                .filter(Boolean)
                .join(" ");

              return (
                <button
                  key={cell.iso}
                  type="button"
                  data-iso={cell.iso}
                  disabled={desabilitado}
                  tabIndex={cell.iso === focused ? 0 : -1}
                  aria-pressed={selecionado}
                  aria-current={cell.iso === hoje ? "date" : undefined}
                  aria-label={rotuloData(cell.iso)}
                  onClick={() => onSelect(cell.iso)}
                  onFocus={() => setFocused(cell.iso)}
                  className={`${CELL} text-sm font-medium font-mono tabular-nums relative disabled:opacity-20 disabled:pointer-events-none ${marca}`}
                >
                  {cell.day}
                  {cell.iso === hoje && (
                    <span className="absolute bottom-1 w-1 h-1 rounded-full bg-current" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {view === "months" && (
        <div className="grid grid-cols-4 gap-0.5 w-56">
          {MONTH_ABBR.map((abrev, i) => (
            <button
              key={abrev}
              type="button"
              aria-pressed={i === month}
              aria-label={MONTH_NAMES[i]}
              onClick={() => {
                setPos((p) => ({ ...p, month: i }));
                setView("days");
              }}
              className={`py-2 rounded-control text-sm font-medium transition-colors ${
                i === month
                  ? "bg-accent text-white"
                  : "text-fg-secondary hover:bg-raised hover:text-fg"
              }`}
            >
              {abrev}
            </button>
          ))}
        </div>
      )}

      {view === "years" && (
        <div className="grid grid-cols-3 gap-0.5 w-56">
          {yearPage(year).map((ano) => (
            <button
              key={ano}
              type="button"
              aria-pressed={ano === year}
              onClick={() => {
                setPos((p) => ({ ...p, year: ano }));
                setView("months");
              }}
              className={`py-2 rounded-control text-sm font-medium font-mono tabular-nums transition-colors ${
                ano === year
                  ? "bg-accent text-white"
                  : "text-fg-secondary hover:bg-raised hover:text-fg"
              }`}
            >
              {ano}
            </button>
          ))}
        </div>
      )}

      {footer && (
        <div className="flex items-center gap-2 pt-1.5 border-t border-border-subtle">{footer}</div>
      )}
    </div>
  );
}

/** O nome acessível da célula: o número sozinho não diz de que mês ele é. */
function rotuloData(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${Number(d)} de ${MONTH_NAMES[Number(m) - 1].toLowerCase()} de ${y}`;
}
