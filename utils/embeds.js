import { EmbedBuilder } from 'discord.js';

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

export function createProfileEmbed(player, styles, inventory, user) {
    const embed = new EmbedBuilder()
        .setColor(0x9B59B6)
        .setTitle(`📋 Profile — ${player.username}`)
        .setThumbnail(user.displayAvatarURL({ dynamic: true }))
        .setTimestamp();
    
    const apInfo = `**AP:** ${player.ap}\n**Techniques Unlocked:** ${Math.floor(player.ap / 100)}`;
    if (player.unlocked_avatar) {
        embed.addFields({ name: '⚡ Ability Points', value: apInfo + '\n**🌟 Avatar/Embodiment UNLOCKED**', inline: false });
    } else {
        embed.addFields({ name: '⚡ Ability Points', value: apInfo, inline: false });
    }
    
    if (styles && styles.length > 0) {
        const styleText = styles.slice(0, 5).map(s => {
            const rank = s.sp >= 2500 ? 'Master' : s.sp >= 1000 ? 'Expert' : s.sp >= 350 ? 'Owner' : 'Novice';
            return `**${s.name}:** ${s.sp} SP (${rank})`;
        }).join('\n') || 'No styles trained yet';
        embed.addFields({ name: '🥋 Martial Arts Styles', value: styleText, inline: false });
    }
    
    if (inventory && inventory.length > 0) {
        const invText = inventory.slice(0, 5).map(item => `**${item.name}** x${item.qty}`).join('\n');
        embed.addFields({ name: '🎒 Inventory', value: invText, inline: false });
    }
    
    embed.addFields({ name: '💰 Balance', value: `${player.balance} coins`, inline: true });
    
    const lastAPDate = player.last_train_timestamp > 0 ? new Date(player.last_train_timestamp * 1000).toLocaleString() : 'Never';
    embed.setFooter({ text: `ID: ${player.id} • Last Training: ${lastAPDate}` });
    
    return embed;
}
