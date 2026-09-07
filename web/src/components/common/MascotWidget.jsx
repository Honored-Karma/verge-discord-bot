import React, { useState, useEffect } from 'react';
import { MessageSquare, X, Sparkles, Terminal, BookOpen, Shield, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

const TACTICAL_TIPS = [
  {
    title: "Штабной брифинг",
    text: "Используйте команду /train в Discord для регулярной прокачки Атрибутов (Сила, Ловкость, Стойкость, Интеллект).",
    tag: "ПРОКАЧКА"
  },
  {
    title: "Экономика Verge",
    text: "Конвертируйте добытую руду и трофеи через команду /exchange или посетите магазин /shop.",
    tag: "РЕСУРСЫ"
  },
  {
    title: "Хроники Цусимы",
    text: "Скважины первого поколения обладают нестабильным полем Ци. Проверяйте экипировку перед рейдом!",
    tag: "ЛОР"
  },
  {
    title: "Два слота персонажа",
    text: "В личном кабинете портала можно быстро переключаться между Слотом 1 и Слотом 2.",
    tag: "СЛОТЫ"
  },
  {
    title: "Архивы Досье",
    text: "В разделе 'Анкеты' доступны одобренные карточки персонажей игроков Токио и Сеула.",
    tag: "АНКЕТЫ"
  }
];

export function MascotWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [tipIndex, setTipIndex] = useState(0);
  const [hasUnread, setHasUnread] = useState(true);

  const nextTip = () => {
    setTipIndex((prev) => (prev + 1) % TACTICAL_TIPS.length);
  };

  const handleToggle = () => {
    setIsOpen(!isOpen);
    setHasUnread(false);
  };

  const currentTip = TACTICAL_TIPS[tipIndex];

  return (
    <div className="mascot-widget-anchor" aria-label="Тактический ассистент">
      {/* Expanded Dialog Card */}
      {isOpen && (
        <div className="mascot-dialog-card card-bezel" style={{ padding: '4px' }}>
          <div className="card-inner" style={{ padding: '16px', background: 'var(--bg-surface-elevated)' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="badge badge-crimson" style={{ fontSize: '0.68rem', padding: '2px 8px' }}>
                  {currentTip.tag}
                </span>
                <span style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-main)' }}>
                  {currentTip.title}
                </span>
              </div>
              <button 
                onClick={() => setIsOpen(false)}
                style={{ color: 'var(--text-muted)', padding: '2px', display: 'flex', alignItems: 'center' }}
                aria-label="Закрыть"
              >
                <X size={16} />
              </button>
            </div>

            {/* Tip Body */}
            <p style={{ fontSize: '0.86rem', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: '14px' }}>
              {currentTip.text}
            </p>

            {/* Actions Bar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border-subtle)', paddingTop: '10px' }}>
              <button 
                onClick={nextTip}
                style={{
                  fontSize: '0.78rem',
                  color: 'var(--accent-purple-light)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontWeight: 600
                }}
              >
                <Sparkles size={13} />
                Следующий совет
              </button>

              <Link 
                to="/wiki" 
                onClick={() => setIsOpen(false)}
                style={{
                  fontSize: '0.78rem',
                  color: 'var(--accent-cyan-light)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '2px',
                  fontWeight: 600
                }}
              >
                В Wiki <ChevronRight size={13} />
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Floating Chibi Mascot Button */}
      <button 
        onClick={handleToggle}
        className="mascot-chibi-btn"
        title="Тактический штабной ассистент"
        aria-label="Открыть тактического ассистента"
      >
        <img 
          src="/assets/character/chibi_mascot.png" 
          alt="Тактический маскот" 
          className="mascot-chibi-img" 
        />
        {hasUnread && !isOpen && (
          <span 
            style={{
              position: 'absolute',
              top: '2px',
              right: '2px',
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              background: 'var(--accent-crimson)',
              border: '2px solid var(--bg-core)',
              boxShadow: '0 0 8px var(--accent-crimson)'
            }}
          />
        )}
      </button>
    </div>
  );
}
