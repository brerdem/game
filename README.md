# Island FPS (Three.js + Vite)

A first-person island explorer: collect every diamond, bounce on trampolines, and wander a forest of real CC0 plant models.

**Play it live:** https://brerdem.github.io/game/

![Island FPS screenshot](screenshot.png)

## Controls

- **Click** to start / capture the mouse
- **Mouse** to look around
- **WASD** or **arrow keys** to move
- **Shift** to sprint
- **Space** to jump
- **Esc** to pause / release the mouse
- Walk into a **diamond** to collect it
- Land on a **trampoline** for a super jump (the only way to reach the high gems)

The HUD shows gems collected, score, and a timer that starts on the first click and pauses while paused. Collect them all to win.

## Develop

- `npm run dev` – local dev server
- `npm run build` – Vite build to `dist/` (`base: './'`, ready for GitHub Pages)
- `node scripts/check.mjs 'http://127.0.0.1:4173/?debug' screenshot.png` – headless check + screenshot
- `node scripts/physics.mjs` – ramp / jump / shoreline physics test

URL flags: `?debug` (hide overlay, keyboard works without pointer lock), `?seed=N`, `?yaw=`, `?pitch=`

## Credits

Vegetation models are CC0 (Kenney Nature Kit and Quaternius Ultimate Nature Pack). See [public/models/CREDITS.md](public/models/CREDITS.md).
