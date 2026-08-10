/**
 * Escolha entre poucas opções mutuamente exclusivas, todas à vista — Modo,
 * Gatilho, formato de duração. Cinco cópias à mão nas seções de integração, e
 * elas já divergiam: as do Google tinham perdido o `font-medium` que as do
 * `AutoSyncControls` mantinham.
 *
 * Não é um `<select>` nem um grupo de `FilterPill`: aqui as opções são duas ou
 * três, sempre visíveis, e uma **está sempre** escolhida — não há o estado
 * "nenhum filtro aplicado" que a pílula expressa.
 */
interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: readonly SegmentedOption<T>[];
  /** Anuncia o que o grupo escolhe — os rótulos sozinhos não dizem de quê. */
  ariaLabel: string;
  className?: string;
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  className = "",
}: SegmentedControlProps<T>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`flex items-center gap-1 bg-raised rounded-chip p-0.5 ${className}`}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={selected}
            className={`px-2.5 py-1 text-sm font-medium rounded-chip transition-colors ${
              selected ? "bg-accent text-white" : "text-fg-muted hover:text-fg"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
