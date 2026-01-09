# MangaNano — Gemini 3 Image Translator
Batch-translate manga pages in the browser. Drag in pages, pick a target language, and let Gemini 3 handle recognition and inpainting. UI supports English/Chinese.

## Features
- Batch upload with drag-and-drop, live per-page status, and bulk clear
- Target languages: Chinese, English, Spanish, French, Japanese
- UI language toggle (English ⇄ Chinese)
- Local API key storage (never sent to a server you don’t control)
- Download all translated pages as a ZIP
- Error surfacing and recovery per page

## How it works
1) **Recognize + translate text:** `gemini-3-flash-preview` extracts text and provides reference translations.
2) **Inpaint the page:** `gemini-3-pro-image-preview` applies translations back into the page, preserving artwork and typography. Chinese uses a specialized prompt.

## Requirements
- Node.js 18+ (for Vite/TypeScript)
- Google Gemini API key with access to `gemini-3-flash-preview` and `gemini-3-pro-image-preview`

## Quick start
1) Install dependencies: `npm install`
2) Start dev server: `npm run dev` (Vite default: http://localhost:5173)
3) In the app, click **Configure API Key**, paste your Gemini API key, and save (stored in `localStorage` under `gemini_api_key`).
4) Add manga pages (drag/drop or file picker).
5) Choose a target language and hit **Start Batch Translation**.
6) When done, **Download ZIP** to grab all translated pages.

## Tips
- If you see "API_KEY_ERROR", re-enter a valid key with the required model access.
- Finished pages stay cached in memory; use **Clear All** to reset the queue.
- You can switch UI language anytime via the EN/ZH toggle.

## Scripts
- `npm run dev` — start the Vite dev server
- `npm run build` — production build
- `npm run preview` — preview the production build

## Notes
- All processing happens client-side using the Gemini API; your key is stored only in the browser.
- Image outputs keep the original aspect ratio with a 3:4 config and 1K size as defined in the generation call.
