---
marp: true
theme: default
paginate: true
---

# DeskClock
### Registro de horas que se adapta ao seu jeito de trabalhar

**Stack:** Tauri v2 · React 19 · TypeScript · SQLite · Rust

---

## O Problema

A maioria dos apps de time tracking é feita para gestores, não para quem trabalha.

> "O app pede que você se adapte ao fluxo dele."

**O que o DeskClock faz diferente:**

- Timer inicia com zero atrito — sem campos obrigatórios
- Planejamento, registro retroativo e histórico como fluxos distintos
- Vive fora da janela principal via overlays — acompanha o trabalho sem atrapalhar
- Integra com ferramentas que você já usa (Google Sheets, Google Calendar)

---

## Por que Tauri?

| Critério | Electron | **Tauri** |
|---|---|---|
| Bundle size | ~200 MB | **~10 MB** |
| Memória em idle | ~150 MB | **~40 MB** |
| Backend | Node.js | **Rust** |
| WebView | Chromium bundled | WebView2 / WebKitGTK |
| Segurança de memória | ✗ | **✓ (Rust)** |

**Resultado:** app nativo multiplataforma com footprint de uma aplicação Go — e segurança de memória garantida pelo compilador.

---

## Stack Tecnológica

```
Frontend      React 19 + TypeScript
Build         Vite 6
Estilo        Tailwind CSS v4  (só @import, sem tailwind.config.js)
Ícones        Lucide React
Banco         SQLite via tauri-plugin-sql
Arraste       dnd-kit
Export        xlsx (SheetJS) · CSV · JSON
Testes        Vitest 3 + v8 coverage
Linting       ESLint 9 flat config + Prettier
Versão        standard-version (CHANGELOG + bump atômico)
```

**Decisão:** UUID gerado no frontend — schema SQL sem `AUTOINCREMENT`, offline-first por design.

---

## Arquitetura — Clean Architecture

```
src/
├── domain/       # Entidades · interfaces · casos de uso (zero dependências)
├── infra/        # SQLite · Google Sheets · Google Calendar
├── presentation/ # React: páginas · overlays · hooks · contextos
└── shared/       # Types e utils puros
```

**Regra de ouro:** `domain/` não importa nada de `infra/` ou `presentation/`

**Por que vale em projeto solo:**
- Use cases são funções puras → testáveis sem Tauri, sem banco, sem DOM
- Nova integração entra em `infra/` sem tocar em `domain/`
- 342 testes unitários rodam em segundos, em qualquer máquina

---

## O Sistema de Overlays

5 janelas independentes gerenciadas pelo Tauri:

| Janela | Função |
|---|---|
| `main` | Janela principal (7 telas) |
| `compact` | Indicador always-on-top: timer MM:SS (running) · ícone + badge (idle) |
| `popup` | Flyout acoplado ao compact: controles de tarefa + edição inline por campo |
| `toast` | Notificações no canto inferior direito |
| `tray` | Ícone + timer ao vivo na bandeja |

Cada janela tem seu próprio contexto JS — estado sincronizado via **eventos Tauri cross-window**.

> Welcome Overlay substituído pelo Command Palette (Ctrl+K). Execution e Planning Overlay unificados no padrão Compact + Popup Flyout (v1.2.0).

---

## Desafio 1 — HWND_TOPMOST no Windows

**Problema:** `set_always_on_top` do Tauri usa `SWP_ASYNCWINDOWPOS` internamente.
O sistema operacional descarta a operação silenciosamente quando outra janela ganha foco.

**Solução:**

```rust
// Captura qualquer mudança de foco no sistema
SetWinEventHook(EVENT_SYSTEM_FOREGROUND, ..., win_event_proc);

// No callback — reafirma TOPMOST de forma síncrona
SetWindowPos(hwnd, HWND_TOPMOST, 0, 0, 0, 0,
    SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
```

**Resultado:** overlays sempre visíveis, zero CPU em idle — sem polling.

---

## Desafio 2 — Estado Cross-Window

Overlay e janela principal são contextos JS separados — não compartilham estado React.

**Eventos implementados:**

| Evento | Função |
|---|---|
| `running-task-changed` | Sincroniza tarefa ativa entre janelas |
| `task-stopped` | Dispara auto-sync com Google Sheets |
| `planned-tasks-changed` | Atualiza lista do overlay ao criar/concluir tarefas |
| `overlay-focus-task-edit` | Abre a janela principal em modo de edição |
| `overlay-navigate-planning` | Navega para aba de Planejamento |

Eventos chegam a **todas** as janelas, incluindo as ocultas — o estado é processado mesmo antes da janela aparecer na tela.

---

## Desafio 3 — Race Condition no Overlay

**Problema:** clicar no execution overlay deveria abrir a janela principal em modo de edição.

O componente que escuta o evento só existe quando a janela está na aba "Tarefas".
Se estiver em outra aba ou oculta → evento chegava e **desaparecia antes do componente montar**.

**Solução:** elevar o sinal para estado React do `AppInner`

```typescript
// App.tsx — listener do evento
listen(OVERLAY_EVENTS.OVERLAY_FOCUS_TASK_EDIT, async () => {
  setPage("tasks");
  setFocusTaskEdit(true);  // sobrevive até RunningTaskSection montar
  await appWindow.show();
  await appWindow.setFocus();
});

// RunningTaskSection — useEffect baseado em prop, não em listener Tauri
useEffect(() => {
  if (!focusTaskEdit || !runningTask) return;
  setEditing(true);
  onFocusTaskEditHandled();
}, [focusTaskEdit, runningTask]);
```

---

## Integrações Google — OAuth Desktop

**Sem servidor próprio.** Fluxo completo no cliente:

```
1. Rust abre TcpListener em porta aleatória em thread separada
2. Frontend abre URL de consent no navegador padrão
3. Google redireciona para http://localhost:{porta}/callback
4. Rust captura o `code`, emite evento Tauri pro frontend
5. Frontend troca `code` por tokens via fetch
6. Tokens salvos no SQLite
```

**Uma conexão, dois serviços:** Google Sheets + Google Calendar compartilham os mesmos tokens — o usuário autoriza uma única vez.

---

## Integrações Google — Sheets e Calendar

**Google Sheets — duração nativa:**

```typescript
// Envia como fração de dia (não string "01:30:00")
case "duration":
  return task.durationSeconds != null
    ? task.durationSeconds / 86400  // Sheets entende como duração
    : "";
// Após escrita: batchUpdate com numberFormat [h]:mm:ss
```

**Google Calendar — parsing de RRULE:**

```typescript
// Extraído para função pura em rrule.ts — 12 casos de teste
parseRRuleDays("FREQ=WEEKLY;BYDAY=MO,WE,FR", fallback)
// → [1, 3, 5]
```

Função isolada exatamente para ser testável sem `fetch`.

---

## CI/CD

**`ci.yml`** — todo push para `main` e todo PR:

```bash
pnpm tsc --noEmit   # verificação de tipos
pnpm test           # 342 testes unitários
pnpm lint           # ESLint
```

**`release.yml`** — disparado por tag `vX.Y.Z`:

```bash
# Roda em paralelo:
Linux  → .deb + .AppImage
Windows → .msi + .exe (NSIS)
# Cria rascunho de release com todos os artefatos
```

**Fluxo de versão:**

```bash
pnpm release:patch          # bump · CHANGELOG · tag
git push origin main --follow-tags  # dispara release.yml
```

---

## Estratégia de Testes

```
49 arquivos de teste · 342 casos · Vitest 3 + v8 coverage
```

**Coberto:**

| Camada | O que está testado |
|---|---|
| `domain/usecases` | Tasks · PlannedTasks · Categories · Projects · ExportProfiles |
| `infra/database` | Task · PlannedTask · Category · Project · ExportProfile · Config |
| `infra/integrations` | GoogleTokenManager · GoogleSheetsTaskSender · GoogleCalendarImporter · rrule |
| `shared/utils` | time · groupTasks · exportFormatter · theme · actions · snapToGrid |

**Deliberadamente não coberto:** componentes React e overlays — acoplados ao runtime Tauri. Requereria E2E com Tauri Driver + WebdriverIO.

---

## Números

| Métrica | Valor |
|---|---|
| Versão atual | 1.2.0 |
| Bundle size (Windows .msi) | ~10 MB |
| Janelas Tauri | 5 |
| Telas na janela principal | 7 |
| Eventos cross-window | 10+ |
| Arquivos de teste | 49 |
| Casos de teste | 342 |
| Plataformas de build | Windows · Ubuntu/Debian · AppImage |
| Linhas de Rust (backend) | ~1.500 |
| Linhas de TypeScript (frontend) | ~9.000 |

---

## Pontos de Discussão

**Por que não Electron?**
Bundle 20x menor, memória 3–5x menor, sem Node.js bundled, segurança de memória via Rust.

**Clean Architecture num projeto solo vale a pena?**
Os 342 testes unitários que rodam em 8 segundos, sem Tauri, sem banco real, respondem isso.

**Como gerenciar estado entre janelas separadas?**
Eventos Tauri como barramento de mensagens — sem biblioteca de estado global, sem polling.

**OAuth desktop sem backend próprio é seguro?**
`client_secret` em variável de ambiente compilada. Aceitável para desktop instalável — não para web.

**Como o overlay fica sempre no topo no Windows?**
`SetWinEventHook` intercepta toda mudança de foco do SO e reafirma `HWND_TOPMOST` de forma síncrona. Custo: zero CPU em idle.

---

# Obrigado

**Repositório:** `github.com/EduardoMeira/deskclock-tauri`
**Stack:** Tauri v2 · React 19 · TypeScript · SQLite · Rust
**Versão atual:** 1.2.0
