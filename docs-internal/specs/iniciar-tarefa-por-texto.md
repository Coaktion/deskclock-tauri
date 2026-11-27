# Iniciar tarefa por texto (IA)

- **Date:** 2026-11-27
- **Author:** Eduardo Meira
- **Project classification:** Current (React 19, TS 5, Vitest 4, CLAUDE.md + CI presentes)
- **Coverage tier:** A em `src/domain/usecases/llm/taskText/` e no handler da API local; B nos
  hooks; C na UI (sem teste de renderização — padrão do repo, `docs-internal/testes.md`)
- **Branch:** `feat/llm-task-start`, a partir da `develop` local (`4b0655b`)
- **Estado do ritual SDD:** Brainstorm ✅ · Plan ✅ · Execute ✅ · Review ✅ (2026-11-27) — falta a
  verificação manual do usuário; ver **Andamento** no fim

> Ordem de trabalho escrita para ser lida por um agente sem acesso à conversa que a originou.

---

## Problem & constraints

Iniciar uma tarefa completa (nome, projeto, categoria, billable e os campos personalizados) custa
vários cliques. A feature aceita um **texto curto** — `Alinhamento sprint P=tech int C=dev nb
PS=dev` — e devolve a tarefa preenchida numa **prévia** que o usuário confirma.

Acima do input, o app mostra uma **instrução** com os campos que a tarefa pede, na ordem em que se
digitam, e um exemplo tirado das opções reais:

> Nome, Projeto, Categoria, Billable, Project Stage, Non Billable reason, nessa ordem e por vírgula;
> dá para pular campo. Ex.: Revisão, CX Atividades Internas, 1:1 / PDI / Avaliações, nb, Closure,
> Peer Technical Support

(Revisão de 2026-11-27, decisão do usuário: a instrução anuncia a **ordem**, não as siglas. As
siglas seguem aceitas; a primeira versão mostrava `Informe Projeto, … P= Tech interno / C= …`.)

Restrições que decidiram o desenho:

- **Privacidade (decisão do usuário, 2026-11-27 — opção A).** O provedor recebe **só o texto
  digitado e, de cada campo, rótulo, sigla e tipo**. Nenhuma lista de projetos, categorias ou
  opções sai do app — projetos são nomes de clientes. Os **exemplos da instrução são locais**: são
  valores do catálogo e não vão no prompt. O casamento com o catálogo é **local**.
- **Project Stage e Non Billable reason são campos personalizados `select`**, apontados por
  `mondayProjectStageFieldId` / `mondayNonBillableReasonFieldId`, e a tarefa grava o **id da
  opção** (`docs-internal/integracoes/monday.md`). Não são catálogos à parte. **A instrução lista
  todos os campos ativos sempre, sem regra de cliente/interno** (decisão do usuário: "o usuário sabe
  quando preencher; a IA preenche o que recebeu").
- O request ao provedor só leva `model`, `messages`, `stream` (`llm.md`). JSON é pedido pelo
  **prompt**, e a leitura é tolerante. O texto do usuário vai **dentro de delimitador** (injeção).
- Catálogo do **workspace ativo**; categoria recortada pelo projeto (`resolveCategoriesForProject`);
  billable vem do `default_billable` da categoria salvo indicação explícita no texto (§6.2).
- `startTask` não faz nada com tarefa ativa (§6.1). O início vale o **instante do primeiro envio**
  do texto, para a espera da IA não comer segundos.
- Paridade UI ↔ API/MCP: a ação existe também na API local e no MCP.

## Alternatives considered

| Decisão | Descartada | Motivo |
|---|---|---|
| Casamento | B — catálogos vão ao provedor | lista de clientes enviada a terceiro a cada uso |
| Casamento | C — híbrido, só candidatos empatados vão | contrato difícil de explicar, vaza pouco mas vaza |
| IA devolvendo ids | — | exigiria B; id inventado passaria calado |
| Só parser de siglas, sem IA | — | não atende texto livre; ficou como **atalho** (texto com siglas não chama o provedor) |
| Instrução anunciando as siglas | — | decisão do usuário (revisão): prefere digitar por posição, com vírgula; siglas seguem aceitas, sem anúncio |
| MCP que interpreta **e** inicia | — | o chamador do MCP já é uma IA; pularia a confirmação. A tool só interpreta |
| Project Stage só p/ cliente na instrução | — | decisão do usuário: instrução sempre completa |

Decisões menores tomadas pelas recomendações (o usuário aprovou o plano sem objetar):
**(a)** no omnibox, Enter **e** Play analisam quando há texto; campo vazio inicia na hora.
**(b)** a IA **não** lê horário/duração no lançamento manual — os horários ficam nos campos da aba.
**(c)** siglas **derivadas** das iniciais do rótulo, sem edição. **(d)** UI com os primitivos
existentes (sem wireframe); verificação visual pelo usuário no app.

## Plan

### 1. Domínio — `src/domain/usecases/llm/taskText/`

1. `buildTaskFieldHints(customFields, catalog)` → campos fixos `P` Projeto, `C` Categoria,
   `B` Billable, e cada custom field **ativo** com sigla das iniciais do rótulo, deduplicada
   ("Project Stage" → `PS`, "Non Billable reason" → `NBR`); exemplo local da primeira opção/catálogo.
2. `parseSiglaText(text, hints)` → com siglas (`X=`), separa sem provedor; nome = o que vem antes da
   primeira sigla.
   - *(revisão)* `parseOrderedText(text, hints, catalog)` → `Nome, Projeto, Categoria, …` por
     vírgula/ponto e vírgula, na ordem dos hints; cada trecho vai ao primeiro campo, a partir do
     último preenchido, que o reconhece (pular campo é permitido; só exato/prefixo de palavras, sem
     fuzzy; `b`/`nb`/sim/não têm prioridade para Billable e checkbox); trecho que nada reconhece
     fica no campo da vez (vira "não encontrado") — nunca salta para um campo de texto adiante,
     que descartaria os trechos seguintes; nenhum trecho
     reconhecido → `null` (texto livre). Nome de projeto com vírgula se parte: digitar um pedaço
     funciona, o nome inteiro pede `P=`.
3. `buildTaskTextPrompt(text, hints)` → texto em `<texto>`; pede JSON `{name, fields:{P,C,…}}`;
   proíbe inventar valor ausente. Sem catálogo, sem exemplos.
4. `parseTaskTextResponse(raw)` → acha o JSON mesmo em texto/cerca de código; inválido →
   `LlmEmptyResponseError`.
5. `resolveTaskFields(fields, catalog)` → casamento local normalizado (sem acento/caixa):
   exato > prefixo de palavras > `fuzzyMatch`; resultado por campo resolvido / ambíguo (≤5
   candidatos) / não encontrado. Categoria no recorte do projeto. Billable: `b`, `billable`,
   `nb`, `non-billable`, `sim`, `não`; ausente → `default_billable` da categoria. `select` → id da
   opção; `text`/`multiline` → cru; `checkbox` → sim/não.
6. `interpretTaskText({ llm, text, hints, catalog })` → siglas: local; senão **por posição**
   (`parseOrderedText`), também local; senão provedor se conectado; sem provedor, o texto vira o
   nome. Devolve `TaskTextInterpretation` (nome, ids,
   billable, customValues, ambíguos com candidatos, não encontrados, `source: "local" | "llm"`).

### 2. Apresentação compartilhada

7. Hook `useTaskTextInterpretation()` — catálogo do workspace ativo, custom fields ativos,
   `createLlmApi`; estados parado/analisando/prévia/erro (`describeLlmError`); `submit`, `choose`,
   `reset`; guarda o instante do primeiro envio.
8. `TaskTextHint` (instrução) e `TaskTextPreview` (chips; ambíguo destacado abre candidatos; não
   encontrado = chip vazio; Enter confirma). Só primitivos de `components/ui`.

### 3. Superfícies

9. **Omnibox**: instrução sempre acima do input; Enter (lista fechada/vazia) ou Play com texto →
   analisa e abre a prévia; segundo Enter inicia com o `startTime` do primeiro envio. Vazio inicia
   na hora. Toca `useOmniboxDraft` e `OmniboxIdle`.
10. **Popup**: botão "Iniciar com IA" (`Sparkles`) ao lado de "Nova tarefa" → `TaskTextSheet` que
    cobre o popup (padrão do `RunningTaskEditSheet`). `PopupOverlayApp` ganha `IntegrationsProvider`.
11. **Lançamento manual**: abas Formulário | IA (`SegmentedControl`) no `RetroactiveEntryForm`; aba
    memorizada em `retroactiveEntryMode` (`"form" | "ai"`, não secreta). A aba IA troca os campos
    do *quê* por instrução + input + prévia, mantém os horários do mesmo `useRetroactiveForm`;
    confirmar → `applyInterpretation` (novo) + `handleAdd`.

### 4. API local e MCP

12. `taskText.fields` (`GET /tasks/text/fields`) e `taskText.interpret` (`POST /tasks/text/interpret`,
    `{ text, workspaceId? }`, devolve a interpretação com nomes resolvidos). **Nenhuma inicia
    tarefa** — o chamador usa `start_task`/`log_past_task`/`plan_task`. TS: handler
    `localApi/handlers/taskText.ts` + `dispatch`; Rust: rotas, handlers, openapi, `LONG_OPS` para
    `interpret`; MCP: `ops.rs`, tools `get_task_text_fields` / `interpret_task_text`,
    `mcp-ops.json`.

### 5. Docs

13. `llm.md` (nova seção; contrato de privacidade: "texto digitado e nomes de campos, nunca o
    catálogo"; revisar "é a única coisa que faz"), `telas/tarefas.md`,
    `telas/lancamento-retroativo.md`, `telas/overlays.md`, `specs/api-local-nucleo.md`,
    `specs/mcp.md`.

### Execução

Fases: 1 domínio (itens 1–6) · 2 hook/componentes + omnibox (7–9) · 3 popup (10) · 4 lançamento
manual (11) · 5 API/MCP (12) · 6 docs (13). Cada fase por sub-agente; a sessão principal revisa e
commita. Gate final: tsc, test, lint, format:check, `pnpm visual`, verificação visual 2 modos × 4
acentos, `@code-quality-reviewer`.

### Testes

Funções puras (siglas, leitura por posição, colisão de sigla, ambíguo, recorte por projeto, billable
padrão × explícito, JSON sujo, delimitador); use case com `ILlmApi` falso (local não chama; erro
propaga); handler da API; paridade de ops no Rust; `useRetroactiveForm.applyInterpretation`.

## Rollback

Aditiva, sem migration: reverter a branch. A chave `retroactiveEntryMode` que sobrar no banco é
inofensiva.

## Andamento

- 2026-11-27 — Brainstorm e Plan aprovados; branch criada; impact analysis LOW em
  `useOmniboxDraft`, `OmniboxIdle`, `PopupOverlayContent`, `PopupOverlayApp`,
  `useRetroactiveForm`, `RetroactiveEntryForm`.
- 2026-11-27 — `e0a55ac` Fase 1: domínio em `src/domain/usecases/llm/taskText/` (hints e siglas,
  atalho de siglas, prompt, leitura tolerante, casamento local, `interpretTaskText`).
- 2026-11-27 — `f9ac333` Fase 2: `useTaskTextInterpretation`, `TaskTextHint`, `TaskTextPreview` e
  o omnibox com instrução, análise, prévia e início com o instante do primeiro envio.
- 2026-11-27 — `d4d51d5` Fase 5: `taskText.fields` / `taskText.interpret` na API local
  (`GET /tasks/text/fields`, `POST /tasks/text/interpret`) e as tools `get_task_text_fields` /
  `interpret_task_text` no MCP (nenhuma inicia tarefa). As duas rotas em `build_router` (impacto
  HIGH por ser a raiz do roteador) entraram com aprovação do usuário.
- 2026-11-27 — `5992fba` Fase 3: "Iniciar com IA" no popup (`TaskTextSheet`).
- 2026-11-27 — `ebabe72` Fase 4: abas Formulário | IA no Lançamento Manual, aba memorizada em
  `retroactiveEntryMode`.
- 2026-11-27 — `b9cdf9a` Fase 6: docs (`integracoes/llm.md`, `telas/tarefas.md`,
  `telas/overlays.md`, `telas/lancamento-retroativo.md`, esta spec) e o rename
  `omniboxTextEntry` → `taskTextEntry` (`TaskTextInterpreter`).
- 2026-11-27 — `4e05616` + `97ed3fe` correções do review: `buildTaskTextContext` (um só montador de
  catálogo e instrução para hook e API, com `activeCustomFields`), teste do hook
  `useTaskTextInterpretation` e dois casos de borda. Segunda rodada do `@code-quality-reviewer`:
  **PASS**. Os hashes anteriores a `f9ac333` mudaram num rebase local (reword de assunto > 72).

- 2026-11-27 — Verificação manual, parte 1 (API/MCP de dev, 27421): `get_task_text_fields` e
  `interpret_task_text` verificados por JSON-RPC — siglas (local), texto livre com o Groq
  (`openai/gpt-oss-20b`), só nome, ambíguo (`P=cx`, 4 candidatos), não encontrado, texto vazio e
  workspace inexistente; `GET /tasks/text/fields` e `POST /tasks/text/interpret` 200. Achado: o
  provedor erra o texto por vírgula (`Nome, Projeto, Categoria, Stage`) por não conhecer o
  catálogo, e o usuário pediu **leitura por posição** com vírgula — nome primeiro, campos na
  ordem, podendo pular. Entrou como atalho local (`parseOrderedText`), a instrução passou a
  anunciar a ordem em vez das siglas, e o review (2 rodadas, **PASS**) tirou o salto até campo de
  texto que descartava trechos. Verificado ao vivo: o exemplo do usuário
  (`Migration Service - Northwind JSM, Pinecrest Travel Group, Development, Migration`) resolve
  tudo no app.

**Desvios do plano** (registrados para o Review):

- **`describeTaskTextError` embrulha o `describeLlmError`** em vez de editá-lo: o impacto dele deu
  **HIGH** (modal de conexão e resumo do Histórico). O caso novo — resposta ilegível,
  `TaskTextResponseError` — vive só no wrapper.
- **Chips escolhidos à mão no omnibox pulam a análise**: o texto vira só o nome, senão a IA
  sobrescreveria a escolha do usuário.
- **Resultado só com nome inicia direto**, sem prévia (`isNameOnly`) — não há o que conferir.
- **No popup, texto vazio não faz nada** (primária desabilitada): a tarefa sem nome é pelo "Nova
  tarefa", ao lado.
- **Impacto CRITICAL em `AppConfig` aceito**: a mudança é aditiva (uma chave nova com padrão), e
  quem já lê a config não muda de comportamento.

**Dívida registrada** (fora do escopo, apontada no review):

- O cabeçalho/rodapé dos painéis do popup está na 4ª cópia (`h-[37px]`/`h-[38px]` em
  `TaskTextSheet`, `RunningTaskEditSheet`, `PlannedTaskEditSheet`, `CompletedTaskEditSheet`) —
  candidato a primitivo `SheetHeader`/`SheetFooter`.
- `useRetroactiveForm` foi de 227 para 278 linhas; `PopupOverlayContent` de 693 para 733.
- `taskTextEntry.ts` é função pura morando em `presentation/hooks/`.
- A aba IA do Lançamento Manual perde o foco quando um pré-preenchimento troca para a aba
  Formulário.

**Pendente — próximo passo:**

- Verificação visual pelo usuário: `pnpm tauri dev` nos 2 modos × 4 acentos (omnibox, popup,
  Lançamento Manual) — agora com a instrução por posição.
- Ida e volta real na UI (texto → prévia → início); pela API/MCP já foi feita.
- Aprovado, merge local `--no-ff` em develop e main. Sem push.
