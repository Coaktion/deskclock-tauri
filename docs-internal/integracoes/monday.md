# Monday.com

> Extraído da §5.7 do CLAUDE.md em 2026-08-10, verbatim.
> Contrato comum a todas as integrações: `docs-internal/integracoes/README.md`.

**Monday.com:**
| Campo | Tipo |
|---|---|
| API Key | input password + instrução inline |
| Workspace DeskClock | dropdown com os workspaces do app (`mondayDeskclockWorkspaceId`) |
| Board de Portfólio | input com o id do board que lista os projetos (`mondayPortfolioBoardId`) |
| Board de Report de Horas | input com o id do board que guarda o catálogo dos rótulos (`mondayReportBoardId`) |
| Importação de dados | seis blocos: Projetos, Catálogos, Categorias e os três campos de atividade (Project Stage, Report Type, Non Billable reason). O destino é o Workspace DeskClock da integração — o seletor local que existia aqui era estado de tela e morria ao sair |
| Envio automático | toggle + modo (por tarefa / diário) + gatilho (ao abrir / horário fixo) + "Enviar agora" no modo diário |
| Importação automática de itens | toggle (`mondayAutoImportEnabled`, padrão desativado) + botão "Buscar itens agora" |
| Enviar tarefas manualmente | botão abre o `TaskSendModal` genérico |
| Importar itens como planejadas | botão abre o `MondayImportModal` |
| Gerenciar atividades | botão abre o `MondayEntriesModal` |

> **No rail de integrações o Monday só aparece configurado ponta a ponta** (`isMondayReady`): chave
> de API, os **dois board ids** e ao menos um projeto **com quadro de destino**. Diferente do
> Clockify e do Google, a chave sozinha não torna a integração utilizável — sem os boards não há de
> onde tirar projetos nem rótulos, e sem quadro não há o que consultar. Projeto sem quadro é estado
> normal (a coluna "ID Quadro Projeto" está vazia em 14 dos 62 itens) e por isso **não conta**: as
> três ações do atalho consultam boards e abririam vazias, que é o que o atalho existe para evitar.
> A tela de Integrações continua acessível sempre, que é onde a configuração se completa.

> **Start Date e End Date são o intervalo trabalhado, não o do envio.** As duas colunas levavam o
> instante em que a atividade nasceu no Monday, o que descrevia o envio e não o trabalho: lançamento
> retroativo e envio diário caíam todos no dia em que se apertou o botão, e o filtro por período do
> gerenciador de atividades — que lê justamente este par (§ `parseDatePairPeriod`) — mostrava a
> atividade no dia errado. Agora vêm do grupo: início da primeira tarefa, fim da última. O fim é o
> **maior** `endTime`, não o da tarefa que começou por último — duas execuções do mesmo trabalho podem
> se sobrepor.
>
> Por virem da tarefa, o valor é estável entre execuções, e por isso **entram também no update**: era
> a volatilidade do "agora" que as obrigava a ficar só no create, sob pena de o payload mudar a cada
> ciclo e nenhum grupo cair mais no skip por "nada mudou". A consequência é que corrigir o horário de
> uma tarefa já enviada acerta a data no board — e que o primeiro envio depois desta mudança reescreve
> uma vez os itens já rastreados, que é o que conserta as datas antigas.
>
> **Vai só o dia, sem hora.** A hora acompanhava e descrevia o instante exato de início e fim —
> precisão que o board não usa: o que se reporta ali é o dia em que o trabalho aconteceu. O dia é o
> **local** (§6.6), não o dia em UTC: com hora junto o Monday guardava em UTC e reexibia no fuso da
> conta, então o dia se acertava sozinho; sem ela não há o que reconverter, e uma tarefa das 23h em
> fuso negativo cairia no dia seguinte do board. A leitura (`parseDayValue`) continua entendendo as
> duas formas, porque as atividades enviadas antes disso ainda têm hora gravada. Aqui também o
> primeiro envio reescreve uma vez os itens já rastreados.

> **O Report Type está adormecido, e toda atividade vai como `Activity`.** O time ainda não fechou
> o que cada valor significa, e um campo que ninguém sabe preencher mandaria hora para o grupo errado
> do board do cliente — onde ela não seria encontrada nem por quem a lançou. O card some de
> Integrações, o `MondayTaskSender.catalogFields` devolve o campo como `null` e o envio cai no padrão.
> **O que fica em volta continua vivo**: a chave `mondayReportTypeFieldId`, o catálogo lido do board
> de Report e os `reportTypeGroupIds` resolvidos no mapeamento — despertar não pode custar reler
> board nenhum. Acordar é ler a chave no sender e devolver o card na seção.
>
> **Quando acordar: o Report Type não é coluna no board do projeto — é o grupo em que a atividade
> nasce.** No board de Report ele é lido por uma automação que roteia o apontamento; escrevendo
> direto, o roteamento é nosso: `Activity → Activities`, `Meeting → Meetings`, `Expense → Expenses`,
> `Risk → Risks`, `Lesson Learned → Lessons Learned`. Tarefa sem valor no campo vale `Activity`.
>
> **A resolução é pelo título do grupo, nunca pelo id.** `group_mm19wbff` é "Timeline" num board de
> cliente e "Activities" no interno — casar por id gravaria as horas no cronograma do cliente. Board
> interno tem um grupo só, então lá só `Activity` resolve: os outros quatro **recusam o envio com
> mensagem**, em vez de cair no Activities calados, que reportaria como atividade o que o usuário
> classificou como reunião ou risco.
>
> **Mudar o Report Type depois do envio move o item.** Grupo não é coluna, então
> `change_multiple_column_values` não o alcança — sem o `move_item_to_group` o item ficaria em
> Activities para sempre. O grupo atual vem de graça no retorno da própria escrita, então só há
> requisição extra quando ele diverge; recriar o item para trocá-lo perderia as atualizações dele.
>
> **O recorte de grupos das duas telas cobre todos os destinos**, não só o Activities: a atividade
> criada em Meetings sumiria do gerenciador — que não a editaria nem a apagaria — e reapareceria no
> import como item de trabalho a virar planejada. `listItemsOwnedBy` continua separando as consultas
> por par (coluna de pessoa, grupos), porque id de grupo se repete entre boards.

> **O motivo de não faturável é obrigatório em projeto de cliente, e dispensado em interno.** Ali a
> hora não faturada é a exceção e a coluna existe para justificá-la; no interno non-billable é a norma
> (0 horas faturáveis em 119 itens). A tarefa sem motivo nessa situação **não sobe, com mensagem** —
> omitir em silêncio mandaria ao board de outra pessoa exatamente o que a coluna existe para impedir.
> **Board sem a coluna nunca exige**: a omissão precisa vir da ausência no schema (3 dos 4 boards
> internos não a têm), ou o cliente cujo board não a tem ficaria sem caminho nenhum para lançar hora
> não faturável.
>
> **Recusar um grupo não aborta o envio.** Os demais sobem e as mensagens voltam juntas num erro no
> fim: o `ITaskSender` só tem o `throw` como canal, e lançar antes de escrever faria uma tarefa travar
> o dia inteiro.
>
> **O Project Stage só entra em projeto de cliente**, agora por guarda explícita de escopo. Ela já não
> saía por acidente feliz — nos boards internos a coluna se chama "Project Phase" e não bate com os
> títulos procurados —, e a guarda é o que sobrevive ao dia em que alguém adicionar esse título à
> lista. Um rótulo de cliente ali derrubaria a mutation inteira.

> **Apagar no Monday é mandar para a lixeira.** O id continua válido e
> `change_multiple_column_values` responde **sucesso** num item que ninguém mais vê — nunca chega um
> `MondayNotFoundError`. Por isso o update pede `id state` e trata `state !== "active"` (deleted ou
> archived) como item perdido: larga a linha de `monday_activity_items` e cria outro no lugar, o
> mesmo desfecho do erro de não-encontrado. Sem isso o rastreamento aponta para a lixeira para
> sempre, e a atividade nunca volta ao board por mais que se reenvie.

> **O envio manual escreve sempre** (`forceWrite` do `MondayTaskSender`). O auto-sync pula o grupo
> cujo payload não mudou — é o que impede o envio diário de reescrever o dia inteiro a cada
> execução. No manual isso virava armadilha: atividade apagada direto no Monday nunca voltava,
> porque o rastreamento ainda batia, o envio era pulado em silêncio e o modal ainda dizia "enviado
> com sucesso". O clique é a intenção, então ali a comparação é ignorada — o item existente é
> reescrito e, se sumiu do board, recriado. **O aviso de reenvio avisa, nunca impede**, e basta
> **uma** tarefa já enviada na seleção para ele aparecer: exigir o grupo inteiro calava o aviso no
> caso mais arriscado, o grupo parcialmente enviado.

> **"Enviar agora" dispara só o Monday** (`AutoSyncRunner.runDailyFor`). O `runDaily` do
> runner roda todas as integrações com o modo diário ligado — o botão de um card mandaria tarefas
> para as outras sem ninguém pedir. O botão vive no `AutoSyncControls` compartilhado, atrás da prop
> opcional `syncNow`, e o modo diário é a condição para ele aparecer, como no Google Sheets: no modo
> por tarefa o envio já acontece ao concluir.

> **O gatilho do envio diário é por integração** (`useDailySyncScheduler` + `AUTO_SYNC_INTEGRATIONS`).
> O agendador percorre o registro, avalia o gatilho de cada uma e dispara só a que venceu, via
> `runDailyFor`. Antes ele conhecia só o Sheets e o Clockify e disparava o `runDaily` global: o
> horário fixo do Monday **nunca** rodava — ele só subia de carona quando outra integração vencia —
> e, no sentido inverso, o Clockify marcado para as 18h subia às 9h porque o Sheets estava em "ao
> abrir o app". Integração nova entra no registro (§9.5 item 4.1) ou repete o defeito.

> **A configuração são dois ids de board**, e não cinco escolhas. Antes pedia workspace do Monday,
> pasta de clientes, pasta de projetos internos, board interno e um mapeamento manual board ↔
> Project — tudo para descrever à mão o que o próprio Monday já descreve. Hoje pede o **Portfólio**
> (`mondayPortfolioBoardId`), que lista os projetos, e o **Report de Horas**
> (`mondayReportBoardId`), que guarda o catálogo dos rótulos. Os dois são trocáveis pelos campos da
> seção: outra conta troca os dois e o resto segue igual.
>
> **Os padrões vêm do `.env`**, não do código: `MONDAY_PORTFOLIO_BOARD_ID` e
> `MONDAY_REPORT_BOARD_ID`, prefixo liberado no `vite.config.ts` como o `GCP_`. Id de board
> descreve a **conta**, não o produto, e cravado no `DEFAULTS` ele viajava no bundle de todo
> instalador publicado num repositório público. **Ausente resolve para vazio** — a integração pede
> os dois na tela, e é o `isMondayReady` que já barra o envio sem eles. No CI eles entram como
> **Variables** (`vars.`), não Secrets: o que se quer é mantê-los fora do código-fonte, e chamá-los
> de segredo diria que há algo a proteger que não há.
>
> **Desconectar não os apaga**: descrevem a conta, não a sessão, e limpá-los faria a reconexão exigir
> dois ids que ninguém tem à mão. `mondayUserId` continua derivado da apiKey no `MondayConnectModal`
> — é cache, nunca campo de tela.
>
> **O Report de Horas não é destino de escrita.** Criar item ali dispara uma automação que copia o
> apontamento para o board do projeto, mas **não** o atualiza nem exclui: editar ou apagar do
> DeskClock deixaria órfão o que foi copiado. Por isso as horas vão direto ao board do projeto, e o
> Report serve só de catálogo — é o único lugar onde os rótulos de cliente e os de projeto interno
> convivem.

> **Um item do Portfólio é um Project.** A coluna **Oferta** (`color_mm4fzw3r`) classifica:
> `Atividades Internas` é projeto **interno**, qualquer outro rótulo preenchido é **cliente**, e
> **vazia ignora o item** — é linha que ninguém classificou (2 dos 62 hoje), e adivinhar escolheria
> qual conjunto de Activity Type vale no board, que o Monday recusa se errado. O escopo fica no
> mapeamento (`scope`) porque decide os rótulos válidos e se o Project Stage entra no payload.
>
> A coluna **ID Quadro Projeto** (`text_mm5etnn2`) diz onde as horas são gravadas. **Vazia é estado
> normal** — 14 dos 62 itens estão assim: o projeto nasce, aparece e recebe tarefas; só as horas não
> sobem. O card de Projetos oferece um campo para digitar o id, que já lê o schema do board. No
> refresh o remoto só sobrescreve o local **quando vem preenchido**: vazio **nunca** apaga, ou a
> varredura diária desfaria o preenchimento manual todo dia.
>
> Os dois ids de coluna são **hardcodados**, ao contrário do resto da integração, que resolve coluna
> por título: os boards de projeto nascem de um template e cada um gera os seus ids, mas o Portfólio
> é um board só, escolhido por id — não há variação a acomodar, e resolver por título só criaria a
> chance de casar com a coluna errada.
>
> **Não há tabela de mapeamento** de categoria nem dos campos de atividade: o Activity Type é o
> **nome** da Categoria e os outros três são campos personalizados apontados por
> `mondayProjectStageFieldId`, `mondayReportTypeFieldId` e `mondayNonBillableReasonFieldId` — a
> tarefa grava o **id da opção**, e o sender traduz para o rótulo. Rótulo que não existe na coluna do
> board **não vai no payload**: o Monday recusaria a escrita inteira, derrubando um envio correto por
> causa de uma categoria não relacionada.

> **O import de projetos semeia quais categorias cada projeto oferece**
> (`seedMondayProjectCategories`, no botão "Atualizar", na varredura diária e **a cada abertura do
> app**, a partir dos vínculos já gravados). O
> board de destino já publica os Activity Types válidos, e o Activity Type **é** o nome da Categoria
> — então a associação não custa consulta nova: os rótulos vieram no `activityTypeLabels` do próprio
> import. O card de Projetos diz quantas foram semeadas, ou a escrita seria invisível.
>
> Fica **fora** de `importMondayProjects` de propósito: aquele use case já lê o Portfólio, cria
> projetos e resolve o schema de 62 boards, e juntar a escrita lhe daria dois repositórios a mais.
>
> **Board sem rótulo nenhum é pulado, não zerado.** `activityTypeLabels` vazio significa board
> ilegível ou projeto sem destino (14 dos 62), não "este projeto não aceita categoria nenhuma":
> chamar `replaceMondayFor` com lista vazia apagaria as associações a cada falha de leitura. É a
> mesma regra do "ID Quadro Projeto", onde vazio nunca sobrescreve o local. **Rótulo sem categoria
> correspondente é ignorado em silêncio** — quem cria categoria a partir do Monday é
> `importMondayCategories`, que pode não ter rodado ainda, e criar aqui duplicaria a regra de
> billable por escopo.
>
> **A semeadura não fica atrás do portão de uma vez por dia**, e essa foi a correção que o primeiro
> uso exigiu: presa à varredura, no dia em que a feature subiu — com a varredura do dia já feita —
> nenhum vínculo nascia até o dia seguinte, e a integração parecia não criá-los. Ela não fala com o
> Monday (os rótulos estão em `mondayProjectMapping` desde o último import), então roda também na
> abertura. O que a torna barata é **pular o projeto cujo conjunto não mudou**: depois da primeira
> vez o custo é uma leitura, e o aviso entre janelas só sai quando algo mudou de fato.

> **Uma leitura do board de Report semeia os quatro conjuntos de rótulos** (`importMondayFieldCatalogs`,
> card "Catálogos"): Activity Type (35), Project Stage (18), Non Billable reason (8) e Report Type
> (5). São quatro colunas do mesmo board, então quatro consultas seriam quatro idas ao Monday para
> montar campos que sempre se configuram juntos. Os ids dessas colunas são **hardcodados**, como os
> do Portfólio e pelo mesmo motivo — é um board só, escolhido por id, e ele tem outras quatro colunas
> `status` e três `dropdown` com que resolver por título poderia casar. Os rótulos ficam em
> `mondayFieldCatalogs`; sem o cache, abrir Integrações custaria uma consulta só para dizer quantos
> rótulos faltam em cada campo.
>
> **`status` e `dropdown` guardam os rótulos em formatos diferentes** — `{"labels":{"0":"Rótulo"}}`
> contra `{"labels":[{"id":1,"name":"Rótulo"}]}` — e passar um pelo parser do outro devolve lista
> vazia **sem erro nenhum**: a tela mostraria zero opções e a integração seguiria em pé. Daí
> `parseDropdownLabels` existir ao lado de `parseStatusLabels`. Rótulo desativado fica de fora, que é
> a mesma regra de nunca mandar valor que a coluna não aceita.
>
> **A lista de Activity Types é a união do catálogo com os rótulos cacheados nos boards**
> (`mergeLabels`), porque as duas metades cobrem buracos diferentes: o catálogo traz rótulo de board
> que ainda não foi importado ou não abre, e o cache traz rótulo que existe num board de projeto e
> não está no Report. O envio valida contra a coluna do board de destino, então rótulo a mais custa
> uma categoria não usada — rótulo a menos custa a coluna Activity Type em branco no apontamento.
>
> **O escopo de cada rótulo sai dos mapeamentos, não de uma consulta nova** (`billableByActivityType`):
> o import dos projetos já cacheou os rótulos de cada board junto do escopo que a coluna "Oferta"
> classificou. Cliente é billable, interno não; rótulo nos dois lados e rótulo que board nenhum
> confirmou ficam billable, porque trabalho de cliente é o caso majoritário e `default_billable` é só
> um padrão.
>
> **Não existe default de motivo de non-billable por categoria**, e por isso não há tabela lateral de
> categoria. O motivo é escolha da **atividade** — a mesma categoria rende hora faturável e não
> faturável, e "por que *esta* hora não foi faturada" não tem resposta no nível da categoria. Ele é
> **obrigatório** em projeto de cliente marcado como non-billable e **dispensado** em projeto
> interno, onde non-billable é a norma (0 horas faturáveis em 119 itens).
>
> **Os três são campos personalizados, e não colunas próprias em `tasks`.** Precisam ser editáveis no
> planejamento, no popup, no lançamento retroativo, na tarefa em execução, nos modais de edição, no
> acesso rápido, no import do Monday e na exportação — tudo que os campos personalizados já
> atravessam. Coluna nova exigiria reescrever o mesmo input em nove telas. O `MondayCatalogField` é
> um componente só para os três: eles diferem na chave de config e no catálogo, em mais nada.

> **Board ilegível não custa o Project.** A importação exigia as seis coisas do template e recusava
> o board na falta de qualquer uma — recusa sem alternativa: o cliente não virava Project, nada
> ficava mapeado e não havia caminho nenhum para enviar aquelas horas. Hoje só quatro impedem o
> **envio**: **grupo Activities**, **Reported Hours**, **Activity Type** e a **coluna de pessoa**. As
> três primeiras porque sem elas não há onde criar a atividade nem hora a registrar; a de pessoa
> porque é por ela que o gerenciador de atividades e o import de itens pedem ao Monday **só os itens
> do usuário**, e os boards são do time inteiro (§ abaixo). Faltando qualquer uma, o projeto nasce
> **sem destino** — o mesmo estado do item sem "ID Quadro Projeto" — e o motivo volta em `skipped`,
> visível no card de Projetos.
>
> **Billing type e Status são opcionais**, na mesma família de Project Stage e das duas datas: sem a
> coluna, o campo não entra no payload. A omissão é o mecanismo de segurança, não economia — id que
> o board não tem faz o Monday **recusar a mutation inteira** (HTTP 200 com
> `InvalidColumnIdException`/`ResourceNotFoundException` no corpo, nunca ignorado como na leitura), e
> o segundo desses o `MondayClient` traduz em `MondayNotFoundError`, que o sender lê como "apagaram o
> item" e responde **recriando**. Uma coluna a mais no payload viraria atividade duplicada no board a
> cada ciclo, não um erro visível. No gerenciador de atividades, o botão de faturável só aparece para
> board que tem a coluna: alternar um valor que nunca sairia dali é armadilha.

> **A lista de projetos se relê sozinha uma vez por dia** (`useMondayProjectsTracker`). Cliente novo
> só virava Project quando alguém lembrava de apertar "Atualizar" em Integrações, e enquanto ninguém
> lembrava a tarefa daquele board ficava sem projeto mapeado e as horas não subiam — falha silenciosa
> num caminho em que ninguém procura. O ciclo faz o que o botão faz, e **passa os vínculos atuais**
> ao importador: eles são a única fonte do quadro preenchido à mão, e sem eles a varredura apagaria a
> referência todo dia. O tique é de 30 min só para perceber a **virada do dia** (app aberto a semana
> inteira precisa notar sem ser reaberto) e a data só é gravada **depois do sucesso**: falha de rede
> volta a tentar no tique seguinte em vez de custar a varredura do dia.
>
> **O destino é o workspace da integração**, e por isso a varredura faz também o **primeiro**
> import. Enquanto o destino era o ativo, uma guarda provisória (`isMondayLinkedWorkspace`) só a
> deixava rodar onde já houvesse projeto do Monday — sem ela, bastava estar num workspace pessoal na
> virada do dia para os 60 projetos da empresa nascerem lá dentro. Com o destino escolhido, não há o
> que adivinhar, e a guarda saiu. O erro do ciclo fica em `mondayProjectsLastSyncError` e aparece no
> card de Projetos, pelo mesmo motivo do erro do rastreio da Agenda.

> **Os schemas dos boards são lidos em lote, uma vez por varredura.** Era um `getBoardSchema` por
> projeto, dentro do laço: ~46 idas **sequenciais** ao Monday, cada uma pedindo todas as colunas e
> todas as views com `settings_str` de um board de 60+ colunas. O board de destino passa a ser
> resolvido **antes** do laço, e `listBoardSchemas` quebra o resto em lotes de 20 — três requisições
> no lugar de quarenta e seis. Era o gargalo da varredura diária e do botão "Atualizar".
>
> **Board inacessível não vem no retorno, e é a ausência que vira o motivo em `skipped`**: a consulta
> em lote não falha por causa de um id ruim. O que falha — token, rede, orçamento de complexidade —
> **aborta a varredura**, e isso é a correção de um defeito silencioso: com a leitura por board dentro
> de um `catch`, um token vencido produzia 46 destinos vazios que o rastreador **gravava por cima** do
> mapeamento bom, e o envio de horas parava até a varredura seguinte dar certo. Abortar preserva o
> mapeamento.
>
> **O catálogo de projetos é lido uma vez, não um por item.** Eram ~60 `findByName` em série ao
> SQLite para montar um índice que uma leitura resolve — `findAll` já é escopado pelo workspace, que
> é exatamente o recorte da unicidade do nome (§4.3), e a coluna não tem `COLLATE NOCASE`, então o
> `Map` responde o mesmo que a consulta respondia. O `findByName` sobra só para a releitura do nome
> duplicado.
>
> **O nome é comparado aparado, porque é aparado que ele é gravado** (`createProject`). Comparando
> cru, o item do Portfólio com espaço na ponta não encontrava o projeto que ele mesmo criara no ciclo
> anterior: o `createProject` recusava por duplicidade, a releitura crua tornava a não encontrar, e
> aquele board voltava em `skipped` **a cada varredura** — sem mapeamento, e portanto sem envio de
> horas.

> **O schema de cada board vale 7 dias** (`schemaReadAtISO` + `shouldReadBoardSchema`), e depois da
> primeira varredura o normal é **nenhuma** leitura de schema. O mapeamento já era um cache do que a
> leitura devolve — grupos, colunas, rótulos, `timelineColumnId` —, mas faltava marca de validade:
> sem ela a varredura diária não distinguia board novo de board lido há uma hora, e pagava as três
> requisições mais caras da integração todo dia. Relê quando o vínculo é novo, quando o board de
> destino mudou (inclusive o id digitado à mão), quando a marca não existe (vínculo anterior a este
> cache) e quando ela vence. **O item do Portfólio continua sendo lido em toda varredura** — é dele
> que vêm o cliente novo e o "ID Quadro Projeto" recém-preenchido, e ele custa uma requisição de duas
> colunas. A validade existe pelos **rótulos**: a topologia de um board nascido de template não muda,
> mas Activity Type e etapa novos aparecem.
>
> **O vencimento não é escalonado entre os boards, e a conta é o motivo.** Espalhar para "não
> vencerem todos no mesmo dia" sai mais caro: o lote é de 20 ids, então 46 boards vencendo juntos
> custam 3 requisições **uma vez por semana**, contra ~7 boards/dia custando uma requisição **todo
> dia**. E o pior dia sem escalonamento é exatamente o que a varredura custava todo dia antes disto.
>
> **Só sucesso estampa.** Board fora do template, ou que não voltou na consulta, fica sem marca e é
> relido na varredura seguinte. Estampar a falha faria a recuperação de um board consertado no Monday
> levar uma semana e — o pior — o sumiria da lista de "fora do template" do card de Projetos, que só
> reporta o que foi lido **nesta** varredura. É a mesma disciplina de estados do `timelineColumnId`:
> ausente significa "nunca lido com sucesso", e por isso `normalizeProjectMappings` também não lhe dá
> default.
>
> **O "Atualizar" ignora a validade** (`forceSchemaRead`), no mesmo papel que o `forceWrite` tem no
> envio manual de horas: o clique é a intenção, e é o caminho de quem acabou de criar um rótulo no
> board e quer vê-lo agora. O risco aceito é o rótulo novo levar até 7 dias para aparecer sozinho —
> no envio, o pior caso é a coluna Activity Type em branco, não mutation recusada, porque o sender já
> omite rótulo que não está na lista cacheada.
>
> **Board relido que não volta na consulta perde o destino cacheado**, de propósito: a ausência é o
> Monday dizendo que aquele id não existe mais ou saiu do alcance do token, e insistir com o cache
> faria o envio escrever num board perdido. Falha de rede é outro caso — ela aborta a varredura antes
> disso e preserva o mapeamento inteiro (§ acima).

> **Os lotes correm em paralelo, com teto** (`mapWithConcurrency`, `BATCH_CONCURRENCY = 4`). O lote
> existe para caber no orçamento de complexidade, não porque um dependa do outro — mas o `for` com
> `await` fazia as três requisições esperarem umas às outras, e o mesmo valia para a busca de itens
> das duas telas. **A ordem do retorno continua sendo a da entrada**, nunca a de chegada: a lista
> sairia embaralhada de um jeito diferente a cada execução. O teto existe porque o número de lotes
> cresce com os boards mapeados, e disparar todos de uma vez contra uma API com limite de requisições
> troca lentidão por 429 intermitente — que é pior, por ser aleatório.

> **A requisição se repete no que for recusa temporária, e só nisso** (`retry.ts`, até 3 tentativas).
> É o contrapeso do paralelismo acima: mais requisições ao mesmo tempo tornam o 429 provável, e sem
> nova tentativa o ganho de tempo viraria erro intermitente na tela.
>
> **A regra que governa tudo é se a requisição é uma `mutation`.** Ela **não** se repete em 5xx nem
> em falha de rede: nos dois a escrita pode ter acontecido e só a resposta se perdeu, e repetir
> criaria a atividade duas vezes no board do cliente — o defeito que o rastreamento de itens existe
> para evitar. Já o 429 e o estouro de complexidade são recusas **antes** da execução: nada foi
> gravado, e ali a mutation repete como qualquer leitura. A pergunta é respondida pelo texto da
> query, que nasce toda dentro do `MondayClient`.
>
> **Prazo declarado é obedecido, e prazo longo demais é motivo para desistir na hora.** O
> `Retry-After` e o "reset in N seconds" da mensagem de complexidade viram a espera; acima de 15 s,
> o erro sobe imediatamente dizendo em quanto tempo tentar de novo — boa parte destas chamadas está
> atrás de um spinner de modal, e um minuto de giro não é nova tentativa, é janela travada. O jitter
> de ±25% existe porque os lotes paralelos tomam 429 juntos e voltariam juntos, reproduzindo a
> rajada que os derrubou.
>
> **5xx virou classe própria** (`MondayServerError`). Caía no `MondayValidationError`, que por
> definição não se repete — os dois pedem coisas opostas: o de validação diz que a query está errada
> e repeti-la só repete o erro. Enquanto eram a mesma classe, não havia como escrever a distinção.
>
> **A causa técnica aparece no tooltip do ícone de erro** (`errorDetail` + `SyncFeedbackLine`). O
> `originalCause` do `MondayNetworkError` era guardado e **nunca exibido nem registrado** — e
> "verifique sua internet" é o mesmo texto para DNS, proxy corporativo e certificado recusado. Ele
> fica **fora** da frase de propósito: quem lê a linha quer saber se funcionou, e um `TypeError:
> Failed to fetch` no meio dela não ajuda ninguém a decidir o que fazer. No ícone, quem não procura
> não vê. O helper cala quando a causa só repete a mensagem já visível, que seria ruído com cara de
> informação, e lê `cause` **e** `originalCause` — o padrão da linguagem é ES2022 e o projeto compila
> ES2021, então migrar a `lib` ficaria fora do escopo desta mudança.

> **O detalhe do Monday acompanha a recusa de credencial, sem substituir a sugestão.** 401 e 403
> chegam pela mesma porta e a mensagem virava "Token inválido ou revogado. Reconecte." mesmo quando o
> texto deles dizia *sem acesso a este board* — mandar reautenticar por falta de permissão é conselho
> errado. Agora a sugestão fica e o detalhe entra entre parênteses, com o status.

> **A coluna de cronograma é cacheada no mapeamento** (`timelineColumnId`), e é o que dispensa o
> ciclo de importação de reler schema nenhum. Ele lia o schema de **todos** os boards mapeados a cada
> execução — a requisição mais cara da integração — só para extrair este id, que a varredura de
> projetos já tinha em mãos: ela lê o mesmo schema para resolver grupo, colunas e rótulos.
>
> **Os três estados são distintos, e é isso que faz o cache funcionar** (`resolveTimelineByBoard`):
> `undefined` = nunca resolvido, e **só ele** manda ler o schema; `""` = lido, board sem coluna de
> cronograma; preenchido = o id. Colapsar os dois primeiros faria o board sem Timeline pagar a leitura
> para sempre — ou, na direção oposta, faria todo board parar de reler quando devia. Por isso
> `normalizeProjectMappings` **não** lhe dá default: o default seria o colapso.
>
> Board que não serve de destino também guarda o cronograma quando o schema foi lido — ele continua
> valendo para o import de itens de trabalho, e sem gravar o id ele releria o schema em todo ciclo.
> A regra é usada pelo automático e pelo `MondayImportModal`, que precisam concordar (§9.4).

> **As duas telas mostram só os itens do usuário conectado.** Os boards são do time inteiro, e
> ninguém trabalha em todos os clientes. O filtro é a regra `person-<id>` de `query_params` — o
> prefixo é obrigatório, mandar só o id devolve zero itens sem erro nenhum para avisar. A busca é
> `listItemsOwnedBy`, compartilhada pelas duas (§9.4).

> **Id de grupo se repete entre boards com significados diferentes.** `group_mm19wbff` é o grupo
> "Timeline" num board de cliente e o grupo "Activities" no board interno. Por isso
> `listItemsOwnedBy` separa as consultas por par **(coluna de pessoa, grupo Activities)** e cada
> lote leva o **seu** id: a união numa consulta só apagaria o Timeline de todo cliente
> (`not_any_of`) ou traria o Timeline como se fosse atividade (`any_of`). Nunca una ids de grupo de
> boards diferentes.

> **Importar itens (`MondayImportModal`):** **todos** os boards mapeados numa visão só, agrupada
> pelo **Project do DeskClock** — não há seletor de board. Entram os itens **fora** do grupo
> Activities e **do usuário**, e viram PlannedTasks no workspace ativo. O agendamento vem da coluna
> **Timeline** do item (resolvida pelo título, porque o board tem várias colunas desse tipo e a
> primeira é a realizada): um dia vira `specific_date`, vários viram `period`, ausente cai no dia
> corrente. Os schemas são buscados antes dos itens — em lote, `listBoardSchemas` — justamente para
> resolver esse título e então pedir só as colunas usadas; o template tem mais de 60. Filtro de
> período (Hoje / Esta semana / Próximos 30 dias, padrão Esta semana) recorta **o que já veio**, sem
> nova ida ao Monday, e por sobreposição: um item de 23/07 não polui o planejamento de agosto. As
> janelas só olham para a frente e **não há "Tudo"** — planejamento é futuro, e a busca já traz tudo
> o que é do usuário numa vez só. **Item sem cronograma aparece em qualquer recorte** — ele nasce no
> dia corrente, e escondê-lo por falta de data seria escondê-lo para sempre. Na linha expandida, a
> categoria vem pré-selecionada pelo Activity Type do item (com o billable acompanhando, §6.2) e o
> **Project Stage** pela coluna homônima. A etapa é campo personalizado desde a Fase 4, mas aparece
> aqui — e é o único que aparece — porque o Monday a exige no envio das horas: importar sem ela é
> adiar um preenchimento que ninguém faz depois. Some, com um aviso apontando para Integrações,
> enquanto `mondayProjectStageFieldId` não apontar para um campo ativo. Só aparecem boards cujo
> Project existe no workspace ativo, e o botão importa só o que está visível (§5.6).
>
> **Item que já tem planejada viva não aparece** (`findImportedMondayItems`), e o rodapé diz quantos
> ficaram de fora. Reimportar não duplicaria só a tarefa: o `upsert` do vínculo passaria a apontar
> para a cópia, e a planejada original ficaria órfã do sync — nunca mais atualizada nem podada. O
> badge "já existe" não cobre isso, porque compara **nomes** e renomear a planejada o apaga. **Item
> cuja planejada foi apagada à mão continua na lista**: ali não há duplicata a evitar, e este modal
> é a única volta — o automático nunca recria o que o usuário apagou.

> **Importação automática (`useMondayItemTracker` + `syncMondayPlannedTasks`):** ao abrir o app e a
> cada **4 h**, faz sozinho o que o modal faz à mão — a mesma busca, os mesmos padrões
> (`buildImportRows`/`resolveItemDefaults`, compartilhados com o modal, §9.4) — para a **semana
> corrente**. Sem prompt: é o rastreamento de agendas do Google levado ao Monday, e não há nada a
> perguntar.
>
> **O intervalo é de 4 h porque este é o ciclo mais caro da integração**, e item de board não muda
> de meia em meia hora: uma varredura custa a leitura dos schemas de todos os boards mapeados mais
> uma busca de itens por variação de template. Quatro horas cobrem o dia de trabalho em três
> varreduras, e **a atualização pontual continua sendo o "Buscar itens agora"**, que dispara este
> mesmo ciclo sob demanda — é ele, e não o relógio, o caminho de "acabaram de me passar uma tarefa".
> Não confundir com o tique de 30 min do `useMondayProjectsTracker`: aquele não vai à rede, só
> percebe a virada do dia.
>
> **"Buscar itens agora" espera a busca de verdade.** O botão vive nas Configurações e a busca vive
> no rastreador, na janela principal: o fim chega pelo evento `MONDAY_IMPORT_SYNC_RESULT`, que o
> rastreador emite em **todo** caminho de saída — erro, nada a fazer e até "não estou conectado" —,
> ou o botão ficaria girando para sempre. O resultado aparece como frase abaixo do botão, além do
> toast, porque o toast some e a Configurações é onde se confere se a integração está de pé.
>
> **O que dedupe é a tabela `monday_imported_items`**, chaveada por (item, workspace) e guardando um
> **snapshot** do item no último sync. O nome não serve: renomear a planejada aqui a faria ser
> criada de novo. **O import manual grava o mesmo vínculo** — sem isso, a varredura seguinte
> recriaria tudo o que o usuário acabou de importar pelo modal.
>
> **A atualização é campo a campo, contra o snapshot.** Só o que mudou no Monday é reescrito, então
> a edição local sobrevive enquanto o board não tocar naquele campo. Activity Type novo arrasta a
> categoria e o billable (§6.2); Activity Type que não casa com categoria nenhuma **limpa** o campo,
> porque manter a anterior afirmaria algo que o board deixou de dizer. A janela recorta só a
> **criação** — uma planejada existente acompanha o item para onde ele for remarcado.
>
> **Item que sumiu da busca** (excluído, reatribuído ou movido para o grupo Activities) leva junto a
> planejada, desde que ela nunca tenha sido concluída; o que já foi trabalhado fica. **A poda só
> olha boards do mapeamento atual** — sem essa guarda, desvincular um board apagaria em massa
> planejadas de itens que continuam vivos lá. E **planejada apagada à mão não volta**: o vínculo
> permanece, com o snapshot em dia, para o item não gerar tarefa outra vez.

> **Gerenciar atividades (`MondayEntriesModal`):** período + boards mapeados → itens do grupo
> Activities, **apenas os do usuário conectado** — os boards são compartilhados. Todos os boards vão
> numa **consulta só** (`listItems(boardIds)`, em lotes de
> 20): uma requisição por board mapeado dispara dezenas de chamadas paralelas para descobrir que
> quase todas voltam vazias. O filtro de janela é por **sobreposição** do intervalo Start Date → End
> Date, não por data de início: uma atividade de 01/07 a 28/07 pertence a todo dia do meio — e fica
> no cliente, porque as regras do Monday não expressam "intervalo que cruza o período" e o intervalo
> mora em duas colunas separadas. Editáveis: nome, horas, billable, Activity Type e Project Stage —
> as datas não, porque marcam o envio. **Excluir também apaga a linha de `monday_activity_items`**;
> sem isso o envio seguinte encontra rastreamento órfão e repete `MondayNotFoundError` a cada
> execução.
>
> **Excluir uma atividade pede confirmação**, contra o §1 e como a exclusão de workspace (§6.7). É a
> segunda exceção deliberada, e pela mesma razão: a linha não é do DeskClock, é um item no board do
> cliente, e apagá-la não tem desfazer nem daqui nem de lá — o que a lixeira do Monday devolve é um id
> que este app já esqueceu. A pergunta é sim/não e fica **na própria linha**, não em modal: o que se
> apaga precisa continuar à vista enquanto se responde (o modal do workspace existe porque lá há um
> destino a escolher). Com a pergunta aberta o bloco de ações fica fixo — some no hover, ele seria
> armadilha nova.
>
> **A lista some o item na hora, sem rebuscar.** O toast dizia "excluída" com a linha ainda na tela: a
> rebusca é que mandava, e ela vinha depois. Rebuscar também reabria a porta para o item voltar — a
> exclusão no Monday não fica visível na consulta seguinte na hora. O que se sabe está decidido no
> `await`; a rebusca fica no botão de recarregar, que é travado (com as pílulas) enquanto a exclusão
> corre.

> **Uma busca serve as quatro janelas, e ela tem um piso.** Como a consulta não filtra por data,
> trocar de janela refazia a mesma ida ao Monday para receber os mesmos itens; agora o período
> recorta só o que já veio, e 30 dias já contém 7 dias e hoje — o mês idem. Mas sem piso a consulta
> baixava **todas** as atividades já enviadas em todos os boards mapeados, desde sempre, e a
> paginação é serial: mais um ano de uso, mais páginas em série a cada abertura do modal. O
> `searchFloorDayISO` é a mais antiga das quatro janelas — no dia 31 o começo do mês, no dia 1º os 30
> dias — com uma semana de folga, que absorve o par de datas invertido à mão no board (a tela o
> desvira, a regra do Monday não) e a virada do dia com o app aberto.
>
> **O recorte é numa coluna só, End Date, e é teto de idade — não o filtro exato.** As regras de
> `query_params` se combinam com **E**, então "cruza a janela" continua sendo impossível de
> expressir; o `periodOverlaps` segue mandando na tela. O id da coluna entra na **chave do lote** do
> `listItemsOwnedBy` pela mesma razão que o id do grupo: regra apontando para coluna que um dos
> boards do lote não tem faz o Monday recusar o lote inteiro. **Board sem a coluna vem sem teto**, em
> lote próprio. E a data vai como `["EXACT", "AAAA-MM-DD"]` — sem o prefixo a API recusa a
> requisição. As janelas são **prontas** (Hoje / 7 dias /
> 30 dias / Este mês): o personalizado não abria nada que elas não cubram e custava dois campos de
> data mais um estado inválido para a tela tratar. Enquanto a busca corre — abertura e botão de
> recarregar — as pílulas ficam **travadas**, ou dá para pular de janela em janela e cada clique
> reordena a lista sob o cursor.
