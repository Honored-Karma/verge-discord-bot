import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { InventoryGrid } from '../components/inventory/InventoryGrid';
import { 
  Package, 
  Search, 
  LayoutGrid, 
  List, 
  Shield, 
  ChevronRight, 
  Lock, 
  AlertCircle,
  LogIn,
  Filter,
  Sparkles
} from 'lucide-react';

const SAMPLE_INVENTORY_ITEMS = [
  {
    id: "item_01",
    name: "Катастрофический клинок Цусимы",
    emoji: "⚔️",
    type: "equipment",
    rarity: { key: "legendary", name: "Легендарный", color: "#f59e0b" },
    quantity: 1,
    usable: true,
    effect_text: "+45% к урону стилей Багрового Пламени",
    total_effect_summary: "+45% Урон Пламени",
    description: "Древнее лезвие, выкованное из обломков кристаллов Скважины первого поколения. Пульсирует концентрированной энергией Ци."
  },
  {
    id: "item_02",
    name: "Тактический мундир Координатора NERV",
    emoji: "🦺",
    type: "equipment",
    rarity: { key: "epic", name: "Эпический", color: "#a855f7" },
    quantity: 1,
    usable: false,
    effect_text: "+2500 кг к прочности тела",
    total_effect_summary: "+2500 кг Прочность",
    description: "Укрепленная полевая форма старшего офицера с встроенными микро-контурами распределения ударных волн."
  },
  {
    id: "item_03",
    name: "Зелье чистой энергии Ци",
    emoji: "🧪",
    type: "consumable",
    rarity: { key: "rare", name: "Редкий", color: "#3b82f6" },
    quantity: 5,
    usable: true,
    effect_text: "Мгновенно восстанавливает 50% запаса стамины",
    total_effect_summary: "Восстановление 50% Ци",
    description: "Экстракт редких трав склонов Нагасаки, стабилизированный очищенной водой из скважин."
  },
  {
    id: "item_04",
    name: "Древний манускрипт Феникса",
    emoji: "📜",
    type: "scroll",
    rarity: { key: "epic", name: "Эпический", color: "#a855f7" },
    quantity: 2,
    usable: true,
    effect_text: "+150 SP к стилю боя",
    total_effect_summary: "+150 SP Опыт стиля",
    description: "Рукопись мастеров боевых искусств периода Эдо, адаптированная под использование Атрибутов."
  },
  {
    id: "item_05",
    name: "Осколок фиолетовой руды Маджин",
    emoji: "💎",
    type: "material",
    rarity: { key: "uncommon", name: "Необычный", color: "#22c55e" },
    quantity: 14,
    usable: false,
    effect_text: "Используется для крафта и улучшения",
    total_effect_summary: "Ресурс для крафта",
    description: "Минерал, кристаллизовавшийся на границе пространственного разлома."
  }
];

export function InventoryPage() {
  const { id } = useParams();
  const { user } = useAuth();
  
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorStatus, setErrorStatus] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [rarityFilter, setRarityFilter] = useState('all');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'

  const activeCharId = user?.characters?.activeCharacter?.id;
  const targetId = id || activeCharId;

  const buildLocalInventory = () => {
    return {
      character: user?.characters?.activeCharacter || {
        id: "char_demo_01",
        character_name: "Хана Ками"
      },
      items: SAMPLE_INVENTORY_ITEMS,
      capacity: {
        used_slots: 5,
        max_slots: 30,
        is_overloaded: false
      },
      summary: {
        total_quantity: 23,
        unique_items: 5
      },
      is_owner: true
    };
  };

  useEffect(() => {
    if (!targetId && !user) {
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setErrorStatus(null);
    setErrorMessage(null);

    // If demo mode
    if (user?.id === "demo_operative_01") {
      setData(buildLocalInventory());
      setLoading(false);
      return;
    }

    fetch(`/api/characters/${targetId}/inventory`, {
      credentials: 'include',
      headers: { 'Accept': 'application/json' }
    })
      .then(async res => {
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          const error = new Error(errData.message || `Ошибка сервера (${res.status})`);
          error.status = res.status;
          throw error;
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
          // If offline and user exists, fall back to sample inventory
          if (user) {
            setData(buildLocalInventory());
          } else {
            setErrorStatus(err.status || 500);
            setErrorMessage(err.message);
          }
        }
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false);
        }
      });

    return () => { isMounted = false; };
  }, [targetId, user?.characters?.activeSlot, user?.characters?.activeCharacter]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '120px 20px' }}>
        <div className="spinner" />
        <p style={{ marginTop: '18px', color: 'var(--text-muted)', fontSize: '0.94rem' }}>
          Загрузка предметов инвентаря...
        </p>
      </div>
    );
  }

  // 401 Unauthorized State
  if (!user && !data) {
    return (
      <div className="card-bezel card-bezel-crimson" style={{ margin: '60px auto', maxWidth: '520px' }}>
        <div className="card-inner" style={{ textAlign: 'center', padding: '40px 28px' }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: 'var(--accent-purple-glow)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
            color: 'var(--accent-purple-light)'
          }}>
            <Lock size={34} />
          </div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '8px' }}>Требуется авторизация</h2>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '24px', lineHeight: 1.6 }}>
            Инвентарь персонажей защищён. Войдите через ваш Discord-аккаунт или запустите демо-режим.
          </p>
          <Link to="/login" className="btn btn-discord btn-lg" style={{ width: '100%' }}>
            <span>Войти в систему</span>
            <span className="btn-icon-bubble">
              <LogIn size={16} />
            </span>
          </Link>
        </div>
      </div>
    );
  }

  const { character, items, capacity, summary } = data || buildLocalInventory();
  const isOwner = Boolean(data?.is_owner || user?.id === "demo_operative_01");

  // Filter Items
  const filteredItems = (items || []).filter(item => {
    // Search query
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchName = item.name?.toLowerCase().includes(q);
      const matchDesc = item.description?.toLowerCase().includes(q);
      const matchType = item.type?.toLowerCase().includes(q);
      if (!matchName && !matchDesc && !matchType) return false;
    }

    // Type filter
    if (typeFilter !== 'all') {
      if (item.type !== typeFilter) return false;
    }

    // Rarity filter
    if (rarityFilter !== 'all') {
      if (item.rarity?.key !== rarityFilter) return false;
    }

    return true;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      {/* Breadcrumb Navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.84rem', color: 'var(--text-muted)' }}>
        <Link to="/" style={{ color: 'var(--text-dim)' }}>Главная</Link>
        <ChevronRight size={14} />
        <Link to="/dashboard" style={{ color: 'var(--accent-purple-light)' }}>Кабинет</Link>
        <ChevronRight size={14} />
        <Link to={`/characters/${character.id}`} style={{ color: 'var(--text-main)', fontWeight: 600 }}>
          {character.character_name}
        </Link>
        <ChevronRight size={14} />
        <span style={{ color: 'var(--accent-cyan-light)', fontWeight: 700 }}>Инвентарь</span>
      </div>

      {/* Header Banner with Capacity */}
      <div className="card-bezel card-bezel-cyan">
        <div className="card-inner hud-corner" style={{ padding: '24px' }}>
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '20px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{
                width: '54px',
                height: '54px',
                borderRadius: '14px',
                background: 'var(--gradient-cyan-surge)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 18px rgba(6, 182, 212, 0.4)'
              }}>
                <Package size={28} color="#ffffff" />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <h1 style={{ fontSize: '1.6rem', fontWeight: 800 }}>Инвентарь: {character.character_name}</h1>
                  {isOwner && <span className="badge badge-purple">ВЛАДЕЛЕЦ</span>}
                </div>
                <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Всего предметов: <strong style={{ color: 'var(--text-main)' }}>{summary?.total_quantity || 0}</strong> • Уникальных: <strong style={{ color: 'var(--text-main)' }}>{summary?.unique_items || 0}</strong>
                </p>
              </div>
            </div>

            {/* Capacity Progress Meter */}
            {capacity && (
              <div style={{ minWidth: '220px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '6px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Заполненность слотов</span>
                  <span style={{ color: capacity.is_overloaded ? '#ef4444' : '#67e8f9', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                    {capacity.used_slots} / {capacity.max_slots}
                  </span>
                </div>
                <div className="stat-bar-track">
                  <div 
                    className={`stat-bar-fill ${capacity.is_overloaded ? 'fill-crimson' : 'fill-cyan'}`} 
                    style={{ width: `${Math.min(100, (capacity.used_slots / capacity.max_slots) * 100)}%` }}
                  />
                </div>
                {capacity.is_overloaded && (
                  <span style={{ fontSize: '0.72rem', color: '#fca5a5', marginTop: '4px', display: 'block' }}>
                    Внимание: Превышена максимальная вместимость!
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="card-bezel" style={{ padding: '6px' }}>
        <div className="card-inner" style={{ padding: '16px 20px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
          {/* Search Box */}
          <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: '400px' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
            <input 
              type="text" 
              placeholder="Поиск по названию или описанию..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="form-input"
              style={{ paddingLeft: '36px' }}
            />
          </div>

          {/* Filters Row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <select 
              value={typeFilter} 
              onChange={(e) => setTypeFilter(e.target.value)}
              className="form-input"
              style={{ width: 'auto', padding: '8px 12px', fontSize: '0.84rem' }}
            >
              <option value="all">Все типы</option>
              <option value="equipment">Экипировка</option>
              <option value="consumable">Расходники</option>
              <option value="material">Материалы</option>
              <option value="scroll">Свитки</option>
              <option value="misc">Прочее</option>
            </select>

            <select 
              value={rarityFilter} 
              onChange={(e) => setRarityFilter(e.target.value)}
              className="form-input"
              style={{ width: 'auto', padding: '8px 12px', fontSize: '0.84rem' }}
            >
              <option value="all">Любая редкость</option>
              <option value="common">Обычный</option>
              <option value="uncommon">Необычный</option>
              <option value="rare">Редкий</option>
              <option value="epic">Эпический</option>
              <option value="legendary">Легендарный</option>
            </select>

            {/* View Mode Toggle */}
            <div style={{
              display: 'flex',
              background: 'rgba(255, 255, 255, 0.05)',
              padding: '3px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)'
            }}>
              <button 
                onClick={() => setViewMode('grid')}
                style={{
                  padding: '5px 8px',
                  borderRadius: '4px',
                  background: viewMode === 'grid' ? 'var(--accent-purple)' : 'transparent',
                  color: viewMode === 'grid' ? '#fff' : 'var(--text-muted)'
                }}
                title="Сетка"
              >
                <LayoutGrid size={15} />
              </button>
              <button 
                onClick={() => setViewMode('list')}
                style={{
                  padding: '5px 8px',
                  borderRadius: '4px',
                  background: viewMode === 'list' ? 'var(--accent-purple)' : 'transparent',
                  color: viewMode === 'list' ? '#fff' : 'var(--text-muted)'
                }}
                title="Список"
              >
                <List size={15} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Grid of Items */}
      <InventoryGrid 
        items={filteredItems} 
        viewMode={viewMode}
        totalCount={items?.length || 0}
      />
    </div>
  );
}
