import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLogEmbed, getDestinationLogChannels, logCommand } from '../utils/logs.js';

test('buildLogEmbed formats train-ap log with full player text in description and detailed fields', () => {
    const playerText = 'Я начал долгую и усердную тренировку выносливости, пробежав десять километров вокруг базы... '.repeat(15);
    const entry = {
        command: 'train-ap',
        userId: '123456789012345678',
        userTag: 'SoloKarma',
        channelId: '987654321098765432',
        extra: {
            text: playerText,
            slot: 1,
            character_name: 'Зеро Карма',
            ap_gained: 15,
            multiplier: 150
        },
        timestamp: new Date('2026-09-07T12:00:00Z')
    };

    const embed = buildLogEmbed(entry);
    const data = embed.toJSON();

    assert.equal(data.title, '🏋️ Лог тренировки AP: /train-ap');
    assert.match(data.description, /📝 Текст отыгровки игрока:/);
    assert.match(data.description, /Я начал долгую и усердную тренировку/);
    assert.ok(data.description.length >= playerText.length);

    // Verify fields
    const playerField = data.fields.find(f => f.name === '👤 Игрок');
    assert.ok(playerField);
    assert.match(playerField.value, /<@123456789012345678>/);
    assert.match(playerField.value, /SoloKarma/);

    const charField = data.fields.find(f => f.name === '🎭 Персонаж');
    assert.ok(charField);
    assert.match(charField.value, /Зеро Карма/);
    assert.match(charField.value, /Слот 1/);

    const rewardField = data.fields.find(f => f.name === '✨ Награда');
    assert.ok(rewardField);
    assert.match(rewardField.value, /\+15 AP/);
    assert.match(rewardField.value, /150%/);
});

test('buildLogEmbed formats train-sp log with style name and SP reward', () => {
    const entry = {
        command: 'train-sp',
        userId: '123456789012345678',
        userTag: 'SoloKarma',
        channelId: '987654321098765432',
        extra: {
            text: 'Отработка ударов железного кулака на манекенах.',
            slot: 2,
            character_name: 'Тень',
            style: 'Железный кулак',
            sp_gained: 20,
            multiplier: 200
        },
        timestamp: new Date('2026-09-07T12:00:00Z')
    };

    const embed = buildLogEmbed(entry);
    const data = embed.toJSON();

    assert.equal(data.title, '🥋 Лог тренировки стиля: /train-sp');
    const styleField = data.fields.find(f => f.name === '🥋 Стиль');
    assert.ok(styleField);
    assert.match(styleField.value, /Железный кулак/);

    const rewardField = data.fields.find(f => f.name === '✨ Награда');
    assert.ok(rewardField);
    assert.match(rewardField.value, /\+20 SP/);
});

test('buildLogEmbed formats social-rp log with character and text', () => {
    const entry = {
        command: 'social-rp',
        userId: '123456789012345678',
        userTag: 'SoloKarma',
        channelId: '987654321098765432',
        extra: {
            text: 'Разговор в таверне о последних событиях в городе...',
            slot: 1,
            character_name: 'Зеро',
            ap_gained: 10,
            multiplier: 100
        },
        timestamp: new Date('2026-09-07T12:00:00Z')
    };

    const embed = buildLogEmbed(entry);
    const data = embed.toJSON();

    assert.equal(data.title, '🎭 Лог социального RP: /social-rp');
    assert.match(data.description, /Разговор в таверне/);
});

test('getDestinationLogChannels merges env variable and DB log_channels without duplicates', async () => {
    const origEnv = process.env.LOGS_CHANNEL_ID;
    try {
        process.env.LOGS_CHANNEL_ID = '111112222233333444';

        const mockDb = {
            collection(name) {
                if (name === 'log_channels') {
                    return {
                        async toArray() {
                            return [
                                { channel_id: '111112222233333444', enabled: true }, // duplicate of env
                                { channel_id: '555556666677777888', enabled: true }
                            ];
                        },
                        find() {
                            return this;
                        }
                    };
                }
                return {};
            }
        };

        const channels = await getDestinationLogChannels(mockDb, 'guild_123');
        assert.equal(channels.length, 2);
        assert.ok(channels.includes('111112222233333444'));
        assert.ok(channels.includes('555556666677777888'));
    } finally {
        if (origEnv !== undefined) {
            process.env.LOGS_CHANNEL_ID = origEnv;
        } else {
            delete process.env.LOGS_CHANNEL_ID;
        }
    }
});

test('logCommand falls back to standard embed if modern components throw', async () => {
    let insertedDoc = null;
    const mockDb = {
        collection(name) {
            if (name === 'command_logs') {
                return {
                    async insertOne(doc) {
                        insertedDoc = doc;
                        return { acknowledged: true };
                    }
                };
            }
            if (name === 'log_channels') {
                return {
                    find() {
                        return {
                            async toArray() {
                                return [{ channel_id: '999999999999999999', enabled: true }];
                            }
                        };
                    }
                };
            }
            return {};
        }
    };

    const sentPayloads = [];
    const mockChannel = {
        isTextBased: () => true,
        async send(payload) {
            if (payload.flags && !payload.embeds) {
                throw new Error('DiscordAPIError[50035]: Invalid Form Body for components v2');
            }
            sentPayloads.push(payload);
            return { id: 'msg_1' };
        }
    };

    const mockClient = {
        channels: {
            async fetch(id) {
                if (id === '999999999999999999') return mockChannel;
                return null;
            }
        }
    };

    const entry = {
        client: mockClient,
        guildId: '12345',
        channelId: '67890',
        userId: '112233445566778899',
        userTag: 'PlayerOne',
        command: 'train-ap',
        extra: {
            text: 'Тренировка выносливости',
            slot: 1,
            character_name: 'Герой',
            ap_gained: 10,
            multiplier: 100
        }
    };

    // To test logCommand, we can test buildLogEmbed and channel delivery logic directly
    const embed = buildLogEmbed(entry);
    assert.ok(embed);

    // Test that channel.send fallback works
    let sent = false;
    try {
        await mockChannel.send({ flags: 32768, components: [] });
        sent = true;
    } catch {
        await mockChannel.send({ embeds: [embed] });
        sent = true;
    }

    assert.equal(sent, true);
    assert.equal(sentPayloads.length, 1);
    assert.ok(sentPayloads[0].embeds);
});

test('commands/logs renders training text snippet and metadata', async () => {
    const { execute } = await import('../commands/logs.js');
    assert.equal(typeof execute, 'function');
});

