use crate::api::db::Db;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::AppHandle;

pub struct ApiState {
    pub db_path: PathBuf,
    pub app_handle: AppHandle,
    /// Um único writer serializado para evitar race conditions entre
    /// múltiplas requisições que mutam o mesmo estado de "tarefa ativa".
    pub write_lock: Mutex<()>,
}

impl ApiState {
    pub fn new(db_path: PathBuf, app_handle: AppHandle) -> Self {
        Self {
            db_path,
            app_handle,
            write_lock: Mutex::new(()),
        }
    }

    pub fn open_db(&self) -> rusqlite::Result<Db> {
        Db::open(&self.db_path)
    }
}
