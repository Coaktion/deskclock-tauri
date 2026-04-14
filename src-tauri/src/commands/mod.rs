mod oauth;
mod shortcuts;
mod system;
mod tray;
mod updater;

pub use oauth::start_oauth_server;
pub use shortcuts::update_shortcuts;
pub use system::{get_platform, open_in_browser, open_in_file_manager, save_file};
pub use tray::{update_tray_icon, update_tray_tooltip};
pub use updater::{check_for_update, download_and_install_update, relaunch_app};
