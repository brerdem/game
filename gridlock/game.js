import { CAR_COLORS, DIRS, canExit, generateLevel, stepsToExit } from './logic.js';

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
let hearts = 3;
let level = null;
let cars = [];
let selected = 0;
let motion = null;
let clearT = 0;
let shake = 0;
let flash = 0;
let particles = [];
let geom = null;

function loadLevel(n) {
  level = generateLevel(n);
  cars = level.cars.map((car) => ({ ...car }));
  selected = cars[0]?.id ?? 0;
  motion = null;
  phase = 'idle';
}

function startRun() {
  levelNum = 1;
  score = 0;
  hearts = 3;
  particles = [];
  loadLevel(1);
}

function gameOver() {
  phase = 'over';
  finalScore.textContent = `Score ${score}  ·  Lv ${levelNum}`;
  overEl.classList.remove('hidden');
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
  const ok = canExit(level.size, cars, level.exits, car);
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
    shake = 7;
    flash = 0.25;
    if (hearts <= 0) return gameOver();
    phase = 'idle';
    return;
  }
  const g = geom || metrics();
  const { dr, dc } = DIRS[car.dir];
  const px = g.x + car.c * g.cell + g.cell / 2 + dc * g.cell * 0.2;
  const py = g.y + car.r * g.cell + g.cell / 2 + dr * g.cell * 0.2;
  for (let i = 0; i < 8; i++) {
    const a = Math.random() * Math.PI * 2;
    particles.push({
      x: px,
      y: py,
      vx: Math.cos(a) * 90,
      vy: Math.sin(a) * 90,
      life: 0.35,
      color: CAR_COLORS[car.color % CAR_COLORS.length],
    });
  }
  cars = cars.filter((item) => item.id !== car.id);
  score += 100;
  if (!cars.length) {
    score += 350 + hearts * 60;
    phase = 'clear';
    clearT = 0.85;
    return;
  }
  if (!carById(selected)) selected = cars[0].id;
  phase = 'idle';
}

function drawArrow(cx, cy, dir, s) {
  ctx.beginPath();
  if (dir === 0) {
    ctx.moveTo(cx, cy - s);
    ctx.lineTo(cx + s * 0.86, cy + s * 0.62);
    ctx.lineTo(cx - s * 0.86, cy + s * 0.62);
  } else if (dir === 1) {
    ctx.moveTo(cx + s, cy);
    ctx.lineTo(cx - s * 0.62, cy - s * 0.86);
    ctx.lineTo(cx - s * 0.62, cy + s * 0.86);
  } else if (dir === 2) {
    ctx.moveTo(cx, cy + s);
    ctx.lineTo(cx + s * 0.86, cy - s * 0.62);
    ctx.lineTo(cx - s * 0.86, cy - s * 0.62);
  } else {
    ctx.moveTo(cx - s, cy);
    ctx.lineTo(cx + s * 0.62, cy - s * 0.86);
    ctx.lineTo(cx + s * 0.62, cy + s * 0.86);
  }
  ctx.closePath();
  ctx.fill();
}

function drawHeart(x, y, filled) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(0.9, 0.9);
  ctx.beginPath();
  ctx.moveTo(0, 6);
  ctx.bezierCurveTo(-12, -2, -8, -12, 0, -6);
  ctx.bezierCurveTo(8, -12, 12, -2, 0, 6);
  ctx.fillStyle = filled ? '#e23d4a' : 'rgba(226,61,74,.25)';
  ctx.fill();
  ctx.restore();
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
  ctx.fillStyle = flash > 0 ? '#f3c2c2' : '#d7e2ee';
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

  ctx.fillStyle = '#17324f';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 22px "Trebuchet MS", "Segoe UI", sans-serif';
  const hudY = Math.max(36, g.hud * 0.45);
  ctx.font = `700 ${Math.round(Math.max(22, Math.min(34, W * 0.03)))}px "Trebuchet MS", "Segoe UI", sans-serif`;
  ctx.fillText(`Lv ${levelNum}`, W / 2, hudY);
  ctx.textAlign = 'right';
  ctx.fillText(String(score), W - 20, hudY);
  for (let i = 0; i < 3; i++) drawHeart(28 + i * 32, hudY, i < hearts);

  ctx.fillStyle = '#f7fbff';
  roundRect(g.x - 6, g.y - 6, g.board + 12, g.board + 12, 14);
  ctx.fill();
  ctx.strokeStyle = 'rgba(23,50,79,.08)';
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

  const exitSize = Math.max(10, g.cell * 0.46);
  const drawExit = (color, x, y) => {
    ctx.fillStyle = CAR_COLORS[color % CAR_COLORS.length];
    roundRect(x, y, exitSize, exitSize, 5);
    ctx.fill();
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
    const x = g.x + car.c * g.cell + pad + off.x;
    const y = g.y + car.r * g.cell + pad + off.y;
    const s = g.cell - pad * 2;
    ctx.fillStyle = 'rgba(16, 32, 48, .16)';
    roundRect(x, y + 4, s, s, 10);
    ctx.fill();
    ctx.fillStyle = CAR_COLORS[car.color % CAR_COLORS.length];
    roundRect(x, y, s, s, 10);
    ctx.fill();
    if (car.id === selected) {
      ctx.strokeStyle = '#17324f';
      ctx.lineWidth = 3;
      roundRect(x + 2, y + 2, s - 4, s - 4, 8);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,.92)';
    drawArrow(x + s / 2, y + s / 2, car.dir, s * 0.22);
  }

  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life / 0.35);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  if (phase === 'clear') {
    const bw = Math.min(280, W - 48);
    ctx.fillStyle = 'rgba(23,50,79,.88)';
    roundRect((W - bw) / 2, H / 2 - 46, bw, 92, 18);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.font = '700 28px "Trebuchet MS", "Segoe UI", sans-serif';
    ctx.fillText('CLEARED', W / 2, H / 2 - 6);
    ctx.font = '700 16px "Trebuchet MS", "Segoe UI", sans-serif';
    ctx.fillText(`Level ${levelNum}`, W / 2, H / 2 + 22);
  }
  ctx.restore();
}

function update(dt) {
  shake = Math.max(0, shake - dt * 22);
  flash = Math.max(0, flash - dt);
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
      hearts = 3;
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
  return cars.find((car) => car.r === r && car.c === c) || null;
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
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Enter'].includes(e.key)) e.preventDefault();
  if (!started) {
    if (e.key === 'Enter' || e.key === ' ') {
      started = true;
      startEl.classList.add('hidden');
      startRun();
    }
    return;
  }
  if (phase === 'over') {
    if (e.key === 'Enter' || e.key === ' ') {
      overEl.classList.add('hidden');
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
    cars: cars.map((car) => ({
      id: car.id,
      r: car.r,
      c: car.c,
      ok: canExit(level.size, cars, level.exits, car),
    })),
    started,
    size: level?.size ?? 0,
    selected,
  }),
  play(id) {
    activate(id);
  },
};
requestAnimationFrame(frame);
