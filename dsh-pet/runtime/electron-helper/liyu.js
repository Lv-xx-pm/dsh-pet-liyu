/**
 * 鲤鱼信箱 · 宠物窗这一侧：未读红点 + 双击开面板。
 *
 * 只读本机中继（127.0.0.1:7788）的状态；不写文件、不碰 GitHub。
 * 面板本身在独立的 liyu-panel.html 窗里，这里通过 petBridge.liyuToggle() 开合。
 *
 * @module dsh-pet/runtime/electron-helper/liyu
 */
(() => {
  'use strict';

  const BRIDGE = 'http://127.0.0.1:7788';
  const POLL_MS = 2000;
  const BADGE = 30;

  let unread = 0;
  let lastUnread = 0;
  let badge = null;
  let offline = false;

  /** 红点元素：固定定位在宠物窗口右上角。 */
  function ensureBadge() {
    if (badge !== null && badge.isConnected) return badge;
    badge = document.createElement('div');
    badge.id = 'liyu-badge';
    document.body.append(badge);
    return badge;
  }

  /** 红点跟着宠物 sprite 走：每 200ms 对一次坐标，宠物被拖动也不会掉队。 */
  function placeBadge() {
    const el = ensureBadge();
    const sprite = document.querySelector('.pet-sprite');
    if (sprite === null) {
      el.style.display = 'none';
      return;
    }
    const r = sprite.getBoundingClientRect();
    el.style.display = unread > 0 ? 'block' : 'none';
    el.textContent = unread > 99 ? '99+' : String(unread);
    el.style.left = Math.round(r.right - BADGE - 10) + 'px';
    el.style.top = Math.round(r.top + 18) + 'px';
  }

  function pulse() {
    const el = ensureBadge();
    el.classList.remove('is-pop');
    // 强制回流后再加，动画才会重播
    void el.offsetWidth;
    el.classList.add('is-pop');
  }

  function apply(next) {
    unread = Math.max(0, next | 0);
    placeBadge();
    if (unread > lastUnread && unread > 0) pulse();
    lastUnread = unread;
  }

  async function poll() {
    try {
      const res = await fetch(BRIDGE + '/api/state', { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const state = await res.json();
      offline = false;
      apply(state.unread);
    } catch {
      // 中继没起来：红点不显示，但不打扰宠物本身
      offline = true;
      apply(0);
    }
  }

  function bind() {
    document.addEventListener(
      'dblclick',
      (e) => {
        const t = e.target instanceof Element ? e.target : null;
        if (t === null || t.closest('#root') === null) return;
        e.preventDefault();
        e.stopPropagation();
        if (window.petBridge && typeof window.petBridge.liyuToggle === 'function') {
          window.petBridge.liyuToggle();
          // 打开面板即视为已读：先本地清零，中继稍后由面板自己调 /api/read
          lastUnread = unread;
          unread = 0;
          placeBadge();
        }
      },
      true,
    );
  }

  function boot() {
    const css = document.createElement('style');
    css.textContent = `
      #liyu-badge{position:fixed;z-index:2147483000;min-width:${BADGE}px;height:${BADGE}px;padding:0 2px;
        border-radius:999px;background:#FF4D4F;border:2px solid #111;color:#fff;font-weight:700;font-size:15px;
        line-height:26px;text-align:center;display:none;pointer-events:none;font-family:-apple-system,sans-serif}
      #liyu-badge.is-pop{animation:liyu-pop .26s ease}
      @keyframes liyu-pop{0%{transform:scale(.6)}60%{transform:scale(1.25)}100%{transform:scale(1)}}
    `;
    document.head.append(css);
    ensureBadge();
    bind();
    setInterval(poll, POLL_MS);
    setInterval(placeBadge, 200);
    poll();
    window.addEventListener('resize', placeBadge);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
