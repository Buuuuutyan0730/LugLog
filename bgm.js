// BGM。音のファイルは使わず、その場で電子音を組み立てて鳴らす。
//   どの曲も、目立たず、落ち着いていて、でも体が揺れる感じ。盛り上げない（フェーズが進んでも変えない）。
//   4曲は、楽器・リズム・拍子・調をそれぞれ別に作る（同じ曲の手直しにしない）。
//   曲を切りかえるときは、前の曲を少しずつ小さく、次の曲を少しずつ大きくする。
import { audioParts, onAudioReset } from './audio.js?v=20261123175620';

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
};
export const SONG_LIST = Object.entries(SONGS).map(([id, s]) => [id, s.name]);

// ---------- 1曲を鳴らす係 ----------
function startSong(P, id, fade) {
  const { ctx } = P, S = SONGS[id];
  const out = ctx.createGain();
  // 全体を少しこもらせる（くすんだ、落ち着いた音にする）
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 4200;
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
