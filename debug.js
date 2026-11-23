// 試作用の調整パネル。CONFIG の項目から自動で組み立てる。
// 値は CONFIG を直接書き換えるので、ゲームにはすぐ反映される。

import { SKILL_ROADS } from './skilldefs.js?v=20261124033523';
import { CATS } from './preview.js?v=20261124033523';

// スキルの数値の名前（設定の項目名 → 日本語）。ないものは項目名のまま出す
const PARAM = {
  power: '威力', per: 'レベルごとに増える分', base: '基本の値', radius: '範囲', reach: '届く距離', every: '間隔（秒）', time: '続く時間（秒）',
  life: '残る時間（秒）', count: '数', width: '太さ', speed: '速さ', push: '押し返す強さ', max: '上限', cap: '上限', slow: '遅くする割合',
  gap: '置く間隔（距離）', chance: '確率', again: '次に出るまで（秒）', delay: '遅れ（秒）', keep: '続く時間（秒）', burst: '弾ける範囲',
  burstPower: '弾ける威力', mult: '倍率', share: '分ける割合', turn: '曲がる強さ', hits: '回数', size: '大きさ', hp: '体力', rate: '割合',
  interval: '撃つ間隔（秒）', spread: '広がり', warn: '予告（秒）', bounce: '跳ね返り', still: '止まっている時間（秒）', dist: '距離',
  slowTime: '遅くする時間（秒）', blast: '爆発の範囲', blastPower: '爆発の威力', near: '近さ', stop: '止まる時間（秒）', heal: '回復',
  regen: '回復の速さ', inv: '無敵（秒）', buff: '強くなる割合', jump: '移る距離', move: '動きの割合', pull: '引き寄せ', look: '見る先',
  close: '閉じる距離', minLen: '最低の長さ', min: '最低', period: '周期（秒）', height: '高さ', floor: '下限', planet: '惑星の大きさ',
};
const paramLabel = (k) => {
  const m = /^(kiwami|king|boss|hell)(.+)$/.exec(k);
  if (m) { const base = m[2][0].toLowerCase() + m[2].slice(1); const tag = { kiwami: '極み', king: '王', boss: 'ボス', hell: '地獄' }[m[1]]; return `${PARAM[base] || base}（${tag}）`; }
  return PARAM[k] || k;
};
// 数値を「項目名 → 値」に平らにする（レベルごとの表などは「shots.2」のようにする）
const flatNums = (o, pre = '') => Object.entries(o || {}).flatMap(([k, v]) => (typeof v === 'number' ? [[pre + k, v]] : v && typeof v === 'object' ? flatNums(v, `${pre}${k}.`) : []));

export function setupDebugPanel(config, { onChange, onOpen, onClose, onRestart, onClearPhase, onAdvance, onBossTest, resetFlag, onPreview, coins, records }) {
  const sheet = document.getElementById('debug');
  const body = document.getElementById('debug-body');

  const open = () => {
    if (coins) showCoins();
    sheet.classList.add('open');
    sheet.setAttribute('aria-hidden', 'false');
    onOpen();
  };
  const close = () => {
    sheet.classList.remove('open');
    sheet.setAttribute('aria-hidden', 'true');
    onClose();
  };
  document.getElementById('open-debug').addEventListener('click', open);
  document.getElementById('close-debug').addEventListener('click', close);
  document.getElementById('restart').addEventListener('click', () => { onRestart(); close(); });

  // ---- 上のタブ：テスト｜スキルの数値｜プレイの記録 ----
  const tabs = document.createElement('div');
  tabs.className = 'seg dbg-tabs';
  tabs.innerHTML = '<button class="active" data-t="test">テスト</button><button data-t="skill">スキルの数値</button><button data-t="sample">見本</button><button data-t="rec">記録</button>';
  body.appendChild(tabs);
  const test = document.createElement('div');
  const skill = document.createElement('div'); skill.className = 'dbg-skill'; skill.hidden = true;
  const sample = document.createElement('div'); sample.className = 'dbg-sample'; sample.hidden = true;
  const rec = document.createElement('div'); rec.className = 'dbg-rec'; rec.hidden = true;
  body.append(test, skill, sample, rec);
  const showTab = (t) => {
    tabs.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x.dataset.t === t));
    test.hidden = t !== 'test'; skill.hidden = t !== 'skill'; sample.hidden = t !== 'sample'; rec.hidden = t !== 'rec';
    if (!rec.hidden && !runs) loadRec(); else if (!rec.hidden) showRec();
  };
  tabs.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) showTab(b.dataset.t); });

  // ================= テスト =================
  const B = config.boss;
  const bossRows = B.order.map((k, i) => `<button class="dbg-boss" data-boss="${i + 1}"><b>${i + 1}</b><span>${(B[k] && B[k].name) || k}</span><small>フェーズ ${(i + 1) * B.every}</small></button>`).join('');
  test.innerHTML = `
    <div class="group-title">▼ ボスを試す</div>
    <div class="dbg-hint">そのフェーズまで遊んだのと同じ強さで、ボスが出るところから始めます。ランキングと記録には入りません。</div>
    <div class="dbg-bosses">${bossRows}</div>
    <div class="dbg-bossgo" hidden>
      <div class="dbg-bossgo-h"><b></b><span></span></div>
      <div class="dbg-hint">カードを <b class="dbg-n"></b> 回選んでから戦います。<br>おまかせ：持っているスキルや、同じ道のカードの中から、いちばんレア度の高いものを取ります（レア度が同じなら、持っているスキルのレベル上げを先に）。関係ない道のスキルは取りません。自分で選ぶ途中からでも「残りはおまかせ」にできます。</div>
      <div class="dbg-2btn">
        <button class="btn btn-sub" data-go="pick">自分で選ぶ</button>
        <button class="btn" data-go="auto">おまかせで選ぶ</button>
      </div>
    </div>

    <div class="group-title">▼ フェーズを進める</div>
    <div class="seg dbg-seg-gap"><button data-ph="1">次のフェーズへ</button><button data-ph="10">+10 フェーズ</button></div>

    <div class="group-title">▼ コイン</div>
    <div class="row"><div class="row-label"><span>持っているコイン</span><span class="row-value dbg-coins"></span></div>
      <div class="seg"><button data-c="1000">+1,000</button><button data-c="10000">+10,000</button><button data-c="100000">+100,000</button><button data-c="0">0にする</button></div></div>

    <div class="group-title">▼ 保存の状態を戻す</div>
    <div class="dbg-resets">
      <button class="btn btn-small btn-sub" data-reset="skin">着せ替えを最初に戻す</button>
      <button class="btn btn-small btn-sub" data-reset="tuto">チュートリアルをもう一度</button>
      <button class="btn btn-small btn-sub" data-reset="ending">エンディングをもう一度見る</button>
    </div>`;
  const coinVal = test.querySelector('.dbg-coins');
  let showCoins = () => { if (coins) coinVal.textContent = coins.get().toLocaleString(); };
  showCoins();
  const go = test.querySelector('.dbg-bossgo');
  test.addEventListener('click', (e) => {
    const bb = e.target.closest('.dbg-boss');
    if (bb) {
      const n = Number(bb.dataset.boss), k = B.order[n - 1], ph = n * B.every;
      test.querySelectorAll('.dbg-boss').forEach((x) => x.classList.toggle('active', x === bb));
      go.hidden = false;
      go.querySelector('.dbg-bossgo-h b').textContent = `${n}体目　${(B[k] && B[k].name) || k}`;
      go.querySelector('.dbg-bossgo-h span').textContent = `フェーズ ${ph}`;
      go.querySelector('.dbg-n').textContent = ph;
      return;
    }
    const g = e.target.closest('[data-go]');
    if (g) { const a = test.querySelector('.dbg-boss.active'); if (a) { close(); onBossTest(Number(a.dataset.boss), g.dataset.go === 'auto'); } return; }
    const ph = e.target.closest('[data-ph]');
    if (ph) { close(); if (ph.dataset.ph === '1') onClearPhase(); else onAdvance(Number(ph.dataset.ph)); return; }
    const c = e.target.closest('[data-c]');
    if (c && coins) { const v = Number(c.dataset.c); if (v) coins.add(v); else coins.set(0); showCoins(); return; }
    const r = e.target.closest('[data-reset]');
    if (r) {
      if (r.dataset.reset === 'skin' && coins) coins.resetSkins(); else if (resetFlag) resetFlag(r.dataset.reset);
      const t = r.textContent; r.textContent = '戻しました'; setTimeout(() => { r.textContent = t; }, 1200);
    }
  });

  // ================= スキルの数値 =================
  const roadsHtml = ['<button class="active" data-road="">全部</button>', ...SKILL_ROADS.map((r) => `<button data-road="${r.id}">${r.name}</button>`)].join('');
  const skillHtml = SKILL_ROADS.map((r) => r.skills.map((k) => {
    const nums = flatNums(config.skill[k.id]);
    const rows = nums.map(([key, v]) => `<div class="dbg-prm" data-key="${key}" data-def="${v}"><span>${paramLabel(key.split('.').pop())}${key.includes('.') ? `<i>${key.split('.').slice(0, -1).join('.')}</i>` : ''}<small>${key}</small></span><input type="number" inputmode="decimal" step="any" value="${v}"><button class="dbg-undo" title="戻す">↺</button></div>`).join('');
    return `<details class="dbg-sk" data-road="${r.id}" data-name="${k.name}" data-id="${k.id}"><summary><span class="dbg-kind">${k.kind}</span><b>${k.name}</b><small>${r.name}</small><em>${nums.length ? `${nums.length}個` : '数値なし'}</em></summary>${rows || '<div class="dbg-hint">調整できる数値はありません</div>'}</details>`;
  }).join('')).join('');
  skill.innerHTML = `
    <div class="dbg-sk-top">
      <input class="dbg-search" type="search" placeholder="スキルの名前で探す">
      <div class="dbg-roads">${roadsHtml}</div>
    </div>
    <div class="dbg-sklist">${skillHtml}</div>
    <div class="dbg-sk-foot"><span class="dbg-changed">変えた数値 <b>0</b> 個</span><button class="btn btn-small btn-sub" data-sk="reset">全部戻す</button><button class="btn btn-small" data-sk="export">変えた値を書き出す</button></div>
    <div class="dbg-export" hidden><div class="dbg-hint">コピーしました。このまま貼って送ってもらえれば、本体の設定に書き込みます。</div><textarea readonly rows="6"></textarea><button class="btn btn-small btn-sub" data-sk="exclose">とじる</button></div>`;
  let road = '';
  const filter = () => {
    const q = skill.querySelector('.dbg-search').value.trim();
    skill.querySelectorAll('.dbg-sk').forEach((d) => { d.hidden = (road && d.dataset.road !== road) || (q && !d.dataset.name.includes(q)); });
  };
  const countChanged = () => {
    const n = skill.querySelectorAll('.dbg-prm.changed').length;
    skill.querySelector('.dbg-changed b').textContent = n;
    skill.querySelectorAll('.dbg-sk').forEach((d) => d.classList.toggle('changed', !!d.querySelector('.dbg-prm.changed')));
  };
  skill.querySelector('.dbg-search').addEventListener('input', filter);
  // 数値をゲームの設定に書き込む（「shots.2」のような入れ子もたどる）。ページを閉じると元に戻る
  const apply = (row, v) => {
    const id = row.closest('.dbg-sk').dataset.id, path = row.dataset.key.split('.');
    let o = config.skill[id];
    for (const p of path.slice(0, -1)) o = o[p];
    o[path[path.length - 1]] = v;
  };
  skill.addEventListener('input', (e) => {
    const row = e.target.closest('.dbg-prm'); if (!row) return;
    const v = Number(e.target.value);
    if (e.target.value === '' || !Number.isFinite(v)) return;
    apply(row, v);
    row.classList.toggle('changed', v !== Number(row.dataset.def));
    countChanged();
  });
  const undoRow = (row) => { row.querySelector('input').value = row.dataset.def; apply(row, Number(row.dataset.def)); row.classList.remove('changed'); };
  skill.addEventListener('click', (e) => {
    const rb = e.target.closest('[data-road]');
    if (rb && rb.tagName === 'BUTTON') { road = rb.dataset.road; skill.querySelectorAll('.dbg-roads button').forEach((x) => x.classList.toggle('active', x === rb)); filter(); return; }
    const u = e.target.closest('.dbg-undo');
    if (u) { undoRow(u.closest('.dbg-prm')); countChanged(); return; }
    const f = e.target.closest('[data-sk]');
    if (!f) return;
    if (f.dataset.sk === 'reset') { skill.querySelectorAll('.dbg-prm.changed').forEach(undoRow); countChanged(); }
    if (f.dataset.sk === 'exclose') skill.querySelector('.dbg-export').hidden = true;
    if (f.dataset.sk === 'export') {
      // 変えた数値だけを「スキル名（id）／数値の名前：元 → 新」の形で書き出し、コピーする
      const lines = [...skill.querySelectorAll('.dbg-prm.changed')].map((row) => {
        const d = row.closest('.dbg-sk');
        return `${d.dataset.name}（skill.${d.dataset.id}.${row.dataset.key}）：${row.dataset.def} → ${row.querySelector('input').value}`;
      });
      const text = lines.length ? `スキルの数値の変更\n${lines.join('\n')}` : '変えた数値はありません';
      const box = skill.querySelector('.dbg-export');
      box.hidden = false; box.querySelector('textarea').value = text;
      box.querySelector('.dbg-hint').textContent = lines.length ? 'コピーしました。このまま貼って送ってもらえれば、本体の設定に書き込みます。' : '変えた数値はありません。';
      if (lines.length && navigator.clipboard) navigator.clipboard.writeText(text).catch(() => { box.querySelector('.dbg-hint').textContent = 'コピーできなかったので、下の文字を長押しでコピーしてください。'; });
    }
  });

  // ================= 見本 =================
  //   上で分類を選び、下の項目を押すと、パネルを閉じてその見本を開く。見本の下のバーの「パネルへ」でここに戻る
  let sCat = CATS[0].id, sTab = '';
  const drawSample = () => {
    const c = CATS.find((x) => x.id === sCat);
    sample.innerHTML = `
      <div class="dbg-hint">見たい見本を押すと開きます。見本を見ている間は、下のバーの ◀ ▶ で前後の見本に移れます。</div>
      <div class="dbg-cats">${CATS.map((x) => `<button class="${x.id === sCat ? 'active' : ''}" data-cat="${x.id}">${x.label}<small>${x.tabs.length}</small></button>`).join('')}</div>
      <div class="group-title">▼ ${c.label}</div>
      <div class="dbg-items">${c.tabs.map(([id, label]) => `<button class="btn btn-sub ${id === sTab ? 'last' : ''}" data-item="${id}">${label}</button>`).join('')}</div>`;
  };
  drawSample();
  sample.addEventListener('click', (e) => {
    const c = e.target.closest('[data-cat]'); if (c) { sCat = c.dataset.cat; drawSample(); return; }
    const it = e.target.closest('[data-item]'); if (it) { sTab = it.dataset.item; close(); onPreview(sTab); }
  });

  // ================= プレイの記録 =================
  //   タブを開いたときに1回だけ読む（「読み込み直す」でもう一度）
  let recRange = 'all', runs = null, recErr = '';
  const showRec = () => {
    if (recErr) { rec.innerHTML = `<div class="dbg-rec-note">${recErr}</div><button class="btn btn-small btn-sub dbg-reload">読み込み直す</button>`; return; }
    if (!runs) { rec.innerHTML = '<div class="dbg-rec-hint">読み込み中…</div>'; return; }
    const from = recRange === 'week' ? records.weekStart() : 0;
    renderRecords(rec, summarize(runs.filter((r) => r.at >= from), config), recRange);
  };
  const loadRec = () => {
    runs = null; recErr = ''; showRec();
    if (!records) { recErr = '記録を読む仕組みがありません'; showRec(); return; }
    records.load().then((r) => { runs = r; showRec(); }, (e) => { recErr = `読み込めませんでした（${String((e && (e.code || e.message)) || 'unknown').replace(/[<>&]/g, '').slice(0, 60)}）`; showRec(); });
  };
  rec.addEventListener('click', (e) => {
    if (e.target.closest('.dbg-reload')) { loadRec(); return; }
    const b = e.target.closest('[data-range]'); if (!b) return;
    recRange = b.dataset.range; showRec();
  });

  // 外から開く：見本から戻ってきたときは「見本」タブを、最後に見た見本の分類で開く
  return {
    open(t, lastTab) {
      if (lastTab) { const c = CATS.find((x) => x.tabs.some(([id]) => id === lastTab)); if (c) sCat = c.id; sTab = lastTab; drawSample(); }
      if (t) showTab(t);
      open();
    },
  };
}

// ---------- プレイの記録（見た目） ----------
// 読んだ記録をまとめる
const median = (a) => { if (!a.length) return 0; const b = a.slice().sort((x, y) => x - y), m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
export function summarize(runs, config) {
  const B = config.boss, kinds = B.order;
  const bosses = [];
  const maxN = Math.max(kinds.length, ...runs.flatMap((r) => (r.bosses || []).map((b) => b.n)));
  for (let n = 1; n <= maxN; n++) {
    const all = runs.flatMap((r) => (r.bosses || []).filter((b) => b.n === n));
    const kind = (all[0] && all[0].kind) || kinds[(n - 1) % kinds.length];
    const wins = all.filter((b) => b.win), loses = all.filter((b) => !b.win);
    bosses.push({ n, name: (B[kind] && B[kind].name) || kind, phase: n * B.every, tries: all.length, wins: wins.length, winSec: median(wins.map((b) => b.sec)), loseSec: median(loses.map((b) => b.sec)) });
  }
  const ends = [[1, 10], [11, 20], [21, 30], [31, 40], [41, 50], [51, 999]].map(([a, b]) => [a, b, runs.filter((r) => r.phase >= a && r.phase <= b).length]);
  const sum = (k) => runs.reduce((v, r) => v + (r[k] || 0), 0);
  const first = runs.length ? new Date(Math.min(...runs.map((r) => r.at || Date.now()))) : null;
  return {
    plays: runs.length, since: first ? `${first.getMonth() + 1}/${first.getDate()}` : '—',
    bosses, ends,
    elite: { seen: sum('eliteSeen'), killed: sum('eliteKilled'), skipped: sum('eliteSkipped'), sec: median(runs.flatMap((r) => r.eliteSecs || [])) },
    control: { drag: runs.filter((r) => r.ctrl !== 'stick').length, stick: runs.filter((r) => r.ctrl === 'stick').length },
  };
}
const mmss = (sec) => (sec > 0 ? `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}` : '—');
const pct = (a, b) => (b > 0 ? `${Math.round((a / b) * 100)}%` : '—');
function renderRecords(root, d, range) {
  const maxEnd = Math.max(1, ...d.ends.map((x) => x[2]));
  const ctl = d.control.drag + d.control.stick;
  root.innerHTML = `
    <div class="dbg-rec-top">
      <div class="seg dbg-range">
        <button data-range="all" class="${range === 'all' ? 'active' : ''}">全部</button>
        <button data-range="week" class="${range === 'week' ? 'active' : ''}">今週</button>
      </div>
      <div class="dbg-rec-count"><b>${d.plays.toLocaleString()}</b>回のプレイ<small>${d.since}から</small></div>
    </div>
    ${d.plays ? '' : '<div class="dbg-rec-note">まだ記録がありません</div>'}

    <div class="group-title">▼ ボス</div>
    <table class="dbg-tbl">
      <thead><tr><th>ボス</th><th>挑戦</th><th>倒せた</th><th>倒すまで</th><th>やられるまで</th></tr></thead>
      <tbody>${d.bosses.map((b) => `<tr class="${b.tries ? '' : 'none'}"><td><b>${b.n}</b> ${b.name}<small>P${b.phase}</small></td><td>${b.tries}</td><td class="${b.tries && b.wins / b.tries < 0.3 ? 'bad' : ''}">${pct(b.wins, b.tries)}</td><td>${mmss(b.winSec)}</td><td>${mmss(b.loseSec)}</td></tr>`).join('')}</tbody>
    </table>
    <div class="dbg-rec-hint">時間は、真ん中の値（半分の人がこれより早い）</div>

    <div class="group-title">▼ やられたフェーズ</div>
    <div class="dbg-bars">${d.ends.map(([a, b, n]) => `<div class="dbg-bar"><span>${b > 900 ? `${a}〜` : `${a}〜${b}`}</span><i><em style="width:${(n / maxEnd) * 100}%"></em></i><b>${n}</b></div>`).join('')}</div>

    <div class="group-title">▼ 中ボス</div>
    <div class="dbg-kv">
      <div><span>出てきた</span><b>${d.elite.seen}回</b></div>
      <div><span>倒した</span><b>${pct(d.elite.killed, d.elite.seen)}</b></div>
      <div><span>倒すまで</span><b>${mmss(d.elite.sec)}</b></div>
      <div><span>倒さずに次へ</span><b class="${d.elite.skipped / Math.max(1, d.elite.seen) > 0.25 ? 'bad' : ''}">${pct(d.elite.skipped, d.elite.seen)}</b></div>
    </div>

    <div class="group-title">▼ 操作方法</div>
    <div class="dbg-split"><i style="width:${(d.control.drag / Math.max(1, ctl)) * 100}%"></i></div>
    <div class="dbg-split-label"><span>ドラッグ ${pct(d.control.drag, ctl)}</span><span>スティック ${pct(d.control.stick, ctl)}</span></div>
    <button class="btn btn-small btn-sub wide dbg-reload">読み込み直す</button>`;
}
