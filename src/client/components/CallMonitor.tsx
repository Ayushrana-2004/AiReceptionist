import { useCallStatus } from '../hooks/useCallStatus';
import type { CallStatus } from '../../shared/types';

/**
 * Formats seconds into a human-readable mm:ss string.
 */
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Returns a display color for a given call status.
 */
function getStatusColor(status: CallStatus): string {
  switch (status) {
    case 'active':
      return '#16a34a';
    case 'queued':
      return '#ca8a04';
    case 'completed':
      return '#6b7280';
    case 'failed':
      return '#dc2626';
    default:
      return '#374151';
  }
}

/**
 * Returns a human-readable label for a call status.
 */
function getStatusLabel(status: CallStatus): string {
  switch (status) {
    case 'active':
      return 'Active';
    case 'queued':
      return 'Queued';
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Failed';
    default:
      return status;
  }
}

export default function CallMonitor() {
  const { calls, connectionStatus, error, isLoading } = useCallStatus();

  // Count calls by status
  const activeCalls = calls.filter((c) => c.status === 'active');
  const queuedCalls = calls.filter((c) => c.status === 'queued');
  const completedCalls = calls.filter((c) => c.status === 'completed');

  // Live calls = active + queued for the call list
  const liveCalls = calls.filter((c) => c.status === 'active' || c.status === 'queued');

  return (
    <section aria-labelledby="call-monitor-heading">
      <h2 id="call-monitor-heading">Call Monitor</h2>

      {/* Connection status indicator */}
      <div
        role="status"
        aria-live="polite"
        style={{ marginBottom: '1rem', fontSize: '0.85rem', color: '#6b7280' }}
      >
        <span
          style={{
            display: 'inline-block',
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            marginRight: '0.5rem',
            backgroundColor:
              connectionStatus === 'connected'
                ? '#16a34a'
                : connectionStatus === 'connecting'
                  ? '#ca8a04'
                  : '#dc2626',
          }}
          aria-hidden="true"
        />
        {connectionStatus === 'connected' && 'Live — connected via WebSocket'}
        {connectionStatus === 'connecting' && 'Connecting...'}
        {connectionStatus === 'disconnected' && 'Disconnected — using polling fallback'}
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

      {/* Call counts summary */}
      <div
        role="status"
        aria-live="polite"
        aria-label="Call status summary"
        style={{
          display: 'flex',
          gap: '1.5rem',
          marginBottom: '1.5rem',
          flexWrap: 'wrap',
        }}
      >
        <div
          style={{
            padding: '1rem',
            borderRadius: '8px',
            border: '1px solid #e5e7eb',
            minWidth: '120px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: getStatusColor('active') }}>
            {activeCalls.length}
          </div>
          <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>Active</div>
        </div>
        <div
          style={{
            padding: '1rem',
            borderRadius: '8px',
            border: '1px solid #e5e7eb',
            minWidth: '120px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: getStatusColor('queued') }}>
            {queuedCalls.length}
          </div>
          <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>Queued</div>
        </div>
        <div
          style={{
            padding: '1rem',
            borderRadius: '8px',
            border: '1px solid #e5e7eb',
            minWidth: '120px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: getStatusColor('completed') }}>
            {completedCalls.length}
          </div>
          <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>Completed</div>
        </div>
      </div>

      {/* Live call list */}
      {isLoading ? (
        <p role="status">Loading call data...</p>
      ) : liveCalls.length === 0 ? (
        <p>No active or queued calls at this time.</p>
      ) : (
        <table
          style={{ width: '100%', borderCollapse: 'collapse' }}
          aria-label="Active and queued calls"
        >
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '2px solid #ddd' }}>
                Caller
              </th>
              <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '2px solid #ddd' }}>
                Status
              </th>
              <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '2px solid #ddd' }}>
                Duration
              </th>
              <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '2px solid #ddd' }}>
                Started At
              </th>
            </tr>
          </thead>
          <tbody>
            {liveCalls.map((call) => (
              <tr key={call.callId}>
                <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>
                  {call.callerNumber}
                </td>
                <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '0.2rem 0.5rem',
                      borderRadius: '4px',
                      fontSize: '0.8rem',
                      fontWeight: 'bold',
                      color: '#fff',
                      backgroundColor: getStatusColor(call.status),
                    }}
                  >
                    {getStatusLabel(call.status)}
                  </span>
                </td>
                <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>
                  {formatDuration(call.durationSeconds)}
                </td>
                <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>
                  {new Date(call.startedAt).toLocaleTimeString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
