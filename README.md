# Island FPS (Three.js + Vite)

A first-person island explorer built with Three.js and Vite.

**Play it live:** https://brerdem.github.io/game/

![Island FPS screenshot](screenshot.png)

## Controls

- **Click** to start / capture the mouse
- **Mouse** to look around
- **WASD** or **arrow keys** to move
- **Shift** to sprint
- **Space** to jump
- **Esc** to pause / release the mouse

## Develop

- `npm run dev` – local dev server
- `npm run build` – builds a single self-contained file: `dist/index.html` (double-click to play)
- `node scripts/check.mjs 'http://127.0.0.1:4173/?debug' screenshot.png` – headless check + screenshot
- `node scripts/physics.mjs` – ramp / jump / shoreline physics test

URL flags: `?debug` (hide overlay, keyboard works without pointer lock), `?seed=N`, `?yaw=`, `?pitch=`
