import { AdvancedMarker, InfoWindow, Map, Pin, useAdvancedMarkerRef, useMap } from '@vis.gl/react-google-maps';
import { ExternalLink, MapPin, Star } from 'lucide-react';
import { useEffect } from 'react';
import type { FacilityResult, UserLocation } from '../types';
import { getGoogleMapsSearchUrl } from '../lib/facilities';

interface MapAreaProps {
  results: FacilityResult[];
  selectedPlaceId: string | null;
  onSelectPlace: (id: string | null) => void;
  isDark: boolean;
  userLocation?: UserLocation;
}

const FacilityMarker = ({ result, isSelected, onClick }: { result: FacilityResult, isSelected: boolean, onClick: () => void }) => {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const { facility, rating } = result;

  const position = {
    lat: facility.lat,
    lng: facility.lng,
  };

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
          background={isSelected ? '#0f766e' : rating?.matchStatus === 'matched' ? '#2563eb' : '#ef4444'}
          borderColor={isSelected ? '#0f4f49' : rating?.matchStatus === 'matched' ? '#1d4ed8' : '#b91c1c'}
          glyphColor="#ffffff"
          scale={isSelected ? 1.2 : 1.0}
        />
      </AdvancedMarker>

      {isSelected && (
        <InfoWindow anchor={marker} onCloseClick={onClick} className="min-w-[200px]">
          <div className="p-1 font-sans text-gray-900">
            <h3 className="font-semibold text-base mb-1">{facility.name}</h3>
            <div className="flex items-center gap-2 text-sm text-gray-700 mb-2">
              <div className="flex items-center font-medium">
                <Star className="w-4 h-4 text-amber-400 fill-amber-400 mr-1" />
                <span>{rating?.rating ? rating.rating.toFixed(1) : 'Bekliyor'}</span>
              </div>
              <span className="text-gray-400">•</span>
              <span>{rating?.userRatingCount ? `${rating.userRatingCount} yorum` : 'Yorum yok'}</span>
            </div>
            <p className="text-xs text-gray-500 flex items-start">
              <MapPin className="w-3.5 h-3.5 mr-1 flex-shrink-0 mt-0.5" />
              <span className="line-clamp-2">{facility.city}, {facility.address}</span>
            </p>
            <a
              className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-blue-700"
              href={rating?.googleMapsUri || getGoogleMapsSearchUrl(facility)}
              target="_blank"
              rel="noreferrer"
            >
              Google Haritalar'da aç
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </InfoWindow>
      )}
    </>
  );
};

export default function MapArea({ results, selectedPlaceId, onSelectPlace, isDark, userLocation }: MapAreaProps) {
  const map = useMap();
  const selected = results.find((result) => result.facility.id === selectedPlaceId);

  useEffect(() => {
    if (!map || !selected) return;
    map.panTo({ lat: selected.facility.lat, lng: selected.facility.lng });
    map.setZoom(15);
  }, [map, selected]);

  useEffect(() => {
    if (!map || results.length === 0) return;
    if (userLocation) {
      map.setCenter(userLocation);
      map.setZoom(12);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    results.slice(0, 200).forEach((result) => bounds.extend({ lat: result.facility.lat, lng: result.facility.lng }));
    map.fitBounds(bounds, 60);
  }, [map, results, userLocation]);

  return (
    <Map
      colorScheme={isDark ? 'DARK' : 'LIGHT'}
      defaultCenter={{ lat: 41.0082, lng: 28.9784 }} // Default: Istanbul
      defaultZoom={12}
      mapId="MY_MULTISPORT_MAP"
      internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
      style={{ width: '100%', height: '100%' }}
      disableDefaultUI={true}
      zoomControl={true}
    >
      {userLocation && (
        <AdvancedMarker position={userLocation} title="Konumunuz">
          <div className="h-4 w-4 rounded-full border-2 border-white bg-emerald-500 shadow-lg ring-4 ring-emerald-500/25" />
        </AdvancedMarker>
      )}

      {results.slice(0, 350).map((result) => {
        const isSelected = result.facility.id === selectedPlaceId;
        return (
          <FacilityMarker
            key={result.facility.id}
            result={result}
            isSelected={isSelected} 
            onClick={() => onSelectPlace(isSelected ? null : result.facility.id)}
          />
        );
      })}
    </Map>
  );
}
