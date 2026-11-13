//! A gocryptfs volume: unlock it, list it, read and write notes inside it.
//!
//! Names are exposed in plaintext with `/` separators; every path handed to this type is
//! relative to the volume root. The volume never touches files outside its own directory.

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use base64::Engine;
use zeroize::Zeroizing;

use crate::conf::{
    Cipher, ConfFile, CONF_FILE, CONTENT_VERSION, DIRIV_FILE, FLAG_DIR_IV, FLAG_EME_NAMES,
    FLAG_GCMIV128, FLAG_HKDF, FLAG_LONG_NAMES, FLAG_PLAINTEXT_NAMES, FLAG_RAW64,
    FLAG_XCHACHA20_POLY1305, LONG_NAME_PREFIX, LONG_NAME_SUFFIX,
};
use crate::crypto::EcbCipher;
use crate::eme;
use crate::error::{Error, Result};
use crate::file::{self, FILE_ID_LEN};
use crate::keys;

const SCRYPT_R: u32 = 8;
const SCRYPT_P: u32 = 1;
const SALT_LEN: usize = 32;
const DEFAULT_CREATOR: &str = "WinZettel";

/// One entry of a directory listing, already decrypted.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Entry {
    pub name: String,
    pub is_dir: bool,
    /// Plaintext size in bytes; directories report 0.
    pub size: u64,
}

/// How a new volume should be created. Mirrors the options the Android app offers.
#[derive(Debug, Clone)]
pub struct CreateOptions {
    /// `PlaintextNames`: store names unencrypted (contents stay encrypted).
    pub plaintext_names: bool,
    pub cipher: Cipher,
    /// scrypt cost as log2(N): 14 = Fast, 16 = Standard, 18 = Strong.
    pub log_n: u8,
    pub creator: String,
}

impl Default for CreateOptions {
    fn default() -> Self {
        Self {
            plaintext_names: false,
            // The Android app's "Auto" produced XChaCha20-Poly1305 on a real device, so we
            // match that instead of guessing AES-GCM.
            cipher: Cipher::XChaCha20Poly1305,
            log_n: 16,
            creator: DEFAULT_CREATOR.to_string(),
        }
    }
}

pub struct Volume {
    // Debug is hand-written below; secrets stay out of it.

    root: PathBuf,
    cipher: Cipher,
    plaintext_names: bool,
    name_cipher: Option<EcbCipher>,
    content_key: Zeroizing<[u8; 32]>,
    master_key: Zeroizing<[u8; 32]>,
    conf: ConfFile,
    /// Per-directory `diriv` cache, keyed by plaintext directory path ("" is the root).
    diriv_cache: Mutex<HashMap<String, [u8; 16]>>,
    /// Stored name per plaintext path, filled from listings so long names resolve.
    stored_names: Mutex<HashMap<String, String>>,
}

impl Volume {
    /// Unlock an existing volume with a password.
    pub fn open(root: &Path, password: &[u8]) -> Result<Self> {
        let conf = read_conf(root)?;
        conf.validate()?;
        let cipher = conf.cipher()?;

        let salt = conf.salt_bytes()?;
        let log_n = scrypt_log_n(&conf)?;
        let scrypt_hash = keys::derive_scrypt(
            password,
            &salt,
            log_n,
            conf.scrypt.r,
            conf.scrypt.p,
            conf.scrypt.key_len as usize,
        )?;
        let master_key = keys::unwrap_master_key(&scrypt_hash, &conf.encrypted_key_bytes()?)?;

        Self::from_unlocked(root, conf, cipher, master_key)
    }

    /// Create a new volume in an empty directory and return it unlocked.
    pub fn create(root: &Path, password: &[u8], options: &CreateOptions) -> Result<Self> {
        if password.is_empty() {
            return Err(Error::Damaged("the password cannot be empty".into()));
        }
        if root.exists() {
            match fs::read_dir(root) {
                Ok(mut entries) => {
                    if entries.next().is_some() {
                        return Err(Error::Damaged(format!(
                            "the folder {} is not empty",
                            root.display()
                        )));
                    }
                }
                Err(error) => return Err(Error::Io(error)),
            }
        }
        fs::create_dir_all(root)?;

        let salt = keys::random_bytes::<SALT_LEN>()?;
        let scrypt_hash = keys::derive_scrypt(password, &salt, options.log_n, SCRYPT_R, SCRYPT_P, 32)?;
        let master_key = keys::random_master_key()?;
        let encrypted_key = keys::wrap_master_key(&scrypt_hash, &master_key)?;

        let mut feature_flags = vec![FLAG_HKDF.to_string()];
        match options.cipher {
            Cipher::AesGcm => feature_flags.push(FLAG_GCMIV128.to_string()),
            Cipher::XChaCha20Poly1305 => feature_flags.push(FLAG_XCHACHA20_POLY1305.to_string()),
        }
        if options.plaintext_names {
            feature_flags.push(FLAG_PLAINTEXT_NAMES.to_string());
        } else {
            feature_flags.push(FLAG_DIR_IV.to_string());
            feature_flags.push(FLAG_EME_NAMES.to_string());
            feature_flags.push(FLAG_LONG_NAMES.to_string());
            feature_flags.push(FLAG_RAW64.to_string());
        }

        let conf = ConfFile {
            creator: options.creator.clone(),
            encrypted_key: base64::engine::general_purpose::STANDARD.encode(encrypted_key),
            scrypt: crate::conf::ScryptObject {
                salt: base64::engine::general_purpose::STANDARD.encode(salt),
                n: 1u32
                    .checked_shl(options.log_n as u32)
                    .ok_or_else(|| Error::Damaged("scrypt cost is out of range".into()))?,
                r: SCRYPT_R,
                p: SCRYPT_P,
                key_len: 32,
            },
            version: CONTENT_VERSION,
            feature_flags,
        };

        fs::write(root.join(CONF_FILE), conf.to_json()?)?;
        if !options.plaintext_names {
            fs::write(root.join(DIRIV_FILE), keys::random_bytes::<16>()?)?;
        }

        // Re-open what we just wrote: a volume we cannot read must never be left behind.
        Self::open(root, password)
    }

    fn from_unlocked(
        root: &Path,
        conf: ConfFile,
        cipher: Cipher,
        master_key: Zeroizing<[u8; 32]>,
    ) -> Result<Self> {
        let plaintext_names = conf.plaintext_names();
        let name_cipher = if plaintext_names {
            None
        } else {
            let name_key = keys::name_key(&master_key);
            Some(EcbCipher::new(&name_key)?)
        };
        let content_key = keys::content_key(&master_key, cipher.content_key_info());

        Ok(Self {
            root: root.to_path_buf(),
            cipher,
            plaintext_names,
            name_cipher,
            content_key,
            master_key,
            conf,
            diriv_cache: Mutex::new(HashMap::new()),
            stored_names: Mutex::new(HashMap::new()),
        })
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn cipher(&self) -> Cipher {
        self.cipher
    }

    pub fn plaintext_names(&self) -> bool {
        self.plaintext_names
    }

    pub fn creator(&self) -> &str {
        &self.conf.creator
    }

    /// Re-wrap the master key under a new password and rewrite the configuration atomically.
    pub fn change_password(&mut self, new_password: &[u8]) -> Result<()> {
        if new_password.is_empty() {
            return Err(Error::Damaged("the password cannot be empty".into()));
        }
        let salt = keys::random_bytes::<SALT_LEN>()?;
        let log_n = scrypt_log_n(&self.conf)?;
        let scrypt_hash =
            keys::derive_scrypt(new_password, &salt, log_n, self.conf.scrypt.r, self.conf.scrypt.p, 32)?;
        let encrypted_key = keys::wrap_master_key(&scrypt_hash, &self.master_key)?;

        self.conf.encrypted_key = base64::engine::general_purpose::STANDARD.encode(encrypted_key);
        self.conf.scrypt.salt = base64::engine::general_purpose::STANDARD.encode(salt);

        let temporary = self.root.join(format!("{CONF_FILE}.tmp"));
        fs::write(&temporary, self.conf.to_json()?)?;
        replace_file(&temporary, &self.root.join(CONF_FILE))?;
        Ok(())
    }

    /// List a directory, decrypting names. `relative_dir` is `""` for the volume root.
    pub fn list(&self, relative_dir: &str) -> Result<Vec<Entry>> {
        let directory = self.cipher_path(relative_dir)?;
        let mut entries = Vec::new();

        for item in fs::read_dir(&directory)? {
            let item = item?;
            let file_name = item.file_name().to_string_lossy().to_string();
            if file_name == CONF_FILE || file_name == DIRIV_FILE {
                continue;
            }
            let metadata = item.metadata()?;
            let is_dir = metadata.is_dir();
            let Some(plaintext) = self.plaintext_name(relative_dir, &file_name)? else {
                // A long-name data file: its `.name` sidecar produces the entry instead.
                continue;
            };

            let relative = join_relative(relative_dir, &plaintext);
            self.stored_names
                .lock()
                .expect("name cache poisoned")
                .insert(relative, file_name);

            entries.push(Entry {
                name: plaintext,
                is_dir,
                size: if is_dir {
                    0
                } else {
                    file::plaintext_len(self.cipher, metadata.len())
                },
            });
        }

        entries.sort_by(|left, right| left.name.cmp(&right.name));
        Ok(entries)
    }

    /// Read a note, decrypting its blocks.
    pub fn read(&self, relative: &str) -> Result<Vec<u8>> {
        let path = self.stored_path(relative)?;
        let bytes = fs::read(path)?;
        file::decrypt_file(self.cipher, &self.content_key, &bytes)
    }

    /// Create every missing directory of `relative` through the volume.
    fn ensure_parent_directories(&self, relative: &str) -> Result<()> {
        let mut prefix = String::new();
        for segment in relative.split('/') {
            prefix = join_relative(&prefix, segment);
            if prefix == relative {
                break;
            }
            let path = self.cipher_path(&prefix)?;
            if path.is_dir() {
                continue;
            }
            self.create_dir(&prefix)?;
        }
        Ok(())
    }

    /// Write a note, re-encrypting it in place and keeping its file ID.
    ///
    /// The write goes to a sibling temporary file first, so an interrupted save cannot leave
    /// a half-encrypted note that the phone would refuse to open.
    pub fn write(&self, relative: &str, contents: &[u8]) -> Result<()> {
        self.ensure_parent_directories(relative)?;
        let path = self.stored_path(relative)?;
        let file_id = match fs::read(&path) {
            Ok(existing) => file::Header::parse(&existing)?.file_id,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                keys::random_bytes::<FILE_ID_LEN>()?
            }
            Err(error) => return Err(Error::Io(error)),
        };

        let encrypted =
            file::encrypt_file(self.cipher, &self.content_key, file_id, contents)?;
        let parent = path
            .parent()
            .ok_or_else(|| Error::Damaged("the note has no parent directory".into()))?;
        let temporary = parent.join(format!(".mf-tmp-{}", hex(&keys::random_bytes::<8>()?)));
        fs::write(&temporary, encrypted)?;
        replace_file(&temporary, &path)?;
        Ok(())
    }

    /// Create a directory. New directories get their own `diriv`, like gocryptfs does.
    pub fn create_dir(&self, relative: &str) -> Result<()> {
        let parent = parent_relative(relative);
        let name = base_name(relative)?;
        let parent_path = self.cipher_path(parent)?;
        let stored = self.stored_name_for_new(parent, name)?;
        let target = parent_path.join(stored);
        fs::create_dir_all(&target)?;
        if !self.plaintext_names {
            fs::write(target.join(DIRIV_FILE), keys::random_bytes::<16>()?)?;
        }
        Ok(())
    }

    pub fn remove_file(&self, relative: &str) -> Result<()> {
        fs::remove_file(self.stored_path(relative)?)?;
        Ok(())
    }

    pub fn remove_dir(&self, relative: &str) -> Result<()> {
        fs::remove_dir(self.cipher_path(relative)?)?;
        Ok(())
    }

    fn stored_path(&self, relative: &str) -> Result<PathBuf> {
        if let Some(stored) = self
            .stored_names
            .lock()
            .expect("name cache poisoned")
            .get(relative)
            .cloned()
        {
            let parent = self.cipher_path(parent_relative(relative))?;
            return Ok(parent.join(stored));
        }
        self.cipher_path(relative)
    }

    fn stored_name_for_new(&self, relative_dir: &str, name: &str) -> Result<String> {
        if self.plaintext_names {
            return Ok(name.to_string());
        }
        let diriv = self.diriv(relative_dir)?;
        let cipher = self
            .name_cipher
            .as_ref()
            .ok_or_else(|| Error::Damaged("name cipher is unavailable".into()))?;
        let stored = eme::encrypt_name(cipher, &diriv, name)?;
        if stored.len() > 255 {
            return Err(Error::NameTooLong(format!(
                "the name {name:?} is too long for this volume"
            )));
        }
        Ok(stored)
    }

    fn cipher_path(&self, relative: &str) -> Result<PathBuf> {
        if relative.is_empty() {
            return Ok(self.root.clone());
        }
        let mut path = self.root.clone();
        let mut prefix = String::new();
        for segment in relative.split('/').filter(|item| !item.is_empty()) {
            let stored = self.stored_name_for_new(&prefix, segment)?;
            path = path.join(&stored);
            prefix = join_relative(&prefix, segment);
        }
        Ok(path)
    }

    fn diriv(&self, relative_dir: &str) -> Result<[u8; 16]> {
        if let Some(cached) = self
            .diriv_cache
            .lock()
            .expect("diriv cache poisoned")
            .get(relative_dir)
            .copied()
        {
            return Ok(cached);
        }
        let directory = self.cipher_path(relative_dir)?;
        let raw = fs::read(directory.join(DIRIV_FILE)).map_err(|error| {
            if error.kind() == std::io::ErrorKind::NotFound {
                Error::Damaged(format!("{} has no {DIRIV_FILE}", directory.display()))
            } else {
                Error::Io(error)
            }
        })?;
        if raw.len() != 16 {
            return Err(Error::Damaged(format!(
                "{DIRIV_FILE} in {} is {} bytes, expected 16",
                directory.display(),
                raw.len()
            )));
        }
        let mut diriv = [0u8; 16];
        diriv.copy_from_slice(&raw);
        self.diriv_cache
            .lock()
            .expect("diriv cache poisoned")
            .insert(relative_dir.to_string(), diriv);
        Ok(diriv)
    }

    /// Turn a stored name into a plaintext name, handling the long-name sidecar.
    ///
    /// Returns `Ok(None)` for a long-name data file, whose entry comes from its `.name` file.
    fn plaintext_name(&self, relative_dir: &str, stored: &str) -> Result<Option<String>> {
        if self.plaintext_names {
            return Ok(Some(stored.to_string()));
        }
        if let Some(rest) = stored.strip_prefix(LONG_NAME_PREFIX) {
            if let Some(hash) = rest.strip_suffix(LONG_NAME_SUFFIX) {
                // The sidecar holds the encrypted name bytes.
                let directory = self.cipher_path(relative_dir)?;
                let raw = fs::read(directory.join(stored))?;
                let diriv = self.diriv(relative_dir)?;
                let cipher = self
                    .name_cipher
                    .as_ref()
                    .ok_or_else(|| Error::Damaged("name cipher is unavailable".into()))?;
                let name = eme::decrypt_name(cipher, &diriv, &base64_url(&raw))?;
                self.stored_names
                    .lock()
                    .expect("name cache poisoned")
                    .insert(
                        join_relative(relative_dir, &name),
                        format!("{LONG_NAME_PREFIX}{hash}"),
                    );
                return Ok(Some(name));
            }
            return Ok(None);
        }
        let diriv = self.diriv(relative_dir)?;
        let cipher = self
            .name_cipher
            .as_ref()
            .ok_or_else(|| Error::Damaged("name cipher is unavailable".into()))?;
        Ok(Some(eme::decrypt_name(cipher, &diriv, stored)?))
    }
}

fn read_conf(root: &Path) -> Result<ConfFile> {
    let path = root.join(CONF_FILE);
    let raw = fs::read(&path).map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            Error::Damaged(format!(
                "{} does not contain {CONF_FILE}, so it is not an encrypted repository",
                root.display()
            ))
        } else {
            Error::Io(error)
        }
    })?;
    Ok(serde_json::from_slice(&raw)?)
}

fn scrypt_log_n(conf: &ConfFile) -> Result<u8> {
    match conf.scrypt.n.checked_ilog2() {
        Some(log) if conf.scrypt.n == 1u32 << log => Ok(log as u8),
        _ => Err(Error::Damaged(format!(
            "scrypt N = {} is not a power of two",
            conf.scrypt.n
        ))),
    }
}

/// Replace `target` with `source`, removing the old file first because Windows cannot
/// rename over an existing path.
fn replace_file(source: &Path, target: &Path) -> Result<()> {
    if target.exists() {
        fs::remove_file(target)?;
    }
    fs::rename(source, target)?;
    Ok(())
}

fn join_relative(parent: &str, name: &str) -> String {
    if parent.is_empty() {
        name.to_string()
    } else {
        format!("{parent}/{name}")
    }
}

fn parent_relative(relative: &str) -> &str {
    match relative.rfind('/') {
        Some(index) => &relative[..index],
        None => "",
    }
}

fn base_name(relative: &str) -> Result<&str> {
    relative
        .rsplit('/')
        .next()
        .filter(|name| !name.is_empty())
        .ok_or_else(|| Error::Damaged(format!("{relative:?} is not a valid path")))
}

fn base64_url(bytes: &[u8]) -> String {
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}


impl std::fmt::Debug for Volume {
    /// Never prints keys or the configuration: only what is safe to log.
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("Volume")
            .field("root", &self.root)
            .field("cipher", &self.cipher)
            .field("plaintext_names", &self.plaintext_names)
            .finish_non_exhaustive()
    }
}
