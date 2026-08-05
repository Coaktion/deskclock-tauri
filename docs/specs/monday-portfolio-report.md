# Monday — simplificação da configuração (Portfólio + Report de Horas)

> **Status:** Fases 0, 1, 2 e 3 executadas em 2026-08-05. Fases 4 e 5 pendentes.
> Substitui a configuração por workspace/pastas/board interno descrita em
> `monday-integration.md`. O que não for contrariado aqui continua valendo.

> **O que a execução das Fases 0/1 decidiu**, além do planejado:
>
> - **Fases 0 e 1 saíram juntas.** Não havia corte buildável entre elas: as
>   pastas iam da config direto para `importMondayProjects`, então tirar as
>   chaves obrigava a reescrever o importador no mesmo passo.
> - **`MondayProjectMapping.workspaceId` foi removido**, e com ele os 8 filtros
>   por workspace do Monday (`MondaySyncStrategy`, `useMondayItemTracker`,
>   `useMondayProjectsTracker`, `mondayProjectsSyncPolicy`, `MondaySendModal`,
>   `MondayEntriesModal`, `MondayImportModal`, `MondayImportSection`). Com um
>   Portfólio único não há mais o que separar. Onde o filtro servia para "board
>   que dá para consultar", virou `!!m.mondayBoardId`.
> - **A guarda de destino da varredura diária sobreviveu.** Ela tinha duas
>   metades e só a do workspace do Monday saiu; `isMondayLinkedWorkspace`
>   continua exigindo que o projeto exista no workspace ativo do DeskClock.
> - **O mapeamento ganhou `portfolioItemId` e `scope`.** O escopo entrou já na
>   Fase 1 porque a Fase 3 depende dele, e `importMondayCategories` deixou de
>   receber `internalBoardId`: o billable padrão agora vem de `scope`.
> - **Projeto sem destino é estado de primeira classe.** Cobre tanto o item sem
>   `text_mm5etnn2` quanto o board que falha o template — os dois viram
>   `mondayBoardId`/`activitiesGroupId` vazios, e o segundo ainda reporta o
>   motivo em `skipped`. Antes o board fora do template não virava Project.
> - **`resolveProjectDestination` foi extraída** de `importMondayProjects` para
>   o campo manual de "ID do quadro" resolver o schema pelo mesmo caminho da
>   varredura.
> - **`isMondayReady` exige projeto com quadro**, não só mapeamento: as três
>   ações do atalho consultam boards e abririam vazias.
> - **Desconectar não limpa os dois board ids** — descrevem a conta, não a
>   sessão.

> **O que a execução da Fase 2 decidiu**, além do planejado:
>
> - **Não existe default de motivo por categoria, e a tabela do §5 não foi
>   criada.** O motivo de non-billable é escolha da **atividade**, não atributo
>   da categoria: a mesma categoria rende horas faturáveis e não faturáveis, e a
>   pergunta que o campo responde ("por que *esta* hora não foi faturada") não
>   tem resposta no nível da categoria. Sem essa coluna sobrava só o `scope` na
>   tabela — e o escopo é derivável dos mapeamentos a qualquer momento, que é
>   justamente de onde ele sai. Tabela cujo único campo é cache do que a config
>   já tem é dívida: se um dia aparecer algo de fato por-categoria, ela nasce
>   ali. **A Fase 2 não tem migration.**
> - **A regra do motivo é de validação, e é da Fase 3:** obrigatório em projeto
>   de **cliente** marcado como non-billable, dispensado em projeto **interno**,
>   onde non-billable é a norma (0 horas faturáveis em 119 itens).
> - **O cruzamento de escopo não consulta `color_mm19csp3`.** O planejado era ler
>   a coluna de um board de cliente e de um interno; o id é gerado por template e
>   o resto da integração resolve coluna por título. Não foi preciso: os
>   `activityTypeLabels` e o `scope` de cada board já estão cacheados nos
>   mapeamentos desde a Fase 1, então o cruzamento é local e não custa requisição
>   nenhuma. `billableByActivityType` é quem o faz.
> - **A lista de Activity Types é a união do catálogo com o cache dos boards.**
>   As duas metades cobrem buracos diferentes — o catálogo traz rótulo de board
>   que ainda não foi importado ou não abre; o cache traz rótulo que existe num
>   board de projeto e não está no Report. Rótulo a mais custa uma categoria não
>   usada; rótulo a menos custa a coluna Activity Type em branco no apontamento.
>   `mergeLabels` é compartilhada pelo use case e pela tela.
> - **Os três campos são irmãos, e a decisão é sobre onde eles precisam ser
>   editáveis.** `mondayReportTypeFieldId` e `mondayNonBillableReasonFieldId`
>   entraram ao lado de `mondayProjectStageFieldId`, e o
>   `MondayProjectStageField` virou `MondayCatalogField`, genérico (antecipando o
>   que a Fase 5 previa). Campo nativo exigiria reescrever o mesmo input em nove
>   telas — planejamento, popup, retroativo, tarefa em execução, modais de
>   edição, omnibox, import do Monday, exportação —, tudo que os campos
>   personalizados já atravessam.
> - **`parseDropdownLabels` existe porque o formato do `dropdown` é outro:**
>   `status` guarda `{"labels":{"0":"Rótulo"}}` e `dropdown` guarda
>   `{"labels":[{"id":1,"name":"Rótulo"}]}` (verificado na API). Passar um pelo
>   parser do outro devolve lista vazia **sem erro nenhum**.
> - **Os catálogos ficam na config** (`mondayFieldCatalogs`), pelo mesmo motivo
>   dos `activityTypeLabels` do mapeamento: sem o cache, abrir a tela de
>   Integrações custaria uma consulta só para dizer quantos rótulos faltam em
>   cada campo.
> - **Rótulo desativado fica de fora** do catálogo de dropdown: ele não pode ser
>   escrito e valor inválido faz o Monday recusar a mutation inteira. O
>   `parseStatusLabels` da Fase 1 **não** filtra `deactivated_labels` — é a
>   mesma armadilha, um nível mais barato (vira categoria a mais, não escrita
>   recusada), e ficou fora do escopo.

> **O que a execução da Fase 3 decidiu**, além do planejado:
>
> - **Recusa não aborta o envio.** O grupo sem motivo de não faturável, ou com
>   Report Type que o board não tem, é **pulado**; os outros sobem, e as
>   mensagens voltam juntas num erro no fim. O `ITaskSender` só tem o `throw`
>   como canal, então recusar em silêncio deixaria a hora fora do board sem nada
>   na tela. Lançar **antes** de escrever faria uma tarefa travar o dia inteiro.
> - **O Report Type mudado depois do envio move o item de grupo.** Grupo não é
>   coluna: `change_multiple_column_values` não o alcança, e sem isso o item
>   ficaria em Activities para sempre. O grupo atual vem no retorno da própria
>   escrita (`group { id }`, de graça), então `moveItemToGroup` só é chamado
>   quando ele de fato diverge — e recriar o item para trocá-lo perderia as
>   atualizações que já existirem nele.
> - **`listItemsOwnedBy` passou a recortar todos os grupos de apontamento**, não
>   só o Activities. Sem isso, a atividade com Report Type `Meeting` some do
>   gerenciador — que não a editaria nem a apagaria — e reaparece no import como
>   se fosse item de trabalho a virar planejada. A separação por lote continua
>   sendo por par (coluna de pessoa, grupos), pela mesma razão de sempre: id de
>   grupo se repete entre boards com significados diferentes.
> - **O escopo virou a segunda guarda do Project Stage.** A primeira já existia
>   por acidente feliz — nos boards internos a coluna se chama "Project Phase" e
>   não bate com os títulos procurados. A guarda explícita é o que sobrevive ao
>   dia em que alguém adicionar o título à lista.
> - **`normalizeProjectMappings` dá o Activities ao mapeamento antigo.** Sem o
>   fallback, todo projeto vinculado antes desta fase recusaria o `Activity` que
>   é o padrão de toda tarefa, e o envio pararia inteiro até a varredura diária
>   de projetos reescrever a lista.
> - **A tabela `monday_activity_items` não mudou.** O grupo não entra no payload
>   rastreado: ele já é derivável do Report Type, que compõe a chave de
>   agrupamento e, por ela, a assinatura — mudar o Report Type já tira o grupo do
>   skip por "nada mudou".

## 1. O problema

A configuração atual exige workspace do Monday, pasta de clientes, pasta de
projetos internos, board interno e um mapeamento manual board ↔ Project. São
cinco escolhas para descrever algo que o próprio Monday já descreve.

**Passa a exigir dois ids de board:**

| Config | Valor padrão | Papel |
|---|---|---|
| `mondayPortfolioBoardId` | `18418432045` | lista de projetos |
| `mondayReportBoardId` | `18422834169` | catálogo canônico dos rótulos |

`mondayUserId` continua derivado da apiKey (`me.id`, gravado no
`MondayConnectModal`) — é cache, nunca input de tela.

---

## 2. Board Portfólio (18418432045) — "Portfólio Aktie Now"

62 itens, **um único grupo** (`topics` / "Projetos"). Cada item é um Project.

| Coluna | Id | Uso |
|---|---|---|
| Nome | `name` | nome do Project no DeskClock |
| Oferta | `color_mm4fzw3r` | **classifica cliente vs. interno** |
| ID Quadro Projeto | `text_mm5etnn2` | **id do board de destino das horas** |

### Regra de escopo (`Oferta`)

- `Atividades Internas` → **projeto interno**
- qualquer outro rótulo preenchido (`Pacote até 30h`, `até 60h`, `acima 60h`,
  `Escopo Fechado`, `Squad`) → **projeto de cliente**
- **vazia → o item é ignorado**, não vira Project

Hoje: 4 internos (CX / PMO / Tech / Implantação Atividades Internas), 2
ignorados (`Eucatex`, `Novo projeto Pedro`), 56 de cliente.

### Referências a persistir

Por projeto: `portfolioItemId` (`item.id`) e `projectBoardId`
(`text_mm5etnn2`).

**Regra de merge no refresh** — sobrescreve `projectBoardId` local **apenas se o
remoto vier preenchido e diferente**. Remoto vazio **nunca** apaga o local. Sem
isso, o preenchimento manual (§ Fase 1) seria desfeito no ciclo seguinte, e a
varredura diária apagaria em massa a referência dos 14 boards que hoje estão sem
a coluna. Mantém a mescla que já preserva os vínculos de outros workspaces do
Monday, que a varredura não conhece.

`text_mm5etnn2` está vazio em **14 dos 62** itens (os criados mais
recentemente). Será corrigido no Monday e deve virar padrão preenchido.

---

## 3. Board Report de Horas (18422834169)

**Deixa de ser destino de escrita.** Criar item ali dispara uma automação que
copia o apontamento para o board do projeto, mas a automação **não atualiza nem
exclui** o que já foi criado — edição e exclusão no DeskClock ficariam órfãs no
board de destino. Por isso o registro passa a ser escrito **direto no board do
projeto, no grupo Activities**.

O board permanece na config com outro papel: é o **único lugar onde os dois
conjuntos de rótulos convivem**, e serve para semear os catálogos numa leitura
só.

| Coluna | Id | Vira |
|---|---|---|
| Activity Type | `color_mm3ar35x` | Categorias (35 rótulos) |
| Project Stage | `color_mm3ajr7s` | opções do campo Project Stage (18) |
| Non Billable reason | `dropdown_mm3a3dgg` | opções do novo campo (8) |
| Report Type | `color_mm3ajdce` | opções do novo campo (5) |

---

## 4. Board do projeto — destino das horas

### Grupo

`Report Type` **não é coluna no board do projeto** — é o que a automação lê para
rotear. Escrevendo direto, ele decide o `group_id`:

`Activity → Activities` · `Meeting → Meetings` · `Expense → Expenses` ·
`Risk → Risks` · `Lesson Learned → Lessons Learned`

> **Nunca resolver grupo por id.** `group_mm19wbff` é **"Timeline"** nos boards
> de cliente e **"Activities"** nos internos. Nos de cliente, Activities é
> `group_mm2e2g9j` (estável em Casas Bahia, Tenda, Tembo, Sigma). A resolução é
> **por título**, como `resolveBoardActivitiesColumns` já faz.

**Boards internos têm um grupo só (`Activities`).** Em projeto interno,
`Activity` é o único Report Type possível; qualquer outro recusa com mensagem, e
nunca em silêncio.

### Colunas (template estável nos 7 boards verificados)

| Papel | Report (18422834169) | Board do projeto |
|---|---|---|
| Owner | `multiple_person_mm3a7ccw` | **`person`** |
| Projects | `board_relation_mm3asj9a` | — (o board já é a referência) |
| Report Type | `color_mm3ajdce` | — (vira `group_id`) |
| Activity Type | `color_mm3ar35x` | `color_mm19csp3` |
| Project Stage | `color_mm3ajr7s` | `color_mm19zrwg` |
| Non Billable reason | `dropdown_mm3a3dgg` | `dropdown_mm33hnk6` |
| Billing type | `color_mm3ag2fd` | `color_mm33rxm7` |
| Reported Hours | `numeric_mm3azxd8` | `numeric_mm33gj5m` |
| Start / End Date | `date_mm3aptcm` / `date_mm3a1ype` | `date_mm33tthy` / `date_mm33zcmr` |
| Status | `color_mm3atj87` | `status` |
| Description | `text_mm3gj0s5` | `text_mm33hhn7` |

`board_relation_mm19xxv7` ("Portfolio") já vem preenchido pelo template — não é
nosso.

As duas datas são `show_time_by_default: true` também nos boards de projeto, mas
o envio manda **só o dia** — a hora descrevia o instante exato de início e fim,
precisão que o board não usa. O dia é o local (§6.6): sem hora junto, não há o
que o Monday reconverta.

### Rótulos por tipo de projeto

Verificado nos 4 boards internos e em vários de cliente: os conjuntos são
**idênticos dentro de cada tipo**.

**Activity Type — cliente (21):** `Technical Feasibility Analysis`,
`Requirements Analysis`, `Internal Activity`, `Meeting`, `Setup`, `N-A`,
`Project Management`, `Status Report`, `Documentation`, `Development`,
`Client Activity`, `Estimation`, `QA`, `Test Plan`, `Migration`,
`Client Communication`, `Adjustments`, `Meeting notes / follow-up`, `Go-live`,
`Internal Status`, `Training`

**Activity Type — interno (14):** `Daily / Sync semanal`,
`1:1 / PDI / Avaliações`, `Reuniões internas`, `Onboarding / Apoio colabs`,
`Apoio SC / Estimativa pré-venda`, `N-A`, `Treinamentos / Cursos`, `Eventos`,
`Doc. processos da área`, `Problemas técnicos`, `Projeto interno`,
`Comunicação interna`, `Aprovação de horas (GP)`, `Gestão Operacional (GP)`

Só `N-A` é comum aos dois. Os 119 itens do board de Report confirmam a separação
na prática: item de cliente nunca usa rótulo interno, e vice-versa.

> **Rótulo fora da coluna daquele board faz o Monday recusar a mutation
> inteira.** Por isso filtrar as categorias por escopo deixa de ser higiene de
> dado e vira requisito de funcionamento.

> **Nunca escrever por id de opção — só por rótulo.** Os ids divergem entre
> boards: `Development` é 9 no Report e 11 no Casas Bahia; `Migration`, 11 vs
> 101; `Estimation`, 17 vs 14; `Go-live` (Project Stage), 17 vs 18. O
> `buildActivityColumnValues` já grava por rótulo.

### Project Stage — só em projeto de cliente

**Decisão:** o campo entra no payload **apenas para projeto de cliente**.

Nos boards internos a coluna existe (`color_mm19zrwg`) mas se chama
**"Project Phase"** e tem 4 rótulos úteis (`Closure`, `Validation`, `Training`,
`Go-live`), sem uso real. Mandar um rótulo de cliente ali derrubaria a escrita
inteira. Hoje o campo já não sai por acidente — `resolveBoardActivitiesColumns`
procura por `"project stage"` / `"etapa do projeto"` e "Project Phase" não bate.
**Não adicionar `"project phase"` à lista de títulos.**

Os 18 rótulos do Report batem exatamente com os dos boards de cliente, então o
catálogo semeado no §3 é válido sem tradução.

### Non Billable reason

Entra em `dropdown_mm33hnk6` no formato `{"labels":[...]}`, apenas quando
`billable === false` **e** o board tem a coluna.

> **Ausente em 3 dos 4 boards internos** (Implantação, CX e PMO Atividades
> Internas; só Tech a tem). A omissão tem de vir da **ausência da coluna no
> schema**, não de uma regra de negócio "interno não manda motivo" — assim
> continua correto se alguém adicionar a coluna depois.

Precedência do valor: **tarefa > default da categoria > omite**.

Usada em apenas 4 dos 119 itens hoje, todas non-billable, 3 delas em projeto de
cliente. Responde "por que essa hora de cliente não foi faturada".

### Billable

- **Projeto interno ⇒ sempre non-billable** (0 exceções em 119 itens).
- **Projeto de cliente ⇒ billable por padrão, com override** — e é o override
  que exige o motivo.

---

## 5. Onde guardar escopo e motivo padrão

> **Descartado na execução da Fase 2.** A tabela
> `monday_category_settings(category_id, scope, default_non_billable_reason)`
> **não existe**. Não há default de motivo por categoria: o motivo é escolha da
> atividade, e a mesma categoria rende horas faturáveis e não faturáveis. Sem
> essa coluna sobrava só o `scope`, que é derivável dos mapeamentos —
> `billableByActivityType` o calcula no import, em memória.
>
> O precedente do `calendar_tracked_meetings` continua valendo para quando
> aparecer algo de fato por-categoria: a identidade do Monday fica confinada numa
> tabela lateral e `Category` permanece agnóstica.

---

## 6. Fases

### Fase 0 — Config e descoberta ✅

**Sai:** `mondayActiveWorkspaceId`, pasta de clientes, pasta de internos, board
interno, `mondayDefaults.ts` (+ teste), `filterProjectBoards.ts`,
`selectImportBoards.ts`.

**Entra:** `mondayPortfolioBoardId`, `mondayReportBoardId` (defaults acima).

**Fica:** `mondayApiKey`, `mondayUserId`, chaves de auto-sync.

`isMondayReady` passa a exigir apiKey + os dois board ids + ao menos um projeto
mapeado no workspace ativo.

Arquivos: `IMondayConfigPort.ts`, `appConfig.ts`, `ConfigContext.tsx`,
`isMondayReady.ts`, `MondayWorkspaceSection.tsx`, `MondayConnectModal.tsx`.

### Fase 1 — Projetos vindos do Portfólio ✅

`importMondayProjects` lê os itens do Portfólio em vez de varrer pastas, com a
regra de escopo e o merge do §2. Com `projectBoardId`, resolve
`activitiesGroupId` + `columnIds` pelo schema.

**UI:** o card de Projetos ganha campo editável de "ID do quadro" por projeto
sem referência, **sem obrigatoriedade**, com o motivo visível ("sem quadro —
horas não sobem").

Arquivos: `importMondayProjects.ts` (+ teste), `mondayProjectsSyncPolicy.ts`,
`useMondayProjectsTracker.ts`, `MondayProjectsImport.tsx`,
`normalizeProjectMappings.ts`.

### Fase 2 — Catálogos do board de Report ✅

`importMondayFieldCatalogs` lê `18422834169` numa consulta só (tabela do §3), com
`parseDropdownLabels` para o formato do `dropdown`. O escopo de cada Activity
Type sai do cruzamento dos mapeamentos (`billableByActivityType`), sem consulta
nova. **Sem migration** — ver §5.

`mondayProjectStageFieldId` ganhou dois irmãos (`mondayReportTypeFieldId`,
`mondayNonBillableReasonFieldId`) e o card virou genérico (`MondayCatalogField`).
Os catálogos ficam em `mondayFieldCatalogs`.

Arquivos: `importMondayFieldCatalogs.ts` (+ teste), `importMondayCategories.ts`
(+ teste), `mondayConfig.ts`, `appConfig.ts`, `ConfigContext.tsx`,
`IMondayConfigPort.ts`, `MondayCatalogsImport.tsx`, `MondayCatalogField.tsx`,
`MondayCategoriesImport.tsx`, `MondayImportSection.tsx`.

### Fase 3 — Envio direto no board do projeto ✅

Report Type → `group_id` (sem valor na tarefa, `Activity`); Non Billable reason;
Project Stage só em cliente.

**O motivo é obrigatório em projeto de cliente marcado como non-billable**, e
dispensado em projeto interno. É validação de envio, não default de cadastro: a
tarefa sem motivo nessa situação não sobe, com mensagem — omitir em silêncio
mandaria ao board uma hora não faturada sem justificativa, que é exatamente o
que a coluna existe para impedir.

Arquivos: `buildActivityColumnValues.ts` (+ teste), `MondayTaskSender.ts`,
`resolveBoardActivitiesColumns.ts` (+ testes), `listItemsOwnedBy.ts` (+ testes),
`normalizeProjectMappings.ts` (+ teste), `importMondayProjects.ts`,
`mondayConfig.ts`, `IMondayApi.ts`, `MondayClient.ts` (+ testes).

### Fase 4 — Import de Timeline e gerenciador

Praticamente intactos: continuam operando sobre N boards de projeto. Só troca a
**origem da lista de boards** (Portfólio, não mapeamento manual).
`listItemsOwnedBy`, `monday_activity_items`, `monday_imported_items` e a
detecção de item na lixeira são preservados.

### Fase 5 — Limpeza de UI e docs

`MondayIntegrationSection` perde workspace/pastas/board interno e ganha os dois
ids e o card de catálogos. `MondayProjectStageField` vira genérico para os três
campos. Atualizar §5.7 do CLAUDE.md.

**Ordem de PRs:** 0 → 1 → 2 → 3 → 4/5. Cada uma buildável, com testes de domínio
escritos antes da implementação (§7.1).

---

## 7. Payloads de referência (validados com o usuário)

Escritos contra o board de Report; ao migrar para o board do projeto, traduzir
as colunas pela tabela do §4 e remover `board_relation_mm3asj9a` e
`color_mm3ajdce`.

**Cliente, billable**

```json
{
  "color_mm3ajdce": "Activity",
  "board_relation_mm3asj9a": { "item_ids": ["12509291231"] },
  "multiple_person_mm3a7ccw": { "personsAndTeams": [{ "id": 21181483, "kind": "person" }] },
  "color_mm3ar35x": "Internal Activity",
  "color_mm3ajr7s": "Discovery & Design - Zendesk",
  "date_mm3aptcm": { "date": "2026-08-05" },
  "date_mm3a1ype": { "date": "2026-08-05" },
  "numeric_mm3azxd8": "1",
  "color_mm3atj87": "Completed",
  "color_mm3ag2fd": "Billable"
}
```

**Cliente, non-billable** — acrescenta
`"dropdown_mm3a3dgg": { "labels": ["Internal Planning"] }` e troca
`color_mm3ag2fd` para `"Non Billable"`.

**Interno** — sem `color_mm3ajr7s`, sem `dropdown_mm3a3dgg`,
`color_mm3ag2fd: "Non Billable"`, Activity Type do conjunto interno
(ex.: `"Apoio SC / Estimativa pré-venda"`).
