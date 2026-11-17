# عالم التحدّي

An Arabic (RTL) educational pixel-art adventure game for Grade 8 students, built for iPads and smartphones.

**Live site:** https://aflah99.github.io/alam-altahaddi/

> Status: **Task 04** — start menu, character selection, lobby, adventure map and a playable side-scrolling world with a subject portal. Lessons and quizzes arrive in Task 05.

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
| `npm test`          | Unit tests (Vitest): physics, camera, routes |

## Project structure

```
.github/workflows/deploy.yml   GitHub Pages deployment
public/                        Files copied as-is (favicon)
src/
  assets/tiles/                Pixel-art tiles (grass, dirt, path, sky dither, horizon)
  audio/sfx.ts                 Optional synthesised sound effects (off by default)
  characters/                  Character roster data, CharacterSprite (shared animations), CharacterPreview
  components/                  Shared UI: Sky, Ground, StartMenu, Overlay, SettingsPanel, PixelSprite, …
  content/                     Arabic text for menus, overlays and the lobby
  hooks/useSettings.ts         Device-saved settings (reduced motion, sound)
  lobby/                       Lobby building sprites and the LobbyPlace button
  navigation/useHashRoute.ts   Hash routes: #/character, #/lobby, #/map, #/world/<subject>[/chapters]
  player/                      Local guest profile (character + nickname) and the nickname field
  screens/                     StartScreen, CharacterSelectScreen, LobbyScreen
  styles/global.css            Global tokens, fonts, resets
  world/
    config/subjects.ts         Subjects on the map (add a subject here — no engine changes)
    config/levels.ts           Level layouts in world units (blocks, platforms, decor, portal)
    engine/                    Physics, collisions, camera, viewport, game loop, keyboard (+ unit tests)
    components/                WorldScene, PortalGate, TouchControls, PauseMenu
    AdventureMapScreen.tsx     خريطة المغامرة
    WorldScreen.tsx            The playable world
    ChapterSelectScreen.tsx    Chapters behind a portal (filled in Task 05)
```

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

## Deployment

Every push to `main` runs `.github/workflows/deploy.yml`: `npm ci` → type check → `vite build` → upload `dist/` → deploy to GitHub Pages.

One-time setup: **Repository → Settings → Pages → Build and deployment → Source → GitHub Actions.**

## Environment variables & security

Copy `.env.example` to `.env.local` for local values. Only `VITE_`-prefixed variables reach the browser, and **everything in the browser is public**.

GitHub Pages hosts static files only. The future backend (accounts, parent dashboards, leaderboards, textbook processing) will use **Supabase** with secure server-side functions. Never commit API keys, service-role keys, textbooks, or any student data to this repository.
