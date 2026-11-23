// ホームなどの後ろで流す「自動で遊ぶ様子」。本物のゲームを、決まった動きの指で動かす
import { CONFIG } from './config.js?v=20261123144814';
import { createGame, DT } from './game.js?v=20261123144814';

import { SKILL_ROADS } from './skilldefs.js?v=20261123144814';

// 流すたびに、ちがう組み合わせのスキルで遊ぶ（毎回同じにならないように）
const BUILDS = [
  { volley: 3, thunder: 2, chainbolt: 1, float: 2, satellite: 1 },             // 雷と衛星
  { caltrop: 3, mine: 2, flamepath: 2, pillar: 1, scatter: 1 },               // 罠と炎
  { freeze: 3, chill: 2, pull: 2, gravshot: 1, shatter: 1 },                   // 氷と引力
  { blade: 3, twinblade: 1, drone: 2, gundrone: 1, meteor: 1 },               // 刃と子機
  { shoot: 3, rapid: 2, dash: 2, aura: 2, barrage: 1 },                       // 本体で戦う
  { poison: 3, miasma: 2, reaper: 2, scythe: 1, contagion: 1 },               // 毒と死神
  { giant: 3, cannon: 2, laser: 2, crush: 1, split: 1 },                      // 大きな分身
  { swarm: 3, focus: 2, mark: 2, heaven: 1, intercept: 1 },                   // 群れ
];
const KNOWN = new Set(SKILL_ROADS.flatMap((r) => r.skills.map((k) => k.id)));
// 指の動きの形もいくつか用意する（8の字・円・横長の波）
const PATHS = [
  (t, W, H) => [W / 2 + Math.sin(t * 1.1) * W * 0.3, H * 0.55 + Math.sin(t * 2.2 + 0.6) * H * 0.18],
  (t, W, H) => [W / 2 + Math.cos(t * 1.3) * W * 0.28, H * 0.55 + Math.sin(t * 1.3) * H * 0.2],
  (t, W, H) => [W / 2 + Math.sin(t * 0.9) * W * 0.34, H * 0.55 + Math.sin(t * 3.1) * H * 0.12],
];
const PICK = [{ id: 'atk', kind: 'boost', rarity: 'normal' }];
let last = -1;

export function createDemo() {
  const g = createGame();
  let t = 0, path = PATHS[0];

  function restart() {
    g.reset();
    t = 0;
    const s = g.state;
    g.step(input(true));
    s.phase = 7; g.debugClearPhase();
    let k; do { k = Math.floor(Math.random() * BUILDS.length); } while (k === last && BUILDS.length > 1);
    last = k;
    s.skills = Object.fromEntries(Object.entries(BUILDS[k]).filter(([id]) => KNOWN.has(id)).map(([id, lv]) => [id, { lv }]));
    path = PATHS[Math.floor(Math.random() * PATHS.length)];
    s.choices = PICK; g.chooseSkill(0);
  }

  // 指の動き：ステージの真ん中のまわりを、8の字に近い形でなぞる。2.4秒描いて0.3秒離す（離すと分身が生まれる）
  function input(held) {
    const s = g.state, W = s.world.w, H = s.world.h;
    const [x, y] = path(t, W, H);
    return { held, pointer: held ? { x, y } : null, isTouch: false, dx: 0, dy: 0, keyX: 0, keyY: 0 };
  }

  function step() {
    const s = g.state;
    if (s.over || s.time > 45) restart();   // 45秒ごとに、別の組み合わせで流しなおす
    if (s.mode === 'select' || s.mode === 'returning') { s.choices = PICK; g.chooseSkill(0); }
    const C = CONFIG.experiments.control, keep = C.value;
    C.value = 'follow';   // 自動の指は「指の位置へ向かう」動きで動かす
    t += DT;
    const held = (t % 2.7) < 2.4;
    s.player.inv = 99; s.hp = s.maxHp;
    g.step(input(held));
    C.value = keep;
  }

  restart();
  return { get state() { return g.state; }, step, restart };
}
