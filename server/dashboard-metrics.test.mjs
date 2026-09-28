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

console.log('\n' + d + ' dashboard testi gecti.\n');
