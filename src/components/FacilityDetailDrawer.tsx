import {
  Activity,
  Bookmark,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  Globe2,
  Heart,
  MapPin,
  MessageSquareOff,
  NotebookPen,
  Scale,
  Star,
  X,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { FacilityPersonalKey, FacilityResult } from '../types';
import {
  getActivityNames,
  getFacilityDetailUrl,
  getGoogleMapsSearchUrl,
} from '../lib/facilities';

interface FacilityDetailDrawerProps {
  result?: FacilityResult;
  isCompareSelected: boolean;
  onClose: () => void;
  onTogglePersonal: (id: string, key: FacilityPersonalKey) => void;
  onUpdateNote: (id: string, note: string) => void;
  onToggleCompare: (id: string) => void;
}

export default function FacilityDetailDrawer({
  result,
  isCompareSelected,
  onClose,
  onTogglePersonal,
  onUpdateNote,
  onToggleCompare,
}: FacilityDetailDrawerProps) {
  if (!result) return null;

  const { facility, rating, distanceKm, userState } = result;
  const activities = getActivityNames(facility.activityGroups);
  const mapUrl = rating?.googleMapsUri || getGoogleMapsSearchUrl(facility);
  const ratingReady = rating?.matchStatus === 'matched';

  return (
    <div className="pointer-events-none fixed inset-0 z-40">
      <div className="pointer-events-auto absolute inset-0 bg-black/20 md:hidden" onClick={onClose} />
      <aside className="app-scrollbar pointer-events-auto absolute bottom-0 right-0 flex max-h-[88dvh] w-full flex-col overflow-y-auto rounded-t-[1.5rem] border border-[var(--border-soft)] bg-[var(--surface-panel)] shadow-[var(--shadow-panel)] md:bottom-4 md:right-4 md:top-4 md:max-h-none md:w-[430px] md:rounded-[1.5rem]">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--border-soft)] bg-[var(--surface-panel)]/95 px-5 py-4 backdrop-blur">
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.08em] text-[var(--text-tertiary)]">Tesis detayı</div>
            <h2 className="mt-1 text-lg font-black leading-tight">{facility.name}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface-muted)] text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
            aria-label="Detayı kapat"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {facility.thumbnail && (
          <img src={facility.thumbnail} alt="" className="h-52 w-full bg-[var(--surface-muted)] object-cover" />
        )}

        <div className="space-y-5 p-5">
          <div className="grid grid-cols-3 gap-2">
            <Metric label="Puan" value={ratingReady ? rating.rating?.toFixed(1) || '-' : '-'} />
            <Metric label="Yorum" value={rating?.userRatingCount ? rating.userRatingCount.toLocaleString('tr-TR') : '-'} />
            <Metric label="Mesafe" value={distanceKm !== undefined ? `${distanceKm.toFixed(1)} km` : '-'} />
          </div>

          <section className="rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-raised)] p-4">
            <div className="flex items-start gap-2 text-sm leading-6 text-[var(--text-secondary)]">
              <MapPin className="mt-1 h-4 w-4 shrink-0 text-[var(--accent-text)]" />
              <span>{facility.address || `${facility.cityDistrict}, ${facility.city}`}</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-black text-[var(--text-secondary)]">
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-muted)] px-2 py-1">
                <MapPin className="h-3 w-3" />
                {facility.cityDistrict || facility.city}
              </span>
              {facility.allowInternationalVisits && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-muted)] px-2 py-1">
                  <Globe2 className="h-3 w-3" />
                  Uluslararası
                </span>
              )}
              {facility.cards.map((card) => (
                <span key={card} className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-muted)] px-2 py-1">
                  <CreditCard className="h-3 w-3" />
                  {card}
                </span>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-sm font-black">Kişisel liste</h3>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <PersonalButton active={Boolean(userState?.favorite)} label="Favori" onClick={() => onTogglePersonal(facility.id, 'favorite')}>
                <Heart className={`h-4 w-4 ${userState?.favorite ? 'fill-current' : ''}`} />
              </PersonalButton>
              <PersonalButton active={Boolean(userState?.wantToGo)} label="Planla" onClick={() => onTogglePersonal(facility.id, 'wantToGo')}>
                <Bookmark className={`h-4 w-4 ${userState?.wantToGo ? 'fill-current' : ''}`} />
              </PersonalButton>
              <PersonalButton active={Boolean(userState?.visited)} label="Gittim" onClick={() => onTogglePersonal(facility.id, 'visited')}>
                <CheckCircle2 className={`h-4 w-4 ${userState?.visited ? 'fill-current' : ''}`} />
              </PersonalButton>
            </div>
          </section>

          <section>
            <label className="block">
              <span className="mb-2 inline-flex items-center gap-2 text-sm font-black">
                <NotebookPen className="h-4 w-4" />
                Kişisel not
              </span>
              <textarea
                value={userState?.note || ''}
                onChange={(event) => onUpdateNote(facility.id, event.target.value)}
                placeholder="Örn. Hafta içi daha sakin, otoparkı kolay..."
                className="min-h-24 w-full resize-none rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-raised)] p-3 text-sm leading-6 outline-none transition focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-ring)]"
              />
            </label>
          </section>

          <section>
            <h3 className="text-sm font-black">Aktiviteler</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {activities.map((activity) => (
                <span key={activity} className="inline-flex items-center gap-1 rounded-full bg-[var(--chip-blue)] px-2.5 py-1.5 text-xs font-bold text-[var(--chip-blue-text)]">
                  <Activity className="h-3 w-3" />
                  {activity}
                </span>
              ))}
            </div>
          </section>

          {facility.amenities.length > 0 && (
            <section>
              <h3 className="text-sm font-black">Olanaklar</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {facility.amenities.map((amenity) => (
                  <span key={amenity} className="rounded-full bg-[var(--chip-neutral)] px-2.5 py-1.5 text-xs font-bold text-[var(--text-secondary)]">
                    {amenity}
                  </span>
                ))}
              </div>
            </section>
          )}

          {facility.discounts.length > 0 && (
            <section>
              <h3 className="text-sm font-black">İndirimler</h3>
              <div className="mt-2 space-y-2 text-sm text-[var(--text-secondary)]">
                {facility.discounts.map((discount) => <div key={discount}>{discount}</div>)}
              </div>
            </section>
          )}

          <section className="rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-raised)] p-4">
            <div className="flex items-start gap-3">
              <MessageSquareOff className="mt-0.5 h-5 w-5 text-[var(--text-tertiary)]" />
              <div>
                <h3 className="text-sm font-black">Kullanıcı yorumu kapalı</h3>
                <p className="mt-1 text-sm leading-5 text-[var(--text-secondary)]">
                  Bu ilk geliştirme turunda masraf ve moderasyon yüzeyi değişmesin diye kullanıcı yorumu eklenmedi.
                </p>
              </div>
            </div>
          </section>

          <div className="grid grid-cols-2 gap-2 pb-2">
            <a href={mapUrl} target="_blank" rel="noreferrer" className="action-button primary">
              <ExternalLink className="h-4 w-4" />
              Haritada aç
            </a>
            <a href={getFacilityDetailUrl(facility)} target="_blank" rel="noreferrer" className="action-button secondary">
              <Star className="h-4 w-4" />
              MultiSport
            </a>
            <button type="button" onClick={() => onToggleCompare(facility.id)} className="action-button secondary col-span-2">
              <Scale className="h-4 w-4" />
              {isCompareSelected ? 'Karşılaştırmadan çıkar' : 'Karşılaştırmaya ekle'}
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-[var(--surface-muted)] p-3">
      <div className="text-[10px] font-black uppercase tracking-[0.08em] text-[var(--text-tertiary)]">{label}</div>
      <div className="mt-1 text-base font-black">{value}</div>
    </div>
  );
}

function PersonalButton({ active, label, onClick, children }: { active: boolean; label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl border text-xs font-black transition ${
        active
          ? 'border-[var(--accent-soft)] bg-[var(--accent-muted)] text-[var(--accent-text)]'
          : 'border-[var(--border-strong)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]'
      }`}
    >
      {children}
      {label}
    </button>
  );
}
