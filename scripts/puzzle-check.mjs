import {
  makePicture,
  planEat,
  exposedCells,
  dealSpool,
  dealHand,
  hasLegalMove,
  canPlay,
  isCleared,
  mulberry32,
} from '../unravel/logic.js';
import {
  createRun,
  update,
  fire,
  aimToward,
  chooseCard,
  blockCenter,
  debugHit,
  SAFE_ROWS,
} from '../pinball-pit/logic.js';
import { generateLevel, validate } from '../gridlock/logic.js';

const failures = [];
function assert(cond, msg) {
  if (!cond) failures.push(msg);
}

function testUnravel() {
  const rng = mulberry32(1);
  const pic = makePicture(1, rng);
  assert(pic.grid.length >= 5, 'picture has rows');
  assert(exposedCells(pic.grid).length > 0, 'picture has exposed pixels');

  const column = [
    [1, null],
    [1, null],
    [1, null],
  ];
  const all = planEat(column, 1, 3);
  assert(all.eaten.map((c) => c.r).join() === '2,1,0', `eat order ${all.eaten.map((c) => c.r)}`);
  assert(all.remaining === 0, 'capacity spent');
  const one = planEat(column, 1, 1);
  assert(one.eaten.length === 1 && one.eaten[0].r === 2, 'only the bottom pixel');
  assert(one.grid[1][0] === 1, 'upper pixel remains');

  const exposed = exposedCells(pic.grid);
  const color = exposed[0].color;
  const cleared = planEat(pic.grid, color, 99);
  assert(exposedCells(cleared.grid).every((cell) => cell.color !== color), 'color fully peeled');

  for (let i = 0; i < 20; i++) {
    const spool = dealSpool(pic.grid, rng, 0.2);
    const present = new Set(pic.grid.flat().filter((c) => c != null));
    assert(present.has(spool.color), 'dealt color is on the board');
    assert(spool.capacity >= 1 && spool.capacity <= 16, 'capacity in range');
  }

  const biased = [
    [0, 1],
    [0, 1],
    [2, 1],
  ];
  const rng2 = mulberry32(2);
  let useful = 0;
  for (let i = 0; i < 40; i++) {
    const spool = dealSpool(biased, rng2, 1);
    if (spool.color === 1 || spool.color === 2) useful++;
  }
  assert(useful >= 34, `friendly deals were ${useful}/40`);

  const useless = [
    { color: 99, capacity: 3 },
    { color: 99, capacity: 3 },
    { color: 99, capacity: 3 },
  ];
  assert(!hasLegalMove(pic.grid, useless, useless), 'full dock and no matches is over');
  assert(hasLegalMove(pic.grid, useless, [null, null, null]), 'open dock can park a spool');

  const runRng = mulberry32(42);
  let level = 1;
  let grid = makePicture(level, runRng).grid;
  let dock = [null, null, null];
  let hand = dealHand(grid, runRng, 0);
  let pictures = 0;
  for (let step = 0; step < 120 && pictures < 2; step++) {
    const options = [];
    for (let i = 0; i < 3; i++) if (canPlay(grid, hand, dock, { kind: 'hand', index: i })) options.push({ kind: 'hand', index: i });
    for (let i = 0; i < 3; i++) if (canPlay(grid, hand, dock, { kind: 'dock', index: i })) options.push({ kind: 'dock', index: i });
    assert(options.length === 0 || hasLegalMove(grid, hand, dock), 'legal-move helper agrees');
    if (!options.length) break;
    const source = options[Math.floor(runRng() * options.length)];
    const spool = source.kind === 'hand' ? hand[source.index] : dock[source.index];
    const plan = planEat(grid, spool.color, spool.capacity);
    grid = plan.grid;
    if (source.kind === 'hand') hand[source.index] = null;
    else dock[source.index] = null;
    if (isCleared(grid)) {
      pictures++;
      level++;
      grid = makePicture(level, runRng).grid;
      hand = dealHand(grid, runRng, 0);
      continue;
    }
    if (plan.remaining > 0) {
      const parked = { color: spool.color, capacity: plan.remaining };
      if (source.kind === 'dock') dock[source.index] = parked;
      else {
        const idx = dock.findIndex((slot) => slot == null);
        assert(idx >= 0, 'partial spool had a dock slot');
        if (idx >= 0) dock[idx] = parked;
      }
    }
    if (hand.every((slot) => slot == null)) hand = dealHand(grid, runRng, 0);
  }
  assert(pictures >= 1, `cleared ${pictures} pictures in the sim`);
}

function testPinball() {
  const state = createRun(5);
  assert(state.blocks.length >= 4, 'starter blocks');
  assert(state.magazine.length === 4, 'starter volley');
  const block = state.blocks.find((item) => item.kind === 'block');
  block.hp = 20;
  block.dead = false;
  const same = debugHit(state, block.id, block.color);
  assert(same.before - same.after === 2, `same-color damage ${same.before}->${same.after}`);
  block.hp = 20;
  block.dead = false;
  const other = debugHit(state, block.id, (block.color + 1) % 5);
  assert(other.before - other.after === 1, `off-color damage ${other.before}->${other.after}`);

  const live = createRun(8);
  const target = live.blocks[0];
  const center = blockCenter(target);
  aimToward(live, center.x, center.y);
  live.rewardQueued = true;
  assert(fire(live), 'fires');
  for (let i = 0; i < 800 && live.phase === 'volley'; i++) update(live, 1 / 60);
  assert(live.phase !== 'volley', `volley ended in ${live.phase}`);
  assert(live.balls.every((ball) => Number.isFinite(ball.x) && Number.isFinite(ball.y)), 'ball positions finite');
  assert(live.score >= 0, 'score');
  if (live.phase === 'cards') {
    assert(live.cardChoices.length === 3, 'three cards');
    chooseCard(live, 1);
    assert(live.phase === 'shift', 'card starts the drop');
  }
  for (let i = 0; i < 40 && live.phase === 'shift'; i++) update(live, 1 / 30);
  assert(live.phase === 'aim' || live.phase === 'over', `after shift ${live.phase}`);

  const boss = createRun(3);
  boss.level = 9;
  boss.blocks = [];
  boss.phase = 'shift';
  boss.shiftT = 0.99;
  update(boss, 0.05);
  assert(boss.level === 10, `boss level ${boss.level}`);
  assert(boss.blocks.some((item) => item.kind === 'boss'), 'boss row');

  const pit = createRun(1);
  pit.blocks = [{
    id: 99, row: SAFE_ROWS - 1, col: 1, span: 1, hp: 4, maxHp: 4, color: 0, kind: 'block', rowId: 50, dead: false,
  }];
  pit.blocks[0].row += 1;
  pit.phase = 'shift';
  pit.shiftT = 0.99;
  update(pit, 0.05);
  assert(pit.phase === 'over', 'block in the pit ends the run');
}

function testGridlock() {
  let prev = 0;
  for (let level = 1; level <= 15; level++) {
    const a = generateLevel(level);
    const b = generateLevel(level);
    assert(validate(a), `level ${level} solvable`);
    assert(JSON.stringify(a) === JSON.stringify(b), `level ${level} deterministic`);
    assert(a.size >= prev, `level ${level} size ${a.size}`);
    assert(a.cars.length >= 3, `level ${level} cars`);
    prev = a.size;
    const cars = a.cars.map((car) => ({ ...car }));
    for (const id of a.solution) {
      const car = cars.find((item) => item.id === id);
      cars.splice(cars.findIndex((item) => item.id === id), 1);
      void car;
    }
    assert(cars.length === 0, 'solution removes every car');
  }
  assert(generateLevel(1).handmade === true, 'level 1 is handmade');
  assert(generateLevel(1).size === 4, 'level 1 is 4x4');
  assert(generateLevel(10).size >= 6, 'later boards grow');
}

testUnravel();
testPinball();
testGridlock();

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('puzzle logic ok');
