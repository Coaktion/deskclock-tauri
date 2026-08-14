# DeskClock

Aplicativo desktop de registro de horas trabalhadas, construído com Tauri + React + TypeScript. Adaptável ao modo de trabalho de cada pessoa — não o contrário.

**Manual de uso:** <https://coaktion.github.io/deskclock-tauri/> — publicado do diretório `docs/`
deste repositório. Documentação interna de arquitetura fica em `docs-internal/`, fora do caminho
publicado.

## Funcionalidades

### Registro de tarefas
- Timer ao vivo com play, pausa e stop
- Edição de hora de início com recálculo automático do timer
- Cancelamento imediato de tarefa sem confirmação
- Apenas uma tarefa em execução por vez — com uma rodando, o play das demais fica desabilitado e o tooltip diz o porquê (é esta mesma, ou é outra)
- Confirmação de conclusão ao parar (Concluída / Pendente), com hora de término editável inline para corrigir timers esquecidos
- Arredondamento opcional da duração ao parar, com slots e tolerância configuráveis
- Faturamento é do grupo, não da linha: alternar o chip de billable alterna todas as tarefas de mesmo nome + projeto + categoria
- Totalizadores diários e semanais (billable / non-billable) contra metas configuráveis

### Lançamento retroativo
- Tela dedicada para registro de tarefas passadas em sequência
- Modos: hora início + hora fim, ou hora início + duração
- Cadeia de horários: o início da próxima tarefa é preenchido automaticamente com o fim da anterior
- Detecção de tarefas que cruzam meia-noite (overnight)
- Navegação de data com DatePicker
- Coluna do formulário recolhível e arrastável, com largura persistida por tela
- Painel de sugestões (planejadas do dia) redimensionável na vertical; planejada com horário é lançada em um clique
- Seleção múltipla: excluir em massa e mover tarefas para outro workspace

### Planejamento
- Visão semanal em cartão por dia, com navegação ← →, pílula "Semana atual" e filtros rápidos por dia
- Só dias úteis — sábado e domingo não aparecem, e a regra vale também na entrada (import da Agenda)
- Tipos de agendamento: `specific_date` (campo de data já preenchido), `recurring` (dias da semana), `period` (intervalo de datas)
- Tarefas recorrentes sem data de término
- Concluir/Pendente por dia (sem excluir a tarefa)
- Ações por tarefa (abrir URL ou arquivo), com nome opcional: aparecem como chips clicáveis na faixa do card do popup flyout durante a execução, disparáveis sob demanda
- Coluna do formulário recolhível e arrastável, como no Lançamento manual

### Importação do Google Calendar
- Importa eventos do período escolhido como tarefas planejadas, com os horários preservados
- Agrupamento por dia com accordion expansível
- Seleção por dia ou individual por evento
- Editor inline por evento: projeto, categoria, tipo de agendamento
- Detecção automática de recorrência via RRULE, aparada para dias úteis
- Uma planejada por reunião, e não por série do Google
- Filtra eventos de local de trabalho e ausência; blocos de foco (focus time) **são** importados, pois costumam representar tarefas reais
- Abre pelo rail de integrações e pela tela de Integrações — não pelo Planejamento, porque é lá que fica o seletor de workspace que governa o destino

### Rastreamento automático de reuniões
- Ativável no card do Google (requer conta conectada): "Rastrear reuniões automaticamente"
- Busca os eventos com horário do dia ao abrir o app e a cada 2 minutos, importando como planejadas (sem duplicar)
- No horário de início (até 1 min antes), exibe aviso junto ao overlay para iniciar a tarefa — se houver tarefa em execução, ela é finalizada e a da reunião assume
- Reunião iniciada à mão é reconhecida e anexada, não re-perguntada
- Ao fim do evento, pergunta se ainda está em andamento; re-pergunta a cada 15 minutos até encerrar (nunca para sozinho)
- Projeto, categoria e campos personalizados vêm da planejada; sem ela, projeto e categoria saem da descrição do evento (`Projeto:` / `Categoria:`)
- Exceção deliberada ao workspace por integração: cria no workspace **ativo**

### Backup do banco no Google Drive
- Snapshot do SQLite enviado para a pasta visível `DeskClock Backups`, pela mesma conexão OAuth do Google
- Agendamento **por vencimento** (24 h / 7 d / 30 d desde o último sucesso), não por horário marcado: um backup vencido roda na primeira abertura do app
- Botão "Fazer backup agora"; poda automática dos snapshots antigos
- Banco de desenvolvimento tem pasta própria, para não empurrar backup de produção para fora da poda
- **Os tokens das integrações são expurgados do snapshot antes do envio** — restaurar exige reconectar
- Restauração é procedimento manual e declarado (ver o manual)

### Histórico
- Filtros rápidos: Hoje, 7 dias, 30 dias, Este mês
- Filtros avançados: período, nome, projeto, categoria, billable
- Agrupamento por dia em cartão, no fuso local do usuário
- Totalizadores: total, billable, non-billable, qtd registros
- Edição e exclusão por tarefa; seleção múltipla com exclusão em massa e mover para workspace
- Exportação do conjunto filtrado ou de um dia específico

### Exportação
- Perfis de exportação reutilizáveis (CRUD), escopados por workspace
- Formatos: CSV, XLSX, JSON
- Separador CSV configurável (vírgula ou ponto-e-vírgula)
- Formato de duração: HH:MM:SS, decimal, minutos
- Formato de data: ISO ou DD/MM/AAAA
- Colunas reordenáveis com toggle de visibilidade, incluindo os campos personalizados
- Campo personalizado criado **depois** do perfil não entra sozinho: adicioná-lo às colunas é explícito
- Destino: salvar arquivo, copiar para área de transferência

### Integrações
- **Google Sheets:** envio manual pela tela de Integrações ou automático ao concluir tarefa; duração como formato de hora nativo da planilha
- **Google Calendar:** importação de eventos como tarefas planejadas + rastreamento automático de reuniões com avisos de início/fim (ver seções acima)
- Conexão OAuth única para Sheets + Calendar
- **Clockify:** envio de time-entries via API Key; importação de projetos/tags como entidades do DeskClock; mapeamento por workspace; tags padrão; auto-sync por tarefa ou diário; **modal "Gerenciar apontamentos" com CRUD direto sobre as time entries do Clockify** (criar, editar inline, excluir; filtros por período e por tags padrão)
- **Monday.com:** envio de horas como atividades no board do projeto, via API Key; a configuração são **dois ids de board** — o Portfólio, que lista os projetos, e o Report de Horas, que guarda o catálogo de rótulos; cada Activity Type vira uma Categoria casada pelo nome, e o Project Stage vira um campo personalizado; a lista de projetos se atualiza sozinha uma vez por dia; auto-sync por tarefa ou diário, com botão "Sincronizar agora"; **"Importar itens como planejadas"** traz os itens de trabalho do board para o planejamento (data vinda da coluna Timeline), e pode rodar sozinho a cada 4 h; **"Gerenciar atividades"** lista, edita e exclui no Monday as atividades enviadas por você

#### Contrato comum a todas as integrações
- **Cada integração escolhe o seu workspace do DeskClock**, no primeiro controle do card. É ele que
  define o destino dos imports e o recorte do envio, independentemente do workspace aberto na tela.
  Vazio resolve para o "Padrão"; o seletor some com um único workspace
- **Envio é parcial por natureza:** a recusa é por grupo, e só o que o destino confirmou recebe o
  badge "Enviado". `refused` (o destino recusou o dado — resolve editando a tarefa) e `failed`
  (falha técnica — resolve tentando de novo) são canais separados, em amarelo e vermelho
- Rail de integrações à direita, em todas as telas, com as ações de cada integração conectada e a
  causa técnica do erro no tooltip

### Projetos e Categorias
- Importação em massa (um por linha)
- Adição individual + exclusão sem confirmação
- Seleção múltipla com exclusão em massa; a seleção é sempre a interseção com o que está visível
- Prefixo `!` para marcar categoria como non-billable na importação
- **Cor por projeto**, atribuída pelo menor slot livre de uma paleta de 24 tons e editável
- **Categorias por projeto:** associação na linha do projeto recorta o autocomplete de categoria em
  14 pontos de entrada. Conjunto vazio devolve o catálogo inteiro — o filtro nunca deixa o usuário
  sem opção. O Histórico fica de fora, porque lá o campo é filtro de busca

### Campos personalizados
- Tipos: texto, texto longo, lista de opções e caixa de seleção
- Aparecem em tarefas e planejadas, nos formulários, nos modais de edição, no overlay e como
  colunas na exportação
- **Globais, não escopados por workspace** — é o que permite mover uma tarefa entre workspaces sem
  perder o valor preenchido
- Arquivar tira o campo dos formulários e preserva os valores já gravados

### Workspaces
- Separe contextos de trabalho: cada workspace tem seus próprios projetos, categorias, tarefas,
  planejadas e perfis de exportação
- Seletor na sidebar e nos overlays, com cor por workspace. **Some da tela enquanto existir só
  um** — quem não usa workspaces não vê workspace nenhum
- Trocar com uma tarefa em execução pergunta antes se ela ficou concluída ou pendente
- Mover ou copiar tarefas entre workspaces, reaproveitando projeto e categoria de mesmo nome no
  destino
- Excluir exige destino para os dados (mover ou apagar) — uma das duas exclusões que confirmam — e
  avisa quais integrações param junto
- **Cada integração escolhe o seu workspace** (ver o contrato comum acima). A exceção é o rastreio
  automático de reuniões da Agenda, que cria no workspace ativo

### Overlays
- **Compact Overlay:** sempre visível (always-on-top), arrastável com persistência de posição; contador de planejadas quando parado, cronômetro `MM:SS` com anel pulsante na cor de destaque quando em execução, âmbar quando pausado. Tamanho fixo — a configuração foi removida
- **Popup Flyout:** aberto ao clicar no Compact. Abas Planejadas/Executadas em **todo** estado; rodapé disputado por "Nova tarefa" (parado) e pelo card do cronômetro (em execução); **altura única em todo estado**, para o overlay não sair do canto onde o usuário o deixou
- Três painéis de edição sem sair do overlay — tarefa em execução, planejada e executada (por grupo) —, todos cobrindo o popup no tamanho que ele já tem
- Ações da planejada de origem numa faixa que abre no hover do card, anunciada por um raio na borda
- Chip de workspace no cabeçalho; aviso de reunião na mesma janela, sem roubar o foco
- **Toast:** notificações de sistema no canto inferior direito
- Opacidade em repouso configurável, snap-to-grid opcional

### API REST local
- Servidor HTTP embutido acessível em `http://localhost:27420` (porta configurável), só em `localhost`
- Documentação interativa em `/docs` (Swagger UI) e especificação em `/openapi.json`
- `GET /status` com o estado do timer
- Controle do timer: `POST /tasks/{start,pause,resume,stop,toggle,cancel}`
- CRUD completo de tarefas planejadas em `/planned-tasks`, com lista por data aplicando as regras de recorrência e marcar/desmarcar conclusão
- `GET /projects` e `GET /categories`
- **Desligada por padrão** — habilitável em Configurações → API

### Configurações
Seis abas: Geral, Aparência, Overlay, Atalhos, API e Atualizações.

- Autostart na inicialização do sistema operacional
- Timer ao vivo no ícone da bandeja (system tray)
- Fechar ao perder foco, com Pin na title bar para suspender
- Rail de integrações ligável/desligável
- Descarte de tarefas com menos de 1 minuto; arredondamento de duração com slots e tolerância
- Metas diária e semanal de jornada
- Redefinir posições salvas das janelas
- Atalhos globais configuráveis: toggle tarefa, parar, mostrar/ocultar overlay e janela
- **Aparência em dois eixos independentes:** modo (Escuro, Claro) × cor de destaque (Azul, Verde,
  Roxo, Âmbar). O tema legado e o seletor de tamanho de fonte foram removidos — a raiz é constante
  em 16px, e é dela que dependem raios, ritmo de espaçamento e a escala tipográfica
- Atualização in-app: checar, baixar e instalar sem passar por instalador manual

### Design system
- Tokens semânticos em `@theme static` (`src/index.css`): superfícies, texto, acento, status, 24
  cores de projeto e três raios (chip 6 · control 8 · card 12)
- Escala tipográfica fechada de dez degraus e três pesos (400/500/600); todo número em
  `font-mono` + `tabular-nums`
- Source Sans 3 e Source Code Pro **empacotadas** — nenhuma requisição de rede em runtime
- Primitivos canônicos em `presentation/components/ui/`: `Button`, `IconButton`, `Input`, `Select`,
  `Textarea`, `Modal`, `PageHeader`, `SectionCard`, `TaskRow`, `Badge`, `BillableChip` e outros
- Testes de convenção travam a regressão: token derrubado, tamanho fora da escala, peso fora dos
  três, cor crua do Tailwind em cromo, caixa própria fora dos primitivos, e a geometria das telas
  contra o spec extraído do design (`docs-internal/design-spec/`)

Detalhes na skill `design-system` (`.claude/skills/design-system/`).

---

## Stack tecnológica

| Camada | Tecnologia |
|---|---|
| Framework desktop | Tauri v2 |
| Frontend | React 19 + TypeScript |
| Estilização | Tailwind CSS v4 (tokens semânticos em `@theme static`) |
| Tipografia | Source Sans 3 + Source Code Pro (`@fontsource-variable`, empacotadas) |
| Ícones | Lucide React |
| Banco de dados | SQLite (`tauri-plugin-sql`) |
| Arquitetura | Clean Architecture |
| Testes | Vitest (unit) + Testing Library, e bancada visual em Playwright |
| Links externos | `tauri-plugin-opener` |
| Atalhos globais | `tauri-plugin-global-shortcut` |
| Autostart | `tauri-plugin-autostart` |
| Atualizações | `tauri-plugin-updater` |
| API REST local | axum + utoipa (Swagger UI) |

---

## Setup local

### Pré-requisitos

- [Node.js](https://nodejs.org/) 18+ (o CI roda em 20)
- [pnpm](https://pnpm.io/) 9+ — **nunca `npm`**
- [Rust](https://rustup.rs/) (stable, mínimo 1.77.2)
- Dependências do sistema para o seu SO (ver seção abaixo)

### Dependências do sistema

#### Linux (Ubuntu/Debian)

```bash
sudo apt-get update
sudo apt-get install -y \
  build-essential \
  curl \
  wget \
  file \
  pkg-config \
  libssl-dev \
  libgtk-3-dev \
  libwebkit2gtk-4.1-dev \
  librsvg2-dev \
  patchelf \
  libxdo-dev \
  libayatana-appindicator3-dev
```

> `build-essential`, `pkg-config` e `libssl-dev` são necessários para compilar crates Rust com dependências nativas. Sem eles o `cargo build` falha.

#### WSL2 (Windows Subsystem for Linux)

Instale todas as dependências do Linux acima e adicione as dependências de display. A forma mais simples é usar o **WSLg**, disponível no Windows 11 e Windows 10 (build 21364+):

```bash
# Verifique se WSLg está ativo
ls /mnt/wslg

# Dependências de display adicionais
sudo apt-get install -y libgl1-mesa-glx libgl1-mesa-dri
```

> Se o WSLg não estiver disponível, instale um servidor X (ex: VcXsrv) e defina `DISPLAY=:0` antes de rodar `pnpm tauri dev`.

#### Windows

O Rust no Windows utiliza o toolchain **MSVC**, que depende do compilador C++ da Microsoft.

**1. Visual Studio Build Tools**

Baixe e instale o [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/). Durante a instalação, selecione o workload:

- **Desenvolvimento para desktop com C++**
  - MSVC v143 (ou mais recente)
  - SDK do Windows 10/11

> Alternativa: instalar o [Visual Studio Community](https://visualstudio.microsoft.com/vs/community/) com o mesmo workload.

**2. Rust**

Instale via [rustup](https://rustup.rs/). O instalador detecta automaticamente o toolchain MSVC. Após a instalação, confirme:

```powershell
rustup default stable-x86_64-pc-windows-msvc
rustc --version
```

**3. WebView2**

Já integrado no Windows 10 (atualização 1803+) e Windows 11. Nenhuma ação necessária.

### Integração Clockify (sem variáveis de ambiente)

A integração com o Clockify usa **API Key** gerada diretamente no painel do usuário — sem credenciais de servidor necessárias.

1. Acesse [app.clockify.me/user/preferences#advanced](https://app.clockify.me/user/preferences#advanced)
2. Role até a seção **API** e clique em **Generate**
3. Copie a chave e cole em **Configurações → Integrações → Clockify → Conectar**

Após conectar, selecione o workspace ativo, importe projetos e tags do Clockify e configure os mapeamentos.

Para visualizar e editar as time entries diretamente no DeskClock (sem precisar abrir o painel do Clockify), use **Gerenciar apontamentos** no card Clockify — abre um modal com filtro por período, criar/editar/excluir e o filtro "Apenas com tags padrão" ligado por padrão quando há tags padrão configuradas.

### Integração Monday.com (sem variáveis de ambiente)

Também por **API Key** pessoal, gerada na própria conta do Monday — o token nunca sai da máquina.

1. No Monday, abra o menu do seu avatar → **Administrator** → **API** (ou `/admin/integrations/api`)
2. Copie o **Personal API Token v2**
3. Cole em **Configurações → Integrações → Monday → Conectar**

Depois de conectar, informe os **dois ids de board** — o **Portfólio**, que lista os projetos, e o
**Report de Horas**, que guarda o catálogo canônico dos rótulos — e rode a importação de Projetos,
Categorias e Project Stage. Cada Activity Type do quadro vira uma Categoria casada pelo nome, e a
importação já semeia **quais categorias cada projeto oferece**.

O envio de horas cria um item no grupo **Activities** do board do projeto; reenviar **atualiza** o
item em vez de duplicar. A lista de projetos se relê sozinha uma vez por dia — projeto novo no
Portfólio aparece sem intervenção, e projeto sem board de destino continua existindo e recebendo
tarefas (só as horas não sobem).

> O Report de Horas **não é destino de escrita**: as horas vão direto ao board do projeto, e ele
> serve só de catálogo.

Dois modais no card do Monday:

- **Importar itens como planejadas** — traz os itens de trabalho do board (tudo fora do grupo
  Activities) para o planejamento. A data vem da coluna Timeline do item: um dia vira data única,
  vários viram período.
- **Gerenciar atividades** — lista as atividades **que você enviou**, por período, e permite
  corrigir nome, horas, tipo de cobrança, Activity Type e Project Stage, ou excluir direto no
  Monday.

### Variáveis de ambiente (integrações Google)

Google Sheets, Google Agenda e o backup no Drive requerem credenciais OAuth do Google Cloud
Platform. Sem elas o app funciona normalmente — apenas essas três ficam indisponíveis.

1. Crie um projeto no [Google Cloud Console](https://console.cloud.google.com/)
2. Ative as APIs: **Google Sheets API**, **Google Calendar API** e **Google Drive API**
3. Crie credenciais OAuth 2.0 do tipo **Desktop app**
4. Copie o Client ID e o Client Secret
5. Crie um arquivo `.env` na raiz do projeto:

```env
GCP_CLIENT_ID=seu-client-id.apps.googleusercontent.com
GCP_CLIENT_SECRET=seu-client-secret
```

> O prefixo `GCP_` é permitido pelo Vite (configurado em `vite.config.ts`). Nunca commite o arquivo `.env`.

> O escopo do Drive é o `drive.file` — o app só enxerga os arquivos que ele próprio criou. Quem
> conectou o Google antes do backup existir **precisa reconectar**: o `refresh_token` guardado
> carrega os escopos concedidos no consentimento, e acrescentar um à lista não revalida nada.

### Variáveis de ambiente (boards do Monday)

Os dois ids de board que a integração lê saem do mesmo `.env`, com o prefixo `MONDAY_`:

```env
MONDAY_PORTFOLIO_BOARD_ID=
MONDAY_REPORT_BOARD_ID=
```

Eles descrevem a **conta**, não o produto — cravados no código, viajariam no bundle de todo
instalador publicado. **Sem eles o app abre normalmente**, com os dois campos vazios na tela de
Integrações; a integração pede os ids ali e só habilita o envio quando os tem.

> No CI eles entram como **Variables** do repositório (`vars.`), não como Secrets: o objetivo é
> mantê-los fora do código-fonte, e id de board não é segredo. Lembre que Variables **não são
> mascaradas** nos logs de execução — que são públicos neste repositório.

### Instalação

```bash
git clone <repo>
cd deskclock-tauri
pnpm install
```

### Desenvolvimento

```bash
# Frontend apenas (Vite dev server, sem janela nativa)
pnpm dev

# App Tauri completo com hot reload
pnpm tauri dev
```

### Testes

```bash
# Execução única
pnpm test

# Watch mode
pnpm test:watch

# Cobertura
pnpm test:coverage
```

Os testes são **unitários**, focados em casos de uso de domínio e utilitários puros. Veja a seção [Testes](#testes-1) para mais detalhes.

### Linting e formatação

```bash
pnpm lint
pnpm lint:fix
pnpm format
pnpm format:check
```

---

## Build local

Para gerar o instalador nativo para o SO atual:

```bash
pnpm tsc --noEmit   # verifica tipos
pnpm test           # roda os testes unitários
pnpm tauri build    # gera o instalador
```

> **Importante:** `pnpm tauri build` gera instaladores **apenas para a plataforma onde está rodando**. Para gerar o instalador Windows, execute no Windows (não no WSL2) ou use o CI (ver seção abaixo).

Os artefatos são gerados em `src-tauri/target/release/bundle/`:

| SO | Pasta | Formatos |
|---|---|---|
| Windows | `bundle/msi/` e `bundle/nsis/` | `.msi`, `.exe` |
| Ubuntu / Debian | `bundle/deb/` | `.deb` |
| Linux (universal) | `bundle/appimage/` | `.AppImage` |

---

## CI/CD — Integração e Entrega Contínua

O projeto possui dois workflows no GitHub Actions, localizados em `.github/workflows/`.

### `ci.yml` — Integração Contínua

Roda automaticamente em todo **push para `main`** e em todo **pull request** aberto contra `main`.

**O que executa, nesta ordem:**
1. `pnpm tsc --noEmit` — verifica tipos TypeScript sem gerar artefatos
2. `pnpm test` — roda os testes unitários com Vitest
3. `pnpm lint` — valida o código com ESLint
4. `pnpm format:check` — confere a formatação com Prettier

O `format:check` fica por último de propósito: os passos param no primeiro que falha, e um arquivo
desalinhado escondendo um teste quebrado inverteria a ordem de importância do que a execução tem a
dizer. Falhando ali, `pnpm format` resolve.

Um PR só deve ser mergeado se todos esses passos passarem. A branch `main` exige PR.

### `release.yml` — Release Multiplataforma

Gera instaladores nativos e publica uma release no GitHub. Pode ser ativado de duas formas:

#### 1. Via tag Git (fluxo principal)

```bash
git checkout main && git pull
git tag v0.1.0
git push origin v0.1.0
```

O workflow é disparado automaticamente, builda para Linux e Windows em paralelo, e cria um **rascunho de release** no GitHub com os instaladores anexados.

#### 2. Via interface do GitHub (dispatch manual)

1. Acesse **Actions → Release** no repositório
2. Clique em **Run workflow**
3. Escolha se deseja criar como rascunho ou publicar diretamente

#### Artefatos produzidos por release

| Plataforma | Arquivo | Uso |
|---|---|---|
| Linux | `DeskClock_x.y.z_amd64.deb` | Ubuntu, Debian, Mint e derivados |
| Linux | `DeskClock_x.y.z_amd64.AppImage` | Qualquer distro (incluindo Arch) — sem instalação |
| Windows | `DeskClock_x.y.z_x64.msi` | Instalador MSI (recomendado para empresas) |
| Windows | `DeskClock_x.y.z_x64-setup.exe` | Instalador NSIS (recomendado para usuários finais) |

---

## Testes

O projeto usa **Vitest**, com foco nas camadas de domínio e utilitários puros — e uma família de
testes de convenção que trava regressão visual e estrutural.

### O que está coberto

| Camada | Arquivos de teste |
|---|---|
| `domain/usecases/` | Use cases de Task, PlannedTask, Category, Project, ExportProfile, Workspace, CustomField, Monday, Calendar, backup |
| `domain/utils/` | Agrupamento, vínculo com planejada, cor de projeto, resolução de enviados |
| `infra/database/` | Repositórios SQLite (com `getDb()` mockado) |
| `infra/integrations/` | Lógica pura das integrações — RRULE, políticas de schema do Monday, runner do backup |
| `shared/utils/` | time, groupTasks, exportFormatter, snapToGrid, actions, posição de janela |
| **Convenções** | `designTokens`, `fontSizes`, `fontWeights`, `meaningColors`, `componentPrimitives`, `inputAutocomplete`, `screenGeometry`, `secretConfigKeys` |

Os testes de convenção são o que impede a dívida visual de voltar: token semântico derrubado,
tamanho fora da escala de dez degraus, peso fora de 400/500/600, cor crua do Tailwind em cromo,
`<button>` com caixa própria fora dos primitivos, campo sem `autoComplete="off"`, e a geometria de
cada tela contra o spec extraído do design. Os dois últimos travam por baseline que **só encolhe**
— falham nos dois sentidos.

### O que não está coberto

| Motivo | Exemplos |
|---|---|
| Dependem de `fetch` externo | `GoogleCalendarImporter`, `GoogleSheetsTaskSender` |
| Acoplados ao runtime Tauri | `RunningTaskContext`, overlays |
| Fluxo de renderização de UI | Excluído de propósito da medição de cobertura |

### Rodando os testes

```bash
pnpm test          # execução única
pnpm test:watch    # modo watch
pnpm test:coverage # cobertura
pnpm visual        # bancada visual: componente em Chromium vs. wireframe do design
```

`pnpm visual` fica **fora** do `pnpm test` de propósito: diff de pixel depende de fonte e de
browser, e num gate obrigatório viraria a falha que todo mundo aprende a ignorar. Rode ao mexer em
aparência — ele mede o que o `screenGeometry` não alcança (altura real da linha, largura que a
coluna do grid recebe, quebra de texto).

---

## Estrutura do projeto

```
src/
├── domain/           # Entidades, portas e casos de uso — sem framework
│   ├── entities/     # Task, PlannedTask, Project, Category, Workspace, CustomField, ExportProfile
│   ├── integrations/ # Contratos das integrações (ITaskSender e afins)
│   ├── repositories/ # Interfaces (ports)
│   ├── usecases/     # Lógica de negócio pura
│   └── utils/        # Regras puras compartilhadas (agrupamento, cor de projeto…)
├── infra/            # Implementações concretas
│   ├── database/     # Repositórios SQLite via tauri-plugin-sql
│   └── integrations/ # google/, googledrive/, clockify/, monday/, zendesk/ + senders e runners
├── presentation/     # React UI
│   ├── pages/        # Tasks, Retroactive, Planning, History, Data, Integrations, Settings
│   ├── sections/     # Blocos das telas de Configurações e Integrações
│   ├── components/   # ui/ (primitivos canônicos), Omnibox, Autocomplete, Sidebar, rail…
│   ├── overlays/     # Compact, Popup e os painéis de edição
│   ├── modals/       # EditTaskModal, ExportModal, ImportCalendarModal, MondaySendModal…
│   ├── hooks/        # useRunningTask, useHistory, usePlannedTasks, useMeetingTracker…
│   ├── contexts/     # RunningTaskContext, ConfigContext, WorkspaceContext
│   └── tours/        # Tours por tela
├── shared/           # Types, constants, utils — puros
├── index.css         # Tokens do design system (@theme static) e @font-face
└── tests/            # Espelha src/ — unit tests com Vitest + tests/conventions/
src-tauri/            # Backend Rust (Tauri)
├── src/
│   ├── api/          # Servidor REST local (axum): handlers, models, routes, openapi
│   ├── commands/     # Comandos Tauri expostos ao frontend (backup, shortcuts, updater…)
│   └── lib.rs        # Tray, atalhos globais, deep links, servidor OAuth, janelas
├── capabilities/     # Permissões por janela (default.json)
├── migrations/       # Migrações SQLite
└── Cargo.toml
docs/                 # PUBLICADO no GitHub Pages — manual de uso, favicons e fontes
docs-internal/        # Documentação interna: telas, integrações, specs, design-spec
harness/              # Casos da bancada visual
scripts/              # extract-design-spec, visual-check, generate-project-palette
.github/
├── workflows/ci.yml       # Tipos, testes, lint e formatação em todo push/PR
└── workflows/release.yml  # Build multiplataforma e publicação de release
```

> **`docs/` é a pasta publicada.** O GitHub Pages serve `main:/docs` em
> <https://coaktion.github.io/deskclock-tauri/>, e o repositório é público — arquivo colocado ali
> vai ao ar no merge. Documentação interna vai em `docs-internal/`.

---

## Como contribuir

### Fluxo de trabalho

1. Antes de criar um branch, verifique se há branches antigas já mergeadas para limpar:
   ```bash
   git branch --merged main | grep -v '^\* \|  main$'
   # apague as desnecessárias: git branch -d nome-da-branch
   ```

2. Crie um branch a partir de `main`:
   ```bash
   git checkout -b feat/nome-da-feature
   # ou fix/nome-do-bug, ou refactor/nome-do-refactor
   ```

3. Implemente a mudança. Se adicionar lógica de domínio ou utilitários puros, **escreva testes**.

4. Verifique antes de abrir PR:
   ```bash
   pnpm tsc --noEmit   # sem erros de tipo
   pnpm test           # todos os testes passando
   pnpm lint           # sem warnings de lint
   pnpm format:check   # formatação alinhada
   ```

   Mexeu em aparência? Some a isso o `pnpm visual` e a inspeção manual em `pnpm tauri dev`, nos
   **2 modos × 4 acentos**.

5. Abra um Pull Request contra `main`. O CI valida automaticamente os três passos acima.

6. Após o merge, apague o branch local:
   ```bash
   git branch -d nome-da-feature
   ```

### Convenções de commit

O projeto usa [commits semânticos](https://www.conventionalcommits.org/):

| Prefixo | Uso |
|---|---|
| `feat:` | Nova funcionalidade |
| `fix:` | Correção de bug |
| `refactor:` | Refatoração sem mudança de comportamento |
| `test:` | Adição ou correção de testes |
| `docs:` | Documentação (CLAUDE.md, README.md) |
| `chore:` | Configuração, dependências, CI |

### Regras gerais

- `main` deve sempre compilar e ter todos os testes passando; ela exige PR
- PRs pequenos e focados são preferidos a PRs grandes
- Não faça commit de `.env` ou arquivos com credenciais
- Siga a Clean Architecture: `domain/` não importa `infra/` ou `presentation/`
- Estilização por **token semântico**, nunca valor literal — a paleta crua do Tailwind não tem mais
  uso legítimo em cromo
- Documentação nova de arquitetura, tela ou integração vai em `docs-internal/`. `docs/` é o que o
  GitHub Pages publica

---

## Versionamento

O projeto segue [Semantic Versioning](https://semver.org/lang/pt-BR/):

- **MAJOR** (`v2.0.0`): mudanças incompatíveis
- **MINOR** (`v1.12.0`): novas funcionalidades retrocompatíveis
- **PATCH** (`v1.11.1`): correções de bugs

### v2.0.0

A próxima versão é **major**, e o que a justifica não é uma feature — é o conjunto de coisas que
mudaram debaixo de quem já usa o app:

- **A aparência virou dois eixos** (modo × cor de destaque). O tema `escuro` legado não sobrevive à
  migração: quem estava nele perde o tom. O seletor de tamanho de fonte saiu.
- **Quem já conectou o Google precisa reconectar** para o backup no Drive funcionar — o escopo novo
  só vale num consentimento novo.
- **A configuração do Monday mudou de forma**: de cinco escolhas para dois ids de board.
- **O command palette saiu**, e com ele o atalho global que o abria. O app passa a sempre abrir na
  janela principal.
- **A configuração de tamanho do overlay saiu**; o overlay tem um tamanho só.
- **`showWeekend` saiu**: o planejamento é só de dias úteis, sem volta.

### Como gerar uma nova versão

O projeto usa [`standard-version`](https://github.com/conventional-changelog/standard-version) para automatizar o bump de versão. Ele atualiza `package.json` e `src-tauri/tauri.conf.json` atomicamente, gera o CHANGELOG e cria a tag Git.

**1. Execute o script de release:**

```bash
pnpm release:patch   # v1.11.0 → v1.11.1
pnpm release:minor   # v1.11.0 → v1.12.0
pnpm release:major   # v1.11.0 → v2.0.0
```

Isso cria um commit `chore(release): x.y.z` com todos os arquivos de versão atualizados e a tag `vx.y.z` localmente.

> O rodapé do manual (`docs/index.html`) carrega a versão à mão — o `standard-version` não o
> alcança. Confira que ele bate com a tag antes do push.

**2. Faça push do commit e da tag:**

`main` exige PR, então o commit de release entra por PR; a tag vai depois:

```bash
git push origin main --follow-tags
```

O workflow `release.yml` dispara automaticamente, builda para Linux e Windows em paralelo, e cria um **rascunho de release** no GitHub com os instaladores anexados.

**3. Publique o release:**

Acesse **Releases** no repositório, revise o rascunho e clique em **Publish release**.
