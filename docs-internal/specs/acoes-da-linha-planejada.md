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
      Projeto · Categoria            hover            sempre
```

| Peça                                          | Onde                                  | Quando aparece                                                                                                    |
| --------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Círculo de concluir** (`ui/CompleteToggle`) | slot `leading`, 14 px                 | sempre, fora do modo de seleção                                                                                   |
| **Play**                                      | coluna `trailing`, **depois** do chip | fora do modo de seleção, na tarefa pendente; na concluída e no modo de seleção a coluna fica vazia, mas reservada |
| **⋯**                                         | célula `actions` (`collapseActions`)  | no hover e no foco de teclado                                                                                     |
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
- **O ⋯ abre com hover ou foco de teclado, não com o clique.** A linha focável foca também no
  clique do mouse, e `group-focus-within` deixaria o ⋯ aberto depois que o cursor sai. Por isso
  o `TaskRow` troca, só na linha focável, para `group-focus-visible`/`group-has-[:focus-visible]`.
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

O wireframe desenha a fileira de botões no hover e nenhum círculo. As três mudanças abaixo são
decisão do usuário (2026-09-18), **não** dívida de fidelidade: o círculo em `leading`, o Play
fixo em `trailing` e a fileira de hover reduzida ao ⋯. Quem for "corrigi-las" de volta ao
wireframe está desfazendo decisão tomada.

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
| G3   | popup: lista de planejadas                                                                           | a fazer                                |
| G4   | Tarefas: entradas (`TaskCard`) e grupo (`TaskGroupCard`)                                             | a fazer                                |
| G5   | Histórico (`HistoryTasksTab`) e Lançamento Manual (`DayTaskRow`)                                     | a fazer                                |
| G6   | planejadas de hoje em Tarefas (`OmniboxIdle`)                                                        | a fazer                                |
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
  hora, a célula fecha em largura.
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
