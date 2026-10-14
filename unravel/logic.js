/** Pure rules for Unravel. No DOM. */

export const PALETTE = ['#e23d4a', '#f08a24', '#f2c14e', '#2f9e62', '#2f8fd6', '#7b4ec8'];

export const SPRITES = [
  {
    name: 'Heart',
    colors: 3,
    art: [
      '.11211.',
      '1112211',
      '1113311',
      '1113311',
      '.11111.',
      '..111..',
      '...1...',
    ],
  },
  {
    name: 'Shroom',
    colors: 3,
    art: [
      '..222..',
      '.22322.',
      '2222222',
      '2221222',
      '..111..',
      '..111..',
      '.11111.',
    ],
  },
  {
    name: 'House',
    colors: 3,
    art: [
      '...2...',
      '..222..',
      '.22222.',
      '2222222',
      '.11111.',
      '.11311.',
      '.11311.',
    ],
  },
  {
    name: 'Tree',
    colors: 3,
    art: [
      '..222..',
      '.22222.',
      '2222222',
      '.22222.',
      '..111..',
      '..131..',
      '.11111.',
    ],
  },
  {
    name: 'Ghost',
    colors: 2,
    art: [
      '.22222.',
      '2222222',
      '2211221',
      '2222222',
      '2222222',
      '2222222',
      '2.2.2.2',
    ],
  },
  {
    name: 'Fish',
    colors: 3,
    art: [
      '..222..',
      '.22232.',
      '2222233',
      '2212223',
      '2222233',
      '.22232.',
      '..222..',
    ],
  },
  {
    name: 'Cat',
    colors: 3,
    art: [
      '3.111.3',
      '3311133',
      '3111113',
      '3121213',
      '3111113',
      '.11211.',
      '..111..',
    ],
  },
  {
    name: 'Gem',
    colors: 3,
    art: [
      '..121..',
      '.12221.',
      '1223221',
      '1233321',
      '1223221',
      '.12221.',
      '..111..',
    ],
  },
  {
    name: 'Flower',
    colors: 4,
    art: [
      '.3.3.3.',
      '3333333',
      '.34243.',
      '1144411',
      '1144411',
      '.14141.',
      '..111..',
    ],
  },
  {
    name: 'Rocket',
    colors: 4,
    art: [
      '..44...',
      '.4224..',
      '.4114..',
      '3411143',
      '3411143',
      '.4114..',
      '..4.4..',
    ],
  },
  {
    name: 'Crab',
    colors: 4,
    art: [
      '3.222.3',
      '3322233',
      '3221223',
      '2222222',
      '.24442.',
      '4.222.4',
      '4.....4',
    ],
  },
  {
    name: 'Owl',
    colors: 5,
    art: [
      '.55555.',
      '5522255',
      '5211125',
      '5213125',
      '5222225',
      '.54445.',
      '..5.5..',
    ],
  },
];

for (const sprite of SPRITES) {
  const width = sprite.art[0].length;
  if (sprite.art.some((row) => row.length !== width)) {
    throw new Error(`Sprite ${sprite.name} has uneven rows`);
  }
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function cloneGrid(grid) {
  return grid.map((row) => row.slice());
}

/** Bottom-most remaining pixel in each column — reachable from the open bottom. */
export function exposedCells(grid) {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const out = [];
  for (let c = 0; c < cols; c++) {
    for (let r = rows - 1; r >= 0; r--) {
      if (grid[r][c] != null) {
        out.push({ r, c, color: grid[r][c] });
        break;
      }
    }
  }
  return out;
}

export function isCleared(grid) {
  return grid.every((row) => row.every((cell) => cell == null));
}

export function countColors(grid) {
  const counts = {};
  for (const row of grid) {
    for (const cell of row) {
      if (cell == null) continue;
      counts[cell] = (counts[cell] || 0) + 1;
    }
  }
  return counts;
}

/**
 * Eat exposed pixels of `color`, one layer at a time, until capacity runs out.
 * Each removed pixel reveals the next pixel up its column.
 */
export function planEat(grid, color, capacity) {
  const next = cloneGrid(grid);
  const eaten = [];
  let left = capacity;
  while (left > 0) {
    const wave = exposedCells(next).filter((cell) => cell.color === color);
    if (!wave.length) break;
    for (const cell of wave) {
      if (left <= 0) break;
      eaten.push({ r: cell.r, c: cell.c, color });
      next[cell.r][cell.c] = null;
      left--;
    }
  }
  return { grid: next, eaten, remaining: left };
}

export function dockHasSpace(dock) {
  return dock.some((slot) => slot == null);
}

export function canPlay(grid, hand, dock, source) {
  const spool = source.kind === 'hand' ? hand[source.index] : dock[source.index];
  if (!spool) return false;
  const plan = planEat(grid, spool.color, spool.capacity);
  if (plan.eaten.length > 0 && isCleared(plan.grid)) return true;
  if (source.kind === 'dock') return plan.eaten.length > 0;
  if (plan.remaining === 0) return true;
  return dockHasSpace(dock);
}

export function hasLegalMove(grid, hand, dock) {
  for (let i = 0; i < hand.length; i++) {
    if (canPlay(grid, hand, dock, { kind: 'hand', index: i })) return true;
  }
  for (let i = 0; i < dock.length; i++) {
    if (canPlay(grid, hand, dock, { kind: 'dock', index: i })) return true;
  }
  return false;
}

function weightedPick(rng, weights) {
  const entries = Object.entries(weights).filter(([, w]) => w > 0);
  if (!entries.length) return null;
  let total = 0;
  for (const [, w] of entries) total += w;
  let roll = rng() * total;
  for (const [key, w] of entries) {
    roll -= w;
    if (roll <= 0) return Number(key);
  }
  return Number(entries[entries.length - 1][0]);
}

function exposureMaps(grid) {
  const exposed = {};
  const near = {};
  for (const cell of exposedCells(grid)) {
    exposed[cell.color] = (exposed[cell.color] || 0) + 1;
    for (let k = 1; k <= 3; k++) {
      const r = cell.r - k;
      if (r < 0) break;
      const color = grid[r][cell.c];
      if (color == null) break;
      near[color] = (near[color] || 0) + 1;
    }
  }
  return { exposed, near };
}

/** Board-aware spool. Higher friendliness sticks closer to colors that can be eaten now. */
export function dealSpool(grid, rng, friendliness) {
  const present = countColors(grid);
  const colors = Object.keys(present);
  if (!colors.length) return null;
  const { exposed, near } = exposureMaps(grid);
  const friendly = Math.max(0, Math.min(1, friendliness));
  const pickExposed = rng() < 0.55 + friendly * 0.45 && Object.keys(exposed).length > 0;
  let color;
  if (pickExposed) {
    color = weightedPick(rng, exposed);
  } else {
    const mix = {};
    for (const key of colors) {
      mix[key] = (exposed[key] || 0) * 4 + (near[key] || 0) * 2 + 0.35;
    }
    color = weightedPick(rng, mix);
  }
  const exp = exposed[color] || 0;
  const soon = near[color] || 0;
  let capacity;
  if (exp > 0 && rng() < 0.45 + friendly * 0.5) {
    const slop = rng() < friendly * 0.75 ? 0 : 1 + Math.floor(rng() * 2);
    capacity = exp + slop;
  } else {
    capacity = Math.max(2, exp + Math.floor(rng() * (soon + 3)));
  }
  capacity = Math.max(1, Math.min(16, capacity));
  return { color, capacity };
}

export function dealHand(grid, rng, friendliness) {
  return [0, 1, 2].map(() => dealSpool(grid, rng, friendliness));
}

export function makePicture(level, rng) {
  const budget = Math.min(6, 3 + Math.floor((level - 1) / 2));
  const options = SPRITES.filter((sprite) => sprite.colors <= budget);
  const sprite = options[Math.floor(rng() * options.length)];
  const maxC = Math.min(10, 7 + Math.floor((level - 1) / 3));
  const maxR = Math.min(13, 8 + Math.floor((level - 1) / 2));
  const sw = sprite.art[0].length;
  const sh = sprite.art.length;
  let scale = 1 + Math.floor((level - 1) / 5);
  scale = Math.max(1, Math.min(scale, Math.floor(maxC / sw) || 1, Math.floor(maxR / sh) || 1));
  const cols = sw * scale;
  const rows = sh * scale;
  const grid = Array.from({ length: rows }, () => Array(cols).fill(null));

  const used = new Set();
  for (const row of sprite.art) {
    for (const ch of row) if (ch !== '.') used.add(Number(ch));
  }
  const ids = [...used].sort((a, b) => a - b);
  const assign = ids.map((_, i) => i);
  for (let i = assign.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [assign[i], assign[j]] = [assign[j], assign[i]];
  }
  const map = {};
  ids.forEach((id, i) => {
    map[id] = assign[i];
  });

  for (let r = 0; r < sh; r++) {
    for (let c = 0; c < sw; c++) {
      const ch = sprite.art[r][c];
      if (ch === '.') continue;
      const color = map[Number(ch)];
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          grid[r * scale + dy][c * scale + dx] = color;
        }
      }
    }
  }
  return { grid, name: sprite.name, colors: ids.length };
}
