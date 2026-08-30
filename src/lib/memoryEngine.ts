/**
 * Layered Memory Engine & Relevance Scorer
 * Selects only relevant records and memories to prevent payload bloating.
 */

import { DiaryRecord, MemoryItem } from '../types';

export interface ScoredRecord {
  record: DiaryRecord;
  score: number;
  matchedReason: string;
}

export interface ScoredMemory {
  memory: MemoryItem;
  score: number;
  matchedReason: string;
}

export function extractSearchTokens(query: string): string[] {
  return query
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/gi, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

/**
 * Searches and scores user records for context relevance
 */
export function findRelevantRecords(
  recordsOrQuery: DiaryRecord[] | string,
  queryOrRecords: string | DiaryRecord[],
  limit: number = 5
): DiaryRecord[] {
  let records: DiaryRecord[] = [];
  let queryText = '';

  if (Array.isArray(recordsOrQuery)) {
    records = recordsOrQuery;
    queryText = typeof queryOrRecords === 'string' ? queryOrRecords : '';
  } else if (Array.isArray(queryOrRecords)) {
    records = queryOrRecords;
    queryText = typeof recordsOrQuery === 'string' ? recordsOrQuery : '';
  } else {
    return [];
  }

  if (!Array.isArray(records) || records.length === 0) return [];
  const activeRecords = records.filter((r) => r && !r.isDeleted);
  const tokens = extractSearchTokens(queryText);

  if (tokens.length === 0) {
    // If no query terms, return the most recent 3 records
    return activeRecords.slice(0, 3);
  }

  const scored: ScoredRecord[] = [];

  for (const rec of activeRecords) {
    let score = 0;
    const titleNorm = (rec.title || '').toLowerCase();
    const contentNorm = (rec.content || '').toLowerCase();
    const tagsNorm = (rec.tags || []).join(' ').toLowerCase();
    const categoryNorm = (rec.category || '').toLowerCase();
    
    // Check audio transcripts if available
    const transcriptsNorm = (rec.attachments || [])
      .map((a) => a.transcript || '')
      .join(' ')
      .toLowerCase();

    for (const token of tokens) {
      if (titleNorm.includes(token)) score += 10;
      if (tagsNorm.includes(token)) score += 8;
      if (categoryNorm.includes(token)) score += 6;
      if (contentNorm.includes(token)) score += 4;
      if (transcriptsNorm.includes(token)) score += 5;
    }

    // Temporal bonus: give small weight to recent records
    const recordAgeDays =
      (Date.now() - new Date(rec.createdAt).getTime()) / (1000 * 3600 * 24);
    if (recordAgeDays < 7) score += 2;
    else if (recordAgeDays < 30) score += 1;

    if (score > 0) {
      scored.push({
        record: rec,
        score,
        matchedReason: `Correspondência com termos pesquisados (Score: ${score})`,
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.record);
}

/**
 * Searches and scores user memories for context relevance
 */
export function findRelevantMemories(
  memoriesOrQuery: MemoryItem[] | string,
  queryOrMemories: string | MemoryItem[],
  limit: number = 4
): MemoryItem[] {
  let memories: MemoryItem[] = [];
  let queryText = '';

  if (Array.isArray(memoriesOrQuery)) {
    memories = memoriesOrQuery;
    queryText = typeof queryOrMemories === 'string' ? queryOrMemories : '';
  } else if (Array.isArray(queryOrMemories)) {
    memories = queryOrMemories;
    queryText = typeof memoriesOrQuery === 'string' ? memoriesOrQuery : '';
  } else {
    return [];
  }

  if (!Array.isArray(memories) || memories.length === 0) return [];
  const tokens = extractSearchTokens(queryText);

  if (tokens.length === 0) {
    return memories.slice(0, 3);
  }

  const scored: ScoredMemory[] = [];

  for (const mem of memories) {
    if (!mem) continue;
    let score = 0;
    const titleNorm = (mem.title || '').toLowerCase();
    const summaryNorm = (mem.summary || '').toLowerCase();
    const tagsNorm = (mem.tags || []).join(' ').toLowerCase();

    for (const token of tokens) {
      if (titleNorm.includes(token)) score += 10;
      if (tagsNorm.includes(token)) score += 8;
      if (summaryNorm.includes(token)) score += 5;
    }

    if (mem.confidence) {
      score *= mem.confidence;
    }

    if (score > 0) {
      scored.push({
        memory: mem,
        score,
        matchedReason: `Correspondência em memórias (Score: ${score})`,
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.memory);
}
