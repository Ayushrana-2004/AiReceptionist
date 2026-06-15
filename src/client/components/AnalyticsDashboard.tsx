import { useState, useEffect, useCallback } from 'react';
import { apiClient, ApiClientError } from '../services/api';
import type { AnalyticsSnapshot, AnalyticsPeriod } from '../../shared/types';

type TimeRange = 'today' | '7d' | '30d';

interface TimeRangeOption {
  value: TimeRange;
  label: string;
  period: AnalyticsPeriod;
}

const TIME_RANGES: TimeRangeOption[] = [
  { value: 'today', label: 'Today', period: 'daily' },
  { value: '7d', label: 'Last 7 Days', period: 'daily' },
  { value: '30d', label: 'Last 30 Days', period: 'weekly' },
];

const AUTO_REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}m ${secs}s`;
}

function formatPercentage(value: number): string {
  return `${value.toFixed(1)}%`;
}

export default function AnalyticsDashboard() {
  const [timeRange, setTimeRange] = useState<TimeRange>('7d');
  const [data, setData] = useState<AnalyticsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const selectedRange = TIME_RANGES.find((r) => r.value === timeRange)!;

  const fetchAnalytics = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiClient.get<AnalyticsSnapshot>(
        `/analytics?range=${timeRange}&period=${selectedRange.period}`
      );
      setData(response.data);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Failed to load analytics data');
      }
    } finally {
      setLoading(false);
    }
  }, [timeRange, selectedRange.period]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  // Auto-refresh every 5 minutes
  useEffect(() => {
    const interval = setInterval(() => {
      fetchAnalytics();
    }, AUTO_REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchAnalytics]);

  // Compute totals for routing analytics
  const totalTransfers = data
    ? Object.values(data.transfersByCategory).reduce((sum, count) => sum + count, 0)
    : 0;

  const totalOutcomes = data
    ? Object.values(data.callsByOutcome).reduce((sum, count) => sum + count, 0)
    : 0;

  // Compute max call volume for bar chart scaling
  const maxBarValue = data
    ? Math.max(...Object.values(data.transfersByCategory), 1)
    : 1;

  return (
    <section aria-labelledby="analytics-dashboard-heading">
      <h2 id="analytics-dashboard-heading">Analytics Dashboard</h2>

      {/* Time Range Selector */}
      <div role="group" aria-label="Time range selector" style={{ marginBottom: '1.5rem' }}>
        {TIME_RANGES.map((range) => (
          <button
            key={range.value}
            type="button"
            onClick={() => setTimeRange(range.value)}
            aria-pressed={timeRange === range.value}
            style={{
              padding: '0.5rem 1rem',
              marginRight: '0.5rem',
              border: '1px solid #ccc',
              borderRadius: '4px',
              backgroundColor: timeRange === range.value ? '#1976d2' : '#fff',
              color: timeRange === range.value ? '#fff' : '#333',
              cursor: 'pointer',
              fontWeight: timeRange === range.value ? 'bold' : 'normal',
            }}
          >
            {range.label}
          </button>
        ))}
      </div>

      {/* Error display */}
      {error && (
        <div
          role="alert"
          style={{
            color: '#d32f2f',
            marginBottom: '1rem',
            padding: '0.75rem',
            border: '1px solid #d32f2f',
            borderRadius: '4px',
            backgroundColor: '#fef2f2',
          }}
        >
          {error}
        </div>
      )}

      {/* Loading state */}
      {loading ? (
        <p role="status">Loading analytics...</p>
      ) : data ? (
        <>
          {/* Summary Cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '1rem',
              marginBottom: '2rem',
            }}
            role="region"
            aria-label="Analytics summary"
          >
            <div
              style={{
                padding: '1rem',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                backgroundColor: '#f9fafb',
              }}
            >
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#6b7280' }}>Total Calls</p>
              <p style={{ margin: '0.25rem 0 0', fontSize: '1.5rem', fontWeight: 'bold', color: '#111827' }}>
                {data.totalCalls}
              </p>
            </div>
            <div
              style={{
                padding: '1rem',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                backgroundColor: '#f9fafb',
              }}
            >
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#6b7280' }}>Average Duration</p>
              <p style={{ margin: '0.25rem 0 0', fontSize: '1.5rem', fontWeight: 'bold', color: '#111827' }}>
                {formatDuration(data.avgDurationSeconds)}
              </p>
            </div>
            <div
              style={{
                padding: '1rem',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                backgroundColor: '#f9fafb',
              }}
            >
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#6b7280' }}>Conversion Rate</p>
              <p style={{ margin: '0.25rem 0 0', fontSize: '1.5rem', fontWeight: 'bold', color: '#111827' }}>
                {formatPercentage(data.appointmentConversionRate)}
              </p>
            </div>
            <div
              style={{
                padding: '1rem',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                backgroundColor: '#f9fafb',
              }}
            >
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#6b7280' }}>Lead Capture Rate</p>
              <p style={{ margin: '0.25rem 0 0', fontSize: '1.5rem', fontWeight: 'bold', color: '#111827' }}>
                {formatPercentage(data.leadCaptureRate)}
              </p>
            </div>
          </div>

          {/* Call Volume Chart */}
          <div style={{ marginBottom: '2rem' }}>
            <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem', color: '#374151' }}>
              Call Volume by Category
            </h3>
            {Object.keys(data.transfersByCategory).length === 0 ? (
              <p style={{ color: '#6b7280' }}>No call volume data available for this period.</p>
            ) : (
              <div role="img" aria-label="Call volume bar chart showing transfers by category">
                {Object.entries(data.transfersByCategory).map(([category, count]) => (
                  <div
                    key={category}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      marginBottom: '0.5rem',
                    }}
                  >
                    <span
                      style={{
                        width: '120px',
                        fontSize: '0.85rem',
                        color: '#374151',
                        textTransform: 'capitalize',
                        flexShrink: 0,
                      }}
                    >
                      {category}
                    </span>
                    <div
                      style={{
                        flex: 1,
                        backgroundColor: '#e5e7eb',
                        borderRadius: '4px',
                        height: '24px',
                        position: 'relative',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${(count / maxBarValue) * 100}%`,
                          backgroundColor: '#1976d2',
                          height: '100%',
                          borderRadius: '4px',
                          minWidth: count > 0 ? '2px' : '0',
                          transition: 'width 0.3s ease',
                        }}
                        role="presentation"
                      />
                    </div>
                    <span
                      style={{
                        width: '40px',
                        textAlign: 'right',
                        fontSize: '0.85rem',
                        color: '#374151',
                        marginLeft: '0.5rem',
                        flexShrink: 0,
                      }}
                    >
                      {count}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Routing Analytics Table */}
          <div style={{ marginBottom: '2rem' }}>
            <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem', color: '#374151' }}>
              Routing Analytics by Intent Category
            </h3>
            {totalTransfers === 0 ? (
              <p style={{ color: '#6b7280' }}>No routing data available for this period.</p>
            ) : (
              <table
                style={{ width: '100%', borderCollapse: 'collapse' }}
                aria-label="Routing analytics by intent category"
              >
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '2px solid #ddd' }}>
                      Intent Category
                    </th>
                    <th style={{ textAlign: 'right', padding: '0.5rem', borderBottom: '2px solid #ddd' }}>
                      Transfer Count
                    </th>
                    <th style={{ textAlign: 'right', padding: '0.5rem', borderBottom: '2px solid #ddd' }}>
                      % of Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(data.transfersByCategory)
                    .sort(([, a], [, b]) => b - a)
                    .map(([category, count]) => (
                      <tr key={category}>
                        <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee', textTransform: 'capitalize' }}>
                          {category}
                        </td>
                        <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee', textAlign: 'right' }}>
                          {count}
                        </td>
                        <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee', textAlign: 'right' }}>
                          {formatPercentage((count / totalTransfers) * 100)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Call Outcome Breakdown Table */}
          <div style={{ marginBottom: '2rem' }}>
            <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem', color: '#374151' }}>
              Call Outcome Breakdown
            </h3>
            {totalOutcomes === 0 ? (
              <p style={{ color: '#6b7280' }}>No outcome data available for this period.</p>
            ) : (
              <table
                style={{ width: '100%', borderCollapse: 'collapse' }}
                aria-label="Call outcome breakdown"
              >
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '2px solid #ddd' }}>
                      Outcome
                    </th>
                    <th style={{ textAlign: 'right', padding: '0.5rem', borderBottom: '2px solid #ddd' }}>
                      Count
                    </th>
                    <th style={{ textAlign: 'right', padding: '0.5rem', borderBottom: '2px solid #ddd' }}>
                      % of Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(data.callsByOutcome)
                    .sort(([, a], [, b]) => b - a)
                    .map(([outcome, count]) => (
                      <tr key={outcome}>
                        <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee', textTransform: 'capitalize' }}>
                          {outcome.replace(/_/g, ' ')}
                        </td>
                        <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee', textAlign: 'right' }}>
                          {count}
                        </td>
                        <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee', textAlign: 'right' }}>
                          {formatPercentage((count / totalOutcomes) * 100)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      ) : (
        <p>No analytics data available.</p>
      )}
    </section>
  );
}
