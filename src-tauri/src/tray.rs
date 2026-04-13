use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, PhysicalPosition,
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
                position,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    if window.is_visible().unwrap_or(false) {
                        let _ = window.hide();
                    } else {
                        // Posiciona a janela próxima ao ícone do tray
                        if let Ok(Some(monitor)) = window.current_monitor().or_else(|_| window.primary_monitor()) {
                            let screen_h = monitor.size().height as i32;
                            let screen_w = monitor.size().width as i32;
                            let scale = monitor.scale_factor();
                            let win_size = window.outer_size().unwrap_or_default();
                            // outer_size() pode retornar 0 para janelas ainda não exibidas;
                            // nesse caso usa as dimensões lógicas configuradas × scale factor.
                            let win_w = if win_size.width > 0 {
                                win_size.width as i32
                            } else {
                                (800.0 * scale) as i32
                            };
                            let win_h = if win_size.height > 0 {
                                win_size.height as i32
                            } else {
                                (620.0 * scale) as i32
                            };

                            let click_x = position.x as i32;
                            let click_y = position.y as i32;

                            let x = (click_x - win_w / 2).clamp(0, screen_w - win_w);
                            // Detecta se taskbar está na metade inferior ou superior da tela
                            let y = if click_y > screen_h / 2 {
                                (click_y - win_h - 8).max(0)
                            } else {
                                (click_y + 8).min(screen_h - win_h)
                            };

                            let _ = window.set_position(tauri::Position::Physical(
                                PhysicalPosition::new(x, y),
                            ));
                        }
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            }
        })
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
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
