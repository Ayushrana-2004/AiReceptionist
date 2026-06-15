import React, { useState, useEffect, useCallback } from 'react';
import { apiClient, ApiClientError } from '../services/api';
import type { CallRecord, CallFilters, PaginatedResult } from '../../shared/types';

const DEFAULT_PAGE_SIZE = 20;

const OUTCOME_CATEGORIES = [
  { value: '', label: 'All Outcomes' },
  { value: 'appointment_booked', label: 'Appointment Booked' },
  { value: 'information_provided', label: 'Information Provided' },
  { value: 'transferred', label: 'Transferred' },
  { value: 'message_taken', label: 'Message Taken' },
  { value: 'lead_captured', label: 'Lead Captured' },
];

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

function formatDateTime(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function buildQueryString(filters: CallFilters): string {
  const params = new URLSearchParams();
  if (filters.outcomeCategory) params.set('outcomeCategory', filters.outcomeCategory);
  if (filters.dateFrom) params.set('dateFrom', new Date(filters.dateFrom).toISOString());
  if (filters.dateTo) params.set('dateTo', new Date(filters.dateTo).toISOString());
  if (filters.callerNumber) params.set('callerNumber', filters.callerNumber);
  if (filters.keyword) params.set('keyword', filters.keyword);
  if (filters.page) params.set('page', String(filters.page));
  if (filters.pageSize) params.set('pageSize', String(filters.pageSize));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export default function CallHistory() {
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalItems, setTotalItems] = useState(0);

  // Filter state
  const [keyword, setKeyword] = useState('');
  const [outcomeCategory, setOutcomeCategory] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [callerNumber, setCallerNumber] = useState('');

  // Expanded call detail
  const [expandedCallId, setExpandedCallId] = useState<string | null>(null);

  const fetchCalls = useCallback(async (page: number) => {
    try {
      setLoading(true);
      setError(null);

      const filters: CallFilters = {
        page,
        pageSize: DEFAULT_PAGE_SIZE,
      };
      if (keyword.trim()) filters.keyword = keyword.trim();
      if (outcomeCategory) filters.outcomeCategory = outcomeCategory;
      if (dateFrom) filters.dateFrom = new Date(dateFrom);
      if (dateTo) filters.dateTo = new Date(dateTo);
      if (callerNumber.trim()) filters.callerNumber = callerNumber.trim();

      const queryString = buildQueryString(filters);
      const response = await apiClient.get<PaginatedResult<CallRecord>>(`/calls${queryString}`);

      setCalls(response.data.items);
      setCurrentPage(response.data.currentPage);
      setTotalPages(response.data.totalPages);
      setTotalItems(response.data.totalItems);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Failed to load call history');
      }
    } finally {
      setLoading(false);
    }
  }, [keyword, outcomeCategory, dateFrom, dateTo, callerNumber]);

  useEffect(() => {
    fetchCalls(1);
  }, [fetchCalls]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(1);
    fetchCalls(1);
  };

  const handlePageChange = (page: number) => {
    if (page < 1 || page > totalPages) return;
    setCurrentPage(page);
    fetchCalls(page);
  };

  const handleClearFilters = () => {
    setKeyword('');
    setOutcomeCategory('');
    setDateFrom('');
    setDateTo('');
    setCallerNumber('');
    setCurrentPage(1);
  };

  const handleRowClick = (callId: string) => {
    setExpandedCallId(expandedCallId === callId ? null : callId);
  };

  const getSummarySnippet = (call: CallRecord): string => {
    if (!call.summaryText) return '';
    return call.summaryText.length > 80
      ? call.summaryText.substring(0, 80) + '…'
      : call.summaryText;
  };

  const renderPagination = () => {
    if (totalPages <= 1) return null;

    const pages: number[] = [];
    const maxVisible = 5;
    let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    const end = Math.min(totalPages, start + maxVisible - 1);
    if (end - start < maxVisible - 1) {
      start = Math.max(1, end - maxVisible + 1);
    }
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    return (
      <nav aria-label="Call history pagination" style={{ marginTop: '1rem', display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
        <button
          type="button"
          onClick={() => handlePageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          aria-label="Previous page"
          style={{ padding: '0.4rem 0.75rem' }}
        >
          Previous
        </button>
        {pages.map((page) => (
          <button
            key={page}
            type="button"
            onClick={() => handlePageChange(page)}
            aria-label={`Page ${page}`}
            aria-current={page === currentPage ? 'page' : undefined}
            style={{
              padding: '0.4rem 0.75rem',
              fontWeight: page === currentPage ? 'bold' : 'normal',
              backgroundColor: page === currentPage ? '#2563eb' : undefined,
              color: page === currentPage ? '#fff' : undefined,
              borderRadius: '4px',
            }}
          >
            {page}
          </button>
        ))}
        <button
          type="button"
          onClick={() => handlePageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          aria-label="Next page"
          style={{ padding: '0.4rem 0.75rem' }}
        >
          Next
        </button>
        <span style={{ marginLeft: '0.5rem', fontSize: '0.85rem', color: '#6b7280' }}>
          Page {currentPage} of {totalPages} ({totalItems} total calls)
        </span>
      </nav>
    );
  };

  const renderExpandedDetail = (call: CallRecord) => (
    <tr>
      <td colSpan={5} style={{ padding: '1rem', backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
        <div role="region" aria-label={`Call details for ${call.callerNumber}`}>
          <h4 style={{ margin: '0 0 0.5rem' }}>Call Details</h4>
          <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.25rem 1rem' }}>
            <dt style={{ fontWeight: 'bold' }}>Caller Number:</dt>
            <dd style={{ margin: 0 }}>{call.callerNumber}</dd>
            <dt style={{ fontWeight: 'bold' }}>Date/Time:</dt>
            <dd style={{ margin: 0 }}>{formatDateTime(call.startedAt)}</dd>
            <dt style={{ fontWeight: 'bold' }}>Duration:</dt>
            <dd style={{ margin: 0 }}>{formatDuration(call.durationSeconds)}</dd>
            <dt style={{ fontWeight: 'bold' }}>Status:</dt>
            <dd style={{ margin: 0 }}>{call.status}</dd>
            <dt style={{ fontWeight: 'bold' }}>Outcome:</dt>
            <dd style={{ margin: 0 }}>{call.outcomeCategory}</dd>
            <dt style={{ fontWeight: 'bold' }}>Intent:</dt>
            <dd style={{ margin: 0 }}>{call.intentClassification}</dd>
            <dt style={{ fontWeight: 'bold' }}>Language:</dt>
            <dd style={{ margin: 0 }}>{call.language}</dd>
            <dt style={{ fontWeight: 'bold' }}>Summary:</dt>
            <dd style={{ margin: 0 }}>
              {call.summaryText ? (
                call.summaryText
              ) : (
                <span style={{ color: '#b45309', fontStyle: 'italic' }} aria-label="Summary unavailable">
                  Summary unavailable
                </span>
              )}
            </dd>
            <dt style={{ fontWeight: 'bold' }}>Transcript:</dt>
            <dd style={{ margin: 0 }}>
              {call.transcriptUrl ? (
                <a
                  href={call.transcriptUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`View transcript for call from ${call.callerNumber}`}
                >
                  View Transcript
                </a>
              ) : (
                <span style={{ color: '#b45309', fontStyle: 'italic' }} aria-label="Transcript unavailable">
                  Transcript unavailable
                </span>
              )}
            </dd>
          </dl>
        </div>
      </td>
    </tr>
  );

  return (
    <section aria-labelledby="call-history-heading">
      <h2 id="call-history-heading">Call History</h2>

      {/* Error display */}
      {error && (
        <div role="alert" style={{ color: '#d32f2f', marginBottom: '1rem', padding: '0.75rem', border: '1px solid #d32f2f', borderRadius: '4px', backgroundColor: '#fef2f2' }}>
          {error}
        </div>
      )}

      {/* Search and filters */}
      <form onSubmit={handleSearch} aria-label="Filter call history" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {/* Keyword search */}
          <div>
            <label htmlFor="call-keyword-search" style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem' }}>
              Search
            </label>
            <input
              id="call-keyword-search"
              type="search"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="Search summaries & transcripts"
              style={{ padding: '0.5rem', minWidth: '200px' }}
              aria-describedby="call-keyword-hint"
            />
            <span id="call-keyword-hint" className="sr-only">
              Search across summary text and transcript text
            </span>
          </div>

          {/* Outcome filter */}
          <div>
            <label htmlFor="call-outcome-filter" style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem' }}>
              Outcome
            </label>
            <select
              id="call-outcome-filter"
              value={outcomeCategory}
              onChange={(e) => setOutcomeCategory(e.target.value)}
              style={{ padding: '0.5rem' }}
            >
              {OUTCOME_CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>{cat.label}</option>
              ))}
            </select>
          </div>

          {/* Date from */}
          <div>
            <label htmlFor="call-date-from" style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem' }}>
              From
            </label>
            <input
              id="call-date-from"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              style={{ padding: '0.5rem' }}
            />
          </div>

          {/* Date to */}
          <div>
            <label htmlFor="call-date-to" style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem' }}>
              To
            </label>
            <input
              id="call-date-to"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              style={{ padding: '0.5rem' }}
            />
          </div>

          {/* Caller number */}
          <div>
            <label htmlFor="call-caller-filter" style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem' }}>
              Caller Number
            </label>
            <input
              id="call-caller-filter"
              type="tel"
              value={callerNumber}
              onChange={(e) => setCallerNumber(e.target.value)}
              placeholder="+1234567890"
              style={{ padding: '0.5rem', minWidth: '140px' }}
            />
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="submit" style={{ padding: '0.5rem 1rem' }}>
              Apply Filters
            </button>
            <button type="button" onClick={handleClearFilters} style={{ padding: '0.5rem 1rem' }}>
              Clear
            </button>
          </div>
        </div>
      </form>

      {/* Results */}
      {loading ? (
        <p role="status" aria-live="polite">Loading call history...</p>
      ) : calls.length === 0 ? (
        <p>No calls found matching your filters.</p>
      ) : (
        <>
          <table
            style={{ width: '100%', borderCollapse: 'collapse' }}
            aria-label="Call history records"
          >
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '2px solid #ddd' }}>Caller</th>
                <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '2px solid #ddd' }}>Date/Time</th>
                <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '2px solid #ddd' }}>Duration</th>
                <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '2px solid #ddd' }}>Outcome</th>
                <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '2px solid #ddd' }}>Summary</th>
              </tr>
            </thead>
            <tbody>
              {calls.map((call) => (
                <React.Fragment key={call.id}>
                  <tr
                    onClick={() => handleRowClick(call.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleRowClick(call.id);
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-expanded={expandedCallId === call.id}
                    aria-label={`Call from ${call.callerNumber} on ${formatDateTime(call.startedAt)}. Click to ${expandedCallId === call.id ? 'collapse' : 'expand'} details.`}
                    style={{
                      cursor: 'pointer',
                      backgroundColor: expandedCallId === call.id ? '#eff6ff' : undefined,
                    }}
                  >
                    <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>{call.callerNumber}</td>
                    <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>{formatDateTime(call.startedAt)}</td>
                    <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>{formatDuration(call.durationSeconds)}</td>
                    <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>{call.outcomeCategory}</td>
                    <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>
                      {call.summaryText ? (
                        getSummarySnippet(call)
                      ) : (
                        <span style={{ color: '#b45309', fontStyle: 'italic' }} aria-label="Summary unavailable">
                          Summary unavailable
                        </span>
                      )}
                    </td>
                  </tr>
                  {expandedCallId === call.id && renderExpandedDetail(call)}
                </React.Fragment>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          {renderPagination()}
        </>
      )}
    </section>
  );
}
