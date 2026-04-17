# Conceitos de Ícone para o DeskClock

Aqui estão três conceitos de ícones que combinam a letra **D** com o conceito de **Timer/Relógio**, seguindo a estética moderna e limpa do aplicativo.

## Conceito 1: O "D" Cronômetro (Moderno & Minimalista)
Este conceito usa a própria forma da letra **D** para encapsular um timer. A parte reta do D serve como a base do relógio, e a curva contém os marcadores de tempo.

### Design:
- Forma externa de um **D** maiúsculo estilizado com cantos arredondados.
- Dentro da curva do D, um ponteiro de relógio minimalista.
- Gradiente moderno de Azul para Indigo.

```svg
<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- Fundo com gradiente -->
  <defs>
    <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#3b82f6;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#6366f1;stop-opacity:1" />
    </linearGradient>
  </defs>
  
  <!-- Forma do D -->
  <path d="M140 100C140 88.9543 148.954 80 160 80H280C384.934 80 470 165.066 470 270C470 374.934 384.934 460 280 460H160C148.954 460 140 451.046 140 440V100Z" fill="url(#grad1)"/>
  
  <!-- Detalhe do Timer -->
  <circle cx="280" cy="270" r="120" stroke="white" stroke-width="20" stroke-opacity="0.2"/>
  <path d="M280 270L340 210" stroke="white" stroke-width="24" stroke-linecap="round"/>
  <circle cx="280" cy="270" r="15" fill="white"/>
</svg>
```

---

## Conceito 2: Precisão Geométrica
Foca na intersecção entre a geometria do "D" e a precisão de um timer digital.

### Design:
- O "D" é formado por uma linha grossa contínua.
- A parte curva do "D" tem pequenas ranhuras (ticks) como as de um cronômetro.
- Uso de cores vibrantes para destacar a ação (execução).

```svg
<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- Letra D como caminho principal -->
  <path d="M160 80V432M160 80H280C377.203 80 456 158.797 456 256C456 353.203 377.203 432 280 432H160" stroke="#3b82f6" stroke-width="60" stroke-linecap="round" stroke-linejoin="round"/>
  
  <!-- Ticks do relógio na curva -->
  <line x1="456" y1="256" x2="416" y2="256" stroke="#6366f1" stroke-width="20" stroke-linecap="round"/>
  <line x1="395" y1="120" x2="365" y2="150" stroke="#6366f1" stroke-width="20" stroke-linecap="round"/>
  <line x1="395" y1="392" x2="365" y2="362" stroke="#6366f1" stroke-width="20" stroke-linecap="round"/>
  
  <!-- Centro / Botão -->
  <circle cx="160" cy="256" r="40" fill="#3b82f6"/>
</svg>
```

---

## Conceito 3: Foco & Fluxo (Abstrato)
Uma versão mais abstrata onde o "D" flui para dentro de um timer circular, representando a continuidade do tempo trabalhado.

### Design:
- Duas formas orgânicas que juntas lembram um "D".
- O centro vazio sugere foco.
- Cores: Azul e Esmeralda (representando produtividade).

```svg
<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M180 60V452" stroke="#10b981" stroke-width="80" stroke-linecap="round"/>
  <path d="M220 100C330.457 100 420 189.543 420 300C420 410.457 330.457 500 220 500" stroke="#3b82f6" stroke-width="80" stroke-linecap="round" transform="translate(0, -48)"/>
  <circle cx="280" cy="256" r="30" fill="#6366f1" class="animate-pulse"/>
</svg>
```

---

### Qual desses caminhos você prefere?
Posso ajustar cores, espessuras ou combinar elementos entre eles. Uma vez escolhido, posso gerar a versão final e ajudar a configurar como ícone do app no Tauri.
