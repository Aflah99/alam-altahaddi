# عالم التحدّي

An Arabic (RTL) educational pixel-art adventure game for Grade 8 students, built for iPads and smartphones.

**Live site:** https://aflah99.github.io/alam-altahaddi/

> Status: **Task 02** — animated pixel-art start menu. Game modes, parent login and accounts are placeholders for later tasks.

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
  assets/tiles/                Pixel-art tiles (grass, dirt, sky dither, horizon)
  audio/sfx.ts                 Optional synthesised sound effects (off by default)
  components/                  Reusable pieces: Sky, Ground, Slime, StartMenu, Overlay, …
  content/startMenu.ts         Arabic menu and overlay text
  hooks/useSettings.ts         Device-saved settings (reduced motion, sound)
  screens/StartScreen.tsx      The start menu screen
  styles/global.css            Global tokens, fonts, resets
  config.ts                    Public app config + env access
  main.tsx / App.tsx           Entry point
```

Pixel art is drawn as character maps rendered to crisp SVG (`PixelSprite`), so sprites stay sharp at any screen size. All artwork is original.

### Start menu controls

- **Touch:** tap an option to select it (the heart moves), tap it again or tap «ابدأ» to open it.
- **Keyboard:** ↑/↓ change the selection, Enter opens it, Escape closes an overlay.
- **Settings:** reduced motion (defaults to the device preference) and sound effects (off by default), saved on the device.

## Deployment

Every push to `main` runs `.github/workflows/deploy.yml`: `npm ci` → type check → `vite build` → upload `dist/` → deploy to GitHub Pages.

One-time setup: **Repository → Settings → Pages → Build and deployment → Source → GitHub Actions.**

## Environment variables & security

Copy `.env.example` to `.env.local` for local values. Only `VITE_`-prefixed variables reach the browser, and **everything in the browser is public**.

GitHub Pages hosts static files only. The future backend (accounts, parent dashboards, leaderboards, textbook processing) will use **Supabase** with secure server-side functions. Never commit API keys, service-role keys, textbooks, or any student data to this repository.
