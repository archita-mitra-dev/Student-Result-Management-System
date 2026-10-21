import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Layout from './components/Layout.jsx';
import { Loading } from './components/ui.jsx';
import { Login, Setup, Terms, Privacy, Account } from './pages/Public.jsx';
import { StudentDashboard, StudentProfile, Results, GradeCard, InternalMarksheet, DetailedMarksPage, History } from './pages/Student.jsx';
import { FacultyDashboard, MySubjects, MarksEntry } from './pages/Faculty.jsx';
import { AdminDashboard, Students, FacultyList, SetupPage, Offerings, OfferingDetail, Workflow, Documents } from './pages/Admin.jsx';
import { Grading, Schemes, Settings, Audit } from './pages/AdminConfig.jsx';
import Reports from './pages/Reports.jsx';

function Home() {
  const { user } = useAuth();
  if (user.role === 'admin') return <AdminDashboard />;
  if (user.role === 'faculty') return <FacultyDashboard />;
  return <StudentDashboard />;
}

function Guard({ roles, children }) {
  const { user } = useAuth();
  return roles.includes(user.role) ? children : <Navigate to="/" replace />;
}

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <div className="loginwrap"><Loading /></div>;
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/setup" element={<Setup />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/privacy" element={<Privacy />} />
      {user ? (
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/account" element={<Account />} />
          <Route path="/profile" element={<Guard roles={['student']}><StudentProfile /></Guard>} />
          <Route path="/results" element={<Guard roles={['student']}><Results /></Guard>} />
          <Route path="/grade-card" element={<Guard roles={['student']}><GradeCard /></Guard>} />
          <Route path="/internal-marksheet" element={<Guard roles={['student']}><InternalMarksheet /></Guard>} />
          <Route path="/detailed-marks" element={<Guard roles={['student']}><DetailedMarksPage /></Guard>} />
          <Route path="/history" element={<Guard roles={['student']}><History /></Guard>} />
          <Route path="/subjects" element={<Guard roles={['faculty']}><MySubjects /></Guard>} />
          <Route path="/marks/:id" element={<Guard roles={['faculty', 'admin']}><MarksEntry /></Guard>} />
          <Route path="/reports" element={<Guard roles={['faculty', 'admin']}><Reports /></Guard>} />
          <Route path="/admin/students" element={<Guard roles={['admin']}><Students /></Guard>} />
          <Route path="/admin/faculty" element={<Guard roles={['admin']}><FacultyList /></Guard>} />
          <Route path="/admin/setup" element={<Guard roles={['admin']}><SetupPage /></Guard>} />
          <Route path="/admin/offerings" element={<Guard roles={['admin']}><Offerings /></Guard>} />
          <Route path="/admin/offerings/:id" element={<Guard roles={['admin']}><OfferingDetail /></Guard>} />
          <Route path="/admin/workflow" element={<Guard roles={['admin']}><Workflow /></Guard>} />
          <Route path="/admin/documents" element={<Guard roles={['admin']}><Documents /></Guard>} />
          <Route path="/admin/grading" element={<Guard roles={['admin']}><Grading /></Guard>} />
          <Route path="/admin/schemes" element={<Guard roles={['admin']}><Schemes /></Guard>} />
          <Route path="/admin/settings" element={<Guard roles={['admin']}><Settings /></Guard>} />
          <Route path="/admin/audit" element={<Guard roles={['admin']}><Audit /></Guard>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      ) : (
        <Route path="*" element={<Navigate to="/login" replace />} />
      )}
    </Routes>
  );
}
