use std::io;

/// Everything that can go wrong while reading or writing a volume.
///
/// The variants are deliberately coarse: the UI has to explain a handful of situations
/// (wrong password, unsupported feature, damaged file), not every internal detail.
#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("i/o error: {0}")]
    Io(#[from] io::Error),
    #[error("the volume configuration is not valid JSON: {0}")]
    Json(#[from] serde_json::Error),
    #[error("the password is wrong")]
    BadPassword,
    #[error("the volume is damaged: {0}")]
    Damaged(String),
    #[error("this volume uses a feature that is not supported: {0}")]
    Unsupported(String),
    #[error("the file name cannot be encrypted: {0}")]
    NameTooLong(String),
}

pub type Result<T> = std::result::Result<T, Error>;
