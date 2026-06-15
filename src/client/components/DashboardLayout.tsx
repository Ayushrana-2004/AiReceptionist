import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { apiClient } from '../services/api';

const navItems = [
  { to: '/dashboard', label: 'Overview', end: true },
  { to: '/dashboard/calls', label: 'Calls', end: false },
  { to: '/dashboard/knowledge-base', label: 'Knowledge Base', end: false },
  { to: '/dashboard/routing', label: 'Routing Rules', end: false },
  { to: '/dashboard/leads', label: 'Leads', end: false },
  { to: '/dashboard/sms', label: 'SMS', end: false },
  { to: '/dashboard/config', label: 'Config', end: false },
  { to: '/dashboard/analytics', label: 'Analytics', end: false },
];

const styles: Record<string, React.CSSProperties> = {
  skipLink: {
    position: 'absolute',
    top: '-40px',
    left: 0,
    background: '#1a1a2e',
    color: '#ffffff',
    padding: '8px 16px',
    zIndex: 1000,
    fontSize: '14px',
    textDecoration: 'none',
    borderRadius: '0 0 4px 0',
    transition: 'top 0.2s',
  },
  skipLinkFocus: {
    top: 0,
  },
  layout: {
    display: 'flex',
    minHeight: '100vh',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    color: '#1a1a2e',
    backgroundColor: '#f8f9fa',
  },
  sidebar: {
    width: '240px',
    backgroundColor: '#1a1a2e',
    color: '#e0e0e0',
    display: 'flex',
    flexDirection: 'column',
    padding: '0',
    position: 'fixed',
    top: 0,
    left: 0,
    bottom: 0,
    overflowY: 'auto',
  },
  sidebarHeader: {
    padding: '20px 16px',
    borderBottom: '1px solid #2d2d44',
    fontSize: '14px',
    fontWeight: 600,
    color: '#a0a0b8',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  navList: {
    listStyle: 'none',
    margin: 0,
    padding: '8px 0',
  },
  navItem: {
    margin: 0,
  },
  navLink: {
    display: 'block',
    padding: '10px 16px',
    color: '#c8c8d8',
    textDecoration: 'none',
    fontSize: '14px',
    borderLeft: '3px solid transparent',
    transition: 'background-color 0.15s, border-color 0.15s',
    outline: 'none',
  },
  navLinkActive: {
    backgroundColor: '#2d2d44',
    color: '#ffffff',
    borderLeftColor: '#6366f1',
    fontWeight: 600,
  },
  navLinkFocus: {
    outline: '2px solid #6366f1',
    outlineOffset: '-2px',
  },
  mainWrapper: {
    marginLeft: '240px',
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100vh',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 24px',
    backgroundColor: '#ffffff',
    borderBottom: '1px solid #e2e8f0',
    position: 'sticky',
    top: 0,
    zIndex: 10,
  },
  headerTitle: {
    fontSize: '20px',
    fontWeight: 700,
    color: '#1a1a2e',
    margin: 0,
  },
  logoutButton: {
    padding: '8px 16px',
    backgroundColor: '#ef4444',
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'background-color 0.15s',
    outline: 'none',
  },
  mainContent: {
    flex: 1,
    padding: '24px',
  },
};

export default function DashboardLayout() {
  const navigate = useNavigate();

  function handleLogout() {
    apiClient.clearTokens();
    navigate('/login');
  }

  return (
    <div style={styles.layout}>
      <a
        href="#main-content"
        style={styles.skipLink}
        onFocus={(e) => {
          e.currentTarget.style.top = '0';
        }}
        onBlur={(e) => {
          e.currentTarget.style.top = '-40px';
        }}
      >
        Skip to main content
      </a>

      <aside style={styles.sidebar}>
        <div style={styles.sidebarHeader}>Navigation</div>
        <nav aria-label="Dashboard navigation">
          <ul style={styles.navList} role="list">
            {navItems.map((item) => (
              <li key={item.to} style={styles.navItem}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  style={({ isActive }) => ({
                    ...styles.navLink,
                    ...(isActive ? styles.navLinkActive : {}),
                  })}
                  aria-current={undefined}
                  // React Router's NavLink sets aria-current="page" automatically when active
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      <div style={styles.mainWrapper}>
        <header style={styles.header}>
          <h1 style={styles.headerTitle}>AI Receptionist</h1>
          <button
            type="button"
            onClick={handleLogout}
            style={styles.logoutButton}
            onFocus={(e) => {
              e.currentTarget.style.outline = '2px solid #1a1a2e';
              e.currentTarget.style.outlineOffset = '2px';
            }}
            onBlur={(e) => {
              e.currentTarget.style.outline = 'none';
            }}
          >
            Logout
          </button>
        </header>

        <main id="main-content" style={styles.mainContent} role="main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
