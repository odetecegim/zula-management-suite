/**
 * Uye deposu mantik testleri (Google'a baglanmadan calisir).
 * Calistirma: node server/members-store.test.mjs
 */
import assert from 'node:assert/strict';
import {
  hashPassword,
  verifyPassword,
  normalizeUsername,
  rowToMember,
  memberToRow,
  MEMBER_COLUMNS,
} from './members-store.js';

let passed = 0;
const test = (name, fn) => {
  try {
    fn();
    passed++;
    console.log('  OK   ' + name);
  } catch (e) {
    console.log('  FAIL ' + name + ' -> ' + e.message);
    process.exitCode = 1;
  }
};

console.log('\n== Sifre ==');
test('hash + dogru sifre dogrulanir', () => {
  const h = hashPassword('zorba123');
  assert.ok(h.startsWith('scrypt$'));
  assert.equal(verifyPassword('zorba123', h), true);
});
test('hash + yanlis sifre reddedilir', () => {
  const h = hashPassword('zorba123');
  assert.equal(verifyPassword('zorba124', h), false);
  assert.equal(verifyPassword('', h), false);
});
test('ayni sifre farkli hash uretir (tuz)', () => {
  assert.notEqual(hashPassword('abc'), hashPassword('abc'));
});
test('eski duz metin kayit geriye donuk calisir', () => {
  assert.equal(verifyPassword('legacy123', 'legacy123'), true);
  assert.equal(verifyPassword('wrong', 'legacy123'), false);
});
test('bos/bozuk hash guvenli sekilde false', () => {
  assert.equal(verifyPassword('x', ''), false);
  assert.equal(verifyPassword('x', 'scrypt$'), false);
  assert.equal(verifyPassword('x', null), false);
});
test('ozet icinde duz sifre sizmaz', () => {
  const h = hashPassword('zorba123');
  assert.ok(!h.includes('zorba123'));
});

console.log('\n== Kullanici adi ==');
test('normalize bosluk ve buyuk harf tolere eder', () => {
  assert.equal(normalizeUsername('  Zorba '), 'zorba');
  assert.equal(normalizeUsername('ZULA-004'), 'zula-004');
});

console.log('\n== Satir donusumu ==');
const member = {
  id: 'm-7', tagId: 'ZULA-007', fullName: 'Ali İhsan Zorba',
  gameNickname: 'ZorBa<61>', discordTag: 'zorba', email: 'ali@example.com',
  game: 'Zula PC', region: 'TR', role: 'academy_lead', status: 'Aktif',
  joinDate: '2025-09-01', participationScore: 100, bugReportsCount: 0,
  notes: 'not: var, ama | pipe', username: 'zorba', passwordHash: 'scrypt$a$b',
  permissions: ['dashboard', 'members'],
};

test('sutun sayisi 17 (A..Q)', () => {
  assert.equal(MEMBER_COLUMNS.length, 17);
});
test('uye -> satir -> uye gidis-donus', () => {
  const row = memberToRow(member);
  assert.equal(row.length, MEMBER_COLUMNS.length);
  const back = rowToMember(row);
  assert.equal(back.fullName, member.fullName);
  assert.equal(back.username, member.username);
  assert.equal(back.participationScore, 100);
  assert.deepEqual(back.permissions, ['dashboard', 'members']);
  assert.equal(back.passwordHash, undefined, 'sifre alani disari verilmemeli');
});
test('izin listesi bos ise dizi olur', () => {
  const row = memberToRow({ ...member, permissions: [] });
  assert.deepEqual(rowToMember(row).permissions, []);
});
test('sayisal alanlar metinden sayiya cevrilir', () => {
  const row = memberToRow({ ...member, participationScore: '85', bugReportsCount: '7' });
  const back = rowToMember(row);
  assert.equal(back.participationScore, 85);
  assert.equal(back.bugReportsCount, 7);
});
test('sifre alani satirda korunur (sunucu icin)', () => {
  const row = memberToRow(member);
  assert.equal(row[MEMBER_COLUMNS.indexOf('passwordHash')], 'scrypt$a$b');
});
test('eksik sutunlar undefined olmaz', () => {
  const back = rowToMember(new Array(MEMBER_COLUMNS.length).fill(''));
  assert.equal(back.fullName, '');
  assert.deepEqual(back.permissions, []);
  assert.equal(back.participationScore, 0);
});

console.log('\n' + passed + ' test gecti.\n');
