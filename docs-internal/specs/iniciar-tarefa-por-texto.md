# Iniciar tarefa por texto (IA)

- **Date:** 2026-11-27
- **Author:** Eduardo Meira
- **Project classification:** Current (React 19, TS 5, Vitest 4, CLAUDE.md + CI presentes)
- **Coverage tier:** A em `src/domain/usecases/llm/taskText/` e no handler da API local; B nos
  hooks; C na UI (sem teste de renderização — padrão do repo, `docs-internal/testes.md`)
- **Branch:** `feat/llm-task-start`, a partir da `develop` local (`4b0655b`)
- **Estado do ritual SDD:** Brainstorm ✅ · Plan ✅ · Execute em curso — ver **Andamento** no fim

> Ordem de trabalho escrita para ser lida por um agente sem acesso à conversa que a originou.

---

## Problem & constraints

Iniciar uma tarefa completa (nome, projeto, categoria, billable e os campos personalizados) custa
vários cliques. A feature aceita um **texto curto** — `Alinhamento sprint P=tech int C=dev nb
PS=dev` — e devolve a tarefa preenchida numa **prévia** que o usuário confirma.

Acima do input, o app mostra uma **instrução** com os campos que a tarefa pede, cada um com sigla e
exemplo tirado das opções reais:

> Informe Projeto, Categoria, Billable, Project Stage e Non Billable reason. P= Tech interno / C=
> Development NB / B= nb / PS= Development / NBR= Peer technical

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
3. `buildTaskTextPrompt(text, hints)` → texto em `<texto>`; pede JSON `{name, fields:{P,C,…}}`;
   proíbe inventar valor ausente. Sem catálogo, sem exemplos.
4. `parseTaskTextResponse(raw)` → acha o JSON mesmo em texto/cerca de código; inválido →
   `LlmEmptyResponseError`.
5. `resolveTaskFields(fields, catalog)` → casamento local normalizado (sem acento/caixa):
   exato > prefixo de palavras > `fuzzyMatch`; resultado por campo resolvido / ambíguo (≤5
   candidatos) / não encontrado. Categoria no recorte do projeto. Billable: `b`, `billable`,
   `nb`, `non-billable`, `sim`, `não`; ausente → `default_billable` da categoria. `select` → id da
   opção; `text`/`multiline` → cru; `checkbox` → sim/não.
6. `interpretTaskText({ llm, text, hints, catalog })` → siglas: local; senão provedor se conectado;
   sem provedor e sem siglas, o texto vira o nome. Devolve `TaskTextInterpretation` (nome, ids,
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

Funções puras (siglas, colisão de sigla, ambíguo, recorte por projeto, billable padrão × explícito,
JSON sujo, delimitador); use case com `ILlmApi` falso (local não chama; erro propaga); handler da
API; paridade de ops no Rust; `useRetroactiveForm.applyInterpretation`.

## Rollback

Aditiva, sem migration: reverter a branch. A chave `retroactiveEntryMode` que sobrar no banco é
inofensiva.

## Andamento

- 2026-11-27 — Brainstorm e Plan aprovados; branch criada; impact analysis LOW em
  `useOmniboxDraft`, `OmniboxIdle`, `PopupOverlayContent`, `PopupOverlayApp`,
  `useRetroactiveForm`, `RetroactiveEntryForm`.
