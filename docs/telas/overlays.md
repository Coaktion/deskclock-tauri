# 5.1 Overlays (Janelas flutuantes)

> Extraído da §5.1 do CLAUDE.md em 2026-08-10, verbatim.

### 5.1 Overlays (Janelas flutuantes)

> **Arquitetura atual:** 2 janelas independentes — Compact Overlay (sempre visível) + Popup Flyout (aparece ao clicar). O Execution Overlay foi unificado no Popup Flyout.

> **O Command Palette foi removido** em 2026-08-10, por não ser usado. Ele foi o substituto do
> Welcome Overlay e era a **quinta janela** do app: nascia no boot, abria o SQLite e montava
> `Config`+`Repositories`+`Workspace` só para talvez nunca aparecer. Saíram com ele a janela
> `command-palette` (`tauri.conf.json`, `capabilities`, os três laços de always-on-top do
> `lib.rs`), o atalho global `toggle-command-palette`, os eventos `command-palette:*`, o toggle
> "Abrir acesso rápido ao iniciar" e o campo de atalho em Configurações. **O app passa a sempre
> abrir na janela principal.**
>
> As chaves `showWelcomeMessage` e `shortcutCommandPalette` ficam **órfãs e inertes** em `config`
> — é chave-valor (§4.7), e migration só para apagá-las custaria mais que o registro morto. É a
> mesma decisão do `fontSize` (§5.7).
>
> **Não confundir com o Omnibox**: a caixa de entrada do topo da tela de Tarefas é outro
> componente, com hooks próprios, e não foi tocada. O `Ctrl+1–7` também fica — o handler vive no
> `App.tsx`, e o do palette era cópia.

#### 5.1.1 Compact Overlay
- **Sempre visível** (always-on-top), arrastável, com persistência de posição.
- **Estado idle** (sem tarefa em execução): ícone do app + badge com contador de tarefas planejadas pendentes.
- **Estado running**: timer `MM:SS` pulsante substituindo o ícone; anel com glow animado no estilo da cor de status.
- **Estado paused**: indicador visual de pausa.
- **Clique:** abre o Popup Flyout.
- **Grip bar** para arraste, com snap-to-grid opcional.
- **Workspace:** com mais de um workspace, a cor do ativo aparece como duas faixas nas bordas do botão, com o miolo aberto pelo fundo do ícone. Some quando só existe um.

#### 5.1.2 Popup Flyout (Overlay de execução)
- **Aparece ao clicar** no Compact Overlay — flyout acoplado, não janela separada.
- **Estado idle:** lista de tarefas planejadas para hoje + botão "Nova tarefa". Cada linha tem botões `Editar` (✎), `Concluir` (✓) e `Iniciar` (▶) — concluir marca a tarefa como concluída no dia atual sem precisar abrir o planejamento, útil para corrigir tarefas que pararam com "Pendente" mas estavam de fato finalizadas. Botões do header: `Ir para planejamento` | `Fechar`.
- **Editar planejada sem sair do overlay (`PlannedTaskEditSheet`):** painel que cobre o conteúdo do popup **no tamanho que ele já tem** — a janela não cresce, porque crescer tiraria o overlay do canto onde o usuário o deixou. Traz os mesmos campos do `EditPlannedTaskModal`, **nesta ordem**: nome, projeto, categoria com billable, campos personalizados, agendamento e ações. Os campos personalizados vêm antes do agendamento porque são atributos do trabalho, como projeto e categoria; o agendamento é o bloco que diz *quando*, e intercalá-los partia os dois grupos ao meio. O que garante que os dois não divirjam é o `usePlannedTaskEditor`, que guarda todo o estado e a montagem do payload; os componentes só dispõem os campos na tela (§9.4). Adaptações para os 264 px úteis: tudo empilhado em coluna, dias da recorrência com uma letra (o dia inteiro fica no `title`), período com as duas datas empilhadas, e o corpo rolando por dentro — é a rolagem que absorve campos personalizados e ações sem mexer na janela. Com o painel aberto, o popup **não fecha no blur nem no ESC** (o ESC fecha o painel) — fechar sozinho descartaria a edição, a mesma guarda já usada pelo prompt de reunião.
- **Estado running/paused:** nome da tarefa, timer ao vivo, borda lateral colorida (billable/non-billable). Controles: Play/Pause, Stop (com confirmação Concluída/Pendente), Cancelar, Fechar.
- **Confirmação de Stop:** ao clicar em Parar, abre um painel inline com input `HH:MM` da hora de término (preenchido com a hora atual) e botões `Concluída` / `Pendente`. Se o usuário não tocar no campo, o término é gravado como agora. Se backdatear, a hora informada vira o `endTime` e a `durationSeconds` é recalculada — atendendo ao caso "esqueci de parar o timer". Validação inline rejeita horas anteriores ao `startTime`.
- **Edição inline por campo:** clique em nome, projeto ou categoria abre edição in-place sem modal. Vindo a tarefa de uma planejada, a edição **também configura a planejada de origem** (§4.1) — é aqui que a reunião importada da Agenda ganha projeto e categoria de uma vez por todas.
- **Hora de início** editável — recalcula o timer ao alterar.
- **Seção "Ações"** (quando a tarefa em execução tiver ações configuradas): chips clicáveis que disparam cada ação sob demanda — não há mais execução automática ao iniciar.
- **Workspace:** chip no header com o workspace ativo e troca pelo próprio overlay, com a mesma guarda de "parar e trocar". Some com um único workspace.

---
