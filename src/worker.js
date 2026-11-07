// 散樱乱武组牌助手：静态页面 + 规则助手。组牌全在浏览器里完成，服务器不保存牌组。
import { chat } from './chat.js';
export default {
  async fetch(req, env) {
    const u = new URL(req.url);
    if (u.pathname === '/api/chat' && req.method === 'POST') return chat(req, env);
    if (u.pathname === '/api/chat-log') {
      // 页面上看到的断线情况，记到日志里
      if (req.method === 'POST') console.log('chat page error', (await req.text()).slice(0, 500));
      return new Response(null, { status: 204 });
    }
    return new Response('Not found', { status: 404 });
  },
};
