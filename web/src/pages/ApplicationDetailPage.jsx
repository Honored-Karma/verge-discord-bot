import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { 
  FileText, 
  Flame, 
  Shield, 
  Package, 
  ExternalLink, 
  ChevronRight, 
  AlertCircle, 
  Clock, 
  BookOpen, 
  ArrowLeft,
  Info,
  Globe,
  UserCheck,
  Edit3
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import sampleApplications from '../data/sampleApplications.json';
import { resolveAvatarUrl } from '../utils/imageHelper';

export function ApplicationDetailPage() {
  const { slug } = useParams();
  const { canManageApplications } = useAuth();
  const [app, setApp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);

    fetch(`/api/applications/${slug}`, {
      headers: { 'Accept': 'application/json' }
    })
      .then(async res => {
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.message || `Анкета не найдена (${res.status})`);
        }
        return res.json();
      })
      .then(data => {
        if (isMounted) {
          setApp(data.application || null);
        }
      })
      .catch(err => {
        if (isMounted) {
          const localMatch = sampleApplications.find(a => a.slug === slug || a.character_name?.toLowerCase().includes(slug?.toLowerCase()));
          if (localMatch) {
            setApp(localMatch);
          } else {
            setError(err.message);
          }
        }
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false);
        }
      });

    return () => { isMounted = false; };
  }, [slug]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '120px 20px' }}>
        <div className="spinner" />
        <p style={{ marginTop: '18px', color: 'var(--text-muted)', fontSize: '0.94rem' }}>
          Загрузка анкеты персонажа...
        </p>
      </div>
    );
  }

  if (error || !app) {
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
          <h3 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '8px' }}>Анкета не найдена</h3>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '24px' }}>
            {error || 'Запрашиваемая анкета персонажа отсутствует в реестре.'}
          </p>
          <Link to="/applications" className="btn btn-secondary">В каталог анкет</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px', paddingBottom: '60px' }}>
      {/* Breadcrumb Navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.84rem', color: 'var(--text-muted)' }}>
        <Link to="/" style={{ color: 'var(--text-dim)' }}>Главная</Link>
        <ChevronRight size={14} />
        <Link to="/applications" style={{ color: 'var(--accent-purple-light)' }}>Анкеты</Link>
        <ChevronRight size={14} />
        <span style={{ color: 'var(--text-main)', fontWeight: 700 }}>{app.character_name}</span>
      </div>

      {/* Header Dossier */}
      {(() => {
        const bannerUrl = app.banner_url;
        const statusConfig = {
          accepted: { label: 'ОДОБРЕНО АНКЕТОЛОГАМИ', className: 'badge-emerald' },
          pending: { label: 'НА РАССМОТРЕНИИ', className: 'badge-amber' },
          needs_revision: { label: 'ТРЕБУЕТСЯ ДОРАБОТКА', className: 'badge-purple' },
          rejected: { label: 'ОТКЛОНЕНО', className: 'badge-default' }
        };
        const statusItem = statusConfig[app.status] || statusConfig.accepted;

        return (
          <div className="card-bezel card-bezel-crimson">
            <div 
              className="card-inner hud-corner" 
              style={{ 
                padding: '32px',
                position: 'relative',
                overflow: 'hidden',
                backgroundImage: bannerUrl 
                  ? `linear-gradient(to right, rgba(7, 8, 13, 0.95) 0%, rgba(7, 8, 13, 0.85) 55%, rgba(7, 8, 13, 0.6) 100%), url(${bannerUrl})` 
                  : undefined,
                backgroundSize: 'cover',
                backgroundPosition: 'center'
              }}
            >
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                  <img 
                    src={resolveAvatarUrl(app.character_avatar, app.slug || app.public_id) || '/assets/character/hero_portrait.png'} 
                    alt={app.character_name}
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = '/assets/character/hero_portrait.png';
                    }}
                    style={{
                      width: '88px',
                      height: '88px',
                      borderRadius: '16px',
                      border: '2px solid var(--accent-purple)',
                      objectFit: 'cover',
                      boxShadow: '0 8px 24px rgba(139, 92, 246, 0.4)',
                      background: 'var(--bg-surface)'
                    }}
                  />
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '6px' }}>
                      <h1 style={{ fontSize: '1.8rem', fontWeight: 800, margin: 0, fontFamily: 'var(--font-heading)' }}>
                        {app.character_name}
                      </h1>
                      <span className={`badge ${statusItem.className}`}>
                        <UserCheck size={12} />
                        {statusItem.label}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
                      {app.attribute_name && (
                        <span className="badge badge-amber">
                          <Flame size={12} />
                          {app.attribute_name}
                        </span>
                      )}
                      {app.organization && (
                        <span className="badge badge-cyan">
                          <Globe size={12} />
                          {app.organization}
                        </span>
                      )}
                      {app.rank && (
                        <span className="badge badge-purple">
                          Ранг {app.rank}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <div style={{ fontSize: '0.84rem', color: 'var(--text-dim)' }}>
                    Автор анкеты: <strong style={{ color: 'var(--text-main)' }}>@{app.author_username || 'Не указан'}</strong>
                  </div>
                  {canManageApplications && (
                    <Link 
                      to={`/admin/applications/edit/${app.slug || app.public_id || slug}`} 
                      className="admin-edit-pill"
                      title="Редактировать анкету в Штабе"
                    >
                      <Edit3 size={13} />
                      <span>Редактировать анкету</span>
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Moderator Notes Banner if present */}
      {app.moderator_notes && (
        <div className="card-bezel card-bezel-cyan">
          <div className="card-inner" style={{ padding: '18px 24px', background: 'rgba(6, 182, 212, 0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: 'var(--accent-cyan)', fontWeight: 800, fontSize: '0.88rem' }}>
              <Info size={16} />
              Вердикт и комментарии проверяющих анкетологов
            </div>
            <div style={{ fontSize: '0.88rem', color: 'var(--text-main)', lineHeight: 1.6 }}>
              {app.moderator_notes}
            </div>
          </div>
        </div>
      )}

      {/* Physical Stats Matrix if present */}
      {app.physical_stats && (app.physical_stats.punch_strength_kg || app.physical_stats.lifting_strength_kg) && (
        <div className="card-bezel">
          <div className="card-inner" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', fontWeight: 800, fontSize: '1.05rem', color: 'var(--text-main)' }}>
              <Shield size={18} color="var(--accent-purple-light)" />
              Реестр физических характеристик персонажа
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Сила удара</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-main)' }}>
                  {app.physical_stats.punch_strength_kg || '—'} кг
                </div>
              </div>

              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Подъемная сила</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-main)' }}>
                  {app.physical_stats.lifting_strength_kg || '—'} кг
                </div>
              </div>

              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Скорость бега</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-main)' }}>
                  {app.physical_stats.speed_kmh || '—'} км/ч
                </div>
              </div>

              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Скорость реакции</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-main)' }}>
                  {app.physical_stats.reaction_ms || '—'} мс
                </div>
              </div>

              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Выносливость</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--accent-cyan)' }}>
                  {app.physical_stats.stamina_percent || '—'}%
                </div>
              </div>

              <div style={{ background: 'rgba(139, 92, 246, 0.1)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(139, 92, 246, 0.3)' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Прочность тела (3×)</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--accent-purple-light)' }}>
                  {app.physical_stats.punch_strength_kg ? `${Math.round(Number(app.physical_stats.punch_strength_kg) * 3)} кг` : '—'}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sections */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {app.sections?.map((sec, idx) => (
          <div key={sec.key || idx} className="card-bezel">
            <div className="card-inner" style={{ padding: '28px' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '14px', color: 'var(--text-main)' }}>
                {sec.title || sec.key}
              </h3>
              <div style={{ color: 'var(--text-muted)', lineHeight: 1.68, fontSize: '0.94rem', whiteSpace: 'pre-wrap' }}>
                {sec.content}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Floating Quick Edit HUD button for Admins / Anketologs */}
      {canManageApplications && (
        <Link
          to={`/admin/applications/edit/${app.slug || app.public_id || slug}`}
          className="admin-floating-hud-btn"
          title="Быстрое редактирование анкеты (Штаб)"
        >
          <Edit3 size={15} color="var(--accent-crimson)" />
          <span>Редактировать анкету</span>
        </Link>
      )}
    </div>
  );
}
