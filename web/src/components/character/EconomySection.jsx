import React from 'react';
import { Coins, Banknote, Calendar, Wallet } from 'lucide-react';
import { RpgDiamondBadge } from '../common/RpgDiamondBadge';

export function EconomySection({ character }) {
  // If private economy fields are not returned by the API, do NOT render this section
  if (character?.krw === undefined && character?.yen === undefined && character?.weekly_salary === undefined) {
    return null;
  }

  const krw = Number(character?.krw || 0);
  const yen = Number(character?.yen || 0);
  const salary = character?.weekly_salary;
  const salaryMultiplier = Number(character?.salary_multiplier ?? 100);

  return (
    <div className="card-bezel card-bezel-amber">
      <div className="card-inner" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Wallet size={20} color="#06b6d4" />
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Экономика & Банковские счета</h3>
          </div>
          <span className="badge badge-purple">Владелец персонажа</span>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '14px'
        }}>
          {/* Korean Won */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            padding: '14px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <Coins size={14} color="#06b6d4" />
              <span style={{ fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--text-dim)', letterSpacing: '0.06em' }}>
                Баланс (Корея)
              </span>
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#67e8f9', fontFamily: 'var(--font-mono)' }}>
              {krw.toLocaleString('ru-RU')} ₩
            </div>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}>Южнокорейская вона</div>
          </div>

          {/* Japanese Yen */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            padding: '14px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <Banknote size={14} color="#ec4899" />
              <span style={{ fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--text-dim)', letterSpacing: '0.06em' }}>
                Баланс (Япония)
              </span>
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f472b6', fontFamily: 'var(--font-mono)' }}>
              {yen.toLocaleString('ru-RU')} ¥
            </div>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}>Японская йена (1 ¥ = 9.4 ₩)</div>
          </div>

          {/* Weekly Salary */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            padding: '14px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <Calendar size={14} color="#a78bfa" />
              <span style={{ fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--text-dim)', letterSpacing: '0.06em' }}>
                Еженедельная выплата
              </span>
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#c4b5fd', fontFamily: 'var(--font-mono)' }}>
              {salary 
                ? `${salary.amount.toLocaleString('ru-RU')} ${salary.currency === 'yen' ? '¥' : '₩'}` 
                : 'Не назначена'}
            </div>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              Множитель выплат: {salaryMultiplier}%
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
