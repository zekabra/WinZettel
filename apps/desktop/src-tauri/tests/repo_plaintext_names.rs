//! Creating a repository through the same function the command uses, to see what actually lands
//! on disk. The crate tests already prove the format; this proves the app layer passes the
//! "keep file names readable" choice through.

use std::fs;

#[test]
fn repository_created_with_plaintext_names_has_readable_names() {
    let temporary = tempfile::tempdir().expect("temp dir");
    let root = temporary.path().join("plain");
    fs::create_dir_all(&root).expect("create root");

    let status = markflowy::repo::create(&root.to_string_lossy(), "Teste1@00", true, "auto", 14)
        .expect("create a plaintext-names repository");
    assert!(status.is_repo && status.is_unlocked);

    let conf = fs::read_to_string(root.join("gocryptfs.conf")).expect("read conf");
    assert!(conf.contains("PlaintextNames"), "conf flags: {conf}");
    assert!(!root.join("gocryptfs.diriv").exists(), "no diriv in a plaintext-names volume");

    markflowy::repo::create_dir("notas").expect("create a folder");
    markflowy::repo::write("notas/lembrete.md", b"# Ola").expect("write a note");
    assert!(root.join("notas").is_dir(), "the folder name is not readable on disk");
    assert!(
        root.join("notas/lembrete.md").is_file(),
        "the note name is not readable on disk"
    );

    markflowy::repo::lock_volume();
}

#[test]
fn repository_created_with_encrypted_names_stays_encrypted() {
    let temporary = tempfile::tempdir().expect("temp dir");
    let root = temporary.path().join("sealed");
    fs::create_dir_all(&root).expect("create root");

    markflowy::repo::create(&root.to_string_lossy(), "Teste1@00", false, "auto", 14)
        .expect("create an encrypted-name repository");

    let conf = fs::read_to_string(root.join("gocryptfs.conf")).expect("read conf");
    assert!(conf.contains("EMENames"), "conf flags: {conf}");
    assert!(root.join("gocryptfs.diriv").is_file(), "an encrypted-name volume needs a diriv");

    markflowy::repo::lock_volume();
}
