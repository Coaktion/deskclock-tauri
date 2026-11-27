//! Ponte entre o servidor HTTP e a janela principal.
//!
//! O Rust não conhece nenhuma regra de negócio: cada requisição vira um evento
//! `local-api:request` para a janela principal, que executa o caso de uso real
//! e devolve status e corpo por `local_api_respond`. Ver
//! `docs-internal/specs/api-local-nucleo.md` §3.

use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tokio::sync::oneshot;
use uuid::Uuid;

pub const REQUEST_EVENT: &str = "local-api:request";
pub const DEFAULT_TIMEOUT: Duration = Duration::from_secs(10);

/// Ops que esperam o serviço externo por mais de uma ida e volta: o resumo por
/// IA chama o provedor um dia de cada vez (até cinco, em série) e o backup faz o
/// snapshot do banco inteiro e o sobe ao Drive; a interpretação do texto da
/// tarefa espera uma completação, que em modelo local passa fácil dos 10 s. No prazo padrão o cliente
/// receberia 504 com o trabalho ainda em curso — e repetiria um backup que deu
/// certo. A mesma lista está em `runsInLongQueue` (`localApi/dispatch.ts`) e em
/// `src-tauri/long-ops.json`, que os testes dos dois lados conferem. No
/// TS elas rodam numa fila própria, senão quem chegasse atrás estouraria os 10 s
/// e ainda executaria depois. Ver `docs-internal/specs/mcp.md` §7, Fase D2.
const LONG_OPS: &[&str] = &[
    "daySummaries.generate",
    "driveBackup.run",
    "taskText.interpret",
];
/// O prazo das `LONG_OPS` é este múltiplo do padrão (2 min com os 10 s do app).
const LONG_OP_FACTOR: u32 = 12;

#[derive(Debug, Clone, PartialEq)]
pub struct BridgeResponse {
    pub status: u16,
    pub body: Value,
}

#[derive(Debug, PartialEq)]
pub enum BridgeError {
    /// A janela principal ainda não avisou que está ouvindo.
    NotReady,
    /// A janela não respondeu dentro do prazo.
    Timeout,
    /// O evento não pôde ser emitido, ou o pendente sumiu sem resposta.
    Failed(String),
}

impl BridgeError {
    /// Mensagem pt-BR para o cliente — a mesma na REST e no MCP.
    pub fn message(&self) -> String {
        match self {
            BridgeError::NotReady => "App ainda carregando — tente novamente em instantes".into(),
            BridgeError::Timeout => "O app não respondeu a tempo".into(),
            BridgeError::Failed(e) => format!("Falha ao falar com o app: {e}"),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct BridgeRequest<'a> {
    pub id: &'a str,
    pub op: &'a str,
    pub params: &'a Value,
}

type Emitter = Box<dyn Fn(&BridgeRequest<'_>) -> Result<(), String> + Send + Sync>;

/// Mora no estado do app, não no do servidor: o frontend avisa a prontidão uma
/// vez só, e parar/iniciar a API pelas Configurações recria o servidor.
pub struct Bridge {
    pending: Mutex<HashMap<String, oneshot::Sender<BridgeResponse>>>,
    ready: AtomicBool,
    timeout: Duration,
    emit: Emitter,
}

impl Bridge {
    pub fn new(
        emit: impl Fn(&BridgeRequest<'_>) -> Result<(), String> + Send + Sync + 'static,
        timeout: Duration,
    ) -> Self {
        Self {
            pending: Mutex::new(HashMap::new()),
            ready: AtomicBool::new(false),
            timeout,
            emit: Box::new(emit),
        }
    }

    pub fn mark_ready(&self) {
        self.ready.store(true, Ordering::SeqCst);
    }

    /// A janela principal começou a (re)carregar: o ouvinte antigo morreu com a
    /// página e o novo ainda não avisou. Sem isso, a requisição seria emitida
    /// para ninguém e só expiraria em 504.
    pub fn mark_unready(&self) {
        self.ready.store(false, Ordering::SeqCst);
    }

    pub async fn request(&self, op: &str, params: Value) -> Result<BridgeResponse, BridgeError> {
        if !self.ready.load(Ordering::SeqCst) {
            return Err(BridgeError::NotReady);
        }
        let id = Uuid::new_v4().to_string();
        let (tx, rx) = oneshot::channel();
        self.pending.lock().unwrap().insert(id.clone(), tx);

        let payload = BridgeRequest {
            id: &id,
            op,
            params: &params,
        };
        if let Err(e) = (self.emit)(&payload) {
            self.pending.lock().unwrap().remove(&id);
            return Err(BridgeError::Failed(e));
        }

        match tokio::time::timeout(self.timeout_for(op), rx).await {
            Ok(Ok(response)) => Ok(response),
            Ok(Err(_)) => Err(BridgeError::Failed("resposta descartada".into())),
            Err(_) => {
                // Sem remover, uma resposta tardia encontraria o pendente e o
                // mapa cresceria a cada timeout.
                self.pending.lock().unwrap().remove(&id);
                Err(BridgeError::Timeout)
            }
        }
    }

    fn timeout_for(&self, op: &str) -> Duration {
        if LONG_OPS.contains(&op) {
            self.timeout * LONG_OP_FACTOR
        } else {
            self.timeout
        }
    }

    /// Entrega a resposta ao pendente. `false` quando ninguém espera mais por
    /// ela — tipicamente porque a requisição já expirou.
    pub fn respond(&self, id: &str, status: u16, body: Value) -> bool {
        let Some(tx) = self.pending.lock().unwrap().remove(id) else {
            return false;
        };
        tx.send(BridgeResponse { status, body }).is_ok()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::sync::Arc;

    type Sent = Arc<Mutex<Vec<(String, String)>>>;

    fn bridge_with_log(timeout: Duration) -> (Arc<Bridge>, Sent) {
        let sent: Sent = Arc::new(Mutex::new(Vec::new()));
        let log = sent.clone();
        let bridge = Bridge::new(
            move |req| {
                log.lock()
                    .unwrap()
                    .push((req.id.to_string(), req.op.to_string()));
                Ok(())
            },
            timeout,
        );
        (Arc::new(bridge), sent)
    }

    async fn wait_for_emits(sent: &Sent, count: usize) -> Vec<(String, String)> {
        for _ in 0..200 {
            let snapshot = sent.lock().unwrap().clone();
            if snapshot.len() >= count {
                return snapshot;
            }
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
        panic!("eventos não emitidos");
    }

    #[tokio::test]
    async fn responde_503_antes_da_prontidao_sem_emitir() {
        let (bridge, sent) = bridge_with_log(DEFAULT_TIMEOUT);
        let result = bridge.request("status.get", json!({})).await;
        assert_eq!(result, Err(BridgeError::NotReady));
        assert!(sent.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn volta_a_responder_503_depois_de_a_janela_recarregar() {
        let (bridge, sent) = bridge_with_log(DEFAULT_TIMEOUT);
        bridge.mark_ready();
        bridge.mark_unready();
        let result = bridge.request("status.get", json!({})).await;
        assert_eq!(result, Err(BridgeError::NotReady));
        assert!(sent.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn entrega_cada_resposta_ao_pendente_certo() {
        let (bridge, sent) = bridge_with_log(DEFAULT_TIMEOUT);
        bridge.mark_ready();

        let a = tokio::spawn({
            let b = bridge.clone();
            async move { b.request("op.a", json!({})).await }
        });
        let b = tokio::spawn({
            let b = bridge.clone();
            async move { b.request("op.b", json!({})).await }
        });

        let emitted = wait_for_emits(&sent, 2).await;
        // Responde na ordem inversa para provar que o id, e não a ordem, decide.
        for (id, op) in emitted.iter().rev() {
            assert!(bridge.respond(id, 200, json!({ "op": op })));
        }

        assert_eq!(a.await.unwrap().unwrap().body, json!({ "op": "op.a" }));
        assert_eq!(b.await.unwrap().unwrap().body, json!({ "op": "op.b" }));
    }

    #[tokio::test]
    async fn expira_e_descarta_a_resposta_tardia() {
        let (bridge, sent) = bridge_with_log(Duration::from_millis(30));
        bridge.mark_ready();

        let result = bridge.request("tasks.stop", json!({})).await;
        assert_eq!(result, Err(BridgeError::Timeout));

        let (id, _) = sent.lock().unwrap()[0].clone();
        assert!(!bridge.respond(&id, 200, json!({})));
        assert!(bridge.pending.lock().unwrap().is_empty());
    }

    /// O TS confere a lista dele (`runsInLongQueue`) contra o mesmo arquivo:
    /// op longa num lado só voltaria a dar 504 em quem chega atrás dela.
    #[test]
    fn long_ops_bate_com_long_ops_json() {
        let manifest: Vec<String> =
            serde_json::from_str(include_str!("../../long-ops.json")).unwrap();
        let mut ours: Vec<&str> = LONG_OPS.to_vec();
        let mut theirs: Vec<&str> = manifest.iter().map(String::as_str).collect();
        ours.sort_unstable();
        theirs.sort_unstable();
        assert_eq!(ours, theirs, "LONG_OPS diverge de src-tauri/long-ops.json");
    }

    #[tokio::test]
    async fn ops_longas_esperam_mais_que_o_prazo_padrao() {
        let (bridge, sent) = bridge_with_log(Duration::from_millis(30));
        bridge.mark_ready();
        for op in [
            "daySummaries.generate",
            "driveBackup.run",
            "taskText.interpret",
        ] {
            let pending = tokio::spawn({
                let b = bridge.clone();
                async move { b.request(op, json!({})).await }
            });
            let emitted = wait_for_emits(&sent, 1).await;
            // Depois do prazo padrão, mas dentro do longo.
            tokio::time::sleep(Duration::from_millis(80)).await;
            let (id, _) = emitted.last().unwrap().clone();
            assert!(bridge.respond(&id, 200, json!({})), "{op}");
            assert_eq!(pending.await.unwrap().unwrap().status, 200, "{op}");
            sent.lock().unwrap().clear();
        }
        assert_eq!(
            bridge.request("daySummaries.list", json!({})).await,
            Err(BridgeError::Timeout)
        );
    }

    #[tokio::test]
    async fn falha_ao_emitir_nao_deixa_pendente() {
        let bridge = Bridge::new(|_| Err("sem janela".into()), DEFAULT_TIMEOUT);
        bridge.mark_ready();
        let result = bridge.request("status.get", json!({})).await;
        assert_eq!(result, Err(BridgeError::Failed("sem janela".into())));
        assert!(bridge.pending.lock().unwrap().is_empty());
    }

    #[test]
    fn resposta_para_id_desconhecido_e_ignorada() {
        let (bridge, _) = bridge_with_log(DEFAULT_TIMEOUT);
        assert!(!bridge.respond("inexistente", 200, json!({})));
    }
}
