import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export function createSuccessEmbed(title, description) {
    return new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle(`✅ ${title}`)
        .setDescription(description)
        .setTimestamp();
}

export function createErrorEmbed(title, description) {
    return new EmbedBuilder()
        .setColor(0x0099FF)
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

export function createLeaderboardEmbed(title, description, sortBy) {
    const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle(title)
        .setDescription(description)
        .setTimestamp();
    
    if (sortBy === 'ap') {
        embed.setImage('https://s.iimg.su/s/22/uUNAXW5xTskOqP8qqHauAb5eSud6yn7mpUFh91Qj.jpg');
    } else if (sortBy === 'sp') {
        embed.setImage('https://s.iimg.su/s/22/uLyAz19xZcYEibwhCNcyjlRjHJhicEGazYqGob5B.jpg');
    } else if (sortBy === 'krw') {
        embed.setImage('https://s.iimg.su/s/22/uAHetLrx0gHhdpdgNEk0sz5rXNryIiakpM4NOC2i.jpg');
    } else if (sortBy === 'yen') {
        embed.setImage('https://s.iimg.su/s/22/umoD00txjt1iM7PD84VYYbh5EMcNXMFHU09ztUYR.jpg');
    }
    
    return embed;
}

export function createTrainEmbed(title, description) {
    return new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle(`✅ ${title}`)
        .setDescription(description)
        .setImage('https://s.iimg.su/s/22/ufkWBu0xWZJ35E1dhmIFfmTwEoXZtvP8zOPqXpsI.jpg')
        .setTimestamp();
}

export function createSocialRPEmbed(title, description) {
    return new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle(`✅ ${title}`)
        .setDescription(description)
        .setImage('https://s.iimg.su/s/22/u8s3xB1xoVgeQgI8hXTRd6MZ88M8XiFCWKQfVaAj.jpg')
        .setTimestamp();
}

export function createPayEmbed(title, description) {
    return new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle(`✅ ${title}`)
        .setDescription(description)
        .setImage('https://s.iimg.su/s/22/uFdH3S7x2AJgL3HbTz3lECdHIvTFBrlq6A1a6f0n.jpg')
        .setTimestamp();
}

export function createInventoryEmbed(title, description) {
    return new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle(title)
        .setDescription(description)
        .setImage('https://s.iimg.su/s/22/umRJkWkxFm1Vz7bFaeY7yfOl5Vwj7cuvVJ7OS5Sz.jpg')
        .setTimestamp();
}

export function createRegisterEmbed(title, description) {
    return new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle(`✅ ${title}`)
        .setDescription(description)
        .setImage('https://s.iimg.su/s/22/uPwMsKAxzFj3zv2fzk1VVgPLssmMEosDzMeKuRk4.jpg')
        .setTimestamp();
}

export function createProfileMainPage(player, user) {
    const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle(`📋 Профиль — ${player.character_name || player.username}`)
        .setThumbnail(player.character_avatar || user.displayAvatarURL({ dynamic: true }))
        .setImage('https://s.iimg.su/s/22/gqWynCdxyhjnJyLDeFjmUbuQHLhpUklQ3Eih04WP.jpg')
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
        .setColor(0x0099FF)
        .setTitle(`📊 Прогресс — ${player.character_name || player.username}`)
        .setThumbnail(player.character_avatar || user.displayAvatarURL({ dynamic: true }))
        .setImage('https://s.iimg.su/s/22/uClf58LxwwC7ZyuLlAWkzTJ3TD4tsoH4fjoKN653.jpg')
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
        .setColor(0x0099FF)
        .setTitle(`💰 Баланс — ${player.character_name || player.username}`)
        .setThumbnail(player.character_avatar || user.displayAvatarURL({ dynamic: true }))
        .setImage('https://s.iimg.su/s/22/uLqXmUuxOHQ7fpQo0nDeYZzNFsHDabcjaeMIG1cz.jpg')
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
        .setColor(0x0099FF)
        .setTitle(`🥋 Боевые стили — ${player.character_name || player.username}`)
        .setThumbnail(player.character_avatar || user.displayAvatarURL({ dynamic: true }))
        .setImage('https://s.iimg.su/s/22/ufK5WxvxJvic3v3sAKeMNidyrlIjH9veHktCaMW1.jpg')
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
