

export type RoleId =
  | 'super_admin'
  | 'company_manager'
  | 'company_staff'
  | 'academy_lead'
  | 'academy_member'
  | 'fedai_member'
  | 'referee_lead'
  | 'referee';

export interface RoleDef {
  id: RoleId;
  name: string;
  badgeColor: string;
  description: string;
  // Bu roldeki üyelerin panele girişinde kullanılacak varsayılan bölüm izinleri
  permissions: PermissionId[];
}

export type GameType = 'Zula PC' | 'Zula Strike' | 'Wolfteam';
export type RegionType = 'TR' | 'EU' | 'LATAM';
export type StatusType = 'Aktif' | 'Pasif' | 'İncelemede';

export type PermissionId = 'dashboard' | 'members' | 'tests' | 'reports' | 'roles' | 'academy' | 'referees' | 'performance' | 'logs' | 'settings' | 'sheets' | 'slack';

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
  /** Oyuncunun Zula icindeki sayisal uye ID'si (orn. "1234567") */
  playerId: string;
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
  /** Üye pasife alındığında girilen gerekçe */
  deactivationReason?: string;
  /** Durumun en son değiştiği tarih (ISO) */
  statusChangedAt?: string;
}

export interface ActivityLog {
  id: string;
  memberId?: string;
  /** Eski kayitlarla uyumluluk (Sinan paneli semasi) */
  userId?: string;
  actor: string;
  action: string;
  category: 'User' | 'Performance' | 'Role' | 'System';
  timestamp: string;
}

export type SeverityType = 'Düşük' | 'Orta' | 'Yüksek' | 'Kritik';
export type BugStatusType = 'Açık' | 'İnceleniyor' | 'Çözüldü';

/**
 * Test oturumuna bildirilen tek bir hata.
 *
 * Eski sema yalnizca SAYI tutuyordu (reportedBugs: 0); kimin ne
 * bildirdigi, onemin ve durumu saklanmiyordu. Detay ekrani icin
 * hatalarin kendisi artik kayitli.
 */
export interface SessionBug {
  id: string;
  /** Hata basligi / kisa aciklamasi */
  title: string;
  /** Bildiren uye (Member.id); eger liste disindaysa bos birakilir */
  reporterId?: string;
  severity: SeverityType;
  status: BugStatusType;
  /** YYYY-MM-DD */
  date: string;
  /** Serbest metin not (adimlar, ekran goruntusu linki vb.) */
  notes?: string;
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
  /**
   * Katilimci uye kimlikleri (Member.id).
   *
   * Yoksa/boseysa participantsCount kullanilir; boylece eski kayitlar
   * (sayi bilen ama liste bilmeyen) bozulmaz.
   */
  participants?: string[];
  /** Bu oturumda bildirilen hatalar */
  bugs?: SessionBug[];
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
