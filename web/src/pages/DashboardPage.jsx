import React, { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  User, 
  Shield, 
  Zap, 
  Package, 
  Coins, 
  Layers, 
  TrendingUp, 
  ArrowUpRight, 
  AlertCircle, 
  ExternalLink,
  PlusCircle,
  Copy,
  Check,
  Award,
  Flame,
  Activity
} from 'lucide-react';

import { RpgDiamondBadge } from '../components/common/RpgDiamondBadge';

export function DashboardPage() {
  const { user, loading, switchSlot } = useAuth();
  const [switching, setSwitching] = useState(false);
  const [copied, setCopied] = useState(false);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '120px 20px' }}>
        <div className="spinner" />
        <p style={{ marginTop: '18px', color: 'var(--text-muted)', fontSize: '0.94rem' }}>
          Загрузка тактического терминала...
        </p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const characters = user.characters;
  const activeSlot = characters?.activeSlot || 1;
  const activeChar = characters?.activeCharacter;
  const slot1Char = characters?.slot1;
  const slot2Char = characters?.slot2;

  const handleSlotSwitch = async (slot) => {
    if (slot === activeSlot || switching) return;
    try {
      setSwitching(true);
      await switchSlot(slot);
    } catch (err) {
      alert(`Не удалось переключить слот: ${err.message}`);
    } finally {
      setSwitching(false);
    }
  };

  const handleCopyId = () => {
    if (activeChar?.id) {
      navigator.clipboard.writeText(activeChar.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      {/* Top Operative Profile Header */}
      <div className="card-bezel">
        <div className="card-inner" style={{ padding: '24px' }}>
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '24px'
          }}>
            {/* Discord User Info */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
              <div style={{ position: 'relative' }}>
                <img 
                  src={user.avatarUrl} 
                  alt={user.global_name}
                  style={{
                    width: '68px',
                    height: '68px',
                    borderRadius: '50%',
                    border: '2px solid var(--accent-purple)',
                    objectFit: 'cover',
                    boxShadow: '0 0 18px rgba(139, 92, 246, 0.35)'
                  }}
                />
                <span style={{
                  position: 'absolute',
                  bottom: '0',
                  right: '0',
                  width: '16px',
                  height: '16px',
                  borderRadius: '50%',
                  background: 'var(--accent-emerald)',
                  border: '3px solid var(--bg-surface)'
                }} />
              </div>

              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '4px' }}>
                  <h1 style={{ fontSize: '1.5rem', fontWeight: 800 }}>{user.global_name}</h1>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>@{user.username}</span>
                  
                  {user.permissions?.isAdmin && <span className="badge badge-crimson">ADMIN</span>}
                  {user.permissions?.isGM && !user.permissions?.isAdmin && <span className="badge badge-amber">GM</span>}
                  {user.permissions?.isAnketolog && <span className="badge badge-purple">АНКЕТОЛОГ</span>}
                </div>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-dim)' }}>
                  Оперативный терминал игрока Verge TRP • Синхронизация активна
                </p>
              </div>
            </div>

            {/* Slot Switcher Control */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>Активный слот:</span>
              <div style={{
                display: 'flex',
                background: 'rgba(255, 255, 255, 0.05)',
                padding: '4px',
                borderRadius: 'var(--radius-pill)',
                border: '1px solid var(--border-medium)'
              }}>
                <button
                  style={{
                    padding: '6px 14px',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    borderRadius: 'var(--radius-pill)',
                    background: activeSlot === 1 ? 'var(--accent-purple)' : 'transparent',
                    color: activeSlot === 1 ? '#ffffff' : 'var(--text-muted)',
                    transition: 'all var(--transition-fast)'
                  }}
                  onClick={() => handleSlotSwitch(1)}
                  disabled={activeSlot === 1 || switching}
                >
                  Слот 1 {slot1Char ? `(${slot1Char.character_name})` : '(Пусто)'}
                </button>
                <button
                  style={{
                    padding: '6px 14px',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    borderRadius: 'var(--radius-pill)',
                    background: activeSlot === 2 ? 'var(--accent-purple)' : 'transparent',
                    color: activeSlot === 2 ? '#ffffff' : 'var(--text-muted)',
                    opacity: !slot2Char ? 0.4 : 1,
                    transition: 'all var(--transition-fast)'
                  }}
                  onClick={() => handleSlotSwitch(2)}
                  disabled={activeSlot === 2 || !slot2Char || switching}
                  title={!slot2Char ? 'Слот 2 ещё не создан в Discord' : ''}
                >
                  Слот 2 {slot2Char ? `(${slot2Char.character_name})` : '(Пусто)'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Active Character Content */}
      {activeChar ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
          {/* Main Active Character Banner */}
          <div className="card-bezel card-bezel-crimson">
            <div className="card-inner hud-corner" style={{ padding: '28px' }}>
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '24px'
              }}>
                {/* Character Identity */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '22px' }}>
                  <div style={{ position: 'relative' }}>
                    <img 
                      src={activeChar.character_avatar || user.avatarUrl} 
                      alt={activeChar.character_name}
                      style={{
                        width: '92px',
                        height: '92px',
                        borderRadius: '20px',
                        border: '2px solid var(--accent-purple)',
                        objectFit: 'cover',
                        boxShadow: '0 8px 24px rgba(139, 92, 246, 0.4)'
                      }}
                    />
                    <div style={{
                      position: 'absolute',
                      bottom: '-6px',
                      right: '-6px',
                      background: 'var(--gradient-crimson-fire)',
                      color: '#fff',
                      fontSize: '0.68rem',
                      fontWeight: '800',
                      padding: '3px 8px',
                      borderRadius: '6px',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.5)'
                    }}>
                      СЛОТ {activeChar.slot}
                    </div>
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '8px' }}>
                      <h2 style={{ fontSize: '1.8rem', fontFamily: 'var(--font-heading)', fontWeight: 800 }}>
                        {activeChar.character_name}
                      </h2>
                      {activeChar.attribute_name && (
                        <span className="badge badge-amber">
                          АТРИБУТ: {activeChar.attribute_name}
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.88rem', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                      <span>Организация: <strong style={{ color: 'var(--text-main)' }}>{activeChar.organization || 'Не состоит'}</strong></span>
                      <span>•</span>
                      <span>Ранг: <strong style={{ color: '#c4b5fd' }}>{activeChar.rank || '—'}</strong></span>
                      <span>•</span>
                      <span>Репутация: <strong style={{ color: '#fca5a5' }}>{activeChar.reputation} Rtg</strong> ({activeChar.reputation_tier?.name})</span>
                    </div>
                  </div>
                </div>

                {/* Quick Action Buttons with "Button-in-Button" */}
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  <button 
                    onClick={handleCopyId} 
                    className="btn btn-secondary btn-sm"
                    title="Скопировать Player ID"
                  >
                    <span>{copied ? 'ID скопирован' : 'ID персонажа'}</span>
                    <span className="btn-icon-bubble">
                      {copied ? <Check size={13} color="#22c55e" /> : <Copy size={13} />}
                    </span>
                  </button>

                  <Link to={`/characters/${activeChar.id}`} className="btn btn-secondary btn-sm">
                    <span>Досье</span>
                    <span className="btn-icon-bubble">
                      <Shield size={13} />
                    </span>
                  </Link>

                  <Link to={`/characters/${activeChar.id}/inventory`} className="btn btn-primary btn-sm">
                    <span>Инвентарь</span>
                    <span className="btn-icon-bubble">
                      <Package size={13} />
                    </span>
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Metrics Tactical Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '18px'
          }}>
            {/* Currency KRW */}
            <div className="card-bezel card-bezel-amber">
              <div className="card-inner" style={{ padding: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                  <RpgDiamondBadge type="exchange" color="amber" size={38} />
                  <div>
                    <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-dim)' }}>
                      Корейские Воны
                    </span>
                    <div style={{ color: '#fbbf24', fontSize: '1.35rem', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>
                      ₩ {activeChar.krw?.toLocaleString('ru-RU') || 0}
                    </div>
                  </div>
                </div>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Баланс в Республике Корея</span>
              </div>
            </div>

            {/* Currency YEN */}
            <div className="card-bezel card-bezel-crimson">
              <div className="card-inner" style={{ padding: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                  <RpgDiamondBadge type="exchange" color="purple" size={38} />
                  <div>
                    <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-dim)' }}>
                      Японские Йены
                    </span>
                    <div style={{ color: '#f472b6', fontSize: '1.35rem', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>
                      ¥ {activeChar.yen?.toLocaleString('ru-RU') || 0}
                    </div>
                  </div>
                </div>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Баланс в Японии (1¥ = 9.4₩)</span>
              </div>
            </div>

            {/* Attribute Power AP */}
            <div className="card-bezel card-bezel-cyan">
              <div className="card-inner" style={{ padding: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                  <RpgDiamondBadge type="attribute" color="cyan" size={38} />
                  <div>
                    <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-dim)' }}>
                      Сила Атрибута (AP)
                    </span>
                    <div style={{ color: '#38bdf8', fontSize: '1.35rem', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>
                      {activeChar.ap?.toLocaleString('ru-RU') || 0} AP
                    </div>
                  </div>
                </div>
                <div className="stat-bar-track" style={{ margin: '8px 0' }}>
                  <div 
                    className="stat-bar-fill fill-cyan" 
                    style={{ width: `${Math.min(100, ((activeChar.ap || 0) / 1000) * 100)}%` }}
                  />
                </div>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {activeChar.ap >= 1000 ? 'Олицетворение достигнуто' : `${1000 - (activeChar.ap || 0)} AP до Олицетворения`}
                </span>
              </div>
            </div>

            {/* Combat Style SP */}
            <div className="card-bezel">
              <div className="card-inner" style={{ padding: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                  <RpgDiamondBadge type="strength" color="purple" size={38} />
                  <div>
                    <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-dim)' }}>
                      Боевой опыт (SP)
                    </span>
                    <div style={{ color: '#c084fc', fontSize: '1.35rem', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>
                      {activeChar.total_sp?.toLocaleString('ru-RU') || 0} SP
                    </div>
                  </div>
                </div>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Изучено стилей: {activeChar.styles?.length || 0}
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Empty State for Unregistered Slot with Welcome Mascot */
        <div className="card-bezel card-bezel-crimson">
          <div className="card-inner" style={{ padding: '48px 32px', textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
              <img 
                src="/assets/character/welcome_smile.png" 
                alt="Добро пожаловать в Verge"
                style={{ maxHeight: '200px', objectFit: 'contain', filter: 'drop-shadow(0 12px 28px rgba(0,0,0,0.6))' }}
              />
            </div>
            <span className="badge badge-purple" style={{ marginBottom: '12px' }}>
              СЛОТ {activeSlot} • СВОБОДЕН
            </span>
            <h3 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '10px' }}>
              В слоте {activeSlot} ещё нет зарегистрированного героя
            </h3>
            <p style={{ fontSize: '0.94rem', color: 'var(--text-muted)', maxWidth: '540px', margin: '0 auto 24px', lineHeight: 1.6 }}>
              Создайте своего персонажа на сервере через слэш-команду бота, чтобы начать развитие способностей и зарабатывать валюту:
            </p>
            <div style={{
              background: 'var(--bg-core)',
              border: '1px solid var(--border-medium)',
              borderRadius: 'var(--radius-sm)',
              padding: '14px 20px',
              maxWidth: '540px',
              margin: '0 auto 24px',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.9rem',
              color: '#c4b5fd',
              boxShadow: '0 4px 16px rgba(0,0,0,0.5)'
            }}>
              /register character_name:Имя slot:{activeSlot} attribute_name:Тема
            </div>
            <p style={{ fontSize: '0.84rem', color: 'var(--text-dim)' }}>
              После одобрения квенты анкетологами персонаж мгновенно синхронизируется с вашим профилем.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
