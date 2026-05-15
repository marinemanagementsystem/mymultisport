# MyMultiSport

MultiSport Türkiye tesis listesini Benefit Systems public JSON datasından yükleyen, Google Maps/Places puanlarını Firebase Functions + Firestore cache üzerinden zenginleştiren mobil öncelikli web ve Android APK uygulaması.

## Google Maps & Places API Yapılandırması (MMSAI3 Projesi)

1. **Maps JavaScript API:** MMSAI3 projesinde etkinleştirildi ve otomatik API Key oluşturuldu.
2. **Places API:** Spor salonu arama özelliği için etkinleştirildi.
3. **Kotalar (Hard Cap):**
   - Maps JavaScript API: Günlük maksimum 1,000 Map loads (harita yüklemesi).
   - Places API: Günlük maksimum 1,000 Requests (istek).
4. **Bütçe Uyarısı:** "MMSAI3 Maps API Butce Uyarisi" adıyla ₺100 bütçe oluşturuldu. Bütçe %50, %90 ve %100 dolduğunda e-posta uyarısı gönderilecektir.
5. **Secret / Ortam Değişkenleri:** API Key, AI Studio'ya `GOOGLE_MAPS_PLATFORM_KEY` secret'ı olarak kaydedildi ve uygulama otomatik olarak yeniden derlendi.

## Local Web

```bash
npm install
npm run dev
```

Tesis datası `npm run sync:facilities` ile `https://benefitsystems.com.tr/facilities-tr.json` kaynağından yenilenir. `npm run build` öncesinde otomatik çalışır.

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
- `POST /api/ratings/enrich`

Google Places secret:

```bash
firebase functions:secrets:set GOOGLE_MAPS_PLATFORM_KEY --project mymultisport-bc9c5
```

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
