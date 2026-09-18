//! Resposta da ponte → resultado de tool. Erro vira `isError: true` com a mensagem
//! pt-BR do TS, nunca erro de protocolo: o cliente mostra erro de protocolo como
//! falha opaca, e o modelo precisa ler a mensagem para corrigir a chamada.

use crate::api::bridge::{BridgeError, BridgeResponse};
use rmcp::model::{CallToolResult, ContentBlock};
use serde_json::Value;

/// `Err` já é o resultado de erro pronto, para a tool devolver sem mais nada.
pub fn body_or_error(result: Result<BridgeResponse, BridgeError>) -> Result<Value, CallToolResult> {
    match result {
        Ok(BridgeResponse { status, body }) if status < 400 => Ok(body),
        Ok(BridgeResponse { body, .. }) => Err(error_result(error_message(&body))),
        Err(e) => Err(error_result(e.message())),
    }
}

pub fn success(body: Value) -> CallToolResult {
    CallToolResult::structured(body)
}

fn error_result(message: String) -> CallToolResult {
    CallToolResult::error(vec![ContentBlock::text(message)])
}

/// O TS responde erro como `{ "error": "..." }`; qualquer outro formato vai cru.
fn error_message(body: &Value) -> String {
    match body.get("error").and_then(Value::as_str) {
        Some(message) => message.to_string(),
        None => body.to_string(),
    }
}
