# Provedor de IA (LLM)

> Escrito em 2026-08-27, com a feature (`b2d0923`..`8212c19`).
> Contrato comum a todas as integrações: `docs-internal/integracoes/README.md`.
> A tela que consome o resultado está em `docs-internal/telas/tarefas.md`.

## O que a integração faz — e o que ela não faz

Ela produz **um parágrafo** descrevendo o último dia com trabalho registrado, exibido na tela de
Tarefas. É a única coisa que faz.

**É leitura, sem escrita externa.** Não há envio de horas, não há import, não há nada gravado no
provedor. O que sai do app é o que `buildWorkdayPrompt` monta: **nome da tarefa, nome do projeto e
duração**, das tarefas concluídas daquele dia, já agrupadas. Não vão categoria, faturamento,
cliente, horário, id, nem o nome do usuário. O que volta é texto, guardado em `AppConfig` e
mostrado na tela — nenhuma tarefa é criada ou alterada a partir dele.

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
| `max_completion_tokens: 220` | o teto que o parágrafo cabe, no nome que a família gpt-5 aceita |
| `temperature: 0.2` | o Groq aceita, e resumo de registro de trabalho não quer criatividade |

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

## Rate limits: por que o cache existe

O free tier do Groq, para `openai/gpt-oss-20b`, dá **30 requisições por minuto, 1000 por dia, 8 mil
tokens por minuto e 200 mil por dia**. O teto que aperta é o de **1000 por dia**, e ele é generoso
para *uma* geração diária e apertado para uma geração *por abertura de tela* — Tarefas é a tela que
mais se abre no app.

> **Os modelos Llama saíram do free tier do Groq.** Tutorial ou exemplo mais antigo vai sugerir
> `llama-3.x-…` como o modelo grátis do Groq; hoje eles são pagos, e a chave do free tier responde
> erro. É por isso que o preset sugere `openai/gpt-oss-20b` e não um Llama. Quem for "corrigir" o
> sugerido a partir de um tutorial está desfazendo isto.

**O cache resolve os dois tetos ao mesmo tempo**: uma geração por dia resumido e por workspace usa
uma requisição por dia, contra as 1000, e alguns milhares de tokens contra os 200 mil. E é a
**cadência**, não só o volume, que ele protege — 30 RPM cai fácil com a tela reabrindo em sequência.

**Erro não repete sozinho** (`useDailySummary`): a mensagem fica e o ciclo para. Insistir contra um
429 é o pior que um cliente de rate limit pode fazer; quem decide tentar de novo é o usuário, pelo
botão de recarregar.

O **teste de conexão** da tela é o `GET /models`, e não uma completação: é a requisição mais barata
que existe — **não consome tokens** — e ainda preenche o seletor de modelos.

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
> O resumo não escreve em lugar nenhum e não roda em ciclo. Ele **descreve as tarefas que o usuário
> está vendo na tela**, na mesma tela em que elas estão, e por isso segue o **workspace ativo** —
> como a própria lista de Entradas logo abaixo dele. Dar-lhe workspace próprio produziria o
> parágrafo de um escopo ao lado da lista de outro: o texto falaria de tarefas que não estão à
> vista, e ninguém teria como perceber que são de outro lugar.
>
> **Não "conserte" isto.** Se aparecer código escopado por config aqui, é regressão, não
> completude. A Agenda tem uma exceção parecida, pelo mesmo tipo de motivo (§ em
> `docs-internal/integracoes/google.md`).

O workspace ativo entra em **três** lugares, e nos três é o mesmo: na busca do último dia
(`getLastDayWithTasks`), na busca das tarefas daquele dia, e na **chave do cache**. Sem ele na
chave, trocar de workspace mostraria o texto do outro.

---

## As chaves em `AppConfig`

`src/shared/types/appConfig.ts`.

| Chave | O que guarda |
|---|---|
| `llmProviderId` | preset escolhido no catálogo, ou `"custom"`. Serve para a tela saber qual linha destacar e de onde tirar os `extras` — **quem manda na chamada são as três chaves seguintes** |
| `llmBaseUrl` | destino. Texto livre; vazio cai no `baseUrl` do preset |
| `llmApiKey` | a chave. Está em `SECRET_CONFIG_KEYS` (`src/shared/constants/secretConfigKeys.ts`), então **é expurgada do backup no Drive** |
| `llmModel` | id do modelo. Texto livre — o seletor sugere, o campo decide |
| `llmSummaryDate` | **o dia resumido, não o dia em que se gerou** |
| `llmSummaryText` | o parágrafo |
| `llmSummaryWorkspaceId` | o workspace a que o parágrafo se refere |

> **`llmSummaryDate` é o dia resumido, e a distinção é a feature inteira do cache.** Numa
> segunda-feira, o último dia com trabalho continua sendo a sexta: o resumo dela **não envelheceu**, e
> regenerá-lo gastaria uma das 1000 requisições diárias para produzir o mesmo parágrafo. Fosse a data
> de geração, o cache expiraria à meia-noite e o app pediria de novo, todo dia, o resumo do mesmo dia.
> É também `llmSummaryDate` que o título da seção escreve.
>
> A validação está em `isDailySummaryCacheValid`
> (`src/presentation/hooks/dailySummary.ts`): dia igual, workspace igual e **texto não vazio** — o
> vazio nunca vale, ou uma falha antiga passaria por cache.

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
