import type { Performance, ScoreLine } from '../types';

export function currentPeriod(): string {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

const MONTHS_TR = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

export function periodLabel(period: string): string {
  const parts = period.split('-');
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  if (!y || !m || m < 1 || m > 12) return period;
  return MONTHS_TR[m - 1] + ' ' + y;
}

// Son N ay (mevcut ay dahil, azalan sira)
export function lastPeriods(count: number): string[] {
  const out: string[] = [];
  const d = new Date();
  d.setDate(1);
  for (let i = 0; i < count; i++) {
    out.push(
      d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
    );
    d.setMonth(d.getMonth() - 1);
  }
  return out;
}

export function daysInPeriod(period: string): number {
  const parts = period.split('-');
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  if (!y || !m) return 30;
  return new Date(y, m, 0).getDate();
}

// Puanlanabilir alanlar (alt kategori detaylari opsiyoneldir)
export type Scorable = Pick<Performance, 'testParticipation' | 'bugReports' | 'suggestions' | 'qaReviews' | 'notes' | 'memberId' | 'period' | 'testDays' | 'refereeDays'> & {
  refereeMatches: number;
  discordActions: number;
  refereeEveryoneX?: number;
  refereeSabotage?: number;
  discordTimeout?: number;
  discordBan?: number;
  discordMessageDelete?: number;
  managerScore?: number;
  managerOpinion?: number;
  supportPoints?: number;
};

// QA tablosu: Toplam = Test Katilimi + Hata Bildirimi + Oneri Bildirimi
export const QA_BASE_MULTIPLIER = 1000;

export function qaBaseTotal(p: Pick<Scorable, 'testParticipation' | 'bugReports' | 'suggestions'>): number {
  return (
    Number(p.testParticipation || 0) + Number(p.bugReports || 0) + Number(p.suggestions || 0)
  );
}

// Puan formulu:
//   Toplam = Test Katilimi + Hata + Oneri
//   QA     = Toplam x 1000
//   + Support, Hakem, Discord, Yonetici Puani/Gorusu (hepsi SINIRSIZ)
export function scoreBreakdown(p: Scorable): ScoreLine[] {
  const testDays = Number(p.testParticipation || 0);
  const bugs = Number(p.bugReports || 0);
  const suggestions = Number(p.suggestions || 0);
  const base = testDays + bugs + suggestions;

  const everyoneX = Number(p.refereeEveryoneX || 0);
  const sabotage = Number(p.refereeSabotage || 0);
  const granularRef = everyoneX > 0 || sabotage > 0;
  const refereePoints = granularRef
    ? everyoneX * 2000 + sabotage * 5000
    : Number(p.refereeMatches || 0) * 750;

  const timeout = Number(p.discordTimeout || 0);
  const ban = Number(p.discordBan || 0);
  const msgDelete = Number(p.discordMessageDelete || 0);
  const granularDiscord = timeout > 0 || ban > 0 || msgDelete > 0;
  const discordPoints = granularDiscord
    ? timeout * 25 + ban * 25 + msgDelete * 10
    : Number(p.discordActions || 0) * 10;

  return [
    { label: 'Test Katılımı', detail: testDays + ' gün', points: testDays, kind: 'base' },
    { label: 'Hata Bildirimi', detail: bugs + ' adet', points: bugs, kind: 'base' },
    { label: 'Öneri Bildirimi', detail: suggestions + ' adet', points: suggestions, kind: 'base' },
    {
      label: 'Toplam',
      detail: 'Katılım + Hata + Öneri',
      points: base,
      kind: 'total',
    },
    {
      label: 'QA Puanı',
      detail: base + ' × ' + QA_BASE_MULTIPLIER,
      points: base * QA_BASE_MULTIPLIER,
      kind: 'score',
    },
    { label: 'Support', detail: 'Sınırsız', points: Number(p.supportPoints || 0), kind: 'score' },
    {
      label: 'Hakem Performansı',
      detail: granularRef
        ? 'Herkes ' + everyoneX + ' × 2000 · Sabotaj ' + sabotage + ' × 5000'
        : (p.refereeMatches || 0) + ' maç × 750',
      points: refereePoints,
      kind: 'score',
    },
    {
      label: 'Discord İşlemleri',
      detail: granularDiscord
        ? 'Timeout ' + timeout + ' × 25 · Ban ' + ban + ' × 25 · Silme ' + msgDelete + ' × 10'
        : (p.discordActions || 0) + ' işlem × 10',
      points: discordPoints,
      kind: 'score',
    },
    { label: 'QA İncelemesi', detail: (p.qaReviews || 0) + ' adet', points: 0, kind: 'score' },
    { label: 'Yönetici Puanı', detail: 'Sınırsız', points: Number(p.managerScore || 0), kind: 'score' },
    { label: 'Yönetici Görüşü', detail: 'Sınırsız', points: Number(p.managerOpinion || 0), kind: 'score' },
  ];
}

// Genel puan: yalnizca 'score' turundeki kalemler toplanir
// (bileşenler ve ara toplamlar cift sayilmaz)
export function calculateScore(p: Scorable): number {
  return scoreBreakdown(p)
    .filter((line) => (line.kind ?? 'score') === 'score')
    .reduce((sum, line) => sum + line.points, 0);
}
