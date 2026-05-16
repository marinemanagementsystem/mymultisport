import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { List, MapIcon, Maximize, Minimize, Moon, Sun } from 'lucide-react';
import FacilityDetailDrawer from './FacilityDetailDrawer';
import MapArea from './MapArea';
import Sidebar from './Sidebar';
import type {
  BenefitFacility,
  FacilityChangeSummary,
  FacilityPersonalKey,
  FilterState,
  GoogleRatingMatch,
  UserFacilityState,
  UserLocation,
} from '../types';
import {
  buildFacilityResults,
  filterAndSortFacilities,
  getUniqueCities,
  loadFacilities,
} from '../lib/facilities';
import { loadFacilityChanges } from '../lib/facilityChanges';
import {
  enrichRatings,
  ENRICH_BATCH_SIZE,
  getAllRatings,
  RatingsApiError,
  RATINGS_API_AVAILABLE,
} from '../lib/ratingsApi';
import {
  loadUserFacilityStates,
  saveUserFacilityStates,
  toggleFacilityFlag,
  updateFacilityNote,
} from '../lib/userPreferences';

const DEFAULT_FILTERS: FilterState = {
  query: '',
  city: '',
  district: '',
  activity: '',
  sort: 'recommended',
  minRating: 0,
  minReviews: 0,
  radiusKm: 0,
  hoursMode: '',
  hoursTime: '23:00',
  hoursEndTime: '23:00',
  card: '',
  amenity: '',
  personal: '',
  hasPhoto: false,
  activeOnly: true,
  internationalOnly: false,
};

const MAX_RESULTS_FOR_UI = 500;

export default function MainLayout({ mapsAvailable }: { mapsAvailable: boolean }) {
  const [facilities, setFacilities] = useState<BenefitFacility[]>([]);
  const [ratings, setRatings] = useState<Record<string, GoogleRatingMatch>>({});
  const [userStates, setUserStates] = useState<Record<string, UserFacilityState>>(() => loadUserFacilityStates());
  const [facilityChanges, setFacilityChanges] = useState<FacilityChangeSummary | null>(null);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [detailPlaceId, setDetailPlaceId] = useState<string | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [userLocation, setUserLocation] = useState<UserLocation | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [isEnriching, setIsEnriching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDark, setIsDark] = useState(() => localStorage.getItem('mymultisport-theme') === 'dark');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mobileView, setMobileView] = useState<'map' | 'list'>('list');

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    localStorage.setItem('mymultisport-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  useEffect(() => {
    saveUserFacilityStates(userStates);
  }, [userStates]);

  useEffect(() => {
    const handler = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    loadFacilities()
      .then((loaded) => {
        if (!mounted) return;
        setFacilities(loaded);
        const cities = getUniqueCities(loaded);
        if (cities.includes('İstanbul')) {
          setFilters((current) => ({ ...current, city: 'İstanbul', radiusKm: 0 }));
        }
      })
      .catch((cause) => {
        console.error(cause);
        if (mounted) setError(cause instanceof Error ? cause.message : 'Tesis listesi yüklenemedi.');
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    loadFacilityChanges()
      .then(setFacilityChanges)
      .catch((cause) => console.warn(cause));
  }, []);

  useEffect(() => {
    if (!RATINGS_API_AVAILABLE) return;
    if (facilities.length === 0) return;

    const cacheAbort = new AbortController();
    const allIds = facilities.map((facility) => facility.id);

    getAllRatings(allIds, {
      signal: cacheAbort.signal,
      onChunk: (chunk) => {
        if (cacheAbort.signal.aborted) return;
        if (Object.keys(chunk).length === 0) return;
        setRatings((current) => ({ ...current, ...chunk }));
      },
    }).catch((cause) => {
      if (cacheAbort.signal.aborted) return;
      console.warn(cause);
      setError('Puan cache okunamadı; tesis listesi yine kullanılabilir.');
    });

    return () => cacheAbort.abort();
  }, [facilities]);

  const allResults = useMemo(
    () => buildFacilityResults(facilities, ratings, userLocation, userStates),
    [facilities, ratings, userLocation, userStates],
  );

  const filteredResults = useMemo(
    () => filterAndSortFacilities(allResults, filters),
    [allResults, filters],
  );

  const displayedResults = filteredResults.slice(0, MAX_RESULTS_FOR_UI);
  const refreshableResults = useMemo(
    () => filterAndSortFacilities(allResults, {
      ...filters,
      hoursMode: '',
    }).slice(0, MAX_RESULTS_FOR_UI),
    [allResults, filters],
  );

  const stats = useMemo(() => {
    const matched = filteredResults.filter((result) => result.rating?.matchStatus === 'matched').length;
    const userStateList = Object.values(userStates);
    return {
      total: facilities.length,
      shown: filteredResults.length,
      matched,
      pending: Math.max(filteredResults.length - matched, 0),
      favorites: userStateList.filter((state) => state.favorite).length,
      wantToGo: userStateList.filter((state) => state.wantToGo).length,
      visited: userStateList.filter((state) => state.visited).length,
    };
  }, [facilities.length, filteredResults, userStates]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const locateUser = useCallback(() => {
    if (!navigator.geolocation) {
      setError('Bu cihazda konum servisi desteklenmiyor.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setUserLocation(location);
        setFilters((current) => ({
          ...current,
          sort: 'distance',
          radiusKm: current.radiusKm || 10,
        }));
        setMobileView('list');
        setError(null);
      },
      () => {
        setError('Konum izni alınamadı. Şehir/ilçe filtresiyle devam edebilirsin.');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 },
    );
  }, []);

  const refreshRatings = useCallback(() => {
    if (!RATINGS_API_AVAILABLE) {
      setError('Lokal dev ortamında Firebase API adresi ayarlı değil. Deploy veya VITE_API_BASE_URL ile puanlar alınır.');
      return;
    }

    const missing = refreshableResults
      .filter((result) => {
        const status = result.rating?.matchStatus;
        return !status || status === 'stale' || (status === 'matched' && !result.rating?.openingHours);
      })
      .slice(0, ENRICH_BATCH_SIZE)
      .map((result) => result.facility);

    if (missing.length === 0) {
      setError('Bu görünümde güncellenecek tesis kalmadı.');
      return;
    }

    setIsEnriching(true);
    setError(null);
    enrichRatings(missing)
      .then((freshRatings) => {
        setRatings((current) => ({ ...current, ...freshRatings }));
      })
      .catch((cause) => {
        console.error(cause);
        if (cause instanceof RatingsApiError && cause.status === 429) {
          setError('Günlük puan kotası doldu. Mevcut cache ile devam edebilirsin.');
        } else {
          setError(cause instanceof Error ? cause.message : 'Google puanları alınamadı.');
        }
      })
      .finally(() => setIsEnriching(false));
  }, [refreshableResults]);

  const togglePersonal = useCallback((facilityId: string, key: FacilityPersonalKey) => {
    setUserStates((current) => toggleFacilityFlag(current, facilityId, key));
  }, []);

  const updateNote = useCallback((facilityId: string, note: string) => {
    setUserStates((current) => updateFacilityNote(current, facilityId, note));
  }, []);

  const toggleCompare = useCallback((facilityId: string) => {
    setCompareIds((current) => {
      if (current.includes(facilityId)) {
        return current.filter((id) => id !== facilityId);
      }
      if (current.length >= 4) {
        setError('Karşılaştırma için en fazla 4 tesis seçilebilir.');
        return current;
      }
      setError(null);
      return [...current, facilityId];
    });
  }, []);

  const handleSelect = (id: string) => {
    setSelectedPlaceId(id);
    setMobileView('map');
  };

  useEffect(() => {
    if (selectedPlaceId && !displayedResults.some((result) => result.facility.id === selectedPlaceId)) {
      setSelectedPlaceId(null);
    }
  }, [displayedResults, selectedPlaceId]);

  const detailResult = detailPlaceId
    ? allResults.find((result) => result.facility.id === detailPlaceId)
    : undefined;
  const compareResults = compareIds
    .map((id) => allResults.find((result) => result.facility.id === id))
    .filter((result): result is NonNullable<typeof result> => Boolean(result));

  return (
    <div className="relative flex h-[100dvh] w-full overflow-hidden bg-[var(--app-bg)] text-[var(--text-primary)] md:flex-row">
      <div className={`absolute inset-0 z-20 md:relative md:block ${mobileView === 'list' ? 'block' : 'hidden'}`}>
        <Sidebar
          allFacilities={facilities}
          results={displayedResults}
          filters={filters}
          setFilters={(nextFilters) => {
            setFilters(nextFilters);
            const selectedStillVisible = filteredResults.some((result) => result.facility.id === selectedPlaceId);
            if (!selectedStillVisible) setSelectedPlaceId(null);
          }}
          selectedPlaceId={selectedPlaceId}
          onSelectPlace={handleSelect}
          onOpenDetail={(id) => {
            setDetailPlaceId(id);
            setSelectedPlaceId(id);
          }}
          onLocate={locateUser}
          onRefreshRatings={refreshRatings}
          canRefreshRatings={refreshableResults.length > 0}
          onTogglePersonal={togglePersonal}
          compareIds={compareIds}
          compareResults={compareResults}
          onToggleCompare={toggleCompare}
          isLoading={isLoading}
          isEnriching={isEnriching}
          error={error}
          stats={stats}
          facilityChanges={facilityChanges}
        />
      </div>

      <main className={`relative flex-1 md:block ${mobileView === 'map' ? 'block' : 'hidden'}`}>
        {mapsAvailable ? (
          <MapArea
            results={displayedResults}
            selectedPlaceId={selectedPlaceId}
            onSelectPlace={(id) => setSelectedPlaceId(id)}
            isDark={isDark}
            userLocation={userLocation}
          />
        ) : (
          <MapKeyFallback />
        )}

        <div className="absolute right-4 top-4 z-10 flex flex-col gap-2">
          <IconButton label={isDark ? 'Açık mod' : 'Koyu mod'} onClick={() => setIsDark((value) => !value)}>
            {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </IconButton>
          <IconButton label={isFullscreen ? 'Tam ekrandan çık' : 'Tam ekran'} onClick={toggleFullscreen}>
            {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
          </IconButton>
        </div>

        {mapsAvailable && (
          <div className="absolute bottom-24 left-1/2 z-10 hidden -translate-x-1/2 rounded-full border border-[var(--border-soft)] bg-[var(--surface-raised)]/95 px-4 py-2 text-xs font-bold text-[var(--text-secondary)] shadow-[var(--shadow-soft)] backdrop-blur md:block">
            {displayedResults.length.toLocaleString('tr-TR')} pin gruplandı
            {filteredResults.length > displayedResults.length ? ` / ${filteredResults.length.toLocaleString('tr-TR')} sonuçtan ilk ${displayedResults.length}` : ''}
          </div>
        )}
      </main>

      <FacilityDetailDrawer
        result={detailResult}
        isCompareSelected={detailResult ? compareIds.includes(detailResult.facility.id) : false}
        onClose={() => setDetailPlaceId(null)}
        onTogglePersonal={togglePersonal}
        onUpdateNote={updateNote}
        onToggleCompare={toggleCompare}
      />

      <button
        className="fixed bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] left-1/2 z-30 inline-flex h-11 -translate-x-1/2 items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-5 text-sm font-bold text-white shadow-2xl transition hover:bg-[var(--accent-strong)] md:hidden"
        onClick={() => setMobileView((view) => view === 'map' ? 'list' : 'map')}
      >
        {mobileView === 'map' ? (
          <>
            <List className="h-5 w-5" />
            Liste görünümü
          </>
        ) : (
          <>
            <MapIcon className="h-5 w-5" />
            Harita görünümü
          </>
        )}
      </button>
    </div>
  );
}

function MapKeyFallback() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[var(--map-fallback)] p-6 text-[var(--text-primary)]">
      <div className="max-w-md rounded-[1.25rem] border border-[var(--border-soft)] bg-[var(--surface-raised)] p-6 shadow-[var(--shadow-soft)]">
        <h2 className="text-xl font-black">Google Maps Browser Key gerekli</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
          Liste, filtre ve MultiSport tesis datası çalışıyor. Haritayı açmak için Maps JavaScript API anahtarını
          <code className="mx-1 rounded bg-[var(--surface-muted)] px-1.5 py-0.5 text-xs">VITE_GOOGLE_MAPS_BROWSER_KEY</code>
          olarak ekleyip uygulamayı yeniden build edin.
        </p>
        <p className="mt-3 text-xs text-[var(--text-tertiary)]">
          Google Places puan anahtarı client tarafına konmaz; Firebase Functions secret olarak kalır.
        </p>
      </div>
    </div>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border-soft)] bg-[var(--surface-raised)] text-[var(--text-secondary)] shadow-[var(--shadow-soft)] transition hover:bg-[var(--surface-muted)]"
    >
      {children}
    </button>
  );
}
