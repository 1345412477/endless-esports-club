import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { api } from '../api/client';
import { toast } from '../components/Toast';

export default function LoginPage() {
  const [role, setRole] = useState('admin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const auth = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/auth/login', { username, password, role });
      auth.login(res.data.token, role, username, res.data.displayName);
      toast('登录成功', 'success');
      const routeMap = { admin: '/admin', cs: '/cs', manager: '/manager' };
      navigate(routeMap[role] || '/');
    } catch (err) {
      setError(err.message);
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)',
    }}>
      <div className="card" style={{
        width: '420px',
        maxWidth: '90vw',
        padding: '40px',
      }}>
        <h1 style={{
          textAlign: 'center',
          marginBottom: '32px',
          background: 'linear-gradient(135deg, var(--accent), var(--accent2))',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          fontSize: '1.8rem',
        }}>
          无尽电竞业务系统
        </h1>
        <div className="gradient-line" />
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>角色</label>
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="admin">管理员</option>
              <option value="cs">客服</option>
              <option value="manager">店长</option>
            </select>
          </div>
          <div className="form-group">
            <label>用户名</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="请输入用户名"
              required
            />
          </div>
          <div className="form-group">
            <label>密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
              required
            />
          </div>
          {error && (
            <div className="error-text" style={{ marginBottom: '16px' }}>
              {error}
            </div>
          )}
          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '8px' }}
            disabled={loading}
          >
            {loading ? '登录中...' : '登录'}
          </button>
        </form>
      </div>
    </div>
  );
}
