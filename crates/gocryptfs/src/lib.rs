//! A minimal, format-compatible reader/writer for `gocryptfs` v2 volumes.
//!
//! Zettel Notes on Android stores its "encrypted repositories" as gocryptfs volumes, so a
//! desktop client has to speak the same on-disk format. Everything here was verified against
//! a real volume created by Zettel Notes 3.1.4:
//!
//! * the master key is wrapped with scrypt + HKDF + AES-256-GCM,
//! * file names are encrypted with EME, keyed by a per-directory `gocryptfs.diriv`,
//! * file contents are AES-256-GCM (16-byte nonce) or XChaCha20-Poly1305 (24-byte nonce),
//!   in 4096-byte plaintext blocks with `blockNo || fileID` as associated data.

mod conf;
mod crypto;
mod eme;
mod error;
mod file;
mod keys;
mod volume;

pub use conf::{
    Cipher, ConfFile, CONF_FILE, DIRIV_FILE, FLAG_AESSIV, FLAG_DIR_IV, FLAG_EME_NAMES,
    FLAG_GCMIV128, FLAG_HKDF, FLAG_LONG_NAMES, FLAG_PLAINTEXT_NAMES, FLAG_RAW64,
    FLAG_XCHACHA20_POLY1305,
};
pub use error::{Error, Result};
pub use volume::{CreateOptions, Entry, Volume};
