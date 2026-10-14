import {
  PALETTE,
  SAFE_ROWS,
  createRun,
  update,
  fire,
  aimToward,
  nudgeAim,
  chooseCard,
  cycleCard,
  blockRect,
  visualRow,
  aimPath,
  applyLayout,
} from './logic.js';

const stage = document.getElementById('stage');
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const startEl = document.getElementById('start');
const overEl = document.getElementById('over');
const helpEl = document.getElementById('help');
const cardsEl = document.getElementById('cards');
const finalScore = document.getElementById('finalScore');
const cardButtons = [...cardsEl.querySelectorAll('button.card')];

let started = false;
let armed = false;
let state = createRun(1);

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

function sync() {
  startEl.classList.toggle('hidden', started);
  overEl.classList.toggle('hidden', state.phase !== 'over');
  cardsEl.classList.toggle('hidden', state.phase !== 'cards');
  if (state.phase === 'over') finalScore.textContent = `Score ${state.score}`;
  if (state.phase === 'cards' && state.cardChoices) {
    state.cardChoices.forEach((card, i) => {
      const btn = cardButtons[i];
      btn.querySelector('strong').textContent = card.title;
      btn.querySelector('span').textContent = card.text;
      btn.classList.toggle('selected', i === state.cardIndex);
    });
  }
}

function render() {
  const L = state.layout;
  const W = L.w;
  const H = L.h;
  const scale = canvas.width / W;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#12152b';
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  if (state.shake > 0) {
    ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
  }

  ctx.fillStyle = '#f4f7ff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = '700 28px "Trebuchet MS", "Segoe UI", sans-serif';
  ctx.fillText(String(state.score), 16, 28);
  ctx.textAlign = 'center';
  ctx.font = '700 16px "Trebuchet MS", "Segoe UI", sans-serif';
  ctx.fillStyle = '#9eb0d6';
  ctx.fillText(`LV ${state.level}`, W / 2, 24);
  ctx.textAlign = 'right';
  ctx.fillText(`${state.magazine.length} balls`, W - 16, 24);

  const tags = [];
  if (state.upgrades.damage) tags.push(`+${state.upgrades.damage} dmg`);
  if (state.upgrades.split) tags.push(`split ${state.upgrades.split}`);
  if (state.upgrades.lightning) tags.push('zap');
  if (state.upgrades.pop) tags.push('burst');
  ctx.textAlign = 'left';
  ctx.font = '700 12px "Trebuchet MS", "Segoe UI", sans-serif';
  ctx.fillStyle = '#ffb703';
  ctx.fillText(tags.join('   '), 16, 52);

  const board = L.board;
  ctx.fillStyle = '#0c1024';
  roundRect(board.x - 8, board.y - 8, board.w + 16, board.h + L.cell * 0.7, 16);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,80,90,.85)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(board.x, board.y + board.h);
  ctx.lineTo(board.x + board.w, board.y + board.h);
  ctx.stroke();

  for (const block of state.blocks) {
    if (block.dead) continue;
    const row = visualRow(state, block);
    if (row > SAFE_ROWS + 0.2) continue;
    const rect = blockRect(block, row, L);
    const color = PALETTE[block.color % PALETTE.length];
    ctx.fillStyle = 'rgba(0,0,0,.28)';
    roundRect(rect.x, rect.y + 4, rect.w, rect.h, 8);
    ctx.fill();
    ctx.fillStyle = block.flash > 0 ? '#ffffff' : color;
    roundRect(rect.x, rect.y, rect.w, rect.h, 8);
    ctx.fill();
    ctx.fillStyle = '#102033';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = Math.max(14, rect.h * 0.42);
    if (block.kind === 'pickup') {
      ctx.font = `700 ${Math.round(label)}px "Trebuchet MS", "Segoe UI", sans-serif`;
      ctx.fillText('+', rect.x + rect.w / 2, rect.y + rect.h / 2 + 1);
    } else {
      ctx.font = `700 ${Math.round(block.span > 1 ? label * 1.15 : label)}px "Trebuchet MS", "Segoe UI", sans-serif`;
      ctx.fillText(String(Math.max(0, block.hp)), rect.x + rect.w / 2, rect.y + rect.h / 2 + 1);
    }
  }

  if (state.phase === 'aim') {
    const path = aimPath(state);
    ctx.strokeStyle = 'rgba(255,255,255,.75)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 7]);
    ctx.beginPath();
    path.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();
    ctx.setLineDash([]);
  }

  for (const bolt of state.bolts) {
    ctx.strokeStyle = `rgba(180, 220, 255, ${bolt.life / 0.16})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(bolt.x1, bolt.y1);
    ctx.lineTo(bolt.x2, bolt.y2);
    ctx.stroke();
  }

  for (const ball of state.balls) {
    ctx.strokeStyle = PALETTE[ball.color];
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ball.trail.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = PALETTE[ball.color];
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.7)';
    ctx.beginPath();
    ctx.arc(ball.x - 2, ball.y - 2, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const p of state.particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  for (const f of state.floats) {
    ctx.globalAlpha = Math.max(0, f.life / 0.55);
    ctx.fillStyle = f.color;
    ctx.font = '700 14px "Trebuchet MS", "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(f.text, f.x, f.y);
    ctx.globalAlpha = 1;
  }

  ctx.fillStyle = '#f4f7ff';
  ctx.beginPath();
  const ang = state.aim;
  const lx = state.originX;
  const ly = L.launchY;
  ctx.moveTo(lx + Math.cos(ang) * 16, ly + Math.sin(ang) * 16);
  ctx.lineTo(lx + Math.cos(ang + 2.4) * 12, ly + Math.sin(ang + 2.4) * 12);
  ctx.lineTo(lx + Math.cos(ang - 2.4) * 12, ly + Math.sin(ang - 2.4) * 12);
  ctx.closePath();
  ctx.fill();

  const dots = state.magazine;
  const gap = Math.min(16, 280 / Math.max(1, dots.length));
  const startX = W / 2 - ((dots.length - 1) * gap) / 2;
  const dotY = H - Math.max(22, L.cell * 0.42);
  dots.forEach((color, i) => {
    ctx.fillStyle = PALETTE[color];
    ctx.beginPath();
    ctx.arc(startX + i * gap, dotY, Math.max(5, L.cell * 0.13), 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.restore();
}

function pointerPos(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((e.clientX - rect.left) / rect.width) * state.layout.w,
    y: ((e.clientY - rect.top) / rect.height) * state.layout.h,
  };
}

function resize() {
  const rect = stage.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(1, rect.width);
  const h = Math.max(1, rect.height);
  canvas.width = Math.max(1, Math.round(w * dpr));
  canvas.height = Math.max(1, Math.round(h * dpr));
  if (!state.layout || Math.abs(state.layout.w - w) > 0.5 || Math.abs(state.layout.h - h) > 0.5) {
    applyLayout(state, w, h);
  }
}

function begin() {
  started = true;
  state = createRun((Date.now() ^ 0x9e3779b1) >>> 0);
  const rect = stage.getBoundingClientRect();
  applyLayout(state, Math.max(1, rect.width), Math.max(1, rect.height));
  startEl.classList.add('hidden');
  overEl.classList.add('hidden');
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
  begin();
});
document.getElementById('retryBtn').addEventListener('click', (e) => {
  e.currentTarget.blur();
  begin();
});
cardButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    if (state.phase !== 'cards') return;
    chooseCard(state, Number(btn.dataset.i));
  });
});

canvas.addEventListener('pointerdown', (e) => {
  if (!started || state.phase !== 'aim') return;
  armed = true;
  const p = pointerPos(e);
  aimToward(state, p.x, p.y);
});
canvas.addEventListener('pointermove', (e) => {
  if (!started || state.phase !== 'aim') return;
  if (!armed && e.pointerType !== 'mouse') return;
  const p = pointerPos(e);
  aimToward(state, p.x, p.y);
});
window.addEventListener('pointerup', () => {
  if (!armed) return;
  armed = false;
  if (started && state.phase === 'aim') fire(state);
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
    if (e.key === 'Enter' || e.key === ' ') begin();
    return;
  }
  if (state.phase === 'over') {
    if (e.key === 'Enter' || e.key === ' ') begin();
    return;
  }
  if (state.phase === 'cards') {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') cycleCard(state, -1);
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') cycleCard(state, 1);
    if (e.key === 'Enter' || e.key === ' ') chooseCard(state, state.cardIndex);
    return;
  }
  if (state.phase !== 'aim') return;
  if (e.key === 'ArrowLeft') nudgeAim(state, -1);
  if (e.key === 'ArrowRight') nudgeAim(state, 1);
  if (e.key === 'ArrowUp') state.aim = -Math.PI / 2;
  if (e.key === ' ' || e.key === 'Enter') fire(state);
});

function frame(now) {
  if (!frame.last) frame.last = now;
  const dt = Math.min(0.034, (now - frame.last) / 1000);
  frame.last = now;
  if (started) update(state, dt);
  render();
  sync();
  requestAnimationFrame(frame);
}

window.addEventListener('resize', resize);
resize();
window.__game = {
  get: () => ({
    score: state.score,
    phase: state.phase,
    level: state.level,
    started,
    balls: state.magazine.length,
    blocks: state.blocks.filter((block) => !block.dead).length,
    cards: state.phase === 'cards' ? state.cardChoices?.map((card) => card.title) : null,
    cardIndex: state.cardIndex,
  }),
  aim(x, y) {
    aimToward(state, x, y);
  },
  shoot() {
    fire(state);
  },
};
requestAnimationFrame(frame);
