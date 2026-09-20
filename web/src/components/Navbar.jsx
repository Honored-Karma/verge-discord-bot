/* Hallmark · nav: N13 Inline ⌘K-pill · theme: atmospheric-custom */
import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { resolveAvatarUrl } from '../utils/imageHelper';
import { 
  Shield, 
  User, 
  Package, 
  BookOpen, 
  FileText, 
  LogIn, 
  LogOut, 
  Flame,
  Search,
  Menu,
  X,
  MessageSquare
} from 'lucide-react';

export function Navbar({ onOpenSearch }) {
  const { user, switchSlot, logout } = useAuth();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const characters = user?.characters;
  const activeSlot = characters?.activeSlot || 1;
  const activeChar = characters?.activeCharacter;

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <header className="navbar-wrapper">
      <div className="navbar-island">
        {/* Brand Logotype */}
        <Link to="/" className="nav-brand" onClick={() => setMobileMenuOpen(false)}>
          <div className="nav-brand-logo">
            <Flame size={18} color="var(--color-accent-ink)" />
          </div>
          <span style={{ 
            fontFamily: 'var(--font-display)', 
            fontWeight: 800, 
            letterSpacing: '-0.02em', 
            color: 'var(--color-ink)',
            fontSize: '1.05rem' 
          }}>
            VERGE
          </span>
          <span className="badge badge-crimson" style={{ fontSize: '0.65rem', padding: '2px 7px', letterSpacing: '0.06em' }}>
            TRP
          </span>
        </Link>

        {/* Desktop Navigation Links */}
        <nav className="nav-links-dock" aria-label="Основная навигация">
          <Link to="/" className={`nav-link-item ${isActive('/') ? 'active' : ''}`}>
            Главная
          </Link>

          <Link to="/applications" className={`nav-link-item ${isActive('/applications') ? 'active' : ''}`}>
            <FileText size={15} />
            <span>Анкеты</span>
          </Link>

          <Link to="/wiki" className={`nav-link-item ${isActive('/wiki') ? 'active' : ''}`}>
            <BookOpen size={15} />
            <span>База знаний</span>
          </Link>
          
          {user && (
            <>
              <Link to="/dashboard" className={`nav-link-item ${isActive('/dashboard') ? 'active' : ''}`}>
                <User size={15} />
                <span>Кабинет</span>
              </Link>
              <Link to="/profile" className={`nav-link-item ${isActive('/profile') ? 'active' : ''}`}>
                <Shield size={15} />
                <span>Персонаж</span>
              </Link>
              <Link to="/inventory" className={`nav-link-item ${isActive('/inventory') ? 'active' : ''}`}>
                <Package size={15} />
                <span>Инвентарь</span>
              </Link>
              {(user.permissions?.isStaff || user.permissions?.isAdmin || user.is_staff || user.is_admin) && (
                <Link to="/admin" className={`nav-link-item ${isActive('/admin') ? 'active' : ''}`} style={{ color: 'var(--color-cyan)' }}>
                  <Shield size={15} />
                  <span>Штаб</span>
                </Link>
              )}
            </>
          )}
        </nav>

        {/* Right Tools & User Controls (Archetype N13) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* N13 Inline ⌘K search pill */}
          <button
            onClick={onOpenSearch}
            className="btn btn-secondary btn-sm"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 12px',
              fontSize: '0.80rem',
              color: 'var(--color-muted)',
              borderRadius: 'var(--radius-pill)',
              border: '1px solid var(--color-rule)'
            }}
            title="Глобальный поиск по лору и боту (Ctrl+K)"
            aria-label="Поиск по порталу (Ctrl+K)"
          >
            <Search size={14} color="var(--color-accent)" />
            <span style={{ display: 'inline' }}>Поиск…</span>
            <kbd style={{ 
              fontSize: '0.68rem', 
              fontFamily: 'var(--font-mono)',
              background: 'oklch(22% 0.015 265)', 
              padding: '1px 5px', 
              borderRadius: '4px', 
              color: 'var(--color-dim)',
              border: '1px solid var(--color-rule)' 
            }}>
              ⌘K
            </kbd>
          </button>

          {/* Discord Server Link */}
          <a
            href="https://discord.gg/vergetrp"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary btn-sm"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '34px',
              height: '34px',
              padding: 0,
              borderRadius: 'var(--radius-pill)',
              color: 'var(--color-ink)'
            }}
            title="Официальный Discord-сервер Verge TRP"
            aria-label="Discord Сервер"
          >
            <MessageSquare size={15} />
          </a>

          {/* User Controls */}
          {user ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {/* Slot Switcher (Tactical Pill) */}
              {characters?.hasCharacters && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  background: 'var(--color-paper-3)',
                  padding: '2px',
                  borderRadius: 'var(--radius-pill)',
                  border: '1px solid var(--color-rule)'
                }}>
                  {[1, 2, 3].map((slotNum) => {
                    const isAvailable = slotNum === 1 || (slotNum === 2 && characters?.slot2) || (slotNum === 3 && characters?.slot3);
                    const isLocked = slotNum === 3 && !characters?.slot3 && !characters?.slot3Unlocked;
                    const isCurrent = activeSlot === slotNum;

                    return (
                      <button
                        key={slotNum}
                        onClick={() => switchSlot(slotNum)}
                        disabled={isCurrent || (!isAvailable && isLocked)}
                        title={isLocked ? 'Слот 3 заблокирован' : `Слот ${slotNum}`}
                        style={{
                          padding: '3px 8px',
                          fontSize: '0.72rem',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 700,
                          borderRadius: 'var(--radius-pill)',
                          background: isCurrent ? 'var(--color-accent)' : 'transparent',
                          color: isCurrent ? 'var(--color-accent-ink)' : 'var(--color-muted)',
                          opacity: !isAvailable && !isCurrent ? 0.4 : 1,
                          border: 'none',
                          cursor: isCurrent ? 'default' : 'pointer'
                        }}
                      >
                        {isLocked ? '3🔒' : slotNum}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* User Avatar & Name Link */}
              <Link 
                to="/dashboard" 
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '8px',
                  padding: '4px 10px',
                  borderRadius: 'var(--radius-pill)',
                  background: 'var(--color-paper-2)',
                  border: '1px solid var(--color-rule)'
                }}
              >
                {activeChar?.character_avatar ? (
                  <div style={{ width: '24px', height: '24px', borderRadius: '50%', overflow: 'hidden', position: 'relative', flexShrink: 0 }}>
                    <img 
                      src={resolveAvatarUrl(activeChar.character_avatar, activeChar.slug || activeChar.id)} 
                      alt={user.global_name}
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        if (e.currentTarget.nextElementSibling) {
                          e.currentTarget.nextElementSibling.style.display = 'flex';
                        }
                      }}
                      style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} 
                    />
                    <div style={{ display: 'none', width: '100%', height: '100%', borderRadius: '50%', background: 'var(--color-paper-3)', alignItems: 'center', justifyContent: 'center' }}>
                      <User size={13} color="var(--color-muted)" />
                    </div>
                  </div>
                ) : (
                  <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'var(--color-paper-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <User size={13} color="var(--color-muted)" />
                  </div>
                )}
                <span style={{ 
                  fontSize: '0.80rem', 
                  fontWeight: 700, 
                  maxWidth: '110px', 
                  overflow: 'hidden', 
                  textOverflow: 'ellipsis', 
                  whiteSpace: 'nowrap',
                  color: 'var(--color-ink)'
                }}>
                  {activeChar?.character_name || user.global_name}
                </span>
              </Link>

              {/* Logout Button */}
              <button 
                onClick={logout} 
                className="btn btn-secondary btn-sm"
                title="Выйти из аккаунта"
                style={{ padding: '6px', borderRadius: '50%', width: '34px', height: '34px' }}
                aria-label="Выйти"
              >
                <LogOut size={14} />
              </button>
            </div>
          ) : (
            <Link to="/login" className="btn btn-discord btn-sm">
              <span className="btn-icon-bubble">
                <LogIn size={12} />
              </span>
              <span>Войти</span>
            </Link>
          )}

          {/* Mobile Hamburger Toggle */}
          <button 
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="mobile-toggle-btn"
            style={{ 
              display: 'none',
              padding: '6px', 
              color: 'var(--color-ink)',
              borderRadius: 'var(--radius-sm)'
            }}
            aria-label="Меню навигации"
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile Menu Dropdown Card */}
      {mobileMenuOpen && (
        <div 
          className="card-bezel" 
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: '20px',
            right: '20px',
            zIndex: 99
          }}
        >
          <div className="card-inner" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <Link to="/" className="nav-link-item" onClick={() => setMobileMenuOpen(false)}>Главная</Link>
            <Link to="/applications" className="nav-link-item" onClick={() => setMobileMenuOpen(false)}>Анкеты</Link>
            <Link to="/wiki" className="nav-link-item" onClick={() => setMobileMenuOpen(false)}>База знаний (Wiki)</Link>
            <a 
              href="https://discord.gg/vergetrp" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="nav-link-item" 
              style={{ color: 'var(--color-accent)', display: 'flex', alignItems: 'center', gap: '8px' }}
              onClick={() => setMobileMenuOpen(false)}
            >
              <MessageSquare size={15} />
              Discord Сервер
            </a>
            {user && (
              <>
                <Link to="/dashboard" className="nav-link-item" onClick={() => setMobileMenuOpen(false)}>Личный кабинет</Link>
                <Link to="/profile" className="nav-link-item" onClick={() => setMobileMenuOpen(false)}>Персонаж</Link>
                <Link to="/inventory" className="nav-link-item" onClick={() => setMobileMenuOpen(false)}>Инвентарь</Link>
                {(user.permissions?.isStaff || user.permissions?.isAdmin || user.is_staff || user.is_admin) && (
                  <Link to="/admin" className="nav-link-item" onClick={() => setMobileMenuOpen(false)} style={{ color: 'var(--color-cyan)' }}>
                    Штаб управления
                  </Link>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
