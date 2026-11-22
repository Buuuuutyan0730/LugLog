// ゲームの計算・動き担当。画面（canvas や HTML）には一切触れない。
// 計算は 1秒に60回の一定の刻みで進める（分身の再現がズレないようにするため）

import { CONFIG } from './config.js?v=20261122133935';
import { spawnPop, stepParticle } from './pops.js?v=20261122133935';
import { BOOST_BY_ID, stacksOf, completionsOf, rollChoices, takeChoice } from './talents.js?v=20261122133935';

export const DT = 1 / 60;
const T = CONFIG.tuning;
const X = CONFIG.experiments;
const P = CONFIG.player;
const G = CONFIG.ghost;
const PH = CONFIG.phase;
const SH = CONFIG.shard;
const ET = CONFIG.enemies;
const EB = CONFIG.enemyBullet;
const TIERS = CONFIG.enemyTiers;
const BN = CONFIG.bonus;
const CU = CONFIG.curse;
const SK = CONFIG.skill;

const rand = (a, b) => a + Math.random() * (b - a);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// 大きさ＝強さ：面積がパワーに比例するように半径を決める
export function radiusOf(power) {
  return Math.max(CONFIG.power.minRadius, CONFIG.power.sizeK * Math.sqrt(Math.max(0, power)));
}

// 軌跡を「長さ1ごとの点の並び」に直す。
// こうしておけば、描いたときの速さや軌跡の長さに関係なく、分身を一定の速さで動かせる
function resample(path, spacing = 1) {
  const out = [{ x: path[0].x, y: path[0].y }];
  let carry = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (seg === 0) continue;
    let d = spacing - carry;
    while (d <= seg) {
      const t = d / seg;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      d += spacing;
    }
    carry = seg - (d - spacing);
  }
  const last = path[path.length - 1];
  out.push({ x: last.x, y: last.y });
  return out;
}

export function createGame() {
  const s = {};

  function reset() {
    const W = CONFIG.view.width, H = CONFIG.view.height;
    Object.assign(s, {
      mode: 'ready',
      sfx: [],          // 鳴らす音の順番待ち（main.js が毎フレーム取り出して鳴らす）         // 'ready'（操作待ち）| 'play' | 'select'（スキル選択中）
      over: false,
      firstPick: false,      // 遊び始めの1枚を選んでいる最中
      time: 0,
      score: 0,
      kills: 0,
      dmgSrc: null,          // 今ダメージを与えている攻撃（結果画面の「いちばん倒した攻撃」用）
      killBy: {},            // 攻撃ごとの倒した数
      killsByKind: {},       // 敵の種類ごとの倒した数（図鑑用）
      bossKills: [],         // 倒したボス
      rerolls: 0,
      shardsGot: 0,            // このプレイで引き直した回数（値段が上がる）
      volleyCd: 0,           // 一斉射撃の残りの待ち時間
      volleyWait: 0,
      seenKinds: [],         // 見た敵・ボスの種類（図鑑用）

      phase: 1,
      shards: 0,
      need: needOf(1),
      bossPhase: null,       // ボスのフェーズならボスの種類
      boss: null,            // 出ているボス（画面の上のHPバー）
      bossAppear: 0, bossDownT: 0,
      bossIntro: null,      // ボス登場の演出 { t: 0〜1, name }
      bossDown: null,       // ボス撃破の演出 { t: 0〜1, x, y }
      slowT: 0,             // ゆっくりにする残り秒数（main.js が実時間で減らす）
      choices: [],
      owned: {},             // 取った才能 { id: { lv, cycles } }
      curses: [],            // 取ったカース
      skills: {},            // 取ったスキル { id: { lv, evo } }
      big: null,             // 一番大きい分身（巨像の型のスキルが効く相手）
      st: null,              // 才能から計算した今の強さ（stats()）
      combo: { stacks: 0, t: 0 },   // 連撃ブースト
      undyingUsed: 0,        // 不死身を使った回数
      blackHoleT: 0,         // ブラックホールまでの時間
      fading: [],            // ラストスタンドで戦い続けている、押し出された分身
      splits: [],            // 分裂で生まれた小さな分身（軌跡の総量は使わず、時間で消える）
      lasers: [],            // レーザーの光（描画用）
      pillars: [],           // 天の光の柱
      traps: [],             // 罠の道の罠（光の罠・マキビシ・地雷）
      fires: [], embers: [], firePillars: [],   // 炎の道（燃える軌跡・火の海／火の粉／火柱）
      frost: false,          // 氷の型：霜の道があるか
      wells: [], collapseT: 0,   // 重力の型（重力弾の小さな引力／重力崩壊の残り秒数）
      fogs: [],              // 毒の型：毒霧
      scythe: null,          // 死神の型：画面を横切る大鎌
      stars: [],             // 衛星の道：星の雨
      drones: [],            // 衛星の道：子機
      goldDrops: [], bank: 0, convertN: 0, convertT: 0,   // 錬金の型（黄金の雨／貯金／変換）
      hpBonus: 0, lifeShield: 0, immortalUsed: false,     // 吸収の型（過剰回復で増えた最大HPの割合／生命の泉のシールド／不老不死を使ったか）
      links: [], bolts: [],  // 雷の型（分身どうしの雷の線／落ちる雷・飛び移る雷の光）
      cuts: [], slashes: [], blinks: [],   // 疾風の型（疾走の跡・残像斬り・瞬身の通り道）
      heavenT: 0,            // 次の天の光までの秒数
      banner: { text: '', sub: '', t: 0 },

      world: { w: W, h: H }, // ステージの広さ（フェーズが進むと広がる）
      zoom: 1,

      hp: P.maxHp,
      maxHp: P.maxHp,
      sinceHurt: 999,
      regenerating: false,

      player: {
        x: W / 2, y: H * 0.62, r: radiusOf(P.power), magnetR: radiusOf(P.power) + SH.magnet,
        tx: W / 2, ty: H * 0.62,
        inv: 0, fireCd: 0,
        catching: false,     // 押した直後、指の位置へ追いつく途中か
      },
      wasHeld: false,

      record: { active: false, path: [], length: 0, progress: 0, minLength: CONFIG.record.minStroke, enough: false },
      ghostCount: 0,         // これまでに生まれた分身の通し番号（色分けに使う）
      ghosts: [],
      budget: T.trailBudget.value,
      used: 0,
      evict: 0,

      enemies: [],
      enemyShots: [],
      warns: [],             // ボスの技の予告（赤く光る形）
      shots: [],
      pickups: [],           // かけら
      particles: [],
      rings: [],             // 広がる光の輪（演出）
      flashes: [],           // 一瞬の光（演出）

      spawnPool: 0,          // 敵を出すための「体力の貯金」
      nextEnemy: null,
      spawnDelay: 1.2,

      shake: 0,
      hurtFlash: 0,
      hitstop: 0,
      stats: { shots: 0, hits: 0 },
      ghostAttack: X.ghostAttack.value,
    });
    s.st = stats();
  }

  // ---------- 才能から今の強さを計算する ----------
  //   ブーストは「基本値に対する割合」で足し、カースは掛ける。最大ボーナスは達した回数で持つ
  function stats() {
    const has = (id) => s.curses.includes(id);
    const up = (id) => 1 + BOOST_BY_ID[id].per * stacksOf(s, id);
    const lim = up('limit');
    const attack = up('atk') * lim * (has('doom') ? 1.5 : 1);
    const rate = up('rate') * lim;
    return {
      attack,
      ghostAttack: attack * (has('brush') ? 2 : 1) * (has('lonely') ? 1.5 : 1),
      rate,
      ghostRate: rate * (has('hourglass') ? 2 : 1) * (has('trigger') ? 3 : 1),
      area: up('area'),
      dur: up('dur'),
      slowField: completionsOf(s, 'dur') > 0,
      budget: up('budget') * lim,
      drag: up('drag'),
      ghostSpeed: up('gspeed'),
      maxHp: Math.round(P.maxHp * up('hp') * lim * (has('doom') ? 0.5 : 1) * (has('lost') ? 2 : 1) * (has('chain') ? 2 : 1)),
      magnet: up('magnet'),
      shard: up('shard') * (has('hungry') ? 2 : 1),
      // 最大ボーナス（数字は「Lv5に達した回数」。0なら無し）
      crit: completionsOf(s, 'atk'),
      combo: completionsOf(s, 'rate'),
      shockwave: completionsOf(s, 'area') > 0,
      lastStand: completionsOf(s, 'budget') > 0,
      fullCharge: completionsOf(s, 'drag') > 0,
      turnBurst: completionsOf(s, 'gspeed') > 0,
      undying: completionsOf(s, 'hp'),
      blackHole: completionsOf(s, 'magnet') > 0,
      goldRush: completionsOf(s, 'shard') > 0,
      // カース
      curse: Object.fromEntries(s.curses.map((id) => [id, true])),
      // スキル（数字はLv。0なら持っていない）と、進化したか
      sk: Object.fromEntries(Object.entries(s.skills).map(([id, o]) => [id, o.lv])),
      evo: Object.fromEntries(Object.entries(s.skills).map(([id, o]) => [id, o.evo])),
    };
  }

  // ---------- 今の強さ ----------
  const bodyAtk = () => P.power * s.st.attack;   // 本体の攻撃力（大きさには関係しない）
  const playerPower = () => P.power * (s.st.curse.chain ? 2 : 1);   // 本体の大きさ（重い鎖で大きくなる）
  // 身軽：動いている間、当たり判定が小さくなる
  const playerHitR = () => s.player.r * P.hitRatio * (skLv('nimble') && s.player.moving ? 1 - (SK.nimble.base + SK.nimble.per * (skLv('nimble') - 1)) : 1);
  const budgetNow = () => Math.round(T.trailBudget.value * s.st.budget);
  // 孤独な王・ギガント：軌跡の総量をすべて1体に使える
  const dragLimitNow = () => (s.st.curse.lonely || s.st.sk.gigant ? budgetNow() : Math.min(T.dragLimit.value * s.st.drag, budgetNow()));
  const skLv = (id) => s.st.sk[id] || 0;
  // タイタン：分身が1体だけのとき
  const titanOn = () => s.st.evo.giant && s.ghosts.length === 1;
  const range = () => CONFIG.shot.range * s.zoom;
  // かけらを吸い取る範囲（本体の波紋が広がる大きさと同じ）
  // 飢えた手：吸い寄せない（直接触れたときだけ拾う）
  const magnetRadius = () => (s.st.curse.hungry ? 0 : s.player.r + SH.magnet * s.st.magnet);

  // ---------- 小さな部品 ----------
  // kind：'ghost' | 'enemy' | 'player' | 'shard'、idx：分身の番号（色分け用）
  function burst(x, y, kind, n, speed, idx = 0) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const v = rand(speed * 0.3, speed);
      const life = rand(0.25, 0.5);
      s.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, kind, idx, size: rand(1.5, 3.5) });
    }
  }

  // 細長い火花（速さの向きに伸びて見える）
  function sparks(x, y, kind, n, speed, idx = 0) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const v = rand(speed * 0.5, speed);
      const life = rand(0.2, 0.4);
      s.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, kind, idx, size: rand(1.5, 2.5), streak: true });
    }
  }

  // 広がって消える光の輪
  function ring(x, y, r0, r1, dur, kind, idx = 0, width = 3) {
    s.rings.push({ x, y, r0, r1, life: dur, max: dur, kind, idx, width });
  }

  function flash(x, y, r, dur, kind, idx = 0) {
    s.flashes.push({ x, y, r, life: dur, max: dur, kind, idx });
  }

  // 敵が倒れたときの演出（大きい敵ほど派手に）
  function enemyDeathFx(e) {
    const big = e.r / 10;
    // 着せ替えの「はじけ方」：標準以外は、その散り方に置きかえる（白い光と揺れは同じ）
    if (s.popStyle && s.popStyle !== 'std' && spawnPop(s.popStyle, e, (p) => s.particles.push(p))) {
      flash(e.x, e.y, e.r * 2.4, 0.14, 'white');
      if (e.r > 16) s.shake = Math.max(s.shake, Math.min(8, e.r * 0.25));
      return;
    }
    flash(e.x, e.y, e.r * 2.4, 0.14, 'white');
    ring(e.x, e.y, e.r * 0.8, e.r * 3 + 24, 0.4, 'enemy', 0, 2 + big * 1.5);
    ring(e.x, e.y, e.r * 0.5, e.r * 1.8 + 10, 0.22, 'white', 0, 2);
    burst(e.x, e.y, 'enemy', Math.round(12 + e.r * 1.2), 240 + e.r * 4);
    sparks(e.x, e.y, 'white', Math.round(6 + e.r * 0.5), 420 + e.r * 6);
    if (e.r > 16) s.shake = Math.max(s.shake, Math.min(8, e.r * 0.25));
  }

  // 分身が生まれたときの演出：軌跡全体が光り、生まれた所から輪が広がる
  function ghostSpawnFx(g) {
    const end = g.clip[g.clip.length - 1];
    flash(end.x, end.y, 26, 0.18, 'ghost', g.idx);
    ring(end.x, end.y, 6, 70, 0.45, 'ghost', g.idx, 4);
    ring(end.x, end.y, 4, 40, 0.3, 'white', 0, 2);
    sparks(end.x, end.y, 'ghost', 14, 380, g.idx);
    // 軌跡に沿って光の粒をまく
    const step = Math.max(8, Math.floor(g.clip.length / 40));
    for (let i = 0; i < g.clip.length; i += step) {
      const pt = g.clip[i];
      const a = rand(0, Math.PI * 2);
      const v = rand(20, 70);
      const life = rand(0.35, 0.7);
      s.particles.push({ x: pt.x, y: pt.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, kind: 'ghost', idx: g.idx, size: rand(2, 4) });
    }
    g.spawnGlow = 0.6; // 軌跡の線をしばらく明るく描く
  }

  // 一番近い敵を選ぶ。ただし、すでに飛んでいる弾で倒しきれる敵は狙わない
  function nearestEnemy(from, reach) {
    let best = null, bd = reach;
    for (const e of s.enemies) {
      if (e.hp - (e.incoming || 0) <= 0.001) continue;
      const d = dist(e, from);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  // 敵の今の動きから、弾が届くころの位置を先読みして狙う
  function leadPoint(from, target) {
    const rx = target.x - from.x, ry = target.y - from.y;
    const vx = target.vx || 0, vy = target.vy || 0;
    const sp = CONFIG.shot.speed;
    const a = vx * vx + vy * vy - sp * sp;
    const b = 2 * (rx * vx + ry * vy);
    const c = rx * rx + ry * ry;
    let t;
    if (Math.abs(a) < 1e-6) t = -c / b;
    else {
      const disc = b * b - 4 * a * c;
      if (disc < 0) return target;
      const sq = Math.sqrt(disc);
      const t1 = (-b - sq) / (2 * a), t2 = (-b + sq) / (2 * a);
      t = Math.min(t1, t2) > 0 ? Math.min(t1, t2) : Math.max(t1, t2);
    }
    if (!(t > 0) || t > 1.5) return target;
    return { x: target.x + vx * t, y: target.y + vy * t };
  }

  // opts.blast：当たると爆発（重砲）、opts.pierce：攻撃力を減らさずに突き抜ける（タイタン）
  function fire(from, target, owner, idx, power, opts = {}) {
    s.stats.shots++;
    // 変換：分身の攻撃力が一時的に上がっている
    if (owner === 'ghost' && s.convertT > 0) power *= 1 + (s.st.evo.convert ? SK.convert.kiwamiBuff : SK.convert.buff);
    // 会心の一撃：たまにダメージが2倍
    if (s.st.crit > 0 && Math.random() < BN.crit.chance + BN.crit.add * (s.st.crit - 1)) power *= BN.crit.mult;
    // 狂った引き金：分身の弾はでたらめな方向へ（狙った敵の予約もしない）
    if (owner === 'ghost' && s.st.curse.trigger) {
      const a = rand(0, Math.PI * 2);
      s.shots.push({
        x: from.x, y: from.y, vx: Math.cos(a) * CONFIG.shot.speed, vy: Math.sin(a) * CONFIG.shot.speed,
        life: 0.8 * s.zoom, owner, idx, power, size: radiusOf(power) * 0.3, target: null, reserved: 0, hit: new Set(), src: s.dmgSrc,
        base: power, blast: opts.blast || 0, pierce: !!opts.pierce,
      });
      return;
    }
    const aimAt = leadPoint(from, target);
    const d = Math.max(1, dist(aimAt, from));
    const sh = {
      x: from.x, y: from.y,
      vx: (aimAt.x - from.x) / d * CONFIG.shot.speed,
      vy: (aimAt.y - from.y) / d * CONFIG.shot.speed,
      life: 0.8 * s.zoom, owner, idx, src: s.dmgSrc,
      power,                                   // 残りの攻撃力（余れば貫通する）
      size: radiusOf(power) * 0.3,             // 弾の太さも強さに比例
      target,
      reserved: Math.min(power, target.hp - (target.incoming || 0)),
      hit: new Set(),
      base: power,                             // 撃ったときの攻撃力（爆発の強さに使う）
      blast: opts.blast || 0,
      pierce: !!opts.pierce,
    };
    s.shots.push(sh);
    target.incoming = (target.incoming || 0) + sh.reserved;
  }

  // 弾が当たるか消えたら、狙った敵への予約を外す
  function releaseReservation(sh) {
    if (sh.target && sh.reserved > 0) {
      sh.target.incoming = Math.max(0, (sh.target.incoming || 0) - sh.reserved);
      sh.reserved = 0;
    }
  }

  // raw：倍率をすでに掛けたダメージ（分身の弾）。そうでなければ目印の倍率をここで掛ける
  // 攻撃の出どころを決めてから呼ぶ（倒した敵を、その攻撃の手柄にする）
  function by(src, fn) { const prev = s.dmgSrc; s.dmgSrc = src; fn(); s.dmgSrc = prev; }
  function seeKind(k) { if (!s.seenKinds.includes(k)) s.seenKinds.push(k); }
  // 効果音：ここでは鳴らさず、順番待ちに積むだけ（ロジックは音を知らない）
  function sfx(id, pitch = 1) { if (s.sfx && s.sfx.length < 48) s.sfx.push([id, pitch]); }
  const skSfx = (id) => sfx('sk_' + id);

  // dot：毎フレーム少しずつ削るダメージ（毒・炎・雷の線など）。白く光らせない（光りっぱなしになるので）
  function damageEnemy(e, amount, raw = false, dot = false) {
    if (e.vanish) return;   // 影が消えている間は当たらない
    e.lastSrc = s.dmgSrc || 'ghost';
    if (!raw) amount *= markMul(e) * lureMul(e);
    if (e.frostT > 0 && s.st.evo.frostpath) amount *= 1 + SK.frostpath.kiwamiDamage;   // 極霜の道
    // 腐食：毒の敵が受けるダメージ↑
    if (e.poisonN > 0 && skLv('corrode')) amount *= 1 + Math.min(s.st.evo.corrode ? SK.corrode.kiwamiCap : SK.corrode.cap, e.poisonN * SK.corrode.per);
    // 圧縮：引力の中の敵が多いほど、受けるダメージ↑
    if (e.inPullT > 0 && skLv('compress')) amount *= 1 + Math.min(s.st.evo.compress ? SK.compress.kiwamiCap : SK.compress.cap, (s.pullCount || 0) * SK.compress.per);
    if (!raw) amount *= CONFIG.ally.damageMul;   // 味方の火力の倍率
    if (e.vuln) amount *= BOSS.vulnMul;   // ボスのすき：受けるダメージ↑
    e.hp -= amount;
    if (!dot) e.flash = 0.07;
    // 死神の契約：当てるたびに、まれに即死。大きい敵ほど効きにくく、ボスには効かない
    if (s.st.curse.reaper && !e.boss && e.hp > 0 && Math.random() < CU.reaperChance * Math.min(1, CU.reaperRefHp / e.maxHp)) {
      e.hp = 0;
      ring(e.x, e.y, e.r, e.r * 2.5, 0.35, 'white', 0, 3);
    }
  }

  // 極挑発：分身に引きつけられている敵は、受けるダメージが上がる
  const lureMul = (e) => (e.lured && s.st.evo.taunt ? 1 + SK.taunt.kiwami : 1);
  // 目印：印のある敵は受けるダメージが上がる
  const markMul = (e) => (e.markT > 0 ? 1 + SK.mark.per * skLv('mark') : 1);
  // 集中砲火：同じ敵に当てた回数ぶん、その敵へのダメージが上がる（上限あり）
  function focusCap() {
    const lv = skLv('focus');
    return lv ? SK.focus.cap[lv - 1] * (s.st.evo.focus ? SK.focus.kiwamiCap : 1) : 0;
  }
  const focusMul = (e) => 1 + Math.min(focusCap(), (e.focusN || 0) * SK.focus.perHit);

  // 連撃ブースト：当てるたびに段が上がり、しばらく当てないと消える
  function addCombo() {
    if (s.st.combo <= 0) return;
    s.combo.stacks = Math.min(BN.combo.maxStacks, s.combo.stacks + 1);
    s.combo.t = BN.combo.keep;
  }
  const comboMul = () => (s.st.combo > 0 ? 1 + s.combo.stacks * (BN.combo.perHit + BN.combo.add * (s.st.combo - 1)) : 1);

  // 衝撃波：その場所から広がり、周りの敵にダメージ
  function shockwave(x, y, radius, dmg, kind = 'white', idx = 0) {
    const R = radius * s.st.area * s.zoom;
    ring(x, y, 4, R, 0.3, kind, idx, 3);
    for (const e of s.enemies) {
      if (e.hp > 0 && Math.hypot(e.x - x, e.y - y) < R + e.r) damageEnemy(e, dmg);
    }
  }

  // 重砲の爆発：その場所のまわりの敵にダメージ（当たった敵には弾のダメージが入っているので除く）
  function explode(x, y, radius, dmg, idx, except) {
    const R = radius * s.st.area * s.zoom;
    ring(x, y, 4, R, 0.28, 'ghost', idx, 4);
    flash(x, y, R * 0.7, 0.12, 'ghost', idx);
    sparks(x, y, 'ghost', 8, 220, idx);
    for (const e of s.enemies) {
      if (e !== except && e.hp > 0 && Math.hypot(e.x - x, e.y - y) < R + e.r) damageEnemy(e, dmg);
    }
  }

  // ---------- 本体 ----------
  function aim(input) {
    const p = s.player;
    if (input.keyX || input.keyY) {
      p.tx = p.x + input.keyX * T.moveSpeed.value * DT;
      p.ty = p.y + input.keyY * T.moveSpeed.value * DT;
    } else if (X.control.value === 'stick') {
      // スティック：中心からのずれの向きへ、ずれの大きさに合わせた速さで進む（指を止めていても進み続ける）
      //   速さだけを、決まった加速でなめらかに上げる（どれだけ倒しても、0.2秒かけて最高速度になる）。
      //   向きはスティックの向きにすぐ合わせ、ゆるめたときもすぐ遅くする
      const max = T.moveSpeed.value * s.zoom * (s.st.curse.chain ? 0.5 : 1);
      const sx = input.stickX || 0, sy = input.stickY || 0, mag = Math.hypot(sx, sy);
      const goal = input.held ? mag * max : 0;
      p.sspd = Math.min(goal, (p.sspd || 0) + (max / P.stickAccelTime) * DT);
      p.svx = mag > 0 ? (sx / mag) * p.sspd : 0;
      p.svy = mag > 0 ? (sy / mag) * p.sspd : 0;
      p.tx = p.x + p.svx * DT;
      p.ty = p.y + p.svy * DT;
    } else if (X.control.value === 'follow') {
      // 指／カーソルの位置へ向かう。スマホは指で隠れないよう少し上を目指す
      if (input.pointer) {
        p.tx = input.pointer.x;
        p.ty = input.pointer.y - (input.isTouch ? T.touchOffset.value * s.zoom : 0);
      }
    } else {
      p.tx += input.dx * T.sensitivity.value;
      p.ty += input.dy * T.sensitivity.value;
      // 指が最高速度より速く動いても、本体が遅れすぎないよう、先に進む分は少しだけ（0.15秒分）にとどめる
      const lx = p.tx - p.x, ly = p.ty - p.y, lead = Math.hypot(lx, ly), maxLead = T.moveSpeed.value * s.zoom * 0.15;
      if (lead > maxLead) { p.tx = p.x + lx / lead * maxLead; p.ty = p.y + ly / lead * maxLead; }
    }
    const m = p.r + 2;
    p.tx = clamp(p.tx, m, s.world.w - m);
    p.ty = clamp(p.ty, m, s.world.h - m);
  }

  function movePlayer(input) {
    const p = s.player;
    p.r = radiusOf(playerPower()) * s.zoom;   // ステージが広がっても、画面の上での本体の大きさは変わらない
    p.magnetR = magnetRadius();
    aim(input);
    const dx = p.tx - p.x, dy = p.ty - p.y;
    const d = Math.hypot(dx, dy);
    const step = T.moveSpeed.value * s.zoom * (s.st.curse.chain ? 0.5 : 1) * DT;
    if (d <= step) { p.x = p.tx; p.y = p.ty; p.catching = false; }
    else { p.x += dx / d * step; p.y += dy / d * step; }
    if (p.inv > 0) p.inv -= DT;
    // 本体の道の見た目と状態（描画もこれを使う）
    // 動いている速さ（指について動くので、指の速さ。少しならして、ちらつきを防ぐ）
    const ks = 1 - Math.exp(-DT / 0.15); p.spd = (p.spd || 0) * (1 - ks) + (Math.min(d, step) / DT) * ks;
    const wasStill = (p.stillT || 0) >= BS.gust.still;
    p.moving = p.spd >= T.moveSpeed.value * BS.charge.move * s.zoom;   // 最高速度の15%以上で「動いている」
    p.stillT = p.moving ? 0 : (p.stillT || 0) + DT;
    p.started = p.moving && wasStill;   // 止まった状態から動き出した瞬間
    if (d > 0.5) p.dir = Math.atan2(dy, dx);
    p.aura = skLv('aura') ? p.r * BS.aura.radius : 0;
    p.auraKw = !!(skLv('aura') && s.st.evo.aura);
    p.charge = skLv('charge') && p.moving ? p.dir : null;   // 突撃中（向き）
    // シールド：破れたあと、時間で戻る
    const sh = skLv('shield');
    if (!sh) { p.shield = false; p.shieldCd = 0; }
    else if (!p.shield) { p.shieldCd = (p.shieldCd || 0) - DT; if (p.shieldCd <= 0) { p.shield = true; p.shieldCd = 0; skSfx('shield'); ring(p.x, p.y, p.r, p.r * 2.4, 0.3, 'player', 0, 2); } }
    // 連打：しばらくぶつからないと段が消える
    if (p.rushN > 0) { p.rushT -= DT; if (p.rushT <= 0) p.rushN = 0; }
    p.rush = skLv('rush') ? (p.rushN || 0) / rushMax() : 0;
    // 鬼神：一定の間隔で、数秒の無敵
    if (skLv('demon')) {
      if (p.demonT > 0) { p.demonT -= DT; if (p.demonT <= 0) p.demonCd = BS.demon.every; }
      else { p.demonCd = (p.demonCd == null ? BS.demon.every : p.demonCd) - DT; if (p.demonCd <= 0) { p.demonT = BS.demon.time; skSfx('demon'); ring(p.x, p.y, p.r, p.r * 6, 0.5, 'player', 0, 5); s.shake = Math.max(s.shake, 6); } }
    } else p.demonT = 0;
    p.demon = p.demonT > 0 ? p.demonT : 0;
  }

  // ---------- 本体の道 ----------
  const BS = SK;
  const rushMax = () => (s.st.evo.rush ? BS.rush.kiwamiMax : BS.rush.max);
  // 敵を押しやる（なめらかに滑る。ボスは動かない）
  function knock(e, dx, dy, power) {
    if (e.boss) return;
    const d = Math.max(1e-6, Math.hypot(dx, dy));
    e.kbx = (e.kbx || 0) + dx / d * power * s.zoom;
    e.kby = (e.kby || 0) + dy / d * power * s.zoom;
  }
  // 本体の弾を1発撃つ（向きを ang でずらせる）
  function bodyShot(target, power, opts = {}) {
    const p = s.player;
    const n0 = s.shots.length;
    fire(p, target, 'player', 0, power, { pierce: opts.pierce });
    const sh = s.shots[n0];
    if (!sh) return;
    if (opts.ang) { const c = Math.cos(opts.ang), sn = Math.sin(opts.ang); const vx = sh.vx, vy = sh.vy; sh.vx = vx * c - vy * sn; sh.vy = vx * sn + vy * c; }
    if (opts.life) sh.life *= opts.life;
    if (opts.homing) { sh.homing = true; sh.life *= BS.homing.life; }
    if (opts.bounce) sh.bounce = 1;
  }
  // 射手の型：射撃・速射・狙撃・追尾弾・弾幕
  function updateShoot() {
    const p = s.player;
    const lv = skLv('shoot');
    if (!lv) return;
    const snipe = skLv('snipe') > 0, king = !!s.st.evo.shoot;
    p.shootCd = (p.shootCd || 0) - DT;
    const reach = king ? Math.hypot(s.world.w, s.world.h) : range();
    if (p.shootCd <= 0) {
      const t = nearestEnemy(p, reach);
      if (t) {
        p.aim = Math.atan2(t.y - p.y, t.x - p.x);
        let power = bodyAtk() * BS.shoot.power;
        if (snipe) power *= BS.snipe.mult * (s.st.evo.snipe ? BS.snipe.kiwamiMult : 1);
        const opts = {
          pierce: snipe || king,
          life: king ? BS.shoot.kingLife / 0.8 : 0,
          homing: skLv('homing') > 0,
          bounce: skLv('homing') > 0 && !!s.st.evo.homing,
        };
        bodyShot(t, power, opts);
        sfx(snipe ? 'sk_snipe' : opts.homing ? 'sk_homing' : skLv('rapid') ? 'sk_rapid' : 'sk_shoot', rand(0.95, 1.05));
        if (s.st.evo.rapid) bodyShot(t, power, { ...opts, ang: BS.rapid.spread });   // 極速射：2発ずつ
        const speed = s.st.rate * comboMul() * (1 + BS.rapid.per * skLv('rapid'));
        p.shootCd = BS.shoot.interval * (snipe ? BS.snipe.slow : 1) / speed;
      }
    }
    // 弾幕：一定の間隔で、全方向へ
    if (skLv('barrage')) {
      p.barrageCd = (p.barrageCd == null ? BS.barrage.every : p.barrageCd) - DT;
      if (p.barrageCd <= 0) {
        p.barrageCd = BS.barrage.every / s.st.rate;
        skSfx('barrage');
        const n = BS.barrage.count, power = bodyAtk() * BS.barrage.power, sp = CONFIG.shot.speed;
        for (let i = 0; i < n; i++) {
          const a = (i * Math.PI * 2) / n + s.time;
          s.shots.push({ x: p.x, y: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.8 * s.zoom, owner: 'player', idx: 0, src: s.dmgSrc, power, size: radiusOf(power) * 0.3, target: null, reserved: 0, hit: new Set(), base: power, blast: 0, pierce: false });
        }
      }
    }
  }
  // ---------- 罠の道 ----------
  const spikePower = (g) => g.power * SK.caltrop.power * (1 + SK.caltrop.per * (skLv('caltrop') - 1));
  function placeTrap(x, y, kind, dmg, idx = 0) {
    s.traps = s.traps || [];
    const life = SK.trap.life * s.st.dur;
    const hits = kind === 'spike' && skLv('barb') ? (s.st.evo.barb ? Infinity : SK.barb.hits[skLv('barb') - 1]) : 1;
    const tr = { x, y, kind, dmg, idx, life, max: life, hits, rot: Math.random() * Math.PI };
    if (kind === 'mine' && skLv('timebomb')) tr.fuse = SK.timebomb.time;   // 時限爆弾：置いてから時間で爆発
    s.traps.push(tr);
    if (s.traps.length > SK.trap.max) s.traps.shift();
  }
  function updateTraps() {
    s.traps = s.traps || [];
    const p = s.player;
    // ばらまき：往復している分身が、通った跡にもマキビシを落とす
    if (skLv('caltrop') && skLv('scatter') && !turretOn()) {
      const every = s.st.evo.scatter ? SK.scatter.kiwamiEvery : SK.scatter.every;
      for (const g of s.ghosts) {
        g.dropCd = (g.dropCd == null ? rand(0, every) : g.dropCd) - DT;
        if (g.dropCd <= 0) { g.dropCd = every; skSfx('scatter'); placeTrap(g.x, g.y, 'spike', spikePower(g), g.idx); }
      }
    }
    // 剣山：一定の間隔で、画面全体にマキビシが降る
    if (skLv('caltrop') && skLv('spikebed')) {
      s.spikebedCd = (s.spikebedCd == null ? SK.spikebed.every : s.spikebedCd) - DT;
      if (s.spikebedCd <= 0) {
        s.spikebedCd = SK.spikebed.every;
        skSfx('spikebed');
        const ref = s.big || s.ghosts[0];
        const dmg = ref ? spikePower(ref) : P.power * s.st.ghostAttack * SK.caltrop.power;
        for (let i = 0; i < SK.spikebed.count; i++) { const x = rand(20, s.world.w - 20), y = rand(20, s.world.h - 20); placeTrap(x, y, 'spike', dmg, ref ? ref.idx : 0); flash(x, y, 8, 0.2, 'white'); }
      }
    }
    by('mine', updateMines);
    by('fire', updateFires);
    by('thunder', updateThunder);
    by('ice', updateIce);
    by('gravity', updateGravity);
    by('poison', updatePoison);
    by('reaper', updateReaper);
    by('orbit', updateOrbs);
    by('blade', updateBlades);
    by('drone', updateDrones);
    by('shieldsat', updateShieldSats);
    by('alchemy', updateAlchemy);
    // 踏まれたら刺さる
    const reach = SK.trap.reach * s.zoom;
    for (const tr of s.traps) {
      if (tr.kind === 'mine') continue;
      tr.life -= DT;
      if (tr.life <= 0 || tr.hits <= 0) continue;
      for (const e of s.enemies) {
        if (e.hp <= 0 || Math.hypot(e.x - tr.x, e.y - tr.y) >= e.r + reach) continue;
        // スロウフィールド（持続時間＋の最大ボーナス）：罠に触れた敵が遅くなる
        if (s.st.slowField) e.trapSlowT = SK.trap.slowTime;
        if ((e.trapHit || 0) > s.time && tr.hits > 1) continue;
        damageEnemy(e, tr.dmg);
        addCombo();
        tr.hits--;
        e.trapHit = s.time + SK.barb.again;
        skSfx(tr.kind === 'light' ? 'keepsake' : tr.kind === 'spike' ? (skLv('snare') ? 'snare' : skLv('barb') ? 'barb' : 'caltrop') : 'caltrop');
        sparks(tr.x, tr.y, tr.kind === 'light' ? 'ghost' : 'white', 5, 150, tr.idx);
        if (tr.kind === 'light' && s.st.evo.keepsake) explode(tr.x, tr.y, SK.keepsake.blast, tr.dmg * SK.keepsake.blastPower, tr.idx, e);
        if (tr.kind === 'spike') {
          // 足止め：踏んだ敵が少し止まる
          if (skLv('snare')) e.stunT = SK.snare.stop[skLv('snare') - 1] * (s.st.evo.snare ? SK.snare.kiwamiMult : 1);
          // 千本針：飛び散って、まわりの敵も刺す
          if (s.st.evo.caltrop) {
            const R = SK.caltrop.burst * s.st.area * s.zoom;
            ring(tr.x, tr.y, 2, R, 0.2, 'white', 0, 2);
            for (const o of s.enemies) if (o !== e && o.hp > 0 && Math.hypot(o.x - tr.x, o.y - tr.y) < R + o.r) damageEnemy(o, tr.dmg);
          }
        }
        if (tr.hits <= 0) break;
      }
    }
    s.traps = s.traps.filter((tr) => tr.life > 0 && tr.hits > 0);
  }

  // ---- 現象の道：雷の型 ----
  const avgGhostPower = () => (s.ghosts.length ? s.ghosts.reduce((a, g) => a + g.power, 0) / s.ghosts.length : P.power * s.st.ghostAttack);
  function bolt(x0, y0, x1, y1, life = 0.18) { s.bolts.push({ x0, y0, x1, y1, life, max: life }); }
  function zap(e, dmg, dot = false) {
    damageEnemy(e, dmg, false, dot);
    e.shockT = 0.25;
    // 帯電：痺れて一瞬止まる（同じ敵は少し間をあける）
    if (skLv('charged') && (e.chargeStopAt || -9) + SK.charged.again <= s.time) {
      e.stunT = Math.max(e.stunT || 0, SK.charged.stop * (s.st.evo.charged ? SK.charged.kiwamiMult : 1));
      e.chargeStopAt = s.time;
      skSfx('charged');
    }
  }
  function chainBolt(from, dealt) {
    const n = s.st.evo.chainbolt ? SK.chainbolt.kiwamiCount : SK.chainbolt.count;
    const R = SK.chainbolt.reach * s.zoom;
    const near = s.enemies.filter((o) => o !== from && o.hp > 0 && Math.hypot(o.x - from.x, o.y - from.y) < R)
      .sort((a, b) => Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(b.x - from.x, b.y - from.y)).slice(0, n);
    if (near.length) skSfx('chainbolt');
    for (const o of near) { bolt(from.x, from.y, o.x, o.y); zap(o, dealt * SK.chainbolt.power); }
  }
  function updateThunder() {
    for (const b of s.bolts) b.life -= DT;
    s.bolts = s.bolts.filter((b) => b.life > 0);
    s.links = [];
    for (const e of s.enemies) { if (e.shockT > 0) e.shockT -= DT; if (e.status || e.shockT > 0) (e.status || (e.status = {})).shock = e.shockT > 0; }
    if (!skLv('thunder')) return;
    // 雷の線：近い分身どうし（雷網：全部の分身どうし）。分身が1体だけなら本体と
    const gs = s.ghosts.slice(-SK.thunder.maxGhosts);
    if (gs.length === 1) s.links.push([s.player, gs[0]]);
    else if (s.st.evo.thunder) { for (let i = 0; i < gs.length; i++) for (let j = i + 1; j < gs.length; j++) s.links.push([gs[i], gs[j]]); }
    else {
      const seen = new Set();
      gs.forEach((a, i) => {
        let bj = -1, bd = Infinity;
        gs.forEach((b, j) => { if (j === i) return; const d = Math.hypot(a.x - b.x, a.y - b.y); if (d < bd) { bd = d; bj = j; } });
        const key = Math.min(i, bj) + '-' + Math.max(i, bj);
        if (bj >= 0 && !seen.has(key)) { seen.add(key); s.links.push([a, gs[bj]]); }
      });
    }
    const avg = avgGhostPower();
    const dps = avg * SK.thunder.power * (1 + SK.thunder.per * (skLv('thunder') - 1));
    const w = SK.thunder.width * s.zoom;
    for (const e of s.enemies) {
      if (e.hp <= 0) continue;
      for (const [a, b] of s.links) {
        if (segDist(a.x, a.y, b.x, b.y, e.x, e.y) < e.r + w) { if ((e.zapSfx || 0) <= s.time) { e.zapSfx = s.time + 0.8; skSfx('thunder'); } zap(e, dps * DT, true); break; }
      }
    }
    // 落雷：雷の線の近くの敵へ
    if (skLv('strike')) {
      s.strikeCd = (s.strikeCd == null ? SK.strike.every : s.strikeCd) - DT;
      if (s.strikeCd <= 0) {
        s.strikeCd = SK.strike.every;
        const near = SK.strike.near * s.zoom;
        const cands = s.enemies.filter((e) => e.hp > 0 && s.links.some(([a, b]) => segDist(a.x, a.y, b.x, b.y, e.x, e.y) < near + e.r));
        cands.sort((a, b) => b.hp - a.hp);
        if (cands.length) skSfx('strike');
        for (const e of cands.slice(0, s.st.evo.strike ? SK.strike.kiwamiCount : 1)) { bolt(e.x, e.y - 400, e.x, e.y, 0.25); flash(e.x, e.y, 22, 0.12, 'white'); zap(e, avg * SK.strike.power); }
      }
    }
    // 天雷：画面中の敵すべてに
    if (skLv('skybolt')) {
      s.skyCd = (s.skyCd == null ? SK.skybolt.every : s.skyCd) - DT;
      if (s.skyCd <= 0) {
        s.skyCd = SK.skybolt.every;
        skSfx('skybolt');
        s.shake = Math.max(s.shake, 6);
        for (const e of s.enemies) if (e.hp > 0) { bolt(e.x, e.y - 400, e.x, e.y, 0.3); zap(e, avg * SK.skybolt.power); }
      }
    }
  }

  // ---- 現象の道：氷の型 ----
  function chillHit(e) {
    const F2 = SK.freeze;
    e.chillT = F2.time;
    skSfx('freeze');
    e.chillAmt = Math.min(0.8, F2.base + F2.per * (skLv('freeze') - 1));
    // 絶対零度：同じ敵に何度か当てると、完全に凍る
    if (s.st.evo.freeze) { e.iceN = (e.iceN || 0) + 1; if (e.iceN >= F2.hits) { e.iceN = 0; e.frozenT = F2.freezeTime; } }
  }
  // 氷の型で、今その敵がどれだけ遅いか（1＝ふつう、0＝止まっている）。重なったときは一番強いものだけ
  function iceSlow(e) {
    if (e.frozenT > 0) return 0;
    let amt = 0;
    if (e.chillT > 0) amt = Math.max(amt, e.chillAmt || 0);
    if (e.coldT > 0) amt = Math.max(amt, SK.chill.slow);
    if (e.frostT > 0) amt = Math.max(amt, SK.frostpath.slow);
    return 1 - amt;
  }
  function updateIce() {
    for (const e of s.enemies) {
      if (e.chillT > 0) e.chillT -= DT;
      if (e.frozenT > 0) e.frozenT -= DT;
      if (e.coldT > 0) e.coldT -= DT;
      if (e.frostT > 0) e.frostT -= DT;
      if (e.status || e.frozenT > 0) (e.status || (e.status = {})).freeze = e.frozenT > 0;
    }
    if (!skLv('freeze')) return;
    // 冷気：分身のまわり
    if (skLv('chill')) {
      const add = SK.chill.reach * (s.st.evo.chill ? SK.chill.kiwamiReach : 1) * s.st.area * s.zoom;
      for (const g of s.ghosts) { g.cold = g.r + add; for (const e of s.enemies) if (e.hp > 0 && Math.hypot(e.x - g.x, e.y - g.y) < g.cold + e.r) { if (!(e.coldT > 0)) skSfx('chill'); e.coldT = 0.1; } }
    } else for (const g of s.ghosts) g.cold = 0;
    // 霜の道：分身の軌跡の線の上
    s.frost = skLv('frostpath') > 0;
    if (s.frost) {
      const w = SK.frostpath.width * s.zoom, gap = SK.frostpath.gap;
      for (const g of s.ghosts) {
        const c = g.clip;
        for (const e of s.enemies) {
          if (e.hp <= 0) continue;
          for (let i = 0; i + gap < c.length; i += gap) {
            if (segDist(c[i].x, c[i].y, c[i + gap].x, c[i + gap].y, e.x, e.y) < e.r + w) { if (!(e.frostT > 0)) skSfx('frostpath'); e.frostT = 0.1; break; }
          }
        }
      }
    }
    // 氷河期：画面中の敵が凍る
    if (skLv('iceage')) {
      s.iceCd = (s.iceCd == null ? SK.iceage.every : s.iceCd) - DT;
      if (s.iceCd <= 0) {
        s.iceCd = SK.iceage.every;
        skSfx('iceage');
        // 画面が真っ白にならないよう、中心から広がる輪だけで知らせる
        ring(s.world.w / 2, s.world.h / 2, 10, Math.hypot(s.world.w, s.world.h) / 2, 0.5, 'white', 0, 5);
        for (const e of s.enemies) if (e.hp > 0) e.frozenT = Math.max(e.frozenT || 0, SK.iceage.time);
      }
    }
  }
  // 砕氷：遅くなっている敵が倒れたら、氷の破片が飛び散る
  function shatter(e) {
    const n = s.st.evo.shatter ? SK.shatter.kiwamiCount : SK.shatter.count;
    const power = avgGhostPower() * SK.shatter.power, sp = CONFIG.shot.speed;
    const off = rand(0, Math.PI * 2);   // 全体の向きだけ毎回変える（破片どうしの間は等しく）
    skSfx('shatter');
    for (let i = 0; i < n; i++) {
      const a = (i * Math.PI * 2) / n + off;
      s.shots.push({ x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: SK.shatter.life * s.zoom, owner: 'ice', idx: 0, src: s.dmgSrc, power, size: 2.5, target: null, reserved: 0, hit: new Set([e]), base: power, blast: 0, pierce: false });
    }
  }

  // ---- 収穫の道：錬金の型 ----
  // HPを回復する。満タンで余った分は、生命の泉のシールド・過剰回復の最大HPへ
  function healPlayer(amount) {
    const room = s.maxHp - s.hp, used = Math.min(room, amount), over = amount - used;
    s.hp += used;
    if (over > 0) {
      if (s.st.evo.absorb) s.lifeShield = Math.min(s.maxHp * SK.absorb.shieldCap, s.lifeShield + over);
      if (skLv('overheal')) skSfx('overheal');
      if (skLv('overheal')) s.hpBonus = Math.min(SK.overheal.cap, s.hpBonus + over * (s.st.evo.overheal ? SK.overheal.kiwamiRate : SK.overheal.rate) / Math.max(1, s.st.maxHp));
    }
  }
  function onCollect(worth) {
    const p = s.player;
    // 吸収：拾うとHPが回復
    if (skLv('absorb') && s.hp < s.maxHp) skSfx('absorb');
    if (skLv('absorb')) healPlayer(s.maxHp * (SK.absorb.base + SK.absorb.per * (skLv('absorb') - 1)) * worth);
    if (!skLv('alchemy')) return;
    // 錬金：拾うたびに光の弾
    const t0 = nearestEnemy(p, Infinity);
    if (t0) {
      const gold = skLv('goldshot') > 0;
      const power = bodyAtk() * SK.alchemy.power * (1 + SK.alchemy.per * (skLv('alchemy') - 1)) * (gold ? (s.st.evo.goldshot ? SK.goldshot.kiwamiMult : SK.goldshot.mult) : 1);
      const n0 = s.shots.length;
      fire({ x: p.x, y: p.y }, t0, 'player', 0, power);
      const sh = s.shots[n0];
      skSfx(gold ? 'goldshot' : 'alchemy');
      if (sh) { sh.alch = true; sh.gold = gold; sh.stone = !!s.st.evo.alchemy; }
    }
    // 変換：何個か拾うごとに、分身の攻撃力↑
    if (skLv('convert')) {
      s.convertN += worth;
      while (s.convertN >= SK.convert.every) { skSfx('convert'); s.convertN -= SK.convert.every; s.convertT = SK.convert.time; ring(p.x, p.y, p.r, p.r * 4, 0.3, 'shard', 0, 3); }
    }
    // 貯金
    if (skLv('savings')) s.bank += worth * (s.st.evo.savings ? SK.savings.kiwamiRate : SK.savings.rate);
  }
  function updateAlchemy() {
    if (s.convertT > 0) s.convertT -= DT;
    for (const d of s.goldDrops) {
      d.t += DT;
      if (d.t >= d.max && !d.done) {
        d.done = true;
        if (d.e && d.e.hp > 0) { d.x = d.e.x; d.y = d.e.y; damageEnemy(d.e, d.power); addCombo(); sparks(d.x, d.y, 'shard', 5, 140); }
      }
      if (d.e && d.e.hp > 0 && !d.done) { d.x = d.e.x; d.y = d.e.y; }
    }
    s.goldDrops = s.goldDrops.filter((d) => !d.done || d.t < d.max + 0.15);
    if (!skLv('alchemy') || !skLv('goldrain')) return;
    s.goldrainCd = (s.goldrainCd == null ? SK.goldrain.every : s.goldrainCd) - DT;
    if (s.goldrainCd <= 0) {
      s.goldrainCd = SK.goldrain.every;
      skSfx('goldrain');
      const power = bodyAtk() * SK.goldrain.power;
      for (const e of s.enemies) if (e.hp > 0) s.goldDrops.push({ e, x: e.x, y: e.y, t: -rand(0, 0.5), max: SK.goldrain.delay, power });
    }
  }

  // ---- 衛星の道：浮遊と衛星の型 ----
  function updateOrbs() {
    const p = s.player, O = SK.float;
    const fl = skLv('float'), sat = skLv('satellite');
    if (!fl) { p.orbs = null; s.stars = []; return; }
    // 玉の数と大きさ
    let n = sat ? sat + 1 : (s.st.evo.float ? 2 : 1);
    if (sat && s.st.evo.float) n = Math.max(n, 2);
    const big = sat && skLv('bigsat');
    const shift = sat && skLv('orbitshift');
    const speed = O.speed * (shift && s.st.evo.orbitshift ? SK.orbitshift.kiwamiSpeed : 1);
    p.orbA = (p.orbA || 0) + speed * DT;
    let R = p.r * O.radius;
    if (shift) { const S = SK.orbitshift, k = 0.5 + 0.5 * Math.sin((s.time * Math.PI * 2) / S.period); R *= S.min + (S.max - S.min) * k; }
    if (shift) { const ph = Math.floor(s.time / SK.orbitshift.period); if (ph !== s.orbitPh) { s.orbitPh = ph; skSfx('orbitshift'); } }
    const size = p.r * O.size;
    const dmg = bodyAtk() * O.power * (1 + O.per * (fl - 1));
    const orbs = [];
    if (big) orbs.push({ a: p.orbA, R, r: size * Math.sqrt(n) * (s.st.evo.bigsat ? SK.bigsat.kiwamiSize : 1), dmg: dmg * n, big: true });
    else {
      for (let i = 0; i < n; i++) orbs.push({ a: p.orbA + (i * Math.PI * 2) / n, R, r: size, dmg });
      // 惑星系：外側に逆向きの輪
      if (sat && s.st.evo.satellite) for (let i = 0; i < n; i++) orbs.push({ a: -p.orbA + (i * Math.PI * 2) / n + 0.3, R: R * SK.satellite.planet, r: size, dmg });
    }
    for (const o of orbs) { o.x = p.x + Math.cos(o.a) * o.R; o.y = p.y + Math.sin(o.a) * o.R; }
    // 流星：玉が近くの敵へ飛び出して戻る
    if (sat && skLv('meteor')) {
      const M = SK.meteor;
      p.meteorCd = (p.meteorCd == null ? M.every : p.meteorCd) - DT;
      if (p.meteorCd <= 0) {
        const t0 = nearestEnemy(p, M.reach * s.zoom);
        if (t0) {
          p.meteorCd = M.every;
          skSfx('meteor');
          const which = s.st.evo.meteor ? orbs.map((_, i) => i) : [Math.floor(Math.random() * orbs.length)];
          p.meteors = which.map((i) => ({ i, t: 0, tx: t0.x, ty: t0.y }));
        }
      }
      for (const m of p.meteors || []) {
        m.t += DT;
        const o = orbs[m.i]; if (!o) continue;
        const k = Math.sin(Math.min(1, m.t / M.time) * Math.PI);   // 0→1→0
        o.x += (m.tx - o.x) * k; o.y += (m.ty - o.y) * k; o.flying = k > 0.05;
      }
      p.meteors = (p.meteors || []).filter((m) => m.t < M.time);
    }
    // 玉に触れた敵にダメージ
    orbs.forEach((o, i) => {
      for (const e of s.enemies) {
        if (e.hp <= 0 || Math.hypot(e.x - o.x, e.y - o.y) >= e.r + o.r) continue;
        e.orbHit = e.orbHit || {};
        if ((e.orbHit[i] || 0) > s.time) continue;
        e.orbHit[i] = s.time + O.again;
        damageEnemy(e, o.dmg); addCombo();
        skSfx(o.big ? 'bigsat' : sat ? 'satellite' : 'float');
        sparks(e.x, e.y, 'white', 3, 140);
      }
    });
    p.orbs = orbs;
    // 星の雨
    if (sat && skLv('starfall')) {
      const F2 = SK.starfall;
      s.starCd = (s.starCd == null ? F2.every : s.starCd) - DT;
      if (s.starCd <= 0) {
        s.starCd = F2.every;
        skSfx('starfall');
        for (let i = 0; i < F2.count; i++) s.stars.push({ x: rand(20, s.world.w - 20), y: rand(20, s.world.h - 20), t: -rand(0, 0.8), max: F2.delay });
      }
    }
    for (const st of s.stars) {
      st.t += DT;
      if (st.t >= st.max && !st.done) {
        st.done = true;
        const R2 = SK.starfall.radius * s.st.area * s.zoom;
        sfx('sk_starfall', 1.4);
        ring(st.x, st.y, 2, R2, 0.25, 'white', 0, 2);
        for (const e of s.enemies) if (e.hp > 0 && Math.hypot(e.x - st.x, e.y - st.y) < R2 + e.r) { damageEnemy(e, bodyAtk() * SK.starfall.power); addCombo(); }
      }
    }
    s.stars = s.stars.filter((st) => !st.done || st.t < st.max + 0.2);
  }

  // ---- 衛星の道：刃輪の型 ----
  let bladeId = 0;
  function updateBlades() {
    const B2 = SK.blade, lv = skLv('blade');
    if (!lv) { for (const g of s.ghosts) g.blades = null; return; }
    const saw = !!s.st.evo.blade;
    const n = skLv('twinblade') ? (s.st.evo.twinblade ? SK.twinblade.kiwamiCount : SK.twinblade.count) : 1;
    const size = B2.size * (saw ? B2.sawMult : 1) * s.zoom;
    const again = B2.again * (saw ? 0.5 : 1);
    const cap = s.st.evo.whet ? SK.whet.kiwamiCap : SK.whet.cap;
    for (const g of s.ghosts) {
      if (g.bid == null) g.bid = ++bladeId;
      g.bladeA = (g.bladeA || 0) + B2.speed * DT;
      const R = g.r + B2.gap * s.zoom + size;
      const blades = [];
      for (let i = 0; i < n; i++) { const a = g.bladeA + (i * Math.PI * 2) / n; blades.push({ a, x: g.x + Math.cos(a) * R, y: g.y + Math.sin(a) * R, r: size }); }
      // 投げ刃：一番近い敵へ飛んで戻る
      if (skLv('throw')) {
        const T2 = SK.throw;
        g.throwCd = (g.throwCd == null ? rand(0, T2.every) : g.throwCd) - DT;
        if (g.throwCd <= 0) {
          const t0 = nearestEnemy(g, T2.reach * s.zoom);
          if (t0) { skSfx('throw'); g.throwCd = s.st.evo.throw ? T2.kiwamiEvery : T2.every; g.thrown = { t: 0, tx: t0.x, ty: t0.y }; } else g.throwCd = 0.2;
        }
        if (g.thrown) {
          g.thrown.t += DT;
          const k = Math.sin(Math.min(1, g.thrown.t / T2.time) * Math.PI), b = blades[0];
          b.x += (g.thrown.tx - b.x) * k; b.y += (g.thrown.ty - b.y) * k; b.flying = k > 0.05;
          if (g.thrown.t >= T2.time) g.thrown = null;
        }
      }
      // 研磨：しばらく当たらないと元に戻る
      if (g.whetT > 0) { g.whetT -= DT; if (g.whetT <= 0) g.whet = 0; }
      const dmg = g.power * B2.power * (1 + B2.per * (lv - 1)) * (1 + (g.whet || 0));
      blades.forEach((b, i) => {
        for (const e of s.enemies) {
          if (e.hp <= 0 || Math.hypot(e.x - b.x, e.y - b.y) >= e.r + b.r) continue;
          e.bladeHit = e.bladeHit || {};
          const key = g.bid * 8 + i;
          if ((e.bladeHit[key] || 0) > s.time) continue;
          e.bladeHit[key] = s.time + again;
          damageEnemy(e, dmg); addCombo();
          skSfx(skLv('whet') ? 'whet' : n > 1 ? 'twinblade' : 'blade');
          sparks(e.x, e.y, 'white', 3, 160);
          if (skLv('whet')) { g.whet = Math.min(cap, (g.whet || 0) + SK.whet.per); g.whetT = SK.whet.keep; }
        }
      });
      g.blades = blades;
    }
    // 千刃：本体のまわりから全方向へ
    if (skLv('thousandblade')) {
      const T3 = SK.thousandblade;
      s.tbladeCd = (s.tbladeCd == null ? T3.every : s.tbladeCd) - DT;
      if (s.tbladeCd <= 0) {
        s.tbladeCd = T3.every;
        skSfx('thousandblade');
        const p = s.player, power = avgGhostPower() * T3.power, sp = CONFIG.shot.speed;
        for (let i = 0; i < T3.count; i++) {
          const a = (i * Math.PI * 2) / T3.count;
          s.shots.push({ x: p.x, y: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.8 * s.zoom, owner: 'blade', idx: 0, src: s.dmgSrc, power, size: 3, target: null, reserved: 0, hit: new Set(), base: power, blast: 0, pierce: true });
        }
        s.shake = Math.max(s.shake, 4);
      }
    }
  }

  // ---- 衛星の道：子機の型 ----
  function updateDrones() {
    const D = SK.drone, lv = skLv('drone'), p = s.player;
    if (!lv) { s.drones = []; s.mother = false; return; }
    // 数をそろえる（母艦が出した子機は別に数える）
    const want = D.count[lv - 1] + (s.st.evo.drone ? D.squad : 0);
    const own = s.drones.filter((d) => !d.temp);
    while (own.length < want) { const d = { x: p.x, y: p.y, cd: 0, shotCd: 0 }; own.push(d); s.drones.push(d); }
    while (own.length > want) { const d = own.pop(); s.drones.splice(s.drones.indexOf(d), 1); }
    // 母艦：子機を出す（時間で消える）
    s.mother = skLv('mothership') > 0;
    if (s.mother) {
      s.motherCd = (s.motherCd == null ? SK.mothership.every : s.motherCd) - DT;
      if (s.motherCd <= 0) {
        s.motherCd = SK.mothership.every;
        skSfx('mothership');
        for (let i = 0; i < SK.mothership.count; i++) s.drones.push({ x: p.x, y: p.y - 40 * s.zoom, cd: 0, shotCd: 0, temp: SK.mothership.life });
      }
    }
    for (const d of s.drones) if (d.temp != null) d.temp -= DT;
    s.drones = s.drones.filter((d) => d.temp == null || d.temp > 0);
    const reach = D.reach * s.zoom, sp = D.speed * s.zoom, size = D.size * s.zoom;
    const gun = skLv('gundrone') > 0, ram = skLv('ramdrone') > 0;
    const nCol = skLv('collector') ? (s.st.evo.collector ? SK.collector.kiwamiCount : SK.collector.count) : 0;
    // 編隊：全機で同じ敵（本体に一番近い敵）
    const squadTarget = s.st.evo.drone ? nearestEnemy(p, reach) : null;
    s.drones.forEach((d, i) => {
      d.r = size;
      let tx, ty;
      d.role = i < nCol && !d.temp ? 'collect' : 'fight';
      if (d.role === 'collect') {
        // 回収機：飛んでいないかけらを拾いに行く
        let best = null, bd = Infinity;
        for (const k of s.pickups) { if (k.flying) continue; const dd = Math.hypot(k.x - d.x, k.y - d.y); if (dd < bd) { bd = dd; best = k; } }
        if (best) { tx = best.x; ty = best.y; if (bd < size + 6 * s.zoom) { best.flying = true; skSfx('collector'); } }
      } else {
        const t0 = (d.chase && d.chase.hp > 0 && Math.hypot(d.chase.x - p.x, d.chase.y - p.y) < reach * 1.3 ? d.chase : null) || squadTarget || nearestEnemy(d, reach);
        d.chase = t0;
        if (t0) {
          if (gun) {
            // 砲撃機：少し離れた所に止まって撃つ
            const a = Math.atan2(d.y - t0.y, d.x - t0.x), keep = SK.gundrone.keep * s.zoom;
            tx = t0.x + Math.cos(a) * keep; ty = t0.y + Math.sin(a) * keep;
            d.shotCd -= DT;
            if (d.shotCd <= 0 && Math.hypot(t0.x - d.x, t0.y - d.y) < keep * 1.6) {
              d.shotCd = SK.gundrone.every / s.st.rate;
              skSfx('gundrone');
              const power = bodyAtk() * D.power;
              fire(d, t0, 'player', 0, power);
              if (s.st.evo.gundrone) { const n0 = s.shots.length; fire(d, t0, 'player', 0, power); const sh = s.shots[n0]; if (sh) { const c = Math.cos(0.15), sn = Math.sin(0.15), vx = sh.vx, vy = sh.vy; sh.vx = vx * c - vy * sn; sh.vy = vx * sn + vy * c; } }
            }
          } else { tx = t0.x; ty = t0.y; }
        }
      }
      if (tx == null) {
        // 敵がいなければ本体のそばを回る
        const a = s.time * 1.5 + (i * Math.PI * 2) / Math.max(1, s.drones.length);
        tx = p.x + Math.cos(a) * p.r * 3; ty = p.y + Math.sin(a) * p.r * 3;
      }
      const dx = tx - d.x, dy = ty - d.y, dist = Math.hypot(dx, dy);
      if (dist > 0.5) { const m = Math.min(dist, sp * DT); d.x += dx / dist * m; d.y += dy / dist * m; d.a = Math.atan2(dy, dx); }
      // 体当たり
      if (d.role === 'fight' && !gun) {
        d.cd -= DT;
        if (d.cd <= 0) {
          for (const e of s.enemies) {
            if (e.hp <= 0 || Math.hypot(e.x - d.x, e.y - d.y) >= e.r + size) continue;
            damageEnemy(e, bodyAtk() * D.power * (ram ? SK.ramdrone.mult : 1)); addCombo();
            skSfx(ram ? 'ramdrone' : 'drone');
            sparks(e.x, e.y, 'white', 3, 150);
            if (ram) knock(e, e.x - d.x || 1, e.y - d.y, SK.ramdrone.push);
            // 極突撃機：突き抜けて、すぐ次の敵へ
            if (ram && s.st.evo.ramdrone) { d.cd = 0.05; d.chase = s.enemies.filter((o) => o !== e && o.hp > 0).sort((a2, b2) => Math.hypot(a2.x - d.x, a2.y - d.y) - Math.hypot(b2.x - d.x, b2.y - d.y))[0] || null; }
            else d.cd = D.again;
            break;
          }
        }
      }
    });
  }

  // ---- 衛星の道：盾衛星の型 ----
  function updateShieldSats() {
    const S2 = SK.shieldsat, lv = skLv('shieldsat'), p = s.player;
    if (!lv) { p.plates = null; p.sanctuary = 0; for (const g of s.ghosts) g.plates = null; return; }
    const size = S2.size * (1 + S2.per * (lv - 1)) * s.zoom;
    p.plateA = (p.plateA || 0) + S2.speed * DT;
    const R = p.r * S2.ring;
    const plates = [];
    for (let i = 0; i < S2.count; i++) { const a = p.plateA + (i * Math.PI * 2) / S2.count; plates.push({ x: p.x + Math.cos(a) * R, y: p.y + Math.sin(a) * R, a, r: size, owner: p }); }
    p.plates = plates;
    // 護衛：分身にも盾
    const all = plates.slice();
    for (const g of s.ghosts) {
      if (!skLv('escort')) { g.plates = null; continue; }
      const n = s.st.evo.escort ? SK.escort.kiwamiCount : SK.escort.count, gr = g.r + SK.escort.gap * s.zoom + size * 0.6;
      g.plates = [];
      for (let i = 0; i < n; i++) { const a = -p.plateA * 1.3 + (i * Math.PI * 2) / n; g.plates.push({ x: g.x + Math.cos(a) * gr, y: g.y + Math.sin(a) * gr, a, r: size * 0.8, owner: g }); }
      all.push(...g.plates);
    }
    // 盾に触れた敵の弾を消す（反射盾：跳ね返す／衝撃盾：衝撃波）
    for (const b of s.enemyShots) {
      if (b.life <= 0) continue;
      for (const pl of all) {
        if (Math.hypot(b.x - pl.x, b.y - pl.y) >= b.r + pl.r) continue;
        b.life = 0;
        skSfx(skLv('reflect') ? 'reflect' : skLv('shockshield') ? 'shockshield' : pl.owner !== p ? 'escort' : 'shieldsat');
        sparks(b.x, b.y, 'white', 4, 120);
        if (skLv('reflect')) {
          const t0 = nearestEnemy(b, Infinity);
          if (t0) {
            const n0 = s.shots.length;
            fire({ x: b.x, y: b.y }, t0, 'player', 0, bodyAtk() * SK.reflect.power, { pierce: !!s.st.evo.reflect });
          }
        }
        if (skLv('shockshield')) shockwave(b.x, b.y, SK.shockshield.radius * (s.st.evo.shockshield ? SK.shockshield.kiwamiMult : 1), bodyAtk() * SK.shockshield.power, 'white');
        break;
      }
    }
    // 城壁：盾の輪の内側に敵を入れない（本体に体当たりさせない）
    if (s.st.evo.shieldsat) {
      for (const e of s.enemies) {
        if (e.hp <= 0 || e.boss) continue;
        const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy), keep = Math.max(R, p.r + e.r + 2);
        if (d < keep && d > 0.01) { e.x = p.x + dx / d * keep; e.y = p.y + dy / d * keep; }
      }
    }
    // 聖域：本体のまわりの弾をすべて消す
    p.sanctuary = skLv('sanctuary') ? SK.sanctuary.radius * s.zoom : 0;
    if (p.sanctuary) for (const b of s.enemyShots) if (b.life > 0 && Math.hypot(b.x - p.x, b.y - p.y) < p.sanctuary) { b.life = 0; skSfx('sanctuary'); sparks(b.x, b.y, 'white', 2, 80); }
  }

  // ---- 現象の道：死神の型 ----
  // 即死させる（ボスには効かない）
  function reap(e) {
    if (e.boss || e.elite || e.hp <= 0) return false;   // ボスと中ボスは即死しない
    e.reaped = true;
    skSfx(skLv('soulreap') ? 'soulreap' : 'reaper');
    damageEnemy(e, e.hp + 1, true);
    e.hp = Math.min(e.hp, 0);
    ring(e.x, e.y, e.r, e.r * 3, 0.3, 'white', 0, 3);
    sparks(e.x, e.y, 'white', 8, 180);
    return true;
  }
  function reapRoll(e) {
    if (e.boss) return;
    const R2 = SK.reaper;
    const frac = e.hp / e.maxHp;
    // 極処刑：HPが少ない敵は必ず倒れる
    if (skLv('execute') && s.st.evo.execute && frac <= SK.execute.kiwamiLine) { skSfx('execute'); reapWith(e); return; }
    const ref = radiusOf(R2.refPower) * s.zoom;
    let chance = (R2.chance + R2.per * (skLv('reaper') - 1)) * clamp((ref / e.r) ** 2, R2.minMul, 1);
    if (skLv('execute')) chance *= frac <= 0.2 ? SK.execute.low : frac <= 0.5 ? SK.execute.half : 1;
    if (Math.random() < chance) { if (skLv('execute') && frac <= 0.5) skSfx('execute'); reapWith(e); }
  }
  // 即死させ、冥府なら近くの敵を1体道連れにする
  function reapWith(e) {
    if (!reap(e)) return;
    if (s.st.evo.reaper) {
      let best = null, bd = SK.reaper.hellReach * s.zoom;
      for (const o of s.enemies) { if (o === e || o.hp <= 0 || o.boss) continue; const d = Math.hypot(o.x - e.x, o.y - e.y); if (d < bd) { bd = d; best = o; } }
      if (best) { bolt(e.x, e.y, best.x, best.y, 0.2); reap(best); }
    }
  }
  function updateReaper() {
    if (!skLv('reaper')) { s.scythe = null; return; }
    // 死の宣告：一番HPが多い敵に印、時間がたつと必ず倒れる
    for (const e of s.enemies) if (e.doomT > 0 && e.hp > 0) { e.doomT -= DT; if (e.doomT <= 0) reapWith(e); }
    if (skLv('doom')) {
      s.doomCd = (s.doomCd == null ? SK.doom.every : s.doomCd) - DT;
      if (s.doomCd <= 0) {
        s.doomCd = SK.doom.every;
        const cands = s.enemies.filter((e) => e.hp > 0 && !e.boss && !e.elite && !(e.doomT > 0)).sort((a, b) => b.hp - a.hp);
        for (const e of cands.slice(0, s.st.evo.doom ? SK.doom.kiwamiCount : 1)) { e.doomT = SK.doom.time; skSfx('doom'); }
      }
    }
    // 大鎌：画面を横切る
    if (skLv('scythe')) {
      s.scytheCd = (s.scytheCd == null ? SK.scythe.every : s.scytheCd) - DT;
      if (s.scytheCd <= 0) {
        s.scytheCd = SK.scythe.every;
        skSfx('scythe');
        const H = SK.scythe.height * s.zoom;
        s.scythe = { t: 0, y: rand(H / 2, s.world.h - H / 2), h: H, dir: Math.random() < 0.5 ? 1 : -1, power: avgGhostPower() * SK.scythe.power, hit: new Set() };
      }
    }
    const sc = s.scythe;
    if (sc) {
      sc.t += DT;
      const k = sc.t / SK.scythe.time, W = s.world.w;
      sc.x = sc.dir > 0 ? -60 + (W + 120) * k : W + 60 - (W + 120) * k;
      for (const e of s.enemies) {
        if (e.hp <= 0 || sc.hit.has(e) || Math.abs(e.y - sc.y) > sc.h / 2 + e.r || Math.abs(e.x - sc.x) > 20 + e.r) continue;
        sc.hit.add(e);
        damageEnemy(e, sc.power); addCombo();
        sparks(e.x, e.y, 'white', 6, 220);
        if (e.hp > 0) reapRoll(e);
      }
      if (k >= 1) s.scythe = null;
    }
  }

  // ---- 現象の道：毒の型 ----
  const poisonCap = () => (s.st.evo.poison ? Infinity : SK.poison.cap);
  function addPoison(e, n) {
    const was = e.poisonN || 0;
    if (!(was > 0)) skSfx('poison');
    e.poisonN = Math.min(poisonCap(), was + n);
    if (skLv('corrode') && Math.floor(e.poisonN / 5) > Math.floor(was / 5)) skSfx('corrode');
    e.poisonT = SK.poison.time;
  }
  function updatePoison() {
    const per = avgGhostPower() * SK.poison.power * (1 + SK.poison.per * (skLv('poison') - 1));
    for (const e of s.enemies) {
      if (!(e.poisonN > 0)) { if (e.status && e.status.poison) e.status.poison = false; continue; }
      e.poisonT -= DT;
      if (e.poisonT <= 0) { e.poisonN = 0; if (e.status) e.status.poison = false; continue; }
      if (e.hp > 0 && skLv('poison')) damageEnemy(e, per * e.poisonN * DT, false, true);
      (e.status || (e.status = {})).poison = true;
    }
    for (const f of s.fogs) f.life -= DT;
    s.fogs = s.fogs.filter((f) => f.life > 0);
    if (!skLv('poison')) return;
    // 毒霧：分身が通った跡に霧を残す
    if (skLv('fog')) {
      const F2 = SK.fog, life = F2.life * (s.st.evo.fog ? F2.kiwamiMult : 1) * s.st.dur;
      for (const g of s.ghosts) {
        g.fogCd = (g.fogCd || 0) - DT;
        if (g.fogCd <= 0) { g.fogCd = F2.every; skSfx('miasma'); s.fogs.push({ x: g.x, y: g.y, life, max: life, r: F2.radius * s.st.area * s.zoom }); }
      }
      if (s.fogs.length > F2.max) s.fogs.splice(0, s.fogs.length - F2.max);
      for (const e of s.enemies) {
        if (e.hp <= 0 || (e.fogAt || -9) + F2.again > s.time) continue;
        for (const f of s.fogs) if (Math.hypot(e.x - f.x, e.y - f.y) < f.r + e.r) { addPoison(e, 1); e.fogAt = s.time; break; }
      }
    }
    // パンデミック：画面中の毒が一斉に2倍（上限をこえてもよい）
    if (skLv('pandemic')) {
      s.pandemicCd = (s.pandemicCd == null ? SK.pandemic.every : s.pandemicCd) - DT;
      if (s.pandemicCd <= 0) {
        s.pandemicCd = SK.pandemic.every;
        skSfx('pandemic');
        for (const e of s.enemies) if (e.poisonN > 0 && e.hp > 0) { e.poisonN *= 2; e.poisonT = SK.poison.time; sparks(e.x, e.y, 'white', 4, 120); }
      }
    }
  }

  // ---- 現象の道：重力の型 ----
  // 敵を点(x, y)へ、1秒に speed だけ寄せる（ボスは動かない）
  function drawTo(e, x, y, speed) {
    if (e.boss) return;
    const dx = x - e.x, dy = y - e.y, d = Math.hypot(dx, dy);
    if (d < 1) return;
    const m = Math.min(d, speed * s.zoom * DT);
    e.x += dx / d * m; e.y += dy / d * m;
  }
  function updateGravity() {
    for (const e of s.enemies) if (e.inPullT > 0) e.inPullT -= DT;
    s.pullCount = 0;
    for (const g of s.ghosts) g.pull = 0;
    for (const w of s.wells) w.life -= DT;
    s.wells = s.wells.filter((w) => w.life > 0);
    if (!skLv('pull')) { s.collapseT = 0; return; }
    const P2 = SK.pull, hole = !!s.st.evo.pull;
    // 引力：一番大きい分身へ吸い寄せる
    const g = s.big;
    if (g && s.ghosts.includes(g)) {
      const R = g.r + P2.reach * (hole ? P2.holeReach : 1) * s.st.area * s.zoom;
      g.pull = R;
      const spd = P2.speed * (1 + P2.per * (skLv('pull') - 1));
      for (const e of s.enemies) {
        if (e.hp <= 0) continue;
        const d = Math.hypot(e.x - g.x, e.y - g.y);
        if (d >= R + e.r) continue;
        if (!(e.inPullT > 0)) skSfx(skLv('compress') ? 'compress' : 'pull');
        e.inPullT = 0.1; s.pullCount++;
        if (d > g.r + e.r) drawTo(e, g.x, g.y, spd);
        // 特異点：中心近くの敵へ毎秒ダメージ
        if (hole && d < g.r + P2.core * s.zoom + e.r) damageEnemy(e, g.power * P2.corePower * DT, false, true);
      }
    }
    // 斥力：本体の近くの敵を押し返す
    if (skLv('repel')) {
      const p = s.player, R = p.r + SK.repel.reach * s.zoom;
      for (const e of s.enemies) {
        if (e.hp <= 0 || e.boss) continue;
        const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy);
        if (d >= R + e.r || d < 0.01) continue;
        if ((e.repelSfx || 0) <= s.time) { e.repelSfx = s.time + 1.5; skSfx('repel'); }
        const m = SK.repel.speed * s.zoom * DT;
        e.x += dx / d * m; e.y += dy / d * m;
        if (s.st.evo.repel) damageEnemy(e, avgGhostPower() * SK.repel.power * DT, false, true);
      }
      p.repel = R;
    } else s.player.repel = 0;
    // 重力弾の小さな引力
    for (const w of s.wells) {
      const R = SK.gravshot.radius * s.st.area * s.zoom, spd = SK.gravshot.speed * (s.st.evo.gravshot ? SK.gravshot.kiwamiMult : 1);
      w.r = R;
      for (const e of s.enemies) if (e.hp > 0 && Math.hypot(e.x - w.x, e.y - w.y) < R + e.r) drawTo(e, w.x, w.y, spd);
    }
    // 重力崩壊：画面中の敵が真ん中へ
    if (skLv('collapse')) {
      s.collapseCd = (s.collapseCd == null ? SK.collapse.every : s.collapseCd) - DT;
      if (s.collapseCd <= 0) { skSfx('collapse'); s.collapseCd = SK.collapse.every; s.collapseT = SK.collapse.time; s.shake = Math.max(s.shake, 5); }
      if (s.collapseT > 0) {
        s.collapseT -= DT;
        const cx = s.world.w / 2, cy = s.world.h / 2;
        for (const e of s.enemies) if (e.hp > 0) drawTo(e, cx, cy, SK.collapse.speed);
      }
    }
  }

  // ---- 炎の道 ----
  const flameDps = (g) => g.power * SK.flamepath.power * (1 + SK.flamepath.per * (skLv('flamepath') - 1));
  function igniteTrail(g) {
    const F2 = SK.flamepath, hell = s.st.evo.flamepath ? F2.hellMult : 1;
    const c = g.clip, gap = Math.max(1, Math.round(F2.gap * s.zoom));
    const pts = []; for (let i = 0; i < c.length; i += gap) pts.push({ x: c[i].x, y: c[i].y });
    const life = F2.life * hell * s.st.dur;
    const dps = flameDps(g);
    s.fires.push({ kind: 'path', pts, life, max: life, width: F2.width * hell * s.zoom, dps, idx: g.idx });
    skSfx('flamepath');
    // 火柱：大きく折れ曲がった場所
    if (skLv('pillar')) {
      const P2 = SK.pillar, L = P2.look; let last = null;
      for (let i = L; i < c.length - L; i++) {
        const a1 = Math.atan2(c[i].y - c[i - L].y, c[i].x - c[i - L].x), a2 = Math.atan2(c[i + L].y - c[i].y, c[i + L].x - c[i].x);
        let d = Math.abs(a2 - a1); if (d > Math.PI) d = Math.PI * 2 - d;
        if (d < P2.turn || (last && Math.hypot(c[i].x - last.x, c[i].y - last.y) < P2.gap * s.zoom)) continue;
        last = c[i];
        s.firePillars.push({ x: c[i].x, y: c[i].y, life, max: life, cd: 0, dmg: g.power * P2.power, idx: g.idx });
      }
    }
    // 火の海：軌跡が輪になったら、内側全体が燃える
    if (skLv('firesea')) {
      const a = c[0], b = c[c.length - 1];
      if (Math.hypot(a.x - b.x, a.y - b.y) < SK.firesea.close * s.zoom && c.length >= SK.firesea.minLen * s.zoom) {
        s.fires.push({ kind: 'sea', poly: pts, life, max: life, dps, idx: g.idx });
        skSfx('firesea');
      }
    }
  }
  function inPoly(poly, x, y) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  }
  function burn(e, dps) {
    if (!skLv('spread')) return;
    e.burnT = SK.spread.time * (s.st.evo.spread ? SK.spread.kiwamiMult : 1);
    e.burnDps = Math.max(e.burnDps || 0, dps * SK.spread.power);
  }
  function updateFires() {
    // 燃える軌跡と火の海
    for (const f of s.fires) {
      f.life -= DT;
      for (const e of s.enemies) {
        if (e.hp <= 0) continue;
        let touch = false;
        if (f.kind === 'sea') touch = inPoly(f.poly, e.x, e.y);
        else for (const p of f.pts) { if (Math.hypot(p.x - e.x, p.y - e.y) < e.r + f.width) { touch = true; break; } }
        if (!touch) continue;
        damageEnemy(e, f.dps * DT, false, true);
        burn(e, f.dps);
        if ((e.fireFx || 0) <= s.time) { sparks(e.x, e.y, 'white', 2, 90); e.fireFx = s.time + 0.25; }
      }
      // 残り火：炎の道が消えたら、跡に火の粉が残る
      if (f.life <= 0 && f.kind === 'path' && skLv('ember')) {
        const step = Math.max(1, Math.round(SK.ember.gap / SK.flamepath.gap));
        const life = SK.ember.life * (s.st.evo.ember ? SK.ember.kiwamiMult : 1) * s.st.dur;
        for (let i = 0; i < f.pts.length; i += step) s.embers.push({ x: f.pts[i].x, y: f.pts[i].y, life, max: life, dps: f.dps, idx: f.idx });
        skSfx('ember');
        if (s.embers.length > 300) s.embers.splice(0, s.embers.length - 300);
      }
    }
    s.fires = s.fires.filter((f) => f.life > 0);
    // 火の粉：踏んだ敵を燃やす（延焼がなくても、少しの間燃える）
    for (const em of s.embers) {
      em.life -= DT;
      for (const e of s.enemies) {
        if (e.hp > 0 && Math.hypot(e.x - em.x, e.y - em.y) < e.r + 4 * s.zoom) { e.burnT = Math.max(e.burnT || 0, SK.spread.time); e.burnDps = Math.max(e.burnDps || 0, em.dps * SK.spread.power); }
      }
    }
    s.embers = s.embers.filter((em) => em.life > 0);
    // 火柱
    for (const pl of s.firePillars) {
      pl.life -= DT; pl.cd -= DT;
      if (pl.cd <= 0 && pl.life > 0) {
        pl.cd = SK.pillar.every;
        skSfx('pillar');
        const R = SK.pillar.radius * (s.st.evo.pillar ? SK.pillar.kiwamiRadius : 1) * s.st.area * s.zoom;
        pl.r = R;
        for (const e of s.enemies) if (e.hp > 0 && Math.hypot(e.x - pl.x, e.y - pl.y) < R + e.r) { damageEnemy(e, pl.dmg); addCombo(); }
      }
    }
    s.firePillars = s.firePillars.filter((pl) => pl.life > 0);
    // 燃えている敵：燃え続け、近くの敵に燃え移る
    for (const e of s.enemies) {
      if (!(e.burnT > 0) || e.hp <= 0) { if (e.status && e.status.burn) e.status.burn = false; continue; }
      e.burnT -= DT;
      damageEnemy(e, e.burnDps * DT, false, true);
      (e.status || (e.status = {})).burn = e.burnT > 0;
      if (skLv('spread')) {
        const R = SK.spread.reach * s.zoom;
        for (const o of s.enemies) {
          if (o !== e && o.hp > 0 && !(o.burnT > 0) && Math.hypot(o.x - e.x, o.y - e.y) < R + o.r) { o.burnT = e.burnT; o.burnDps = e.burnDps; skSfx('spread'); }
        }
      }
    }
  }

  // 地雷の爆発。keep：暴発（消えずに残る）
  function mineBlast(tr, keep = false) {
    let R = SK.mine.radius;
    if (skLv('timebomb')) R *= SK.timebomb.radiusMul;
    if (skLv('sticky') && s.st.evo.sticky) R *= SK.sticky.kiwamiRadius;
    const dmg = tr.dmg * (skLv('timebomb') && s.st.evo.timebomb ? SK.timebomb.kiwamiMult : 1);
    explode(tr.x, tr.y, R, dmg, tr.idx, null);
    s.shake = Math.max(s.shake, 4);
    skSfx(keep ? 'misfire' : skLv('timebomb') ? 'timebomb' : skLv('sticky') ? 'sticky' : 'mine');
    if (!keep) { tr.hits = 0; tr.stuck = null; }
    // 連鎖爆雷：爆発に巻き込まれた近くの地雷も、少しして誘爆する
    if (s.st.evo.mine) {
      const RR = R * s.st.area * s.zoom;
      for (const o of s.traps) if (o !== tr && o.kind === 'mine' && o.hits > 0 && !(o.fuse <= SK.mine.chainDelay) && Math.hypot(o.x - tr.x, o.y - tr.y) < RR) o.fuse = SK.mine.chainDelay;
    }
  }
  function updateMines() {
    const reach = SK.trap.reach * s.zoom;
    const mines = s.traps.filter((tr) => tr.kind === 'mine' && tr.hits > 0);
    for (const tr of mines) {
      tr.life -= DT;
      // 吸着地雷：くっついた敵と一緒に動く
      if (tr.stuck) { if (tr.stuck.hp > 0) { tr.x = tr.stuck.x; tr.y = tr.stuck.y; } }
      if (tr.fuse != null) { tr.fuse -= DT; if (tr.fuse <= 0) { tr.fuse = null; mineBlast(tr); continue; } }
      if (tr.life <= 0) { tr.hits = 0; continue; }
      if (tr.stuck) continue;
      for (const e of s.enemies) {
        if (e.hp <= 0 || Math.hypot(e.x - tr.x, e.y - tr.y) >= e.r + reach) continue;
        if (skLv('sticky')) { tr.stuck = e; tr.fuse = SK.sticky.delay; tr.life = Math.max(tr.life, SK.sticky.delay + 0.1); }
        else mineBlast(tr);
        break;
      }
    }
    // 暴発：置いてある地雷が、ときどき勝手に爆発する（消えずに残る）
    if (skLv('mine') && skLv('misfire')) {
      s.misfireCd = (s.misfireCd == null ? SK.misfire.every : s.misfireCd) - DT;
      if (s.misfireCd <= 0) {
        s.misfireCd = SK.misfire.every;
        const idle = s.traps.filter((tr) => tr.kind === 'mine' && tr.hits > 0 && !tr.stuck);
        if (idle.length) mineBlast(idle[Math.floor(Math.random() * idle.length)], true);
      }
    }
  }

  // 線分 a→b と点の距離
  function segDist(ax, ay, bx, by, x, y) {
    const vx = bx - ax, vy = by - ay, L = vx * vx + vy * vy;
    const k = L > 0 ? clamp(((x - ax) * vx + (y - ay) * vy) / L, 0, 1) : 0;
    return Math.hypot(ax + vx * k - x, ay + vy * k - y);
  }
  // 疾風の型：疾走・残像斬り・突風・身軽・瞬身
  function updateDash() {
    const p = s.player;
    const D = BS.dash, wind = !!s.st.evo.dash;
    // 疾走：動いている間、通った跡を残す。跡に触れた敵を切る（風神：竜巻として長く残り、引き寄せる）
    s.cuts = s.cuts || [];
    for (const c of s.cuts) c.life -= DT;
    s.cuts = s.cuts.filter((c) => c.life > 0);
    if (skLv('dash')) {
      if (p.moving && p.lastCut) s.cuts.push({ x0: p.lastCut.x, y0: p.lastCut.y, x1: p.x, y1: p.y, life: wind ? D.windLife : D.life, max: wind ? D.windLife : D.life, wind });
      p.lastCut = p.moving ? { x: p.x, y: p.y } : null;
      const w = (wind ? D.windWidth : D.width) * s.zoom;
      for (const e of s.enemies) {
        if (e.hp <= 0) continue;
        for (const c of s.cuts) {
          const d = segDist(c.x0, c.y0, c.x1, c.y1, e.x, e.y);
          if (d >= e.r + w) continue;
          if ((e.cutHit || 0) <= s.time) { skSfx('dash'); damageEnemy(e, bodyAtk() * D.power); addCombo(); e.cutHit = s.time + D.again; sparks(e.x, e.y, 'player', 3, 140); }
          if (c.wind && !e.boss) { const mx = (c.x0 + c.x1) / 2, my = (c.y0 + c.y1) / 2; knock(e, mx - e.x, my - e.y, D.pull * DT * 6); }
          break;
        }
      }
    } else p.lastCut = null;
    // 残像斬り：動いている間、一定の間隔で残像が残り、少しして周りを切る
    s.slashes = s.slashes || [];
    if (skLv('afterslash')) {
      const A = BS.afterslash;
      p.slashCd = (p.slashCd == null ? A.every : p.slashCd) - DT;
      if (p.moving && p.slashCd <= 0) {
        p.slashCd = A.every;
        s.slashes.push({ x: p.x, y: p.y, t: A.delay, life: A.delay + 0.25, dir: p.dir });
        if (s.st.evo.afterslash && p.prevPos) s.slashes.push({ x: p.prevPos.x, y: p.prevPos.y, t: A.delay, life: A.delay + 0.25, dir: p.dir });
      }
      for (const sl of s.slashes) {
        sl.t -= DT; sl.life -= DT;
        if (sl.t <= 0 && !sl.done) {
          sl.done = true;
          skSfx('afterslash');
          const R = A.radius * s.st.area * s.zoom;
          for (const e of s.enemies) if (e.hp > 0 && Math.hypot(e.x - sl.x, e.y - sl.y) < R + e.r) { damageEnemy(e, bodyAtk() * A.power); addCombo(); sparks(e.x, e.y, 'player', 4, 160); }
        }
      }
    } else for (const sl of s.slashes) sl.life -= DT;
    s.slashes = s.slashes.filter((sl) => sl.life > 0);
    // 少し前の位置（2体目の残像の場所）
    p.posLog = p.posLog || [];
    p.posLog.push({ x: p.x, y: p.y });
    if (p.posLog.length > 15) p.posLog.shift();
    p.prevPos = p.posLog[0];
    // 突風：止まった状態から動き出す瞬間、まわりを吹き飛ばす
    if (skLv('gust') && p.started && (p.gustAt || -9) + BS.gust.again <= s.time) {
      const G2 = BS.gust;
      p.gustAt = s.time;
      skSfx('gust');
      const R = G2.radius * (s.st.evo.gust ? G2.kiwamiRadius : 1) * s.st.area * s.zoom;
      ring(p.x, p.y, p.r, R, 0.3, 'white', 0, 4);
      sparks(p.x, p.y, 'white', 12, 260);
      for (const e of s.enemies) {
        if (e.hp <= 0) continue;
        const dx = e.x - p.x, dy = e.y - p.y;
        if (Math.hypot(dx, dy) < R + e.r) { damageEnemy(e, bodyAtk() * G2.power); addCombo(); knock(e, dx || 1, dy, G2.push); }
      }
    }
    // 瞬身：止まった状態から動き出す瞬間、進む向きへ瞬間移動して、通り道の敵を切り裂く
    if (skLv('blink') && p.started && (p.blinkAt == null || p.blinkAt + BS.blink.every <= s.time)) {
      const B2 = BS.blink;
      p.blinkAt = s.time;
      skSfx('blink');
      const x0 = p.x, y0 = p.y, m = p.r + 2;
      const x1 = clamp(p.x + Math.cos(p.dir) * B2.dist * s.zoom, m, s.world.w - m), y1 = clamp(p.y + Math.sin(p.dir) * B2.dist * s.zoom, m, s.world.h - m);
      p.x = x1; p.y = y1; p.tx += x1 - x0; p.ty += y1 - y0;
      p.lastCut = null;
      s.blinks = s.blinks || [];
      s.blinks.push({ x0, y0, x1, y1, life: 0.25, max: 0.25 });
      flash(x1, y1, p.r * 3, 0.12, 'player');
      const w = B2.width * s.zoom;
      for (const e of s.enemies) {
        if (e.hp > 0 && segDist(x0, y0, x1, y1, e.x, e.y) < e.r + w) { damageEnemy(e, bodyAtk() * B2.power); addCombo(); sparks(e.x, e.y, 'player', 8, 240); }
      }
      s.hitstop = Math.max(s.hitstop, 0.03);
    }
    if (s.blinks) { for (const b of s.blinks) b.life -= DT; s.blinks = s.blinks.filter((b) => b.life > 0); }
  }
  function updateBody() {
    const p = s.player;
    if (s.over) return;
    by('shoot', updateShoot);
    by('dash', updateDash);
    by('trap', updateTraps);
    s.dmgSrc = 'body';
    // 闘気：膜に触れている敵へ毎秒ダメージ（極：はじき飛ばす）
    if (p.aura > 0) {
      const dps = bodyAtk() * (BS.aura.base + BS.aura.per * (skLv('aura') - 1));
      for (const e of s.enemies) {
        if (e.hp <= 0) continue;
        const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy);
        if (d >= p.aura + e.r) continue;
        damageEnemy(e, dps * DT, false, true);
        if ((e.auraFx || 0) <= s.time) { skSfx('aura'); sparks(e.x, e.y, 'player', 2, 110); e.auraFx = s.time + 0.2; }
        if (p.auraKw && d > 0) knock(e, dx, dy, BS.aura.push * DT * 6);
      }
    }
    // 鬼神：無敵の間、触れた敵を一掃
    if (p.demonT > 0) {
      const reach = (p.aura || p.r * 1.6) * BS.demon.reach * 0.6;
      for (const e of s.enemies) {
        if (e.hp <= 0 || (e.demonHit || 0) > s.time) continue;
        if (Math.hypot(e.x - p.x, e.y - p.y) < reach + e.r) {
          damageEnemy(e, bodyAtk() * BS.demon.power);
          e.demonHit = s.time + BS.demon.again;
          burst(e.x, e.y, 'player', 6, 200);
        }
      }
    }
    // 突撃：動いている間、ぶつかった敵に大ダメージ
    const lv = skLv('charge');
    if (lv && p.charge != null) {
      for (const e of s.enemies) {
        if (e.hp <= 0 || (e.chargeHit || 0) > s.time) continue;
        const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy);
        if (d >= e.r + p.r) continue;
        // 連打：続けてぶつかるほど強く
        let mul = 1;
        if (skLv('rush')) {
          mul = 1 + (p.rushN || 0) * BS.rush.per[skLv('rush') - 1];
          p.rushN = Math.min(rushMax(), (p.rushN || 0) + 1);
          p.rushT = BS.rush.keep;
        }
        const dmg = bodyAtk() * BS.charge.mult[lv - 1] * mul;
        damageEnemy(e, dmg);
        addCombo();
        e.chargeHit = s.time + BS.charge.again;
        skSfx(skLv('heavyfist') ? 'heavyfist' : skLv('rush') ? 'rush' : 'charge');
        s.hitstop = Math.max(s.hitstop, 0.03);
        s.shake = Math.max(s.shake, 3);
        sparks(e.x, e.y, 'player', 8, 240);
        const king = s.st.evo.charge;
        knock(e, dx || Math.cos(p.dir), dy || Math.sin(p.dir), king ? BS.charge.kingPush : BS.charge.push);
        // 覇王：まわりの敵も巻き込んで吹き飛ばす
        if (king) {
          const R = BS.charge.kingRadius * s.st.area * s.zoom;
          ring(e.x, e.y, e.r, R, 0.25, 'player', 0, 3);
          for (const o of s.enemies) {
            if (o === e || o.hp <= 0) continue;
            const ox = o.x - e.x, oy = o.y - e.y;
            if (Math.hypot(ox, oy) < R + o.r) { damageEnemy(o, dmg * BS.charge.kingPower); knock(o, ox || 1, oy, BS.charge.kingPush * 0.6); }
          }
        }
        // 重拳：ぶつかった場所に衝撃波
        if (skLv('heavyfist')) {
          const k = BS.heavyfist;
          shockwave(e.x, e.y, k.radius[skLv('heavyfist') - 1] * (s.st.evo.heavyfist ? k.kiwamiRadius : 1), dmg * k.power, 'player');
        }
      }
    }
  }

  function updateHp() {
    // 生命力：最大HP↑／過剰回復：回復しすぎた分で最大HPが増えていく
    const vit = skLv('vitality') ? (s.st.evo.vitality ? SK.vitality.kiwamiHp : SK.vitality.hp) : 0;
    s.maxHp = Math.round(s.st.maxHp * (1 + vit) * (1 + (skLv('overheal') ? s.hpBonus : 0)));
    s.hp = Math.min(s.hp, s.maxHp);
    s.sinceHurt += DT;
    // 被弾から少したつと、毎秒「最大HPの○%」ずつ回復（死神の契約では回復しない。生命力で早く始まる）
    const delay = T.regenDelay.value * (skLv('vitality') ? SK.vitality.regen : 1);
    const wasRegen = s.regenerating;
    s.regenerating = !s.st.curse.reaper && s.sinceHurt >= delay && s.hp < s.maxHp;
    if (s.regenerating) s.hp = Math.min(s.maxHp, s.hp + s.maxHp * (T.regenRate.value / 100) * DT);
    if (s.regenerating && !wasRegen && skLv('vitality')) skSfx('vitality');
  }

  // ---------- 軌跡と分身 ----------
  function usedLength() {
    let sum = 0;
    for (const g of s.ghosts) if (!g.echo) sum += g.len;   // 千の影の写しは数えない
    return sum;
  }

  // 一番古い分身を押し出す。ラストスタンドがあれば、消えずにしばらく戦い続ける
  function evictOldest(fx = true) {
    const old = s.ghosts.shift();
    // 置き土産：押し出された分身の場所に、光の罠が残る
    if (skLv('keepsake')) placeTrap(old.x, old.y, 'light', old.power * SK.keepsake.power * (1 + SK.keepsake.per * (skLv('keepsake') - 1)), old.idx);
    // 仕込み：押し出された分身の場所に、強い地雷
    if (skLv('mine') && skLv('rig')) skSfx('rig');
    if (skLv('mine') && skLv('rig')) placeTrap(old.x, old.y, 'mine', old.power * SK.rig.power * (s.st.evo.rig ? SK.rig.kiwamiMult : 1), old.idx);
    // 千の影：写しも一緒に押し出す
    const echoes = s.ghosts.filter((g) => g.echoOf === old);
    if (echoes.length) s.ghosts = s.ghosts.filter((g) => g.echoOf !== old);
    for (const g of echoes) { burst(g.x, g.y, 'ghost', 8, 120, g.idx); }
    splitGhost(old);
    if (s.st.lastStand) {
      old.fade = BN.lastStand.time;
      s.fading.push(old);
      ring(old.x, old.y, old.r, old.r + 24, 0.3, 'ghost', old.idx, 2);
      return;
    }
    if (fx) {
      burst(old.x, old.y, 'ghost', 12, 140, old.idx);
      ring(old.x, old.y, old.r, old.r + 30, 0.3, 'ghost', old.idx, 2);
    }
  }

  // おとり：分身がダメージを受ける（from：攻撃してきた敵。反撃で返す）
  function hurtGhost(g, amount, from) {
    if (!skLv('decoy') || g.dead) return;
    g.lost = (g.lost || 0) + amount;
    g.hurtT = 0.1;
    burst(g.x, g.y, 'ghost', 4, 120, g.idx);
    skSfx('decoy');
    // 反撃：受けたダメージを、攻撃してきた敵に返す（極：まわりにも衝撃波）
    const cl = skLv('counter');
    if (cl && from && from.hp > 0) {
      const back = amount * SK.counter.ratio[cl - 1];
      skSfx('counter');
      damageEnemy(from, back);
      s.lasers.push({ x1: g.x, y1: g.y, x2: from.x, y2: from.y, w: 1.6, life: 0.12, max: 0.12, idx: g.idx });
      ring(from.x, from.y, 4, from.r + 12, 0.25, 'ghost', g.idx, 2);
      if (s.st.evo.counter) shockwave(from.x, from.y, SK.counter.burst, back * SK.counter.burstPower, 'ghost', g.idx);
    }
    ghostPower(g);
    if (g.hp > 0) return;
    // 不落：一番大きい分身は、HPが1で止まる
    if (s.st.sk.fortress && g === s.big) { skSfx('fortress'); g.lost = g.maxHp - 1; ghostPower(g); return; }
    breakGhost(g);
  }

  // HPが0になった分身が壊れる（身代わり：その場に大きな衝撃波）
  function breakGhost(g) {
    g.dead = true;
    s.ghosts = s.ghosts.filter((x) => x !== g);
    burst(g.x, g.y, 'ghost', 16, 180, g.idx);
    ring(g.x, g.y, g.r, g.r + 34, 0.35, 'ghost', g.idx, 3);
    if (s.st.evo.decoy) shockwave(g.x, g.y, SK.decoy.burst, g.power * SK.decoy.burstPower, 'ghost', g.idx);
    if (s.big === g) pickBig();
  }

  // 敵が狙う相手：引きつける範囲に入っていれば、一番近いおとりの分身。そうでなければ本体
  function targetOf(e) {
    e.lured = false;
    if (!skLv('decoy')) return s.player;
    let best = null, bd = Infinity;
    for (const g of s.ghosts) {
      if (!g.taunt) continue;
      const d = Math.hypot(g.x - e.x, g.y - e.y);
      if (d < g.taunt + e.r && d < bd) { bd = d; best = g; }
    }
    if (!best) return s.player;
    e.lured = true;
    return best;
  }

  // 分裂：押し出された分身の軌跡を等分して、小さな分身にする（しばらく戦って消える）
  function splitGhost(old) {
    const lv = skLv('split');
    if (!lv || old.split != null) return;
    const n = s.st.evo.split ? SK.split.kiwamiCount : SK.split.count;
    const per = Math.floor((old.clip.length - 1) / n);
    if (per < 2) return;
    const life = SK.split.life[lv - 1];
    for (let i = 0; i < n; i++) {
      const clip = old.clip.slice(i * per, (i + 1) * per + 1);
      const g = {
        clip, len: clip.length - 1, dist: 0, idx: old.idx, power: 0, r: 4,
        x: clip[0].x, y: clip[0].y, life: 1, fireCd: rand(0, 0.3), trail: [], spawnGlow: 0,
        full: false, age: 0, dir: 1, fade: life, fadeMax: life, split: 1,
      };
      s.splits.push(g);
      ring(g.x, g.y, 4, 18, 0.25, 'ghost', g.idx, 2);
    }
    skSfx('split');
  }

  // 群れ：分身1体ごとに攻撃速度が上がる／レギオン：攻撃力も上がる（分裂した小さい分身も数える）
  const ghostNum = () => s.ghosts.length + s.splits.length;
  const swarmMul = () => {
    const lv = skLv('swarm');
    return lv ? 1 + (SK.swarm.per + SK.swarm.perLv * (lv - 1)) * ghostNum() : 1;
  };
  const legionMul = () => (s.st.evo.swarm ? 1 + SK.swarm.legion * ghostNum() : 1);
  // 固定砲台：分身は動かず、動く速さの倍率がそのまま攻撃速度になる（要塞：攻撃力にもなる）
  const turretOn = () => skLv('turret') > 0;
  const turretRate = () => (turretOn() ? s.st.ghostSpeed * (1 + SK.turret.per * skLv('turret')) : 1);

  // 分身の弾の性質（一番大きい分身だけ、重砲の爆発とタイタンの貫通が付く）
  function ghostShotOpts(g) {
    if (g !== s.big) return {};
    const lv = skLv('cannon');
    const blast = lv ? (SK.cannon.radius + SK.cannon.radiusPer * (lv - 1)) * (s.st.evo.cannon ? SK.cannon.kiwamiRadius : 1) : 0;
    return { blast, pierce: titanOn() };
  }

  // 分身の1回の攻撃：ふつうの弾／レーザー／散弾
  function ghostFire(g, target, power) {
    sfx(skLv('laser') ? 'sk_laser' : skLv('shotgun') ? 'sk_shotgun' : turretOn() ? 'sk_turret' : 'shot', rand(0.92, 1.08));
    if (skLv('laser')) { fireLaser(g, target, power); return; }
    const lv = skLv('shotgun');
    if (!lv) { fire(g, target, 'ghost', g.idx, power, ghostShotOpts(g)); return; }
    // 散弾：真ん中の1発を狙って撃ち、左右に角度をずらした弾を足す
    const n = SK.shotgun.pellets[lv - 1];
    const each = power * SK.shotgun.power;
    const before = s.shots.length;
    fire(g, target, 'ghost', g.idx, each, ghostShotOpts(g));
    const mid = s.shots[before];
    if (!mid) return;
    const passes = s.st.evo.shotgun ? 1 : 0;
    mid.passes = passes;
    const a0 = Math.atan2(mid.vy, mid.vx), sp = Math.hypot(mid.vx, mid.vy);
    for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2) * SK.shotgun.gap;
      if (Math.abs(off) < 1e-6) continue;
      s.shots.push({ ...mid, vx: Math.cos(a0 + off) * sp, vy: Math.sin(a0 + off) * sp, target: null, reserved: 0, hit: new Set(), passes });
      s.stats.shots++;
    }
  }

  // レーザー：画面の端まで届く光。並んだ敵すべてに当たる（盾持ちの正面は盾が受ける）
  function fireLaser(g, target, power) {
    s.stats.shots++;
    if (s.st.crit > 0 && Math.random() < BN.crit.chance + BN.crit.add * (s.st.crit - 1)) power *= BN.crit.mult;
    let a;
    if (s.st.curse.trigger) a = rand(0, Math.PI * 2);
    else { const aim = leadPoint(g, target); a = Math.atan2(aim.y - g.y, aim.x - g.x); }
    const dx = Math.cos(a), dy = Math.sin(a);
    // 画面の端までの長さ
    const W = s.world.w, H = s.world.h;
    const tx = dx > 0 ? (W - g.x) / dx : dx < 0 ? -g.x / dx : Infinity;
    const ty = dy > 0 ? (H - g.y) / dy : dy < 0 ? -g.y / dy : Infinity;
    const len = Math.max(0, Math.min(tx, ty));
    const half = SK.laser.width * (s.st.evo.laser ? SK.laser.kiwamiWidth : 1) * s.zoom;
    const lv = skLv('laser');
    const dmg = power * (SK.laser.base + SK.laser.per * (lv - 1));
    let hitAny = false;
    for (const e of s.enemies) {
      if (e.hp <= 0) continue;
      const rx = e.x - g.x, ry = e.y - g.y;
      const along = rx * dx + ry * dy;
      if (along < 0 || along > len + e.r) continue;
      if (Math.abs(rx * dy - ry * dx) > half + e.r) continue;
      hitAny = true;
      const beam = { x: e.x, y: e.y, vx: dx, vy: dy, power: dmg, pierce: false };
      if (blockByShield(e, beam)) continue;
      const mul = focusMul(e) * markMul(e) * lureMul(e);
      damageEnemy(e, beam.power * mul, true);
      addCombo();
      hitByGhost(e);
    }
    if (hitAny) s.stats.hits++;
    s.lasers.push({ x1: g.x, y1: g.y, x2: g.x + dx * len, y2: g.y + dy * len, w: half, life: SK.laser.life, max: SK.laser.life, idx: g.idx });
  }

  // 一斉射撃：全分身が、近い敵から順に狙って撃つ（Lvで1体あたりの弾数が増える）
  //   撃ったら待ち時間（Lvで短くなる）の間は撃てない（描きまくって連射できないように）
  function volley() {
    const lv = skLv('volley');
    if (!lv || s.volleyCd > 0) return;
    s.volleyWait = SK.volley.wait[lv - 1];
    s.volleyCd = s.volleyWait;
    skSfx('volley');
    const n = SK.volley.shots[lv - 1];
    for (const g of s.ghosts) {
      const near = s.enemies
        .filter((e) => e.hp > 0 && dist(e, g) < range())
        .sort((a, b) => dist(a, g) - dist(b, g));
      if (!near.length) continue;
      for (let i = 0; i < n; i++) ghostFire(g, near[i % near.length], g.power * SK.volley.power);
      ring(g.x, g.y, g.r, g.r + 14, 0.2, 'ghost', g.idx, 2);
    }
  }

  function finishStroke(atLimit = false) {
    let born = null;
    const r = s.record;
    const cu = s.st.curse;
    // 失われた影：分身にならない／呪われた筆：上限まで描いたときだけ分身になる
    const allowed = !cu.lost && (!cu.brush || atLimit);
    if (!allowed && r.length >= CONFIG.record.minStroke && r.path.length > 1) {
      const end = r.path[r.path.length - 1];
      ring(end.x, end.y, 4, 26, 0.25, 'white', 0, 2);   // 軌跡は消えるだけ
    }
    if (allowed && r.length >= CONFIG.record.minStroke && r.path.length > 1) {
      const idx = s.ghostCount++;
      const clip = resample(r.path);
      const len = clip.length - 1;
      // 軌跡の総量を超える分だけ、古い分身から押し出す（孤独な王：前の分身はすべて押し出す）
      while (s.ghosts.length && (cu.lonely || usedLength() + len > budgetNow())) evictOldest();
      const main = {
        clip, len, dist: 0, idx, power: 0, r: 4,
        x: clip[0].x, y: clip[0].y,
        life: 1, fireCd: rand(0, 0.3), trail: [], spawnGlow: 0,
        full: atLimit,       // フルチャージ用：上限まで描いた分身か
        age: 0, dir: 1,      // 死の砂時計用の経過時間／ターンバースト用の向き
      };
      s.ghosts.push(main);
      ghostSpawnFx(main);
      born = main;
      sfx('born');
      { let n = 0; for (const id of ['gigant', 'giant', 'awe', 'swarm', 'taunt']) { if (n < 2 && skLv(id) && !(id === 'giant' && skLv('gigant'))) { skSfx(id); n++; } } }
      // 千の影：同じ軌跡を、間をあけて往復する写しが生まれる（軌跡の総量は1本分）
      if (s.st.sk.thousand) {
        skSfx('thousand');
        const n = SK.thousand.count;
        // 間をあけて同じ向きに並び、列になって往復する（先頭が折り返すと、すれ違って戻る）
        for (let k = 1; k < n; k++) {
          const d = Math.floor((len * k) / n);
          const pos = clip[d];
          const echo = { ...main, dist: d, x: pos.x, y: pos.y, trail: [], fireCd: rand(0, 0.3), echo: true, echoOf: main };
          s.ghosts.push(echo);
          ghostSpawnFx(echo);
        }
      }
    }
    if (r.length >= CONFIG.record.minStroke && r.path.length > 1) {
      pickBig();
      for (const g of s.ghosts) ghostPower(g);   // 生まれたばかりの分身の攻撃力を先に決める
      volley();
      // マキビシ：軌跡の線の上に、一定の間隔でまく
      // 地雷：軌跡の始めと終わりに置く
      if (born && skLv('mine')) {
        const c = born.clip, dmg = born.power * SK.mine.power * (1 + SK.mine.per * (skLv('mine') - 1));
        placeTrap(c[0].x, c[0].y, 'mine', dmg, born.idx);
        placeTrap(c[c.length - 1].x, c[c.length - 1].y, 'mine', dmg, born.idx);
      }
      if (born && skLv('flamepath')) igniteTrail(born);
      if (born && skLv('caltrop')) {
        const gap = Math.max(1, Math.round(SK.caltrop.gap * s.zoom));
        for (let i = Math.floor(gap / 2); i < born.clip.length; i += gap) placeTrap(born.clip[i].x, born.clip[i].y, 'spike', spikePower(born), born.idx);
      }
    }
    r.active = false;
    r.path = [];
    r.length = 0;
  }

  function updateRecord(held) {
    const r = s.record;
    const p = s.player;
    const limit = dragLimitNow();
    // 押した瞬間：追従のときは、本体が指の位置へ追いつくまで軌跡を描き始めない
    if (held && !s.wasHeld) {
      p.catching = X.control.value === 'follow';
      // 相対：触れた場所が基準。押し直したときに、前に残っていた行き先を捨てる（本体が飛んでいかない）
      if (X.control.value !== 'follow') { p.tx = p.x; p.ty = p.y; }
    }
    s.wasHeld = held;

    if (held && !r.active && !p.catching) {
      r.active = true;
      sfx('draw');
      r.path = [{ x: p.x, y: p.y }];
      r.length = 0;
      if (s.st.evo.volley) volley();   // 極一斉射撃：描き始めにも撃つ
    } else if (r.active) {
      const prev = r.path[r.path.length - 1];
      r.length += Math.hypot(p.x - prev.x, p.y - prev.y);
      r.path.push({ x: p.x, y: p.y });
      if (r.length >= limit) {
        // 描ける長さの限界：その場で分身を生み、指が触れたままなら次の軌跡を描き続ける
        finishStroke(true);
        if (held) {
          r.active = true;
          r.path = [{ x: p.x, y: p.y }];
          r.length = 0;
        }
      } else if (!held) {
        finishStroke();
      }
    }
    r.progress = r.active ? Math.min(1, r.length / limit) : 0;
    r.minLength = CONFIG.record.minStroke;
    r.enough = r.active && r.length >= CONFIG.record.minStroke && !s.st.curse.lost && !s.st.curse.brush;
  }

  // 記録した軌跡を、一定の速さで行ったり来たりさせる
  // 分身の攻撃力と大きさ
  function ghostPower(g) {
    g.power = (g.len / G.powerUnit) * s.st.ghostAttack * (g.full && s.st.fullCharge ? BN.fullCharge.mult : 1);
    // 巨大化：一番大きい分身が強くなる。タイタン：分身が1体だけのとき、さらに2倍
    if (g === s.big) g.power *= (1 + SK.giant.per * skLv('giant')) * (titanOn() ? SK.giant.titanMult : 1);
    g.power *= legionMul();
    if (s.st.evo.turret) g.power *= s.st.ghostSpeed;
    g.r = radiusOf(g.power) * G.sizeMul;
    // おとり：分身がHPを持つ（最大HPは攻撃力に比例。受けたダメージ g.lost を引いた残りが今のHP）
    const dl = skLv('decoy');
    if (dl) {
      g.maxHp = g.power * SK.decoy.hpPerPower * (1 + SK.decoy.per * (dl - 1));
      g.hp = Math.max(0, g.maxHp - (g.lost || 0));
      g.taunt = g.split == null && g.fade == null ? g.r + SK.decoy.reach * (1 + SK.taunt.per * skLv('taunt')) * s.st.area * s.zoom : 0;
    } else { g.maxHp = 0; g.taunt = 0; }
  }

  function moveGhost(g, advance) {
    ghostPower(g);
    // 固定砲台：その場に留まる。ターンバーストは、本来折り返すはずだった間隔でその場に出す
    if (turretOn()) {
      g.trail.length = 0;
      g.leg = (g.leg || 0) + advance;
      if (g.leg >= g.len) {
        g.leg -= g.len;
        if (s.st.turnBurst) shockwave(g.x, g.y, BN.turnBurst.radius, g.power * BN.turnBurst.ofPower, 'ghost', g.idx);
      }
      return;
    }
    const len = g.clip.length;
    const period = 2 * (len - 1);
    g.dist = (g.dist + advance) % period;
    const m = Math.floor(g.dist);
    const dir = m < len - 1 ? 1 : -1;
    const pos = g.clip[m < len ? m : period - m];
    g.trail.unshift({ x: g.x, y: g.y });
    if (g.trail.length > 5) g.trail.pop();
    g.x = pos.x; g.y = pos.y;
    // ターンバースト：折り返すときに衝撃波
    if (dir !== g.dir) {
      g.dir = dir;
      if (s.st.turnBurst) shockwave(g.x, g.y, BN.turnBurst.radius, g.power * BN.turnBurst.ofPower, 'ghost', g.idx);
    }
  }

  // 一番大きい分身（軌跡がいちばん長いもの。同じなら新しいほう）
  function pickBig() {
    let big = null;
    for (const g of s.ghosts) if (!g.echo && (!big || g.len >= big.len)) big = g;
    s.big = big;
  }

  // 威圧が届く広さ（分身のふちから）
  function aweReach(g) {
    const lv = skLv('awe');
    if (!lv || g !== s.big) return 0;
    return g.r + (SK.awe.reach + SK.awe.reachPer * (lv - 1)) * s.st.area * s.zoom * (s.st.evo.awe ? SK.awe.kiwamiReach : 1);
  }

  function updateGhosts() {
    s.ghostAttack = X.ghostAttack.value;
    const budget = budgetNow();
    s.budget = budget;

    while (s.ghosts.length && usedLength() > budget) evictOldest();

    pickBig();
    const advance = T.ghostSpeed.value * s.st.ghostSpeed * DT;
    const rl = skLv('repair');
    for (const g of s.ghosts) {
      moveGhost(g, advance);
      g.awe = aweReach(g);   // 描画用（威圧の輪）
      // 修復：分身のHPが少しずつ戻る（極：戻った量の一部で本体も回復）
      if (rl && g.lost > 0) {
        const heal = Math.min(g.lost, g.maxHp * (SK.repair.base + SK.repair.per * (rl - 1)) * DT);
        g.lost -= heal;
        if (g.lost <= 1e-6 && heal > 0) skSfx('repair');
        if (s.st.evo.repair && !s.over) s.hp = Math.min(s.maxHp, s.hp + heal * SK.repair.share);
      }
      g.life = 1;
      // 死の砂時計：一定時間で消える（消える前は点滅）
      if (s.st.curse.hourglass) {
        g.age += DT;
        const left = CU.hourglassLife - g.age;
        if (left < 2) g.life = 0.2;
        if (left <= 0) { g.dead = true; burst(g.x, g.y, 'ghost', 12, 140, g.idx); }
      }
    }
    s.ghosts = s.ghosts.filter((g) => !g.dead);
    if (s.big && s.big.dead) pickBig();

    // ラストスタンド：押し出された分身は、しばらく動いて戦ってから消える
    for (const g of s.fading) {
      moveGhost(g, advance);
      g.awe = 0;
      g.fade -= DT;
      g.life = Math.min(0.24, g.fade);   // 点滅させる
    }
    for (const g of s.fading) if (g.fade <= 0) burst(g.x, g.y, 'ghost', 10, 120, g.idx);
    s.fading = s.fading.filter((g) => g.fade > 0);

    // 分裂した小さな分身：時間で消える（残り時間は g.split の輪で見せる）
    for (const g of s.splits) {
      moveGhost(g, advance);
      g.fade -= DT;
      g.split = Math.max(0, g.fade / g.fadeMax);
      g.life = g.fade < 1 ? 0.24 : 1;   // 消える直前は点滅
      if (g.fade <= 0) burst(g.x, g.y, 'ghost', 8, 110, g.idx);
    }
    s.splits = s.splits.filter((g) => g.fade > 0);

    // 今描いている軌跡で指を離したら押し出される分身を点滅させる
    s.used = usedLength();
    s.evict = 0;
    const r = s.record;
    if (r.enough) {
      let over = s.used + r.length - budget;
      const mains = s.ghosts.filter((g) => !g.echo);
      while (over > 0 && s.evict < mains.length) {
        const m = mains[s.evict];
        for (const g of s.ghosts) if (g === m || g.echoOf === m) g.life = 0.2;   // 写しも一緒に点滅
        over -= m.len;
        s.evict++;
      }
    }
  }

  // 盾持ちの盾：弾が来た向きが正面なら、盾が攻撃力を受け止める。返り値：体まで届かなかったか
  function blockByShield(e, sh) {
    if (e.kind !== 'shield' || !(e.shield > 0)) return false;
    const from = Math.atan2(-sh.vy, -sh.vx);   // 敵から見た、弾が飛んできた向き
    let diff = from - e.ang;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    if (Math.abs(diff) > (ET.shield.guard * Math.PI) / 180) return false;
    const take = Math.min(sh.power, e.shield);
    e.shield -= take;
    if (!sh.pierce) sh.power -= take;
    e.shieldHit = 0.07;
    sparks(sh.x, sh.y, 'white', 4, 160);
    if (e.shield <= 0.001) {
      e.shield = 0;
      burst(e.x + Math.cos(e.ang) * e.r, e.y + Math.sin(e.ang) * e.r, 'white', 14, 200);
      ring(e.x, e.y, e.r, e.r * 2.2, 0.3, 'white', 0, 3);
    }
    // 盾が受けきれなかった分（盾が壊れた残り・タイタンの貫通）は、そのまま体に当たる
    return sh.power <= 0.001 || (e.shield > 0 && !sh.pierce);
  }

  // 天の光：決まった間隔で、敵がいちばん多い列に縦の光の柱が落ちる（Lv＝本数）。威力は全分身の攻撃力の合計
  function updateHeaven() {
    const lv = skLv('heaven');
    if (lv) {
      s.heavenT -= DT;
      if (s.heavenT <= 0) {
        s.heavenT = SK.heaven.every;
        skSfx('heaven');
        const w = SK.heaven.width * s.st.area * s.zoom;
        const used = new Set();
        for (let k = 0; k < lv; k++) {
          // まだ柱が当たらない敵のうち、いちばん多くを巻き込める列
          let bestX = null, bestN = 0;
          for (const c of s.enemies) {
            if (c.hp <= 0 || used.has(c)) continue;
            let n = 0;
            for (const e of s.enemies) if (e.hp > 0 && !used.has(e) && Math.abs(e.x - c.x) < w + e.r) n++;
            if (n > bestN) { bestN = n; bestX = c.x; }
          }
          if (bestX == null) break;
          for (const e of s.enemies) if (Math.abs(e.x - bestX) < w + e.r) used.add(e);
          s.pillars.push({ x: bestX, w, warn: SK.heaven.warn, life: SK.heaven.life, max: SK.heaven.life, struck: false });
        }
      }
    }
    for (const P of s.pillars) {
      if (P.warn > 0) { P.warn -= DT; continue; }
      if (!P.struck) {
        P.struck = true;
        const dmg = s.ghosts.reduce((sum, g) => sum + g.power, 0);
        for (const e of s.enemies) if (e.hp > 0 && Math.abs(e.x - P.x) < P.w + e.r) damageEnemy(e, dmg);
        s.shake = Math.max(s.shake, 5);
      }
      P.life -= DT;
    }
    s.pillars = s.pillars.filter((P) => P.warn > 0 || P.life > 0);
  }

  // 分身の弾が当たった：集中砲火の回数を足し、目印をつける
  function hitByGhost(e) {
    if (skLv('focus')) {
      const cap = focusCap();
      e.focusN = Math.min(Math.ceil(cap / SK.focus.perHit), (e.focusN || 0) + 1);
      if (e.focusN > (e.focusSfxN || 0)) { e.focusSfxN = e.focusN; sfx('sk_focus', Math.min(1.6, 0.9 + e.focusN * 0.06)); }
      e.focusT = SK.focus.keep;
    }
    if (skLv('mark')) { if (!(e.markT > 0)) skSfx('mark'); e.markT = SK.mark.time; }
  }

  // ---------- 攻撃 ----------
  function updateAttacks() {
    const p = s.player;
    if (X.playerAttack.value === 'on') {
      p.fireCd -= DT;
      if (p.fireCd <= 0) {
        const t = nearestEnemy(p, range());
        if (t) { fire(p, t, 'player', 0, P.power * s.st.attack); p.fireCd = P.fireInterval / (s.st.rate * comboMul()); }
      }
    }

    const shooters = [...s.ghosts, ...s.fading, ...s.splits];
    const rateMul = swarmMul() * turretRate();
    if (s.ghostAttack === 'shot') {
      for (const g of shooters) {
        g.fireCd -= DT;
        if (g.fireCd <= 0) {
          const t = nearestEnemy(g, range());
          if (t) { ghostFire(g, t, g.power); g.fireCd = G.fireInterval / (s.st.ghostRate * comboMul() * rateMul); }
        }
      }
    } else {
      for (const g of shooters) {
        for (const e of s.enemies) {
          e.ramBy = e.ramBy || {};
          if ((e.ramBy[g.idx] || 0) > s.time) continue;
          if (dist(g, e) < g.r + G.ramReach + e.r) {
            damageEnemy(e, g.power * G.ramMultiplier);
            addCombo();
            e.ramBy[g.idx] = s.time + G.ramInterval / (s.st.ghostRate * comboMul() * rateMul);
            burst(e.x, e.y, 'ghost', 3, 120, g.idx);
          }
        }
      }
    }

    // 迎撃：分身の近くを通る敵の弾を撃ち落とす（極：その場に小さな衝撃波）
    const icpt = skLv('intercept');
    if (icpt) {
      for (const g of shooters) {
        g.icd = (g.icd || 0) - DT;
        if (g.icd > 0) continue;
        const reach = g.r + SK.intercept.reach * s.zoom;
        let best = null, bd = reach;
        for (const b of s.enemyShots) {
          if (b.life <= 0) continue;
          const d = Math.hypot(b.x - g.x, b.y - g.y);
          if (d < bd) { bd = d; best = b; }
        }
        if (!best) continue;
        best.life = 0;
        g.icd = SK.intercept.every[icpt - 1];
        skSfx('intercept');
        s.lasers.push({ x1: g.x, y1: g.y, x2: best.x, y2: best.y, w: 1.2, life: 0.1, max: 0.1, idx: g.idx });
        sparks(best.x, best.y, 'white', 5, 150);
        if (s.st.evo.intercept) shockwave(best.x, best.y, SK.intercept.burst, g.power * SK.intercept.burstPower, 'ghost', g.idx);
      }
    }
    by('heaven', updateHeaven);
    for (const L of s.lasers) L.life -= DT;
    s.lasers = s.lasers.filter((L) => L.life > 0);

    // 押しつぶし：一番大きい分身に触れている敵へ、毎秒ダメージ（極：2倍で、はじき飛ばす）
    const crush = skLv('crush');
    const bg = s.big;
    if (crush && bg) {
      const kiwami = s.st.evo.crush;
      const dps = bg.power * (SK.crush.base + SK.crush.per * (crush - 1)) * (kiwami ? SK.crush.kiwamiMult : 1);
      for (const e of s.enemies) {
        if (e.hp <= 0) continue;
        const dx = e.x - bg.x, dy = e.y - bg.y;
        const d = Math.hypot(dx, dy);
        if (d >= bg.r + e.r) continue;
        damageEnemy(e, dps * DT, false, true);
        if ((e.crushFx || 0) <= s.time) { burst(e.x, e.y, 'ghost', 3, 120, bg.idx); e.crushFx = s.time + 0.15; skSfx('crush'); }
        if (kiwami && d > 0 && !e.boss) {
          const push = SK.crush.push * s.zoom * DT * 6;
          e.x += dx / d * push; e.y += dy / d * push;
        }
      }
    }

    // 失われた影：本体が体当たりで戦う（同じ敵には少し間をあけて当たる）
    if (s.st.curse.lost && !s.over) {
      for (const e of s.enemies) {
        if (e.hp <= 0 || (e.ramPlayer || 0) > s.time) continue;
        if (Math.hypot(e.x - p.x, e.y - p.y) < e.r + p.r) {
          damageEnemy(e, P.power * s.st.attack);
          addCombo();
          e.ramPlayer = s.time + CU.ramInterval;
          burst(e.x, e.y, 'player', 5, 160);
        }
      }
    }

    const W = s.world.w, H = s.world.h;
    for (const sh of s.shots) {
      // 追尾弾：狙った敵へ向きを少しずつ曲げる（狙った敵が倒れたら、一番近い敵へ）
      if (sh.homing) {
        if (!sh.target || sh.target.hp <= 0) sh.target = nearestEnemy(sh, range() * 1.5);
        if (sh.target) {
          const want = Math.atan2(sh.target.y - sh.y, sh.target.x - sh.x), cur = Math.atan2(sh.vy, sh.vx);
          let da = want - cur; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
          const a = cur + clamp(da, -BS.homing.turn * DT, BS.homing.turn * DT), sp = Math.hypot(sh.vx, sh.vy);
          sh.vx = Math.cos(a) * sp; sh.vy = Math.sin(a) * sp;
        }
      }
      sh.x += sh.vx * DT;
      sh.y += sh.vy * DT;
      sh.life -= DT;
      for (const e of s.enemies) {
        if (e.hp <= 0 || sh.hit.has(e)) continue;
        if (Math.hypot(e.x - sh.x, e.y - sh.y) < e.r + Math.max(sh.size, 3) + 1) {
          if (sh.hit.size === 0) s.stats.hits++;
          releaseReservation(sh);
          sh.hit.add(e);
          // 盾持ち：正面から来た弾は、盾が先に受ける（盾が壊れるまで）
          if (blockByShield(e, sh)) {
            if (sh.power <= 0.001) { sh.life = 0; break; }
            continue;
          }
          e.lastSrc = sh.src || 'ghost';
          // 分身の弾：集中砲火と目印の倍率を掛ける
          const ghost = sh.owner === 'ghost';
          const mul = (ghost ? focusMul(e) : 1) * markMul(e) * lureMul(e);
          // 敵の残り体力の分だけ攻撃力を使い、余れば貫通して次の敵へ（タイタンは減らさずに突き抜ける）
          const dealt = Math.min(sh.power * mul, e.hp);
          damageEnemy(e, dealt, true);
          addCombo();
          if (ghost) hitByGhost(e);
          sfx('hit', rand(0.9, 1.1));
          if (ghost && skLv('thunder') && skLv('chainbolt')) chainBolt(e, dealt);
          if (ghost && skLv('freeze')) chillHit(e);
          if (ghost && skLv('poison')) addPoison(e, 1);
          if (ghost && skLv('reaper') && e.hp > 0) reapRoll(e);
          // 重力弾：一番大きい分身の弾が当たった場所に、小さな引力
          if (ghost && skLv('pull') && skLv('gravshot') && s.big && sh.idx === s.big.idx && sh.hit.size === 1) { skSfx('gravshot'); s.wells.push({ x: sh.x, y: sh.y, life: SK.gravshot.time, max: SK.gravshot.time }); }
          // 賢者の石：錬金の弾が当たった場所で小さく爆発
          if (sh.stone && sh.hit.size === 1) explode(sh.x, sh.y, SK.alchemy.stone, sh.base * SK.alchemy.stonePower, 0, e);
          if (sh.gold) e.goldHit = s.time;   // 金の弾：倒したらかけら +1
          // 重砲：当たった場所で爆発（最初に当たったときだけ）
          if (sh.blast && sh.hit.size === 1) {
            const lv = Math.max(1, skLv('cannon'));
            skSfx('cannon');
            explode(sh.x, sh.y, sh.blast, sh.base * (SK.cannon.base + SK.cannon.per * (lv - 1)), sh.idx, e);
          }
          if (sh.passes > 0) sh.passes--;          // 極散弾：1体だけ、攻撃力を減らさずに突き抜ける
          else if (!sh.pierce) sh.power -= dealt / mul;
          // 極追尾弾：当たると、近くの別の敵へ1回はね返る（威力は撃ったときのまま）
          if (sh.bounce > 0) {
            let next = null, bd = BS.homing.bounce * s.zoom;
            for (const o of s.enemies) { if (o.hp <= 0 || sh.hit.has(o)) continue; const d = Math.hypot(o.x - sh.x, o.y - sh.y); if (d < bd) { bd = d; next = o; } }
            if (next) {
              sh.bounce--; sh.power = sh.base; sh.target = next;
              const sp = Math.hypot(sh.vx, sh.vy), d = Math.max(1, bd);
              sh.vx = (next.x - sh.x) / d * sp; sh.vy = (next.y - sh.y) / d * sp;
              sh.life = Math.max(sh.life, 0.6);
              break;
            }
          }
          if (sh.power <= 0.001) { sh.life = 0; break; }
        }
      }
    }
    s.shots = s.shots.filter((sh) => {
      const alive = sh.life > 0 && sh.x > -20 && sh.x < W + 20 && sh.y > -20 && sh.y < H + 20;
      if (!alive) releaseReservation(sh);
      return alive;
    });
  }

  // ---------- 敵 ----------
  function unlockedTypes() {
    const all = X.enemyPlan.value === 'all';
    if (all) return Object.entries(ET).filter(([, t]) => t.weight > 0);
    return mixAt(s.phase);
  }
  // そのフェーズの敵の割合（CONFIG.enemyMix）を、[種類, {…設定, weight: 割合}] の並びにする
  function mixAt(phase) {
    const M = CONFIG.enemyMix.filter((m) => phase >= m.from).pop();
    const out = [];
    for (const [k, v] of Object.entries(M.fixed)) if (ET[k] && phase >= ET[k].unlockPhase) out.push([k, { ...ET[k], weight: v }]);
    if (M.rest) {
      const others = Object.entries(ET).filter(([k, t]) => t.weight > 0 && !(k in M.fixed) && phase >= t.unlockPhase);
      for (const [k, t] of others) out.push([k, { ...t, weight: M.rest / others.length }]);
    }
    return out;
  }

  function rollTier() {
    const n = s.phase;
    const p4 = clamp((n - TIERS.x4.from + 1) * TIERS.x4.perPhase, 0, TIERS.x4.max);
    const p2 = clamp((n - TIERS.x2.from + 1) * TIERS.x2.perPhase, 0, TIERS.x2.max);
    const r = Math.random();
    if (r < p4) return 4;
    if (r < p4 + p2) return 2;
    return 1;
  }

  function pickNextEnemy() {
    const types = unlockedTypes();
    let roll = rand(0, types.reduce((sum, [, t]) => sum + t.weight, 0));
    let kind = types[0][0];
    for (const [k, t] of types) { roll -= t.weight; if (roll <= 0) { kind = k; break; } }
    const tier = rollTier();
    // 群れは、固まって出る全員の体力の合計で数える
    return { kind, tier, hp: ET[kind].hp * tier * (ET[kind].group || 1) };
  }

  function spawnEnemy(next, elite = false) {
    const t = ET[next.kind];
    let one = next.hp / (t.group || 1);   // 1体の体力
    let r = radiusOf(one) * (t.sizeMul || 1);
    // 中ボス：1体だけ、体力が多く、少し大きい（大きさは今まで通り）。ふつうの敵だけ enemySize 倍
    if (elite) { r *= CONFIG.elite.size; one *= CONFIG.elite.hp; } else r *= CONFIG.enemySize;
    const W = s.world.w, H = s.world.h;
    const m = r + 12;
    const side = Math.floor(rand(0, 4));
    let x, y;
    if (side === 0) { x = rand(0, W); y = -m; }
    else if (side === 1) { x = W + m; y = rand(0, H); }
    else if (side === 2) { x = rand(0, W); y = H + m; }
    else { x = -m; y = rand(0, H); }

    // 群れは、小さいものが固まって出る（同じ向きから、少しずつ散らばって）
    seeKind(next.kind);
    const n = elite ? 1 : t.group || 1;
    const spread = (t.spread || 0) * s.zoom;
    const pack = n > 1 ? { left: n } : null;   // 群れ：同じ固まりの残りの数（全部倒すと、かけらをまとめて落とす）
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), d = n > 1 ? rand(0, spread) : 0;
      const ex = x + Math.cos(a) * d, ey = y + Math.sin(a) * d;
      const wx = rand(0.15, 0.85) * W, wy = rand(0.15, 0.85) * H;   // 漂い：最初に向かう場所（ステージの中）
      s.enemies.push({
        kind: next.kind, tier: next.tier, pack, x: ex, y: ey, r, hp: one, maxHp: one,
        vx: 0, vy: 0, ang: Math.atan2(wy - ey, wx - ex), flash: 0,
        speedMul: rand(0.85, 1.15) / Math.pow(next.tier, 0.25), // 大きいほど少し遅い
        phase: 'move', timer: rand(0.5, 1.5) * (t.fireInterval || t.wander?.[0] || 1),
        strafe: Math.random() < 0.5 ? 1 : -1,
        dashX: 0, dashY: 0,
        wx, wy,
        shield: (t.shield || 0) * one, shieldMax: (t.shield || 0) * one,   // 盾持ちの盾の耐久
        elite,
      });
    }
    return s.enemies[s.enemies.length - 1];
  }
  // 中ボス：フェーズ12から、ボスのいないフェーズの半分ほどで1体
  function maybeSpawnElite() {
    const EL = CONFIG.elite;
    if (s.eliteDone || s.bossPhase || s.phase < EL.from || s.shards < s.need * EL.at) return;
    s.eliteDone = true;
    let next = null;
    for (let i = 0; i < 20 && !next; i++) { const c = pickNextEnemy(); if (!EL.skip.includes(c.kind)) next = c; }
    if (!next) next = { kind: 'chaser', tier: rollTier(), hp: ET.chaser.hp };
    const e = spawnEnemy(next, true);
    e.burstOf = { kind: next.kind, tier: next.tier, hp: next.hp / (ET[next.kind].group || 1) };
  }
  // 中ボスが倒れたとき：同じ種類の小さい敵がはじけ出る
  function eliteBurst(e) {
    sfx('elite');
    const EL = CONFIG.elite, B0 = e.burstOf;
    const n = Math.round(rand(EL.burst[0], EL.burst[1]));
    for (let i = 0; i < n; i++) {
      spawnEnemy({ kind: B0.kind, tier: B0.tier, hp: B0.hp * (ET[B0.kind].group || 1) });
      // 群れの種類でも1体ずつ出す（spawnEnemy が足した分を、1体だけ残す）
      const add = s.enemies.splice(s.enemies.length - (ET[B0.kind].group || 1));
      const one = add[0];
      one.hp = one.maxHp = B0.hp; one.x = e.x; one.y = e.y;
      const a = (i / n) * Math.PI * 2 + rand(-0.3, 0.3);
      one.kbx = Math.cos(a) * 260 * s.zoom; one.kby = Math.sin(a) * 260 * s.zoom;
      s.enemies.push(one);
    }
    s.shake = Math.max(s.shake, 8);
    for (let k = 0; k < 2; k++) ring(e.x, e.y, e.r, e.r * (2.5 + k * 1.5), 0.4 + k * 0.1, 'enemy', 0, 4 - k);
  }

  function hurtPlayer(amount, from) {
    const p = s.player;
    if (p.demonT > 0) return;   // 鬼神：無敵
    // 生命の泉：たまったシールドが先に減る
    if (s.lifeShield > 0) {
      const used = Math.min(s.lifeShield, amount);
      s.lifeShield -= used; amount -= used;
      if (amount <= 0) { p.inv = P.invincibleTime; ring(p.x, p.y, p.r, p.r * 2.5, 0.25, 'white', 0, 2); return; }
    }
    // シールド：1回だけ防ぐ（極：破れた瞬間に衝撃波）
    if (p.shield) {
      p.shield = false;
      sfx('sk_shield', 0.7);
      p.shieldCd = BS.shield.back[skLv('shield') - 1];
      p.inv = 0.4;
      ring(p.x, p.y, p.r * 1.5, p.r * 3, 0.3, 'player', 0, 3);
      sparks(p.x, p.y, 'player', 10, 220);
      if (s.st.evo.shield) shockwave(p.x, p.y, BS.shield.burst, bodyAtk() * BS.shield.burstPower, 'player');
      return;
    }
    s.hp = Math.max(0, s.hp - amount);
    s.sinceHurt = 0;
    sfx('hurt');
    p.inv = P.invincibleTime;
    s.shake = 9;
    s.hurtFlash = 1;
    s.hitstop = 0.07;
    burst(p.x, p.y, 'player', 14, 200);
    if (from) {
      const dx = from.x - p.x, dy = from.y - p.y;
      const d = Math.max(1, Math.hypot(dx, dy));
      from.x += dx / d * P.knockback;
      from.y += dy / d * P.knockback;
    }
    // 不死身：倒れるはずのダメージでも、HP1で一度だけ踏みとどまる
    if (s.hp <= 0 && s.undyingUsed < s.st.undying) {
      s.undyingUsed++;
      s.hp = 1;
      p.inv = 1.5;
      ring(p.x, p.y, p.r, p.r * 6, 0.6, 'player', 0, 5);
      flash(p.x, p.y, p.r * 5, 0.3, 'player');
    }
    // 不老不死：フェーズごとに1回、最大HPの半分で復活
    if (s.hp <= 0 && skLv('immortal') && !s.immortalUsed) {
      s.immortalUsed = true;
      skSfx('immortal');
      s.hp = s.maxHp * SK.immortal.hp;
      p.inv = SK.immortal.inv;
      ring(p.x, p.y, p.r, p.r * 8, 0.7, 'white', 0, 6);
      flash(p.x, p.y, p.r * 6, 0.3, 'white');
      s.banner = { text: '不老不死', sub: '復活', t: 1.2 };
    }
    if (s.hp <= 0) {
      s.over = true;
      s.hitstop = 0;
      sfx('dead');
      s.record.active = false;
      burst(p.x, p.y, 'player', 40, 300);
    }
  }

  function setVel(e, dirX, dirY, speed) {
    const d = Math.max(1e-6, Math.hypot(dirX, dirY));
    e.vx = dirX / d * speed;
    e.vy = dirY / d * speed;
  }

  // 種類ごとの動き
  function think(e) {
    if (e.boss && e.rage && !e.rageSfx) { e.rageSfx = true; sfx('rage'); }
    if (e.kind === 'core') { thinkCore(e); return; }
    if (e.kind === 'hunter') { thinkHunter(e); return; }
    if (e.kind === 'twin') { thinkTwin(e); return; }
    if (e.kind === 'clock') { thinkClock(e); return; }
    if (e.kind === 'shade') { thinkShade(e); return; }
    if (e.kind === 'echo') { thinkEcho(e); return; }
    const t = ET[e.kind];
    const p = targetOf(e);   // ふだんは本体。おとりに引きつけられていれば分身
    const dx = p.x - e.x, dy = p.y - e.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    const speed = t.speed * e.speedMul * T.enemySpeed.value * s.zoom;

    if (e.kind === 'shooter') {
      // 一定の距離を保って回り込み、ときどき本体を狙って撃つ
      const keep = t.keepDistance * s.zoom;
      if (d > keep + 20) setVel(e, dx, dy, speed);
      else if (d < keep - 20) setVel(e, -dx, -dy, speed);
      else setVel(e, -dy * e.strafe, dx * e.strafe, speed * 0.6);
      e.ang = Math.atan2(dy, dx);
      const onScreen = e.x > 0 && e.x < s.world.w && e.y > 0 && e.y < s.world.h;
      e.timer -= DT;
      e.phase = e.timer < t.windup ? 'windup' : 'move';
      if (e.timer <= 0) {
        e.timer = t.fireInterval;
        if (onScreen) {
          const br = EB.radius * Math.sqrt(e.tier);
          s.enemyShots.push({
            x: e.x, y: e.y,
            vx: dx / d * EB.speed * s.zoom, vy: dy / d * EB.speed * s.zoom,
            r: br, life: EB.life, damage: EB.damage * Math.sqrt(e.tier), from: e,
          });
        }
      }
    } else if (e.kind === 'dasher') {
      // 近づいたら一瞬ためて、狙った方向へ一直線に突っ込む
      e.timer -= DT;
      if (e.phase === 'move') {
        setVel(e, dx, dy, speed);
        e.ang = Math.atan2(dy, dx);
        if (d < t.triggerDistance * s.zoom) { e.phase = 'windup'; e.timer = t.windup; }
      } else if (e.phase === 'windup') {
        e.vx = 0; e.vy = 0;
        e.ang = Math.atan2(dy, dx);
        e.dashX = dx / d; e.dashY = dy / d;
        if (e.timer <= 0) { e.phase = 'dash'; e.timer = t.dashTime; }
      } else if (e.phase === 'dash') {
        e.vx = e.dashX * t.dashSpeed * s.zoom; e.vy = e.dashY * t.dashSpeed * s.zoom;
        if (e.timer <= 0) { e.phase = 'recover'; e.timer = t.recover; }
      } else {
        e.vx *= 0.85; e.vy *= 0.85;
        if (e.timer <= 0) e.phase = 'move';
      }
    } else if (e.kind === 'bomber') {
      // 自爆：近づいたら止まって点滅し、時間がたつと爆発する
      if (e.phase === 'move') {
        setVel(e, dx, dy, speed);
        if (d < t.trigger * s.zoom + (p.r || 0)) {
          e.phase = 'windup'; e.timer = t.windup; e.windupMax = t.windup;
          e.blast = t.blast * Math.sqrt(e.tier) * s.zoom;
        }
      } else {
        e.vx = 0; e.vy = 0;
        e.timer -= DT;
        if (e.timer <= 0) explodeBomber(e);
      }
    } else if (e.kind === 'thief') {
      // かけら泥棒：持っていたら本体から逃げる。持っていなければ、落ちているかけらへ向かう（なければふらつく）
      //   持っていても、すぐ近くにまだかけらがあれば、それも拾ってから逃げる
      let best = null, bd = e.carry > 0 ? 50 * s.zoom : Infinity;
      for (const k of s.pickups) {
        if (k.flying || k.life <= 0) continue;
        const d2 = Math.hypot(k.x - e.x, k.y - e.y);
        if (d2 < bd) { bd = d2; best = k; }
      }
      if (best) setVel(e, best.x - e.x, best.y - e.y, speed);
      else if (e.carry > 0) setVel(e, -dx, -dy, speed);
      else wander(e, t, speed);
    } else if (e.kind === 'drift') {
      wander(e, t, speed);
    } else {
      setVel(e, dx, dy, speed);
      e.ang = Math.atan2(dy, dx);
    }
  }

  // 自爆の爆発：範囲の本体・おとりの分身・ほかの敵にダメージ。自分は消える（かけらは落とさない）
  function explodeBomber(e) {
    const t = ET.bomber, R = e.blast, p = s.player;
    e.hp = 0;
    e.selfDestruct = true;
    ring(e.x, e.y, 6, R, 0.35, 'enemy', 0, 5);
    ring(e.x, e.y, 4, R * 0.6, 0.25, 'white', 0, 3);
    flash(e.x, e.y, R * 0.9, 0.15, 'enemy');
    burst(e.x, e.y, 'enemy', 18, 220);
    s.shake = Math.max(s.shake, 6);
    if (!s.over && p.inv <= 0 && Math.hypot(p.x - e.x, p.y - e.y) < R + playerHitR()) {
      hurtPlayer(T.contactDamage.value * t.blastDamage * Math.sqrt(e.tier), null);
    }
    for (const g of [...s.ghosts]) {
      if (g.maxHp > 0 && Math.hypot(g.x - e.x, g.y - e.y) < R + g.r) hurtGhost(g, T.contactDamage.value * t.blastDamage * Math.sqrt(e.tier), null);
    }
    for (const o of s.enemies) {
      if (o !== e && o.hp > 0 && Math.hypot(o.x - e.x, o.y - e.y) < R + o.r) damageEnemy(o, e.maxHp * t.blastEnemy);
    }
  }

  // ステージの中の、でたらめな場所へふらふら向かう。ときどき行き先を変える（漂い・かけら泥棒）
  function wander(e, t, speed) {
    e.timer -= DT;
    const wx = e.wx - e.x, wy = e.wy - e.y;
    if (e.timer <= 0 || Math.hypot(wx, wy) < 10) {
      e.timer = rand(t.wander[0], t.wander[1]);
      e.wx = rand(0.1, 0.9) * s.world.w;
      e.wy = rand(0.1, 0.9) * s.world.h;
    }
    // 向きをゆっくり変える（急に曲がらない）
    const want = Math.atan2(e.wy - e.y, e.wx - e.x);
    let da = want - e.ang;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    e.ang += clamp(da, -2 * DT, 2 * DT);
    e.vx = Math.cos(e.ang) * speed;
    e.vy = Math.sin(e.ang) * speed;
  }

  // 威圧：一番大きい分身の近くにいる敵は遅くなる（返り値：速さに掛ける数）
  function aweSlow(e) {
    const g = s.big;
    if (!g || !g.awe) return 1;
    if (Math.hypot(e.x - g.x, e.y - g.y) > g.awe + e.r) return 1;
    return Math.max(0.2, 1 - SK.awe.per * skLv('awe'));
  }

  function jumpMark(from) {
    let best = null, bd = SK.mark.jump * s.zoom;
    for (const o of s.enemies) {
      if (o === from || o.hp <= 0 || o.markT > 0) continue;
      const d = dist(o, from);
      if (d < bd) { bd = d; best = o; }
    }
    if (!best) return;
    best.markT = SK.mark.time;
    (best.status || (best.status = {})).mark = true;
    ring(best.x, best.y, best.r, best.r + 16, 0.25, 'white', 0, 2);
  }

  // クリアに必要なかけら：そのフェーズで needSec 秒の間に出てくる敵が落とすかけらの見込み × needRatio
  //   見込み＝出てくる勢い（体力/秒）÷ 1体あたりの体力の平均 × 1体あたりのかけらの平均（出られる種類と、大きい敵の割合から計算）
  // きれいな数字にする：5の倍数に丸め、前のフェーズより必ず5以上多くする（35, 40, 45, …）
  function needOf(phase) {
    let v = 0;
    for (let p = 1; p <= phase; p++) v = Math.max(Math.round(needRaw(p) / 5) * 5, v + 5);
    return v;
  }
  function needRaw(phase) {
    const types = mixAt(phase);
    const n = phase;
    const p4 = clamp((n - TIERS.x4.from + 1) * TIERS.x4.perPhase, 0, TIERS.x4.max);
    const p2 = clamp((n - TIERS.x2.from + 1) * TIERS.x2.perPhase, 0, TIERS.x2.max);
    const tierAvg = 4 * p4 + 2 * p2 + 1 * (1 - p4 - p2);
    const W = types.reduce((v, [, t]) => v + t.weight, 0);
    let hpPer = 0, shPer = 0;   // 1回の出現あたりの体力とかけら（群れは固まり全体）
    for (const [, t] of types) { const g = t.group || 1; hpPer += (t.weight / W) * t.hp * g * tierAvg; shPer += (t.weight / W) * (g > 1 ? t.packShards || 3 : t.shards || 1) * tierAvg; }
    const rate = PH.hpRateBase * growthOf(phase);
    return Math.max(1, Math.round((rate * PH.needSec / hpPer) * shPer * PH.needRatio));
  }
  // フェーズ1からの敵の勢いの倍率。1フェーズ進むごとに、その時期の倍率を掛けていく
  function growthOf(phase) {
    let k = 1;
    for (let n = 2; n <= phase; n++) k *= PH.hpRateGrowth.find((g) => n <= g.until).rate;
    return k;
  }

  function updateEnemies() {
    // 1秒あたりに出す「敵の体力の合計」をためていき、たまったら1体出す
    const frozen = s.timeStop > 0;
    if (frozen) { /* 時間停止中は敵が出てこない */ }
    else if (s.spawnDelay > 0) s.spawnDelay -= DT;
    else {
      maybeSpawnElite();
      const rate = PH.hpRateBase * growthOf(s.phase) * T.enemyRate.value * (s.bossPhase ? BOSS.normalRate : 1);
      s.spawnPool += rate * DT;
      if (!s.nextEnemy) s.nextEnemy = pickNextEnemy();
      while (s.nextEnemy && s.spawnPool >= s.nextEnemy.hp) {
        s.spawnPool -= s.nextEnemy.hp;
        spawnEnemy(s.nextEnemy);
        s.nextEnemy = pickNextEnemy();
      }
    }

    const p = s.player;
    const cap = focusCap();
    for (const e of s.enemies) {
      // 集中砲火：しばらく当てないと消える／目印：時間で消える（描画用に状態へ写す）
      if (e.focusT > 0) { e.focusT -= DT; if (e.focusT <= 0) { e.focusN = 0; e.focusSfxN = 0; } }
      e.focus = cap > 0 && e.focusN ? Math.min(1, (e.focusN * SK.focus.perHit) / cap) : 0;
      if (e.markT > 0) e.markT -= DT;
      if (e.markT > 0 || (e.status && e.status.mark)) (e.status || (e.status = {})).mark = e.markT > 0;
      if (e.shieldHit > 0) e.shieldHit -= DT;
      // 時間停止中は、時計のほかは止まる
      if (frozen && e.kind !== 'clock') { e.vx = 0; e.vy = 0; continue; }
      think(e);
      // 足止め：止まっている／スロウフィールド：遅くなっている
      if (e.stunT > 0) e.stunT -= DT;
      if (e.trapSlowT > 0) e.trapSlowT -= DT;
      const slow = aweSlow(e) * iceSlow(e) * (e.stunT > 0 ? 0 : 1) * (e.trapSlowT > 0 ? SK.trap.slow : 1);
      e.x += e.vx * slow * DT;
      e.y += e.vy * slow * DT;
      // 押しやられた勢い（だんだん弱まる）
      if (e.kbx || e.kby) {
        e.x += e.kbx * DT; e.y += e.kby * DT;
        const f = Math.pow(0.002, DT);
        e.kbx *= f; e.kby *= f;
        if (Math.abs(e.kbx) + Math.abs(e.kby) < 5) { e.kbx = 0; e.kby = 0; }
      }
      if (e.flash > 0) e.flash -= DT;
    }

    // かけら泥棒：落ちているかけらに触れたら持ち去る。持ったまま画面の外へ出たら逃げ切り（かけらごと消える）
    for (const e of s.enemies) {
      if (e.kind !== 'thief' || e.hp <= 0) continue;
      const before = s.pickups.length;
      s.pickups = s.pickups.filter((k) => {
        if (k.flying || Math.hypot(k.x - e.x, k.y - e.y) > e.r + 6) return true;
        e.carry = (e.carry || 0) + (k.worth || 1);
        return false;
      });
      if (s.pickups.length < before) burst(e.x, e.y, 'shard', 3, 60);
      const m = ET.thief.escape * s.zoom;
      if (e.carry > 0 && (e.x < -m || e.x > s.world.w + m || e.y < -m || e.y > s.world.h + m)) e.escaped = true;
    }
    s.enemies = s.enemies.filter((e) => !e.escaped);

    // 敵同士が重なりすぎないように押し合う（突進中は押されない）
    const es = frozen ? [] : s.enemies;   // 時間停止中は押し合わない
    for (let i = 0; i < es.length; i++) {
      for (let j = i + 1; j < es.length; j++) {
        const a = es[i], b = es[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        const min = a.r + b.r;
        if (d > 0 && d < min) {
          // 大きい敵ほど押されにくい
          const wa = b.r / (a.r + b.r), wb = a.r / (a.r + b.r);
          const push = min - d;
          // ボスは押されない（相手だけがよける）
          const ka = a.boss ? 0 : b.boss ? 2 : 1, kb = b.boss ? 0 : a.boss ? 2 : 1;
          if (a.phase !== 'dash') { a.x -= dx / d * push * wa * ka; a.y -= dy / d * push * wa * ka; }
          if (b.phase !== 'dash') { b.x += dx / d * push * wb * kb; b.y += dy / d * push * wb * kb; }
        }
      }
    }

    // 敵の弾
    const W = s.world.w, H = s.world.h;
    for (const b of s.enemyShots) {
      if (!frozen) {
        b.x += b.vx * DT;
        b.y += b.vy * DT;
        b.life -= DT;
      }
      const slip = skLv('nimble') && s.st.evo.nimble && p.moving;   // 極身軽：動いている間は弾をすり抜ける
      if (!s.over && p.inv <= 0 && !slip && Math.hypot(b.x - p.x, b.y - p.y) < b.r + playerHitR()) {
        hurtPlayer(b.damage, null);
        b.life = 0;
      } else if (skLv('nimble') && p.moving && !b.nimbleSfx && Math.hypot(b.x - p.x, b.y - p.y) < b.r + p.r * P.hitRatio) { b.nimbleSfx = true; skSfx('nimble'); }
      // おとり：分身にも敵の弾が当たる
      if (b.life > 0 && skLv('decoy')) {
        for (const g of s.ghosts) {
          if (Math.hypot(b.x - g.x, b.y - g.y) < b.r + g.r) { hurtGhost(g, b.damage, b.from); b.life = 0; break; }
        }
      }
    }
    s.enemyShots = s.enemyShots.filter((b) => b.life > 0 && b.x > -30 && b.x < W + 30 && b.y > -30 && b.y < H + 30);

    // 本体との接触（敵は消えず、本体にダメージ）
    for (const e of s.enemies) {
      if (s.over || p.inv > 0) break;
      if (!ET[e.kind].damage || e.vanish) continue;   // 漂い：攻撃しない／消えている影
      if (p.charge != null) continue;     // 突撃中：ぶつかっても無傷
      if (Math.hypot(e.x - p.x, e.y - p.y) < e.r * 0.8 + playerHitR()) {
        hurtPlayer(T.contactDamage.value * ET[e.kind].damage * Math.sqrt(e.tier), e);
      }
    }

    // おとり：敵が分身に触れると、分身のHPが減る（同じ敵は少し間をあけて）
    if (skLv('decoy')) {
      for (const e of s.enemies) {
        if (e.hp <= 0 || !ET[e.kind].damage || (e.biteT || 0) > s.time) continue;
        for (const g of s.ghosts) {
          if (Math.hypot(e.x - g.x, e.y - g.y) < e.r * 0.8 + g.r) {
            hurtGhost(g, T.contactDamage.value * ET[e.kind].damage * Math.sqrt(e.tier), e);
            e.biteT = s.time + SK.decoy.bite;
            break;
          }
        }
      }
    }

    // 倒れた敵：スコアとかけら
    for (const e of s.enemies) {
      if (e.hp <= 0 && e.selfDestruct) continue;   // 自爆して消えた：スコアもかけらもなし
      if (e.hp <= 0) {
        s.kills++;
        const src = e.lastSrc || 'ghost';
        s.killBy[src] = (s.killBy[src] || 0) + 1;
        s.killsByKind[e.kind] = (s.killsByKind[e.kind] || 0) + 1;
        s.score += Math.round(e.maxHp);   // スコア＝倒した敵の体力
        s.hitstop = Math.max(s.hitstop, 0.025);
        enemyDeathFx(e);
        sfx('kill', rand(0.9, 1.15));
        // ボス：倒すとしばらくして、スーパーレア以上のカード選びへ（かけらは落とさない）
        // 双子：片方だけ倒れたときは、残った方が怒る。しばらくして倒れた方が戻ってくる
        if (e.kind === 'twin' && s.twin && s.enemies.some((o) => o !== e && o.kind === 'twin' && o.hp > 0)) {
          for (const o of s.enemies) if (o !== e && o.kind === 'twin' && o.hp > 0) { o.rage = true; o.fireCd = Math.min(o.fireCd, 0.6); }
          sfx('rage');
          s.twin.dead = { x: e.x, y: e.y, slot: e.slot, maxHp: e.maxHp, t: BOSS.twin.revive };
          s.twin.tether = { st: 'off', t: 0 };
          s.shake = Math.max(s.shake, 10);
          for (let k = 0; k < 3; k++) ring(e.x, e.y, e.r, e.r * (2.5 + k * 1.5), 0.45 + k * 0.12, 'enemy', 0, 5 - k);
          continue;
        }
        if (e.boss) {
          s.bossKills.push(e.kind);
          sfx('bossdown');
          s.bossDown = { t: 0, x: e.x, y: e.y };   // はじける輪と白い光
          s.slowT = 0.5;                            // 0.5秒ほどゆっくりにする
          if (s.twin) s.twin.dead = null;
          // 影：倒すと影の分身も消える
          for (const o of s.enemies) if (o.kind === 'echo' && o.hp > 0) { o.hp = 0; o.selfDestruct = true; enemyDeathFx(o); }
          s.bossDownT = BOSS.clearDelay;
          s.shake = Math.max(s.shake, 14);
          for (let k = 0; k < 4; k++) ring(e.x, e.y, e.r, e.r * (3 + k * 2), 0.5 + k * 0.15, 'enemy', 0, 6 - k);
          flash(e.x, e.y, e.r * 6, 0.4, 'white');
          s.banner = { text: 'BOSS DOWN', sub: '', t: 1.2 };
          continue;
        }
        dropShards(e);
        if (e.elite && e.burstOf) eliteBurst(e);
        // 吸血：倒すたびにHPが少し回復
        if (skLv('vampire')) skSfx('vampire');
        if (skLv('vampire')) healPlayer(s.maxHp * (s.st.evo.vampire ? SK.vampire.kiwamiHeal : SK.vampire.heal));
        if (e.goldHit != null && s.time - e.goldHit < 0.2) s.pickups.push({ x: e.x, y: e.y, vx: rand(-60, 60), vy: rand(-60, 60), life: SH.life, spin: 0, flying: false, worth: 1, gold: true });
        // 魂の収穫：即死で倒した敵のかけらが増える
        if (e.reaped && skLv('reaper') && skLv('soulreap')) { const m = s.st.evo.soulreap ? SK.soulreap.kiwamiMult : SK.soulreap.mult; for (let k = 1; k < m; k++) dropShards({ ...e, carry: 0 }); }
        if (skLv('freeze') && skLv('shatter') && (e.chillT > 0 || e.frozenT > 0 || e.coldT > 0 || e.frostT > 0)) shatter(e);
        // 伝染：毒の敵が倒れると、近くの敵に毒がうつる
        if (skLv('poison') && skLv('contagion') && e.poisonN > 0) {
          const n = Math.ceil(e.poisonN * (s.st.evo.contagion ? SK.contagion.kiwamiShare : SK.contagion.share));
          skSfx('contagion');
          for (const o of s.enemies) if (o !== e && o.hp > 0 && Math.hypot(o.x - e.x, o.y - e.y) < SK.contagion.reach * s.zoom + o.r) { addPoison(o, n); sparks(o.x, o.y, 'white', 3, 100); }
        }
        // 極目印：印のある敵が倒れると、近くの敵に印が移る
        if (e.markT > 0 && s.st.evo.mark) jumpMark(e);
        // 衝撃波：倒した敵のまわりの敵にダメージ（その衝撃波で倒れた敵も、次の刻みでまた衝撃波を出す）
        if (s.st.shockwave) {
          e.dying = true;
          shockwave(e.x, e.y, BN.shockwave.radius, BN.shockwave.base + e.maxHp * BN.shockwave.ofHp);
        }
      }
    }
    s.enemies = s.enemies.filter((e) => e.hp > 0);
  }

  // ---------- かけら ----------
  function dropShards(e) {
    // かけら＋：割合で増やす。端数は確率で1個にする（例：1.3個 → 30%で2個）
    // 中ボス：同じ種類の何体分か（体力の割合ではなく決めた数）
    // 群れ：1匹ずつは落とさず、固まりを全部倒したときに packShards 個（大きい群れはその倍）
    if (e.pack && !e.elite) { e.pack.left--; if (e.pack.left > 0) return; }
    const per = e.pack && !e.elite ? ET[e.kind].packShards || 3 : (ET[e.kind] && ET[e.kind].shards) || 1;   // 種類ごとに決まった数（大きい敵はその倍）
    const exact = (e.elite && e.burstOf ? per * (e.burstOf.tier || 1) * CONFIG.elite.shards : per * (e.tier || 1)) * s.st.shard;
    const n = Math.floor(exact) + (Math.random() < exact % 1 ? 1 : 0);
    const drop = (worth) => {
      const a = rand(0, Math.PI * 2);
      const v = n > 1 ? rand(40, 120) : rand(0, 30);
      s.pickups.push({ x: e.x, y: e.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: SH.life, spin: rand(0, 6), flying: false, worth, gold: worth > 1 });
    };
    for (let i = 0; i < n; i++) drop(1);
    // かけら泥棒：持っていたかけらを全部返す（多いときはまとめて、40個まで）
    if (e.carry > 0) {
      const pieces = Math.min(40, e.carry);
      let left = e.carry;
      for (let i = 0; i < pieces; i++) { const w = Math.ceil(left / (pieces - i)); drop(w); left -= w; }
    }
    // ゴールドラッシュ：大きな敵は、金のかけら（何個分にもなる）を1つ落とす
    if (s.st.goldRush && e.tier >= BN.goldRush.minTier) drop(BN.goldRush.worth);
  }

  function updatePickups() {
    const p = s.player;
    const magnet = magnetRadius();
    // ブラックホール：ときどき画面中のかけらがすべて本体へ集まる
    if (s.st.blackHole) {
      s.blackHoleT -= DT;
      if (s.blackHoleT <= 0) {
        s.blackHoleT = BN.blackHole.every;
        if (s.pickups.length) {
          for (const k of s.pickups) k.flying = true;
          ring(p.x, p.y, s.world.w * 0.6, p.r, 0.5, 'shard', 0, 4);
        }
      }
    }
    // 拾い上手：かけらが消えるまでの時間が延びる（極：消えない）
    const keep = skLv('keeper') ? (s.st.evo.keeper ? 0 : SH.life / (SH.life + SK.keeper.per * skLv('keeper'))) : 1;
    // 黄金時代
    if (skLv('keeper') && skLv('shortcut') && skLv('goldenage')) {
      s.goldenCd = (s.goldenCd == null ? SK.goldenage.every : s.goldenCd) - DT;
      if (s.goldenCd <= 0) { skSfx('goldenage'); s.goldenCd = SK.goldenage.every; s.golden = SK.goldenage.time; s.banner = { text: '黄金時代', sub: 'かけら3倍', t: 1.2 }; }
    }
    if (s.golden > 0) s.golden -= DT;
    // 宝探し：ときどき金のかけらが出る
    if (skLv('keeper') && skLv('shortcut') && skLv('treasure')) {
      s.treasureCd = (s.treasureCd == null ? SK.treasure.every : s.treasureCd) - DT;
      if (s.treasureCd <= 0) {
        s.treasureCd = s.st.evo.treasure ? SK.treasure.kiwamiEvery : SK.treasure.every;
        const x = rand(30, s.world.w - 30), y = rand(30, s.world.h - 30);
        s.pickups.push({ x, y, vx: 0, vy: 0, life: SH.life * 2, spin: 0, flying: false, worth: SK.treasure.worth, gold: true, treasure: true });
        ring(x, y, 4, 40, 0.5, 'shard', 0, 3);
      }
    }
    for (const k of s.pickups) {
      k.life -= DT * keep;
      k.age = (k.age || 0) + DT;
      const dx = p.x - k.x, dy = p.y - k.y;
      const d = Math.hypot(dx, dy);
      if (k.flying || d < magnet) {
        k.flying = true;
        const sp = SH.flySpeed * s.zoom;
        k.vx = dx / Math.max(1, d) * sp;
        k.vy = dy / Math.max(1, d) * sp;
      } else {
        k.vx *= 0.9; k.vy *= 0.9;
      }
      k.x += k.vx * DT;
      k.y += k.vy * DT;
      if (d < p.r + 4) {
        k.life = 0;
        let worth = k.worth || 1;
        // 二重取り：たまに2個分
        if (skLv('keeper') && skLv('shortcut') && skLv('double')) { const D2 = SK.double; if (Math.random() < (D2.base + D2.per * (skLv('double') - 1)) * (s.st.evo.double ? D2.kiwamiMult : 1)) { worth *= 2; skSfx('double'); burst(k.x, k.y, 'shard', 6, 120); } }
        if (s.golden > 0) worth *= SK.goldenage.mult;
        s.shards += worth;
        s.shardsGot = (s.shardsGot || 0) + worth;   // このプレイで拾ったかけらの合計（ミッション用）
        burst(k.x, k.y, 'shard', 4, 80);
        sfx('shard', Math.min(1.6, 1 + (s.combo || 0) * 0.01));
        onCollect(worth);
        if (k.treasure) skSfx('treasure');
        if (skLv('keeper') && k.age > SH.life * 0.6) skSfx('keeper');
        // 連鎖回収：近くのかけらも一緒に飛んでくる
        if (skLv('keeper') && skLv('shortcut') && skLv('chainpick')) {
          const R = SK.chainpick.reach * (s.st.evo.chainpick ? SK.chainpick.kiwamiMult : 1) * s.zoom;
          skSfx('chainpick');
          for (const o of s.pickups) if (o !== k && o.life > 0 && !o.flying && Math.hypot(o.x - k.x, o.y - k.y) < R) o.flying = true;
        }
      }
    }
    s.pickups = s.pickups.filter((k) => k.life > 0);
    // 近道：必要なかけらが減る（元の半分より少なくはならない）
    const raw = needOf(s.phase);
    if (skLv('keeper') && skLv('shortcut')) { const C = SK.shortcut; s.need = Math.max(Math.ceil(raw * C.floor), Math.round(raw * (1 - C.base - C.per * (skLv('shortcut') - 1)))); }
    else s.need = raw;
    if (s.shards >= s.need && !s.bossPhase && s.mode === 'play') clearPhase();
  }

  // ---------- フェーズ ----------
  function clearPhase(afterBoss = false) {
    if (s.sfx) s.sfx.push(['clear', 1], ['clearBurst', 1]);   // パーン（たくさん鳴っているフレームでも必ず鳴らす）
    // 画面上の敵・弾・かけらを消して、HPを全回復し、スキル選択へ
    //   クリアの演出：残っていた敵が一斉にはじけ、本体から大きな光の輪が広がり、画面がゆれる
    const p0 = s.player, big = Math.max(s.world.w, s.world.h);
    for (const e of s.enemies) { enemyDeathFx(e); sparks(e.x, e.y, 'enemy', 6, 260); flash(e.x, e.y, e.r * 3, 0.25, 'white'); }
    flash(p0.x, p0.y, big * 1.2, 0.3, 'white');
    for (let k = 0; k < 3; k++) ring(p0.x, p0.y, p0.r, big * (0.45 + k * 0.3), 0.45 + k * 0.15, 'shard', 0, 8 - k * 2);
    sparks(p0.x, p0.y, 'shard', 24, 420);
    s.shake = Math.max(s.shake, 12);
    s.enemies = [];
    // 分身もフェーズごとに消す（次のフェーズは分身なしから始まる）
    for (const g of s.ghosts) {
      burst(g.x, g.y, 'ghost', 12, 140, g.idx);
      ring(g.x, g.y, g.r, g.r + 30, 0.35, 'ghost', g.idx, 2);
    }
    s.ghosts = [];
    s.fading = [];
    s.splits = [];
    s.lasers = [];
    s.pillars = [];
    s.heavenT = 0;
    s.big = null;
    s.enemyShots = [];
    s.shots = [];
    // 残っていたかけら：全部が本体に吸い寄せられて消える（数には入らない。見た目だけ）
    s.pickups = s.pickups.map((k, i) => ({ ...k, gather: true, gt: 0, gd: Math.min(0.15, i * 0.006), sx: k.x, sy: k.y }));
    s.record.active = false;
    s.record.path = [];
    s.record.length = 0;
    // HPを全回復（絶望の淵では回復しない）
    s.maxHp = s.st.maxHp;
    if (!s.st.curse.abyss) s.hp = s.maxHp;
    s.player.inv = 0;
    s.score += PH.clearBonus * s.phase;
    s.choices = rollChoices(s, { afterBoss });
    s.choiceAfterBoss = afterBoss;   // 引き直すときも同じ決まりで引く
    // 本体がステージの真ん中へ戻ってから、カード選びにする
    s.mode = 'returning';
    s.returnT = 0;
    s.returnFrom = { x: s.player.x, y: s.player.y };
    s.boss = null;
    s.twin = null;
    s.timeStop = 0;
    s.bossPhase = false;
  }

  // ---------- ボス ----------
  const BOSS = CONFIG.boss;
  // そのフェーズがボスのフェーズなら、ボスの種類（まだ仕組みのないボスなら null）
  function bossKindOf(phase) {
    if (phase % BOSS.every !== 0) return null;
    const kind = BOSS.order[(phase / BOSS.every - 1) % BOSS.order.length];
    return BOSS.ready.includes(kind) ? kind : null;
  }
  function spawnBoss(kind) {
    seeKind(kind);
    if (kind === 'twin') { spawnTwins(); return; }
    const B2 = BOSS[kind], W = s.world.w, H = s.world.h;
    const hp = PH.hpRateBase * growthOf(s.phase) * BOSS.hpSeconds;
    const e = { kind, boss: true, name: B2.name, tier: 1, x: W / 2, y: H * B2.y, r: B2.radius * s.zoom, hp, maxHp: hp, vx: 0, vy: 0, ang: Math.PI / 2, flash: 0, speedMul: 1, phase: 'move', timer: B2.every || 0, strafe: 1, dashX: 0, dashY: 0, shield: 0, shieldMax: 0, spin: 0, fireCd: 1, callCd: B2.callEvery };
    s.enemies.push(e);
    s.boss = e;
    ring(e.x, e.y, 4, e.r * 3, 0.6, 'enemy', 0, 6);
    s.shake = Math.max(s.shake, 8);
  }
  function updateBoss() {
    if (s.bossAppear > 0) { s.bossAppear -= DT; if (s.bossAppear <= 0) spawnBoss(s.bossPhase); }
    if (s.twin) updateTwins();
    if (s.bossDownT > 0) { s.bossDownT -= DT; if (s.bossDownT <= 0) clearPhase(true); }
  }

  // ---------- ボスに共通する流れ ----------
  //   動く（場所を変える）→ 予告（赤く光る）→ 技 → すき（止まる。受けるダメージ×1.5）→ 動く … をくり返す
  //   技は袋から順に引く（同じ技が続かないように混ぜる）。怒ると技が1つ増え、予告とすきが短くなる
  //   F：技の表（warn：予告の秒数、aim：予告の始まり、warnTick：予告中、start：技の始まり、tick：毎フレーム→終わったら true、end：終わり）
  function bossFlow(e, F, list, move, moveTime) {
    if (!e.flow) { e.flow = 'move'; e.ft = 1.0; e.bag = []; }
    if (e.flow === 'move') {
      move(e);
      e.ft -= DT;
      if (e.ft <= 0) {
        let id = null;
        for (let n = 0; n < 12 && !id; n++) {
          if (!e.bag.length) { e.bag = list.slice().sort(() => Math.random() - 0.5); if (e.bag[0] === e.techId && e.bag.length > 1) e.bag.push(e.bag.shift()); }
          const c = e.bag.shift();
          if (list.includes(c)) id = c;
        }
        e.techId = id || list[0];
        e.flow = 'warn'; e.ft = F[e.techId].warn * (e.rage ? BOSS.rageWarn : 1); e.ftMax = e.ft; e.tt = 0;
        if (F[e.techId].aim) F[e.techId].aim(e);
      }
    } else if (e.flow === 'warn') {
      const T2 = F[e.techId];
      e.vx = (e.vx || 0) * 0.8; e.vy = (e.vy || 0) * 0.8;
      if (T2.warnTick) T2.warnTick(e);
      e.ft -= DT;
      if (e.ft <= 0) { e.flow = 'act'; e.tt = 0; if (T2.start) T2.start(e); }
    } else if (e.flow === 'act') {
      const T2 = F[e.techId];
      e.tt += DT;
      if (T2.tick(e)) { if (T2.end) T2.end(e); e.flow = 'rest'; e.ft = e.rage ? BOSS.rageRest : BOSS.rest; e.ftMax = e.ft; e.vx = 0; e.vy = 0; }
    } else {
      e.vx = 0; e.vy = 0;
      e.ft -= DT;
      if (e.ft <= 0) { e.flow = 'move'; e.ft = moveTime; e.wx = null; }
    }
    e.vuln = e.flow === 'rest';
  }
  // 予告の形（赤く光る）。k：'circle'（x,y,r）・'line'（x1,y1,x2,y2,w）・'fan'（x,y,a,spread,len）・'path'（pts,w）
  //   follow：その敵についていく、hot：当たる状態（明るく）
  function warnShape(o, time) { const w = { ...o, t: time, max: time }; s.warns.push(w); return w; }
  function bossShot(e, a, sp, life = 1.5) {
    const z = s.zoom;
    s.enemyShots.push({ x: e.x + Math.cos(a) * e.r * 0.8, y: e.y + Math.sin(a) * e.r * 0.8, vx: Math.cos(a) * sp * z, vy: Math.sin(a) * sp * z, r: EB.radius * z, life: EB.life * life, damage: EB.damage, from: e });
  }
  function bossRing(e, n, sp, off = 0) { for (let k = 0; k < n; k++) bossShot(e, off + (k * Math.PI * 2) / n, sp); }
  // 画面の中をゆっくり漂う（本体から少し離れた場所を行き先にする）
  function bossWander(e, speed, area = [0.15, 0.85, 0.14, 0.55]) {
    const z = s.zoom, p = s.player;
    if (e.wx == null || Math.hypot(e.wx - e.x, e.wy - e.y) < 12 * z) {
      for (let k = 0; k < 8; k++) { e.wx = rand(area[0], area[1]) * s.world.w; e.wy = rand(area[2], area[3]) * s.world.h; if (Math.hypot(e.wx - p.x, e.wy - p.y) > 150 * z) break; }
    }
    setVel(e, e.wx - e.x, e.wy - e.y, speed * z);
  }
  const angTo = (e, q) => Math.atan2(q.y - e.y, q.x - e.x);

  // ---------- コア ----------
  // 画面の中をゆっくり漂う。技：渦の弾・弾の輪・手下を呼ぶ／怒ると「収縮して爆発」が増える
  function coreCall(e, n) {
    for (let k = 0; k < n; k++) {
      const a = (k * Math.PI * 2) / n + e.spin, d = e.r * 1.8;
      const one = ET.chaser.hp, r = radiusOf(one) * (ET.chaser.sizeMul || 1);
      const x = e.x + Math.cos(a) * d, y = e.y + Math.sin(a) * d;
      s.enemies.push({ kind: 'chaser', tier: 1, x, y, r, hp: one, maxHp: one, vx: 0, vy: 0, ang: a, flash: 0, speedMul: 1, phase: 'move', timer: 1, strafe: 1, dashX: 0, dashY: 0, wx: x, wy: y, shield: 0, shieldMax: 0 });
      ring(x, y, 4, r * 2.5, 0.35, 'enemy', 0, 3);
    }
  }
  const CORE_TECH = {
    spiral: { warn: 0.6, aim: (e) => warnShape({ k: 'circle', x: e.x, y: e.y, r: e.r * 1.7, follow: e }, e.ft),
      start: (e) => { e.fireCd = 0; },
      tick: (e) => {
        const C = BOSS.core;
        e.fireCd -= DT;
        if (e.fireCd <= 0) { e.fireCd = C.fireEvery; const n = e.rage ? C.rageArms : C.arms; for (let k = 0; k < n; k++) bossShot(e, e.spin + (k * Math.PI * 2) / n, C.bulletSpeed); }
        return e.tt >= (e.rage ? C.rageSpiralTime : C.spiralTime);
      } },
    rings: { warn: 0.6, aim: (e) => warnShape({ k: 'circle', x: e.x, y: e.y, r: e.r * 2.2, follow: e }, e.ft),
      start: (e) => { e.shotN = 0; },
      tick: (e) => {
        const C = BOSS.core, n = e.rage ? C.rageRingWays : C.ringWays;
        while (e.shotN < C.ringCount && e.tt >= e.shotN * C.ringGap) { bossRing(e, n, C.ringSpeed, e.spin + (e.shotN % 2) * Math.PI / n); ring(e.x, e.y, e.r, e.r * 1.8, 0.25, 'enemy', 0, 3); e.shotN++; }
        return e.tt >= C.ringCount * C.ringGap;
      } },
    call: { warn: 0.5, aim: (e) => warnShape({ k: 'circle', x: e.x, y: e.y, r: e.r * 1.9, follow: e }, e.ft),
      start: (e) => coreCall(e, e.rage ? BOSS.core.rageCallCount : BOSS.core.callCount), tick: (e) => e.tt >= 0.3 },
    blast: { warn: 1.1, aim: (e) => warnShape({ k: 'circle', x: e.x, y: e.y, r: BOSS.core.blastR * s.zoom, follow: e, fill: true }, e.ft),
      start: (e) => {
        const C = BOSS.core, p = s.player, R = C.blastR * s.zoom;
        if (!s.over && !(p.inv > 0) && Math.hypot(p.x - e.x, p.y - e.y) < R + playerHitR()) hurtPlayer(T.contactDamage.value * C.blastDamage, e);
        ring(e.x, e.y, e.r, R, 0.4, 'enemy', 0, 6); flash(e.x, e.y, R, 0.15, 'white'); s.shake = Math.max(s.shake, 8); sfx('sk_misfire');
        bossRing(e, C.blastWays, C.ringSpeed * 1.2, e.spin);
      },
      tick: (e) => e.tt >= 0.3 },
  };
  function thinkCore(e) {
    const C = BOSS.core;
    e.rage = e.hp / e.maxHp < C.rageAt;
    e.spin += C.spin * (e.rage ? C.rageSpin : 1) * DT * (e.flow === 'rest' ? 0.25 : 1);
    bossFlow(e, CORE_TECH, e.rage ? ['spiral', 'rings', 'call', 'blast'] : ['spiral', 'rings', 'call'], (b) => bossWander(b, C.moveSpeed), C.moveTime);
  }

  // ---------- ハンター ----------
  // 速く飛び回る。技：突進（怒ると2回）・短い3連突進・止まって扇形の弾
  function hunterAim(e, lenMul, wind) {
    const H2 = BOSS.hunter, p = s.player, z = s.zoom;
    e.ang = angTo(e, p);
    e.dashLen = Math.min(H2.maxLen * z * lenMul, Math.hypot(p.x - e.x, p.y - e.y) + H2.over * z);
    e.phase = 'windup'; e.timer = wind; e.windupMax = wind; e.vx = 0; e.vy = 0;
  }
  // 1回の突進。終わったら true
  function hunterDash(e) {
    const H2 = BOSS.hunter, z = s.zoom;
    if (e.phase !== 'dash') { e.phase = 'dash'; e.dashT = e.dashLen / (H2.dashSpeed * z); setVel(e, Math.cos(e.ang), Math.sin(e.ang), H2.dashSpeed * z); sfx('sk_dash'); }
    e.dashT -= DT;
    const m = e.r, W = s.world.w, H = s.world.h;
    if (e.dashT <= 0 || e.x < m || e.x > W - m || e.y < m || e.y > H - m) {
      e.x = clamp(e.x, m, W - m); e.y = clamp(e.y, m, H - m);
      s.shake = Math.max(s.shake, 4); e.vx = 0; e.vy = 0; e.phase = 'land';
      return true;
    }
    return false;
  }
  // n 回続けて突進する（2回目からは wind 秒の予告）
  function hunterDashes(e, n, wind, lenMul) {
    if (e.dn == null) { e.dn = 0; e.sub = 0; }
    if (e.sub > 0) { e.sub -= DT; e.timer = e.sub; e.vx = 0; e.vy = 0; return false; }
    if (hunterDash(e)) { e.dn++; if (e.dn >= n) { e.dn = null; return true; } hunterAim(e, lenMul, wind); e.sub = wind; }
    return false;
  }
  const HUNTER_TECH = {
    dash: { warn: 1.0, aim: (e) => hunterAim(e, 1, e.ft), warnTick: (e) => { e.timer = e.ft; },
      tick: (e) => hunterDashes(e, e.rage ? 2 : 1, BOSS.hunter.rageWindup, 1) },
    triple: { warn: 0.7, aim: (e) => hunterAim(e, BOSS.hunter.tripleLen, e.ft), warnTick: (e) => { e.timer = e.ft; },
      tick: (e) => hunterDashes(e, 3, BOSS.hunter.tripleWindup * (e.rage ? 0.8 : 1), BOSS.hunter.tripleLen) },
    fan: { warn: 0.7,
      aim: (e) => { const H2 = BOSS.hunter; e.phase = 'aim'; e.fanA = angTo(e, s.player); e.ang = e.fanA; warnShape({ k: 'fan', x: e.x, y: e.y, a: e.fanA, spread: H2.fanSpread, len: 260 * s.zoom, follow: e }, e.ft); },
      start: (e) => { e.shotN = 0; },
      tick: (e) => {
        const H2 = BOSS.hunter, n = e.rage ? H2.fanWays + 2 : H2.fanWays;
        while (e.shotN < H2.fanVolleys && e.tt >= e.shotN * H2.fanGap) {
          const a0 = angTo(e, s.player) * 0.5 + e.fanA * 0.5;
          for (let k = 0; k < n; k++) bossShot(e, a0 + (k / (n - 1) - 0.5) * H2.fanSpread, H2.fanSpeed);
          e.shotN++;
        }
        return e.tt >= H2.fanVolleys * H2.fanGap;
      } },
  };
  function hunterFly(e) {
    const H2 = BOSS.hunter, p = s.player, z = s.zoom;
    e.phase = 'move';
    if (e.wx == null || Math.hypot(e.wx - e.x, e.wy - e.y) < 20 * z) {
      for (let k = 0; k < 8; k++) { e.wx = rand(0.12, 0.88) * s.world.w; e.wy = rand(0.12, 0.7) * s.world.h; if (Math.hypot(e.wx - p.x, e.wy - p.y) > H2.keep * z) break; }
    }
    setVel(e, e.wx - e.x, e.wy - e.y, H2.speed * z);
    e.ang = Math.atan2(e.vy, e.vx);
  }
  function thinkHunter(e) {
    const H2 = BOSS.hunter;
    e.rage = e.hp / e.maxHp < H2.rageAt;
    bossFlow(e, HUNTER_TECH, e.rage ? ['dash', 'triple', 'fan', 'dash'] : ['dash', 'triple', 'fan'], hunterFly, H2.moveTime);
    if (e.flow === 'rest') e.phase = 'recover';
  }

  // ---------- 双子 ----------
  // 2体で本体をはさんで回る。HPバーは2体の合計
  function makeTwin(slot, x, y, hp, maxHp) {
    return { kind: 'twin', boss: true, name: BOSS.twin.name, tier: 1, slot, side: 1, x, y, r: BOSS.twin.radius * s.zoom, hp, maxHp,
      vx: 0, vy: 0, ang: 0, flash: 0, speedMul: 1, shield: 0, shieldMax: 0, fireCd: BOSS.twin.every * (slot + 1) / 2, rage: false };
  }
  function twinPos(slot, solo) {
    const T2 = BOSS.twin, tw = s.twin, z = s.zoom, m = T2.radius * z;
    const a = tw.a + (solo ? 0 : slot * Math.PI);
    return { x: clamp(tw.cx + Math.cos(a) * T2.orbit * z, m, s.world.w - m), y: clamp(tw.cy + Math.sin(a) * T2.orbit * z, m, s.world.h - m) };
  }
  function spawnTwins() {
    const T2 = BOSS.twin, p = s.player;
    const total = PH.hpRateBase * growthOf(s.phase) * BOSS.hpSeconds;
    s.twin = { cx: p.x, cy: p.y, a: Math.PI, tether: { st: 'off', t: T2.tetherOff }, dead: null, total };
    for (const slot of [0, 1]) {
      const q = twinPos(slot, false);
      const e = makeTwin(slot, q.x, q.y, total / 2, total / 2);
      s.enemies.push(e);
      ring(e.x, e.y, 4, e.r * 3, 0.6, 'enemy', 0, 6);
    }
    s.boss = { name: T2.name, hp: total, maxHp: total, twin: true };
    s.shake = Math.max(s.shake, 8);
  }
  function aliveTwins() { return s.enemies.filter((e) => e.kind === 'twin' && e.hp > 0); }
  // 双子：2体で1つの流れ（s.twin が流れを持つ）。技：扇形の弾・2体の間の光の線・反対側から同時に突進
  //   片方が倒れると、残った方は全方向の弾と扇形の弾だけになり、回るのが速くなる
  const TWIN_TECH = {
    fan: { warn: 0.6,
      aim: () => { for (const e of aliveTwins()) warnShape({ k: 'fan', x: e.x, y: e.y, a: angTo(e, s.player), spread: BOSS.twin.fanSpread * 2, len: 220 * s.zoom, follow: e, aimAt: 'player' }, s.twin.ft); },
      start: () => { s.twin.shotN = 0; },
      tick: () => {
        const T2 = BOSS.twin, tw = s.twin;
        while (tw.shotN < 2 && tw.tt >= tw.shotN * 0.5) {
          for (const e of aliveTwins()) { const base = angTo(e, s.player); for (let k = 0; k < T2.fan; k++) bossShot(e, base + (k - (T2.fan - 1) / 2) * (T2.fanSpread / ((T2.fan - 1) / 2)), T2.bulletSpeed); }
          tw.shotN++;
        }
        return tw.tt >= 0.6;
      } },
    tether: { warn: 0.8, aim: () => { s.twin.tether.st = 'warn'; }, start: () => { s.twin.tether.st = 'on'; },
      tick: () => {
        const T2 = BOSS.twin, live = aliveTwins(), p = s.player;
        if (live.length < 2) return true;
        if (!(p.inv > 0) && !s.over) { const [a, b] = live; if (segDist(a.x, a.y, b.x, b.y, p.x, p.y) < p.r + T2.tetherWidth * s.zoom) hurtPlayer(T.contactDamage.value * T2.tetherDamage, null); }
        return s.twin.tt >= T2.tetherOn;
      },
      end: () => { s.twin.tether.st = 'off'; } },
    pincer: { warn: 0.9,
      aim: () => {
        const T2 = BOSS.twin, p = s.player, z = s.zoom;
        s.twin.hold = true;
        for (const e of aliveTwins()) {
          const a = angTo(e, p), L = Math.hypot(p.x - e.x, p.y - e.y) + T2.pincerOver * z;
          e.pa = a; e.pLeft = L; e.ang = a;
          warnShape({ k: 'line', x1: e.x, y1: e.y, x2: e.x + Math.cos(a) * L, y2: e.y + Math.sin(a) * L, w: e.r }, s.twin.ft);
        }
      },
      start: () => { sfx('sk_dash'); },
      tick: () => {
        const T2 = BOSS.twin, z = s.zoom; let moving = 0;
        for (const e of aliveTwins()) {
          if (e.pLeft > 0) { const st = Math.min(e.pLeft, T2.pincerSpeed * z * DT); e.x += Math.cos(e.pa) * st; e.y += Math.sin(e.pa) * st; e.pLeft -= st; moving++; e.x = clamp(e.x, e.r, s.world.w - e.r); e.y = clamp(e.y, e.r, s.world.h - e.r); }
        }
        return !moving;
      },
      end: () => {
        const tw = s.twin, live = aliveTwins();
        // 今いる場所から、また回り始める
        const cx = live.reduce((v, e) => v + e.x, 0) / Math.max(1, live.length), cy = live.reduce((v, e) => v + e.y, 0) / Math.max(1, live.length);
        tw.cx = cx; tw.cy = cy; if (live[0]) tw.a = Math.atan2(live[0].y - cy, live[0].x - cx) - (live.length > 1 ? live[0].slot * Math.PI : 0);
        tw.hold = false; s.shake = Math.max(s.shake, 5);
      } },
    burst: { warn: 0.6, aim: () => { for (const e of aliveTwins()) warnShape({ k: 'circle', x: e.x, y: e.y, r: e.r * 2, follow: e }, s.twin.ft); },
      start: () => { s.twin.shotN = 0; },
      tick: () => {
        const T2 = BOSS.twin, tw = s.twin;
        while (tw.shotN < 2 && tw.tt >= tw.shotN * 0.45) { for (const e of aliveTwins()) bossRing(e, T2.rageWays, T2.bulletSpeed, tw.shotN * Math.PI / T2.rageWays); tw.shotN++; }
        return tw.tt >= 0.5;
      } },
  };
  function updateTwins() {
    const T2 = BOSS.twin, tw = s.twin, p = s.player, z = s.zoom;
    const live = aliveTwins();
    if (!live.length && !tw.dead) return;
    const solo = live.length === 1;
    tw.rage = solo;
    bossFlow(tw, TWIN_TECH, solo ? ['burst', 'fan'] : ['fan', 'tether', 'pincer'], () => {}, T2.moveTime);
    // 回る中心は、本体をゆっくり追う（突進中・すきの間は止まる）
    if (!tw.hold) {
      const dx = p.x - tw.cx, dy = p.y - tw.cy, d = Math.hypot(dx, dy), step = T2.follow * z * DT;
      if (d <= step) { tw.cx = p.x; tw.cy = p.y; } else { tw.cx += dx / d * step; tw.cy += dy / d * step; }
      if (tw.flow !== 'rest') tw.a += T2.spin * (solo ? T2.rageSpin : 1) * DT;
    }
    // 復活：片方が倒れてから時間内にもう片方を倒せないと、戻ってくる
    if (tw.dead && solo) {
      tw.dead.t -= DT;
      if (tw.dead.t <= 0) {
        const e = makeTwin(tw.dead.slot, tw.dead.x, tw.dead.y, tw.dead.maxHp * T2.reviveHp, tw.dead.maxHp);
        s.enemies.push(e);
        live[0].rage = false;
        tw.a = Math.atan2(live[0].y - tw.cy, live[0].x - tw.cx) - live[0].slot * Math.PI;
        ring(e.x, e.y, 4, e.r * 3, 0.6, 'enemy', 0, 6);
        flash(e.x, e.y, e.r * 4, 0.3, 'white');
        s.banner = { text: '復活', sub: '', t: 1 };
        tw.dead = null;
        tw.tether.st = 'off';
      }
    }
    const now = aliveTwins();
    if (s.boss && s.boss.twin) s.boss.hp = now.reduce((v, e) => v + e.hp, 0);
  }
  function thinkTwin(e) {
    const p = s.player, tw = s.twin;
    if (!tw) return;
    e.vuln = tw.flow === 'rest';
    e.flow = tw.flow;
    if (tw.hold) { e.vx = 0; e.vy = 0; return; }   // 突進は updateTwins の技が動かす
    const live = aliveTwins(), solo = live.length === 1;
    const q = twinPos(e.slot, solo);
    const dx = q.x - e.x, dy = q.y - e.y, d = Math.hypot(dx, dy);
    const sp = Math.min(d * 5, 320 * s.zoom);
    if (d > 0.5) setVel(e, dx, dy, sp); else { e.vx = 0; e.vy = 0; }
    const o = live.find((x) => x !== e);
    const tx = o && !solo ? o.x : p.x, ty = o && !solo ? o.y : p.y;
    e.ang = Math.atan2(ty - e.y, tx - e.x);
  }

  // ---------- 時計 ----------
  // 左右にゆっくり動く（ときどき真ん中へ瞬間移動）。技：針で1周なぎ払う・時間停止・12方向に順番に撃つ
  //   怒ると、逆回りの短い針が加わり、「真ん中へ瞬間移動して弾の輪」が増える
  function clockHands(e) {
    const C = BOSS.clock, z = s.zoom;
    const a = e.handA + Math.PI * 2 * (e.sweepK || 0);
    const hands = [{ a, len: C.hand * z }];
    if (e.rage) hands.push({ a: e.handA + Math.PI - Math.PI * 2 * (e.sweepK || 0), len: C.rageHand * z });
    return hands;
  }
  function clockDrift(e) {
    const C = BOSS.clock, W = s.world.w;
    e.clockT = (e.clockT || 0) + DT;
    const tx = W / 2 + Math.sin(e.clockT * C.driftSpeed) * W * C.drift;
    e.vx = (tx - e.x) * 3; e.vy = (s.world.h * C.y - e.y) * 3;
  }
  function clockWarp(e, x, y) {
    flash(e.x, e.y, e.r * 2, 0.15, 'white'); sparks(e.x, e.y, 'enemy', 8, 160);
    e.x = x; e.y = y; e.clockT = Math.asin(clamp((x - s.world.w / 2) / (s.world.w * BOSS.clock.drift), -1, 1)) / BOSS.clock.driftSpeed;
    ring(e.x, e.y, e.r, e.r * 3, 0.4, 'white', 0, 4); sfx('sk_blink');
  }
  const CLOCK_TECH = {
    sweep: { warn: 1.0,
      aim: (e) => { e.phase = 'windup'; e.timer = e.ft; e.windupMax = e.ft; e.sweepK = 0; e.handA = angTo(e, s.player) + Math.PI; },
      warnTick: (e) => { e.timer = e.ft; },
      start: (e) => { e.phase = 'sweep'; },
      tick: (e) => {
        const C = BOSS.clock, p = s.player, z = s.zoom;
        e.vx = 0; e.vy = 0;
        e.sweepK = Math.min(1, e.tt / C.sweep);
        if (!(p.inv > 0) && !s.over) {
          for (const h of clockHands(e)) {
            if (segDist(e.x, e.y, e.x + Math.cos(h.a) * h.len, e.y + Math.sin(h.a) * h.len, p.x, p.y) < playerHitR() + C.handWidth * z) { hurtPlayer(T.contactDamage.value * C.handDamage, null); break; }
          }
        }
        return e.tt >= C.sweep;
      },
      end: (e) => { e.phase = 'idle'; e.sweepK = 0; } },
    stop: { warn: 0.5, aim: (e) => warnShape({ k: 'circle', x: e.x, y: e.y, r: BOSS.clock.rings[BOSS.clock.rings.length - 1] * s.zoom, follow: e }, e.ft),
      start: (e) => {
        const C = BOSS.clock;
        s.timeStop = C.stop; e.placed = 0; sfx('timestop');
        e.stopA = angTo(e, s.player) + Math.PI / C.ways;   // 本体のいる方向は弾のすき間にしておく
        s.banner = { text: '時間停止', sub: '', t: 1 };
        ring(e.x, e.y, e.r, Math.max(s.world.w, s.world.h), 0.5, 'white', 0, 3);
      },
      tick: (e) => {
        const C = BOSS.clock, z = s.zoom;
        e.vx = 0; e.vy = 0;
        const done = 1 - Math.max(0, s.timeStop) / C.stop;
        while (e.placed < C.rings.length && done >= (e.placed + 1) / (C.rings.length + 1)) {
          const R = C.rings[e.placed] * z, sp = C.bulletSpeed * z;
          for (let k = 0; k < C.ways; k++) {
            const a = e.stopA + (k * Math.PI * 2) / C.ways;
            s.enemyShots.push({ x: e.x + Math.cos(a) * R, y: e.y + Math.sin(a) * R, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: EB.radius * z, life: EB.life * 2, damage: EB.damage, from: e, held: true });
            sparks(e.x + Math.cos(a) * R, e.y + Math.sin(a) * R, 'white', 1, 40);
          }
          e.placed++;
        }
        return s.timeStop <= 0;
      } },
    tick: { warn: 0.5, aim: (e) => warnShape({ k: 'circle', x: e.x, y: e.y, r: e.r * 2, follow: e }, e.ft),
      start: (e) => { e.shotN = 0; },
      tick: (e) => {
        const C = BOSS.clock, total = 12 * (e.rage ? C.rageTickRounds : C.tickRounds);
        e.vx = 0; e.vy = 0;
        while (e.shotN < total && e.tt >= e.shotN * C.tickGap) {
          const a = -Math.PI / 2 + (e.shotN % 12) * (Math.PI * 2 / 12) + Math.floor(e.shotN / 12) * (Math.PI / 12);
          bossShot(e, a, C.tickSpeed, 2); bossShot(e, a + Math.PI, C.tickSpeed, 2);
          e.handA = a; e.shotN++;
        }
        return e.tt >= total * C.tickGap;
      } },
    warp: { warn: 0.6,
      aim: (e) => { e.wtx = s.world.w / 2; e.wty = s.world.h * BOSS.clock.warpY; warnShape({ k: 'circle', x: e.wtx, y: e.wty, r: e.r * 1.6 }, e.ft); },
      start: (e) => { clockWarp(e, e.wtx, e.wty); bossRing(e, BOSS.clock.ways, BOSS.clock.bulletSpeed); },
      tick: (e) => { e.vx = 0; e.vy = 0; return e.tt >= 0.3; } },
  };
  function thinkClock(e) {
    const C = BOSS.clock;
    e.rage = e.hp / e.maxHp < C.rageAt;
    if (e.handA == null) { e.handA = 0; e.sweepK = 0; e.clockT = 0; e.phase = 'idle'; }
    bossFlow(e, CLOCK_TECH, e.rage ? ['sweep', 'stop', 'tick', 'warp'] : ['sweep', 'stop', 'tick'], (b) => {
      // 動き始めにときどき、真ん中寄りへ瞬間移動する
      if (b.ft >= C.moveTime - DT * 1.5 && Math.random() < C.warpChance) clockWarp(b, s.world.w * rand(0.3, 0.7), s.world.h * C.y);
      clockDrift(b);
    }, C.moveTime);
  }

  // ---------- 影 ----------
  // 本体の少し前の道をなぞって追ってくる。技：影の分身・本体の通った道に遅れて当たりが出る・消えて近くに現れる
  function shadeFollow(e) {
    const S = BOSS.shade, z = s.zoom;
    const back = Math.round(S.delay / DT);
    const q = e.hist[Math.max(0, e.hist.length - 1 - back)];
    const dx = q.x - e.x, dy = q.y - e.y, d = Math.hypot(dx, dy);
    if (d > 1) setVel(e, dx, dy, Math.min(d * 4, S.speed * z)); else { e.vx = 0; e.vy = 0; }
    e.ang = Math.atan2(e.vy || 0, e.vx || 1);
  }
  const SHADE_TECH = {
    echo: { warn: 0.5, aim: (e) => warnShape({ k: 'circle', x: e.x, y: e.y, r: e.r * 1.8, follow: e }, e.ft),
      start: (e) => {
        const S = BOSS.shade, n = Math.round(S.copy / DT), H = e.hist;
        spawnEcho(e, H.slice(Math.max(0, H.length - n)));
        if (e.rage && H.length > n) spawnEcho(e, H.slice(Math.max(0, H.length - n * 2), H.length - n));
      },
      tick: (e) => e.tt >= 0.2 },
    trace: { warn: 0.9,
      aim: (e) => {
        const S = BOSS.shade, n = Math.round(S.traceTime / DT), H = e.hist;
        e.tracePts = H.slice(Math.max(0, H.length - n)).filter((_, i) => i % 3 === 0).map((q) => ({ x: q.x, y: q.y }));
        warnShape({ k: 'path', pts: e.tracePts, w: S.traceWidth * s.zoom }, e.ft);
      },
      start: (e) => { warnShape({ k: 'path', pts: e.tracePts, w: BOSS.shade.traceWidth * s.zoom, hot: true }, BOSS.shade.traceOn); },
      tick: (e) => {
        const S = BOSS.shade, p = s.player, P2 = e.tracePts;
        if (!(p.inv > 0) && !s.over) {
          for (let i = 1; i < P2.length; i++) if (segDist(P2[i - 1].x, P2[i - 1].y, P2[i].x, P2[i].y, p.x, p.y) < playerHitR() + S.traceWidth * s.zoom) { hurtPlayer(T.contactDamage.value * S.traceDamage, null); break; }
        }
        return e.tt >= S.traceOn;
      } },
    blink: { warn: 0.8,
      aim: (e) => {
        const S = BOSS.shade, p = s.player, z = s.zoom, a = rand(0, Math.PI * 2), m = e.r;
        e.vanish = true; sparks(e.x, e.y, 'enemy', 8, 140); sfx('sk_blink');
        e.bx = clamp(p.x + Math.cos(a) * S.blinkDist * z, m, s.world.w - m); e.by = clamp(p.y + Math.sin(a) * S.blinkDist * z, m, s.world.h - m);
        warnShape({ k: 'circle', x: e.bx, y: e.by, r: e.r * 1.3 }, e.ft);
      },
      warnTick: (e) => { e.vx = 0; e.vy = 0; },
      start: (e) => { const S = BOSS.shade; e.x = e.bx; e.y = e.by; e.vanish = false; ring(e.x, e.y, e.r, e.r * 3, 0.4, 'enemy', 0, 5); bossRing(e, S.blinkWays, S.blinkSpeed); s.shake = Math.max(s.shake, 4); },
      tick: (e) => e.tt >= 0.3 },
  };
  function thinkShade(e) {
    const S = BOSS.shade, p = s.player;
    e.rage = e.hp / e.maxHp < S.rageAt;
    if (!e.hist) e.hist = [];
    e.hist.push({ x: p.x, y: p.y });
    const keep = Math.round((S.copy * 2) / DT) + 1;
    if (e.hist.length > keep) e.hist.splice(0, e.hist.length - keep);
    bossFlow(e, SHADE_TECH, e.rage ? ['echo', 'trace', 'blink', 'echo'] : ['echo', 'trace', 'blink'], shadeFollow, S.moveTime);
  }
  function spawnEcho(src, pts) {
    const S = BOSS.shade, z = s.zoom;
    if (pts.length < 2) return;
    // 3刻みに間引いた道（描く用）と、刻みごとの道（なぞる用）
    const path = pts.filter((_, i) => i % 3 === 0 || i === pts.length - 1).map((q) => ({ x: q.x, y: q.y }));
    const hp = PH.hpRateBase * growthOf(s.phase) * S.echoHp;
    const e = { kind: 'echo', tier: 1, x: pts[0].x, y: pts[0].y, r: S.echoRadius * z, hp, maxHp: hp, vx: 0, vy: 0, ang: 0, flash: 0, speedMul: 1, shield: 0, shieldMax: 0,
      path, steps: pts.map((q) => ({ x: q.x, y: q.y })), si: 0, pi: 0, wait: S.wait, from: src };
    s.enemies.push(e);
    ring(e.x, e.y, 2, e.r * 2.5, 0.4, 'enemy', 0, 3);
    // 影から分身の始まりへ、黒いすじ
    sparks(src.x, src.y, 'enemy', 4, 80);
  }
  function thinkEcho(e) {
    if (e.wait > 0) { e.wait -= DT; e.vx = 0; e.vy = 0; return; }
    e.si++;
    if (e.si >= e.steps.length) { e.hp = 0; e.selfDestruct = true; enemyDeathFx(e); return; }
    const q = e.steps[e.si];
    e.vx = (q.x - e.x) / DT; e.vy = (q.y - e.y) / DT;
    if (e.vx || e.vy) e.ang = Math.atan2(e.vy, e.vx);
    e.pi = Math.floor(e.si / 3);
  }

  // 才能を選ぶ（i：選んだカードの番号）
  function chooseSkill(i) {
    sfx('pick');
    if (s.mode === 'returning') finishReturn();
    if (s.mode !== 'select') return;
    const ch = s.choices[i];
    // 遊び始めの1枚：取ったら、そのままフェーズ1の操作待ちへ
    if (s.firstPick) {
      if (ch) takeChoice(s, ch);
      s.st = stats(); s.maxHp = s.st.maxHp; s.hp = s.maxHp;
      s.firstPick = false; s.choices = []; s.mode = 'ready';
      return;
    }
    if (ch) takeChoice(s, ch);
    const before = s.maxHp;
    s.st = stats();
    s.maxHp = s.st.maxHp;
    // 最大HPが変わったら、今のHPも同じ割合で合わせる（絶望の淵でなければ全回復のまま）
    s.hp = s.st.curse.abyss ? Math.min(s.maxHp, s.hp * s.maxHp / Math.max(1, before)) : s.maxHp;

    s.phase++;
    s.shards = 0;
    s.pickups = s.pickups.filter((k) => !k.gather);   // 吸い寄せの途中のものは片づける
    s.immortalUsed = false;   // 不老不死はフェーズごとに1回
    if (skLv('keeper') && skLv('shortcut')) skSfx('shortcut');
    // 貯金：たまっていたかけらが戻ってくる
    if (s.bank >= 1) { skSfx('savings'); s.shards = Math.floor(s.bank); s.bank -= Math.floor(s.bank); }
    s.need = needOf(s.phase);
    let sub = '';
    if ((s.phase - 1) % PH.zoomEvery === 0) {
      widenStage();
      sub = 'ステージが広がった！';
    }
    // 本体を最初の位置（ステージの中央やや下）に戻す
    const p = s.player;
    p.x = p.tx = s.world.w / 2;
    p.y = p.ty = s.world.h * 0.62;
    p.catching = true;   // 押したままでも、指の位置へ追いつくまで軌跡に入れない
    ring(p.x, p.y, 4, 60, 0.4, 'white', 0, 3);
    // ボスのフェーズ：少しして、ボスが現れる
    s.bossPhase = bossKindOf(s.phase);
    s.eliteDone = false;
    s.boss = null;
    s.twin = null;
    s.timeStop = 0;
    s.warns = [];
    s.bossDownT = 0;
    if (s.bossPhase) {
      s.bossAppear = BOSS.appear;
      s.bossIntro = { t: 0, name: (CONFIG.enemies[s.bossPhase] || {}).name || 'BOSS' };   // 警告の帯と名前（見出しの「BOSS」の代わり）
      sfx('bossin');
    }
    s.banner = { text: `PHASE ${s.phase}`, sub, t: s.bossPhase ? 0 : 1.6 };   // ボスのフェーズは、登場の演出（警告の帯と名前）が代わりに出る
    s.spawnPool = 0;
    s.nextEnemy = null;
    s.spawnDelay = 1.0;
    s.mode = 'play';
  }

  // ステージを広げる。中身は真ん中に寄せたまま、周りに余白が増える
  function widenStage() {
    const W0 = s.world.w, H0 = s.world.h;
    s.zoom *= PH.zoomFactor;
    s.world = { w: CONFIG.view.width * s.zoom, h: CONFIG.view.height * s.zoom };
    const ox = (s.world.w - W0) / 2, oy = (s.world.h - H0) / 2;
    const p = s.player;
    p.x += ox; p.y += oy; p.tx += ox; p.ty += oy;
    for (const g of s.ghosts) {
      for (const pt of g.clip) { pt.x += ox; pt.y += oy; }
      g.x += ox; g.y += oy;
      g.trail = [];
    }
    for (const tr of s.traps) { tr.x += ox; tr.y += oy; }
    s.fires = []; s.embers = []; s.firePillars = []; s.bolts = []; s.wells = []; s.collapseT = 0; s.fogs = []; s.scythe = null; s.stars = [];
    s.cuts = []; s.slashes = []; s.blinks = [];
    s.widened = { ox, oy, from: W0 };
  }

  function updateEffects() {
    for (const pt of s.particles) stepParticle(pt, DT);
    s.particles = s.particles.filter((pt) => pt.life > 0);
    for (const r of s.rings) r.life -= DT;
    s.rings = s.rings.filter((r) => r.life > 0);
    for (const f of s.flashes) f.life -= DT;
    s.flashes = s.flashes.filter((f) => f.life > 0);
    for (const g of s.ghosts) if (g.spawnGlow > 0) g.spawnGlow -= DT;
    if (s.shake > 0) s.shake = Math.max(0, s.shake - 40 * DT);
    if (s.hurtFlash > 0) s.hurtFlash = Math.max(0, s.hurtFlash - 2.5 * DT);
    if (s.banner.t > 0) s.banner.t -= DT;
  }

  // フェーズクリアのあと：本体がなめらかに真ん中へ戻る（終わったらカード選び）
  const RETURN_TIME = 0.5;
  // クリアのあと、残っていたかけらが本体へ吸い寄せられる
  function updateGather() {
    const p = s.player;
    for (const k of s.pickups) {
      if (!k.gather) continue;
      k.gt += DT;
      const u = clamp((k.gt - k.gd) / 0.32, 0, 1), e = u * u;   // 本体が真ん中へ戻る 0.5 秒の間に集まりきる
      k.x = k.sx + (p.x - k.sx) * e; k.y = k.sy + (p.y - k.sy) * e; k.spin += DT * 12;
      if (u >= 1) { k.done = true; sparks(p.x, p.y, 'shard', 2, 120); sfx('shard', 1.2 + Math.random() * 0.3); }
    }
    s.pickups = s.pickups.filter((k) => !k.done);
  }
  function updateReturn() {
    updateGather();
    const p = s.player, f = s.returnFrom || { x: p.x, y: p.y };
    s.returnT += DT;
    const k = Math.min(1, s.returnT / RETURN_TIME), e = 1 - Math.pow(1 - k, 3);   // はじめ速く、最後はゆっくり止まる
    const cx = s.world.w / 2, cy = s.world.h / 2;
    p.x = p.tx = f.x + (cx - f.x) * e;
    p.y = p.ty = f.y + (cy - f.y) * e;
    if (k >= 1) finishReturn();
  }
  function finishReturn() {
    const p = s.player;
    p.x = p.tx = s.world.w / 2; p.y = p.ty = s.world.h / 2;
    p.svx = p.svy = 0; p.sspd = 0;
    s.mode = 'select';
  }

  // ---------- 1刻み分進める ----------
  function step(input) {
    // 最初は何も動かさず、指で触れる（またはキーを押す）まで待つ
    if (s.mode === 'ready') {
      if (!input.held) { updateEffects(); return; }
      s.mode = 'play';
      s.banner = { text: 'PHASE 1', sub: '', t: 1.6 };
    }
    if (s.mode === 'returning') { updateReturn(); updateEffects(); return; }
    if (s.over || s.mode === 'select') { updateEffects(); return; }
    if (s.hitstop > 0) {
      // 当てた・当たった瞬間のほんの一瞬の停止
      s.hitstop -= DT;
      aim(input);
      return;
    }
    s.time += DT;
    if (s.combo.t > 0) { s.combo.t -= DT; if (s.combo.t <= 0) s.combo.stacks = 0; }
    movePlayer(input);
    updateHp();
    updateRecord(input.held);
    // 時間停止（ボス「時計」）：分身と自分の攻撃は止まる
    if (s.timeStop > 0) s.timeStop -= DT;
    if (s.warns.length) { for (const w of s.warns) { w.t -= DT; if (w.follow) { w.x = w.follow.x; w.y = w.follow.y; } } s.warns = s.warns.filter((w) => w.t > 0); }
    else {
      if (s.volleyCd > 0) s.volleyCd -= DT;
      updateGhosts();
      by('ghost', updateAttacks);
      by('body', updateBody);
    }
    updateBoss();
    updateEnemies();
    updatePickups();
    updateEffects();
  }

  // カードを引き直す（コインの出し入れは外でする）
  function reroll() {
    sfx('reroll');
    if (s.mode === 'returning') finishReturn();
    if (s.mode !== 'select') return false;
    s.choices = rollChoices(s, { afterBoss: !!s.choiceAfterBoss, first: !!s.firstPick });
    s.rerolls++;
    return true;
  }

  // 試作用：すぐにフェーズクリアにする
  function debugClearPhase() {
    if (s.mode === 'play' && !s.over) clearPhase();
  }

  reset();
  // 遊び始めに、スキルを1つ選ぶ（フェーズ1の前）
  function firstPick() {
    s.firstPick = true; s.choiceAfterBoss = false;
    s.choices = rollChoices(s, { first: true });
    s.mode = 'select';
  }
  return { state: s, step, reset, chooseSkill, reroll, debugClearPhase, firstPick };
}
