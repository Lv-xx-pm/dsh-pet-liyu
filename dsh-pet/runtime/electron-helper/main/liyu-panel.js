/**
 * 鲤鱼信箱面板窗：桌宠旁边的一个无边框小窗，双击宠物开合。
 *
 * 与宠物窗解耦：不改宠物窗尺寸，面板是独立 BrowserWindow，位置贴着宠物窗算。
 * 内容页 liyu-panel.html 自己跟本机中继（127.0.0.1:7788）说话，主进程只负责开关与摆位。
 *
 * @module dsh-pet/runtime/electron-helper/main/liyu-panel
 */
const path = require('node:path');

/** 面板尺寸：与 liyu-panel.html 里的 body 尺寸保持一致。 */
const PANEL = { width: 380, height: 540, gap: 12 };

/**
 * @param {object} deps
 * @param {typeof import('electron').BrowserWindow} deps.BrowserWindow
 * @param {() => Map<string, any>} deps.windows 宠物窗口表
 * @param {string} deps.helperDir runtime/electron-helper 目录
 * @param {import('electron').Screen} deps.screen
 */
function createLiyuPanel({ BrowserWindow, windows, helperDir, screen }) {
  /** @type {any} */
  let panel = null;
  let visible = false;

  function ensure() {
    if (panel !== null && !panel.isDestroyed()) return panel;
    panel = new BrowserWindow({
      width: PANEL.width,
      height: PANEL.height,
      frame: false,
      transparent: true,
      hasShadow: false,
      resizable: false,
      movable: true,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      show: false,
      acceptFirstMouse: true,
      webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
    });
    panel.setAlwaysOnTop(true, 'screen-saver');
    panel.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    panel.loadFile(path.join(helperDir, 'liyu-panel.html')).catch((error) => {
      console.error('[liyu] 面板加载失败', error);
    });
    panel.on('closed', () => {
      panel = null;
      visible = false;
    });
    return panel;
  }

  /** 贴着宠物窗摆：优先左侧，放不下换右侧，再不行贴屏幕边。 */
  function place(win) {
    const pet = windows().get('main');
    const cursor = screen.getCursorScreenPoint();
    const area = screen.getDisplayNearestPoint(cursor).workArea;
    let anchor = { x: area.x + area.width - PANEL.width - 24, y: area.y + 90, width: 0, height: 0 };
    if (pet !== undefined && !pet.isDestroyed()) {
      const b = pet.getBounds();
      anchor = { x: b.x, y: b.y, width: b.width, height: b.height };
    }
    let x = anchor.x - PANEL.width - PANEL.gap;
    if (x < area.x + 8) x = anchor.x + anchor.width + PANEL.gap;
    if (x + PANEL.width > area.x + area.width - 8) x = area.x + area.width - PANEL.width - 8;
    const y = Math.min(Math.max(area.y + 8, anchor.y), area.y + area.height - PANEL.height - 8);
    win.setPosition(Math.round(x), Math.round(y));
  }

  function toggle() {
    const win = ensure();
    console.error('[liyu] toggle', visible ? 'close' : 'open');
    if (visible) {
      win.hide();
      visible = false;
      return { visible: false };
    }
    place(win);
    win.showInactive();
    win.focus();
    visible = true;
    console.error('[liyu] panel at', win.getBounds());
    return { visible: true };
  }

  return { toggle, ensure, isVisible: () => visible };
}

module.exports = { createLiyuPanel };
