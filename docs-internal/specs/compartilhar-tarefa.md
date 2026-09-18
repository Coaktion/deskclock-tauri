# Compartilhar tarefa planejada por deeplink

> **Estado: entregue em 2026-09-18**, na branch `feat/share-planned-task`, em quatro commits
> (`626f764` o contrato, `0f601a5` o botão da linha, `e38f4ff` a chegada, `2f790ae` o campo de
> colar). Leia antes de mexer em `shared/utils/shareLink.ts`, `domain/utils/sharePayload.ts`,
> `domain/utils/resolveSharedPayload.ts`, `deserializeCustomValue` ou no braço `task/share` do
> `src-tauri/src/lib.rs`.

Uma planejada vira um endereço `deskclock://` que se manda por Slack, e do outro lado ela abre
num modal de revisão antes de qualquer gravação. O trabalho inteiro está em decidir **o que não
atravessa** — o resto é transporte.

## O formato

```
deskclock://task/share?name=…&project=…&category=…&billable=false
                      &start=HH:MM&end=HH:MM&cf.<rótulo>=<valor>
```

| Chave | Conteúdo | Ausente quer dizer |
|---|---|---|
| `name` | nome da tarefa — **a única obrigatória** | link inválido: sem ela `parseShareParams` devolve `null` e nada abre |
| `project` | **nome** do projeto no catálogo de quem mandou | tarefa sem projeto |
| `category` | **nome** da categoria | tarefa sem categoria |
| `billable` | só aparece como `billable=false` | faturável — o padrão do app, e omiti-lo encurta o link no caso comum |
| `start` · `end` | `HH:MM`, 24 h | sem horário |
| `cf.<rótulo>` | valor do campo personalizado, pelo **rótulo** do campo | campo não veio |

O prefixo `cf.` é só o primeiro `cf.`: o que sobra é o rótulo inteiro, ponto incluso, porque
rótulo com ponto é rótulo comum ("Cliente 2.0") e cortar no último ponto o quebraria. Valor de
`select` viaja pelo **rótulo da opção**, não pelo id.

## O que não viaja — e por quê

Esta é a parte do documento que existe para não ser "consertada". Cada ausência abaixo é escolha,
não lacuna; acrescentar qualquer uma delas ao contrato quebra a premissa de que **o link descreve
uma tarefa, não instala um pedaço do planejamento de quem mandou**.

- **Id de qualquer coisa** — projeto, categoria, campo, opção de `select`, workspace, a própria
  planejada. Id aqui é `UUID` gerado no SQLite local: o projeto "Portal" tem um id nesta máquina e
  outro na de quem recebe, quando existe lá. Mandar o id faria o outro lado casar contra nada ou,
  pior, casar contra o registro errado. Por isso **tudo viaja por nome ou rótulo**, e é por isso
  que o casamento na volta é por texto, aparado e sem distinguir caixa.
- **Agendamento, recorrência e período.** Recorrência é o modo de trabalho de quem recebe, não
  atributo da tarefa: um link não deve instalar uma repetição toda segunda no planejamento alheio,
  e desfazê-la depois custa mais do que criá-la custou. O que chega vira sempre um
  `specific_date` — decidido no ato de aceitar, não no ato de mandar.
- **`scheduleDate`.** A segunda-feira de quem manda não é a de quem recebe: o link circula por
  horas ou dias, e a data gravada chegaria certa só por coincidência. O receptor assume **hoje**,
  no campo editável do modal.
- **`actions`.** Decisão explícita do usuário (2026-09-18): as ações carregam URL e caminho de
  arquivo, e um link recebido de fora não vai plantar endereço para clicar dentro do app de outra
  pessoa. Quem quiser mandar um link junto manda no corpo da mensagem, onde ele se lê antes de ser
  clicado.
- **`completedDates` e `sortOrder`.** Histórico de conclusão e posição na lista são do
  planejamento de origem. Do outro lado a tarefa nasce pendente e no fim da lista, que é o único
  estado que faz sentido para algo que ainda não se decidiu fazer.

`buildShareLink` simplesmente não lê esses campos, e `parseShareParams` descarta em silêncio a
chave que não conhece — link de uma versão futura não precisa reprovar numa antiga.

## O par `formatCustomValue` / `deserializeCustomValue`

O link carrega **texto legível**, o mesmo que a exportação mostra: `"Sim"` para a caixa marcada, o
rótulo da opção para o `select`. É `formatCustomValue` quem produz isso, e a ida
(`plannedTaskToSharePayload`) o usa por já ser o lugar único onde o app traduz valor gravado em
texto.

A volta não tinha par. `serializeCustomValue` parece o inverso e não é: ele espera a **entrada da
UI** — o booleano ou `"1"`/`"true"` do checkbox, o **id** da opção do `select`. Alimentado com
`"Sim"`, devolvia `""`; alimentado com `"Concluído"`, devolvia `""`. O defeito era mudo: a caixa
marcada de um lado chegava desmarcada do outro, sem erro, sem aviso, sem nada na tela.
`deserializeCustomValue` fecha isso sendo o par explícito, e o que ele não resolve entra em
`unresolved.customFields` em vez de virar `""` — perda silenciosa aqui é o defeito que ele veio
consertar, e reintroduzi-la por um caminho novo seria voltar ao ponto de partida.

**Dois rótulos iguais no mesmo `select`: o primeiro vence.** O texto não distingue as duas opções
— é justamente o que o rótulo duplicado significa — e não há informação no link que ajude a
escolher. Recusar as duas perderia um valor que o usuário provavelmente quer; escolher o primeiro
ao menos é estável entre execuções e entre máquinas com o catálogo na mesma ordem.

As duas funções moram juntas em `domain/usecases/customFields/customValueCodec.ts`, e não em
volta do share: quem mexer numa precisa ver a outra na mesma tela.

## Onde o link é interpretado

**O Rust não lê o payload.** O braço `task/share` do `handle_deep_link` pega o mapa de query já
decodificado, guarda-o inteiro em `PendingSharedTask`, emite `deeplink:share-task`, navega para o
Planejamento e traz a janela à frente. Não há struct tipada do lado de lá de propósito: `cf.` e o
casamento contra os catálogos locais são **regra de domínio**, e regra de domínio no Rust seria um
segundo dono do contrato — dois lugares para acertar o mesmo formato, um deles sem Vitest em
volta. O TS lê o mapa com `parseShareParams` e resolve com `resolveSharedPayload`; o Rust só
transporta.

O par evento + estado pendente existe porque o link pode chegar com o app fechado: o `App.tsx`
escuta o evento e, no boot, consome o `get_pending_shared_task`. Ele deduplica pelo link
remontado, que é o contorno da corrida de `listen` sob StrictMode.

**`open_deep_link` existe para não haver um segundo roteador.** O campo de colar poderia
interpretar o texto em TS e navegar por conta — e aí seriam duas tabelas de rotas para manter em
sincronia, divergindo na primeira rota nova. Em vez disso o campo entrega a string ao mesmo
`handle_deep_link` por onde entra o link clicado no sistema operacional, e recebe de volta o
`Err` em português para estampar sob o campo. O que `readDeepLinkInput` valida localmente é só
**forma** — prefixo em caixa exata, como o `strip_prefix` do Rust compara —, para a ação primária
não ficar clicável sobre um texto que já se sabe que volta reprovado.

## Onde o link cola e onde não cola

Testado pelo usuário em 2026-09-18:

- **Slack:** o `deskclock://` vira link clicável, o sistema operacional entrega ao app e o modal
  abre. É o caminho principal.
- **Descrição de evento do Google Meet:** o texto **não** é linkificado. Fica lá, morto, e não há
  o que fazer no app a respeito.

Os dois contornos, nesta ordem de preferência:

1. **Encurtador.** Testado com o TinyURL e funciona: o `https://` curto é linkificado por qualquer
   lugar, e o esquema `deskclock://` reaparece no fim da cadeia de redirecionamento.
2. **"Receber", na barra lateral** — o item que não é página, descrito em
   `docs-internal/telas/configuracoes.md`, junto do Feedback, que é o outro caso do gênero. Abre o
   `PasteDeepLinkModal`, onde se cola o endereço na mão. É o que cobre o resto — e aceita qualquer
   deeplink do app, não só o de tarefa.

## O modal de recebimento

`ShareTaskModal` é revisão, não confirmação: **tudo é editável**, porque nada que veio no link é
confiável como dado local. Ele só monta depois de projetos, categorias e campos carregarem —
montado antes, abriria vazio e se preencheria sozinho um quadro depois, por cima do que já
estivesse digitado — e resolve o payload **uma vez**, senão a edição em curso seria sobrescrita a
cada render pelo valor do link.

O que não casou aparece como **aviso ao lado do campo vazio**, nomeando o que veio no link ("o
link trouxe o projeto X, que não existe neste workspace"). Nada é criado: cadastrar projeto,
categoria ou campo é decisão de quem recebeu, e criar por conta encheria o catálogo de entradas
vindas de fora.

As três ações são **Cancelar**, **Adicionar como planejada** (grava `specific_date` na data do
campo) e **Iniciar agora**. O Enter não submete — duas ações igualmente primárias, e a tecla teria
de escolher uma por conta; é um dos casos de exceção da §7 do CLAUDE.md.

### "Iniciar agora" com tarefa ativa troca de tarefa

Decisão do usuário, 2026-09-18. Havendo tarefa em execução ou pausada, o modal mostra um **aviso
informativo acima das ações** dizendo que iniciar **encerra** a atual — e o clique faz exatamente
isso, por `switchToTask`. **Não há segunda confirmação**, e o rótulo do botão continua "Iniciar
agora".

O aviso para em "encerra" de propósito, e a primeira versão dele errava aqui: dizia "e a salva como
concluída", que é o caso comum mas não o único. O que acontece depois do encerramento é das regras
de parada, e uma delas descarta a tarefa com menos de um minuto (`shouldDiscardTask`, §6.1 de
`docs-internal/regras-de-negocio.md`). A frase prometia justamente no caso em que mais se perde.

Três razões, na ordem em que pesaram: o aviso vem **antes** do clique, então quem clica já leu o
que vai acontecer; a §1 do CLAUDE.md é contra o "tem certeza?", e um diálogo aqui seria ele com
outro nome; e **nada se perde** — a tarefa anterior é encerrada pelas regras de parada normais e
fica no histórico como concluída, não descartada. Trocar o rótulo para "Trocar de tarefa"
resolveria o mesmo problema que o aviso já resolve, ao custo de o botão mudar de nome conforme o
estado.

`startTask` continua sendo no-op com tarefa ativa (§6.1 em `regras-de-negocio.md`) — o modal chama
`switchToTask` justamente porque a troca é intencional e explícita.

## Onde o botão fica

Na **linha da planejada** (`PlannedTaskItem`), entre o ▶ e o lápis: copia o link para a área de
transferência e avisa por toast. Ele soma o sexto botão da fileira que só aparece no hover, e some
no modo de seleção pelo mesmo motivo que os outros (`docs-internal/telas/planejamento.md`).

## O que já está travado por teste

Não repetir em prosa (§6 do CLAUDE.md): o formato do link ida e volta está em
`src/tests/shared/utils/shareLink.test.ts`; a forma do texto colado, em
`src/tests/shared/utils/deepLinkInput.test.ts`; a tradução planejada → payload, em
`src/tests/domain/utils/sharePayload.test.ts`; a volta e o `unresolved`, em
`src/tests/domain/utils/resolveSharedPayload.test.ts`; e o par de codecs, em
`src/tests/domain/usecases/customFields/customValueCodec.test.ts`.

---
