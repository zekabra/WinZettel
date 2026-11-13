//! The acceptance test for the whole crate: open the volume that Zettel Notes created,
//! list it, and read the notes the Android app wrote.
//!
//! The fixture under `tests/fixtures/volume` is a real encrypted repository (password
//! `teste1000`) holding folders `teste`, `teste1`, `teste2` and notes `teste.md` with the
//! word `teste` inside.

use std::path::PathBuf;

use mf_gocryptfs::{Cipher, Error, Volume};

fn fixture() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/volume")
}

fn open_fixture() -> Volume {
    Volume::open(&fixture(), b"teste1000").expect("the fixture volume must unlock")
}

#[test]
fn opens_with_the_right_password_and_reports_its_cipher() {
    let volume = open_fixture();
    assert_eq!(volume.cipher(), Cipher::XChaCha20Poly1305);
    assert!(!volume.plaintext_names());
    assert_eq!(volume.creator(), "ZettelNotes");
}

#[test]
fn a_wrong_password_is_reported_as_such() {
    let error = Volume::open(&fixture(), b"errada").expect_err("must not unlock");
    assert!(matches!(error, Error::BadPassword), "got {error:?}");
}

#[test]
fn the_root_listing_matches_what_the_android_app_wrote() {
    let volume = open_fixture();
    let names: Vec<String> = volume
        .list("")
        .expect("listing the root must work")
        .into_iter()
        .map(|entry| entry.name)
        .collect();

    assert_eq!(
        names,
        vec![
            ".zettel-notes".to_string(),
            "teste".into(),
            "teste.md".into(),
            "teste1".into(),
            "teste2".into(),
        ]
    );
}

#[test]
fn folder_contents_and_note_bodies_decrypt() {
    let volume = open_fixture();

    let nested: Vec<String> = volume
        .list("teste")
        .expect("listing teste must work")
        .into_iter()
        .map(|entry| entry.name)
        .collect();
    assert_eq!(nested, vec!["teste.md".to_string(), "teste1".into()]);

    assert_eq!(volume.read("teste.md").unwrap(), b"teste");
    assert_eq!(volume.read("teste/teste.md").unwrap(), b"teste");

    // Every empty folder still lists cleanly.
    assert!(volume.list("teste/teste1").unwrap().is_empty());
    assert!(volume.list("teste1").unwrap().is_empty());
    assert!(volume.list("teste2").unwrap().is_empty());
}

#[test]
fn the_android_app_state_folder_is_readable_and_can_be_hidden_by_the_caller() {
    let volume = open_fixture();
    let entries = volume.list(".zettel-notes").expect("listing must work");
    let names: Vec<&str> = entries.iter().map(|entry| entry.name.as_str()).collect();
    assert_eq!(names, vec!["config.toml", "patches"]);

    let config = entries
        .iter()
        .find(|entry| entry.name == "config.toml")
        .expect("config.toml must be listed");
    assert_eq!(config.size, 0);

    let patch = volume
        .read(".zettel-notes/patches/3/ca012a9a-eadd-4c5f-9117-208bf226978c.diff")
        .expect("a patch must decrypt");
    assert!(String::from_utf8_lossy(&patch).contains("teste"));
}

#[test]
fn plaintext_sizes_do_not_leak_the_ciphertext_overhead() {
    let volume = open_fixture();
    let entries = volume.list("").unwrap();
    let note = entries
        .iter()
        .find(|entry| entry.name == "teste.md")
        .expect("the note must be listed");
    // The note says "teste": five bytes, not the 63 bytes on disk.
    assert_eq!(note.size, 5);
}
