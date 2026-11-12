// Looks for easier answers than a level's own: wins that skip a part.
//
//   node tools/find-shortcuts.cjs 21        search level 21 (1-based)
//   node tools/find-shortcuts.cjs 21 44 48  search several levels
//   LEVELS_FILE=draft.js node tools/find-shortcuts.cjs 3   search a draft
//
// Two searches per level:
//   alone  each part on offer, placed by itself, anywhere it fits;
//   short  one part left out, the rest at their answer spots, and one of
//          those moved anywhere it fits.
// Each try is every whole and half cell around the level, in every turn,
// flip and size. A hit is printed as the parts that won, so it can be
// played back by hand. Slow: run it on the levels you change.
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const ctx = { console, Math, performance };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['vendor/libs.js', 'src/gadgets.js', process.env.LEVELS_FILE || 'src/levels.js']) {
  vm.runInContext(fs.readFileSync(path.resolve(root, f), 'utf8'), ctx, { filename: f });
}
const { GADGETS, buildWorld, placeMesh, outlineAt, outlinesOverlap, outlineBottom, OUTLINE_EPS, stepFrame, partType, goalCounts } =
  vm.runInContext('({ GADGETS, buildWorld, placeMesh, outlineAt, outlinesOverlap, outlineBottom, OUTLINE_EPS, stepFrame, partType, goalCounts })', ctx);
const LEVELS = vm.runInContext('LEVELS', ctx);

const SECONDS = 12;
const STEP = 0.5;

// A run of `locked` (the level's pieces) plus `mine` (the player's parts):
// true when the star is reached the way the game counts it.
function wins(locked, mine) {
  let won = false;
  const items = [...locked.map((e) => [e, true]), ...mine.map((e) => [e, false])].map(([[type, x, y, rot = 0, flip = false, size = null], isLocked]) => {
    const item = { type, x, y, rot, flip, size, locked: isLocked };
    item.mesh = GADGETS[type].makeMesh(item);
    placeMesh(item);
    return item;
  });
  const world = buildWorld(items, { onGoal: (star, by) => { if (goalCounts(by, true)) won = true; } });
  for (let i = 0; i < SECONDS * 60 && !won; i++) stepFrame(world);
  return won;
}

// Every way a part on offer can be set down: its kinds (the Ball part is
// a marble, ball or bowling ball), turns, flips and sizes.
function variants(part) {
  const kinds = part === 'ball' ? ['marble', 'ball', 'bowling'] : [part];
  const out = [];
  for (const type of kinds) {
    const def = GADGETS[type];
    const round = /marble|ball|bowling/.test(type);
    const sizes = def.resizable ? def.resizable.sizes.map(([w, h, off]) => (off ? { w, h, off } : { w, h })) : [null];
    for (const rot of round || !def.rotatable ? [0] : [0, 1, 2, 3]) {
      for (const flip of def.flippable ? [false, true] : [false]) {
        for (const size of sizes) out.push({ type, rot, flip, size });
      }
    }
  }
  return out;
}

function bounds(list) {
  let x0 = Infinity, x1 = -Infinity, y1 = 0;
  for (const [type, x, y, rot = 0, flip = false, size = null] of list) {
    const { box } = outlineAt(type, x, y, rot, size, !!flip);
    x0 = Math.min(x0, box[0]); x1 = Math.max(x1, box[2]); y1 = Math.max(y1, box[3]);
  }
  return { x0: Math.floor(x0) - 2, x1: Math.ceil(x1) + 2, y1: Math.ceil(y1) + 3 };
}

// Every spot `part` fits beside `others`; calls `found` with each win.
function sweep(level, part, others, found) {
  const taken = [...level.items, ...others].map(([type, x, y, rot = 0, flip = false, size = null]) => outlineAt(type, x, y, rot, size, !!flip));
  const b = bounds(level.items);
  let tries = 0;
  for (const v of variants(part)) {
    for (let x = b.x0; x <= b.x1; x += STEP) {
      for (let y = 0; y <= b.y1; y += STEP) {
        const here = outlineAt(v.type, x, y, v.rot, v.size, v.flip);
        if (outlineBottom(here) < -OUTLINE_EPS || taken.some((t) => outlinesOverlap(here, t))) continue;
        const entry = [v.type, x, y, v.rot, v.flip, v.size];
        tries++;
        if (wins(level.items, [...others, entry])) found([...others, entry]);
      }
    }
  }
  return tries;
}

const show = (list) => JSON.stringify(list.map(([t, x, y, r, f, s]) => [t, x, y, r || 0, !!f, s || null]));

for (const n of process.argv.slice(2).map(Number)) {
  const lv = LEVELS[n - 1];
  console.log(`level ${n}  ${lv.name}`);
  const hits = [];
  const t0 = Date.now();
  let tries = 0;
  // alone
  for (const part of Object.keys(lv.parts)) {
    tries += sweep(lv, part, [], (list) => hits.push(['alone', list]));
  }
  // short: leave part k out, move part j
  if (lv.solution.length > 1) {
    lv.solution.forEach((_, k) => {
      const rest = lv.solution.filter((__, i) => i !== k);
      rest.forEach((moving, j) => {
        if (rest.length === 1) return; // that's the "alone" search
        const fixed = rest.filter((__, i) => i !== j);
        tries += sweep(lv, partType(moving[0]), fixed, (list) => hits.push([`without ${lv.solution[k][0]}`, list]));
      });
    });
  }
  // One line per kind of shortcut, with its first few answers.
  const byKind = {};
  for (const [kind, list] of hits) (byKind[kind] ||= []).push(list);
  for (const [kind, lists] of Object.entries(byKind)) {
    console.log(`  ${kind}: ${lists.length} win${lists.length === 1 ? '' : 's'}`);
    for (const list of lists.slice(0, 3)) console.log('    ' + show(list));
  }
  console.log(`  ${hits.length ? hits.length + ' shortcut wins' : 'no shortcuts'} in ${tries} tries (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}
