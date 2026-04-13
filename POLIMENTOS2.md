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

## Branch 2 — Formulários e Atalhos ✅

| # | Item | Status | Notas |
|---|------|--------|-------|
| F1 | Enter no formulário de edição da tarefa não salva | ✅ | `onKeyDown` Enter no input nome + `onEnter={handleSave}` nos dois Autocompletes |
| F2 | Categoria obrigatória ao concluir tarefa | ✅ | Validação de `categoryId` em `handleStopClick`; campo Categoria adicionado ao formulário de preenchimento obrigatório |
| F3 | Atalhos globais não funcionam | ✅ | `buildAccelerator` usa `e.code` (Digit1, KeyA…) em vez de `e.key` (!,@,#) ao normalizar teclas com Shift |

---

## Branch 3 — Comportamento dos Overlays ✅

| # | Item | Status | Notas |
|---|------|--------|-------|
| O1 | Overlay idle reposicionado ao concluir tarefa | ✅ | `switchMode` com `modeRef` para leitura segura em closure; posição salva restaurada ao transitar para planning/compact |
| O2 | Badge do overlay compacto: aspect-ratio e tamanho mínimo | ✅ | `min-w-[16px] min-h-[16px] h-4 px-[3px]` — circular para números, pill para "9+" |
| O3 | Clique no overlay não abre em modo de edição | ✅ | `isMouseDownRef` guarda `didMoveRef`: só marca se mouse está pressionado; reposicionamentos programáticos não descartam cliques |
| O4 | Mais destaque para o input de edição de hora inicial | ✅ | Botão com borda ao hover + ícone `Pen` sutil; input com `border-blue-500`, largura `w-24` e `ring` no focus |
| O5 | Snap-to-grid pula antes de soltar o mouse | ✅ | Posição acumulada em `lastRawPosRef`; snap aplicado só no debounce final, sem pulos durante arraste |
| O6 | Overlay sai da tela e fica sob a barra de tarefas | ✅ | Clamp via `currentMonitor()` no debounce de `tauri://move`; janela sempre dentro dos limites do monitor |

---

## Branch 4 — Duração no Google Sheets

| # | Item | Status | Notas |
|---|------|--------|-------|
| S1 | Valor de duração enviado como decimal sem formatação | ⬜ | Fração de dia enviada corretamente mas célula sem formato TIME; aplicar `numberFormat [h]:mm:ss` via `batchUpdate` no `ensureSheetExists` |

---

## Branch 5 — Overlay de Execução Compacto (nova feature) ✅

| # | Item | Status | Notas |
|---|------|--------|-------|
| E1 | Criar overlay de execução no modo compacto | ✅ | 62×62px, rounded-2xl. Idle: HH topo, MM base, ss canto inferior direito. Hover → resize 280×80 com nome · projeto + Pause/Stop + botão expandir. Botão Minimize2 no ExecutionOverlay para entrar no modo. |

---

## Ordem de execução

```
Branch 1 — fix/window-controls         ✅ mergeado em main
Branch 2 — fix/form-and-shortcuts      ✅ F1, F2, F3
Branch 3 — fix/overlay-behavior        ✅ O1, O2, O3, O4, O5, O6
Branch 4 — fix/sheets-duration         ⬜ S1
Branch 5 — feat/compact-execution-overlay ✅ E1
```

---

*Última atualização: 12/04/2026 — Branches 1, 2, 3 e 5 concluídos*
