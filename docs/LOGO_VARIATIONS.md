# Variações do Conceito 1: O "D" Cronômetro

Explorando diferentes linguagens visuais baseadas na ideia original de fundir a letra **D** com um **Timer**.

## 1.1: O "D" de Progresso
Nesta versão, a curva do "D" não é apenas estética, mas sugere uma barra de progresso sendo preenchida, reforçando a utilidade do app de medir tempo.

- **Destaque:** Gradiente duplo na curva para sugerir movimento.
- **Cores:** Azul Cobalto para o corpo e Ciano para o progresso.

```svg
<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M140 100V440C140 451.046 148.954 460 160 460H280C384.934 460 470 374.934 470 270C470 165.066 384.934 80 280 80H160C148.954 80 140 88.9543 140 100Z" fill="#1e293b"/>
  <path d="M280 80C384.934 80 470 165.066 470 270" stroke="#3b82f6" stroke-width="40" stroke-linecap="round"/>
  <circle cx="280" cy="270" r="15" fill="white"/>
  <path d="M280 270L330 180" stroke="white" stroke-width="20" stroke-linecap="round"/>
</svg>
```

---

## 1.2: O "D" Cronômetro Tátil
Adiciona elementos de um cronômetro real (o botão de pressão no topo), transformando a letra em um objeto reconhecível.

- **Destaque:** Pequeno retângulo no topo da haste do "D".
- **Estética:** Mais robusta e profissional.

```svg
<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- Botão do Cronômetro -->
  <rect x="180" y="40" width="80" height="40" rx="10" fill="#6366f1"/>
  <!-- Corpo do D -->
  <path d="M140 110C140 98.9543 148.954 90 160 90H280C384.934 90 470 175.066 470 280C470 384.934 384.934 470 280 470H160C148.954 470 140 461.046 140 450V110Z" fill="#4f46e5"/>
  <circle cx="280" cy="280" r="100" stroke="white" stroke-width="15" stroke-opacity="0.3"/>
  <path d="M280 280V180" stroke="white" stroke-width="20" stroke-linecap="round"/>
</svg>
```

---

## 1.3: Profundidade e Camadas (Glassmorphism)
Usa transparências e sombras para um look moderno "Apple-style". O ponteiro parece flutuar sobre um vidro.

- **Destaque:** O "D" é a base, com uma camada circular de vidro por cima.
- **Cores:** Tons de Indigo e Violeta.

```svg
<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M140 100C140 88.9543 148.954 80 160 80H280C384.934 80 470 165.066 470 270C470 374.934 384.934 460 280 460H160C148.954 460 140 451.046 140 440V100Z" fill="#4338ca"/>
  <circle cx="280" cy="270" r="130" fill="white" fill-opacity="0.1" stroke="white" stroke-opacity="0.2" stroke-width="2"/>
  <path d="M280 270L360 270" stroke="#818cf8" stroke-width="25" stroke-linecap="round"/>
  <circle cx="280" cy="270" r="12" fill="white"/>
</svg>
```

---

## 1.4: Contorno Minimalista (Line Art)
Foca na elegância das linhas. O ícone fica muito nítido em tamanhos pequenos (como na Tray ou Taskbar).

- **Destaque:** Uso apenas de strokes grossos, sem preenchimento sólido no "D".
- **Cores:** Azul Elétrico.

```svg
<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M160 80H280C384.934 80 470 165.066 470 270C470 374.934 384.934 460 280 460H160V80Z" stroke="#3b82f6" stroke-width="40" stroke-linejoin="round"/>
  <path d="M280 270L340 210" stroke="#3b82f6" stroke-width="30" stroke-linecap="round"/>
  <circle cx="280" cy="270" r="10" fill="#3b82f6"/>
</svg>
```

---

### Sugestão de Próximo Passo
Se você gostar de uma dessas silhuetas, podemos trabalhar na **paleta de cores final** (azul, verde, escuro conforme o app) e gerar os arquivos em diferentes tamanhos para o Tauri.
