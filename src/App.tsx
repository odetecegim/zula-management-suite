import { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { LoginScreen } from './components/LoginScreen';
import { DashboardView } from './components/DashboardView';
import { MembersView } from './components/MembersView';
import type { TeamFilter } from './components/MembersView';
import { PerformanceView } from './components/PerformanceView';
import type { LogFn } from './components/PerformanceView';
import { fetchRemoteMembers, pushRemoteMembers } from './lib/members-api';
import { TestSessionsView } from './components/TestSessionsView';
import { RolesView } from './components/RolesView';
import { ReportsView } from './components/ReportsView';
import { LogsView } from './components/LogsView';
import { SettingsView } from './components/SettingsView';
import { SheetsView } from './components/SheetsView';
import {
  INITIAL_MEMBERS,
  INITIAL_ROLES,
  INITIAL_TEST_SESSIONS,
  INITIAL_LOGS,
  INITIAL_PERFORMANCES,
  ALL_PERMISSION_IDS,
} from './data/initialData';
import { ACADEMY_ROLES, REFEREE_ROLES } from './lib/roles';
import type { Member, TestSession, ActivityLog, Performance, RoleDef, RoleId, PermissionId } from './types';

// Uye verisi icin localStorage anahtari (v2 = giris bilgisi semasi eklendi).
// Eski "zula_suite_members" anahtari bilerek kullanilmaz; boylece bozuk/eski
// kayitlar otomatik olarak temiz tohum veriye doner.
const MEMBERS_KEY = 'zula_suite_members_v2';

export function App() {
  const [currentTab, setCurrentTab] = useState('dashboard');

  // Oturum: giriş yapan üye (localStorage'da saklanır)
  const [currentUserId, setCurrentUserId] = useState<string | null>(() => {
    const saved = localStorage.getItem('zula_suite_session');
    return saved || null;
  });

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

      // Kalan kayitlarda eksik alanlari tamamla
      const result = parsed.map((m) => {
        const repaired: Member = {
          ...m,
          username:
            m.username && String(m.username).trim().length > 0
              ? String(m.username)
              : m.tagId.toLowerCase().replace(/-/g, ''),
          password: m.password && String(m.password).length > 0 ? String(m.password) : '1234',
          permissions:
            Array.isArray(m.permissions) && m.permissions.length > 0
              ? m.permissions
              : (['dashboard'] as PermissionId[]),
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

      // Yeni eklenen tohum uyelerini mevcut listeye BIR KEZ ekle.
      // Boylece yeni hesaplar her tarayicida gorunur olur, ama
      // kullanicinin yaptigi tum duzenlemeler korunur.
      const SEED_FLAG = 'zula_suite_seeded_v4';
      if (!localStorage.getItem(SEED_FLAG)) {
        const present = new Set(result.map((m) => m.id));
        let added = 0;
        for (const seed of INITIAL_MEMBERS) {
          if (!present.has(seed.id)) {
            result.push(seed);
            present.add(seed.id);
            added++;
          }
        }
        if (added > 0) localStorage.setItem('zula_suite_members_v2', JSON.stringify(result));
        localStorage.setItem(SEED_FLAG, '1');
      }
      return result;
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
    const saved = localStorage.getItem('zula_suite_sessions');
    if (!saved) return INITIAL_TEST_SESSIONS;
    try {
      const parsed = JSON.parse(saved) as TestSession[];
      if (!Array.isArray(parsed)) return INITIAL_TEST_SESSIONS;
      // Eski/kaldirilmis oyun etiketlerini gecir (orn. "Zula Mobile", "Zula")
      const VALID = ['Zula PC', 'Zula Strike', 'Wolfteam'];
      return parsed.map((s) => ({
        ...s,
        game: (VALID.includes(s.game) ? s.game : 'Zula PC') as TestSession['game'],
      }));
    } catch {
      return INITIAL_TEST_SESSIONS;
    }
  });

  const [logs, setLogs] = useState<ActivityLog[]>(() => {
    const saved = localStorage.getItem('zula_suite_logs');
    return saved ? JSON.parse(saved) : INITIAL_LOGS;
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

  // --- Paylasilan uye deposu (Google Sheets) -------------------------
  // Backend kapaliysa sessizce devre disi kalir; yerel akis calisir.

  // 1) Acilista sunucudan listeyi al (yoksa yerel veri korunur)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const remote = await fetchRemoteMembers();
      if (cancelled || !remote || remote.length === 0) return;
      // Yerelde ayni kayit varsa onun sifresi korunur (sunucu hash saklar)
      const localById = new Map(members.map((m) => [m.id, m]));
      const merged = remote.map((r) => {
        const local = localById.get(r.id);
        return local?.password ? { ...r, password: local.password } : r;
      });
      setMembers(merged);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2) Uye listesi degisince sunucuya gecit yaz
  useEffect(() => {
    const timer = setTimeout(() => {
      void pushRemoteMembers(members);
    }, 2500);
    return () => clearTimeout(timer);
  }, [members]);

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
  const currentUser = currentUserId
    ? members.find((m) => m.id === currentUserId) ?? null
    : null;

  const isAdmin = currentUser?.role === 'super_admin' || currentUser?.role === 'company_manager';

// Performans duzenleme izni: admin VEYA "performance" bolum yetkisi olan herkes
// (bolumunu menude gormesi yeterli degil, gercekten duzenleyebilmesi de gerekir)
const canEditPerformance = isAdmin || (currentUser?.permissions?.includes('performance') ?? false);

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

  const handleLogin = (member: Member) => {
    setCurrentUserId(member.id);
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
    setCurrentUserId(null);
    setCurrentTab('dashboard');
  };

  // Oturum yoksa login ekranını göster
  if (!currentUser || currentUser.status === 'Pasif' || allowedTabs.length === 0) {
    return <LoginScreen members={members} onLogin={handleLogin} />;
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
    setMembers((prev) => [m, ...prev]);
    const newLog: ActivityLog = {
      id: 'log-' + Date.now(),
      actor: currentUser?.fullName || 'Sistem',
      action: 'Yeni personel eklendi: ' + m.fullName + ' (' + m.tagId + ')',
      category: 'User',
      memberId: m.id,
      timestamp: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
    };
    setLogs((prev) => [newLog, ...prev]);
  };

  const handleUpdateMember = (m: Member) => {
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
  };

  const handleDeleteMember = (id: string) => {
    const target = members.find((m) => m.id === id);
    setMembers((prev) => prev.filter((item) => item.id !== id));
    setPerformances((prev) => prev.filter((p) => p.memberId !== id));
    if (target) {
      const newLog: ActivityLog = {
        id: 'log-' + Date.now(),
        actor: currentUser?.fullName || 'Sistem',
        action: 'Personel silindi: ' + target.fullName + ' (' + target.tagId + ')',
        category: 'User',
        timestamp: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
      };
      setLogs((prev) => [newLog, ...prev]);
    }
  };

  // Google Sheets'ten gelen veriyi panele yazar
  const handleSheetsImport = (payload: {
    members: Member[];
    performances: Performance[];
    summary: string;
  }) => {
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
    setSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status } : s))
    );
  };

  // Test oturumu duzenleme (baslik, surum, oyun, tarih, durum)
  const handleUpdateSession = (id: string, patch: Partial<TestSession>) => {
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
  const activeTab = allowedTabs.includes(currentTab as PermissionId) ? currentTab : allowedTabs[0];

  // Rol adini roller listesinden cek (yeni roller de dogru gosterilsin)
  const roleName = roles.find((r) => r.id === currentUser.role)?.name ?? currentUser.role;

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100 selection:bg-indigo-500 selection:text-white">
      {/* Sidebar */}
      <Sidebar
        currentTab={activeTab}
        onSelectTab={setCurrentTab}
        allowedTabs={allowedTabs}
        currentUser={currentUser}
        isAdmin={isAdmin}
        onLogout={handleLogout}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Header Bar */}
        <header className="h-16 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md px-8 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Panel</span>
            <span className="text-slate-600">/</span>
            <span className="text-xs font-bold text-white capitalize">
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
                : activeTab === 'settings'
                ? 'Ayarlar & Roller'
                : 'Yetki Rolleri'}
            </span>
          </div>

          <div className="flex items-center gap-4">
            {simulating && (
              <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs">
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
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-slate-300 font-medium">Sistem Çevrimiçi</span>
            </div>

            <div className="flex items-center gap-3 pl-2 border-l border-slate-800">
              <div className="text-right hidden sm:block">
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
        <main className="p-6 sm:p-8 flex-1">
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
              teamFilter={null}
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
              teamFilter={academyFilter}
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
              teamFilter={refereeFilter}
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
              onAddSession={handleAddSession}
              onUpdateStatus={handleUpdateSessionStatus}
              onUpdateSession={handleUpdateSession}
              onDeleteSession={handleDeleteSession}
            />
          )}

          {activeTab === 'reports' && <ReportsView members={members} performances={performances} />}

          {activeTab === 'roles' && <RolesView roles={roles} members={members} />}

          {activeTab === 'logs' && <LogsView logs={logs} members={members} />}

          {activeTab === 'sheets' && (
            <SheetsView
              members={members}
              performances={performances}
              onApplyImport={handleSheetsImport}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsView
              members={members}
              roles={roles}
              onAddRole={handleAddRole}
              onUpdateRole={handleUpdateRole}
              onDeleteRole={handleDeleteRole}
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

