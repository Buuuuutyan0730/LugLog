// 着せ替えの品（色のセット・背景・アイコン）とガチャの決まり。
//   色のセットは「本体・分身・敵・かけら」の色をまとめて変える（形は変えない）。見た目だけで、強さは変わらない
import { ICON_ART } from './iconart.js?v=20261126181944';
import { POP_STYLES } from './pops.js?v=20261126181944';
import { TITLES } from './titles.js?v=20261126181944';
import { FRAMES } from './frames.js?v=20261126181944';
export const RARITIES = ['N', 'R', 'SR', 'SSR'];

// 色のセット。ghost は分身の色の幅（色相の始まりと終わり、鮮やかさ、明るさ）
export const COLOR_SETS = [
  { id: 'std', name: '標準', rarity: 'start', body: '#ffd84a', ghost: [150, 280, 95, 62], enemy: '#ff3b5c', shard: '#3fe0ff' },
  { id: 'crimson', name: '紅', rarity: 'N', body: '#ff4a4a', ghost: [18, 40, 95, 60], enemy: '#8a6bff', shard: '#ffd84a' },
  { id: 'deep', name: '深海', rarity: 'N', body: '#f3f8ff', ghost: [165, 200, 85, 55], enemy: '#ff8a1f', shard: '#9fd4ff' },
  { id: 'leaf', name: '若葉', rarity: 'N', body: '#9dff6a', ghost: [90, 150, 80, 58], enemy: '#b0602e', shard: '#ffe27a' },
  { id: 'ice', name: '氷', rarity: 'N', body: '#bff4ff', ghost: [180, 215, 70, 72], enemy: '#5a4bff', shard: '#ffffff' },
  { id: 'night', name: '夜空', rarity: 'N', body: '#fff2b0', ghost: [215, 250, 70, 62], enemy: '#ff5a7a', shard: '#c7a6ff' },
  { id: 'mono', name: 'モノクロ', rarity: 'SSR', body: '#ffffff', ghost: [0, 0, 0, 70], enemy: '#1a1a22', shard: '#ffffff', enemyLine: '#ffffff' },
  { id: 'dusk', name: '夕焼け', rarity: 'R', body: '#ff9a3a', ghost: [260, 300, 70, 75], enemy: '#2b3fa8', shard: '#ffd84a' },
  { id: 'mint', name: 'ミント', rarity: 'R', body: '#7cffd4', ghost: [150, 178, 70, 66], enemy: '#6b3a2a', shard: '#fff2d0' },
  { id: 'lava', name: '溶岩', rarity: 'R', body: '#ffcf3a', ghost: [0, 30, 100, 55], enemy: '#2a2a35', shard: '#ff6a2a', enemyLine: '#ff6a2a' },
  { id: 'neon', name: 'ネオン', rarity: 'SR', body: '#ff4fd8', ghost: [80, 110, 100, 58], enemy: '#3fe0ff', shard: '#fff23a' },
  { id: 'sakura', name: '桜', rarity: 'R', body: '#ffb3d1', ghost: [0, 0, 0, 96], enemy: '#1f6b45', shard: '#ff7fb0' },
  { id: 'retro', name: 'レトロ', rarity: 'R', body: '#e0f8d0', ghost: [85, 110, 45, 48], enemy: '#306230', shard: '#e0f8d0', enemyLine: '#0f380f' },
  { id: 'gold', name: '黄金', rarity: 'SSR', body: '#ffd84a', ghost: [42, 50, 100, 60], enemy: '#141018', shard: '#ffd84a', enemyLine: '#ffd84a' },
  { id: 'rainbow', name: '虹', rarity: 'SR', body: 'rainbow', ghost: [0, 360, 100, 62], enemy: 'rainbow', shard: 'rainbow' },
  { id: 'aurora', name: 'オーロラ', rarity: 'SR', body: 'aurora', ghost: [120, 300, 90, 64], enemy: '#141a3a', shard: 'aurora', enemyLine: '#7cffd4' },
];

// 背景。grid：マス目の色（null なら描かない）、stars：星の数
export const BACKGROUNDS = [
  { id: 'grid', name: 'マス目', rarity: 'start', bg: '#0c1128', grid: 'rgba(110, 140, 230, 0.10)' },
  { id: 'plain', name: '無地', rarity: 'N', bg: '#0b0e1c', grid: null },
  { id: 'dots', name: 'ドット', rarity: 'N', bg: '#0c1024', grid: null, dots: 'rgba(130, 150, 230, 0.22)' },
  { id: 'diag', name: '斜線', rarity: 'N', bg: '#0e0f22', grid: null, diag: 'rgba(150, 120, 230, 0.09)' },
  { id: 'stars', name: '星空', rarity: 'SR', bg: '#070a1e', grid: null, stars: 60 },
  { id: 'cloud', name: '雲', rarity: 'R', bg: '#141a36', grid: null, cloud: true },
  { id: 'rain', name: '雨', rarity: 'R', bg: '#0b1222', grid: null, rain: true },
  { id: 'city', name: '夜の街', rarity: 'R', bg: '#0a0c1a', grid: null, city: true },
  { id: 'paper', name: '古い紙', rarity: 'SR', bg: '#1c1712', grid: 'rgba(200, 170, 120, 0.08)' },
  { id: 'meteor', name: '流れ星', rarity: 'SSR', bg: '#060818', grid: null, stars: 40, meteor: true },
  { id: 'galaxy', name: '銀河', rarity: 'SSR', bg: '#07061a', grid: null, stars: 50, nebula: true },
];

// アイコン。最初の6つは最初から持っている
export const AVATAR_ITEMS = [
  ...'★◆●▲♥☾'.split('').map((c, i) => ({ id: `a${i}`, name: c, rarity: 'start', glyph: c })),
  // N・R・王冠・写真：ドットの絵（iconart.js）。写真は、自分で選んだ写真に置きかえられる
  ...ICON_ART.map((x) => ({ id: x.id, name: x.name, rarity: x.rarity, art: true, photo: x.id === 'photo' })),
  { id: 'ghost', name: '分身', rarity: 'SR', unit: 'ghost' },
  // SR：ボスと敵の絵
  { id: 'b_core', name: 'コア', rarity: 'SR', boss: 'core' },
  { id: 'b_clock', name: '時計', rarity: 'SR', boss: 'clock' },
  { id: 'b_twin', name: '双子', rarity: 'SR', boss: 'twin' },
  { id: 'e_chaser', name: '追跡', rarity: 'SR', enemy: 'chaser' },
  { id: 'e_dasher', name: '突進', rarity: 'SR', enemy: 'dasher' },
  { id: 'e_bomber', name: '自爆', rarity: 'SR', enemy: 'bomber' },
  { id: 'e_thief', name: 'かけら泥棒', rarity: 'SR', enemy: 'thief' },
  { id: 'b_shade', name: '影', rarity: 'SR', boss: 'shade' },
  // SSR：ハンターと、自分で写真を設定できるアイコン
  { id: 'b_hunter', name: 'ハンター', rarity: 'SSR', boss: 'hunter' },
];

// ガチャの決まり
export const GACHA = {
  price: 100, price10: 1000,          // 1回／10回（10回はSR以上が1つ必ず出る）
  rates: { N: 60, R: 30, SR: 8, SSR: 2 },
  pity: 100,                          // この回数SSRが出なければ、次は必ずSSR
  refund: { N: 20, R: 30, SR: 50, SSR: 100 },   // 持っている物が出たときに戻るコイン
};

// ガチャから出る物（最初から持っている物は出ない）
export const GACHA_POOL = [
  ...COLOR_SETS.filter((x) => x.rarity !== 'start').map((x) => ({ ...x, kind: 'set' })),
  ...BACKGROUNDS.filter((x) => x.rarity !== 'start').map((x) => ({ ...x, kind: 'bg' })),
  ...AVATAR_ITEMS.filter((x) => x.rarity !== 'start').map((x) => ({ ...x, kind: 'icon' })),
  ...POP_STYLES.filter((x) => x.rarity !== 'start').map((x) => ({ ...x, kind: 'pop' })),
  ...TITLES.map((x) => ({ ...x, kind: 'title' })),
  ...FRAMES.filter((x) => x.rarity !== 'start').map((x) => ({ ...x, kind: 'frame' })),
];

// ガチャを n 回引く（コインはここでは減らさない）。save の持ち物・天井を書きかえる
//   10回引きは、SR以上が1つも出なかったら最後の1つをSR以上にする。天井の回数に届いたら、その回は必ずSSR
export function rollGacha(save, n, rand = Math.random) {
  const R = GACHA.rates;
  const pickRarity = (minSR) => {
    const pool = minSR ? ['SR', 'SSR'] : ['N', 'R', 'SR', 'SSR'];
    const sum = pool.reduce((a, r) => a + R[r], 0);
    let x = rand() * sum;
    for (const r of pool) { x -= R[r]; if (x < 0) return r; }
    return pool[pool.length - 1];
  };
  const got = [];
  let refund = 0;
  for (let i = 0; i < n; i++) {
    save.pity = (save.pity || 0) + 1;
    let r;
    if (save.pity >= GACHA.pity) r = 'SSR';
    else r = pickRarity(n >= 10 && i === n - 1 && !got.some((g) => g.it.rarity === 'SR' || g.it.rarity === 'SSR'));
    if (r === 'SSR') save.pity = 0;
    const pool = GACHA_POOL.filter((x) => x.rarity === r);
    const it = pool[Math.floor(rand() * pool.length)];
    const list = save.owned[it.kind] || (save.owned[it.kind] = []);
    const isNew = !list.includes(it.id) && !got.some((g) => g.isNew && g.it.id === it.id);
    if (isNew) list.push(it.id); else refund += GACHA.refund[r];
    got.push({ it, isNew });
  }
  save.coins += refund;
  return { got, refund };
}
