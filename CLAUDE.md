# CLAUDE.md

This file provides guidance to Claude Code (and other AI assistants) when working with code in this repository.

## Project Overview

This repository contains a single self-contained HTML application: a **daily care-facility report translator**
(日報 ミャンマー語翻訳ツール / နေ့စဉ် အစီရင်ခံစာ ဘာသာပြန်ကိရိယာ). It helps Japanese-speaking care facility staff
translate and reorganize daily handover reports (日報) into Burmese (Myanmar) for Myanmar-speaking staff.

The whole application — markup, styles, and logic — lives in **`index.html`** (~870 lines). There is no build
step, package manager, server-side code, or test suite. It is meant to be opened directly in a browser or served
as a static file (e.g. via GitHub Pages or `python -m http.server`).

## Repository Structure

```
index.html   # The entire application (HTML + <style> + <script>)
```

That's it — a one-file repo. Any changes go directly into `index.html`.

## How the App Works

The UI has two mutually-exclusive modes, switched via tabs (`switchMode('free' | 'api')`):

### 1. Free mode (no API key) — `runFreeMode()`
- The user pastes a Japanese daily report (or drops an `.xlsx`/`.csv` file, parsed via `xlsx.js`).
- `splitByHeaders()` / `detectSectionHeader()` use the `SECTION_PATTERNS` table to split the raw text into 7
  fixed sections based on numbered headings (`1.` / `１．` / etc.) or Japanese keywords (外出, 体調, 居室, 入浴,
  新入所, 継続, その他).
- Each section is translated Japanese → Burmese via the free **MyMemory API**
  (`myMemoryTranslate`, `https://api.mymemory.translated.net/get`), chunked to stay under the ~480 char/request
  limit.

### 2. Claude API mode — `runApiMode()`
- Requires the user's own Anthropic API key (must start with `sk-ant-`), entered in the "APIキー" field and
  persisted to `localStorage` (key: `myanmar_tool_api_key`).
- Sends the full report text directly from the browser to `https://api.anthropic.com/v1/messages`
  (model `claude-haiku-4-5-20251001`) using `anthropic-dangerous-direct-browser-access: true`.
- The system prompt instructs the model to classify the report into the same 7 categories, summarize per
  resident, translate to Burmese, and return **JSON only**. The response JSON is parsed from the model's reply.

### The 7 report sections (shared by both modes)
| key       | Japanese label   | Burmese label (excerpt)                      |
|-----------|------------------|-----------------------------------------------|
| outing    | 外出スケジュール  | ယနေ့ အပြင်ထွက်မည့် အစီအစဉ်                     |
| health    | 体調管理          | ကျန်းမာရေး စောင့်ကြည့်ရန်                      |
| room      | 居室環境          | အခန်း ပတ်ဝန်းကျင် ပြောင်းလဲသွားသူများ          |
| bath      | 入浴予定          | ရေချိုးမည့် အစီအစဉ်                            |
| new       | 新入所のご利用者  | အသစ်ဝင်ရောက်လာသူများ (API mode key: `newResident`) |
| ongoing   | 継続中の連絡事項  | ဆက်လက် ဆောင်ရွက်ရန် အကြောင်းကြားစာများ          |
| other     | その他の連絡事項  | အခြား အချက်အလက်များ                            |

Note the key mismatch: the free-mode result object and the DOM IDs use `new`, but the Claude API JSON schema
uses `newResident` — `runApiMode()` remaps this when calling `renderOutput()`. Keep this mapping in sync if you
add/rename sections.

### Output rendering — `renderOutput(data)`
- Fills `#out_<key>` elements for each section; empty sections show a localized "該当なし / မရှိပါ" placeholder
  (class `empty-notice`).
- Sets the report date (`#outputDate`) to today's date in long Japanese format.
- Generates a QR code of the combined output text via `generateQR()` (uses `qrcode.min.js`, capped at 2000
  chars).
- Reveals the output card and action buttons (`#outputArea`, `#actionBtns`).

### Sharing & printing
- **LINEで送る** (`shareToLine()`) builds a bilingual plain-text summary and opens LINE's share intent URL.
- **印刷する** uses `window.print()`; `@media print` rules hide non-printable UI (`.no-print`) and the QR panel.

### "Open on phone" QR panel (bottom of page)
- An IIFE near the end of the script renders a QR code linking to the page's own URL so staff can open the tool
  on a phone.
- Hidden automatically on mobile user agents.
- Handles `file://` and `localhost` URLs (which a phone can't reach) by prompting the user to enter a LAN IP
  (e.g. `http://192.168.x.x:8000/...`), persisted to `localStorage` (key: `myanmar_tool_qr_lan_url`).
- QR images are generated via the external service `api.qrserver.com`.

## External Dependencies (CDN-only)
- `https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js` — QR code rendering.
- `https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js` — `.xlsx`/`.xls` parsing for drag & drop.
- `https://api.mymemory.translated.net/...` — free JA→MY translation (Free mode).
- `https://api.anthropic.com/v1/messages` — Claude API (API mode, user-supplied key).
- `https://api.qrserver.com/v1/create-qr-code/...` — QR image generation for the "open on phone" panel.
- `https://line.me/R/share` — LINE share intent.

There is no `package.json`/`npm`/bundler — everything loads from CDNs at runtime. An internet connection is
required for translation, QR generation, and the Excel/QR libraries.

## Development Workflow

- **No build/install step.** Edit `index.html` directly.
- **Local preview:** open the file in a browser, or run `python -m http.server` from the repo root and visit
  `http://localhost:8000/`. Use a LAN IP (not `localhost`) if you need to test the "open on phone" QR flow on an
  actual mobile device.
- **No automated tests or linters** exist. Manually verify changes in a browser:
  - Both mode tabs switch correctly and toggle the right buttons/sections.
  - Free mode: paste numbered Japanese text, confirm section splitting and MyMemory translation.
  - API mode: requires a real `sk-ant-...` key to fully test; at minimum verify input validation and error
    handling paths without a network call.
  - Drag-and-drop of `.xlsx`/`.csv` files populates the textarea.
  - Output rendering, QR generation, LINE share link, and `window.print()` layout (check `@media print`).
- **Git:** commit history shows direct file uploads/renames (this originated as a Japanese-named file
  `ミャンマースタッフ用_v2.html`, renamed to `index.html`, likely for GitHub Pages hosting). Keep the filename
  `index.html` so the page can be served as a site root.

## Conventions

- **Language:** UI text, labels, alerts, and code comments are in **Japanese**. Translated output and bilingual
  labels are in **Burmese (Myanmar)**. Keep this convention — don't translate Japanese UI strings to English, and
  don't remove the Burmese labels.
- **Style:** Vanilla JS (ES6+, `async`/`await`), no frameworks, no modules — everything is global functions
  attached via inline `onclick`/event listeners. CSS uses custom properties (`:root` vars: `--primary`, `--green`,
  `--red`, `--yellow-bg`, `--border`) and BEM-ish class names (`mode-tab`, `btn-run`, `report-card`, etc.).
- **Single-file constraint:** Keep everything in `index.html`. Don't split into separate CSS/JS files unless
  explicitly requested, since the project is intentionally distributed/served as one portable file.
- **Section keys:** the canonical keys are `outing, health, room, bath, new, ongoing, other` (plus `newResident`
  only in the Claude API JSON contract — see mapping note above). Any new section must be added consistently to:
  `SECTION_PATTERNS`, `splitByHeaders` defaults, the system prompt's category list, the `map` in `renderOutput`,
  the corresponding `#out_*` / `.report-card` markup, and `shareToLine`'s `sections` array.

## Security Notes

- The Claude API key is stored **unencrypted in `localStorage`** and sent directly from the browser to
  Anthropic's API (`anthropic-dangerous-direct-browser-access: true`). This is a deliberate "bring your own key,
  client-side only" design for a small internal tool — be cautious about changing this without considering the
  security tradeoffs (key exposure to anyone with browser/devtools access on the shared device).
- `saveKey()` only checks the `sk-ant-` prefix; it does not validate the key against the API.
- No user data is sent anywhere except: MyMemory (Free mode translations), Anthropic (API mode), and
  api.qrserver.com (QR image generation, which encodes the report content in the request URL — be mindful this
  could include resident information).
