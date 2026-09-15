include!("app_commands.rs");

fn main() {
    println!("cargo:rerun-if-changed=app_commands.rs");
    // `AppManifest::commands` pede uma fatia `'static`; o build roda uma vez só,
    // então vazar a junção das duas listas não custa nada.
    let commands: &'static [&'static str] = Box::leak(
        [SHARED_COMMANDS, MAIN_ONLY_COMMANDS]
            .concat()
            .into_boxed_slice(),
    );
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(commands)),
    )
    .expect("failed to run tauri-build");
}
