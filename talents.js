// 才能の定義と、カードの抽選。
//   ブースト（数値が上がる）10個・カース（縛りと引き換えに強くなる）11個・スキル（道ごとに足していく）。
//   取ったブーストは state.owned に { lv, cycles } で持つ（cycles＝「繰り返し」でLv5を超えた回数）。
//   スキルは state.skills に { lv, evo }（evo＝進化したか）、カースは state.curses に名前（id）の一覧で持つ。
//   効果の計算は game.js の stats()。ここは「何があって、何が出るか」だけを決める。

import { CONFIG } from './config.js?v=20261123144016';
import { SKILL_ROADS, SKILL_BY_ID, SKILL_MAX } from './skilldefs.js?v=20261123144016';

// ---------- ブースト ----------
//   per：1レベルで上がる割合、repeat：Lv5の後もLv1から取り直せる、bonus：「名前：説明」
export const BOOSTS = [
  { id: 'atk', name: '攻撃力＋', icon: 'atk', per: 0.20, repeat: true,
    desc: '攻撃力 +20%', bonus: '会心の一撃：たまにダメージが2倍になる' },
  { id: 'rate', name: '攻撃速度＋', icon: 'rate', per: 0.15, repeat: true,
    desc: '攻撃の回数 +15%', bonus: '連撃ブースト：当て続けるほど攻撃が速くなる' },
  { id: 'area', name: '範囲＋', icon: 'area', per: 0.10,
    desc: '効果の広さ +10%', bonus: '衝撃波：敵を倒すと衝撃波が出る' },
  { id: 'dur', name: '持続時間＋', icon: 'dur', per: 0.15,
    desc: '残るものの時間 +15%', bonus: 'スロウフィールド：残るものに触れた敵が遅くなる',
    // 残るものを出すスキル（罠の道）を持っているときだけ出る
    when: (s) => hasLingering(s) },
  // 軌跡＋：前の「軌跡の総量＋」と「軌跡の長さ＋」を1つにまとめたもの
  { id: 'budget', name: '軌跡＋', icon: 'budget', per: 0.15, repeat: true,
    desc: '置いておける軌跡と、1回で描ける長さ +15%', bonus: 'フルチャージ：上限まで描いた分身が強くなる' },
  { id: 'gspeed', name: '分身の速さ＋', icon: 'gspeed', per: 0.13,
    desc: '分身の動く速さ +13%', bonus: 'ターンバースト：分身が折り返すときに衝撃波を出す' },
  { id: 'hp', name: 'HP＋', icon: 'hp', per: 0.20, repeat: true,
    desc: '最大HP +20%', bonus: '不死身：一度だけ、倒れずに踏みとどまる' },
  { id: 'magnet', name: '磁石＋', icon: 'magnet', per: 0.40,
    desc: 'かけらを吸い取る範囲 +40%', bonus: 'ブラックホール：10秒ごとに、画面中のかけらが少し寄ってくる' },
  { id: 'shard', name: 'かけら＋', icon: 'shard', per: 0.10,
    desc: '敵が落とすかけら +10%', bonus: 'ゴールドラッシュ：大きな敵が金のかけらを落とす' },
  { id: 'limit', name: '限界突破', icon: 'limit', per: 0.05, repeat: true,
    desc: '攻撃力・攻撃速度・最大HP・軌跡 +5%',
    // ほかのブーストのどれかがLv5になってから出る（最初からは出さない）
    when: (s) => BOOSTS.some((o) => o.id !== 'limit' && completionsOf(s, o.id) > 0) },
];
export const BOOST_MAX = 5;

// ---------- カース ----------
//   bans：取った後に出なくなる才能、clash：すでに持っていると、このカースは出ない
export const CURSES = [
  { id: 'brush', name: '呪われた筆', bind: '命中80%以上のまっすぐな線しか分身にならない', reward: '分身の攻撃力2倍',
    clash: ['lost'] },
  { id: 'doom', name: '破滅への誘い', bind: '最大HPが半分', reward: 'すべての攻撃力 +50%' },
  { id: 'lonely', name: '孤独な王', bind: '分身が1体のみになる', reward: '軌跡を全部1体に使え、攻撃力 +50%',
    clash: ['lost'] },
  { id: 'lost', name: '失われた影', bind: '描くモードが使えず、分身が作れない', reward: '本体が体当たりで戦え、最大HP2倍',
    bans: ['gspeed', 'budget'], clash: ['gspeed', 'budget', 'brush', 'lonely', 'hourglass', 'trigger'] },
  { id: 'hourglass', name: '死の砂時計', bind: '分身が20秒で消える', reward: '分身の攻撃速度2倍',
    clash: ['lost'] },
  { id: 'hungry', name: '飢えた手', bind: 'かけらを吸い寄せる範囲がとても狭くなる', reward: '落ちるかけら5倍',
    bans: ['magnet'], clash: ['magnet'] },
  { id: 'reaper', name: '死神の契約', bind: 'HPが自然に回復しない', reward: '攻撃に即死の力が宿る' },
  { id: 'trigger', name: '狂った引き金', bind: '分身の弾が大きくぶれる（まっすぐな線でも左右に最大30度）', reward: '分身が撃つ回数3倍',
    clash: ['lost'] },
  { id: 'chain', name: '重い鎖', bind: '本体の動きが半分の速さ（描くモードの遅さとは重ならない）', reward: '最大HP2倍。本体が大きくなる' },
  { id: 'memory', name: '記憶の呪い', bind: 'スキルのレベルが上がらない', reward: 'カードが5枚から選べる' },
  { id: 'abyss', name: '絶望の淵', bind: 'フェーズクリアでHPが回復しない', reward: 'レア以上のカードが出やすい' },
];

export const BOOST_BY_ID = Object.fromEntries(BOOSTS.map((b) => [b.id, b]));
export const CURSE_BY_ID = Object.fromEntries(CURSES.map((c) => [c.id, c]));

// 残るもの（罠・炎など）を出すスキルを持っているか。スキルを足したらここで判定する
// 罠の道のスキルを1つでも持つと、残るもの（罠）があるので「持続時間＋」が出る
function hasLingering(s) { return Object.keys(s.skills || {}).some((id) => SKILL_BY_ID[id] && SKILL_BY_ID[id].road === 'trap'); }

// ---------- レベルの読み方 ----------
export const owns = (s, id) => !!s.owned[id] || s.curses.includes(id);
export const lvOf = (s, id) => (s.owned[id] ? s.owned[id].lv : 0);
// 効果の合計段数（繰り返しで取り直した分も足す）
export function stacksOf(s, id) {
  const o = s.owned[id];
  return o ? o.cycles * BOOST_MAX + o.lv : 0;
}
// Lv5に達した回数（＝最大ボーナスの強さ）
export function completionsOf(s, id) {
  const o = s.owned[id];
  if (!o) return 0;
  return o.cycles + (o.lv >= BOOST_MAX ? 1 : 0);
}

// ---------- 抽選 ----------
const RARITIES = ['normal', 'rare', 'super', 'mythic'];
const GAIN = { normal: 1, rare: 2, super: 3 };

function rollRarity(s, floor) {
  const table = s.curses.includes('abyss') ? CONFIG.talent.rarityAbyss : CONFIG.talent.rarity;
  const w = RARITIES.map((r, i) => (i < RARITIES.indexOf(floor) ? 0 : table[r]));
  let roll = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < RARITIES.length; i++) {
    roll -= w[i];
    if (roll <= 0) return RARITIES[i];
  }
  return floor;
}

// 取った後に出なくなる才能（カースのせいで意味がなくなるもの）
function banned(s) {
  const out = new Set();
  for (const id of s.curses) for (const b of CURSE_BY_ID[id].bans || []) out.add(b);
  return out;
}

// 今、候補になるブースト
function boostPool(s) {
  const ban = banned(s);
  return BOOSTS.filter((b) => {
    if (ban.has(b.id)) return false;
    if (b.when && !b.when(s)) return false;
    return b.repeat || lvOf(s, b.id) < BOOST_MAX;   // 繰り返せないものは最大になったら出ない
  });
}

// 今、候補になるカース（持っているものと、持っている才能と矛盾するものは出さない）
function cursePool(s) {
  return CURSES.filter((c) => !s.curses.includes(c.id) && !(c.clash || []).some((id) => owns(s, id) || !!s.skills[id]));
}

// 今、候補になるスキル（rarity：そのカードのレアリティ。奥義はスーパーレア以上だけ）
//   出る順：入口 → 入口を持つと目覚め → 目覚めを持つと、その型のほかのスキル。分岐は片方だけ
//   同じ道で持てる型は1つ（目覚めを1つ取ると、同じ道のほかの目覚めは出ない）。違う道の型は一緒に持てる
//   入口を取ったら目覚めが、目覚めを取ったら型がそろうまで、ほかの道・型の新しいスキルは出ない
//   Lv5のものがもう一度出ると進化。記憶の呪いでは、持っているスキルは出ない（レベルも進化もない）
const SKILL_LIST = SKILL_ROADS.flatMap((r) => r.skills.map((k) => SKILL_BY_ID[k.id]));
// 道ごとの目覚め（＝型）の一覧
const WAKES = Object.fromEntries(SKILL_ROADS.map((r) => [r.id, r.skills.filter((k) => k.kind === '目覚め').map((k) => k.id)]));
// 奥義のレベルの上限（ふつうは1。天の光のように本数が増えるものだけ多い）
const ougiMax = (k) => k.text.max || 1;

// 型がそろったか：目覚め・分岐（どちらか）・両立の3つを持っている（奥義は待つと長くなるので入れない）
function typeDone(s, wakeId) {
  const kinds = SKILL_LIST.filter((k) => k.type === wakeId && s.skills[k.id]).map((k) => k.kind);
  return kinds.includes('目覚め') && kinds.includes('分岐') && kinds.includes('両立');
}

// 今そろえている途中のもの（その間は、ほかの道・型の新しいスキルは出さない）
//   { type }：目覚めを取ったが、まだそろっていない型
//   { road }：入口を取ったが、まだ目覚めを取っていない道
function building(s) {
  for (const id of Object.keys(s.skills)) {
    const k = SKILL_BY_ID[id];
    if (k.kind === '目覚め' && !typeDone(s, k.id)) return { type: k.id };
  }
  for (const id of Object.keys(s.skills)) {
    const k = SKILL_BY_ID[id];
    if (k.kind === '入口' && !WAKES[k.road].some((w) => s.skills[w])) return { road: k.road };
  }
  return null;
}

function skillPool(s, rarity) {
  const memory = s.curses.includes('memory');
  const high = RARITIES.indexOf(rarity) >= RARITIES.indexOf('super');
  const busy = building(s);
  return SKILL_LIST.filter((k) => {
    if (!k.text) return false;                       // 効果がまだ入っていない
    const o = s.skills[k.id];
    // 持っているもののレベル上げ・進化はいつでも出る（奥義は、本数が増える天の光だけ。スーパーレア以上で）
    if (o) return !memory && !o.evo && (k.kind !== '奥義' || (high && o.lv < ougiMax(k)));
    // 型をそろえている途中は、その型（または、その道の目覚め）だけ
    if (busy && busy.type && k.type !== busy.type) return false;
    if (busy && busy.road && !(k.road === busy.road && k.kind === '目覚め')) return false;
    if (k.kind === '奥義' && !high) return false;
    if (k.need && !s.skills[k.need]) return false;
    // 同じ道では、型は1つだけ（ほかの型の目覚めを持っていたら、この目覚めは出ない）
    if (k.kind === '目覚め' && WAKES[k.road].some((id) => id !== k.id && s.skills[id])) return false;
    if (k.rival && s.skills[k.rival]) return false;
    return true;
  });
}

// カードの色（本体の道だけ、本体の色を使う）
const roadColor = (k) => (k.road === 'body' ? 'player' : k.road);

const pickOut = (arr) => arr.splice(Math.floor(Math.random() * arr.length), 1)[0];

// フェーズクリアで出すカードを n 枚選ぶ。afterBoss ならスーパーレア以上だけ
//   枠ごとに、先にレアリティを決めてから、そのレアリティで出せるものを選ぶ
// first：遊び始めの1枚目（スキルだけ。強化・カースは出さない）
export function rollChoices(s, { afterBoss = false, first = false } = {}) {
  // 豊年（近道の進化）：4枚から選べる
  const n = s.curses.includes('memory') ? 5 : s.skills && s.skills.shortcut && s.skills.shortcut.evo ? 4 : 3;
  const floor = afterBoss ? 'super' : 'normal';
  const boosts = first ? [] : boostPool(s);
  const curses = first ? [] : cursePool(s);
  const used = new Set();
  const out = [];
  let curseShown = false;
  for (let tries = 0; out.length < n && tries < n * 4; tries++) {
    const rarity = rollRarity(s, floor);
    const skills = skillPool(s, rarity).filter((k) => !used.has(k.id));
    const left = boosts.filter((b) => !used.has(b.id));
    if (!skills.length && !left.length && (curseShown || !curses.length)) break;
    // カードの枠ごとに、決まった確率でカースにする（1回に出すカースは1枚まで）
    const takeCurse = curses.length && !curseShown && (Math.random() < CONFIG.talent.curseChance || (!skills.length && !left.length));
    if (takeCurse) {
      const c = pickOut(curses);
      out.push({ id: c.id, kind: 'curse', rarity: 'super' });
      curseShown = true;
      continue;
    }
    const takeSkill = skills.length && (!left.length || Math.random() < CONFIG.talent.skillChance);
    if (takeSkill) {
      const k = pickOut(skills);
      used.add(k.id);
      out.push({ id: k.id, kind: 'skill', rarity });
    } else if (left.length) {
      const b = pickOut(left);
      used.add(b.id);
      out.push({ id: b.id, kind: 'boost', rarity });
    }
  }
  return out;
}

// ---------- 取る ----------
// 返り値：Lv5（最大）に達したか（演出用）
export function takeChoice(s, ch) {
  if (ch.kind === 'curse') {
    if (!s.curses.includes(ch.id)) s.curses.push(ch.id);
    return false;
  }
  if (ch.kind === 'skill') {
    const k = SKILL_BY_ID[ch.id];
    const o = s.skills[ch.id] || (s.skills[ch.id] = { lv: 0, evo: false });
    if (k.kind === '奥義') { o.lv = Math.min(ougiMax(k), o.lv + 1); return false; }
    const step = skillStep(s, ch);
    if (step.evolve) { o.lv = SKILL_MAX; o.evo = true; return true; }
    o.lv = step.to;
    return false;
  }
  const def = BOOST_BY_ID[ch.id];
  const o = s.owned[ch.id] || (s.owned[ch.id] = { lv: 0, cycles: 0 });
  if (o.lv >= BOOST_MAX && def.repeat) { o.cycles++; o.lv = 0; }   // 繰り返し：Lv1から取り直す
  const before = o.lv;
  o.lv = ch.rarity === 'mythic' ? BOOST_MAX : Math.min(BOOST_MAX, o.lv + GAIN[ch.rarity]);
  return before < BOOST_MAX && o.lv >= BOOST_MAX;
}

// スキルのカードを取ると、どうなるか（evolve：進化する、to：上がった後のLv）
//   Lv5でもう一度出る → 進化。ミシック → いきなり進化した状態（記憶の呪いではどちらもなし）
//   記憶の呪い：初めて取るときもLv1のまま
function skillStep(s, ch) {
  const o = s.skills[ch.id];
  const lv = o ? o.lv : 0;
  const memory = s.curses.includes('memory');
  if (!memory && (lv >= SKILL_MAX || ch.rarity === 'mythic')) return { evolve: true, lv, to: SKILL_MAX };
  return { evolve: false, lv, to: memory ? Math.max(1, lv) : Math.min(SKILL_MAX, lv + GAIN[ch.rarity === 'mythic' ? 'super' : ch.rarity]) };
}

// スキル1つの表示（進化していれば進化後の名前と説明）
function skillLook(k, evo) {
  const named = !!k.text.evo;
  return evo
    ? { name: named ? k.text.evo : k.name, kiwami: !named, evolved: true, from: k.name, desc: k.text.evoDesc }
    : { name: k.name, desc: k.text.desc };
}

// ---------- カードに出す中身（ui.js の cardView に渡す形） ----------
export function choiceView(s, ch) {
  if (ch.kind === 'curse') {
    const c = CURSE_BY_ID[ch.id];
    return { kind: 'curse', color: 'curse', icon: c.id, name: c.name, bind: c.bind, reward: c.reward };
  }
  if (ch.kind === 'skill') {
    const k = SKILL_BY_ID[ch.id];
    const base = { kind: 'skill', sub: k.kind, road: k.roadName, color: roadColor(k), icon: `sk_${k.id}`, rarity: ch.rarity };
    if (k.kind === '奥義') {
      const max = ougiMax(k), lv = s.skills[ch.id] ? s.skills[ch.id].lv : 0;
      return max > 1 ? { ...base, ...skillLook(k, false), lv, gain: 1, max } : { ...base, ...skillLook(k, false), max: 1 };
    }
    const step = skillStep(s, ch);
    if (step.evolve) return { ...base, ...skillLook(k, true), max: SKILL_MAX };
    return { ...base, ...skillLook(k, false), lv: step.lv, gain: step.to - step.lv, max: SKILL_MAX };
  }
  const b = BOOST_BY_ID[ch.id];
  const o = s.owned[ch.id];
  // 繰り返しでLv5のものは、次はLv1からの取り直しとして見せる
  const lv = o ? (o.lv >= BOOST_MAX && b.repeat ? 0 : o.lv) : 0;
  const maxOut = ch.rarity === 'mythic';
  return {
    kind: 'boost', road: '共通', color: 'boost', icon: b.icon, rarity: ch.rarity,
    name: b.name, lv, gain: maxOut ? BOOST_MAX - lv : Math.min(BOOST_MAX - lv, GAIN[ch.rarity]), max: BOOST_MAX, maxOut,
    desc: b.desc,
    // 最大になるカードのときだけボーナスを見せる
    bonus: b.bonus && (maxOut || lv + GAIN[ch.rarity] >= BOOST_MAX) ? b.bonus : '',
  };
}

// 取得した才能の一覧に出す中身（取った順ではなく、ブースト→スキル→カースの順）
export function ownedViews(s) {
  const out = [];
  for (const b of BOOSTS) {
    const o = s.owned[b.id];
    if (!o) continue;
    // Lv5を超えて取り直した分は、Lv5になった1枚ずつと、今育てている1枚を別々に並べる
    const one = (lv, bonus) => ({ kind: 'boost', road: '共通', color: 'boost', icon: b.icon, name: b.name, lv, max: BOOST_MAX, desc: b.desc, bonus: bonus ? b.bonus : '', cycles: 0 });
    for (let i = 0; i < (o.cycles || 0); i++) out.push(one(BOOST_MAX, true));
    if (o.lv > 0 || !o.cycles) out.push(one(o.lv, o.lv >= BOOST_MAX));
  }
  for (const k of SKILL_LIST) {
    const o = s.skills[k.id];
    if (!o) continue;
    out.push({
      kind: 'skill', sub: k.kind, road: k.roadName, color: roadColor(k), icon: `sk_${k.id}`,
      ...skillLook(k, o.evo), lv: o.lv, max: k.kind === '奥義' ? ougiMax(k) : SKILL_MAX,
    });
  }
  for (const id of s.curses) {
    const c = CURSE_BY_ID[id];
    out.push({ kind: 'curse', color: 'curse', icon: c.id, name: c.name, bind: c.bind, reward: c.reward });
  }
  return out;
}

// ---- 見た目：取ったスキルから、本体と分身の形（look）を組み立てる ----
//   道ごとに { type: 目覚めの id, entry: 入口を持つか, parts: 分岐・両立・奥義, evo: 進化・極, first: その道を最初に取った順 }
function roadLooks(s) {
  const by = {};
  let order = 0;
  for (const [id, o] of Object.entries(s.skills || {})) {
    const k = SKILL_BY_ID[id];
    if (!k) continue;
    const r = by[k.road] || (by[k.road] = { type: null, entry: false, parts: {}, evo: {}, first: order });
    order++;
    if (k.kind === '入口') r.entry = true;
    else if (k.kind === '目覚め') r.type = id;
    else r.parts[id] = true;
    if (o.evo) r.evo[id] = true;
  }
  return by;
}
// 描く前に毎回呼ぶ（スキルが変わったときだけ作り直す）
export function applyForms(s) {
  const p = s.player;
  if (!p) return;
  const key = Object.entries(s.skills || {}).map(([id, o]) => `${id}${o.evo ? '*' : ''}`).join(',');
  if (p.formKey === key) return;
  p.formKey = key;
  const by = roadLooks(s);
  // 分身：分身の道の形に、現象の道（まとうもの）を重ねる
  const g = by.ghost, ph = by.phenom;
  s.ghostLook = g || ph ? {
    type: g ? g.type : null, entry: g ? g.entry : false,
    parts: { ...(g ? g.parts : {}), ...(ph ? ph.parts : {}) },
    evo: { ...(g ? g.evo : {}), ...(ph ? ph.evo : {}) },
    elem: ph ? ph.type : null,
  } : null;
  // 本体：本体・衛星・収穫の道。形が2つ以上あるときは、取った順に3秒ごとに切り替わる
  p.look = by.body || null;
  p.olook = by.orbit || null;
  p.hlook = by.harvest || null;
  p.shapeOrder = ['body', 'orbit', 'harvest'].filter((r) => by[r]).sort((a, b) => by[a].first - by[b].first);
}
