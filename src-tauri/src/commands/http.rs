use std::collections::HashMap;

#[derive(serde::Serialize)]
pub struct HttpJsonResponse {
    pub status: u16,
    pub body: serde_json::Value,
    /// Cabeçalhos em minúsculas. Existe por causa do `retry-after` do 429: é a
    /// única espera confiável que o provedor informa, e sem ela o lado TS teria
    /// de inventar um atraso fixo.
    pub headers: HashMap<String, String>,
}

fn collect_headers(res: &reqwest::Response) -> HashMap<String, String> {
    res.headers()
        .iter()
        .filter_map(|(k, v)| {
            v.to_str()
                .ok()
                .map(|v| (k.as_str().to_lowercase(), v.to_string()))
        })
        .collect()
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
    let headers = collect_headers(&res);
    let body: serde_json::Value = res.json().await.unwrap_or(serde_json::Value::Null);
    Ok(HttpJsonResponse {
        status,
        body,
        headers,
    })
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
    let headers = collect_headers(&res);
    let body: serde_json::Value = res.json().await.unwrap_or(serde_json::Value::Null);
    Ok(HttpJsonResponse {
        status,
        body,
        headers,
    })
}

/// POST application/json com cabeçalho Authorization: Bearer, retorna status + JSON.
/// Usado pelos provedores de LLM: a Anthropic bloqueia CORS a partir do webview,
/// e passando pelo Rust a chave de API não circula no processo do webview.
///
/// Devolve status e corpo mesmo fora da faixa 2xx — o corpo do erro é o que
/// identifica credencial inválida, modelo indisponível e limite de requisições,
/// e quem classifica isso é o lado TS.
#[tauri::command]
pub async fn post_bearer_json(
    url: String,
    token: String,
    body: serde_json::Value,
) -> Result<HttpJsonResponse, String> {
    let client = reqwest::Client::new();
    let res = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", token))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = res.status().as_u16();
    let headers = collect_headers(&res);
    let body: serde_json::Value = res.json().await.unwrap_or(serde_json::Value::Null);
    Ok(HttpJsonResponse {
        status,
        body,
        headers,
    })
}
