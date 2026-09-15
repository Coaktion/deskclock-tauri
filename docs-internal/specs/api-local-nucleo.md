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
| Planejadas | as atuais + `workspaceId`, `startTime`/`endTime`, `customValues`, `label` da ação · `GET ?from&to` · `POST /{id}/duplicate` · `POST /planned-tasks/reorder` · `POST /{id}/launch-retroactive` |
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
Semana, duplicar, reordenar, lançar retroativo, iniciar planejada. Revisão das descrições do
Swagger e da seção "API local" do manual (`docs/index.html`), que hoje lista só os 13 endpoints.

### Testes (toda fase)
- Handlers TS em `src/tests/presentation/localApi/`, com repositórios e contexto mockados (Vitest).
- Fase 0: `cargo test` do mapa de pendentes — resposta, timeout, 503 antes da prontidão.
- Verificação manual por `curl` dos endpoints da fase.

## 6. Estado

| Fase | Estado |
|---|---|
| 0 | commitada (2f6683a); verificação manual parcial pelo usuário, ok |
| 1 | implementada, aguardando revisão e verificação manual |
| 2 | pendente |
| 3 | pendente |

**Pendências abertas na revisão da Fase 0** (não implementadas):
- `sortOrder` na criação de planejada: a API usa o máximo +1 do workspace, e o use case
  `CreatePlannedTask` usa 0. Unificar no domínio na Fase 3.
- `GET /planned-tasks` sem data usa `findForWeek` com datas-limite. Trocar por
  `findAll(workspaceId)` no repositório na Fase 3 — hoje a planejada `period` com `period_start`
  NULL fica de fora.
- Restringir `local_api_respond` e `local_api_bridge_ready` à janela `main` nas capabilities do
  Tauri.
- `Bridge.ready` nunca é resetado: recarregar o webview principal dá 504 em vez de 503.

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

**Fora do escopo, registrado:** o deep link `task/start` (`App.tsx`, `handleDeepLinkStart`) resolve
projeto e categoria por nome com `findAll()` sem workspace — o mesmo defeito 2.
