import { AdvancedMarker, InfoWindow, Map as GoogleMap, Pin, useAdvancedMarkerRef, useMap } from '@vis.gl/react-google-maps';
import { Clock3, ExternalLink, MapPin, Star } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FacilityResult, ProviderId, UserLocation } from '../types';
import { formatOpeningHoursSummary, getFacilityPosition, getGoogleMapsSearchUrl } from '../lib/facilities';
import { useI18n } from '../lib/i18n';

interface MapAreaProps {
  provider: ProviderId;
  results: FacilityResult[];
  selectedPlaceId: string | null;
  onSelectPlace: (id: string | null) => void;
  isDark: boolean;
  userLocation?: UserLocation;
  fitBoundsKey: string;
}

interface MarkerCluster {
  id: string;
  count: number;
  position: google.maps.LatLngLiteral;
  result?: FacilityResult;
}

const GRID_SIZE = 0.018;
const MAX_VIEWPORT_RESULTS = 350;

const FacilityMarker = ({ provider, result, isSelected, onClick }: { provider: ProviderId, result: FacilityResult, isSelected: boolean, onClick: () => void }) => {
  const { language, t, formatCount } = useI18n();
  const [markerRef, marker] = useAdvancedMarkerRef();
  const { facility, rating } = result;
  const hoursSummary = formatOpeningHoursSummary(rating, language);
  const position = getFacilityPosition(facility);
  if (!position) return null;

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={position}
        title={facility.name}
        onClick={onClick}
        style={{ zIndex: isSelected ? 100 : 1 }}
      >
        <Pin
          background={markerColor(provider, isSelected, rating?.matchStatus === 'matched', position.source)}
          borderColor={markerBorderColor(provider, isSelected, rating?.matchStatus === 'matched', position.source)}
          glyphColor="#ffffff"
          scale={isSelected ? 1.2 : 0.95}
        />
      </AdvancedMarker>

      {isSelected && (
        <InfoWindow anchor={marker} onCloseClick={onClick} className="min-w-[220px]">
          <div className="p-1 font-sans text-gray-900">
            <h3 className="mb-1 text-base font-semibold">{facility.name}</h3>
            <div className="mb-2 flex items-center gap-2 text-sm text-gray-700">
              <div className="flex items-center font-medium">
                <Star className="mr-1 h-4 w-4 fill-amber-400 text-amber-400" />
                <span>{rating?.rating !== undefined ? rating.rating.toFixed(1) : t('facility.ratingPending')}</span>
              </div>
              <span className="text-gray-400">•</span>
              <span>{rating?.userRatingCount ? formatCount(rating.userRatingCount, 'review') : t('facility.noReviews')}</span>
            </div>
            <p className="flex items-start text-xs text-gray-500">
              <MapPin className="mr-1 mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              <span className="line-clamp-2">{facility.city}, {facility.address}</span>
            </p>
            {position.source === 'approximate' && (
              <p className="mt-2 text-xs font-semibold text-sky-700">İlçe merkezi tahmini konum</p>
            )}
            {hoursSummary && (
              <p className="mt-2 flex items-center text-xs font-semibold text-emerald-700">
                <Clock3 className="mr-1 h-3.5 w-3.5 flex-shrink-0" />
                {hoursSummary}
              </p>
            )}
            <a
              className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-blue-700"
              href={getGoogleMapsSearchUrl(facility, rating)}
              target="_blank"
              rel="noreferrer"
            >
              {t('map.openGoogleMaps')}
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </InfoWindow>
      )}
    </>
  );
};

function ClusterMarker({ cluster }: { cluster: MarkerCluster }) {
  const { t, formatNumber } = useI18n();
  const map = useMap();
  return (
    <AdvancedMarker
      position={cluster.position}
      title={t('map.clusterTitle', { count: formatNumber(cluster.count) })}
      onClick={() => {
        map?.panTo(cluster.position);
        map?.setZoom(Math.min((map.getZoom() || 11) + 2, 17));
      }}
    >
      <div className="flex h-10 min-w-10 items-center justify-center rounded-full border-2 border-white bg-slate-950 px-3 text-xs font-black text-white shadow-lg">
        {cluster.count}
      </div>
    </AdvancedMarker>
  );
}

export default function MapArea({ provider, results, selectedPlaceId, onSelectPlace, isDark, userLocation, fitBoundsKey }: MapAreaProps) {
  const { t } = useI18n();
  const map = useMap();
  const selected = results.find((result) => result.facility.id === selectedPlaceId);
  const selectedPosition = selected ? getFacilityPosition(selected.facility) : undefined;
  const [viewportBounds, setViewportBounds] = useState<google.maps.LatLngBoundsLiteral | null>(null);

  const updateViewportBounds = useCallback(() => {
    if (!map) return;
    const bounds = map.getBounds();
    if (!bounds) return;
    const northEast = bounds.getNorthEast();
    const southWest = bounds.getSouthWest();
    setViewportBounds({
      north: northEast.lat(),
      east: northEast.lng(),
      south: southWest.lat(),
      west: southWest.lng(),
    });
  }, [map]);

  const viewportResults = useMemo(
    () => chooseViewportResults(results, viewportBounds, selected, selectedPlaceId),
    [results, selected, selectedPlaceId, viewportBounds],
  );
  const clusters = useMemo(() => buildClusters(viewportResults, selectedPlaceId), [viewportResults, selectedPlaceId]);

  useEffect(() => {
    if (!map) return;
    const listener = map.addListener('idle', updateViewportBounds);
    updateViewportBounds();
    return () => listener.remove();
  }, [map, updateViewportBounds]);

  useEffect(() => {
    if (!map || !selectedPosition) return;
    map.panTo(selectedPosition);
    map.setZoom(15);
  }, [map, selectedPosition]);

  useEffect(() => {
    if (!map || results.length === 0) return;
    if (userLocation) {
      map.setCenter(userLocation);
      map.setZoom(12);
      return;
    }
    const positionedResults = results
      .map((result) => getFacilityPosition(result.facility))
      .filter((position): position is NonNullable<typeof position> => Boolean(position))
      .slice(0, 200);
    if (positionedResults.length === 0) return;
    const bounds = new google.maps.LatLngBounds();
    positionedResults.forEach((position) => bounds.extend(position));
    map.fitBounds(bounds, 60);
  }, [fitBoundsKey, map, userLocation]);

  return (
    <GoogleMap
      colorScheme={isDark ? 'DARK' : 'LIGHT'}
      defaultCenter={{ lat: 41.0082, lng: 28.9784 }}
      defaultZoom={12}
      mapId="MY_MULTISPORT_MAP"
      internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
      style={{ width: '100%', height: '100%' }}
      disableDefaultUI={true}
      zoomControl={true}
    >
      {userLocation && (
        <AdvancedMarker position={userLocation} title={t('map.userLocation')}>
          <div className="h-4 w-4 rounded-full border-2 border-white bg-emerald-500 shadow-lg ring-4 ring-emerald-500/25" />
        </AdvancedMarker>
      )}

      {clusters.map((cluster) => {
        if (cluster.result) {
          const isSelected = cluster.result.facility.id === selectedPlaceId;
          return (
            <FacilityMarker
              key={cluster.id}
              provider={provider}
              result={cluster.result}
              isSelected={isSelected}
              onClick={() => onSelectPlace(isSelected ? null : cluster.result?.facility.id || null)}
            />
          );
        }
        return <ClusterMarker key={cluster.id} cluster={cluster} />;
      })}

      <div className="absolute left-4 top-4 rounded-2xl border border-white/60 bg-white/95 px-3 py-2 text-xs font-bold text-slate-700 shadow-lg backdrop-blur dark:border-slate-700 dark:bg-slate-950/90 dark:text-slate-200">
        {provider === 'pluxee' ? 'Kırmızı: Pluxee konumu · Kehribar: Google tahmini · Mavi: ilçe tahmini · Siyah: grup' : t('map.legend')}
      </div>
    </GoogleMap>
  );
}

function markerColor(provider: ProviderId, isSelected: boolean, isRated: boolean, source: 'native' | 'google' | 'approximate'): string {
  if (isSelected) return provider === 'pluxee' ? '#be123c' : '#0f766e';
  if (provider === 'pluxee') {
    if (source === 'google') return '#f59e0b';
    if (source === 'approximate') return '#0284c7';
    return '#e11d48';
  }
  return isRated ? '#2563eb' : '#64748b';
}

function markerBorderColor(provider: ProviderId, isSelected: boolean, isRated: boolean, source: 'native' | 'google' | 'approximate'): string {
  if (isSelected) return provider === 'pluxee' ? '#881337' : '#0f4f49';
  if (provider === 'pluxee') {
    if (source === 'google') return '#b45309';
    if (source === 'approximate') return '#0369a1';
    return '#be123c';
  }
  return isRated ? '#1d4ed8' : '#475569';
}

function chooseViewportResults(
  results: FacilityResult[],
  bounds: google.maps.LatLngBoundsLiteral | null,
  selected: FacilityResult | undefined,
  selectedPlaceId: string | null,
): FacilityResult[] {
  const boundedResults = bounds
    ? results.filter((result) => isWithinBounds(result, bounds))
    : results;
  return includeSelectedResult(boundedResults.slice(0, MAX_VIEWPORT_RESULTS), selected, selectedPlaceId);
}

function includeSelectedResult(
  results: FacilityResult[],
  selected: FacilityResult | undefined,
  selectedPlaceId: string | null,
): FacilityResult[] {
  if (!selected || !selectedPlaceId || results.some((result) => result.facility.id === selectedPlaceId)) {
    return results;
  }
  return [selected, ...results.slice(0, Math.max(MAX_VIEWPORT_RESULTS - 1, 0))];
}

function isWithinBounds(result: FacilityResult, bounds: google.maps.LatLngBoundsLiteral): boolean {
  const position = getFacilityPosition(result.facility);
  if (!position) return false;
  const { lat, lng } = position;
  if (lat < bounds.south || lat > bounds.north) return false;
  if (bounds.west <= bounds.east) return lng >= bounds.west && lng <= bounds.east;
  return lng >= bounds.west || lng <= bounds.east;
}

function buildClusters(results: FacilityResult[], selectedPlaceId: string | null): MarkerCluster[] {
  const selected = selectedPlaceId ? results.find((result) => result.facility.id === selectedPlaceId) : undefined;
  const selectedPosition = selected ? getFacilityPosition(selected.facility) : undefined;
  const buckets = new Map<string, FacilityResult[]>();
  const clusterInput = results
    .filter((result) => result.facility.id !== selectedPlaceId)
    .filter((result) => Boolean(getFacilityPosition(result.facility)));

  for (const result of clusterInput) {
    const position = getFacilityPosition(result.facility);
    if (!position) continue;
    const key = `${Math.round(position.lat / GRID_SIZE)}:${Math.round(position.lng / GRID_SIZE)}`;
    const bucket = buckets.get(key) || [];
    bucket.push(result);
    buckets.set(key, bucket);
  }

  const clusters: MarkerCluster[] = [];
  if (selected && selectedPosition) {
    clusters.push({
      id: `facility-${selected.facility.id}`,
      count: 1,
      position: selectedPosition,
      result: selected,
    });
  }

  for (const [key, bucket] of buckets) {
    if (bucket.length === 1) {
      const result = bucket[0];
      const position = getFacilityPosition(result.facility);
      if (!position) continue;
      clusters.push({
        id: `facility-${result.facility.id}`,
        count: 1,
        position,
        result,
      });
      continue;
    }

    const positions = bucket
      .map((result) => getFacilityPosition(result.facility))
      .filter((position): position is NonNullable<typeof position> => Boolean(position));
    if (positions.length === 0) continue;
    clusters.push({
      id: `cluster-${key}`,
      count: bucket.length,
      position: {
        lat: positions.reduce((sum, position) => sum + position.lat, 0) / positions.length,
        lng: positions.reduce((sum, position) => sum + position.lng, 0) / positions.length,
      },
    });
  }

  return clusters;
}
