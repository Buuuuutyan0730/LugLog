// BGM。音のファイルは使わず、その場で電子音を組み立てて鳴らす。
//   どの曲も、目立たず、落ち着いていて、でも体が揺れる感じ。盛り上げない（フェーズが進んでも変えない）。
//   4曲は、楽器・リズム・拍子・調をそれぞれ別に作る（同じ曲の手直しにしない）。
//   曲を切りかえるときは、前の曲を少しずつ小さく、次の曲を少しずつ大きくする。
import { audioParts, onAudioReset } from './audio.js?v=20261127120912';

const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
const vary = (v) => v * (0.88 + Math.random() * 0.24);
const hitOn = (row, i) => { const c = (row || '')[i]; return c === 'x' ? 1 : c === 'o' ? 0.6 : 0; };

// ---------- 楽器 ----------
// 端末の負担を軽くするため、1音あたりの部品は少なくし、こもらせる部品は曲ごとに1つを使い回す
let noiseBuf = null, noiseCtx = null;
function noise(ctx) {
  if (noiseBuf && noiseCtx === ctx) return noiseBuf;
  noiseCtx = ctx;
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}
// 音量の山：0から立ち上がり、なめらかに消える（急に変わるとプチッと鳴るので、必ず坂にする）
function env(song, t, a, peak, d, out, sustain = 0) {
  const g = song.ctx.createGain(), p = g.gain;
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + a);
  if (sustain) p.exponentialRampToValueAtTime(peak * sustain, t + a + (d - a) * 0.45);
  p.exponentialRampToValueAtTime(0.0005, t + d);
  p.linearRampToValueAtTime(0, t + d + 0.03);
  g.connect(out);
  return g;
}
function osc(song, type, f, t, d, out, detune = 0) {
  const o = song.ctx.createOscillator();
  o.type = type; o.frequency.value = f; if (detune) o.detune.value = detune;
  o.connect(out); o.start(t); o.stop(t + d + 0.05);
  song.track(o, t + d + 0.05);
  return o;
}
function hitNoise(song, t, v, d, out, a = 0.003) {
  const src = song.ctx.createBufferSource(); src.buffer = noise(song.ctx);
  src.connect(env(song, t, a, v, d, out));
  src.start(t, Math.random() * 0.5); src.stop(t + d + 0.05);
  song.track(src, t + d + 0.05);
}
// 三味線の1音を、弦をはじいた音として計算で作る（はじいた弦の考え方：ずれた音を少しずつ平らにしながら くり返す）
const shamiCache = new Map();
function shamiBuf(ctx, m) {
  const key = `${ctx.sampleRate}|${m}`;
  if (shamiCache.has(key)) return shamiCache.get(key);
  const sr = ctx.sampleRate, f = mtof(m), len = Math.floor(sr * 0.65);
  const N = Math.max(2, Math.round(sr / f));
  const buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
  const ring = new Float32Array(N);
  // 撥は細く硬いので、はじめは明るい音（雑音にとがった形を混ぜる）
  for (let i = 0; i < N; i++) ring[i] = (Math.random() * 2 - 1) * 0.7 + (i < N * 0.15 ? 0.6 : -0.1);
  let idx = 0, prev = 0, peak = 0;
  const damp = 0.9965 - Math.min(0.004, f / 400000);   // 高い音ほど少し早く消える
  for (let n = 0; n < len; n++) {
    const cur = ring[idx];
    // 平らにする量を少なめにして、明るさを長く残す（三味線の、きらっとした音）
    const y = (cur * 0.62 + prev * 0.38) * damp;
    prev = cur; ring[idx] = y; idx = (idx + 1) % N;
    // さわり：弦が棹に触れてビリつく（片側だけ少しつぶす）
    const z = y > 0.25 ? 0.25 + (y - 0.25) * 0.45 : y;
    d[n] = z + 0.18 * z * Math.abs(z);
    peak = Math.max(peak, Math.abs(d[n]));
  }
  for (let n = 0; n < len; n++) d[n] /= peak || 1;
  // 終わりはなめらかに消す
  const fade = Math.floor(sr * 0.05);
  for (let n = 0; n < fade; n++) d[len - 1 - n] *= n / fade;
  shamiCache.set(key, buf);
  return buf;
}

// ラスボスの曲の激しさ（1〜3）。終筆の段階に合わせて、外から変える
let finalLevel = 1;
export function setFinalLevel(n) { finalLevel = Math.max(1, Math.min(3, n | 0)); }
export const finalLevelNow = () => finalLevel;
const I = {
  // エレピ（ホーム）
  epiano(song, m, t, d, v, out) {
    const f = mtof(m), len = d + 0.45;
    const g = env(song, t, 0.015, v, len, out, 0.5);
    osc(song, 'sine', f, t, len, g, (Math.random() - 0.5) * 8);
    const g2 = song.ctx.createGain(); g2.gain.setValueAtTime(0.3, t); g2.gain.exponentialRampToValueAtTime(0.01, t + 0.35); g2.connect(g);
    osc(song, 'sine', f * 2, t, 0.4, g2);
  },
  // 丸いベース
  bass(song, m, t, d, v, out) { osc(song, 'triangle', mtof(m), t, d + 0.06, env(song, t, 0.012, v, d + 0.06, out, 0.7)); },
  // 木琴のような、すぐ消える音
  mallet(song, m, t, d, v, out) { const len = Math.min(1.4, d + 0.5); osc(song, 'sine', mtof(m), t, len, env(song, t, 0.008, v, len, out, 0.4)); },
  // ミュートしたギターのような、短く切った和音
  chop(song, m, t, v, out) { osc(song, 'sawtooth', mtof(m), t, 0.1, env(song, t, 0.003, v, 0.1, out), (Math.random() - 0.5) * 10); },
  // うしろに薄く広がる和音（ゆっくり立ち上がる）
  pad(song, m, t, d, v, out) {
    const g = env(song, t, Math.min(0.6, d * 0.4), v, d + 0.6, out, 0.8);
    osc(song, 'sawtooth', mtof(m), t, d + 0.6, g, -7);
    osc(song, 'sawtooth', mtof(m), t, d + 0.6, g, 7);
  },
  // 口笛のような旋律（ゆっくり揺れる）
  whistle(song, m, t, d, v, out) {
    const g = env(song, t, 0.05, v, d + 0.15, out, 0.8);
    const o = osc(song, 'sine', mtof(m), t, d + 0.15, g);
    const lfo = song.ctx.createOscillator(), lg = song.ctx.createGain();
    lfo.frequency.value = 5; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(mtof(m) * 0.012, t + 0.3);
    lfo.connect(lg); lg.connect(o.frequency); lfo.start(t); lfo.stop(t + d + 0.2); song.track(lfo, t + d + 0.2);
  },
  // はねる指弾きのベース
  fingerBass(song, m, t, d, v, out) {
    const g = env(song, t, 0.006, v, d + 0.04, out, 0.6);
    osc(song, 'triangle', mtof(m), t, d + 0.04, g);
    const g2 = song.ctx.createGain(); g2.gain.setValueAtTime(0.5, t); g2.gain.exponentialRampToValueAtTime(0.01, t + 0.06); g2.connect(g);
    osc(song, 'square', mtof(m), t, 0.07, g2);
  },
  // 深く低いベース（次の音へすべるように移る）
  sub(song, m, t, d, v, out, from) {
    const g = env(song, t, 0.04, v, d + 0.1, out, 0.85);
    const o = osc(song, 'sine', from ? mtof(from) : mtof(m), t, d + 0.1, g);
    if (from) o.frequency.exponentialRampToValueAtTime(mtof(m), t + 0.12);
  },
  // くり返しの細かい音（三角の波で、やわらかく）
  arp(song, m, t, v, out) { osc(song, 'triangle', mtof(m), t, 0.22, env(song, t, 0.004, v, 0.22, out)); },
  // 低くこもった、管楽器のような長い音
  horn(song, m, t, d, v, out) { const g = env(song, t, 0.35, v, d + 0.5, out, 0.8); osc(song, 'sawtooth', mtof(m), t, d + 0.5, g); osc(song, 'triangle', mtof(m - 12), t, d + 0.5, g); },
  // 金管の旋律（すぐ立ち上がり、のびる）
  brass(song, m, t, d, v, out) { const g = env(song, t, 0.035, v, d + 0.25, out, 0.8); osc(song, 'sawtooth', mtof(m), t, d + 0.25, g, -5); osc(song, 'sawtooth', mtof(m), t, d + 0.25, g, 5); },
  // 布でくるんだような、やわらかいピアノ
  felt(song, m, t, d, v, out) {
    const len = Math.min(2.2, d + 0.8), f = mtof(m);
    const g = env(song, t, 0.02, v, len, out, 0.35);
    osc(song, 'sine', f, t, len, g);
    const g2 = song.ctx.createGain(); g2.gain.value = 0.25; g2.connect(g);
    osc(song, 'triangle', f, t, len, g2, 3);
  },
  // オルゴールのような、高く澄んだ音
  celesta(song, m, t, d, v, out) {
    const len = Math.min(1.8, d + 0.9), f = mtof(m);
    const g = env(song, t, 0.004, v, len, out, 0.3);
    osc(song, 'sine', f, t, len, g);
    const g2 = song.ctx.createGain(); g2.gain.setValueAtTime(0.3, t); g2.gain.exponentialRampToValueAtTime(0.01, t + 0.4); g2.connect(g);
    osc(song, 'sine', f * 4, t, 0.45, g2);
  },
  // ウッドベース（はじいてすぐ減る）
  upright(song, m, t, d, v, out) { const len = Math.min(0.9, d + 0.2); osc(song, 'triangle', mtof(m), t, len, env(song, t, 0.008, v, len, out, 0.45)); osc(song, 'sine', mtof(m), t, len, env(song, t, 0.008, v * 0.6, len, out, 0.45)); },
  // 三味線：本物の弦のように、はじいた音を計算で作って鳴らす（音ごとに1回だけ作って使い回す）
  //   はじいた瞬間の明るい音 → すぐ丸くなって減る。弦が棹に触れる「さわり」のビリつきと、撥が皮を打つ「パチッ」を足す
  shami(song, m, t, v, out) {
    const src = song.ctx.createBufferSource(); src.buffer = shamiBuf(song.ctx, m);
    // 撥で弾いた瞬間、高さが少し上がってから戻る
    src.playbackRate.setValueAtTime(1.012, t); src.playbackRate.exponentialRampToValueAtTime(1, t + 0.04);
    const g = song.ctx.createGain(); g.gain.value = v * 2.2; src.connect(g); g.connect(out);
    src.start(t); src.stop(t + 0.7); song.track(src, t + 0.7);
    // 撥が皮を打つ音（低いパチッ＋短い雑音）
    osc(song, 'sine', 190, t, 0.03, env(song, t, 0.001, v * 0.9, 0.03, out));
    hitNoise(song, t, v * 0.7, 0.008, out);
  },
  // 尺八：息の音がまじった、少しかすれた笛。音の頭で息が強く入り、のびる間はゆっくり揺れる
  shaku(song, m, t, d, v, out) {
    const f = mtof(m), len = d + 0.12;
    const g = env(song, t, 0.04, v, len, out, 0.85);
    const o = osc(song, 'sine', f, t, len, g);
    const g2 = song.ctx.createGain(); g2.gain.value = 0.22; g2.connect(g);
    osc(song, 'triangle', f * 2, t, len, g2);
    // 揺れ（少し遅れて始まる）
    const lfo = song.ctx.createOscillator(), lg = song.ctx.createGain();
    lfo.frequency.value = 5.2; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * 0.014, t + Math.min(0.35, d * 0.6));
    lfo.connect(lg); lg.connect(o.frequency); lfo.start(t); lfo.stop(t + len + 0.05); song.track(lfo, t + len + 0.05);
    // 下から少しすくい上げて入る
    o.frequency.setValueAtTime(f * 0.97, t); o.frequency.linearRampToValueAtTime(f, t + 0.06);
    // 息の音
    const src = song.ctx.createBufferSource(); src.buffer = noise(song.ctx); src.loop = true;
    const bp = song.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f * 2; bp.Q.value = 2;
    src.connect(bp); bp.connect(env(song, t, 0.02, v * 0.5, len, out, 0.35));
    src.start(t); src.stop(t + len + 0.05); song.track(src, t + len + 0.05);
  },
  // 合唱：何人もの声が重なったような、厚く ゆっくり立ち上がる和音の1音
  choir(song, m, t, d, v, out) {
    const f = mtof(m), len = d + 0.4;
    const g = env(song, t, Math.min(0.5, d * 0.25), v, len, out, 0.85);
    for (const dt of [-12, -4, 5, 13]) osc(song, 'sawtooth', f, t, len, g, dt);
    osc(song, 'triangle', f * 2, t, len, g, 3);
  },
  // 寺の鐘：低く、ゴーンと長く残る（ずれた倍音を重ねる）
  bell(song, m, t, v, out) {
    const f = mtof(m);
    for (const [k, a, d] of [[1, 1, 4.5], [2.76, 0.5, 2.6], [5.4, 0.25, 1.4], [0.5, 0.6, 5]]) osc(song, 'sine', f * k, t, d, env(song, t, 0.004, v * a, d, out, 0.3));
    hitNoise(song, t, v * 0.3, 0.04, out);
  },
  // 太鼓：低く長く響く ドン
  taiko(song, t, v, out) {
    const g = env(song, t, 0.004, v, 0.55, out);
    const o = song.ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(52, t + 0.2);
    o.connect(g); o.start(t); o.stop(t + 0.6); song.track(o, t + 0.6);
    hitNoise(song, t, v * 0.35, 0.05, out);
  },
  kick(song, t, v, out, hi = 110, lo = 45) {
    const g = env(song, t, 0.004, v, 0.3, out);
    const o = song.ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(hi, t); o.frequency.exponentialRampToValueAtTime(lo, t + 0.15);
    o.connect(g); o.start(t); o.stop(t + 0.36); song.track(o, t + 0.36);
  },
  noise: hitNoise,
  clap(song, t, v, out) { hitNoise(song, t, v * 0.7, 0.03, out); hitNoise(song, t + 0.012, v, 0.12, out); },
  rim(song, t, v, out) { osc(song, 'triangle', 820, t, 0.04, env(song, t, 0.002, v, 0.04, out)); hitNoise(song, t, v * 0.4, 0.03, out); },
};

// ざわめきが高くなっていく（盛り上げの前ぶれ）
function sweep(song, t, d, out, f1, f2, v1, v2) {
  const src = song.ctx.createBufferSource(); src.buffer = noise(song.ctx); src.loop = true;
  const fl = song.ctx.createBiquadFilter(); fl.type = 'bandpass'; fl.Q.value = 1.2;
  fl.frequency.setValueAtTime(f1, t); fl.frequency.exponentialRampToValueAtTime(f2, t + d);
  const g = song.ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v1, t + 0.05); g.gain.linearRampToValueAtTime(v2, t + d * 0.92); g.gain.linearRampToValueAtTime(0, t + d);
  src.connect(fl); fl.connect(g); g.connect(out);
  src.start(t); src.stop(t + d + 0.05); song.track(src, t + d + 0.05);
}
const riser = (song, t, d, out) => sweep(song, t, d, out, 300, 5000, 0.005, 0.06);

// ---------- 曲 ----------
// 1曲ずつ、楽器と並べ方（arrange）を別々に書く。
// arrange(song, i（小節の中のどこ）, bar（何小節目）, t（鳴らす時刻）, sd（1こま の長さ）)
// song.f(名前, 種類, 高さ, 鋭さ, つなぎ先) で、曲の中で使い回す こもらせ部品を作る
export const SONGS = {
  // ホーム：ゆったり跳ねるビートに、エレピの和音（ヘ長調あたり）
  home: {
    name: 'ホーム', bpm: 86, swing: 0.14, steps: 16, div: 4,
    bars: [
      { keys: [53, 57, 60, 64, 67], root: 41 },   // Fmaj9
      { keys: [52, 55, 59, 62], root: 40 },       // Em7
      { keys: [50, 53, 57, 60, 64], root: 38 },   // Dm9
      { keys: [48, 52, 55, 59, 62], root: 36 },   // Cmaj9
    ],
    arrange(song, i, bar, t, sd) {
      const S = this, B = S.bars[bar % 4], cyc = bar % 16;
      const duck = song.duck, drums = song.drums;
      const bassOut = song.f('bass', 'lowpass', 520, 0, duck), leadOut = song.f('lead', 'lowpass', 2600, 0, duck);
      const snOut = song.f('sn', 'bandpass', 1900, 0.9, drums), hhOut = song.f('hh', 'highpass', 7500, 0.7, drums);
      const D = { k: 'x......o..x.....', s: '....x.......x...', h: 'xoxoxoxoxoxoxoxo' };
      const k = hitOn(D.k, i);
      if (k && !(cyc === 15 && i >= 8)) { I.kick(song, t, k > 0.8 ? 0.4 : 0.28, drums); song.pump(t, 0.72); }
      const s = hitOn(D.s, i); if (s) { I.noise(song, t, vary(0.1 * s), 0.15, snOut); I.bass(song, 55, t, 0.05, 0.05 * s, drums); }
      const h = hitOn(D.h, i); if (h) I.noise(song, t, vary(h > 0.8 ? 0.05 : 0.025), 0.04, hhOut);
      for (const [at, len] of [[0, 6], [7, 1], [10, 5]]) if (at === i) B.keys.slice(0, 4).forEach((m, n) => I.epiano(song, m, t + n * 0.006, len * sd, vary(0.05), duck));
      for (const [at, off, len] of [[0, 0, 4], [6, 7, 2], [8, 0, 3], [14, -2, 2]]) if (at === i) I.bass(song, B.root + off, t, len * sd * 0.9, vary(0.3), bassOut);
      if (cyc >= 8) {
        const j = (bar % 4) * 16 + i;
        for (const [at, m, len] of [[0, 72, 3], [4, 69, 2], [6, 67, 4], [14, 64, 2], [16, 69, 6], [24, 67, 2], [26, 64, 4], [32, 65, 3], [36, 64, 2], [38, 62, 6], [48, 60, 4], [52, 62, 2], [54, 64, 8]])
          if (at === j) I.mallet(song, m, t, len * sd, vary(0.07), leadOut);
      }
    },
  },

  // 通常のフェーズ：まっすぐな4つ打ちに、切ったギターと はねるベース。ホ短調の行き来（夜の街のような、すました感じ）
  play: {
    name: '通常のフェーズ', bpm: 168, swing: 0.03, steps: 16, div: 4,
    bars: [
      { chop: [59, 62, 66], pad: [52, 55, 59, 62], root: 40 },   // Em9
      { chop: [61, 66, 67], pad: [55, 61, 66], root: 45 },       // A13
      { chop: [59, 62, 66], pad: [52, 55, 59, 62], root: 40 },   // Em9
      { chop: [61, 66, 67], pad: [55, 61, 66], root: 45 },       // A13
      { chop: [59, 62, 64], pad: [52, 55, 59, 62], root: 36 },   // Cmaj9
      { chop: [57, 62, 64], pad: [54, 57, 62], root: 38 },       // D6/9
      { chop: [57, 60, 64], pad: [52, 57, 59], root: 47 },       // B7sus(b9)
      { chop: [57, 63, 66], pad: [51, 57, 63], root: 47 },       // B7
    ],
    arrange(song, i, bar, t, sd) {
      const S = this, B = S.bars[bar % 8], cyc = bar % 16;
      const duck = song.duck, drums = song.drums;
      const chopOut = song.f('chop', 'lowpass', 1500, 2, duck), padOut = song.f('pad', 'lowpass', 900, 0, duck);
      const bassOut = song.f('bass', 'lowpass', 900, 0, duck), wOut = song.f('w', 'lowpass', 3000, 0, song.out);
      const clapOut = song.f('clap', 'bandpass', 1300, 0.8, drums), shOut = song.f('sh', 'highpass', 6000, 0.5, drums), ohOut = song.f('oh', 'highpass', 8000, 0.5, drums);
      if (i % 4 === 0) { I.kick(song, t, 0.3, drums, 95, 48); song.pump(t, 0.8); }
      if (i === 4 || i === 12) I.clap(song, t, vary(0.09), clapOut);
      if (i % 2 === 0) I.noise(song, t, vary(i % 4 ? 0.016 : 0.024), 0.04, shOut);
      if (i % 4 === 2) I.noise(song, t, vary(0.03), 0.16, ohOut);
      // 1回り（16小節）の最初の4小節は、ギターなしで休む
      if (cyc >= 4) for (const at of [2, 5, 7, 10, 13, 15]) if (at === i) B.chop.forEach((m) => I.chop(song, m, t, vary(at % 2 ? 0.03 : 0.045), chopOut));
      if (i === 0) B.pad.forEach((m) => I.pad(song, m, t, 16 * sd, 0.016, padOut));
      for (const [at, off, len] of [[0, 0, 3], [3, 12, 1], [6, 0, 1], [7, 7, 2], [10, 0, 2], [13, 10, 1], [14, 12, 2]]) if (at === i) I.fingerBass(song, B.root + off - 12, t, len * sd * 0.85, vary(0.32), bassOut);
      // 後ろの8小節だけ、口笛のような旋律（8小節で1回り）
      if (cyc >= 8) {
        const j = (bar % 8) * 16 + i;
        for (const [at, m, len] of [[0, 71, 4], [6, 74, 2], [8, 76, 6], [20, 74, 2], [22, 71, 4], [32, 69, 4], [38, 71, 2], [40, 67, 8], [64, 67, 4], [70, 71, 2], [72, 72, 6], [84, 71, 2], [86, 69, 4], [96, 66, 4], [102, 64, 2], [104, 63, 10]])
          if (at === j) I.whistle(song, m, t, len * sd, 0.045, wOut);
      }
    },
  },

  // ボス戦：「大きな相手」の圧。うなるベース、重い太鼓、金管の一撃。嬰ヘ短調に半音上の和音を混ぜて不穏にする。
  //   56小節（約1分30秒）で1回り。A（主題・16）→ B（いちばん厚い山・16）→ ドン！で止まって鐘だけ（1つの楽器・4）
  //   → 楽器が1つずつ戻ってどんどん盛り上がる（4）→ C（Aとも Bとも違う、上っていく和音の山・16）→ 静まって A へ戻る
  boss: {
    name: 'ボス戦', bpm: 150, swing: 0.04, steps: 16, div: 4, gain: 1.25,
    chords: {
      Fm: { arp: [54, 57, 61, 64], stab: [54, 57, 61], root: 42 },   // F#m(add9)
      G: { arp: [55, 59, 62, 66], stab: [55, 59, 62], root: 43 },    // Gmaj7（半音上：不穏）
      C7: { arp: [53, 56, 59, 62], stab: [53, 56, 61], root: 37 },   // C#7(b9)
      D: { arp: [54, 57, 61, 62], stab: [54, 57, 62], root: 38 },    // Dmaj7
      E: { arp: [56, 59, 64, 66], stab: [56, 59, 64], root: 40 },    // E(add9)
      Bm: { arp: [54, 59, 62, 66], stab: [54, 59, 62], root: 35 },   // Bm
      Cm: { arp: [56, 61, 64, 68], stab: [56, 61, 64], root: 37 },   // C#m
    },
    // 56小節ぶんの和音の並び
    prog: [...Array(4)].flatMap(() => ['Fm', 'G', 'Fm', 'C7'])                 // A（16）
      .concat(...Array(2).fill(['D', 'E', 'Fm', 'Fm', 'D', 'E', 'C7', 'C7']))  // B（16）
      .concat('Fm', 'G', 'Fm', 'C7', 'Fm', 'G', 'Fm', 'C7')                   // 鐘だけ → 盛り上げ（8）
      .concat(...Array(2).fill(['Bm', 'Cm', 'D', 'E', 'Bm', 'Cm', 'D', 'C7'])), // C（16）
    leadA: [[0, 66, 8], [8, 69, 8], [16, 67, 12], [28, 66, 4], [32, 66, 8], [40, 64, 8], [48, 65, 16]],
    // 旋律（どの小節から数えるか, [こま, 音, 長さ]…）
    leadB: [[0, 69, 6], [6, 66, 2], [8, 69, 8], [16, 71, 6], [22, 68, 2], [24, 71, 8], [32, 73, 12], [44, 71, 4], [48, 69, 16],
      [64, 69, 6], [70, 66, 2], [72, 69, 8], [80, 71, 6], [86, 73, 2], [88, 76, 8], [96, 77, 8], [104, 76, 4], [108, 73, 4], [112, 73, 16]],
    solo: [[0, 66, 4], [4, 69, 4], [8, 73, 8], [16, 74, 4], [20, 71, 4], [24, 67, 8], [32, 66, 4], [36, 69, 4], [40, 73, 4], [44, 76, 4], [48, 77, 8], [56, 73, 8]],
    leadC: [[0, 74, 8], [8, 73, 4], [12, 71, 4], [16, 73, 8], [24, 76, 8], [32, 78, 8], [40, 76, 4], [44, 74, 4], [48, 76, 12], [60, 80, 4],
      [64, 78, 8], [72, 74, 8], [80, 76, 8], [88, 73, 8], [96, 74, 8], [104, 73, 4], [108, 71, 4], [112, 73, 8]],
    arrange(song, i, bar, t, sd) {
      const S = this, p = bar % 56, B = S.chords[S.prog[p]];
      const sec = p < 16 ? 'A' : p < 32 ? 'B' : p < 36 ? 'solo' : p < 40 ? 'build' : 'C';
      const b4 = p - 36;   // 盛り上げの何小節目か（0〜3）
      const pass2 = (sec === 'B' && p >= 24) || (sec === 'C' && p >= 48);   // B・C の2回目（少し厚くする）
      const duck = song.duck, drums = song.drums;
      const arpOut = song.f('arp', 'lowpass', 1500, 1, duck), growlOut = song.f('growl', 'lowpass', 420, 5, duck);
      const stabOut = song.f('stab', 'lowpass', 1100, 0, song.out), hornOut = song.f('horn', 'lowpass', 1300, 0, song.out);
      const choirOut = song.f('choir', 'lowpass', 1600, 0, duck);
      const snOut = song.f('sn', 'bandpass', 1600, 0.7, drums), hhOut = song.f('hh', 'highpass', 9000, 0.5, drums), crOut = song.f('cr', 'highpass', 4000, 0.4, drums);
      // 鐘のための やまびこ（鐘だけの所で広がりを出す）
      if (!song.echo) {
        const dl = song.ctx.createDelay(1), fb = song.ctx.createGain(), wet = song.ctx.createGain(), lp = song.ctx.createBiquadFilter();
        dl.delayTime.value = sd * 3; fb.gain.value = 0.38; wet.gain.value = 0.5; lp.type = 'lowpass'; lp.frequency.value = 2500;
        dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(wet); wet.connect(song.out);
        song.echo = song.ctx.createGain(); song.echo.connect(song.out); song.echo.connect(dl);
      }
      // どの楽器が鳴るか
      const L = {
        hat: sec === 'A' || sec === 'B' || sec === 'C' || (sec === 'build' && b4 >= 1),
        hat16: (sec === 'B' && pass2) || sec === 'C' || (sec === 'build' && b4 >= 2),
        kick: (sec === 'A' && p >= 4) || sec === 'B' || sec === 'C',
        bass: (sec === 'A' && p >= 4) || sec === 'B' || sec === 'C' || (sec === 'build' && b4 >= 1),
        snare: (sec === 'A' && p >= 8) || sec === 'B' || sec === 'C',
        stab: (sec === 'A' && p >= 8) || sec === 'B' || sec === 'C',
        taiko: sec === 'B' || sec === 'C',
        arp: sec !== 'solo' && !(sec === 'build' && b4 < 2),
        choir: (sec === 'B' && pass2) || sec === 'C',
      };
      // ---- 区切りの音 ----
      // Bの終わり → ドン！と鳴らして止める
      if (p === 32 && i === 0) { I.kick(song, t, 0.55, drums, 70, 30); I.noise(song, t, 0.09, 1.6, crOut, 0.005); song.pump(t, 0.4); }
      // 盛り上げ：バスドラが 4分 → 8分 → 16分 と細かくなり、スネアの連打と、高くなっていく ざわめき
      if (sec === 'build') {
        // 低いバスドラの4つ打ち（ずっと）＋ 上に重なる軽いバスドラが 4分 → 8分 → 16分 と細かくなる
        //   低い音は小さいスピーカーでは聞こえにくいので、頭に「ドッ」という当たりの音を足して聞こえるようにする
        if (i % 4 === 0) {
          I.kick(song, t, 0.6, drums, 150, 36);
          osc(song, 'triangle', 190, t, 0.05, env(song, t, 0.002, 0.16, 0.05, drums));
          song.pump(t, 0.55);
        }
        const kickEvery = [0, 4, 2, 1][b4];
        if (kickEvery && i % kickEvery === 0 && i % 4) {
          I.kick(song, t, 0.32 + b4 * 0.05, drums, 200, 90);
          osc(song, 'triangle', 260, t, 0.04, env(song, t, 0.002, 0.08 + b4 * 0.02, 0.04, drums));
        }
        if (b4 >= 2 && i % (b4 === 2 ? 2 : 1) === 0) I.noise(song, t, 0.02 + ((b4 - 2) * 16 + i) * 0.0015, 0.08, snOut);
        if (b4 === 2 && i === 0) riser(song, t, 32 * sd, song.out);
      }
      // Bの最後の小節：スネアの連打
      if (p === 31 && i >= 8) I.noise(song, t, 0.03 + (i - 8) * 0.01, 0.09, snOut);
      // Cの最後：Bの終わりと同じく、スネアの連打で Aの頭（シンバル）へつなぐ
      const tail = false;
      if (p === 55 && i >= 8) I.noise(song, t, 0.03 + (i - 8) * 0.01, 0.09, snOut);
      if ((p === 0 || p === 40 || p === 48 || p === 16 || p === 24) && i === 0) I.noise(song, t, p === 40 ? 0.08 : 0.05, 1.4, crOut, 0.005);   // 山の頭のシンバル
      // ---- ドラム ----
      const four = (sec === 'A' && p >= 8) || sec === 'B';   // Aの後半からBの終わりまで4つ打ち
      if (four && i % 4 === 2) I.noise(song, t, vary(0.03), 0.14, crOut);
      // Aの最後の4小節から：手拍子と細かいハイハットが入り、そのままBの終わりまで鳴り続ける（楽器が増えていく）
      if ((sec === 'A' && p >= 12) || sec === 'B') {
        if (i === 4 || i === 12) I.clap(song, t, vary(0.08), snOut);
        if (i % 2 === 1 && !L.hat16) I.noise(song, t, vary(0.01), 0.03, hhOut);
      }
      if (L.kick && !tail && (four ? i % 4 === 0 : (i === 0 || i === 6 || i === 10 || (i === 13 && bar % 2) || (sec === 'C' && i === 4)))) { I.kick(song, t, i === 0 ? 0.46 : 0.34, drums, 85, 38); song.pump(t, 0.6); }
      if (L.snare && !tail && i === 8) { I.noise(song, t, vary(0.13), 0.2, snOut); I.bass(song, 50, t, 0.06, 0.06, drums); }
      if (L.snare && !tail && sec === 'C' && i === 14) I.noise(song, t, vary(0.05), 0.1, snOut);
      if (L.hat && !tail && (L.hat16 ? true : i % 4 === 2)) I.noise(song, t, vary(L.hat16 ? (i % 4 === 2 ? 0.022 : 0.01) : 0.016), 0.03, hhOut);
      if (L.taiko && !tail && (i === 0 || i === 3 || (sec === 'C' && i === 11))) I.kick(song, t, i === 0 ? 0.3 : 0.2, drums, 70, 48);
      // ---- ベース（低くうなる、8分刻み） ----
      if (L.bass && !tail && i % 2 === 0) {
        const off = i === 6 || i === 14 ? 12 : i === 12 ? 7 : 0;
        const g = env(song, t, 0.005, vary(0.085), sd * 1.7, growlOut, 0.6);
        osc(song, 'sawtooth', mtof(B.root - 12 + off), t, sd * 1.7, g);
        osc(song, 'sawtooth', mtof(B.root - 12 + off), t, sd * 1.7, g, 9);
      }
      // ---- 金管の一撃 ----
      if (L.stab && !tail && (i === 0 || (i === 3 && (bar % 2 === 1 || sec !== 'A')) || (sec === 'C' && i === 10))) B.stab.forEach((m) => {
        const g = env(song, t, 0.01, i === 0 ? 0.035 : 0.022, 0.32, stabOut, 0.5);
        osc(song, 'sawtooth', mtof(m), t, 0.32, g, -6); osc(song, 'sawtooth', mtof(m - 12), t, 0.32, g, 6);
      });
      // ---- 細かくくり返す音 ----
      if (L.arp && !tail) {
        const order = [0, 2, 1, 3, 2, 0, 3, 1, 0, 2, 1, 3, 2, 3, 1, 2];
        I.arp(song, B.arp[order[i]] + 12 + (i >= 8 && bar % 2 ? 12 : 0), t, vary(i % 4 === 0 ? 0.034 : 0.018), arpOut);
      }
      // ---- 合唱のような、厚く長い和音（B と C） ----
      if (L.choir && i === 0) B.stab.forEach((m) => {
        const g = env(song, t, 0.25, 0.014, 16 * sd + 0.3, choirOut, 0.85);
        osc(song, 'triangle', mtof(m + 12), t, 16 * sd + 0.3, g, -5); osc(song, 'sawtooth', mtof(m + 12), t, 16 * sd + 0.3, g, 5);
      });
      // ---- 旋律 ----
      const play = (list, from, fn, loop = 99) => { const j = ((p - from) % loop) * 16 + i; for (const [at, m, len] of list) if (at === j) fn(m, len); };
      // Aの後半：低い金管が主題をゆっくりなぞる
      if (sec === 'A' && p >= 8) play(S.leadA, 8, (m, len) => I.brass(song, m - 12, t, len * sd * 0.95, 0.018, hornOut), 4);
      if (sec === 'B') play(S.leadB, 16, (m, len) => I.brass(song, m, t, len * sd * 0.95, 0.02, hornOut), 8);
      // Cの2回目は、1オクターブ下を重ねて厚くする
      if (sec === 'C' && !tail) play(S.leadC, 40, (m, len) => { I.brass(song, m, t, len * sd * 0.95, 0.022, hornOut); if (pass2) I.brass(song, m - 12, t, len * sd * 0.95, 0.014, hornOut); }, 8);
      // 鐘：止まった所で1つだけ鳴り、盛り上げの間も同じ旋律をくり返す
      if (sec === 'solo') play(S.solo, 32, (m, len) => I.celesta(song, m + 12, t, len * sd, 0.05, song.echo));
      if (sec === 'build') play(S.solo, 36, (m, len) => I.celesta(song, m + 12, t, len * sd, 0.04, song.echo));
    },
  },

  // 結果：3拍子のゆるいジャズワルツ。ドラムはブラシだけ。変ロ長調（一息つく）
  result: {
    name: '結果', bpm: 132, swing: 0.17, steps: 6, div: 2,
    bars: [
      { keys: [57, 60, 62, 65], root: 46 },   // Bbmaj9
      { keys: [53, 57, 58, 62], root: 43 },   // Gm9
      { keys: [51, 55, 58, 62], root: 36 },   // Cm9
      { keys: [51, 57, 62, 64], root: 41 },   // F13
      { keys: [55, 58, 62, 63], root: 39 },   // Ebmaj7
      { keys: [54, 58, 60, 63], root: 39 },   // Ebm6
      { keys: [53, 57, 60, 62], root: 38 },   // Dm7
      { keys: [53, 59, 63, 65], root: 43 },   // G7(b13)
    ],
    arrange(song, i, bar, t, sd) {
      const S = this, B = S.bars[bar % 8], next = S.bars[(bar + 1) % 8], cyc = bar % 16;
      const keyOut = song.f('key', 'lowpass', 1800, 0, song.out), bassOut = song.f('bass', 'lowpass', 650, 0, song.out);
      const brOut = song.f('brush', 'bandpass', 3200, 0.5, song.out), celOut = song.f('cel', 'lowpass', 5000, 0, song.out);
      // ブラシ：1・2・3拍目を、なでるように
      if (i % 2 === 0) I.noise(song, t, vary(i === 0 ? 0.022 : 0.014), 0.22, brOut, 0.04);
      // ウッドベース：1拍目に根の音、3拍目は次の和音へ近づく音
      if (i === 0) I.upright(song, B.root, t, 2 * sd, vary(0.3), bassOut);
      if (i === 4) I.upright(song, next.root + (next.root > B.root ? -1 : 1), t, 2 * sd, vary(0.24), bassOut);
      // ピアノ：2拍目と3拍目に軽く（ときどき2拍目の裏）
      const comp = bar % 2 ? [[2, 1], [3, 1], [4, 2]] : [[2, 2], [4, 2]];
      for (const [at, len] of comp) if (at === i) B.keys.forEach((m, n) => I.felt(song, m, t + n * 0.008, len * sd, vary(0.021), keyOut));
      // 後ろの8小節だけ、オルゴールのような旋律（8小節で1回り）
      if (cyc >= 8) {
        const j = (bar % 8) * 6 + i;
        for (const [at, m, len] of [[0, 69, 3], [3, 70, 1], [4, 72, 2], [6, 74, 6], [12, 70, 3], [15, 67, 1], [16, 70, 2], [18, 69, 6], [24, 67, 3], [27, 70, 1], [28, 74, 2], [30, 72, 6], [36, 69, 3], [39, 65, 1], [40, 67, 2], [42, 71, 6]])
          if (at === j) I.celesta(song, m + 12, t, len * sd, 0.04, celOut);
      }
    },
  },

  // できごと：占い小屋のような、ふしぎで少しおどけたワルツ（ニ短調・3拍子）。
  //   ウッドベースの「ズン」、ピアノの「チャッチャッ」、シャカシャカ、オルゴールの旋律（16小節で1回り。前半はオルゴールの分散和音だけ）
  event: {
    name: 'できごと', bpm: 112, swing: 0.1, steps: 12, div: 4, gain: 0.9,
    bars: [
      { keys: [53, 57, 60, 64], root: 38 },   // Dm9
      { keys: [53, 58, 62, 65], root: 43 },   // Gm9
      { keys: [50, 53, 57, 62], root: 46 },   // Bbmaj7
      { keys: [55, 58, 61, 64], root: 45 },   // A7(b9)
    ],
    arrange(song, i, bar, t, sd) {
      const S = this, B = S.bars[bar % 4], cyc = bar % 16;
      const keyOut = song.f('key', 'lowpass', 1700, 0, song.out), bassOut = song.f('bass', 'lowpass', 700, 0, song.out);
      const shOut = song.f('sh', 'highpass', 6500, 0.6, song.out), celOut = song.f('cel', 'lowpass', 6000, 0, song.out);
      // ワルツの「ズン・チャッ・チャッ」
      if (i === 0) I.upright(song, B.root, t, 3 * sd, vary(0.32), bassOut);
      if (i === 8 && bar % 2) I.upright(song, B.root + 7, t, 2 * sd, vary(0.2), bassOut);
      if (i === 4 || i === 8) B.keys.forEach((m, n) => I.felt(song, m, t + n * 0.006, 1.5 * sd, vary(0.018), keyOut));
      // シャカシャカ（2・3拍目を少し強く）
      if (i % 2 === 0) I.noise(song, t, vary(i === 4 || i === 8 ? 0.02 : 0.01), 0.05, shOut);
      // 前半：オルゴールが和音の音を、ころころと
      if (cyc < 8 && (i === 0 || i === 6 || i === 10)) I.celesta(song, B.keys[(i / 2 + bar) % 4] + 24, t, 2 * sd, 0.022, celOut);
      // 後半：オルゴールの旋律（8小節）
      if (cyc >= 8) {
        const j = (bar % 8) * 12 + i;
        for (const [at, m, len] of [
          [0, 81, 4], [4, 77, 2], [6, 76, 2], [8, 74, 4],
          [12, 79, 4], [16, 82, 2], [18, 81, 2], [20, 79, 4],
          [24, 77, 4], [28, 74, 2], [30, 77, 2], [32, 81, 4],
          [36, 79, 2], [38, 77, 2], [40, 76, 4], [44, 73, 4],
          [48, 86, 4], [52, 81, 2], [54, 77, 2], [56, 74, 4],
          [60, 76, 4], [64, 79, 2], [66, 82, 2], [68, 86, 4],
          [72, 84, 4], [76, 81, 2], [78, 77, 2], [80, 74, 4],
          [84, 76, 4], [88, 73, 4], [92, 69, 4],
        ]) if (at === j) I.celesta(song, m, t, len * sd, 0.04, celOut);
      }
    },
  },

  // ラスボス「終筆」：速い三味線のリフ・太鼓・尺八に、合唱と金管の壮大な和音を重ねる。ホ音の都節（ミ・ファ・ラ・シ・ド）
  //   80小節（約1分44秒）で1回り。A・B・C をはっきり分け、低い音（うなり・鐘）から高い音（尺八・鈴）まで広く使い、左右にも広げる
  //    0〜7   前奏：太鼓だけ（だんだん増える）→ 後半で低いうなりと鐘
  //    8〜15  A1：三味線のリフ（主題）。低い合唱がうしろで鳴る
  //   16〜23  B1：尺八の旋律。和音が変わり（ファ→ソ→ラ→ミ）、ドラムは半分の速さでためる
  //   24〜27  ため：スネアの連打・太鼓の連打・高くなっていくざわめき
  //   28〜35  C1：さび。金管の旋律と、厚い合唱。4つ打ちとシンバル
  //   36〜39  落とす：三味線のひとり弾き・太鼓・鐘だけ
  //   40〜47  A2：リフに金管の一撃と、尺八の合いの手
  //   48〜55  B2：尺八の旋律に合唱を重ねる
  //   56〜59  ため2：バスドラが細かくなっていく
  //   60〜71  C2：全音上へ転調した さび。いちばん派手（太鼓の連打・金管を2重・合唱を高く）
  //   72〜75  締め：ドン！と和音を叩き、合唱と鐘がのびる
  //   76〜79  太鼓だけに戻って、前奏へつながる
  //   段階（finalLevel）：2 からは A でも4つ打ち、3 からは A・B にも金管の一撃と細かいハイハット
  final: {
    name: 'ラスボス', bpm: 184, swing: 0, steps: 16, div: 4, gain: 1.1, lp: 10000,
    riffs: {
      r1: [64, 0, 64, 76, 0, 64, 72, 71, 69, 0, 65, 64, 0, 69, 71, 72],
      r2: [64, 0, 64, 76, 0, 64, 72, 71, 69, 71, 72, 76, 77, 76, 72, 71],
      r3: [69, 0, 69, 81, 0, 69, 77, 76, 72, 0, 71, 69, 0, 72, 71, 69],
      r4: [65, 0, 65, 77, 0, 65, 72, 71, 69, 71, 69, 65, 64, 0, 59, 0],
      solo: [76, 77, 76, 72, 71, 72, 71, 69, 65, 69, 65, 64, 59, 60, 59, 57],
      solo2: [57, 59, 60, 64, 65, 64, 65, 69, 71, 69, 71, 72, 76, 77, 76, 81],
      arpF: [65, 0, 69, 72, 0, 77, 0, 72], arpG: [67, 0, 71, 74, 0, 79, 0, 74], arpA: [69, 0, 72, 76, 0, 81, 0, 76], arpE: [64, 0, 68, 71, 0, 76, 0, 71],
    },
    roots: { r1: 40, r2: 40, r3: 45, r4: 41, solo: 40, solo2: 40 },
    order: ['r1', 'r2', 'r1', 'r4', 'r3', 'r3', 'r1', 'r4'],
    // 和音（合唱・金管）。B：ファ→ソ→ラ→ミ、C：ラ→ファ→ソ→ミ（ミは ソ# を入れて、強く引っぱる）
    chords: { E: [40, 52, 56, 59, 64], F: [41, 53, 57, 60, 65], G: [43, 55, 59, 62, 67], A: [45, 52, 57, 60, 64] },
    progB: ['F', 'G', 'A', 'E'], progC: ['A', 'F', 'G', 'E'],
    flute: [[0, 76, 6], [6, 77, 2], [8, 81, 8], [16, 83, 4], [20, 84, 4], [24, 83, 4], [28, 81, 4], [32, 77, 8], [40, 76, 4], [44, 77, 4], [48, 76, 16],
      [64, 81, 6], [70, 83, 2], [72, 84, 8], [80, 88, 4], [84, 84, 4], [88, 83, 8], [96, 81, 4], [100, 77, 4], [104, 76, 4], [108, 72, 4], [112, 76, 8], [120, 72, 4], [124, 71, 4]],
    // さびの金管の旋律（4小節で1回り）
    //   A のリフの「ミ…ド・シ・ラ…ファ」をのばした形。B の尺八の終わりでも先に少し聞かせておく
    hook: [[0, 76, 8], [8, 72, 4], [12, 71, 4], [16, 72, 6], [22, 69, 2], [24, 65, 8], [32, 71, 4], [36, 72, 4], [40, 74, 8], [48, 76, 8], [56, 71, 4], [60, 68, 4]],
    // ため（さびの前）：金管が半音ずつ近い音で上がっていき、ソ# からさびの頭のラへ解決する
    rise: [57, 59, 60, 62, 64, 65, 68],
    answer: [[12, 84, 2], [14, 83, 2], [44, 81, 2], [46, 83, 2]],
    arrange(song, i, bar, t, sd) {
      const S = this, p = bar % 80, lv = finalLevel;
      const sec = p < 8 ? 'intro' : p < 16 ? 'A1' : p < 24 ? 'B1' : p < 28 ? 'build' : p < 36 ? 'C1' : p < 40 ? 'drop' : p < 48 ? 'A2' : p < 56 ? 'B2' : p < 60 ? 'build2' : p < 72 ? 'C2' : p < 76 ? 'end' : 'outro';
      const isA = sec === 'A1' || sec === 'A2', isB = sec === 'B1' || sec === 'B2', isC = sec === 'C1' || sec === 'C2';
      const bld = sec === 'build' || sec === 'build2', b4 = bld ? p - (sec === 'build' ? 24 : 56) : -1;
      // さびの直前の1拍は、全部止めて息をのませる
      if (b4 === 3 && i >= 12) return;
      const tr = (sec === 'C2' || sec === 'build2') ? 2 : 0;
      const ch = bld ? 'E' : isB ? S.progB[(p - (sec === 'B1' ? 16 : 48)) % 4] : isC ? S.progC[(p - (sec === 'C1' ? 28 : 60)) % 4] : sec === 'end' ? 'E' : null;
      const C = ch ? S.chords[ch].map((m) => m + tr) : null;
      const rk = sec === 'drop' ? (p === 39 ? 'solo2' : 'solo') : (isA || isC) ? S.order[p % 8] : null;
      const R = rk ? S.riffs[rk] : null, root = (C ? C[0] : rk ? S.roots[rk] : 40) + (C ? 0 : tr);
      const duck = song.duck, drums = song.drums;
      // 左右に広げる：三味線は少し左、尺八は少し右、合唱は左右いっぱい
      const shOut = song.f('shami', 'highpass', 160, 0.5, song.pan('shL', -0.25, duck));
      const arpOut = song.f('arp', 'highpass', 300, 0.5, song.pan('arpR', 0.35, duck));
      const bassOut = song.f('bass', 'lowpass', 700, 0, duck), subOut = song.f('sub', 'lowpass', 120, 0, song.out);
      const flOut = song.f('flute', 'lowpass', 8000, 0, song.pan('flR', 0.15, song.out));
      const chL = song.f('choirL', 'lowpass', 2200, 0, song.pan('cL', -0.7, duck)), chR = song.f('choirR', 'lowpass', 2200, 0, song.pan('cR', 0.7, duck));
      const brOut = song.f('brass', 'lowpass', 3000, 0, song.out), stabOut = song.f('stab', 'lowpass', 2600, 1, duck);
      const bellOut = song.f('bell', 'lowpass', 6000, 0, song.out);
      const hhOut = song.f('hh', 'highpass', 8000, 0.6, song.pan('hhR', 0.3, drums)), snOut = song.f('sn', 'bandpass', 1700, 0.8, drums), crOut = song.f('cr', 'highpass', 4500, 0.4, drums);
      const acc = i % 4 === 0;
      // ---- 三味線 ----
      if (bld && i % (b4 < 2 ? 2 : 1) === 0) I.shami(song, 76 + tr + (b4 === 3 ? 12 : 0), t, vary(0.03 + (b4 * 16 + i) * 0.0006), shOut);
      if (R && R[i]) I.shami(song, R[i] + tr, t, vary(isC ? (acc ? 0.085 : 0.065) : (acc ? 0.075 : 0.055)), shOut);
      // B：三味線は和音をくずして、はね返るように（右側）
      if (isB && i % 2 === 0) { const a = S.riffs['arp' + ch][(i / 2) % 8]; if (a) I.shami(song, a, t, vary(0.045), arpOut); }
      // ---- 太鼓（前奏・後奏はだんだん増える） ----
      if (sec === 'intro' || sec === 'outro') {
        const k = sec === 'intro' ? p : p - 76 + 4;   // 0〜7
        const pat = k < 2 ? [0, 10] : k < 4 ? [0, 6, 10] : k < 6 ? [0, 3, 6, 10, 12] : [0, 3, 6, 8, 10, 12, 14];
        if (pat.includes(i)) I.taiko(song, t, i === 0 ? 0.6 : 0.42, drums);
        if ((k === 3 || k === 7) && i >= 12) I.taiko(song, t, 0.25 + (i - 12) * 0.08, drums);
        if (k >= 4 && i === 0 && k % 2 === 0) I.bell(song, 40, t, 0.11, bellOut);   // 寺の鐘
        if (k >= 4 && i === 0) I.sub(song, 28, t, 16 * sd, 0.22, subOut);           // 低いうなり
        if (sec === 'intro' && p === 7 && i === 0) riser(song, t, 16 * sd, song.out);
      } else if (bld) {
        // ためは下の別の場所で鳴らす
      } else if (sec === 'drop') {
        if (i === 0 || i === 10) I.taiko(song, t, 0.45, drums);
        if (i === 0 && p % 2 === 0) I.bell(song, 40, t, 0.1, bellOut);
      } else if (sec === 'end') {
        if (i === 0 || (p === 75 && i % 4 === 0)) { I.taiko(song, t, 0.65, drums); I.kick(song, t, 0.55, drums, 90, 32); I.noise(song, t, 0.09, 1.4, crOut, 0.005); }
        if (i === 0 && p === 72) I.bell(song, 40, t, 0.14, bellOut);
      } else {
        if (i === 0 || i === 10 || (i === 6 && bar % 2)) I.taiko(song, t, isC ? 0.55 : 0.42, drums);
        if (isC && i >= 12) I.taiko(song, t, 0.16 + (i - 12) * 0.06, drums);
        if (sec === 'C2' && i % 2 === 1 && p % 2 === 1) I.taiko(song, t, 0.22, drums);
        // 区切りの最後の小節：太鼓を連打して次へ渡す
        if ((p === 15 || p === 47 || p === 35 || p === 71) && [8, 10, 12, 13, 14, 15].includes(i)) I.taiko(song, t, 0.3 + (i - 8) * 0.04, drums);
      }
      // ---- バスドラ・スネア・ハイハット ----
      if (isA || isC) {
        const four = isC || lv >= 2;
        if (four ? acc : (i === 0 || i === 10)) { I.kick(song, t, isC ? 0.48 : 0.38, drums, 100, 40); song.pump(t, isC ? 0.62 : 0.72); }
        if (i === 4 || i === 12) I.noise(song, t, vary(isC ? 0.15 : 0.11), 0.17, snOut);
        if (isC || lv >= 3 ? true : i % 2 === 0) I.noise(song, t, vary(i % 4 === 2 ? 0.032 : 0.013), 0.03, hhOut);
      }
      if (isB) {
        if (i === 0) I.kick(song, t, 0.36, drums, 95, 40);
        if (i === 8) I.noise(song, t, vary(0.11), 0.24, snOut);
        const late = (p - (sec === 'B1' ? 16 : 48)) >= 4;
        if (lv >= 3 || late ? i % 2 === 0 : i % 4 === 2) I.noise(song, t, vary(late ? 0.016 : 0.012), 0.03, hhOut);
        if (late && i === 10) I.kick(song, t, 0.3, drums, 95, 40);
      }
      if (bld) {
        // スネアと太鼓がだんだん細かく・強く。バスドラも後半から刻む
        if (i % [4, 2, 2, 1][b4] === 0) I.noise(song, t, 0.03 + (b4 * 16 + i) * 0.0018, 0.08, snOut);
        if (i % [8, 4, 2, 1][b4] === 0) I.taiko(song, t, 0.22 + b4 * 0.08, drums);
        if (b4 >= 1 && i % [4, 4, 2, 1][b4] === 0) I.kick(song, t, 0.28 + b4 * 0.07, drums, 120, 50);
        // ベースは ミ（さびのラへ引っぱる音）を8分で刻み、最後は16分
        if (i % (b4 < 2 ? 2 : 1) === 0) I.fingerBass(song, root - 12 + (i % 4 === 2 ? 12 : 0), t, sd * 1.4, vary(0.26 + b4 * 0.03), bassOut);
        // 金管が1小節に2音ずつ上がっていく
        if (i === 0 || i === 8) { const m = S.rise[b4 * 2 + i / 8]; if (m) { const len = (b4 === 3 && i === 8 ? 4 : 8) * sd * 0.95; I.brass(song, m + tr + 12, t, len, 0.026 + b4 * 0.004, brOut); I.brass(song, m + tr, t, len, 0.02 + b4 * 0.004, brOut); } }
        if (b4 === 0 && i === 0) {
          riser(song, t, 60 * sd, song.out); I.sub(song, 28 + tr, t, 60 * sd, 0.2, subOut);
          // 曲全体の明るさをいったん落とし、さびに向けて開いていく
          const f = song.lp.frequency; f.cancelScheduledValues(t); f.setValueAtTime(1400, t); f.exponentialRampToValueAtTime(S.lp, t + 60 * sd);
        }
      }
      // さびの頭：明るさを元に戻す
      if ((p === 28 || p === 60) && i === 0) { const f = song.lp.frequency; f.cancelScheduledValues(t); f.setValueAtTime(S.lp, t); }
      if ((p === 8 || p === 28 || p === 36 || p === 40 || p === 60 || p === 66) && i === 0) { I.noise(song, t, 0.1, 1.8, crOut, 0.005); I.kick(song, t, 0.55, drums, 80, 30); }
      if (isC && p % 2 === 0 && i === 0) I.noise(song, t, 0.05, 1.0, crOut, 0.005);
      // ---- ベース・低いうなり ----
      if ((isA || isB || isC) && i % 2 === 0) {
        const off = (isC || lv >= 2) && (i === 6 || i === 14) ? 12 : 0;
        I.fingerBass(song, root - 12 + off, t, sd * 1.6, vary(isB ? 0.24 : 0.32), bassOut);
      }
      if ((isA || isB || isC || sec === 'end') && i === 0) I.sub(song, root - 12, t, 16 * sd, isC || sec === 'end' ? 0.26 : 0.17, subOut);
      // ---- 合唱：低く広い和音（A は低く静かに、B は中くらい、C と締めは厚く高く） ----
      if (i === 0) {
        const vox = isA ? [root, root + 7, root + 12] : C ? C.slice(1).concat(isC || sec === 'end' || b4 >= 2 ? C.slice(1).map((m) => m + 12) : []) : null;
        if (vox) { const v = isA ? 0.008 : isB ? 0.011 : bld ? 0.006 + b4 * 0.0025 : 0.013, len = (sec === 'end' ? 64 : b4 === 3 ? 12 : 16) * sd; vox.forEach((m, n) => I.choir(song, m, t, len, v, n % 2 ? chR : chL)); }
      }
      // ---- 金管：さびの旋律（C）と、和音の一撃（A2・段階3・締め） ----
      if (isC) {
        const j = ((p - (sec === 'C1' ? 28 : 60)) % 4) * 16 + i;
        for (const [at, mm, len] of S.hook) if (at === j) { I.brass(song, mm + tr, t, len * sd * 0.95, 0.032, brOut); I.brass(song, mm + tr - 12, t, len * sd * 0.95, 0.024, brOut); if (sec === 'C2') I.brass(song, mm + tr + 12, t, len * sd * 0.95, 0.012, brOut); }
      }
      const stab = (sec === 'A2' || (lv >= 3 && (isA || isB))) ? (i === 0 || i === 6 || i === 10) : isC ? (i === 0 || i === 3 || i === 6 || i === 10) : (sec === 'end' && i === 0);
      if (stab) for (const o of [0, 7, 12]) { const len = sec === 'end' ? 1.2 : 0.2, g = env(song, t, 0.004, sec === 'end' ? 0.032 : 0.024, len, stabOut, 0.5); osc(song, 'sawtooth', mtof(root + o), t, len, g, -8); osc(song, 'sawtooth', mtof(root + o), t, len, g, 8); }
      // ---- 尺八：B の旋律、A2 の合いの手、C2 の掛け合い、締めの長い音 ----
      if (isB) {
        const j = ((p - (sec === 'B1' ? 16 : 48)) % 8) * 16 + i;
        for (const [at, mm, len] of S.flute) if (at === j) { I.shaku(song, mm, t, len * sd * 0.95, 0.12, flOut); if (sec === 'B2') I.shaku(song, mm - 12, t, len * sd * 0.95, 0.05, flOut); }
      }
      if (sec === 'A2' && p % 2 === 1 && (i === 8 || i === 12)) I.shaku(song, i === 8 ? 81 : 83, t, 3 * sd, 0.08, flOut);
      if (sec === 'C2') { const j = ((p - 60) % 4) * 16 + i; for (const [at, mm, len] of S.answer) if (at === j) I.shaku(song, mm + tr, t, len * sd * 0.9, 0.08, flOut); }
      if (p === 72 && i === 0) I.shaku(song, 76, t, 48 * sd, 0.11, flOut);
    },
  },
};
export const SONG_LIST = Object.entries(SONGS).map(([id, s]) => [id, s.name]);

// ---------- 1曲を鳴らす係 ----------
function startSong(P, id, fade) {
  const { ctx } = P, S = SONGS[id];
  const out = ctx.createGain();
  // 全体を少しこもらせる（くすんだ、落ち着いた音にする）
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = S.lp || 4200;   // ラスボスの曲は、三味線が抜けるように明るく
  out.connect(lp); lp.connect(P.bus);
  const t0 = ctx.currentTime + 0.06;
  out.gain.setValueAtTime(0, ctx.currentTime);
  out.gain.linearRampToValueAtTime(0.8 * (S.gain || 1), t0 + fade);
  const song = { id, ctx, out, lp, step: 0, next: t0, live: [], dead: false, filters: {} };
  // 鳴っている部品を覚えておき、止めるときに全部止める
  song.track = (node, end) => { song.live.push([node, end]); };
  song.f = (name, type, f, q, to) => {
    if (song.filters[name]) return song.filters[name];
    const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; if (q) n.Q.value = q;
    n.connect(to); song.filters[name] = n;
    return n;
  };
  // バスドラに合わせて、和音とベースを少しだけ引っこめる（揺れるノリ）。引っこめるのも戻すのも坂にする
  // 左右の位置（-1：左 〜 1：右）。名前ごとに1つ作って使い回す
  song.pans = {};
  song.pan = (name, v, to) => {
    if (song.pans[name]) return song.pans[name];
    const n = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
    if (n.pan) n.pan.value = v;
    n.connect(to); song.pans[name] = n;
    return n;
  };
  song.duck = ctx.createGain(); song.duck.connect(out);
  song.drums = ctx.createGain(); song.drums.connect(out);
  song.pump = (t, depth) => { const p = song.duck.gain; p.setValueAtTime(1, t); p.linearRampToValueAtTime(depth, t + 0.015); p.linearRampToValueAtTime(1, t + 0.22); };
  const sd = 60 / S.bpm / S.div;
  song.tick = () => {
    if (song.dead) return;
    const now = ctx.currentTime;
    // 再生が遅れて取り残されたら（画面が裏に回ったなど）、今の時刻から数え直す（まとめて鳴らさない）
    if (song.next < now - 0.1) song.next = now + 0.05;
    while (song.next < now + 0.2) {
      const i = song.step % S.steps, bar = Math.floor(song.step / S.steps);
      const t = song.next + (i % 2 ? S.swing * sd * 2 : 0) + (Math.random() - 0.5) * 0.006;   // 跳ね ＋ 人が弾いたような ほんの少しのずれ
      S.arrange(song, i, bar, t, sd);
      song.step++;
      song.next += sd;
    }
    if (song.live.length > 200) song.live = song.live.filter(([, end]) => end > now);
  };
  song.kill = () => {
    song.dead = true;
    for (const [n] of song.live) { try { n.stop(); } catch { /* もう止まっている */ } }
    song.live = [];
    try { out.disconnect(); lp.disconnect(); } catch { /* もう外れている */ }
  };
  return song;
}

// ---------- 外から使う ----------
// 鳴っている曲は1つだけ。切りかえ中の古い曲は fading に入れ、消え終わったら全部止める
let cur = null, timer = null;
const fading = new Set();
function loop() {
  if (cur) cur.tick();
  for (const s of fading) s.tick();
  if (!cur && !fading.size) { clearInterval(timer); timer = null; }
}
// 曲を流す。同じ曲なら何もしない。fade：切りかえにかける秒数
// out：前の曲を消す秒数（決めなければ fade と同じ。0 に近いほど、すぐ止める）
export function playBgm(id, { fade = 2.5, out = fade, force = false, fromBar = 0 } = {}) {
  if (cur && cur.id === id) return;
  const P = audioParts(force);
  if (!P) return;
  stopBgm(out);
  if (!id || !SONGS[id]) return;
  cur = startSong(P, id, fade);
  cur.step = fromBar * SONGS[id].steps;   // 途中の小節から流す（確かめる用）
  if (!timer) timer = setInterval(loop, 40);
}
export function stopBgm(fade = 2.5) {
  if (!cur) return;
  const s = cur, t = s.ctx.currentTime;
  cur = null;
  fading.add(s);
  const g = s.out.gain;
  g.cancelScheduledValues(t);
  g.setValueAtTime(g.value, t);
  g.linearRampToValueAtTime(0, t + fade);
  // 消え終わる時刻を過ぎたら、新しい音は作らず、鳴っている部品も全部止める
  setTimeout(() => { s.kill(); fading.delete(s); }, fade * 1000 + 80);
  s.stopAt = t + fade;
  const tick = s.tick;
  s.tick = () => { if (s.ctx.currentTime < s.stopAt - 0.2) tick(); };
}
export const bgmNow = () => (cur ? cur.id : null);
// 音の土台が作り直されたとき：古い土台の曲はもう鳴らないので片づけ、同じ曲を新しい土台で流し直す
onAudioReset(() => {
  const id = cur ? cur.id : null;
  for (const s of fading) s.kill();
  fading.clear();
  if (cur) { cur.kill(); cur = null; }
  if (id) playBgm(id, { fade: 1 });
});
