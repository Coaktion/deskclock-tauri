use crate::api::bridge::Bridge;
use std::sync::Arc;

pub struct ApiState {
    pub bridge: Arc<Bridge>,
}

impl ApiState {
    pub fn new(bridge: Arc<Bridge>) -> Self {
        Self { bridge }
    }
}
