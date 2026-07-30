# Integração DeskClock ↔ Monday.com

- **Date:** 2026-07-30
- **Author:** Eduardo Meira
- **Project classification:** Current
- **Coverage tier:** A (use cases puros, sender, client e repositório) / B–C (UI, sem testes de renderização — padrão do projeto)

## Problem & constraints

A Aktie Now usa o Monday como fonte de projetos e destino de horas trabalhadas. O DeskClock precisa
importar os projetos e registrar horas de volta, sem que o usuário reescreva o apontamento no Monday.

Modelo real levantado via conector MCP (ver `docs/project_monday_integration.md`):

- **Projeto = board** no workspace *Delivery Center ( Construção )* (`15505674`), pasta `20715906`.
  A pasta convive com cópias de template e boards `Subitems of…`, que precisam ser excluídos.
- **Escrita de horas = criar item no grupo Activities** preenchendo `name`, `person`,
  **Reported Hours** (numbers, horas decimais), **Billing type** (status), **Activity Type** (status),
  **Status** = `Completed`.
- **Ids de coluna/grupo são gerados por template** (`mmXXXX`) → precisam ser resolvidos por
  título/nome de view, nunca hardcodados.

Restrições:

- Clean Architecture e §9 do `CLAUDE.md` (ports em `domain/`, adaptadores em `infra/`, UI injetada).
- **Criar item no Monday não é idempotente** — reenviar duplicaria o apontamento.
- Stack homologada, sem dependências novas.

## Alternatives considered

1. **Perfil de mapeamento genérico + serializadores por tipo** (proposta "B" do brainstorming),
   análogo ao `ExportProfile`: o usuário escolheria coluna a coluna o destino de cada campo.
   Descartada para a v1 por custo alto de UI diante de um template de board estável.
2. **Convenção fixa com ids hardcodados** — descartada: os ids `mmXXXX` variam por board.
3. **Marcar tarefas como enviadas via `task_integration_log`** (como Sheets/Clockify) em vez de
   rastrear o `item_id`. Descartada: o log diz *se* foi enviada, não *para onde* — sem o `item_id`
   não há como atualizar, só duplicar.

**Escolhido:** v1 opinionada espelhando o Clockify (colunas resolvidas por título) + store de
idempotência próprio indexado por assinatura de grupo.

## Plan

1. **Domain** — ports `IMondayApi`, `IMondayConfigPort`, `IMondayActivityItemRepository`;
   tipos `shared/types/monday.ts` e `mondayConfig.ts`; `validateTaskForMonday`; use cases puros
   `mondayGroupSignature`, `buildActivityColumnValues`, `resolveBoardActivitiesColumns`,
   `filterProjectBoards`, `importMondayProjects`.
2. **Persistência** — migration `010_monday_activity_items.sql` (version 10 em `migrations.rs`) +
   `MondayActivityItemRepository` (upsert por `signature`).
3. **Infra** — `MondayClient` (GraphQL, `Authorization` sem `Bearer`, paginação, `errors.ts`);
   `MondayTaskSender` com o upsert idempotente (create / update / skip);
   `MondaySyncStrategy`; `runMondayDailySync`.
4. **Config + Providers** — chaves `monday*` em `AppConfig` e `DEFAULTS`; factories em
   `IntegrationsContext`; strategy em `AutoSyncContext`; repo em `RepositoriesProvider`;
   `"monday-send"` em `IntegrationsUiContext` e `IntegrationsModalsHost`.
5. **UI** — `sections/integrations/monday/` (Tile, Card, ConnectedSections, WorkspaceSection,
   MappingsSection, AutoSyncSection, Logo) + barrel; `MondayConnectModal`; `MondaySendModal`
   delegando ao `TaskSendModal` genérico; entrada na `IntegrationsPage`.
6. **Gate** — `pnpm test`, `pnpm lint`, prettier, `@code-quality-reviewer`, Conventional Commit.

### Chave da idempotência

O rastreamento é chaveado por `(board_id, item_id)` — **não** pela assinatura, porque a assinatura
deriva de campos que o usuário edita depois do envio.

`signature = boardId :: dia local do startTime :: nome|projectId|categoryId :: billable`

O **sender unifica internamente** via `groupTasksForMonday` — um item por dia local, chave de grupo
(§6.3) e tipo de cobrança. `billable` entra na chave porque "Billing type" é uma coluna única do
item: um grupo misto precisa virar dois itens, senão o rótulo gravado dependeria da ordem em que as
tarefas chegam, que difere entre o envio diário e o por tarefa. As tarefas de cada grupo são
ordenadas por `startTime`, o que torna nome e ids determinísticos.

Os três chamadores (envio manual, `runPerTask`, `runDaily`) entregam as tarefas **cruas** — é o
sender que precisa conhecer todos os ids de cada grupo. Isso torna o contrato auto-imposto num único
lugar; no `TaskSendModal` genérico o comportamento é ligado pela flag `sendsRawTasks` do adapter.

O envio roda em quatro fases, porque nome e categoria são editáveis depois do envio e um grupo pode
absorver tarefas que já pertenciam a outros itens:

1. **Planejar** — para cada grupo, monta o payload e busca `findCandidates`: o item de assinatura
   idêntica e todos os que compartilham alguma tarefa no mesmo board e dia.
2. **Reivindicar** — cada grupo fica com no máximo um candidato e nenhum item é reivindicado por
   dois grupos. Em dois passes (todos os matches exatos de assinatura antes de qualquer match por
   interseção), para que o resultado não dependa da ordem dos grupos — que difere entre o envio por
   tarefa e o diário. É o que permite dividir um grupo sem que dois grupos sobrescrevam o mesmo item.
3. **Aplicar** — nada reivindicado → `create_item`; payload diferente → `change_multiple_column_values`;
   payload igual **e** assinatura igual → **skip**, sem chamada de API.
4. **Limpar órfãos** — candidatos que apareceram, ninguém reivindicou **e** estão inteiramente
   cobertos por este envio são apagados (`delete_item` + rastreamento). Sem isso, fundir dois grupos
   deixaria o item perdedor no board com as horas antigas, inflando o total reportado.

   A cobertura total é essencial: um envio por tarefa manda um grupo só, então um candidato pode
   conter tarefas que nem entraram no envio — apagá-lo destruiria horas ainda válidas no DeskClock.
   Esses ficam para o envio diário, cujo escopo é o dia inteiro. Se o item já tiver sido apagado à
   mão no Monday, o `MondayNotFoundError` é tolerado e o rastreamento é limpo mesmo assim; do
   contrário o mesmo órfão reapareceria e travaria todo envio seguinte.

A comparação é sobre o payload serializado inteiro — incluindo o **nome** —, não só a duração:
alternar o indicador billable (§6.2), renomear a tarefa ou remapear a categoria muda o item no
Monday sem mexer nas horas. O nome também vai dentro do `column_values` do update, já que
`item_name` só existe no `create_item`; sem isso o item ficaria com o nome antigo para sempre.

Se o item tiver sido apagado no Monday, o update falha com `MondayNotFoundError` — uma classe
própria, distinta do `MondayValidationError` genérico — e só então o sender descarta o rastreamento
órfão e recria. Qualquer outro erro propaga: o item pode existir, e recriar duplicaria o
apontamento.

### Desvios do plano original (aplicados durante o Execute)

- **`runPerTask` envia o grupo do dia inteiro.** O plano previa `sender.send([task])`. Como o envio é
  um upsert por grupo, mandar só a tarefa recém-parada sobrescreveria o item com a duração parcial
  sempre que houvesse duas tarefas do mesmo grupo no dia. A strategy agora reúne as irmãs concluídas
  do mesmo dia/grupo e o sender soma.
- **Tabela de idempotência mais rica que a do plano.** O plano previa
  `(signature, board_id, item_id, total_seconds)`. Virou `(board_id, item_id)` como chave, com
  `signature`, `day_iso`, `task_ids` e `payload` — necessário para a reconciliação por tarefa e para
  detectar mudanças que não são de duração (ver acima).
- **`markSent` só marca o que foi realmente enviado.** O sender pula tarefas cujo projeto não tem
  board mapeado; marcá-las daria à UI um badge "Enviado" para trabalho que nunca chegou ao Monday.
  O `validate` do `runDaily` e a guarda do `runPerTask` agora exigem projeto mapeado.
- **`TaskSendAdapter` ganhou `sendsRawTasks` e `resendWarning`.** O aviso genérico do modal
  ("o reenvio pode criar duplicatas") é falso para o Monday, cujo reenvio é upsert.
- **`toLocalDate` de `useTaskSendSelection` foi substituído por `localDateISO`.** Eram
  implementações equivalentes duplicadas; a idempotência do Monday depende de o agrupamento por dia
  do modal bater exatamente com o do sender, então elas não podem divergir.
- **`IMondayApi` ganhou `deleteItem`** (mutation `delete_item`), necessário para remover o item
  perdedor quando dois grupos se fundem.
- **`billable` entrou na assinatura** e o agrupamento virou o use case puro `groupTasksForMonday`,
  compartilhado entre o sender e a contagem do envio diário — antes as duas lógicas eram separadas
  e podiam divergir sem ninguém perceber.
- **`MondayActivityColumnIds` não tem `name`.** O nome do item vai em `item_name`, não em
  `column_values`.
- **`AutoSyncControls` compartilhado.** Por §9.4 do `CLAUDE.md`, os controles de auto-sync viraram um
  componente parametrizado por chaves de config; `ClockifyAutoSyncSection` foi migrado para ele
  (decisão aprovada em conversa), eliminando ~110 linhas duplicadas.
- **`importMondayProjects` virou use case de domínio** (em vez de lógica na seção de UI), o que o
  torna testável em Tier A.

## A validar no smoke test com token real

- O mecanismo de rename depende de o `change_multiple_column_values` aceitar `name` dentro de
  `column_values`. Como o nome também compõe o payload de comparação, se a API rejeitar isso
  **todo** update falha, não só o rename — plano B é uma chamada `change_simple_column_value` com
  `column_id: "name"`.
- A fusão de grupos **apaga** item no board (`delete_item`). Valide com dados descartáveis antes de
  rodar contra o workspace de produção.

## Governança do token (obrigatório antes do merge)

`mondayApiKey` é um **token pessoal de produção do Monday**, sem expiração e com escopo de conta
inteira — lê e escreve em todo board visível ao usuário, um blast radius maior que o do
`clockifyApiKey`. Ele é persistido em texto plano na tabela `config` do SQLite local, seguindo o
padrão já aceito para o Clockify.

- [ ] Registrar a entrada em `Coaktion/security-inventory` (dono, sistema, escopo, cadência de
      rotação, local de armazenamento, blast radius) e citar a referência aqui e no corpo do PR.
- [ ] Follow-up (fora desta entrega): migrar segredos de integração para o keychain do SO.

## Limitações conhecidas

- **Lançamento retroativo anterior ao último sync não entra no envio diário.** `calcDailyRange`
  começa no dia do último envio; uma tarefa lançada para um dia anterior fica de fora e o item no
  Monday mantém o total antigo. Comportamento herdado de Sheets/Clockify. Contorno: usar o envio
  manual, que aceita período livre.
- **`runPerTask` avança `mondayDailySyncLastTimestamp`**, como faz o Clockify. Ao trocar de
  `per-task` para `daily`, o primeiro range diário começa nesse ponto.
- **Um schema de board por importação.** Os rótulos de Activity Type/Project Stage exibidos na UI de
  mapeamento vêm do primeiro board mapeado, assumindo que todos nascem do mesmo template.
- **Sem retry em rate limit.** O upsert é sequencial; um `MondayRateLimitError` no meio aborta os
  grupos restantes. Nada corrompe (o timestamp não avança e o que já foi gravado é idempotente),
  mas numa carga de vários dias o envio pode ficar pela metade — basta reenviar.
- **Falha na limpeza invalida um envio bem-sucedido.** Se o `delete_item` de um órfão falhar por
  algo que não seja "não encontrado" (ex.: permissão), o `send()` lança **depois** de as horas já
  terem ido para o Monday; o `markSent` e o timestamp não avançam e a execução seguinte repete tudo.
  É diagnosticável, mas trava a integração por uma limpeza cosmética. Fechar isso exige um canal de
  warning no `ITaskSender`, que hoje devolve `void` — fora do escopo desta entrega.

## Follow-ups sugeridos (fora do escopo desta entrega)

- Extrair `<IntegrationConnectionCard>`, `<WorkspaceSelect>` e `<ApiKeyConnectModal>` — Monday e
  Clockify ainda repetem essas três estruturas.
- Migrar o `runClockifyImport` (helper privado da seção Clockify) para um use case de domínio, no
  molde de `importMondayProjects`.
- Dar ao `ITaskSender` um canal de warning, para que falhas não fatais (limpeza de órfão, rate
  limit no meio de uma carga) não invalidem um envio que já gravou as horas corretamente.
- `pnpm format` num commit isolado: 47 arquivos do repo, incluindo dois tocados aqui, já estavam
  fora do padrão do Prettier antes desta branch.

## Rollback

- A feature é **aditiva**: sem token do Monday configurado, `MondaySyncStrategy.isPerTaskEnabled()` /
  `isDailyEnabled()` retornam `false` e nada é executado.
- Reverter = `git revert` do merge. A migration 010 apenas cria a tabela `monday_activity_items`;
  deixá-la no banco é inofensivo (nenhuma tabela existente foi alterada).
- Desconectar pela UI limpa token, workspace, pasta e cache — o rastreamento de itens permanece, de
  modo que reconectar retoma a idempotência em vez de duplicar apontamentos.
- Único ponto compartilhado tocado: `taskGroupKey` extraído de `groupTasks` (comportamento idêntico)
  e `AutoSyncControls` consumido pelo Clockify. Ambos revertem junto com o commit.
