import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Search, 
  Edit3, 
  Eye, 
  CheckCircle2, 
  AlertCircle, 
  X, 
  Save, 
  Shield,
  Activity,
  Image,
  Zap,
  Sparkles,
  Layers
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { BANNER_PRESETS } from '../../constants/bannerPresets';
import { resolveAvatarUrl } from '../../utils/imageHelper';

export function AdminCharactersPage() {
  const { showSuccess, showError } = useToast();
  const [characters, setCharacters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Search & Filter
  const [search, setSearch] = useState('');
  const [rankFilter, setRankFilter] = useState('');
  const [orgFilter, setOrgFilter] = useState('');

  // Editing Modal State
  const [editingChar, setEditingChar] = useState(null);
  const [editTab, setEditTab] = useState('general'); // 'general' | 'stats'
  const [showPresetsModal, setShowPresetsModal] = useState(false);
  const [editForm, setEditForm] = useState({ 
    character_name: '', 
    character_avatar: '', 
    character_banner: '',
    organization: '', 
    rank: '',
    attribute_name: '',
    punch_strength_kg: '',
    lifting_strength_kg: '',
    speed_kmh: '',
    reaction_ms: '',
    stamina_percent: '',
    physical_stats_registered: false
  });
  const [saving, setSaving] = useState(false);

  const fetchCharacters = () => {
    setLoading(true);
    setError(null);

    const query = new URLSearchParams();
    if (search) query.set('search', search);
    if (rankFilter) query.set('rank', rankFilter);
    if (orgFilter) query.set('organization', orgFilter);

    fetch(`/api/admin/characters?${query.toString()}`, {
      headers: { 'Accept': 'application/json' }
    })
      .then(async res => {
        if (!res.ok) throw new Error(`Ошибка загрузки персонажей (${res.status})`);
        return res.json();
      })
      .then(data => {
        setCharacters(data.items || []);
      })
      .catch(err => {
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    document.title = 'Персонажи — Панель управления';
    fetchCharacters();
  }, [rankFilter, orgFilter]);

  const openEditModal = (char) => {
    setEditingChar(char);
    setEditTab('general');
    setEditForm({
      character_name: char.character_name || '',
      character_avatar: char.character_avatar || '',
      character_banner: char.character_banner || char.banner_url || '',
      organization: char.organization || '',
      rank: char.rank || '',
      attribute_name: char.attribute_name || '',
      punch_strength_kg: char.punch_strength_kg ?? char.physical_stats?.punch_strength_kg ?? '',
      lifting_strength_kg: char.lifting_strength_kg ?? char.physical_stats?.lifting_strength_kg ?? '',
      speed_kmh: char.speed_kmh ?? char.physical_stats?.speed_kmh ?? '',
      reaction_ms: char.reaction_ms ?? char.physical_stats?.reaction_ms ?? '',
      stamina_percent: char.stamina_percent ?? char.physical_stats?.stamina_percent ?? '',
      physical_stats_registered: !!(char.physical_stats_registered ?? char.physical_stats?.physical_stats_registered)
    });
  };

  const handleSaveChar = async (e) => {
    e.preventDefault();
    if (!editingChar) return;
    setSaving(true);

    try {
      const res = await fetch(`/api/admin/characters/${editingChar.slug || editingChar.public_id || editingChar.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(editForm)
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Ошибка сохранения персонажа');

      showSuccess(`Данные персонажа «${editForm.character_name}» успешно сохранены`);
      fetchCharacters();
      setEditingChar(null);
    } catch (err) {
      showError(err.message || 'Не удалось сохранить персонажа');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Top Header */}
      <div>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0 }}>Реестр персонажей</h1>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          Инспекция досье игроков, модерация имен, рангов и организаций
        </span>
      </div>

      {/* Filter Bar */}
      <div className="card" style={{ padding: '16px 20px', borderRadius: '12px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            className="input-field"
            placeholder="Поиск по имени или атрибуту..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchCharacters()}
            style={{ paddingLeft: '36px', height: '38px', fontSize: '0.86rem' }}
          />
        </div>

        <select
          className="input-field"
          value={rankFilter}
          onChange={(e) => setRankFilter(e.target.value)}
          style={{ width: 'auto', minWidth: '120px', height: '38px', fontSize: '0.86rem' }}
        >
          <option value="">Все ранги</option>
          <option value="S">S Ранг</option>
          <option value="A">A Ранг</option>
          <option value="B">B Ранг</option>
          <option value="C">C Ранг</option>
          <option value="D">D Ранг</option>
          <option value="E">E Ранг</option>
          <option value="F">F Ранг</option>
          <option value="I">I Ранг</option>
          <option value="II">II Ранг</option>
        </select>
      </div>

      {/* Characters Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px' }}>
          <div className="spinner" />
          <p style={{ marginTop: '12px', color: 'var(--text-muted)' }}>Загрузка персонажей...</p>
        </div>
      ) : error ? (
        <div className="empty-state">
          <div className="empty-state-icon"><AlertCircle size={36} color="#fca5a5" /></div>
          <h3 className="empty-state-title">Ошибка загрузки</h3>
          <p className="empty-state-desc">{error}</p>
        </div>
      ) : characters.length > 0 ? (
        <div className="card" style={{ padding: 0, borderRadius: '12px', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.86rem' }}>
              <thead>
                <tr style={{ background: 'rgba(255, 255, 255, 0.03)', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Персонаж</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Слот</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Атрибут</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Организация</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Ранг</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Репутация</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'right' }}>Действия</th>
                </tr>
              </thead>
              <tbody>
                {characters.map((char) => (
                  <tr 
                    key={char.slug || char.id}
                    style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)', transition: 'background 0.15s' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {char.character_avatar ? (
                          <div style={{ width: '32px', height: '32px', borderRadius: '50%', overflow: 'hidden', position: 'relative', flexShrink: 0 }}>
                            <img 
                              src={resolveAvatarUrl(char.character_avatar, char.slug || char.id)} 
                              alt={char.character_name} 
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                if (e.currentTarget.nextElementSibling) {
                                  e.currentTarget.nextElementSibling.style.display = 'flex';
                                }
                              }}
                              style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} 
                            />
                            <div style={{ display: 'none', width: '100%', height: '100%', borderRadius: '50%', background: 'rgba(139, 92, 246, 0.2)', alignItems: 'center', justifyContent: 'center' }}>
                              <Users size={15} color="var(--accent-purple-light)" />
                            </div>
                          </div>
                        ) : (
                          <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(139, 92, 246, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <Users size={15} color="var(--accent-purple-light)" />
                          </div>
                        )}
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{char.character_name}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            slug: {char.slug || char.id}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td style={{ padding: '14px 16px' }}>
                      <span className="badge badge-default" style={{ fontSize: '0.72rem' }}>
                        Слот {char.slot || 1}
                      </span>
                    </td>

                    <td style={{ padding: '14px 16px', color: 'var(--text-dim)' }}>
                      {char.attribute_name !== 'Отсутствует' ? (
                        <span className="badge badge-purple" style={{ fontSize: '0.72rem' }}>
                          {char.attribute_name}
                        </span>
                      ) : '—'}
                    </td>

                    <td style={{ padding: '14px 16px', color: 'var(--text-dim)' }}>
                      {char.organization || 'Не состоит'}
                    </td>

                    <td style={{ padding: '14px 16px' }}>
                      <span className="badge badge-default" style={{ fontSize: '0.74rem', fontWeight: 700 }}>
                        {char.rank || '—'}
                      </span>
                    </td>

                    <td style={{ padding: '14px 16px', color: 'var(--text-dim)', fontWeight: 600 }}>
                      {char.reputation} Rtg
                    </td>

                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                      <button
                        onClick={() => openEditModal(char)}
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                      >
                        <Edit3 size={13} /> Модерация
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="empty-state">
          <div className="empty-state-icon"><Users size={36} color="var(--text-muted)" /></div>
          <h3 className="empty-state-title">Персонажей не найдено</h3>
          <p className="empty-state-desc">По заданному запросу персонажей нет.</p>
        </div>
      )}

      {/* Character Moderation Modal */}
      {editingChar && (
        <div 
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            background: 'rgba(0, 0, 0, 0.8)',
            backdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
          onClick={() => {
            setEditingChar(null);
            setShowPresetsModal(false);
          }}
        >
          <div 
            className="card-bezel card-bezel-crimson" 
            style={{ 
              maxWidth: '720px', 
              width: '100%', 
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="card-inner" style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              {/* Modal Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Shield size={20} color="var(--accent-purple-light)" />
                  <div>
                    <h2 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0, fontFamily: 'var(--font-heading)' }}>
                      Модерация досье: {editingChar.character_name}
                    </h2>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      ID: {editingChar.id} • Слот: {editingChar.slot || 1}
                    </span>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    setEditingChar(null);
                    setShowPresetsModal(false);
                  }} 
                  className="btn btn-secondary btn-sm" 
                  style={{ padding: '6px' }}
                >
                  <X size={16} />
                </button>
              </div>

              {/* Live Mini Preview Header */}
              <div 
                style={{
                  borderRadius: '12px',
                  border: '1px solid var(--border-color)',
                  position: 'relative',
                  overflow: 'hidden',
                  minHeight: '110px',
                  display: 'flex',
                  alignItems: 'flex-end',
                  padding: '16px',
                  backgroundImage: editForm.character_banner 
                    ? `linear-gradient(to right, rgba(7, 8, 13, 0.94) 0%, rgba(7, 8, 13, 0.75) 55%, rgba(7, 8, 13, 0.4) 100%), url(${editForm.character_banner})`
                    : 'linear-gradient(135deg, rgba(20, 22, 35, 0.9) 0%, rgba(10, 12, 20, 0.95) 100%)',
                  backgroundSize: 'cover',
                  backgroundPosition: 'center'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', zIndex: 1 }}>
                  {editForm.character_avatar ? (
                    <div style={{ width: '56px', height: '56px', borderRadius: '12px', overflow: 'hidden', position: 'relative', flexShrink: 0 }}>
                      <img 
                        src={resolveAvatarUrl(editForm.character_avatar, editingChar?.slug || editingChar?.id)} 
                        alt="Аватар" 
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          if (e.currentTarget.nextElementSibling) {
                            e.currentTarget.nextElementSibling.style.display = 'flex';
                          }
                        }}
                        style={{ 
                          width: '100%', 
                          height: '100%', 
                          borderRadius: '12px', 
                          objectFit: 'cover', 
                          border: '2px solid var(--accent-purple)',
                          boxShadow: '0 4px 14px rgba(0,0,0,0.6)' 
                        }} 
                      />
                      <div style={{ display: 'none', width: '100%', height: '100%', borderRadius: '12px', background: 'rgba(255,255,255,0.06)', border: '2px dashed var(--border-color)', alignItems: 'center', justifyContent: 'center' }}>
                        <Users size={22} color="var(--text-muted)" />
                      </div>
                    </div>
                  ) : (
                    <div style={{ width: '56px', height: '56px', borderRadius: '12px', background: 'rgba(255,255,255,0.06)', border: '2px dashed var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Users size={22} color="var(--text-muted)" />
                    </div>
                  )}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '1.2rem', fontWeight: 800, color: '#ffffff' }}>
                        {editForm.character_name || 'Безымянный'}
                      </span>
                      {editForm.rank && (
                        <span className="badge badge-purple" style={{ fontSize: '0.7rem' }}>
                          Ранг {editForm.rank}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', color: 'rgba(255,255,255,0.7)', marginTop: '3px' }}>
                      <span>{editForm.organization || 'Без организации'}</span>
                      {editForm.attribute_name && (
                        <>
                          <span>•</span>
                          <span style={{ color: 'var(--accent-amber)' }}>{editForm.attribute_name}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Navigation Tabs */}
              <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                <button
                  type="button"
                  onClick={() => setEditTab('general')}
                  className={`btn btn-sm ${editTab === 'general' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ gap: '6px' }}
                >
                  <Users size={14} /> Основные & Оформление
                </button>
                <button
                  type="button"
                  onClick={() => setEditTab('stats')}
                  className={`btn btn-sm ${editTab === 'stats' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ gap: '6px' }}
                >
                  <Activity size={14} /> Физические характеристики
                </button>
              </div>

              {/* Form Content */}
              <form onSubmit={handleSaveChar} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                
                {editTab === 'general' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                          Имя персонажа *
                        </label>
                        <input
                          type="text"
                          className="input-field"
                          required
                          value={editForm.character_name}
                          onChange={(e) => setEditForm({ ...editForm, character_name: e.target.value })}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                          Атрибут персонажа
                        </label>
                        <input
                          type="text"
                          className="input-field"
                          placeholder="Например: Манипуляция пламенем"
                          value={editForm.attribute_name}
                          onChange={(e) => setEditForm({ ...editForm, attribute_name: e.target.value })}
                        />
                      </div>
                    </div>

                    {/* Avatar URL */}
                    <div>
                      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                        URL Аватара (HTTPS)
                      </label>
                      <input
                        type="url"
                        className="input-field"
                        value={editForm.character_avatar}
                        onChange={(e) => setEditForm({ ...editForm, character_avatar: e.target.value })}
                        placeholder="https://cdn.discordapp.com/attachments/..."
                      />
                    </div>

                    {/* Banner URL & Presets */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                          URL Баннера персонажа (16:9 / 21:9)
                        </label>
                        <button
                          type="button"
                          onClick={() => setShowPresetsModal(true)}
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '2px 8px', fontSize: '0.72rem', gap: '4px' }}
                        >
                          <Sparkles size={11} color="var(--accent-cyan)" /> Пресеты Verge
                        </button>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <input
                          type="url"
                          className="input-field"
                          value={editForm.character_banner}
                          onChange={(e) => setEditForm({ ...editForm, character_banner: e.target.value })}
                          placeholder="https://... или выберите из пресетов Verge"
                        />
                        {editForm.character_banner && (
                          <button
                            type="button"
                            onClick={() => setEditForm({ ...editForm, character_banner: '' })}
                            className="btn btn-secondary btn-sm"
                            title="Сбросить баннер"
                            style={{ padding: '0 10px' }}
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                          Организация
                        </label>
                        <input
                          type="text"
                          className="input-field"
                          value={editForm.organization}
                          onChange={(e) => setEditForm({ ...editForm, organization: e.target.value })}
                          placeholder="TENRYU / Стражи Мира / Без организации"
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                          Ранг
                        </label>
                        <input
                          type="text"
                          className="input-field"
                          value={editForm.rank}
                          onChange={(e) => setEditForm({ ...editForm, rank: e.target.value })}
                          placeholder="S, A, B, C, D, I, II..."
                        />
                      </div>
                    </div>
                  </div>
                )}

                {editTab === 'stats' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.03)', padding: '10px 14px', borderRadius: '8px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.84rem', fontWeight: 600 }}>
                        <input
                          type="checkbox"
                          checked={editForm.physical_stats_registered}
                          onChange={(e) => setEditForm({ ...editForm, physical_stats_registered: e.target.checked })}
                          style={{ accentColor: 'var(--accent-purple)' }}
                        />
                        Физические характеристики официально зарегистрированы
                      </label>
                      <span className="badge badge-default" style={{ fontSize: '0.7rem' }}>Регламент Verge</span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.76rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                          Сила удара (кг)
                        </label>
                        <input
                          type="number"
                          className="input-field"
                          placeholder="150"
                          value={editForm.punch_strength_kg}
                          onChange={(e) => setEditForm({ ...editForm, punch_strength_kg: e.target.value })}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.76rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                          Подъемная сила (кг)
                        </label>
                        <input
                          type="number"
                          className="input-field"
                          placeholder="220"
                          value={editForm.lifting_strength_kg}
                          onChange={(e) => setEditForm({ ...editForm, lifting_strength_kg: e.target.value })}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.76rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                          Скорость бега (км/ч)
                        </label>
                        <input
                          type="number"
                          className="input-field"
                          placeholder="32"
                          value={editForm.speed_kmh}
                          onChange={(e) => setEditForm({ ...editForm, speed_kmh: e.target.value })}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.76rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                          Скорость реакции (мс)
                        </label>
                        <input
                          type="number"
                          className="input-field"
                          placeholder="120"
                          value={editForm.reaction_ms}
                          onChange={(e) => setEditForm({ ...editForm, reaction_ms: e.target.value })}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.76rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                          Выносливость (%)
                        </label>
                        <input
                          type="number"
                          className="input-field"
                          placeholder="100"
                          value={editForm.stamina_percent}
                          onChange={(e) => setEditForm({ ...editForm, stamina_percent: e.target.value })}
                        />
                      </div>

                      <div style={{ background: 'rgba(139, 92, 246, 0.08)', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(139, 92, 246, 0.2)' }}>
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Прочность тела (канон 3×):</div>
                        <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--accent-purple-light)' }}>
                          {editForm.punch_strength_kg ? `${Math.round(Number(editForm.punch_strength_kg) * 3)} кг` : '—'}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', background: 'rgba(255, 255, 255, 0.02)', padding: '10px', borderRadius: '6px' }}>
                  🔒 Экономические валюты (KRW, JPY), AP и SP защищены от рассинхронизации и выдаются через бот-команды начисления и транзакций.
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
                  <button 
                    type="button" 
                    onClick={() => {
                      setEditingChar(null);
                      setShowPresetsModal(false);
                    }}
                    className="btn btn-secondary btn-sm"
                  >
                    Отмена
                  </button>
                  <button 
                    type="submit" 
                    disabled={saving}
                    className="btn btn-primary btn-sm"
                  >
                    <Save size={14} /> {saving ? 'Сохранение...' : 'Сохранить изменения'}
                  </button>
                </div>
              </form>

            </div>
          </div>
        </div>
      )}

      {/* Preset Banner Picker Modal */}
      {showPresetsModal && (
        <div 
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 120,
            background: 'rgba(0,0,0,0.85)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
          onClick={() => setShowPresetsModal(false)}
        >
          <div 
            className="card-bezel card-bezel-cyan"
            style={{ maxWidth: '780px', width: '100%', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="card-inner" style={{ padding: '24px', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Sparkles size={18} color="var(--accent-cyan)" />
                  Галерея официальных баннеров Verge
                </h3>
                <button onClick={() => setShowPresetsModal(false)} className="btn btn-secondary btn-sm" style={{ padding: '6px' }}>
                  <X size={16} />
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '14px' }}>
                {BANNER_PRESETS.map((preset) => (
                  <div 
                    key={preset.url}
                    onClick={() => {
                      setEditForm({ ...editForm, character_banner: preset.url });
                      setShowPresetsModal(false);
                    }}
                    style={{
                      border: editForm.character_banner === preset.url ? '2px solid var(--accent-cyan)' : '1px solid var(--border-color)',
                      borderRadius: '8px',
                      overflow: 'hidden',
                      cursor: 'pointer',
                      background: 'var(--bg-surface)',
                      transition: 'transform 0.15s, border-color 0.15s'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
                  >
                    <div style={{ height: '90px', backgroundImage: `url(${preset.url})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
                    <div style={{ padding: '8px 10px' }}>
                      <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-main)' }}>{preset.title}</div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{preset.category}</div>
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
