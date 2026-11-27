//! Fase D3a da paridade: Configurações por grupo — Geral, Overlay, Acessibilidade
//! e Atalhos —, cada um com leitura e edição parcial, e as duas ações das abas
//! ("Mostrar / Ocultar overlay" e "Redefinir posições salvas das janelas"). Só
//! repassam à janela principal; validação e efeitos são os das abas, no TS.

use super::{forward, forward_with_body};
use crate::api::models::{
    AccessibilitySettingsDto, AccessibilitySettingsPatch, ErrorResponse, GeneralSettingsDto,
    GeneralSettingsPatch, OverlaySettingsDto, OverlaySettingsPatch, OverlayToggleResponse,
    ShortcutSettingsDto, ShortcutSettingsPatch, ShortcutsUpdateResponse,
};
use crate::api::state::ApiState;
use axum::{body::Bytes, extract::State, response::Response};
use serde_json::json;
use std::sync::Arc;

#[utoipa::path(
    get,
    path = "/settings/general",
    tag = "settings",
    responses((status = 200, description = "Configurações → Geral", body = GeneralSettingsDto))
)]
pub async fn get_general(State(state): State<Arc<ApiState>>) -> Response {
    forward(&state, "settings.getGeneral", json!({})).await
}

#[utoipa::path(
    patch,
    path = "/settings/general",
    tag = "settings",
    request_body(
        content = GeneralSettingsPatch,
        description = "Só as chaves que mudam; ausente mantém. Com os efeitos da tela: `startOnBoot` registra \
            ou remove o app do início do sistema; `weekStartsOn` e `showWeekend` avisam as outras janelas.",
        example = json!({ "showWeekend": true, "roundingSlots": [15, 30, 45, 60] })
    ),
    responses(
        (status = 200, description = "O grupo como ficou", body = GeneralSettingsDto),
        (status = 400, description = "Chave desconhecida, `null`, ou valor fora do que a tela oferece \
            (metas fora da faixa, slot que não é múltiplo de 5 até 60, tolerância fora das opções)", body = ErrorResponse)
    )
)]
pub async fn patch_general(State(state): State<Arc<ApiState>>, body: Bytes) -> Response {
    forward_with_body::<GeneralSettingsPatch>(
        &state,
        "settings.updateGeneral",
        &body,
        false,
        json!({}),
    )
    .await
}

#[utoipa::path(
    get,
    path = "/settings/overlay",
    tag = "settings",
    responses((status = 200, description = "Configurações → Overlay", body = OverlaySettingsDto))
)]
pub async fn get_overlay(State(state): State<Arc<ApiState>>) -> Response {
    forward(&state, "settings.getOverlay", json!({})).await
}

#[utoipa::path(
    patch,
    path = "/settings/overlay",
    tag = "settings",
    request_body(
        content = OverlaySettingsPatch,
        description = "Ausente mantém. O overlay aberto aplica na hora, como pela tela.",
        example = json!({ "opacity": 70 })
    ),
    responses(
        (status = 200, description = "O grupo como ficou", body = OverlaySettingsDto),
        (status = 400, description = "Chave desconhecida, `null`, ou opacidade fora de 20–100", body = ErrorResponse)
    )
)]
pub async fn patch_overlay(State(state): State<Arc<ApiState>>, body: Bytes) -> Response {
    forward_with_body::<OverlaySettingsPatch>(
        &state,
        "settings.updateOverlay",
        &body,
        false,
        json!({}),
    )
    .await
}

#[utoipa::path(
    get,
    path = "/settings/accessibility",
    tag = "settings",
    responses((status = 200, description = "Configurações → Aparência: modo e acento", body = AccessibilitySettingsDto))
)]
pub async fn get_accessibility(State(state): State<Arc<ApiState>>) -> Response {
    forward(&state, "settings.getAccessibility", json!({})).await
}

#[utoipa::path(
    patch,
    path = "/settings/accessibility",
    tag = "settings",
    request_body(
        content = AccessibilitySettingsPatch,
        description = "Ausente mantém. Troca o tema em todas as janelas, como a tela.",
        example = json!({ "mode": "claro" })
    ),
    responses(
        (status = 200, description = "A aparência como ficou", body = AccessibilitySettingsDto),
        (status = 400, description = "Chave desconhecida, `null`, ou modo/acento fora das opções", body = ErrorResponse)
    )
)]
pub async fn patch_accessibility(State(state): State<Arc<ApiState>>, body: Bytes) -> Response {
    forward_with_body::<AccessibilitySettingsPatch>(
        &state,
        "settings.updateAccessibility",
        &body,
        false,
        json!({}),
    )
    .await
}

#[utoipa::path(
    get,
    path = "/settings/shortcuts",
    tag = "settings",
    responses((status = 200, description = "Configurações → Atalhos", body = ShortcutSettingsDto))
)]
pub async fn get_shortcuts(State(state): State<Arc<ApiState>>) -> Response {
    forward(&state, "settings.getShortcuts", json!({})).await
}

#[utoipa::path(
    patch,
    path = "/settings/shortcuts",
    tag = "settings",
    request_body(
        content = ShortcutSettingsPatch,
        description = "Ausente mantém; `\"\"` remove. Os atalhos são **globais no sistema operacional**: \
            registrados na hora, valem com o app em segundo plano. O que o sistema recusar fica gravado e volta \
            em `failedShortcuts`, com o aviso da tela.",
        example = json!({ "toggleTask": "CmdOrCtrl+Shift+P" })
    ),
    responses(
        (status = 200, description = "Os quatro atalhos gravados e registrados", body = ShortcutsUpdateResponse),
        (status = 400, description = "Chave desconhecida, `null`, atalho fora da forma \"modificadores + tecla\" \
            (CmdOrCtrl, Shift, Alt), ou o mesmo atalho em duas ações", body = ErrorResponse)
    )
)]
pub async fn patch_shortcuts(State(state): State<Arc<ApiState>>, body: Bytes) -> Response {
    forward_with_body::<ShortcutSettingsPatch>(
        &state,
        "settings.updateShortcuts",
        &body,
        false,
        json!({}),
    )
    .await
}

#[utoipa::path(
    post,
    path = "/settings/reset-window-positions",
    tag = "settings",
    responses((status = 204, description = "As posições salvas da janela principal e dos overlays foram esquecidas, \
        como \"Redefinir posições salvas das janelas\""))
)]
pub async fn post_reset_window_positions(State(state): State<Arc<ApiState>>) -> Response {
    forward(&state, "settings.resetWindowPositions", json!({})).await
}

#[utoipa::path(
    post,
    path = "/overlay/toggle",
    tag = "settings",
    responses((status = 200, description = "Mostra o overlay compacto, ou esconde compacto e popup — a mesma ação \
        do atalho e do botão da aba Overlay", body = OverlayToggleResponse))
)]
pub async fn post_overlay_toggle(State(state): State<Arc<ApiState>>) -> Response {
    forward(&state, "overlay.toggle", json!({})).await
}
