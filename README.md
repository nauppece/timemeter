# TimeMeter (obsidian-timemeter)

> 日本語版は [README.ja.md](README.ja.md) をご覧ください.

TimeMeter is a lightweight time tracker for Obsidian. On **macOS desktop** it automatically tracks the frontmost app (and, optionally, every open app) and records your day as a Markdown table in your vault. A sidebar shows **today / per-day / monthly** views with an app-totals bar chart and a zoomable timeline. Click a bar or a timeline segment to jot down "what I was doing" — into the session's note, your daily note, or a recently-used file. It can also draft a daily report you can hand to an LLM to fill in.

The point isn't the automatic tracking itself — it's making it easy to leave a one-line note about *what* each session was for.

**Platform:** Automatic tracking is **macOS-only** and works only while Obsidian is open. On mobile (iOS/iPadOS/Android) tracking is disabled, but you can still view the data (sidebar & embeds) and add manual logs. The UI is available in **English and Japanese** (English by default; switch it in settings).

> **⚠️ System commands (important).** To detect the frontmost app on desktop, TimeMeter runs macOS commands via `child_process` — `osascript` (frontmost app name / window title) and `ioreg` (idle time for AFK). These run **only when `Platform.isDesktopApp` is true** (never on mobile — `child_process` isn't even loaded there), use **`execFile` (no shell)** with **static arguments and a static AppleScript** (no user/vault data is interpolated, so there is no injection surface), only **read** system state, and **send nothing over the network** — everything is written to Markdown in your vault. See [Permissions (macOS)](#permissions-macos).

## Install

### 1. Community plugins (after review)

Settings → Community plugins → Browse → search for **"TimeMeter"** → Install → Enable. (Pending review at the time of writing.)

### 2. BRAT (beta / available now)

1. Install and enable **BRAT** (Obsidian42 - BRAT) from Community plugins.
2. In BRAT, "Add Beta plugin" → `nauppece/timemeter`.
3. Enable **TimeMeter** under Community plugins.

### 3. Manual (release assets)

Download `main.js`, `manifest.json`, and `styles.css` from the latest [Release](https://github.com/nauppece/timemeter/releases), put them in `<vault>/.obsidian/plugins/timemeter/`, and enable the plugin.

```sh
# From source (build and deploy to your own vault)
git clone https://github.com/nauppece/timemeter.git
cd timemeter
npm install
export TIMEMETER_PLUGIN_DIR="/path/to/YourVault/.obsidian/plugins/timemeter"
npm run deploy   # builds, then copies main.js/manifest.json/styles.css to that folder
```

> On macOS, tracking needs **Automation** and **Accessibility** permission the first time (see below). Until granted, the sidebar shows a permission error, but viewing and manual logging still work.

## What it does / doesn't do

### Desktop (macOS)

- **Automatic app tracking** (polling interval is configurable). By default it records **every app that has a window open on the desktop** in parallel (so concurrent work is captured); set `captureAllApps` off to record only the frontmost app.
- **AFK is ignored by default**, so recording never breaks while you watch a video or read. Turn **"Detect away (AFK)"** on and idle time is kept but shown **dimmed as "away"** on the timeline (still counted in totals; threshold defaults to 10 minutes).
- Records the **window title** (frontmost app only) — used for hover details and the LLM report draft.
- Sidebar: **Today** (live state, per-app bars, timeline, quick actions), **Day** (step through past days), **Month** (heatmap; click a day to open it).
- Click an app bar → a modal lets you **pick a destination** (daily note first, then recently-used files) and type "what I was doing"; it appends `- App: text` to the chosen file.
- Click an empty timeline segment → the same destination picker, defaulting to **"This record's note"** (fills the session's description column).
- Quick commands: **note the current session**, **add a manual log**, **lap** (start a new task from here).
- Status-bar item (current app, elapsed minutes, today's total; click to open the panel).
- `timemeter` code-block **embed**.
- Insert a **daily-report draft** into your daily note, and **copy an LLM prompt** to fill empty descriptions.

### Mobile

- View data in the sidebar (Today/Day/Month) — but with no automatic tracking, "Today" only shows what you logged manually that day.
- Render `timemeter` embeds.
- Add manual logs.
- **No automatic tracking** (no frontmost-app / AFK detection); the "note current session" and "lap" commands are hidden.

### Limitations

- Automatic tracking only runs while desktop Obsidian is open; nothing is recorded while Obsidian is closed or the machine is asleep.
- It only tracks *which app is frontmost*, not what you do inside an app.

## Permissions (macOS)

Because tracking asks *System Events* via `osascript`, macOS asks for permission the first time:

1. **Automation** (required for the frontmost app name). A dialog appears on first tracking. If it doesn't, or you declined, enable it under `System Settings → Privacy & Security → Automation → Obsidian → System Events`.
2. **Accessibility** (required for the window title): `System Settings → Privacy & Security → Accessibility → Obsidian`. Without it, app names are still recorded — only titles stay empty.

If permission is missing or denied, the detection functions swallow the error and return `null`, so Obsidian never crashes or shows an error — the session simply isn't recorded, or the title is empty. Idle detection uses `ioreg -c IOHIDSystem` and needs no extra permission.

## Commands

Run from the command palette (`Cmd/Ctrl+P`). The full palette id is `timemeter:<id>`.

| Command | id | Availability |
|---|---|---|
| Open panel | `open-view` | Desktop & mobile |
| Aggregate now | `aggregate-now` | Desktop & mobile (a no-op on mobile — no tracking data) |
| Note current session | `note-current` | **Desktop only**, and only shown while an app is being tracked |
| Add manual log | `manual-log` | Desktop & mobile |
| Lap (new task from here) | `lap` | **Desktop only** |
| Insert today's TimeMeter into the daily note | `insert-daily-embed` | Desktop & mobile |
| Insert daily-report draft into the daily note | `insert-nippou-draft` | Desktop & mobile |
| Copy prompt for an LLM | `copy-claude-prompt` | Desktop & mobile |

No default hotkeys are set (they can conflict with other plugins); assign your own under Settings → Hotkeys. You can also open the panel from the ribbon (hourglass) icon.

## Data format

Records are stored at `<data folder>/YYYY-MM-DD.md` (data folder defaults to `TimeMeter`, configurable).

### Frontmatter

```yaml
---
date: 2026-07-09
total_min: 125
totals:
  "Obsidian": 80
  "✍️ 手動": 45
---
```

Only `date` / `total_min` / `totals` are managed by the plugin; any other frontmatter keys you add are preserved (only these three are replaced). `totals` is minutes per app.

### Session table

Written as a Markdown table between markers in the body:

```
<!-- timemeter:sessions:start -->
| 開始 | 終了 | 時間 | アプリ | タイトル | 説明 | 離席 |
|------|------|------|--------|----------|------|------|
| 09:00 | 10:15 | 1h 15m | Obsidian | note.md — Vault | Organized docs |  |
<!-- timemeter:sessions:end -->
```

Columns are **start / end / duration / app / title / note / away** (the headers are in Japanese). There is no dedicated "manual" column — manual logs are rows whose app is `✍️ 手動`. The **away** column holds `1` for idle spans when AFK detection is on (for the dimmed display; still counted in totals). Older 6-column files (no away column) still read fine and are upgraded on the next write.

- The plugin never touches text outside the markers (headings, your own notes, etc.).
- In cells, `|` is escaped to `\|` and newlines to `<br>`; the managed-marker comment is neutralized if it ever appears inside a title.
- **Re-aggregating never loses data.** Rows are merged by `startHH:MM|app`: when a key exists in both, the new end/title win but the **note is kept if the new one is empty**; rows that only exist in the file (e.g. manual logs) are preserved.

## LLM workflow

The "Copy prompt for an LLM" command copies a prompt like this to the clipboard (no API key needed — hand it to Claude Code or similar together with the day's file):

```
For sessions with an empty description in `TimeMeter/2026-07-09.md`, infer the
activity from the time range, app, and window title, and fill in the description
column. Do not change descriptions that already exist.
```

## Settings

Settings → TimeMeter.

| Setting | key | Default | Range |
|---|---|---|---|
| Language | `lang` | `en` | English / 日本語 |
| Polling interval (sec) | `pollIntervalSec` | 10 | 5–60 (step 5) |
| Detect away (AFK) | `afkDetect` | false | Off = keep recording; On = mark idle as "away" |
| Away threshold (min) | `afkThresholdSec` | 600 (10 min) | 1–30 min (only when `afkDetect` is on) |
| Merge gap (min) | `mergeGapMin` | 3 | 1–10 (step 1) |
| Track all open apps | `captureAllApps` | true | On/Off (Off = frontmost only) |
| Data folder | `dataFolder` | `TimeMeter` | any string (blank resets to default) |
| Daily-note heading | `dailyHeading` | `## TimeMeter` | where appends/embeds/report drafts go (blank = end of file) |
| Show status bar | `showStatusBar` | true | On/Off |
| Open sidebar on startup | `showSidebarOnStart` | true | On/Off |
| Per-app rules (show/exclude) | `apps[name]` | new apps auto-register as `{ hidden: false }` | toggle show/exclude per app (excluded = removed from timeline & totals) |

Changing the polling interval, AFK settings, or "Track all open apps" restarts the internal tracker (no double polling).

### Track all open apps (parallel tracking)

With `captureAllApps` (default on), each poll records **every app with a window open on the desktop** (`osascript`'s `every process whose visible is true`), not just the frontmost one — so concurrent work (e.g. coding while watching a video) is all captured.

- **Totals can exceed wall-clock time.** Six apps open for an hour add ~1 hour each, so the total can be up to six hours; on the timeline, app lanes overlap in time. This is by design for this mode.
- Only recorded **while you're active** (not AFK).
- Titles are captured for the **frontmost app only** (background apps have empty titles).
- Always-open apps like Finder are included, so exclude the ones you don't care about via per-app rules.
- Off = only the frontmost app is recorded (total = time actually spent in front).

### Language (EN/JA)

Switch `lang` between English and 日本語 (English by default). The panel UI, notices, settings, and status bar update immediately. However **command names, the ribbon tooltip, and the plugin name in the list are fixed at registration time** by Obsidian, so a reload (or disable→enable) is needed to change those.

### Excluding an app

Turn an app's "show" off in per-app rules to **remove it entirely from the timeline, bars, today's total, the month heatmap, and the report** (e.g. a chat app you don't want to count). Excluded apps are grouped at the top of settings and can be re-enabled anytime; the recorded data (`.md`) is kept, so past days come back if you re-enable it. You can also exclude an app from the sidebar's ⋯ / right-click menu (re-enable from settings).

### Zooming & scrolling the timeline

The timeline has a `− / {zoom} / +` control (1x–4x). Zooming in makes lanes overflow; scroll horizontally (trackpad, Shift+wheel, scrollbar, or drag to pan) to move through the day. The centered time is kept while zooming, the app-name column stays pinned on the left, and zoom is per-session (resets to 1x when you reopen the panel; independent for Today vs. Day).

## Embeds

Write this in a note to render that day's total, per-app bars, and a single-strip timeline (read-only; works on mobile too):

````
```timemeter
date: today
```
````

`date` accepts `today` or `YYYY-MM-DD` (missing/empty/invalid values fall back to `today`).

## Development

```sh
npm run dev     # esbuild watch (outputs main.js)
npm run build   # tsc --noEmit + esbuild production build
npm test        # vitest run (83 tests)
npm run deploy  # build, then deploy.sh copies main.js/manifest.json/styles.css to
                # the folder in TIMEMETER_PLUGIN_DIR (see Install)
```

Development happens in this repo; only the build artifacts (`main.js` / `manifest.json` / `styles.css`) go into a vault. `deploy.sh` reads the destination from `TIMEMETER_PLUGIN_DIR` (optionally via a gitignored `deploy.local.sh`), so it works on any machine. Releases are built and signed with build-provenance attestations by GitHub Actions when a version tag is pushed. A pre-commit hook (`githooks/pre-commit`, enabled by `npm install`) blocks commits containing personal absolute paths or API keys.
