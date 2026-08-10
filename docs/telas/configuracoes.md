# 5.7 Tela de Configurações

> Extraído da §5.7 do CLAUDE.md em 2026-08-10, verbatim.

### 5.7 Tela de Configurações

#### Geral
| Configuração | Tipo | Descrição |
|---|---|---|
| Iniciar na inicialização do computador | toggle | Registra o app no startup do SO |
| Timer ao vivo no ícone da bandeja | toggle | Mostra timer no system tray icon |
| Fechar ao perder foco | toggle | Janela principal fecha ao perder o foco (padrão: desativado); Pin/Unpin na title bar suspende temporariamente |
| Descartar tarefas com menos de 1 minuto | toggle | Cancela automaticamente tarefas paradas em menos de 60 s (padrão: desativado) |
| Arredondar duração ao parar | toggle + slots + tolerância | `roundingEnabled` (padrão: desativado), `roundingSlots` (múltiplos de 5 até 60) e `roundingTolerance` em minutos. Ao parar, `computeRoundedDuration` encaixa a duração no slot; dentro da tolerância acima do slot inferior ela **fica** nele, acima disso sobe para o próximo. Os slots repetem a cada 60 min |
| Mostrar rail de integrações | toggle | Faixa à direita com atalhos das integrações conectadas (padrão: ativo). Aparece em **todas** as telas, inclusive na de Integrações — a redundância com os tiles dali não incomodou na prática, e o rail sumindo numa tela só fazia a faixa parecer instável |

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
| Mostrar ao iniciar tarefa | toggle | Execution Overlay aparece ao iniciar tarefa |
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

Estão em `docs/integracoes/` — o contrato comum em `README.md`, e uma doc por
integração. Eram 58KB desta seção.

#### Feedback
- Botão na **sidebar** (não dentro das configurações) que abre URL externa no navegador padrão para envio de feedbacks, bugs, sugestões.
- Implementado via `tauri-plugin-opener` (`openUrl`).
- Posição: rodapé da sidebar, ícone `MessageSquare` (Lucide).

---
