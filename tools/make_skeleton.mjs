// 维护工具：从社区数据（FuruyoniRandom 的新幕 S10-2 日文/中文数据）和官方コモンズ卡图文件名，
// 生成中文版收录范围（18 柱、13 个异相）的卡牌骨架。效果概括由人工另写，不在这里生成。
// 用法：node tools/make_skeleton.mjs <sakura-s10-2-ch.js> <commons cards 目录> <输出 json>
import fs from 'fs';

const [chFile, cardDir, outFile] = process.argv.slice(2);
const load = (f) => {
  const src = fs.readFileSync(f, 'utf8');
  const v = src.match(/const\s+(\w+)\s*=\s*\[/)[1];
  return new Function(src.replace(/export\s+default[\s\S]*$/, '') + `;return ${v};`)();
};
const ch = load(chFile);

// 中文版收录：女神编号 → 收录的异相（sdrice 里的形态名）
const SCOPE = {
  1: ['古刀'], 2: ['琵琶', '拒'], 3: ['炎'], 4: ['笛'], 5: ['战略'], 6: ['社交'], 7: ['经'], 8: [],
  9: ['绊'], 10: ['机器'], 11: ['新型'], 12: ['岚'], 13: ['尘'], 14: [], 15: [], 16: [], 17: [], 18: [],
};
// 收录在哪个盒（日文产品名）
const BOX_O = { 1: 'basic', 2: 'basic', 3: 'basic', 4: 'basic', 5: 'expert', 6: 'expert', 7: 'expert', 8: 'expert', 9: 'expert', 10: 'expert', 11: 'expert', 12: 'expert', 13: 'ex1', 14: 'ex2', 15: 'ex3', 16: 'ex3', 17: 'ex4', 18: 'ex4' };
const BOX_A = { '01-a1': 'ex1', '02-a1': 'ex1', '03-a1': 'ex1', '04-a1': 'ex1', '05-a1': 'ex2', '09-a1': 'ex2', '13-a1': 'ex2', '07-a1': 'ex3', '10-a1': 'ex3', '02-a2': 'ex3', '06-a1': 'ex4', '11-a1': 'ex4', '12-a1': 'ex4' };

const ORDER = ['', 's2', 's3', 's4', 's5', 's6', 's6_2', 's7', 's7_2', 's8', 's8_2', 's9', 'rework', 's9_5', 's10', 's10_2'];
const SEASON = { '': '初版', s2: 'S2', s3: 'S3', s4: 'S4', s5: 'S5', s6: 'S6', s6_2: 'S6-2', s7: 'S7', s7_2: 'S7-2', s8: 'S8', s8_2: 'S8-2', s9: 'S9', rework: 'S9（重做）', s9_5: 'S9-2', s10: 'S10', s10_2: 'S10-2' };
const files = fs.readdirSync(cardDir).filter((f) => /^na_\d\d_.*\.png$/.test(f));
const versions = {};
for (const f of files) {
  const m = f.replace(/\.png$/, '').match(/^(.*?)(?:_(s\d+(?:_\d)?|rework))?$/);
  (versions[m[1]] ||= []).push(m[2] || '');
}
for (const k in versions) versions[k].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));

// 共用卡（例：『第二章』サイネ与『旅芸人』トコヨ的「合奏」）的 id 形如 02/04-saine/tokoyo-a1-n-1/4，按所属女神取各自的卡图
const ownId = (id, key) => {
  if (!id.includes('/')) return id;
  const parts = id.split('-').map((p) => p.split('/'));
  const i = parts[0].indexOf(key);
  if (i < 0) throw new Error('共用卡不属于 ' + key + '：' + id);
  return parts.map((p) => p[p.length > 1 ? i : 0]).join('-');
};
const img = (id) => {
  const base = 'na_' + id.replace(/-/g, '_');
  const v = versions[base];
  if (!v) throw new Error('没有对应卡图：' + id);
  for (const s of v) if (!ORDER.includes(s)) throw new Error('未知版本后缀：' + base + ' ' + s);
  const final = v[v.length - 1];
  const cn = v.filter((s) => ORDER.indexOf(s) <= ORDER.indexOf('s5')).pop();
  return {
    image: base + (final ? '_' + final : ''),
    finalSeason: SEASON[final],
    updatedAfterCn: ORDER.indexOf(final) > ORDER.indexOf('s5'),
    oldImage: ORDER.indexOf(final) > ORDER.indexOf('s5') && cn !== undefined ? base + (cn ? '_' + cn : '') : null,
  };
};

const card = (c, key) => ({
  id: c.id.includes('/') ? 'shared-' + c.id : c.id, name: c.name, nameJp: c.namejp, kind: c.baseType, types: c.types || [],
  range: c.range || null, damage: c.damage || null,
  // 雪灯的双面卡：range/damage 是合伞面，下面两个是开伞面
  rangeOpened: c.rangeOpened || null, damageOpened: c.damageOpened || null, cost: c.cost ?? null, capacity: c.capacity ?? null,
  replaces: c.changeIndex ? Number(c.changeIndex) : null,
  textJp: c.textjp || '', textCn: c.text || '', ...img(ownId(c.id, key)),
});

const out = [];
let curKey = '';
const megamiKeyOf = () => curKey;
ch.forEach((g, i) => {
  const no = i + 1;
  if (no > 18) return;
  curKey = String(no).padStart(2, '0');
  const [o, ...as] = g.list;
  const extrasOf = (l) => [...(l.extra || []), ...(l.poison || []), ...(l.transform || []), ...(l.changeExtra || []), ...(l.changeTransform || []), ...(l.girlBoard || [])];
  const megami = {
    no, key: String(no).padStart(2, '0'), name: g.name.split(' ').slice(1).join(' '), nameJp: g.namejp, romaji: g.name.split(' ')[0],
    variants: [{ code: 'o', weapon: o.name, box: BOX_O[no], normal: o.normal.map((c) => card(c, megamiKeyOf(c))), special: o.special.map((c) => card(c, megamiKeyOf(c))), extra: extrasOf(o).map((c) => card(c, megamiKeyOf(c))) }],
  };
  as.forEach((a) => {
    if (!SCOPE[no].includes(a.name)) return;
    const code = (a.changenormal?.[0] || a.changespecial?.[0]).id.split('-')[2];
    megami.variants.push({ code, weapon: a.name, box: BOX_A[`${megami.key}-${code}`], normal: (a.changenormal || []).map((c) => card(c, megamiKeyOf(c))), special: (a.changespecial || []).map((c) => card(c, megamiKeyOf(c))), extra: extrasOf(a).map((c) => card(c, megamiKeyOf(c))) });
  });
  for (const v of megami.variants) if (!v.box) throw new Error('没有盒子归属：' + megami.key + v.code);
  out.push(megami);
});
fs.writeFileSync(outFile, JSON.stringify(out, null, 1));
const n = out.flatMap((m) => m.variants.flatMap((v) => [...v.normal, ...v.special, ...v.extra]));
console.log('女神', out.length, '形态', out.reduce((s, m) => s + m.variants.length, 0), '卡', n.length, 'S6 后更新', n.filter((c) => c.updatedAfterCn).length);
