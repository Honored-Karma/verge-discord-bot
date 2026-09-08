import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  RefreshCw, 
  Search, 
  FileText, 
  ExternalLink, 
  CheckCircle2, 
  AlertCircle, 
  Eye, 
  Edit3,
  Plus,
  X,
  Lock,
  Layers,
  Sparkles
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { resolveAvatarUrl } from '../../utils/imageHelper';

export function AdminApplicationsPage() {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { showSuccess, showError, showWarning } = useToast();

  // Sync state
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);

  // Inspection modal
  const [inspectingApp, setInspectingApp] = useState(null);

  // Search & Filter
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const fetchApplications = () => {
    setLoading(true);
    setError(null);

    const query = new URLSearchParams();
    if (search) query.set('search', search);
    if (statusFilter !== 'all') query.set('status', statusFilter);

    fetch(`/api/admin/applications?${query.toString()}`, {
      headers: { 'Accept': 'application/json' }
    })
      .then(async res => {
        if (!res.ok) throw new Error(`Ошибка загрузки анкет (${res.status})`);
        return res.json();
      })
      .then(data => {
        setApplications(data.items || []);
      })
      .catch(err => {
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    document.title = 'Реестр анкет — Панель управления';
    fetchApplications();
  }, [statusFilter]);

  const handleSyncAll = async () => {
    if (syncing) return;
    setSyncing(true);
    setSyncResult(null);

    try {
      const res = await fetch('/api/admin/applications/sync', {
        method: 'POST',
        headers: { 'Accept': 'application/json' }
      });

      const data = await res.json().catch(() => ({}));
      if (res.status === 429) {
        setSyncResult({ type: 'warning', message: data.message || 'Синхронизация уже выполняется.' });
        showWarning(data.message || 'Синхронизация уже выполняется.');
        return;
      }

      if (!res.ok) throw new Error(data.message || 'Ошибка синхронизации');

      const rep = data.report || {};
      const msg = `Синхронизация завершена: создано ${rep.created || 0}, обновлено ${rep.updated || 0}, без изменений ${rep.unchanged || 0}, пропущено ${rep.skipped || 0}, ошибок ${rep.failed || 0}.`;
      setSyncResult({ type: 'success', message: msg });
      showSuccess(msg);
      fetchApplications();
    } catch (err) {
      setSyncResult({ type: 'error', message: err.message });
      showError(err.message);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Top Actions */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0 }}>Реестр анкет персонажей</h1>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Полноценная модерация досье, редактирование характеристик, секций и фото
          </span>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button 
            onClick={handleSyncAll}
            disabled={syncing}
            className="btn btn-secondary btn-sm"
          >
            <RefreshCw size={14} className={syncing ? 'spinner' : ''} style={{ animation: syncing ? 'spin 1s linear infinite' : 'none' }} />
            {syncing ? 'Синхронизация...' : 'Синхронизировать из Discord'}
          </button>

          <Link to="/admin/applications/new" className="btn btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Plus size={14} />
            <span>Создать анкету</span>
          </Link>
        </div>
      </div>

      {/* Sync Status Banner */}
      {syncResult && (
        <div 
          className="card" 
          style={{ 
            padding: '12px 18px', 
            borderRadius: '8px',
            background: syncResult.type === 'success' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.15)',
            borderLeft: `4px solid ${syncResult.type === 'success' ? '#10b981' : '#ef4444'}`,
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '0.86rem'
          }}
        >
          <CheckCircle2 size={18} color={syncResult.type === 'success' ? '#6ee7b7' : '#fca5a5'} />
          <span>{syncResult.message}</span>
        </div>
      )}

      {/* Filter Bar */}
      <div className="card" style={{ padding: '16px 20px', borderRadius: '12px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            className="input-field"
            placeholder="Поиск по имени персонажа, атрибуту или организации..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchApplications()}
            style={{ paddingLeft: '36px', height: '38px', fontSize: '0.86rem' }}
          />
        </div>

        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {[
            { id: 'all', label: 'Все' },
            { id: 'accepted', label: 'Одобренные' },
            { id: 'pending', label: 'На рассмотрении' },
            { id: 'needs_revision', label: 'Требуют правок' }
          ].map(st => (
            <button
              key={st.id}
              onClick={() => setStatusFilter(st.id)}
              className={`btn btn-sm ${statusFilter === st.id ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: '0.78rem', padding: '4px 12px' }}
            >
              {st.label}
            </button>
          ))}
        </div>
      </div>

      {/* Applications Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px' }}>
          <div className="spinner" />
          <p style={{ marginTop: '12px', color: 'var(--text-muted)' }}>Загрузка анкет...</p>
        </div>
      ) : error ? (
        <div className="empty-state">
          <div className="empty-state-icon"><AlertCircle size={36} color="#fca5a5" /></div>
          <h3 className="empty-state-title">Ошибка при загрузке</h3>
          <p className="empty-state-desc">{error}</p>
        </div>
      ) : applications.length > 0 ? (
        <div className="card" style={{ padding: 0, borderRadius: '12px', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.86rem' }}>
              <thead>
                <tr style={{ background: 'rgba(255, 255, 255, 0.03)', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Персонаж</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Атрибут</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Организация</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Ранг</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Статус</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'right' }}>Действия</th>
                </tr>
              </thead>
              <tbody>
                {applications.map((app) => {
                  const currentStatus = app.status || 'accepted';
                  let statusBadge = <span className="badge badge-emerald">ОДОБРЕНО</span>;
                  if (currentStatus === 'pending') {
                    statusBadge = <span className="badge badge-purple">НА РАССМОТРЕНИИ</span>;
                  } else if (currentStatus === 'needs_revision') {
                    statusBadge = <span className="badge badge-amber">НУЖНЫ ПРАВКИ</span>;
                  } else if (currentStatus === 'rejected') {
                    statusBadge = <span className="badge badge-crimson">ОТКЛОНЕНО</span>;
                  }

                  return (
                    <tr 
                      key={app.slug || app.public_id}
                      style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)', transition: 'background 0.15s' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          {app.character_avatar ? (
                            <div style={{ width: '36px', height: '36px', borderRadius: '50%', overflow: 'hidden', position: 'relative', flexShrink: 0 }}>
                              <img 
                                src={resolveAvatarUrl(app.character_avatar, app.slug || app.public_id)} 
                                alt={app.character_name} 
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                  if (e.currentTarget.nextElementSibling) {
                                    e.currentTarget.nextElementSibling.style.display = 'flex';
                                  }
                                }}
                                style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--border-subtle)' }} 
                              />
                              <div style={{ display: 'none', width: '100%', height: '100%', borderRadius: '50%', background: 'rgba(139, 92, 246, 0.2)', alignItems: 'center', justifyContent: 'center' }}>
                                <FileText size={16} color="var(--accent-purple-light)" />
                              </div>
                            </div>
                          ) : (
                            <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(139, 92, 246, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <FileText size={16} color="var(--accent-purple-light)" />
                            </div>
                          )}
                          <div>
                            <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{app.character_name}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                              slug: {app.slug} • Слот {app.slot || 1}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td style={{ padding: '14px 16px', color: 'var(--text-dim)' }}>
                        {app.attribute_name ? (
                          <span className="badge badge-purple" style={{ fontSize: '0.72rem' }}>
                            {app.attribute_name}
                          </span>
                        ) : '—'}
                      </td>

                      <td style={{ padding: '14px 16px', color: 'var(--text-dim)' }}>
                        {app.organization || 'Не состоит'}
                      </td>

                      <td style={{ padding: '14px 16px' }}>
                        <span className="badge badge-default" style={{ fontSize: '0.74rem', fontWeight: 700 }}>
                          {app.rank || '—'}
                        </span>
                      </td>

                      <td style={{ padding: '14px 16px' }}>
                        {statusBadge}
                      </td>

                      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <Link
                            to={`/admin/applications/edit/${app.slug || app.public_id}`}
                            className="btn btn-secondary btn-sm"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', fontSize: '0.78rem' }}
                          >
                            <Edit3 size={13} color="var(--accent-purple-light)" />
                            <span>Редактор</span>
                          </Link>

                          <button 
                            onClick={() => setInspectingApp(app)}
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '4px 8px' }}
                            title="Быстрый просмотр"
                          >
                            <Eye size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="empty-state">
          <div className="empty-state-icon"><FileText size={40} color="var(--accent-purple-light)" /></div>
          <h3 className="empty-state-title">Анкеты не найдены</h3>
        </div>
      )}

      {/* Inspection Modal */}
      {inspectingApp && (
        <div 
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
          onClick={() => setInspectingApp(null)}
        >
          <div 
            className="card" 
            style={{ 
              maxWidth: '720px', 
              width: '100%', 
              maxHeight: '85vh', 
              overflowY: 'auto',
              padding: '28px',
              borderRadius: '16px'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>{inspectingApp.character_name}</h2>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Ранг: {inspectingApp.rank || 'F'} • Орг: {inspectingApp.organization || 'Не состоит'}
                </span>
              </div>

              <button 
                onClick={() => setInspectingApp(null)}
                className="btn btn-secondary btn-sm"
                style={{ padding: '6px' }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Sections */}
            {inspectingApp.sections && inspectingApp.sections.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {inspectingApp.sections.map((sec, idx) => (
                  <div key={idx} style={{ padding: '14px', borderRadius: '8px', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--accent-purple-light)', marginBottom: '6px' }}>
                      {sec.title}
                    </div>
                    <div style={{ fontSize: '0.84rem', color: 'var(--text-main)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                      {sec.content}
                    </div>
                  </div>
                ))}
              </div>
            ) : inspectingApp.raw_text ? (
              <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.84rem', lineHeight: 1.6, color: 'var(--text-main)', background: 'rgba(0, 0, 0, 0.2)', padding: '14px', borderRadius: '8px' }}>
                {inspectingApp.raw_text}
              </div>
            ) : (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.86rem', textAlign: 'center', padding: '20px' }}>
                Текст анкеты хранится по внешней ссылке.
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button 
                onClick={() => setInspectingApp(null)}
                className="btn btn-secondary btn-sm"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
