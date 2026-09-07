import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  Flame, 
  Shield, 
  Zap, 
  Globe, 
  Sword, 
  Layers, 
  ChevronRight, 
  BookOpen, 
  User, 
  Sparkles, 
  FileText, 
  MessageSquare, 
  ArrowUpRight,
  TrendingUp,
  Activity,
  Terminal
} from 'lucide-react';

import { RpgDiamondBadge } from '../components/common/RpgDiamondBadge';

export function HomePage() {
  const { user } = useAuth();
  const activeChar = user?.characters?.activeCharacter;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '56px', paddingBottom: '40px' }}>
      <div className="magic-grid" />

      {/* =========================================================================
          1. HERO SECTION: TACTICAL COMMAND & CHARACTER SPOTLIGHT
          ========================================================================= */}
      <section className="card-bezel" style={{ padding: '8px' }}>
        <div className="card-inner hud-corner" style={{ padding: 'clamp(28px, 5vw, 48px)', minHeight: '480px', display: 'flex', alignItems: 'center' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            alignItems: 'center',
            gap: '40px',
            width: '100%',
            position: 'relative',
            zIndex: 2
          }}>
            {/* Left Column: Mission Briefing */}
            <div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }} className="badge badge-crimson badge-live-pulse">
                <Flame size={14} />
                <span>ХРОНИКИ ГЕНЕЗИСА • ОПЕРАТИВНЫЙ ШТАБ 2026</span>
              </div>

              <h1 style={{
                fontSize: 'clamp(2.2rem, 4.8vw, 3.6rem)',
                lineHeight: 1.1,
                marginBottom: '20px',
                fontFamily: 'var(--font-heading)',
                fontWeight: 800
              }}>
                Единый портал вселенной <br />
                <span style={{ 
                  background: 'linear-gradient(135deg, #f87171 0%, #c4b5fd 50%, #67e8f9 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  fontFamily: 'var(--font-display)'
                }}>
                  VERGE TRP
                </span>
              </h1>

              <p style={{
                fontSize: '1.05rem',
                color: 'var(--text-muted)',
                lineHeight: 1.68,
                marginBottom: '32px',
                maxWidth: '600px'
              }}>
                01.01.2020 мир раскололся: катастрофа на острове Цусима даровала людям Атрибуты и породила Скважины. 
                Управляйте своими персонажами, развивайте стили боя, отслеживайте инвентарь и влияйте на расстановку сил в Токио и Сеуле.
              </p>

              {/* Action Buttons with "Button-in-Button" Trailing Icon Architecture */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', marginBottom: '36px' }}>
                {user ? (
                  <Link to="/dashboard" className="btn btn-primary btn-lg">
                    <span>Личный кабинет</span>
                    <span className="btn-icon-bubble">
                      <User size={16} />
                    </span>
                  </Link>
                ) : (
                  <Link to="/login" className="btn btn-discord btn-lg">
                    <span>Войти через Discord</span>
                    <span className="btn-icon-bubble">
                      <Shield size={16} />
                    </span>
                  </Link>
                )}

                <Link to="/wiki" className="btn btn-secondary btn-lg">
                  <span>База знаний</span>
                  <span className="btn-icon-bubble">
                    <BookOpen size={16} />
                  </span>
                </Link>

                <Link to="/applications" className="btn btn-secondary btn-lg">
                  <span>Анкеты</span>
                  <span className="btn-icon-bubble">
                    <FileText size={16} />
                  </span>
                </Link>
              </div>

              {/* Tactical Status Ticker */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '24px',
                paddingTop: '20px',
                borderTop: '1px solid var(--border-subtle)',
                fontSize: '0.86rem',
                color: 'var(--text-dim)'
              }}>
                <div>
                  <strong style={{ color: 'var(--text-main)', fontSize: '1.15rem', fontFamily: 'var(--font-mono)' }}>51</strong>
                  <span style={{ marginLeft: '6px' }}>команда бота</span>
                </div>
                <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'var(--border-medium)' }} />
                <div>
                  <strong style={{ color: '#c4b5fd', fontSize: '1.15rem', fontFamily: 'var(--font-mono)' }}>24</strong>
                  <span style={{ marginLeft: '6px' }}>статьи лора</span>
                </div>
                <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'var(--border-medium)' }} />
                <div>
                  <strong style={{ color: '#67e8f9', fontSize: '1.15rem', fontFamily: 'var(--font-mono)' }}>4</strong>
                  <span style={{ marginLeft: '6px' }}>фракции</span>
                </div>
                <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'var(--border-medium)' }} />
                <div>
                  <span className="badge badge-emerald" style={{ padding: '3px 10px' }}>
                    <Activity size={12} style={{ marginRight: '2px' }} />
                    LIVE SYNC
                  </span>
                </div>
              </div>
            </div>

            {/* Right Column: High-End Tactical Character Art & HUD Framing */}
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              position: 'relative'
            }}>
              {/* Outer Glowing Halo */}
              <div style={{
                position: 'absolute',
                width: '320px',
                height: '320px',
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(239, 68, 68, 0.25) 0%, rgba(139, 92, 246, 0.2) 45%, transparent 70%)',
                filter: 'blur(36px)',
                zIndex: 0
              }} />

              {/* Character Glass Frame */}
              <div className="card-bezel card-bezel-crimson" style={{
                maxWidth: '380px',
                width: '100%',
                position: 'relative',
                zIndex: 1,
                transform: 'rotate(1deg)',
                animation: 'floatHero 6s ease-in-out infinite'
              }}>
                <div className="card-inner" style={{ padding: '16px', textAlign: 'center', background: 'rgba(15, 18, 29, 0.88)' }}>
                  <div style={{
                    position: 'relative',
                    borderRadius: '16px',
                    overflow: 'hidden',
                    background: 'linear-gradient(180deg, rgba(239, 68, 68, 0.15) 0%, rgba(139, 92, 246, 0.2) 100%)',
                    border: '1px solid rgba(255, 255, 255, 0.12)'
                  }}>
                    <img 
                      src="/assets/character/hero_portrait.png" 
                      alt="Verge Operative Command" 
                      style={{
                        width: '100%',
                        height: '380px',
                        objectFit: 'cover',
                        objectPosition: 'top center',
                        display: 'block',
                        filter: 'contrast(1.05) saturate(1.1)'
                      }}
                    />

                    {/* HUD Tactical Overlay Badge */}
                    <div style={{
                      position: 'absolute',
                      bottom: '12px',
                      left: '12px',
                      right: '12px',
                      background: 'rgba(7, 8, 13, 0.85)',
                      backdropFilter: 'blur(12px)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      borderRadius: '12px',
                      padding: '10px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}>
                      <div style={{ textAlign: 'left' }}>
                        <span className="badge badge-purple" style={{ fontSize: '0.65rem', padding: '1px 6px', marginBottom: '2px' }}>
                          КООРДИНАТОР
                        </span>
                        <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#ffffff' }}>
                          Штаб NERV // VERGE
                        </div>
                      </div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--accent-cyan-bright)' }}>
                        SEC: 01
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          2. ASYMMETRICAL BENTO GRID: CORE RPG SYSTEMS
          ========================================================================= */}
      <section>
        <div style={{ marginBottom: '28px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }} className="badge badge-purple">
              <Sparkles size={12} />
              МОДУЛИ И МЕХАНИКИ
            </div>
            <h2 style={{ fontSize: '1.8rem', fontWeight: 800, fontFamily: 'var(--font-heading)' }}>
              Ключевые системы вселенной
            </h2>
          </div>
          <p style={{ fontSize: '0.94rem', color: 'var(--text-muted)', maxWidth: '480px' }}>
            Автоматическая двусторонняя синхронизация между Discord-ботом и веб-порталом персонажей
          </p>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '20px'
        }}>
          {/* Card 1: AP & Attributes with Tactical Character Illustration */}
          <div className="card-bezel card-bezel-crimson">
            <div className="card-inner" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '20px' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                  <RpgDiamondBadge type="attribute" color="purple" size={54} />
                  <span className="badge badge-purple">СИСТЕМА AP</span>
                </div>
                <h3 style={{ fontSize: '1.2rem', marginBottom: '8px', fontWeight: 700 }}>Атрибуты & AP</h3>
                <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  Сверхспособности Генезиса. Каждое очко AP усиливает мощь Атрибута, снижает затраты выносливости и приближает к ступени Олицетворения (1000+ AP).
                </p>
              </div>
              <Link to="/wiki/systems/progression" className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }}>
                <span>Прогрессия AP</span>
                <span className="btn-icon-bubble">
                  <ChevronRight size={13} />
                </span>
              </Link>
            </div>
          </div>

          {/* Card 2: Martial Arts & SP */}
          <div className="card-bezel card-bezel-cyan">
            <div className="card-inner" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '20px' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                  <RpgDiamondBadge type="strength" color="cyan" size={54} />
                  <span className="badge badge-cyan">БОЕВАЯ СИСТЕМА</span>
                </div>
                <h3 style={{ fontSize: '1.2rem', marginBottom: '8px', fontWeight: 700 }}>Боевые стили & SP</h3>
                <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  Боевые дисциплины с управлением энергией Ци. Изучайте уникальные стили, повышая ранг от Новичка (0 SP) до Эксперта и Мастера (2500 SP).
                </p>
              </div>
              <Link to="/wiki/systems/combat-and-styles" className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }}>
                <span>Каталог стилей</span>
                <span className="btn-icon-bubble">
                  <ChevronRight size={13} />
                </span>
              </Link>
            </div>
          </div>

          {/* Card 3: Dual Economy */}
          <div className="card-bezel card-bezel-amber">
            <div className="card-inner" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '20px' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                  <RpgDiamondBadge type="exchange" color="amber" size={54} />
                  <span className="badge badge-amber">1 ¥ = 9.4 ₩</span>
                </div>
                <h3 style={{ fontSize: '1.2rem', marginBottom: '8px', fontWeight: 700 }}>Двойная экономика</h3>
                <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  Финансовые системы Японии (Йены) и Кореи (Воны). Автоматические еженедельные выплаты зарплат по рангам Тенрью и Стражей Мира.
                </p>
              </div>
              <Link to="/wiki/systems/economy-and-ranks" className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }}>
                <span>Ранги и зарплаты</span>
                <span className="btn-icon-bubble">
                  <ChevronRight size={13} />
                </span>
              </Link>
            </div>
          </div>

          {/* Card 4: Wells & Anomalies */}
          <div className="card-bezel card-bezel-crimson">
            <div className="card-inner" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '20px' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                  <RpgDiamondBadge type="awakening" color="crimson" size={54} />
                  <span className="badge badge-crimson">АНОМАЛИИ</span>
                </div>
                <h3 style={{ fontSize: '1.2rem', marginBottom: '8px', fontWeight: 700 }}>Скважины & Артефакты</h3>
                <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  Прорывы материи и данжи, порождённые энергией Маджин. Зачистка пространственных разломов, добыча редких свитков и легендарных томов.
                </p>
              </div>
              <Link to="/wiki/world/wells-and-anomalies" className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }}>
                <span>Исследование Скважин</span>
                <span className="btn-icon-bubble">
                  <ChevronRight size={13} />
                </span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          3. FOUR GREAT FACTIONS (GEOPOLITICS OF TOKYO & SEOUL)
          ========================================================================= */}
      <section className="card-bezel">
        <div className="card-inner" style={{ padding: 'clamp(24px, 4vw, 36px)' }}>
          <div style={{ marginBottom: '28px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }} className="badge badge-cyan">
              <Globe size={12} />
              ГЕОПОЛИТИКА МИРА
            </div>
            <h2 style={{ fontSize: '1.6rem', fontWeight: 800, marginBottom: '6px' }}>
              Четыре великие силы
            </h2>
            <p style={{ fontSize: '0.92rem', color: 'var(--text-muted)' }}>
              Баланс сил между официальными ассоциациями героев и подпольными синдикатами
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '18px' }}>
            {/* Tenryu */}
            <div style={{
              padding: '22px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid rgba(139, 92, 246, 0.35)',
              background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.12) 0%, rgba(15, 18, 29, 0.8) 100%)'
            }}>
              <span className="badge badge-purple" style={{ marginBottom: '12px' }}>Япония • Герои</span>
              <h4 style={{ fontSize: '1.2rem', margin: '4px 0 8px', fontWeight: 700 }}>Тенрью (Tenryū)</h4>
              <p style={{ fontSize: '0.86rem', color: 'var(--text-muted)', lineHeight: 1.55 }}>
                Мировая ассоциация героев. Контролирует аномалии острова Цусима. Ранговая лестница от F до высшего эшелона S.
              </p>
            </div>

            {/* Guardians */}
            <div style={{
              padding: '22px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid rgba(6, 182, 212, 0.35)',
              background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.12) 0%, rgba(15, 18, 29, 0.8) 100%)'
            }}>
              <span className="badge badge-cyan" style={{ marginBottom: '12px' }}>Корея • Военные</span>
              <h4 style={{ fontSize: '1.2rem', margin: '4px 0 8px', fontWeight: 700 }}>Стражи Мира</h4>
              <p style={{ fontSize: '0.86rem', color: 'var(--text-muted)', lineHeight: 1.55 }}>
                Армейская структура Центрального Совета. Строгая военная дисциплина, стандартизированное снаряжение и ранги VI–I.
              </p>
            </div>

            {/* Darkluster */}
            <div style={{
              padding: '22px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid rgba(100, 116, 139, 0.35)',
              background: 'linear-gradient(135deg, rgba(100, 116, 139, 0.12) 0%, rgba(15, 18, 29, 0.8) 100%)'
            }}>
              <span className="badge" style={{ marginBottom: '12px' }}>Токио • Синдикат</span>
              <h4 style={{ fontSize: '1.2rem', margin: '4px 0 8px', fontWeight: 700 }}>Мрачный Блеск</h4>
              <p style={{ fontSize: '0.86rem', color: 'var(--text-muted)', lineHeight: 1.55 }}>
                Криминальная организация Кабукичо. Семья Фукудо, древний кодекс чести, штурмовые корпуса и теневой бизнес.
              </p>
            </div>

            {/* Eclipse */}
            <div style={{
              padding: '22px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid rgba(239, 68, 68, 0.35)',
              background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.12) 0%, rgba(15, 18, 29, 0.8) 100%)'
            }}>
              <span className="badge badge-crimson" style={{ marginBottom: '12px' }}>Сеул • Радикалы</span>
              <h4 style={{ fontSize: '1.2rem', margin: '4px 0 8px', fontWeight: 700 }}>Затмение</h4>
              <p style={{ fontSize: '0.86rem', color: 'var(--text-muted)', lineHeight: 1.55 }}>
                Преступный синдикат Чжи Хон Пака. Монополия черного рынка в Хёндэ и Мёндоне, нелегальная торговля артефактами.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          4. OFFICIAL DISCORD COMMUNITY BANNER (WITH MISATO WELCOME ARTWORK)
          ========================================================================= */}
      <section className="card-bezel card-bezel-crimson">
        <div className="card-inner" style={{
          padding: 'clamp(24px, 4vw, 40px)',
          background: 'linear-gradient(135deg, rgba(24, 30, 50, 0.95) 0%, rgba(15, 18, 29, 0.95) 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '32px'
        }}>
          <div style={{ maxWidth: '600px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }} className="badge badge-purple">
              <MessageSquare size={14} />
              ОФИЦИАЛЬНОЕ RP-СООБЩЕСТВО DISCORD
            </div>
            <h2 style={{ fontSize: '1.8rem', marginBottom: '12px', fontWeight: 800, fontFamily: 'var(--font-heading)' }}>
              Присоединяйтесь к живому миру Verge
            </h2>
            <p style={{ fontSize: '0.96rem', color: 'var(--text-muted)', lineHeight: 1.65, marginBottom: '24px' }}>
              Текстовые ролевые ивенты, дуэли на аренах, закрытие Скважин в рейдовых группах, сюжетные ветки фракций и непрерывное развитие вашего героя в Discord.
            </p>
            <a 
              href="https://discord.gg" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="btn btn-discord btn-lg"
            >
              <span>Вступить в Discord</span>
              <span className="btn-icon-bubble">
                <ArrowUpRight size={16} />
              </span>
            </a>
          </div>

          {/* Welcome Mascot Artwork Container */}
          <div style={{
            width: '220px',
            height: '220px',
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <div style={{
              position: 'absolute',
              width: '180px',
              height: '180px',
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(239, 68, 68, 0.3) 0%, transparent 70%)',
              filter: 'blur(20px)'
            }} />
            <img 
              src="/assets/character/welcome_smile.png" 
              alt="Добро пожаловать в Verge" 
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                position: 'relative',
                zIndex: 1,
                filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.6))'
              }}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
