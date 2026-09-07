import React from 'react';
import { ShieldCheck, ShieldAlert, Activity, Zap } from 'lucide-react';
import { RpgDiamondBadge } from '../common/RpgDiamondBadge';

export function PhysicalStats({ stats }) {
  const pStats = stats || {};

  return (
    <div className="card-bezel card-bezel-cyan">
      <div className="card-inner" style={{ padding: '24px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <RpgDiamondBadge type="strength" color="cyan" size={32} />
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Физические показатели</h3>
          </div>
          
          {pStats.is_registered ? (
            <span className="badge badge-emerald">
              <ShieldCheck size={13} />
              Утверждено стаффом
            </span>
          ) : (
            <span className="badge badge-amber">
              <ShieldAlert size={13} />
              Не зарегистрированы
            </span>
          )}
        </div>

        {/* Tactical Stat Cells Matrix */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '14px'
        }}>
          {/* Punch Strength */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            padding: '14px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
              <RpgDiamondBadge type="strength" color="amber" size={30} />
              <div>
                <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-dim)' }}>
                  Сила удара
                </div>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#fbbf24', fontFamily: 'var(--font-mono)' }}>
                  {pStats.punch_kg !== null && pStats.punch_kg !== undefined 
                    ? `${pStats.punch_kg.toLocaleString('ru-RU')} кг` 
                    : '—'}
                </div>
              </div>
            </div>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Базовая ударная мощь</div>
          </div>

          {/* Durability (Calculated x3 from punch) */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            padding: '14px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
              <RpgDiamondBadge type="shield" color="purple" size={30} />
              <div>
                <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#c4b5fd' }}>
                  Прочность (x3)
                </div>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#c4b5fd', fontFamily: 'var(--font-mono)' }}>
                  {pStats.durability_kg !== null && pStats.durability_kg !== undefined 
                    ? `${pStats.durability_kg.toLocaleString('ru-RU')} кг` 
                    : '—'}
                </div>
              </div>
            </div>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Порог сквозного урона</div>
          </div>

          {/* Lifting Strength */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            padding: '14px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
              <RpgDiamondBadge type="attribute" color="cyan" size={30} />
              <div>
                <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-dim)' }}>
                  Сила на подъём
                </div>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>
                  {pStats.lifting_kg !== null && pStats.lifting_kg !== undefined 
                    ? `${pStats.lifting_kg.toLocaleString('ru-RU')} кг` 
                    : '—'}
                </div>
              </div>
            </div>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Предел тяги</div>
          </div>

          {/* Speed */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            padding: '14px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
              <RpgDiamondBadge type="exchange" color="cyan" size={30} />
              <div>
                <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-dim)' }}>
                  Скорость
                </div>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#67e8f9', fontFamily: 'var(--font-mono)' }}>
                  {pStats.speed_kmh !== null && pStats.speed_kmh !== undefined 
                    ? `${pStats.speed_kmh.toLocaleString('ru-RU')} км/ч` 
                    : '—'}
                </div>
              </div>
            </div>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Перемещение в бою</div>
          </div>

          {/* Reaction */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            padding: '14px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
              <RpgDiamondBadge type="awakening" color="purple" size={30} />
              <div>
                <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-dim)' }}>
                  Реакция
                </div>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#c084fc', fontFamily: 'var(--font-mono)' }}>
                  {pStats.reaction_s !== null && pStats.reaction_s !== undefined 
                    ? `${pStats.reaction_s} с` 
                    : '—'}
                </div>
              </div>
            </div>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Время отклика на угрозу</div>
          </div>
        </div>
      </div>
    </div>
  );
}
