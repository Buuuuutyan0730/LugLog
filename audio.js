// 音の担当。音のファイルは使わず、ブラウザの中でその場で電子音を作る（昔のゲーム機のようなピコピコした音）。
//   音は「声（voice）」の組み合わせで作る。声1つ＝波の形・高さの始まりと終わり・長さ・大きさ など。
//   何度も鳴る音は、同じ音が短い間に重なりすぎないようにする

let ctx = null, master = null, seBus = null, bgmBus = null, noiseBuf = null;
const prefs = { se: true, seVol: 0.85, bgm: true, bgmVol: 0.7 };
const lastAt = new Map();   // 音ごとの、最後に鳴らした時刻
let live = 0;               // 今鳴っている声の数
const MAX_LIVE = 40;

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = 0.55; master.connect(ctx.destination);
  seBus = ctx.createGain(); seBus.connect(master);
  bgmBus = ctx.createGain(); bgmBus.connect(master);
  applyVol();
  // 雑音（爆発・風・こする音などに使う）
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}
function applyVol() {
  if (!ctx) return;
  seBus.gain.value = prefs.se ? prefs.seVol : 0;
  bgmBus.gain.value = prefs.bgm ? prefs.bgmVol : 0;
}

// 設定（BGM・効果音のオン・オフと音量 0〜100）
export function setAudioPrefs(S) {
  prefs.se = !!S.se; prefs.seVol = (S.seVol ?? 85) / 100;
  prefs.bgm = !!S.bgm; prefs.bgmVol = (S.bgmVol ?? 70) / 100;
  applyVol();
}
// BGM（bgm.js）が使う部品。force：設定で切っていても鳴らす（音の見本）
export function audioParts(force = false) {
  const c = ensure();
  if (!c) return null;
  if (c.state !== 'running') c.resume().catch(() => {});
  return { ctx: c, bus: force && !prefs.bgm ? master : bgmBus, master };
}
// 最初に画面に触れたときに音を出せるようにする（ブラウザの決まりで、触れる前は音を出せない）
//   画面が裏に回って戻ってきたあと（ほかのアプリやタブを開いた・電話が来た など）は、
//   スマホのブラウザが音の土台を止めたまま（iPhone では「中断」の状態）や、動いているのに音が出ない状態になることがある。
//   そこで、裏から戻ったあと最初に触れたときに、音の土台を作り直す。BGM は作り直したあと、同じ曲を流し直す
let wasHidden = false;
const resetHooks = [];
export function onAudioReset(fn) { resetHooks.push(fn); }
export function unlockAudio() {
  if (wasHidden) wasHidden = false; else return resumeOnly();
  if (ctx) {
    const old = ctx;
    ctx = null; master = null; seBus = null; bgmBus = null; noiseBuf = null; live = 0;
    try { old.close(); } catch { /* もう閉じている */ }
    ensure();
    for (const fn of resetHooks) fn();
  }
  resumeOnly();
}
function resumeOnly() {
  const c = ensure();
  if (c && c.state !== 'running') c.resume().catch(() => {});
}
// 裏に回るときは、音の土台をすぐ止める。止めずに裏へ回すと、スマホのブラウザが音の続きを作れなくなり、
//   「ブー」というノイズが出ることがある
function sleepAudio() {
  wasHidden = true;
  if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {});
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { sleepAudio(); return; }
  if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {});   // 触れる前でも、戻せるなら戻しておく
});
window.addEventListener('pagehide', sleepAudio);
window.addEventListener('blur', () => { if (document.hidden) sleepAudio(); });

// ---------- 声を鳴らす ----------
// v: { w: 波（square・triangle・sawtooth・sine・noise）, f: 始まりの高さ, f2: 終わりの高さ, d: 長さ（秒）, v: 大きさ,
//      at: 遅れ（秒）, a: 立ち上がり（秒）, lp: こもらせる（低い音だけ通す）, hp: 軽くする（高い音だけ通す）, vib: 揺れ（回/秒）, vd: 揺れの深さ（倍）, curve: 'lin' でまっすぐに変わる }
function voice(v, t0, pitch, bus) {
  if (live >= MAX_LIVE) return;
  const t = t0 + (v.at || 0), d = v.d || 0.1, a = v.a ?? 0.004;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(v.v ?? 0.3, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  let src;
  if (v.w === 'noise') {
    src = ctx.createBufferSource(); src.buffer = noiseBuf;
    src.playbackRate.value = (v.rate || 1) * pitch;
  } else {
    src = ctx.createOscillator(); src.type = v.w || 'square';
    const f = (v.f || 440) * pitch, f2 = (v.f2 ?? v.f ?? 440) * pitch;
    src.frequency.setValueAtTime(f, t);
    if (f2 !== f) {
      if (v.curve === 'lin') src.frequency.linearRampToValueAtTime(f2, t + d);
      else src.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + d);
    }
    if (v.vib) {
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = v.vib; lg.gain.value = f * (v.vd || 0.03);
      lfo.connect(lg); lg.connect(src.frequency); lfo.start(t); lfo.stop(t + d + 0.05);
    }
  }
  let node = src;
  if (v.lp) {
    const fl = ctx.createBiquadFilter(); fl.type = 'lowpass';
    fl.frequency.setValueAtTime(v.lp, t);
    if (v.lp2) fl.frequency.exponentialRampToValueAtTime(v.lp2, t + d);
    node.connect(fl); node = fl;
  }
  if (v.hp) { const fh = ctx.createBiquadFilter(); fh.type = 'highpass'; fh.frequency.value = v.hp; node.connect(fh); node = fh; }
  node.connect(g); g.connect(bus);
  live++;
  src.onended = () => { live--; };
  src.start(t);
  src.stop(t + d + 0.05);
}

// 音を鳴らす。opt.pitch：高さの倍率、opt.force：設定で切っていても鳴らす（音の見本で使う）
export function playSound(id, opt = {}) {
  const c = ensure();
  if (!c) return;
  if (c.state !== 'running') c.resume().catch(() => {});
  const r = SOUNDS[id];
  if (!r) return;
  if (!opt.force && !prefs.se) return;
  const now = c.currentTime;
  const gap = r.gap ?? 0.04;
  if (!opt.force && now - (lastAt.get(id) || -1) < gap) return;
  lastAt.set(id, now);
  const bus = opt.force && !prefs.se ? master : seBus;
  for (const v of r.v) voice(v, now, opt.pitch || 1, bus);
}

// ---------- 音の部品 ----------
const T = (w, f, f2, d, v, o = {}) => ({ w, f, f2, d, v, ...o });            // 音の高さが変わる声
const N = (d, v, lp, lp2, o = {}) => ({ w: 'noise', d, v, lp, lp2, ...o });  // 雑音
const arp = (w, notes, step, d, v, o = {}) => notes.map((f, i) => T(w, f, f, d, v, { at: i * step, ...o }));
const S = (v, gap) => ({ v, gap });
// 音の高さ（音名）
const NT = { C4: 262, D4: 294, E4: 330, F4: 349, G4: 392, A4: 440, B4: 494, C5: 523, D5: 587, E5: 659, F5: 698, G5: 784, A5: 880, B5: 988, C6: 1047, D6: 1175, E6: 1319, G6: 1568, A6: 1760, C7: 2093 };
const n = (s) => s.split(' ').map((k) => NT[k]);

// ---------- 音の一覧 ----------
//   共通の音
export const COMMON_SOUNDS = [
  ['tap', 'ボタンを押す'], ['draw', '描き始め'], ['born', '分身が生まれる'], ['shot', '分身の弾'], ['hit', '敵に当たる'], ['kill', '敵を倒す'], ['clearBurst', 'フェーズクリアではじける'],
  ['shard', 'かけらを拾う'], ['hurt', 'ダメージを受ける'], ['dead', 'やられた'], ['clear', 'フェーズクリア'], ['pick', 'カードを選ぶ'], ['reroll', '引き直す'],
  ['bossin', 'ボスが現れる'], ['rage', 'ボスが怒る'], ['bossdown', 'ボスを倒す'], ['elite', '中ボスがはじける'], ['timestop', '時間停止'], ['coin', 'コインをもらう'],
  ['gacha', 'ガチャを引く'], ['gsr', 'SRが出る'], ['gssr', 'SSRが出る'],
  ['g_gather', 'ガチャ：光が集まる'], ['g_orb', 'ガチャ：玉ができる'], ['g_open', 'ガチャ：玉が割れる'], ['g_beat', 'ガチャ昇格：脈打つ'],
  ['g_crack', 'ガチャ昇格：ひびが入る'], ['g_beam', 'ガチャ昇格：光が噴き出す'], ['g_shatter', 'ガチャ昇格：殻がくだける'],
];
export const SOUNDS = {
  tap: S([T('square', 880, 1320, 0.05, 0.16)], 0.03),
  draw: S([T('triangle', 330, 520, 0.09, 0.22)], 0.08),
  born: S([...arp('triangle', n('C6 G6'), 0.05, 0.12, 0.2), T('sine', 2093, 2093, 0.2, 0.06, { at: 0.08 })], 0.06),
  shot: S([T('square', 1500, 620, 0.04, 0.06, { lp: 4000 })], 0.06),
  hit: S([T('sine', 170, 60, 0.09, 0.45), N(0.07, 0.28, 900, 150), T('square', 120, 50, 0.05, 0.09, { lp: 500 })], 0.05),   // 重く、にぶい音（少し大きめ）
  kill: S([T('sine', 130, 42, 0.16, 0.42), T('triangle', 220, 60, 0.08, 0.16), N(0.09, 0.16, 800, 120)], 0.045),   // 倒した：低い「ドン」
  shard: S([T('sine', 1320, 1320, 0.07, 0.14), T('sine', 1980, 1980, 0.05, 0.05, { at: 0.01 })], 0.035),
  hurt: S([T('sawtooth', 220, 60, 0.25, 0.22, { lp: 1800 }), N(0.2, 0.18, 1500, 300)], 0.2),
  dead: S([...arp('square', n('G5 E5 C5 G4 C4'), 0.12, 0.2, 0.18), N(0.6, 0.15, 1200, 100, { at: 0.1 })], 1),
  clearBurst: S([N(0.45, 0.5, 6000, 300), T('sine', 90, 35, 0.4, 0.5), T('square', 1800, 600, 0.12, 0.08, { lp: 5000 }), N(0.25, 0.2, 9000, 3000, { at: 0.03 })], 0.3),   // フェーズクリア：「パーン」とはじける
  clear: S([...arp('square', n('C5 E5 G5 C6'), 0.07, 0.14, 0.16), T('triangle', 2093, 2093, 0.4, 0.1, { at: 0.28 })], 0.5),
  pick: S([...arp('triangle', n('E6 B5'), 0.05, 0.12, 0.2)], 0.1),
  reroll: S([...[0, 1, 2, 3, 4].map((i) => N(0.03, 0.1, 5000 - i * 600, null, { at: i * 0.04 })), T('square', 600, 1200, 0.12, 0.12, { at: 0.2 })], 0.2),
  bossin: S([T('sawtooth', 110, 110, 1.2, 0.2, { vib: 3, vd: 0.12, lp: 900 }), T('sawtooth', 55, 55, 1.2, 0.18, { lp: 400 })], 1),
  rage: S([T('sawtooth', 90, 180, 0.5, 0.22, { lp: 1200, vib: 20, vd: 0.08 }), N(0.5, 0.12, 800)], 0.5),
  bossdown: S([N(0.9, 0.3, 2400, 80), T('square', 200, 40, 0.6, 0.22), ...arp('square', n('C5 G5 C6 E6 G6'), 0.08, 0.18, 0.12, { at: 0.35 })], 1),
  elite: S([N(0.25, 0.22, 3000, 300), T('square', 400, 100, 0.2, 0.15), ...[0, 1, 2, 3].map((i) => T('square', 900 + i * 150, 500, 0.04, 0.06, { at: 0.06 + i * 0.04 }))], 0.2),
  timestop: S([T('sine', 1200, 120, 0.6, 0.2), T('square', 2400, 2400, 0.02, 0.1, { at: 0.6 }), T('square', 2400, 2400, 0.02, 0.1, { at: 0.9 })], 0.5),
  coin: S([T('square', 988, 988, 0.06, 0.14), T('square', 1319, 1319, 0.25, 0.14, { at: 0.06 })], 0.05),
  gacha: S([T('triangle', 200, 1600, 0.5, 0.18, { curve: 'lin' }), N(0.5, 0.06, 6000, 2000)], 0.3),
  gsr: S([...arp('triangle', n('E6 G6 C7'), 0.06, 0.25, 0.15), T('sine', 2093, 2093, 0.6, 0.08, { at: 0.18, vib: 8, vd: 0.01 })], 0.3),
  // ガチャの演出
  g_gather: S([N(1.0, 0.12, 300, 5000, { a: 0.8 }), T('sine', 220, 880, 1.0, 0.08, { a: 0.8, curve: 'lin' })], 0.3),
  g_orb: S([T('sine', 880, 880, 0.9, 0.1, { a: 0.02, vib: 5, vd: 0.008 }), T('triangle', 1320, 1320, 0.7, 0.05, { at: 0.04 }), T('sine', 440, 440, 0.9, 0.06)], 0.3),
  g_open: S([N(0.18, 0.2, 6000, 800), T('triangle', 700, 1400, 0.1, 0.16), T('sine', 1760, 1760, 0.25, 0.06, { at: 0.04 })], 0.05),
  g_beat: S([T('sine', 95, 45, 0.2, 0.45), T('sine', 75, 40, 0.18, 0.32, { at: 0.15 })], 0.2),
  g_crack: S([...[0, 1, 2, 3, 4, 5].map((i) => N(0.035, 0.16, 8000, 2500, { at: i * 0.07 + (i % 2) * 0.02 })), T('square', 2600, 1800, 0.03, 0.05, { at: 0.12 })], 0.3),
  g_beam: S([T('sawtooth', 180, 1400, 0.85, 0.08, { lp: 2600, curve: 'lin', a: 0.3 }), T('sine', 360, 2800, 0.85, 0.07, { curve: 'lin', a: 0.3 }), N(0.85, 0.07, 800, 7000, { a: 0.6 })], 0.5),
  g_shatter: S([N(0.7, 0.32, 7000, 400), T('sine', 130, 40, 0.5, 0.35), ...[0, 1, 2, 3, 4].map((i) => T('square', 2400 + i * 380, 1600, 0.05, 0.05, { at: 0.02 + i * 0.035 }))], 0.4),
  gssr: S([...arp('square', n('C5 E5 G5 C6 E6 G6 C7'), 0.05, 0.3, 0.12), T('sine', 1047, 1047, 1.0, 0.12, { at: 0.35 }), T('sine', 1319, 1319, 1.0, 0.1, { at: 0.35 }), T('sine', 1568, 1568, 1.0, 0.1, { at: 0.35 })], 0.5),
};

// スキルごとの音（どれも違う音にする）。発動したとき・当たったときなどに鳴らす
const SK = {
  // 分身の道
  volley: S([...[0, 1, 2, 3].map((i) => T('square', 1600 - i * 120, 500, 0.06, 0.09, { at: i * 0.018 }))]),
  giant: S([T('sine', 120, 70, 0.35, 0.3), T('triangle', 240, 120, 0.2, 0.12)]),
  crush: S([N(0.15, 0.16, 600, 200), T('sawtooth', 70, 50, 0.15, 0.1)], 0.12),
  cannon: S([N(0.4, 0.28, 2000, 100), T('square', 160, 40, 0.3, 0.2)], 0.15),
  awe: S([T('sine', 80, 80, 0.8, 0.2, { vib: 4, vd: 0.1 }), T('triangle', 160, 160, 0.8, 0.06, { vib: 4, vd: 0.1 })], 0.6),
  gigant: S([N(0.8, 0.3, 1500, 60), T('sine', 90, 30, 0.8, 0.35), T('square', 180, 60, 0.4, 0.14)], 0.5),
  swarm: S([...[0, 1, 2, 3, 4, 5].map((i) => T('square', 2000 + (i % 3) * 300, 1400, 0.025, 0.05, { at: i * 0.012 }))]),
  split: S([T('triangle', 900, 1800, 0.06, 0.14), T('triangle', 900, 450, 0.06, 0.14)], 0.06),
  focus: S([T('square', 2400, 2400, 0.03, 0.08), T('square', 3200, 3200, 0.03, 0.06, { at: 0.03 })], 0.05),
  mark: S([T('sine', 1760, 1760, 0.12, 0.12, { vib: 30, vd: 0.02 })], 0.1),
  thousand: S([...[0, 1, 2].map((i) => T('triangle', 600 + i * 200, 1200 + i * 300, 0.1, 0.12, { at: i * 0.06 })), N(0.2, 0.05, 6000)], 0.2),
  turret: S([T('square', 300, 300, 0.04, 0.12), T('square', 200, 200, 0.06, 0.12, { at: 0.05 })], 0.1),
  laser: S([T('sawtooth', 1800, 900, 0.3, 0.12, { lp: 5000 }), T('sine', 3600, 1800, 0.3, 0.06)], 0.15),
  shotgun: S([N(0.12, 0.22, 4000, 800), T('square', 500, 150, 0.08, 0.12)], 0.08),
  intercept: S([T('square', 3000, 1500, 0.04, 0.08), N(0.03, 0.08, 8000)], 0.04),
  heaven: S([T('sine', 523, 523, 1.0, 0.14), T('sine', 784, 784, 1.0, 0.12), T('sine', 1047, 1047, 1.0, 0.1), N(1.0, 0.05, 8000, 3000)], 0.8),
  decoy: S([T('triangle', 440, 660, 0.1, 0.14), T('triangle', 660, 440, 0.1, 0.12, { at: 0.1 })], 0.2),
  taunt: S([T('square', 300, 600, 0.08, 0.12), T('square', 300, 600, 0.08, 0.12, { at: 0.1 })], 0.3),
  counter: S([T('square', 1200, 2400, 0.05, 0.14), N(0.05, 0.1, 6000)], 0.06),
  repair: S([...arp('sine', n('C6 E6 G6'), 0.05, 0.1, 0.1)], 0.3),
  fortress: S([T('triangle', 200, 200, 0.4, 0.2), T('square', 100, 100, 0.4, 0.08, { lp: 600 })], 0.5),
  // 本体の道
  aura: S([T('sine', 300, 340, 0.3, 0.1, { vib: 9, vd: 0.05 })], 0.3),
  charge: S([N(0.18, 0.2, 1200, 4000), T('square', 200, 500, 0.15, 0.12)], 0.12),
  heavyfist: S([T('square', 180, 50, 0.15, 0.25), N(0.12, 0.22, 1500, 200)], 0.1),
  rush: S([T('square', 700, 350, 0.04, 0.14), N(0.04, 0.12, 3000)], 0.05),
  shield: S([T('triangle', 1200, 600, 0.2, 0.16), T('sine', 2400, 2400, 0.15, 0.06)], 0.2),
  demon: S([T('sawtooth', 60, 120, 0.8, 0.25, { lp: 800 }), N(0.8, 0.15, 600, 2000), ...arp('square', n('C5 G5 C6'), 0.1, 0.2, 0.08, { at: 0.3 })], 1),
  shoot: S([T('square', 1100, 700, 0.05, 0.09)], 0.04),
  rapid: S([T('square', 1400, 900, 0.035, 0.08)], 0.03),
  snipe: S([T('sawtooth', 2400, 400, 0.12, 0.14), N(0.06, 0.12, 9000)], 0.1),
  homing: S([T('sine', 900, 1400, 0.1, 0.12, { vib: 25, vd: 0.05 })], 0.06),
  barrage: S([...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => T('square', 1300 + i * 80, 700, 0.03, 0.05, { at: i * 0.01 }))], 0.2),
  dash: S([N(0.15, 0.14, 2000, 6000)], 0.1),
  afterslash: S([N(0.08, 0.14, 8000, 3000), T('triangle', 2000, 1000, 0.06, 0.08)], 0.1),
  gust: S([N(0.4, 0.2, 400, 3000), T('sine', 200, 600, 0.3, 0.06)], 0.3),
  nimble: S([T('sine', 1600, 2400, 0.06, 0.08)], 0.1),
  blink: S([T('square', 3000, 300, 0.12, 0.12), N(0.08, 0.1, 9000, 2000, { at: 0.06 })], 0.2),
  // 罠の道
  keepsake: S([T('triangle', 700, 900, 0.08, 0.14), T('sine', 1400, 1400, 0.08, 0.06, { at: 0.06 })], 0.15),
  caltrop: S([...[0, 1, 2].map((i) => T('square', 3000 - i * 400, 2500, 0.02, 0.06, { at: i * 0.03 }))], 0.1),
  barb: S([T('square', 2600, 1800, 0.03, 0.08), T('square', 2600, 1800, 0.03, 0.06, { at: 0.04 })], 0.06),
  snare: S([T('triangle', 500, 250, 0.12, 0.14), N(0.05, 0.08, 2000)], 0.1),
  scatter: S([...[0, 1, 2, 3].map((i) => T('square', 2200 + i * 200, 2000, 0.015, 0.05, { at: i * 0.025 }))], 0.1),
  spikebed: S([...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => T('square', 3000 - (i % 4) * 300, 2400, 0.02, 0.05, { at: i * 0.03 }))], 0.6),
  mine: S([N(0.35, 0.28, 2500, 120), T('square', 220, 50, 0.25, 0.2)], 0.06),
  timebomb: S([T('square', 1800, 1800, 0.03, 0.1), T('square', 1800, 1800, 0.03, 0.1, { at: 0.15 }), N(0.5, 0.3, 2000, 80, { at: 0.3 }), T('square', 180, 40, 0.4, 0.2, { at: 0.3 })], 0.3),
  sticky: S([T('sine', 300, 150, 0.1, 0.16), T('square', 1200, 1200, 0.03, 0.06, { at: 0.12 })], 0.1),
  rig: S([T('square', 600, 600, 0.03, 0.1), T('square', 900, 900, 0.03, 0.1, { at: 0.05 })], 0.1),
  misfire: S([T('square', 800, 1600, 0.05, 0.1), N(0.3, 0.24, 2200, 120, { at: 0.05 })], 0.2),
  flamepath: S([N(0.5, 0.16, 900, 1800)], 0.3),
  spread: S([N(0.25, 0.14, 1200, 2400), T('sawtooth', 150, 220, 0.2, 0.05, { lp: 700 })], 0.2),
  pillar: S([N(0.5, 0.22, 600, 3000), T('sawtooth', 100, 300, 0.4, 0.1, { lp: 1200 })], 0.2),
  ember: S([...[0, 1, 2].map((i) => N(0.04, 0.1, 5000, null, { at: i * 0.07 }))], 0.2),
  firesea: S([N(1.0, 0.24, 500, 2500), T('sawtooth', 80, 160, 1.0, 0.1, { lp: 700 })], 0.8),
  // 現象の道
  thunder: S([N(0.12, 0.16, 6000, 2000), T('sawtooth', 2000, 800, 0.08, 0.06, { hp: 800 })], 0.15),
  chainbolt: S([...[0, 1, 2].map((i) => N(0.05, 0.12, 7000 - i * 1500, null, { at: i * 0.04 }))], 0.08),
  strike: S([N(0.35, 0.3, 8000, 200), T('square', 300, 50, 0.3, 0.18)], 0.15),
  charged: S([T('square', 3000, 3200, 0.06, 0.06, { vib: 60, vd: 0.05 })], 0.08),
  skybolt: S([N(0.9, 0.3, 9000, 150), T('sawtooth', 600, 40, 0.8, 0.2), T('square', 3000, 3000, 0.05, 0.1)], 0.8),
  freeze: S([T('sine', 2600, 3200, 0.1, 0.1), T('triangle', 1300, 1600, 0.1, 0.06)], 0.08),
  shatter: S([...[0, 1, 2, 3].map((i) => T('triangle', 3200 - i * 250, 2600, 0.05, 0.08, { at: i * 0.02 })), N(0.1, 0.1, 9000, 4000)], 0.08),
  chill: S([T('sine', 1800, 1700, 0.4, 0.06, { vib: 6, vd: 0.02 })], 0.4),
  frostpath: S([N(0.3, 0.08, 9000, 6000), T('sine', 2400, 2400, 0.3, 0.04)], 0.3),
  iceage: S([N(1.0, 0.2, 9000, 2000), ...arp('sine', n('E6 C6 A5 E5'), 0.12, 0.4, 0.1)], 0.8),
  pull: S([T('sine', 600, 150, 0.4, 0.14), N(0.4, 0.06, 1500, 300)], 0.4),
  compress: S([T('sawtooth', 120, 80, 0.2, 0.12, { lp: 500 })], 0.2),
  repel: S([T('sine', 150, 600, 0.25, 0.14), N(0.2, 0.08, 400, 3000)], 0.2),
  gravshot: S([T('sine', 400, 100, 0.25, 0.16), T('square', 200, 60, 0.15, 0.06)], 0.1),
  collapse: S([T('sine', 800, 40, 1.0, 0.25), N(1.0, 0.18, 3000, 80)], 0.8),
  poison: S([T('sine', 500, 380, 0.12, 0.12, { vib: 18, vd: 0.06 })], 0.08),
  contagion: S([T('sine', 380, 500, 0.08, 0.1), T('sine', 500, 380, 0.08, 0.08, { at: 0.08 })], 0.1),
  corrode: S([N(0.25, 0.1, 1200, 600), T('sine', 300, 250, 0.2, 0.05, { vib: 12, vd: 0.05 })], 0.2),
  miasma: S([N(0.6, 0.1, 700, 1400)], 0.4),
  pandemic: S([T('sawtooth', 200, 400, 0.6, 0.12, { lp: 1200, vib: 10, vd: 0.06 }), N(0.6, 0.1, 1000, 2500)], 0.6),
  reaper: S([T('triangle', 220, 110, 0.4, 0.18), T('sine', 880, 440, 0.3, 0.06)], 0.15),
  execute: S([N(0.06, 0.16, 9000), T('square', 600, 120, 0.15, 0.16)], 0.08),
  doom: S([T('sine', 440, 440, 0.3, 0.14, { vib: 5, vd: 0.02 }), T('sine', 415, 415, 0.3, 0.12, { at: 0.3 }), T('sine', 392, 392, 0.5, 0.14, { at: 0.6 })], 0.5),
  soulreap: S([...arp('sine', n('A5 E6 A6'), 0.06, 0.2, 0.1)], 0.15),
  scythe: S([N(0.6, 0.2, 800, 6000), T('sawtooth', 300, 900, 0.5, 0.06, { lp: 2500 })], 0.5),
  // 衛星の道
  float: S([T('sine', 900, 900, 0.06, 0.1)], 0.06),
  satellite: S([T('sine', 1100, 1300, 0.06, 0.1)], 0.05),
  bigsat: S([T('sine', 300, 250, 0.15, 0.2), T('triangle', 600, 500, 0.1, 0.08)], 0.1),
  meteor: S([N(0.15, 0.12, 1500, 6000), T('sine', 1500, 600, 0.15, 0.08)], 0.1),
  orbitshift: S([T('sine', 500, 1000, 0.3, 0.08, { curve: 'lin' })], 0.3),
  starfall: S([...[0, 1, 2, 3, 4, 5].map((i) => T('sine', 2600 - i * 150, 1800 - i * 100, 0.08, 0.07, { at: i * 0.05 }))], 0.5),
  blade: S([N(0.05, 0.1, 9000, 5000), T('square', 1800, 1500, 0.03, 0.05)], 0.05),
  throw: S([N(0.2, 0.1, 3000, 8000), T('triangle', 1400, 2000, 0.15, 0.05)], 0.1),
  twinblade: S([N(0.05, 0.1, 9000, 5000), N(0.05, 0.1, 9000, 5000, { at: 0.04 })], 0.06),
  whet: S([N(0.12, 0.08, 6000, 3000, { hp: 2000 })], 0.1),
  thousandblade: S([...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => N(0.04, 0.08, 9000, 5000, { at: i * 0.025 }))], 0.6),
  drone: S([T('square', 600, 650, 0.05, 0.08, { lp: 2000 })], 0.06),
  ramdrone: S([T('square', 300, 120, 0.08, 0.14), N(0.05, 0.1, 2000)], 0.06),
  gundrone: S([T('square', 1700, 1000, 0.04, 0.07)], 0.04),
  collector: S([T('sine', 1600, 2000, 0.06, 0.08)], 0.05),
  mothership: S([T('sawtooth', 150, 300, 0.5, 0.14, { lp: 900 }), ...arp('square', n('C5 E5 G5'), 0.08, 0.1, 0.08, { at: 0.3 })], 0.8),
  shieldsat: S([T('triangle', 1600, 1000, 0.08, 0.12)], 0.05),
  reflect: S([T('triangle', 1000, 2000, 0.08, 0.12), T('sine', 3000, 3000, 0.05, 0.05)], 0.05),
  shockshield: S([N(0.12, 0.14, 4000, 600), T('sine', 500, 150, 0.12, 0.1)], 0.08),
  escort: S([T('triangle', 1300, 900, 0.06, 0.1)], 0.05),
  sanctuary: S([T('sine', 784, 784, 0.6, 0.1), T('sine', 1175, 1175, 0.6, 0.08), T('sine', 1568, 1568, 0.6, 0.06)], 0.6),
  // 収穫の道
  keeper: S([T('sine', 1100, 1100, 0.08, 0.08)], 0.1),
  shortcut: S([...arp('square', n('G5 C6'), 0.04, 0.08, 0.1)], 0.3),
  double: S([T('sine', 1320, 1320, 0.05, 0.12), T('sine', 1760, 1760, 0.06, 0.12, { at: 0.05 })], 0.05),
  treasure: S([...arp('square', n('C6 E6 G6 C7'), 0.05, 0.12, 0.1)], 0.3),
  chainpick: S([...[0, 1, 2, 3].map((i) => T('sine', 1200 + i * 200, 1200 + i * 200, 0.05, 0.08, { at: i * 0.03 }))], 0.1),
  goldenage: S([...arp('triangle', n('C6 E6 G6 C7 E6 G6 C7'), 0.06, 0.15, 0.1)], 1),
  alchemy: S([T('triangle', 900, 1800, 0.1, 0.12), T('sine', 2700, 2700, 0.08, 0.05, { at: 0.05 })], 0.06),
  goldshot: S([T('square', 1500, 1100, 0.05, 0.1), T('sine', 2200, 2200, 0.05, 0.05)], 0.04),
  convert: S([T('triangle', 500, 1500, 0.25, 0.14, { curve: 'lin' })], 0.3),
  savings: S([T('square', 1047, 1047, 0.05, 0.1), T('square', 784, 784, 0.1, 0.1, { at: 0.06 })], 0.3),
  goldrain: S([...[0, 1, 2, 3, 4, 5].map((i) => T('sine', 1800 + (i % 3) * 300, 1800 + (i % 3) * 300, 0.06, 0.07, { at: i * 0.06 }))], 0.6),
  absorb: S([T('sine', 600, 900, 0.1, 0.1)], 0.06),
  overheal: S([T('sine', 900, 1200, 0.15, 0.1, { vib: 10, vd: 0.02 })], 0.2),
  vitality: S([T('sine', 80, 60, 0.1, 0.3), T('sine', 80, 60, 0.1, 0.24, { at: 0.18 })], 0.5),
  vampire: S([T('sawtooth', 400, 800, 0.1, 0.08, { lp: 1500 }), T('sine', 800, 800, 0.08, 0.06, { at: 0.08 })], 0.08),
  immortal: S([...arp('sine', n('C5 G5 C6 E6 G6 C7'), 0.08, 0.5, 0.12), N(0.8, 0.06, 8000, 3000)], 1),
};
for (const [k, r] of Object.entries(SK)) SOUNDS[`sk_${k}`] = r;
