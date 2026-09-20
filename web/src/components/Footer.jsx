/* Hallmark · footer: Ft5 Statement · theme: atmospheric-custom */
import React from 'react';
import { Link } from 'react-router-dom';
import { Flame, Shield, MessageSquare, Activity } from 'lucide-react';

export function Footer() {
  return (
    <footer style={{
      borderTop: '1px solid var(--color-rule)',
      background: 'var(--color-paper)',
      padding: 'var(--space-2xl) 20px var(--space-xl)',
      marginTop: 'auto',
      position: 'relative',
      zIndex: 10
    }}>
      <div style={{
        maxWidth: 'var(--max-content-width)',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-xl)'
      }}>
        {/* Ft5 Statement Closing Sentence */}
        <div style={{ maxWidth: '38ch' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '0.74rem',
            fontFamily: 'var(--font-mono)',
            color: 'var(--color-accent)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            marginBottom: 'var(--space-xs)'
          }}>
            <Flame size={14} />
            <span>ХРОНИКИ ГЕНЕЗИСА • 2026</span>
          </div>
          <p style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(1.5rem, 3.6vw, 2.4rem)',
            fontWeight: 800,
            lineHeight: 1.15,
            letterSpacing: '-0.03em',
            color: 'var(--color-ink)',
            margin: 0
          }}>
            Мир расколот на Цусиме. Баланс сил в Токио и Сеуле создаётся каждым твоим шагом.
          </p>
        </div>

        {/* Metadata & Links Row */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 'var(--space-md)',
          paddingTop: 'var(--space-md)',
          borderTop: '1px solid var(--color-rule)'
        }}>
          {/* Brand & Edition */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ 
              fontFamily: 'var(--font-display)', 
              fontWeight: 800, 
              fontSize: '1.05rem', 
              letterSpacing: '-0.02em', 
              color: 'var(--color-ink)' 
            }}>
              VERGE TRP
            </span>
            <span style={{
              fontSize: '0.70rem',
              fontFamily: 'var(--font-mono)',
              padding: '2px 8px',
              borderRadius: 'var(--radius-pill)',
              background: 'var(--color-paper-2)',
              border: '1px solid var(--color-rule)',
              color: 'var(--color-muted)'
            }}>
              v2.0 • LIVE
            </span>
          </div>

          {/* Clean Horizontal Links */}
          <nav style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap', fontSize: '0.86rem', fontWeight: 600 }}>
            <Link to="/" style={{ color: 'var(--color-muted)', transition: 'color var(--transition-fast)' }}>
              Главная
            </Link>
            <Link to="/wiki" style={{ color: 'var(--color-muted)', transition: 'color var(--transition-fast)' }}>
              База знаний
            </Link>
            <Link to="/applications" style={{ color: 'var(--color-muted)', transition: 'color var(--transition-fast)' }}>
              Анкеты
            </Link>
            <a 
              href="https://discord.gg/vergetrp" 
              target="_blank" 
              rel="noopener noreferrer" 
              style={{ color: 'var(--color-accent)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <MessageSquare size={14} />
              <span>Discord</span>
            </a>
          </nav>
        </div>

        {/* Legal & Status Bar */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          fontSize: '0.78rem',
          color: 'var(--color-dim)'
        }}>
          <div>
            © 2020–2026 Verge TRP. Все права на лор и ролевую вселенную принадлежат проекту.
          </div>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <Shield size={12} color="var(--color-purple)" />
              <span>Тенрью & Стражи</span>
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <Activity size={12} color="var(--color-emerald)" />
              <span>Bot Core Online</span>
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
