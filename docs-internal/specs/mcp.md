# MCP do DeskClock — plano de execução

> **Este documento é o handoff.** A execução acontece **uma fase por sessão** (sub-agente), como na
> API local. Quem retoma lê a §6 primeiro.
>
> Branch: `feat/mcp`, saída de **`develop`**. Pré-requisito já integrado: `fix/local-api-cors` (6bee523, barreira de
> Host/Origin da API local) — o `/mcp` herda a barreira.

---

## 1. Por que existe

Usar o Claude (ou qualquer cliente MCP) para iniciar, pausar e parar tarefas, planejar, lançar
retroativo e consultar Histórico e totais — em linguagem natural, sem abrir o app.

A API REST local já faz tudo isso pela ponte com o domínio TS (`docs-internal/specs/api-local-nucleo.md`).
O MCP é **adaptador**: nenhuma regra de negócio nova.

## 2. Decisões tomadas — não reabrir sem motivo novo

Todas do usuário, em 2026-09-18.

| Decisão | Escolha | Por quê |
|---|---|---|
| Onde roda | **Dentro do app**, rota `POST /mcp` no axum da API local, mesma porta | O usuário não instala nada além de ligar a API local. Processo Node separado (SDK TS) foi descartado por exigir Node na máquina. |
| Protocolo | Crate **`rmcp`** (SDK oficial em Rust), `StreamableHttpService` aninhado no router | Negocia a versão do protocolo (o transporte HTTP mudou em 2026-07-28 e clientes falam revisões diferentes) e valida Host/Origin. Implementar JSON-RPC à mão viraria manutenção a cada revisão da spec. |
| Onde ficam as regras | Tool em Rust **só mapeia** nome → `op` + params e chama `bridge.request` direto (sem voltar pelo HTTP) | Mesmo princípio da ponte: Rust transporta, o TS decide. |
| Escopo da v1 | **Só leitura e registro** | O app exclui sem confirmação; um erro do modelo apagando ou reescrevendo o passado seria irreversível. **Revisto em 2026-10-22** (§7): tudo que a UI faz deve existir no MCP; o risco da exclusão se trata com `destructiveHint` e descrição, não com ausência. |
| "Criar tarefa" | Três tools: iniciar agora, planejar, lançar retroativo | São três intenções distintas; uma tool com modo confundiria o modelo. |

## 3. Tools da v1

| Tool | `op` da ponte | Observação |
|---|---|---|
| `get_status` | `status.get` | Inclui **data de hoje, dia da semana e fuso** — o modelo não sabe que dia é "ontem" |
| `list_catalog` | `workspaces.list`, `projects.list`, `categories.list` | Uma chamada para o modelo descobrir nomes válidos |
| `start_task` | `tasks.start` | Descrição avisa que troca a tarefa em execução |
| `pause_task` · `resume_task` | `tasks.pause` · `tasks.resume` | |
| `stop_task` | `tasks.stop` | `completed?` |
| `start_planned_task` | `tasks.startPlanned` | 409 com tarefa ativa, como na API |
| `plan_task` | `plannedTasks.create` | |
| `log_past_task` | `history.create` | Retroativo avulso |
| `log_planned_task` | `plannedTasks.launchRetroactive` | Retroativo de uma planejada: conclui-a na data e copia os `customValues`. Aprovada pelo usuário na Fase 2 |
| `list_planned_tasks` | `plannedTasks.list` | `date` ou `from`/`to`. Entra na Fase 1: é de onde vem o `id` do `start_planned_task` |
| `list_tasks` | `history.list` | Filtros do Histórico |
| `get_totals` | `totals.period` | Totais de um período |
| `get_week_totals` | `totals.week` | Total da semana que contém `date`. Separada da `get_totals` na Fase 2: tool só mapeia, uma `op` cada |
| `list_custom_fields` | `customFields.list` | O `id` do campo é a chave de `customValues`; opção de `select` tem `id` e `label` |
| `create_custom_field` | `customFields.create` | `type` enum inline; `optionLabels` obrigatório só em `select` |
| `update_custom_field` | `customFields.update` | `optionLabels` é a lista final; opção existente casa pelo rótulo e mantém o id |
| `delete_custom_field` | `customFields.delete` | `destructiveHint: true`: apaga o valor em todas as tarefas; arquivar é a alternativa |
| `update_running_task` | `tasks.updateActive` | Edição parcial da tarefa ativa; nome, projeto, categoria, billable e valores vão também à planejada de origem (Fase A) |
| `update_task` | `history.update` | Edição parcial de um registro concluído (`id` de `list_tasks`); o billable vale para o grupo (Fase A) |
| `update_planned_task` | `plannedTasks.patch` | Edição parcial de uma planejada: ausente preserva, `null` limpa. O `plannedTasks.update` (PUT) segue excluído (Fase A) |
| `complete_planned_task` · `uncomplete_planned_task` | `plannedTasks.complete` · `plannedTasks.uncomplete` | Marca/desmarca um dia sem registrar tempo; `date` opcional (hoje) só no `complete` (Fase A) |
| `duplicate_planned_task` | `plannedTasks.duplicate` | Cópia sem as conclusões (Fase A) |
| `delete_planned_task` | `plannedTasks.delete` | `destructiveHint: true`: imediata, sem desfazer; só quando o usuário pediu (Fase A) |
| `cancel_task` | `tasks.cancel` | `destructiveHint: true`: descarta a tarefa ativa sem registrar; para guardar o tempo, `stop_task` (Fase A) |
| `delete_task` · `delete_tasks` | `history.delete` · `history.deleteMany` | `destructiveHint: true`; o lote é tudo ou nada. Sem o desfazer da tela (Fase B) |
| `set_task_billable` | `history.setBillable` | Vale para o grupo do registro, como o indicador da lista (Fase B) |
| `merge_tasks` | `history.merge` | `destructiveHint: true`: funde o grupo e apaga os originais; só registros de hoje (Fase B) |
| `move_tasks_to_workspace` | `history.move` | `mode` `move`/`copy`; `project`/`category` com `kind` `match`/`create`/`unset` (Fase B) |
| `create_project` · `update_project` · `delete_project` | `projects.create` · `projects.update` · `projects.delete` | `update` só renomeia; `delete` com `destructiveHint: true` (Fase B) |
| `import_projects` · `delete_projects` | `projects.import` · `projects.deleteMany` | Um nome por linha, repetido é pulado; exclusão em lote destrutiva, tudo ou nada (Fase B) |
| `create_category` · `update_category` · `delete_category` | `categories.create` · `categories.update` · `categories.delete` | `defaultBillable` padrão `true` na criação, preservado na edição; `delete` destrutiva (Fase B) |
| `import_categories` · `delete_categories` | `categories.import` · `categories.deleteMany` | `!` no início da linha = non-billable; exclusão em lote destrutiva (Fase B) |
| `list_project_categories` · `set_project_categories` | `projectCategories.list` · `projectCategories.set` | Lista vazia = o projeto oferece todas; o `set` substitui a seleção (Fase B) |
| `create_workspace` · `update_workspace` | `workspaces.create` · `workspaces.update` | `color` = slot da paleta, validado no TS (Fase B) |
| `delete_workspace` | `workspaces.delete` | `destructiveHint: true`; `mode` `move`/`delete` obrigatório, a escolha do modal da tela (Fase B) |
| `set_active_workspace` | `workspaces.setActive` | Com tarefa ativa erra (409) e não para a tarefa: o modelo pergunta e chama `stop_task`/`cancel_task` (Fase B) |

Ainda sem tool: só as que ficam de fora com motivo próprio (`tasks.toggle`, `history.get`, `plannedTasks.get`,
`workspaces.getActive`, `plannedTasks.update`). O que falta para a paridade não tem `op` na ponte (§7.2).

**Desenho das tools:** nome de intenção (`log_past_task`, não `post_tasks`); descrição diz *quando* usar e
o formato de data/hora; projeto e categoria por **nome** (a API já resolve dentro do workspace e devolve
409 se não existir); `workspaceId` opcional como na API. Erro da ponte (400/404/409/503/504) vira resultado
de tool com `isError: true` e a mensagem pt-BR do TS — o modelo lê e corrige, em vez de a chamada falhar no
protocolo.

## 4. A trava de cobertura — endpoint novo não fica esquecido

`HANDLERS` em `src/presentation/localApi/dispatch.ts` é a lista única de `op`. O manifesto
`src-tauri/mcp-ops.json` classifica **cada** `op`:

```json
{
  "exposed":  { "tasks.start": "start_task", "...": "..." },
  "excluded": { "history.delete": "destrutiva, fora da v1", "...": "..." }
}
```

- **Vitest** (`src/tests/presentation/localApi/mcpOps.test.ts`): toda chave de `HANDLERS` está em
  `exposed` ou `excluded`, nenhuma nas duas, e nenhuma `op` do manifesto fora de `HANDLERS`.
- **`cargo test`**: toda `op` que uma tool chama está em `exposed`, e toda entrada de `exposed` tem tool.

Endpoint novo ⇒ teste falha com o nome da `op` ⇒ decide-se na hora entre virar tool ou ficar de fora,
com motivo escrito.

## 5. Fases

Ordem obrigatória: 0 → 1 → 2 → 3.

### Fase 0 · Esqueleto
`rmcp` no `Cargo.toml`, módulo `src-tauri/src/mcp/`, `/mcp` aninhado em `build_router` (atrás da barreira
de Host/Origin), `get_status` e `list_catalog`, manifesto + as duas travas. `cargo test`: tools listadas,
Host de fora recusado, ponte não pronta (503) vira `isError`. Verificação: `claude mcp add --transport http
deskclock-dev http://127.0.0.1:27421/mcp` e pedir o status.

### Fase 1 · Tarefa em execução
`start_task`, `pause_task`, `resume_task`, `stop_task`, `start_planned_task` e `list_planned_tasks` —
esta veio da Fase 2 porque sem ela o modelo não tem de onde tirar o `id` que o `start_planned_task` exige.

### Fase 2 · Criar e consultar
`plan_task`, `log_past_task`, `log_planned_task`, `list_tasks`, `get_totals`, `get_week_totals`.

### Fase 3 · Fechamento
Bloco "Conectar ao Claude" em Configurações > API (`ApiTab.tsx`) com o comando `claude mcp add` pronto na
porta atual e botão Copiar; seção no manual (`docs/index.html`); `docs-internal/integracoes/` ou
equivalente citando esta spec.

### Testes (toda fase)
`cargo test` do mapeamento (tool → `op` + params) e da conversão de erro. As regras já são cobertas pelos
testes dos handlers TS. Verificação manual por cliente MCP real na porta 27421.

## 6. Estado

| Fase | Estado |
|---|---|
| 0 | commitada; revisada e verificada por curl JSON-RPC no app de dev (27421) |
| 1 | commitada; revisada e verificada por curl JSON-RPC no app de dev (27421), as 8 tools |
| 2 | commitada; revisada e verificada por curl JSON-RPC no app de dev (27421), as 14 tools |
| 3 | commitada; revisada; falta a verificação visual (2 modos × 4 acentos) |

### Decisões da Fase 0 que a spec não fixava

- **`rmcp` 3.4.0** (`server`, `macros`, `transport-streamable-http-server`). Exige Rust 1.88: o
  `rust-version` do `Cargo.toml` subiu de 1.77.2 para 1.88. Com o MSRV novo o clippy passou a pedir
  `is_none_or` no `guard.rs` — trocado, mesmo comportamento.
- **Sem sessão, resposta JSON pura.** `legacy_session_mode(false)` + `json_response(true)` +
  `NeverSessionManager`. Toda tool é uma ida e volta à ponte, então não há estado por cliente; e
  parar/iniciar a API pelas Configurações não deixa cliente com sessão morta. Clientes da revisão
  2026-07-28 (sem `initialize`) e das anteriores funcionam — há teste para os dois.
- **Montagem:** `route_service("/mcp", …)` em `build_router`, antes do `.layer(reject_foreign_origin)`,
  que portanto envolve o `/mcp`. A validação de Host do próprio rmcp continua ligada (padrão:
  `localhost`, `127.0.0.1`, `::1`); a de Origin do rmcp fica desligada porque a barreira já cobre.
- **Data de hoje vem do TS:** o `getStatus` devolve `clock: { date: "YYYY-MM-DD", weekday: "Friday",
  utcOffset: "-03:00" }` (`src/shared/utils/localClock.ts`), calculado do mesmo `todayISO()`/`nowISO()`
  que produz os totais de `today`. Carimbar com `chrono::Local` no Rust, depois da resposta, podia
  discordar dos totais perto da meia-noite — "hoje" já tem dono no TS. `get_status` é repasse puro.
  Efeito colateral aceito: `GET /status` da REST também ganhou `clock` (aditivo; schema `LocalClock`
  no Swagger). O fuso vai como offset, sem nome IANA.
- **Descrições das tools em inglês** (consumidas pelo modelo); as mensagens de erro continuam as
  pt-BR do TS. Tools marcadas com `readOnlyHint: true` e `openWorldHint: false`.
- **Resultado:** sucesso vai como `structuredContent` + o mesmo JSON em texto. Erro da ponte
  (status ≥ 400) e `BridgeError` viram `isError: true` com a mensagem; as mensagens de
  `BridgeError` saíram de `to_http` para `BridgeError::message()`, compartilhadas por REST e MCP.
- **`list_catalog`** chama as três `op` em sequência com o mesmo `workspaceId` (o
  `workspaces.list` o ignora) e para no primeiro erro.
- **Tabela única:** `src-tauri/src/mcp/ops.rs` (`TOOL_OPS`, com a chave de saída de cada `op`
  explícita); as tools leem as `op` dela (`ops_of`), e o `cargo test` a confere contra `mcp-ops.json`. A lista de ops do TS é exportada
  como `LOCAL_API_OPS` em `dispatch.ts`.
- **Sem autenticação além de loopback + Host + Origin**, como a API REST: a partir da Fase 1,
  qualquer processo local pode iniciar e parar tarefas pelo `/mcp`. Aceito, coerente com a REST.
- **`plannedTasks.launchRetroactive` é candidata a tool da Fase 2**, pendente de decisão do
  usuário: ao contrário do `history.create` (`log_past_task`), ela conclui a planejada na data e
  copia os `customValues` (Project Stage do Monday). Por ora está em `excluded`. *(Resolvida na
  Fase 2: virou `log_planned_task`.)*

### Decisões da Fase 1 que a spec não fixava

- **Anotações.** As cinco de escrita: `readOnlyHint: false` e `destructiveHint: false` — o único
  apagamento é o descarte de tarefa com menos de 1 minuto, que o próprio usuário ligou nas
  Configurações (e o arredondamento, também opcional, reescreve duração e fim); nada que o usuário
  escolheu guardar se perde.
  - `openWorldHint: true` em `start_task` e `stop_task`: parar como concluída (o `stop_task` com
    `completed: true`, e a troca do `start_task`) dispara o envio automático por tarefa às
    integrações configuradas para isso (Monday, Clockify, Sheets — `AutoSyncRunner.runPerTask`,
    `isPerTaskEnabled`). As demais, `false`.
  - `idempotentHint` segue a definição do MCP — repetir com os mesmos argumentos não tem efeito
    **adicional** —, não o "responde igual". `pause_task`, `resume_task`, `stop_task` e
    `start_planned_task` → `true`: a segunda chamada só erra (404 sem tarefa em
    execução/pausada/ativa; 409 com tarefa ativa) e não muda nada — um retry depois de timeout não
    faz estrago. `start_task` → `false`: repetir troca de novo, para a tarefa recém-criada e abre outra.
  - `list_planned_tasks`: `readOnlyHint: true`, como as da Fase 0.
- **`billable` obrigatório no `start_task`**, como no DTO do `POST /tasks/start`. O TS cai em `true`
  quando falta e **não** herda o `defaultBillable` da categoria; obrigar faz o modelo escolher, e a
  descrição do campo manda usar o `defaultBillable` do `list_catalog` quando o usuário não disser.
- **`customValues` fora do `start_task` (histórico, resolvido na Fase 5).** O TS aceita, mas a chave é o
  id do campo personalizado, e `customFields.list` estava fora da v1 — o modelo não tinha de onde tirar
  o id. Com `list_custom_fields` (Fase 4), o `customValues` entrou no `TaskFields`.
- **Corpo repassado como a REST repassa.** `start_task` e `stop_task` mandam `{ body: {...} }` só com
  os campos enviados (omitido fica ausente; o TS trata ausente e `null` igual). `stop_task` sem
  argumentos manda `{ body: {} }` onde a REST manda `{ body: null }` — o TS faz `params.body ?? {}`,
  mesmo efeito. `list_planned_tasks` manda as quatro chaves (`date`, `from`, `to`, `workspaceId`),
  nulas quando omitidas, como o `GET /planned-tasks`; a validação (`date` com `from`/`to` → 400,
  formato, `from > to`) fica no TS.
- **Resultados embrulhados onde o corpo não é objeto.** O `structuredContent` do MCP é objeto:
  `list_planned_tasks` devolve `{ plannedTasks: [...] }`, e `stop_task` devolve `{ task: ... }` —
  `task: null` quando a tarefa foi descartada (o TS responde 204 sem corpo). As demais devolvem a
  tarefa como veio. Na tabela `TOOL_OPS` isso é o `under(chave, op)` que a Fase 0 já tinha.
- **Argumento inválido** (ex.: `start_planned_task` sem `id`): o rmcp 3.4 devolve resultado com
  `isError: true` e ``failed to deserialize parameters: missing field `id` `` — não erro JSON-RPC — e a
  ponte não é chamada (idem `start_task` sem `billable`). Mensagem em inglês, do rmcp; aceito.
  `tools/call` sem o campo `arguments` funciona: o rmcp o troca por `{}`.
- **O que a descrição do `stop_task` promete**, lido do código (`usePostStopLogic`): o registro é
  sempre gravado; descarte abaixo de 1 minuto e arredondamento só se ligados nas Configurações;
  `completed: true` (padrão) conclui a planejada de origem no dia e, em segundo plano, envia a
  tarefa às integrações configuradas para envio automático por tarefa, se houver; `false` grava o tempo sem concluir a planejada e sem envio.

### Decisões da Fase 2 que a spec não fixava

- **Seis tools, uma `op` cada.** `get_totals` (`totals.period`) e `get_week_totals` (`totals.week`)
  em vez de uma tool que escolhe a `op` pelos argumentos — a tool só mapeia. `log_planned_task`
  (`plannedTasks.launchRetroactive`) aprovada pelo usuário; a descrição do `log_past_task` manda
  usá-la quando o trabalho é de uma planejada.
- **Formatos de data e hora**, lidos do TS:
  - `log_past_task` e `log_planned_task` (planejada sem horário): `startTime`/`endTime` passam pelo
    `parseInstant` (`localApi/taskInput.ts`) — exige `T` e o `Date.parse` do JS, normaliza em UTC.
    Com offset vale o offset; **sem offset o JS lê como hora local** da máquina (a do usuário);
    `Z` é UTC; só a data é 400. As descrições pedem o `utcOffset` do `get_status` e avisam da leitura
    local. A resposta traz `startTime`/`endTime` em UTC.
  - Mínimo de 1 minuto: do domínio (`createRetroactiveTask`, `"A duração mínima é 1 minuto."`),
    vale para os dois. Fim antes do início cai na mesma regra (duração negativa). O TS não recusa
    instante no futuro no `history.create` — a descrição não promete nada sobre isso.
  - `log_planned_task`: `date` YYYY-MM-DD, ausente = hoje, futura → 400; fora da agenda do dia ou já
    concluída nele → 409. Planejada **com** `startTime`/`endTime` (HH:MM) usa o horário dela e
    recusa os do corpo (400); **sem** horário exige os dois, com o início no dia `date`.
  - `plan_task`: datas YYYY-MM-DD e horas do dia `HH:MM` locais; `recurringDays` 0 = domingo;
    `periodEnd` ausente = período sem fim (o `findForDate` aceita `period_end IS NULL`).
  - `list_tasks` e `get_totals`: dias locais, `from` ausente = hoje, `to` ausente = `from`
    (`periodRange`). `get_week_totals`: semana do `weekStartsOn` das Configurações, `date` ausente =
    hoje; a descrição avisa que não é necessariamente segunda.
- **`openWorldHint: false` nas três de escrita.** O envio automático por tarefa
  (`AutoSyncRunner.runPerTask`) só é chamado em `usePostStopLogic` (parar tarefa). `history.create`
  e `plannedTasks.launchRetroactive` terminam em `notifyTasksChanged` (+ `notifyPlannedTasksChanged`
  no lançamento), que só emitem `TASKS_CHANGED`/`PLANNED_TASKS_CHANGED` — os ouvintes (`useTasks`,
  `useHistory`, `useCompletedTasksForDate`, `RetroactivePage`, `usePlannedTasks`…) só recarregam
  listas. `plannedTasks.create` só emite `PLANNED_TASKS_CHANGED`. O envio diário (`runDaily`), se o
  usuário o ligou, depois inclui esses registros como qualquer outro do Histórico — igual ao
  Lançamento Manual da tela, e não é efeito da chamada.
- **`idempotentHint`** pelo critério da Fase 1. `plan_task` e `log_past_task` → `false`: repetir
  cria duplicata. `log_planned_task` → `true`: repetir com os mesmos argumentos só erra (409 "já foi
  concluída" na data) e não grava nada — um retry depois de timeout não duplica o registro.
- **`billable` obrigatório no `plan_task`**, como no `start_task`: o TS cai em `true` quando falta
  (`body.billable ?? true`) e não herda o `defaultBillable` da categoria. No `log_past_task` o
  próprio TS já exige (`requireBoolean`).
- **`scheduleType` como enum** no esquema (`specific_date`, `recurring`, `period`), inline (sem
  `$ref`). Valor fora dele é recusado pelo rmcp (`isError`, em inglês) antes da ponte. O resto da
  coerência do agendamento **não é validado no TS** (`specific_date` sem `scheduleDate`, `HH:MM`
  malformado, só um dos dois horários): a tool não inventa a regra; a descrição de cada campo diz
  quando ele é obrigatório.
- **Campos deixados de fora.** `customValues` em `plan_task` e `log_past_task` (na época, mesmo motivo do
  `start_task`: sem `customFields.list` o modelo não tinha o id do campo; resolvido na Fase 5 —
  `log_planned_task` continua sem o campo porque copia os valores da planejada). `actions` (links/arquivos abertos
  pelo card) e `sortOrder` (a UI não reordena; tudo grava 0) no `plan_task`. `list_tasks` filtra
  projeto e categoria **só por id**, como o `GET /tasks` (`resolveProjectId(…, id, null)`); a
  descrição diz para pegar o id no `list_catalog`.
- **Params repassados como a REST.** `plan_task`/`log_past_task` mandam `{ body: {...} }` só com os
  campos enviados. `log_planned_task` manda `{ id, body }` com o corpo só com o que veio — `{}` quando
  só há `id`, onde a REST manda `body: null`; o TS faz `params.body ?? {}`, mesmo efeito.
  `list_tasks` manda as sete chaves do `GET /tasks`, nulas quando omitidas, e `billable` **em texto**
  (`"true"`/`"false"`), como a query string chega ao `billableFilter`. `get_totals` e
  `get_week_totals` mandam as chaves de `PeriodQuery`/`WeekQuery`.
- **`get_week_totals` não é `get_totals` da semana** (achado da revisão). O `getWeekTotal` soma o
  `findByDateRange` **sem filtro de status**: a tarefa ativa (em execução ou pausada) entra com o
  `durationSeconds` acumulado até a última pausa, e o dia dela conta em `daysWorked`. O
  `totals.period` usa `searchTasks`, só concluídas. Com tarefa ativa, as duas tools divergem para os
  mesmos dias — a descrição do `get_week_totals` diz isso; a regra é a da tela de Tarefas e não muda.
- **Campos comuns num struct só.** Projeto (id/nome), categoria (id/nome), `billable` e `workspaceId`
  estão em `TaskFields`, com `#[serde(flatten)]` em `start_task`, `plan_task` e `log_past_task`; o
  corpo do `log_planned_task` é `LogPlannedTaskBody`, também achatado ao lado do `id`. O schemars
  gera o esquema plano (mesmas propriedades e `required`, sem `$ref`/`allOf`) — há teste para isso.
- **Resultados.** `list_tasks` embrulha em `{ tasks: [...] }` (da mais recente para a mais antiga,
  só concluídas); as demais devolvem o corpo como veio (objeto).

### Decisões da Fase 3 que a spec não fixava

- **Cartão próprio, abaixo do "API local"** (`McpConnectCard.tsx`, na pasta das abas), montado só com
  a API rodando e sem operação em curso (`running && port !== null && !localApiLoading`), com a porta
  do **status**, não a do campo — a digitada ainda não vale até o servidor reiniciar nela.
- **Host `127.0.0.1` no comando, não `localhost`** (`buildMcpAddCommand`, `shared/utils/mcpCommand.ts`):
  a API só escuta em IPv4 loopback, e `localhost` pode resolver primeiro para `::1`.
- **Mecanismo de cópia: `useCopyFeedback`** (`presentation/hooks/`). O `ExportModal` tinha o mesmo
  `writeText` + `setCopied` + `setTimeout(2000)` duas vezes; virou o hook, usado pelos dois (o timer
  agora é limpo ao desmontar e reinicia a cada cópia). O visual é o do botão Copiar da exportação
  (`Button secondary`, `Copy`→`Check`, "Copiar"→"Copiado!"). O "Copiado!" dos dois usa `text-success!`
  — a exportação usava `text-billable!`, trocado: "deu certo" é `success`, não faturamento (mesma
  cor nos dois modos, sem diferença visual). Falha de escrita vira toast de
  erro, como no compartilhar tarefa. O compartilhar tarefa (`PlannedTaskItem`) continua com o toast
  de sucesso: é linha de lista, sem botão onde trocar o rótulo.
- **Manual:** `<h2 id="api-mcp">` dentro de `#api`, antes de "API ou deep link?" (que ganhou a linha
  MCP), e a aba API das Configurações no manual aponta para ele. A sidebar do manual não lista
  subseções, então não há link novo lá.
- **Índice:** linha nova na §5 do `CLAUDE.md` e aviso no topo de `api-local-nucleo.md` sobre
  classificar `op` nova no `mcp-ops.json`. `docs-internal/integracoes/` ficou de fora — é o contrato
  das integrações externas (Monday, Clockify, Google), e a API local não é uma.

### Fase 4 (custom fields)

- **Quatro tools, uma `op` cada** (`list/create/update/delete_custom_field`); `list_catalog` não
  inclui os campos (tool separada), só cita `list_custom_fields` na descrição.
- **Anotações.** `list`: `readOnlyHint`. `create`: `destructiveHint: false`, `idempotentHint: false`
  (repetir cria outro, ou erra 409 pelo rótulo). `update`: `destructiveHint: false`,
  `idempotentHint: true`. Todas `openWorldHint: false` (só emitem o evento local de campos).
- **`delete_custom_field` é a primeira tool destrutiva do MCP**: `destructiveHint: true`. A
  exclusão apaga o valor do campo em todas as tarefas do Histórico e do Planejamento, e a
  descrição manda chamá-la só se o usuário pediu a exclusão e oferece o arquivamento
  (`update_custom_field` com `archived: true`) como alternativa reversível. `idempotentHint: true`
  pela definição do MCP: a segunda chamada só erra (404) e não muda nada.
- **Resultados.** `list` embrulha em `{ customFields: [...] }`. O `delete` responde 204 sem corpo e
  a tool devolve `{}` (o `structuredContent` tem de ser objeto).
- **`update`** manda `{ id, body }` com só os campos enviados (`{}` se só há `id`); o tipo do
  campo não muda.
- `customValues` continuava fora do `start_task`/`plan_task`/`log_past_task` — mudou na Fase 5.

### Fase 5 (valores personalizados nas tarefas)

- **Na criação.** `custom_values: Option<HashMap<String,String>>` no `TaskFields`, logo em
  `start_task`, `plan_task` e `log_past_task`; o esquema continua plano (`additionalProperties` inline,
  sem `$ref`; coberto por `esquemas_das_tools_que_criam_tarefa_saem_planos`). Chave = id de
  `list_custom_fields`; valor sempre texto (select aceita rótulo ou id, checkbox `true`/`Sim`; a
  normalização é a da API). **Não** entrou no `log_planned_task`: ele copia da planejada.
- **Edição: tools estreitas.** `tasks.updateActive` e `history.update` aceitam nome, projeto,
  categoria, billable e horário, mas as tools mandam **só** `customValues`: uma tool por `op`, com o
  raio pequeno (o modelo não reescreve nome, projeto ou horário por engano). Pedido do usuário, por
  paridade com a UI.
- **Semântica de substituição:** o mapa enviado **substitui o mapa inteiro** (é o que a API faz). Para
  mudar um campo, ler os valores atuais (`get_status`, `list_tasks`) e reenviar o mapa completo; `{}`
  limpa tudo. Dito na descrição das tools. `list_tasks`, `list_planned_tasks` e `get_status` já devolvem
  `customValues` (via `toTaskDto`/`toPlannedTaskDto`).
- **Anotações:** `readOnly false`, `destructive false`, `idempotent true`, `openWorld false` nas duas.
  O envio por tarefa às integrações só roda no `stop` (`usePostStopLogic`); `updateActiveTask` e
  `editCompletedTask` só atualizam o banco e emitem eventos locais. Efeito colateral documentado na
  descrição: `set_running_task_custom_values` leva os valores também à planejada de origem
  (`applyRunningTaskEditToPlanned`).
- **Resultado:** `pass_through` — o corpo é o `TaskDto`.
- **`set_planned_task_custom_values` (histórico, resolvido em 2026-10-22).** Ficou de fora de início:
  `plannedTasks.update` não fazia edição parcial — exige `name` e `scheduleType` e regrava `scheduleDate`,
  `recurringDays`, `periodStart/End` e `actions` com `null`/`[]` quando ausentes —, então uma tool que mandasse só
  `customValues` daria erro, e uma que montasse o corpo completo inventaria regra no adaptador. Decisão do usuário:
  nova op `plannedTasks.patch` (`PATCH /planned-tasks/{id}`, edição parcial; ver `api-local-nucleo.md` §4), com o
  `PUT` intacto. A tool chama o `patch` com `{ id, body: { customValues } }`, mesmo desenho, args (`id` +
  `SetRunningTaskCustomValuesArgs` achatado) e anotações das outras duas; `plannedTasks.update` segue em `excluded`
  como "edição completa; o MCP usa plannedTasks.patch".
- **Substituídas na Fase A (2026-10-22)** pelas largas `update_running_task`, `update_task` e
  `update_planned_task`, nas mesmas `op`: com as duas famílias juntas, o modelo teria duas tools para a mesma
  edição de valores. Decisão do usuário.

## 7. Paridade com a UI

Decisão do usuário, 2026-10-22: **tudo que a interface faz precisa ser possível pela API e pelo MCP.** "Fora
da v1" no `mcp-ops.json` é dívida, não limite. Varredura do mesmo dia — use cases chamados pela
`presentation/` e docs de `telas/` contra as `op` da ponte e as tools.

### 7.1 Camada 1 — a ponte já faz, falta a tool

| Fase | O que entra |
|---|---|
| **A** | Edição completa: `update_planned_task` (`plannedTasks.patch`), `update_running_task` (`tasks.updateActive`), `update_task` (`history.update`) — **substituem** as três `set_*_custom_values` da Fase 5 (estreitas, agora redundantes). `actions` no `plan_task`. Planejamento: concluir, desmarcar, duplicar, excluir (`plannedTasks.complete/uncomplete/duplicate/delete`). `cancel_task` (`tasks.cancel`) |
| **B** | Histórico: excluir um e vários, billable, unificar, mover (`history.delete/deleteMany/setBillable/merge/move`). Catálogo: projetos e categorias (CRUD, import, exclusão em massa) e `projectCategories.*`. Workspaces: CRUD e trocar o ativo |

Continuam fora, com motivo próprio: `tasks.toggle` (start/pause/resume cobrem), `history.get`, `plannedTasks.get`,
`workspaces.getActive` (as listas já devolvem), `plannedTasks.update` (o MCP usa o `patch`).

### 7.2 Camada 2 — não há op na ponte (REST e MCP)

| Fase | O que entra | Na UI |
|---|---|---|
| **C** | Enviar tarefas a Sheets, Clockify e Monday | `SendTasks`, `TaskSendModal` |
| **C** | Exportação: CRUD de perfis e gerar CSV/JSON com um perfil | `exportProfiles/*`, `ExportModal` |
| **D** | Resumo do dia por IA (ler e gerar) | `SummarizeWorkdays` |
| **D** | Importar da Agenda, de tickets do Zendesk e do Monday (itens, projetos, categorias, catálogos) | `ImportCalendarEvents`, `ImportTickets`, `monday/import*` |
| **D** | Ler lançamentos do Clockify e do Monday | `ClockifyEntriesModal`, `MondayEntriesModal` |
| **D** | Backup no Drive: rodar agora e status | `IDriveBackupRunner` |
| **D** | Compartilhar tarefa: gerar o `deskclock://` e abrir um link | `sharePayload`, `PasteDeepLinkModal` |
| **D** | Configurações (Geral, Overlay, Acessibilidade, Atalhos, fim de semana) — porta estreita por grupo, não key-value genérico | `IConfigRepository` |

**Decisões da Fase C** (usuário, 2026-10-22):

- **Envio = prévia + envio**, como o modal. Uma op lista os grupos do período por integração, com o estado de cada um
  (já enviado, inválido e o motivo, pendente). A outra envia os ids escolhidos e devolve enviados, pulados, recusados
  e falhos (`TaskSendOutcome`). A orquestração que hoje mora nos modais (`TaskSendModal` + os três adaptadores) sai
  para um módulo único que o modal e a ponte usam, para não haver segunda cópia da regra.
- **Exportação devolve o conteúdo** (texto CSV/JSON e um nome de arquivo sugerido), gerado com um perfil, mais o CRUD
  de perfis. Salvar e copiar ficam com quem chama, e a API não escreve em disco.
- Execução em duas etapas: **C1** envio e **C2** exportação.

**Fora de propósito:** conectar integrações (OAuth e chaves exigem navegador e segredo; segredo pela API local
amplia a superfície), desfazer (`Restore*`, gesto sobre o que acabou de acontecer na tela) e executar a ação ⚡
(abre URL/arquivo na máquina). **Sem op própria:** editar grupo do Histórico (`UpdateTaskGroup`) e excluir várias
planejadas — N chamadas resolvem.

### 7.3 Estado

| Fase | Estado |
|---|---|
| A | implementada; falta revisão e verificação no app de dev |
| B | implementada; falta verificação no app de dev |
| C · D | pendentes |

### Decisões da Fase A que a spec não fixava

- **Ausente × `null`: `Patch<T>` = `Option<Option<T>>`** (`tools.rs`), com `deserialize_with = "present"` — o
  serde sozinho lê `null` como ausente — e `skip_serializing_if = "Option::is_none"`. Ausente não vai ao corpo,
  `null` vai como `null`, valor vai como veio: o mesmo repasse cru da REST. Vale para **todo** campo opcional das três
  edições, inclusive onde o TS recusa `null` (`name` e `scheduleType` da planejada, `startTime`/`endTime` do
  registro, `startTime` da ativa) ou o trata como ausente (`billable`): a regra fica no TS. `#[schemars(with =
  "Option<T>")]` dá ao esquema `type: [T, "null"]`, plano. Teste: `update_planned_task_distingue_ausente_de_null`.
- **Campos comuns em `EditFields`** (projeto id/nome, categoria id/nome, `billable`, `customValues`), achatado nas
  três; `name` e horários ficam em cada struct porque a regra muda (a planejada não aceita nome vazio, a tarefa
  aceita e o apaga). `workspaceId` e `sortOrder` não entram: o `patch` não muda workspace e a UI não reordena.
- **`actions`** no `plan_task` e no `update_planned_task`: `{ type: open_url | open_file, value, label? }`, enum e
  item inline. Valor fora do enum é recusado pelo rmcp antes da ponte.
- **Anotações.** Edições, `complete` e `uncomplete`: `idempotentHint: true` (o repositório não duplica a data
  concluída nem reclama da ausente). `duplicate`: `false`. `delete_planned_task` e `cancel_task`:
  `destructiveHint: true`, `idempotentHint: true` (a segunda só erra, 404). Todas `openWorldHint: false`: nenhuma
  passa pelo `usePostStopLogic`.
- **Params como a REST.** `complete` manda `{ id, body }` com `date` só se veio (`{}` = hoje); `uncomplete` manda
  `{ id, date }`, `date` obrigatória, como no path `DELETE /planned-tasks/{id}/complete/{date}`. `delete` e
  `cancel` respondem 204 e a tool devolve `{}`.
- **Achado no TS, corrigido na mesma fase:** o `patchPlannedTaskHandler` exigia `periodEnd` em `period` sempre que o
  corpo tocava no agendamento, mas o formulário e o `plan_task` aceitam período sem fim — planejada de período aberto
  não tinha as datas editáveis. Agora `periodEnd` ausente ou `null` é período sem fim (`OPTIONAL_SCHEDULE_FIELDS`), e o
  teste que travava a recusa virou o contrário.

### Decisões da Fase B que a spec não fixava

- **21 tools, uma `op` cada**, e a lista bate com as 21 `op` que estavam em `excluded` como "Fase B" — nenhuma
  esquecida. `list_project_categories` é tool própria (uma `op` por tool), e a descrição do `list_catalog` a cita.
- **Sem `Patch<T>`.** Nenhum handler desta fase distingue ausente de `null`: `defaultBillable` da categoria e `color`
  do workspace passam por `??` (ou `color()`, que trata os dois como ausente) e preservam; `toWorkspaceId` ausente ou
  nulo dá o mesmo 400. Opcional é `Option<T>` simples, omitido do corpo.
- **Params como a REST.** `id` do path fora do corpo; nas rotas de catálogo com `?workspaceId=` (`update`/`delete` de
  projeto e categoria, `projectCategories.*`) o `workspaceId` vai no topo e **sempre presente**, nulo quando omitido,
  como o `scoped_params`; nas que levam o workspace no corpo (`create`, `import`, `deleteMany`) ele vai no corpo, só se
  veio. `set_active_workspace` manda `{ body: { id } }`, como o `PUT /workspaces/active`. Os 204 (as sete exclusões)
  devolvem `{}`; `projectCategories.list/set` respondem lista e saem em `{ projectCategories: [...] }`.
- **`CatalogResolution` como struct, não enum com tag.** `{ kind: match|create|unset, targetId?, name? }`, com `kind`
  enum inline: o esquema sai plano (sem `oneOf`), e o casamento `kind` ↔ campo (`match` sem `targetId`, `create` sem
  `name`) fica no `checkResolution` do TS, que já o valida. `mode` do move e do delete de workspace são enums inline;
  valor fora deles é recusado pelo rmcp antes da ponte.
- **`color` do workspace é texto**, com os oito slots listados na descrição. Enum em Rust copiaria `WORKSPACE_COLORS`
  e divergiria dele calado; o TS já recusa com 400 e a mensagem lista a paleta.
- **`importProjects`/`importCategories` recebem `text`**, como a REST e o textarea da tela; juntar uma lista em linhas
  seria regra no adaptador.
- **Anotações.** `destructiveHint: true` nas sete exclusões (uma e em lote), em `merge_tasks` (apaga os originais) e em
  `delete_workspace`; a descrição de cada uma manda chamar só a pedido do usuário e diz que é imediata e sem desfazer —
  a do `delete_task`/`delete_tasks` diz "ao contrário da tela", que desfaz pelo toast. `delete_workspace` manda
  perguntar o destino dos dados quando o usuário não disse, como o modal exige.
  - `move_tasks_to_workspace` → `destructiveHint: false`: não apaga nada; reatribui (ou copia), e o `create` só
    acrescenta ao catálogo do destino. Trocar o projeto por `unset` é edição, como no `update_task`, e mover de volta
    com `match` desfaz. `idempotentHint: false`: o `copy` repetido copia de novo (o `move` repetido só erra, 400).
  - `set_active_workspace` → `destructiveHint: false`, `idempotentHint: true`: ativar o que já está ativo devolve 200
    sem mudar nada, e com tarefa ativa só erra (409). O handler **não para a tarefa**; a tela pergunta
    Concluída/Pendente e para. A descrição manda perguntar ao usuário e chamar `stop_task` (com o `completed` da
    resposta) ou `cancel_task` antes.
  - `idempotentHint: true` também nos `create_*` e `import_*`: o nome é único no workspace (`DuplicateNameError` → 409)
    e a importação pula o repetido, então repetir não cria nada. Diverge do `create_custom_field` (Fase 4, `false`),
    cuja razão escrita ("repetir cria outro") não bate com o rótulo único — não mexido aqui.
  - `openWorldHint: false` em todas: nenhuma passa pelo `usePostStopLogic`; só gravam e emitem eventos locais
    (`notifyTasksChanged`, `notifyProjectsChanged`, `WORKSPACE_CHANGED`…).
- **O que a descrição promete, lido do código.** `set_task_billable` vale para o grupo (`setGroupBillable`: mesmo dia e
  workspace, concluídas, mesma chave `taskGroupKey`, que inclui os valores personalizados). `merge_tasks`: ≥ 2 ids,
  mesmo grupo, só hoje (regra só da API, para espelhar a tela). `delete_workspace` com `move` funde no destino o
  projeto/categoria homônimo (`moveAll`), troca o ativo quando o excluído era ele (`useWorkspaceAdmin.remove`) e deixa
  paradas as integrações presas ao workspace (o aviso do modal, §6.7 de `regras-de-negocio.md`).
- **"Os registros ficam, sem o projeto"** na exclusão de projeto/categoria vem das FKs `ON DELETE SET NULL` das
  migrations. O pragma vale por conexão, e a do app o tem ligado: o `tauri-plugin-sql` abre o banco pelo `sqlx` 0.8,
  cujo `SqliteConnectOptions` liga `foreign_keys` por padrão — o `PRAGMA` da `001_initial_schema.sql` não é o que o
  garante. É a mesma premissa do CASCADE do `delete_custom_field`.
