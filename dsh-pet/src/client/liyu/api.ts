/**
 * 鲤鱼信箱 · 与中继（bridge.mjs）的 HTTP 客户端。
 * 只跟本机 127.0.0.1:7788 说话，不碰 GitHub，也不读任何凭据。
 * @module dsh-pet/src/client/liyu/api
 */

/** 中继默认地址；可用 localStorage 里的 liyu.bridge 覆盖（换端口时用）。 */
export const BRIDGE = (() => {
  try {
    return localStorage.getItem('liyu.bridge') ?? 'http://127.0.0.1:7788';
  } catch {
    return 'http://127.0.0.1:7788';
  }
})();

/** 一条消息。 */
export interface LiyuMessage {
  readonly id: number;
  readonly text: string;
  readonly at: string;
  readonly mine: boolean;
  readonly author?: string;
}

/** 中继状态。 */
export interface LiyuState {
  readonly unread: number;
  readonly cleanedAt: number;
  readonly cleanMs: number;
  readonly messages: readonly LiyuMessage[];
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BRIDGE + path, { ...init, cache: 'no-store' });
  if (!res.ok) throw new Error('bridge ' + res.status);
  return (await res.json()) as T;
}

/** 拉当前会话状态。 */
export const getState = (): Promise<LiyuState> => req<LiyuState>('/api/state');

/** 标记已读（打开面板时调用）。 */
export const markRead = (): Promise<unknown> => req('/api/read', { method: 'POST' });

/** 发一条消息。 */
export const send = (text: string): Promise<{ ok: boolean; id: number }> =>
  req('/api/send', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  });
