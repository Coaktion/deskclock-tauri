mod local_api;
mod oauth;
mod shortcuts;
mod system;
mod tray;
mod updater;

pub use local_api::{get_local_api_status, start_local_api, stop_local_api};
pub use oauth::start_oauth_server;
pub use shortcuts::update_shortcuts;
pub use system::{get_display_server, get_platform, open_in_browser, open_in_file_manager, save_file};
pub use tray::{update_tray_icon, update_tray_tooltip};
pub use updater::{check_for_update, download_and_install_update, relaunch_app};
