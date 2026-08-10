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
minoria (6 contra 9) e não sobreviveu.

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

### Fase E · Produto — **precisa de confirmação do usuário antes de começar**

**E1 · Chip de billable escrito no `TaskRow`.** O design é explícito: _"A barra verde à esquerda
**sai** — o chip escrito assume"_, com pílula de 10px/500 dizendo "Billable"/"Non-billable". O
`TaskRow` fez o inverso: manteve a barra e não tem chip. Isso também derruba a regra de
acessibilidade do próprio handoff (_"cor nunca é o único sinal"_) — hoje a informação está só na
cor da faixa e no `title` do ponto.
**Não é fidelidade, é produto:** o CLAUDE.md §8.4 hoje documenta a faixa como contrato do
primitivo, e o clique que alterna billable mora no ponto de projeto — que precisaria de um novo
dono. Muda 5 telas. **Perguntar antes.**

> O A4 já entregou o **desenho** do chip (`Badge tone="billable"`, em uso no `PlannedTaskItem`), e
> com isso o que resta em E1 é só a decisão de produto: tirar a faixa do `TaskRow`, pôr o chip nas
> 5 telas e achar um dono para o clique que alterna billable.

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

**Verificação manual pendente** (nem as três sessões do A3, nem o A4, nem as fases B e C foram
conferidos na tela). Por ordem de risco:

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
