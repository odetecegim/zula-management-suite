import type { Member } from '../types';

/**
 * Dogal (dogal) karsilastirma: "ZULA-2" ile "ZULA-10" dogru siralanir.
 * Rakamlar iceren kisimlar sayisal, harfler alfabetik sayilir.
 *
 * Basit localeCompare "-2" ile "-10"'i dogru sıralayamadigi icin
 * once sayisal parcalar ayirilip ayri ayri karsilastirilir.
 */
export function naturalCompare(a: string, b: string): number {
  const ax = (a || '').trim().toLowerCase().match(/(\d+|\D+)/g) ?? [];
  const bx = (b || '').trim().toLowerCase().match(/(\d+|\D+)/g) ?? [];

  for (let i = 0; i < Math.max(ax.length, bx.length); i++) {
    const x = ax[i];
    const y = bx[i];
    if (x === undefined) return -1; // daha kisa olan one gelir
    if (y === undefined) return 1;
    const nx = /^\d/.test(x);
    const ny = /^\d/.test(y);
    if (nx && ny) {
      const d = Number(x) - Number(y);
      if (d !== 0) return d;
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
}

/**
 * Oyuncu siralamasi - oncelik sirasiyla:
 *   1) Uye kodu   (ZULA-001 ...)
 *   2) Kullanici adi
 *   3) Isim soyisim
 *   4) Puanlama
 *
 * Onceki alanlar esit oldugunda siradaki alana gecilir; boylece
 * "ZULA-002" ile "ZULA-010" dogru sirada gosterilir.
 *
 * `getScore` verilirse 4. alan o puan kullanilir (or. performans
 * tablosunda donemin yonetici puani). Verilmezse uyenin genel
 * katilim puani kullanilir.
 */
export function sortMembers<T extends Member>(list: T[], getScore?: (m: T) => number): T[] {
  const scoreOf = (m: T) => (getScore ? getScore(m) : m.participationScore) ?? 0;

  return [...list].sort((a, b) => {
    const byTag = naturalCompare(a.tagId || '', b.tagId || '');
    if (byTag !== 0) return byTag;

    const byUser = naturalCompare(a.username || '', b.username || '');
    if (byUser !== 0) return byUser;

    const byName = naturalCompare(a.fullName || '', b.fullName || '');
    if (byName !== 0) return byName;

    // Puanlama: yuksek puan one
    return scoreOf(b) - scoreOf(a);
  });
}
