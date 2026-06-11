# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This repository contains two standalone, single-file HTML tools built for staff at a Japanese care facility (介護施設). There is no build system, package manager, test suite, or linter — each `.html` file is a complete application with inline CSS and vanilla JavaScript.

- **`index.html`** — 日報 ミャンマー語翻訳ツール: translates Japanese daily care reports (日報) into Burmese for Myanmar staff. Has two modes:
  - **Free mode**: splits input into 7 fixed report sections by detecting numbered headings (`SECTION_PATTERNS` matches `1.`/`１．`-style prefixes and keywords like 外出/体調/入浴), then translates each section via the MyMemory API (chunked to ~480 chars per request).
  - **Claude API mode**: sends the whole report to the Anthropic Messages API directly from the browser (`anthropic-dangerous-direct-browser-access` header) with a system prompt that classifies and translates into the same 7 categories, returned as JSON. The user's API key is stored in `localStorage`.
  - Also supports `.xlsx`/`.csv` drag-and-drop (SheetJS), QR code output (qrcodejs), LINE share, and print layout (`@media print` with `.no-print` class).
- **`tts-tool.html`** — bulk text-to-speech tool ("貼って即しゃべる音声ツール v4"): converts each line of pasted text into one MP3 via the StreamElements TTS endpoint. Designed to avoid memory crashes on iOS Safari: it deliberately does NOT batch into a ZIP; instead each item is generated → cached in IndexedDB → downloaded → deleted from cache → 3-second wait, so only one audio blob is in memory at a time. Failed/undownloaded items remain in IndexedDB and can be retried individually. Also has an instant-preview mode using the browser's Web Speech API.

## Development

There are no build, lint, or test commands. To run locally, serve the directory over HTTP (required for the on-page QR code that lets phones open the tool — `file://` URLs are detected and blocked):

```bash
python -m http.server 8000
```

External dependencies are loaded from CDNs (qrcodejs, SheetJS) or called as remote APIs (MyMemory, Anthropic, StreamElements, qrserver.com) — nothing is installed locally.

## Conventions

- Keep each tool fully self-contained in its single HTML file (inline `<style>` and `<script>`); do not introduce a build step or split files unless asked.
- UI text is bilingual: Japanese primary, with Burmese (ミャンマー語) labels in `index.html`. Code comments are written in Japanese — match this style.
- Both tools persist user state in browser storage: `localStorage` keys `myanmar_tool_api_key` and `myanmar_tool_qr_lan_url` in `index.html`; IndexedDB database `tts_tool_cache_v4` in `tts-tool.html`.
- `tts-tool.html`'s one-at-a-time download loop and inter-download delay (`DOWNLOAD_INTERVAL_MS`) are intentional mobile-safety measures — preserve this pattern when modifying the conversion flow.
- The 7 report categories in `index.html` (outing, health, room, bath, new, ongoing, other) must stay consistent across `SECTION_PATTERNS`, the Claude system prompt JSON schema, the output DOM ids (`out_*`), `renderOutput`, and `shareToLine`.
