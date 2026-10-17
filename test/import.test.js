// torso import: Mermaid, DBML, D2 원본을 Torso 원본으로 옮긴다. 공개 진입점(importDiagram, 명령)으로 형식별 대표 예, 경고의 줄 번호, 왕복(옮긴 원본의 strict 빌드), 결과 파일 쓰기를 본다.
// 시험 이름 첫 낱말(IM1~IM11)이 요구사항 번호이고, 번호와 계약의 대응은 docs/design/import.md 요구사항 표에 있다.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { FigureError, importDiagram } from 'torso-diagram';
import { build, cli, lineOf, read, snapshot, workspace } from './support.js';

/** 옮긴 결과와 경고. 옮긴 원본은 늘 strict로 만들어진다(왕복). */
async function roundTrip(format, text) {
  const { source, warnings } = importDiagram(format, text);
  await build(source);
  return { source, warnings, lines: source.split('\n').map((line) => line.trim()) };
}

/** code와 줄로 고른 경고의 메시지들 */
const warningsAt = (warnings, line) => warnings.filter((w) => w.line === line).map((w) => `${w.code}: ${w.message}`);

const FLOW = `---
title: Order flow
---
flowchart LR
  %% a comment is not a statement
  client[Client] -->|HTTPS| gw(API Gateway)
  gw --> auth{Signed in?}
  auth -- yes --> db[(Orders DB)]
  auth -. no .-> reject((Reject))
  gw ==> worker[[Worker]]
  subgraph backend [Backend]
    direction TB
    subgraph data [Data]
      db
    end
    worker --> cache[Cache]
  end
  classDef hot fill:#f00
  gw --> backend
  gw --> auth
`;

test('IM1 a Mermaid flowchart keeps node shapes, edge labels, dashed edges, and nested subgraphs as one Torso grammar each', async () => {
  const { source, warnings, lines } = await roundTrip('mermaid', FLOW);
  assert.equal(lines[1], 'title "Order flow"');
  for (const line of ['box client "Client"', 'box gw "API Gateway"', 'decision auth "Signed in?"', 'store db "Orders DB"', 'box reject "Reject" shape=circle', 'box worker "Worker"']) assert.ok(lines.includes(line), line);
  for (const line of ['client -> gw "HTTPS"', 'auth -> db "yes"', 'auth -> reject "no" dashed', 'gw -> worker', 'worker -> cache', 'gw -> backend']) assert.ok(lines.includes(line), line);
  assert.match(source, /group backend "Backend" direction=down \{\n {2}group data "Data" direction=down \{\n {4}store db "Orders DB"\n {2}\}\n {2}box worker "Worker"/, 'subgraphs nest, and the inner one inherits the outer direction');
  assert.ok(!lines.includes('view graph down'), 'LR is the default right graph');
  assert.deepEqual(warningsAt(warnings, lineOf(FLOW, 'gw ==> worker')), [
    'import-change: the node shape of "worker" is drawn as a box',
    'import-change: the thick edge gw -> worker is drawn as a normal edge. Torso has one edge weight',
  ]);
  assert.match(warningsAt(warnings, lineOf(FLOW, 'classDef'))[0], /^import-skip: style classes \("classDef"\) are not imported/);
  assert.match(warningsAt(warnings, lineOf(FLOW, 'gw --> backend') + 1)[0], /^import-change: this edge repeats an edge on line 7 and is merged into it/);
});

const SEQUENCE = `sequenceDiagram
  title Checkout
  actor user as Customer
  participant web as Web
  participant api as API
  participant db@{ "type": "database" }
  user->>web: Pay
  web->>+api: POST /pay
  Note right of api: check the card
  api->>db: INSERT payment
  alt approved
    db-->>api: id
    api-->>web: 200
  else declined
    api-->>web: 402
  end
  loop until done
    web->>api: GET /status
  end
  opt receipt
    api->>user: email
  end
  par notify
    api->>db: log
  and push
    api->>web: event
  end
  api-->>-web: done
  autonumber
`;

test('IM2 a Mermaid sequence keeps participants, solid and dashed messages, notes, activation, and alt, loop, opt, par blocks', async () => {
  const { source, warnings, lines } = await roundTrip('mermaid', SEQUENCE);
  assert.ok(lines.includes('person user "Customer"') && lines.includes('store db "db"'));
  assert.match(source, /view sequence \{\n {2}user web api db\n\}\n\nscene "Checkout"/);
  assert.match(source, / {2}web -> api "POST \/pay"\n {2}note api "check the card"\n {2}activate api\n/, 'the note comes right after its message, then the activation');
  assert.match(source, /fragment alt "approved" choose="approved" \{\n {4}branch "approved" \{\n {6}db -> api "id" dashed\n/);
  assert.ok(lines.includes('fragment loop "until done" times=1 {') && lines.includes('fragment opt "receipt" run=on {') && lines.includes('fragment par "notify" {'));
  assert.ok(lines.includes('branch "push" {'));
  assert.match(source, /api -> web "done" dashed\n {2}deactivate api\n/);
  assert.deepEqual(warningsAt(warnings, lineOf(SEQUENCE, 'autonumber')), ['import-skip: autonumber is not imported. Torso numbers edges with no=, not messages']);
});

test('IM2 participants are listed in the order they first send, which Torso requires, and the change is reported', async () => {
  const text = 'sequenceDiagram\n  participant db\n  participant app\n  app->>db: query\n  db-->>app: rows\n';
  const { source, warnings } = await roundTrip('mermaid', text);
  assert.match(source, /view sequence \{\n {2}app db\n\}/);
  assert.deepEqual(warningsAt(warnings, 1), ['import-change: participants are listed in the order they first send: app, db']);
});

const STATE = `stateDiagram-v2
  [*] --> Idle
  Idle --> Running : start
  Running --> Idle : stop
  Running --> Failed : error
  Failed --> Idle
  state Check <<choice>>
  Failed --> Check
  Check --> Idle : retry
  state Active {
    [*] --> Warm
    Warm --> Hot : load
  }
  Idle --> Active : warm up
  Running --> [*]
  note right of Idle : waiting
`;

test('IM3 a Mermaid state diagram keeps start and final states, events, composite states as groups, and choices as decisions', async () => {
  const { source, warnings, lines } = await roundTrip('mermaid', STATE);
  for (const line of ['state idle "Idle"', 'decision check "Check"', 'start idle', 'final running', 'idle -> running "start"', 'failed -> check', 'warm -> hot "load"', 'view graph down']) assert.ok(lines.includes(line), line);
  assert.match(source, /group active "Active" direction=down \{\n {2}state warm "Warm"\n {2}state hot "Hot"\n\}/);
  assert.ok(lines.includes('failed -> idle "…"'), 'a transition without an event gets the empty mark');
  assert.deepEqual(warningsAt(warnings, lineOf(STATE, 'Failed --> Idle')), ['import-change: a transition needs an event label, so "…" is written. Write the event in place of it']);
  assert.ok(lines.includes('idle -> warm "warm up"'));
  assert.deepEqual(warningsAt(warnings, lineOf(STATE, 'Idle --> Active')), ['import-change: the transition into "Active" goes to its start state "Warm"']);
  assert.deepEqual(warningsAt(warnings, lineOf(STATE, 'note right')), ['import-skip: the note is not imported. A Torso state has no notes']);
});

const ER = `erDiagram
  CUSTOMER ||--o{ ORDER : places
  ORDER ||--|{ LINE-ITEM : contains
  CUSTOMER }|..|{ ADDRESS : uses
  CUSTOMER {
    string id PK
    string email UK "login name"
  }
  ORDER {
    int id PK
    string customer_id FK
  }
  LINE-ITEM {
    string sku
    int qty
  }
`;

test('IM4 a Mermaid ER diagram becomes tables with keys and relations with both cardinalities; an entity without attributes is a box', async () => {
  const { source, warnings, lines } = await roundTrip('mermaid', ER);
  assert.match(source, /table customer "CUSTOMER" \{\n {2}id string pk\n {2}email string unique\n\}/);
  assert.ok(lines.includes('table line_item "LINE-ITEM" {'));
  assert.ok(lines.includes('customer -> order "places" from="1" to="0..*"'));
  assert.ok(lines.includes('order -> line_item "contains" from="1" to="1..*"'));
  assert.ok(lines.includes('box address "ADDRESS"') && lines.includes('customer -> address "uses" dashed head=none'));
  assert.deepEqual(warningsAt(warnings, lineOf(ER, 'ADDRESS : uses')), [
    'import-change: the entity "ADDRESS" has no attributes, so it is drawn as a box. A table needs a column',
    'import-change: the cardinality 1..* to 1..* is not drawn. Only an edge between two tables or two classes shows cardinality',
  ]);
  assert.deepEqual(warningsAt(warnings, lineOf(ER, 'login name')), ['import-skip: the comment on "email" is not imported. A column has no comment']);
  assert.match(warningsAt(warnings, lineOf(ER, 'customer_id FK'))[0], /^import-skip: the FK mark on "customer_id" is not imported/);
});

test('IM5 a Mermaid pie becomes a pie chart card; a slice that is not above 0 is reported and left out', async () => {
  const text = 'pie showData title Storage by service\n  "Images" : 42\n  "Logs" : 31.5\n  "Empty" : 0\n';
  const { source, warnings } = await roundTrip('mermaid', text);
  assert.equal(source, 'torso\n\nchart storage-by-service "Storage by service" pie {\n  row "Images" value=42\n  row "Logs" value=31.5\n}\n');
  assert.deepEqual(warningsAt(warnings, 4), ['import-skip: the slice value "0" is not imported. A pie slice is a number above 0']);
});

const CLASSES = `classDiagram
  class Animal {
    <<abstract>>
    +String name
    -int age$
    +makeSound()* void
  }
  class Repository~T~ {
    <<interface>>
    +find(id) T
    +findAll() List~T~
  }
  Animal <|-- Duck
  Repository <|.. SqlRepository
  Zoo "1" *-- "many" Animal : houses
  Keeper o-- Zoo
  Keeper --> Animal : feeds
  SqlRepository ..> Animal
  Duck : +quack() void
  Duck : +quack(times) void
  class Color {
    <<enumeration>>
    RED
    GREEN
  }
  Duck -- Color
  note for Duck "rubber"
  <<service>> Keeper
`;

test('IM11 a Mermaid class diagram keeps classes, interfaces, members, generics, the six relation kinds, and cardinality as the class grammar', async () => {
  const { source, warnings, lines } = await roundTrip('mermaid', CLASSES);
  assert.match(source, /^class animal "Animal" abstract \{\n {2}field name "String" visibility=public\n {2}field age "int" visibility=private static\n {2}method makeSound "\(\): void" visibility=public abstract\n\}$/m);
  assert.match(source, /^interface repository "Repository<T>" \{\n {2}method find "\(id\): T" visibility=public\n {2}method findAll "\(\): List<T>" visibility=public\n\}$/m);
  assert.match(source, /^class duck "Duck" \{\n {2}method quack "\(\): void" visibility=public\n {2}method quack_2 "\(times\): void" visibility=public\n\}$/m);
  assert.ok(lines.includes('class keeper "Keeper" {'), 'a class without members is an empty class block');
  assert.match(source, /^box color "Color" "enum" \{\n {2}text "RED" mono\n {2}text "GREEN" mono\n\}$/m, 'an enumeration is the same enum card as DBML');
  for (const line of [
    'duck -> animal relation=inheritance',
    'sql-repository -> repository relation=realization',
    'zoo -> animal "houses" relation=composition from="1" to="*"',
    'keeper -> zoo relation=aggregation',
    'keeper -> animal "feeds"',
    'sql-repository -> animal relation=dependency',
    'duck -> color head=none',
  ]) assert.ok(lines.includes(line), line);
  assert.ok(lines.includes('view graph down'), 'a class diagram flows down like Mermaid');
  assert.deepEqual(warningsAt(warnings, lineOf(CLASSES, '"many"')), ['import-change: the cardinality "1" to "many" is written as "1" to "*"']);
  assert.deepEqual(warningsAt(warnings, lineOf(CLASSES, 'quack(times)')), ['import-change: member "quack" is written as "quack_2". A member name uses letters, digits, and "_", starting with a letter, once per class']);
  assert.deepEqual(warningsAt(warnings, lineOf(CLASSES, 'note for')), ['import-skip: the note is not imported. A Torso class has no notes']);
  assert.deepEqual(warningsAt(warnings, lineOf(CLASSES, '<<service>>')), ['import-change: the annotation "<<service>>" of "Keeper" is not drawn. Torso marks interface and abstract only']);
});

test('IM6 an unsupported Mermaid diagram is an import error on its line; an unknown statement is a warning on its line, never dropped silently', async () => {
  for (const [text, line] of [['%% notes\ngantt\n  title A\n', 2], ['', 1]]) {
    assert.throws(() => importDiagram('mermaid', text), (error) => {
      assert.ok(error instanceof FigureError);
      assert.equal(error.problems[0].code, 'import');
      assert.equal(error.problems[0].line, line);
      return true;
    });
  }
  const { warnings } = await roundTrip('mermaid', 'flowchart TD\n  a --> b\n  ??? what\n  click a callback\n');
  assert.deepEqual(warnings.map((w) => [w.line, w.code]), [[3, 'import-skip'], [4, 'import-skip']]);
  assert.throws(() => importDiagram('plantuml', ''), TypeError);
});

const DBML = `Project shop {
  database_type: 'PostgreSQL'
}

Table users as U {
  id integer [pk, increment]
  email varchar(255) [unique, not null]
  status user_status [not null, default: 'active']
  bio text [null, note: 'free text']
  Note: 'All users'
}

Table orders {
  id integer [pk]
  user_id integer [not null, ref: > U.id]
  coupon_id integer [null]
  total "decimal(10, 2)"
}

Table coupons {
  id integer [pk]
  code varchar [unique]
}

Ref: coupons.id < orders.coupon_id [delete: set null, update: cascade]

Enum user_status {
  active
  banned [note: 'blocked']
}

TableGroup billing {
  orders
  coupons
}
`;

test('IM7 DBML tables, keys, null rules, inline and separate refs, enums, and table groups use the table grammar', async () => {
  const { source, warnings, lines } = await roundTrip('dbml', DBML);
  assert.equal(lines[1], 'title "shop"');
  assert.match(source, /group billing "billing" \{\n {2}table orders "orders" \{\n {4}id integer pk\n {4}user_id integer required fk=users\.id from="\*" to="1"\n {4}coupon_id integer nullable fk=coupons\.id ondelete=set-null from="\*" to="1"\n/);
  assert.ok(lines.includes('email "varchar(255)" unique required') && lines.includes('bio text nullable'));
  assert.match(source, /box user-status "user_status" "enum" \{\n {2}text "active" mono\n {2}text "banned" mono\n\}/);
  assert.ok(lines.includes('users.status -> user-status'));
  assert.deepEqual(warningsAt(warnings, lineOf(DBML, 'status user_status')), ['import-skip: the default of column "status" is not imported. A Torso column shows its name, type, keys, and null rule']);
  assert.deepEqual(warningsAt(warnings, lineOf(DBML, "Note: 'All users'")), ['import-skip: the note of table "users" is not imported. A table card has no note']);
  assert.deepEqual(warningsAt(warnings, lineOf(DBML, 'update: cascade')), ['import-skip: the reference setting "update: cascade" is not imported']);
});

const DBML_KEYS = `Table orders {
  id integer [pk]
}

Table order_items {
  order_id integer [ref: > orders.id]
  line integer
  indexes {
    (order_id, line) [pk]
  }
}

Table shipments {
  order_id integer
  line integer
  carrier varchar
}

Table tags {
  id integer [pk]
}

Ref: shipments.(order_id, line) - order_items.(order_id, line) [delete: cascade]
Ref { orders.id <> tags.id }
`;

test('IM7 DBML composite keys, one-to-one and many-to-many refs keep the key grammar and both cardinalities', async () => {
  const { lines } = await roundTrip('dbml', DBML_KEYS);
  assert.ok(lines.includes('order_id integer fk=orders.id from="*" to="1"'));
  assert.ok(lines.includes('pk (order_id, line)'));
  assert.ok(lines.includes('fk (order_id, line) -> order_items (order_id, line) ondelete=cascade from="1" to="1"'));
  assert.ok(lines.includes('orders.id -> tags.id from="*" to="*"'));
});

test('IM7 a reference to a column that is not a whole key becomes a relation line, not a foreign key, and says so', async () => {
  const text = 'Table a {\n  id int [pk]\n  code varchar\n}\nTable b {\n  a_code varchar [ref: > a.code]\n}\n';
  const { lines, warnings } = await roundTrip('dbml', text);
  assert.ok(lines.includes('b.a_code -> a.code from="*" to="1"'));
  assert.ok(lines.includes('a_code varchar'));
  assert.match(warningsAt(warnings, 6)[0], /^import-change: the reference to a \(code\) is drawn as a relation, not a foreign key/);
});

const D2 = `# D2 sample
direction: right
user: Customer {shape: person}
cloud: AWS {
  lb: Load Balancer
  api: API
  db: Orders {shape: cylinder}
  jobs: {shape: queue}
  lb -> api: HTTP
  api -> db: SQL
  api -> jobs
  style.fill: "#eef"
}
user -> cloud.lb: HTTPS
cloud.jobs <- worker: poll
worker <-> cache: get/set
worker -- logs
ok: Ready? {shape: diamond}
cloud.api -> ok
users: {
  shape: sql_table
  id: int {constraint: primary_key}
  email: varchar(255) {constraint: unique}
}
orders: {
  shape: sql_table
  id: int {constraint: primary_key}
  user_id: int {constraint: foreign_key}
}
orders.user_id -> users.id
dot: Dot {shape: circle}
hex: Hex {shape: hexagon}
`;

test('IM8 D2 nodes, labels, the four edge forms, containers, shapes, direction, and sql_table map to one Torso grammar each', async () => {
  const { source, warnings, lines } = await roundTrip('d2', D2);
  assert.match(source, /group cloud "AWS" \{\n {2}box cloud-lb "Load Balancer"\n {2}box cloud-api "API"\n {2}store cloud-db "Orders"\n {2}queue cloud-jobs "jobs" slots=4\n\}/);
  for (const line of ['person user "Customer"', 'decision ok "Ready?"', 'box dot "Dot" shape=circle', 'box hex "Hex"']) assert.ok(lines.includes(line), line);
  for (const line of ['user -> cloud-lb "HTTPS"', 'worker -> cloud-jobs "poll"', 'worker -> cache "get/set" head=both', 'worker -> logs head=none']) assert.ok(lines.includes(line), line);
  assert.match(source, /table users "users" \{\n {2}id int pk\n {2}email "varchar\(255\)" unique\n\}/);
  assert.ok(lines.includes('user_id int fk=users.id'), 'a foreign_key column with an edge to a key is the same foreign key as a DBML ref');
  assert.ok(!lines.some((line) => line.startsWith('view graph')), 'direction: right is the default graph');
  assert.deepEqual(warningsAt(warnings, lineOf(D2, 'style.fill')), ['import-skip: the style "style.fill" is not imported. Colors and sizes come from the design tokens']);
  assert.deepEqual(warningsAt(warnings, lineOf(D2, 'shape: queue')), ['import-change: the queue "jobs" is drawn with 4 slots. A D2 queue has no slot count']);
  assert.deepEqual(warningsAt(warnings, lineOf(D2, 'shape: hexagon')), ['import-change: the shape "hexagon" of "Hex" is drawn as a box']);
});

test('IM8 D2 without a direction flows down like D2, nested keys a.b.c make nested groups, and an edge to its own container is reported', async () => {
  const text = 'a.b.c -> a.b.d\na -> a.b.c\nx: {\n  y -> _.z\n}\n';
  const { source, warnings, lines } = await roundTrip('d2', text);
  assert.match(source, /group a "a" direction=down \{\n {2}group a-b "b" direction=down \{\n {4}box a-b-c "c"\n {4}box a-b-d "d"\n {2}\}\n\}/);
  assert.ok(lines.includes('x-y -> z') && lines.includes('view graph down'));
  assert.deepEqual(warningsAt(warnings, 2), ['import-skip: the edge "a" -> "a.b.c" is not imported. A group does not connect to a card inside it']);
});

test('IM9 import prints the source, takes the format from the extension when it is not named, reports warnings on the source line, and --out writes a file that renders with --strict', (t) => {
  const dir = workspace(t, { 'flow.mmd': FLOW, 'schema.dbml': DBML, 'arch.d2': D2, 'model.mermaid': CLASSES });
  for (const [format, file] of [['mermaid', 'flow.mmd'], ['dbml', 'schema.dbml'], ['d2', 'arch.d2'], ['mermaid', 'model.mermaid']]) {
    const expected = importDiagram(format, read(dir, file)).source;
    for (const args of [['import', format, file], ['import', file]]) {
      const run = cli(args, { cwd: dir });
      assert.equal(run.status, 0, run.stderr);
      assert.equal(run.stdout, expected, args.join(' '));
      assert.match(run.stderr, new RegExp(`^${file.replace('.', '\\.')}:\\d+: warning: `, 'm'));
    }
    const written = cli(['import', file, '--out', 'out/result.torso'], { cwd: dir });
    assert.equal(written.status, 0, written.stderr);
    assert.equal(written.stdout, `${join('out', 'result.torso')}\n`);
    assert.equal(read(dir, 'out/result.torso'), expected);
    const render = cli(['render', 'out/result.torso', '--strict', '--out', 'svg'], { cwd: dir });
    assert.equal(render.status, 0, render.stderr);
  }
});

test('IM9 standard input (-) needs the format, and --json gives the diagnostics and the source as JSON lines', (t) => {
  const dir = workspace(t, { 'a.mmd': 'flowchart LR\n  a --> b\n  style a fill:#f00\n' });
  const piped = cli(['import', 'd2', '-'], { cwd: dir, input: 'a -> b: go\n' });
  assert.equal(piped.status, 0);
  assert.equal(piped.stdout, 'torso\n\nbox a "a"\nbox b "b"\n\na -> b "go"\n\nview graph down\n');
  const json = cli(['import', 'a.mmd', '--json'], { cwd: dir });
  assert.equal(json.status, 0);
  const [diagnostic, result] = json.stdout.trim().split('\n').map((line) => JSON.parse(line));
  assert.deepEqual(diagnostic, { file: 'a.mmd', line: 3, message: 'the colors and sizes in the style of "a" are not imported. They come from the design tokens', severity: 'warning', code: 'import-skip', column: 3 });
  assert.deepEqual(result, { file: 'a.mmd', source: 'torso\n\nbox a "a"\nbox b "b"\n\na -> b\n' });
});

test('IM9 a source that cannot be imported is exit 1 on its line with nothing written, and wrong usage is exit 2', (t) => {
  const dir = workspace(t, { 'bad.mmd': 'gantt\n  title x\n', 'a.txt': 'a -> b\n' });
  const before = snapshot(dir);
  const bad = cli(['import', 'bad.mmd', '--out', 'bad.torso'], { cwd: dir });
  assert.equal(bad.status, 1);
  assert.equal(bad.stdout, '');
  assert.match(bad.stderr, /^bad\.mmd:1: the Mermaid diagram "gantt" is not imported/);
  assert.deepEqual(snapshot(dir), before);
  for (const [args, message] of [
    [['import'], 'usage:'],
    [['import', 'mermaid'], 'import needs a file'],
    [['import', 'plantuml', 'bad.mmd'], 'unknown import format "plantuml"'],
    [['import', 'a.txt'], 'cannot tell the format of "a.txt"'],
    [['import', '-'], 'cannot tell the format of standard input'],
    [['import', 'mermaid', 'bad.mmd', 'a.txt'], 'import takes one file, not 2'],
    [['import', 'bad.mmd', '--out', 'bad.svg'], '--out names a .torso file'],
    [['import', 'bad.mmd', '--html'], '--html'],
    [['import', 'bad.mmd', '--budget', 'events=9'], '--budget is not for import'],
  ]) {
    const run = cli(args, { cwd: dir });
    assert.equal(run.status, 2, args.join(' '));
    assert.ok(run.stderr.includes(message), `${args.join(' ')}: ${run.stderr}`);
    assert.match(run.stderr, /torso import \[mermaid\|dbml\|d2\]/);
  }
  assert.deepEqual(snapshot(dir), before);
});

test('IM10 an imported figure that Torso lays out with a figure check error is still written, with the check as a warning on the result line', (t) => {
  // 같은 열로 들어오는 다대다 관계선과 외래 키 선의 다중성 글이 겹친다. 원본은 맞고 배치를 손볼 곳이라 파일을 쓴다.
  const text = 'Table p {\n  id int [pk]\n}\nTable t {\n  id int [pk]\n}\nTable pt {\n  t_id int [ref: > t.id]\n}\nRef: p.id <> t.id\n';
  const dir = workspace(t, { 'x.dbml': text });
  const run = cli(['import', 'x.dbml', '--out', 'x.torso'], { cwd: dir });
  assert.equal(run.status, 0);
  assert.equal(run.stdout, 'x.torso\n');
  assert.match(run.stderr, /^x\.torso:\d+: warning: edge label "\*" overlaps edge label "1"/m);
  assert.ok(existsSync(join(dir, 'x.torso')));
  assert.equal(cli(['render', 'x.torso'], { cwd: dir }).status, 1, 'render still refuses the figure until the source is fixed');
});

test('IM12 dashed outlines and lines carry over as Torso dashes, and the D2 title convention becomes the figure title', () => {
  const d2 = importDiagram('d2', 'title: 흐름 {shape: text; near: top-center}\nzone: 영역 {style.stroke-dash: 3\n  a: A\n}\npartner: 제휴사 {style.stroke-dash: 3}\nzone.a -> partner: 요청 {style.stroke-dash: 3}\nzone.a -> c: 다시\n');
  assert.deepEqual(d2.warnings, []);
  assert.match(d2.source, /^title "흐름"$/m);
  assert.match(d2.source, /^group zone "영역" (?:direction=down )?dashed \{$/m);
  assert.match(d2.source, /^external partner "제휴사"$/m);
  assert.match(d2.source, /"요청" dashed$/m);
  assert.match(d2.source, /"다시"$/m);
  const mermaid = importDiagram('mermaid', 'flowchart LR\n  subgraph cloud[구역]\n    a[A]\n  end\n  b[B] --> a\n  style cloud stroke-dasharray: 5 5\n  style b stroke-dasharray: 3 3, fill:#f00\n');
  assert.match(mermaid.source, /^group cloud "구역" dashed \{$/m);
  assert.match(mermaid.source, /^external b "B"$/m);
  assert.deepEqual(mermaid.warnings.map((w) => w.line), [7]);
  const classes = importDiagram('mermaid', 'classDiagram\n  namespace 도메인 {\n    class A\n  }\n');
  assert.deepEqual(classes.warnings, []);
  assert.match(classes.source, /"도메인"/);
});
