// SPDX-License-Identifier: GPL-3.0-only

mod config;
mod discovery;
mod engine;
mod health;

pub use config::{load_settings, save_settings, CompanionSettings};
pub use discovery::{resolve_engine, DiscoveryPaths, ResolvedEngine};
pub use engine::{EngineController, EngineState, EngineStatus};
pub use health::{port_is_available, server_is_healthy};

use std::{fmt, io};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CompanionError {
    InvalidSettings(String),
    MissingJava(String),
    MissingLanguageTool(String),
    PortOccupied(u16),
    ExternalProcess(u16),
    Process(String),
    Timeout(u16),
    Io(String),
}

impl fmt::Display for CompanionError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidSettings(message)
            | Self::MissingJava(message)
            | Self::MissingLanguageTool(message)
            | Self::Process(message)
            | Self::Io(message) => formatter.write_str(message),
            Self::PortOccupied(port) => write!(
                formatter,
                "Le port {port} est occupé par un service qui n'est pas LanguageTool."
            ),
            Self::ExternalProcess(port) => write!(
                formatter,
                "Le serveur du port {port} n'a pas été lancé par Eloquent et ne sera pas arrêté."
            ),
            Self::Timeout(port) => write!(
                formatter,
                "LanguageTool ne répond pas sur le port {port} après 30 secondes."
            ),
        }
    }
}

impl std::error::Error for CompanionError {}

impl From<io::Error> for CompanionError {
    fn from(error: io::Error) -> Self {
        Self::Io(error.to_string())
    }
}
