//! Servidor MCP dentro da API local (`POST /mcp`). Ver `docs-internal/specs/mcp.md`.

pub mod ops;
mod result;
#[cfg(test)]
mod tests;
mod tools;

use crate::api::state::ApiState;
use rmcp::transport::streamable_http_server::{
    session::never::NeverSessionManager, StreamableHttpServerConfig, StreamableHttpService,
};
use std::sync::Arc;
use tools::DeskClockMcp;

// Sem sessão: toda tool é uma ida e volta à ponte, então não há estado por
// cliente a guardar, e parar/iniciar a API não deixa cliente com sessão morta.
// JSON puro em vez de SSE pelo mesmo motivo — nenhuma tool emite progresso.
pub fn service(state: Arc<ApiState>) -> StreamableHttpService<DeskClockMcp, NeverSessionManager> {
    let config = StreamableHttpServerConfig::default()
        .with_legacy_session_mode(false)
        .with_json_response(true)
        .with_sse_keep_alive(None);
    StreamableHttpService::new(
        move || Ok(DeskClockMcp::new(state.bridge.clone())),
        Arc::new(NeverSessionManager::default()),
        config,
    )
}
