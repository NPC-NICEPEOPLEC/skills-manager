//! Read-only inspection of an existing library. Never installs, moves, or registers a skill.
use anyhow::{bail, Context, Result};
use serde::Serialize;
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize)]
pub struct LibrarySkillPreview {
    pub name: String,
    pub central_path: String,
    pub connections: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct LibraryPreview {
    pub root_path: String,
    pub skills_path: String,
    pub skill_count: usize,
    pub connection_count: usize,
    pub skills: Vec<LibrarySkillPreview>,
    /// Entries not treated as formal entities, including backups and directory links.
    pub excluded_paths: Vec<String>,
    /// Scan errors are explicit; a partial scan must not look like zero connections.
    pub unreadable_paths: Vec<String>,
}

pub fn inspect_library(root: &Path, client_roots: &[PathBuf]) -> Result<LibraryPreview> {
    let root = root.canonicalize().context("Cannot open library folder")?;
    let skills_path = root.join("skills");
    if !fs::symlink_metadata(&skills_path)
        .map(|m| m.file_type().is_dir())
        .unwrap_or(false)
    {
        bail!("Choose a library folder containing a real skills directory");
    }
    let mut skills = BTreeMap::<PathBuf, LibrarySkillPreview>::new();
    let mut excluded_paths = Vec::new();
    let mut unreadable_paths = Vec::new();
    for entry in fs::read_dir(&skills_path)? {
        let entry = entry?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') || name.contains(".backup-") {
            excluded_paths.push(path.to_string_lossy().to_string());
            continue;
        }
        if !entry.file_type()?.is_dir() {
            // Files (e.g. .DS_Store) and links are never adopted as entities.
            excluded_paths.push(path.to_string_lossy().to_string());
            continue;
        }
        if fs::read_dir(&path).is_err() {
            unreadable_paths.push(path.to_string_lossy().to_string());
            continue;
        }
        if !super::skill_metadata::is_valid_skill_dir(&path) {
            excluded_paths.push(path.to_string_lossy().to_string());
            continue;
        }
        skills.insert(path.canonicalize()?, LibrarySkillPreview {
            name,
            central_path: path.to_string_lossy().to_string(),
            connections: Vec::new(),
        });
    }
    // Shared directories may belong to several adapters. Count physical entry paths once.
    let mut seen = BTreeSet::new();
    for client_root in client_roots {
        let client_root = match client_root.canonicalize() {
            Ok(path) => path,
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => continue,
            Err(_) => {
                unreadable_paths.push(client_root.to_string_lossy().to_string());
                continue;
            }
        };
        let entries = match fs::read_dir(&client_root) {
            Ok(entries) => entries,
            Err(_) => {
                unreadable_paths.push(client_root.to_string_lossy().to_string());
                continue;
            }
        };
        for entry in entries {
            let entry = match entry {
                Ok(entry) => entry,
                Err(_) => {
                    unreadable_paths.push(client_root.to_string_lossy().to_string());
                    continue;
                }
            };
            let path = entry.path();
            if !seen.insert(path.clone()) { continue; }
            let metadata = match entry.file_type() {
                Ok(metadata) => metadata,
                Err(_) => {
                    unreadable_paths.push(path.to_string_lossy().to_string());
                    continue;
                }
            };
            if !metadata.is_symlink() { continue; }
            match path.canonicalize() {
                Ok(target) => {
                    if let Some(skill) = skills.get_mut(&target) {
                        skill.connections.push(path.to_string_lossy().to_string());
                    }
                }
                Err(_) => unreadable_paths.push(path.to_string_lossy().to_string()),
            }
        }
    }
    let mut skills: Vec<_> = skills.into_values().collect();
    skills.sort_by(|a, b| a.name.cmp(&b.name));
    for skill in &mut skills { skill.connections.sort(); }
    excluded_paths.sort();
    unreadable_paths.sort();
    unreadable_paths.dedup();
    Ok(LibraryPreview {
        root_path: root.to_string_lossy().to_string(),
        skills_path: skills_path.to_string_lossy().to_string(),
        skill_count: skills.len(),
        connection_count: skills.iter().map(|s| s.connections.len()).sum(),
        skills,
        excluded_paths,
        unreadable_paths,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    fn skill(path: &Path) {
        fs::create_dir_all(path).unwrap();
        fs::write(path.join("SKILL.md"), "---\nname: example\ndescription: Example\n---\n").unwrap();
    }
    #[test]
    fn excludes_backups_and_does_not_scan_archive_or_nested_content() {
        let tmp = tempfile::tempdir().unwrap();
        skill(&tmp.path().join("skills/example"));
        skill(&tmp.path().join("skills/example/nested"));
        skill(&tmp.path().join("skills/example.backup-20260101"));
        skill(&tmp.path().join("archive/old"));
        let result = inspect_library(tmp.path(), &[]).unwrap();
        assert_eq!(result.skill_count, 1);
        assert_eq!(result.excluded_paths.len(), 1);
        assert!(!tmp.path().join("skills-manager.db").exists());
        assert!(!tmp.path().join("skills/.skills-manager").exists());
    }
    #[test]
    fn rejects_a_non_library_without_creating_directories() {
        let tmp = tempfile::tempdir().unwrap();
        assert!(inspect_library(tmp.path(), &[]).is_err());
        assert_eq!(fs::read_dir(tmp.path()).unwrap().count(), 0);
    }
    #[cfg(unix)]
    #[test]
    fn counts_multiple_clients_once_per_entry_and_excludes_linked_entities() {
        use std::os::unix::fs::symlink;
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().join("library");
        skill(&root.join("skills/example"));
        symlink(root.join("skills/example"), root.join("skills/alias")).unwrap();
        let a = tmp.path().join("client-a");
        let b = tmp.path().join("client-b");
        fs::create_dir(&a).unwrap(); fs::create_dir(&b).unwrap();
        symlink(root.join("skills/example"), a.join("example")).unwrap();
        symlink(root.join("skills/example"), b.join("example")).unwrap();
        symlink(tmp.path().join("missing"), b.join("broken")).unwrap();
        let result = inspect_library(&root, &[a.clone(), a, b]).unwrap();
        assert_eq!(result.skill_count, 1);
        assert_eq!(result.connection_count, 2);
        assert_eq!(result.excluded_paths.len(), 1);
        assert_eq!(result.unreadable_paths.len(), 1);
    }
}
