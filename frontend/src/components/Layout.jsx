import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

const NAV = {
  student: [
    ['', [['/', 'Dashboard'], ['/profile', 'My profile']]],
    ['Results', [['/results', 'Semester results'], ['/grade-card', 'Grade card'], ['/internal-marksheet', 'Internal marksheet'], ['/detailed-marks', 'Detailed marks'], ['/history', 'Academic history']]],
  ],
  faculty: [
    ['', [['/', 'Dashboard']]],
    ['Assessments', [['/subjects', 'My subjects'], ['/reports', 'Reports']]],
  ],
  admin: [
    ['', [['/', 'Dashboard']]],
    ['People', [['/admin/students', 'Students'], ['/admin/faculty', 'Faculty']]],
    ['Academics', [['/admin/setup', 'Departments and subjects'], ['/admin/offerings', 'Subject offerings'], ['/admin/grading', 'Grading and credits'], ['/admin/schemes', 'Assessment schemes']]],
    ['Results', [['/admin/workflow', 'Approve and publish'], ['/admin/documents', 'Student documents'], ['/reports', 'Reports']]],
    ['System', [['/admin/settings', 'Settings'], ['/admin/audit', 'Audit log']]],
  ],
};

export default function Layout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  return (
    <div className="shell">
      <a className="skip" href="#main">Skip to content</a>
      <aside className="side no-print">
        <div className="brand">Result Management<small>{user.role === 'admin' ? 'Administrator' : user.role === 'faculty' ? 'Faculty' : 'Student'} workspace</small></div>
        <nav className="nav" aria-label="Main">
          {NAV[user.role].map(([group, links]) => (
            <React.Fragment key={group || 'top'}>
              {group && <h4>{group}</h4>}
              {links.map(([to, label]) => <NavLink key={to} to={to} end={to === '/'}>{label}</NavLink>)}
            </React.Fragment>
          ))}
        </nav>
        <div className="who">
          <b>{user.full_name}</b>
          <span className="muted">{user.login_id}</span>
          <div className="actions" style={{ marginTop: '.5rem' }}>
            <button className="btn secondary small" onClick={() => nav('/account')}>Password</button>
            <button className="btn secondary small" onClick={() => { logout(); nav('/login'); }}>Log out</button>
          </div>
          <p className="small muted" style={{ marginTop: '.8rem' }}><NavLink to="/terms">Terms</NavLink> · <NavLink to="/privacy">Privacy</NavLink></p>
        </div>
      </aside>
      <main id="main" className="main"><Outlet /></main>
    </div>
  );
}
