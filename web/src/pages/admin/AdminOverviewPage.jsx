import React, { useState, useEffect } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { 
  Users, 
  BookOpen, 
  FileText, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Activity, 
  ArrowRight,
  Database,
  Bot
} from 'lucide-react';

export function AdminOverviewPage() {
  const { capabilities } = useOutletContext();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    document.title = 'Обзор — Панель управления Verge TRP';
    let isMounted = true;

    fetch('/api/admin/overview', {
      headers: { 'Accept': 'application/json' }
    })
      .then(async res => {
        if (!res.ok) throw new Error(`Ошибка загрузки данных (${res.status})`);
        return res.json();
      })
      .then(resData => {
        if (isMounted) setData(resData);
      })
      .catch(err => {
        if (isMounted) setError(err.message);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => { isMounted = false; };
  }, []);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 20px' }}>
        <div className="spinner" />
        <p style={{ marginTop: '14px', color: 'var(--text-muted)' }}>Загрузка сводки...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon"><AlertCircle size={40} color="#fca5a5" /></div>
        <h3 className="empty-state-title">Не удалось загрузить сводку</h3>
        <p className="empty-state-desc">{error}</p>
      </div>
    );
  }

  const { stats, system, recentAudit } = data;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* 1. Stat Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        
        {/* Wiki Stats */}
        <div className="card" style={{ padding: '20px', borderRadius: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-muted)' }}>Энциклопедия (Wiki)</span>
            <BookOpen size={18} color="var(--accent-purple)" />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-main)', lineHeight: 1 }}>
            {stats.wiki?.total || 0}
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
            <span className="badge badge-emerald" style={{ fontSize: '0.72rem' }}>
              {stats.wiki?.published || 0} опубл.
            </span>
            {stats.wiki?.draft > 0 && (
              <span className="badge badge-amber" style={{ fontSize: '0.72rem' }}>
                {stats.wiki?.draft} чернов.
              </span>
            )}
            {stats.wiki?.archived > 0 && (
              <span className="badge badge-default" style={{ fontSize: '0.72rem' }}>
                {stats.wiki?.archived} архив
              </span>
            )}
          </div>
        </div>

        {/* Characters Stats */}
        <div className="card" style={{ padding: '20px', borderRadius: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-muted)' }}>Персонажи</span>
            <Users size={18} color="var(--accent-cyan)" />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-main)', lineHeight: 1 }}>
            {stats.characters || 0}
          </div>
          <div style={{ fontSize: '0.76rem', color: 'var(--text-dim)', marginTop: '12px' }}>
            Зарегистрированных досье
          </div>
        </div>

        {/* Applications Stats */}
        <div className="card" style={{ padding: '20px', borderRadius: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-muted)' }}>Принятые анкеты</span>
            <FileText size={18} color="var(--accent-purple-light)" />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-main)', lineHeight: 1 }}>
            {stats.applications || 0}
          </div>
          <div style={{ fontSize: '0.76rem', color: 'var(--text-dim)', marginTop: '12px' }}>
            Синхронизировано из Discord
          </div>
        </div>

        {/* System Health */}
        <div className="card" style={{ padding: '20px', borderRadius: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-muted)' }}>Состояние сервисов</span>
            <Activity size={18} color="var(--accent-emerald)" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.82rem' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-dim)' }}>
                <Database size={13} /> MongoDB
              </span>
              <span className={`badge ${system.database === 'connected' ? 'badge-emerald' : 'badge-amber'}`} style={{ fontSize: '0.7rem' }}>
                {system.database === 'connected' ? 'Подключена' : 'Preview Mode'}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.82rem' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-dim)' }}>
                <Bot size={13} /> Discord Bot
              </span>
              <span className={`badge ${system.discordBot === 'online' ? 'badge-emerald' : 'badge-default'}`} style={{ fontSize: '0.7rem' }}>
                {system.discordBot}
              </span>
            </div>
          </div>
        </div>

      </div>

      {/* 2. Recent Administrative Actions */}
      <div className="card" style={{ padding: '24px', borderRadius: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
          <div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>Последние административные действия</h2>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Журнал фиксации изменений</span>
          </div>
          {capabilities?.canViewAuditLog && (
            <Link to="/admin/audit" className="btn btn-secondary btn-sm" style={{ fontSize: '0.78rem' }}>
              Весь журнал <ArrowRight size={13} />
            </Link>
          )}
        </div>

        {recentAudit && recentAudit.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {recentAudit.map((log, idx) => (
              <div 
                key={log._id || idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 14px',
                  borderRadius: '8px',
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid var(--border-color)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div 
                    style={{ 
                      width: '32px', 
                      height: '32px', 
                      borderRadius: '8px', 
                      background: 'rgba(139, 92, 246, 0.15)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}
                  >
                    <Clock size={16} color="var(--accent-purple-light)" />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-main)' }}>
                      {log.details || log.action}
                    </div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                      Действие: <code style={{ color: 'var(--accent-purple-light)' }}>{log.action}</code> • Инициатор: {log.actor?.global_name || log.actor?.username || 'Admin'}
                    </div>
                  </div>
                </div>

                <div style={{ fontSize: '0.74rem', color: 'var(--text-dim)', textAlign: 'right', flexShrink: 0 }}>
                  {new Date(log.created_at).toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
            Записей в журнале аудита пока нет.
          </div>
        )}
      </div>

    </div>
  );
}
