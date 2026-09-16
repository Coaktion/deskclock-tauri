use rusqlite::{params, Connection, OptionalExtension};
use std::path::Path;

/// Só o que o boot precisa antes de a janela principal existir: saber se a API
/// sobe e em que porta. Todo o resto passa pela ponte (`bridge.rs`).
pub struct Db {
    conn: Connection,
}

impl Db {
    pub fn open(path: &Path) -> rusqlite::Result<Self> {
        let conn = Connection::open(path)?;
        conn.pragma_update(None, "busy_timeout", 5000)?;
        Ok(Self { conn })
    }

    pub fn get_config_json(&self, key: &str) -> rusqlite::Result<Option<String>> {
        self.conn
            .query_row(
                "SELECT value FROM config WHERE key = ?1",
                params![key],
                |r| r.get::<_, String>(0),
            )
            .optional()
    }
}
