/// Retorna o identificador de plataforma compatível com a convenção Node.js/Electron.
/// Valores: "win32" | "darwin" | "linux"
#[tauri::command]
pub fn get_platform() -> &'static str {
    if cfg!(target_os = "windows") {
        "win32"
    } else if cfg!(target_os = "macos") {
        "darwin"
    } else {
        "linux"
    }
}

/// Detecta o display server no Linux.
/// Retorna "wayland" se WAYLAND_DISPLAY estiver definido, "x11" caso contrário.
/// Em outras plataformas retorna "".
#[tauri::command]
pub fn get_display_server() -> &'static str {
    #[cfg(target_os = "linux")]
    {
        if std::env::var("WAYLAND_DISPLAY").is_ok() {
            return "wayland";
        }
        return "x11";
    }
    #[cfg(not(target_os = "linux"))]
    ""
}

/// Abre uma URL no navegador padrão do sistema operacional.
/// Substitui `tauri-plugin-opener` para evitar problemas de escopo de permissão.
#[tauri::command]
pub fn open_in_browser(url: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        // CREATE_NO_WINDOW impede que uma janela de console pisque na tela ao spawnar o processo
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        std::process::Command::new("powershell")
            .args([
                "-NoProfile",
                "-WindowStyle",
                "Hidden",
                "-Command",
                &format!("Start-Process \"{}\"", url.replace('"', "\\\"")),
            ])
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Abre um arquivo ou pasta no explorador de arquivos padrão do sistema.
#[tauri::command]
pub fn open_in_file_manager(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        std::process::Command::new("explorer")
            .arg(&path)
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn save_file(path: String, content: Vec<u8>) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| e.to_string())
}
