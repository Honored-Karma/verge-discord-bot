import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { 
  FileText, 
  Search, 
  Flame, 
  Shield, 
  ChevronLeft, 
  ChevronRight, 
  ExternalLink,
  Globe,
  Award,
  Sparkles,
  User
} from 'lucide-react';
import sampleApplications from '../data/sampleApplications.json';
import { resolveAvatarUrl } from '../utils/imageHelper';

export function ApplicationsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = parseInt(searchParams.get('page') || '1', 10);
  const search = searchParams.get('search') || '';
  const org = searchParams.get('org') || '';

  const [searchInput, setSearchInput] = useState(search);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const buildLocalApplicationsData = () => {
    let filtered = [...sampleApplications];
    if (org) {
      filtered = filtered.filter(a => a.organization === org);
    }
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(a => 
        a.character_name?.toLowerCase().includes(q) ||
        a.attribute_name?.toLowerCase().includes(q) ||
        a.organization?.toLowerCase().includes(q)
      );
    }
    return {
      items: filtered,
      totalCount: filtered.length,
      totalPages: 1,
      currentPage: 1
    };
  };

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);

    const query = new URLSearchParams();
    query.set('page', String(page));
    query.set('limit', '12');
    if (search) query.set('search', search);
    if (org) query.set('organization', org);

    fetch(`/api/applications?${query.toString()}`, {
      headers: { 'Accept': 'application/json' }
    })
      .then(async res => {
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.message || `Ошибка загрузки реестра (${res.status})`);
        }
        return res.json();
      })
      .then(resData => {
        if (isMounted) {
          setData(resData);
        }
      })
      .catch(err => {
        if (isMounted) {
          setData(buildLocalApplicationsData());
        }
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false);
        }
      });

    return () => { isMounted = false; };
  }, [page, search, org]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    const newParams = new URLSearchParams(searchParams);
    if (searchInput.trim()) {
      newParams.set('search', searchInput.trim());
    } else {
      newParams.delete('search');
    }
    newParams.set('page', '1');
    setSearchParams(newParams);
  };

  const handleOrgChange = (newOrg) => {
    const newParams = new URLSearchParams(searchParams);
    if (newOrg) {
      newParams.set('org', newOrg);
    } else {
      newParams.delete('org');
    }
    newParams.set('page', '1');
    setSearchParams(newParams);
  };

  const handlePageChange = (newPage) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set('page', String(newPage));
    setSearchParams(newParams);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const items = data?.items || [];
  const totalPages = data?.totalPages || 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      {/* Header Banner */}
      <div className="card-bezel card-bezel-crimson">
        <div className="card-inner hud-corner" style={{ padding: '32px' }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '24px'
          }}>
            <div style={{ maxWidth: '640px' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }} className="badge badge-purple">
                <FileText size={14} />
                РЕЕСТР ПРИНЯТЫХ АНКЕТ
              </div>
              <h1 style={{ fontSize: '2rem', fontFamily: 'var(--font-heading)', fontWeight: 800, marginBottom: '8px' }}>
                Персонажи мира Verge TRP
              </h1>
              <p style={{ fontSize: '0.94rem', color: 'var(--text-muted)', lineHeight: 1.65 }}>
                Официальный каталог одобренных анкет игроков. Здесь собраны истории, способности и досье жителей Токио, Сеула и аномальной зоны Цусимы.
              </p>
            </div>

            {/* Tactical Mascot Preview Badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <img 
                src="/assets/character/standing_fullbody.png" 
                alt="Verge Archivist"
                style={{ maxHeight: '120px', objectFit: 'contain', filter: 'drop-shadow(0 6px 16px rgba(0,0,0,0.5))' }}
              />
            </div>
          </div>

          {/* Search and Filters Bar */}
          <div style={{ marginTop: '28px', display: 'flex', flexWrap: 'wrap', gap: '14px', alignItems: 'center', justifyContent: 'space-between' }}>
            {/* Search Form */}
            <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '10px', flex: '1 1 280px', maxWidth: '440px' }}>
              <div style={{ position: 'relative', width: '100%' }}>
                <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
                <input 
                  type="text"
                  placeholder="Поиск по имени, атрибуту или организации..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="form-input"
                  style={{ paddingLeft: '36px' }}
                />
              </div>
              <button type="submit" className="btn btn-secondary btn-sm" style={{ padding: '0 18px' }}>
                Найти
              </button>
            </form>

            {/* Organization Filter Pill Buttons */}
            <div style={{
              display: 'flex',
              background: 'rgba(255, 255, 255, 0.05)',
              padding: '4px',
              borderRadius: 'var(--radius-pill)',
              border: '1px solid var(--border-subtle)',
              overflowX: 'auto',
              maxWidth: '100%'
            }}>
              {[
                { id: '', label: 'Все фракции' },
                { id: 'TENRYU', label: 'TENRYU' },
                { id: 'Стражи Мира', label: 'Стражи Мира' },
                { id: 'Мрачный Блеск', label: 'Мрачный Блеск' },
                { id: 'Затмение', label: 'Затмение' }
              ].map((f) => (
                <button 
                  key={f.id}
                  style={{
                    padding: '5px 12px',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    borderRadius: 'var(--radius-pill)',
                    background: org === f.id ? 'var(--accent-purple)' : 'transparent',
                    color: org === f.id ? '#ffffff' : 'var(--text-muted)',
                    whiteSpace: 'nowrap',
                    transition: 'all var(--transition-fast)'
                  }}
                  onClick={() => handleOrgChange(f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Content Area */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '100px 20px' }}>
          <div className="spinner" />
          <p style={{ marginTop: '18px', color: 'var(--text-muted)', fontSize: '0.94rem' }}>
            Загрузка принятых анкет...
          </p>
        </div>
      ) : error ? (
        <div className="card-bezel card-bezel-crimson">
          <div className="card-inner" style={{ textAlign: 'center', padding: '40px' }}>
            <h3 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: '8px' }}>Ошибка загрузки</h3>
            <p style={{ color: 'var(--text-muted)' }}>{error}</p>
          </div>
        </div>
      ) : items.length === 0 ? (
        <div className="card-bezel">
          <div className="card-inner" style={{ textAlign: 'center', padding: '48px 24px' }}>
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.05)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              color: 'var(--text-dim)'
            }}>
              <Search size={28} />
            </div>
            <h3 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: '8px' }}>Анкеты не найдены</h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
              По заданным фильтрам не найдено ни одной принятой анкеты. Попробуйте сбросить параметры поиска.
            </p>
            <button 
              onClick={() => { setSearchInput(''); handleOrgChange(''); }}
              className="btn btn-secondary btn-sm"
            >
              Сбросить фильтры
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Applications Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '20px' }}>
            {items.map((app) => {
              const overview = app.sections?.find(s => s.key === 'overview')?.content || app.sections?.[0]?.content || '';
              const excerpt = overview.split('\n')[0] || 'Анкета принята и проверена анкетологами Verge TRP.';

              return (
                <div key={app.slug} className="card-bezel">
                  <div className="card-inner" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '22px' }}>
                    <div>
                      {/* Card Header */}
                      <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '14px' }}>
                        <img 
                          src={resolveAvatarUrl(app.character_avatar, app.slug || app.public_id) || '/assets/character/hero_portrait.png'} 
                          alt={app.character_name}
                          loading="lazy"
                          onError={(e) => {
                            e.currentTarget.onerror = null;
                            e.currentTarget.src = '/assets/character/hero_portrait.png';
                          }}
                          style={{
                            width: '54px',
                            height: '54px',
                            borderRadius: '12px',
                            objectFit: 'cover',
                            border: '1px solid rgba(139, 92, 246, 0.4)',
                            background: 'var(--bg-surface)'
                          }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {app.character_name}
                          </h3>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            <span>Автор:</span>
                            <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>@{app.author_username || 'Неизвестно'}</span>
                          </div>
                        </div>
                      </div>

                      {/* Attribute & Org Badges */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
                        {app.attribute_name && (
                          <span className="badge badge-amber" style={{ fontSize: '0.68rem', padding: '2px 8px' }}>
                            <Flame size={11} />
                            {app.attribute_name}
                          </span>
                        )}
                        {app.organization && (
                          <span className="badge badge-cyan" style={{ fontSize: '0.68rem', padding: '2px 8px' }}>
                            <Globe size={11} />
                            {app.organization}
                          </span>
                        )}
                        {app.rank && (
                          <span className="badge badge-purple" style={{ fontSize: '0.68rem', padding: '2px 8px' }}>
                            {app.rank}
                          </span>
                        )}
                      </div>

                      {/* Excerpt */}
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.55, margin: 0 }}>
                        {excerpt.length > 130 ? `${excerpt.slice(0, 130)}...` : excerpt}
                      </p>
                    </div>

                    {/* Footer Links */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-subtle)', paddingTop: '14px', marginTop: '18px' }}>
                      <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)' }}>
                        {app.verified_at ? new Date(app.verified_at).toLocaleDateString('ru-RU') : 'Проверено'}
                      </span>
                      <Link 
                        to={`/applications/${app.slug}`} 
                        className="btn btn-secondary btn-sm"
                      >
                        <span>Смотреть досье</span>
                        <span className="btn-icon-bubble">
                          <ChevronRight size={12} />
                        </span>
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginTop: '20px' }}>
              <button 
                onClick={() => handlePageChange(page - 1)}
                disabled={page <= 1}
                className="btn btn-secondary btn-sm"
                style={{ opacity: page <= 1 ? 0.4 : 1 }}
              >
                <ChevronLeft size={14} /> Назад
              </button>

              <span style={{ fontSize: '0.86rem', color: 'var(--text-muted)', padding: '0 12px', fontFamily: 'var(--font-mono)' }}>
                Страница {page} из {totalPages}
              </span>

              <button 
                onClick={() => handlePageChange(page + 1)}
                disabled={page >= totalPages}
                className="btn btn-secondary btn-sm"
                style={{ opacity: page >= totalPages ? 0.4 : 1 }}
              >
                Вперёд <ChevronRight size={14} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
