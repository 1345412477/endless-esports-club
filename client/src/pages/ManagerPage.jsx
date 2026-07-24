import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { api } from '../api/client'
import { toast } from '../components/Toast'
import { confirm } from '../components/ConfirmDialog'
import {
  ORDER_STATUSES,
  WORKER_STATUSES,
} from '../utils/constants'
import { formatDate, formatMoney } from '../utils/helpers'

const TABS = ['数据看板', '员工录入', '订单查看']
const WORKER_PAGE_SIZE = 5

const getOrderStatusStyle = (status) => {
  switch (status) {
    case '接单中': return { background: 'rgba(6,182,212,0.12)', color: '#0891b2', border: '1px solid rgba(6,182,212,0.4)' }
    case '已结单': return { background: 'rgba(34,197,94,0.12)', color: '#16a34a', border: '1px solid rgba(34,197,94,0.4)' }
    case '存单': return { background: 'rgba(245,158,11,0.12)', color: '#d97706', border: '1px solid rgba(245,158,11,0.4)' }
    case '退单': return { background: 'rgba(239,68,68,0.12)', color: '#dc2626', border: '1px solid rgba(239,68,68,0.4)' }
    default: return { background: 'var(--bg)', color: 'var(--ink)', border: '1px solid var(--rule)' }
  }
}

export default function ManagerPage() {
  const navigate = useNavigate()
  const auth = useAuth()
  const [activeTab, setActiveTab] = useState('数据看板')

  // Dashboard state
  const [dashboardData, setDashboardData] = useState(null)
  const [dimension, setDimension] = useState('day')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [trendData, setTrendData] = useState([])

  // Workers state
  const [workers, setWorkers] = useState([])
  const [workerPage, setWorkerPage] = useState(1)
  const [workerSearch, setWorkerSearch] = useState('')
  const [showAddWorker, setShowAddWorker] = useState(false)
  const [newWorker, setNewWorker] = useState({
    name: '',
    default_deduction_rate: 0.2,
    rating: '',
    status: '在店',
    deposit_target: 0,
  })

  // Worker editing (inline)
  const [editingRow, setEditingRow] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [editError, setEditError] = useState('')

  // Orders state
  const [orders, setOrders] = useState([])
  const [orderPage, setOrderPage] = useState(1)
  const [orderTotal, setOrderTotal] = useState(0)
  const [orderFilter, setOrderFilter] = useState({
    cs_name: '',
    status: '',
    date_from: '',
    date_to: '',
  })

  // Order creation state
  const [createModal, setCreateModal] = useState(false)
  const [createForm, setCreateForm] = useState({
    cs_name: '',
    order_type: '',
    customer_name: '',
    remark: '',
    price: '',
    workers: [{ name: '' }],
  })
  const [createError, setCreateError] = useState('')
  const [createSubmitting, setCreateSubmitting] = useState(false)

  // Order edit state
  const [editingOrder, setEditingOrder] = useState(null)
  const [editOrderForm, setEditOrderForm] = useState({ order_type: '', customer_name: '', remark: '', price: '', workers: [] })
  const [editOrderError, setEditOrderError] = useState('')
  const [editOrderSubmitting, setEditOrderSubmitting] = useState(false)

  const [csList, setCsList] = useState([])
  const [workerList, setWorkerList] = useState([])

  // Dropdown state for searchable selects
  const [dropdownOpen, setDropdownOpen] = useState(null)
  const [dropdownSearch, setDropdownSearch] = useState('')
  const dropdownRef = useRef(null)

  const handleLogout = () => {
    auth.logout()
    navigate('/login')
  }

  // Date helpers
  const getDateParam = () => {
    const d = currentDate
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    // Always return a valid date string that can be parsed by new Date()
    if (dimension === 'day') return `${y}-${m}-${day}`
    if (dimension === 'week') return `${y}-${m}-${day}`
    if (dimension === 'month') return `${y}-${m}-01`
    if (dimension === 'year') return `${y}-01-01`
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

  useEffect(() => {
    loadDashboard()
    loadTrendData()
  }, [dimension, currentDate])

  useEffect(() => {
    if (activeTab === '员工录入') {
      loadWorkers()
    } else if (activeTab === '订单查看') {
      loadOrders()
    }
  }, [activeTab, orderPage, workerPage])

  // Load CS and worker list for order creation
  useEffect(() => {
    Promise.all([
      api.get('/config/cs'),
      api.get('/config/workers'),
    ]).then(([cRes, wRes]) => {
      setCsList((cRes.data || []).filter(c => c.active))
      setWorkerList(wRes.data || [])
    }).catch(() => {})
  }, [])

  // Close dropdown on outside click - use click instead of mousedown to not interfere with native date picker
  useEffect(() => {
    if (!dropdownOpen) return
    const handler = (e) => {
      // Don't close if clicking on a date input or its children (let native picker open)
      const dateInput = e.target.closest('input[type="date"]')
      if (dateInput) return
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(null)
        setDropdownSearch('')
      }
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [dropdownOpen])

  const loadDashboard = async () => {
    try {
      const dateParam = getDateParam()
      const res = await api.get(`/stats/dashboard?dimension=${dimension}&date=${encodeURIComponent(dateParam)}`)
      setDashboardData(res.data)
    } catch (err) {
      toast(err.message || '加载看板失败', 'error')
    }
  }

  const loadTrendData = async () => {
    try {
      // 根据维度获取趋势数据
      let days = 7
      if (dimension === 'month') days = 30
      else if (dimension === 'year') days = 365
      const res = await api.get(`/stats/trend?days=${days}`)
      setTrendData(res.data || [])
    } catch (err) {
      console.error('加载趋势数据失败:', err)
      setTrendData([])
    }
  }

  const loadWorkers = async () => {
    try {
      const res = await api.get('/config/workers')
      setWorkers(res.data)
    } catch (err) {
      toast(err.message || '加载员工列表失败', 'error')
    }
  }

  const loadOrders = async () => {
    try {
      const params = new URLSearchParams({
        page: orderPage,
        size: 10,
      })
      if (orderFilter.cs_name) params.append('cs_name', orderFilter.cs_name)
      if (orderFilter.status) params.append('status', orderFilter.status)
      if (orderFilter.date_from) params.append('date_from', orderFilter.date_from)
      if (orderFilter.date_to) params.append('date_to', orderFilter.date_to)

      const res = await api.get(`/orders?${params.toString()}`)
      setOrders(res.data.list)
      setOrderTotal(res.data.total)
    } catch (err) {
      toast(err.message || '加载订单列表失败', 'error')
    }
  }

  // Filtered workers
  const filteredWorkers = workers.filter(w =>
    !workerSearch || w.name.toLowerCase().includes(workerSearch.toLowerCase())
  )
  const workerTotalPages = Math.ceil(filteredWorkers.length / WORKER_PAGE_SIZE)
  const paginatedWorkers = filteredWorkers.slice(
    (workerPage - 1) * WORKER_PAGE_SIZE,
    workerPage * WORKER_PAGE_SIZE
  )

  // Add worker
  const handleAddWorker = async () => {
    if (!newWorker.name.trim()) {
      toast('员工姓名不能为空', 'error')
      return
    }
    try {
      await api.post('/config/workers', newWorker)
      toast('员工添加成功', 'success')
      setShowAddWorker(false)
      setNewWorker({
        name: '',
        default_deduction_rate: 0.2,
        rating: '',
        status: '在店',
        deposit_target: 0,
      })
      loadWorkers()
    } catch (err) {
      toast(err.message || '添加员工失败', 'error')
    }
  }

  // Delete worker
  const handleDeleteWorker = async (id) => {
    const confirmed = await confirm('确定要删除该员工吗？')
    if (!confirmed) return
    try {
      await api.del('/config/workers/' + id)
      toast('员工已删除', 'success')
      loadWorkers()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  // Worker inline editing
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
    const ratePercent = parseFloat(editForm.default_deduction_rate_percent)
    if (isNaN(ratePercent) || ratePercent < 0 || ratePercent > 100) {
      setEditError('抽成比例必须在0-100之间')
      return
    }
    try {
      await api.put(`/config/workers/${editingRow.id}`, {
        name: editForm.name.trim(),
        default_deduction_rate: ratePercent / 100,
        rating: editForm.rating,
        status: editForm.status,
        deposit_target: parseFloat(editForm.deposit_target) || 0,
      })
      toast('员工信息已更新', 'success')
      cancelEdit()
      loadWorkers()
    } catch (err) {
      setEditError(err.message)
    }
  }

  // Searchable select component
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
              placeholder="搜索..."
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
                    {opt.name}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  // Order creation
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
      await loadDashboard()
      toast('订单创建成功', 'success')
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setCreateSubmitting(false)
    }
  }

  // Order status change
  const handleStatusChange = async (orderId, newStatus) => {
    try {
      await api.put(`/orders/${orderId}/status`, { status: newStatus })
      toast('订单状态已更新', 'success')
      await loadOrders()
      await loadDashboard()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  // Order delete
  const handleDeleteOrder = async (orderId) => {
    const confirmed = await confirm('确定删除该订单？')
    if (!confirmed) return
    try {
      await api.del('/orders/' + orderId)
      toast('订单已删除', 'success')
      await loadOrders()
      await loadDashboard()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  // Order edit
  const openEditOrderModal = (order) => {
    setEditingOrder(order)
    setEditOrderForm({
      order_type: order.order_type || '',
      customer_name: order.customer_name || '',
      remark: order.remark || '',
      price: String(order.price || ''),
      workers: (order.workers || []).map(w => ({ name: w.worker_name })),
    })
    setEditOrderError('')
  }

  const closeEditOrderModal = () => {
    setEditingOrder(null)
    setEditOrderError('')
  }

  const updateEditOrderWorker = (index, value) => {
    const updated = editOrderForm.workers.map((w, i) => i === index ? { ...w, name: value } : w)
    setEditOrderForm({ ...editOrderForm, workers: updated })
  }

  const addEditOrderWorker = () => {
    if (editOrderForm.workers.length >= 2) return
    setEditOrderForm({ ...editOrderForm, workers: [...editOrderForm.workers, { name: '' }] })
  }

  const removeEditOrderWorker = (index) => {
    if (editOrderForm.workers.length <= 1) return
    setEditOrderForm({ ...editOrderForm, workers: editOrderForm.workers.filter((_, i) => i !== index) })
  }

  const handleEditOrderSubmit = async (e) => {
    e.preventDefault()
    setEditOrderError('')
    const numPrice = parseFloat(editOrderForm.price)
    if (isNaN(numPrice) || numPrice <= 0) { setEditOrderError('单子价格必须大于0'); return }
    const workerNames = editOrderForm.workers.map(w => w.name).filter(n => n.trim())
    if (workerNames.length < 1) { setEditOrderError('至少需要关联1名员工'); return }
    if (workerNames.length !== editOrderForm.workers.length) { setEditOrderError('请为所有员工行选择员工'); return }
    if (new Set(workerNames).size !== workerNames.length) { setEditOrderError('员工不能重复'); return }

    setEditOrderSubmitting(true)
    try {
      await api.put(`/orders/${editingOrder.id}`, {
        order_type: editOrderForm.order_type.trim(),
        customer_name: editOrderForm.customer_name.trim(),
        remark: editOrderForm.remark.trim(),
        price: numPrice,
        workers: editOrderForm.workers.map(w => ({ name: w.name.trim() })),
      })
      closeEditOrderModal()
      await loadOrders()
      await loadDashboard()
      toast('订单已更新', 'success')
    } catch (err) {
      setEditOrderError(err.message)
    } finally {
      setEditOrderSubmitting(false)
    }
  }

  // Dashboard render
  const renderDashboard = () => {
    if (!dashboardData) return <p style={{ color: 'var(--muted)', textAlign: 'center', padding: '24px' }}>加载中...</p>

    const { summary, prev_summary, label, changes, orders: latestOrders = [] } = dashboardData

    const renderChange = (val) => {
      if (val === null || val === undefined) return null
      const color = val >= 0 ? 'var(--success)' : 'var(--danger)'
      return (
        <div className="stat-sub">
          <span style={{ color }}>
            {val >= 0 ? '↑' : '↓'}{Math.abs(val)}%
          </span>
        </div>
      )
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ marginBottom: 0 }}>数据看板</h3>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <select
                value={dimension}
                onChange={(e) => { setDimension(e.target.value); setWorkerPage(1) }}
                style={{ width: '100px', padding: '6px 10px' }}
              >
                <option value="day">按日</option>
                <option value="week">按周</option>
                <option value="month">按月</option>
                <option value="year">按年</option>
              </select>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => shiftDate(-1)}
                style={{ padding: '6px 10px', cursor: 'pointer', pointerEvents: 'auto', position: 'relative', zIndex: 10 }}
                title="上一周期"
              >
                &lt;
              </button>
              <span style={{
                minWidth: '160px',
                textAlign: 'center',
                fontSize: '0.9rem',
                color: 'var(--ink)',
                fontWeight: 500,
                pointerEvents: 'none',
              }}>
                {getDisplayLabel()}
              </span>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => shiftDate(1)}
                style={{ padding: '6px 10px', cursor: 'pointer', pointerEvents: 'auto', position: 'relative', zIndex: 10 }}
                title="下一周期"
              >
                &gt;
              </button>
              {!isToday() && (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={goToday}
                  style={{ padding: '6px 14px', cursor: 'pointer', pointerEvents: 'auto', position: 'relative', zIndex: 10 }}
                >
                  今天
                </button>
              )}
            </div>
          </div>
          <p className="info-text">统计周期：{label}</p>
        </div>

        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-label">总营业额</div>
            <div className="stat-value" style={{ color: 'var(--accent)', fontSize: '1.8rem' }}>¥{formatMoney(summary.total_amount)}</div>
            {renderChange(changes?.total_amount)}
          </div>
          <div className="stat-card">
            <div className="stat-label">总订单数</div>
            <div className="stat-value">{summary.total_orders}</div>
            {renderChange(changes?.total_orders)}
          </div>
          <div className="stat-card">
            <div className="stat-label">已完成订单</div>
            <div className="stat-value">{summary.completed_orders}</div>
            {renderChange(changes?.completed_orders)}
          </div>
          <div className="stat-card">
            <div className="stat-label">退款订单</div>
            <div className="stat-value">{summary.refund_orders}</div>
            {renderChange(changes?.refund_orders)}
          </div>
        </div>

        <div className="card">
          <h3 style={{ marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '1.1rem' }}></span> 营业额趋势
          </h3>
          <div className="gradient-line" />
          {trendData.length > 0 && (() => {
            const maxAmount = Math.max(...trendData.map(d => d.total_amount), 1)
            const totalAmount = trendData.reduce((s, d) => s + d.total_amount, 0)
            const totalCount = trendData.reduce((s, d) => s + d.order_count, 0)
            const chartWidth = 700
            const chartHeight = 200
            const padding = { top: 20, right: 20, bottom: 30, left: 50 }
            const innerWidth = chartWidth - padding.left - padding.right
            const innerHeight = chartHeight - padding.top - padding.bottom

            const points = trendData.map((d, i) => ({
              x: padding.left + (i / (trendData.length - 1 || 1)) * innerWidth,
              y: padding.top + innerHeight - (d.total_amount / maxAmount) * innerHeight,
              ...d,
            }))

            const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
            const areaPath = `${linePath} L ${points[points.length - 1].x} ${padding.top + innerHeight} L ${points[0].x} ${padding.top + innerHeight} Z`

            return (
              <>
                <div style={{ display: 'flex', gap: '16px', marginBottom: '14px', fontSize: '0.82rem' }}>
                  <div>总单：<b style={{ color: 'var(--accent)' }}>{totalCount}</b></div>
                  <div>总流水：<b style={{ color: 'var(--accent)' }}>¥{totalAmount.toFixed(2)}</b></div>
                </div>
                <svg width="100%" viewBox={`0 0 ${chartWidth} ${chartHeight}`} style={{ overflow: 'visible' }}>
                  {/* Grid lines */}
                  {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => (
                    <g key={i}>
                      <line
                        x1={padding.left}
                        y1={padding.top + innerHeight * (1 - ratio)}
                        x2={padding.left + innerWidth}
                        y2={padding.top + innerHeight * (1 - ratio)}
                        stroke="var(--rule)"
                        strokeWidth="1"
                        strokeDasharray="4"
                      />
                      <text
                        x={padding.left - 8}
                        y={padding.top + innerHeight * (1 - ratio) + 4}
                        textAnchor="end"
                        fill="var(--muted)"
                        fontSize="10"
                      >
                        ¥{(maxAmount * ratio).toFixed(0)}
                      </text>
                    </g>
                  ))}
                  {/* Area fill */}
                  <path d={areaPath} fill="url(#areaGradient)" opacity="0.3" />
                  {/* Line */}
                  <path d={linePath} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  {/* Data points */}
                  {points.map((p, i) => (
                    <g key={i}>
                      <circle cx={p.x} cy={p.y} r="4" fill="var(--bg)" stroke="var(--accent)" strokeWidth="2" />
                      <text
                        x={p.x}
                        y={padding.top + innerHeight + 16}
                        textAnchor="middle"
                        fill="var(--muted)"
                        fontSize="9"
                      >
                        {p.label}
                      </text>
                    </g>
                  ))}
                  <defs>
                    <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.4" />
                      <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                </svg>
              </>
            )
          })()}
          {trendData.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px' }}>
              暂无趋势数据
            </div>
          )}
        </div>
      </div>
    )
  }

  // Workers render
  const renderWorkers = () => {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ marginBottom: 0 }}>员工列表</h3>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <div className="search-wrapper" style={{ flex: 'none', width: '200px' }}>
                <span className="search-icon">🔍</span>
                <input
                  type="text"
                  placeholder="搜索员工姓名..."
                  value={workerSearch}
                  onChange={(e) => { setWorkerSearch(e.target.value); setWorkerPage(1) }}
                  style={{ width: '200px', paddingLeft: '36px' }}
                />
              </div>
              <button className="btn btn-primary btn-sm" onClick={() => setShowAddWorker(true)}>
                添加员工
              </button>
            </div>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>姓名</th>
                  <th>抽成比例</th>
                  <th>评级</th>
                  <th>状态</th>
                  <th>押金</th>
                  <th>押金目标</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {paginatedWorkers.length > 0 ? paginatedWorkers.map((w) => {
                  const isEditing = editingRow && editingRow.type === 'worker' && editingRow.id === w.id
                  if (isEditing) {
                    return (
                      <tr key={w.id} style={{ background: 'var(--surface)' }}>
                        <td>
                          <input
                            type="text"
                            value={editForm.name}
                            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                            style={{ width: '100%', padding: '4px 8px', fontSize: '0.85rem' }}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            step="0.01"
                            value={editForm.default_deduction_rate_percent}
                            onChange={(e) => setEditForm({ ...editForm, default_deduction_rate_percent: e.target.value })}
                            style={{ width: '80px', padding: '4px 8px', fontSize: '0.85rem' }}
                          />%
                        </td>
                        <td>
                          <select
                            value={editForm.rating}
                            onChange={(e) => setEditForm({ ...editForm, rating: e.target.value })}
                            style={{ padding: '4px 8px', fontSize: '0.85rem' }}
                          >
                            <option value="">无</option>
                            <option value="娱乐">娱乐</option>
                            <option value="技术">技术</option>
                            <option value="大师">大师</option>
                            <option value="宗师">宗师</option>
                            <option value="明星">明星</option>
                          </select>
                        </td>
                        <td>
                          <select
                            value={editForm.status}
                            onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                            style={{ padding: '4px 8px', fontSize: '0.85rem' }}
                          >
                            {WORKER_STATUSES.map((s) => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                        </td>
                        <td>¥{formatMoney(w.deposit)}</td>
                        <td>
                          <input
                            type="number"
                            step="0.01"
                            value={editForm.deposit_target}
                            onChange={(e) => setEditForm({ ...editForm, deposit_target: e.target.value })}
                            style={{ width: '100px', padding: '4px 8px', fontSize: '0.85rem' }}
                          />
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button className="btn btn-primary btn-sm" onClick={saveEdit}>保存</button>
                            <button className="btn btn-outline btn-sm" onClick={cancelEdit}>取消</button>
                          </div>
                          {editError && <div style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: '4px' }}>{editError}</div>}
                        </td>
                      </tr>
                    )
                  }
                  return (
                    <tr key={w.id}>
                      <td>{w.name}</td>
                      <td>{(w.default_deduction_rate * 100).toFixed(0)}%</td>
                      <td>{w.rating || '-'}</td>
                      <td>
                        <span className={`badge ${w.status === '在店' ? 'badge-接单中' : 'badge-退单'}`}>
                          {w.status}
                        </span>
                      </td>
                      <td>¥{formatMoney(w.deposit)}</td>
                      <td>¥{formatMoney(w.deposit_target)}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button className="btn btn-outline btn-sm" onClick={() => startEditWorker(w)}>编辑</button>
                          <button className="btn btn-danger btn-sm" onClick={() => handleDeleteWorker(w.id)}>删除</button>
                        </div>
                      </td>
                    </tr>
                  )
                }) : (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px' }}>
                      暂无员工数据
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {workerTotalPages > 1 && (
            <div className="pagination">
              <button
                disabled={workerPage === 1}
                onClick={() => setWorkerPage(workerPage - 1)}
              >
                上一页
              </button>
              <span>第 {workerPage} / {workerTotalPages} 页</span>
              <button
                disabled={workerPage >= workerTotalPages}
                onClick={() => setWorkerPage(workerPage + 1)}
              >
                下一页
              </button>
            </div>
          )}
        </div>

        {/* Add Worker Modal */}
        {showAddWorker && (
          <div className="modal-overlay" onClick={() => setShowAddWorker(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ width: '420px' }}>
              <div className="gradient-line" style={{ marginBottom: '20px' }} />
              <h3 style={{ marginBottom: '20px', fontSize: '1.2rem' }}>添加员工</h3>
              <div className="form-group">
                <label>姓名</label>
                <input
                  type="text"
                  value={newWorker.name}
                  onChange={(e) => setNewWorker({ ...newWorker, name: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>抽成比例 (%)</label>
                <input
                  type="number"
                  step="0.01"
                  value={newWorker.default_deduction_rate * 100}
                  onChange={(e) => setNewWorker({ ...newWorker, default_deduction_rate: (parseFloat(e.target.value) || 0) / 100 })}
                />
              </div>
              <div className="form-group">
                <label>评级</label>
                <select
                  value={newWorker.rating}
                  onChange={(e) => setNewWorker({ ...newWorker, rating: e.target.value })}
                >
                  <option value="">无</option>
                  <option value="娱乐">娱乐</option>
                  <option value="技术">技术</option>
                  <option value="大师">大师</option>
                  <option value="宗师">宗师</option>
                  <option value="明星">明星</option>
                </select>
              </div>
              <div className="form-group">
                <label>状态</label>
                <select
                  value={newWorker.status}
                  onChange={(e) => setNewWorker({ ...newWorker, status: e.target.value })}
                >
                  {WORKER_STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>押金目标</label>
                <input
                  type="number"
                  step="0.01"
                  value={newWorker.deposit_target}
                  onChange={(e) => setNewWorker({ ...newWorker, deposit_target: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
                <button className="btn btn-outline" onClick={() => setShowAddWorker(false)}>取消</button>
                <button className="btn btn-primary" onClick={handleAddWorker}>确认</button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // Orders render
  const renderOrders = () => {
    const totalPages = Math.ceil(orderTotal / 10)

    const clearFilters = () => {
      setOrderFilter({ cs_name: '', status: '', date_from: '', date_to: '' })
      setOrderPage(1)
    }

    const hasFilters = orderFilter.cs_name || orderFilter.status || orderFilter.date_from || orderFilter.date_to

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* Filter bar */}
        <div style={{
          display: 'flex',
          gap: '16px',
          alignItems: 'flex-end',
          flexWrap: 'wrap',
          padding: '20px',
          background: 'var(--bg2)',
          borderRadius: '8px',
          border: '1px solid var(--rule)',
          position: 'relative',
          zIndex: 5,
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '140px' }}>
            <label style={{ fontSize: '0.85rem', color: 'var(--muted)', fontWeight: 500, cursor: 'pointer' }}>客服</label>
            <select
              value={orderFilter.cs_name}
              onChange={(e) => { setOrderFilter({ ...orderFilter, cs_name: e.target.value }); setOrderPage(1) }}
              style={{
                padding: '10px 12px',
                borderRadius: '6px',
                border: '1px solid var(--rule)',
                background: 'var(--bg)',
                color: 'var(--ink)',
                fontSize: '0.9rem',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              <option value="">全部客服</option>
              {csList.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '140px' }}>
            <label style={{ fontSize: '0.85rem', color: 'var(--muted)', fontWeight: 500 }}>状态</label>
            <select
              value={orderFilter.status}
              onChange={(e) => { setOrderFilter({ ...orderFilter, status: e.target.value }); setOrderPage(1) }}
              style={{
                padding: '10px 12px',
                borderRadius: '6px',
                border: '1px solid var(--rule)',
                background: 'var(--bg)',
                color: 'var(--ink)',
                fontSize: '0.9rem',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              <option value="">全部状态</option>
              {ORDER_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '160px' }}>
            <label style={{ fontSize: '0.85rem', color: 'var(--muted)', fontWeight: 500 }}>开始日期</label>
            <button
              type="button"
              onClick={() => {
                const input = document.getElementById('hidden-date-from')
                if (input) {
                  input.showPicker ? input.showPicker() : input.click()
                }
              }}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '6px',
                border: '1px solid var(--rule)',
                background: 'var(--bg)',
                color: orderFilter.date_from ? 'var(--ink)' : 'var(--muted)',
                fontSize: '0.9rem',
                cursor: 'pointer',
                textAlign: 'left',
                boxSizing: 'border-box',
              }}
            >
              {orderFilter.date_from || '选择日期'}
            </button>
            <input
              id="hidden-date-from"
              type="date"
              value={orderFilter.date_from}
              onChange={(e) => { setOrderFilter({ ...orderFilter, date_from: e.target.value }); setOrderPage(1) }}
              style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '160px' }}>
            <label style={{ fontSize: '0.85rem', color: 'var(--muted)', fontWeight: 500 }}>结束日期</label>
            <button
              type="button"
              onClick={() => {
                const input = document.getElementById('hidden-date-to')
                if (input) {
                  input.showPicker ? input.showPicker() : input.click()
                }
              }}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '6px',
                border: '1px solid var(--rule)',
                background: 'var(--bg)',
                color: orderFilter.date_to ? 'var(--ink)' : 'var(--muted)',
                fontSize: '0.9rem',
                cursor: 'pointer',
                textAlign: 'left',
                boxSizing: 'border-box',
              }}
            >
              {orderFilter.date_to || '选择日期'}
            </button>
            <input
              id="hidden-date-to"
              type="date"
              value={orderFilter.date_to}
              onChange={(e) => { setOrderFilter({ ...orderFilter, date_to: e.target.value }); setOrderPage(1) }}
              style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
            />
          </div>
          {hasFilters && (
            <button className="btn btn-outline btn-sm" onClick={clearFilters} style={{ padding: '10px 16px', height: '42px', fontSize: '0.9rem', position: 'relative', zIndex: 11 }}>
              清除筛选
            </button>
          )}
        </div>

        <div className="card no-hover">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ marginBottom: 0 }}>订单列表</h3>
            <button className="btn btn-primary btn-sm" onClick={openCreateModal}>
              添加订单
            </button>
          </div>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>流水号</th>
                  <th>客服</th>
                  <th>类型</th>
                  <th>客户</th>
                  <th>金额</th>
                  <th>状态</th>
                  <th>创建时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {orders.length > 0 ? orders.map((order) => (
                  <tr key={order.id}>
                    <td>{order.serial_no || '-'}</td>
                    <td>{order.cs_name}</td>
                    <td>{order.order_type}</td>
                    <td>{order.customer_name || '-'}</td>
                    <td>¥{formatMoney(order.price)}</td>
                    <td>
                      <select
                        value={order.status}
                        onChange={(e) => handleStatusChange(order.id, e.target.value)}
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
                          ...getOrderStatusStyle(order.status),
                        }}
                      >
                        {ORDER_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td>{formatDate(order.created_at)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button className="btn btn-outline btn-sm" disabled={order.status === '已结单'} onClick={() => openEditOrderModal(order)}>编辑</button>
                        <button className="btn btn-danger btn-sm" disabled={order.status === '已结单'} onClick={() => handleDeleteOrder(order.id)}>删除</button>
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan="8" style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px' }}>
                      暂无订单数据
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="pagination">
            <button
              disabled={orderPage === 1}
              onClick={() => setOrderPage(orderPage - 1)}
            >
              上一页
            </button>
            <span>第 {orderPage} / {totalPages || 1} 页</span>
            <button
              disabled={orderPage >= totalPages}
              onClick={() => setOrderPage(orderPage + 1)}
            >
              下一页
            </button>
          </div>
        </div>

        {/* Create Order Modal */}
        {createModal && (
          <div className="modal-overlay" onClick={closeCreateModal}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ width: '520px' }}>
              <div className="gradient-line" style={{ marginBottom: '20px' }} />
              <h3 style={{ marginBottom: '20px', fontSize: '1.2rem' }}>添加订单</h3>
              {createError && <div className="error-text">{createError}</div>}
              <form onSubmit={handleCreateSubmit}>
                <div className="form-group">
                  <label>客服</label>
                  {renderSearchableSelect(createForm.cs_name, (v) => setCreateForm({ ...createForm, cs_name: v }), csList, '请选择客服', 'cs')}
                </div>
                <div className="form-group">
                  <label>单子类型</label>
                  <input
                    type="text"
                    value={createForm.order_type}
                    onChange={(e) => setCreateForm({ ...createForm, order_type: e.target.value })}
                    placeholder="请输入单子类型"
                  />
                </div>
                <div className="form-group">
                  <label>客户名称</label>
                  <input
                    type="text"
                    value={createForm.customer_name}
                    onChange={(e) => setCreateForm({ ...createForm, customer_name: e.target.value })}
                    placeholder="请输入客户名称"
                  />
                </div>
                <div className="form-group">
                  <label>备注</label>
                  <textarea
                    value={createForm.remark}
                    onChange={(e) => setCreateForm({ ...createForm, remark: e.target.value })}
                    placeholder="请输入备注"
                    rows={3}
                  />
                </div>
                <div className="form-group">
                  <label>价格</label>
                  <input
                    type="number"
                    step="0.01"
                    value={createForm.price}
                    onChange={(e) => setCreateForm({ ...createForm, price: e.target.value })}
                    placeholder="请输入价格"
                  />
                </div>
                <div className="form-group">
                  <label>关联员工</label>
                  {createForm.workers.map((w, i) => (
                    <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
                      <div style={{ flex: 1 }}>
                        {renderSearchableSelect(w.name, (v) => updateCreateWorker(i, v), workerList, '请选择员工', `worker-${i}`)}
                      </div>
                      {createForm.workers.length > 1 && (
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => removeCreateWorker(i)}
                          style={{ padding: '6px 10px' }}
                        >
                          删除
                        </button>
                      )}
                    </div>
                  ))}
                  {createForm.workers.length < 2 && (
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={addCreateWorker}
                      style={{ marginTop: '8px' }}
                    >
                      + 添加员工
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
                  <button type="button" className="btn btn-outline" onClick={closeCreateModal}>取消</button>
                  <button type="submit" className="btn btn-primary" disabled={createSubmitting}>
                    {createSubmitting ? '提交中...' : '确认'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit Order Modal */}
        {editingOrder && (
          <div className="modal-overlay" onClick={closeEditOrderModal}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ width: '520px' }}>
              <div className="gradient-line" style={{ marginBottom: '20px' }} />
              <h3 style={{ marginBottom: '20px', fontSize: '1.2rem' }}>编辑订单</h3>
              {editOrderError && <div className="error-text">{editOrderError}</div>}
              <form onSubmit={handleEditOrderSubmit}>
                <div className="form-group">
                  <label>单子类型</label>
                  <input
                    type="text"
                    value={editOrderForm.order_type}
                    onChange={(e) => setEditOrderForm({ ...editOrderForm, order_type: e.target.value })}
                    placeholder="请输入单子类型"
                  />
                </div>
                <div className="form-group">
                  <label>客户名称</label>
                  <input
                    type="text"
                    value={editOrderForm.customer_name}
                    onChange={(e) => setEditOrderForm({ ...editOrderForm, customer_name: e.target.value })}
                    placeholder="请输入客户名称"
                  />
                </div>
                <div className="form-group">
                  <label>备注</label>
                  <textarea
                    value={editOrderForm.remark}
                    onChange={(e) => setEditOrderForm({ ...editOrderForm, remark: e.target.value })}
                    placeholder="请输入备注"
                    rows={3}
                  />
                </div>
                <div className="form-group">
                  <label>价格</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editOrderForm.price}
                    onChange={(e) => setEditOrderForm({ ...editOrderForm, price: e.target.value })}
                    placeholder="请输入价格"
                  />
                </div>
                <div className="form-group">
                  <label>关联员工</label>
                  {editOrderForm.workers.map((w, i) => (
                    <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
                      <div style={{ flex: 1 }}>
                        {renderSearchableSelect(w.name, (v) => updateEditOrderWorker(i, v), workerList, '请选择员工', `edit-worker-${i}`)}
                      </div>
                      {editOrderForm.workers.length > 1 && (
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => removeEditOrderWorker(i)}
                          style={{ padding: '6px 10px' }}
                        >
                          删除
                        </button>
                      )}
                    </div>
                  ))}
                  {editOrderForm.workers.length < 2 && (
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={addEditOrderWorker}
                      style={{ marginTop: '8px' }}
                    >
                      + 添加员工
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
                  <button type="button" className="btn btn-outline" onClick={closeEditOrderModal}>取消</button>
                  <button type="submit" className="btn btn-primary" disabled={editOrderSubmitting}>
                    {editOrderSubmitting ? '提交中...' : '保存'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="container" style={{ paddingTop: '16px' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '24px',
      }}>
        <h1 className="page-title">店长管理</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ color: 'var(--ink)', fontSize: '0.95rem' }}>
            {auth.displayName}
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

      {activeTab === '数据看板' && renderDashboard()}
      {activeTab === '员工录入' && renderWorkers()}
      {activeTab === '订单查看' && renderOrders()}
    </div>
  )
}
