import React, { useEffect } from 'react';
import { Loading, ErrorBox, useAsync } from './ui.jsx';
import { api } from '../api';

// Value is "ayId:semester". Lists semesters that have at least one published subject.
export default function SemesterPicker({ value, onChange, path = '/api/student/semesters' }) {
  const { loading, data, error } = useAsync(() => api.get(path), [path]);
  useEffect(() => {
    if (data && data.rows.length && !value) {
      const last = data.rows[data.rows.length - 1];
      onChange(`${last.academic_year_id}:${last.semester_no}`);
    }
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  if (!data.rows.length) return <div className="alert warn">No published results yet.</div>;
  return (
    <div className="field no-print" style={{ maxWidth: 320 }}>
      <label htmlFor="sempick">Semester</label>
      <select id="sempick" value={value || ''} onChange={(e) => onChange(e.target.value)}>
        {data.rows.map((r) => <option key={`${r.academic_year_id}:${r.semester_no}`} value={`${r.academic_year_id}:${r.semester_no}`}>{r.academic_year}, Semester {r.semester_no}</option>)}
      </select>
    </div>
  );
}
export const parseSem = (v) => { const [ay, sem] = (v || ':').split(':'); return { academic_year_id: ay, semester_no: sem }; };
