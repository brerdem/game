import {
  PALETTE,
  mulberry32,
  exposedCells,
  planEat,
  isCleared,
  canPlay,
  hasLegalMove,
  dealHand,
  makePicture,
} from './logic.js';

let W = 800;
let H = 900;
const stage = document.getElementById('stage');
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const startEl = document.getElementById('start');
const overEl = document.getElementById('over');
const finalScore = document.getElementById('finalScore');

let started = false;
let phase = 'idle';
let rng = mulberry32(1);
let pity = 0;
let level = 1;
let score = 0;
let combo = 1;
let grid = [];
let pictureName = '';
let hand = [null, null, null];
let dock = [null, null, null];
let sel = 0;
let anim = null;
let banner = null;
let hits = [];
let particles = [];
let floats = [];
let shake = 0;
let layout = null;

function friendliness() {
  return pity / 3;
}

function freshPicture() {
  const pic = makePicture(level, rng);
  grid = pic.grid;
  pictureName = pic.name;
}

function startRun() {
  rng = mulberry32((Date.now() ^ Math.imul(pity + 1, 9973)) >>> 0);
  level = 1;
  score = 0;
  combo = 1;
  dock = [null, null, null];
  anim = null;
  banner = null;
  particles = [];
  floats = [];
  sel = 0;
  freshPicture();
  hand = dealHand(grid, rng, friendliness());
  phase = 'idle';
  if (!hasLegalMove(grid, hand, dock)) gameOver();
}

function gameOver() {
  phase = 'over';
  pity = Math.min(3, pity + 1);
  finalScore.textContent = `Score ${score}`;
  overEl.classList.remove('hidden');
}

function targets() {
  const list = [];
  hand.forEach((spool, index) => {
    if (spool) list.push({ kind: 'hand', index });
  });
  dock.forEach((spool, index) => {
    if (spool) list.push({ kind: 'dock', index });
  });
  return list;
}

function selectedTarget() {
  const list = targets();
  if (!list.length) return null;
  sel = ((sel % list.length) + list.length) % list.length;
  return list[sel];
}

function isSelected(kind, index) {
  const cur = selectedTarget();
  return !!cur && cur.kind === kind && cur.index === index;
}

function play(source) {
  if (phase !== 'idle') return;
  if (!canPlay(grid, hand, dock, source)) {
    shake = 7;
    return;
  }
  const spool = source.kind === 'hand' ? hand[source.index] : dock[source.index];
  const plan = planEat(grid, spool.color, spool.capacity);
  grid = plan.grid;
  anim = {
    t: 0,
    end: (plan.eaten.length ? 0.1 + plan.eaten.length * 0.04 : 0.08) + 0.18,
    popping: plan.eaten.map((cell, i) => ({ ...cell, popAt: 0.1 + i * 0.04, done: false })),
    color: spool.color,
    remaining: plan.remaining,
    source,
    from: null,
    cleared: isCleared(grid),
  };
  phase = 'anim';
}

function finishAnim() {
  const a = anim;
  anim = null;
  if (a.source.kind === 'hand') hand[a.source.index] = null;
  else dock[a.source.index] = null;

  if (a.cleared) {
    combo += 1;
    score += 250 * combo;
    floats.push({ x: W / 2, y: 210, text: `+${250 * combo}`, life: 0.8, color: '#2a211c' });
    banner = { life: 0.85, title: pictureName };
    level += 1;
    pity = Math.max(0, pity - 1);
    freshPicture();
    hand = dealHand(grid, rng, friendliness());
  } else if (a.remaining > 0) {
    const parked = { color: a.color, capacity: a.remaining };
    if (a.source.kind === 'dock') dock[a.source.index] = parked;
    else {
      const idx = dock.findIndex((slot) => slot == null);
      if (idx < 0) return gameOver();
      dock[idx] = parked;
    }
  }

  if (!a.cleared && hand.every((spool) => spool == null)) {
    hand = dealHand(grid, rng, friendliness());
  }
  if (!hasLegalMove(grid, hand, dock)) return gameOver();
  phase = banner ? 'banner' : 'idle';
}

function cellGeom() {
  const rows = grid.length || 1;
  const cols = grid[0]?.length || 1;
  const hud = Math.max(56, Math.min(84, H * 0.08));
  const dockH = Math.max(78, Math.min(140, H * 0.15));
  const handH = Math.max(92, Math.min(160, H * 0.17));
  const gap = Math.max(14, Math.min(22, H * 0.02));
  const availW = W - Math.max(28, W * 0.05);
  const availH = H - hud - dockH - handH - gap * 3;
  const size = Math.max(8, Math.min(availW / cols, availH / rows));
  const gw = cols * size;
  const gh = rows * size;
  return {
    size,
    gx: (W - gw) / 2,
    gy: hud + Math.max(0, (availH - gh) / 2),
    rows,
    cols,
    dockY: H - gap - handH - gap - dockH,
    handY: H - gap - handH,
    dockH,
    handH,
    hud,
  };
}

function cellRect(r, c) {
  const g = layout || cellGeom();
  return { x: g.gx + c * g.size, y: g.gy + r * g.size, s: g.size };
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

function spoolCenter(kind, index) {
  const box = kind === 'hand' ? handBox(index) : dockBox(index);
  return { x: box.x + box.w / 2, y: box.y + box.h / 2 - 8 };
}

function dockBox(index) {
  const g = layout || cellGeom();
  const gap = Math.max(12, W * 0.02);
  const w = Math.min(g.dockH * 1.45, (W - 32 - gap * 2) / 3);
  const total = w * 3 + gap * 2;
  return { x: (W - total) / 2 + index * (w + gap), y: g.dockY, w, h: g.dockH };
}

function handBox(index) {
  const g = layout || cellGeom();
  const gap = Math.max(12, W * 0.02);
  const w = Math.min(g.handH * 1.2, (W - 32 - gap * 2) / 3);
  const total = w * 3 + gap * 2;
  return { x: (W - total) / 2 + index * (w + gap), y: g.handY, w, h: g.handH };
}

function drawSpool(box, color, capacity, selected, scale = 1) {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2 - 8;
  const r = Math.min(box.w, box.h) * 0.3 * scale;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = 'rgba(70, 40, 24, .12)';
  ctx.beginPath();
  ctx.ellipse(0, r + 10, r * 0.85, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.18)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.72, 0.4, 2.2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.48, 2.4, 5.2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.45)';
  ctx.beginPath();
  ctx.arc(-r * 0.28, -r * 0.32, r * 0.22, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2a211c';
  ctx.font = `700 ${Math.round(r * 0.95)}px "Trebuchet MS", "Segoe UI", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(capacity), 0, r + 16);
  ctx.restore();
  if (selected) {
    ctx.strokeStyle = '#2a211c';
    ctx.lineWidth = 3;
    roundRect(box.x + 3, box.y + 3, box.w - 6, box.h - 6, 16);
    ctx.stroke();
  }
}

function pixelColor(index) {
  return PALETTE[index % PALETTE.length];
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return `rgb(${r},${g},${b})`;
}

function render() {
  layout = cellGeom();
  hits = [];
  const exposed = new Set(exposedCells(grid).map((cell) => `${cell.r},${cell.c}`));
  const scale = canvas.width / W;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#f6efe6';
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

  ctx.fillStyle = '#2a211c';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = '700 28px "Trebuchet MS", "Segoe UI", sans-serif';
  ctx.fillText(String(score), 18, 32);
  ctx.textAlign = 'right';
  ctx.font = '700 18px "Trebuchet MS", "Segoe UI", sans-serif';
  ctx.fillText(`x${combo}`, W - 18, 26);
  ctx.font = '700 15px "Trebuchet MS", "Segoe UI", sans-serif';
  ctx.fillStyle = '#8a6552';
  ctx.fillText(`${pictureName}  ${level}`, W - 18, 48);

  const g = layout;
  ctx.fillStyle = '#efe2d2';
  roundRect(g.gx - 10, g.gy - 10, g.cols * g.size + 20, g.rows * g.size + 20, 16);
  ctx.fill();

  const hidden = new Set();
  if (anim) {
    for (const pop of anim.popping) {
      if (anim.t < pop.popAt) hidden.add(`${pop.r},${pop.c}`);
    }
  }

  for (let r = 0; r < g.rows; r++) {
    for (let c = 0; c < g.cols; c++) {
      const key = `${r},${c}`;
      let color = grid[r][c];
      if (color == null && hidden.has(key)) {
        color = anim.popping.find((pop) => pop.r === r && pop.c === c).color;
      }
      if (color == null) continue;
      const x = g.gx + c * g.size + 2;
      const y = g.gy + r * g.size + 2;
      const s = g.size - 4;
      ctx.fillStyle = shade(pixelColor(color), -28);
      roundRect(x, y + 3, s, s, 5);
      ctx.fill();
      ctx.fillStyle = pixelColor(color);
      roundRect(x, y, s, s, 5);
      ctx.fill();
      if (exposed.has(key) && !(hidden.has(key) && anim && anim.t >= (anim.popping.find((p) => p.r === r && p.c === c)?.popAt ?? 0))) {
        ctx.strokeStyle = 'rgba(255,255,255,.85)';
        ctx.lineWidth = 2;
        roundRect(x + 2, y + 2, s - 4, s - 4, 4);
        ctx.stroke();
      }
    }
  }

  if (anim) {
    const fly = flyPoint();
    drawSpool({ x: fly.x - 28, y: fly.y - 28, w: 56, h: 56 }, pixelColor(anim.color), '', false, 1);
  }

  ctx.fillStyle = '#8a6552';
  ctx.textAlign = 'left';
  ctx.font = '700 13px "Trebuchet MS", "Segoe UI", sans-serif';
  ctx.fillText('DOCK', 18, g.dockY - 8);

  for (let i = 0; i < 3; i++) {
    const box = dockBox(i);
    ctx.fillStyle = '#eadccb';
    roundRect(box.x, box.y, box.w, box.h, 18);
    ctx.fill();
    if (dock[i]) {
      drawSpool(box, pixelColor(dock[i].color), dock[i].capacity, isSelected('dock', i));
      hits.push({ ...box, kind: 'dock', index: i });
    }
  }
  for (let i = 0; i < 3; i++) {
    const box = handBox(i);
    if (!hand[i]) continue;
    drawSpool(box, pixelColor(hand[i].color), hand[i].capacity, isSelected('hand', i));
    hits.push({ ...box, kind: 'hand', index: i });
  }

  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  for (const f of floats) {
    ctx.globalAlpha = Math.max(0, f.life / 0.7);
    ctx.fillStyle = f.color;
    ctx.font = '700 22px "Trebuchet MS", "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(f.text, f.x, f.y);
    ctx.globalAlpha = 1;
  }

  if (banner) {
    const bw = Math.min(320, W - 48);
    const bx = (W - bw) / 2;
    const by = H * 0.38;
    ctx.fillStyle = 'rgba(42,33,28,.78)';
    roundRect(bx, by, bw, 90, 20);
    ctx.fill();
    ctx.fillStyle = '#fffaf4';
    ctx.textAlign = 'center';
    ctx.font = '700 28px "Trebuchet MS", "Segoe UI", sans-serif';
    ctx.fillText('CLEARED', W / 2, by + 36);
    ctx.font = '700 16px "Trebuchet MS", "Segoe UI", sans-serif';
    ctx.fillText(`${banner.title}  ·  x${combo}`, W / 2, by + 64);
  }

  ctx.restore();
}

function flyPoint() {
  if (!anim) return { x: W / 2, y: H / 2 };
  const popped = anim.popping.filter((pop) => anim.t >= pop.popAt - 0.02);
  const cell = popped.length ? popped[popped.length - 1] : anim.popping[0];
  const from = anim.from || spoolCenter(anim.source.kind, anim.source.index);
  if (!cell) return from;
  const rect = cellRect(cell.r, cell.c);
  const dest = { x: rect.x + rect.s / 2, y: rect.y + rect.s / 2 };
  const u = Math.min(1, anim.t / 0.12);
  return { x: from.x + (dest.x - from.x) * u, y: from.y + (dest.y - from.y) * u };
}

function update(dt) {
  shake = Math.max(0, shake - dt * 20);
  for (const p of particles) {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 420 * dt;
  }
  particles = particles.filter((p) => p.life > 0);
  for (const f of floats) {
    f.life -= dt;
    f.y -= 24 * dt;
  }
  floats = floats.filter((f) => f.life > 0);

  if (phase === 'anim' && anim) {
    const prev = anim.t;
    anim.t += dt;
    for (const pop of anim.popping) {
      if (!pop.done && prev < pop.popAt && anim.t >= pop.popAt) {
        pop.done = true;
        const gained = 10 * combo;
        score += gained;
        const rect = cellRect(pop.r, pop.c);
        floats.push({
          x: rect.x + rect.s / 2,
          y: rect.y,
          text: `+${gained}`,
          life: 0.55,
          color: '#2a211c',
        });
        for (let i = 0; i < 5; i++) {
          const a = Math.random() * Math.PI * 2;
          particles.push({
            x: rect.x + rect.s / 2,
            y: rect.y + rect.s / 2,
            vx: Math.cos(a) * 80,
            vy: Math.sin(a) * 80,
            life: 0.35,
            max: 0.35,
            color: pixelColor(pop.color),
            r: 2 + Math.random() * 2,
          });
        }
      }
    }
    if (anim.t >= anim.end) finishAnim();
  } else if (phase === 'banner' && banner) {
    banner.life -= dt;
    if (banner.life <= 0) {
      banner = null;
      phase = 'idle';
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

function hitAt(x, y) {
  for (let i = hits.length - 1; i >= 0; i--) {
    const h = hits[i];
    if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return h;
  }
  return null;
}

function resize() {
  const rect = stage.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  W = Math.max(1, rect.width);
  H = Math.max(1, rect.height);
  canvas.width = Math.max(1, Math.round(W * dpr));
  canvas.height = Math.max(1, Math.round(H * dpr));
}

function frame(now) {
  if (!frame.last) frame.last = now;
  const dt = Math.min(0.033, (now - frame.last) / 1000);
  frame.last = now;
  if (started) update(dt);
  render();
  requestAnimationFrame(frame);
}

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
  if (!started || phase !== 'idle') return;
  const p = pointerPos(e);
  const hit = hitAt(p.x, p.y);
  if (!hit) return;
  const list = targets();
  sel = Math.max(0, list.findIndex((item) => item.kind === hit.kind && item.index === hit.index));
  play({ kind: hit.kind, index: hit.index });
});

window.addEventListener('keydown', (e) => {
  const key = e.key;
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Enter'].includes(key)) e.preventDefault();
  if (!started) {
    if (key === 'Enter' || key === ' ') {
      started = true;
      startEl.classList.add('hidden');
      startRun();
    }
    return;
  }
  if (phase === 'over') {
    if (key === 'Enter' || key === ' ') {
      overEl.classList.add('hidden');
      startRun();
    }
    return;
  }
  if (phase !== 'idle') return;
  if (key === 'ArrowLeft') sel -= 1;
  if (key === 'ArrowRight') sel += 1;
  if (key === 'ArrowUp' || key === 'ArrowDown') {
    const list = targets();
    const cur = selectedTarget();
    if (cur) {
      const want = cur.kind === 'hand' ? 'dock' : 'hand';
      const idx = list.findIndex((item) => item.kind === want);
      if (idx >= 0) sel = idx;
    }
  }
  if (key === 'Enter' || key === ' ') {
    const cur = selectedTarget();
    if (cur) play(cur);
  }
});

window.addEventListener('resize', resize);
resize();
freshPicture();
hand = dealHand(grid, rng, 0);
window.__game = {
  get: () => ({
    score,
    phase,
    level,
    started,
    pixels: grid.flat().filter((cell) => cell != null).length,
    pity,
  }),
  lose() {
    gameOver();
  },
};
requestAnimationFrame(frame);
