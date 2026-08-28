# Planejar a semana com um prompt — plano de execução

> **Este documento é o handoff.** Escrito em 2026-08-28, antes de qualquer linha de código.
> Quem retoma lê a §8 primeiro.
>
> Branch: `claude/weekly-planning-prompt-wjvwgu`, saída de **`feat/groq-resumo-diario`** — não de
> `main`. Ela depende do adapter de LLM, do catálogo de provedores e do modal de conexão, que só
> existem lá.
>
> Leituras obrigatórias antes de mexer: `docs-internal/integracoes/llm.md` (o adapter, os erros, os
> limites de cota), `docs-internal/telas/planejamento.md` (a tela que ganha a entrada) e a §6.4 e
> §6.7 de `docs-internal/regras-de-negocio.md`.

---

## 1. O que se está construindo

O usuário descreve a semana em texto livre — *"segunda e quarta tem alinhamento às 9h; terça e
quinta, o relatório do cliente X; sexta, revisar PRs"* — e o app propõe as **tarefas planejadas**
correspondentes, na semana que está na tela. **Nada é gravado sem confirmação:** o modelo propõe,
o usuário revisa linha a linha e clica em criar.

O que isto **não** é: não é planejamento automático (o app não decide sozinho o que você deve
fazer), não é estimativa de horas, não é replanejamento do que já existe. Ele traduz uma frase em
linhas de `planned_tasks` — nada mais.

## 2. Decisões tomadas — não reabrir sem motivo novo

Todas do usuário, em 2026-08-28.

| Decisão | Escolha | Por quê |
|---|---|---|
| Onde se escreve o prompt | **Modal**, aberto por botão no header da semana | É o molde dos outros três imports (Agenda, Monday, Zendesk): gerar → revisar seleção → criar. A coluna do formulário tem 256 px e recolhe; um segundo formulário ali disputaria espaço com o que já existe. |
| O que o modelo pode propor | `specific_date` e `recurring` — **`period` fica de fora** | "Toda segunda" é frase que se diz; "do dia 3 ao dia 7, com início e fim" não é. `period` seria o tipo mais fácil de o modelo escolher errado e o mais caro de conferir na revisão. |
| Contexto que vai junto | Catálogo de **projetos e categorias** do workspace + as **planejadas que a semana já tem** | Sem o catálogo toda linha nasce sem projeto, ou com um projeto inventado. Sem o que já está planejado, o pedido não pode ser incremental e a reunião de segunda é proposta pela segunda vez. |
| Histórico recente como contexto | **Fora** | É o item mais caro em tokens e o de menor retorno: ele melhoraria a redação do nome, que o usuário edita em dois segundos na revisão. |
| Quem dispara | **Só o usuário**, pelo botão | Ao contrário do resumo do Histórico, que a busca dispara, aqui não há cache que torne a segunda rodada grátis — cada geração é uma requisição paga, e um plano não é fato que se possa guardar. |
| Cache de resultado | **Não existe** | Um resumo de dia encerrado é fato imutável; um plano é rascunho que se joga fora ao fechar o modal. Tabela aqui guardaria lixo com data. |
| Faturamento da linha | Quem decide é a **categoria resolvida**, não o modelo | §6.2: escolher categoria preenche `billable` com `category.default_billable`. O `faturavel` que o modelo devolveu só vale quando nenhuma categoria casou. |
| Projeto/categoria que não casam | Viram **`null`** | §6.4: o app não cria projeto nem categoria automaticamente, e não é um LLM que vai abrir essa exceção. A linha nasce sem projeto e o usuário escolhe na revisão. |

### 2.1 Três coisas que parecem descuido e são decisão

- **Não existe `llmPlanningWorkspaceId`.** Vale aqui, sem alteração, a exceção já declarada em
  `docs-internal/integracoes/llm.md` (§"Escopo de workspace"): a integração de LLM não escreve em
  sistema externo e segue o **workspace ativo**. As planejadas nascem onde a tela está — dar-lhe
  workspace próprio criaria tarefas num escopo que a semana na tela não mostra.
- **Não existe tabela nova, nem migration.** As linhas criadas são `planned_tasks` comuns; o
  rascunho vive em estado de React e morre com o modal.
- **`response_format: {"type":"json_object"}` não é enviado.** Pelo mesmo motivo de `max_tokens` e
  `temperature` (§"O subconjunto seguro do request" em `llm.md`): o adapter é um só, e um parâmetro
  que quebra num provedor quebra a integração inteira. Quem garante o formato é o **prompt**, e
  quem tolera o desvio é o **parser** (§5). Quem for "melhorar" isto acrescentando o parâmetro
  precisa antes conferir os onze presets — inclusive Ollama e LM Studio, onde ele nem tem esse nome.

## 3. O bloqueio: 220 tokens de saída

O preset do Groq traz `max_completion_tokens: 220` em `extras`
(`src/infra/integrations/llm/providers.ts`) — o teto que o parágrafo do resumo cabe. **Um plano de
semana em JSON não cabe nele**, e o modo como ele não cabe é o pior possível: a resposta vem
truncada com `finish_reason: "length"`, que o adapter mapeia para `LlmEmptyResponseError` — a tela
diria "tentar novamente" para um erro que nunca vai passar.

Por isso a **Fase 0 vem antes de tudo** e é ela que tira o teto de dentro do preset.

O teto vira **parâmetro da chamada**, não constante do provedor. Duas peças:

- `ILlmApi.complete(messages, options?)`, com `options.maxOutputTokens?: number` — vocabulário
  genérico, que é o que `domain/` pode dizer.
- `LlmProviderPreset.outputTokensParam?: string` — o nome que **aquele provedor** aceita. Groq:
  `"max_completion_tokens"`. Os outros dez continuam sem declarar nada, e por isso continuam sem
  receber campo nenhum, que é exatamente o comportamento de hoje.

O adapter só escreve o campo quando **os dois** existem. `max_tokens` continua não sendo enviado
nunca — a família gpt-5 devolve 400 para ele, e isso não mudou.

A constante 220 não some: ela muda de lugar e passa a morar ao lado do prompt que a justifica
(`WORKDAY_MAX_OUTPUT_TOKENS`, em `buildWorkdayPrompt.ts`), porque é a regra "um parágrafo, de 2 a 4
frases" que a explica — não o Groq.

> **`reasoning_effort: "low"` e `include_reasoning: false` ficam.** Eles não limitam tamanho, eles
> impedem o `gpt-oss` de gastar o orçamento raciocinando e de vazar o rascunho no texto. Num pedido
> que espera JSON, rascunho vazado é resposta ilegível.

## 4. O prompt

Arquivo novo: `src/domain/usecases/llm/buildWeekPlanPrompt.ts`. Função **pura**, no molde do
`buildWorkdayPrompt` ao lado: recebe linhas já decididas e devolve as duas mensagens.

Entrada:

```ts
interface WeekPlanPromptInput {
  todayISO: string;
  /** Os cinco dias úteis da semana navegada, com o nome do dia. */
  weekDays: { dateISO: string; weekday: string }[];
  projectNames: string[];
  categoryNames: string[];
  /** O que a semana já tem, para o pedido poder ser incremental. */
  existing: { name: string; when: string }[];
  /** O texto do usuário, cru. */
  request: string;
}
```

O `user` leva **cinco blocos delimitados** — `<hoje>`, `<semana>`, `<projetos>`, `<categorias>`,
`<ja-planejado>` e `<pedido>`:

> **Os quatro primeiros são dados escritos pelo usuário** — nome de projeto, nome de categoria,
> nome de tarefa já planejada — e chegam ao modelo sem passar por ninguém. Vale aqui, sem
> atenuação, o que `llm.md` diz do resumo: sem delimitador, um projeto chamado "ignore as
> instruções acima" é lido como instrução. **O `<pedido>` também é delimitado**, e por outro
> motivo: ele é instrução legítima, mas o modelo precisa de onde ver que ele **acabou** — sem a
> tag de fechamento, o texto do usuário e as regras do sistema viram um borrão só.

O `system` fixa: o papel; o JSON exato (§5); que só existem os dias listados; que projeto e
categoria saem **do catálogo ou de lugar nenhum**; que não se repete o que está em
`<ja-planejado>`; que nome de tarefa é curto, em português do Brasil, sentence case, sem emoji
(o tom da UI, §CLAUDE.md); que hora só entra se o pedido a mencionar; e que a resposta é **só o
JSON**, sem cerca de markdown e sem texto em volta.

> **As chaves do JSON são em português.** O prompt inteiro é pt-BR e o exemplo também: pedir a um
> modelo pequeno que escreva prosa numa língua e chaves noutra é uma tradução a mais para ele
> errar. Se na prática o modelo se mostrar mais firme com chaves em inglês, a troca é de uma linha
> no prompt e de uma no parser — mas é troca com medição, não com palpite.

## 5. O contrato do JSON, e o parser que não confia nele

Arquivo novo: `src/domain/usecases/llm/parseWeekPlanDraft.ts`. Função **pura**.

```json
{
  "tarefas": [
    { "nome": "Alinhamento semanal", "projeto": "Aktie", "categoria": "Reunião",
      "faturavel": true, "dias": [1, 3], "inicio": "09:00", "fim": "09:30" },
    { "nome": "Relatório do cliente X", "projeto": "Aktie", "dia": "2026-09-01" }
  ]
}
```

`dia` **ou** `dias`, nunca os dois: `dia` é `specific_date`, `dias` é `recurring` na escala do
`Date` (0=Dom…6=Sáb — **não reindexar**, § `telas/planejamento.md`).

O parser é a segunda trava, e ele parte do princípio de que a resposta vem torta:

| Desvio | O que o parser faz |
|---|---|
| Resposta em cerca ```` ```json ```` | apara a cerca |
| Prosa antes ou depois do JSON | extrai o primeiro objeto balanceado |
| Array na raiz, sem `{"tarefas": …}` | aceita |
| Item sem `nome`, ou com nome só de espaços | descarta **o item**, não o plano |
| `dia` fora da semana, ou em sábado/domingo | descarta o item |
| `dias` com 0 ou 6 | apara os dois; sobrando lista vazia, descarta o item |
| `dia` **e** `dias` juntos | `dia` ganha |
| `inicio`/`fim` fora de `HH:MM` | omite o campo; `fim` sem `inicio` é descartado |
| Mais de `MAX_PLAN_TASKS` (20) itens | corta no vigésimo |
| Nada extraível | devolve lista vazia — é a resposta ilegível (§6) |

> **O descarte é na origem, e é a mesma lição do import da Agenda** (§ `telas/planejamento.md`): o
> evento de sábado escondido só na renderização continuava selecionado, contado no botão e
> importado do mesmo jeito. Item que não cabe na semana não entra na lista de propostas.

> **O descarte é silencioso.** O usuário nunca soube que aquele item existia — anunciar "3
> propostas foram descartadas" é ruído sobre algo que ele não pediu e não pode conferir. O parser
> devolve a contagem (`discarded`) porque o **teste** precisa dela, não a tela.

## 6. O use case

Arquivo novo: `src/domain/usecases/llm/PlanWeek.ts`.

```ts
planWeek(deps: { llm: ILlmApi }, options: PlanWeekOptions): Promise<PlanWeekOutcome>
```

Uma requisição, não um lote — o oposto do `SummarizeWorkdays`, e por isso sem teto de dias, sem
`skipped` e sem parada no 429. O que ele faz, em ordem: monta o prompt (§4) → `complete` com
`maxOutputTokens` folgado (~1200) → parseia (§5) → resolve nome de projeto e de categoria contra os
catálogos → devolve `{ drafts, limits, discarded }`.

- **A resolução de nomes reusa `findByNameCaseInsensitive`** (`src/shared/utils/calendarMetadata.ts`),
  que o import da Agenda já usa para a mesma coisa. Terceira grafia de casamento por nome é
  exatamente o que a checagem anti-DRY do `guardrails.md` existe para impedir.
- **A categoria manda no `billable`** quando casou (§2, §6.2).
- **`drafts` vazio é a resposta ilegível**, e é assim que ela sobe — sem classe de erro nova. Erro
  de provedor é de `infra/` e `domain/` não pode importá-lo; e "o modelo respondeu, mas não com um
  plano" não é falha de transporte. Quem escreve a frase na tela é a apresentação, como sempre.
- **O erro do `ILlmApi` propaga**, sem tradução: chave inválida, cota e rede fora pedem mensagens
  diferentes, e quem as sabe é `describeLlmError`, na apresentação.

## 7. Fases

Ordem obrigatória: 0 → 1 → 2 → 3. A 4 acompanha cada uma.

### Fase 0 · O teto de saída sai do preset (§3)

- `ILlmApi.complete(messages, options?: { maxOutputTokens?: number })`.
- `LlmProviderPreset.outputTokensParam?: string`; Groq declara `"max_completion_tokens"` e **perde**
  o `max_completion_tokens` dos `extras`.
- `OpenAiCompatClient` recebe `outputTokensParam` na construção (por `createLlmApi`, junto dos
  `extras`) e escreve o campo só com os dois presentes.
- `WORKDAY_MAX_OUTPUT_TOKENS = 220` passa a morar em `buildWorkdayPrompt.ts`; `summarizeWorkday` o
  passa na chamada.
- **Nada muda no corpo enviado hoje** — é refatoração de igual para igual, e os testes existentes de
  `OpenAiCompatClient` são a prova.

### Fase 1 · `domain/`: prompt, parser, use case (§4, §5, §6)

Três arquivos novos, todos puros ou com uma dependência só. É a fase que dá para fazer inteira em
TDD, e é onde mora a maior parte do risco.

### Fase 2 · A criação

`src/domain/usecases/plannedTasks/ImportWeekPlan.ts`, no espelho de `ImportCalendarEvents`: recebe
as linhas já revisadas, chama `createPlannedTask` uma a uma e devolve as criadas **na ordem das
entradas**. Emite `PLANNED_TASKS_CHANGED` quem chama, como os outros imports.

### Fase 3 · A tela

- `src/presentation/modals/PlanWeekModal.tsx` — casca `Modal` (ESC de graça), dois passos no mesmo
  modal: **pedido** (`Textarea` + exemplos + "Gerar") e **revisão** (lista com seleção, editor por
  linha, rodapé "Criar N tarefas").
- As partes vão para `src/presentation/sections/planning/` — o `ImportCalendarModal` tem 848 linhas
  e é o exemplo do que não repetir; o limite de 350 da §3 do CLAUDE.md vale aqui.
- `src/presentation/hooks/useWeekPlan.ts` — estados `idle → generating → review → creating`, chama
  `planWeek`, traduz erro com `describeLlmError` e **grava `llmLastLimits`/`llmLastLimitsAt`**
  quando a chamada devolveu cota, pelo mesmo motivo do `useDaySummaries`: a cota só se conhece
  fazendo a chamada, e o card de Integrações não tem outra fonte.
- Editor por linha: os autocompletes de projeto e categoria já existentes, com o recorte
  `categoryOptionsFor` vindo de **um** `useProjectCategoryMap` por tela (§6.4 — um hook por linha
  viraria dezenas de consultas).
- **Enter não submete**: é modal que opera sobre seleção, como os outros três imports (§7 do
  CLAUDE.md). No `Textarea`, **Ctrl/Cmd+Enter** gera.
- Entrada: botão no `PageHeader` da `WeekPlanningView`, ao lado da pílula "Semana atual". **Ele só
  aparece com provedor conectado** (`isLlmConnected`), como a seção de resumo do Histórico, que
  simplesmente não renderiza sem provedor.

### Fase 4 · Documentação (junto de cada fase, nunca depois)

- `docs-internal/integracoes/llm.md`: **duas frases de lá passam a ser falsas** e precisam ser
  revistas no mesmo commit que as quebra — "Ela produz um parágrafo por dia (…) **É a única coisa
  que faz**" e "**nenhuma tarefa é criada ou alterada** a partir dele". A segunda é a mais
  importante: a integração continua sem escrever em sistema externo, mas passa a produzir **escrita
  local**, e só depois de confirmação humana. Escrever isso é o ponto.
- `docs-internal/telas/planejamento.md`: o botão no header e o modal.
- `docs-internal/historico-de-decisoes.md`: as decisões da §2.

## 8. Testes

Vitest, unit (§`docs-internal/testes.md`). Espelhando a origem, em `src/tests/`.

| Alvo | O que se afirma |
|---|---|
| `buildWeekPlanPrompt` | os seis blocos delimitados; o nome de projeto entra **dentro** da tag; os cinco dias listados com data e dia da semana |
| `parseWeekPlanDraft` | cada linha da tabela da §5 — cerca, prosa em volta, array na raiz, item sem nome, sábado no `dia`, 0 e 6 em `dias`, `dia` e `dias` juntos, hora torta, teto de 20, resposta ilegível |
| `planWeek` | uma única chamada ao `complete`; `maxOutputTokens` repassado; nome que casa vira id e nome que não casa vira `null`; categoria resolvida manda no `billable`; erro do provedor propaga cru; `drafts` vazio na resposta ilegível |
| `importWeekPlan` | cria na ordem das entradas; devolve as criadas |
| `OpenAiCompatClient` | corpo **sem** o campo de teto quando o preset não declara o nome; **com** ele quando declara e a chamada pede; sem ele quando a chamada não pede |

## 9. Riscos, e o que não fazer

- **O `gpt-oss-20b` é modelo pequeno para saída estruturada.** É o risco número um do plano, e a
  Fase 1 é onde ele aparece. Mitigação, em ordem: prompt com exemplo, parser tolerante (§5), e a
  revisão humana — que existe **por isso**, e não só por educação. Se ainda assim ele falhar de
  forma sistemática, o caminho é o preset sugerir outro modelo, nunca afrouxar a revisão.
- **Não transformar isto em disparo automático.** O resumo do Histórico pode ser automático porque
  a tabela `day_summaries` faz a segunda rodada custar zero. Aqui não há cache, e um plano gerado
  sem pedido é cota gasta em algo que ninguém leu.
- **Não deixar a criação acontecer sem revisão**, nem com um "criar tudo" que pule a lista. A linha
  criada vira dado no banco do usuário, e a fonte dela é um modelo que pode ter entendido errado.
- **Não criar projeto ou categoria a partir do nome que o modelo devolveu** (§6.4).

## 10. Estado da execução

| Fase | Estado |
|---|---|
| 0 · teto de saída | **concluída** (2026-08-28) — `ILlmApi.complete(messages, options)`, `outputTokensParam` no preset, `WORKDAY_MAX_OUTPUT_TOKENS` em `buildWorkdayPrompt.ts`; o detalhe está em `docs-internal/integracoes/llm.md` |
| 1 · prompt, parser, use case | **concluída** (2026-08-28) — `buildWeekPlanPrompt`, `parseWeekPlanDraft` e `planWeek`, 45 testes; nada os chama ainda |
| 2 · criação | não iniciada |
| 3 · tela | não iniciada |
| 4 · documentação | não iniciada |
