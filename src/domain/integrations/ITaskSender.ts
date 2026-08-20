import type { Task } from "@domain/entities/Task";

/**
 * O que um envio conseguiu fazer, e o que ficou de fora.
 *
 * O retorno era `void`, e por isso quem chamava só tinha duas leituras
 * possíveis: resolveu (marca **tudo** como enviado) ou lançou (não marca
 * **nada**). Envio parcial não cabia em nenhuma das duas — e ele é o caso comum,
 * porque um envio leva vários grupos e a recusa é por grupo. O resultado era o
 * pior dos dois mundos: os grupos válidos subiam ao destino e mesmo assim
 * nenhuma tarefa recebia o badge "Enviado", o timestamp do último envio não
 * avançava, e a tela dizia que nada tinha sido enviado.
 */
export interface TaskSendOutcome {
  /**
   * Ids das tarefas que de fato foram gravadas no destino.
   *
   * Para os senders que recebem um representante por grupo (§ `sendsRawTasks`),
   * vem o id do representante — expandir para o grupo inteiro é de quem chamou,
   * que é quem conhece o agrupamento.
   */
  sentTaskIds: string[];
  /**
   * **Subconjunto de `sentTaskIds` cujo grupo já estava no destino igualzinho.**
   *
   * O destino tem o dado, então elas são "enviadas" para todo efeito de badge e
   * de timestamp — mas **nada foi escrito neste envio**, e contá-las como envio
   * inflava o número que a tela mostra. O envio diário reabre a janela desde o
   * último ciclo limpo, então os dias já enviados voltam a cada execução: o
   * "Enviar agora" de um dia com 4 grupos reportava 8 no dia seguinte.
   *
   * Só o Monday preenche — é o único sender com upsert idempotente. Ausente
   * significa "não sei dizer", que é o mesmo que nenhum pulo.
   */
  skippedTaskIds?: string[];
  /**
   * **Recusa: o destino não aceita este dado, e quem resolve é o usuário.**
   * Hora não faturável de cliente sem motivo, rótulo que não existe na coluna,
   * board sem grupo para o Report Type. Tentar de novo sem mudar nada dá no
   * mesmo — é pendência, não falha.
   */
  refused: string[];
  /**
   * **Falha técnica: não há nada a preencher, é para tentar de novo.** Rede
   * fora, 5xx, a API recusando a escrita.
   *
   * Separado de `refused` porque os dois pedem reações opostas e o destino
   * deles na tela é outro: recusa vira aviso (amarelo, `warning` do
   * `AutoSyncResult`) e falha vira erro (vermelho, `error`). Enquanto estavam
   * no mesmo campo, uma queda de rede no envio por tarefa aparecia como aviso
   * amarelo, indistinguível de "preencha o campo" — e antes desta refatoração
   * ela era exceção, portanto erro. Fundi-los foi a regressão; isto a desfaz.
   */
  failed: string[];
}

/**
 * Interface para envio de tarefas a integrações externas.
 * Implementações concretas ficam em infra/integrations/.
 * Novas integrações (Google Sheets, Jira, API própria…) basta
 * implementar esta interface sem alterar nada no domain ou na UI.
 *
 * **O que lança e o que volta no outcome.** `throw` fica reservado ao que
 * impede o envio **inteiro** — integração não configurada, token ausente,
 * nenhuma tarefa válida na carga —, porque aí não há resultado parcial a
 * reportar. Recusa ou falha **de um grupo** volta em `refused`/`failed` e nunca
 * é lançada: lançar apagaria o registro do que já subiu no mesmo envio.
 */
export interface ITaskSender {
  /** Nome legível da integração (ex: "Google Sheets") */
  readonly integrationName: string;
  /** Envia as tarefas para a integração externa */
  send(tasks: Task[]): Promise<TaskSendOutcome>;
}
