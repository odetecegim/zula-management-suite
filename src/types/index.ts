export type RoleId =
  | 'super_admin'
  | 'company_manager'
  | 'academy_lead'
  | 'academy_member'
  | 'fedai_member'
  | 'referee_lead'
  | 'referee'
  | 'observer'
  | 'qa_tester'
  | 'community_mod';

export interface RoleDef {
  id: RoleId;
  name: string;
  badgeColor: string;
  description: string;
  // Bu roldeki üyelerin panele girişinde kullanılacak varsayılan bölüm izinleri
  permissions: PermissionId[];
}

export type GameType = 'Zula PC' | 'Zula Strike' | 'Wolfteam';
export type RegionType = 'TR' | 'EU' | 'LATAM' | 'MENA';
export type StatusType = 'Aktif' | 'Pasif' | 'İncelemede';

export type PermissionId = 'dashboard' | 'members' | 'tests' | 'reports' | 'roles' | 'academy' | 'referees' | 'performance' | 'logs' | 'settings' | 'sheets';

export interface PermissionDef {
  id: PermissionId;
  label: string;
  description: string;
}

export interface Member {
  id: string;
  tagId: string; // örn: ZULA-001
  fullName: string;
  gameNickname: string;
  discordTag: string;
  email: string;
  game: GameType;
  region: RegionType;
  role: RoleId;
  status: StatusType;
  joinDate: string;
  participationScore: number; // 0 - 100
  bugReportsCount: number;
  notes: string;
  // Panel girişi ve erişim yetkileri
  username: string;
  password: string;
  permissions: PermissionId[];
}

export interface ActivityLog {
  id: string;
  memberId?: string;
  actor: string;
  action: string;
  category: 'User' | 'Performance' | 'Role' | 'System';
  timestamp: string;
}

export interface TestSession {
  id: string;
  title: string;
  version: string;
  game: GameType;
  date: string;
  status: 'Planlandı' | 'Devam Ediyor' | 'Tamamlandı';
  participantsCount: number;
  reportedBugs: number;
}

export interface RefDayEntry {
  day: number;
  count: number;
}

// Katilim/seri kaydi: gun + carpan (x1 / x2)
export interface PerfEntry {
  id: string;
  day: number;
  multiplier: number;
}

// Hakemlik kaydi: gun + mac adedi + tur (Herkes / Sabotaj)
export interface RefPerfEntry extends PerfEntry {
  type: 'EVERYONE' | 'SABOTAGE';
}

export interface Performance {
  memberId: string;
  period: string; // YYYY-MM
  testParticipation: number; // 0-30
  testDays: number[]; // 1-31 test katilim gunleri
  bugReports: number;
  suggestions: number;
  refereeMatches: number; // hakemlik sayisi (toplam)
  refereeDays: RefDayEntry[]; // gun -> mac adedi
  qaReviews: number; // QA incelemesi
  discordActions: number; // timeout/ban/silme toplam adedi
  notes: string;

  // --- Alt kategori detaylari (opsiyonel; agirlikli puan modeli) ---
  participationEntries?: PerfEntry[]; // gun + carpan serisi
  participationDetails?: string; // "05x2, 12x1" ozeti
  refereeEveryoneX?: number; // Herkes turnuvasi hakemlik adedi
  refereeSabotage?: number; // Sabotaj turnuvasi hakemlik adedi
  refereeEntries?: RefPerfEntry[];
  discordTimeout?: number; // Discord uzaklastirma/timeout
  discordBan?: number; // Discord yasaklama
  discordMessageDelete?: number; // Discord mesaj silme
  managerScore?: number; // Yonetici puani (SINIRSIZ)
  managerOpinion?: number; // Yonetici gorusu puani (SINIRSIZ)
  supportPoints?: number; // Support puani (SINIRSIZ)
}

export type ScoreLineKind = 'base' | 'total' | 'score';

export interface ScoreLine {
  label: string;
  detail: string;
  points: number;
  /** 'base' = tablo baz degeri, 'total' = ara toplam, 'score' = puana katkisi */
  kind?: ScoreLineKind;
}
