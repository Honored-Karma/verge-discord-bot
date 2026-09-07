import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(({ message, title, type = 'info', duration = 4500 }) => {
    const id = Date.now().toString() + Math.random().toString(36).substring(2, 6);
    const newToast = { id, message, title, type };

    setToasts((prev) => [...prev, newToast]);

    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }

    return id;
  }, [removeToast]);

  const showSuccess = useCallback((message, title = 'Успешно') => {
    return addToast({ message, title, type: 'success' });
  }, [addToast]);

  const showError = useCallback((message, title = 'Ошибка') => {
    return addToast({ message, title, type: 'error' });
  }, [addToast]);

  const showWarning = useCallback((message, title = 'Внимание') => {
    return addToast({ message, title, type: 'warning' });
  }, [addToast]);

  const showInfo = useCallback((message, title = 'Информация') => {
    return addToast({ message, title, type: 'info' });
  }, [addToast]);

  return (
    <ToastContext.Provider value={{ addToast, removeToast, showSuccess, showError, showWarning, showInfo }}>
      {children}
      <div 
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 99999,
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          maxWidth: '420px',
          width: 'calc(100vw - 48px)',
          pointerEvents: 'none'
        }}
      >
        {toasts.map((toast) => {
          let borderColor = 'var(--accent-purple)';
          let bgGlow = 'rgba(139, 92, 246, 0.15)';
          let icon = <Info size={20} color="#c4b5fd" />;

          if (toast.type === 'success') {
            borderColor = '#10b981';
            bgGlow = 'rgba(16, 185, 129, 0.18)';
            icon = <CheckCircle2 size={20} color="#6ee7b7" />;
          } else if (toast.type === 'error') {
            borderColor = '#ef4444';
            bgGlow = 'rgba(239, 68, 68, 0.2)';
            icon = <AlertCircle size={20} color="#fca5a5" />;
          } else if (toast.type === 'warning') {
            borderColor = '#f59e0b';
            bgGlow = 'rgba(245, 158, 11, 0.18)';
            icon = <AlertTriangle size={20} color="#fde68a" />;
          }

          return (
            <div
              key={toast.id}
              style={{
                pointerEvents: 'auto',
                background: 'rgba(15, 18, 29, 0.95)',
                backdropFilter: 'blur(12px)',
                border: `1px solid ${borderColor}`,
                borderLeft: `5px solid ${borderColor}`,
                boxShadow: `0 8px 30px rgba(0, 0, 0, 0.6), 0 0 15px ${bgGlow}`,
                borderRadius: '12px',
                padding: '14px 16px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px',
                animation: 'slideInToast 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                transition: 'all 0.2s ease'
              }}
            >
              <div style={{ marginTop: '2px', flexShrink: 0 }}>
                {icon}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                {toast.title && (
                  <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#ffffff', marginBottom: '2px' }}>
                    {toast.title}
                  </div>
                )}
                <div style={{ fontSize: '0.84rem', color: 'var(--text-muted)', lineHeight: 1.5, wordBreak: 'break-word' }}>
                  {toast.message}
                </div>
              </div>

              <button
                onClick={() => removeToast(toast.id)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-dim)',
                  cursor: 'pointer',
                  padding: '4px',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginLeft: '4px',
                  flexShrink: 0
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#ffffff'; e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-dim)'; e.currentTarget.style.background = 'transparent'; }}
              >
                <X size={15} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
