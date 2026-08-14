# Integrações externas — contrato comum

> Extraído da §5.7 do CLAUDE.md em 2026-08-10, verbatim. Vale para **todas** as
> integrações: escopo por workspace, envio parcial, catálogos. Leia antes da doc
> específica.


> **Cada integração trabalha num workspace do DeskClock, escolhido nela mesma.** `Workspace
> DeskClock` é o primeiro controle de cada card (no Google, de cada subseção — um card, duas
> chaves): `mondayDeskclockWorkspaceId`, `clockifyDeskclockWorkspaceId`,
> `sheetsDeskclockWorkspaceId`, `calendarDeskclockWorkspaceId`, `zendeskDeskclockWorkspaceId`. É
> dele que saem o destino dos imports e o recorte do envio — **a integração roda independente do
> workspace aberto na tela**, que era de onde vinham os dois defeitos silenciosos: importação
> nascendo onde a pessoa estivesse no instante do ciclo, e envio mandando ao board do cliente a
> hora do trabalho pessoal.
>
> **Vazio resolve para o "Padrão" na leitura** (`resolveIntegrationWorkspaceId`), e nada é gravado
> na montagem: o seletor **some com um único workspace** e quem nunca criou um segundo não percebe
> mudança nenhuma. No envio por tarefa, a de outro workspace é pulada **sem aviso** — o aviso diz
> "isto deveria ter subido e não subiu", e aqui nada deveria; era justamente o "o projeto não está
> mapeado" a cada parada num workspace pessoal que incomodava.
>
> **Os catálogos acompanham** (`useIntegrationCatalogs`): projetos e categorias dos modais de
> integração vêm do workspace dela, não do ativo. Sem isso o import criaria a planejada no
> workspace certo apontando para um projeto do errado, e a lista de envio exibiria o nome errado.
>
> Isto **revogou** a regra do §9.5 item 7 ("integrações enxergam tudo"), que era deliberada — ver a
> nota lá antes de "corrigir" código escopado.

> **Envio é parcial por natureza, e o `ITaskSender` passou a dizer isso.** O `send` devolvia `void`,
> então quem chamava só sabia distinguir "resolveu" de "lançou" — e marcava **tudo** ou **nada** como
> enviado. Mas a carga leva vários grupos e a recusa é **por grupo**: uma hora não faturável de
> cliente sem motivo (§ abaixo) fazia o Monday escrever os demais grupos no board e **ainda assim**
> lançar no fim, o que deixava nenhuma tarefa com o badge "Enviado", o timestamp do último envio
> parado e a tela dizendo "Não enviado ao Monday" — sobre horas que já estavam lá. Agora o retorno é
> `TaskSendOutcome { sentTaskIds, refused }`, e o `markSent` recebe só o que o sender confirmou.
>
> **O que lança e o que volta no outcome:** `throw` fica para o que impede o envio **inteiro** —
> integração não configurada, token ausente, nenhuma tarefa válida na carga —, porque aí não há
> resultado parcial a reportar. Recusa ou falha **de um grupo** volta no outcome e nunca é lançada,
> ou lançar apagaria o registro do que subiu no mesmo envio.
>
> **`refused` e `failed` são campos separados, e a separação é o que mantém os dois sinais.**
> `refused` é o destino não aceitando o **dado** — hora não faturável de cliente sem motivo, rótulo
> que não existe na coluna, board sem grupo para o Report Type: tentar de novo sem mudar nada dá no
> mesmo, e quem resolve é o usuário editando a tarefa. `failed` é falha **técnica** — rede, 5xx, a
> API recusando a escrita: não há nada a preencher, é para tentar de novo. Os dois viram canais
> diferentes: `refused` → `warning` (amarelo), `failed` → `error` (vermelho), que é a distinção que o
> `usePostStopLogic` já sabe exibir e que se perdeu quando os dois nasceram no mesmo campo — ali uma
> queda de rede aparecia como aviso amarelo, indistinguível de "preencha o motivo". Na tela do envio
> manual, **falha manda no tom mesmo com parte enviada**, e nada enviado é vermelho seja qual for o
> motivo. Já o timestamp não distingue: qualquer pendência o segura.
>
> **A falha de um grupo também não aborta os seguintes.** O `for ... await` cru do Monday e do
> Clockify parava no primeiro erro de rede: os grupos já escritos ficavam no destino, os seguintes
> nunca subiam, e no Monday o `removeOrphans` era pulado — deixando no board o item de um grupo que se
> fundiu, inflando o total reportado. No Clockify era pior, por não haver rastreamento de item: o
> reenvio **duplicava** as entries que já tinham subido. O Sheets fica de fora porque escreve numa
> requisição só — lá, tudo-ou-nada é a API, não a implementação.
>
> **Grupo que falhou não cobre nada, mas continua protegendo o que reivindicou.** No `removeOrphans`
> a cobertura sai dos planos aplicados e o `claimed` sai de **todos**: apagar o item que um grupo
> recusado reivindicou destruiria horas que nada reescreveu. E a limpeza roda **dentro de um `try`**:
> ela lança em qualquer erro que não seja "não encontrado", e solta isso descartaria o envio inteiro
> já gravado — higiene de board não pode custar o resultado do que o usuário mandou enviar.
>
> **Quem marca o badge "Enviado" é `resolveSentTasks` (`domain/utils/`), e no modo cru a marcação é
> exata.** A tentação é dar o grupo da tela por enviado quando *alguma* tarefa dele voltou
> confirmada, e está errado: o agrupamento da tela (§6.3) **não** inclui `billable` e o do Monday
> inclui, então um grupo com o indicador alternado na lista vira **dois** itens no board. Recusado o
> não faturável por falta de motivo e aceito o faturável, marcar o grupo daria o badge a horas que
> nunca chegaram lá — e o badge é justamente o que impede o reenvio. A contagem exibida é
> conservadora pela mesma razão: só conta grupo confirmado por inteiro.
>
> **O timestamp do envio diário só avança com o envio limpo.** `calcDailyRange` deriva o início da
> janela do dia local dele, então avançá-lo com algo recusado tiraria o grupo que ficou para trás da
> busca do ciclo seguinte — ele nunca mais seria tentado, sem badge e sem aviso. Parado, a janela só
> fica mais larga enquanto houver pendência: o `runDailyTemplate` exclui as já enviadas antes de
> agrupar e o Monday é upsert por assinatura, então repetir o dia não duplica. Vale também para o
> `onSendSuccess` do envio manual, que mexe na mesma chave.
>
> **A mensagem do resultado não é mais apagada pelo próprio reload.** O envio termina em
> `triggerReload()`, e o efeito de carga começava zerando a mensagem — a frase sumia no instante em
> que aparecia. Valia para o sucesso desde sempre, e passou a doer quando o resultado parcial virou a
> informação principal. Agora quem limpa é quem **troca o recorte** (`setQuick`, datas do período),
> porque aí a mensagem descreve uma lista que saiu de cena. Não use `useRef` para preservá-la: o app
> roda em `StrictMode` e o efeito é invocado duas vezes em dev.
>
> **Os três `runPerTask` conferem o resultado antes de marcar.** Com a recusa fora do canal de
> exceção, "não lançou" deixou de significar "subiu" — sem a conferência, a hora que o board recusou
> receberia o badge "Enviado" e nunca mais seria reenviada.
>
> Na tela, a mensagem ganhou um terceiro tom (`SendTone`): o desfecho que faltava era justamente o
> comum — parte sobe, parte é recusada —, e pintá-lo de vermelho negava o que já estava no destino.


---

## Por integração

- Google Sheets e Google Agenda — `docs-internal/integracoes/google.md`
- Clockify — `docs-internal/integracoes/clockify.md`
- Monday.com — `docs-internal/integracoes/monday.md`
