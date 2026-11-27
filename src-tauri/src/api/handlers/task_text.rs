//! Iniciar tarefa por texto: a instrução dos campos e a interpretação de um
//! texto curto (`docs-internal/specs/iniciar-tarefa-por-texto.md`, item 12).
//! **Nenhuma das duas inicia tarefa** — o cliente confirma com o usuário e chama
//! `POST /tasks/start`, `POST /tasks` ou `POST /planned-tasks`. Só repassam à
//! janela principal.

use super::{forward, forward_with_body, WorkspaceQuery};
use crate::api::models::{
    ErrorResponse, InterpretTaskTextRequest, TaskTextFieldsDto, TaskTextInterpretationDto,
};
use crate::api::state::ApiState;
use axum::{
    body::Bytes,
    extract::{Query, State},
    response::Response,
};
use serde_json::json;
use std::sync::Arc;

#[utoipa::path(
    get,
    path = "/tasks/text/fields",
    tag = "task-text",
    params(
        ("workspaceId" = Option<String>, Query, description = "Catálogo dos exemplos. Ausente = workspace ativo.")
    ),
    responses(
        (status = 200, description = "A instrução que a tela mostra acima do campo e os campos que o texto pode \
            preencher: Projeto, Categoria, Billable e cada campo personalizado ativo, com a sigla e um exemplo \
            tirado do catálogo", body = TaskTextFieldsDto),
        (status = 409, description = "Workspace não encontrado", body = ErrorResponse)
    )
)]
pub async fn get_task_text_fields(
    State(state): State<Arc<ApiState>>,
    Query(q): Query<WorkspaceQuery>,
) -> Response {
    forward(
        &state,
        "taskText.fields",
        json!({ "workspaceId": q.workspace_id }),
    )
    .await
}

#[utoipa::path(
    post,
    path = "/tasks/text/interpret",
    tag = "task-text",
    request_body(
        content = InterpretTaskTextRequest,
        description = "Texto com siglas (`P=acme`) ou por posição, separado por vírgula na ordem da instrução \
            (`Daily, Acme, Development, nb`), é separado no app, sem chamar o provedor. Texto livre vai ao provedor \
            de IA, se houver um conectado — só o texto e, de cada campo, rótulo, sigla e tipo; o casamento com o \
            catálogo é local. Sem provedor, o texto livre vira o nome.",
        example = json!({ "text": "Alinhamento sprint P=tech int C=dev nb PS=dev" })
    ),
    responses(
        (status = 200, description = "A tarefa interpretada, com ids e nomes; ambíguos com até 5 candidatos e \
            valores não encontrados à parte. Nada é iniciado nem gravado", body = TaskTextInterpretationDto),
        (status = 400, description = "Sem `text`, ou texto vazio", body = ErrorResponse),
        (status = 409, description = "Workspace não encontrado", body = ErrorResponse),
        (status = 502, description = "O provedor de IA falhou ou devolveu algo ilegível; a mensagem é a da tela", body = ErrorResponse)
    )
)]
pub async fn post_task_text_interpret(State(state): State<Arc<ApiState>>, body: Bytes) -> Response {
    forward_with_body::<InterpretTaskTextRequest>(
        &state,
        "taskText.interpret",
        &body,
        true,
        json!({}),
    )
    .await
}
