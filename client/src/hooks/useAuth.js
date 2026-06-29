import { useState } from 'react';

export function useAuth() {
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const [role, setRole] = useState(() => localStorage.getItem('role'));
  const [username, setUsername] = useState(() => localStorage.getItem('username'));
  const [displayName, setDisplayName] = useState(() => localStorage.getItem('displayName'));

  const login = (t, r, u, dn) => {
    localStorage.setItem('token', t);
    localStorage.setItem('role', r);
    localStorage.setItem('username', u);
    if (dn) localStorage.setItem('displayName', dn);
    else localStorage.removeItem('displayName');
    setToken(t);
    setRole(r);
    setUsername(u);
    setDisplayName(dn || u);
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('username');
    localStorage.removeItem('displayName');
    setToken(null);
    setRole(null);
    setUsername(null);
    setDisplayName(null);
  };

  const isLoggedIn = !!token;

  return { token, role, username, displayName: displayName || username, isLoggedIn, login, logout };
}
