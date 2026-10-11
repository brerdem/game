# Credits

Third-party libraries and assets used by Island FPS. Licenses are included for provenance.

## Code

- **three.js** (r170) — MIT License — https://github.com/mrdoob/three.js  
  Includes `Sky`, `Water`, `RoomEnvironment`, and `BufferGeometryUtils` from the examples addons.
- **@dgreenheck/ez-tree** (1.1.0) — MIT License — https://github.com/dgreenheck/ez-tree  
  Procedural trees with bark and leaf textures. Bundled bark maps include Poly Haven `bark_brown_02` (CC0).
- **simplex-noise** — MIT License — https://github.com/jwagner/simplex-noise.js
- **Vite** — MIT License — https://vitejs.dev

## Terrain / water textures (CC0)

Downloaded from [ambientCG](https://ambientcg.com) (CC0 1.0 Universal), compressed to 1K WebP:

- `public/textures/grass/` — Grass001
- `public/textures/dirt/` — Ground033
- `public/textures/rock/` — Rock020
- `public/textures/sand/` — Ground003 (used as beach sand)

Water normal map:

- `public/textures/waternormals.jpg` — three.js examples (`examples/textures/waternormals.jpg`), MIT

## Fonts

- **Luckiest Guy** — SIL Open Font License 1.1 — designed by Astigmatic, via [Google Fonts](https://fonts.google.com/specimen/Luckiest+Guy) / [Fontsource](https://fontsource.org/fonts/luckiest-guy). Self-hosted as `public/fonts/luckiest-guy.woff2`.

## Previously used (no longer shipped)

Kenney Nature Kit and Quaternius Ultimate Nature Pack (both CC0) were used in an earlier low-poly version and have been replaced by ez-tree plus GPU grass.
