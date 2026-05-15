import { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Filter,
  Loader2,
  LocateFixed,
  MapPin,
  RefreshCw,
  Square,
  Search,
  Star,
} from 'lucide-react';
import type { BenefitFacility, FacilityResult, FilterState, FacilityStats } from '../types';
import {
  getFacilityDetailUrl,
  getGoogleMapsSearchUrl,
  getPrimaryActivities,
  getUniqueActivities,
  getUniqueCities,
  getUniqueDistricts,
} from '../lib/facilities';

interface SidebarProps {
  allFacilities: BenefitFacility[];
  results: FacilityResult[];
  filters: FilterState;
  setFilters: (filters: FilterState) => void;
  selectedPlaceId: string | null;
  onSelectPlace: (id: string) => void;
  onLocate: () => void;
  onRefreshRatings: () => void;
  isLoading: boolean;
  isEnriching: boolean;
  error?: string | null;
  stats: FacilityStats;
}

export default function Sidebar({
  allFacilities,
  results,
  filters,
  setFilters,
  selectedPlaceId,
  onSelectPlace,
  onLocate,
  onRefreshRatings,
  isLoading,
  isEnriching,
  error,
  stats,
}: SidebarProps) {
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const cities = getUniqueCities(allFacilities);
  const districts = getUniqueDistricts(allFacilities, filters.city);
  const activities = getUniqueActivities(allFacilities);
  const activeFilterCount = [
    filters.query,
    filters.city,
    filters.district,
    filters.activity,
    filters.radiusKm > 0 ? String(filters.radiusKm) : '',
    filters.minRating > 0 ? String(filters.minRating) : '',
    filters.minReviews > 0 ? String(filters.minReviews) : '',
    filters.sort !== 'distance' ? filters.sort : '',
  ].filter(Boolean).length;

  const updateFilter = <K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    setFilters({
      ...filters,
      [key]: value,
      ...(key === 'city' ? { district: '' } : {}),
    });
  };

  return (
    <aside className="flex h-full w-full flex-col border-r border-slate-200 bg-white text-slate-950 shadow-xl dark:border-slate-800 dark:bg-slate-950 dark:text-slate-50 md:w-[430px]">
      <header className="border-b border-slate-200 bg-white px-5 pb-4 pt-5 dark:border-slate-800 dark:bg-slate-950">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-[1.55rem] font-black leading-tight">MyMultiSport</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">MultiSport tesisleri, Google puanları ve yakınlık sıralaması.</p>
          </div>
          <div className="rounded-full bg-blue-600 px-3 py-1 text-xs font-bold text-white">
            {stats.total.toLocaleString('tr-TR')} tesis
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <Stat label="Gösterilen" value={stats.shown.toLocaleString('tr-TR')} />
          <Stat label="Puanlı" value={stats.matched.toLocaleString('tr-TR')} />
          <Stat label="Bekleyen" value={stats.pending.toLocaleString('tr-TR')} />
        </div>
      </header>

      <section className="space-y-3 border-b border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950 md:hidden">
        <SearchInput value={filters.query} onChange={(value) => updateFilter('query', value)} />
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <SortSelect value={filters.sort} onChange={(value) => updateFilter('sort', value)} compact />
          <button
            type="button"
            onClick={onRefreshRatings}
            disabled={results.length === 0}
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-blue-600 text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            aria-label={isEnriching ? 'Puan çekmeyi durdur' : 'Google puanlarını al'}
            title={isEnriching ? 'Puan çekmeyi durdur' : 'Google puanlarını al'}
          >
            {isEnriching ? <Square className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
          </button>
        </div>
      </section>

      <div className="border-b border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950 md:hidden">
        <button
          type="button"
          onClick={() => setIsFilterPanelOpen((value) => !value)}
          aria-expanded={isFilterPanelOpen}
          className="inline-flex h-11 w-full items-center justify-between gap-3 rounded-lg border border-slate-300 bg-slate-50 px-4 text-sm font-bold text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        >
          <span className="inline-flex items-center gap-2">
            <Filter className="h-4 w-4" />
            {isFilterPanelOpen ? 'Filtreleri gizle' : 'Filtreleri göster'}
          </span>
          <span className="inline-flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            {activeFilterCount > 0 ? `${activeFilterCount} aktif` : 'Tümü'}
            {isFilterPanelOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </span>
        </button>
      </div>

      <section className={`${isFilterPanelOpen ? 'block' : 'hidden'} space-y-3 border-b border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/70 md:block`}>
        <div className="hidden md:block">
          <SearchInput value={filters.query} onChange={(value) => updateFilter('query', value)} />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Select
            label="Şehir"
            value={filters.city}
            onChange={(value) => updateFilter('city', value)}
            options={cities}
            placeholder="Tüm şehirler"
          />
          <Select
            label="İlçe"
            value={filters.district}
            onChange={(value) => updateFilter('district', value)}
            options={districts}
            placeholder="Tüm ilçeler"
          />
        </div>

        <Select
          label="Aktivite"
          value={filters.activity}
          onChange={(value) => updateFilter('activity', value)}
          options={activities}
          placeholder="Tüm aktiviteler"
        />

        <div className="hidden grid-cols-2 gap-2 md:grid">
          <SortSelect value={filters.sort} onChange={(value) => updateFilter('sort', value)} />
          <Select
            label="Mesafe"
            value={String(filters.radiusKm)}
            onChange={(value) => updateFilter('radiusKm', Number(value))}
            options={[
              ['0', 'Tümü'],
              ['2', '2 km'],
              ['5', '5 km'],
              ['10', '10 km'],
              ['25', '25 km'],
              ['50', '50 km'],
            ]}
          />
        </div>

        <div className="md:hidden">
          <Select
            label="Mesafe"
            value={String(filters.radiusKm)}
            onChange={(value) => updateFilter('radiusKm', Number(value))}
            options={[
              ['0', 'Tümü'],
              ['2', '2 km'],
              ['5', '5 km'],
              ['10', '10 km'],
              ['25', '25 km'],
              ['50', '50 km'],
            ]}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Select
            label="Min. puan"
            value={String(filters.minRating)}
            onChange={(value) => updateFilter('minRating', Number(value))}
            options={[
              ['0', 'Tümü'],
              ['3.5', '3.5+'],
              ['4', '4.0+'],
              ['4.3', '4.3+'],
              ['4.5', '4.5+'],
              ['4.7', '4.7+'],
            ]}
          />
          <Select
            label="Min. yorum"
            value={String(filters.minReviews)}
            onChange={(value) => updateFilter('minReviews', Number(value))}
            options={[
              ['0', 'Tümü'],
              ['10', '10+'],
              ['50', '50+'],
              ['100', '100+'],
              ['500', '500+'],
            ]}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onLocate}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white text-sm font-semibold transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:hover:bg-slate-900"
          >
            <LocateFixed className="h-4 w-4" />
            Konumum
          </button>
          <button
            type="button"
            onClick={onRefreshRatings}
            disabled={results.length === 0}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isEnriching ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Durdur
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                Puanları al
              </>
            )}
          </button>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </section>

      <section className="flex-1 overflow-y-auto bg-slate-100 p-3 dark:bg-slate-950">
        {isLoading ? (
          <div className="flex h-52 flex-col items-center justify-center text-slate-500">
            <Loader2 className="mb-2 h-8 w-8 animate-spin" />
            <p className="text-sm">MultiSport tesisleri yükleniyor...</p>
          </div>
        ) : results.length === 0 ? (
          <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white p-5 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900">
            <Filter className="mx-auto mb-3 h-6 w-6" />
            Bu filtrelerle tesis bulunamadı.
          </div>
        ) : (
          <div className="flex flex-col gap-3 pb-24 md:pb-4">
            {results.map((result) => (
              <FacilityCard
                key={result.facility.id}
                result={result}
                selected={selectedPlaceId === result.facility.id}
                onClick={() => onSelectPlace(result.facility.id)}
              />
            ))}
          </div>
        )}
      </section>
    </aside>
  );
}

function SearchInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="relative block">
      <span className="sr-only">Tesis, ilçe veya aktivite ara</span>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Tesis, ilçe veya aktivite ara"
        className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950"
      />
    </label>
  );
}

function SortSelect({
  value,
  onChange,
  compact = false,
}: {
  value: FilterState['sort'];
  onChange: (value: FilterState['sort']) => void;
  compact?: boolean;
}) {
  return (
    <Select
      label={compact ? undefined : 'Sıralama'}
      value={value}
      onChange={(nextValue) => onChange(nextValue as FilterState['sort'])}
      options={[
        ['distance', 'Mesafe'],
        ['rating_desc', 'Google puanı yüksek'],
        ['reviews_desc', 'Yorum sayısı yüksek'],
        ['az', 'A-Z'],
      ]}
    />
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
      <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
      <div className="text-sm font-black">{value}</div>
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: string[] | Array<[string, string]>;
  placeholder?: string;
}) {
  return (
    <label className="block">
      {label && <span className="mb-1 block text-xs font-bold text-slate-500 dark:text-slate-400">{label}</span>}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950"
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((option) => {
          const [optionValue, optionLabel] = Array.isArray(option) ? option : [option, option];
          return (
            <option key={optionValue} value={optionValue}>
              {optionLabel}
            </option>
          );
        })}
      </select>
    </label>
  );
}

function FacilityCard({ result, selected, onClick }: { result: FacilityResult; selected: boolean; onClick: () => void }) {
  const { facility, rating, distanceKm } = result;
  const activities = getPrimaryActivities(facility);
  const ratingReady = rating?.matchStatus === 'matched';
  const mapUrl = rating?.googleMapsUri || getGoogleMapsSearchUrl(facility);

  return (
    <article
      onClick={onClick}
      className={`cursor-pointer overflow-hidden rounded-xl border bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:bg-slate-900 ${
        selected ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-slate-200 dark:border-slate-800'
      }`}
    >
      <div className="flex gap-3 p-3">
        {facility.thumbnail ? (
          <img
            src={facility.thumbnail}
            alt=""
            loading="lazy"
            className="h-20 w-20 shrink-0 rounded-lg bg-slate-200 object-cover dark:bg-slate-800"
          />
        ) : (
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-slate-200 text-xs font-black text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            MS
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h2 className="line-clamp-2 text-sm font-black leading-snug">{facility.name}</h2>
            <div className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {facility.cards.join('/')}
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {facility.cityDistrict || facility.city}
            </span>
            {distanceKm !== undefined && <span>{distanceKm.toFixed(1)} km</span>}
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {activities.map((activity) => (
              <span key={activity} className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-800 dark:bg-blue-950/40 dark:text-blue-200">
                <Activity className="h-3 w-3" />
                {activity}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_auto] items-center gap-3 border-t border-slate-100 px-3 py-2 dark:border-slate-800">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <Star className={`h-4 w-4 ${ratingReady ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />
          {ratingReady ? (
            <span className="font-black">{rating.rating?.toFixed(1)} <span className="font-medium text-slate-500">/ {rating.userRatingCount?.toLocaleString('tr-TR')} yorum</span></span>
          ) : (
            <span className="text-xs font-semibold text-slate-500">
              {rating?.matchStatus === 'ambiguous' ? 'Eşleşme belirsiz' : rating?.matchStatus === 'not_found' ? 'Google kaydı bulunamadı' : 'Puan bekliyor'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <a
            href={getFacilityDetailUrl(facility)}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => event.stopPropagation()}
            className="text-xs font-bold text-slate-500 hover:text-slate-950 dark:hover:text-white"
          >
            MultiSport
          </a>
          <a
            href={mapUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => event.stopPropagation()}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-700 transition hover:bg-blue-600 hover:text-white dark:bg-slate-800 dark:text-slate-200"
            aria-label={`${facility.name} Google Haritalar`}
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </div>
    </article>
  );
}
