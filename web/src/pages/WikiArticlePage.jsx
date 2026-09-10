import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { 
  ChevronRight, 
  BookOpen, 
  ArrowLeft, 
  ArrowRight, 
  Share2, 
  Sparkles, 
  UserCheck, 
  AlertCircle, 
  ListTree, 
  FileText,
  Shield,
  Layers,
  Edit3
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { MarkdownReader, headingToId } from '../components/wiki/MarkdownReader';
import { WikiCategoryIcon } from '../components/wiki/WikiCategoryIcon';
import { WIKI_CATEGORIES } from '../constants/wikiCategories';
import canonicalArticles from '../data/canonical_articles.json';

export function WikiArticlePage() {
  const { category, slug } = useParams();
  const targetSlug = slug || category; // Support both /wiki/:category/:slug and /wiki/:slug
  const { canManageWiki } = useAuth();

  const [article, setArticle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tocOpen, setTocOpen] = useState(false); // Mobile toggle

  const findLocalArticle = (s) => {
    return canonicalArticles.find(a => a.slug === s || a.aliases?.includes(s)) || null;
  };

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);

    fetch(`/api/wiki/articles/${targetSlug}`, {
      headers: { 'Accept': 'application/json' }
    })
      .then(async res => {
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.message || `Статья не найдена (${res.status})`);
        }
        return res.json();
      })
      .then(data => {
        if (isMounted) {
          setArticle(data.article || null);
          if (data.article) {
            document.title = `${data.article.title} — Энциклопедия Verge TRP`;
          }
        }
      })
      .catch(err => {
        if (isMounted) {
          const localArt = findLocalArticle(targetSlug);
          if (localArt) {
            setArticle(localArt);
            document.title = `${localArt.title} — Энциклопедия Verge TRP`;
          } else {
            setError(err.message);
          }
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => { isMounted = false; };
  }, [targetSlug]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '120px 20px' }}>
        <div className="spinner" />
        <p style={{ marginTop: '18px', color: 'var(--text-muted)', fontSize: '0.94rem' }}>
          Загрузка статьи...
        </p>
      </div>
    );
  }

  if (error || !article) {
    return (
      <div className="card-bezel card-bezel-crimson" style={{ margin: '60px auto', maxWidth: '540px' }}>
        <div className="card-inner" style={{ textAlign: 'center', padding: '40px 28px' }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: 'rgba(239, 68, 68, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
            color: '#fca5a5'
          }}>
            <AlertCircle size={36} />
          </div>
          <h3 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '8px' }}>Статья не найдена</h3>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '24px' }}>
            {error || 'Запрашиваемый материал энциклопедии отсутствует или был перемещен.'}
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <Link to="/wiki" className="btn btn-secondary">В каталог Wiki</Link>
            <Link to="/" className="btn btn-primary">На главную</Link>
          </div>
        </div>
      </div>
    );
  }

  const categoryInfo = WIKI_CATEGORIES.find(c => c.id === article.category);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px', paddingBottom: '60px' }}>
      
      {/* Breadcrumb Navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.84rem', color: 'var(--text-muted)' }}>
        <Link to="/" style={{ color: 'var(--text-dim)' }}>Главная</Link>
        <ChevronRight size={14} />
        <Link to="/wiki" style={{ color: 'var(--accent-purple-light)' }}>Wiki</Link>
        <ChevronRight size={14} />
        {categoryInfo && (
          <>
            <Link to={`/wiki/${categoryInfo.id}`} style={{ color: 'var(--text-dim)' }}>
              {categoryInfo.name}
            </Link>
            <ChevronRight size={14} />
          </>
        )}
        <span style={{ color: 'var(--text-main)', fontWeight: 700 }}>{article.title}</span>
      </div>

      {/* Main Layout Grid (Article Body + Sticky Sidebar) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) 300px',
        gap: '28px',
        alignItems: 'start'
      }}>
        
        {/* Left Column: Article Content */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Article Header Card */}
          {(() => {
            const bannerUrl = article.banner_url || article.image_url;
            return (
              <div className="card-bezel card-bezel-cyan">
                <div 
                  className="card-inner hud-corner" 
                  style={{ 
                    padding: '36px 32px',
                    position: 'relative',
                    overflow: 'hidden',
                    backgroundImage: bannerUrl 
                      ? `linear-gradient(to right, rgba(7, 8, 13, 0.95) 0%, rgba(7, 8, 13, 0.85) 55%, rgba(7, 8, 13, 0.6) 100%), url(${bannerUrl})`
                      : undefined,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span className="badge badge-purple">
                        <WikiCategoryIcon category={article.category} size={13} style={{ marginRight: '4px' }} />
                        {categoryInfo?.name || article.category}
                      </span>
                      {article.status && <span className="badge badge-emerald">КАНОН VERGE</span>}
                    </div>

                    {canManageWiki && (
                      <Link 
                        to={`/admin/wiki/edit/${article.slug}`} 
                        className="admin-edit-pill"
                        title="Редактировать статью в Штабе"
                      >
                        <Edit3 size={13} />
                        <span>Редактировать статью</span>
                      </Link>
                    )}
                  </div>

                  <h1 style={{ fontSize: 'clamp(1.8rem, 3.2vw, 2.4rem)', fontWeight: 800, margin: '0 0 12px 0', lineHeight: 1.2, fontFamily: 'var(--font-heading)' }}>
                    {article.title}
                  </h1>

                  {article.summary && (
                    <p style={{ fontSize: '1.02rem', color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>
                      {article.summary}
                    </p>
                  )}

                  {/* Tags Row */}
                  {article.tags && article.tags.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '16px' }}>
                      {article.tags.map(t => (
                        <span key={t} className="badge" style={{ fontSize: '0.72rem' }}>#{t}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Article Markdown Reader */}
          <div className="card-bezel">
            <div className="card-inner" style={{ padding: '32px' }}>
              <MarkdownReader content={article.content} />
            </div>
          </div>

        </div>

        {/* Right Sidebar: Meta & Related Content */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', position: 'sticky', top: '96px' }}>
          
          {/* Infobox Card */}
          {article.infobox && typeof article.infobox === 'object' && Object.keys(article.infobox).length > 0 && (
            <div className="card-bezel card-bezel-cyan">
              <div className="card-inner" style={{ padding: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', fontSize: '0.88rem', fontWeight: 800, color: 'var(--text-main)' }}>
                  <Layers size={16} color="var(--accent-cyan)" />
                  Спецификация объекта
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.82rem' }}>
                  {Object.entries(article.infobox).map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', gap: '12px' }}>
                      <span style={{ color: 'var(--text-muted)' }}>{k}</span>
                      <span style={{ fontWeight: 600, color: 'var(--text-main)', textAlign: 'right' }}>{String(v)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Related Articles Card */}
          {article.related_articles && article.related_articles.length > 0 && (
            <div className="card-bezel">
              <div className="card-inner" style={{ padding: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', fontSize: '0.88rem', fontWeight: 800, color: 'var(--text-main)' }}>
                  <BookOpen size={16} color="var(--accent-purple)" />
                  Связанные материалы
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {article.related_articles.map((rel) => (
                    <Link
                      key={rel.slug}
                      to={`/wiki/${rel.category || article.category}/${rel.slug}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 12px',
                        borderRadius: 'var(--radius-sm)',
                        background: 'rgba(255, 255, 255, 0.03)',
                        color: 'var(--text-main)',
                        fontSize: '0.84rem',
                        fontWeight: 600,
                        transition: 'all var(--transition-fast)'
                      }}
                    >
                      <span>{rel.title}</span>
                      <ArrowRight size={13} color="var(--text-muted)" />
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Related Characters */}
          {article.related_characters && article.related_characters.length > 0 && (
            <div className="card-bezel card-bezel-crimson">
              <div className="card-inner" style={{ padding: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', fontSize: '0.88rem', fontWeight: 800, color: 'var(--text-main)' }}>
                  <Shield size={16} color="var(--accent-purple-light)" />
                  Связанные персонажи
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {article.related_characters.map((char) => (
                    <div 
                      key={char.slug}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 'var(--radius-sm)',
                        background: 'rgba(139, 92, 246, 0.08)',
                        border: '1px solid rgba(139, 92, 246, 0.2)'
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-main)' }}>
                        {char.name}
                      </div>
                      {char.role && (
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-dim)', marginTop: '2px' }}>
                          {char.role}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

        </div>

      </div>

      {/* Floating Quick Edit HUD button for Admins */}
      {canManageWiki && (
        <Link
          to={`/admin/wiki/edit/${article.slug}`}
          className="admin-floating-hud-btn"
          title="Быстрое редактирование статьи (Штаб)"
        >
          <Edit3 size={15} color="var(--accent-purple-light)" />
          <span>Редактировать статью</span>
        </Link>
      )}

    </div>
  );
}
