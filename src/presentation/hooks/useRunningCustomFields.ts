import { useState } from "react";
import type { CustomValues } from "@domain/entities/CustomField";
import type { Task } from "@domain/entities/Task";

interface UseRunningCustomFieldsParams {
  task: Task;
  onSave: (values: CustomValues) => Promise<void>;
  onClose: () => void;
}

/**
 * Estado da edição dos campos personalizados da **tarefa em execução**, dividido
 * do painel do omnibox (`OmniboxCustomFieldsPanel`). No overlay ele foi
 * absorvido pelo `useRunningTaskEditor`, que edita a tarefa inteira num painel
 * só — as regras de semeadura e de gravação abaixo valem para os dois (§9.4).
 *
 * Os valores são semeados **no mount** e não há efeito que os ressincronize:
 * quem monta este hook é o painel, que só existe enquanto está aberto. Um
 * efeito ouvindo `task.customValues` apagaria o que está sendo digitado toda vez
 * que outra janela tocasse na tarefa — e a tarefa em execução é justamente a que
 * mais recebe update de fora (pausar, retomar, trocar de categoria).
 *
 * Gravar só no "Salvar", e não a cada tecla, é o que separa este painel dos
 * chips de projeto e categoria ao lado: lá o valor é uma escolha atômica, aqui é
 * texto sendo digitado, e um `UPDATE` por caractere é escrita no banco e um
 * `RUNNING_TASK_CHANGED` para todas as janelas a cada tecla.
 */
export function useRunningCustomFields({ task, onSave, onClose }: UseRunningCustomFieldsParams) {
  const [values, setValues] = useState<CustomValues>(task.customValues);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      await onSave(values);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return { values, setValues, save, saving };
}
