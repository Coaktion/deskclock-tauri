# 5.7 Tela de Configurações

> Extraído da §5.7 do CLAUDE.md em 2026-08-10, verbatim.

### 5.7 Tela de Configurações

#### Geral
| Configuração | Tipo | Descrição |
|---|---|---|
| Iniciar na inicialização do computador | toggle | Registra o app no startup do SO |
| Fechar ao perder foco | toggle | Janela principal fecha ao perder o foco (padrão: desativado); Pin/Unpin na title bar suspende temporariamente |
| Descartar tarefas com menos de 1 minuto | toggle | Cancela automaticamente tarefas paradas em menos de 60 s (padrão: desativado) |
| Arredondar duração ao parar | toggle + slots + tolerância | `roundingEnabled` (padrão: desativado), `roundingSlots` (múltiplos de 5 até 60) e `roundingTolerance` em minutos. Ao parar, `computeRoundedDuration` encaixa a duração no slot; dentro da tolerância acima do slot inferior ela **fica** nele, acima disso sobe para o próximo. Os slots repetem a cada 60 min |
| Primeiro dia da semana | segmentado | `weekStartsOn` — Segunda (padrão) ou Domingo. Vale para o app inteiro, não só para o calendário: ver §6.6.1 em `regras-de-negocio.md` |
| Mostrar rail de integrações | toggle | Faixa à direita com atalhos das integrações conectadas (padrão: ativo). Aparece em **todas** as telas, inclusive na de Integrações — a redundância com os tiles dali não incomodou na prática, e o rail sumindo numa tela só fazia a faixa parecer instável |

> **O timer ao vivo do ícone da bandeja não é mais um toggle** (2026-08-27): saiu
> de Configurações e passou a estar sempre ativo — `App.tsx` atualiza o rótulo
> do ícone a cada segundo enquanto uma tarefa roda, sem gate de config. No
> Windows/macOS isso é tooltip de hover (`set_tooltip`); no Linux, a crate
> `tray-icon` não implementa hover ali — o backend AppIndicator/libayatana
> renderiza `set_title` como **rótulo fixo** ao lado do ícone, sempre visível.

> **A duração gravada manda sobre o intervalo início→fim, e é ela que a edição
> exibe.** O arredondamento reescreve **só** o `durationSeconds` e deixa o
> `endTime` no instante real da parada, então os dois divergem de propósito — e
> divergem também na tarefa **pausada**, onde o `stopTask` soma os trechos
> rodados em vez do intervalo. A duração gravada é a que aparece nas listas, nos
> totalizadores e nas exportações; o `EditTaskModal` era o único lugar que a
> recalculava de `fim − início`, mostrando um valor que o resto do app não mostra
> em canto nenhum e — pior — **regravando-o por cima ao salvar**, o que desfazia o
> arredondamento em silêncio para quem abriu o modal só para corrigir o nome.
>
> Agora o fim exibido é o **derivado** da duração gravada
> (`resolveRegisteredEndHHMM`), e salvar o grava assim. O preço, escolhido: o
> instante real da parada de uma tarefa arredondada ou pausada se perde ao
> salvar — em troca de os três campos, mantidos em sincronia pelo
> `useDurationSync`, nunca se contradizerem na tela. O `endTime` sobra como
> reserva para o registro sem duração gravada.

#### Overlay
| Configuração | Tipo | Descrição |
|---|---|---|
| Mostrar ao iniciar tarefa | toggle | Popup Flyout aparece ao iniciar tarefa (`overlayShowOnStart`). O popup lê a chave de um ref alimentado pelo evento `OVERLAY_CONFIG_CHANGED` — a config dele é a do boot, e sem o evento a troca só valeria no próximo start |
| Opacidade em repouso | slider (%) | Opacidade do overlay quando não está em interação |
| Snap to grid | toggle | Encaixa overlay em grade ao soltar arraste |

#### Acessibilidade
| Configuração | Tipo | Status | Descrição |
|---|---|---|---|
| Modo | select: Escuro, Claro | ✅ implementado | Claridade das superfícies (`mode`) |
| Cor de destaque | select: Azul, Verde, Roxo, Âmbar | ✅ implementado | Hue do acento (`accent`) |

> **O seletor de tamanho da fonte saiu**, e com ele a chave `fontSize` e o
> `shared/utils/fontSize.ts`. A raiz é constante em **16 px** (§8.4): era ela que o controle
> variava, e é dela que dependem os três raios, o ritmo de espaçamento e a escala inteira caírem
> nos valores que o design especifica. A chave gravada em `config` fica órfã e inerte — é
> chave-valor (§4.7), e escrever migration só para apagá-la custaria mais que o registro morto.

#### Atalhos globais
| Ação | Tipo | Descrição |
|---|---|---|
| Iniciar / Pausar / Retomar | hotkey input | Toggle de execução da tarefa |
| Parar | hotkey input | Para a tarefa atual |
| Mostrar / Ocultar overlay | hotkey input | Alterna visibilidade do overlay |
| Mostrar / Ocultar janela | hotkey input | Alterna visibilidade da janela principal |

#### Integrações externas

Estão em `docs-internal/integracoes/` — o contrato comum em `README.md`, e uma doc por
integração. Eram 58KB desta seção.

#### Feedback
- Botão na **sidebar** (não dentro das configurações) que abre URL externa no navegador padrão para envio de feedbacks, bugs, sugestões.
- Implementado via `tauri-plugin-opener` (`openUrl`).
- Posição: rodapé da sidebar, ícone `MessageSquare` (Lucide).

#### Itens da sidebar que não são página

A sidebar deixou de ser só navegação: além do Feedback no rodapé, ela tem **"Receber"**
(`ClipboardPaste`), entre Integrações e Configurações, que abre o `PasteDeepLinkModal` para colar
um `deskclock://` à mão. A `Sidebar` distingue os dois tipos pela forma do item — `page` navega,
`onSelect` age —, e **só o de página acende**: a ação nunca ganha o fundo de acento nem a barrinha
da esquerda, ou ela pareceria uma tela em que se está. O item fica na lista, e não no rodapé com o
Feedback, porque é caminho de entrada de trabalho e não meta-ação do app; o motivo de ele existir
está em `docs-internal/specs/compartilhar-tarefa.md`.

---
