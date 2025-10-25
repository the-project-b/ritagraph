import { Logger } from "@the-project-b/logging";
import { AgentTodoItem } from "../todo-engine";

// === Magic Numbers as Constants === //
const WORD_MATCH_MIN_LEN = 12;
const WORD_MATCH_COMMON_THRESHOLD = 10;
const WORD_MATCH_RATIO_THRESHOLD = 0.8;
const STRONG_NAME_MATCH_THRESHOLD = 0.9;
const MEDIUM_NAME_MATCH_THRESHOLD = 0.8;
const JACCARD_STRONG_THRESHOLD = 0.85;
const LEVENSHTEIN_SIM_THRESHOLD = 0.9;
const JACCARD_MEDIUM_THRESHOLD = 0.75;

export type DuplicateFilter = (a: AgentTodoItem, b: AgentTodoItem) => boolean;

function normalizeText(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeWords(input: string): string[] {
  const normalized = normalizeText(input);
  return normalized.length === 0 ? [] : normalized.split(" ");
}

function uniqueWordSet(words: string[]) {
  return new Set(words);
}

function computeWordOverlap(aWords: string[], bWords: string[]) {
  const aSet = uniqueWordSet(aWords);
  const bSet = uniqueWordSet(bWords);
  let common = 0;
  for (const w of aSet) {
    if (bSet.has(w)) common++;
  }
  const union = aSet.size + bSet.size - common;
  return {
    common,
    union,
    minLen: Math.min(aSet.size, bSet.size),
    aLen: aSet.size,
    bLen: bSet.size,
  };
}

function jaccardSimilarity(aWords: string[], bWords: string[]) {
  const { common, union } = computeWordOverlap(aWords, bWords);
  if (union === 0) return 0;
  return common / union;
}

function levenshteinDistance(a: string, b: string) {
  if (a === b) return 0;
  const aLen = a.length;
  const bLen = b.length;
  if (aLen === 0) return bLen;
  if (bLen === 0) return aLen;

  const dp = new Array(bLen + 1).fill(0);
  for (let j = 0; j <= bLen; j++) dp[j] = j;

  for (let i = 1; i <= aLen; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= bLen; j++) {
      const temp = dp[j];
      if (a.charCodeAt(i - 1) === b.charCodeAt(j - 1)) {
        dp[j] = prev;
      } else {
        dp[j] = Math.min(prev + 1, dp[j] + 1, dp[j - 1] + 1);
      }
      prev = temp;
    }
  }
  return dp[bLen];
}

function similarityRatioByLevenshtein(a: string, b: string) {
  const an = normalizeText(a);
  const bn = normalizeText(b);
  const maxLen = Math.max(an.length, bn.length);
  if (maxLen === 0) return 1;
  const dist = levenshteinDistance(an, bn);
  return 1 - dist / maxLen;
}

function nameSimilarity(a: string, b: string) {
  return similarityRatioByLevenshtein(a, b);
}

function sameEffectiveDate(a?: string, b?: string) {
  if (!a || !b) return false;
  return normalizeText(a) === normalizeText(b);
}

function getPrimaryDescription(todo: AgentTodoItem) {
  return todo.translatedTaskDescription?.trim().length
    ? todo.translatedTaskDescription
    : todo.taskDescription;
}

function highWordMatchRule(a: AgentTodoItem, b: AgentTodoItem) {
  const aWords = tokenizeWords(getPrimaryDescription(a));
  const bWords = tokenizeWords(getPrimaryDescription(b));
  const { common, minLen } = computeWordOverlap(aWords, bWords);
  if (minLen >= WORD_MATCH_MIN_LEN && common >= WORD_MATCH_COMMON_THRESHOLD)
    return true;
  if (minLen > 0 && common / minLen >= WORD_MATCH_RATIO_THRESHOLD) return true;
  return false;
}

function strongNameMatch(a: AgentTodoItem, b: AgentTodoItem) {
  const score = nameSimilarity(a.relatedEmployeeName, b.relatedEmployeeName);
  return score >= STRONG_NAME_MATCH_THRESHOLD;
}

function mediumNameMatch(a: AgentTodoItem, b: AgentTodoItem) {
  const score = nameSimilarity(a.relatedEmployeeName, b.relatedEmployeeName);
  return score >= MEDIUM_NAME_MATCH_THRESHOLD;
}

export const duplicateFiltersInOrder: DuplicateFilter[] = [
  (a, b) => {
    const aDesc = normalizeText(getPrimaryDescription(a));
    const bDesc = normalizeText(getPrimaryDescription(b));
    const aName = normalizeText(a.relatedEmployeeName);
    const bName = normalizeText(b.relatedEmployeeName);
    return aDesc.length > 0 && aDesc === bDesc && aName === bName;
  },
  (a, b) => {
    const aDesc = normalizeText(a.taskDescription);
    const bDesc = normalizeText(b.taskDescription);
    const aName = normalizeText(a.relatedEmployeeName);
    const bName = normalizeText(b.relatedEmployeeName);
    return aDesc.length > 0 && aDesc === bDesc && aName === bName;
  },
  (a, b) => highWordMatchRule(a, b) && strongNameMatch(a, b),
  (a, b) => {
    const aWords = tokenizeWords(getPrimaryDescription(a));
    const bWords = tokenizeWords(getPrimaryDescription(b));
    const jac = jaccardSimilarity(aWords, bWords);
    return jac >= JACCARD_STRONG_THRESHOLD && strongNameMatch(a, b);
  },
  (a, b) => {
    const sim = similarityRatioByLevenshtein(
      getPrimaryDescription(a),
      getPrimaryDescription(b),
    );
    return sim >= LEVENSHTEIN_SIM_THRESHOLD && mediumNameMatch(a, b);
  },
  (a, b) => {
    if (!sameEffectiveDate(a.effectiveDate, b.effectiveDate)) return false;
    const aWords = tokenizeWords(getPrimaryDescription(a));
    const bWords = tokenizeWords(getPrimaryDescription(b));
    const jac = jaccardSimilarity(aWords, bWords);
    return jac >= JACCARD_MEDIUM_THRESHOLD && strongNameMatch(a, b);
  },
];

export function dedupeTodos(todos: AgentTodoItem[]) {
  const unique: AgentTodoItem[] = [];
  const duplicates: AgentTodoItem[] = [];

  for (const current of todos) {
    const isDuplicate = unique.some((kept) =>
      duplicateFiltersInOrder.some((rule) => rule(current, kept)),
    );
    if (isDuplicate) {
      duplicates.push(current);
    } else {
      unique.push(current);
    }
  }

  return { unique, duplicates };
}

export function filterDuplicates(todos: AgentTodoItem[], logger: Logger) {
  const { unique, duplicates } = dedupeTodos(todos);

  logger.info("TodoEngine: Duplicates detected", {
    duplicates,
    count: duplicates.length,
  });

  return unique;
}
