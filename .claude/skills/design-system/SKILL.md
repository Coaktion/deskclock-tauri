---
name: design-system
description: Fonte da verdade visual do DeskClock — tokens semânticos de cor, escala tipográfica de 10 degraus, raios, o contrato dos primitivos de components/ui/ e as regras obrigatórias de estilização. Use SEMPRE que a tarefa tocar aparência: componente novo ou alterado, classe Tailwind, cor, tamanho de fonte, espaçamento, raio, modal, overlay, chip, badge, ou qualquer coisa que apareça na tela. Use também ao revisar PR visual.
---

## Fonte da verdade visual

> **Corrigido em 2026-07-30.** Esta seção apontava para seis artefatos de uma migração de design
> system que **não existem no repositório**: `.claude/design-system/` (inteiro), `component-map.md`,
> `token-map.md`, `acceptance.md`, `findings.md` e `MIGRATION_GUIDE.md`. As regras que dependiam
> deles ficavam inexequíveis e travavam agentes na primeira mudança visual. Abaixo está o que
> existe de fato.

> **A rodada de fidelidade em curso está em `docs-internal/specs/design-system-fidelity.md`** — etapas,
> o que já foi feito, as decisões pendentes do usuário e as regras de processo que ela
> deliberadamente contraria (branch única, reviewer só no fim). Antes de qualquer mudança visual
> nova, conferir se ela não é uma etapa de lá.

- **Tokens semânticos:** o bloco `@theme static` de `src/index.css` declara a camada semântica —
  superfícies (`canvas`, `surface`, `raised`, `border-subtle`, `border`), texto (`fg`,
  `fg-secondary`, `fg-muted`), acento (`accent`, `accent-text`), status (`billable`, `paused`,
  `danger`), as 24 cores de projeto, três raios (`chip` 6 · `control` 8 · `card` 12) e **uma
  sombra**, `--shadow-overlay`. Deles saem
  utilitários normais do Tailwind: `bg-surface`, `text-fg-muted`, `border-border-subtle`,
  `rounded-card`. **É esta a paleta a usar em código novo.**

  > **`--shadow-overlay` é a única sombra com token, e é do painel que sobrepõe a página** —
  > hoje, a lista de planejadas do omnibox. Existe porque a sombra do Tailwind é preto
  > translúcido e, sobre um canvas de L 0.13, não pinta nada: medido na bancada, o painel e a
  > faixa de KPI atrás dele ficavam a **0,025 de lightness** um do outro. Subir um degrau de
  > superfície não resolve — `raised` já é o mais alto —, então a profundidade vem da sombra, e
  > ela é **preto a 0,85 no escuro e cinza da rampa a 0,28 no claro**, porque o mesmo preto
  > sobre branco vira borrão. O `shadow-lg` continua valendo para a lista curta do
  > `Autocomplete`.
  >
  > **Use `shadow-(--shadow-overlay)`, nunca `shadow-overlay`.** O utilitário que o `@theme`
  > gera **embute o valor** no CSS em vez de emitir `var(...)`, então a redefinição do bloco
  > `[data-mode="claro"]` não chega a ser lida — medido no Chromium. E como no escuro os dois
  > renderizam idêntico, só quem abrir o painel no modo claro vê o borrão.
  > `designTokens.test.ts` reprova a forma errada, que é justamente a que se escreve por
  > instinto.

  > `static` é obrigatório e não é enfeite: sem ele o Tailwind descarta o token que nenhum
  > utilitário referencia, e um token some do CSS gerado no dia em que a última tela deixa de
  > usá-lo. `src/tests/conventions/designTokens.test.ts` guarda a declaração de cada um — derrubar
  > um não gera erro, gera um `bg-surface` que não pinta nada.

- **Modo e acento são eixos separados:** `[data-mode="claro"]` troca as superfícies por uma paleta
  **própria**, não pela inversão da rampa; `[data-accent="verde"|"roxo"|"ambar"]` troca **só**
  `--accent-hue`, de que `--color-accent` e `--color-accent-text` derivam. Os dois blocos ficam
  **fora de `@layer`** de propósito: o `@theme` emite dentro de `@layer theme`, e regra sem layer
  vence regra em layer no cascade, qualquer que seja a especificidade.

  > **`applyAppearance` grava dois atributos**: `data-mode` e `data-accent`. O `data-theme` legado
  > saiu junto com o CSS que o lia — escrevê-lo agora seria um resto no DOM, e um resto que alguém
  > acabaria estilizando de novo.
  >
  > **A migração do `theme` acontece na leitura, eixo a eixo** (`resolveAppearance`), com vazio
  > significando "nunca escolhido": `azul`/`escuro`→`escuro+azul`, `verde`→`escuro+verde`,
  > `claro`→`claro+azul`. Nada é gravado na montagem, como em `resolveIntegrationWorkspaceId`
  > (§6.7). **O tema `escuro` não sobrevive** — ele trocava a rampa de cinza por zinc, e o modelo
  > de dois eixos não tem esse eixo; quem estava nele perde o tom.
  >
  > **A janela do toast não lê config nem banco** — a aparência viaja no payload de quem levantou
  > o toast (`showToast` → `readAppliedAppearance`). Era a única janela que não aplicava tema
  > nenhum, e ficava escura dentro do app claro. Dar-lhe um `ConfigProvider` custaria uma quinta
  > janela abrindo o banco no boot, que é justamente onde mora a corrida de migration já conhecida.
- **O tema legado acabou.** Os três `[data-theme="verde"|"escuro"|"claro"]` e as cópias
  `--tw-gray-*` saíram de `src/index.css`, e com eles a paleta crua deixou de ter qualquer papel:
  não há mais "tela não migrada". `bg-gray-800` hoje não é legado tolerado — é cinza fixo, que
  **parece certo no escuro e ignora modo e acento**, e é a regressão mais fácil de não notar. Dois
  testes de convenção guardam isso: `designTokens.test.ts` afirma que nem o seletor nem as cópias
  voltaram, e `meaningColors.test.ts` chegou a zero fora da paleta de workspace.

  > **A paleta de workspace é a exceção, e não é dívida.** `WorkspaceDot` continua escrevendo
  > `rose`, `amber`, `teal` e as demais por extenso: ali a cor é **entidade** — o usuário a escolhe
  > num seletor —, não significado. Um token de significado seria a tradução errada, e classe
  > montada em runtime (`bg-${slot}-500`) o Tailwind não vê. A lista curada vive em
  > `domain/utils/workspaceColor.ts`.

  > **`rounded-sm` sobrevive fora da escala de três raios**, em três lugares. Todos são marcas de
  > 2 a 8 px — o tique do checkbox, o traço do estado parcial, a barra da linha do tempo. Com o raio
  > de chip (6 px) elas viram bolhas: os três raios governam caixa, não micromarca. (Eram cinco: os
  > outros dois eram o retalho com que o rótulo **encaixado** apagava o trecho de borda por baixo de
  > si, e o rótulo saiu do entalhe.)
- **Famílias:** **Source Sans 3** (`--font-sans`) e **Source Code Pro** (`--font-mono`), a mesma
  superfamília — título e cronômetro têm o mesmo esqueleto. Vêm empacotadas: os woff2 saem dos
  pacotes `@fontsource-variable/*` e o `@font-face` é escrito à mão no topo de `src/index.css`,
  em latin e latin-ext, com `font-display: block`. **Nenhuma requisição de rede em runtime.**

  > Declarar `--font-sans` não gera só o utilitário `font-sans`: o Preflight do Tailwind deriva
  > dele o `--default-font-family` que aplica no `html`. É isso que troca a fonte do app inteiro
  > sem tocar em componente nenhum — e é isso que se perde ao derrubar o token, devolvendo tudo
  > para a stack de sistema sem nada denunciando. A stack continua na lista, como **segundo**
  > item: rede para o quadro anterior ao carregamento, não mais a fonte de fato.
  >
  > O `@font-face` é próprio, e não o CSS dos pacotes, por três divergências: eles usam
  > `font-display: swap` (que faria a fonte saltar de lugar nas cinco janelas), nomeiam a família
  > "… Variable" e trazem sete subsets, dos quais cinco esta app nunca usa.

- **Três pesos, e 600 é o teto:** 400 para texto lido, 500 para o que é clicável ou numérico, 600
  para título, cabeçalho de seção e overline. **Nada acima disso** — em 12px sobre fundo escuro o
  700 engorda o texto sem criar hierarquia; o que separa título de corpo é tamanho e cor. O
  intervalo declarado no `@font-face` é o da escala, não o da fonte (200–900), então um
  `font-bold` esquecido renderiza como 600 — e, por não se ver na tela, é
  `src/tests/conventions/fontWeights.test.ts` que o denuncia.

- **Todo número é `font-mono` + `tabular-nums`** — duração, hora, contagem, percentual, inclusive
  dentro de modal. É o que impede o cronômetro de tremer a cada segundo e o que alinha as colunas
  das listas.

- **A raiz é 16 px, e é constante.** Ela não cresceu o app — parou de encolhê-lo: os três raios
  (`0.375` · `0.5` · `0.75rem`) só rendem os **6 · 8 · 12** desenhados em raiz 16, o `h-14` do
  `PageHeader` só mede os 56 px que esta seção afirma em raiz 16, e o ritmo do design (4 · 8 · 12 ·
  16 · 24 · 32) é a escala padrão do Tailwind, que também é rem. Em raiz 14 tudo isso rendia 12,5%
  menor, e daí vinham os `text-[10.5px]` escritos à mão. **Consequência aceita:** no Tailwind v4 o
  espaçamento também é rem, então padding, gap e larguras crescem junto — `--spacing` **não** é
  reancorado para compensar.

- **A escala tipográfica é um conjunto fechado de dez degraus**, e o décimo primeiro é exceção
  declarada:

  | Papel | Utilitário | px | Peso |
  |---|---|---|---|
  | `title/page` | `text-xl` | 20 | 600 — um por página, no `PageHeader` |
  | `mono/tempo` | `text-metric` | 17 | valor de KPI e cronômetro |
  | `title/section` | `text-base` | 16 | 600 — cabeçalho de `SectionCard` |
  | `lead` | `text-lead` | 15 | 500 — o campo do omnibox, e só ele |
  | `body` | `text-body` | 14 | 400 — prosa que se lê em parágrafo |
  | `body/ui` | `text-sm` | 12,25 | 400, ou 500 se clicável ou numérico |
  | `micro` | `text-micro` | 11 | mono curto, link e glifo — ver abaixo |
  | `caption` | `text-xs` | 10,5 | 400 — metadado de linha |
  | `overline` | `text-overline` | 10 | 600, `0.1em` |
  | `nav` | `text-nav` | 9 | 500, entrelinha 1 — o rótulo da sidebar |
  | `display/timer` | `text-2xl` | 24 | cronômetro da tarefa em execução |

  > **Os três últimos degraus a nascer — `nav`, `micro` e `lead` — vieram de medida, não de
  > gosto.** O censo de `font-size` das 7 telas do design achou **96 ocorrências** em dois
  > tamanhos que a escala fechada não tinha: 9px em 56 lugares (o rótulo da sidebar, que em 12,25
  > cortava "Integra…" nos 68px da coluna) e 11px em 40 (todo o micro-mono — faixa de horário,
  > contagem, total do dia, o slot de ação do `SectionCard`, o glifo do `?`), mais 15px em 2 (o
  > placeholder do omnibox). O `fontSizes.test.ts` proibia escrevê-los inline e não havia token
  > para pôr no lugar: **era a escala do micro-texto renderizando um degrau errado em todas as
  > telas**, e é a explicação mecânica do "quase certo" que duas rodadas de fidelidade não
  > fecharam.
  >
  > `micro` e `caption` diferem em meio pixel e mesmo assim são papéis distintos: `caption` é
  > frase subordinada que se lê (subtítulo, dica, validação), `micro` é dado curto ou controle que
  > não se lê como frase — número em mono, um link de duas palavras, um glifo. Na dúvida entre os
  > dois, pergunte se aquilo é uma frase.

  > **Quatro dos degraus são reancorados nos px do design, e dois deles sobrescrevem o Tailwind.**
  > O design especifica a escala sobre uma raiz de **14**; a raiz daqui é 16, escolhida porque é
  > nela que raio, cabeçalho de 56 px, toggle 40×20 e a escala de ícones caem nos valores que o
  > mesmo design pede em px. Enquanto os dois lados conviveram, tudo o que era rem cresceu 14% e
  > tudo o que era px ficou parado — e é esse descompasso, não um acúmulo de descuidos, que produzia
  > a sensação de "quase certo": a proporção interna de cada componente quebrava, o layout geral
  > não. Reancorar **só** os tokens de tamanho de fonte separa as duas coisas. Raiz, `--spacing`,
  > raios e ícones **ficam onde estão** — quem encontrar `--text-sm` fora do valor do Tailwind não
  > está diante de um engano. `designTokens.test.ts` afirma os quatro valores, porque um
  > `pnpm update` que devolvesse o padrão não quebraria build, teste nem tela: desfaria a
  > reancoragem inteira em silêncio.
  >
  > **`body` e `body/ui` não são o mesmo papel.** `body/ui` é o texto que o app usa para operar —
  > nome de tarefa, pílula, botão, campo, rótulo de campo, item de menu, aba, linha de lista. `body`
  > é o parágrafo que se lê: passo a passo de conexão, callout de ajuda, changelog, o aviso do
  > modal de exclusão. A régua entre eles é se o texto acompanha um controle ou se ele **é** o
  > conteúdo. Anotação subordinada a outro elemento — subtítulo, contador, timestamp, dica de uma
  > linha sob um controle, mensagem de validação — é `caption`, e continua em `text-xs`.

  **O overline tem token próprio** (`--text-overline` e seus dois modificadores) porque 10 px não
  existe na escala do Tailwind e é o único degrau que carrega peso e tracking junto — sem token ele
  volta como `text-[10px] font-semibold tracking-wider` copiado de outra tela, que é como as três
  variantes anteriores nasceram. `uppercase` continua na classe: é transformação, não tamanho.

  **Tamanho em px arbitrário não existe mais** — as 176 ocorrências foram convertidas de uma vez e
  `src/tests/conventions/fontSizes.test.ts` falha em qualquer `text-[…]` novo, sem baseline: um
  resto congelado recriaria a dívida que a varredura fecha. Ficam de fora, por dimensionarem
  **glifo** e não texto, o `⚠` do `App.tsx` e a inicial do avatar em `GeralTab`.

  > **O overlay compacto é exceção declarada à régua da escala**, e não um resto por migrar. A
  > janela tem 78 px, e o que ela escreve é **um número monoespaçado** — o cronômetro e o contador
  > de planejadas —, nunca texto lido. Ali `text-xs` é o cronômetro no estado apertado e
  > `text-base` é o contador, medidas escolhidas contra o diâmetro do botão, e não contra a
  > hierarquia de leitura das telas. A régua `body/ui` vs. `caption` não tem o que dizer sobre um
  > glifo que ocupa a janela inteira; aplicá-la ali encolheria o cronômetro para 10,5 px numa peça
  > que existe justamente para ser lida de relance.

- **Ritmo:** padding de página **`p-5`**, linha de lista **`py-2.5 px-3`** (o `TaskRow`), e valores
  de espaçamento fechados em 1 / 2 / 3 / 4 / 6 / 8. Fora disso, pare e pergunte (§"Zero hardcode
  visual").

- **Ícone tem três tamanhos: 14 · 16 · 18.** Eram nove, com `size={13}` liderando em 85 usos — e a
  diferença entre 13 e 14 não se vê, só se acumula em ícones que não alinham entre listas. **Os
  overlays entraram na regra, e a decisão foi consciente**: o popup tem 264 px úteis e usava 30
  ícones de 11 px, então subir para 14 muda a densidade do flyout. Foi escolha do usuário em
  2026-08-08, contra o alerta de que a verificação manual estava pendente. Fica **de fora** o
  `size` do `WorkspaceDot`, que é diâmetro do ponto em px e não tamanho de glifo.
- **Paleta de cores de entidade:** `src/domain/utils/workspaceColor.ts` define a lista curada de
  slots usada para colorir workspaces, junto com a justificativa de cada exclusão.
  `shared/utils/projectColor.ts` devolve **`var(--color-project-N)`**, não um hex: o retorno vai em
  `style={{ backgroundColor }}`, onde a variável resolve como qualquer outra — e é isso que faz a
  cor do projeto acompanhar o modo claro sem uma segunda tabela.

  > **São 24 cores de projeto, atribuídas e não sorteadas, e os valores saem de um gerador.**
  > `scripts/generate-project-palette.mjs` os emite; **não os edite à mão**. Eram 6, com a cor
  > vindo de `hash(id) % 6`, e o modelo tinha dois defeitos independentes. O primeiro é
  > aritmética: com 60 projetos cada cor carregava ~10 deles, e duas linhas na mesma tela
  > coincidiam em 98% dos casos — sorteio não conserta isso em paleta de nenhum tamanho, porque
  > é o problema do aniversário. Quem conserta é o `color_index` persistido no projeto (§4.3 do
  > modelo de dados), que dá a cada projeto novo o menor slot livre do workspace. O segundo é que
  > **metade da paleta estava fora do gamut sRGB**: os 6 tokens pediam `C 0.16` em hues que não
  > alcançam isso — o ciano de `hue 200` pedia 44% acima do máximo — e o navegador os
  > dessaturava calado, então verde, âmbar e ciano renderizavam lavados sem que nada
  > denunciasse.
  >
  > **A regra "mesma lightness e chroma, só o hue muda" foi revertida, e é reversão declarada.**
  > Em 24 cores, mantê-la custaria 26% da separação perceptual (0,076 contra 0,095 de menor
  > distância OKLab), o que deixaria a paleta **pior** que a de 6. Então chroma varia de 0,07 a
  > 0,17 e L de 0,472 a 0,672: ponto vivo e ponto lavado convivem na mesma lista, e o vivo puxa
  > mais o olho. É o preço de 24 cores distinguíveis num ponto de 6px, escolhido pelo usuário em
  > 2026-08-11 com o número na mão.
  >
  > **Duas propriedades sustentam a tabela única**, e `designTokens.test.ts` afirma as duas por
  > cálculo, além de reprovar par com menos de 0,09 de distância: toda cor está dentro do sRGB, e
  > toda cor contrasta **≥3:1 com os dois canvas**. É a segunda que dispensa o bloco de modo
  > claro, e é por ela que o L varia por hue — no mesmo L, verde e âmbar carregam muito mais
  > luminância que azul e sumiriam sobre branco.
  >
  > **A ordem dos slots não é decorativa.** Ela é *farthest-point-first*, e os slots são
  > consumidos por ordem de criação: um workspace com 4 projetos usa os 4 primeiros, que estão
  > separados por 0,231 em vez dos 0,095 do conjunto completo.
  >
  > **O que 24 cores não resolvem, e nenhuma paleta resolve:** com 60 projetos o ponto não
  > identifica projeto. Discriminar dois pontos lado a lado é uma coisa; olhar um ponto e saber
  > qual projeto é, outra — essa é categórica, e as pessoas nomeiam ~11 cores. Em todos os
  > lugares onde a cor aparece o **nome está junto**, e é ele que identifica; a cor agrupa.
- **Primitivos canônicos:** `src/presentation/components/ui/` — `Button`, `IconButton`,
  `Input`, `Select`, `Textarea`, `SegmentedControl`, `TourButton`, `Toggle`, `KpiCard`, `TaskRow`,
  `FilterPill`, `Badge`, `BillableChip`, `SearchInput`, `Field`, `Modal`, `PageHeader` e
  `SectionCard` (com `SectionRow`).
  Cada um existe porque a mesma coisa estava
  escrita em duas ou três versões que discordavam entre si. **Código novo usa estes**; as versões
  antigas seguem em pé enquanto as telas não migram, e são apagadas ao migrar o último consumidor
  de cada uma — foi assim que `components/SearchInput.tsx`, o `ToggleRow`/`SettingsCard`/`CardRow`
  do `SettingsShared`, o `Toggle` de `integrations/shared`, o `integrationButtonClass`, o
  `settingsInputClass`, o `fieldControlClass`, o `fieldClass`, o `bareInputClass`, o entalhe
  (`notchedBoxClass`/`notchedLabelClass`) e o rótulo flutuante
  (`floatingFieldClass`/`floatingLabelClass`) saíram. Ao lado deles fica um vocabulário de classe,
  não componente: `components/chipStyles.ts` (os chips de atributo do omnibox) e
  `components/fieldStyles.ts`, que depois da migração dos campos guarda só a caixa **sem rótulo**
  (`boxClass`), o `fieldLabelClass` e a casca da coluna de formulário.

  > **O que o `Button` trava é a caixa, não a cor.** As cinco variantes saíram de uma contagem dos
  > call sites, não de um catálogo: `primary` (acento cheio), `accent` (acento suave), `secondary`
  > (fundo `raised` + borda — o antigo `integrationButtonClass`), `ghost` (texto) e `danger` (texto
  > em `danger`).
  >
  > **Existiu uma `outline`** — só borda, sem fundo — que era o mesmo secundário escrito de outro
  > jeito no cabeçalho do Histórico. Foi colapsada em `secondary` por decisão do usuário. A conta a
  > pagar apareceu no botão "Filtros", cujo estado ligado *era* o fundo `raised`: com um secundário
  > só, ligado e desligado ficariam idênticos, e ele passou a alternar entre `accent` e `secondary`
  > — que é a mesma língua do `FilterPill` aceso.
  >
  > Três coisas moram no primitivo porque escritas à mão divergiam em silêncio: `type="button"`
  > (sem ele, dentro de um `<form>` o botão de alternância vira submit, §8.2), o `font-medium` que
  > a §8.4 manda em tudo que é clicável, e o par `loading` — spinner **e** `disabled`, que os
  > botões de envio repetiam separados, deixando clicável o que já estava enviando. O `primary`
  > leva `border border-transparent` para ter a mesma altura do `secondary` ao lado.
  >
  > `ghost` e `danger` **não** recebem o padding do `size`: são texto puro dentro das barras de
  > seleção, que alinham por `gap` — com caixa, a barra cresceria.
  >
  > `expanded` vira `aria-expanded`, e é o que faz o botão que abre um bloco anunciar o estado: o
  > chevron só o diz a quem enxerga.
  >
  > No `IconButton` a cor é o **destino** da ação, não o repouso: todos nascem `fg-muted` e é o
  > hover que diz se aquilo edita (`accent`), navega (`neutral`) ou apaga (`danger`). O `title` é
  > obrigatório porque é o nome acessível — sem texto, é a única coisa que o botão anuncia.
  >
  > **`Input`, `Select` e `Textarea` compartilham uma casca só** (`ui/controlStyles.ts`), e o que
  > eles travam é a **forma**: `boxed` desenha a própria caixa; `bare` abre mão dela para o `Field`
  > (ou o `boxClass`) em volta; `plain` não desenha casca **nem padding**, para o campo que mora
  > numa **linha** que já espaçou — o nome do usuário em Configurações, a linha "adicionar" das
  > listas, o editor de renomear. `bare` e `plain` não são o mesmo: o `bare` está numa caixa que traça a borda
  > e não espaça nada, então é ele quem espaça. `plain` é também o escape para o controle cuja casca
  > não é a do formulário (a borda em acento do editor inline), e o único que espera classes de cor
  > vindas de fora.
  >
  > Dois tamanhos, `sm` e `md`, e **a diferença entre eles é densidade, nunca tamanho de texto**:
  > campo é `body/ui` nos dois casos, e o que muda é o quanto a casca respira em volta. O `sm` é o
  > dos formulários densos (a coluna do Planejamento, o popup de 264 px). Enquanto ele foi um degrau
  > menor de fonte, o mesmo formulário lia em dois tamanhos dependendo da largura da coluna em que
  > caísse.
  >
  > **O padding é 12/7 no `md` e 10/7 no `sm`**, medida a medida do spec (telas 3d e 3e), e a
  > densidade é **só lateral**: o eixo vertical é o mesmo nos dois, que é como o design os mede — o
  > que a coluna estreita economiza é largura. Os 7px saem da escala como `py-1.75`, o mesmo passo
  > fracionário do `py-0.75` do `chipStyles`: no Tailwind v4 ele multiplica `--spacing`, e o build
  > emite o utilitário.
  >
  > **O rótulo é overline de 10px acima da caixa, e quem o escreve é o `Field`.** Havia quatro
  > grafias para a mesma coisa — o entalhe na borda (como componente e copiado em classes), o rótulo
  > flutuante dos campos personalizados e o `<label>` solto em `body/ui` —, e o entalhe cobrava caro:
  > `mt-1.5` no fluxo para o rótulo caber acima da borda, `<div>` de embrulho para esse `mt` não
  > substituir a margem do `space-y-*` do pai, e **`pt-3` em todo controle de dentro** para o texto
  > não subir sobre o rótulo. Nada disso existe mais. O `Field` é bloco `flex flex-col gap-1`,
  > rótulo no degrau `overline`, caixa por baixo — e o controle dentro dela é `bare`.
  >
  > **`className` veste o bloco, `boxClassName` veste a caixa**, pelo mesmo motivo que o `Modal` tem
  > `bodyClassName`: `flex-1` é lugar na linha e `items-center` é arranjo de quem divide a caixa com
  > o controle, e uma prop só mandaria os dois para o mesmo elemento. `fieldLabelClass` está
  > exportado em `fieldStyles.ts` por **um** call site — o "Período" da exportação, cujo rótulo veste
  > um par de botões seguido de duas datas, e não um controle que caiba numa caixa.
  >
  > **A coluna de formulário tem 280px e padding 12** (`FORM_COLUMN_WIDTH.default`,
  > `formColumnClass`), medida do spec, e o cabeçalho dela usa o **mesmo eixo x** do corpo — em 10
  > contra 12 o rótulo da coluna ficaria para dentro dos campos. O padrão é declarado **num lugar
  > só**: `ConfigContext` lê `FORM_COLUMN_WIDTH.default` em vez de teclar o número, porque
  > `useResizablePanel` só cai no `defaultSize` quando o gravado é 0 — e a config nunca devolve 0,
  > devolve o `DEFAULTS` dela. Enquanto os dois estiveram escritos à mão, o de baixo é que abria a
  > tela e o de cima é que a trava afirmava.
  >
  > **Nas duas colunas de formulário todo campo tem rótulo**, como os specs da 3e e da 3f desenham.
  > Elas eram só placeholder, com o argumento de que o rótulo faria a coluna alternar texto e caixa
  > a cada linha — mas metade já tinha rótulo, no entalhe, então o que existia era a alternância
  > entre dois desenhos de campo. O placeholder ficou, dizendo o **formato** (`Buscar projeto…`,
  > `HH:MM`); o rótulo diz **o que é**.
  >
  > **Caixa, rádio e faixa não são `Input`, e a assinatura os recusa** — `type` os exclui por tipo.
  > Não têm casca, fundo nem raio; vesti-los com o vocabulário de campo os quebraria. Um `Checkbox`
  > canônico, se valer, é trabalho próprio. Fora dos modais, é só isso que resta de `<input>` cru.
  >
  > Duas coisas moram no primitivo porque escritas à mão divergiam em silêncio: o `autoComplete="off"`
  > que a §8.2 exige (o teste de convenção o cobrava linha a linha; agora vem de graça) e o par
  > `disabled:opacity-50` + `disabled:cursor-not-allowed`, que metade dos campos tinha e metade não.
  >
  > **O `Select` é o que tirou o último cinza fixo do `index.css`.** A seta era uma regra global com
  > o traço em `#6b7280` cravado dentro de um data-URI — cinza que nenhum token alcança, porque
  > variável CSS não atravessa a fronteira de um data-URI. Como ícone Lucide ela lê `text-fg-muted`
  > e entra na escala de 14 px. Sobrou na folha global só o `color-scheme`, que governa a pintura do
  > popup **nativo**. A migração foi tudo-ou-nada: metade migrada com a regra de pé desenharia duas
  > setas. No `Select`, `className` vai no **invólucro** — é ele que ocupa o lugar na linha, e a
  > largura dada ao campo deixaria a seta pendurada fora dele.
  >
  > **O `Autocomplete` perdeu o `inputClassName`** e ganhou `variant`/`size`. Aquela prop
  > **substituía** o visual inteiro do campo: cinco call sites passavam a mesma constante e um sexto
  > reescreveu a classe à mão, que foi como o campo do popup perdeu o tamanho de fonte dos demais.
  >
  > **O `SegmentedControl` não é um grupo de `FilterPill`**: aqui as opções são duas ou três,
  > sempre visíveis, e uma **está sempre** escolhida — não existe o "nenhum filtro aplicado" que a
  > pílula expressa. Eram cinco cópias à mão nas integrações, e elas já divergiam: as do Google
  > tinham perdido o `font-medium` que as do `AutoSyncControls` mantinham.
  >
  > **O que separa o `Badge` do `FilterPill` é o clique, não o desenho.** O `Badge` é rótulo curto
  > que **não** responde — "Billable", "Enviado", "já existe", o nome de uma tag —, e eram 15 grafias
  > distintas para isso, em duas famílias de raio e cinco de cor. **Ele é pílula** — `rounded-full`,
  > 10px em peso 500, padding 2/6 e `leading-[1.4]`, medida a medida do spec (`1/1/1/2/1/2` da tela
  > 3a). Nasceu em `rounded-chip` pelo argumento de que o raio de chip era a escala documentada aqui;
  > o spec extraído mostrou 99px, e o número desempata prosa. O `tracking-normal` e a entrelinha
  > declarada são deliberados: `text-overline` é o único degrau de 10px da escala e carrega `0.1em`
  > e peso 600 junto, e sem entrelinha própria a altura do chip dependeria do que ele herda da linha
  > em volta. **Todo badge tem borda** — a direção de cor é "definida por borda", e sem ela o tom
  > neutro sobre `raised` não se separa da linha.
  >
  > **Os chips do omnibox não são `Badge`, e o vocabulário deles é outro**: `chipStyles.ts` é o
  > controle que se clica para editar um atributo do rascunho — raio de chip (6), `body/ui` (12,25px)
  > e padding 3/8, também do spec (`1/1/1/0/1/*`). Badge e chip do omnibox coincidirem em cor não os
  > torna a mesma peça: um rotula, o outro edita.
  >
  > Seis tons, tirados de uma contagem dos call sites: `neutral`, `billable`, `success`, `accent`,
  > `warning` e `danger`. `billable` e `success` **compartilham o verde e mesmo assim são tons
  > separados** — coincidem na cor, não no significado. No envio manual, `danger` é o grupo com dado
  > faltando (que desabilita a seleção: é impedimento) e `warning` é o "Parcial" (que não impede
  > nada); antes eram laranja e amarelo crus, dois vizinhos que ninguém sabia distinguir.
  >
  > **Número dentro de badge vai por `className`**, não por prop: `font-mono tabular-nums` não
  > colide com nada da base, e uma prop `mono` seria a segunda forma de escrever a mesma coisa.
  >
  > **O `TourButton` não é um `IconButton`**: o glifo é texto (`?`), não ícone, e a caixa é um
  > círculo de medida fixa, não o padding de uma escala. Ele vivia privado dentro do `PageHeader` e
  > estava copiado caractere por caractere nos cabeçalhos de Google, Zendesk e Clockify.
  >
  > **O `Modal` é a casca canônica de todo diálogo, e cobre 18 dos 19.** Havia quatro véus e cinco
  > larguras: o véu é **`bg-canvas/82`** e **não tem desfoque** (em janela de 1100 px ele custa
  > quadro e não separa nada que a opacidade já não separe), e o token importa — escrito como preto
  > translúcido ele fica igual nos dois modos, escurecendo o modo claro em vez de recuá-lo. Quatro
  > larguras, **em px porque são medida de janela e não ritmo de espaçamento**: `sm 360` · `md 460`
  > · `lg 720` · `xl 900`. Cabeçalho de **48 px de mínimo** (não de altura: com `description` são
  > duas linhas), título 14/600, X à direita, **sempre** com borda inferior; corpo `p-5` rolando a
  > partir de 60vh; rodapé de **52 px** com as ações à direita e a secundária sem casca — **nunca
  > dois botões cheios lado a lado**, que não dizem qual é a ação principal.
  >
  > Quatro encaixes existem porque o conteúdo que os ocupa **não pode rolar** com a lista: a
  > `toolbar` (filtros, abas) fica entre cabeçalho e corpo, ou rolaria junto com o que ela filtra; o
  > `notice` fica logo acima das ações, ou sumiria de vista justamente ao descrever o que acabou de
  > acontecer; o `footerStart` é o canto esquerdo do rodapé ("Todas"/"Nenhuma" é controle da lista,
  > não ação do diálogo); e o `headerEnd` é o canto direito do cabeçalho (o ↻ dos dois modais de
  > apontamentos, o total de horas do Monday) — está no cabeçalho, e não na `toolbar`, porque age
  > sobre o diálogo inteiro em vez de recortar a lista. `tall` dá ao corpo a janela toda menos a
  > margem do véu: eram `80vh`, `85vh` e um `90vh` em `style` de linha, três medidas para a mesma
  > intenção.
  >
  > **Três coisas moram na casca porque escritas à mão divergiam em silêncio.** O ESC, que sete
  > modais chamavam por conta (§8.2). O **`data-modal-open`**, que impede o ESC de esconder a
  > **janela do app**: o listener de `useGlobalShortcuts` é do `document` e roda **antes** do
  > `useEscapeToClose`, que é da `window`, então o modal sem o atributo fecha o app em vez de si
  > mesmo — só três telas o tinham. E o **`p-5` do corpo, que mora no valor padrão de
  > `bodyClassName`** e não na classe fixa: a prop substitui, não soma, e `p-0` é emitido **antes**
  > de `p-5` na folha — quem passava `p-0` para tirar padding continuava com ele. Por isso quem só
  > quer arranjo escreve o `p-5` junto (`"p-5 flex flex-col gap-4"`).
  >
  > **O `SetupModal` é o único fora, e é deliberado:** fundo opaco, sem véu, sem X e sem para onde
  > fechar — é a janela da primeira execução, não um diálogo. Era o único fora ao lado do
  > `CommandPalette`, que não cabia na casca (abria encostado no alto, sem cabeçalho, rodapé nem
  > título) e foi **removido** em vez de migrado (§5.1). Com ele saiu o último véu com desfoque:
  > **não há mais scrim fora desta casca.** O `backdrop-blur` que resta é um só, e não é véu — é o
  > cabeçalho `sticky` da semana no `ImportCalendarModal`, que borra o conteúdo rolando por baixo.
  >
  > **Cabeçalho recolhível não virou primitivo único**, porque são duas famílias e não uma. O
  > chevron **à direita** é cabeçalho de seção, e tem dois donos: o `SubSection` das integrações
  > (que ganhou `onOpen` — o gancho de quem só busca dados quando alguém olha, e cuja falta fazia a
  > seção de Mapeamentos do Clockify reimplementar o cabeçalho inteiro à mão) e o `MappingBox`
  > local daquele arquivo. O chevron **à esquerda** é só um `Button variant="ghost"` com ícone.
  >
  > **Sobram seis `<button>` literais** em Integrações e nas páginas, de 68 que eram, e cada um é a
  > definição única de um componente (`SubSection`, `MappingBox`, `IntegrationTile`) ou um caso que
  > nenhum primitivo expressa: a alça de arraste (`cursor-grab`), o ▶ do Lançamento Manual (cuja
  > cor em repouso muda com a planejada ter horário) e o "Lançar N com horário" (ghost em acento,
  > um call site só).

  > **A caixa mora no primitivo, e `componentPrimitives.test.ts` é o que impede a dívida de
  > voltar.** Os outros testes desta pasta travam **token** — reprovam cor crua, `text-[13px]`,
  > `font-bold` — e nenhum deles reprova um botão escrito à mão com tokens perfeitamente válidos.
  > Era assim que 131 `<button>` com `className` literal chegaram a **73** strings de classe
  > distintas, 47 usadas uma vez só. O teste afirma o componente: `<button>` que carrega padding
  > **mais** raio está reescrevendo `Button`/`IconButton`, e `<input>`/`<select>`/`<textarea>` cru
  > está reescrevendo `controlStyles`.
  >
  > **`components/ui/` é a única isenção por caminho**, nas duas listas: é lá que a caixa é
  > *definida*; em qualquer outro lugar ela é cópia. O baseline é per-arquivo e falha nos **dois**
  > sentidos, como `meaningColors` — descer sem atualizar a lista deixa folga onde a próxima
  > regressão se esconde. Ele nasce em **121** botões (44 arquivos) e **6** campos crus (3), medido
  > ao fim da fase C: é dívida a pagar, não permissão, e o piso não é zero — o toggle de billable
  > dos três modais de edição fica (o estado ligado **é** a cor do significado, e no `IconButton` a
  > cor é o destino do hover) e os três primitivos locais acima. **O `PlannedTaskItem` saiu da
  > lista** — os cinco botões dele viraram `IconButton` quando a linha migrou para `TaskRow`.
  >
  > Duas coisas que o número não conta, e é melhor saber antes de comemorá-lo: `className` montada
  > numa constante fora da tag escapa do regex, então **121 é piso**; e os seis campos crus são
  > `<input>` de texto e hora nos dois modais de apontamentos e no `SetupModal`, todos escrevendo à
  > mão a casca que `Input size="sm"` traz pronta — a redução mais barata que resta.
  >
  > O parser de tag e o apagador de comentário vivem em `tests/helpers/jsxTags.ts`, comuns a este
  > teste e ao do `autoComplete`. Apagar comentário não é preciosismo: sem isso o JSDoc que **cita**
  > um `<select>` conta como um, e — pior — o bloco comentado sai da varredura exatamente no dia em
  > que alguém o comenta, que é quando ele deixa de ser dívida a cobrar.

  > **O trilho do `KpiCard` é desenhado sempre, mesmo sem `barPct`** — é ele que mantém os quatro
  > cartões do Histórico da mesma altura, e dois deles ("Total" e "Registros") não têm percentual
  > nenhum a mostrar. Condicionar o trilho ao valor encolhia esses dois em 7 px e desalinhava a
  > fileira. Sem `barPct`, o trilho fica vazio; o que a prop governa é o **preenchimento**.
  >
  > **O `SearchInput` foca com anel de 3 px** (`focus:ring-[3px] ring-accent/15`) somado à borda de
  > acento, e é o único campo do app que o tem. Ele mora acima de uma lista que se reordena a cada
  > tecla, e ali a troca de cor da borda sozinha some no meio do movimento.

  > **A janela principal abre em 1100×700**, e não mais em 800×620. Foi o que fez as abas caberem
  > no cabeçalho de 56 px: descontados a sidebar (68 px) e o rail (52 px), 800 px deixavam 648 px
  > úteis e as seis abas de Configurações mais o título e o botão Manual pediam ~690 — que com a
  > raiz de 16 px passaram a pedir ~790. A medida vive em dois lugares que **precisam concordar** —
  > `main` em `tauri.conf.json` e `MAIN_WINDOW_SIZE` em `useStartupWindow`, de onde sai o canto
  > calculado por `positionNearTaskbar`. Divergindo, a janela nasce fora da área útil.

  > **As sete telas têm o mesmo cabeçalho de 56 px** (`PageHeader`), e a altura fixa é o ponto:
  > eram quatro alturas e três tamanhos de título, então trocar de tela pela sidebar mexia tudo o
  > que vinha abaixo. O `data-tour` fica na **casca** do header — apontado para dentro, o tour
  > destacaria só o título, e são quatro tours que dependem disso.
  >
  > **O título é `text-xl`**, o degrau `title/page` da escala. Ele nasceu em `text-base` e ficou
  > lá até depois da reancoragem, o que o deixava do tamanho exato do cabeçalho de `SectionCard`
  > — dois níveis de hierarquia escritos na mesma medida. O pior caso de largura é Configurações
  > (título + seis abas + "Manual"): ~730 px dos 948 úteis de uma janela de 1100.
  >
  > **Toda tela tem título, inclusive as de navegação por data.** Planejamento e Lançamento Manual
  > nasceram sem — o argumento era que o intervalo e o dia navegados já identificam a tela, e que o
  > título roubaria largura de um cabeçalho disputado. Foi rejeitado: o título é parte da
  > padronização, e cabeçalho sem ele quebra o mesmo alinhamento que o `PageHeader` existe para
  > garantir. O bloco do título leva `shrink-0` para não ser ele o que trunca quando o `context`
  > cresce. A prop `title` segue opcional pelos testes do primitivo, não porque haja tela sem.
  >
  > **A data por extenso saiu do Lançamento Manual** ("Terça, 5 de agosto de 2026"), e com ela as
  > tabelas de nomes de dia e mês que só a serviam. O seletor de data ao lado já diz que dia é.
  >
  > **No Histórico as pílulas de período ficam numa linha própria, abaixo.** As cinco mais
  > "Filtros" e "Exportar" não cabem nos 56 px sem quebrar em duas linhas, e aí a altura fixa
  > deixaria de valer justamente na tela que a migração usa de referência.

  > **No Histórico o full-bleed deu lugar a um cartão por dia**, com o corpo da tela em `p-5` e as
  > entradas como `TaskRow`. Era a tela com **dois** `grid-template-columns` de linha — um para o
  > `selectMode`, outro fora dele —, e é o `TaskRow` que os dispensa: a caixa de seleção entra em
  > `leading` e a faixa de horário em `meta`, e a grade sai das próprias props, sem segundo layout a
  > manter em sincronia. O ponto passa a carregar a **cor do projeto**, a mesma da linha do tempo e
  > da distribuição logo acima, e quem diz o faturamento é o chip escrito (§ abaixo).
  >
  > **O cartão do dia não pinta fundo**, como a casca do `SectionCard`: quem pinta é a faixa do
  > cabeçalho, e as linhas ficam sobre o canvas. Com fundo próprio, a linha em hover — que é
  > `surface` — ficaria invisível sobre o cartão.
  >
  > **O cartão do dia é o `SectionCard`, e não mais uma cópia dele.** Ele nasceu escrito à mão por
  > um motivo só: o cabeçalho do dia era `sticky`, e o `overflow-hidden` da casca o teria prendido
  > ao topo do próprio cartão — o oposto do que `sticky` existe para fazer. **O `sticky` saiu**
  > (decisão do usuário, 2026-08-12) e com ele o motivo; a cópia foi apagada. O que a adoção
  > fechou, além da duplicata: a faixa era 8/12 e passou aos **10/12** do spec, o título saiu de
  > `fg-secondary` para o `fg-muted` que o spec pede, e o total do dia saiu de `text-xs` para o
  > degrau de 11px que o slot de `action` já carrega. A trava `divergente` de 3b virou `it`.
  >
  > **A caixa que seleciona o dia inteiro mora no slot `leading`**, à esquerda do título, e
  > substituiu o botão de texto "Selecionar"/"Desmarcar" do canto direito. Ela cai na mesma coluna
  > vertical das caixas das linhas que controla — a faixa e o `TaskRow` compartilham o `px-3` —, e
  > é isso que a torna o controle daquelas linhas em vez de um botão solto no cabeçalho. Estado
  > parcial por `ref`/`indeterminate`, como no `SelectionBar`: sem ele, o dia com metade das linhas
  > marcadas lê como dia sem nada marcado. **É divergência declarada do wireframe** — o nó
  > `1/1/1/3/0` da 3b desenha um span de texto "Selecionar", não uma caixa —, escolhida pelo
  > usuário em 2026-08-12 pela consistência com a seleção por linha, que já era caixa.
  >
  > **O Planejamento tem a mesma caixa, no mesmo slot**, e pela mesma razão: o cartão do dia lá já
  > era `SectionCard`, e o "Selecionar"/"Desmarcar" dele dividia o canto direito com a pílula de
  > concluídas — dois papéis num encaixe só, e o comando das linhas longe da coluna que ele
  > comanda. **O `action` ficou com a pílula sozinha**, sem o invólucro que existia só para pôr os
  > dois lado a lado.
  >
  > **A caixa tem uma grafia só no app inteiro** — `selectionBoxClass`, em
  > `components/selectionStyles.ts`, ao lado de `chipStyles.ts` e `fieldStyles.ts` como vocabulário
  > de classe. Eram quatro cópias das mesmas classes em quatro ordens (Histórico, Planejamento,
  > o cabeçalho de grupo de Tarefas e o Lançamento Manual), e **duas sem o `shrink-0`** que a
  > coluna de largura fixa do `TaskRow` pede — a caixa que encolhe deixa de cair na coluna do
  > cartão que a comanda, que é a única coisa que a torna o controle daquelas linhas. Não é um
  > `Checkbox` canônico: caixa, rádio e faixa não têm casca, fundo nem raio, e o primitivo, se
  > valer, é trabalho próprio.

  > **Em Dados e Configurações as abas moram no cabeçalho** (`PageHeader.tabs`) e o conteúdo é uma
  > **coluna de 720 px centrada**, dentro de um corpo em `p-5`. Configurações era `max-w-xl` (576),
  > Dados era largura cheia em `p-5` — trocar de aba mudava a medida da linha de leitura no mesmo
  > app. É a única tela de leitura que não usa a largura toda, e de propósito: linha de
  > configuração é rótulo à esquerda e controle à direita, e esticá-la separa os dois pelo vazio.
  > **As abas ficam coladas ao título** (`ml-2`, gap 6) e o `ml-auto` é das **ações** — enquanto os
  > dois dividiram o mesmo grupo, as abas herdavam o gap dele e atravessavam o cabeçalho.
  >
  > **A lista de Dados tem uma anatomia só, nas quatro abas** (spec da 3c): a busca fica **fora**
  > do cartão, na coluna; a **faixa de seleção é o cabeçalho** do `SectionCard` — caixa em
  > `leading`, contador na pílula, rótulo e "Excluir selecionados" em `action` —; a linha é faixa
  > de borda a borda (`px-3 py-2.5`, gap 10, régua pelo `divide-y`, hover `bg-surface`, ponto de
  > 6px) e nunca pílula; e a **linha que cadastra é uma linha da lista** (`ui/AddRow`), não um
  > bloco tracejado acima dela. A **importação em massa é ação do cabeçalho da página**, não do
  > painel.
  >
  > **A lista rola por dentro do cartão, e é divergência declarada do mock** (decisão do usuário,
  > 2026-08-14): o cartão para na altura da coluna (`min-h-0` na casca e no corpo,
  > `overflow-y-auto` nas linhas, `shrink-0` no rodapé), e com isso o "adicionar" e a faixa de
  > seleção ficam **sempre visíveis**. No design a lista cresce sem fim, e ali cadastrar custa
  > rolar o catálogo inteiro — o custo cresce com ele. Com poucos itens o cartão tem a altura do
  > conteúdo, como o mock desenha.
  >
  > **Cada grupo é um `SectionCard` com nome**, e é o nome que dispensa a explicação: "Comportamento",
  > "Duração", "Jornada", "Janelas" dizem o que a lista de chaves não dizia. `divided` desenha a
  > linha entre as `SectionRow`; sem ele o cartão é caixa só, para conteúdo que já tem estrutura
  > própria. O cabeçalho aparece com **título ou descrição** — a descrição sozinha basta, que é o
  > caso de Workspaces e Campos personalizados.
  >
  > **A casca do `SectionCard` não pinta fundo, e o cabeçalho é uma faixa.** Casca: borda,
  > `rounded-card` e `overflow-hidden`, nada mais — o conteúdo fica sobre o canvas, e é isso que
  > faz a faixa aparecer como faixa. Cabeçalho: `bg-surface`, `border-b`, `px-3 py-2.5`, `gap-2`,
  > `items-center` — **uma medida só, 10/12**, medida na tela 3a; o 8/12 que o spec mostra nas
  > outras quatro telas é ruído do mock, não um segundo degrau (o mesmo mock discorda de si em gap
  > e em contador). Com `description` o alinhamento volta a `items-start`, que é o único caso que o
  > design não desenha. O contador é a prop `count`, na pílula de `rounded-full` +
  > `bg-border-subtle` + 2/6, em mono e 10px com `tracking-normal` — o `text-overline` é o único
  > degrau de 10px e o `0.1em` dele abre um vão à direita de um número só. O slot de `action`
  > carrega o degrau de 11px (`text-micro`), então o call site passa só cor e família: `accent-text`
  > no link, mono `fg-secondary` no total do dia.
  >
  > **Padding e arranjo do corpo vão em `bodyClassName`, nunca em `className`** — pelo mesmo motivo
  > que no `Modal`. Na casca, o padding inseta a faixa do cabeçalho e deixa a régua flutuando dentro
  > do cartão.
  >
  > **O cabeçalho tem dois encaixes, e o lado importa.** `action` é o canto direito — o total do
  > dia, o atalho "Ver semana" —, e `leading` é a esquerda do título, para o controle que age sobre
  > as linhas de dentro (a caixa de seleção do dia, no Histórico e no Planejamento). `leading`
  > sozinho já levanta o cabeçalho, como `description`: sendo controle, sem cabeçalho ele sumiria
  > calado. **Não sobrou
  > nenhum call site fora da casca** — o cartão do dia do Histórico era o último, e a razão dele
  > (cabeçalho `sticky`) deixou de existir.

  > **Toda linha de tarefa é o `TaskRow`, e sobrou uma.** Tarefas, Planejamento, Lançamento Manual e
  > Integrações passaram aos tokens de uma vez, e com elas caíram as cópias de linha que ainda
  > existiam: o `TaskCard`, o cabeçalho de grupo do `TaskGroupCard` e a linha privada do Lançamento
  > Manual (que se chamava `TaskRow` e colidia de nome com o primitivo) hoje são o mesmo componente.
  > A `duration` virou **opcional** para a linha que não mede tempo — a planejada de hoje na tela de
  > Tarefas —, e o `SectionCard` ganhou `action`, o canto direito do cabeçalho onde moram o total do
  > dia e o atalho "Ver semana".
  >
  > **A linha é uma grade de colunas fixas, e a régua é uma só: o que muda entre as formas é o que
  > precede o nome.** Nada além do ponto → `auto 1fr auto auto`; a faixa de 88px → `88px 1fr auto
  > auto`; chevron **e** faixa → `auto 88px 1fr auto auto`. O `TaskRow` as deriva de `leading` e
  > `meta`, e os literais estão em `gridColumns()` porque `grid-cols-[${...}]` montada em template
  > string o Tailwind não vê no código-fonte — a linha cairia num `display:grid` sem colunas. **O
  > ponto muda de lugar, não de tamanho:** ele só abre coluna própria quando nada o precede; com
  > chevron ou faixa à frente ele entra no bloco do nome, ou o nome começaria em lugares diferentes
  > na mesma lista.
  >
  > **A linha é faixa, não pílula:** de borda a borda, sem raio, fechada por `border-b` com
  > `last:border-b-0` — por isso o contêiner da lista não põe `padding` nem `gap`, e por isso o
  > `TaskGroupCard` é fragmento e não casca (embrulhado, o grupo recolhido virava o último filho e
  > perdia a régua no meio da lista).
  >
  > **A linha filha diz o pertencimento pela prop `nested`, nunca por casca em volta** — trilho de
  > 2px fora do fluxo mais um degrau de padding (`pl-6` contra `pl-3`) na própria linha. O degrau
  > sai do `1fr` do nome, então chip e duração ficam onde estão nas linhas em volta e só a esquerda
  > degraus; o trilho, fora do fluxo, não vira célula da grade.
  >
  > **O x do trilho é conta, não número** — `padding da linha + metade da coluna do chevron` —,
  > porque ele desce pelo **eixo** da seta que abre o grupo. As duas parcelas moram juntas no topo
  > do `TaskRow`, e é o primitivo que aplica a largura da coluna, inclusive quando ela está vazia:
  > vazia de verdade ela mede 0, e a faixa de horário da filha sobe 14px à esquerda da faixa do
  > grupo — que é o que o wireframe faz, medido, e é desalinhamento e não recuo. Divergir dele aqui
  > é deliberado, e `TaskRow.test.tsx` amarra a conta ao que a classe de padding realmente rende.
  >
  > **Duração e ações dividem a última coluna**, empilhadas por `col-start-1 row-start-1`: a duração
  > recua no hover e as ações entram no lugar dela. Empilhar em vez de trocar por `hidden` guarda a
  > largura da célula (que senão pularia com o cursor) e o acesso pelo teclado; em repouso as ações
  > levam `pointer-events-none`, ou os botões invisíveis engoliriam o clique da linha. **Sem
  > duração, a ação fica sempre visível** — é a linha planejada de hoje, que tem **uma** ação.
  >
  > **Com cinco ações, quem some é a largura, e é a prop `collapseActions`.** A linha do
  > Planejamento tem play, editar, concluir, duplicar e excluir: deixada sempre visível, a coluna
  > delas sai do `1fr` do nome, que trunca numa linha vazia à direita (§5.3). O `w-0` +
  > `overflow-hidden` que vivia no `PlannedTaskItem` passou a morar aqui, e é por isso que ele
  > **deixou de ser exceção** — a linha do Planejamento é o `TaskRow`, na forma de quatro colunas
  > com o ponto de projeto, como o spec da 3e desenha.
  >
  > Duas props nasceram com essa migração, e as duas existem porque o `<p>` do nome **trunca**:
  > `titleMarks` põe recorrência e sino **ao lado** do nome (dentro dele, o glifo seria o primeiro
  > a sumir num nome longo), e `completed` risca e apaga o nome — o `opacity-50` de linha inteira
  > que a tela usava **não** subiu junto, porque é a decisão pendente nº3 do handoff (contraste
  > perto de 2:1) e o par tachado + `fg-muted` é justamente o que ela prescreve.
  >
  > **O faturamento é escrito, não pintado** (`BillableChip`). A faixa verde à esquerda do `TaskRow`
  > **saiu**: ela dizia "faturável" só em cor, e nada dizia sobre o não faturável — que ficava sem
  > faixa, indistinguível da linha que ninguém classificou. Agora as duas linhas trazem o chip, com
  > o texto por extenso, e a cor volta a ser reforço em vez de legenda. É o mesmo chip que o
  > `PlannedTaskItem` já usava; ter o par de rótulos escrito em dois lugares era o começo de duas
  > redações.
  >
  > **O chip é o dono do clique que alterna** (§5.2). Ele morava no **ponto de projeto**, que assim
  > pintava uma coisa e alternava outra — e, sem faixa, seria a única forma de descobrir o
  > faturamento de uma linha. Com o dono certo, o ponto voltou a ser cor de projeto e nada mais:
  > `onDotClick`/`dotTitle` saíram do primitivo, e ele não desenha mais `<button>` nenhum ali.
  >
  > **Clicável, o chip não é um `Badge`** — é um `<button>` vestindo um. A fronteira do `Badge` é
  > justamente não responder ao clique, e furá-la com um `onClick` opcional apagaria a régua que
  > decide entre ele, o `FilterPill` e o `Button`. O botão para a propagação: a linha em volta é
  > clicável no Histórico e no Lançamento Manual (selecionar) e no grupo de Tarefas (expandir), e
  > alternar o faturamento também as acionaria.
  >
  > **`billable` ausente é a linha calando sobre faturamento**, não "não faturável": a planejada de
  > hoje, o grupo, a entrada do Histórico — todas informam, e é por isso que o padrão saiu de
  > `false`. Um `false` implícito escreveria "Non-billable" sobre uma linha que nunca foi
  > classificada.
  >
  > **O mesmo chip é o controle dos formulários** — o `$` sozinho saiu. Ele era ícone **sem
  > rótulo**, então dizia o estado só pela cor (aceso = faturável), a mesma falha que a faixa da
  > linha tinha; e com a janela em 1100 px (§ acima) não há mais o aperto de largura que justificava
  > abreviar. São 11 call sites em 5 grafias, e a divergência tinha passado de tamanho: dois
  > escreviam em português ("Faturável"/"Não-faturável", nos apontamentos do Clockify e do Monday) e
  > um abreviava ("Bill."/"Non.", no `CategoryCard`). **A redação é do primitivo**, e é o que impede
  > a sexta grafia. Com isso saiu o `ToggleBillable`, que era o chip escrito de novo, com ícone e em
  > outra medida.
  >
  > **Num formulário o chip nunca fica sozinho na linha** (decisão do usuário, 2026-08-10): ele é o
  > sufixo da caixa da categoria, que é onde já moram os cinco — e é onde ele pertence, porque é a
  > categoria que define o padrão (§6.2) e o ajuste manual é do mesmo campo. Foi o `EditGroupModal`
  > que se moveu: lá a categoria era campo solto e o billable era um controle de altura cheia numa
  > linha só dele. Onde não existe caixa de campo — os editores de linha dos dois modais de
  > apontamentos, a linha "adicionar" das categorias, a tarefa em execução do popup — o chip fica na
  > fileira de controles que já existe.
  >
  > **No cabeçalho de grupo o chip continua sendo o da primeira tarefa**, e continua podendo mentir:
  > o agrupamento é Nome + Projeto + Categoria (§6.3) e **não** inclui `billable`, então um grupo
  > misto mostra o de uma só. Era assim com a faixa; escrito, o desacerto fica visível — resolvê-lo
  > é decisão de produto, não desta migração.
  >
  > **Estado de execução é o acento, não o verde.** O omnibox rodando ganha borda e cronômetro em
  > `accent` e, pausado, em `paused` — mesma escolha do anel do overlay, que lê `var(--color-accent)`
  > desde o PR 3. O verde ficou sendo só `billable`, que é o que ele significa.
  >
  > **Sucesso e aviso ganharam token** (`--color-success`, `--color-warning`), e o que sobra é
  > aplicá-los. O sucesso repete o verde de `billable` e mesmo assim é token próprio: hora faturável
  > e "deu certo" coincidem na cor, não no significado, e enquanto dividiam o mesmo nome mexer num
  > mexia no outro. O aviso é vizinho da pausa e **não** é ela — mais amarelo (hue 85 contra 70), ou
  > o aviso leria como tarefa pausada na mesma tela; e no modo claro desce de L 0.78 para 0.62, pela
  > mesma razão que o âmbar de pausa desce. Aplicados no `Badge` e no `TaskSendModal`; **o resto do
  > `amber-*`/`yellow-*` cru continua em pé** — banners de aviso, toast, `AtalhosTab`,
  > `MondayProjectsImport` —, e a substituição é o que resta da dívida. Fora dela ficam a paleta de
  > workspace e os quatro status do Zendesk, que são **cor de entidade**.
  >
  > Botão primário preenchido usa `text-white` sobre `bg-accent`
  > pelo mesmo buraco: não há token de texto sobre acento (`accent-text` é o acento claro, ilegível
  > sobre ele). **É o único `text-white` que sobra**: onde ele estava sobre superfície comum — três
  > `hover:text-white` e dois botões neutros — o texto sumia no modo claro, e virou `text-fg`.

  > **A escala de três degraus colapsa pares, e é isso que a tradução tem de vigiar.** Seis tons de
  > cinza de texto viram três tokens, então `gray-400` envolvendo um `gray-200` — o padrão de
  > ênfase "rótulo: **valor**" — cai nos dois no mesmo token e a ênfase some sem erro nenhum. A
  > régua é **100/200 → `fg`**, 300/400 → `fg-secondary`, 500+ → `fg-muted`.
  >
  > O mesmo vale para hover: `bg-blue-600 hover:bg-blue-500` e `text-gray-400 hover:text-gray-200`
  > colapsam em `X hover:X`, um hover que não faz nada. Num botão cheio o degrau vira
  > **`hover:opacity-90`** (com `transition`, que `transition-colors` não anima); num de texto, o
  > tom seguinte da escala. Eram **96** desses no fim do PR 8 — 10 herdados do PR 7 e 86 criados
  > pela varredura — e o custo de achá-los foi zero: um script compara as classes base e as `hover:`
  > da mesma linha. Vale repetir a checagem em qualquer varredura de cor futura.
  >
  > Três arquivos que ninguém importava desde o commit do omnibox foram apagados aqui
  > (`RunningTaskSection`, `RunningTaskEditForm`, `BulkImportTextarea`): cada varredura desta migração
  > os reescrevia. A moldura — `Sidebar`, `TitleBar`, `WorkspaceSwitcher` e a casca do `App` — entrou
  > junto por aparecer em **todas** as telas, embora não estivesse em nenhum PR do plano.
- **A geometria é travada contra o design medido, não contra prosa.**
  `scripts/extract-design-spec.mjs` lê o wireframe versionado
  (`docs-internal/design-spec/raw/telas-redesenhadas.html`) e emite `docs-internal/design-spec/*.json`: um nó por
  elemento, com toda propriedade geométrica em px. `src/tests/conventions/screenGeometry.test.tsx`
  renderiza o componente real, resolve cada utilitário do Tailwind para px e compara com o JSON.
  **Toda decisão visual cita `spec[...]`; onde prosa e JSON discordam, vale o JSON** — foi assim
  que o raio do `Badge` e o fundo da pílula do contador se decidiram, contra o que esta skill
  afirmava.

  > **`divergente(...)` é `it.fails`**, e é a catraca: passa **enquanto** a assertiva reprova.
  > Corrigir o componente faz o `it.fails` reprovar, e a única saída é trocar `divergente` por
  > `it` — corrigir sem declarar é impossível, e declarar sem corrigir também. `divergente` que
  > sobra é dívida medida e visível, nunca licença para deixar assertiva vermelha em paz.
  >
  > O que a trava **não** vê é layout de verdade — quebra de linha, overflow, subpixel. Isso é a
  > bancada visual (`pnpm visual`), que compara componente e wireframe em Chromium, e a inspeção
  > em 1100×700 nos 2 modos × 4 acentos.

- **Três lugares em que a tela diverge do mock de propósito.** São **exceções declaradas**, e
  não dívida por pagar: `screenGeometry.test.tsx` não as cobra, e quem for "corrigi-las" está
  desfazendo decisão tomada. Fora destas três, divergir do spec extraído
  (`docs-internal/design-spec/*.json`) é defeito.

  - **A tela de Tarefas não desenha o bloco de planejadas** (o nó `1/1/1/2` da 3a). As planejadas
    pendentes do dia são a **lista suspensa do omnibox**, que abre ao focar o campo, filtra pelo
    que se digita e inicia a tarefa ao clique. Decisão do usuário, 2026-08-19. O que a troca
    comprou é vertical: a linha do meio cai de **206,16px** (KPI em 2×2 ao lado da lista) para a
    fileira de quatro em largura cheia, e as Entradas passam de 213px para ~322px. **A faixa de
    KPI em linha é a do design**, então a trava a cobra pelo JSON, e a ordem das seções deixou de
    ser afirmada só pelas pontas: descontado o nó ausente, página e design coincidem inteiros.

    > **A anatomia do painel:** recuado 8px de cada lado do card (`left-2 right-2`) e 8px abaixo
    > dele, em `bg-raised` com borda `border-subtle` e `shadow-(--shadow-overlay)`. O recuo não é
    > enfeite — coincidindo com a coluna da página, o painel lê como mais uma seção dela. O teto
    > da lista é **236px**: quatro linhas cheias (53,22 cada, 212 no total, medidas em Chromium)
    > mais 24px da quinta, e é a meia-linha que diz que a lista continua.

    > **Revoga duas exceções anteriores**, ambas de 2026-08-10: o pareamento KPI+Planejadas na
    > linha do meio e o teto de 166px da lista de planejadas. Não procure por elas — saíram com o
    > bloco.
  - **O `WorkspaceSwitcher` fica na sidebar.** O mock não desenha o seletor, e é por isso que a
    trava o mocka para `null` ao medir a nav: o que ela compara é o nó do spec, não uma versão
    amputada dele.
  - **Não há pílula de `Ctrl K` no omnibox.** O mock é anterior à remoção do command palette
    (`bcf09ff`); a feature não existe mais.

- **Cor de significado só por token.** `billable`, `paused` e `danger` — nunca `emerald`, `green`,
  `rose` ou `red`. O que ainda resta está congelado em
  `src/tests/conventions/meaningColors.test.ts`, e o teste falha nos dois sentidos: subir é
  regressão, e descer sem atualizar a lista deixa folga onde a próxima regressão se esconde.

## Regras obrigatórias

1. **Zero hardcode visual.** Nunca crie cores, tamanhos, raios, sombras ou tipografias com valores
   literais. Em código novo use o **token semântico** (`bg-surface`, `text-fg-muted`,
   `border-border-subtle`, `rounded-card`). **A paleta crua do Tailwind não tem mais uso legítimo
   em cromo** — `bg-gray-800` é cinza fixo, que parece certo no escuro e ignora modo e acento. Cor
   de significado tem token próprio: `billable`, `paused` e `danger` — nunca `emerald`, `green`,
   `rose` ou `red` direto. As duas exceções são cor de **entidade** (paleta de workspace, cor de
   projeto) e cor de **marca** (os logos e ladrilhos de integração). Se precisar de um valor que a
   paleta não cobre, pare e pergunte.

2. **Um componente por conversa.** Não refatore múltiplas telas/componentes na mesma mudança.
   Escopo pequeno é verificável.

3. **Ambiguidade pausa o trabalho.** Se encontrar conflito entre design e código existente (ex:
   props diferentes, dados diferentes, lógica conflitante), PARE e pergunte. Não adivinhe.

4. **Mudanças fora do escopo são rejeitadas.** Não "melhore" partes do código que não foram
   pedidas, mesmo que pareçam problemas óbvios. Registre a observação no resumo da entrega e
   continue.

## Critérios de "pronto" (universal)

Todo PR visual deve passar em:

- [ ] Zero valores hex/rgb/oklch literais fora de `src/index.css`
- [ ] Zero valores de espaçamento literal (px) fora das escalas do Tailwind
- [ ] Testes existentes passam
- [ ] Sem console warnings novos
- [ ] Comportamento verificado nos dois modos (Escuro, Claro) e nos quatro acentos

## Tom e linguagem

- UI em **português (Brasil)**, sentence case, sem emoji, sem gírias
- Números: tempos em `HH:MM:SS`, durações compactas `1h30` ou `45m`
- Botões: verbo no infinitivo ("Iniciar", "Parar & salvar")
- Mensagens: curtas e informativas, nunca paternalistas

## Quando pedir ajuda humana

Pare e pergunte se:
- A paleta do Tailwind não cobre o que a tela precisa e um token novo parece necessário
- Props antigas conflitam com estrutura nova
- Comportamento interativo ambíguo (ex: hover em mobile?)
- Uma seção desta especificação aponta para um arquivo que não existe no repositório

---

