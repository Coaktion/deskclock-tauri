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
| Escopo da v1 | **Só leitura e registro** | O app exclui sem confirmação; um erro do modelo apagando ou reescrevendo o passado seria irreversível. |
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

Fora da v1: `tasks.cancel`, `tasks.toggle`, `tasks.updateActive`, edição/exclusão/unificação/movimentação do
Histórico, CRUD de catálogo, workspaces e campos personalizados.

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
| 3 | pendente |

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
- **`customValues` fora do `start_task`.** O TS aceita, mas a chave é o id do campo personalizado, e
  `customFields.list` está fora da v1 — o modelo não teria de onde tirar o id.
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
- **Campos deixados de fora.** `customValues` em `plan_task` e `log_past_task` (mesmo motivo do
  `start_task`: `customFields.list` fora da v1, o modelo não tem o id do campo — e quem precisa dos
  valores de uma planejada usa `log_planned_task`, que os copia). `actions` (links/arquivos abertos
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
