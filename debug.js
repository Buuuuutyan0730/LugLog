// 試作用の調整パネル。CONFIG の項目から自動で組み立てる。
// 値は CONFIG を直接書き換えるので、ゲームにはすぐ反映される。

export function setupDebugPanel(config, { onChange, onOpen, onClose, onRestart, onClearPhase, onPreview, coins }) {
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

  const title = (text) => {
    const h = document.createElement('div');
    h.className = 'group-title';
    h.textContent = text;
    body.appendChild(h);
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
    body.appendChild(row);
    body.appendChild(row2);
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
    body.appendChild(row);
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
    body.appendChild(row);
  }
}
