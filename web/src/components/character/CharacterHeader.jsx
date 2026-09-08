import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { 
  Shield, 
  Package, 
  ExternalLink, 
  Copy, 
  Check, 
  Flame, 
  Award,
  Globe,
  FileText,
  User
} from 'lucide-react';
import { resolveAvatarUrl } from '../../utils/imageHelper';

export function CharacterHeader({ character, isOwnCharacter }) {
  const [copied, setCopied] = useState(false);

  const handleCopyId = () => {
    if (character?.id) {
      navigator.clipboard.writeText(character.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const bannerUrl = character.character_banner || character.banner_url;

  return (
    <div className="card-bezel card-bezel-crimson">
      <div 
        className="card-inner hud-corner" 
        style={{ 
          padding: '28px',
          position: 'relative',
          overflow: 'hidden',
          backgroundImage: bannerUrl 
            ? `linear-gradient(to right, rgba(7, 8, 13, 0.94) 0%, rgba(7, 8, 13, 0.85) 55%, rgba(7, 8, 13, 0.6) 100%), url(${bannerUrl})` 
            : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center'
        }}
      >
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '24px'
        }}>
          {/* Identity Block */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '22px', flex: '1 1 320px' }}>
            <div style={{ position: 'relative' }}>
              <img 
                src={resolveAvatarUrl(character.character_avatar, character.slug || character.id) || '/assets/character/hero_portrait.png'} 
                alt={character.character_name}
                loading="lazy"
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = '/assets/character/hero_portrait.png';
                }}
                style={{
                  width: '96px',
                  height: '96px',
                  borderRadius: '16px',
                  border: '2px solid var(--accent-purple)',
                  objectFit: 'cover',
                  background: 'var(--bg-surface)',
                  boxShadow: '0 8px 24px rgba(139, 92, 246, 0.35)'
                }}
              />
              <div style={{
                position: 'absolute',
                bottom: '-6px',
                right: '-6px',
                background: 'var(--gradient-crimson-fire)',
                color: '#ffffff',
                fontSize: '0.68rem',
                fontWeight: 800,
                padding: '3px 8px',
                borderRadius: '6px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.5)'
              }}>
                СЛОТ {character.slot}
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '8px' }}>
                <h1 style={{ fontSize: '1.8rem', fontFamily: 'var(--font-heading)', fontWeight: 800 }}>
                  {character.character_name}
                </h1>
                
                {character.attribute_name && (
                  <span className="badge badge-amber">
                    <Flame size={12} />
                    АТРИБУТ: {character.attribute_name}
                  </span>
                )}
                
                {isOwnCharacter && (
                  <span className="badge badge-cyan">
                    ВАШ ПЕРСОНАЖ
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px', fontSize: '0.88rem', color: 'var(--text-muted)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Globe size={14} color="#64748b" />
                  <span>Организация: <strong style={{ color: 'var(--text-main)' }}>{character.organization || 'Не состоит'}</strong></span>
                </div>
                <span>•</span>
                <div>
                  Ранг: <strong style={{ color: 'var(--text-main)' }}>{character.rank || '—'}</strong>
                </div>
                <span>•</span>
                <div>
                  Репутация: <strong style={{ color: '#c4b5fd' }}>{character.reputation} Rtg</strong>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginLeft: '4px' }}>
                    ({character.reputation_tier?.name})
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons with "Button-in-Button" */}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button 
              onClick={handleCopyId} 
              className="btn btn-secondary btn-sm"
              title="Скопировать ID"
            >
              <span>{copied ? 'ID скопирован' : 'ID'}</span>
              <span className="btn-icon-bubble">
                {copied ? <Check size={13} color="#22c55e" /> : <Copy size={13} />}
              </span>
            </button>

            {character.application_id && (
              <Link 
                to={`/applications/${character.application_id}`}
                className="btn btn-secondary btn-sm"
              >
                <span>Анкета</span>
                <span className="btn-icon-bubble">
                  <FileText size={13} />
                </span>
              </Link>
            )}

            <Link 
              to={`/characters/${character.id}/inventory`}
              className="btn btn-primary btn-sm"
            >
              <span>Инвентарь</span>
              <span className="btn-icon-bubble">
                <Package size={13} />
              </span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
