import React from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Shield, Lock, AlertCircle, ArrowRight, UserCheck, Sparkles, CheckCircle2, Play } from 'lucide-react';
import { RpgDiamondBadge } from '../components/common/RpgDiamondBadge';

export function LoginPage() {
  const [searchParams] = useSearchParams();
  const { user, loginAsDemoUser } = useAuth();
  const navigate = useNavigate();
  const error = searchParams.get('error');

  if (user) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '65vh' }}>
        <div className="card-bezel" style={{ maxWidth: '520px', width: '100%', padding: '6px' }}>
          <div className="card-inner" style={{ textAlign: 'center', padding: '40px 32px' }}>
            <div style={{
              width: '68px',
              height: '68px',
              borderRadius: '50%',
              background: 'var(--accent-purple-glow)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px',
              color: 'var(--accent-purple)',
              border: '1px solid rgba(139, 92, 246, 0.4)',
              boxShadow: '0 0 24px rgba(139, 92, 246, 0.35)'
            }}>
              <UserCheck size={34} />
            </div>
            <span className="badge badge-purple" style={{ marginBottom: '12px' }}>
              СЕССИЯ АКТИВНА
            </span>
            <h2 style={{ fontSize: '1.7rem', marginBottom: '8px', fontWeight: 800 }}>Вы уже авторизованы</h2>
            <p style={{ fontSize: '0.94rem', color: 'var(--text-muted)', marginBottom: '28px', lineHeight: 1.6 }}>
              Вход выполнен под аккаунтом <strong style={{ color: 'var(--text-main)' }}>@{user.username}</strong> ({user.global_name || user.username}).
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <Link to="/dashboard" className="btn btn-primary btn-lg" style={{ width: '100%' }}>
                <span>Перейти в личный кабинет</span>
                <span className="btn-icon-bubble">
                  <ArrowRight size={16} />
                </span>
              </Link>
              <Link to="/" className="btn btn-secondary">
                На главную страницу
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const handleLoginClick = () => {
    window.location.href = '/api/auth/discord';
  };

  const handleDemoClick = () => {
    loginAsDemoUser();
    navigate('/dashboard');
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '75vh', padding: '20px 0' }}>
      <div className="card-bezel card-bezel-crimson" style={{ maxWidth: '960px', width: '100%', padding: '8px' }}>
        <div className="card-inner" style={{ padding: 'clamp(24px, 4vw, 44px)' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '40px',
            alignItems: 'center'
          }}>
            {/* Left Column: Mission Brief & Discord Action */}
            <div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }} className="badge badge-purple badge-purple-pulse">
                <Sparkles size={12} />
                <span>ЕДИНАЯ СИСТЕМА ИДЕНТИФИКАЦИИ</span>
              </div>

              <h1 style={{
                fontSize: 'clamp(1.9rem, 3.5vw, 2.5rem)',
                lineHeight: 1.15,
                marginBottom: '14px',
                fontFamily: 'var(--font-heading)',
                fontWeight: 800,
                fontStyle: 'normal',
                color: 'var(--color-ink)',
                letterSpacing: '-0.03em'
              }}>
                Вход в портал VERGE TRP
              </h1>

              <p style={{ fontSize: '0.94rem', color: 'var(--text-muted)', lineHeight: 1.65, marginBottom: '24px' }}>
                Войдите через ваш Discord-аккаунт или запустите демо-режим для предпросмотра слотов персонажей, инвентаря и боевых показателей.
              </p>

              {/* Diamond Badges Row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '28px' }}>
                <RpgDiamondBadge type="attribute" color="purple" size={46} />
                <RpgDiamondBadge type="strength" color="cyan" size={46} />
                <RpgDiamondBadge type="vitality" color="crimson" size={46} />
                <RpgDiamondBadge type="exchange" color="amber" size={46} />
              </div>

              {error && (
                <div style={{
                  padding: '12px 16px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  color: '#fca5a5',
                  fontSize: '0.88rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  marginBottom: '20px'
                }}>
                  <AlertCircle size={18} />
                  <span>Ошибка авторизации: {error}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
                {/* Discord OAuth Button */}
                <button 
                  onClick={handleLoginClick} 
                  className="btn btn-discord btn-lg" 
                  style={{ width: '100%' }}
                >
                  <span>Авторизоваться через Discord</span>
                  <span className="btn-icon-bubble">
                    <Shield size={18} />
                  </span>
                </button>

                {/* Instant Demo Preview Button */}
                <button 
                  onClick={handleDemoClick} 
                  className="btn btn-primary btn-lg" 
                  style={{ width: '100%' }}
                >
                  <span>⚡ Открыть в Демо-режиме (Предпросмотр)</span>
                  <span className="btn-icon-bubble">
                    <Play size={16} />
                  </span>
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                <Lock size={13} />
                <span>Безопасная аутентификация через официальный Discord OAuth2 API</span>
              </div>

              <div style={{
                marginTop: '16px',
                paddingTop: '14px',
                borderTop: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '8px',
                fontSize: '0.82rem',
                color: 'var(--text-muted)'
              }}>
                <span>Ещё не вступили в сообщество?</span>
                <a 
                  href="https://discord.gg/vergetrp" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  style={{ color: 'var(--accent-purple-light)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                >
                  Присоединиться к Discord <ArrowRight size={13} />
                </a>
              </div>
            </div>

            {/* Right Column: Character Artwork & Perks */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative'
            }}>
              <div style={{
                width: '260px',
                height: '260px',
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(139, 92, 246, 0.3) 0%, rgba(239, 68, 68, 0.15) 50%, transparent 70%)',
                filter: 'blur(24px)',
                position: 'absolute',
                zIndex: 0
              }} />

              <img 
                src="/assets/character/welcome_smile.png" 
                alt="Verge Assistant" 
                style={{
                  width: '240px',
                  height: '240px',
                  objectFit: 'contain',
                  position: 'relative',
                  zIndex: 1,
                  filter: 'drop-shadow(0 10px 24px rgba(0,0,0,0.6))',
                  marginBottom: '16px'
                }}
              />

              {/* Perks List */}
              <div style={{
                width: '100%',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                position: 'relative',
                zIndex: 1
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                  <CheckCircle2 size={15} color="var(--accent-emerald)" />
                  <span>Управление слотами 1 и 2</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                  <CheckCircle2 size={15} color="var(--accent-emerald)" />
                  <span>Просмотр инвентаря и экипировки</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                  <CheckCircle2 size={15} color="var(--accent-emerald)" />
                  <span>Доступ к штабным архивам и базе знаний</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
