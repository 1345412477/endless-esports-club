import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { api } from '../api/client'
import { toast } from '../components/Toast'
import { confirm } from '../components/ConfirmDialog'
import { ORDER_STATUSES, DEFAULT_PAGE_SIZE } from '../utils/constants'
import { formatDate, formatMoney } from '../utils/helpers'

const VALID_STATUSES = ORDER_STATUSES

const TABS = ['数据看板', '人员配置', '工资结算', '操作日志', '店长管理']

export default function AdminPage() {
  const navigate = useNavigate()
  const auth = useAuth()

  const [activeTab, setActiveTab] = useState('数据看板')

  const handleLogout = () => {
    auth.logout()
    navigate('/login')
  }

  return (
    <div className="container" style={{ paddingTop: '16px' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '24px',
      }}>
        <h1 className="page-title">管理后台</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ color: 'var(--ink)', fontSize: '0.95rem' }}>
            {auth.username}
          </span>
          <button className="btn btn-outline btn-sm" onClick={handleLogout}>
            退出登录
          </button>
        </div>
      </div>

      <div className="tabs">
        {TABS.map(t => (
          <button
            key={t}
            className={`tab ${activeTab === t ? 'active' : ''}`}
            onClick={() => setActiveTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {activeTab === '数据看板' && <DashboardTab />}
      {activeTab === '人员配置' && <PersonnelTab />}
      {activeTab === '工资结算' && <SettlementTab />}
      {activeTab === '操作日志' && <LogsTab />}
      {activeTab === '店长管理' && <ManagerTab />}
    </div>
  )
}

function DashboardTab() {
  const [dimension, setDimension] = useState('day')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [orderPage, setOrderPage] = useState(1)
  const [orderPageSize] = useState(10)
  const [orderStatusFilter, setOrderStatusFilter] = useState('')
  const [orders, setOrders] = useState([])
  const [orderTotal, setOrderTotal] = useState(0)
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [ordersError, setOrdersError] = useState('')
  const [workerList, setWorkerList] = useState([])
  const [csList, setCsList] = useState([])
  const [trend, setTrend] = useState([])
  const [editingOrder, setEditingOrder] = useState(null)
  const [editForm, setEditForm] = useState({ customer_name: '', remark: '', price: '', workers: [] })
  const [editError, setEditError] = useState('')
  const [editSubmitting, setEditSubmitting] = useState(false)
  const [createModal, setCreateModal] = useState(false)
  const [createForm, setCreateForm] = useState({ cs_name: '', order_type: '', customer_name: '', remark: '', price: '', workers: [{ name: '' }] })
  const [createError, setCreateError] = useState('')
  const [createSubmitting, setCreateSubmitting] = useState(false)

  const [dropdownOpen, setDropdownOpen] = useState(null)
  const [dropdownSearch, setDropdownSearch] = useState('')
  const dropdownRef = useRef(null)

  useEffect(() => {
    if (!dropdownOpen) return
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(null)
        setDropdownSearch('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [dropdownOpen])

  const renderSearchableSelect = (value, onChange, options, placeholder, dropdownKey) => {
    const isOpen = dropdownOpen === dropdownKey
    const filtered = options.filter(o =>
      o.name.toLowerCase().includes(dropdownSearch.toLowerCase())
    )

    return (
      <div style={{ position: 'relative' }}>
        <div
          onClick={() => {
            if (isOpen) {
              setDropdownOpen(null)
              setDropdownSearch('')
            } else {
              setDropdownOpen(dropdownKey)
              setDropdownSearch('')
            }
          }}
          style={{
            flex: 1,
            padding: '8px 12px',
            border: '1px solid var(--rule)',
            borderRadius: '4px',
            cursor: 'pointer',
            background: 'var(--bg)',
            color: value ? 'var(--ink)' : 'var(--muted)',
            fontSize: '0.9rem',
            boxSizing: 'border-box',
            userSelect: 'none',
          }}
        >
          {value || placeholder}
        </div>
        {isOpen && (
          <div
            ref={dropdownRef}
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              zIndex: 200,
              background: 'var(--bg)',
              border: '1px solid var(--rule)',
              borderRadius: '4px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              maxHeight: '220px',
              overflow: 'hidden',
            }}
          >
            <input
              type="text"
              value={dropdownSearch}
              onChange={(e) => setDropdownSearch(e.target.value)}
              placeholder="搜索员工..."
              autoFocus
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '100%',
                border: 'none',
                borderBottom: '1px solid var(--rule)',
                padding: '8px 12px',
                outline: 'none',
                background: 'var(--bg)',
                color: 'var(--ink)',
                fontSize: '0.85rem',
                boxSizing: 'border-box',
              }}
            />
            <div style={{ overflowY: 'auto', maxHeight: '170px' }}>
              {filtered.length === 0 ? (
                <div style={{ padding: '8px 12px', color: 'var(--muted)', fontSize: '0.85rem' }}>
                  无匹配结果
                </div>
              ) : (
                filtered.map(opt => (
                  <div
                    key={opt.name}
                    onClick={() => {
                      onChange(opt.name)
                      setDropdownOpen(null)
                      setDropdownSearch('')
                    }}
                    style={{
                      padding: '8px 12px',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      color: 'var(--ink)',
                      background: value === opt.name ? 'var(--surface)' : 'transparent',
                    }}
                    onMouseEnter={(e) => {
                      if (value !== opt.name) e.target.style.background = 'var(--surface)'
                    }}
                    onMouseLeave={(e) => {
                      if (value !== opt.name) e.target.style.background = 'transparent'
                    }}
                  >
                    {opt.name}（{(opt.default_deduction_rate * 100).toFixed(0)}%抽成）
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  const getDateParam = () => {
    const d = currentDate
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    if (dimension === 'day') return `${y}-${m}-${day}`
    if (dimension === 'week') return `${y}-${m}-${day}`
    if (dimension === 'month') return `${y}-${m}`
    if (dimension === 'year') return `${y}`
    return `${y}-${m}-${day}`
  }

  const shiftDate = (dir) => {
    setCurrentDate(prev => {
      const d = new Date(prev)
      if (dimension === 'day') d.setDate(d.getDate() + dir)
      else if (dimension === 'week') d.setDate(d.getDate() + dir * 7)
      else if (dimension === 'month') d.setMonth(d.getMonth() + dir)
      else if (dimension === 'year') d.setFullYear(d.getFullYear() + dir)
      return d
    })
  }

  const goToday = () => setCurrentDate(new Date())

  const getDisplayLabel = () => {
    const d = currentDate
    const y = d.getFullYear()
    const m = d.getMonth() + 1
    const day = d.getDate()
    if (dimension === 'day') return `${y}年${m}月${day}日`
    if (dimension === 'week') {
      const dayOfWeek = d.getDay() || 7
      const monday = new Date(d)
      monday.setDate(d.getDate() - dayOfWeek + 1)
      const sunday = new Date(monday)
      sunday.setDate(monday.getDate() + 6)
      return `${monday.getFullYear()}.${monday.getMonth() + 1}.${monday.getDate()} - ${sunday.getMonth() + 1}.${sunday.getDate()}`
    }
    if (dimension === 'month') return `${y}年${m}月`
    if (dimension === 'year') return `${y}年`
    return ''
  }

  const isToday = () => {
    const now = new Date()
    const d = currentDate
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
  }

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const dateParam = getDateParam()
      const dashRes = await api.get(`/stats/dashboard?dimension=${dimension}&date=${encodeURIComponent(dateParam)}`)
      setData(dashRes.data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [dimension, currentDate])

  useEffect(() => {
    loadData()
  }, [loadData])

  const loadOrders = useCallback(async () => {
    setOrdersLoading(true)
    setOrdersError('')
    try {
      let path = `/orders?page=${orderPage}&size=${orderPageSize}`
      if (orderStatusFilter) path += `&status=${encodeURIComponent(orderStatusFilter)}`
      const res = await api.get(path)
      setOrders(res.data.list || [])
      setOrderTotal(res.data.total || 0)
    } catch (err) {
      setOrdersError(err.message)
    } finally {
      setOrdersLoading(false)
    }
  }, [orderPage, orderPageSize, orderStatusFilter])

  useEffect(() => {
    loadOrders()
  }, [loadOrders])

  useEffect(() => {
    Promise.all([
      api.get('/config/workers'),
      api.get('/config/cs'),
      api.get('/stats/trend?days=7'),
    ]).then(([wRes, cRes, tRes]) => {
      setWorkerList(wRes.data || [])
      setCsList((cRes.data || []).filter(c => c.active))
      setTrend(tRes.data || [])
    }).catch(() => {})
  }, [])

  const activeWorkers = workerList.filter(w => w.status === '在店')

  const handleStatusChange = async (orderId, newStatus) => {
    try {
      await api.put(`/orders/${orderId}/status`, { status: newStatus })
      toast('订单状态已更新', 'success')
      await loadOrders()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  const handleDeleteOrder = async (orderId) => {
    const confirmed = await confirm('确定删除该订单？')
    if (!confirmed) return
    try {
      await api.del('/orders/' + orderId)
      toast('订单已删除', 'success')
      await loadOrders()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  const openCreateModal = () => {
    setCreateModal(true)
    setCreateForm({ cs_name: '', order_type: '', customer_name: '', remark: '', price: '', workers: [{ name: '' }] })
    setCreateError('')
  }

  const closeCreateModal = () => {
    setCreateModal(false)
    setCreateError('')
  }

  const updateCreateWorker = (index, value) => {
    const updated = createForm.workers.map((w, i) => i === index ? { ...w, name: value } : w)
    setCreateForm({ ...createForm, workers: updated })
  }

  const addCreateWorker = () => {
    if (createForm.workers.length >= 2) return
    setCreateForm({ ...createForm, workers: [...createForm.workers, { name: '' }] })
  }

  const removeCreateWorker = (index) => {
    if (createForm.workers.length <= 1) return
    setCreateForm({ ...createForm, workers: createForm.workers.filter((_, i) => i !== index) })
  }

  const handleCreateSubmit = async (e) => {
    e.preventDefault()
    setCreateError('')
    if (!createForm.cs_name) { setCreateError('请选择客服'); return }
    if (!createForm.order_type.trim()) { setCreateError('请输入单子类型'); return }
    const numPrice = parseFloat(createForm.price)
    if (isNaN(numPrice) || numPrice <= 0) { setCreateError('单子价格必须大于0'); return }
    const workerNames = createForm.workers.map(w => w.name).filter(n => n.trim())
    if (workerNames.length < 1) { setCreateError('至少需要关联1名员工'); return }
    if (workerNames.length !== createForm.workers.length) { setCreateError('请为所有员工行选择员工'); return }
    if (new Set(workerNames).size !== workerNames.length) { setCreateError('员工不能重复'); return }

    setCreateSubmitting(true)
    try {
      await api.post('/orders', {
        cs_name: createForm.cs_name,
        order_type: createForm.order_type.trim(),
        customer_name: createForm.customer_name.trim(),
        remark: createForm.remark.trim(),
        price: numPrice,
        workers: createForm.workers.map(w => ({ name: w.name.trim() })),
      })
      closeCreateModal()
      await loadOrders()
      await loadData()
      toast('订单创建成功', 'success')
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setCreateSubmitting(false)
    }
  }

  const openEditModal = (order) => {
    setEditingOrder(order)
    setEditForm({
      order_type: order.order_type || '',
      customer_name: order.customer_name || '',
      remark: order.remark || '',
      price: String(order.price || ''),
      workers: (order.workers || []).map(w => ({ name: w.worker_name })),
    })
    setEditError('')
  }

  const closeEditModal = () => {
    setEditingOrder(null)
    setEditError('')
  }

  const updateEditWorker = (index, value) => {
    const updated = editForm.workers.map((w, i) => i === index ? { ...w, name: value } : w)
    setEditForm({ ...editForm, workers: updated })
  }

  const addEditWorker = () => {
    if (editForm.workers.length >= 2) return
    setEditForm({ ...editForm, workers: [...editForm.workers, { name: '' }] })
  }

  const removeEditWorker = (index) => {
    if (editForm.workers.length <= 1) return
    setEditForm({ ...editForm, workers: editForm.workers.filter((_, i) => i !== index) })
  }

  const handleEditSubmit = async (e) => {
    e.preventDefault()
    setEditError('')
    const numPrice = parseFloat(editForm.price)
    if (isNaN(numPrice) || numPrice <= 0) { setEditError('单子价格必须大于0'); return }
    const workerNames = editForm.workers.map(w => w.name).filter(n => n.trim())
    if (workerNames.length < 1) { setEditError('至少需要关联1名员工'); return }
    if (workerNames.length !== editForm.workers.length) { setEditError('请为所有员工行选择员工'); return }
    if (new Set(workerNames).size !== workerNames.length) { setEditError('员工不能重复'); return }
    const validatedWorkers = editForm.workers.map(w => ({ name: w.name.trim() }))
    setEditSubmitting(true)
    try {
      await api.put(`/orders/${editingOrder.id}`, {
        order_type: editForm.order_type.trim(),
        customer_name: editForm.customer_name.trim(),
        remark: editForm.remark.trim(),
        price: numPrice,
        workers: validatedWorkers,
      })
      closeEditModal()
      await loadOrders()
      toast('订单已更新', 'success')
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setEditSubmitting(false)
    }
  }

  const getOrderStatusStyle = (status) => {
    switch (status) {
      case '接单中': return { background: 'rgba(6,182,212,0.12)', color: '#0891b2', border: '1px solid rgba(6,182,212,0.4)' }
      case '已结单': return { background: 'rgba(34,197,94,0.12)', color: '#16a34a', border: '1px solid rgba(34,197,94,0.4)' }
      case '存单': return { background: 'rgba(245,158,11,0.12)', color: '#d97706', border: '1px solid rgba(245,158,11,0.4)' }
      case '退单': return { background: 'rgba(239,68,68,0.12)', color: '#dc2626', border: '1px solid rgba(239,68,68,0.4)' }
      default: return { background: 'var(--bg)', color: 'var(--ink)', border: '1px solid var(--rule)' }
    }
  }

  const orderTotalPages = Math.max(1, Math.ceil(orderTotal / orderPageSize))

  const renderChange = (change, invertColor) => {
    if (change === null || change === undefined) return null
    const isUp = change > 0
    const isDown = change < 0
    let color = 'var(--muted)'
    if (invertColor) {
      if (isUp) color = 'var(--danger)'
      if (isDown) color = 'var(--success)'
    } else {
      if (isUp) color = 'var(--success)'
      if (isDown) color = 'var(--danger)'
    }
    const sign = isUp ? '↑' : isDown ? '↓' : '—'
    return (
      <span style={{ fontSize: '0.78rem', color }}>
        {sign} {Math.abs(change).toFixed(1)}%
      </span>
    )
  }

  const summary = data?.summary || {}
  const changes = data?.changes || {}
  const csRanking = data?.cs_ranking || []
  const workerRanking = data?.worker_ranking || []
  const typeDist = data?.type_distribution || []
  const maxCsAmount = csRanking.length > 0 ? csRanking[0].amount : 0
  const maxWorkerCount = workerRanking.length > 0 ? workerRanking[0].order_count : 0
  const maxTypeAmount = typeDist.length > 0 ? typeDist[0].amount : 0

  const rankBadge = (i) => {
    const colors = ['#FFD700', '#C0C0C0', '#CD7F32']
    return (
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '24px',
        height: '24px',
        borderRadius: '50%',
        background: i < 3 ? colors[i] : 'var(--bg2)',
        color: i < 3 ? '#000' : 'var(--muted)',
        fontWeight: 'bold',
        fontSize: '0.75rem',
        flexShrink: 0,
      }}>
        {i + 1}
      </span>
    )
  }

  return (
    <div>
      {/* Time selector */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', gap: '4px', background: 'var(--bg2)', borderRadius: '8px', padding: '3px' }}>
          {[
            { key: 'day', label: '日度' },
            { key: 'week', label: '周度' },
            { key: 'month', label: '月度' },
            { key: 'year', label: '年度' },
          ].map(d => (
            <button
              key={d.key}
              onClick={() => { setDimension(d.key); setCurrentDate(new Date()) }}
              style={{
                padding: '6px 16px',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.88rem',
                fontWeight: dimension === d.key ? '600' : '400',
                background: dimension === d.key ? 'var(--accent)' : 'transparent',
                color: dimension === d.key ? '#fff' : 'var(--text2)',
                transition: 'all 0.2s',
              }}
            >
              {d.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button className="btn btn-outline btn-sm" onClick={() => shiftDate(-1)}>◀</button>
          <span style={{ fontSize: '0.95rem', fontWeight: '600', minWidth: dimension === 'day' ? '120px' : dimension === 'week' ? '160px' : dimension === 'year' ? '60px' : '80px', textAlign: 'center' }}>
            {getDisplayLabel()}
          </span>
          <button className="btn btn-outline btn-sm" onClick={() => shiftDate(1)}>▶</button>
          {!isToday() && (
            <button className="btn btn-outline btn-sm" onClick={goToday} style={{ fontSize: '0.8rem' }}>回到今天</button>
          )}
        </div>

        <div style={{ display: 'flex', gap: '6px', marginLeft: 'auto', flexWrap: 'wrap' }}>
          <button className="btn btn-outline btn-sm" onClick={() => { setDimension('day'); setCurrentDate(new Date()) }}>今天</button>
          <button className="btn btn-outline btn-sm" onClick={() => {
            const d = new Date(); d.setDate(d.getDate() - 1); setDimension('day'); setCurrentDate(d)
          }}>昨天</button>
          <button className="btn btn-outline btn-sm" onClick={() => { setDimension('week'); setCurrentDate(new Date()) }}>本周</button>
          <button className="btn btn-outline btn-sm" onClick={() => { setDimension('month'); setCurrentDate(new Date()) }}>本月</button>
          <button className="btn btn-outline btn-sm" onClick={() => { setDimension('year'); setCurrentDate(new Date()) }}>今年</button>
        </div>
      </div>

      {loading && <div style={{ color: 'var(--muted)', fontSize: '0.9rem', marginBottom: '16px' }}>加载中...</div>}
      {error && <div className="error-text" style={{ marginBottom: '16px' }}>{error}</div>}

      {/* Core metrics */}
      {data && (
        <>
          <div className="stats-grid" style={{ marginBottom: '24px' }}>
            <div className="stat-card" style={{ borderLeft: '3px solid var(--accent)' }}>
              <div className="stat-label">流水总额</div>
              <div className="stat-value" style={{ color: 'var(--accent)', fontSize: '1.8rem' }}>¥{formatMoney(summary.total_amount)}</div>
              <div style={{ marginTop: '4px' }}>{renderChange(changes.total_amount)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">总单数</div>
              <div className="stat-value">{summary.total_orders || 0}</div>
              <div style={{ marginTop: '4px' }}>{renderChange(changes.total_orders)}</div>
            </div>
            <div className="stat-card" style={{ borderLeft: '3px solid var(--success)' }}>
              <div className="stat-label">已结单数</div>
              <div className="stat-value" style={{ color: 'var(--success)' }}>{summary.completed_orders || 0}</div>
              <div style={{ marginTop: '4px' }}>{renderChange(changes.completed_orders)}</div>
            </div>
            <div className="stat-card" style={{ borderLeft: '3px solid var(--danger)' }}>
              <div className="stat-label">退单数</div>
              <div className="stat-value" style={{ color: 'var(--danger)' }}>{summary.refund_orders || 0}</div>
              <div style={{ marginTop: '4px' }}>{renderChange(changes.refund_orders, true)}</div>
            </div>
          </div>

          {/* Two columns */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
            {/* Left column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* CS Ranking */}
              <div className="card">
                <h3 style={{ marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '1.1rem' }}>📊</span> 客服业绩 Top 5
                </h3>
                <div className="gradient-line" />
                {csRanking.length === 0 ? (
                  <p style={{ color: 'var(--muted)', textAlign: 'center', padding: '24px 0' }}>暂无数据</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '8px 0' }}>
                    {csRanking.map((c, i) => (
                      <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {rankBadge(i)}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                            <span style={{ fontWeight: '500', fontSize: '0.9rem' }}>{c.name}</span>
                            <span style={{ fontSize: '0.85rem', color: 'var(--accent)', fontWeight: '600' }}>¥{formatMoney(c.amount)}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ flex: 1, height: '8px', background: 'var(--bg2)', borderRadius: '4px', overflow: 'hidden' }}>
                              <div style={{
                                height: '100%',
                                width: `${maxCsAmount > 0 ? (c.amount / maxCsAmount) * 100 : 0}%`,
                                background: 'linear-gradient(90deg, var(--accent), #22d3ee)',
                                borderRadius: '4px',
                                transition: 'width 0.4s',
                              }} />
                            </div>
                            <span style={{ fontSize: '0.75rem', color: 'var(--muted)', minWidth: '40px', textAlign: 'right' }}>{c.order_count}单</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Worker Ranking */}
              <div className="card">
                <h3 style={{ marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '1.1rem' }}>🎮</span> 员工接单 Top 5
                </h3>
                <div className="gradient-line" />
                {workerRanking.length === 0 ? (
                  <p style={{ color: 'var(--muted)', textAlign: 'center', padding: '24px 0' }}>暂无数据</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '8px 0' }}>
                    {workerRanking.map((w, i) => (
                      <div key={w.name} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {rankBadge(i)}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                            <span style={{ fontWeight: '500', fontSize: '0.9rem' }}>{w.name}</span>
                            <span style={{ fontSize: '0.85rem', fontWeight: '600' }}>{w.order_count}单</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ flex: 1, height: '8px', background: 'var(--bg2)', borderRadius: '4px', overflow: 'hidden' }}>
                              <div style={{
                                height: '100%',
                                width: `${maxWorkerCount > 0 ? (w.order_count / maxWorkerCount) * 100 : 0}%`,
                                background: 'linear-gradient(90deg, #a855f7, #c084fc)',
                                borderRadius: '4px',
                                transition: 'width 0.4s',
                              }} />
                            </div>
                            <span style={{ fontSize: '0.75rem', color: 'var(--success)', minWidth: '60px', textAlign: 'right' }}>¥{formatMoney(w.salary)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Type distribution */}
              <div className="card">
                <h3 style={{ marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '1.1rem' }}>📈</span> 订单类型分布
                </h3>
                <div className="gradient-line" />
                {typeDist.length === 0 ? (
                  <p style={{ color: 'var(--muted)', textAlign: 'center', padding: '24px 0' }}>暂无数据</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '8px 0' }}>
                    {typeDist.map((t, i) => (
                      <div key={t.type}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '0.88rem' }}>
                          <span style={{ fontWeight: '500' }}>{t.type}</span>
                          <span>
                            <span style={{ color: 'var(--muted)', marginRight: '8px' }}>{t.count}单</span>
                            <span style={{ color: 'var(--accent)', fontWeight: '600' }}>¥{formatMoney(t.amount)}</span>
                            <span style={{ color: 'var(--muted)', marginLeft: '6px', fontSize: '0.78rem' }}>{t.percent}%</span>
                          </span>
                        </div>
                        <div style={{ height: '10px', background: 'var(--bg2)', borderRadius: '5px', overflow: 'hidden' }}>
                          <div style={{
                            height: '100%',
                            width: `${t.percent}%`,
                            background: [
                              'linear-gradient(90deg, var(--accent), #22d3ee)',
                              'linear-gradient(90deg, #a855f7, #c084fc)',
                              'linear-gradient(90deg, #f59e0b, #fbbf24)',
                              'linear-gradient(90deg, var(--success), #4ade80)',
                              'linear-gradient(90deg, var(--danger), #f87171)',
                            ][i % 5],
                            borderRadius: '5px',
                            transition: 'width 0.4s',
                          }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 7-day trend chart */}
              <div className="card">
                <h3 style={{ marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '1.1rem' }}>📈</span> 近7日订单趋势
                </h3>
                <div className="gradient-line" />
                {trend.length > 0 && (() => {
                  const maxCount = Math.max(...trend.map(d => d.order_count), 1)
                  const maxAmount = Math.max(...trend.map(d => d.total_amount), 1)
                  const total7Count = trend.reduce((s, d) => s + d.order_count, 0)
                  const total7Amount = trend.reduce((s, d) => s + d.total_amount, 0)
                  return (
                    <>
                      <div style={{ display: 'flex', gap: '16px', marginBottom: '14px', fontSize: '0.82rem' }}>
                        <div>7日总单：<b style={{ color: 'var(--accent)' }}>{total7Count}</b></div>
                        <div>7日流水：<b style={{ color: 'var(--accent)' }}>¥{total7Amount.toFixed(2)}</b></div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: '140px', paddingBottom: '22px', position: 'relative', borderBottom: '1px solid var(--rule)' }}>
                        {trend.map(d => {
                          const h = (d.order_count / maxCount) * 100
                          const amountH = (d.total_amount / maxAmount) * 100
                          return (
                            <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', height: '100%', justifyContent: 'flex-end', position: 'relative' }} title={`${d.date}\n订单：${d.order_count}单（已结${d.completed_count}）\n金额：¥${d.total_amount.toFixed(2)}`}>
                              {d.order_count > 0 && (
                                <span style={{ fontSize: '0.65rem', color: 'var(--accent)', lineHeight: 1 }}>{d.order_count}</span>
                              )}
                              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', width: '100%', justifyContent: 'center', height: `${Math.max(h, d.order_count > 0 ? 6 : 0)}%`, minHeight: d.order_count > 0 ? '6px' : '0' }}>
                                <div style={{
                                  flex: 1,
                                  maxWidth: '18px',
                                  background: 'linear-gradient(180deg, var(--accent) 0%, rgba(6,182,212,0.6) 100%)',
                                  borderRadius: '4px 4px 0 0',
                                  height: '100%',
                                  transition: 'height 0.3s',
                                  cursor: 'default',
                                }} />
                                {d.total_amount > 0 && (
                                  <div style={{
                                    flex: 1,
                                    maxWidth: '18px',
                                    background: 'linear-gradient(180deg, #f59e0b 0%, rgba(245,158,11,0.5) 100%)',
                                    borderRadius: '4px 4px 0 0',
                                    height: `${Math.max(amountH, d.total_amount > 0 ? 6 : 0)}%`,
                                    minHeight: d.total_amount > 0 ? '6px' : '0',
                                    transition: 'height 0.3s',
                                    cursor: 'default',
                                  }} />
                                )}
                              </div>
                              <span style={{ fontSize: '0.68rem', color: 'var(--text2)', position: 'absolute', bottom: '-20px', left: '50%', transform: 'translateX(-50%)', whiteSpace: 'nowrap' }}>{d.label}</span>
                            </div>
                          )
                        })}
                      </div>
                      <div style={{ display: 'flex', gap: '14px', justifyContent: 'center', marginTop: '8px', fontSize: '0.72rem', color: 'var(--muted)' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '2px', background: 'var(--accent)' }} />订单数
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '2px', background: '#f59e0b' }} />金额
                        </span>
                      </div>
                    </>
                  )
                })()}
                {trend.length === 0 && (
                  <div style={{ color: 'var(--muted)', fontSize: '0.9rem', padding: '16px 0', textAlign: 'center' }}>暂无数据</div>
                )}
              </div>
            </div>
          </div>

          {/* Order list */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                <span style={{ fontSize: '1.1rem' }}>📋</span> 订单列表
              </h3>
              <button className="btn btn-primary btn-sm" onClick={openCreateModal}>+ 新建订单</button>
            </div>
            <div className="gradient-line" />

            <div style={{ display: 'flex', gap: '4px', marginBottom: '12px', flexWrap: 'wrap', borderBottom: '1px solid var(--rule)' }}>
              {[{ key: '', label: '全部' }, { key: '接单中', label: '接单中' }, { key: '已结单', label: '已结单' }, { key: '存单', label: '存单' }, { key: '退单', label: '退单' }].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => { setOrderStatusFilter(tab.key); setOrderPage(1) }}
                  style={{
                    padding: '8px 16px',
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                    color: orderStatusFilter === tab.key ? 'var(--accent)' : 'var(--text2)',
                    fontWeight: orderStatusFilter === tab.key ? '600' : '400',
                    borderBottom: orderStatusFilter === tab.key ? '2px solid var(--accent)' : '2px solid transparent',
                    marginBottom: '-1px',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {ordersError && <div className="error-text" style={{ marginBottom: '8px' }}>{ordersError}</div>}
            {ordersLoading && <div style={{ color: 'var(--muted)', fontSize: '0.9rem', padding: '16px 0' }}>加载中...</div>}

            {!ordersLoading && (
              <div className="table-wrap">
                <table>
                  <thead>
                  <tr>
                    <th>时间</th>
                    <th>流水号</th>
                    <th>客服</th>
                    <th>单子类型</th>
                    <th>客户</th>
                    <th>员工1</th>
                    <th>员工2</th>
                    <th>金额</th>
                    <th>备注</th>
                    <th>状态</th>
                    <th>操作</th>
                  </tr>
                </thead>
                  <tbody>
                    {orders.length === 0 ? (
                      <tr><td colSpan="11" style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px' }}>暂无订单</td></tr>
                    ) : orders.map(o => {
                      const w = o.workers || []
                      return (
                        <tr key={o.id}>
                          <td style={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}>{formatDate(o.created_at)}</td>
                          <td style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--accent)' }}>{o.serial_no || '-'}</td>
                          <td>{o.cs_name}</td>
                          <td>{o.order_type || '-'}</td>
                          <td>{o.customer_name || '-'}</td>
                          <td>{w[0] ? `${w[0].worker_name} (${(w[0].deduction_rate * 100).toFixed(0)}%)` : '-'}</td>
                          <td>{w[1] ? `${w[1].worker_name} (${(w[1].deduction_rate * 100).toFixed(0)}%)` : '-'}</td>
                          <td style={{ color: 'var(--accent)', fontWeight: '600' }}>¥{formatMoney(o.price)}</td>
                          <td style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.remark || '-'}</td>
                          <td>
                            <select
                              value={o.status}
                              onChange={(e) => handleStatusChange(o.id, e.target.value)}
                              style={{
                                borderRadius: '20px',
                                padding: '4px 28px 4px 12px',
                                fontSize: '0.8rem',
                                fontWeight: '600',
                                cursor: 'pointer',
                                outline: 'none',
                                appearance: 'none',
                                WebkitAppearance: 'none',
                                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23666'/%3E%3C/svg%3E")`,
                                backgroundRepeat: 'no-repeat',
                                backgroundPosition: 'right 8px center',
                                ...getOrderStatusStyle(o.status),
                              }}
                            >
                              {VALID_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <button className="btn btn-outline btn-sm" disabled={o.status === '已结单'} onClick={() => openEditModal(o)}>编辑</button>
                              <button className="btn btn-danger btn-sm" disabled={o.status === '已结单'} onClick={() => handleDeleteOrder(o.id)}>删除</button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {orderTotalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginTop: '16px' }}>
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => setOrderPage(p => Math.max(1, p - 1))}
                  disabled={orderPage <= 1}
                >上一页</button>
                <span style={{ fontSize: '0.88rem', color: 'var(--text2)' }}>第 {orderPage} / {orderTotalPages} 页</span>
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => setOrderPage(p => Math.min(orderTotalPages, p + 1))}
                  disabled={orderPage >= orderTotalPages}
                >下一页</button>
              </div>
            )}
          </div>

          {editingOrder && (
            <div style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
            }} onClick={closeEditModal}>
              <div
                style={{
                  background: 'var(--bg2)', border: '1px solid var(--rule)', borderRadius: '8px',
                  padding: '24px', width: '500px', maxWidth: '90vw', maxHeight: '85vh', overflowY: 'auto',
                }}
                onClick={e => e.stopPropagation()}
              >
                <h3 style={{ marginBottom: '16px' }}>编辑订单 #{editingOrder.id}</h3>
                <form onSubmit={handleEditSubmit}>
                  <div className="form-group">
                    <label>单子类型</label>
                    <input
                      type="text" value={editForm.order_type || ''}
                      onChange={e => setEditForm({ ...editForm, order_type: e.target.value })}
                      placeholder="请输入单子类型"
                    />
                  </div>
                  <div className="form-group">
                    <label>客户名称</label>
                    <input
                      type="text" value={editForm.customer_name}
                      onChange={e => setEditForm({ ...editForm, customer_name: e.target.value })}
                      placeholder="请输入客户名称"
                    />
                  </div>
                  <div className="form-group">
                    <label>单子价格 (元)</label>
                    <input
                      type="number" value={editForm.price}
                      onChange={e => setEditForm({ ...editForm, price: e.target.value })}
                      min="0" step="0.01" placeholder="请输入价格"
                    />
                  </div>
                  <div className="form-group">
                    <label>备注</label>
                    <textarea
                      value={editForm.remark}
                      onChange={e => setEditForm({ ...editForm, remark: e.target.value })}
                      placeholder="备注信息" rows="2"
                    />
                  </div>
                  <div className="form-group">
                    <label>关联员工 ({editForm.workers.length}/2)</label>
                    {editForm.workers.map((worker, index) => (
                      <div key={index} style={{ display: 'flex', gap: '8px', marginBottom: '6px', alignItems: 'center' }}>
                        <div style={{ flex: 1 }}>
                          {renderSearchableSelect(worker.name, (v) => updateEditWorker(index, v), activeWorkers, '请选择员工', `edit-${index}`)}
                        </div>
                        {editForm.workers.length > 1 && (
                          <button type="button" className="btn btn-outline btn-sm" onClick={() => removeEditWorker(index)}>移除</button>
                        )}
                      </div>
                    ))}
                    {editForm.workers.length < 2 && (
                      <button type="button" className="btn btn-outline btn-sm" onClick={addEditWorker} style={{ marginTop: '4px' }}>+ 添加员工</button>
                    )}
                  </div>
                  {editError && <div className="error-text" style={{ marginBottom: '12px' }}>{editError}</div>}
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button type="button" className="btn btn-outline btn-sm" onClick={closeEditModal}>取消</button>
                    <button type="submit" className="btn btn-primary btn-sm" disabled={editSubmitting}>
                      {editSubmitting ? '保存中...' : '保存'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {createModal && (
            <div style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
            }} onClick={closeCreateModal}>
              <div
                style={{
                  background: 'var(--bg2)', border: '1px solid var(--rule)', borderRadius: '8px',
                  padding: '24px', width: '500px', maxWidth: '90vw', maxHeight: '85vh', overflowY: 'auto',
                }}
                onClick={e => e.stopPropagation()}
              >
                <h3 style={{ marginBottom: '16px' }}>新建订单</h3>
                <form onSubmit={handleCreateSubmit}>
                  <div className="form-group">
                    <label>归属客服 <span style={{ color: 'var(--danger)' }}>*</span></label>
                    <select
                      value={createForm.cs_name}
                      onChange={e => setCreateForm({ ...createForm, cs_name: e.target.value })}
                      style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--rule)', borderRadius: '4px', background: 'var(--bg)', color: 'var(--ink)', fontSize: '0.9rem', boxSizing: 'border-box' }}
                    >
                      <option value="">请选择客服</option>
                      {csList.map(c => (
                        <option key={c.name} value={c.name}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div className="form-group">
                      <label>单子类型 <span style={{ color: 'var(--danger)' }}>*</span></label>
                      <input
                        type="text" value={createForm.order_type}
                        onChange={e => setCreateForm({ ...createForm, order_type: e.target.value })}
                        placeholder="如：陪玩、上分"
                      />
                    </div>
                    <div className="form-group">
                      <label>单子价格 (元) <span style={{ color: 'var(--danger)' }}>*</span></label>
                      <input
                        type="number" value={createForm.price}
                        onChange={e => setCreateForm({ ...createForm, price: e.target.value })}
                        min="0" step="0.01" placeholder="请输入价格"
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>客户名称</label>
                    <input
                      type="text" value={createForm.customer_name}
                      onChange={e => setCreateForm({ ...createForm, customer_name: e.target.value })}
                      placeholder="请输入客户名称"
                    />
                  </div>
                  <div className="form-group">
                    <label>备注</label>
                    <textarea
                      value={createForm.remark}
                      onChange={e => setCreateForm({ ...createForm, remark: e.target.value })}
                      placeholder="备注信息" rows="2"
                    />
                  </div>
                  <div className="form-group">
                    <label>关联员工 ({createForm.workers.length}/2) <span style={{ color: 'var(--danger)' }}>*</span></label>
                    {createForm.workers.map((worker, index) => (
                      <div key={index} style={{ display: 'flex', gap: '8px', marginBottom: '6px', alignItems: 'center' }}>
                        <div style={{ flex: 1 }}>
                          {renderSearchableSelect(worker.name, (v) => updateCreateWorker(index, v), activeWorkers, '请选择员工', `create-${index}`)}
                        </div>
                        {createForm.workers.length > 1 && (
                          <button type="button" className="btn btn-outline btn-sm" onClick={() => removeCreateWorker(index)}>移除</button>
                        )}
                      </div>
                    ))}
                    {createForm.workers.length < 2 && (
                      <button type="button" className="btn btn-outline btn-sm" onClick={addCreateWorker} style={{ marginTop: '4px' }}>+ 添加员工</button>
                    )}
                  </div>
                  {createError && <div className="error-text" style={{ marginBottom: '12px' }}>{createError}</div>}
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button type="button" className="btn btn-outline btn-sm" onClick={closeCreateModal}>取消</button>
                    <button type="submit" className="btn btn-primary btn-sm" disabled={createSubmitting}>
                      {createSubmitting ? '创建中...' : '创建订单'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </>
      )}

      {!loading && !error && !data && (
        <div className="card" style={{ textAlign: 'center', padding: '48px' }}>
          <p style={{ color: 'var(--muted)', fontSize: '1.1rem' }}>暂无数据</p>
        </div>
      )}
    </div>
  )
}

function PersonnelTab() {
  const [csList, setCsList] = useState([])
  const [workerList, setWorkerList] = useState([])
  const [csName, setCsName] = useState('')
  const [csRate, setCsRate] = useState('2')
  const [csUsername, setCsUsername] = useState('')
  const [csPassword, setCsPassword] = useState('')
  const [workerName, setWorkerName] = useState('')
  const [workerRate, setWorkerRate] = useState('20')
  const [workerRating, setWorkerRating] = useState('')
  const [workerStatus, setWorkerStatus] = useState('在店')
  const [workerDepositTarget, setWorkerDepositTarget] = useState('0')
  const [csError, setCsError] = useState('')
  const [workerError, setWorkerError] = useState('')
  const [csLoading, setCsLoading] = useState(false)
  const [workerLoading, setWorkerLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [pwdModal, setPwdModal] = useState(null)
  const [pwdForm, setPwdForm] = useState({ username: '', password: '' })
  const [pwdError, setPwdError] = useState('')
  const [pwdSaving, setPwdSaving] = useState(false)

  const [searchWorkerName, setSearchWorkerName] = useState('')
  const [searchWorkerRating, setSearchWorkerRating] = useState('')
  const [csPage, setCsPage] = useState(1)
  const [workerPage, setWorkerPage] = useState(1)
  const pageSize = DEFAULT_PAGE_SIZE

  const [editingRow, setEditingRow] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [editError, setEditError] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  const loadData = useCallback(async () => {
    setLoadError('')
    try {
      const [csRes, workerRes] = await Promise.all([
        api.get('/config/cs'),
        api.get('/config/workers'),
      ])
      setCsList(csRes.data || [])
      setWorkerList(workerRes.data || [])
    } catch (err) {
      setLoadError(err.message)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleAddCs = async (e) => {
    e.preventDefault()
    const trimmed = csName.trim()
    const ratePercent = parseFloat(csRate)
    const rate = ratePercent / 100
    if (!trimmed) {
      setCsError('请输入客服名称')
      return
    }
    if (isNaN(ratePercent) || ratePercent < 0 || ratePercent > 100) {
      setCsError('提成比例必须在0-100之间')
      return
    }
    setCsError('')
    setCsLoading(true)
    try {
      await api.post('/config/cs', {
        name: trimmed,
        commission_rate: rate,
        username: csUsername.trim() || undefined,
        password: csPassword || undefined,
      })
      setCsName('')
      setCsRate('2')
      setCsUsername('')
      setCsPassword('')
      await loadData()
    } catch (err) {
      setCsError(err.message)
    } finally {
      setCsLoading(false)
    }
  }

  const handleDeleteCs = async (id) => {
    const confirmed = await confirm('确定要删除该客服吗？')
    if (!confirmed) return
    try {
      await api.del('/config/cs/' + id)
      toast('客服已删除', 'success')
      await loadData()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  const openPwdModal = (cs) => {
    setPwdModal(cs)
    setPwdForm({ username: cs.username || '', password: '' })
    setPwdError('')
  }

  const closePwdModal = () => {
    setPwdModal(null)
    setPwdForm({ username: '', password: '' })
    setPwdError('')
  }

  const savePwd = async () => {
    if (!pwdModal) return
    setPwdError('')
    setPwdSaving(true)
    try {
      await api.put(`/config/cs/${pwdModal.id}/password`, {
        username: pwdForm.username.trim() || '',
        password: pwdForm.password || '',
      })
      closePwdModal()
      await loadData()
    } catch (err) {
      setPwdError(err.message)
    } finally {
      setPwdSaving(false)
    }
  }

  const handleToggleCsActive = async (cs) => {
    try {
      await api.put(`/config/cs/${cs.id}/toggle`, { active: !cs.active })
      await loadData()
    } catch (err) {
      setCsError(err.message)
    }
  }

  const handleAddWorker = async (e) => {
    e.preventDefault()
    const trimmed = workerName.trim()
    const ratePercent = parseFloat(workerRate)
    const rate = ratePercent / 100
    if (!trimmed) {
      setWorkerError('请输入员工名称')
      return
    }
    if (isNaN(ratePercent) || ratePercent < 0 || ratePercent > 100) {
      setWorkerError('抽成比例必须在0-100之间')
      return
    }
    setWorkerError('')
    setWorkerLoading(true)
    try {
      await api.post('/config/workers', { name: trimmed, default_deduction_rate: rate, rating: workerRating, status: workerStatus, deposit_target: parseFloat(workerDepositTarget) || 0 })
      setWorkerName('')
      setWorkerRate('20')
      setWorkerRating('')
      setWorkerStatus('在店')
      setWorkerDepositTarget('0')
      await loadData()
    } catch (err) {
      setWorkerError(err.message)
    } finally {
      setWorkerLoading(false)
    }
  }

  const handleDeleteWorker = async (id) => {
    const confirmed = await confirm('确定要删除该员工吗？')
    if (!confirmed) return
    try {
      await api.del('/config/workers/' + id)
      toast('员工已删除', 'success')
      await loadData()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  const startEditCs = (cs) => {
    setEditingRow({ type: 'cs', id: cs.id })
    setEditForm({
      name: cs.name,
      commission_rate_percent: ((cs.commission_rate != null ? cs.commission_rate : 0.02) * 100).toFixed(2),
    })
    setEditError('')
  }

  const startEditWorker = (w) => {
    setEditingRow({ type: 'worker', id: w.id })
    setEditForm({
      name: w.name,
      default_deduction_rate_percent: ((w.default_deduction_rate != null ? w.default_deduction_rate : 0.20) * 100).toFixed(2),
      rating: w.rating || '',
      status: w.status || '在店',
      deposit_target: w.deposit_target != null ? String(w.deposit_target) : '0',
    })
    setEditError('')
  }

  const cancelEdit = () => {
    setEditingRow(null)
    setEditForm({})
    setEditError('')
  }

  const saveEdit = async () => {
    if (!editingRow) return
    setEditError('')
    setEditSaving(true)
    try {
      if (editingRow.type === 'cs') {
        const trimmed = String(editForm.name || '').trim()
        if (!trimmed) {
          setEditError('客服名称不能为空')
          setEditSaving(false)
          return
        }
        const ratePercent = parseFloat(editForm.commission_rate_percent)
        if (isNaN(ratePercent) || ratePercent < 0 || ratePercent > 100) {
          setEditError('提成比例必须在0-100之间')
          setEditSaving(false)
          return
        }
        await api.put('/config/cs/' + editingRow.id, {
          name: trimmed,
          commission_rate: ratePercent / 100,
        })
      } else {
        const trimmed = String(editForm.name || '').trim()
        if (!trimmed) {
          setEditError('员工名称不能为空')
          setEditSaving(false)
          return
        }
        const ratePercent = parseFloat(editForm.default_deduction_rate_percent)
        if (isNaN(ratePercent) || ratePercent < 0 || ratePercent > 100) {
          setEditError('抽成比例必须在0-100之间')
          setEditSaving(false)
          return
        }
        const validStatus = ['在店', '退店', '开除']
        if (!validStatus.includes(editForm.status)) {
          setEditError('状态无效')
          setEditSaving(false)
          return
        }
        const targetAmt = parseFloat(editForm.deposit_target)
        if (isNaN(targetAmt) || targetAmt < 0) {
          setEditError('押金目标不能为负数')
          setEditSaving(false)
          return
        }
        await api.put('/config/workers/' + editingRow.id, {
          name: trimmed,
          default_deduction_rate: ratePercent / 100,
          rating: editForm.rating || '',
          status: editForm.status,
          deposit_target: targetAmt,
        })
      }
      cancelEdit()
      await loadData()
    } catch (err) {
      setEditError(err.message)
    } finally {
      setEditSaving(false)
    }
  }

  return (
    <div>
      {loadError && (
        <div className="error-text" style={{ marginBottom: '16px' }}>{loadError}</div>
      )}

      <div className="card" style={{ marginBottom: '24px' }}>
        <h3 style={{ marginBottom: '4px' }}>客服名单</h3>
        <div className="gradient-line" />

        <form onSubmit={handleAddCs} style={{ marginBottom: '16px' }}>
          <div className="form-row" style={{ alignItems: 'end' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>客服名称</label>
              <input
                type="text"
                value={csName}
                onChange={(e) => setCsName(e.target.value)}
                placeholder="请输入客服名称"
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>提成比例(%)</label>
              <input
                type="number"
                value={csRate}
                onChange={(e) => setCsRate(e.target.value)}
                min="0"
                max="100"
                step="0.01"
                placeholder="2"
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>登录账号</label>
              <input
                type="text"
                value={csUsername}
                onChange={(e) => setCsUsername(e.target.value)}
                placeholder="选填"
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>登录密码</label>
              <input
                type="text"
                value={csPassword}
                onChange={(e) => setCsPassword(e.target.value)}
                placeholder="选填"
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <button type="submit" className="btn btn-primary" disabled={csLoading}>
                {csLoading ? '添加中...' : '添加客服'}
              </button>
            </div>
          </div>
          {csError && <div className="error-text">{csError}</div>}
        </form>

        {csList.length > 0 ? (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>名称</th>
                    <th>提成比例(%)</th>
                    <th>登录账号</th>
                    <th>状态</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {csList.slice((csPage - 1) * pageSize, csPage * pageSize).map(c => {
                  const isEditing = editingRow && editingRow.type === 'cs' && editingRow.id === c.id
                  if (isEditing) {
                    return (
                      <tr key={c.id} style={{ background: 'rgba(0, 229, 255, 0.05)' }}>
                        <td>
                          <input
                            type="text"
                            value={editForm.name || ''}
                            onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                            placeholder="客服名称"
                            style={{ width: '140px' }}
                          />
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <input
                              type="number"
                              value={editForm.commission_rate_percent || ''}
                              onChange={(e) => setEditForm(prev => ({ ...prev, commission_rate_percent: e.target.value }))}
                              min="0"
                              max="100"
                              step="0.01"
                              style={{ width: '90px' }}
                            />
                            <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>%</span>
                          </div>
                        </td>
                        <td style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>-</td>
                        <td>-</td>
                        <td>
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                            <button
                              className="btn btn-success btn-sm"
                              onClick={saveEdit}
                              disabled={editSaving}
                            >
                              {editSaving ? '保存中...' : '保存'}
                            </button>
                            <button
                              className="btn btn-outline btn-sm"
                              onClick={cancelEdit}
                              disabled={editSaving}
                            >
                              取消
                            </button>
                            {editError && (
                              <span className="error-text" style={{ fontSize: '0.8rem' }}>
                                {editError}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  }
                  return (
                    <tr key={c.id}>
                      <td>{c.name}</td>
                      <td>{((c.commission_rate != null ? c.commission_rate : 0.02) * 100).toFixed(2)}%</td>
                      <td style={{ fontSize: '0.85rem' }}>
                        {c.username ? (
                          <span style={{ color: 'var(--success)' }}>{c.username}</span>
                        ) : (
                          <span style={{ color: 'var(--muted)' }}>未设置</span>
                        )}
                      </td>
                      <td>
                        <span style={{
                          display: 'inline-block',
                          padding: '2px 10px',
                          borderRadius: '10px',
                          fontSize: '0.75rem',
                          background: c.active ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                          color: c.active ? 'var(--success)' : 'var(--danger)',
                        }}>
                          {c.active ? '启用' : '禁用'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          <button
                            className="btn btn-outline btn-sm"
                            onClick={() => startEditCs(c)}
                          >
                            编辑
                          </button>
                          <button
                            className="btn btn-outline btn-sm"
                            onClick={() => openPwdModal(c)}
                          >
                            账号
                          </button>
                          <button
                            className={`btn btn-sm ${c.active ? 'btn-danger' : 'btn-success'}`}
                            onClick={() => handleToggleCsActive(c)}
                          >
                            {c.active ? '禁用' : '启用'}
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => handleDeleteCs(c.id)}
                          >
                            删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {csList.length > pageSize && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '16px', alignItems: 'center' }}>
              <button
                className="btn btn-outline btn-sm"
                disabled={csPage <= 1}
                onClick={() => setCsPage(p => Math.max(1, p - 1))}
              >
                上一页
              </button>
              <span style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
                第 {csPage} / {Math.ceil(csList.length / pageSize)} 页，共 {csList.length} 条
              </span>
              <button
                className="btn btn-outline btn-sm"
                disabled={csPage >= Math.ceil(csList.length / pageSize)}
                onClick={() => setCsPage(p => Math.min(Math.ceil(csList.length / pageSize), p + 1))}
              >
                下一页
              </button>
            </div>
          )}
          </>
        ) : (
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem', padding: '24px 0', textAlign: 'center' }}>
            暂无客服数据
          </p>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginBottom: '4px' }}>员工名单</h3>
        <div className="gradient-line" />

        <form onSubmit={handleAddWorker} style={{ marginBottom: '16px' }}>
          <div className="form-row" style={{ alignItems: 'end' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>员工名称</label>
              <input
                type="text"
                value={workerName}
                onChange={(e) => setWorkerName(e.target.value)}
                placeholder="请输入员工名称"
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>抽成比例(%)</label>
              <input
                type="number"
                value={workerRate}
                onChange={(e) => setWorkerRate(e.target.value)}
                min="0"
                max="100"
                step="0.01"
                placeholder="20"
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>押金目标(元)</label>
              <input
                type="number"
                value={workerDepositTarget}
                onChange={(e) => setWorkerDepositTarget(e.target.value)}
                min="0"
                step="0.01"
                placeholder="0"
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>评级</label>
              <select value={workerRating} onChange={(e) => setWorkerRating(e.target.value)}>
                <option value="">请选择评级</option>
                <option value="娱乐">娱乐</option>
                <option value="技术">技术</option>
                <option value="大师">大师</option>
                <option value="宗师">宗师</option>
                <option value="明星">明星</option>
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>状态</label>
              <select value={workerStatus} onChange={(e) => setWorkerStatus(e.target.value)}>
                <option value="在店">在店</option>
                <option value="退店">退店</option>
                <option value="开除">开除</option>
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <button type="submit" className="btn btn-primary" disabled={workerLoading}>
                {workerLoading ? '添加中...' : '添加员工'}
              </button>
            </div>
          </div>
          {workerError && <div className="error-text">{workerError}</div>}
        </form>

        <div style={{ marginBottom: '16px', display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div className="form-group" style={{ marginBottom: 0, flex: 1, maxWidth: '200px' }}>
            <label>搜索名称</label>
            <input
              type="text"
              value={searchWorkerName}
              onChange={(e) => setSearchWorkerName(e.target.value)}
              placeholder="输入员工名称搜索..."
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>搜索评级</label>
            <select value={searchWorkerRating} onChange={(e) => setSearchWorkerRating(e.target.value)}>
              <option value="">全部评级</option>
              <option value="娱乐">娱乐</option>
              <option value="技术">技术</option>
              <option value="大师">大师</option>
              <option value="宗师">宗师</option>
              <option value="明星">明星</option>
            </select>
          </div>
        </div>

        {workerList.filter(w => {
                  const matchName = !searchWorkerName || w.name.toLowerCase().includes(searchWorkerName.toLowerCase())
                  const matchRating = !searchWorkerRating || w.rating === searchWorkerRating
                  return matchName && matchRating
                }).length > 0 ? (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>名称</th>
                    <th>抽成比例(%)</th>
                    <th>押金进度</th>
                    <th>评级</th>
                    <th>状态</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {workerList.filter(w => {
                    const matchName = !searchWorkerName || w.name.toLowerCase().includes(searchWorkerName.toLowerCase())
                    const matchRating = !searchWorkerRating || w.rating === searchWorkerRating
                    return matchName && matchRating
                  }).slice((workerPage - 1) * pageSize, workerPage * pageSize).map(w => {
                  const isEditing = editingRow && editingRow.type === 'worker' && editingRow.id === w.id
                  if (isEditing) {
                    return (
                      <tr key={w.id} style={{ background: 'rgba(0, 229, 255, 0.05)' }}>
                        <td>
                          <input
                            type="text"
                            value={editForm.name || ''}
                            onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                            placeholder="员工名称"
                            style={{ width: '120px' }}
                          />
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <input
                              type="number"
                              value={editForm.default_deduction_rate_percent || ''}
                              onChange={(e) => setEditForm(prev => ({ ...prev, default_deduction_rate_percent: e.target.value }))}
                              min="0"
                              max="100"
                              step="0.01"
                              style={{ width: '80px' }}
                            />
                            <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>%</span>
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <label style={{ fontSize: '0.85rem', whiteSpace: 'nowrap' }}>押金目标(元)</label>
                            <input
                              type="number"
                              value={editForm.deposit_target || '0'}
                              onChange={(e) => setEditForm(prev => ({ ...prev, deposit_target: e.target.value }))}
                              min="0"
                              step="0.01"
                              style={{ width: '80px' }}
                            />
                          </div>
                        </td>
                        <td>
                          <select
                            value={editForm.rating || ''}
                            onChange={(e) => setEditForm(prev => ({ ...prev, rating: e.target.value }))}
                            style={{ width: '100px' }}
                          >
                            <option value="">请选择</option>
                            <option value="娱乐">娱乐</option>
                            <option value="技术">技术</option>
                            <option value="大师">大师</option>
                            <option value="宗师">宗师</option>
                            <option value="明星">明星</option>
                          </select>
                        </td>
                        <td>
                          <select
                            value={editForm.status || '在店'}
                            onChange={(e) => setEditForm(prev => ({ ...prev, status: e.target.value }))}
                          >
                            <option value="在店">在店</option>
                            <option value="退店">退店</option>
                            <option value="开除">开除</option>
                          </select>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                            <button
                              className="btn btn-success btn-sm"
                              onClick={saveEdit}
                              disabled={editSaving}
                            >
                              {editSaving ? '保存中...' : '保存'}
                            </button>
                            <button
                              className="btn btn-outline btn-sm"
                              onClick={cancelEdit}
                              disabled={editSaving}
                            >
                              取消
                            </button>
                            {editError && (
                              <span className="error-text" style={{ fontSize: '0.8rem' }}>
                                {editError}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  }
                  return (
                    <tr key={w.id}>
                      <td>{w.name}</td>
                      <td>
                        {(w.default_deduction_rate != null
                          ? (w.default_deduction_rate * 100).toFixed(2)
                          : '20.00') + '%'}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '0.85rem', color: 'var(--danger)' }}>¥{formatMoney(w.deposit)}</span>
                          {w.deposit_target > 0 && (
                            <>
                              <span style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>/</span>
                              <span style={{ fontSize: '0.85rem' }}>¥{formatMoney(w.deposit_target)}</span>
                              <div style={{ width: '60px', height: '6px', background: 'var(--bg2)', borderRadius: '3px', overflow: 'hidden' }}>
                                <div style={{
                                  height: '100%',
                                  width: `${Math.min(100, (w.deposit / w.deposit_target) * 100)}%`,
                                  background: w.deposit >= w.deposit_target ? 'var(--success)' : 'var(--accent)',
                                  borderRadius: '3px',
                                  transition: 'width 0.3s'
                                }} />
                              </div>
                            </>
                          )}
                          {(!w.deposit_target || w.deposit_target === 0) && <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>未设置</span>}
                        </div>
                      </td>
                      <td>{w.rating || '-'}</td>
                      <td>
                        <span className={`badge ${w.status === '在店' ? 'badge-接单中' : w.status === '退店' ? 'badge-退单' : 'badge-开除'}`}>
                          {w.status || '在店'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            className="btn btn-outline btn-sm"
                            onClick={() => startEditWorker(w)}
                          >
                            编辑
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => handleDeleteWorker(w.id)}
                          >
                            删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {workerList.filter(w => {
            const matchName = !searchWorkerName || w.name.toLowerCase().includes(searchWorkerName.toLowerCase())
            const matchRating = !searchWorkerRating || w.rating === searchWorkerRating
            return matchName && matchRating
          }).length > pageSize && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '16px', alignItems: 'center' }}>
              <button
                className="btn btn-outline btn-sm"
                disabled={workerPage <= 1}
                onClick={() => setWorkerPage(p => Math.max(1, p - 1))}
              >
                上一页
              </button>
              <span style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
                第 {workerPage} / {Math.ceil(workerList.filter(w => {
                  const matchName = !searchWorkerName || w.name.toLowerCase().includes(searchWorkerName.toLowerCase())
                  const matchRating = !searchWorkerRating || w.rating === searchWorkerRating
                  return matchName && matchRating
                }).length / pageSize)} 页，共 {workerList.filter(w => {
                  const matchName = !searchWorkerName || w.name.toLowerCase().includes(searchWorkerName.toLowerCase())
                  const matchRating = !searchWorkerRating || w.rating === searchWorkerRating
                  return matchName && matchRating
                }).length} 条
              </span>
              <button
                className="btn btn-outline btn-sm"
                disabled={workerPage >= Math.ceil(workerList.filter(w => {
                  const matchName = !searchWorkerName || w.name.toLowerCase().includes(searchWorkerName.toLowerCase())
                  const matchRating = !searchWorkerRating || w.rating === searchWorkerRating
                  return matchName && matchRating
                }).length / pageSize)}
                onClick={() => setWorkerPage(p => Math.min(Math.ceil(workerList.filter(w => {
                  const matchName = !searchWorkerName || w.name.toLowerCase().includes(searchWorkerName.toLowerCase())
                  const matchRating = !searchWorkerRating || w.rating === searchWorkerRating
                  return matchName && matchRating
                }).length / pageSize), p + 1))}
              >
                下一页
              </button>
            </div>
          )}
          </>
        ) : (
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem', padding: '24px 0', textAlign: 'center' }}>
            暂无员工数据
          </p>
        )}
      </div>
      {pwdModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }} onClick={closePwdModal}>
          <div
            style={{
              background: 'var(--bg2)',
              border: '1px solid var(--rule)',
              borderRadius: '8px',
              padding: '24px',
              width: '400px',
              maxWidth: '90vw',
            }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ marginBottom: '16px' }}>设置账号密码 - {pwdModal.name}</h3>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.85rem' }}>登录账号</label>
              <input
                type="text"
                value={pwdForm.username}
                onChange={e => setPwdForm(prev => ({ ...prev, username: e.target.value }))}
                placeholder="留空则禁用登录"
                style={{ width: '100%', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.85rem' }}>登录密码</label>
              <input
                type="text"
                value={pwdForm.password}
                onChange={e => setPwdForm(prev => ({ ...prev, password: e.target.value }))}
                placeholder="留空则不修改密码"
                style={{ width: '100%', boxSizing: 'border-box' }}
              />
            </div>
            {pwdError && <div className="error-text" style={{ marginBottom: '12px' }}>{pwdError}</div>}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button className="btn btn-outline btn-sm" onClick={closePwdModal}>取消</button>
              <button className="btn btn-primary btn-sm" onClick={savePwd} disabled={pwdSaving}>
                {pwdSaving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SettlementTab() {
  const [workerList, setWorkerList] = useState([])
  const [csList, setCsList] = useState([])
  const [settleStats, setSettleStats] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [settleAmounts, setSettleAmounts] = useState({})
  const [settleErrors, setSettleErrors] = useState({})
  const [settleLoading, setSettleLoading] = useState({})
  const [refundLoading, setRefundLoading] = useState({})
  const [reverseLoading, setReverseLoading] = useState({})
  const [historyPerson, setHistoryPerson] = useState(null)
  const [historyData, setHistoryData] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [workerPage, setWorkerPage] = useState(1)
  const [csPage, setCsPage] = useState(1)
  const [workerSearch, setWorkerSearch] = useState('')
  const [csSearch, setCsSearch] = useState('')
  const [editingCell, setEditingCell] = useState(null) // { personName, personType, field, recordId }
  const [editValue, setEditValue] = useState('')
  const pageSize = DEFAULT_PAGE_SIZE

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [workerRes, csRes, statsRes] = await Promise.all([
        api.get('/workers/list'),
        api.get('/cs/list'),
        api.get('/stats/settlement-stats'),
      ])
      setWorkerList(workerRes.data || [])
      setCsList(csRes.data || [])
      setSettleStats(statsRes.data || null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleSettle = async (personName, personType) => {
    const key = personType + '_' + personName
    const amount = parseFloat(settleAmounts[key] || '')
    if (isNaN(amount) || amount <= 0) {
      setSettleErrors(prev => ({ ...prev, [key]: '请输入有效金额' }))
      return
    }
    const person = (personType === 'worker' ? workerList : csList)
      .find(p => p.name === personName)
    if (!person) return
    if (amount > (person.unsettled || 0)) {
      setSettleErrors(prev => ({ ...prev, [key]: '结算金额不能超过未结算金额' }))
      return
    }

    setSettleErrors(prev => ({ ...prev, [key]: '' }))
    setSettleLoading(prev => ({ ...prev, [key]: true }))
    try {
      await api.post('/settlement', {
        person_name: personName,
        person_type: personType,
        settled_amount: amount,
      })
      setSettleAmounts(prev => ({ ...prev, [key]: '' }))
      await loadData()
    } catch (err) {
      setSettleErrors(prev => ({ ...prev, [key]: err.message }))
    } finally {
      setSettleLoading(prev => ({ ...prev, [key]: false }))
    }
  }

  const handleDepositRefund = async (workerName) => {
    const worker = workerList.find(w => w.name === workerName)
    if (!worker) return
    const confirmed = await confirm(`确定将员工【${workerName}】押金 ¥${worker.deposit.toFixed(2)} 全额退还？退还后将转入待结算工资。`)
    if (!confirmed) return
    setRefundLoading(prev => ({ ...prev, [workerName]: true }))
    try {
      await api.post('/settlement/deposit', { worker_name: workerName })
      toast('押金已退还', 'success')
      await loadData()
      if (historyPerson && historyPerson.name === workerName && historyPerson.type === 'worker') {
        await showHistory(workerName, 'worker')
      }
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setRefundLoading(prev => ({ ...prev, [workerName]: false }))
    }
  }

  const handleReverseSettlement = async (recordId) => {
    const confirmed = await confirm('确定撤销该结算记录？撤销后将恢复未结算金额。')
    if (!confirmed) return
    setReverseLoading(prev => ({ ...prev, [recordId]: true }))
    try {
      await api.post(`/settlement/reverse/${recordId}`)
      toast('结算已撤销', 'success')
      await loadData()
      if (historyPerson) {
        await showHistory(historyPerson.name, historyPerson.type)
      }
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setReverseLoading(prev => ({ ...prev, [recordId]: false }))
    }
  }

  const showHistory = async (personName, personType) => {
    setHistoryPerson({ name: personName, type: personType })
    setHistoryLoading(true)
    try {
      const res = await api.get(
        '/settlement/history?person_name=' +
        encodeURIComponent(personName) +
        '&person_type=' +
        personType
      )
      setHistoryData(res.data || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setHistoryLoading(false)
    }
  }

  const closeHistory = () => {
    setHistoryPerson(null)
    setHistoryData([])
  }

  if (loading) {
    return (
      <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
        加载中...
      </div>
    )
  }

  if (error) {
    return (
      <div className="error-text">{error}</div>
    )
  }

  return (
    <div>
      {/* Settlement stats */}
      {settleStats && (
        <div className="stats-grid" style={{ marginBottom: '20px' }}>
          <div className="stat-card" style={{ borderLeft: '3px solid var(--warning)' }}>
            <div className="stat-label">员工待结算总额</div>
            <div className="stat-value" style={{ color: 'var(--warning)', fontSize: '1.4rem' }}>¥{formatMoney(settleStats.worker_unsettled)}</div>
          </div>
          <div className="stat-card" style={{ borderLeft: '3px solid var(--accent)' }}>
            <div className="stat-label">客服待结算总额</div>
            <div className="stat-value" style={{ color: 'var(--accent)', fontSize: '1.4rem' }}>¥{formatMoney(settleStats.cs_unsettled)}</div>
          </div>
          <div className="stat-card" style={{ borderLeft: '3px solid var(--danger)' }}>
            <div className="stat-label">押金池总额</div>
            <div className="stat-value" style={{ color: 'var(--danger)', fontSize: '1.4rem' }}>¥{formatMoney(settleStats.total_deposit)}</div>
          </div>
          <div className="stat-card" style={{ borderLeft: '3px solid var(--success)' }}>
            <div className="stat-label">本月已发放</div>
            <div className="stat-value" style={{ color: 'var(--success)', fontSize: '1.4rem' }}>¥{formatMoney(settleStats.month_settled)}</div>
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: '24px' }}>
        <h3 style={{ marginBottom: '4px' }}>员工工资结算</h3>
        <div className="gradient-line" />

        {workerList.length > 0 ? (
          <>
            <div style={{ marginBottom: '12px', display: 'flex', gap: '8px', alignItems: 'center' }}>
              <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                <span style={{ position: 'absolute', left: '10px', fontSize: '0.9rem', color: 'var(--muted)', pointerEvents: 'none' }}>🔍</span>
                <input
                  type="text"
                  placeholder="搜索员工姓名..."
                  value={workerSearch}
                  onChange={(e) => { setWorkerSearch(e.target.value); setWorkerPage(1) }}
                  style={{ padding: '8px 12px 8px 34px', border: '2px solid var(--border)', borderRadius: '8px', fontSize: '0.9rem', width: '220px', outline: 'none', background: '#fff', transition: 'border-color 0.2s' }}
                  onFocus={(e) => e.target.style.borderColor = 'var(--accent)'}
                  onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
                />
              </div>
              {workerSearch && (
                <button onClick={() => setWorkerSearch('')} style={{ padding: '6px 14px', fontSize: '0.85rem', cursor: 'pointer', background: 'var(--danger)', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: '500' }}>清除</button>
              )}
              <span style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>共 {workerList.filter(w => !workerSearch || w.name.includes(workerSearch)).length} 条</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>员工</th>
                    <th>累计工资</th>
                    <th>已结算</th>
                    <th>未结算</th>
                    <th>押金</th>
                    <th>结算金额</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {workerList.filter(w => !workerSearch || w.name.includes(workerSearch)).slice((workerPage - 1) * pageSize, workerPage * pageSize).map(w => {
                  const key = 'worker_' + w.name
                  const isEditingSettled = editingCell?.personName === w.name && editingCell?.personType === 'worker' && editingCell?.field === 'settled_total'
                  const isEditingUnsettled = editingCell?.personName === w.name && editingCell?.personType === 'worker' && editingCell?.field === 'unsettled'
                  const isEditingDeposit = editingCell?.personName === w.name && editingCell?.personType === 'worker' && editingCell?.field === 'deposit'
                  return (
                    <tr key={w.name}>
                      <td>{w.name}</td>
                      <td>¥{formatMoney(w.total_salary)}</td>
                      <td
                        style={{ color: 'var(--success)', cursor: 'pointer', position: 'relative' }}
                        onDoubleClick={() => {
                          setEditingCell({ personName: w.name, personType: 'worker', field: 'settled_total' })
                          setEditValue(String(w.settled_total))
                        }}
                        title="双击编辑"
                      >
                        {isEditingSettled ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <input
                              type="number"
                              autoFocus
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault()
                                  const val = parseFloat(editValue)
                                  if (!isNaN(val) && val >= 0) {
                                    api.put('/settlement/adjust-settled', { person_name: w.name, person_type: 'worker', target_settled: val })
                                      .then(() => loadData())
                                      .catch(err => setError(err.message))
                                  }
                                  setEditingCell(null)
                                  setEditValue('')
                                }
                                if (e.key === 'Escape') { setEditingCell(null); setEditValue('') }
                              }}
                              style={{ width: '80px', padding: '2px 4px' }}
                              step="0.01"
                              min="0"
                            />
                            <button
                              onClick={async () => {
                                const val = parseFloat(editValue)
                                if (!isNaN(val) && val >= 0) {
                                  try {
                                    await api.put('/settlement/adjust-settled', { person_name: w.name, person_type: 'worker', target_settled: val })
                                    await loadData()
                                  } catch (err) {
                                    setError(err.message)
                                  }
                                }
                                setEditingCell(null)
                                setEditValue('')
                              }}
                              style={{ padding: '1px 6px', fontSize: '0.75rem', cursor: 'pointer', background: 'var(--success)', color: '#fff', border: 'none', borderRadius: '3px', fontWeight: '700', minWidth: '28px' }}
                            >✓</button>
                          </div>
                        ) : (
                          <>¥{formatMoney(w.settled_total)}</>
                        )}
                      </td>
                      <td
                        style={{ color: 'var(--warning)', cursor: 'pointer' }}
                        onDoubleClick={() => {
                          setEditingCell({ personName: w.name, personType: 'worker', field: 'unsettled' })
                          setEditValue(String(w.unsettled))
                        }}
                        title="双击编辑"
                      >
                        {isEditingUnsettled ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <input
                              type="number"
                              autoFocus
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault()
                                  const val = parseFloat(editValue)
                                  if (!isNaN(val) && val >= 0) {
                                    api.put('/settlement/worker-unsettled', { worker_name: w.name, unsettled: val })
                                      .then(() => loadData())
                                      .catch(err => setError(err.message))
                                  }
                                  setEditingCell(null)
                                  setEditValue('')
                                }
                                if (e.key === 'Escape') { setEditingCell(null); setEditValue('') }
                              }}
                              style={{ width: '80px', padding: '2px 4px' }}
                              step="0.01"
                              min="0"
                            />
                            <button
                              onClick={async () => {
                                const val = parseFloat(editValue)
                                if (!isNaN(val) && val >= 0) {
                                  try {
                                    await api.put('/settlement/worker-unsettled', { worker_name: w.name, unsettled: val })
                                    await loadData()
                                  } catch (err) {
                                    setError(err.message)
                                  }
                                }
                                setEditingCell(null)
                                setEditValue('')
                              }}
                              style={{ padding: '1px 6px', fontSize: '0.75rem', cursor: 'pointer', background: 'var(--success)', color: '#fff', border: 'none', borderRadius: '3px', fontWeight: '700', minWidth: '28px' }}
                            >✓</button>
                          </div>
                        ) : (
                          <>¥{formatMoney(w.unsettled)}</>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {isEditingDeposit ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <input
                                type="number"
                                autoFocus
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault()
                                    const val = parseFloat(editValue)
                                    if (!isNaN(val) && val >= 0) {
                                      api.put('/settlement/worker-deposit', { worker_name: w.name, deposit: val })
                                        .then(() => loadData())
                                        .catch(err => setError(err.message))
                                    }
                                    setEditingCell(null)
                                    setEditValue('')
                                  }
                                  if (e.key === 'Escape') { setEditingCell(null); setEditValue('') }
                                }}
                                style={{ width: '70px', padding: '2px 4px' }}
                                step="0.01"
                                min="0"
                              />
                              <button
                                onClick={async () => {
                                  const val = parseFloat(editValue)
                                  if (!isNaN(val) && val >= 0) {
                                    try {
                                      await api.put('/settlement/worker-deposit', { worker_name: w.name, deposit: val })
                                      await loadData()
                                    } catch (err) {
                                      setError(err.message)
                                    }
                                  }
                                  setEditingCell(null)
                                  setEditValue('')
                                }}
                                style={{ padding: '1px 6px', fontSize: '0.75rem', cursor: 'pointer', background: 'var(--success)', color: '#fff', border: 'none', borderRadius: '3px', fontWeight: '700', minWidth: '28px' }}
                              >✓</button>
                            </div>
                          ) : (
                            <span
                              style={{ fontSize: '0.85rem', color: 'var(--danger)', cursor: 'pointer' }}
                              onDoubleClick={() => {
                                setEditingCell({ personName: w.name, personType: 'worker', field: 'deposit' })
                                setEditValue(String(w.deposit))
                              }}
                              title="双击编辑"
                            >
                              ¥{formatMoney(w.deposit)}
                            </span>
                          )}
                          {w.deposit_target > 0 && (
                            <>
                              <span style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>/</span>
                              <span style={{ fontSize: '0.85rem' }}>¥{formatMoney(w.deposit_target)}</span>
                              <div style={{ width: '60px', height: '6px', background: 'var(--bg2)', borderRadius: '3px', overflow: 'hidden' }}>
                                <div style={{
                                  height: '100%',
                                  width: `${Math.min(100, (w.deposit / w.deposit_target) * 100)}%`,
                                  background: w.deposit >= w.deposit_target ? 'var(--success)' : 'var(--accent)',
                                  borderRadius: '3px',
                                  transition: 'width 0.3s'
                                }} />
                              </div>
                            </>
                          )}
                          {(!w.deposit_target || w.deposit_target === 0) && <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>未设目标</span>}
                        </div>
                      </td>
                      <td>
                        <div>
                          <input
                            type="number"
                            value={settleAmounts[key] || ''}
                            onChange={(e) =>
                              setSettleAmounts(prev => ({
                                ...prev,
                                [key]: e.target.value,
                              }))
                            }
                            placeholder="金额"
                            min="0"
                            step="0.01"
                            style={{ width: '100px' }}
                          />
                          {settleErrors[key] && (
                            <div className="error-text" style={{ fontSize: '0.78rem' }}>
                              {settleErrors[key]}
                            </div>
                          )}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          <button
                            className="btn btn-success btn-sm"
                            disabled={settleLoading[key]}
                            onClick={() => handleSettle(w.name, 'worker')}
                          >
                            {settleLoading[key] ? '结算中...' : '结算'}
                          </button>
                          <button
                            className="btn btn-outline btn-sm"
                            disabled={refundLoading[w.name] || (w.deposit || 0) <= 0}
                            onClick={() => handleDepositRefund(w.name)}
                          >
                            {refundLoading[w.name] ? '退还中...' : '全额退押金'}
                          </button>
                          <button
                            className="btn btn-outline btn-sm"
                            onClick={() => showHistory(w.name, 'worker')}
                          >
                            历史
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {workerList.filter(w => !workerSearch || w.name.includes(workerSearch)).length > pageSize && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '16px', alignItems: 'center' }}>
              <button
                className="btn btn-outline btn-sm"
                disabled={workerPage <= 1}
                onClick={() => setWorkerPage(p => Math.max(1, p - 1))}
              >
                上一页
              </button>
              <span style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
                第 {workerPage} / {Math.ceil(workerList.filter(w => !workerSearch || w.name.includes(workerSearch)).length / pageSize)} 页，共 {workerList.filter(w => !workerSearch || w.name.includes(workerSearch)).length} 条
              </span>
              <button
                className="btn btn-outline btn-sm"
                disabled={workerPage >= Math.ceil(workerList.filter(w => !workerSearch || w.name.includes(workerSearch)).length / pageSize)}
                onClick={() => setWorkerPage(p => Math.min(Math.ceil(workerList.filter(w => !workerSearch || w.name.includes(workerSearch)).length / pageSize), p + 1))}
              >
                下一页
              </button>
            </div>
          )}
          </>
        ) : (
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem', padding: '24px 0', textAlign: 'center' }}>
            暂无员工数据
          </p>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginBottom: '4px' }}>客服工资结算</h3>
        <div className="gradient-line" />

        {csList.length > 0 ? (
          <>
            <div style={{ marginBottom: '12px', display: 'flex', gap: '8px', alignItems: 'center' }}>
              <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                <span style={{ position: 'absolute', left: '10px', fontSize: '0.9rem', color: 'var(--muted)', pointerEvents: 'none' }}>🔍</span>
                <input
                  type="text"
                  placeholder="搜索客服姓名..."
                  value={csSearch}
                  onChange={(e) => { setCsSearch(e.target.value); setCsPage(1) }}
                  style={{ padding: '8px 12px 8px 34px', border: '2px solid var(--border)', borderRadius: '8px', fontSize: '0.9rem', width: '220px', outline: 'none', background: '#fff', transition: 'border-color 0.2s' }}
                  onFocus={(e) => e.target.style.borderColor = 'var(--accent)'}
                  onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
                />
              </div>
              {csSearch && (
                <button onClick={() => setCsSearch('')} style={{ padding: '6px 14px', fontSize: '0.85rem', cursor: 'pointer', background: 'var(--danger)', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: '500' }}>清除</button>
              )}
              <span style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>共 {csList.filter(c => !csSearch || c.name.includes(csSearch)).length} 条</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>客服</th>
                    <th>累计提成</th>
                    <th>已结算</th>
                    <th>未结算</th>
                    <th>结算金额</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {csList.filter(c => !csSearch || c.name.includes(csSearch)).slice((csPage - 1) * pageSize, csPage * pageSize).map(c => {
                  const key = 'cs_' + c.name
                  const isEditingCsSettled = editingCell?.personName === c.name && editingCell?.personType === 'cs' && editingCell?.field === 'settled_total'
                  return (
                    <tr key={c.name}>
                      <td>{c.name}</td>
                      <td>¥{formatMoney(c.total_salary)}</td>
                      <td
                        style={{ color: 'var(--success)', cursor: 'pointer' }}
                        onDoubleClick={() => {
                          setEditingCell({ personName: c.name, personType: 'cs', field: 'settled_total' })
                          setEditValue(String(c.settled_total))
                        }}
                        title="双击编辑"
                      >
                        {isEditingCsSettled ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <input
                              type="number"
                              autoFocus
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault()
                                  const val = parseFloat(editValue)
                                  if (!isNaN(val) && val >= 0) {
                                    api.put('/settlement/adjust-settled', { person_name: c.name, person_type: 'cs', target_settled: val })
                                      .then(() => loadData())
                                      .catch(err => setError(err.message))
                                  }
                                  setEditingCell(null)
                                  setEditValue('')
                                }
                                if (e.key === 'Escape') { setEditingCell(null); setEditValue('') }
                              }}
                              style={{ width: '80px', padding: '2px 4px' }}
                              step="0.01"
                              min="0"
                            />
                            <button
                              onClick={async () => {
                                const val = parseFloat(editValue)
                                if (!isNaN(val) && val >= 0) {
                                  try {
                                    await api.put('/settlement/adjust-settled', { person_name: c.name, person_type: 'cs', target_settled: val })
                                    await loadData()
                                  } catch (err) {
                                    setError(err.message)
                                  }
                                }
                                setEditingCell(null)
                                setEditValue('')
                              }}
                              style={{ padding: '1px 6px', fontSize: '0.75rem', cursor: 'pointer', background: 'var(--success)', color: '#fff', border: 'none', borderRadius: '3px', fontWeight: '700', minWidth: '28px' }}
                            >✓</button>
                          </div>
                        ) : (
                          <>¥{formatMoney(c.settled_total)}</>
                        )}
                      </td>
                      <td style={{ color: 'var(--warning)' }}>
                        ¥{formatMoney(c.unsettled)}
                      </td>
                      <td>
                        <div>
                          <input
                            type="number"
                            value={settleAmounts[key] || ''}
                            onChange={(e) =>
                              setSettleAmounts(prev => ({
                                ...prev,
                                [key]: e.target.value,
                              }))
                            }
                            placeholder="金额"
                            min="0"
                            step="0.01"
                            style={{ width: '100px' }}
                          />
                          {settleErrors[key] && (
                            <div className="error-text" style={{ fontSize: '0.78rem' }}>
                              {settleErrors[key]}
                            </div>
                          )}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            className="btn btn-success btn-sm"
                            disabled={settleLoading[key]}
                            onClick={() => handleSettle(c.name, 'cs')}
                          >
                            {settleLoading[key] ? '结算中...' : '结算'}
                          </button>
                          <button
                            className="btn btn-outline btn-sm"
                            onClick={() => showHistory(c.name, 'cs')}
                          >
                            历史
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {csList.filter(c => !csSearch || c.name.includes(csSearch)).length > pageSize && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '16px', alignItems: 'center' }}>
              <button
                className="btn btn-outline btn-sm"
                disabled={csPage <= 1}
                onClick={() => setCsPage(p => Math.max(1, p - 1))}
              >
                上一页
              </button>
              <span style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
                第 {csPage} / {Math.ceil(csList.filter(c => !csSearch || c.name.includes(csSearch)).length / pageSize)} 页，共 {csList.filter(c => !csSearch || c.name.includes(csSearch)).length} 条
              </span>
              <button
                className="btn btn-outline btn-sm"
                disabled={csPage >= Math.ceil(csList.filter(c => !csSearch || c.name.includes(csSearch)).length / pageSize)}
                onClick={() => setCsPage(p => Math.min(Math.ceil(csList.filter(c => !csSearch || c.name.includes(csSearch)).length / pageSize), p + 1))}
              >
                下一页
              </button>
            </div>
          )}
          </>
        ) : (
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem', padding: '24px 0', textAlign: 'center' }}>
            暂无客服数据
          </p>
        )}
      </div>

      {historyPerson && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div className="card" style={{
            width: '700px',
            maxWidth: '90vw',
            maxHeight: '80vh',
            overflowY: 'auto',
            padding: '32px',
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px',
            }}>
              <h3 style={{ marginBottom: 0 }}>
                {historyPerson.name} 结算历史
                <span style={{
                  display: 'inline-block',
                  marginLeft: '8px',
                  padding: '3px 10px',
                  borderRadius: '12px',
                  fontSize: '0.78rem',
                  fontFamily: 'var(--font-title)',
                  background: historyPerson.type === 'worker'
                    ? 'rgba(0, 229, 255, 0.15)'
                    : 'rgba(180, 77, 255, 0.15)',
                  color: historyPerson.type === 'worker' ? 'var(--accent)' : 'var(--accent2)',
                }}>
                  {historyPerson.type === 'worker' ? '员工' : '客服'}
                </span>
              </h3>
              <button className="btn btn-outline btn-sm" onClick={closeHistory}>
                关闭
              </button>
            </div>
            <div className="gradient-line" />

            {historyLoading ? (
              <p style={{ color: 'var(--muted)', fontSize: '0.9rem', textAlign: 'center', padding: '24px' }}>
                加载中...
              </p>
            ) : historyData.length > 0 ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>结算时间</th>
                      <th>类型</th>
                      <th>金额</th>
                      <th>操作人</th>
                      <th>备注</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyData.map((h, i) => {
                      const isDepositRefund = h.person_type === 'deposit_refund'
                      return (
                        <tr key={h.id || i} style={h.reversed ? { textDecoration: 'line-through', opacity: 0.6 } : {}}>
                          <td>{formatDate(h.settled_at)}</td>
                          <td>
                            <span style={{
                              display: 'inline-block',
                              padding: '2px 8px',
                              borderRadius: '10px',
                              fontSize: '0.75rem',
                              background: isDepositRefund ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                              color: isDepositRefund ? 'var(--danger)' : 'var(--success)',
                            }}>
                              {isDepositRefund ? '押金退还' : '工资结算'}
                            </span>
                          </td>
                          <td style={{ color: isDepositRefund ? 'var(--danger)' : 'var(--success)' }}>
                            ¥{formatMoney(h.settled_amount)}
                          </td>
                          <td>{h.settled_by || '-'}</td>
                          <td style={{ maxWidth: '150px', wordBreak: 'break-word' }}>{h.remark || '-'}</td>
                          <td>
                            {h.reversed ? (
                              <span style={{ color: 'var(--danger)', fontWeight: 'bold' }}>已撤销</span>
                            ) : isDepositRefund ? (
                              <span style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>不可撤销</span>
                            ) : (
                              <button
                                className="btn btn-danger btn-sm"
                                disabled={reverseLoading[h.id]}
                                onClick={() => handleReverseSettlement(h.id)}
                              >
                                {reverseLoading[h.id] ? '撤销中...' : '撤销'}
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p style={{ color: 'var(--muted)', fontSize: '0.9rem', padding: '24px', textAlign: 'center' }}>
                暂无结算记录
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function LogsTab() {
  const [logs, setLogs] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(DEFAULT_PAGE_SIZE)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState(false)
  const [filterModule, setFilterModule] = useState('')
  const [filterAction, setFilterAction] = useState('')
  const [filterOperator, setFilterOperator] = useState('')
  const [filterStartDate, setFilterStartDate] = useState('')
  const [filterEndDate, setFilterEndDate] = useState('')

  const buildFilterParams = () => {
    const params = new URLSearchParams()
    if (filterModule) params.append('module', filterModule)
    if (filterAction) params.append('action', filterAction)
    if (filterOperator) params.append('operator', filterOperator)
    if (filterStartDate) params.append('start_date', filterStartDate)
    if (filterEndDate) params.append('end_date', filterEndDate)
    return params
  }

  const loadLogs = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = buildFilterParams()
      params.append('page', page)
      params.append('size', pageSize)
      const res = await api.get('/logs?' + params.toString())
      setLogs(res.data.list || [])
      setTotal(res.data.total || 0)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, filterModule, filterAction, filterOperator, filterStartDate, filterEndDate])

  useEffect(() => {
    loadLogs()
  }, [loadLogs])

  const handleSearch = () => {
    setPage(1)
  }

  const handleExport = async () => {
    setExporting(true)
    setError('')
    try {
      const params = buildFilterParams()
      const token = localStorage.getItem('token')
      const res = await fetch('/api/logs/export?' + params.toString(), {
        headers: { 'Authorization': 'Bearer ' + token },
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.message || '导出失败')
      }
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const now = new Date()
      const ts = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`
      a.download = `操作日志_${ts}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch (err) {
      setError(err.message)
    } finally {
      setExporting(false)
    }
  }

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div>
      <div className="card">
        <h3 className="card-title">操作日志</h3>
        <div className="gradient-line" />

        <div style={{ marginBottom: '16px', display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ marginBottom: 0, minWidth: '140px' }}>
            <label>模块</label>
            <select value={filterModule} onChange={(e) => setFilterModule(e.target.value)}>
              <option value="">全部模块</option>
              <option value="订单管理">订单管理</option>
              <option value="人员配置">人员配置</option>
              <option value="工资结算">工资结算</option>
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0, minWidth: '160px' }}>
            <label>操作内容</label>
            <input
              type="text"
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              placeholder="搜索操作..."
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0, minWidth: '140px' }}>
            <label>操作人</label>
            <input
              type="text"
              value={filterOperator}
              onChange={(e) => setFilterOperator(e.target.value)}
              placeholder="搜索操作人..."
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0, minWidth: '150px' }}>
            <label>开始日期</label>
            <input
              type="date"
              value={filterStartDate}
              onChange={(e) => setFilterStartDate(e.target.value)}
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0, minWidth: '150px' }}>
            <label>结束日期</label>
            <input
              type="date"
              value={filterEndDate}
              onChange={(e) => setFilterEndDate(e.target.value)}
            />
          </div>
          <button className="btn btn-primary" onClick={handleSearch}>
            搜索
          </button>
          <button className="btn btn-success" onClick={handleExport} disabled={exporting}>
            {exporting ? '导出中...' : '导出CSV'}
          </button>
        </div>

        {error && <div className="error-text">{error}</div>}

        {loading ? (
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem', textAlign: 'center', padding: '24px' }}>
            加载中...
          </p>
        ) : logs.length > 0 ? (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: '170px' }}>时间</th>
                    <th style={{ width: '100px' }}>模块</th>
                    <th style={{ width: '120px' }}>操作</th>
                    <th>详情</th>
                    <th style={{ width: '100px' }}>操作人</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id}>
                      <td>{formatDate(log.created_at)}</td>
                      <td>{log.module}</td>
                      <td>{log.action}</td>
                      <td style={{ textAlign: 'left' }}>{log.detail}</td>
                      <td>{log.operator}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '16px' }}>
                <button
                  className="btn btn-outline btn-sm"
                  disabled={page <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                >
                  上一页
                </button>
                <span style={{ padding: '6px 12px', color: 'var(--muted)', fontSize: '0.9rem' }}>
                  第 {page} / {totalPages} 页，共 {total} 条
                </span>
                <button
                  className="btn btn-outline btn-sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                >
                  下一页
                </button>
              </div>
            )}
          </>
        ) : (
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem', textAlign: 'center', padding: '24px' }}>
            暂无操作日志
          </p>
        )}
      </div>
    </div>
  )
}

function ManagerTab() {
  const [managerList, setManagerList] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [addForm, setAddForm] = useState({ name: '', username: '', password: '' })
  const [addError, setAddError] = useState('')
  const [addLoading, setAddLoading] = useState(false)
  const [editModal, setEditModal] = useState(null)
  const [editForm, setEditForm] = useState({ name: '', username: '', password: '', active: true })
  const [editError, setEditError] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  const loadManagers = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.get('/config/managers')
      setManagerList(res.data || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadManagers()
  }, [loadManagers])

  const handleAdd = async (e) => {
    e.preventDefault()
    const trimmedName = addForm.name.trim()
    const trimmedUsername = addForm.username.trim()
    const trimmedPassword = addForm.password.trim()
    if (!trimmedName) {
      setAddError('请输入店长姓名')
      return
    }
    if (!trimmedUsername) {
      setAddError('请输入登录账号')
      return
    }
    if (!trimmedPassword) {
      setAddError('请输入登录密码')
      return
    }
    setAddError('')
    setAddLoading(true)
    try {
      await api.post('/config/managers', {
        name: trimmedName,
        username: trimmedUsername,
        password: trimmedPassword,
      })
      setAddForm({ name: '', username: '', password: '' })
      toast('店长添加成功', 'success')
      await loadManagers()
    } catch (err) {
      setAddError(err.message)
    } finally {
      setAddLoading(false)
    }
  }

  const openEditModal = (m) => {
    setEditModal(m)
    setEditForm({ name: m.name, username: m.username, password: '', active: !!m.active })
    setEditError('')
  }

  const handleEdit = async (e) => {
    e.preventDefault()
    const trimmedName = editForm.name.trim()
    const trimmedUsername = editForm.username.trim()
    if (!trimmedName) {
      setEditError('请输入店长姓名')
      return
    }
    if (!trimmedUsername) {
      setEditError('请输入登录账号')
      return
    }
    setEditError('')
    setEditSaving(true)
    try {
      const payload = {
        name: trimmedName,
        username: trimmedUsername,
        active: editForm.active,
      }
      if (editForm.password.trim()) {
        payload.password = editForm.password.trim()
      }
      await api.put('/config/managers/' + editModal.id, payload)
      toast('店长信息已更新', 'success')
      setEditModal(null)
      await loadManagers()
    } catch (err) {
      setEditError(err.message)
    } finally {
      setEditSaving(false)
    }
  }

  const handleDelete = async (id) => {
    const confirmed = await confirm('确定要删除该店长吗？')
    if (!confirmed) return
    try {
      await api.del('/config/managers/' + id)
      toast('店长已删除', 'success')
      await loadManagers()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div className="card">
        <h3 style={{ marginBottom: '16px' }}>添加店长</h3>
        <form onSubmit={handleAdd} style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>姓名</label>
            <input
              type="text"
              value={addForm.name}
              onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
              placeholder="店长姓名"
              style={{ width: '120px' }}
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>登录账号</label>
            <input
              type="text"
              value={addForm.username}
              onChange={(e) => setAddForm({ ...addForm, username: e.target.value })}
              placeholder="登录账号"
              style={{ width: '150px' }}
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>登录密码</label>
            <input
              type="password"
              value={addForm.password}
              onChange={(e) => setAddForm({ ...addForm, password: e.target.value })}
              placeholder="登录密码"
              style={{ width: '150px' }}
            />
          </div>
          <button type="submit" className="btn btn-primary btn-sm" disabled={addLoading}>
            {addLoading ? '添加中...' : '添加'}
          </button>
        </form>
        {addError && <p className="error-text" style={{ marginTop: '8px' }}>{addError}</p>}
      </div>

      <div className="card">
        <h3 style={{ marginBottom: '16px' }}>店长列表</h3>
        {loading ? (
          <p style={{ color: 'var(--muted)', textAlign: 'center', padding: '24px' }}>加载中...</p>
        ) : error ? (
          <p className="error-text" style={{ textAlign: 'center', padding: '24px' }}>{error}</p>
        ) : managerList.length > 0 ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>姓名</th>
                <th>登录账号</th>
                <th>状态</th>
                <th>创建时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {managerList.map((m) => (
                <tr key={m.id}>
                  <td>{m.name}</td>
                  <td>{m.username}</td>
                  <td>
                    <span className={`status-tag ${m.active ? 'status-active' : 'status-inactive'}`}>
                      {m.active ? '启用' : '禁用'}
                    </span>
                  </td>
                  <td>{formatDate(m.created_at)}</td>
                  <td style={{ display: 'flex', gap: '8px' }}>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => openEditModal(m)}
                    >
                      编辑
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => handleDelete(m.id)}
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ color: 'var(--muted)', textAlign: 'center', padding: '24px' }}>
            暂无店长账户
          </p>
        )}
      </div>

      {editModal && (
        <div className="modal-overlay" onClick={() => setEditModal(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ width: '420px' }}>
            <div className="gradient-line" style={{ marginBottom: '20px' }} />
            <h3 style={{ marginBottom: '20px', fontSize: '1.2rem' }}>编辑店长</h3>
            <form onSubmit={handleEdit}>
              <div className="form-group">
                <label>姓名</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>登录账号</label>
                <input
                  type="text"
                  value={editForm.username}
                  onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>新密码（留空则不修改）</label>
                <input
                  type="password"
                  value={editForm.password}
                  onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                  placeholder="留空表示不修改密码"
                />
              </div>
              <div className="form-group">
                <label>状态</label>
                <select
                  value={editForm.active ? '1' : '0'}
                  onChange={(e) => setEditForm({ ...editForm, active: e.target.value === '1' })}
                >
                  <option value="1">启用</option>
                  <option value="0">禁用</option>
                </select>
              </div>
              {editError && <p className="error-text">{editError}</p>}
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
                <button type="button" className="btn btn-outline" onClick={() => setEditModal(null)}>取消</button>
                <button type="submit" className="btn btn-primary" disabled={editSaving}>
                  {editSaving ? '保存中...' : '保存'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
