import { useState, useEffect, useCallback } from 'react'

let confirmResolver = null

export function confirm(message, title = '确认操作') {
  return new Promise((resolve) => {
    confirmResolver = { message, title, resolve }
    // Dispatch custom event to trigger re-render
    window.dispatchEvent(new CustomEvent('show-confirm'))
  })
}

export function ConfirmDialog() {
  const [state, setState] = useState(null)

  const handleShow = useCallback(() => {
    if (confirmResolver) {
      setState(confirmResolver)
      confirmResolver = null
    }
  }, [])

  useEffect(() => {
    window.addEventListener('show-confirm', handleShow)
    return () => window.removeEventListener('show-confirm', handleShow)
  }, [handleShow])

  const handleConfirm = () => {
    state?.resolve(true)
    setState(null)
  }

  const handleCancel = () => {
    state?.resolve(false)
    setState(null)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') handleCancel()
    if (e.key === 'Enter') handleConfirm()
  }

  if (!state) return null

  return (
    <div className="modal-overlay" onClick={handleCancel} onKeyDown={handleKeyDown}>
      <div className="modal-content" style={{ width: '400px' }} onClick={e => e.stopPropagation()}>
        <h3 style={{ marginBottom: '12px', fontSize: '1.1rem' }}>{state.title}</h3>
        <div className="gradient-line" />
        <p style={{ color: 'var(--ink)', fontSize: '0.95rem', marginBottom: '20px', lineHeight: 1.6 }}>
          {state.message}
        </p>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button className="btn btn-outline btn-sm" onClick={handleCancel}>取消</button>
          <button className="btn btn-danger btn-sm" onClick={handleConfirm}>确定</button>
        </div>
      </div>
    </div>
  )
}
