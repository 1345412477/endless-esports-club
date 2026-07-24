import { useState, useCallback, useEffect } from 'react';

export function useAuth() {
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const [role, setRole] = useState(() => localStorage.getItem('role'));
  const [username, setUsername] = useState(() => localStorage.getItem('username'));
  const [displayName, setDisplayName] = useState(() => localStorage.getItem('displayName'));

  const login = useCallback((t, r, u, dn) => {
    localStorage.setItem('token', t);
    localStorage.setItem('role', r);
    localStorage.setItem('username', u);
    if (dn) localStorage.setItem('displayName', dn);
    else localStorage.removeItem('displayName');
    setToken(t);
    setRole(r);
    setUsername(u);
    setDisplayName(dn || u);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('username');
    localStorage.removeItem('displayName');
    setToken(null);
    setRole(null);
    setUsername(null);
    setDisplayName(null);
  }, []);

  // 多标签页状态同步
  useEffect(() => {
    const handleStorage = (e) => {
      if (e.key === 'token') {
        setToken(e.newValue);
        setRole(localStorage.getItem('role'));
        setUsername(localStorage.getItem('username'));
        setDisplayName(localStorage.getItem('displayName'));
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const isLoggedIn = !!token;

  return { token, role, username, displayName: displayName || username, isLoggedIn, login, logout };
}
