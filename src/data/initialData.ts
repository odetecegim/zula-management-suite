import type { Member, RoleDef, ActivityLog, TestSession, Performance, PermissionDef, PermissionId } from '../types';
import { lastPeriods } from '../lib/time';

export const ALL_PERMISSIONS: PermissionDef[] = [
  { id: 'dashboard', label: 'Genel Bakış', description: 'Panel özeti, metrikler ve sistem hareketleri' },
  { id: 'members', label: 'Üye & Personel Listesi', description: 'Tüm üyeler: ekleme, düzenleme ve silme' },
  { id: 'performance', label: 'Performans Yönetimi', description: 'Aylık puan girişi, test günü ve hakemlik kaydı' },
  { id: 'reports', label: 'Performans Raporları', description: 'Puan sıralamaları ve Excel/CSV dışa aktarma' },
  { id: 'academy', label: 'Akademi Üyeleri', description: 'Akademi ve Fedai ekibi listesi' },
  { id: 'referees', label: 'Hakem Üyeleri', description: 'Hakem heyeti ve gözlemci listesi' },
  { id: 'roles', label: 'Rol & Yetkilendirme', description: 'Rol tanımları ve atanan üyeler' },
  { id: 'logs', label: 'Sistem Kayıtları', description: 'Tüm işlem geçmişi ve arama' },
  { id: 'tests', label: 'Test Oturumları', description: 'Test oturumu oluşturma ve durum yönetimi' },
  { id: 'settings', label: 'Ayarlar & Roller', description: 'Rol simülasyonu ve rol/izin yönetimi' },
  { id: 'sheets', label: 'Google Sheets', description: 'Tablodan veri çekme, Toplam/QA hesaplama ve panele aktarma' },
];

export const ALL_PERMISSION_IDS: PermissionId[] = ALL_PERMISSIONS.map((p) => p.id);

export const INITIAL_ROLES: RoleDef[] = [
  { id: 'super_admin', name: 'Süper Yönetici', badgeColor: 'bg-red-500/10 text-red-400 border-red-500/20', description: 'Tüm yetkilere sahip ana yönetici', permissions: ['dashboard', 'members', 'performance', 'reports', 'academy', 'referees', 'roles', 'logs', 'tests', 'settings', 'sheets'] },
  { id: 'company_manager', name: 'Şirket Yöneticisi', badgeColor: 'bg-purple-500/10 text-purple-400 border-purple-500/20', description: 'Operasyon ve ekip koordinatörü', permissions: ['dashboard', 'members', 'performance', 'reports', 'academy', 'referees', 'roles', 'logs', 'tests', 'settings', 'sheets'] },
  { id: 'company_staff', name: 'Şirket Çalışanı', badgeColor: 'bg-slate-500/10 text-slate-300 border-slate-500/20', description: 'Yönetim kadrosu; performans listelerinde yer almaz', permissions: ['dashboard', 'members', 'logs'] },
  { id: 'academy_member', name: 'Akademi Üyesi', badgeColor: 'bg-amber-500/10 text-amber-300 border-amber-500/20', description: 'Akademi test ekibi üyesi; kendi performansını girer', permissions: ['dashboard', 'academy', 'performance', 'reports'] },
  { id: 'fedai_member', name: 'Fedai Üyesi', badgeColor: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20', description: 'Fedai eğitim ekibi üyesi', permissions: ['dashboard', 'academy'] },
  { id: 'academy_lead', name: 'Akademi Kaptanı', badgeColor: 'bg-amber-500/10 text-amber-400 border-amber-500/20', description: 'Test ekipleri ve oyuncu akademisi lideri', permissions: ['dashboard', 'academy', 'performance', 'tests', 'reports'] },
  { id: 'referee', name: 'Hakem', badgeColor: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20', description: 'Maç hakemliği yapan üye', permissions: ['dashboard', 'referees', 'performance'] },
  { id: 'referee_lead', name: 'Baş Hakem', badgeColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', description: 'Turnuva ve espor hakem heyeti başkanı', permissions: ['dashboard', 'referees', 'performance', 'tests'] },
];

// Uye listesinde ORNEK/TOHUM KAYIT YOKTUR.
//
// Gecmis: ornek uyeler tohum olarak eklendiy ve butun veri sorunlarinin
// kaynagi oldu (kullanici sildiginde tarayici geri yaziyordu, ayni uye
// kodu iki kisiye birden atanabiliyordu). Artik tek kaynak Google Sheets'tir;
// bu dosyada yalnizca kurucu hesap tanimlidir.
export const FOUNDER_MEMBER_ID = 'm-1';
export const SEED_PERFORMANCE_MEMBER_ID = FOUNDER_MEMBER_ID;

export const INITIAL_MEMBERS: Member[] = [
  {
    id: FOUNDER_MEMBER_ID,
    tagId: 'ZULA-001',
    fullName: 'Hüseyin Çalışkan',
    gameNickname: 'Odetecegim',
    playerId: '758547576',
    discordTag: 'odetecegim#0001',
    email: 'huseyin@odetecegim.dev',
    game: 'Zula PC',
    region: 'TR',
    role: 'super_admin',
    status: 'Aktif',
    joinDate: '2025-01-10',
    participationScore: 0,
    bugReportsCount: 0,
    notes: 'Sistem Yöneticisi',
    username: 'huseyin',
    password: 'admin123',
    permissions: [
      'dashboard', 'members', 'performance', 'reports', 'academy',
      'referees', 'roles', 'logs', 'tests', 'settings', 'sheets',
    ],
  },
];

export const INITIAL_TEST_SESSIONS: TestSession[] = [
  {
    id: 'ts-1',
    title: 'V2.14 Safranbolu Gece Modu & Ses İyileştirmeleri',
    version: 'v2.14.0-rc3',
    game: 'Zula PC',
    date: '2026-03-25',
    status: 'Tamamlandı',
    participantsCount: 48,
    reportedBugs: 19,
  },
  {
    id: 'ts-2',
    title: 'Yeni Sezon Silah Dengelemeleri & Spray Kontrolü',
    version: 'v2.15.0-alpha',
    game: 'Zula PC',
    date: '2026-03-28',
    status: 'Devam Ediyor',
    participantsCount: 32,
    reportedBugs: 11,
  },
  {
    id: 'ts-3',
    title: 'Mobil Cihaz Optimizasyonu & 120 FPS Testi',
    version: 'v1.8.2',
    game: 'Zula PC',
    date: '2026-04-02',
    status: 'Planlandı',
    participantsCount: 65,
    reportedBugs: 0,
  },
];

export const INITIAL_PERFORMANCES: Performance[] = (() => {
  // Yasayan tohum: her zaman secicide gorunen mevcut ay + bir onceki ay
  const periods = lastPeriods(2);
  const cur = periods[0];
  const prev = periods[1];

  const rows: Performance[] = [
    {
      memberId: SEED_PERFORMANCE_MEMBER_ID,
      period: cur,
      testParticipation: 0,
      testDays: [],
      bugReports: 0,
      suggestions: 0,
      refereeMatches: 0,
      refereeDays: [],
      qaReviews: 0,
      discordActions: 0,
      managerScore: 0,
      notes: 'Kurucu hesap — ornek puan yoktur.',
      participationEntries: [],
      participationDetails: '',
      discordTimeout: 0,
      discordBan: 0,
      discordMessageDelete: 0,
      managerOpinion: 0,
      supportPoints: 0,
    },
    {
      memberId: SEED_PERFORMANCE_MEMBER_ID,
      period: prev,
      testParticipation: 0,
      testDays: [],
      bugReports: 0,
      suggestions: 0,
      refereeMatches: 0,
      refereeDays: [],
      qaReviews: 0,
      discordActions: 0,
      managerScore: 0,
      notes: '',
    },
  ];

  // Yalnizca kurucuya ait kayitlar tohum veri olarak tutulur.
  return rows.filter((r) => r.memberId === SEED_PERFORMANCE_MEMBER_ID);
})();

export const INITIAL_LOGS: ActivityLog[] = [
  {
    id: 'log-1',
    actor: 'Hüseyin Çalışkan (@odetecegim)',
    action: 'Zula Test Yönetim Platformu v2.0 sıfırdan konuşlandırıldı.',
    category: 'System',
    timestamp: '28.09.2026 01:00',
  },
  {
    id: 'log-2',
    actor: 'Hüseyin Çalışkan (@odetecegim)',
    action: 'V2.15.0 silah denge test oturumu başlatıldı.',
    category: 'Performance',
    timestamp: '28.09.2026 00:45',
  },
  {
    id: 'log-3',
    actor: 'Burak Serdar',
    action: 'ZULA-004 Lucas Silva için test puanı güncellendi: 86.',
    category: 'User',
    timestamp: '27.09.2026 19:20',
  },
];

// Uye listesi tek kaynagi Google Sheets'tir (build: member-list-rebuild-1)
