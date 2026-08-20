import type { PlannedTaskAction } from "@domain/entities/PlannedTask";
import { buildPlannedAction } from "@domain/utils/actions";
import { boxClass } from "@presentation/components/fieldStyles";
import { Button, IconButton, Input, Select } from "@presentation/components/ui";
import { ExternalLink, FolderOpen, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

interface PlannedActionsFieldProps {
  actions: PlannedTaskAction[];
  onChange: (actions: PlannedTaskAction[]) => void;
  /**
   * Empilha o tipo acima do valor, para as duas colunas estreitas — a do
   * Planejamento (280px) e o painel do popup (264px). Sem ele, os controles
   * ficam na mesma linha, que é o que o modal tem largura para fazer.
   */
  compact?: boolean;
}

/**
 * As ações de uma planejada — a lista do que já existe e a linha que acrescenta.
 *
 * Existia escrito **três vezes**, nas duas colunas estreitas e no modal, e as
 * três já discordavam: `text-purple-400` cru no glifo de arquivo em duas delas
 * (fora do alcance do `meaningColors`, que varre só emerald/green/rose/red),
 * três controles diferentes para remover e três para adicionar. Pior que a
 * divergência era o custo: acrescentar um campo custava três edições em dois
 * donos de estado, porque o `PlannedTaskForm` guardava o seu próprio par
 * `newActionType`/`newActionValue` em vez do `usePlannedTaskEditor`.
 *
 * O **rótulo da seção fica de fora**, no call site: os três dizem coisas
 * diferentes ("Ações ao iniciar" no formulário e no modal, "Ações" no painel) e
 * na coluna do Planejamento ele carrega junto o divisor que quebra a coluna em
 * blocos. Unificá-lo seria inventar uma divergência para depois resolvê-la.
 *
 * O estado de "adicionar" é interno de propósito: ele não faz parte da tarefa —
 * o que sai daqui é a lista pronta, pelo `onChange`.
 */
export function PlannedActionsField({
  actions,
  onChange,
  compact = false,
}: PlannedActionsFieldProps) {
  const [newType, setNewType] = useState<PlannedTaskAction["type"]>("open_url");
  const [newValue, setNewValue] = useState("");
  const [newLabel, setNewLabel] = useState("");

  function add() {
    const value = newValue.trim();
    if (!value) return;
    // O `buildPlannedAction` é quem decide que nome vazio **não** vira
    // `label: ""` — é regra do dado, e vale igual para as três integrações que
    // criam ação e para as três telas que as editam.
    onChange([...actions, buildPlannedAction(newType, value, newLabel)]);
    setNewValue("");
    setNewLabel("");
  }

  function remove(index: number) {
    onChange(actions.filter((_, i) => i !== index));
  }

  /**
   * Sub-formulário: aqui o Enter acrescenta a ação, não salva a tarefa em volta.
   * O `preventDefault` é o que avisa isso ao `useSubmitOnEnter` do container —
   * é o terceiro contrato de teclado (§8.2), e sem ele a tarefa é salva com a
   * ação ainda por acrescentar.
   */
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    e.preventDefault();
    add();
  }

  const placeholder = newType === "open_url" ? "https://..." : "/caminho/arquivo";

  return (
    <>
      {actions.length > 0 && (
        <ul className={`flex flex-col ${compact ? "gap-1" : "gap-1.5"}`}>
          {actions.map((action, i) => (
            <li
              key={i}
              className={`flex items-center bg-raised rounded-control ${
                compact ? "gap-2 px-2.5 py-1.5" : "gap-3 px-3 py-2"
              }`}
            >
              <span
                className={`shrink-0 ${
                  action.type === "open_url" ? "text-accent-text" : "text-fg-secondary"
                }`}
              >
                {action.type === "open_url" ? <ExternalLink size={14} /> : <FolderOpen size={14} />}
              </span>
              {/* Nomeada, a linha mostra o nome e guarda o valor no `title` —
                  nos 264px do painel não cabem os dois, e é o nome que a
                  pessoa escreveu para reconhecer a ação. */}
              <span
                className="flex-1 min-w-0 text-sm text-fg-secondary truncate"
                title={action.value}
              >
                {action.label?.trim() || action.value}
              </span>
              <IconButton
                icon={<Trash2 size={14} />}
                title="Remover"
                variant="danger"
                size="sm"
                onClick={() => remove(i)}
              />
            </li>
          ))}
        </ul>
      )}

      {/* A ordem é a da leitura: que tipo é, como se chama, para onde aponta —
          e o acrescentar fica encostado no último campo, que é onde o Enter
          cai depois de digitar o valor. O nome vem antes do valor e mesmo
          assim é o opcional: pô-lo depois deixaria o `+` no meio da pilha. */}
      {compact ? (
        <>
          <Select
            aria-label="Tipo da ação"
            size="sm"
            value={newType}
            onChange={(e) => setNewType(e.target.value as PlannedTaskAction["type"])}
            className="w-full"
          >
            <option value="open_url">URL</option>
            <option value="open_file">Arquivo</option>
          </Select>

          <Input
            size="sm"
            aria-label="Nome da ação"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Nome (opcional)"
          />

          <div className={`${boxClass} flex items-center pr-1`}>
            <Input
              variant="bare"
              size="sm"
              aria-label="Valor da ação"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
            />
            <IconButton
              icon={<Plus size={14} />}
              title="Adicionar ação"
              variant="neutral"
              size="sm"
              disabled={!newValue.trim()}
              onClick={add}
            />
          </div>
        </>
      ) : (
        <div className="flex gap-2">
          <Select
            aria-label="Tipo da ação"
            value={newType}
            onChange={(e) => setNewType(e.target.value as PlannedTaskAction["type"])}
          >
            <option value="open_url">URL</option>
            <option value="open_file">Arquivo</option>
          </Select>
          <Input
            aria-label="Nome da ação"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Nome (opcional)"
            className="flex-1"
          />
          <Input
            aria-label="Valor da ação"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="flex-1"
          />
          {/* Com texto, e não o `+` sozinho: é o mesmo botão do "Novo perfil" da
              exportação, e o `Button` pede rótulo — um ícone só, dentro de uma
              caixa, não é o que o `IconButton` desenha. */}
          <Button icon={<Plus size={14} />} onClick={add} disabled={!newValue.trim()}>
            Adicionar
          </Button>
        </div>
      )}
    </>
  );
}
