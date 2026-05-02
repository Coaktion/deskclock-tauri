# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## [1.4.0](https://github.com/EduardoMeira/deskclock-tauri/compare/v1.3.1...v1.4.0) (2026-05-01)


### Features

* **clockify:** add AutoSyncRunner, Clockify auto-sync, and refactor daily sync ([48e86de](https://github.com/EduardoMeira/deskclock-tauri/commit/48e86dea81d0b99aa2f945acc61c412b100a0904))
* **clockify:** add Clockify card and connect modal with API key flow ([d8002bb](https://github.com/EduardoMeira/deskclock-tauri/commit/d8002bb04cc2bfd5b4e5964833e20fde59bb78f5))
* **clockify:** add ClockifyClient HTTP layer with typed errors ([37a5be2](https://github.com/EduardoMeira/deskclock-tauri/commit/37a5be265ac4b4ba2f1bab72c63675a36020d712))
* **clockify:** add ClockifySendModal and manual send button ([3870399](https://github.com/EduardoMeira/deskclock-tauri/commit/3870399a5d29eeb8dc3eb5a0725bbb9139041dd5))
* **clockify:** add ClockifyTaskSender implementing ITaskSender ([aa7ac9e](https://github.com/EduardoMeira/deskclock-tauri/commit/aa7ac9e7decbb9ac764314a918f986342eacdaa5))
* **clockify:** add config keys and types for Clockify integration ([1a8472a](https://github.com/EduardoMeira/deskclock-tauri/commit/1a8472ad3d04f7ea20b9dd82125a80e706d74a3b))
* **clockify:** add import, project/category mappings and default tags UI ([f3194ce](https://github.com/EduardoMeira/deskclock-tauri/commit/f3194ce124809d1795990826ed9469d7de1e043e))
* **clockify:** add workspace picker with refresh ([d3202a1](https://github.com/EduardoMeira/deskclock-tauri/commit/d3202a19844967282bb83b90fc90d7ed00120ec2))
* **clockify:** adiciona ClockifyEntriesModal read-only com filtros e agrupamento ([c21a61e](https://github.com/EduardoMeira/deskclock-tauri/commit/c21a61ef5de5a1757d0697eb741a00444c219972))
* **clockify:** adiciona criação de apontamentos no ClockifyEntriesModal ([12467f1](https://github.com/EduardoMeira/deskclock-tauri/commit/12467f1c8288d388dc43c8073aadff6a8acf0101))
* **clockify:** adiciona exclusão de apontamentos no ClockifyEntriesModal ([78befa1](https://github.com/EduardoMeira/deskclock-tauri/commit/78befa17584173387e2dcec4eca87705613e249f))
* **clockify:** adiciona métodos list/update/delete time entries no ClockifyClient ([e8b2924](https://github.com/EduardoMeira/deskclock-tauri/commit/e8b29246e0d24cd82692483c5402c846c5979e73))
* **clockify:** edição inline de apontamentos no ClockifyEntriesModal ([a725b22](https://github.com/EduardoMeira/deskclock-tauri/commit/a725b22fcf218f56f438cd5d32c5f2f8ab030566))
* **integrations:** drill-down navigation e homogeneidade de inputs ([9c5ae61](https://github.com/EduardoMeira/deskclock-tauri/commit/9c5ae61efca1ce81aae82ef952a6e33098a33c5b))
* **validation:** aplica obrigatoriedades por integração ([db88261](https://github.com/EduardoMeira/deskclock-tauri/commit/db882617216a3c84520e5ca437bedcf4499033ff))
* **validation:** notifica usuário via toast quando tarefa é ignorada por campos faltantes ([d015843](https://github.com/EduardoMeira/deskclock-tauri/commit/d015843631f4563472682ec597d17ef2070ac5a2))
* **zendesk:** adiciona integração OAuth e importação de tickets ([af7271e](https://github.com/EduardoMeira/deskclock-tauri/commit/af7271eefdd76119b17c2a11288809bd65078741))


### Bug Fixes

* **clockify:** autocomplete no mapeamento, sort alfabético e dropdown via portal ([21ca79a](https://github.com/EduardoMeira/deskclock-tauri/commit/21ca79ae7f504ed58da290810fa4c36a3a8adbc4))
* **clockify:** modal de apontamentos respeita 8px de margem em todos os lados ([6ac3714](https://github.com/EduardoMeira/deskclock-tauri/commit/6ac3714fc30c3080738614193509c32cbef6e087))
* **clockify:** ui adjustments — clientName concat, mapping accordions, dropdown position ([042d6b6](https://github.com/EduardoMeira/deskclock-tauri/commit/042d6b657adc5668495062a5fe0d2b1951c68211))
* **validation:** unifica toasts de sucesso e aviso num único toast ([7582dc5](https://github.com/EduardoMeira/deskclock-tauri/commit/7582dc58181b1c03dd9939386668c8e146473209))
* **zendesk:** adapta cor do logo ao tema atual ([327ec92](https://github.com/EduardoMeira/deskclock-tauri/commit/327ec9221d5e78461287b5a8f547d35e1659cebf)), closes [#03363](https://github.com/EduardoMeira/deskclock-tauri/issues/03363)
* **zendesk:** restaura SVG oficial e adiciona instruções de OAuth client ([60cb751](https://github.com/EduardoMeira/deskclock-tauri/commit/60cb7514a353b492a0deefcb13be4b4610cdc4bc)), closes [#03363](https://github.com/EduardoMeira/deskclock-tauri/issues/03363)

### [1.3.1](https://github.com/EduardoMeira/deskclock-tauri/compare/v1.3.0...v1.3.1) (2026-04-30)


### Bug Fixes

* **db:** retry Database.load on migration race condition at startup ([03d1fb9](https://github.com/EduardoMeira/deskclock-tauri/commit/03d1fb9b165e5fead3ecaf23690f224f6117d332))
* **oauth:** migrate Google OAuth to PKCE, remove client_secret ([8ec9e3c](https://github.com/EduardoMeira/deskclock-tauri/commit/8ec9e3cc44f0e9add16337d202ad8586f054103d))
* **oauth:** restore client_secret alongside PKCE for Google Desktop clients ([e57c45a](https://github.com/EduardoMeira/deskclock-tauri/commit/e57c45adf67dc749ff3f74376ff31a4678f613af))
* **shortcuts:** update overlay labels and save config after registration ([5b1c322](https://github.com/EduardoMeira/deskclock-tauri/commit/5b1c3227310c5d1cf7a68cf277a15291db9b7145))

## [1.3.0](https://github.com/EduardoMeira/deskclock-tauri/compare/v1.2.0...v1.3.0) (2026-04-24)

## [1.2.0](https://github.com/EduardoMeira/deskclock-tauri/compare/v1.1.0...v1.2.0) (2026-04-23)


### Features

* edição inline por campo no popup overlay da tarefa em execução ([420de40](https://github.com/EduardoMeira/deskclock-tauri/commit/420de4080315c517579fc35d4a6abd46fed36f1b))
* overlay split-windows — compact + popup flyout com edição inline ([8da9a3c](https://github.com/EduardoMeira/deskclock-tauri/commit/8da9a3c03802d99914532157e35785d9d3fe0136))
* redesenho do compact overlay com estado pausado e grip bar ([b7c5831](https://github.com/EduardoMeira/deskclock-tauri/commit/b7c583105e8f6ab2760a457b615c6f0d25b8c92f))
* redesign compact overlay com timer MM:SS pulsante + popup focado em execução + fix snap off-screen ([9a000ee](https://github.com/EduardoMeira/deskclock-tauri/commit/9a000ee754d74f0171be421c8ba0eeea19947836))
* separar overlay em 3 janelas independentes (compact, execution, planning) ([8c5815b](https://github.com/EduardoMeira/deskclock-tauri/commit/8c5815b03bd0be71a7e2be2f5a26481984f45825))


### Bug Fixes

* corrigir capabilities e tamanho dos overlays no GTK ([01a6399](https://github.com/EduardoMeira/deskclock-tauri/commit/01a639978e98a92471293e53af938b4fbcb85af1))
* corrigir restore de posição do compact overlay e clamping de snap ([fb33507](https://github.com/EduardoMeira/deskclock-tauri/commit/fb335079297c72f0209a08e9b32f442218d0aa09))
* emitir PLANNED_TASKS_CHANGED após importação do Google Calendar ([51bc387](https://github.com/EduardoMeira/deskclock-tauri/commit/51bc387cac6d40e75e8252762b06ad3ac2c08f9d))
* múltiplos polimentos de UI e infraestrutura ([68944f3](https://github.com/EduardoMeira/deskclock-tauri/commit/68944f34463c3fcdc46ed5bbd57c75bbcb6b9c81))
* pulso do anel do compact overlay usa inset box-shadow (glow interno) ([6d1a00c](https://github.com/EduardoMeira/deskclock-tauri/commit/6d1a00cfd3c7bf3a8e72197a689d778d917c7164))

## [1.1.0](https://github.com/EduardoMeira/deskclock-tauri/compare/v1.0.0...v1.1.0) (2026-04-22)

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
