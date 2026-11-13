//! File content format: an 18-byte header followed by AEAD-protected 4096-byte blocks.
//!
//! Verified against a Zettel Notes volume: the header is `version (u16 big-endian)` followed
//! by the 16-byte file ID, and every block is `nonce || ciphertext || tag` with
//! `blockNo (u64 big-endian) || fileID` as associated data.

use crate::conf::{Cipher, CONTENT_VERSION};
use crate::crypto;
use crate::error::{Error, Result};

pub const HEADER_LEN: usize = 18;
pub const FILE_ID_LEN: usize = 16;
pub const PLAIN_BLOCK_LEN: usize = 4096;
pub const TAG_LEN: usize = 16;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Header {
    pub version: u16,
    pub file_id: [u8; FILE_ID_LEN],
}

impl Header {
    pub fn parse(bytes: &[u8]) -> Result<Self> {
        if bytes.len() < HEADER_LEN {
            return Err(Error::Damaged(format!(
                "file is {} bytes, shorter than its {HEADER_LEN}-byte header",
                bytes.len()
            )));
        }
        let version = u16::from_be_bytes([bytes[0], bytes[1]]);
        if version != CONTENT_VERSION {
            return Err(Error::Unsupported(format!(
                "file content version {version} (only {CONTENT_VERSION} is supported)"
            )));
        }
        let mut file_id = [0u8; FILE_ID_LEN];
        file_id.copy_from_slice(&bytes[2..HEADER_LEN]);
        Ok(Self { version, file_id })
    }

    pub fn encode(&self) -> Vec<u8> {
        let mut out = Vec::with_capacity(HEADER_LEN);
        out.extend_from_slice(&self.version.to_be_bytes());
        out.extend_from_slice(&self.file_id);
        out
    }
}

/// Associated data for one block: the block number and the file ID.
fn associated_data(block_no: u64, file_id: &[u8; FILE_ID_LEN]) -> [u8; 8 + FILE_ID_LEN] {
    let mut aad = [0u8; 8 + FILE_ID_LEN];
    aad[..8].copy_from_slice(&block_no.to_be_bytes());
    aad[8..].copy_from_slice(file_id);
    aad
}

fn open_block(cipher: Cipher, key: &[u8; 32], nonce: &[u8], aad: &[u8], body: &[u8]) -> Result<Vec<u8>> {
    match cipher {
        Cipher::AesGcm => crypto::aes_gcm_open(key, nonce, aad, body),
        Cipher::XChaCha20Poly1305 => crypto::xchacha20poly1305_open(key, nonce, aad, body),
    }
}

fn seal_block(
    cipher: Cipher,
    key: &[u8; 32],
    nonce: &[u8],
    aad: &[u8],
    plaintext: &[u8],
) -> Result<Vec<u8>> {
    match cipher {
        Cipher::AesGcm => crypto::aes_gcm_seal(key, nonce, aad, plaintext),
        Cipher::XChaCha20Poly1305 => crypto::xchacha20poly1305_seal(key, nonce, aad, plaintext),
    }
}

/// Decrypt a whole file, returning its plaintext bytes.
pub fn decrypt_file(cipher: Cipher, key: &[u8; 32], bytes: &[u8]) -> Result<Vec<u8>> {
    let header = Header::parse(bytes)?;
    let nonce_len = cipher.nonce_len();

    let mut plaintext = Vec::with_capacity(bytes.len());
    let mut offset = HEADER_LEN;
    let mut block_no: u64 = 0;

    while offset < bytes.len() {
        let remaining = bytes.len() - offset;
        if remaining < nonce_len + TAG_LEN {
            return Err(Error::Damaged(format!(
                "trailing {remaining} bytes cannot form a block"
            )));
        }
        let nonce = &bytes[offset..offset + nonce_len];
        let body_start = offset + nonce_len;
        let body_len = (remaining - nonce_len).min(PLAIN_BLOCK_LEN + TAG_LEN);
        let body = &bytes[body_start..body_start + body_len];

        let block = open_block(
            cipher,
            key,
            nonce,
            &associated_data(block_no, &header.file_id),
            body,
        )?;
        plaintext.extend_from_slice(&block);

        offset = body_start + body_len;
        block_no += 1;
    }

    Ok(plaintext)
}

/// Encrypt a whole file, keeping the given file ID so the header stays stable.
pub fn encrypt_file(
    cipher: Cipher,
    key: &[u8; 32],
    file_id: [u8; FILE_ID_LEN],
    plaintext: &[u8],
) -> Result<Vec<u8>> {
    let header = Header {
        version: CONTENT_VERSION,
        file_id,
    };
    let nonce_len = cipher.nonce_len();

    let mut out = header.encode();
    out.reserve(plaintext.len() + nonce_len + TAG_LEN);

    for (block_no, chunk) in plaintext.chunks(PLAIN_BLOCK_LEN).enumerate() {
        let random = crate::keys::random_bytes::<24>()?;
        let nonce = &random[..nonce_len];
        out.extend_from_slice(nonce);
        let body = seal_block(
            cipher,
            key,
            nonce,
            &associated_data(block_no as u64, &file_id),
            chunk,
        )?;
        out.extend_from_slice(&body);
    }

    Ok(out)
}

/// Plaintext length of an encrypted file, without decrypting it.
pub fn plaintext_len(cipher: Cipher, ciphertext_len: u64) -> u64 {
    if ciphertext_len <= HEADER_LEN as u64 {
        return 0;
    }
    let nonce_len = cipher.nonce_len() as u64;
    let per_block = PLAIN_BLOCK_LEN as u64 + nonce_len + TAG_LEN as u64;
    let overhead = nonce_len + TAG_LEN as u64;

    let mut remaining = ciphertext_len - HEADER_LEN as u64;
    let mut total = 0u64;
    while remaining > 0 {
        if remaining < overhead {
            break;
        }
        let take = remaining.min(per_block);
        total += take - overhead;
        remaining -= take;
    }
    total
}
