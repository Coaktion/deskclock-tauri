# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

### [1.0.1](https://github.com/EduardoMeira/deskclock-tauri/compare/v1.0.0...v1.0.1) (2026-04-20)

## [1.0.0](https://github.com/EduardoMeira/deskclock-tauri/compare/v0.7.0...v1.0.0) (2026-04-19)


### Features

* API local — CRUD planned-tasks, cancel, fix null body e startup do CP ([30e083d](https://github.com/EduardoMeira/deskclock-tauri/commit/30e083d6498c657c22789acff2faba4231709f8f))
* campos início/fim/duração simultâneos + parser de linguagem natural ([52cd36d](https://github.com/EduardoMeira/deskclock-tauri/commit/52cd36de2c665e3a2032e36e4379ebbca8b45ef8))
* exibir início, fim e duração simultaneamente no lançamento retroativo ([a4e499c](https://github.com/EduardoMeira/deskclock-tauri/commit/a4e499c4a1ab00690b8880fc2518c5166f6547b7))
* fuzzy search no Autocomplete ([ec6867c](https://github.com/EduardoMeira/deskclock-tauri/commit/ec6867c7471517810ea8585954c53f84c7c80654))
* implementar API REST local com Swagger UI ([009c6f9](https://github.com/EduardoMeira/deskclock-tauri/commit/009c6f93381b7f9fc3dfed5f7488ab58655b76d5))
* layout v2 — omnibox, command palette e melhorias visuais ([2462d0a](https://github.com/EduardoMeira/deskclock-tauri/commit/2462d0a2e707c17e855b30448f09cdd0a6340aba))
* merge feat/edit-planned-task-modal — modal de edição de tarefas planejadas ([7cabb22](https://github.com/EduardoMeira/deskclock-tauri/commit/7cabb22560424290d78d550d7154059da0851c67))
* merge feat/local-rest-api — API REST local com CRUD completo e Command Palette ([ec5877c](https://github.com/EduardoMeira/deskclock-tauri/commit/ec5877cea04cafa1350b2e31001500a8a3e26fd8))
* merge feat/v2-layout — layout v2, command palette global e melhorias visuais ([573e9b8](https://github.com/EduardoMeira/deskclock-tauri/commit/573e9b81220f11b52bfd19472f0e8ddc2eeb3d3f))
* modal de edição completa para tarefas planejadas ([bc255ef](https://github.com/EduardoMeira/deskclock-tauri/commit/bc255efc18d137135c7376a9a2d8dbf9260d3a3c))
* substituir checkboxes e botões de texto billable por botão com ícone DollarSign ([8b1f5d8](https://github.com/EduardoMeira/deskclock-tauri/commit/8b1f5d88fd3430c3962e68aeed1a6d7d0286c682))
* substituir indicador billable por ícone de cifrão ([5d024d9](https://github.com/EduardoMeira/deskclock-tauri/commit/5d024d96b2842e775cc24f69438449fa851eb988))
* substituir welcome overlay por command palette global ([6ea5367](https://github.com/EduardoMeira/deskclock-tauri/commit/6ea53677c4f503d856b08d01975659d2985cc4ed))
* tela de setup inicial ao primeiro uso ([b45fc01](https://github.com/EduardoMeira/deskclock-tauri/commit/b45fc01960a870af0083b499a8076c4bd98413a6))
* toggle de API local nas configurações com feedback visual ([2068633](https://github.com/EduardoMeira/deskclock-tauri/commit/2068633a9fdf5834b39d2e2d1f99fb21fb43cf2e))


### Bug Fixes

* adicionar permissões set-min-size e set-max-size nas capabilities ([addf2d1](https://github.com/EduardoMeira/deskclock-tauri/commit/addf2d1417f0e1edcc1d7d2b367b7ba6f5bb82d1))
* corrigir comportamentos no Linux (overlay size, posição, Wayland) ([171e3af](https://github.com/EduardoMeira/deskclock-tauri/commit/171e3afffb8c1591b9a97fb0be0dc1cf863e56d9))
* Enter no campo duração salva com a duração digitada, não a anterior ([6b33e34](https://github.com/EduardoMeira/deskclock-tauri/commit/6b33e34b87c5d4ddf20189684f9f374b4066503f))
* ESC com modal aberto não fecha a janela principal ([b934986](https://github.com/EduardoMeira/deskclock-tauri/commit/b9349860dd71f664506b4b99ff2da06c0d7edc5c))
* ESC fecha o modal corretamente sem fechar a janela ([fc7edca](https://github.com/EduardoMeira/deskclock-tauri/commit/fc7edcab0b75cf5558598193f496acd3d6f3aee2))
* ESC no modal de edição fecha apenas o modal sem fechar a janela ([388226f](https://github.com/EduardoMeira/deskclock-tauri/commit/388226fc36848a4a083b7a344c9195fcf6a60f16))
* exibir tela de erro com código ao falhar carregamento das configurações ([d32f869](https://github.com/EduardoMeira/deskclock-tauri/commit/d32f869a5b6eb3ea0a1b258b8eb2984f5dc031e3))
* merge fix/config-load-error-screen — tela de erro ao falhar config ([90a14c2](https://github.com/EduardoMeira/deskclock-tauri/commit/90a14c23e0a0a5aa468f505d92a4643a228665f0))
* merge fix/linux-behaviors — comportamentos Linux ([5f571cc](https://github.com/EduardoMeira/deskclock-tauri/commit/5f571cc098a8b54822d61363c02e782b0e5fb14b))
* posicionamento de janelas e persistência de posição no Linux ([380ed2c](https://github.com/EduardoMeira/deskclock-tauri/commit/380ed2ccc4711b241dc22b309f747f353760523f))
* resolver conflito de merge — integrar API Local na SettingsPage com abas ([b704743](https://github.com/EduardoMeira/deskclock-tauri/commit/b70474300ed1ade1b5336ccc8e83354234afcc7c))
* travar resize manual dos overlays no Linux/GTK ([0cf1e47](https://github.com/EduardoMeira/deskclock-tauri/commit/0cf1e471453fe124f9ffd3f1b8cba5ab54342422))
* usar setMinSize/setMaxSize para travar resize dos overlays ([62715f0](https://github.com/EduardoMeira/deskclock-tauri/commit/62715f07be474cc7df15a47308a2f54c42ebe1c8))

## [0.7.0](https://github.com/EduardoMeira/deskclock-tauri/compare/v0.6.0...v0.7.0) (2026-04-17)


### Bug Fixes

* bloquear play se tarefa já está rodando e corrigir ações na tela de planejamento ([81017a2](https://github.com/EduardoMeira/deskclock-tauri/commit/81017a2710ed280efd0c8a2a07eabb2d9f8c3239))
* corrigir layout de tarefa individual no modo de envio e toggle por clique na linha ([35fa681](https://github.com/EduardoMeira/deskclock-tauri/commit/35fa681379c1bcbba2484a03f2ac2b4270744b5f))
* corrigir race condition ao abrir main window pelo execution overlay ([3261d1d](https://github.com/EduardoMeira/deskclock-tauri/commit/3261d1d6c32fa8a37c832016b6ebabf534ce6cda))
* emitir PLANNED_TASKS_CHANGED após importação do Google Calendar ([06ac324](https://github.com/EduardoMeira/deskclock-tauri/commit/06ac324c2a107d37493ca7bd6a233577c21a9639))
* emitir PLANNED_TASKS_CHANGED após importação do Google Calendar ([9c74102](https://github.com/EduardoMeira/deskclock-tauri/commit/9c74102be6a956da281cf656a571202dab4c7ec4))
* ESC cancela edição inline sem fechar a janela ([533190f](https://github.com/EduardoMeira/deskclock-tauri/commit/533190ff514fe32480882347b77c7bc7792cb7c4))
* executar ações antes do startTask e guard contra duplo-clique ([0d3c2b3](https://github.com/EduardoMeira/deskclock-tauri/commit/0d3c2b351dd2868ace6722e3fb0cd0c14d3185e9))
* ignorar nós desconectados no handleOutside do PlannedTaskItem ([7bf2f4e](https://github.com/EduardoMeira/deskclock-tauri/commit/7bf2f4e7ce3e53281448519309a1758fb900fd7b))
* tratar formato HH:MM como horas:minutos no parseDurationInput ([444de22](https://github.com/EduardoMeira/deskclock-tauri/commit/444de229f0a5c178b2830cb56b6b22e86850a8dd))

## [0.6.0](https://github.com/EduardoMeira/deskclock-tauri/compare/v0.2.0...v0.6.0) (2026-04-15)


### Features

* adds app icons ([c64fa22](https://github.com/EduardoMeira/deskclock-tauri/commit/c64fa22aaa3a4282353e3521781075d9d9a35daf))
* regenerate all app icons ([1805669](https://github.com/EduardoMeira/deskclock-tauri/commit/180566961d2a9836e120ec47f20249f8889b3d0c))


### Bug Fixes

* adicionar logs detalhados no updater para diagnóstico ([72548ac](https://github.com/EduardoMeira/deskclock-tauri/commit/72548acef07992e1dd3009158be621194a9e7dd0))
* corrigir overlays e sincronização de tarefas planejadas ([1107619](https://github.com/EduardoMeira/deskclock-tauri/commit/11076192fa8d96bfc139a17de2fef76d53fedd25))
* exibir versão real do app na seção de atualizações ([3755775](https://github.com/EduardoMeira/deskclock-tauri/commit/375577541970c87edc32d9ae102a4dd6a597b0bb))
* **overlay:** generalizar HWND_TOPMOST para overlay, toast e welcome ([27f7ed6](https://github.com/EduardoMeira/deskclock-tauri/commit/27f7ed6788645dc8d3c78058236164bcb0684e56))
* **overlay:** usar SetWindowPos síncrono em vez de set_always_on_top ([487ff02](https://github.com/EduardoMeira/deskclock-tauri/commit/487ff02a726f1f2dae5c0435223c54e5231ce6d8))
* **sheets:** aplicar numberFormat [h]:mm:ss após envio ao Sheets e descartar tarefas < 1 min ([5873958](https://github.com/EduardoMeira/deskclock-tauri/commit/58739583ca3952b03968ff8fff17c2d4a488302e))

## [0.5.0](https://github.com/EduardoMeira/deskclock-tauri/compare/v0.2.0...v0.5.0) (2026-04-15)


### Features

* adds app icons ([c64fa22](https://github.com/EduardoMeira/deskclock-tauri/commit/c64fa22aaa3a4282353e3521781075d9d9a35daf))


### Bug Fixes

* **overlay:** generalizar HWND_TOPMOST para overlay, toast e welcome ([27f7ed6](https://github.com/EduardoMeira/deskclock-tauri/commit/27f7ed6788645dc8d3c78058236164bcb0684e56))
* **overlay:** usar SetWindowPos síncrono em vez de set_always_on_top ([487ff02](https://github.com/EduardoMeira/deskclock-tauri/commit/487ff02a726f1f2dae5c0435223c54e5231ce6d8))
* **sheets:** aplicar numberFormat [h]:mm:ss após envio ao Sheets e descartar tarefas < 1 min ([5873958](https://github.com/EduardoMeira/deskclock-tauri/commit/58739583ca3952b03968ff8fff17c2d4a488302e))

## [0.4.0](https://github.com/EduardoMeira/deskclock-tauri/compare/v0.2.0...v0.4.0) (2026-04-14)


### Features

* adds app icons ([c64fa22](https://github.com/EduardoMeira/deskclock-tauri/commit/c64fa22aaa3a4282353e3521781075d9d9a35daf))

## [0.4.0](https://github.com/EduardoMeira/deskclock-tauri/compare/v0.2.0...v0.4.0) (2026-04-14)


### Features

* adds app icons ([c64fa22](https://github.com/EduardoMeira/deskclock-tauri/commit/c64fa22aaa3a4282353e3521781075d9d9a35daf))

## [0.3.0](https://github.com/EduardoMeira/deskclock-tauri/compare/v0.2.0...v0.3.0) (2026-04-14)
