import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { useCustomFields } from "@presentation/hooks/useCustomFields";
import type { AppConfig } from "@shared/types/appConfig";
import { showToast } from "@shared/utils/toast";
import { ImportActionButton, ImportCard } from "./ImportCard";
import { useEffect, useState } from "react";

/** As chaves de config que apontam um campo personalizado para uma coluna do Monday. */
export type MondayFieldConfigKey = {
  [K in keyof AppConfig]: K extends `monday${string}FieldId` ? K : never;
}[keyof AppConfig];

/**
 * Vínculo entre uma coluna do Monday e um campo personalizado da tarefa.
 *
 * Os três — Project Stage, Report Type e Non Billable reason — são atributo da
 * **atividade**, não da categoria nem do projeto: duas tarefas da mesma
 * categoria podem estar em etapas diferentes, e o motivo de uma hora não ter
 * sido faturada é dela, não da categoria dela.
 *
 * Campo personalizado, e não coluna própria em `tasks`: o valor precisa ser
 * editável no planejamento, no popup, no lançamento retroativo, na tarefa em
 * execução e nos modais de edição — tudo isso os campos personalizados já
 * atravessam. Uma coluna nova exigiria reescrever à mão o mesmo input em nove
 * lugares.
 *
 * Importar do Monday semeia as opções com os rótulos do próprio board — assim
 * rótulo do DeskClock e rótulo do Monday coincidem e não existe uma segunda
 * tabela de mapeamento para manter.
 */
export function MondayCatalogField({
  title,
  hint,
  configKey,
  optionLabels,
  defaultFieldLabel,
}: {
  title: string;
  hint: string;
  configKey: MondayFieldConfigKey;
  optionLabels: string[];
  /** Nome do campo criado pelo botão. Vazio cai no título do card. */
  defaultFieldLabel?: string;
}) {
  const config = useAppConfig();
  const { fields, createField, updateField } = useCustomFields();
  const [fieldId, setFieldId] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!config.isLoaded) return;
    setFieldId(config.get(configKey));
    // Hidratação única: só lemos a config na carga. `config` é recriado a cada
    // render do provider, então tê-lo nas deps desfaria a escolha do usuário.
  }, [config.isLoaded, configKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // O campo vinculado continua na lista mesmo arquivado — sumir com ele faria o
  // vínculo existente parecer inexistente.
  const options = fields.filter((f) => f.type === "select" && (!f.archived || f.id === fieldId));
  const linked = fields.find((f) => f.id === fieldId);
  const missingOptions = linked
    ? optionLabels.filter((l) => !linked.options.some((o) => o.label === l)).length
    : 0;

  async function handleSelect(id: string) {
    setFieldId(id);
    await config.set(configKey, id);
  }

  /** Cria o campo, ou reaproveita o que já tem o nome esperado. */
  async function handleCreate() {
    setBusy(true);
    try {
      const label = (defaultFieldLabel ?? "").trim() || title;
      // Só um `select` serve: vincular um campo `text` homônimo mandaria texto
      // livre para uma coluna `status` e sumiria do select desta tela, que só
      // lista selects — o vínculo pareceria não existir.
      const homonym = fields.find((f) => f.label.toLowerCase() === label.toLowerCase());
      if (homonym && homonym.type !== "select") {
        // Criar estouraria `DuplicateNameError`, cuja mensagem não diz o que
        // fazer: o campo homônimo nem aparece no select desta tela.
        throw new Error(
          `Já existe um campo "${label}" que não é de seleção. Renomeie-o na tela de Dados ou escolha outro campo na lista.`
        );
      }
      const field = homonym ?? (await createField({ label, type: "select", optionLabels }));
      await handleSelect(field.id);
      await showToast(
        "success",
        homonym
          ? `Campo "${label}" já existia e foi vinculado.`
          : `Campo "${label}" criado com ${optionLabels.length} opção(ões).`
      );
    } catch (err) {
      await showToast("error", err instanceof Error ? err.message : "Erro ao criar o campo.");
    } finally {
      setBusy(false);
    }
  }

  /**
   * Traz rótulos novos do board sem tocar nos antigos: `updateCustomField` casa
   * as opções existentes pelo rótulo e preserva o id, que é o valor gravado nas
   * tarefas. Remover opção some do formulário, mas o histórico continua válido —
   * por isso a união, e não a substituição.
   */
  async function handleRefreshOptions() {
    if (!linked) return;
    setBusy(true);
    try {
      const merged = [...linked.options.map((o) => o.label)];
      for (const label of optionLabels) if (!merged.includes(label)) merged.push(label);
      await updateField(linked.id, { optionLabels: merged });
      await showToast("success", `${missingOptions} opção(ões) adicionada(s) ao campo.`);
    } catch (err) {
      await showToast("error", err instanceof Error ? err.message : "Erro ao atualizar o campo.");
    } finally {
      setBusy(false);
    }
  }

  const noLabels = optionLabels.length === 0;
  const emptyHint = "Leia os catálogos para carregar os rótulos desta coluna.";

  return (
    <ImportCard title={title} hint={hint}>
      <div className="flex items-center gap-2">
        <select
          value={fieldId}
          onChange={(e) => handleSelect(e.target.value)}
          className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[11px] text-gray-200 focus:outline-none focus:border-blue-500"
        >
          <option value="">Nenhum campo vinculado</option>
          {options.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
        {linked ? (
          <ImportActionButton
            label={missingOptions > 0 ? `Atualizar (+${missingOptions})` : "Atualizar"}
            busy={busy}
            disabled={noLabels || missingOptions === 0}
            title={
              noLabels
                ? emptyHint
                : missingOptions === 0
                  ? "As opções do campo já cobrem os rótulos do board."
                  : undefined
            }
            onClick={handleRefreshOptions}
          />
        ) : (
          <ImportActionButton
            label="Criar do Monday"
            busy={busy}
            disabled={noLabels}
            title={noLabels ? emptyHint : undefined}
            onClick={handleCreate}
          />
        )}
      </div>
    </ImportCard>
  );
}
