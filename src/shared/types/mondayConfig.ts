/**
 * Como o projeto se classifica, pela coluna "Oferta" do Portfólio.
 *
 * Não é rótulo: decide o conjunto de Activity Type válido no board de destino
 * (21 rótulos em cliente, 14 em interno, só `N-A` em comum) e se o Project
 * Stage entra no payload. Rótulo do conjunto errado faz o Monday recusar a
 * mutation inteira, então errar aqui não degrada o envio — derruba.
 */
export type MondayProjectScope = "cliente" | "interno";

/**
 * Os rótulos que o Monday reconhece, lidos do board de Report de Horas.
 *
 * O Report **não é destino de escrita** — criar item ali dispara uma automação
 * que copia o apontamento para o board do projeto e depois não o atualiza nem o
 * exclui. Ele serve de catálogo: é o único lugar onde os rótulos de cliente e os
 * de projeto interno convivem, então uma leitura dele semeia os quatro conjuntos
 * de uma vez.
 */
export interface MondayFieldCatalogs {
  /** Vira Categoria — o envio casa categoria e coluna pelo nome. */
  activityType: string[];
  projectStage: string[];
  nonBillableReason: string[];
  reportType: string[];
}

export const EMPTY_FIELD_CATALOGS: MondayFieldCatalogs = {
  activityType: [],
  projectStage: [],
  nonBillableReason: [],
  reportType: [],
};

/**
 * Ids das colunas do grupo Activities de um board, resolvidos por título no
 * import. São gerados por template (`mmXXXX`) — nunca hardcodar.
 */
export interface MondayActivityColumnIds {
  reportedHours: string;
  activityType: string;
  /**
   * Opcionais porque **nem todo board segue o template inteiro**, e recusar o
   * board por falta delas custava caro: o cliente não virava projeto e as horas
   * não tinham para onde ir. Sem a coluna, o campo simplesmente não entra no
   * payload — nunca mandamos id que o board não tem, o que faria o Monday
   * recusar a escrita inteira (e, pior, responder um "não existe" que o sender
   * lê como item apagado e recria, duplicando a atividade).
   */
  billingType?: string;
  status?: string;
  projectStage?: string;
  /**
   * Coluna `dropdown` do motivo de não faturável. Ausente em 3 dos 4 boards
   * internos — e é a **ausência da coluna** que omite o campo, nunca uma regra
   * "interno não manda motivo": assim o envio continua correto se alguém
   * adicionar a coluna depois.
   */
  nonBillableReason?: string;
  /** Preenchidas com o intervalo trabalhado; ver `buildActivityDateColumns`. */
  startDate?: string;
  endDate?: string;
  person: string;
}

export interface MondayProjectMapping {
  deskclockProjectId: string;
  /** Item do board de Portfólio que originou o projeto. */
  portfolioItemId: string;
  /**
   * Board onde as horas são gravadas, vindo da coluna "ID Quadro Projeto" do
   * item de Portfólio.
   *
   * **Vazio é um estado normal**, não um erro: 14 dos 62 itens do Portfólio
   * ainda não têm a coluna preenchida. O projeto existe, aparece na tela e pode
   * receber tarefas — só as horas não sobem. Recusar o item por causa disso
   * deixaria o cliente sem Project e sem caminho nenhum para lançar aquelas
   * horas; a tela de Integrações oferece o campo para preencher à mão.
   */
  mondayBoardId: string;
  mondayBoardName: string;
  scope: MondayProjectScope;
  /** Grupo "Activities" do board, resolvido pela view homônima no import. */
  activitiesGroupId: string;
  /**
   * Grupo de destino por **Report Type**, resolvido pelo título no import.
   *
   * O Report Type não é coluna no board do projeto — no board de Report ele é o
   * que a automação lê para rotear, e escrevendo direto ele decide o grupo em
   * que a atividade nasce. `Activity` aponta sempre para `activitiesGroupId`; os
   * demais só entram quando o board tem o grupo, e Report Type sem grupo recusa
   * o envio daquele grupo com mensagem — nunca em silêncio, que mandaria a hora
   * para o lugar errado do board.
   */
  reportTypeGroupIds: Record<string, string>;
  columnIds: MondayActivityColumnIds;
  /**
   * Rótulos da coluna Activity Type, cacheados no import. São eles que viram
   * Categoria no DeskClock — e o envio só grava a coluna quando o nome da
   * categoria da tarefa está nesta lista, porque um rótulo inexistente faz o
   * Monday recusar a escrita inteira.
   */
  activityTypeLabels: string[];
  /** Rótulos da coluna Project Stage; semeiam o campo personalizado. */
  projectStageLabels: string[];
  /** Título da coluna Project Stage no board — nomeia o campo criado. */
  projectStageTitle: string;
  /**
   * Rótulos da coluna `dropdown` de motivo de não faturável, lidos com
   * `parseDropdownLabels` — o formato do `dropdown` é outro, e passá-lo pelo
   * parser do `status` devolveria lista vazia sem erro nenhum.
   */
  nonBillableReasonLabels: string[];
  /**
   * Coluna de cronograma **planejado**, base do import de itens de trabalho.
   *
   * Está aqui pelo mesmo motivo dos rótulos acima — sai do schema e quase nunca
   * muda —, e a ausência dela custava caro: o ciclo de importação lia o schema
   * de **todos** os boards mapeados, a cada execução, só para extrair este id. É
   * a leitura mais pesada da integração (todas as colunas e todas as views, com
   * `settings_str`, de boards de 60+ colunas) e o resto do schema já estava
   * cacheado aqui do lado.
   *
   * **Os três estados são distintos, e é isso que faz o cache funcionar:**
   * `undefined` = nunca resolvido (vínculo de uma versão anterior, ou board que
   * não abriu) e **só ele** dispara a leitura do schema; `""` = resolvido, e o
   * board não tem coluna de cronograma; preenchido = o id. Colapsar os dois
   * primeiros num `""` faria o board sem Timeline nunca mais ser relido — ou,
   * na direção oposta, faria todo board pagar a leitura para sempre.
   *
   * Por isso `normalizeProjectMappings` **não** lhe dá default: o default seria
   * exatamente o colapso que se quer evitar.
   */
  timelineColumnId?: string;
  /**
   * Instante da última leitura **bem-sucedida** do schema deste board.
   *
   * É a marca de validade que faltava para o mapeamento poder funcionar como
   * cache: sem ela, a varredura diária não distinguia board novo de board lido há
   * uma hora e relia o schema dos ~46 boards mapeados todo dia — a requisição
   * mais cara da integração. Com ela, o caso comum depois da primeira varredura é
   * **zero** leitura de schema (§ `shouldReadBoardSchema`).
   *
   * **Ausente significa "nunca lido", e é o que dispara a leitura** — mesma
   * disciplina do `timelineColumnId` acima, e por isso `normalizeProjectMappings`
   * também não lhe dá default: vínculo gravado antes deste cache precisa continuar
   * pedindo a leitura.
   *
   * **Só sucesso estampa.** Board fora do template, ou que não voltou na consulta,
   * fica sem marca e é relido na varredura seguinte. Estampar a falha faria duas
   * coisas ruins: a recuperação de um board consertado no Monday levaria uma
   * semana, e o board sumiria da lista de "fora do template" do card de Projetos —
   * que só reporta o que foi lido nesta varredura.
   */
  schemaReadAtISO?: string;
}
