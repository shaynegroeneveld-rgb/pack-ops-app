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
  return normalized.replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function tokenize(value: string): string[] {
  return normalizeSearchText(value).split(" ").filter(Boolean);
}

function bigramSet(value: string): Set<string> {
  const normalized = normalizeSearchText(value).replace(/\s+/g, "");
  if (normalized.length < 2) {
    return new Set(normalized ? [normalized] : []);
  }

  const result = new Set<string>();
  for (let index = 0; index < normalized.length - 1; index += 1) {
    result.add(normalized.slice(index, index + 2));
  }
  return result;
}

function normalizedSimilarity(left: string, right: string): number {
  const leftSet = bigramSet(left);
  const rightSet = bigramSet(right);
  if (leftSet.size === 0 || rightSet.size === 0) {
    return 0;
  }

  let shared = 0;
  for (const token of leftSet) {
    if (rightSet.has(token)) {
      shared += 1;
    }
  }
  return (2 * shared) / (leftSet.size + rightSet.size);
}

export function buildCatalogSearchText(item: CatalogItem): string {
  return [
    item.name,
    item.sku ?? "",
    item.category ?? "",
    item.notes ?? "",
    ...item.aliases,
  ]
    .filter(Boolean)
    .join(" ");
}

export function matchesCatalogItemSearch(item: CatalogItem, query: string): boolean {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return true;
  }

  const searchText = buildCatalogSearchText(item);
  const normalizedText = normalizeSearchText(searchText);
  if (normalizedText.includes(normalizedQuery)) {
    return true;
  }

  const queryTokens = tokenize(normalizedQuery);
  if (queryTokens.length > 0 && queryTokens.every((token) => normalizedText.includes(token))) {
    return true;
  }

  const searchTokens = tokenize(searchText);
  const fuzzyScore = normalizedSimilarity(normalizedQuery, normalizedText);
  if (fuzzyScore >= 0.48) {
    return true;
  }

  return queryTokens.some((token) =>
    searchTokens.some((candidate) => candidate.startsWith(token) || normalizedSimilarity(token, candidate) >= 0.72),
  );
}

