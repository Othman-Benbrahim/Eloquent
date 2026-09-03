// SPDX-License-Identifier: GPL-3.0-only

use crate::CompanionError;
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", default)]
pub struct CompanionSettings {
    pub port: u16,
    pub java_path: Option<PathBuf>,
    pub language_tool_path: Option<PathBuf>,
    pub start_engine_on_launch: bool,
    pub start_app_on_login: bool,
}

impl Default for CompanionSettings {
    fn default() -> Self {
        Self {
            port: 8082,
            java_path: None,
            language_tool_path: None,
            start_engine_on_launch: true,
            start_app_on_login: false,
        }
    }
}

impl CompanionSettings {
    pub fn validated(mut self) -> Result<Self, CompanionError> {
        if self.port < 1024 {
            return Err(CompanionError::InvalidSettings(
                "Choisissez un port compris entre 1024 et 65535.".into(),
            ));
        }
        self.java_path = normalize_optional_path(self.java_path);
        self.language_tool_path = normalize_optional_path(self.language_tool_path);
        Ok(self)
    }

    pub fn endpoint(&self) -> String {
        format!("http://127.0.0.1:{}/v2", self.port)
    }
}

fn normalize_optional_path(path: Option<PathBuf>) -> Option<PathBuf> {
    path.and_then(|value| {
        let text = value.to_string_lossy().trim().to_owned();
        (!text.is_empty()).then(|| PathBuf::from(text))
    })
}

pub fn load_settings(path: &Path) -> Result<CompanionSettings, CompanionError> {
    if !path.exists() {
        return Ok(CompanionSettings::default());
    }
    let content = fs::read_to_string(path)?;
    serde_json::from_str::<CompanionSettings>(&content)
        .map_err(|error| {
            CompanionError::InvalidSettings(format!(
                "La configuration locale est illisible : {error}"
            ))
        })?
        .validated()
}

pub fn save_settings(
    path: &Path,
    settings: CompanionSettings,
) -> Result<CompanionSettings, CompanionError> {
    let settings = settings.validated()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let content = serde_json::to_string_pretty(&settings)
        .map_err(|error| CompanionError::Io(error.to_string()))?;
    fs::write(path, format!("{content}\n"))?;
    Ok(settings)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temporary_settings_path() -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        std::env::temp_dir()
            .join(format!(
                "eloquent-companion-{}-{unique}",
                std::process::id()
            ))
            .join("settings.json")
    }

    #[test]
    fn defaults_match_the_firefox_development_setup() {
        let settings = CompanionSettings::default();
        assert_eq!(settings.port, 8082);
        assert_eq!(settings.endpoint(), "http://127.0.0.1:8082/v2");
        assert!(settings.start_engine_on_launch);
    }

    #[test]
    fn privileged_ports_are_rejected() {
        let settings = CompanionSettings {
            port: 80,
            ..CompanionSettings::default()
        };
        assert!(settings.validated().is_err());
    }

    #[test]
    fn settings_round_trip_on_disk() {
        let path = temporary_settings_path();
        let settings = CompanionSettings {
            port: 8123,
            java_path: Some(PathBuf::from("/opt/java/bin/java")),
            language_tool_path: Some(PathBuf::from("/opt/languagetool")),
            start_engine_on_launch: false,
            start_app_on_login: true,
        };
        let saved = save_settings(&path, settings.clone()).expect("save settings");
        let loaded = load_settings(&path).expect("load settings");
        assert_eq!(saved, settings);
        assert_eq!(loaded, settings);
        if let Some(parent) = path.parent() {
            let _ = fs::remove_dir_all(parent);
        }
    }
}
