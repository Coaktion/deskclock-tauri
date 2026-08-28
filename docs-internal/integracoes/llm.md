# Provedor de IA (LLM)

> Escrito em 2026-08-27, com a feature (`b2d0923`..`8212c19`).
> **Revisado em 2026-08-28**, quando o resumo saiu da tela de Tarefas, passou a resumir vários
> dias, trocou o cache de config por tabela e passou a ser disparado pela busca do Histórico.
> Contrato comum a todas as integrações: `docs-internal/integracoes/README.md`.
> A tela que consome o resultado está em `docs-internal/telas/historico.md`.

## O que a integração faz — e o que ela não faz

Ela produz **um parágrafo por dia de trabalho**, exibido na tela de **Histórico**, sobre os dias
que a busca ali trouxe. É a única coisa que faz.

**A busca do Histórico dispara a geração**, e é a tabela `day_summaries` que sustenta isso: o lote
consulta o cache antes do provedor, então o dia já resumido volta do banco sem custo e só o dia
novo vira requisição. Foi decisão do usuário em 2026-08-28, com o custo na mão.

> **Ela revoga o "nada é gerado sozinho"** que esta seção afirmava desde 2026-08-27. O que aquela
> regra protegia continua valendo em duas travas, e são elas que impedem o disparo automático de
> virar sangria de cota: o **teto de 5 dias** por rodada (§ abaixo) e a chave `workspace|dias` do
> `useDaySummaries`, que faz **cada conjunto de dias rodar uma só vez** — sem ela, o recarregamento
> por `TASKS_CHANGED` (que refaz a busca a cada tarefa salva em qualquer janela) pagaria de novo
> pelos mesmos dias a cada salvamento. Quem for mexer no disparo mexe nas duas.
>
> O resumo automático do **último dia trabalhado na tela de Tarefas** continua removido, e por
> outro motivo: ele rodava na montagem de uma tela que se abre o tempo todo, sem busca nenhuma
> pedindo por ele. Aqui o gatilho é um resultado que o usuário mandou buscar.

**É leitura, sem escrita externa.** Não há envio de horas, não há import, não há nada gravado no
provedor. O que sai do app é o que `buildWorkdayPrompt` monta: **nome da tarefa, nome do projeto e
duração**, das tarefas concluídas daquele dia, já agrupadas. Não vão categoria, faturamento,
cliente, horário, id, nem o nome do usuário. O que volta é texto, guardado na tabela
`day_summaries` e mostrado na tela — nenhuma tarefa é criada ou alterada a partir dele.

**Não é uma integração de sincronização**, e por isso ela não segue metade do roteiro do §9.5 do
`docs-internal/guardrails.md`: não há `ISyncStrategy`, não há entrada em `AUTO_SYNC_INTEGRATIONS`,
não há `<integração>AutoSyncLastFiredDate`. Ela não sincroniza nada; procurar esses ganchos aqui é
procurar o que não deveria existir.

**Não há streaming.** O request leva `stream: false` e a tela espera o parágrafo inteiro. Um
parágrafo de 2 a 4 frases não tem tempo de espera que streaming resolva, e o caminho pelo Rust
(abaixo) devolve JSON de uma vez.

---

## Um adapter só, e um catálogo que é dado

| Camada | Arquivo |
|---|---|
| Porta | `src/domain/integrations/ILlmApi.ts` (`complete`, `listModels`) |
| Porta de config | `src/domain/integrations/ILlmConfigPort.ts` |
| Adapter | `src/infra/integrations/llm/OpenAiCompatClient.ts` |
| Catálogo | `src/infra/integrations/llm/providers.ts` |
| Erros | `src/infra/integrations/llm/errors.ts` |

**Todos os provedores suportados falam a mesma API**: `POST {baseUrl}/chat/completions` com
`Authorization: Bearer`, `GET {baseUrl}/models` para listar. Onze provedores, um adapter — o que
varia entre eles é **URL, chave e modelo**, que são dados do usuário, não código. Por isso
`providers.ts` é uma tabela e não onze classes: provedor novo é uma linha, e quem não estiver na
tabela funciona pelo preset `custom`, que pede só a URL.

**A lista sugere, não restringe.** `llmBaseUrl` e `llmModel` são texto livre e não uniões: um
Ollama noutra porta, um gateway interno, um modelo que apareceu no fim de semana — nada disso
precisa de release do DeskClock.

### Os onze presets

Fonte da verdade: `src/infra/integrations/llm/providers.ts`. A tabela abaixo é cópia, e quando
divergir é o arquivo que está certo.

| id | Rótulo | `baseUrl` | Modelo sugerido | Chave |
|---|---|---|---|---|
| `groq` | Groq | `https://api.groq.com/openai/v1` | `openai/gpt-oss-20b` | obrigatória |
| `openai` | OpenAI | `https://api.openai.com/v1` | `gpt-5-nano` | obrigatória |
| `openrouter` | OpenRouter | `https://openrouter.ai/api/v1` | `openai/gpt-oss-20b` | obrigatória |
| `gemini` | Google Gemini | `https://generativelanguage.googleapis.com/v1beta/openai/` | `gemini-3.7-flash` | obrigatória |
| `anthropic` | Anthropic | `https://api.anthropic.com/v1/` | `claude-haiku-4-5` | obrigatória |
| `deepseek` | DeepSeek | `https://api.deepseek.com` | `deepseek-v4-flash` | obrigatória |
| `mistral` | Mistral | `https://api.mistral.ai/v1` | `ministral-3b-latest` | obrigatória |
| `xai` | xAI | `https://api.x.ai/v1` | `grok-4.6` | obrigatória |
| `ollama` | Ollama (local) | `http://localhost:11434/v1` | — | não |
| `lmstudio` | LM Studio (local) | `http://localhost:1234/v1` | — | não |
| `custom` | Personalizado | — | — | não |

`groq` é o padrão (`DEFAULT_LLM_PROVIDER_ID`) — é o que tem free tier utilizável sem cartão.

> **As três formas de `baseUrl` na tabela não são inconsistência de digitação, e é por isso que
> existe `normalizeBaseUrl`.** Gemini e Anthropic vêm com barra final, o DeepSeek não tem `/v1`.
> Concatenar à mão produziria `//chat/completions`, que nem todo provedor tolera. A normalização
> apara barras à direita e vive exportada para ficar testável.

> **Os locais não pedem chave, e é isso que `isLlmConnected` respeita**
> (`src/presentation/sections/integrations/llm/llmConnection.ts`): "conectado" é ter **destino e
> modelo**, nunca chave. Amarrar o estado à chave deixaria Ollama e LM Studio eternamente "não
> configurados" depois de uma conexão que funcionou.

---

## O subconjunto seguro do request, e os `extras`

O corpo enviado leva só **`model`, `messages` e `stream`**. É o denominador comum: o que *todos*
aceitam.

> **`max_tokens` e `temperature` ficam de fora porque quebram.** A família gpt-5 da OpenAI devolve
> **400** para `max_tokens` — ela só conhece `max_completion_tokens` — e devolve 400 também para
> `temperature` diferente de 1. Como o adapter é um só, um parâmetro que quebra num provedor
> quebraria a integração inteira. O tamanho da resposta se controla pelo **prompt** ("um parágrafo,
> de 2 a 4 frases"), que é instrução e não parâmetro, e por isso funciona em todos.

O que um provedor específico precisa a mais entra pelos **`extras` do preset**, mesclados por cima
do corpo. Eles são **compensação de comportamento do provedor**, não preferência do usuário — por
isso saem sempre do catálogo e nunca da config (`createLlmApi`, em
`src/presentation/contexts/IntegrationsContext.tsx`).

Hoje só o Groq tem `extras`, e cada chave tem motivo:

| Extra | Por quê |
|---|---|
| `reasoning_effort: "low"` e `include_reasoning: false` | `gpt-oss` é modelo de *reasoning*: sem desligar, ele consome o orçamento de saída raciocinando antes de escrever, e ainda vaza o rascunho para dentro do texto |
| `temperature: 0.2` | o Groq aceita, e resumo de registro de trabalho não quer criatividade |

### O teto de saída é da chamada, e só o nome dele é do provedor

**`max_completion_tokens: 220` saiu dos `extras` do Groq em 2026-08-28**, e a distinção que o tirou
de lá é a que não pode se perder: **quanto** cabe é do pedido, **como se chama** é do provedor.

- O número vem da chamada — `complete(messages, { maxOutputTokens })`, em `ILlmApi`. Quem o passa é
  quem sabe o que espera: `WORKDAY_MAX_OUTPUT_TOKENS = 220` mora em `buildWorkdayPrompt.ts`, ao
  lado da regra "um parágrafo, de 2 a 4 frases" que o explica.
- O nome vem do preset — `outputTokensParam`, hoje só no Groq, com `"max_completion_tokens"`.
  **Preset que não declara nome não recebe campo nenhum**, que é o corpo que os outros dez sempre
  tiveram. `max_tokens` continua proibido: a família gpt-5 devolve 400 para ele.

> **Por que isso não é gosto de arquitetura.** No preset, o teto valia para toda chamada que o app
> fizesse. A primeira que precisasse de mais espaço — um JSON, uma lista — voltaria **truncada**, e
> truncada o provedor devolve `finish_reason: "length"`, que o adapter mapeia para
> `LlmEmptyResponseError`: a tela diria "tente novamente" para um erro que não passa nunca. O
> defeito não apareceria no resumo, que continua cabendo em 220 — apareceria na feature seguinte,
> como se fosse dela.
>
> Três testes seguram a volta: o corpo **sem** o campo quando o preset não declara nome, **com** ele
> quando declara e a chamada pede, e o valor da chamada ganhando de um resquício nos `extras`
> (`OpenAiCompatClient.test.ts`). E `providers.test.ts` reprova qualquer preset que volte a
> carregar teto nos `extras` ou que declare `max_tokens`.

---

## Por que a chamada passa pelo Rust

`OpenAiCompatClient` não usa `fetch`. Ele invoca os comandos `post_bearer_json` e
`get_bearer_json` (`src-tauri/src/commands/http.rs`).

> **Dois motivos, e o primeiro é bloqueante.** A **Anthropic bloqueia CORS a partir do browser**:
> pelo `fetch` do webview a chamada nem sai. E, valendo para todos, **a chave não circula no
> processo do webview** — ela vai do `AppConfig` ao comando Rust e daí ao provedor, sem passar por
> `fetch`, sem entrar em aba de rede de webview, sem chance de vazar num log de console.
>
> `post_bearer_json` nasceu aqui (`a2841ef`); `get_bearer_json` já existia para o Zendesk, pelo
> mesmo motivo de CORS.

> **`HttpJsonResponse` passou a devolver `headers`, e a razão é o `retry-after`.** Num 429 ele é a
> **única espera confiável** que o provedor informa; sem os cabeçalhos, o lado TS teria de inventar
> um atraso fixo. Os nomes vêm em minúsculas (`collect_headers`), então a leitura é
> `headers["retry-after"]` sem normalização no TS.

> **O comando devolve status e corpo mesmo fora da faixa 2xx, de propósito.** É o **corpo do erro**
> que distingue credencial inválida de modelo indisponível de limite de requisições, e quem
> classifica isso é o TS — o Rust não sabe nem deve saber.

---

## Os quatro formatos de corpo de erro, e as duas armadilhas

`body.error.message` cru quebra em **três** dos quatro formatos. Daí `extractErrorMessage`, que
tenta as quatro leituras em ordem:

| Provedores | Formato |
|---|---|
| Groq, OpenAI, DeepSeek, Gemini | `{"error":{"message":"…"}}` |
| Anthropic | `{"type":"error","error":{"type":"…","message":"…"}}` |
| Mistral | `{"detail":"Invalid API Key"}` — **não tem `error`** |
| xAI | `{"code":"…","error":"…"}` — **`error` é string**, não objeto |

**Armadilha 1 — o Mistral não usa `error`.** Sem a leitura de `detail`, a mensagem some e sobra
`HTTP 401`.

**Armadilha 2 — chave inválida nem sempre é 401.** **Gemini e xAI respondem 400**, dizendo no texto
que a chave é inválida. Por isso `isCredentialFailure` não olha só o status: num 400, procura `api
key` / `valid key` na mensagem. Quem tratar 401 como o único caminho de autenticação vai mostrar
"falha de conexão" a quem só digitou a chave errada — e a pessoa vai conferir a internet.

O mapeamento final (`toLlmError`) produz cinco erros tipados, em `errors.ts`:

| Erro | Quando | O que a tela diz |
|---|---|---|
| `LlmAuthError` | 401, ou 400 falando de chave | revisar a chave — **o único caso em que ela é a causa** |
| `LlmRateLimitError` | 429 | esperar; com os segundos do `retry-after`, quando o provedor os informa |
| `LlmModelUnavailableError` | 403, 404 | escolher outro modelo |
| `LlmEmptyResponseError` | texto vazio, ou `finish_reason: "length"` | tentar de novo |
| `LlmNetworkError` | falha do `invoke`, 5xx, e o resto | verificar URL e internet |

> **O erro cru nunca chega ao usuário.** `describeLlmError` traduz — o texto dos provedores ora é
> inglês técnico, ora o nome de um campo interno deles.

---

## Rate limits: por que existem o teto de dias e a tabela

O free tier do Groq, para `openai/gpt-oss-20b`, dá **30 requisições por minuto, 1000 por dia, 8 mil
tokens por minuto e 200 mil por dia**.

> **Os modelos Llama saíram do free tier do Groq.** Tutorial ou exemplo mais antigo vai sugerir
> `llama-3.x-…` como o modelo grátis do Groq; hoje eles são pagos, e a chave do free tier responde
> erro. É por isso que o preset sugere `openai/gpt-oss-20b` e não um Llama. Quem for "corrigir" o
> sugerido a partir de um tutorial está desfazendo isto.

**Hoje o teto que aperta é outro: o de 8 mil tokens por minuto.** Foi o que mudou quando o resumo
passou a ser de vários dias — cinco chamadas em sequência num clique só disputam a mesma janela de
minuto, enquanto uma geração por dia nunca chegava perto dela.

**Duas travas seguram isso, e as duas moram no use case de lote**
(`domain/usecases/llm/SummarizeWorkdays.ts`):

- **`MAX_SUMMARY_DAYS = 5`, o teto de dias por geração.** Cada dia custa ~1k tokens entre prompt,
  lista e resposta; cinco chamadas em sequência ficam confortavelmente abaixo dos 8k por minuto, e
  o dobro disso encostaria no limite — fazendo o lote falhar no meio, que é o pior lugar para
  falhar. E cinco dias são uma semana de trabalho: o recorte que alguém de fato quer ler de uma
  vez. Vindo mais dias, entram os **mais recentes**, e o botão avisa isso antes do clique.
- **Sequencial, nunca em paralelo.** Cinco chamadas disparadas juntas gastam a janela do minuto de
  uma vez só e o provedor recusa todas menos as primeiras; em série, elas se espalham pelo tempo
  que cada resposta leva.

**A tabela é o que impede pagar duas vezes pelo mesmo dia.** Antes de chamar o provedor, o lote
consulta `day_summaries` e pula o dia que já tem texto. Um resumo de um dia é fato que não muda — o
dia acabou, e as tarefas dele também —, e é essa economia que torna o teto de 5 suportável **e o
disparo automático viável**: a segunda busca sobre a mesma semana não gasta requisição nenhuma.

**Hoje é a exceção** (`unfinishedDayISO`), e é a trava que impede o cache de mentir. O dia corrente
não é fato encerrado, e o filtro padrão do Histórico é justamente "Hoje": guardá-lo às 9h deixaria
a seção afirmando a manhã pelo resto do dia. Ele se regera a cada rodada — o custo é uma requisição
por visita à tela —, e o texto continua sendo gravado, valendo a partir de amanhã.

**Erro não repete sozinho** (`useDaySummaries`): a mensagem fica e o ciclo para. Insistir contra um
429 é o pior que um cliente de rate limit pode fazer, e é exatamente o risco que o disparo
automático traria se a rodada se repetisse — a chave `workspace|dias` é o que o fecha. Quem decide
tentar de novo é o usuário, pelo botão "Tentar novamente", que só aparece quando há erro ou dia
não gerado.

**E o lote para no primeiro 429.** Os dias que sobraram voltam em `skipped` — "não gerados" —, e
não como o mesmo erro repetido em cada um. Falha de **um** dia, essa sim, não derruba os outros: o
lote devolve, por dia, o que deu certo (`summaries`) e o que falhou (`failed`), no mesmo espírito
do `TaskSendOutcome` (`docs-internal/integracoes/README.md`).

O **teste de conexão** da tela é o `GET /models`, e não uma completação: é a requisição mais barata
que existe — **não consome tokens** — e ainda preenche o seletor de modelos.

---

## A visão de cota no card, e o período que ela não afirma

O card "Provedor de IA" mostra quanto resta da cota, lido dos cabeçalhos que vêm **na resposta da
completação**:

```
x-ratelimit-limit-requests   x-ratelimit-remaining-requests   x-ratelimit-reset-requests
x-ratelimit-limit-tokens     x-ratelimit-remaining-tokens     x-ratelimit-reset-tokens
```

`parseRateLimits` (em `OpenAiCompatClient.ts`) os transforma no `LlmRateLimits` de
`src/shared/types/llm.ts` — seis campos, **todos opcionais** —, que sobe pelo `complete()` (hoje
`{ text, limits? }`), pelo `summarizeWorkday` e pelo lote, que guarda a **última** leitura da
rodada. Cabeçalho ausente, vazio ou não numérico vira
**campo ausente**, nunca `NaN` nem `0`: um zero inventado escreveria "restam 0" para quem tem cota
de sobra. Nem todo provedor manda estes cabeçalhos, e ausente é ausente — a área some do card, sem
"—" nem convite.

> **O `listModels()` não captura cota, e é deliberado.** O `GET /models` não é específico de
> modelo, e os cabeçalhos dele podem descrever outro balde — exibi-los como a cota do modelo
> escolhido seria mentira barata.

> **O período que os cabeçalhos medem muda por provedor, e por isso a tela não o afirma.** No Groq
> `limit-requests` é por **dia** e `limit-tokens` é por **minuto**; na OpenAI `limit-requests` é
> por **minuto**. Os nomes são os mesmos, então escrever "restam 312 de 1000 requisições **hoje**"
> seria falso para metade dos onze presets. O card escreve os números que vieram e o **texto de
> renovação do próprio provedor** (`reset-requests` chega como `2m59.56s`, `7.66s`) — "312 de 1000
> requisições · renova em 2m59s". É correto em todo provedor e não depende de uma tabela nossa de
> janelas, que envelheceria calada. Só os decimais do reset caem na exibição; o valor guardado é o
> texto cru. **Quem for "melhorar" isto acrescentando a janela está reintroduzindo o defeito.**

**A medição é persistida**, em duas chaves de `AppConfig`: `llmLastLimits` (o objeto) e
`llmLastLimitsAt` (o instante). Elas existem porque **a cota só se conhece fazendo uma chamada** —
nenhum dos onze provedores tem endpoint gratuito que a informe, e o teste de conexão não serve
(§ acima). Sem persistir, o card ficaria vazio até a próxima geração, que só acontece com uma
busca no Histórico sobre dia ainda não resumido. Quem grava é o `useDaySummaries`, e só quando
`limits` veio. Não
são segredo — dizem quanto resta de uma cota, não como usá-la —, então ficam fora de
`SECRET_CONFIG_KEYS`.

Como a medição só acontece quando uma busca gera dia novo, **ela quase sempre é uma foto do
passado, e o card diz isso**:
`buildLlmQuotaView` (`src/presentation/sections/integrations/llm/llmQuota.ts`, no molde do
`llmConnection.ts` ao lado) devolve as linhas montadas, o "há 3 dias" e um `stale` que acende
acima de **uma hora** — o balde mais curto que os provedores reportam renova em minutos, então
passada uma hora qualquer número guardado pode estar defasado. "Restam 312" de três dias atrás não
é informação, é engano.

---

## O prompt

`src/domain/usecases/llm/buildWorkdayPrompt.ts`. Função pura: recebe linhas já decididas (nome,
projeto, duração) e devolve as duas mensagens.

> **Os dados vão dentro de `<tarefas>` porque o nome da tarefa é digitado pelo usuário e chega ao
> modelo sem passar por ninguém.** Sem delimitador, uma tarefa chamada "ignore as instruções acima"
> é lida como instrução — é injeção de prompt entrando pelo campo mais banal do app. A tag não é
> garantia; é a trava barata que dá ao modelo onde ver que aquilo é **dado**, e é o mínimo que
> qualquer entrada livre para um LLM exige. Quem acrescentar campo do usuário ao prompt põe dentro
> do delimitador, não fora.

O system prompt proíbe inventar tarefa, projeto, cliente, ferramenta ou resultado que não esteja na
lista; manda agrupar semelhantes; e proíbe bullets, markdown e emoji — a UI é texto corrido, sentence
case, sem emoji.

> **As tarefas são agrupadas antes de ir** (`SummarizeWorkday`, via `groupTasks`). O dia real tem
> doze linhas "Reunião" de quinze minutos: o modelo receberia a mesma frase doze vezes, gastaria
> contexto nisso e ainda leria a repetição como ênfase. Uma linha com a soma diz o mesmo, por menos.

> **Sem dia com registro, ou com um dia só de tarefas sem nome, o use case devolve `null` sem
> chamar o provedor.** A requisição é paga e não teria o que resumir.

> **O erro do `ILlmApi` propaga pelo use case, e não é descuido.** Chave inválida, rate limit e rede
> fora pedem mensagens diferentes, e quem sabe distingui-las — e o que dizer ao usuário — é a camada
> de apresentação. `domain/` não tem opinião sobre texto de tela.

---

## Escopo de workspace: a exceção declarada

**Não existe `llmDeskclockWorkspaceId`, e a ausência é deliberada.** O contrato comum
(`docs-internal/integracoes/README.md`) e o §9.5 item 7 do `docs-internal/guardrails.md` mandam cada
integração escolher o seu workspace e rodar independente do que está aberto na tela. **Aqui não se
aplica.**

> A regra existe porque as outras integrações **escrevem em sistema externo**: sem escopo próprio, o
> board do cliente recebia as horas do trabalho pessoal, e o import nascia em qualquer workspace que
> estivesse aberto na hora do ciclo — defeitos silenciosos, num job de fundo.
>
> O resumo não escreve em sistema externo e não roda em ciclo. Ele **descreve as tarefas que o
> usuário está vendo na tela**, na mesma tela em que elas estão, e por isso segue o **workspace
> ativo** — como a própria lista de entradas logo abaixo dele. Dar-lhe workspace próprio produziria o
> parágrafo de um escopo ao lado da lista de outro: o texto falaria de tarefas que não estão à
> vista, e ninguém teria como perceber que são de outro lugar.
>
> **Não "conserte" isto.** Se aparecer código escopado por config aqui, é regressão, não
> completude. A Agenda tem uma exceção parecida, pelo mesmo tipo de motivo (§ em
> `docs-internal/integracoes/google.md`).

O workspace ativo entra em **três** lugares, e nos três é o mesmo: na busca das tarefas de cada
dia, na gravação do resumo e na consulta da tabela. Ele é parte da **chave natural** de
`day_summaries` — sem ele ali, trocar de workspace mostraria o texto do outro.

---

## As chaves em `AppConfig`

`src/shared/types/appConfig.ts`.

| Chave | O que guarda |
|---|---|
| `llmProviderId` | preset escolhido no catálogo, ou `"custom"`. Serve para a tela saber qual linha destacar e de onde tirar os `extras` — **quem manda na chamada são as três chaves seguintes** |
| `llmBaseUrl` | destino. Texto livre; vazio cai no `baseUrl` do preset |
| `llmApiKey` | a chave. Está em `SECRET_CONFIG_KEYS` (`src/shared/constants/secretConfigKeys.ts`), então **é expurgada do backup no Drive** |
| `llmModel` | id do modelo. Texto livre — o seletor sugere, o campo decide |
| `llmLastLimits` | a última cota lida dos cabeçalhos (`LlmRateLimits`); **não é segredo** |
| `llmLastLimitsAt` | o instante daquela leitura — é o que deixa o card dizer que ela envelheceu |

> **O texto do resumo não mora mais aqui.** As chaves `llmSummaryDate`, `llmSummaryText` e
> `llmSummaryWorkspaceId` foram removidas em 2026-08-28, junto com `isDailySummaryCacheValid`: a
> config guarda **um** de cada chave, e o Histórico resume vários dias de uma busca — cada dia novo
> sobrescreveria o anterior, e o mesmo dia seria regerado toda vez que aparecesse noutra busca.
> Hoje o lugar é a tabela `day_summaries` (migration 018, § `docs-internal/modelo-de-dados.md`),
> cuja chave natural é o par dia+workspace. **As duas chaves de cota ficam** — elas são de cota,
> não de resumo.

**Desconectar limpa a chave e o modelo, os dois.** Só a chave deixaria o card afirmando conexão,
porque a chave não entra na conta do que é "conectado" (§ acima).

---

## A tela de conexão

Card "Provedor de IA" na tela de Integrações (`src/presentation/sections/integrations/llm/`) e modal
`src/presentation/modals/LlmConnectModal.tsx`, no padrão do Clockify: **testa antes de gravar**.

| Campo | Tipo |
|---|---|
| Provedor | `Select` com os onze presets; escolher um semeia URL e modelo sugerido |
| URL base | text input — editável mesmo com preset escolhido |
| Chave de API | input password com botão de mostrar/ocultar. Some nos provedores que não pedem chave |
| Testar conexão | botão → `GET /models`; sem sucesso não há o que gravar |
| Modelos disponíveis | `Select` preenchido pelo teste |
| Modelo | text input livre, ao lado do seletor |

> **O seletor de modelos vem acompanhado de um campo livre porque a lista do provedor chega crua e
> longa**, misturando transcrição, TTS e embeddings com os de chat. Ela sugere, não restringe.
> `pickDefaultModel` só pré-seleciona o sugerido do preset quando ele **está de fato na lista**, e o
> escolhido pelo usuário sempre ganha — ele pode ter digitado um id que a lista não traz, e
> reescrevê-lo apagaria a escolha.

> **O logo é desenho nosso** (`LlmLogo.tsx`), não a marca de um dos onze provedores: vestir a placa
> com uma delas diria que o app fala só com aquela.
