use std::collections::HashMap;

#[derive(serde::Serialize)]
pub struct HttpJsonResponse {
    pub status: u16,
    pub body: serde_json::Value,
}

/// POST application/x-www-form-urlencoded, retorna status + JSON.
/// Usado para token exchange e refresh que são bloqueados por CORS no frontend.
#[tauri::command]
pub async fn post_form_json(
    url: String,
    params: HashMap<String, String>,
) -> Result<HttpJsonResponse, String> {
    let client = reqwest::Client::new();
    let res = client
        .post(&url)
        .form(&params)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = res.status().as_u16();
    let body: serde_json::Value = res.json().await.unwrap_or(serde_json::Value::Null);
    Ok(HttpJsonResponse { status, body })
}

/// GET com cabeçalho Authorization: Bearer, retorna status + JSON.
/// Usado para chamadas à API do Zendesk que são bloqueadas por CORS no frontend.
#[tauri::command]
pub async fn get_bearer_json(url: String, token: String) -> Result<HttpJsonResponse, String> {
    let client = reqwest::Client::new();
    let res = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = res.status().as_u16();
    let body: serde_json::Value = res.json().await.unwrap_or(serde_json::Value::Null);
    Ok(HttpJsonResponse { status, body })
}
