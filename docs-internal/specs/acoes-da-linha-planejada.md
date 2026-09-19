# Ações da linha planejada

> **Estado: em execução**, na branch `feat/planned-row-actions`, uma fase por commit (tabela
> abaixo). Decidido em 2026-09-18 a partir de um protótipo com duas variantes. Esta foi a
> escolhida, e a outra (concluir como botão à direita) foi descartada.

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
| **⋯**                                         | célula `actions` (`collapseActions`)  | só no hover e no `focus-within`                                                                                   |
| ⚡ e chip de faturamento                      | onde já estavam                       | como antes                                                                                                        |

- **Concluída:** o círculo fica cheio no acento com ✓, e o nome fica tachado em `fg-muted`, como já era.
- **O Play é a ação principal, e o desenho diz isso.** Ele usa `IconButton variant="primary"`:
  fundo de acento a 14% em repouso, cheio no hover. É a única variante com cor em repouso. Nas
  outras a cor é o destino do hover.
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
- A tradução de tecla em ação é uma função pura (`plannedRowKey`), testada à parte.
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

## Divergências declaradas do wireframe 3e

O wireframe desenha a fileira de botões no hover e nenhum círculo. As três mudanças abaixo são
decisão do usuário (2026-09-18), **não** dívida de fidelidade: o círculo em `leading`, o Play
fixo em `trailing` e a fileira de hover reduzida ao ⋯. Quem for "corrigi-las" de volta ao
wireframe está desfazendo decisão tomada.

## Fases

| Fase | Entrega                                                                                                     |
| ---- | ----------------------------------------------------------------------------------------------------------- |
| F0   | este spec e a atualização de `telas/planejamento.md`                                                        |
| F1   | `deletePlannedTasks` (devolve os snapshots) e `restorePlannedTasks` (idempotente)                           |
| F2   | hook `usePlannedTaskUndo`: toast com Desfazer, evento, `Ctrl+Z`, lote                                       |
| F3   | primitivo `ui/Menu`: âncora em elemento ou em ponto, teclado, portal                                        |
| F4   | props aditivas: `TaskRow.trailing`/`onContextMenu`/`onKeyDown` e `IconButton variant="primary"`             |
| F5   | montagem no `PlannedTaskItem`/`WeekPlanningView`, `ui/CompleteToggle`, `plannedRowKey`, "Copiar link" na UI |
| F6   | manual (`docs/index.html`) e docs com "Copiar link", `pnpm visual`, 2 modos × 4 acentos, PR                 |

**Fora do escopo:** as outras superfícies com linha de tarefa (a planejada de hoje em Tarefas, o
popup, o Histórico). Elas devem reaproveitar `ui/Menu` e `ui/CompleteToggle` numa rodada própria.
