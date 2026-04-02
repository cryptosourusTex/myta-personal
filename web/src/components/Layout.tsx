import { NavLink, Outlet } from 'react-router-dom';

const navItems = [
  { to: '/courses', label: 'Courses' },
  { to: '/vault', label: 'Vault' },
  { to: '/assistant', label: 'Assistant' },
  { to: '/settings', label: 'Settings' },
];

export default function Layout() {
  return (
    <div className="app-layout">
      <header className="app-header">
        <NavLink to="/" className="app-logo">MyTA</NavLink>
        <nav className="app-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
      <nav className="mobile-nav">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `mobile-nav-link ${isActive ? 'active' : ''}`}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
