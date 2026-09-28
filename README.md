# Zula Suite — Test & Topluluk Yönetim Paneli

React 19 + TypeScript + Vite + Tailwind CSS v4 ile yazılmış, Zula test ekibi /
akademi / hakem performans yönetim paneli. Veriler `localStorage` üzerinde
saklanır (demo/prototip).

**Geliştirici:** Hüseyin Çalışkan · **@odetecegim**

---

## Kurulum ve Çalıştırma

```bash
npm install
npm run dev        # panel  -> http://localhost:5173
npm run server     # Google Sheets API  -> http://localhost:8787
npm run dev:all    # ikisini birlikte başlatır
```

Üretim derlemesi:

```bash
npm run build      # dist/
npm start          # API + derlenmiş paneli birlikte sunar
```

---

## Giriş Hesapları

Panel giriş ekranında **hiçbir hazır hesap gösterilmez** (site herkese açık
olduğu için kullanıcı adları ve şifreler ekrana basılmaz).

| Rol | Kullanıcı adı | Şifre | Erişim |
|---|---|---|---|
| Süper Yönetici | `huseyin` | `admin123` | tüm bölümler |
| Akademi Kaptanı | `burak` | `burak123` | Genel Bakış, Akademi, Performans, Testler, Raporlar |
| Baş Hakem | `can` | `can123` | Genel Bakış, Hakemler, Performans, Testler |
| Kıdemli QA | `lucas` | `lucas123` | Genel Bakış, Akademi, Hakemler, Testler, Raporlar |
| Topluluk Moderatörü | `elena` | `elena123` | Genel Bakış, Akademi, Üyeler |

> ⚠️ **Canlıda kullanmadan önce şifreleri değiştirin.** Yönetici
> bilgilerini giriş yaptıktan sonra **Üye & Personel Listesi → Düzenle →
> Panel Girişi & Erişim Yetkileri** bölümünden güncelleyebilirsiniz.
> Şifreler düz metin `localStorage`'da tutulduğu için, internet üzerinden
> gerçek kullanım öncesi bir backend + hash'li şifre önerilir.

Giriş; kullanıcı adı, üye kodu (`ZULA-001`) veya e-posta ile yapılabilir.

### Panel yetkileri

Admin (veya `super_admin` / `company_manager` rolü) üye eklerken her üyeye:

* **kullanıcı adı + şifre** tanımlar,
* **bölüm erişimlerini** (11 bölüm) tek tek seçer.

Yetki verilmeyen bölümler kullanıcının menüsünde görünmez. Rol hiyerarşisi
(`getRoleLevel`) sayesinde üst seviye olmayan bir yönetici, kendi seviyesinden
yüksek/eşit rollü üyeleri düzenleyemez.

---

## QA Puanlama Formülü

```
Toplam = Test Katılımı + Hata Bildirimi + Öneri Bildirimi
QA     = Toplam × 1000
```

Genel puan = `QA + Support + Hakem Performansı + Discord İşlemleri
+ Yönetici Puanı + Yönetici Görüşü`

| Kalem | Puanlama |
|---|---|
| Test Katılımı | gün sayısı (çarpanlı seri ile) |
| Hata Bildirimi | adet |
| Öneri Bildirimi | adet |
| **Toplam** | ara toplam — puana **tekrar eklenmez** |
| **QA Puanı** | `Toplam × 1000` |
| Support | birebir, **sınırsız** |
| Hakem | Herkes ×2000 · Sabotaj ×5000 (yoksa maç ×750) |
| Discord | Timeout ×25 · Ban ×25 · Mesaj silme ×10 |
| Yönetici Puanı / Görüşü | birebir, **sınırsız** |

> `scoreBreakdown()` çıktısındaki her satır `base` · `total` · `score` türündedir.
> `calculateScore()` yalnızca `score` satırlarını toplar — böylece "Toplam"
> ne ekranda kaybolur ne de çift sayılır.

---

## Google Sheets Entegrasyonu

Panel, veriyi bir Google Sheets tablosundan çekip **işler**:
`Toplam` ve `QA` sütunlarını yeniden hesaplar, `Detay` sütunundaki
"gün × çarpan" serisini ayrıştırır ve sonuçları panele aktarır.

### Birden fazla sayfa (sekme) desteği

Dosyada **birden çok sekme** varsa ve her sekme bir **ayı** temsil ediyorsa
(örn. `Temmuz`, `Ağustos 2026`, `Eylül 2026`), panel:

1. **Sayfaları Listele** → tüm sekmeleri dönemleriyle birlikte gösterir
2. İstediğiniz sekmeleri seçersiniz (varsayılan: hepsi)
3. **Sayfaları Çek ve İşle** → her sayfayı **kendi dönemine** yazar
4. **Panele Aktar** → her üye, ait olduğu aya göre performans kaydına yazılır

Dönem şu sırayla belirlenir:

| Öncelik | Kaynak | Örnek |
|---|---|---|
| 1 | Sayfadaki `Dönem` sütunu | `Eylül 2026` → `2026-09` |
| 2 | Sekme adı | `Ağustos 2026` → `2026-08` |
| 3 | Sekme adı + **Varsayılan Yıl** | `Eylül` + `2026` → `2026-09` |
| 4 | **Dönem** alanı (son çare) | `2026-09` |

Aynı dönemde aynı üye iki kez geçerse uyarı üretilir. Boş sayfalar
(`TOPLAM`, `Notlar` gibi) listede görünür; işlem dışında bırakmanız yeterli.

> 🔐 **Servis hesabı anahtarı tarayıcıya hiç taşınmaz.** Tüm Google istekleri
> sunucu tarafında yapılır (Vercel'de serverless function, yerelde Express).

### 1) Google Cloud projesi

1. [Google Cloud Console](https://console.cloud.google.com) → yeni proje
2. **APIs & Services → Library** → *Google Sheets API* → **Enable**
3. **APIs & Services → Credentials**
4. **Create credentials → Service account**
5. Oluşan **JSON** dosyasını indirin
6. **Service account** sayfasından **E-posta adresini** kopyalayın

### 2) Tabloyu paylaşın

Google Sheets dosyasını açın → **Paylaş → E-posta ile paylaş** →
servis hesabının e-postasını ekleyin → **Okuyucu** (veya Düzenleyici, tabloya
geri yazacaksanız) yetkisi verin.

### 3) Kimlik bilgisi (yerelde çalışırken)

```bash
cp server/.env.example server/.env
```

```env
GOOGLE_SERVICE_ACCOUNT_PATH=./server/service-account.json
SHEETS_RANGE=A1:Z2000
npm run server        # "Kimlik bilgisi: bulundu" yazmalı
```

JSON'u dosya olarak kullanacaksanız `.gitignore` zaten engelliyor.

### 4) Panelden bağlanın

Panel → sol menü **Google Sheets** →

1. **Spreadsheet ID veya URL** alanına tablo bağlantısını yapıştırın
   (URL'den ID otomatik çıkarılır)
2. **Aralık** → `A1:Z2000` (veya `Sayfa1!A1:Z500`)
3. **Dönem** → `2026-09` (boş bırakılırsa tablodaki Dönem sütunu kullanılır,
   o da yoksa içinde bulunulan ay)
4. **Bağlantıyı Test Et** → **Sütunları Oku** → **Veriyi Çek ve İşle**
5. Önizlemeyi kontrol edip **Panele Aktar** deyin

### Sütun eşleştirme

Başlıklar otomatik algılanır (Türkçe/İngilizce takma adlar). Gerekirse
**Sütun Eşleştirme** bölümünden elle düzeltebilirsiniz.

| Alan | Algılanan başlıklar (örnek) |
|---|---|
| Ad Soyad | `Ad Soyad`, `Ad`, `İsim`, `Name` |
| Üye Kodu | `ID`, `Kod`, `Üye Kodu`, `Tag ID` |
| Test Katılımı | `Test katılımı`, `Katılım` |
| Hata Bildirimi | `Hata bildirimi`, `Hata`, `Bug` |
| Öneri Bildirimi | `Öneri Bildirimi`, `Öneri` |
| Toplam | `Toplam` *(hesaplanan — okunmaz, yeniden üretilir)* |
| Detay | `Detay` → `01x2, 13x2,14x2, 20x2` |
| Support | `Support`, `Destek` |
| Hakem | `Hakem Performansı`, `Hakem` |
| QA | `QA` *(hesaplanan — yeniden üretilir)* |

**Zorunlu alan:** en az biri eşleşmelidir → *Ad Soyad* veya *Üye Kodu*.

### Veri işleme kuralları

* `Toplam` ve `QA` **her zaman panelde yeniden hesaplanır.** Tablodaki değerler
  farklıysa *İşleme Notları* bölümünde uyarı olarak gösterilir.
* `Detay` sütunu `gün x çarpan` serisine çevrilir; **Test Katılımı** boşsa
  değer buradan toplanır.
* `1.500` / `1,500` / `1.5` / `-` gibi değerler güvenli sayıya çevrilir.
* Dönem `2026-09`, `09.2026` veya `Eylül 2026` biçimlerini anlar.
* Panele aktarırken tabloda **olmayan** Discord ve hakem günlük kırılımları
  mevcut kayıttan **korunur**.
* Yeni üyeler "panel girişi" olmadan eklenir; giriş bilgilerini Üye Listesi'nden
  tanımlarsınız.

### Tabloya geri yazma

**Tabloya Geri Yaz** düğmesi, hesaplanan `Toplam` ve `QA` değerlerini
tablodaki ilgili sütunlara yazar (alt toplam satırına da `Toplam` yazılır).
Bunun için servis hesabının **Düzenleyici** yetkisi gerekir.

---

## API Uçları

| Metot | Yol | Açıklama |
|---|---|---|
| `GET` | `/api/health` | Sunucu sağlığı |
| `GET` | `/api/sheets/status` | Kimlik bilgisi / varsayılan tablo durumu |
| `POST` | `/api/sheets/test` | Bağlantı testi + başlık/satır sayısı |
| `POST` | `/api/sheets/headers` | Başlıkları okur, sütun eşleştirmesi önerir |
| `POST` | `/api/sheets/sheets` | Tablodaki tüm sekmeleri + dönemlerini listeler |
| `POST` | `/api/sheets/fetch` | Tek sayfayı çeker ve işler |
| `POST` | `/api/sheets/fetch-all` | Birden çok sayfayı çeker, her birini kendi dönemine işler |
| `POST` | `/api/sheets/write` | Hesaplanan değerleri tabloya geri yazar |

İş mantığı `server/route-handler.js` içindedir; hem Express sunucusu hem de
Vercel fonksiyonu aynı modülü kullanır.

---



## Deployment (100% Ücretsiz — Tek Vercel Projesi)

**Canlı adres:** https://zula-management-suite.vercel.app

Frontend **ve** backend aynı Vercel projesinde çalışır:

```
/                       -> React paneli        (statik)
/api/sheets/*           -> Serverless Function (Google Sheets)
```

Ayrı bir sunucuya, Render'a veya ücretli plana **gerek yoktur.**

### Neden Render gerekmiyor?

API, Google iş mantığını içeren küçük bir Node fonksiyonudur. Vercel bunu
`api/sheets/[[...route]].js` dosyasından **serverless** olarak çalıştırır.
Servis hesabı anahtarı Vercel'in sunucu tarafı ortam değişkeni olarak kalır,
tarayıcıya hiç taşınmaz.

> İş mantığı `server/route-handler.js` içinde **tek yerde** durur. Yerelde
> Express (`npm run server`), Vercel'de serverless aynı modülü çağırır.

### Adımlar

**1) Kodu GitHub'a gönderin**
`service-account.json` ve `.env` git'e girmiyor (`.gitignore`'da engelli).

**2) Google Cloud hazırlığı**
Yukarıdaki *Google Sheets Entegrasyonu → 1 ve 2. adımlar*'ı uygulayın:
*Google Sheets API*'yi etkinleştirin, servis hesabı oluşturun, tabloyu
paylaşın.

**3) Vercel'e bağlayın**
1. [vercel.com](https://vercel.com) → **Add New → Project** → repo'yu seçin
2. Framework **Vite** (otomatik algılanır)
3. **Environment Variables** sekmesine ekleyin:

   | Anahtar | Değer |
   |---|---|
   | `GOOGLE_SERVICE_ACCOUNT_JSON` | Servis hesabı JSON'unun **tek satır** hâli |
   | `SHEETS_SPREADSHEET_ID` | *(isteğe bağlı)* tablo ID'niz |
   | `SHEETS_RANGE` | `A1:Z2000` |

   > JSON'u **tek satıra** yapıştırın. Çok satırlı yapıştırmaya izin verin
   > (Render'ın aksine) ama tek satır her zaman güvenlidir.

4. **Deploy** → panel açılır. 🎉

### `VITE_API_BASE_URL` gerekli mi?

**Hayır.** API frontend ile aynı origin'de olduğu için göreli `/api/sheets/...`
adresi kullanılır. Değişken yalnızca **backend ayrı bir yere** taşınacaksa
gerekir (örn. yerel geliştirmede `http://localhost:8787`).

```bash
# .env.example
VITE_API_BASE_URL=     # boş bırakın = aynı origin
```

### Doğrulama (deploy sonrası)

1. Panel açılıyor ve yönetici bilgileriyle giriş yapılabiliyor
2. Sol menüde **Google Sheets** bölümü görünüyor
3. Bölümde **yeşil tik** (kimlik bilgisi bulundu) çıkıyor
4. `https://zula-management-suite.vercel.app/api/sheets/health` →
   `{"ok":true,"configured":true}`
5. **Bağlantıyı Test Et** çalışıyor

> Not: Vercel'de fonksiyon `api/sheets/*` yolunda olduğu için sağlık
> adresi `/api/sheets/health`'dir (yerelde `/api/health` de çalışır).

### Ücretsiz plan sınırları

| Servis | Sınır |
|---|---|
| Vercel Hobby | 100 GB/ay bant genişliği, serverless fonksiyonlar dâhil |
| Google Sheets API | Ücretsiz kotasyon (dakikada 60 istek) |

Her ikisi de kişisel kullanım için fazlasıyla yeterlidir. **Render'ın ücretsiz
planındaki 50 saniyelik soğuk başlangıç sorunu Vercel'de yoktur** (serverless
soğuk başlangıç ~1 saniye).

### Alternatif: Render (isterseniz)

`render.yaml` hazır durumda; [render.com](https://render.com) → **Blueprint**
→ repo. Bu durumda frontend Vercel'de, `VITE_API_BASE_URL` ile backend
adresini gösterir. Ücretsiz plan 15 dk hareketsizlikte kapanır.

### Ortam değişkenleri özeti

| Değişken | Nerede | Zorunlu |
|---|---|---|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Vercel (Secret) | ✅ |
| `SHEETS_SPREADSHEET_ID` | Vercel | hayır (panelde girilir) |
| `SHEETS_RANGE` | Vercel | hayır (varsayılan `A1:Z2000`) |
| `VITE_API_BASE_URL` | Vercel | hayır (aynı origin) |
| `CORS_ORIGIN` | — | gerekmez (aynı origin) |
| `PORT` | — | gerekmez (otomatik) |

---

## Dizin Yapısı

```
api/
  sheets/[[...route]].js  Vercel serverless function
src/
  components/     Dashboard, Members, Performance, Reports, Logs,
                  Roles, Settings, TestSessions, LoginScreen, SheetsView
  data/           initialData.ts (tohum veriler + izin tanımları)
  lib/            time.ts (puanlama), roles.ts (hiyerarşi), sheets.ts (istemci)
  types/          ortak tipler
server/
  route-handler.js    ORTAK API yönlendiricisi
  sheets-service.js   Google auth, okuma/yazma, sütun eşleştirme, işleme
  index.js            Express sunucusu (yerel kullanım)
scripts/
  dev-all.js          backend + frontend birlikte
vercel.json           Vercel ayarları
render.yaml           Render alternatifi
```

---

## Güvenlik Notları

* Bu bir **prototip**: şifreler düz metin `localStorage`'da tutulur. Gerçek
  yayında şifreler backend'de hash'lenmelidir.
* Servis hesabı anahtarı `.gitignore` ile dışlanmıştır ve yalnızca sunucu
  tarafında (`process.env`) okunur.
* `dotenv` ile yalnızca `PORT`, `SHEETS_*`, `GOOGLE_*` değişkenleri okunur.
* Panele erişim kullanıcı adı/şifre ile korunur; ancak veriler tarayıcıda
  tutulduğu için **cihazlar arası paylaşım yoktur**. Paylaşımlı kullanım için
  veriyi bir veritabanına taşımak gerekir.
