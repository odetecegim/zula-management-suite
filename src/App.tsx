import { useState, useEffect, useRef } from 'react';
import { AlertTriangle, CheckCircle, Menu, Eye } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { LoginScreen } from './components/LoginScreen';
import { DashboardView } from './components/DashboardView';
import { MembersView } from './components/MembersView';
import type { TeamFilter } from './components/MembersView';
import { PerformanceView } from './components/PerformanceView';
import type { LogFn } from './components/PerformanceView';
// import { notifyMemberEvent } from './lib/slack'; /* kapatıldı: Slack log atma */
import { apiUrl } from './lib/sheets';
import { authHeaders, setSessionToken, onSessionExpired } from './lib/session-token';
import {
  fetchRemoteMembers,
  pushRemoteMembers,
  getLastSyncError,
  deleteRemoteMember,
} from './lib/members-api';
import { TestSessionsView } from './components/TestSessionsView';
import { RolesView } from './components/RolesView';
import { ReportsView } from './components/ReportsView';
import { LogsView } from './components/LogsView';
import { SettingsView } from './components/SettingsView';
import { SheetsView } from './components/SheetsView';
import { SlackConfigView } from './components/SlackConfigView';
import LanguageSelectionOverlay from './components/LanguageSelectionOverlay';
import {
  INITIAL_MEMBERS,
  INITIAL_ROLES,
  INITIAL_TEST_SESSIONS,
  INITIAL_LOGS,
  INITIAL_PERFORMANCES,
  ALL_PERMISSION_IDS,
  normalizePermissions,
  FOUNDER_MEMBER_ID,
} from './data/initialData';
import { ACADEMY_ROLES, REFEREE_ROLES, canViewLogs, isReadOnlyRole } from './lib/roles';
import type { Member, TestSession, ActivityLog, Performance, RoleDef, RoleId, PermissionId } from './types';

// Uye verisi icin localStorage anahtari (v2 = giris bilgisi semasi eklendi).
// Eski "zula_suite_members" anahtari bilerek kullanilmaz; boylece bozuk/eski
// kayitlar otomatik olarak temiz tohum veriye doner.
// UYE DEPOLAMA ANAHTARI - surum numarasidir.
//
// Y1..5: eski ornek uyeleri (burak, can, lucas, ...) tohum olarak
//       enjekte ediyordu. Kullanici sildiginde tarayici 2.5 sn sonra geri
//       yaziyor ve ayni uye kodu iki kisiye birden atanabiliyordu.
// V6:    anahtar degistirilerek ESKI YEREL VERI TAMAMEN BIRAKILDI.
//       Artik tarayici bos baslar ve veriyi yalnizca Google Sheets'ten alir.
// V8: onarim semasi degisti; v1..v7 anahtarlarindaki bozuk/kullaniciya
//     ait olmayan uye listeleri kalici olarak birakildi.
const MEMBERS_KEY = 'zula_suite_members_v9';

/**
 * SİLİNEN ÜYE ENGEL LİSTESİ
 *
 * Kurucu hesap dışındaki örnek/kayıtlı üyeler veriden kaldırıldı. Bu liste
 * olmadan tarayıcıdaki eski kopya ya da Google Sheets'teki satırlar üyeleri
 * geri getiriyordu. Engel listesine giren kimlikler yerel ve uzak listeden
 * kalıcı olarak süzülür.
 */
/**
 * KURUCU HESAP BILGILERI
 *
 * Panelin kilitlenmemesi icin tek ve değişmez yönetici hesabı.
 * Tarayıcı verisi bozulsa bile bu bilgiler her acilista yeniden
 * uygulanır; böylece "şifre hatırlanmıyor" durumu oluşamaz.
 */
const FOUNDER_USERNAME = 'huseyin';
const FOUNDER_PASSWORD = 'admin123';


const PURGE_BLOCKLIST_KEY = 'zula_suite_purge_blocklist_v2';
const PURGE_FLAG_KEY = 'zula_suite_purge_non_founder_v3';

/**
 * Örnek (tohum) üye kimlikleri — kalıcı olarak engellenir.
 * Admin'in panelden eklediği yeni üyeler farklı id taşıdığı için
 * korunur. Dikkat: bu liste artik kullanilmiyor — temizlik "kurucu
 * disindaki her sey" kuraliyla yapiliyor (kullanici istegi).
 */
const _LEGACY_SEED_IDS = new Set(['m-2', 'm-3', 'm-4', 'm-5']);
void _LEGACY_SEED_IDS;

function loadBlocklist(): string[] {
  try {
    const raw = localStorage.getItem(PURGE_BLOCKLIST_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

function saveBlocklist(ids: string[]): void {
  try {
    localStorage.setItem(PURGE_BLOCKLIST_KEY, JSON.stringify([...new Set(ids)]));
  } catch {
    /* depolama kapali olabilir */
  }
}

/** Uygulama surumu - her degisiklikte artirilir (onbellegi kirmak icin). */
export const APP_VERSION = '2.0.0-member-clean';


export function App() {
  const [currentTab, setCurrentTab] = useState('dashboard');
  // Mobilde sol menunun cekmece olarak acik kapali olmasi
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // ---- SENKRONIZASYON KUYRUGU -----------------------------------------
  // Members degistikce otomatik olarak Sheets'e yazilir. Bu islem iki
  // HTTP istegi (oku + yaz) iceriyor ve saniyeler surebiliyor. Eger
  // kullanicı hizli birkac degisiklik yaparsa (ya da iki sekme acikse)
  // birden fazla zincir es zamanli calisip sunucuyu yormasindi diye
  // burada kuyruk tutuyoruz: ayni anda yalnizca biri calisir, digerleri
  // bitince sirayla devreye girer.
  const syncingRef = useRef(false);
  const pendingRef = useRef(false);
  const [pendingSyncTick, setPendingSyncTick] = useState(0);

  // Oturum: giriş yapan üye (localStorage'da saklanır)
  const [currentUserId, setCurrentUserId] = useState<string | null>(() => {
    const saved = localStorage.getItem('zula_suite_session');
    return saved || null;
  });

  /*
    SUNUCU 401 DONDU -> KULLANICIYI GIRIS EKRANINA GECIR
    ---------------------------------------------------------
    SESSION_SECRET degistiginde (ornegin kullanici Vercel'e ekledigi
    anda) TUM oturumlar aninda gecersizlesir. Once panel yalnizca
    bir mesaj gosteriyordu: kullanici Ayarlar ekraninda oturuyor,
    "Baglantiyi Test Et"e basiyor, ayni hatayi aliyor, tekrar basiyor...
    "Baglanti testi yapamiyorum" diye kilitleniyordu.

    Artik herhangi bir istek 401 aldiginda kullanici OTOMATIK olarak
    giris ekranina gecirilir. Yeniden giris yapinca yeni oturum
    belirteci alinir ve her sey calisir.
  */
  useEffect(() => {
    return onSessionExpired(() => {
      setCurrentUserId(null);
      localStorage.removeItem('zula_suite_session');
      setSessionToken(null);
      setCurrentTab('dashboard');
    });
  }, []);

  const [members, setMembers] = useState<Member[]>(() => {
    // v2: giris bilgisi semasi degisti — eski/bozuk kayitlar otomatik onarilir
    const raw = localStorage.getItem(MEMBERS_KEY);
    if (!raw) return INITIAL_MEMBERS;
    try {
      const parsed = JSON.parse(raw) as Member[];
      if (!Array.isArray(parsed) || parsed.length === 0) return INITIAL_MEMBERS;

      // Cogunlugunda giris bilgisi yoksa (eski/bozuk sema) tohum veriyle sifirla
      const missing = parsed.filter((m) => !m.username || !m.password).length;
      if (missing > parsed.length / 2) return INITIAL_MEMBERS;

      // Kalan kayitlarda eksik alanlari tamamla.
      // Not: kurucunun sifresi asla onarimla degistirilmez; sifre
      // bos her uye icin '1234' olur, kurucu ise asagida sabitlenir.
      const result = parsed.map((m) => {
        const repaired: Member = {
          ...m,
          username:
            m.username && String(m.username).trim().length > 0
              ? String(m.username)
              : m.tagId.toLowerCase().replace(/-/g, ''),
          password: m.password && String(m.password).length > 0 ? String(m.password) : '1234',
          // Izinler Sheets'ten metin ("dashboard,members") olarak gelir;
          // normalizePermissions hem metni hem diziyi guvenli hale getirir.
          permissions: normalizePermissions(m.permissions, m.role),
        };
        // Admin roller tum yeni bolumleri otomatik gorur
        if (repaired.role === 'super_admin' || repaired.role === 'company_manager') {
          repaired.permissions = ALL_PERMISSION_IDS;
        }
        // Gecersiz/eski oyun etiketlerini gecir (orn. kaldirilmis "Zula Mobile")
        const VALID_GAMES = ['Zula PC', 'Zula Strike', 'Wolfteam'];
        const g = String(m.game ?? '');
        const game = (VALID_GAMES as string[]).includes(g) ? g : 'Zula PC';

        // Rol artik yoksa gecerli bir rolle degistir
        const VALID_ROLES = new Set<string>(INITIAL_ROLES.map((r) => r.id));
        const role = (VALID_ROLES.has(m.role) || String(m.role).startsWith('custom_'))
          ? m.role
          : 'academy_member';

        // Eski kayitlarda playerId olmayabilir -> bos stringe normalize et
        repaired.playerId = String(m.playerId ?? '').trim();

        return { ...repaired, game, role } as Member;
      });

      // ORNEK UYE GERI YAZIMINI ENGELLE
      //
      // Sorun: ornek uyeler (burak, can, lucas, ...) kullanici tarafindan
      // silindiginde tarayicinin eski listesi 2.5 sn sonra Sheets'e geri
      // yaziliyordu. Sonuc: silinen kayitlar "geri geldi" ve yeni uyelerle
      // ayni uye kodunu paylasip sessizce engelleniyordu.
      //
      // Cozum: Sheets'te hangi ornek uyelerin KALMASI gerektigini sunucu
      // bildirir; tarayicida artik var olmayanlar eklenmez.
      // Artik hicbir tohum/ornek uye eklenmez.
      //
      // Onceki surum, INITIAL_MEMBERS listesini tarayiciya bir kez
      // enjekte ediyordu. Bu yuzden kullanici bir kaydi silse bile
      // 2.5 sn sonra geri geliyor, ayni uye kodu iki kisiye birden
      // atanabiliyor ve "zaten kullaniliyor" hatasi tum kayitlari
      // engelliyordu. Uye listesi artik YALNIZCA Google Sheets'ten gelir;
      // kurucu hesap dahil her sey yonetici tarafindan panelden yonetilir.
      // ENGEL LISTESI: kurucu disinda kaldirilan kayitlar geri gelmez
      const blocked = new Set(loadBlocklist());
      const cleaned = result.filter((m) => !blocked.has(m.id));

      // KURUCU HESAP HER ZAMAN BULUNUR (panel kilitlenmesin)
      if (!cleaned.some((m) => m.id === FOUNDER_MEMBER_ID)) {
        const founder = INITIAL_MEMBERS.find((m) => m.id === FOUNDER_MEMBER_ID);
        if (founder) cleaned.unshift(founder);
      }

      // Kurucu hesabin kimlik bilgileri her acilista sabitlenir:
      // yoneticinin sifresi yanlislikla degisse/veri bozulsa bile
      // FOUNDER_USERNAME / FOUNDER_PASSWORD ile giris her zaman calisir.
      //
      // AYRICA: Sheets'ten gelen "permissions" alani metin olarak saklanir
      // ("dashboard,members,..."). Diziyi degistirmeden okursak uye
      // "yetkisiz" sayilir ve GIRIS REDDEDILIR. Bu yuzden her zaman
      // normalize edilir.
      return cleaned.map((m) => {
        if (m.id === FOUNDER_MEMBER_ID) {
          return {
            ...m,
            username: FOUNDER_USERNAME,
            password: FOUNDER_PASSWORD,
            role: 'super_admin',
            status: 'Aktif',
            permissions: ALL_PERMISSION_IDS,
          };
        }
        return { ...m, permissions: normalizePermissions(m.permissions, m.role) };
      });
    } catch {
      return INITIAL_MEMBERS;
    }
  });

  // Roller: kayitli listeyi yukler, eksik yerlesik rolleri ekler,
  // kaldirilmis yerlesik rolleri temizler (kullaniciya ait ozel roller korunur).
  const [roles, setRoles] = useState<RoleDef[]>(() => {
    const saved = localStorage.getItem('zula_suite_roles_v3');
    if (!saved) return INITIAL_ROLES;
    try {
      const parsed = JSON.parse(saved) as RoleDef[];
      if (!Array.isArray(parsed) || parsed.length === 0) return INITIAL_ROLES;

      const builtIn = new Set<string>(INITIAL_ROLES.map((r) => r.id));
      const isCustom = (id: string) => id.startsWith('custom_');

      // 1) Kaldirilmis yerlesik rolleri dusur
      let merged = parsed.filter((r) => builtIn.has(r.id) || isCustom(r.id));
      // 2) Eksik yerlesik rolleri ekle
      const present = new Set(merged.map((r) => r.id));
      INITIAL_ROLES.forEach((base) => {
        if (!present.has(base.id)) merged.push(base);
      });
      return merged;
    } catch {
      return INITIAL_ROLES;
    }
  });

  const [sessions, setSessions] = useState<TestSession[]>(() => {
    try {
      const saved = localStorage.getItem('zula_suite_sessions');
      if (saved) {
        const parsed = JSON.parse(saved) as TestSession[];
        if (!Array.isArray(parsed)) return INITIAL_TEST_SESSIONS;
        // Eski ornek oturumlari (ts-1..3) dusur; yoksa yeni uye girince
        // "test varmis gibi" eski demo oturumlar gorunur.
        const cleaned = parsed.filter((s) => s && !['ts-1', 'ts-2', 'ts-3'].includes(s.id));
        const VALID = ['Zula PC', 'Zula Strike', 'Wolfteam'];
        return cleaned.map((s) => ({
          ...s,
          game: (VALID.includes(s.game) ? s.game : 'Zula PC') as TestSession['game'],
        }));
      }
    } catch { /* yoksay */ }
    return INITIAL_TEST_SESSIONS;
  });

  const [logs, setLogs] = useState<ActivityLog[]>(() => {
    try {
      const saved = localStorage.getItem('zula_suite_logs');
      if (saved) {
        const parsed = JSON.parse(saved) as ActivityLog[];
        if (!Array.isArray(parsed)) return INITIAL_LOGS;
        // Eski ornek kaydi (log-3 / Burak Serdar) dusur.
        return parsed.filter(
          (l) => l && l.id !== 'log-3' && l.actor !== 'Burak Serdar'
        );
      }
    } catch { /* yoksay */ }
    return INITIAL_LOGS;
  });

  // Performans kayitlari (uye + donem birlesimi)
  const [performances, setPerformances] = useState<Performance[]>(() => {
    const saved = localStorage.getItem('zula_suite_performances_v4');
    return saved ? JSON.parse(saved) : INITIAL_PERFORMANCES;
  });

  useEffect(() => {
    localStorage.setItem('zula_suite_roles_v3', JSON.stringify(roles));
  }, [roles]);

  useEffect(() => {
    localStorage.setItem('zula_suite_performances_v4', JSON.stringify(performances));
  }, [performances]);

  useEffect(() => {
    localStorage.setItem(MEMBERS_KEY, JSON.stringify(members));
  }, [members]);

  // --- KURUCU DISINDAKI KAYITLARI TEMIZLE (tek seferlik) --------------
  //
  // Istenen: sistemde yalnizca kurucu hesap (Huseyin) kalsin.
  // Kaldirilan kimlikler engel listesine yazilir; boylece tarayicidaki eski
  // kopya veya Sheets satirlari onlari geri getiremez. Temizlik sonrasi
  // uye listesi Sheets'e de yazilir (mevcut senkronizasyon akisi).
  useEffect(() => {
    if (localStorage.getItem(PURGE_FLAG_KEY) === 'done') return;

    // Yalnizca ORNEK (tohum) uyeler temizlenir — kurucu disinda localStorage'da
    // kalan HER kayit dusurulur (m-2..m-5 dahil). Admin'in panelden ekledigi
    // yeni uyeler korunur (LEGACY_SEED_IDS'e eklenmemeli).
    const removedIds = members
      .filter((m) => m.id !== FOUNDER_MEMBER_ID)
      .map((m) => m.id);

    if (removedIds.length > 0) {
      const removed = new Set(removedIds);
      setMembers((prev) => prev.filter((m) => !removed.has(m.id)));
      setPerformances((prev) => prev.filter((p) => !removed.has(p.memberId)));
      saveBlocklist([...loadBlocklist(), ...removedIds]);
    }

    // KURUCU HESAP HER ZAMAN VAR OLMALI (panel kilitlenmesin)
    if (!members.some((m) => m.id === FOUNDER_MEMBER_ID)) {
      const founder = INITIAL_MEMBERS.find((m) => m.id === FOUNDER_MEMBER_ID);
      if (founder) setMembers((prev) => [founder, ...prev]);
    }

    localStorage.setItem(PURGE_FLAG_KEY, 'done');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Paylasilan uye deposu (Google Sheets) -------------------------
  // Backend kapaliysa sessizce devre disi kalir; yerel akis calisir.

  // 1) Acilista sunucudan listeyi al
  //    DIKKAT: yerel veri bozulmaz. Uzaktan gelen kayitlar sadece EKLENIR;
  //    ayni id'li yerel kayit (kullaniciya ait olabilir) ASLA ezilmez.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const fetched = await fetchRemoteMembers();
      if (cancelled) return;
      // Engel listesindeki (silinen) kayitlar sunucudan gelse bile alinmaz
      const blocked = new Set(loadBlocklist());
      const remote = fetched ? fetched.filter((r) => !blocked.has(r.id)) : null;
      if (!remote || remote.length === 0) {
        // Sunucudan HICBIR uye gelmediyse yerel listeyi OLDURMU
        // birakmiyoruz: aksi halde paneldeki eski kayitlar ekranda
        // kalir ve yeni kayitlar gorunmez.
        setHydrated(true);
        return;
      }

      // ---- UYE LISTESINI SUNUCUYLA TAM OLARAK ESITLE ----
      //
      // SORUN: yerel liste yalnizca "Sheets'te zaten olan" kayitlari
      // tutuyordu; hicbir zaman Sheets'teki gercek liste ile
      // degistirilmiyordu. Sonuc: baska bir cihazda eklenen uye
      // ekranda hic gorunmuyor, silinen uye ekranda kaliyordu.
      //
      // COZUM: Sheets (paylasilan depo) TEK KAYNAK olarak alinir.
      //   - Sheets'te olan HER uye listeye girer
      //   - Sheets'te OLMAYAN uye listeden dusulur
      // Yalnizca su an yazilmamis yeni uyeler korunur (sunucu
      // yazma gecikmeli oldugu icin).
      const remoteIds = new Set(remote.map((r) => r.id));
      const localById = new Map(members.map((m) => [m.id, m]));

      // 1) Sheets'te OLAN her üye listeye girer.
      //    Yerelde varsa alanları tazele (şifre korunur), yoksa ekle.
      const synced = remote.map((r) => {
        const local = localById.get(r.id);
        return local ? { ...local, ...r, password: local.password } : r;
      });

      // 2) Sheets'te OLMAYAN üyeler düşer.
      //    Yalnızca henüz yazılmamış yeniler korunur (yazma 2.5 sn gecikmeli).
      const pendingIds = new Set(
        members
          .filter((m) => !remoteIds.has(m.id))
          .filter((m) => m.id !== FOUNDER_MEMBER_ID)
          .map((m) => m.id)
      );
      const pending = members.filter((m) => pendingIds.has(m.id));

      const next = [...synced, ...pending];
      const unchanged =
        next.length === members.length &&
        next.every((m, i) => members[i] && members[i].id === m.id);
      if (!unchanged) setMembers(next);

      // Yalnızca veri ÇEKİLDİKTEN SONRA yazmaya izin ver
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 1b) Sekmeye geri donuldugunde yeniden dogrula
  //
  // ACILE OLAY: Sunucuda kullanici silme islemi yapti, ama tarayicida
  // acik olan bayat sekme 2.5 sn sonra eski (silinmis) listeyi geri
  // yazdi ve Sheets'e geri geldi. Ayrica baska bir tarayicida yapilan
  // degisiklikler de gorunur olmuyordu.
  //
  // Cozum: sekme veya pencere tekrar odaklandiginda veri CEKILIR ve
  // sunucuda olmayan yerel kayitlar dusurulur.
  useEffect(() => {
    const reconcile = async () => {
      if (document.visibilityState !== 'visible') return;
      const fetched = await fetchRemoteMembers();
      if (!fetched || fetched.length === 0) return;

      // Engel listesindeki (silinen) kayitlar ve kurucu hesap korunur
      const blocked = new Set(loadBlocklist());
      const remote = fetched.filter((r) => !blocked.has(r.id));
      if (remote.length === 0) return;

      const remoteIds = new Set(remote.map((r) => r.id));
      setMembers((prev) => {
        const localById = new Map(prev.map((m) => [m.id, m]));

        // Sheets'te OLAN her uye listeye girer (yoksa eklenir)
        const synced = remote.map((r) => {
          const local = localById.get(r.id);
          return local ? { ...local, ...r, password: local.password } : r;
        });

        // Sheets'te olmayanlar: yalnizca yeni yazilmamis uyeler kalir
        const pending = prev.filter(
          (m) => !remoteIds.has(m.id) && m.id !== FOUNDER_MEMBER_ID
        );

        const next = [...synced, ...pending];
        if (next.length === prev.length && next.every((m, i) => prev[i] && prev[i].id === m.id)) {
          return prev;
        }
        return next;
      });
    };

    const onFocus = () => {
      if (document.visibilityState === 'visible') void reconcile();
    };
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  // 2) Uye listesi degisince sunucuya gecit yaz
  //
  // Yazma hatasi olursa kullaniciya acikca bildirilir; sessizce
  // basarisiz olmak, "uye eklendim sanip sonra kayboldu" durumu
  // yaratirdi.
  const [syncError, setSyncError] = useState<string>('');
  const [syncOk, setSyncOk] = useState<boolean>(true);
  // Yeni uye eklendiginde kullaniciya "kaydediliyor" geri bildirimi
  const [saveNotice, setSaveNotice] = useState<{ name: string; ok: boolean } | null>(null);

  // HYDRATION KILIDI
  //
  // Acilis sirasinda iki sey ayni anda calisiyordu: yerel veri sunucuya
  // yaziliyordu ve sunucudan veri cekiliyordu. Eski (silinmis) yerel
  // liste once yazilip sunucudaki dogru veriyi eziyordu.
  //
  // Cozum: fetch bitene kadar HIC BIR yazma yapilmaz.
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // Sunucu yanit vermese bile (ag kesik / backend kapali) kilidi ac;
    // yoksa panel hicbir zaman degisiklik gonderemezdi.
    const failsafe = setTimeout(() => setHydrated(true), 6000);
    return () => clearTimeout(failsafe);
  }, []);

  useEffect(() => {
    if (!hydrated) return; // uzaktan veri gelmeden yazma
    const timer = setTimeout(async () => {
      // ---- ESZAMANLI KAYIT KORUMASI ------------------------------
      // SORUN: asagidaki fetch + write zinciri 2 ayri HTTP istegi
      // yapiyor. Kullanici hizli arka arkaya birkac degisiklik
      // yaparsa (ya da iki sekme acikse) birden fazla zincir
      // es zamanli calisiyor; sunucu kuyrugu doldugu icin
      // "zaman asimina ugradi" hatasi veriyordu.
      //
      // COZUM: ayni anda yalnizca bir zincir calisir. Yeni bir
      // degisiklik gelirse mevcut bittikten sonra calisir.
      if (syncingRef.current) {
        pendingRef.current = true;
        return;
      }
      syncingRef.current = true;

      try {
      // ONEMLI: butun liste gonderilir, FILTRE UYGULANMAZ.
      //
      // Sunucudaki writeMembers() once tum satirlari siler, sonra gelen
      // listeyi yazar. Sifresi olmayan uyeleri filtrelemek (yanlis bir
      // dusunceyle denenildi) kucuk bir liste yollamak demektir ve
      // Sheets'teki diger uyeleri kalici olarak siler.
      //
      // Sifre konusunda guvenliyiz: sunucuda sifresiz gelen kaydin
      // mevcut hash'i KORUNUR (hashById). Sifreli uyeler yeniden
      // hash'lenir.
      //
      // confirmSil: panelden bilerek uye silindiysa sunucudaki
      // "kismen silme" korumasi devre disi kalir. Istemci hatasinda
      // (bayrak yok) veri kaybi olusmaz.
      // ---- KRITIK: YAZMADAN ONCE SUNUCUYLA BIRLESTIR ----
      //
      // SORUN: `members` yalnizca BU tarayicidaki liste; baska bir
      // cihazda eklenen uyeler burada yok. Tum liste gonderildiginde
      // sunucu once satirlari SILIP gelen listeyi yazdigindan, eklenen
      // her uye digerlerini SILERDI ("mihri" kayboldu gibi).
      //
      // COZUM: once sunucudan gecerli listeyi cek, yerel ile birlestir,
      // sonra yaz. Boylece hicbir uye kaybolmaz.
      let toWrite = members;
      try {
        const server = await fetchRemoteMembers();
        if (server && server.length > 0) {
          const serverById = new Map(server.map((s) => [s.id, s]));
          const localById = new Map(members.map((m) => [m.id, m]));

          // Yereldeki her uye: sunucuda varsa alanlari tazele,
          // yoksa (yeni eklenmis) yerel kaydi kullan.
          const merged = members.map((m) => {
            const s = serverById.get(m.id);
            return s ? { ...m, ...s, password: m.password } : m;
          });

          // Sunucuda olup yerelde olmayanlar KORUNUR.
          const onlyOnServer = server.filter((s) => !localById.has(s.id));
          toWrite = [...merged, ...onlyOnServer];
        }
      } catch {
        // Sunucu okunamazsa yerel listeyle devam et
      }

      const ok = await pushRemoteMembers(toWrite);
      if (ok) {
        setSyncOk(true);
        setSyncError('');
        setSaveNotice((n) => (n && !n.ok ? { ...n, ok: true } : n));
      } else {
        setSyncOk(false);
        setSyncError(getLastSyncError() || 'Google Sheets’e yazılamadı');
        setSaveNotice((n) => (n ? { ...n, ok: false } : n));
      }
      } finally {
        syncingRef.current = false;
        // Zincir sirasinda yeni degisiklik geldiyse tekrar dene
        if (pendingRef.current) {
          pendingRef.current = false;
          setPendingSyncTick((t) => t + 1);
        }
      }
    }, 2500);
    return () => clearTimeout(timer);
  }, [members, hydrated, pendingSyncTick]);

  // Bildirimi birkac saniye sonra kapat
  useEffect(() => {
    if (!saveNotice) return;
    const t = setTimeout(() => setSaveNotice(null), 6000);
    return () => clearTimeout(t);
  }, [saveNotice]);

  useEffect(() => {
    localStorage.setItem('zula_suite_sessions', JSON.stringify(sessions));
  }, [sessions]);

  useEffect(() => {
    localStorage.setItem('zula_suite_logs', JSON.stringify(logs));
  }, [logs]);

  useEffect(() => {
    if (currentUserId) {
      localStorage.setItem('zula_suite_session', currentUserId);
    } else {
      localStorage.removeItem('zula_suite_session');
    }
  }, [currentUserId]);

  // Giriş yapan kullanıcı
  //
  // İzinler burada da normalize edilir: sayfa yenilendiğinde oturum
  // localStorage'dan geri gelir ve izinler metin ("a,b,c") olarak
  // okunabilir. Normalize edilmezse allowedTabs boş kalır ve kullanıcı
  // tekrar giriş ekranına düşer.
  const currentUser = currentUserId
    ? (() => {
        const found = members.find((m) => m.id === currentUserId);
        if (!found) return null;
        return {
          ...found,
          permissions: normalizePermissions(found.permissions, found.role),
        } as Member;
      })()
    : null;

  const isAdmin = currentUser?.role === 'super_admin' || currentUser?.role === 'company_manager';

  // Rol simulasyonu: admin baska bir rol gozuyle paneli gorebilir
  // (yalnizca gorunum; giris yapan kullanici degismez)
  const [simulateRoles, setSimulateRoles] = useState<RoleId[]>(() => {
    try {
      const saved = localStorage.getItem('zula_suite_simulate_roles');
      return saved ? (JSON.parse(saved) as RoleId[]) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('zula_suite_simulate_roles', JSON.stringify(simulateRoles));
  }, [simulateRoles]);

  const simulating = isAdmin && simulateRoles.length > 0;

  // Akademi (ve buna benzer) salt-okunur roller: panelde sadece GORUNTULER,
  // hicbir seyi degistiremez (uye ekle/sil/duzenle, puan girişi, test oturumu,
  // rol/ayar degisikligi, Sheets aktarimi hep kapali).
  // Rol simulasyonu acikken SIMULE edilen rol baz alinir; boylece admin,
  // o rolun gercekten nasil gorundugunu test edebilir.
  const effectiveRole = simulating ? (simulateRoles[0] ?? currentUser?.role) : currentUser?.role;
  const isReadOnly = isReadOnlyRole(effectiveRole);

// Performans duzenleme izni: admin VEYA "performance" bolum yetkisi olan herkes
// (bolumunu menude gormesi yeterli degil, gercekten duzenleyebilmesi de gerekir)
const canEditPerformance =
    !isReadOnly && (isAdmin || (currentUser?.permissions?.includes('performance') ?? false));

  // Kullanıcının erişebileceği sekmeler (admin tümüne erişir)
  // Simulasyon aktifse: secimdeki roller birliginin izinleri gecerli olur (salt gorunum)
  const baseAllowed: PermissionId[] = isAdmin
    ? ALL_PERMISSION_IDS
    : currentUser?.permissions ?? [];

  const allowedTabs: PermissionId[] = simulating
    ? ALL_PERMISSION_IDS.filter((pid) =>
        simulateRoles.some((roleId) => {
          const def = roles.find((r) => r.id === roleId);
          return def?.permissions.includes(pid);
        })
      )
    : baseAllowed;

  // SISTEM KAYITLARI: yalnizca sirket kadrosu (yonetim) gorur.
  // Testci/moderator rollerinde "logs" izni olsa bile engellenir.
  const mayViewLogs = canViewLogs(currentUser?.role);
  const visibleTabs = mayViewLogs
    ? allowedTabs
    : allowedTabs.filter((pid) => pid !== 'logs');

  const handleLogin = (member: Member) => {
    // Gelen uyeyi izinleriyle birlikte listeye ISLE.
    //
    // ONCEKI SURUM: yalnizca currentUserId set ediliyordu. currentUser
    // `members.find(...)` ile bulundugu icin, kullanici listede yoksa
    // veya izinleri bos ("") ise currentUser null kaliyor ve giris
    // ekranina GERI DONUYORdu — kullanici "giris yapamiyorum" saniyordu.
    // Kurucu (huseyin) her zaman listede oldugu icin yalnizca o giriyordu.
    const withPermissions: Member = {
      ...member,
      permissions: normalizePermissions(member.permissions, member.role),
    };
    setMembers((prev) => {
      const exists = prev.some((m) => m.id === withPermissions.id);
      return exists
        ? prev.map((m) => (m.id === withPermissions.id ? { ...m, ...withPermissions } : m))
        : [withPermissions, ...prev];
    });

    setCurrentUserId(withPermissions.id);
    setCurrentTab('dashboard');
    const newLog: ActivityLog = {
      id: 'log-' + Date.now(),
      actor: member.fullName + ' (@' + member.username + ')',
      action: 'Panele giriş yaptı.',
      category: 'System',
      timestamp: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
    };
    setLogs((prev) => [newLog, ...prev]);
  };

  /*
    ZORLA OTURUM YENILEME (Slack sekmesindeki "Oturumu Yenile" dugmesi)
    Sunucu 401 dondugunde kullaniciya sadece "yeniden giris yapin" mesaji
    gosteriliyordu; cikis dugmesi menunun altinda gizliydi. Dugme tiklaninca
    hem sunucu hem yerel oturum temizlenir, giris ekranina gecilir.
  */
  const handleForceRelogin = () => {
    try {
      void fetch(apiUrl('/api/sheets/logout'), {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({}),
      });
    } catch {
      /* sunucu kapali olabilir; onemsiz */
    }
    setSessionToken(null);
    setCurrentUserId(null);
    setCurrentTab('dashboard');
  };

  const handleLogout = () => {
    if (currentUser) {
      const newLog: ActivityLog = {
        id: 'log-' + Date.now(),
        actor: currentUser.fullName + ' (@' + currentUser.username + ')',
        action: 'Oturumu kapattı.',
        category: 'System',
        timestamp: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
      };
      setLogs((prev) => [newLog, ...prev]);
    }
    // localStorage belirteci de silinmeli; yoksa sonraki kullanici eski belirteci kullanir.
    setSessionToken(null);
    setCurrentUserId(null);
    setCurrentTab('dashboard');
  };

  // OTURUM KAPATMA: yonetici bir kullaniciyi "Pasif" cekerse, o
  // kullanicinin ACIK oturumu da hemen kapanmali. Aksi halde panel
  // acik kalir ve kullanici yeni giris yapmadan kullanmaya devam eder.
  const sessionIsPassive =
    currentUserId !== null &&
    currentUser !== null &&
    String(currentUser.status ?? '').toLocaleLowerCase('tr-TR') !== 'aktif';

  useEffect(() => {
    if (!sessionIsPassive) return;
    localStorage.removeItem('zula_suite_session');
    setCurrentUserId(null);
    setCurrentTab('dashboard');
  }, [sessionIsPassive]);

  // Oturum yoksa veya hesap pasifse login ekranını göster.
  //
  // DIKKAT: `allowedTabs.length === 0` kontrolu KALDIRILDI. Izinler
  // normalize edildiginden bu artik yalnizca gercekten yetkisiz
  // hesaplarda olur; ama bir eslesme hatasinda kullaniciyi panelden
  // atiyordu. Izin kontrolu zaten LoginScreen'de (finish) yapiliyor.
  if (!currentUser || String(currentUser.status ?? '').toLocaleLowerCase('tr-TR') !== 'aktif') {
    return (
      <>
        <LanguageSelectionOverlay />
        <LoginScreen members={members} onLogin={handleLogin} />
      </>
    );
  }

  // Alt bilesenlerin denetim kaydi birakmasi icin ortak fonksiyon
  const addLogEntry: LogFn = (action, category, memberId) => {
    const newLog: ActivityLog = {
      id: 'log-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      actor: currentUser?.fullName || 'Sistem',
      action,
      category,
      memberId,
      timestamp: new Date().toLocaleString('tr-TR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    };
    setLogs((prev) => [newLog, ...prev]);
  };

  const handleAddMember = (m: Member) => {
    if (isReadOnly) return; // salt-okunur rol uye ekleyemez
    setMembers((prev) => [m, ...prev]);
    // Kullaniciya "kaydediliyor" bildirimi; sonucu yazma islemi guncelleyecek.
    setSaveNotice({ name: m.fullName, ok: true });
    const newLog: ActivityLog = {
      id: 'log-' + Date.now(),
      actor: currentUser?.fullName || 'Sistem',
      action: 'Yeni personel eklendi: ' + m.fullName + ' (' + m.tagId + ')',
      category: 'User',
      memberId: m.id,
      timestamp: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
    };
    setLogs((prev) => [newLog, ...prev]);

    // Slack kanali bilgilendirilir (sunucu uzerinden; hata paneli bozmaz)
    // void notifyMemberEvent('eklendi', m, currentUser?.fullName);
  };

  const handleUpdateMember = (m: Member) => {
    if (isReadOnly) return; // salt-okunur rol duzenleyemez
    setMembers((prev) => prev.map((item) => (item.id === m.id ? m : item)));
    const newLog: ActivityLog = {
      id: 'log-' + Date.now(),
      actor: currentUser?.fullName || 'Sistem',
      action: 'Personel güncellendi: ' + m.fullName + ' (' + m.tagId + ')',
      category: 'User',
      memberId: m.id,
      timestamp: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
    };
    setLogs((prev) => [newLog, ...prev]);

    // void notifyMemberEvent('guncellendi', m, currentUser?.fullName);
  };

  const handleDeleteMember = (id: string) => {
    if (isReadOnly) return; // salt-okunur rol silemez
    const target = members.find((m) => m.id === id);
    setMembers((prev) => prev.filter((item) => item.id !== id));
    setPerformances((prev) => prev.filter((p) => p.memberId !== id));

    // Sunucudan da SİL. Toplu yazma artık güvenli modda (upsertOnly)
    // çalıştığı için listede olmayan üyeyi KORUR; bu yüzden gerçek
    // silme ayrı bir uç noktayla yapılır.
    if (target && id !== FOUNDER_MEMBER_ID) {
      void deleteRemoteMember(id);
    }

    if (target) {
      const newLog: ActivityLog = {
        id: 'log-' + Date.now(),
        actor: currentUser?.fullName || 'Sistem',
        action: 'Personel silindi: ' + target.fullName + ' (' + target.tagId + ')',
        category: 'User',
        timestamp: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
      };
      setLogs((prev) => [newLog, ...prev]);

      // Silme islemi kritik oldugu icin Slack'a ayrica bildirilir
      // void notifyMemberEvent('silindi', target, currentUser?.fullName);
    }
  };

  // Google Sheets'ten gelen veriyi panele yazar
  const handleSheetsImport = (payload: {
    members: Member[];
    performances: Performance[];
    summary: string;
  }) => {
    if (isReadOnly) return; // salt-okunur rol ic ice aktaramaz
    setMembers(payload.members);
    setPerformances((prev) => {
      const next = [...prev];
      payload.performances.forEach((incoming) => {
        const i = next.findIndex(
          (x) => x.memberId === incoming.memberId && x.period === incoming.period
        );
        if (i > -1) next[i] = incoming;
        else next.push(incoming);
      });
      return next;
    });
    addLogEntry('Google Sheets içe aktarma: ' + payload.summary, 'Performance');
  };

  const handleSavePerformance = (perf: Performance) => {
    if (isReadOnly) return; // salt-okunur rol puan giremez
    setPerformances((prev) => {
      const idx = prev.findIndex((p) => p.memberId === perf.memberId && p.period === perf.period);
      if (idx > -1) {
        const next = [...prev];
        next[idx] = perf;
        return next;
      }
      return [...prev, perf];
    });
    const target = members.find((m) => m.id === perf.memberId);
    const newLog: ActivityLog = {
      id: 'log-' + Date.now(),
      actor: currentUser?.fullName || 'Sistem',
      action: 'Performans kaydedildi: ' + (target ? target.fullName + ' (' + target.tagId + ')' : perf.memberId) + ' · ' + perf.period,
      category: 'Performance',
      memberId: perf.memberId,
      timestamp: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
    };
    setLogs((prev) => [newLog, ...prev]);
  };

  const handleAddRole = (role: RoleDef) => {
    if (isReadOnly) return; // salt-okunur rol degisiklik yapamaz
    setRoles((prev) => [...prev, role]);
    const newLog: ActivityLog = {
      id: 'log-' + Date.now(),
      actor: currentUser?.fullName || 'Sistem',
      action: 'Yeni rol oluşturuldu: ' + role.name,
      category: 'Role',
      timestamp: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
    };
    setLogs((prev) => [newLog, ...prev]);
  };

  const handleUpdateRole = (role: RoleDef) => {
    if (isReadOnly) return; // salt-okunur rol degisiklik yapamaz
    setRoles((prev) => prev.map((r) => (r.id === role.id ? role : r)));
    const newLog: ActivityLog = {
      id: 'log-' + Date.now(),
      actor: currentUser?.fullName || 'Sistem',
      action: 'Rol güncellendi: ' + role.name,
      category: 'Role',
      timestamp: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
    };
    setLogs((prev) => [newLog, ...prev]);
  };

  const handleDeleteRole = (id: string) => {
    if (isReadOnly) return; // salt-okunur rol degisiklik yapamaz
    const target = roles.find((r) => r.id === id);
    setRoles((prev) => prev.filter((r) => r.id !== id));
    if (target) {
      const newLog: ActivityLog = {
        id: 'log-' + Date.now(),
        actor: currentUser?.fullName || 'Sistem',
        action: 'Rol silindi: ' + target.name,
        category: 'Role',
        timestamp: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
      };
      setLogs((prev) => [newLog, ...prev]);
    }
  };

  /**
   * ROLLERIN LISTEDEKI SIRASINI DEGISTIRME (yer degisikligi)
   *
   * Yeni roller en sona eklenir; bazen "Kaptan" ya da "Hakem" rolunu
   * yukarı taşımak isteriz. Sira kalici olarak saklanir ve sistem
   * loguna dusulur.
   */
  const handleReorderRoles = (ordered: RoleId[]) => {
    if (isReadOnly) return; // salt-okunur rol sira degistiremez
    setRoles((prev) => {
      const map = new Map(prev.map((r) => [r.id as string, r]));
      const next = ordered
        .map((id) => map.get(id as string))
        .filter((r): r is RoleDef => Boolean(r));
      // Sirada olmayan roller (veri tutarsizligi) sona eklenir
      for (const r of prev) if (!ordered.includes(r.id)) next.push(r);
      return next;
    });
    const newLog: ActivityLog = {
      id: 'log-' + Date.now(),
      actor: currentUser?.fullName || 'Sistem',
      action: 'Rol sırası değiştirildi',
      category: 'Role',
      timestamp: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
    };
    setLogs((prev) => [newLog, ...prev]);
  };

  const academyFilter: TeamFilter = {
    team: 'academy',
    allowedRoles: ACADEMY_ROLES,
    title: 'Akademi Üyeleri',
    subtitle: 'Akademi kaptanı, QA testçileri ve topluluk moderatörleri',
    emptyMessage: 'Bu oyun/bölge için akademi üyesi bulunamadı.',
  };

  const refereeFilter: TeamFilter = {
    team: 'referee',
    allowedRoles: REFEREE_ROLES,
    title: 'Hakem Üyeleri',
    subtitle: 'Baş hakem ve gözlemciler',
    emptyMessage: 'Bu oyun/bölge için hakem bulunamadı.',
  };

  const handleAddSession = (s: TestSession) => {
    if (isReadOnly) return; // salt-okunur rol oturum acamaz
    setSessions((prev) => [s, ...prev]);
    const newLog: ActivityLog = {
      id: 'log-' + Date.now(),
      actor: currentUser?.fullName || 'Sistem',
      action: 'Yeni test oturumu başlatıldı: ' + s.title,
      category: 'Performance',
      timestamp: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
    };
    setLogs((prev) => [newLog, ...prev]);
  };

  const handleUpdateSessionStatus = (
    id: string,
    status: 'Planlandı' | 'Devam Ediyor' | 'Tamamlandı'
  ) => {
    if (isReadOnly) return; // salt-okunur rol durum degistiremez
    setSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status } : s))
    );
  };

  // Test oturumu duzenleme (baslik, surum, oyun, tarih, durum)
  const handleUpdateSession = (id: string, patch: Partial<TestSession>) => {
    if (isReadOnly) return; // salt-okunur rol duzenleyemez
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    const newLog: ActivityLog = {
      id: 'log-' + Date.now(),
      actor: currentUser?.fullName || 'Sistem',
      action: 'Test oturumu guncellendi: ' + (patch.title ?? id),
      category: 'Performance',
      timestamp: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
    };
    setLogs((prev) => [newLog, ...prev]);
  };

  // Test oturumu silme
  const handleDeleteSession = (id: string) => {
    if (isReadOnly) return; // salt-okunur rol silemez
    const target = sessions.find((s) => s.id === id);
    setSessions((prev) => prev.filter((s) => s.id !== id));
    const newLog: ActivityLog = {
      id: 'log-' + Date.now(),
      actor: currentUser?.fullName || 'Sistem',
      action: 'Test oturumu silindi: ' + (target?.title ?? id),
      category: 'Performance',
      timestamp: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
    };
    setLogs((prev) => [newLog, ...prev]);
  };

  // Kullanıcının yetkisi olmayan bir sekmede kalması engellenir
  // Kullanici yetkisiz oldugu icin (ornegin sirket kadrosu disi biri
  // "logs" sekmesine dogrudan girmeye calisirsa) erisilebilir sekme
  // listesinden dusurulur ve ekranda gosterilmez.
  const activeTab = visibleTabs.includes(currentTab as PermissionId)
    ? currentTab
    : visibleTabs[0];

  // Rol adini roller listesinden cek (yeni roller de dogru gosterilsin)
  const roleName = roles.find((r) => r.id === currentUser.role)?.name ?? currentUser.role;

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100 selection:bg-indigo-500 selection:text-white">
      <LanguageSelectionOverlay />

      {/* Sheets senkronizasyon durumu - sessiz hatalari gorunur kilar */}
      <div className="fixed top-3 right-3 z-[90] space-y-2">
        {!syncOk && (
          <div className="flex items-start gap-2 px-4 py-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 backdrop-blur-xl shadow-lg max-w-sm">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-bold text-rose-300">Google Sheets’e kaydedilemedi</div>
              <div className="text-[10px] text-rose-400/80 break-anywhere">{syncError}</div>
              {/* Veri yerelde guvende; yalnizca Sheets'e yazilamadi. */}
              <div className="text-[10px] text-slate-400 mt-1">
                Üye bilgilerin tarayıcında güvenle saklandı.
              </div>
              <button
                onClick={() => {
                  syncingRef.current = false;
                  pendingRef.current = false;
                  setPendingSyncTick((t) => t + 1);
                }}
                className="mt-2 px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 text-[11px] font-semibold transition-colors cursor-pointer"
              >
                Tekrar Dene
              </button>
            </div>
          </div>
        )}

        {/* Yeni uye eklendiginde kaydetme sonucunu goster */}
        {saveNotice && (
          <div
            className={
              'flex items-center gap-2 px-4 py-2.5 rounded-xl border backdrop-blur-xl shadow-lg max-w-sm ' +
              (saveNotice.ok
                ? 'bg-emerald-500/15 border-emerald-500/30'
                : 'bg-rose-500/15 border-rose-500/30')
            }
          >
            {saveNotice.ok ? (
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <div className="min-w-0">
              <div className={'text-[11px] font-bold ' + (saveNotice.ok ? 'text-emerald-300' : 'text-rose-300')}>
                {saveNotice.name} kaydedildi
              </div>
              {!saveNotice.ok && (
                <div className="text-[10px] text-rose-400/80">
                  Sheets’e yazılamadı — bu kullanıcı giriş yapamayabilir.
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Sidebar */}
      <Sidebar
        currentTab={activeTab}
        onSelectTab={setCurrentTab}
        allowedTabs={visibleTabs}
        currentUser={currentUser}
        isAdmin={isAdmin}
        onLogout={handleLogout}
        mobileOpen={sidebarOpen}
        onCloseMobile={() => setSidebarOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Header Bar */}
        <header className="h-14 sm:h-16 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md px-3 sm:px-4 lg:px-8 flex items-center justify-between gap-2 sticky top-0 z-30">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            {/* MOBIL MENU BUTONU */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 -ml-1 rounded-xl border border-slate-800 bg-slate-900 text-slate-300 active:scale-95 transition-transform cursor-pointer shrink-0"
              aria-label="Menüyü aç"
            >
              <Menu className="w-5 h-5" />
            </button>
            <span className="hidden sm:inline text-xs font-semibold uppercase tracking-wider text-slate-400">Panel</span>
            <span className="hidden sm:inline text-slate-600">/</span>
            <span className="text-xs sm:text-sm font-bold text-white truncate">
              {activeTab === 'dashboard'
                ? 'Genel Bakış'
                : activeTab === 'members'
                ? 'Personel Yönetimi'
                : activeTab === 'tests'
                ? 'Test Oturumları'
                : activeTab === 'reports'
                ? 'Performans Raporları'
                : activeTab === 'performance'
                ? 'Performans Yönetimi'
                : activeTab === 'academy'
                ? 'Akademi Üyeleri'
                : activeTab === 'referees'
                ? 'Hakem Üyeleri'
                : activeTab === 'logs'
                ? 'Sistem Kayıtları'
                : activeTab === 'sheets'
                ? 'Google Sheets'
                : activeTab === 'slack'
                ? 'Slack Bildirimleri'
                : activeTab === 'settings'
                ? 'Ayarlar & Roller'
                : 'Yetki Rolleri'}
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            {simulating && (
              <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                <span className="text-amber-300 font-medium">
                  Simülasyon: {simulateRoles.map((r) => roles.find((x) => x.id === r)?.name ?? r).join(', ')}
                </span>
                <button
                  onClick={() => setSimulateRoles([])}
                  className="text-amber-400 hover:text-amber-200 font-bold cursor-pointer"
                  title="Simülasyonu kapat"
                >
                  ✕
                </button>
              </div>
            )}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-slate-300 font-medium">Sistem Çevrimiçi</span>
            </div>

            {isReadOnly && (
              <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                <span className="text-amber-300 font-medium">Salt Okunur — sadece görüntüleme</span>
              </div>
            )}

            {/* Mobilde salt-okunur rozeti (tek ikon) */}
            {isReadOnly && (
              <div
                className="md:hidden p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400"
                title="Salt Okunur — sadece görüntüleme"
              >
                <Eye className="w-4 h-4" />
              </div>
            )}

            <div className="flex items-center gap-2 sm:gap-3 pl-2 border-l border-slate-800">
              <div className="text-right hidden lg:block">
                <div className="text-xs font-bold text-slate-200">{currentUser.fullName}</div>
                <div className="text-[10px] text-indigo-400">
                  @{currentUser.username}
                  <span className="text-slate-500"> · {roleName}</span>
                </div>
              </div>
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center font-bold text-white text-xs shadow-md shadow-indigo-600/20">
                {currentUser.fullName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
              </div>
            </div>
          </div>
        </header>

        {/* Tab Body */}
        <main className="p-3 sm:p-5 lg:p-8 flex-1 min-w-0">
          {activeTab === 'dashboard' && (
            <DashboardView
              members={members}
              sessions={sessions}
              logs={logs}
              performances={performances}
              currentUser={currentUser}
              onSelectTab={setCurrentTab}
            />
          )}

          {activeTab === 'members' && (
            <MembersView
              members={members}
              roles={roles}
              onAddMember={handleAddMember}
              onUpdateMember={handleUpdateMember}
              onDeleteMember={handleDeleteMember}
              currentUser={currentUser}
              isAdmin={isAdmin}
              readOnly={isReadOnly}
              hideActions={isReadOnly}
              teamFilter={null}
              logs={logs}
            />
          )}

          {activeTab === 'academy' && (
            <MembersView
              members={members}
              roles={roles}
              onAddMember={handleAddMember}
              onUpdateMember={handleUpdateMember}
              onDeleteMember={handleDeleteMember}
              currentUser={currentUser}
              isAdmin={isAdmin}
              readOnly={isReadOnly}
              hideActions={isReadOnly}
              teamFilter={academyFilter}
              logs={logs}
            />
          )}

          {activeTab === 'referees' && (
            <MembersView
              members={members}
              roles={roles}
              onAddMember={handleAddMember}
              onUpdateMember={handleUpdateMember}
              onDeleteMember={handleDeleteMember}
              currentUser={currentUser}
              isAdmin={isAdmin}
              readOnly={isReadOnly}
              hideActions={isReadOnly}
              teamFilter={refereeFilter}
              logs={logs}
            />
          )}

          {activeTab === 'performance' && (
            <PerformanceView
              members={members}
              performances={performances}
              canEdit={canEditPerformance}
              currentUser={currentUser}
              onSavePerformance={handleSavePerformance}
              onLog={addLogEntry}
            />
          )}

          {activeTab === 'tests' && (
            <TestSessionsView
              sessions={sessions}
              members={members}
              readOnly={isReadOnly}
              onAddSession={handleAddSession}
              onUpdateStatus={handleUpdateSessionStatus}
              onUpdateSession={handleUpdateSession}
              onDeleteSession={handleDeleteSession}
            />
          )}

          {activeTab === 'reports' && <ReportsView members={members} performances={performances} />}

          {activeTab === 'roles' && <RolesView roles={roles} members={members} />}

          {activeTab === 'logs' && mayViewLogs && <LogsView logs={logs} members={members} />}

          {activeTab === 'sheets' && (
            <SheetsView
              readOnly={isReadOnly}
              members={members}
              performances={performances}
              onApplyImport={handleSheetsImport}
            />
          )}

          {activeTab === 'slack' && (
            <SlackConfigView readOnly={isReadOnly} onForceRelogin={handleForceRelogin} />
          )}

          {activeTab === 'settings' && (
            <SettingsView
              readOnly={isReadOnly}
              members={members}
              roles={roles}
              onAddRole={handleAddRole}
              onUpdateRole={handleUpdateRole}
              onDeleteRole={handleDeleteRole}
              onReorderRoles={handleReorderRoles}
              simulateRoles={simulateRoles}
              onSimulateRoles={setSimulateRoles}
            />
          )}
        </main>
      </div>
    </div>
  );
}

export default App;


