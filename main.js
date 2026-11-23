// 入口。毎フレーム「操作の受け取り → 計算 → 描画 → 画面表示の更新」をつなぐ。
//   流れ：読み込み →（初回だけ名前登録）→ ホーム →（はじめてプレイを押したときだけ遊び方）→ ゲーム ⇄ 一時停止 → 結果 → もう一回／ホーム

import { CONFIG } from './config.js?v=20261124035150';
import { createGame, DT } from './game.js?v=20261124035150';
import { applyForms } from './talents.js?v=20261124035150';
import { createRenderer } from './render.js?v=20261124035150';
import { createHud } from './ui.js?v=20261124035150';
import { createInput } from './input.js?v=20261124035150';
import { setupDebugPanel } from './debug.js?v=20261124035150';
import { createPreview } from './preview.js?v=20261124035150';
import { createMenus } from './menus.js?v=20261124035150';
import { createDemo } from './demo.js?v=20261124035150';
import { TUTO_INTRO, TUTO_STEPS, TUTO_END } from './tutorial.js?v=20261124035150';
import { loadSave, writeSave, recordRun, wipeSave } from './save.js?v=20261124035150';
import { ensureDaily, addRun } from './missions.js?v=20261124035150';
import { submitScore, checkDev, submitRun, loadRuns, weekStartMs } from './online.js?v=20261124035150';
import { SKILL_ROADS } from './skilldefs.js?v=20261124035150';
import { PREFS, applyColorSet, applyBackground } from './theme.js?v=20261124035150';
import { COLOR_SETS, BACKGROUNDS } from './skins.js?v=20261124035150';
import { setEquipped } from './skinshot.js?v=20261124035150';
import { LIVE_BG, setPhoto, initZoom } from './screens.js?v=20261124035150';
import { setAudioPrefs, unlockAudio, playSound } from './audio.js?v=20261124035150';
import { playBgm, stopBgm, bgmNow, setFinalLevel } from './bgm.js?v=20261124035150';

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
  if (s.time === 0 && (s.mode === 'ready' || s.mode === 'select')) return null;   // 遊び始め：ドラッグして動き出すまでは曲を流さない
  // ラスボス（終筆）：登場の演出の間は曲を止めて静かにし、終わったら専用の曲。段階が進むほど曲も激しくなる
  if (s.bossPhase === 'shuhitsu') { if (s.bossIntro) return null; setFinalLevel((s.boss && s.boss.stage) || 1); return 'final'; }
  return s.bossPhase || s.boss ? 'boss' : 'play';
}
function syncBgm(s) {
  const w = wantBgm(s);
  if (w === undefined || w === bgmNow()) return;
  // 戦い・結果からホームへ戻るときは、前の曲をすぐ止める（ゆっくり消すと次の曲と重なって聞こえる）
  const now = bgmNow();
  const cut = w === 'home' && (now === 'play' || now === 'boss' || now === 'result');
  // ラスボスの登場：前の曲はすぐ消して無音にし、演出のあとは太鼓からすぐ始める
  if (w === 'final') { playBgm(w, { fade: 0.15, out: 0.1 }); return; }
  if (w === null && s.bossIntro && s.bossIntro.kind === 'shuhitsu') { stopBgm(0.25); return; }
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
  if (s0.mode !== 'ready' && !s0.over && s0.time > 0 && !s0.tuto && !s0.test) { recordRun(save, s0, roadOf, { score: false }); ensureDaily(save, SKILL_ROADS); addRun(save, s0, roadOf); writeSave(save); }
  game.reset();
  hud.hideResult();
  hud.hideSkills();
  resultShown = false;
  skillShown = false;
  seenCount = 0;
}

const menus = createMenus(save, {
  start() { restart(); game.firstPick(); menus.close(); },
  tutorial() { restart(); game.startTutorial(); menus.close(); },
  resume() {},
  restart() { restart(); game.firstPick(); },   // もう一回・やり直す：最初のスキル選びから
  // ボスを試すの結果から
  btAgain() { if (lastTest) startTest(lastTest.n, lastTest.auto, lastTest.taken); },
  btRepick() { if (lastTest) startTest(lastTest.n, lastTest.auto); },
  toTitle() { restart(); },
  applySettings,
  applySkin,
  pauseInfo: () => ({ phase: game.state.phase, time: game.state.time }),
  devChanged: showDevButton,
  wipeLocal: wipeSave,
});

// 調整パネルのボタンは、開発者の端末だけに出す（名前登録で合言葉を入れると開発者になる）
function showDevButton() { document.getElementById('open-debug').style.display = save.dev ? '' : 'none'; }
showDevButton();
// 開発者の端末か、サーバーで確かめ直す（1人だけなので、ほかの端末で登録されていたら外す。つながらないときはそのまま）
if (save.dev) checkDev().then((r) => { if (r === 'no') { save.dev = false; writeSave(save); showDevButton(); } }).catch(() => {});
const debugPanel = setupDebugPanel(CONFIG, {
  onChange() {},
  onOpen() { pausedByDebug = true; },
  onClose() { pausedByDebug = false; },
  onRestart: () => { restart(); game.firstPick(); menus.close(); },
  onClearPhase: () => game.debugClearPhase(),
  onAdvance: (n) => { if (menus.id) return; game.debugAdvance(n); },
  // ボスを試す：最初から始め、カードを選んでいって、目当てのボスと戦う
  onBossTest: (n, auto) => startTest(n, auto),
  resetFlag(k) { if (k === 'tuto') { save.tutoDone = false; save.howtoDone = false; } if (k === 'ending') save.endingSeen = false; writeSave(save); },
  // 見本：パネルで選んだ見本を開き、「パネルへ」で調整パネルの見本タブに戻る
  onPreview: (id) => preview.open(id, (t) => debugPanel.open('sample', t)),
  records: { load: loadRuns, weekStart: weekStartMs },
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

// ---------- ボスを試す（調整パネル） ----------
//   lastTest：最後に試した中身（「同じスキルでもう一度」「選び直す」で使う）
let lastTest = null;
function startTest(n, auto, replay) {
  restart();
  menus.close();
  lastTest = { n, auto, taken: null };
  game.startBossTest(n, auto, replay);
}
document.getElementById('bt-auto').addEventListener('click', () => {
  const s = game.state;
  if (!s.test || s.mode !== 'select') return;
  playSound('tap');
  hud.hideSkills();
  document.getElementById('skill').classList.remove('with-bt');
  skillShown = false;
  game.testAutoRest();
});

// カード選び。引き直しはコインを使い、押すたびに値段が上がる（1回目50、そのあと50ずつ）
const rerollCost = (s) => 50 * (s.rerolls + 1);
const REROLL_MAX = 10;   // 引き直しは1回のプレイで10回まで
const rerollLeft = (s) => Math.max(0, REROLL_MAX - s.rerolls);
function showCards(s) {
  hud.showSkills(s, (id) => {
    game.chooseSkill(id);
    hud.hideSkills();
    document.getElementById('skill').classList.remove('with-reroll', 'with-bt');
    skillShown = false;
  }, (i) => playSound(i < 0 ? 'pickBig' : 'deal', { pitch: i < 0 ? 1 : 1 + i * 0.12 }));   // カードが1枚出るたびに「パン」（だんだん高く）／選んだ瞬間に「キラーン」
  // チュートリアル：引き直しは出さず、カードの説明を出す
  const subEl = document.querySelector('#skill .skill-sub');
  if (s.tuto) {
    document.getElementById('skill-title').textContent = 'カードを選ぼう';
    subEl.textContent = TUTO_STEPS[s.tuto.step - 1].pick || '';
    subEl.classList.add('tuto-pick');
    document.getElementById('skill').classList.remove('with-reroll');
    return;
  }
  subEl.classList.remove('tuto-pick');
  subEl.textContent = '才能を1つ選ぼう';
  // ボスを試す準備：何枚目かと「残りはおまかせ」を出す。引き直しは出さない
  if (s.test) {
    const k = CONFIG.boss.order[s.test.n - 1];
    document.getElementById('bt-count').textContent = `${s.test.picks + 1} / ${s.test.target}`;
    document.getElementById('bt-name').textContent = (CONFIG.enemies[k] || {}).name || k;
    document.getElementById('skill').classList.remove('with-reroll');
    document.getElementById('skill').classList.add('with-bt');
    return;
  }
  const cost = rerollCost(s);
  document.getElementById('skill').classList.add('with-reroll');
  document.getElementById('reroll-cost').textContent = cost.toLocaleString();
  document.getElementById('reroll-have').textContent = save.coins.toLocaleString();
  document.getElementById('reroll-btn').classList.toggle('cant', save.coins < cost || !rerollLeft(s));
  document.getElementById('reroll-label').textContent = rerollLeft(s) ? `引き直す（あと${rerollLeft(s)}回）` : '引き直しは使い切った';
}
document.getElementById('reroll-btn').addEventListener('click', () => {
  const s = game.state, cost = rerollCost(s);
  if (s.mode !== 'select' || save.coins < cost || !rerollLeft(s)) return;
  save.coins -= cost;
  writeSave(save);
  game.reroll();
  showCards(s);
});

// チュートリアル：終わった（またはとばした）ら、そのまま本番を始める
function finishTutorial() {
  save.tutoDone = true; save.howtoDone = true; writeSave(save);
  restart(); game.firstPick();
}
document.getElementById('tuto-skip').addEventListener('click', () => {
  if (!game.state.tuto || preview.active || menus.id) return;
  playSound('tap'); finishTutorial();
});
// 案内の箱：今の手順を出す（変わったときだけ書きかえる）
let tutoKey = '';
function syncTutorial(s) {
  if (preview.active) { tutoKey = ''; return; }   // 見本を開いている間は、見本にまかせる
  const T = s.tuto;
  if (T && T.done) { finishTutorial(); return; }
  const show = T && !menus.id && s.mode !== 'select';   // カード選びの間は、カードの画面に説明を出す
  const ok = !!(T && T.okT > 0), last = T && T.step === TUTO_STEPS.length;
  const key = show ? `${T.step}:${ok}` : '';
  if (key === tutoKey) return;
  tutoKey = key;
  if (!show) { hud.hideTutorial(); return; }
  if (T.step === 0) hud.showTutorial({ intro: true, ...TUTO_INTRO });
  else hud.showTutorial({ step: T.step, total: TUTO_STEPS.length, ...(ok ? (last ? TUTO_END : { text: 'できた！', sub: TUTO_STEPS[T.step - 1].done }) : TUTO_STEPS[T.step - 1]), ok });
}

// 一時停止：右上のボタン、または別のアプリ・タブへ切りかえたとき
function pause() {
  const s = game.state;
  if (menus.id || s.over || s.mode === 'select' || s.mode === 'returning' || preview.active) return;
  menus.open('s_pause', {}, false);
}
document.getElementById('open-pause').addEventListener('click', () => { playSound('tap'); pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && game.state.mode === 'play') pause(); });

// 取得した才能の一覧：開いている間はゲームを止める
document.getElementById('open-owned').addEventListener('click', () => {
  playSound('tap');
  pausedByOwned = true;
  hud.showOwned(game.state);
});
document.getElementById('close-owned').addEventListener('click', () => {
  playSound('tap');
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
    if (gs.bossIntro) { gs.bossIntro.t += elapsed / (gs.bossIntro.kind === 'shuhitsu' ? CONFIG.boss.finalAppear : CONFIG.boss.appear); if (gs.bossIntro.t >= 1) gs.bossIntro = null; }
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
      const box = ['core', 'hunter', 'twin', 'clock', 'shade', 'comet', 'mirage', 'eclipse', 'abyss', 'shuhitsu'].includes(k) ? save.zukan.bosses : save.zukan.enemies;
      if (!box[k]) { box[k] = { seen: 0, kills: 0 }; changed = true; }
    }
    if (changed) writeSave(save);
  }

  // ボスを試す：倒した・やられた → 試験の結果（ランキング・記録・ミッションには入れない）
  if (s.test && (s.test.done || s.over) && !resultShown) {
    resultShown = true;
    if (!s.test.done) game.endBossTest(false);
    lastTest = { n: s.test.n, auto: s.test.auto, taken: s.test.taken.slice() };
    const d = s.test.done;
    setTimeout(() => menus.open('s_btresult', { bossTest: d }, false), d.win ? 1200 : 700);
  }
  if (s.over && !resultShown) {
    resultShown = true;
    const { isNew, coins } = recordRun(save, s, roadOf);
    ensureDaily(save, SKILL_ROADS); addRun(save, s, roadOf); writeSave(save);   // ミッションに数える
    submitScore(save, s).catch(() => {});   // ランキングに送る（つながらなければ送らない。ゲームはそのまま）
    submitRun(save, s).catch(() => {});     // プレイの記録（調整のため。名前は入れない）
    // 最後に持っていたスキル（道ごと、取った順）
    const roads = SKILL_ROADS.map((r) => r.skills.filter((k) => s.skills && s.skills[k.id]).map((k) => k.id)).filter((a) => a.length);
    setTimeout(() => menus.showResult(s, isNew, roads, coins), 700);
  }

  syncTutorial(s);

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
