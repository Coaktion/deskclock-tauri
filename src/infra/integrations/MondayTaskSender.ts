import type { Task } from "@domain/entities/Task";
import type { CustomField } from "@domain/entities/CustomField";
import type { ITaskSender, TaskSendOutcome } from "@domain/integrations/ITaskSender";
import type { IMondayApi } from "@domain/integrations/IMondayApi";
import type { IMondayConfigPort } from "@domain/integrations/IMondayConfigPort";
import type { ICustomFieldRepository } from "@domain/repositories/ICustomFieldRepository";
import type { ICategoryRepository } from "@domain/repositories/ICategoryRepository";
import type {
  IMondayActivityItemRepository,
  MondayActivityItemRecord,
} from "@domain/repositories/IMondayActivityItemRepository";
import { formatCustomValue } from "@domain/usecases/customFields/customValueCodec";
import { validateTaskForMonday } from "@domain/integrations/taskValidation";
import { mondayGroupSignature } from "@domain/usecases/monday/mondayGroupSignature";
import { normalizeProjectMappings } from "@domain/usecases/monday/normalizeProjectMappings";
import {
  groupTasksForMonday,
  mondayGroupInterval,
  type MondayTaskGroup,
} from "@domain/usecases/monday/groupTasksForMonday";
import {
  buildActivityColumnValues,
  buildActivityDateColumns,
  secondsToDecimalHours,
} from "@domain/usecases/monday/buildActivityColumnValues";
import { DEFAULT_REPORT_TYPE } from "@domain/usecases/monday/resolveBoardActivitiesColumns";
import type { MondayProjectMapping } from "@shared/types/mondayConfig";
import { MondayClient } from "./monday/MondayClient";
import { MondayNotFoundError } from "./monday/errors";

interface ActivityPlan {
  group: MondayTaskGroup;
  mapping: MondayProjectMapping;
  signature: string;
  itemName: string;
  taskIds: string[];
  /** Grupo de destino, decidido pelo Report Type da tarefa. */
  groupId: string;
  /** `column_values` do update: inclui `name`, que o create passa como `item_name`. */
  updateValues: Record<string, unknown>;
  /** As mesmas colunas, sem `name` — é o que o `create_item` aceita. */
  createValues: Record<string, unknown>;
  payload: string;
  candidates: MondayActivityItemRecord[];
  claimed?: MondayActivityItemRecord;
}

/**
 * O grupo ou não pôde ser enviado, ou não deve ser — e o motivo é do usuário.
 *
 * Recusa não é exceção: os outros grupos do envio continuam subindo, e as
 * mensagens voltam juntas no fim. Abortar tudo por causa de uma tarefa faria uma
 * hora sem motivo de não faturável travar o dia inteiro.
 */
type PlanResult = { ok: true; plan: ActivityPlan } | { ok: false; reason: string };

/** Os campos personalizados que alimentam colunas do board. */
interface MondayCatalogFields {
  projectStage: CustomField | null;
  /** Sempre `null` enquanto a feature dorme — ver `catalogFields`. */
  reportType: CustomField | null;
  nonBillableReason: CustomField | null;
}

/** Recusa nomeando a tarefa: o envio manda vários grupos e a mensagem é uma só. */
function refuse(itemName: string, reason: string): PlanResult {
  return { ok: false, reason: `"${itemName}": ${reason}.` };
}

export interface MondayTaskSenderOptions {
  /**
   * Escreve no Monday mesmo quando o payload não mudou.
   *
   * É o envio **manual**: o usuário selecionou a tarefa e mandou enviar, então
   * "nada mudou desde a última vez" não é motivo para não fazer nada. Sem isso,
   * uma atividade apagada direto no Monday nunca voltava — o rastreamento ainda
   * batia com o payload, o envio era pulado em silêncio e o modal ainda dizia
   * "enviado com sucesso". Fica desligado no auto-sync, onde o skip é o que
   * impede o envio diário de reescrever o dia inteiro a cada execução.
   */
  forceWrite?: boolean;
}

function recordKey(record: MondayActivityItemRecord): string {
  return `${record.boardId}\0${record.itemId}`;
}

/**
 * Envia horas ao Monday criando um item no grupo Activities do board mapeado.
 *
 * Criar item não é idempotente, então cada grupo unificado é rastreado por
 * `item_id`: no reenvio o item existente é atualizado, e se o payload não mudou
 * nem chegamos a chamar a API.
 *
 * O sender **unifica internamente** (`groupTasksForMonday`): só assim ele conhece
 * todas as tarefas de cada grupo, necessárias para reencontrar o item quando o
 * usuário renomeia a tarefa ou troca a categoria depois do envio.
 */
export class MondayTaskSender implements ITaskSender {
  readonly integrationName = "Monday";
  private client: IMondayApi;

  constructor(
    private config: IMondayConfigPort,
    private itemRepo: IMondayActivityItemRepository,
    private customFieldRepo: ICustomFieldRepository,
    private categoryRepo: ICategoryRepository,
    client?: IMondayApi,
    private options: MondayTaskSenderOptions = {}
  ) {
    this.client = client ?? new MondayClient(config.get("mondayApiKey"));
  }

  async send(tasks: Task[]): Promise<TaskSendOutcome> {
    const userId = this.config.get("mondayUserId");
    if (!userId) throw new Error("Usuário do Monday não identificado. Reconecte a integração.");

    // Projeto sem board de destino é estado normal — o item de Portfólio existe
    // e a coluna "ID Quadro Projeto" ainda não foi preenchida. Deixá-lo passar
    // faria o envio tentar criar atividade num board vazio.
    const projectMapping = normalizeProjectMappings(this.config.get("mondayProjectMapping")).filter(
      (m) => !!m.mondayBoardId
    );

    const allCompleted = tasks.filter((t) => t.status === "completed" && t.endTime != null);
    const validTasks = allCompleted.filter((t) => validateTaskForMonday(t).ok);

    if (validTasks.length === 0 && allCompleted.length > 0) {
      throw new Error("Nenhuma tarefa válida para enviar ao Monday (precisa de nome e projeto).");
    }

    const groups = groupTasksForMonday(validTasks);
    const mapped = groups.flatMap((group) => {
      const mapping = projectMapping.find((m) => m.deskclockProjectId === group.tasks[0].projectId);
      return mapping ? [{ group, mapping }] : [];
    });

    if (mapped.length === 0 && groups.length > 0) {
      throw new Error(
        "Nenhuma tarefa enviada ao Monday: os projetos envolvidos não estão mapeados para um board."
      );
    }

    const fields = await this.catalogFields();
    // Sem escopo de workspace: integrações enxergam todos (§9.5). A categoria é
    // lida pelo nome, que é o próprio rótulo do Activity Type no board.
    const categoryNames = new Map((await this.categoryRepo.findAll()).map((c) => [c.id, c.name]));

    const plans: ActivityPlan[] = [];
    const refused: string[] = [];
    for (const { group, mapping } of mapped) {
      const result = await this.planGroup(group, mapping, categoryNames, userId, fields);
      if (result.ok) plans.push(result.plan);
      else refused.push(result.reason);
    }

    this.claimItems(plans);

    // Uma escrita que falha não leva as seguintes junto. O `for` com `await`
    // cru abortava no primeiro erro de rede ou recusa da API: os grupos já
    // escritos ficavam no board, os seguintes nunca subiam e o
    // `removeOrphans` abaixo era pulado — deixando no board o item de um grupo
    // que se fundiu, inflando o total reportado. O motivo entra em `refused`
    // com o nome da tarefa, que é o que a tela precisa exibir.
    const applied: ActivityPlan[] = [];
    const skipped: ActivityPlan[] = [];
    const failed: string[] = [];
    for (const plan of plans) {
      try {
        const wrote = await this.applyPlan(plan);
        applied.push(plan);
        if (!wrote) skipped.push(plan);
      } catch (err) {
        // Erro da API ou da rede: `failed`, não `refused` — não há campo a
        // preencher, é para tentar de novo, e a tela precisa distinguir os dois.
        failed.push(`"${plan.itemName}": ${err instanceof Error ? err.message : String(err)}.`);
      }
    }

    // A limpeza é higiene do board, não o que o usuário mandou enviar: ela
    // lança em qualquer erro que não seja "não encontrado", e fora de um `try`
    // isso descartava o outcome inteiro — reproduzindo exatamente o defeito que
    // esta mudança existe para corrigir, com os grupos já gravados e nada
    // marcado como enviado.
    try {
      await this.removeOrphans(plans, applied);
    } catch (err) {
      failed.push(`limpeza de itens órfãos: ${err instanceof Error ? err.message : String(err)}.`);
    }

    return {
      sentTaskIds: applied.flatMap((p) => p.taskIds),
      skippedTaskIds: skipped.flatMap((p) => p.taskIds),
      refused,
      failed,
    };
  }

  /**
   * Definições dos campos personalizados que alimentam colunas do board, lidas
   * uma vez por envio. A tarefa guarda o **id** da opção (§ codec dos valores),
   * e só a definição traduz esse id para o rótulo que o Monday espera.
   *
   * **O Report Type vem `null` de propósito: a feature está adormecida.** O
   * roteamento por grupo existe inteiro e é testado, mas o time ainda não fechou
   * o que cada valor significa — e um campo que ninguém sabe preencher mandaria
   * hora para o grupo errado do board do cliente, onde ela não seria encontrada
   * nem por quem a lançou. Com o campo fora, `planGroup` cai no
   * `DEFAULT_REPORT_TYPE` e toda atividade nasce em Activities, que é o que o
   * board já esperava antes desta fase.
   *
   * Acordar é ler `mondayReportTypeFieldId` aqui e devolver o card em
   * `MondayImportSection`. A config, o catálogo lido do board de Report e os
   * grupos resolvidos no mapeamento continuam sendo mantidos — despertar não
   * pode depender de reler board nenhum.
   */
  private async catalogFields(): Promise<MondayCatalogFields> {
    const [projectStage, nonBillableReason] = await Promise.all([
      this.fieldById(this.config.get("mondayProjectStageFieldId")),
      this.fieldById(this.config.get("mondayNonBillableReasonFieldId")),
    ]);
    return { projectStage, reportType: null, nonBillableReason };
  }

  private async fieldById(fieldId: string): Promise<CustomField | null> {
    if (!fieldId) return null;
    return this.customFieldRepo.findById(fieldId);
  }

  private async planGroup(
    group: MondayTaskGroup,
    mapping: MondayProjectMapping,
    categoryNames: Map<string, string>,
    userId: string,
    fields: MondayCatalogFields
  ): Promise<PlanResult> {
    const first = group.tasks[0];
    const itemName = first.name!.trim();
    const taskIds = group.tasks.map((t) => t.id);
    const signature = mondayGroupSignature(
      mapping.mondayBoardId,
      group.dayISO,
      group.groupKey,
      group.billable
    );

    // A categoria vira Activity Type pelo nome, e só se o board tiver esse
    // rótulo: mandar um rótulo que não existe na coluna status faz o Monday
    // recusar a escrita inteira, derrubando um envio que estava correto.
    const categoryName = first.categoryId ? categoryNames.get(first.categoryId) : undefined;
    const activityTypeLabel =
      categoryName && mapping.activityTypeLabels.includes(categoryName) ? categoryName : "";

    // Todas as tarefas do grupo compartilham os mesmos valores personalizados —
    // eles entram na chave de agrupamento (§6.3) —, então a primeira representa.
    const chosen = (field: CustomField | null) =>
      field ? formatCustomValue(field, first.customValues[field.id] ?? "") : "";

    // O Report Type não é coluna aqui: ele escolhe o **grupo** em que a
    // atividade nasce. Board sem o grupo correspondente recusa o envio em vez
    // de cair no Activities, que reportaria como atividade o que o usuário
    // classificou como reunião, despesa ou risco.
    const reportType = chosen(fields.reportType) || DEFAULT_REPORT_TYPE;
    const groupId = mapping.reportTypeGroupIds[reportType];
    if (!groupId) {
      return refuse(
        itemName,
        `o board ${mapping.mondayBoardName} não tem grupo para o Report Type "${reportType}"`
      );
    }

    // Mesma guarda do Activity Type, e pelo mesmo motivo: o campo personalizado
    // é editável na tela de Dados e pode ser vinculado a um campo que nunca veio
    // do board, então a opção escolhida pode não existir na coluna do Monday.
    //
    // O escopo é a segunda guarda, e não é redundante: nos boards internos a
    // coluna existe mas se chama "Project Phase", com outros quatro rótulos.
    // Hoje ela nem é resolvida por título, e o dia em que for, um rótulo de
    // cliente ali derrubaria a mutation inteira.
    const stageValue = chosen(fields.projectStage);
    const projectStageLabel =
      mapping.scope === "cliente" && mapping.projectStageLabels.includes(stageValue)
        ? stageValue
        : "";

    const reasonValue = chosen(fields.nonBillableReason);
    const nonBillableReasonLabel = mapping.nonBillableReasonLabels.includes(reasonValue)
      ? reasonValue
      : "";
    const missingReason = this.missingNonBillableReason(
      mapping,
      group,
      fields,
      reasonValue,
      nonBillableReasonLabel
    );
    if (missingReason) return refuse(itemName, missingReason);

    // Start/End Date são o intervalo trabalhado, e não o instante do envio: quem
    // manda na data da atividade é a tarefa do DeskClock. Como o valor vem dela,
    // é estável entre execuções e pode ir também no update — corrigir a hora de
    // uma tarefa já enviada acerta a data no board, e o skip por "nada mudou"
    // continua valendo.
    const interval = mondayGroupInterval(group);
    const columnValues = {
      ...buildActivityColumnValues({
        columnIds: mapping.columnIds,
        hoursDecimal: secondsToDecimalHours(group.totalSeconds),
        billable: group.billable,
        userId,
        ...(activityTypeLabel ? { activityTypeLabel } : {}),
        ...(projectStageLabel ? { projectStageLabel } : {}),
        ...(nonBillableReasonLabel ? { nonBillableReasonLabel } : {}),
      }),
      ...buildActivityDateColumns(mapping.columnIds, interval.startISO, interval.endISO),
    };
    // O nome só chega ao `create_item` via `item_name`; num update ele precisa ir
    // junto das colunas, senão o item fica com o nome antigo para sempre.
    const updateValues = { name: itemName, ...columnValues };

    return {
      ok: true,
      plan: {
        group,
        mapping,
        signature,
        itemName,
        taskIds,
        groupId,
        createValues: columnValues,
        updateValues,
        payload: JSON.stringify(updateValues),
        candidates: await this.itemRepo.findCandidates(
          mapping.mondayBoardId,
          group.dayISO,
          signature,
          taskIds
        ),
      },
    };
  }

  /**
   * Por que esta hora não faturável não pode subir, se for o caso.
   *
   * **Obrigatório em projeto de cliente**, onde a hora não faturada é a exceção
   * e a coluna existe justamente para justificá-la; **dispensado em projeto
   * interno**, onde non-billable é a norma (0 horas faturáveis em 119 itens).
   * Omitir em silêncio mandaria ao board exatamente o que a coluna existe para
   * impedir — e no board de outra pessoa, que não tem como saber o motivo.
   *
   * Board sem a coluna nunca exige: a omissão precisa vir da **ausência no
   * schema**, ou o cliente cujo board não tem o campo ficaria sem caminho
   * nenhum para lançar hora não faturável.
   */
  private missingNonBillableReason(
    mapping: MondayProjectMapping,
    group: MondayTaskGroup,
    fields: MondayCatalogFields,
    chosenValue: string,
    validLabel: string
  ): string | null {
    if (mapping.scope !== "cliente" || group.billable) return null;
    if (!mapping.columnIds.nonBillableReason) return null;
    if (validLabel) return null;

    if (!fields.nonBillableReason) {
      return "hora não faturável de cliente exige o motivo; vincule um campo personalizado ao Non Billable reason em Integrações";
    }
    if (!chosenValue) {
      return `informe o motivo de não faturável — hora não faturável em ${mapping.mondayBoardName} exige justificativa`;
    }
    return `o motivo "${chosenValue}" não existe na coluna do board ${mapping.mondayBoardName}`;
  }

  /**
   * Distribui os itens já existentes entre os grupos, no máximo um por grupo.
   *
   * Sem isso, dois grupos que compartilham candidatos (uma tarefa migrou de um
   * grupo para outro) reivindicariam o mesmo item e um deles seria sobrescrito.
   *
   * Em dois passes — todos os matches exatos de assinatura antes de qualquer
   * match por interseção — para que o resultado não dependa da ordem dos grupos,
   * que difere entre o envio por tarefa e o diário.
   */
  private claimItems(plans: ActivityPlan[]): void {
    const taken = new Set<string>();

    for (const plan of plans) {
      const exact = plan.candidates.find(
        (c) => c.signature === plan.signature && !taken.has(recordKey(c))
      );
      if (exact) {
        plan.claimed = exact;
        taken.add(recordKey(exact));
      }
    }

    for (const plan of plans) {
      if (plan.claimed) continue;
      const byTask = plan.candidates.find((c) => !taken.has(recordKey(c)));
      if (byTask) {
        plan.claimed = byTask;
        taken.add(recordKey(byTask));
      }
    }
  }

  /** Devolve se **escreveu** no Monday — `false` é o pulo por payload igual. */
  private async applyPlan(plan: ActivityPlan): Promise<boolean> {
    const existing = plan.claimed;

    // Compara o payload inteiro, não só a duração: alternar billable, renomear a
    // tarefa ou remapear a categoria muda o item no Monday sem mexer nas horas.
    // `forceWrite` pula a comparação — no envio manual, o clique é a intenção.
    if (
      !this.options.forceWrite &&
      existing &&
      existing.payload === plan.payload &&
      existing.signature === plan.signature
    ) {
      return false;
    }

    const itemId = existing
      ? await this.updateOrRecreate(plan, existing.itemId)
      : (
          await this.client.createItem(
            plan.mapping.mondayBoardId,
            plan.groupId,
            plan.itemName,
            plan.createValues
          )
        ).id;

    await this.itemRepo.save({
      boardId: plan.mapping.mondayBoardId,
      itemId,
      signature: plan.signature,
      dayISO: plan.group.dayISO,
      taskIds: plan.taskIds,
      payload: plan.payload,
    });
    return true;
  }

  /** Se o item foi apagado no Monday, o rastreamento fica órfão — recria em vez de travar. */
  private async updateOrRecreate(plan: ActivityPlan, itemId: string): Promise<string> {
    const boardId = plan.mapping.mondayBoardId;
    try {
      const updated = await this.client.changeColumnValues(boardId, itemId, plan.updateValues);
      // Apagar no Monday é mandar para a **lixeira**: o id continua válido e a
      // escrita acima responde sucesso, só que num item que ninguém mais vê. O
      // estado é o único sinal — sem ele, o rastreamento apontaria para a
      // lixeira para sempre e a atividade nunca voltaria ao board. Item
      // arquivado tem o mesmo sintoma e o mesmo desfecho.
      if (updated.state && updated.state !== "active") {
        return this.recreate(plan, itemId);
      }
      // Trocar o Report Type de uma atividade já enviada muda o **grupo**, e
      // grupo não é coluna: a escrita acima não o alcança, e sem isto o item
      // ficaria em Activities para sempre, classificado como o que não é. O
      // grupo vem no retorno da própria escrita, então só há requisição extra
      // quando ele de fato diverge.
      if (updated.groupId && updated.groupId !== plan.groupId) {
        await this.client.moveItemToGroup(updated.id, plan.groupId);
      }
      return updated.id;
    } catch (err) {
      // Só um "não existe" autoriza recriar; qualquer outro erro pode significar
      // que o item está lá e recriar duplicaria o apontamento.
      if (!(err instanceof MondayNotFoundError)) throw err;
      return this.recreate(plan, itemId);
    }
  }

  /** Larga o rastreamento do item perdido e cria um no lugar. */
  private async recreate(plan: ActivityPlan, staleItemId: string): Promise<string> {
    const boardId = plan.mapping.mondayBoardId;
    await this.itemRepo.deleteItem(boardId, staleItemId);
    const created = await this.client.createItem(
      boardId,
      plan.groupId,
      plan.itemName,
      plan.createValues
    );
    return created.id;
  }

  /**
   * Quando dois grupos se fundem (o usuário renomeou uma tarefa para bater com
   * outra), o item perdedor continuaria no board com as horas antigas, inflando o
   * total reportado. Ninguém o reivindicou, então ele sai do Monday.
   *
   * Só apagamos itens **inteiramente cobertos** por este envio. Um envio por
   * tarefa manda um grupo só, então um candidato pode conter tarefas que nem
   * entraram aqui — apagá-lo destruiria horas que continuam válidas no DeskClock.
   * Esses ficam para o envio diário, cujo escopo é o dia inteiro e onde cada
   * grupo reivindica o próprio item.
   *
   * **Grupo que falhou não cobre nada, mas continua protegendo o que reivindicou.**
   * A cobertura sai de `applied`: um candidato só é apagado quando todos os
   * grupos que o cobrem escreveram com sucesso — senão o erro de rede de um
   * grupo apagaria do board as horas que ele deveria ter reescrito. Já
   * `claimed` sai de **todos** os planos, incluindo os que falharam: o item que
   * um grupo recusado reivindicou continua sendo dele, e apagá-lo destruiria o
   * que estava lá antes deste envio.
   */
  private async removeOrphans(plans: ActivityPlan[], applied: ActivityPlan[]): Promise<void> {
    const claimed = new Set(
      plans.filter((p) => p.claimed).map((p) => recordKey(p.claimed as MondayActivityItemRecord))
    );
    const inScope = new Set(applied.flatMap((p) => p.taskIds));
    const orphans = new Map<string, MondayActivityItemRecord>();

    for (const plan of applied) {
      for (const candidate of plan.candidates) {
        const key = recordKey(candidate);
        if (claimed.has(key) || orphans.has(key)) continue;
        const fullyCovered =
          candidate.taskIds.length > 0 && candidate.taskIds.every((id) => inScope.has(id));
        if (fullyCovered) orphans.set(key, candidate);
      }
    }

    for (const orphan of orphans.values()) {
      try {
        await this.client.deleteItem(orphan.itemId);
      } catch (err) {
        // Já apagado no Monday à mão: a limpeza do rastreamento ainda precisa
        // acontecer, senão o mesmo órfão reaparece e trava todo envio seguinte.
        if (!(err instanceof MondayNotFoundError)) throw err;
      }
      await this.itemRepo.deleteItem(orphan.boardId, orphan.itemId);
    }
  }
}
