/** Pure BBTan-style rules for Pinball Pit. No DOM. */

export const PALETTE = ['#ff5d73', '#ffb703', '#4cc9f0', '#7ae582', '#c77dff'];
export const VIEW_W = 390;
export const VIEW_H = 693;
export const COLS = 7;
export const SAFE_ROWS = 8;

/** Board geometry for a viewport. Cells stay square; the pit grows to fill the view. */
export function fitLayout(w = VIEW_W, h = VIEW_H) {
  const hud = Math.max(78, Math.min(120, h * 0.12));
  const footer = Math.max(46, Math.min(92, h * 0.1));
  const marginX = Math.max(12, Math.min(40, w * 0.04));
  const availW = Math.max(80, w - marginX * 2);
  const availH = Math.max(80, h - hud - footer);
  const cell = Math.max(16, Math.min(availW / COLS, availH / (SAFE_ROWS + 1.2)));
  const boardW = cell * COLS;
  const boardH = cell * SAFE_ROWS;
  const x = (w - boardW) / 2;
  const y = hud + Math.max(0, (availH - boardH - cell * 1.05) / 2);
  return {
    w,
    h,
    cell,
    ballR: Math.max(4.2, cell * 0.15),
    speed: cell * 8.1,
    board: { x, y, w: boardW, h: boardH },
    launchY: Math.min(h - 16, y + boardH + cell * 0.92),
    collectY: y + boardH + cell * 0.26,
  };
}

const DEFAULT_LAYOUT = fitLayout(VIEW_W, VIEW_H);
export const CELL = DEFAULT_LAYOUT.cell;
export const BOARD = DEFAULT_LAYOUT.board;
export const LAUNCH_Y = DEFAULT_LAYOUT.launchY;
export const COLLECT_Y = DEFAULT_LAYOUT.collectY;
export const BALL_R = DEFAULT_LAYOUT.ballR;
export const SPEED = DEFAULT_LAYOUT.speed;

export const CARDS = [
  { id: 'split', title: 'Split Shot', short: 'Split', rarity: 'common', tags: ['ball'], text: 'A ball splits the first time it hits a block.' },
  { id: 'lightning', title: 'Chain Zap', short: 'Zap', rarity: 'common', tags: ['zap'], text: 'Every 5th bounce zaps the nearest block.' },
  { id: 'pop', title: 'Color Burst', short: 'Burst', rarity: 'common', tags: ['color'], unique: true, text: 'Same-colored neighbors pop together.' },
  { id: 'damage', title: 'Heavy Balls', short: 'Heavy', rarity: 'common', tags: ['power'], text: 'Every hit deals +1 damage.' },
  { id: 'ball', title: 'Extra Ball', short: 'Ball', rarity: 'common', tags: ['ball'], text: 'Add one ball to your volley.' },
  { id: 'explosive', title: 'Blast Core', short: 'Blast', rarity: 'common', tags: ['blast'], text: 'Destroyed blocks splash 1 damage to neighbors.' },
  { id: 'ricochet', title: 'Wall Echo', short: 'Echo', rarity: 'common', tags: ['bounce'], text: '+1 damage for each wall this ball has bounced off.' },
  { id: 'swap', title: 'Color Swap', short: 'Swap', rarity: 'common', tags: ['color'], unique: true, text: 'After a hit, the ball becomes that block\'s color.' },
  { id: 'paint', title: 'Paint Burst', short: 'Paint', rarity: 'uncommon', tags: ['blast', 'color'], cost: 30, unique: true, text: 'Explosions repaint neighbors to the destroyed color.' },
  { id: 'pierce', title: 'Piercing', short: 'Pierce', rarity: 'uncommon', tags: ['ball'], cost: 35, unique: true, text: 'Balls pass through blocks instead of bouncing off.' },
  { id: 'rowscale', title: 'Row Heat', short: 'Heat', rarity: 'uncommon', tags: ['power'], cost: 30, unique: true, text: '+1 damage for every 3 rows cleared this run.' },
  { id: 'spare', title: 'Spare Rack', short: 'Spare', rarity: 'uncommon', tags: ['ball'], cost: 25, text: 'Add one ball, and Ball cards add a second.' },
  { id: 'conductor', title: 'Conductor', short: 'Conduct', rarity: 'rare', tags: ['zap', 'synergy'], cost: 50, unique: true, text: 'Zap triggers one bounce sooner and deals +1. Stronger with Chain Zap.' },
  { id: 'blastcap', title: 'Blast Cap', short: 'Cap', rarity: 'rare', tags: ['blast', 'synergy'], cost: 55, unique: true, text: 'If you hold a Blast card, splashes reach farther and deal +1.' },
  { id: 'prism', title: 'Prism', short: 'Prism', rarity: 'rare', tags: ['color', 'synergy'], cost: 50, unique: true, text: 'Same-color hits deal +1 more. Another Color card makes that +2.' },
  { id: 'prismseed', title: 'Prism Seed', short: 'Seed', rarity: 'rare', tags: ['color'], cost: 60, unique: true, text: 'A rainbow ball appears after 2 same-color clears, not 3.' },
  { id: 'giant', title: 'Giant Slayer', short: 'Slayer', rarity: 'uncommon', tags: ['power'], cost: 40, unique: true, text: 'Bosses take +3 damage.' },
  { id: 'echo', title: 'Split Echo', short: 'Duo', rarity: 'rare', tags: ['ball', 'synergy'], cost: 55, unique: true, text: 'Split balls split once more if you also hold Split Shot.' },
];

export const BALL_TYPES = [
  { id: 'standard', name: 'Standard', cost: 0, text: 'Plain colored balls.' },
  { id: 'heavy', name: 'Heavy', cost: 25, text: 'Every hit deals +1 damage.' },
  { id: 'pierce', name: 'Piercing', cost: 40, text: 'Balls pass through blocks.' },
  { id: 'split', name: 'Splitting', cost: 45, text: 'Balls split the first time they hit.' },
];

export function cardById(id) {
  return CARDS.find((card) => card.id === id);
}

export function countCard(state, id) {
  return state.held.reduce((n, held) => n + (held === id ? 1 : 0), 0);
}

export function tagCount(state, tag) {
  return state.held.reduce((n, id) => n + (cardById(id)?.tags.includes(tag) ? 1 : 0), 0);
}

export function gemsFor(state) {
  return state.rowsCleared + state.bosses * 4 + (state.bonusGems || 0);
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

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function renorm(ball, speed) {
  const m = Math.hypot(ball.vx, ball.vy) || 1;
  ball.vx = (ball.vx / m) * speed;
  ball.vy = (ball.vy / m) * speed;
}

export function blockRect(block, visualRow = block.row, layout = DEFAULT_LAYOUT) {
  const cell = layout.cell;
  const pad = Math.max(2, cell * 0.07);
  return {
    x: layout.board.x + block.col * cell + pad,
    y: layout.board.y + visualRow * cell + pad,
    w: cell * block.span - pad * 2,
    h: cell - pad * 2,
  };
}

export function blockCenter(block, visualRow = block.row, layout = DEFAULT_LAYOUT) {
  const rect = blockRect(block, visualRow, layout);
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}

export function applyLayout(state, w, h) {
  const next = fitLayout(w, h);
  const prev = state.layout;
  if (prev && prev.board.w > 0) {
    const sx = next.board.w / prev.board.w;
    const sy = next.board.h / prev.board.h;
    const mapX = (x) => next.board.x + (x - prev.board.x) * sx;
    const mapY = (y) => next.board.y + (y - prev.board.y) * sy;
    state.originX = clamp(mapX(state.originX), next.board.x + next.cell * 0.4, next.board.x + next.board.w - next.cell * 0.4);
    for (const ball of state.balls) {
      ball.x = mapX(ball.x);
      ball.y = mapY(ball.y);
      ball.r = next.ballR;
      renorm(ball, next.speed);
      ball.trail = ball.trail.map((p) => ({ x: mapX(p.x), y: mapY(p.y) }));
    }
    for (const p of state.particles) {
      p.x = mapX(p.x);
      p.y = mapY(p.y);
    }
    for (const f of state.floats) {
      f.x = mapX(f.x);
      f.y = mapY(f.y);
    }
  } else {
    state.originX = next.board.x + next.board.w / 2;
  }
  state.layout = next;
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
    const hp = state.level <= 10 ? 12 : 8 + state.level * 2;
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
  const chance = Math.min(0.42, 0.12 + state.level * 0.018);
  const normals = state.blocks.filter((block) => block.rowId === rowId && block.kind === 'block');
  if (normals.length && state.rng() < chance) {
    const surprise = normals[Math.floor(state.rng() * normals.length)];
    surprise.kind = 'surprise';
    surprise.hp = 1;
    surprise.maxHp = 1;
  }
}

export function createRun(seed = 1, options = {}) {
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
    originX: 0,
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
    held: options.startCard ? [options.startCard] : [],
    ballType: options.ballType || 'standard',
    deck: options.deck || null,
    bosses: 0,
    bonusGems: 0,
    volleyClears: {},
    gemsBanked: false,
    toasts: [],
    time: 0,
    freezeNext: false,
    wobble: false,
    nextShrink: 1,
    nextSlow: 1,
    volleyShrink: 1,
    volleySlow: 1,
    particles: [],
    floats: [],
    bolts: [],
    shake: 0,
    nextOrigin: null,
    over: false,
    layout: fitLayout(VIEW_W, VIEW_H),
  };
  state.originX = state.layout.board.x + state.layout.board.w / 2;
  addRow(state, 0, false);
  addRow(state, 1, false);
  addRow(state, 2, false);
  ensureEarlySurprise(state);
  return state;
}

function ensureEarlySurprise(state) {
  if (state.blocks.some((block) => !block.dead && block.kind === 'surprise')) return;
  const candidates = state.blocks.filter((block) => !block.dead && block.kind === 'block' && block.row <= 2);
  if (!candidates.length) return;
  const surprise = candidates[Math.floor(state.rng() * candidates.length)];
  surprise.kind = 'surprise';
  surprise.hp = 1;
  surprise.maxHp = 1;
}

export function aimToward(state, x, y) {
  let ang = Math.atan2(y - state.layout.launchY, x - state.originX);
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
    state.rowsCleared += 1;
  }
}

function hitDamage(state, ball, block) {
  const bonus = countCard(state, 'damage') + countCard(state, 'rowscale') * Math.floor(state.rowsCleared / 3);
  const synergyPower = tagCount(state, 'synergy') && tagCount(state, 'power') ? 1 : 0;
  const matched = ball.rainbow || ball.color === block.color;
  let colorMult = 1;
  if (matched) {
    colorMult = 2 + countCard(state, 'prism');
    if (tagCount(state, 'color') >= 2) colorMult += 1;
  }
  let amount = (1 + bonus + synergyPower) * colorMult;
  if (ball.rainbow) amount += 2;
  if (state.ballType === 'heavy') amount += 1;
  amount += (ball.wallHits || 0) * countCard(state, 'ricochet');
  if (block.kind === 'boss' || block.kind === 'miniboss') amount += 3 * countCard(state, 'giant');
  return amount;
}

function neighbors(state, block, range) {
  const found = [];
  for (const other of state.blocks) {
    if (other === block || other.dead || other.kind === 'pickup') continue;
    let near = false;
    for (const ca of occupies(block)) {
      for (const cb of occupies(other)) {
        if (Math.abs(ca.r - cb.r) + Math.abs(ca.c - cb.c) <= range) near = true;
      }
    }
    if (near) found.push(other);
  }
  return found;
}

function spawnRainbow(state, x, y) {
  if (state.balls.length >= 28) return;
  const ang = -Math.PI / 2 + (state.rng() - 0.5) * 1.1;
  const ball = makeBall(state, 0, ang, true, x, y);
  ball.rainbow = true;
  ball.child = true;
  state.balls.push(ball);
  floatText(state, x, y - 18, 'RAINBOW', '#ffe66d');
  PALETTE.forEach((color, i) => burst(state, x, y, color, 3, 90 + i * 8));
  state.shake = Math.max(state.shake, 7);
}

function noteColorClear(state, color, x, y) {
  state.volleyClears[color] = (state.volleyClears[color] || 0) + 1;
  const need = countCard(state, 'prismseed') ? 2 : 3;
  const n = state.volleyClears[color];
  if (n >= need && n % need === 0) spawnRainbow(state, x, y);
}

function destroyBlock(state, block, fromExplosion) {
  if (block.dead || block.kind === 'pickup') return;
  block.dead = true;
  block.hp = 0;
  if (block.kind === 'boss') state.bosses += 1;
  state.score += block.kind === 'boss' ? 400 : block.kind === 'miniboss' ? 120 : 50;
  const c = blockCenter(block, block.row, state.layout);
  burst(state, c.x, c.y, PALETTE[block.color], block.kind === 'boss' ? 18 : 10, block.kind === 'boss' ? 180 : 110);
  state.shake = Math.max(state.shake, block.kind === 'boss' ? 9 : 4);
  noteColorClear(state, block.color, c.x, c.y);
  if (countCard(state, 'pop')) {
    for (const other of state.blocks) {
      if (other.dead || (other.kind !== 'block' && other.kind !== 'boss')) continue;
      if (other.color === block.color && adjacent(block, other)) destroyBlock(state, other, fromExplosion);
    }
  }
  const splash = countCard(state, 'explosive') + (countCard(state, 'blastcap') && tagCount(state, 'blast') ? 1 : 0);
  if (!fromExplosion && splash > 0) {
    const range = countCard(state, 'blastcap') && countCard(state, 'explosive') ? 2 : 1;
    const paint = countCard(state, 'paint') > 0;
    for (const other of neighbors(state, block, range)) {
      if (paint) other.color = block.color;
      hurt(state, other, splash, c.x, c.y, true);
    }
  }
  checkRows(state);
}

function hurt(state, block, amount, x, y, fromExplosion) {
  if (block.dead || block.kind === 'pickup') return;
  block.hp -= amount;
  block.flash = 0.12;
  state.score += amount * 8;
  floatText(state, x, y, String(amount), '#fff');
  if (block.hp <= 0) {
    if (block.kind === 'surprise') breakSurprise(state, block);
    else destroyBlock(state, block, fromExplosion);
  }
}

const SURPRISES = [
  { id: 'balls', good: true, title: '+3 balls', detail: 'Three balls join this run.' },
  { id: 'bomb', good: true, title: 'Bomb', detail: 'The blocks around it blow apart.' },
  { id: 'rowzap', good: true, title: 'Row lightning', detail: 'Every block in that row is struck.' },
  { id: 'card', good: true, weight: 4, title: 'Card', detail: 'A card joins your hand.' },
  { id: 'offer', good: true, weight: 2, title: 'Card offer', detail: 'Pick 1 of 3 cards after this volley.' },
  { id: 'gems', good: true, title: 'Gem shower', detail: '+5 bonus gems this run.' },
  { id: 'freeze', good: true, title: 'Freeze', detail: 'Blocks do not advance next turn.' },
  { id: 'rainbow', good: true, title: 'Rainbow ball', detail: 'A rainbow ball joins the volley.' },
  { id: 'extrarow', good: false, title: 'Extra blocks', detail: 'More blocks appear up top.' },
  { id: 'fatten', good: false, title: 'Reinforced', detail: 'The nearest row gains hit points.' },
  { id: 'recolor', good: false, title: 'Color shift', detail: 'One of your balls changes color.' },
  { id: 'sluggish', good: false, title: 'Sluggish', detail: 'Balls are smaller and slower next volley.' },
  { id: 'miniboss', good: false, title: 'Mini boss', detail: 'A tough block appears at the top.' },
  { id: 'wobble', good: false, title: 'Aim wobble', detail: 'Your next aim wavers.' },
];

function toast(state, title, detail, good) {
  state.toasts = state.toasts || [];
  state.toasts.unshift({ title, detail, good, life: 2.6, max: 2.6 });
  if (state.toasts.length > 3) state.toasts.length = 3;
}

function cellTaken(state, row, col) {
  return state.blocks.some((block) => {
    if (block.dead || block.row !== row) return false;
    return col >= block.col && col < block.col + block.span;
  });
}

function placeBlock(state, row, col, span, hp, kind) {
  state.blocks.push({
    id: state.nextBlockId++,
    row,
    col,
    span,
    hp,
    maxHp: hp,
    color: pickColor(state),
    kind,
    rowId: state.nextRowId++,
    dead: false,
  });
}

function spawnGapBlocks(state, count, hp) {
  let placed = 0;
  for (let row = 0; row < SAFE_ROWS - 2 && placed < count; row++) {
    const free = [];
    for (let col = 0; col < COLS; col++) if (!cellTaken(state, row, col)) free.push(col);
    for (const col of shuffle(state.rng, free)) {
      if (placed >= count) break;
      placeBlock(state, row, col, 1, hp, 'block');
      placed += 1;
    }
  }
  return placed;
}

function weightedSurprise(state, pool) {
  const total = pool.reduce((sum, item) => sum + (item.weight || 1), 0);
  let roll = state.rng() * total;
  for (const item of pool) {
    roll -= item.weight || 1;
    if (roll <= 0) return item;
  }
  return pool[pool.length - 1];
}

function grantCard(state, card) {
  state.held.push(card.id);
  if (card.id === 'ball' || card.id === 'spare') {
    state.magazine.push(pickColor(state));
    if (countCard(state, 'ball') && countCard(state, 'spare')) state.magazine.push(pickColor(state));
  }
  return card;
}

function drawGiftCard(state) {
  let pool = deckOf(state).filter((card) => !(card.unique && state.held.includes(card.id)));
  if (!pool.length) pool = deckOf(state);
  const total = pool.reduce((sum, card) => sum + offerWeight(state, card), 0);
  let roll = state.rng() * total;
  for (const card of pool) {
    roll -= offerWeight(state, card);
    if (roll <= 0) return card;
  }
  return pool[pool.length - 1];
}

function rollSurprise(state, block, at) {
  const good = state.rng() < 0.6;
  const pool = SURPRISES.filter((item) => item.good === good);
  const effect = weightedSurprise(state, pool);
  let detail = effect.detail;
  if (effect.id === 'balls') {
    for (let i = 0; i < 3; i++) state.pendingBalls.push(pickColor(state));
  } else if (effect.id === 'bomb') {
    const splash = 4 + countCard(state, 'explosive');
    for (const other of neighbors(state, block, 1)) hurt(state, other, splash, at.x, at.y, true);
  } else if (effect.id === 'rowzap') {
    const dmg = 3 + countCard(state, 'damage') + countCard(state, 'conductor');
    for (const other of state.blocks) {
      if (other.dead || other.row !== block.row || other.id === block.id) continue;
      const c = blockCenter(other, other.row, state.layout);
      state.bolts.push({ x1: at.x, y1: at.y, x2: c.x, y2: c.y, life: 0.28 });
      hurt(state, other, dmg, c.x, c.y, true);
    }
  } else if (effect.id === 'card') {
    const card = grantCard(state, drawGiftCard(state));
    detail = `${card.title} joins your hand.`;
  } else if (effect.id === 'offer') {
    state.rewardQueued = true;
  } else if (effect.id === 'gems') {
    state.bonusGems += 5;
  } else if (effect.id === 'freeze') {
    state.freezeNext = true;
  } else if (effect.id === 'rainbow') {
    spawnRainbow(state, at.x, at.y);
  } else if (effect.id === 'extrarow') {
    const hp = 1 + Math.floor((state.level - 1) / 3);
    if (!spawnGapBlocks(state, 3, hp)) {
      for (const other of state.blocks) if (!other.dead && other.kind !== 'pickup') other.hp += 1;
    }
  } else if (effect.id === 'fatten') {
    let row = block.row;
    if (!state.blocks.some((other) => !other.dead && other.row === row && other.id !== block.id)) {
      const rows = state.blocks.filter((other) => !other.dead).map((other) => other.row);
      row = rows.sort((a, b) => Math.abs(a - block.row) - Math.abs(b - block.row))[0] ?? row;
    }
    for (const other of state.blocks) {
      if (!other.dead && other.row === row && other.id !== block.id && other.kind !== 'pickup') other.hp += 2;
    }
  } else if (effect.id === 'recolor') {
    if (state.magazine.length) {
      const index = Math.floor(state.rng() * state.magazine.length);
      state.magazine[index] = (state.magazine[index] + 1 + Math.floor(state.rng() * 4)) % PALETTE.length;
    }
  } else if (effect.id === 'sluggish') {
    state.nextShrink = 0.62;
    state.nextSlow = 0.7;
  } else if (effect.id === 'miniboss') {
    let placed = false;
    for (let row = 0; row < 3 && !placed; row++) {
      for (let col = 0; col < COLS - 1; col++) {
        if (!cellTaken(state, row, col) && !cellTaken(state, row, col + 1)) {
          placeBlock(state, row, col, 2, 8, 'miniboss');
          placed = true;
          break;
        }
      }
    }
  } else if (effect.id === 'wobble') {
    state.wobble = true;
  }
  toast(state, effect.title, detail, effect.good);
}

function breakSurprise(state, block) {
  if (block.dead) return;
  block.dead = true;
  block.hp = 0;
  state.score += 40;
  const at = blockCenter(block, block.row, state.layout);
  PALETTE.forEach((color) => burst(state, at.x, at.y, color, 4, 120));
  state.shake = Math.max(state.shake, 6);
  if (state.resolvingSurprise) {
    checkRows(state);
    return;
  }
  state.resolvingSurprise = true;
  rollSurprise(state, block, at);
  state.resolvingSurprise = false;
  checkRows(state);
}

function collectPickup(state, block) {
  if (block.dead) return;
  block.dead = true;
  state.pendingBalls.push(block.color);
  state.score += 40;
  const c = blockCenter(block, block.row, state.layout);
  burst(state, c.x, c.y, '#fff', 8, 90);
  floatText(state, c.x, c.y - 8, '+ball', PALETTE[block.color]);
  checkRows(state);
}

function zap(state, ball) {
  let best = null;
  let bestD = state.layout.cell * 5;
  for (const block of state.blocks) {
    if (block.dead || block.kind === 'pickup') continue;
    if (ball.touch && ball.touch.has(block.id)) continue;
    const c = blockCenter(block, block.row, state.layout);
    const d = Math.hypot(c.x - ball.x, c.y - ball.y);
    if (d < bestD) {
      bestD = d;
      best = block;
    }
  }
  if (!best) return;
  const c = blockCenter(best, best.row, state.layout);
  state.bolts.push({ x1: ball.x, y1: ball.y, x2: c.x, y2: c.y, life: 0.16 });
  hurt(state, best, 1 + countCard(state, 'damage') + countCard(state, 'conductor'), c.x, c.y - 10);
}

function splitCount(state, ball) {
  let n = countCard(state, 'split') + (state.ballType === 'split' ? 1 : 0);
  if (countCard(state, 'echo') && countCard(state, 'split')) n += 1;
  if (ball.child && !(countCard(state, 'echo') && countCard(state, 'split'))) return 0;
  if (ball.child) return 1;
  return n;
}

function onHit(state, ball, block) {
  ball.bounces += 1;
  if (block.kind === 'pickup') {
    collectPickup(state, block);
    return;
  }
  const same = !ball.rainbow && ball.color === block.color;
  const amount = hitDamage(state, ball, block);
  const c = blockCenter(block, block.row, state.layout);
  hurt(state, block, amount, c.x, c.y - 12);
  if (same) {
    burst(state, ball.x, ball.y, PALETTE[ball.color], 6, 80);
    floatText(state, c.x, c.y - 28, 'x2', PALETTE[ball.color]);
  }
  if (ball.rainbow) burst(state, ball.x, ball.y, '#fff', 8, 100);
  const splits = splitCount(state, ball);
  if (splits > 0 && !ball.splitDone && state.balls.length < 30) {
    ball.splitDone = true;
    const base = Math.atan2(ball.vy, ball.vx);
    for (let i = 0; i < splits; i++) {
      const sign = i % 2 === 0 ? 1 : -1;
      const ang = base + sign * (0.48 + Math.floor(i / 2) * 0.18);
      const child = makeBall(state, ball.color, ang, true, ball.x, ball.y);
      child.rainbow = !!ball.rainbow;
      state.balls.push(child);
    }
  }
  if (countCard(state, 'swap') && !ball.rainbow) ball.color = block.color;
  const zapEvery = Math.max(3, 5 - countCard(state, 'conductor'));
  if ((countCard(state, 'lightning') || countCard(state, 'conductor')) && ball.bounces > 0 && ball.bounces % zapEvery === 0) {
    zap(state, ball);
  }
}

function makeBall(state, color, angle, child, x, y) {
  const layout = state.layout;
  return {
    x: x ?? state.originX,
    y: y ?? layout.launchY,
    vx: Math.cos(angle) * layout.speed * (state.volleySlow || 1),
    vy: Math.sin(angle) * layout.speed * (state.volleySlow || 1),
    color,
    r: layout.ballR * (state.volleyShrink || 1),
    child: !!child,
    splitDone: false,
    bounces: 0,
    touch: new Set(),
    wall: { left: false, right: false, top: false },
    flat: 0,
    alive: true,
    entered: false,
    rainbow: false,
    wallHits: 0,
    trail: [],
  };
}

export function fire(state) {
  if (state.phase !== 'aim' || state.magazine.length === 0) return false;
  state.phase = 'volley';
  state.volleyTime = 0;
  state.volleyClears = {};
  if (state.wobble) {
    state.aim = clamp(state.aim + (state.rng() - 0.5) * 0.5, -Math.PI + 0.18, -0.18);
    state.wobble = false;
  }
  state.volleyShrink = state.nextShrink || 1;
  state.volleySlow = state.nextSlow || 1;
  state.nextShrink = 1;
  state.nextSlow = 1;
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
  const board = state.layout.board;
  const left = board.x + ball.r;
  const right = board.x + board.w - ball.r;
  const top = board.y + ball.r;
  if (ball.x < left) {
    ball.x = left;
    if (ball.vx < 0) ball.vx = Math.abs(ball.vx);
    if (!ball.wall.left) {
      ball.wall.left = true;
      bounce(ball);
      ball.wallHits = (ball.wallHits || 0) + 1;
      const zapEvery = Math.max(3, 5 - countCard(state, 'conductor'));
      if ((countCard(state, 'lightning') || countCard(state, 'conductor')) && ball.bounces % zapEvery === 0) zap(state, ball);
    }
  } else ball.wall.left = false;
  if (ball.x > right) {
    ball.x = right;
    if (ball.vx > 0) ball.vx = -Math.abs(ball.vx);
    if (!ball.wall.right) {
      ball.wall.right = true;
      bounce(ball);
      ball.wallHits = (ball.wallHits || 0) + 1;
      const zapEvery = Math.max(3, 5 - countCard(state, 'conductor'));
      if ((countCard(state, 'lightning') || countCard(state, 'conductor')) && ball.bounces % zapEvery === 0) zap(state, ball);
    }
  } else ball.wall.right = false;
  if (ball.y < top) {
    ball.y = top;
    if (ball.vy < 0) ball.vy = Math.abs(ball.vy);
    if (!ball.wall.top) {
      ball.wall.top = true;
      bounce(ball);
      ball.wallHits = (ball.wallHits || 0) + 1;
      const zapEvery = Math.max(3, 5 - countCard(state, 'conductor'));
      if ((countCard(state, 'lightning') || countCard(state, 'conductor')) && ball.bounces % zapEvery === 0) zap(state, ball);
    }
  } else ball.wall.top = false;
}

function separate(ball, rect, reflect, speed) {
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
    renorm(ball, speed);
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
    const rect = blockRect(block, block.row, state.layout);
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
    const piercing = countCard(state, 'pierce') > 0 || state.ballType === 'pierce';
    if (!piercing) separate(ball, rect, first, state.layout.speed);
    if (first) {
      ball.touch.add(block.id);
      onHit(state, ball, block);
    }
  }
}

function collect(state, ball) {
  ball.alive = false;
  if (state.nextOrigin == null) {
    const board = state.layout.board;
    const inset = state.layout.cell * 0.4;
    state.nextOrigin = clamp(ball.x, board.x + inset, board.x + board.w - inset);
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
    const speed = state.layout.speed;
    if (Math.abs(ball.vy) < speed * 0.075) ball.flat += h;
    else ball.flat = 0;
    if (ball.flat > 0.4) {
      ball.vy += speed * 0.38;
      ball.flat = 0;
      renorm(ball, speed);
    }
    resolveWalls(state, ball);
    resolveBlocks(state, ball);
    if (ball.y < state.layout.board.y + state.layout.board.h) ball.entered = true;
    if (ball.entered && ball.vy > 0 && ball.y > state.layout.collectY) {
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

function deckOf(state) {
  if (state.deck?.length) return state.deck.map(cardById).filter(Boolean);
  return CARDS.filter((card) => !card.cost);
}

function offerWeight(state, card) {
  let weight = card.rarity === 'rare' ? 1.3 : card.rarity === 'uncommon' ? 2.4 : 4.2;
  const heldTags = new Set(state.held.flatMap((id) => cardById(id)?.tags || []));
  if (card.tags.some((tag) => tag !== 'synergy' && heldTags.has(tag))) weight += 3.4;
  if (card.tags.includes('synergy') && card.tags.some((tag) => tag !== 'synergy' && heldTags.has(tag))) weight += 2.2;
  return weight;
}

function drawOffers(state) {
  let pool = deckOf(state).filter((card) => !(card.unique && state.held.includes(card.id)));
  if (pool.length < 3) pool = deckOf(state).filter((card) => !card.unique || !state.held.includes(card.id));
  const picked = [];
  const bag = pool.slice();
  while (picked.length < 3 && bag.length) {
    const total = bag.reduce((sum, card) => sum + offerWeight(state, card), 0);
    let roll = state.rng() * total;
    let index = bag.length - 1;
    for (let i = 0; i < bag.length; i++) {
      roll -= offerWeight(state, bag[i]);
      if (roll <= 0) {
        index = i;
        break;
      }
    }
    picked.push(bag.splice(index, 1)[0]);
  }
  while (picked.length < 3) picked.push(cardById('ball'));
  return picked.map((card) => ({ ...card }));
}

export function showOffers(state) {
  openCards(state);
}

function openCards(state) {
  state.cardChoices = drawOffers(state);
  state.cardIndex = 0;
  state.phase = 'cards';
}

export function chooseCard(state, index) {
  if (state.phase !== 'cards' || !state.cardChoices) return false;
  const card = state.cardChoices[Math.max(0, Math.min(state.cardChoices.length - 1, index))];
  grantCard(state, card);
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
  if (state.freezeNext) {
    state.freezeNext = false;
    state.phase = 'aim';
    return;
  }
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
  state.time = (state.time || 0) + dt;
  state.shake = Math.max(0, state.shake - dt * 18);
  for (const item of state.toasts || []) item.life -= dt;
  state.toasts = (state.toasts || []).filter((item) => item.life > 0);
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
  const board = state.layout.board;
  let x = state.originX;
  let y = state.layout.launchY;
  let dx = Math.cos(state.aim);
  let dy = Math.sin(state.aim);
  const pts = [{ x, y }];
  for (let bounce = 0; bounce < 5; bounce++) {
    let best = null;
    const consider = (hit) => {
      if (!hit || hit.t < 1.2) return;
      if (!best || hit.t < best.t) best = hit;
    };
    if (dx > 0) consider(rayPoint(x, y, dx, dy, (board.x + board.w - x) / dx, -1, 0));
    if (dx < 0) consider(rayPoint(x, y, dx, dy, (board.x - x) / dx, 1, 0));
    if (dy < 0) consider(rayPoint(x, y, dx, dy, (board.y - y) / dy, 0, 1));
    if (dy > 0) {
      const t = (state.layout.collectY - y) / dy;
      if (t > 1 && (!best || t < best.t)) {
        pts.push({ x: x + dx * t, y: y + dy * t });
        break;
      }
    }
    for (const block of state.blocks) {
      if (block.dead || block.row >= SAFE_ROWS) continue;
      consider(rayAabb(x, y, dx, dy, blockRect(block, block.row, state.layout)));
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

export function triggerSurprise(state, blockId) {
  const block = state.blocks.find((item) => item.id === blockId);
  if (!block || block.dead) return null;
  block.kind = 'surprise';
  breakSurprise(state, block);
  return state.toasts?.[0] || null;
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
