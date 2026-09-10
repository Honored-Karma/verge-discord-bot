import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { 
  Save, 
  ArrowLeft, 
  ExternalLink, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  FileText, 
  Image as ImageIcon, 
  Sparkles, 
  Flame, 
  Globe, 
  ShieldCheck, 
  ShieldAlert, 
  Plus, 
  Trash2, 
  ChevronUp, 
  ChevronDown, 
  RotateCcw, 
  X, 
  User, 
  Layers, 
  Send,
  Wand2
} from 'lucide-react';
import { VERGE_BANNER_PRESETS } from '../../constants/bannerPresets';
import { useToast } from '../../context/ToastContext';

const STANDARD_SECTIONS = [
  { key: 'overview', title: 'Общая информация', content: '' },
  { key: 'appearance', title: 'Внешность', content: '' },
  { key: 'personality', title: 'Характер', content: '' },
  { key: 'biography', title: 'Биография', content: '' },
  { key: 'abilities', title: 'Способности и Атрибут', content: '' },
  { key: 'equipment', title: 'Снаряжение', content: '' }
];

export function AdminApplicationEditorPage() {
  const { slug } = useParams();
  const isNew = !slug || slug === 'new';
  const navigate = useNavigate();
  const { showSuccess, showError, showWarning } = useToast();

  // Core Form State
  const [characterName, setCharacterName] = useState('');
  const [applicationSlug, setApplicationSlug] = useState('');
  const [slot, setSlot] = useState(1);
  const [organization, setOrganization] = useState('TENRYU');
  const [rank, setRank] = useState('—');
  const [status, setStatus] = useState(isNew ? 'pending' : 'accepted');
  const [authorUsername, setAuthorUsername] = useState('');
  
  // Media State
  const [avatarUrl, setAvatarUrl] = useState('');
  const [bannerUrl, setBannerUrl] = useState('');
  const [showPresetModal, setShowPresetModal] = useState(false);

  // Attribute & Combat
  const [attributeName, setAttributeName] = useState('');

  // Physical Stats
  const [physicalStats, setPhysicalStats] = useState({
    punch_kg: 1000,
    durability_kg: 3000,
    lifting_kg: 200,
    speed_kmh: 30,
    reaction_ms: 100,
    stamina_percent: 100,
    is_registered: true
  });
  const [autoDurability, setAutoDurability] = useState(true);

  // Sections State
  const [sections, setSections] = useState(STANDARD_SECTIONS);
  const [moderatorNotes, setModeratorNotes] = useState('');

  // Operational State
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [originalApp, setOriginalApp] = useState(null);

  useEffect(() => {
    if (isNew) {
      document.title = 'Новая анкета персонажа — Панель управления';
      return;
    }

    document.title = `Редактирование анкеты: ${slug} — Панель управления`;
    let isMounted = true;
    setLoading(true);

    fetch(`/api/admin/applications/${slug}`, {
      headers: { 'Accept': 'application/json' }
    })
      .then(async res => {
        if (!res.ok) throw new Error(`Анкета не найдена (${res.status})`);
        return res.json();
      })
      .then(data => {
        if (isMounted && data.application) {
          const app = data.application;
          setOriginalApp(app);
          setCharacterName(app.character_name || '');
          setApplicationSlug(app.slug || '');
          const s = Number(app.slot);
          setSlot([1, 2, 3].includes(s) ? s : 1);
          setOrganization(app.organization || 'Не состоит');
          setRank(app.rank || '—');
          setStatus(app.status || 'accepted');
          setAuthorUsername(app.author_username || '');
          setAvatarUrl(app.character_avatar || '');
          setBannerUrl(app.banner_url || app.character_banner || '');
          setAttributeName(app.attribute_name || '');
          setModeratorNotes(app.moderator_notes || '');

          if (app.physical_stats) {
            setPhysicalStats({
              punch_kg: app.physical_stats.punch_kg ?? 1000,
              durability_kg: app.physical_stats.durability_kg ?? 3000,
              lifting_kg: app.physical_stats.lifting_kg ?? 200,
              speed_kmh: app.physical_stats.speed_kmh ?? 30,
              reaction_ms: app.physical_stats.reaction_ms ?? 100,
              stamina_percent: app.physical_stats.stamina_percent ?? 100,
              is_registered: Boolean(app.physical_stats.is_registered)
            });
          }

          if (Array.isArray(app.sections) && app.sections.length > 0) {
            setSections(app.sections);
          }
        }
      })
      .catch(err => {
        if (isMounted) {
          showError(err.message, 'Не удалось загрузить анкету');
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => { isMounted = false; };
  }, [slug, isNew]);

  // Handle auto durability calculation x3
  const handlePunchChange = (val) => {
    const num = Number(val) || 0;
    setPhysicalStats(prev => ({
      ...prev,
      punch_kg: num,
      durability_kg: autoDurability ? num * 3 : prev.durability_kg
    }));
  };

  // Section manipulation
  const handleSectionChange = (index, field, value) => {
    setSections(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleAddSection = () => {
    const newKey = `section_${Date.now().toString().slice(-4)}`;
    setSections(prev => [...prev, { key: newKey, title: 'Новый раздел', content: '' }]);
  };

  const handleDeleteSection = (index) => {
    if (sections.length <= 1) {
      showWarning('Анкета должна содержать хотя бы одну секцию');
      return;
    }
    setSections(prev => prev.filter((_, i) => i !== index));
  };

  const handleMoveSection = (index, direction) => {
    if ((direction === -1 && index === 0) || (direction === 1 && index === sections.length - 1)) return;
    setSections(prev => {
      const copy = [...prev];
      const targetIndex = index + direction;
      const temp = copy[index];
      copy[index] = copy[targetIndex];
      copy[targetIndex] = temp;
      return copy;
    });
  };

  const handleSave = async (syncToPlayer = false) => {
    if (!characterName.trim()) {
      showWarning('Укажите имя персонажа');
      return;
    }

    setSaving(true);

    const payload = {
      character_name: characterName.trim(),
      slug: applicationSlug.trim(),
      slot: Number(slot),
      organization,
      rank,
      status,
      author_username: authorUsername.trim() || 'Admin',
      character_avatar: avatarUrl.trim() || null,
      banner_url: bannerUrl.trim() || null,
      attribute_name: attributeName.trim() || null,
      moderator_notes: moderatorNotes.trim() || null,
      physical_stats: {
        punch_kg: physicalStats.punch_kg,
        durability_kg: autoDurability && physicalStats.punch_kg ? physicalStats.punch_kg * 3 : physicalStats.durability_kg,
        lifting_kg: physicalStats.lifting_kg,
        speed_kmh: physicalStats.speed_kmh,
        reaction_ms: physicalStats.reaction_ms,
        stamina_percent: physicalStats.stamina_percent,
        is_registered: physicalStats.is_registered
      },
      sections: sections.map(s => ({
        key: s.key || 'section',
        title: s.title || 'Раздел',
        content: s.content || ''
      })),
      sync_to_player: syncToPlayer
    };

    try {
      const url = isNew ? '/api/admin/applications' : `/api/admin/applications/${originalApp.slug || slug}`;
      const method = isNew ? 'POST' : 'PATCH';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.message || `Ошибка сохранения анкеты (${res.status})`);
      }

      showSuccess(syncToPlayer 
        ? `Анкета персонажа «${payload.character_name}» сохранена и синхронизирована с профилем игрока!` 
        : `Анкета персонажа «${payload.character_name}» успешно сохранена!`
      );

      if (isNew && data.application?.slug) {
        navigate(`/admin/applications/edit/${data.application.slug}`, { replace: true });
      } else if (data.application) {
        setOriginalApp(data.application);
      }
    } catch (err) {
      showError(err.message, 'Ошибка при сохранении анкеты');
    } finally {
      setSaving(false);
    }
  };

  // Auto-generate slug from character name
  const generateSlugFromName = () => {
    if (!characterName.trim()) {
      showWarning('Сначала введите имя персонажа');
      return;
    }
    const cyrMap = {
      'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo', 'ж': 'zh',
      'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o',
      'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'kh', 'ц': 'ts',
      'ч': 'ch', 'ш': 'sh', 'щ': 'shch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya'
    };
    const translit = characterName.toLowerCase().split('').map(c => cyrMap[c] !== undefined ? cyrMap[c] : c).join('');
    const clean = translit.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (clean) {
      setApplicationSlug(clean);
      showSuccess(`Сгенерирован слаг: ${clean}`);
    }
  };

  // Hotkey handler for Ctrl+S / Cmd+S
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSave(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [characterName, applicationSlug, slot, organization, rank, status, authorUsername, avatarUrl, bannerUrl, attributeName, physicalStats, sections, moderatorNotes, originalApp, isNew]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 20px' }}>
        <div className="spinner" />
        <p style={{ marginTop: '14px', color: 'var(--text-muted)' }}>Загрузка досье персонажа...</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Top Header Actions (Sticky Bar) */}
      <div className="editor-sticky-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <Link to="/admin/applications" className="btn btn-secondary btn-sm" style={{ padding: '6px 10px' }}>
            <ArrowLeft size={14} /> <span style={{ display: 'none', '@media (minWidth: 640px)': { display: 'inline' } }}>В реестр анкет</span>
          </Link>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 style={{ fontSize: '1.18rem', fontWeight: 800, margin: 0, letterSpacing: '-0.01em' }}>
                {isNew ? 'Новая анкета персонажа' : (originalApp?.character_name || characterName || 'Без имени')}
              </h1>
              <span className={`badge ${
                status === 'accepted' ? 'badge-emerald' : status === 'needs_revision' ? 'badge-amber' : status === 'rejected' ? 'badge-crimson' : 'badge-purple'
              }`}>
                {status.toUpperCase()}
              </span>
            </div>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-dim)', marginTop: '2px' }}>
              Слот {slot} • {organization || 'Без организации'} • {rank || '—'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          {!isNew && (
            <a 
              href={`/applications/${originalApp?.slug || slug}`} 
              target="_blank" 
              rel="noreferrer" 
              className="btn btn-secondary btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem' }}
              title="Открыть публичную анкету на сайте"
            >
              <ExternalLink size={13} />
              <span>Публичный вид</span>
            </a>
          )}

          <button
            type="button"
            onClick={() => handleSave(true)}
            disabled={saving}
            className="btn btn-emerald btn-sm"
            style={{ fontSize: '0.78rem' }}
            title="Сохранить и синхронизировать характеристики с таблицей игроков"
          >
            <ShieldCheck size={13} />
            <span>Одобрить & Синхронизировать</span>
          </button>

          <button
            type="button"
            onClick={() => handleSave(false)}
            disabled={saving}
            className="btn btn-primary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: '120px', justifyContent: 'center', fontWeight: 700 }}
            title="Сохранить анкету (Ctrl+S)"
          >
            <Save size={14} />
            <span>{saving ? 'Сохранение...' : 'Сохранить'}</span>
            <kbd style={{ fontSize: '0.65rem', background: 'rgba(255,255,255,0.2)', padding: '1px 5px', borderRadius: '4px', marginLeft: '4px' }}>
              Ctrl+S
            </kbd>
          </button>
        </div>
      </div>

      {/* Media & Visual Identity Header Card */}
      <div className="card-bezel card-bezel-crimson">
        <div className="card-inner hud-corner" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <ImageIcon size={18} color="var(--accent-crimson-light)" />
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0 }}>Визуальное оформление досье (Фото & Баннер)</h3>
            </div>
            
            <button
              type="button"
              onClick={() => setShowPresetModal(true)}
              className="btn btn-secondary btn-sm"
              style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Sparkles size={13} color="#fca5a5" />
              <span>Выбрать фон из каноничных артов</span>
            </button>
          </div>

          {/* Interactive Live Hero Header Preview */}
          <div 
            style={{ 
              position: 'relative', 
              borderRadius: '12px', 
              overflow: 'hidden', 
              border: '1px solid var(--border-medium)',
              background: bannerUrl ? `url(${bannerUrl}) center/cover no-repeat` : 'linear-gradient(135deg, rgba(239, 68, 68, 0.15) 0%, rgba(15, 18, 29, 0.95) 100%)',
              minHeight: '160px',
              padding: '24px',
              display: 'flex',
              alignItems: 'center',
              boxShadow: '0 8px 30px rgba(0,0,0,0.6)'
            }}
          >
            {/* Dark gradient blur overlay for readability */}
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, rgba(7, 8, 13, 0.92) 0%, rgba(7, 8, 13, 0.6) 60%, rgba(7, 8, 13, 0.85) 100%)' }} />

            <div style={{ position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
              <div style={{ position: 'relative' }}>
                <img 
                  src={avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&h=300&fit=crop&crop=faces'} 
                  alt="Avatar"
                  style={{
                    width: '90px',
                    height: '90px',
                    borderRadius: '16px',
                    border: '3px solid var(--accent-purple)',
                    objectFit: 'cover',
                    background: '#000',
                    boxShadow: '0 8px 25px rgba(139, 92, 246, 0.5)'
                  }}
                  onError={(e) => {
                    e.currentTarget.src = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&h=300&fit=crop&crop=faces';
                  }}
                />
                <span className="badge badge-crimson" style={{ position: 'absolute', bottom: '-6px', right: '-6px', fontSize: '0.65rem' }}>
                  СЛОТ {slot}
                </span>
              </div>

              <div>
                <h2 style={{ fontSize: '1.6rem', fontWeight: 800, margin: '0 0 4px 0', fontFamily: 'var(--font-heading)' }}>
                  {characterName || 'Имя персонажа'}
                </h2>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                  {attributeName && (
                    <span className="badge badge-amber">
                      <Flame size={11} /> Атрибут: {attributeName}
                    </span>
                  )}
                  <span className="badge badge-purple">
                    <Globe size={11} /> {organization}
                  </span>
                  <span className="badge">
                    Ранг: {rank}
                  </span>
                  {physicalStats.is_registered && (
                    <span className="badge badge-emerald">
                      <ShieldCheck size={11} /> Верифицирован
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Media URL Inputs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginTop: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600 }}>
                URL Аватара (Фото профиля)
              </label>
              <input
                type="url"
                className="input-field"
                placeholder="https://... (прямая ссылка на фото персонажа)"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                style={{ width: '100%', fontSize: '0.88rem' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600 }}>
                URL Широкоформатного Баннера
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="url"
                  className="input-field"
                  placeholder="https://... (фон шапки анкеты)"
                  value={bannerUrl}
                  onChange={(e) => setBannerUrl(e.target.value)}
                  style={{ flex: 1, fontSize: '0.88rem' }}
                />
                {bannerUrl && (
                  <button
                    type="button"
                    onClick={() => setBannerUrl('')}
                    className="btn btn-secondary btn-sm"
                    title="Удалить баннер"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Core Attributes & Moderation Status Matrix */}
      <div className="card" style={{ padding: '24px', borderRadius: '12px' }}>
        <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '16px', color: 'var(--text-main)' }}>
          Основные учётные данные & Статус анкеты
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600 }}>
              Имя персонажа <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              type="text"
              required
              className="input-field"
              placeholder="Например: Хана Ками"
              value={characterName}
              onChange={(e) => {
                setCharacterName(e.target.value);
                if (isNew && !applicationSlug) {
                  setApplicationSlug(e.target.value.toLowerCase().replace(/[^a-zа-яё0-9]/gi, '-').replace(/-+/g, '-'));
                }
              }}
              style={{ width: '100%', fontSize: '0.92rem' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600 }}>
              URL-слаг анкеты
            </label>
            <div style={{ display: 'flex', gap: '6px' }}>
              <input
                type="text"
                disabled={!isNew}
                className="input-field"
                placeholder="hana-kami"
                value={applicationSlug}
                onChange={(e) => setApplicationSlug(e.target.value.toLowerCase().replace(/[^a-z0-9\-]/g, ''))}
                style={{ flex: 1, fontSize: '0.92rem', opacity: isNew ? 1 : 0.7 }}
              />
              {isNew && (
                <button
                  type="button"
                  onClick={generateSlugFromName}
                  className="btn btn-secondary btn-sm"
                  title="Сгенерировать слаг из имени персонажа"
                  style={{ padding: '0 12px', flexShrink: 0 }}
                >
                  <Wand2 size={13} color="var(--accent-crimson-light)" />
                  <span>Авто</span>
                </button>
              )}
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600 }}>
              Слот персонажа
            </label>
            <select
              className="input-field"
              value={slot}
              onChange={(e) => setSlot(Number(e.target.value))}
              style={{ width: '100%', fontSize: '0.88rem', background: 'var(--bg-surface)' }}
            >
              <option value={1}>Слот 1 (Основной персонаж)</option>
              <option value={2}>Слот 2 (Второй персонаж)</option>
              <option value={3}>Слот 3 (Третий персонаж)</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600 }}>
              Организация / Фракция
            </label>
            <select
              className="input-field"
              value={organization}
              onChange={(e) => setOrganization(e.target.value)}
              style={{ width: '100%', fontSize: '0.88rem', background: 'var(--bg-surface)' }}
            >
              <option value="TENRYU">TENRYU (Штурмовой корпус)</option>
              <option value="Стражи Мира">Стражи Мира (Коалиция порядка)</option>
              <option value="Теневой синдикат">Теневой синдикат (Кабукичо)</option>
              <option value="Затмение">Затмение (Отступники)</option>
              <option value="Не состоит">Не состоит (Независимый)</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600 }}>
              Ранг допуска
            </label>
            <select
              className="input-field"
              value={rank}
              onChange={(e) => setRank(e.target.value)}
              style={{ width: '100%', fontSize: '0.88rem', background: 'var(--bg-surface)' }}
            >
              <option value="S">Ранг S (Высший калибр)</option>
              <option value="A">Ранг A (Элитный оперативник)</option>
              <option value="B">Ранг B (Ветеран)</option>
              <option value="C">Ранг C (Полевой боец)</option>
              <option value="D">Ранг D (Младший сотрудник)</option>
              <option value="E">Ранг E (Новобранец)</option>
              <option value="—">Без ранга (—)</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600 }}>
              Статус модерации
            </label>
            <select
              className="input-field"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              style={{ 
                width: '100%', 
                fontSize: '0.88rem', 
                background: status === 'accepted' ? 'rgba(16, 185, 129, 0.15)' : status === 'needs_revision' ? 'rgba(245, 158, 11, 0.15)' : 'var(--bg-surface)',
                color: status === 'accepted' ? '#6ee7b7' : status === 'needs_revision' ? '#fcd34d' : 'var(--text-main)',
                fontWeight: 700
              }}
            >
              <option value="accepted">Одобрено (accepted)</option>
              <option value="pending">На рассмотрении (pending)</option>
              <option value="needs_revision">Требуются правки (needs_revision)</option>
              <option value="rejected">Отклонено (rejected)</option>
              <option value="archived">В архиве (archived)</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600 }}>
              Название Атрибута
            </label>
            <input
              type="text"
              className="input-field"
              placeholder="Например: Ангел, Тень, Пламя"
              value={attributeName}
              onChange={(e) => setAttributeName(e.target.value)}
              style={{ width: '100%', fontSize: '0.88rem' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600 }}>
              Автор / Discord ник
            </label>
            <input
              type="text"
              className="input-field"
              placeholder="username"
              value={authorUsername}
              onChange={(e) => setAuthorUsername(e.target.value)}
              style={{ width: '100%', fontSize: '0.88rem' }}
            />
          </div>

        </div>
      </div>

      {/* Physical Stats Tuning Matrix */}
      <div className="card-bezel card-bezel-cyan">
        <div className="card-inner" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0 }}>Физические показатели персонажа</h3>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Прочность тела автоматически рассчитывается как 3× от силы удара (каноничное правило Verge).
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.84rem', cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={autoDurability} 
                  onChange={(e) => setAutoDurability(e.target.checked)} 
                />
                <span>Авторасчёт прочности (x3)</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.84rem', cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={physicalStats.is_registered} 
                  onChange={(e) => setPhysicalStats(prev => ({ ...prev, is_registered: e.target.checked }))} 
                />
                <span style={{ color: '#34d399', fontWeight: 700 }}>Утверждено стаффом</span>
              </label>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.76rem', color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase' }}>
                Сила удара (кг)
              </label>
              <input
                type="number"
                className="input-field"
                value={physicalStats.punch_kg ?? ''}
                onChange={(e) => handlePunchChange(e.target.value)}
                style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: '1rem', color: '#fbbf24' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.76rem', color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase' }}>
                Прочность тела (кг) {autoDurability && '(3×)'}
              </label>
              <input
                type="number"
                disabled={autoDurability}
                className="input-field"
                value={autoDurability && physicalStats.punch_kg ? physicalStats.punch_kg * 3 : (physicalStats.durability_kg ?? '')}
                onChange={(e) => setPhysicalStats(prev => ({ ...prev, durability_kg: Number(e.target.value) || 0 }))}
                style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: '1rem', color: '#c4b5fd', opacity: autoDurability ? 0.7 : 1 }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.76rem', color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase' }}>
                Подъём веса (кг)
              </label>
              <input
                type="number"
                className="input-field"
                value={physicalStats.lifting_kg ?? ''}
                onChange={(e) => setPhysicalStats(prev => ({ ...prev, lifting_kg: Number(e.target.value) || 0 }))}
                style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: '1rem', color: '#38bdf8' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.76rem', color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase' }}>
                Скорость (км/ч)
              </label>
              <input
                type="number"
                className="input-field"
                value={physicalStats.speed_kmh ?? ''}
                onChange={(e) => setPhysicalStats(prev => ({ ...prev, speed_kmh: Number(e.target.value) || 0 }))}
                style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: '1rem', color: '#f43f5e' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.76rem', color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase' }}>
                Время реакции (мс)
              </label>
              <input
                type="number"
                className="input-field"
                value={physicalStats.reaction_ms ?? ''}
                onChange={(e) => setPhysicalStats(prev => ({ ...prev, reaction_ms: Number(e.target.value) || 0 }))}
                style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: '1rem', color: '#a78bfa' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.76rem', color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase' }}>
                Выносливость (%)
              </label>
              <input
                type="number"
                className="input-field"
                value={physicalStats.stamina_percent ?? 100}
                onChange={(e) => setPhysicalStats(prev => ({ ...prev, stamina_percent: Number(e.target.value) || 100 }))}
                style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: '1rem', color: '#34d399' }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Dynamic Sections Builder */}
      <div className="card" style={{ padding: '24px', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0 }}>Секции досье персонажа</h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Редактируйте текст разделов, добавляйте новые блоки или меняйте их порядок.
            </span>
          </div>

          <button
            type="button"
            onClick={handleAddSection}
            className="btn btn-secondary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Plus size={14} />
            <span>Добавить раздел</span>
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {sections.map((sec, idx) => (
            <div 
              key={sec.key || idx}
              style={{
                border: '1px solid var(--border-subtle)',
                borderRadius: '10px',
                padding: '16px',
                background: 'rgba(255, 255, 255, 0.02)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '240px' }}>
                  <input
                    type="text"
                    className="input-field"
                    value={sec.title}
                    onChange={(e) => handleSectionChange(idx, 'title', e.target.value)}
                    style={{ fontWeight: 700, fontSize: '0.94rem', width: '220px' }}
                  />
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                    id: {sec.key}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <button
                    type="button"
                    onClick={() => handleMoveSection(idx, -1)}
                    disabled={idx === 0}
                    className="btn btn-secondary btn-sm"
                    style={{ padding: '4px 6px' }}
                    title="Поднять выше"
                  >
                    <ChevronUp size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMoveSection(idx, 1)}
                    disabled={idx === sections.length - 1}
                    className="btn btn-secondary btn-sm"
                    style={{ padding: '4px 6px' }}
                    title="Опустить ниже"
                  >
                    <ChevronDown size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteSection(idx)}
                    className="btn btn-secondary btn-sm"
                    style={{ padding: '4px 6px', color: '#fca5a5' }}
                    title="Удалить раздел"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <textarea
                rows={5}
                className="input-field"
                placeholder={`Содержимое раздела «${sec.title}»...`}
                value={sec.content}
                onChange={(e) => handleSectionChange(idx, 'content', e.target.value)}
                style={{ width: '100%', resize: 'vertical', fontSize: '0.88rem', lineHeight: 1.6 }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Curator Review & Moderation Notes */}
      <div className="card-bezel card-bezel-amber">
        <div className="card-inner" style={{ padding: '20px' }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 800, marginBottom: '8px' }}>
            Вердикт анкетолога & Заметки куратора
          </h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
            Этот комментарий сохраняется в истории досье и доступен стаффу и автору для правок.
          </p>
          <textarea
            rows={3}
            className="input-field"
            placeholder="Например: Сила удара согласована согласно рангу. Рекомендовано добавить подробности встречи с аномалией на Цусиме..."
            value={moderatorNotes}
            onChange={(e) => setModeratorNotes(e.target.value)}
            style={{ width: '100%', resize: 'vertical', fontSize: '0.88rem' }}
          />
        </div>
      </div>

      {/* Preset Banner Selector Modal */}
      {showPresetModal && (
        <div 
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.85)',
            backdropFilter: 'blur(8px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
          onClick={() => setShowPresetModal(false)}
        >
          <div 
            className="card-bezel card-bezel-crimson" 
            style={{ maxWidth: '780px', width: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="card-inner" style={{ padding: '24px', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                <div>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>Каноничные арты Verge TRP для досье</h3>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Кликните для установки в качестве фона досье персонажа</span>
                </div>
                <button onClick={() => setShowPresetModal(false)} className="btn btn-secondary btn-sm"><X size={16} /></button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
                {VERGE_BANNER_PRESETS.map((preset) => (
                  <div
                    key={preset.id}
                    onClick={() => {
                      setBannerUrl(preset.url);
                      setShowPresetModal(false);
                      showSuccess(`Фон досье «${preset.name}» установлен!`);
                    }}
                    style={{
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '8px',
                      overflow: 'hidden',
                      cursor: 'pointer',
                      background: 'var(--bg-surface)',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--accent-crimson)';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border-subtle)';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    <div style={{ height: '100px', width: '100%', overflow: 'hidden' }}>
                      <img src={preset.url} alt={preset.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                    <div style={{ padding: '10px' }}>
                      <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#ffffff', marginBottom: '2px' }}>{preset.name}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>{preset.description}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
