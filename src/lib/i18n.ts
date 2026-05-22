import { createContext, createElement, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

export type LanguageCode = 'tr' | 'en' | 'pl';

type TextDirection = 'ltr';
type TranslationParams = Record<string, string | number>;

export interface LanguageMeta {
  code: LanguageCode;
  label: string;
  nativeLabel: string;
  htmlLang: string;
  locale: string;
  dir: TextDirection;
}

export const SUPPORTED_LANGUAGES: LanguageMeta[] = [
  { code: 'tr', label: 'Turkish', nativeLabel: 'Türkçe', htmlLang: 'tr', locale: 'tr-TR', dir: 'ltr' },
  { code: 'en', label: 'English', nativeLabel: 'English', htmlLang: 'en', locale: 'en-US', dir: 'ltr' },
  { code: 'pl', label: 'Polish', nativeLabel: 'Polski', htmlLang: 'pl', locale: 'pl-PL', dir: 'ltr' },
];

const LANGUAGE_STORAGE_KEY = 'mymultisport-language-v1';
const LANGUAGE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

const tr = {
  'app.description': 'Türkiye tesislerini puan, yakınlık ve kişisel listelerle keşfet.',
  'language.label': 'Dil',
  'language.selectLabel': 'Uygulama dili',
  'stats.results': 'Sonuç',
  'stats.rated': 'Puanlı',
  'stats.ratingsLoading': 'Yükleniyor',
  'stats.favorite': 'Favori',
  'stats.visited': 'Gittim',
  'panels.discover': 'Keşfet',
  'panels.updates': 'Yenilikler',
  'panels.compare': 'Karşılaştır',
  'filters.show': 'Filtreleri göster',
  'filters.hide': 'Filtreleri gizle',
  'filters.activeCount': '{count} aktif',
  'filters.all': 'Tümü',
  'filters.searchLabel': 'Tesis, ilçe, olanak veya aktivite ara',
  'filters.searchPlaceholder': 'Tesis, ilçe, olanak veya aktivite ara',
  'filters.city': 'Şehir',
  'filters.district': 'İlçe',
  'filters.activity': 'Aktivite',
  'filters.sort': 'Sıralama',
  'filters.distance': 'Mesafe',
  'filters.card': 'Kart',
  'filters.personal': 'Kişisel',
  'filters.amenity': 'Olanak',
  'filters.minRating': 'Min. puan',
  'filters.minReviews': 'Min. yorum',
  'filters.hours': 'Çalışma saati',
  'filters.start': 'Başlangıç',
  'filters.time': 'Saat',
  'filters.end': 'Bitiş',
  'filters.activeOnly': 'Aktif',
  'filters.withPhoto': 'Fotoğraflı',
  'filters.global': 'Global',
  'filters.myLocation': 'Konumum',
  'filters.fetchRatingsHours': 'Puan/saat al',
  'filters.pendingRatings': 'Eksik puan/saat: {count}',
  'filters.clear': 'Filtreleri temizle',
  'placeholders.allCities': 'Tüm şehirler',
  'placeholders.allDistricts': 'Tüm ilçeler',
  'placeholders.allActivities': 'Tüm aktiviteler',
  'placeholders.allCards': 'Tüm kartlar',
  'placeholders.allAmenities': 'Tüm olanaklar',
  'sort.recommended': 'Önerilen',
  'sort.distance': 'Mesafe',
  'sort.rating': 'Google puanı',
  'sort.reviews': 'Yorum sayısı',
  'sort.az': 'A-Z',
  'personal.favorite': 'Favori',
  'personal.favorites': 'Favoriler',
  'personal.wantToGo': 'Gitmek istiyorum',
  'personal.visited': 'Gittiklerim',
  'personal.visitedAction': 'Gittim',
  'personal.noted': 'Notlular',
  'personal.plan': 'Planla',
  'hours.all': 'Tümü',
  'hours.openNow': 'Şu an açık',
  'hours.closedNow': 'Şu an kapalı',
  'hours.openAt': 'Bu saatte açık',
  'hours.openUntil': 'Bu saate kadar açık',
  'hours.openBetween': 'Saat aralığında açık',
  'hoursSummary.open': 'Açık',
  'hoursSummary.openUntil': 'Açık · {time}\'a kadar',
  'hoursSummary.closed': 'Kapalı',
  'hoursSummary.opensAt': 'Kapalı · {time} açılır',
  'status.loadingFacilities': 'MultiSport tesisleri yükleniyor...',
  'status.noResults': 'Bu filtrelerle tesis bulunamadı.',
  'facility.cardFallback': 'Kart',
  'facility.global': 'Global',
  'facility.international': 'Uluslararası',
  'facility.noHours': 'Saat bilgisi yok',
  'facility.hoursPending': 'Saat bekliyor',
  'facility.reviews': 'yorum',
  'facility.noReviews': 'Yorum yok',
  'facility.ratingPending': 'Puan bekliyor',
  'facility.matchAmbiguous': 'Eşleşme belirsiz',
  'facility.googleNotFound': 'Google kaydı yok',
  'facility.historical': 'Geçmiş kaynak',
  'facility.detail': 'Detay',
  'facility.compare': 'Karşılaştır',
  'facility.googleMaps': 'Google Haritalar',
  'updates.emptySummary': 'Henüz değişim özeti üretilmedi. Bir sonraki tesis sync/build işleminde statik özet oluşacak.',
  'updates.dataUpdate': 'Veri güncellemesi',
  'updates.changed': 'değişiklik',
  'updates.updatedFromTo': '{previous} tesisten {current} tesise güncellendi.',
  'updates.sourceBreakdown': 'Public kaynak: {public}; geçmişten korunan: {historical}',
  'updates.newFacilities': 'Yeni tesisler',
  'updates.removedFacilities': 'Kaldırılan tesisler',
  'updates.historicalFacilities': 'Public listede yok',
  'updates.updatedFacilities': 'Güncellenen tesisler',
  'updates.noRecords': 'Bu build\'de kayıt yok.',
  'compare.empty': 'Karşılaştırma için listeden en az iki tesis seç. En fazla dört tesis yan yana değerlendirilebilir.',
  'compare.remove': 'Çıkar',
  'compare.openDetail': 'Detayı aç',
  'main.lightMode': 'Açık mod',
  'main.darkMode': 'Koyu mod',
  'main.exitFullscreen': 'Tam ekrandan çık',
  'main.fullscreen': 'Tam ekran',
  'main.pinsGrouped': '{count} pin gruplandı',
  'main.firstResultsFrom': ' / {total} sonuçtan ilk {shown}',
  'main.listView': 'Liste görünümü',
  'main.mapView': 'Harita görünümü',
  'mapFallback.title': 'Google Maps Browser Key gerekli',
  'mapFallback.body': 'Liste, filtre ve MultiSport tesis datası çalışıyor. Haritayı açmak için Maps JavaScript API anahtarını {key} olarak ekleyip uygulamayı yeniden build edin.',
  'mapFallback.note': 'Google Places puan anahtarı client tarafına konmaz; Firebase Functions secret olarak kalır.',
  'map.legend': 'Mavi: puanlı · Gri: bekleyen · Siyah: grup',
  'map.openGoogleMaps': 'Google Haritalar\'da aç',
  'map.clusterTitle': '{count} tesis',
  'map.userLocation': 'Konumunuz',
  'drawer.detailTitle': 'Tesis detayı',
  'drawer.close': 'Detayı kapat',
  'drawer.rating': 'Puan',
  'drawer.review': 'Yorum',
  'drawer.distance': 'Mesafe',
  'drawer.workingHours': 'Çalışma saati',
  'drawer.personalList': 'Kişisel liste',
  'drawer.personalNote': 'Kişisel not',
  'drawer.notePlaceholder': 'Örn. Hafta içi daha sakin, otoparkı kolay...',
  'drawer.activities': 'Aktiviteler',
  'drawer.amenities': 'Olanaklar',
  'drawer.discounts': 'İndirimler',
  'drawer.commentsDisabledTitle': 'Kullanıcı yorumu kapalı',
  'drawer.commentsDisabledBody': 'Bu ilk geliştirme turunda masraf ve moderasyon yüzeyi değişmesin diye kullanıcı yorumu eklenmedi.',
  'drawer.openInMap': 'Haritada aç',
  'drawer.removeCompare': 'Karşılaştırmadan çıkar',
  'drawer.addCompare': 'Karşılaştırmaya ekle',
  'errors.facilitiesLoadFailed': 'Tesis listesi yüklenemedi.',
  'errors.cacheReadFailed': 'Puan cache okunamadı; tesis listesi yine kullanılabilir.',
  'errors.geolocationUnsupported': 'Bu cihazda konum servisi desteklenmiyor.',
  'errors.geolocationDenied': 'Konum izni alınamadı. Şehir/ilçe filtresiyle devam edebilirsin.',
  'errors.apiMissing': 'Lokal dev ortamında Firebase API adresi ayarlı değil. Deploy veya VITE_API_BASE_URL ile puanlar alınır.',
  'errors.noRefreshRemaining': 'Bu görünümde güncellenecek tesis kalmadı.',
  'errors.quotaReached': 'Günlük puan kotası doldu. Mevcut cache ile devam edebilirsin.',
  'errors.googleRatingsFailed': 'Google puanları alınamadı.',
  'errors.compareMax': 'Karşılaştırma için en fazla 4 tesis seçilebilir.',
  'errors.apiHealthFailed': 'API health hatası ({status})',
  'errors.ratingsCacheFailedStatus': 'Puan cache okunamadı ({status})',
  'errors.ratingsEnrichFailedStatus': 'Google puanları güncellenemedi ({status})',
} as const;

export type TranslationKey = keyof typeof tr;
export type TranslationDictionary = Record<TranslationKey, string>;

const translations: Record<LanguageCode, TranslationDictionary> = {
  tr,
  en: {
    'app.description': 'Discover Turkey facilities by rating, distance, and personal lists.',
    'language.label': 'Language',
    'language.selectLabel': 'App language',
    'stats.results': 'Results',
    'stats.rated': 'Rated',
    'stats.ratingsLoading': 'Loading',
    'stats.favorite': 'Favorite',
    'stats.visited': 'Visited',
    'panels.discover': 'Discover',
    'panels.updates': 'Updates',
    'panels.compare': 'Compare',
    'filters.show': 'Show filters',
    'filters.hide': 'Hide filters',
    'filters.activeCount': '{count} active',
    'filters.all': 'All',
    'filters.searchLabel': 'Search facility, district, amenity, or activity',
    'filters.searchPlaceholder': 'Search facility, district, amenity, or activity',
    'filters.city': 'City',
    'filters.district': 'District',
    'filters.activity': 'Activity',
    'filters.sort': 'Sort',
    'filters.distance': 'Distance',
    'filters.card': 'Card',
    'filters.personal': 'Personal',
    'filters.amenity': 'Amenity',
    'filters.minRating': 'Min. rating',
    'filters.minReviews': 'Min. reviews',
    'filters.hours': 'Opening hours',
    'filters.start': 'Start',
    'filters.time': 'Time',
    'filters.end': 'End',
    'filters.activeOnly': 'Active',
    'filters.withPhoto': 'With photo',
    'filters.global': 'Global',
    'filters.myLocation': 'My location',
    'filters.fetchRatingsHours': 'Fetch ratings/hours',
    'filters.pendingRatings': 'Missing ratings/hours: {count}',
    'filters.clear': 'Clear filters',
    'placeholders.allCities': 'All cities',
    'placeholders.allDistricts': 'All districts',
    'placeholders.allActivities': 'All activities',
    'placeholders.allCards': 'All cards',
    'placeholders.allAmenities': 'All amenities',
    'sort.recommended': 'Recommended',
    'sort.distance': 'Distance',
    'sort.rating': 'Google rating',
    'sort.reviews': 'Review count',
    'sort.az': 'A-Z',
    'personal.favorite': 'Favorite',
    'personal.favorites': 'Favorites',
    'personal.wantToGo': 'Want to go',
    'personal.visited': 'Visited',
    'personal.visitedAction': 'Visited',
    'personal.noted': 'With notes',
    'personal.plan': 'Plan',
    'hours.all': 'All',
    'hours.openNow': 'Open now',
    'hours.closedNow': 'Closed now',
    'hours.openAt': 'Open at this time',
    'hours.openUntil': 'Open until this time',
    'hours.openBetween': 'Open during time range',
    'hoursSummary.open': 'Open',
    'hoursSummary.openUntil': 'Open · until {time}',
    'hoursSummary.closed': 'Closed',
    'hoursSummary.opensAt': 'Closed · opens at {time}',
    'status.loadingFacilities': 'Loading MultiSport facilities...',
    'status.noResults': 'No facilities found with these filters.',
    'facility.cardFallback': 'Card',
    'facility.global': 'Global',
    'facility.international': 'International',
    'facility.noHours': 'No hours available',
    'facility.hoursPending': 'Hours pending',
    'facility.reviews': 'reviews',
    'facility.noReviews': 'No reviews',
    'facility.ratingPending': 'Rating pending',
    'facility.matchAmbiguous': 'Match unclear',
    'facility.googleNotFound': 'No Google listing',
    'facility.historical': 'Historical source',
    'facility.detail': 'Details',
    'facility.compare': 'Compare',
    'facility.googleMaps': 'Google Maps',
    'updates.emptySummary': 'No change summary has been generated yet. A static summary will be created during the next facility sync/build.',
    'updates.dataUpdate': 'Data update',
    'updates.changed': 'changes',
    'updates.updatedFromTo': 'Updated from {previous} facilities to {current} facilities.',
    'updates.sourceBreakdown': 'Public source: {public}; preserved from history: {historical}',
    'updates.newFacilities': 'New facilities',
    'updates.removedFacilities': 'Removed facilities',
    'updates.historicalFacilities': 'Not in public list',
    'updates.updatedFacilities': 'Updated facilities',
    'updates.noRecords': 'No records in this build.',
    'compare.empty': 'Select at least two facilities from the list to compare. Up to four facilities can be evaluated side by side.',
    'compare.remove': 'Remove',
    'compare.openDetail': 'Open details',
    'main.lightMode': 'Light mode',
    'main.darkMode': 'Dark mode',
    'main.exitFullscreen': 'Exit fullscreen',
    'main.fullscreen': 'Fullscreen',
    'main.pinsGrouped': '{count} pins grouped',
    'main.firstResultsFrom': ' / first {shown} of {total} results',
    'main.listView': 'List view',
    'main.mapView': 'Map view',
    'mapFallback.title': 'Google Maps Browser Key required',
    'mapFallback.body': 'List, filters, and MultiSport facility data are working. To open the map, add the Maps JavaScript API key as {key} and rebuild the app.',
    'mapFallback.note': 'The Google Places rating key is not exposed on the client; it remains a Firebase Functions secret.',
    'map.legend': 'Blue: rated · Gray: pending · Black: group',
    'map.openGoogleMaps': 'Open in Google Maps',
    'map.clusterTitle': '{count} facilities',
    'map.userLocation': 'Your location',
    'drawer.detailTitle': 'Facility details',
    'drawer.close': 'Close details',
    'drawer.rating': 'Rating',
    'drawer.review': 'Reviews',
    'drawer.distance': 'Distance',
    'drawer.workingHours': 'Opening hours',
    'drawer.personalList': 'Personal list',
    'drawer.personalNote': 'Personal note',
    'drawer.notePlaceholder': 'Example: Quieter on weekdays, easy parking...',
    'drawer.activities': 'Activities',
    'drawer.amenities': 'Amenities',
    'drawer.discounts': 'Discounts',
    'drawer.commentsDisabledTitle': 'User comments disabled',
    'drawer.commentsDisabledBody': 'User comments were not added in this first development round to avoid changing cost and moderation scope.',
    'drawer.openInMap': 'Open in map',
    'drawer.removeCompare': 'Remove from comparison',
    'drawer.addCompare': 'Add to comparison',
    'errors.facilitiesLoadFailed': 'Facility list could not be loaded.',
    'errors.cacheReadFailed': 'Rating cache could not be read; the facility list is still usable.',
    'errors.geolocationUnsupported': 'Location services are not supported on this device.',
    'errors.geolocationDenied': 'Location permission was not granted. You can continue with city/district filters.',
    'errors.apiMissing': 'Firebase API URL is not configured in local dev. Ratings are available after deploy or with VITE_API_BASE_URL.',
    'errors.noRefreshRemaining': 'There are no facilities left to update in this view.',
    'errors.quotaReached': 'Daily rating quota is full. You can continue with the existing cache.',
    'errors.googleRatingsFailed': 'Google ratings could not be fetched.',
    'errors.compareMax': 'Up to 4 facilities can be selected for comparison.',
    'errors.apiHealthFailed': 'API health failed ({status})',
    'errors.ratingsCacheFailedStatus': 'Rating cache could not be read ({status})',
    'errors.ratingsEnrichFailedStatus': 'Google ratings could not be updated ({status})',
  },
  pl: {
    'app.description': 'Odkrywaj obiekty w Turcji według ocen, odległości i własnych list.',
    'language.label': 'Język',
    'language.selectLabel': 'Język aplikacji',
    'stats.results': 'Wyniki',
    'stats.rated': 'Ocenione',
    'stats.ratingsLoading': 'Ładowanie',
    'stats.favorite': 'Ulubione',
    'stats.visited': 'Odwiedzone',
    'panels.discover': 'Odkrywaj',
    'panels.updates': 'Nowości',
    'panels.compare': 'Porównaj',
    'filters.show': 'Pokaż filtry',
    'filters.hide': 'Ukryj filtry',
    'filters.activeCount': '{count} aktywne',
    'filters.all': 'Wszystko',
    'filters.searchLabel': 'Szukaj obiektu, dzielnicy, udogodnienia lub aktywności',
    'filters.searchPlaceholder': 'Szukaj obiektu, dzielnicy, udogodnienia lub aktywności',
    'filters.city': 'Miasto',
    'filters.district': 'Dzielnica',
    'filters.activity': 'Aktywność',
    'filters.sort': 'Sortowanie',
    'filters.distance': 'Odległość',
    'filters.card': 'Karta',
    'filters.personal': 'Osobiste',
    'filters.amenity': 'Udogodnienie',
    'filters.minRating': 'Min. ocena',
    'filters.minReviews': 'Min. opinie',
    'filters.hours': 'Godziny otwarcia',
    'filters.start': 'Początek',
    'filters.time': 'Godzina',
    'filters.end': 'Koniec',
    'filters.activeOnly': 'Aktywne',
    'filters.withPhoto': 'Ze zdjęciem',
    'filters.global': 'Globalne',
    'filters.myLocation': 'Moja lokalizacja',
    'filters.fetchRatingsHours': 'Pobierz oceny/godziny',
    'filters.pendingRatings': 'Brak ocen/godzin: {count}',
    'filters.clear': 'Wyczyść filtry',
    'placeholders.allCities': 'Wszystkie miasta',
    'placeholders.allDistricts': 'Wszystkie dzielnice',
    'placeholders.allActivities': 'Wszystkie aktywności',
    'placeholders.allCards': 'Wszystkie karty',
    'placeholders.allAmenities': 'Wszystkie udogodnienia',
    'sort.recommended': 'Polecane',
    'sort.distance': 'Odległość',
    'sort.rating': 'Ocena Google',
    'sort.reviews': 'Liczba opinii',
    'sort.az': 'A-Z',
    'personal.favorite': 'Ulubione',
    'personal.favorites': 'Ulubione',
    'personal.wantToGo': 'Chcę pójść',
    'personal.visited': 'Odwiedzone',
    'personal.visitedAction': 'Byłem',
    'personal.noted': 'Z notatkami',
    'personal.plan': 'Zaplanuj',
    'hours.all': 'Wszystko',
    'hours.openNow': 'Teraz otwarte',
    'hours.closedNow': 'Teraz zamknięte',
    'hours.openAt': 'Otwarte o tej godzinie',
    'hours.openUntil': 'Otwarte do tej godziny',
    'hours.openBetween': 'Otwarte w zakresie godzin',
    'hoursSummary.open': 'Otwarte',
    'hoursSummary.openUntil': 'Otwarte · do {time}',
    'hoursSummary.closed': 'Zamknięte',
    'hoursSummary.opensAt': 'Zamknięte · otwarcie {time}',
    'status.loadingFacilities': 'Ładowanie obiektów MultiSport...',
    'status.noResults': 'Nie znaleziono obiektów dla tych filtrów.',
    'facility.cardFallback': 'Karta',
    'facility.global': 'Globalne',
    'facility.international': 'Międzynarodowe',
    'facility.noHours': 'Brak godzin',
    'facility.hoursPending': 'Godziny oczekują',
    'facility.reviews': 'opinii',
    'facility.noReviews': 'Brak opinii',
    'facility.ratingPending': 'Ocena oczekuje',
    'facility.matchAmbiguous': 'Dopasowanie niepewne',
    'facility.googleNotFound': 'Brak wizytówki Google',
    'facility.historical': 'Źródło historyczne',
    'facility.detail': 'Szczegóły',
    'facility.compare': 'Porównaj',
    'facility.googleMaps': 'Google Maps',
    'updates.emptySummary': 'Nie wygenerowano jeszcze podsumowania zmian. Statyczne podsumowanie powstanie przy następnej synchronizacji/buildzie obiektów.',
    'updates.dataUpdate': 'Aktualizacja danych',
    'updates.changed': 'zmian',
    'updates.updatedFromTo': 'Zaktualizowano z {previous} obiektów do {current} obiektów.',
    'updates.sourceBreakdown': 'Źródło publiczne: {public}; zachowane z historii: {historical}',
    'updates.newFacilities': 'Nowe obiekty',
    'updates.removedFacilities': 'Usunięte obiekty',
    'updates.historicalFacilities': 'Brak na liście publicznej',
    'updates.updatedFacilities': 'Zaktualizowane obiekty',
    'updates.noRecords': 'Brak rekordów w tym buildzie.',
    'compare.empty': 'Wybierz z listy co najmniej dwa obiekty do porównania. Można porównać maksymalnie cztery obiekty obok siebie.',
    'compare.remove': 'Usuń',
    'compare.openDetail': 'Otwórz szczegóły',
    'main.lightMode': 'Tryb jasny',
    'main.darkMode': 'Tryb ciemny',
    'main.exitFullscreen': 'Wyjdź z pełnego ekranu',
    'main.fullscreen': 'Pełny ekran',
    'main.pinsGrouped': '{count} pinezek pogrupowano',
    'main.firstResultsFrom': ' / pierwsze {shown} z {total} wyników',
    'main.listView': 'Widok listy',
    'main.mapView': 'Widok mapy',
    'mapFallback.title': 'Wymagany Google Maps Browser Key',
    'mapFallback.body': 'Lista, filtry i dane obiektów MultiSport działają. Aby otworzyć mapę, dodaj klucz Maps JavaScript API jako {key} i przebuduj aplikację.',
    'mapFallback.note': 'Klucz ocen Google Places nie trafia do klienta; pozostaje sekretem Firebase Functions.',
    'map.legend': 'Niebieski: ocenione · Szary: oczekujące · Czarny: grupa',
    'map.openGoogleMaps': 'Otwórz w Google Maps',
    'map.clusterTitle': '{count} obiektów',
    'map.userLocation': 'Twoja lokalizacja',
    'drawer.detailTitle': 'Szczegóły obiektu',
    'drawer.close': 'Zamknij szczegóły',
    'drawer.rating': 'Ocena',
    'drawer.review': 'Opinie',
    'drawer.distance': 'Odległość',
    'drawer.workingHours': 'Godziny otwarcia',
    'drawer.personalList': 'Lista osobista',
    'drawer.personalNote': 'Notatka osobista',
    'drawer.notePlaceholder': 'Np. Spokojniej w tygodniu, łatwy parking...',
    'drawer.activities': 'Aktywności',
    'drawer.amenities': 'Udogodnienia',
    'drawer.discounts': 'Zniżki',
    'drawer.commentsDisabledTitle': 'Komentarze użytkowników wyłączone',
    'drawer.commentsDisabledBody': 'Komentarzy użytkowników nie dodano w tej pierwszej turze rozwoju, aby nie zwiększać kosztów i zakresu moderacji.',
    'drawer.openInMap': 'Otwórz na mapie',
    'drawer.removeCompare': 'Usuń z porównania',
    'drawer.addCompare': 'Dodaj do porównania',
    'errors.facilitiesLoadFailed': 'Nie udało się załadować listy obiektów.',
    'errors.cacheReadFailed': 'Nie udało się odczytać cache ocen; lista obiektów nadal działa.',
    'errors.geolocationUnsupported': 'Usługi lokalizacji nie są obsługiwane na tym urządzeniu.',
    'errors.geolocationDenied': 'Nie przyznano dostępu do lokalizacji. Możesz kontynuować z filtrami miasta/dzielnicy.',
    'errors.apiMissing': 'Adres Firebase API nie jest ustawiony w lokalnym dev. Oceny działają po deployu albo z VITE_API_BASE_URL.',
    'errors.noRefreshRemaining': 'W tym widoku nie ma już obiektów do aktualizacji.',
    'errors.quotaReached': 'Dzienny limit ocen został wykorzystany. Możesz kontynuować z istniejącym cache.',
    'errors.googleRatingsFailed': 'Nie udało się pobrać ocen Google.',
    'errors.compareMax': 'Do porównania można wybrać maksymalnie 4 obiekty.',
    'errors.apiHealthFailed': 'Błąd health API ({status})',
    'errors.ratingsCacheFailedStatus': 'Nie udało się odczytać cache ocen ({status})',
    'errors.ratingsEnrichFailedStatus': 'Nie udało się zaktualizować ocen Google ({status})',
  },
};

type PluralCategory = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';
type CountUnit = 'facility' | 'result' | 'change' | 'review' | 'pin';
type CountUnitForms = { other: string } & Partial<Record<PluralCategory, string>>;

const countUnits: Record<LanguageCode, Record<CountUnit, CountUnitForms>> = {
  tr: {
    facility: { other: 'tesis' },
    result: { other: 'sonuç' },
    change: { other: 'değişiklik' },
    review: { other: 'yorum' },
    pin: { other: 'pin' },
  },
  en: {
    facility: { one: 'facility', other: 'facilities' },
    result: { one: 'result', other: 'results' },
    change: { one: 'change', other: 'changes' },
    review: { one: 'review', other: 'reviews' },
    pin: { one: 'pin', other: 'pins' },
  },
  pl: {
    facility: { one: 'obiekt', few: 'obiekty', many: 'obiektów', other: 'obiektu' },
    result: { one: 'wynik', few: 'wyniki', many: 'wyników', other: 'wyniku' },
    change: { one: 'zmiana', few: 'zmiany', many: 'zmian', other: 'zmiany' },
    review: { one: 'opinia', few: 'opinie', many: 'opinii', other: 'opinii' },
    pin: { one: 'pinezka', few: 'pinezki', many: 'pinezek', other: 'pinezki' },
  },
};

const weekdayLabels: Record<LanguageCode, string[]> = {
  tr: ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  pl: ['niedz.', 'pon.', 'wt.', 'śr.', 'czw.', 'pt.', 'sob.'],
};

interface I18nContextValue {
  language: LanguageCode;
  setLanguage: (language: LanguageCode) => void;
  languageMeta: LanguageMeta;
  t: (key: TranslationKey, params?: TranslationParams) => string;
  formatNumber: (value: number) => string;
  formatCount: (value: number, unit: CountUnit) => string;
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<LanguageCode>(() => getInitialLanguage());
  const languageMeta = getLanguageMeta(language);

  useEffect(() => {
    document.documentElement.lang = languageMeta.htmlLang;
    document.documentElement.dir = languageMeta.dir;
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    } catch {
      // Ignore private-mode storage failures; language still works for this session.
    }
    document.cookie = `${LANGUAGE_STORAGE_KEY}=${encodeURIComponent(language)};path=/;max-age=${LANGUAGE_COOKIE_MAX_AGE};SameSite=Lax`;
  }, [language, languageMeta.dir, languageMeta.htmlLang]);

  const value = useMemo<I18nContextValue>(() => ({
    language,
    setLanguage,
    languageMeta,
    t: (key, params) => translate(language, key, params),
    formatNumber: (numberValue) => formatNumber(numberValue, language),
    formatCount: (numberValue, unit) => formatCount(numberValue, unit, language),
  }), [language, languageMeta]);

  return createElement(I18nContext.Provider, { value }, children);
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within I18nProvider');
  }
  return context;
}

export function isLanguageCode(value: string | null | undefined): value is LanguageCode {
  return SUPPORTED_LANGUAGES.some((language) => language.code === value);
}

export function getLanguageMeta(language: LanguageCode): LanguageMeta {
  return SUPPORTED_LANGUAGES.find((item) => item.code === language) || SUPPORTED_LANGUAGES[0];
}

export function translate(language: LanguageCode, key: TranslationKey, params?: TranslationParams): string {
  const template = translations[language]?.[key] || translations.tr[key] || key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
  ));
}

export function formatNumber(value: number, language: LanguageCode): string {
  return new Intl.NumberFormat(getLanguageMeta(language).locale).format(value);
}

export function formatCount(value: number, unit: CountUnit, language: LanguageCode): string {
  const category = new Intl.PluralRules(getLanguageMeta(language).locale).select(value) as PluralCategory;
  const forms = countUnits[language][unit];
  return `${formatNumber(value, language)} ${forms[category] || forms.other}`;
}

export function formatDistanceKm(value: number, language: LanguageCode): string {
  const formatted = new Intl.NumberFormat(getLanguageMeta(language).locale, {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  }).format(value);
  return `${formatted} km`;
}

export function getWeekdayLabel(day: number, language: LanguageCode): string {
  return weekdayLabels[language][day] || weekdayLabels.tr[day] || '';
}

function getInitialLanguage(): LanguageCode {
  const stored = readStoredLanguage();
  if (stored) return stored;

  if (typeof navigator !== 'undefined') {
    const browserLanguage = navigator.language.split('-')[0];
    if (isLanguageCode(browserLanguage)) return browserLanguage;
  }

  return 'tr';
}

function readStoredLanguage(): LanguageCode | null {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (isLanguageCode(stored)) return stored;
  } catch {
    // Fall back to a cookie when storage is unavailable or blocked.
  }

  if (typeof document !== 'undefined') {
    const storedCookie = document.cookie
      .split('; ')
      .find((cookie) => cookie.startsWith(`${LANGUAGE_STORAGE_KEY}=`))
      ?.split('=')
      .slice(1)
      .join('=');
    const decoded = storedCookie ? decodeURIComponent(storedCookie) : null;
    if (isLanguageCode(decoded)) return decoded;
  }

  return null;
}
