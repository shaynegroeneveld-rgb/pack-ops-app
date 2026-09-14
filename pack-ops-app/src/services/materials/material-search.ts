import type { CatalogItem } from "@/domain/materials/types";

const NORMALIZATION_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bpot\s*lights?\b/g, "recessed light"],
  [/\brecessed\s*lights?\b/g, "recessed light"],
  [/\bmarettes?\b/g, "wire connector"],
  [/\bmarrettes?\b/g, "wire connector"],
  [/\bstaples?\b/g, "cable staple"],
  [/\bromex\b/g, "nmd"],
  [/\bgfci\b/g, "ground fault receptacle"],
  [/\bafci\b/g, "arc fault breaker"],
  [/\bpot\b/g, "recessed"],
];

function normalizeSearchText(value: string): string {
  let normalized = value.toLowerCase().replace(/\uFEFF/g, " ");
  for (const [pattern, replacement] of NORMALIZATION_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement);
  }
  return normalized
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string): string[] {
  return normalizeSearchText(value).split(" ").filter(Boolean);
}

export function buildCatalogSearchText(item: CatalogItem): string {
  return [
    item.name,
    item.sku ?? "",
    item.category ?? "",
    item.notes ?? "",
    ...(item.aliases ?? []),
  ]
    .filter(Boolean)
    .join(" ");
}

// Match every requested word. Never fuzzy-match sizes or supplier codes.
function oneEditApart(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a.length === b.length) {
    const different = [...a]
      .map((c, i) => (c === b[i] ? -1 : i))
      .filter((i) => i >= 0);
    return (
      different.length === 1 ||
      (different.length === 2 &&
        different[1] === different[0]! + 1 &&
        a[different[0]!] === b[different[1]!] &&
        a[different[1]!] === b[different[0]!])
    );
  }
  const short = a.length < b.length ? a : b,
    long = a.length < b.length ? b : a;
  let i = 0,
    j = 0,
    edits = 0;
  while (i < short.length && j < long.length) {
    if (short[i] === long[j]) {
      i++;
      j++;
    } else {
      j++;
      if (++edits > 1) return false;
    }
  }
  return true;
}
export function catalogSearchScore(item: CatalogItem, query: string): number {
  const q = normalizeSearchText(query);
  if (!q) return 1;
  const sku = (item.sku ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const code = query.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (sku && code === sku && (/[a-z]/.test(code) || normalizeSearchText(item.sku ?? "") === q)) return 10000;
  if (sku && /[a-z]/.test(code) && code.length >= 3 && sku.startsWith(code))
    return 8000;
  const name = normalizeSearchText(item.name),
    aliases = (item.aliases ?? []).map(normalizeSearchText);
  const words = tokenize(buildCatalogSearchText(item));
  let score = 0;
  for (const token of q.split(" ")) {
    if (words.includes(token)) {
      score += 100;
      continue;
    }
    // Numbers must match a complete numeric token: 12 must not match 120.
    if (/\d/.test(token)) return 0;
    if (words.some((word) => word.startsWith(token))) {
      score += 65;
      continue;
    }
    if (
      token.length >= 4 &&
      words.some((word) => !/\d/.test(word) && oneEditApart(token, word))
    ) {
      score += 25;
      continue;
    }
    return 0;
  }
  if (name === q) score += 3000;
  else if (aliases.includes(q)) score += 2500;
  else if (name.startsWith(q)) score += 1200;
  else if (name.includes(q)) score += 800;
  return score;
}
export function rankCatalogItems(
  items: CatalogItem[],
  query: string,
): CatalogItem[] {
  if (!query.trim()) return items;
  return items
    .map((item, index) => ({
      item,
      index,
      score: catalogSearchScore(item, query),
    }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((row) => row.item);
}
export function matchesCatalogItemSearch(
  item: CatalogItem,
  query: string,
): boolean {
  return catalogSearchScore(item, query) > 0;
}
