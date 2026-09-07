import React from 'react';

/**
 * Safely renders highlighted matching terms without dangerouslySetInnerHTML
 */
export function SearchHighlight({ text, query, highlightStyle = {} }) {
  if (!text || typeof text !== 'string') return null;
  if (!query || typeof query !== 'string' || query.trim().length < 2) {
    return <span>{text}</span>;
  }

  const cleanQuery = query.trim();
  // Safe split using case-insensitive regex
  const escaped = cleanQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  const parts = text.split(regex);

  return (
    <span>
      {parts.map((part, i) => {
        const isMatch = part.toLowerCase() === cleanQuery.toLowerCase();
        return isMatch ? (
          <mark
            key={i}
            style={{
              background: 'rgba(139, 92, 246, 0.35)',
              color: '#ffffff',
              padding: '0 2px',
              borderRadius: '3px',
              fontWeight: 700,
              ...highlightStyle
            }}
          >
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        );
      })}
    </span>
  );
}
