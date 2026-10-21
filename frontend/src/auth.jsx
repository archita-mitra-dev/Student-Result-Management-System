import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, tokenStore } from './api';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const out = () => setUser(null);
    window.addEventListener('srms:logout', out);
    return () => window.removeEventListener('srms:logout', out);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!tokenStore.get()) { setLoading(false); return; }
      try { const r = await api.get('/api/auth/me'); if (alive) setUser(r.user); }
      catch { tokenStore.clear(); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  const login = useCallback(async (login_id, password) => {
    const r = await api.post('/api/auth/login', { login_id, password });
    tokenStore.set(r.token);
    setUser(r.user);
    return r.user;
  }, []);
  const logout = useCallback(() => { tokenStore.clear(); setUser(null); }, []);
  const refresh = useCallback(async () => { const r = await api.get('/api/auth/me'); setUser(r.user); }, []);

  return <Ctx.Provider value={{ user, loading, login, logout, refresh }}>{children}</Ctx.Provider>;
}
