// SPDX-License-Identifier: GPL-3.0-only

use crate::{
    port_is_available, resolve_engine, server_is_healthy, CompanionError, CompanionSettings,
    DiscoveryPaths, ResolvedEngine,
};
use serde::Serialize;
use std::{
    fs::{self, File, OpenOptions},
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
    thread,
    time::{Duration, Instant},
};

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum EngineState {
    Running,
    Starting,
    Stopped,
    MissingJava,
    MissingLanguageTool,
    PortOccupied,
    Error,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineStatus {
    pub state: EngineState,
    pub endpoint: String,
    pub message: String,
    pub managed: bool,
    pub process_id: Option<u32>,
    pub java_path: Option<String>,
    pub language_tool_jar: Option<String>,
}

impl EngineStatus {
    fn base(settings: &CompanionSettings, state: EngineState, message: impl Into<String>) -> Self {
        Self {
            state,
            endpoint: settings.endpoint(),
            message: message.into(),
            managed: false,
            process_id: None,
            java_path: None,
            language_tool_jar: None,
        }
    }

    fn with_engine(mut self, engine: &ResolvedEngine) -> Self {
        self.java_path = Some(engine.java_path.display().to_string());
        self.language_tool_jar = Some(engine.jar_path.display().to_string());
        self
    }
}

struct ManagedProcess {
    child: Child,
    port: u16,
}

impl Drop for ManagedProcess {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

#[derive(Clone, Default)]
pub struct EngineController {
    process: Arc<Mutex<Option<ManagedProcess>>>,
    operation: Arc<Mutex<()>>,
}

impl EngineController {
    pub fn status(&self, settings: &CompanionSettings, paths: &DiscoveryPaths) -> EngineStatus {
        let timeout = Duration::from_millis(350);
        if server_is_healthy(settings.port, timeout) {
            let guard = self
                .process
                .lock()
                .unwrap_or_else(|error| error.into_inner());
            let mut status =
                EngineStatus::base(settings, EngineState::Running, "LanguageTool est prêt.");
            if let Some(process) = guard.as_ref() {
                status.managed = process.port == settings.port;
                status.process_id = Some(process.child.id());
            } else {
                status.message =
                    "Un serveur LanguageTool existant est utilisé sans être modifié.".into();
            }
            return status;
        }

        {
            let mut guard = self
                .process
                .lock()
                .unwrap_or_else(|error| error.into_inner());
            if let Some(process) = guard.as_mut() {
                match process.child.try_wait() {
                    Ok(None) if process.port == settings.port => {
                        let mut status = EngineStatus::base(
                            settings,
                            EngineState::Starting,
                            "LanguageTool est en cours d'initialisation…",
                        );
                        status.managed = true;
                        status.process_id = Some(process.child.id());
                        return status;
                    }
                    Ok(None) => {}
                    Ok(Some(_)) | Err(_) => {
                        guard.take();
                    }
                }
            }
        }

        let engine = match resolve_engine(settings, paths) {
            Ok(engine) => engine,
            Err(CompanionError::MissingJava(message)) => {
                return EngineStatus::base(settings, EngineState::MissingJava, message)
            }
            Err(CompanionError::MissingLanguageTool(message)) => {
                return EngineStatus::base(settings, EngineState::MissingLanguageTool, message)
            }
            Err(error) => {
                return EngineStatus::base(settings, EngineState::Error, error.to_string())
            }
        };
        if !port_is_available(settings.port) {
            return EngineStatus::base(
                settings,
                EngineState::PortOccupied,
                CompanionError::PortOccupied(settings.port).to_string(),
            )
            .with_engine(&engine);
        }
        EngineStatus::base(
            settings,
            EngineState::Stopped,
            "Le moteur est configuré et peut être démarré.",
        )
        .with_engine(&engine)
    }

    pub fn start(
        &self,
        settings: &CompanionSettings,
        paths: &DiscoveryPaths,
    ) -> Result<EngineStatus, CompanionError> {
        let _operation = self
            .operation
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        if server_is_healthy(settings.port, Duration::from_millis(500)) {
            return Ok(self.status(settings, paths));
        }
        if !port_is_available(settings.port) {
            return Err(CompanionError::PortOccupied(settings.port));
        }

        let engine = resolve_engine(settings, paths)?;
        fs::create_dir_all(&engine.log_dir)?;
        if let Some(parent) = engine.server_config_path.parent() {
            fs::create_dir_all(parent)?;
        }
        if !engine.server_config_path.exists() {
            fs::write(&engine.server_config_path, b"")?;
        }

        let output_log = open_log(engine.log_dir.join("languagetool-output.log"))?;
        let error_log = open_log(engine.log_dir.join("languagetool-error.log"))?;
        let mut command = Command::new(&engine.java_path);
        command
            .arg("-cp")
            .arg(&engine.jar_path)
            .arg("org.languagetool.server.HTTPServer")
            .arg("--config")
            .arg(&engine.server_config_path)
            .arg("--port")
            .arg(settings.port.to_string())
            .arg("--allow-origin")
            .stdin(Stdio::null())
            .stdout(Stdio::from(output_log))
            .stderr(Stdio::from(error_log));

        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x0800_0000);
        }

        let child = command.spawn().map_err(|error| {
            CompanionError::Process(format!(
                "Impossible de lancer Java depuis {} : {error}",
                engine.java_path.display()
            ))
        })?;
        {
            let mut guard = self
                .process
                .lock()
                .unwrap_or_else(|error| error.into_inner());
            *guard = Some(ManagedProcess {
                child,
                port: settings.port,
            });
        }

        let deadline = Instant::now() + Duration::from_secs(30);
        while Instant::now() < deadline {
            if server_is_healthy(settings.port, Duration::from_millis(400)) {
                return Ok(self.status(settings, paths));
            }
            let exited = {
                let mut guard = self
                    .process
                    .lock()
                    .unwrap_or_else(|error| error.into_inner());
                guard
                    .as_mut()
                    .and_then(|process| process.child.try_wait().ok().flatten())
            };
            if let Some(status) = exited {
                let mut guard = self
                    .process
                    .lock()
                    .unwrap_or_else(|error| error.into_inner());
                guard.take();
                return Err(CompanionError::Process(format!(
                    "LanguageTool s'est arrêté avec le code {}. Consultez {}.",
                    status
                        .code()
                        .map_or_else(|| "inconnu".into(), |code| code.to_string()),
                    engine.log_dir.join("languagetool-error.log").display()
                )));
            }
            thread::sleep(Duration::from_millis(500));
        }

        let mut guard = self
            .process
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        guard.take();
        Err(CompanionError::Timeout(settings.port))
    }

    pub fn stop(
        &self,
        settings: &CompanionSettings,
        paths: &DiscoveryPaths,
    ) -> Result<EngineStatus, CompanionError> {
        let _operation = self
            .operation
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        let process = {
            let mut guard = self
                .process
                .lock()
                .unwrap_or_else(|error| error.into_inner());
            guard.take()
        };
        let Some(mut process) = process else {
            if server_is_healthy(settings.port, Duration::from_millis(500)) {
                return Err(CompanionError::ExternalProcess(settings.port));
            }
            return Ok(self.status(settings, paths));
        };
        process.child.kill().map_err(|error| {
            CompanionError::Process(format!("Impossible d'arrêter LanguageTool : {error}"))
        })?;
        let _ = process.child.wait();
        thread::sleep(Duration::from_millis(150));
        Ok(self.status(settings, paths))
    }
}

fn open_log(path: std::path::PathBuf) -> Result<File, CompanionError> {
    Ok(OpenOptions::new().create(true).append(true).open(path)?)
}
