import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { List, MapIcon, Maximize, Minimize, Moon, Sun } from 'lucide-react';
import MapArea from './MapArea';
import Sidebar from './Sidebar';
import type { BenefitFacility, FilterState, GoogleRatingMatch, UserLocation } from '../types';
import {
  buildFacilityResults,
  filterAndSortFacilities,
  getUniqueCities,
  loadFacilities,
} from '../lib/facilities';
import {
  enrichRatings,
  ENRICH_BATCH_SIZE,
  getAllRatings,
  RatingsApiError,
  RATINGS_API_AVAILABLE,
} from '../lib/ratingsApi';

const DEFAULT_FILTERS: FilterState = {
  query: '',
  city: '',
  district: '',
  activity: '',
  sort: 'distance',
  minRating: 0,
  minReviews: 0,
  radiusKm: 0,
};

const MAX_RESULTS_FOR_UI = 500;

export default function MainLayout({ mapsAvailable }: { mapsAvailable: boolean }) {
  const [facilities, setFacilities] = useState<BenefitFacility[]>([]);
  const [ratings, setRatings] = useState<Record<string, GoogleRatingMatch>>({});
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [userLocation, setUserLocation] = useState<UserLocation | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [isEnriching, setIsEnriching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDark, setIsDark] = useState(() => localStorage.getItem('mymultisport-theme') === 'dark');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mobileView, setMobileView] = useState<'map' | 'list'>('list');

  const facilitiesRef = useRef<BenefitFacility[]>([]);
  const ratingsRef = useRef<Record<string, GoogleRatingMatch>>({});
  const enrichAbortRef = useRef<AbortController | null>(null);
  const dailyLimitHitRef = useRef(false);

  useEffect(() => { facilitiesRef.current = facilities; }, [facilities]);
  useEffect(() => { ratingsRef.current = ratings; }, [ratings]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    localStorage.setItem('mymultisport-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

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

  const pickMissingOrStale = useCallback((): BenefitFacility[] => {
    const list = facilitiesRef.current;
    const map = ratingsRef.current;
    const missing: BenefitFacility[] = [];
    for (const facility of list) {
      const rating = map[facility.id];
      const status = rating?.matchStatus;
      if (!status || status === 'stale') missing.push(facility);
      if (missing.length >= ENRICH_BATCH_SIZE) break;
    }
    return missing;
  }, []);

  const runEnrichLoop = useCallback(async (signal: AbortSignal) => {
    setIsEnriching(true);
    setError(null);
    try {
      while (!signal.aborted) {
        const batch = pickMissingOrStale();
        if (batch.length === 0) break;
        try {
          const fresh = await enrichRatings(batch);
          if (signal.aborted) break;
          setRatings((current) => ({ ...current, ...fresh }));
        } catch (cause) {
          if (signal.aborted) break;
          if (cause instanceof RatingsApiError && cause.status === 429) {
            dailyLimitHitRef.current = true;
            setError('Günlük puan kotası doldu (1000). Yarın sayfayı yenilediğinde otomatik devam edecek.');
          } else {
            console.error(cause);
            setError(cause instanceof Error ? cause.message : 'Google puanları alınamadı.');
          }
          break;
        }
      }
    } finally {
      if (enrichAbortRef.current?.signal === signal) {
        enrichAbortRef.current = null;
      }
      setIsEnriching(false);
    }
  }, [pickMissingOrStale]);

  const startEnrichLoop = useCallback(() => {
    if (!RATINGS_API_AVAILABLE) {
      setError('Lokal dev ortamında Firebase API adresi ayarlı değil. Deploy veya VITE_API_BASE_URL ile puanlar alınır.');
      return;
    }
    if (enrichAbortRef.current) return;
    if (dailyLimitHitRef.current) return;
    if (pickMissingOrStale().length === 0) return;

    const controller = new AbortController();
    enrichAbortRef.current = controller;
    void runEnrichLoop(controller.signal);
  }, [pickMissingOrStale, runEnrichLoop]);

  const stopEnrichLoop = useCallback(() => {
    enrichAbortRef.current?.abort();
    enrichAbortRef.current = null;
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
    })
      .then(() => {
        if (cacheAbort.signal.aborted) return;
        startEnrichLoop();
      })
      .catch((cause) => {
        if (cacheAbort.signal.aborted) return;
        console.warn(cause);
        setError('Puan cache okunamadı; tesis listesi yine kullanılabilir.');
      });

    return () => {
      cacheAbort.abort();
      enrichAbortRef.current?.abort();
      enrichAbortRef.current = null;
    };
  }, [facilities, startEnrichLoop]);

  const allResults = useMemo(
    () => buildFacilityResults(facilities, ratings, userLocation),
    [facilities, ratings, userLocation],
  );

  const filteredResults = useMemo(
    () => filterAndSortFacilities(allResults, filters),
    [allResults, filters],
  );

  const displayedResults = filteredResults.slice(0, MAX_RESULTS_FOR_UI);

  const stats = useMemo(() => {
    const matched = filteredResults.filter((result) => result.rating?.matchStatus === 'matched').length;
    return {
      total: facilities.length,
      shown: filteredResults.length,
      matched,
      pending: Math.max(filteredResults.length - matched, 0),
    };
  }, [facilities.length, filteredResults]);

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

  const toggleEnrichLoop = useCallback(() => {
    if (isEnriching) {
      stopEnrichLoop();
    } else {
      dailyLimitHitRef.current = false;
      startEnrichLoop();
    }
  }, [isEnriching, startEnrichLoop, stopEnrichLoop]);

  const handleSelect = (id: string) => {
    setSelectedPlaceId(id);
    setMobileView('map');
  };

  useEffect(() => {
    if (selectedPlaceId && !displayedResults.some((result) => result.facility.id === selectedPlaceId)) {
      setSelectedPlaceId(null);
    }
  }, [displayedResults, selectedPlaceId]);

  return (
    <div className="relative flex h-[100dvh] w-full overflow-hidden bg-white text-slate-950 dark:bg-slate-950 dark:text-slate-50 md:flex-row">
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
          onLocate={locateUser}
          onRefreshRatings={toggleEnrichLoop}
          isLoading={isLoading}
          isEnriching={isEnriching}
          error={error}
          stats={stats}
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
          <div className="absolute bottom-24 left-1/2 z-10 hidden -translate-x-1/2 rounded-full bg-white/95 px-4 py-2 text-xs font-bold text-slate-700 shadow-lg dark:bg-slate-950/95 dark:text-slate-200 md:block">
            {displayedResults.length.toLocaleString('tr-TR')} pin gösteriliyor
            {filteredResults.length > displayedResults.length ? ` / ${filteredResults.length.toLocaleString('tr-TR')} sonuçtan ilk ${displayedResults.length}` : ''}
          </div>
        )}
      </main>

      <button
        className="fixed bottom-6 left-1/2 z-30 inline-flex h-12 -translate-x-1/2 items-center justify-center gap-2 rounded-full bg-blue-600 px-6 text-sm font-bold text-white shadow-2xl transition hover:bg-blue-700 md:hidden"
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
    <div className="flex h-full w-full items-center justify-center bg-slate-100 p-6 text-slate-900 dark:bg-slate-900 dark:text-white">
      <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-950">
        <h2 className="text-xl font-black">Google Maps Browser Key gerekli</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
          Liste, filtre ve MultiSport tesis datası çalışıyor. Haritayı açmak için Maps JavaScript API anahtarını
          <code className="mx-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs dark:bg-slate-800">VITE_GOOGLE_MAPS_BROWSER_KEY</code>
          olarak ekleyip uygulamayı yeniden build edin.
        </p>
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
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
      className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-lg transition hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
    >
      {children}
    </button>
  );
}
