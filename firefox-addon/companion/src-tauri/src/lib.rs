// SPDX-License-Identifier: GPL-3.0-only

use eloquent_companion_core::{
    load_settings, save_settings as persist_settings, CompanionSettings, DiscoveryPaths,
    EngineController, EngineStatus,
};
use std::{io, path::PathBuf};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, State, WindowEvent,
};
use tauri_plugin_autostart::MacosLauncher;

struct AppState {
    controller: EngineController,
    settings_path: PathBuf,
    paths: DiscoveryPaths,
}

impl AppState {
    fn settings(&self) -> Result<CompanionSettings, String> {
        load_settings(&self.settings_path).map_err(|error| error.to_string())
    }
}

#[tauri::command]
fn get_settings(state: State<'_, AppState>) -> Result<CompanionSettings, String> {
    state.settings()
}

#[tauri::command]
fn save_settings(
    settings: CompanionSettings,
    state: State<'_, AppState>,
) -> Result<CompanionSettings, String> {
    persist_settings(&state.settings_path, settings).map_err(|error| error.to_string())
}

#[tauri::command]
fn get_status(state: State<'_, AppState>) -> Result<EngineStatus, String> {
    let settings = state.settings()?;
    Ok(state.controller.status(&settings, &state.paths))
}

#[tauri::command]
async fn start_engine(state: State<'_, AppState>) -> Result<EngineStatus, String> {
    let settings = state.settings()?;
    let controller = state.controller.clone();
    let paths = state.paths.clone();
    tauri::async_runtime::spawn_blocking(move || controller.start(&settings, &paths))
        .await
        .map_err(|error| error.to_string())?
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn stop_engine(state: State<'_, AppState>) -> Result<EngineStatus, String> {
    let settings = state.settings()?;
    let controller = state.controller.clone();
    let paths = state.paths.clone();
    tauri::async_runtime::spawn_blocking(move || controller.stop(&settings, &paths))
        .await
        .map_err(|error| error.to_string())?
        .map_err(|error| error.to_string())
}

fn app_state(app: &tauri::AppHandle) -> Result<AppState, io::Error> {
    let config_dir = app.path().app_config_dir().map_err(io::Error::other)?;
    let app_data_dir = app.path().app_data_dir().map_err(io::Error::other)?;
    let log_dir = app.path().app_log_dir().map_err(io::Error::other)?;
    let resource_dir = app.path().resource_dir().map_err(io::Error::other)?;
    let executable_dir = std::env::current_exe()?
        .parent()
        .map(PathBuf::from)
        .ok_or_else(|| io::Error::other("Le dossier de l'application est introuvable."))?;
    Ok(AppState {
        controller: EngineController::default(),
        settings_path: config_dir.join("settings.json"),
        paths: DiscoveryPaths {
            resource_dir,
            app_data_dir,
            executable_dir,
            config_dir,
            log_dir,
        },
    })
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn install_tray(app: &tauri::App) -> tauri::Result<()> {
    let open_item = MenuItem::with_id(app, "open", "Ouvrir Eloquent", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quitter", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open_item, &quit_item])?;
    let mut builder = TrayIconBuilder::with_id("eloquent-companion")
        .tooltip("Eloquent Local Companion")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_main_window(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ))
        .setup(|app| {
            install_tray(app)?;
            let state = app_state(app.handle())?;
            let settings = state.settings().unwrap_or_default();
            let controller = state.controller.clone();
            let paths = state.paths.clone();
            app.manage(state);
            if settings.start_engine_on_launch {
                tauri::async_runtime::spawn_blocking(move || {
                    let _ = controller.start(&settings, &paths);
                });
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_settings,
            save_settings,
            get_status,
            start_engine,
            stop_engine
        ])
        .run(tauri::generate_context!())
        .expect("Eloquent Local Companion n'a pas pu démarrer");
}
