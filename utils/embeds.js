import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

const BANNERS = {
    default: 'https://iili.io/BP3OOut.png',
    error: 'https://iili.io/BP3OMMJ.png',
    cooldown: 'https://s.iimg.su/s/22/uClf58LxwwC7ZyuLlAWkzTJ3TD4tsoH4fjoKN653.jpg',
    profile: 'https://s.iimg.su/s/22/ufkWBu0xWZJ35E1dhmIFfmTwEoXZtvP8zOPqXpsI.jpg',
    progress: 'https://iili.io/BP3eTNt.png',
    balance: 'https://iili.io/BP3OayP.png',
    styles: 'https://iili.io/BP3eIRI.png',
    inventory: 'https://iili.io/BP3O8ns.png',
    train: 'https://iili.io/BP3eoSp.png',
    social: 'https://iili.io/BP3eoSp.png',
    pay: 'https://iili.io/BP3OLN9.png',
    stylesList: 'https://iili.io/BP3enlR.png',
    register: 'https://iili.io/BP3ODMb.png',
    help: 'https://iili.io/BP3OOut.png',
    ranksInfo: 'https://iili.io/BP3OQte.png',
    profileHistory: 'https://iili.io/BP3Oktn.png',
    leaderboardAp: 'https://iili.io/BP3OSMG.png',
    leaderboardSp: 'https://iili.io/BP3OUPf.png',
    leaderboardYen: 'https://iili.io/BP3O6S2.png',
    leaderboardKrw: 'https://iili.io/BP3O4cl.png',
    addAp: 'https://iili.io/BP3OY8B.png',
    addCurrency: 'https://iili.io/BP3O7aV.png',
    addSp: 'https://iili.io/BP3OA6x.png',
    addStyle: 'https://iili.io/BP3O53Q.png',
    deductCurrency: 'https://iili.io/BP3Olu1.png',
    deleteStyle: 'https://iili.io/BP3O1Zg.png',
    deleteUser: 'https://iili.io/BP3OGna.png',
    exchange: 'https://iili.io/BP3OGna.png',
    giveItem: 'https://iili.io/BP3Ohap.png',
    giveStyle: 'https://iili.io/BP3Oj8N.png',
    removePlayerStyle: 'https://iili.io/BP3ObPj.png',
    setAp: 'https://iili.io/BP3OpKx.png',
    setApMultiplier: 'https://iili.io/BP3eJHB.png',
    setAvatar: 'https://iili.io/BP3OycQ.png',
    setCurrency: 'https://iili.io/BP3e9SV.png',
    setRank: 'https://iili.io/BP3edAP.png',
    setSp: 'https://iili.io/BP3e3DF.png',
    setSpMultiplier: 'https://iili.io/BP3edAP.png',
    slot: 'https://iili.io/BP3eKog.png',
    slots: 'https://iili.io/BP3eqiJ.png',
    use: 'https://iili.io/BP3ezHN.png',
    logDisable: 'https://iili.io/BP3Oi9S.png',
    logEnable: 'https://iili.io/BP3OsA7.png',
};

export function createSuccessEmbed(title, description, bannerKey = 'default') {
    return new EmbedBuilder()
        .setColor(0xB209D4)
        .setTitle(`<:37plus:1497656766459281428>  ${title}`)
        .setDescription(description)
        .setImage(BANNERS[bannerKey] || BANNERS.default)
        .setTimestamp();
}

export function createErrorEmbed(title, description) {
    return new EmbedBuilder()
        .setColor(0xB209D4)
        .setTitle(`<:38minus:1497656812772655154>  ${title}`)
        .setDescription(description)
        .setImage(BANNERS.error)
        .setTimestamp();
}

export function createInfoEmbed(title, description, bannerKey = 'default') {
    return new EmbedBuilder()
        .setColor(0xB209D4)
        .setTitle(title)
        .setDescription(description)
        .setImage(BANNERS[bannerKey] || BANNERS.default)
        .setTimestamp();
}

export function createCooldownEmbed(actionName, unixTimestamp) {
    return new EmbedBuilder()
        .setColor(0xB209D4)
        .setTitle(`⏳ ${actionName}: cooldown`)
        .setDescription(`Следующее действие будет доступно <t:${unixTimestamp}:R>.\nТочное время: <t:${unixTimestamp}:F>`)
        .setImage(BANNERS.cooldown)
        .setTimestamp();
}

export function createModernProfileEmbed(player, user, history = []) {
    const rankValue = player.rank || 'Нет ранга';
    const apMultiplier = Number(player.ap_multiplier || 100);
    const spMultiplier = Number(player.sp_multiplier || 100);
    const apExpires = Number(player.ap_multiplier_expires_at || 0);
    const spExpires = Number(player.sp_multiplier_expires_at || 0);
    const apExpireText = apExpires > 0 ? ` (до <t:${apExpires}:R>)` : '';
    const spExpireText = spExpires > 0 ? ` (до <t:${spExpires}:R>)` : '';
    const historyText = history.length > 0
        ? history.map((entry) => {
            const deltaSign = entry.delta >= 0 ? '+' : '';
            const timestamp = Math.floor(new Date(entry.changed_at).getTime() / 1000);
            return `• ${entry.type.toUpperCase()} ${deltaSign}${entry.delta} (<t:${timestamp}:R>)`;
        }).join('\n')
        : 'Изменений пока нет';

    return new EmbedBuilder()
        .setColor(0xB209D4)
        .setTitle(`🧬 Профиль: ${player.character_name || player.username}`)
        .setThumbnail(player.character_avatar || user.displayAvatarURL({ dynamic: true }))
        .addFields(
            { name: '🏢 Организация', value: player.organization || 'Не указана', inline: true },
            { name: '<:13medal:1494708705759989760>  Ранг', value: rankValue, inline: true },
            { name: '<:AP28112025:1443994380670337245>  AP', value: `${player.ap || 0}`, inline: true },
            { name: '<:SP28112025:1443994403604533268>  SP (total)', value: `${player.total_sp || 0}`, inline: true },
            { name: '<:Flag_of_South_Korea:1438985777949179935>  KRW', value: `${Number(player.krw || 0).toLocaleString('ru-RU')}`, inline: true },
            { name: '<:2640japanflag:1438980353925714081>  YEN', value: `${Number(player.yen || 0).toLocaleString('ru-RU')}`, inline: true },
            { name: '<:14LightningPurple:1494708639473074277>  Множители', value: `AP: **${apMultiplier}%**${apExpireText}\nSP: **${spMultiplier}%**${spExpireText}`, inline: true },
            { name: '🕓 Последние изменения', value: historyText, inline: false }
        )
        .setFooter({ text: `ID: ${player.id}` })
        .setTimestamp();
}

export function createLeaderboardEmbed(title, description, sortBy) {
    const embed = new EmbedBuilder()
        .setColor(0xB209D4)
        .setTitle(title)
        .setDescription(description)
        .setTimestamp();
    
    if (sortBy === 'ap') {
        embed.setImage(BANNERS.leaderboardAp);
    } else if (sortBy === 'sp') {
        embed.setImage(BANNERS.leaderboardSp);
    } else if (sortBy === 'krw') {
        embed.setImage(BANNERS.leaderboardKrw);
    } else if (sortBy === 'yen') {
        embed.setImage(BANNERS.leaderboardYen);
    }
    
    return embed;
}

export function createTrainEmbed(title, description) {
    return new EmbedBuilder()
        .setColor(0xB209D4)
        .setTitle(`<:37plus:1497656766459281428>  ${title}`)
        .setDescription(description)
        .setImage(BANNERS.train)
        .setTimestamp();
}

export function createSocialRPEmbed(title, description) {
    return new EmbedBuilder()
        .setColor(0xB209D4)
        .setTitle(`<:37plus:1497656766459281428>  ${title}`)
        .setDescription(description)
        .setImage(BANNERS.social)
        .setTimestamp();
}

export function createPayEmbed(title, description) {
    return new EmbedBuilder()
        .setColor(0xB209D4)
        .setTitle(`<:37plus:1497656766459281428>  ${title}`)
        .setDescription(description)
        .setImage(BANNERS.pay)
        .setTimestamp();
}

export function createInventoryEmbed(title, description) {
    return new EmbedBuilder()
        .setColor(0xB209D4)
        .setTitle(title)
        .setDescription(description)
        .setImage(BANNERS.inventory)
        .setTimestamp();
}

export function createRegisterEmbed(title, description) {
    return new EmbedBuilder()
        .setColor(0xB209D4)
        .setTitle(`<:37plus:1497656766459281428>  ${title}`)
        .setDescription(description)
        .setImage(BANNERS.register)
        .setTimestamp();
}

export function createStylesListEmbed(title, description, page = 1, totalPages = 1) {
    const embed = new EmbedBuilder()
        .setColor(0xB209D4)
        .setTitle(title)
        .setDescription(description)
        .setImage(BANNERS.stylesList)
        .setTimestamp();
    
    if (totalPages > 1) {
        embed.setFooter({ text: `Страница ${page}/${totalPages}` });
    }
    
    return embed;
}

export function createStylesNavigationButtons(page = 0, totalPages = 1) {
    const row = new ActionRowBuilder();
    
    const prevButton = new ButtonBuilder()
        .setCustomId('styles_prev')
        .setLabel('← Назад')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(page === 0);
    
    const nextButton = new ButtonBuilder()
        .setCustomId('styles_next')
        .setLabel('Вперёд →')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(page === totalPages - 1);
    
    row.addComponents(prevButton, nextButton);
    
    return row;
}

export function createProfileMainPage(player, user) {
    // Получаем номер слота из аргумента, если передан
    let slotNumber = 1;
    if (arguments.length > 2 && (arguments[2] === 1 || arguments[2] === 2)) {
        slotNumber = arguments[2];
    } else if (player.id && typeof player.id === 'string' && player.id.includes('_')) {
        const parts = player.id.split('_');
        if (parts.length === 2 && !isNaN(Number(parts[1]))) {
            slotNumber = Number(parts[1]);
        }
    }
    const embed = new EmbedBuilder()
        .setColor(0xB209D4)
        .setTitle(`🧬 Профиль — ${player.character_name || player.username}`)
        .setThumbnail(player.character_avatar || user.displayAvatarURL({ dynamic: true }))
        .setImage(BANNERS.profile)
        .setTimestamp();

    embed.addFields({ name: '🟦 Активный слот', value: `Слот №${slotNumber}`, inline: true });
    embed.addFields({ name: '🏢 Организация', value: player.organization || 'Не указана', inline: true });
    embed.addFields({ name: '<:13medal:1494708705759989760>  Ранг', value: player.rank || 'Нет ранга', inline: true });
    embed.addFields({ name: '<:AP28112025:1443994380670337245>  Очки способностей (AP)', value: `${player.ap} AP`, inline: true });
    const apMult = Number(player.ap_multiplier || 100);
    const spMult = Number(player.sp_multiplier || 100);
    const apExp = Number(player.ap_multiplier_expires_at || 0);
    const spExp = Number(player.sp_multiplier_expires_at || 0);
    let multText = `AP: **${apMult}%**`;
    if (apExp > 0) multText += ` (до <t:${apExp}:R>)`;
    multText += ` / SP: **${spMult}%**`;
    if (spExp > 0) multText += ` (до <t:${spExp}:R>)`;
    embed.addFields({ name: '<:14LightningPurple:1494708639473074277>  Множители', value: multText, inline: true });

    if (player.unlocked_avatar) {
        embed.addFields({ name: '🌟 Статус', value: 'Олицетворение достигнуто', inline: false });
    }

    if (player.krw > 0 || player.yen > 0) {
        let currencyText = '';
        if (player.krw > 0) currencyText += `<:Flag_of_South_Korea:1438985777949179935>  **${player.krw.toLocaleString('ru-RU')}** KRW\n`;
        if (player.yen > 0) currencyText += `<:2640japanflag:1438980353925714081>  **${player.yen.toLocaleString('ru-RU')}** ¥`;
        embed.addFields({ name: '<:money:1494767683244265652>  Валюта', value: currencyText || 'Нет валюты', inline: false });
    }

    embed.setFooter({ text: `ID: ${player.id} • Страница 1/4` });

    return embed;
}

export function createProfileAPSPPage(player, user, totalSP = 0) {
    const embed = new EmbedBuilder()
        .setColor(0xB209D4)
        .setTitle(`📊 Прогресс — ${player.character_name || player.username}`)
        .setThumbnail(player.character_avatar || user.displayAvatarURL({ dynamic: true }))
        .setImage(BANNERS.progress)
        .setTimestamp();
    
    const nextMilestone = Math.ceil(player.ap / 100) * 100;
    const previousMilestone = Math.floor(player.ap / 100) * 100;
    const progressInRange = player.ap - previousMilestone;
    
    const apBar = createProgressBar(progressInRange, 100, 20);
    embed.addFields({ 
        name: '⚡ Прогресс AP', 
        value: `${apBar}\n**${player.ap}** AP (следующая отметка: ${nextMilestone} AP)`,
        inline: false 
    });
    
    embed.addFields({ name: '🥋 Всего SP', value: `${totalSP} SP`, inline: true });

    const apMult = Number(player.ap_multiplier || 100);
    const spMult = Number(player.sp_multiplier || 100);
    const apExp = Number(player.ap_multiplier_expires_at || 0);
    const spExp = Number(player.sp_multiplier_expires_at || 0);
    let multText = `AP: **${apMult}%**`;
    if (apExp > 0) multText += ` (до <t:${apExp}:R>)`;
    multText += `\nSP: **${spMult}%**`;
    if (spExp > 0) multText += ` (до <t:${spExp}:R>)`;
    embed.addFields({ name: '📈 Множители', value: multText, inline: true });

    embed.setFooter({ text: `ID: ${player.id} • Страница 2/4` });
    
    return embed;
}

export function createProfileBalancePage(player, user) {
    const embed = new EmbedBuilder()
        .setColor(0xB209D4)
        .setTitle(`<:38126donatorpurple:1456772668572434443>  Баланс — ${player.character_name || player.username}`)
        .setThumbnail(player.character_avatar || user.displayAvatarURL({ dynamic: true }))
        .setImage(BANNERS.balance)
        .setTimestamp();
    
    let balanceText = '';
    if (player.krw > 0) {
        balanceText += `<:Flag_of_South_Korea:1438985777949179935>  **${player.krw.toLocaleString('ru-RU')}** KRW\n`;
    } else {
        balanceText += `<:Flag_of_South_Korea:1438985777949179935>  **0** KRW\n`;
    }
    
    if (player.yen > 0) {
        balanceText += `<:2640japanflag:1438980353925714081>  **${player.yen.toLocaleString('ru-RU')}** ¥`;
    } else {
        balanceText += `<:2640japanflag:1438980353925714081>  **0** ¥`;
    }
    
    embed.addFields({ name: '📊 Валюты', value: balanceText, inline: false });
    embed.setFooter({ text: `ID: ${player.id} • Страница 4/4` });
    
    return embed;
}

export function createProfileStylesPage(player, styles, user, page = 0) {
    const embed = new EmbedBuilder()
        .setColor(0xB209D4)
        .setTitle(`🥋 Боевые стили — ${player.character_name || player.username}`)
        .setThumbnail(player.character_avatar || user.displayAvatarURL({ dynamic: true }))
        .setImage(BANNERS.styles)
        .setTimestamp();
    
    if (!styles || styles.length === 0) {
        embed.setDescription('Нет изученных стилей');
        embed.setFooter({ text: `ID: ${player.id} • Страница 3/4` });
        return { embed, totalPages: 1 };
    }
    
    const itemsPerPage = 3;
    const totalPages = Math.ceil(styles.length / itemsPerPage);
    const start = page * itemsPerPage;
    const end = start + itemsPerPage;
    const pageStyles = styles.slice(start, end);
    
    pageStyles.forEach(style => {
        const rank = getSPRankInfo(style.sp);
        const progressBar = createSPProgressBar(style.sp, rank.nextThreshold);
        
        const fieldValue = `${rank.emoji} **${rank.rank}** (${style.sp} SP)\n${progressBar}`;
        embed.addFields({ name: `${style.name}`, value: fieldValue, inline: false });
    });
    
    embed.setFooter({ text: `ID: ${player.id} • Страница 3/4 • Стили: ${page + 1}/${totalPages}` });
    
    return { embed, totalPages };
}


function createProgressBar(current, max, length = 20) {
    const percentage = Math.min(100, Math.max(0, (current / max) * 100));
    const filledBlocks = Math.floor((percentage / 100) * length);
    const emptyBlocks = length - filledBlocks;
    
    const filled = '█'.repeat(filledBlocks);
    const empty = '░'.repeat(emptyBlocks);
    
    return `${filled}${empty} ${percentage.toFixed(0)}% (${current}/${max})`;
}

function createSPProgressBar(sp) {
    // Определяем диапазоны и следующую цель для каждого ранга
    let currentMin, nextTarget;
    
    if (sp >= 2500) {
        return '█████████████████████ 100% (МАСТЕР)';
    } else if (sp >= 1000) {
        // Эксперт (1000-2499) -> цель Мастер (2500)
        currentMin = 1000;
        nextTarget = 2500;
    } else if (sp >= 350) {
        // Владелец (350-999) -> цель Эксперт (1000)
        currentMin = 350;
        nextTarget = 1000;
    } else {
        // Новичок (0-349) -> цель Владелец (350)
        currentMin = 0;
        nextTarget = 350;
    }
    
    const progress = sp - currentMin;
    const total = nextTarget - currentMin;
    const percentage = Math.min(100, Math.max(0, (progress / total) * 100));
    const filledBlocks = Math.floor((percentage / 100) * 20);
    const emptyBlocks = 20 - filledBlocks;
    
    const filled = '█'.repeat(filledBlocks);
    const empty = '░'.repeat(emptyBlocks);
    
    return `${filled}${empty} ${percentage.toFixed(0)}% (${sp}/${nextTarget})`;
}

function getSPRankInfo(sp) {
    if (sp >= 2500) return { rank: 'Мастер', emoji: '🔴', nextThreshold: 2500 };
    if (sp >= 1000) return { rank: 'Эксперт', emoji: '🟠', nextThreshold: 2500 };
    if (sp >= 350) return { rank: 'Владелец', emoji: '🟡', nextThreshold: 1000 };
    return { rank: 'Новичок', emoji: '⚪', nextThreshold: 350 };
}

export function createProfileButtons(page) {
    const row = new ActionRowBuilder();
    
    if (page === 0) {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId('profile_main')
                .setLabel('Основная')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(true),
            new ButtonBuilder()
                .setCustomId('profile_apsp')
                .setLabel('AP/SP')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('profile_styles')
                .setLabel('Стили')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('profile_balance')
                .setLabel('Баланс')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('profile_history')
                .setLabel('История')
                .setStyle(ButtonStyle.Secondary)
        );
    } else if (page === 1) {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId('profile_main')
                .setLabel('Основная')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('profile_apsp')
                .setLabel('AP/SP')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(true),
            new ButtonBuilder()
                .setCustomId('profile_styles')
                .setLabel('Стили')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('profile_balance')
                .setLabel('Баланс')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('profile_history')
                .setLabel('История')
                .setStyle(ButtonStyle.Secondary)
        );
    } else if (page === 2) {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId('profile_main')
                .setLabel('Основная')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('profile_apsp')
                .setLabel('AP/SP')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('profile_styles')
                .setLabel('Стили')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(true),
            new ButtonBuilder()
                .setCustomId('profile_balance')
                .setLabel('Баланс')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('profile_history')
                .setLabel('История')
                .setStyle(ButtonStyle.Secondary)
        );
    } else if (page === 3) {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId('profile_main')
                .setLabel('Основная')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('profile_apsp')
                .setLabel('AP/SP')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('profile_styles')
                .setLabel('Стили')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('profile_balance')
                .setLabel('Баланс')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(true),
            new ButtonBuilder()
                .setCustomId('profile_history')
                .setLabel('История')
                .setStyle(ButtonStyle.Secondary)
        );
    } else {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId('profile_main')
                .setLabel('Основная')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('profile_apsp')
                .setLabel('AP/SP')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('profile_styles')
                .setLabel('Стили')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('profile_balance')
                .setLabel('Баланс')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('profile_history')
                .setLabel('История')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(true)
        );
    }
    
    return row;
}

export function createProfileHistoryPage(player, user, history = []) {
    const historyText = history.length > 0
        ? history.map((entry) => {
            const deltaSign = entry.delta >= 0 ? '+' : '';
            const timestamp = Math.floor(new Date(entry.changed_at).getTime() / 1000);
            return `• ${entry.type.toUpperCase()} ${deltaSign}${entry.delta} • <t:${timestamp}:R>`;
        }).join('\n')
        : 'Изменений пока нет';

    return new EmbedBuilder()
        .setColor(0xB209D4)
        .setTitle(`🕓 История изменений — ${player.character_name || player.username}`)
        .setThumbnail(player.character_avatar || user.displayAvatarURL({ dynamic: true }))
        .setDescription(historyText)
        .setImage(BANNERS.profileHistory)
        .setFooter({ text: `ID: ${player.id} • Страница 4/4` })
        .setTimestamp();
}

export function createStyleNavigationButtons(currentPage, totalPages) {
    const row = new ActionRowBuilder();
    
    row.addComponents(
        new ButtonBuilder()
            .setCustomId('styles_prev')
            .setLabel('◀')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currentPage === 0),
        new ButtonBuilder()
            .setCustomId('styles_next')
            .setLabel('▶')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currentPage >= totalPages - 1)
    );
    
    return row;
}
