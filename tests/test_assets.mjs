// 资源：数据里引用的每张卡图、塔罗牌都能从本地 wrangler dev 拿到；没有多余的卡图文件。
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { MEGAMI, CARDS } from '../public/data.js';
const BASE = process.argv[2] || 'http://localhost:8931/';
assert(['localhost', '127.0.0.1'].includes(new URL(BASE).hostname));

const need = new Set();
for (const c of Object.values(CARDS)) { need.add(`img/cards/${c.image}.webp`); if (c.oldImage) need.add(`img/cards/${c.oldImage}.webp`); }
const tarots = { '02-o': 'tarot_02_s6_2', '02-a1': 'tarot_02_a1_s6_2', '02-a2': 'tarot_02_a2_s6_2', '08-o': 'tarot_08_s9_2' };
for (const m of MEGAMI) for (const v of m.variants) need.add(`img/tarot/${tarots[`${m.key}-${v.code}`] || `tarot_${m.key}${v.code === 'o' ? '' : '_' + v.code}`}.webp`);
for (const f of ['img/tarot/tarotback.webp', 'img/ui/sakura_token.webp', 'vendor/html2canvas.min.js', 'guide.html', 'chat.js', 'chat.css', 'setup.js']) need.add(f);

const bad = [];
await Promise.all([...need].map(async (f) => { const r = await fetch(BASE + f); if (r.status !== 200) bad.push(`${r.status} ${f}`); await r.arrayBuffer(); }));
assert.deepEqual(bad, []);

const onDisk = readdirSync(new URL('../public/img/cards/', import.meta.url)).map((f) => 'img/cards/' + f);
const extra = onDisk.filter((f) => !need.has(f));
assert.deepEqual(extra, [], '有没用到的卡图');
console.log(`test_assets 通过（${need.size} 个文件）`);
