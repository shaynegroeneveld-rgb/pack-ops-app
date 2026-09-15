export interface MaterialSearchItem {
  name: string;
  sku?: string | null;
  category?: string | null;
  notes?: string | null;
  aliases?: readonly string[];
  searchCodes?: readonly string[];
}

const substitutions: Array<[RegExp, string]> = [
  [/\b(?:pot\s*lights?|downlights?|recessed\s*lights?)\b/g, "recessed light"],
  [/\b(?:mar+ettes?|wire\s*nuts?)\b/g, "wire connector"],
  [/\bromex\b|\bnmd\s*90\b/g, "nmd"],
  [/\b(?:gfci|gfi|ground\s*fault(?:\s*circuit\s*interrupter)?)\b/g, "groundfault"],
  [/\b(?:afci|arc\s*fault(?:\s*circuit\s*interrupter)?)\b/g, "arcfault"],
  [/\b(?:electrical\s*metallic\s*tubing)\b/g, "emt"],
  [/\b(?:receptacles?|receps?|recpt|plugs?|outlets?)\b/g, "receptacle"],
  [/\b(?:connectors?|conns?)\b/g, "connector"],
  [/\b(?:junction\s*boxes|junction\s*box|j\s*box)\b/g, "junction box"],
  [/\bboxes\b/g, "box"], [/\bswitches\b/g, "switch"],
  [/\bbreakers\b/g, "breaker"], [/\blights\b/g, "light"],
  [/\bplates\b/g, "plate"], [/\bcouplings\b/g, "coupling"],
  [/\bstaples\b/g, "staple"], [/\bcables\b/g, "cable"],
  [/\bwires\b/g, "wire"], [/\bfittings\b/g, "fitting"],
  [/\b(?:amps?|amperes?)\b/g, "a"], [/\bvolts?\b/g, "v"],
];

export function normalizeMaterialSearch(value: string): string {
  let text = value.toLowerCase().replace(/[¼½¾⅛⅜⅝⅞]/g, c => ` ${{'¼':'1/4','½':'1/2','¾':'3/4','⅛':'1/8','⅜':'3/8','⅝':'5/8','⅞':'7/8'}[c]} `)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[⁄∕]/g, '/')
    .replace(/(\d)(inches|inch|in|mm)\b/g, '$1 $2');
  // Cable designations are specifications, not fractions: 14/2 = 2C14.
  text = text.replace(/\b(30|28|26|24|22|20|18|16|14|12|10)\s*\/\s*([2-9])\b/g, '$2c$1')
    .replace(/\b(8|6)\s*\/\s*([234])\b/g, '$2c$1')
    .replace(/\b([2-9])\s*c\s*(30|28|26|24|22|20|18|16|14|12|10|8|6|4|3|2|1)\b/g, '$1c$2');
  text = text.replace(/\b(\d+)[\s-]+(\d+)\s*\/\s*(\d+)\b/g, (_all, whole, numerator, denominator) => Number(denominator) ? String(Number(whole) + Number(numerator) / Number(denominator)) : _all)
    .replace(/\b(\d+)\s*\/\s*(\d+)\b/g, (all, numerator, denominator) => Number(denominator) ? String(Number(numerator) / Number(denominator)) : all)
    .replace(/(\d)(?:inches|inch|in)\b/g, '$1 ')
    .replace(/\b(?:inches|inch|in)\b/g, ' ')
    .replace(/\b(\d+)(a|v|w|mm)\b/g, '$1 $2');
  // Trade descriptions often join a quantity/specification to its word.
  // Keep cable designations and arbitrary supplier codes intact.
  text = text.replace(/\b(\d+(?:\.\d+)?)[\s-]*(gangs?|poles?|amps?|amperes?|volts?|watts?|mm)\b/g, '$1 $2')
    .replace(/\bgangs\b/g, 'gang').replace(/\bpoles\b/g, 'pole')
    .replace(/\bwatts?\b/g, 'w');
  for (const [pattern, replacement] of substitutions) text = text.replace(pattern, replacement);
  return (text.match(/(?:\d*\.\d+|[a-z0-9]+)/g) ?? []).map(token => /^\d*(?:\.\d+)?$/.test(token) ? String(Number(token)) : token).join(' ');
}

export function buildCatalogSearchText(item: MaterialSearchItem): string {
  return [item.name, item.sku, item.category, ...(item.aliases ?? []), item.notes].filter(Boolean).join(' ');
}
function oneEditApart(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a.length === b.length) {
    const differences = [...a].map((c, i) => c === b[i] ? -1 : i).filter(i => i >= 0);
    return differences.length === 1 || (differences.length === 2 && differences[1] === differences[0]! + 1 && a[differences[0]!] === b[differences[1]!] && a[differences[1]!] === b[differences[0]!]);
  }
  const short = a.length < b.length ? a : b, long = a.length < b.length ? b : a;
  let i = 0, j = 0, edits = 0;
  while (i < short.length && j < long.length) {
    if (short[i] === long[j]) { i++; j++; }
    else { j++; if (++edits > 1) return false; }
  }
  return true;
}
type SearchRecord = { signature: string; name: string; aliases: string[]; fields: Array<{ words: string[]; weight: number }>; sku: string };
const records = new WeakMap<MaterialSearchItem, SearchRecord>();
function prepare(item: MaterialSearchItem): SearchRecord {
  const signature = JSON.stringify([item.name, item.sku, item.aliases, item.category, item.notes]);
  const cached = records.get(item);
  if (cached?.signature === signature) return cached;
  const name = normalizeMaterialSearch(item.name), aliases = (item.aliases ?? []).map(normalizeMaterialSearch);
  const record = { signature, name, aliases, sku: (item.sku ?? '').toLowerCase().replace(/[^a-z0-9]/g, ''), fields: [
    { words: name.split(' '), weight: 130 },
    { words: aliases.flatMap(alias => alias.split(' ')), weight: 115 },
    { words: normalizeMaterialSearch(item.sku ?? '').split(' '), weight: 120 },
    { words: normalizeMaterialSearch(item.category ?? '').split(' '), weight: 65 },
    { words: normalizeMaterialSearch(item.notes ?? '').split(' '), weight: 20 },
  ] };
  records.set(item, record);
  return record;
}
function score(item: MaterialSearchItem, query: string, normalized: string): number {
  if (!normalized) return query.trim() ? 0 : 1;
  const record = prepare(item);
  const code = query.toLowerCase().replace(/[^a-z0-9]/g, '');
  const literalSku = query.trim().toLowerCase() === (item.sku ?? '').trim().toLowerCase();
  const hasDimension = /[./¼½¾⅛⅜⅝⅞]/.test(query);
  if (record.sku && (literalSku || (!hasDimension && code === record.sku && (/[a-z]/.test(code) || normalizeMaterialSearch(item.sku ?? '') === normalized)))) return 10000;
  if (record.sku && !hasDimension && ((/[a-z]/.test(code) && code.length >= 3) || /^\d{4,}$/.test(query.trim())) && record.sku.startsWith(code)) return 8000;
  for (const source of item.searchCodes ?? []) {
    const sourceCode = source.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (sourceCode && (query.trim().toLowerCase() === source.toLowerCase() || (!hasDimension && code === sourceCode))) return 7500;
  }
  let total = 0;
  for (const token of new Set(normalized.split(' '))) {
    let best = 0;
    for (const field of record.fields) {
      if (field.words.includes(token)) best = Math.max(best, field.weight);
      else if (!/\d/.test(token) && token.length >= 2 && field.words.some(word => !/\d/.test(word) && word.startsWith(token))) best = Math.max(best, field.weight * 0.65);
      else if (!/\d/.test(token) && token.length >= 4 && field.words.some(word => !/\d/.test(word) && oneEditApart(token, word))) best = Math.max(best, field.weight * 0.25);
    }
    if (!best) return 0;
    total += best;
  }
  if (record.name === normalized) total += 3000;
  else if (record.aliases.includes(normalized)) total += 2500;
  else if (record.name.startsWith(normalized)) total += 1200;
  else if (record.name.includes(normalized)) total += 800;
  return total;
}
export function catalogSearchScore(item: MaterialSearchItem, query: string): number { return score(item, query, normalizeMaterialSearch(query)); }
export function rankCatalogItems<T extends MaterialSearchItem>(items: T[], query: string): T[] {
  if (!query.trim()) return items;
  const normalized = normalizeMaterialSearch(query);
  return items.map((item, index) => ({ item, index, score: score(item, query, normalized) })).filter(row => row.score > 0).sort((a, b) => b.score - a.score || a.index - b.index).map(row => row.item);
}
export function matchesCatalogItemSearch(item: MaterialSearchItem, query: string): boolean { return catalogSearchScore(item, query) > 0; }
export function rankAssemblies<T extends { name: string; description?: string | null; items: Array<{ materialName: string; materialSku?: string | null }> }>(assemblies: T[], query: string): T[] {
  return rankCatalogItems(assemblies.map(assembly => ({ ...assembly, notes: assembly.description ?? null, searchCodes: assembly.items.map(item => item.materialSku ?? "").filter(Boolean), aliases: assembly.items.flatMap(item => [item.materialName ?? '', item.materialSku ?? '']) })), query);
}
