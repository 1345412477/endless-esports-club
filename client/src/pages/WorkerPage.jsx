import { useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { toast } from '../components/Toast'
import Logo from '../components/Logo'
import { Icon } from '../components/Icon'
import { formatDate, formatMoney } from '../utils/helpers'

const PAGE_SIZE = 8

const SORT_OPTIONS = [
  { value: 'date_desc', label: '时间 新→旧' },
  { value: 'date_asc', label: '时间 旧→新' },
  { value: 'price_desc', label: '金额 高→低' },
  { value: 'price_asc', label: '金额 低→高' },
  { value: 'salary_desc', label: '工资 高→低' },
  { value: 'salary_asc', label: '工资 低→高' },
]

export default function WorkerPage() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [result, setResult] = useState(null)
  const [type, setType] = useState(null)
  const [summary, setSummary] = useState(null)
  const [filteredSummary, setFilteredSummary] = useState(null)
  const [orders, setOrders] = useState([])
  const [settlements, setSettlements] = useState([])
  const [months, setMonths] = useState([])
  const [total, setTotal] = useState(0)
  const [searched, setSearched] = useState(false)

  const [month, setMonth] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('date_desc')
  const [page, setPage] = useState(1)

  const [settlementPage, setSettlementPage] = useState(1)
  const [payslipOpen, setPayslipOpen] = useState(false)
  const [payslipLoading, setPayslipLoading] = useState(false)
  const [payslipData, setPayslipData] = useState(null)
  const [savingPdf, setSavingPdf] = useState(false)
  const payslipRef = useRef(null)

  const loadOrders = useCallback(async (p, opts = {}) => {
    if (!result || !name.trim()) return
    setLoading(true)
    setError('')
    try {
      const m = opts.month !== undefined ? opts.month : month
      const s = opts.search !== undefined ? opts.search : search
      const so = opts.sort !== undefined ? opts.sort : sort
      const params = new URLSearchParams({ name: name.trim(), page: p, size: PAGE_SIZE })
      if (m) params.append('month', m)
      if (s) params.append('search', s)
      if (so) params.append('sort', so)
      const endpoint = type === 'worker' ? '/query/worker' : '/query/cs'
      const res = await api.get(`${endpoint}?${params.toString()}`)
      setOrders(res.data.orders || [])
      setTotal(res.data.total || 0)
      setMonths(res.data.months || [])
      setFilteredSummary(res.data.filtered_summary || null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [result, name, type, month, search, sort])

  const handleSearch = async (e) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return

    setError('')
    setLoading(true)
    setResult(null)
    setType(null)
    setSummary(null)
    setFilteredSummary(null)
    setOrders([])
    setSettlements([])
    setTotal(0)
    setMonths([])
    setPage(1)
    setSettlementPage(1)
    setSearched(true)
    setMonth('')
    setSearch('')
    setSearchInput('')
    setSort('date_desc')

    try {
      const base = `name=${encodeURIComponent(trimmed)}&page=1&size=${PAGE_SIZE}&sort=date_desc`
      const [workerRes, csRes] = await Promise.all([
        api.get(`/query/worker?${base}`),
        api.get(`/query/cs?${base}`),
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
        setMonths(wData.months || [])
        setFilteredSummary(wData.filtered_summary || null)
      } else if (cData.type === 'cs') {
        setResult(cData)
        setType('cs')
        setSummary(cData.summary)
        setOrders(cData.orders || [])
        setSettlements(cData.settlements || [])
        setTotal(cData.total || 0)
        setMonths(cData.months || [])
        setFilteredSummary(cData.filtered_summary || null)
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

  const handleMonthChange = (v) => {
    setMonth(v)
    setPage(1)
    loadOrders(1, { month: v, search, sort })
  }

  const handleSortChange = (v) => {
    setSort(v)
    setPage(1)
    loadOrders(1, { month, search, sort: v })
  }

  const handleApplySearch = () => {
    const s = searchInput.trim()
    setSearch(s)
    setPage(1)
    loadOrders(1, { month, search: s, sort })
  }

  const handlePageChange = (p) => {
    setPage(p)
    loadOrders(p)
  }

  const openPayslip = async () => {
    if (!result) return
    setPayslipOpen(true)
    setPayslipLoading(true)
    setPayslipData(null)
    try {
      const params = new URLSearchParams({ name: name.trim(), page: 1, size: 1000 })
      if (month) params.append('month', month)
      if (search) params.append('search', search)
      const endpoint = type === 'worker' ? '/query/worker' : '/query/cs'
      const res = await api.get(`${endpoint}?${params.toString()}`)
      setPayslipData({
        type,
        orders: res.data.orders || [],
        summary: res.data.summary,
        filtered: res.data.filtered_summary,
      })
    } catch (err) {
      toast(err.message, 'error')
      setPayslipOpen(false)
    } finally {
      setPayslipLoading(false)
    }
  }

  const savePayslipPdf = async () => {
    const el = payslipRef.current
    if (!el || !payslipData) return
    setSavingPdf(true)
    try {
      const html2pdf = (await import('html2pdf.js')).default
      const opt = {
        margin: [10, 10, 10, 10],
        filename: `工资单_${name.trim()}_${month || '全部'}.pdf`,
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
      }
      await html2pdf().set(opt).from(el).save()
      toast('工资单已保存为 PDF', 'success')
    } catch (err) {
      toast(`PDF 生成失败：${err.message || '未知错误'}`, 'error')
    } finally {
      setSavingPdf(false)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const settlementTotalPages = Math.max(1, Math.ceil(settlements.length / PAGE_SIZE))
  const periodLabel = month ? `${month} 月` : '全部月份'
  const isWorker = type === 'worker'

  const monthCard = month
    ? { value: `¥${formatMoney(filteredSummary?.salary)}`, sub: `${filteredSummary?.count || 0} 单（筛选结果）` }
    : isWorker
      ? { value: String(summary?.month_count || 0), sub: '本月完成（单）' }
      : { value: `¥${formatMoney(summary?.month_salary)}`, sub: '本月提成' }

  const getAvatarLetter = () => {
    if (!name.trim()) return '?'
    return name.trim().charAt(0).toUpperCase()
  }

  const statCards = isWorker ? [
    { label: '累计工资', value: `¥${formatMoney(summary?.total_salary)}`, sub: '含押金、含推荐提成', color: 'accent' },
    { label: '已结算', value: `¥${formatMoney(summary?.settled_total)}`, sub: '已发放', color: 'success' },
    { label: '未结算', value: `¥${formatMoney(summary?.unsettled)}`, sub: '待发放', color: 'warning' },
    { label: '推荐提成', value: `¥${formatMoney(summary?.referrer_commission)}`, sub: '累计推荐奖励', color: 'pink' },
    { label: month ? '筛选工资' : '本月', value: monthCard.value, sub: monthCard.sub, color: 'plain' },
  ] : [
    { label: '累计提成', value: `¥${formatMoney(summary?.total_salary)}`, sub: '含推荐提成', color: 'accent' },
    { label: '已结算', value: `¥${formatMoney(summary?.settled_total)}`, sub: '已发放', color: 'success' },
    { label: '未结算', value: `¥${formatMoney(summary?.unsettled)}`, sub: '待发放', color: 'warning' },
    { label: '推荐提成', value: `¥${formatMoney(summary?.referrer_commission)}`, sub: '累计推荐奖励', color: 'pink' },
    { label: month ? '筛选提成' : '本月提成', value: monthCard.value, sub: monthCard.sub, color: 'plain' },
  ]

  const statColor = (c) => {
    if (c === 'success') return 'var(--success)'
    if (c === 'warning') return 'var(--warning)'
    if (c === 'pink') return 'var(--accent)'
    return 'inherit'
  }

  const renderStats = () => (
    <div className="home-stats-grid">
      {statCards.map((s, i) => (
        <div className="home-stat" key={i}>
          <div className="home-stat-label">{s.label}</div>
          <div className="home-stat-value" style={{ color: statColor(s.color) }}>{s.value}</div>
          <div className="home-stat-sub">{s.sub}</div>
        </div>
      ))}
    </div>
  )

  return (
    <div className="home-page">
      {/* 顶部品牌条 */}
      <header className="home-topbar">
        <div className="home-brand">
          <Logo size="small" />
          <div>
            <div className="home-brand-title">无尽电竞业务系统</div>
            <div className="home-brand-sub">WJGame · 员工工资查询平台</div>
          </div>
        </div>
        <button className="btn btn-outline btn-sm home-admin-btn" onClick={() => navigate('/login')}>
          <Icon.Settings size={16} />
          管理后台
        </button>
      </header>

      {/* 顶部英雄区：动态封面 */}
      <section className="home-hero" style={{ backgroundImage: 'url(/cover-poster.jpg)' }}>
        <video
          className="home-hero-video"
          src="/cover.mp4"
          poster="/cover-poster.jpg"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
        />
        <div className="home-hero-overlay" />
        <span className="home-hud-corner tl" />
        <span className="home-hud-corner tr" />
        <span className="home-hud-corner bl" />
        <span className="home-hud-corner br" />
        <div className="home-hero-content">
          <div className="home-hero-logo"><Logo size="large" /></div>
          <h1 className="home-hero-title">无尽电竞业务系统</h1>
          <p className="home-hero-subtitle">WJGame · 工资查询平台</p>
          <div className="home-hero-divider" />
          <form className="home-search" onSubmit={handleSearch}>
            <div className="home-search-box">
              <Icon.Search size={20} className="home-search-icon" />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="输入员工 / 客服姓名查询..."
                autoFocus
              />
              <button type="submit" className="btn btn-primary home-search-btn" disabled={loading}>
                {loading ? '查询中...' : '查询'}
              </button>
            </div>
          </form>
          <p className="home-hint">
            <Icon.Info size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
            提示：请输入完整姓名，如「张三」
          </p>
        </div>
      </section>

      <main className="home-main">
        {error && <div className="home-notice error">{error}</div>}

        {searched && !loading && type === null && !error && (
          <div className="home-empty-card">
            <Icon.AlertCircle size={44} />
            <p>未找到该人员信息</p>
            <span>请确认姓名是否输入正确，或联系管理员</span>
          </div>
        )}

        {!searched && !loading && (
          <div className="home-features">
            <div className="home-feature">
              <div className="home-feature-icon"><Icon.Wallet size={36} strokeWidth={1.5} /></div>
              <h3>工资查询</h3>
              <p>查看累计工资、已结算和未结算金额</p>
            </div>
            <div className="home-feature">
              <div className="home-feature-icon"><Icon.FileText size={36} strokeWidth={1.5} /></div>
              <h3>订单记录</h3>
              <p>按月筛选、搜索并排序历史完成订单</p>
            </div>
            <div className="home-feature">
              <div className="home-feature-icon"><Icon.Printer size={36} strokeWidth={1.5} /></div>
              <h3>工资单打印</h3>
              <p>一键打印或保存工资明细 PDF</p>
            </div>
          </div>
        )}

        {loading && <div className="home-loading">数据加载中...</div>}

        {type && summary && (
          <>
            {/* 人员档案 */}
            <section className="home-panel">
              <div className="home-profile">
                <div className="home-avatar">{getAvatarLetter()}</div>
                <div className="home-profile-meta">
                  <h2>{name.trim()}</h2>
                  <div className="home-profile-tags">
                    <span className={`home-tag ${isWorker ? 'worker' : 'cs'}`}>{isWorker ? '员工' : '客服'}</span>
                    {isWorker && result.worker?.rating && <span className="home-tag rating">评级：{result.worker.rating}</span>}
                    {isWorker && result.worker && (
                      <span className={`home-tag status ${result.worker.status === '在店' ? 'on' : 'off'}`}>
                        {result.worker.status || '在店'}
                      </span>
                    )}
                    {isWorker && result.worker?.deposit_target > 0 && (
                      <span className="home-tag deposit">
                        押金 ¥{formatMoney(result.worker.deposit)} / ¥{formatMoney(result.worker.deposit_target)}
                        <span className="home-deposit-bar">
                          <span style={{ width: `${Math.min(100, (result.worker.deposit / result.worker.deposit_target) * 100)}%` }} />
                        </span>
                      </span>
                    )}
                  </div>
                </div>
                <div className="home-profile-actions">
                  <button className="btn btn-primary btn-sm" onClick={openPayslip}>
                    <Icon.Printer size={15} /> 保存为工资单
                  </button>
                </div>
              </div>
            </section>

            {/* 工资总览 */}
            <section className="home-panel">
              <div className="home-panel-head">
                <h3 className="home-panel-title">工资总览</h3>
                <span className="home-panel-period">{periodLabel}</span>
              </div>
              {renderStats()}
            </section>

            {/* 工资明细 */}
            <section className="home-panel">
              <div className="home-panel-head">
                <h3 className="home-panel-title">工资明细</h3>
                <div className="home-toolbar">
                  <select value={month} onChange={(e) => handleMonthChange(e.target.value)}>
                    <option value="">全部月份</option>
                    {months.map((m) => <option key={m} value={m}>{m} 月</option>)}
                  </select>
                  <div className="home-toolbar-search">
                    <input
                      type="text"
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleApplySearch() } }}
                      placeholder="搜索类型 / 客户 / 客服"
                    />
                    <button type="button" onClick={handleApplySearch}>筛选</button>
                  </div>
                  <select value={sort} onChange={(e) => handleSortChange(e.target.value)}>
                    {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="home-table-wrap">
                <table className="home-table">
                  <thead>
                    <tr>
                      <th>时间</th>
                      <th>收入类型</th>
                      <th>单子类型</th>
                      <th>客户</th>
                      <th>客服</th>
                      <th>单子价格</th>
                      <th>{isWorker ? '工资金额' : '提成金额'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.length === 0 ? (
                      <tr><td colSpan="7" className="home-table-empty">暂无符合条件的订单</td></tr>
                    ) : orders.map((o) => (
                      <tr key={`${o.id}-${o.is_referrer ? 'ref' : 'order'}`} className={o.is_referrer ? 'referrer-row' : ''}>
                        <td>{formatDate(o.created_at)}</td>
                        <td>
                          {o.is_referrer ? (
                            <span className="home-tag referrer">推荐提成</span>
                          ) : (
                            <span className="home-tag order">{isWorker ? '接单工资' : '客服提成'}</span>
                          )}
                        </td>
                        <td>{o.order_type || '-'}</td>
                        <td>{o.customer_name || '-'}</td>
                        <td>{o.cs_name || '-'}</td>
                        <td>¥{formatMoney(o.price)}</td>
                        <td className="home-salary-cell">¥{formatMoney(o.salary)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="home-pagination">
                  <button disabled={page <= 1} onClick={() => handlePageChange(page - 1)}>上一页</button>
                  <span>{page} / {totalPages}（共 {total} 单）</span>
                  <button disabled={page >= totalPages} onClick={() => handlePageChange(page + 1)}>下一页</button>
                </div>
              )}
            </section>

            {/* 结算记录 */}
            <section className="home-panel">
              <div className="home-panel-head">
                <h3 className="home-panel-title">结算记录</h3>
              </div>
              {settlements.length > 0 ? (
                <>
                  <div className="home-table-wrap">
                    <table className="home-table">
                      <thead>
                        <tr>
                          <th>结算时间</th>
                          <th>结算金额</th>
                          <th>操作人</th>
                          <th>备注</th>
                        </tr>
                      </thead>
                      <tbody>
                        {settlements.slice((settlementPage - 1) * PAGE_SIZE, settlementPage * PAGE_SIZE).map((s, i) => (
                          <tr key={i}>
                            <td>{formatDate(s.settled_at)}</td>
                            <td className="home-salary-cell">¥{formatMoney(s.settled_amount)}</td>
                            <td>{s.settled_by || '-'}</td>
                            <td>{s.remark || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {settlementTotalPages > 1 && (
                    <div className="home-pagination">
                      <button disabled={settlementPage <= 1} onClick={() => setSettlementPage(settlementPage - 1)}>上一页</button>
                      <span>{settlementPage} / {settlementTotalPages}</span>
                      <button disabled={settlementPage >= settlementTotalPages} onClick={() => setSettlementPage(settlementPage + 1)}>下一页</button>
                    </div>
                  )}
                </>
              ) : (
                <div className="home-table-empty">暂无结算记录</div>
              )}
            </section>
          </>
        )}
      </main>

      <footer className="home-footer">
        <span>© 2026 无尽电竞 WJGame</span>
        <span>|</span>
        <span>技术支持：IT部门</span>
        <p>如有疑问，请联系管理员</p>
      </footer>

      {/* 工资单弹窗 */}
      {payslipOpen && (
        <div className="home-modal-overlay" onClick={() => setPayslipOpen(false)}>
          <div className="home-modal" onClick={(e) => e.stopPropagation()}>
            <div className="payslip-print" ref={payslipRef}>
              <div className="payslip-head">
                <div className="payslip-brand">
                  <Logo size="small" />
                  <div>
                    <h2>无尽电竞业务系统 · 工资单</h2>
                    <p>{name.trim()}（{isWorker ? '员工' : '客服'}）· {periodLabel} · 打印时间 {new Date().toLocaleString('zh-CN')}</p>
                  </div>
                </div>
                <div className="gradient-line" />
              </div>

              {payslipLoading ? (
                <div className="home-loading">工资单生成中...</div>
              ) : payslipData ? (
                <>
                  <div className="payslip-stats">
                    <div><span>累计{isWorker ? '工资' : '提成'}</span><b>¥{formatMoney(payslipData.summary.total_salary)}</b></div>
                    <div><span>已结算</span><b>¥{formatMoney(payslipData.summary.settled_total)}</b></div>
                    <div><span>未结算</span><b>¥{formatMoney(payslipData.summary.unsettled)}</b></div>
                    <div><span>本期{isWorker ? '工资' : '提成'}</span><b>¥{formatMoney(payslipData.filtered?.salary)}</b></div>
                    <div><span>本期单数</span><b>{payslipData.filtered?.count || 0}</b></div>
                  </div>
                  <table className="payslip-table">
                    <thead>
                      <tr>
                        <th>时间</th>
                        <th>收入类型</th>
                        <th>类型</th>
                        <th>客户</th>
                        <th>客服</th>
                        <th>金额</th>
                        <th>{isWorker ? '工资' : '提成'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payslipData.orders.length === 0 ? (
                        <tr><td colSpan="7" style={{ textAlign: 'center', padding: '24px' }}>本期暂无订单</td></tr>
                      ) : payslipData.orders.map((o) => (
                        <tr key={`${o.id}-${o.is_referrer ? 'ref' : 'order'}`} style={o.is_referrer ? { backgroundColor: 'rgba(236, 72, 153, 0.05)' } : {}}>
                          <td>{formatDate(o.created_at)}</td>
                          <td>{o.is_referrer ? '推荐提成' : (isWorker ? '接单工资' : '客服提成')}</td>
                          <td>{o.order_type || '-'}</td>
                          <td>{o.customer_name || '-'}</td>
                          <td>{o.cs_name || '-'}</td>
                          <td>¥{formatMoney(o.price)}</td>
                          <td>¥{formatMoney(o.salary)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="payslip-foot">本工资单仅供工资核对使用，如有疑问请联系管理员。</p>
                </>
              ) : null}
            </div>
            <div className="home-modal-actions">
              <button className="btn btn-outline btn-sm" onClick={() => setPayslipOpen(false)}>关闭</button>
              <button className="btn btn-primary btn-sm" onClick={savePayslipPdf} disabled={payslipLoading || savingPdf}>
                <Icon.Printer size={15} /> {savingPdf ? '生成中...' : '保存为 PDF'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
