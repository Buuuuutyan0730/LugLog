// この端末のブラウザに残す記録（名前・設定・図鑑・成績など）。保存できなくてもゲームは続ける
const KEY = 'afterimage-save';
const OLD_BEST = 'afterimage-best-score';

function defaults() {
  return {
    name: '',                 // 空なら名前登録の画面を出す
    icon: 0,                  // プロフィールのアイコン（ICONS の番号）
    id: `${1000 + Math.floor(Math.random() * 9000)}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`,
    howtoDone: false,         // 遊び方を一度見たか
    settings: { bgm: true, bgmVol: 70, se: true, seVol: 85, control: 'stick', shake: true, glow: 1, v: 2 },
    best: { score: 0, phase: 0 },
    stats: { plays: 0, time: 0, kills: 0, bosses: 0 },
    // 図鑑：スキルは取った回数・極めた回数・持っていた時の最高フェーズ、敵とボスは見た・倒した回数
    zukan: { skills: {}, enemies: {}, bosses: {} },
    newsRead: 0,              // 読んだお知らせの数（新しい順の先頭から）
    coins: 0,                 // コイン（ガチャと引き直しに使う）
    pity: 0,                  // SSRが出ていない回数（ガチャの天井）
    owned: { set: ['std'], bg: ['grid'], icon: ['a0', 'a1', 'a2', 'a3', 'a4', 'a5'], pop: ['std'], title: [], frame: ['f_none'] },   // 持っている着せ替え
    equip: { set: 'std', bg: 'grid', icon: 'a0', pop: 'std', title: '', frame: 'f_none' },                       // 身に着けている着せ替え（pop：撃破のはじけ方）
  };
}

export function loadSave() {
  const d = defaults();
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw) {
      Object.assign(d, raw);
      d.settings = { ...defaults().settings, ...(raw.settings || {}) };
      // スティックができる前の記録：操作方法をスティックにする
      if (!(raw.settings && raw.settings.v >= 2)) { d.settings.control = 'stick'; d.settings.v = 2; }
      if (d.settings.control !== 'stick' && d.settings.control !== 'drag') d.settings.control = 'stick';   // タップはなくした
      d.best = { ...defaults().best, ...(raw.best || {}) };
      d.stats = { ...defaults().stats, ...(raw.stats || {}) };
      d.zukan = { skills: {}, enemies: {}, bosses: {}, ...(raw.zukan || {}) };
      d.owned = { ...defaults().owned, ...(raw.owned || {}) };
      d.equip = { ...defaults().equip, ...(raw.equip || {}) };
      // 前の版：アイコンを番号で覚えていた
      if (typeof raw.icon === 'number' && !raw.equip) d.equip.icon = `a${raw.icon}`;
    } else {
      // 前の版の最高スコアを引きつぐ
      d.best.score = Number(localStorage.getItem(OLD_BEST) || 0);
    }
  } catch (_) { /* 読めなくても初めからで続行 */ }
  return d;
}

export function writeSave(d) {
  try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (_) { /* 保存できなくても続行 */ }
}

// 1回のプレイが終わったときに、成績と図鑑を書き足す。戻り値：最高スコアを更新したか
//   途中でやめたとき（score:false）は、最高記録には入れない
export function recordRun(d, s, roadOf, { score = true } = {}) {
  const isNew = score && s.score > d.best.score;
  if (score) {
    d.best.score = Math.max(d.best.score, s.score);
    d.best.phase = Math.max(d.best.phase, s.phase);
  }
  d.stats.plays++;
  d.stats.time += s.time;
  d.stats.kills += s.kills;
  d.stats.bosses += (s.bossKills || []).length;
  for (const [id, v] of Object.entries(s.skills || {})) {
    if (!roadOf(id)) continue;
    const z = d.zukan.skills[id] || (d.zukan.skills[id] = { taken: 0, evo: 0, best: 0 });
    z.taken++;
    if (v.evo) z.evo++;
    z.best = Math.max(z.best, s.phase);
  }
  const BOSSES = ['core', 'hunter', 'twin', 'clock', 'shade'];
  const box = (k) => { const b = BOSSES.includes(k) ? d.zukan.bosses : d.zukan.enemies; return b[k] || (b[k] = { seen: 0, kills: 0 }); };
  for (const k of s.seenKinds || []) box(k).seen++;
  for (const k of s.bossKills || []) box(k).kills++;
  for (const [k, n] of Object.entries(s.killsByKind || {})) if (!BOSSES.includes(k)) box(k).kills += n;
  // コイン：スコアの平方根（端数は切り捨て）＋倒したボス1体につき30。途中でやめたときはもらえない
  const coins = score ? { score: Math.floor(Math.sqrt(Math.max(0, s.score))), boss: 30 * (s.bossKills || []).length } : null;
  if (coins) d.coins += coins.score + coins.boss;
  writeSave(d);
  return { isNew, coins };
}

// プレイ中に初めて見た敵・ボスを図鑑に入れる（見た回数はプレイごとに1回）
export function recordSeen(d, s) {
  let changed = false;
  for (const k of s.seenKinds || []) {
    const box = ['core', 'hunter', 'twin', 'clock', 'shade'].includes(k) ? d.zukan.bosses : d.zukan.enemies;
    if (!box[k]) { box[k] = { seen: 0, kills: 0 }; changed = true; }
  }
  return changed;
}
