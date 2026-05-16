import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Activity,
  AlertTriangle,
  Bookmark,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  CreditCard,
  ExternalLink,
  Filter,
  Globe2,
  Heart,
  Image as ImageIcon,
  Info,
  Loader2,
  LocateFixed,
  MapPin,
  RefreshCw,
  Scale,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
} from 'lucide-react';
import type {
  BenefitFacility,
  FacilityChangeSummary,
  FacilityPersonalKey,
  FacilityResult,
  FacilityStats,
  FilterState,
} from '../types';
import {
  formatOpeningHoursSummary,
  getFacilityDetailUrl,
  getGoogleMapsSearchUrl,
  getPrimaryActivities,
  getPrimaryAmenities,
  getUniqueActivities,
  getUniqueAmenities,
  getUniqueCards,
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
  onOpenDetail: (id: string) => void;
  onLocate: () => void;
  onRefreshRatings: () => void;
  canRefreshRatings: boolean;
  onTogglePersonal: (id: string, key: FacilityPersonalKey) => void;
  compareIds: string[];
  compareResults: FacilityResult[];
  onToggleCompare: (id: string) => void;
  isLoading: boolean;
  isEnriching: boolean;
  error?: string | null;
  stats: FacilityStats;
  facilityChanges: FacilityChangeSummary | null;
}

type SidebarPanel = 'discover' | 'updates' | 'compare';

export default function Sidebar({
  allFacilities,
  results,
  filters,
  setFilters,
  selectedPlaceId,
  onSelectPlace,
  onOpenDetail,
  onLocate,
  onRefreshRatings,
  canRefreshRatings,
  onTogglePersonal,
  compareIds,
  compareResults,
  onToggleCompare,
  isLoading,
  isEnriching,
  error,
  stats,
  facilityChanges,
}: SidebarProps) {
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [panel, setPanel] = useState<SidebarPanel>('discover');
  const cities = useMemo(() => getUniqueCities(allFacilities), [allFacilities]);
  const districts = useMemo(() => getUniqueDistricts(allFacilities, filters.city), [allFacilities, filters.city]);
  const activities = useMemo(() => getUniqueActivities(allFacilities), [allFacilities]);
  const amenities = useMemo(() => getUniqueAmenities(allFacilities), [allFacilities]);
  const cards = useMemo(() => getUniqueCards(allFacilities), [allFacilities]);
  const activeFilterCount = [
    filters.query,
    filters.city,
    filters.district,
    filters.activity,
    filters.card,
    filters.amenity,
    filters.personal,
    filters.radiusKm > 0 ? String(filters.radiusKm) : '',
    filters.minRating > 0 ? String(filters.minRating) : '',
    filters.minReviews > 0 ? String(filters.minReviews) : '',
    filters.hoursMode,
    filters.hasPhoto ? 'photo' : '',
    filters.activeOnly ? 'active' : '',
    filters.internationalOnly ? 'international' : '',
    filters.sort !== 'recommended' ? filters.sort : '',
  ].filter(Boolean).length;

  const updateFilter = <K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    setFilters({
      ...filters,
      [key]: value,
      ...(key === 'city' ? { district: '' } : {}),
    });
  };

  const resetFilters = () => {
    setFilters({
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
    });
  };

  return (
    <aside className="flex h-full w-full flex-col border-r border-[var(--border-soft)] bg-[var(--surface-panel)] text-[var(--text-primary)] shadow-[var(--shadow-panel)] md:w-[455px]">
      <header className="border-b border-[var(--border-soft)] bg-[var(--surface-panel)] px-4 pb-3 pt-4 md:px-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[1.35rem] font-black leading-none tracking-normal md:text-[1.55rem]">MyMultiSport</h1>
            <p className="mt-1.5 max-w-[28ch] text-[13px] leading-5 text-[var(--text-secondary)] md:text-sm">
              Türkiye tesislerini puan, yakınlık ve kişisel listelerle keşfet.
            </p>
          </div>
          <div className="rounded-full border border-[var(--accent-soft)] bg-[var(--accent-muted)] px-3 py-1 text-xs font-black text-[var(--accent-text)]">
            {stats.total.toLocaleString('tr-TR')} tesis
          </div>
        </div>

        <div className="mt-3 grid grid-cols-4 gap-2">
          <Stat label="Sonuç" value={stats.shown.toLocaleString('tr-TR')} />
          <Stat label="Puanlı" value={stats.matched.toLocaleString('tr-TR')} />
          <Stat label="Favori" value={stats.favorites.toLocaleString('tr-TR')} />
          <Stat label="Gittim" value={stats.visited.toLocaleString('tr-TR')} />
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-[var(--surface-muted)] p-1">
          <PanelButton active={panel === 'discover'} onClick={() => setPanel('discover')} label="Keşfet" icon={<Sparkles className="h-4 w-4" />} />
          <PanelButton active={panel === 'updates'} onClick={() => setPanel('updates')} label="Yenilikler" icon={<Clock3 className="h-4 w-4" />} />
          <PanelButton active={panel === 'compare'} onClick={() => setPanel('compare')} label={`Karşılaştır ${compareIds.length ? `(${compareIds.length})` : ''}`} icon={<Scale className="h-4 w-4" />} />
        </div>
      </header>

      {panel === 'discover' && (
      <div className="border-b border-[var(--border-soft)] bg-[var(--surface-panel)] p-3">
        <button
          type="button"
          onClick={() => setIsFilterPanelOpen((value) => !value)}
          aria-expanded={isFilterPanelOpen}
          className="inline-flex h-11 w-full items-center justify-between gap-3 rounded-xl border border-[var(--border-strong)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)]"
        >
          <span className="inline-flex items-center gap-2">
            <Filter className="h-4 w-4" />
            {isFilterPanelOpen ? 'Filtreleri gizle' : 'Filtreleri göster'}
          </span>
          <span className="inline-flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
            {activeFilterCount > 0 ? `${activeFilterCount} aktif` : 'Tümü'}
            {isFilterPanelOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </span>
        </button>
      </div>
      )}

      {panel === 'discover' && (
      <section className={`${isFilterPanelOpen ? 'block' : 'hidden'} app-scrollbar max-h-[56dvh] overflow-y-auto border-b border-[var(--border-soft)] bg-[var(--surface-panel)] p-3 pb-20 md:max-h-[calc(100dvh-15rem)] md:p-4`}>
        <div className="space-y-3">
          <label className="relative block">
            <span className="sr-only">Tesis, ilçe, olanak veya aktivite ara</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
            <input
              type="search"
              value={filters.query}
              onChange={(event) => updateFilter('query', event.target.value)}
              placeholder="Tesis, ilçe, olanak veya aktivite ara"
              className="h-12 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface-raised)] pl-10 pr-3 text-sm font-medium outline-none transition focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-ring)]"
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <Select label="Şehir" value={filters.city} onChange={(value) => updateFilter('city', value)} options={cities} placeholder="Tüm şehirler" />
            <Select label="İlçe" value={filters.district} onChange={(value) => updateFilter('district', value)} options={districts} placeholder="Tüm ilçeler" />
          </div>

          <Select label="Aktivite" value={filters.activity} onChange={(value) => updateFilter('activity', value)} options={activities} placeholder="Tüm aktiviteler" />

          <div className="grid grid-cols-2 gap-2">
            <Select
              label="Sıralama"
              value={filters.sort}
              onChange={(value) => updateFilter('sort', value as FilterState['sort'])}
              options={[
                ['recommended', 'Önerilen'],
                ['distance', 'Mesafe'],
                ['rating_desc', 'Google puanı'],
                ['reviews_desc', 'Yorum sayısı'],
                ['az', 'A-Z'],
              ]}
            />
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
              label="Kart"
              value={filters.card}
              onChange={(value) => updateFilter('card', value)}
              options={cards}
              placeholder="Tüm kartlar"
            />
            <Select
              label="Kişisel"
              value={filters.personal}
              onChange={(value) => updateFilter('personal', value as FilterState['personal'])}
              options={[
                ['favorite', 'Favoriler'],
                ['wantToGo', 'Gitmek istiyorum'],
                ['visited', 'Gittiklerim'],
                ['noted', 'Notlular'],
              ]}
              placeholder="Tümü"
            />
          </div>

          {amenities.length > 0 && (
            <Select label="Olanak" value={filters.amenity} onChange={(value) => updateFilter('amenity', value)} options={amenities} placeholder="Tüm olanaklar" />
          )}

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

          <HoursFilterControls
            mode={filters.hoursMode}
            time={filters.hoursTime}
            endTime={filters.hoursEndTime}
            onModeChange={(value) => updateFilter('hoursMode', value)}
            onTimeChange={(value) => updateFilter('hoursTime', value)}
            onEndTimeChange={(value) => updateFilter('hoursEndTime', value)}
          />

          <div className="grid grid-cols-3 gap-2">
            <ToggleChip active={filters.activeOnly} icon={<CheckCircle2 className="h-3.5 w-3.5" />} label="Aktif" onClick={() => updateFilter('activeOnly', !filters.activeOnly)} />
            <ToggleChip active={filters.hasPhoto} icon={<ImageIcon className="h-3.5 w-3.5" />} label="Fotoğraflı" onClick={() => updateFilter('hasPhoto', !filters.hasPhoto)} />
            <ToggleChip active={filters.internationalOnly} icon={<Globe2 className="h-3.5 w-3.5" />} label="Global" onClick={() => updateFilter('internationalOnly', !filters.internationalOnly)} />
          </div>

          <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
            <button type="button" onClick={onLocate} className="action-button secondary">
              <LocateFixed className="h-4 w-4" />
              Konumum
            </button>
            <button type="button" onClick={onRefreshRatings} disabled={isEnriching || !canRefreshRatings} className="action-button primary disabled:cursor-not-allowed disabled:opacity-60">
              {isEnriching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Puan/saat al
            </button>
            <button type="button" onClick={resetFilters} className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--surface-raised)] text-[var(--text-secondary)] transition hover:bg-[var(--surface-muted)]" aria-label="Filtreleri temizle" title="Filtreleri temizle">
              <SlidersHorizontal className="h-4 w-4" />
            </button>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-[var(--warning-border)] bg-[var(--warning-bg)] px-3 py-2 text-xs text-[var(--warning-text)]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>
      </section>
      )}

      <section className="app-scrollbar flex-1 overflow-y-auto bg-[var(--app-bg)] p-2.5 md:p-3">
        {panel === 'updates' ? (
          <ChangesPanel summary={facilityChanges} />
        ) : panel === 'compare' ? (
          <ComparePanel results={compareResults} onToggleCompare={onToggleCompare} onOpenDetail={onOpenDetail} />
        ) : isLoading ? (
          <div className="flex h-52 flex-col items-center justify-center text-[var(--text-tertiary)]">
            <Loader2 className="mb-2 h-8 w-8 animate-spin" />
            <p className="text-sm">MultiSport tesisleri yükleniyor...</p>
          </div>
        ) : results.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-raised)] p-5 text-center text-sm text-[var(--text-secondary)]">
            <Filter className="mx-auto mb-3 h-6 w-6" />
            Bu filtrelerle tesis bulunamadı.
          </div>
        ) : (
          <div className="flex flex-col gap-2.5 pb-20 md:gap-3 md:pb-4">
            {results.map((result) => (
              <FacilityCard
                key={result.facility.id}
                result={result}
                selected={selectedPlaceId === result.facility.id}
                compareSelected={compareIds.includes(result.facility.id)}
                onClick={() => onSelectPlace(result.facility.id)}
                onOpenDetail={() => onOpenDetail(result.facility.id)}
                onToggleCompare={() => onToggleCompare(result.facility.id)}
                onTogglePersonal={(key) => onTogglePersonal(result.facility.id, key)}
              />
            ))}
          </div>
        )}
      </section>
    </aside>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface-raised)] px-2.5 py-1.5 md:py-2">
      <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-tertiary)]">{label}</div>
      <div className="mt-1 text-sm font-black">{value}</div>
    </div>
  );
}

function PanelButton({ active, onClick, label, icon }: { active: boolean; onClick: () => void; label: string; icon: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-lg text-xs font-black transition md:h-9 ${
        active ? 'bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function HoursFilterControls({
  mode,
  time,
  endTime,
  onModeChange,
  onTimeChange,
  onEndTimeChange,
}: {
  mode: FilterState['hoursMode'];
  time: string;
  endTime: string;
  onModeChange: (value: FilterState['hoursMode']) => void;
  onTimeChange: (value: string) => void;
  onEndTimeChange: (value: string) => void;
}) {
  const needsTime = mode === 'open_at' || mode === 'open_until' || mode === 'open_between';
  const needsEndTime = mode === 'open_between';

  return (
    <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface-raised)] p-2.5">
      <Select
        label="Çalışma saati"
        value={mode}
        onChange={(value) => onModeChange(value as FilterState['hoursMode'])}
        options={[
          ['', 'Tümü'],
          ['open_now', 'Şu an açık'],
          ['closed_now', 'Şu an kapalı'],
          ['open_at', 'Bu saatte açık'],
          ['open_until', 'Bu saate kadar açık'],
          ['open_between', 'Saat aralığında açık'],
        ]}
      />
      {needsTime && (
        <div className={`mt-2 grid gap-2 ${needsEndTime ? 'grid-cols-2' : 'grid-cols-1'}`}>
          <TimeField
            label={mode === 'open_between' ? 'Başlangıç' : 'Saat'}
            value={time}
            onChange={onTimeChange}
          />
          {needsEndTime && (
            <TimeField
              label="Bitiş"
              value={endTime}
              onChange={onEndTimeChange}
            />
          )}
        </div>
      )}
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
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[] | Array<[string, string]>;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-black uppercase tracking-[0.08em] text-[var(--text-tertiary)]">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface-raised)] px-2 text-sm font-semibold outline-none transition focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-ring)]"
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

function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-black uppercase tracking-[0.08em] text-[var(--text-tertiary)]">{label}</span>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-2][0-9]:[0-5][0-9]"
        maxLength={5}
        placeholder="23:00"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface-raised)] px-2 text-sm font-semibold outline-none transition focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-ring)]"
      />
    </label>
  );
}

function ToggleChip({ active, icon, label, onClick }: { active: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border px-2 text-xs font-black transition ${
        active
          ? 'border-[var(--accent-soft)] bg-[var(--accent-muted)] text-[var(--accent-text)]'
          : 'border-[var(--border-strong)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function FacilityCard({
  result,
  selected,
  compareSelected,
  onClick,
  onOpenDetail,
  onToggleCompare,
  onTogglePersonal,
}: {
  result: FacilityResult;
  selected: boolean;
  compareSelected: boolean;
  onClick: () => void;
  onOpenDetail: () => void;
  onToggleCompare: () => void;
  onTogglePersonal: (key: FacilityPersonalKey) => void;
}) {
  const { facility, rating, distanceKm, userState } = result;
  const activities = getPrimaryActivities(facility);
  const amenities = getPrimaryAmenities(facility);
  const ratingReady = rating?.matchStatus === 'matched';
  const mapUrl = getGoogleMapsSearchUrl(facility, rating);
  const hoursSummary = formatOpeningHoursSummary(rating) || (ratingReady ? 'Saat bilgisi yok' : 'Saat bekliyor');

  return (
    <article
      onClick={onClick}
      className={`group cursor-pointer overflow-hidden rounded-2xl border bg-[var(--surface-raised)] shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-soft)] ${
        selected ? 'border-[var(--accent)] ring-4 ring-[var(--accent-ring)]' : 'border-[var(--border-soft)]'
      }`}
    >
      <div className="flex gap-3 p-3">
        {facility.thumbnail ? (
          <img
            src={facility.thumbnail}
            alt=""
            loading="lazy"
            className="h-20 w-20 shrink-0 rounded-xl bg-[var(--surface-muted)] object-cover md:h-24 md:w-24"
          />
        ) : (
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-muted)] text-xs font-black text-[var(--text-tertiary)] md:h-24 md:w-24">
            MS
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h2 className="line-clamp-2 text-sm font-black leading-snug md:text-[15px]">{facility.name}</h2>
            <div className="shrink-0 rounded-full bg-[var(--surface-muted)] px-2 py-1 text-[10px] font-black text-[var(--text-secondary)]">
              {facility.cards.join('/') || 'Kart'}
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-[var(--text-tertiary)]">
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {facility.cityDistrict || facility.city}
            </span>
            {distanceKm !== undefined && <span>{distanceKm.toFixed(1)} km</span>}
            {facility.allowInternationalVisits && <span className="inline-flex items-center gap-1"><Globe2 className="h-3.5 w-3.5" /> Global</span>}
          </div>
          <div className="mt-1.5 inline-flex max-w-full items-center gap-1.5 truncate text-xs font-bold text-[var(--accent-text)]">
            <Clock3 className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{hoursSummary}</span>
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {activities.map((activity) => (
              <span key={activity} className="inline-flex items-center gap-1 rounded-full bg-[var(--chip-blue)] px-2 py-1 text-[11px] font-bold text-[var(--chip-blue-text)]">
                <Activity className="h-3 w-3" />
                {activity}
              </span>
            ))}
            {amenities.map((amenity) => (
              <span key={amenity} className="rounded-full bg-[var(--chip-neutral)] px-2 py-1 text-[11px] font-bold text-[var(--text-secondary)]">
                {amenity}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_auto] items-center gap-3 border-t border-[var(--border-soft)] px-3 py-2">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <Star className={`h-4 w-4 ${ratingReady ? 'fill-amber-400 text-amber-400' : 'text-[var(--text-tertiary)]'}`} />
          {ratingReady ? (
            <span className="font-black">
              {rating.rating?.toFixed(1)}
              <span className="font-semibold text-[var(--text-tertiary)]"> / {rating.userRatingCount?.toLocaleString('tr-TR')} yorum</span>
            </span>
          ) : (
            <span className="text-xs font-bold text-[var(--text-tertiary)]">
              {rating?.matchStatus === 'ambiguous' ? 'Eşleşme belirsiz' : rating?.matchStatus === 'not_found' ? 'Google kaydı yok' : 'Puan bekliyor'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <MiniStateButton label="Favori" active={Boolean(userState?.favorite)} onClick={() => onTogglePersonal('favorite')}>
            <Heart className={`h-4 w-4 ${userState?.favorite ? 'fill-current' : ''}`} />
          </MiniStateButton>
          <MiniStateButton label="Gitmek istiyorum" active={Boolean(userState?.wantToGo)} onClick={() => onTogglePersonal('wantToGo')}>
            <Bookmark className={`h-4 w-4 ${userState?.wantToGo ? 'fill-current' : ''}`} />
          </MiniStateButton>
          <MiniStateButton label="Gittim" active={Boolean(userState?.visited)} onClick={() => onTogglePersonal('visited')}>
            <CheckCircle2 className={`h-4 w-4 ${userState?.visited ? 'fill-current' : ''}`} />
          </MiniStateButton>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onToggleCompare();
            }}
            className={`inline-flex h-8 w-8 items-center justify-center rounded-full transition ${
              compareSelected ? 'bg-[var(--accent)] text-white' : 'bg-[var(--surface-muted)] text-[var(--text-secondary)] hover:bg-[var(--accent-muted)] hover:text-[var(--accent-text)]'
            }`}
            aria-label={`${facility.name} karşılaştır`}
            title="Karşılaştır"
          >
            <Scale className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-[var(--border-soft)] px-3 py-2">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onOpenDetail();
          }}
          className="inline-flex items-center gap-1.5 text-xs font-black text-[var(--accent-text)]"
        >
          <Info className="h-3.5 w-3.5" />
          Detay
        </button>
        <div className="flex items-center gap-3">
          <a
            href={getFacilityDetailUrl(facility)}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => event.stopPropagation()}
            className="text-xs font-black text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
          >
            MultiSport
          </a>
          <a
            href={mapUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => event.stopPropagation()}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--surface-muted)] text-[var(--text-secondary)] transition hover:bg-[var(--accent)] hover:text-white"
            aria-label={`${facility.name} Google Haritalar`}
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </div>
    </article>
  );
}

function MiniStateButton({ active, label, onClick, children }: { active: boolean; label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-full transition ${
        active ? 'bg-[var(--accent-muted)] text-[var(--accent-text)]' : 'bg-[var(--surface-muted)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
      }`}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}

function ChangesPanel({ summary }: { summary: FacilityChangeSummary | null }) {
  if (!summary) {
    return (
      <div className="rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-raised)] p-5 text-sm text-[var(--text-secondary)]">
        Henüz değişim özeti üretilmedi. Bir sonraki tesis sync/build işleminde statik özet oluşacak.
      </div>
    );
  }

  const totalChanges = summary.newFacilities.length + summary.removedFacilities.length + summary.updatedFacilities.length;

  return (
    <div className="space-y-3 pb-24 md:pb-4">
      <div className="rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-raised)] p-4 shadow-[var(--shadow-card)]">
        <div className="text-[11px] font-black uppercase tracking-[0.08em] text-[var(--text-tertiary)]">Veri güncellemesi</div>
        <div className="mt-1 text-lg font-black">{totalChanges.toLocaleString('tr-TR')} değişiklik</div>
        <p className="mt-2 text-sm leading-5 text-[var(--text-secondary)]">
          {summary.previousCount.toLocaleString('tr-TR')} tesisten {summary.currentCount.toLocaleString('tr-TR')} tesise güncellendi.
        </p>
      </div>
      <ChangeSection title="Yeni tesisler" items={summary.newFacilities} />
      <ChangeSection title="Kaldırılan tesisler" items={summary.removedFacilities} />
      <UpdatedSection items={summary.updatedFacilities} />
    </div>
  );
}

function ChangeSection({ title, items }: { title: string; items: Array<{ id: string; name: string; city: string; cityDistrict: string; activities: string[] }> }) {
  return (
    <section className="rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-raised)] p-4">
      <h2 className="text-sm font-black">{title}</h2>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-[var(--text-tertiary)]">Bu build'de kayıt yok.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {items.slice(0, 20).map((item) => (
            <div key={item.id} className="rounded-xl bg-[var(--surface-muted)] p-3">
              <div className="text-sm font-black">{item.name}</div>
              <div className="mt-1 text-xs font-semibold text-[var(--text-tertiary)]">{item.cityDistrict || item.city}</div>
              {item.activities.length > 0 && <div className="mt-1 text-xs text-[var(--text-secondary)]">{item.activities.slice(0, 3).join(', ')}</div>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function UpdatedSection({ items }: { items: FacilityChangeSummary['updatedFacilities'] }) {
  return (
    <section className="rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-raised)] p-4">
      <h2 className="text-sm font-black">Güncellenen tesisler</h2>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-[var(--text-tertiary)]">Bu build'de kayıt yok.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {items.slice(0, 20).map((item) => (
            <div key={item.id} className="rounded-xl bg-[var(--surface-muted)] p-3">
              <div className="text-sm font-black">{item.name}</div>
              <div className="mt-1 text-xs font-semibold text-[var(--text-tertiary)]">{item.cityDistrict || item.city}</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {item.changedFields.map((field) => (
                  <span key={field} className="rounded-full bg-[var(--chip-blue)] px-2 py-1 text-[10px] font-black text-[var(--chip-blue-text)]">
                    {field}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ComparePanel({ results, onToggleCompare, onOpenDetail }: { results: FacilityResult[]; onToggleCompare: (id: string) => void; onOpenDetail: (id: string) => void }) {
  if (results.length < 2) {
    return (
      <div className="rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-raised)] p-5 text-sm leading-6 text-[var(--text-secondary)]">
        Karşılaştırma için listeden en az iki tesis seç. En fazla dört tesis yan yana değerlendirilebilir.
      </div>
    );
  }

  return (
    <div className="grid gap-3 pb-24 md:pb-4">
      {results.map((result) => {
        const { facility, rating, distanceKm } = result;
        return (
          <article key={facility.id} className="rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-raised)] p-4 shadow-[var(--shadow-card)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-black leading-snug">{facility.name}</h2>
                <p className="mt-1 text-xs font-semibold text-[var(--text-tertiary)]">{facility.cityDistrict || facility.city}</p>
              </div>
              <button type="button" onClick={() => onToggleCompare(facility.id)} className="rounded-full bg-[var(--surface-muted)] px-3 py-1 text-xs font-black text-[var(--text-secondary)]">
                Çıkar
              </button>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <CompareMetric label="Puan" value={rating?.matchStatus === 'matched' ? rating.rating?.toFixed(1) || '-' : '-'} />
              <CompareMetric label="Yorum" value={rating?.userRatingCount ? rating.userRatingCount.toLocaleString('tr-TR') : '-'} />
              <CompareMetric label="Mesafe" value={distanceKm !== undefined ? `${distanceKm.toFixed(1)} km` : '-'} />
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {getPrimaryActivities(facility, 5).map((activity) => (
                <span key={activity} className="rounded-full bg-[var(--chip-blue)] px-2 py-1 text-[11px] font-bold text-[var(--chip-blue-text)]">{activity}</span>
              ))}
              {facility.cards.map((card) => (
                <span key={card} className="inline-flex items-center gap-1 rounded-full bg-[var(--chip-neutral)] px-2 py-1 text-[11px] font-bold text-[var(--text-secondary)]">
                  <CreditCard className="h-3 w-3" />
                  {card}
                </span>
              ))}
            </div>
            <button type="button" onClick={() => onOpenDetail(facility.id)} className="mt-4 text-xs font-black text-[var(--accent-text)]">
              Detayı aç
            </button>
          </article>
        );
      })}
    </div>
  );
}

function CompareMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[var(--surface-muted)] p-3">
      <div className="text-[10px] font-black uppercase tracking-[0.08em] text-[var(--text-tertiary)]">{label}</div>
      <div className="mt-1 text-sm font-black">{value}</div>
    </div>
  );
}
