# WinZettel — fork divergences

WinZettel is a fork of [MarkFlowy](https://github.com/drl990114/MarkFlowy), a Tauri +
React Markdown editor for Windows. The fork exists for one reason: making the app
partially compatible with notes written by [Zettel Notes](https://zettelnotes.eu) on
Android.

Everything below is deliberate. When a rebase onto `upstream/main` produces a conflict,
this file is the tie-breaker: if the conflict is about something listed as **removed**,
the answer is "keep it removed"; if it is about something listed as **added**, the
answer is "keep our version".

## Repository model

- `main` is a pure mirror of `upstream/main`. It carries no fork commits.
- All work lives in a single long-lived branch, `feat/winzettel`, which is the default
  branch on GitHub. It holds **one commit** on top of `main`.
- Synchronisation is a rebase, never a merge. See `WORKFLOW.md` for the commands.

## Added

**Attachments**
- Files are linked relative to the workspace root (`/.assets/file.pdf`) instead of
  absolute paths, so a workspace stays portable.
- Non-image files are inserted as Markdown links; images stay image nodes.
- Saved names follow the type: `image_<timestamp>.<ext>` for images, `file_<timestamp>.<ext>`
  for everything else.
- The file picker offers every file type, not just images.
- `Settings → File` chooses where attachments go. Only two destinations exist:
  relative to the current file, and relative to the workspace.
- `Settings → General → Workspace` shows the open notes folder and switches it.

**Note encryption (`Settings → Encryption`, file context menu)**
- Byte-compatible with Zettel Notes 3.x "End-to-end encryption". This is the most
  fragile contract in the fork; do not change the format without re-proving it against a
  note produced by the Android app (there is a test with such a note embedded).
- Format: `<U+E000><U+E001>ENC<U+E003><U+E004>` + base64( salt128 ||
  `b64(iv):b64(mac):b64(ciphertext)` ).
- Key material is the lowercase SHA-256 hex of the passphrase, fed to PBKDF2-HMAC-SHA1
  with 10 000 iterations and a 384-bit output over the 128-byte salt. Bytes 0–16 are the
  AES-128 key, 16–48 the HMAC-SHA256 key. The cipher is AES-128-CBC/PKCS#5 and the MAC
  covers `iv || ciphertext`.
- Encrypting is automatic with the stored passphrase. Decrypting asks for it every time.
- The passphrase must be declared on the Rust `AppConf` **and** in `merge_conf`, or the
  value is saved and then silently dropped on the next read.

**Second encryption mode: "Password" - deliberately not implemented**
- The Android app's "Password" mode uses the same core (key material, KDF, AES-128-CBC,
  HMAC) with a different envelope: a `.md.aes` file holding `b64(iv):b64(mac):b64(ct)`, no
  magic prefix and no embedded salt; the salt is read from the app's settings as base64.
- The envelope itself is readable: a note from the phone opened with salt
  `M@ria1000M@sgbfzl1950`, passphrase `teste1000` and plaintext `isto é um teste`.
- Why it stays unimplemented: Android decodes that salt the way `Base64.decode` does, so
  invalid characters are **dropped** instead of rejected - the `@` disappears, and the same
  typed salt yields different key bytes depending on which characters it contains. Nobody
  can know which salt the phone really used without auditing it, so the mode is not
  reliably reproducible from the desktop. Owner decision (2026-11-19): do not implement.
- Consequence: only the end-to-end mode is offered here; `.md.aes` files are left untouched.

- Scroll sync between two panes showing the same note, by relative position. Propagation
  requires recent user intent on the scrolling pane: a re-render that resets the preview
  scroll must not drag the pane being edited back to the top.
- One find bar above the toolbar for both panes. The source pane searches the CodeMirror
  document; the reading pane searches the rendered text through the CSS Custom Highlight
  API, with the replace row hidden. Dismissing the bar (X, Escape, shortcut) drops the term
  so a reopen starts clean; transferring the bar between panes keeps it.
- The editor owns its context menu (cut, copy, paste, select all) because the WebView's
  editing commands never reach CodeMirror.
- The right dock (table of contents) starts collapsed, in both dock profiles.
- The reading pane follows the caret: the block under the caret (its text, normalised) is
  looked up in the rendered note and brought to the top after each re-render of that pane.
  The anchor is read from the source on every attempt, so a correction that lands early is
  repeated by the next one. It only acts while the editor has focus, which is why scrolling
  the reading pane is never undone. Do not replace this with scroll ratios (rendered height
  does not follow line counts once images load), with timers (they lose the race against
  image loading) or with a stored element reference (the pane replaces its subtree).
- The active search match is red. In the source pane the caret is placed at the start of
  the match instead of selecting it, because CodeMirror paints the selection over marks.

**Encrypted repositories (gocryptfs)**
- A note folder can be an encrypted gocryptfs v2 volume, compatible with Zettel Notes on
  Android (created there, opened here, and the reverse). Everything lives in
  `crates/gocryptfs` (`mf_gocryptfs`); the app side is `apps/desktop/src-tauri/src/repo.rs`.
- Documented formats: master key from scrypt → HKDF, `AES-256-GCM` for the encrypted key,
  `XChaCha20-Poly1305` or `AES-GCM` for content, EME with per-directory `gocryptfs.diriv`
  for names (PKCS#7 padding, as the Android volumes do), `PlaintextNames` supported.
- Every write goes through the volume: notes, folders, and attachments
  (`copy_file`, `copy_file_by_from`, `write_u8_array_to_file`, `move_files_to_target_folder`).
  A plaintext write inside a repository is refused, because it makes the volume unopenable.
- The password is asked when a repository is opened and kept in memory only; closing the
  folder or the app locks it. The wizard lives in `Settings → Encryption`.
- Images inside a repository are read through the volume and shown as `data:` URLs, since
  the file on disk is ciphertext.
- Workspace switches start without tabs; reopening the same plain folder still restores them.

**Settings**
- `Updates` is manual only: nothing checks at launch, one button checks on demand.
- `About` describes the fork and links upstream.
- Close-all-tabs button next to new-tab and split.

**Identity**
- Product name, window/app copy and the release binary are `WinZettel`
  (`Cargo.toml` declares `[[bin]] name = "winzettel"`).
- Version is `1.0.3`.
- Bundle identifier is `pt.zekabra.winzettel`; configuration lives in the platform's
  standard places (`%APPDATA%`/`%LOCALAPPDATA%` on Windows), never next to the executable,
  so an installer can ship later.
- The app's own data root is `~/.winzettel` (settings, workspace cache). It does not migrate
  from the pre-fork `.markflowy` folder: move the files by hand if you want them.
- The updater points at this fork's releases, not upstream's.

## Removed

- **Capricorn / WYSIWYG editor.** The `@drl990114/capricorn-runtime` package is private and
  unavailable, so the mode could never run. Removed: the runtime adapter/loader/DOM layer,
  the editor component, block insert, clipboard, registry, export surface, heading
  viewport, keybindings, markdown selection, resume, statistics scheduler, the inline
  insert popover, the WYSIWYG toolbar, the Capricorn find/replace branch, the snippet
  library that only fed its insert menu, and the 18-file integration harness behind it.
  The editor offers **source and preview** only. `packages/editor` (rme) keeps its own
  internal WYSIWYG editor — it is library API, not mounted by Desktop.
- **Locales `ja`, `ru`, `vi`, `zh-CN`.** English, Spanish, French and Portuguese remain.
  Key sets must stay identical across the four; `yarn translate:check` enforces it.
- **Text conversion** (Simplified ↔ Traditional). Menu entries, `convert_text` command,
  the `zhconv` helper and dependency.
- **Smooth cursor** and **text direction** — both were WYSIWYG-only settings, and neither
  had an effect once the runtime was gone. Direction is left to right.
- **"Paste as plain text"** in the editor menu: it read the same clipboard text as Paste.
- **Automatic update checks** — interval scheduler, settings and its module.
- **"Share error reports"** — setting, consent plumbing and the startup sync.
- **Old About dialog** — component, title-bar menu item, `app_about` event.
- **Support settings section.**
- **Synchronisation (Dropbox/WebDAV/SFTP)** — added and later removed; the settings page,
  service, connection probes, `probe_ssh_banner` command and every `sync_*` config field
  are gone. If a rebase resurrects any of it, delete it.
- **Attachment destinations** that were not wanted: absolute paths and Base64 embedding.

## Where rebase conflicts are most likely

| File | Why |
|---|---|
| `locales/{es,fr-FR,pt-BR}.json` | upstream adds keys constantly; we also delete whole sections |
| `apps/desktop/src-tauri/Cargo.toml` | we changed the binary name and dropped dependencies |
| `apps/desktop/src-tauri/tauri.conf.json` | product name, version, updater endpoint |
| `apps/desktop/src/router/Setting/settingMap.ts` | categories added and removed |
| `EditorArea/TextEditor.tsx`, `Editor.tsx` | the Capricorn plumbing lived here |
| `packages/i18n/src/{index,desktop,types}.ts` | the locale registry |

Keep forks of upstream files as small as possible: additive code in new files survives
rebases almost for free, while reformatting or reordering an upstream file guarantees a
conflict.

## After every sync

```bash
cd repo-workflow && ./run-winzettel-checks.sh all   # tsc + tests + lint
```

Then confirm by hand that the fork's own surface still behaves: encrypt and decrypt a
note, insert a PDF from the editor, switch source/preview, and open Settings → Encryption.
