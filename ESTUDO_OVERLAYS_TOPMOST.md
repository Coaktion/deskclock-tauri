# Estudo Técnico: Persistência de Overlays no Topo Absoluto ("Z-Index 101")

Este documento detalha as limitações do sistema atual e propõe um plano concreto para garantir que os overlays do **DeskClock** (Overlay compacto, Welcome e Toasts) permaneçam no topo absoluto da hierarquia de janelas, superando inclusive elementos do sistema como a Barra de Tarefas do Windows ou o Menu Bar do macOS.

---

## 1. O Problema do "Z-Order" no Nível do Sistema Operacional

Diferente do CSS, onde o `z-index` resolve a ordem de empilhamento dentro de uma página, no nível do Sistema Operacional, a ordem das janelas (Z-Order) é gerenciada por "Bandas" (Windows) ou "Levels" (macOS).

### Windows: Z-Order Bands
O Windows não possui uma lista linear simples. Ele organiza janelas em bandas de prioridade:
1.  **Banda Padrão:** Aplicativos normais.
2.  **Banda Topmost:** Janelas com a flag `HWND_TOPMOST` (o que o Tauri usa com `alwaysOnTop: true`).
3.  **Banda da Barra de Tarefas (Taskbar Band):** A própria barra de tarefas reside aqui.
4.  **Banda de Apresentação de UI (UIPresentation):** Menu Iniciar, Centro de Ações.
5.  **Banda de Acessibilidade:** Teclado virtual, ferramentas de lupa.

**O conflito:** Quando o Tauri define `alwaysOnTop`, ele coloca a janela na **Banda Topmost**. Como a Barra de Tarefas está na **Banda Taskbar** (superior), ela naturalmente "ganha" a disputa de visibilidade se houver sobreposição. O loop atual de 500ms em Rust tenta "roubar" o foco de volta, mas ainda dentro da banda Topmost, o que é instável.

### macOS: NSWindowLevel
O macOS utiliza constantes de nível para `NSWindow`:
*   `NSNormalWindowLevel` (0): Janelas padrão.
*   `NSFloatingWindowLevel` (3): Onde residem janelas "Always on Top" padrão.
*   `NSStatusWindowLevel` (25): Acima da Barra de Menus (Menu Bar).
*   `NSPopUpMenuWindowLevel` (101): Acima de quase todos os popups do sistema.

---

## 2. Análise da Implementação Atual

Atualmente, o projeto utiliza uma abordagem de "Re-afirmação por Força Bruta" em `src-tauri/src/lib.rs`:

```rust
if let Some(overlay) = app.get_webview_window("overlay") {
    std::thread::spawn(move || loop {
        overlay.set_always_on_top(true).ok();
        std::thread::sleep(std::time::Duration::from_millis(500));
    });
}
```

### Pontos Positivos:
*   **Baixo Custo:** Chamar `set_always_on_top` repetidamente tem custo computacional desprezível.
*   **Independência de IPC:** É feito em uma thread nativa, não dependendo do canal de comunicação com o JavaScript.

### Pontos Negativos (Lacunas):
1.  **Escopo Limitado:** Só protege a janela `overlay`. As janelas `welcome` e `toast` permanecem vulneráveis.
2.  **Latência:** Um intervalo de 500ms permite que a barra de tarefas cubra o overlay por até meio segundo antes da correção.
3.  **Inconsistência de Banda:** Não tenta elevar a janela para uma banda superior (como Acessibilidade no Windows ou Status no macOS).

---

## 3. Plano Concreto de Implementação

Para atingir o objetivo de "z-index 101", o plano consiste em três pilares: **Elevação de Nível**, **Generalização** e **Otimização de Eventos**.

### Passo 1: Elevação de Nível Nativo (O "Z-Index 101" Real)

Devemos ir além do `always_on_top` padrão do Tauri, acessando APIs nativas para subir de banda/nível.

*   **No Windows:** Utilizar flags de estilo estendido como `WS_EX_TOOLWINDOW` (que remove da lista de Alt-Tab e altera a prioridade de Z-order) e investigar a marcação da janela como uma ferramenta de acessibilidade (UIAccess), embora isso exija assinatura digital do binário.
*   **No macOS:** Alterar o `NSWindowLevel` via código nativo (Objective-C/Swift via crate `objc` ou similar) para `NSStatusWindowLevel` ou superior. Isso garante que o relógio fique acima até do Menu Bar.

### Passo 2: Generalização do Sistema de Monitoramento

O loop de re-afirmação deve ser transformado em um gerenciador centralizado que cuida de todos os tipos de overlays.

1.  Criar uma função em Rust `apply_absolute_topmost(window)`.
2.  Esta função deve ser aplicada a `overlay`, `welcome` e `toast`.
3.  Reduzir o intervalo de polling para **200ms** para maior fluidez, ou idealmente, mudar para um modelo baseado em eventos.

### Passo 3: Re-afirmação Baseada em Eventos

Em vez de apenas um loop temporal, devemos reagir a eventos do sistema:
*   **Focus Loss:** Se o overlay perder o foco (ou outra janela ganhar), re-afirmar sua posição.
*   **Visibility Change:** Se o sistema tentar ocultar a janela.
*   **Eventos de Sistema (Windows):** Monitorar mensagens `WM_WINDOWPOSCHANGING` para interceptar tentativas de mudar o Z-order da janela e forçar o `HWND_TOPMOST`.

### Passo 4: Configuração de Manifest (Windows)

Para que o Windows respeite a janela acima da Taskbar com mais prioridade, podemos ajustar o manifest do aplicativo para incluir configurações de `uiAccess="true"`, permitindo que o app ignore certas restrições de Z-order impostas pelo sistema a apps comuns.

---

## 4. Conclusão

A solução atual de "loop de 500ms" é um bom paliativo, mas para uma experiência de "z-index 101" robusta, precisamos:
1.  **Expandir** a lógica para as janelas de Toast e Welcome.
2.  **Elevar** o nível da janela no macOS para `NSStatusWindowLevel`.
3.  **Refinar** a re-afirmação no Windows usando eventos de mudança de posição de janela em vez de apenas um timer.
