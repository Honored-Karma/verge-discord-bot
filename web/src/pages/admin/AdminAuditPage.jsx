import React, { useState, useEffect } from 'react';
import { 
  Clock, 
  Search, 
  Filter, 
  ShieldAlert, 
  AlertCircle, 
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  User,
  Layers
} from 'lucide-react';

export function AdminAuditPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Filters
  const [actionFilter, setActionFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState('');

  const fetchAudit = () => {
    setLoading(true);
    setError(null);

    const query = new URLSearchParams();
    query.set('page', page);
    query.set('limit', 25);
    if (actionFilter) query.set('action', actionFilter);
    if (entityFilter) query.set('entity_type', entityFilter);

    fetch(`/api/admin/audit?${query.toString()}`, {
      headers: { 'Accept': 'application/json' }
    })
      .then(async res => {
        if (!res.ok) throw new Error(`Ошибка загрузки журнала аудита (${res.status})`);
        return res.json();
      })
      .then(data => {
        setLogs(data.items || []);
        setTotalPages(data.totalPages || 1);
      })
      .catch(err => {
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    document.title = 'Журнал аудита — Панель управления';
    fetchAudit();
  }, [page, actionFilter, entityFilter]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Top Header */}
      <div>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0 }}>Журнал аудита действий</h1>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          Полная хроника административных изменений контента, модерации и синхронизаций
        </span>
      </div>

      {/* Filter Toolbar */}
      <div className="card" style={{ padding: '16px 20px', borderRadius: '12px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        <select
          className="input-field"
          value={actionFilter}
          onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
          style={{ width: 'auto', minWidth: '180px', height: '38px', fontSize: '0.86rem' }}
        >
          <option value="">Все действия</option>
          <option value="wiki_create">Создание статьи Wiki</option>
          <option value="wiki_update">Обновление статьи Wiki</option>
          <option value="wiki_publish">Публикация статьи Wiki</option>
          <option value="wiki_archive">Архивация статьи Wiki</option>
          <option value="application_sync">Синхронизация анкет</option>
          <option value="character_update">Модерация персонажа</option>
        </select>

        <select
          className="input-field"
          value={entityFilter}
          onChange={(e) => { setEntityFilter(e.target.value); setPage(1); }}
          style={{ width: 'auto', minWidth: '160px', height: '38px', fontSize: '0.86rem' }}
        >
          <option value="">Все сущности</option>
          <option value="wiki_article">Статьи Wiki</option>
          <option value="application">Анкеты</option>
          <option value="character">Персонажи</option>
        </select>
      </div>

      {/* Audit Log Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px' }}>
          <div className="spinner" />
          <p style={{ marginTop: '12px', color: 'var(--text-muted)' }}>Загрузка журнала аудита...</p>
        </div>
      ) : error ? (
        <div className="empty-state">
          <div className="empty-state-icon"><AlertCircle size={36} color="#fca5a5" /></div>
          <h3 className="empty-state-title">Ошибка при загрузке</h3>
          <p className="empty-state-desc">{error}</p>
        </div>
      ) : logs.length > 0 ? (
        <div className="card" style={{ padding: 0, borderRadius: '12px', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.84rem' }}>
              <thead>
                <tr style={{ background: 'rgba(255, 255, 255, 0.03)', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Время (UTC)</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Инициатор</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Действие</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Сущность</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Детали</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log, idx) => (
                  <tr 
                    key={log._id || idx}
                    style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)', transition: 'background 0.15s' }}
                  >
                    <td style={{ padding: '12px 16px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {new Date(log.created_at).toLocaleString('ru-RU')}
                    </td>

                    <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-main)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <User size={13} color="var(--accent-purple-light)" />
                        <span>{log.actor?.global_name || log.actor?.username || 'Admin'}</span>
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                        @{log.actor?.username}
                      </div>
                    </td>

                    <td style={{ padding: '12px 16px' }}>
                      <span className="badge badge-purple" style={{ fontSize: '0.7rem' }}>
                        {log.action}
                      </span>
                    </td>

                    <td style={{ padding: '12px 16px' }}>
                      <span className="badge badge-default" style={{ fontSize: '0.7rem' }}>
                        {log.entity_type}
                      </span>
                      {log.entity_id && (
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                          {log.entity_id}
                        </div>
                      )}
                    </td>

                    <td style={{ padding: '12px 16px', color: 'var(--text-main)', lineHeight: 1.4 }}>
                      {log.details || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', borderTop: '1px solid var(--border-color)', background: 'rgba(255, 255, 255, 0.01)' }}>
              <button
                onClick={() => setPage(prev => Math.max(1, prev - 1))}
                disabled={page <= 1}
                className="btn btn-secondary btn-sm"
                style={{ padding: '4px 10px' }}
              >
                <ChevronLeft size={14} /> Назад
              </button>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Страница {page} из {totalPages}
              </span>
              <button
                onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
                disabled={page >= totalPages}
                className="btn btn-secondary btn-sm"
                style={{ padding: '4px 10px' }}
              >
                Вперед <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="empty-state">
          <div className="empty-state-icon"><Clock size={36} color="var(--text-muted)" /></div>
          <h3 className="empty-state-title">Записей не найдено</h3>
          <p className="empty-state-desc">Журнал аудита пуст для выбранных фильтров.</p>
        </div>
      )}

    </div>
  );
}
