import { CAR_COLORS, DIRS, canExit, cellsOf, generateLevel, onCarExit, stepsToExit } from './logic.js';

let W = 800;
let H = 900;
const stage = document.getElementById('stage');
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const startEl = document.getElementById('start');
const overEl = document.getElementById('over');
const helpEl = document.getElementById('help');
const finalScore = document.getElementById('finalScore');

let started = false;
let phase = 'idle';
let levelNum = 1;
let score = 0;
let levelStartScore = 0;
let hearts = 3;
let maxHearts = 3;
let movesLeft = null;
let movesUsed = 0;
let stars = 0;
let timeLeft = 0;
let timeLimit = 0;
let timerOn = false;
let readyT = 0;
let timeBonus = 0;
let level = null;
let cars = [];
let selected = 0;
let motion = null;
let clearT = 0;
let shake = 0;
let flash = 0;
let particles = [];
let heartPops = [];
let geom = null;
const FONT = '"Fredoka", "Trebuchet MS", "Segoe UI", sans-serif';

function loadLevel(n) {
  levelStartScore = score;
  level = generateLevel(n);
  cars = level.cars.map((car) => ({ ...car }));
  selected = cars[0]?.id ?? 0;
  motion = null;
  phase = 'idle';
  maxHearts = level.hearts || 3;
  hearts = maxHearts;
  movesLeft = level.moveLimit;
  movesUsed = 0;
  stars = 0;
  timeLimit = level.timeLimit || 45;
  timeLeft = timeLimit;
  timerOn = false;
  readyT = 1.05;
  timeBonus = 0;
  phase = 'ready';
}

function startRun() {
  levelNum = 1;
  score = 0;
  hearts = 3;
  particles = [];
  heartPops = [];
  shake = 0;
  flash = 0;
  loadLevel(1);
}

function restartLevel() {
  score = levelStartScore;
  particles = [];
  heartPops = [];
  shake = 0;
  flash = 0;
  loadLevel(levelNum);
}

function gameOver(reason) {
  phase = 'over';
  timerOn = false;
  document.querySelector('#over h1').textContent = reason === 'time' ? "TIME'S UP" : 'STUCK';
  finalScore.textContent = `Score ${score}  ·  Lv ${levelNum}`;
  overEl.classList.remove('hidden');
  document.getElementById('retryLevelBtn').focus();
}

function formatTime(seconds) {
  const total = Math.max(0, Math.ceil(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function clockPaused() {
  return !helpEl.classList.contains('hidden')
    || !startEl.classList.contains('hidden')
    || !overEl.classList.contains('hidden');
}

function metrics() {
  const size = level?.size || 4;
  const hud = Math.max(64, Math.min(96, H * 0.09));
  const margin = Math.max(12, Math.min(28, Math.min(W, H) * 0.03));
  const availW = W - margin * 2;
  const availH = H - hud - margin;
  const cell = Math.floor(Math.min(availW, availH) / (size + 1.35));
  const board = cell * size;
  return {
    cell,
    x: (W - board) / 2,
    y: hud + (availH - board) / 2,
    board,
    size,
    hud,
  };
}

function roundRect(x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function carById(id) {
  return cars.find((car) => car.id === id);
}

function moveSelection(dir) {
  const cur = carById(selected) || cars[0];
  if (!cur) return;
  let best = null;
  let bestScore = Infinity;
  for (const car of cars) {
    if (car.id === cur.id) continue;
    const dr = car.r - cur.r;
    const dc = car.c - cur.c;
    if (dir === 0 && dr >= 0) continue;
    if (dir === 1 && dc <= 0) continue;
    if (dir === 2 && dr <= 0) continue;
    if (dir === 3 && dc >= 0) continue;
    const primary = dir % 2 === 0 ? Math.abs(dr) : Math.abs(dc);
    const secondary = dir % 2 === 0 ? Math.abs(dc) : Math.abs(dr);
    if (primary === 0) continue;
    const score = primary * 10 + secondary;
    if (score < bestScore) {
      bestScore = score;
      best = car;
    }
  }
  if (best) selected = best.id;
}

function activate(id) {
  if (phase !== 'idle') return;
  const car = carById(id);
  if (!car) return;
  selected = id;
  const ok = canExit(level, cars, car);
  movesUsed += 1;
  if (movesLeft != null) movesLeft -= 1;
  motion = {
    id,
    kind: ok ? 'exit' : 'bump',
    t: 0,
    dur: ok ? 0.16 + stepsToExit(level.size, car) * 0.045 : 0.28,
    dist: stepsToExit(level.size, car),
  };
  phase = 'move';
}

function finishMove() {
  const car = carById(motion.id);
  const kind = motion.kind;
  motion = null;
  if (!car) {
    phase = 'idle';
    return;
  }
  if (kind === 'bump') {
    hearts -= 1;
    heartPops.push({ index: hearts, t: 0.45 });
    shake = 7;
    flash = 0.25;
    if (hearts <= 0 || (movesLeft != null && movesLeft <= 0)) return gameOver();
    phase = 'idle';
    return;
  }
  onCarExit(level, cars, car);
  const g = geom || metrics();
  const { dr, dc } = DIRS[car.dir];
  const px = g.x + car.c * g.cell + g.cell / 2 + dc * g.cell * 0.2;
  const py = g.y + car.r * g.cell + g.cell / 2 + dr * g.cell * 0.2;
  for (let i = 0; i < 14; i++) {
    const a = Math.random() * Math.PI * 2;
    const spark = i % 3 === 0;
    particles.push({
      x: px,
      y: py,
      vx: Math.cos(a) * (spark ? 70 : 130),
      vy: Math.sin(a) * (spark ? 70 : 130),
      life: spark ? 0.5 : 0.38,
      max: spark ? 0.5 : 0.38,
      color: spark ? '#fff7c2' : CAR_COLORS[car.color % CAR_COLORS.length],
      star: spark,
      r: spark ? 7 : 4,
    });
  }
  cars = cars.filter((item) => item.id !== car.id);
  score += 100;
  if (!cars.length) {
    const par = level.par || movesUsed;
    stars = movesUsed <= par ? 3 : movesUsed <= par + 1 ? 2 : 1;
    timeBonus = Math.ceil(timeLeft) * 10;
    score += 350 + hearts * 60 + stars * 50 + timeBonus;
    timerOn = false;
    phase = 'clear';
    clearT = 1.1;
    return;
  }
  if (movesLeft != null && movesLeft <= 0) return gameOver();
  if (!carById(selected)) selected = cars[0].id;
  phase = 'idle';
}

function gameFont(size) {
  return `700 ${Math.round(size)}px ${FONT}`;
}

function shiftColor(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (shift) => Math.max(0, Math.min(255, ((n >> shift) & 255) + amt));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

function chunkText(text, x, y, size, fill, stroke = '#1a2740') {
  ctx.font = gameFont(size);
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(4, size * 0.16);
  ctx.strokeStyle = stroke;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

function heartPath(s) {
  ctx.beginPath();
  ctx.moveTo(0, s * 0.35);
  ctx.bezierCurveTo(-s * 0.95, -s * 0.15, -s * 0.55, -s * 0.95, 0, -s * 0.42);
  ctx.bezierCurveTo(s * 0.55, -s * 0.95, s * 0.95, -s * 0.15, 0, s * 0.35);
}

function drawHeart(x, y, filled, pop) {
  const scale = 1 + (pop ? Math.sin((1 - pop / 0.45) * Math.PI) * 0.45 : 0);
  const tilt = pop ? Math.sin(pop * 40) * 0.25 : 0;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  ctx.scale(scale, scale);
  ctx.shadowColor = 'rgba(80, 16, 28, .35)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 3;
  heartPath(16);
  if (filled) {
    const grad = ctx.createLinearGradient(0, -16, 0, 10);
    grad.addColorStop(0, '#ff8fa0');
    grad.addColorStop(0.45, '#ff3355');
    grad.addColorStop(1, '#b01030');
    ctx.fillStyle = grad;
  } else {
    ctx.fillStyle = '#c5ced6';
  }
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = 2;
  ctx.strokeStyle = filled ? '#7a1024' : '#8b98a3';
  heartPath(16);
  ctx.stroke();
  if (filled) {
    ctx.fillStyle = 'rgba(255,255,255,.7)';
    ctx.beginPath();
    ctx.ellipse(-4, -6, 3.2, 2, -0.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function arrowPath(dir, s) {
  ctx.beginPath();
  if (dir === 0) {
    ctx.moveTo(0, -s);
    ctx.lineTo(s * 0.92, s * 0.62);
    ctx.lineTo(0, s * 0.22);
    ctx.lineTo(-s * 0.92, s * 0.62);
  } else if (dir === 1) {
    ctx.moveTo(s, 0);
    ctx.lineTo(-s * 0.62, -s * 0.92);
    ctx.lineTo(-s * 0.22, 0);
    ctx.lineTo(-s * 0.62, s * 0.92);
  } else if (dir === 2) {
    ctx.moveTo(0, s);
    ctx.lineTo(s * 0.92, -s * 0.62);
    ctx.lineTo(0, -s * 0.22);
    ctx.lineTo(-s * 0.92, -s * 0.62);
  } else {
    ctx.moveTo(-s, 0);
    ctx.lineTo(s * 0.62, -s * 0.92);
    ctx.lineTo(s * 0.22, 0);
    ctx.lineTo(s * 0.62, s * 0.92);
  }
  ctx.closePath();
}

function drawArrow(cx, cy, dir, s) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = '#1a2740';
  ctx.save();
  ctx.scale(1.28, 1.28);
  arrowPath(dir, s);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#fff';
  arrowPath(dir, s);
  ctx.fill();
  ctx.restore();
}

function drawPadlock(cx, cy, s) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.lineWidth = Math.max(3, s * 0.14);
  ctx.strokeStyle = '#3a2a12';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(0, -s * 0.08, s * 0.34, Math.PI * 0.98, Math.PI * 0.02, false);
  ctx.stroke();
  const grad = ctx.createLinearGradient(0, 0, 0, s);
  grad.addColorStop(0, '#ffe38a');
  grad.addColorStop(0.5, '#f0b429');
  grad.addColorStop(1, '#c47a12');
  ctx.fillStyle = grad;
  roundRect(-s * 0.42, -s * 0.02, s * 0.84, s * 0.7, s * 0.16);
  ctx.fill();
  ctx.strokeStyle = '#8a5a10';
  ctx.lineWidth = 2;
  roundRect(-s * 0.42, -s * 0.02, s * 0.84, s * 0.7, s * 0.16);
  ctx.stroke();
  ctx.fillStyle = '#3a2a12';
  ctx.beginPath();
  ctx.arc(0, s * 0.24, s * 0.09, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(-s * 0.045, s * 0.28, s * 0.09, s * 0.18);
  ctx.restore();
}

function drawSwap(cx, cy, s) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((performance.now() / 1400) % (Math.PI * 2));
  const drawArc = (start) => {
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.34, start, start + 2.1);
    ctx.stroke();
    const end = start + 2.1;
    ctx.beginPath();
    ctx.moveTo(Math.cos(end) * s * 0.34, Math.sin(end) * s * 0.34);
    ctx.lineTo(Math.cos(end) * s * 0.52, Math.sin(end) * s * 0.18);
    ctx.lineTo(Math.cos(end) * s * 0.16, Math.sin(end) * s * 0.16);
    ctx.closePath();
    ctx.fill();
  };
  ctx.lineWidth = Math.max(5, s * 0.16);
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#1a2740';
  ctx.fillStyle = '#1a2740';
  drawArc(0.3);
  drawArc(Math.PI + 0.3);
  ctx.lineWidth = Math.max(3, s * 0.09);
  ctx.strokeStyle = '#fff';
  ctx.fillStyle = '#fff';
  drawArc(0.3);
  drawArc(Math.PI + 0.3);
  ctx.restore();
}

function candyFill(x, y, w, h, color, radius) {
  ctx.fillStyle = 'rgba(20, 32, 48, .16)';
  roundRect(x + 1, y + 3, w, h, radius);
  ctx.fill();
  const grad = ctx.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, shiftColor(color, 18));
  grad.addColorStop(0.55, color);
  grad.addColorStop(1, shiftColor(color, -16));
  ctx.fillStyle = grad;
  roundRect(x, y, w, h, radius);
  ctx.fill();
  ctx.save();
  roundRect(x, y, w, h, radius);
  ctx.clip();
  const hi = ctx.createLinearGradient(x, y, x, y + h * 0.42);
  hi.addColorStop(0, 'rgba(255,255,255,.12)');
  hi.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hi;
  ctx.fillRect(x, y, w, h * 0.42);
  ctx.restore();
}

function flatGate(x, y, w, h, color, radius) {
  ctx.fillStyle = color;
  roundRect(x, y, w, h, radius);
  ctx.fill();
  ctx.strokeStyle = shiftColor(color, -35);
  ctx.lineWidth = 2;
  roundRect(x + 1, y + 1, w - 2, h - 2, Math.max(3, radius - 2));
  ctx.stroke();
}

function carOffset(car) {
  if (!motion || motion.id !== car.id) return { x: 0, y: 0 };
  const { dr, dc } = DIRS[car.dir];
  const u = motion.t / motion.dur;
  const mag = motion.kind === 'exit' ? ease(Math.min(1, u)) * motion.dist : Math.sin(Math.min(1, u) * Math.PI) * 0.36;
  const cell = (geom || metrics()).cell;
  return { x: dc * mag * cell, y: dr * mag * cell };
}

function ease(t) {
  return t * t * (3 - 2 * t);
}

function render() {
  geom = metrics();
  const g = geom;
  const scale = canvas.width / W;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, flash > 0 ? '#f7c7c7' : '#c5dff3');
  bg.addColorStop(1, flash > 0 ? '#e7a8a8' : '#8fb4d4');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const hudY = Math.max(42, g.hud * 0.42);
  const levelSize = Math.max(18, Math.min(26, W * 0.028));
  roundRect(W / 2 - 54, hudY - 16 - levelSize * 0.7, 108, levelSize + 10, 14);
  ctx.fillStyle = 'rgba(255,255,255,.72)';
  ctx.fill();
  chunkText(`Lv ${levelNum}`, W / 2, hudY - 16, levelSize, '#fff');
  const low = timerOn && timeLeft <= 8;
  const pulse = low ? 1 + 0.08 * Math.sin(performance.now() / 90) : 1;
  const timeLabel = phase === 'ready' ? 'READY' : formatTime(timeLeft);
  const timeSize = Math.max(26, Math.min(38, W * 0.04));
  ctx.save();
  ctx.translate(W / 2, hudY + 22);
  ctx.scale(pulse, pulse);
  roundRect(-58, -timeSize * 0.62, 116, timeSize + 8, 18);
  ctx.fillStyle = low ? '#ffd0d6' : 'rgba(255,255,255,.88)';
  ctx.fill();
  chunkText(timeLabel, 0, 0, timeSize, low ? '#ff2d4a' : '#fff', low ? '#7a1024' : '#1a2740');
  ctx.restore();
  const scoreSize = Math.max(22, Math.min(32, W * 0.034));
  const scoreLabel = String(score);
  ctx.font = gameFont(scoreSize);
  const scoreW = Math.max(64, ctx.measureText(scoreLabel).width + 28);
  roundRect(W - 16 - scoreW, hudY - scoreSize * 0.7, scoreW, scoreSize + 10, 16);
  ctx.fillStyle = 'rgba(255,255,255,.88)';
  ctx.fill();
  ctx.textAlign = 'center';
  chunkText(scoreLabel, W - 16 - scoreW / 2, hudY - 2, scoreSize, '#fff7c2');
  for (let i = 0; i < maxHearts; i++) {
    const pop = heartPops.find((item) => item.index === i);
    drawHeart(36 + i * 38, hudY, i < hearts, pop ? pop.t : 0);
  }
  if (movesLeft != null) {
    ctx.textAlign = 'right';
    chunkText(`${movesLeft} moves`, W - 18, hudY + 34, Math.max(15, Math.min(18, W * 0.02)), '#fff');
    ctx.textAlign = 'center';
  }

  ctx.fillStyle = '#6e93b8';
  roundRect(g.x - 14, g.y - 14, g.board + 28, g.board + 28, 22);
  ctx.fill();
  ctx.fillStyle = '#f4fbff';
  roundRect(g.x - 6, g.y - 6, g.board + 12, g.board + 12, 16);
  ctx.fill();
  ctx.strokeStyle = 'rgba(80, 120, 160, .18)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= g.size; i++) {
    ctx.beginPath();
    ctx.moveTo(g.x + i * g.cell, g.y);
    ctx.lineTo(g.x + i * g.cell, g.y + g.board);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(g.x, g.y + i * g.cell);
    ctx.lineTo(g.x + g.board, g.y + i * g.cell);
    ctx.stroke();
  }

  for (const rock of level.rocks || []) {
    const pad = g.cell * 0.08;
    const x = g.x + rock.c * g.cell + pad;
    const y = g.y + rock.r * g.cell + pad;
    const s = g.cell - pad * 2;
    ctx.fillStyle = 'rgba(20,32,48,.3)';
    roundRect(x + 3, y + 6, s, s, s * 0.28);
    ctx.fill();
    const stone = ctx.createLinearGradient(x, y, x + s, y + s);
    stone.addColorStop(0, '#d5dde6');
    stone.addColorStop(0.45, '#8b98a8');
    stone.addColorStop(1, '#4e5966');
    ctx.fillStyle = stone;
    ctx.beginPath();
    ctx.moveTo(x + s * 0.2, y + s * 0.08);
    ctx.lineTo(x + s * 0.78, y + s * 0.02);
    ctx.lineTo(x + s * 0.96, y + s * 0.38);
    ctx.lineTo(x + s * 0.84, y + s * 0.92);
    ctx.lineTo(x + s * 0.22, y + s);
    ctx.lineTo(x + s * 0.04, y + s * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.45)';
    ctx.beginPath();
    ctx.ellipse(x + s * 0.38, y + s * 0.28, s * 0.16, s * 0.08, -0.4, 0, Math.PI * 2);
    ctx.fill();
  }

  const exitSize = Math.max(18, g.cell * 0.58);
  const drawExit = (gate, x, y) => {
    const color = typeof gate === 'number' ? gate : gate.color;
    const uses = typeof gate === 'number' ? Infinity : gate.uses;
    const hex = uses <= 0 ? '#9aa8b5' : CAR_COLORS[color % CAR_COLORS.length];
    flatGate(x, y, exitSize, exitSize, hex, exitSize * 0.28);
    if (gate?.cycle?.length) {
      const next = gate.cycle[(gate.index + 1) % gate.cycle.length];
      ctx.save();
      roundRect(x, y, exitSize, exitSize, exitSize * 0.28);
      ctx.clip();
      ctx.fillStyle = CAR_COLORS[next % CAR_COLORS.length];
      ctx.fillRect(x + exitSize * 0.5, y, exitSize * 0.5, exitSize);
      ctx.restore();
      ctx.fillStyle = '#1a2740';
      ctx.beginPath();
      ctx.moveTo(x + exitSize * 0.42, y + exitSize * 0.28);
      ctx.lineTo(x + exitSize * 0.62, y + exitSize * 0.5);
      ctx.lineTo(x + exitSize * 0.42, y + exitSize * 0.72);
      ctx.closePath();
      ctx.fill();
    }
    if (uses === 1) {
      const badge = Math.max(16, exitSize * 0.55);
      ctx.fillStyle = '#1a2740';
      ctx.beginPath();
      ctx.arc(x + exitSize * 0.28, y + exitSize * 0.3, badge * 0.55, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(x + exitSize * 0.28, y + exitSize * 0.3, badge * 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      chunkText('1', x + exitSize * 0.28, y + exitSize * 0.32, badge * 0.7, '#1a2740', '#fff');
    }
  };
  for (let i = 0; i < g.size; i++) {
    const inset = (g.cell - exitSize) / 2;
    drawExit(level.exits.up[i], g.x + i * g.cell + inset, g.y - exitSize - 6);
    drawExit(level.exits.down[i], g.x + i * g.cell + inset, g.y + g.board + 6);
    drawExit(level.exits.left[i], g.x - exitSize - 6, g.y + i * g.cell + inset);
    drawExit(level.exits.right[i], g.x + g.board + 6, g.y + i * g.cell + inset);
  }

  for (const car of cars) {
    const off = carOffset(car);
    const pad = g.cell * 0.1;
    const cells = cellsOf(car);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [r, c] of cells) {
      const x = g.x + c * g.cell + off.x;
      const y = g.y + r * g.cell + off.y;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + g.cell);
      maxY = Math.max(maxY, y + g.cell);
    }
    const x = minX + pad;
    const y = minY + pad;
    const w = maxX - minX - pad * 2;
    const h = maxY - minY - pad * 2;
    const radius = Math.min(18, Math.min(w, h) * 0.28);
    const locked = car.lock && cars.some((other) => other.id === car.lock);
    const hex = CAR_COLORS[car.color % CAR_COLORS.length];
    if (car.shift) {
      const next = CAR_COLORS[(car.color + 1) % level.colorCount];
      candyFill(x, y, w * 0.52, h, hex, radius);
      candyFill(x + w * 0.48, y, w * 0.52, h, next, radius);
      ctx.strokeStyle = '#1a2740';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x + w * 0.5, y + 4);
      ctx.lineTo(x + w * 0.5, y + h - 4);
      ctx.stroke();
    } else {
      candyFill(x, y, w, h, hex, radius);
    }
    if (locked) {
      ctx.save();
      roundRect(x, y, w, h, radius);
      ctx.clip();
      ctx.fillStyle = 'rgba(20, 28, 40, .28)';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(40, 32, 20, .9)';
      ctx.lineWidth = Math.max(4, Math.min(w, h) * 0.08);
      ctx.beginPath();
      ctx.moveTo(x + 6, y + h * 0.32);
      ctx.lineTo(x + w - 6, y + h * 0.68);
      ctx.moveTo(x + 6, y + h * 0.68);
      ctx.lineTo(x + w - 6, y + h * 0.32);
      ctx.stroke();
      ctx.restore();
    }
    if (car.id === selected) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 4;
      roundRect(x - 2, y - 2, w + 4, h + 4, radius + 2);
      ctx.stroke();
    }
    const headX = g.x + car.c * g.cell + g.cell / 2 + off.x;
    const headY = g.y + car.r * g.cell + g.cell / 2 + off.y;
    if (locked && car.shift) {
      drawPadlock(headX - w * 0.16, headY, Math.min(w, h) * 0.62);
      drawSwap(headX + w * 0.22, headY, Math.min(w, h) * 0.5);
    } else if (locked) drawPadlock(headX, headY, Math.min(w, h) * 0.72);
    else if (car.shift) drawSwap(headX, headY, Math.min(w, h) * 0.78);
    else drawArrow(headX, headY, car.dir, Math.min(w, h) * 0.28);
  }

  for (const p of particles) {
    const life = p.max || 0.38;
    ctx.globalAlpha = Math.max(0, p.life / life);
    ctx.fillStyle = p.color;
    ctx.save();
    ctx.translate(p.x, p.y);
    if (p.star) {
      ctx.rotate(p.life * 6);
      ctx.beginPath();
      for (let k = 0; k < 8; k++) {
        const rad = k % 2 === 0 ? p.r : p.r * 0.4;
        const a = (k / 8) * Math.PI * 2;
        ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
      }
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, p.r || 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  if (phase === 'clear') {
    const bw = Math.min(420, W - 48);
    ctx.fillStyle = 'rgba(23,50,79,.88)';
    roundRect((W - bw) / 2, H / 2 - 52, bw, 108, 18);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    chunkText('CLEARED', W / 2, H / 2 - 16, 32, '#fff');
    ctx.font = gameFont(22);
    chunkText(`${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}`, W / 2, H / 2 + 12, 22, '#ffe38a');
    ctx.font = gameFont(16);
    chunkText(`Level ${levelNum}  ·  time +${timeBonus}`, W / 2, H / 2 + 38, 16, '#fff');
  }
  ctx.restore();
}

function update(dt) {
  shake = Math.max(0, shake - dt * 22);
  flash = Math.max(0, flash - dt);
  const paused = clockPaused();
  if (phase === 'ready') {
    if (!paused) readyT -= dt;
    if (readyT <= 0) {
      phase = 'idle';
      timerOn = true;
    }
  } else if (timerOn && !paused && phase !== 'clear' && phase !== 'over') {
    timeLeft -= dt;
    if (timeLeft <= 0) {
      timeLeft = 0;
      return gameOver('time');
    }
  }
  for (const pop of heartPops) pop.t -= dt;
  heartPops = heartPops.filter((pop) => pop.t > 0);
  for (const p of particles) {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
  particles = particles.filter((p) => p.life > 0);
  if (phase === 'move' && motion) {
    motion.t += dt;
    if (motion.t >= motion.dur) finishMove();
  } else if (phase === 'clear') {
    clearT -= dt;
    if (clearT <= 0) {
      levelNum += 1;
      loadLevel(levelNum);
    }
  }
}

function pointerPos(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((e.clientX - rect.left) / rect.width) * W,
    y: ((e.clientY - rect.top) / rect.height) * H,
  };
}

function carAt(x, y) {
  const g = geom || metrics();
  const c = Math.floor((x - g.x) / g.cell);
  const r = Math.floor((y - g.y) / g.cell);
  return cars.find((car) => cellsOf(car).some(([rr, cc]) => rr === r && cc === c)) || null;
}

function resize() {
  const rect = stage.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  W = Math.max(1, rect.width);
  H = Math.max(1, rect.height);
  canvas.width = Math.max(1, Math.round(W * dpr));
  canvas.height = Math.max(1, Math.round(H * dpr));
}

document.getElementById('helpBtn').addEventListener('click', (e) => {
  e.currentTarget.blur();
  helpEl.classList.remove('hidden');
  document.getElementById('helpClose').focus();
});
document.getElementById('helpClose').addEventListener('click', (e) => {
  e.stopPropagation();
  helpEl.classList.add('hidden');
});
helpEl.addEventListener('click', (e) => {
  if (e.target === helpEl) helpEl.classList.add('hidden');
});

document.getElementById('startBtn').addEventListener('click', (e) => {
  e.currentTarget.blur();
  started = true;
  startEl.classList.add('hidden');
  startRun();
});
document.getElementById('retryLevelBtn').addEventListener('click', (e) => {
  e.currentTarget.blur();
  overEl.classList.add('hidden');
  started = true;
  restartLevel();
});
document.getElementById('retryBtn').addEventListener('click', (e) => {
  e.currentTarget.blur();
  overEl.classList.add('hidden');
  started = true;
  startRun();
});

canvas.addEventListener('pointerdown', (e) => {
  if (!started || phase !== 'idle' || !level) return;
  const p = pointerPos(e);
  const car = carAt(p.x, p.y);
  if (car) activate(car.id);
});

window.addEventListener('keydown', (e) => {
  if (!helpEl.classList.contains('hidden')) {
    if (e.key === 'Escape') {
      e.preventDefault();
      helpEl.classList.add('hidden');
    }
    return;
  }
  if (phase === 'over') return;
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Enter'].includes(e.key)) e.preventDefault();
  if (!started) {
    if (e.key === 'Enter' || e.key === ' ') {
      started = true;
      startEl.classList.add('hidden');
      startRun();
    }
    return;
  }
  if (phase !== 'idle') return;
  if (e.key === 'ArrowUp') moveSelection(0);
  if (e.key === 'ArrowRight') moveSelection(1);
  if (e.key === 'ArrowDown') moveSelection(2);
  if (e.key === 'ArrowLeft') moveSelection(3);
  if (e.key === 'Enter' || e.key === ' ') activate(selected);
});

function frame(now) {
  if (!frame.last) frame.last = now;
  const dt = Math.min(0.033, (now - frame.last) / 1000);
  frame.last = now;
  if (started && level) update(dt);
  if (level) render();
  requestAnimationFrame(frame);
}

window.addEventListener('resize', resize);
resize();
loadLevel(1);
window.__game = {
  get: () => ({
    score,
    phase,
    level: levelNum,
    hearts,
    timeLeft,
    timeLimit,
    cars: cars.map((car) => ({
      id: car.id,
      r: car.r,
      c: car.c,
      ok: canExit(level, cars, car),
    })),
    started,
    size: level?.size ?? 0,
    selected,
  }),
  play(id) {
    activate(id);
  },
  goto(n) {
    started = true;
    startEl.classList.add('hidden');
    levelNum = n;
    loadLevel(n);
  },
  clock(seconds) {
    timeLeft = seconds;
    timerOn = true;
    readyT = 0;
    if (phase === 'ready' || phase === 'idle') phase = 'idle';
  },
};
requestAnimationFrame(frame);
