import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  Search, 
  BookOpen, 
  ArrowRight, 
  Layers, 
  Sparkles, 
  Clock, 
  Flame, 
  AlertCircle,
  FileText,
  ChevronRight,
  Edit3,
  Plus
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { WikiCategoryIcon } from '../components/wiki/WikiCategoryIcon';
import { WIKI_CATEGORIES } from '../constants/wikiCategories';
import canonicalArticles from '../data/canonical_articles.json';

export function WikiHomePage() {
  const { canManageWiki } = useAuth();
  const [wikiData, setWikiData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  // Build fallback data from local canonical_articles.json
  const buildLocalWikiData = () => {
    const categoriesWithArticles = WIKI_CATEGORIES.map(cat => {
      const catArticles = canonicalArticles.filter(art => art.category === cat.id);
      return {
        id: cat.id,
        name: cat.name,
        description: cat.shortDescription,
        articles_count: catArticles.length,
        articles: catArticles
      };
    });

    const featured = canonicalArticles.slice(0, 4).map(art => {
      const catInfo = WIKI_CATEGORIES.find(c => c.id === art.category);
      return {
        slug: art.slug,
        title: art.title,
        summary: art.summary,
        category: art.category,
        category_title: catInfo ? catInfo.name : art.category,
        read_time_min: Math.max(2, Math.ceil((art.content?.length || 500) / 600))
      };
    });

    return {
      wiki_tagline: "Официальная база знаний: хроники Цусимы, боевые стили Ци, классификация Скважин и реестр фракций.",
      categories: categoriesWithArticles,
      featured_articles: featured
    };
  };

  useEffect(() => {
    document.title = 'Архив мира — Wiki Verge TRP';
    let isMounted = true;

    fetch('/api/wiki', {
      headers: { 'Accept': 'application/json' }
    })
      .then(async res => {
        if (!res.ok) throw new Error(`API offline (${res.status})`);
        return res.json();
      })
      .then(data => {
        if (isMounted) setWikiData(data);
      })
      .catch(err => {
        // Graceful local canonical fallback
        if (isMounted) {
          setWikiData(buildLocalWikiData());
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => { isMounted = false; };
  }, []);

  // Debounced search (with local fallback search)
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.trim().length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    const timer = setTimeout(() => {
      fetch(`/api/wiki/search?q=${encodeURIComponent(searchQuery.trim())}`, {
        headers: { 'Accept': 'application/json' }
      })
        .then(res => res.ok ? res.json() : { results: [] })
        .then(data => {
          setSearchResults(data.results || []);
        })
        .catch(() => {
          // Local search in canonical_articles.json
          const q = searchQuery.toLowerCase();
          const localMatches = canonicalArticles.filter(art => 
            art.title?.toLowerCase().includes(q) ||
            art.summary?.toLowerCase().includes(q) ||
            art.content?.toLowerCase().includes(q) ||
            (art.tags && art.tags.some(t => t.toLowerCase().includes(q)))
          ).slice(0, 8);
          setSearchResults(localMatches);
        })
        .finally(() => setSearching(false));
    }, 200);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '120px 20px' }}>
        <div className="spinner" />
        <p style={{ marginTop: '18px', color: 'var(--text-muted)', fontSize: '0.94rem' }}>
          Загрузка архива мира Verge TRP...
        </p>
      </div>
    );
  }

  const { categories = [], featured_articles = [] } = wikiData || buildLocalWikiData();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '48px', paddingBottom: '60px' }}>
      
      {/* 1. Hero Archive Header with Standing Officer Artwork */}
      <div className="card-bezel card-bezel-cyan">
        <div className="card-inner hud-corner" style={{ padding: 'clamp(28px, 4vw, 40px)', position: 'relative', overflow: 'hidden' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            alignItems: 'center',
            gap: '32px',
            position: 'relative',
            zIndex: 2
          }}>
            {/* Left Content */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span className="badge badge-purple">
                    <BookOpen size={12} style={{ marginRight: '4px' }} />
                    АРХИВ ЛОРА VERGE TRP
                  </span>
                  <span className="badge badge-cyan">КАТАЛОГ КАНОНА</span>
                </div>

                {canManageWiki && (
                  <Link 
                    to="/admin/wiki/new" 
                    className="admin-edit-pill"
                    title="Создать новую статью в Штабе"
                  >
                    <Plus size={13} />
                    <span>Новая статья</span>
                  </Link>
                )}
              </div>

              <h1 style={{ fontSize: 'clamp(2rem, 3.8vw, 2.8rem)', fontWeight: 800, margin: '0 0 12px 0', lineHeight: 1.15, fontFamily: 'var(--font-heading)' }}>
                Энциклопедия Мира Verge
              </h1>

              <p style={{ color: 'var(--text-muted)', fontSize: '1rem', lineHeight: 1.65, margin: '0 0 28px 0', maxWidth: '600px' }}>
                {wikiData?.wiki_tagline || 'Официальная база знаний: хроники Цусимы, боевые стили Ци, классификация Скважин и реестр фракций.'}
              </p>

              {/* Quick Search Bar */}
              <div style={{ position: 'relative', maxWidth: '560px' }}>
                <div style={{ position: 'relative' }}>
                  <Search 
                    size={18} 
                    style={{ 
                      position: 'absolute', 
                      left: '16px', 
                      top: '50%', 
                      transform: 'translateY(-50%)', 
                      color: 'var(--text-dim)' 
                    }} 
                  />
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Поиск по статьям: Генезис, Скважины, Тенрью, Атрибуты, SP..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ 
                      paddingLeft: '46px', 
                      paddingRight: '36px',
                      height: '48px', 
                      fontSize: '0.94rem'
                    }}
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      style={{
                        position: 'absolute',
                        right: '14px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                        fontSize: '1.1rem'
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Instant Search Dropdown */}
                {searchQuery.trim().length >= 2 && (
                  <div 
                    className="card-bezel"
                    style={{
                      position: 'absolute',
                      top: '56px',
                      left: 0,
                      right: 0,
                      zIndex: 40
                    }}
                  >
                    <div className="card-inner" style={{ padding: '10px', maxHeight: '380px', overflowY: 'auto' }}>
                      {searching ? (
                        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                          <div className="spinner" style={{ width: '24px', height: '24px', margin: '0 auto 8px' }} />
                          Поиск по материалам...
                        </div>
                      ) : searchResults.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {searchResults.map((art) => (
                            <Link
                              key={art.slug}
                              to={`/wiki/${art.category}/${art.slug}`}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '10px 14px',
                                borderRadius: 'var(--radius-sm)',
                                color: 'var(--text-main)',
                                background: 'rgba(255, 255, 255, 0.03)',
                                transition: 'all var(--transition-fast)'
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <WikiCategoryIcon category={art.category} size={16} />
                                <div>
                                  <div style={{ fontWeight: 700, fontSize: '0.92rem' }}>{art.title}</div>
                                  <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                                    {art.summary?.slice(0, 75)}...
                                  </div>
                                </div>
                              </div>
                              <ArrowRight size={14} color="var(--text-muted)" />
                            </Link>
                          ))}
                        </div>
                      ) : (
                        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                          Ничего не найдено по запросу «{searchQuery}»
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right Officer Artwork Illustration */}
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              position: 'relative'
            }}>
              <div style={{
                position: 'absolute',
                width: '240px',
                height: '240px',
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(6, 182, 212, 0.25) 0%, transparent 70%)',
                filter: 'blur(28px)'
              }} />
              <img 
                src="/assets/character/standing_fullbody.png" 
                alt="Куратор Архива" 
                style={{
                  maxHeight: '320px',
                  objectFit: 'contain',
                  position: 'relative',
                  zIndex: 1,
                  filter: 'drop-shadow(0 12px 28px rgba(0,0,0,0.6))'
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 2. Featured / Canonical Articles Carousel */}
      {featured_articles.length > 0 && (
        <section>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
            <Sparkles size={18} color="var(--accent-purple-light)" />
            <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Ключевые статьи канона</h2>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '18px'
          }}>
            {featured_articles.map((art) => (
              <div key={art.slug} className="card-bezel card-bezel-crimson">
                <div className="card-inner" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '22px' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <span className="badge badge-purple">{art.category_title || art.category}</span>
                      <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Clock size={12} /> {art.read_time_min || 3} мин
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
                      <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>{art.title}</h3>
                      {canManageWiki && (
                        <Link
                          to={`/admin/wiki/edit/${art.slug}`}
                          className="admin-card-pencil"
                          title={`Редактировать «${art.title}» в Штабе`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Edit3 size={13} />
                        </Link>
                      )}
                    </div>
                    <p style={{ fontSize: '0.86rem', color: 'var(--text-muted)', lineHeight: 1.55 }}>
                      {art.summary || 'Ключевая хроника ролевой вселенной Verge TRP.'}
                    </p>
                  </div>
                  <Link 
                    to={`/wiki/${art.category}/${art.slug}`}
                    className="btn btn-secondary btn-sm"
                    style={{ alignSelf: 'flex-start', marginTop: '16px' }}
                  >
                    <span>Читать статью</span>
                    <span className="btn-icon-bubble">
                      <ChevronRight size={13} />
                    </span>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 3. Category Directories Matrix */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
          <Layers size={18} color="var(--accent-cyan-light)" />
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Разделы энциклопедии</h2>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '20px'
        }}>
          {categories.map((cat) => (
            <div key={cat.id} className="card-bezel">
              <div className="card-inner" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '24px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
                    <div style={{
                      width: '42px',
                      height: '42px',
                      borderRadius: '12px',
                      background: 'rgba(139, 92, 246, 0.15)',
                      border: '1px solid rgba(139, 92, 246, 0.3)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <WikiCategoryIcon category={cat.id} size={22} />
                    </div>
                    <div>
                      <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>{cat.name}</h3>
                      <span style={{ fontSize: '0.76rem', color: 'var(--text-dim)' }}>
                        {cat.articles_count || (cat.articles?.length || 0)} материалов
                      </span>
                    </div>
                  </div>

                  <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.55, marginBottom: '16px' }}>
                    {cat.description}
                  </p>

                  {/* Top 3 Articles in this Category */}
                  {cat.articles && cat.articles.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '18px' }}>
                      {cat.articles.slice(0, 3).map(art => (
                        <Link 
                          key={art.slug} 
                          to={`/wiki/${cat.id}/${art.slug}`}
                          style={{
                            fontSize: '0.84rem',
                            color: 'var(--text-muted)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            transition: 'color var(--transition-fast)'
                          }}
                          onMouseEnter={e => e.currentTarget.style.color = 'var(--accent-purple-light)'}
                          onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                        >
                          <ChevronRight size={13} color="var(--accent-purple)" />
                          <span>{art.title}</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>

                <Link 
                  to={`/wiki/${cat.id}`}
                  className="btn btn-secondary btn-sm"
                  style={{ alignSelf: 'flex-start' }}
                >
                  <span>Перейти в раздел</span>
                  <span className="btn-icon-bubble">
                    <ChevronRight size={13} />
                  </span>
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
