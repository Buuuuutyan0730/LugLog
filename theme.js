// 色の定義（役割ごとに完全に分ける）
//   本体 … 白＋金色の光
//   分身・味方の攻撃 … 緑〜シアン〜青〜紫の寒色（分身ごとに色を変える）
//   敵・敵の弾 … 赤

export const THEME = {
  bg: '#0c1128',
  grid: 'rgba(110, 140, 230, 0.05)',
  gridMajor: 'rgba(110, 140, 230, 0.10)',

  player: '#ffffff',
  playerGlow: '#ffd84a',
  playerRing: 'rgba(255, 216, 74, 0.85)',
  playerLight: '#fff8d6',
  playerDeep: '#d98a0a',
  playerEdge: '#6b3f00',
  magnetRing: '#ffffff',
  playerShot: '#ffffff',

  recordPathShort: 'rgba(143, 155, 214, 0.35)',
  recordPath: 'rgba(255, 255, 255, 0.7)',
  recordPathFull: 'rgba(255, 216, 74, 0.9)',

  enemy: '#ff3b5c',
  enemyEdge: '#8e0f2a',
  enemyBulletCore: '#ffffff',
  enemyBulletEdge: '#c0122f',

  hurt: 'rgba(255, 40, 70, 0.55)',

  // 色のセットで変わる色の、別の書き方（「赤・緑・青」の数で書く所に使う）
  playerRgb: '255, 216, 74',
  enemyRgbA: '255, 59, 92',
  enemyRgbB: '255, 60, 90',
  enemyRgbL: '255, 90, 110',
  enemyLight: '#ff5a6e',
  enemyLine: null,          // 敵のふちの色を変えるセット（モノクロなど）。null なら今のまま
  rainbowBody: false,       // 虹のセット：本体とかけらの色が時間で変わる
  rainbowShard: false,
  // 背景の飾り（着せ替えの背景）
  bgStars: 0, bgCloud: false, bgCity: false, bgMeteor: false,

  barInk: '#0a0a14',
  shard: '#ffe27a',
  shardEdge: '#a8730a',
  barBack: '#2a2140',
};

// 分身の色。
// 色相（色の種類）を 150°（緑）〜280°（紫）の範囲だけで使い、
// 赤・ピンク・オレンジ（敵）と黄色（本体）には近づけない。
// 黄金比ずつずらすので、何体増えても隣り合う番号同士は離れた色になる。
// 色のセットで、色相の幅・鮮やかさ・明るさが変わる（標準：150〜280°、95%、62%）
const GH = { min: 150, max: 280, sat: 95, light: 62 };
const GOLDEN = 0.6180339887;
const cache = new Map();

export function ghostColor(index, alpha = 1) {
  const key = `${index}:${alpha}`;
  if (cache.has(key)) return cache.get(key);
  const hue = GH.min + ((index * GOLDEN) % 1) * (GH.max - GH.min);
  const d = GH.light - 62;
  const light = [62, 72, 55][index % 3] + d; // 明るさも3段階で変えて、似た色を見分けやすくする
  const c = `hsla(${hue.toFixed(1)}, ${GH.sat}%, ${Math.max(0, Math.min(100, light))}%, ${alpha})`;
  cache.set(key, c);
  return c;
}

// ---------- 着せ替え（色のセットと背景） ----------
const hexRgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const toHex = (r, g, b) => '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
// a と b を k の割合で混ぜる（k=0 で a、1 で b）
const mix = (a, b, k) => { const A = hexRgb(a), B = hexRgb(b); return toHex(A[0] + (B[0] - A[0]) * k, A[1] + (B[1] - A[1]) * k, A[2] + (B[2] - A[2]) * k); };
const rgbStr = (h) => hexRgb(h).join(', ');
const STD = { ...THEME };   // 標準の色（標準のセットに戻すときは、これをそのまま使う）

// 色のセットを入れる。set は skins.js の COLOR_SETS の1つ
export function applyColorSet(set) {
  const keys = ['playerGlow', 'playerRing', 'playerLight', 'playerDeep', 'playerEdge', 'playerRgb', 'enemy', 'enemyEdge', 'enemyRgbA', 'enemyRgbB', 'enemyRgbL', 'enemyLight', 'enemyLine', 'shard', 'shardEdge', 'rainbowBody', 'rainbowShard', 'rainbowEnemy', 'enemyBulletEdge'];
  for (const k of keys) THEME[k] = STD[k];
  Object.assign(GH, { min: 150, max: 280, sat: 95, light: 62 });
  if (set && set.id !== 'std') {
    const cyc = (v) => v === 'rainbow' || v === 'aurora';   // 時間で色が回る（虹・オーロラ）
    const body = cyc(set.body) ? '#ffd84a' : set.body;
    THEME.playerGlow = body;
    THEME.playerRgb = rgbStr(body);
    THEME.playerRing = `rgba(${rgbStr(body)}, 0.85)`;
    THEME.playerLight = mix(body, '#ffffff', 0.8);
    THEME.playerDeep = mix(body, '#000000', 0.25);
    THEME.playerEdge = mix(body, '#000000', 0.65);
    const enemy = cyc(set.enemy) ? '#ff5a7a' : set.enemy;
    THEME.enemy = enemy;
    THEME.enemyEdge = mix(enemy, '#000000', 0.55);
    THEME.enemyRgbA = THEME.enemyRgbB = rgbStr(enemy);
    THEME.enemyLight = mix(enemy, '#ffffff', 0.18);
    THEME.enemyRgbL = rgbStr(THEME.enemyLight);
    THEME.enemyBulletEdge = mix(enemy, '#000000', 0.3);
    THEME.enemyLine = set.enemyLine || null;
    const shard = cyc(set.shard) ? '#ffe27a' : set.shard;
    THEME.shard = shard;
    THEME.shardEdge = mix(shard, '#000000', 0.55);
    THEME.rainbowBody = cyc(set.body) ? set.body : false;
    THEME.rainbowShard = cyc(set.shard) ? set.shard : false;
    THEME.rainbowEnemy = cyc(set.enemy) ? set.enemy : false;
    const [a, b, s, l] = set.ghost;
    Object.assign(GH, { min: a, max: b, sat: s, light: l });
  }
  cache.clear();
}

// 背景を入れる。bg は skins.js の BACKGROUNDS の1つ
export function applyBackground(bg) {
  THEME.bg = STD.bg; THEME.grid = STD.grid; THEME.gridMajor = STD.gridMajor;
  THEME.bgStars = 0; THEME.bgCloud = false; THEME.bgCity = false; THEME.bgMeteor = false;
  THEME.bgDots = null; THEME.bgDiag = null; THEME.bgRain = false; THEME.bgNebula = false;
  if (!bg || bg.id === 'grid') return;
  THEME.bg = bg.bg;
  THEME.grid = bg.grid ? bg.grid.replace(/[\d.]+\)$/, (x) => `${(parseFloat(x) / 2).toFixed(3)})`) : null;
  THEME.gridMajor = bg.grid || null;
  THEME.bgStars = bg.stars || 0; THEME.bgCloud = !!bg.cloud; THEME.bgCity = !!bg.city; THEME.bgMeteor = !!bg.meteor;
  THEME.bgDots = bg.dots || null; THEME.bgDiag = bg.diag || null; THEME.bgRain = !!bg.rain; THEME.bgNebula = !!bg.nebula;
}

// 虹のセット：本体とかけらの色を、時間で回す（毎フレーム呼ぶ）
//   虹：色相が一周する。本体・かけら・敵は、色相を 120 度ずつずらして、いつも違う色にする
//   オーロラ：緑〜水色〜紫の間を、ゆっくり行き来する
function hueAt(mode, t, off) {
  if (mode === 'aurora') return 210 + 90 * Math.sin(t * 0.9 + off / 60);
  return (t * 60 + off) % 360;
}
function hslHex(h, s, l) {
  s /= 100; l /= 100;
  const f = (n) => { const k = (n + h / 30) % 12, a = s * Math.min(l, 1 - l); return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, '0'); };
  return `#${f(0)}${f(8)}${f(4)}`;
}
export function tickRainbow(t) {
  if (!THEME.rainbowBody && !THEME.rainbowShard && !THEME.rainbowEnemy) return;
  if (THEME.rainbowBody) {
    const c = hslHex(hueAt(THEME.rainbowBody, t, 0), 95, 62);
    THEME.playerGlow = c; THEME.playerRgb = rgbStr(c); THEME.playerRing = `rgba(${rgbStr(c)}, 0.85)`;
    THEME.playerLight = mix(c, '#ffffff', 0.8); THEME.playerDeep = mix(c, '#000000', 0.25); THEME.playerEdge = mix(c, '#000000', 0.65);
  }
  if (THEME.rainbowShard) { const c = hslHex(hueAt(THEME.rainbowShard, t, 120), 95, 66); THEME.shard = c; THEME.shardEdge = mix(c, '#000000', 0.55); }
  if (THEME.rainbowEnemy) {
    const c = hslHex(hueAt(THEME.rainbowEnemy, t, 240), 90, 60);
    THEME.enemy = c; THEME.enemyEdge = mix(c, '#000000', 0.55); THEME.enemyRgbA = THEME.enemyRgbB = rgbStr(c);
    THEME.enemyLight = mix(c, '#ffffff', 0.18); THEME.enemyRgbL = rgbStr(THEME.enemyLight); THEME.enemyBulletEdge = mix(c, '#000000', 0.3);
  }
}

// 設定で変える見た目の強さ（光の強さ：ひかえめ0.4・ふつう1・つよい1.6、画面の揺れ：0か1）
export const PREFS = { glow: 1, shake: 1 };
