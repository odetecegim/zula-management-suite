# Zula Management Suite
## Ürün Tasarım Belgesi (Product Design Document)

**Versiyon:** 2.0.0
**Durum:** Canlı / Üretim
**Yazar:** Hüseyin Çalışkan (`@odetecegim`)
**Tarih:** 13.10.2026
**Lisans:** Proprietary · MadByte Games

---

## 1. Genel Bakış

**Zula Management Suite**, Zula geliştirme ekibi (MadByte Games) tarafından
yürütülen **test, akademi ve hakem kadrosu** için tasarlanmış web tabanlı
yönetim panelidir. Test ekibi üyelerinin katılımlarını, hata bildirimlerini,
hakemlik maç kayıtlarını, Discord yönetişim işlemlerini ve yönetici
değerlendirmelerini tek merkezde toplar; çok katmanlı puanlama formülüyle
her üyenin "performans puanını" otomatik hesaplar, sıralar ve Excel/CSV olarak
dışa aktarabilir.

Panel, veriyi **Google Sheets** tablosunda (paylaşılan tek kaynak) saklar;
tarayıcıda `localStorage` ile oturum ve önbellekleme yapar. Frontend React
ile sunulan statik bir uygulamadır; veriyi işleyen Google Sheets API
serverless fonksiyonlarla (`/api/sheets/*`) çalışır.

**Hedef kullanıcı:** Test ekibi üyeleri, akademi yöneticileri, hakem heyeti,
Şirket yöneticisi ve kurucu (süper admin).

**Temel amaçlar:**
1. Test katılım ve hata/öneri bildirimlerini standart ve şeffaf şekilde
   takip etmek.
2. Hakemlik maçlarını "Herkes Tek" (x2000) ve "Takımlı/Sabotaj" (x5000)
   kategorilerine göre otomatik puanlamak.
3. Disiplin/yardım işlemlerini (Discord timeout, ban, mesaj silme) puanlamaya
   yansıtmak.
4. Herkes tarafından görülebilir, denetlenebilir, Excel çıktıları üreten rapor
   sistemi sunmak.
5. Rol bazlı bölüm erişimiyle güvenlikli çok seviyeli panel yönetimi.

---

## 2. Teknoloji ve Dağıtım

| Katman | Teknoloji | Açıklama |
|---|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4 | SPA, dark tema, responsive |
| UI Bileşenleri | Lucide Icons, Tailwind utility sınıfları | Minimal, ikon tabanlı |
| Çeviri | react-i18next, i18next-browser-languagedetector | TR/EN/PT/ES |
| API | Vercel serverless functions (Node.js 24) | `/api/sheets/*` uçları |
| Veri deposu | Google Sheets API (servis hesabı) | Paylaşılan master tablo |
| Kimlik | Sunucu tarafı oturum belirteci (`x-session-token`) | scrypt şifre doğrulama |
| Dağıtım | Vercel (Hobby/Pro), altsat domain `zula-teskilat.vercel.app` | — |

### Kurulum
```bash
npm install            # bağımlılıkları yükle
npm run dev            # frontend -> http://localhost:5173
npm run server         # API -> http://localhost:8787
npm run dev:all        # ikisi birlikte
npm run build          # dist/
npm start              # API + derlenmiş panel bir arada
```

### Ortam değişkenleri
| Değişken | Zorunlu | Açıklama |
|---|---|---|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Evet (Secret) | Tek satır JSON, sunucu tarafında saklanır |
| `GOOGLE_REFRESH_TOKEN` | Evet (Secret) | OAuth refresh token |
| `SESSION_SECRET` | Evet (Secret) | Oturum belirteci imzalama |
| `PORT` | Hayır | Varsayılan 8787 |
| `VITE_API_BASE_URL` | Hayır | Aynı origin için boş bırakılır |

> ⚠️ Şifreler düz metin `localStorage`'da tutulur. Gerçek yayında şifreler
> backend'de hash'lenmelidir (scrypt). Canlıya almadan önce kurucu
> şifresi (`admin123`) mutlaka değiştirilmelidir.

---

## 3. Kullanıcı Rolleri ve Yetkiler

### 3.1 Rol Hiyerarşisi

Panel, hiyerarşik rol yapısıyla çalışır: **üst seviye bir yönetici, sadece
kendi seviyesinden DÜŞÜK rollü üyeleri düzenleyebilir**.

| Rol | Seviye | Açıklama |
|---|---|---|
| `super_admin` (Süper Yönetici) | 100 | Tüm yetkiler, tüm üyeleri yönetebilir |
| `company_manager` (Şirket Yöneticisi) | 90 | Operasyon ve ekip koordinatörü |
| `company_staff` (Şirket Çalışanı) | 80 | Yönetim kadrosu |
| `academy_lead` (Akademi Şefi) | 70 | Akademi ve fedai kadrosu yöneticisi |
| `referee_lead` (Baş Hakem) | 70 | Hakem heyeti yöneticisi |
| `academy_member` (Akademi Üyesi) | 60 | QA testçisi |
| `fedai_member` (Fedai Üyesi) | 60 | Topluluk temsilcisi |
| `referee` (Hakem) | 60 | Maç hakemi |
| Özel roller (sonradan eklenen) | 30 (varsayılan) | Admin tarafından tanımlanır |

### 3.2 Sistem Kayıtlarına Erişim (`canViewLogs`)

Sistem kayıtlarını görebilenler:
- **Şirket kadrosu** (`super_admin`, `company_manager`, `company_staff`) — rol bazlı otomatik erişim
- **'logs' izni verilmiş herhangi bir rol** — izin bazlı esnek genişleme

### 3.3 Salt-Okunur Rollerler

`academy_lead`, `academy_member`, `fedai_member` rolleri **sadece görüntüler**:
üye ekleme/düzenleme/silme, performans puanı girişi, test oturumu yönetimi,
rol ve ayar değişiklikleri kapatılır.

### 3.4 12 Bölüm İzi (Permission Matrix)

| İzin Kodu | Bölüm | Açıklama |
|---|---|---|
| `dashboard` | Genel Bakış | Panel özeti, metrikler, sistem hareketleri |
| `members` | Üye & Personel Listesi | Tüm üyeler: ekleme, düzenleme, silme |
| `performance` | Performans Yönetimi | Aylık puan girişi, test günü, hakemlik kaydı |
| `reports` | Performans Raporları | Sıralamalar, Excel/CSV dışa aktarma |
| `academy` | Akademi Üyeleri | Akademi ve fedai ekibi listesi |
| `referees` | Hakem Üyeleri | Hakem heyeti ve gözlemci listesi |
| `roles` | Rol & Yetkilendirme | Rol tanımları ve atanan üyeler |
| `logs` | Sistem Kayıtları | Tüm işlem geçmişi ve arama |
| `tests` | Test Oturumları | Oturum oluşturma ve durum yönetimi |
| `settings` | Ayarlar & Roller | Rol simülasyonu ve rol/izin yönetimi |
| `sheets` | Google Sheets | Tablodan veri çekme, Toplam/QA hesaplama |
| `slack` | Slack Bildirimleri | Kanal test mesajı gönderme |

Varsayılan rol izinleri `src/data/initialData.ts` dosyasında tanımlıdır; her rol
için bölüm bazlı izin seti belirlenmiştir.

---

## 4. Fonksiyonel Özellikler

### 4.1 Genel Bakış (Dashboard)

- Toplam/aktif üye sayısı, toplam hata bildirimi sayısı
- Ortalama katılım puanı ve verimlilik etiketi (Yüksek ≥90 / İyi ≥70 /
  Gelişime Açık ≥40 / Düşük <40)
- Devam eden / tamamlanan / planlanan test oturumu sayısı
- Bölge şampiyonları (TR/EU/LATAM için aylık en yüksek puanlı üye)
- Oyun dağılımı (Zula PC / Zula Strike / Wolfteam) ve bölge dağılımı
- Son sistem hareketleri (sadece şirket kadrosu ve 'logs' izni olanlar görür)
- En iyi 4 testçi listesi

### 4.2 Üye & Personel Listesi

- Tüm üyeleri görüntüleme (filtreleme: takım, rol, oyun, bölge, durum)
- Üye ekleme (full name, nick, playerId, discordTag, email, game, region, role,
  status, tagId otomatik `ZULA-###`)
- Üye düzenleme ve silme (silme Google Sheets'ten kalıcı silme)
- Panel girişi ve erişim yetkileri: kullanıcı adı, şifre, bölüm izinleri
- Aktif/Pasif/İncelemede durumu ve pasifleştirme gerekçesi
- Akademi ve Hakem filtreleri: akademi kaptanı, QA testçileri, fedai,
  baş hakem, gözlemciler
- Sosyal medya bağlantıları (Instagram, GitHub, TikTok, Discord)
- Google Sheets'ten senkronize etme ve panele aktarma

### 4.3 Performans Yönetimi

**Aylık performans kaydı:**

| Alan | Açıklama |
|---|---|
| `testParticipation` | Test katılım sayısı (0–30, gün bazlı çarpanlı seri) |
| `testDays` | Test katılım günleri (1–31) |
| `bugReports` | Hata bildirimi sayısı |
| `suggestions` | Öneri bildirimi sayısı |
| `refereeMatches` | Hakemlik maç sayısı (toplam) |
| `refereeDays` | Gün → maç sayısı detayı |
| `qaReviews` | QA inceleme sayısı |
| `discordActions` | Discord uzaklaştırma/ban/silme toplamı |
| `supportPoints` | Support puanı (sınırsız) |
| `managerScore` | Yönetici puanı (sınırsız) |
| `managerOpinion` | Yönetici görüşü puanı (sınırsız) |
| `notes` | Serbest metin not |

**Test katılım:** Seçilen test günlerine **çarpan serisi** girilebilir
(`01x2, 13x2` — her gün 2 puan). Toplam, `testDays.length + çarpanlı girişler`
olmak üzere **maksimum 30** ile sınırlıdır.

**Hakemlik kaydı:** Her hakemlik için **gün, maç sayısı ve tür** girilir:
- `EVERYONE` (Herkes Tek) → x2000
- `TEAM` (Takımlı) → x5000
- `SABOTAGE` (eski veri, Takımlı olarak okunur)

### 4.4 Performans Raporları

- Tüm üyeleri puan sırasına göre sıralama
- Dönem seçimi (mevcut ay + önceki aylar)
- Excel/CSV dışa aktarma
- Performans detay ekranı (kalem kalem puan breakdown)

### 4.5 Akademi & Hakem Üyeleri

- Akademi ekibi (akademi kaptanı, QA testçileri, fedai)
- Hakem heyeti (baş hakem, hakemler, gözlemciler)
- Ayrı listeler ve filtreler, rol bazlı görünür

### 4.6 Rol & Yetkilendirme

- Rol tanımları: ad, rozet rengi, açıklama, bölüm izinleri
- Rol oluşturma, düzenleme, silme, sıralama (yer değiştirme)
- Rol simülasyonu: hangi rolde girildiğinde ne görünür, test edilebilir
- Hiyerarşik izin kontrolü (`canManageMember`)

### 4.7 Sistem Kayıtları (Logs)

- Tüm işlem geçmişi: üye ekleme/düzenleme/silme, performans girişi,
  oturum oluşturma, rol değişiklikleri
- Kategori bazlı filtreleme (User, Performance, Role, System)
- Arama ve timestamp sıralama
- Sadece şirket kadrosu ve 'logs' izni olanlar görür

### 4.8 Test Oturumları

- Oturum oluşturma: başlık, versiyon, oyun, tarih, durum
- Durum yönetimi: Planlandı / Devam Ediyor / Tamamlandı
- Katılımcı listesi (`participants`) ve hata bildirimleri
- Katılımcı üye kimlikleri ile detaylı takip
- Her yeni oturum sistem kaydına düşer

### 4.9 Ayarlar & Google Sheets

- Servis hesabı kimlik bilgileri yapılandırması
- Tablo ID ve range ayarları (`A1:Z2000`)
- Alan etiketleri (kolon başlıkları) ve otomatik sütun eşleştirme önerisi
- Çoklu sekme (sayfa) desteği: her sekme ayrı bir dönem (Ağustos 2026 vb.)
- **Sayfaları Listele → Seç → Çek ve İşle → Panele Aktar** akışı
- Toplam ve QA sütunlarını hesaplama ve tabloya geri yazma
- Bağlantı testi ve sağlık durumu

### 4.10 Slack Bildirimleri

İki mod:

1. **Bot modu:** Slack API `auth.test` + `conversations.list` ile kanal listesi;
   botun görebildiği kanallara mesaj gönderme.
2. **Webhook modu:** Tek sabit kanala mesaj gönderme.

Uçlar:
- `POST /api/sheets/slack-check` — token tanılama (mesaj göndermez)
- `POST /api/sheets/slack-test` — gerçek test mesajı (yetki gerekli)
- `POST /api/sheets/slack-notify` — serbest metin bildirim
- `GET /api/sheets/slack-channels` — kanal listesi

Kullanıcı olay bildirimleri (eklendi/güncellendi/silindi) Slack kanalına
otomatik gönderilebilir.

### 4.11 Dil Desteği

- **Türkçe** (TR) — tam çeviri
- **İngilizce** (EN) — tam çeviri
- **Portekizce** (PT) — tam çeviri
- **İspanyolca** (ES) — tam çeviri
- Otomatik dil algılama (`navigator` + `localStorage`)
- Pasif dil eklentisi: `enabled: false` ile dil listesinde görünür ama çeviri
  yoksa Türkçe fallback kullanılır

---

## 5. Veri Modeli

### 5.1 Ana Yapılar

```
RoleDef: { id: RoleId, name, badgeColor, description, permissions: PermissionId[] }
Member:  { id, tagId, fullName, gameNickname, playerId, discordTag, email,
           game: GameType, region: RegionType, role: RoleId, status: StatusType,
           joinDate, participationScore, bugReportsCount, notes,
           username, password, permissions, deactivationReason?, statusChangedAt? }
ActivityLog: { id, memberId?, userId?, actor, action, category, timestamp }
SessionBug:  { id, reporterId?, title, severity, status, date, notes? }
TestSession: { id, title, version, game, date, status, participantsCount,
              reportedBugs, participants?, bugs? }
RefDayEntry: { day: number, count: number }
PerfEntry:   { id, day: number, multiplier: number }
RefPerfEntry: { id, day, multiplier, type: 'EVERYONE' | 'TEAM' | 'SABOTAGE' }
Performance: { memberId, period, testParticipation, testDays, bugReports,
              suggestions, refereeMatches, refereeDays, qaReviews,
              discordActions, notes, participationEntries?, participationDetails?,
              refereeEveryoneX?, refereeTeam?, refereeSabotage?, refereeEntries?,
              discordTimeout?, discordBan?, discordMessageDelete?,
              managerScore?, managerOpinion?, supportPoints? }
SheetRow:    { excelRow, name, tagId, nickname, game, region, role, status,
              testParticipation, bugReports, suggestions, base, qa, support,
              referee, managerScore, managerOpinion, details[], detailsText,
              period?, sheet? }
SheetWarning:{ row, level: 'info' | 'warn', message }
SheetTotals: { rows, base, qa, support, referee, bugs, suggestions, testDays }
```

### 5.2 Tipler

- `GameType`: `Zula PC` | `Zula Strike` | `Wolfteam`
- `RegionType`: `TR` | `EU` | `LATAM`
- `StatusType`: `Aktif` | `Pasif` | `İncelemede`
- `SeverityType`: `Düşük` | `Orta` | `Yüksek` | `Kritik`
- `BugStatusType`: `Açık` | `İnceleniyor` | `Çözüldü`
- `ScoreLineKind`: `base` | `total` | `score`

---

## 6. Puanlama Formülü

### 6.1 QA Tabanı

```
Toplam = Test Katılımı + Hata Bildirimi + Öneri Bildirimi
QA Puanı = Toplam × 1000
```

- Test Katılımı: gün sayısı (çarpanlı seri ile)
- Hata Bildirimi: adet
- Öneri Bildirimi: adet
- **Toplam ara toplamdır, puana tekrar eklenmez** (çift sayma önlenir)

### 6.2 Hakem Performansı

Detay girişiyle bağımsız; toplam hakemlik üzerinden hesaplanır:

```
Hakem Puanı = (Herkes Tek sayısı × 2000) + (Takımlı sayısı × 5000)
```

- Eski "Sabotaj" türü Takımlı olarak okunur.
- Günlük/maç kırılımı sadece bilgi amaçlıdır, puana etki etmez.

### 6.3 Discord İşlemleri

```
Discord Puanı = (Timeout × 25) + (Ban × 25) + (Mesaj Silme × 10)
```

Granüler giriş yoksa `discordActions × 10` kullanılır.

### 6.4 Genel Puan

```
Genel Puan = QA Puanı + Support + Hakem Performansı + Discord İşlemleri
             + QA İncelemesi + Yönetici Puanı + Yönetici Görüşü
```

| Kalem | Katsayı | Sınır |
|---|---|---|
| Test Katılımı | gün × çarpan | max 30 |
| Hata Bildirimi | 1:1 | — |
| Öneri Bildirimi | 1:1 | — |
| QA Puanı | ×1000 | — |
| Support | 1:1 | Sınırsız |
| Herkes Tek Hakem | ×2000 | — |
| Takımlı Hakem | ×5000 | — |
| Timeout | ×25 | — |
| Ban | ×25 | — |
| Mesaj Silme | ×10 | — |
| QA İncelemesi | 1:1 (0 puan, gösterim) | — |
| Yönetici Puanı | 1:1 | Sınırsız |
| Yönetici Görüşü | 1:1 | Sınırsız |

`scoreBreakdown()` çıktısındaki her satır `base` · `total` · `score` türündedir;
`calculateScore()` yalnızca `score` satırlarını toplar.

---

## 7. Mimari

```
┌─────────────────────────────────────────────────────────────┐
│                     Browser (React SPA)                      │
│  LoginScreen → App (Auth) → Sidebar + View Component         │
│  - localStorage: session token, member cache                  │
│  - i18n: TR/EN/PT/ES                                            │
└────────────────────────────┬────────────────────────────────┘
                             │ HTTPS
┌────────────────────────────▼────────────────────────────────┐
│              Vercel Serverless Functions                     │
│  /api/sheets/* (Google Sheets API)                           │
│  - login (scrypt doğrulama)                                  │
│  - members: list, create, update, delete                     │
│  - sheets: status, test, headers, sheets, fetch, write       │
│  - slack: check, test, notify, channels                      │
│  - session token: x-session-token header                     │
└────────────────────────────┬────────────────────────────────┘
                             │ Google Sheets API
┌────────────────────────────▼────────────────────────────────┐
│              Google Sheets (Master Tablo)                    │
│  - tek kaynak (single source of truth)                       │
│  - çoklu sekme: her sekme bir dönem                          │
│  - otomatik Toplam/QA hesaplama                              │
└─────────────────────────────────────────────────────────────┘
```

### 7.1 Yönlendirme Katmanı

- Frontend, API'leri göreceli `/api/sheets/*` yoluyla çağırır (aynı origin).
- `VITE_API_BASE_URL` yalnızca backend başka bir yere taşınacaksa gerekir.
- Yerel gelişmede `server/index.js` Express sunucusu `PORT` üzerinde dinler.

### 7.2 Oturum Yönetimi

1. Kullanıcı kimlik bilgilerini gönderir (`POST /api/sheets/login`).
2. Sunucu `scrypt` ile şifreyi doğrular, `ACCOUNT_INACTIVE` (403) ve
   `LOCKED` (429) durumlarını döner.
3. Başarılı ise sunucu oturum belirteci döner; istemci `x-session-token`
   headers'ine ekler.
4. Belirteç `SESSION_SECRET` ile imzalanır; her POST isteği zorunludur.
5. Session süresi dolduğunda `onSessionExpired` ile oturum sonlandırılır.

### 7.3 Hata Yönetimi ve Zaman Aşımı

- Backend kapalıyken panel yerel veriyle devam eder (offline-first).
- **Yazma istekleri: 25s**, **okuma istekleri: 20s** (serverless cold start
  nedeniyle 8s yetmiyor).
- Hatalar kullanıcıya anlatılır; session belirteci otomatik silinmez (401
  döngüsü önlenir).
- Son hata mesajı `getLastSyncError()` ile panelde gösterilir.

### 7.4 Build Cache Sorunu ve Çözümü

Vercel production build'inde kaynak commit'e değil **yüklü config/hash'e**
göre cache anahtarı belirleniyor; config değişmediği sürece her deployment
ilk deploy'in output'unu geri yüklüyor. Çözüm:

1. **Production Cache Temizleme** (Vercel dashboard → Settings → Build &
   Development → Clear Cache).
2. **Package versiyon bump** (`0.0.0` → `0.1.0`) — cache anahtarını değiştirir.
3. `vercel.json` env marker alanı veya `--no-cache` bayrağı kullanımı.
4. Preview deployment (build cache etkilenmez) ile doğrulama.

---

## 8. Güvenlik

| Risk | Durum | Not |
|---|---|---|
| Şifreler düz metin | ⚠️ Prototype | `localStorage`; yayında backend hash'lenmeli |
| Servis hesabı anahtarı | ✅ .gitignore | Sadece sunucu tarafında `process.env` |
| Oturum belirteci | ✅ HTTPS + `x-session-token` | Her POST isteğinde zorunlu |
| Şifre doğrulama | ✅ scrypt sunucu tarafı | Düz şifre istemciye dönmez |
| Rol bazlı erişim | ✅ `ROLE_LEVELS` hiyerarşi | Üst rol sadece alt rolü yönetir |
| salt-okunur roller | ✅ `isReadOnlyRole` | Görüntüleme sınırlaması |
| CSRF / CORS | — | Aynı origin kullanımı |

**Kurucu hesap kalıcılığı:** `huseyin`/`admin123` hesabı `src/App.tsx` içinde
her açılışta sabitlenir; tarayıcı verisi bozulsa bile giriş her zaman çalışır.

**Veri yedekleme:** Google Sheets tek kaynak olduğundan tablo yedeği alınmalıdır.

---

## 9. Geliştirme ve Dağıtım

### 9.1 Yerel Geliştirme

```bash
npm run dev:all      # frontend + backend birlikte
```

### 9.2 Production (Vercel)

1. Repo → Vercel → Blueprint
2. Secrets: `GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_REFRESH_TOKEN`,
   `SESSION_SECRET`
3. Build komutu otomatik `npm run build`
4. Deploy → prod alias `zula-teskilat.vercel.app`

### 9.3 Render Alternatifi

`render.yaml` hazır; frontend Vercel'de, `VITE_API_BASE_URL` ile backend'i
gösterir. Ücretsiz plan 15 dk hareketsizlikte kapanır.

### 9.4 Ücretsiz Plan Sınırları

| Servis | Sınır |
|---|---|
| Vercel Hobby | 100 GB/ay bant, serverless fonksiyonlar dahil |
| Google Sheets API | Ücretsiz kotasyon (dakikada 60 istek) |

Her ikisi de kişisel kullanım için fazlasıyla yeterlidir.

---

## 10. Dizin Yapısı

```
zula-management-suite/
├── api/
│   └── sheets/[[...route]].js   Vercel serverless function
├── server/
│   ├── route-handler.js         ORTAK API yönlendiricisi
│   ├── sheets-service.js        Google auth, okuma/yazma, sütun eşleştirme
│   └── index.js                 Express sunucusu (yerel kullanım)
├── scripts/
│   └── dev-all.js               backend + frontend birlikte
├── src/
│   ├── components/              Dashboard, Members, Performance, Reports,
│   │                              Logs, Roles, Settings, TestSessions,
│   │                              LoginScreen, SheetsView, SlackConfigView,
│   │                              SessionDetailModal, LanguageSelectionOverlay
│   ├── data/
│   │   └── initialData.ts       Tohum veriler + rol/izin tanımları
│   ├── i18n/                    tr.ts, en.ts, pt.ts, es.ts
│   ├── lib/
│   │   ├── time.ts              Puanlama ve dönem fonksiyonları
│   │   ├── roles.ts             Hiyerarşi, izin kontrolü
│   │   ├── sheets.ts            Google Sheets istemcisi
│   │   ├── slack.ts             Slack bildirim istemcisi
│   │   ├── members-api.ts       Üye API istemcisi
│   │   └── session-token.ts     Oturum belirteci yönetimi
│   ├── types/
│   │   └── index.ts             Ortak TypeScript tipleri
│   ├── App.tsx                  Ana uygulama + auth
│   ├── main.tsx                 Giriş noktası
│   └── data/initialData.ts
├── vercel.json                  Vercel yapılandırması
├── render.yaml                  Render alternatifi
└── package.json                 Bağımlılıklar + scriptler
```

---

## 11. Sürüm Geçmişi

| Sürüm | Tarih | Değişiklik |
|---|---|---|
| v2.0 | 28.09.2026 | Zula Test Yönetim Platformu sıfırdan konuşlandırıldı |
| v2.1 | — | Silah denge test oturumu eklendi |
| v2.15 | — | Hakem modu: Herkes Tek (x2000) + Takımlı (x5000) |
| v2.16 | — | testParticipation = test günleri + çarpanlı girişler (max 30) |
| v2.17 | — | 'logs' izni tabanlı sistem kaydı erişimi + logout simülasyon temizliği |
| v2.18 | 13.10.2026 | Package versiyonu 0.0.0 → 0.1.0 (cache invalidasyon) |

---

## 12. Gelecek Geliştirmeler (Roadmap)

1. Backend veritabanına geçiş (PostgreSQL) — cihazlar arası eşzamanlı kullanım
2. Şifre hash'leme (bcrypt/scrypt) yaygın kullanımı
3. İki faktörlü doğrulama (2FA)
4. Toplu üye yükleme (Excel import)
5. Otomatik rapor üretimi ve e-posta dağıtımı
6. API anahtarlı harici entegrasyonlar (Discord bot, Steam API)
7. Dark/light tema switcher
8. Audit log dışa aktarma

---

*Bu belge Zula Management Suite v2.x için hazırlanmıştır. Son güncelleme: 13.10.2026*

