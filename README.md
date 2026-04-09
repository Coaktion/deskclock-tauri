# DeskClock

Aplicativo desktop de registro de horas trabalhadas, construído com Tauri + React + TypeScript. Adaptável ao modo de trabalho de cada pessoa — não o contrário.

## Funcionalidades

### Registro de tarefas
- Timer ao vivo com play, pausa e stop
- Edição de hora de início com recalculo automático do timer
- Cancelamento imediato de tarefa sem confirmação
- Inicia nova tarefa automaticamente parando a tarefa atual
- Totalizadores diários e semanais (billable / non-billable)

### Lançamento retroativo
- Tela dedicada para registro de tarefas passadas em sequência
- Modos: hora início + hora fim, ou hora início + duração
- Cadeia de horários: o início da próxima tarefa é preenchido automaticamente com o fim da anterior
- Detecção de tarefas que cruzam meia-noite (overnight)
- Navegação de data com DatePicker

### Planejamento
- **Hoje:** formulário inline com Nome, Projeto, Categoria e Ações automáticas
- **Semana:** navegação por semana, filtros por dia, tipos `specific_date` / `recurring` / `period`
- Tarefas recorrentes sem data de término
- Concluir/Pendente por dia (sem excluir a tarefa)
- Ações por tarefa: abrir URL ou arquivo ao iniciar

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

### Projetos e Categorias
- Importação em massa (um por linha)
- Adição individual + exclusão sem confirmação
- Prefixo `!` para marcar categoria como non-billable na importação

### Overlays
- **Execution Overlay:** janela flutuante com timer ao vivo, arrastável, persistência de posição
- **Planning Overlay:** lista de tarefas planejadas para hoje, minimizável
- **Compact Overlay:** ícone + badge com contador de tarefas pendentes
- **Welcome Overlay:** saudação por hora do dia ao abrir o app
- Opacidade em repouso configurável, snap-to-grid opcional

### Configurações
- Autostart na inicialização do sistema operacional
- Timer ao vivo no ícone da bandeja (system tray)
- Atalhos globais configuráveis: toggle tarefa, parar, mostrar/ocultar overlay e janela
- Tamanho de fonte: P, M, G, GG
- Saudação personalizada no Welcome Overlay

---

## Stack tecnológica

| Camada | Tecnologia |
|---|---|
| Framework desktop | Tauri v2 |
| Frontend | React 18 + TypeScript |
| Estilização | Tailwind CSS v4 |
| Ícones | Lucide React |
| Banco de dados | SQLite (`tauri-plugin-sql`) |
| Arquitetura | Clean Architecture |
| Testes | Vitest |
| Links externos | `tauri-plugin-opener` |
| Atalhos globais | `tauri-plugin-global-shortcut` |
| Autostart | `tauri-plugin-autostart` |

---

## Setup local

### Pré-requisitos

- [Node.js](https://nodejs.org/) 18+
- [pnpm](https://pnpm.io/) 8+
- [Rust](https://rustup.rs/) (stable)
- Dependências do Tauri para o seu SO: [tauri.app/start/prerequisites](https://tauri.app/start/prerequisites/)

### Instalação

```bash
git clone <repo>
cd deskclock-tauri
pnpm install
```

### Desenvolvimento

```bash
# Frontend (Vite dev server)
pnpm dev

# App Tauri completo (abre a janela nativa)
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

### Linting e formatação

```bash
pnpm lint
pnpm lint:fix
pnpm format
```

---

## Build

```bash
# Verifica tipos e gera bundle de produção
pnpm build

# Gera instalador nativo para o SO atual
pnpm tauri build
```

Os artefatos são gerados em `src-tauri/target/release/bundle/`.

| SO | Formato(s) |
|---|---|
| Windows | `.msi`, `.exe` (NSIS) |
| Ubuntu / Debian | `.deb`, `.AppImage` |
| Arch Linux | `.pkg.tar.zst`, `.AppImage` |

---

## Estrutura do projeto

```
src/
├── domain/           # Entidades, repositórios (interfaces) e casos de uso
│   ├── entities/     # Task, PlannedTask, Project, Category, ExportProfile
│   ├── repositories/ # Interfaces (ports)
│   └── usecases/     # Lógica de negócio pura, sem dependências de framework
├── infra/            # Implementações concretas
│   └── database/     # Repositórios SQLite via tauri-plugin-sql
├── presentation/     # React UI
│   ├── pages/        # Tasks, Planning, Retroactive, History, Data, Settings
│   ├── components/   # Autocomplete, DatePickerInput, Sidebar…
│   ├── overlays/     # Execution, Planning, Compact, Welcome
│   ├── modals/       # EditTaskModal, ExportModal…
│   ├── hooks/        # useRunningTask, useHistory, usePlannedTasks…
│   └── contexts/     # ConfigContext (configurações globais)
├── shared/           # Types, utils (time, groupTasks, fontSize)
└── tests/            # Espelha src/ — unit tests com Vitest
src-tauri/            # Backend Rust (Tauri)
├── src/lib.rs        # Comandos, tray, atalhos globais, janelas
├── capabilities/     # Permissões por janela
└── Cargo.toml
```

---

## Convenções

- Commits semânticos: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`
- Branches: `feat/<nome>`, `fix/<nome>`, `refactor/<nome>`
- `main` sempre estável e buildável

---

## Pendências (próximas versões)

- [ ] Temas de cor (Azul, Verde, Escuro, Claro)
- [ ] Ações de tarefa planejada (abrir URL / arquivo ao iniciar)
- [ ] Modo de envio (selecionar tarefas → integração externa)
- [ ] Integração Google Sheets
- [ ] Integração Google Calendar
- [ ] Build multiplataforma automatizado (CI)
