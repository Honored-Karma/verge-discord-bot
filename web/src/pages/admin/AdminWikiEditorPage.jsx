import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { 
  Save, 
  ArrowLeft, 
  Eye, 
  Edit3, 
  CheckCircle2, 
  Archive, 
  AlertCircle, 
  Sparkles,
  Info,
  Layers,
  Image as ImageIcon,
  Columns,
  Maximize2,
  Bold,
  Italic,
  Strikethrough,
  Heading2,
  Heading3,
  Quote,
  Code,
  List,
  ListOrdered,
  Table,
  ShieldAlert,
  HelpCircle,
  X,
  ExternalLink
} from 'lucide-react';
import { MarkdownReader } from '../../components/wiki/MarkdownReader';
import { WIKI_CATEGORIES } from '../../constants/wikiCategories';
import { VERGE_BANNER_PRESETS } from '../../constants/bannerPresets';
import { useToast } from '../../context/ToastContext';

export function AdminWikiEditorPage() {
  const { slug } = useParams();
  const isNew = !slug;
  const navigate = useNavigate();
  const { showSuccess, showError, showWarning } = useToast();
  const textareaRef = useRef(null);

  // Form State
  const [title, setTitle] = useState('');
  const [articleSlug, setArticleSlug] = useState('');
  const [category, setCategory] = useState('world');
  const [summary, setSummary] = useState('');
  const [content, setContent] = useState('');
  const [bannerUrl, setBannerUrl] = useState('');
  const [aliases, setAliases] = useState('');
  const [tags, setTags] = useState('');
  const [sortOrder, setSortOrder] = useState(0);
  const [status, setStatus] = useState('draft');

  // Editor View Mode: 'write' | 'split' | 'preview'
  const [viewMode, setViewMode] = useState('split');

  // Modals
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [imageModalData, setImageModalData] = useState({ url: '', alt: '', caption: '' });

  // Metadata & State
  const [originalArticle, setOriginalArticle] = useState(null);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);

  useEffect(() => {
    if (isNew) {
      document.title = 'Новая статья — Панель управления';
      return;
    }

    document.title = `Редактирование: ${slug} — Панель управления`;
    let isMounted = true;
    setLoading(true);

    fetch(`/api/admin/wiki/${slug}`, {
      headers: { 'Accept': 'application/json' }
    })
      .then(async res => {
        if (!res.ok) throw new Error(`Статья не найдена (${res.status})`);
        return res.json();
      })
      .then(data => {
        if (isMounted && data.article) {
          const art = data.article;
          setOriginalArticle(art);
          setTitle(art.title || '');
          setArticleSlug(art.slug || '');
          setCategory(art.category || 'world');
          setSummary(art.summary || '');
          setContent(art.content || '');
          setBannerUrl(art.banner_url || art.image_url || '');
          setAliases((art.aliases || []).join(', '));
          setTags((art.tags || []).join(', '));
          setSortOrder(art.sort_order || 0);
          setStatus(art.status || 'draft');
        }
      })
      .catch(err => {
        if (isMounted) {
          setSaveStatus({ type: 'error', message: err.message });
          showError(err.message, 'Не удалось загрузить статью');
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => { isMounted = false; };
  }, [slug, isNew]);

  // Insert formatting at cursor position
  const insertFormatting = (prefix, suffix = '', defaultText = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = content.substring(start, end) || defaultText;

    const replacement = `${prefix}${selected}${suffix}`;
    const newContent = content.substring(0, start) + replacement + content.substring(end);
    setContent(newContent);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
    }, 10);
  };

  const handleInsertImage = () => {
    if (!imageModalData.url.trim()) return;
    const alt = imageModalData.alt.trim() || 'Иллюстрация';
    const caption = imageModalData.caption.trim();
    
    let md = `\n![${alt}](${imageModalData.url.trim()})\n`;
    if (caption) {
      md += `*${caption}*\n\n`;
    }
    
    insertFormatting(md);
    setImageModalData({ url: '', alt: '', caption: '' });
    setShowImageModal(false);
    showSuccess('Изображение добавлено в текст статьи');
  };

  const handleSave = async (e) => {
    if (e) e.preventDefault();
    setSaving(true);
    setSaveStatus(null);

    const payload = {
      title: title.trim(),
      slug: articleSlug.trim(),
      category,
      summary: summary.trim(),
      content,
      banner_url: bannerUrl.trim() || null,
      aliases: aliases.split(',').map(s => s.trim()).filter(Boolean),
      tags: tags.split(',').map(s => s.trim()).filter(Boolean),
      sort_order: Number(sortOrder) || 0,
      expected_updated_at: originalArticle?.updated_at || null
    };

    try {
      const url = isNew ? '/api/admin/wiki' : `/api/admin/wiki/${originalArticle.slug}`;
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

      if (res.status === 409) {
        setSaveStatus({
          type: 'conflict',
          message: data.message || 'Конфликт: статья была изменена другим администратором.'
        });
        showWarning(data.message || 'Конфликт версий! Обновите страницу перед сохранением.');
        return;
      }

      if (!res.ok) {
        throw new Error(data.message || `Ошибка сохранения (${res.status})`);
      }

      setSaveStatus({ type: 'success', message: 'Изменения успешно сохранены!' });
      showSuccess(`Статья «${payload.title}» сохранена!`);

      if (isNew && data.article?.slug) {
        navigate(`/admin/wiki/edit/${data.article.slug}`, { replace: true });
      } else if (data.article) {
        setOriginalArticle(data.article);
      }
    } catch (err) {
      setSaveStatus({ type: 'error', message: err.message });
      showError(err.message, 'Ошибка при сохранении');
    } finally {
      setSaving(false);
    }
  };

  const handleTransitionStatus = async (targetStatus) => {
    if (!originalArticle?.slug) return;
    setSaving(true);
    setSaveStatus(null);

    try {
      const action = targetStatus === 'published' ? 'publish' : 'archive';
      const res = await fetch(`/api/admin/wiki/${originalArticle.slug}/${action}`, {
        method: 'POST',
        headers: { 'Accept': 'application/json' }
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Ошибка смены статуса');

      setStatus(targetStatus);
      setOriginalArticle(prev => ({ ...prev, status: targetStatus }));
      const msg = targetStatus === 'published' ? 'Статья опубликована на сайте!' : 'Статья перемещена в архив.';
      setSaveStatus({ type: 'success', message: msg });
      showSuccess(msg);
    } catch (err) {
      setSaveStatus({ type: 'error', message: err.message });
      showError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 20px' }}>
        <div className="spinner" />
        <p style={{ marginTop: '14px', color: 'var(--text-muted)' }}>Загрузка редактора...</p>
      </div>
    );
  }

  const isCanonLore = originalArticle?.source?.type === 'verge_lore_document' || originalArticle?.origin === 'lore_import';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Top Header & Actions Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Link to="/admin/wiki" className="btn btn-secondary btn-sm" style={{ padding: '6px 10px' }}>
            <ArrowLeft size={14} /> В список
          </Link>
          <div>
            <h1 style={{ fontSize: '1.35rem', fontWeight: 800, margin: 0 }}>
              {isNew ? 'Создание новой статьи Wiki' : `Редактирование: ${originalArticle?.title || title}`}
            </h1>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Статус: <strong style={{ color: status === 'published' ? '#6ee7b7' : status === 'archived' ? '#94a3b8' : '#fcd34d' }}>{status.toUpperCase()}</strong>
              {originalArticle?.public_id && ` • ID: ${originalArticle.public_id}`}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          {!isNew && (
            <a 
              href={`/wiki/articles/${originalArticle?.slug || slug}`} 
              target="_blank" 
              rel="noreferrer" 
              className="btn btn-secondary btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <ExternalLink size={13} />
              <span>На сайте</span>
            </a>
          )}

          {!isNew && status !== 'published' && (
            <button 
              type="button"
              onClick={() => handleTransitionStatus('published')}
              disabled={saving}
              className="btn btn-emerald btn-sm"
              style={{ background: '#10b981', color: '#ffffff' }}
            >
              <CheckCircle2 size={14} /> Опубликовать
            </button>
          )}

          {!isNew && status === 'published' && (
            <button 
              type="button"
              onClick={() => handleTransitionStatus('archived')}
              disabled={saving}
              className="btn btn-secondary btn-sm"
            >
              <Archive size={14} /> В архив
            </button>
          )}

          <button 
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="btn btn-primary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: '120px', justifyContent: 'center' }}
          >
            <Save size={14} />
            <span>{saving ? 'Сохранение...' : 'Сохранить'}</span>
          </button>
        </div>
      </div>

      {/* Canon Warning Banner */}
      {isCanonLore && (
        <div 
          className="card" 
          style={{ 
            padding: '12px 16px', 
            borderRadius: '8px', 
            background: 'rgba(245, 158, 11, 0.12)', 
            borderLeft: '4px solid var(--accent-amber)',
            display: 'flex', 
            alignItems: 'center', 
            gap: '12px',
            fontSize: '0.84rem'
          }}
        >
          <Sparkles size={18} color="#fbbf24" style={{ flexShrink: 0 }} />
          <div>
            <strong>Каноническая статья вселенной Verge.</strong> Любое ручное изменение зафиксирует локальную версию как модифицированную стаффом.
          </div>
        </div>
      )}

      {/* Media & Banner Customization Card */}
      <div className="card-bezel card-bezel-purple">
        <div className="card-inner" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ImageIcon size={18} color="var(--accent-purple-light)" />
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>Медиа & Обложка статьи</h3>
            </div>

            <button
              type="button"
              onClick={() => setShowPresetModal(true)}
              className="btn btn-secondary btn-sm"
              style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Sparkles size={13} color="#c4b5fd" />
              <span>Выбрать арт из пресетов Verge</span>
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: bannerUrl ? 'minmax(0, 1fr) 280px' : '1fr', gap: '16px', alignItems: 'center' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600 }}>
                URL широкоформатного баннера (баннер в шапке статьи)
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="url"
                  className="input-field"
                  placeholder="https://... (Discord CDN, Unsplash, Imgur, iili.io)"
                  value={bannerUrl}
                  onChange={(e) => setBannerUrl(e.target.value)}
                  style={{ flex: 1, fontSize: '0.86rem' }}
                />
                {bannerUrl && (
                  <button
                    type="button"
                    onClick={() => setBannerUrl('')}
                    className="btn btn-secondary btn-sm"
                    title="Очистить баннер"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '4px', display: 'block' }}>
                Рекомендуемое разрешение: 1920×600 или 1200×400 (соотношение ~3:1 или 16:9).
              </span>
            </div>

            {bannerUrl && (
              <div style={{ position: 'relative', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-subtle)', height: '80px', background: '#000' }}>
                <img 
                  src={bannerUrl} 
                  alt="Превью баннера" 
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
                <div style={{ position: 'absolute', bottom: '4px', right: '6px', background: 'rgba(0,0,0,0.7)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem', color: '#fff' }}>
                  Live Preview
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Metadata Form */}
      <div className="card" style={{ padding: '20px', borderRadius: '12px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
          
          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600 }}>
              Название статьи <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              type="text"
              required
              className="input-field"
              placeholder="Например: Катастрофа на Цусиме"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (isNew && !articleSlug) {
                  setArticleSlug(e.target.value.toLowerCase().replace(/[^a-zа-яё0-9]/gi, '-').replace(/-+/g, '-'));
                }
              }}
              style={{ width: '100%', fontSize: '0.92rem' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600 }}>
              URL-слаг (ID пути) <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              type="text"
              required
              disabled={!isNew}
              className="input-field"
              placeholder="tsushima-genesis"
              value={articleSlug}
              onChange={(e) => setArticleSlug(e.target.value.toLowerCase().replace(/[^a-z0-9\-]/g, ''))}
              style={{ width: '100%', fontSize: '0.92rem', opacity: isNew ? 1 : 0.7 }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600 }}>
              Категория энциклопедии
            </label>
            <select
              className="input-field"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              style={{ width: '100%', fontSize: '0.88rem', background: 'var(--bg-surface)' }}
            >
              {WIKI_CATEGORIES.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name} ({cat.id})</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600 }}>
              Теги статьи (через запятую)
            </label>
            <input
              type="text"
              className="input-field"
              placeholder="катастрофа, цусима, 2020, генезис"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              style={{ width: '100%', fontSize: '0.88rem' }}
            />
          </div>

          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600 }}>
              Краткая выжимка (Лид-параграф)
            </label>
            <textarea
              rows={2}
              className="input-field"
              placeholder="Краткое описание сущности в 1-2 предложениях для поисковой выдачи и карточки..."
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              style={{ width: '100%', resize: 'vertical', fontSize: '0.88rem' }}
            />
          </div>

        </div>
      </div>

      {/* Editor & Preview Header Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        
        {/* Markdown Toolbar */}
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
          <button 
            type="button" 
            onClick={() => insertFormatting('## ', '', 'Заголовок раздела')} 
            className="btn btn-secondary btn-sm" 
            title="Заголовок H2" 
            style={{ padding: '4px 8px' }}
          >
            <Heading2 size={14} />
          </button>
          <button 
            type="button" 
            onClick={() => insertFormatting('### ', '', 'Подзаголовок')} 
            className="btn btn-secondary btn-sm" 
            title="Заголовок H3" 
            style={{ padding: '4px 8px' }}
          >
            <Heading3 size={14} />
          </button>
          <span style={{ width: '1px', height: '20px', background: 'var(--border-subtle)', margin: '0 2px' }} />
          <button 
            type="button" 
            onClick={() => insertFormatting('**', '**', 'жирный текст')} 
            className="btn btn-secondary btn-sm" 
            title="Полужирный" 
            style={{ padding: '4px 8px' }}
          >
            <Bold size={14} />
          </button>
          <button 
            type="button" 
            onClick={() => insertFormatting('*', '*', 'курсив')} 
            className="btn btn-secondary btn-sm" 
            title="Курсив" 
            style={{ padding: '4px 8px' }}
          >
            <Italic size={14} />
          </button>
          <button 
            type="button" 
            onClick={() => insertFormatting('~~', '~~', 'зачеркнутый')} 
            className="btn btn-secondary btn-sm" 
            title="Зачеркнутый" 
            style={{ padding: '4px 8px' }}
          >
            <Strikethrough size={14} />
          </button>
          <span style={{ width: '1px', height: '20px', background: 'var(--border-subtle)', margin: '0 2px' }} />
          <button 
            type="button" 
            onClick={() => insertFormatting('> ', '', 'Цитата или важная реплика')} 
            className="btn btn-secondary btn-sm" 
            title="Блок цитаты" 
            style={{ padding: '4px 8px' }}
          >
            <Quote size={14} />
          </button>
          <button 
            type="button" 
            onClick={() => insertFormatting('```\n', '\n```', '// тактический код или лог')} 
            className="btn btn-secondary btn-sm" 
            title="Блок кода" 
            style={{ padding: '4px 8px' }}
          >
            <Code size={14} />
          </button>
          <button 
            type="button" 
            onClick={() => insertFormatting('- ', '', 'Элемент списка')} 
            className="btn btn-secondary btn-sm" 
            title="Список" 
            style={{ padding: '4px 8px' }}
          >
            <List size={14} />
          </button>
          <button 
            type="button" 
            onClick={() => insertFormatting('\n| Параметр | Значение |\n|---|---|\n| Статус | Активен |\n| Ранг | S |\n')} 
            className="btn btn-secondary btn-sm" 
            title="Вставить таблицу" 
            style={{ padding: '4px 8px' }}
          >
            <Table size={14} />
          </button>
          <span style={{ width: '1px', height: '20px', background: 'var(--border-subtle)', margin: '0 2px' }} />
          <button 
            type="button" 
            onClick={() => insertFormatting('\n> [!NOTE]\n> ', '', 'Оперативная сводка штаба...')} 
            className="btn btn-secondary btn-sm" 
            title="Информационная плашка NOTE" 
            style={{ fontSize: '0.72rem', padding: '4px 8px', color: '#67e8f9' }}
          >
            [!NOTE]
          </button>
          <button 
            type="button" 
            onClick={() => insertFormatting('\n> [!WARNING]\n> ', '', 'Опасная зона с высокой активностью Ци...')} 
            className="btn btn-secondary btn-sm" 
            title="Предупреждение WARNING" 
            style={{ fontSize: '0.72rem', padding: '4px 8px', color: '#fbbf24' }}
          >
            [!WARN]
          </button>
          <button 
            type="button" 
            onClick={() => setShowImageModal(true)} 
            className="btn btn-primary btn-sm" 
            title="Вставить изображение с подписью" 
            style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', padding: '4px 10px' }}
          >
            <ImageIcon size={13} />
            <span>Вставить фото</span>
          </button>
        </div>

        {/* View Mode Switcher */}
        <div style={{ display: 'flex', gap: '4px', background: 'rgba(255, 255, 255, 0.04)', padding: '3px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
          <button
            type="button"
            onClick={() => setViewMode('write')}
            className={`btn btn-sm ${viewMode === 'write' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '0.76rem', padding: '4px 10px' }}
          >
            <Edit3 size={13} />
            <span>Редактор</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('split')}
            className={`btn btn-sm ${viewMode === 'split' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '0.76rem', padding: '4px 10px' }}
          >
            <Columns size={13} />
            <span>Сплит (50/50)</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('preview')}
            className={`btn btn-sm ${viewMode === 'preview' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '0.76rem', padding: '4px 10px' }}
          >
            <Eye size={13} />
            <span>Предпросмотр</span>
          </button>
        </div>
      </div>

      {/* Editor & Preview Split Workspace */}
      <div 
        style={{ 
          display: 'grid', 
          gridTemplateColumns: viewMode === 'split' ? 'minmax(0, 1fr) minmax(0, 1fr)' : '1fr',
          gap: '20px',
          alignItems: 'stretch'
        }}
      >
        {/* Editor Pane */}
        {(viewMode === 'write' || viewMode === 'split') && (
          <div className="card" style={{ padding: '16px', borderRadius: '12px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              <span>Markdown разметка текста</span>
              <span>Символов: {content.length}</span>
            </div>
            <textarea
              ref={textareaRef}
              rows={28}
              className="input-field"
              placeholder="Пишите текст статьи в формате Markdown... Используйте тулбар выше для быстрой вставки заголовков, цитат и таблиц."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              style={{
                width: '100%',
                flex: 1,
                minHeight: '520px',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.9rem',
                lineHeight: 1.6,
                background: 'rgba(7, 8, 13, 0.85)',
                resize: 'vertical',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                padding: '14px'
              }}
            />
          </div>
        )}

        {/* Live Preview Pane */}
        {(viewMode === 'preview' || viewMode === 'split') && (
          <div className="card" style={{ padding: '24px', borderRadius: '12px', overflowY: 'auto', maxHeight: '720px', background: 'var(--bg-surface)' }}>
            <div style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: '12px', marginBottom: '18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="badge badge-purple" style={{ fontSize: '0.72rem' }}>
                LIVE ПРЕДПРОСМОТР СТАТЬИ
              </span>
              <span style={{ fontSize: '0.76rem', color: 'var(--text-dim)' }}>
                Отображение на сайте
              </span>
            </div>

            {/* Simulated Live Header if banner exists */}
            {bannerUrl && (
              <div style={{ position: 'relative', height: '140px', borderRadius: '10px', overflow: 'hidden', marginBottom: '16px' }}>
                <img src={bannerUrl} alt="Article Banner" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.2), rgba(15,18,29,0.9))' }} />
              </div>
            )}

            <h1 style={{ fontSize: '1.8rem', fontWeight: 800, margin: '0 0 8px 0', fontFamily: 'var(--font-heading)' }}>
              {title || 'Без названия'}
            </h1>

            {summary && (
              <p style={{ fontSize: '0.96rem', color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: '20px', fontStyle: 'italic' }}>
                {summary}
              </p>
            )}

            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '16px' }}>
              {content.trim() ? (
                <MarkdownReader content={content} />
              ) : (
                <div style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '60px 20px', fontStyle: 'italic' }}>
                  Начните писать текст в левой колонке для живого предпросмотра...
                </div>
              )}
            </div>
          </div>
        )}
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
            className="card-bezel card-bezel-purple" 
            style={{ maxWidth: '780px', width: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="card-inner" style={{ padding: '24px', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                <div>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>Каноничные арты и баннеры Verge TRP</h3>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Кликните по арту для установки в качестве обложки статьи</span>
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
                      showSuccess(`Баннер «${preset.name}» установлен!`);
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
                      e.currentTarget.style.borderColor = 'var(--accent-purple)';
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

      {/* Insert Image Dialog Modal */}
      {showImageModal && (
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
          onClick={() => setShowImageModal(false)}
        >
          <div 
            className="card-bezel card-bezel-cyan" 
            style={{ maxWidth: '520px', width: '100%' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="card-inner" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ImageIcon size={18} color="var(--accent-cyan-light)" />
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0 }}>Вставка изображения в текст</h3>
                </div>
                <button onClick={() => setShowImageModal(false)} className="btn btn-secondary btn-sm"><X size={15} /></button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600 }}>
                    URL изображения <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="url"
                    className="input-field"
                    placeholder="https://... (прямая ссылка на картинку)"
                    value={imageModalData.url}
                    onChange={(e) => setImageModalData(prev => ({ ...prev, url: e.target.value }))}
                    style={{ width: '100%', fontSize: '0.88rem' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600 }}>
                    Описание (Alt-текст)
                  </label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="Схема Скважины / Портрет"
                    value={imageModalData.alt}
                    onChange={(e) => setImageModalData(prev => ({ ...prev, alt: e.target.value }))}
                    style={{ width: '100%', fontSize: '0.88rem' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600 }}>
                    Подпись под картинкой (необязательно)
                  </label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="Рис. 1: Разлом Ци в Токио"
                    value={imageModalData.caption}
                    onChange={(e) => setImageModalData(prev => ({ ...prev, caption: e.target.value }))}
                    style={{ width: '100%', fontSize: '0.88rem' }}
                  />
                </div>

                {imageModalData.url && (
                  <div style={{ height: '120px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-subtle)', background: '#000' }}>
                    <img 
                      src={imageModalData.url} 
                      alt="Preview" 
                      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                  <button type="button" onClick={() => setShowImageModal(false)} className="btn btn-secondary btn-sm">
                    Отмена
                  </button>
                  <button 
                    type="button" 
                    onClick={handleInsertImage} 
                    disabled={!imageModalData.url.trim()} 
                    className="btn btn-primary btn-sm"
                  >
                    Вставить в текст
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
