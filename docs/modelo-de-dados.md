# Modelo de dados — DeskClock

> Extraído da §4 do CLAUDE.md em 2026-08-10, verbatim. Leia ao mexer em entidade,
> repositório ou migration.

### 4.1 Task (Registro de hora)

| Campo | Tipo | Regras |
|---|---|---|
| id | UUID | PK, gerado automaticamente |
| workspace_id | UUID | FK → Workspace, obrigatório |
| name | string \| null | Exibir "(sem nome)" se vazio |
| project_id | UUID \| null | FK → Project |
| category_id | UUID \| null | FK → Category |
| billable | boolean | Padrão herdado da Category selecionada |
| start_time | datetime | Obrigatório |
| end_time | datetime \| null | null = em execução |
| duration_seconds | integer \| null | Calculado: end_time - start_time |
| status | enum | `running` \| `paused` \| `completed` |
| planned_task_id | UUID \| null | Referência lógica à PlannedTask de origem (**sem FK**); `null` = tarefa solta |
| created_at | datetime | Auto |
| updated_at | datetime | Auto |

> **A origem é persistida, e é imutável depois do início.** O vínculo com a
> planejada vivia só em memória (`activePlannedTaskId` no `RunningTaskContext`, um
> `useRef` no `PopupOverlayApp`), e reabrir o app o perdia: **parar a tarefa não
> marcava mais a planejada como concluída** no dia — ela reaparecia pendente —, os
> chips de "Ações" sumiam do popup e o rastreamento de reuniões perdia o sinal
> forte de reconhecimento (§5.7). As duas janelas restauram o vínculo no mount,
> lendo-o da tarefa. O `UPDATE` do repositório **não** toca a coluna: quem monta
> uma `Task` para editar, mesclar ou aplicar regras pós-parada não conhece a
> origem, e incluí-la no update apagaria o vínculo sem querer. Reinferir por
> nome/projeto/categoria foi descartado — é matching aproximado escolhendo qual
> planejada concluir, sem desfazer.
>
> Duas consequências decididas de propósito: **mesclar** um grupo produz registro
> **sem** origem (a origem não compõe a chave do grupo, então as mescladas podem vir
> de planejadas diferentes, e herdar a da primeira afirmaria o que o somado não
> tem), e **mover para outro workspace** leva a origem junto — fica um id de
> planejada do workspace anterior, inerte, porque só tarefa em execução tem o
> vínculo lido e o que se move já está concluído.
>
> **Reexecutar leva a origem junto.** O ▶ de uma entrada de hoje e a sugestão
> "recente" do acesso rápido copiam nome, projeto, categoria e campos
> personalizados — e agora também de qual planejada aquilo veio. Sem isso a
> segunda execução parava sem ter qual planejada concluir, e ela reaparecia
> pendente no planejamento justamente no dia em que foi mais trabalhada. É o
> oposto do caso da mescla: aqui a cópia tem uma origem só, e é a da tarefa
> copiada. A sugestão continua marcada como **não** planejada — ela veio do
> histórico do dia, não da lista de planejadas.
>
> **Quem para a tarefa pergunta a ela, se ninguém disse.** `usePostStopLogic`
> recebe o id da planejada de fora, passado de mão em mão entre janelas e eventos;
> vindo vazio, ele cai no `plannedTaskId` da própria tarefa. O caminho de fora
> ainda ganha — ele conhece o start desta execução —, mas um caminho novo que
> esqueça de repassá-lo deixa de falhar em silêncio.
>
> **No evento entre janelas, campo ausente e `null` querem dizer coisas
> diferentes.** O `plannedTaskId` do `RUNNING_TASK_CHANGED` é opcional, e omiti-lo
> significa "não altere a origem": é o que pausar, retomar e atualizar fazem, por
> não mexerem nela. `null` é o oposto — afirma que a tarefa nasceu solta. A janela
> principal colapsava os dois em `null`, então **pausar pelo popup apagava o
> vínculo no meio da execução**, e com ele o reconhecimento de reunião por
> planejada (§5.7, que cai no nome exato) e os chips de "Ações" do Omnibox. A regra
> vive em `resolveActivePlannedLink` (`domain/utils/plannedLink.ts`), fora do
> contexto React, porque foi implementada em duas janelas e divergiu em silêncio
> numa delas. Ela é aplicada pela forma funcional do `setState`: o listener é
> registrado uma vez só, e ler o vínculo pelo closure devolveria o valor do mount.
> **O popup segue decidindo em linha**, e não por descuido: lá o mesmo ramo também
> levanta a marca de estado ao vivo e carrega as ações da planejada.
>
> **O vínculo é de mão dupla: configurar a tarefa depois de iniciada configura a
> planejada.** Editar nome, projeto, categoria, billable ou campos personalizados
> durante a execução gravava **só** na tarefa, então a planejada que nasceu crua —
> reunião da Agenda, item do Monday sem categoria — voltava crua na ocorrência
> seguinte, e o trabalho de preencher se repetia todo dia. Agora
> `applyRunningTaskEditToPlanned` leva a mesma edição de volta, e vale para os três
> tipos de agendamento: numa recorrente ela muda todos os dias futuros, que é o
> ponto — a planejada é um molde único, sem instância por dia. É automática, sem
> botão, e o risco foi aceito na decisão: corrigir o projeto de *uma* execução muda
> o plano em silêncio e sem desfazer.
>
> A presença do campo é testada por `in`, nunca por valor — `null` em projeto ou
> categoria é escolha do usuário e precisa **limpar** o da planejada, enquanto
> campo ausente significa "não mexi nisso". **Nome vazio é a exceção e não
> propaga**: `PlannedTask.name` é obrigatório (§4.2) e a linha do planejamento não
> tem outro identificador, então apagar o nome de uma tarefa em andamento deixaria
> a planejada sem nada a exibir — numa recorrente, para sempre. `startTime` fica de
> fora porque na tarefa é o instante do início e na planejada é o "HH:MM" do import
> da Agenda: corrigir o relógio de uma execução nada diz sobre o horário planejado.
>
> **Planejada apagada não é erro.** A poda do Monday e a exclusão à mão apagam
> planejadas com a tarefa ainda rodando, e aí o vínculo aponta para o vazio; o use
> case devolve `null` sem escrever, porque lançar faria uma edição já gravada com
> sucesso na tarefa aparecer como erro na tela. O caminho existe nas duas janelas —
> `updateActiveTask` (que cobre a janela principal e o Omnibox) e o `handleUpdate`
> do popup —, cada uma com o mesmo fallback no `plannedTaskId` da própria tarefa.

### 4.2 PlannedTask (Tarefa planejada)

| Campo | Tipo | Regras |
|---|---|---|
| id | UUID | PK |
| workspace_id | UUID | FK → Workspace, obrigatório |
| name | string | Obrigatório |
| project_id | UUID \| null | FK → Project |
| category_id | UUID \| null | FK → Category |
| billable | boolean | Herdado da Category |
| schedule_type | enum | `specific_date` \| `recurring` \| `period` |
| schedule_date | date \| null | Para `specific_date` |
| recurring_days | integer[] \| null | Para `recurring` (0=Dom, 1=Seg...6=Sáb) |
| period_start | date \| null | Para `period` |
| period_end | date \| null | Para `period` |
| completed_dates | date[] | Datas em que foi marcada como concluída |
| actions | JSON | Array de `{ type: "open_url" \| "open_file", value: string, label?: string }` |
| sort_order | integer | Para ordenação manual |
| created_at | datetime | Auto |

> **O `label` da ação entrou sem migration** (2026-08-13), e é a coluna ser JSON que
> permitiu: linha antiga desserializa com o campo ausente, e é justamente a ausência que
> o `actionLabel` trata — sem nome, o chip deriva o destino do host e, não o reconhecendo,
> o rótulo do valor. A linha antiga **não é reescrita**: ela continua sem nome, e o que
> muda é só o que se lê na tela. **Nome vazio não é
> gravado como `label: ""`**: quem constrói a ação é o `buildPlannedAction`, e é ele que
> faz a string de espaços e a ausência do campo significarem a mesma coisa nas três
> integrações que criam ação e nas três telas que as editam. A regra de quem escreve o
> nome está em `docs/regras-de-negocio.md` §6.5.

### 4.3 Project

| Campo | Tipo | Regras |
|---|---|---|
| id | UUID | PK |
| workspace_id | UUID | FK → Workspace, obrigatório |
| name | string | Único **por workspace** (`UNIQUE(workspace_id, name)`) |
| color_index | integer | Slot da paleta de cores. Atribuído na criação, **nunca derivado do id nem do nome** |

> **O `color_index` é o menor índice livre no workspace**, calculado por
> `nextProjectColorIndex` e gravado na criação — vale para os três caminhos que
> criam projeto (manual, import em lote, import do Monday). Até a migration 017 a
> cor saía de `hash(id) % 6`, e sorteio não resolve: com 6 slots e um catálogo de
> 60 projetos, cada cor carregava ~10 deles e duas linhas na mesma tela tinham 98%
> de chance de coincidir. Hoje são 24 slots atribuídos, então 2 ou 3 projetos por
> cor no mesmo catálogo, e 36% de coincidência na tela.
>
> **É índice cru, sem teto** — quem passa do fim da paleta dá a volta na
> apresentação (`índice % 24`, em `getProjectColor`). Guardar o índice e não o
> slot final é o que permite a paleta crescer ou encolher sem reescrever linha
> nenhuma. "Menor livre" e não "próximo" porque excluir projeto abre buraco, e
> reaproveitá-lo mantém o catálogo dentro da faixa da paleta.
>
> **Sem UNIQUE em `(workspace_id, color_index)`, de propósito.** Ler o catálogo e
> gravar não é atômico, e duas criações concorrentes entre janelas podem cair no
> mesmo índice. Com a constraint, a corrida custaria o projeto (o INSERT falharia
> e o item do Portfólio sumiria da importação); sem ela, custa uma cor
> compartilhada, que é o estado normal de todo catálogo maior que a paleta.

### 4.4 Category

| Campo | Tipo | Regras |
|---|---|---|
| id | UUID | PK |
| workspace_id | UUID | FK → Workspace, obrigatório |
| name | string | Único **por workspace** (`UNIQUE(workspace_id, name)`) |
| default_billable | boolean | Padrão para novas tarefas com esta categoria |

### 4.5 ExportProfile

| Campo | Tipo | Regras |
|---|---|---|
| id | UUID | PK |
| workspace_id | UUID | FK → Workspace, obrigatório |
| name | string | Obrigatório |
| is_default | boolean | Apenas um pode ser default **por workspace** (índice parcial) |
| format | enum | `csv` \| `json` |
| separator | enum | `comma` \| `semicolon` (apenas CSV) |
| duration_format | enum | `hh:mm:ss` \| `decimal` \| `minutes` |
| date_format | enum | `iso` \| `dd/mm/yyyy` |
| columns | JSON | Array de `{ field, label, visible, order }` |

### 4.6 Workspace

| Campo | Tipo | Regras |
|---|---|---|
| id | UUID | PK. O workspace "Padrão" tem id sentinela fixo, semeado pela migration 011 |
| name | string | Único, obrigatório |
| color | string | **Nome de um slot** da paleta (`teal`, `amber`…), nunca um valor de cor |
| created_at | datetime | Auto |

Escopam por workspace: `Task`, `PlannedTask`, `Project`, `Category` e
`ExportProfile`. **Custom fields, quando existirem, serão globais** — ver
`docs/specs/workspaces-custom-fields.md`.

### 4.7 Config (chave-valor)

| Campo | Tipo |
|---|---|
| key | string (PK) |
| value | JSON |

### 4.8 Migrations

**Criar uma migration é criar um arquivo** em `src-tauri/migrations/`, no padrão
`NNN_descricao.sql`. Não há lista paralela a manter: o `sqlx::migrate!` embute o
diretório em tempo de compilação (`src-tauri/src/database.rs`). O registro à mão que
existia em `src-tauri/src/migrations.rs` foi apagado em 2026-08-12.

**Quem migra é o Rust, no `setup()`, e não o `tauri-plugin-sql`.** O plugin 2.4.0 tira
a lista de migrations do mapa compartilhado *antes* de migrar, então uma tentativa que
falha consome a lista e todas as seguintes **conectam sem migrar e retornam sucesso** —
com 4 janelas no boot, o app inteiro rodava em schema velho deixando um WARN no log.
Por isso o `.add_migrations` saiu: um dono só. Falha de migração agora aparece na tela
de erro do `App.tsx`, a API local não sobe, e nenhuma tela abre o banco.

O `getDb()` confere `MAX(version)` de `_sqlx_migrations` contra a versão que o Rust
reporta — é o que pega migrar um arquivo e ler outro. E **rollback não deixa linha**:
"sem linha" é ambíguo entre "nunca tentou" e "tentou e reverteu"; o log é a única
testemunha.

---

