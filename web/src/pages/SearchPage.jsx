import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { 
  Search, 
  User, 
  FileText, 
  BookOpen, 
  ArrowRight, 
  AlertCircle,
  Filter,
  Sparkles
} from 'lucide-react';
import { SearchHighlight } from '../components/search/SearchHighlight';

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryParam = searchParams.get('q') || '';
  const typeParam = searchParams.get('type') || 'all';

  const [inputQuery, setInputQuery] = useState(queryParam);
  const [activeType, setActiveType] = useState(typeParam);
  const [results, setResults] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    document.title = queryParam ? `Поиск: «${queryParam}» — Verge TRP` : 'Глобальный поиск — Verge TRP';
    setInputQuery(queryParam);
    setActiveType(typeParam);

    if (!queryParam || queryParam.trim().length < 2) {
      setResults([]);
      setTotalCount(0);
      return;
    }

    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    params.set('q', queryParam.trim());
    if (typeParam !== 'all') params.set('type', typeParam);
    params.set('limit', '30');

    fetch(`/api/search?${params.toString()}`, {
      headers: { 'Accept': 'application/json' }
    })
      .then(async res => {
        if (!res.ok) throw new Error(`Ошибка поиска (${res.status})`);
        return res.json();
      })
      .then(data => {
        setResults(data.results || []);
        setTotalCount(data.total || 0);
      })
      .catch(err => {
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [queryParam, typeParam]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (inputQuery.trim().length >= 2) {
      setSearchParams({ q: inputQuery.trim(), type: activeType });
    }
  };

  const handleTypeChange = (newType) => {
    setActiveType(newType);
    if (queryParam) {
      setSearchParams({ q: queryParam, type: newType });
    }
  };

  const getTypeBadge = (type) => {
    switch (type) {
      case 'character':
        return <span className="badge badge-cyan" style={{ fontSize: '0.72rem' }}><User size={12} /> Персонаж</span>;
      case 'application':
        return <span className="badge badge-purple" style={{ fontSize: '0.72rem' }}><FileText size={12} /> Анкета</span>;
      case 'wiki':
      default:
        return <span className="badge badge-emerald" style={{ fontSize: '0.72rem' }}><BookOpen size={12} /> Wiki</span>;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', paddingBottom: '80px', maxWidth: '840px', margin: '0 auto', width: '100%' }}>
      
      {/* Top Header */}
      <div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0 }}>Глобальный поиск</h1>
        <span style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>
          Единый поиск по досье персонажей, архиву анкет и энциклопедии канонического мира
        </span>
      </div>

      {/* Main Search Input Form */}
      <div className="card" style={{ padding: '16px 20px', borderRadius: '12px' }}>
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '10px' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="input-field"
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              placeholder="Введите имя, ранг, способность или понятие лора..."
              style={{ paddingLeft: '40px', height: '42px', fontSize: '0.94rem' }}
            />
          </div>
          <button type="submit" className="btn btn-primary" style={{ padding: '0 20px', height: '42px' }}>
            Найти
          </button>
        </form>

        {/* Filter Tabs */}
        <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid rgba(255, 255, 255, 0.05)', paddingTop: '14px', marginTop: '14px', flexWrap: 'wrap' }}>
          {[
            { id: 'all', label: 'Все результаты' },
            { id: 'characters', label: 'Персонажи' },
            { id: 'applications', label: 'Анкеты' },
            { id: 'wiki', label: 'Энциклопедия (Wiki)' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => handleTypeChange(tab.id)}
              className={`btn btn-sm ${activeType === tab.id ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: '0.8rem', padding: '5px 14px' }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Results Header & Counter */}
      {queryParam && !loading && (
        <div style={{ fontSize: '0.86rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
          <span>
            По запросу «<strong>{queryParam}</strong>» найдено {totalCount} {totalCount === 1 ? 'совпадение' : 'совпадений'}
          </span>
        </div>
      )}

      {/* Results List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '80px 20px' }}>
          <div className="spinner" />
          <p style={{ marginTop: '14px', color: 'var(--text-muted)' }}>Поиск по базе знаний...</p>
        </div>
      ) : error ? (
        <div className="empty-state">
          <div className="empty-state-icon"><AlertCircle size={36} color="#fca5a5" /></div>
          <h3 className="empty-state-title">Ошибка выполнения поиска</h3>
          <p className="empty-state-desc">{error}</p>
        </div>
      ) : results.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {results.map((res, idx) => (
            <Link
              key={res.url + idx}
              to={res.url}
              className="card"
              style={{
                padding: '18px 20px',
                borderRadius: '12px',
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '16px',
                transition: 'all 0.15s ease'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', minWidth: 0 }}>
                {res.image ? (
                  <div style={{ width: '44px', height: '44px', borderRadius: '50%', overflow: 'hidden', position: 'relative', flexShrink: 0 }}>
                    <img 
                      src={res.image} 
                      alt={res.title} 
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        if (e.currentTarget.nextElementSibling) {
                          e.currentTarget.nextElementSibling.style.display = 'flex';
                        }
                      }}
                      style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
                    />
                    <div 
                      style={{ 
                        display: 'none',
                        width: '100%', 
                        height: '100%', 
                        borderRadius: '50%', 
                        background: res.type === 'character' ? 'rgba(6, 182, 212, 0.15)' : res.type === 'application' ? 'rgba(139, 92, 246, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: res.type === 'character' ? 'var(--accent-cyan)' : res.type === 'application' ? 'var(--accent-purple-light)' : 'var(--accent-emerald)'
                      }}
                    >
                      {res.type === 'character' && <User size={20} />}
                      {res.type === 'application' && <FileText size={20} />}
                      {res.type === 'wiki' && <BookOpen size={20} />}
                    </div>
                  </div>
                ) : (
                  <div 
                    style={{ 
                      width: '44px', 
                      height: '44px', 
                      borderRadius: '10px', 
                      background: res.type === 'character' ? 'rgba(6, 182, 212, 0.15)' : res.type === 'application' ? 'rgba(139, 92, 246, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}
                  >
                    {res.type === 'character' && <User size={22} color="var(--accent-cyan)" />}
                    {res.type === 'application' && <FileText size={22} color="var(--accent-purple-light)" />}
                    {res.type === 'wiki' && <BookOpen size={22} color="var(--accent-emerald)" />}
                  </div>
                )}

                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <h2 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>
                      <SearchHighlight text={res.title} query={queryParam} />
                    </h2>
                    {getTypeBadge(res.type)}
                  </div>

                  {res.subtitle && (
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: '2px', fontWeight: 500 }}>
                      {res.subtitle}
                    </div>
                  )}

                  <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', margin: '6px 0 0', lineHeight: 1.5 }}>
                    <SearchHighlight text={res.description} query={queryParam} />
                  </p>
                </div>
              </div>

              <ArrowRight size={18} color="var(--accent-purple-light)" style={{ flexShrink: 0 }} />
            </Link>
          ))}
        </div>
      ) : queryParam.trim().length >= 2 ? (
        <div className="empty-state" style={{ padding: '60px 20px' }}>
          <div className="empty-state-icon"><Search size={40} color="var(--text-muted)" /></div>
          <h3 className="empty-state-title">Ничего не найдено</h3>
          <p className="empty-state-desc">
            По запросу «{queryParam}» результатов не обнаружено. Попробуйте поискать по другим ключевым словам.
          </p>
        </div>
      ) : (
        /* Discovery Quick Links */
        <div className="card" style={{ padding: '24px', borderRadius: '12px', textAlign: 'center' }}>
          <Sparkles size={32} color="var(--accent-purple-light)" style={{ margin: '0 auto 12px' }} />
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 6px' }}>Начните поиск по вселенной Verge TRP</h3>
          <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', maxWidth: '460px', margin: '0 auto 20px' }}>
            Вы можете искать статьи энциклопедии, анкеты участников, имена персонажей, организации или уникальные боевые атрибуты.
          </p>

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
            {['Хана Ками', 'Скважины', 'Tenryu', 'Стражи Мира', 'Кровавое Тхэквондо', 'Маджин'].map(term => (
              <button
                key={term}
                onClick={() => {
                  setInputQuery(term);
                  setSearchParams({ q: term, type: activeType });
                }}
                className="btn btn-secondary btn-sm"
                style={{ fontSize: '0.8rem' }}
              >
                {term}
              </button>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
