# API local cobrindo o núcleo de registro — plano de execução

> **Este documento é o handoff.** A execução acontece **uma fase por sessão**, como no backup do
> Drive. Quem retoma lê a §6 primeiro.
>
> Branch: `feat/api-local-nucleo`, saída de **`develop`**. Um PR por fase.
>
> **O MCP mora na mesma API** (`POST /mcp`, spec em `docs-internal/specs/mcp.md`). Toda `op` nova
> em `HANDLERS` (`src/presentation/localApi/dispatch.ts`) precisa entrar em `src-tauri/mcp-ops.json`,
> como `exposed` (com a tool) ou `excluded` (com o motivo) — `mcpOps.test.ts` e o `cargo test`
> reprovam `op` sem classificação.

---

## 1. Por que existe

A API REST local (`src-tauri/src/api/`) nasceu antes dos workspaces e **reimplementa em Rust as
regras do domínio TS**. O domínio andou e a cópia ficou para trás. Levantamento de 2026-09-15:

| # | Defeito | Onde |
|---|---|---|
| 1 | `POST /tasks/start`, `/tasks/toggle` e `POST /planned-tasks` gravam sem `workspace_id`, que é `NOT NULL` desde a migration 011 — a gravação falha | `db.rs` `insert_task`, `insert_planned_task` |
| 2 | `projectName`/`categoryName` resolvem por nome **sem workspace**; a tarefa pode apontar para projeto de outro workspace | `db.rs` `find_*_id_by_name` |
| 3 | `GET /projects`, `/categories`, `/planned-tasks` e o `today` do `/status` misturam todos os workspaces e não devolvem `workspaceId` | `db.rs` |
| 4 | Parar pela API pula o `usePostStopLogic`: sem descarte <1 min, sem arredondamento, sem concluir a planejada de origem, sem envio automático. `completed` é ignorado | `handlers.rs` `post_stop` |
| 5 | O `running-task-changed` emitido leva `TaskDto` sem `workspaceId`, `customValues` e `plannedTaskId` — `customValues` é obrigatório na `Task` do TS | `handlers.rs` `emit_running_task_changed` |
| 6 | `PUT /planned-tasks/{id}` regrava a linha sem `label` da ação, `startTime`/`endTime` e `customValues` — editar planejada importada apaga esses dados | `models.rs` |
| 7 | `?date=` exige `period_end` preenchido; o domínio aceita `NULL` como período aberto | `db.rs` `list_planned_tasks_for_date` |
| 8 | CRUD de planejadas não emite `PLANNED_TASKS_CHANGED` | `handlers.rs` |

Além disso, a API não expõe workspaces, Histórico, CRUD de catálogo, campos personalizados nem
totais além do dia.

## 2. Decisões tomadas — não reabrir sem motivo novo

Todas do usuário, em 2026-09-15.

| Decisão | Escolha | Por quê |
|---|---|---|
| Arquitetura | **Ponte para o TS** — Rust só recebe HTTP e repassa à janela principal, que executa o caso de uso real | Os 8 defeitos são a mesma causa: duas implementações da regra. Estender a API a todo o núcleo em Rust dobraria a superfície que diverge. |
| Workspace | `workspaceId` **opcional**; ausente = workspace ativo | É o que a UI faz (§6.7). Script simples não precisa saber de workspace. |
| Escopo | **Núcleo de registro**: workspaces, tarefas/Histórico, planejadas, projetos, categorias, categorias por projeto, campos personalizados, totais | Integrações, exportação, IA, configurações e backup ficam fora. A ponte os tornaria baratos depois, mas não entram aqui. **Revisto em 2026-10-22:** tudo que a UI faz deve existir na API e no MCP; o que ficou fora é dívida, inventariada em `mcp.md` §7. |

### 2.1 Duas coisas que parecem descuido e são decisão

- **A janela principal é pré-requisito da API.** Ela nunca é destruída — fechar é `hide()`
  (`TitleBar.tsx`, `tray.rs`, `useGlobalShortcuts`, `useStartupWindow`) —, então o webview fica
  carregado enquanto o app roda. Se um dia a janela passar a ser destruída, a ponte quebra: o
  handshake de prontidão (§3) é o que transforma isso em 503 em vez de requisição pendurada.
- **A tarefa em execução passa pelo `RunningTaskContext`, não pelo repositório.** Chamar
  `stopTask` do use case direto repetiria o defeito 4 — as regras de parada moram no
  `usePostStopLogic`, pendurado no contexto, e o estado da UI também.

## 3. Arquitetura da ponte

```
cliente ──► axum (Rust) ──emit_to("main","local-api:request",{id,op,params})──► janela principal
             │ aguarda (timeout 10s → 504)                                          │
             ◄──── invoke("local_api_respond",{id,status,body}) ◄── handler TS → caso de uso
```

**Rust** (`src-tauri/src/api/`)
- `bridge.rs` (novo): `Mutex<HashMap<String, oneshot::Sender<BridgeResponse>>>`, flag de prontidão,
  `request(op, params) -> Result<BridgeResponse, BridgeError>` com timeout.
- `handlers.rs`: extrai path/query/corpo, chama `bridge.request`, devolve status e corpo do TS.
  Nenhuma regra.
- `models.rs`: DTOs só para o schema do Swagger (`utoipa`) e para validar formato de entrada.
- `db.rs`: reduzido à leitura de `localApiEnabled`/`localApiPort` no boot.
- `commands/local_api.rs`: `local_api_respond(id, status, body)` e `local_api_bridge_ready()`.
- Antes de `local_api_bridge_ready`: **503** "app ainda carregando".

**TS** (`src/presentation/localApi/`)
- `useLocalApiBridge.ts`: montado em `MainContent` (dentro do `RunningTaskProvider`). Escuta
  `local-api:request`, **enfileira** (uma requisição por vez), despacha por `op`, responde.
  Lê contexto por `ref` — sem isso, duas chamadas seguidas veriam a mesma tarefa em execução.
- `handlers/<recurso>.ts`: funções `(deps, params) => result` chamando use cases. `deps` injetado
  (repositórios, operações do `RunningTaskContext`, workspace ativo, `notify*Changed`).
- `resolveRequestWorkspace` e resolução de projeto/categoria por **id ou nome dentro do workspace**
  (`findByName(name, ws)`).
- `errors.ts`: `DomainError` → 400/409, não encontrado → 404, resto → 500.

**Mudança no contexto:** `startTask`/`switchToTask`/`stopTask` do `RunningTaskContext` passam a
devolver a `Task`. Rodar `gitnexus_impact` antes.

## 4. Endpoints

Todos aceitam `workspaceId` opcional onde houver escopo.

| Recurso | Endpoints |
|---|---|
| Status e totais | `GET /status` · `GET /totals?from&to` · `GET /totals/week?date` |
| Workspaces | `GET/POST /workspaces` · `PUT/DELETE /workspaces/{id}` (DELETE com `{mode: "move"\|"delete", toWorkspaceId?}`) · `GET/PUT /workspaces/active` (409 com tarefa em execução) |
| Tarefa em execução | `POST /tasks/start\|pause\|resume\|stop\|toggle\|cancel` · `PATCH /tasks/active` · `POST /planned-tasks/{id}/start` |
| Histórico | `GET /tasks?from&to&name&projectId&categoryId&billable` · `GET/PUT/DELETE /tasks/{id}` · `POST /tasks` (retroativo) · `POST /tasks/delete` · `PUT /tasks/{id}/billable` (grupo, §6.2) · `POST /tasks/merge` · `POST /tasks/move` |
| Planejadas | as atuais + `workspaceId`, `startTime`/`endTime`, `customValues`, `label` da ação · `GET ?from&to` · `PATCH /{id}` (edição parcial, op `plannedTasks.patch`; o `PUT` segue substituindo tudo) · `POST /{id}/duplicate` · `POST /{id}/launch-retroactive` (reordenar ficou de fora — §6, Fase 3) |
| Projetos · categorias | `GET/POST` · `PUT/DELETE /{id}` · `POST /import` · `POST /delete` · `GET/PUT /projects/{id}/categories` |
| Campos personalizados | `GET/POST /custom-fields` · `PUT/DELETE /custom-fields/{id}` |
| Envio às integrações (paridade, Fase C1) | `GET /integrations/{id}/send-preview?from&to` (op `integrations.sendPreview`) · `POST /integrations/{id}/send` (op `integrations.send`), `id` = `google_sheets` \| `clockify` \| `monday` |
| Imports das integrações (paridade, Fase D1) | `GET /integrations/google_calendar/import-preview?from&to` · `POST /integrations/google_calendar/import` (ops `calendar.importPreview`/`calendar.import`) · `GET /integrations/zendesk/import-preview` · `POST /integrations/zendesk/import` (`zendesk.importPreview`/`zendesk.import`) · `GET /integrations/monday/import-preview?period` · `POST /integrations/monday/import` (`monday.importPreview`/`monday.import`) · `POST /integrations/monday/import-projects` · `POST /integrations/monday/import-categories` · `POST /integrations/monday/read-catalogs` (`monday.importProjects`/`importCategories`/`readCatalogs`) |
| Lançamentos, resumo por IA e backup (paridade, Fase D2) | `GET /integrations/clockify/entries?from&to&onlyDefaultTags` (op `clockify.entries`) · `GET /integrations/monday/entries?period` (`monday.entries`) · `GET /day-summaries?from&to&workspaceId` (`daySummaries.list`) · `POST /day-summaries/generate` (`daySummaries.generate`) · `GET /backup/drive` (`driveBackup.status`) · `POST /backup/drive/run` (`driveBackup.run`) |
| Escrita nos lançamentos (paridade, Fase D2b) | `POST /integrations/clockify/entries` (op `clockify.createEntry`) · `PUT/DELETE /integrations/clockify/entries/{id}` (`clockify.updateEntry`/`clockify.deleteEntry`) · `PUT/DELETE /integrations/monday/entries/{id}` (`monday.updateEntry`/`monday.deleteEntry`), `id` = o `itemId` |
| Configurações e link de tarefa (paridade, Fase D3a) | `GET/PATCH /settings/general` · `/settings/overlay` · `/settings/accessibility` · `/settings/shortcuts` (ops `settings.getGeneral`/`updateGeneral`, `getOverlay`/`updateOverlay`, `getAccessibility`/`updateAccessibility`, `getShortcuts`/`updateShortcuts`) · `POST /settings/reset-window-positions` (`settings.resetWindowPositions`) · `POST /overlay/toggle` (`overlay.toggle`) · `POST /share/link` · `POST /share/preview` · `POST /share/apply` (`share.link`/`share.preview`/`share.apply`) |
| Ajustes das integrações (paridade, Fase D3b) | `GET/PATCH /settings/integrations/{google_sheets,google_calendar,google_drive,clockify,monday,zendesk}` e `GET /settings/integrations/llm` (ops `settings.getSheets`/`updateSheets`, `getCalendar`/`updateCalendar`, `getDriveBackup`/`updateDriveBackup`, `getClockify`/`updateClockify`, `getMonday`/`updateMonday`, `getZendesk`/`updateZendesk`, `getLlm`) · `POST`/`DELETE /integrations/google_calendar/ignore-rules` (`calendar.addIgnoreRule`/`removeIgnoreRule`; o `DELETE` por `?operator&value`) · `GET /integrations/clockify/workspaces` · `GET /integrations/clockify/catalog` · `PUT/DELETE /integrations/clockify/project-mappings/{projectId}` · `PUT /integrations/clockify/category-mappings/{categoryId}` · `PUT /integrations/clockify/default-tags` · `POST /integrations/clockify/import-projects` · `POST /integrations/clockify/import-tags` (`clockify.workspaces/catalog/setProjectMapping/removeProjectMapping/setCategoryTags/setDefaultTags/importProjects/importTags`) · `POST /integrations/monday/catalog-fields/{project_stage\|non_billable_reason}` e `…/refresh` (`monday.createCatalogField`/`refreshCatalogField`) · `PUT /integrations/monday/projects/{portfolioItemId}/board` (`monday.setProjectBoard`) · `POST /integrations/{google_sheets\|monday}/sync-now` (`integrations.syncNow`) |
| Exportação (paridade, Fase C2) | `GET/POST /export-profiles` · `PUT/DELETE /export-profiles/{id}` · `PUT /export-profiles/{id}/default` (ops `exportProfiles.list/create/update/delete/setDefault`, `?workspaceId=` nas rotas por id) · `POST /export` (op `export.generate`) |

**Mudanças que clientes existentes percebem:** listas filtradas pelo workspace ativo; nome de
projeto/categoria de outro workspace passa a 409; DTOs ganham campos (aditivo).

## 5. Fases

Ordem obrigatória: 0 → 1 → 2 → 3.

### Fase 0 · Ponte + os 13 endpoints atuais
Corrige os defeitos 1–8. Rust: `bridge.rs`, `handlers.rs`, `models.rs`, `db.rs`,
`commands/local_api.rs`, registro em `lib.rs`. TS: `useLocalApiBridge`, `handlers/tasks.ts`,
`handlers/plannedTasks.ts`, `handlers/catalog.ts` (só leitura, por ora), `errors.ts`;
`RunningTaskContext` devolvendo `Task`. A regra do Rust só sai depois de os 13 passarem pela ponte.

### Fase 1 · Workspaces e catálogo
Workspaces (inclusive ativo), CRUD de projetos e categorias, import em massa, categorias por
projeto, campos personalizados. Toda mutação de catálogo chama `notify*Changed` (guardrails §9.2).

### Fase 2 · Histórico e totais
Listar/buscar, CRUD, retroativo, unificar, billable do grupo, mover/copiar entre workspaces,
totais por período e semana. Mutação chama `notifyTasksChanged`.

### Fase 3 · Planejadas completas e fechamento
Semana, duplicar, lançar retroativo, iniciar planejada. Revisão das descrições do
Swagger e da seção "API local" do manual (`docs/index.html`), que hoje lista só os 13 endpoints.

### Testes (toda fase)
- Handlers TS em `src/tests/presentation/localApi/`, com repositórios e contexto mockados (Vitest).
- Fase 0: `cargo test` do mapa de pendentes — resposta, timeout, 503 antes da prontidão.
- Verificação manual por `curl` dos endpoints da fase.

## 6. Estado

| Fase | Estado |
|---|---|
| 0 | commitada (2f6683a); verificação manual parcial pelo usuário, ok |
| 1 | commitada (35cfe76); verificada pelo usuário |
| 2 | commitada (a8567b8 + 895ab53) |
| 3 | commitada (87c2f1d); revisada e verificada por curl no app de dev |

**Pendências da revisão da Fase 0 — resolvidas na Fase 3:**
- `sortOrder` na criação: a API passou a gravar **0**, como o `CreatePlannedTask` (ver decisões da Fase 3).
- `GET /planned-tasks` sem data usa o novo `findAll(workspaceId)` do repositório; a planejada `period` com
  `period_start` NULL volta a aparecer.
- `Bridge.ready` volta a `false` no `on_page_load` (`Started`) da janela `main` (`lib.rs`): recarregar o webview
  dá 503 até o ouvinte novo avisar prontidão, em vez de 504.

**Envio às integrações (Fase C1 da paridade, `mcp.md` §7) — 2026-10-22.** Regras em
`src/presentation/localApi/handlers/integrations.ts`; a orquestração é a do modal, num lugar só:
`sendTaskGroups`/`sendBlockedReason`/`buildSendPayload` (`domain/usecases/tasks/SendTaskGroups.ts`),
`loadTaskSendDays`/`groupSendStatus` (`domain/usecases/tasks/LoadTaskSendDays.ts`) e o adaptador por integração
(`presentation/integrations/taskSendAdapters.ts`, `buildTaskSendAdapter`), que o `TaskSendModal` e a ponte usam. A ponte
recebe o adaptador por uma porta estreita (`deps.taskSend`: `workspaceIdFor`/`adapterFor`), não a config inteira.
- **Workspace é o da integração** (`taskSendWorkspaceId` → `resolveIntegrationWorkspaceId`), nunca o ativo; não há
  `workspaceId` na rota. Catálogo do mesmo workspace, como o `useIntegrationCatalogs` do modal.
- `id` fora das três → 404. Integração não configurada → **409** com o `notConfiguredMessage` do modal, nas duas ops.
- **Prévia:** período como o `GET /tasks` (`periodRange`). Devolve `days[]` (mais recente primeiro) com `groups[]`: `key`,
  nome, projeto/categoria (id e nome), `totalSeconds`, `taskIds`, `sentTaskIds`, `state` (`sent`/`pending`/`invalid`),
  `missing` (da `validateTask`) e `partiallySent` (o "Parcial" da lista). `pending` é exatamente a pré-seleção do modal.
  `sendWarning` = `validateBeforeSend` sobre a carga dos pendentes (null se não há pendente ou nada barra);
  `resendWarning` = o aviso de reenvio do modal da integração.
- **Envio recebe `taskIds`**, não chaves de grupo: id é o que as demais rotas usam, e a chave de grupo carrega nome e
  valores personalizados em texto. Cada id seleciona **o grupo inteiro** do dia dele (a caixa do modal só marca grupo; mandar
  só parte mudaria a carga, porque o representante leva a duração somada). `taskIds` vazio ou fora do formato → 400;
  id inexistente → 404; tarefa ativa ou fora do workspace da integração → 409; grupo com dado faltando (`validateTask`) → 409
  antes de enviar nada; `validateBeforeSend` barrando → 409 com a mensagem do modal. Reenvio do já enviado é permitido.
- Resposta 200 mesmo com recusa/falha: `sentTaskIds` (expandidos pelo `resolveSentTasks`), `skippedTaskIds` (o do
  Monday, já igual no destino), `refused`, `failed`, `sentGroups` e `message` (a frase do `buildResultMessage`).
  `markSent` só do que subiu; timestamp do envio diário só sem recusa nem falha (`onSendSuccess`), como no modal.
- Com algo marcado, `notifyTasksChanged`: o badge "Enviado" do `TodayEntriesSection` relê o log quando a lista de tarefas
  recarrega. O modal aberto não escuta evento nenhum (relê só no próprio envio ou ao trocar o período) — igual a hoje.
- As duas ops não esperam o render (`waitsForNextCommit`): não mexem na tarefa em execução nem no workspace.
- O `AutoSyncRunner` (envio diário/por tarefa) não foi tocado; usa outro caminho (`runDailyTemplate`/estratégias).

**Exportação (Fase C2 da paridade, `mcp.md` §7) — 2026-10-22.** Regras em
`src/presentation/localApi/handlers/exportProfiles.ts`; a geração é a do modal, num lugar só:
`resolveExportProfile`/`loadTasksForExport`/`mergeTasksForExport`/`generateTaskExport`
(`domain/usecases/exportProfiles/GenerateTaskExport.ts`) e `withCustomColumns` (`domain/utils/exportFormatter.ts`), que o
`ExportModal` e a ponte usam. **A API não grava em disco**: devolve o texto.
- **Perfis por workspace**, como o catálogo: `workspaceId` ausente = ativo; nas rotas por id vai em `?workspaceId=` e
  id de outro workspace é 404. Workspace inexistente → 409.
- **Criar:** `name` obrigatório e não vazio (o botão Salvar da tela fica desabilitado sem nome; o use case não checa) → 400.
  Ausente vale o formulário novo: `csv`, `comma`, `hh:mm:ss`, `iso`, `isDefault: false`, as 7 colunas de sistema. Valor
  fora das opções → 400. Nome **não** é único (nem no banco nem na tela).
- **`columns`:** lista de `{ field, label, visible, order }`; `field` = campo de sistema ou `custom:<id>` de campo que
  existe (arquivado vale, como na exportação); coluna desconhecida ou repetida → 400. Os campos personalizados **ativos**
  que faltarem entram invisíveis no fim (`withCustomColumns`), como o formulário faz ao abrir — na criação e na edição.
- **Editar:** só o que veio (`null` = ausente). O `updateExportProfile` espalha o patch sobre o perfil, então o handler tira
  as chaves `undefined` antes. `isDefault: false` no padrão deixa o workspace sem padrão, como desmarcar na tela.
- **Excluir o único perfil do workspace → 409** (regra só da API: a tela desabilita a lixeira; o use case não barra).
- **Gerar (`POST /export`, corpo opcional):** `from`/`to` como o `GET /tasks` (`periodRange`); perfil = `profileId` (de outro
  workspace → 404) ou `resolveExportProfile` (padrão, senão o primeiro, como o seletor do modal); sem perfil → 409. Só
  concluídas (`searchTasks`), **do workspace pedido**. `taskIds` (a seleção individual do modal) filtra a lista carregada e
  mantém a ordem dela; vazio → 400; id fora das concluídas do período no workspace → 409. Agrupa e formata como o modal.
  Resposta `{ content, fileName, format, mimeType, rowCount, profileId, workspaceId, from, to }`; `fileName` é o
  `export.csv`/`export.json` fixo do diálogo de salvar; período sem tarefa dá `content` `""` (CSV) ou `[]` e `rowCount` 0
  (a tela nem mostra os botões; a API não erra por isso).
- **Sem filtros do Histórico** (nome, projeto, categoria, billable): o modal não os recebe — faz a própria busca só por
  período. Entrar com eles seria regra nova.
- Nenhuma emite evento: o modal carrega os perfis ao abrir e não escuta mudança (a lista aberta só atualiza ao reabrir).
  Nenhuma espera o render.

**Imports das integrações (Fase D1 da paridade, `mcp.md` §7) — 2026-10-23.** Regras em
`src/presentation/localApi/handlers/{calendarImport,zendeskImport,mondayImport}.ts`; a lógica é a dos modais e dos cards,
num lugar só: `loadCalendarImportCandidates`/`calendarEventDefaults` e `planCalendarImport`/`importCalendarSelection`
(`domain/usecases/calendar/`), `ticketImportDefaults`/`toImportTicketInput` (`ImportTickets.ts`),
`mondayImportBoards`/`loadMondayImportCandidates`/`mondayImportWindow`/`rowsInWindow`/`importMondaySelection`
(`domain/usecases/monday/manualMondayImport.ts`) e os três botões do Monday em `presentation/integrations/mondayCatalogImports.ts`.
A ponte recebe cada integração por uma porta estreita (`deps.imports`: `calendar()`/`zendesk()`/`monday()`, montadas em
`presentation/integrations/importSources.ts`), não a config inteira.
- **Workspace é o da integração** (`calendarDeskclockWorkspaceId`, `zendeskDeskclockWorkspaceId`,
  `mondayDeskclockWorkspaceId`, por `resolveIntegrationWorkspaceId`), como os modais; não há `workspaceId` na rota. A
  exceção da Agenda (o rastreio **automático** cria no ativo) não passa por aqui: o import manual sempre usou a chave dela.
  Projeto e categoria do corpo resolvem nesse workspace (`resolveProjectId`/`resolveCategoryId`, 409 se não existir).
- **Não conectada → 409.** Os modais nem abrem (o botão some), então a frase é da API: Google sem `googleRefreshToken`,
  Zendesk sem `zendeskAccessToken`, Monday sem `mondayApiKey` (esta, a mesma do envio). Conectar segue fora (§7.2 de `mcp.md`).
- **Prévia = a lista do modal**, sem gravar nada; **import = ids escolhidos**, cada linha com o que a tela deixa editar
  (ausente = a sugestão da prévia). Lista vazia ou malformada → 400; id fora da lista que a prévia mostraria → 404.
  Ids repetidos valem uma vez. Com algo criado, `PLANNED_TASKS_CHANGED`. Nenhuma espera o render.
- **Agenda.** Período em dias locais; sem `from`/`to`, a semana corrente pelo `weekStartsOn` (o padrão do modal); só `from`,
  o próprio dia. Cada evento traz a sugestão (`projectId/Name`, `categoryId/Name` dos metadados da descrição,
  `scheduleType`, `recurringDays`) e `alreadyExists` (planejada homônima no período, no destino), `ignored` (regra de
  "Eventos ignorados") e `preselected` (nem um nem outro). Fim de semana sai na origem com "Exibir fim de semana"
  desligado. No import, trocar o projeto sem mandar categoria a limpa (o autocomplete da tela faz isso);
  `scheduleType` `specific_date`/`recurring`; `recurringDays` 0–6; `addOpenUrlAction` padrão `true`, `trackMeetings`
  padrão `false`. Recorrentes de mesmo nome e horário viram uma planejada com os dias unidos (`mergedEventIds`). Falha do
  rastreio volta em `trackErrors` com 200 — as planejadas já estão gravadas. **Não há dedupe** contra o que já existe: o
  modal só desmarca o `alreadyExists`, e a API importa o que vier.
- **Zendesk.** A prévia são os tickets atribuídos em aberto com a linha padrão (`#id - assunto`, recorrente, data de hoje,
  ação ligada). Id numérico. No import, nome em branco volta ao padrão e `scheduleDate` (YYYY-MM-DD) só vale em
  `specific_date`. **O modal não confere o que já foi importado, e a API também não.** A resposta traz a contagem e os ids
  (o `importTickets` não devolve as planejadas).
- **Monday — itens.** `period` `today`/`week` (padrão)/`next30`, as pílulas do modal; item sem cronograma entra em todas.
  Os 409 dos estados vazios do modal: nenhum board vinculado, boards de projetos de outro workspace, falta o usuário da
  conta. Cada item traz projeto, Timeline, a sugestão (`resolveItemDefaults`: categoria pelo Activity Type, billable dela,
  etapa pelo Project Stage) e `alreadyImported` (planejada viva, `findImportedMondayItems`) e `alreadyExists` (homônimo).
  **O modal esconde o já importado; a prévia o lista marcado**, e o import o recusa com 409. O import aceita qualquer item
  da busca, não só os da janela (o "importa só o visível" do modal protege a seleção escondida, que aqui não existe).
  Editáveis os mesmos da linha: categoria (o billable passa a ser o padrão dela; `null` limpa e mantém o sugerido) e
  `projectStage` (rótulo ou id da opção, via `normalizeCustomValues`; sem campo de etapa configurado → 409). Grava o vínculo
  de `monday_imported_items` como o modal.
- **Monday — os três botões**, cada um uma op sem corpo: `importProjects` (o "Importar/Atualizar" de Projetos, com
  `forceSchemaRead`, a semeadura das categorias por projeto, a data do dia, a versão do cache e o erro limpo; avisa
  projetos e categorias por projeto), `importCategories` (uma categoria por Activity Type; avisa categorias) e
  `readCatalogs` (o "Ler catálogos"; grava `mondayFieldCatalogs`). O que desabilitaria o botão vira 409: sem Portfólio, sem
  Activity Type ("Leia os catálogos ou importe os projetos."), sem board de Report.

**Lançamentos, resumo por IA e backup (Fase D2 da paridade, `mcp.md` §7) — 2026-10-23.** Regras em
`src/presentation/localApi/handlers/{integrationEntries,daySummaries,driveBackup}.ts`; a lógica é a dos modais, da aba e da
subseção, num lugar só: `clockifyEntries.ts` e `mondayEntries.ts` (domínio), `runDaySummaries`/`saveLlmLimits`
(`presentation/integrations/daySummaries.ts`) e `driveBackupNeedsReconnect`/`buildDriveBackupSource`
(`presentation/integrations/driveBackup.ts`). Portas estreitas: `deps.entries.clockify()/monday()`, `deps.llm()`,
`deps.driveBackup()` — sem a config nem as chaves.
- **Clockify.** `from`/`to` em dias locais (ausentes = hoje, o padrão do modal), limites do dia como o hook. Workspace e usuário
  **do Clockify** da config. Sem o apontamento em andamento. `onlyDefaultTags` (`true`/`false`, texto) = o "Apenas com tags
  padrão"; ausente = ligado quando há tag padrão, como o modal abre; `hiddenByTags` = o estado "Mostrar todos". Dias do mais
  recente para o mais antigo, apontamentos idem, `durationSeconds` e `totalSeconds` como a tela. Sem API Key, workspace ou
  usuário → 409.
- **Monday.** `period` `today`/`7days` (padrão)/`30days`/`month` (do dia 1 a hoje) — só as janelas do modal, porque a busca
  não filtra por data e tem piso (`searchFloorDayISO`); outro valor → 400. Só as atividades do usuário, nos boards de projetos
  com board; recorte por `periodOverlaps`, agrupamento pelo dia de início. Sem chave, usuário ou projeto com board → 409.
- **Resumos — leitura.** `GET /day-summaries`: período como o `GET /tasks`, no máximo 366 dias (400); `workspaceId` ausente =
  ativo. Só o banco local; dia sem resumo não vem; o de hoje pode estar defasado (`generatedAt` diz quando). Sem provedor → 409.
- **Resumos — geração.** `POST /day-summaries/generate`, corpo opcional `{ from, to, workspaceId, name, projectId, categoryId,
  billable }`: os dias são os da busca do Histórico (`searchHistory`), do mais recente para o mais antigo; a geração é a da aba
  (`runDaySummaries`): os 5 mais recentes, dia já em `day_summaries` volta como `source: "cache"`, hoje sempre regerado, erro
  por dia já traduzido em `errors`, parada no primeiro limite de cota com o resto em `skipped`. A cota medida vai a
  `llmLastLimits`/`llmLastLimitsAt`, como a aba. Resposta com `dayCount`, `coveredDays` e o `scopeNote` da tela. Sem provedor →
  409, antes de buscar tarefa. Prazo da ponte: 2 min, numa fila própria (não segura as outras requisições).
- **Backup.** `GET /backup/drive`: `connected`, `enabled`, `frequency`, `lastRunAt` (ISO, `null` = nunca), `lastError`,
  `needsReconnect`, `folderName` — sempre 200. `POST /backup/drive/run`: o "Fazer backup agora" (`DriveBackupRunner.run`);
  200 com `fileId` e o estado novo; Google não conectado → 409; falha do Drive → **502** com a mensagem que o runner gravou.
  Prazo da ponte: 2 min, numa fila própria (não segura as outras requisições). Restaurar não tem rota (procedimento manual, `telas/dados.md`).
- Nenhuma emite evento nem espera o render.

**Escrita nos lançamentos (Fase D2b da paridade, `mcp.md` §7) — 2026-10-23.** Regras em
`src/presentation/localApi/handlers/integrationEntryWrites.ts`; as do formulário são as dos modais, num lugar só:
`clockifyEntryPayload.ts` (`clockifyEntryDraftError`, `buildClockifyEntryPayload`, `clockifyProjectIdByName`) e
`mondayEntryWrite.ts` (`mondayEntryPatchError`, `buildMondayEntryUpdate` com a guarda dos rótulos, `updateMondayEntry`,
`deleteMondayEntry`). Mesmas portas da leitura (`deps.entries`), mais `deps.mondayActivityItemRepo` (só `deleteItem`).
- **Clockify — criar.** `POST /integrations/clockify/entries` → 201 com o que foi gravado (`id`, `description`, `start`/`end`
  ISO, `durationSeconds`, `billable`, `projectId`, `tagIds`). Corpo: `description` (aparada; vazia → 400), projeto por
  `projectId` ou `projectName` (o nome exibido, "Cliente - Projeto"; `projectId` vence), `date` (dia local) e `start`/`end`
  (`HH:MM` locais; fim antes do início = dia seguinte, como o formulário). Tags por `tagIds` ou `tagNames` (`tagIds` vence);
  ausentes = as tags padrão; `billable` ausente = `false` — os padrões com que o formulário abre. Sem projeto → 400 (a tela
  desabilita o botão; a frase é da API). Projeto ou tag fora do workspace do Clockify → 409 (lê `listProjects`/`listTags`
  só quando o corpo os cita).
- **Clockify — editar.** `PUT /integrations/clockify/entries/{id}`: o mesmo corpo, e **regrava o apontamento inteiro**, como o
  Salvar do formulário (o `IClockifyApi` não lê um apontamento por id, então não há "ausente mantém"). Por isso `billable` e
  as tags (lista vazia = sem tags) são obrigatórios (400). 200 com o que foi gravado.
- **Clockify — excluir.** `DELETE /integrations/clockify/entries/{id}` → 204, imediata, como a lixeira da linha (sem
  confirmação na tela).
- **Monday — editar.** `PUT /integrations/monday/entries/{id}` (`id` = `itemId`), corpo opcional `{ name, hours, billable,
  activityType, projectStage }`, **ausente = o valor atual**. A atividade é procurada entre as do usuário que a tela lista
  (mesma busca e piso, `loadMondayEntries`); fora delas → 404. Nome vazio ou horas negativas → 400. O que o formulário não
  deixa escolher também é 400 (regra só da API): rótulo de Activity Type/Project Stage fora dos do board (a mensagem lista as
  opções) e `billable` em board sem a coluna Billing type. `null` nos rótulos = a opção vazia do select, que não escreve a
  coluna. O payload é o do modal (`buildMondayEntryUpdate`): Status com o rótulo que a atividade já tem. 200 com a atividade
  como ficou (o DTO da leitura), sem rebuscar no Monday.
- **Monday — excluir.** `DELETE /integrations/monday/entries/{id}` → 204: apaga o item e o rastreio em
  `monday_activity_items` (`deleteMondayEntry`; falha no Monday não limpa o rastreio). A tela pede confirmação; a API não
  pergunta — quem confirma é o cliente (a tool do MCP manda).
- Não configurado → 409 com o aviso da leitura. Erro do Clockify ou do Monday: o tratamento da leitura (D2) — sobe e vira
  500 com a mensagem do serviço. Nenhuma emite evento nem espera o render; nenhuma resposta leva chave.

**Configurações e link de tarefa (Fase D3a da paridade, `mcp.md` §7) — 2026-10-23.** Regras em
`src/presentation/localApi/handlers/{settings,share}.ts`. Os efeitos são os das abas, num lugar só:
`presentation/settings/settingsEffects.ts` (`saveStartOnBoot`, `saveWeekStartsOn`, `saveShowWeekend`, `saveAppearance`,
`saveOverlayOpacity`, `saveOverlaySnapToGrid`, `saveShortcuts`, `resetWindowPositions`, com o `SettingsSystem` que embrulha
autostart, `update_shortcuts`, `toggle_overlay`, `get_display_server`, o `OVERLAY_CONFIG_CHANGED` e o `applyAppearance`),
que `GeralTab`, `OverlayTab`, `AparenciaTab`, `AtalhosTab` e a ponte chamam; as faixas e opções em
`domain/usecases/settings/settingsRules.ts`; os atalhos em `domain/usecases/settings/shortcuts.ts`. A ponte recebe uma porta
por grupo (`deps.settings`, `presentation/settings/settingsGroups.ts`), não a config.
- **Grupos e chaves.** Geral: `userName`, `startOnBoot`, `closeOnFocusLoss`, `showIntegrationsRail`,
  `discardTasksUnderOneMinute`, `roundingEnabled`, `roundingSlots`, `roundingTolerance`, `dailyGoalHours`, `weeklyGoalHours`,
  `weekStartsOn` (`monday`/`sunday`) e `showWeekend`. Overlay: `opacity`, `snapToGrid`. Acessibilidade (a aba Aparência):
  `mode`, `accent`. Atalhos: `toggleTask`, `stopTask`, `toggleOverlay`, `toggleWindow`. Fora: as chaves órfãs (`fontSize`,
  `overlayShowOnStart`), `overlayAlwaysVisible` (sem controle na tela), posições e larguras (estado de janela) e tudo de
  integração (D3b).
- **`PATCH` parcial:** ausente mantém; `null` → 400; chave fora do grupo → 400 com a lista das válidas (um erro de digitação não
  passa por gravado). Valor que a tela não oferece → 400: metas inteiras de 1–24 e 1–168, slot múltiplo de 5 até 60 (a lista é a
  final e sai ordenada, como as fichas), tolerância 0/1/2/5/10/15, opacidade inteira de 20–100, modo e acento das opções.
- **Efeitos:** `startOnBoot` liga/desliga o autostart; `weekStartsOn`, `showWeekend`, `opacity`, `snapToGrid`, `mode` e `accent`
  emitem `OVERLAY_CONFIG_CHANGED`; a aparência repinta a janela principal. A leitura de `startOnBoot` é a do sistema
  (`isEnabled`), como a aba; sem o plugin, a chave gravada. Nenhuma op de configuração espera o render: a ponte lê
  `weekStartsOn` por função.
- **Atalhos.** O `PATCH` mescla com os atuais e grava os quatro pelo `update_shortcuts`, como a aba. Forma fora do que o gravador
  produz (modificadores `CmdOrCtrl`/`Shift`/`Alt` + uma tecla) e o mesmo atalho em duas ações → 400 antes de registrar (regra só
  da API: a tela grava pelo teclado e não confere repetição). **O que o sistema recusa fica gravado**, como na tela, e volta em
  `failedShortcuts` com o `warning` da tela (o do Wayland, se for o caso) — 200, não 400.
- `POST /overlay/toggle` → `{ visible }`: o `toggle_overlay` do Rust passou a devolver a visibilidade final (a tela ignora).
- **Link de tarefa.** `POST /share/link { plannedTaskId }`: o link do "Copiar link" (catálogos do workspace da planejada, campos
  arquivados inclusive) e `payload` = o que o outro lado lê do link (`parseShareLink`), nada além. Não há link do Histórico: a
  tela só copia link de planejada. `POST /share/preview { link, workspaceId? }`: o que o `ShareTaskModal` abriria — a tarefa
  resolvida (`resolveSharedPayload`, campos ativos), `unresolved`, a data de hoje e o aviso de tarefa ativa. Link inválido → 400
  com a mensagem do "Receber link" (`readDeepLinkInput`); deeplink que não é `task/share` → 400 (os outros só navegam na tela).
  `POST /share/apply { link, mode, date?, workspaceId? }`: `plan` grava `specific_date` na `date` (hoje se ausente,
  `planSharedTask`) e avisa as planejadas; `start` usa o `switchToTask` (encerra a ativa pelas regras de parada; envio
  automático em segundo plano) e espera o render. Grava o que o link resolveu; editar é depois, pelas rotas de edição. 201.

**Ajustes das integrações (Fase D3b da paridade, `mcp.md` §7) — 2026-10-23.** Regras em
`src/presentation/localApi/handlers/{integrationSettings,integrationActions}.ts`; a validação por chave usa o
`parsePatch` compartilhado com a D3a (`localApi/patchRules.ts`). A ponte recebe uma porta (`deps.integrationSettings`,
`presentation/settings/integrationSettingsPort.ts`, que compõe os grupos simples de `integrationSettings.ts` com `clockifySettingsPort.ts` e `mondaySettingsPort.ts`), não a config. A
gravação passa pelas mesmas funções da tela: `domain/usecases/settings/integrationSettingsRules.ts` (aba em branco =
`DeskClock`, opções, `HH:MM`, as oito colunas), `domain/usecases/clockify/clockifyMappings.ts` e
`presentation/integrations/clockifySettings.ts` (vínculos, lista de workspaces, os dois "Importar do Clockify"),
`domain/usecases/monday/mondayCatalogFields.ts` e `presentation/integrations/mondayCatalogFields.ts` ("Criar do Monday",
"Atualizar"), `runMondaySetProjectBoard` (`mondayCatalogImports.ts`, o quadro digitado à mão) e `removeIgnoreRule`
(`isEventIgnored.ts`).
- **Grupos e chaves.** Sheets: `workspaceId`, `spreadsheetId` (aparado), `sheetName` (em branco = `DeskClock`),
  `columnMapping` (a lista inteira das oito colunas — é o único formato que expressa a ordem do arrastar), `durationFormat`
  e o envio automático (`autoSyncEnabled`, `autoSyncMode`, `autoSyncTrigger`, `autoSyncTime`). Agenda: `workspaceId` (só o
  "Importar eventos"; o rastreio cria no ativo, decisão registrada) e `autoTrackingEnabled`; as regras de ignorar vêm na
  leitura e se editam por rota própria, um item por vez, como a lista. Drive: `enabled` e `frequency`. Clockify:
  `workspaceId`, `clockifyWorkspaceId` (um do cache que a lista grava; troca id e nome juntos) e o envio automático; a leitura
  traz `defaultTagIds` e os vínculos do workspace do Clockify. Monday: `workspaceId`, `portfolioBoardId`/`reportBoardId`
  (aparados), `autoImportEnabled`, `projectStageFieldId`/`nonBillableReasonFieldId` (campo `select` não arquivado, ou o já
  vinculado; `""` desvincula) e o envio automático; a leitura traz o estado dos dois campos de catálogo e os projetos
  vinculados que existem no destino. Zendesk: `workspaceId`. IA: só leitura (`providerId`, `model`).
- **Fora, de propósito.** Segredo e conexão: chaves de API, tokens, client id/secret, subdomínio, e-mail da conta, a URL base do
  provedor (pode carregar credencial). Estado interno: caches (`clockifyWorkspaceCache` só pela lista,
  `mondayFieldCatalogs`, `llmLastLimits`), carimbos (`*LastTimestamp`, `*LastFiredDate`, `driveBackupLastRunAt`,
  `mondayProjectsSyncLastDate`), erros do último ciclo, `driveBackupFolderId`, `driveBackupKeepCount` (sem controle na tela),
  `mondayReportTypeFieldId` (card adormecido) e o resto do `mondayProjectMapping` (colunas, rótulos, schema).
- **Nenhum segredo sai:** cada leitura diz só `connected`. Há teste que semeia segredos (`SECRET-`) e estado interno (`INTERNAL-`) e passa as 27 ops,
  sucessos e erros (400/404/409/500/502), conferindo as chaves de cada resposta contra uma whitelist; e um que manda cada
  chave de segredo ou interna em cada `PATCH` e espera 400 sem gravar.
- **`PATCH`:** como a D3a — ausente mantém, `null` e chave fora do grupo → 400, valor fora das opções → 400. Workspace que não
  existe, workspace do Clockify fora da lista e campo que não pode ser vinculado → 409. **Sem conexão → 409**: a tela só mostra
  os controles com a integração conectada.
- **Efeitos:** nenhum além de gravar. Os agendadores (`useDailySyncScheduler`, `useDriveBackupScheduler`), os rastreadores
  (`useMeetingTracker`, `useMondayItemTracker`) e as estratégias leem a config na hora; trocar o workspace de uma integração na
  tela é só `config.set`. Nenhuma op espera o render.
- **Ações.** Regras de ignorar: `POST` acrescenta (repetida → 200 `added: false`; nova → 201), `DELETE` tira por operador e
  nome normalizado (ausente → 404); o "Ignorar sempre" do import é o `POST` com `equals` e o título. Clockify: lista de
  workspaces (relê e grava o cache), catálogo (projetos pelo nome exibido e tags), vincular/desvincular projeto (projeto de
  qualquer workspace; inexistente → 404; projeto do Clockify fora do catálogo → 409; desvincular sem vínculo → 404), tags da
  categoria e tags padrão (seleção inteira, conferida no catálogo), e os dois imports, que **substituem** os vínculos daquele
  workspace do Clockify, como na tela. Monday: "Criar do Monday" (cria o `select` com os rótulos ou vincula o homônimo; já
  vinculado ou catálogo não lido → 409; homônimo que não é `select` → 400), "Atualizar" (une as opções; sem vínculo → 409) e o
  quadro à mão (só projeto sem quadro, como a tela; board que não serve → 409 com o motivo do toast, sem gravar). "Enviar
  agora": só `google_sheets` e `monday` (o card do Clockify não tem o botão → 404), só com o envio diário ligado (409), planilha
  sem id → 409, falha do envio → 502; a resposta traz a frase do toast.

**`PATCH /planned-tasks/{id}` — decisão do usuário, 2026-10-22.** O `PUT` exige `name`/`scheduleType` e regrava
agendamento e ações; para editar só um campo (o MCP edita só `customValues`) entrou o `PATCH`, com o `PUT` intacto.
Regras em `patchPlannedTaskHandler`: ausente preserva; `null` limpa projeto, categoria, `startTime`/`endTime`,
`customValues` (`{}`) e `actions` (`[]`); `name` nulo ou vazio e `scheduleType` nulo → 400. Trocar `scheduleType` exige
os campos do novo tipo (`scheduleDate`; `recurringDays` não vazio; `periodStart`, todos YYYY-MM-DD; `periodEnd` opcional, ausente ou `null` = período sem fim) e
zera os do anterior, como o formulário grava; campo de agendamento de outro tipo, ou o do tipo atual em `null`, → 400
— regra só do `PATCH`, para a planejada não ficar sem dia. Projeto/categoria/billable como o `PUT /tasks/{id}`
(`resolveCatalogPatch` + `billableForCategoryChange`); `customValues` por `resolveCustomValues`.

**Decisões da Fase 3 — do usuário, 2026-09-15.** As regras vivem em `src/presentation/localApi/handlers/plannedTasks.ts`.
- **Reordenar não é exposto.** A UI não reordena planejadas: `reorder` do repositório não tem chamador em
  `presentation/` e não há arraste no Planejamento. Todo o app grava `sortOrder` 0, então as listas saem na ordem
  de criação; a API segue o mesmo (`sortOrder` explícito no corpo continua aceito na criação e no `PUT`). O
  comentário de `plannedSchedule.ts` que fala em "arraste do Planejamento" está desatualizado — registrado, não
  editado.
- `findAll(workspaceId)` em `IPlannedTaskRepository` (impact HIGH, aditivo, **autorizado**). Nenhum método existente mudou.
- `GET /planned-tasks`: `date` = regra do dia (`findForDate`); `from`/`to` = janela do Planejamento (`findForWeek`),
  um só lado vale para os dois; nada = `findAll`. `date` junto de `from`/`to` → 400.
- `POST /planned-tasks/{id}/start` (op `tasks.startPlanned`, espera o render): tarefa ativa (em execução ou
  pausada) → **409**, como o Play das telas (`startTask` do contexto não faz nada com tarefa ativa) — diferente do
  `POST /tasks/start`, que troca. Livre: `running.startTask` com `plannedTaskId`, `customValues` e o workspace da
  planejada. Sem restrição de data, como a semana do Planejamento.
- `POST /planned-tasks/{id}/launch-retroactive`, corpo opcional `{date?, startTime?, endTime?}`: `date` ausente =
  hoje; fora do formato ou futura → 400; planejada fora da agenda do dia (`findForDate` no workspace dela) ou já
  concluída nele → 409. Com horário: `launchPlannedTaskRetroactively` (sem mínimo, vira a meia-noite), e
  `startTime`/`endTime` no corpo → 400. Sem horário: `startTime`/`endTime` obrigatórios (ISO), início no dia
  `date` (o formulário monta o início no dia escolhido), ≥ 1 minuto; grava com nome, projeto, categoria, billable e
  `customValues` da planejada e a conclui na data. Avisa tarefas e planejadas.
- `POST /planned-tasks/{id}/duplicate`: `duplicatePlannedTask`, 201; 404 checado antes.
- MINORs da Fase 2: `assertDate`/`periodRange` saíram de `taskInput.ts` para `localApi/period.ts`;
  `POST /tasks/move` valida `ids` vazio (400) antes do destino inexistente (409).

**Pendências da Fase 3 — resolvidas na rodada de pendências (2026-09-15):**
- **Mínimo de 1 minuto no domínio.** `createRetroactiveTask` lança `DomainError("A duração mínima é 1 minuto.")`
  abaixo de `MIN_RETROACTIVE_DURATION_SECONDS` (60). `useRetroactiveForm` captura e mostra a mesma mensagem;
  `POST /tasks` e o `launch-retroactive` sem horário deixaram de repetir a regra. Efeito colateral na API: no
  `POST /tasks`, projeto/categoria inexistente (409) passa a ser checado antes da duração curta (400).
- **`launch-retroactive` sem horário unificado.** `launchPlannedTaskRetroactively` aceita um `interval` opcional:
  sem ele usa o horário da planejada (sem mínimo na prática — HH:MM com virada de meia-noite nunca fica abaixo de 1
  minuto); com ele grava o intervalo com os dados da planejada e a conclui. O handler só valida corpo e dia. O
  prefill do Lançamento Manual **não** usa o use case: o usuário pode editar os campos pré-preenchidos, e o formulário
  é que vale.
- **`editCompletedTask`** (domínio): `updateTask` + `setGroupBillable` com o billable resultante. Usado pelo
  `EditTaskModal` e pelo `PUT /tasks/{id}`.
- **Início da semana:** `IntegrationsModalsHost` usa `weekBoundsISO(weekStartsOn)` e `WeekPlanningView` usa
  `weekBoundsOf(addDaysISO(hoje, offset × 7), weekStartsOn)`; mesma saída. O parâmetro é obrigatório e vem da
  config (§6.6.1 de `regras-de-negocio.md`); aqui ele chega pelo `deps.weekStartsOn()`.
- **Deep link `task/start`:** projeto e categoria resolvem por `findByName(nome, workspace ativo)` — o workspace em
  que `startTask` cria a tarefa. Nome que não existe ali segue como antes: a tarefa começa sem projeto/categoria.
- **`scoped_params`** (`api/handlers.rs`) nas seis rotas de `catalog.rs` que só repassam `id` + `workspaceId`.
- **Ponte restrita à janela `main`.** `src-tauri/app_commands.rs` é a lista única: `SHARED_COMMANDS` (liberados em
  `capabilities/default.json`, nas quatro janelas) e `MAIN_ONLY_COMMANDS` (`local_api_respond`,
  `local_api_bridge_ready`, em `capabilities/local-api-bridge.json`, só `main`). O `build.rs` passa as duas ao
  `AppManifest::commands`, que gera `permissions/autogenerated/*.toml`. Os testes `app_commands_acl` (`lib.rs`)
  reprovam comando do `generate_handler!` fora da lista e capability desalinhada com ela ou com as janelas do
  `tauri.conf.json`. **Comando novo:** `generate_handler!` + `app_commands.rs` + `allow-<comando>` na capability.
  Só vale depois de o app subir com `pnpm tauri dev`.

- **Fim da tarefa unificada (decisão do usuário, 2026-09-15).** `mergeTaskGroup` grava como `endTime` o **maior**
  `endTime` do grupo (sem nenhum: início mais cedo + duração somada), em qualquer dia; a duração segue somada. Na
  tela nada muda (lista e modal mostram início + duração), mas o fim exportado e enviado ao Google Sheets de uma
  unificação feita hoje deixa de ser o instante do clique — aceito. Não há mais pendência aberta nesta spec.

**Decisões da Fase 2 (implementação, a revisar).** As regras vivem em
`src/presentation/localApi/handlers/{history,historyBatch,totals}.ts` e em `tasks.ts` (`PATCH /tasks/active`).
- Ops do Histórico usam o prefixo `history.*` (e `totals.*`), não `tasks.*`: não mexem na tarefa em execução e
  não devem esperar o render em `waitsForNextCommit`. Só `tasks.updateActive` espera.
- Tarefa por id (`GET/PUT/DELETE /tasks/{id}`, lotes `delete`/`merge`/`move`) **não é escopada por workspace**,
  como as planejadas por id; projeto e categoria resolvem no workspace da própria tarefa. **Decisão do usuário,
  2026-09-15.**
- Instantes (`startTime`/`endTime`) entram como ISO 8601 com hora. `POST /tasks` exige ≥ 1 minuto (trava do
  Lançamento Manual); `PUT` só recusa fim antes do início (o modal não tem mínimo). Início ou fim informado
  recalcula a duração.
- `PUT /tasks/{id}` repete o `EditTaskModal`: `updateTask` + `setGroupBillable` com o billable resultante.
- §6.2 na API (**decisão do usuário, 2026-09-15**): em `PUT /tasks/{id}` e `PATCH /tasks/active`, trocar a
  categoria (id ou nome) sem enviar `billable` aplica o `defaultBillable` da nova (`billableForCategoryChange`,
  `resolve.ts`). `billable` enviado sempre vence; categoria limpa (`null`) ou reenviada igual preserva o atual.
  No `PUT`, o billable resultante continua indo ao grupo.
- `PATCH /tasks/active` com `startTime` futuro → 400 (a tela recorta para agora).
- `POST /tasks/move`: destino igual ao workspace de alguma tarefa → 400; `targetId` fora do destino → 409;
  `kind: "create"` avisa `notifyProjectsChanged`/`notifyCategoriesChanged`.
- `GET /totals/week?date` usa `weekBoundsOf(date)` (novo, `shared/utils/time.ts`), e `weekBoundsISO()` passou a
  ser `weekBoundsOf(todayISO())` — **edição autorizada pelo usuário, 2026-09-15** (impact HIGH), mesma saída.
- `POST /tasks/merge` só aceita tarefas de **hoje** (409 fora disso), só para espelhar a tela, que unifica apenas em
  `TodayEntriesSection` — o use case já serve a qualquer dia. `ids` vazio nos lotes → 400.
  `startTime`/`endTime: null` no `PUT` → 400.
- ~~`mergeTaskGroup` grava `endTime` = agora~~ — resolvido: maior `endTime` do grupo.
- ~~Mínimo de 1 minuto em `useRetroactiveForm.ts` e composição do `EditTaskModal.tsx`~~ — resolvido: estão no
  domínio (`createRetroactiveTask`, `editCompletedTask`).
- ~~Cópias do cálculo do início da semana~~ — resolvido: `weekBoundsISO`/`weekBoundsOf`.

**Defeito corrigido na Fase 2 — escrita executada duas vezes (2026-09-15).** Com `pnpm tauri dev`, um `POST /tasks`
gravava duas tarefas. No Tauri 2.10.3, o StrictMode desmonta o efeito do `useLocalApiBridge` antes de o `eval` que
registra o ouvinte rodar na página; o `unregisterListener` lança `TypeError`, o `plugin:event|unlisten` nunca é
chamado e ficam dois ouvintes vivos. Correção: `claimRequestId` (`queue.ts`) deduplica por id no `globalThis`,
síncrono, antes de enfileirar (últimos 500 ids); ouvinte cujo efeito já foi limpo ignora a requisição antes de
reivindicar o id — senão, com a ordem de entrega indefinida do Tauri, requisições seguidas cairiam em filas
diferentes e perderiam a execução serial. A limpeza passa a logar a falha em vez de engoli-la.

**Regras só da API — decisões do usuário, 2026-09-15 (Fase 1).** A UI e o domínio seguem como
estão; as três vivem em `src/presentation/localApi/handlers/workspaces.ts`.
- `DELETE /workspaces/{id}` com a tarefa ativa (em execução ou pausada) naquele workspace → **409**,
  nos modos `move` e `delete`. A UI não barra; pela API a exclusão apagaria ou moveria a tarefa por
  baixo do timer.
- `color` fora de `WORKSPACE_COLORS` em `POST`/`PUT /workspaces` → **400** (`isWorkspaceColor`). A UI
  só oferece os slots; o domínio aceita qualquer string. `color` ausente: no `POST` segue o padrão do domínio
  (derivada do nome); no `PUT` preserva a cor atual, como os outros `PUT` parciais da API.
- Excluir o último workspace e destino de `move` inexistente → **409**, checados no handler antes de
  chamar a exclusão. O domínio lança `DomainError` (que a API mapeia para 400) e a UI não deixa
  chegar lá. `DEFAULT_WORKSPACE_ID` não tem regra própria, como na UI e no domínio.

**Resolvido (2026-09-15):** o deep link `task/start` (`App.tsx`, `handleDeepLinkStart`) resolvia
projeto e categoria por nome com `findAll()` sem workspace — o mesmo defeito 2. Agora resolve no workspace ativo.
