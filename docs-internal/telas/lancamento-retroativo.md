# 5.8 Tela de Lançamento Retroativo

> Extraído da §5.8 do CLAUDE.md em 2026-08-10, verbatim.

### 5.8 Tela de Lançamento Retroativo

> **Decisão de produto:** O lançamento retroativo era originalmente especificado como um modal na Tela de Tarefas. Foi convertido em tela dedicada acessível pela sidebar para permitir entrada rápida em sequência de múltiplas tarefas sem fechar e reabrir o fluxo.

- **Acesso:** Ícone `FileClock` na sidebar.
- **Navegação de data:** Setas ← → e DatePickerInput. Não é possível avançar além de hoje.
- **Layout em duas colunas:** formulário fixo à esquerda (`RetroactiveEntryForm`, coluna estreita e rolável), lista do dia à direita. Empilhados, os campos personalizados faziam o formulário crescer sem limite e empurravam os apontamentos para fora da tela. A coluna **recolhe e é arrastável** como a do Planejamento (§5.3) — e **reabre sozinha** quando algo pré-preenche o formulário (deeplink de lançamento, botão de uma planejada sem horário): preencher campo escondido não mostraria nada.
- **Formulário de criação inline:** Nome, Projeto (autocomplete), Categoria (autocomplete), Billable, Hora início, Hora fim, Duração e os campos personalizados ativos. Criação sem modal; edição de registros existentes abre `EditTaskModal`.
- **Rótulo flutuante nos campos personalizados:** o rótulo começa dentro do campo, como placeholder, e sobe para a borda ao focar ou quando há valor — parando na mesma posição do rótulo encaixado de Início/Fim/Duração. Vale só para os campos personalizados, porque são os únicos dinâmicos: "Project Stage" não se explica pela posição no formulário como Nome e Projeto se explicam, então precisa continuar legível depois de preenchido. Os dois modos anteriores (`labelsAsPlaceholder` e rótulo-acima) foram removidos: o flutuante serve à coluna estreita e ao modal. O checkbox é a exceção — não há onde flutuar, o rótulo fica ao lado da caixa.
- **Modo de duração:** Toggle "Hora fim" / "Duração". Na duração, aceita `HH:MM:SS`, `MM:SS` ou inteiro (minutos).
- **Overnight:** Se hora fim < hora início, considera-se que a tarefa cruzou meia-noite — end é atribuído ao dia seguinte.
- **Cadeia de horários:** Após adicionar uma tarefa, o campo "Início" da próxima é automaticamente preenchido com o fim da tarefa recém-criada.
- **Tecla Enter:** Cria a tarefa (exceto quando autocomplete está aberto — nesse caso, seleciona o item).
- **Lista de tarefas do dia:** Tarefas completadas do dia selecionado, ordenadas da mais recente para a mais antiga.
- **A lista "Planejadas para este dia" é redimensionável na vertical** (`anchor: "top"`), pelo divisor que substituiu o `border-b` da seção. O valor gravado (`retroactivePlannedHeight`, padrão 144 px — o antigo `max-h-36`) é **teto, não altura**: com duas planejadas a seção continua encolhendo até o conteúdo, e altura fixa deixaria espaço vazio todo dia.

> **O teto do arraste é o conteúdo medido**, não o limite duro de 480 px. Passado o fim da lista
> não há mais nada a revelar, e deixar o divisor seguir o cursor no vazio faz o gesto parecer
> quebrado: arrasta-se 200 px, nada se move, e o caminho de volta só responde depois de recuperar
> os mesmos 200 px. Parar onde a lista acaba é a mesma resposta de bater no máximo. A medição é o
> `scrollHeight` num `useLayoutEffect`, e o `max` passa por um `Math.max(min, …)` porque com uma
> planejada só o conteúdo fica **abaixo** do mínimo e inverteria os dois limites do clamp.
>
> A preferência gravada **não** é re-clampada quando o conteúdo encolhe: 400 px escolhidos num dia
> cheio de reuniões voltam a valer no próximo dia cheio, mesmo tendo passado por dias de duas
> planejadas.

  - Botões por linha: Editar (abre `EditTaskModal`) | Excluir (sem confirmação).
  - **Seleção múltipla** pela barra "Selecionar tarefas", acima da lista: excluir em massa e **Mover para workspace**, este só com mais de um workspace (`MoveToWorkspaceModal`, o mesmo do Histórico e das entradas de hoje). O mover estava nas outras duas listas de tarefas e faltava só aqui — a barra idêntica à do Histórico fazia a ausência parecer feature desativada.
- **Total do dia:** Exibido no header quando há tarefas.

---
