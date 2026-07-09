# Budget Tool — Mobile (Android)

> How the app ships as an installable Android app. Living description — **update it when you
> change the shell, the toolchain, or the release flow.** The data-layer detail lives in
> [DESKTOP.md](DESKTOP.md) (the Rust layer is shared, documented once); the seam overview and
> invariants are in [ARCHITECTURE.md](ARCHITECTURE.md).

## The shape

Android is the **same Tauri v2 shell as the desktop app** (`apps/desktop/`), built for a third
target — not a new app. The WebView runs `apps/web` verbatim; `window.isTauri` is true, so the
app rides the **same** `data/queries.ts` → `invoke()` → `db.rs` SQL path as desktop. Adding a
data operation is still exactly **two** implementations (HTTP + SQL) — the SQL side serves both
Tauri targets; there is no third transport. The DB lives in the app's per-user config dir on the
device and **persists across app updates** (same-signature installs).

The UI is the shared responsive build: under Tailwind's `sm` breakpoint the top tabs become a
fixed bottom tab bar, charts switch to a compact 390-wide viewBox (<480px container), and the
Overview control bar (view toggle / View filter / Categories) is `sticky` to the top so it stays
reachable without scrolling up — all in `apps/web`, so desktop and web pick the same code up
automatically at their widths.

**Touch chart tooltips** are moving from the follow-cursor box (which covered the chart under
the finger) to a persistent **inspect strip** above the chart (`ChartInspectStrip` in the chart
kit): idle it shows the headline, and a press-&-scrub updates it live to the point under the
finger, lifting to dismiss. It renders only for a coarse pointer; the mouse keeps the in-chart
hover boxes untouched. Adopted on the Running-total chart first; the other charts still use the
tap-to-reveal box until the pattern is rolled out to them.

Behaviours that differ by **input device** (rather than width) branch on the pointer, not on
`window.isTauri` — per-event via `e.pointerType`, or mount-time via the `coarsePointer()` helper
(`apps/web/src/lib/pointer.ts`, a `(pointer: coarse)` query). This keeps a narrow desktop window
on the mouse path and lets DevTools device mode exercise the touch path. Examples: a coarse pointer
suppresses the Add tab's amount-field autofocus so opening Add doesn't summon the phone keyboard;
a horizontal **swipe** moves between the Overview (Month/Trends/Items) and Add (Single/List/Monthly)
sub-tabs (`lib/useSwipeNav.ts`, touch-only, and it stands aside when a horizontally scrollable
element — the matrix, the tables — should take the swipe instead).

## Android-specific pieces (the short list)

- **`gen/android/`** (committed, per Tauri convention) — the Gradle project `tauri android init`
  generated. Its own `.gitignore` keeps build outputs, `local.properties` and keystores out.
- **`MainActivity.kt`** — pads the content view by the system-bar insets (targetSdk 36 enforces
  edge-to-edge and the WebView reports no safe-area insets to CSS) and paints the bar strips the
  paper colour. If `--color-paper` in `apps/web/src/index.css` ever changes, change it here too.
- **`build.gradle.kts`** — a release `signingConfig` guarded by `keystore.properties.exists()`,
  so a checkout without the keystore still builds (unsigned).
- **File dialogs return `content://` URIs on Android** — that's why `import_database` /
  `export_database` / `save_text_file` in `db.rs` take `tauri_plugin_fs::FilePath` and do their
  user-side IO through the fs plugin (plain paths on desktop, byte-identical behaviour). The
  system picker filters by MIME, not extension, so a `.db` filter is advisory there.
  `window.alert` / `window.confirm` render natively in the Android WebView — no shims needed.

## Toolchain (this machine)

Installed under **`/opt/android-sdk`** (the `/home` disk is small); env lives in `~/.zshenv`:
`JAVA_HOME` (OpenJDK 21), `ANDROID_HOME`, `NDK_HOME` (r28.2), `GRADLE_USER_HOME` and
`ANDROID_AVD_HOME` (both relocated under `/opt/android-sdk`), plus PATH entries for
`platform-tools` / `cmdline-tools` / `emulator`. Rust targets: `aarch64-linux-android` (phones),
`x86_64-linux-android` (emulator) — plus armv7/i686 which `tauri android init` auto-installed.
rusqlite's `bundled` SQLite cross-compiles under the NDK with no special flags.

## Dev & test loop

- `npm run tauri:android:dev` — dev build against the Vite server (the CLI `adb reverse`s
  port 5001; `TAURI_DEV_HOST` in `apps/web/vite.config.ts` covers devices that need the public
  address; plain web dev is untouched when it's unset).
- **Emulator**: AVD `budget` (Pixel 7, API 36, x86_64) at `/opt/android-sdk/avd`. Headless loop:
  `sg kvm -c "emulator -avd budget -no-window -no-audio -no-boot-anim -gpu swiftshader_indirect"`,
  wait for `sys.boot_completed`, then `adb exec-out screencap -p` to look and
  `adb shell input tap/swipe/text` to drive. Debug builds install as
  `com.budgettool.desktop.debug` alongside the release app.
- Most mobile-layout work doesn't need the emulator at all — a ~360px browser viewport against
  `npm run dev` is the fast path; the emulator is for the Tauri-only seams (DB, dialogs, insets).

## Release (sideloading — no Play Store)

1. `npm run tauri:android:build` → a **signed universal APK** at
   `apps/desktop/src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk`
   (script pins `-t aarch64`; add `-t x86_64` to also cover the emulator).
2. Signing: keystore at `~/keys/budget-upload.jks`, credentials in the **gitignored**
   `gen/android/keystore.properties`. **Back both up off this machine** — Android app data
   survives updates only under the same signature; losing the keystore means uninstall/reinstall
   (= wiping the phone's data, recoverable only via a DB export).
3. Install: transfer the APK to the phone (or `adb install -r`) and open it — allow
   "install unknown apps" on first use. Updates install over the top; the DB persists.
4. Version bumps ride `tauri.conf.json`'s `version` (Tauri derives the Android versionCode).

**CI release builds**: pushing an `android-v*` tag (matching `tauri.conf.json`'s version), or a
manual dispatch, runs `.github/workflows/release-android.yml` — an ubuntu job that reconstructs
`keystore.properties` from three repository secrets (`ANDROID_KEYSTORE_BASE64` = base64 of the
.jks, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`), builds the signed APK, and attaches it as
`budget-tool-android-v<version>.apk` to a **draft** GitHub Release (publish manually — same flow
as the desktop `release.yml`). The workflow file is the source of truth for the details.

## Data across devices

There is **no sync**. Each install (desktop, phone) has its own `budget.db`; move data with
Manage → Database → Export/Import (the file round-trips desktop ↔ Android — verified both ways).
