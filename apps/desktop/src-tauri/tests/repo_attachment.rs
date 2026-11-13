//! The attachment paths that broke real repositories: anything written into a folder inside an
//! encrypted repository must land in the volume, never as plaintext next to the ciphertext.
//!
//! The repository state is process-global, so both scenarios share one test.

use std::fs;
use std::path::Path;

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

fn fixture() -> std::path::PathBuf {
    std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../crates/gocryptfs/tests/fixtures/volume")
}

#[test]
fn attachments_inside_a_repository_are_encrypted() {
    let temporary = tempfile::tempdir().expect("temp dir");
    let root = temporary.path().join("repo");
    copy_dir(&fixture(), &root);

    let status = markflowy::repo::unlock(&root.to_string_lossy(), "teste1000").expect("unlock");
    assert!(status.is_unlocked);

    // 1. Bytes that come from a paste or a screenshot.
    let pasted = root.join("assets").join("image_1.png");
    let result =
        markflowy::fc::cmd::write_u8_array_to_file(&pasted.to_string_lossy(), vec![1, 2, 3, 4]);
    assert_eq!(result.code, markflowy::fc::FileResultCode::Success);
    assert_eq!(
        markflowy::repo::read("assets/image_1.png").expect("read through the volume"),
        vec![1, 2, 3, 4]
    );

    // 2. A file picked from disk, which goes through `copy_file`.
    let outside = temporary.path().join("photo.png");
    fs::write(&outside, [9u8, 8, 7, 6]).expect("write source");
    let copied = root.join("assets").join("image_2.png");
    let result =
        markflowy::fc::cmd::copy_file(&outside.to_string_lossy(), &copied.to_string_lossy());
    assert_eq!(
        result.code,
        markflowy::fc::FileResultCode::Success,
        "copy failed: {}",
        result.content
    );
    assert_eq!(
        markflowy::repo::read("assets/image_2.png").expect("read through the volume"),
        vec![9, 8, 7, 6]
    );

    // The plaintext folder must not exist next to the ciphertext.
    assert!(
        !root.join("assets").exists(),
        "{} was created as plaintext inside the cipher directory",
        root.join("assets").display()
    );

    // The folder is visible in the decrypted tree.
    let listed: Vec<String> = markflowy::repo::list("")
        .expect("list root")
        .into_iter()
        .map(|entry| entry.name)
        .collect();
    assert!(listed.contains(&"assets".to_string()), "root listing: {listed:?}");

    markflowy::repo::lock_volume();
}
