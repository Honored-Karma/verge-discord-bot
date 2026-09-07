import React from 'react';
import { Link } from 'react-router-dom';
import { Home, Compass, AlertTriangle, ArrowRight } from 'lucide-react';

export function NotFoundPage() {
  return (
    <div style={{ maxWidth: '640px', margin: '60px auto', padding: '0 20px' }}>
      <div className="card-bezel card-bezel-crimson">
        <div className="card-inner hud-corner" style={{ padding: '48px 32px', textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
            <img 
              src="/assets/character/chibi_mascot.png" 
              alt="404 Аномалия" 
              style={{ maxHeight: '180px', objectFit: 'contain', filter: 'drop-shadow(0 12px 28px rgba(0,0,0,0.6))' }}
            />
          </div>
          <span className="badge badge-crimson" style={{ marginBottom: '12px' }}>
            ОШИБКА 404 • АНОМАЛИЯ КООРДИНАТ
          </span>
          <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '10px', fontFamily: 'var(--font-heading)' }}>
            Сектор не обнаружен
          </h1>
          <p style={{ fontSize: '0.94rem', color: 'var(--text-muted)', lineHeight: 1.65, maxWidth: '480px', margin: '0 auto 28px' }}>
            Запрашиваемый сектор портала или статья не существуют, либо были перемещены во время последней аномалии Скважины.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '14px', flexWrap: 'wrap' }}>
            <Link to="/" className="btn btn-primary btn-lg">
              <span>На главную страницу</span>
              <span className="btn-icon-bubble">
                <Home size={15} />
              </span>
            </Link>
            <Link to="/wiki" className="btn btn-secondary btn-lg">
              <span>В энциклопедию</span>
              <span className="btn-icon-bubble">
                <Compass size={15} />
              </span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
