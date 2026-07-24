---
name: run-budget-tool
description: Build, run, and drive the budget tool. Use when asked to start the app, launch the dev server or desktop app, take a screenshot of a screen (desktop or phone width), click through a flow to confirm a change works, or run its typecheck/tests/lint.
---

The budget tool ships three ways from one UI (browser + `apps/api`; Tauri desktop; Android). Drive
the **web** target — it is the same `apps/web` code the desktop and Android shells load, so any UI
change is verifiable there. The handle is `.claude/skills/run-budget-tool/driver.mjs`: it boots the
API + Vite itself, launches headless Chrome over CDP, and runs a line-oriented script. No npm deps,
no Playwright install.

All paths below are relative to the repo root.

## Prerequisites

Already true on this machine; verified versions:

```bash
node -v      # v25.9.0 — needs ≥ 22.13 for node:sqlite + global WebSocket
npm -v       # 11.12.1
rustc -V     # 1.97.1 — desktop/Android only
```

Chrome is found automatically at `/Applications/Google Chrome.app/…`; override with
`CHROME=/path/to/chrome`. Nothing else to install — `npm install` if `node_modules/` is missing.

## Run (agent path)

One command, servers included. `--serve` copies `data/budget-demo.db` to a temp file and points the
API at **that**, so the user's real `data/budget.db` is never touched:

```bash
node .claude/skills/run-budget-tool/driver.mjs --serve --script .claude/skills/run-budget-tool/smoke.txt
```

`smoke.txt` is the end-to-end check: every tab renders, an entry saves, the month total moves by
exactly £29.00, and the phone layout is captured. ~10s, exit 0, seven PNGs in `/tmp/budget-shots/`.

**Assert in text, look with your eyes only where it counts.** Reading one screenshot costs ~2k
tokens; an `expect` line costs ~10. Prove behaviour with `expect`/`eval` (totals, values, element
counts) and `Read` only the one or two shots where *appearance* is the question — a chart that
paints blank, a phone layout that overflows. Running the smoke and reading all seven is the
expensive habit, not a thorough one.

For a one-off, pipe a script on stdin:

```bash
node .claude/skills/run-budget-tool/driver.mjs --serve <<'EOF'
size 360 780
goto /
wait text=THIS MONTH
eval document.body.innerText.match(/THIS MONTH\n([^\n]+)/)[1]
click text=Trends
sleep 900
shot trends-phone
EOF
```

Each run is a fresh browser at `about:blank`, so **every script must `goto` before it touches the
page** (`size` is the one thing worth putting first). Exit code is 1 on the first failing line —
which also dumps `/tmp/budget-shots/fail-1.png` — and 0 when every line passed.

### Script commands

| command | what it does |
|---|---|
| `goto /` | navigate (path or full URL), wait for load + `#root` to fill |
| `wait <sel>` / `waitgone <sel>` | poll for a selector, 15s default (`--timeout` to change) |
| `click <sel>` | scroll into view, real mouse press/release at its centre |
| `type <sel> <text>` | focus + `Input.insertText`; quote a selector containing spaces |
| `clear <sel>` | empty a React-controlled input (native setter + `input` event) |
| `key <k>` | `a` `o` `s` `m` (tab hotkeys), `Enter`, `Escape`, `ArrowLeft/Right`, any letter |
| `size <w> <h>` | viewport; `< 640` also turns on touch emulation → the phone layout. Set it **before** `goto` |
| `text <sel>` | print the element's `innerText` |
| `eval <js>` | evaluate (await-ed) and print JSON |
| `expect <js>` | same, but fail the run if falsy |
| `shot <name> [full]` | PNG → `/tmp/budget-shots/<name>.png`; `full` = whole scroll height (grows the viewport, captures, restores) |
| `sleep <ms>` | charts animate; 600–900ms after a tab switch is enough |

Selectors are CSS, or `text=<substring>` — which picks the *smallest visible* element containing
that text, preferring buttons/links. `text=Save entry`, `text=Trends`, `text=THIS MONTH` all work.

### Flags

| flag | default | notes |
|---|---|---|
| `--serve` | off | boot API (:8100) + Vite (:5001) and kill them on exit |
| `--db demo\|fresh\|<path>` | `demo` | `demo` = temp copy of `data/budget-demo.db`; `fresh` = empty DB (exercises the seed) |
| `--script <file>` | `-` (stdin) | |
| `--out <dir>` | `/tmp/budget-shots` | |
| `--headed` | off | opens a real Chrome window |
| `--verbose` | off | streams API/Vite/Chrome output + every `console.log` |
| `--base <url>` | `http://localhost:5001` | drive an already-running server; omit `--serve` |
| `--timeout <ms>` | `15000` | per `wait`/`click` |

Page errors and `console.error` are printed as they happen (`[page-error] …`) and summarised at
the end even when every line passes — check that line before declaring a screen healthy.

## Run (human path)

```bash
npm run dev:demo   # API :8100 + Vite :5001 against data/budget-demo.db — open http://localhost:5001
```

`npm run dev` is the same pair against `data/budget.db`, the user's real ledger — leave it to them.
Both stop with Ctrl-C; from a tool call, `pkill -f concurrently; pkill -f vite`.

## Desktop / Android

The desktop app compiles and launches on this machine:

```bash
npm -w @budget/desktop run tauri dev -- --config '{"identifier":"com.budgettool.smoke"}'
```

The `--config` override is **important**: without it `tauri dev` opens the user's real desktop
database at `~/Library/Application Support/com.budgettool.desktop/budget.db`. The override moves the
app-config dir to `~/Library/Application Support/com.budgettool.smoke/`, so the run gets its own
seeded DB and the real one is safe. Cold Rust build ≈ 4 min (379 crates), then seconds; the window
appears once the log says `Running target/debug/app`. Stop it with
`pkill -f 'target/debug/app'; pkill -f 'tauri dev'; pkill -f vite` — `tauri dev` leaves its Vite
child holding :5001 otherwise.

There is no CDP in the Tauri WKWebView — you can look at the window, not script it:

```bash
.claude/skills/run-budget-tool/desktop-shot.sh            # → /tmp/budget-shots/desktop.png
```

It raises the window (AppleScript, process name `app` — *not* "Budget Tool") and captures just its
rect, over the top of whatever else is on screen.

**macOS permissions.** The shot script needs two, both granted to the *host app* running the tool
(VS Code, iTerm…), in System Settings → Privacy & Security:

| permission | without it | needed for |
|---|---|---|
| Screen Recording | `could not create image from display` | `screencapture` |
| Accessibility | `osascript is not allowed assistive access. (-1719)` | raising the window / reading its rect |

Granting either only takes effect after the host app is **fully restarted** — so ask for both at
once. Nothing else in this skill needs a permission: the driver, the dev servers and `tauri dev`
all run headless or in their own window.

Since the webview loads `apps/web` verbatim, verify UI work through the driver above and use the
desktop run only for shell-level things (window, menus, file dialogs, export/import). The Rust data
path (which Android also rides) is covered by tests, not by clicking:

```bash
cd apps/desktop/src-tauri && cargo test    # 21 tests, ~1s warm
```

Android needs the Android SDK/NDK and is not set up here — see `docs/MOBILE.md`. Phone *layout* is
still checkable with `size 360 780` in the driver.

## Test

```bash
npm run typecheck   # tsc across all workspaces
npm test            # vitest — 337 tests / 24 files, ~2s
npm run lint        # eslint (driver.mjs is linted as node code)
```

## Gotchas

- **One command per line, always.** A multi-line `eval` is split into garbage and dies with
  `SyntaxError: Unexpected token ')'`. Long probes go on one line — and for anything that has to
  span time (walk N months, sample a value through an animation), write the whole loop as a single
  `eval await (async()=>{…})()` instead of trying to script it line by line: `document.dispatchEvent(
  new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}))` drives the app's global hotkeys from
  inside the page, and you can return a trace array.
- **`key a` while an input has focus does nothing.** The app's hotkey handler bails out on
  INPUT/TEXTAREA/SELECT targets, and after saving an entry the focus is still in the form. Click
  the tab (`click text=Overview`) instead of `key o` once you have typed anything.
- **Enter in the category filter selects the match and must *not* submit the form.** The driver
  sends the key text inside the `keyDown` (never a separate `char` event) so the app's
  `preventDefault()` still wins. A standalone `char` event bypasses it — that bug showed up as an
  amount of `a12.50` (the `a` hotkey leaking into the autofocused field) and as a form that saved
  before the note was typed.
- **The amount field is a sum expression, not a number.** `8+8+8+5` → £29.00. It shows `invalid`
  rather than throwing, and Save stays disabled — assert with
  `expect document.querySelector('#amount').value === '…'`, not on the save succeeding.
- **`text=` matches the category grid too.** `text=Nicotine` finds the category button, not the
  saved row in the "Added just now" aside. Assert on the aside's text
  (`expect document.querySelector('aside').innerText.includes('£29.00')`) instead.
- **`size` after `goto` desyncs the phone layout.** The swipeable sub-tab pager reads the width
  when it mounts, so resizing a loaded page leaves the pill on "Trends" while the panel still shows
  "Month". Put `size 360 780` *before* `goto /`, or `goto /` again after resizing.
- **Screenshots are viewport-only by default** and the Overview is ~4200px tall at 1280 wide — use
  `shot name full` to get the donut, the vs-last-month bars and the sankey in one image. (CDP's
  `captureBeyondViewport` does nothing here, because the driver always has a device-metrics override
  active for `size`; `full` grows the viewport instead.)
- **Never point `--serve` at `data/budget.db`.** It is the user's real ledger. The default
  (`--db demo`) copies the committed demo DB to a temp dir; entries you add are thrown away.
- **`npm run dev` (human path) writes to the real DB** — prefer `npm run dev:demo` if you must run
  it by hand.

## Troubleshooting

- **`error[E0658]: use of unstable library feature 'cfg_select'` compiling `libsqlite3-sys`** —
  the Rust toolchain is too old for the pinned crate. `rustup update stable` (1.93 → 1.97 fixed it).
- **`Touch points must be between 1 and 16`** — CDP rejects `maxTouchPoints: 0`; the driver always
  sends 5 and toggles `enabled`. Only relevant if you edit `setSize`.
- **`timed out waiting for text=…`** — either the script forgot its leading `goto /`, or the label
  is not what you assumed (the Salary tab has "Gross Pay"/"Net Income", *not* "Take-home"). Run with
  `--headed` or `Read` the auto-dumped `/tmp/budget-shots/fail-1.png`.
- **Vite/API port already in use** — `--serve` assumes :5001 and :8100 are free. A leftover
  `tauri dev` holds :5001; `pkill -f 'apps/api/src/index.ts'; pkill -f vite` clears both.
