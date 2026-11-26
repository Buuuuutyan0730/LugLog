// ゲームの外の画面（ホーム・遊び方・一時停止・設定・結果・図鑑・プロフィールなど）の見た目。
//   同じ作りを、本物の画面（menus.js が本当の記録を渡す）と見本（MOCK の仮の数字）の両方で使う。
//   押せる部品には data-act（何をするか）を付ける。見本では押しても何も起きない
import { iconSvg, snapIcons } from './icons.js?v=20261127033728';
import { SKILL_ROADS, SKILL_TEXT } from './skilldefs.js?v=20261127033728';
import { CONFIG } from './config.js?v=20261127033728';
import { COLOR_SETS, BACKGROUNDS, AVATAR_ITEMS, GACHA, GACHA_POOL } from './skins.js?v=20261127033728';
import { POP_STYLES } from './pops.js?v=20261127033728';
import { TITLES, titleChip } from './titles.js?v=20261127033728';
import { FRAMES, frameHtml, frameOf } from './frames.js?v=20261127033728';
import { titleOf } from './titles.js?v=20261127033728';
// ランキングの見本（見た目だけ）
const RK = (rows) => rows.map(([name, icon, frame, title, phase, score], i) => ({ rank: i + 1, name, icon, frame, title, phase, score }));
const RANK_MOCK = {
  week: { list: RK([['ねこまる', 'cat', 'f_ssr1', 't_ssr1', 61, 412800], ['Sora', 'b_hunter', 'f_sr4', 't_sr1', 58, 389120], ['いちご大福', 'sakura', 'f_sr3', 't_r4', 55, 351900], ['kei', 'robot', 'f_r6', 't_n12', 51, 298440], ['のーとん', 'note', 'f_none', '', 49, 270010], ['みずいろ', 'drop', 'f_n8', 't_r2', 47, 251300], ['Bob', 'a2', 'f_r9', 't_n2', 45, 233870], ['ぺんぎん', 'fish', 'f_sr2', 't_sr5', 44, 219500], ['あおい', 'leaf', 'f_n7', '', 42, 201200], ['ゆう', 'a0', 'f_none', 't_n1', 40, 188000]]), me: { rank: 128, name: 'ほしのこ', icon: 'a0', frame: 'f_r1', title: 't_n5', phase: 42, score: 128400 } },
  all: { list: RK([['Sora', 'b_hunter', 'f_sr4', 't_sr1', 88, 1204300], ['ねこまる', 'cat', 'f_ssr1', 't_ssr1', 81, 998200], ['kei', 'robot', 'f_r6', 't_n12', 77, 871000], ['いちご大福', 'sakura', 'f_sr3', 't_r4', 70, 702500], ['Bob', 'a2', 'f_r9', 't_n2', 66, 655000], ['みずいろ', 'drop', 'f_n8', 't_r2', 61, 588100]]), me: { rank: 342, name: 'ほしのこ', icon: 'a0', frame: 'f_r1', title: 't_n5', phase: 42, score: 128400 } },
};
import { DAILY_BONUS, ACHIEVEMENTS, fmtN } from './missions.js?v=20261127033728';
// ミッションの見本（見た目だけ）：途中・達成・受け取り済みを並べる
const MISSION_MOCK = {
  daily: [
    { id: 'kill', text: '敵を200体倒す', now: 200, goal: 200, coins: 40, state: 'ready' },
    { id: 'road', text: '「罠」のスキルを3つ取る', now: 3, goal: 3, coins: 40, state: 'got' },
    { id: 'time', text: '合計10分遊ぶ', now: 372, goal: 600, coins: 40, state: 'yet', unit: 'min' },
  ],
  bonus: 'yet',
  ach: { phase: { now: 23, got: 1 }, kills: { now: 3120, got: 1 }, bosses: { now: 2, got: 2 }, ghosts: { now: 640, got: 0 }, plays: { now: 14, got: 0 }, score: { now: 48210, got: 1 }, skills: { now: 41, got: 0 }, items: { now: 37, got: 0 }, pulls: { now: 120, got: 2 } },
};
import { skinImage, unitImage, bgImage, popImage } from './skinshot.js?v=20261127033728';
import { iconArtSvg } from './iconart.js?v=20261127033728';
import { COMMON_SOUNDS, playSound } from './audio.js?v=20261127033728';
import { SONG_LIST, playBgm, stopBgm, bgmNow, setFinalLevel, finalLevelNow } from './bgm.js?v=20261127033728';

export const SCREEN_TABS = [
  ['s_load', '読み込み'], ['s_home', 'ホーム'], ['s_howto', '遊び方'], ['s_pause', '一時停止'], ['s_settings', '設定'],
  ['s_reroll', 'カード選び'], ['s_result', '結果'], ['s_zukan', '図鑑'], ['s_zukan2', '図鑑の詳細'], ['s_skin', '着せ替え'], ['s_gacha', 'ガチャ'], ['s_gacharesult', 'ガチャ結果'],
  ['s_rates', '確率'], ['s_ranking', 'ランキング'], ['s_name', '名前登録'], ['s_profile', 'プロフィール'], ['s_mission', 'ミッション'], ['s_news', 'お知らせ'],
  ['s_credits', 'クレジット'], ['s_online', 'オンライン'], ['s_ending', 'エンディング'], ['s_btpick', 'ボス試験の準備'], ['s_btresult', 'ボス試験の結果'],
];
// 全面の画面（ゲームの表示を隠す）。ないものは、ゲームの上に重ねる画面
export const SOUND_TABS = [['s_snd_bgm', 'BGM'], ['s_snd_common', '共通'], ...SKILL_ROADS.map((r) => [`s_snd_${r.id}`, r.name])];
export const FULL = new Set([...SOUND_TABS.map(([id]) => id), 's_load', 's_home', 's_howto', 's_settings', 's_zukan', 's_zukan2', 's_skin', 's_gacha', 's_gacharesult', 's_rates', 's_ranking', 's_name', 's_profile', 's_mission', 's_news', 's_credits', 's_online', 's_soon', 's_items_icon', 's_items_set', 's_items_bg', 's_items_pop', 's_items_title', 's_items_frame', 's_ending']);
// 後ろでゲームの様子を流す画面
export const LIVE_BG = new Set(['s_load', 's_home', 's_howto']);

export const AVATARS = '★◆●▲♥☾'.split('');
export const BOSS_KINDS = ['core', 'hunter', 'twin', 'clock', 'shade', 'comet', 'mirage', 'eclipse', 'abyss', 'shuhitsu'];
export const BOSS_NAMES = { core: 'コア', hunter: 'ハンター', twin: '双子', clock: '時計', shade: '影', comet: '彗星', mirage: '蜃気楼', eclipse: '日蝕', abyss: '深淵', shuhitsu: '終筆' };
const BOSS_DESC = {
  core: '真ん中で回りながら、渦の形に弾をまく。ときどき追跡を呼ぶ。',
  hunter: '距離を保って動き回り、赤い帯で予告してから突っ込んでくる。',
  twin: '2体で本体をはさんで回る。間の光の線に触れるとダメージ。片方だけ倒すと、もう片方が怒る。',
  clock: '長い針を1周させる。ときどき時間を止め、止まっている間に弾を空中に並べる。',
  shade: '本体の通った道を追う。本体の動きをそのままなぞる影の分身を出す。',
  comet: '画面を大きく回り、燃える尾を残す。星を降らせ、真ん中に飛びこんで全方向へはじける。',
  mirage: '本物と偽物に分かれる。偽物には弾がすり抜ける。近づくと遠ざかり、熱の帯で横に切りつける。',
  eclipse: '画面を暗くして、自分とボスのまわりしか見えなくする。回る光線と、横切る月の影で攻める。',
  abyss: '弾もかけらも自分も吸い込む。近づきすぎると危ない輪を張り、吸い込んだ弾を吐き出す。',
  shuhitsu: '最後のボス。墨の線を描いて黒い分身にし、こちらの分身を塗りつぶす。最後は大きな円を書き上げようとする。',
};
export const ENEMY_KINDS = ['drift', 'chaser', 'shooter', 'swarm', 'tank', 'dasher', 'shield', 'thief', 'bomber'];
const ENEMY_DESC = {
  drift: 'ふらふら漂う。ぶつかってもダメージはない。', chaser: 'まっすぐ追いかけてくる。', shooter: '距離をとって弾を撃つ。',
  swarm: '小さいものが群れで来る。', tank: '大きくて硬い。ゆっくり来る。', dasher: '止まってためてから、一気に突っ込む。',
  shield: '正面の盾で弾を防ぐ。横や後ろから攻めるとよい。', thief: 'かけらを拾って逃げる。倒すと全部返す。', bomber: '近づくと止まって点滅し、爆発する。',
};
const ROAD_OF = {};
for (const r of SKILL_ROADS) for (const k of r.skills) ROAD_OF[k.id] = r;

// 倒した攻撃の名前とアイコン（結果画面の「いちばん倒した攻撃」）
export const SRC_INFO = {
  ghost: ['分身の攻撃', null], body: ['本体の体当たり', 'sk_aura'], shoot: ['射撃', 'sk_shoot'], dash: ['疾走', 'sk_dash'], trap: ['マキビシ', 'sk_caltrop'],
  mine: ['地雷', 'sk_mine'], fire: ['炎の道', 'sk_flamepath'], thunder: ['雷', 'sk_thunder'], ice: ['氷結', 'sk_freeze'], gravity: ['引力', 'sk_pull'],
  poison: ['毒', 'sk_poison'], reaper: ['死神', 'sk_reaper'], orbit: ['浮遊', 'sk_float'], blade: ['刃輪', 'sk_blade'], drone: ['子機', 'sk_drone'],
  shieldsat: ['盾衛星', 'sk_shieldsat'], alchemy: ['錬金', 'sk_alchemy'], heaven: ['天の光', 'sk_heaven'],
};

// ---------- 小さな部品 ----------
const m = (name, html, cls = '', tag = 'div', extra = '') => `<${tag} class="${cls}" data-mark-name="${name}" ${extra}>${html}</${tag}>`;
const act = (a) => `data-act="${a}"`;
const coin = '<svg class="cur" viewBox="0 0 8 8"><path d="M2 0h4v1h1v1h1v4H7v1H6v1H2V7H1V6H0V2h1V1h1z" fill="#ffd84a"/><path d="M3 2h2v1h1v2H5v1H3V5H2V3h1z" fill="#d99a12"/></svg>';
const wallet = (d) => (d.coins == null ? '' : `<div class="ms-wallet">${coin}<span>${d.coins.toLocaleString()}</span></div>`);
const back = (title, d = {}) => `<div class="ms-head">${m('戻る', '<svg viewBox="0 0 8 8" class="px-icon"><path d="M4 0h2v2H4v1H3v2h1v1h2v2H4V7H3V6H2V5H1V3h1V2h1V1h1z"/></svg>', 'btn btn-icon ms-back', 'button', act('back'))}<div class="ms-title">${title}</div>${wallet(d)}</div>`;
const tabs = (items, on = 0, name = 'タブ', acts = []) => `<div class="ms-tabs">${items.map((t, i) => m(`${name}：${t}`, t, `ms-tab${i === on ? ' on' : ''}`, 'button', acts[i] ? act(acts[i]) : '')).join('')}</div>`;
const bar = (k, cls = '') => `<div class="ms-bar ${cls}"><i style="width:${Math.round(Math.max(0, Math.min(1, k)) * 100)}%"></i></div>`;
const btn = (label, cls = '', a = '') => m(label, label, `btn ms-btn ${cls}`, 'button', a ? act(a) : '');
const num = (v) => Math.round(v).toLocaleString();
const fmtTime = (sec) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
const fmtHours = (sec) => (sec >= 3600 ? `${Math.floor(sec / 3600)}時間${Math.floor((sec % 3600) / 60)}分` : `${Math.floor(sec / 60)}分`);
const toggle = (on, a, name) => m(name, '<i></i>', `ms-toggle${on ? ' on' : ''}`, 'button', act(a));
const PX = {
  bell: 'M3 0h2v1h1v4h1v1H1V5h1V1h1zM3 7h2v1H3z',
  gear: 'M3 0h2v1h1v1h1v1h1v2H7v1H6v1H5v1H3V7H2V6H1V5H0V3h1V2h1V1h1zM3 3v2h2V3z',
  pen: 'M5 0h1v1h1v1h1v1H7v1H6v1H5v1H4v1H3v1H0V5h1V4h1V3h1V2h1V1h1z',
};
const px = (d) => `<svg viewBox="0 0 8 8" class="px-icon"><path d="${d}"/></svg>`;

// ボスの小さな絵
export const BOSS_ICONS = {
  core: '<svg viewBox="-10 -10 20 20"><g fill="#ff3b5c" stroke="#0a0a14" stroke-width="1"><path d="M0-8 2-6 5-6 5-3 8-1 6 2 7 5 4 6 2 8-1 7-4 8-5 5-8 4-7 1-8-2-5-4-5-7-2-6z"/></g><circle r="2.6" fill="#fff"/></svg>',
  hunter: '<svg viewBox="-10 -10 20 20"><path d="M9 0-6-6-3 0-6 6z" fill="#ff3b5c" stroke="#0a0a14" stroke-width="1"/><path d="M-3 0h10" stroke="#fff" stroke-width="1"/></svg>',
  twin: '<svg viewBox="-10 -10 20 20"><path d="M-1-8A8 8 0 1 0-1 8 5 9 0 0 1-1-8z" fill="#ff3b5c" stroke="#0a0a14" stroke-width="0.8" transform="translate(-1.5 0) scale(0.95)"/><path d="M1-8A8 8 0 1 1 1 8 5 9 0 0 0 1-8z" fill="#ff3b5c" stroke="#0a0a14" stroke-width="0.8" transform="translate(1.5 0) scale(0.95)"/></svg>',
  clock: '<svg viewBox="-10 -10 20 20"><circle r="8" fill="#ff3b5c" stroke="#0a0a14" stroke-width="1"/><circle r="5.6" fill="none" stroke="#fff" stroke-width="0.8"/><path d="M0 0V-4.5M0 0 3 1.5" stroke="#fff" stroke-width="1.2" stroke-linecap="round"/></svg>',
  shade: '<svg viewBox="-10 -10 20 20"><path d="M0-9C6-9 8-3 8 3L8 8 5 6 2 8 0 6-2 8-5 6-8 8-8 3C-8-3-6-9 0-9z" fill="#2a0a16" stroke="#ff3b5c" stroke-width="1.2"/><path d="M0 0a3 3 0 1 1 3-3" fill="none" stroke="#ff3b5c" stroke-width="1"/></svg>',
  comet: '<svg viewBox="-10 -10 20 20"><path d="M-9 0Q-3-5 3-5A5 5 0 0 1 3 5Q-3 5-9 0z" fill="#ff3b5c" stroke="#0a0a14" stroke-width="1"/><circle cx="3" cy="0" r="2.4" fill="#fff6e0"/></svg>',
  mirage: '<svg viewBox="-10 -10 20 20"><path d="M-8-6 8-6 0 9z" fill="#ff3b5c" stroke="#0a0a14" stroke-width="1"/><path d="M0-3 1.5-1 0 1-1.5-1z" fill="#fff"/></svg>',
  eclipse: '<svg viewBox="-10 -10 20 20"><circle r="9" fill="none" stroke="#ff7a5c" stroke-width="1.4" stroke-dasharray="1.5 1.2"/><circle r="6.5" fill="#1a0a14" stroke="#ff3b5c" stroke-width="1.4"/><circle cx="5.2" cy="-3.8" r="1.2" fill="#fff"/></svg>',
  abyss: '<svg viewBox="-10 -10 20 20"><ellipse rx="9.5" ry="2.6" transform="rotate(-20)" fill="none" stroke="#ff3b5c" stroke-width="1.4"/><circle r="5.5" fill="#1a0a14" stroke="#ff3b5c" stroke-width="1.2"/><circle r="2" fill="#000"/></svg>',
  shuhitsu: '<svg viewBox="-10 -10 20 20"><rect x="-1.2" y="-10" width="2.4" height="6" fill="#5a0f14" stroke="#ffd84a" stroke-width=".6"/><rect x="-3.6" y="-4.4" width="7.2" height="1.8" fill="#c9a227"/><path d="M0 9C1 5 4 2 3.6-1.2L3.4-2.6-3.4-2.6-3.6-1.2C-4 2-1 5 0 9z" fill="#0d0a0c" stroke="#ffd84a" stroke-width=".8"/></svg>',
};
// 敵の小さな絵（ゲームの形に合わせた簡単な形）
const EN = (path) => `<svg viewBox="-10 -10 20 20"><path d="${path}" fill="#ff3b5c" stroke="#0a0a14" stroke-width="1.2"/><circle r="1.6" fill="#fff"/></svg>`;
export const ENEMY_ICONS = {
  drift: EN('M7 0A7 7 0 1 1-7 0 7 7 0 1 1 7 0z'),
  chaser: EN('M8 0-5 6-2 0-5-6z'),
  shooter: EN('M8 0 0 6-7 0 0-6z'),
  swarm: '<svg viewBox="-10 -10 20 20">' + [[-4, -3], [3, -4], [0, 2], [-5, 4], [5, 3]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.6" fill="#ff3b5c" stroke="#0a0a14" stroke-width="0.9"/>`).join('') + '</svg>',
  tank: EN('M-5-7H5L7-5V5L5 7H-5L-7 5V-5z'),
  dasher: EN('M9 0-5 5-2 0-5-5z'),
  shield: EN('M3-6A9 6 0 0 0 3 6z'),
  thief: EN('M0-8 2-3 7-3 3 1 5 7 0 3-5 7-3 1-7-3-2-3z'),
  bomber: EN('M-2-7H2V-2H7V2H2V7H-2V2H-7V-2H-2z'),
};

// 遊び方の4枚
const HOWTO = [
  ['描いた軌跡が、仲間になる', 'あなたが描いた線から生まれる仲間と一緒に、押し寄せる敵を倒していくゲームだよ。かけらを集めてフェーズを進み、ハイスコアを目指そう！', '<path class="hw-trail ghost" d="M30 50 L160 50"/><path class="hw-trail ghost" d="M30 120 C70 80 120 150 160 110"/><circle cx="80" cy="50" r="10" fill="#3fe0ff"/><circle cx="80" cy="50" r="4" fill="#fff"/><circle cx="125" cy="128" r="10" fill="#7a8cff"/><circle cx="125" cy="128" r="4" fill="#fff"/><g transform="translate(95 88) scale(1.4)"><path d="M0-9 2-2 9 0 2 2 0 9-2 2-9 0-2-2z" fill="#ffd84a"/></g><path d="M0-8 8 6-8 6z" fill="#ff3b5c" transform="translate(30 88)"/><path d="M0-8 8 6-8 6z" fill="#ff3b5c" transform="translate(165 85) rotate(180)"/><circle cx="150" cy="150" r="7" fill="#ff3b5c"/>'],
  ['描くモードで、軌跡を描く', '描くモードの間は、本体がペンになるよ。ドラッグすると、通った跡が軌跡になるよ。', '<path class="hw-trail" d="M25 125 C60 40 120 150 150 80"/><g transform="translate(150 80) rotate(-45)"><rect x="4" y="-5" width="34" height="10" rx="5" fill="#ffd84a" stroke="#0a0a14" stroke-width="2"/><rect x="0" y="-4.5" width="6" height="9" fill="#8a6a20"/><path d="M0 -4.5 L-12 0 L0 4.5z" fill="#dfe8f5" stroke="#5a6478" stroke-width="1.2"/></g><rect x="6" y="6" width="178" height="158" rx="8" fill="none" stroke="#7fe3ff" stroke-width="3"/>'],
  ['指を離すと、軌跡が仲間になる', '描いた軌跡をなぞって往復する分身が、自動で敵を撃ってくれるよ。まっすぐな線ほど、弾がよく当たって強くなるよ。', '<path class="hw-trail ghost" d="M25 125 L165 45"/><circle cx="95" cy="85" r="12" fill="#3fe0ff" opacity="0.9"/><circle cx="95" cy="85" r="5" fill="#fff"/><circle cx="95" cy="85" r="18" fill="none" stroke="#bff4ff" stroke-width="1.5" stroke-dasharray="3 4"/><text x="95" y="58" text-anchor="middle" font-size="12" fill="#bff4ff" font-family="DotGothic16, sans-serif">命中 95%</text>'],
  ['タップで、描く／動くを切り替える', '描くモードは遅くなって、敵の攻撃も痛くなるよ。動くモードは速く動けるけど、線は描けないよ。', '<g transform="translate(52 88)"><g transform="rotate(-45)"><rect x="4" y="-5" width="34" height="10" rx="5" fill="#ffd84a" stroke="#0a0a14" stroke-width="2"/><rect x="0" y="-4.5" width="6" height="9" fill="#8a6a20"/><path d="M0 -4.5 L-12 0 L0 4.5z" fill="#dfe8f5" stroke="#5a6478" stroke-width="1.2"/></g></g><text x="52" y="140" text-anchor="middle" font-size="12" fill="#7fe3ff" font-family="DotGothic16, sans-serif">描く</text><path d="M80 82 h30 l-7 -6 M110 82 l-7 6" stroke="#f3f5ff" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M110 98 h-30 l7 -6 M80 98 l7 6" stroke="#f3f5ff" stroke-width="3" fill="none" stroke-linecap="round"/><g transform="translate(140 90) scale(1.6)"><path d="M0-9 2-2 9 0 2 2 0 9-2 2-9 0-2-2z" fill="#ffd84a"/></g><text x="140" y="140" text-anchor="middle" font-size="12" fill="#ffd84a" font-family="DotGothic16, sans-serif">動く</text><text x="95" y="40" text-anchor="middle" font-size="13" fill="#f3f5ff" font-family="DotGothic16, sans-serif">タップ</text>'],
  ['かけらを集めて、フェーズクリア', '倒した敵が落とすかけらを集めると、フェーズクリアだよ。10フェーズごとにボスが出てくるよ。', '<g fill="#3fe0ff">' + [[50, 80], [80, 110], [120, 70], [150, 115], [100, 130]].map(([x, y]) => `<path d="M${x} ${y - 6}l5 6-5 6-5-6z"/>`).join('') + '</g><path d="M0-9 2-2 9 0 2 2 0 9-2 2-9 0-2-2z" fill="#ffd84a" transform="translate(95 95)"/>'],
  ['カードを選んで、強くなる', 'フェーズクリアのたびに、3枚のカードから1つ選べるよ。組み合わせで、分身や本体の戦い方が変わるよ。', [0, 1, 2].map((i) => `<rect x="35" y="${18 + i * 47}" width="120" height="40" rx="6" fill="#2a3270" stroke="#0a0a14" stroke-width="3"/><rect x="44" y="${26 + i * 47}" width="24" height="24" rx="3" fill="${['#3fe0ff', '#ffd84a', '#c7a6ff'][i]}"/><rect x="76" y="${29 + i * 47}" width="${[56, 44, 62][i]}" height="6" rx="2" fill="#f3f5ff"/><rect x="76" y="${41 + i * 47}" width="${[68, 60, 50][i]}" height="4" rx="2" fill="#8f9bd6"/>`).join('')],
];
export const HOWTO_LAST = HOWTO.length - 1;

// お知らせ（新しい順）。新しく足したら一番上に入れる
export const NEWS = [
  ['更新', '11/23', 'ver 1.1.0　新しいボス5体と最後のボス', 'フェーズ60〜100に、彗星・蜃気楼・日蝕・深淵、そして最後のボス「終筆」が登場しました。どのボスも、技と技の合間にねらい撃ちをしてくるようになりました。ハンターは突進して止まるたびに弾をばらまきます。'],
  ['更新', '11/23', '描くモードと動くモード', 'タップで「描くモード」と「動くモード」を切り替えられるようになりました。線を描けるのは描くモードのときだけで、遅くなり、受けるダメージも増えます。まっすぐな線ほど、仲間の弾がよく当たって強くなります（命中0%で0.5倍、100%で1.2倍）。'],
  ['更新', '11/23', 'チュートリアルができました', '初めて遊ぶときは、チュートリアルで線の描き方・モードの切り替え・カードの選び方を練習できます。遊び方の画面からも、いつでも遊べます。'],
  ['更新', '11/23', '操作が動かしやすくなりました', 'ドラッグで、本体が指と同時に動くようになりました。指を止めて押さえ続けると、動かしていた向きへ進み続けます。iPhoneで長押しすると出ていた虫めがねも出なくなりました。'],
  ['更新', '11/23', '敵とボスの強さ・スキルの見直し', 'ボスの体力と中ボスの体力、フェーズに必要なかけらの数、後半の敵の強くなり方を見直しました。死神はボスにも効くようになり、返し針・マキビシ・地雷・炎の道・置き土産・仕込み・一斉射撃・浮遊・闘気を強くしました。'],
  ['更新', '11/21', 'ホーム画面と図鑑ができました', 'タイトルがホーム画面になりました。図鑑では、取ったスキルや見た敵・ボスを見返せます。プロフィールでは名前とアイコンを変えられます。'],
  ['更新', '11/21', 'ボス5体と中ボスが登場しました', '10フェーズごとにボスが出るようになりました。コア・ハンター・双子・時計・影の5体です。フェーズ12からは中ボスも混ざります。'],
  ['更新', '11/20', 'スキル115個がすべて使えるようになりました', '影・本体・罠・現象・星環・収穫の6つの系統のスキルが、すべて動くようになりました。'],
];

// ---------- 見本用の仮の中身 ----------
export const MOCK = {
  name: 'ほしのこ', icon: 0, id: '4821-0937', coins: 12480, newsNew: 2, pity: 62,
  get iconItem() { return AVATAR_ITEMS[0]; },
  best: { score: 128400, phase: 42 },
  stats: { plays: 213, time: 111600, kills: 412905, bosses: 58 },
  pause: { phase: 23, time: 768 },
  settings: { bgm: true, bgmVol: 100, se: false, seVol: 100, control: 'drag', shake: true, glow: 1 },
  bossTest: { n: 3, name: '双子', phase: 30, win: true, sec: 143, bossLeft: 0, hpLeft: 62, auto: true, dps: 1210 },
  result: { score: 128400, isNew: true, phase: 42, time: 1102, kills: 3912, best: 128400, bosses: ['core', 'hunter', 'twin', 'clock'],
    roads: [['volley', 'giant', 'gigant'], ['thunder', 'chainbolt'], ['float', 'satellite']], mvp: { src: 'thunder', pct: 38 }, coins: { score: 358, boss: 120 } },
  ending: { score: 48120500, phase: 100, time: 4380, kills: 41290, ghosts: 612, roads: [['volley', 'giant', 'gigant'], ['thunder', 'chainbolt', 'skybolt'], ['float', 'satellite'], ['poison', 'contagion']] },
  zukan: { skills: Object.fromEntries(SKILL_ROADS.flatMap((r) => r.skills).filter((_, i) => i % 5 !== 3).map((k, i) => [k.id, { taken: 3 + (i % 9), evo: i % 3, best: 10 + i }])),
    enemies: Object.fromEntries(ENEMY_KINDS.slice(0, 7).map((k, i) => [k, { seen: 20 - i, kills: 900 - i * 80 }])),
    bosses: { core: { seen: 9, kills: 6 }, hunter: { seen: 6, kills: 4 }, twin: { seen: 4, kills: 3 }, clock: { seen: 3, kills: 3 } } },
  ztab: 'skill', zitem: { kind: 'skill', id: 'thunder' },
  page: 0,
};

// ---------- それぞれの画面（st：その画面の中の状態、d：記録や設定） ----------
// ロゴ：文字の下を、指でなぞった軌跡が走り抜け、右上で本体（金の光）に行き着く。文字の左に残像が薄く尾を引く
export const LOGO_TRAIL = '<svg class="logo-trail" viewBox="0 0 300 120" aria-hidden="true"><defs><linearGradient id="lgTrail" x1="0" x2="1"><stop offset="0" stop-color="#3fe0ff" stop-opacity="0"/><stop offset="0.55" stop-color="#3fe0ff" stop-opacity="0.75"/><stop offset="1" stop-color="#ffd84a"/></linearGradient></defs>'
  + '<path class="lt-path" d="M6 108 C 70 122, 140 118, 196 98 S 258 52, 276 22" fill="none" stroke="url(#lgTrail)" stroke-width="3.2" stroke-linecap="round"/>'
  + '<path class="lt-dash" d="M6 108 C 70 122, 140 118, 196 98 S 258 52, 276 22" fill="none" stroke="#bff4ff" stroke-width="1" stroke-linecap="round" stroke-dasharray="2 7" opacity="0.5"/>'
  + '<circle class="lt-dot" cx="276" cy="22" r="5.5" fill="#ffd84a"/><circle cx="276" cy="22" r="2.4" fill="#fff"/></svg>';
// ロゴの後ろの光：青紫の大きな光・水色の芯・横に走る光の筋・またたく小さな星
const LOGO_STARS = [[8, 30, 0], [18, 78, 1.1], [30, 12, 0.5], [44, 88, 1.7], [62, 8, 0.9], [74, 84, 0.3], [86, 24, 1.4], [94, 66, 0.7], [52, 96, 2.1], [4, 62, 1.9]]
  .map(([x, y, d], i) => `<i style="left:${x}%;top:${y}%;animation-delay:${d}s;--s:${i % 3 ? 1 : 1.6}"></i>`).join('');
const LOGO_BACK = `<div class="logo-back"><div class="lb-aura"></div><div class="lb-core"></div><div class="lb-flare"></div><div class="lb-stars">${LOGO_STARS}</div></div>`;
const logo = () => m('ロゴ', `${LOGO_BACK}<div class="logo-wrap">${LOGO_TRAIL}<div class="logo-main" data-t="LugLog"><span>Lug</span><span class="lg2">Log</span></div></div><div class="logo-sub"><i></i>指先のきせきにドラマを<i></i></div>`);
// 下のタブ（ホーム・着せ替え・ガチャ・ランキング・図鑑・ミッション）。どのページにも同じものを出し、今いるページを光らせる
// 右上：コイン・お知らせ・設定（ホームと、下のタブで行けるページで同じもの）
const topRight = (d) => `<div class="ms-topright">${d.coins == null ? '' : `<div class="ms-wallet">${m('コイン', `${coin}<span>${num(d.coins)}</span>`, 'ms-cur')}</div>`}${m('お知らせ', `${px(PX.bell)}${d.newsNew ? `<span class="ms-dot">${d.newsNew}</span>` : ''}`, 'btn btn-icon ms-ib', 'button', act('news'))}${m('設定', px(PX.gear), 'btn btn-icon ms-ib', 'button', act('settings'))}</div>`;
// 下のタブで行けるページの見出し：戻るボタンはなし（タブで移れるので）。右上はホームと同じ
const pageHead = (title, d) => `<div class="ms-head ms-head-nav"><div class="ms-title">${title}</div>${topRight(d)}</div>`;
const NAV = [['ホーム', 'M1 3h1V2h1V1h2v1h1v1h1v5H5V5H3v3H1z', 'home'], ['着せ替え', 'M2 0h4v1h2v3H7v4H1V4H0V1h2z', 'skinopen'], ['ガチャ', 'M2 0h4v1h1v3H6v1h1v3H1V5h1V4H1V1h1z', 'gacha'], ['ランキング', 'M3 0h2v8H3zM0 3h2v5H0zM6 5h2v3H6z', 'ranking'], ['図鑑', 'M0 1h3v1h2V1h3v7H5V7H3v1H0z', 'zukan'], ['ミッション', 'M1 0h6v8H1zM2 2v1h4V2zM2 4v1h4V4z', 'mission']];
function navBar(d, cur) {
  return `<nav class="ms-nav">${NAV.map(([n, p, a]) => m(`下のタブ：${n}`, `${px(p)}<span>${n}</span>${a === 'mission' && d.missionDot ? '<i class="ms-navdot"></i>' : ''}`, `ms-navi${a === cur ? ' on' : ''}`, 'button', a === cur ? '' : act('nav:' + a))).join('')}</nav>`;
}
export const SCREENS = {
  s_load: (st, d) => `
    <div class="ms-full ms-load">
      <div class="ms-logo ms-logo-fixed">${logo()}</div>
      <div class="ms-load-foot">
        ${m('読み込みの進み具合', `${bar(st.load ?? 0.64, 'gold')}<div class="ms-load-pct">LOADING ${Math.round((st.load ?? 0.64) * 100)}%</div>`)}
        ${m('ひとこと', `<div class="ms-tip">ヒント：${st.tip || '長く描くほど、大きくて強い分身が生まれる'}</div>`)}
      </div>
    </div>`,

  s_home: (st, d) => `
    <div class="ms-full ms-home">
      <div class="ms-topbar">
        ${m('プロフィール', frameHtml(d.frameItem, `<div class="ms-avatar">${avatarHtml(d.iconItem)}</div>`), 'ms-prof only-icon', 'button', act('profile'))}
        ${topRight(d)}
      </div>
      <div class="ms-logo ms-logo-fixed">${logo()}</div>
      ${d.best.score > 0 ? m('最高記録', `<span>BEST</span><b>PHASE ${d.best.phase}</b><b>${num(d.best.score)}</b>`, 'ms-best') : ''}
      <div class="ms-home-mid">
        ${m('プレイ', 'プレイ', 'btn ms-start', 'button', act('start'))}
        <div class="ms-home-sub">
          ${m('遊び方', '遊び方', 'btn btn-sub ms-btn', 'button', act('howto'))}
          ${m('オンライン', 'オンライン<small>準備中</small>', 'btn btn-sub ms-btn ms-soon', 'button', act('soon:オンライン'))}
        </div>
      </div>
      ${navBar(d, 'home')}
    </div>`,

  s_howto: (st) => {
    const p = st.page || 0, [t, desc, art] = HOWTO[p];
    return `
    <div class="ms-full ms-howto">
      ${m('とばす', 'とばす', 'btn btn-small btn-sub ms-skip', 'button', act('howto-end'))}
      <div class="box ms-howto-box">
        ${m(`遊び方${p + 1}の絵`, `<svg viewBox="0 0 190 170" class="ms-howto-art">${art}</svg>`, 'ms-howto-pic')}
        ${m(`遊び方${p + 1}の見出し`, t, 'ms-howto-title')}
        ${m(`遊び方${p + 1}の説明`, desc, 'ms-howto-desc')}
        <div class="ms-dots">${HOWTO.map((_, i) => `<i class="${i === p ? 'on' : ''}"></i>`).join('')}</div>
        <div class="ms-row">
          ${p > 0 ? m('前へ', '前へ', 'btn btn-sub ms-btn', 'button', act('howto-prev')) : '<span></span>'}
          ${m(p < HOWTO_LAST ? '次へ' : '遊び方を終える', p < HOWTO_LAST ? '次へ' : st.thenPlay ? 'プレイ' : 'とじる', 'btn ms-btn', 'button', act(p < HOWTO_LAST ? 'howto-next' : 'howto-end'))}
        </div>
        ${st.thenPlay ? '' : m('チュートリアル', 'チュートリアルを遊ぶ', 'btn btn-sub wide ms-tutobtn', 'button', act('tutorial'))}
      </div>
    </div>`;
  },

  s_pause: (st, d) => `
    <div class="ms-dim ms-pausebg">
      ${d.mock ? m('一時停止ボタン（右上）', px('M1 1h2v6H1zM5 1h2v6H5z'), 'btn btn-icon ms-pausebtn', 'button') : ''}
      <div class="box ms-dialog">
        ${m('一時停止の見出し', 'PAUSE', 'ms-dtitle pixfont')}
        <div class="ms-now">${m('今のフェーズ', `<small>フェーズ</small><b>${d.pause.phase}</b>`, 'ms-nowc')}${m('今の時間', `<small>時間</small><b>${fmtTime(d.pause.time)}</b>`, 'ms-nowc')}</div>
        ${btn('つづける', 'wide', 'resume')}
        ${btn('やり直す', 'wide btn-sub', 'restart')}
        ${btn('設定', 'wide btn-sub', 'settings')}
        ${btn('タイトルへ', 'wide btn-danger', 'title')}
      </div>
    </div>`,

  s_settings: (st, d) => {
    const S = d.settings;
    return `
    <div class="ms-full ms-page">
      ${back('設定')}
      <div class="ms-scroll">
        <div class="ms-sec">サウンド</div>
        ${m('BGMの音量', `<span>BGM</span>${slider(S.bgmVol, !S.bgm, 'vol:bgmVol')}<b class="${S.bgm ? '' : 'off'}">${S.bgmVol}</b>${toggle(S.bgm, 'set:bgm', 'BGMのオン・オフ')}`, 'ms-set')}
        ${m('効果音の音量', `<span>効果音</span>${slider(S.seVol, !S.se, 'vol:seVol')}<b class="${S.se ? '' : 'off'}">${S.seVol}</b>${toggle(S.se, 'set:se', '効果音のオン・オフ')}`, 'ms-set')}
        <div class="ms-sec">操作</div>
        ${m('操作方法', `<div class="ms-seg">${m('操作：スティック', 'スティック', S.control === 'stick' ? 'on' : '', 'button', act('ctl:stick'))}${m('操作：ドラッグ', 'ドラッグ', S.control === 'drag' ? 'on' : '', 'button', act('ctl:drag'))}</div>`, 'ms-set col')}
        <div class="ms-sec">画面</div>
        ${m('画面の揺れ', `<span>画面の揺れ</span>${toggle(S.shake, 'set:shake', '画面の揺れのオン・オフ')}`, 'ms-set')}
        ${m('光の強さ', '<span>光の強さ</span><div class="ms-seg small">' + [['ひかえめ', 0.4], ['ふつう', 1], ['つよい', 1.6]].map(([x, v]) => `<button class="${S.glow === v ? 'on' : ''}" ${act('glow:' + v)}>${x}</button>`).join('') + '</div>', 'ms-set')}
        <div class="ms-sec">そのほか</div>
        ${m('名前を変える', `<span>名前を変える</span><span class="ms-go">${esc(d.name)} ›</span>`, 'ms-set', 'button', act('rename'))}
        ${m('クレジット（設定から）', '<span>クレジット</span><span class="ms-go">›</span>', 'ms-set', 'button', act('credits'))}
        ${m('データを全部消す', 'データを全部消す', 'btn btn-danger wide ms-wipe', 'button', act('wipeopen'))}
        ${m('バージョン', 'ver 1.1.0', 'ms-ver')}
      </div>
      ${st.wipeOpen ? `<div class="ms-dim ms-ttlsheet">
        <div class="box ms-dialog">
          ${m('データ消去の見出し', 'データを全部消す', 'ms-dtitle')}
          ${m('データ消去の説明', '名前・コイン・着せ替え・図鑑・ミッション・記録と、ランキングの自分の記録が消えます。<br><b>元には戻せません。</b>', 'ms-dtext')}
          ${st.wipeBusy ? m('データ消去中', '消しています…', 'ms-dtext') : btn('消す', 'wide btn-danger', 'wipe') + btn('やめる', 'wide btn-sub', 'wipeclose')}
        </div>
      </div>` : ''}
    </div>`;
  },

  s_result: (st, d) => {
    const R = d.result;
    const nSkills = R.roads.reduce((n, ids) => n + ids.length, 0);
    const sec = (title, right, body, cls = '') => `<section class="ms-rsec ${cls}"><div class="ms-rsec-h"><span>${title}</span>${right ? `<b>${right}</b>` : ''}</div>${body}</section>`;
    return `
    <div class="ms-dim">
      <div class="box ms-result">
        <div class="ms-rhead">
          ${m('結果の見出し', 'やられた！', 'ms-rtitle')}
          ${m('スコア', `<small>SCORE</small><b>${num(R.score)}</b>${R.isNew ? '<span class="ms-new">最高スコア更新！</span>' : ''}`, 'ms-rscore')}
        </div>
        <div class="ms-rgrid">
          ${m('到達フェーズ', `<span>到達フェーズ</span><b>${R.phase}</b>`, 'ms-rcell')}
          ${m('生きた時間', `<span>生きた時間</span><b>${fmtTime(R.time)}</b>`, 'ms-rcell')}
          ${m('撃破', `<span>撃破</span><b>${num(R.kills)}</b>`, 'ms-rcell')}
          ${m('最高スコア', `<span>最高スコア</span><b>${num(R.best)}</b>`, 'ms-rcell gold')}
        </div>
        ${sec('倒したボス', `${R.bosses.length}/${BOSS_KINDS.length}`, m('倒したボス', BOSS_KINDS.map((k) => `<div class="ms-bossi ${R.bosses.includes(k) ? 'done' : ''}"><img class="ms-unitimg" src="${unitImage(k)}" alt=""><small>${R.bosses.includes(k) ? BOSS_NAMES[k] : '？'}</small></div>`).join(''), 'ms-bossrow'))}
        ${sec('最後に持っていたスキル', nSkills ? `${nSkills}個` : '', m('最後に持っていたスキル', R.roads.length ? R.roads.map((ids) => `<div class="ms-chipline">${ids.map((id) => `<span class="ms-chip">${iconSvg('sk_' + id)}</span>`).join('')}</div>`).join('') : '<div class="ms-none">スキルなし</div>', 'ms-roads'))}
        ${R.coins ? m('もらったコイン', `<span class="ms-rw-l">もらったコイン<small>スコア ${num(R.coins.score)}${R.coins.boss ? `・ボス ${num(R.coins.boss)}` : ''}</small></span><span class="ms-rw-v">${coin}<b>+${num(R.coins.score + R.coins.boss)}</b></span>`, 'ms-reward2') : ''}
        <div class="ms-row ms-rbtns">${btn('タイトルへ', 'btn-sub', 'title')}${btn('もう一回', '', 'retry')}</div>
      </div>
    </div>`;
  },

  // ボスを試す（調整パネル）：戦い終わったときの結果。ランキングと記録には入らない
  s_btresult: (st, d) => {
    const R = st.bossTest || d.bossTest;
    return `
    <div class="ms-dim">
      <div class="box ms-result ms-bt">
        <div class="ms-bt-tag">ボスを試す・${R.mixed ? '途中からおまかせ' : R.auto ? 'おまかせ' : '自分で選んだ'}</div>
        <div class="ms-rhead">
          ${m('結果の見出し', R.win ? '倒せた！' : 'やられた…', `ms-rtitle ${R.win ? 'win' : ''}`)}
          ${m('ボス', `<small>${R.n}体目・フェーズ ${R.phase}</small><b>${esc(R.name)}</b>`, 'ms-bt-boss')}
        </div>
        <div class="ms-rgrid">
          ${m('かかった時間', `<span>${R.win ? '倒すまで' : 'やられるまで'}</span><b>${fmtTime(R.sec)}</b>`, 'ms-rcell')}
          ${m('ボスの残り体力', `<span>ボスの残り</span><b>${R.bossLeft}%</b>`, 'ms-rcell')}
          ${m('本体の残り体力', `<span>本体の残り</span><b>${R.hpLeft}%</b>`, 'ms-rcell')}
          ${m('1秒あたりのダメージ', `<span>1秒あたり</span><b>${num(R.dps || 0)}</b>`, 'ms-rcell gold')}
        </div>
        <div class="ms-row ms-rbtns ms-bt-btns">${btn('やめる', 'btn-sub', 'bt-quit')}${btn('選び直す', 'btn-sub', 'bt-repick')}${btn('同じスキルでもう一度', '', 'bt-again')}</div>
      </div>
    </div>`;
  },

  // エンディング（終筆を初めて倒したとき）：白い紙に筆で「終」→ そのプレイの記録 → クレジットが流れる → 続ける
  s_ending: (st, d) => {
    const E = st.ending || d.ending;
    const credits = [['企画・ゲームデザイン', ['いぶ']], ['グラフィック', ['いぶ']], ['サウンド', ['いぶ']], ['プログラム', ['いぶ', 'Claude（Anthropic）']]];
    return `
    <div class="ms-full ms-ending">
      <div class="ms-end-kanji">終</div>
      <div class="ms-end-rec">
        ${m('エンディングの見出し', '最後のひと筆を、書き終えた', 'ms-end-title')}
        <div class="ms-end-grid">
          ${m('スコア', `<span>スコア</span><b>${num(E.score)}</b>`, 'ms-end-cell wide')}
          ${m('到達フェーズ', `<span>フェーズ</span><b>${E.phase}</b>`, 'ms-end-cell')}
          ${m('遊んだ時間', `<span>遊んだ時間</span><b>${fmtTime(E.time)}</b>`, 'ms-end-cell')}
          ${m('倒した敵', `<span>倒した敵</span><b>${num(E.kills)}</b>`, 'ms-end-cell')}
          ${m('描いた分身', `<span>描いた分身</span><b>${num(E.ghosts)}</b>`, 'ms-end-cell')}
        </div>
        ${E.roads && E.roads.length ? m('持っていたスキル', E.roads.map((ids) => `<div class="ms-chipline">${ids.map((id) => `<span class="ms-chip">${iconSvg('sk_' + id)}</span>`).join('')}</div>`).join(''), 'ms-end-skills') : ''}
      </div>
      <div class="ms-end-roll"><div class="ms-end-rollin">
        <div class="ms-end-logo">LugLog</div>
        ${credits.map(([k, vs]) => `<div class="ms-end-cb"><small>${k}</small>${vs.map((v) => `<b>${v}</b>`).join('')}</div>`).join('')}
        <div class="ms-end-thanks">遊んでくれて、ありがとう</div>
      </div></div>
      ${m('続ける', '<span>この先も、描き続ける</span>', 'btn wide ms-end-go', 'button', act('ending-go'))}
    </div>`;
  },

  s_zukan: (st, d) => {
    const Z = d.zukan, tab = d.ztab || 'skill';
    const total = SKILL_ROADS.reduce((n, r) => n + r.skills.length, 0) + ENEMY_KINDS.length + BOSS_KINDS.length;
    const got = Object.keys(Z.skills).length + ENEMY_KINDS.filter((k) => Z.enemies[k]).length + BOSS_KINDS.filter((k) => Z.bosses[k]).length;
    let body = '';
    if (tab === 'skill') {
      // 図鑑の並び：本体 → 影 → 罠 → 現象 → 星環 → 収穫
      const ORDER = ['body', 'ghost', 'trap', 'phenom', 'orbit', 'harvest'];
      body = [...SKILL_ROADS].sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id)).map((r) => `<div class="ms-sec">${r.name}<small>${r.skills.filter((k) => Z.skills[k.id]).length}/${r.skills.length}</small></div>
        <div class="ms-zgrid">${r.skills.map((k) => { const seen = !!Z.skills[k.id]; return m(seen ? k.name : `？（${k.name}）`, seen ? `${iconSvg('sk_' + k.id)}<small>${k.name}</small>` : '<b>？</b><small>？？？</small>', `ms-zcell${seen ? '' : ' unseen'}`, 'button', seen ? act(`zitem:skill:${k.id}`) : ''); }).join('')}</div>`).join('');
    } else {
      const kinds = tab === 'enemy' ? ENEMY_KINDS : BOSS_KINDS, box = tab === 'enemy' ? Z.enemies : Z.bosses, icons = tab === 'enemy' ? ENEMY_ICONS : BOSS_ICONS;
      const names = (k) => (tab === 'enemy' ? CONFIG.enemies[k].name : BOSS_NAMES[k]);
      body = `<div class="ms-sec">${tab === 'enemy' ? '敵' : 'ボス'}<small>${kinds.filter((k) => box[k]).length}/${kinds.length}</small></div>
        <div class="ms-zgrid z-${tab}">${kinds.map((k) => { const seen = !!box[k]; return m(seen ? names(k) : `？（${names(k)}）`, seen ? `<span class="ms-zpic"><img class="ms-unitimg" src="${unitImage(k)}" alt=""></span><small>${names(k)}</small>` : '<b>？</b><small>？？？</small>', `ms-zcell${seen ? '' : ' unseen'}`, 'button', seen ? act(`zitem:${tab}:${k}`) : ''); }).join('')}</div>`;
    }
    return `
    <div class="ms-full ms-page">
      ${pageHead('図鑑', d)}
      ${tabs(['スキル', '敵', 'ボス'], ['skill', 'enemy', 'boss'].indexOf(tab), '図鑑のタブ', ['ztab:skill', 'ztab:enemy', 'ztab:boss'])}
      ${m('集めた数', `<span>集めた数</span>${bar(got / total, 'cyan')}<b>${got}/${total}</b>`, 'ms-progress')}
      <div class="ms-scroll">${body}</div>
      ${navBar(d, 'zukan')}
    </div>`;
  },

  s_zukan2: (st, d) => {
    const it = d.zitem, Z = d.zukan;
    let card = '';
    if (it.kind === 'skill') {
      const road = ROAD_OF[it.id], k = road.skills.find((x) => x.id === it.id), tx = SKILL_TEXT[it.id] || {}, z = Z.skills[it.id] || { taken: 0, evo: 0, best: 0 };
      // 同じ型のスキル：入口から次の入口の前まで
      const i0 = road.skills.findIndex((x) => x.id === it.id);
      let a = i0; while (a > 0 && road.skills[a].kind !== '入口' && road.skills[a].kind !== '目覚め') a--;
      let b = a + 1; while (b < road.skills.length && road.skills[b].kind !== '入口' && road.skills[b].kind !== '目覚め') b++;
      const group = road.skills.slice(a, b);
      card = `<div class="box ms-detail">
          ${m('詳細：アイコン', iconSvg('sk_' + it.id), 'ms-dicon')}
          ${m('詳細：名前', `${k.name}<small>${road.name}・${k.kind}</small>`, 'ms-dname')}
          ${m('詳細：説明', tx.desc || '', 'ms-ddesc')}
          ${tx.evoDesc ? m('詳細：極めたとき', `<b>極めると${tx.evo ? `「${tx.evo}」` : ''}</b><span>${tx.evoDesc}</span>`, 'ms-devo') : ''}
          <div class="ms-dstats">
            ${m('詳細：取った回数', `<span>取った回数</span><b>${z.taken}</b>`, '')}
            ${m('詳細：極めた回数', `<span>極めた回数</span><b>${z.evo}</b>`, '')}
            ${m('詳細：最高フェーズ', `<span>持っていた時の最高</span><b>PHASE ${z.best}</b>`, '')}
          </div>
          ${group.length > 1 ? m('詳細：つながるスキル', `<span>この型のスキル</span><div>${group.map((x) => (Z.skills[x.id] ? `<span class="ms-chip" ${act(`zitem:skill:${x.id}`)}>${iconSvg('sk_' + x.id)}</span>` : '<span class="ms-chip unseen">？</span>')).join('')}</div>`, 'ms-dlink') : ''}
        </div>`;
    } else {
      const boss = it.kind === 'boss', z = (boss ? Z.bosses : Z.enemies)[it.id] || { seen: 0, kills: 0 };
      const name = boss ? BOSS_NAMES[it.id] : CONFIG.enemies[it.id].name;
      const sub = boss ? `フェーズ${(BOSS_KINDS.indexOf(it.id) + 1) * 10}のボス` : `フェーズ${CONFIG.enemies[it.id].unlockPhase}から出る`;
      card = `<div class="box ms-detail">
          ${m(boss ? '詳細：ボスの絵' : '詳細：敵の絵', `<img class="ms-unitimg" src="${unitImage(it.id)}" alt="">`, 'ms-dboss')}
          ${m(boss ? '詳細：ボスの名前' : '詳細：敵の名前', `${name}<small>${sub}</small>`, 'ms-dname')}
          ${m(boss ? '詳細：ボスの説明' : '詳細：敵の説明', (boss ? BOSS_DESC : ENEMY_DESC)[it.id], 'ms-ddesc')}
          <div class="ms-dstats two">
            ${m('詳細：出会った回数', `<span>出会ったプレイ</span><b>${z.seen}</b>`, '')}
            ${m('詳細：倒した回数', `<span>倒した数</span><b>${num(z.kills)}</b>`, '')}
          </div>
        </div>`;
    }
    return `
    <div class="ms-full ms-page">
      ${back('図鑑')}
      <div class="ms-scroll">${card}</div>
    </div>`;
  },

  s_name: (st, d) => `
    <div class="ms-full ms-page ms-namepg">
      ${m('名前登録の見出し', d.name ? '名前を変える' : 'はじめまして！', 'ms-rtitle gold')}
      ${m('名前登録の説明', 'ランキングに出る名前を決めてください。<br>あとから設定で変えられます。', 'ms-dtext')}
      ${m('名前の入力欄', `<input class="ms-nameinput" maxlength="10" value="${esc(st.draft ?? d.name ?? '')}" placeholder="名前（10文字まで）" ${d.mock ? 'readonly' : ''}><small class="ms-namecount">${[...(st.draft ?? d.name ?? '')].length}/10</small>`, 'ms-input')}
      ${m('名前の決まり', st.err || st.note || '1〜10文字で入れてください', `ms-hint${st.err ? ' err' : ''}`)}
      ${btn('決定', 'wide', 'name-ok')}
      ${d.name ? btn('やめる', 'wide btn-sub', 'back') : ''}
    </div>`,

  s_profile: (st, d) => {
    const favs = Object.entries(d.zukan.skills).sort((a, b) => b[1].taken - a[1].taken).slice(0, 3);
    const nameOf = (id) => ROAD_OF[id].skills.find((x) => x.id === id).name;
    return `
    <div class="ms-full ms-page">
      ${back('プロフィール')}
      <div class="ms-scroll">
        <div class="box ms-pcard">
          ${frameHtml(d.frameItem, m('アイコン', avatarHtml(d.iconItem), 'ms-avatar lg'), 'lg')}
          <div>${titleChip(d.titleItem)}${m('名前', esc(d.name), 'ms-pn')}${m('ID', `ID ${d.id}`, 'ms-pid')}</div>
          ${m('名前を変える（プロフィール）', '名前', 'btn btn-small btn-sub', 'button', act('rename'))}
        </div>
        ${m('称号', `<span class="ms-ttlnow-l">称号</span>${d.titleItem ? titleChip(d.titleItem) : '<span class="ms-ttl t-none">なし</span>'}${m('称号を変更', '称号を変更', 'btn btn-small btn-sub', 'button', act('ttlopen'))}`, 'ms-ttlnow')}
        <div class="ms-statgrid">
          ${[['最高フェーズ', d.best.phase], ['最高スコア', num(d.best.score)], ['遊んだ回数', num(d.stats.plays)], ['合計プレイ時間', fmtHours(d.stats.time)], ['倒したボス', num(d.stats.bosses)], ['倒した敵', num(d.stats.kills)]].map(([k, v]) => m(`記録：${k}`, `<span>${k}</span><b>${v}</b>`, 'ms-stat')).join('')}
        </div>
        <div class="ms-sec">よく取るスキル</div>
        ${favs.length ? m('よく取るスキル', favs.map(([id, z]) => `<div class="ms-fav"><span class="ms-chip">${iconSvg('sk_' + id)}</span><small>${nameOf(id)}</small><b>${z.taken}回</b></div>`).join(''), 'ms-favs') : '<div class="ms-none">まだありません</div>'}
      </div>
      ${st.ttlOpen ? `<div class="ms-dim ms-ttlsheet">
        <div class="box ms-dialog ms-ttldlg">
          ${m('称号を選ぶの見出し', '称号を選ぶ', 'ms-dtitle')}
          <div class="ms-ttlscroll">${m('称号を選ぶ', `<button class="ms-ttlcell ${d.titleItem ? '' : 'on'}" ${act('ttl:none')}><span class="ms-ttlnone">なし</span></button>` + TITLES.filter((t) => (d.owned?.title || []).includes(t.id)).map((t) => `<button class="ms-ttlcell ${RARE_CLS[t.rarity] || ''} ${d.titleItem && d.titleItem.id === t.id ? 'on' : ''}" ${act('ttl:' + t.id)}>${titleChip(t)}</button>`).join(''), 'ms-ttlgrid')}</div>
          ${btn('とじる', 'wide btn-sub', 'ttlclose')}
        </div>
      </div>` : ''}
    </div>`;
  },

  s_news: (st, d) => `
    <div class="ms-full ms-page">
      ${back('お知らせ')}
      <div class="ms-scroll">
        ${NEWS.map(([tag, dt, t, body], i) => m(`お知らせ：${t}`, `<div class="ms-nhead"><span class="ms-ntag t${['更新', 'イベント', '不具合', 'お知らせ'].indexOf(tag)}">${tag}</span><small>${dt}</small>${i < (d.newsNew || 0) ? '<span class="ms-newtag">NEW</span>' : ''}</div><b>${t}</b>${body ? `<p>${body}</p>` : ''}`, `ms-nrow${body ? ' open' : ''}`)).join('')}
      </div>
    </div>`,

  s_credits: () => `
    <div class="ms-full ms-page">
      ${back('クレジット')}
      <div class="ms-scroll ms-credits">
        <div class="ms-logo small">${logo()}</div>
        ${[['企画・ゲームデザイン', ['いぶ']], ['プログラム', ['いぶ', 'Claude（Anthropic）']], ['グラフィック', ['いぶ']], ['サウンド', ['いぶ']], ['フォント', ['DotGothic16（Fontworks）', 'Press Start 2P（CodeMan38）', 'どちらも SIL Open Font License']], ['ランキング', ['Firebase（Google）']], ['スペシャルサンクス', ['遊んでくれたあなた']]]
          .map(([k, vs]) => m(`クレジット：${k}`, `<small>${k}</small>${vs.map((v) => `<b>${v}</b>`).join('')}`, 'ms-cblock')).join('')}
      </div>
    </div>`,

  // 準備中（オンライン・着せ替え・ガチャ・ランキング・ミッション）
  s_soon: (st) => `
    <div class="ms-full ms-page">
      ${back(st.title || 'オンライン')}
      <div class="ms-soonpg">
        ${m('準備中の絵', px('M2 0h4v1h1v1h1v4H7v1H6v1H2V7H1V6H0V2h1V1h1zM3 2v3h2V2zM3 6v1h2V6z'), 'ms-soonicon')}
        ${m('準備中の見出し', '準備中', 'ms-rtitle gold')}
        ${m('準備中の説明', `${st.title === 'オンライン' || !st.title ? 'みんなと遊べるようになる予定です。' : `${st.title}は、いま作っています。`}<br>もうしばらくお待ちください。`, 'ms-dtext')}
      </div>
    </div>`,
};
SCREENS.s_online = (st, d) => SCREENS.s_soon({ ...st, title: 'オンライン' }, d);

function slider(v, off, a) { return `<div class="ms-bar slider${off ? ' off' : ''}" ${act(a)}><i style="width:${v}%"></i></div>`; }
export function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// ---------- 着せ替えの品の小さな絵 ----------
const RARE_CLS = { start: 'r-n', N: 'r-n', R: 'r-r', SR: 'r-sr', SSR: 'r-ssr', lock: 'r-lock' };
const RARE_LABEL = { start: '', N: 'N', R: 'R', SR: 'SR', SSR: 'SSR' };
// 色のセット・背景の絵は、本物のゲームの描き方で描いた画像を使う（skinshot.js）
const shot = (setId, bgId, cls = '') => `<img class="ms-shot ${cls}" src="${skinImage(setId, bgId)}" alt="">`;
// 写真のアイコン：自分で選んだ写真（端末に保存した小さな画像）。選ぶまではカメラの絵
let PHOTO = null;
export function setPhoto(url) { PHOTO = url || null; }
export function avatarHtml(it) {
  if (it.photo && PHOTO) return `<img class="ms-avphoto" src="${PHOTO}" alt="">`;
  if (it.art) return `<span class="ms-avsvg px">${iconArtSvg(it.id)}</span>`;
  // ボス・敵・分身：ゲームと同じ描き方で描いた絵
  const unit = it.boss || it.enemy || it.unit;
  if (unit) return `<img class="ms-avimg" src="${unitImage(unit)}" alt="">`;
  return glyphSvg(it.glyph);
}
// 最初から持っているアイコン（★◆●▲♥☾）：文字で書くと字の形によって中心がずれるので、
//   真ん中がそろうドットの絵にする（11×11。色は文字と同じ）
const GLYPH_PX = {
  '★': ['.....#.....', '....###....', '....###....', '###########', '.#########.', '..#######..', '...#####...', '...#####...', '..###.###..', '..##...##..', '.#.......#.'],
  '◆': ['.....#.....', '....###....', '...#####...', '..#######..', '.#########.', '###########', '.#########.', '..#######..', '...#####...', '....###....', '.....#.....'],
  '●': ['...#####...', '.#########.', '.#########.', '###########', '###########', '###########', '###########', '###########', '.#########.', '.#########.', '...#####...'],
  '▲': ['.....#.....', '.....#.....', '....###....', '....###....', '...#####...', '...#####...', '..#######..', '..#######..', '.#########.', '.#########.', '###########'],
  '♥': ['.###...###.', '#####.#####', '###########', '###########', '###########', '.#########.', '..#######..', '...#####...', '....###....', '.....#.....', '...........'],
  '☾': ['...####....', '..####.....', '.####......', '.###.......', '####.......', '####.......', '####.......', '.###.......', '.####......', '..####.....', '...####....'],
};
const glyphCache = {};
function glyphSvg(c) {
  const px = GLYPH_PX[c];
  if (!px) return c;
  if (glyphCache[c]) return glyphCache[c];
  // 絵のある範囲の真ん中を、枠の真ん中に合わせる
  let x0 = 99, x1 = -1, y0 = 99, y1 = -1, rects = '';
  px.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] === '#') { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); rects += `<rect x="${x}" y="${y}" width="1.02" height="1.02"/>`; } });
  const cx = (x0 + x1 + 1) / 2, cy = (y0 + y1 + 1) / 2, S = 13;
  return (glyphCache[c] = `<span class="ms-avsvg ms-glyph"><svg viewBox="${cx - S / 2} ${cy - S / 2} ${S} ${S}" shape-rendering="crispEdges" fill="currentColor">${rects}</svg></span>`);
}
// 品の小さな絵（ガチャ結果・着せ替えの一覧）
function itemThumb(it) {
  if (it.kind === 'set') return shot(it.id, 'grid');
  if (it.kind === 'frame') return `<span class="ms-frbox">${frameHtml(it, `<span class="ms-avatar">${avatarHtml(AVATAR_ITEMS[0])}</span>`)}</span>`;
  if (it.kind === 'title') return `<span class="ms-ttlbox">${titleChip(it)}</span>`;
  if (it.kind === 'pop') return `<img class="ms-shot" src="${popImage(it.id)}" alt="">`;
  if (it.kind === 'bg') return `<img class="ms-shot bgshot" src="${bgImage(it.id)}" alt="">`;   // 背景は、背景だけを広めに描いた絵
  return `<span class="ms-avatar">${avatarHtml(it)}</span>`;
}
// 着せ替えの上の見本：タブごとに、その品だけがよく見える絵にする
//   色のセット＝ゲームの場面（その色で）、背景＝背景だけ、アイコン＝アイコンを大きく（いまの枠つき）、エフェクト＝はじける様子
function skinPreview(tab, cur, set, bg, d) {
  if (tab === 'pop') return `<img class="ms-shot" src="${popImage(cur.id)}" alt="">`;
  if (tab === 'bg') return `<img class="ms-shot bgshot" src="${bgImage(cur.id)}" alt="">`;
  if (tab === 'icon') return `<span class="ms-pvicon">${frameHtml(frameOf((d.equip || {}).frame), `<span class="ms-avatar">${avatarHtml(cur)}</span>`)}</span>`;
  if (tab === 'frame') { const ic = AVATAR_ITEMS.find((x) => x.id === (d.equip || {}).icon) || AVATAR_ITEMS[0]; return `<span class="ms-pvicon">${frameHtml(cur, `<span class="ms-avatar">${avatarHtml(ic)}</span>`)}</span>`; }
  return shot(set.id, bg.id);
}
const KIND_NAME = { set: '色のセット', bg: '背景', icon: 'アイコン', pop: 'エフェクト', title: '称号', frame: 'アイコン枠' };
function itemCell(it, { owned = true, equipped = false, picked = false, isNew = false, name, a } = {}) {
  if (!owned) return m(name || `まだ持っていない：${it.name}`, '<b>？</b>', 'ms-scell r-lock', 'button');
  return m(name || `${KIND_NAME[it.kind]}：${it.name}`, `<span class="ms-thumb ${it.kind}">${itemThumb(it)}</span>${(it.kind === 'icon' || it.kind === 'frame') && it.rarity === 'start' ? '' : `<small>${it.name}</small>`}${RARE_LABEL[it.rarity] ? `<span class="ms-rare">${RARE_LABEL[it.rarity]}</span>` : ''}${equipped ? '<span class="ms-equip">装備中</span>' : ''}${isNew ? '<span class="ms-newtag">NEW</span>' : ''}`,
    `ms-scell ${RARE_CLS[it.rarity]}${picked ? ' picked' : ''}${it.rarity === 'SSR' && isNew ? ' shine' : ''}`, 'button', `${a ? act(a) : ''} data-zoom="${it.kind}:${it.id}"`);
}

// ---------- 品を押すと、大きく見せる ----------
//   ガチャ結果・品の一覧：押すとすぐ大きく。着せ替え：選んである品をもう一度押すか、上の見本を押すと大きく
const ZOOM_LIST = { set: SETS_ALL(), bg: BGS_ALL(), icon: ICONS_ALL(), pop: POP_STYLES.map((x) => ({ ...x, kind: 'pop' })), title: TITLES.map((x) => ({ ...x, kind: 'title' })), frame: FRAMES.map((x) => ({ ...x, kind: 'frame' })) };
function SETS_ALL() { return COLOR_SETS.map((x) => ({ ...x, kind: 'set' })); }
function BGS_ALL() { return BACKGROUNDS.map((x) => ({ ...x, kind: 'bg' })); }
function ICONS_ALL() { return AVATAR_ITEMS.map((x) => ({ ...x, kind: 'icon' })); }
export function showZoom(kind, id, stage = document.getElementById('stage')) {
  const it = (ZOOM_LIST[kind] || []).find((x) => x.id === id);
  if (!it) return;
  const big = kind === 'set' ? `<img class="ms-zimg" src="${skinImage(it.id, 'grid')}" alt="">`
    : kind === 'frame' ? `<span class="ms-zfr">${frameHtml(it, `<span class="ms-avatar ms-zav">${avatarHtml(AVATAR_ITEMS[0])}</span>`)}</span>`
    : kind === 'title' ? `<span class="ms-zttl">${titleChip(it)}</span>`
    : kind === 'pop' ? `<img class="ms-zimg bgshot" src="${popImage(it.id)}" alt="">`
    : kind === 'bg' ? `<img class="ms-zimg bgshot" src="${bgImage(it.id)}" alt="">`
    : `<span class="ms-avatar ms-zav">${avatarHtml(it)}</span>`;
  const el = document.createElement('div');
  el.className = 'ms-zoom';
  el.innerHTML = `<div class="ms-zbox ${RARE_CLS[it.rarity]}">${big}<div class="ms-zname">${RARE_LABEL[it.rarity] ? `<span class="ms-rare">${RARE_LABEL[it.rarity]}</span>` : ''}${it.kind === 'icon' && it.rarity === 'start' ? 'アイコン' : it.name}</div><small>${KIND_NAME[kind]}</small></div>`;
  el.addEventListener('click', (e) => { e.stopPropagation(); el.remove(); });
  stage.appendChild(el);
  snapIcons(el);
}
export function initZoom() {
  document.addEventListener('click', (e) => {
    if (document.body.classList.contains('marking')) return;
    const box = e.target.closest('.ms-skinbox');
    if (box) { const p = document.querySelector('.ms-scell.picked[data-zoom]'); if (p) { const [k, id] = p.dataset.zoom.split(':'); showZoom(k, id); } return; }
    const el = e.target.closest('[data-zoom]');
    if (!el || el.closest('.ms-zoom')) return;
    if (el.dataset.act && !el.classList.contains('picked')) return;   // 着せ替え：まだ選んでいない品は、まず選ぶ
    const [k, id] = el.dataset.zoom.split(':');
    // 着せ替えで選ぶ操作と重ならないよう、少しあとに開く
    setTimeout(() => showZoom(k, id), 0);
  });
}

// ---------- ガチャの品の見本（種類ごとに全部並べる） ----------
export const ITEM_TABS = [['s_items_set', '色のセット'], ['s_items_bg', '背景'], ['s_items_icon', 'アイコン'], ['s_items_pop', 'エフェクト'], ['s_items_title', '称号'], ['s_items_frame', 'アイコン枠']];
const itemList = (title, list, cols) => `
    <div class="ms-full ms-page">
      <div class="ms-head"><div class="ms-title">${title}（${list.filter((x) => x.rarity !== 'start').length}）</div></div>
      <div class="ms-scroll">${['SSR', 'SR', 'R', 'N'].map((r) => `
        <p class="ms-itemhead ${RARE_CLS[r]}">${r}（${list.filter((x) => x.rarity === r).length}）</p>
        <div class="ms-sgrid ms-itemgrid c${cols}">${list.filter((x) => x.rarity === r).map((it) => itemCell(it, { name: `${title}：${it.name}` })).join('')}</div>`).join('')}
      </div>
    </div>`;
SCREENS.s_items_icon = () => itemList('アイコン', ICONS, 4);
SCREENS.s_items_set = () => itemList('色のセット', SETS, 3);
SCREENS.s_items_bg = () => itemList('背景', BGS, 3);
SCREENS.s_items_pop = () => itemList('エフェクト', POPS, 3);
SCREENS.s_items_title = () => itemList('称号', TTLS, 3);
SCREENS.s_items_frame = () => itemList('アイコン枠', FRMS, 4);

// ガチャの演出で、割れた玉から出てくる品（gachafx.js が使う）
export const gachaCell = (it, isNew) => itemCell(it, { isNew, name: `ガチャの演出：${it.name}` });

// ---------- 見本だけの画面（中身が決まったら、本物の画面にする） ----------
const SETS = COLOR_SETS.map((x) => ({ ...x, kind: 'set' }));
const BGS = BACKGROUNDS.map((x) => ({ ...x, kind: 'bg' }));
const ICONS = AVATAR_ITEMS.map((x) => ({ ...x, kind: 'icon' }));
const POPS = POP_STYLES.map((x) => ({ ...x, kind: 'pop' }));
const TTLS = TITLES.map((x) => ({ ...x, kind: 'title' }));
const FRMS = FRAMES.map((x) => ({ ...x, kind: 'frame' }));
Object.assign(SCREENS, {
  s_skin: (st, d) => {
    const tab = st.skinTab || 'icon';
    const owned0 = { pop: ['std'], ...(d.owned || { set: ['std', 'crimson', 'mono', 'neon', 'gold'], bg: ['grid', 'plain', 'stars', 'city'], icon: ['a0', 'a1', 'a2', 'a3', 'a4', 'a5', 'note', 'snow', 'crown', 'b_core'], pop: ['std', 'petal', 'firework'] }) };
    const owned = { ...owned0, frame: ['f_none', ...(owned0.frame || [])] };
    const eq = { pop: 'std', frame: 'f_none', ...(d.equip || { set: 'std', bg: 'grid', icon: 'a0' }) };
    eq.frame = eq.frame || 'f_none';
    const pick = { pop: eq.pop, frame: eq.frame, ...(st.pick || { set: 'neon', bg: 'city', icon: 'crown', pop: 'petal' }) };
    pick.frame = pick.frame || 'f_none';
    const list = tab === 'set' ? SETS : tab === 'bg' ? BGS : tab === 'pop' ? POPS : tab === 'frame' ? FRMS : ICONS;
    const pickedSet = SETS.find((x) => x.id === (tab === 'set' ? pick.set : eq.set)), pickedBg = BGS.find((x) => x.id === (tab === 'bg' ? pick.bg : eq.bg));
    const cur = list.find((x) => x.id === pick[tab]);
    return `
    <div class="ms-full ms-page">
      ${pageHead('着せ替え', d)}
      ${m('着せ替えの見本', `<div class="ms-skinpv ${tab}">${skinPreview(tab, cur, pickedSet, pickedBg, d)}</div><div class="ms-skinname">${cur.rarity === 'start' && tab === 'icon' ? 'アイコン' : cur.name}${cur.rarity === 'start' && tab === 'icon' ? '' : `<small>${RARE_LABEL[cur.rarity] ? RARE_LABEL[cur.rarity] + '・' : ''}${KIND_NAME[tab]}</small>`}${tab === 'icon' && cur.photo && owned.icon.includes(cur.id) ? m('写真を選ぶ', d.photo ? '写真を選びなおす' : '写真を選ぶ', 'btn btn-small btn-sub ms-photobtn', 'button', act('photo-pick')) : ''}</div>`, 'ms-skinbox')}
      ${tabs(['アイコン', 'アイコン枠', '色のセット', '背景', 'エフェクト'], ['icon', 'frame', 'set', 'bg', 'pop'].indexOf(tab), '着せ替えのタブ', ['skin:icon', 'skin:frame', 'skin:set', 'skin:bg', 'skin:pop'])}
      <div class="ms-scroll"><div class="ms-sgrid ${tab}">
        ${list.map((it) => itemCell(it, { owned: owned[tab].includes(it.id), equipped: eq[tab] === it.id, picked: pick[tab] === it.id, a: `skinpick:${tab}:${it.id}` })).join('')}
      </div></div>
      <div class="ms-foot one">${eq[tab] === pick[tab] ? m('装備中', '装備中', 'btn ms-btn ms-disabled', 'button') : btn('装備する', '', 'equip')}</div>
      ${navBar(d, 'skinopen')}
    </div>`;
  },
  s_gacha: (st, d) => {
    // 看板：まん中に光の玉、そのまわりを SSR の品（色のセット・背景・アイコン・エフェクト・枠）が回る
    const SHOW = ['mono', 'galaxy', 'b_hunter', 'blackhole', 'f_ssr1'];
    const ring = GACHA_POOL.filter((x) => x.rarity === 'SSR' && x.kind !== 'title');
    const orbit = SHOW.map((id) => ring.find((x) => x.id === id)).filter(Boolean);
    while (orbit.length < 5) orbit.push(ring.find((x) => !orbit.includes(x)));
    const pity = d.pity ?? 62, total = GACHA_POOL.length, got = d.gachaGot ?? 37;
    return `
    <div class="ms-full ms-page">
      ${pageHead('ガチャ', { ...d, coins: d.coins ?? 12480 })}
      ${m('ガチャの看板', `<div class="gb-rays"></div><div class="gb-stars"></div>
        <div class="gb-head"><div class="gb-title">ガチャ</div><div class="gb-count">全<b>${total}</b>種</div></div>
        <div class="gb-sub">色・背景・アイコン・エフェクト・称号・アイコン枠</div>
        <div class="gb-stage">
          <div class="gb-orb"><i></i></div>
          <div class="gb-orbit">${orbit.map((it, i) => `<span class="gb-sat" style="--a:${i * 72}deg"><span class="gb-up"><span class="ms-thumb ${it.kind}">${itemThumb(it)}</span></span></span>`).join('')}</div>
        </div>
        <div class="gb-rates">${['SSR', 'SR', 'R', 'N'].map((r) => `<span class="gb-rate ${RARE_CLS[r]}"><span class="ms-rare ${RARE_CLS[r]}">${r}</span><b>${GACHA.rates[r]}%</b></span>`).join('')}</div>`, 'ms-gbanner gb')}
      ${m('集めた品', `<span>集めた品</span>${bar(got / total, 'cyan')}<b>${got}/${total}</b>`, 'ms-progress')}
      ${m('天井（あと何回でSSR確定）', `<span>SSR確定まで</span>${bar(pity / GACHA.pity, 'gold')}<b>あと ${GACHA.pity - pity}回</b>`, 'ms-progress')}
      <div class="ms-gbtns">
        ${st.err ? m('コインが足りない', st.err, 'ms-err ms-gerr') : ''}
        ${m('1回引く', `<span>1回</span><b>${coin}${num(GACHA.price)}</b>`, 'btn ms-gbtn btn-sub', 'button', act('pull:1'))}
        ${m('10回引く', `<span>10回</span><b>${coin}${num(GACHA.price10)}</b><small>SR以上1つ確定</small>`, 'btn ms-gbtn', 'button', act('pull:10'))}
      </div>
      <div class="ms-row center">${m('確率を見る', '確率を見る', 'ms-link', 'button', act('rates'))}</div>
      ${navBar(d, 'gacha')}
    </div>`;
  },
  s_gacharesult: (st, d) => {
    const got = st.got || [GACHA_POOL[4], GACHA_POOL[0], GACHA_POOL[9], GACHA_POOL[15], GACHA_POOL[2], GACHA_POOL[7], GACHA_POOL[10], GACHA_POOL[1], GACHA_POOL[19], GACHA_POOL[12]].map((it, i) => ({ it, isNew: [1, 3, 5, 8].includes(i) }));
    const back10 = st.refund ?? 120;
    return `
    <div class="ms-full ms-page ms-gres">
      ${m('ガチャ結果の見出し', `${got.length}回の結果`, 'ms-rtitle gold')}
      <div class="ms-ggrid${got.length === 1 ? ' one' : ''}">
        ${got.map(({ it, isNew }, i) => itemCell(it, { isNew, name: `ガチャ結果：${i + 1}つ目` })).join('')}
      </div>
      ${back10 ? m('かぶった品の代わり', `<span>持っていた品は、コインに変わった</span>${coin}<b>+${back10}</b>`, 'ms-reward') : ''}
      <div class="ms-foot">${btn('とじる', 'btn-sub', 'back')}${btn(`もう${got.length}回`, '', `pull:${got.length}`)}</div>
    </div>`;
  },
  s_rates: (st, d) => {
    const R = GACHA.rates;
    const per = (r) => GACHA_POOL.filter((x) => x.rarity === r);
    return `
    <div class="ms-full ms-page">
      ${back('確率', d)}
      <div class="ms-scroll">
        ${m('確率の説明', `ガチャの出る確率です。10回引くと、SR以上が1つ必ず出ます。${GACHA.pity}回引いてもSSRが出なかったら、次は必ずSSRが出ます。持っている品が出たときは、コインに変わります。`, 'ms-note')}
        <div class="ms-table">
          ${['SSR', 'SR', 'R', 'N'].map((r) => m(`確率：${r}`, `<span class="ms-rare ${RARE_CLS[r]}">${r}</span><b>${R[r]}%</b>`, 'ms-trow')).join('')}
        </div>
        ${['SSR', 'SR', 'R', 'N'].map((r) => `<div class="ms-sec">${r}（1つあたり ${(R[r] / per(r).length).toFixed(2)}%）</div>
          <div class="ms-table">${per(r).map((it) => m(`確率：${it.name}`, `<span>${it.name}</span><small>${KIND_NAME[it.kind]}</small>`, 'ms-trow')).join('')}</div>`).join('')}
      </div>
    </div>`;
  },
  s_ranking: (st, d) => {
    const tab = st.rtab || 'week';
    const R = d.ranking || RANK_MOCK[tab];
    // 他の人の「写真」アイコンは、その人の写真はここにないので、カメラの絵で出す
    const icon = (e) => { const it = AVATAR_ITEMS.find((x) => x.id === e.icon) || AVATAR_ITEMS[0]; return it.photo && !(d.ranking && e.uid && R.me && e.uid === R.me.uid) && d.ranking ? { ...it, photo: false } : it; };
    const av = (e, cls = '') => frameHtml(frameOf(e.frame), `<span class="ms-avatar ${cls}">${avatarHtml(icon(e))}</span>`);
    const top = R.list.slice(0, 3), rest = R.list.slice(3);
    // 開発者：本物のランキングでは、行を押すと記録を直せる
    const ed = (e) => (d.dev && d.ranking && e.uid ? act(`rkedit:${e.uid}`) : '');
    const row = (e, me = false) => m(me ? '自分の順位' : `順位の行：${e.rank}位`, `<span class="ms-rank">${e.rank ?? '-'}</span>${av(e, 'sm')}<span class="ms-rname">${titleChip(titleOf(e.title), 'sm')}<b>${esc(e.name)}${me ? '（あなた）' : ''}</b></span><span class="ms-rph">P${e.phase}</span><b class="ms-rsc">${num(e.score)}</b>`, `ms-rrow${me ? ' me' : ''}`, 'div', ed(e));
    return `
    <div class="ms-full ms-page">
      ${pageHead('ランキング', d)}
      ${tabs(['今週', '全期間'], tab === 'week' ? 0 : 1, 'ランキングのタブ', ['rtab:week', 'rtab:all'])}
      ${m('集計の期間', tab === 'week' ? `${R.period || '11/17（月）〜 11/23（日）'}　毎週月曜の朝4時に入れかわります` : 'これまでの1回の最高スコア', 'ms-period')}
      ${R.list.length ? `
      <div class="ms-podium">
        ${[1, 0, 2].filter((i) => top[i]).map((i) => m(`表彰台：${i + 1}位`, `${av(top[i])}${titleChip(titleOf(top[i].title), 'sm')}<b>${esc(top[i].name)}</b><span>${num(top[i].score)}</span><div class="ms-step">${i + 1}</div>`, `ms-pod p${i + 1}`, 'div', ed(top[i]))).join('')}
      </div>
      <div class="ms-scroll">${rest.map((e) => row(e)).join('')}</div>` : `<div class="ms-none">${R.error || 'まだ記録がありません'}</div>`}
      ${R.me ? row(R.me, true) : !R.list.length ? '' : m('自分の順位', '<span class="ms-rname">まだ記録がありません</span>', 'ms-rrow me none')}
      ${navBar(d, 'ranking')}
      ${st.rk ? `<div class="ms-dim ms-ttlsheet">
        <div class="box ms-dialog">
          ${m('記録を直す見出し', '記録を直す（開発者）', 'ms-dtitle')}
          ${m('記録を直す説明', `${esc(st.rk.name)} の${tab === 'week' ? '今週' : '全期間'}の記録`, 'ms-dtext')}
          ${[['name', '名前', 'text'], ['score', 'スコア', 'number'], ['phase', 'フェーズ', 'number']].map(([k, label, type]) => m(`記録の${label}`, `<span>${label}</span><input class="ms-rkin" data-k="${k}" type="${type}" inputmode="${type === 'number' ? 'numeric' : 'text'}" value="${esc(st.rk.draft[k])}">`, 'ms-rkrow')).join('')}
          ${st.rk.msg ? m('記録を直すお知らせ', esc(st.rk.msg), 'ms-dtext ms-rkmsg') : ''}
          ${st.rk.busy ? m('記録を直している', '送っています…', 'ms-dtext') : btn('保存する', 'wide', 'rksave') + btn(st.rk.confirm ? '本当に消す（戻せません）' : 'この記録を消す', 'wide btn-danger', 'rkdel') + btn('やめる', 'wide btn-sub', 'rkclose')}
        </div>
      </div>` : ''}
    </div>`;
  },
  s_mission: (st, d) => {
    const tab = st.mtab || 'daily';
    const M = d.missions || MISSION_MOCK;
    const row = (name, text, a, b, r, state, extra = '') => m(`ミッション：${name}`, `<div class="ms-mt"><b>${text}</b>${bar(Math.min(1, a / b), state === 'got' ? 'dim' : state === 'ready' ? 'gold' : 'cyan')}<small>${extra || `${num(Math.min(a, b))}/${num(b)}`}</small></div><div class="ms-mr">${coin}<span>${r}</span></div>${state === 'ready' ? btn('受け取る', 'ms-get', `mget:${name}`) : state === 'got' ? '<span class="ms-yet got">受け取り<br>済み</span>' : '<span class="ms-yet">未達成</span>'}`, `ms-mrow ${state}`);
    const body = tab === 'daily' ? `
        ${M.daily.map((x) => row(`d_${x.id}`, x.text, x.now, x.goal, x.coins, x.state, x.unit === 'min' ? `${Math.floor(Math.min(x.now, x.goal) / 60)}/${x.goal / 60}分` : '')).join('')}
        ${row('d_bonus', '3つ全部達成する（ボーナス）', M.daily.filter((x) => x.state !== 'yet').length, 3, DAILY_BONUS, M.bonus)}`
      : ACHIEVEMENTS.map((A) => {
        const p = M.ach[A.id] || { now: 0, got: 0 };
        const k = Math.min(p.got, A.tiers.length - 1), [goal, c] = A.tiers[k], all = p.got >= A.tiers.length;
        const state = all ? 'got' : p.now >= goal ? 'ready' : 'yet';
        return row(`a_${A.id}`, `${A.text.replace('{n}', fmtN(goal))}<em>${Math.min(p.got + 1, A.tiers.length)}/${A.tiers.length}段階</em>`, p.now, goal, c, state);
      }).join('');
    // 受け取れるものがあるか（タブごと）。タブにも赤い点を出す
    const readyD = M.daily.some((x) => x.state === 'ready') || M.bonus === 'ready';
    const readyA = ACHIEVEMENTS.some((A) => { const p = M.ach[A.id] || { now: 0, got: 0 }; return p.got < A.tiers.length && p.now >= A.tiers[p.got][0]; });
    const ready = tab === 'daily' ? readyD : readyA;
    return `
    <div class="ms-full ms-page">
      ${pageHead('ミッション', d)}
      ${tabs(['デイリー', '実績'], tab === 'daily' ? 0 : 1, 'ミッションのタブ', ['mtab:daily', 'mtab:ach']).replace('>デイリー<', `>デイリー${readyD ? '<i class="ms-navdot ms-tabdot"></i>' : ''}<`).replace('>実績<', `>実績${readyA ? '<i class="ms-navdot ms-tabdot"></i>' : ''}<`)}
      ${tab === 'daily' ? m('次の入れかえまで', `朝4時に入れかわります　あと ${M.left || '16:42:10'}`, 'ms-period') : ''}
      <div class="ms-scroll">${body}</div>
      <div class="ms-foot">${ready ? btn('まとめて受け取る', 'wide', 'mgetall') : m('まとめて受け取る', 'まとめて受け取る', 'btn wide ms-btn ms-disabled', 'button')}</div>
      ${navBar(d, 'mission')}
    </div>`;
  },
});

// ---------- 音の見本（押すと鳴る） ----------
function soundBoard(title, items, note) {
  return `
    <div class="ms-full ms-page">
      <div class="ms-head"><div class="ms-title">${title}</div></div>
      ${m('音の見本の説明', note, 'ms-note')}
      <div class="ms-scroll"><div class="ms-sndgrid">
        ${items.map(([id, label, icon]) => m(`音：${label}`, `${icon ? `<span class="ms-chip">${iconSvg(icon)}</span>` : '<span class="ms-sndicon">♪</span>'}<small>${label}</small>`, 'ms-snd', 'button', act(`snd:${id}`))).join('')}
      </div></div>
    </div>`;
}
SCREENS.s_snd_bgm = () => `
    <div class="ms-full ms-page">
      <div class="ms-head"><div class="ms-title">BGM</div></div>
      ${m('BGMの説明', '押すと流れ、もう一度押すと止まります。別の曲を押すと、少しずつ切りかわります。', 'ms-note')}
      <div class="ms-scroll"><div class="ms-bgmlist">
        ${SONG_LIST.map(([id, label]) => m(`曲：${label}`, `<span class="ms-sndicon">${bgmNow() === id ? '■' : '▶'}</span><b>${label}</b>`, `ms-bgm${bgmNow() === id ? ' on' : ''}`, 'button', act(`bgm:${id}`))).join('')}
        ${m('ラスボスの曲の激しさ', `<small>ラスボスの曲の激しさ（終筆の段階）</small><div class="ms-flv">${[1, 2, 3].map((n) => `<button class="${finalLevelNow() === n ? 'on' : ''}" data-act="flv:${n}">${n}</button>`).join('')}</div>`, 'ms-flvrow')}
      </div></div>
    </div>`;
SCREENS.s_snd_common = () => soundBoard('効果音（共通）', COMMON_SOUNDS, '押すと鳴ります。気になる音は、印モードで印を付けて一言を書いてください。');
for (const r of SKILL_ROADS) SCREENS[`s_snd_${r.id}`] = () => soundBoard(`効果音（${r.name}）`, r.skills.map((k) => [`sk_${k.id}`, k.name, `sk_${k.id}`]), 'スキルが発動したとき・当たったときの音です。スキルごとに違う音にしています。');

// 1つの画面の中身を作る（menus.js も使う）
export function screenHtml(id, st, d) {
  return `<div class="mock-frame">${SCREENS[id](st, d)}</div>`;
}

// ---------- 見本（調整パネル → 見本 → 画面づくり） ----------
export function createScreens() {
  const stage = document.getElementById('stage');
  const root = document.createElement('div');
  root.id = 'mock';
  root.className = 'mock';
  stage.appendChild(root);
  const st = { id: null, page: 0 };
  const data = { ...MOCK, mock: true, newsNew: 2 };

  function render() {
    root.innerHTML = screenHtml(st.id, st, data);
    snapIcons(root);
    // 遊び方：前へ・次へで絵を切りかえる（見本の中だけ）
    root.querySelectorAll('[data-act="howto-next"],[data-act="howto-prev"]').forEach((b) => b.addEventListener('click', () => {
      if (document.body.classList.contains('marking')) return;
      st.page = Math.max(0, Math.min(3, st.page + (b.dataset.act === 'howto-next' ? 1 : -1)));
      render();
    }));
    // 音の見本：押すと鳴る（印モードの間は鳴らさない）
    root.querySelectorAll('[data-act^="snd:"]').forEach((b) => b.addEventListener('click', () => {
      if (document.body.classList.contains('marking')) return;
      playSound(b.dataset.act.slice(4), { force: true });
      b.classList.remove('playing'); void b.offsetWidth; b.classList.add('playing');
    }));
    // BGMの見本：押すと流れる・もう一度で止まる。ほかの画面へ移ったら止める
    if (st.id !== 's_snd_bgm' && bgmNow()) stopBgm(0.6);
    root.querySelectorAll('[data-act^="flv:"]').forEach((b) => b.addEventListener('click', () => { setFinalLevel(+b.dataset.act.slice(4)); render(); }));
    root.querySelectorAll('[data-act^="bgm:"]').forEach((b) => b.addEventListener('click', () => {
      if (document.body.classList.contains('marking')) return;
      const id = b.dataset.act.slice(4);
      if (bgmNow() === id) stopBgm(1.2); else playBgm(id, { fade: 2.5, force: true });
      render();
    }));
    // 着せ替え：タブと品を選ぶ（見本の中だけ）
    // ランキング：タブを切りかえる（見本の中だけ）
    root.querySelectorAll('[data-act^="rtab:"]').forEach((b) => b.addEventListener('click', () => {
      if (document.body.classList.contains('marking')) return;
      st.rtab = b.dataset.act.slice(5); render();
    }));
    // ミッション：タブを切りかえる（見本の中だけ）
    root.querySelectorAll('[data-act^="mtab:"]').forEach((b) => b.addEventListener('click', () => {
      if (document.body.classList.contains('marking')) return;
      st.mtab = b.dataset.act.slice(5); render();
    }));
    root.querySelectorAll('[data-act^="skin:"],[data-act^="skinpick:"]').forEach((b) => b.addEventListener('click', () => {
      if (document.body.classList.contains('marking')) return;
      const [c, a1, a2] = b.dataset.act.split(':');
      if (c === 'skin') st.skinTab = a1; else st.pick = { ...(st.pick || { set: 'neon', bg: 'city', icon: 'crown' }), [a1]: a2 };
      render();
    }));
  }
  function show(id) {
    if (!SCREENS[id]) { hide(); return; }
    if (st.id !== id) st.page = 0;
    st.id = id;
    render();
    root.classList.add('show');
    stage.classList.toggle('mock-full', FULL.has(id));
    stage.classList.toggle('mock-over', !FULL.has(id));
    // 見本の帯は舞台の外（下）に出したので、画面は縮めずにそのまま見せる
    root.style.setProperty('--fit', '1');
  }
  function hide() {
    st.id = null;
    if (bgmNow()) stopBgm(0.6);
    root.classList.remove('show');
    root.innerHTML = '';
    stage.classList.remove('mock-full', 'mock-over');
  }
  return { show, hide, get id() { return st.id; } };
}
