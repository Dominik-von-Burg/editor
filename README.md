# Notes Editor

Inspired by [textarea](https://github.com/antonmedv/textarea).

A single-file markdown editor that lives in one `notes.html` file — no build step, no dependencies, no framework. Just open it in your browser and start writing.

## Features

- **Markdown live preview** — headings, bold, italic, strikethrough, underlines, code blocks, blockquotes, lists (ordered + unordered, nested), and links rendered in real time
- **Multiple documents** — create, delete, and switch between notes; recent docs shown in the menu
- **Auto-save** — every keystroke is saved to `localStorage`; survives page reloads
- **Folder sync** — link a local folder via the File System Access API; changes sync bidirectionally (~2 s interval) so you can edit files externally and see them update in the editor
- **Document browser** — "More docs…" dialog with search filtering for large doc libraries
- **Export** — copy rendered HTML to clipboard, save as standalone `.html` or plain `.txt`
- **Undo/redo** — full history with `Ctrl+Z` / `Ctrl+Shift+Z`
- **Keyboard shortcuts** — `Tab` / `Shift+Tab` to indent/outdent blocks, `Enter` to continue/exit lists
- **Dark mode** — follows system preference automatically
- **Print-friendly** — clean output with `Ctrl+P`

## Usage

**Live:** [https://Dominik-von-Burg.github.io/editor/](https://Dominik-von-Burg.github.io/editor/)

Open `notes.html` in any modern browser (Chrome, Edge, Firefox, Safari). No server required — it works from `file://` or any HTTP origin.

For folder sync, use Chrome/Edge on `http://localhost` or `https://` (the File System Access API requires a secure context).

## Project

- **Issues**: tracked with [beads](https://github.com/Dominik-von-Burg/beads) (`bd` CLI)
- **Tests**: E2E via [`agent-browser`](tests/) — 42 editor tests + 7 folder-sync tests
- **Subagents**: worker, reviewer, scout, planner (see [AGENTS.md](AGENTS.md))
