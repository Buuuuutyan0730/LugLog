// 試作用の調整パネル。CONFIG の項目から自動で組み立てる。
// 値は CONFIG を直接書き換えるので、ゲームにはすぐ反映される。

export function setupDebugPanel(config, { onChange, onOpen, onClose, onRestart, onClearPhase, onPreview, coins, records }) {
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
  document.getElementById('open-preview').addEventListener('click', () => { close(); onPreview(); });
  document.getElementById('debug-clear').addEventListener('click', () => { close(); onClearPhase(); });

  // ---- 上のタブ：調整｜記録 ----
  //   記録：遊んだ人のプレイの記録をまとめて見る（今は見た目だけ。数字は見本）
  const tabs = document.createElement('div');
  tabs.className = 'seg dbg-tabs';
  tabs.innerHTML = '<button class="active" data-t="tune">調整</button><button data-t="rec">プレイの記録</button>';
  body.appendChild(tabs);
  const tune = document.createElement('div');
  const rec = document.createElement('div');
  rec.className = 'dbg-rec';
  rec.hidden = true;
  body.appendChild(tune);
  body.appendChild(rec);
  tabs.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    tabs.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
    tune.hidden = b.dataset.t !== 'tune';
    rec.hidden = b.dataset.t !== 'rec';
    if (!rec.hidden && !runs) loadRec(); else if (!rec.hidden) showRec();
  });
  // 記録はタブを開いたときに1回だけ読む（「読み込み直す」でもう一度）
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

  const title = (text) => {
    const h = document.createElement('div');
    h.className = 'group-title';
    h.textContent = text;
    tune.appendChild(h);
  };

  // コイン（ガチャを試すため）
  let showCoins = () => {};
  if (coins) {
    title('▼ コイン（ガチャを試す）');
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `<div class="row-label"><span>持っているコイン</span><span class="row-value"></span></div>`;
    const val = row.querySelector('.row-value');
    showCoins = () => { val.textContent = coins.get().toLocaleString(); };
    const seg = document.createElement('div');
    seg.className = 'seg';
    for (const [label, fn] of [['+1,000', () => coins.add(1000)], ['+10,000', () => coins.add(10000)], ['+100,000', () => coins.add(100000)], ['0にする', () => coins.set(0)]]) {
      const b = document.createElement('button');
      b.textContent = label;
      b.addEventListener('click', () => { fn(); showCoins(); });
      seg.appendChild(b);
    }
    row.appendChild(seg);
    const row2 = document.createElement('div');
    row2.className = 'row';
    row2.innerHTML = `<div class="row-label"><span>着せ替えの持ち物</span></div>`;
    const seg2 = document.createElement('div');
    seg2.className = 'seg';
    const rb = document.createElement('button');
    rb.textContent = '最初の状態に戻す';
    rb.addEventListener('click', () => { coins.resetSkins(); rb.textContent = '戻しました'; setTimeout(() => { rb.textContent = '最初の状態に戻す'; }, 1200); });
    seg2.appendChild(rb);
    row2.appendChild(seg2);
    tune.appendChild(row);
    tune.appendChild(row2);
    showCoins();
  }

  title('▼ 比べる項目');
  for (const [key, item] of Object.entries(config.experiments)) {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `<div class="row-label"><span>${item.label}</span></div>`;
    const seg = document.createElement('div');
    seg.className = 'seg';
    for (const opt of item.options) {
      const b = document.createElement('button');
      b.textContent = opt.label;
      if (opt.value === item.value) b.classList.add('active');
      b.addEventListener('click', () => {
        item.value = opt.value;
        seg.querySelectorAll('button').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        onChange(key, opt);
      });
      seg.appendChild(b);
    }
    row.appendChild(seg);
    tune.appendChild(row);
  }

  title('▼ 数値');
  for (const [key, item] of Object.entries(config.tuning)) {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `
      <div class="row-label"><span>${item.label}</span><span class="row-value"></span></div>
      <input class="slider" type="range" min="${item.min}" max="${item.max}" step="${item.step}" value="${item.value}">`;
    const val = row.querySelector('.row-value');
    const input = row.querySelector('input');
    const show = () => { val.textContent = `${item.value}${item.unit}`; };
    show();
    input.addEventListener('input', () => {
      item.value = Number(input.value);
      show();
      onChange(key, item);
    });
    tune.appendChild(row);
  }
}

// ---------- プレイの記録（見た目） ----------
// 読んだ記録をまとめる
const median = (a) => { if (!a.length) return 0; const b = a.slice().sort((x, y) => x - y), m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
function summarize(runs, config) {
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
