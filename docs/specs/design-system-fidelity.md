# Rodada de fidelidade e cobertura do design system — handoff

> **Estado: em execução**, na branch `refactor/design-tokens`. Este documento é a **fonte
> única** da rodada: ele substitui o plano e a memória que viviam fora do repositório
> (`~/.claude/plans/design-system-fidelity.md` e a memória `project-design-system-migration`),
> justamente para a rodada poder ser retomada em outra máquina. **Invoque a skill
> `design-system` antes** — este documento a pressupõe inteira (ela era a §8.4 do CLAUDE.md
> até 2026-08-10, quando o CLAUDE.md de 180KB foi fatiado; o de-para está na §5.1 dele).
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
| `title/page`                                             | 20px             | `text-base` = 16px ⚠ bug — corrigido na C1 |
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

  > **O `CommandPalette` não entrou, e depois deixou de existir.** Ele era o último
  > `bg-black/60 backdrop-blur-sm` do app, mas abria encostado no alto (`items-start pt-20`), não
  > centrado, e não tinha cabeçalho, rodapé nem título — a casca não o expressava, e a decisão
  > ficou em aberto. O usuário resolveu **removendo a feature** em 2026-08-10, por não usá-la: com
  > ela saíram a janela `command-palette` inteira, o scrim e o único `backdrop-blur` restante. Não
  > há mais véu fora da casca `Modal`.

**A4 · `Badge`** — ✅ **feito**. O rótulo curto que **não** responde ao clique: 15 grafias
distintas viraram um `<span>` de `rounded-chip` com borda, `text-xs`/500, `leading-none`. O raio e
a borda saem de `chipStyles.ts` e da direção de cor 2a ("definida por borda"); `rounded-full` era
minoria (6 contra 9) e não sobreviveu. **A F4 desfez essa parte:** o spec extraído mede 99px, e o
`Badge` de hoje é a pílula de 10px — a contagem de call sites tinha decidido o que só a medida
decide.

Seis tons, tirados dos call sites: `neutral`, `billable`, `success`, `accent`, `warning`, `danger`.
`billable` e `success` compartilham o verde e mesmo assim são tons separados — coincidem na cor,
não no significado.

- **Nasceram `--color-success` e `--color-warning`** (decisão do usuário em 2026-08-10, contra
  concentrar o amber cru ou reaproveitar `paused`). O aviso é hue 85, não os 70 da pausa, ou o
  aviso leria como tarefa pausada; e desce para L 0.62 no modo claro, como o âmbar de pausa desce.
  Assertivas em `designTokens.test.ts`, nos dois blocos.
- **13 call sites migrados**: os três do `TaskSendModal`, o chip de billable do `PlannedTaskItem`,
  os dois do `ImportCalendarModal` e o "já existe" do `MondayImportModal`, `CategoryCard`,
  `ProjectCategoriesEditor`, as tags de `ClockifyEntriesModal`/`MondayEntriesModal`/`TagMultiSelect`,
  os `subBadges` das integrações e o contador de dia do `WeekPlanningView`.
- **Fora, e de propósito:** os quatro `STATUS_COLORS` do `ImportZendeskModal` — é cor de
  **entidade** (quatro status do Zendesk), como a paleta de workspace, e colapsá-los nos tons
  semânticos apagaria a distinção entre "pendente" e "em espera". O chip de atalho do `ShortcutRow`
  (mono, é tecla) e o contador circular do `CompactOverlay` (16 px fixos) também.
- **Duas mudanças visíveis:** o chip de billable do `PlannedTaskItem` e as três pílulas do
  `TaskSendModal` perderam o `rounded-full`; e o "Faltando: …" saiu do laranja para `danger`,
  porque ele **desabilita a seleção do grupo** — é impedimento, não aviso, e o "Parcial" ao lado
  ficou sendo o único âmbar.
- O `TaskSendModal` teve o aviso de reenvio e o `TONE_CLASS` passados aos tokens novos: era o único
  arquivo onde badge e frase de aviso aparecem lado a lado, e deixá-los em amarelos diferentes era
  criar o descompasso na mesma tela. **O resto do `amber-*`/`yellow-*` cru continua em pé** (toast,
  `AtalhosTab`, `DeleteWorkspaceModal`, `MondayProjectsImport`, `CustomFieldCard`,
  `OmniboxRunning`, `ExportModal`) — agora é substituição, não decisão.

### Fase B · Escala tipográfica — ✅ **feita** (B1 + B2, commit único)

**B1 + B2 são um commit só.** B1 sozinha deixa 461 lugares em 10,5px de uma vez — a branch fica
quebrada no meio se separar. É por isso que a fase saiu em **uma** sessão, contra a estimativa de
3–4 que a §B2 fazia: o corte por componente não existia aqui.

**B1 · Tokens reancorados** — `src/index.css`, dentro do `@theme static`: `--text-sm` 0.765625rem
(12,25), `--text-xs` 0.65625rem (10,5), e os dois degraus novos `--text-body` 0.875rem (14) e
`--text-metric` 1.0625rem (17), cada um com seu `--text-*--line-height` (1.35 / 1.4 / 1.55 / 1.2 —
**valores de partida**, a calibrar na verificação visual: os mockups não declaram line-height nas
linhas de lista). Intocados: `--text-base`, `text-xl`, `--text-overline`, `--spacing` e a raiz de
16px.

`designTokens.test.ts` ganhou três coisas: os oito tokens na lista de tipografia, **assertiva de
valor** para os quatro reancorados — é o único lugar da suíte onde o valor é a afirmação, porque um
`pnpm update` que devolvesse `--text-sm` ao padrão do Tailwind não quebraria nada e desfaria a
rodada 14% de cada vez — e a guarda de que raiz e `--spacing` seguem onde estavam.

**B2 · Varredura** — 355 `text-xs` → **167**. Os ~188 promovidos batem com a estimativa de ~172 da
§B2 mais o que a fase A não absorveu.

A régua aplicada, que é a que ficou registrada na §8.4 do CLAUDE.md:

- **`text-sm` (`body/ui`)** — o que o usuário aciona ou o que nomeia uma coisa: botão, pílula, aba,
  chip, campo, rótulo de campo, rótulo ao lado de um controle, item de menu, texto principal de
  linha de lista, título de painel.
- **`text-body`** — o parágrafo que se lê: os dois passo a passo de conexão (Monday, Clockify), as
  instruções OAuth do Zendesk, o callout de dicas da Agenda, a explicação do rastreio automático, o
  changelog e o aviso do modal de exclusão de workspace. **9 call sites** — deliberadamente poucos.
- **`text-xs` (`caption`)** — anotação subordinada: subtítulo de linha, contador, timestamp, mono de
  metadado, dica de uma linha sob um controle, mensagem de validação, estado vazio.

Quatro decisões que não são óbvias na régua:

- **O `ControlSize` do `controlStyles.ts` deixou de ter degrau de texto.** `sm` e `md` agora diferem
  só no padding, e o `text-sm` subiu para a string base — um `Record` de duas entradas idênticas é
  convite a divergirem. Isso promoveu os ~49 call sites de campo denso de uma vez.
- **`Badge` fica em `text-xs`**, sozinho entre os primitivos. O design pede a pílula escrita em
  10px/500 (é a mesma medida do chip de billable da E1), e ela não responde ao clique — `FilterPill`
  e `SegmentedControl`, que respondem, subiram.
- **`className="text-xs"` em `Autocomplete` e `DatePickerInput` era morto** e foi apagado, não
  promovido: nos dois a `className` veste o wrapper, e o campo lá dentro traz o próprio tamanho.
- **O overlay compacto não foi tocado** — exceção declarada (janela de 78px, só em número
  monoespaçado), e o timer do popup segue em `text-xl`.

**Efeito colateral a conferir na tela:** as quatro grafias de overline escritas à mão (decisão
pendente nº 6, mais o cabeçalho de dia do `WeekPlanningView`) encolheram de 12px para 10,5px sem
ninguém decidir isso — o `text-xs` delas foi reancorado junto. Elas ficaram **mais perto** do token
de 10px, o que enfraquece o argumento contra unificá-las, mas a decisão continua sendo do usuário.

O `text-metric` nasceu **sem consumidor**: quem o gasta é a C2 (valor do `KpiCard`). Ele sobrevive
ao tree-shaking porque o bloco é `@theme static`, e o build confirma que o utilitário é emitido.

### Fase C · Fidelidade pontual — ✅ **feita** (C1 + C2 + C3, commit único)

As três são pontuais e não se tocam; separá-las em três sessões custaria três verificações
manuais das mesmas telas.

**C1 · `PageHeader` → `text-xl`.** Design: `title/page` 20px/600, que a §8.4 do CLAUDE.md já
tabelava e que **nenhuma** das 7 telas usava — a divergência mais visível do conjunto. Em
`text-base` o título da página tinha o tamanho exato do cabeçalho de `SectionCard`, dois níveis
de hierarquia na mesma medida.

O risco de largura que a etapa mandava conferir **não se materializou**. Pior caso, Configurações
(título + 6 abas `sm` + botão "Manual"), numa janela de 1100 menos sidebar (68) e rail (52),
menos o `px-4` do cabeçalho = **948 px úteis**: título ~135 + gap 12 + 6 pílulas ~444 + 6 gaps 48
+ "Manual" ~84 = **~723**. Sobram ~225 px, e mesmo inflando as estimativas de glifo em 25% cabe.
Dados (4 abas) e Planejamento (o `context` mais largo, ~580 no total) ficam bem abaixo disso.

`PageHeader.test.tsx` **não precisou de ajuste**: ele afirma o `data-tour` na casca e o botão de
tour, nunca o tamanho do título — que é classe, e classe não é contrato (§7.6).

**C2 · `KpiCard`** — os dois defeitos corrigidos:

- O trilho passa a ser renderizado **sempre**; `barPct` governa o **preenchimento**, não o
  trilho. Condicionado, ele encolhia em 7px os dois cartões do Histórico que não têm percentual
  ("Total" e "Registros") e desalinhava a fileira de quatro.
- Valor em `text-base` (16) → **`text-metric`** (17). Com isso o degrau criado em B1 ganha o
  consumidor que lhe faltava, e o build confirma o utilitário emitido.

O teste teve o contrato invertido: era _"sem barPct não desenha barra"_ e virou _"sem barPct
desenha o trilho vazio"_, comparando a estrutura dos dois cartões — a única diferença é o
preenchimento.

**C3 · `SearchInput`** — `focus:ring-[3px] focus:ring-accent/15` somado à borda de acento, no
`className` que já ia para o `Input`. Fica sendo o **único** campo do app com anel: a busca mora
acima de uma lista que se reordena a cada tecla, e ali a troca de cor da borda sozinha some no
meio do movimento. Os dois utilitários são escritos com `focus:` — só a cor, sem a largura, não
desenha anel nenhum.

### Fase D · Travas — ✅ **feita** (D1 + D2, commit único)

D2 é documentação do que a D1 acabou de medir; separá-las custaria uma sessão para editar o
CLAUDE.md.

**D1 · `componentPrimitives.test.ts`** — duas varreduras com **baseline per-arquivo que só pode
encolher**, falhando nos dois sentidos como `meaningColors` já faz:

- **`<button>` com caixa própria** (padding **e** raio na mesma tag): **121**, em 44 arquivos.
- **`<input>`/`<select>`/`<textarea>` cru**: **6**, em 3 arquivos.

`components/ui/` é a **única isenção por caminho**, nas duas listas — é lá que a caixa é
*definida*; em qualquer outro lugar ela é cópia. Isso tirou do baseline o `SegmentedControl`, que
escreve a própria caixa inline (os demais primitivos a tiram de `controlStyles`).

Três decisões que a implementação obrigou:

- **O parser de tag saiu para `tests/helpers/jsxTags.ts`**, com o apagador de comentário junto. O
  `inputAutocomplete` já tinha uma cópia de 30 linhas do mesmo parser brace-aware, e uma segunda
  cópia era exatamente a duplicação que o §9.4 manda checar antes de escrever. Ele foi refeito
  sobre o helper — e ganhou de brinde a imunidade a comentário, que não tinha.
- **Comentário é apagado antes da varredura.** Sem isso o JSDoc que **cita** um `<select>` conta
  como um (dois falsos positivos reais: `CustomFieldInputs` e `PopupOverlayContent`), e — pior — o
  bloco comentado sai da varredura no dia em que alguém o comenta, que é quando ele deixa de ser
  dívida a cobrar.
- **121 é piso, não total.** `className` montada numa constante fora da tag escapa do regex, a
  mesma ressalva que a medição de abertura já fazia.

O baseline **não** foi reduzido nesta etapa, e é deliberado: migrar mesmo os 6 campos crus (que
são mecânicos) muda três modais na tela, e a verificação manual já está represada desde o A3.
Trava primeiro, redução depois.

**Verificado que falha nos dois sentidos**, com sonda temporária: `0 → 1` num arquivo fora do
baseline, e `baixe para N` ao inflar uma linha existente.

**D2 · Exceções registradas na §8.4.** Três das quatro já estavam escritas — paleta de workspace
("é a exceção, e não é dívida"), cor de marca (nas Regras obrigatórias) e `rounded-sm` nas cinco
micromarcas. Faltava a do **overlay compacto**, que a fase B tinha deixado como afirmação solta
deste handoff: a janela tem 78 px e escreve **número monoespaçado**, não texto lido, então a régua
`body/ui` vs. `caption` não tem o que dizer ali. Entrou junto o parágrafo da trava nova, ao lado
da contagem de `<button>` que a §8.4 já mantinha.

### Fase E · Produto

**E1 · Chip de billable escrito no `TaskRow`** — ✅ **feito**. Adoção completa autorizada pelo
usuário em 2026-08-10. O design é explícito: _"A barra verde à esquerda **sai** — o chip escrito
assume"_, com pílula de 10px/500 dizendo "Billable"/"Non-billable". O `TaskRow` fazia o inverso:
mantinha a barra e não tinha chip, deixando a informação só na cor da faixa e no `title` do ponto —
contra a regra de acessibilidade do próprio handoff (_"cor nunca é o único sinal"_). E o não
faturável não tinha sinal nenhum: sem faixa, indistinguível da linha que ninguém classificou.

**`ui/BillableChip.tsx`** é o primitivo novo — o A4 já tinha entregue o desenho (`Badge`
`tone="billable"`/`neutral`, em uso no `PlannedTaskItem`), e o que faltava era um dono para o par
de rótulos, que escrito em dois lugares é o começo de duas redações. O `PlannedTaskItem` passou a
consumi-lo.

Três decisões que a etapa obrigou:

- **O dono do clique é o chip.** Ele morava no **ponto de projeto** (`onDotClick`/`dotTitle`), que
  assim pintava uma coisa e alternava outra — e, sem faixa, seria a única forma de descobrir o
  faturamento da linha. As duas props saíram do primitivo, que não desenha mais `<button>` no ponto;
  entrou `onToggleBillable`. Só o `TaskCard` passava o clique, e é ele que continua passando.
- **Clicável, o chip não é um `Badge`** — é um `<button>` vestindo um. A fronteira do `Badge` é não
  responder ao clique, e um `onClick` opcional nele apagaria a régua que decide entre `Badge`,
  `FilterPill` e `Button`. O botão para a propagação: a linha em volta é clicável em três das cinco
  telas (selecionar no Histórico e no Manual, expandir no grupo de Tarefas).
- **`billable` perdeu o default `false`.** Ausente, a linha cala sobre faturamento e não desenha
  chip; um `false` implícito escreveria "Non-billable" sobre linha nunca classificada. As cinco
  chamadas passam o valor, então nada mudou na tela.

**Fora, e registrado:** o cabeçalho de grupo continua mostrando o chip da **primeira** tarefa, e
continua podendo mentir — o agrupamento é Nome + Projeto + Categoria (§6.3) e não inclui `billable`.
Era assim com a faixa; escrito, o desacerto fica visível. Resolvê-lo é produto, não migração. O
`ToggleBillable` (chip clicável com ícone, `sm`, um call site em `CategoriesPanel`) também ficou:
é controle de formulário, não indicador de linha.

**A conferir na tela:** o chip come largura do nome nas linhas com `meta` (Histórico e Manual têm
faixa de horário à esquerda **e** duração à direita) — é onde o nome truncaria antes. E o chip
`neutral` sobre linha em hover (`bg-raised`), que é onde a borda dele some primeiro.

**E2 · O chip também nos formulários** — ✅ **feito**. Pedido do usuário em 2026-08-10, com a
premissa de que a janela em 1100 px (PR 6.5) tirou o aperto de largura que justificava o `$` sem
rótulo. Eram **11 call sites em 5 grafias**, e a divergência já tinha passado de tamanho:

| Grafia | Onde |
|---|---|
| `$` sozinho, dentro da caixa de categoria | Planejamento, Manual, `EditTaskModal`, `EditPlannedTaskModal`, gaveta do popup |
| `$` + texto, `rounded-control` | `EditGroupModal`, tarefa em execução do popup, apontamentos Clockify e Monday |
| `$` + texto, `rounded-chip` | `ToggleBillable` (Dados → Categorias), `CategoryCard` |

Duas coisas que a contagem não mostra e a migração corrige: os dois modais de apontamentos
escreviam **em português** ("Faturável"/"Não-faturável") e o `CategoryCard` **abreviava**
("Bill."/"Non."). A redação passou a ser do primitivo — é isso, e não a disciplina de quem edita,
que impede a sexta grafia.

Três decisões:

- **Um tamanho só**, e ele é o do `TaskRow`. A pergunta sobre um segundo degrau para o "chip sozinho
  na linha" foi respondida pela decisão seguinte, que elimina esse caso.
- **Num formulário o chip nunca fica sozinho na linha** (decisão do usuário) — é o sufixo da caixa
  da categoria, que é onde os cinco `$` já moravam. Quem se moveu foi o `EditGroupModal`: a
  categoria virou campo dentro de caixa e o botão de altura cheia que ocupava a linha seguinte saiu.
  Onde não existe caixa de campo (editores de linha dos dois modais de apontamentos, linha
  "adicionar" das categorias, tarefa em execução do popup), o chip fica na fileira de controles que
  já existe.
- **`ToggleBillable` apagado** — era o chip escrito de novo, com ícone e em outra medida, com um
  consumidor só.

O baseline do `componentPrimitives.test.ts` desceu em 6 arquivos (o `EditGroupModal` e o
`ToggleBillable` saíram da lista; `PopupOverlayContent` 16→15, `MondayEntriesModal` 6→5,
`ClockifyEntriesModal` 4→3, `CategoryCard` 3→2). Os cinco `$` não estavam no baseline: eram ícone
sem padding, e o que a trava conta é caixa própria.

**A conferir na tela:** o popup de 264 px (gaveta de edição e tarefa em execução), que é onde o
chip mais aperta; o `EditGroupModal`, que mudou de arranjo; e a grade de 3 colunas do editor do
Clockify, cujo `items-start` virou `items-center` porque o chip é mais baixo que os dois campos ao
lado.

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

|                          | Antes | Agora                                                                |
| ------------------------ | ----- | -------------------------------------------------------------------- |
| `<input>` crus           | 81    | **35** (caixa, rádio e faixa, fora por assinatura)                   |
| `<select>` crus          | 21    | **5**                                                                |
| scrims                   | 4     | **1**, depois **0** — o que sobrava era o `CommandPalette`, removido |
| larguras de modal        | 5     | **4** — as da casca                                                  |
| `text-xs`                | 461   | **365** (a varredura da fase B é sobre estes)                        |
| `<button>` nos 19 modais | —     | **26**, dos quais 3 no `SetupModal`                                  |

Depois do A4 (2026-08-10): `text-xs` em **354**, e `amber-*`/`yellow-*`/`orange-*` crus em **29**
linhas / 11 arquivos, todas fora de badge (banners, toast, frases de status).

Depois da fase B (2026-08-10), a escala em `.tsx`:

| `text-xs` | `text-sm` | `text-body` | `text-metric` | `text-base` | `text-xl` | `text-overline` |
| --------- | --------- | ----------- | ------------- | ----------- | --------- | --------------- |
| 167       | 279       | 9           | 0 (é da C2)   | 8           | 2         | 15              |

Depois da fase C (2026-08-10): `text-metric` em **1** (o valor do `KpiCard`), `text-base` em
**6** e `text-xl` em **3** — o `PageHeader` mudou de coluna.

Depois da fase D (2026-08-10), agora congelado em `componentPrimitives.test.ts`: `<button>` com
caixa própria em **121** / 44 arquivos (era 131 com `className` literal na abertura, por outro
critério) e campo cru fora de `ui/` em **6** / 3 arquivos.

Depois da F2 (2026-08-10), medido na bancada visual: as **três formas** da linha em zero divergência
de propriedade, e altura de **53,22 contra 55** nas três — 1,78px que são o line-height, não a linha.
O `SectionCard` de três linhas fecha em **198,66 contra 204**, que é exatamente 3 × 1,78: a conta que
a F1 deixou em aberto não sobra nada.

Os seis `text-base` que sobram, e o que fazer com eles: os dois `<h2>` do `SetupModal` e o
`<h1>` de falha de config do `App.tsx` são `title/section` legítimos; o contador do overlay
compacto é exceção declarada; o campo do `OmniboxIdle` é o único campo do app maior que os
outros, de propósito. **Sobra um fora de lugar:** o total do dia no `HistoryPage` (linha 55) é
número em `font-mono`, ou seja `mono/tempo` — deveria ser `text-metric`, como o valor do
`KpiCard`. Não foi tocado aqui porque a C2 nomeia o `KpiCard`, e não uma varredura de `text-base`.

---

## 5. O que já está fiel — não mexer

Tokens de cor (batem valor a valor com o bloco `@theme` do guia), os dois eixos modo × acento, a
paleta clara própria, as fontes empacotadas com `font-display: block`, `Toggle` 40×20 / knob 16 /
translate 20 **exato**, `FilterPill`, a escala de ícones 14/16/18, zero `font-bold`, cabeçalho de
56px.

> ⚠ **Corrigido em 2026-08-10:** esta seção afirmava que o `SectionCard` estava fiel, "confere com
> o documento _Telas redesenhadas_". Era falso — a auditoria conferiu que o título está em overline
> e parou aí. A casca, o fundo do cabeçalho, a régua inferior e os paddings divergem todos (§7.4).
> Serve de aviso ao resto desta seção: "confere com o documento" sem número medido não é
> verificação. As quatro divergências que ela nomeia foram fechadas na **F1**, e agora com número:
> cabeçalho de 38px contra 38px do mock.

---

## 6. Retomando numa máquina nova

1. `git checkout refactor/design-tokens && pnpm install`.
2. Invocar a skill `design-system` (era a §8.4 do CLAUDE.md, fatiada em 2026-08-10) e ler este
   documento. O CLAUDE.md agora é índice de 12KB e traz o de-para das seções antigas na §5.1.
3. `git log --oneline main..HEAD` — **o git é a fonte confiável do estado**, este documento é a
   intenção.
4. Identificar a próxima etapa pendente aqui, implementar **só ela**, rodar
   `pnpm lint && pnpm test && pnpm build`, conferir na tela nos 2 modos × 4 acentos, commitar e
   parar.
5. Não propor merge em `main` nem rodar o `@code-quality-reviewer` antes do fim da rodada.

**Verificação manual pendente** (nem as três sessões do A3, nem o A4, nem as fases B, C e E foram
conferidos na tela). Por ordem de risco:

-4. **A linha de tarefa nas 5 telas** (F2) — é a mudança de maior alcance depois da escala: **toda**
    lista perdeu o respiro entre linhas e ganhou régua, e a linha deixou de ser pílula para ser
    faixa de borda a borda. Olhar primeiro **Entradas de hoje**, que é onde o conteúdo se moveu: o
    `3 registros` saiu do subtítulo para a coluna de 88px, e as linhas filhas ganharam faixa de
    horário, trilho e um degrau de 12px — conferir se o trilho se vê no **modo claro**, onde ele é
    `border-subtle` sobre canvas quase branco. Depois, em **Histórico e
    Manual**, a duração sumindo no hover para a ação entrar no lugar dela: é a mudança de
    comportamento da etapa, e é onde uma linha estreita mostraria as duas se atropelando.
    -4b. **O cartão do dia do Histórico deixou de pintar fundo** — mesma mudança que a F1 fez no
    `SectionCard`, e pelo mesmo motivo. Conferir no **modo claro** que a linha em hover ainda se
    separa, e que a linha **selecionada** (que é `bg-accent/10` de borda a borda) não escapa pelo
    canto arredondado do cartão: ele não tem `overflow-hidden`, por causa do cabeçalho `sticky`.

-3. **O `SectionCard` nas 7 telas** (F1) — a casca deixou de pintar fundo, então **toda** lista e
    todo grupo de configuração passou a ficar sobre o canvas, com a faixa do cabeçalho sendo o único
    `surface` do cartão. Olhar primeiro **Configurações e Dados**, que são 12 dos 13 cartões e onde a
    mudança é a de maior alcance: conferir se a linha de configuração ainda se separa do fundo e se a
    faixa do cabeçalho lê como faixa, não como cabeçalho solto. Depois, no **modo claro**, a pílula
    do contador (`bg-border-subtle` sobre `surface` branco) e as duas subidas para `bg-surface` — o
    painel de categorias do `ProjectCard` e a linha de workspace inativa.

-2. **O chip de billable nas cinco telas** (E1) — é a mudança mais visível da rodada: **toda** linha
    de tarefa ganhou texto novo ao lado do nome e perdeu a faixa verde. Olhar primeiro Histórico e
    Lançamento Manual, que são as linhas mais apertadas (faixa de horário à esquerda, duração à
    direita), e conferir se o nome ainda respira. Depois, em Tarefas, que o chip alterna o
    faturamento no clique — era o ponto de projeto que fazia isso.
    -2b. **O mesmo chip nos 11 formulários** (E2) — o `$` sem rótulo sumiu do app. O aperto está no
    popup de 264 px (gaveta de edição e tarefa em execução); depois dele, o `EditGroupModal`, cujo
    billable saiu de uma linha própria para dentro da caixa da categoria.


-1. **O cabeçalho das sete telas, com o título em 20px** — a conta diz que cabe com ~225 px de
    folga em Configurações, mas é conta, não medida. Olhar Configurações e Dados primeiro (são as
    de abas), depois Planejamento, onde o `context` é o mais largo. Se o título truncar, o
    problema é o `max-w-[45%]` dele, não o tamanho.
    -1b. **A fileira de KPIs do Histórico** — os quatro cartões devem ficar da mesma altura agora,
    com "Total" e "Registros" mostrando trilho vazio em vez de nada.

0. **A escala inteira, em todas as telas** — é a mudança de maior alcance da rodada: todo texto do
   app mudou de tamanho. O que olhar primeiro são os **line-heights**, que entraram como valores de
   partida e não como medida do design: 1.35 no `body/ui` e 1.4 no `caption`. Onde eles erram é em
   linha de lista de duas alturas (`TaskRow`, a lista de planejadas do popup, as linhas dos dois
   modais de apontamentos), que tem altura fixa em px e não acomoda folga. Depois, os **10,5px** do
   `caption` no modo claro, que é onde o contraste some primeiro.
   00b. **Os quatro overlines escritos à mão encolheram sem decisão** (decisão pendente nº 6, mais o
   cabeçalho de dia do `WeekPlanningView`): 12px → 10,5px, contra os 10px do token. Se ficarem bem,
   a decisão nº 6 vira quase formalidade.
   00c. **Os 9 `text-body`** — é o degrau novo, e ele é **maior** que os rótulos em volta. Onde ele mais
   aparece é nos dois modais de conexão (Monday, Clockify) e no bloco OAuth do Zendesk. Ficando
   grande demais ao lado do formulário, o degrau certo é `text-sm` e o `text-body` recua para os
   callouts.

1. **Os dois tokens novos nos dois modos** — `--color-warning` no modo claro é o único valor desta
   rodada escolhido sem swatch de referência (L 0.62 / hue 75, por analogia com o âmbar de pausa).
   Conferir o "Parcial" e o aviso de reenvio do envio manual sobre fundo branco. E o `Badge` em
   `neutral` sobre `raised`: é a borda que o separa da linha, e é onde ela some primeiro.
   0b. **O chip de billable do `PlannedTaskItem` e as três pílulas do `TaskSendModal`** perderam o
   `rounded-full`; e o "Faltando: …" virou vermelho ao lado do "Parcial" âmbar. É a mudança mais
   visível do A4.

2. **Os dois modais de apontamentos** (Clockify e Monday) — saíram de janela cheia para 900 px, é a
   maior mudança de medida da rodada. Conferir se a grade de 4 colunas das linhas ainda respira.
3. **`ImportCalendarModal`** — foi para 900 px e o corpo virou linha flex; conferir se as duas
   colunas rolam **cada uma por si** e o cabeçalho `sticky` da semana gruda no lugar certo.
4. **`ExportModal`** — o `bodyClassName` passou de `""` para `"p-5"`. Antes o `p-5` chegava por
   herança silenciosa, então a intenção é a mesma; é o call site em que errar isso apareceria.
5. **`ImportZendeskModal`** — o `p-0` dele **passou a valer**. O corpo perdeu 20 px de padding que
   estava lá contra a intenção do código.
6. `EditTaskModal` no modo claro (o mais alto, e o único `md` que rola) e o `EditPlannedTaskModal`,
   onde os botões de agendamento viraram `Button` e ficaram 2 px mais baixos.
7. Em todos: **ESC não deve esconder a janela do app** — é o `data-modal-open` novo na casca.

---

## 7. Rodada 3 — composição de tela (2026-08-10)

Terceira tentativa de pixel perfect. As duas anteriores entregaram layout aproximado, e esta seção
existe porque a **causa é de método**, não de esforço.

### 7.1 Por que as rodadas 1 e 2 falharam

1. **Trabalhamos a partir de prosa.** As auditorias descreviam ("cabeçalho de seção em overline"), e
   prosa não tem número. O que não estava escrito em nenhum documento — fundo próprio do cabeçalho,
   régua inferior, grid de colunas fixas — nunca entrou em plano nenhum. Foi assim que a §5 passou a
   afirmar uma falsidade sobre o `SectionCard`.
2. **As travas nasceram depois da correção, para congelar o que já estava.** Por construção não
   podiam reprovar o que sobrou: `gap-4` onde o design pede 20px, chip à esquerda em vez de à
   direita, ação escondida no hover — tudo passa verde.
3. **Nenhuma fase olhou para composição.** A/B/C/D/E cobrem primitivo, escala, três correções
   pontuais, travas e o chip. Ordem de seção, anatomia do cartão e grid da linha não estão em
   nenhuma delas.

### 7.2 A causa estrutural que o censo revelou

Censo mecânico de `font-size` nas 7 telas do documento _Telas redesenhadas_:

| px no design | ocorrências | token                                                     |
| ------------ | ----------- | --------------------------------------------------------- |
| 12,25        | 92          | `text-sm` ✓                                               |
| 10           | 63          | `text-overline` ✓ (peso/tracking sobrescritos no chip)     |
| **9**        | **56**      | **não existia**                                           |
| **11**       | **40**      | **não existia**                                           |
| 10,5         | 38          | `text-xs` ✓                                               |
| 12           | 21          | `text-sm` (0,25px — aceito)                               |
| 14 / 17 / 20 | 14 / 9 / 7  | `text-body` / `text-metric` / `text-xl` ✓                 |
| **15**       | 2           | **não existia** (placeholder do omnibox)                  |

**96 ocorrências usam dois degraus que a escala fechada não tinha** — e o `fontSizes.test.ts` proíbe
escrevê-los inline, sem baseline nem exceção. A B1 reancorou `sm`/`xs` e criou `body`/`metric`, mas
não mediu que faltavam 9px (rótulo da sidebar) e 11px (todo o micro-mono: hora, contagem, total,
link, glifo do `?`). **Não é descuido acumulado: é a escala do micro-texto renderizando um degrau
errado em todas as telas** — a explicação mecânica do "quase certo".

Segundo achado: `grid-template-columns` aparece **17×** em três formas — `auto 1fr auto auto` (7),
`88px 1fr auto auto` (7), `auto 88px 1fr auto auto` (3). A linha de tarefa é **grid de colunas fixas
no sistema inteiro**. `TaskRow` ser flex é divergência sistêmica, não da tela 3a.

### 7.3 O mecanismo de garantia

1. **Spec mecânico versionado** — `scripts/extract-design-spec.mjs` lê os 5 documentos via MCP
   `DesignSync` e emite `docs/design-spec/*.json`: um nó por elemento, com toda propriedade
   geométrica (font-size, weight, line-height, color, padding, gap, radius, border, medida fixa,
   `grid-template-columns`, display). Protótipo validado em 2026-08-10 — produziu §7.2 e §7.4.
   **Toda decisão daqui em diante cita `spec[...]`, não prosa.**
2. **Trava escrita antes da correção** — `src/tests/conventions/screenGeometry.test.ts` renderiza o
   componente real com RTL, lê o `className`, resolve cada utilitário para px por uma tabela
   derivada de `index.css` + escala do Tailwind, e compara com o JSON. Mensagem:
   `esperado 10px · atual 8px · TaskRow.gap`. **Nasce vermelha**; cada etapa esverdeia sua fatia.
3. **Cobertura honesta** — a trava garante tudo que vem de classe ou token: tamanho, peso, cor,
   padding, gap, raio, borda, medida fixa, colunas do grid, presença e ordem dos nós. Todas as
   divergências de §7.4 vivem aí. Ela **não** vê layout de verdade (quebra de linha, overflow,
   subpixel, rasterização) — isso segue na inspeção visual 1100×700 nos 2 modos × 4 acentos.

**Playwright: autorizado pelo usuário em 2026-08-10**, explicitamente contra o veto por nome do
CLAUDE.md global da Aktie (§6, testes). Virou a bancada visual — ver F0.5, que fechou a lacuna
declarada aqui.

### 7.4 Deltas medidos da tela 3a

Só o que tem delta ≠ 0.

**`SectionCard`** — fundo da casca: nenhum (só borda + `overflow-hidden`) vs `bg-surface` no cartão
inteiro · fundo do cabeçalho: `surface` vs nenhum · régua sob o cabeçalho: `1px border-subtle` vs
ausente · padding do cabeçalho: 10/12 vs 16/12/8 · alinhamento: `center` vs `items-start` · gap: 8
vs 12 · contador: pílula própria (10px/600 mono, `bg-raised`, raio total, 2/6, lh 1.3) vs
concatenado no título · ação-link: 11px `accent-text` vs `text-sm text-fg-muted` · ação-total: 11px
mono `fg-secondary` vs `text-xs` mono `fg-muted`.

**`TaskRow`** — display: `grid` com as colunas do censo vs `flex` · gap: 10 (`gap-2.5`) vs 8 ·
padding: 10/12 (`py-2.5 px-3`) vs 10/16 · separador: `border-b border-subtle` (ausente na última) vs
nenhum · casca: full-bleed sem raio vs `rounded-control` + `gap-0.5` no container · ponto: 6px
(`w-1.5`) vs 8px · subtítulo: `mt-px` vs `mt-0.5` · chip billable: **coluna própria à direita** vs
colado ao título · duração: `text-sm` vs `text-xs` · ações: gap 2px / padding 4px vs gap 4px /
`p-1.5` · linha filha expandida: `bg-surface` (conferir no `TaskCard`).

**Cabeçalho e corpo** — `PageHeader` padding-x: 20 vs 16 · título: `Tarefas` 20/600 + contexto
inline 12,25 com timer mono `fg-secondary` vs saudação como título e subtítulo empilhado ·
`TourButton`: 22×22 (`size-5.5`) e glifo 11px vs 20×20 e 10,5px · gap do corpo: 20 (`gap-5`) vs 16 ·
ordem: Omnibox → **KPI** → Planejadas → Entradas vs Omnibox → **Planejadas** → KPI → Entradas.

**Omnibox / KPI / Sidebar** — faixa de chips padding-x: 12 vs 16 (desalinha 4px do botão play) ·
chip: 3/8 e 12,25px vs 2/8 e 10,5px · placeholder: 15px/500 vs 16px · KPI Non-billable valor: `fg`
vs `fg-secondary` · barra: `project-none` (0.55) vs `fg-muted` (0.60) · dica: o número em mono vs
tudo em sans · rótulo da sidebar: **9px**/500 lh 1 vs 12,25px (é o que corta "Integra…") · gap
ícone/rótulo: 4 vs 2.

**Exato, não tocar:** trilho de integrações (valor a valor), `TitleBar`, o resto do `KpiCard` (17px,
trilho 3px, todos os offsets), sidebar 68px / barra ativa 2px / paddings, tokens de cor, fontes,
raios, `p-5` do corpo.

### 7.5 Decisões do usuário — 2026-08-10

1. **Escala ganha três degraus.** `--text-nav` 9px (rótulo da sidebar), `--text-micro` 11px (mono
   curto, link, contagem, glifo do `?`), `--text-lead` 15px (placeholder do omnibox).
   `fontSizes.test.ts` passa a aceitar o conjunto de 10.
2. **Cabeçalho da Tarefas volta ao design** — `Tarefas` + saudação inline com o cronômetro.
3. **Ação↔duração no mesmo slot, revelada no hover, nas Entradas.** Nas Planejadas não há duração e
   o mock mostra o play nas três linhas: ali o play fica **sempre visível**. (O mock congelou uma
   linha filha em hover — daí a aparência de contradição.)
4. **`formatWeekTotal` segue o design:** valor compacto (`27h12`), dias na dica
   (`meta 40h · 4 dias`).
5. **`Ctrl K` fica fora** — o mock é anterior à remoção do command palette (`bcf09ff`). Exceção
   declarada; a trava não cobra a pílula.
6. **`WorkspaceSwitcher` permanece na sidebar** e o **teto de 176px das Planejadas permanece** — as
   duas divergem do mock e entram como exceções declaradas.
7. **O cabeçalho de seção tem uma medida só: 10/12.** O spec mostra **dois** paddings — 10/12 nas
   3a/3b e 8/12 nas 3c/3d/3e/3f — e a decisão foi que 10/12 é o padrão, **sem variação**: não há
   prop de tamanho no `SectionCard`, e o 8/12 das outras quatro telas é ruído do mock, não um
   segundo degrau a implementar. O mock discorda de si mesmo nesses cabeçalhos por mais de um eixo
   (gap 8 na 3a e 10 na 3c, contador como pílula na 3a e concatenado no título na 3c), e um prop de
   densidade congelaria essa discordância antes de a trava poder julgá-la.
8. **KPI e Planejadas dividem a linha do meio, e as Entradas ficam com a altura que sobra** —
   decidido **depois da F3**, contra a pilha do design, e medido na bancada antes de valer. Na pilha
   do mock as Entradas começavam a **476px** de um orçamento de 572: cabeçalho de seção e **1,1
   linha**. Pareadas, elas passam a **223px e 3,5 linhas** (sem planejadas, 332 e 5,5). O usuário
   fechou o arranjo em três pontos: (a) **sem planejadas, a faixa de KPI volta aos quatro em linha**,
   na largura toda — senão seriam quatro cartões em metade da tela, com 459px de vazio ao lado; (b)
   com 1 ou 2 planejadas, **quem governa a altura da fileira é o KPI**, e o vazio sob a lista fica;
   (c) o **teto das planejadas cai de 176 para 166px**, que é o que faz o cartão cheio terminar no
   mesmo nível do bloco de KPI — **206,16 nos dois lados**, medido.

   **O que se move são os números, não os nomes**, e é por isso que o par é KPI+Planejadas e não as
   duas listas lado a lado: a linha de Entradas carrega ~250px de coluna fixa em volta do nome
   (chevron, faixa de 88, chip, duração, quatro degraus), então em meia largura o nome cairia de 664
   para **185px** — ~30 caracteres, com o subtítulo truncando. O que encolhe de fato é o cartão de
   KPI, de 225,5 para **223,5**.

### 7.6 Etapas

Uma por sessão, como o resto da rodada (§0). `pnpm lint && pnpm test && pnpm build` + inspeção
visual 2 modos × 4 acentos ao fim de cada uma.

- **F0 · Spec + escala + trava** — ✅ **feita (2026-08-10)**. O que entrou:
  - `docs/design-spec/raw/telas-redesenhadas.html` — o export do Claude Design, versionado: é a
    entrada do extrator, e é o que torna o spec reproduzível sem MCP.
  - `scripts/extract-design-spec.mjs` → `docs/design-spec/telas-redesenhadas.json`: **7 telas, 920
    nós**, com toda propriedade geométrica normalizada em px. Sem dependência nova (tokenizador
    próprio, ~40 linhas — a entrada é gerada por máquina).
  - `src/index.css`: `--text-nav` (9px), `--text-micro` (11px), `--text-lead` (15px), com
    line-height. **Nenhum consumidor ainda** — token não usado não muda pixel nenhum, então esta
    etapa dispensa a inspeção visual nos 2 modos × 4 acentos.
  - `src/tests/helpers/tailwindGeometry.ts` — resolvedor classe→px, lendo a escala e os raios do
    próprio `index.css`. **Classe não classificada levanta**: ignorar por omissão é como as travas
    antigas ficaram verdes. Ele já pegou um defeito nele mesmo (peso lido como `500rem`).
  - `src/tests/helpers/designSpec.ts` — acesso ao JSON, ancorando **por texto** (`byText` exige
    unicidade) e por `path` onde o mock repete rótulo.
  - `src/tests/conventions/screenGeometry.test.tsx` — 22 assertivas na 3a: **7 verdes** (o
    `KpiCard` inteiro, altura e gap do cabeçalho, título de seção) e **15 `divergente(...)`**.
  - `designTokens.test.ts` e `fontSizes.test.ts` atualizados para a escala de 10 degraus.

  **A catraca:** `divergente` é `it.fails` — passa enquanto a assertiva reprova. Commitar 15 falhas
  soltas deixaria o CI vermelho por cinco sessões, e com ele vermelho ninguém distingue divergência
  conhecida de regressão nova. Corrigir o componente faz o `it.fails` reprovar, e a única saída é
  trocar `divergente` por `it`: **corrigir sem declarar é impossível, declarar sem corrigir
  também**. Verificado na F0 trocando o raio do `Badge` e conferindo que a assertiva passou a
  falhar. `divergente` que sobra é dívida visível; zero `divergente` é a tela fiel.

  **Cobertura declarada:** só os componentes que renderizam sem provider. `Sidebar`, `Omnibox` e a
  composição da `TasksPage` (ordem das seções, `gap` do corpo) **não estão cobertos** e entram nas
  etapas que já os tocam — F3, F4, F5.
- **F0.5 · Bancada visual (Playwright)** — ✅ **feita (2026-08-10)**. Fecha a lacuna que a F0
  declarou: o `screenGeometry` cobre o que vem de classe ou token, e **nada** do que só existe
  depois do layout.
  - `harness/` — página Vite que renderiza **um** primitivo por carregamento (`?case=`), com o
    `index.css` real e a largura que o mock dá a ele. Serve também como galeria manual.
  - `scripts/visual-check.mjs` → `pnpm visual`: abre o wireframe e a bancada no mesmo Chromium,
    resolve o nó do mock **pelo mesmo caminho** que o teste usa, e compara caixa renderizada,
    estilo computado e pixel (`pixelmatch`). Escreve `.visual/<caso>.{mock,app,diff}.png` e
    `relatorio.json` (git-ignored).
  - **Determinismo:** rede bloqueada e as duas pontas usando o **mesmo woff2 embutido**. Sem isso
    o mock busca a fonte no Google e a mesma execução dá números diferentes com a conexão ruim —
    ou cai na fonte de sistema e mede outra coisa.
  - **Só afirma o que o spec declara.** O browser computa tudo, então comparar a lista inteira
    compara herança: `font-size` herdado (o wireframe vive numa caixa de 14px, o app numa raiz de
    16 — é a decisão do PR 6.5, não regressão), `font-family` que difere só no fallback, e
    `display`/`gap`/`align-items` de filho de grid, que o CSS blocifica nos dois lados.
  - **Fora do `pnpm test` de propósito:** diff de pixel depende de fonte, browser e GPU; num gate
    obrigatório viraria a falha que todo mundo aprende a ignorar, e trava ignorada é pior que
    trava nenhuma.

  **O que ela achou de imediato, e que nenhuma outra trava veria:** o `KpiCard` tem **97,08px de
  altura contra 98** do mock **com todas as classes batendo** — vem dos line-heights, que a fase
  B1 registrou como "valores de partida, não medida do design"; o `Badge` tem **16,5 contra 20**; e
  a linha de tarefa, **53,22 contra 55**. O `gridTemplateColumns` do mock resolve para
  `14px 88px 666px 48px 56px` na linha de entrada — a coluna de 88px medida, não declarada.

- **F1 · `SectionCard`** — ✅ **feita (2026-08-10)**. Casca sem fundo, cabeçalho com fundo e régua,
  contador como pílula, slot de ação no degrau do spec. Toca as 7 telas.

  **O cabeçalho ficou exato: 38px no app contra 38px no mock**, e é a pílula do contador que governa
  a altura nos dois lados (10px × lh 1.3 = 13, mais 2+2 de padding = 17; mais 20 de padding do
  cabeçalho e 1 da régua). **A casca foi de 205,66 para 199,66**, contra os 204 do mock: o alvo
  `→ 204` da estimativa não era desta etapa, porque os 4,34px que faltam são as **três linhas**
  (53,22 no app contra 55/55/54 no mock — a última sem régua) e a linha é a F2.

  O que entrou:
  - Casca: `border` + `rounded-card` + `overflow-hidden`, **sem `bg-surface`** — as linhas passam a
    ficar sobre o canvas, e é isso que faz a faixa do cabeçalho aparecer como faixa.
  - Cabeçalho: `bg-surface`, `border-b`, `px-3 py-2.5`, `gap-2`, `items-center` — a medida da §7.5.7.
    Com `description` ele volta a `items-start`, que é o único caso que o design não desenha.
  - Contador: prop `count`, na pílula do spec (`rounded-full`, `bg-border-subtle`, 2/6, mono,
    `tabular-nums`). O `tracking-normal` é deliberado — `text-overline` é o único degrau de 10px da
    escala e carrega `0.1em` junto, que num número só abre um vão à direita. **O fundo é
    `bg-border-subtle`, e não o `bg-raised` que a §7.4 escreveu:** o valor medido é
    `oklch(0.26 0.033 257)`, que é `border-subtle` exato, e no modo claro o `raised` (0.967) seria
    quase invisível sobre o `surface` branco do cabeçalho. Onde prosa e JSON discordam, vale o JSON.
  - Slot de ação: `ml-auto` e **`text-micro` no primitivo** — as duas formas do design (o link em
    `accent-text`, o total em mono `fg-secondary`) deixam de carregar tamanho no call site.
  - **`bodyClassName`**, pelo mesmo motivo que o `Modal` tem: os quatro painéis de Dados punham
    `p-3 flex flex-col gap-3` na **casca**, o que agora insetaria a faixa do cabeçalho e deixaria a
    régua flutuando dentro do cartão. O padding mudou de lugar, não de valor (o `pt-0` de dois deles
    caiu — a faixa passou a dar o topo).
  - Duas quedas de contraste que a casca transparente causou, e que são correção da própria etapa,
    não melhoria fora de escopo: o painel de categorias do `ProjectCard` e a linha de workspace
    inativa eram `bg-canvas` **recuando** contra o `surface` do cartão; sobre o canvas viravam
    invisíveis, com só a borda de pé. Os dois subiram para `bg-surface`.
  - `screenGeometry`: os **quatro `divergente` do `SectionCard` viraram `it`**, e entraram **duas
    assertivas novas** — a pílula do contador (tamanho, peso, raio, padding) e o degrau de 11px do
    slot de ação, que a §7.4 media como delta e nenhuma assertiva cobria. O caso da bancada visual
    passou a levar `count={3}`, como o mock.
- **F2 · `TaskRow` como grid** — ✅ **feita (2026-08-10)**. As três formas do censo saem das próprias
  props, e a régua é uma só: **o que muda entre elas é o que precede o nome.**

  | Precede o nome | Colunas | Onde |
  | --- | --- | --- |
  | nada (só o ponto) | `auto 1fr auto auto` | Planejadas de hoje |
  | a faixa de 88px | `88px 1fr auto auto` | Histórico, Lançamento Manual |
  | chevron **e** faixa | `auto 88px 1fr auto auto` | Entradas de hoje |

  São **quatro literais** em `gridColumns()` (a quarta é a linha sem ponto e sem faixa) e não uma
  string montada: `grid-cols-[${...}]` o Tailwind não vê no código-fonte, e a linha cairia num
  `display:grid` sem colunas — que é flex mal desenhado. O build confirma os quatro utilitários
  emitidos.

  **O ponto de projeto muda de lugar, não de tamanho.** Ele abre coluna própria só quando nada o
  precede; com o chevron ou a faixa à frente, entra no bloco do nome (`flex gap-2`), que é o que o
  design desenha nas formas B e C. Sem isso, o nome começaria em lugares diferentes na mesma lista.

  Medidas, todas do spec: `gap-2.5` (10) · `px-3 py-2.5` (10/12) · `border-b border-border-subtle
  last:border-b-0` no lugar do `rounded-control` · ponto `w-1.5` (6) · subtítulo `mt-px` · duração
  em `text-sm` · ações em `gap-0.5` e padding 4px (`p-1` nos botões crus, `size="sm"` nos
  `IconButton`) · faixa de horário em `text-micro`, que é o degrau de 11px que a F0 criou.

  Quatro decisões que a etapa obrigou:

  - **Duração e ações dividem a última coluna, empilhadas** (`col-start-1 row-start-1`), e não
    trocadas por `hidden`. Empilhar guarda duas coisas: a largura da célula não pula quando o cursor
    entra, e o botão continua alcançável pelo teclado — `display:none` o tiraria da ordem de foco.
    O par de ações leva `pointer-events-none` em repouso, ou os botões invisíveis engoliriam o
    clique da linha em volta. **Sem duração, a ação fica sempre visível** (§7.5.3): é a Planejada.
  - **A régua é `last:border-b-0`, e por isso o `TaskGroupCard` deixou de ter casca.** Ele
    embrulhava linha e filhas num `<div>`, e ali o grupo **recolhido** era o último filho — perdia a
    régua no meio da lista. Como fragmento, o último elemento da lista é o último de verdade.
  - **A linha filha diz o pertencimento por trilho e degrau** — a prop `nested` do `TaskRow`, e não
    uma casca em volta. O trilho é um filete de 2px **fora do fluxo** (como a barra do item ativo da
    sidebar): não ocupa célula da grade, e filhas em sequência formam um filete só. O degrau é um
    padding a mais na própria linha (`pl-6` contra `pl-3`) — sai do `1fr` do nome, então **chip e
    duração continuam onde estão** nas linhas em volta e só a esquerda degraus.

    **O x do trilho é conta, não número:** `padding horizontal da linha + metade da coluna do
    chevron`, para ele descer pelo **eixo** da seta que abre o grupo. As duas parcelas moram juntas
    no topo do `TaskRow` e governam três coisas que têm de concordar — o padding, a largura
    reservada da coluna (que o primitivo aplica, para o call site não repetir a medida) e o x do
    trilho. O que o Tailwind não deixa derivar (`pl-3`/`pl-6` são literais, utilitário não lê
    variável) é `TaskRow.test.tsx` que amarra: ele compara o `left` do trilho com o padding que a
    classe **realmente rende** mais metade da coluna medida no DOM. **Verificado que reprova**, com
    sonda: `pl-3`→`pl-4` dá `esperado 23, atual 19`, e o ícone em 16 dá `esperado 20, atual 19`.

    > **Aqui o mock está errado, e a medida é o que prova.** Ele desenha um `<span></span>` vazio na
    > coluna do chevron da filha, que **reserva a coluna e não a largura**: medido em Chromium, a
    > faixa de 88px do grupo começa em x=174 e a das filhas em **x=160** — as filhas ficam 14px
    > **para fora**, que é pior que não ter recuo. O wireframe passa batido porque desenha um grupo
    > só; o app enfileira N. Por isso o `TaskCard` reserva a coluna em `w-3.5`, na largura do ícone
    > que a linha do grupo põe ali. **É divergência declarada**, e é por ela que não há caso de linha
    > aninhada na bancada: ele reprovaria para sempre por uma diferença que é correção.

    A primeira volta desta etapa seguiu o mock ao pé da letra — sem trilho e sem degrau — e o
    usuário reprovou na leitura (2026-08-10): o pertencimento tinha sumido. Trilho sozinho também
    não bastou. **A pilha foi fotografada nos dois modos** antes de fechar (grupo recolhido, grupo
    aberto com duas filhas, tarefa solta em seguida).
  - **O cartão do dia do Histórico parou de pintar fundo**, como a F1 fez com o `SectionCard` (o
    spec da 3b mostra a mesma anatomia: casca só com borda, faixa em `surface`). Não é melhoria fora
    de escopo: a linha em hover passou a ser `bg-surface`, e sobre um cartão `bg-surface` ela some.

  **Conteúdo que se moveu, e é o que fecha a fidelidade da 3a:** a coluna de 88px passou a responder
  *quantos* no grupo (`3 registros`, que era sufixo do subtítulo) e *quando* na tarefa solta e nas
  filhas (`13:30–13:48`, que não existia nas Entradas). A faixa virou `formatTimeRange` em
  `shared/utils/time.ts` — era o terceiro consumidor, e as três grafias divergiam (o Manual escrevia
  `09:12 – 11:00` com espaços, o Histórico escrevia `09:12–—` quando não havia fim). **A tarefa
  solta reserva a coluna do chevron e não leva trilho nem degrau** — ela é irmã do grupo, não filha,
  e é o mesmo `TaskCard` que desenha as duas.

  **A bancada visual mede as três formas em zero divergência de propriedade** — grade, gap, padding,
  régua, alinhamento e os dois degraus de texto batem valor a valor nas três. **O que resta é
  altura: 53,22 contra 55**, idêntico nas três, e o `SectionCard` fecha em 198,66 contra 204 —
  exatamente 3 × 1,78. É o line-height, não a linha: o mock não declara nenhum e herda o `normal` da
  Source Sans 3 (~1,42), enquanto `--text-sm`/`--text-xs` entraram na B1 com 1.35/1.4 declarados
  como "valores de partida". **Calibrá-los ficou fora da F2 por decisão do usuário** — são dois
  tokens globais que mudam todo texto de 10,5 e 12,25px do app, e isso é etapa própria, não efeito
  colateral da linha. Com isso a conta que a F1 deixou em aberto fecha inteira.

  Dois artefatos da bancada corrigidos junto, que mediam o fixture e não o componente: o caso era
  sempre `:last-child` (então media a linha *sem* régua, que é o oposto do nó do mock) e a ação era
  um `▶` de texto no lugar do glifo de 14px, que muda a largura da coluna que a comparação afirma.
- **F3 · `PageHeader` + `TasksPage`** — ✅ **feita (2026-08-10)**. O cabeçalho volta ao design e o
  corpo passa a ter a ordem e o degrau do spec.

  **O caso `page-header` é o primeiro fiel da bancada: 978×56 contra 978×56, zero divergência de
  propriedade, 0,47% de pixel** — e o que sobra é antialiasing de glifo mais o `?` de 22px, que é a
  F5. Foi preciso dar ao caso a saudação do mock: sem ela a bancada media um cabeçalho de título só.

  O que entrou:
  - **`px-4` → `px-5` no `PageHeader`** (20 do spec). Toca as 7 telas, e é o que põe o cabeçalho no
    mesmo eixo vertical do `p-5` do corpo — antes ele recuava 4px para dentro.
  - **`Tarefas` é o título, e a saudação virou `context`** (§7.5.2): `text-sm` em `fg-muted` com o
    total do dia em mono `fg-secondary` no meio da frase (`Boa tarde, Rafael · 05:48:40 hoje`). A
    saudação era o título — 20/600 — e o subtítulo (`No que iremos trabalhar hoje?`) saiu: no design
    o cabeçalho da tela tem uma linha só. O `tourId` continua `tasks-greeting`, e o passo continua
    verdadeiro: o cabeçalho ainda saúda.
  - **Corpo: `gap-4` → `gap-5`** e a ordem do spec — Omnibox → **KPI** → Planejadas → Entradas. Os
    passos do tour trocaram de lugar junto, ou ele desceria até as planejadas para voltar ao KPI.
  - **`Ver semana →` ligado ao Planejamento.** A prop `onNavigatePlanning` existia no
    `PlannedTasksSection` e **nunca chegava**, então o slot de ação que a F1 desenhou não
    renderizava. Quem faltava era o `setPage`: o `PageContent` recebia só a página, não o setter.
  - **`empty:hidden` no invólucro das planejadas.** Sem planejadas a seção devolve `null`, e o
    `<div data-tour>` vazio continuava sendo item do flex: cobrava um degrau de 20px no meio do
    corpo, entre o KPI e as Entradas. Com `gap-4` o buraco já existia, menor.

  **Depois da etapa, a composição do corpo mudou por decisão do usuário (§7.5.8):** KPI e Planejadas
  passaram a dividir a linha do meio e as Entradas a ficar com a altura que sobra, rolando por
  dentro. A ordem do design vale para as duas pontas — Omnibox abre, Entradas fecham — e o meio é
  exceção declarada. O que entrou junto:
  - `domain/utils/plannedPending.ts` — o filtro de pendentes do dia, que a tela agora usa para
    decidir **arranjo** e não só presença de lista. Escrito duas vezes, a lista some e o arranjo
    não. (Ele existe em mais quatro lugares — os dois overlays, o Lançamento Manual e a semana —,
    e unificá-los não é desta mudança.)
  - `TotalsSection` ganhou `layout`: `row` (os quatro em linha) e `grid` (2×2). É o único lugar onde
    o cartão de KPI muda de largura.
  - `TodayEntriesSection` virou a seção que cresce (`flex-1 min-h-0` na casca, rolagem no corpo). O
    invólucro dela leva um piso de 160px: sem ele, a janela apertada a encolheria até zero em vez de
    voltar a rolar o corpo. **Revertido em 2026-08-10, por decisão do usuário:** a seção passou a ter
    a altura do que lista — sem `flex-1`, sem rolagem por dentro e sem piso —, e quem rola com a
    lista longa é o corpo da página. Com poucas entradas não sobra mais caixa vazia embaixo.
  - Com o arranjo condicional, o `empty:hidden` da F3 saiu — a seção não é mais renderizada quando
    não há pendentes, então não há invólucro vazio cobrando degrau.
  - `harness/composicoes.tsx` + `harness/shot.mjs` — a bancada passou a montar **tela inteira**, no
    orçamento real (938×572), e a fotografar nos dois modos. É o que permitiu decidir por medida:
    a app não posa para a bancada porque as páginas montam contexto, banco e IPC.

  **A trava:** o `divergente` do padding do cabeçalho virou `it`, e entrou o bloco `TasksPage`, que
  fecha a lacuna que a F0 declarou (corpo e ordem das seções). Ele lê o **código-fonte** da página em
  vez de renderizá-la: a `TasksPage` monta contexto, banco e IPC do Tauri, e uma dúzia de mocks faria
  cada hook novo quebrar a trava com um erro que não fala de geometria. O que a fatia afirma está
  inteiro na classe do corpo e na ordem das tags — e o número continua vindo do JSON, inclusive a
  ordem, que sai do índice do nó dentro do corpo (`1/1/1/N`). **Verificado que reprova**, com sonda:
  `gap-4` dá `esperado 20, atual 16`, e trocar duas seções de lugar reprova a ordem. Com a §7.5.8, a
  assertiva de ordem passou a afirmar **as duas pontas pelo JSON** e o par do meio pela decisão — a
  exceção está escrita na própria assertiva, e é o que a impede de virar licença para reordenar.
- **F4 · Omnibox + `chipStyles` + `Badge`** — ✅ **feita (2026-08-10)**. As duas peças que o chip
  significa deixaram de ser a mesma: **o `Badge` rotula e é pílula; o chip do omnibox edita e é
  chip.**

  **O `Badge` é o segundo caso fiel da bancada: 48×20 contra 48×20, zero divergência de propriedade,
  0,00% de pixel.** `rounded-full` no lugar do `rounded-chip`, e o degrau de 10px em peso 500 —
  `text-overline tracking-normal font-medium leading-[1.4]`. O padding (2/6) já era o do spec. A
  entrelinha declarada é o que fecha os 20px: `leading-none` dava 16,5, e sem entrelinha própria a
  altura do chip passaria a depender do que ele herda da linha em volta. Toca **20 call sites em 13
  arquivos**, e o `BillableChip` acompanhou o raio no invólucro clicável.

  > O `rounded-chip` do `Badge` era decisão escrita na skill, com argumento ("o raio de chip é a
  > escala documentada"). O spec extraído mede 99px. **Onde prosa e JSON discordam, vale o JSON** —
  > é a mesma regra que a F1 aplicou ao fundo da pílula do contador, e a skill foi corrigida junto.

  - `chipStyles.ts`: `text-xs` → `text-sm` (12,25) e `py-0.5` → **`py-0.75`** (3px). O passo de 0,75
    é a escala, não valor arbitrário: no Tailwind v4 ele multiplica `--spacing`, e o build emite
    `.py-0\.75{padding-block:calc(var(--spacing) * .75)}`. Como o módulo é vocabulário compartilhado,
    o `OmniboxRunning` recebeu os 12,25px junto.
  - `OmniboxIdle`: a faixa de chips foi de `px-4` para **`px-3`** — são os 4px da §7.4, e é o que
    põe o primeiro chip no eixo do botão de play. O campo foi de `text-base!` para **`text-lead!`**,
    o degrau de 15px que a F0 criou e que até aqui **não tinha consumidor nenhum**.
  - **A trava passou a cobrir o omnibox**, que era a lacuna que a F0 declarou para esta etapa: seis
    assertivas sobre o componente **renderizado** (casca, linha do campo, botão de 40px, degrau do
    campo, faixa de chips, chip). Ele pede **um** provider — `useProjectCategoryMap`, que abre banco
    e escuta evento do Tauri —, e mockar o hook é uma linha; montar o contexto seria montar o app
    para medir um padding. **Verificado que reprova**, com sonda: `px-4` dá padding esquerdo 16
    contra 12, `text-base` dá 16 contra 15, e o chip antigo dá 10,5 contra 12,25. Os dois
    `divergente` do `Badge` viraram `it`; **sobra um na 3a**, o `TourButton`, que é a F5.
  - **Bancada:** dois casos novos (chip vazio e chip billable) e uma correção no comparador —
    `rounded-full` computa `calc(infinity * 1px)`, que o Chromium devolve como `3.35544e+07px`,
    contra os `99px` do mock. É a mesma normalização que o `radiusOf` do teste já fazia do outro
    lado; sem ela o badge **fiel** aparecia como divergente, que é o tipo de ruído que faz uma
    bancada perder credibilidade.

  **O que resta medido, e não é desta etapa:** os chips do omnibox fecham em **24,53 contra 26 de
  altura**, com todas as propriedades batendo. É o mesmo `--text-sm--line-height` (1.35 declarado
  contra o `normal` herdado do mock) que segura as linhas em 53,22 contra 55 desde a F2 — calibrar
  os dois tokens globais é etapa própria, por decisão do usuário.

  **Observação registrada, fora de escopo:** o `OmniboxRunning` tem `px-4 py-3` na linha principal
  contra o `px-3 py-3` do repouso, então o botão anda 4px quando a tarefa começa. **O mock não
  desenha o omnibox em execução em nenhuma das 7 telas**, então não há número para decidir — e sem
  número esta rodada não mexe.
- **F5 · Sidebar + `TourButton` + acertos finos do `KpiCard`** — inclui `formatWeekTotal`.
- **F6 · Fechamento** — exceções declaradas (§7.5.5, §7.5.6 e §7.5.8) na skill `design-system`
  (`.claude/skills/design-system/SKILL.md`, que é onde a §8.4 do CLAUDE.md passou a morar desde
  2026-08-10) e a trava estendida às outras 6 telas.
