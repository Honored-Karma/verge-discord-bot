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
  Sparkles,
  MessageSquare
} from 'lucide-react';

export function Navbar({ onOpenSearch }) {
  const { user, switchSlot, logout } = useAuth();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const characters = user?.characters;
  const activeSlot = characters?.activeSlot || 1;
  const activeChar = characters?.activeCharacter;

  const isActive = (path) => location.pathname === path;

  return (
    <header className="navbar-wrapper">
      <div className="navbar-island">
        {/* Brand Logo */}
        <Link to="/" className="nav-brand" onClick={() => setMobileMenuOpen(false)}>
          <div className="nav-brand-logo">
            <Flame size={18} color="#ffffff" />
          </div>
          <span style={{ fontWeight: 800, background: 'linear-gradient(135deg, #ffffff 0%, #cbd5e1 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            VERGE
          </span>
          <span className="badge badge-crimson" style={{ fontSize: '0.65rem', padding: '2px 7px', letterSpacing: '0.08em' }}>
            TRP
          </span>
        </Link>

        {/* Desktop Navigation Links */}
        <nav className="nav-links-dock">
          <Link to="/" className={`nav-link-item ${isActive('/') ? 'active' : ''}`}>
            Главная
          </Link>

          <Link to="/applications" className={`nav-link-item ${isActive('/applications') ? 'active' : ''}`}>
            <FileText size={15} />
            Анкеты
          </Link>
          
          {user && (
            <>
              <Link to="/dashboard" className={`nav-link-item ${isActive('/dashboard') ? 'active' : ''}`}>
                <User size={15} />
                Кабинет
              </Link>
              <Link to="/profile" className={`nav-link-item ${isActive('/profile') ? 'active' : ''}`}>
                <Shield size={15} />
                Персонаж
              </Link>
              <Link to="/inventory" className={`nav-link-item ${isActive('/inventory') ? 'active' : ''}`}>
                <Package size={15} />
                Инвентарь
              </Link>
              {(user.permissions?.isStaff || user.permissions?.isAdmin || user.is_staff || user.is_admin) && (
                <Link to="/admin" className={`nav-link-item ${location.pathname.startsWith('/admin') ? 'active' : ''}`} style={{ color: 'var(--accent-purple-light)' }}>
                  <Shield size={15} />
                  Штаб
                </Link>
              )}
            </>
          )}

          <Link to="/wiki" className={`nav-link-item ${location.pathname.startsWith('/wiki') ? 'active' : ''}`}>
            <BookOpen size={15} />
            Wiki
          </Link>
        </nav>

        {/* Right Tools & User Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Quick Search Button */}
          <button
            onClick={onOpenSearch}
            className="btn btn-secondary btn-sm"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              fontSize: '0.82rem',
              color: 'var(--text-muted)',
              borderRadius: 'var(--radius-pill)'
            }}
            title="Глобальный поиск (Ctrl+K)"
            aria-label="Поиск"
          >
            <Search size={14} color="var(--accent-purple-light)" />
            <span style={{ display: 'none', '@media (minWidth: 900px)': { display: 'inline' } }}>Поиск</span>
            <kbd style={{ fontSize: '0.68rem', background: 'rgba(255, 255, 255, 0.1)', padding: '1px 5px', borderRadius: '4px', color: 'var(--text-dim)' }}>
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
              width: '32px',
              height: '32px',
              padding: 0,
              borderRadius: 'var(--radius-pill)',
              color: 'var(--accent-purple-light)'
            }}
            title="Присоединиться к Discord серверу"
            aria-label="Discord Сервер"
          >
            <MessageSquare size={15} />
          </a>

          {/* User Controls */}
          {user ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {/* Slot Switcher (Compact Bezel) */}
              {characters?.hasCharacters && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  background: 'rgba(255, 255, 255, 0.05)',
                  padding: '3px',
                  borderRadius: 'var(--radius-pill)',
                  border: '1px solid var(--border-subtle)'
                }}>
                  <button 
                    style={{
                      padding: '3px 9px',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      borderRadius: 'var(--radius-pill)',
                      background: activeSlot === 1 ? 'var(--accent-purple)' : 'transparent',
                      color: activeSlot === 1 ? '#ffffff' : 'var(--text-muted)'
                    }}
                    onClick={() => switchSlot(1)}
                    disabled={activeSlot === 1}
                  >
                    1
                  </button>
                  <button 
                    style={{
                      padding: '3px 9px',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      borderRadius: 'var(--radius-pill)',
                      background: activeSlot === 2 ? 'var(--accent-purple)' : 'transparent',
                      color: activeSlot === 2 ? '#ffffff' : 'var(--text-muted)',
                      opacity: !characters?.slot2 ? 0.4 : 1
                    }}
                    onClick={() => switchSlot(2)}
                    disabled={activeSlot === 2 || !characters?.slot2}
                    title={!characters?.slot2 ? 'Слот 2 не создан' : 'Слот 2'}
                  >
                    2
                  </button>
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
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid var(--border-subtle)'
                }}
              >
                {activeChar?.character_avatar ? (
                  <div style={{ width: '26px', height: '26px', borderRadius: '50%', overflow: 'hidden', position: 'relative', flexShrink: 0 }}>
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
                    <div style={{ display: 'none', width: '100%', height: '100%', borderRadius: '50%', background: 'rgba(139, 92, 246, 0.3)', alignItems: 'center', justifyContent: 'center' }}>
                      <User size={14} color="var(--accent-purple-light)" />
                    </div>
                  </div>
                ) : (
                  <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: 'rgba(139, 92, 246, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <User size={14} color="var(--accent-purple-light)" />
                  </div>
                )}
                <span style={{ fontSize: '0.82rem', fontWeight: 700, maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {activeChar?.character_name || user.global_name}
                </span>
              </Link>

              {/* Logout Button */}
              <button 
                onClick={logout} 
                className="btn btn-secondary btn-sm"
                title="Выйти"
                style={{ padding: '6px', borderRadius: '50%', width: '32px', height: '32px' }}
              >
                <LogOut size={14} />
              </button>
            </div>
          ) : (
            <Link to="/login" className="btn btn-discord btn-sm">
              <span className="btn-icon-bubble">
                <LogIn size={13} />
              </span>
              <span>Войти</span>
            </Link>
          )}

          {/* Mobile Hamburger Toggle */}
          <button 
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            style={{ display: 'none', '@media (maxWidth: 768px)': { display: 'flex' }, padding: '6px', color: 'var(--text-main)' }}
            className="mobile-toggle-btn"
            aria-label="Меню"
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
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
            <Link to="/wiki" className="nav-link-item" onClick={() => setMobileMenuOpen(false)}>Wiki & Лор</Link>
            <a 
              href="https://discord.gg/vergetrp" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="nav-link-item" 
              style={{ color: 'var(--accent-purple-light)', display: 'flex', alignItems: 'center', gap: '8px' }}
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
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
