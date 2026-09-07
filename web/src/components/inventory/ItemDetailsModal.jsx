import React, { useEffect } from 'react';
import { X, Sparkles, Package, Info, Terminal, Check } from 'lucide-react';

export function ItemDetailsModal({ item, onClose }) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!item) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.5rem' }}>{item.emoji}</span>
            <div>
              <h3 style={{ fontSize: '1.1rem', lineHeight: 1.2 }}>{item.name}</h3>
              <span style={{ fontSize: '0.75rem', color: item.rarity?.color || '#94a3b8', fontWeight: 600 }}>
                {item.rarity?.name || 'Обычный'}
              </span>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="btn btn-secondary btn-sm"
            style={{ padding: '4px 8px' }}
            title="Закрыть (Esc)"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="modal-body">
          {/* Key Facts */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
            <div style={{ padding: '10px 12px', background: 'var(--bg-surface)', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase', display: 'block' }}>
                Количество
              </span>
              <strong className="font-mono" style={{ fontSize: '1.1rem', color: 'var(--text-main)' }}>
                {item.quantity} шт.
              </strong>
            </div>

            <div style={{ padding: '10px 12px', background: 'var(--bg-surface)', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase', display: 'block' }}>
                Категория
              </span>
              <strong style={{ fontSize: '0.9rem', color: 'var(--text-main)' }}>
                {item.kind === 'ap' ? 'Том AP' : item.kind === 'sp' ? 'Свиток SP' : 'Коллекционное'}
              </strong>
            </div>
          </div>

          {/* Effect Box */}
          <div style={{
            padding: '12px 14px',
            borderRadius: '8px',
            background: 'var(--accent-purple-glow)',
            border: '1px solid rgba(139, 92, 246, 0.35)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            <Sparkles size={18} color="#c4b5fd" style={{ flexShrink: 0 }} />
            <div>
              <span style={{ fontSize: '0.72rem', color: '#c4b5fd', textTransform: 'uppercase', display: 'block', fontWeight: 700 }}>
                Эффект предмета
              </span>
              <strong style={{ fontSize: '0.95rem', color: '#ffffff' }}>
                {item.total_effect_summary || item.effect_text || 'Не расходуется'}
              </strong>
            </div>
          </div>

          {/* Description */}
          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
              Описание
            </span>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              {item.description || 'Предмет инвентаря персонажа.'}
            </p>
          </div>

          {/* Discord Usage Instructions */}
          <div style={{
            padding: '10px 12px',
            borderRadius: '8px',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            fontSize: '0.8rem',
            color: 'var(--text-dim)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <Terminal size={15} color="#8b5cf6" style={{ flexShrink: 0 }} />
            <span>
              {item.usable 
                ? 'Используется в Discord-боте через команду /use' 
                : 'Сюжетный предмет без автоматического расходования'}
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button onClick={onClose} className="btn btn-secondary btn-sm">
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}
