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
  formatDistanceKm,
  SUPPORTED_LANGUAGES,
  useI18n,
} from '../lib/i18n';
import type { LanguageCode } from '../lib/i18n';
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
  const { language, t, formatNumber, formatCount } = useI18n();
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
              {t('app.description')}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <LanguageSelector />
            <div className="rounded-full border border-[var(--accent-soft)] bg-[var(--accent-muted)] px-3 py-1 text-xs font-black text-[var(--accent-text)]">
              {formatCount(stats.total, 'facility')}
            </div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-4 gap-2">
          <Stat label={t('stats.results')} value={formatNumber(stats.shown)} />
          <Stat label={t('stats.rated')} value={formatNumber(stats.matched)} />
          <Stat label={t('stats.favorite')} value={formatNumber(stats.favorites)} />
          <Stat label={t('stats.visited')} value={formatNumber(stats.visited)} />
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-[var(--surface-muted)] p-1">
          <PanelButton active={panel === 'discover'} onClick={() => setPanel('discover')} label={t('panels.discover')} icon={<Sparkles className="h-4 w-4" />} />
          <PanelButton active={panel === 'updates'} onClick={() => setPanel('updates')} label={t('panels.updates')} icon={<Clock3 className="h-4 w-4" />} />
          <PanelButton active={panel === 'compare'} onClick={() => setPanel('compare')} label={`${t('panels.compare')}${compareIds.length ? ` (${formatNumber(compareIds.length)})` : ''}`} icon={<Scale className="h-4 w-4" />} />
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
            {isFilterPanelOpen ? t('filters.hide') : t('filters.show')}
          </span>
          <span className="inline-flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
            {activeFilterCount > 0 ? t('filters.activeCount', { count: formatNumber(activeFilterCount) }) : t('filters.all')}
            {isFilterPanelOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </span>
        </button>
      </div>
      )}

      {panel === 'discover' && (
      <section className={`${isFilterPanelOpen ? 'block' : 'hidden'} app-scrollbar max-h-[56dvh] overflow-y-auto border-b border-[var(--border-soft)] bg-[var(--surface-panel)] p-3 pb-20 md:max-h-[calc(100dvh-15rem)] md:p-4`}>
        <div className="space-y-3">
          <label className="relative block">
            <span className="sr-only">{t('filters.searchLabel')}</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
            <input
              type="search"
              value={filters.query}
              onChange={(event) => updateFilter('query', event.target.value)}
              placeholder={t('filters.searchPlaceholder')}
              className="h-12 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface-raised)] pl-10 pr-3 text-sm font-medium outline-none transition focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-ring)]"
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <Select label={t('filters.city')} value={filters.city} onChange={(value) => updateFilter('city', value)} options={cities} placeholder={t('placeholders.allCities')} />
            <Select label={t('filters.district')} value={filters.district} onChange={(value) => updateFilter('district', value)} options={districts} placeholder={t('placeholders.allDistricts')} />
          </div>

          <Select label={t('filters.activity')} value={filters.activity} onChange={(value) => updateFilter('activity', value)} options={activities} placeholder={t('placeholders.allActivities')} />

          <div className="grid grid-cols-2 gap-2">
            <Select
              label={t('filters.sort')}
              value={filters.sort}
              onChange={(value) => updateFilter('sort', value as FilterState['sort'])}
              options={[
                ['recommended', t('sort.recommended')],
                ['distance', t('sort.distance')],
                ['rating_desc', t('sort.rating')],
                ['reviews_desc', t('sort.reviews')],
                ['az', t('sort.az')],
              ]}
            />
            <Select
              label={t('filters.distance')}
              value={String(filters.radiusKm)}
              onChange={(value) => updateFilter('radiusKm', Number(value))}
              options={[
                ['0', t('filters.all')],
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
              label={t('filters.card')}
              value={filters.card}
              onChange={(value) => updateFilter('card', value)}
              options={cards}
              placeholder={t('placeholders.allCards')}
            />
            <Select
              label={t('filters.personal')}
              value={filters.personal}
              onChange={(value) => updateFilter('personal', value as FilterState['personal'])}
              options={[
                ['favorite', t('personal.favorites')],
                ['wantToGo', t('personal.wantToGo')],
                ['visited', t('personal.visited')],
                ['noted', t('personal.noted')],
              ]}
              placeholder={t('filters.all')}
            />
          </div>

          {amenities.length > 0 && (
            <Select label={t('filters.amenity')} value={filters.amenity} onChange={(value) => updateFilter('amenity', value)} options={amenities} placeholder={t('placeholders.allAmenities')} />
          )}

          <div className="grid grid-cols-2 gap-2">
            <Select
              label={t('filters.minRating')}
              value={String(filters.minRating)}
              onChange={(value) => updateFilter('minRating', Number(value))}
              options={[
                ['0', t('filters.all')],
                ['3.5', '3.5+'],
                ['4', '4.0+'],
                ['4.3', '4.3+'],
                ['4.5', '4.5+'],
                ['4.7', '4.7+'],
              ]}
            />
            <Select
              label={t('filters.minReviews')}
              value={String(filters.minReviews)}
              onChange={(value) => updateFilter('minReviews', Number(value))}
              options={[
                ['0', t('filters.all')],
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
            <ToggleChip active={filters.activeOnly} icon={<CheckCircle2 className="h-3.5 w-3.5" />} label={t('filters.activeOnly')} onClick={() => updateFilter('activeOnly', !filters.activeOnly)} />
            <ToggleChip active={filters.hasPhoto} icon={<ImageIcon className="h-3.5 w-3.5" />} label={t('filters.withPhoto')} onClick={() => updateFilter('hasPhoto', !filters.hasPhoto)} />
            <ToggleChip active={filters.internationalOnly} icon={<Globe2 className="h-3.5 w-3.5" />} label={t('filters.global')} onClick={() => updateFilter('internationalOnly', !filters.internationalOnly)} />
          </div>

          <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
            <button type="button" onClick={onLocate} className="action-button secondary">
              <LocateFixed className="h-4 w-4" />
              {t('filters.myLocation')}
            </button>
            <button type="button" onClick={onRefreshRatings} disabled={isEnriching || !canRefreshRatings} className="action-button primary disabled:cursor-not-allowed disabled:opacity-60">
              {isEnriching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {t('filters.fetchRatingsHours')}
            </button>
            <button type="button" onClick={resetFilters} className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--surface-raised)] text-[var(--text-secondary)] transition hover:bg-[var(--surface-muted)]" aria-label={t('filters.clear')} title={t('filters.clear')}>
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
            <p className="text-sm">{t('status.loadingFacilities')}</p>
          </div>
        ) : results.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-raised)] p-5 text-center text-sm text-[var(--text-secondary)]">
            <Filter className="mx-auto mb-3 h-6 w-6" />
            {t('status.noResults')}
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
                language={language}
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

function LanguageSelector() {
  const { language, setLanguage, t } = useI18n();

  return (
    <label className="inline-flex h-8 max-w-[9rem] items-center gap-1.5 rounded-full border border-[var(--border-strong)] bg-[var(--surface-raised)] px-2 text-xs font-black text-[var(--text-secondary)]">
      <Globe2 className="h-3.5 w-3.5 shrink-0" />
      <span className="sr-only">{t('language.selectLabel')}</span>
      <select
        aria-label={t('language.selectLabel')}
        value={language}
        onChange={(event) => setLanguage(event.target.value as LanguageCode)}
        className="min-w-0 bg-transparent text-xs font-black outline-none"
      >
        {SUPPORTED_LANGUAGES.map((item) => (
          <option key={item.code} value={item.code}>
            {item.nativeLabel}
          </option>
        ))}
      </select>
    </label>
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
  const { t } = useI18n();
  const needsTime = mode === 'open_at' || mode === 'open_until' || mode === 'open_between';
  const needsEndTime = mode === 'open_between';

  return (
    <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface-raised)] p-2.5">
      <Select
        label={t('filters.hours')}
        value={mode}
        onChange={(value) => onModeChange(value as FilterState['hoursMode'])}
        options={[
          ['', t('hours.all')],
          ['open_now', t('hours.openNow')],
          ['closed_now', t('hours.closedNow')],
          ['open_at', t('hours.openAt')],
          ['open_until', t('hours.openUntil')],
          ['open_between', t('hours.openBetween')],
        ]}
      />
      {needsTime && (
        <div className={`mt-2 grid gap-2 ${needsEndTime ? 'grid-cols-2' : 'grid-cols-1'}`}>
          <TimeField
            label={mode === 'open_between' ? t('filters.start') : t('filters.time')}
            value={time}
            onChange={onTimeChange}
          />
          {needsEndTime && (
            <TimeField
              label={t('filters.end')}
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
  language,
}: {
  result: FacilityResult;
  selected: boolean;
  compareSelected: boolean;
  onClick: () => void;
  onOpenDetail: () => void;
  onToggleCompare: () => void;
  onTogglePersonal: (key: FacilityPersonalKey) => void;
  language: LanguageCode;
}) {
  const { t, formatCount } = useI18n();
  const { facility, rating, distanceKm, userState } = result;
  const activities = getPrimaryActivities(facility);
  const amenities = getPrimaryAmenities(facility);
  const ratingReady = rating?.matchStatus === 'matched';
  const mapUrl = getGoogleMapsSearchUrl(facility, rating);
  const hoursSummary = formatOpeningHoursSummary(rating, language) || (ratingReady ? t('facility.noHours') : t('facility.hoursPending'));
  const ratingFallback = rating?.matchStatus === 'ambiguous'
    ? t('facility.matchAmbiguous')
    : rating?.matchStatus === 'not_found'
      ? t('facility.googleNotFound')
      : t('facility.ratingPending');

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
              {facility.cards.join('/') || t('facility.cardFallback')}
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-[var(--text-tertiary)]">
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {facility.cityDistrict || facility.city}
            </span>
            {distanceKm !== undefined && <span>{formatDistanceKm(distanceKm, language)}</span>}
            {facility.allowInternationalVisits && <span className="inline-flex items-center gap-1"><Globe2 className="h-3.5 w-3.5" /> {t('facility.global')}</span>}
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
              <span className="font-semibold text-[var(--text-tertiary)]"> / {formatCount(rating.userRatingCount || 0, 'review')}</span>
            </span>
          ) : (
            <span className="text-xs font-bold text-[var(--text-tertiary)]">
              {ratingFallback}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <MiniStateButton label={t('personal.favorite')} active={Boolean(userState?.favorite)} onClick={() => onTogglePersonal('favorite')}>
            <Heart className={`h-4 w-4 ${userState?.favorite ? 'fill-current' : ''}`} />
          </MiniStateButton>
          <MiniStateButton label={t('personal.wantToGo')} active={Boolean(userState?.wantToGo)} onClick={() => onTogglePersonal('wantToGo')}>
            <Bookmark className={`h-4 w-4 ${userState?.wantToGo ? 'fill-current' : ''}`} />
          </MiniStateButton>
          <MiniStateButton label={t('personal.visitedAction')} active={Boolean(userState?.visited)} onClick={() => onTogglePersonal('visited')}>
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
            aria-label={`${facility.name} ${t('facility.compare')}`}
            title={t('facility.compare')}
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
          {t('facility.detail')}
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
            aria-label={`${facility.name} ${t('facility.googleMaps')}`}
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
  const { t, formatNumber, formatCount } = useI18n();

  if (!summary) {
    return (
      <div className="rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-raised)] p-5 text-sm text-[var(--text-secondary)]">
        {t('updates.emptySummary')}
      </div>
    );
  }

  const totalChanges = summary.newFacilities.length + summary.removedFacilities.length + summary.updatedFacilities.length;

  return (
    <div className="space-y-3 pb-24 md:pb-4">
      <div className="rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-raised)] p-4 shadow-[var(--shadow-card)]">
        <div className="text-[11px] font-black uppercase tracking-[0.08em] text-[var(--text-tertiary)]">{t('updates.dataUpdate')}</div>
        <div className="mt-1 text-lg font-black">{formatCount(totalChanges, 'change')}</div>
        <p className="mt-2 text-sm leading-5 text-[var(--text-secondary)]">
          {t('updates.updatedFromTo', {
            previous: formatNumber(summary.previousCount),
            current: formatNumber(summary.currentCount),
          })}
        </p>
      </div>
      <ChangeSection title={t('updates.newFacilities')} items={summary.newFacilities} />
      <ChangeSection title={t('updates.removedFacilities')} items={summary.removedFacilities} />
      <UpdatedSection items={summary.updatedFacilities} />
    </div>
  );
}

function ChangeSection({ title, items }: { title: string; items: Array<{ id: string; name: string; city: string; cityDistrict: string; activities: string[] }> }) {
  const { t } = useI18n();

  return (
    <section className="rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-raised)] p-4">
      <h2 className="text-sm font-black">{title}</h2>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-[var(--text-tertiary)]">{t('updates.noRecords')}</p>
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
  const { t } = useI18n();

  return (
    <section className="rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-raised)] p-4">
      <h2 className="text-sm font-black">{t('updates.updatedFacilities')}</h2>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-[var(--text-tertiary)]">{t('updates.noRecords')}</p>
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
  const { language, t, formatCount } = useI18n();

  if (results.length < 2) {
    return (
      <div className="rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-raised)] p-5 text-sm leading-6 text-[var(--text-secondary)]">
        {t('compare.empty')}
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
                {t('compare.remove')}
              </button>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <CompareMetric label={t('drawer.rating')} value={rating?.matchStatus === 'matched' ? rating.rating?.toFixed(1) || '-' : '-'} />
              <CompareMetric label={t('drawer.review')} value={rating?.userRatingCount ? formatCount(rating.userRatingCount, 'review') : '-'} />
              <CompareMetric label={t('drawer.distance')} value={distanceKm !== undefined ? formatDistanceKm(distanceKm, language) : '-'} />
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
              {t('compare.openDetail')}
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
