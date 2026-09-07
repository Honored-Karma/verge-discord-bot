import React, { useState, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { 
  LayoutDashboard, 
  BookOpen, 
  FileText, 
  Users, 
  ShieldAlert, 
  Clock, 
  ArrowLeft, 
  AlertCircle,
  Lock
} from 'lucide-react';

export function AdminLayout() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [permissionsData, setPermissionsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    let isMounted = true;
    fetch('/api/admin/permissions', {
      headers: { 'Accept': 'application/json' }
    })
      .then(async res => {
        if (res.status === 401 || res.status === 403) {
          if (isMounted) setForbidden(true);
          return null;
        }
        if (!res.ok) throw new Error('Не удалось получить права');
        return res.json();
      })
      .then(data => {
        if (isMounted && data) {
          setPermissionsData(data.capabilities || {});
          if (!data.capabilities?.canAccessAdmin) {
            setForbidden(true);
          }
        }
      })
      .catch(() => {
        if (isMounted) setForbidden(true);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => { isMounted = false; };
  }, []);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '120px 20px' }}>
        <div className="spinner" />
        <p style={{ marginTop: '16px', color: 'var(--text-muted)' }}>Проверка прав доступа к панели управления...</p>
      </div>
    );
  }

  if (forbidden || !permissionsData?.canAccessAdmin) {
    return (
      <div className="empty-state" style={{ margin: '80px auto', maxWidth: '520px' }}>
        <div className="empty-state-icon">
          <Lock size={44} color="#fca5a5" />
        </div>
        <h3 className="empty-state-title" style={{ color: '#fca5a5' }}>403 — Доступ ограничен</h3>
        <p className="empty-state-desc">
          У вашей учетной записи нет достаточных прав для работы с административной панелью Verge TRP.
        </p>
        <Link to="/" className="btn btn-primary" style={{ marginTop: '12px' }}>
          Вернуться на главную
        </Link>
      </div>
    );
  }

  const isCurrent = (path) => {
    if (path === '/admin' && location.pathname === '/admin') return true;
    if (path !== '/admin' && location.pathname.startsWith(path)) return true;
    return false;
  };

  const navItems = [
    {
      to: '/admin',
      label: 'Обзор',
      icon: <LayoutDashboard size={17} />,
      allowed: true
    },
    {
      to: '/admin/wiki',
      label: 'Энциклопедия (Wiki)',
      icon: <BookOpen size={17} />,
      allowed: Boolean(permissionsData.canManageWiki)
    },
    {
      to: '/admin/applications',
      label: 'Реестр анкет',
      icon: <FileText size={17} />,
      allowed: Boolean(permissionsData.canManageApplications)
    },
    {
      to: '/admin/characters',
      label: 'Персонажи',
      icon: <Users size={17} />,
      allowed: Boolean(permissionsData.canViewPrivateCharacters)
    },
    {
      to: '/admin/audit',
      label: 'Журнал аудита',
      icon: <Clock size={17} />,
      allowed: Boolean(permissionsData.canViewAuditLog)
    }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', paddingBottom: '80px' }}>
      
      {/* Admin Top Header Banner */}
      <div 
        className="card" 
        style={{ 
          padding: '20px 24px', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.12) 0%, rgba(18, 14, 28, 0.95) 100%)',
          borderRadius: '12px',
          borderLeft: '4px solid var(--accent-purple)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <ShieldAlert size={22} color="var(--accent-purple-light)" />
          <div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, letterSpacing: '-0.01em' }}>
              Панель управления Verge TRP
            </h1>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Административный терминал управления контентом и модерации
            </span>
          </div>
        </div>

        <Link to="/" className="btn btn-secondary btn-sm" style={{ fontSize: '0.8rem' }}>
          <ArrowLeft size={14} /> На сайт
        </Link>
      </div>

      {/* Admin Two-Column Shell */}
      <div 
        style={{ 
          display: 'grid', 
          gridTemplateColumns: '240px minmax(0, 1fr)', 
          gap: '24px',
          alignItems: 'start'
        }}
        className="admin-layout-grid"
      >
        
        {/* Left Sidebar */}
        <aside 
          className="card" 
          style={{ 
            padding: '12px', 
            borderRadius: '12px',
            position: 'sticky',
            top: '84px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px'
          }}
        >
          <div style={{ padding: '8px 12px', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Разделы управления
          </div>

          {navItems.filter(item => item.allowed).map(item => (
            <Link
              key={item.to}
              to={item.to}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 14px',
                borderRadius: '8px',
                textDecoration: 'none',
                fontSize: '0.88rem',
                fontWeight: 600,
                color: isCurrent(item.to) ? '#ffffff' : 'var(--text-dim)',
                background: isCurrent(item.to) ? 'var(--accent-purple)' : 'transparent',
                transition: 'all 0.15s ease'
              }}
            >
              {item.icon}
              <span>{item.label}</span>
            </Link>
          ))}
        </aside>

        {/* Main Admin Workspace */}
        <main style={{ minWidth: 0 }}>
          <Outlet context={{ capabilities: permissionsData }} />
        </main>

      </div>

    </div>
  );
}
