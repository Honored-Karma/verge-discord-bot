import React from 'react';
import { Zap, Sword, TrendingUp, Sparkles } from 'lucide-react';
import { RpgDiamondBadge } from '../common/RpgDiamondBadge';

export function ProgressionSection({ character }) {
  const ap = Number(character?.ap || 0);
  const styles = character?.styles || [];
  const totalSp = Number(character?.total_sp || 0);

  const apProgress = Math.min(100, (ap / 1000) * 100);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
      {/* AP & Attribute Progression */}
      <div className="card-bezel card-bezel-amber">
        <div className="card-inner" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <RpgDiamondBadge type="attribute" color="amber" size={28} />
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Развитие Атрибута (AP)</h3>
            </div>
            <span className="badge badge-amber" style={{ fontFamily: 'var(--font-mono)' }}>
              {ap.toLocaleString('ru-RU')} AP
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.84rem', marginBottom: '6px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Прогресс Олицетворения</span>
                <span style={{ color: '#fbbf24', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{ap} / 1000 AP</span>
              </div>
              <div className="stat-bar-track">
                <div className="stat-bar-fill fill-amber" style={{ width: `${apProgress}%` }} />
              </div>
              <span style={{ fontSize: '0.76rem', color: 'var(--text-dim)', marginTop: '6px', display: 'block' }}>
                Каждые 100 AP снижают затраты стамины на 5% или открывают новые боевые приёмы
              </span>
            </div>

            {(character.ap_multiplier !== undefined || character.sp_multiplier !== undefined) && (
              <div style={{
                display: 'flex',
                gap: '12px',
                padding: '12px 14px',
                borderRadius: 'var(--radius-sm)',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid var(--border-subtle)',
                fontSize: '0.84rem'
              }}>
                <div style={{ flex: 1 }}>
                  <span style={{ color: 'var(--text-dim)', display: 'block', fontSize: '0.72rem', textTransform: 'uppercase' }}>МНОЖИТЕЛЬ AP</span>
                  <strong style={{ color: '#fbbf24' }}>{character.ap_multiplier || 100}%</strong>
                </div>
                <div style={{ flex: 1 }}>
                  <span style={{ color: 'var(--text-dim)', display: 'block', fontSize: '0.72rem', textTransform: 'uppercase' }}>МНОЖИТЕЛЬ SP</span>
                  <strong style={{ color: '#38bdf8' }}>{character.sp_multiplier || 100}%</strong>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Combat Styles & SP */}
      <div className="card-bezel card-bezel-crimson">
        <div className="card-inner" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <RpgDiamondBadge type="strength" color="crimson" size={28} />
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Боевые стили (SP)</h3>
            </div>
            <span className="badge badge-crimson" style={{ fontFamily: 'var(--font-mono)' }}>
              {totalSp.toLocaleString('ru-RU')} SP всего
            </span>
          </div>

          {styles.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {styles.map((style, idx) => {
                const styleSp = Number(style.sp || 0);
                const spPercent = Math.min(100, (styleSp / 2500) * 100);
                return (
                  <div 
                    key={style.id || idx}
                    style={{
                      padding: '12px 14px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid var(--border-subtle)'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <div>
                        <strong style={{ fontSize: '0.94rem', color: 'var(--text-main)' }}>{style.name}</strong>
                        <span className="badge badge-purple" style={{ marginLeft: '8px', fontSize: '0.68rem', padding: '1px 6px' }}>
                          {style.rank_name || 'Новичок'}
                        </span>
                      </div>
                      <span style={{ fontSize: '0.82rem', color: '#c4b5fd', fontFamily: 'var(--font-mono)' }}>
                        {styleSp} / 2500 SP
                      </span>
                    </div>
                    <div className="stat-bar-track">
                      <div className="stat-bar-fill fill-crimson" style={{ width: `${spPercent}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '24px 10px', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
              <p>Персонаж пока не изучил боевых стилей.</p>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: '4px', display: 'block' }}>
                Используйте команду /train_style в Discord
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
