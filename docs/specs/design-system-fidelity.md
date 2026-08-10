# Rodada de fidelidade e cobertura do design system — handoff

> **Estado: em execução**, na branch `refactor/design-tokens`. Este documento é a **fonte
> única** da rodada: ele substitui o plano e a memória que viviam fora do repositório
> (`~/.claude/plans/design-system-fidelity.md` e a memória `project-design-system-migration`),
> justamente para a rodada poder ser retomada em outra máquina. Leia o CLAUDE.md antes —
> este documento pressupõe o §8.4 inteiro.
>
> Continuação da migração do design system (8 PRs, **todos concluídos**). Fonte do design:
> projeto claude.ai `DeskClock design system review` (`30120d16-f60a-4ca7-bc70-6e56adb8ebc7`),
> 5 documentos, direção de cor **2a** (frio, definido por borda). **Os 5 documentos não estão
> no repositório** — para as etapas que dependem de medida exata do design (fase B, C1, E1),
> é preciso abrir o projeto.

---

## 0. Como esta rodada roda — regras de processo

Este fluxo **contraria vários gates do CLAUDE.md de propósito**, e foi decidido com o usuário
em 2026-08-07:

- **Tudo numa branch só:** `refactor/design-tokens`. Não há branch por PR.
- **Uma sessão = uma etapa.** O usuário dá `/clear` entre elas. Commitar ao fim de cada uma.
- **Sem `@code-quality-reviewer` por entrega** — ele roda **uma vez só**, no fim, sobre tudo.
- **Sem os gates do gitnexus** (`impact`, `detect_changes`) nesta entrega.
- **Quebrar tela intermediária é aceitável.** O merge em `main` só acontece quando todas as
  telas estiverem padronizadas — e `main` exige PR (não aceita push direto).
- **`pnpm lint && pnpm test && pnpm build` ao fim de cada etapa**, mais **verificação manual**
  (`pnpm tauri dev`) nos **2 modos × 4 acentos**. A verificação manual **não é opcional** desde
  o PR 6.5: entregar sem ela empurra para o fim trabalho que é da etapa.
- **Comentário só onde o código é difícil.** Nada de comentário narrando a migração
  ("substitui o X", "absorve o Y") — a referência some quando a migração acaba e o comentário
  fica descrevendo código que não existe.
- **O git é a fonte confiável do estado.** Este documento já ficou defasado uma vez.

---

## 1. O que esta rodada corrige

O usuário reportou que as telas ficaram com layout "aproximado", não pixel perfect. A auditoria
contra os 5 documentos (2026-08-08) encontrou **duas** causas distintas, que pedem tratamentos
diferentes.

### 1.1 Causa raiz — o design mistura rem e px, e a migração escolheu um lado

O documento de fundamentos afirma _"todos os valores são rem sobre a raiz de **14px**"_, mas
especifica em px absoluto: raio 6/8/12, cabeçalho 56, toggle 40×20, barra do KPI 3, ícones
14/16/18, ponto 6, coluna de horário 88, modais 360/460/720/900. Os raios estão escritos como
`0.375/0.5/0.75rem`, que só rendem 6/8/12 na raiz **16**. O documento se contradiz sozinho.

O PR 6.5 resolveu escolhendo raiz 16 — **decisão tomada com o usuário**, incluindo o crescimento
de 14,3% de tudo o que é rem e a decisão explícita de **não** reancorar `--spacing`. Consequência
não medida na hora:

|                                                          | Design (raiz 14) | Hoje (raiz 16)           |
| -------------------------------------------------------- | ---------------- | ------------------------ |
| `body/ui` — nome de tarefa, pílula, botão, input, rótulo | **12,25px**      | `text-sm` = 14px         |
| `caption` — metadado de linha                            | **10,5px**       | `text-xs` = 12px         |
| `title/page`                                             | 20px             | `text-base` = 16px ⚠ bug |
| `title/section`                                          | 16px             | `text-base` = 16px ✓     |
| `overline`                                               | 10px             | `text-overline` = 10px ✓ |
| `mono/tempo` (valor de KPI)                              | 17px             | `text-base` = 16px       |
| raio, cabeçalho 56, toggle 40×20, ícones, barra 3px      | px fixo          | **iguais** ✓             |

Tudo que era rem cresceu 14%; tudo que era px ficou parado. **É esse descompasso, e não um
acúmulo de descuidos, que produz a sensação de "quase certo"** — a proporção interna de cada
componente quebrou, o layout geral não.

**Correção escolhida pelo usuário (2026-08-08):** manter raiz 16 e `--spacing` como estão, e
reancorar **só os tokens de tamanho de fonte** nos px do design. Isso **não** reabre a decisão
do PR 6.5 — raiz, espaçamento, raios e ícones seguem exatamente como estão. Quem encontrar
`--text-sm` fora do valor do Tailwind: é de propósito.

### 1.2 Causa secundária — o system trava tokens, não componentes

Os testes de convenção (`designTokens`, `fontSizes`, `fontWeights`, `meaningColors`,
`inputAutocomplete`) reprovam cor crua, `text-[13px]` e `font-bold`. **Nenhum reprova um botão
escrito à mão com tokens perfeitamente válidos.** Medição de 2026-08-08, antes da fase A:

|                                            |                                                                        |
| ------------------------------------------ | ---------------------------------------------------------------------- |
| primitivos em `components/ui/`             | 8                                                                      |
| `<button>` com `className` literal         | 131                                                                    |
| strings de classe **distintas** entre eles | **73** (piso — o regex não pega template literal)                      |
| usadas **uma única vez**                   | 47                                                                     |
| `<input>` crus fora de `ui/`               | 81                                                                     |
| `<select>` crus                            | 21                                                                     |
| `text-xs` no total                         | 461 · em algo com padding/borda/raio: ~172 · dentro de `<button>`: ≥49 |
| 4 scrims diferentes / 5 larguras de modal  | `bg-canvas/80` (9), `bg-black/60 backdrop-blur-sm` (7), +2             |

Faltavam `Button`, `IconButton`, `Input`, `Select`, `Textarea`, `Modal`, `Badge`.

### 1.3 A ordem que isso impõe

A varredura da escala (§B2) é editar `text-xs` → `text-sm` em ~172 controles à mão. **Pelo menos
49 estão dentro de um `<button>`** — as mesmas linhas que um `Button` faz desaparecer, porque o
tamanho passa a morar no primitivo. Extrair os primitivos **antes** da varredura evita tocar as
mesmas linhas duas vezes.

---

## 2. Etapas

### Fase A · Cobertura de primitivos

**A1 · `Button` + `IconButton`** — ✅ **feito** (`6e51a96`, `646e4a6`).

- Cinco variantes, tiradas de uma contagem dos call sites: `primary`, `accent`, `secondary`,
  `ghost`, `danger`. A `outline` que existia foi colapsada em `secondary` por decisão do
  usuário — ver a nota do §8.4 sobre o botão "Filtros" do Histórico, que foi a conta a pagar.
- `integrationButtonClass` absorvido e apagado.
- Modais ficaram deliberadamente de fora, para o A3 (que os toca de qualquer jeito).

**A2 · `Input` / `Select` / `Textarea`** — ✅ **feito** (`7c2a6ed`).

- Casca única em `ui/controlStyles.ts`, três formas (`boxed`, `bare`, `plain`), dois tamanhos.
- O `Select` desenha a própria seta, e com isso o último cinza fixo saiu do `index.css`.
- `fieldControlClass` e `settingsInputClass` apagados. Caixa, rádio e faixa ficam de fora **por
  assinatura** — não têm casca, fundo nem raio.

**A3 · `Modal`** — ✅ **feito** (`810f2e0`, `4cfe7d1`, sessão 3). **Dos 19 modais, 18 estão na
casca**; o único fora é o `SetupModal`, e é a exceção declarada.

Spec do documento _Overlays e modais_, implementada em `ui/Modal.tsx`: véu
`oklch(0.13 0.028 261.692 / 0.82)` = **`bg-canvas/82`**, **sem blur** (_"em janela de 1100px ele
custa frame e não separa nada que a opacidade já não separe"_); cabeçalho **48px** (`min-h-12`,
não altura fixa: com descrição são duas linhas), título 14px/600, X à direita, **sempre** com
borda inferior; corpo `p-5`, `gap-3`, rola a partir de **60vh**; rodapé **52px** (`min-h-13`),
ações à direita, secundária sem casca, **nunca dois botões cheios**. Larguras: `sm 360` ·
`md 460` · `lg 720` · `xl 900`, em px porque são medida de janela, não ritmo de espaçamento.

- **Sessão 1** (`810f2e0`) — casca + teste de contrato + os **sete modais `md`**:
  `BulkImport`, `EditGroup`, `EditTask`, `MondayConnect`, `ClockifyConnect`, `DeleteWorkspace`,
  `MoveToWorkspace`. Como o A1 pulou os modais, os botões de rodapé viraram `Button` e os campos
  crus viraram `Input` na mesma passada. **O ESC passou a morar no primitivo** — os sete
  chamavam `useEscapeToClose` à mão.
  - O botão cheio em `danger` da exclusão de workspace é o **único do app**, e vence o
    `bg-accent` do `primary` com o `!` já usado em `controlStyles` — não foi aberta variante nova.
  - O par Mover/Copiar virou a alternância `accent`/`secondary` do botão "Filtros", e **não** um
    `SegmentedControl`, que não expressa ícone.
- **Sessão 2** (`4cfe7d1`) — os **três `lg`**: `ExportModal`, `TaskSendModal`,
  `ImportZendeskModal`. A casca ganhou quatro encaixes:
  - `toolbar` — faixa fixa entre cabeçalho e corpo (período do envio, abas da exportação). No
    corpo, rolaria junto com a lista que filtra.
  - `notice` — faixa fixa acima das ações (aviso de reenvio, resultado do envio). No corpo,
    sumiria de vista justamente ao descrever o que acabou de acontecer.
  - `footerStart` — "Todas"/"Nenhuma": controle da lista, não ação do diálogo.
  - `tall` — corpo até onde a janela deixar. Eram `80vh`, `85vh` e um `style` com `90vh` em
    linha, três medidas para a mesma intenção; o limite passa a ser a janela menos a margem do
    véu, sem número novo.

  Três mudanças **visíveis** entraram aqui, e ainda não foram conferidas na tela: **Exportar
  ganhou título** (as abas eram o cabeçalho inteiro, sem título — mesmo argumento do "toda tela
  tem título" do `PageHeader`, e elas desceram para a `toolbar`); as pílulas de período do envio
  viram `FilterPill`; e o "Selecionar todos" do Zendesk saiu de dentro da rolagem.

  De quebra: o editor de ticket do Zendesk deixou de reimplementar `Toggle` e `SegmentedControl`
  à mão, e o "Copiado!" da exportação parou de escrever verde sobre verde.

- **Sessão 3** — os cinco que carregavam lógica própria. As larguras foram **decisão do usuário
  em 2026-08-10**, com a medida escolhida pelo conteúdo, sem inventar um quinto degrau:
  - `EditPlannedTaskModal` → **`lg`** (672 → 720). É formulário; a grade de duas colunas é o que
    ele pede. `fieldClass` foi apagado ao migrá-lo, e `bareInputClass` caiu junto — estava sem
    consumidor desde o A2. Sobrou de `fieldStyles.ts` só o que veste o campo **por fora**: a
    caixa, os dois rótulos e a casca da coluna de formulário.
  - `MondayImportModal` → **`lg`** (672 → 720). A lista é uma coluna só.
  - `ImportCalendarModal` → **`xl`** (672 → 900). É o único modal de **duas colunas**: a lista de
    semanas come 192 px, e em 720 sobravam 528 para linhas que editam projeto e categoria em
    linha. O corpo é a linha flex das duas colunas, e com isso o `overflow` da casca fica inerte
    — ele nunca transborda porque a altura dos filhos é a dele.
  - `ClockifyEntriesModal` e `MondayEntriesModal` → **`xl` + `tall`**. **Couberam.** Eram a
    quinta largura de modal (`100vw-16px`) e os dois últimos véus com desfoque; a largura visível
    cai de ~1084 para 900 numa janela de 1100. A casca ganhou um encaixe para isso, o
    **`headerEnd`** — o ↻ dos dois e o total de horas do Monday. Os dois guardas de "integração
    não configurada", que eram `max-w-md` escrito à mão, viraram `Modal` `md`.

  Duas coisas passaram a morar no primitivo nesta sessão, e nenhuma é enfeite:
  - **`data-modal-open`**, que é o que impede o ESC de esconder a **janela inteira**: o listener
    de `useGlobalShortcuts` é do `document` e roda **antes** do `useEscapeToClose`, que é da
    `window`. Escrito à mão, só três telas o tinham — os 10 modais das sessões 1 e 2 estavam sem
    ele, e ali o ESC fechava o app em vez do diálogo.
  - **O `p-5` do corpo saiu da classe fixa e virou o valor padrão de `bodyClassName`.** A prop
    promete substituir, e não somar; mas `p-0` é emitido **antes** de `p-5` na folha, então o
    `bodyClassName="p-0"` do `ImportZendeskModal` (sessão 2) não tirava padding nenhum. Com o
    `p-5` no padrão, substituí-lo é substituí-lo de verdade — e quem só passava arranjo
    (`flex flex-col gap-*`) voltou a pedir o `p-5` junto.

  Três mudanças **visíveis** entraram aqui, além das larguras: os dois pares de pílulas de
  período viraram `FilterPill`; as duas chaves escritas à mão (importação do Monday e do Calendar)
  viraram `Toggle`, que é 40×20 e não 32×16; e o `+` sozinho da linha "adicionar ação" virou
  **"+ Adicionar"** — o `Button` pede rótulo, e um ícone só dentro de uma caixa não é o que o
  `IconButton` desenha.

  **O `SetupModal` fica de fora de vez:** fundo opaco, sem véu, sem X e sem para onde fechar —
  é a janela da primeira execução, não um diálogo.

  > **O `CommandPalette` não é modal e não entrou.** Ele é o último `bg-black/60 backdrop-blur-sm`
  > do app, mas abre encostado no alto (`items-start pt-20`), não centrado, e não tem cabeçalho,
  > rodapé nem título — a casca não o expressa. Fica para uma decisão própria.

**A4 · `Badge`** — pendente. A partir de `components/chipStyles.ts`, que já é o vocabulário certo
sem ser componente. Cobre o chip de billable da fase E.

### Fase B · Escala tipográfica

**B1 + B2 são um commit só.** B1 sozinha deixa 461 lugares em 10,5px de uma vez — a branch fica
quebrada no meio se separar.

**B1 · Reancorar os tokens** — `src/index.css`, dentro do `@theme static`:

```css
--text-sm: 0.765625rem; /* 12,25px — body/ui */
--text-xs: 0.65625rem; /* 10,5px  — caption */
--text-body: 0.875rem; /* 14px    — prosa longa, degrau novo */
--text-metric: 1.0625rem; /* 17px    — valor de KPI e cronômetro */
```

Com os respectivos `--text-*--line-height`. Começar em `1.35` (sm) e `1.4` (xs) e ajustar na
verificação visual — os mockups não declaram line-height nas linhas de lista. **Não tocar** em
`--text-base` (16, `title/section`), `text-xl` (20, `title/page`), `--text-overline` (10),
`--spacing`, nem na raiz de 16px. Assertivas novas em
`src/tests/conventions/designTokens.test.ts`.

**B2 · Varredura dos ~172 `text-xs` que são controle** — o grosso do trabalho.

- Promover a `text-sm` onde o design manda `body/ui`: pílula, botão, input, chip clicável,
  rótulo de campo. **Manter** `text-xs` em metadado de linha e dica (`KpiCard.hint`,
  `TaskRow.subtitle`, `SectionCard.description`).
- Aplicar `text-body` na prosa: descrições de configuração, parágrafos de ajuda.
- **A fase A barateou isto**: `Button`, `IconButton`, `Input`, `Select`, `Textarea` e `Modal` já
  concentram o tamanho num lugar só. O `ControlSize` do `controlStyles.ts` é literalmente uma
  linha (`sm: "text-xs"`) que promove ~49 call sites de uma vez — ver o comentário lá.
- Arquivo a arquivo, pelos mais densos (contagem anterior à fase A): `PopupOverlayContent` (24),
  `ImportCalendarModal` (23), `ClockifyEntriesModal` (21), `GoogleIntegrationSection` (20),
  `TaskSendModal` (20), `MondayEntriesModal` (19), `HistoryPage` (17), `ExportModal` (17),
  `PlannedTaskEditSheet` (14), `MondayProjectsImport` (13), `ZendeskIntegrationSection` (13),
  `MondayImportModal` (13). **Recontar antes de começar** — a fase A mexeu em quase todos.
- **Exceção declarada:** o overlay compacto pode descer abaixo de 12,25px (janela de 78px), e só
  em número monoespaçado — está no documento _Overlays e modais_.
- **3–4 sessões**, pela regra "um componente por conversa" do CLAUDE.md.

### Fase C · Fidelidade pontual

**C1 · `PageHeader` → `text-xl`** (`PageHeader.tsx`, hoje `text-base`). Design: `title/page`
20px/600, e a própria §8.4 do CLAUDE.md já tabela `text-xl`. Nenhuma das 7 telas usa `text-xl`
hoje — é a divergência mais visível do conjunto.
**Risco a verificar antes de commitar:** com 20px, Configurações e Dados precisam caber título +
6 abas + ações nos 56px de uma janela de 1100. Se não couber, **parar e reportar** em vez de
inventar um tamanho intermediário. Ajustar
`src/tests/presentation/components/ui/PageHeader.test.tsx`.

**C2 · `KpiCard`** — dois defeitos:

- A faixa some quando não há `barPct` (`{pct !== undefined && …}`), e o cartão encolhe. O guia de
  migração é explícito: _"sem ele a faixa fica vazia para preservar a altura"_. Renderizar sempre
  o trilho de 3px; sem `barPct`, sem preenchimento.
- Valor em `text-base` (16) → `text-metric` (17), criado em B1.

**C3 · `SearchInput`** — anel de foco de 3px, hoje ausente. _"foco com anel de 3px em vez de só
trocar a borda"_ — `focus:ring-[3px] ring-accent/15` somado à borda de acento.

### Fase D · Travas

**D1 · Teste de convenção de componente** — o que hoje não existe. Falha quando um `<button>`
carrega `px-*` + `py-*` + `rounded-*` inline em vez de usar `Button`/`IconButton`; idem
`<input>`/`<select>` fora de `ui/`. Com **baseline que só pode encolher**, falhando nos dois
sentidos, como `meaningColors.test.ts` já faz — descer sem atualizar a lista deixa folga onde a
próxima regressão se esconde. É isto, e não boa intenção, que impede a dívida de voltar em três
meses.

> **Exceções a registrar na baseline** (já conhecidas, todas justificadas no §8.4): a alça de
> arraste do `ExportModal` (`cursor-grab`), o ▶ do Lançamento Manual, o "Lançar N com horário",
> as definições de `SubSection`/`MappingBox`/`IntegrationTile`, o toggle de billable — do
> `EditGroupModal`, do `EditTaskModal` e do `EditPlannedTaskModal`, os três pelo mesmo motivo: o
> estado ligado **é** a cor do próprio significado, e no `IconButton` a cor é o destino do hover
> com repouso sempre em `fg-muted` — e o `PlannedTaskItem`.
>
> **Sobram 26 `<button>` nos 19 modais**, três deles no `SetupModal`. É o número a fazer encolher,
> e o piso não é zero: o toggle de billable e as linhas de seleção com caixa própria ficam.

**D2 · Registrar as exceções declaradas** na §8.4 do CLAUDE.md, em vez de deixá-las implícitas:
overlay compacto abaixo de 12,25px, cores de workspace e de marca fora dos tokens de significado,
`rounded-sm` nas cinco micromarcas.

### Fase E · Produto — **precisa de confirmação do usuário antes de começar**

**E1 · Chip de billable escrito no `TaskRow`.** O design é explícito: _"A barra verde à esquerda
**sai** — o chip escrito assume"_, com pílula de 10px/500 dizendo "Billable"/"Non-billable". O
`TaskRow` fez o inverso: manteve a barra e não tem chip. Isso também derruba a regra de
acessibilidade do próprio handoff (_"cor nunca é o único sinal"_) — hoje a informação está só na
cor da faixa e no `title` do ponto.
**Não é fidelidade, é produto:** o CLAUDE.md §8.4 hoje documenta a faixa como contrato do
primitivo, e o clique que alterna billable mora no ponto de projeto — que precisaria de um novo
dono. Muda 5 telas. **Perguntar antes.**

---

## 3. Decisões pendentes do usuário

1. **`Field` entalhado vs. overline.** O design (tela 3f) diz que os rótulos entalhados _"viram o
   rótulo overline usado no resto do app"_. O `Field.tsx` manteve o entalhe, e a §5.8 do CLAUDE.md
   documenta o rótulo flutuante como escolha deliberada para a coluna estreita. Pode ter sido
   decisão consciente — **confirmar antes de mexer**.

   > Levantado com o usuário em 2026-08-08, sem decisão ainda. Estado real da cobertura: `Field`
   > (o entalhe como componente) é usado em **2 arquivos**; o mesmo entalhe em classes
   > (`notchedBoxClass`/`notchedLabelClass`) continua no `EditTaskModal`; o rótulo flutuante
   > (`floatingLabelClass`) continua no `CustomFieldInputs`; e o rótulo solto acima do campo
   > (`<label className="text-xs …">`) não tem componente nenhum. **Unificar os quatro é trabalho
   > desta decisão, não da fase B.**

2. **Integrações (tela 3g).** _"status vira chip curto em vez de frase; a não conectada fica com
   contorno tracejado e um botão explícito"_. O `StatusBadge` ainda é a frase "Conectado como
   email@…"; não há contorno tracejado. Não migrado.
3. **Os 63 `opacity-40/50` em linha inteira.** Regra explícita do handoff: _"estado concluído ou
   desabilitado nunca por `opacity` na linha inteira — isso derruba o contraste para perto de
   2:1"_. Usar cor explícita + tachado ou ícone.
4. **Overlay compacto 52px vs. 68px do design.** Pode ter sido escolha do usuário; sinalizado
   porque a escala de texto do popup foi calibrada no documento para 68/78px.
5. ~~**Larguras dos três modais `max-w-2xl`**~~ — **decidido em 2026-08-10**, ver A3 sessão 3.
6. **Os três overlines escritos à mão.** `text-overline` existe e é o token, mas há três grafias
   soltas convivendo: `text-xs font-medium … tracking-wide` (`EditPlannedTaskModal`),
   `text-xs font-semibold … tracking-widest` (os dois modais de apontamentos) e `text-xs …
tracking-wide` sem peso (`MoveToWorkspaceModal`). A sessão 1 do A3 as manteve, e a sessão 3 as
   manteve por consistência com ela — **unificá-las nos 10 px do token é decisão própria**, porque
   encolhe rótulo em cinco lugares. Aparenta a mesma família da decisão 1 (`Field` entalhado).

---

## 4. Medições de referência

Para conferir progresso em sessão futura, os números de 2026-08-08 **antes** desta rodada:
`73` strings de classe distintas em `<button>` · `81` `<input>` crus · `21` `<select>` ·
`461` `text-xs` · `190` `text-sm` · `4` scrims · `5` larguras de modal · `63` `opacity-4[05]`.

Ao fim da fase A (2026-08-10, medido com `grep -rho`):

|                                | Antes | Agora                                            |
| ------------------------------ | ----- | ------------------------------------------------ |
| `<input>` crus                 | 81    | **35** (caixa, rádio e faixa, fora por assinatura) |
| `<select>` crus                | 21    | **5**                                            |
| scrims                         | 4     | **1** — e é o `CommandPalette`, que não é modal   |
| larguras de modal              | 5     | **4** — as da casca                              |
| `text-xs`                      | 461   | **365** (a varredura da fase B é sobre estes)     |
| `<button>` nos 19 modais       | —     | **26**, dos quais 3 no `SetupModal`              |

**A fase B tem menos trabalho do que a §B2 estimou**: ela contava ~172 `text-xs` em controle a
partir de 461, e a fase A absorveu 96 deles nos primitivos. **Recontar arquivo a arquivo antes de
começar** — as listas de densidade do §B2 são anteriores a A1.

---

## 5. O que já está fiel — não mexer

Tokens de cor (batem valor a valor com o bloco `@theme` do guia), os dois eixos modo × acento, a
paleta clara própria, as fontes empacotadas com `font-display: block`, `Toggle` 40×20 / knob 16 /
translate 20 **exato**, `FilterPill`, a escala de ícones 14/16/18, zero `font-bold`, cabeçalho de
56px, `SectionCard` com cabeçalho em overline (confere com o documento _Telas redesenhadas_, não
com a tabela de escala).

---

## 6. Retomando numa máquina nova

1. `git checkout refactor/design-tokens && pnpm install`.
2. Ler o CLAUDE.md (§8.4 inteiro) e este documento.
3. `git log --oneline main..HEAD` — **o git é a fonte confiável do estado**, este documento é a
   intenção.
4. Identificar a próxima etapa pendente aqui, implementar **só ela**, rodar
   `pnpm lint && pnpm test && pnpm build`, conferir na tela nos 2 modos × 4 acentos, commitar e
   parar.
5. Não propor merge em `main` nem rodar o `@code-quality-reviewer` antes do fim da rodada.

**Verificação manual pendente** (nenhuma das três sessões do A3 foi conferida na tela). Por ordem
de risco:

1. **Os dois modais de apontamentos** (Clockify e Monday) — saíram de janela cheia para 900 px, é a
   maior mudança de medida da rodada. Conferir se a grade de 4 colunas das linhas ainda respira.
2. **`ImportCalendarModal`** — foi para 900 px e o corpo virou linha flex; conferir se as duas
   colunas rolam **cada uma por si** e o cabeçalho `sticky` da semana gruda no lugar certo.
3. **`ExportModal`** — o `bodyClassName` passou de `""` para `"p-5"`. Antes o `p-5` chegava por
   herança silenciosa, então a intenção é a mesma; é o call site em que errar isso apareceria.
4. **`ImportZendeskModal`** — o `p-0` dele **passou a valer**. O corpo perdeu 20 px de padding que
   estava lá contra a intenção do código.
5. `EditTaskModal` no modo claro (o mais alto, e o único `md` que rola) e o `EditPlannedTaskModal`,
   onde os botões de agendamento viraram `Button` e ficaram 2 px mais baixos.
6. Em todos: **ESC não deve esconder a janela do app** — é o `data-modal-open` novo na casca.
