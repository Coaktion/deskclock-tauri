# POLIMENTOS2.md — Rodada 2 de Ajustes

> Segunda rodada de polimentos pós-Sprint 9. Itens agrupados por branch de execução.
>
> Legenda: `✅` concluído · `🔧` em andamento · `⬜` pendente

---

## Branch 1 — Controles da Janela Principal ✅

| # | Item | Status | Notas |
|---|------|--------|-------|
| W1 | Botão minimizar removido | ✅ | Redundante com fechar para o tray; removido da TitleBar |
| W2 | Botão maximizar removido | ✅ | `toggleMaximize()` não funciona com `decorations: false`; removido |
| W3 | Posição da janela ao abrir via tray | ✅ | `outer_size()` retorna 0 para janela oculta; corrigido com fallback `800×620 × scale_factor` |
| W4 | Fechar ao perder foco | ✅ | Config `closeOnFocusLoss` (padrão: false); listener `tauri://blur` em `App.tsx` |
| W5 | ESC fecha a janela | ✅ | Listener `keydown` no documento; ignora quando `<input>`, `<textarea>` ou `<select>` está focado |
| W6 | Pin/Unpin na title bar | ✅ | Botão `Pin`/`PinOff` visível apenas quando `closeOnFocusLoss = true`; estado de sessão |
| W7 | Narrowing de null em closures do RunningTaskSection | ✅ | Guards `if (!runningTask) return` adicionados nas funções internas |

---

## Branch 2 — Formulários e Atalhos 🔧

| # | Item | Status | Notas |
|---|------|--------|-------|
| F1 | Enter no formulário de edição da tarefa não salva | ⬜ | `RunningTaskEditForm`: falta `onKeyDown` no input nome + `onEnter` nos Autocompletes |
| F2 | Categoria obrigatória ao concluir tarefa | ⬜ | `RunningTaskSection.handleStopClick`: só valida nome e projeto; falta `categoryId` |
| F3 | Atalhos globais não funcionam | ⬜ | `Shift+1` → `!`, `Shift+2` → `@` etc. O plugin não reconhece símbolos; normalizar teclas antes de salvar/registrar |

---

## Branch 3 — Comportamento dos Overlays

| # | Item | Status | Notas |
|---|------|--------|-------|
| O1 | Overlay idle reposicionado ao concluir tarefa | ⬜ | `RUNNING_TASK_CHANGED` com `task=null` chama `setMode` em vez de `switchMode`; não restaura posição salva |
| O2 | Badge do overlay compacto: aspect-ratio e tamanho mínimo | ⬜ | Precisa de `aspect-ratio: 1/1`, `min-width: 16px`, `min-height: 16px`, `padding: 2px` |
| O3 | Clique no overlay não abre em modo de edição | ⬜ | `didMoveRef` é setado pelo evento `tauri://resize` (não só drag); clique legítimo é descartado |
| O4 | Mais destaque para o input de edição de hora inicial | ⬜ | Input pequeno e pouco visível em `RunningTaskSection`; aumentar e destacar visualmente |
| O5 | Snap-to-grid pula antes de soltar o mouse | ⬜ | `setPosition` aplicado a cada evento `tauri://move`; deveria aplicar só no debounce final |
| O6 | Overlay sai da tela e fica sob a barra de tarefas | ⬜ | Sem clamp de posição contra os limites do monitor; corrigir no handler de `tauri://move` |

---

## Branch 4 — Duração no Google Sheets

| # | Item | Status | Notas |
|---|------|--------|-------|
| S1 | Valor de duração enviado como decimal sem formatação | ⬜ | Fração de dia enviada corretamente mas célula sem formato TIME; aplicar `numberFormat [h]:mm:ss` via `batchUpdate` no `ensureSheetExists` |

---

## Branch 5 — Overlay de Execução Compacto (nova feature)

| # | Item | Status | Notas |
|---|------|--------|-------|
| E1 | Criar overlay de execução no modo compacto | ⬜ | 62×62px, border-radius suave. Idle: hora em cima, minutos embaixo, segundos à direita pequenos. Hover: expande mostrando nome + projeto + botões Pause/Stop |

---

## Ordem de execução

```
Branch 1 — fix/window-controls         ✅ mergeado em main
Branch 2 — fix/form-and-shortcuts      ⬜ F1, F2, F3
Branch 3 — fix/overlay-behavior        ⬜ O1, O2, O3, O4, O5, O6
Branch 4 — fix/sheets-duration         ⬜ S1
Branch 5 — feat/compact-execution-overlay ⬜ E1
```

---

*Última atualização: 11/04/2026 — Branch 1 concluído*
