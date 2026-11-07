import {answerProgress} from './sse.js';
import GUIDE from '../tools/讲解稿.md';
import FAQ from '../tools/faq.json';
// Rules assistant: answers from the tutorial script and FAQ (both written from the official rulebook, comprehensive rules and FAQ) via DeepSeek.
// Tried in order. The next one answers when the one before is overloaded, queueing, erroring, unreachable or stalls mid-answer;
// the log records which one answered (also sent to the page as an x-chat-fallback header or a reset event mid-stream).
// The Cloudflare model runs on Workers AI (free plan), so it still works when DeepSeek's own servers are overloaded.
const CHAT_MODELS = [
  { id: 'deepseek-flash', name: 'DeepSeek V4.1 Flash' },
  { id: '@cf/qwen/qwen3.8-27b', name: 'Qwen3.8 27B (Cloudflare)' },
  { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro' }
];
const FIRST_DATA_MS = 9000;   // three models × 9 s stays under the page's 30 s wait
const STALL_MS = 8000;        // an answer that pauses this long mid-way is dropped and asked again of the next model
// Hourly check: Pittsburgh's worker (brass-pittsburgh-room) asks DeepSeek every hour and, when it doesn't answer, writes this key
// to its KV namespace. This account's free plan has no cron trigger left, so this site only reads that key (CHAT_STATE is
// bound to Pittsburgh's namespace in wrangler.jsonc) and puts Qwen first while it is there.
const DEEPSEEK_DOWN = 'deepseek-down';   // KV key; expires on its own a little after the next hourly check
const ORDER = { normal: [0, 1, 2], deepseekDown: [1, 0, 2] };   // indexes into CHAT_MODELS
const CHAT_SYSTEM = `你是散樱乱武（桜降る代に決闘を 新幕）规则助手，服务线下对局。只依据以下本站讲解稿和常见问题回答，资料里没有的就明确说“本站未收录，请查官方规则书或 FAQ”，不得编造。回答时注明出处（规则书页码、総合ルール条款或官方 FAQ）。本站只覆盖神秘岛新幕中文版收录的 18 柱女神，卡牌效果以新幕最终版 S10-2 为准，中文版印刷后改过的卡可能和玩家手里的卡面不同。术语用中文版叫法：距、装、命、气、虚、集中力、畏缩、通常牌、王牌、盖牌、弃牌、牌库、追加牌。不要提供卡组强弱排行或胜率。
# 讲解稿
${GUIDE}
# 常见问题
${FAQ.map(f => `【${f.cat}】${f.q}：${f.a}（${f.source}）`).join('\n')}`;

async function chat(req, env) {
  if (!env.DEEPSEEK_API_KEY) return Response.json({ error: '规则助手还没有配置好，请稍后再试' }, { status: 503 });
  const { success } = await env.CHAT_LIMIT.limit({ key: req.headers.get('cf-connecting-ip') || 'local' });
  if (!success) return Response.json({ error: '问得有点快，请过一分钟再问' }, { status: 429 });
  let msgs;
  try { msgs = (await req.json()).messages; } catch { msgs = null; }
  const valid = Array.isArray(msgs) && msgs.length > 0 && msgs.length <= 20 && msgs.at(-1).role === 'user' && msgs.at(-1).content?.length <= 500
    && msgs.every(m => ['user', 'assistant'].includes(m?.role) && typeof m.content === 'string' && m.content.trim() && m.content.length <= 3000);
  if (!valid) return Response.json({ error: '问题格式不对，请刷新页面再试' }, { status: 400 });
  console.log('chat question', JSON.stringify(msgs.at(-1).content));   // what players ask, for the usage brief
  const messages = [{ role: 'system', content: CHAT_SYSTEM }, ...msgs.slice(-10).map(m => ({ role: m.role, content: m.content }))];
  const fails = [];   // HTTP status, 0 = unreachable or error, 'queue' = no answer started in time or stalled
  const order = await env.CHAT_STATE.get(DEEPSEEK_DOWN) ? ORDER.deepseekDown : ORDER.normal;
  let cur = await firstAnswer(order, 0, env, messages, fails);
  if (!cur) return Response.json({ error: chatFailed(fails) }, { status: 502 });
  const enc = new TextEncoder();
  const event = o => enc.encode(`data: ${JSON.stringify(o)}\n\n`);
  let lastData = Date.now();
  const body = new ReadableStream({
    start(c) { cur.head.forEach(v => c.enqueue(v)); },
    async pull(c) {
      // Only nonempty answer text counts as progress, not keep-alives, roles or reasoning.
      let timer, r;
      const stall = new Promise(ok => { timer = setTimeout(() => ok('stall'), Math.max(0, lastData + STALL_MS - Date.now())); });
      try { r = await Promise.race([cur.reader.read(), stall]); } catch (e) { r = 'broken'; console.log('chat model broke mid-answer', CHAT_MODELS[cur.i].id, String(e).slice(0, 200)); }
      clearTimeout(timer);
      if (r === 'stall' || r === 'broken') {
        if (r === 'stall') console.log(`chat model stalled ${STALL_MS / 1000}s mid-answer`, CHAT_MODELS[cur.i].id);
        fails.push(r === 'stall' ? 'queue' : 0);
        cur.reader.cancel().catch(() => {});
        const next = await firstAnswer(order, cur.k + 1, env, messages, fails);
        if (!next) { c.enqueue(event({ error: chatFailed(fails) })); return c.close(); }
        cur = next; lastData = Date.now();
        c.enqueue(event({ reset: CHAT_MODELS[cur.i].name }));   // the page drops the partial answer and starts over
        cur.head.forEach(v => c.enqueue(v));
        return;
      }
      if (r.done) return c.close();
      if (cur.progress(r.value)) lastData = Date.now();
      c.enqueue(r.value);
    },
    cancel() { cur.reader.cancel().catch(() => {}); }
  });
  const h = { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache' };
  if (cur.i) h['x-chat-fallback'] = CHAT_MODELS[cur.i].name;
  return new Response(body, { headers: h });
}

const chatFailed = fails => fails.some(f => f === 503 || f === 429 || f === 'queue')   // overloaded / throttled / queueing
  ? 'AI 服务器都在忙，请过一两分钟再问' : `规则助手暂时不可用（${fails.join('/')}），请稍后再试`;

// The first model from position `from` in `order` that starts answering:
// { k: position, i: index into CHAT_MODELS, reader, head (chunks read so far) }, or null.
async function firstAnswer(order, from, env, messages, fails) {
  for (let k = from; k < order.length; k++) {
    const i = order[k], o = await openModel(i, env, messages, fails);
    if (o) { if (i) console.log('chat fallback answered', CHAT_MODELS[i].id); return { k, i, ...o }; }
  }
  return null;
}

// Starts model i and waits up to FIRST_DATA_MS for its first answer text. An overloaded DeepSeek may accept the request
// and then only send keep-alive comments while it waits in a queue. On failure, logs it, adds to `fails`, returns null.
async function openModel(i, env, messages, fails) {
  const { id } = CHAT_MODELS[i];
  const model = id.startsWith('@cf/') ? env.CHAT_CF_MODEL || id : id;   // CHAT_CF_MODEL: set only by the local tests
  const base = env.DEEPSEEK_BASE || 'https://api.deepseek.com';         // DEEPSEEK_BASE: set only by the local tests
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), FIRST_DATA_MS);
  const late = new Promise((_, no) => ctl.signal.addEventListener('abort', () => no(new Error('timeout'))));
  let reader;
  try {
    let stream;
    if (model.startsWith('@cf/')) {
      stream = await Promise.race([env.AI.run(model, { messages, stream: true, max_tokens: 900, temperature: 0.3, chat_template_kwargs: { enable_thinking: false } }), late]);
    } else {
      const r = await fetch(`${base}/chat/completions`, {
        method: 'POST', signal: ctl.signal,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${env.DEEPSEEK_API_KEY}` },
        body: JSON.stringify({ model, stream: true, thinking: { type: 'disabled' }, max_tokens: 900, temperature: 0.3, messages })
      });
      if (!r.ok) { clearTimeout(timer); fails.push(r.status); console.log('chat model error', model, r.status, (await r.text()).slice(0, 500)); return null; }
      stream = r.body;
    }
    reader = stream.getReader();
    const head = [], progress = answerProgress();
    let started = false;
    while (!started) {
      const { done, value } = await Promise.race([reader.read(), late]);
      if (done) break;
      head.push(value); started = progress(value);
    }
    clearTimeout(timer);
    if (!started) { fails.push(502); console.log('chat model empty reply', model); return null; }
    return { reader, head, progress };
  } catch (e) {
    clearTimeout(timer); reader?.cancel().catch(() => {});
    const queued = ctl.signal.aborted;
    fails.push(queued ? 'queue' : 0);
    console.log('chat model', queued ? `queued over ${FIRST_DATA_MS / 1000}s` : 'failed', model, String(e).slice(0, 300));
    return null;
  }
}


export {chat};
