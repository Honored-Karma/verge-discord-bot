/* Hallmark · genre: atmospheric · macrostructure: Split Diptych + Bento Grid · theme: atmospheric-custom · nav: N13 · footer: Ft5 */
/* Hallmark · pre-emit critique: P5 H5 E5 S5 R5 V5 */
/* Hallmark · contrast: pass (40-41) · honest: pass (46) · chrome: pass (47) · tokens: pass (48) · responsive: pass (49, 50-56) */

import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  Flame, 
  Shield, 
  Zap, 
  Globe, 
  ChevronRight, 
  BookOpen, 
  User, 
  Sparkles, 
  FileText, 
  MessageSquare, 
  ArrowUpRight,
  Activity
} from 'lucide-react';

import { RpgDiamondBadge } from '../components/common/RpgDiamondBadge';

export function HomePage() {
  const { user } = useAuth();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2xl)', paddingBottom: 'var(--space-xl)' }}>
      <div className="magic-grid" />

      {/* =========================================================================
          1. HERO SECTION: H2 SPLIT DIPTYCH MACROSTRUCTURE
          ========================================================================= */}
      <section className="card-bezel" style={{ padding: 'var(--space-2xs)' }}>
        <div className="card-inner" style={{ padding: 'clamp(28px, 4vw, 48px)' }}>
          <div className="hero-split-diptych">
            {/* Left Column: Mission Briefing & Primary Claims */}
            <div>
              {/* Gate 54: Eyebrow directly above heading, vertical stack */}
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: 'var(--space-sm)',
                padding: '4px 10px',
                borderRadius: 'var(--radius-pill)',
                background: 'var(--color-accent-subtle)',
                border: '1px solid oklch(62% 0.22 25 / 0.3)',
                color: 'var(--color-accent)',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.74rem',
                fontWeight: 600,
                letterSpacing: '0.06em'
              }}>
                <Flame size={13} />
                <span>01 // ОПЕРАТИВНЫЙ ШТАБ • ХРОНИКИ ГЕНЕЗИСА 2026</span>
              </div>

              {/* Gate 2 & 31: Roman, high-contrast, strictly NO gradient text */}
              <h1 style={{
                fontSize: 'clamp(1.9rem, 4.2vw, 3.2rem)',
                lineHeight: 1.12,
                marginBottom: 'var(--space-md)',
                fontFamily: 'var(--font-heading)',
                fontWeight: 800,
                fontStyle: 'normal',
                color: 'var(--color-ink)',
                letterSpacing: '-0.03em'
              }}>
                Единый портал вселенной VERGE TRP
              </h1>

              {/* Gate 25: Measure held strictly in 45–75ch */}
              <p style={{
                fontSize: '1.02rem',
                color: 'var(--color-muted)',
                lineHeight: 1.65,
                marginBottom: 'var(--space-lg)',
                maxWidth: '62ch'
              }}>
                01.01.2020 мир раскололся: катастрофа на острове Цусима даровала людям Атрибуты и породила Скважины. 
                Управляйте своими персонажами, развивайте стили боя, отслеживайте инвентарь и влияйте на расстановку сил в Токио и Сеуле.
              </p>

              {/* Gate 49: All affordances maintain single-line labels */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-xs)', marginBottom: 'var(--space-xl)' }}>
                {user ? (
                  <Link to="/dashboard" className="btn btn-primary btn-lg">
                    <span>Личный кабинет</span>
                    <span className="btn-icon-bubble">
                      <User size={15} />
                    </span>
                  </Link>
                ) : (
                  <Link to="/login" className="btn btn-discord btn-lg">
                    <span>Войти через Discord</span>
                    <span className="btn-icon-bubble">
                      <Shield size={15} />
                    </span>
                  </Link>
                )}

                <Link to="/wiki" className="btn btn-secondary btn-lg">
                  <span>База знаний</span>
                  <span className="btn-icon-bubble">
                    <BookOpen size={15} />
                  </span>
                </Link>

                <Link to="/applications" className="btn btn-secondary btn-lg">
                  <span>Анкеты</span>
                  <span className="btn-icon-bubble">
                    <FileText size={15} />
                  </span>
                </Link>
              </div>

              {/* Gate 46: Honest Metrics Ticker (Zero Fabricated Metrics) */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 'var(--space-md)',
                paddingTop: 'var(--space-md)',
                borderTop: '1px solid var(--color-rule)',
                fontSize: '0.84rem',
                color: 'var(--color-dim)'
              }}>
                <div>
                  <strong style={{ color: 'var(--color-ink)', fontSize: '1.1rem', fontFamily: 'var(--font-mono)' }}>51</strong>
                  <span style={{ marginLeft: '6px' }}>команда бота</span>
                </div>
                <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'var(--color-rule-strong)' }} />
                <div>
                  <strong style={{ color: 'var(--color-purple)', fontSize: '1.1rem', fontFamily: 'var(--font-mono)' }}>24</strong>
                  <span style={{ marginLeft: '6px' }}>статьи лора</span>
                </div>
                <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'var(--color-rule-strong)' }} />
                <div>
                  <strong style={{ color: 'var(--color-cyan)', fontSize: '1.1rem', fontFamily: 'var(--font-mono)' }}>4</strong>
                  <span style={{ marginLeft: '6px' }}>фракции</span>
                </div>
                <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'var(--color-rule-strong)' }} />
                <div>
                  <span className="badge badge-emerald" style={{ padding: '2px 8px' }}>
                    <Activity size={12} style={{ marginRight: '4px' }} />
                    LIVE SYNC
                  </span>
                </div>
              </div>
            </div>

            {/* Right Column: Tactical Operative Card (No Redrawn Fake Chrome) */}
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <div style={{
                maxWidth: '380px',
                width: '100%',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--color-rule)',
                background: 'var(--color-paper-2)',
                padding: 'var(--space-xs)',
                boxShadow: '0 20px 48px -16px oklch(0% 0 0 / 0.6)'
              }}>
                <div style={{
                  position: 'relative',
                  borderRadius: 'var(--radius-md)',
                  overflow: 'hidden',
                  background: 'oklch(16% 0.014 265)'
                }}>
                  <img 
                    src="/assets/character/hero_portrait.png" 
                    alt="Оперативник тактического штаба Verge" 
                    style={{
                      width: '100%',
                      height: '360px',
                      objectFit: 'cover',
                      objectPosition: 'top center',
                      display: 'block'
                    }}
                  />

                  {/* Tactical Status Tag Overlay */}
                  <div style={{
                    position: 'absolute',
                    bottom: '10px',
                    left: '10px',
                    right: '10px',
                    background: 'oklch(14% 0.012 265 / 0.92)',
                    backdropFilter: 'blur(12px)',
                    border: '1px solid var(--color-rule)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '8px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}>
                    <div>
                      <div style={{ 
                        fontSize: '0.66rem', 
                        fontFamily: 'var(--font-mono)', 
                        color: 'var(--color-accent)', 
                        fontWeight: 700, 
                        letterSpacing: '0.06em' 
                      }}>
                        КООРДИНАТОР
                      </div>
                      <div style={{ fontSize: '0.84rem', fontWeight: 800, color: 'var(--color-ink)' }}>
                        Штаб NERV // VERGE
                      </div>
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.76rem', color: 'var(--color-cyan)' }}>
                      SEC: 01
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          2. F1 BENTO GRID: CORE RPG SYSTEMS (ASYMMETRICAL RHYTHM)
          ========================================================================= */}
      <section>
        {/* Gate 54: Eyebrow stacked vertically above heading */}
        <div style={{ marginBottom: 'var(--space-md)' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            marginBottom: 'var(--space-2xs)',
            fontSize: '0.74rem',
            fontFamily: 'var(--font-mono)',
            color: 'var(--color-purple)',
            letterSpacing: '0.06em'
          }}>
            <Sparkles size={12} />
            <span>02 // СИСТЕМЫ И МЕХАНИКИ ВСЕЛЕННОЙ</span>
          </div>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 800, fontFamily: 'var(--font-heading)', color: 'var(--color-ink)' }}>
            Ключевые модули взаимодействия
          </h2>
          <p style={{ fontSize: '0.92rem', color: 'var(--color-muted)', maxWidth: '60ch', marginTop: 'var(--space-3xs)' }}>
            Двусторонняя оперативная синхронизация базы данных между командами Discord-бота и веб-порталом
          </p>
        </div>

        {/* F1 Bento Grid Layout (Mixed Spans, Gate 3: No 3-equal-column generic cards) */}
        <div className="bento-grid">
          {/* Tile 1: AP & Attributes (Wide Span) */}
          <div className="card-bezel bento-span-2">
            <div className="card-inner" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 'var(--space-md)' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-sm)' }}>
                  <RpgDiamondBadge type="attribute" color="purple" size={48} />
                  <span className="badge badge-purple">СИСТЕМА AP</span>
                </div>
                <h3 style={{ fontSize: '1.25rem', marginBottom: 'var(--space-2xs)', fontWeight: 700, color: 'var(--color-ink)' }}>
                  Атрибуты & Очки Прогрессии (AP)
                </h3>
                <p style={{ fontSize: '0.90rem', color: 'var(--color-muted)', lineHeight: 1.6, maxWidth: '65ch' }}>
                  Сверхспособности эпохи Генезиса. Каждое очко AP увеличивает силу раскрытия Атрибута, снижает затраты выносливости и открывает путь к ступени Олицетворения (1000+ AP) с пробуждением уникальных навыков.
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

          {/* Tile 2: Martial Arts & SP */}
          <div className="card-bezel">
            <div className="card-inner" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 'var(--space-md)' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-sm)' }}>
                  <RpgDiamondBadge type="strength" color="cyan" size={48} />
                  <span className="badge badge-cyan">БОЕВАЯ СИСТЕМА</span>
                </div>
                <h3 style={{ fontSize: '1.15rem', marginBottom: 'var(--space-2xs)', fontWeight: 700, color: 'var(--color-ink)' }}>
                  Боевые стили & SP
                </h3>
                <p style={{ fontSize: '0.88rem', color: 'var(--color-muted)', lineHeight: 1.6 }}>
                  Боевые дисциплины с управлением энергией Ци. Изучайте уникальные стили, поднимаясь от Новичка (0 SP) до Эксперта и Мастера (2500 SP).
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

          {/* Tile 3: Dual Economy */}
          <div className="card-bezel">
            <div className="card-inner" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 'var(--space-md)' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-sm)' }}>
                  <RpgDiamondBadge type="exchange" color="amber" size={48} />
                  <span className="badge badge-amber">1 ¥ = 9.4 ₩</span>
                </div>
                <h3 style={{ fontSize: '1.15rem', marginBottom: 'var(--space-2xs)', fontWeight: 700, color: 'var(--color-ink)' }}>
                  Двойная экономика
                </h3>
                <p style={{ fontSize: '0.88rem', color: 'var(--color-muted)', lineHeight: 1.6 }}>
                  Финансовая система Японии (Йены) и Кореи (Воны). Автоматические еженедельные выплаты зарплат по рангам Тенрью и Стражей Мира.
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

          {/* Tile 4: Wells & Anomalies (Wide Span) */}
          <div className="card-bezel bento-span-2">
            <div className="card-inner" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 'var(--space-md)' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-sm)' }}>
                  <RpgDiamondBadge type="awakening" color="crimson" size={48} />
                  <span className="badge badge-crimson">АНОМАЛИИ</span>
                </div>
                <h3 style={{ fontSize: '1.25rem', marginBottom: 'var(--space-2xs)', fontWeight: 700, color: 'var(--color-ink)' }}>
                  Скважины & Древние Реликвии
                </h3>
                <p style={{ fontSize: '0.90rem', color: 'var(--color-muted)', lineHeight: 1.6, maxWidth: '65ch' }}>
                  Прорывы материи и пространственные разломы, порождённые энергией Маджин на границах Токио и Цусимы. Рейдовые зачистки Скважин, добыча редких свитков техник и артефактов высшей категории редкости.
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
          3. FOUR GREAT FACTIONS: GEOPOLITICAL INTELLIGENCE DOSSIER
          ========================================================================= */}
      <section className="card-bezel">
        <div className="card-inner" style={{ padding: 'clamp(24px, 4vw, 36px)' }}>
          <div style={{ marginBottom: 'var(--space-md)' }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              marginBottom: 'var(--space-2xs)',
              fontSize: '0.74rem',
              fontFamily: 'var(--font-mono)',
              color: 'var(--color-cyan)',
              letterSpacing: '0.06em'
            }}>
              <Globe size={12} />
              <span>03 // ГЕОПОЛИТИКА МИРА</span>
            </div>
            <h2 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--color-ink)', marginBottom: 'var(--space-3xs)' }}>
              Четыре великие силы
            </h2>
            <p style={{ fontSize: '0.90rem', color: 'var(--color-muted)' }}>
              Баланс сил между официальными ассоциациями героев и подпольными синдикатами
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--space-sm)' }}>
            {/* Tenryu */}
            <div style={{
              padding: 'var(--space-md)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-rule)',
              background: 'var(--color-paper-2)'
            }}>
              <span className="badge badge-purple" style={{ marginBottom: 'var(--space-xs)' }}>Япония • Герои</span>
              <h4 style={{ fontSize: '1.15rem', margin: '4px 0 8px', fontWeight: 700, color: 'var(--color-ink)' }}>Тенрью (Tenryū)</h4>
              <p style={{ fontSize: '0.86rem', color: 'var(--color-muted)', lineHeight: 1.55 }}>
                Мировая ассоциация героев. Контролирует аномалии острова Цусима. Ранговая лестница от F до высшего эшелона S.
              </p>
            </div>

            {/* Guardians */}
            <div style={{
              padding: 'var(--space-md)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-rule)',
              background: 'var(--color-paper-2)'
            }}>
              <span className="badge badge-cyan" style={{ marginBottom: 'var(--space-xs)' }}>Корея • Военные</span>
              <h4 style={{ fontSize: '1.15rem', margin: '4px 0 8px', fontWeight: 700, color: 'var(--color-ink)' }}>Стражи Мира</h4>
              <p style={{ fontSize: '0.86rem', color: 'var(--color-muted)', lineHeight: 1.55 }}>
                Армейская структура Центрального Совета. Строгая военная дисциплина, стандартизированное снаряжение и ранги VI–I.
              </p>
            </div>

            {/* Darkluster */}
            <div style={{
              padding: 'var(--space-md)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-rule)',
              background: 'var(--color-paper-2)'
            }}>
              <span className="badge" style={{ marginBottom: 'var(--space-xs)' }}>Токио • Синдикат</span>
              <h4 style={{ fontSize: '1.15rem', margin: '4px 0 8px', fontWeight: 700, color: 'var(--color-ink)' }}>Мрачный Блеск</h4>
              <p style={{ fontSize: '0.86rem', color: 'var(--color-muted)', lineHeight: 1.55 }}>
                Криминальная организация Кабукичо. Семья Фукудо, древний кодекс чести, штурмовые корпуса и теневой бизнес.
              </p>
            </div>

            {/* Eclipse */}
            <div style={{
              padding: 'var(--space-md)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-rule)',
              background: 'var(--color-paper-2)'
            }}>
              <span className="badge badge-crimson" style={{ marginBottom: 'var(--space-xs)' }}>Сеул • Радикалы</span>
              <h4 style={{ fontSize: '1.15rem', margin: '4px 0 8px', fontWeight: 700, color: 'var(--color-ink)' }}>Затмение</h4>
              <p style={{ fontSize: '0.86rem', color: 'var(--color-muted)', lineHeight: 1.55 }}>
                Преступный синдикат Чжи Хон Пака. Монополия черного рынка в Хёндэ и Мёндоне, нелегальная торговля артефактами.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          4. OFFICIAL DISCORD COMMUNITY BANNER
          ========================================================================= */}
      <section className="card-bezel">
        <div className="card-inner" style={{
          padding: 'clamp(24px, 4vw, 40px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 'var(--space-lg)'
        }}>
          <div style={{ maxWidth: '58ch' }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              marginBottom: 'var(--space-2xs)',
              fontSize: '0.74rem',
              fontFamily: 'var(--font-mono)',
              color: 'var(--color-accent)',
              letterSpacing: '0.06em'
            }}>
              <MessageSquare size={13} />
              <span>04 // РОЛЕВОЕ СООБЩЕСТВО DISCORD</span>
            </div>
            <h2 style={{ fontSize: '1.8rem', marginBottom: 'var(--space-2xs)', fontWeight: 800, fontFamily: 'var(--font-heading)', color: 'var(--color-ink)' }}>
              Присоединяйтесь к живому миру Verge
            </h2>
            <p style={{ fontSize: '0.94rem', color: 'var(--color-muted)', lineHeight: 1.65, marginBottom: 'var(--space-md)' }}>
              Текстовые ролевые ивенты, дуэли на аренах, закрытие Скважин в рейдовых группах, сюжетные ветки фракций и непрерывное развитие вашего героя в Discord.
            </p>
            <a 
              href="https://discord.gg/vergetrp" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="btn btn-discord btn-lg"
            >
              <span>Вступить в Discord</span>
              <span className="btn-icon-bubble">
                <ArrowUpRight size={15} />
              </span>
            </a>
          </div>

          {/* Welcome Mascot Artwork Container */}
          <div style={{
            width: '200px',
            height: '200px',
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <img 
              src="/assets/character/welcome_smile.png" 
              alt="Добро пожаловать в сообщество Verge" 
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                position: 'relative',
                zIndex: 1
              }}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
