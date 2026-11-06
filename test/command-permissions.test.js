import assert from 'node:assert/strict';
import test from 'node:test';
import { Collection, PermissionFlagsBits, PermissionsBitField } from 'discord.js';
import { isAdmin, hasCommandPermission } from '../utils/adminCheck.js';

const restricted = `accept add-ap add-currency add-reputation add-sp add-style announce
  deduct-currency deduct-reputation delete-style delete-user give-item give-style grant-slot
  log-disable log-enable logs physical-edit physical-register remove-item remove-player-style
  purge-offtop render-ui send-json set-ap-multiplier set-ap set-currency set-rank set-reputation
  set-salary-multiplier set-sp-multiplier set-sp shop-admin shop-order train-block train-channel-block`.split(/\s+/);

test('служебные команды не требуют прав Discord и отказывают обычным игрокам до выполнения действий', async () => {
  const member = { id: 'regular-permissions-test', guild: { ownerId: 'owner' },
    permissions: new PermissionsBitField(), roles: [] };
  for (const name of restricted) {
    const command = await import(`../commands/${name}.js`);
    const schema = command.data.toJSON();
    // Explicit null clears the old Administrator/ManageMessages restriction on redeploy.
    assert.equal(schema.default_member_permissions, null, name);
    assert.equal(schema.dm_permission, false, name);
    let reply;
    await command.execute({
      user: { id: member.id }, member,
      guild: { members: { fetch: async () => member } },
      options: new Proxy({}, { get: () => assert.fail(`${name} читает параметры до проверки прав`) }),
      reply: async payload => { reply = payload; return {}; },
    });
    assert.ok(reply, `${name} должен отказать в доступе`);
  }
});

test('назначенные роли без прав Discord проходят проверки в обработчиках команд', async () => {
  const cases = [
    ['1438987035862892544', ['send-json', 'render-ui', 'delete-user', 'shop-admin']],
    ['1438987072026185808', ['add-ap', 'set-ap', 'set-sp-multiplier']],
    ['1438987088975626251', ['accept', 'set-rank', 'grant-slot']],
    ['1431759459528610013', ['accept', 'give-style', 'add-currency', 'physical-register', 'physical-edit']],
    ['1431759694179074162', ['add-ap', 'add-sp', 'add-reputation', 'train-block']],
  ];
  for (const [roleId, names] of cases) {
    for (const name of names) {
      const command = await import(`../commands/${name}.js`);
      const id = `role-handler-${roleId}-${name}`;
      const member = { id, roles: { cache: new Collection([[roleId, { id: roleId }]]) },
        permissions: new PermissionsBitField() };
      const stop = new Error('Reached command options after authorization');
      let authorized = false;
      try {
        await command.execute({
          user: { id }, member,
          guild: { members: { fetch: async () => member } },
          options: new Proxy({}, { get() { authorized = true; throw stop; } }),
          reply: async () => ({}),
        });
      } catch (error) {
        assert.equal(error, stop, `${name}: unexpected error`);
      }
      assert.equal(authorized, true, `${roleId} must pass the ${name} handler's role check`);
    }
  }
});

test('роль администратора распознаётся в сыром участнике Discord без member.id и прав Administrator', () => {
  const member = { user: { id: 'raw-admin-member' }, roles: ['1438987035862892544'], permissions: '0' };
  assert.equal(isAdmin(member), true);
  assert.equal(hasCommandPermission(member, 'delete-user'), true);
});

test('пустой или неполный объект участника не считается владельцем сервера', () => {
  for (const member of [null, undefined, {}, { guild: {} }, { roles: [] }, { permissions: { has: () => true } }]) {
    assert.equal(isAdmin(member), false);
    assert.equal(hasCommandPermission(member, 'send-json'), false);
  }
  assert.equal(isAdmin({ id: 'owner', guild: { ownerId: 'owner' } }), true);
  assert.equal(isAdmin({ id: 'admin', permissions: new PermissionsBitField(PermissionFlagsBits.Administrator) }), true);
});

test('ADMIN_USER_IDS работает и с неполным Discord-участником', t => {
  const old = process.env.ADMIN_USER_IDS;
  process.env.ADMIN_USER_IDS = 'admin-alias-test';
  t.after(() => {
    if (old === undefined) delete process.env.ADMIN_USER_IDS;
    else process.env.ADMIN_USER_IDS = old;
  });
  assert.equal(isAdmin({ user: { id: 'admin-alias-test' }, roles: [] }), true);
  assert.equal(isAdmin({ user: { id: 'regular-permissions-test' }, roles: [] }), false);
});

test('ГМ не может выполнять send-json и render-ui', async t => {
  const old = process.env.GM_ROLE_IDS;
  process.env.GM_ROLE_IDS = 'gm-permissions-test';
  t.after(() => {
    if (old === undefined) delete process.env.GM_ROLE_IDS;
    else process.env.GM_ROLE_IDS = old;
  });
  const member = { id: 'gm-permissions-test-user', roles: ['gm-permissions-test'], permissions: new PermissionsBitField() };
  assert.equal(hasCommandPermission(member, 'add-ap'), true);
  for (const name of ['send-json', 'render-ui']) {
    assert.equal(hasCommandPermission(member, name), false);
    const command = await import(`../commands/${name}.js`);
    let reply;
    await command.execute({ member, user: { id: member.id }, reply: async payload => { reply = payload; } });
    assert.match(JSON.stringify(reply), /администратор/);
  }
});

test('vupper содержит только создание, изменение и удаление своих профилей', async () => {
  const { data } = await import('../commands/vupper.js');
  const schema = data.toJSON();
  assert.deepEqual(schema.options.map(o => o.name), ['action', 'profile']);
  assert.deepEqual(schema.options[0].choices.map(c => c.value), ['create', 'edit', 'delete']);
  assert.equal(schema.default_member_permissions, undefined);
});
