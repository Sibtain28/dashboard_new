import { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
import { LayoutDashboard, MessageSquare, LogOut, Menu, X, Sun, Moon } from 'lucide-react';
import './MainLayout.css';

function MainLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [theme, setTheme] = useState(() => {
    if (typeof window === 'undefined') return 'light';
    return window.localStorage.getItem('app-theme') || 'light';
  });

  const isChatbotPage = location.pathname.startsWith('/app/chatbot');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    document.documentElement.setAttribute('data-theme', theme);
    window.localStorage.setItem('app-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  // Get user from localStorage
  const userStr = localStorage.getItem('user');
  const user = userStr ? JSON.parse(userStr) : { name: 'John Doe', email: 'john@example.com' };

  // Initials for avatar
  const initials = user.name
    ? user.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
    : 'JD';

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  const handleSignOut = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  return (
    <div className={`main-layout ${isChatbotPage ? 'chatbot-page' : ''}`}>
      {/* Hamburger Menu Toggle (Visible when sidebar is closed) */}
      <button
        className={`sidebar-toggle-btn ${isSidebarOpen ? 'hidden' : ''}`}
        onClick={toggleSidebar}
        aria-label="Open Menu"
      >
        <Menu size={24} />
      </button>

      {/* Theme Toggle (sits just below the sidebar toggle button) */}
      <button
        className={`theme-toggle-btn ${isSidebarOpen ? 'hidden' : ''}`}
        onClick={toggleTheme}
        aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
        title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
      >
        {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
      </button>

      {/* Sidebar Navigation */}
      <aside className={`sidebar ${isSidebarOpen ? 'open' : 'closed'}`}>
        <div className="sidebar-header">
          <Link to="/" aria-label="Go to home">
            <img
              src="/photo/logo.png"
              alt="Jindal Steel"
              className="company-logo"
            />
          </Link>
          <button className="sidebar-close-btn" onClick={toggleSidebar} aria-label="Close Menu">
            <X size={20} />
          </button>
        </div>

        <nav className="sidebar-nav">
          <NavLink
            to="/app/dashboard"
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <LayoutDashboard size={20} />
            <span>Dashboard</span>
          </NavLink>
          <NavLink
            to="/app/chatbot"
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <MessageSquare size={20} />
            <span>Chatbot</span>
          </NavLink>
        </nav>

        <div className="sidebar-footer">
          <div className="user-profile">
            <div className="avatar">{initials}</div>
            <div className="user-info">
              <span className="user-name" style={{ maxWidth: '120px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.name}</span>
              <span className="user-role" style={{ maxWidth: '120px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.email}</span>
            </div>
          </div>
          <button className="btn-signout" onClick={handleSignOut} aria-label="Sign Out">
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="content-area">
        <Outlet />
      </main>
    </div>
  );
}

export default MainLayout;