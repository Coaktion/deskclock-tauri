# Especificação Técnica: Posicionamento Robusto de Janelas (Linux & Windows)

> **Status: ✅ Implementada em v1.0.0** — `src/shared/utils/windowPosition.ts` + lógica equivalente em Rust (`positionNearTaskbar`).  
> A solução `workArea` foi adotada. Adicionalmente: fallback `primaryMonitor()` para janelas ocultas no GTK, retry de 150ms no `setPosition`, e `currentMonitor()` → `primaryMonitor()` para overlays. Referência: CLAUDE.md — Registro de Decisões 17/04/2026.

Este documento detalha a implementação de um sistema centralizado de posicionamento de janelas para o DeskClock, garantindo que as janelas de Boas-vindas, Principal e Toast sejam sempre exibidas no canto inferior direito da área útil da tela, respeitando a posição da barra de tarefas (taskbar/panel) em qualquer sistema operacional (especialmente Linux).

## 1. Problema Atual
Atualmente, o posicionamento:
- Utiliza `window.screen.availWidth`, que pode ser inconsistente em ambientes com múltiplos monitores ou scaling fracionado no Linux.
- Não considera que no Linux a barra de tarefas pode estar no topo, fazendo com que o "bottom-right" calculado manualmente sobreponha a barra ou fique desalinhado.
- Está duplicado em vários arquivos (`App.tsx`, `WelcomeApp.tsx`, `ToastApp.tsx`).

## 2. Solução: API `workArea` do Tauri v2
A solução consiste em utilizar a propriedade `workArea` do objeto `Monitor` do Tauri v2. 
- **`workArea.size`**: Retorna a largura/altura disponível em pixels físicos (já descontando barras de sistema).
- **`workArea.position`**: Retorna o offset (X, Y) onde a área útil começa. Se a barra estiver no topo (ex: 40px), `workArea.position.y` será 40.

## 3. Novo Utilitário: `src/shared/utils/windowPosition.ts`

Este arquivo centralizará a lógica de cálculo.

```typescript
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Window, currentMonitor } from "@tauri-apps/api/window";
import { PhysicalPosition } from "@tauri-apps/api/dpi";

/**
 * Posiciona uma janela no canto inferior direito da área útil (workArea) do monitor atual.
 * @param win Instância da janela (Window ou WebviewWindow)
 * @param margin Margem em pixels lógicos (será convertida para físicos)
 */
export async function positionWindowBottomRight(
  win: Window | WebviewWindow,
  margin: number = 16
): Promise<void> {
  const [monitor, outerSize] = await Promise.all([
    currentMonitor(),
    win.outerSize(),
  ]);

  if (!monitor) return;

  const { workArea, scaleFactor } = monitor;
  const { width: winW, height: winH } = outerSize;
  
  const physMargin = Math.round(margin * scaleFactor);

  // x = Início da área útil + (Largura útil - Largura da janela - Margem)
  const x = workArea.position.x + Math.max(0, workArea.size.width - winW - physMargin);
  
  // y = Início da área útil + (Altura útil - Altura da janela - Margem)
  const y = workArea.position.y + Math.max(0, workArea.size.height - winH - physMargin);

  await win.setPosition(new PhysicalPosition(x, y));
}
```

## 4. Alterações nos Componentes

### 4.1. `src/App.tsx` (Janela Principal)
Substituir a função local `positionWindowBottomRight` pelo utilitário compartilhado.

```typescript
// Remover a função local positionWindowBottomRight e importar a nova:
import { positionWindowBottomRight } from "@shared/utils/windowPosition";
import { getCurrentWindow } from "@tauri-apps/api/window";

const appWindow = getCurrentWindow();

// Uso nos useEffects:
await positionWindowBottomRight(appWindow);
await appWindow.show();
```

### 4.2. `src/presentation/overlays/WelcomeApp.tsx` (Janela de Boas-vindas)
Remover o cálculo manual no `useEffect` e utilizar o utilitário.

```typescript
import { positionWindowBottomRight } from "@shared/utils/windowPosition";

function WelcomeAppInner() {
  // ...
  useEffect(() => {
    positionWindowBottomRight(appWindow);
  }, []);
  // ...
}
```

### 4.3. `src/presentation/overlays/ToastApp.tsx` (Notificações)
Ajustar o posicionamento do Toast para também respeitar a área útil.

```typescript
import { positionWindowBottomRight } from "@shared/utils/windowPosition";

export function ToastApp() {
  // ...
  useEffect(() => {
    // Para o Toast, podemos usar uma margem diferente se necessário
    // ou passar o offset da barra de tarefas se quisermos "empilhar"
    positionWindowBottomRight(appWindow, 20); 
  }, []);
  // ...
}
```

## 5. Benefícios no Linux
Com esta abordagem, se a barra de tarefas estiver no **topo**:
- `workArea.position.y` será, por exemplo, `40`.
- `workArea.size.height` será `1080 - 40 = 1040`.
- O cálculo `40 + (1040 - winH - margin)` resultará na posição correta no final da tela, sem empurrar a janela para fora por baixo.

Se a barra estiver na **esquerda**:
- `workArea.position.x` será `60`.
- O cálculo `60 + (1920 - 60 - winW - margin)` manterá a janela na direita da tela corretamente.

## 6. Verificação
1. **Windows**: Confirmar que a janela abre acima da Taskbar.
2. **Linux (Ubuntu/Gnome)**:
   - Testar com barra de tarefas padrão (esquerda/baixo).
   - Mudar barra para o Topo nas configurações do sistema e verificar se a janela continua no canto inferior direito.
3. **Multi-monitores**: Mover a janela principal para o segundo monitor e abrir o Welcome ou Toast; eles devem aparecer no canto inferior direito do monitor onde a janela principal está (ou no monitor primário, dependendo do requisito).
