# عالم التحدّي

An Arabic (RTL) educational pixel-art adventure game for Grade 8 students, built for iPads and smartphones.

**Live site:** https://aflah99.github.io/alam-altahaddi/

> Status: **Task 03** — start menu, character selection and player lobby. Quizzes, accounts, coins and leaderboards are placeholders for later tasks.

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
  navigation/useHashRoute.ts   Hash routes: #/character, #/lobby (work on GitHub Pages and survive reloads)
  player/                      Local guest profile (character + nickname) and the nickname field
  screens/                     StartScreen, CharacterSelectScreen, LobbyScreen
  styles/global.css            Global tokens, fonts, resets
```

Pixel art is drawn as character maps rendered to crisp SVG. Every character shares one sprite system (`CharacterSprite`): idle breathing with a small hop, blinking, glancing, and a celebration (double hop, ^ ^ eyes, sparkles). All artwork is original.

### Flow

Start screen → «مغامرة فردية» → character selection (اختر شخصيتك) → player lobby (ساحة اللاعب).

- **Character selection:** arrows, swipe or ←/→ keys to browse; tap the character to make it celebrate; choose a nickname (or «اقتراح» for an anonymous one); «ابدأ المغامرة» confirms; Escape or «رجوع» goes back.
- **Lobby:** the chosen character on a pixel village street. خريطة المغامرة, الخزانة, المتجر and المتصدرون open "coming later" panels. The player can change character or return to the menu.
- **Profile storage:** the character and nickname are kept in `localStorage` as a `local-guest` profile. It is **not** an account, is not synced, and contains no personal information. The shape (`characterId`, `nickname`) is meant to move onto real student accounts later.

### Controls

- **Touch:** tap an option to select it, tap again or «ابدأ» to open it.
- **Keyboard:** ↑/↓ and Enter on the start menu; ←/→ and Enter on character selection; Escape goes back or closes a panel.
- **Settings:** reduced motion (defaults to the device preference) and sound effects (off by default), saved on the device.

## Deployment

Every push to `main` runs `.github/workflows/deploy.yml`: `npm ci` → type check → `vite build` → upload `dist/` → deploy to GitHub Pages.

One-time setup: **Repository → Settings → Pages → Build and deployment → Source → GitHub Actions.**

## Environment variables & security

Copy `.env.example` to `.env.local` for local values. Only `VITE_`-prefixed variables reach the browser, and **everything in the browser is public**.

GitHub Pages hosts static files only. The future backend (accounts, parent dashboards, leaderboards, textbook processing) will use **Supabase** with secure server-side functions. Never commit API keys, service-role keys, textbooks, or any student data to this repository.
