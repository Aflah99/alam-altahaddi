# عالم التحدّي

An Arabic (RTL) educational pixel-art adventure game for Grade 8 students, built for iPads and smartphones.

**Live site:** https://aflah99.github.io/alam-altahaddi/

> Status: **Task 06** — start menu, character selection, lobby, adventure map, a playable side-scrolling world, textbook-based quiz missions (ساحة التحدّي) for «ديني قيمي», and an XP/coin reward system with a pixel-art shop (المتجر) and locker (الخزانة).

## Tech stack

- React 19 + TypeScript
- Vite (base path `/alam-altahaddi/` for GitHub Pages)
- Plain modern CSS (no UI framework)
- Cairo font, self-hosted via `@fontsource/cairo`
- Node.js 22 LTS (see `.nvmrc`), npm

## Getting started

```bash
nvm use            # Node 22
npm install
npm run dev        # http://localhost:5173/alam-altahaddi/
```

| Script              | What it does                          |
| ------------------- | ------------------------------------- |
| `npm run dev`       | Start the dev server                  |
| `npm run typecheck` | Type-check the project (`tsc -b`)     |
| `npm run build`     | Type-check and build into `dist/`     |
| `npm run preview`   | Serve the production build locally    |
| `npm run lint`      | Lint with oxlint                      |
| `npm test`          | Unit tests (Vitest): physics, camera, routes, quiz engine, progress, rewards/shop/locker, **question-bank validation** |
| `npm run report:coverage` | Regenerate the question-bank coverage report in `docs/question-bank/` |

## Project structure

```
.github/workflows/deploy.yml   GitHub Pages deployment
public/                        Files copied as-is (favicon)
src/
  assets/tiles/                Pixel-art tiles (grass, dirt, path, sky dither, horizon)
  audio/sfx.ts                 Optional synthesised sound effects (off by default)
  characters/                  Character roster, CharacterSprite (shared animations), CharacterPreview,
                               cosmetics.ts (layered cosmetic art + per-character anchors)
  components/                  Shared UI: Sky, Ground, StartMenu, Overlay, SettingsPanel, PixelSprite, …
  content/                     Arabic text for menus, overlays and the lobby
  economy/
    config.ts                  Reward values, pass threshold, XP-per-level steps (edit here)
    catalog.ts                 Shop items, categories and prices (edit here)
    wallet.ts                  Idempotent reward/purchase ledger, equip, validation, storage (+ tests)
    useWallet.ts, ui/          React hook; coin sprite and level bar
  shop/                        ShopScreen (المتجر), LockerScreen (الخزانة)
  hooks/useSettings.ts         Device-saved settings (reduced motion, sound)
  lobby/                       Lobby building sprites and the LobbyPlace button
  navigation/useHashRoute.ts   Hash routes: #/character, #/lobby, #/shop[/category], #/locker, #/map, #/world/<subject>[/chapters], #/quiz/<subject>/<lesson>/<n>
  player/                      Local guest profile (id, character, nickname) and the nickname field
  questions/
    types.ts                   Typed question bank: Bank → Unit → Lesson → Question
    data/<bank-id>/*.json      Authoring files, one per lesson (adapted MCQs, page refs, exclusions)
    banks/                     One small file per bank that loads its JSON folder
    normalize.ts               Authoring files → stable-ID, approved-only bank
    validate.ts, arabic.ts     Validation pipeline with Arabic-aware text comparison (run by npm test)
  quiz/
    engine.ts                  Pure mission state machine (hint, retry, reveal, lock, summary)
    progress.ts                Local learning progress per profile (Supabase-ready shape)
    LessonSelectScreen.tsx     Units, lessons and missions behind a portal
    QuizScreen.tsx             ساحة التحدّي
    MissionResults.tsx, MistakeReview.tsx
  screens/                     StartScreen, CharacterSelectScreen, LobbyScreen
  styles/global.css            Global tokens, fonts, resets
  world/
    config/subjects.ts         Subjects on the map (add a subject here — no engine changes)
    config/levels.ts           Level layouts in world units (blocks, platforms, decor, portal)
    engine/                    Physics, collisions, camera, viewport, game loop, keyboard (+ unit tests)
    components/                WorldScene, PortalGate, TouchControls, PauseMenu
    AdventureMapScreen.tsx     خريطة المغامرة
    WorldScreen.tsx            The playable world
```
docs/question-bank/            Generated coverage report per bank
scripts/coverage-report.mjs    Coverage report generator

Pixel art is drawn as character maps rendered to crisp SVG. Every character shares one sprite system (`CharacterSprite`): idle breathing with a small hop, blinking, glancing, and a celebration (double hop, ^ ^ eyes, sparkles). All artwork is original.

### Flow

Start screen → «مغامرة فردية» → character selection (اختر شخصيتك) → player lobby (ساحة اللاعب).

- **Character selection:** arrows, swipe or ←/→ keys to browse; tap the character to make it celebrate; choose a nickname (or «اقتراح» for an anonymous one); «ابدأ المغامرة» confirms; Escape or «رجوع» goes back.
- **Lobby:** the chosen character on a pixel village street. خريطة المغامرة, الخزانة, المتجر and المتصدرون open "coming later" panels. The player can change character or return to the menu.
- **Profile storage:** the character and nickname are kept in `localStorage` as a `local-guest` profile. It is **not** an account, is not synced, and contains no personal information. The shape (`characterId`, `nickname`) is meant to move onto real student accounts later.

### The adventure world

Lobby → خريطة المغامرة → «ادخل العالم» → a side-scrolling meadow. The level is gentle (low steps, optional platforms, no enemies or pits) and runs right → left, following Arabic reading order, towards the glowing «ديني قيمي» portal.

- **Engine:** fixed 60 Hz timestep (frame-rate independent, clamped after tab switches), axis-separated box collisions with one-way platforms, coyote time and jump buffering, a dead-zone camera with restrained smoothing, parallax hills.
- **Scale:** one logical coordinate system (1 unit = 1 sprite pixel) scaled to the screen; the ground line sits above the touch controls, and portrait keeps at least 124 units of width visible.
- **Rendering:** React draws the level once; the game loop moves the player and camera by writing transforms, so play causes no React re-renders.
- **Portal:** walk up to it and press «دخول» / E / Enter, or tap the portal directly. The pause menu also offers a direct link (no precise movement needed).

### Controls

| | Touch | Keyboard |
| --- | --- | --- |
| Move | ◀ ▶ (left thumb), hold to walk | ← → or A D |
| Jump | «قفز» (right thumb) — works while holding a direction | ↑, W or Space |
| Enter portal | «دخول» when near, or tap the portal | E or Enter |
| Pause | «إيقاف» | Escape |

Start menu: tap an option to select it, tap again or «ابدأ» to open it (↑/↓ and Enter on a keyboard). Character selection: arrows, swipe or ←/→, Enter to confirm, Escape to go back.

Settings: reduced motion (defaults to the device preference) and sound effects (off by default), saved on the device and available from the pause menu.

### Quiz missions (ساحة التحدّي)

World portal → lesson selection (units and lessons, each split into missions of up to 10 questions) → quiz arena → results.

- Each question has four options and exactly one correct answer. Options are shuffled per mission.
- **First wrong answer:** a hint and one more attempt. **Second wrong answer:** the correct answer is revealed. Every answer then shows «شرح الإجابة» and the source page.
- Answers lock after confirming; double taps cannot skip a question; there are no timers. Leaving mid-mission asks for confirmation.
- **Results:** first-try correct, correct after a hint/retry, revealed, and accuracy; buttons «مراجعة الأخطاء», «إعادة التحدّي», «اختيار درس آخر», «العودة إلى العالم». The review shows the student's answer, the correct answer, the explanation and the page.
- **Progress** (best score per mission, answered and missed questions, last lesson) is saved in `localStorage` under the local profile id. It is not synced; the record shape is designed to move to Supabase later.
- Returning to the world places the player beside the portal.

### Rewards, shop and locker

Students earn XP and coins **only by answering real questions correctly** — no random chance, no real-money purchases.

| Action | XP | Coins |
| --- | ---: | ---: |
| Correct on the first attempt without a hint | 10 | 10 |
| Correct after a hint or on the retry | 5 | 5 |
| Not answered correctly | 0 | 0 |
| First completion of a mission with ≥ 70% first-attempt accuracy | 20 | 20 |

- **Anti-farming:** every reward is a ledger transaction with a deterministic id (`q:<questionId>`, `m:<bank>:<mission>`, `buy:<item>`). Each question pays once per local profile, each mission bonus once; replays, double taps and reloads cannot add anything. Missions can still be repeated for revision.
- **Levels:** level *n* → *n*+1 needs 50, 75, 100, … XP (`economy/config.ts`). XP is permanent; coins are spent in the shop.
- **Results screen:** correct answers, XP and coins earned, current level with an animated progress bar, balance, and an explanation when nothing new was earned. Rewards start with new attempts; Task 05 history is not converted into rewards.
- **Shop (المتجر):** 15 original items — 2 unlockable characters (البومة الحكيمة، السلحفاة الصبورة), 3 clothing items, 4 hats, 3 accessories, 3 bags — priced 50–200 coins. Purchases are confirmed; duplicate purchases and negative balances are impossible.
- **Locker (الخزانة):** equip/unequip one item per slot and switch between unlocked characters. Items are drawn inside the character's own pixel grid (layers behind/over the body, clipped to the silhouette), so they stay aligned in the lobby, quiz arena, map and world, including walking, jumping and celebrations. Items that do not fit a character (glasses on the robot's screen, a scarf on the turtle) are marked «لا يناسب» and never drawn.
- **Storage:** `localStorage` key `alam-altahaddi:wallet:v1:<profile id>` (the stable profile id, not the nickname). Data is validated on load; unreadable data is copied to a `:backup` key instead of being discarded. Learning progress from Task 05 is untouched.
- **Limitations:** this is browser-local data. The device owner can edit or delete it, so it is **not** cheat-proof and must never be used for competitive leaderboards. The ledger shape is designed to be issued and verified by server-side functions later.

### Question content

The «ديني قيمي» bank (600 published questions, 27 lessons in 4 units, from all 121 pages) was adapted by hand from the Grade 8 revision booklet (provided as two PDF files, pages 1–93 and 94–121). Only adapted multiple-choice questions, short hints and explanations are published — **the booklet itself is not in this repository** (`*.pdf` is git-ignored) and is not needed to build or deploy. Facts come only from the booklet; every question carries its PDF page number. Source questions that were ambiguous, wrong in the source, open-ended or image-based were excluded and recorded with a reason. See [the coverage report](docs/question-bank/religion-values-g8-coverage.md) and the [unresolved academic review items](docs/question-bank/academic-review-items.md) (pages 26, 82, 119 and the Umrah ruling) awaiting teacher review.

The bank is a static file bundled at build time. There are no runtime AI or API calls.

**Adding a book:** create `src/questions/data/<bank-id>/` with one JSON file per lesson (same shape as the existing files; option 1 is the correct answer), add a 5-line loader in `src/questions/banks/`, register it in `src/quiz/useQuestionBank.ts`, and set `bankId` on the subject in `src/world/config/subjects.ts`. `npm test` validates the new bank automatically. No engine changes are needed.

## Deployment

Every push to `main` runs `.github/workflows/deploy.yml`: `npm ci` → type check → unit tests → `vite build` → upload `dist/` → deploy to GitHub Pages.

One-time setup: **Repository → Settings → Pages → Build and deployment → Source → GitHub Actions.**

## Environment variables & security

Copy `.env.example` to `.env.local` for local values. Only `VITE_`-prefixed variables reach the browser, and **everything in the browser is public**.

GitHub Pages hosts static files only. The future backend (accounts, parent dashboards, leaderboards, textbook processing) will use **Supabase** with secure server-side functions. Never commit API keys, service-role keys, textbooks, or any student data to this repository.
