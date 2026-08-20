# 5.9 Primeira execução (`SetupModal`)

> Extraído da §5.9 do CLAUDE.md em 2026-08-10, verbatim.

### 5.9 Primeira execução (`SetupModal`)

Dois passos, e o primeiro é o mesmo de sempre: o nome, usado na saudação da tela de Tarefas
(`userName`). Concluir grava `setupCompleted`, que é o que faz a janela abrir no tamanho de setup
(`useStartupWindow`) enquanto for falso.

> **O onboarding não cadastra mais projeto nem categoria — ele sugere conectar uma integração.** Os
> dois passos de importação em massa pediam, na primeira tela do app, exatamente a lista que o
> Monday, o Clockify e o Google entregam prontos — e quem os digitava ali acabava com um catálogo
> paralelo ao que o import criaria depois, com os mesmos nomes escritos de outro jeito e nenhum
> vínculo com o board de origem. Quem não usa integração nenhuma não perdeu caminho: a importação em
> massa continua na tela de Dados (§5.6), que é onde ela sempre esteve e para onde o texto do passo
> aponta.
>
> **O passo é um cartaz, não uma tela de conexão**, e é o que a arquitetura permite: os modais de
> integração vivem no `IntegrationsModalsHost`, que só é renderizado depois que o setup termina.
> Daí ele ter um destino só — o botão primário conclui o setup e **abre o app já na tela de
> Integrações**, passando a página pelo `onComplete`. "Agora não" conclui e abre em Tarefas.
>
> Enter segue o botão primário (§8.2), então também leva a Integrações. A lista das quatro
> integrações fez o passo ficar mais alto que a janela de 620 px em que o setup abre, e por isso o
> conteúdo rola em vez de centralizar rígido.

---
