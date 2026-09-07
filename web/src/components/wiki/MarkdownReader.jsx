import React from 'react';
import { Link } from 'react-router-dom';

/**
 * Clean slug generation for headings to support smooth TOC scrolling
 */
export function headingToId(text) {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[^\w\u0400-\u04FF\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

/**
 * Safe, stylized Markdown renderer for encyclopedic reading
 */
export function MarkdownReader({ content = '' }) {
  if (!content) return null;

  const lines = content.split('\n');
  const elements = [];
  let currentList = null;
  let listType = null; // 'ul' | 'ol'

  function flushList() {
    if (currentList && currentList.length > 0) {
      if (listType === 'ol') {
        elements.push(
          <ol key={`ol-${elements.length}`} style={{ paddingLeft: '24px', margin: '14px 0', lineHeight: 1.7 }}>
            {currentList.map((item, idx) => (
              <li key={idx} style={{ marginBottom: '6px', color: 'var(--text-main)' }}>
                {renderInlineFormatting(item)}
              </li>
            ))}
          </ol>
        );
      } else {
        elements.push(
          <ul key={`ul-${elements.length}`} style={{ paddingLeft: '24px', margin: '14px 0', lineHeight: 1.7 }}>
            {currentList.map((item, idx) => (
              <li key={idx} style={{ marginBottom: '6px', color: 'var(--text-main)' }}>
                {renderInlineFormatting(item)}
              </li>
            ))}
          </ul>
        );
      }
      currentList = null;
      listType = null;
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (!trimmed) {
      flushList();
      continue;
    }

    // 1. Heading 2 (##)
    if (trimmed.startsWith('## ')) {
      flushList();
      const title = trimmed.replace(/^##\s+/, '');
      const id = headingToId(title);
      elements.push(
        <h2 
          key={`h2-${i}`} 
          id={id}
          style={{ 
            fontSize: '1.45rem', 
            fontWeight: 700, 
            marginTop: '32px', 
            marginBottom: '14px', 
            color: 'var(--text-main)',
            borderBottom: '1px solid var(--border-color)',
            paddingBottom: '8px',
            letterSpacing: '-0.02em',
            scrollMarginTop: '90px'
          }}
        >
          {renderInlineFormatting(title)}
        </h2>
      );
      continue;
    }

    // 2. Heading 3 (###)
    if (trimmed.startsWith('### ')) {
      flushList();
      const title = trimmed.replace(/^###\s+/, '');
      const id = headingToId(title);
      elements.push(
        <h3 
          key={`h3-${i}`} 
          id={id}
          style={{ 
            fontSize: '1.2rem', 
            fontWeight: 600, 
            marginTop: '26px', 
            marginBottom: '10px', 
            color: 'var(--accent-purple-light, #a78bfa)',
            letterSpacing: '-0.01em',
            scrollMarginTop: '90px'
          }}
        >
          {renderInlineFormatting(title)}
        </h3>
      );
      continue;
    }

    // 3. Blockquote (> )
    if (trimmed.startsWith('> ')) {
      flushList();
      const quoteText = trimmed.replace(/^>\s*/, '');
      elements.push(
        <blockquote 
          key={`quote-${i}`} 
          style={{
            margin: '16px 0',
            padding: '12px 18px',
            borderLeft: '4px solid var(--accent-purple)',
            background: 'rgba(139, 92, 246, 0.07)',
            borderRadius: '0 8px 8px 0',
            color: 'var(--text-main)',
            fontStyle: 'italic',
            lineHeight: 1.6
          }}
        >
          {renderInlineFormatting(quoteText)}
        </blockquote>
      );
      continue;
    }

    // 4. Unordered List (- or *)
    if (/^[-*]\s+/.test(trimmed)) {
      if (listType !== 'ul') {
        flushList();
        listType = 'ul';
        currentList = [];
      }
      currentList.push(trimmed.replace(/^[-*]\s+/, ''));
      continue;
    }

    // 5. Ordered List (1. 2.)
    if (/^\d+\.\s+/.test(trimmed)) {
      if (listType !== 'ol') {
        flushList();
        listType = 'ol';
        currentList = [];
      }
      currentList.push(trimmed.replace(/^\d+\.\s+/, ''));
      continue;
    }

    // 6. Regular Paragraph
    flushList();
    elements.push(
      <p 
        key={`p-${i}`} 
        style={{ 
          margin: '14px 0', 
          lineHeight: 1.75, 
          fontSize: '0.98rem', 
          color: 'var(--text-main)',
          wordBreak: 'break-word'
        }}
      >
        {renderInlineFormatting(trimmed)}
      </p>
    );
  }

  flushList();

  return <div className="wiki-markdown-body">{elements}</div>;
}

/**
 * Format inline markdown: **bold**, `code`, *italic* safely
 */
function renderInlineFormatting(text) {
  if (!text) return null;

  // Split by bold (**...**) and code (`...`) tokens
  const parts = [];
  let remaining = text;
  let keyIndex = 0;

  // Regex to match **bold** or `code` or *italic*
  const tokenRegex = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/;

  while (remaining) {
    const match = remaining.match(tokenRegex);
    if (!match) {
      parts.push(remaining);
      break;
    }

    const matchIndex = match.index;
    if (matchIndex > 0) {
      parts.push(remaining.substring(0, matchIndex));
    }

    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      parts.push(
        <strong key={`b-${keyIndex++}`} style={{ fontWeight: 700, color: 'var(--text-main)' }}>
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith('`') && token.endsWith('`')) {
      parts.push(
        <code 
          key={`c-${keyIndex++}`} 
          style={{ 
            background: 'rgba(255, 255, 255, 0.08)', 
            padding: '2px 6px', 
            borderRadius: '4px', 
            fontSize: '0.88em',
            fontFamily: 'monospace',
            color: 'var(--accent-purple-light, #c4b5fd)'
          }}
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith('*') && token.endsWith('*')) {
      parts.push(
        <em key={`em-${keyIndex++}`} style={{ fontStyle: 'italic' }}>
          {token.slice(1, -1)}
        </em>
      );
    }

    remaining = remaining.substring(matchIndex + token.length);
  }

  return parts;
}
