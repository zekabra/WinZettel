# Working on WinZettel

How a change travels from "I want X" to a tested executable, and how the fork stays
rebasable onto MarkFlowy. Written for whoever picks this up next — human or agent.

## Reporting (mandatory)

Every change ends with the commit hash and the binary sha256, in the reply itself. The owner
reverts by naming a commit, so the record has to exist before the next change starts.

Latest good reference points: `f6781c4b` (no pane jump, no scroll sync), `60df0847`
(preview text handling restored to it).

## The loop

1. **Change** the code in `apps/desktop`, `packages/*` or `apps/desktop/src-tauri`.
2. **Validate**: `bash repo-workflow/run-winzettel-checks.sh types|test|lint|all`
   (TypeScript, unit tests, ESLint on changed files only).
3. **Build the executable**: `bash repo-workflow/build-winzettel-msi.sh --no-bundle`
   → `target/release/winzettel.exe`.
4. **Test it by hand** — the automated suite does not cover the app shell, so open the
   build and exercise the feature.
5. **Commit** locally. **Publish** only when the human asks for it.

Never generate an `.msi` during ordinary iteration; `--no-bundle` is enough. The installer
is a release artefact and needs the updater key configuration to be turned off.

## Rules

| Rule | Reason |
|---|---|
| Local work first, push on request | The person who owns the fork decides when history becomes public |
| `tsc` + tests + lint are the validation | Builds are slow and prove nothing the tests do not |
| ESLint only on changed files, never `--fix` | Root `yarn lint` rewrites unrelated code |
| English identifiers, comments and UI source strings | The repo is English; translations live in `locales/` |
| Four locales: `en`, `es`, `fr-FR`, `pt-BR` | Key sets must match exactly or `yarn translate:check` fails |
| No new dependency for something the repo already has | Radix, Tailwind, CVA and Lucide are all present |
| Do not edit `dist/`, `lib/`, `esm/` | Generated output |

## Branches and synchronising with upstream

`main` mirrors `upstream/main` and carries nothing of ours. All work is one commit on
`feat/winzettel`, which is the GitHub default branch.

```bash
cd WinZettel
bash ../repo-workflow/fork-sync.sh status        # ahead/behind, what is pending
bash ../repo-workflow/fork-sync.sh sync          # fetch upstream + rebase, with a backup ref
#   conflicts: resolve, git add <files>, fork-sync.sh continue
#   give up:   fork-sync.sh abort
bash ../repo-workflow/fork-sync.sh publish --yes "sync $(date +%F)"
```

`publish` refuses to push without `--yes` (or `FORK_SYNC_ALLOW_PUSH=1`) and only prints
what it would send. Pushes use `--force-with-lease`, so a rebased branch is updated
without risking work that was not seen. Each `sync` leaves `backup/pre-sync-<timestamp>`.

Do not add branch protection rules to `feat/winzettel`: they block the force-push the
workflow depends on, and with a single maintainer the bypass list would defeat the point.

## Environment notes (Windows)

- **Node 24**, not 26. Node 26 shadows `localStorage` in happy-dom and breaks ~130 tests.
- `TMP`, `TEMP` and `TMPDIR` must point inside `default-workspace\.tmp`; otherwise
  turbo/vitest fail with `EPERM` while creating directories.
- `git config core.autocrlf false`, or CRLF checkouts break `gray-matter` parsing in the
  documentation tests.
- Rust toolchain and WiX are vendored by the build script; MSVC BuildTools and the Windows
  SDK must already exist.
- Rust unit tests cannot run here (`STATUS_ENTRYPOINT_NOT_FOUND` — the test binary needs
  the WebView2 runtime). Validate Rust by compiling: `cargo test --lib --no-run`.
- The app writes to `%LOCALAPPDATA%\com.drl990114.markflowy`. A tool-spawned instance needs
  the junction that `run-winzettel-local.sh` sets up, and leaves orphan `msedgewebview2`
  processes behind — kill only the app's own tree.
- `tauri-plugin-http` is configured **without** the `cookies` feature on purpose: the cookie
  jar opened under `%LOCALAPPDATA%` at startup and a failure there killed the app.

## Adding a setting

1. Declare the field on `AppConf` in `apps/desktop/src-tauri/src/app/conf.rs` — in the
   struct, in `new()`, **and in `merge_conf`**. Missing from `merge_conf` means the value
   is written and then silently discarded on the next read.
2. Add the item to `apps/desktop/src/router/Setting/settingMap.ts`.
3. If it needs custom UI, add a new item type under `SettingItems/` and a guard in
   `SettingItems/types.ts`.
4. Add the key to all four locale files.

## Known gaps

- **i18n loader coverage**: the tests for lazy locale loading were written against the
  removed locales and were deleted with them. They should be rewritten for the four that
  remain.
- **E2E**: `apps/desktop/e2e` was a macOS-only WYSIWYG suite. It was retargeted at the
  source editor but has not been run since the Capricorn removal. Decide whether to
  rewrite it or delete it.
- **SFTP/WebDAV/encryption formats beyond Zettel Notes' end-to-end mode** (repository
  password mode, OpenPGP, gocryptfs) are not implemented. The Android app's "password"
  mode keeps its key on the device, so those notes cannot be opened on the desktop by
  design.
