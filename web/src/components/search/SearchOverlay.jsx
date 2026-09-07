import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  Search, 
  X, 
  BookOpen, 
  User, 
  FileText, 
  ArrowRight, 
  Sparkles, 
  Clock, 
  CornerDownLeft,
  ChevronRight
} from 'lucide-react';
import { SearchHighlight } from './SearchHighlight';

export function SearchOverlay({ isOpen, onClose }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const previousActiveElement = useRef(null);
  const navigate = useNavigate();

  // Capture previous focus element and auto-focus input
  useEffect(() => {
    if (isOpen) {
      previousActiveElement.current = document.activeElement;
      setTimeout(() => {
        if (inputRef.current) inputRef.current.focus();
      }, 50);
      setSelectedIndex(0);
    } else {
      if (previousActiveElement.current && typeof previousActiveElement.current.focus === 'function') {
        previousActiveElement.current.focus();
      }
    }
  }, [isOpen]);

  // Debounced search query
  useEffect(() => {
    if (!isOpen) return;
    const cleanQ = query.trim();

    if (cleanQ.length < 2) {
      setResults([]);
      setLoading(false);
      setSelectedIndex(0);
      return;
    }

    setLoading(true);
    const handler = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(cleanQ)}&limit=15`, {
        headers: { 'Accept': 'application/json' }
      })
        .then(async res => {
          if (!res.ok) return { results: [] };
          return res.json();
        })
        .then(data => {
          setResults(data.results || []);
          setSelectedIndex(0);
        })
        .catch(() => {
          setResults([]);
        })
        .finally(() => {
          setLoading(false);
        });
    }, 180);

    return () => clearTimeout(handler);
  }, [query, isOpen]);

  // Keyboard navigation
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }

    if (results.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % results.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + results.length) % results.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const selected = results[selectedIndex];
        if (selected && selected.url) {
          onClose();
          navigate(selected.url);
        } else if (query.trim().length >= 2) {
          onClose();
          navigate(`/search?q=${encodeURIComponent(query.trim())}`);
        }
      }
    } else if (e.key === 'Enter' && query.trim().length >= 2) {
      e.preventDefault();
      onClose();
      navigate(`/search?q=${encodeURIComponent(query.trim())}`);
    }
  };

  if (!isOpen) return null;

  const getTypeBadge = (type) => {
    switch (type) {
      case 'character':
        return (
          <span className="badge badge-cyan" style={{ fontSize: '0.68rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <User size={11} /> Персонаж
          </span>
        );
      case 'application':
        return (
          <span className="badge badge-purple" style={{ fontSize: '0.68rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <FileText size={11} /> Анкета
          </span>
        );
      case 'wiki':
      default:
        return (
          <span className="badge badge-emerald" style={{ fontSize: '0.68rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <BookOpen size={11} /> Wiki
          </span>
        );
    }
  };

  return (
    <div 
      className="search-overlay-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(5, 4, 10, 0.82)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '80px 16px 20px',
        animation: 'fadeIn 0.15s ease'
      }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Глобальный поиск Verge TRP"
    >
      <div 
        className="card"
        style={{
          maxWidth: '640px',
          width: '100%',
          maxHeight: '75vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          borderRadius: '16px',
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(139, 92, 246, 0.25)',
          overflow: 'hidden',
          background: 'rgba(15, 13, 24, 0.95)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Search Input Bar */}
        <div 
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-color)',
            background: 'rgba(255, 255, 255, 0.02)'
          }}
        >
          <Search size={20} color={query ? 'var(--accent-purple-light)' : 'var(--text-muted)'} />
          
          <input
            ref={inputRef}
            type="text"
            className="search-overlay-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Поиск персонажей, анкет, организаций и терминов лора..."
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text-main)',
              fontSize: '1.05rem',
              fontWeight: 500
            }}
          />

          {loading ? (
            <div className="spinner" style={{ width: '18px', height: '18px' }} />
          ) : query ? (
            <button 
              onClick={() => setQuery('')}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
              title="Очистить"
            >
              <X size={16} />
            </button>
          ) : (
            <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', background: 'rgba(255, 255, 255, 0.06)', padding: '2px 6px', borderRadius: '4px' }}>
              ESC
            </span>
          )}
        </div>

        {/* Results / Discovery Container */}
        <div style={{ flex: 1, overflowY: 'auto', maxHeight: '55vh', padding: '8px' }}>
          
          {query.trim().length >= 2 ? (
            results.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {results.map((res, index) => {
                  const isSelected = index === selectedIndex;
                  return (
                    <div
                      key={res.url + index}
                      onClick={() => {
                        onClose();
                        navigate(res.url);
                      }}
                      onMouseEnter={() => setSelectedIndex(index)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px',
                        padding: '12px 14px',
                        borderRadius: '10px',
                        cursor: 'pointer',
                        background: isSelected ? 'rgba(139, 92, 246, 0.15)' : 'transparent',
                        border: isSelected ? '1px solid rgba(139, 92, 246, 0.3)' : '1px solid transparent',
                        transition: 'all 0.1s ease'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                        {res.image ? (
                          <img 
                            src={res.image} 
                            alt={res.title} 
                            style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                          />
                        ) : (
                          <div 
                            style={{ 
                              width: '36px', 
                              height: '36px', 
                              borderRadius: '8px', 
                              background: res.type === 'character' ? 'rgba(6, 182, 212, 0.15)' : res.type === 'application' ? 'rgba(139, 92, 246, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0
                            }}
                          >
                            {res.type === 'character' && <User size={18} color="var(--accent-cyan)" />}
                            {res.type === 'application' && <FileText size={18} color="var(--accent-purple-light)" />}
                            {res.type === 'wiki' && <BookOpen size={18} color="var(--accent-emerald)" />}
                          </div>
                        )}

                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 600, fontSize: '0.92rem', color: 'var(--text-main)' }}>
                              <SearchHighlight text={res.title} query={query} />
                            </span>
                            {getTypeBadge(res.type)}
                          </div>
                          
                          <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {res.subtitle && <span>{res.subtitle} • </span>}
                            <SearchHighlight text={res.description} query={query} />
                          </div>
                        </div>
                      </div>

                      <ChevronRight size={16} color={isSelected ? 'var(--accent-purple-light)' : 'var(--text-dim)'} style={{ flexShrink: 0 }} />
                    </div>
                  );
                })}
              </div>
            ) : !loading ? (
              <div style={{ textAlign: 'center', padding: '36px 20px', color: 'var(--text-muted)' }}>
                <p style={{ margin: 0, fontSize: '0.92rem' }}>По запросу «<strong>{query}</strong>» ничего не найдено.</p>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)', display: 'block', marginTop: '6px' }}>
                  Попробуйте изменить формулировку, проверить написание или поискать по ключевым терминам.
                </span>
              </div>
            ) : null
          ) : (
            /* Empty Discovery Suggestions */
            <div style={{ padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Популярные разделы базы знаний
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '8px' }}>
                {[
                  { label: 'Скважины и Данжи', url: '/wiki/phenomena/boreholes' },
                  { label: 'Ассоциация Tenryu', url: '/wiki/organizations/tenryu' },
                  { label: 'Стражи Мира', url: '/wiki/organizations/guardians-of-peace' },
                  { label: 'Атрибуты и Способности', url: '/wiki/mechanics/attributes-and-powers' },
                  { label: 'Боевые искусства (Ци)', url: '/wiki/martial-arts/martial-arts-and-qi' },
                  { label: 'Реестр анкет', url: '/applications' }
                ].map(item => (
                  <Link
                    key={item.url}
                    to={item.url}
                    onClick={onClose}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '8px',
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid var(--border-color)',
                      textDecoration: 'none',
                      color: 'var(--text-main)',
                      fontSize: '0.82rem',
                      fontWeight: 500,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <span>{item.label}</span>
                    <ArrowRight size={12} color="var(--text-dim)" />
                  </Link>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Footer Navigation Hints */}
        <div 
          style={{
            padding: '10px 20px',
            borderTop: '1px solid var(--border-color)',
            background: 'rgba(0, 0, 0, 0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.74rem',
            color: 'var(--text-dim)'
          }}
        >
          <div style={{ display: 'flex', gap: '14px' }}>
            <span><kbd style={{ background: 'rgba(255, 255, 255, 0.08)', padding: '2px 5px', borderRadius: '3px' }}>↑</kbd> <kbd style={{ background: 'rgba(255, 255, 255, 0.08)', padding: '2px 5px', borderRadius: '3px' }}>↓</kbd> Навигация</span>
            <span><kbd style={{ background: 'rgba(255, 255, 255, 0.08)', padding: '2px 5px', borderRadius: '3px' }}>↵</kbd> Выбрать</span>
          </div>

          {query.trim().length >= 2 && (
            <Link 
              to={`/search?q=${encodeURIComponent(query.trim())}`}
              onClick={onClose}
              style={{ color: 'var(--accent-purple-light)', textDecoration: 'none', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              Все результаты ({results.length}) <ArrowRight size={12} />
            </Link>
          )}
        </div>

      </div>
    </div>
  );
}
