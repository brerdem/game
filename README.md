# Island FPS (Three.js + Vite)

A first-person island explorer: collect every ruby, bounce on trampolines, and wander a forest of procedural trees on two islands joined by a vine bridge.

**Play it live:** https://brerdem.github.io/game/

**WebGPU build:** https://brerdem.github.io/game/game-gpu/ (falls back to WebGL2 when WebGPU is unavailable)

![Island FPS screenshot](screenshot.png)

## Controls

- **Click** to start / capture the mouse
- **Mouse** to look around
- **WASD** or **arrow keys** to move
- **Shift** to sprint
- **Space** to jump
- **Esc** to pause / release the mouse
- Walk into a **ruby** to collect it
- Land on a **trampoline** for a super jump (the only way to reach the high gems)

The HUD shows gems collected (`n / total`), score, and a timer that starts on the first click and pauses while paused. Collect them all to win. A smaller second island sits about 30 m of water away; climb the hill and walk the rope bridge (falling off drops you in the water and respawns you on shore). Seagulls wander high above. A loading screen comes first, then a live scenic landing screen with Play and Exit.

## Develop

- `npm run dev` – local WebGL dev server
- `npm run dev:gpu` – local WebGPU dev server
- `npm run build` – Vite build of both the WebGL site (`dist/`) and the WebGPU sub-app (`dist/game-gpu/`)
- `node scripts/check.mjs 'http://127.0.0.1:4173/?debug' screenshot.png` – headless WebGL check + screenshot
- `node scripts/check-gpu.mjs` – headless WebGPU (or WebGL2 fallback) check
- `node scripts/physics.mjs` – ramp / jump / shoreline physics test

URL flags: `?debug` (hide overlay, keyboard works without pointer lock), `?low` (fewer blades/trees, lower shadows), `?seed=N`, `?yaw=`, `?pitch=`

Quality also drops automatically if the frame rate stays below ~26 fps.

## Credits

See [CREDITS.md](CREDITS.md) for libraries, textures, and licenses.
