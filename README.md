# TBH Toolkit

A local, **read-only** desktop companion for [TBH: Task Bar Hero](https://store.steampowered.com/app/3678970/TBH_Task_Bar_Hero/).
It reads your save and the game's own data files on your PC and gives you tools the game doesn't have —
starting with **build share codes** so you and your friends can compare heroes, gear and attribute points.

> Unofficial fan project. Not affiliated with or endorsed by the developers of TBH: Task Bar Hero.
> You need to own the game. No game data or assets are included in this repository — everything is
> read from your own install when the app starts.

## What it does

| Tool | What you get |
| --- | --- |
| **Build Share** | Every unlocked hero with equipped gear, base and inherent stats, rolled enchants (with tier), unique effects, skills, attribute points, runes, relics and pet, plus **gear stat totals** per hero. Generate a share code, import a friend's code, and compare the two builds side by side with per-stat differences. |
| **Live Rates** | XP/hour and gold/hour for your active party, session totals and time-to-next-level, updated every time the game autosaves. Past sessions are kept. |
| **Data Browser** | Search and sort all ~59 data tables datamined from your install (items, gear, stat mods, skills, runes, relics, drops, …) with in-game names shown next to raw keys. |

## Quick start

Requirements: Windows 10/11, [Node.js](https://nodejs.org) 20 or newer, and the game installed through Steam.

```bash
git clone https://github.com/CowDotDev/tbh-toolkit.git
```

```bash
cd tbh-toolkit
```

```bash
npm install
```

```bash
npm start
```

The first `npm start` downloads the Electron runtime (about 120 MB), so it takes a little longer than later runs.
The app finds your game install and save folder automatically; if it can't, pick them under **Settings**.

### Sharing a build

1. Open **Build Share → Share**, tick the heroes (and optionally relics, runes and pet), and press **Generate share code**.
2. Send the `TBH1-…` code to a friend over Discord, a text file, anything.
3. Your friend opens **Build Share → Friends' Builds**, pastes the code and presses **Import build**.
4. **Compare** shows your build against theirs: gear slot by slot, stat totals with differences, attributes and runes.

## Is it safe to use?

- **Read-only.** The toolkit reads `SaveFile_Live.es3` and the game's data files. It never writes to them,
  never reads or writes the running game's memory, never injects anything, and never automates gameplay.
- **Local.** There is no server, no account, no telemetry and no network access. Share codes leave your PC only
  when you paste them somewhere yourself.
- **Share codes carry build data only**: item keys, enchant rolls, attribute levels, skills, rune levels, relics
  and pet. No Steam ID, account data, item unique IDs, currencies or inventory.
- **Imported codes are untrusted input.** They are size-capped and validated against a strict schema before
  anything is shown.

TBH is server-backed and has a Steam Market item economy, so this project deliberately stays on the
"look, don't touch" side. See [Out of scope](#out-of-scope).

## How it works

Everything is datamined from files already on your machine:

| Source | Location | Used for |
| --- | --- | --- |
| Save file | `%USERPROFILE%\AppData\LocalLow\TesseractStudio\TaskbarHero\SaveFile_Live.es3` | Heroes, equipped items, enchants, attributes, runes, relics, pet, gold, XP |
| Data tables | `<Steam>\steamapps\common\TaskbarHero\TaskBarHero_Data\sharedassets0.assets` | ~59 CSV tables (`ItemInfoData`, `GearInfoData`, `StatModInfoData`, …) |
| Text | `…\TaskBarHero_Data\StreamingAssets\aa\StandaloneWindows64\localization-*.bundle` | In-game names and stat text |

- The save is an Easy Save 3 file (AES-128-CBC, PBKDF2-SHA1). It is decrypted in memory and parsed with a
  big-integer-safe JSON parser, because item IDs exceed JavaScript's safe integer range. If the game is
  mid-write, the newest rolling backup is used instead.
- The data tables are Unity `TextAsset`s. A small built-in reader for Unity's `SerializedFile` and `UnityFS`
  (LZ4) containers extracts them — no external tools, and no game data is redistributed here.
- Because tables are read from *your* install, the app always matches the game version you have. After a game
  update, just restart the app (or press **Re-read game & save** in Settings).

### Notes on accuracy

- **Gear stat totals are gear only**: base stats + inherent stats + enchants, summed per stat. They are not the
  final numbers on the in-game Status panel, which also include hero base stats, attributes, runes, relics,
  pets and the game's combat formulas. That is on the [roadmap](#roadmap).
- Stat text uses the game's own templates. The game stores percentage stats in tenths of a percent, so a raw
  `192` is shown as `19.2%`. If you spot a number that doesn't match an in-game tooltip, please open an issue.
- Unique-effect and resonance descriptions are filled in on a best-effort basis from the tables.

## Development

```bash
npm run dev        # run with hot reload
npm test           # unit tests (synthetic data only; one extra test runs if the game is installed)
npm run typecheck
npm run lint
npm run smoke      # print your current build from the real install, without opening the app
npm run build      # production bundle into out/
```

Stack: Electron, [electron-vite](https://electron-vite.org), React, TypeScript, Vitest.

```
src/
  shared/      pure TypeScript used everywhere: build model, share-code codec, diffing, rate math
  main/
    core/      game locator, save reader, Unity readers, game data, JSON store, AppCore
    tools/     one module per tool (main-process side)
  preload/     the only bridge the UI can reach: window.tbh.invoke / window.tbh.on
  renderer/    React UI; src/tools/registry.ts lists every tool in the sidebar
scripts/       smoke test
tests/         unit tests
```

### Adding a tool

The app is built to grow. A tool is a React component plus (optionally) a main-process module, each registered
in one place, and every tool gets the decrypted save, the datamined tables and localization for free.
See **[docs/ADDING_A_TOOL.md](docs/ADDING_A_TOOL.md)** for a walkthrough.

## Roadmap

Ideas collected from what the community has already built or asked for. Contributions welcome.

- **Full stat sheet** — reproduce the in-game Status panel (and DPS / EHP) from gear, attributes, runes, relics
  and pets, so compares show final numbers rather than gear totals.
- **Stash value** — price tradeable items against live Steam Community Market listings.
- **Chest timers** — countdowns for normal / stage-boss / act-boss chests using your real cooldowns.
- **Rune tree planner** — plan upgrade paths and gold costs.
- **Farm optimizer & idle return timer** — best stage for gold or XP per hour, and when to come back.
- **Gear upgrade finder** — compare items in your bag against what's equipped.
- **Mini overlay** — always-on-top readout of the live rates.
- **Item icons** — extract sprites from the game's textures for a richer build view.
- **Short share links** — optional upload of a code to a GitHub Gist for a shorter link.
- **More locales** — the game ships 16 languages; the reader already supports picking one.
- **Linux / Proton** — path detection exists but is untested.
- **Packaged installer** with auto-update.

Related community projects worth a look: [tbh-copilot](https://github.com/shigake/tbh-copilot) (browser-based
optimization co-pilot), [tbh-companion](https://github.com/lucasfevi/tbh-companion) (live stats and inventory
valuation), [tbh-meter](https://github.com/mad-labs-org/tbh-meter) (DPS meter).

### Out of scope

Bots, macros, automation, save editing, memory writing and trainers. They break the game's terms of service
and hurt its trading economy, and they will not be added here.

## Troubleshooting

- **"Game install not found" / "Save folder not found"** — open **Settings** and pick the folder. The game
  folder is the one containing `TaskBarHero.exe`; the save folder is the one containing `SaveFile_Live.es3`.
- **Names show as keys like `ItemName_300001`** — the text bundles couldn't be read (the app says so in
  Settings). Everything else still works; please open an issue with your game version.
- **Live Rates shows dashes** — it needs two autosaves to measure a rate. Leave the game running for a few minutes.
- **A friend's build shows `Item 123456`** — their code was made on a newer game version than yours. Update the game.
- **Something broke after a game update** — save or table formats can change. Open an issue with the version
  shown in the bottom-left corner.

## License

Code is [MIT](LICENSE). TBH: Task Bar Hero, its names, data and assets belong to their respective owners; this
repository contains none of them.
