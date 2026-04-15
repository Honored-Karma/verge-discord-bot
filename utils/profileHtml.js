import nodeHtmlToImage from 'node-html-to-image';

/**
 * Generates a profile card image as a PNG buffer using HTML/CSS rendering.
 *
 * @param {object} data
 * @param {string}  data.characterName
 * @param {string|null} data.avatarUrl
 * @param {number}  data.level
 * @param {number}  data.xp
 * @param {number}  data.xpToNextLevel
 * @param {Array<{name:string, sp:number}>} data.styles - top 3
 * @param {string|null} data.attributeName
 * @param {number}  data.attributeValue
 * @param {number}  data.totalSP
 * @param {string|null} data.orgName
 * @param {string|null} data.orgRank
 * @param {string}  data.playerId
 * @param {number}  data.slot
 * @returns {Promise<Buffer>} PNG buffer
 */
export async function generateProfileCard(data) {
    const {
        characterName = 'Unknown',
        avatarUrl,
        level = 0,
        xp = 0,
        xpToNextLevel = 100,
        styles = [],
        attributeName,
        attributeValue = 0,
        totalSP = 0,
        orgName,
        orgRank,
        playerId = '',
        slot = 1,
    } = data;

    const apPercent = xpToNextLevel > 0 ? Math.min((xp / xpToNextLevel) * 100, 100) : 0;
    const spPercent = totalSP > 0 ? Math.min(totalSP / 10, 100) : 0; // scale as needed

    const topStyles = styles.slice(0, 3);
    const stylesHtml = topStyles.length > 0
        ? topStyles.map(s => `<span class="style-tag">${escHtml(s.name)} <b>${s.sp}</b></span>`).join('')
        : '<span class="style-tag dim">Нет стилей</span>';

    const avatarSrc = avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png';
    const attrDisplay = attributeName ? `${escHtml(attributeName)}` : '—';

    const html = `
    <html>
    <head>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&display=swap');

        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            width: 900px;
            height: 380px;
            font-family: 'Inter', 'Segoe UI', Arial, sans-serif;
            background: transparent;
            display: flex;
            justify-content: center;
            align-items: center;
        }

        .card {
            width: 880px;
            height: 360px;
            background: linear-gradient(135deg, #1a0a2e 0%, #16213e 40%, #0f3460 100%);
            border-radius: 24px;
            display: flex;
            overflow: hidden;
            position: relative;
            box-shadow: 0 8px 32px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05);
            border: 1px solid rgba(138, 43, 226, 0.3);
        }

        .card::before {
            content: '';
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            background: radial-gradient(ellipse at 20% 50%, rgba(138,43,226,0.15) 0%, transparent 60%),
                        radial-gradient(ellipse at 80% 20%, rgba(59,130,246,0.1) 0%, transparent 50%);
            pointer-events: none;
        }

        .avatar-section {
            width: 240px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 24px;
            position: relative;
            z-index: 1;
        }

        .avatar-ring {
            width: 160px;
            height: 160px;
            border-radius: 50%;
            padding: 4px;
            background: linear-gradient(135deg, #8b5cf6, #3b82f6, #8b5cf6);
            box-shadow: 0 0 20px rgba(139, 92, 246, 0.4);
        }

        .avatar-img {
            width: 100%;
            height: 100%;
            border-radius: 50%;
            object-fit: cover;
            display: block;
        }

        .level-badge {
            margin-top: 12px;
            background: linear-gradient(135deg, #8b5cf6, #6d28d9);
            color: #fff;
            font-weight: 900;
            font-size: 18px;
            padding: 6px 20px;
            border-radius: 20px;
            letter-spacing: 1px;
            text-shadow: 0 2px 4px rgba(0,0,0,0.5);
            box-shadow: 0 4px 12px rgba(139, 92, 246, 0.4);
        }

        .info-section {
            flex: 1;
            padding: 28px 32px 24px 16px;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            position: relative;
            z-index: 1;
        }

        .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
        }

        .char-name {
            font-size: 32px;
            font-weight: 900;
            color: #ffffff;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 420px;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.8);
            line-height: 1.1;
        }

        .attr-badge {
            background: rgba(139, 92, 246, 0.25);
            border: 1px solid rgba(139, 92, 246, 0.5);
            color: #c4b5fd;
            font-size: 14px;
            font-weight: 600;
            padding: 4px 14px;
            border-radius: 12px;
            white-space: nowrap;
        }

        .org-row {
            display: flex;
            gap: 16px;
            margin-top: 6px;
        }

        .org-item {
            font-size: 13px;
            color: #94a3b8;
            white-space: nowrap;
        }
        .org-item b {
            color: #cbd5e1;
        }

        .bars {
            display: flex;
            flex-direction: column;
            gap: 14px;
            margin-top: 8px;
        }

        .bar-group {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        .bar-label {
            display: flex;
            justify-content: space-between;
            font-size: 13px;
            font-weight: 600;
        }
        .bar-label-name {
            color: #e2e8f0;
            text-shadow: 1px 1px 2px rgba(0,0,0,0.6);
        }
        .bar-label-value {
            color: #94a3b8;
        }

        .bar-track {
            width: 100%;
            height: 18px;
            background: rgba(255,255,255,0.06);
            border-radius: 10px;
            overflow: hidden;
            position: relative;
        }

        .bar-fill-ap {
            height: 100%;
            border-radius: 10px;
            background: linear-gradient(90deg, #f59e0b, #f97316, #ef4444);
            box-shadow: 0 0 12px rgba(245, 158, 11, 0.5);
            transition: width 0.3s;
        }

        .bar-fill-sp {
            height: 100%;
            border-radius: 10px;
            background: linear-gradient(90deg, #06b6d4, #8b5cf6, #a855f7);
            box-shadow: 0 0 12px rgba(139, 92, 246, 0.5);
            transition: width 0.3s;
        }

        .styles-row {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
            margin-top: 4px;
        }

        .style-tag {
            background: rgba(255,255,255,0.06);
            border: 1px solid rgba(255,255,255,0.1);
            color: #e2e8f0;
            font-size: 12px;
            padding: 3px 10px;
            border-radius: 8px;
            white-space: nowrap;
        }
        .style-tag b {
            color: #a78bfa;
        }
        .style-tag.dim {
            color: #64748b;
        }

        .footer-id {
            position: absolute;
            bottom: 10px;
            right: 16px;
            font-size: 10px;
            color: rgba(255,255,255,0.2);
            z-index: 1;
        }
    </style>
    </head>
    <body>
        <div class="card">
            <div class="avatar-section">
                <div class="avatar-ring">
                    <img class="avatar-img" src="${escHtml(avatarSrc)}" />
                </div>
                <div class="level-badge">LVL ${level}</div>
            </div>

            <div class="info-section">
                <div>
                    <div class="header">
                        <div class="char-name">${escHtml(characterName)}</div>
                        <div class="attr-badge">AP | ${attrDisplay}</div>
                    </div>

                    <div class="org-row">
                        <div class="org-item"><b>Организация:</b> ${escHtml(orgName || 'Нет')}</div>
                        <div class="org-item"><b>Ранг:</b> ${escHtml(orgRank || 'Нет')}</div>
                    </div>
                </div>

                <div class="bars">
                    <div class="bar-group">
                        <div class="bar-label">
                            <span class="bar-label-name">АП (Очки Атрибута)</span>
                            <span class="bar-label-value">${xp} / ${xpToNextLevel} XP</span>
                        </div>
                        <div class="bar-track">
                            <div class="bar-fill-ap" style="width: ${apPercent.toFixed(1)}%"></div>
                        </div>
                    </div>

                    <div class="bar-group">
                        <div class="bar-label">
                            <span class="bar-label-name">СП (Очки Стиля)</span>
                            <span class="bar-label-value">${totalSP} SP</span>
                        </div>
                        <div class="bar-track">
                            <div class="bar-fill-sp" style="width: ${spPercent.toFixed(1)}%"></div>
                        </div>
                    </div>
                </div>

                <div class="styles-row">
                    ${stylesHtml}
                </div>
            </div>

            <div class="footer-id">ID: ${escHtml(playerId)} • Слот №${slot}</div>
        </div>
    </body>
    </html>`;

    const buffer = await nodeHtmlToImage({
        html,
        quality: 100,
        type: 'png',
        transparent: true,
        puppeteerArgs: {
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        },
        encoding: 'buffer',
    });

    return buffer;
}

function escHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
