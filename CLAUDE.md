# CLAUDE.md — DeskClock

**Este arquivo é índice, não manual.** Ele carrega em todo request: só entra aqui o que vale
para *qualquer* tarefa. O resto está mapeado na §5, com o gatilho de leitura ao lado.

> **Era 180KB até 2026-08-10** — ~50k tokens gastos antes de você digitar a primeira palavra, e
> 69% disso era consulta por tela carregada como se fosse regra. Nada se perdeu: o conteúdo foi
> redistribuído (§5), e o histórico está em `git log`. **Ao acrescentar algo, pergunte primeiro
> se vale para toda tarefa.** Se não vale, o lugar é um dos documentos da §5.

---

## 1. O produto

**DeskClock** — app desktop (Tauri) de registro de horas. A premissa é que **o app se adapta ao
modo de trabalho do usuário, não o contrário**.

Princípios que decidem discussão de UX:

- Cadastro com o mínimo de cliques.
- Edição sempre em modal.
- **Exclusão sem confirmação** — a ação é imediata. As duas exceções (workspace, atividade do
  Monday) exigem uma escolha, não um "tem certeza?".
- Overlay arrastável com posição persistida.
- Lançamento retroativo é tela dedicada, em sequência, sem modal.

## 2. Stack

Tauri · React + TypeScript · Tailwind CSS · Lucide · SQLite (plugin Tauri) · Clean Architecture ·
ESLint + Prettier · **Vitest** (só unit) · builds para Windows, Ubuntu e Arch.

`pnpm` para instalar — nunca `npm`.

## 3. Arquitetura e regras de dependência

```
src/
├── domain/         entidades, interfaces de repositório (ports), use cases
├── infra/          implementações: database/, integrations/, system/
├── presentation/   pages/, components/ (+ components/ui/), overlays/, modals/, hooks/, contexts/
├── shared/         types, utils, constants — puros
└── tests/          espelha src/
```

- `domain/` não importa de `infra/` nem `presentation/`, e **nada** de `@tauri-apps/*` ou `react`.
- `infra/` implementa interface declarada em `domain/`, e não importa de `presentation/`.
- `presentation/` consome `domain/` via hook/contexto e **nunca instancia classe de `infra/`** —
  se aparecer `new GoogleSheetsTaskSender(...)` num componente, pare e injete via Provider.
- `shared/` é util puro. Se é regra de negócio, é `domain/`.

**Limites de tamanho** (orientação, não regra): componente > 350 linhas, hook > 150, use case >
100, `useEffect` > 8 ou `useState` > 15 por componente ⇒ refatorar **antes** da próxima feature.

O detalhamento — checagem anti-DRY, roteiro para integração nova, porta estreita de config — está
em `docs-internal/guardrails.md`. Leia antes de criar abstração ou integração.

## 4. Fluxo de trabalho

**Ciclo:** planejar → aprovar → testar (TDD onde a camada permite) → implementar → validar que
compila → `pnpm lint` → commit semântico → PR.

- `main` exige PR, sempre buildável. Branches: `feat/`, `fix/`, `refactor/`.
- Commits: `<tipo>(<escopo>): <assunto>` — `feat`, `fix`, `refactor`, `test`, `docs`, `chore`.
- Antes de criar branch, conferir mergeadas pendentes: `git branch --merged main`.
- **Verificação visual não é opcional** em mudança de aparência: `pnpm tauri dev` nos **2 modos ×
  4 acentos**.
- **`pnpm visual`** compara o componente renderizado em Chromium com o wireframe do design, medida
  a medida e pixel a pixel (`.visual/`). Fora do `pnpm test` de propósito — diff de pixel depende
  de fonte e de browser, e num gate obrigatório viraria a falha que todo mundo aprende a ignorar.
  Rode quando estiver mexendo em aparência; ele mede o que o `screenGeometry` não alcança (altura
  real da linha, largura que a coluna do grid recebe, quebra de texto).

## 5. Onde está o resto — e quando ler

**Documentação interna mora em `docs-internal/`, nunca em `docs/`.** O `docs/` é a pasta que o
GitHub Pages publica (`main:/docs` → `coaktion.github.io/deskclock-tauri`), e o repositório é
**público**: arquivo colocado ali vai ao ar no merge, sem ninguém decidir isso. Ele tem três
arquivos e só deve ter três — `index.html` (o manual do usuário), `favicon.svg` e `favicon.png`.
Já esteve com os specs do Monday dentro, board ids da Aktie e tudo, servidos em HTML na internet
aberta. Doc novo de arquitetura, tela, integração ou spec: `docs-internal/`.

| Leia quando… | Documento |
|---|---|
| a tarefa toca **aparência** (componente, classe, cor, tamanho, raio, modal, chip) | **skill `design-system`** — invoque, não leia à mão |
| vai mexer numa **tela** específica | `docs-internal/telas/<tela>.md` — `tarefas`, `planejamento`, `historico`, `dados`, `configuracoes`, `lancamento-retroativo`, `exportacao`, `overlays`, `primeira-execucao` |
| vai mexer em **integração** | `docs-internal/integracoes/README.md` (contrato comum) + `google.md`, `clockify.md`, `monday.md`, `llm.md` |
| vai mexer em **entidade, repositório ou migration** | `docs-internal/modelo-de-dados.md` |
| a dúvida é de **comportamento** (billable, agrupamento, autocomplete, data de referência, workspace, recorrência) | `docs-internal/regras-de-negocio.md` |
| vai **escrever teste** | `docs-internal/testes.md` |
| vai criar **abstração ou integração nova** | `docs-internal/guardrails.md` |
| a rodada de **fidelidade do design** está em curso | `docs-internal/specs/design-system-fidelity.md` — conferir se a mudança visual não é uma etapa de lá |
| vai mexer no **backup do banco no Drive** | `docs-internal/specs/backup-google-drive.md` — execução em fases, uma por sessão |
| quer saber **por que** algo é assim | `docs-internal/historico-de-decisoes.md` e `git log` |

### 5.1 De-para das seções antigas

Há **340 citações de `§`** em comentários de código e nos próprios documentos — `(§6.7)`, `§8.4`,
`§5.7`. Renumerar todas seria mexer em centenas de linhas para não mudar comportamento nenhum, e
cada erro de renumeração aponta para o lugar errado calado. Então a numeração antiga continua
valendo e resolve aqui:

| Citação | Onde está agora |
|---|---|
| §1, §2, §3 | este arquivo, §1–§3 |
| §4, §4.x | `docs-internal/modelo-de-dados.md` |
| §5.1 | `docs-internal/telas/overlays.md` |
| §5.2 · §5.3 · §5.4 | `docs-internal/telas/tarefas.md` · `planejamento.md` · `historico.md` |
| §5.5 · §5.6 | `docs-internal/telas/exportacao.md` · `dados.md` |
| §5.7 | `docs-internal/telas/configuracoes.md` e, na parte de integração, `docs-internal/integracoes/` |
| §5.8 · §5.9 | `docs-internal/telas/lancamento-retroativo.md` · `primeira-execucao.md` |
| §6, §6.x | `docs-internal/regras-de-negocio.md` |
| §7.1–§7.5 | este arquivo, §4 |
| §7.6 | `docs-internal/testes.md` |
| §8.1–§8.3 | este arquivo, §7 |
| §8.4 e "Fonte da verdade visual" | **skill `design-system`** |
| §9, §9.x | `docs-internal/guardrails.md` (§9.2 e os limites de tamanho também resumidos na §3 daqui) |

## 6. O que o teste garante — não repita em prosa

Regra que uma trava executa não precisa de parágrafo: o teste falha com arquivo, linha e número; a
prosa depende de alguém ter lido. **Antes de escrever uma regra nova aqui, veja se ela não cabe
numa destas.**

| Trava | O que reprova |
|---|---|
| `designTokens.test.ts` | token semântico derrubado; raiz de 16px ou `--spacing` reancorados; valor dos degraus reancorados; cor de projeto fora do sRGB, abaixo de 3:1 em qualquer um dos dois modos, ou a menos de 0,09 de outra |
| `fontSizes.test.ts` | `text-[13px]` — tamanho fora da escala de 10 degraus |
| `fontWeights.test.ts` | peso fora de 400/500/600 |
| `meaningColors.test.ts` | cor crua do Tailwind em cromo (`bg-gray-800`, `text-emerald-500`) |
| `componentPrimitives.test.ts` | `<button>` com caixa própria em vez de `Button`/`IconButton`; campo cru fora de `components/ui/` |
| `inputAutocomplete.test.ts` | `<input>` sem `autoComplete="off"` |
| `screenGeometry.test.tsx` | geometria do componente divergente do spec extraído do design (`docs-internal/design-spec/`) |

Os dois últimos travam por **baseline que só encolhe** e falham nos dois sentidos: descer o número
sem atualizar a lista deixa folga onde a próxima regressão se esconde.

## 7. Convenções de código

**Nomes:** componente `PascalCase.tsx` · hook `useAlgo.ts` · entidade/type `PascalCase` · função e
variável `camelCase` · constante global `UPPER_SNAKE_CASE` · teste `*.test.ts(x)` espelhando a origem.

**Componentes:** funcionais, props em `interface` dedicada. Modal em `presentation/modals/`,
overlay em `presentation/overlays/`. Sem class component.

**Estado:** `useState`/`useReducer` para UI; global (tarefa em execução, config) via Context;
persistente sempre por repositório.

**Estilização:** Tailwind, sem CSS modules nem styled-components. Token semântico, nunca valor
literal — o detalhe está na skill `design-system`.

### Os três contratos de teclado

São de acerto fácil e de erro invisível: quebrados, funcionam em algumas telas e não em outras, e
só se descobre qual tentando.

1. **ESC fecha todo modal.** Quem usa a casca `Modal` ganha de graça. Fora dela é
   `useEscapeToClose(onClose)` **mais** `data-modal-open` no elemento de topo — um hook, nunca um
   `addEventListener` copiado, senão o mesmo ESC esconde a janela do app. Exceção: `SetupModal`,
   que não tem para onde fechar.
2. **Enter em qualquer campo submete**, via `useSubmitOnEnter(onSubmit)` **no container** — nunca
   um `onKeyDown` por campo (`keydown` borbulha, então um handler cobre até o campo que ainda não
   existe). Os containers **não** viram `<form>`: `<button>` sem `type="button"` dentro de form
   vira submit, e são ~15 telas cheias de toggle onde isso passaria batido.
3. **Quem consome a tecla avisa com `preventDefault`, e o container ignora o que já foi
   consumido.** É o mesmo contrato para ESC e Enter, e é o que faz a lista aberta selecionar a
   opção sem submeter junto.

Escapes do Enter, nesta ordem: `onEnter` no campo · `data-no-submit` no bloco · opção `disabled`
do hook. Em `<textarea>`, Enter quebra linha e **Ctrl/Cmd+Enter** submete. Onde ele
deliberadamente **não** submete: modal que opera sobre **seleção** em lote (importar da Agenda,
importar do Monday, enviar tarefas) e painel com duas ações igualmente primárias.

## 8. Como trabalhar aqui

1. **Um componente por conversa.** Escopo pequeno é verificável.
2. **Ambiguidade pausa o trabalho.** Conflito entre design e código existente: pare e pergunte,
   não adivinhe.
3. **Mudança fora do escopo é rejeitada.** Não "melhore" o que não foi pedido — registre a
   observação na entrega e siga.
4. **Documento que aponta para arquivo inexistente é defeito.** Já aconteceu duas vezes aqui (seis
   artefatos de design system que nunca existiram; uma seção afirmando que o `@testing-library/react`
   não estava configurado quando estava) e as duas travaram trabalho. Encontrou: pare e avise.
5. **Comentário só onde o código é difícil** — o comentário diz *por que*, nunca *o que*.

**Tom da UI:** português do Brasil, sentence case, sem emoji. Tempo em `HH:MM:SS`, duração
compacta `1h30`/`45m`. Botão com verbo no infinitivo. Mensagem curta, nunca paternalista.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **deskclock-tauri** (7772 symbols, 18272 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/deskclock-tauri/context` | Codebase overview, check index freshness |
| `gitnexus://repo/deskclock-tauri/clusters` | All functional areas |
| `gitnexus://repo/deskclock-tauri/processes` | All execution flows |
| `gitnexus://repo/deskclock-tauri/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
