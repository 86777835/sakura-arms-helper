// 维护工具：把卡牌骨架（make_skeleton.mjs 生成）与人工核对结果合并成网站用的 public/data.js。
// 网站只发布卡名、数值、自己写的效果概括和更新说明，不发布官方卡面文字（textJp / textCn 不进 data.js）。
// 用法：node tools/build_data.mjs <skeleton.json> <cards.json>
//   cards.json：tools/cards.json，人工核对后的逐卡结果（fix / summary / changeNote）与形态说明。
import fs from 'fs';

const [skFile, reviewFile] = process.argv.slice(2);
const sk = JSON.parse(fs.readFileSync(skFile, 'utf8'));
const review = JSON.parse(fs.readFileSync(reviewFile, 'utf8'));

// variable：でゅーぷりぎあ 的类型随复制对象而定；transform：サリヤ的 TransForm 牌；extra：ライラ『祈祷師』的【嵐の力】（不是牌）
const TYPES = { attack: '攻击', action: '行动', enhance: '付与', reaction: '对应', fullpower: '全力', variable: '不定', transform: '变形', extra: '' };
const CARDS = {};
const problems = [];

function addCard(c) {
  const r = review.cards[c.id];
  if (!r) { problems.push('没有核对结果：' + c.id); return; }
  const f = { ...c, ...r.fix };
  for (const t of f.types) if (!(t in TYPES)) problems.push('未知类型：' + c.id + ' ' + t);
  if (f.updatedAfterCn && !r.changeNote) problems.push('缺更新说明：' + c.id);
  const card = {
    id: f.id, name: f.name, nameJp: f.nameJp, kind: f.kind, types: f.types,
    range: f.range, damage: f.damage, rangeOpened: f.rangeOpened, damageOpened: f.damageOpened,
    cost: f.cost, capacity: f.capacity, summary: r.summary ?? '',
    updated: f.updatedAfterCn ? f.finalSeason : null, changeNote: f.updatedAfterCn ? r.changeNote : null,
    image: f.image, oldImage: f.oldImage,
  };
  for (const k of Object.keys(card)) if (card[k] === null || card[k] === undefined) delete card[k];
  if (CARDS[c.id]) {
    // 共用卡（「合奏」）在两位女神里各有一份卡图文件，内容相同，用第一份
    const strip = ({ image, oldImage, ...x }) => JSON.stringify(x);
    if (strip(CARDS[c.id]) !== strip(card)) problems.push('同一 id 两份数据不一致：' + c.id);
    return;
  }
  CARDS[c.id] = card;
}

const MEGAMI = sk.map((m) => ({
  key: m.key, name: m.name, nameJp: m.nameJp,
  variants: m.variants.map((v) => {
    for (const c of [...v.normal, ...v.special, ...v.extra]) addCard(c);
    // 追加牌里同一张卡的多份（例如两张灭灯毒）合并成张数
    const extra = [];
    for (const c of v.extra) {
      const e = extra.find((x) => x.id === c.id);
      if (e) e.count++; else extra.push({ id: c.id, count: 1 });
    }
    const out = {
      code: v.code, weapon: v.weapon, box: v.box,
      normal: v.normal.map((c) => (c.replaces ? { id: c.id, replaces: c.replaces } : { id: c.id })),
      special: v.special.map((c) => (c.replaces ? { id: c.id, replaces: c.replaces } : { id: c.id })),
      extra,
    };
    const note = review.variantNotes?.[`${m.key}-${v.code}`];
    if (note) out.note = note;
    return out;
  }),
}));

for (const id of Object.keys(review.cards)) if (!CARDS[id]) problems.push('核对结果里有多余的卡：' + id);
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }

const header = '// 由 tools/build_data.mjs 生成，不要手改。卡牌效果为本站自行概括，以新幕最终版 S10-2 为准；卡名译名参考社区数据。\n';
fs.writeFileSync(new URL('../public/data.js', import.meta.url),
  header + 'export const MEGAMI=' + JSON.stringify(MEGAMI) + ';\nexport const CARDS=' + JSON.stringify(CARDS) + ';\n');
console.log('女神', MEGAMI.length, '卡', Object.keys(CARDS).length);
