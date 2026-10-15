/** Pure rules for Gridlock. Levels stay solvable by reverse placement plus a replay check. */

export const CAR_COLORS = ['#e23d4a', '#2f8fd6', '#2f9e62', '#f0a202', '#7b4ec8'];

/** 0 up, 1 right, 2 down, 3 left */
export const DIRS = [
  { dr: -1, dc: 0 },
  { dr: 0, dc: 1 },
  { dr: 1, dc: 0 },
  { dr: 0, dc: -1 },
];

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

function randInt(rng, n) {
  return Math.floor(rng() * n);
}

export function cellsOf(car) {
  const { dr, dc } = DIRS[car.dir];
  const cells = [[car.r, car.c]];
  if ((car.span || 1) > 1) cells.push([car.r - dr, car.c - dc]);
  return cells;
}

export function gateAt(exits, car) {
  const side = car.dir === 0 ? exits.up : car.dir === 1 ? exits.right : car.dir === 2 ? exits.down : exits.left;
  const index = car.dir === 1 || car.dir === 3 ? car.r : car.c;
  const gate = side[index];
  if (typeof gate === 'number') return { color: gate, cycle: null, index: 0, uses: Infinity };
  return gate;
}

export function stepsToExit(size, car) {
  if (car.dir === 0) return car.r + 1.35;
  if (car.dir === 1) return size - car.c + 0.35;
  if (car.dir === 2) return size - car.r + 0.35;
  return car.c + 1.35;
}

function blockedCells(level, cars, ignoreId) {
  const blocked = new Set();
  for (const rock of level.rocks || []) blocked.add(`${rock.r},${rock.c}`);
  for (const other of cars) {
    if (other.id === ignoreId) continue;
    for (const [r, c] of cellsOf(other)) blocked.add(`${r},${c}`);
  }
  return blocked;
}

/** Path in front of the car is clear, the exit is open, and its color matches. */
export function canExit(level, cars, car) {
  if (!car) return false;
  if (car.lock && cars.some((other) => other.id === car.lock)) return false;
  const size = level.size;
  const blocked = blockedCells(level, cars, car.id);
  const { dr, dc } = DIRS[car.dir];
  let r = car.r + dr;
  let c = car.c + dc;
  while (r >= 0 && r < size && c >= 0 && c < size) {
    if (blocked.has(`${r},${c}`)) return false;
    r += dr;
    c += dc;
  }
  const gate = gateAt(level.exits, car);
  if (!gate || gate.uses <= 0) return false;
  return gate.color === car.color;
}

export function onCarExit(level, cars, car) {
  const gate = gateAt(level.exits, car);
  if (gate?.cycle?.length) {
    gate.index = (gate.index + 1) % gate.cycle.length;
    gate.color = gate.cycle[gate.index];
  }
  if (gate && Number.isFinite(gate.uses)) gate.uses -= 1;
  for (const other of cars) {
    if (other.id !== car.id && other.shift) other.color = (other.color + 1) % level.colorCount;
  }
}

function cloneExitCell(cell) {
  if (typeof cell === 'number') return { color: cell, cycle: null, index: 0, uses: Infinity };
  return { color: cell.color, cycle: cell.cycle ? cell.cycle.slice() : null, index: cell.index || 0, uses: cell.uses };
}

function cloneLevel(level) {
  return {
    level: level.level,
    size: level.size,
    colorCount: level.colorCount,
    handmade: !!level.handmade,
    hearts: level.hearts,
    par: level.par,
    moveLimit: level.moveLimit,
    rocks: (level.rocks || []).map((rock) => ({ ...rock })),
    exits: {
      up: level.exits.up.map(cloneExitCell),
      down: level.exits.down.map(cloneExitCell),
      left: level.exits.left.map(cloneExitCell),
      right: level.exits.right.map(cloneExitCell),
    },
    cars: level.cars.map((car) => ({ ...car })),
    solution: level.solution.slice(),
  };
}

export function validate(level) {
  if (!level?.cars?.length || !level.solution?.length) return false;
  if (level.solution.length !== level.cars.length) return false;
  const copy = cloneLevel(level);
  const cars = copy.cars.map((car) => ({ ...car }));
  for (const id of copy.solution) {
    const car = cars.find((item) => item.id === id);
    if (!car) return false;
    if (!canExit(copy, cars, car)) return false;
    onCarExit(copy, cars, car);
    cars.splice(cars.findIndex((item) => item.id === id), 1);
  }
  return cars.length === 0;
}

const HANDMADE = [
  {
    level: 1,
    size: 4,
    colorCount: 2,
    handmade: true,
    hearts: 3,
    par: 4,
    moveLimit: null,
    rocks: [],
    exits: {
      up: [0, 1, 0, 1],
      down: [1, 0, 1, 0],
      left: [0, 1, 0, 1],
      right: [1, 0, 1, 0],
    },
    cars: [
      { id: 1, r: 0, c: 1, dir: 0, color: 1, span: 1 },
      { id: 2, r: 2, c: 1, dir: 0, color: 1, span: 1 },
      { id: 3, r: 1, c: 3, dir: 1, color: 0, span: 1 },
      { id: 4, r: 3, c: 2, dir: 2, color: 1, span: 1 },
    ],
    solution: [1, 3, 2, 4],
  },
];

function normalizeLevel(level) {
  const copy = cloneLevel(level);
  if (!copy.rocks) copy.rocks = [];
  return copy;
}

function boardSize(level) {
  if (level <= 2) return 4;
  if (level <= 5) return 5;
  if (level <= 8) return 6;
  if (level <= 11) return 7;
  return 8;
}

function featuresFor(level) {
  return {
    rocks: level < 4 ? 0 : Math.min(4, level === 4 ? 1 : 1 + Math.floor((level - 4) / 3)),
    locks: level < 5 ? 0 : Math.min(3, level === 5 ? 1 : 1 + Math.floor((level - 5) / 4)),
    long: level < 6 ? 0 : Math.min(3, level === 6 ? 1 : 1 + Math.floor((level - 6) / 4)),
    cycle: level >= 7,
    once: level >= 8,
    shift: level < 9 ? 0 : Math.min(2, level === 9 ? 1 : 1 + Math.floor((level - 9) / 5)),
    hearts: level <= 8 ? 3 : 2,
    slack: level <= 3 ? null : level < 9 ? 3 : 2,
  };
}

function plainExit(color) {
  return { color, cycle: null, index: 0, uses: Infinity };
}

function occupied(cars, rocks, r, c) {
  if (rocks.some((rock) => rock.r === r && rock.c === c)) return true;
  return cars.some((car) => cellsOf(car).some(([rr, cc]) => rr === r && cc === c));
}

function tryGenerate(level, rng) {
  const feats = featuresFor(level);
  const size = boardSize(level);
  const colorCount = Math.min(5, 2 + Math.floor((level - 1) / 3));
  const rocks = [];
  const interior = [];
  for (let r = 1; r < size - 1; r++) {
    for (let c = 1; c < size - 1; c++) interior.push({ r, c });
  }
  for (let i = interior.length - 1; i > 0; i--) {
    const j = randInt(rng, i + 1);
    [interior[i], interior[j]] = [interior[j], interior[i]];
  }
  for (let i = 0; i < feats.rocks && i < interior.length; i++) rocks.push(interior[i]);

  const exits = {
    up: Array.from({ length: size }, () => plainExit(randInt(rng, colorCount))),
    down: Array.from({ length: size }, () => plainExit(randInt(rng, colorCount))),
    left: Array.from({ length: size }, () => plainExit(randInt(rng, colorCount))),
    right: Array.from({ length: size }, () => plainExit(randInt(rng, colorCount))),
  };
  const draft = { size, colorCount, rocks, exits, cars: [] };
  const cars = [];
  const placedOrder = [];
  const target = Math.min(size * size - rocks.length - 2, 4 + level + Math.floor(level / 3));
  let longLeft = feats.long;
  let guard = 0;
  while (cars.length < target && guard++ < 6000) {
    const span = longLeft > 0 && rng() < 0.45 ? 2 : 1;
    const dir = randInt(rng, 4);
    const color = randInt(rng, colorCount);
    const { dr, dc } = DIRS[dir];
    const spots = [];
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (occupied(cars, rocks, r, c)) continue;
        if (span === 2) {
          const tr = r - dr;
          const tc = c - dc;
          if (tr < 0 || tc < 0 || tr >= size || tc >= size) continue;
          if (occupied(cars, rocks, tr, tc)) continue;
        }
        const candidate = { r, c, dir, color, span, id: cars.length + 1 };
        if (!canExit(draft, cars, candidate)) continue;
        spots.push({ r, c, dist: distToEdge(size, r, c, dir) });
      }
    }
    if (!spots.length) {
      if (span === 2) longLeft = 0;
      continue;
    }
    const maxDist = Math.max(...spots.map((spot) => spot.dist));
    const pool = level >= 4 ? spots.filter((spot) => spot.dist >= Math.min(maxDist, 1)) : spots;
    const spot = (pool.length ? pool : spots)[randInt(rng, (pool.length ? pool : spots).length)];
    const car = { r: spot.r, c: spot.c, dir, color, span, id: cars.length + 1 };
    cars.push(car);
    draft.cars = cars;
    placedOrder.push(car.id);
    if (span === 2) longLeft -= 1;
  }
  const minimum = Math.min(target, Math.max(3, target - 3));
  if (cars.length < minimum) return null;
  const solution = placedOrder.slice().reverse();
  const built = {
    level,
    size,
    colorCount,
    handmade: false,
    rocks,
    exits,
    cars,
    solution,
    hearts: feats.hearts,
    par: solution.length,
    moveLimit: feats.slack == null ? null : solution.length + feats.slack,
  };
  decorate(built, feats, rng);
  return validate(built) ? built : null;
}

function gateId(car) {
  return `${car.dir}:${car.dir === 1 || car.dir === 3 ? car.r : car.c}`;
}

function decorate(level, feats, rng) {
  const groups = new Map();
  for (const id of level.solution) {
    const car = level.cars.find((item) => item.id === id);
    const key = gateId(car);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(car);
  }
  if (feats.cycle) {
    const cycling = [...groups.values()].filter((list) => list.length >= 2 && new Set(list.map((car) => car.color)).size > 1);
    const choice = cycling[0] || [...groups.values()].find((list) => list.length >= 2);
    if (choice) {
      const gate = gateAt(level.exits, choice[0]);
      gate.cycle = choice.map((car) => car.color);
      gate.index = 0;
      gate.color = gate.cycle[0];
    }
  }
  if (feats.once) {
    const once = [...groups.values()].find((list) => list.length === 1 && !gateAt(level.exits, list[0]).cycle);
    if (once) gateAt(level.exits, once[0]).uses = 1;
  }
  for (let i = 0; i < feats.shift; i++) {
    const id = level.solution[Math.min(level.solution.length - 1, i + 1)];
    const car = level.cars.find((item) => item.id === id);
    if (!car || car.shift) continue;
    const prior = level.solution.indexOf(car.id);
    car.shift = true;
    car.color = (car.color - prior + level.colorCount * (prior + 2)) % level.colorCount;
  }
  for (let i = 0; i < feats.locks && i + 1 < level.solution.length; i++) {
    const later = level.cars.find((item) => item.id === level.solution[i + 1]);
    if (later && !later.lock) later.lock = level.solution[i];
  }
}

function distToEdge(size, r, c, dir) {
  if (dir === 0) return r;
  if (dir === 1) return size - 1 - c;
  if (dir === 2) return size - 1 - r;
  return c;
}

/** Deterministic level. New twists arrive one at a time after the opening lessons. */
export function generateLevel(level, seed = 8000 + level * 97) {
  if (level === 1) {
    const handmade = normalizeLevel(HANDMADE[0]);
    if (!validate(handmade)) throw new Error('Handmade level 1 is not solvable');
    return handmade;
  }
  const rng = mulberry32(seed >>> 0);
  for (let attempt = 0; attempt < 40; attempt++) {
    const built = tryGenerate(level, rng);
    if (built) return built;
  }
  const fallback = tryGenerate(Math.max(2, level - 1), mulberry32((seed + 999) >>> 0));
  if (fallback) return fallback;
  throw new Error(`Could not generate a solvable gridlock level ${level}`);
}
