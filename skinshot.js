// 着せ替えの絵：本物のゲームの描き方で、小さな場面を描いて画像にする（着せ替え・ガチャの画面で使う）
//   色のセットと背景を一時的に入れて描き、描き終えたら身に着けているものに戻す
import { createRenderer } from './render.js?v=20261122173419';
import { createGame } from './game.js?v=20261122173419';
import { applyForms } from './talents.js?v=20261122173419';
import { THEME, applyColorSet, applyBackground } from './theme.js?v=20261122173419';
import { COLOR_SETS, BACKGROUNDS } from './skins.js?v=20261122173419';
import { spawnPop, stepParticle } from './pops.js?v=20261122173419';

const VW = 150, VH = 100;   // 場面の広さ（ゲームの中の長さ）
const cache = new Map();
let current = { set: 'std', bg: 'grid' };   // 身に着けているもの（描き終えたら戻す）
let r = null, canvas = null, base = null;

export function setEquipped(eq) { current = { set: eq.set, bg: eq.bg }; }

function scene() {
  if (!base) base = createGame().state;
  const s = base;
  const ghost = (x, y, r0, idx, clip) => ({ x, y, r: r0, idx, len: 300, life: 99, spawnGlow: 0, trail: [], clip });
  const enemy = (kind, x, y, r0, ang = Math.PI) => ({ kind, x, y, r: r0, hp: 10, maxHp: 10, ang, flash: 0, phase: 'move', status: {} });
  const shard = (x, y) => ({ x, y, vx: 0, vy: 0, life: 9, spin: 0.6, flying: false, worth: 1 });
  return {
    ...s,
    world: { w: VW, h: VH }, mode: 'play', over: false, time: 3, shake: 0, hurtFlash: 0,
    player: { ...s.player, x: 70, y: 52, tx: 70, ty: 52, r: 8, inv: 0, moving: false },
    ghosts: [ghost(34, 74, 7, 1, [{ x: 18, y: 84 }, { x: 34, y: 74 }, { x: 52, y: 84 }]), ghost(108, 76, 6, 4, [{ x: 92, y: 86 }, { x: 108, y: 76 }, { x: 124, y: 86 }])],
    enemies: [enemy('chaser', 124, 26, 8), enemy('tank', 30, 22, 9), enemy('shooter', 96, 18, 7)],
    pickups: [shard(56, 30), shard(110, 50), shard(88, 86)],
    shots: [], enemyShots: [], lasers: [], pillars: [], particles: [], rings: [], flashes: [], labels: [],
    record: { ...s.record, active: true, length: 200, path: [{ x: 20, y: 46 }, { x: 34, y: 38 }, { x: 48, y: 44 }, { x: 60, y: 52 }, { x: 70, y: 52 }] },
    used: 200, evict: 0, boss: null, traps: [], fires: [],
  };
}

// 色のセット setId と背景 bgId で描いた場面の画像（data URL）
export function skinImage(setId, bgId) {
  const key = `${setId}|${bgId}`;
  if (cache.has(key)) return cache.get(key);
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.width = VW * 2.4; canvas.height = VH * 2.4;
    r = createRenderer(canvas, { width: VW, height: VH });
  }
  let url = '';
  try {
    applyColorSet(COLOR_SETS.find((x) => x.id === setId));
    applyBackground(BACKGROUNDS.find((x) => x.id === bgId));
    const st = scene();
    applyForms(st);
    r.draw(st, 2);
    url = canvas.toDataURL('image/png');
  } catch (err) {
    console.error(err);
  } finally {
    applyColorSet(COLOR_SETS.find((x) => x.id === current.set));
    applyBackground(BACKGROUNDS.find((x) => x.id === current.bg));
    if (THEME.rainbowBody || THEME.rainbowShard) { /* 次のフレームの描画で、虹の色はまた回る */ }
  }
  cache.set(key, url);
  return url;
}

// ---------- アイコン用：ボス・敵・分身を、ゲームと同じ描き方で1体だけ描く ----------
//   背景は描かず（透明）、身に着けている色のセットで描く
const UW = 40, UH = 40;
const unitCache = new Map();
let ur = null, ucanvas = null;
const UNIT = {
  core: { r: 15 }, hunter: { r: 12, ang: -Math.PI / 4 }, twin: { r: 12, side: 1 }, clock: { r: 14, handA: -Math.PI / 3 }, shade: { r: 13 },
  drift: { r: 12 }, shooter: { r: 12, ang: -Math.PI / 2 }, swarm: { r: 8, ang: -Math.PI / 4 }, tank: { r: 14 },
  chaser: { r: 11, ang: -Math.PI / 4 }, dasher: { r: 11, ang: -Math.PI / 4 }, bomber: { r: 11 }, thief: { r: 11, ang: -Math.PI / 4 }, shield: { r: 11, ang: -Math.PI / 2 },
};
export function unitImage(kind) {
  const key = `${kind}|${current.set}`;
  if (unitCache.has(key)) return unitCache.get(key);
  if (!ucanvas) {
    ucanvas = document.createElement('canvas');
    ucanvas.width = UW * 4; ucanvas.height = UH * 4;
    ur = createRenderer(ucanvas, { width: UW, height: UH });
  }
  let url = '';
  const keepBg = THEME.bg;
  try {
    if (!base) base = createGame().state;
    const s = base;
    const one = kind === 'ghost'
      ? { ghosts: [{ x: 20, y: 20, r: 11, idx: 0, len: 300, life: 99, spawnGlow: 0, trail: [], clip: null }], enemies: [] }
      : { ghosts: [], enemies: [{ kind, x: 20, y: 20, hp: 10, maxHp: 10, ang: 0, flash: 0, phase: 'move', status: {}, boss: ['core', 'hunter', 'twin', 'clock', 'shade'].includes(kind), ...UNIT[kind] }] };
    const st = {
      ...s, ...one,
      world: { w: UW, h: UH }, mode: 'play', over: true, time: 3, shake: 0, hurtFlash: 0,
      pickups: [], shots: [], enemyShots: [], lasers: [], pillars: [], particles: [], rings: [], flashes: [], labels: [],
      record: { ...s.record, active: false, path: [], length: 0 }, used: 0, evict: 0, boss: null, traps: [], fires: [], noVignette: true,
    };
    applyBackground({ id: 'none', bg: 'rgba(0,0,0,0)', grid: null });
    ucanvas.getContext('2d').clearRect(0, 0, ucanvas.width, ucanvas.height);
    ur.draw(st, 3);
    url = ucanvas.toDataURL('image/png');
  } catch (err) {
    console.error(err);
  } finally {
    applyBackground(BACKGROUNDS.find((x) => x.id === current.bg));
    THEME.bg = keepBg;
  }
  unitCache.set(key, url);
  return url;
}

// ---------- 背景の見本：背景だけを広めに描く（本体を真ん中に小さく1つ） ----------
const BW = 140, BH = 140;   // 狭めに切り取って大きく描く（小さな見本でも模様が見えるように）
const bgCache = new Map();
let br = null, bcanvas = null;
export function bgImage(bgId) {
  if (bgCache.has(bgId)) return bgCache.get(bgId);
  if (!bcanvas) {
    bcanvas = document.createElement('canvas');
    bcanvas.width = 280; bcanvas.height = 280;
    br = createRenderer(bcanvas, { width: BW, height: BH });
  }
  let url = '';
  try {
    applyColorSet(COLOR_SETS.find((x) => x.id === 'std'));
    applyBackground(BACKGROUNDS.find((x) => x.id === bgId));
    if (!base) base = createGame().state;
    const s = base;
    const st = {
      ...s,
      world: { w: BW, h: BH }, mode: 'play', over: true, time: 7, shake: 0, hurtFlash: 0, bgThumb: 5,   // 見本は狭いので、星や雨を多めに描く
      player: { ...s.player, x: BW / 2, y: BH / 2, tx: BW / 2, ty: BH / 2, r: 7, inv: 0, moving: false },
      ghosts: [], enemies: [], pickups: [], shots: [], enemyShots: [], lasers: [], pillars: [], particles: [], rings: [], flashes: [], labels: [],
      record: { ...s.record, active: false, path: [], length: 0 }, used: 0, evict: 0, boss: null, traps: [], fires: [], noVignette: true,
    };
    br.draw(st, 0.6);   // 流れ星が画面の中ほどを通る時刻
    url = bcanvas.toDataURL('image/png');
  } catch (err) {
    console.error(err);
  } finally {
    applyColorSet(COLOR_SETS.find((x) => x.id === current.set));
    applyBackground(BACKGROUNDS.find((x) => x.id === current.bg));
  }
  bgCache.set(bgId, url);
  return url;
}

// ---------- はじけ方の見本：敵が1体はじけた瞬間を描く（身に着けている色のセットで） ----------
const PW = 90, PH = 90;
const popCache = new Map();
let pr = null, pcanvas = null;
const POP_T = { std: 0.12, ripple: 0.3, blackhole: 0.42, firework: 0.13, spark: 0.08, dot: 0.12, star: 0.15, petal: 0.4, confetti: 0.4, bubble: 0.45, glitch: 0.18 };   // 見どころの時刻
export function popImage(id) {
  const key = `${id}|${current.set}`;
  if (popCache.has(key)) return popCache.get(key);
  if (!pcanvas) {
    pcanvas = document.createElement('canvas');
    pcanvas.width = 270; pcanvas.height = 270;
    pr = createRenderer(pcanvas, { width: PW, height: PH });
  }
  let url = '';
  try {
    if (!base) base = createGame().state;
    const s = base;
    // 毎回同じ形になるように、決まった乱数を使う
    let seed = 7;
    const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const e = { x: PW / 2, y: PH / 2, r: 11 };
    const parts = [];
    if (!spawnPop(id, e, (p) => parts.push(p), rand)) {
      // 標準：敵の色の四角と白い火花
      for (let i = 0; i < 25; i++) { const a = rand() * Math.PI * 2, v = 80 + rand() * 210, l = 0.25 + rand() * 0.25; parts.push({ x: e.x, y: e.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: l, max: l, kind: 'enemy', idx: 0, size: 1.5 + rand() * 2 }); }
      for (let i = 0; i < 11; i++) { const a = rand() * Math.PI * 2, v = 200 + rand() * 280, l = 0.15 + rand() * 0.15; parts.push({ x: e.x, y: e.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: l, max: l, kind: 'white', idx: 0, size: 1.4, streak: true }); }
      parts.push({ x: e.x, y: e.y, vx: 0, vy: 0, shape: 'ring', size: 9, grow: 110, kind: 'enemy', idx: 0, life: 0.4, max: 0.4, w: 3 });
    }
    const T = POP_T[id] ?? 0.22;
    for (let t = 0; t < T; t += 1 / 60) for (const p of parts) stepParticle(p, 1 / 60);
    const st = {
      ...s,
      world: { w: PW, h: PH }, mode: 'play', over: true, time: 3, shake: 0, hurtFlash: 0,
      ghosts: [], enemies: [], pickups: [], shots: [], enemyShots: [], lasers: [], pillars: [], rings: [], flashes: [], labels: [],
      particles: parts.filter((p) => p.life > 0),
      record: { ...s.record, active: false, path: [], length: 0 }, used: 0, evict: 0, boss: null, traps: [], fires: [], noVignette: true,
    };
    pr.draw(st, 3);
    url = pcanvas.toDataURL('image/png');
  } catch (err) {
    console.error(err);
  }
  popCache.set(key, url);
  return url;
}
