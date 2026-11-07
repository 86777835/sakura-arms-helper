// 维护工具：把 tools/讲解稿.md 和 tools/faq.json 生成为静态页面 public/guide.html。改了这两份资料后运行一次。
// 用法：node tools/build_pages.mjs
import fs from 'fs';

const read = (f) => fs.readFileSync(new URL(f, import.meta.url), 'utf8');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');

// 只支持讲解稿里用到的写法：# / ## 标题、段落、- 列表、1. 列表
function md(src) {
  const out = [];
  let list = null;
  const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const line of src.split('\n')) {
    let m;
    if (!line.trim()) { close(); continue; }
    if ((m = line.match(/^# (.*)/))) { close(); continue; }   // 页面标题另写
    if ((m = line.match(/^## (.*)/))) { close(); out.push(`<h2 id="s${out.length}">${inline(m[1])}</h2>`); continue; }
    if ((m = line.match(/^- (.*)/))) { if (list !== 'ul') { close(); out.push('<ul>'); list = 'ul'; } out.push(`<li>${inline(m[1])}</li>`); continue; }
    if ((m = line.match(/^\d+\. (.*)/))) { if (list !== 'ol') { close(); out.push('<ol>'); list = 'ol'; } out.push(`<li>${inline(m[1])}</li>`); continue; }
    close(); out.push(`<p>${inline(line)}</p>`);
  }
  close();
  return out.join('\n');
}

const guide = read('./讲解稿.md');
const intro = guide.split('\n').find((l) => l && !l.startsWith('#'));
const body = md(guide.slice(guide.indexOf('## ')));
const faq = JSON.parse(read('./faq.json'));
const cats = [...new Set(faq.map((f) => f.cat))];
const faqHtml = cats.map((c) => `<h3>${esc(c)}</h3>` + faq.filter((f) => f.cat === c).map((f) =>
  `<details class="qa"><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p><small>出处：${esc(f.source)}</small></details>`).join('\n')).join('\n');

const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#3b1f2c"><title>规则教程与常见问题 · 散樱乱武组牌助手</title><meta name="description" content="散樱乱武（新幕）新手讲解与线下常见问题，依据新幕规则书、総合ルール和官方 FAQ。"><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/chat.css"><script src="/chat.js" defer></script></head><body class="guide-page"><div id="app">
<header class="bar"><a class="back" href="/" aria-label="返回首页">‹</a><h1>规则教程与常见问题</h1></header>
<nav class="chips pad"><a class="chip" href="#s0">新手讲解</a><a class="chip" href="#faq">常见问题</a></nav>
<article class="doc">
<p class="note">${inline(intro)}</p>
${body}
<h2 id="faq">常见问题</h2>
<p class="note">共 ${faq.length} 条，点问题展开答案。都用本站自己的话写成，并注明出处。</p>
${faqHtml}
</article>
<footer class="credits"><p>本站是玩家自制的非官方工具。原作《桜降る代に決闘を》（BakaFire Party），<a href="https://main-bakafire.ssl-lolipop.jp/furuyoni/" target="_blank" rel="noopener">新幕官网</a>，<a href="https://main-bakafire.ssl-lolipop.jp/furuyoni/na/rule.html" target="_blank" rel="noopener">规则书与 FAQ</a>。</p></footer>
</div></body></html>
`;
fs.writeFileSync(new URL('../public/guide.html', import.meta.url), html);
console.log('guide.html：', cats.length, '类', faq.length, '条问题');
