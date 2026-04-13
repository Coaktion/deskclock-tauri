use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};

pub fn setup_tray(app: &tauri::App) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Mostrar", true, None::<&str>)?;
    let toggle_task = MenuItem::with_id(app, "toggle-task", "Iniciar / Pausar tarefa", true, None::<&str>)?;
    let stop_task = MenuItem::with_id(app, "stop-task", "Parar tarefa", true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Sair", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &sep, &toggle_task, &stop_task, &sep, &quit])?;

    TrayIconBuilder::with_id("main")
        .icon(app.default_window_icon().unwrap().clone())
        .tooltip("DeskClock")
        .menu(&menu)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    if window.is_visible().unwrap_or(false) {
                        let _ = window.hide();
                    } else {
                        // Delega posicionamento e exibição ao JS via evento:
                        // o frontend usa screen.availWidth/availHeight para posicionar
                        // no canto inferior direito acima da barra de tarefas.
                        let _ = window.emit("tray:show-main", ());
                    }
                }
            }
        })
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                if let Some(window) = app.get_webview_window("main") {
                    if window.is_visible().unwrap_or(false) {
                        let _ = window.set_focus();
                    } else {
                        let _ = window.emit("tray:show-main", ());
                    }
                }
            }
            "toggle-task" => {
                let _ = app.emit("shortcut:toggle-task", ());
            }
            "stop-task" => {
                let _ = app.emit("shortcut:stop-task", ());
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .build(app)?;

    Ok(())
}
