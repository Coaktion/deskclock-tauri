#[derive(serde::Serialize)]
pub struct UpdateInfo {
    pub version: String,
    pub body: Option<String>,
}

/// Verifica se há atualização disponível.
/// Retorna Some(UpdateInfo) se sim, None se o app já está na versão mais recente.
#[tauri::command]
pub async fn check_for_update(
    app: tauri::AppHandle,
) -> Result<Option<UpdateInfo>, String> {
    use std::time::Duration;
    use tauri_plugin_updater::UpdaterExt;

    log::info!("[updater] iniciando verificação de atualização");

    let updater = match app
        .updater_builder()
        .timeout(Duration::from_secs(30))
        .build()
    {
        Ok(u) => {
            log::info!("[updater] updater construído com sucesso");
            u
        }
        Err(e) => {
            log::error!("[updater] falha ao construir updater: {:?}", e);
            return Err(e.to_string());
        }
    };

    log::info!("[updater] consultando endpoint...");

    match updater.check().await {
        Ok(Some(update)) => {
            log::info!(
                "[updater] atualização disponível: versão={} current={}",
                update.version,
                update.current_version
            );
            Ok(Some(UpdateInfo {
                version: update.version.clone(),
                body: update.body.clone(),
            }))
        }
        Ok(None) => {
            log::info!("[updater] app já está na versão mais recente");
            Ok(None)
        }
        Err(e) => {
            log::error!("[updater] erro ao verificar atualização: {:?}", e);
            Err(e.to_string())
        }
    }
}

/// Baixa e instala a atualização, emitindo progresso via evento Tauri.
/// Ao terminar, o frontend deve chamar relaunch_app() para reiniciar.
#[tauri::command]
pub async fn download_and_install_update(app: tauri::AppHandle) -> Result<(), String> {
    use std::time::Duration;
    use tauri::Emitter;
    use tauri_plugin_updater::UpdaterExt;

    log::info!("[updater] iniciando download e instalação");

    let update = app
        .updater_builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| {
            log::error!("[updater] falha ao construir updater: {:?}", e);
            e.to_string()
        })?
        .check()
        .await
        .map_err(|e| {
            log::error!("[updater] erro ao verificar atualização antes do download: {:?}", e);
            e.to_string()
        })?
        .ok_or_else(|| {
            log::warn!("[updater] download solicitado mas nenhuma atualização encontrada");
            "Nenhuma atualização encontrada".to_string()
        })?;

    log::info!("[updater] baixando versão {}", update.version);

    let app_handle = app.clone();
    update
        .download_and_install(
            |chunk, total| {
                log::debug!("[updater] progresso: {} / {:?} bytes", chunk, total);
                let _ = app_handle.emit(
                    "update:progress",
                    serde_json::json!({ "chunk": chunk, "total": total }),
                );
            },
            || {
                log::info!("[updater] download concluído, pronto para instalar");
                let _ = app_handle.emit("update:ready", ());
            },
        )
        .await
        .map_err(|e| {
            log::error!("[updater] erro durante download/instalação: {:?}", e);
            e.to_string()
        })
}

/// Reinicia o aplicativo (chamado após instalação de atualização).
#[tauri::command]
pub fn relaunch_app(app: tauri::AppHandle) {
    log::info!("[updater] reiniciando app após atualização");
    app.restart();
}
