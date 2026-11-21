// 入口。毎フレーム「操作の受け取り → 計算 → 描画 → 画面表示の更新」をつなぐ。
//   流れ：読み込み →（初回だけ名前登録）→ ホーム →（はじめてプレイを押したときだけ遊び方）→ ゲーム ⇄ 一時停止 → 結果 → もう一回／ホーム

import { CONFIG } from './config.js?v=20261122032810';
import { createGame, DT } from './game.js?v=20261122032810';
import { applyForms } from './talents.js?v=20261122032810';
import { createRenderer } from './render.js?v=20261122032810';
import { createHud } from './ui.js?v=20261122032810';
import { createInput } from './input.js?v=20261122032810';
import { setupDebugPanel } from './debug.js?v=20261122032810';
import { createPreview } from './preview.js?v=20261122032810';
import { createMenus } from './menus.js?v=20261122032810';
import { createDemo } from './demo.js?v=20261122032810';
import { loadSave, writeSave, recordRun } from './save.js?v=20261122032810';
import { ensureDaily, addRun } from './missions.js?v=20261122032810';
import { submitScore } from './online.js?v=20261122032810';
import { SKILL_ROADS } from './skilldefs.js?v=20261122032810';
import { PREFS, applyColorSet, applyBackground } from './theme.js?v=20261122032810';
import { COLOR_SETS, BACKGROUNDS } from './skins.js?v=20261122032810';
import { setEquipped } from './skinshot.js?v=20261122032810';
import { LIVE_BG, setPhoto, initZoom } from './screens.js?v=20261122032810';
import { setAudioPrefs, unlockAudio, playSound } from './audio.js?v=20261122032810';
import { playBgm, stopBgm, bgmNow } from './bgm.js?v=20261122032810';

const canvas = document.getElementById('game');
const renderer = createRenderer(canvas, CONFIG.view);
const hud = createHud();
const input = createInput(canvas, [document.querySelector('.dock')]);
const game = createGame();
const preview = createPreview(hud); // 新しい見た目の見本（動かない）
window.__game = game; // 確認用

const save = loadSave();
setPhoto(save.photo);   // 写真のアイコン（選んであれば）
initZoom();              // 品を押すと大きく見せる
let demo = null;   // 後ろで流す自動の様子（必要になったときに作る）

let pausedByDebug = false;
let pausedByOwned = false;
let resultShown = false;
let skillShown = false;
let seenCount = 0;

// 設定をゲームに反映する（操作方法・揺れ・光の強さ）
function applySettings(S) {
  CONFIG.experiments.control.value = S.control === 'drag' ? 'relative' : 'stick';
  PREFS.shake = S.shake ? 1 : 0;
  PREFS.glow = S.glow;
  setAudioPrefs(S);
}
// ブラウザの決まりで、画面に触れるまでは音を出せない。最初に触れたときに音を出せるようにする
let audioReady = false;
window.addEventListener('pointerdown', () => { unlockAudio(); audioReady = true; }, { capture: true });

// BGM：今の場面に合う曲を決める（undefined＝さわらない）
//   ホームまわりの画面＝ホーム、プレイ中＝通常（ボスのフェーズはボス戦）、やられた〜結果＝結果、ポーズ中＝そのまま
function wantBgm(s) {
  if (preview.active || !audioReady) return undefined;   // 見本で試聴している間は、見本にまかせる
  if (!save.settings.bgm) return null;
  const id = menus.id;
  if (id === 's_load') return null;
  if (id === 's_pause') return undefined;
  if (id === 's_result') return 'result';
  if (id) return 'home';
  if (s.over) return 'result';   // やられてから結果の画面が出るまで
  return s.bossPhase || s.boss ? 'boss' : 'play';
}
function syncBgm(s) {
  const w = wantBgm(s);
  if (w === undefined || w === bgmNow()) return;
  // 戦い・結果からホームへ戻るときは、前の曲をすぐ止める（ゆっくり消すと次の曲と重なって聞こえる）
  const now = bgmNow();
  const cut = w === 'home' && (now === 'play' || now === 'boss' || now === 'result');
  if (w) playBgm(w, { fade: 2.5, out: cut ? 0.08 : 2.5 }); else stopBgm(1);
}
applySettings(save.settings);

// 着せ替え：身に着けている色のセットと背景を入れる
function applySkin() {
  setEquipped(save.equip);
  applyColorSet(COLOR_SETS.find((x) => x.id === save.equip.set) || COLOR_SETS[0]);
  applyBackground(BACKGROUNDS.find((x) => x.id === save.equip.bg) || BACKGROUNDS[0]);
  game.state.popStyle = save.equip.pop || 'std';   // 撃破のはじけ方
}
applySkin();
window.__skin = (set, bg) => { if (set) save.equip.set = set; if (bg) save.equip.bg = bg; applySkin(); };   // 確認用

const roadOf = (id) => SKILL_ROADS.find((r) => r.skills.some((k) => k.id === id));

function restart() {
  // 途中でやめたプレイも、図鑑と合計の成績には入れる（最高記録には入れない）
  const s0 = game.state;
  if (s0.mode !== 'ready' && !s0.over && s0.time > 0) { recordRun(save, s0, roadOf, { score: false }); ensureDaily(save, SKILL_ROADS); addRun(save, s0, roadOf); writeSave(save); }
  game.reset();
  hud.hideResult();
  hud.hideSkills();
  resultShown = false;
  skillShown = false;
  seenCount = 0;
}

const menus = createMenus(save, {
  start() { restart(); menus.close(); },
  resume() {},
  restart,
  toTitle() { restart(); },
  applySettings,
  applySkin,
  pauseInfo: () => ({ phase: game.state.phase, time: game.state.time }),
});

setupDebugPanel(CONFIG, {
  onChange() {},
  onOpen() { pausedByDebug = true; },
  onClose() { pausedByDebug = false; },
  onRestart: () => { restart(); menus.close(); },
  onClearPhase: () => game.debugClearPhase(),
  onPreview: () => preview.open(),
  // 試作用：コインと着せ替えの持ち物を調整する
  coins: {
    get: () => save.coins,
    add(n) { save.coins = Math.max(0, save.coins + n); writeSave(save); menus.render(); },
    set(n) { save.coins = n; writeSave(save); menus.render(); },
    resetSkins() {
      save.owned = { set: ['std'], bg: ['grid'], icon: ['a0', 'a1', 'a2', 'a3', 'a4', 'a5'] };
      save.equip = { set: 'std', bg: 'grid', icon: 'a0' };
      save.pity = 0;
      writeSave(save); applySkin(); menus.render();
    },
  },
});

// カード選び。引き直しはコインを使い、押すたびに値段が上がる（1回目50、そのあと50ずつ）
const rerollCost = (s) => 50 * (s.rerolls + 1);
function showCards(s) {
  hud.showSkills(s, (id) => {
    game.chooseSkill(id);
    hud.hideSkills();
    document.getElementById('skill').classList.remove('with-reroll');
    skillShown = false;
  });
  const cost = rerollCost(s);
  document.getElementById('skill').classList.add('with-reroll');
  document.getElementById('reroll-cost').textContent = cost.toLocaleString();
  document.getElementById('reroll-have').textContent = save.coins.toLocaleString();
  document.getElementById('reroll-btn').classList.toggle('cant', save.coins < cost);
}
document.getElementById('reroll-btn').addEventListener('click', () => {
  const s = game.state, cost = rerollCost(s);
  if (s.mode !== 'select' || save.coins < cost) return;
  save.coins -= cost;
  writeSave(save);
  game.reroll();
  showCards(s);
});

// 一時停止：右上のボタン、または別のアプリ・タブへ切りかえたとき
function pause() {
  const s = game.state;
  if (menus.id || s.over || s.mode === 'select' || s.mode === 'returning' || preview.active) return;
  menus.open('s_pause', {}, false);
}
document.getElementById('open-pause').addEventListener('click', pause);
document.addEventListener('visibilitychange', () => { if (document.hidden && game.state.mode === 'play') pause(); });

// 取得した才能の一覧：開いている間はゲームを止める
document.getElementById('open-owned').addEventListener('click', () => {
  pausedByOwned = true;
  hud.showOwned(game.state);
});
document.getElementById('close-owned').addEventListener('click', () => {
  pausedByOwned = false;
  hud.hideOwned();
});

// 見本の印モード：絵をタップした場所を見本に渡す
canvas.addEventListener('click', (e) => { if (preview.active) preview.tapWorld(renderer.clientToWorld(e.clientX, e.clientY)); });

new ResizeObserver(() => renderer.resize()).observe(canvas);
renderer.resize();

// ---------- 読み込み ----------
//   文字（フォント）がそろうまで、少なくとも1秒は読み込みの画面を出す
const TIPS = ['長く描くほど、大きくて強い分身が生まれる', '指を離した瞬間に、分身が生まれる', '10フェーズごとにボスが出る', 'カードは組み合わせで強くなる'];
const loadSt = { load: 0, tip: TIPS[Math.floor(Math.random() * TIPS.length)] };
menus.open('s_load', loadSt, false);
const t0 = performance.now();
const fontsReady = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
let fontsDone = false;
fontsReady.then(() => { fontsDone = true; });
setTimeout(() => { fontsDone = true; }, 4000);   // フォントが届かなくても先へ進む
function updateLoading(now) {
  if (menus.id !== 's_load') return;
  const k = Math.min(1, (now - t0) / 1000);
  const target = fontsDone ? k : Math.min(k, 0.9);
  if (Math.abs(target - loadSt.load) > 0.04 || target === 1) { loadSt.load = target; menus.render(); }
  if (target >= 1) {
    if (!save.name) menus.open('s_name', { draft: '' }, false);
    else menus.home();
  }
}

let last = performance.now();
let acc = 0;
function frame(now) {
  try {
    tick(now);
  } catch (err) {
    console.error(err); // 1回の失敗で画面全体が止まらないようにする
  }
  requestAnimationFrame(frame);
}

function tick(now) {
  if (window.__freezeT != null) now = window.__freezeT;   // 確認用：時間を止めて、絵を見比べる
  const elapsed = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  updateLoading(now);
  document.body.classList.toggle('previewing', preview.active);

  syncBgm(game.state);
  const live = LIVE_BG.has(menus.id) || menus.id === 's_name';
  const playing = !menus.id || menus.id === 's_result';
  if (live && !demo) demo = createDemo();

  if (playing && !pausedByDebug && !pausedByOwned && !preview.active) {
    // ボスの演出は実時間で進める。撃破のあとは少しの間ゆっくりにする
    const gs = game.state;
    if (gs.bossIntro) { gs.bossIntro.t += elapsed / CONFIG.boss.appear; if (gs.bossIntro.t >= 1) gs.bossIntro = null; }
    if (gs.bossDown) { gs.bossDown.t += elapsed / 1.0; if (gs.bossDown.t >= 1) gs.bossDown = null; }
    const slow = gs.slowT > 0 ? 0.3 : 1;
    if (gs.slowT > 0) gs.slowT -= elapsed;
    acc += elapsed * slow;
    while (acc >= DT) {
      game.step(input.consume(renderer.clientToWorld, renderer.pxToWorld()));
      acc -= DT;
    }
    // ゲームが積んだ効果音を鳴らす
    const q = game.state.sfx;
    if (q && q.length) { for (const [id, pitch] of q) playSound(id, { pitch }); q.length = 0; }
  } else {
    acc = 0;
    input.consume(renderer.clientToWorld, 1); // 止まっている間の指の動きは捨てる
    if (live && !preview.active) { let n = Math.round(elapsed / DT); while (n-- > 0) demo.step(); if (demo.state.sfx) demo.state.sfx.length = 0; }   // ホームの自動プレイは鳴らさない
  }

  const s = game.state;

  // フェーズクリア → スキル選択
  if (s.mode === 'select' && !skillShown && !menus.id) {
    skillShown = true;
    setTimeout(() => showCards(s), 350);
  }

  // 初めて見た敵・ボスは、すぐ図鑑に入れる（途中でやめても残る）
  if (s.seenKinds && s.seenKinds.length !== seenCount) {
    seenCount = s.seenKinds.length;
    let changed = false;
    for (const k of s.seenKinds) {
      const box = ['core', 'hunter', 'twin', 'clock', 'shade'].includes(k) ? save.zukan.bosses : save.zukan.enemies;
      if (!box[k]) { box[k] = { seen: 0, kills: 0 }; changed = true; }
    }
    if (changed) writeSave(save);
  }

  if (s.over && !resultShown) {
    resultShown = true;
    const { isNew, coins } = recordRun(save, s, roadOf);
    ensureDaily(save, SKILL_ROADS); addRun(save, s, roadOf); writeSave(save);   // ミッションに数える
    submitScore(save, s).catch(() => {});   // ランキングに送る（つながらなければ送らない。ゲームはそのまま）
    // 最後に持っていたスキル（道ごと、取った順）
    const roads = SKILL_ROADS.map((r) => r.skills.filter((k) => s.skills && s.skills[k.id]).map((k) => k.id)).filter((a) => a.length);
    setTimeout(() => menus.showResult(s, isNew, roads, coins), 700);
  }

  const view0 = live && demo ? demo.state : s;
  applyForms(view0);   // 取ったスキルから、本体と分身の形を決める
  const view = preview.active ? preview.view(s) : view0; // 見本を開いている間は見本を映す
  renderer.draw(view, now / 1000);
  hud.update(preview.active ? view : s);
  drawStick(!menus.id && !preview.active && !pausedByDebug && !pausedByOwned && CONFIG.experiments.control.value === 'stick' && s.mode === 'play' ? input.stickView() : null);
}

// スティック：触れている間だけ、薄い輪と真ん中の丸を出す
const stickEl = document.createElement('div');
stickEl.className = 'stick';
stickEl.innerHTML = '<i class="stick-knob"></i>';
document.body.appendChild(stickEl);
const knobEl = stickEl.firstChild;
function drawStick(v) {
  if (!v) { stickEl.classList.remove('show'); return; }
  stickEl.classList.add('show');
  stickEl.style.width = stickEl.style.height = `${v.R * 2}px`;
  stickEl.style.transform = `translate(${v.ox - v.R}px, ${v.oy - v.R}px)`;
  knobEl.style.transform = `translate(${v.cx - v.ox}px, ${v.cy - v.oy}px)`;
}
requestAnimationFrame(frame);
