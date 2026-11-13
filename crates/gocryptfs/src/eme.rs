//! EME (ECB-Mix-ECB) filename encryption, as implemented by `github.com/rfjakob/eme`.
//!
//! The construction encrypts a whole name (one to sixteen 16-byte blocks) with AES-256 in ECB
//! mode, using the per-directory `gocryptfs.diriv` as tweak. Names are padded with NUL bytes
//! and the padding is dropped on decrypt, so a name may never contain a NUL.

use base64::Engine;

use crate::crypto::EcbCipher;
use crate::error::{Error, Result};

const BLOCK: usize = 16;
const MAX_BLOCKS: usize = 16 * 8;

/// GF(2^128) doubling exactly as the EME draft's `multByTwo` does it.
fn mult_by_two(input: &[u8; BLOCK]) -> [u8; BLOCK] {
    let mut out = [0u8; BLOCK];
    let carry = input[BLOCK - 1] >> 7;
    out[0] = (input[0] << 1) ^ if carry == 1 { 135 } else { 0 };
    for index in 1..BLOCK {
        out[index] = (input[index] << 1) | (input[index - 1] >> 7);
    }
    out
}

fn xor(left: &[u8; BLOCK], right: &[u8; BLOCK]) -> [u8; BLOCK] {
    let mut out = [0u8; BLOCK];
    for index in 0..BLOCK {
        out[index] = left[index] ^ right[index];
    }
    out
}

fn block_at(data: &[u8], index: usize) -> [u8; BLOCK] {
    let mut out = [0u8; BLOCK];
    out.copy_from_slice(&data[index * BLOCK..(index + 1) * BLOCK]);
    out
}

fn transform(
    cipher: &EcbCipher,
    tweak: &[u8; BLOCK],
    data: &[u8],
    encrypt: bool,
) -> Result<Vec<u8>> {
    if data.is_empty() || data.len() % BLOCK != 0 {
        return Err(Error::Damaged(format!(
            "an encrypted name must be a non-zero multiple of {BLOCK} bytes, got {}",
            data.len()
        )));
    }
    let blocks = data.len() / BLOCK;
    if blocks > MAX_BLOCKS {
        return Err(Error::NameTooLong(format!("{blocks} blocks")));
    }

    let crypt = |block: &[u8; BLOCK]| -> Result<[u8; BLOCK]> {
        let raw = if encrypt {
            cipher.encrypt_blocks(block)?
        } else {
            cipher.decrypt_blocks(block)?
        };
        let mut out = [0u8; BLOCK];
        out.copy_from_slice(&raw);
        Ok(out)
    };

    // LTable[i] = 2^(i+1) * E(0)
    let mut l_table = Vec::with_capacity(blocks);
    let mut current = {
        let raw = cipher.encrypt_blocks(&[0u8; BLOCK])?;
        let mut block = [0u8; BLOCK];
        block.copy_from_slice(&raw);
        block
    };
    for _ in 0..blocks {
        current = mult_by_two(&current);
        l_table.push(current);
    }
    let mut buffer = data.to_vec();
    for index in 0..blocks {
        let pp = xor(&block_at(&buffer, index), &l_table[index]);
        buffer[index * BLOCK..(index + 1) * BLOCK].copy_from_slice(&crypt(&pp)?);
    }

    let mut mp = xor(&block_at(&buffer, 0), tweak);
    for index in 1..blocks {
        mp = xor(&mp, &block_at(&buffer, index));
    }
    let mc = crypt(&mp)?;
    let mut m = xor(&mp, &mc);

    for index in 1..blocks {
        m = mult_by_two(&m);
        let ccc = xor(&block_at(&buffer, index), &m);
        buffer[index * BLOCK..(index + 1) * BLOCK].copy_from_slice(&ccc);
    }
    let mut first = xor(&mc, tweak);
    for index in 1..blocks {
        first = xor(&first, &block_at(&buffer, index));
    }
    buffer[..BLOCK].copy_from_slice(&first);

    for index in 0..blocks {
        let transformed = crypt(&block_at(&buffer, index))?;
        let out = xor(&transformed, &l_table[index]);
        buffer[index * BLOCK..(index + 1) * BLOCK].copy_from_slice(&out);
    }

    Ok(buffer)
}

/// Decrypt one stored name into its plaintext form.
pub fn decrypt_name(cipher: &EcbCipher, tweak: &[u8; BLOCK], encoded: &str) -> Result<String> {
    let raw = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(encoded)
        .map_err(|error| Error::Damaged(format!("name is not base64url: {error}")))?;
    let plain = transform(cipher, tweak, &raw, false)?;
    let name = strip_padding(&plain);
    String::from_utf8(name)
        .map_err(|error| Error::Damaged(format!("name is not UTF-8: {error}")))
}

/// Encrypt a plaintext name into the base64url form stored on disk.
pub fn encrypt_name(cipher: &EcbCipher, tweak: &[u8; BLOCK], name: &str) -> Result<String> {
    if name.as_bytes().contains(&0) {
        return Err(Error::Damaged("a name cannot contain a NUL byte".into()));
    }
    let padded = pad_pkcs7(name.as_bytes());
    let ciphertext = transform(cipher, tweak, &padded, true)?;
    Ok(base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(ciphertext))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cipher() -> EcbCipher {
        EcbCipher::new(&[7u8; 32]).expect("AES-256 is available")
    }

    #[test]
    fn a_name_survives_a_round_trip() {
        let cipher = cipher();
        let tweak = [3u8; BLOCK];
        let encoded = encrypt_name(&cipher, &tweak, "teste").unwrap();
        assert_eq!(decrypt_name(&cipher, &tweak, &encoded).unwrap(), "teste");
    }

    #[test]
    fn a_name_that_fills_three_blocks_survives() {
        let cipher = cipher();
        let tweak = [9u8; BLOCK];
        let name = "a".repeat(40);
        let encoded = encrypt_name(&cipher, &tweak, &name).unwrap();
        assert_eq!(decrypt_name(&cipher, &tweak, &encoded).unwrap(), name);
    }

    #[test]
    fn a_wrong_tweak_does_not_silently_return_the_same_name() {
        let cipher = cipher();
        let encoded = encrypt_name(&cipher, &[1u8; BLOCK], "teste").unwrap();
        // A different tweak must either fail or produce a different name, never the original.
        match decrypt_name(&cipher, &[2u8; BLOCK], &encoded) {
            Ok(name) => assert_ne!(name, "teste"),
            Err(_) => {}
        }
    }    #[test]
    fn decrypts_a_name_from_the_real_volume() {
        use crate::conf::ConfFile;
        use crate::keys;
        use base64::Engine;

        let root = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures/volume");
        let conf: ConfFile =
            serde_json::from_slice(&std::fs::read(root.join("gocryptfs.conf")).unwrap()).unwrap();
        let salt = base64::engine::general_purpose::STANDARD
            .decode(&conf.scrypt.salt)
            .unwrap();
        let hash = keys::derive_scrypt(b"teste1000", &salt, 16, conf.scrypt.r, conf.scrypt.p, 32)
            .unwrap();
        let master = keys::unwrap_master_key(&hash, &conf.encrypted_key_bytes().unwrap()).unwrap();
        let name_key = keys::name_key(&master);
        let cipher = EcbCipher::new(&name_key).unwrap();
        let mut tweak = [0u8; BLOCK];
        tweak.copy_from_slice(&std::fs::read(root.join("gocryptfs.diriv")).unwrap());
        let raw = base64::engine::general_purpose::URL_SAFE_NO_PAD
            .decode("95BpcDnOh4Rf3_KbBxNdVQ")
            .unwrap();
        let zero = [0u8; BLOCK];
        let e0 = cipher.encrypt_blocks(&zero).unwrap();
        println!("E0 {}", e0.iter().map(|byte| format!("{byte:02x}")).collect::<String>());
        println!("l0 {}", mult_by_two(&{let mut a=[0u8;BLOCK]; a.copy_from_slice(&e0); a}).iter().map(|byte| format!("{byte:02x}")).collect::<String>());
        let pp0 = {
            let mut a = [0u8; BLOCK];
            a.copy_from_slice(&raw[..BLOCK]);
            let l0 = mult_by_two(&{let mut z=[0u8;BLOCK]; z.copy_from_slice(&e0); z});
            xor(&a, &l0)
        };
        println!("pp0 {}", pp0.iter().map(|byte| format!("{byte:02x}")).collect::<String>());
        let d0 = cipher.decrypt_blocks(&pp0).unwrap();
        println!("d(pp0) {}", d0.iter().map(|byte| format!("{byte:02x}")).collect::<String>());
        let out = transform(&cipher, &tweak, &raw, false).unwrap();
        println!(
            "raw decrypted: {}",
            out.iter().map(|byte| format!("{byte:02x}")).collect::<String>()
        );
        let plain = decrypt_name(&cipher, &tweak, "95BpcDnOh4Rf3_KbBxNdVQ").unwrap();
        assert_eq!(plain, "teste");
    }
}
/// Zettel Notes pads encrypted names with PKCS#7, not with NUL bytes as gocryptfs does.
fn pad_pkcs7(name: &[u8]) -> Vec<u8> {
    let padding = BLOCK - (name.len() % BLOCK);
    let mut out = Vec::with_capacity(name.len() + padding);
    out.extend_from_slice(name);
    out.extend(std::iter::repeat(padding as u8).take(padding));
    out
}

/// Strip PKCS#7 padding, falling back to the NUL padding gocryptfs itself writes.
fn strip_padding(data: &[u8]) -> Vec<u8> {
    if let Some(last) = data.last() {
        let padding = *last as usize;
        if padding >= 1 && padding <= BLOCK && data.len() >= padding {
            let tail = &data[data.len() - padding..];
            if tail.iter().all(|byte| *byte == *last) {
                return data[..data.len() - padding].to_vec();
            }
        }
    }
    let end = data.iter().position(|byte| *byte == 0).unwrap_or(data.len());
    data[..end].to_vec()
}

