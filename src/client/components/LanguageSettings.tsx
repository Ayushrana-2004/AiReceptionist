import { useState, useEffect } from 'react';
import { apiClient } from '../services/api';
import { Language, KBEntry, Business } from '../../shared/types';

/**
 * LanguageSettings Component
 *
 * Allows the business owner to enable/disable languages for the AI Receptionist
 * and view per-language Knowledge Base content.
 *
 * - Supports English, Spanish, French, Mandarin
 * - Prevents disabling the last enabled language
 * - Shows per-language KB entries
 *
 * Requirements: 8.3, 8.4
 */

interface LanguageInfo {
  code: Language;
  name: string;
}

const SUPPORTED_LANGUAGES: LanguageInfo[] = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'zh', name: 'Mandarin' },
];

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: '800px',
    margin: '0 auto',
  },
  heading: {
    fontSize: '24px',
    fontWeight: 700,
    marginBottom: '8px',
    color: '#1a1a2e',
  },
  description: {
    fontSize: '14px',
    color: '#64748b',
    marginBottom: '24px',
  },
  section: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
    padding: '24px',
    marginBottom: '24px',
  },
  sectionTitle: {
    fontSize: '16px',
    fontWeight: 600,
    marginBottom: '16px',
    color: '#1a1a2e',
  },
  languageList: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
  },
  languageItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderBottom: '1px solid #f1f5f9',
  },
  languageItemLast: {
    borderBottom: 'none',
  },
  languageInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  languageName: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#1a1a2e',
  },
  languageCode: {
    fontSize: '12px',
    color: '#94a3b8',
    textTransform: 'uppercase',
  },
  enabledBadge: {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: '12px',
    fontSize: '11px',
    fontWeight: 600,
    backgroundColor: '#dcfce7',
    color: '#166534',
  },
  disabledBadge: {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: '12px',
    fontSize: '11px',
    fontWeight: 600,
    backgroundColor: '#f1f5f9',
    color: '#64748b',
  },
  toggleContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  toggleSwitch: {
    position: 'relative',
    display: 'inline-block',
    width: '44px',
    height: '24px',
  },
  toggleInput: {
    opacity: 0,
    width: 0,
    height: 0,
    position: 'absolute',
  },
  toggleSlider: {
    position: 'absolute',
    cursor: 'pointer',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#cbd5e1',
    borderRadius: '24px',
    transition: 'background-color 0.2s',
  },
  toggleSliderChecked: {
    backgroundColor: '#6366f1',
  },
  toggleSliderDisabled: {
    cursor: 'not-allowed',
    opacity: 0.5,
  },
  toggleKnob: {
    position: 'absolute',
    content: '""',
    height: '18px',
    width: '18px',
    left: '3px',
    bottom: '3px',
    backgroundColor: '#ffffff',
    borderRadius: '50%',
    transition: 'transform 0.2s',
  },
  toggleKnobChecked: {
    transform: 'translateX(20px)',
  },
  lastLanguageMessage: {
    fontSize: '12px',
    color: '#ef4444',
    fontStyle: 'italic',
  },
  kbSection: {
    marginTop: '16px',
  },
  kbLanguageHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 16px',
    backgroundColor: '#f8fafc',
    borderRadius: '6px',
    marginBottom: '8px',
    cursor: 'pointer',
    border: '1px solid #e2e8f0',
  },
  kbLanguageTitle: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#334155',
  },
  kbEntryCount: {
    fontSize: '12px',
    color: '#64748b',
  },
  kbEntryList: {
    listStyle: 'none',
    margin: '0 0 16px 0',
    padding: '0 0 0 16px',
  },
  kbEntryItem: {
    padding: '8px 12px',
    borderLeft: '3px solid #e2e8f0',
    marginBottom: '6px',
    fontSize: '13px',
  },
  kbEntryCategory: {
    fontSize: '11px',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '2px',
  },
  kbEntryQuestion: {
    color: '#1a1a2e',
    fontWeight: 500,
  },
  kbEntryAnswer: {
    color: '#64748b',
    marginTop: '2px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: '600px',
  },
  emptyKbMessage: {
    fontSize: '13px',
    color: '#94a3b8',
    fontStyle: 'italic',
    padding: '8px 16px',
  },
  statusMessage: {
    padding: '10px 16px',
    borderRadius: '6px',
    fontSize: '14px',
    marginBottom: '16px',
  },
  successMessage: {
    backgroundColor: '#dcfce7',
    color: '#166534',
    border: '1px solid #bbf7d0',
  },
  errorMessage: {
    backgroundColor: '#fef2f2',
    color: '#991b1b',
    border: '1px solid #fecaca',
  },
  loading: {
    textAlign: 'center',
    padding: '40px',
    color: '#64748b',
    fontSize: '14px',
  },
};

export default function LanguageSettings() {
  const [enabledLanguages, setEnabledLanguages] = useState<Language[]>([]);
  const [kbEntries, setKbEntries] = useState<KBEntry[]>([]);
  const [expandedLanguage, setExpandedLanguage] = useState<Language | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [configResponse, kbResponse] = await Promise.all([
        apiClient.get<Business>('/config'),
        apiClient.get<{ entries: KBEntry[] }>('/knowledge-base'),
      ]);
      setEnabledLanguages(configResponse.data.enabledLanguages);
      setKbEntries(kbResponse.data.entries);
    } catch {
      setStatusMessage({ type: 'error', text: 'Failed to load configuration.' });
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleLanguage(language: Language) {
    const isCurrentlyEnabled = enabledLanguages.includes(language);

    // Prevent disabling the last language
    if (isCurrentlyEnabled && enabledLanguages.length <= 1) {
      return;
    }

    const newLanguages = isCurrentlyEnabled
      ? enabledLanguages.filter((l) => l !== language)
      : [...enabledLanguages, language];

    setSaving(true);
    setStatusMessage(null);

    try {
      const response = await apiClient.put<Business>('/config', {
        enabledLanguages: newLanguages,
      });
      setEnabledLanguages(response.data.enabledLanguages);
      setStatusMessage({
        type: 'success',
        text: `Language "${getLanguageName(language)}" ${isCurrentlyEnabled ? 'disabled' : 'enabled'} successfully.`,
      });
    } catch {
      setStatusMessage({
        type: 'error',
        text: `Failed to update language settings. Please try again.`,
      });
    } finally {
      setSaving(false);
    }
  }

  function getLanguageName(code: Language): string {
    const lang = SUPPORTED_LANGUAGES.find((l) => l.code === code);
    return lang ? lang.name : code;
  }

  function getKbEntriesForLanguage(language: Language): KBEntry[] {
    return kbEntries.filter((entry) => entry.language === language);
  }

  function isLastEnabled(language: Language): boolean {
    return enabledLanguages.includes(language) && enabledLanguages.length <= 1;
  }

  function handleExpandToggle(language: Language) {
    setExpandedLanguage(expandedLanguage === language ? null : language);
  }

  if (loading) {
    return <div style={styles.loading}>Loading language settings...</div>;
  }

  return (
    <div style={styles.container}>
      <h2 style={styles.heading}>Language Settings</h2>
      <p style={styles.description}>
        Configure which languages your AI Receptionist supports. At least one language must remain enabled.
      </p>

      {statusMessage && (
        <div
          style={{
            ...styles.statusMessage,
            ...(statusMessage.type === 'success' ? styles.successMessage : styles.errorMessage),
          }}
          role="alert"
          aria-live="polite"
        >
          {statusMessage.text}
        </div>
      )}

      {/* Language Toggle Section */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Enabled Languages</h3>
        <ul style={styles.languageList} aria-label="Supported languages">
          {SUPPORTED_LANGUAGES.map((lang, index) => {
            const isEnabled = enabledLanguages.includes(lang.code);
            const isLast = isLastEnabled(lang.code);
            const isLastItem = index === SUPPORTED_LANGUAGES.length - 1;

            return (
              <li
                key={lang.code}
                style={{
                  ...styles.languageItem,
                  ...(isLastItem ? styles.languageItemLast : {}),
                }}
              >
                <div style={styles.languageInfo}>
                  <div>
                    <span style={styles.languageName}>{lang.name}</span>{' '}
                    <span style={styles.languageCode}>({lang.code})</span>
                  </div>
                  <span style={isEnabled ? styles.enabledBadge : styles.disabledBadge}>
                    {isEnabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
                <div style={styles.toggleContainer}>
                  {isLast && (
                    <span style={styles.lastLanguageMessage} aria-live="polite">
                      Cannot disable last language
                    </span>
                  )}
                  <label style={styles.toggleSwitch} aria-label={`Toggle ${lang.name}`}>
                    <input
                      type="checkbox"
                      style={styles.toggleInput}
                      checked={isEnabled}
                      disabled={isLast || saving}
                      onChange={() => handleToggleLanguage(lang.code)}
                      aria-describedby={isLast ? `last-lang-${lang.code}` : undefined}
                    />
                    <span
                      style={{
                        ...styles.toggleSlider,
                        ...(isEnabled ? styles.toggleSliderChecked : {}),
                        ...(isLast ? styles.toggleSliderDisabled : {}),
                      }}
                    >
                      <span
                        style={{
                          ...styles.toggleKnob,
                          ...(isEnabled ? styles.toggleKnobChecked : {}),
                        }}
                      />
                    </span>
                  </label>
                  {isLast && (
                    <span id={`last-lang-${lang.code}`} className="sr-only" style={{ position: 'absolute', left: '-9999px' }}>
                      This is the last enabled language and cannot be disabled.
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Per-Language KB Content Section */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Knowledge Base Content by Language</h3>
        <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px' }}>
          View Knowledge Base entries organized by language. Only enabled languages can have new content added.
        </p>
        <div style={styles.kbSection}>
          {SUPPORTED_LANGUAGES.map((lang) => {
            const entries = getKbEntriesForLanguage(lang.code);
            const isEnabled = enabledLanguages.includes(lang.code);
            const isExpanded = expandedLanguage === lang.code;

            return (
              <div key={lang.code}>
                <div
                  style={styles.kbLanguageHeader}
                  onClick={() => handleExpandToggle(lang.code)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleExpandToggle(lang.code);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  aria-expanded={isExpanded}
                  aria-controls={`kb-entries-${lang.code}`}
                >
                  <span style={styles.kbLanguageTitle}>
                    {lang.name}{' '}
                    {!isEnabled && (
                      <span style={{ fontSize: '11px', color: '#94a3b8' }}>(disabled)</span>
                    )}
                  </span>
                  <span style={styles.kbEntryCount}>
                    {entries.length} {entries.length === 1 ? 'entry' : 'entries'}{' '}
                    {isExpanded ? '▲' : '▼'}
                  </span>
                </div>
                {isExpanded && (
                  <ul
                    id={`kb-entries-${lang.code}`}
                    style={styles.kbEntryList}
                    aria-label={`Knowledge base entries in ${lang.name}`}
                  >
                    {entries.length === 0 ? (
                      <li style={styles.emptyKbMessage}>
                        No Knowledge Base entries in {lang.name}.
                        {isEnabled
                          ? ' Add content via the Knowledge Base editor.'
                          : ' Enable this language to add content.'}
                      </li>
                    ) : (
                      entries.map((entry) => (
                        <li key={entry.id} style={styles.kbEntryItem}>
                          <div style={styles.kbEntryCategory}>{entry.category}</div>
                          <div style={styles.kbEntryQuestion}>{entry.question}</div>
                          <div style={styles.kbEntryAnswer} title={entry.answer}>
                            {entry.answer}
                          </div>
                        </li>
                      ))
                    )}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
