/** Pure rules for Gridlock. Levels are solvable by construction. */

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

export function exitColor(exits, car) {
  if (car.dir === 0) return exits.up[car.c];
  if (car.dir === 1) return exits.right[car.r];
  if (car.dir === 2) return exits.down[car.c];
  return exits.left[car.r];
}

export function stepsToExit(size, car) {
  if (car.dir === 0) return car.r + 1.35;
  if (car.dir === 1) return size - car.c + 0.35;
  if (car.dir === 2) return size - car.r + 0.35;
  return car.c + 1.35;
}

/** Path to the edge is clear and the exit on that side matches the car color. */
export function canExit(size, cars, exits, car) {
  const { dr, dc } = DIRS[car.dir];
  const blocked = new Set();
  for (const other of cars) {
    if (other === car || other.id === car.id) continue;
    blocked.add(`${other.r},${other.c}`);
  }
  let r = car.r + dr;
  let c = car.c + dc;
  while (r >= 0 && r < size && c >= 0 && c < size) {
    if (blocked.has(`${r},${c}`)) return false;
    r += dr;
    c += dc;
  }
  return exitColor(exits, car) === car.color;
}

export function validate(level) {
  if (!level?.cars?.length || !level.solution?.length) return false;
  if (level.solution.length !== level.cars.length) return false;
  const cars = level.cars.map((car) => ({ ...car }));
  for (const id of level.solution) {
    const car = cars.find((item) => item.id === id);
    if (!car) return false;
    if (!canExit(level.size, cars, level.exits, car)) return false;
    const index = cars.findIndex((item) => item.id === id);
    cars.splice(index, 1);
  }
  return cars.length === 0;
}

const HANDMADE = [
  {
    size: 4,
    colorCount: 2,
    handmade: true,
    exits: {
      up: [0, 1, 0, 1],
      down: [1, 0, 1, 0],
      left: [0, 1, 0, 1],
      right: [1, 0, 1, 0],
    },
    cars: [
      { id: 1, r: 0, c: 1, dir: 0, color: 1 },
      { id: 2, r: 2, c: 1, dir: 0, color: 1 },
      { id: 3, r: 1, c: 3, dir: 1, color: 0 },
      { id: 4, r: 3, c: 2, dir: 2, color: 1 },
    ],
    solution: [1, 3, 2, 4],
  },
];

function cloneLevel(level) {
  return {
    size: level.size,
    colorCount: level.colorCount,
    handmade: !!level.handmade,
    exits: {
      up: level.exits.up.slice(),
      down: level.exits.down.slice(),
      left: level.exits.left.slice(),
      right: level.exits.right.slice(),
    },
    cars: level.cars.map((car) => ({ ...car })),
    solution: level.solution.slice(),
  };
}

function levelParams(level) {
  const size = Math.min(7, 4 + Math.floor((level - 1) / 2));
  const colorCount = Math.min(5, 2 + Math.floor((level - 1) / 2));
  const target = Math.min(size * size - 2, 3 + level + Math.floor(level / 4));
  return { size, colorCount, target };
}

function distToEdge(size, r, c, dir) {
  if (dir === 0) return r;
  if (dir === 1) return size - 1 - c;
  if (dir === 2) return size - 1 - r;
  return c;
}

function tryGenerate(level, rng) {
  const { size, colorCount, target } = levelParams(level);
  const exits = {
    up: Array.from({ length: size }, () => randInt(rng, colorCount)),
    down: Array.from({ length: size }, () => randInt(rng, colorCount)),
    left: Array.from({ length: size }, () => randInt(rng, colorCount)),
    right: Array.from({ length: size }, () => randInt(rng, colorCount)),
  };
  const cars = [];
  const placedOrder = [];
  let guard = 0;
  while (cars.length < target && guard++ < 5000) {
    const dir = randInt(rng, 4);
    const color = randInt(rng, colorCount);
    const spots = [];
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (cars.some((car) => car.r === r && car.c === c)) continue;
        const candidate = { r, c, dir, color, id: cars.length + 1 };
        if (!canExit(size, cars, exits, candidate)) continue;
        spots.push({ r, c, dist: distToEdge(size, r, c, dir) });
      }
    }
    if (!spots.length) continue;
    const maxDist = Math.max(...spots.map((spot) => spot.dist));
    const minKeep = level >= 4 ? Math.min(maxDist, 1) : 0;
    const pool = spots.filter((spot) => spot.dist >= minKeep);
    const spot = pool[randInt(rng, pool.length)];
    const car = { r: spot.r, c: spot.c, dir, color, id: cars.length + 1 };
    cars.push(car);
    placedOrder.push(car.id);
  }
  const minimum = Math.min(target, Math.max(3, target - 2));
  if (cars.length < minimum) return null;
  return {
    size,
    colorCount,
    handmade: false,
    exits,
    cars,
    solution: placedOrder.slice().reverse(),
  };
}

/** Deterministic level. Level 1 is handmade; later levels are generated in reverse so a solution exists. */
export function generateLevel(level, seed = 8000 + level * 97) {
  if (level === 1) {
    const handmade = cloneLevel(HANDMADE[0]);
    if (!validate(handmade)) throw new Error('Handmade level 1 is not solvable');
    return handmade;
  }
  const rng = mulberry32(seed >>> 0);
  for (let attempt = 0; attempt < 30; attempt++) {
    const built = tryGenerate(level, rng);
    if (built && validate(built)) return built;
  }
  const fallback = tryGenerate(Math.max(2, level - 1), mulberry32((seed + 999) >>> 0));
  if (fallback && validate(fallback)) return fallback;
  throw new Error(`Could not generate a solvable gridlock level ${level}`);
}
