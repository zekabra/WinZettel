use base64::Engine;
use serde::{Deserialize, Serialize};

use crate::error::{Error, Result};

pub const CONF_FILE: &str = "gocryptfs.conf";
pub const DIRIV_FILE: &str = "gocryptfs.diriv";
/// Long names are stored as `gocryptfs.longname.<hash>` plus a `….name` sidecar.
pub const LONG_NAME_PREFIX: &str = "gocryptfs.longname.";
pub const LONG_NAME_SUFFIX: &str = ".name";

pub const FLAG_HKDF: &str = "HKDF";
pub const FLAG_GCMIV128: &str = "GCMIV128";
pub const FLAG_XCHACHA20_POLY1305: &str = "XChaCha20Poly1305";
pub const FLAG_PLAINTEXT_NAMES: &str = "PlaintextNames";
pub const FLAG_DIR_IV: &str = "DirIV";
pub const FLAG_EME_NAMES: &str = "EMENames";
pub const FLAG_LONG_NAMES: &str = "LongNames";
pub const FLAG_RAW64: &str = "Raw64";
pub const FLAG_AESSIV: &str = "AESSIV";

/// The on-disk content format this crate writes. gocryptfs v2 is what Zettel Notes uses.
pub const CONTENT_VERSION: u16 = 2;
const SUPPORTED_VERSION: u16 = 2;

/// Which AEAD protects file contents. The master key is always wrapped with AES-GCM.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Cipher {
    AesGcm,
    XChaCha20Poly1305,
}

impl Cipher {
    /// gocryptfs `XChaCha20-Poly1305` uses a 192-bit nonce; AES-GCM uses 128-bit IVs.
    pub const fn nonce_len(self) -> usize {
        match self {
            Self::AesGcm => 16,
            Self::XChaCha20Poly1305 => 24,
        }
    }

    pub const fn content_key_info(self) -> &'static [u8] {
        match self {
            Self::AesGcm => b"AES-GCM file content encryption",
            Self::XChaCha20Poly1305 => b"XChaCha20-Poly1305 file content encryption",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScryptObject {
    #[serde(rename = "Salt")]
    pub salt: String,
    #[serde(rename = "N")]
    pub n: u32,
    #[serde(rename = "R")]
    pub r: u32,
    #[serde(rename = "P")]
    pub p: u32,
    #[serde(rename = "KeyLen")]
    pub key_len: u32,
}

/// The JSON document stored as `gocryptfs.conf`.
///
/// Field names and ordering follow gocryptfs so a volume we write stays readable by the
/// Android app and by the gocryptfs CLI.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfFile {
    #[serde(rename = "Creator")]
    pub creator: String,
    #[serde(rename = "EncryptedKey")]
    pub encrypted_key: String,
    #[serde(rename = "ScryptObject")]
    pub scrypt: ScryptObject,
    #[serde(rename = "Version")]
    pub version: u16,
    #[serde(rename = "FeatureFlags")]
    pub feature_flags: Vec<String>,
}

impl ConfFile {
    pub fn encrypted_key_bytes(&self) -> Result<Vec<u8>> {
        base64::engine::general_purpose::STANDARD
            .decode(&self.encrypted_key)
            .map_err(|error| Error::Damaged(format!("EncryptedKey: {error}")))
    }

    pub fn salt_bytes(&self) -> Result<Vec<u8>> {
        base64::engine::general_purpose::STANDARD
            .decode(&self.scrypt.salt)
            .map_err(|error| Error::Damaged(format!("Salt: {error}")))
    }

    pub fn has_flag(&self, flag: &str) -> bool {
        self.feature_flags.iter().any(|item| item == flag)
    }

    pub fn plaintext_names(&self) -> bool {
        self.has_flag(FLAG_PLAINTEXT_NAMES)
    }

    pub fn cipher(&self) -> Result<Cipher> {
        if self.has_flag(FLAG_XCHACHA20_POLY1305) {
            return Ok(Cipher::XChaCha20Poly1305);
        }
        if self.has_flag(FLAG_AESSIV) {
            return Err(Error::Unsupported(
                "AES-SIV volumes are not implemented; recreate the repository with AES-GCM or XChaCha20-Poly1305".into(),
            ));
        }
        Ok(Cipher::AesGcm)
    }

    /// Reject volumes we would read wrongly instead of guessing.
    pub fn validate(&self) -> Result<()> {
        if self.version != SUPPORTED_VERSION {
            return Err(Error::Unsupported(format!(
                "content format version {} (only {SUPPORTED_VERSION} is supported)",
                self.version
            )));
        }
        if !self.has_flag(FLAG_HKDF) {
            return Err(Error::Unsupported(
                "volumes created before gocryptfs 1.3 (no HKDF) are not supported".into(),
            ));
        }
        if self.plaintext_names() && self.has_flag(FLAG_EME_NAMES) {
            return Err(Error::Damaged(
                "PlaintextNames and EMENames cannot both be set".into(),
            ));
        }
        self.cipher()?;
        Ok(())
    }

    pub fn to_json(&self) -> Result<String> {
        Ok(serde_json::to_string_pretty(self)?)
    }
}
