# Ações da linha planejada

> **Estado: em execução**, uma fase por commit (tabela "Fases"). Decidido em 2026-09-18 a partir
> de um protótipo com duas variantes. Esta foi a escolhida, e a outra (concluir como botão à
> direita) foi descartada. **Duas branches:** `feat/planned-row-actions` termina na F5 (só o
> Planejamento, testado e aprovado) e é o ponto de retorno; `feat/row-actions-lists` sai dela e
> leva o padrão às outras listas (Parte 2). O PR final é o da segunda, que contém a primeira.

A linha do Planejamento tinha seis botões de mesmo peso no hover: Play, Compartilhar, Editar,
Concluir, Duplicar e Excluir. O problema não era a quantidade, era a hierarquia:

- A ação que se usa o dia inteiro (Play) tinha o mesmo peso da que se usa uma vez por mês (Duplicar).
- O estado mais importante da linha, concluída ou não, só se alterava por um botão escondido.
- O Excluir, que não pede confirmação, ficava a 14 px do Duplicar.

## A linha

```
[○] ● Nome da tarefa  ↻              [⋯]  [Billable]  [▶]
      Projeto · Categoria            sempre visíveis (H2)
```

| Peça                                          | Onde                                  | Quando aparece                                                                                                    |
| --------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Círculo de concluir** (`ui/CompleteToggle`) | slot `leading`, 14 px                 | sempre, fora do modo de seleção                                                                                   |
| **Play**                                      | coluna `trailing`, **depois** do chip | fora do modo de seleção, na tarefa pendente; na concluída e no modo de seleção a coluna fica vazia, mas reservada |
| **⋯**                                         | célula `actions`, a 1ª da direita     | sempre, fora do modo de seleção (H2)                                                                              |
| ⚡ e chip de faturamento                      | onde já estavam                       | como antes                                                                                                        |

- **Concluída:** o círculo fica cheio no acento com ✓, e o nome fica tachado em `fg-muted`, como já era.
- **O Play é a ação principal, e o desenho diz isso.** Ele usa `IconButton variant="primary"`:
  glifo ▶ **preenchido** na cor do acento, **sem fundo** em repouso, e o hover suave (`accent/10`)
  dos outros botões. É a única variante com cor em repouso; nas outras a cor é o destino do hover.
  Tamanho `md` com ícone de 16: um degrau acima dos outros botões da linha. Nasceu com fundo de
  acento que enchia no hover, e no teste ficou exagerado (2026-09-19).
- **Play bloqueado** (`isPlayBlocked(playBlock)`): o botão continua visível e desabilitado, com
  aparência de desabilitado (sem o tom de acento, opacidade reduzida) e o motivo no `title`
  (`playTitle`). **Não há ícone de pausa.** A linha que está rodando continua dita pelo realce de
  execução que já existe.
- **O Play não pode andar.** Por isso a coluna dele é reservada mesmo vazia: com a coluna sumindo
  na concluída ou no modo de seleção, o chip saltaria 38 px a cada conclusão e a cada entrada no
  modo.

## Os gestos

| Gesto             | Fora do modo de seleção              | No modo de seleção             |
| ----------------- | ------------------------------------ | ------------------------------ |
| Clique na linha   | abre o modal de edição               | marca ou desmarca              |
| Clique no círculo | conclui ou reabre                    | — (a caixa ocupa o lugar dele) |
| Clique direito    | abre o menu **no ponto do clique**   | nada                           |
| ⋯                 | abre o mesmo menu, ancorado ao botão | — (some)                       |

**Controle dentro da linha para a propagação do clique**: círculo, Play, ⋯, chip e ⚡. Sem
isso, cada clique neles abriria também o modal de edição.

### O menu (`ui/Menu`)

| Item                   | Atalho |
| ---------------------- | ------ |
| Editar                 | `E`    |
| Duplicar               | `D`    |
| Copiar link            | `L`    |
| — divisor —            |        |
| Excluir (tom `danger`) | `Del`  |

- **"Compartilhar" passou a se chamar "Copiar link"**, aqui e em todo o app (UI, manual e docs).
  A ação sempre foi só copiar um endereço, e o nome antigo sugeria que ela abria algo. O que
  **não** mudou: o esquema `deskclock://task/share`, os ids das âncoras do manual e o nome do spec
  `compartilhar-tarefa.md`. Renomear qualquer um desses quebraria link já distribuído ou citação
  no código.
- O menu fecha com ESC, clique fora, rolagem e escolha de item. As setas navegam e o Enter
  escolhe. **ESC e Enter são consumidos com `preventDefault`** (contrato de teclado nº 3 do
  CLAUDE.md). Sem isso, o ESC esconderia a janela do app e o Enter submeteria o formulário da
  coluna.

### Teclado, com o foco na própria linha

| Tecla                   | Ação                  |
| ----------------------- | --------------------- |
| `Enter`                 | iniciar               |
| `Espaço`                | concluir ou reabrir   |
| `E` · `D` · `L` · `Del` | os itens do menu      |
| `↑` · `↓`               | foco na linha vizinha |

- A linha só é focável (`tabIndex=0`) quando recebe `onKeyDown`, então as outras telas não mudam.
- **O handler só age com `event.target === event.currentTarget`.** Com o foco num botão _dentro_
  da linha, o Espaço já aciona aquele botão, e agir também na linha faria duas coisas com uma
  tecla.
- A tradução de tecla em ação é uma função pura (`rowKey` com o mapa `PLANNED_ROW_KEYS`),
  testada à parte. Com Ctrl/Meta/Alt ela devolve `null`: a linha não rouba `Ctrl+Z` nem atalho do sistema.
- **As setas andam dentro do cartão do dia** e param nas pontas; não atravessam para o dia
  seguinte. A vizinha é achada pelo `tabindex="0"` que o `TaskRow` só põe na linha focável.
- **O menu é irmão da linha, não filho**: os atalhos dele nem chegam à linha, e a guarda de
  `target` acima fica como segunda linha de defesa.
- **Limitação conhecida:** excluir pelo teclado (`Del`) apaga a linha e o foco se perde, em vez de
  ir para a vizinha.
- ~~**O ⋯ abre com hover ou foco de teclado, não com o clique.**~~ **Revogado pela H2**: o ⋯ é
  sempre visível, e com ele caíram as três regras de revelar (`group-hover`,
  `group-focus-within` e o par `group-focus-visible`/`group-has-[:focus-visible]` da linha
  focável). Não há mais o que abrir, então o clique do mouse na linha focável não deixa nada
  aberto para trás.
- **Toda tecla que vira ação é consumida com `preventDefault`** (contrato de teclado nº 3). Sem
  isso o Espaço rolaria a lista e o Enter chegaria ao `useSubmitOnEnter` de algum container.

## Exclusão com desfazer

Excluir continua **sem confirmação**, mas deixou de ser irreversível. O toast diz "Tarefa
excluída" ou "N tarefas excluídas" e traz o botão **Desfazer**. O `Ctrl+Z` faz o mesmo.

- **Só o último lote, por 6 s.** Não há pilha de desfazer. Uma exclusão nova substitui a anterior.
- **Restaurar é reinserir com o mesmo id.** Os vínculos (`tasks.planned_task_id`,
  `monday_imported_items`, `calendar_tracked_meetings`) **não têm FK** e ficam no banco quando a
  tarefa é apagada; voltando o id, eles se reconectam sozinhos. Só
  `planned_task_custom_values` cai em cascata, e o `save()` do snapshot a regrava. `sortOrder`,
  `completedDates` e `actions` voltam do snapshot, então a tarefa reaparece na mesma posição.
- **Restaurar é idempotente**: o snapshot que já existe no banco é pulado. O `listen` do Tauri
  pode entregar o evento duas vezes sob StrictMode, e o restauro não pode duplicar a tarefa.
- O botão do toast mora em **outra janela**: ele emite `PLANNED_TASKS_UNDO_DELETE`, e quem ouve é
  o Planejamento. O `Ctrl+Z` é ignorado dentro de campo editável (onde ele desfaz texto) e com
  modal aberto.
- A exclusão em lote do modo de seleção passa pelo mesmo caminho.
- A exclusão pela API local e pelo MCP **não** tem desfazer: não há ninguém olhando um toast.
- **Falhas:** exclusão que falha mostra "Não foi possível excluir." e recarrega a lista. O lote
  **não é atômico**: o que já tinha sido apagado antes da falha fica apagado e sem desfazer. O
  restauro que falha mostra "Não foi possível desfazer." e recarrega; o lote já foi consumido
  (é limpo antes do `await`, pela corrida acima), então não há segunda tentativa.
- **O `usePlannedTasks*` não tem mais `remove`.** Excluir planejada pela UI passa pelo
  `usePlannedTaskUndo`; uma segunda porta seria exclusão sem desfazer.
- **Limitações conhecidas**, aceitas: desfeito pelo `Ctrl+Z`, o toast continua mostrando o
  Desfazer até expirar, e clicar nele não faz nada. O mesmo vale se o usuário sair do
  Planejamento durante os 6 s, porque quem ouve o evento é o Planejamento.

## Divergências declaradas do wireframe 3e

O wireframe desenha a fileira de botões no hover, **depois** do chip, e nenhum círculo. As quatro
mudanças abaixo são decisão do usuário, **não** dívida de fidelidade: o círculo em `leading`, o
Play fixo em `trailing` e a fileira de hover reduzida ao ⋯ (2026-09-18), mais o ⋯ **sempre
visível e antes do chip** (2026-09-19, H2). Quem for "corrigi-las" de volta ao wireframe está
desfazendo decisão tomada.

## Fases

F0–F5 em `feat/planned-row-actions`; G1–G7 em `feat/row-actions-lists`, que sai dela (decisão do usuário, 2026-09-19: fica fácil voltar a só o Planejamento).

| Fase | Entrega                                                                                              | Estado                                 |
| ---- | ---------------------------------------------------------------------------------------------------- | -------------------------------------- |
| F0   | este spec e a atualização de `telas/planejamento.md`                                                 | ✅ `e2f286c`                           |
| F1   | `deletePlannedTasks` (devolve os snapshots) e `restorePlannedTasks` (idempotente)                    | ✅ `f458080`                           |
| F2   | hook `usePlannedTaskUndo`: toast com Desfazer, evento, `Ctrl+Z`, lote                                | ✅ `ef69d5d`                           |
| F3   | primitivo `ui/Menu`: âncora em elemento ou em ponto, teclado, portal                                 | ✅ `602d2b3` (+ fix de foco `013df5a`) |
| F4   | props aditivas: `TaskRow.trailing`/`onContextMenu`/`onKeyDown` e `IconButton variant="primary"`      | ✅ `4347328`                           |
| F5   | linha do Planejamento: `ui/CompleteToggle`, `ui/ClickBoundary`, `plannedRowKey`, `usePlannedRowMenu` | ✅ `302a8f0` — testada pelo usuário    |
| G1   | desfazer genérico + lançamentos (`Task`)                                                             | ✅ `fe67e70`                           |
| G2   | menu e teclado de linha genéricos                                                                    | ✅ `9e8c28b`                           |
| G3   | popup: lista de planejadas                                                                           | ✅ `3081d6b`                           |
| G4   | Tarefas: entradas (`TaskCard`) e grupo (`TaskGroupCard`)                                             | ✅ `06f0881`                           |
| G5   | Histórico (`HistoryTasksTab`) e Lançamento Manual (`DayTaskRow`)                                     | ✅ `b9455f8`                           |
| G6   | planejadas de hoje em Tarefas (`OmniboxIdle`)                                                        | ✅ `e58f715`                           |
| G7   | manual (`docs/index.html`) e docs com "Copiar link", `pnpm visual`, 2 modos × 4 acentos, PR          | a fazer                                |

## Parte 2 — as outras listas

O padrão da linha planejada vale para toda lista de tarefa: **o que se usa sempre fica visível,
o raro vai para o ⋯ (e o clique direito), e excluir se desfaz.** O círculo só existe onde algo
se conclui — planejadas —, nunca em lançamento.

### G1 · Desfazer genérico e lançamentos

- **Lançamento se apaga como planejada**: `DELETE` de verdade; `task_custom_values` cai em
  cascata; `task_integration_log`, `calendar_tracked_meetings.started_task_id` e os `task_ids` de
  `monday_activity_items` **não têm FK** e sobrevivem. Então o mesmo desenho serve: snapshot por
  `findById` (confirmar que hidrata `customValues`), restauro com o mesmo id, idempotente.
- `deleteTasks`/`restoreTasks` em `domain/usecases/tasks/`, espelhando F1.
- É a **segunda** ocorrência do desfazer: o `usePlannedTaskUndo` vira um hook genérico que recebe
  as funções de apagar/restaurar, o rótulo ("Tarefa excluída" / "Lançamento excluído"…) e o evento
  do toast. `usePlannedTaskUndo` passa a ser uma configuração dele. Evento novo para lançamentos
  (`TASKS_UNDO_DELETE`) e o aviso às outras janelas pelo `TASKS_CHANGED` que já existe.
- **Duas janelas podem montar o mesmo hook** (o Planejamento e o popup). Cada uma só guarda o lote
  que **ela** apagou, então a que não apagou ignora o evento do toast — conferir com teste.
- Verificar se a tarefa **em execução** pode ser excluída por alguma dessas listas; se puder, o
  restauro não pode ressuscitá-la rodando.
- Os três pontos que apagam lançamento pela UI passam pelo hook: `TodayEntriesSection`,
  `useHistory` (inclusive o lote do modo de seleção), `RetroactivePage` (idem).

**Como ficou (G1):**

- **Hook genérico: `useUndoableDelete<T>(options)`**, com `remove`, `restore`,
  `deletedMessage`, `undoEvent` e `onChanged`, devolvendo `{ removeWithUndo(ids) }`.
  `usePlannedTaskUndo(onChanged)` e o novo `useTaskUndo(reload)` são configurações dele. O `useTaskUndo` emite `TASKS_CHANGED` ele
  mesmo, ao apagar e ao restaurar — quem chama só passa o recarregar da própria tela.
- **`findById` hidrata `customValues`** (`TaskRepository.hydrate`), e o `save` é `INSERT` com
  todas as colunas do `Task`, `planned_task_id` inclusive: o snapshot já é completo. A coluna
  legada `sent_to_sheets` não está no `Task` e volta com o default `0`; nada no código a lê — o
  "enviado" vem do `task_integration_log`, que sobrevive.
- **A tarefa em execução não pode ser excluída por nenhuma das três listas**: `useTasks`,
  `searchTasks` (Histórico) e o `loadTasks` do Lançamento Manual filtram pelo status
  `completed`. O snapshot é sempre de lançamento concluído, e o restauro não tem como
  ressuscitar execução.
- O `useHistory` trocou o `remove` (que remendava grupos e totais à mão) pelo `removeWithUndo`,
  e recarrega a busca: o remendo teria de saber repor a tarefa no desfazer. Recarregar repete a
  **última busca que rodou**, não o filtro editado e ainda não buscado.
- Limitação aceita, a mesma das planejadas: sair da tela nos 6 s descarta o lote, e o Desfazer do
  toast deixa de fazer efeito.
- Sem porta de exclusão sem desfazer na UI: o `deleteTask` singular só é chamado pela API local.
- Limitação aceita: duas instâncias com lote pendente ao mesmo tempo (ex.: Planejamento e popup,
  cada uma apagou algo nos mesmos 6 s) restauram as duas com um clique no toast, porque o evento
  é o mesmo. Cada uma restaura só o próprio lote, nunca o da outra.

### G2 · Menu e teclado genéricos

- `usePlannedRowMenu` → hook de menu de linha que recebe os itens; o de planejada vira
  configuração dele.
- `plannedRowKey` → tradução genérica de tecla em ação, com o mapa por tela (E/D/L/Del só onde o
  item existe). Mesmas regras: foco na própria linha, `preventDefault` só no mapeado, modificador
  e auto-repeat passam.

**Como ficou (G2):**

- **Menu: `useRowMenu({ items, disabled })`** (`presentation/hooks/useRowMenu.ts`), devolvendo
  `{ anchor, fromTrigger, items, toggleFrom, openAtPointer, close }`. O `usePlannedRowMenu`
  manteve a assinatura e só monta os quatro itens.
- **Tecla: `rowKey(e, map)`** (`presentation/components/rowKey.ts`), com
  `map: RowKeyMap<A>` (tecla → ação, letra em minúscula) e retorno `A | RowFocusAction | null`.
  As setas (`focusNext`/`focusPrev`) ficam **fora** do mapa e valem em toda linha; modificador e
  auto-repeat, exceto nas setas, dão `null`. O mapa da planejada é `PLANNED_ROW_KEYS`.
- **Fiação: `rowKeyDownHandler(map, handlers)`**, no mesmo arquivo, devolve o `onKeyDown` da
  linha: guarda `target === currentTarget`, `preventDefault` só no mapeado, setas movem o foco
  entre irmãs `:scope > [tabindex="0"]`. `handlers: Record<A, () => void>`, então o tipo exige
  um handler por ação do mapa. É o que G3–G5 usam; a superfície sem Duplicar e Copiar link
  simplesmente não põe `d` e `l` no mapa.

### Por superfície

| Fase | Superfície                         | Visível                          | ⋯ e clique direito                             | Clique na linha                             | Desfazer            |
| ---- | ---------------------------------- | -------------------------------- | ---------------------------------------------- | ------------------------------------------- | ------------------- |
| G3   | popup, planejadas (`PlannedRow`)   | círculo, Play                    | Editar · Duplicar · Copiar link · Excluir      | edita                                       | sim                 |
| G4   | entradas de Tarefas (`TaskCard`)   | Play ("Iniciar com estes dados") | Editar · Excluir                               | edita                                       | sim                 |
| G4   | grupo de Tarefas (`TaskGroupCard`) | —                                | Editar grupo · Mover para workspace · Unificar | expande (como hoje)                         | —                   |
| G5   | Histórico e Lançamento Manual      | —                                | Editar · Excluir                               | edita fora do modo de seleção; marca dentro | sim, inclusive lote |
| G6   | planejadas de hoje (`OmniboxIdle`) | círculo                          | —                                              | **inicia** (como hoje)                      | —                   |

- **Concluídas do popup ficam como estão**: dois botões (Editar, Repetir) num painel de 264 px;
  o menu pesaria mais que ajudaria.
- O popup tem 264 px úteis: conferir que círculo + Play + ⋯ + chip cabem sem truncar o nome.
- Cada superfície que ganha `onKeyDown` fica focável; as regras de foco da F5 valem igual.
- `screenGeometry` mede várias dessas telas (3a Tarefas, 3b Histórico, 3f Lançamento Manual):
  mudança de grade que o wireframe não desenha é **exceção declarada** (`it`, como na 3e), não
  `divergente`. Na dúvida, parar e perguntar.

**Como ficou (G3):**

- **A linha saiu do `PopupOverlayContent`** para `overlays/PopupPlannedRow.tsx`, no desenho do
  `PlannedTaskItem`: `ui/CompleteToggle` em `leading`, `PlannedPlaySlot` em `trailing`, o ⋯ em
  `actions` e `Menu` irmão da linha. Menu pelo `usePlannedRowMenu`, teclado por
  `rowKeyDownHandler(PLANNED_ROW_KEYS, ...)`.
- **O que as duas linhas repetiam virou peça comum**, usada pelo `PlannedTaskItem` e pelo
  `PopupPlannedRow`, antes de a G4 copiar de novo:
  - `ui/RowMenuTrigger`: o ⋯ genérico (`ClickBoundary` com `ref` próprio, `pressed` do
    `fromTrigger`, `toggleFrom`), par de qualquer `useRowMenu` — é o que G4 e G5 usam.
  - `components/PlannedPlaySlot`: a coluna `w-7` do Play `variant="primary"`, bloqueado visível
    e desabilitado com o `playTitle`; `empty` deixa a coluna reservada sem o botão.
  - `components/TrackedMeetingMark`: o sino do rastreamento, com a redação do `title`.
  - `components/plannedShareLink.ts`: `copyPlannedTaskLink(...)`, o deeplink na área de
    transferência com o toast de sucesso ou erro.
- **Antes**, a linha tinha três botões no hover — Editar, Concluir e Play — e clique na linha
  não fazia nada. Nenhum se perdeu: Editar foi para o clique na linha e para o menu, Concluir
  para o círculo, Play para a coluna fixa. Duplicar, Copiar link e Excluir são novos no popup.
- **Clique na linha abre o `PlannedTaskEditSheet`**, o painel do popup, e não o modal do
  Planejamento: o popup não cresce (telas/overlays.md).
- **Excluir passa pelo `usePlannedTaskUndo`**, montado também no popup; o toast e o `Ctrl+Z`
  restauram só o lote que o popup apagou (G1).
- **O que o popup não tem**: modo de seleção, planejada concluída na lista (a aba mostra só as
  pendentes, então o círculo nunca reabre e a coluna do Play nunca fica vazia) e chip de
  faturamento, que nunca esteve nesta linha e não entrou.
- **Horário e `collapseActions` ficam como eram**: com hora, o ⋯ entra no lugar do horário; sem
  hora, a célula fecha em largura. _(Revogado pela H2: o ⋯ ganhou coluna própria e sempre visível,
  e a prop `collapseActions` deixou de existir.)_
- **Largura do nome**, calculada das classes (janela de 288, borda de 1+1, `pl-3`/`pr-3`: 262 px
  de grade; menos 5 px quando a lista rola). Antes → agora, texto do nome:

  | Linha              | Antes | Agora | Com ⚡ (antes → agora) |
  | ------------------ | ----- | ----- | ---------------------- |
  | sem hora, repouso  | 236   | 176   | 214 → 154              |
  | sem hora, no hover | 156   | 144   | 134 → 122              |
  | com hora           | 156   | 129   | 134 → 107              |

  O pior caso, com hora e ⚡, fica em ~107 px (~17 caracteres no degrau de 12,25 px). Falta
  conferir no `pnpm tauri dev`.

- **ESC**: o do menu é consumido e contido (`stopPropagation`), então não chega ao listener do
  `PopupOverlayApp` que esconde a janela. A decisão desse listener virou função pura,
  `shouldHidePopupOnEscape` (`overlays/popupEscape.ts`), e ganhou a segunda guarda
  (`defaultPrevented` e `[data-modal-open]`), a mesma do `useGlobalShortcuts`.
- `screenGeometry` não mede o popup (o spec do design não tem essa tela): nada a declarar.

**Como ficou (G4):**

- **Lançamento (`TaskCard`)**: os três botões do hover (▶ `sm`, Editar e Excluir, os dois últimos
  `<button>` crus) viraram o ▶ fixo em `trailing` e o ⋯ em `actions`. O ▶ é o `PlannedPlaySlot`
  da G3, que ganhou `idleTitle` para dizer "Iniciar com estes dados" em repouso — o texto do
  bloqueio continua sendo o do `playTitle`, igual em toda tela. Menu por `useEntryRowMenu`
  (Editar · — · Excluir em tom `danger`), teclado por `rowKeyDownHandler(ENTRY_ROW_KEYS, ...)`:
  `Enter` inicia (nada, com o ▶ bloqueado), `E` edita, `Del` exclui, setas andam. Sem Espaço,
  sem `D` e sem `L`: lançamento não se conclui, não duplica e não tem link. **Sem círculo.**
- **Clique na linha edita**, e o chip, o ▶ e o ⋯ contêm o clique (`ClickBoundary`), senão cada um
  deles abriria também o modal.
- **Excluir já vinha pelo desfazer** desde a G1 (o `TodayEntriesSection` passa o `removeWithUndo`
  como `onDelete`); a G4 só mudou por onde se chega nele.
- **Grupo (`TaskGroupCard`)**: os mesmos três botões de hover — Mover para workspace, Editar grupo
  e Unificar — viraram itens do ⋯ e do clique direito, **com as mesmas condições de antes** (sem
  outro workspace não há "Mover"; entrada solta não tem "Editar grupo" nem "Unificar"). Nada se
  perdeu e nada se inventou: o cabeçalho segue sem ação visível, e o clique na linha expande.
  No modo de seleção o menu some por inteiro e o clique marca, como era. Teclado mínimo: só o `E`
  do "Editar grupo" (`GROUP_ROW_KEYS`) — expandir por teclado não existia e o spec não o pede.
- **A coluna do ▶ é reservada no cabeçalho** (`EmptyPlaySlot`, extraído do `empty` do
  `PlannedPlaySlot`): ele divide a lista com linhas que têm ▶, e sem a coluna o chip dele ficaria
  38 px fora do alinhamento do das filhas.
- **`componentPrimitives`**: a baseline perdeu as duas entradas de `TaskCard` (2) e
  `TaskGroupCard` (3) — os cinco `<button>` crus viraram `IconButton`/`RowMenuTrigger`.
- **`screenGeometry` (3a, Tarefas)** continua passando sem exceção nova: a grade da linha não
  mudou, só o conteúdo das células `actions` e `trailing`, que o wireframe não mede.
- **Impacto** (`gitnexus`, upstream): `TaskCard` → `TaskGroupCard` → `TodayEntriesSection` →
  `TasksPage`, risco **LOW**, tudo dentro da tela de Tarefas.
- **Falta conferir no `pnpm tauri dev`**: o ▶ um degrau maior na linha das Entradas (2 modos × 4
  acentos) e o alinhamento do chip entre cabeçalho, filha e entrada solta.

**Como ficou (G5):**

- **Uma linha só para as duas telas**: `components/DayEntryRow.tsx`. O Histórico e o Lançamento
  Manual desenhavam a **mesma** linha em dois arquivos — mesma grade, mesmo par de botões no
  hover, mesmo modo de seleção —, e a G5 mexia nos dois do mesmo jeito. É a segunda ocorrência que
  a regra anti-DRY pede, então a linha privada do `RetroactivePage` (`DayTaskRow`) e o `TaskRow`
  montado dentro do `map` do `HistoryTasksTab` viraram o mesmo componente. Quem se especializa é o
  call site, por `badges` — só o Histórico tem o ⚡.
- **Antes**, cada linha tinha dois botões no hover (Editar e Excluir, os dois `IconButton`) e o
  clique na linha não fazia nada fora do modo de seleção. Nenhum dos dois se perdeu: são os itens
  do ⋯ e do clique direito, e Editar ganhou também o clique na linha. **Nada além desses dois
  existia** para sobreviver — o ⚡ do Histórico, o chip de faturamento e a caixa de seleção
  continuam onde estavam.
- **Sem ▶ e sem círculo**, e por isso **sem coluna `trailing`**: lançamento passado não se conclui,
  e "iniciar com estes dados" é gesto das Entradas de hoje (G4), não de uma lista do passado. As
  duas listas são homogêneas — nenhuma linha delas tem ▶ —, então não há coluna a reservar vazia,
  que é o que o cabeçalho de grupo da G4 precisou fazer.
- **Menu por `useEntryRowMenu`**, o mesmo da G4 (Editar · — · Excluir em tom `danger`), que ganhou
  `disabled` para o modo de seleção. Teclado por `rowKeyDownHandler(DAY_ENTRY_ROW_KEYS, ...)`:
  `E` edita, `Del` exclui, setas andam. É o `ENTRY_ROW_KEYS` **menos o Enter** — sem ▶, um Enter
  consumido não corresponderia a ação nenhuma.
- **No modo de seleção a linha volta a ser só alvo de marcar**: sem ⋯, sem clique direito, sem
  foco de teclado (as setas pulam a linha que não tem o que acionar) e o `useRowMenu` `disabled`,
  que **fecha** o que estiver aberto em vez de esconder.
- **Excluir já vinha pelo desfazer** desde a G1 — `useHistory` e `RetroactivePage` passam o
  `removeWithUndo`, a linha e o lote da seleção pelo mesmo caminho. A G5 só mudou por onde se
  chega nele, e `tests/presentation/pages/entryDeletePaths.test.ts` trava as duas telas contra uma
  segunda porta.
- **`screenGeometry` (3b, Histórico; 3f, Lançamento Manual)** continua passando **sem exceção
  nova**: as duas travas montam o `TaskRow` elas mesmas, a grade não mudou (nenhuma coluna entrou
  ou saiu) e o que mudou foi o conteúdo da célula `actions`, que o wireframe não mede. A 3b afirma
  também que a aba usa `<SectionCard`, e ela continua usando.
- **Impacto** (`gitnexus`, upstream): `HistoryTasksTab` → `HistoryPage` → `App`, e
  `RetroactivePage` → `App`; risco **LOW** nos dois, tudo dentro da própria tela.
- **Falta conferir no `pnpm tauri dev`** (2 modos × 4 acentos): o ⋯ no lugar da dupla de botões nas
  duas listas, o anel de foco da linha focável dentro do cartão do dia do Histórico e o menu
  abrindo sobre listas que **rolam** — as duas rolam, e o `Menu` fecha na rolagem.

**Como ficou (G6):**

- **Só o círculo**, no slot `leading` do `TaskRow` da lista suspensa do omnibox (`OmniboxIdle`):
  o mesmo `ui/CompleteToggle` da linha do Planejamento, que **para a propagação por conta
  própria** — clicar nele conclui sem iniciar a tarefa. **Sem ⋯, sem clique direito e sem
  teclado de linha**: a lista existe para escolher o que iniciar, e o ↑/↓/Enter do campo já é o
  teclado dela.
- **O clique na linha continua iniciando**, com o vínculo e os campos personalizados da
  planejada. Nada do que existia se perdeu: nem o chip de faturamento, nem o "Ver semana →".
- **O círculo nunca reabre, e é consequência da consulta, não uma decisão à parte.** A lista é
  `matchPlannedTasks`, que recorta as **pendentes** do dia: concluída, a tarefa sai da lista no
  recarregamento e não há ali um círculo cheio para desmarcar. Quem reabre é o Planejamento ou o
  popup. Por isso o `CompleteToggle` recebe `completed={false}` fixo e a prop é
  `onCompletePlanned`, não um par completar/reabrir — um `onUncomplete` aqui seria código sem
  chamador.
- **A conclusão passa pelo `complete` do `usePlannedTasksForDate`**, o mesmo caminho das outras
  superfícies: ele recarrega a lista e emite `PLANNED_TASKS_CHANGED`, então popup e Planejamento
  acompanham sem nada a mais. A `TasksPage` só desce o handler, como já fazia com o billable.
- **A grade não muda.** Com `leading`, o ponto de projeto deixa de abrir coluna própria e entra no
  bloco do nome (regra do `TaskRow`), e as colunas continuam `auto 1fr auto auto`. O
  `screenGeometry` (3a) mede o omnibox com a lista fechada, então **não há exceção nova a
  declarar** — só o fixture do teste ganhou a prop.
- **Impacto** (`gitnexus`, upstream): `OmniboxIdle` → `Omnibox` → `TasksPage` → `App`, risco
  **LOW**, tudo dentro da tela de Tarefas.
- **Falta conferir no `pnpm tauri dev`** (2 modos × 4 acentos): o círculo alinhado ao chip e à
  duração ausente nas linhas da lista suspensa, e o nome que encurta 14 px + gap com a coluna nova.

**Como ficou (G7):**

- **O manual (`docs/index.html`) passou a descrever o menu, não a fileira.** As cinco superfícies
  foram reescritas onde documentavam botões de hover: a linha da planejada (`#lista-planejadas`,
  que trocou a tabela de seis botões por uma de peças — círculo, Play, ⋯, clique na linha — mais a
  tabela dos quatro itens do menu com os atalhos), as Entradas de hoje e o grupo (`#entradas-hoje`),
  o Histórico (`#resultados`), o Lançamento manual (`#lista-do-dia`), a aba Planejadas do popup e a
  lista suspensa do omnibox (`#tarefas-planejadas`, que ganhou o círculo da G6).
- **Âncora nova, `#teclado-listas`**, na página de Atalhos: a tabela única do teclado de linha
  (`↑↓`, `Enter`, `Espaço`, `E`, `D`, `L`, `Del`, `Ctrl+Z`) e o aviso do desfazer de 6 s. As outras
  telas linkam para ela em vez de repetirem a regra — o manual não tinha onde falar do `Ctrl+Z`.
- **Renomeado para "Copiar link"** no manual (o item da tabela da linha, o título
  `Compartilhar uma tarefa` → `Copiar o link de uma tarefa`, o `<h3>Gerar o link` → `Copiar o link`
  e o texto de como copiar) e no `README.md` ("botão de compartilhar" → item **Copiar link** do
  menu). O `docs-internal/telas/planejamento.md` já vinha renomeado da F5.
- **Manteve o nome antigo, de propósito:** o esquema `deskclock://task/share`, o id da âncora
  `#compartilhar-tarefa` (link já distribuído aponta para ele), o nome do arquivo
  `docs-internal/specs/compartilhar-tarefa.md` e as entradas do `CHANGELOG.md`, que são registro
  histórico do que foi publicado com aquele nome. O `docs-internal/specs/mcp.md` também cita
  "compartilhar tarefa" numa nota de fase entregue, como referência ao recurso, não como rótulo
  de UI.
- **`compartilhar-tarefa.md` teve só a seção "Onde o botão fica"** atualizada (virou "Onde a ação
  fica"), com a nota do que não foi renomeado. O contrato do link não mudou em nada.
- Falta a **verificação visual** (`pnpm visual`, `pnpm tauri dev` nos 2 modos × 4 acentos) e o PR,
  que são do usuário.

## Parte 3 — o que a revisão do usuário mudou (2026-09-19)

O usuário revisou as seis telas no app e pediu três mudanças, que valem em **todas** elas. As três
são decisão dele, não dívida de fidelidade: quem for "corrigi-las" de volta está desfazendo
decisão tomada.

### H1 · O menu lista as ações, e o ⚡ sai da linha

**A ordem do menu é: ações · divisor · o que mexe na linha · divisor · Excluir.** A seção de ações
**abre** o menu, e o **Excluir é sempre o último item**, em toda superfície (decisão do usuário,
2026-09-19). A ação é o que se faz com a tarefa; o resto é o que se faz com a linha. E o item que
não se desfaz fica longe do cursor que acabou de abrir o menu.

- O menu ⋯ ganha um **divisor e uma seção de ações** — as `PlannedTaskAction` da tarefa, as mesmas
  que o ⚡ executava.
- **Uma ação só: ela é o item**, clicável direto, como o ⚡ já fazia ao executar sem abrir painel.
- **Mais de uma: um item "Ações" com submenu**, que abre no **hover** do item (e pelo teclado, como
  qualquer item).
- **O ⚡ deixa de existir na linha.** A ação passa a morar só no menu. Custa um clique a mais em
  quem usa a ação todo dia, e é o preço de devolver a largura ao nome: era o segundo controle que
  disputava a mesma faixa com o chip e a duração. O `PlannedActionsFlyout` continua na **barra de
  título** (variante `icon`), que não é linha de lista.

**Como ficou (H1):**

- **Submenu no `ui/Menu`, aditivo:** `MenuItem` ganhou `children?: MenuItem[]` e o `onSelect`
  passou a ser **opcional** — item com filhos não age, ele abre a lista. Nenhum call site existente
  mudou. O item com filhos se anuncia com `aria-haspopup="menu"` e `aria-expanded`, e troca o lugar
  do atalho por um chevron.
- **Teclado:** `→`, `Enter` e `Espaço` no item pai abrem o submenu **com o foco no primeiro filho**;
  `←` e `Esc` dentro dele voltam um nível, devolvendo o foco ao pai; `↑`/`↓`/`Home`/`End` andam
  dentro do painel em que o foco está; `Tab` fecha tudo. O `Esc` do submenu é consumido e contido
  como o do menu — ele não chega ao `document`, onde esconderia a janela do app. Andar no menu de
  cima **fecha** o submenu: ele é do item que ficou para trás. O submenu **para** a propagação de
  tudo o que trata, senão o `↓` andaria nas duas listas e a letra de atalho do menu dispararia com
  o foco lá dentro.
- **Mouse:** o hover do item pai abre o submenu e o hover de um item sem filhos fecha o que estiver
  aberto. Aberto pelo mouse, o foco **fica no pai** — quem navega ali é o cursor; aberto pelo
  teclado, o foco entra. As duas portas passam pela mesma trava do foco: o painel só foca depois de
  ficar **visível**.
- **Posição:** `placeMenu` ganhou uma terceira forma de âncora, `side`, e a mesma regra de virar na
  borda — à direita do item, ou à esquerda quando não cabe; alinhado ao **topo** do item, ou subindo
  pelo rodapé dele quando falta altura, que é o que o impede de cobrir quem o abriu.
- **O arquivo foi partido em quatro**, porque o submenu passaria dos 350: `ui/menuTypes.ts` (o
  contrato, reexportado por `ui/Menu` para que ninguém mude de import), `ui/menuPlacement.ts`
  (`placeMenu`), `ui/MenuPanel.tsx` (a caixa — portal, medida, visibilidade, foco — e a lista de
  botões, a mesma peça nos dois níveis) e `ui/Menu.tsx`, que ficou com o estado, os listeners de
  fechar e o teclado.
- **A seção de ações é uma função só**, `taskActionsMenuSection(actions)` em
  `presentation/hooks/`: `[]` não soma nada; **uma ação vira o item** "Abrir <destino>", que executa
  direto; **duas ou mais viram "Ações" com submenu**. O divisor vem junto, porque a seção é sempre a
  última de um menu que já tem itens. `usePlannedRowMenu` e `useEntryRowMenu` ganharam a prop
  `actions`, opcional, e a somam no fim.
- **Executar virou `runAction`** (`components/taskActions.ts`), com o `singleAction` ao lado: era a
  terceira grafia do mesmo `executeActions` + `openInBrowser`/`openInFileManager`. O `ActionChip` e
  o `PlannedActionsFlyout` passaram a usá-la, e o rótulo continua sendo o `actionLabel` do chip.
- **O ⚡ saiu de três linhas:** `PlannedTaskItem` (Planejamento), `PopupPlannedRow` (popup) e a linha
  do Histórico — onde o `DayEntryRow` trocou a prop `badges`, que existia só para ele, por
  `actions`. Nas três, a ação agora mora no ⋯ e no clique direito.
- **Fica de pé o que não é linha de lista:** a barra de título (`PlannedActionsFlyout`
  `variant="icon"`, no `TitleBarRunningTask`). A variante `pill` **não morreu**: ela é o ⚡ das
  **concluídas do popup** (`CompletedTasksSection`), a única lista que ainda não tem menu de linha.
  Tirá-lo de lá agora deixaria a ação sem porta nenhuma até a H3, que é justamente quem dá menu
  àquela linha — então ele sai lá, com a seção de ações entrando no mesmo commit. _(Cumprido na
  H3: a variante `pill` ficou sem call site e foi apagada, e o `PlannedActionsFlyout` deixou de
  ter variante.)_
- **Achado do caminho:** com o painel extraído, o React deixou de calcular adiantado o `setState` do
  **chamador**, e o gatilho que lia `e.currentTarget` **dentro** do updater passou a lê-lo já
  limpo. Nenhum call site faz isso — o `RowMenuTrigger` passa o `ref.current` —, mas a bancada do
  `Menu` fazia, e o teste ficou com o elemento guardado antes do `setState`, como o app.
- **`screenGeometry` continua passando sem exceção nova**: as travas montam o `TaskRow` elas
  mesmas e o que mudou foi o **conteúdo** da célula `badges`, que o wireframe não mede.
- **Impacto** (`gitnexus`, upstream): `PlannedActionsFlyout` → `PlannedTaskItem` e `PlannedRow` →
  `WeekPlanningView`/`PopupOverlayContent` → `PlanningPage`, 6 símbolos, risco **LOW**. O `Menu` e o
  `usePlannedRowMenu` não estão no índice (ele é anterior à F3), e o raio deles é o que a G2–G6
  listou: as cinco superfícies de linha.
- **Falta conferir no `pnpm tauri dev`** (2 modos × 4 acentos): o submenu abrindo sobre listas que
  **rolam** e perto da borda direita da janela (onde ele vira), o chevron alinhado ao rótulo, e o
  nome da tarefa mais largo agora que o ⚡ saiu da faixa do chip.

### H2 · O ⋯ é sempre visível, e é a primeira coluna da direita

- Ele **não some mais no repouso** e **não se empilha sobre a duração**: hoje a duração apaga no
  hover para o ⋯ tomar o lugar dela, e é isso que faz o tempo sumir no Histórico e nas entradas de
  hoje.
- A ordem da direita passa a ser **⋯ · chip · duração · ▶**. O ⋯ primeiro é o que o mantém no mesmo
  x em toda linha, tenha ela chip ou não — e é o que impede que ele cubra qualquer dado.
- `collapseActions` perde o sentido nesse arranjo: a célula não fecha mais em largura.

**Como ficou (H2):**

- **Duas células, não uma empilhada.** O ⋯ tem célula própria (`flex items-center gap-0.5`) e é a
  primeira da direita; marcas, chip e duração dividem a seguinte (`flex items-center gap-2.5`,
  o mesmo `gap` da grade). A duração deixou de levar classe de estado nenhuma — era o
  `group-hover:opacity-0` dela que apagava o tempo no Histórico e nas entradas de hoje.
- **A grade não mudou de forma.** As duas células da direita são emitidas **mesmo vazias**, então a
  contagem de colunas continua independente do conteúdo e os oito literais de `gridColumns()` são
  caractere por caractere os de antes. Pôr a duração numa quarta coluna própria custaria o `1fr` do
  nome em toda linha que não mede tempo — a planejada, onde o nome é mais caro —, e quebraria as
  travas de `grid-template-columns` das quatro telas medidas.
- **O que morreu com o `collapseActions`:** a prop e os seus dois call sites (`PlannedTaskItem`,
  `PopupPlannedRow`), o `w-0` + `overflow-hidden`, o `-mr-2.5`/`group-hover:mr-0` que cancelava o
  `gap` da célula fechada, o empilhamento `col-start-1 row-start-1`, o `pointer-events-none` da
  duração invisível, a inversão condicional da ordem das células e o objeto `REVEAL` inteiro (as
  variantes `within` e `keyboard`). **Nada legítimo restou pedindo a prop.**
- **O `FOCUS_RING` e a linha focável ficam intactos** (F5): `tabIndex=0` e anel só no
  `focus-visible` continuam vindo do `onKeyDown`. O que o `REVEAL.keyboard` existia para resolver —
  o clique do mouse focar a linha e deixar o ⋯ "aberto" — deixou de ser um problema, porque não há
  mais nada a abrir.
- **A coluna do ▶ (G3/G4) não mudou**: `PlannedPlaySlot`/`EmptyPlaySlot` seguem reservando os
  `w-7` mesmo vazios, e `trailing` continua sendo a última célula.
- **O `OmniboxIdle` não tinha ⋯ e continua sem**: a célula vazia que ele já pagava no fim da linha
  passou a ficar antes do chip, e a largura do nome é a mesma.
- **Efeito colateral declarado, nas concluídas do popup** (`CompletedTasksSection`): os dois botões
  dela (Editar, Repetir) passam pela mesma célula `actions` e ficam **visíveis em repouso** até a
  **H3** trocá-los pelo par ▶ + ⋯. É a única superfície que ainda não tem menu de linha, e a H3 é
  quem a põe no padrão.
- **`screenGeometry`:** duas **exceções declaradas** (`it`, nunca `divergente`), as duas
  autorizadas pela Parte 3 desta spec — a 3a afirma que o ⋯ vem **antes** do chip e da duração
  (o wireframe desenha chip → fileira de botões no hover), e a 3e trocou a trava de "as ações
  fecham em largura até o hover" por "o ⋯ é sempre visível, no gap do spec". As travas de
  `grid-template-columns` de 3a, 3b, 3e e 3f **continuam cobrando o spec sem exceção**, porque a
  forma da grade não mudou.
- **Impacto** (`gitnexus`, upstream): `TaskRow` tem 11 chamadores diretos e 24 símbolos no raio,
  risco **CRITICAL** por alcance — toda lista de tarefa do app passa por ele. Nenhum call site
  precisou mudar além de largar a prop: a mudança é interna ao primitivo.
- **Falta conferir no `pnpm tauri dev`** (2 modos × 4 acentos): o ⋯ em repouso em todas as listas
  (ele era invisível até agora, e o peso visual de uma coluna de ⋯ numa lista cheia só se julga na
  tela), a largura do nome na linha **com hora** do popup — que perdeu a largura do ⋯, antes
  empilhado sobre o horário —, o alinhamento do ⋯ entre cabeçalho de grupo, filha e entrada solta
  em Tarefas, e os 2 px a mais entre as marcas (`badges`) e o chip, que passaram do `gap-2` para o
  `gap-2.5` da célula de dados.

### H3 · As concluídas do popup entram no padrão

Revoga a linha da Parte 2 que as deixava como estavam.

| Peça            | Como fica                                              |
| --------------- | ------------------------------------------------------ |
| Repetir         | vira o **▶ fixo**, como nas entradas de Tarefas        |
| ⋯               | Editar · Excluir (com desfazer), mais a seção de ações |
| Clique na linha | edita                                                  |

**Como ficou (H3):**

- **A linha saiu do `CompletedTasksSection`** para `overlays/CompletedTaskRow.tsx`, no desenho das
  Entradas de hoje (`TaskCard`, G4): `PlannedPlaySlot` em `trailing`, o ⋯ em `actions` e `Menu`
  irmão da linha. Menu pelo `useEntryRowMenu` (seção de ações · Editar · — · Excluir em tom
  `danger`), teclado por `rowKeyDownHandler(ENTRY_ROW_KEYS, ...)`. **Sem círculo** — lançamento
  não se conclui —, e a seção continua com o cálculo do `PlayBlock` e do realce, que ela já fazia
  uma vez por grupo.
- **Antes**, a linha tinha dois `IconButton size="sm"` na célula `actions` — Editar (✎) e Repetir
  (▶) — e clique na linha não fazia nada. Nenhum se perdeu: Editar foi para o clique na linha e
  para o menu, Repetir virou o ▶ fixo da coluna `trailing`, `IconButton variant="primary"` de 16
  px como em toda lista. O rótulo em repouso é **"Repetir com estes dados"** (o `idleTitle` do
  `PlannedPlaySlot`, no lugar do antigo "Repetir tarefa"); o bloqueio segue com a redação única do
  `playTitle`, e o que o ▶ faz é exatamente o que o botão fazia — `onRepeat(group)`, que inicia uma
  execução nova com nome, projeto, categoria e billable da primeira irmã.
- **Excluir é novo nesta lista.** Até a H3 **não havia como apagar lançamento pelo popup**: a aba
  Executadas só editava e repetia. A porta nasceu já no desfazer — `useTaskUndo(reload)` montado no
  `PopupOverlayContent`, que apaga com snapshot, levanta o toast com Desfazer e emite
  `TASKS_CHANGED` —, e `entryDeletePaths.test.ts` passou a cobrar do popup o que já cobrava do
  Histórico e do Lançamento Manual. **A linha é um grupo** (§6.3), então Excluir apaga **todas as
  irmãs** de uma vez, como Editar já as editava: o lote vai inteiro para o `removeWithUndo`, e o
  toast diz "N lançamentos excluídos".
- **Duas janelas com lote pendente continuam sendo a limitação aceita da G1** — agora o popup pode
  ter dois hooks montados ao mesmo tempo, o das planejadas e o dos lançamentos. São eventos
  diferentes (`PLANNED_TASKS_UNDO_DELETE` e `TASKS_UNDO_DELETE`), então um toast não restaura o
  lote do outro.
- **O ⚡ saiu da última linha em que restava**, e com ele a variante `pill` do
  `PlannedActionsFlyout`: ela não tinha mais call site. O componente ficou **sem prop de variante**
  — é sempre o `IconButton` da **barra de título** (`TitleBarRunningTask`), que não é linha de
  lista e não rola, então o `closeOnScroll` do `useAnchoredPanel` é `false` fixo. As ações da
  origem continuam resolvidas por `actionsOfTasks` sobre o índice de **todas** as planejadas do
  dia; o que mudou é que elas viram a seção do menu (`taskActionsMenuSection`) em vez do painel de
  chips.
- **`screenGeometry` não mede o popup** (o spec do design não tem essa tela): nada a declarar.
- **Impacto** (`gitnexus`, upstream): `CompletedTasksSection` → `PopupOverlayContent` →
  `PopupOverlayApp`, 3 símbolos, risco **HIGH** por ser o caminho único da janela — a mudança é
  interna à aba. `PlannedActionsFlyout` volta 6 símbolos com risco **LOW**, mas o índice é
  anterior à H1 e ainda lista as linhas planejadas como chamadoras; hoje o único call site é o
  `TitleBarRunningTask`.
- **Falta conferir no `pnpm tauri dev`** (2 modos × 4 acentos): a linha da aba Executadas nos 264
  px úteis com ⋯ + duração + ▶ (o nome é o que cede largura, e o grupo ainda leva o `2x`), o ▶ um
  degrau maior que o ⋯ ao lado, e o toast de "Lançamento excluído" levantado **pelo popup**, que
  some no blur — confirmar que o Desfazer continua alcançável.

### Fases

| Fase | Entrega                                                         | Estado       |
| ---- | --------------------------------------------------------------- | ------------ |
| H1   | submenu no `ui/Menu` + seção de ações; ⚡ sai das linhas        | ✅ `130100b` |
| H2   | `TaskRow`: ⋯ sempre visível, primeira coluna da direita         | ✅ `0167d7f` |
| H3   | concluídas do popup no padrão + docs e manual das três mudanças | a fazer      |

A **ordem do menu** — seção de ações no topo, Excluir sempre no fim — saiu depois da H1, no
`7a85b66`: ela nasceu no fim do menu e foi a revisão do usuário que a levou para o começo.
