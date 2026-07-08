import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { api } from '../api/client'
import { toast } from '../components/Toast'
import { confirm } from '../components/ConfirmDialog'

const PAGE_SIZE = 5
const VALID_STATUSES = ['接单中', '已结单', '存单', '退单']

function getStatusStyle(status) {
  switch (status) {
    case '接单中':
      return { background: 'rgba(6,182,212,0.12)', color: '#0891b2', border: '1px solid rgba(6,182,212,0.4)' }
    case '已结单':
      return { background: 'rgba(34,197,94,0.12)', color: '#16a34a', border: '1px solid rgba(34,197,94,0.4)' }
    case '存单':
      return { background: 'rgba(245,158,11,0.12)', color: '#d97706', border: '1px solid rgba(245,158,11,0.4)' }
    case '退单':
      return { background: 'rgba(239,68,68,0.12)', color: '#dc2626', border: '1px solid rgba(239,68,68,0.4)' }
    default:
      return { background: 'var(--bg)', color: 'var(--ink)', border: '1px solid var(--rule)' }
  }
}

function formatDate(d) {
  if (!d) return '-'
  return d.slice(0, 16).replace('T', ' ')
}

function formatMoney(v) {
  if (v == null) return '0'
  return Number(v).toFixed(2)
}

export default function CSPage() {
  const navigate = useNavigate()
  const auth = useAuth()

  const [workerList, setWorkerList] = useState([])

  const [orderTypeName, setOrderTypeName] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [price, setPrice] = useState('')
  const [remark, setRemark] = useState('')
  const [workers, setWorkers] = useState([{ name: '' }])
  const [formError, setFormError] = useState('')
  const [formSuccess, setFormSuccess] = useState('')
  const [formSubmitting, setFormSubmitting] = useState(false)

  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [statusFilter, setStatusFilter] = useState('')

  const [editingOrder, setEditingOrder] = useState(null)
  const [editForm, setEditForm] = useState({ order_type: '', customer_name: '', remark: '', price: '', workers: [] })
  const [editError, setEditError] = useState('')
  const [editSubmitting, setEditSubmitting] = useState(false)

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

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const workerRes = await api.get('/config/workers')
        setWorkerList(workerRes.data || [])
      } catch (err) {
        setError(err.message)
      }
    }
    loadConfig()
  }, [])

  const loadOrders = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      let path = `/orders?page=${page}&size=${PAGE_SIZE}`
      if (statusFilter) path += `&status=${encodeURIComponent(statusFilter)}`
      const res = await api.get(path)
      setOrders(res.data.list || [])
      setTotal(res.data.total || 0)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [page, statusFilter])

  useEffect(() => {
    loadOrders()
  }, [loadOrders])

  const activeWorkers = workerList.filter(w => w.status === '在店')

  const resetForm = () => {
    setOrderTypeName('')
    setCustomerName('')
    setPrice('')
    setRemark('')
    setWorkers([{ name: '' }])
    setFormError('')
  }

  const addWorker = () => {
    if (workers.length >= 2) return
    setWorkers([...workers, { name: '' }])
  }

  const removeWorker = (index) => {
    if (workers.length <= 1) return
    setWorkers(workers.filter((_, i) => i !== index))
  }

  const updateWorker = (index, value) => {
    const updated = workers.map((w, i) =>
      i === index ? { ...w, name: value } : w
    )
    setWorkers(updated)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setFormError('')
    setFormSuccess('')

    const numPrice = parseFloat(price)
    if (!orderTypeName.trim()) { setFormError('请输入单子类型'); return }
    if (isNaN(numPrice) || numPrice <= 0) { setFormError('单子价格必须大于0'); return }

    const workerNames = workers.map(w => w.name).filter(n => n.trim())
    if (workerNames.length < 1) { setFormError('至少需要关联1名员工'); return }
    if (workerNames.length !== workers.length) { setFormError('请为所有员工行选择员工'); return }
    if (new Set(workerNames).size !== workerNames.length) { setFormError('员工不能重复'); return }

    const validatedWorkers = workers.map(w => ({ name: w.name.trim() }))

    setFormSubmitting(true)
    try {
      await api.post('/orders', {
        order_type: orderTypeName.trim(),
        customer_name: customerName.trim(),
        price: numPrice,
        remark: remark.trim(),
        workers: validatedWorkers,
      })
      toast('订单创建成功', 'success')
      resetForm()
      setPage(1)
      await loadOrders()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setFormSubmitting(false)
    }
  }

  const handleStatusChange = async (orderId, newStatus) => {
    try {
      await api.put(`/orders/${orderId}/status`, { status: newStatus })
      toast('订单状态已更新', 'success')
      await loadOrders()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  const handleDelete = async (orderId) => {
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

  const openEditModal = (order) => {
    setEditingOrder(order)
    setEditForm({
      order_type: order.order_type || '',
      customer_name: order.customer_name || '',
      remark: order.remark || '',
      price: String(order.price || ''),
      workers: (order.workers || []).map(w => ({
        name: w.worker_name,
      })),
    })
    setEditError('')
  }

  const closeEditModal = () => {
    setEditingOrder(null)
    setEditError('')
  }

  const updateEditWorker = (index, value) => {
    const updated = editForm.workers.map((w, i) =>
      i === index ? { ...w, name: value } : w
    )
    setEditForm({ ...editForm, workers: updated })
  }

  const addEditWorker = () => {
    if (editForm.workers.length >= 2) return
    setEditForm({
      ...editForm,
      workers: [...editForm.workers, { name: '' }],
    })
  }

  const removeEditWorker = (index) => {
    if (editForm.workers.length <= 1) return
    setEditForm({
      ...editForm,
      workers: editForm.workers.filter((_, i) => i !== index),
    })
  }

  const handleEditSubmit = async (e) => {
    e.preventDefault()
    setEditError('')

    const numPrice = parseFloat(editForm.price)
    if (isNaN(numPrice) || numPrice <= 0) {
      setEditError('单子价格必须大于0')
      return
    }

    const workerNames = editForm.workers.map(w => w.name).filter(n => n.trim())
    if (workerNames.length < 1) {
      setEditError('至少需要关联1名员工')
      return
    }
    if (workerNames.length !== editForm.workers.length) {
      setEditError('请为所有员工行选择员工')
      return
    }
    if (new Set(workerNames).size !== workerNames.length) {
      setEditError('员工不能重复')
      return
    }

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
      toast('订单已更新', 'success')
      await loadOrders()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setEditSubmitting(false)
    }
  }

  const handleLogout = () => {
    auth.logout()
    navigate('/login')
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const getWorkerDisplay = (order, index) => {
    const ws = order.workers || []
    if (index < ws.length) {
      const w = ws[index]
      return `${w.worker_name} (${(w.deduction_rate * 100).toFixed(0)}%)`
    }
    return '-'
  }

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
            width: '100%',
            border: '1px solid var(--rule)',
            borderRadius: '4px',
            padding: '8px 12px',
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

  return (
    <div className="container" style={{ paddingTop: '16px' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '24px',
      }}>
        <h1 className="page-title">客服订单管理</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ color: 'var(--ink)', fontSize: '0.95rem' }}>
            {auth.displayName}
            <span style={{ color: 'var(--muted)', marginLeft: '6px', fontSize: '0.8rem' }}>({auth.username})</span>
          </span>
          <button className="btn btn-outline btn-sm" onClick={handleLogout}>
            退出登录
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '24px' }}>
        <h2 style={{ marginBottom: '4px' }}>创建订单</h2>
        <div className="gradient-line" />
        <form onSubmit={handleSubmit} style={{ marginTop: '8px' }}>
          <div className="form-row">
            <div className="form-group">
              <label>客服</label>
              <div style={{
                width: '100%',
                border: '1px solid var(--rule)',
                borderRadius: '4px',
                padding: '8px 12px',
                background: 'var(--bg2)',
                color: 'var(--text2)',
                fontSize: '0.9rem',
                boxSizing: 'border-box',
              }}>
                {auth.displayName}
              </div>
            </div>
            <div className="form-group">
              <label>单子类型</label>
              <input
                type="text"
                value={orderTypeName}
                onChange={(e) => setOrderTypeName(e.target.value)}
                placeholder="请输入单子类型"
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>客户名称</label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="请输入客户名称"
              />
            </div>
            <div className="form-group">
              <label>单子价格</label>
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="请输入价格"
                min="0"
                step="0.01"
                required
              />
            </div>
          </div>
          <div className="form-group">
            <label>备注</label>
            <textarea
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              placeholder="请输入备注信息"
              rows={2}
            />
          </div>

          <div style={{ marginBottom: '12px' }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '8px',
            }}>
              <label style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>关联员工</label>
              {workers.length < 2 && (
                <button type="button" className="btn btn-outline btn-sm" onClick={addWorker}>
                  + 添加员工
                </button>
              )}
            </div>
            {workers.map((w, i) => (
              <div key={i} className="form-row" style={{ marginBottom: '8px', alignItems: 'end' }}>
                <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
                  {renderSearchableSelect(w.name, (v) => updateWorker(i, v), activeWorkers, '请选择员工', `w-${i}`)}
                </div>
                <div>
                  {workers.length > 1 && (
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => removeWorker(i)}
                    >
                      删除
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {formError && (
            <div className="error-text" style={{ marginBottom: '12px' }}>{formError}</div>
          )}
          {formSuccess && (
            <div style={{ color: 'var(--success)', fontSize: '0.9rem', marginBottom: '12px' }}>{formSuccess}</div>
          )}

          <button type="submit" className="btn btn-primary" disabled={formSubmitting}>
            {formSubmitting ? '提交中...' : '创建订单'}
          </button>
        </form>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: '4px' }}>订单列表</h2>
        <div className="gradient-line" />

        <div className="tabs" style={{ marginTop: '8px' }}>
          {['', '接单中', '已结单', '存单', '退单'].map(s => (
            <button
              key={s}
              className={`tab ${statusFilter === s ? 'active' : ''}`}
              onClick={() => { setStatusFilter(s); setPage(1) }}
            >
              {s || '全部'}
            </button>
          ))}
        </div>

        {loading && (
          <div style={{ color: 'var(--muted)', fontSize: '0.9rem', marginBottom: '16px' }}>
            加载中...
          </div>
        )}

        {error && (
          <div className="error-text" style={{ marginBottom: '16px' }}>{error}</div>
        )}

        {!loading && orders.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px', color: 'var(--muted)' }}>
            暂无订单数据
          </div>
        )}

        {orders.length > 0 && (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>时间</th>
                    <th>流水号</th>
                    <th>客服</th>
                    <th>单子类型</th>
                    <th>总价</th>
                    <th>员工1</th>
                    <th>员工2</th>
                    <th>客户</th>
                    <th>备注</th>
                    <th>状态</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map(o => (
                    <tr key={o.id}>
                      <td>{formatDate(o.created_at)}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--accent)' }}>{o.serial_no || '-'}</td>
                      <td>{o.cs_name}</td>
                      <td>{o.order_type || '-'}</td>
                      <td>¥{formatMoney(o.price)}</td>
                      <td>{getWorkerDisplay(o, 0)}</td>
                      <td>{getWorkerDisplay(o, 1)}</td>
                      <td>{o.customer_name || '-'}</td>
                      <td style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {o.remark || '-'}
                      </td>
                      <td>
                        <select
                          className="status-select"
                          value={o.status}
                          onChange={(e) => handleStatusChange(o.id, e.target.value)}
                          style={{
                            borderRadius: '20px',
                            padding: '4px 12px',
                            fontSize: '0.8rem',
                            fontWeight: '600',
                            cursor: 'pointer',
                            outline: 'none',
                            appearance: 'none',
                            WebkitAppearance: 'none',
                            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23666'/%3E%3C/svg%3E")`,
                            backgroundRepeat: 'no-repeat',
                            backgroundPosition: 'right 8px center',
                            paddingRight: '24px',
                            ...getStatusStyle(o.status),
                          }}
                        >
                          {VALID_STATUSES.map(s => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button
                            className="btn btn-outline btn-sm"
                            onClick={() => openEditModal(o)}
                          >
                            编辑
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => handleDelete(o.id)}
                          >
                            删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="pagination">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  上一页
                </button>
                <span>{page} / {totalPages}</span>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                >
                  下一页
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {editingOrder && (
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
            width: '560px',
            maxWidth: '90vw',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: '32px',
          }}>
            <h2 style={{ marginBottom: '4px' }}>编辑订单</h2>
            <div className="gradient-line" />
            <form onSubmit={handleEditSubmit} style={{ marginTop: '8px' }}>
              <div className="form-group">
                <label>单子类型</label>
                <input
                  type="text"
                  value={editForm.order_type}
                  onChange={(e) => setEditForm({ ...editForm, order_type: e.target.value })}
                  placeholder="请输入单子类型"
                />
              </div>
              <div className="form-group">
                <label>客户名称</label>
                <input
                  type="text"
                  value={editForm.customer_name}
                  onChange={(e) => setEditForm({ ...editForm, customer_name: e.target.value })}
                  placeholder="请输入客户名称"
                />
              </div>
              <div className="form-group">
                <label>单子价格</label>
                <input
                  type="number"
                  value={editForm.price}
                  onChange={(e) => setEditForm({ ...editForm, price: e.target.value })}
                  placeholder="请输入价格"
                  min="0"
                  step="0.01"
                  required
                />
              </div>
              <div className="form-group">
                <label>备注</label>
                <textarea
                  value={editForm.remark}
                  onChange={(e) => setEditForm({ ...editForm, remark: e.target.value })}
                  placeholder="请输入备注信息"
                  rows={2}
                />
              </div>

              <div style={{ marginBottom: '12px' }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '8px',
                }}>
                  <label style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>关联员工</label>
                  {editForm.workers.length < 2 && (
                    <button type="button" className="btn btn-outline btn-sm" onClick={addEditWorker}>
                      + 添加员工
                    </button>
                  )}
                </div>
                {editForm.workers.map((w, i) => (
                  <div key={i} className="form-row" style={{ marginBottom: '8px', alignItems: 'end' }}>
                    <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
                      {renderSearchableSelect(w.name, (v) => updateEditWorker(i, v), activeWorkers, '请选择员工', `ew-${i}`)}
                    </div>
                    <div>
                      {editForm.workers.length > 1 && (
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => removeEditWorker(i)}
                        >
                          删除
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {editError && (
                <div className="error-text" style={{ marginBottom: '12px' }}>{editError}</div>
              )}

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-outline" onClick={closeEditModal}>
                  取消
                </button>
                <button type="submit" className="btn btn-primary" disabled={editSubmitting}>
                  {editSubmitting ? '保存中...' : '保存'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
