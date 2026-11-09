// 维护工具：把 tools/decks.json（推荐卡组，人工整理，每套有出处）校验后生成 public/decks.js。
// 用法：node tools/build_decks.mjs
// 每套卡组都要：两柱合法、7+3 合法、有出处链接、有自己写的打法要点。指标只收来源里有的（大会成绩、文章热度），不自己打分。
import fs from 'fs';
import { checkDeck, deckPool } from '../public/logic.js';

const KINDS = ['official', 'tournament', 'guide', 'community'];
const { decks } = JSON.parse(fs.readFileSync(new URL('./decks.json', import.meta.url), 'utf8'));
const problems = [], seen = new Map();
const out = decks.map((d) => {
  const sels = d.sels.map(([key, code]) => ({ key, code }));
  let chk;
  try { chk = checkDeck(sels, d.ids); } catch (e) { chk = { ok: false, error: e.message }; }
  if (!chk.ok) problems.push(`${d.id}：${chk.error}`);
  if (!KINDS.includes(d.kind)) problems.push(`${d.id}：未知来源类型 ${d.kind}`);
  if (!/^https:\/\//.test(d.source?.url || '')) problems.push(`${d.id}：缺出处链接`);
  if (!d.note) problems.push(`${d.id}：缺打法要点`);
  // 只收 S10-2 时期的卡组；官方规则书的入门样例例外（2020），界面上会列出之后改过的牌
  if (d.season !== 'S10-2' && !(d.kind === 'official' && d.season === '2020')) problems.push(`${d.id}：版本不是 S10-2（${d.season}）`);
  if (d.kind === 'tournament' && !d.result?.url) problems.push(`${d.id}：大会卡组缺成绩出处`);
  // 同一对女神、同样 10 张牌只留一份
  const key = [...d.sels.map((s) => s.join('')).sort(), ...[...d.ids].sort()].join('|');
  if (seen.has(key)) problems.push(`${d.id}：和 ${seen.get(key)} 卡单完全相同`);
  seen.set(key, d.id);
  // 卡单按牌池顺序排好，方便显示
  let ids = d.ids;
  try { const p = deckPool(sels); ids = [...p.normal, ...p.special].filter((id) => d.ids.includes(id)); } catch { /* 上面已报错 */ }
  const o = { id: d.id, kind: d.kind, sels, ids, title: d.title, author: d.author, date: d.date, season: d.season, source: d.source, note: d.note };
  if (d.result) o.result = d.result;
  if (d.heat) o.heat = d.heat;
  if (d.also) o.also = d.also;   // 同一份卡单的其他出处
  return o;
});
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
out.sort((a, b) => KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind) || b.date.localeCompare(a.date));
fs.writeFileSync(new URL('../public/decks.js', import.meta.url),
  '// 由 tools/build_decks.mjs 生成，不要手改。推荐卡组都来自网上公开来源，每套注明出处；打法要点是本站自己概括的。\nexport const DECKS=' + JSON.stringify(out) + ';\n');
console.log('推荐卡组', out.length, '套', Object.fromEntries(KINDS.map((k) => [k, out.filter((d) => d.kind === k).length])));
