import {answerProgress} from './sse.js';
import GUIDE from '../tools/讲解稿.md';
import FAQ from '../tools/faq.json';
import { MEGAMI, CARDS } from '../public/data.js';
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
// Web search (2026-11-12, ported from the Pittsburgh pilot): when the tutorial and FAQ don't cover a rules question, the model
// replies only with WEB_MARK + Japanese search words | English search words. Sakura Arms is discussed mostly in Japanese, so the
// server searches the Japanese words first and the English ones only when that finds fewer than 3 pages, then answers again
// from the results. The page labels those answers as web discussion the site has not checked, with their sources.
const WEB_MARK = '【需联网】';
const WEB_RESULTS = 6;
const WEB_NONE = '本站资料里没有这一条，网上也没找到可靠的说法。建议翻一下规则书，或者问问桌上的老玩家。';
// Card names (Chinese = Japanese), for search words and for spotting old card texts in web pages. 「改于 S8-2」: changed after
// the Chinese edition was printed (about S5), so a page may describe an older card.
const CARD_TABLE = MEGAMI.map((m) => `${m.name}（${m.nameJp}）：` + [...new Set(m.variants.flatMap((v) => [...v.normal, ...v.special, ...v.extra].map((c) => c.id)))]
  .map((id) => CARDS[id]).map((c) => `${c.name}=${c.nameJp}${c.updated ? `（改于 ${c.updated}）` : ''}`).join('、')).join('\n');
const webSystem = results => `你是散樱乱武（桜降る代に決闘を 新幕，英文名 Sakura Arms）规则助手，服务线下对局。本站整理的资料里没有这个问题的答案，下面是联网搜索到的网页摘要。

回答要求：
- 只依据这些摘要作答，用 [1] [2] 这样的编号注明依据哪条。
- 优先采信官方（BakaFire Party、碩星楼、官方 FAQ、総合ルール、规则书）的说法；玩家的说法要说明是玩家观点；不同版本或说法冲突时直接指出来。
- 本站的卡牌效果以新幕最终版 S10-2 为准。摘要说的如果是旧版本卡面（新幕早期赛季、第二幕），或者是 2026 年起的新系列「再演」，要指出来，并提醒以新幕最终版为准。下面的卡名对照里标了「改于 S?」的卡，在中文版印刷之后改过效果，尤其要留意。
- 摘要里没有可靠答案就直接说没找到，不要自己推测规则。结论里只写摘要直接支持的内容；问题里摘要没覆盖的部分，明确说“没找到依据”，不要用“按一般规则”去推断。
- 用简体中文，卡名用下面对照表里的中文名，术语用中文版叫法：距、装、命、气、虚、集中力、畏缩、通常牌、王牌、盖牌、弃牌、牌库、追加牌。简短直接：先给结论，再补一两句理由。可以用短列表，不要用表格和标题。

# 卡名对照（中文=日文）
${CARD_TABLE}

# 网页摘要
${results.map((r, i) => `[${i + 1}] ${r.title}（${r.site}）\n${r.summary}`).join('\n\n')}`;

const CHAT_SYSTEM = `你是散樱乱武（桜降る代に決闘を 新幕，英文名 Sakura Arms）规则助手，服务线下对局。

回答要求：
- 只依据下面的「讲解稿」和「常见问题」作答，回答时注明出处（规则书页码、総合ルール条款或官方 FAQ），不得编造规则。
- 资料里找不到答案的散樱乱武规则问题（包括某张卡怎么结算），不要自己回答，也不要解释为什么查不到：整个回复只有一行，以${WEB_MARK}开头，后面接日文搜索词，再接「 | 」和英文搜索词。日文搜索词以「桜降る代に決闘を」开头，卡名用下面对照表里的日文名；英文搜索词以「Sakura Arms」开头。例如：${WEB_MARK}桜降る代に決闘を 浦波嵐 対応 | Sakura Arms Urahanami Storm reaction。网站会去网上查。
- 与本游戏无关的问题，礼貌说明你只解答散樱乱武的规则，不要输出${WEB_MARK}。
- 本站只覆盖神秘岛新幕中文版收录的 18 柱女神，卡牌效果以新幕最终版 S10-2 为准，中文版印刷后改过的卡（对照表里标「改于 S?」）可能和玩家手里的卡面不同。
- 用简体中文，术语用中文版叫法：距、装、命、气、虚、集中力、畏缩、通常牌、王牌、盖牌、弃牌、牌库、追加牌。简短直接：先给结论，再补一两句理由。可以用短列表，不要用表格和标题。不要提供卡组强弱排行或胜率。

# 讲解稿
${GUIDE}

# 常见问题
${FAQ.map(f => `【${f.cat}】${f.q}：${f.a}（${f.source}）`).join('\n')}

# 卡名对照（中文=日文）
${CARD_TABLE}`;

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
  const history = msgs.slice(-10).map(m => ({ role: m.role, content: m.content }));
  let messages = [{ role: 'system', content: CHAT_SYSTEM }, ...history];
  const fails = [];   // HTTP status, 0 = unreachable or error, 'queue' = no answer started in time or stalled
  const order = await env.CHAT_STATE.get(DEEPSEEK_DOWN) ? ORDER.deepseekDown : ORDER.normal;
  let cur = await firstAnswer(order, 0, env, messages, fails);
  if (!cur) return Response.json({ error: chatFailed(fails) }, { status: 502 });
  const enc = new TextEncoder(), dec = new TextDecoder();
  const event = o => enc.encode(`data: ${JSON.stringify(o)}\n\n`);
  const say = text => event({ choices: [{ delta: { content: text } }] });
  let lastData = Date.now(), searched = false, raw = '', pend = '';   // raw: the current model's stream so far, as text
  // Only whole lines go to the page, so dropping the rest of a model's stream (search, backup model) never leaves it half a line.
  // Returns whether anything went out.
  const forward = (c, text) => {
    pend += text;
    const cut = pend.lastIndexOf('\n') + 1;
    if (cut) { c.enqueue(enc.encode(pend.slice(0, cut))); pend = pend.slice(cut); }
    return cut > 0;
  };
  const headText = () => cur.head.map(v => dec.decode(v, { stream: true })).join('');
  // The model asked to search: tell the page, search, then answer again from the results. Returns false when the
  // stream is finished (nothing found, or no model answered), true when `cur` is the answer from the results.
  async function web(c, query) {
    cur.reader.cancel().catch(() => {});
    searched = true;
    c.enqueue(event({ searching: true }));
    const found = await webSearch(env, query, history.at(-1).content);
    console.log('chat web search', JSON.stringify(query), found ? found.length : 'failed');   // for the usage brief: questions the FAQ lacks
    if (!found?.length) {
      c.enqueue(event({ web: [] }));
      c.enqueue(say(found ? WEB_NONE : '本站资料里没有这一条，联网查找也失败了，请过一会儿再问，或者翻一下规则书。'));
      c.close(); return false;
    }
    messages = [{ role: 'system', content: webSystem(found) }, ...history];
    const next = await firstAnswer(order, 0, env, messages, fails);
    if (!next) { c.enqueue(event({ error: chatFailed(fails) })); c.close(); return false; }
    cur = next; lastData = Date.now(); raw = ''; pend = '';
    c.enqueue(event({ web: found.map(r => ({ title: r.title, url: r.url, site: r.site })) }));
    return true;
  }
  // Before anything reaches the page, look at how the answer starts. The search itself runs in the first pull:
  // Workers starts pulling without waiting for an async start().
  let query = await webQuery(cur);
  const body = new ReadableStream({
    start(c) { if (query === null) { raw = headText(); forward(c, raw); } },
    async pull(c) {
      if (query !== null) {
        const q = query; query = null;
        if (await web(c, q)) forward(c, headText());
        return;
      }
      // A pull that sends nothing is never followed by another one: read on until a whole line can go out.
      for (;;) {
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
          cur = next; lastData = Date.now(); raw = ''; pend = '';
          c.enqueue(event({ reset: CHAT_MODELS[cur.i].name }));   // the page drops the partial answer and starts over
          // the backup model may ask to search too (only from the tutorial-and-FAQ round)
          const q2 = searched ? null : await webQuery(cur);
          if (q2 !== null && !(await web(c, q2))) return;
          const head = headText();
          if (!searched) raw = head;
          forward(c, head);
          return;
        }
        if (r.done) { if (pend) c.enqueue(enc.encode(pend)); return c.close(); }
        if (cur.progress(r.value)) lastData = Date.now();
        const piece = dec.decode(r.value, { stream: true });
        if (!searched) {
          // The model sometimes explains first and asks to search at the end: stop there and search instead
          // (the page clears what it showed when the search starts).
          raw += piece;
          const text = sseText(raw), at = text.indexOf(WEB_MARK);
          if (at >= 0) {
            const q = (text.slice(at + WEB_MARK.length) + await restText(cur)).trim().split('\n')[0].trim().slice(0, 240);
            console.log('chat web mark mid-answer');
            if (await web(c, q)) forward(c, headText());
            return;
          }
        }
        if (forward(c, piece)) return;
      }
    },
    cancel() { cur.reader.cancel().catch(() => {}); }
  });
  const h = { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache' };
  if (cur.i) h['x-chat-fallback'] = CHAT_MODELS[cur.i].name;
  return new Response(body, { headers: h });
}

// Text of the answer in a model's raw stream (DeepSeek and Workers AI both send OpenAI-style chunks).
function sseText(raw) {
  let text = '';
  for (const line of raw.split('\n')) {
    if (!line.startsWith('data:')) continue;
    try { const j = JSON.parse(line.slice(5)); text += j.choices?.[0]?.delta?.content ?? j.response ?? ''; } catch {}
  }
  return text;
}
const streamText = chunks => { const dec = new TextDecoder(); return sseText(chunks.map(v => dec.decode(v, { stream: true })).join('')); };

// The rest of a model's answer as text (for the search words after the marker), waiting at most STALL_MS.
async function restText(cur) {
  const dec = new TextDecoder(), until = Date.now() + STALL_MS;
  let raw = '';
  for (;;) {
    let r;
    try { r = await Promise.race([cur.reader.read(), new Promise(ok => setTimeout(() => ok({ done: true }), Math.max(0, until - Date.now())))]); } catch { r = { done: true }; }
    if (r.done) return sseText(raw);
    raw += dec.decode(r.value, { stream: true });
  }
}

// Reads ahead (into cur.head) until the answer's first characters show whether it is a search request.
// Returns the search words, or null for an ordinary answer. Stops reading after STALL_MS; the stream's own stall check takes over.
async function webQuery(cur) {
  const until = Date.now() + STALL_MS;
  for (;;) {
    const text = streamText(cur.head).trimStart();
    const marked = text.startsWith(WEB_MARK);
    if (!marked && (text.length >= WEB_MARK.length || !WEB_MARK.startsWith(text))) return null;
    let r;
    try { r = await Promise.race([cur.reader.read(), new Promise(ok => setTimeout(() => ok('late'), Math.max(0, until - Date.now())))]); } catch { r = { done: true }; }
    if (r === 'late' || r.done) return marked ? text.slice(WEB_MARK.length).trim().slice(0, 240) : null;
    cur.head.push(r.value);
  }
}

// DeepSeek's search API. Sakura Arms is discussed mostly in Japanese (official FAQ, comprehensive rules, players' blogs), so the
// Japanese words go first; with fewer than 3 results, the English words over the whole web. `query` is
// "日文搜索词 | English words" from the model. Returns [{ title, url, site, summary }] (possibly empty), or null when the search failed.
async function webSearch(env, query, question) {
  let [ja, en] = query.split('|').map(s => s.trim());
  if (!ja) ja = `桜降る代に決闘を ${question}`;
  const first = await searchOnce(env, ja.slice(0, 128), question);
  if (first === null || first.length >= 3 || !en) return first;
  const more = await searchOnce(env, en.slice(0, 128), question);
  if (more === null) return first;
  const seen = new Set(first.map(r => r.url));
  return [...first, ...more.filter(r => !seen.has(r.url))].slice(0, WEB_RESULTS);
}
async function searchOnce(env, query, question) {
  const base = env.DEEPSEEK_BASE || 'https://api.deepseek.com';   // DEEPSEEK_BASE: set only by the local tests
  try {
    const r = await fetch(`${base}/v1/tools/search`, {
      method: 'POST', signal: AbortSignal.timeout(6000),
      headers: { 'content-type': 'application/json', authorization: `Bearer ${env.DEEPSEEK_API_KEY}` },
      body: JSON.stringify({ query, ori_question: question.slice(0, 128), count: 10 })
    });
    if (!r.ok) { console.log('chat web search error', r.status, (await r.text()).slice(0, 300)); return null; }
    const { results = [] } = await r.json();
    return results.filter(x => x.url && (x.summary || x.snippet)).slice(0, WEB_RESULTS)
      .map(x => ({ title: x.title || x.url, url: x.url, site: x.site_name || new URL(x.url).hostname, summary: (x.summary || x.snippet).slice(0, 900) }));
  } catch (e) { console.log('chat web search failed', String(e).slice(0, 200)); return null; }
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
