import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { CharacterHeader } from '../components/character/CharacterHeader';
import { PhysicalStats } from '../components/character/PhysicalStats';
import { ProgressionSection } from '../components/character/ProgressionSection';
import { EconomySection } from '../components/character/EconomySection';
import { ChevronRight, AlertCircle, Shield, Sparkles } from 'lucide-react';

export function CharacterPage() {
  const { id } = useParams();
  const { user } = useAuth();
  
  const [character, setCharacter] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // If no :id is provided in URL, load current user's active character (/api/characters/me)
  const targetUrl = id ? `/api/characters/${id}` : '/api/characters/me';

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);

    // If user is in demo mode and asking for own profile / demo character
    if (user?.id === "demo_operative_01" && (!id || id === "me" || id === user.characters?.activeCharacter?.id)) {
      setCharacter(user.characters.activeCharacter);
      setLoading(false);
      return;
    }

    fetch(targetUrl, {
      credentials: 'include',
      headers: { 'Accept': 'application/json' }
    })
      .then(async res => {
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.message || `Персонаж не найден (${res.status})`);
        }
        return res.json();
      })
      .then(data => {
        if (isMounted) {
          setCharacter(data.character || null);
        }
      })
      .catch(err => {
        if (isMounted) {
          // Fallback to active demo character if available
          if (user?.characters?.activeCharacter) {
            setCharacter(user.characters.activeCharacter);
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
  }, [id, user?.characters?.activeSlot, user?.characters?.activeCharacter]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '120px 20px' }}>
        <div className="spinner" />
        <p style={{ marginTop: '18px', color: 'var(--text-muted)', fontSize: '0.94rem' }}>
          Загрузка досье персонажа...
        </p>
      </div>
    );
  }

  if (error || !character) {
    return (
      <div className="card-bezel card-bezel-crimson" style={{ margin: '40px auto', maxWidth: '540px' }}>
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
          <h3 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '8px' }}>Досье не найдено</h3>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '24px', lineHeight: 1.6 }}>
            {error || 'Не удалось загрузить данные персонажа из базы данных.'}
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <Link to="/dashboard" className="btn btn-secondary">
              В личный кабинет
            </Link>
            <Link to="/" className="btn btn-primary">
              На главную
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const isOwnCharacter = Boolean(character.is_owner || user?.id === "demo_operative_01");

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      {/* Breadcrumb Navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.84rem', color: 'var(--text-muted)' }}>
        <Link to="/" style={{ color: 'var(--text-dim)' }}>Главная</Link>
        <ChevronRight size={14} />
        <Link to="/dashboard" style={{ color: 'var(--accent-purple-light)' }}>Кабинет</Link>
        <ChevronRight size={14} />
        <span style={{ color: 'var(--text-main)', fontWeight: 700 }}>{character.character_name}</span>
      </div>

      {/* 1. Header Dossier */}
      <CharacterHeader character={character} isOwnCharacter={isOwnCharacter} />

      {/* 2. Physical Characteristics */}
      <PhysicalStats stats={character.physical_stats} />

      {/* 3. Attribute (AP) & Combat Styles (SP) Progression */}
      <ProgressionSection character={character} />

      {/* 4. Private Economy & Salary (renders only for owner / staff) */}
      <EconomySection character={character} />
    </div>
  );
}
