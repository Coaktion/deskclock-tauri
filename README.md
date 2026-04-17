# DeskClock

Aplicativo desktop de registro de horas trabalhadas, construído com Tauri + React + TypeScript. Adaptável ao modo de trabalho de cada pessoa — não o contrário.

## Funcionalidades

### Registro de tarefas
- Timer ao vivo com play, pausa e stop
- Edição de hora de início com recálculo automático do timer
- Cancelamento imediato de tarefa sem confirmação
- Inicia nova tarefa automaticamente parando a tarefa atual
- Confirmação de conclusão ao parar (Concluída / Pendente)
- Totalizadores diários e semanais (billable / non-billable)

### Lançamento retroativo
- Tela dedicada para registro de tarefas passadas em sequência
- Modos: hora início + hora fim, ou hora início + duração
- Cadeia de horários: o início da próxima tarefa é preenchido automaticamente com o fim da anterior
- Detecção de tarefas que cruzam meia-noite (overnight)
- Navegação de data com DatePicker

### Planejamento
- Visão semanal com navegação ← → e filtros rápidos por dia
- Tipos de agendamento: `specific_date` (atalho "Hoje"), `recurring` (dias da semana), `period` (intervalo de datas)
- Tarefas recorrentes sem data de término
- Concluir/Pendente por dia (sem excluir a tarefa)
- Ações por tarefa: abrir URL ou arquivo ao iniciar

### Importação do Google Calendar
- Importa eventos da semana atual como tarefas planejadas
- Agrupamento por dia com accordion expansível
- Seleção por dia ou individual por evento
- Editor inline por evento: projeto, categoria, tipo de agendamento
- Detecção automática de recorrência via RRULE
- Filtra automaticamente eventos de local de trabalho, ausência e foco

### Histórico
- Filtros rápidos: Hoje, 7 dias, 30 dias, Este mês
- Filtros avançados: período, nome, projeto, categoria, billable
- Agrupamento por dia no fuso local do usuário
- Totalizadores: total, billable, non-billable, qtd registros
- Edição e exclusão por tarefa

### Exportação
- Perfis de exportação reutilizáveis (CRUD)
- Formatos: CSV, XLSX, JSON
- Separador CSV configurável (vírgula ou ponto-e-vírgula)
- Formato de duração: HH:MM:SS, decimal, minutos
- Formato de data: ISO ou DD/MM/AAAA
- Colunas reordenáveis com toggle de visibilidade
- Destino: salvar arquivo, copiar para área de transferência

### Integrações
- **Google Sheets:** envio manual (modo de envio) ou automático ao concluir tarefa; duração como formato de hora nativo da planilha
- **Google Calendar:** importação de eventos como tarefas planejadas (ver seção acima)
- Conexão OAuth única para Sheets + Calendar

### Projetos e Categorias
- Importação em massa (um por linha)
- Adição individual + exclusão sem confirmação
- Prefixo `!` para marcar categoria como non-billable na importação

### Overlays
- **Execution Overlay:** janela flutuante com timer ao vivo, arrastável, persistência de posição
- **Planning Overlay:** lista de tarefas planejadas para hoje, minimizável
- **Compact Overlay:** ícone + badge com contador de tarefas pendentes
- **Welcome Overlay:** saudação por hora do dia ao abrir o app
- **Toast:** notificações de sistema (ex: confirmação de sync) no canto inferior direito
- Opacidade em repouso configurável, snap-to-grid opcional

### Configurações
- Autostart na inicialização do sistema operacional
- Timer ao vivo no ícone da bandeja (system tray)
- Atalhos globais configuráveis: toggle tarefa, parar, mostrar/ocultar overlay e janela
- Temas: Azul, Verde, Escuro, Claro
- Tamanho de fonte: P, M, G, GG
- Saudação personalizada no Welcome Overlay

---

## Stack tecnológica

| Camada | Tecnologia |
|---|---|
| Framework desktop | Tauri v2 |
| Frontend | React 19 + TypeScript |
| Estilização | Tailwind CSS v4 |
| Ícones | Lucide React |
| Banco de dados | SQLite (`tauri-plugin-sql`) |
| Arquitetura | Clean Architecture |
| Testes | Vitest (unit) |
| Links externos | `tauri-plugin-opener` |
| Atalhos globais | `tauri-plugin-global-shortcut` |
| Autostart | `tauri-plugin-autostart` |

---

## Setup local

### Pré-requisitos

- [Node.js](https://nodejs.org/) 18+
- [pnpm](https://pnpm.io/) 9+
- [Rust](https://rustup.rs/) (stable, mínimo 1.77.2)
- Dependências do sistema para o seu SO (ver seção abaixo)

### Dependências do sistema

#### Linux (Ubuntu/Debian)

```bash
sudo apt-get update
sudo apt-get install -y \
  libgtk-3-dev \
  libwebkit2gtk-4.1-dev \
  librsvg2-dev \
  patchelf \
  libxdo-dev \
  libayatana-appindicator3-dev
```

#### WSL2 (Windows Subsystem for Linux)

O Tauri no WSL2 requer um servidor X ou Wayland para renderizar janelas. A forma mais simples é usar o **WSLg**, disponível no Windows 11 e Windows 10 (build 21364+):

```bash
# Verifique se WSLg está ativo
ls /mnt/wslg

# Instale as dependências normais de Linux (acima)
# e as dependências de display
sudo apt-get install -y libgl1-mesa-glx libgl1-mesa-dri
```

> Se o WSLg não estiver disponível, instale um servidor X (ex: VcXsrv) e defina `DISPLAY=:0` antes de rodar `pnpm tauri dev`.

#### Windows

Nenhuma instalação adicional necessária. O Tauri utiliza o WebView2, que já vem integrado no Windows 10 (atualização 1803+) e Windows 11.

### Variáveis de ambiente (integrações Google)

As integrações com Google Sheets e Google Calendar requerem credenciais OAuth do Google Cloud Platform. Sem elas o app funciona normalmente — apenas as integrações ficam indisponíveis.

1. Crie um projeto no [Google Cloud Console](https://console.cloud.google.com/)
2. Ative as APIs: **Google Sheets API** e **Google Calendar API**
3. Crie credenciais OAuth 2.0 do tipo **Desktop app**
4. Copie o Client ID e o Client Secret
5. Crie um arquivo `.env` na raiz do projeto:

```env
GCP_CLIENT_ID=seu-client-id.apps.googleusercontent.com
GCP_CLIENT_SECRET=seu-client-secret
```

> O prefixo `GCP_` é permitido pelo Vite (configurado em `vite.config.ts`). Nunca commite o arquivo `.env`.

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

**O que executa:**
1. `pnpm tsc --noEmit` — verifica tipos TypeScript sem gerar artefatos
2. `pnpm test` — roda os testes unitários com Vitest
3. `pnpm lint` — valida o código com ESLint

Um PR só deve ser mergeado se todos esses passos passarem.

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

O projeto usa **Vitest** com foco em testes unitários das camadas de domínio e utilitários puros.

### O que está coberto

| Camada | Arquivos de teste |
|---|---|
| `domain/usecases/` | Use cases de Task, PlannedTask, Category, Project, ExportProfile |
| `infra/database/` | Repositórios SQLite (com `getDb()` mockado) |
| `infra/integrations/google/` | `parseRRuleDays` (lógica de RRULE) |
| `shared/utils/` | time, groupTasks, exportFormatter, theme, snapToGrid, actions |

### O que não está coberto

| Motivo | Exemplos |
|---|---|
| Dependem de `fetch` externo | `GoogleCalendarImporter`, `GoogleSheetsTaskSender` |
| Acoplados ao runtime Tauri | `RunningTaskContext`, overlays |
| Requerem `@testing-library/react` (não configurado) | Componentes React |

### Rodando os testes

```bash
pnpm test          # execução única
pnpm test:watch    # modo watch
pnpm test:coverage # cobertura
```

---

## Estrutura do projeto

```
src/
├── domain/           # Entidades, repositórios (interfaces) e casos de uso
│   ├── entities/     # Task, PlannedTask, Project, Category, ExportProfile
│   ├── repositories/ # Interfaces (ports)
│   └── usecases/     # Lógica de negócio pura, sem dependências de framework
├── infra/            # Implementações concretas
│   ├── database/     # Repositórios SQLite via tauri-plugin-sql
│   └── integrations/ # Google Sheets, Google Calendar (OAuth, sender, importer)
├── presentation/     # React UI
│   ├── pages/        # Tasks, Planning, Retroactive, History, Data, Settings, Integrations
│   ├── components/   # Autocomplete, DatePickerInput, Sidebar, PlannedTaskForm…
│   ├── overlays/     # Execution, Planning, Compact, Welcome, Toast
│   ├── modals/       # EditTaskModal, ExportModal, ImportCalendarModal…
│   ├── hooks/        # useRunningTask, useHistory, usePlannedTasks…
│   └── contexts/     # RunningTaskContext, ConfigContext
├── shared/           # Types, utils (time, groupTasks, fontSize, theme, toast)
└── tests/            # Espelha src/ — unit tests com Vitest
src-tauri/            # Backend Rust (Tauri)
├── src/lib.rs        # Comandos, tray, atalhos globais, servidor OAuth, janelas
├── capabilities/     # Permissões por janela (default.json)
├── migrations/       # Migrações SQLite
└── Cargo.toml
.github/
├── workflows/ci.yml       # Testes e lint em todo push/PR
└── workflows/release.yml  # Build multiplataforma e publicação de release
```

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
   # ou
   git checkout -b fix/nome-do-bug
   ```

3. Implemente a mudança. Se adicionar lógica de domínio ou utilitários puros, **escreva testes**.

4. Verifique antes de abrir PR:
   ```bash
   pnpm tsc --noEmit   # sem erros de tipo
   pnpm test           # todos os testes passando
   pnpm lint           # sem warnings de lint
   ```

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

- `main` deve sempre compilar e ter todos os testes passando
- PRs pequenos e focados são preferidos a PRs grandes
- Não faça commit de `.env` ou arquivos com credenciais
- Siga a Clean Architecture: `domain/` não importa `infra/` ou `presentation/`

---

## Versionamento

O projeto segue [Semantic Versioning](https://semver.org/lang/pt-BR/):

- **MAJOR** (`v1.0.0`): mudanças incompatíveis
- **MINOR** (`v0.2.0`): novas funcionalidades retrocompatíveis
- **PATCH** (`v0.1.1`): correções de bugs

### Como gerar uma nova versão

O projeto usa [`standard-version`](https://github.com/conventional-changelog/standard-version) para automatizar o bump de versão. Ele atualiza `package.json` e `src-tauri/tauri.conf.json` atomicamente, gera o CHANGELOG e cria a tag Git.

**1. Execute o script de release:**

```bash
pnpm release:patch   # v0.1.0 → v0.1.1
pnpm release:minor   # v0.1.0 → v0.2.0
pnpm release:major   # v0.1.0 → v1.0.0
```

Isso cria um commit `chore(release): x.y.z` com todos os arquivos de versão atualizados e a tag `vx.y.z` localmente.

**2. Faça push do commit e da tag:**

```bash
git push origin main --follow-tags
```

O workflow `release.yml` dispara automaticamente, builda para Linux e Windows em paralelo, e cria um **rascunho de release** no GitHub com os instaladores anexados.

**3. Publique o release:**

Acesse **Releases** no repositório, revise o rascunho e clique em **Publish release**.
