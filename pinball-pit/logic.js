/** Pure BBTan-style rules for Pinball Pit. No DOM. */

export const PALETTE = ['#ff5d73', '#ffb703', '#4cc9f0', '#7ae582', '#c77dff'];
export const VIEW_W = 390;
export const VIEW_H = 693;
export const COLS = 7;
export const SAFE_ROWS = 8;
export const CELL = 46;
export const BOARD = {
  x: (VIEW_W - COLS * CELL) / 2,
  y: 78,
  w: COLS * CELL,
  h: SAFE_ROWS * CELL,
};
export const LAUNCH_Y = BOARD.y + BOARD.h + 76;
export const COLLECT_Y = BOARD.y + BOARD.h + 16;
export const BALL_R = 6.4;
export const SPEED = 372;

export const CARDS = [
  { id: 'split', title: 'Split Shot', text: 'A ball splits the first time it hits a block.' },
  { id: 'lightning', title: 'Chain Zap', text: 'Every 5th bounce zaps the nearest block.' },
  { id: 'pop', title: 'Color Burst', text: 'Same-colored neighbors pop together.' },
  { id: 'damage', title: 'Heavy Balls', text: 'Every hit deals +1 damage.' },
  { id: 'ball', title: 'Extra Ball', text: 'Add one ball to your volley.' },
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

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function renorm(ball) {
  const m = Math.hypot(ball.vx, ball.vy) || 1;
  ball.vx = (ball.vx / m) * SPEED;
  ball.vy = (ball.vy / m) * SPEED;
}

export function blockRect(block, visualRow = block.row) {
  const pad = 3.5;
  return {
    x: BOARD.x + block.col * CELL + pad,
    y: BOARD.y + visualRow * CELL + pad,
    w: CELL * block.span - pad * 2,
    h: CELL - pad * 2,
  };
}

export function blockCenter(block, visualRow = block.row) {
  const rect = blockRect(block, visualRow);
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}

function pickColor(state) {
  if (state.magazine.length && state.rng() < 0.78) {
    return state.magazine[Math.floor(state.rng() * state.magazine.length)];
  }
  return Math.floor(state.rng() * PALETTE.length);
}

function shuffle(rng, list) {
  const arr = list.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function addRow(state, row, boss) {
  const rowId = state.nextRowId++;
  state.liveRowIds.push(rowId);
  if (boss) {
    const hp = 16 + state.level * 2;
    state.blocks.push({
      id: state.nextBlockId++,
      row,
      col: 2,
      span: 3,
      hp,
      maxHp: hp,
      color: pickColor(state),
      kind: 'boss',
      rowId,
      dead: false,
    });
    return;
  }
  let count = 2 + Math.floor(state.rng() * 2);
  if (state.level >= 5) count += 1;
  count = Math.min(5, count);
  const cols = shuffle(state.rng, [0, 1, 2, 3, 4, 5, 6]).slice(0, count).sort((a, b) => a - b);
  let pickup = false;
  for (const col of cols) {
    const isPickup = !pickup && state.level > 1 && state.rng() < 0.16;
    if (isPickup) pickup = true;
    const hp = isPickup ? 1 : 1 + Math.floor((state.level - 1) / 3);
    state.blocks.push({
      id: state.nextBlockId++,
      row,
      col,
      span: 1,
      hp,
      maxHp: hp,
      color: pickColor(state),
      kind: isPickup ? 'pickup' : 'block',
      rowId,
      dead: false,
    });
  }
}

export function createRun(seed = 1) {
  const state = {
    rng: mulberry32(seed),
    phase: 'aim',
    level: 1,
    score: 0,
    rowsCleared: 0,
    magazine: [0, 1, 2, 3],
    blocks: [],
    balls: [],
    spawnQueue: [],
    pendingBalls: [],
    originX: BOARD.x + BOARD.w / 2,
    aim: -Math.PI / 2,
    nextRowId: 1,
    nextBlockId: 1,
    liveRowIds: [],
    clearedRowIds: new Set(),
    shiftT: 0,
    volleyTime: 0,
    rewardQueued: false,
    cardChoices: null,
    cardIndex: 0,
    upgrades: { split: 0, lightning: 0, pop: 0, damage: 0, ball: 0 },
    particles: [],
    floats: [],
    bolts: [],
    shake: 0,
    nextOrigin: null,
    over: false,
  };
  addRow(state, 0, false);
  addRow(state, 1, false);
  addRow(state, 2, false);
  return state;
}

export function aimToward(state, x, y) {
  let ang = Math.atan2(y - LAUNCH_Y, x - state.originX);
  if (ang > 0) ang = x < state.originX ? -Math.PI + 0.2 : -0.2;
  state.aim = clamp(ang, -Math.PI + 0.18, -0.18);
}

export function nudgeAim(state, dir) {
  state.aim = clamp(state.aim + dir * 0.045, -Math.PI + 0.18, -0.18);
}

function burst(state, x, y, color, n, power) {
  for (let i = 0; i < n; i++) {
    const a = state.rng() * Math.PI * 2;
    const s = power * (0.4 + state.rng());
    state.particles.push({
      x,
      y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life: 0.28 + state.rng() * 0.22,
      max: 0.45,
      color,
      r: 2 + state.rng() * 2.4,
    });
  }
}

function floatText(state, x, y, text, color) {
  state.floats.push({ x, y, text, color, life: 0.55 });
}

function occupies(block) {
  const cells = [];
  for (let i = 0; i < block.span; i++) cells.push({ r: block.row, c: block.col + i });
  return cells;
}

function adjacent(a, b) {
  for (const ca of occupies(a)) {
    for (const cb of occupies(b)) {
      if (Math.abs(ca.r - cb.r) + Math.abs(ca.c - cb.c) === 1) return true;
    }
  }
  return false;
}

function checkRows(state) {
  const alive = new Set(state.blocks.filter((b) => !b.dead).map((b) => b.rowId));
  for (const id of state.liveRowIds) {
    if (alive.has(id) || state.clearedRowIds.has(id)) continue;
    state.clearedRowIds.add(id);
    const before = state.rowsCleared;
    state.rowsCleared += 1;
    if (Math.floor(state.rowsCleared / 3) > Math.floor(before / 3)) state.rewardQueued = true;
  }
}

function destroyBlock(state, block) {
  if (block.dead || block.kind === 'pickup') return;
  block.dead = true;
  block.hp = 0;
  state.score += block.kind === 'boss' ? 400 : 50;
  const c = blockCenter(block);
  burst(state, c.x, c.y, PALETTE[block.color], block.kind === 'boss' ? 18 : 10, block.kind === 'boss' ? 180 : 110);
  state.shake = Math.max(state.shake, block.kind === 'boss' ? 9 : 4);
  if (state.upgrades.pop) {
    for (const other of state.blocks) {
      if (other.dead || other.kind !== 'block' && other.kind !== 'boss') continue;
      if (other.color === block.color && adjacent(block, other)) destroyBlock(state, other);
    }
  }
  checkRows(state);
}

function hurt(state, block, amount, x, y) {
  if (block.dead || block.kind === 'pickup') return;
  block.hp -= amount;
  block.flash = 0.12;
  state.score += amount * 8;
  floatText(state, x, y, String(amount), '#fff');
  if (block.hp <= 0) destroyBlock(state, block);
}

function collectPickup(state, block) {
  if (block.dead) return;
  block.dead = true;
  state.pendingBalls.push(block.color);
  state.score += 40;
  const c = blockCenter(block);
  burst(state, c.x, c.y, '#fff', 8, 90);
  floatText(state, c.x, c.y - 8, '+ball', PALETTE[block.color]);
  checkRows(state);
}

function zap(state, ball) {
  let best = null;
  let bestD = 230;
  for (const block of state.blocks) {
    if (block.dead || block.kind === 'pickup') continue;
    if (ball.touch && ball.touch.has(block.id)) continue;
    const c = blockCenter(block);
    const d = Math.hypot(c.x - ball.x, c.y - ball.y);
    if (d < bestD) {
      bestD = d;
      best = block;
    }
  }
  if (!best) return;
  const c = blockCenter(best);
  state.bolts.push({ x1: ball.x, y1: ball.y, x2: c.x, y2: c.y, life: 0.16 });
  hurt(state, best, 1 + state.upgrades.damage, c.x, c.y - 10);
}

function onHit(state, ball, block) {
  ball.bounces += 1;
  if (block.kind === 'pickup') {
    collectPickup(state, block);
    return;
  }
  const same = ball.color === block.color;
  const amount = (1 + state.upgrades.damage) * (same ? 2 : 1);
  const c = blockCenter(block);
  hurt(state, block, amount, c.x, c.y - 12);
  if (same) burst(state, ball.x, ball.y, '#fff', 4, 70);
  if (state.upgrades.split > 0 && !ball.child && !ball.splitDone && state.balls.length < 30) {
    ball.splitDone = true;
    const base = Math.atan2(ball.vy, ball.vx);
    for (let i = 0; i < state.upgrades.split; i++) {
      const sign = i % 2 === 0 ? 1 : -1;
      const ang = base + sign * (0.48 + Math.floor(i / 2) * 0.18);
      state.balls.push(makeBall(state, ball.color, ang, true, ball.x, ball.y));
    }
  }
  if (state.upgrades.lightning > 0 && ball.bounces > 0 && ball.bounces % 5 === 0) zap(state, ball);
}

function makeBall(state, color, angle, child, x, y) {
  return {
    x: x ?? state.originX,
    y: y ?? LAUNCH_Y,
    vx: Math.cos(angle) * SPEED,
    vy: Math.sin(angle) * SPEED,
    color,
    r: BALL_R,
    child: !!child,
    splitDone: false,
    bounces: 0,
    touch: new Set(),
    wall: { left: false, right: false, top: false },
    flat: 0,
    alive: true,
    entered: false,
    trail: [],
  };
}

export function fire(state) {
  if (state.phase !== 'aim' || state.magazine.length === 0) return false;
  state.phase = 'volley';
  state.volleyTime = 0;
  state.balls = [];
  state.spawnQueue = state.magazine.map((color, i) => ({ color, t: i * 0.085 }));
  state.pendingBalls = [];
  state.nextOrigin = null;
  return true;
}

function bounce(ball) {
  ball.bounces += 1;
}

function resolveWalls(state, ball) {
  const left = BOARD.x + ball.r;
  const right = BOARD.x + BOARD.w - ball.r;
  const top = BOARD.y + ball.r;
  if (ball.x < left) {
    ball.x = left;
    if (ball.vx < 0) ball.vx = Math.abs(ball.vx);
    if (!ball.wall.left) {
      ball.wall.left = true;
      bounce(ball);
      if (state.upgrades.lightning > 0 && ball.bounces % 5 === 0) zap(state, ball);
    }
  } else ball.wall.left = false;
  if (ball.x > right) {
    ball.x = right;
    if (ball.vx > 0) ball.vx = -Math.abs(ball.vx);
    if (!ball.wall.right) {
      ball.wall.right = true;
      bounce(ball);
      if (state.upgrades.lightning > 0 && ball.bounces % 5 === 0) zap(state, ball);
    }
  } else ball.wall.right = false;
  if (ball.y < top) {
    ball.y = top;
    if (ball.vy < 0) ball.vy = Math.abs(ball.vy);
    if (!ball.wall.top) {
      ball.wall.top = true;
      bounce(ball);
      if (state.upgrades.lightning > 0 && ball.bounces % 5 === 0) zap(state, ball);
    }
  } else ball.wall.top = false;
}

function separate(ball, rect, reflect) {
  const cx = clamp(ball.x, rect.x, rect.x + rect.w);
  const cy = clamp(ball.y, rect.y, rect.y + rect.h);
  let dx = ball.x - cx;
  let dy = ball.y - cy;
  let dist = Math.hypot(dx, dy);
  if (dist < 0.001) {
    const left = ball.x - rect.x;
    const right = rect.x + rect.w - ball.x;
    const top = ball.y - rect.y;
    const bottom = rect.y + rect.h - ball.y;
    const m = Math.min(left, right, top, bottom);
    if (m === left) {
      dx = -1;
      dy = 0;
      ball.x = rect.x - ball.r;
    } else if (m === right) {
      dx = 1;
      dy = 0;
      ball.x = rect.x + rect.w + ball.r;
    } else if (m === top) {
      dx = 0;
      dy = -1;
      ball.y = rect.y - ball.r;
    } else {
      dx = 0;
      dy = 1;
      ball.y = rect.y + rect.h + ball.r;
    }
    dist = 1;
  } else {
    const pen = ball.r - dist;
    if (pen > 0) {
      ball.x += (dx / dist) * (pen + 0.2);
      ball.y += (dy / dist) * (pen + 0.2);
    }
  }
  if (!reflect) return;
  const nx = dx / dist;
  const ny = dy / dist;
  const dot = ball.vx * nx + ball.vy * ny;
  if (dot < 0) {
    ball.vx -= 2 * dot * nx;
    ball.vy -= 2 * dot * ny;
    renorm(ball);
  }
}

function hitsRect(ball, rect) {
  const cx = clamp(ball.x, rect.x, rect.x + rect.w);
  const cy = clamp(ball.y, rect.y, rect.y + rect.h);
  const dx = ball.x - cx;
  const dy = ball.y - cy;
  return dx * dx + dy * dy <= ball.r * ball.r + 0.5;
}

function resolveBlocks(state, ball) {
  for (const block of state.blocks) {
    if (block.dead || block.row >= SAFE_ROWS) continue;
    const rect = blockRect(block);
    if (!hitsRect(ball, rect)) {
      ball.touch.delete(block.id);
      continue;
    }
    const first = !ball.touch.has(block.id);
    if (block.kind === 'pickup') {
      if (first) onHit(state, ball, block);
      ball.touch.add(block.id);
      continue;
    }
    separate(ball, rect, first);
    if (first) {
      ball.touch.add(block.id);
      onHit(state, ball, block);
    }
  }
}

function collect(state, ball) {
  ball.alive = false;
  if (state.nextOrigin == null) {
    state.nextOrigin = clamp(ball.x, BOARD.x + 18, BOARD.x + BOARD.w - 18);
  }
}

function stepBall(state, ball, dt) {
  ball.trail.push({ x: ball.x, y: ball.y });
  if (ball.trail.length > 7) ball.trail.shift();
  const steps = 4;
  const h = dt / steps;
  for (let s = 0; s < steps; s++) {
    ball.x += ball.vx * h;
    ball.y += ball.vy * h;
    if (Math.abs(ball.vy) < 28) ball.flat += h;
    else ball.flat = 0;
    if (ball.flat > 0.4) {
      ball.vy += 140;
      ball.flat = 0;
      renorm(ball);
    }
    resolveWalls(state, ball);
    resolveBlocks(state, ball);
    if (ball.y < BOARD.y + BOARD.h) ball.entered = true;
    if (ball.entered && ball.vy > 0 && ball.y > COLLECT_Y) {
      collect(state, ball);
      return;
    }
  }
}

function endVolley(state) {
  if (state.phase !== 'volley') return;
  if (state.pendingBalls.length) state.magazine.push(...state.pendingBalls);
  state.pendingBalls = [];
  state.spawnQueue = [];
  state.balls = [];
  if (state.nextOrigin != null) state.originX = state.nextOrigin;
  if (state.rewardQueued) {
    state.rewardQueued = false;
    openCards(state);
    return;
  }
  beginShift(state);
}

function openCards(state) {
  const pool = CARDS.filter((card) => card.id !== 'pop' || state.upgrades.pop === 0);
  const bag = shuffle(state.rng, pool);
  while (bag.length < 3) bag.push(CARDS.find((card) => card.id === 'ball'));
  state.cardChoices = bag.slice(0, 3).map((card) => ({ ...card }));
  state.cardIndex = 0;
  state.phase = 'cards';
}

export function chooseCard(state, index) {
  if (state.phase !== 'cards' || !state.cardChoices) return false;
  const card = state.cardChoices[Math.max(0, Math.min(state.cardChoices.length - 1, index))];
  const up = state.upgrades;
  if (card.id === 'split') up.split += 1;
  else if (card.id === 'lightning') up.lightning += 1;
  else if (card.id === 'pop') up.pop = 1;
  else if (card.id === 'damage') up.damage += 1;
  else if (card.id === 'ball') {
    up.ball += 1;
    state.magazine.push(pickColor(state));
  }
  state.cardChoices = null;
  beginShift(state);
  return true;
}

export function cycleCard(state, dir) {
  if (state.phase !== 'cards' || !state.cardChoices?.length) return;
  const n = state.cardChoices.length;
  state.cardIndex = (state.cardIndex + dir + n) % n;
}

function beginShift(state) {
  state.phase = 'shift';
  state.shiftT = 0;
  for (const block of state.blocks) if (!block.dead) block.row += 1;
}

function finishShift(state) {
  const doomed = state.blocks.some((b) => !b.dead && b.kind !== 'pickup' && b.row >= SAFE_ROWS);
  state.blocks = state.blocks.filter((b) => !b.dead && !(b.kind === 'pickup' && b.row >= SAFE_ROWS));
  if (doomed) {
    state.phase = 'over';
    state.over = true;
    state.shake = 10;
    return;
  }
  state.level += 1;
  addRow(state, 0, state.level % 10 === 0);
  state.phase = 'aim';
}

function ageFx(state, dt) {
  state.shake = Math.max(0, state.shake - dt * 18);
  for (const p of state.particles) {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 280 * dt;
  }
  state.particles = state.particles.filter((p) => p.life > 0);
  for (const f of state.floats) {
    f.life -= dt;
    f.y -= 28 * dt;
  }
  state.floats = state.floats.filter((f) => f.life > 0);
  for (const b of state.bolts) b.life -= dt;
  state.bolts = state.bolts.filter((b) => b.life > 0);
  for (const block of state.blocks) if (block.flash) block.flash = Math.max(0, block.flash - dt);
}

export function update(state, dt) {
  dt = Math.max(0, Math.min(0.05, dt));
  ageFx(state, dt);
  if (state.phase === 'shift') {
    state.shiftT += dt / 0.32;
    if (state.shiftT >= 1) finishShift(state);
    return;
  }
  if (state.phase !== 'volley') return;
  state.volleyTime += dt;
  for (const item of state.spawnQueue) item.t -= dt;
  while (state.spawnQueue.length && state.spawnQueue[0].t <= 0) {
    const item = state.spawnQueue.shift();
    state.balls.push(makeBall(state, item.color, state.aim, false));
  }
  for (const ball of state.balls) {
    if (ball.alive) stepBall(state, ball, dt);
  }
  state.balls = state.balls.filter((ball) => ball.alive);
  if (state.volleyTime > 11) {
    for (const ball of state.balls) collect(state, ball);
    state.balls = [];
    state.spawnQueue = [];
  }
  if (state.spawnQueue.length === 0 && state.balls.length === 0) endVolley(state);
}

export function visualRow(state, block) {
  if (state.phase === 'shift') return block.row - (1 - easeOut(Math.min(1, state.shiftT)));
  return block.row;
}

function easeOut(t) {
  return 1 - (1 - t) * (1 - t);
}

/** Aim guide. Stops at the floor or after a few bounces. */
export function aimPath(state) {
  let x = state.originX;
  let y = LAUNCH_Y;
  let dx = Math.cos(state.aim);
  let dy = Math.sin(state.aim);
  const pts = [{ x, y }];
  for (let bounce = 0; bounce < 5; bounce++) {
    let best = null;
    const consider = (hit) => {
      if (!hit || hit.t < 1.2) return;
      if (!best || hit.t < best.t) best = hit;
    };
    if (dx > 0) consider(rayPoint(x, y, dx, dy, (BOARD.x + BOARD.w - x) / dx, -1, 0));
    if (dx < 0) consider(rayPoint(x, y, dx, dy, (BOARD.x - x) / dx, 1, 0));
    if (dy < 0) consider(rayPoint(x, y, dx, dy, (BOARD.y - y) / dy, 0, 1));
    if (dy > 0) {
      const t = (COLLECT_Y - y) / dy;
      if (t > 1 && (!best || t < best.t)) {
        pts.push({ x: x + dx * t, y: y + dy * t });
        break;
      }
    }
    for (const block of state.blocks) {
      if (block.dead || block.row >= SAFE_ROWS) continue;
      consider(rayAabb(x, y, dx, dy, blockRect(block)));
    }
    if (!best) {
      pts.push({ x: x + dx * 80, y: y + dy * 80 });
      break;
    }
    pts.push({ x: best.x, y: best.y });
    const dot = dx * best.nx + dy * best.ny;
    dx -= 2 * dot * best.nx;
    dy -= 2 * dot * best.ny;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    x = best.x + best.nx * 2;
    y = best.y + best.ny * 2;
  }
  return pts;
}

function rayPoint(x, y, dx, dy, t, nx, ny) {
  if (!Number.isFinite(t) || t < 0) return null;
  return { t, nx, ny, x: x + dx * t, y: y + dy * t };
}

function rayAabb(ox, oy, dx, dy, box) {
  const INF = 1e15;
  let tmin = 0;
  let tmax = INF;
  let nx = 0;
  let ny = 0;
  if (Math.abs(dx) < 1e-8) {
    if (ox <= box.x || ox >= box.x + box.w) return null;
  } else {
    let t1 = (box.x - ox) / dx;
    let t2 = (box.x + box.w - ox) / dx;
    let nEnter = dx > 0 ? -1 : 1;
    if (t1 > t2) {
      const s = t1;
      t1 = t2;
      t2 = s;
      nEnter = -nEnter;
    }
    if (t1 > tmin) {
      tmin = t1;
      nx = nEnter;
      ny = 0;
    }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (Math.abs(dy) < 1e-8) {
    if (oy <= box.y || oy >= box.y + box.h) return null;
  } else {
    let t1 = (box.y - oy) / dy;
    let t2 = (box.y + box.h - oy) / dy;
    let nEnter = dy > 0 ? -1 : 1;
    if (t1 > t2) {
      const s = t1;
      t1 = t2;
      t2 = s;
      nEnter = -nEnter;
    }
    if (t1 > tmin) {
      tmin = t1;
      nx = 0;
      ny = nEnter;
    }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (tmin <= 0 || tmin > 4000) return null;
  return { t: tmin, nx, ny, x: ox + dx * tmin, y: oy + dy * tmin };
}

/** Test hook: apply one hit of a colored ball to a block id. */
export function debugHit(state, blockId, color) {
  const block = state.blocks.find((item) => item.id === blockId);
  if (!block) return null;
  const before = block.hp;
  const ball = makeBall(state, color, -Math.PI / 2, true, 0, 0);
  ball.child = true;
  onHit(state, ball, block);
  return { before, after: block.hp, dead: block.dead, bounces: ball.bounces };
}
