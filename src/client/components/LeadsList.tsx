import { useState, useEffect, useCallback } from 'react';
import { apiClient, ApiClientError } from '../services/api';
import type { Lead, QualificationStatus, CRMSyncStatus, PaginatedResult } from '../../shared/types';

const PAGE_SIZE = 20;

const QUALIFICATION_FILTERS: { value: QualificationStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'unqualified', label: 'Unqualified' },
  { value: 'needs_review', label: 'Needs Review' },
];

function getQualificationLabel(status: QualificationStatus): string {
  switch (status) {
    case 'qualified':
      return 'Qualified';
    case 'unqualified':
      return 'Unqualified';
    case 'needs_review':
      return 'Needs Review';
    default:
      return status;
  }
}

function getQualificationStyle(status: QualificationStatus): React.CSSProperties {
  switch (status) {
    case 'qualified':
      return { color: '#166534', backgroundColor: '#dcfce7', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.85rem' };
    case 'unqualified':
      return { color: '#991b1b', backgroundColor: '#fee2e2', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.85rem' };
    case 'needs_review':
      return { color: '#92400e', backgroundColor: '#fef3c7', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.85rem' };
    default:
      return { padding: '0.25rem 0.5rem', fontSize: '0.85rem' };
  }
}

function getCRMSyncLabel(status: CRMSyncStatus): string {
  switch (status) {
    case 'synced':
      return 'Synced';
    case 'pending':
      return 'Pending';
    case 'failed':
      return 'Failed';
    default:
      return status;
  }
}

function getCRMSyncStyle(status: CRMSyncStatus): React.CSSProperties {
  switch (status) {
    case 'synced':
      return { color: '#166534', backgroundColor: '#dcfce7', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.85rem' };
    case 'pending':
      return { color: '#92400e', backgroundColor: '#fef3c7', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.85rem' };
    case 'failed':
      return { color: '#991b1b', backgroundColor: '#fee2e2', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.85rem' };
    default:
      return { padding: '0.25rem 0.5rem', fontSize: '0.85rem' };
  }
}

function formatTimestamp(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '…';
}

export default function LeadsList() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [qualificationFilter, setQualificationFilter] = useState<QualificationStatus | 'all'>('all');

  const fetchLeads = useCallback(async (page: number, filter: QualificationStatus | 'all') => {
    try {
      setLoading(true);
      setError(null);

      let path = `/leads?page=${page}&pageSize=${PAGE_SIZE}`;
      if (filter !== 'all') {
        path += `&qualificationStatus=${filter}`;
      }

      const response = await apiClient.get<PaginatedResult<Lead>>(path);
      setLeads(response.data.items);
      setTotalPages(response.data.totalPages);
      setTotalItems(response.data.totalItems);
      setCurrentPage(response.data.currentPage);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Failed to load leads');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLeads(currentPage, qualificationFilter);
  }, [fetchLeads, currentPage, qualificationFilter]);

  const handleFilterChange = (filter: QualificationStatus | 'all') => {
    setQualificationFilter(filter);
    setCurrentPage(1);
  };

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const renderPagination = () => {
    if (totalPages <= 1) return null;

    const pages: number[] = [];
    const maxVisiblePages = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    const endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

    if (endPage - startPage < maxVisiblePages - 1) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    return (
      <nav aria-label="Leads pagination" style={{ display: 'flex', gap: '0.25rem', alignItems: 'center', marginTop: '1rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => handlePageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          aria-label="Previous page"
          style={{ padding: '0.5rem 0.75rem' }}
        >
          Previous
        </button>

        {startPage > 1 && (
          <>
            <button
              type="button"
              onClick={() => handlePageChange(1)}
              aria-label="Page 1"
              style={{ padding: '0.5rem 0.75rem' }}
            >
              1
            </button>
            {startPage > 2 && <span style={{ padding: '0.5rem 0.25rem' }}>…</span>}
          </>
        )}

        {pages.map((page) => (
          <button
            key={page}
            type="button"
            onClick={() => handlePageChange(page)}
            aria-label={`Page ${page}`}
            aria-current={page === currentPage ? 'page' : undefined}
            style={{
              padding: '0.5rem 0.75rem',
              fontWeight: page === currentPage ? 'bold' : 'normal',
              backgroundColor: page === currentPage ? '#e5e7eb' : undefined,
              borderRadius: '4px',
            }}
          >
            {page}
          </button>
        ))}

        {endPage < totalPages && (
          <>
            {endPage < totalPages - 1 && <span style={{ padding: '0.5rem 0.25rem' }}>…</span>}
            <button
              type="button"
              onClick={() => handlePageChange(totalPages)}
              aria-label={`Page ${totalPages}`}
              style={{ padding: '0.5rem 0.75rem' }}
            >
              {totalPages}
            </button>
          </>
        )}

        <button
          type="button"
          onClick={() => handlePageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          aria-label="Next page"
          style={{ padding: '0.5rem 0.75rem' }}
        >
          Next
        </button>
      </nav>
    );
  };

  return (
    <section aria-labelledby="leads-list-heading">
      <h2 id="leads-list-heading">Leads</h2>

      {/* Error display */}
      {error && (
        <div role="alert" style={{ color: '#d32f2f', marginBottom: '1rem', padding: '0.75rem', border: '1px solid #d32f2f', borderRadius: '4px', backgroundColor: '#fef2f2' }}>
          {error}
        </div>
      )}

      {/* Filter controls */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <label htmlFor="leads-qualification-filter">
          Qualification status:
        </label>
        <select
          id="leads-qualification-filter"
          value={qualificationFilter}
          onChange={(e) => handleFilterChange(e.target.value as QualificationStatus | 'all')}
          style={{ padding: '0.5rem' }}
        >
          {QUALIFICATION_FILTERS.map((filter) => (
            <option key={filter.value} value={filter.value}>
              {filter.label}
            </option>
          ))}
        </select>

        <span style={{ fontSize: '0.9rem', color: '#555' }} role="status" aria-live="polite">
          {totalItems} lead{totalItems !== 1 ? 's' : ''} found
        </span>
      </div>

      {/* Leads table */}
      {loading ? (
        <p role="status">Loading leads...</p>
      ) : leads.length === 0 ? (
        <p>No leads found{qualificationFilter !== 'all' ? ` with status "${getQualificationLabel(qualificationFilter as QualificationStatus)}"` : ''}.</p>
      ) : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }} aria-label="Leads list">
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '2px solid #ddd', whiteSpace: 'nowrap' }}>Name</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '2px solid #ddd', whiteSpace: 'nowrap' }}>Phone</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '2px solid #ddd', whiteSpace: 'nowrap' }}>Email</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '2px solid #ddd', whiteSpace: 'nowrap' }}>Reason</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '2px solid #ddd', whiteSpace: 'nowrap' }}>Qualification</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '2px solid #ddd', whiteSpace: 'nowrap' }}>CRM Sync</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '2px solid #ddd', whiteSpace: 'nowrap' }}>Created</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr key={lead.id}>
                    <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>{lead.name}</td>
                    <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>{lead.phone}</td>
                    <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>{lead.email || '—'}</td>
                    <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }} title={lead.reason}>
                      {truncateText(lead.reason, 50)}
                    </td>
                    <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>
                      <span style={getQualificationStyle(lead.qualificationStatus)}>
                        {getQualificationLabel(lead.qualificationStatus)}
                      </span>
                    </td>
                    <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>
                      <span style={getCRMSyncStyle(lead.crmSyncStatus)}>
                        {getCRMSyncLabel(lead.crmSyncStatus)}
                      </span>
                    </td>
                    <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee', whiteSpace: 'nowrap' }}>
                      {formatTimestamp(lead.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {renderPagination()}
        </>
      )}
    </section>
  );
}
