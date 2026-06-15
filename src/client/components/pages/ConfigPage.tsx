import { useState } from 'react';
import ConfigPanel from '../ConfigPanel';
import LanguageSettings from '../LanguageSettings';

type ConfigTab = 'general' | 'languages';

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '24px',
  },
  tabList: {
    display: 'flex',
    gap: '0',
    borderBottom: '2px solid #e2e8f0',
    marginBottom: '24px',
  },
  tab: {
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: 500,
    color: '#64748b',
    background: 'none',
    border: 'none',
    borderBottom: '2px solid transparent',
    marginBottom: '-2px',
    cursor: 'pointer',
    transition: 'color 0.15s, border-color 0.15s',
  },
  tabActive: {
    color: '#6366f1',
    borderBottomColor: '#6366f1',
    fontWeight: 600,
  },
};

export default function ConfigPage() {
  const [activeTab, setActiveTab] = useState<ConfigTab>('general');

  return (
    <div style={styles.container}>
      <div style={styles.tabList} role="tablist" aria-label="Configuration sections">
        <button
          role="tab"
          aria-selected={activeTab === 'general'}
          aria-controls="tab-panel-general"
          id="tab-general"
          style={{
            ...styles.tab,
            ...(activeTab === 'general' ? styles.tabActive : {}),
          }}
          onClick={() => setActiveTab('general')}
        >
          General
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'languages'}
          aria-controls="tab-panel-languages"
          id="tab-languages"
          style={{
            ...styles.tab,
            ...(activeTab === 'languages' ? styles.tabActive : {}),
          }}
          onClick={() => setActiveTab('languages')}
        >
          Languages
        </button>
      </div>

      {activeTab === 'general' && (
        <div
          role="tabpanel"
          id="tab-panel-general"
          aria-labelledby="tab-general"
        >
          <ConfigPanel />
        </div>
      )}

      {activeTab === 'languages' && (
        <div
          role="tabpanel"
          id="tab-panel-languages"
          aria-labelledby="tab-languages"
        >
          <LanguageSettings />
        </div>
      )}
    </div>
  );
}
