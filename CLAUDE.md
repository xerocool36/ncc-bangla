# CLAUDE.md — ncc-prep

This file provides guidance to Claude Code when working in this directory.

## What This App Is

A standalone single-page web app for studying NCC (Italian professional driver licence) exam questions. Bilingual Italian/Bengali interface with spaced repetition, practice tests, bookmarks, a personal notebook, and translation via the MyMemory API.

## Running the App

No build step. Serve from this directory:

```bash
python3 -m http.server 8000
# visit http://localhost:8000/
```

Always serve via HTTP — do not open `index.html` directly as a `file://` URL (Web Speech API and fetch require HTTP).

## Regenerating Question Data

If the source PDF changes, regenerate `questions.js`:

```bash
pip install pdfplumber
python3 extract_questions.py /path/to/ncc.pdf
```

Outputs a new `questions.js` with the global `QUESTIONS` array (515 questions across 6 categories). Do not edit `questions.js` manually.

## File Overview

| File | Lines | Role |
|------|-------|------|
| `app.js` | ~2000 | All application logic |
| `index.html` | ~615 | HTML shell; all views pre-rendered |
| `style.css` | ~1925 | All styling and animations |
| `questions.js` | auto-gen | `QUESTIONS` array, do not edit |
| `extract_questions.py` | — | PDF → questions.js converter |
| `logo.png` | — | NCC Bangla app logo (nav, home, settings) |
| `x3ro-logo.png` / `x3ro-logo-sm.png` | — | "Realizzato da" footer logo, served via `<picture>` (sm ≤640px) |
| `logo2.png` | — | Original 2.4MB X3RO source asset (kept as backup; not referenced) |

## app.js Module Map

| # | Section | Lines | Responsibility |
|---|---------|-------|---------------|
| 1 | Constants | 8–28 | Category list, localStorage keys |
| 2 | State | 30–42 | Single `state` object shared by all modules |
| 3 | Storage | 45–117 | Read/write progress, bookmarks, settings, notes, translation cache |
| 4 | Translation | 118–185 | Async Italian→Bengali via MyMemory API; localStorage cache |
| 5 | TTS | 186–268 | Web Speech API; auto-selects best Italian voice; configurable rate |
| 6 | Spaced Repetition | 269–309 | Queue builder: unseen → wrong → least-recently-seen |
| 7 | Study Mode Controller | 310–671 | Question display, answer tracking, session stats, result screen |
| 8 | Practice Test Controller | 672–1120 | Timed exam mode, back navigation, skipped-question modal, scoring |
| 9 | Celebration Helpers | 1121–1170 | `fireConfetti()`, `showTrophyPopup()`, `showBadges()` |
| 10 | Stats Module | 1171–1223 | Per-category accuracy, hardest questions, recent wrong |
| 11 | UI Module | 1224–1525 | View switching, modals, toasts, home/stats/bookmarks refresh |
| 12 | Event Wiring | 1526–1813 | All DOM event listeners registered here |
| 13 | App Init | 1814+ | DOMContentLoaded: TTS init, wireEvents, initial view |

## Key Features & Where They Live

### Study Mode (`studyCtrl`, lines 310–671)
- Spaced repetition or sequential queue, filterable by category
- Per-session stat tracking (`sessionStats.total/correct/wrong`)
- **Exit button** (`#btn-exit-study`): 0 answers → toast+home; answers present → confirm modal → `showResult()`
- `showResult()`: animated SVG ring, score counter, stat cards, wrong list, confetti/trophy/badge celebrations
- Queue exhaustion automatically calls `showResult()` (no more endless loop)

### Practice Test (`testCtrl`, lines 672–1120)
- Setup: category, question count (10/20/30/50/all), optional 60s/question timer
- **Multi-category pool**: `state.testConfig.categories` (string[]) overrides `category` when set; pool = `QUESTIONS.filter(q => categories.includes(q.category))`. Used by the multi-chapter quiz.
- **Back button** (`#btn-test-prev`): navigate to any previous question; answered questions restore their state (locked options + feedback shown)
- **Skipped-question modal** (`checkSkippedBeforeScore()`): fires at end of test if any answers are `null`; offers "← Rispondi" (jump to first skipped) or "Termina lo stesso" (show score)
- **Exit button** (`#btn-exit-test`): confirm modal → straight to score (bypasses skipped check)
- `showScore()`: animated percentage counter, pass/fail at 70%, wrong answer list. Each wrong row shows the user's pick (red ✗) or "⊘ Saltata" (muted), then the correct answer (green ✓).

### Capitoli (`#view-chapters`, `refreshChapters()` ~line 1478)
- Default mode: tap a chapter card → starts a single-chapter quiz with all its questions, no timer.
- **Quiz multi-capitolo** button toggles `state.chaptersSelectMode`. In selection mode the view gets `.selecting`: cards become tappable toggles, a sticky bottom bar appears with summary, "Tutti"/"Pulisci", a count picker (20/40/Tutte), and a "Inizia quiz" button.
- Selection persists across visits via `LS.CHAPTER_SEL` (`storage.getChapterSelection`/`saveChapterSelection`); mode is reset off whenever the chapters view is opened.
- Launching: sets `state.testConfig = { categories, count, timer:false, source:'chapters' }` and calls `testCtrl.start()`.

### Result Screen (study mode only, `#study-result`)
- Emoji: 🏆 ≥90%, 🌟 ≥70%, 💪 ≥50%, 📚 <50%
- SVG progress ring with colour-coded stroke (green/yellow/red)
- Ring center: HTML `<div class="ring-center-fill">` (not SVG fill — Safari compat)
- Animated stat cards: Viste / Corrette / Errate with icons
- Celebrations: confetti ≥60%, trophy popup ≥80%, badge toasts always

### Notebook (`#view-notebook`)
- Personal notes per question or free-form
- Draggable floating note button (`makeDraggableNoteBtn()`)
- Position persisted in `localStorage` key `noteBtn_pos`

### App Footer (`.app-footer`, end of `index.html`)
- "Realizzato da [X3RO Automations]" — globally visible, links to `https://x3roautomations.it` (target="_blank").
- `<picture>` swaps `x3ro-logo-sm.png` (220px wide, ~24KB) on ≤640px viewports for `x3ro-logo.png` (400px wide, ~68KB) elsewhere.
- Mobile layout: `padding-bottom: calc(var(--bottom-nav-h) + 14px)` keeps it clear of the fixed bottom nav.

## Key Design Patterns

- **No framework, no bundler** — pure ES5-compatible vanilla JS, `<script>` tags only.
- **Global state** — single `state` object; all modules read/write it.
- **Views** — pre-rendered `<section>` elements toggled by `ui.showView(name)`. Never destroyed/recreated.
- **localStorage only** — persistence keys defined as constants in `LS` object (lines 21–28).
- **Translation is lazy** — Italian shown immediately; Bengali fetched async and cached.
- **Cache-busting** — script tags use `?v=N` query strings (currently `?v=12`); increment when deploying breaking JS/HTML changes.

## Modal System

Single shared modal (`#modal-overlay`). Two entry points:
- `ui.confirm(msg, onConfirm)` — standard confirm/cancel with default labels
- `ui.confirmCustom(msg, confirmLabel, cancelLabel, onConfirm, onCancel)` — custom button text

## CSS Animations Available for Reuse

| Name | File location | Use |
|------|--------------|-----|
| `viewEnter` | style.css ~line 97 | Fade+slide up for new views/cards |
| `optionSlideIn` | style.css ~line 600 | Staggered option entrance |
| `correctBounce` | style.css ~line 666 | Correct answer feedback |
| `wrongShake` | style.css ~line 673 | Wrong answer feedback |
| `timerUrgent` | style.css ~line 840 | Pulsing timer at ≤10s |
| `emojiBounce` | style.css ~line 1583 | Result emoji entrance |
| `confettiFall` | style.css ~line 1727 | Confetti particles |
| `trophyBounce` | style.css ~line 1749 | Trophy popup |

## Git / Deployment

- Active dev branch: `dev`
- GitHub: `xerocool36/ncc-prep`
- GitHub Pages (main branch): `https://xerocool36.github.io/ncc-prep/`
- Pages is built from `main`; merge `dev → main` to deploy publicly

## Mandatory Registration Splash (added 2026-05-02, n8n migration 2026-05-04)

Every visitor must register (or "log in" by email) before the app shell renders. Lead-generation play. Captures **name, email, phone, marketing consent**. Per-device localStorage flag (`ncc_registered=true`) skips the splash on return visits.

### Files

| File | Role |
|------|------|
| `index.html` | `#splash-overlay` markup + **inlined splash JS** (~lines 670-880); loaded BEFORE `app.js` |
| `privacy.html` | GDPR Italian privacy policy linked from the splash + footer |
| `email-templates/welcome.html` | Brevo HTML template (paste manually into Brevo dashboard) — bilingual IT+BN, vibrant editorial design |
| `supabase/migrations/001_ncc_bangla_registrations.sql` | Table definition (already applied to prod) |
| `n8n/ncc-registrations.json` | n8n workflow JSON (re-export here after every UI edit) — current public POST endpoint |
| `n8n/README.md` | Webhook URL, required credentials, re-import instructions |

### Architecture (current — n8n)

```
Browser splash → POST https://n8n.x3roautomations.it/webhook/ncc-register
                  ├── honeypot tripped         → {ok:true}
                  ├── action: "lookup"         → Supabase get → {exists: bool}
                  ├── action: "register"       → validate → Supabase get-by-email
                  │                                ├── exists  → bump last_seen → {exists:true}
                  │                                └── new     → Supabase insert → {exists:false, registered:true}
                  │                                              ↓ (after respond, fire-and-forget)
                  │                                              Brevo add contact → Brevo send welcome
                  └── unknown action           → {error:"azione non valida"} 400
```

n8n workflow ID: `cixOQc0zzz2rFfO7`. The register branch does a pre-flight Get-by-email rather than catching Postgres `23505` after a failed insert — cleaner than relying on n8n's inconsistent `error?.code` exposure for failed nodes.

### Supabase

- **Shared with `review-management`** (project `drypjcgloclnxayfzdsz`). Will move to a dedicated project when NCC has its first paying client (per `agency-ops/ncc-bangla-supabase` memory).
- Table: `ncc_bangla_registrations` (prefixed for namespace isolation). RLS enabled.
- n8n credential `supabase dhaka` (id `FjXknluDwpYHQYoI`) is reused — same project, same service role key.

### Brevo

- Contact list ID: **3** ("NCC Bangla — Iscritti")
- Welcome template ID: **1** ("NCC Bangla — Benvenuto") — paste contents of `email-templates/welcome.html` into Brevo's HTML editor
- API key in `.env` (`BREVO_API_KEY`, scoped to Transactional + Contacts only)
- n8n credential `Brevo API` (id `KiG1k1GIyjUsa9z5`) — `httpHeaderAuth` with header `api-key`
- List ID `3` and template ID `1` are **hardcoded in workflow nodes**, not pulled from `$env` — the user's n8n instance does not resolve `$env.*` (per review-management Phase 1 notes)

### Bot defense

- **Honeypot field only** (input named `company_url` hidden via CSS). Sufficient for a free study tool.
- The frontend strict-checks the success response (`data.registered === true || data.exists === true`) before dismissing the splash — closes a 1Password autofill bypass where the password manager fills the honeypot and the backend silently 200's with `{ok:true}`.
- Turnstile was removed (commit `13236c3`); the Cloudflare site key in `.env` is unused. To re-enable, restore the widget in index.html + add a Turnstile-verify Code node before the Switch in n8n.

### Local dev

- `python3 -m http.server 8000` — splash form-submit hits the LIVE n8n webhook (no localhost mock); CORS allows `http://localhost:8000`, `http://127.0.0.1:8000`, and `https://xerocool36.github.io`.
- For aggressive cache problems during dev, use the no-cache wrapper at `/tmp/ncc_serve_nocache.py` (sends `Cache-Control: no-store` headers).
- Cache-bust strategy: bump `?v=N` query strings on `style.css`, `app.js`, `questions.js` when shipping breaking changes. Currently `style.css?v=5`, `app.js?v=16`, `questions.js?v=12`. The inline splash also has its own `SPLASH_VERSION` constant (currently 6) — bump it AND the visible `v6` stamp top-right of the splash card serves as a deploy-confirmation signal for users reporting bugs.
- GitHub Pages serves with `cache-control: max-age=600` so users with old HTML cached take up to 10 min to revalidate without a hard reload.

### CSS gotcha (subtle bug fixed 2026-05-04)

`#splash-overlay { display: flex }` (ID-selector specificity 0,1,0,0) wins the cascade against the user agent `[hidden] { display: none }` (0,0,1,0). Without an explicit `#splash-overlay[hidden] { display: none }` rule, setting `el.hidden = true` in JS does not visually hide the element. Two days of "stuck on Inviando" reports were caused by this missing one-line CSS rule. **Always pair an `#id { display: ... }` rule with a matching `#id[hidden]` override** when JS will toggle visibility via the `hidden` attribute.

### Known issues / open follow-ups

_(none open as of 2026-05-04)_
