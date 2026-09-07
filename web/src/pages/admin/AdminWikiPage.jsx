import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  Plus, 
  Search, 
  Filter, 
  Edit3, 
  BookOpen, 
  AlertCircle, 
  CheckCircle, 
  Archive, 
  FileText,
  Clock,
  Sparkles
} from 'lucide-react';
import { WIKI_CATEGORIES } from '../../constants/wikiCategories';

export function AdminWikiPage() {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('all');

  const fetchArticles = () => {
    setLoading(true);
    setError(null);

    const queryParams = new URLSearchParams();
    if (search) queryParams.set('search', search);
    if (selectedCategory) queryParams.set('category', selectedCategory);
    if (selectedStatus !== 'all') queryParams.set('status', selectedStatus);

    fetch(`/api/admin/wiki?${queryParams.toString()}`, {
      headers: { 'Accept': 'application/json' }
    })
      .then(async res => {
        if (!res.ok) throw new Error(`Ошибка загрузки статей (${res.status})`);
        return res.json();
      })
      .then(data => {
        setArticles(data.items || []);
      })
      .catch(err => {
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    document.title = 'Управление Wiki — Панель управления Verge TRP';
    fetchArticles();
  }, [selectedCategory, selectedStatus]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchArticles();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Top Action Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0 }}>Управление статьями Wiki</h1>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Публикация, редактирование канонических и пользовательских материалов
          </span>
        </div>

        <Link to="/admin/wiki/new" className="btn btn-primary btn-sm">
          <Plus size={15} /> Создать черновик
        </Link>
      </div>

      {/* Filters & Search Toolbar */}
      <div className="card" style={{ padding: '16px 20px', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          
          {/* Search Form */}
          <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '8px', flex: 1, minWidth: '240px' }}>
            <div style={{ position: 'relative', width: '100%' }}>
              <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                className="input-field"
                placeholder="Поиск по названию или слагу..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ paddingLeft: '36px', height: '38px', fontSize: '0.86rem' }}
              />
            </div>
            <button type="submit" className="btn btn-secondary btn-sm" style={{ padding: '0 14px' }}>Найти</button>
          </form>

          {/* Category Filter */}
          <select
            className="input-field"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            style={{ width: 'auto', minWidth: '180px', height: '38px', fontSize: '0.86rem' }}
          >
            <option value="">Все категории</option>
            {WIKI_CATEGORIES.map(cat => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
        </div>

        {/* Status Tabs */}
        <div style={{ display: 'flex', gap: '6px', borderTop: '1px solid rgba(255, 255, 255, 0.05)', paddingTop: '10px' }}>
          {[
            { id: 'all', label: 'Все статьи' },
            { id: 'published', label: 'Опубликованные' },
            { id: 'draft', label: 'Черновики' },
            { id: 'archived', label: 'Архивные' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setSelectedStatus(tab.id)}
              className={`btn btn-sm ${selectedStatus === tab.id ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: '0.78rem', padding: '4px 12px' }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Articles Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px' }}>
          <div className="spinner" />
          <p style={{ marginTop: '12px', color: 'var(--text-muted)' }}>Загрузка каталога...</p>
        </div>
      ) : error ? (
        <div className="empty-state">
          <div className="empty-state-icon"><AlertCircle size={36} color="#fca5a5" /></div>
          <h3 className="empty-state-title">Ошибка при загрузке</h3>
          <p className="empty-state-desc">{error}</p>
        </div>
      ) : articles.length > 0 ? (
        <div className="card" style={{ padding: 0, borderRadius: '12px', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.86rem' }}>
              <thead>
                <tr style={{ background: 'rgba(255, 255, 255, 0.03)', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Название статьи</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Категория</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Статус</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Происхождение</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'right' }}>Действия</th>
                </tr>
              </thead>
              <tbody>
                {articles.map((art) => {
                  const isLoreImport = art.source?.type === 'verge_lore_document' || art.origin === 'lore_import';
                  const isOverridden = Boolean(art.is_manually_overridden);
                  const catName = WIKI_CATEGORIES.find(c => c.id === art.category)?.name || art.category;

                  return (
                    <tr 
                      key={art.slug} 
                      style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)', transition: 'background 0.15s' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{art.title}</div>
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                          slug: <code style={{ color: 'var(--accent-purple-light)' }}>{art.slug}</code>
                        </div>
                      </td>

                      <td style={{ padding: '14px 16px', color: 'var(--text-dim)' }}>
                        {catName}
                      </td>

                      <td style={{ padding: '14px 16px' }}>
                        {art.status === 'published' && (
                          <span className="badge badge-emerald" style={{ fontSize: '0.72rem' }}>
                            <CheckCircle size={12} /> Опубликована
                          </span>
                        )}
                        {art.status === 'draft' && (
                          <span className="badge badge-amber" style={{ fontSize: '0.72rem' }}>
                            <FileText size={12} /> Черновик
                          </span>
                        )}
                        {art.status === 'archived' && (
                          <span className="badge badge-default" style={{ fontSize: '0.72rem' }}>
                            <Archive size={12} /> В архиве
                          </span>
                        )}
                      </td>

                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                          {isLoreImport ? (
                            <span className="badge badge-purple" style={{ fontSize: '0.7rem' }}>
                              Канон (Импорт)
                            </span>
                          ) : (
                            <span className="badge badge-default" style={{ fontSize: '0.7rem' }}>
                              Ручная статья
                            </span>
                          )}

                          {isOverridden && (
                            <span className="badge badge-amber" style={{ fontSize: '0.7rem' }} title="Статья содержит ручные правки администратора">
                              Overridden
                            </span>
                          )}
                        </div>
                      </td>

                      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                        <Link 
                          to={`/admin/wiki/edit/${art.slug}`}
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                        >
                          <Edit3 size={13} /> Редактировать
                        </Link>
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
          <div className="empty-state-icon"><BookOpen size={36} color="var(--text-muted)" /></div>
          <h3 className="empty-state-title">Статей не найдено</h3>
          <p className="empty-state-desc">По заданным фильтрам материалов нет.</p>
        </div>
      )}

    </div>
  );
}
