import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// initialData.ts uzantisiz import icerdigi icin dogrudan yuklenemez
// (Node ESM ".ts" uzantisi ister). Bu yuzden kaynak metin okunur.
const here = dirname(fileURLToPath(import.meta.url));
const seedSrc = readFileSync(join(here, '..', 'src', 'data', 'initialData.ts'), 'utf8');

let d = 0;
const t = (name, fn) => {
  try { fn(); d++; console.log('  OK   ' + name); }
  catch (e) { console.log('  FAIL ' + name + ' -> ' + e.message); process.exitCode = 1; }
};

console.log('\n== Genel Bakis kartlari: veriden hesaplanmali ==');

// DashboardView'daki ozet metinlerin kullandigi mantigi taklit et
const cardText = (members, sessions) => {
  const totalBugs = members.reduce((a, m) => a + (m.bugReportsCount || 0), 0);
  const avg = members.length
    ? Math.round(members.reduce((a, m) => a + m.participationScore, 0) / members.length)
    : 0;
  const ongoing = sessions.filter((s) => s.status === 'Devam Ediyor').length;
  const completed = sessions.filter((s) => s.status === 'Tamamlandı').length;
  const planned = sessions.filter((s) => s.status === 'Planlandı').length;

  const sessionSummary =
    sessions.length === 0
      ? 'Henüz oturum yok'
      : [
          ongoing > 0 ? `${ongoing} devam ediyor` : '',
          completed > 0 ? `${completed} tamamlandı` : '',
          planned > 0 ? `${planned} planlandı` : '',
        ]
        .filter(Boolean)
        .join(' · ');

  const eff =
    avg >= 90 ? 'Yüksek verimlilik'
    : avg >= 70 ? 'İyi seviye'
    : avg >= 40 ? 'Gelişime açık'
    : 'Düşük';

  return { totalBugs, avg, sessionSummary, eff };
};

t('oturum yokken "devam ediyor" yazmaz', () => {
  const r = cardText([], []);
  assert.equal(r.sessionSummary, 'Henüz oturum yok');
});

t('kac oturum varsa o kadarini yazar (1 degil)', () => {
  const s = (status, i) => ({ id: 's' + i, status });
  const r = cardText([], [s('Devam Ediyor', 1), s('Devam Ediyor', 2), s('Tamamlandı', 3)]);
  assert.equal(r.sessionSummary, '2 devam ediyor · 1 tamamlandı');
  assert.ok(!r.sessionSummary.includes('1 oturum'));
});

t('tum oturumlar tamamlandiysa dogru yazar', () => {
  const s = (status, i) => ({ id: 's' + i, status });
  const r = cardText([], [s('Tamamlandı', 1), s('Tamamlandı', 2)]);
  assert.equal(r.sessionSummary, '2 tamamlandı');
});

t('bos listede ortalam 0 ve "Veri yok" seviyesi', () => {
  const r = cardText([], []);
  assert.equal(r.avg, 0);
  assert.equal(r.totalBugs, 0);
});

t('katilim seviyesi puana gore degisir (sabit "Yüksek" degil)', () => {
  const m = (s) => ({ participationScore: s, bugReportsCount: 0 });
  assert.equal(cardText([m(95)], []).eff, 'Yüksek verimlilik');
  assert.equal(cardText([m(75)], []).eff, 'İyi seviye');
  assert.equal(cardText([m(50)], []).eff, 'Gelişime açık');
  assert.equal(cardText([m(10)], []).eff, 'Düşük');
});

console.log('\n== Tohum veri: uydurma deger olmamali ==');
t('hicbir tohum uyesinde hata raporu sayaci sifirdan farkli degil', () => {
  const counts = [...seedSrc.matchAll(/bugReportsCount:\s*(\d+)/g)].map((m) => Number(m[1]));
  assert.ok(counts.length > 0, 'tohumda bugReportsCount bulunamadi');
  const nonzero = counts.filter((c) => c > 0);
  assert.equal(nonzero.length, 0, 'sifirdan farkli sayaclar: ' + nonzero.join(', '));
});
t('tohumda "42" gibi tek seferlik uydurma sayi yok', () => {
  assert.ok(!/bugReportsCount:\s*42\b/.test(seedSrc), '42 degeri hala tohumda');
});
t('tohum uyeleri 0-100 arasi gecerli puan tasiyor', () => {
  const scores = [...seedSrc.matchAll(/participationScore:\s*(\d+)/g)].map((m) => Number(m[1]));
  assert.ok(scores.length > 0, 'puan bulunamadi');
  for (const s of scores) {
    assert.ok(s >= 0 && s <= 100, 'gecersiz puan: ' + s);
  }
});

console.log('\n== Rapor tablosu: satir sirasi uye koduna, SIRA kolonu puana ==');

const buildRows = (list) => {
  const rows = list.map((member) => ({ member, score: member.__score }));
  const rankByMember = new Map();
  [...rows]
    .sort((a, b) => b.score - a.score)
    .forEach((r, i) => rankByMember.set(r.member.id, i + 1));
  rows.sort((a, b) => {
    const m = (a.member.tagId || '').localeCompare(b.member.tagId || '', 'tr', { numeric: true });
    if (m !== 0) return m;
    const u = (a.member.username || '').localeCompare(b.member.username || '', 'tr', { numeric: true });
    if (u !== 0) return u;
    const f = a.member.fullName.localeCompare(b.member.fullName, 'tr');
    if (f !== 0) return f;
    return b.score - a.score;
  });
  return { rows, rankByMember };
};

const mem = (id, tag, user, name, score) => ({
  id, tagId: tag, username: user, fullName: name, __score: score,
});

t('satirlar uye koduna gore siralanir (ZULA-001 once)', () => {
  const { rows } = buildRows([
    mem('c', 'ZULA-010', 'ccc', 'Cem', 50),
    mem('a', 'ZULA-001', 'aaa', 'Ali', 10),
    mem('b', 'ZULA-002', 'bbb', 'Bora', 90),
  ]);
  assert.deepEqual(rows.map((r) => r.member.tagId), ['ZULA-001', 'ZULA-002', 'ZULA-010']);
});

t('ZULA-2, ZULA-10 dan once gelir (sayisal)', () => {
  const { rows } = buildRows([mem('a', 'ZULA-10', 'x', 'X', 0), mem('b', 'ZULA-2', 'y', 'Y', 0)]);
  assert.deepEqual(rows.map((r) => r.member.tagId), ['ZULA-2', 'ZULA-10']);
});

t('SIRA kolonu puana gore hesaplanir (satir sirasi degil)', () => {
  const { rows, rankByMember } = buildRows([
    mem('a', 'ZULA-001', 'aaa', 'Ali', 10),
    mem('b', 'ZULA-002', 'bbb', 'Bora', 90),
  ]);
  // Satir ZULA-001 once, ama 10 puan oldugu icin 2. sirada
  assert.equal(rankByMember.get('a'), 2);
  assert.equal(rankByMember.get('b'), 1);
});

t('en yuksek puanli her zaman 1. sira', () => {
  const { rankByMember } = buildRows([
    mem('a', 'ZULA-003', 'c', 'C', 50),
    mem('b', 'ZULA-001', 'a', 'A', 99),
    mem('c', 'ZULA-002', 'b', 'B', 70),
  ]);
  assert.equal(rankByMember.get('b'), 1);
  assert.equal(rankByMember.get('c'), 2);
  assert.equal(rankByMember.get('a'), 3);
});

t('ayni uye kodu varsa kullanici adi, sonra isim belirleyici', () => {
  const { rows } = buildRows([
    mem('a', 'ZULA-001', 'zeta', 'Ali', 0),
    mem('b', 'ZULA-001', 'alpha', 'Veli', 0),
  ]);
  assert.deepEqual(rows.map((r) => r.member.username), ['alpha', 'zeta']);
});

t('puan esitse de her uye farkli sira alir', () => {
  const { rankByMember } = buildRows([
    mem('a', 'ZULA-001', 'a', 'A', 50),
    mem('b', 'ZULA-002', 'b', 'B', 50),
  ]);
  const ranks = [...rankByMember.values()].sort();
  assert.deepEqual(ranks, [1, 2]);
});

console.log('\n' + d + ' rapor testi gecti.\n');

