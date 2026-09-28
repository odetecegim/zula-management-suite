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
 * Oyuncu Member ID karsilastirmasi.
 *
 * playerId oyundaki SAYISAL uye numarasidir (orn. 10248571), bu yuzden
 * metin karsilastirmasi yerine sayisal karsilastirma yapilir:
 *   10248571 -> 10248571
 *       999 ->       999   (999, 10248571'den KUCUKTIR)
 *
 * Bos (girilmemis) degerler her zaman sona gider; boylece listede
* "Oyuncu ID girmeden eklenmis" uyeler ustte birikmeyi bozmaz.
 */
export function playerIdCompare(a: string, b: string): number {
  const av = (a ?? '').trim();
  const bv = (b ?? '').trim();
  const aEmpty = av === '';
  const bEmpty = bv === '';

  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1; // bos olan sona
  if (bEmpty) return -1;

  const an = Number(av);
  const bn = Number(bv);

  if (!Number.isNaN(an) && !Number.isNaN(bn)) {
    if (an !== bn) return an - bn;
    return 0;
  }
  // Rakam olmayan degerler varsa metin karsilastirmasina dus
  return naturalCompare(av, bv);
}

/**
 * Oyuncu siralamasi - oncelik sirasiyla:
 *   1) Oyuncu Member ID  (playerId - oyundaki sayisal numara)
 *   2) Kullanici adi
 *   3) Isim soyisim
 *   4) Puanlama
 *
 * DIKKAT: ilk alan paneldeki "Uye Kodu" (ZULA-001) DEGILDIR;
 * oyundaki gercek uye numarasidir.
 *
 * `getScore` verilirse 4. alan o puan kullanilir (or. performans
 * tablosunda donemin yonetici puani). Verilmezse uyenin genel
 * katilim puani kullanilir.
 */
export function sortMembers<T extends Member>(list: T[], getScore?: (m: T) => number): T[] {
  const scoreOf = (m: T) => (getScore ? getScore(m) : m.participationScore) ?? 0;

  return [...list].sort((a, b) => {
    const byPlayerId = playerIdCompare(a.playerId ?? '', b.playerId ?? '');
    if (byPlayerId !== 0) return byPlayerId;

    const byUser = naturalCompare(a.username || '', b.username || '');
    if (byUser !== 0) return byUser;

    const byName = naturalCompare(a.fullName || '', b.fullName || '');
    if (byName !== 0) return byName;

    // Puanlama: yuksek puan one
    return scoreOf(b) - scoreOf(a);
  });
}
