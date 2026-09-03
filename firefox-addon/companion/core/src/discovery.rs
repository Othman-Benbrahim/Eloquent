// SPDX-License-Identifier: GPL-3.0-only

use crate::{CompanionError, CompanionSettings};
use serde::Serialize;
use std::{
    collections::HashSet,
    env, fs,
    path::{Path, PathBuf},
    process::{Command, Stdio},
};

#[derive(Debug, Clone)]
pub struct DiscoveryPaths {
    pub resource_dir: PathBuf,
    pub app_data_dir: PathBuf,
    pub executable_dir: PathBuf,
    pub config_dir: PathBuf,
    pub log_dir: PathBuf,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedEngine {
    pub java_path: PathBuf,
    pub jar_path: PathBuf,
    pub server_config_path: PathBuf,
    pub log_dir: PathBuf,
}

fn java_filename() -> &'static str {
    if cfg!(windows) {
        "java.exe"
    } else {
        "java"
    }
}

fn push_unique(candidates: &mut Vec<PathBuf>, seen: &mut HashSet<PathBuf>, path: PathBuf) {
    if seen.insert(path.clone()) {
        candidates.push(path);
    }
}

fn java_works(path: &Path) -> bool {
    Command::new(path)
        .arg("-version")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .is_ok_and(|status| status.success())
}

fn find_file(root: &Path, filename: &str, remaining_depth: usize) -> Option<PathBuf> {
    if root.is_file() {
        return root
            .file_name()
            .is_some_and(|name| name.eq_ignore_ascii_case(filename))
            .then(|| root.to_path_buf());
    }
    if !root.is_dir() || remaining_depth == 0 {
        return None;
    }
    let mut entries = fs::read_dir(root)
        .ok()?
        .filter_map(Result::ok)
        .collect::<Vec<_>>();
    entries.sort_by_key(|entry| entry.file_name());
    for entry in &entries {
        let path = entry.path();
        if path.is_file() && entry.file_name().eq_ignore_ascii_case(filename) {
            return Some(path);
        }
    }
    for entry in entries {
        let path = entry.path();
        if path.is_dir() {
            if let Some(found) = find_file(&path, filename, remaining_depth - 1) {
                return Some(found);
            }
        }
    }
    None
}

fn resolve_java(
    settings: &CompanionSettings,
    paths: &DiscoveryPaths,
) -> Result<PathBuf, CompanionError> {
    let mut candidates = Vec::new();
    let mut seen = HashSet::new();
    if let Some(path) = &settings.java_path {
        if let Some(found) = find_file(path, java_filename(), 5) {
            if java_works(&found) {
                return Ok(found);
            }
        }
        return Err(CompanionError::MissingJava(format!(
            "Aucun runtime Java utilisable n'a été trouvé dans {}.",
            path.display()
        )));
    }

    if let Some(java_home) = env::var_os("JAVA_HOME") {
        push_unique(
            &mut candidates,
            &mut seen,
            PathBuf::from(java_home).join("bin").join(java_filename()),
        );
    }
    for root in [
        paths.resource_dir.join("runtime"),
        paths.app_data_dir.join("runtime"),
        paths.executable_dir.join("runtime"),
    ] {
        if let Some(found) = find_file(&root, java_filename(), 5) {
            push_unique(&mut candidates, &mut seen, found);
        }
    }
    if let Some(found) = candidates
        .into_iter()
        .find(|path| path.is_file() && java_works(path))
    {
        return Ok(found);
    }

    // Commande sans chemin : std::process::Command la résout via PATH.
    let path_command = PathBuf::from(java_filename());
    if java_works(&path_command) {
        Ok(path_command)
    } else {
        Err(CompanionError::MissingJava(
            "Java est introuvable. Sélectionnez un runtime ou renseignez JAVA_HOME.".into(),
        ))
    }
}

fn resolve_jar(
    settings: &CompanionSettings,
    paths: &DiscoveryPaths,
) -> Result<PathBuf, CompanionError> {
    if let Some(path) = &settings.language_tool_path {
        return find_file(path, "languagetool-server.jar", 5).ok_or_else(|| {
            CompanionError::MissingLanguageTool(format!(
                "languagetool-server.jar est introuvable dans {}.",
                path.display()
            ))
        });
    }
    for root in [
        paths.resource_dir.join("languagetool"),
        paths.app_data_dir.join("languagetool"),
        paths.executable_dir.join("languagetool"),
    ] {
        if let Some(found) = find_file(&root, "languagetool-server.jar", 5) {
            return Ok(found);
        }
    }
    Err(CompanionError::MissingLanguageTool(
        "LanguageTool n'est pas encore installé. Indiquez son dossier dans les paramètres.".into(),
    ))
}

pub fn resolve_engine(
    settings: &CompanionSettings,
    paths: &DiscoveryPaths,
) -> Result<ResolvedEngine, CompanionError> {
    Ok(ResolvedEngine {
        java_path: resolve_java(settings, paths)?,
        jar_path: resolve_jar(settings, paths)?,
        server_config_path: paths.config_dir.join("server.properties"),
        log_dir: paths.log_dir.clone(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temporary_root() -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        std::env::temp_dir().join(format!(
            "eloquent-discovery-{}-{unique}",
            std::process::id()
        ))
    }

    #[test]
    fn nested_languagetool_archives_are_discovered() {
        let root = temporary_root();
        let nested = root.join("LanguageTool-9.9");
        fs::create_dir_all(&nested).expect("create tree");
        fs::write(nested.join("languagetool-server.jar"), b"test").expect("create jar");
        let found = find_file(&root, "languagetool-server.jar", 5).expect("find jar");
        assert!(found.ends_with("languagetool-server.jar"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn explicit_missing_languagetool_path_is_reported() {
        let root = temporary_root();
        let paths = DiscoveryPaths {
            resource_dir: root.join("resources"),
            app_data_dir: root.join("data"),
            executable_dir: root.join("bin"),
            config_dir: root.join("config"),
            log_dir: root.join("logs"),
        };
        let settings = CompanionSettings {
            language_tool_path: Some(root.join("missing")),
            ..CompanionSettings::default()
        };
        assert!(matches!(
            resolve_jar(&settings, &paths),
            Err(CompanionError::MissingLanguageTool(_))
        ));
    }
}
