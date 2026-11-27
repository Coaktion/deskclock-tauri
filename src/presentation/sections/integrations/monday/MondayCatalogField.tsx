import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { useCustomFields } from "@presentation/hooks/useCustomFields";
import type { AppConfig } from "@shared/types/appConfig";
import { showToast } from "@shared/utils/toast";
import {
  linkableCatalogFields,
  missingCatalogOptions,
  MONDAY_CATALOG_EMPTY_HINT,
} from "@domain/usecases/monday/mondayCatalogFields";
import {
  createOrLinkCatalogField,
  refreshCatalogFieldOptions,
} from "@presentation/integrations/mondayCatalogFields";
import { Select } from "@presentation/components/ui";
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

  const options = linkableCatalogFields(fields, fieldId);
  const linked = fields.find((f) => f.id === fieldId);
  const missingOptions = linked ? missingCatalogOptions(linked, optionLabels).length : 0;

  async function handleSelect(id: string) {
    setFieldId(id);
    await config.set(configKey, id);
  }

  /** Cria o campo, ou reaproveita o que já tem o nome esperado. */
  async function handleCreate() {
    setBusy(true);
    try {
      const { label, reused } = await createOrLinkCatalogField(
        { fields, createField, updateField, link: handleSelect },
        { title, defaultFieldLabel: defaultFieldLabel ?? "", optionLabels }
      );
      await showToast(
        "success",
        reused
          ? `Campo "${label}" já existia e foi vinculado.`
          : `Campo "${label}" criado com ${optionLabels.length} opção(ões).`
      );
    } catch (err) {
      await showToast("error", err instanceof Error ? err.message : "Erro ao criar o campo.");
    } finally {
      setBusy(false);
    }
  }

  /** Traz rótulos novos do board sem tocar nos antigos (ver `refreshCatalogFieldOptions`). */
  async function handleRefreshOptions() {
    if (!linked) return;
    setBusy(true);
    try {
      const added = await refreshCatalogFieldOptions({ updateField }, linked, optionLabels);
      await showToast("success", `${added} opção(ões) adicionada(s) ao campo.`);
    } catch (err) {
      await showToast("error", err instanceof Error ? err.message : "Erro ao atualizar o campo.");
    } finally {
      setBusy(false);
    }
  }

  const noLabels = optionLabels.length === 0;
  const emptyHint = MONDAY_CATALOG_EMPTY_HINT;

  return (
    <ImportCard title={title} hint={hint}>
      <div className="flex items-center gap-2">
        <Select
          aria-label={title}
          size="sm"
          value={fieldId}
          onChange={(e) => handleSelect(e.target.value)}
          className="flex-1"
        >
          <option value="">Nenhum campo vinculado</option>
          {options.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </Select>
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
