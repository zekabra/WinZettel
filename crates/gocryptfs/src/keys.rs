use zeroize::Zeroizing;

use crate::crypto;
use crate::error::{Error, Result};

pub const MASTER_KEY_LEN: usize = 32;
pub const GCM_NONCE_LEN: usize = 16;
pub const GCM_TAG_LEN: usize = 16;

/// HKDF-SHA256 with an empty salt, exactly like `cryptocore.hkdfDerive`.
pub fn hkdf_32(ikm: &[u8], info: &[u8]) -> Zeroizing<[u8; 32]> {
    Zeroizing::new(crypto::hkdf_sha256_32(ikm, info))
}

/// `scrypt(password, salt, N = 2^log_n, r, p, key_len)`, the gocryptfs password hash.
pub fn derive_scrypt(
    password: &[u8],
    salt: &[u8],
    log_n: u8,
    r: u32,
    p: u32,
    key_len: usize,
) -> Result<Zeroizing<Vec<u8>>> {
    Ok(Zeroizing::new(crypto::scrypt(
        password, salt, log_n, r, p, key_len,
    )?))
}

/// Unwrap the master key stored in `gocryptfs.conf`.
///
/// Layout verified against Zettel Notes: `nonce(16) || ciphertext(32) || tag(16)`, with the
/// block number 0 encoded as eight zero bytes in the associated data.
pub fn unwrap_master_key(scrypt_hash: &[u8], encrypted_key: &[u8]) -> Result<Zeroizing<[u8; 32]>> {
    if encrypted_key.len() != GCM_NONCE_LEN + MASTER_KEY_LEN + GCM_TAG_LEN {
        return Err(Error::Damaged(format!(
            "EncryptedKey has {} bytes, expected {}",
            encrypted_key.len(),
            GCM_NONCE_LEN + MASTER_KEY_LEN + GCM_TAG_LEN
        )));
    }
    let kek = hkdf_32(scrypt_hash, b"AES-GCM file content encryption");
    let nonce = &encrypted_key[..GCM_NONCE_LEN];
    let body = &encrypted_key[GCM_NONCE_LEN..];

    let plaintext = crypto::aes_gcm_open(&kek, nonce, &[0u8; 8], body)
        .map_err(|_| Error::BadPassword)?;
    if plaintext.len() != MASTER_KEY_LEN {
        return Err(Error::Damaged(format!(
            "master key has {} bytes, expected {MASTER_KEY_LEN}",
            plaintext.len()
        )));
    }
    let mut key = Zeroizing::new([0u8; MASTER_KEY_LEN]);
    key.copy_from_slice(&plaintext);
    Ok(key)
}

/// Wrap a master key for `gocryptfs.conf`, producing `nonce || ciphertext || tag`.
pub fn wrap_master_key(scrypt_hash: &[u8], master_key: &[u8; MASTER_KEY_LEN]) -> Result<Vec<u8>> {
    let kek = hkdf_32(scrypt_hash, b"AES-GCM file content encryption");
    let nonce = random_bytes::<GCM_NONCE_LEN>()?;
    let sealed = crypto::aes_gcm_seal(&kek, &nonce, &[0u8; 8], master_key)?;

    let mut out = Vec::with_capacity(GCM_NONCE_LEN + sealed.len());
    out.extend_from_slice(&nonce);
    out.extend_from_slice(&sealed);
    Ok(out)
}

/// Key used to encrypt file names (EME), derived from the master key.
pub fn name_key(master_key: &[u8; MASTER_KEY_LEN]) -> Zeroizing<[u8; 32]> {
    hkdf_32(master_key, b"EME filename encryption")
}

/// Key used for file contents, depending on the volume's cipher.
pub fn content_key(master_key: &[u8; MASTER_KEY_LEN], info: &[u8]) -> Zeroizing<[u8; 32]> {
    hkdf_32(master_key, info)
}

pub fn random_master_key() -> Result<Zeroizing<[u8; MASTER_KEY_LEN]>> {
    Ok(Zeroizing::new(random_bytes::<MASTER_KEY_LEN>()?))
}

pub fn random_bytes<const N: usize>() -> Result<[u8; N]> {
    let mut out = [0u8; N];
    crypto::fill_random(&mut out)?;
    Ok(out)
}

/// SHA-256, used for the long-name hash.
pub fn sha256(data: &[u8]) -> [u8; 32] {
    crypto::sha256(data)
}

