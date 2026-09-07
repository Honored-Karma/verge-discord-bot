import React from 'react';
import { Link } from 'react-router-dom';
import { Flame, Shield, Globe, Terminal, MessageSquare, BookOpen, FileText, Activity } from 'lucide-react';

export function Footer() {
  return (
    <footer style={{
      borderTop: '1px solid var(--border-subtle)',
      background: 'linear-gradient(180deg, var(--bg-surface) 0%, var(--bg-core) 100%)',
      padding: '48px 20px 36px',
      marginTop: 'auto',
      position: 'relative',
      zIndex: 10
    }}>
      <div style={{
        maxWidth: 'var(--max-content-width)',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '28px'
      }}>
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '24px'
        }}>
          {/* Brand Info */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <img 
              src="/assets/character/chibi_mascot.png" 
              alt="Verge Mascot" 
              style={{ width: '52px', height: '52px', objectFit: 'contain', filter: 'drop-shadow(0 4px 12px rgba(139, 92, 246, 0.4))' }} 
            />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <Flame size={18} color="#ef4444" />
                <span style={{ fontWeight: 800, fontSize: '1.05rem', letterSpacing: '0.04em', fontFamily: 'var(--font-display)' }}>
                  VERGE TRP PORTAL
                </span>
                <span className="badge badge-purple" style={{ fontSize: '0.65rem', padding: '1px 6px' }}>v2.0</span>
              </div>
              <p style={{ fontSize: '0.84rem', color: 'var(--text-dim)', maxWidth: '460px', lineHeight: 1.5 }}>
                Официальный текстовый ролевой проект. Эпоха Генезиса, Атрибуты, Скважины и геополитическое противостояние фракций.
              </p>
            </div>
          </div>

          {/* Footer Navigation Links */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '22px', fontSize: '0.88rem', fontWeight: 600 }}>
            <Link to="/" style={{ color: 'var(--text-muted)', transition: 'color var(--transition-fast)' }} onMouseEnter={e => e.currentTarget.style.color = '#fff'} onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>
              Главная
            </Link>
            <Link to="/wiki" style={{ color: 'var(--text-muted)', transition: 'color var(--transition-fast)' }} onMouseEnter={e => e.currentTarget.style.color = '#fff'} onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>
              База знаний
            </Link>
            <Link to="/applications" style={{ color: 'var(--text-muted)', transition: 'color var(--transition-fast)' }} onMouseEnter={e => e.currentTarget.style.color = '#fff'} onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>
              Анкеты
            </Link>
            <a 
              href="https://discord.gg" 
              target="_blank" 
              rel="noopener noreferrer" 
              style={{ color: 'var(--accent-purple-light)', display: 'flex', alignItems: 'center', gap: '5px' }}
            >
              <MessageSquare size={15} />
              Discord Сервер
            </a>
          </div>
        </div>

        {/* Bottom Bar */}
        <div style={{
          paddingTop: '20px',
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '14px',
          fontSize: '0.78rem',
          color: 'var(--text-dim)'
        }}>
          <div>
            © 2020–2026 Verge TRP. Все права на лор и ролевую вселенную принадлежат проекту.
          </div>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <Shield size={13} color="#8b5cf6" />
              Тенрью & Стражи Мира
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <Activity size={13} color="#10b981" />
              Live Server Engine
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
