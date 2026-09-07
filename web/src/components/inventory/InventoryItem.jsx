import React from 'react';
import { Sparkles, Info } from 'lucide-react';

export function InventoryItem({ item, viewMode = 'grid', onSelect }) {
  const rarityColor = item.rarity?.color || '#94a3b8';

  if (viewMode === 'list') {
    return (
      <div 
        className="inventory-item-row"
        onClick={() => onSelect(item)}
        style={{ borderLeft: `3px solid ${rarityColor}` }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '1.4rem' }}>{item.emoji}</span>
          <div>
            <h4 style={{ fontSize: '0.95rem', fontWeight: 600 }}>{item.name}</h4>
            <span style={{ fontSize: '0.72rem', color: rarityColor, fontWeight: 600 }}>
              {item.rarity?.name || 'Обычный'}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{
            fontSize: '0.8rem',
            color: item.usable ? '#c4b5fd' : 'var(--text-dim)',
            fontWeight: 500,
            background: 'var(--bg-surface-elevated)',
            padding: '3px 8px',
            borderRadius: '4px'
          }}>
            {item.total_effect_summary || item.effect_text}
          </span>
          <span className="badge font-mono" style={{ fontSize: '0.85rem' }}>
            ×{item.quantity}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="inventory-item-card"
      onClick={() => onSelect(item)}
      style={{ borderLeft: `3px solid ${rarityColor}` }}
    >
      <div>
        {/* Top Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '1.5rem' }}>{item.emoji}</span>
            <div>
              <h4 style={{ fontSize: '0.98rem', fontWeight: 700, lineHeight: 1.2 }}>{item.name}</h4>
              <span style={{ fontSize: '0.72rem', color: rarityColor, fontWeight: 600 }}>
                {item.rarity?.name || 'Обычный'}
              </span>
            </div>
          </div>
          <span className="badge font-mono" style={{ fontSize: '0.85rem' }}>
            ×{item.quantity}
          </span>
        </div>

        {/* Effect Summary */}
        <div style={{
          padding: '6px 8px',
          borderRadius: '6px',
          background: 'var(--bg-surface-elevated)',
          border: '1px solid var(--border-subtle)',
          fontSize: '0.78rem',
          fontWeight: 600,
          color: item.usable ? '#c4b5fd' : 'var(--text-dim)',
          marginBottom: '10px'
        }}>
          {item.total_effect_summary || item.effect_text}
        </div>

        {/* Short Description */}
        <p style={{
          fontSize: '0.8rem',
          color: 'var(--text-muted)',
          lineHeight: 1.4,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden'
        }}>
          {item.description}
        </p>
      </div>

      <div style={{
        marginTop: '12px',
        paddingTop: '8px',
        borderTop: '1px solid var(--border-subtle)',
        fontSize: '0.72rem',
        color: 'var(--text-dim)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <span>{item.usable ? 'Расходник' : 'Коллекционное'}</span>
        <span style={{ color: 'var(--accent-purple)', fontWeight: 600 }}>Подробнее →</span>
      </div>
    </div>
  );
}
