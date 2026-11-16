/**
 * 鲤鱼信箱 · 桌面宠物上的好友聊天面板。
 *
 * 三件事：双击宠物开合面板、右上角未读红点、面板里收发消息。
 * 全部挂在一个 Shadow DOM 宿主里，样式不外泄、也不吃宿主页面的 CSS。
 * @module dsh-pet/src/client/liyu/ui
 */
import { getState, markRead, send, type LiyuMessage, type LiyuState } from './api.ts';

const PANEL_W = 344;
const PANEL_H = 464;
const POLL_MS = 2000;

const CSS = `
:host{all:initial}
*{box-sizing:border-box}
.root{position:fixed;inset:0;pointer-events:none;z-index:2147483000;
  font-family:"PingFang SC","Hiragino Sans GB",-apple-system,BlinkMacSystemFont,sans-serif;color:#111}
.badge{position:fixed;width:30px;height:30px;border-radius:50%;background:#FF4D4F;
  border:2px solid #111;color:#fff;font-weight:700;font-size:15px;line-height:26px;text-align:center;
  pointer-events:none;transition:transform .18s ease;font-variant-numeric:tabular-nums}
.badge[hidden]{display:none}
.badge.pulse{animation:pop .26s ease}
@keyframes pop{0%{transform:scale(.6)}60%{transform:scale(1.25)}100%{transform:scale(1)}}

.panel{position:fixed;width:${PANEL_W}px;max-height:${PANEL_H}px;background:#fff;
  border:3px solid #111;border-radius:26px;display:flex;flex-direction:column;overflow:hidden;
  pointer-events:auto;box-shadow:8px 10px 0 rgba(17,17,17,.10);opacity:0;transform:translateY(8px) scale(.98);
  transition:opacity .16s ease,transform .16s ease}
.panel[hidden]{display:none}
.panel.open{opacity:1;transform:none}
.head{display:flex;align-items:center;gap:8px;padding:12px 12px 10px}
.pill{background:#BCD6F7;border:2px solid #111;border-radius:999px;padding:5px 16px;font-size:15px;font-weight:700}
.dot{width:7px;height:7px;border-radius:50%;background:#34C77B;margin-left:auto}
.state{font-size:12px;color:#8A94A6}
.close{margin-left:6px;width:26px;height:26px;border:0;background:transparent;color:#8A94A6;font-size:20px;
  cursor:pointer;border-radius:50%;line-height:1}
.close:hover{background:#F2F4F8;color:#111}

.list{flex:1;overflow-y:auto;padding:6px 14px 8px;display:flex;flex-direction:column;gap:12px;
  scrollbar-width:thin}
.list::-webkit-scrollbar{width:6px}
.list::-webkit-scrollbar-thumb{background:#DDE3EC;border-radius:3px}
.empty{color:#8A94A6;font-size:13px;text-align:center;margin:auto;line-height:1.9}

.row{display:flex;flex-direction:column;gap:4px;align-items:flex-start}
.row.mine{align-items:flex-end}
.who{font-size:11px;color:#8A94A6;padding:0 4px}
.bubble{max-width:82%;padding:9px 13px;border-radius:18px;border:2px solid #111;font-size:14px;
  line-height:1.5;white-space:pre-wrap;word-break:break-word}
.row:not(.mine) .bubble{background:#fff;border-bottom-left-radius:6px}
.row.mine .bubble{background:#BCD6F7;border-bottom-right-radius:6px}

.foot{border-top:1px solid #E7EBF2;padding:10px 12px 12px;display:flex;flex-direction:column;gap:6px}
.say{display:flex;gap:8px}
input{flex:1;min-width:0;border:1px solid #D6DEEA;border-radius:999px;padding:9px 14px;font-size:13.5px;
  outline:none;background:#F7F9FC;color:#111}
input:focus{border-color:#2F6FED;background:#fff}
button.send{border:0;border-radius:999px;background:#2F6FED;color:#fff;font-size:13.5px;font-weight:700;
  padding:9px 18px;cursor:pointer}
button.send:disabled{opacity:.5;cursor:default}
.tip{font-size:11px;color:#8A94A6;text-align:right;min-height:14px}
`;

interface El {
  root: HTMLDivElement;
  badge: HTMLDivElement;
  panel: HTMLDivElement;
  list: HTMLDivElement;
  input: HTMLInputElement;
  sendBtn: HTMLButtonElement;
  tip: HTMLDivElement;
  state: HTMLSpanElement;
}

let ui: El | undefined;
let open = false;
let lastUnread = 0;
let lastCountdown = '';
let state: LiyuState = { unread: 0, cleanedAt: Date.now(), cleanMs: 8 * 3600 * 1000, messages: [] };
let bridgeDown = false;
let sending = false;

function timeOf(iso: string): string {
  const d = new Date(iso);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

function countdown(s: LiyuState): string {
  const left = Math.max(0, s.cleanedAt + s.cleanMs - Date.now());
  const h = Math.floor(left / 3600000);
  const m = Math.floor((left % 3600000) / 60000);
  return h > 0 ? `${h} 小时 ${m} 分后自动清空` : `${m} 分后自动清空`;
}

function renderList(): void {
  if (ui === undefined) return;
  const { list } = ui;
  list.replaceChildren();
  if (state.messages.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = bridgeDown ? '连不上本机中继\n检查 ~/.dsh/liyu-chat/bridge.log' : '还没聊过，说点什么？';
    list.append(empty);
    return;
  }
  for (const m of state.messages.slice(-60)) {
    const row = document.createElement('div');
    row.className = 'row' + (m.mine ? ' mine' : '');
    const who = document.createElement('div');
    who.className = 'who';
    who.textContent = (m.mine ? '我' : m.author ?? '朋友') + ' · ' + timeOf(m.at);
    const b = document.createElement('div');
    b.className = 'bubble';
    b.textContent = m.text;
    row.append(who, b);
    list.append(row);
  }
  list.scrollTop = list.scrollHeight;
}

function renderBadge(): void {
  if (ui === undefined) return;
  const pet = document.querySelector('.dsh-pet-root');
  const n = state.unread;
  ui.badge.hidden = n <= 0 || open;
  if (!ui.badge.hidden && pet !== null) {
    const r = pet.getBoundingClientRect();
    ui.badge.style.left = Math.round(r.right - 34) + 'px';
    ui.badge.style.top = Math.round(r.top + 10) + 'px';
    ui.badge.textContent = n > 99 ? '99+' : String(n);
  }
  if (n > lastUnread && n > 0) {
    ui.badge.classList.remove('pulse');
    void ui.badge.offsetWidth;
    ui.badge.classList.add('pulse');
  }
  lastUnread = n;
}

function placePanel(): void {
  if (ui === undefined) return;
  const pet = document.querySelector('.dsh-pet-root');
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let x = Math.max(12, vw - PANEL_W - 24);
  let y = Math.max(12, vh - PANEL_H - 24);
  if (pet !== null) {
    const r = pet.getBoundingClientRect();
    const left = r.left - PANEL_W - 12;
    x = left > 12 ? left : Math.min(vw - PANEL_W - 12, r.right + 12);
    y = Math.min(Math.max(12, r.top - 24), vh - PANEL_H - 12);
  }
  ui.panel.style.left = Math.round(x) + 'px';
  ui.panel.style.top = Math.round(y) + 'px';
}

function setOpen(next: boolean): void {
  if (ui === undefined) return;
  open = next;
  ui.panel.hidden = !next;
  if (next) {
    placePanel();
    renderList();
    ui.panel.classList.add('open');
    ui.input.focus();
    void markRead().then(() => {
      state = { ...state, unread: 0 };
      renderBadge();
    }).catch(() => undefined);
  } else {
    ui.panel.classList.remove('open');
  }
  renderBadge();
}

async function refresh(): Promise<void> {
  try {
    state = await getState();
    bridgeDown = false;
    if (ui !== undefined) {
      ui.state.textContent = '在线';
      if (open) {
        renderList();
        void markRead().catch(() => undefined);
      }
      const tip = countdown(state);
      if (tip !== lastCountdown && ui !== undefined) {
        lastCountdown = tip;
        ui.tip.textContent = tip;
      }
      renderBadge();
    }
  } catch {
    bridgeDown = true;
    if (ui !== undefined) {
      ui.state.textContent = '离线';
      if (open) renderList();
    }
  }
}

async function submit(): Promise<void> {
  if (ui === undefined || sending) return;
  const text = ui.input.value.trim();
  if (text === '') return;
  sending = true;
  ui.sendBtn.disabled = true;
  try {
    await send(text);
    ui.input.value = '';
    await refresh();
  } catch {
    ui.tip.textContent = '发送失败，中继没响应';
  } finally {
    sending = false;
    if (ui !== undefined) ui.sendBtn.disabled = false;
  }
}

function mount(): void {
  if (ui !== undefined) return;
  if (document.querySelector('#dsh-pet-liyu') !== null) return;

  const host = document.createElement('div');
  host.id = 'dsh-pet-liyu';
  document.documentElement.append(host);
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = CSS;

  const root = document.createElement('div');
  root.className = 'root';

  const badge = document.createElement('div');
  badge.className = 'badge';
  badge.hidden = true;

  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.hidden = true;

  const head = document.createElement('div');
  head.className = 'head';
  const pill = document.createElement('div');
  pill.className = 'pill';
  pill.textContent = '鲤鱼信箱';
  const stateEl = document.createElement('span');
  stateEl.className = 'state';
  stateEl.textContent = '连接中';
  const close = document.createElement('button');
  close.className = 'close';
  close.textContent = '×';
  close.title = '关闭';
  close.addEventListener('click', () => setOpen(false));
  head.append(pill, stateEl, close);

  const list = document.createElement('div');
  list.className = 'list';

  const foot = document.createElement('div');
  foot.className = 'foot';
  const say = document.createElement('div');
  say.className = 'say';
  const input = document.createElement('input');
  input.placeholder = '说点什么…';
  input.maxLength = 2000;
  const sendBtn = document.createElement('button');
  sendBtn.className = 'send';
  sendBtn.textContent = '发送';
  sendBtn.addEventListener('click', () => void submit());
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
    e.stopPropagation();
  });
  say.append(input, sendBtn);
  const tip = document.createElement('div');
  tip.className = 'tip';
  foot.append(say, tip);

  panel.append(head, list, foot);
  root.append(badge, panel);
  shadow.append(style, root);

  ui = { root, badge, panel, list, input, sendBtn, tip, state: stateEl };

  document.addEventListener('dblclick', (e) => {
    const target = e.target as Element | null;
    if (target === null || target.closest('.dsh-pet-root') === null) return;
    e.preventDefault();
    setOpen(!open);
  }, true);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && open) setOpen(false);
  }, true);

  window.addEventListener('resize', () => {
    if (open) placePanel();
    renderBadge();
  });

  setInterval(() => void refresh(), POLL_MS);
  setInterval(() => renderBadge(), 500);
  void refresh();
}

/** 启动：等宠物挂载后再接管，避免和宿主的首帧打架。 */
export function bootLiyu(): void {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  } else {
    mount();
  }
}

export type { LiyuMessage };
