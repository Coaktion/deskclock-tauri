# Google Sheets e Google Agenda

> Extraído da §5.7 do CLAUDE.md em 2026-08-10, verbatim.
> Contrato comum a todas as integrações: `docs/integracoes/README.md`.

**Google Sheets:**
| Campo | Tipo |
|---|---|
| ID da Planilha | text input |
| Sincronização automática | toggle (envia tarefa ao concluir) |
| Envio manual | botão na tela de Integrações para enviar tarefas selecionadas sob demanda |
| Autorização | botão OAuth |

**Google Agenda:**
| Campo | Tipo |
|---|---|
| Autorização | botão OAuth |
| Workspace DeskClock | dropdown (`calendarDeskclockWorkspaceId`). Governa **só** o "Importar eventos" |
| Rastrear reuniões automaticamente | toggle (`calendarAutoTrackingEnabled`, padrão desativado; requer Google conectado) |

> **A Agenda é a exceção ao workspace por integração, e a exceção foi escolhida.** O seletor dela
> vale só para o **"Importar eventos" manual**; o **rastreio automático de reuniões continua
> criando no workspace ativo**. Foi apontado ao usuário, na pergunta, que o mesmo modal também
> abria pelo Planejamento e passaria a importar para um workspace diferente do que a tela mostra —
> ele escolheu assim mesmo, e depois **removeu aquele botão** (§5.3): hoje o modal só abre pelo rail
> e pela tela de Integrações, onde o seletor está à vista. **Não "conserte" sem perguntar.** É por
> isso que só o `useMeetingTracker` mantém o gate de `workspaceLoading` (§ acima).

> **Rastreamento automático de reuniões:** quando ligado, `useMeetingTracker` (na main window, dentro do `RunningTaskProvider`) busca os eventos com horário do dia ao abrir o app e a cada 2 min, rastreando-os num store próprio da integração (`calendar_tracked_meetings` — a identidade do evento fica confinada aqui; `Task`/`PlannedTask` permanecem agnósticas). No horário de início (até 1 min antes) emite um prompt reutilizando a janela `overlay-popup`; confirmar inicia a tarefa via `RunningTaskContext.switchToTask` (encerra a corrente e inicia a da reunião). No término, pergunta se ainda está em andamento e re-pergunta a cada 15 min até encerrar — nunca para sozinho. A decisão de quando exibir cada prompt vive em use cases puros (`computeMeetingPromptActions`, `syncTodayMeetings`).

> **Reunião iniciada à mão é reconhecida, não re-perguntada.** O rastreamento só sabia da reunião
> iniciada pelo próprio prompt, então quem dava Play na planejada (popup, planejamento, omnibox)
> recebia o convite de início **a cada 5 min até o fim do evento** — e nunca o de término, que
> depende de `startedTaskId`. Agora, dentro da janela do evento, a tarefa em execução que é a reunião
> é **anexada** (`kind: "attach"` em `computeMeetingPromptActions`): grava `startedTaskId` em vez de
> perguntar, o que cala o re-prompt e habilita o de término.
>
> O reconhecimento é por **vínculo da planejada** (`activePlannedTaskId` do `RunningTaskContext` ==
> `plannedTaskId` da reunião) ou, sem vínculo, por **nome exato** — exato pela mesma razão da adoção
> de planejadas: anexar errado cala o início e para a tarefa alheia no prompt de término.
>
> **Só dentro da janela do evento**, e o caminho do nome exige ainda que a tarefa **tenha começado**
> dentro dela: uma "Daily" iniciada às 8h e ainda rodando às 10h não é a Daily das 10h, e anexá-la
> faria a parada dessa tarefa marcar a reunião como encerrada (via `RUNNING_TASK_CHANGED`), matando os
> dois prompts do dia. O vínculo da planejada dispensa essa segunda guarda — é a planejada *daquela*
> reunião, então tê-la iniciado adiantado é escolha, não colisão de nomes. **Pausada conta como em
> execução**: pausar no meio de uma reunião é corriqueiro, e perguntar "quer iniciar?" sobre a tarefa
> que está ali só faria o "sim" parar e recriar a mesma coisa. O `attach` vem **antes** da cadência
> de "perguntei há pouco": barrar por ela adiaria o reconhecimento justamente para o intervalo em que
> o prompt indevido dispara. Reunião dispensada não é anexada — "Dispensar" é decisão explícita.
>
> A escrita é `setStartedTaskId`, espelho de `setPlannedTaskId` e pelo mesmo motivo, no sentido
> inverso: o snapshot da reunião é anterior ao `plannedTaskId` que o ciclo de sync pode ter acabado
> de gravar, e um `upsert` de linha inteira o desfaria.

> **O vínculo manda, mas só dentro do workspace em que a tarefa vai nascer**
> (`resolveMeetingTaskDefaults`). O rastreamento é global — `calendar_tracked_meetings` não tem
> workspace —, enquanto a planejada é escopada, e **quem decide qual planejada a reunião adota é o
> ciclo de sync, com o workspace ativo *naquele* instante**: em geral logo depois da meia-noite,
> horas antes de o alerta tocar. Trocar de workspace no meio do dia bastava para o vínculo apontar
> para a cópia do outro, e o prompt colava na tarefa um `projectId` que **não existe** no catálogo
> ativo (§4.3) — a tela não acha o nome e o campo aparece **em branco**, exatamente como se nada
> tivesse sido copiado. Numa conta com as mesmas reuniões planejadas nos dois workspaces, e
> recorrentes entre elas, isso acontece todo dia.
>
> Fora do workspace, o vínculo cai para o **casamento por nome exato dentro do ativo** — o caminho
> principal antes de o vínculo existir, que volta como rede: é a cópia local que o usuário vê na
> lista do popup (escopada) e espera que o alerta use. Exato pela mesma razão da adoção de
> planejadas. Não achando nada, **nem o vínculo é gravado**: levá-lo adiante faria a parada concluir
> a planejada do outro workspace. A segunda consulta só acontece quando o vínculo falha.
>
> Isto **restaura** a guarda que existia antes de o casamento passar a ser por vínculo — a busca
> antiga era `findForDate(hoje, workspaceAtivo)`, escopada de propósito. A troca para `findById`
> ganhou robustez a renomeação e perdeu o escopo; agora tem os dois.
>
> **Os campos personalizados vão junto**, e é o que o comentário no código afirmava sem cumprir: o
> alerta copiava projeto e categoria e parava aí, então a reunião que adotou o item do Monday subia
> **sem o Project Stage** que o envio de horas exige, e o preenchimento voltava a ser manual todo
> dia. Eles também entram na chave de agrupamento (§6.3), como em todo início a partir de uma tarefa
> existente. Vão **copiados**, não por referência — o objeto segue para a tarefa nova, e partilhá-lo
> com a planejada faria uma edição na execução vazar para o molde sem passar por
> `applyRunningTaskEditToPlanned` (§4.1).

> **Rastrear e planejar são etapas separadas, e a planejada tem vínculo explícito**
> (`calendar_tracked_meetings.planned_task_id`). Enquanto a criação da planejada vivia dentro do laço
> que rastreia, ela só acontecia para evento novo **naquele ciclo**: o upsert do rastreamento gravava
> primeiro, e uma falha na criação deixava o evento marcado como visto para sempre — o prompt
> disparava no horário e a planejada nunca aparecia, nem reabrindo o app, porque o ciclo seguinte
> pulava o evento por já conhecê-lo. Agora `ensurePlannedTasks` parte de **toda** reunião do dia sem
> vínculo, então falha é nova tentativa no ciclo seguinte, e reunião que ficou sem planejada se
> recupera sozinha. O vínculo grava logo após cada criação: erro na terceira reunião não desfaz as
> duas primeiras nem marca a terceira como resolvida.
>
> `NULL` significa **ainda não tratada**; preenchido significa **tratada**, e continua assim mesmo
> que a planejada seja apagada depois — planejada apagada à mão não volta, nem quando a poda do
> Monday é que a apagou. A poda diária do rastreamento é o que mantém isso vivível: uma recorrente
> volta a ser avaliada na próxima ocorrência.
>
> O vínculo também substituiu o casamento **por nome** que o prompt fazia para copiar projeto e
> categoria: renomear a planejada não desfaz mais o pareamento.
>
> **O vínculo é gravado por `setPlannedTaskId`, não por `upsert`.** A escrita estreita não é
> economia: o `upsert` parte de um objeto lido no início do ciclo, e o prompt de reunião grava
> `startedTaskId` **fora** da guarda `inFlight`. Reescrever a linha inteira por cima devolveria
> `startedTaskId` a null no meio de uma reunião em andamento — o prompt de início seria reoferecido e
> o de término nunca dispararia.
>
> **Falha de uma reunião não aborta o ciclo.** Cada uma tem seu `try` e as mensagens voltam em
> `errors`: sem isso, um erro na terceira deixava a quarta e a quinta sem planejada e levava a poda
> diária junto.

> **Reunião e item do Monday para o mesmo trabalho não viram duas planejadas.** Existindo planejada
> de mesmo nome no dia — inclusive importada do Monday —, a reunião **adota** aquela em vez de criar
> outra. Sem isso sobravam duas linhas no planejamento, uma com o link do Meet e outra com o Project
> Stage que o envio de horas ao Monday exige; adotando, a mesma linha tem os dois. O nome usado é o
> **do evento**, não o da reunião rastreada, porque o reconcile pode tê-lo atualizado no mesmo ciclo.
>
> **Na adoção entra só o link de conferência, nunca o `htmlLink` do evento** — na criação o `htmlLink`
> segue valendo como reserva, porque a planejada nasceu daquele evento. A planejada adotada costuma
> ser de longa vida (recorrente, ou de período, como as que o Monday cria) e o rastreamento é podado
> todo dia: amanhã a mesma reunião volta a adotá-la. Como o `htmlLink` é único por ocorrência, o
> dedupe nunca casaria e a planejada acumularia uma ação por dia, indefinidamente. O link de
> conferência de uma recorrente é o mesmo em toda ocorrência — e é o único que serve para entrar na
> reunião.
>
> **O casamento é por nome exato, e de propósito.** Matching aproximado penduraria a reunião no
> trabalho errado em silêncio, num job de fundo, herdando projeto e etapa errados — duplicata visível
> é melhor que vínculo errado invisível. Nomes diferentes continuam gerando duas planejadas; a saída
> desenhada para isso é um apelido de agenda na planejada, ainda não implementado.

> **A falha do ciclo fica registrada** em `calendarLastSyncError` e aparece como frase abaixo do
> "Buscar eventos agora". O ciclo roda em segundo plano e engolia o erro com um `.catch(() => null)`:
> reunião que não virava planejada não deixava rastro nenhum, e a causa raiz do episódio de
> 2026-08-04 se perdeu por isso. A mensagem vem de terceiro, então é truncada antes de persistir, e a
> config só é escrita quando o valor muda — a cada 2 min, gravar sempre seria um `UPDATE` por ciclo
> sem nada novo a dizer.
>
> **Quem avisa a tela é o evento `MEETING_TRACKER_SYNC_RESULT`**, emitido em todo caminho de saída,
> como o `MONDAY_IMPORT_SYNC_RESULT`. Ler a config depois de um tempo fixo mostrava o estado anterior
> justamente quando a busca demorava, e um ciclo automático bem-sucedido nunca apagaria da tela um
> erro antigo.
>
> Os dois botões de "buscar agora" — este e o do Monday — compartilham o `useSyncNowButton` e a
> `SyncFeedbackLine` (§9.4). O **watchdog** dentro do hook não é detalhe: o rastreador registra o
> listener num efeito que espera config e workspace resolverem, então um clique nessa janela é
> emitido no vazio, e sem o corte por tempo o botão giraria até a tela remontar.

> **O rastreio de reuniões espera o workspace resolver, e o gate é no efeito.** Enquanto o
> `WorkspaceContext` carrega, o id ativo é o do workspace "Padrão" — um palpite, não uma escolha, e
> sincronizar antes criaria a planejada no lugar errado. O gate **não** pode ficar no `enabled()` de
> dentro do tick: ali ele não adiaria o primeiro ciclo por um tick, e sim pelo intervalo inteiro. No
> efeito, `loading` faz true→false uma vez por mount, o efeito reexecuta e o atraso inicial passa a
> contar da resolução.
>
> **Vale só para o `useMeetingTracker`**, e é consequência da exceção da Agenda abaixo: os
> rastreadores do Monday leem o workspace da **config** e não dependem mais dessa resolução — o gate
> deles saiu junto com o `useRef` que carregava o id ativo.
