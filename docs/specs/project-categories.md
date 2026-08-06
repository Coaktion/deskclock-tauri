# Categorias por projeto

- **Date:** 2026-08-06
- **Author:** Eduardo Meira
- **Project classification:** Current (React 19, TS 5, Vitest 3, CLAUDE.md + CI presentes)
- **Coverage tier:** A (`domain/usecases/`, repositório, migration) / B–C (UI, sem testes de
  renderização — §7.6 do `CLAUDE.md`)
- **Estado do ritual SDD:** Brainstorm ✅ · Plan ✅ · **Execute pendente de aprovação**

> Este documento é a **ordem de trabalho**. Foi escrito para ser lido por um agente sem acesso à
> conversa que o originou — todas as decisões e o porquê delas estão aqui.

---

## Handoff — leia antes de tocar em qualquer coisa

1. **Branch:** `feat/monday-integration` está com a integração do Monday inteira. Esta feature é
   independente dela; abrir `feat/project-categories` a partir de `main` **depois** que o Monday
   mergear, ou seguir na mesma branch se ela ainda não mergeou. Verificar
   `git branch --merged main` antes (§7.2).
2. **A tabela é do DeskClock, o Monday é uma fonte.** Ver "Por que não ler do
   `mondayProjectMapping`" abaixo antes de propor o atalho — ele é tentador e está errado por três
   razões concretas.
3. **`foreign_keys` está ON** (`src-tauri/src/api/db.rs:16`), então `ON DELETE CASCADE` funciona de
   verdade. É o padrão da casa desde a migration 012.
4. **Cuidado com a lição da migration 011:** `ALTER TABLE ... RENAME` reescreve as cláusulas
   `REFERENCES` das outras tabelas. Se algum dia `projects` ou `categories` for reconstruída, esta
   tabela vai junto — não é preciso fazer nada, mas é preciso saber.
5. **O autocomplete de categoria aparece em 15 lugares.** Um deles (`HistoryPage`) **não** entra —
   ver decisão fechada. Os outros 14 são campos de entrada.
6. **Escopo que para no repositório não é escopo** (lição herdada de
   `workspaces-custom-fields.md`, §Handoff item 6, que reincidiu três vezes). Ao ligar o filtro em
   cada tela, verificar os três: o `projectId` chega ao hook, algo dispara o recarregamento quando
   o projeto muda, e o valor lido é o atual — não um closure do mount.

---

## Problem & constraints

### Problema

O catálogo de categorias é plano e global ao workspace. Quem trabalha com muitos projetos rola uma
lista de 35 Activity Types para achar os três que aquele projeto aceita. No Monday isso é pior que
inconveniente: mandar um Activity Type que a coluna do board não tem faz o Monday **recusar a
mutation inteira** — a hora não sobe, e o erro aparece longe do lugar onde a escolha foi feita.

### Restrições

- **Nem todo projeto tem associação, e a maioria nunca vai ter.** Projeto pessoal, projeto vindo do
  Clockify, projeto criado à mão. A feature não pode degradar nada para eles.
- **Categoria é por workspace** (`UNIQUE(workspace_id, name)`); Project também. A tabela liga dois
  registros que já carregam o workspace.
- **Exclusão de projeto e de categoria é sem confirmação** (§1). Linha órfã não pode sobreviver a
  isso — id reaproveitado ressuscitaria uma associação que ninguém pediu.
- **A varredura diária do Monday reescreve `mondayProjectMapping` inteiro**
  (`useMondayProjectsTracker`). Qualquer coisa que a feature guarde ali é apagada na virada do dia.

### Blast radius (GitNexus, `direction: upstream`)

- `useCategories` — consumido por 15 telas. **Não será alterado**: o filtro entra num hook novo, ao
  lado, para não arrastar o `HistoryPage` junto.
- `importMondayProjects` — chamado pelo botão de Integrações e pelo `useMondayProjectsTracker`.
  Ganha a semeadura na Fase 3.
- `CategoryRepository` / `ProjectRepository` — inalterados. A tabela nova tem repositório próprio.

---

## Decisões fechadas

### Filtro **duro**: só as categorias associadas aparecem

Escolha do usuário em 2026-08-06, com a ressalva do filtro suave apresentada e recusada. O que o
torna seguro é a regra abaixo, que é inseparável dele.

### **Conjunto vazio = sem filtro.** Esta é a regra que sustenta tudo

`useCategoriesForProject(projectId)` devolve o catálogo **inteiro** quando:

- `projectId` é `null` — não há projeto pelo que filtrar;
- o projeto existe e tem **zero** associações.

Só filtra quando o projeto tem ao menos uma. Consequências deliberadas:

- Todo projeto que ninguém associou se comporta exatamente como hoje. A feature não é uma feature
  do Monday que quebrou o resto do app.
- Um projeto que perde a última associação (categoria excluída, cascade) **volta a mostrar tudo**
  em vez de ficar sem caminho nenhum. Auto-cura, não estado morto.
- O filtro duro só morde quando o projeto **tem** associações e está faltando uma — que é
  exatamente o caso em que existe alguém para consertar, pela tela de Dados.

### Trocar o projeto **limpa** a categoria escolhida

Escolha do usuário em 2026-08-06, com a alternativa (preservar o que foi digitado) apresentada e
recusada em nome da consistência: sem o reset, o campo pode exibir uma categoria que não está na
própria lista.

**Onde o reset mora é a parte que erra fácil, e são dois erros distintos:**

1. **Não pode ser um `useEffect` keyed em `projectId`.** Vários fluxos preenchem projeto e
   categoria **juntos**, e um efeito apagaria a categoria que acabou de chegar ao lado dela: a
   categoria pré-selecionada pelo Activity Type no `MondayImportModal` (§5.7), o
   `ImportCalendarModal`, o `ImportZendeskModal`, o reexecutar de uma entrada de hoje
   (`handleRepeat`), a sugestão "recente" do omnibox e o prefill do lançamento retroativo.
2. **Não pode ser o `onChange` do autocomplete de projeto.** Ele dispara a cada tecla — digitar
   uma letra no campo de projeto limparia a categoria.

**A regra:** o reset acontece no `onSelect` do autocomplete de projeto (escolha de verdade, id
novo) e no caminho em que o campo é esvaziado (id → `null`). Nunca em prefill programático, nunca
por tecla digitada.

Esvaziar o projeto **também** limpa a categoria, e é uma regra só de propósito — sem projeto o
filtro devolve tudo, então a categoria não estaria inválida, mas manter a exceção significaria uma
segunda regra para lembrar em 14 telas.

### `HistoryPage` fica de fora

Lá o autocomplete de categoria é **filtro de busca**, não campo de entrada. Esconder opção é
esconder resultado: quem procura "todas as horas de Meeting" precisa poder digitar Meeting mesmo
que o projeto selecionado no filtro ao lado não a aceite mais.

### A associação é editável na **linha do projeto**, na tela de Dados

Escolha do usuário. É onde Projetos e Categorias já vivem e onde a seleção múltipla já existe
(§5.6). A ponta inversa (quais projetos aceitam esta categoria) fica de fora: duas telas para
manter em sincronia, sem ganho — a pergunta que as pessoas fazem é sempre "o que este projeto
aceita".

### `source` distingue quem escreveu a linha

`'monday' | 'manual'`. A varredura do Monday apaga e reescreve **só** as linhas `source='monday'`.
É a contenção inteira do acoplamento: desligar o Monday amanhã é apagar as linhas dele, e a tabela
segue funcionando com o que foi curado à mão.

**Par que já existe como `manual` não é rebaixado a `monday`.** O seed é `INSERT OR IGNORE`: a
afirmação do usuário é mais forte e precisa sobreviver à varredura diária.

---

## Por que não ler do `mondayProjectMapping`

`MondayProjectMapping` (`src/shared/types/mondayConfig.ts`) **já** tem a associação:

```ts
deskclockProjectId: string;
activityTypeLabels: string[];   // os Activity Types válidos naquele board
```

Um board ↔ um Project, e a lista de Activity Types **é** a lista de categorias válidas. Ler dali
seria uma linha. Três razões para não:

1. **A varredura diária reescreve o array inteiro.** `useMondayProjectsTracker` →
   `importMondayProjects` sobrescreve `mondayProjectMapping` uma vez por dia. Associação
   adicionada à mão sumiria na virada. É o defeito que obrigou a criar a guarda `existingMappings`
   para o "ID Quadro Projeto" — só que lá ela protege **um campo**, e aqui teria de proteger uma
   lista curada.
2. **Ali "categoria" é string, não id.** `activityTypeLabels` são rótulos do Monday, e
   `importMondayCategories` casa por nome de propósito ("a categoria **é** o rótulo"). Renomear uma
   categoria na tela de Dados — permitido hoje, com edição inline — a derrubaria do filtro em
   silêncio. E categoria que nunca foi Activity Type (criada à mão, ou tag do Clockify) não teria
   linha nenhuma.
3. **Escopo errado.** `mondayProjectMapping` vive na config global; Project e Category são por
   workspace. Projeto de workspace pessoal não tem mapeamento — filtraria para zero, que com o
   filtro duro é a pior falha possível.

O que **sobra** de acoplamento, registrado honestamente:

- A semeadura é por nome (rótulo → Category pelo nome), herdando a fragilidade existente. Fica
  confinada ao instante do import: depois disso a tabela guarda ids.
- O formato "N categorias válidas por projeto" veio do Monday. É genérico o bastante — o Clockify
  não tem essa granularidade (tags não são por projeto) e simplesmente não escreve nada.
- O **conceito** de categoria inválida para um projeto é do Monday, onde o erro derruba a mutation.
  No DeskClock nada quebra. É por isso que o filtro é conveniência, e por isso que a regra do
  conjunto vazio existe.

---

## Alternatives considered

| Alternativa | Por que não |
|---|---|
| Ler direto do `mondayProjectMapping` | As três razões acima. |
| Inferir do histórico ("categorias já usadas neste projeto") | Zero cadastro, mas projeto novo começa sem sugestão nenhuma — e com filtro duro isso é uma tela vazia. Além disso, a primeira escolha errada se perpetua. |
| Coluna `project_id` em `categories` | Uma categoria pertenceria a um projeto só. "Meeting" existe em todos. |
| Filtro suave (associadas primeiro, resto abaixo) | Recusado pelo usuário. Registrado aqui porque é a rota de volta se o duro incomodar. |

---

## Plan

A ordem é escolhida para que **cada fase seja inerte até a seguinte lhe dar dados**, e para que a
saída de emergência chegue antes do que precisa dela.

### Fase 0 — Migration, domain e infra

Sem UI, sem mudança de comportamento.

#### 0.1 Migration `016_project_categories.sql` (version 16 em `src-tauri/src/migrations.rs`)

```sql
CREATE TABLE project_categories (
  project_id  TEXT NOT NULL REFERENCES projects(id)   ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  source      TEXT NOT NULL CHECK (source IN ('monday', 'manual')),
  created_at  TEXT NOT NULL,
  PRIMARY KEY (project_id, category_id)
);

CREATE INDEX idx_project_categories_project ON project_categories(project_id);
```

- **Sem `workspace_id`.** As duas FKs já o carregam, e a UI só oferece projeto e categoria do mesmo
  workspace. Uma terceira cópia seria uma terceira coisa a manter em sincronia.
- **`ON DELETE CASCADE` nas duas pontas.** Exclusão de projeto e de categoria é sem confirmação
  (§1); linha órfã ressuscitaria numa reutilização de id.
- **PK composta**, não um `id` próprio: o par é a identidade, e um par duplicado não significa nada.

#### 0.2 Domain

- `domain/entities/ProjectCategory.ts` — `{ projectId, categoryId, source, createdAt }` e
  `ProjectCategorySource = "monday" | "manual"`.
- `domain/repositories/IProjectCategoryRepository.ts`:
  - `findByProject(projectId): Promise<ProjectCategory[]>`
  - `findAll(workspaceId?): Promise<ProjectCategory[]>` — para a tela de Dados listar tudo de uma
    vez em vez de N consultas.
  - `setManual(projectId, categoryIds): Promise<void>` — substitui as linhas `manual` daquele
    projeto.
  - `replaceMondayFor(projectId, categoryIds): Promise<void>` — substitui as `monday`, com
    `INSERT OR IGNORE` para não rebaixar um par que já é `manual`.
- `domain/usecases/projectCategories/resolveCategoriesForProject.ts` — **a regra do conjunto
  vazio**, pura e testável:

  ```ts
  export function resolveCategoriesForProject(
    categories: Category[],
    allowedIds: Set<string>
  ): Category[] {
    if (allowedIds.size === 0) return categories;
    return categories.filter((c) => allowedIds.has(c.id));
  }
  ```

#### 0.3 Infra

- `infra/database/ProjectCategoryRepository.ts`, espelhando o estilo dos existentes.
- Registrar no `RepositoriesContext`.

**Testes:** repositório (com `getDb()` mockado, como os irmãos) e o use case puro.

### Fase 1 — O hook e os 14 pontos de entrada

Ainda sem mudança visível: a tabela está vazia, então toda chamada cai no "conjunto vazio = sem
filtro". **É isto que torna a fase segura de mergear sozinha.**

- `presentation/hooks/useCategoriesForProject(projectId: string | null)` — consome `useCategories`,
  busca as associações, aplica `resolveCategoriesForProject`. Recarrega quando `projectId` muda e
  quando chega `CATEGORIES_CHANGED` ou o evento novo `PROJECT_CATEGORIES_CHANGED`.
- Trocar `options={categories}` por `options={filteredCategories}` nos **14** campos de entrada:

  | Arquivo | Onde está o `projectId` |
  |---|---|
  | `components/OmniboxIdle.tsx` | `useOmniboxDraft` (`draft.projectId`) |
  | `components/OmniboxRunning.tsx` | `runningTask.projectId` |
  | `components/PlannedTaskForm.tsx` | estado local |
  | `components/RetroactiveEntryForm.tsx` | `useRetroactiveForm` (`selectedProjectId`) |
  | `components/RunningTaskEditForm.tsx` | estado local (`projectId`) |
  | `components/RunningTaskSection.tsx` | `task.projectId` |
  | `modals/EditGroupModal.tsx` | estado local |
  | `modals/EditTaskModal.tsx` | estado local |
  | `modals/EditPlannedTaskModal.tsx` | `usePlannedTaskEditor` |
  | `modals/ImportCalendarModal.tsx` | por linha de evento |
  | `modals/ImportZendeskModal.tsx` | por linha de ticket |
  | `modals/MondayImportModal.tsx` | por linha de item |
  | `overlays/PlannedTaskEditSheet.tsx` | `usePlannedTaskEditor` |
  | `overlays/PopupOverlayContent.tsx` | `task.projectId` |

  `pages/HistoryPage.tsx` **não entra** — decisão fechada.

> **§9.3 "um componente por conversa" é violada aqui, deliberadamente.** São 14 telas, mas a
> mudança em cada uma é a mesma linha, e entregá-las em lotes deixaria o app com metade dos campos
> filtrando e metade não — inconsistência pior que o tamanho do diff. Registrar no PR.

> **`usePlannedTaskEditor` serve dois componentes** (`EditPlannedTaskModal` e
> `PlannedTaskEditSheet`) e é onde a lista filtrada deve nascer para os dois, não em cada um (§9.4).

### Fase 2 — Edição na tela de Dados

A saída de emergência do filtro duro precisa existir **antes** de alguém popular a tabela.

- Na linha do projeto (`DataPage`), um botão expande as categorias associadas.
- Multi-select das categorias do workspace, com contagem. Salvar chama `setManual`.
- Linha sem associação exibe algo como "todas as categorias" — o estado vazio precisa se explicar,
  ou vai parecer que a associação se perdeu.
- Linhas `source='monday'` aparecem marcadas e são removíveis; remover uma cria a ausência que a
  varredura seguinte vai desfazer. **Aceito e documentado na tela** — quem quer remover de vez
  remove o Activity Type do board.
- Emitir `PROJECT_CATEGORIES_CHANGED` (novo em `OVERLAY_EVENTS` + `catalogSync.ts`), pelo mesmo
  motivo de `notifyProjectsChanged`: o `overlay-popup` nasce com o app e nunca remonta (§9.2).

### Fase 3 — Semeadura pelo Monday

- Em `importMondayProjects`, para cada mapping com `mondayBoardId`: traduzir
  `activityTypeLabels` → ids de Category **pelo nome**, no workspace da integração, e chamar
  `replaceMondayFor`.
- Rótulo sem categoria correspondente é **ignorado em silêncio** — `importMondayCategories` é quem
  cria as categorias, e pode não ter rodado ainda. Criar aqui duplicaria a regra de billable.
- Vale para os dois gatilhos: o botão "Atualizar" e o `useMondayProjectsTracker` diário.
- Atualizar o card de Projetos em Integrações para dizer quantas associações foram semeadas.

---

## Estratégia de testes

| O quê | Como |
|---|---|
| `resolveCategoriesForProject` | Unit. Conjunto vazio devolve tudo; conjunto com itens filtra; id associado que já não existe no catálogo não inventa entrada. |
| `ProjectCategoryRepository` | Unit com `getDb()` mockado. `replaceMondayFor` não rebaixa par `manual`; `setManual` não toca linhas `monday`. |
| Semeadura do Monday | Unit sobre `importMondayProjects` com repositório mockado: rótulo sem categoria é ignorado; par manual sobrevive à varredura. |
| UI | Sem teste de renderização, padrão do projeto (§7.6). |

---

## Rollback

A migration só **adiciona** tabela. Reverter é:

1. Desfazer os commits das Fases 1–3 (o filtro some, o catálogo volta a ser plano).
2. A tabela pode ficar no banco — inerte, ninguém a lê. Não há migration `Down` no projeto e não
   se deve inventar uma só para isto.

Nenhuma linha de `tasks`, `planned_tasks`, `projects` ou `categories` é tocada em fase nenhuma.

---

## Ordem de execução

```
Fase 0 (migration + domain + infra + testes)   ✅ 667a76e
Fase 1 (hook + 14 telas)                        ✅ 3b14223
Fase 2 (edição na tela de Dados)                ✅ aa4ec62
Fase 3 (semeadura pelo Monday)                  ✅
```

### Desvios do plano, e por quê

1. **O hook virou `useProjectCategoryMap`** — carrega o mapa do workspace inteiro de uma vez, não
   `useCategoriesForProject(projectId)`. Três dos pontos de entrada são modais de importação que
   renderizam um editor por item: um hook por linha viraria dezenas de consultas para montar uma tela
   só. Ali o recorte desce como `categoryOptionsFor`.

2. **O filtro vale só para as `options`.** Os componentes usam a mesma lista de categorias para
   oferecer opções e para resolver o nome exibido; filtrar a prop inteira faria uma categoria
   desassociada sumir das tarefas que já a usam.

3. **`setManual` virou `setForProject`, e a semântica mudou:** o que sai da seleção sai, **seja qual
   for a origem**. O plano dizia não tocar em linha `monday`, mas isso deixaria na tela uma caixa que
   desmarca e não apaga — e o próprio plano pede que as do Monday sejam removíveis. O DELETE recorta
   por `category_id NOT IN (seleção)` em vez de por origem, o que resolve o outro lado de graça: a
   linha `monday` que continua marcada não é reescrita, então o `INSERT OR IGNORE` a preserva com a
   origem que tinha.

4. **A semeadura virou use case próprio** (`seedMondayProjectCategories`), chamado pelos dois
   gatilhos, em vez de entrar dentro de `importMondayProjects` — que já lê o Portfólio, cria projetos
   e resolve o schema de 62 boards. **Board sem rótulo é pulado, não zerado**, ou uma falha de
   leitura apagaria as associações.

5. **O caminho do "campo esvaziado" só existe onde o código já zerava o id do projeto.** Em
   `usePlannedTaskEditor` e nos dois modais de edição, apagar o texto não anula `projectId` — é
   comportamento anterior, e não foi inventado um agora.

A Fase 2 vem antes da 3 de propósito: se o Monday semeasse primeiro, o filtro duro passaria a valer
para todos os projetos dele, e um rótulo que não casou por nome deixaria a pessoa sem caminho para a
categoria certa e sem tela para consertar.

---

## Documentação a atualizar ao final

- `CLAUDE.md` §5.6 (tela de Dados ganha a associação na linha do projeto), §6.2 (a regra do conjunto
  vazio, ao lado do billable herdado) e §6.4 (o autocomplete de categoria passa a depender do
  projeto, exceto no Histórico).
- Este arquivo: marcar as fases concluídas e registrar os desvios que o plano não previu.
