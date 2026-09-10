import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { 
  ChevronRight, 
  BookOpen, 
  ArrowRight, 
  Layers, 
  AlertCircle,
  FileText,
  Edit3,
  Plus
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { WikiCategoryIcon } from '../components/wiki/WikiCategoryIcon';
import { WIKI_CATEGORIES } from '../constants/wikiCategories';
import canonicalArticles from '../data/canonical_articles.json';

export function WikiCategoryPage() {
  const { category } = useParams();
  const { canManageWiki } = useAuth();
  const [categoryData, setCategoryData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const buildLocalCategoryData = () => {
    const catInfo = WIKI_CATEGORIES.find(c => c.id === category || c.slug === category);
    if (!catInfo) return null;
    const catArticles = canonicalArticles.filter(art => art.category === catInfo.id);
    return {
      category: {
        id: catInfo.id,
        name: catInfo.name,
        description: catInfo.shortDescription
      },
      articles: catArticles
    };
  };

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);

    fetch(`/api/wiki/categories/${category}`, {
      headers: { 'Accept': 'application/json' }
    })
      .then(async res => {
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.message || `Категория не найдена (${res.status})`);
        }
        return res.json();
      })
      .then(data => {
        if (isMounted) {
          setCategoryData(data);
          document.title = `${data.category?.name || 'Раздел'} — Wiki Verge TRP`;
        }
      })
      .catch(err => {
        if (isMounted) {
          const localData = buildLocalCategoryData();
          if (localData) {
            setCategoryData(localData);
            document.title = `${localData.category?.name || 'Раздел'} — Wiki Verge TRP`;
          } else {
            setError(err.message);
          }
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => { isMounted = false; };
  }, [category]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '120px 20px' }}>
        <div className="spinner" />
        <p style={{ marginTop: '18px', color: 'var(--text-muted)', fontSize: '0.94rem' }}>
          Загрузка статей раздела...
        </p>
      </div>
    );
  }

  if (error || !categoryData) {
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
          <h3 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '8px' }}>Раздел не найден</h3>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '24px' }}>
            {error || 'Запрашиваемый раздел энциклопедии отсутствует.'}
          </p>
          <Link to="/wiki" className="btn btn-secondary">В каталог Wiki</Link>
        </div>
      </div>
    );
  }

  const { category: cat, articles = [] } = categoryData;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', paddingBottom: '60px' }}>
      {/* Breadcrumb Navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.84rem', color: 'var(--text-muted)' }}>
        <Link to="/" style={{ color: 'var(--text-dim)' }}>Главная</Link>
        <ChevronRight size={14} />
        <Link to="/wiki" style={{ color: 'var(--accent-purple-light)' }}>Wiki</Link>
        <ChevronRight size={14} />
        <span style={{ color: 'var(--text-main)', fontWeight: 700 }}>{cat.name}</span>
      </div>

      {/* Header Banner */}
      <div className="card-bezel card-bezel-cyan">
        <div className="card-inner hud-corner" style={{ padding: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '18px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '18px', flexWrap: 'wrap' }}>
              <div style={{
                width: '64px',
                height: '64px',
                borderRadius: '16px',
                background: 'rgba(139, 92, 246, 0.15)',
                border: '1px solid rgba(139, 92, 246, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <WikiCategoryIcon category={cat.id} size={32} />
              </div>
              <div>
                <span className="badge badge-purple" style={{ marginBottom: '6px' }}>РАЗДЕЛ ЭНЦИКЛОПЕДИИ</span>
                <h1 style={{ fontSize: '2rem', fontWeight: 800, margin: 0, fontFamily: 'var(--font-heading)' }}>{cat.name}</h1>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.94rem', margin: '4px 0 0 0' }}>{cat.description}</p>
              </div>
            </div>

            {canManageWiki && (
              <Link 
                to={`/admin/wiki/new?category=${cat.id}`} 
                className="admin-edit-pill"
                title={`Создать новую статью в разделе ${cat.name}`}
              >
                <Plus size={13} />
                <span>Создать статью</span>
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Articles Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: '18px'
      }}>
        {articles.map((art) => (
          <div key={art.slug} className="card-bezel">
            <div className="card-inner" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '22px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px', marginBottom: '8px' }}>
                  <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0 }}>{art.title}</h3>
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
                <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.55 }}>
                  {art.summary || 'Материал ролевой вселенной Verge TRP.'}
                </p>
              </div>
              <Link 
                to={`/wiki/${cat.id}/${art.slug}`}
                className="btn btn-secondary btn-sm"
                style={{ alignSelf: 'flex-start', marginTop: '18px' }}
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
    </div>
  );
}
