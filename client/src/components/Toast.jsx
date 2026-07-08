import { useState, useEffect } from 'react'

let toastId = 0
let addToastFn = null

export function toast(message, type = 'info', duration = 3000) {
  if (addToastFn) {
    addToastFn(message, type, duration)
  }
}

export function ToastContainer() {
  const [toasts, setToasts] = useState([])

  useEffect(() => {
    addToastFn = (message, type, duration) => {
      const id = ++toastId
      setToasts(prev => [...prev, { id, message, type, duration }])
      
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id))
      }, duration)
    }
    
    return () => {
      addToastFn = null
    }
  }, [])

  const removeToast = (id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  const getIcon = (type) => {
    switch (type) {
      case 'success': return '✓'
      case 'error': return '✕'
      case 'warning': return '⚠'
      default: return 'ℹ'
    }
  }

  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          <span className="toast-icon">{getIcon(t.type)}</span>
          <span>{t.message}</span>
          <button className="toast-close" onClick={() => removeToast(t.id)}>×</button>
        </div>
      ))}
    </div>
  )
}
