import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export function createSuccessEmbed(title, description) {
    return new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle(`✅ ${title}`)
        .setDescription(description)
        .setTimestamp();
}

export function createErrorEmbed(title, description) {
    return new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle(`❌ ${title}`)
        .setDescription(description)
        .setTimestamp();
}

export function createInfoEmbed(title, description) {
    return new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle(title)
        .setDescription(description)
        .setTimestamp();
}

export function createProfileMainPage(player, user) {
    const embed = new EmbedBuilder()
        .setColor(0x9B59B6)
        .setTitle(`📋 Профиль — ${player.character_name || player.username}`)
        .setThumbnail(player.character_avatar || user.displayAvatarURL({ dynamic: true }))
        .setTimestamp();
    
    embed.addFields({ name: '⚡ Очки способностей (AP)', value: `${player.ap} AP`, inline: true });
    embed.addFields({ name: '🎯 Техники', value: `${Math.floor(player.ap / 100)}`, inline: true });
    
    if (player.unlocked_avatar) {
        embed.addFields({ name: '🌟 Статус', value: 'Avatar/Embodiment разблокирован', inline: false });
    }
    
    if (player.krw > 0 || player.yen > 0) {
        let currencyText = '';
        if (player.krw > 0) currencyText += `💵 **${player.krw.toLocaleString('ru-RU')}** KRW\n`;
        if (player.yen > 0) currencyText += `💴 **${player.yen.toLocaleString('ru-RU')}** ¥`;
        embed.addFields({ name: '💰 Валюта', value: currencyText || 'Нет валюты', inline: false });
    }
    
    embed.setFooter({ text: `ID: ${player.id} • Страница 1/3` });
    
    return embed;
}

export function createProfileAPSPPage(player, user, totalSP = 0) {
    const embed = new EmbedBuilder()
        .setColor(0x9B59B6)
        .setTitle(`📊 Прогресс — ${player.character_name || player.username}`)
        .setThumbnail(player.character_avatar || user.displayAvatarURL({ dynamic: true }))
        .setTimestamp();
    
    const nextMilestone = Math.ceil(player.ap / 100) * 100;
    const previousMilestone = Math.floor(player.ap / 100) * 100;
    const progressInRange = player.ap - previousMilestone;
    
    const apBar = createProgressBar(progressInRange, 100, 20);
    embed.addFields({ 
        name: '⚡ Прогресс к следующей технике', 
        value: `${apBar}\n**${player.ap}** AP (следующая: ${nextMilestone} AP)`,
        inline: false 
    });
    
    embed.addFields({ name: '🥋 Всего SP', value: `${totalSP} SP`, inline: true });
    embed.addFields({ name: '🎯 Техник разблокировано', value: `${Math.floor(player.ap / 100)}`, inline: true });
    
    embed.setFooter({ text: `ID: ${player.id} • Страница 2/3` });
    
    return embed;
}

export function createProfileBalancePage(player, user) {
    const embed = new EmbedBuilder()
        .setColor(0x9B59B6)
        .setTitle(`💰 Баланс — ${player.character_name || player.username}`)
        .setThumbnail(player.character_avatar || user.displayAvatarURL({ dynamic: true }))
        .setTimestamp();
    
    let balanceText = '';
    if (player.krw > 0) {
        balanceText += `💵 **${player.krw.toLocaleString('ru-RU')}** KRW\n`;
    } else {
        balanceText += `💵 **0** KRW\n`;
    }
    
    if (player.yen > 0) {
        balanceText += `💴 **${player.yen.toLocaleString('ru-RU')}** ¥`;
    } else {
        balanceText += `💴 **0** ¥`;
    }
    
    embed.addFields({ name: '📊 Валюты', value: balanceText, inline: false });
    embed.setFooter({ text: `ID: ${player.id} • Страница 4/4` });
    
    return embed;
}

export function createProfileStylesPage(player, styles, user, page = 0) {
    const embed = new EmbedBuilder()
        .setColor(0x9B59B6)
        .setTitle(`🥋 Боевые стили — ${player.character_name || player.username}`)
        .setThumbnail(player.character_avatar || user.displayAvatarURL({ dynamic: true }))
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

function createSPProgressBar(sp, nextThreshold) {
    if (sp >= 2500) {
        return '█████████████████████ 100% (МАСТЕР)';
    }
    
    const thresholds = [
        { min: 0, max: 350, name: 'Owner' },
        { min: 350, max: 1000, name: 'Expert' },
        { min: 1000, max: 2500, name: 'Master' }
    ];
    
    const current = thresholds.find(t => sp >= t.min && sp < t.max);
    if (!current) return createProgressBar(sp, 2500, 20);
    
    const progress = sp - current.min;
    const total = current.max - current.min;
    
    return createProgressBar(progress, total, 20);
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
                .setStyle(ButtonStyle.Primary)
                .setDisabled(true)
        );
    }
    
    return row;
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
