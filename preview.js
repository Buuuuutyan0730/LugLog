// 新しい見た目の見本（動かない）。調整パネルの「見本」から開く。
// ゲームの計算は止めたまま、作り物の状態を描画と画面表示に渡すだけ。
// 仕組みをつなぐときは、ここで作っている形（e.status・state.boss・カードの中身）を game.js が作るようにする。

import { BOOSTS, CURSES } from './talents.js?v=20261123194925';
import { CONFIG } from './config.js?v=20261123194925';
import { SKILL_ROADS } from './skilldefs.js?v=20261123194925';
import { createScreens, SCREEN_TABS, SOUND_TABS, LIVE_BG, ITEM_TABS } from './screens.js?v=20261123194925';
import { GACHA_POOL } from './skins.js?v=20261123194925';
import { createGame } from './game.js?v=20261123194925';
import { TUTO_STEPS, TUTO_INTRO } from './tutorial.js?v=20261123194925';
import { createGachaFx } from './gachafx.js?v=20261123194925';

const W = 360, H = 532;
const rOf = (hp) => 2.2 * Math.sqrt(hp); // 半径＝2.2×√体力

function enemy(kind, x, y, hp, maxHp, status, extra = {}) {
  const mul = (CONFIG.enemies[kind] && CONFIG.enemies[kind].sizeMul) || 1;   // ゲームと同じ大きさの倍率
  return { kind, x, y, r: rOf(maxHp) * mul, hp, maxHp, ang: Math.PI / 2, flash: 0, phase: 'move', status, ...extra };
}

// 戦闘画面：ボス1体と、状態の印をつけた敵
function buildScene() {
  const gravity = { x: 272, y: 452 };   // 吸い寄せる分身の位置
  const enemies = [
    enemy('core', 180, 178, 1300, 2000, {}, { boss: true, r: 42 }),
    enemy('chaser', 68, 278, 20, 20, { freeze: true }),
    enemy('shooter', 180, 278, 18, 30, { shock: true }),
    enemy('tank', 292, 278, 60, 80, { poison: true }),
    enemy('chaser', 68, 375, 12, 20, { burn: true }),
    enemy('shooter', 180, 375, 30, 30, { mark: true }),
    enemy('chaser', 292, 375, 9, 20, { poison: true, burn: true, shock: true }),
    enemy('dasher', 140, 455, 30, 30, { pull: gravity }, { ang: 0 }),
    enemy('chaser', 68, 190, 20, 20, { chill: true }),
  ];
  const names = ['', '凍結', '痺れ', '毒', '燃焼', '目印', '重なり（毒・燃焼・痺れ）', '吸い寄せ', '冷えて遅い'];
  const labels = enemies.map((e, i) => names[i] && { x: e.x, y: e.y + e.r + 7, text: names[i] }).filter(Boolean);
  labels.push({ x: gravity.x, y: gravity.y + 22, text: '分身（引力）' });

  const ghost = {
    x: gravity.x, y: gravity.y, r: 15, idx: 2, len: 300, life: 99, spawnGlow: 0, trail: [],
    clip: [{ x: 230, y: 470 }, { x: 272, y: 452 }, { x: 320, y: 470 }],
  };
  return {
    world: { w: W, h: H },
    enemies,
    ghosts: [ghost],
    labels,
    boss: { name: 'コア', hp: 1300, maxHp: 2000, lag: 0.78 },
  };
}

// 分身の道（第1弾）の場面：一斉射撃・重砲の爆発・押しつぶし・威圧と、新しい敵（漂い・群れ）
// 敵：ボス以外の状態の印（buildScene からボスを外したもの）
function buildStates() {
  const sc = buildScene();
  return { ...sc, enemies: sc.enemies.filter((e) => !e.boss), boss: null };
}

// ボス：コアと、画面上のHPバー
function buildBoss() {
  const sc = buildScene();
  const core = sc.enemies.find((e) => e.boss);
  return { world: { w: W, h: H }, enemies: [{ ...core, y: 240 }], ghosts: [], labels: [{ x: 180, y: 290, text: 'コア（ボス）' }], boss: sc.boss };
}

// ---- ボス5体と中ボス（見た目だけ。ボスのHPバーは画面の上） ----
const bossBar = (name, ratio = 0.72) => ({ name, hp: ratio * 1000, maxHp: 1000, lag: Math.min(1, ratio + 0.06) });
// コア：回りながら3本の渦の弾幕。まわりに追跡を呼ぶ
function buildBossCore() {
  const core = enemy('core', 180, 200, 1300, 2000, {}, { boss: true, r: 42 });
  const enemyShots = [];
  for (let arm = 0; arm < 3; arm++) for (let k = 1; k <= 7; k++) { const a = arm * (Math.PI * 2 / 3) + k * 0.32, d = 50 + k * 24; enemyShots.push({ x: 180 + Math.cos(a) * d, y: 200 + Math.sin(a) * d, vx: Math.cos(a) * 80, vy: Math.sin(a) * 80, r: 4 }); }
  const calls = [enemy('chaser', 70, 330, 20, 20, {}, { ang: -0.5 }), enemy('chaser', 290, 330, 20, 20, {}, { ang: -2.6 })];
  const rings = calls.map((c) => ({ x: c.x, y: c.y, r0: 4, r1: 26, life: 0.2, max: 0.4, kind: 'enemy', idx: 0, width: 3 }));
  return { world: { w: W, h: H }, enemies: [core, ...calls], enemyShots, rings, ghosts: [], labels: [{ x: 180, y: 262, text: 'コア（フェーズ10）' }, { x: 180, y: 380, text: '回る弾幕と、追跡を呼ぶ' }], boss: bossBar('コア') };
}
// ハンター：本体めがけて突進。直前に太い帯で予告
function buildBossHunter() {
  // 上：ふだんの姿（獲物を探して飛び回る）／下：突進の予告
  const roam = enemy('hunter', 180, 170, 900, 1400, {}, { boss: true, r: 30, ang: 0 });
  const ang = Math.atan2(470 - 300, 300 - 70);
  const h1 = enemy('hunter', 70, 300, 900, 1400, {}, { boss: true, r: 30, ang, phase: 'windup', dashLen: 240 });
  return { world: { w: W, h: H }, enemies: [roam, h1], ghosts: [], labels: [{ x: 180, y: 225, text: 'ハンター（フェーズ20）' }, { x: 250, y: 500, text: '赤い帯：突進の予告' }], boss: bossBar('ハンター') };
}
// 双子：2体で現れ、赤い糸でつながる。片方が倒れると、もう片方が怒る
function buildBossTwins() {
  const a = enemy('twin', 120, 150, 700, 1000, {}, { boss: true, r: 30, side: 1 });
  const b = enemy('twin', 240, 150, 700, 1000, {}, { boss: true, r: 30, side: -1 });
  const angry = enemy('twin', 180, 360, 700, 1000, {}, { boss: true, r: 36, side: 1, rage: true });
  return { world: { w: W, h: H }, enemies: [a, b, angry], ghosts: [], labels: [{ x: 180, y: 210, text: '双子（フェーズ30）' }, { x: 180, y: 425, text: '片方が倒れると、怒って強くなる' }], boss: bossBar('双子', 0.55) };
}
// 時計：針の予告のあと、時間を止める
function buildBossClock() {
  const c = enemy('clock', 180, 220, 1500, 2000, {}, { boss: true, r: 36, phase: 'windup', timer: 0.45, windupMax: 1, handA: Math.PI / 2 });
  return { world: { w: W, h: H }, enemies: [c], ghosts: [], labels: [{ x: 180, y: 380, text: '時計（フェーズ40）' }, { x: 180, y: 400, text: '針が一周すると、時間が止まる' }], boss: bossBar('時計') };
}
function buildBossClockStop() {
  const c = enemy('clock', 180, 150, 1500, 2000, {}, { boss: true, r: 36 });
  const gs = [
    { x: 90, y: 330, r: rOf(10), idx: 1, len: 200, life: 99, spawnGlow: 0, trail: [], clip: [{ x: 50, y: 340 }, { x: 90, y: 330 }, { x: 130, y: 340 }] },
    { x: 270, y: 330, r: rOf(10), idx: 3, len: 200, life: 99, spawnGlow: 0, trail: [], clip: [{ x: 230, y: 340 }, { x: 270, y: 330 }, { x: 310, y: 340 }] },
  ];
  const enemyShots = []; for (let k = 0; k < 10; k++) { const a = k * 0.63; enemyShots.push({ x: 180 + Math.cos(a) * 60, y: 150 + Math.sin(a) * 60, vx: Math.cos(a) * 60, vy: Math.sin(a) * 60, r: 4 }); }
  return { world: { w: W, h: H }, enemies: [c], ghosts: gs, enemyShots, timeStop: 1, labels: [{ x: 180, y: 410, text: '時間停止中：分身が止まり、その間に攻撃' }], boss: bossBar('時計', 0.6) };
}
// 影：自分の分身の動きを真似た「敵の分身」を作る
function buildBossShade() {
  const s = enemy('shade', 180, 170, 1600, 2400, {}, { boss: true, r: 34 });
  const loop = []; for (let k = 0; k <= 40; k++) { const a = (k / 40) * Math.PI * 2; loop.push({ x: 120 + Math.cos(a) * 60, y: 360 + Math.sin(a) * 40 }); }
  const line = []; for (let k = 0; k <= 20; k++) line.push({ x: 220 + k * 5, y: 330 + Math.sin(k * 0.6) * 30 });
  const e1 = enemy('echo', loop[10].x, loop[10].y, 60, 60, {}, { r: 11, path: loop });
  const e2 = enemy('echo', line[14].x, line[14].y, 60, 60, {}, { r: 11, path: line });
  return { world: { w: W, h: H }, enemies: [s, e1, e2], ghosts: [], labels: [{ x: 180, y: 240, text: '影（フェーズ50）' }, { x: 180, y: 440, text: '赤い点線：真似された分身の道筋' }], boss: bossBar('影') };
}
// ---- 新しいボス（6〜10体目）：今は見た目だけ ----
const lbl = (y, text) => ({ x: 180, y, text });
function buildBossComet() {
  const c = enemy('comet', 230, 170, 1, 1, {}, { boss: true, r: 30, ang: Math.PI * 0.85 });
  const tail = []; for (let k = 0; k <= 60; k++) { const a = -0.25 + (k / 60) * 4.2; tail.push({ x: 180 + Math.cos(a) * 150, y: 280 + Math.sin(a) * 210 }); }
  const tail2 = []; for (let k = 0; k <= 30; k++) tail2.push({ x: 30 + k * 10, y: 400 + Math.sin(k * 0.25) * 30 });
  return { world: { w: W, h: H }, enemies: [c], ghosts: [], bossTrails: [{ kind: 'fire', w: 6, pts: tail }, { kind: 'fire', w: 6, pts: tail2 }], labels: [lbl(232, '彗星（フェーズ60）'), lbl(470, '燃える尾が残り、画面が切り分けられていく')], boss: bossBar('彗星') };
}
function buildBossMirage() {
  const a = enemy('mirage', 90, 200, 1, 1, {}, { boss: true, r: 32, fake: true });
  const b = enemy('mirage', 180, 160, 1, 1, {}, { boss: true, r: 32 });
  const c = enemy('mirage', 270, 200, 1, 1, {}, { boss: true, r: 32, fake: true });
  return { world: { w: W, h: H }, enemies: [a, b, c], ghosts: [], labels: [lbl(262, '蜃気楼（フェーズ70）'), lbl(300, '本物は1体だけ。偽物には弾がすり抜ける')], boss: bossBar('蜃気楼') };
}
function buildBossEclipse() {
  const e = enemy('eclipse', 180, 170, 1, 1, {}, { boss: true, r: 40 });
  const others = [enemy('chaser', 80, 330, 20, 20, {}), enemy('chaser', 290, 300, 20, 20, {}), enemy('shooter', 120, 470, 30, 30, {})];
  const player = { x: 180, y: 400, r: 10, tx: 180, ty: 400, drawMode: false, look: {}, dir: -Math.PI / 2 };
  return { world: { w: W, h: H }, showPlayer: true, player, hp: 100, maxHp: 100, enemies: [e, ...others], ghosts: [], darkness: { k: 1, holes: [{ x: 180, y: 400, r: 85 }, { x: 180, y: 170, r: 110 }] }, labels: [lbl(252, '日蝕（フェーズ80）'), lbl(500, '暗転：自分とボスのまわりしか見えない')], boss: bossBar('日蝕') };
}
function buildBossAbyss() {
  const e = enemy('abyss', 180, 200, 1, 1, {}, { boss: true, r: 38 });
  const enemyShots = []; for (let k = 0; k < 26; k++) { const u = k / 26, a = u * 9, rr = 40 + u * 190; enemyShots.push({ x: 180 + Math.cos(a) * rr, y: 200 + Math.sin(a) * rr * 0.9, vx: 0, vy: 0, r: 4, life: 1 }); }
  return { world: { w: W, h: H }, enemies: [e], enemyShots, ghosts: [], labels: [lbl(282, '深淵（フェーズ90）'), lbl(470, '弾もかけらも自分も、渦に吸い込まれる')], boss: bossBar('深淵') };
}
function buildBossShuhitsu() {
  const e = enemy('shuhitsu', 180, 150, 1, 1, {}, { boss: true, r: 44 });
  const s1 = []; for (let k = 0; k <= 30; k++) s1.push({ x: 40 + k * 9, y: 330 + Math.sin(k * 0.3) * 26 });
  const s2 = []; for (let k = 0; k <= 24; k++) { const a = k / 24 * Math.PI * 1.6; s2.push({ x: 250 + Math.cos(a) * 55, y: 430 + Math.sin(a) * 40 }); }
  const g1 = enemy('inkghost', s1[12].x, s1[12].y, 60, 60, {}, { r: 12 });
  const g2 = enemy('inkghost', s2[9].x, s2[9].y, 60, 60, {}, { r: 12 });
  return { world: { w: W, h: H }, enemies: [e, g1, g2], ghosts: [], bossTrails: [{ kind: 'ink', w: 7, pts: s1 }, { kind: 'ink', w: 7, pts: s2 }], labels: [lbl(272, '終筆（フェーズ100・ラスボス）'), lbl(500, '墨の線が、黒い分身になって撃ってくる')], boss: bossBar('終筆') };
}
// 中ボス：通常の敵を大きく硬くしたもの（太い縁取りがもう1本）。倒すと小さいのがはじけ出る
function buildElites() {
  // 大きさは通常の1.5倍（体力は約8倍でも、見た目は大きくしすぎない）
  const a = enemy('chaser', 100, 150, 160, 160, {}, { elite: true, ang: Math.PI / 2, r: rOf(20) * 1.25 * 1.5 });
  const b = enemy('tank', 260, 150, 640, 640, {}, { elite: true, r: rOf(80) * 1.25 * 1.5 });
  const pops = []; for (let k = 0; k < 6; k++) { const ang = (k / 6) * Math.PI * 2; pops.push(enemy('chaser', 180 + Math.cos(ang) * 40, 380 + Math.sin(ang) * 40, 20, 20, {}, { ang })); }
  const rings = [{ x: 180, y: 380, r0: 10, r1: 60, life: 0.2, max: 0.45, kind: 'enemy', idx: 0, width: 4 }];
  return { world: { w: W, h: H }, enemies: [a, b, ...pops], rings, ghosts: [], labels: [{ x: 100, y: 205, text: '中ボス（追跡）' }, { x: 260, y: 215, text: '中ボス（重量）' }, { x: 180, y: 450, text: '倒すと、通常の5〜6体がはじけ出る' }], boss: null };
}

// 敵の種類：10種類と、強さ（×1・×2・×4）での大きさの違い
function buildEnemyTypes() {
  const list = [
    ['drift', '漂い', 15], ['chaser', '追跡', 20], ['shooter', '射撃', 30], ['swarm', '群れ', 4], ['shield', '盾持ち', 40],
    ['tank', '重量', 80], ['dasher', '突進', 30], ['thief', 'かけら泥棒', 25], ['bomber', '自爆', 30],
  ];
  const xs = [40, 110, 180, 250, 320];
  const enemies = [], labels = [];
  list.forEach(([kind, name, hp], i) => {
    const x = xs[i % 5], y = i < 5 ? 120 : 240;
    const extra = { ang: Math.PI / 2 };
    if (kind === 'shield') Object.assign(extra, { shield: hp, shieldMax: hp });
    if (kind === 'swarm') {
      for (let k = 0; k < 6; k++) enemies.push(enemy(kind, x + Math.cos(k) * 14, y + Math.sin(k * 1.7) * 14, hp, hp, {}, extra));
    } else enemies.push(enemy(kind, x, y, hp, hp, {}, extra));
    labels.push({ x, y: y + 36, text: name });
  });
  [[1, 90], [2, 180], [4, 290]].forEach(([tier, x]) => {
    enemies.push(enemy('chaser', x, 380, 20 * tier, 20 * tier, {}, { ang: Math.PI / 2 }));
    labels.push({ x, y: 430, text: `強さ ×${tier}` });
  });
  return { world: { w: W, h: H }, enemies, ghosts: [], labels, boss: null };
}

// エフェクト：攻撃以外の共通の効果
function buildEffects() {
  const ghosts = [
    { x: 70, y: 120, r: 12, idx: 1, len: 240, life: 99, spawnGlow: 0.6, trail: [], clip: [{ x: 30, y: 135 }, { x: 70, y: 120 }, { x: 110, y: 130 }] },   // 生まれた直後
    { x: 180, y: 120, r: 12, idx: 3, len: 240, life: 0.2, spawnGlow: 0, trail: [], clip: [{ x: 140, y: 135 }, { x: 180, y: 120 }, { x: 220, y: 130 }] },   // 押し出される前の点滅
  ];
  const enemies = [enemy('tank', 290, 120, 60, 80, {}, { flash: 1 })];   // 当たった瞬間
  const particles = [];
  for (let k = 0; k < 14; k++) { const a = (k / 14) * Math.PI * 2, v = 160 + (k % 3) * 40; particles.push({ x: 70 + Math.cos(a) * 6, y: 260 + Math.sin(a) * 6, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.25, max: 0.45, kind: 'enemy', idx: 0, size: 3, streak: true }); }
  const rings = [
    { x: 70, y: 260, r0: 6, r1: 34, life: 0.18, max: 0.35, kind: 'enemy', idx: 0, width: 4 },     // 敵が倒れた
    { x: 290, y: 120, r0: 4, r1: 22, life: 0.12, max: 0.25, kind: 'white', idx: 0, width: 3 },    // 当たった
    { x: 180, y: 260, r0: 8, r1: 44, life: 0.2, max: 0.4, kind: 'player', idx: 0, width: 5 },    // 衝撃波（ボーナス）
  ];
  const pickups = [
    { x: 268, y: 250, life: 9, spin: 0.3 }, { x: 290, y: 268, life: 9, spin: 1.1 }, { x: 312, y: 248, life: 2, spin: 2 },   // 落ちたかけら（右は消える前の点滅）
    { x: 120, y: 380, life: 9, spin: 0.6, gold: true },                                                                    // 金のかけら
    { x: 230, y: 372, life: 9, spin: 0.2, flying: true }, { x: 252, y: 386, life: 9, spin: 1.4, flying: true },          // 本体へ飛んでいくかけら
  ];
  const labels = [
    { x: 70, y: 152, text: '分身が生まれた' }, { x: 180, y: 152, text: '押し出される前' }, { x: 290, y: 152, text: '当たった' },
    { x: 70, y: 300, text: '敵が倒れた' }, { x: 180, y: 300, text: '衝撃波' }, { x: 290, y: 300, text: 'かけら' },
    { x: 120, y: 410, text: '金のかけら' }, { x: 250, y: 410, text: 'かけらを吸う' },
  ];
  return { world: { w: W, h: H }, enemies, ghosts, particles, rings, pickups, labels, boss: null };
}

function buildGhostRoad() {
  const big = { x: 180, y: 300, r: rOf(60), idx: 1, len: 600, life: 99, spawnGlow: 0, trail: [], awe: 95,
    clip: [{ x: 90, y: 330 }, { x: 180, y: 300 }, { x: 270, y: 330 }] };
  const small = [
    { x: 70, y: 450, r: rOf(8), idx: 4, len: 160, life: 99, spawnGlow: 0, trail: [], clip: [{ x: 40, y: 470 }, { x: 70, y: 450 }, { x: 110, y: 470 }] },
    { x: 290, y: 455, r: rOf(10), idx: 6, len: 200, life: 99, spawnGlow: 0, trail: [], clip: [{ x: 250, y: 470 }, { x: 290, y: 455 }, { x: 330, y: 470 }] },
  ];
  const enemies = [
    // 押しつぶし：大きな分身に触れている敵
    enemy('chaser', 180 + 30, 300 - 26, 12, 20, {}),
    // 重砲：弾が当たって爆発した敵と、巻き込まれた周りの敵
    enemy('tank', 92, 160, 50, 80, {}),
    enemy('chaser', 60, 132, 14, 20, {}),
    enemy('chaser', 128, 128, 14, 20, {}),
    // 威圧の輪の中で遅くなっている敵
    enemy('shooter', 120, 360, 30, 30, {}),
    // 新しい敵：漂い
    enemy('drift', 290, 150, 20, 20, {}),
    enemy('drift', 320, 205, 20, 20, {}),
  ];
  // 新しい敵：群れ（小さいものが固まって来る）
  const sw = [[250, 255], [262, 248], [274, 258], [256, 270], [270, 272], [284, 266], [248, 282], [262, 286], [278, 284], [292, 279]];
  for (const [x, y] of sw) enemies.push(enemy('swarm', x, y + 120, 3, 3, {}));
  // 一斉射撃：描き終えた瞬間に、全分身から同時に弾が出る
  const shot = (g, tx, ty, power) => {
    const d = Math.hypot(tx - g.x, ty - g.y) || 1;
    const k = Math.min(0.45, (g.r + 40) / d);
    return { x: g.x + (tx - g.x) * k, y: g.y + (ty - g.y) * k, vx: (tx - g.x) / d * 460, vy: (ty - g.y) / d * 460,
      owner: 'ghost', idx: g.idx, size: 2.2 * Math.sqrt(power) * 0.3 };
  };
  const shots = [shot(big, 92, 160, 30), shot(big, 290, 150, 30), shot(small[0], 120, 360, 8), shot(small[1], 270, 380, 10)];
  // 演出は途中の形で止めて見せる（life は max の半分）
  const rings = [
    { x: 92, y: 160, r0: 10, r1: 70, life: 0.25, max: 0.5, kind: 'ghost', idx: 1, width: 5 },    // 重砲の爆発
    { x: 92, y: 160, r0: 6, r1: 40, life: 0.18, max: 0.3, kind: 'white', idx: 0, width: 3 },
    { x: 210, y: 274, r0: 4, r1: 24, life: 0.12, max: 0.25, kind: 'ghost', idx: 1, width: 3 }, // 押しつぶし
  ];
  const flashes = [
    { x: 92, y: 160, r: 60, life: 0.08, max: 0.16, kind: 'ghost', idx: 1 },
    { x: 205, y: 284, r: 22, life: 0.06, max: 0.12, kind: 'white', idx: 0 },
  ];
  const particles = [];
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2, v = 160;
    particles.push({ x: 92 + Math.cos(a) * 26, y: 160 + Math.sin(a) * 26, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.25, max: 0.4, kind: 'ghost', idx: 1, size: 3, streak: true });
  }
  for (let k = 0; k < 6; k++) {
    const a = -Math.PI / 4 + (k - 2.5) * 0.35, v = 200;
    particles.push({ x: 212 + Math.cos(a) * 6, y: 274 + Math.sin(a) * 6, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.2, max: 0.3, kind: 'white', idx: 0, size: 2, streak: true });
  }
  const labels = [
    { x: 92, y: 200, text: '重砲の爆発' },
    { x: 250, y: 296, text: '押しつぶし' },
    { x: 180, y: 403, text: '威圧（遅くなる範囲）' },
    { x: 305, y: 225, text: '漂い' },
    { x: 270, y: 418, text: '群れ' },
    { x: 180, y: 486, text: '一斉射撃（全分身が同時に撃つ）' },
  ];
  return { world: { w: W, h: H }, enemies, ghosts: [big, ...small], shots, rings, flashes, particles, labels, boss: null };
}

// 分身の道（第2弾）の場面：群体の型（群れ・分裂・集中砲火・目印・千の影）と、新しい敵（盾持ち）
function buildSwarmRoad() {
  const g = (x, y, len, idx, clip, extra = {}) => ({ x, y, r: rOf(len / 20), idx, len, life: 99, spawnGlow: 0, trail: [], clip, ...extra });
  // 群れ：小さな分身がたくさん（短い軌跡をいくつも描いた状態）
  const swarm = [
    g(60, 290, 90, 0, [{ x: 40, y: 280 }, { x: 60, y: 290 }, { x: 90, y: 302 }]),
    g(110, 320, 80, 1, [{ x: 95, y: 330 }, { x: 110, y: 320 }, { x: 140, y: 316 }]),
    g(170, 340, 100, 2, [{ x: 150, y: 352 }, { x: 170, y: 340 }, { x: 205, y: 336 }]),
    g(232, 326, 90, 3, [{ x: 215, y: 318 }, { x: 232, y: 326 }, { x: 262, y: 332 }]),
    g(292, 302, 80, 5, [{ x: 280, y: 290 }, { x: 292, y: 302 }, { x: 318, y: 310 }]),
    g(140, 276, 70, 6, [{ x: 125, y: 268 }, { x: 140, y: 276 }, { x: 165, y: 280 }]),
  ];
  // 千の影：1本の軌跡を、3体が間をあけて往復する
  const pathK = [{ x: 40, y: 470 }, { x: 110, y: 445 }, { x: 180, y: 460 }, { x: 250, y: 445 }, { x: 320, y: 470 }];
  const thousand = [[75, 458], [180, 460], [285, 458]].map(([x, y]) => g(x, y, 300, 4, pathK));
  // 分裂：押し出された分身が、小さな2体に分かれたところ（残り時間の輪つき）
  const split = [
    g(296, 396, 50, 2, [{ x: 286, y: 406 }, { x: 296, y: 396 }, { x: 316, y: 391 }], { split: 0.7 }),
    g(322, 418, 50, 2, [{ x: 312, y: 424 }, { x: 322, y: 418 }, { x: 341, y: 412 }], { split: 0.35 }),
  ];
  const toward = (x, y) => Math.atan2(470 - y, 180 - x);   // 本体（下の真ん中）へ盾を向ける
  const enemies = [
    // 盾持ち：無傷・盾が削れた（盾の残りのバー）・盾が壊れた
    enemy('shield', 60, 132, 60, 60, {}, { shield: 60, shieldMax: 60, ang: toward(60, 132) }),
    enemy('shield', 180, 122, 60, 60, {}, { shield: 22, shieldMax: 60, shieldHit: 0.05, ang: toward(180, 122) }),
    enemy('shield', 300, 132, 34, 60, {}, { shield: 0, shieldMax: 60, ang: toward(300, 132) }),
    // 集中砲火：輪が満ちている途中／上限（光る）。目印つき
    enemy('tank', 110, 218, 50, 80, { mark: true }, { focus: 0.6 }),
    enemy('chaser', 250, 224, 12, 20, {}, { focus: 1 }),
    enemy('chaser', 305, 240, 20, 20, { mark: true }),
  ];
  const shot = (from, tx, ty, power) => {
    const d = Math.hypot(tx - from.x, ty - from.y) || 1;
    const k = 0.55;
    return { x: from.x + (tx - from.x) * k, y: from.y + (ty - from.y) * k, vx: (tx - from.x) / d * 460, vy: (ty - from.y) / d * 460,
      owner: 'ghost', idx: from.idx, size: 2.2 * Math.sqrt(power) * 0.3 };
  };
  const shots = [
    shot(swarm[0], 110, 218, 5), shot(swarm[1], 110, 218, 4), shot(swarm[5], 110, 218, 4), shot(swarm[2], 110, 218, 5),
    shot(swarm[3], 250, 224, 5), shot(swarm[4], 250, 224, 4),
    shot(thousand[1], 180, 148, 15),
  ];
  // 盾に弾が当たって防がれたところ（白い火花）
  const particles = [];
  for (let k = 0; k < 7; k++) {
    const a = Math.PI / 2 + (k - 3) * 0.32, v = 170;
    particles.push({ x: 180 + Math.cos(a) * 4, y: 148 + Math.sin(a) * 4, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.2, max: 0.3, kind: 'white', idx: 0, size: 2, streak: true });
  }
  const rings = [
    { x: 180, y: 148, r0: 2, r1: 10, life: 0.12, max: 0.25, kind: 'white', idx: 0, width: 2 },
    { x: 309, y: 407, r0: 8, r1: 30, life: 0.15, max: 0.3, kind: 'ghost', idx: 2, width: 2 },   // 分裂した場所
  ];
  const labels = [
    { x: 60, y: 168, text: '盾持ち' },
    { x: 180, y: 168, text: '盾が削れる' },
    { x: 300, y: 168, text: '盾が壊れた' },
    { x: 110, y: 252, text: '集中砲火・目印' },
    { x: 250, y: 252, text: '上限' },
    { x: 180, y: 368, text: '群れ（小さい分身たくさん）' },
    { x: 248, y: 412, text: '分裂' },
    { x: 180, y: 496, text: '千の影（1本の軌跡を3体）' },
  ];
  return { world: { w: W, h: H }, enemies, ghosts: [...swarm, ...thousand, ...split], shots, rings, flashes: [], particles, labels, boss: null };
}

// 分身の道（第3弾）の場面：砲台の型（固定砲台・レーザー・散弾・迎撃・天の光）と、新しい敵（かけら泥棒）
function buildTurretRoad() {
  // 固定砲台：分身は生まれた場所（軌跡の描き始め）に留まる。軌跡の線は強さの目安として残る
  const g = (x, y, len, idx, clip) => ({ x, y, r: rOf(len / 20), idx, len, life: 99, spawnGlow: 0, trail: [], clip });
  const laserG = g(46, 320, 240, 1, [{ x: 46, y: 320 }, { x: 80, y: 348 }, { x: 130, y: 340 }]);
  const shotG = g(100, 452, 200, 4, [{ x: 100, y: 452 }, { x: 150, y: 468 }, { x: 195, y: 460 }]);
  const guardG = g(300, 452, 180, 6, [{ x: 300, y: 452 }, { x: 325, y: 475 }, { x: 345, y: 452 }]);
  const enemies = [
    // 天の光に貫かれている敵
    enemy('chaser', 262, 140, 8, 20, {}, { flash: 1 }),
    enemy('tank', 262, 212, 40, 80, {}, { flash: 1 }),
    // レーザーが並んだ敵を貫く
    enemy('chaser', 130, 301, 10, 20, {}, { flash: 1 }),
    enemy('shooter', 190, 288, 18, 30, {}, { flash: 1 }),
    enemy('chaser', 240, 277, 12, 20, {}, { flash: 1 }),
    // 散弾の先の敵
    enemy('chaser', 52, 382, 20, 20, {}),
    enemy('drift', 140, 378, 20, 20, {}),
    // かけら泥棒：かけらを持って逃げる／落ちているかけらへ向かう
    enemy('thief', 86, 196, 25, 25, {}, { carry: 5 }),
    enemy('thief', 150, 110, 25, 25, {}, { carry: 0 }),
  ];
  const pickups = [
    { x: 182, y: 100, life: 9, spin: 0.3 }, { x: 196, y: 116, life: 9, spin: 1.1 },
  ];
  // 散弾：扇のように広がる5発
  const shots = [];
  for (let k = -2; k <= 2; k++) {
    const a = -Math.PI / 2 - 0.1 + k * 0.24, v = 460, d = 46;
    shots.push({ x: shotG.x + Math.cos(a) * d, y: shotG.y + Math.sin(a) * d, vx: Math.cos(a) * v, vy: Math.sin(a) * v, owner: 'ghost', idx: 4, size: 2.2 });
  }
  // 迎撃：分身の弾が、敵の弾を撃ち落としたところ
  shots.push({ x: 306, y: 410, vx: 60, vy: -455, owner: 'ghost', idx: 6, size: 2 });
  const enemyShots = [{ x: 332, y: 378, r: 5, life: 1 }];
  const lasers = [{ x1: laserG.x, y1: laserG.y, x2: 360, y2: 320 - (360 - laserG.x) * 0.22, w: 4, life: 0.7, max: 1, idx: 1 }];
  const pillars = [{ x: 262, w: 26, life: 0.75, max: 1 }];
  const rings = [
    { x: 318, y: 388, r0: 3, r1: 26, life: 0.15, max: 0.3, kind: 'ghost', idx: 6, width: 2 },   // 極迎撃の小さな衝撃波
  ];
  const particles = [];
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2, v = 150;
    particles.push({ x: 318 + Math.cos(a) * 3, y: 388 + Math.sin(a) * 3, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.2, max: 0.3, kind: 'white', idx: 0, size: 2, streak: true });
  }
  const labels = [
    { x: 322, y: 176, text: '天の光' },
    { x: 86, y: 236, text: 'かけら泥棒（持って逃げる）' },
    { x: 150, y: 76, text: 'かけらへ向かう' },
    { x: 140, y: 340, text: 'レーザー（画面の端まで）' },
    { x: 100, y: 482, text: '散弾' },
    { x: 300, y: 482, text: '迎撃' },
    { x: 200, y: 418, text: '固定砲台（その場で撃つ）' },
  ];
  return { world: { w: W, h: H }, enemies, ghosts: [laserG, shotG, guardG], shots, enemyShots, pickups, lasers, pillars, rings, flashes: [], particles, labels, boss: null };
}

// 分身の道（第4弾）の場面：守護の型（おとり・挑発・反撃・修復・不落）と、新しい敵（自爆）
function buildGuardRoad() {
  const g = (x, y, len, idx, clip, extra = {}) => ({ x, y, r: rOf(len / 20), idx, len, life: 99, spawnGlow: 0, trail: [], clip, ...extra });
  // おとり：大きな分身が敵を引きつけている（HPが減っている）
  const decoy = g(130, 290, 500, 1, [{ x: 70, y: 310 }, { x: 130, y: 290 }, { x: 200, y: 300 }], { hp: 42, maxHp: 70, taunt: 105 });
  // 修復：HPが戻りつつある分身
  const repair = g(296, 300, 220, 4, [{ x: 270, y: 320 }, { x: 296, y: 300 }, { x: 330, y: 312 }], { hp: 26, maxHp: 31 });
  // 不落：HPが0になっても1で止まっている、一番大きい分身（の例）
  const last = g(70, 440, 300, 6, [{ x: 40, y: 450 }, { x: 70, y: 440 }, { x: 110, y: 448 }], { hp: 0.6, maxHp: 42 });
  const toward = (x, y) => Math.atan2(decoy.y - y, decoy.x - x);
  const enemies = [
    // 引きつけられて分身へ向かう敵
    enemy('chaser', 52, 232, 20, 20, {}, { ang: toward(52, 232) }),
    enemy('chaser', 210, 236, 20, 20, {}, { ang: toward(210, 236) }),
    enemy('shooter', 96, 372, 30, 30, {}, { ang: toward(96, 372) }),
    // 反撃：分身にぶつかった敵へ、ダメージが返った
    enemy('chaser', 168, 318, 9, 20, {}, { ang: toward(168, 318), flash: 1 }),
    // 自爆：止まって点滅し、爆発する範囲を見せている
    enemy('bomber', 262, 168, 20, 20, {}, { phase: 'windup', timer: 0.25, windupMax: 0.8, blast: 46 }),
    // 自爆が爆発したところ（ほかの敵には当たらない）
  ];
  const lasers = [{ x1: decoy.x + 10, y1: decoy.y + 8, x2: 168, y2: 318, w: 1.6, life: 0.08, max: 0.1, idx: 1 }];   // 反撃の線
  const rings = [
    { x: 168, y: 318, r0: 4, r1: 20, life: 0.12, max: 0.25, kind: 'ghost', idx: 1, width: 2 },
    { x: 60, y: 96, r0: 10, r1: 52, life: 0.2, max: 0.4, kind: 'enemy', idx: 0, width: 5 },     // 自爆の爆発
    { x: 60, y: 96, r0: 6, r1: 30, life: 0.15, max: 0.3, kind: 'white', idx: 0, width: 3 },
  ];
  const flashes = [{ x: 60, y: 96, r: 46, life: 0.08, max: 0.16, kind: 'enemy', idx: 0 }];
  const particles = [];
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2, v = 180;
    particles.push({ x: 60 + Math.cos(a) * 18, y: 96 + Math.sin(a) * 18, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.25, max: 0.4, kind: 'enemy', idx: 0, size: 3, streak: true });
  }
  // 修復：分身から上へ、小さな光の粒がのぼる
  for (let k = 0; k < 5; k++) {
    particles.push({ x: repair.x - 10 + k * 5, y: repair.y - 6 - (k % 2) * 8, vx: 0, vy: -40, life: 0.3, max: 0.5, kind: 'ghost', idx: 4, size: 2.4 });
  }
  const labels = [
    { x: 130, y: 410, text: 'おとり（引きつける範囲）' },
    { x: 200, y: 340, text: '反撃' },
    { x: 296, y: 336, text: '修復' },
    { x: 70, y: 478, text: '不落（1で止まる）' },
    { x: 262, y: 230, text: '自爆（止まって点滅）' },
    { x: 60, y: 150, text: '自爆の爆発' },
  ];
  return { world: { w: W, h: H }, enemies, ghosts: [decoy, repair, last], shots: [], lasers, rings, flashes, particles, labels, boss: null };
}

// 本体の道（第1弾）の場面：闘気・拳闘士の型（突撃・重拳・連打・シールド・鬼神）
function buildBodyRoad() {
  const pr = 9;   // 本体の大きさ（見本用）
  // いちばん大きく見せる本体：闘気の膜＋突撃（右上へ動いてぶつかった瞬間）＋連打の輪
  const player = { x: 170, y: 300, r: pr, magnetR: pr * 3, inv: 0, aura: 26, charge: -Math.PI / 4, rush: 0.6 };
  // 並べて見せる本体：シールド（張っている／破れて戻る途中）・鬼神
  const extraPlayers = [
    { x: 60, y: 440, r: pr, aura: 22, shield: true },
    { x: 150, y: 440, r: pr, aura: 22, shieldCd: 0.4 },
    { x: 290, y: 430, r: pr, aura: 22, demon: 1 },
  ];
  const enemies = [
    // 突撃でぶつかった敵（白く光る）と、重拳の衝撃波に巻き込まれた敵
    enemy('tank', 206, 262, 30, 80, {}, { flash: 1 }),
    enemy('chaser', 246, 286, 9, 20, {}, { flash: 1 }),
    enemy('chaser', 230, 226, 11, 20, {}, { flash: 1 }),
    // 闘気の膜に触れている敵
    enemy('chaser', 140, 322, 14, 20, {}, { ang: -0.6 }),
    // 鬼神に触れて吹き飛ぶ敵
    enemy('chaser', 322, 400, 6, 20, {}, { flash: 1 }),
  ];
  const rings = [
    { x: 206, y: 262, r0: 8, r1: 56, life: 0.2, max: 0.4, kind: 'player', idx: 0, width: 5 },   // 重拳の衝撃波
    { x: 206, y: 262, r0: 4, r1: 30, life: 0.15, max: 0.3, kind: 'white', idx: 0, width: 3 },
    { x: 60, y: 440, r0: 20, r1: 26, life: 0.1, max: 0.3, kind: 'white', idx: 0, width: 2 },
  ];
  const flashes = [{ x: 200, y: 268, r: 26, life: 0.08, max: 0.14, kind: 'white', idx: 0 }];
  const particles = [];
  for (let k = 0; k < 8; k++) {
    const a = -Math.PI / 4 + (k - 3.5) * 0.25, v = 220;
    particles.push({ x: 200 + Math.cos(a) * 8, y: 266 + Math.sin(a) * 8, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.2, max: 0.3, kind: 'player', idx: 0, size: 2.5, streak: true });
  }
  const labels = [
    { x: 170, y: 352, text: '闘気・突撃・連打' },
    { x: 262, y: 220, text: '重拳' },
    { x: 105, y: 476, text: 'シールド（張る／戻る途中）' },
    { x: 290, y: 476, text: '鬼神' },
  ];
  return { world: { w: W, h: H }, showPlayer: true, player, extraPlayers, hp: 100, maxHp: 100, enemies, ghosts: [], shots: [], rings, flashes, particles, labels, boss: null };
}

// 分身の形の見本：取ったスキルで分身の形がどう変わるか（型ごとに1段）
function buildGhostForms() {
  const R = 13;
  const xs = [32, 91, 150, 209, 268, 327];
  const ghosts = [], labels = [];
  const put = (col, y, idx, look, label) => {
    const x = xs[col];
    ghosts.push({ x, y, r: R, idx, len: 300, life: 99, spawnGlow: 0, trail: [], clip: [{ x, y }, { x: x + 0.1, y }], look, aimA: -Math.PI / 4 });
    labels.push({ x, y: y + 27, text: label });
  };
  const L = (type, parts = [], evo = [], entry = false) => ({ type, entry, parts: Object.fromEntries(parts.map((k) => [k, true])), evo: Object.fromEntries(evo.map((k) => [k, true])) });
  // 1段目：何もなし・入口
  put(0, 92, 0, null, 'はじめ');
  put(1, 92, 0, L(null, [], [], true), '一斉射撃');
  put(2, 92, 0, L(null, [], ['volley'], true), '極一斉射撃');
  // 型ごと：目覚め・分岐A・分岐B・両立・奥義・完成（進化と極を含む）
  const rows = [
    { y: 168, idx: 1, type: 'giant', names: ['巨大化', '押しつぶし', '重砲', '威圧', 'ギガント'], parts: ['crush', 'cannon', 'awe', 'gigant'], done: ['crush', 'awe', 'gigant'], evo: ['giant', 'crush', 'awe'], doneName: 'タイタン＋極' },
    { y: 248, idx: 2, type: 'swarm', names: ['群れ', '分裂', '集中砲火', '目印', '千の影'], parts: ['split', 'focus', 'mark', 'thousand'], done: ['focus', 'mark', 'thousand'], evo: ['swarm', 'focus', 'mark'], doneName: 'レギオン＋極' },
    { y: 328, idx: 4, type: 'turret', names: ['固定砲台', 'レーザー', '散弾', '迎撃', '天の光'], parts: ['laser', 'shotgun', 'intercept', 'heaven'], done: ['laser', 'intercept', 'heaven'], evo: ['turret', 'laser', 'intercept'], doneName: '要塞＋極' },
    { y: 408, idx: 6, type: 'decoy', names: ['おとり', '挑発', '反撃', '修復', '不落'], parts: ['taunt', 'counter', 'repair', 'fortress'], done: ['counter', 'repair', 'fortress'], evo: ['decoy', 'counter', 'repair'], doneName: '身代わり＋極' },
  ];
  for (const row of rows) {
    put(0, row.y, row.idx, L(row.type), row.names[0]);
    row.parts.forEach((p, i) => put(i + 1, row.y, row.idx, L(row.type, [p]), row.names[i + 1]));
    put(5, row.y, row.idx, L(row.type, row.done, row.evo, true), row.doneName);
  }
  return { world: { w: W, h: H }, enemies: [], ghosts, shots: [], rings: [], flashes: [], particles: [], labels, boss: null };
}

// ---------- 本体・罠・現象・衛星・収穫の道の形の見本 ----------
//   行ごとに：目覚め・分岐A・分岐B・両立・奥義・完成（進化と極を含む）。入口がある道は1行目に入口
const FORM_X = [32, 91, 150, 209, 268, 327];
const FORM_Y = [92, 170, 248, 326, 404];
const lookOf = (type, parts = [], evo = [], extra = {}) => ({ type, parts: Object.fromEntries(parts.map((k) => [k, true])), evo: Object.fromEntries(evo.map((k) => [k, true])), ...extra });

// rows：[{ entry: [[名前, look], ...] } または { type, names: [目覚め, A, B, 両立, 奥義], parts: [A, B, 両立, 奥義], done: [...], evo: [...], doneName }]
function formGrid(rows, place) {
  const labels = [];
  rows.forEach((row, ri) => {
    const y = FORM_Y[ri];
    const cells = row.entry
      ? row.entry
      : [[row.names[0], lookOf(row.type)], ...row.parts.map((p, i) => [row.names[i + 1], lookOf(row.type, [p])]), [row.doneName, lookOf(row.type, row.done, row.evo)]];
    cells.forEach(([name, look], ci) => { place(FORM_X[ci], y, look, row); labels.push({ x: FORM_X[ci], y: y + 29, text: name }); });
  });
  return labels;
}
const formScene = (extra) => ({ world: { w: W, h: H }, enemies: [], ghosts: [], shots: [], rings: [], flashes: [], particles: [], boss: null, ...extra });

function buildBodyForms() {
  const players = [];
  const rows = [
    { entry: [['はじめ', null], ['闘気', { aura: true }], ['極闘気', { aura: true, auraKw: true }]] },
    { type: 'charge', names: ['突撃', '重拳', '連打', 'シールド', '鬼神'], parts: ['heavyfist', 'rush', 'shield', 'demon'], done: ['heavyfist', 'shield'], evo: ['charge', 'heavyfist'], doneName: '覇王＋極' },
    { type: 'shoot', names: ['射撃', '速射', '狙撃', '追尾弾', '弾幕'], parts: ['rapid', 'snipe', 'homing', 'barrage'], done: ['snipe', 'homing', 'barrage'], evo: ['shoot', 'snipe'], doneName: '狙撃手＋極' },
    { type: 'dash', names: ['疾走', '残像斬り', '突風', '身軽', '瞬身'], parts: ['afterslash', 'gust', 'nimble', 'blink'], done: ['afterslash', 'nimble', 'blink'], evo: ['dash', 'afterslash'], doneName: '風神＋極' },
  ];
  const labels = formGrid(rows, (x, y, look) => {
    const p = { x, y, r: 8, inv: 0, dir: -Math.PI / 4, aim: -Math.PI / 2 };
    if (look && look.aura) { p.aura = 17; p.auraKw = look.auraKw; }
    else if (look) {
      p.look = look;
      if (look.parts.shield) p.shield = true;
      if (look.parts.demon) p.demon = 1;
    }
    players.push(p);
  });
  return formScene({ showPlayer: true, player: { x: -200, y: -200, r: 8, inv: 0 }, extraPlayers: players, hp: 100, maxHp: 100, labels });
}

function buildPhenomForms() {
  const ghosts = [];
  const E = (elem, names, parts, done, evo, doneName) => ({ elem, names, parts, done, evo, doneName });
  const rows = [
    E('thunder', ['雷', '連鎖雷', '落雷', '帯電', '天雷'], ['chainbolt', 'strike', 'charged', 'skybolt'], ['chainbolt', 'charged', 'skybolt'], ['thunder', 'chainbolt'], '雷網＋極'),
    E('freeze', ['氷結', '砕氷', '冷気', '霜の道', '氷河期'], ['shatter', 'chill', 'frostpath', 'iceage'], ['shatter', 'frostpath', 'iceage'], ['freeze', 'shatter'], '絶対零度＋極'),
    E('pull', ['引力', '圧縮', '斥力', '重力弾', '重力崩壊'], ['compress', 'repel', 'gravshot', 'collapse'], ['compress', 'gravshot', 'collapse'], ['pull', 'compress'], '特異点＋極'),
    E('poison', ['毒', '伝染', '腐食', '毒霧', 'パンデミック'], ['contagion', 'corrode', 'miasma', 'pandemic'], ['contagion', 'miasma', 'pandemic'], ['poison', 'contagion'], '猛毒＋極'),
    E('reaper', ['死神', '処刑', '死の宣告', '魂の収穫', '大鎌'], ['execute', 'doom', 'soulreap', 'scythe'], ['execute', 'soulreap', 'scythe'], ['reaper', 'execute'], '冥府＋極'),
  ].map((r) => ({ ...r, type: null }));
  const labels = [];
  rows.forEach((row, ri) => {
    const y = FORM_Y[ri];
    const cells = [[row.names[0], lookOf(null, [], [], { elem: row.elem })], ...row.parts.map((p, i) => [row.names[i + 1], lookOf(null, [p], [], { elem: row.elem })]), [row.doneName, lookOf(null, row.done, row.evo, { elem: row.elem })]];
    cells.forEach(([name, look], ci) => {
      const x = FORM_X[ci];
      ghosts.push({ x, y, r: 12, idx: 2, len: 300, life: 99, spawnGlow: 0, trail: [], clip: [{ x, y }, { x: x + 0.1, y }], look, aimA: -Math.PI / 4 });
      labels.push({ x, y: y + 29, text: name });
    });
  });
  return formScene({ ghosts, labels });
}

function buildOrbitForms() {
  const players = [];
  const rows = [
    { entry: [['浮遊', lookOf(null, [], [], { entry: true })], ['極浮遊', lookOf(null, [], ['float'], { entry: true })]] },
    { type: 'satellite', names: ['衛星', '大衛星', '流星', '軌道変化', '星の雨'], parts: ['bigsat', 'meteor', 'orbitshift', 'starfall'], done: ['meteor', 'orbitshift', 'starfall'], evo: ['satellite', 'meteor'], doneName: '惑星系＋極' },
    { type: 'blade', names: ['刃輪', '投げ刃', '双刃', '研磨', '千刃'], parts: ['throw', 'twinblade', 'whet', 'thousandblade'], done: ['throw', 'whet'], evo: ['blade', 'throw', 'whet'], doneName: '回転鋸＋極' },
    { type: 'drone', names: ['子機', '突撃機', '砲撃機', '回収機', '母艦'], parts: ['ramdrone', 'gundrone', 'collector', 'mothership'], done: ['gundrone', 'collector'], evo: ['drone', 'gundrone'], doneName: '編隊＋極' },
    { type: 'shieldsat', names: ['盾衛星', '反射盾', '衝撃盾', '護衛', '聖域'], parts: ['reflect', 'shockshield', 'escort', 'sanctuary'], done: ['reflect', 'escort', 'sanctuary'], evo: ['shieldsat', 'reflect'], doneName: '城壁＋極' },
  ];
  const labels = formGrid(rows, (x, y, look) => players.push({ x, y, r: 7, inv: 0, olook: look }));
  return formScene({ showPlayer: true, player: { x: -200, y: -200, r: 8, inv: 0 }, extraPlayers: players, hp: 100, maxHp: 100, labels });
}

function buildHarvestForms() {
  const players = [];
  const rows = [
    { entry: [['拾い上手', lookOf(null, [], [], { entry: true })], ['極拾い上手', lookOf(null, [], ['keeper'], { entry: true })]] },
    { type: 'shortcut', names: ['近道', '二重取り', '宝探し', '連鎖回収', '黄金時代'], parts: ['double', 'treasure', 'chainpick', 'goldenage'], done: ['treasure', 'chainpick', 'goldenage'], evo: ['shortcut', 'treasure'], doneName: '豊年＋極' },
    { type: 'alchemy', names: ['錬金', '金の弾', '変換', '貯金', '黄金の雨'], parts: ['goldshot', 'convert', 'savings', 'goldrain'], done: ['goldshot', 'savings'], evo: ['alchemy', 'goldshot', 'savings'], doneName: '賢者の石＋極' },
    { type: 'absorb', names: ['吸収', '過剰回復', '生命力', '吸血', '不老不死'], parts: ['overheal', 'vitality', 'vampire', 'immortal'], done: ['vitality', 'vampire', 'immortal'], evo: ['absorb', 'vitality', 'vampire'], doneName: '生命の泉＋極' },
  ];
  const labels = formGrid(rows, (x, y, look) => players.push({ x, y, r: 7, inv: 0, hlook: look }));
  return formScene({ showPlayer: true, player: { x: -200, y: -200, r: 8, inv: 0 }, extraPlayers: players, hp: 100, maxHp: 100, labels });
}

function buildTrapForms() {
  const trapCells = [];
  const rows = [
    { entry: [['置き土産', lookOf(null, [], [], { entry: true })], ['極置き土産', lookOf(null, [], ['keepsake'], { entry: true })]] },
    { type: 'caltrop', names: ['マキビシ', '返し針', '足止め', 'ばらまき', '剣山'], parts: ['barb', 'snare', 'scatter', 'spikebed'], done: ['barb', 'scatter'], evo: ['caltrop', 'barb'], doneName: '千本針＋極' },
    { type: 'mine', names: ['地雷', '時限爆弾', '吸着地雷', '仕込み', '暴発'], parts: ['timebomb', 'sticky', 'rig', 'misfire'], done: ['timebomb', 'rig', 'misfire'], evo: ['mine', 'timebomb'], doneName: '連鎖爆雷＋極' },
    { type: 'flamepath', names: ['炎の道', '延焼', '火柱', '残り火', '火の海'], parts: ['spread', 'pillar', 'ember', 'firesea'], done: ['spread', 'ember'], evo: ['flamepath', 'spread'], doneName: '業火＋極' },
  ];
  const labels = formGrid(rows, (x, y, look) => trapCells.push({ x, y, w: 50, look }));
  return formScene({ trapCells, labels });
}

// カードの見本
const CARD_SETS = {
  bodycards: {
    title: 'BODY ROAD',
    sub: '本体の道：入口と拳闘士の型',
    cards: [
      { kind: 'skill', sub: '入口', road: '本体', color: 'player', icon: 'sk_aura', rarity: 'normal',
        name: '闘気', lv: 0, gain: 1, max: 5, desc: '本体のまわりの光の膜が、触れた敵にダメージ' },
      { kind: 'skill', sub: '目覚め', road: '本体', color: 'player', icon: 'sk_charge', rarity: 'rare',
        name: '突撃', lv: 0, gain: 2, max: 5, desc: '動いている間、ぶつかると大ダメージ・無傷' },
      { kind: 'skill', sub: '奥義', road: '本体', color: 'player', icon: 'sk_demon', rarity: 'super',
        name: '鬼神', max: 1, desc: 'ときどき4秒間、無敵になり触れた敵を一掃' },
    ],
  },
  bodycards2: {
    title: 'BODY ROAD',
    sub: '本体の道：拳闘士の型（つづき・進化）',
    cards: [
      { kind: 'skill', sub: '分岐', road: '本体', color: 'player', icon: 'sk_heavyfist', rarity: 'normal',
        name: '重拳', lv: 0, gain: 1, max: 5, desc: 'ぶつかった瞬間、その場に衝撃波が出る' },
      { kind: 'skill', sub: '両立', road: '本体', color: 'player', icon: 'sk_shield', rarity: 'rare',
        name: 'シールド', lv: 1, gain: 2, max: 5, desc: '1回だけダメージを防ぐ膜。時間で戻る' },
      { kind: 'skill', sub: '目覚め', road: '本体', color: 'player', icon: 'sk_charge', rarity: 'mythic',
        name: '覇王', evolved: true, from: '突撃', desc: 'ぶつかった敵を吹き飛ばし、まわりも巻き込む' },
    ],
  },
  guardcards: {
    title: 'GHOST ROAD 4',
    sub: '分身の道：守護の型',
    cards: [
      { kind: 'skill', sub: '目覚め', road: '分身', color: 'ghost', icon: 'sk_decoy', rarity: 'normal',
        name: 'おとり', lv: 0, gain: 1, max: 5, desc: '分身がHPを持ち、近くの敵が分身を狙う' },
      { kind: 'skill', sub: '分岐', road: '分身', color: 'ghost', icon: 'sk_counter', rarity: 'rare',
        name: '反撃', lv: 1, gain: 2, max: 5, desc: '分身が受けたダメージを、敵に返す' },
      { kind: 'skill', sub: '奥義', road: '分身', color: 'ghost', icon: 'sk_fortress', rarity: 'super',
        name: '不落', max: 1, desc: '一番大きい分身は、HPが0になっても壊れない' },
    ],
  },
  guardcards2: {
    title: 'GHOST ROAD 4',
    sub: '分身の道：守護の型（つづき・進化）',
    cards: [
      { kind: 'skill', sub: '分岐', road: '分身', color: 'ghost', icon: 'sk_taunt', rarity: 'normal',
        name: '挑発', lv: 0, gain: 1, max: 5, desc: '敵を引きつける範囲 +30%' },
      { kind: 'skill', sub: '両立', road: '分身', color: 'ghost', icon: 'sk_repair', rarity: 'super',
        name: '修復', lv: 1, gain: 3, max: 5, desc: '分身のHPが、毎秒最大HPの5%回復する' },
      { kind: 'skill', sub: '目覚め', road: '分身', color: 'ghost', icon: 'sk_decoy', rarity: 'mythic',
        name: '身代わり', evolved: true, from: 'おとり', desc: '分身が壊れるとき、大きな衝撃波が出る' },
    ],
  },
  turretcards: {
    title: 'GHOST ROAD 3',
    sub: '分身の道：砲台の型',
    cards: [
      { kind: 'skill', sub: '目覚め', road: '分身', color: 'ghost', icon: 'sk_turret', rarity: 'normal',
        name: '固定砲台', lv: 0, gain: 1, max: 5, desc: '分身がその場に留まり、動く速さが攻撃速度になる' },
      { kind: 'skill', sub: '分岐', road: '分身', color: 'ghost', icon: 'sk_laser', rarity: 'rare',
        name: 'レーザー', lv: 1, gain: 2, max: 5, desc: '画面の端まで届く光で、並んだ敵をすべて貫く' },
      { kind: 'skill', sub: '奥義', road: '分身', color: 'ghost', icon: 'sk_heaven', rarity: 'super',
        name: '天の光', max: 1, desc: '敵が一番多い列に、縦に貫く光の柱が落ちる' },
    ],
  },
  turretcards2: {
    title: 'GHOST ROAD 3',
    sub: '分身の道：砲台の型（つづき・進化）',
    cards: [
      { kind: 'skill', sub: '分岐', road: '分身', color: 'ghost', icon: 'sk_shotgun', rarity: 'normal',
        name: '散弾', lv: 0, gain: 1, max: 5, desc: '弾が扇のように広がる。Lvで方向が増える' },
      { kind: 'skill', sub: '両立', road: '分身', color: 'ghost', icon: 'sk_intercept', rarity: 'rare',
        name: '迎撃', lv: 2, gain: 2, max: 5, desc: '分身の近くを通る敵の弾を撃ち落とす' },
      { kind: 'skill', sub: '目覚め', road: '分身', color: 'ghost', icon: 'sk_turret', rarity: 'mythic',
        name: '要塞', evolved: true, from: '固定砲台', desc: '動く速さが、攻撃力にも置きかわる' },
    ],
  },
  swarmcards: {
    title: 'GHOST ROAD 2',
    sub: '分身の道：群体の型',
    cards: [
      { kind: 'skill', sub: '目覚め', road: '分身', color: 'ghost', icon: 'sk_swarm', rarity: 'normal',
        name: '群れ', lv: 0, gain: 1, max: 5, desc: '分身1体ごとに、全分身の攻撃速度 +3%' },
      { kind: 'skill', sub: '分岐', road: '分身', color: 'ghost', icon: 'sk_split', rarity: 'rare',
        name: '分裂', lv: 1, gain: 2, max: 5, desc: '押し出された分身が、小さな2体に分かれる' },
      { kind: 'skill', sub: '奥義', road: '分身', color: 'ghost', icon: 'sk_thousand', rarity: 'super',
        name: '千の影', max: 1, desc: '1回描くと、同じ軌跡を3体が往復する' },
    ],
  },
  swarmcards2: {
    title: 'GHOST ROAD 2',
    sub: '分身の道：群体の型（つづき・進化）',
    cards: [
      { kind: 'skill', sub: '分岐', road: '分身', color: 'ghost', icon: 'sk_focus', rarity: 'normal',
        name: '集中砲火', lv: 0, gain: 1, max: 5, desc: '同じ敵に当てるほど、その敵へのダメージ↑' },
      { kind: 'skill', sub: '両立', road: '分身', color: 'ghost', icon: 'sk_mark', rarity: 'super',
        name: '目印', lv: 1, gain: 3, max: 5, desc: '当てた敵に印。印の敵は受けるダメージ +10%' },
      { kind: 'skill', sub: '目覚め', road: '分身', color: 'ghost', icon: 'sk_swarm', rarity: 'mythic',
        name: 'レギオン', evolved: true, from: '群れ', desc: '分身1体ごとに、全分身の攻撃力も +5%' },
    ],
  },
  ghostroad: {
    title: 'GHOST ROAD',
    sub: '分身の道：入口・目覚め・分岐',
    cards: [
      { kind: 'skill', sub: '入口', road: '分身', color: 'ghost', icon: 'sk_volley', rarity: 'normal',
        name: '一斉射撃', lv: 0, gain: 1, max: 5, desc: '描き終えた瞬間、全分身が一斉に撃つ' },
      { kind: 'skill', sub: '目覚め', road: '分身', color: 'ghost', icon: 'sk_giant', rarity: 'rare',
        name: '巨大化', lv: 1, gain: 2, max: 5, desc: '一番大きい分身の攻撃力が上がる' },
      { kind: 'skill', sub: '分岐', road: '分身', color: 'ghost', icon: 'sk_cannon', rarity: 'super',
        name: '重砲', lv: 0, gain: 3, max: 5, desc: '一番大きい分身の弾が当たると爆発する' },
    ],
  },
  rarity: {
    title: 'RARITY',
    sub: 'ノーマル・レア・スーパーレア',
    cards: [
      { kind: 'boost', road: '共通', color: 'boost', icon: 'atk', rarity: 'normal',
        name: '攻撃力＋', lv: 1, gain: 1, max: 5, desc: '攻撃力 +20%' },
      { kind: 'skill', sub: '分岐', road: '分身', color: 'ghost', icon: 'sk_shotgun', rarity: 'rare',
        name: '散弾', lv: 1, gain: 2, max: 5, desc: '弾が扇のように広がる。Lvで方向が増える' },
      { kind: 'skill', sub: '奥義', road: '分身', color: 'ghost', icon: 'sk_heaven', rarity: 'super',
        name: '天の光', max: 1, desc: '画面を縦に貫く光線を放つ' },
    ],
  },
  mythic: {
    title: 'MYTHIC',
    sub: 'ミシックと、進化のカード',
    cards: [
      { kind: 'boost', road: '共通', color: 'boost', icon: 'rate', rarity: 'mythic',
        name: '攻撃速度＋', lv: 0, gain: 5, max: 5, maxOut: true,
        desc: '攻撃の回数 +15%', bonus: '連撃ブースト：当て続けるほど攻撃が速くなる' },
      { kind: 'skill', sub: '目覚め', road: '分身', color: 'ghost', icon: 'sk_giant', rarity: 'mythic',
        name: 'タイタン', evolved: true, from: '巨大化', desc: '分身が1体だけのとき、攻撃力2倍・貫通' },
      { kind: 'skill', sub: '分岐', road: '本体', color: 'player', icon: 'sk_rapid', rarity: 'normal',
        name: '速射', kiwami: true, evolved: true, from: '速射', desc: '本体の弾がさらに速く、途切れずに出る' },
    ],
  },
  curse: {
    title: 'CURSE',
    sub: 'カース：取ったら外せない',
    cards: [
      { kind: 'curse', color: 'curse', icon: 'brush', name: '呪われた筆',
        bind: '最大軌跡以外で分身ができない', reward: '分身の攻撃力2倍' },
      { kind: 'curse', color: 'curse', icon: 'lonely', name: '孤独な王',
        bind: '分身が1体のみになる', reward: '軌跡を全部1体に使え、攻撃力 +50%' },
      { kind: 'curse', color: 'curse', icon: 'chain', name: '重い鎖',
        bind: '本体の動きが半分の速さ', reward: '最大HP2倍。本体が大きくなる' },
    ],
  },
};

// 取得した才能の一覧の見本（レベルごとに背景の色が変わる）
const OWNED = [
  { kind: 'boost', road: '共通', color: 'boost', icon: 'atk', name: '攻撃力＋', lv: 1, max: 5, desc: '攻撃力 +20%' },
  { kind: 'boost', road: '共通', color: 'boost', icon: 'rate', name: '攻撃速度＋', lv: 2, max: 5, desc: '攻撃の回数 +15%' },
  { kind: 'boost', road: '共通', color: 'boost', icon: 'budget', name: '軌跡の総量＋', lv: 3, max: 5, desc: '置いておける軌跡 +15%' },
  { kind: 'skill', sub: '分岐', road: '分身', color: 'ghost', icon: 'sk_shotgun', name: '散弾', lv: 4, max: 5, desc: '弾が扇のように広がる。Lvで方向が増える' },
  { kind: 'boost', road: '共通', color: 'boost', icon: 'hp', name: 'HP＋', lv: 5, max: 5, desc: '最大HP +20%', bonus: '不死身：一度だけ、倒れずに踏みとどまる' },
  { kind: 'skill', sub: '目覚め', road: '分身', color: 'ghost', icon: 'sk_giant', name: 'タイタン', evolved: true, from: '巨大化', max: 5, desc: '分身が1体だけのとき、攻撃力2倍・貫通' },
  { kind: 'skill', sub: '分岐', road: '本体', color: 'player', icon: 'sk_rapid', name: '速射', kiwami: true, evolved: true, from: '速射', max: 5, desc: '本体の弾がさらに速く、途切れずに出る' },
  { kind: 'skill', sub: '奥義', road: '分身', color: 'ghost', icon: 'sk_heaven', name: '天の光', max: 1, desc: '画面を縦に貫く光線を放つ' },
  { kind: 'skill', sub: '目覚め', road: '本体', color: 'player', icon: 'sk_shoot', name: '射撃', lv: 1, max: 5, desc: '一番近い敵を撃つ' },
  { kind: 'curse', color: 'curse', icon: 'brush', name: '呪われた筆', bind: '最大軌跡以外で分身ができない', reward: '分身の攻撃力2倍' },
];

// 見本の分類（上の段）と、その中の項目（下の段）
// 奥義の発動演出の見本：本物のゲームを動かし、決まった間隔で奥義を発動させる
//   cd：発動までの時間を持つ変数（s.〜 か p.〜）
const OUGI_FX = [
  { id: 'heaven', cd: 's.heavenT' }, { id: 'demon', cd: 'p.demonCd' }, { id: 'spikebed', cd: 's.spikebedCd' },
  { id: 'skybolt', cd: 's.skyCd' }, { id: 'iceage', cd: 's.iceCd' }, { id: 'collapse', cd: 's.collapseCd' },
  { id: 'pandemic', cd: 's.pandemicCd' }, { id: 'scythe', cd: 's.scytheCd' }, { id: 'starfall', cd: 's.starCd' },
  { id: 'thousandblade', cd: 's.tbladeCd' }, { id: 'mothership', cd: 's.motherCd' }, { id: 'goldrain', cd: 's.goldrainCd' },
].map((o) => {
  const road = SKILL_ROADS.find((r) => r.skills.some((k) => k.id === o.id));
  const list = road.skills, at = list.findIndex((k) => k.id === o.id);
  let w = at; while (w > 0 && list[w].kind !== '目覚め') w--;   // その奥義の系統の目覚め
  const skills = {};
  if (list[0].kind === '入口') skills[list[0].id] = { lv: 3 };
  for (let k = w; k <= at; k++) skills[list[k].id] = { lv: 3 };
  return { ...o, name: list[at].name, skills };
});
const OUGI_EVERY = 3.5;   // 見本では、この秒数ごとに発動させる

const CATS = [
  { id: 'card', label: 'カード', tabs: [['rarity', 'レア度'], ['mythic', 'ミシック'], ['curse', 'カース'], ['ghostcards', '巨像'], ['swarmcards', '群体1'], ['swarmcards2', '群体2'], ['turretcards', '砲台1'], ['turretcards2', '砲台2'], ['guardcards', '守護1'], ['guardcards2', '守護2'], ['bodycards', '本体1'], ['bodycards2', '本体2']] },
  { id: 'screens', label: '画面づくり', tabs: SCREEN_TABS },
  { id: 'sound', label: '音', tabs: SOUND_TABS },
  { id: 'ui', label: '画面', tabs: [['owned', '取得一覧'], ['icons', 'アイコン']] },
  { id: 'enemy', label: '敵', tabs: [['enemies', '種類'], ['battle', '状態']] },
  { id: 'boss', label: 'ボス', tabs: [['bcore', 'コア'], ['bhunter', 'ハンター'], ['btwin', '双子'], ['bclock', '時計'], ['bclockstop', '時間停止'], ['bshade', '影'], ['bcomet', '彗星'], ['bmirage', '蜃気楼'], ['beclipse', '日蝕'], ['babyss', '深淵'], ['bshuhitsu', '終筆'], ['belite', '中ボス']] },
  { id: 'body', label: '本体', tabs: [['bodyforms', '本体の形'], ['orbitforms', '衛星'], ['harvestforms', '収穫']] },
  { id: 'ghost', label: '分身', tabs: [['ghostforms', '分身の形'], ['phenomforms', '現象'], ['trapforms', '罠']] },
  { id: 'attack', label: '攻撃エフェクト', tabs: [['ghostroad', '巨像'], ['swarmroad', '群体'], ['turretroad', '砲台'], ['guardroad', '守護'], ['bodyroad', '拳闘士']] },
  { id: 'fx', label: 'エフェクト', tabs: [['effects', '共通']] },
  { id: 'items', label: 'ガチャの品', tabs: ITEM_TABS },
  { id: 'show', label: '演出', tabs: [['fx_g1', 'ガチャ1回'], ['fx_gup', '昇格'], ['fx_gssr', 'SSR'], ['fx_g10', 'ガチャ10回'], ['fx_bossin', 'ボス登場'], ['fx_finalin', 'ラスボス登場'], ['fx_bossdown', 'ボス撃破']] },
  { id: 'ougi', label: '奥義', tabs: OUGI_FX.map((o) => ['og_' + o.id, o.name]) },
  { id: 'mode', label: '描く／動く', tabs: [['md_move', '動くモード'], ['md_draw', '描くモード']] },
  { id: 'tuto', label: 'チュートリアル', tabs: [['tu_0', 'はじめに']].concat(TUTO_STEPS.map((_, i) => ['tu_' + (i + 1), `手順${i + 1}`]), [['tu_ok', 'できた']]) },
];
const TAB_LABEL = Object.fromEntries(CATS.flatMap((c) => c.tabs.map(([id, label]) => [id, `${c.label}／${label}`])));

export function createPreview(hud) {
  const bar = document.getElementById('preview-bar');
  const catsEl = document.getElementById('preview-cats');
  const tabsEl = document.getElementById('preview-tabs');
  const scene = buildStates();
  const bossFxScene = buildBossCore();
  const SCENES = { fx_bossin: bossFxScene, fx_finalin: buildBossShuhitsu(), fx_bossdown: bossFxScene, enemies: buildEnemyTypes(), boss: buildBoss(), effects: buildEffects(), bcore: buildBossCore(), bhunter: buildBossHunter(), btwin: buildBossTwins(), bclock: buildBossClock(), bclockstop: buildBossClockStop(), bshade: buildBossShade(), bcomet: buildBossComet(), bmirage: buildBossMirage(), beclipse: buildBossEclipse(), babyss: buildBossAbyss(), bshuhitsu: buildBossShuhitsu(), belite: buildElites() };
  const ghostScene = buildGhostRoad();
  const swarmScene = buildSwarmRoad();
  const turretScene = buildTurretRoad();
  const guardScene = buildGuardRoad();
  const bodyScene = buildBodyRoad();
  const ghostFormScene = buildGhostForms();
  const FORM_SCENES = { bodyforms: buildBodyForms(), trapforms: buildTrapForms(), phenomforms: buildPhenomForms(), orbitforms: buildOrbitForms(), harvestforms: buildHarvestForms() };
  const screens = createScreens();   // 画面づくりの見本（形だけ）
  const gfx = createGachaFx(document.getElementById('stage'));   // ガチャの演出の見本
  const pool = (r) => GACHA_POOL.filter((x) => x.rarity === r);
  const GACHA_SAMPLES = {
    fx_g1: () => [{ it: pool('R')[1], isNew: true }],
    fx_gup: () => [{ it: pool('SR')[0], isNew: true }],
    fx_gssr: () => [{ it: pool('SSR')[0], isNew: true }],
    fx_g10: () => [pool('N')[0], pool('R')[0], pool('N')[2], pool('SR')[1], pool('N')[1], pool('R')[2], pool('N')[3], pool('SSR')[1], pool('R')[1], pool('N')[4]].map((it, i) => ({ it, isNew: i % 3 !== 1 })),
  };
  // 奥義の見本で動かす本物のゲーム
  let og = null;
  function startOugi(id) {
    const o = OUGI_FX.find((x) => 'og_' + x.id === id);
    const g = createGame(), s = g.state;
    const inp = (held, x = 180, y = 330) => ({ held, pointer: held ? { x, y } : null, isTouch: false, dx: 0, dy: 0, keyX: 0, keyY: 0 });
    g.step(inp(true));
    s.phase = 7; g.debugClearPhase();
    s.skills = JSON.parse(JSON.stringify(o.skills));
    s.choices = [{ id: 'atk', kind: 'boost', rarity: 'normal' }]; g.chooseSkill(0);
    og = { o, g, inp, t: 0, next: 1e9 };
    for (let k = 0; k < 60 * 6; k++) stepOugi();   // 先に6秒進めて、敵と分身をそろえておく
    og.next = og.t + 0.5;
  }
  function stepOugi() {
    const { g, o, inp } = og, s = g.state;
    if (s.mode === 'select' || s.mode === 'returning') { s.choices = [{ id: 'atk', kind: 'boost', rarity: 'normal' }]; g.chooseSkill(0); }
    og.t += 1 / 60;
    if (og.t >= og.next) { og.next = og.t + OUGI_EVERY; const [who, key] = o.cd.split('.'); (who === 'p' ? s.player : s)[key] = 0.001; }
    s.player.inv = 99; s.hp = s.maxHp;
    // 指は本体の少し先を回る（押し始めは本体の上から。離すと分身が生まれる）
    const c = og.t % 1.6, held = c < 1.4, a = og.t * 2.5, r = c < 0.07 ? 0 : 70, p = s.player;
    g.step(inp(held, Math.min(330, Math.max(30, p.x + Math.cos(a) * r)), Math.min(470, Math.max(60, p.y + Math.sin(a) * r))));
    s.sfx.length = 0;
    s.banner.t = 0;   // 「PHASE ○」の文字は出さない
    return s;
  }
  // 描く／動くモードの見た目の見本（仕組みはまだ入れていない。今のゲームを動かし、見た目だけ切り替える）
  let md = null;
  function stepMode(drawing) {
    if (!md) {
      const g = createGame(), s = g.state;
      const inp = (held, x = 180, y = 330) => ({ held, pointer: held ? { x, y } : null, isTouch: false, dx: 0, dy: 0, keyX: 0, keyY: 0 });
      g.step(inp(true)); s.phase = 3; g.debugClearPhase();
      s.choices = [{ id: 'atk', kind: 'boost', rarity: 'normal' }]; g.chooseSkill(0);
      md = { g, inp, t: 0 };
    }
    const { g, inp } = md, s = g.state;
    if (s.mode === 'select' || s.mode === 'returning') { s.choices = [{ id: 'atk', kind: 'boost', rarity: 'normal' }]; g.chooseSkill(0); }
    md.t += 1 / 60;
    s.player.inv = 0; s.hp = s.maxHp; s.hurtFlash = 0;   // 倒れないように（点滅もさせない）
    // 指をゆっくり8の字に動かす（どの操作方法でも動くよう、位置と動いた分の両方を渡す）。2.4秒描いて離し、分身を作る
    const c = md.t % 2.6, held = c < 2.4, a = md.t * 1.4, p = s.player;
    const vx = Math.cos(a) * 150, vy = Math.sin(a * 2) * 110;
    const pt = { x: Math.min(330, Math.max(30, p.x + vx * 0.25)), y: Math.min(470, Math.max(60, p.y + vy * 0.25)) };
    g.step({ held, pointer: held ? pt : null, isTouch: false, dx: held ? vx / 60 : 0, dy: held ? vy / 60 : 0, keyX: 0, keyY: 0 });
    s.sfx.length = 0; s.banner.t = 0;
    // 見た目だけを切り替える：動くモードでは描いている線を出さない
    s.player.drawMode = drawing;
    s.drawEdge = drawing ? 1 : 0;
    return drawing ? s : { ...s, record: { ...s.record, path: [] } };
  }
  let active = false;
  let cat = 'enemy';
  let tab = 'enemies';

  catsEl.innerHTML = CATS.map((c) => `<button class="btn" data-cat="${c.id}">${c.label}</button>`).join('');
  catsEl.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => selectCat(b.dataset.cat)));
  document.getElementById('close-preview').addEventListener('click', () => close());

  // 分類を選ぶ：下の段をその分類の項目に入れかえ、最初の項目を開く
  function selectCat(id, keepTab) {
    cat = id;
    const c = CATS.find((x) => x.id === id);
    catsEl.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.cat === id));
    tabsEl.innerHTML = c.tabs.map(([tid, label]) => `<button class="btn" data-tab="${tid}">${label}</button>`).join('');
    tabsEl.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => select(b.dataset.tab)));
    select(keepTab && c.tabs.some(([tid]) => tid === keepTab) ? keepTab : c.tabs[0][0]);
  }

  function select(id) {
    tab = id;
    tabsEl.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.tab === id));
    hud.hideOwned();
    marks.closeNote();
    // カード選び（引き直し）：本物のカード選びの画面に、引き直すボタンを出して見せる
    if (id === 's_reroll') { screens.hide(); const set = CARD_SETS.rarity; hud.showSample(set.title, set.sub, set.cards); document.getElementById('skill').classList.add('with-reroll'); marks.attachDom(id); return; }
    document.getElementById('skill').classList.remove('with-reroll');
    if (id.startsWith('s_')) { gfx.stop(); hud.hideSample(); screens.show(id); marks.attachDom(id); return; }
    screens.hide();
    // ガチャの演出：昇格は必ず見せる。10回引きは SR だけ昇格して見せる
    if (GACHA_SAMPLES[id]) { hud.hideSample(); gfx.play(GACHA_SAMPLES[id](), { replay: true, forceUp: id === 'fx_gup' ? true : id === 'fx_g10' ? [3] : [] }); return; }
    gfx.stop();
    if (!id.startsWith('tu_')) hud.hideTutorial();
    if (id === 'battle' || SCENES[id] || id.startsWith('og_') || id.startsWith('md_') || id.startsWith('tu_')) hud.hideSample();
    else if (id === 'ghostroad' || id === 'swarmroad' || id === 'turretroad' || id === 'guardroad' || id === 'bodyroad' || id === 'ghostforms' || FORM_SCENES[id]) hud.hideSample();
    else if (id === 'ghostcards') hud.showSample(CARD_SETS.ghostroad.title, CARD_SETS.ghostroad.sub, CARD_SETS.ghostroad.cards);
    else if (id === 'owned') { hud.hideSample(); hud.showOwnedSample(OWNED); }
    else if (id === 'icons') { hud.hideSample(); hud.showIconSample(BOOSTS, CURSES, SKILL_ROADS); }
    else {
      const set = CARD_SETS[id];
      hud.showSample(set.title, set.sub, set.cards);
    }
    marks.attachDom(id);
  }

  function open() {
    active = true;
    bar.classList.add('show');
    bar.setAttribute('aria-hidden', 'false');
    selectCat(cat, tab);
  }

  function close() {
    active = false;
    hud.hideTutorial();
    bar.classList.remove('show');
    bar.setAttribute('aria-hidden', 'true');
    hud.hideSample();
    document.getElementById('skill').classList.remove('with-reroll');
    hud.hideOwned();
    marks.closeNote();
    screens.hide();
    gfx.stop();
  }

  // 描画と画面表示に渡す状態（もとの状態の上に、見本の中身をかぶせる）
  function view(base) {
    if (tab.startsWith('tu_')) {
      const ok = tab === 'tu_ok', n = ok ? 3 : +tab.slice(3), S = n ? TUTO_STEPS[n - 1] : TUTO_INTRO;
      hud.showTutorial({ step: n, total: TUTO_STEPS.length, text: ok ? 'できた！' : S.text, sub: ok ? S.done : S.sub, ok, intro: n === 0 });
      return { ...stepMode(n !== 4 && n !== 5), labels: [], mode: 'play', over: false };
    }
    if (tab === 'md_move' || tab === 'md_draw') return { ...stepMode(tab === 'md_draw'), labels: [], mode: 'play', over: false };
    if (tab.startsWith('og_')) {
      if (!og || 'og_' + og.o.id !== tab) startOugi(tab);
      const s = stepOugi();
      return { ...s, labels: [], mode: 'play', over: false };
    }
    const sc = LIVE_BG.has(tab) ? swarmScene : SCENES[tab] ? SCENES[tab] : FORM_SCENES[tab] ? FORM_SCENES[tab] : tab === 'ghostroad' || tab === 'ghostcards' ? ghostScene : tab.startsWith('swarm') ? swarmScene : tab.startsWith('turret') ? turretScene : tab.startsWith('guard') ? guardScene : tab.startsWith('body') ? bodyScene : tab === 'ghostforms' ? ghostFormScene : FORM_SCENES[tab] || scene;
    // ボスの登場・撃破の見本：時間でくり返す
    const fx = {};
    const now = performance.now() / 1000;
    if (tab === 'fx_bossin') { const k = (now % 2.6) / 1.5; if (k < 1) fx.bossIntro = { t: k, name: 'コア' }; fx.enemies = (sc.enemies || []).filter((e) => !e.boss || k > 0.6); }
    if (tab === 'fx_finalin') { const k = (now % 4) / 2.8; if (k < 1) fx.bossIntro = { t: k, name: '終筆', kind: 'shuhitsu' }; fx.enemies = (sc.enemies || []).filter((e) => !e.boss || k > 0.7); }
    if (tab === 'fx_bossdown') {
      const k = now % 2.4, core = (sc.enemies || []).find((e) => e.boss);
      fx.enemies = (sc.enemies || []).filter((e) => !e.boss || k < 0.7);
      if (k >= 0.7 && k < 1.7) fx.bossDown = { t: (k - 0.7) / 1, x: core.x, y: core.y };
      fx.boss = k < 0.7 ? { ...sc.boss, hp: sc.boss.maxHp * 0.04 } : null;
    }
    return {
      ...base,
      ...sc,
      ...fx,
      mode: 'play',
      over: !sc.showPlayer,     // 本体は描かない（本体の道の見本だけ描く）
      shots: sc.shots || [], enemyShots: sc.enemyShots || [], pickups: sc.pickups || [], lasers: sc.lasers || [], pillars: sc.pillars || [], particles: sc.particles || [], rings: sc.rings || [], flashes: sc.flashes || [],
      shake: 0, hurtFlash: 0,
      record: { ...base.record, active: false, path: [], length: 0 },
      used: 300, evict: 0,
      labels: tab.startsWith('s_') ? [] : (sc.labels || []).map((l) => (marks.has(tab, l.text) ? { ...l, marked: true } : l)),
    };
  }

  // ---------- 印（直してほしいものに印を付けて提出する） ----------
  //   印モードの間だけ、絵（名前の近く）・カード・アイコンをタップすると印が付く。印には一言を書ける
  //   今は見た目だけ：提出しても、まだどこにも送らない
  const marks = createMarks(() => tab, () => {
    const sc = SCENES[tab] || FORM_SCENES[tab] || (tab === 'ghostroad' || tab === 'ghostcards' ? ghostScene : tab.startsWith('swarm') ? swarmScene : tab.startsWith('turret') ? turretScene : tab.startsWith('guard') ? guardScene : tab.startsWith('body') ? bodyScene : tab === 'ghostforms' ? ghostFormScene : scene);
    return sc.labels || [];
  });

  // 画面（ゲームの絵）をタップした：一番近い名前に印（印モードのときだけ）
  function tapWorld(p) {
    if (!active || !marks.on) return;
    let best = null, bd = 46;
    for (const l of marks.labels()) {
      const d = Math.hypot(l.x - p.x, (l.y - 18) - p.y);   // 名前は絵の下にあるので、少し上を中心にする
      if (d < bd) { bd = d; best = l; }
    }
    if (best) marks.toggle(best.text);
  }

  return { open, close, view, tapWorld, get active() { return active; } };
}

// 印の管理と、印モード・一言の欄・提出ボタンの画面
function createMarks(getTab, getLabels) {
  const list = new Map();   // key → { tab, where, name, note }
  const key = (tab, name) => `${tab}::${name}`;
  // 印はこの端末のブラウザにも残す（見本を開き直しても消えない）。保存できなくても動く
  const STORE = 'afterimage-marks';
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify([...list.values()])); } catch (_) { /* 残せなくても続行 */ } };
  try { for (const m of JSON.parse(localStorage.getItem(STORE) || '[]')) list.set(key(m.tab, m.name), m); } catch (_) { /* 読めなければ空から */ }
  // 提出先（公開ページのデータ置き場。Claude が読む）。使えないときは null
  let dbPromise = null;
  const getDb = () => {
    if (!dbPromise) dbPromise = (window.claude && window.claude.use ? window.claude.use('db') : Promise.resolve(null)).catch(() => null);
    return dbPromise;
  };
  const $ = (id) => document.getElementById(id);
  const modeBtn = $('mark-mode'), countEl = $('mark-count'), submitBtn = $('mark-submit');
  const note = $('mark-note'), noteName = $('mark-note-name'), noteText = $('mark-note-text');
  const toast = $('mark-toast');
  let on = false;
  let editing = null;

  function refresh() {
    save();
    countEl.textContent = `${list.size}`;
    submitBtn.disabled = list.size === 0;
    modeBtn.classList.toggle('active', on);
    document.body.classList.toggle('marking', on);
    paintDom();
  }

  // カード・アイコン・取得一覧の印（赤い点線の枠）
  function paintDom() {
    const tab = getTab();
    document.querySelectorAll('[data-mark-name]').forEach((el) => el.classList.toggle('marked', list.has(key(tab, el.dataset.markName))));
  }

  function openNote(name) {
    editing = name;
    const m = list.get(key(getTab(), name));
    noteName.textContent = `${TAB_LABEL[getTab()] || ''}／${name}`;
    noteText.value = m ? m.note : '';
    note.classList.add('show');
    note.setAttribute('aria-hidden', 'false');
    setTimeout(() => noteText.focus(), 50);
  }
  function closeNote() {
    editing = null;
    note.classList.remove('show');
    note.setAttribute('aria-hidden', 'true');
  }

  // 印を付ける（付いていれば、一言を書き直す欄を開く）
  function toggle(name) {
    const tab = getTab();
    if (!list.has(key(tab, name))) list.set(key(tab, name), { tab, where: TAB_LABEL[tab] || tab, name, note: '' });
    refresh();
    openNote(name);
  }

  // カード・アイコンなど、画面の部品に印を付けられるようにする（見本を出したあとに呼ぶ）
  function attachDom(tab) {
    setTimeout(() => {
      const cards = document.querySelectorAll('#skill-cards .card');
      cards.forEach((c) => { const n = c.querySelector('.card-name'); c.dataset.markName = n ? [...n.childNodes].filter((x) => x.nodeType === 3 || (x.classList && x.classList.contains('kiwami'))).map((x) => x.textContent).join('').trim() : ''; });   // 名前（Lv などは除く）
      document.querySelectorAll('#owned-body .icon-cell').forEach((c) => { c.dataset.markName = c.querySelector('.icon-name').textContent; });
      document.querySelectorAll('#owned-body .owned-tile[data-i]').forEach((c) => { c.dataset.markName = `${Number(c.dataset.i) + 1}番目`; });
      paintDom();
    }, 30);
  }
  // 印モードの間は、部品のタップを横取りして印を付ける
  document.addEventListener('click', (e) => {
    if (!on) return;
    const el = e.target.closest('[data-mark-name]');
    if (!el || !el.dataset.markName) return;
    e.preventDefault();
    e.stopPropagation();
    toggle(el.dataset.markName);
  }, true);

  modeBtn.addEventListener('click', () => { on = !on; if (!on) closeNote(); refresh(); });
  $('mark-ok').addEventListener('click', () => {
    const m = editing && list.get(key(getTab(), editing));
    if (m) m.note = noteText.value.trim();
    closeNote(); refresh();
  });
  $('mark-remove').addEventListener('click', () => {
    if (editing) list.delete(key(getTab(), editing));
    closeNote(); refresh();
  });
  const say = (text) => {
    toast.textContent = text;
    toast.classList.add('show');
    clearTimeout(say.timer);
    say.timer = setTimeout(() => toast.classList.remove('show'), 2600);
  };
  // 提出：印を1件ずつ、データ置き場の marks に書く（書けた分は印を外す）
  let sending = false;
  submitBtn.addEventListener('click', async () => {
    if (!list.size || sending) return;
    sending = true;
    submitBtn.disabled = true;
    say('提出しています…');
    const db = await Promise.race([getDb(), new Promise((r) => setTimeout(() => r(null), 10000))]);
    if (!db) { sending = false; refresh(); say('提出できませんでした（データ置き場につながりません）'); return; }
    const stamp = Date.now();
    let sent = 0;
    try {
      for (const [k, m] of [...list.entries()]) {
        await db.collection('marks').doc(`${stamp}-${sent}`).set({ where: m.where, tab: m.tab, name: m.name, note: m.note || '', at: stamp, status: 'open' });
        list.delete(k);
        sent++;
      }
      say(`${sent}件を提出しました`);
    } catch (err) {
      say(sent ? `${sent}件だけ提出できました（残りは印のまま）` : '提出できませんでした（もう一度押してください）');
    }
    sending = false;
    refresh();
  });
  refresh();

  return {
    get on() { return on; },
    has: (tab, name) => list.has(key(tab, name)),
    labels: getLabels,
    toggle, attachDom, closeNote,
  };
}
