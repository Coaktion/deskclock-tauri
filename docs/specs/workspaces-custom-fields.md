# Workspaces, custom fields e expansão da integração Monday

- **Date:** 2026-07-30
- **Author:** Eduardo Meira
- **Project classification:** Current (React 19, TS 5, Vitest 3, CLAUDE.md + CI presentes)
- **Coverage tier:** A (`domain/usecases/`, repositórios, migrations) / B–C (UI, sem testes de
  renderização — padrão do projeto, §7.6 do `CLAUDE.md`)
- **Estado do ritual SDD:** Brainstorm ✅ · Plan ✅ · **Execute concluído** — Fases 0 a 5 entregues
  (0 e 1 validadas no app em 2026-07-30/31; 2 a 5 em 2026-07-31). Falta a validação humana da
  Fase 5 no app, com token real

> Este documento é a **ordem de trabalho** para a fase de Execute. Foi escrito para ser lido
> por um agente sem acesso à conversa que o originou — todas as decisões e o porquê delas
> estão aqui.

---

## Handoff — leia antes de tocar em qualquer coisa

> Os itens 1 a 3 originais (Monday sem commit, índice do GitNexus desatualizado, spike bloqueante)
> foram resolvidos em 2026-07-30. O que segue valendo:

1. **Branch:** seguir em `feat/monday-integration`. O nome ficou menor que o escopo.
2. **A migration 011 já roda.** Ela renomeia `projects`/`categories` para `*_pre_011` e reconstrói
   `tasks`/`planned_tasks`/`export_profiles`. As tabelas `_pre_011` ficam no banco de propósito:
   são a única rota de rollback. Ver §1.0 para o porquê da técnica.
3. **A paleta de cores vem do Tailwind v4**, que expõe 26 slots como CSS custom properties. Um
   grep em `src/index.css` mostra só 4 porque ali ficam apenas os *overrides* de tema — não
   conclua que a paleta é pequena.
4. **`workspaceId` é ambíguo no código.** Em `importMondayProjects` e `ClockifyMappingsSection`
   ele designa o workspace do **Monday/Clockify**; o do DeskClock nesses arquivos chama-se
   `deskclockWorkspaceId`.
5. **Cada janela do Tauri tem seu próprio `WorkspaceProvider`.** Qualquer estado novo que precise
   ser igual entre janela principal e overlays tem de viajar por evento — ver `WORKSPACE_CHANGED`.
   O sintoma de esquecer isso é o overlay operar no workspace anterior sem erro nenhum.
6. **Escopo que para no repositório não é escopo.** O filtro de workspace existir em
   `findByDateRange` não significa que a tela o use. Isso já reincidiu **três vezes** e em três
   formas diferentes, então desconfie por padrão:
   - _omissão_ — `RetroactivePage` e `getWeekTotal` chamavam sem o argumento, que é o caminho
     das integrações (§6.7) e devolve todos os workspaces;
   - _sem gatilho_ — `useHistory` filtrava certo, mas a busca só roda quando o usuário a pede;
     trocar de workspace não emite `TASKS_CHANGED` e a tela ficava com o resultado anterior;
   - _closure velho_ — `useMeetingTracker` passava `workspaceId` dentro de um efeito montado uma
     vez só, congelando o valor da montagem. Ali a saída é ref, como o hook já fazia.

   Ao escopar algo novo, verifique os três: chega o argumento, algo dispara o recarregamento, e o
   valor lido é o atual.
7. **Project Stage e Activity Type não são atributos de categoria.** Desde a Fase 4 a etapa é o
   campo personalizado apontado por `mondayProjectStageFieldId` — e o que a tarefa grava é o **id
   da opção**, não o rótulo. O Activity Type é o **nome** da categoria, importado do board. Não
   existe mais tabela de mapeamento para nenhum dos dois.
8. **As duas telas de entrada são espelhadas.** Lançamento Manual e Planejamento usam formulário
   em coluna à esquerda e lista à direita, com o vocabulário visual dos campos em
   `presentation/components/fieldStyles.ts`. **Não duplicar essas classes** — mexer numa tela sem
   a outra as desalinha em silêncio.

---

## Problem & constraints

### Problema

Sete mudanças pedidas que parecem independentes e não são:

1. Importar atividades do Monday para dentro do DeskClock.
2. Cadastro de projetos/categorias é global e plano — cada integração disputa o mesmo balaio.
3. Alternar entre contextos facilmente; integrações são externas ao workspace e enxergam tudo.
4. Workspaces dinâmicos; usuários existentes ganham um workspace "Padrão" com todo o legado.
5. Workspace = id, nome e cor (derivada do hash do nome, editável).
6. Multi-select na tela de Dados para exclusão em massa.
7. Custom fields na tarefa (Text, Multiline, Select, Checkbox) além dos campos de sistema.

O encadeamento real:

- **O item 7 é pré-requisito do item 1.** Hoje "Project Stage" está modelado como
  `projectStageLabel` dentro de `MondayCategoryMapping`, ou seja, como atributo da categoria.
  Não é: é um campo próprio da atividade. Sem custom fields, o mapeamento continua torto.
- **O item 2 é pré-requisito de tudo.** Muda a chave de unicidade das duas tabelas mais
  referenciadas do banco (`projects.name UNIQUE`, `categories.name UNIQUE`).

### Restrições

**A favor:**

- Todo o SQL de projetos/categorias está confinado a `ProjectRepository.ts` e
  `CategoryRepository.ts`. Toda a UI passa por `useProjects`/`useCategories`. O ponto de corte
  para escopar por workspace é pequeno e único.
- A integração Monday **não tem base instalada** (nenhum commit). `MondayCategoryMapping` pode
  ser remodelado sem back-compat.
- `AutoSyncControls`, `TaskSendModal`, `useTaskSendSelection`, `ClockifyEntriesModal` e
  `ImportCalendarModal` já existem como trilhos genéricos (§9.4 do `CLAUDE.md`).

**Contra — riscos que sobreviveram ao brainstorm:**

1. **A migration de `projects`/`categories` é a única parte sem rede.** Trocar `name UNIQUE`
   por `UNIQUE(workspace_id, name)` exige recriar a tabela no SQLite. Com
   `PRAGMA foreign_keys = ON` (ativo em `001_initial_schema.sql`), `DROP TABLE projects`
   dispara o `ON DELETE SET NULL` de `tasks.project_id` e **desvincula todo o histórico em
   silêncio**. E `PRAGMA foreign_keys` é no-op dentro de transação, que é como o sqlx
   (tauri-plugin-sql) roda migrations.
2. **`taskGroupKey` precisa absorver os custom fields.** É `nome|projeto|categoria`. Se Project
   Stage vira custom field e não entra na chave, duas tarefas com stages diferentes colapsam num
   item só do Monday e o valor gravado depende da ordem de chegada — exatamente o defeito que
   obrigou `billable` a entrar na assinatura de `groupTasksForMonday`.
3. **A regra do board interno único** só é aplicável se `mondayInternalBoardId` for persistido à
   parte: depois do import, ele é indistinguível de um board de cliente dentro de
   `mondayProjectMapping`.
4. **`ExportProfile.is_default`** passa a ser único por workspace, não global.

### Blast radius (GitNexus, `direction: upstream`)

| Símbolo | Risco | Diretos |
|---|---|---|
| `useProjects` | 🔴 **CRITICAL** | 13 chamadores, 12 execution flows, 4 módulos |
| `ProjectRepository` | LOW (1 direto) | 28 arquivos transitivos via `RepositoriesContext` |
| `groupTasks` | LOW | 4 diretos: `useTasks`, `useTaskSendSelection`, `runDailyTemplate`, `ExportModal` |

O `useProjects` em CRITICAL dita a estratégia da Fase 1: **a assinatura do hook não muda.** Ele
passa a ler o workspace ativo de um contexto e os 13 chamadores não são tocados. Trocar para
`useProjects(workspaceId)` significaria editar 13 arquivos em 12 fluxos por ganho zero.

---

## Decisões fechadas

| Tema | Decisão |
|---|---|
| Escopo do workspace | Tarefas, planejadas, projetos, categorias e perfis de exportação |
| Custom fields | **Globais**, não escopados — ver justificativa abaixo |
| Workspace "Padrão" | Criado na migration com id sentinela fixo, backfill de tudo, coluna `NOT NULL` |
| Excluir workspace | Modal escolhe o destino dos dados. **Exceção deliberada** ao §1 "exclusões sem confirmação" — apagar meses de horas é irreversível demais. Registrar a exceção no `CLAUDE.md` |
| Troca com tarefa rodando | **Bloqueia** e oferece "Parar e trocar", reusando o painel Concluída/Pendente existente |
| Corrigir workspace errado | "Mover para workspace" e "Copiar para workspace", com modal reconciliando projeto e categoria |
| Destino de import | Workspace ativo pré-selecionado, com seletor no modal |
| Monday — pasta "Projetos" | Todos os boards → um Project cada, mapeamento 1:1, como já é hoje |
| Monday — pasta "Projetos Internos" | **Um único** board escolhido pelo usuário → vira um Project. Granularidade interna vem da **categoria**. Vincular outro substitui o anterior |
| Monday — importar atividades | Duas vias que **não se cruzam**: itens de trabalho → PlannedTasks; itens de Activities → modal de gerenciamento (ver/editar/excluir no Monday). Nada do Monday vira tarefa realizada no DeskClock |

### Por que custom fields são globais

Decisão do usuário, com razão estrutural que emergiu depois: **mover uma tarefa entre workspaces
só é viável se o valor do campo sobreviver sem reconciliação.** Projeto e categoria são escopados,
então mover exige remapear os dois. Se os custom fields também fossem escopados, mover exigiria
reconciliar campo *e* opção de select, triplicando a complexidade do modal.

Custo aceito: "Project Stage" (que só existe por causa do Monday) aparece no formulário de toda
tarefa de todo workspace. Se incomodar no uso, a evolução barata é manter a definição global e dar
ao campo uma lista de workspaces onde ele aparece — **fora do escopo desta entrega**.

### Por que o board interno é um Project (e não um fallback)

Modelagem do usuário: "Tech Atividades Internas" **é** um projeto, e a granularidade dentro dele
vem da categoria (Reunião, Recrutamento, Estudo…). Isso mantém o mapeamento **1:1 uniforme** e
dispensa flag de "projeto interno" e board padrão de fallback. A restrição de área ("só devo enviar
para o board da minha área") vira uma regra de import — vincular um board interno substitui o
anterior —, não uma decisão por projeto.

Uma proposta alternativa de três estados por projeto (mapeado / interno / não mapeado, com board
padrão de fallback) foi considerada e **descartada** por ser mais complexa que a necessária.

---

## Alternatives considered

| Decisão | Alternativa descartada | Motivo |
|---|---|---|
| Escopo do workspace | Filtro ambiente dentro do repositório (todo `findAll` já filtra) | Quebraria o requisito de integrações verem tudo, e em silêncio |
| Workspace "Padrão" | `workspace_id NULL` = Padrão virtual | Duas representações do mesmo estado — fonte garantida de bug |
| Custom fields | Coluna JSON em `tasks.custom_values` | Inviabiliza filtro no histórico e agrupamento em SQL puro |
| Monday, board interno | Board padrão de fallback + três estados por projeto | Resolvido pela modelagem 1:1, mais simples |
| Monday, import | Importar itens de Activities como tarefas realizadas | Sync circular: o DeskClock cria esses itens; reimportá-los duplicaria tarefas que seriam reenviadas |
| Assinatura do hook | `useProjects(workspaceId)` | `useProjects` está em CRITICAL: 13 arquivos editados em 12 fluxos por ganho zero |
| Entrega | Um PR único com os 7 itens | Diff irrevisável |

---

## Plan

### Fase 0 — Consolidar o Monday-send

1. `npx gitnexus analyze` — destrava o impact analysis das fases seguintes.
2. `pnpm test` + `pnpm lint` + `pnpm format` no que já existe.
3. Gate `@code-quality-reviewer` sobre o diff atual.
4. Commit `feat(monday): integração de envio de horas ao Monday.com`.
5. Marcar em `docs/specs/monday-integration.md` os dois checkboxes de governança do
   `mondayApiKey` (registro em `Coaktion/security-inventory`) — hoje abertos e declarados como
   bloqueio de merge.

**Sem código novo.** É empacotar o que existe.

---

### Fase 1 — Workspaces ✅ **CONCLUÍDA em 2026-07-30**

#### 1.0 Spike da migration — ✅ **CONCLUÍDO em 2026-07-30**

Executado contra dois bancos: um fixture sintético (500 tarefas, 60 planejadas, 20 projetos, 10
categorias, todas com FK preenchida) e uma cópia do banco real (4 tarefas, 101 projetos, incluindo
uma tarefa com `project_id` nulo). O harness replica a semântica do sqlx: conexão com
`foreign_keys = ON` (default do `SqliteConnectOptions`) e uma transação por migration.

**As duas técnicas preferidas do plano original foram refutadas:**

| Técnica | Resultado |
|---|---|
| (a) `PRAGMA legacy_alter_table = ON` + `RENAME` | ❌ O pragma é aceito (lê `1` dentro e fora de transação), mas com `foreign_keys = ON` o `RENAME` reescreve as cláusulas `REFERENCES` das filhas mesmo assim: `tasks.project_id` passou a apontar para `projects_pre_011`. Só preserva as cláusulas se `foreign_keys = OFF` |
| (b) `PRAGMA foreign_keys = OFF` | ❌ Confirmado no-op dentro de transação (lê `1` depois de `OFF`). Indisponível no runner do sqlx |
| Ingênua (`CREATE` novo + `DROP` antigo) | ❌ **Roda sem erro nenhum** e zera `project_id` de 500 tarefas e 60 planejadas. O risco do plano está reproduzido |

**Técnica adotada — reconstruir as quatro tabelas.** `projects`/`categories` são apenas
**renomeadas** (rename não apaga dado; a reescrita das cláusulas FK é temporária e irrelevante) e
em seguida `tasks`, `planned_tasks` e `export_profiles` são **reconstruídas** — nelas o `DROP` é
seguro porque nenhuma tabela as referencia. A reconstrução reescreve as cláusulas `REFERENCES`
apontando de volta para `projects`/`categories` novos.

**Terceiro achado, não previsto no plano:** o SQLite proíbe
`ALTER TABLE … ADD COLUMN workspace_id … REFERENCES workspaces(id) NOT NULL DEFAULT '<sentinela>'`
("Cannot add a REFERENCES column with non-NULL default value"). O `ADD COLUMN` da §1.1 original é
inexequível — daí `export_profiles` também precisar de reconstrução.

**Critério de saída atendido** — 17 asserções verdes, incluindo: `foreign_key_check` vazio,
`integrity_check ok`, as 500 tarefas e 60 planejadas resolvendo para **o mesmo** projeto e categoria
por id (não só contagem igual), cláusulas `REFERENCES` no alvo certo, projeto criado *depois* da
migration aceitando tarefa (o cenário que quebrou na técnica (a)), `UNIQUE(workspace_id, name)`
aceitando nome repetido entre workspaces e rejeitando dentro do mesmo, `is_default` único por
workspace, `ON DELETE SET NULL` preservado e as tabelas `_pre_011` intactas e não referenciadas.

> **Custo assumido:** a 011 replica o schema de `tasks`/`planned_tasks`/`export_profiles` tal como
> está após a 010. Alterar retroativamente qualquer migration anterior exige acompanhar este arquivo.

#### 1.1 Migration `011_workspaces.sql` (version 11 em `src-tauri/src/migrations.rs`)

Ordem exata validada pelo spike (o SQL candidato já passou nos dois bancos):

```
workspaces(id PK, name UNIQUE, color, created_at)
  → seed 'Padrão', id sentinela '00000000-0000-4000-8000-000000000001'
    (constante compartilhada com o código)
projects / categories
  → RENAME para projects_pre_011 / categories_pre_011  (sem DROP)
  → CREATE novo com workspace_id NOT NULL REFERENCES workspaces(id)
    e UNIQUE(workspace_id, name); INSERT … SELECT do _pre_011
tasks / planned_tasks / export_profiles
  → CREATE <tabela>_new replicando o schema pós-010 + workspace_id
  → INSERT … SELECT, DROP da antiga (seguro: ninguém as referencia), RENAME
  → recriar os índices, que somem junto com a tabela
export_profiles.is_default
  → CREATE UNIQUE INDEX … ON export_profiles(workspace_id) WHERE is_default = 1
```

As tabelas `_pre_011` ficam no banco de propósito: são a única rota de rollback desta migration.

#### 1.2 Domain

| Arquivo | Conteúdo |
|---|---|
| `domain/entities/Workspace.ts` | `{ id, name, color, createdAt }` |
| `domain/repositories/IWorkspaceRepository.ts` | `findAll`, `findById`, `save`, `update`, `delete` |
| `domain/utils/workspaceColor.ts` | hash do nome → **slot** da paleta do Tailwind v4 (26 disponíveis como CSS custom properties; 8 curados, excluindo os accents de tema e os neutros). Guarda nome de slot, nunca valor de cor. A tradução para classe fica em `presentation/components/WorkspaceDot.tsx`, num mapa escrito por extenso — `bg-${slot}-500` montado em runtime não geraria CSS |
| `domain/usecases/workspaces/` | `CreateWorkspace`, `UpdateWorkspace`, `DeleteWorkspace(id, targetId)`, `GetWorkspaces` |
| `domain/usecases/tasks/MoveTasksToWorkspace.ts` | move/copia + aplica reconciliação |
| `domain/usecases/workspaces/reconcileCatalog.ts` | dado projeto/categoria de origem e o catálogo do destino, devolve `match` \| `create` \| `unset` |

#### 1.3 Escopo nos repositórios

- `findAll(workspaceId?)` — **`undefined` = todos**, que é o caminho das integrações (item 3).
- `findByName(name, workspaceId)` — parâmetro **obrigatório**, porque a unicidade agora é por
  workspace.

Atingidos: `IProjectRepository`, `ICategoryRepository`, `ITaskRepository.findByDateRange`,
`IPlannedTaskRepository`, `IExportProfileRepository` + as 5 implementações em `infra/database/`.
`WorkspaceRepository` novo, registrado em `RepositoriesContext`.

#### 1.4 Presentation

- **`contexts/WorkspaceContext.tsx`** — lista, `activeWorkspaceId` (persistido em
  `AppConfig.activeWorkspaceId`), `switchTo()`. É daqui que os hooks leem — é por isso que
  nenhuma assinatura de hook muda.
- **Hooks tocados por dentro:** `useProjects`, `useCategories`, `useTasks`, `useHistory`,
  `usePlannedTasks`, `useExportProfiles`. Assinatura pública intacta.
- **`components/WorkspaceSwitcher.tsx`** na `Sidebar`. Com um único workspace, some da tela —
  quem não usa workspaces não vê workspace nenhum.
- **Guarda de tarefa em execução:** havendo tarefa rodando, abre o painel Concluída/Pendente e só
  então troca.
  > **Desvio aplicado no Execute:** a guarda ficou no `WorkspaceSwitcher`, **não** dentro de
  > `switchTo()`. O `RunningTaskContext` consome o `WorkspaceContext` para saber em que workspace
  > criar a tarefa; fazer `switchTo()` consultar o `RunningTaskContext` fecharia um ciclo entre os
  > dois providers. A sidebar está dentro de ambos, então decide sem acoplar nenhum dos dois.
- **`modals/MoveToWorkspaceModal.tsx`** — destino + reconciliação de projeto e categoria
  (`match` / `criar lá com o mesmo nome` / `deixar vazio`). Custom fields passam intactos.
  Modos mover e copiar. Pontos de entrada: card de grupo em "Entradas de hoje" (`TaskGroupCard`,
  que também cobre a tarefa única) e a seleção múltipla do histórico. Ambos só aparecem com mais
  de um workspace.
- **`modals/DeleteWorkspaceModal.tsx`** — destino dos dados.
- **`DataPage`** ganha aba "Workspaces" (CRUD + preview da cor gerada enquanto digita).

> Não é necessária uma "via global de lookup" de projeto/categoria por id: com a troca bloqueada
> durante execução, nenhuma tarefa é renderizada fora do seu workspace. Só o
> `MoveToWorkspaceModal` carrega os dois catálogos, e carrega explicitamente.

**Entregue além do previsto no plano** (pedidos do usuário durante o Execute):

- Indicação e troca de workspace **nos overlays** — chip no header do popup e faixas de cor nas
  bordas do botão do compact. Exigiu o evento `WORKSPACE_CHANGED`, porque cada janela tem seu
  próprio provider.
- **"Tornar ativo"** na aba Workspaces: a tela que cadastra workspaces também troca o ativo.
- `useWorkspaceSwitchGuard`, com a guarda de tarefa em execução compartilhada pelos três pontos
  de troca (sidebar, overlay, tela de Dados).

---

### Fase 2 — Multi-select na tela de Dados ✅ **CONCLUÍDA em 2026-07-31**

1. `presentation/hooks/useMultiSelect.ts` — genérico por id. **Não copiar** a lógica de seleção
   de `useTaskSendSelection`, que é específica de tarefa (§9.4).
2. `IProjectRepository.deleteMany(ids)` / `ICategoryRepository.deleteMany(ids)` — segue o
   precedente de `ITaskRepository.deleteMany`.
3. `domain/usecases/projects/DeleteProjects.ts`, `domain/usecases/categories/DeleteCategories.ts`.
4. `ProjectsPanel` / `CategoriesPanel`: checkbox por linha, "Selecionar todos", barra de ação com
   exclusão em massa (sem confirmação, §1).

---

### Fase 3 — Custom fields ✅ **CONCLUÍDA em 2026-07-31**

#### 3.1 Migration `012_custom_fields.sql` (version 12)

```
custom_fields(id PK, label, type CHECK(text|multiline|select|checkbox),
              options TEXT /* JSON */, sort_order, archived, created_at)
task_custom_values(task_id, field_id, value, PK(task_id, field_id))        ON DELETE CASCADE
planned_task_custom_values(planned_task_id, field_id, value, PK(...))      ON DELETE CASCADE
```

Sem `workspace_id`: campos são globais. `planned_task_custom_values` existe para que dar Play numa
tarefa planejada já traga o Project Stage preenchido.

#### 3.2 Domain

- `domain/entities/CustomField.ts`
- `domain/repositories/ICustomFieldRepository.ts`. **Desvio deliberado:** o
  `ICustomFieldValueRepository` previsto aqui não foi criado — os valores pertencem ao agregado
  `Task`/`PlannedTask` e são lidos e gravados pelos repositórios deles. Um segundo repositório
  teria de ser costurado em todo use case que cria ou edita tarefa, sem ganho.
- `domain/usecases/customFields/` — CRUD + `serializeCustomValue` e `formatCustomValue`.
  O `parseCustomValue` previsto aqui **não existe**: nasceu sem chamador de produção e foi
  removido junto com um `sanitizeCustomValues` igualmente morto. Se for recriar o sanitize,
  saiba por que ele foi descartado: os formulários só recebem `activeFields`, então sanitizar na
  gravação apagaria os valores de campos **arquivados** de uma tarefa antiga, em silêncio.
- **Correção sobre o previsto:** checkbox é `"1"` ou `""`, nunca `"0"`. Como o valor entra na
  chave de agrupamento, gravar `"0"` faria a tarefa em que o usuário marcou e desmarcou a caixa
  parar de agrupar com a tarefa em que ele nunca a tocou.
- **A normalização não pode rodar a cada tecla.** `serializeCustomValue` apara e colapsa espaços;
  aplicá-la ao `value` de um input controlado engole a barra de espaço. `CustomFieldInputs` guarda
  o texto cru em estado local (`useLocalText`) e só emite o valor serializado.
- `Task` e `PlannedTask` ganham `customValues: Record<UUID, string>`. Os repositórios costuram
  numa segunda query pelos ids já carregados — **sem N+1**.

#### 3.3 O ponto crítico: `taskGroupKey` (`domain/utils/groupTasks.ts`)

```
antes:  nome | projeto | categoria
depois: nome | projeto | categoria | valores custom em ordem estável de field id
```

Sem isso, duas tarefas com Project Stage diferente colapsam num item só do Monday e o valor
gravado depende da ordem de chegada. Propaga para os 4 chamadores de `groupTasks`
(`useTasks`, `useTaskSendSelection`, `runDailyTemplate`, `ExportModal`), para
`mondayGroupSignature` e para a ação "Unificar".

#### 3.4 UI

- `components/CustomFieldInputs.tsx` (renderiza por tipo), consumido por `EditTaskModal`,
  `RunningTaskEditForm`, `RetroactivePage`, `PlannedTaskForm`, `EditGroupModal`. O tipo `select`
  usa o `Autocomplete` com fuzzy search, como projeto e categoria: a lista de opções cresce e um
  `<select>` nativo obrigaria a percorrê-la à mão.
- CRUD dos campos numa aba "Campos personalizados" da `DataPage`.
- `ExportProfile.columns` aceita `field: "custom:<id>"` — exportação sem os campos novos seria um
  buraco visível no dia seguinte.

> `DataPage` chega a 4 abas (Projetos, Categorias, Workspaces, Campos). Ainda coerente, mas é o
> limite antes de virar tela-gaveta.

#### 3.5 Exceção registrada à §9.3 do `CLAUDE.md`

Cinco símbolos já estavam em zona vermelha antes desta fase e ainda assim receberam código:

| Arquivo | Antes | Depois | Limite |
|---|---|---|---|
| `presentation/modals/ExportModal.tsx` | 607 | 640 | 350 |
| `presentation/pages/RetroactivePage.tsx` | 587 | 598 | 350 |
| `presentation/components/PlannedTaskForm.tsx` | 357 | 377 | 350 |
| `presentation/modals/EditPlannedTaskModal.tsx` | 351 | 370 | 350 |
| `presentation/hooks/useRetroactiveForm.ts` | 202 | 210 | 150 |

A regra manda refatorar antes de acrescentar feature. A exceção é deliberada: as adições são de
6 a 20 linhas, todas mecânicas (passar `customValues` adiante), e um custom field capturado em
quatro dos cinco formulários e ausente no quinto seria pior que qualquer um desses arquivos ser
grande. **Refatorá-los é item próprio, fora desta fase** — o split de `ExportModal` e de
`RetroactivePage` não tem relação com campos personalizados e misturá-lo aqui tornaria o diff
irrevisável. Os arquivos novos da fase estão todos em verde.

#### 3.6 Dívida deixada em aberto

- `startPlannedTask` (`domain/usecases/plannedTasks/StartPlannedTask.ts`) **não tem chamador de
  produção** — só testes. Os quatro Play reais montam o input à mão e chamam `startTask`. É
  anterior a esta fase; a fase apenas passou a repassar `customValues` nesses quatro caminhos.
  **A Fase 4 não decidiu** — nada nela tocou o Play de tarefa planejada. Segue em aberto para a
  Fase 5 ou para um `refactor:` próprio.
- `domain/usecases/monday/groupTasksForMonday.ts` contém um byte NUL literal, o que faz o git
  tratar o arquivo como binário — nenhum diff dele é revisável. Também anterior à fase. Trocar
  por `\0` escapado num `fix:` separado.
- **O board interno renomeia duas colunas do template** (visto em "Tech Atividades Internas",
  2026-08-03): a de cronograma chama-se **"Planned Timeline"** e a de etapa, **"Project Phase"**.
  Nenhum dos dois títulos está em `resolveBoardActivitiesColumns`, então ali `findTimelineColumnId`
  e `projectStage` voltam vazios. Hoje não quebra nada — aquele board só tem o grupo Activities, e
  o import não oferece itens de lá —, mas é ruído esperando virar bug. Não foi tocado por ser fora
  do escopo do que se pediu; a correção é uma entrada em cada lista de títulos.
- **Tarefas recorrentes gravadas em sábado ou domingo ficaram órfãs.** O fim de semana saiu do
  planejamento (e a config `showWeekend` foi removida) sem migrar `recurringDays`: os valores 0 e
  6 continuam no banco e não têm mais dia onde aparecer. Ninguém avisa o usuário. Decidir entre
  limpeza pontual, migration que empurra para segunda, ou nada.
- **`WeekPlanningView.tsx:179`** tem um warning de `react-hooks/exhaustive-deps` anterior a tudo
  isto (`filteredDays` recriado a cada render alimentando um `useMemo`). `eslint .` sai com 0
  erros, mas `--max-warnings=0` falha por causa dele.
- **Decisão pendente do usuário:** o botão de importar do Google Agenda só aparece com o Google
  conectado e é a única porta do `ImportCalendarModal`. O usuário cogitou removê-lo achando que
  estava sobrando. Nada foi feito — se for remover, saem botão, modal e o §5.3 do `CLAUDE.md`.
- `useHistory.ts` tem uma cópia privada de `localDateISO`, que já existe em `shared/utils/time`.
- **Os testes do Monday constroem sender e strategy à mão.** `MondayTaskSender.test.ts` repete o
  construtor ~40 vezes e `MondaySyncStrategy.test.ts` 13 — cada repositório novo injetado vira 53
  edições mecânicas (aconteceu duas vezes na Fase 4). A §7.6 pede factory por arquivo de teste:
  falta um `makeSender(overrides)` / `makeStrategy(config, deps)`. Apontado pelo gate da Fase 4 e
  adiado de propósito, para não misturar refactor de teste com o diff da feature.

---

### Fase 4 — Monday adota o custom field ✅ **CONCLUÍDA em 2026-07-31**

1. **`MondayCategoryMapping.projectStageLabel` sai.** Sem back-compat: a integração não tem base
   instalada.
2. `AppConfig`: `+ mondayProjectStageFieldId`, `+ mondayInternalBoardId`;
   `mondayProjectsFolderId` → `mondayClientsFolderId` + `mondayInternalFolderId`.
3. `MondayWorkspaceSection`: seleção das duas pastas + escolha do **board interno único**
   (escolher outro substitui o anterior).
4. `importMondayProjects`: pasta de clientes → um Project por board; pasta interna → um Project
   apenas para o board escolhido. Destino = workspace do seletor do modal.
5. `MondayMappingsSection`: ação "criar campo personalizado a partir da coluna Project Stage",
   semeando as opções do select com os labels do `settingsStr` do board — assim valor e label
   coincidem e não existe segunda tabela de mapeamento.
6. `MondayTaskSender` / `buildActivityColumnValues`: `projectStageLabel` passa a vir de
   `task.customValues[mondayProjectStageFieldId]`.

#### 4.1 Desvios e detalhes que o plano não previa

- **O sender precisa da definição do campo, não só do valor.** A tarefa grava o **id da opção**
  (`serializeCustomValue`), e o Monday espera o **rótulo**. `MondayTaskSender` recebeu um
  `ICustomFieldRepository` e traduz com `formatCustomValue`; a definição é lida uma vez por envio,
  não por grupo. `MondaySyncStrategy` só repassa o repositório — o que fez o parâmetro subir até
  `IntegrationsContext` e `AutoSyncContext`.
- **Duas pastas não cabiam em `filterProjectBoards`.** Nasceu
  `domain/usecases/monday/selectImportBoards.ts`. A parte não óbvia: sem pasta de clientes escolhida
  **não há filtro de pasta nenhum**, então a pasta interna precisa ser excluída explicitamente — do
  contrário todos os boards internos entram como projetos de cliente, exatamente o oposto da regra
  de "um board interno só".
- **O vínculo do campo aceita campo existente.** Além de criar a partir da coluna, o select lista os
  campos do tipo `select`. E criar quando já existe um campo com o mesmo rótulo **vincula** o
  existente em vez de estourar `DuplicateNameError`.
- **`useCustomFields.createField` passou a devolver o campo criado.** Sem o id de volta não há como
  gravar `mondayProjectStageFieldId` logo após criar.
- **O valor antigo de `mondayProjectsFolderId` fica órfão na tabela `config`.** Sem base instalada,
  não há o que migrar; a chave simplesmente deixa de ser lida.

#### 4.2 Segunda rodada — o mapeamento de categoria também sai

Pedidos do usuário depois de validar o import no app:

- **`MondayCategoryMapping` foi excluído.** Agora que existe workspace, o Activity Type é importado
  como Categoria e os dois casam **pelo nome**. `importMondayCategories` cria uma categoria por
  rótulo; `default_billable` vem da pasta — cliente billable, board interno non-billable. Rótulo
  presente nos dois lados fica billable (trabalho de cliente é o caso majoritário, e o padrão é só
  um padrão). Categoria que já existe **não** é alterada: sobrescrever apagaria a escolha do
  usuário.
- **O sender só grava o Activity Type se o nome da categoria estiver entre os rótulos do board.**
  `MondayProjectMapping` passou a cachear `activityTypeLabels`, `projectStageLabels` e
  `projectStageTitle` no import. Sem essa guarda, uma categoria criada à mão viraria um rótulo
  inexistente na coluna status e o Monday **recusaria a escrita inteira** — um envio correto cairia
  por causa de uma categoria não relacionada. O sender recebeu `ICategoryRepository` (sem escopo de
  workspace, §9.5).
- **O cache dos rótulos matou uma chamada de API.** A seção de mapeamentos consultava
  `getBoardSchema` do primeiro board mapeado para popular os selects; agora tudo vem do que o import
  já gravou.
- **`Mapeamentos` virou `Importação de dados`**, com seletor de **workspace de destino** (não troca
  o ativo do app, então não esbarra na guarda de tarefa em execução) e três blocos com ação de
  atualizar: Projetos, Categorias e Project Stage. O arquivo virou quatro: `MondayImportSection`
  (casca), `MondayProjectsImport`, `MondayCategoriesImport` e `MondayProjectStageField`.
- **Os boards recusados passaram a aparecer.** `skipped[].reason` já existia e era descartado: a
  tela mostrava só "N boards fora do template" e não havia como saber qual coluna faltava.
- **"Atualizar" no Project Stage faz união, nunca substituição.** `updateCustomField` casa as opções
  pelo rótulo e preserva o id — que é o valor gravado nas tarefas.
- **O catálogo do Monday virou cache em config.** Workspaces, pastas e boards eram buscados na API a
  cada abertura da tela, sem indicação de carregamento — em conta grande a seção passava segundos
  parecendo quebrada. `useMondayCatalog` hidrata do cache, só busca quando não há nada, e o botão de
  atualizar que já existia passou a recarregar os três. Trocar o workspace do Monday limpa o cache,
  porque pasta e board do anterior não valem mais.
- **Vínculo de projeto sobrevive a apagar o projeto.** O mapeamento mora na config, não no banco:
  apagar os projetos na tela de Dados deixava a lista de importação mostrando tudo como vinculado,
  porque a linha caía no nome do board. `MondayProjectsImport` agora confere contra os projetos que
  existem **no destino** e separa os vínculos órfãos num aviso.
- **A guarda de rótulo vale para as duas colunas.** O gate do `@code-quality-reviewer` pegou que o
  Project Stage tinha ficado sem ela: o campo personalizado é editável na tela de Dados e pode ser
  vinculado a um campo que nunca veio do board, então a opção escolhida pode não existir na coluna.
  Hoje `activityTypeLabel` **e** `projectStageLabel` são conferidos contra o cache do mapeamento.
- **`parseStatusLabels` apara na origem.** Todo o lado DeskClock apara (`createCategory`,
  `buildOptions`); sem o trim ali, um rótulo do Monday com espaço nas pontas viraria categoria
  `"Development"` e ficaria `" Development "` no cache — e o casamento por nome falharia em silêncio,
  sumindo com a coluna Activity Type de toda tarefa daquela categoria.
- **Start Date e End Date só no create.** As duas colunas de data recebem o instante do envio, mas
  ficam **fora** do `updateValues`: repetidas no update, o payload mudaria a cada execução, nenhum
  grupo cairia mais no skip por "nada mudou" e o envio diário voltaria a chamar a API para tudo.
  Os ids vêm por título, com o id do template (`date_mm33tthy`/`date_mm33zcmr`) como reserva — e o
  id de reserva só é usado se a coluna **existir no schema**, porque mandar coluna inexistente faz
  o Monday recusar a escrita inteira. O valor vai em **UTC**, que é como o Monday guarda `date`.
- **O modal de edição adotou o `fieldStyles.ts`** e os campos personalizados subiram para antes de
  data e horas. São agora **três** telas presas ao mesmo vocabulário visual — mexer numa sem as
  outras desalinha em silêncio. Data e duração dividem uma linha, e o `DatePickerInput` ganhou uma
  prop `label` opcional para vestir a mesma caixa de rótulo encaixado.
- **Rótulo flutuante, só nos campos personalizados.** Eles são os únicos dinâmicos: "Project Stage"
  não se explica pela posição no formulário como Nome e Projeto se explicam, então o rótulo precisa
  sobreviver ao preenchimento. Começa como placeholder e sobe para a mesma posição do rótulo
  encaixado dos campos de hora. Isso **matou os dois modos** que existiam (`labelsAsPlaceholder` vs
  rótulo-acima) — um só desenho serve à coluna estreita e ao modal.
  - Sem JavaScript: o estado vem de `:focus` e `:placeholder-shown` lidos com `group-*`. Por isso
    todo controle leva `placeholder=" "` — sem placeholder, `:placeholder-shown` nunca casa.
  - O grupo é **nomeado** (`group/cf`). `group-*` casa com qualquer ancestral que tenha `.group`:
    um card acima usando `group` para hover faria todos os rótulos flutuarem juntos, sem erro
    nenhum para avisar.
  - As 18 regras foram conferidas no CSS emitido (`vite build`), não só no código: variante que o
    scanner do Tailwind não enxerga não vira CSS e falha em silêncio.
- **Campo novo dentro de JSON já gravado não ganha default.** O `DEFAULTS` do `ConfigContext`
  completa **chaves** ausentes de `AppConfig`, mas não olha dentro do array de
  `mondayProjectMapping`: os vínculos importados antes desta rodada voltaram sem
  `activityTypeLabels`/`projectStageLabels`, e ler `.length` derrubou a página de integrações
  inteira. `normalizeProjectMappings` normaliza na leitura (tela e sender). **"Sem base instalada"
  vale para o esquema, não para a máquina de quem já usou a feature** — ao acrescentar campo em
  qualquer config que seja JSON, normalize na leitura.

---

### Fase 5 — Importar e gerenciar atividades do Monday ✅ **CONCLUÍDA em 2026-07-31**

1. `IMondayApi.listItems(boardIds, { groupIds?, excludeGroupIds?, owner?, columnIds? })` + tipo
   `MondayItem`; query `items_page` com paginação por cursor no `MondayClient`.
2. **`MondayImportModal`** (molde do `ImportCalendarModal`): **todos** os boards mapeados, agrupados
   por Project → itens **fora** do grupo Activities e **do usuário** → seleção → PlannedTasks no
   workspace escolhido.
3. **`MondayEntriesModal`** (molde do `ClockifyEntriesModal`): período + boards mapeados → itens
   do Activities **do usuário** → editar e excluir direto no Monday.
4. **Detalhe que não pode escapar:** excluir um item pelo Entries precisa limpar a linha
   correspondente em `monday_activity_items`. Sem isso o próximo envio encontra rastreamento
   órfão e o `MondayNotFoundError` reaparece a cada execução.
5. Registro em `IntegrationsUiContext` + `IntegrationsModalsHost`.

#### 5.1 O que o board real mostrou (e mudou o desenho)

Esta foi a primeira fase executada com o **MCP do Monday conectado**, então as suposições sobre o
template foram conferidas contra os boards de produção antes de virar código. Quatro achados:

- **Itens do grupo Activities não têm coluna `timeline` preenchida — em board nenhum.** O intervalo
  deles é o par **Start Date / End Date**, que é o que o `MondayTaskSender` grava no create. O
  filtro de período do Entries lê esse par, não a timeline.
- **O intervalo cruza dias de verdade** (um item real ia de `2026-07-01` a `2026-07-28`), então o
  filtro precisa ser de **sobreposição**, não de "começa dentro da janela": pelo início, esse item
  sumiria de 26 dos 28 dias que cobre. É o `periodOverlaps`.
- **As duas fontes de data têm formatos incompatíveis.** `timeline` guarda data pura
  (`{"from":"2026-07-16","to":"2026-08-19"}`); `date` guarda `{"date":"…","time":"…"}` **em UTC**,
  e o `time` às vezes falta. Tratar as duas pelo mesmo caminho jogaria a atividade da meia-noite
  para o dia anterior — o defeito do §6.6. `parseDayValue` só converte fuso quando há hora.
- **O board tem até quatro colunas do tipo `timeline`** ("Actual Timeline" e duas "Baseline of…"
  convivendo com "Timeline"). A primeira implementação pegava "a primeira coluna `timeline` com
  valor" e funcionaria hoje só por acidente — a Actual Timeline está vazia nos boards novos.
  Nasceu `findTimelineColumnId`, que resolve pelo **título exato**, como o resto do arquivo.

#### 5.2 Desvios e decisões

- **`since` não entrou na assinatura.** As regras de `query_params` do Monday não expressam
  "intervalo que cruza o período", e o intervalo da atividade mora em duas colunas separadas. A
  janela é aplicada por quem chama, com `periodOverlaps` — um use case puro e testado, em vez de
  uma regra de API que eu não teria como validar.
- **A busca é de vários boards por requisição, não de um board por requisição** (correção após o
  teste no app, 2026-08-03). A primeira versão fazia `listBoardItems` em paralelo para cada board
  mapeado: abrir o Entries disparava dezenas de chamadas simultâneas para descobrir que quase todas
  voltavam vazias, e a tela ficava no loading. `boards(ids: […])` aceita a lista inteira numa
  consulta só, em lotes de 20 — o teto existe porque a complexidade cresce com o número de boards e
  o Monday recusa a **query inteira** ao estourar o orçamento. O cursor é por board e já carrega o
  escopo da consulta que o gerou, então a paginação continua por board.
- **As duas telas listam só os itens do usuário conectado** (`person` = `mondayUserId`), e o filtro
  é **do servidor**. Os boards são compartilhados — um deles tinha lançamentos de cinco pessoas, um
  de 220 h — e neste app exclusão é sem confirmação (§1); botão de excluir ao lado de hora de colega
  é armadilha. No import a razão é a mesma somada à óbvia: tarefa de colega não vira planejamento de
  ninguém. E é o filtro que torna a busca em lote barata — sem ele, a consulta única traria o grupo
  Activities inteiro de todos os clientes. Um "mostrar de todos" é barato de acrescentar depois.
- **A regra de pessoa exige `person-<id>` como `compare_value`.** Com o id puro o Monday responde
  200 com zero itens — validado contra board real, é o tipo de detalhe que só aparece assim. Por
  isso a montagem da regra vive no `MondayClient` e a porta do domínio recebe só `{ columnId,
  personId }`.
- **O import busca os schemas antes dos itens**, e não em paralelo: é o schema que dá o id da coluna
  de cronograma, e com ele em mãos a busca pede só as colunas usadas. Antes vinham todas — e o
  template tem mais de 60 por item. Como a visão passou a ser de todos os boards, `getBoardSchema`
  ganhou o irmão em lote `listBoardSchemas`: um schema por requisição devolveria exatamente o
  problema que a busca em lote resolveu.
- **O import não tem seletor de board** (2026-08-03, depois do teste no app). O select no topo
  obrigava a percorrer cliente por cliente para descobrir onde havia trabalho — e, com o filtro de
  responsável, na maioria dos boards não há nenhum. A visão é única e o agrupamento é pelo
  **Project do DeskClock**, que é o nome que o usuário reconhece; o board é detalhe de integração.
  Custo em API: zero — a busca já era em lote, o seletor só escondia o resultado.
- **O import filtra por período, com padrão "Esta semana".** Sem recorte, item de julho aparecia
  para planejar em agosto. O filtro é de sobreposição (mesmo `periodOverlaps` do Entries) e roda
  **sobre o que já veio**, sem nova ida ao Monday — trocar de janela é instantâneo, e nenhum preset
  custa chamada. Presets só olham para a frente (Hoje / Esta semana / Próximos 30 dias), porque
  planejamento é futuro. **"Tudo" foi retirado** a pedido do usuário: convidava a importar item
  encerrado e, como a busca já traz tudo o que é dele, não comprava nada. Efeito colateral aceito:
  item com cronograma além de 30 dias fica invisível — se incomodar, o caminho é um preset "em
  diante", não a volta do "Tudo". **Item sem cronograma no board aparece em qualquer recorte**: ele
  nasce no dia corrente, e escondê-lo por falta de data seria escondê-lo para sempre.
- **Nunca una ids de grupo de boards diferentes** (regressão de 2026-08-03, pega no app). A primeira
  versão da visão única mandava a união dos `activitiesGroupId` como `not_any_of`, e o import parou
  de achar qualquer tarefa: `group_mm19wbff` é o grupo "Timeline" nos boards de cliente e o grupo
  "Activities" no board interno, então a união apagava o Timeline de todo cliente. O Entries tinha o
  espelho do defeito (`any_of` traria Timeline como atividade), ainda não observado porque o board
  interno tem só um grupo. Daí `listItemsOwnedBy` separar as consultas pelo par **(coluna de pessoa,
  grupo Activities)** — cada lote leva o seu id. Vale a lição geral: **id gerado por template não é
  identificador global**, e o que os torna comparáveis é o board.
- **A seleção só importa o que está visível** (§5.6). Aqui não há a urgência da exclusão sem
  confirmação, mas o número no botão tem de ser o número de tarefas que vão nascer.
- **O Project Stage entra no import, e é o único campo personalizado que entra.** A Fase 4 o
  transformou em custom field, mas o Monday exige a etapa no envio das horas: planejada importada
  sem etapa é preenchimento adiado para um momento que não chega. Vem pré-selecionado pela coluna do
  próprio item — casam pelo nome, porque as opções do campo foram semeadas com os rótulos do board.
  Sem `mondayProjectStageFieldId` apontando para campo ativo, o modal esconde o campo e avisa onde
  configurá-lo. Renderiza pelo `CustomFieldInputs`, com um campo só na lista: a etapa se parece aqui
  com o que ela é nos cinco formulários.
- **O `editMap` guarda só o que foi editado**, e a sugestão é derivada a cada render. Semeá-la ao
  fim da busca congelava o estado do carregamento: `useCustomFields` resolve em paralelo com o
  Monday, e uma resposta rápida da API deixava a etapa por preencher sem nada explicando o porquê.
- **`listItemsOwnedBy` nasceu use case, não helper de modal.** O agrupamento por coluna de pessoa
  (a regra de responsável é única por consulta) valia para as duas telas e ia virar cópia — §9.4.
  Foi ele que permitiu corrigir a colisão de ids de grupo num lugar só, com teste próprio.
- **Datas não são editáveis no Entries.** Elas marcam quando a atividade nasceu no Monday, e quem
  manda nas horas é o DeskClock. Editáveis: nome, Reported Hours, Billing type, Activity Type e
  Project Stage — os dois últimos por select alimentado pelo cache de rótulos do mapeamento, com a
  mesma guarda do sender (rótulo fora da lista não vai no payload).
- **O import pré-seleciona a categoria pelo Activity Type do item.** Os itens de trabalho já vêm
  com essa coluna preenchida, e desde a Fase 4 categoria e rótulo casam **pelo nome** — então a
  sugestão sai de graça, e o `billable` acompanha a categoria (§6.2).
- **Timeline de um dia vira `specific_date`; de vários, `period`.** Item sem timeline cai no dia
  corrente, para não nascer invisível no planejamento.
- **O import só oferece boards cujo projeto existe no workspace ativo.** O vínculo mora na config e
  não sabe de workspace: sem essa checagem, importar por um board mapeado noutro criaria tarefas
  apontando para projeto que a tela nem exibe. Os demais viram um aviso com a contagem.
- **`getBoardSchema` voltou ao import.** A Fase 4 tinha eliminado essa chamada cacheando os rótulos
  no mapeamento; o id da coluna de cronograma não está lá e só interessa a este modal, então ele é
  resolvido na hora em vez de engordar o `MondayProjectMapping` com um campo que os vínculos
  antigos não teriam (a armadilha do fim da §4.2).

---

## Estratégia de testes

| Alvo | Tier | Como |
|---|---|---|
| `workspaceColor`, `reconcileCatalog`, `MoveTasksToWorkspace`, use cases de workspace e custom field | A | Vitest puro |
| `WorkspaceRepository`, `CustomFieldRepository`, `deleteMany` | A | `getDb()` mockado via `vi.mock`, padrão dos existentes |
| `taskGroupKey` com custom values | A | Casos novos + **revisão de todos os asserts existentes** |
| `groupTasksForMonday`, `mondayGroupSignature`, `MondayTaskSender` | A | Atualizar suítes existentes |
| `importMondayProjects` com pasta interna | A | Novos casos |
| Migrations 011/012 | — | Não unit-testáveis: spike 1.0 + smoke em cópia do banco real |
| UI | B–C | Sem testes de renderização (§7.6) |

Suítes que já estão modificadas na árvore e mudam de novo: `taskValidation.test.ts`,
`IntegrationsContext.test.tsx`, `MondaySyncStrategy.test.ts`.

---

## Rollback

| Camada | Rota |
|---|---|
| Código | Um commit por fase → `git revert` isolado |
| Migration 012 | Aditiva. Dropar as três tabelas restaura o estado anterior |
| Migration 011 | **A única não trivial.** `projects_pre_011` / `categories_pre_011` ficam no banco justamente para isso; restauração é script manual |
| UX | Com um único workspace o switcher some — quem não criar workspaces não percebe diferença |
| Monday | Sem token configurado, `isPerTaskEnabled()` / `isDailyEnabled()` retornam `false` e nada roda |

---

## Ordem de execução

| # | Fase | Depende de |
|---|---|---|
| 0 | ✅ Commitar o Monday-send atual | — |
| 1 | ✅ Workspaces: schema, backfill, repos, seletor, escopo na UI, mover/copiar | — |
| 2 | ✅ Multi-select na tela de Dados | 1 |
| 3 | ✅ Custom fields: EAV, CRUD, captura na tarefa, chave de agrupamento | 1 |
| 4 | ✅ Monday: Project Stage vira custom field; board interno único | 3 |
| 5 | ✅ `MondayImportModal` + `MondayEntriesModal` | 4 |

Cada fase termina no gate obrigatório: `pnpm lint`, prettier, `@code-quality-reviewer` limpo,
Conventional Commit. Nenhum commit é proposto antes de um relatório limpo do sub-agente.

---

## Documentação a atualizar ao final

- `CLAUDE.md` — §4 (modelo de dados: Workspace, CustomField), §5.6 (tela de Dados com 4 abas e
  multi-select), §5.7 (integração Monday), §6 (nova regra de agrupamento com custom fields; a
  exceção de "exclusão sem confirmação" para workspaces), §9.5 (roteiro de nova integração).
- `README.md` — funcionalidades.
