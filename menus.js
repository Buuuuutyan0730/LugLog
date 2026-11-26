// ゲームの外の画面の切りかえ担当（ホーム・遊び方・一時停止・設定・結果・図鑑・プロフィール・名前・お知らせ・クレジット・準備中）
//   見た目は screens.js。押した部品の data-act を見て、何をするか決める
import { screenHtml, FULL, NEWS, SRC_INFO, esc, setPhoto, HOWTO_LAST } from './screens.js?v=20261126180136';
import { snapIcons } from './icons.js?v=20261126180136';
import { writeSave } from './save.js?v=20261126180136';
import { GACHA, rollGacha, AVATAR_ITEMS } from './skins.js?v=20261126180136';
import { playSound } from './audio.js?v=20261126180136';
import { createGachaFx } from './gachafx.js?v=20261126180136';
import { titleOf } from './titles.js?v=20261126180136';
import { frameOf } from './frames.js?v=20261126180136';
import { ensureDaily, missionView, claim, claimAll, hasClaimable, addPulls } from './missions.js?v=20261126180136';
import { loadRanking, syncProfile, weekLabel, claimDev, wipeRemote, adminSetScore, adminDeleteScore } from './online.js?v=20261126180136';
import { SKILL_ROADS } from './skilldefs.js?v=20261126180136';
import { GACHA_POOL } from './skins.js?v=20261126180136';

// 開発者の合言葉（そのものは入れず、元に戻せない形に変えたものだけ持つ）
const DEV_HASH = 'ccbc9cbb683d9ddc70bdf3f8593ed2da10ee301d12fa86cae5cba5f08d12e266', DEV_LEN = 9;
async function isDevKey(v) {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('luglog-dev:' + v));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('') === DEV_HASH;
  } catch { return false; }
}

export function createMenus(save, hooks) {
  const stage = document.getElementById('stage');
  const root = document.createElement('div');
  root.id = 'menu';
  root.className = 'menu';
  stage.appendChild(root);
  const gfx = createGachaFx(stage);   // ガチャの演出（光の玉）

  // 持っているガチャの品の数（実績で使う）
  // ランキング：読みこんだものを、タブごとに覚えておく（開くたびに読みなおす）
  const rank = {};
  function loadRank(tab) {
    if (!rank[tab]) rank[tab] = { list: [], me: null, error: '読みこみ中…' };
    loadRanking(tab).then((r) => { rank[tab] = r; }, (e) => { if (!rank[tab].list.length) rank[tab] = { list: [], me: null, error: `ランキングにつながりません。電波のよいところで、もう一度開いてください<small class="ms-why">${String((e && (e.code || e.message)) || 'unknown').replace(/[<>&]/g, '').slice(0, 80)}</small>` }; })
      .then(() => { if (id === 's_ranking' && (st.rtab || 'week') === tab) render(); });
  }
  // 名前・アイコン・枠・称号を変えたら、ランキングの表示も変える（つながらなければ何もしない）
  let syncT = 0;
  function sync() { clearTimeout(syncT); syncT = setTimeout(() => syncProfile(save).catch(() => {}), 1500); }
  const ownedCount = (sv) => GACHA_POOL.filter((it) => (sv.owned[it.kind] || []).includes(it.id)).length;
  let id = null;            // 今の画面（null：ゲーム中）
  let st = {};              // その画面の中の状態
  const history = [];       // 戻る先

  const data = () => ({
    ...save,
    newsNew: st.newsNew ?? Math.max(0, NEWS.length - (save.newsRead || 0)),
    pause: hooks.pauseInfo ? hooks.pauseInfo() : { phase: 1, time: 0 },
    result: st.result || (history.find((h) => h.st.result) || {}).st?.result,
    ztab: st.ztab || 'skill',
    iconItem: AVATAR_ITEMS.find((x) => x.id === save.equip.icon) || AVATAR_ITEMS[0],
    titleItem: titleOf(save.equip.title),
    frameItem: frameOf(save.equip.frame),
    missions: id === 's_mission' ? missionView(save, ownedCount) : null,
    ranking: id === 's_ranking' ? { ...(rank[st.rtab || 'week'] || { list: [], me: null, error: '読みこみ中…' }), period: weekLabel() } : null,
    missionDot: ['s_home', 's_skin', 's_gacha', 's_ranking', 's_zukan', 's_mission'].includes(id) ? (ensureDaily(save, SKILL_ROADS), hasClaimable(save, ownedCount)) : false,
    zitem: st.zitem,
    gachaGot: id === 's_gacha' ? ownedCount(save) : null,
  });

  function render() {
    if (!id) { root.innerHTML = ''; root.classList.remove('show'); stage.classList.remove('menu-full'); return; }
    root.innerHTML = screenHtml(id, st, data());
    root.classList.add('show');
    stage.classList.toggle('menu-full', FULL.has(id));
    snapIcons(root);
    // ランキングの記録を直す（開発者）：入力欄の中身を覚えておく
    if (id === 's_ranking' && st.rk) {
      root.querySelectorAll('.ms-rkin').forEach((inp) => inp.addEventListener('input', () => { st.rk.draft[inp.dataset.k] = inp.value; }));
    }
    if (id === 's_name') {
      const inp = root.querySelector('.ms-nameinput');
      const cnt = root.querySelector('.ms-namecount');
      inp.addEventListener('input', () => { st.draft = inp.value; cnt.textContent = `${[...inp.value].length}/10`; });
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') doAct('name-ok'); });
      setTimeout(() => { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }, 50);
    }
  }

  // 画面を開く。keep：今の画面を「戻る先」に積む
  function open(next, nextSt = {}, keep = true) {
    if (keep && id) history.push({ id, st });
    id = next; st = nextSt;
    render();
  }
  function back() {
    const h = history.pop();
    if (h) { id = h.id; st = h.st; render(); } else close();
  }
  function close() { id = null; st = {}; history.length = 0; render(); }
  function home() { history.length = 0; open('s_home', {}, false); }

  function setSetting(k, v) {
    save.settings[k] = v;
    writeSave(save);
    hooks.applySettings(save.settings);
    render();
  }

  function finishName(v) {
    const first = !save.name;
    save.name = v; writeSave(save); sync();
    if (first) home(); else back();
  }
  function doAct(a) {
    const [cmd, arg, arg2] = a.split(':');
    switch (cmd) {
      case 'back': back(); break;
      // 下のタブ：どのページからでも、ホームの上に1枚だけ開く（戻るとホーム）
      case 'nav':
        if (arg === 'home') { home(); break; }
        history.length = 0; history.push({ id: 's_home', st: {} }); id = null;
        doAct(arg);
        break;
      case 'start':
        // はじめてプレイを押したときだけ、先にチュートリアルを遊ぶ（終わるとそのまま本番）
        if (!save.tutoDone) { history.length = 0; hooks.tutorial(); }
        else hooks.start();
        break;
      case 'howto': open('s_howto', { page: 0 }); break;
      case 'tutorial': history.length = 0; hooks.tutorial(); break;   // 遊び方の「チュートリアルを遊ぶ」
      case 'howto-next': st.page = Math.min(HOWTO_LAST, (st.page || 0) + 1); render(); break;
      case 'howto-prev': st.page = Math.max(0, (st.page || 0) - 1); render(); break;
      case 'howto-end':
        if (!save.howtoDone) { save.howtoDone = true; writeSave(save); }
        if (st.thenPlay) { history.length = 0; hooks.start(); } else if (history.length) back(); else home();
        break;
      case 'soon': open('s_soon', { title: arg }); break;
      case 'zukan': open('s_zukan', { ztab: 'skill' }); break;
      // ミッション
      case 'mission': ensureDaily(save, SKILL_ROADS); writeSave(save); open('s_mission', { mtab: 'daily' }); break;
      case 'mtab': st.mtab = arg; render(); break;
      case 'mget': { const c = claim(save, a.slice(5), ownedCount); if (c) { writeSave(save); playSound('coin'); } render(); break; }
      case 'mgetall': { const c = claimAll(save, st.mtab || 'daily', ownedCount); if (c) { writeSave(save); playSound('coin'); } render(); break; }
      case 'ztab': st.ztab = arg; render(); root.querySelector('.ms-scroll')?.scrollTo(0, 0); break;
      case 'zitem': open('s_zukan2', { zitem: { kind: arg, id: arg2 } }); break;
      case 'profile': open('s_profile'); break;
      case 'icon': save.equip.icon = arg; writeSave(save); sync(); render(); break;
      case 'frame': save.equip.frame = arg; writeSave(save); sync(); render(); break;
      case 'ttl': save.equip.title = arg === 'none' ? '' : arg; writeSave(save); sync(); st.ttlOpen = false; render(); break;
      case 'ttlopen': st.ttlOpen = true; render(); break;
      // ランキングの記録を直す・消す（開発者だけ）
      case 'rkedit': {
        const R = rank[st.rtab || 'week'];
        const e = R && [...R.list, R.me].find((x) => x && x.uid === arg);
        if (!save.dev || !e) break;
        st.rk = { uid: e.uid, name: e.name, draft: { name: e.name, score: String(e.score), phase: String(e.phase) }, msg: '', confirm: false, busy: false };
        render(); break;
      }
      case 'rkclose': st.rk = null; render(); break;
      case 'rksave': case 'rkdel': {
        const k = st.rk, tab = st.rtab || 'week';
        if (!k || k.busy) break;
        if (cmd === 'rkdel' && !k.confirm) { k.confirm = true; render(); break; }
        let job;
        if (cmd === 'rksave') {
          const name = k.draft.name.trim(), score = Number(k.draft.score), phase = Number(k.draft.phase);
          if (!name || [...name].length > 12) { k.msg = '名前は1〜12文字にしてください'; render(); break; }
          if (!Number.isInteger(score) || score < 0) { k.msg = 'スコアは0以上の整数にしてください'; render(); break; }
          if (!Number.isInteger(phase) || phase < 1 || phase > 150) { k.msg = 'フェーズは1〜150の整数にしてください'; render(); break; }
          job = adminSetScore(tab, k.uid, { name, score, phase });
        } else job = adminDeleteScore(tab, k.uid);
        k.busy = true; k.msg = ''; render();
        job.then(() => { st.rk = null; loadRank(tab); render(); },
          (e) => { k.busy = false; k.confirm = false; k.msg = `できませんでした（${String((e && (e.code || e.message)) || 'unknown').replace(/[<>&]/g, '').slice(0, 60)}）`; render(); });
        break;
      }
      case 'wipeopen': st.wipeOpen = true; render(); break;
      case 'wipeclose': st.wipeOpen = false; render(); break;
      case 'wipe': {
        // ランキングの自分の記録を消してから（つながらなければ手元だけ）、手元のデータを消して最初からにする
        if (st.wipeBusy) break;
        st.wipeBusy = true; render();
        Promise.race([wipeRemote(), new Promise((ok) => setTimeout(ok, 8000))]).catch(() => {}).finally(() => { hooks.wipeLocal(); location.reload(); });
        break;
      }
      case 'ttlclose': st.ttlOpen = false; render(); break;   // 称号を選ぶ（'title' はタイトルへ戻る操作）
      // ランキング
      case 'ranking': open('s_ranking', { rtab: 'week' }); loadRank('week'); break;
      case 'rtab': st.rtab = arg; render(); loadRank(arg); break;
      // 写真のアイコン：端末の写真を選び、真ん中を正方形に切り抜いて小さく縮めて保存する
      case 'photo-pick': {
        const inp = document.createElement('input');
        inp.type = 'file'; inp.accept = 'image/*';
        inp.addEventListener('change', () => {
          const file = inp.files && inp.files[0];
          if (!file) return;
          const url = URL.createObjectURL(file), img = new Image();
          img.onload = () => {
            const S = 160, c = document.createElement('canvas'), k = Math.min(img.width, img.height);
            c.width = S; c.height = S;
            c.getContext('2d').drawImage(img, (img.width - k) / 2, (img.height - k) / 2, k, k, 0, 0, S, S);
            URL.revokeObjectURL(url);
            save.photo = c.toDataURL('image/jpeg', 0.85);
            save.equip.icon = 'photo';
            writeSave(save); sync();
            setPhoto(save.photo);
            render();
          };
          img.onerror = () => URL.revokeObjectURL(url);
          img.src = url;
        });
        inp.click();
        break;
      }
      // 着せ替え
      case 'skin': if (id === 's_soon') break; st.skinTab = arg; render(); root.querySelector('.ms-scroll')?.scrollTo(0, 0); break;
      case 'skinpick': if ((save.owned[arg] || []).includes(arg2) || (arg === 'frame' && arg2 === 'f_none')) { st.pick = { ...(st.pick || save.equip), [arg]: arg2 }; render(); } break;
      case 'equip': { const tab = st.skinTab || 'icon'; const v = (st.pick || save.equip)[tab] || (tab === 'frame' ? 'f_none' : ''); if ((save.owned[tab] || []).includes(v) || (tab === 'frame' && v === 'f_none')) { save.equip[tab] = v; writeSave(save); hooks.applySkin(); if (tab === 'icon' || tab === 'frame') sync(); render(); } break; }
      case 'skinopen': open('s_skin', { skinTab: 'icon', pick: { ...save.equip } }); break;
      // ガチャ
      case 'gacha': open('s_gacha'); break;
      case 'rates': open('s_rates'); break;
      case 'pull': {
        const n = Number(arg), cost = n >= 10 ? GACHA.price10 : GACHA.price * n;
        if (save.coins < cost) { if (id === 's_gacha') { st.err = 'コインが足りません'; render(); } else { back(); st.err = 'コインが足りません'; render(); } break; }
        save.coins -= cost;
        const res = rollGacha(save, n);
        ensureDaily(save, SKILL_ROADS); addPulls(save, n);
        writeSave(save);
        render();   // コインの表示を先に減らしておく
        // 演出（光の玉）を流し、終わったら：10回引きは結果の一覧、1回引きはガチャの画面へ
        gfx.play(res.got, { onDone: () => {
          if (n >= 10) { if (id === 's_gacharesult') { st = { got: res.got, refund: res.refund }; render(); } else open('s_gacharesult', { got: res.got, refund: res.refund }); }
          else if (id === 's_gacharesult') back();
        } });
        break;
      }
      case 'rename': open('s_name', { draft: save.name }); break;
      case 'name-ok': {
        const v = (st.draft ?? '').trim();
        if (!v || [...v].length > 10) { st.err = '1〜10文字で入れてください'; render(); break; }
        // 開発者の合言葉：名前としては使わず、この端末を開発者にする（調整パネルが出る）
        //   開発者は1人だけ：サーバーに登録できた（もう登録してある）端末だけがなれる
        if (v.length === DEV_LEN) {
          isDevKey(v).then(async (ok) => {
            if (!ok) { finishName(v); return; }
            st.err = null; st.note = '確認しています…'; render();
            const r = await claimDev(v);
            if (r === 'ok') { save.dev = true; writeSave(save); hooks.devChanged?.(); st.draft = ''; st.note = '開発者モードになりました。名前を入れてください'; }
            else { st.draft = ''; st.note = null; st.err = r === 'taken' ? '開発者はすでにほかの端末で登録されています' : 'つながりません。電波のよい所でもう一度入れてください'; }
            render();
          });
          break;
        }
        finishName(v);
        break;
      }
      case 'news': { const n = Math.max(0, NEWS.length - (save.newsRead || 0)); save.newsRead = NEWS.length; writeSave(save); open('s_news', { newsNew: n }); break; }
      case 'settings': open('s_settings'); break;
      case 'credits': open('s_credits'); break;
      case 'set': setSetting(arg, !save.settings[arg]); break;
      case 'ctl': setSetting('control', arg); break;
      case 'glow': setSetting('glow', Number(arg)); break;
      case 'resume': close(); hooks.resume(); break;
      case 'restart': close(); hooks.restart(); break;
      case 'retry': close(); hooks.restart(); break;
      case 'bt-again': close(); hooks.btAgain(); break;
      case 'bt-repick': close(); hooks.btRepick(); break;
      case 'bt-quit': hooks.toTitle(); home(); break;
      case 'title': hooks.toTitle(); home(); break;
      default: break;
    }
  }

  root.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || !root.contains(el)) return;
    // 音量のつまみ：押した位置で決める
    if (el.dataset.act.startsWith('vol:')) {
      const k = el.dataset.act.split(':')[1], r = el.getBoundingClientRect();
      const v = Math.round(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * 20) * 5;
      setSetting(k, v);
      return;
    }
    if (!el.dataset.act.startsWith('snd:') && !el.dataset.act.startsWith('pull')) playSound('tap');
    doAct(el.dataset.act);
  });
  // 音量のつまみはドラッグでも動かせる
  root.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('[data-act^="vol:"]');
    if (!el) return;
    const k = el.dataset.act.split(':')[1];
    const move = (ev) => {
      const r = el.getBoundingClientRect();
      const v = Math.round(Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)) * 20) * 5;
      if (v !== save.settings[k]) {
        save.settings[k] = v;
        const i = el.querySelector('i'); if (i) i.style.width = `${v}%`;
        const b = el.nextElementSibling; if (b) b.textContent = v;
      }
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); writeSave(save); hooks.applySettings(save.settings); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });

  // 結果画面に出す中身を、終わったプレイから作る
  function resultOf(s, isNew, roads) {
    const total = Object.values(s.killBy || {}).reduce((a, b) => a + b, 0);
    let mvp = null;
    for (const [src, n] of Object.entries(s.killBy || {})) if (SRC_INFO[src] && (!mvp || n > mvp.n)) mvp = { src, n };
    return {
      score: s.score, isNew, phase: s.phase, time: s.time, kills: s.kills, best: save.best.score,
      bosses: [...new Set(s.bossKills || [])],
      roads,
      mvp: mvp && total ? { src: mvp.src, pct: Math.round((mvp.n / total) * 100) } : null,
    };
  }

  return {
    open, back, close, home, render,
    showResult(s, isNew, roads, coins) { if (coins > 0) setTimeout(() => playSound('coin'), 300); history.length = 0; id = null; open('s_result', { result: { ...resultOf(s, isNew, roads), coins } }, false); },
    get id() { return id; },
    esc,
  };
}
