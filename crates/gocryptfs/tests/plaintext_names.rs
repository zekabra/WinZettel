//! Plaintext-names volumes: the `PlaintextNames` mode the Android app offers when the owner
//! keeps file names readable. Verified against a real repository created by the Android app
//! (password `Teste1@00`), because creating one is not the same as being able to read it.

use std::fs;
use std::path::{Path, PathBuf};

use mf_gocryptfs::{Cipher, CreateOptions, Volume};

fn fixture() -> PathBuf {
    match std::env::var_os("PLAINTEXT_FIXTURE") {
        Some(path) => PathBuf::from(path),
        None => PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/volume-plaintext"),
    }
}

fn copy_dir(from: &Path, to: &Path) {
    fs::create_dir_all(to).expect("create destination");
    for entry in fs::read_dir(from).expect("read source") {
        let entry = entry.expect("entry");
        let target = to.join(entry.file_name());
        if entry.path().is_dir() {
            copy_dir(&entry.path(), &target);
        } else {
            fs::copy(entry.path(), &target).expect("copy file");
        }
    }
}

#[test]
fn opens_a_repository_with_plaintext_names() {
    let source = fixture();
    if !source.exists() {
        eprintln!("fixture {} is missing, skipping", source.display());
        return;
    }

    let temporary = tempfile::tempdir().expect("temp dir");
    let root = temporary.path().join("repo");
    copy_dir(&source, &root);

    let volume = Volume::open(&root, b"Teste1@00").expect("open a plaintext-names volume");
    assert!(volume.plaintext_names(), "the volume must report plaintext names");

    let names: Vec<String> = volume
        .list("")
        .expect("list root")
        .into_iter()
        .map(|entry| entry.name)
        .collect();
    assert!(names.contains(&"teste.md".to_string()), "root listing: {names:?}");
    assert!(names.contains(&"teste2".to_string()), "root listing: {names:?}");

    let note = volume.read("teste.md").expect("read a note");
    assert!(!note.is_empty(), "the note should decrypt to something");

    let nested: Vec<String> = volume
        .list("teste2")
        .expect("list nested folder")
        .into_iter()
        .map(|entry| entry.name)
        .collect();
    assert!(nested.contains(&"teste.md".to_string()), "nested listing: {nested:?}");
}

#[test]
fn creates_a_repository_with_plaintext_names() {
    let temporary = tempfile::tempdir().expect("temp dir");
    let root = temporary.path().join("fresh");
    fs::create_dir_all(&root).expect("create root");

    let options = CreateOptions {
        plaintext_names: true,
        cipher: Cipher::XChaCha20Poly1305,
        log_n: 14,
        creator: "WinZettel".to_string(),
    };
    let volume = Volume::create(&root, b"Teste1@00", &options).expect("create");
    assert!(volume.plaintext_names());

    volume.create_dir("notas").expect("create folder");
    volume.write("notas/lembrete.md", b"# Ola").expect("write a note");

    // On disk the names are readable and no directory IV was written.
    assert!(root.join("notas").is_dir(), "folder name is not plaintext on disk");
    assert!(root.join("notas/lembrete.md").is_file(), "file name is not plaintext on disk");
    assert!(!root.join("gocryptfs.diriv").exists(), "a plaintext-names volume has no diriv");

    let conf = fs::read_to_string(root.join("gocryptfs.conf")).expect("read conf");
    assert!(conf.contains("PlaintextNames"), "conf flags: {conf}");

    // The content is still encrypted, and the note round-trips.
    let raw = fs::read(root.join("notas/lembrete.md")).expect("read ciphertext");
    assert_ne!(raw, b"# Ola".to_vec(), "content must not be stored in the clear");
    assert_eq!(volume.read("notas/lembrete.md").expect("read"), b"# Ola".to_vec());
}
