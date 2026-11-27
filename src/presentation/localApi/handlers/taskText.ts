import { formatCustomValue } from "@domain/usecases/customFields/customValueCodec";
import { buildTaskFieldHints } from "@domain/usecases/llm/taskText/buildTaskFieldHints";
import { formatTaskFieldInstruction } from "@domain/usecases/llm/taskText/formatTaskFieldInstruction";
import { interpretTaskText } from "@domain/usecases/llm/taskText/interpretTaskText";
import type {
  TaskFieldHint,
  TaskTextCatalog,
  TaskTextInterpretation,
} from "@domain/usecases/llm/taskText/types";
import { buildProjectCategoryMap } from "@domain/usecases/projectCategories/buildProjectCategoryMap";
import { describeTaskTextError } from "@presentation/integrations/taskText";
import { DomainError } from "@shared/errors";
import { errorResult } from "../errors";
import { importBody, optionalString } from "../importInput";
import { resolveRequestWorkspace } from "../resolve";
import type { LocalApiDeps, LocalApiHandler } from "../types";

// Iniciar tarefa por texto pela API local (`specs/iniciar-tarefa-por-texto.md`
// item 12). **Nenhuma das duas inicia nada**: o chamador do MCP já é uma IA, e
// interpretar e iniciar de uma vez pularia a confirmação que a tela exige. Ele
// mostra a interpretação, confirma e chama `start_task`/`log_past_task`/`plan_task`.

interface TaskTextContext {
  hints: TaskFieldHint[];
  catalog: TaskTextCatalog;
}

/** O que a instrução e o casamento consultam: o catálogo do workspace e os campos ativos. */
async function loadContext(deps: LocalApiDeps, workspaceId: string): Promise<TaskTextContext> {
  const [projects, categories, associations, allFields] = await Promise.all([
    deps.projectRepo.findAll(workspaceId),
    deps.categoryRepo.findAll(workspaceId),
    deps.projectCategoryRepo.findAll(workspaceId),
    deps.customFieldRepo.findAll(),
  ]);
  const customFields = allFields.filter((field) => !field.archived);
  return {
    hints: buildTaskFieldHints(customFields, { projects, categories }),
    catalog: {
      projects,
      categories,
      projectCategoryMap: buildProjectCategoryMap(associations),
      customFields,
    },
  };
}

// O exemplo vem do catálogo e aqui pode sair: a API é local. A regra de
// privacidade é sobre o que vai ao provedor de IA, e a instrução nunca vai.
function fieldDto(hint: TaskFieldHint) {
  return {
    sigla: hint.sigla,
    label: hint.label,
    kind: hint.kind,
    ...(hint.fieldId ? { fieldId: hint.fieldId } : {}),
    ...(hint.example ? { example: hint.example } : {}),
  };
}

export const getTaskTextFields: LocalApiHandler = async (deps, params) => {
  const workspaceId = await resolveRequestWorkspace(deps, params.workspaceId);
  const { hints } = await loadContext(deps, workspaceId);
  return {
    status: 200,
    body: {
      workspaceId,
      instruction: formatTaskFieldInstruction(hints),
      fields: hints.map(fieldDto),
    },
  };
};

/** Os ids da interpretação com os nomes ao lado, para o cliente mostrar o que entendeu. */
function interpretationDto(
  workspaceId: string,
  result: TaskTextInterpretation,
  catalog: TaskTextCatalog
) {
  const nameOf = (items: { id: string; name: string }[], id: string | null) =>
    id === null ? null : (items.find((item) => item.id === id)?.name ?? null);
  const customFields = catalog.customFields.flatMap((field) => {
    const value = result.customValues[field.id];
    if (!value) return [];
    return [
      {
        fieldId: field.id,
        label: field.label,
        value,
        valueLabel: formatCustomValue(field, value),
      },
    ];
  });
  return {
    workspaceId,
    source: result.source,
    name: result.name,
    projectId: result.projectId,
    projectName: nameOf(catalog.projects, result.projectId),
    categoryId: result.categoryId,
    categoryName: nameOf(catalog.categories, result.categoryId),
    billable: result.billable,
    billableExplicit: result.billableExplicit,
    customValues: result.customValues,
    customFields,
    ambiguities: result.ambiguities,
    notFound: result.notFound,
  };
}

export const interpretTaskTextHandler: LocalApiHandler = async (deps, params) => {
  const body = importBody(params.body);
  const text = optionalString(body, "text")?.trim();
  if (!text) throw new DomainError("text é obrigatório");
  const workspaceId = await resolveRequestWorkspace(deps, optionalString(body, "workspaceId"));
  const { hints, catalog } = await loadContext(deps, workspaceId);

  // Sem provedor não é erro: com sigla o casamento é local, e texto livre vira
  // o nome — o que o campo da tela faz nos dois casos.
  const source = deps.llm();
  const llm = source.notConfiguredMessage ? null : source.createLlm();
  try {
    const result = await interpretTaskText({ llm, text, hints, catalog });
    return { status: 200, body: interpretationDto(workspaceId, result, catalog) };
  } catch (error) {
    // Só o provedor lança aqui: 502 com a frase da tela, como o resumo do dia
    // faz por dia — o erro cru (inglês técnico, campo interno) não sai.
    return errorResult(502, describeTaskTextError(error));
  }
};
