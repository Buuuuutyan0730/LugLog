import { SKILL_ROADS } from './skilldefs.js?v=20261122143515';
// ミッション（デイリーと実績）。報酬はコイン
//   デイリー：候補から毎日3つ（朝4時に入れかわる）。どれも「2回ちゃんと遊べば届く」くらいの量。3つ全部でボーナス
//   実績：ずっと残る。段階ごとに受け取れる
export const DAILY_RESET_HOUR = 4;
export const DAILY_BONUS = 50;
export const DAILY_POOL = [
  { id: 'play', text: '2回プレイする', goal: 2, coins: 30 },
  { id: 'kill', text: '敵を200体倒す', goal: 200, coins: 40 },
  { id: 'ghost', text: '分身を40体生む', goal: 40, coins: 40 },
  { id: 'shard', text: 'かけらを300個集める', goal: 300, coins: 40 },
  { id: 'time', text: '合計10分遊ぶ', goal: 600, coins: 40, unit: 'min' },
  { id: 'reroll', text: '引き直しを1回使う', goal: 1, coins: 30 },
  { id: 'gacha', text: 'ガチャを1回引く', goal: 1, coins: 30 },
  { id: 'road', text: '「{road}」のスキルを3つ取る', goal: 3, coins: 40 },
  { id: 'phase', text: 'フェーズ10に着く', goal: 10, coins: 50, best: true },
  { id: 'survive', text: '1回のプレイで5分生き残る', goal: 300, coins: 50, best: true, unit: 'min' },
  { id: 'boss', text: 'ボスを1体倒す', goal: 1, coins: 60 },
];
// 実績：tiers は [目標, コイン]
export const ACHIEVEMENTS = [
  { id: 'phase', text: 'フェーズ{n}に着く', tiers: [[10, 50], [20, 100], [30, 200], [50, 400], [70, 700], [100, 1000]] },
  { id: 'kills', text: '敵を合計{n}体倒す', tiers: [[1000, 50], [5000, 150], [20000, 400], [100000, 1000]] },
  { id: 'bosses', text: 'ちがうボスを{n}種類倒す', tiers: [[1, 100], [2, 100], [3, 100], [4, 100], [5, 400]] },
  { id: 'ghosts', text: '分身を合計{n}体生む', tiers: [[500, 50], [3000, 150], [10000, 400]] },
  { id: 'plays', text: '{n}回プレイする', tiers: [[10, 50], [50, 150], [200, 400]] },
  { id: 'score', text: '1回でスコア{n}を取る', tiers: [[10000, 50], [100000, 200], [1000000, 600]] },
  { id: 'skills', text: 'スキルを{n}種類取ったことがある', tiers: [[58, 200], [115, 800]] },
  { id: 'items', text: 'ガチャの品を{n}個集める', tiers: [[50, 100], [100, 300], [150, 600], [200, 1500]] },
  { id: 'pulls', text: 'ガチャを合計{n}回引く', tiers: [[10, 50], [100, 300]] },
];
export const fmtN = (n) => (n >= 10000 ? `${n / 10000}万` : String(n));

// ---------- 仕組み ----------
// 日付の区切り：朝4時（4時より前は前の日として数える）
export function dayKey(now = new Date()) {
  const d = new Date(now.getTime() - DAILY_RESET_HOUR * 3600 * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
// 次の入れかえまでの時間（"hh:mm:ss"）
export function untilReset(now = new Date()) {
  const next = new Date(now); next.setHours(DAILY_RESET_HOUR, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  const sec = Math.floor((next - now) / 1000);
  return [Math.floor(sec / 3600), Math.floor(sec / 60) % 60, sec % 60].map((v) => String(v).padStart(2, '0')).join(':');
}
// その日のミッションがなければ、候補から3つ選ぶ（同じ日なら同じ3つ）
export function ensureDaily(save, roads, now = new Date()) {
  const key = dayKey(now);
  const M = save.missions || (save.missions = { day: '', daily: [], bonusGot: false, ach: {} });
  M.ach = M.ach || {};
  if (M.day === key) return false;
  let seed = [...key].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 2147483647, 7) || 1;
  const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const pool = DAILY_POOL.slice();
  const picked = [];
  while (picked.length < 3) picked.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  const road = roads[Math.floor(rand() * roads.length)];
  M.day = key;
  M.daily = picked.map((x) => ({ id: x.id, now: 0, got: false, ...(x.id === 'road' ? { road: road.id, roadName: road.name } : {}) }));
  M.bonusGot = false;
  return true;
}
const defOf = (id) => DAILY_POOL.find((x) => x.id === id);
// 1回遊び終えたとき：デイリーに数える
export function addRun(save, s, roadOf) {
  const M = save.missions;
  if (!M) return;
  for (const x of M.daily) {
    const add = {
      play: 1, kill: s.kills, ghost: s.ghostCount || 0, shard: s.shardsGot || 0, time: s.time, reroll: s.rerolls || 0, boss: (s.bossKills || []).length,
      road: Object.keys(s.skills || {}).filter((id) => { const r = roadOf(id); return r && r.id === x.road; }).length,
    }[x.id];
    if (add != null) x.now += add;
    if (x.id === 'phase') x.now = Math.max(x.now, s.phase);
    if (x.id === 'survive') x.now = Math.max(x.now, s.time);
  }
  save.stats.ghosts = (save.stats.ghosts || 0) + (s.ghostCount || 0);
}
// ガチャを引いたとき
export function addPulls(save, n) {
  save.stats.pulls = (save.stats.pulls || 0) + n;
  for (const x of save.missions?.daily || []) if (x.id === 'gacha') x.now += n;
}
// 実績の今の値
function achNow(save, id, poolSize) {
  const z = save.zukan || {};
  return {
    phase: save.best.phase, kills: save.stats.kills, ghosts: save.stats.ghosts || 0, plays: save.stats.plays, score: save.best.score, pulls: save.stats.pulls || 0,
    bosses: Object.values(z.bosses || {}).filter((b) => b.kills > 0).length,
    skills: Object.keys(z.skills || {}).length,
    items: poolSize(save),
  }[id] || 0;
}
// 画面に渡す形（screens.js の s_mission が使う）
export function missionView(save, poolSize) {
  const M = save.missions;
  const daily = M.daily.map((x) => {
    const d = defOf(x.id);
    return { id: x.id, text: d.text.replace('{road}', (SKILL_ROADS.find((r) => r.id === x.road) || {}).name || x.roadName || ''), now: x.now, goal: d.goal, coins: d.coins, unit: d.unit, state: x.got ? 'got' : x.now >= d.goal ? 'ready' : 'yet' };
  });
  const allDone = daily.every((x) => x.state !== 'yet');
  const ach = {};
  for (const A of ACHIEVEMENTS) ach[A.id] = { now: achNow(save, A.id, poolSize), got: M.ach[A.id] || 0 };
  return { daily, bonus: M.bonusGot ? 'got' : allDone ? 'ready' : 'yet', ach, left: untilReset() };
}
// 受け取る。key：'d_<id>'（デイリー）・'d_bonus'・'a_<id>'（実績）。もらったコインを返す
export function claim(save, key, poolSize) {
  const V = missionView(save, poolSize), M = save.missions;
  if (key === 'd_bonus') { if (V.bonus !== 'ready') return 0; M.bonusGot = true; save.coins += DAILY_BONUS; return DAILY_BONUS; }
  if (key.startsWith('d_')) {
    const v = V.daily.find((x) => x.id === key.slice(2));
    if (!v || v.state !== 'ready') return 0;
    M.daily.find((x) => x.id === v.id).got = true; save.coins += v.coins; return v.coins;
  }
  const A = ACHIEVEMENTS.find((x) => x.id === key.slice(2));
  if (!A) return 0;
  const got = M.ach[A.id] || 0;
  if (got >= A.tiers.length || V.ach[A.id].now < A.tiers[got][0]) return 0;
  M.ach[A.id] = got + 1; save.coins += A.tiers[got][1];
  return A.tiers[got][1];
}
// 受け取れるものを全部（実績は届いている段階まで続けて）受け取る
export function claimAll(save, tab, poolSize) {
  let sum = 0;
  if (tab === 'daily') {
    for (const x of save.missions.daily) sum += claim(save, `d_${x.id}`, poolSize);
    sum += claim(save, 'd_bonus', poolSize);
  } else {
    for (const A of ACHIEVEMENTS) { let c; while ((c = claim(save, `a_${A.id}`, poolSize)) > 0) sum += c; }
  }
  return sum;
}
export function hasClaimable(save, poolSize) {
  if (!save.missions) return false;
  const V = missionView(save, poolSize);
  if (V.daily.some((x) => x.state === 'ready') || V.bonus === 'ready') return true;
  return ACHIEVEMENTS.some((A) => { const p = V.ach[A.id]; return p.got < A.tiers.length && p.now >= A.tiers[p.got][0]; });
}
