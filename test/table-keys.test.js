import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build, dap, findAll, lineOf, reject, stillDom, textsOf } from './support.js';

const tables = (key = 'pk (tenant_id, id)', reference = 'fk (tenant_id, user_id) -> users (tenant_id, id)') => dap(`
  table users "users" {
    tenant_id bigint
    id bigint
    email text
    ${key}
  }
  table orders "orders" {
    tenant_id bigint required
    user_id bigint required
    ${reference}
  }
`);

test('a foreign key must reference a whole unique key, including inline composite primary keys', async () => {
  const source = dap(`table users "users" {\n tenant_id bigint pk\n id bigint pk\n}\ntable orders "orders" {\n user_id bigint fk=users.id\n}\n`);
  assert.ok((await reject(source)).some(p => p.line === lineOf(source, 'user_id bigint') && /whole.*key/.test(p.message)));
});

test('single and composite declarations use one key model, one edge per foreign key, and common labels', async () => {
  for (const key of ['pk (tenant_id, id)', 'unique (tenant_id, id)']) {
    const source = `${tables(key, 'fk (tenant_id, user_id) -> users (tenant_id, id) from="0..*" to="1"')}scene "lookup"\n  orders -> users "row"\n`;
    const dom = await stillDom(source);
    assert.equal(findAll(dom, n => n.tag === 'path' && /^p-\d+$/.test(n.attrs.id ?? '')).length, 1);
    const text = textsOf(dom).join(' ');
    for (const label of ['FK1', '0..*', '1']) assert.ok(text.includes(label), text);
    assert.ok(findAll(dom, n => n.attrs['aria-label']?.includes('tenant_id, user_id')).length);
  }
  await build(tables('pk (id)', 'fk (user_id) -> users (id)'));
  await build(tables('pk (tenant_id,id)', 'fk (user_id,tenant_id) -> users (id,tenant_id)'));
});

test('composite key errors identify the declaration before layout', async () => {
  for (const [key, reference, needle, message] of [
    ['pk (tenant_id, id)', 'fk (user_id) -> users (id)', 'fk (', /whole.*key/],
    ['pk (tenant_id, id)', 'fk (tenant_id, user_id) -> users (id)', 'fk (', /same number/],
    ['pk (missing)', 'fk (user_id) -> users (id)', 'pk (', /unknown column/],
    ['pk (id, id)', 'fk (user_id) -> users (id)', 'pk (', /written twice/],
    ['pk (id)\n    pk (tenant_id)', 'fk (user_id) -> users (id)', 'pk (tenant', /one primary key/],
    ['unique (tenant_id, id)\n    unique (id, tenant_id)', 'fk (user_id) -> users (id)', 'unique (id', /already/],
    ['pk (tenant_id, id)', 'fk (tenant_id, user_id) -> users (tenant_id, id) ondelete=set-null', 'fk (', /requires nullable/],
    ['pk (tenant_id, id)', 'fk (tenant_id, user_id) -> users (tenant_id, id)\n    fk (user_id, tenant_id) -> users (id, tenant_id)', 'fk (user_id', /already/],
    ['pk (tenant_id, id)', 'fk (missing, user_id) -> users (tenant_id, id)', 'fk (', /unknown column/],
  ]) {
    const source = tables(key, reference);
    const problems = await reject(source);
    assert.ok(problems.some(p => p.line === lineOf(source, needle) && message.test(p.message)), JSON.stringify(problems));
  }
  const nullable = tables().replace('id bigint\n', 'id bigint nullable\n');
  assert.ok((await reject(nullable)).some(p => p.line === lineOf(nullable, 'tenant_id bigint nullable') && /primary key cannot be nullable/.test(p.message)));
  const inline = dap('table users "users" {\n tenant_id bigint pk\n id bigint pk nullable\n}\n');
  assert.ok((await reject(inline)).some(p => p.line === lineOf(inline, 'id bigint pk nullable') && /primary key cannot be nullable/.test(p.message)));
});

test('malformed key lists and foreign key options are located source errors', async () => {
  for (const key of ['pk ()', 'pk (id,)', 'pk (id id)', 'pk (id', 'pk (id) required']) {
    const source = tables(key);
    assert.ok((await reject(source)).some(p => p.line === lineOf(source, key)), key);
  }
  for (const reference of ['fk (user_id) -> users', 'fk (user_id) users (id)', 'fk (user_id) -> users (id) unknown=value', 'fk (user_id) -> users (id) from="many"']) {
    const source = tables('pk (id)', reference);
    assert.ok((await reject(source)).some(p => p.line === lineOf(source, reference)), reference);
  }
});

test('overlapping composite references remain separate and column pairs select the correct relation', async () => {
  const source = dap(`
    table users "users" {
      tenant_id bigint pk
      id bigint pk
    }
    table orders "orders" {
      tenant_id bigint
      created_by bigint
      updated_by bigint
      fk (tenant_id, created_by) -> users (tenant_id, id)
      fk (tenant_id, updated_by) -> users (tenant_id, id)
    }
    scene "creator"
      orders.created_by -> users.id "creator"
    scene "editor"
      orders.updated_by -> users.id "editor"
  `);
  const dom = await stillDom(source);
  assert.equal(findAll(dom, n => n.tag === 'path' && /^p-\d+$/.test(n.attrs.id ?? '')).length, 2);
  await reject(source.replace('orders.created_by -> users.id', 'orders.created_by -> users.tenant_id'));
  await reject(source.replace('orders.created_by -> users.id', 'orders -> users'));
});
