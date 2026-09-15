# API local cobrindo o núcleo de registro — plano de execução

> **Este documento é o handoff.** A execução acontece **uma fase por sessão**, como no backup do
> Drive. Quem retoma lê a §6 primeiro.
>
> Branch: `feat/api-local-nucleo`, saída de **`develop`**. Um PR por fase.

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
| Escopo | **Núcleo de registro**: workspaces, tarefas/Histórico, planejadas, projetos, categorias, categorias por projeto, campos personalizados, totais | Integrações, exportação, IA, configurações e backup ficam fora. A ponte os tornaria baratos depois, mas não entram aqui. |

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
| Planejadas | as atuais + `workspaceId`, `startTime`/`endTime`, `customValues`, `label` da ação · `GET ?from&to` · `POST /{id}/duplicate` · `POST /{id}/launch-retroactive` (reordenar ficou de fora — §6, Fase 3) |
| Projetos · categorias | `GET/POST` · `PUT/DELETE /{id}` · `POST /import` · `POST /delete` · `GET/PUT /projects/{id}/categories` |
| Campos personalizados | `GET/POST /custom-fields` · `PUT/DELETE /custom-fields/{id}` |

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
- **Segunda-feira da semana:** `IntegrationsModalsHost` usa `weekBoundsISO()` e `WeekPlanningView` usa
  `weekBoundsOf(addDaysISO(hoje, offset × 7))`; mesma saída.
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
- ~~Cópias do cálculo da segunda-feira~~ — resolvido: `weekBoundsISO`/`weekBoundsOf`.

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
