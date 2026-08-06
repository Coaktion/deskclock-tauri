# Workspace DeskClock por integração — handoff

> **Estado: executado em 2026-08-06**, na branch `feat/monday-integration`. Escrito em
> 2026-08-05, na sessão que entregou as duas mudanças irmãs (`4390ab2` e `e5ccf6e`). Leia o
> CLAUDE.md antes; este documento pressupõe o §5.7 e o §9.5.

> **O que a execução decidiu**, além do planejado:
>
> - **O handoff foi escrito antes da Fase 0 do Portfólio+Report** e cita `MondayWorkspaceSection.tsx`
>   e `mondayActiveWorkspaceId`, que já não existiam. O seletor remoto do Monday tinha sumido junto:
>   lá entrou só o seletor novo, sem renomeação. A do Clockify ("Workspace ativo" → **Workspace
>   Clockify**) foi feita.
> - **`isMondayLinkedWorkspace` saiu**, como planejado, e a consequência aceita é que a varredura
>   diária passa a fazer também o **primeiro** import. Com a chave ainda vazia ela cria os projetos
>   do Portfólio no workspace "Padrão" — quem tem o Monday em outro workspace precisa escolhê-lo em
>   Integrações antes da primeira virada de dia.
> - **Todo caminho manual segue a config**, inclusive o `TaskSendModal`: o `TaskSendAdapter` ganhou
>   `workspaceId` e os três adaptadores leem cada um a sua chave. O envio manual deixou de ver todos
>   os workspaces — o que revoga o §9.5 item 7 também no caminho manual, não só no automático.
> - **Os catálogos precisaram acompanhar, e isso não estava no plano.** `useProjects`/`useCategories`
>   leem o workspace ativo, e os modais de integração os recebiam por prop: com o import criando no
>   workspace da integração, a planejada nasceria apontando para projeto de outro workspace.
>   `useIntegrationCatalogs` é o par deles para as telas de integração, e o
>   `IntegrationsModalsHost` resolve a chave por modal (`MODAL_WORKSPACE_KEY`).
> - **Tarefa de outro workspace é pulada sem `warning`.** O plano falava só do `findByDateRange`; no
>   modo por tarefa, avisar seria repetir o incômodo que a mudança veio resolver.
> - **Os gates de `workspaceLoading` dos dois rastreadores do Monday saíram** junto com os `useRef`
>   que carregavam o id ativo — o destino não depende mais da resolução do `WorkspaceContext`. O do
>   `useMeetingTracker` fica, por causa da exceção da Agenda.
> - **A correção do "a cada 30 minutos"** (`GoogleIntegrationSection`, rastreio que roda a cada 2)
>   saiu junto, como pedido.
> - **Não foi feito, e está registrado:** excluir um workspace **não** limpa as cinco chaves que
>   apontem para ele. A integração passaria a escopar por um id inexistente e pararia de enviar em
>   silêncio. Cabe em ~6 linhas no `useWorkspaceAdmin.remove`; ficou de fora por ser mudança que
>   ninguém pediu (§"Mudanças fora do escopo" do CLAUDE.md).

## O pedido, na voz do usuário

> "Integrações devem executar independente do workspace selecionado, mas só devem tentar enviar
> as tarefas dos workspaces associados."

E, decidido na mesma conversa:

> "Vamos trazer o seletor de Workspace DeskClock pra visão da raiz da integração, acima de
> 'Workspace ativo' na integração Monday. Vamos renomear 'Workspace ativo' para 'Workspace
> Monday'. Com isso, precisamos adicionar o seletor de Workspace DeskClock também na integração
> Google Sheets, pra que saiba de qual workspace buscar as tarefas pra enviar. O Google Calendar
> deve trazer também o seletor de Workspace DeskClock pra definir pra qual Workspace vai importar
> as tarefas. […] O mesmo seletor de Workspace DeskClock deve aparecer na integração Zendesk. E
> por fim, [no] Clockify […] adicionar o Workspace DeskClock e renomear o Workspace ativo por
> Workspace Clockify."

## O problema de hoje

Nenhuma integração sabe a que workspace do DeskClock pertence. Onde precisa de um, usa o
**ativo** — o que a pessoa escolheu na UI naquele instante. Duas consequências:

1. **Import cai no workspace errado.** `useMondayItemTracker` cria planejadas no ativo e lê o
   catálogo do ativo; estar num workspace pessoal na hora do ciclo faz a importação não achar
   projeto mapeado e não fazer nada, em silêncio. `useMeetingTracker`, `ImportZendeskModal` e
   `ClockifyMappingsSection` têm a mesma dependência.
2. **O envio enxerga todos os workspaces.** As estratégias leem
   `taskRepo.findByDateRange(start, end)` sem escopo — é a regra do §9.5 item 7, deliberada. Com
   mais de um workspace isso manda para o board do cliente as horas do trabalho pessoal, ou (no
   Monday) gera um aviso "o projeto não está mapeado" para cada tarefa que nunca deveria ter sido
   considerada.

O seletor "Workspace de destino" que já existe no Monday (`MondayImportSection.tsx:54-75`) é
estado de tela: nasce no ativo e morre ao sair. É ele que vira config.

## Desenho aprovado

Uma chave por integração, no `AppConfig`:

| Chave | Governa |
|---|---|
| `mondayDeskclockWorkspaceId` | import de itens, releitura diária de projetos, import de catálogo, envio de horas |
| `clockifyDeskclockWorkspaceId` | import de projetos/tags, envio |
| `sheetsDeskclockWorkspaceId` | de qual workspace saem as tarefas do envio |
| `calendarDeskclockWorkspaceId` | **só** o "Importar eventos" manual (ver abaixo) |
| `zendeskDeskclockWorkspaceId` | destino dos tickets importados |

**Vazio resolve para o workspace "Padrão"** (id sentinela da migration 011) **na leitura**, sem
escrita de config na montagem. Foi escolhido assim para a migração ser invisível: quem tem um
workspace só não percebe nada, e nada é gravado sem o usuário escolher.

Componente compartilhado (`sections/integrations/shared.tsx`), no topo de cada integração, acima
do seletor remoto. **Aparece só com mais de um workspace**, como todo o resto da UI de workspace
(§5.1.1, §5.6).

Renomeações: "Workspace ativo" → **Workspace Monday** (`MondayWorkspaceSection.tsx:102`) e
**Workspace Clockify** (`ClockifyWorkspaceSection.tsx:48`).

### A exceção da Agenda — decidida, não esquecida

O usuário respondeu explicitamente que o seletor da Agenda governa **só o "Importar eventos"
manual**; o **rastreio automático de reuniões continua criando no workspace ativo**.

Foi apontado a ele, na pergunta, que o mesmo modal também abre pelo Planejamento e passaria a
importar para um workspace diferente do que a tela mostra. Ele escolheu assim mesmo. **Não
"conserte" isso sem perguntar** — é decisão registrada, não descuido.

Consequência a aceitar: a Agenda fica **fora** do "integrações executam independente do workspace
selecionado". O `useMeetingTracker` mantém o gate de `workspaceLoading`.

## Onde encostar

**Config e UI**
- `src/shared/types/appConfig.ts` — as cinco chaves.
- `src/presentation/contexts/ConfigContext.tsx` — defaults `""`.
- `src/presentation/sections/integrations/shared.tsx` — o seletor compartilhado.
- `MondayImportSection.tsx` — o `destinationId` de estado local sai; passa a ler a config.
- `MondayWorkspaceSection.tsx`, `ClockifyWorkspaceSection.tsx` — rótulos.
- `GoogleIntegrationSection.tsx`, `ZendeskIntegrationSection.tsx` — o seletor novo.

**Consumo**
- `useMondayItemTracker.ts:37,63` — `activeWorkspaceId` → config. Some o gate de
  `workspaceLoading` (o destino deixa de depender da resolução), mas **confirme** antes de tirar:
  o `projectRepo.findAll` continua precisando de um id resolvido.
- `useMondayProjectsTracker.ts` — o destino vem da config, e **cai fora a guarda
  `isMondayLinkedWorkspace`** (`domain/usecases/monday/mondayProjectsSyncPolicy.ts`), que existe
  só para cobrir a ausência desta config. O teste dela sai junto; o `shouldSyncMondayProjects` do
  mesmo arquivo fica.
- `MondaySyncStrategy.ts:56-64,77-84` / `SheetsSyncStrategy` / `ClockifySyncStrategy` — o
  `findByDateRange` ganha escopo de workspace.
- `ImportZendeskModal.tsx:242`, `ClockifyMappingsSection.tsx:67` — `useActiveWorkspaceId` → config.
- `ImportCalendarModal` — destino pela config da Agenda (e **só** ele).

## O que não fazer

- **Não passe workspace por parâmetro nas assinaturas públicas dos hooks.** O §6.7 diz que todo
  registro nasce no workspace ativo lido do contexto, e é isso que mantém as assinaturas estáveis.
  A integração é a exceção, e ela lê a **própria** config — não recebe de fora.
- **Não escreva a config na montagem do seletor** para "migrar" quem já usa. Vazio já significa
  Padrão na leitura.
- **Não filtre por workspace dentro do `MondayTaskSender`.** Ele já filtra o mapeamento pelo
  workspace do **Monday** (`MondayTaskSender.ts:96-98`) — coisa diferente, e confundir as duas
  faz o envio parar sem erro. O recorte por workspace do DeskClock é da estratégia, que é quem
  busca as tarefas.

## Parte 4 — o que a documentação precisa dizer

**Isto revoga uma regra escrita, e a revogação é o ponto.** O §9.5 item 7 ("Não escopar as
leituras por workspace. Integrações são externas ao workspace e enxergam tudo — chame `findAll()`
/ `findByDateRange(start, end)` sem o terceiro argumento") e o parágrafo correspondente do §6.7
passam a valer o contrário. Se o código mudar e o CLAUDE.md não, o próximo agente desfaz isto
citando a regra — foi escrita justamente para impedir o que agora queremos.

Atualizar também:
- §5.7, Monday: o seletor, os rótulos novos, e que a integração roda independente do workspace na
  tela.
- §5.7, Agenda: a exceção do rastreio automático, **com o motivo**, e —
  **pendência independente desta parte** — a descrição na tela diz "a cada 30 minutos"
  (`GoogleIntegrationSection.tsx:516`) e o `useMeetingTracker` roda **a cada 2**
  (`SYNC_INTERVAL_MS`). O usuário pediu a correção junto. O "a cada 30 minutos" do
  `MondayAutoImportSection.tsx:64` está **certo** — aquele tracker é de 30 mesmo.
- A guarda provisória do §5.7 ("Só roda em workspace que já tem projeto daquele workspace do
  Monday… É provisória") deixa de existir: apague o parágrafo quando apagar o código.
- A linha de "Última atualização" no rodapé.

## Contexto que economiza uma investigação

Escrever coluna que o board não tem faz o Monday **recusar a mutation inteira** — HTTP 200 com
`InvalidColumnIdException`/`ResourceNotFoundException` no corpo. Não é ignorado (o que é ignorado
é id desconhecido na **leitura**, `column_values(ids:)`). Pior: `MondayClient.ts:159-164` traduz o
segundo em `MondayNotFoundError`, que `MondayTaskSender.updateOrRecreate` lê como "apagaram o
item" e responde recriando — duplicaria a atividade a cada ciclo. Por isso todo id vem do schema
do board, cacheado no `MondayProjectMapping`, e nunca de constante.
