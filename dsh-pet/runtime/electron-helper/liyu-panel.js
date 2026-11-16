/**
 * 鲤鱼信箱 · 面板窗脚本。
 *
 * 读本机中继（127.0.0.1:7788）的 /api/state，发送走 /api/send。
 * 打开面板即标记已读；面板关掉不影响中继继续收消息。
 *
 * @module dsh-pet/runtime/electron-helper/liyu-panel
 */
(() => {
  'use strict';

  const BRIDGE = 'http://127.0.0.1:7788';
  const POLL_MS = 2000;

  const els = {
    list: document.getElementById('list'),
    input: document.getElementById('input'),
    send: document.getElementById('send'),
    tip: document.getElementById('tip'),
    state: document.getElementById('state'),
    close: document.getElementById('close'),
  };

  let messages = [];
  let cleanedAt = Date.now();
  let cleanMs = 8 * 3600 * 1000;
  let sending = false;
  let online = false;

  const pad = (n) => String(n).padStart(2, '0');
  const timeOf = (iso) => {
    const d = new Date(iso);
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  };

  function countdown() {
    const left = Math.max(0, cleanedAt + cleanMs - Date.now());
    const h = Math.floor(left / 3600000);
    const m = Math.floor((left % 3600000) / 60000);
    return h > 0 ? h + ' 小时 ' + m + ' 分后自动清空' : m + ' 分后自动清空';
  }

  function render() {
    els.state.textContent = online ? '在线' : '离线';
    els.tip.textContent = online ? countdown() : '连不上中继，检查 ~/.dsh/liyu-chat/bridge.log';
    els.list.replaceChildren();

    if (messages.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = online ? '还没聊过，说点什么？' : '中继离线\n启动后这里会自动刷新';
      els.list.append(empty);
      return;
    }

    for (const m of messages.slice(-60)) {
      const row = document.createElement('div');
      row.className = 'row' + (m.mine ? ' mine' : '');
      const who = document.createElement('div');
      who.className = 'who';
      who.textContent = (m.mine ? '我' : m.author || '朋友') + ' · ' + timeOf(m.at);
      const bubble = document.createElement('div');
      bubble.className = 'bubble';
      bubble.textContent = m.text;
      row.append(who, bubble);
      els.list.append(row);
    }
    els.list.scrollTop = els.list.scrollHeight;
  }

  async function refresh() {
    try {
      const res = await fetch(BRIDGE + '/api/state', { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const s = await res.json();
      online = true;
      messages = Array.isArray(s.messages) ? s.messages : [];
      cleanedAt = Number(s.cleanedAt) || Date.now();
      cleanMs = Number(s.cleanMs) || cleanMs;
      render();
      void fetch(BRIDGE + '/api/read', { method: 'POST' }).catch(() => undefined);
    } catch {
      online = false;
      render();
    }
  }

  async function submit() {
    const text = els.input.value.trim();
    if (text === '' || sending) return;
    sending = true;
    els.send.disabled = true;
    try {
      const res = await fetch(BRIDGE + '/api/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error(String(res.status));
      els.input.value = '';
      await refresh();
    } catch {
      els.tip.textContent = '发送失败，中继没响应';
    } finally {
      sending = false;
      els.send.disabled = false;
    }
  }

  els.send.addEventListener('click', () => void submit());
  els.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  });
  els.close.addEventListener('click', () => window.close());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') window.close();
  });

  setInterval(() => void refresh(), POLL_MS);
  setInterval(() => {
    if (online) els.tip.textContent = countdown();
  }, 30000);
  els.input.focus();
  void refresh();
})();
