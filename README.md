# MyMultiSport

MultiSport Türkiye tesis listesini Benefit Systems public JSON datasından yükleyen, Google Maps/Places puanlarını Firebase Functions + Firestore cache üzerinden zenginleştiren mobil öncelikli web ve Android APK uygulaması.

## Google Maps & Places API Yapılandırması (MMSAI3 Projesi)

1. **Maps JavaScript API:** MMSAI3 projesinde etkinleştirildi ve otomatik API Key oluşturuldu.
2. **Places API:** Spor salonu arama özelliği için etkinleştirildi.
3. **Kotalar (Hard Cap):**
   - Maps JavaScript API: Günlük maksimum 300 Map loads (harita yüklemesi).
   - Places API / Text Search: Günlük maksimum 50 Requests (istek).
4. **Bütçe Uyarısı:** "MMSAI3 Maps API Butce Uyarisi" adıyla ₺100 bütçe oluşturuldu. Bütçe %50, %90 ve %100 dolduğunda e-posta uyarısı gönderilecektir.
5. **Secret / Ortam Değişkenleri:** API Key, AI Studio'ya `GOOGLE_MAPS_PLATFORM_KEY` secret'ı olarak kaydedildi ve uygulama otomatik olarak yeniden derlendi.

## Local Web

```bash
npm install
npm run dev
```

Tesis datası `npm run sync:facilities` ile `https://benefitsystems.com.tr/facilities-tr.json` kaynağından yenilenir. `npm run build` öncesinde otomatik çalışır.
Sync işlemi ayrıca `public/data/facility-changes.json` dosyasına son anlamlı tesis değişim özetini yazar; uygulamadaki "Yenilikler" paneli bu statik dosyadan beslenir.

## İlk Ürün Geliştirmeleri

- Görsel sistem premium, sade ve operasyonel bir tesis keşif arayüzüne taşındı.
- Tesis detay paneli; tüm aktiviteler, kartlar, olanaklar, indirimler, adres ve harita/MultiSport linklerini gösterir.
- Favori, "gitmek istiyorum", "gittim" ve kişisel notlar sadece cihazdaki `localStorage` içinde tutulur.
- Kullanıcı yorumu, Firebase Auth ve Firestore kullanıcı yazmaları bu sürümde yoktur; ek moderasyon veya API maliyeti doğurmaz.
- Kart tipi, fotoğraflı tesis, uluslararası ziyaret, aktif tesis ve kişisel liste filtreleri eklendi.
- "Önerilen" sıralama client tarafında mesafe, puan, yorum güveni ve mevcut filtreleri birlikte değerlendirir.
- Karşılaştırma paneli 2-4 tesisi yan yana değerlendirmek için kullanılabilir.

Harita için browser key gerekir:

```bash
VITE_GOOGLE_MAPS_BROWSER_KEY=...
VITE_API_BASE_URL=https://mymultisport-bc9c5.web.app
```

`VITE_GOOGLE_MAPS_BROWSER_KEY` sadece Maps JavaScript API içindir. Places API key client bundle içine konmaz; Firebase Functions secret olarak kalır.

## Firebase

Hedef proje:

```bash
firebase use mymultisport-bc9c5
```

Functions API:

- `GET /api/health`
- `GET /api/ratings?ids=...`
- `GET /api/ratings/snapshot`
- `POST /api/ratings/enrich` (admin auth gerekir)
- `GET /api/admin/ratings/status` (admin auth gerekir)
- `POST /api/admin/ratings/enrich` (admin auth gerekir)
- `POST /api/admin/ratings/snapshot/rebuild` (admin auth gerekir)

Normal kullanıcılar Google Places API'ye doğrudan veya dolaylı refresh çağrısı yapmaz. Uygulama önce Firestore snapshot cache'ini okur; snapshot yoksa mevcut `/api/ratings?ids=...` cache endpoint'ine düşer. Google Places sadece admin panelinden, düşük günlük/aylık kota içinde çalışır.

Google Places ve admin secret'ları:

```bash
firebase functions:secrets:set GOOGLE_MAPS_PLATFORM_KEY --project mymultisport-bc9c5
firebase functions:secrets:set RATINGS_ADMIN_USERNAME --project mymultisport-bc9c5
firebase functions:secrets:set RATINGS_ADMIN_PASSWORD --project mymultisport-bc9c5
```

Varsayılan maliyet koruma limitleri Functions içinde `DAILY_ENRICH_LIMIT=50`, `MONTHLY_ENRICH_LIMIT=900`, `MAX_ENRICH_BATCH=50` olarak uygulanır. Google Cloud tarafında da Places/Text Search günlük kotası 50, Maps JavaScript günlük kotası 300 olacak şekilde ayrıca sınırlandırılmalıdır.

Deploy:

```bash
npm run build
firebase deploy --project mymultisport-bc9c5
```

Not: Functions, Secret Manager, Places API ve Cloud Build için proje billing account gerektirir.

## Android Debug APK

Capacitor Android project hazırdır. Bu makinede Gradle için Java 21 gerekir:

```bash
npm run apk:debug
```

APK çıktısı:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

Bu debug APK kişisel/iç test içindir; Play Store release imzalama bu iterasyonda yapılmadı.
