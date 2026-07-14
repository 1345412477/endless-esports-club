import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { toast } from '../components/Toast'
import Logo from '../components/Logo'
import { Icon } from '../components/Icon'

const PAGE_SIZE = 5

function formatDate(d) {
  if (!d) return '-'
  return d.slice(0, 16).replace('T', ' ')
}

function formatMoney(v) {
  if (v == null) return '0'
  return Number(v).toFixed(2)
}

export default function WorkerPage() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [type, setType] = useState(null)
  const [page, setPage] = useState(1)
  const [summary, setSummary] = useState(null)
  const [orders, setOrders] = useState([])
  const [settlements, setSettlements] = useState([])
  const [total, setTotal] = useState(0)
  const [searched, setSearched] = useState(false)
  const [settlementPage, setSettlementPage] = useState(1)

  const handleSearch = async (e) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return

    setError('')
    setLoading(true)
    setResult(null)
    setType(null)
    setSummary(null)
    setOrders([])
    setSettlements([])
    setTotal(0)
    setPage(1)
    setSearched(true)
    setSettlementPage(1)

    try {
      const [workerRes, csRes] = await Promise.all([
        api.get(`/query/worker?name=${encodeURIComponent(trimmed)}&page=1&size=${PAGE_SIZE}`),
        api.get(`/query/cs?name=${encodeURIComponent(trimmed)}&page=1&size=${PAGE_SIZE}`),
      ])

      const wData = workerRes.data
      const cData = csRes.data

      if (wData.type === 'worker') {
        setResult(wData)
        setType('worker')
        setSummary(wData.summary)
        setOrders(wData.orders || [])
        setSettlements(wData.settlements || [])
        setTotal(wData.total || 0)
      } else if (cData.type === 'cs') {
        setResult(cData)
        setType('cs')
        setSummary(cData.summary)
        setOrders(cData.orders || [])
        setSettlements(cData.settlements || [])
        setTotal(cData.total || 0)
      } else {
        setResult(null)
        setType(null)
      }
    } catch (err) {
      setError(err.message)
      toast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const loadPage = async (p) => {
    if (!result || !name.trim()) return
    setLoading(true)
    try {
      const endpoint = type === 'worker' ? '/query/worker' : '/query/cs'
      const res = await api.get(
        `${endpoint}?name=${encodeURIComponent(name.trim())}&page=${p}&size=${PAGE_SIZE}`
      )
      setOrders(res.data.orders || [])
      setPage(p)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const getAvatarLetter = () => {
    if (!name.trim()) return '?'
    return name.trim().charAt(0).toUpperCase()
  }

  return (
    <div className="container" style={{ paddingTop: '32px' }}>
      {/* 顶部导航 */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
        <button
          className="btn btn-outline btn-sm"
          onClick={() => navigate('/login')}
        >
          <Icon.Settings size={16} />
          管理后台
        </button>
      </div>

      {/* 品牌区域 */}
      <div className="hero-section">
        <div className="hero-logo">
          <Logo size="large" />
        </div>
        <h1 className="hero-title">无尽电竞业务系统</h1>
        <p className="hero-subtitle">WJGame 员工工资查询平台</p>
        <div className="gradient-line" style={{ maxWidth: '200px', margin: '16px auto' }} />
        <p className="hero-description">
          欢迎使用工资查询系统，输入姓名即可查看您的工资详情和订单记录
        </p>
      </div>

      {/* 搜索区域 */}
      <form onSubmit={handleSearch} style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', gap: '12px', maxWidth: '600px', margin: '0 auto' }}>
          <div className="search-wrapper">
            <Icon.Search size={18} className="search-icon" />
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="输入员工 / 客服姓名查询..."
              style={{
                width: '100%',
                fontSize: '1rem',
                padding: '14px 18px',
                background: 'var(--bg2)',
                border: '1px solid var(--rule)',
                borderRadius: 'var(--radius)',
                color: 'var(--ink)',
                outline: 'none',
                transition: 'border-color 0.2s, box-shadow 0.2s',
              }}
              onFocus={(e) => {
                e.target.style.borderColor = 'var(--accent)'
                e.target.style.boxShadow = '0 0 8px rgba(26, 115, 232, 0.15)'
              }}
              onBlur={(e) => {
                e.target.style.borderColor = 'var(--rule)'
                e.target.style.boxShadow = 'none'
              }}
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={loading} style={{ minWidth: '100px' }}>
            {loading ? '查询中...' : '查询'}
          </button>
        </div>
        <p style={{ textAlign: 'center', marginTop: '8px', fontSize: '0.85rem', color: 'var(--muted)' }}>
          <Icon.Info size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
          提示：请输入完整姓名，如"张三"
        </p>
      </form>

      {loading && (
        <div style={{ color: 'var(--muted)', fontSize: '0.9rem', marginBottom: '16px', textAlign: 'center' }}>
          查询中...
        </div>
      )}

      {error && (
        <div className="error-text" style={{ marginBottom: '16px', textAlign: 'center' }}>
          {error}
        </div>
      )}

      {searched && !loading && type === null && (
        <div className="card" style={{ textAlign: 'center', padding: '48px' }}>
          <Icon.AlertCircle size={48} style={{ color: 'var(--muted)', marginBottom: '16px' }} />
          <p style={{ color: 'var(--muted)', fontSize: '1.1rem' }}>未找到该人员信息</p>
        </div>
      )}

      {type && summary && (
        <>
          {/* 人员信息头部 */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            marginBottom: '24px',
            flexWrap: 'wrap',
          }}>
            <div className="avatar-placeholder">
              {getAvatarLetter()}
            </div>
            <h2 style={{
              fontFamily: 'var(--font-title)',
              fontSize: '1.4rem',
              color: 'var(--ink)',
              margin: 0,
            }}>
              {name.trim()}
            </h2>
            <span style={{
              display: 'inline-block',
              padding: '4px 12px',
              borderRadius: '12px',
              fontSize: '0.78rem',
              fontFamily: 'var(--font-title)',
              background: type === 'worker'
                ? 'rgba(26, 115, 232, 0.15)'
                : 'rgba(124, 58, 237, 0.15)',
              color: type === 'worker' ? 'var(--accent)' : 'var(--accent2)',
            }}>
              {type === 'worker' ? '员工' : '客服'}
            </span>
            {type === 'worker' && result && result.worker && result.worker.rating && (
              <span style={{
                display: 'inline-block',
                padding: '4px 12px',
                borderRadius: '12px',
                fontSize: '0.78rem',
                background: 'rgba(245, 158, 11, 0.15)',
                color: 'var(--warning)',
              }}>
                评级：{result.worker.rating}
              </span>
            )}
            {type === 'worker' && result && result.worker && (
              <span className={`badge ${result.worker.status === '在店' ? 'badge-接单中' : result.worker.status === '退店' ? 'badge-退单' : 'badge-开除'}`}>
                {result.worker.status || '在店'}
              </span>
            )}
            {type === 'worker' && result && result.worker && result.worker.deposit_target > 0 && (
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 12px',
                borderRadius: '12px',
                fontSize: '0.78rem',
                background: 'rgba(239, 68, 68, 0.10)',
                color: 'var(--danger)',
              }}>
                押金：¥{formatMoney(result.worker.deposit)} / ¥{formatMoney(result.worker.deposit_target)}
                <span style={{
                  width: '50px',
                  height: '6px',
                  background: 'rgba(255,255,255,0.1)',
                  borderRadius: '3px',
                  overflow: 'hidden',
                  display: 'inline-block'
                }}>
                  <span style={{
                    display: 'block',
                    height: '100%',
                    width: `${Math.min(100, (result.worker.deposit / result.worker.deposit_target) * 100)}%`,
                    background: result.worker.deposit >= result.worker.deposit_target ? 'var(--success)' : 'var(--accent)',
                    borderRadius: '3px'
                  }} />
                </span>
              </span>
            )}
          </div>

          {/* 统计卡片 */}
          <div className="stats-grid">
            {type === 'worker' ? (
              <>
                <div className="stat-card">
                  <div className="stat-label">已完成单数</div>
                  <div className="stat-value">{summary.completed_count}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">累计工资</div>
                  <div className="stat-value">¥{formatMoney(summary.total_salary)}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">已结算</div>
                  <div className="stat-value" style={{ color: 'var(--success)' }}>
                    ¥{formatMoney(summary.settled_total)}
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">未结算</div>
                  <div className="stat-value" style={{ color: 'var(--warning)' }}>
                    ¥{formatMoney(summary.unsettled)}
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">本月完成</div>
                  <div className="stat-value">{summary.month_count}</div>
                  <div className="stat-sub">单</div>
                </div>
              </>
            ) : (
              <>
                <div className="stat-card">
                  <div className="stat-label">已完成单数</div>
                  <div className="stat-value">{summary.order_count}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">累计提成</div>
                  <div className="stat-value">¥{formatMoney(summary.total_salary)}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">已结算</div>
                  <div className="stat-value" style={{ color: 'var(--success)' }}>
                    ¥{formatMoney(summary.settled_total)}
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">未结算</div>
                  <div className="stat-value" style={{ color: 'var(--warning)' }}>
                    ¥{formatMoney(summary.unsettled)}
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">本月提成</div>
                  <div className="stat-value">
                    ¥{formatMoney(summary.month_salary)}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* 已完成订单 */}
          {orders.length > 0 && (
            <div className="card" style={{ marginBottom: '24px', padding: '20px' }}>
              <h3 style={{
                fontFamily: 'var(--font-title)',
                fontSize: '1.1rem',
                marginBottom: '16px',
                color: 'var(--ink)',
              }}>
                已完成订单
              </h3>
              <div className="gradient-line" style={{ margin: '0 0 14px 0' }} />
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>时间</th>
                      <th>单子类型</th>
                      <th>客户</th>
                      <th>单子价格</th>
                      {type === 'worker' ? (
                        <th>本人工资</th>
                      ) : (
                        <th>客服提成金额</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o) => (
                      <tr key={o.id}>
                        <td>{formatDate(o.created_at)}</td>
                        <td>{o.order_type || '-'}</td>
                        <td>{o.customer_name || '-'}</td>
                        <td>¥{formatMoney(o.price)}</td>
                        {type === 'worker' ? (
                          <td>¥{formatMoney(o.salary)}</td>
                        ) : (
                          <td>¥{formatMoney(o.cs_commission_amount)}</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {totalPages > 1 && (
                <div className="pagination">
                  <button
                    disabled={page <= 1}
                    onClick={() => loadPage(page - 1)}
                  >
                    上一页
                  </button>
                  <span>{page} / {totalPages}</span>
                  <button
                    disabled={page >= totalPages}
                    onClick={() => loadPage(page + 1)}
                  >
                    下一页
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 结算记录 */}
          <div className="card" style={{ padding: '20px' }}>
            <h3 style={{
              fontFamily: 'var(--font-title)',
              fontSize: '1.1rem',
              marginBottom: '16px',
              color: 'var(--ink)',
            }}>
              结算记录
            </h3>
            <div className="gradient-line" style={{ margin: '0 0 14px 0' }} />
            {settlements.length > 0 ? (
              <>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>结算时间</th>
                        <th>结算金额</th>
                        <th>操作人</th>
                      </tr>
                    </thead>
                    <tbody>
                      {settlements.slice((settlementPage - 1) * PAGE_SIZE, settlementPage * PAGE_SIZE).map((s, i) => (
                        <tr key={i}>
                          <td>{formatDate(s.settled_at)}</td>
                          <td>¥{formatMoney(s.settled_amount)}</td>
                          <td>{s.settled_by || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {settlements.length > PAGE_SIZE && (
                  <div className="pagination">
                    <button
                      disabled={settlementPage <= 1}
                      onClick={() => setSettlementPage(p => Math.max(1, p - 1))}
                    >
                      上一页
                    </button>
                    <span>{settlementPage} / {Math.ceil(settlements.length / PAGE_SIZE)}</span>
                    <button
                      disabled={settlementPage >= Math.ceil(settlements.length / PAGE_SIZE)}
                      onClick={() => setSettlementPage(p => Math.min(Math.ceil(settlements.length / PAGE_SIZE), p + 1))}
                    >
                      下一页
                    </button>
                  </div>
                )}
              </>
            ) : (
              <p style={{ color: 'var(--muted)', fontSize: '0.9rem', padding: '24px 0', textAlign: 'center' }}>
                暂无结算记录
              </p>
            )}
          </div>
        </>
      )}

      {/* 空状态 */}
      {!searched && !loading && (
        <div className="empty-state">
          <div className="feature-grid">
            <div className="feature-card">
              <div className="feature-icon">
                <Icon.Wallet size={40} strokeWidth={1.5} />
              </div>
              <h3>工资查询</h3>
              <p>查看您的累计工资、已结算和未结算金额</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">
                <Icon.FileText size={40} strokeWidth={1.5} />
              </div>
              <h3>订单记录</h3>
              <p>查看历史完成订单和提成明细</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">
                <Icon.BarChart3 size={40} strokeWidth={1.5} />
              </div>
              <h3>结算明细</h3>
              <p>查看结算记录和押金进度</p>
            </div>
          </div>
        </div>
      )}

      {/* 底部信息 */}
      <div className="footer">
        <span>&copy; 2026 无尽电竞 WJGame</span>
        <span>|</span>
        <span>技术支持：IT部门</span>
        <p style={{ marginTop: '8px', fontSize: '0.8rem' }}>如有疑问，请联系管理员</p>
      </div>
    </div>
  )
}
