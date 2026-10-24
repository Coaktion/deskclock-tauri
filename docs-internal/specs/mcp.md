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
| `preview_send_to_integration` | `integrations.sendPreview` | Grupos do período no workspace da integração, com estado `pending`/`sent`/`invalid`; `readOnlyHint` (Fase C1) |
| `send_tasks_to_integration` | `integrations.send` | `taskIds` da prévia, cada um envia o grupo inteiro; `openWorldHint: true`, `idempotentHint: false` (Fase C1) |
| `list_export_profiles` | `exportProfiles.list` | Perfis do workspace, em `{ exportProfiles: [...] }` (Fase C2) |
| `create_export_profile` · `update_export_profile` | `exportProfiles.create` · `exportProfiles.update` | Enums inline de formato, separador, duração e data; `columns` plano; o `update` muda só o que veio (Fase C2) |
| `delete_export_profile` | `exportProfiles.delete` | `destructiveHint: true`; o único perfil do workspace não sai (409) (Fase C2) |
| `set_default_export_profile` | `exportProfiles.setDefault` | (Fase C2) |
| `export_tasks` | `export.generate` | Devolve o texto CSV/JSON, não grava arquivo; `readOnlyHint: true`, `openWorldHint: false` (Fase C2) |
| `preview_calendar_import` · `import_calendar_events` | `calendar.importPreview` · `calendar.import` | Eventos do período com a sugestão e `alreadyExists`/`ignored`/`preselected`; o import não confere duplicata (`idempotentHint: false`) (Fase D1) |
| `preview_zendesk_import` · `import_zendesk_tickets` | `zendesk.importPreview` · `zendesk.import` | Tickets atribuídos em aberto; sem dedupe, como o modal (`idempotentHint: false`) (Fase D1) |
| `preview_monday_import` · `import_monday_items` | `monday.importPreview` · `monday.import` | `period` enum; o já importado vem marcado e o import o recusa (`idempotentHint: true`) (Fase D1) |
| `import_monday_projects` · `import_monday_categories` · `read_monday_catalogs` | `monday.importProjects` · `monday.importCategories` · `monday.readCatalogs` | Os três botões da "Importação de dados"; sem argumentos (Fase D1) |
| `list_clockify_entries` · `list_monday_entries` | `clockify.entries` · `monday.entries` | Lançamentos já feitos, só leitura; `readOnlyHint`, `openWorldHint: true`. Clockify por `from`/`to` e `onlyDefaultTags`; Monday pelas quatro janelas do modal (Fase D2) |
| `create_clockify_entry` · `update_clockify_entry` · `delete_clockify_entry` | `clockify.createEntry` · `clockify.updateEntry` · `clockify.deleteEntry` | O formulário de "Apontamentos do Clockify"; editar regrava tudo (`billable` e tags obrigatórios); excluir com `destructiveHint`, só a pedido. `openWorldHint: true`; criar `idempotentHint: false` (Fase D2b) |
| `update_monday_entry` · `delete_monday_entry` | `monday.updateEntry` · `monday.deleteEntry` | Só as atividades do usuário que `list_monday_entries` acha; editar com ausente = atual e só rótulos do board; excluir `destructiveHint`, confirmando com o usuário antes, e limpa `monday_activity_items` (Fase D2b) |
| `get_general_settings` · `update_general_settings` | `settings.getGeneral` · `settings.updateGeneral` | Configurações → Geral; update parcial com os efeitos da aba (autostart, aviso às janelas); `idempotentHint: true` (Fase D3a) |
| `get_overlay_settings` · `update_overlay_settings` | `settings.getOverlay` · `settings.updateOverlay` | Opacidade e snap (Fase D3a) |
| `get_accessibility_settings` · `update_accessibility_settings` | `settings.getAccessibility` · `settings.updateAccessibility` | Modo e acento; o tema muda em todas as janelas (Fase D3a) |
| `get_shortcut_settings` · `update_shortcut_settings` | `settings.getShortcuts` · `settings.updateShortcuts` | A descrição do update avisa que o atalho é global no SO e manda confirmar a combinação (Fase D3a) |
| `toggle_overlay` · `reset_window_positions` | `overlay.toggle` · `settings.resetWindowPositions` | As duas ações das abas; o toggle devolve `visible`, `idempotentHint: false` (Fase D3a) |
| `get_task_share_link` | `share.link` | O "Copiar link" de uma planejada: `link` + o que viaja (Fase D3a) |
| `preview_shared_task` · `accept_shared_task` | `share.preview` · `share.apply` | O modal da tarefa recebida: prévia sem gravar; aceitar com `mode` `plan`/`start`, `openWorldHint: true` (o `start` encerra a ativa) (Fase D3a) |
| `get_sheets_settings` · `update_sheets_settings` | `settings.getSheets` · `settings.updateSheets` | Google Sheets: workspace, planilha, aba, as oito colunas (lista inteira), duração, envio automático; só `connected` da conexão (Fase D3b) |
| `get_calendar_settings` · `update_calendar_settings` | `settings.getCalendar` · `settings.updateCalendar` | Workspace do "Importar eventos" e rastreio automático; a leitura traz as regras de ignorar (Fase D3b) |
| `add_calendar_ignore_rule` · `remove_calendar_ignore_rule` | `calendar.addIgnoreRule` · `calendar.removeIgnoreRule` | Um item por vez; o "Ignorar sempre" é o add com `equals` e o título. Remover não é destrutivo: refaz-se com o add (Fase D3b) |
| `get_drive_backup_settings` · `update_drive_backup_settings` | `settings.getDriveBackup` · `settings.updateDriveBackup` | Backup automático e frequência; a chamada não sobe nada (Fase D3b) |
| `get_clockify_settings` · `update_clockify_settings` | `settings.getClockify` · `settings.updateClockify` | Workspaces (o do Clockify vem de `list_clockify_workspaces`), tags padrão, vínculos e envio automático (Fase D3b) |
| `list_clockify_workspaces` · `list_clockify_catalog` | `clockify.workspaces` · `clockify.catalog` | Leem o Clockify; `readOnlyHint`, `openWorldHint: true` (Fase D3b) |
| `map_clockify_project` · `unmap_clockify_project` | `clockify.setProjectMapping` · `clockify.removeProjectMapping` | Desvincular não é destrutivo: refaz-se com o map (Fase D3b) |
| `set_clockify_category_tags` · `set_clockify_default_tags` | `clockify.setCategoryTags` · `clockify.setDefaultTags` | Seleção inteira, conferida no catálogo do Clockify (Fase D3b) |
| `import_clockify_projects` · `import_clockify_tags` | `clockify.importProjects` · `clockify.importTags` | `destructiveHint: true`: substituem os vínculos do workspace do Clockify, e o vínculo manual de outro nome se perde (Fase D3b) |
| `get_monday_settings` · `update_monday_settings` | `settings.getMonday` · `settings.updateMonday` | Boards, importação automática, campos de Project Stage e Non Billable reason, projetos vinculados e envio automático (Fase D3b) |
| `create_monday_catalog_field` · `refresh_monday_catalog_field` | `monday.createCatalogField` · `monday.refreshCatalogField` | "Criar do Monday" e "Atualizar" dos dois campos; `field` enum inline (Fase D3b) |
| `set_monday_project_board` | `monday.setProjectBoard` | Quadro à mão de projeto sem quadro; lê o schema (`openWorldHint: true`) (Fase D3b) |
| `get_zendesk_settings` · `update_zendesk_settings` | `settings.getZendesk` · `settings.updateZendesk` | Só o workspace (Fase D3b) |
| `get_llm_settings` | `settings.getLlm` | Só leitura: provedor e modelo, sem a URL base (Fase D3b) |
| `run_integration_sync_now` | `integrations.syncNow` | "Enviar agora" do envio diário (Sheets e Monday); `idempotentHint: false`, `openWorldHint: true` (Fase D3b) |
| `list_day_summaries` | `daySummaries.list` | Resumos já gerados do período, do banco local; `readOnlyHint`, `openWorldHint: false` (Fase D2) |
| `generate_day_summaries` | `daySummaries.generate` | Regras da aba Resumo: até 5 dias, cache, hoje regerado, erro por dia, parada na cota; `openWorldHint: true`, `idempotentHint: false` (Fase D2) |
| `get_drive_backup_status` · `run_drive_backup` | `driveBackup.status` · `driveBackup.run` | Estado (só config, `readOnlyHint`) e "Fazer backup agora" (`openWorldHint: true`, `idempotentHint: false`) (Fase D2) |

Ainda sem tool: só as que ficam de fora com motivo próprio (`tasks.toggle`, `history.get`, `plannedTasks.get`,
`workspaces.getActive`, `plannedTasks.update`). Com a Fase D3b a paridade está completa no código (§7, "Paridade no código").

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
| A | implementada e revisada; falta verificação no app de dev |
| B | implementada; falta verificação no app de dev |
| C1 (envio) | implementada; falta verificação no app de dev |
| C2 (exportação) | implementada; falta verificação no app de dev |
| C (C1 + C2) | concluída no código |
| D1 (imports: Agenda, Zendesk, Monday) | implementada; falta verificação no app de dev |
| D2 (lançamentos do Clockify e do Monday, resumo por IA, backup no Drive) | implementada; falta verificação no app de dev |
| D2b (escrita nos lançamentos: Clockify cria/edita/exclui; Monday edita/exclui) | implementada; falta verificação no app de dev |
| D3a (link de compartilhar tarefa; Configurações: Geral, Overlay, Acessibilidade, Atalhos) | implementada; falta verificação no app de dev |
| D3b (ajustes não secretos das integrações) | implementada; falta verificação no app de dev |
| D (D1 a D3b) | concluída no código |

**Decisões da D2b e da D3** (usuário, 2026-10-23): a escrita dos modais de lançamentos entra (D2b), com as exclusões
marcadas `destructiveHint`. A D3 expõe os quatro grupos das Configurações — Geral, Overlay e Acessibilidade, Atalhos
globais e os ajustes não secretos das integrações (envio automático, mapeamentos, workspace por integração, regras de
ignorar da Agenda, backup automático e frequência, campos de Project Stage/Non Billable reason do Monday). Conectar
integração (OAuth, chaves) segue fora.

A Fase D segue o padrão da C: a lógica que mora em modal sai primeiro para um módulo compartilhado (commit `refactor`)
e só então ganha op, endpoint e tool (commit `feat`); o que na tela é seleção vira **prévia + ação**. A verificação no
app de dev de todas as fases fica para o fim, numa rodada só (decisão do usuário).

### Decisões da Fase C1 que a spec não fixava

- **Orquestração única.** Regra pura no domínio: `sendTaskGroups` (carga crua ou representante, validação antes,
  `sendTasks`, `resolveSentTasks`, `markSent`, timestamp só sem recusa/falha), `sendBlockedReason`, `buildSendPayload`
  (`SendTaskGroups.ts`) e `loadTaskSendDays`/`groupSendStatus` (`LoadTaskSendDays.ts`; `groupTasksByDay` saiu do hook
  para `domain/utils/groupTasksByDay.ts`). A montagem por integração (sender, validações, mensagens, timestamp) saiu dos
  três modais para `presentation/integrations/taskSendAdapters.ts` (`buildTaskSendAdapter`, função pura) e o hook
  `useTaskSendAdapter`; os três modais viraram wrappers de 20 linhas. A ponte monta o mesmo adaptador por `deps.taskSend`.
- **Ids das integrações:** as chaves do log de envio, `google_sheets`, `clockify`, `monday` — o enum inline da tool e o
  `id` da rota REST.
- **Envio por `taskIds`**, não por chave de grupo; cada id envia o grupo inteiro (detalhes em `api-local-nucleo.md` §6).
- **Anotações.** Prévia: `readOnlyHint: true`, `openWorldHint: false` (só lê o banco; o sender não é chamado). Envio:
  `readOnlyHint: false`, `destructiveHint: false`, `openWorldHint: true`, `idempotentHint: false` — Sheets e Clockify
  acrescentam linha/lançamento a cada envio (só o Monday faz upsert), e a anotação é uma só para as três.
- **Descrição do envio** manda chamar a prévia antes, mostrar ao usuário o que vai subir e só enviar com a confirmação.
- **Resultado:** `pass_through`; os dois corpos já são objeto.
- **Params como a REST:** prévia `{ id, from, to }` (nulos quando omitidos); envio `{ id, body: { taskIds } }`.

### Decisões da Fase C2 que a spec não fixava

- **Geração num lugar só.** `GenerateTaskExport.ts` (domínio): `resolveExportProfile` (escolhido → padrão → primeiro, o
  `activeProfile` do modal), `loadTasksForExport` (o "Carregar tarefas": `searchTasks` nos limites do dia),
  `mergeTasksForExport` (grupos somados) e `generateTaskExport` (rows + CSV/JSON + `fileName`/`mimeType`/`rowCount`).
  `withCustomColumns` saiu do modal para `exportFormatter.ts`. O modal foi de 653 para 284 linhas: `ProfileForm` foi para
  `ExportProfileForm.tsx`, e a aba Perfis e a lista de seleção para `ExportProfileList.tsx`/`ExportTaskSelection.tsx`,
  com a mesma marcação.
- **Seis tools, uma `op` cada.** Nomes de intenção: `export_tasks` (não `generate_export`). Ops `exportProfiles.*` e
  `export.generate`.
- **Anotações.** `list_export_profiles` e `export_tasks`: `readOnlyHint: true`, `openWorldHint: false` — gerar só lê o
  banco e devolve texto. `create`: `idempotentHint: false` (nome não é único; repetir cria outro). `update` e
  `set_default`: `idempotentHint: true`. `delete`: `destructiveHint: true`, `idempotentHint: true` (a segunda só erra,
  404), descrição manda chamar só a pedido. Todas `openWorldHint: false`.
- **Esquema plano:** enums `#[schemars(inline)]` (`hh:mm:ss` e `dd/mm/yyyy` por `serde(rename)`), coluna
  `ExportColumnArg` inline, campos comuns de criação e edição em `ExportProfileFields` achatado. Teste
  `esquemas_da_exportacao_declaram_os_enums_e_saem_planos`.
- **Params como a REST.** `list` manda `{ workspaceId }`; `create` `{ body }` com o `workspaceId` no corpo; `update`
  `{ id, workspaceId, body }`; `delete`/`set_default` `{ id, workspaceId }` (`scoped_id_params`); `export_tasks`
  `{ body }` só com o que veio (`{}` = hoje, perfil padrão, workspace ativo).
- **Workspace da geração.** A ponte escopa as tarefas pelo workspace pedido (ausente = ativo), como o `history.list`.
  O modal não escopava — o `searchTasks` dele nunca recebeu `workspaceId` (vinha de antes dos workspaces) e exportava as
  concluídas de **todos** os workspaces, com projeto/categoria resolvidos só no catálogo do ativo (os de outro workspace
  saíam em branco). **Corrigido em 2026-10-23** a pedido do usuário: o modal passa o workspace ativo, e tela e API geram o
  mesmo conteúdo para a mesma entrada.

### Decisões da Fase D1 que a spec não fixava

- **Inventário** (o que a UI importa, de onde, e o que grava):
  - *Google Agenda* — "Importar eventos" (rail e Integrações → Google). Lê `getEvents` do período e as planejadas do
    destino; o usuário marca eventos e edita projeto, categoria, agendamento e dias; chaves "ação de abrir URL" e
    "rastrear reuniões". Grava planejadas (`importCalendarEvents`) e, com a chave, `calendar_tracked_meetings`.
  - *Zendesk* — "Importar tickets" (rail e Integrações → Zendesk). Lê os tickets atribuídos em aberto; o usuário marca e
    edita nome, projeto, categoria, ação e agendamento. Grava planejadas (`importTickets`).
  - *Monday, itens* — "Importar itens como planejadas" (rail e card do Monday). Lê itens do usuário nos boards
    vinculados, as planejadas da janela e `monday_imported_items`; o usuário filtra o período, marca e edita categoria e
    etapa. Grava planejadas e o vínculo.
  - *Monday, Importação de dados* (Integrações → Monday): Projetos (Portfólio → projetos, vínculos na config, categorias
    por projeto), Catálogos (board de Report → `mondayFieldCatalogs`) e Categorias (Activity Types → categorias). Sem
    seleção: uma op cada.
- **Ops por integração, não uma op genérica com `id`.** Os corpos não têm nada em comum (período e dias na Agenda, nome e
  data no Zendesk, etapa no Monday), e uma tool por op com argumentos-união confundiria o modelo. Prefixos `calendar.`,
  `zendesk.`, `monday.`; nenhum espera o render. Na REST, rotas fixas sob `/integrations/<id>/…` com os ids
  `google_calendar`, `zendesk`, `monday`; convivem com as `{id}` do envio (teste de rota cobre `/integrations/monday/send`).
- **Refatoração (sem mudar comportamento):** a busca, a sugestão, os sinais e a gravação saíram dos três modais para o
  domínio; os três cards do Monday passaram a chamar `mondayCatalogImports.ts`. O `ImportCalendarModal` foi de 941 para
  ~590 linhas (a linha e o editor de evento foram para `ImportCalendarEventRow.tsx`, mesma marcação; o baseline de
  `<button>` do `componentPrimitives` acompanhou a mudança de arquivo). O `useMondayProjectsTracker` não foi tocado: a
  varredura diária difere do botão (sem `forceSchemaRead` fora da migração, sem limpar o erro) e segue com cópia própria.
- **Anotações.** Prévias: `readOnlyHint: true`, `openWorldHint: true` (leem Google, Zendesk e Monday). Imports:
  `readOnlyHint: false`, `destructiveHint: false` (só criam), `openWorldHint: true` (releem o serviço para achar os ids).
  `idempotentHint`: `false` na Agenda e no Zendesk (nenhum dos dois confere duplicata — repetir cria outra planejada);
  `true` em `import_monday_items` (o já importado dá 409) e nos três botões do Monday (projeto e categoria existentes são
  reaproveitados; a semeadura pula o que não mudou; reler catálogos regrava o mesmo). `import_monday_categories` é
  `openWorldHint: false`: usa só os rótulos já guardados.
- **Ausente × `null`** no projeto e na categoria das linhas: `Patch<T>` com `present`, como na Fase A — ausente mantém a
  sugestão, `null` deixa sem. Linhas são structs inline com `#[serde(flatten)]` dos campos de catálogo; enums inline
  (`ImportScheduleType`, `TicketScheduleType`, `MondayImportPeriodArg`) — o esquema sai plano, com `null` no enum dos
  opcionais (teste `esquemas_dos_imports_declaram_os_enums_e_saem_planos`).
- **Params como a REST.** Prévias: `{ from, to }` (nulos quando omitidos), `{}`, `{ period }`. Imports: `{ body }` com o
  que veio. Os três botões: `{}`.
- **Fora (com motivo):** "Ignorar sempre" do import da Agenda (grava regra de ignorar — é configuração da integração, D3);
  `MondayCatalogField` (criar/vincular o campo personalizado de Project Stage e Non Billable reason — configuração, D3);
  "Buscar itens agora" e "Buscar eventos agora" (disparam os rastreadores automáticos, não os imports manuais).
- **Diferenças de ordem do refactor, aceitas na revisão:** nos cards de projetos e categorias do Monday, o
  `notify*Changed` passou para dentro do `run*` compartilhado (a ponte também precisa dele) e roda antes do
  `onImported`/recarga do card, não depois; na Agenda, o `PLANNED_TASKS_CHANGED` sai depois do rastreio de reuniões, que
  nunca lança. O nome do ticket do Zendesk recebe `trim` na API; o modal não aparava.

### Decisões da Fase D2 que a spec não fixava

- **Inventário** (o que a UI faz, de onde, e o que grava):
  - *Apontamentos do Clockify* (`ClockifyEntriesModal` + `useClockifyEntries`, aberto pelo `IntegrationsModalsHost`). Lê
    `listTimeEntries` do usuário no workspace do Clockify configurado, num período (Hoje, 7 dias, 30 dias, Este mês ou
    Personalizado; padrão Hoje), e a lista de projetos e tags. O usuário escolhe o período e liga/desliga "Apenas com tags
    padrão" (ligado ao abrir quando há tag padrão). A lista esconde o apontamento em andamento. **O modal também cria,
    edita e exclui apontamentos no Clockify** (`createTimeEntry`/`updateTimeEntry`/`deleteTimeEntry`).
  - *Atividades no Monday* (`MondayEntriesModal` + `useMondayEntries`). Lê as atividades do usuário nos boards dos
    projetos com board, uma busca só desde o piso (`searchFloorDayISO`), recortada por quatro janelas (padrão 7 dias). **O
    modal também edita (nome, horas, billable, Activity Type, Project Stage) e exclui** a atividade no Monday — a exclusão
    pede confirmação e limpa `monday_activity_items`.
  - *Resumo por IA* (aba Resumo do Histórico, `useDaySummaries` chamado pelo `HistoryPage`). Lê as tarefas concluídas dos
    dias do resultado da busca (com os filtros dela) e `day_summaries`; chama o provedor; grava `day_summaries` e a cota
    (`llmLastLimits`/`llmLastLimitsAt`). O usuário escolhe só a busca e o "Tentar novamente". Sem provedor a aba não existe.
  - *Backup no Drive* (subseção "Backup do banco" do card do Google). Mostra o último backup e a última falha (com o aviso
    de reconectar no 403 do escopo); "Fazer backup agora" roda o `DriveBackupRunner` (snapshot sem os segredos, upload,
    carimbo, poda além de `driveBackupKeepCount`). O toggle do automático e a frequência gravam config — ficam para a D3.
    Restaurar não tem UI (`telas/dados.md`); não há op.
- **Ops por frente, uma por ação de leitura ou execução:** `clockify.entries`, `monday.entries`, `daySummaries.list`,
  `daySummaries.generate`, `driveBackup.status`, `driveBackup.run`. Nenhuma espera o render.
- **Refatoração (sem mudar comportamento):** a rodada do resumo saiu do hook para `presentation/integrations/daySummaries.ts`
  (`runDaySummaries`: o `summarizeWorkdays` com hoje como `unfinishedDayISO` e o erro traduzido por `describeLlmError`;
  `saveLlmLimits`; `llmConnected`). As regras de lote continuam todas no `summarizeWorkdays`; a aba e a ponte chamam o mesmo
  `runDaySummaries`. O que a aba tem de próprio — a chave `workspace|dias`, o `runId` contra corrida, o `enabled` — é estado
  de tela e ficou no hook. A lista do Clockify (filtro, agrupamento, duração, `projectDisplayName`) foi para
  `domain/usecases/clockify/clockifyEntries.ts`; a busca e a montagem das atividades do Monday (`loadMondayEntries`,
  `mondayEntriesInRange`, janelas, agrupamento) para `domain/usecases/monday/mondayEntries.ts`. O aviso de reconectar do
  backup virou `driveBackupNeedsReconnect`.
- **Workspace do resumo é o pedido, ausente = ativo** — o resumo segue o workspace ativo, não um da integração (exceção
  declarada em `integracoes/llm.md`); a API aceita `workspaceId` como as demais rotas com escopo.
- **Dias da geração = os da busca do Histórico** (`searchHistory`, extraída do `listHistory`): período e os filtros nome,
  projeto, categoria e billable, como a aba recebe da página. Os filtros escolhem os dias; o resumo de cada dia cobre todas as
  tarefas nomeadas dele, como na tela.
- **Leitura dos resumos** pede o mesmo provedor configurado (409 sem ele), por paridade: sem provedor a aba nem aparece. O
  período da leitura tem teto de 366 dias (400 acima) — regra só da API, porque a consulta é dia a dia.
- **Prazo maior na ponte para `daySummaries.generate` e `driveBackup.run`** (12× o padrão: 2 min). Cinco chamadas em série
  ao provedor, ou o `VACUUM INTO` + upload, passam fácil dos 10 s; com o prazo padrão o cliente recebia 504 com o trabalho
  seguindo, e um retry faria outro backup. **E elas rodam numa fila própria no TS** (`runsInLongQueue`, `dispatch.ts`;
  achado da revisão): na fila principal, quem chegasse atrás estouraria os 10 s e ainda executaria depois — um
  `tasks.start` daria 504 e iniciaria a tarefa mesmo assim, e o retry a iniciaria de novo. Entre si as duas seguem uma por
  vez; com o resto correm em paralelo, como na tela, onde o backup e a aba de resumo não travam o app.
- **A janela `month` dos lançamentos do Monday** sai do `todayISO` (`YYYY-MM-01`), não de um segundo `new Date()`: só
  difere se o mês virar entre as duas leituras, e assim o período fica coerente com o "hoje" da mesma chamada.
- **Falha do backup → 502** com a mensagem que o runner gravou (a mesma da linha de falha da tela). Google não conectado → 409
  (frase da API: a subseção só fica apagada). O estado responde 200 sempre, com `connected`.
- **Clockify/Monday não configurado → 409** com o aviso do modal sem o "antes de abrir esta janela". Monday sem projeto com
  board também é 409, como o aviso.
- **Anotações.** `list_clockify_entries`/`list_monday_entries`: `readOnlyHint`, `openWorldHint: true`. `list_day_summaries` e
  `get_drive_backup_status`: `readOnlyHint`, `openWorldHint: false` (banco local e config). `generate_day_summaries`:
  `destructiveHint: false` (só substitui o resumo cacheado de hoje), `idempotentHint: false` (repetir regera hoje — outra
  requisição paga), `openWorldHint: true`. `run_drive_backup`: `destructiveHint: false` (a poda apaga só o que passa da
  quantidade que o usuário escolheu guardar — a descrição diz), `idempotentHint: false` (cada chamada sobe um arquivo),
  `openWorldHint: true`.
- **Nada de segredo na resposta.** As fontes guardam o cliente já montado pela fábrica; os DTOs são montados campo a campo
  (sem chave, token, `apiKey`, refresh token). O resumo manda ao provedor só o que a aba manda (nome, projeto, duração).
- **Params como a REST.** `list_clockify_entries` manda `{ from, to, onlyDefaultTags }` com o booleano em texto, como a query;
  `list_monday_entries` `{ period }`; `list_day_summaries` `{ from, to, workspaceId }`; `generate_day_summaries` `{ body }`
  só com o que veio; as do backup `{}`.
- **Fora (com motivo):** criar, editar e excluir apontamento do Clockify e editar e excluir atividade do Monday — os modais
  fazem, mas o pedido desta fase foi a leitura; são escrita em sistema externo, a exclusão do Monday pede confirmação contra o
  §1, e o desenho (anotações, guarda dos rótulos de `buildActivityColumnValues`, limpeza do rastreio) pede decisão do
  usuário. Ficaram como dívida da paridade — entraram na D2b (abaixo). O toggle e a frequência do backup automático são configuração (D3).
- **Diferença conhecida:** depois de um backup pela API, a subseção aberta continua mostrando o "Último backup" que leu ao
  montar (ela semeia da config só no `isLoaded`); reabrir a tela atualiza. Igual ao agendador automático.

### Decisões da Fase D2b que a spec não fixava

- **Inventário das escritas.** *Clockify* (`ClockifyEntriesModal` + `useClockifyEntries`): "Novo apontamento" (descrição,
  projeto pelo autocomplete, tags, billable, dia, início e fim `HH:MM`; abre com as tags padrão, billable desligado, agora
  → +1h), o lápis (o mesmo formulário com os valores da linha, regravando tudo pelo `PUT`) e a lixeira (imediata). O Salvar só
  habilita com descrição e projeto. *Monday* (`MondayEntriesModal` + `useMondayEntries`): o lápis (nome, horas, billable só
  com a coluna Billing type, Activity Type e Project Stage pelos rótulos do board; datas não editáveis) e a lixeira com
  confirmação na linha, que apaga o item e o rastreio em `monday_activity_items`.
- **Refatoração (sem mudar comportamento):** `domain/usecases/clockify/clockifyEntryPayload.ts` (a validação do Salvar, o
  casamento do projeto pelo nome exibido e o payload, com a virada da meia-noite) e `domain/usecases/monday/mondayEntryWrite.ts`
  (`MondayEntryPatch` saiu do hook; a validação, o `column_values` com a guarda dos rótulos e as duas gravações). Modal e hook
  chamam os mesmos; os toasts, o estado de edição e a lista sem rebusca seguem na tela.
- **Ops por integração e ação**, cinco, sem esperar o render. REST sob as rotas da leitura: `POST` na coleção do Clockify,
  `PUT`/`DELETE` em `/{id}`; no Monday, `id` = `itemId`. Os handlers Rust ficam em `handlers/entry_writes.rs`.
- **Clockify editar regrava tudo** (sem "ausente mantém"): o `IClockifyApi` não lê apontamento por id, e o formulário também
  manda o payload inteiro. `billable` e as tags são obrigatórios na edição, para um campo esquecido não apagar as tags.
- **Projeto e tags do Clockify por id ou por nome** (o id vence), resolvidos contra `listProjects`/`listTags` do workspace do
  Clockify: o princípio "por nome" das tools (§3), e o modelo só tem os ids que a leitura mostrou. Inexistente → 409.
- **Monday editar é parcial** (ausente = atual), porque a atividade já é carregada para achar board e mapeamento — e só entre as
  do usuário, como a tela (fora delas → 404). O que a tela não deixa escolher vira 400 em vez de sumir calado: rótulo fora dos
  do board (a mensagem lista as opções) e `billable` em board sem Billing type. `null` nos rótulos = a opção vazia do select
  (não escreve a coluna; o board mantém o valor — a tela não limpa Activity Type nem Project Stage).
- **Mensagens de validação são da API**: a tela não as tem (desabilita o botão). Constantes ao lado da regra
  (`CLOCKIFY_ENTRY_*`, `MONDAY_ENTRY_*`).
- **Respostas.** Clockify: o que foi gravado (`id`, horários ISO, `projectId`, `tagIds`) — o `PUT` do Clockify não devolve
  projeto nem tags hidratados. Monday: o DTO da leitura com a atividade como ficou, sem rebuscar (a exclusão e a edição do
  Monday demoram a aparecer na consulta, ver `useMondayEntries`). Exclusões: 204 → `{}` na tool.
- **Anotações.** Todas `readOnlyHint: false`, `openWorldHint: true`. `create_clockify_entry`: `idempotentHint: false`.
  Edições: `idempotentHint: true`. Exclusões: `destructiveHint: true`, `idempotentHint: true` (a segunda só erra); a descrição
  manda chamar só a pedido explícito, e a do Monday manda confirmar com o usuário antes, nomeando atividade, board e horas.
- **Erros do serviço**: como na D2, sobem e viram 500 com a mensagem. Não configurado: 409 com o aviso da leitura.
- **Achado, não mexido:** a edição do Monday reescreve o Status com o rótulo que a atividade já tem (`entry.statusLabel`), sem
  conferir contra `statusLabels` como o envio faz. Se o rótulo tiver saído do board, o Monday pode recusar a edição inteira — a
  armadilha que a guarda do envio fechou. Mantido igual à tela (a API usa a mesma função); corrigir é decisão do usuário.

### Decisões da Fase D3a que a spec não fixava

- **Inventário.** *Geral* (`GeralTab`): nome (blur → `userName`), iniciar com o computador (`startOnBoot` + autostart do SO;
  a leitura vem de `isEnabled`), fechar ao perder foco, rail de integrações, descartar < 1 min, arredondamento (toggle, fichas
  de slot, fichas de tolerância), metas diária (1–24) e semanal (1–168), primeiro dia da semana e exibir fim de semana (os dois
  emitem `OVERLAY_CONFIG_CHANGED`), e o botão "Redefinir posições salvas das janelas" (quatro posições para `{-1,-1}`).
  *Overlay* (`OverlayTab`): botão Mostrar/Ocultar (`toggle_overlay`), opacidade 20–100 e snap (os dois emitem). *Aparência*
  (`AparenciaTab`): modo e acento (repinta, grava, emite). *Atalhos* (`AtalhosTab`): os quatro atalhos, gravados pelo teclado
  (`buildAccelerator`), registrados todos de uma vez por `update_shortcuts`, gravados os quatro, e os avisos de Wayland e de
  recusa. *Link*: "Copiar link" da linha planejada (`copyPlannedTaskLink`), o `ShareTaskModal` (prévia editável, "Adicionar
  como planejada", "Iniciar agora" com aviso) e o `PasteDeepLinkModal` (valida a forma e entrega ao `open_deep_link` do Rust).
- **Refatoração (sem mudar a tela):** `settingsRules.ts` e `shortcuts.ts` (domínio: faixas, opções, `toggleRoundingSlot`,
  tabela dos atalhos, `shortcutRegistrations`, os textos dos avisos), `settingsEffects.ts` (presentation: os efeitos de cada
  chave, chamados pelas quatro abas e pelo `useGlobalShortcuts`), `plannedTaskShareLink` e `sharedTaskStartWarning`
  (`sharePayload.ts`) e `planSharedTask` (domínio), usados pela linha e pelo modal.
- **Uma porta por grupo, não key-value**: `SettingsPort` com `get`/`update` de cada grupo e as duas ações. A validação por chave
  fica no handler; chave fora do grupo é 400.
- **`weekStartsOn` por nome** (`monday`/`sunday`) na API e na tool, e não o `0`/`1` da config: enum de inteiro confunde o modelo.
- **Atalho recusado pelo SO não é 400.** A tela grava o recusado e avisa; a API faz o mesmo (200 com `failedShortcuts` e o
  `warning` da tela). 400 só para o que a tela não deixa acontecer: forma fora do gravador e — regra só da API — o mesmo atalho
  em duas ações. Recusar com 400 exigiria desfazer o registro já feito pelo `update_shortcuts`, que a tela não faz.
  O conflito é checado antes de registrar, então o 400 não deixa nada pela metade — e **só conta o conflito que o PATCH
  cria** (achado da revisão): a tela deixa gravar o mesmo atalho em duas ações, e um conflito já gravado não pode barrar
  a edição de uma terceira (`shortcutConflictError(values, changed)`).
- **Nenhuma configuração espera o render** (`waitsForNextCommit`): a ponte lê a config por função (`weekStartsOn: () => …`), e
  tema e fim de semana não entram no retrato. `share.apply` espera (o `start` troca a tarefa em execução).
- **`toggle_overlay` devolve a visibilidade** (`bool`), para a tool dizer se mostrou ou escondeu; a tela ignora o retorno.
- **Link só de planejada.** O Histórico não tem "Copiar link"; nada foi inventado para ele. A prévia e o aceite leem só
  `task/share`: `navigate` e `retroactive` só mexem na tela, e `task/start` é o `start_task`.
- **Aceitar grava o que o link resolveu**; o modal deixa editar antes, a tool manda editar depois (`update_planned_task`,
  `update_running_task`). Sem argumentos-união de edição na tool.
- **Anotações.** Leituras: `readOnlyHint`, `openWorldHint: false`. Updates de configuração e `reset_window_positions`:
  `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: false` (autostart, atalhos e tema são do sistema local).
  `toggle_overlay`: `idempotentHint: false`. `accept_shared_task`: `destructiveHint: false` (o `start` encerra a ativa pelas
  regras de parada, como `start_task`), `idempotentHint: false`, `openWorldHint: true` (encerrar dispara o envio por tarefa).
- **Params como a REST:** GETs e ações `{}`; updates e as três do link `{ body }` só com o que veio.
- **Diferença conhecida:** a aba aberta não relê a config depois de um `PATCH` pela API (ela semeia no `isLoaded`), como no
  backup da D2; reabrir a tela atualiza. As outras janelas recebem o `OVERLAY_CONFIG_CHANGED` das chaves que o emitem.

### Decisões da Fase D3b que a spec não fixava

- **Inventário** (chave · tipo · efeito; "segredo" e "interno" não entram):
  - *Google (conexão única)* — `googleAccessToken`/`googleRefreshToken`/`googleTokenExpiry` (segredo), `googleUserEmail`
    (conta). `connected` = há refresh token. As três subseções ficam apagadas sem conexão.
  - *Sheets* — `sheetsDeskclockWorkspaceId` (texto), `integrationGoogleSheetsSpreadsheetId` (texto, aparado no blur),
    `integrationGoogleSheetsSheetName` (texto, em branco = `DeskClock`), `integrationGoogleSheetsColumnMapping` (as oito
    colunas: arrastar, ligar, renomear), `integrationGoogleSheetsDurationFormat` (`HH:MM`/`HH:MM:SS`), o envio automático
    (`integrationGoogleSheetsAutoSync`, `sheetsAutoSyncMode`, `sheetsAutoSyncTrigger`, `sheetsAutoSyncTime`) e o "Enviar
    agora". Internos: `sheetsDailySyncLastTimestamp`, `sheetsAutoSyncLastFiredDate`. Nenhuma chave tem efeito além de gravar.
  - *Agenda* — `calendarDeskclockWorkspaceId`, `calendarAutoTrackingEnabled` (bool), `calendarIgnoreRules` (lista; a tela
    acrescenta e remove item a item; o "Ignorar sempre" do import acrescenta `equals` + título). Interno:
    `calendarLastSyncError`. "Buscar eventos agora" dispara o rastreador (fora, como na D1).
  - *Drive* — `driveBackupEnabled` (bool), `driveBackupFrequency` (`daily`/`weekly`/`monthly`). Internos: `driveBackupFolderId`,
    `driveBackupLastRunAt`, `driveBackupLastError`; `driveBackupKeepCount` não tem controle na tela.
  - *Clockify* — `clockifyApiKey` (segredo), `clockifyUserEmail`/`clockifyUserId` (conta). `clockifyDeskclockWorkspaceId`;
    `clockifyActiveWorkspaceId` + `clockifyActiveWorkspaceName` (o seletor, sobre `clockifyWorkspaceCache`, que o "Atualizar
    lista" regrava); `clockifyProjectMapping` (por projeto: vincular, X), `clockifyCategoryMapping` (por categoria: seleção de
    tags), `clockifyDefaultTagIds` (seleção); os dois "Importar do Clockify"; o envio automático (`clockifyAutoSync*`). Sem
    "Enviar agora". Internos: `clockifyDailySyncLastTimestamp`, `clockifyAutoSyncLastFiredDate`.
  - *Monday* — `mondayApiKey` (segredo), `mondayUserId/Name/Email` (conta). `mondayDeskclockWorkspaceId`,
    `mondayPortfolioBoardId`/`mondayReportBoardId` (texto, aparado), `mondayAutoImportEnabled` (bool), envio automático
    (`mondayAutoSync*`) e "Enviar agora", `mondayProjectStageFieldId`/`mondayNonBillableReasonFieldId` (seleção de campo +
    "Criar do Monday"/"Atualizar"), o quadro à mão dentro de `mondayProjectMapping`. Internos: `mondayFieldCatalogs` (cache;
    a leitura é a `read_monday_catalogs` da D1), `mondayProjectsSyncLastDate`, `mondayProjectsLastSyncError`,
    `mondayMappingCacheVersion`, o resto do mapeamento. `mondayReportTypeFieldId`: card adormecido, fora.
  - *Zendesk* — `zendeskSubdomain`/`zendeskClientId` (conexão, travados conectado), `zendeskClientSecret`/tokens (segredo),
    `zendeskUserEmail` (conta). Só `zendeskDeskclockWorkspaceId` é ajuste.
  - *IA* — `llmApiKey` (segredo), `llmProviderId`/`llmBaseUrl`/`llmModel` só pelo modal de conexão, que testa a chave; `llmLastLimits*`
    (cache). Sem workspace, de propósito. Fica só leitura (`providerId`, `model`); a URL base fica fora porque um gateway pode
    levar credencial na query.
- **Refatoração (sem mudar a tela):** a regra que morava nos componentes saiu para `integrationSettingsRules.ts`,
  `clockifyMappings.ts`, `mondayCatalogFields.ts` e `removeIgnoreRule` (domínio) e para `clockifySettings.ts`,
  `mondayCatalogFields.ts` e `runMondaySetProjectBoard` (presentation/integrations). `ClockifyMappingsSection`,
  `ClockifyWorkspaceSection`, `MondayCatalogField`, `MondayImportSection`, `MondayProjectsImport`, `CalendarIgnoreRules` e a
  aba da planilha chamam os mesmos. O `parsePatch` e os validadores da D3a foram para `localApi/patchRules.ts`. `autoSyncIntegrations.ts` e o `isLlmConnected` saíram de `sections/integrations/` para `presentation/integrations/` (a porta não importa seção de tela). A porta compõe `clockifySettingsPort.ts` e `mondaySettingsPort.ts`. Diferenças de
  ordem aceitas: nos imports do Clockify o `notify*Changed` roda dentro do import, antes da recarga e do toast (como na D1);
  no "Atualizar lista" o cache é gravado antes de a lista aparecer.
- **Uma porta, um grupo por integração**, não key-value: `deps.integrationSettings`. Ids das rotas = os de sempre
  (`google_sheets`, `google_calendar`, `clockify`, `monday`, `zendesk`) mais `google_drive` e `llm`; rotas fixas sob
  `/settings/integrations/` e ações sob `/integrations/<id>/`, que convivem com as `{id}` do envio (teste de rota).
- **Trocar o workspace de uma integração não tem aviso nem reconciliação** — divergência com o pedido: a tela só faz
  `config.set` (`DeskclockWorkspaceRow`); o aviso de integrações presas existe só na exclusão de workspace
  (`integrationsBoundToWorkspace`). A API faz o mesmo, mais conferir que o workspace existe (409). Idem o envio diário: o
  agendador lê a config a cada 30 s e não há o que reiniciar.
- **Sem conexão, editar é 409**, porque a tela não mostra o controle. A leitura funciona sempre e diz `connected: false`.
- **Listas pela semântica da tela.** Regras de ignorar: item a item. Vínculos do Clockify: item a item (projeto: vincular e
  desvincular; categoria: a seleção de tags, que a tela grava inteira — lista vazia continua vínculo). Tags padrão e colunas do
  Sheets: a lista inteira, porque o controle da tela é uma seleção (tags) ou uma ordem (colunas).
- **Validação contra o serviço onde a tela só oferece o que existe:** projeto e tags do Clockify conferidos no catálogo lido na
  hora (409); o workspace do Clockify, no cache que `list_clockify_workspaces` regrava (409), para o `update` não ir à rede.
  O projeto/categoria do DeskClock pode ser de qualquer workspace (a tabela de vínculos não é escopada do lado do DeskClock; a
  tela lista os do workspace ativo).
- **Quadro à mão só em projeto sem quadro** (409 se já tem), como a tela, que só mostra o campo nesses; board que não serve →
  409 com o motivo do toast, nada gravado. "Criar do Monday" com campo já vinculado → 409 (a tela troca o botão por
  "Atualizar"); sem rótulos → 409 com a dica da tela.
- **"Enviar agora" é ação desta fase** (op `integrations.syncNow`): só Sheets e Monday, só com envio diário ligado (onde o botão
  aparece), mesma guarda da planilha e a frase do toast na resposta; erro do serviço → 502.
- **Anotações.** Leituras de config: `readOnlyHint`, `openWorldHint: false`; as duas listas do Clockify leem o serviço
  (`openWorldHint: true`; a de workspaces regrava só o cache que o seletor mostra, por isso continua `readOnlyHint`). Updates:
  `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: false` — ligar o envio ou o backup muda o que o agendador
  faz depois; a chamada não envia. Vínculos, tags e quadro: `openWorldHint: true` (conferem no serviço). **Remover regra de
  ignorar e desvincular projeto não são destrutivos**: a perda se refaz numa chamada com os valores que a leitura mostrava.
  **Os dois imports do Clockify são `destructiveHint: true`**: substituem os vínculos do workspace do Clockify, e vínculo
  manual de nome diferente se perde sem como recuperar. `run_integration_sync_now`: `idempotentHint: false`.
- **`waitsForNextCommit`:** nenhuma op da D3b — nada muda a tarefa em execução, o workspace ativo nem a lista de workspaces.
- **Diferença conhecida:** como na D3a, a tela de Integrações aberta não relê a config depois de um `PATCH` pela API (semeia no
  `isLoaded`); reabrir atualiza.

**Paridade no código:** com a D3b, tudo que a UI faz tem op, endpoint e tool. Ficam fora de propósito: conectar e desconectar
integrações (OAuth, chaves, tokens, subdomínio e client do Zendesk, provedor/modelo/URL da IA), desfazer (`Restore*`), executar
a ação ⚡, "Buscar eventos agora" e "Buscar itens agora" (disparam rastreadores), o card adormecido do Report Type, restaurar
backup (sem UI), estado de janela e as ops com motivo em `excluded`.

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
