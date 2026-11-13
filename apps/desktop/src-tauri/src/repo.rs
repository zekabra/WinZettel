//! The active encrypted repository, if any.
//!
//! The desktop app keeps one unlocked gocryptfs volume per process, mirroring how the window
//! model works: a window opens exactly one workspace. Every file command asks this module
//! whether a path belongs to that volume before touching the disk, so the rest of the app
//! does not need to know that encryption exists.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use mf_gocryptfs::Volume;
use serde::Serialize;

/// Names that belong to the encryption machinery or to the Android app, never to the user.
const HIDDEN_NAMES: [&str; 5] = [
    ".zettel-notes",
    "gocryptfs.conf",
    "gocryptfs.diriv",
    "gocryptfs.conf.tmp",
    "gocryptfs.longname",
];

pub struct ActiveRepo {
    pub root: PathBuf,
    pub volume: Volume,
}

static ACTIVE: Mutex<Option<ActiveRepo>> = Mutex::new(None);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoStatus {
    /// The folder carries a gocryptfs configuration, so it is an encrypted repository.
    pub is_repo: bool,
    /// That repository is currently unlocked in this process.
    pub is_unlocked: bool,
    /// The folder that is unlocked, when there is one.
    pub root: Option<String>,
    pub creator: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoEntry {
    pub name: String,
    pub is_dir: bool,
    pub size: u64,
}

fn lock() -> std::sync::MutexGuard<'static, Option<ActiveRepo>> {
    ACTIVE.lock().expect("repository state poisoned")
}

pub fn is_configured_repository(path: &Path) -> bool {
    path.join("gocryptfs.conf").is_file()
}

pub fn status(path: &str) -> RepoStatus {
    let folder = Path::new(path);
    let guard = lock();
    let unlocked_root = guard.as_ref().map(|repo| repo.root.clone());

    RepoStatus {
        is_repo: is_configured_repository(folder),
        is_unlocked: match &unlocked_root {
            Some(root) => same_path(root, folder),
            None => false,
        },
        // Always report the unlocked root: the UI needs it to tell the owner that switching
        // repositories locked the previous one.
        root: unlocked_root.map(|root| root.to_string_lossy().to_string()),
        creator: guard.as_ref().and_then(|repo| {
            if same_path(&repo.root, folder) {
                Some(repo.volume.creator().to_string())
            } else {
                None
            }
        }),
    }
}

/// Unlock a repository, replacing any previously unlocked one.
pub fn unlock(path: &str, password: &str) -> Result<RepoStatus, String> {
    let folder = PathBuf::from(path);
    let volume = Volume::open(&folder, password.as_bytes()).map_err(|error| {
        match error {
            mf_gocryptfs::Error::BadPassword => "bad_password".to_string(),
            other => other.to_string(),
        }
    })?;

    let creator = volume.creator().to_string();
    *lock() = Some(ActiveRepo {
        root: folder.clone(),
        volume,
    });

    Ok(RepoStatus {
        is_repo: true,
        is_unlocked: true,
        root: Some(folder.to_string_lossy().to_string()),
        creator: Some(creator),
    })
}

/// Create a new repository and leave it unlocked, like the Android app's wizard does.
///
/// "auto" is not a cipher on disk: it resolves to XChaCha20-Poly1305, which is what the
/// Android app produced with its defaults, so both apps agree on what a new repository is.
pub fn create(
    path: &str,
    password: &str,
    plaintext_names: bool,
    cipher: &str,
    log_n: u8,
) -> Result<RepoStatus, String> {
    use mf_gocryptfs::{Cipher, CreateOptions};

    if !(14..=18).contains(&log_n) {
        return Err("unsupported key strength".to_string());
    }
    let cipher = match cipher {
        "aes" => Cipher::AesGcm,
        "auto" | "xchacha" => Cipher::XChaCha20Poly1305,
        other => return Err(format!("unknown cipher {other}")),
    };

    let folder = PathBuf::from(path);
    let options = CreateOptions {
        plaintext_names,
        cipher,
        log_n,
        creator: "WinZettel".to_string(),
    };
    let volume = mf_gocryptfs::Volume::create(&folder, password.as_bytes(), &options)
        .map_err(|error| error.to_string())?;

    let creator = volume.creator().to_string();
    *lock() = Some(ActiveRepo {
        root: folder.clone(),
        volume,
    });

    Ok(RepoStatus {
        is_repo: true,
        is_unlocked: true,
        root: Some(folder.to_string_lossy().to_string()),
        creator: Some(creator),
    })
}

pub fn lock_volume() {
    *lock() = None;
}

/// Translate an absolute path into a volume-relative path, preserving the caller's casing.
///
/// The comparison ignores case because Windows paths come back in different shapes from the
/// picker, the tree and the search results, but the returned path keeps the original spelling
/// so encrypted names match what is on disk.
pub fn relative_path(path: &str) -> Option<String> {
    {
        let guard = lock();
        if let Some(repo) = guard.as_ref() {
            if let Some(relative) = relative_from_root(&repo.root.to_string_lossy(), path) {
                return Some(relative);
            }
        }
    }
    let (root, relative) = locate_in_repo(path)?;
    let guard = lock();
    match guard.as_ref() {
        Some(repo) if same_path(&repo.root, &root) => Some(relative),
        _ => None,
    }
}

/// Absolute path of the repository root, for building absolute paths in search results.
pub fn active_root() -> Option<String> {
    let guard = ACTIVE.lock().ok()?;
    guard
        .as_ref()
        .map(|repo| repo.root.to_string_lossy().to_string())
}

/// True when this folder is a repository root that is not unlocked right now.
///
/// Listing a locked repository must never fall through to the disk: the owner would see
/// ciphertext names and would have no way to tell what went wrong.
pub fn is_locked_repository(path: &str) -> bool {
    if !is_configured_repository(Path::new(path)) {
        return false;
    }
    let guard = match ACTIVE.lock() {
        Ok(guard) => guard,
        Err(_) => return true,
    };
    match guard.as_ref() {
        Some(repo) => !same_path(&repo.root, Path::new(path)),
        None => true,
    }
}

/// True when the path lives inside a repository folder that is not unlocked. Used to keep
/// reads from falling back to the ciphertext on disk after a lock.
pub fn is_in_locked_repository(path: &str) -> bool {
    if relative_path(path).is_some() {
        return false;
    }
    let target = Path::new(path).to_string_lossy().to_lowercase();
    let mut current = Path::new(path).parent();
    while let Some(folder) = current {
        if is_configured_repository(folder) {
            let folder_text = folder.to_string_lossy().to_lowercase();
            let unlocked = ACTIVE
                .lock()
                .ok()
                .and_then(|guard| {
                    guard
                        .as_ref()
                        .map(|repo| repo.root.to_string_lossy().to_lowercase())
                })
                .map(|root| folder_text.starts_with(&root) || root.starts_with(&folder_text))
                .unwrap_or(false);
            return !unlocked;
        }
        current = folder.parent();
    }
    let _ = target;
    false
}

pub fn list(relative_dir: &str) -> Result<Vec<RepoEntry>, String> {
    let guard = lock();
    let repo = guard.as_ref().ok_or("no repository is unlocked")?;
    let entries = repo
        .volume
        .list(relative_dir)
        .map_err(|error| error.to_string())?;

    Ok(entries
        .into_iter()
        .filter(|entry| !is_hidden(&entry.name))
        .map(|entry| RepoEntry {
            name: entry.name,
            is_dir: entry.is_dir,
            size: entry.size,
        })
        .collect())
}

pub fn read(relative: &str) -> Result<Vec<u8>, String> {
    let guard = lock();
    let repo = guard.as_ref().ok_or("no repository is unlocked")?;
    repo.volume.read(relative).map_err(|error| error.to_string())
}

/// Find the repository that contains `path`, walking its real ancestors.
fn locate_in_repo(path: &str) -> Option<(PathBuf, String)> {
    let mut current = Some(PathBuf::from(path));
    while let Some(candidate) = current {
        if is_configured_repository(&candidate) {
            let root_text = candidate.to_string_lossy().to_string();
            let relative = relative_from_root(&root_text, path).unwrap_or_default();
            return Some((candidate, relative));
        }
        current = candidate.parent().map(Path::to_path_buf);
    }
    None
}

/// Where a write must go, decided once so no command can bypass the volume.
pub enum WriteTarget {
    /// Plain folder: the caller writes with the filesystem.
    Disk,
    /// Inside the unlocked repository: write through the volume.
    Volume(String),
    /// Inside a repository that is locked: refuse, never write plaintext.
    Locked,
}

pub fn classify_write(path: &str) -> WriteTarget {
    let Some((root, relative)) = locate_in_repo(path) else {
        return WriteTarget::Disk;
    };
    let guard = match ACTIVE.lock() {
        Ok(guard) => guard,
        Err(_) => return WriteTarget::Locked,
    };
    match guard.as_ref() {
        Some(repo) if same_path(&repo.root, &root) => WriteTarget::Volume(relative),
        _ => WriteTarget::Locked,
    }
}

pub fn write(relative: &str, contents: &[u8]) -> Result<(), String> {
    let guard = lock();
    let repo = guard.as_ref().ok_or("no repository is unlocked")?;
    repo.volume
        .write(relative, contents)
        .map_err(|error| error.to_string())
}

pub fn create_dir(relative: &str) -> Result<(), String> {
    let guard = lock();
    let repo = guard.as_ref().ok_or("no repository is unlocked")?;
    repo.volume
        .create_dir(relative)
        .map_err(|error| error.to_string())
}

pub fn remove_file(relative: &str) -> Result<(), String> {
    let guard = lock();
    let repo = guard.as_ref().ok_or("no repository is unlocked")?;
    repo.volume
        .remove_file(relative)
        .map_err(|error| error.to_string())
}

pub fn remove_dir(relative: &str) -> Result<(), String> {
    let guard = lock();
    let repo = guard.as_ref().ok_or("no repository is unlocked")?;
    repo.volume
        .remove_dir(relative)
        .map_err(|error| error.to_string())
}

/// Rename a note or folder inside the volume.
pub fn rename(from: &str, to: &str) -> Result<(), String> {
    let guard = lock();
    let repo = guard.as_ref().ok_or("no repository is unlocked")?;
    let bytes = repo
        .volume
        .read(from)
        .map_err(|error| error.to_string())?;
    repo.volume
        .write(to, &bytes)
        .map_err(|error| error.to_string())?;
    repo.volume
        .remove_file(from)
        .map_err(|error| error.to_string())
}

pub fn exists(relative: &str) -> bool {
    let guard = match ACTIVE.lock() {
        Ok(guard) => guard,
        Err(_) => return false,
    };
    let Some(repo) = guard.as_ref() else {
        return false;
    };
    if relative.is_empty() {
        return true;
    }
    let (parent, name) = match relative.rsplit_once('/') {
        Some((parent, name)) => (parent, name),
        None => ("", relative),
    };
    repo.volume
        .list(parent)
        .map(|entries| entries.iter().any(|entry| entry.name == name))
        .unwrap_or(false)
}

pub fn is_dir(relative: &str) -> bool {
    let guard = match ACTIVE.lock() {
        Ok(guard) => guard,
        Err(_) => return false,
    };
    let Some(repo) = guard.as_ref() else {
        return false;
    };
    if relative.is_empty() {
        return true;
    }
    let (parent, name) = match relative.rsplit_once('/') {
        Some((parent, name)) => (parent, name),
        None => ("", relative),
    };
    repo.volume
        .list(parent)
        .map(|entries| {
            entries
                .iter()
                .any(|entry| entry.name == name && entry.is_dir)
        })
        .unwrap_or(false)
}

/// Revision of an encrypted note, used for conflict detection by the editor.
///
/// It hashes the plaintext, because the ciphertext changes on every save even when the note
/// does not.
pub fn write_revision(relative: &str) -> Result<String, String> {
    let bytes = read(relative)?;
    Ok(plaintext_revision(&bytes))
}

pub fn plaintext_revision(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    format!("enc:{:x}", hasher.finalize())
}

fn is_hidden(name: &str) -> bool {
    HIDDEN_NAMES.iter().any(|hidden| {
        if *hidden == "gocryptfs.longname" {
            name.starts_with("gocryptfs.longname.")
        } else {
            name == *hidden
        }
    })
}

/// Windows hands paths back in three shapes: as the picker gave them, with a trailing
/// separator from the tree, and canonicalised with an extended-length prefix.
fn strip_windows_prefix(path: &str) -> &str {
    path.strip_prefix(r"\\?\UNC\")
        .or_else(|| path.strip_prefix(r"\\?\"))
        .unwrap_or(path)
}

/// Canonical text form used for every path comparison inside the repository layer.
fn normalize_identity(path: &str) -> String {
    let mut value = strip_windows_prefix(path).replace('/', "\\").to_lowercase();
    while value.len() > 3 && value.ends_with('\\') {
        value.pop();
    }
    value
}

/// Volume-relative path of `path` under `root`, preserving the caller's casing.
fn relative_from_root(root: &str, path: &str) -> Option<String> {
    let root_text = strip_windows_prefix(root).trim_end_matches(['\\', '/']);
    let path_text = strip_windows_prefix(path);
    let root_identity = normalize_identity(root_text);
    let path_identity = normalize_identity(path_text);

    if path_identity == root_identity {
        return Some(String::new());
    }
    let prefix = format!("{root_identity}\\");
    if !path_identity.starts_with(&prefix) {
        return None;
    }
    let tail = &path_text[root_text.len()..];
    Some(tail.trim_start_matches(['\\', '/']).replace('\\', "/"))
}

fn same_path(left: &Path, right: &Path) -> bool {
    if normalize_identity(&left.to_string_lossy()) == normalize_identity(&right.to_string_lossy()) {
        return true;
    }
    // Different spellings of the same folder (junctions, extended prefixes) still converge here.
    match (std::fs::canonicalize(left), std::fs::canonicalize(right)) {
        (Ok(left), Ok(right)) => {
            normalize_identity(&left.to_string_lossy()) == normalize_identity(&right.to_string_lossy())
        }
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn path_identity_ignores_case_separators_and_trailing_slash() {
        assert!(same_path(
            Path::new("E:\\TesteNotas"),
            Path::new("e:/testenotas/")
        ));
        assert!(!same_path(
            Path::new("E:\\TesteNotas"),
            Path::new("E:\\TesteNotas2")
        ));
    }

    #[test]
    fn relative_paths_keep_casing_and_nesting() {
        assert_eq!(
            relative_from_root("E:\\Repo", "E:\\repo\\teste\\Nota.md"),
            Some("teste/Nota.md".to_string())
        );
        assert_eq!(
            relative_from_root("E:\\Repo\\", "E:\\Repo\\a.md"),
            Some("a.md".to_string())
        );
        assert_eq!(relative_from_root("E:\\Repo", "E:\\Repo"), Some(String::new()));
        assert_eq!(relative_from_root("E:\\Repo", "E:\\Other\\a.md"), None);
    }

    #[test]
    fn hidden_names_are_the_android_state_and_the_configuration() {
        assert!(is_hidden(".zettel-notes"));
        assert!(is_hidden("gocryptfs.conf"));
        assert!(is_hidden("gocryptfs.diriv"));
        assert!(is_hidden("gocryptfs.longname.abc.name"));
        assert!(!is_hidden("teste.md"));
        assert!(!is_hidden("notas"));
    }
}

pub mod cmd {
    use super::{RepoStatus, ACTIVE};
    use std::fs;
    use std::path::Path;

    #[tauri::command]
    pub async fn repo_status(path: String) -> Result<RepoStatus, String> {
        Ok(super::status(&path))
    }

    /// Unlock a repository: `bad_password` is returned as such so the UI can retry.
    #[tauri::command]
    pub async fn repo_unlock(path: String, password: String) -> Result<RepoStatus, String> {
        super::unlock(&path, &password)
    }

    /// Create a repository: the wizard collects the folder, the password and the options.
    #[tauri::command]
    pub async fn repo_create(
        path: String,
        password: String,
        plaintext_names: bool,
        cipher: String,
        log_n: u8,
    ) -> Result<RepoStatus, String> {
        super::create(&path, &password, plaintext_names, &cipher, log_n)
    }

    #[tauri::command]
    pub async fn repo_lock() -> Result<bool, String> {
        super::lock_volume();
        Ok(true)
    }

    /// Best-effort lock used when the window is closing or the workspace changes.
    pub fn lock_if_root(path: &str) {
        let mut guard = match ACTIVE.lock() {
            Ok(guard) => guard,
            Err(_) => return,
        };
        let matches = guard
            .as_ref()
            .map(|repo| repo.root.to_string_lossy().to_lowercase() == path.to_lowercase())
            .unwrap_or(false);
        if matches {
            *guard = None;
        }
    }

    /// Create the folder on disk before unlocking it, so the picker can hand us a new path.
    pub fn ensure_folder(path: &str) -> Result<(), String> {
        if Path::new(path).is_dir() {
            return Ok(());
        }
        fs::create_dir_all(path).map_err(|error| error.to_string())
    }
}


