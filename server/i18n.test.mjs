import assert from 'node:assert/strict';
import tr from '../src/i18n/tr.ts';
import en from '../src/i18n/en.ts';
import pt from '../src/i18n/pt.ts';
import es from '../src/i18n/es.ts';

const dicts = { tr, en, pt, es };
const names = Object.keys(dicts);

let d = 0, f = 0;
const t = (name, fn) => {
  try { fn(); d++; console.log('  OK   ' + name); }
  catch (e) { f++; console.log('  FAIL ' + name + ' -> ' + e.message); process.exitCode = 1; }
};

const base = Object.keys(tr);

console.log('\n== Butunluk (' + base.length + ' anahtar) ==');
t('her dil TR ile ayni anahtar sayisina sahip', () => {
  for (const n of names) {
    assert.equal(Object.keys(dicts[n]).length, base.length, n + ' sayisi uyusmuyor');
  }
});
t('her dilde TR olmayan anahtar yok', () => {
  for (const n of names) {
    const extra = Object.keys(dicts[n]).filter((k) => !(k in tr));
    assert.equal(extra.length, 0, n + ' fazla: ' + extra.slice(0, 5).join(', '));
  }
});
t('hicbir dilde eksik anahtar yok', () => {
  for (const n of names) {
    const missing = base.filter((k) => !(k in dicts[n]));
    assert.equal(missing.length, 0, n + ' eksik: ' + missing.slice(0, 5).join(', '));
  }
});
t('hicbir deger bos degil', () => {
  for (const n of names) {
    const bad = base.filter((k) => {
      const v = dicts[n][k];
      return typeof v !== 'string' || v.trim() === '';
    });
    assert.equal(bad.length, 0, n + ' bos: ' + bad.slice(0, 5).join(', '));
  }
});

console.log('\n== Ceviri gercekten yapilmis mi ==');
// Marka / ozel ad oldugu icin ayni kalmasi dogru olanlar
const sameOk = new Set([
  'languageSelection', 'navSheets', 'discordTag', 'perm_sheets', 'sheetsTabMembers',
  'role', // Rol -> Rol : teknik terim, iki dilde de ayni yazilir
]);
for (const n of names.filter((x) => x !== 'tr')) {
  t(n + ': Turkce ile birebir ayni olmayanlar', () => {
    const same = base.filter((k) => tr[k] === dicts[n][k] && !sameOk.has(k));
    assert.equal(same.length, 0, 'cevrilmemis: ' + same.slice(0, 5).join(', '));
  });
}

console.log('\n== Yazim sistemi ==');
t('PT kavramlari dogru (Portugezce imla)', () => {
  assert.equal(pt.tagId, 'Código do Membro');
  assert.equal(pt.password, 'Senha');
  assert.equal(pt.delete, 'Excluir');
});
t('ES aksanlari yerinde (Izenim disi kalmamis)', () => {
  // Ispanyolca'da tildesiz yazilmis kelimalar kalmamali
  // YALNIZCA tildi gereken ama tildesiz yazilmis hatali bicimler.
  // Cogul sekiller (registros, informes, sesiones) tildi ALMAZ ve burada yer almaz.
  const wrong = [
    'Gestao', 'Gestion del Desempeno', 'Vision General', 'Sesion iniciada',
    'Contrasena', 'Anadir', 'Codigo de Miembro', 'Puntuacion de Participacion',
    'Sesion', 'Configuracoes e Funcoes', 'Registros do Sistema',
  ];
  const bad = base.filter((k) => wrong.includes(es[k]));
  assert.equal(bad.length, 0, 'hatali yazilmis: ' + bad.map((k) => k + '=' + es[k]).join(', '));
});
t('ES kritik terimler', () => {
  assert.equal(es.tagId, 'Código de Miembro');
  assert.equal(es.playerId, 'ID de Jugador');
  assert.equal(es.password, 'Contraseña');
  assert.equal(es.navTests, 'Sesiones de Pruebas');
});
t('ES cogul kurali dogru (tildisiz)', () => {
  assert.ok(!es.navTests.includes('ónes'), 'cogul yanlis yazilmis');
});
t('ozel adlar butun dillerde ayni kalmis', () => {
  for (const n of names) {
    assert.equal(dicts[n].sheetsTabMembers, 'UyeListesi', n + ' Sheets sekme adi degisti');
    assert.equal(dicts[n].navSheets, 'Google Sheets', n);
  }
});

console.log('\n' + d + ' gecti, ' + f + ' kaldi.\n');

