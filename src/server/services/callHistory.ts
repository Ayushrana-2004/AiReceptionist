import { CallRecord } from '../../shared/types';

/**
 * Filters for querying call history records.
 * All filters are optional; when multiple are provided, they are combined as AND conditions.
 */
export interface CallHistoryFilters {
  /** Exact match on record.outcomeCategory */
  outcomeCategory?: string;
  /** Records where startedAt >= dateFrom */
  dateFrom?: Date;
  /** Records where startedAt <= dateTo */
  dateTo?: Date;
  /** Exact match on record.callerNumber */
  callerNumber?: string;
  /** Case-insensitive substring search across summaryText and metadata transcript text */
  keyword?: string;
}

/**
 * Filters an array of call records based on the provided filter criteria.
 * Multiple filters are applied as AND conditions — all must match for a record to be included.
 * Returns all-and-only matching records.
 */
export function filterCallHistory(
  records: CallRecord[],
  filters: CallHistoryFilters
): CallRecord[] {
  return records.filter((record) => {
    // Outcome category: exact match
    if (filters.outcomeCategory !== undefined) {
      if (record.outcomeCategory !== filters.outcomeCategory) {
        return false;
      }
    }

    // Date range: startedAt >= dateFrom
    if (filters.dateFrom !== undefined) {
      if (record.startedAt < filters.dateFrom) {
        return false;
      }
    }

    // Date range: startedAt <= dateTo
    if (filters.dateTo !== undefined) {
      if (record.startedAt > filters.dateTo) {
        return false;
      }
    }

    // Caller number: exact match
    if (filters.callerNumber !== undefined) {
      if (record.callerNumber !== filters.callerNumber) {
        return false;
      }
    }

    // Keyword: case-insensitive substring search across summaryText and metadata
    if (filters.keyword !== undefined) {
      const keywordLower = filters.keyword.toLowerCase();
      const summaryMatch =
        record.summaryText !== null &&
        record.summaryText.toLowerCase().includes(keywordLower);

      // Search metadata for transcript text stored inline (toolCallsMade entries or other fields)
      const metadataMatch = hasKeywordInMetadata(record.metadata, keywordLower);

      if (!summaryMatch && !metadataMatch) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Searches metadata fields for a keyword match.
 * Checks all string values and string array entries in metadata.
 */
function hasKeywordInMetadata(
  metadata: CallRecord['metadata'],
  keywordLower: string
): boolean {
  if (!metadata) {
    return false;
  }

  // Check string fields in metadata
  if (
    metadata.vapiCallId &&
    metadata.vapiCallId.toLowerCase().includes(keywordLower)
  ) {
    return true;
  }
  if (
    metadata.assistantId &&
    metadata.assistantId.toLowerCase().includes(keywordLower)
  ) {
    return true;
  }
  if (
    metadata.languageDetected &&
    metadata.languageDetected.toLowerCase().includes(keywordLower)
  ) {
    return true;
  }

  // Check toolCallsMade entries (may contain transcript-related info)
  if (metadata.toolCallsMade && Array.isArray(metadata.toolCallsMade)) {
    for (const entry of metadata.toolCallsMade) {
      if (entry.toLowerCase().includes(keywordLower)) {
        return true;
      }
    }
  }

  return false;
}
