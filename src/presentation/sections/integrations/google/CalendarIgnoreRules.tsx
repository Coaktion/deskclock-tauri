import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { addIgnoreRule } from "@domain/usecases/calendar/isEventIgnored";
import { Button, IconButton, Input, Select } from "@presentation/components/ui";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { useIntegrationsUi } from "@presentation/contexts/IntegrationsUiContext";
import { useSubmitOnEnter } from "@presentation/hooks/useSubmitOnEnter";
import type { CalendarIgnoreRule } from "@shared/types/calendarConfig";

const OPERATOR_LABEL: Record<CalendarIgnoreRule["operator"], string> = {
  equals: "Igual",
  contains: "Contém",
};

/** Regras de ignorar eventos da agenda pelo nome — valem para o rastreio e para a importação. */
export function CalendarIgnoreRules() {
  const config = useAppConfig();
  const { modal } = useIntegrationsUi();
  const [rules, setRules] = useState<CalendarIgnoreRule[]>([]);
  const [operator, setOperator] = useState<CalendarIgnoreRule["operator"]>("equals");
  const [value, setValue] = useState("");

  // Relê ao fechar um modal: o "Ignorar sempre" da importação grava direto na
  // config, e sem isto a lista desta tela ficaria sem a regra recém-criada.
  // `config` fica fora das deps: o objeto do contexto muda a cada render.
  useEffect(() => {
    if (config.isLoaded && modal === null) setRules(config.get("calendarIgnoreRules"));
  }, [config.isLoaded, modal]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save(next: CalendarIgnoreRule[]) {
    setRules(next);
    await config.set("calendarIgnoreRules", next);
  }

  async function add() {
    const next = addIgnoreRule(rules, { operator, value });
    setValue("");
    if (next !== rules) await save(next);
  }

  const onKeyDown = useSubmitOnEnter(() => void add());

  return (
    <div className="py-2.5 border-t border-border-subtle">
      <p className="text-sm text-fg-secondary">Eventos ignorados</p>
      <p className="text-xs text-fg-muted pb-2">
        Eventos com esses nomes não são rastreados nem sugeridos na importação.
      </p>
      {rules.map((rule) => (
        <div
          key={`${rule.operator}:${rule.value}`}
          className="flex items-center justify-between gap-2 py-1"
        >
          <span className="text-sm text-fg truncate">
            <span className="text-fg-muted">{OPERATOR_LABEL[rule.operator]} · </span>
            {rule.value}
          </span>
          <IconButton
            icon={<X size={14} />}
            title="Remover regra"
            variant="danger"
            size="sm"
            onClick={() => void save(rules.filter((r) => r !== rule))}
          />
        </div>
      ))}
      <div className="flex items-center gap-2 pt-1" onKeyDown={onKeyDown}>
        <Select
          size="sm"
          aria-label="Operador"
          value={operator}
          onChange={(e) => setOperator(e.target.value as CalendarIgnoreRule["operator"])}
          className="shrink-0"
        >
          <option value="equals">{OPERATOR_LABEL.equals}</option>
          <option value="contains">{OPERATOR_LABEL.contains}</option>
        </Select>
        <Input
          size="sm"
          aria-label="Nome do evento"
          placeholder="Nome do evento"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="flex-1 min-w-0"
        />
        <Button size="sm" onClick={() => void add()} disabled={!value.trim()}>
          Adicionar
        </Button>
      </div>
    </div>
  );
}
