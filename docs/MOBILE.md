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
Overview control bar (view toggle / View filter / Categories) is `sticky` to the top and
auto-hides with scroll direction (revealed scrolling down away from the top, hidden scrolling up
toward it — `lib/useHideOnScrollUp.ts`; the Categories checklist opens attached to the bar, and
the bar stays put while it's open) — all in `apps/web`, so desktop and web pick the same code up
automatically at their widths.

**The touch-gesture layer.** Zoom is disabled app-wide (`apps/web/index.html`) because any page
zoom offsets the pointer→chart mapping the scrub depends on — rotate to landscape to see a chart
bigger. Every scrub surface carries `SCRUB_SURFACE` (`lib/useScrubGesture.ts`): `touch-pan-y`,
which leaves vertical page scroll to the browser but claims horizontal drags for the app, plus
`select-none` so a long press can't start text selection.

**Chart scrubbing** is press-and-hold, Trading-212 style (`useScrubGesture`): a quick tap does
nothing, a ~340ms hold *arms* the scrub, and only then does dragging move the crosshair. Arming is
what makes it safe to take the drag off the page — while armed the hook holds a pointer capture
(so moves survive the finger leaving the chart) and preventDefaults `touchmove` (so the page can't
scroll out from under it), and it stops move events propagating so the sub-tab swipe can't fire
mid-scrub. Position is read as a **fraction of the chart's width**, so the whole chart is one
continuous track rather than a row of hit targets. Releasing snaps back to the idle default.

**Touch chart tooltips** use a persistent **inspect strip** above the chart (`ChartInspectStrip`
in the chart kit) instead of the follow-cursor box that covered the chart under the finger. It
idles on the chart's **most recent point, breakdown included** — so arming the scrub changes its
numbers but never its height — and renders only for a coarse pointer; the mouse keeps the in-chart
hover boxes untouched. The strip is scoped to the charts where scrubbing adds something: **running
total**, **category-trend lines**, **spend-by-month bars** (which also keep every bar solid on
touch, dimming being a mouse-only emphasis, and grow a crosshair instead) and **item unit-price**.
The **grouping donut** and **vs-last-month** are tap-only — no strip, no touch tooltip — because
tapping a slice or row already drills to that same breakdown. A tap that follows a scrub is
suppressed for 300ms so the release can't also drill or navigate.

**Nothing in the strip may move while scrubbing** — dragging across a month should change the
glyphs and nothing else, or it can't be read at speed. That constrains the layout, and the rules
are worth keeping if you touch it: charts pass **every** series on every frame (a dash where
there's no spend) so the row set and the strip's height are constant; figures are `tabular-nums`
and right-aligned so £99 → £100 grows leftwards; the total and its delta are **stacked**, each
pinned to its own row's edges, because side by side the delta's width dictated where the total
could start; and the breakdown is a fixed 2-column grid rather than `flex-wrap`, so a longer name
can't reflow a row. The delta carries a label naming what it's measured against ("vs last month"),
since a bare signed figure under a total is ambiguous.

Behaviours that differ by **input device** (rather than width) branch on the pointer, not on
`window.isTauri` — per-event via `e.pointerType`, or mount-time via the `coarsePointer()` helper
(`apps/web/src/lib/pointer.ts`, a `(pointer: coarse)` query). This keeps a narrow desktop window
on the mouse path and lets DevTools device mode exercise the touch path. Examples: a coarse pointer
suppresses the Add tab's amount-field autofocus so opening Add doesn't summon the phone keyboard;
a horizontal **swipe** moves between the Overview (Month/Trends/Items) and Add (Single/List/Monthly)
sub-tabs (`lib/useSwipeNav.ts`, pointer events gated to touch, so it also works in DevTools device
mode). It fires on **pointermove**, the moment the drag is unambiguously horizontal, rather than
waiting for a pointerup that on a device often never arrives — a real swipe drifts vertically, the
browser starts scrolling, and a scrolling browser sends `pointercancel` instead. It stands aside
when the swipe began on a horizontally scrollable element (the matrix, the tables). Charts no
longer opt out via `data-noswipe`: with the scrub behind a press-and-hold, a quick flick across a
chart is unambiguously a swipe.

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

## Toolchain

What an Android build needs, wherever you're building it (install locations and shell-env plumbing
are per-machine — `tauri android build` only cares that these resolve):

- **`JAVA_HOME`** — a JDK 21.
- **`ANDROID_HOME`** — an Android SDK with `platform-tools`, `cmdline-tools` and (for the
  emulator) `emulator` on `PATH`.
- **`NDK_HOME`** — the NDK (r28.2 is what the committed Gradle project was generated against).
- **Rust targets** — `aarch64-linux-android` for phones, `x86_64-linux-android` for the emulator;
  `tauri android init` also installs armv7/i686.

rusqlite's `bundled` SQLite cross-compiles under the NDK with no special flags. If you relocate
`GRADLE_USER_HOME` / `ANDROID_AVD_HOME` (worth doing when the home disk is small), export those
too. A checkout with **no** Android toolchain still builds the web and desktop targets fine — the
Android scripts are the only thing that needs any of this.

## Dev & test loop

- `npm run tauri:android:dev` — dev build against the Vite server (the CLI `adb reverse`s
  port 5001; `TAURI_DEV_HOST` in `apps/web/vite.config.ts` covers devices that need the public
  address; plain web dev is untouched when it's unset).
- **Emulator**: any x86_64 AVD (a Pixel 7 / API 36 image is what this was developed against).
  Headless loop: `emulator -avd <name> -no-window -no-audio -no-boot-anim -gpu swiftshader_indirect`
  (wrap in `sg kvm -c "…"` on Linux hosts where KVM needs the group), wait for
  `sys.boot_completed`, then `adb exec-out screencap -p` to look and `adb shell input
  tap/swipe/text` to drive. Debug builds install as `com.budgettool.desktop.debug` alongside the
  release app.
- Most mobile work doesn't need the emulator or a build at all: `npm run dev` binds `0.0.0.0`, so
  a **real phone on the same network** can open `http://<your-machine-ip>:5001/` and exercise the
  actual touch stack — the fastest way to test gestures. A ~360px desktop browser viewport covers
  layout. The emulator/APK is for the Tauri-only seams (DB, dialogs, insets).

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
