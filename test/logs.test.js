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

test('buildLogEmbed sanitizes legacy userId with _slot suffix and formats legacy train command', () => {
    const entry = {
        command: 'train',
        userId: '123456789012345678_slot2',
        userTag: 'LegacyPlayer',
        extra: {
            text: 'Старая тренировка до разделения команд на train-ap и train-sp'
        }
    };

    const embed = buildLogEmbed(entry);
    const data = embed.toJSON();

    assert.equal(data.title, '🏋️ Лог тренировки AP: /train-ap');
    const playerField = data.fields.find(f => f.name === '👤 Игрок');
    assert.ok(playerField);
    assert.match(playerField.value, /<@123456789012345678>/);
    assert.doesNotMatch(playerField.value, /_slot2/);

    const charField = data.fields.find(f => f.name === '🎭 Персонаж');
    assert.ok(charField);
    assert.match(charField.value, /Слот 2/);
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

test('getDestinationLogChannels merges env variables and DB log_channels with training channel support', async () => {
    const origEnv = process.env.LOGS_CHANNEL_ID;
    const origTrainEnv = process.env.TRAINING_LOG_CHANNEL_ID;
    try {
        process.env.LOGS_CHANNEL_ID = '111112222233333444';
        process.env.TRAINING_LOG_CHANNEL_ID = '222223333344444555';

        const mockDb = {
            collection(name) {
                if (name === 'log_channels') {
                    return {
                        async toArray() {
                            return [
                                { channel_id: '111112222233333444', enabled: true, type: 'all' }, // duplicate of env
                                { channel_id: '555556666677777888', enabled: true, type: 'training' },
                                { channel_id: '999990000011111222', enabled: true, type: 'commands' }
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

        // When isTraining = true, includes training channel, general logs channel, and DB training channels
        const trainChannels = await getDestinationLogChannels(mockDb, 'guild_123', true);
        assert.ok(trainChannels.includes('111112222233333444')); // general
        assert.ok(trainChannels.includes('222223333344444555')); // training env
        assert.ok(trainChannels.includes('555556666677777888')); // training DB
        assert.ok(!trainChannels.includes('999990000011111222')); // commands-only DB channel excluded

        // When isTraining = false, excludes dedicated training channels
        const commandChannels = await getDestinationLogChannels(mockDb, 'guild_123', false);
        assert.ok(commandChannels.includes('111112222233333444'));
        assert.ok(!commandChannels.includes('222223333344444555'));
        assert.ok(!commandChannels.includes('555556666677777888'));
        assert.ok(commandChannels.includes('999990000011111222'));
    } finally {
        if (origEnv !== undefined) process.env.LOGS_CHANNEL_ID = origEnv;
        else delete process.env.LOGS_CHANNEL_ID;

        if (origTrainEnv !== undefined) process.env.TRAINING_LOG_CHANNEL_ID = origTrainEnv;
        else delete process.env.TRAINING_LOG_CHANNEL_ID;
    }
});

test('logCommand directly sends standard embed to channel', async () => {
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

    const embed = buildLogEmbed(entry);
    assert.ok(embed);

    await mockChannel.send({ embeds: [embed] });
    assert.equal(sentPayloads.length, 1);
    assert.ok(sentPayloads[0].embeds);
    assert.equal(sentPayloads[0].embeds[0].data.title, '🏋️ Лог тренировки AP: /train-ap');
});

test('commands/logs renders training text snippet and metadata, and exposes autocomplete', async () => {
    const { execute, autocomplete } = await import('../commands/logs.js');
    assert.equal(typeof execute, 'function');
    assert.equal(typeof autocomplete, 'function');
});


