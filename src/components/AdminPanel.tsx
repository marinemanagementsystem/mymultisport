import { FormEvent, useMemo, useState } from 'react';
import { AlertTriangle, Database, Loader2, RefreshCw, ShieldCheck, X } from 'lucide-react';
import type { AdminPluxeeStatus, AdminRatingsStatus, BenefitFacility, GoogleRatingMatch, ProviderId } from '../types';
import {
  adminEnrichRatings,
  ENRICH_BATCH_SIZE,
  getAdminPluxeeStatus,
  getAdminRatingsStatus,
  getRatingsSnapshot,
  rebuildRatingSnapshot,
} from '../lib/ratingsApi';
import type { AdminCredentials } from '../lib/ratingsApi';
import { useI18n } from '../lib/i18n';
import {
  buildMultiSportAdminStats,
  buildPluxeeAdminStats,
  needsDeltaRefresh,
  needsMissingRefresh,
} from '../lib/adminMetrics';

interface AdminPanelProps {
  provider: ProviderId;
  facilities: BenefitFacility[];
  ratings: Record<string, GoogleRatingMatch>;
  onClose: () => void;
  onRatingsChange: (ratings: Record<string, GoogleRatingMatch>) => void;
}

type AdminAction = '' | 'login' | 'snapshot' | 'delta' | 'missing' | 'pluxeeStatus';

export default function AdminPanel({ provider, facilities, ratings, onClose, onRatingsChange }: AdminPanelProps) {
  const { formatNumber } = useI18n();
  const [credentials, setCredentials] = useState<AdminCredentials>({ username: '', password: '' });
  const [activeCredentials, setActiveCredentials] = useState<AdminCredentials | null>(null);
  const [status, setStatus] = useState<AdminRatingsStatus | null>(null);
  const [pluxeeStatus, setPluxeeStatus] = useState<AdminPluxeeStatus | null>(null);
  const [action, setAction] = useState<AdminAction>('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isPluxee = provider === 'pluxee';
  const stats = useMemo(() => {
    return buildMultiSportAdminStats(facilities, ratings);
  }, [facilities, ratings]);
  const pluxeeStats = useMemo(() => buildPluxeeAdminStats(facilities), [facilities]);

  const isBusy = Boolean(action);
  const isLoggedIn = Boolean(activeCredentials);

  const loadStatus = async (nextCredentials = activeCredentials) => {
    if (!nextCredentials) return;
    if (isPluxee) {
      const freshStatus = await getAdminPluxeeStatus(nextCredentials);
      setPluxeeStatus(freshStatus);
      return;
    }
    setStatus(await getAdminRatingsStatus(nextCredentials));
  };

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAction('login');
    setError(null);
    setMessage(null);
    try {
      const freshStatus = isPluxee
        ? await getAdminPluxeeStatus(credentials)
        : await getAdminRatingsStatus(credentials);
      setActiveCredentials(credentials);
      if (isPluxee) setPluxeeStatus(freshStatus as AdminPluxeeStatus);
      else setStatus(freshStatus as AdminRatingsStatus);
      setMessage('Admin oturumu açıldı.');
    } catch {
      setError('Admin girişi başarısız. Kullanıcı adı veya şifre hatalı olabilir.');
    } finally {
      setAction('');
    }
  };

  const refreshPluxeeStatus = async () => {
    if (!activeCredentials) return;
    setAction('pluxeeStatus');
    setError(null);
    setMessage(null);
    try {
      await loadStatus(activeCredentials);
      setMessage('Pluxee konum cache durumu yenilendi.');
    } catch {
      setError('Pluxee konum durumu okunamadı.');
    } finally {
      setAction('');
    }
  };

  const runSnapshotRebuild = async () => {
    if (!activeCredentials) return;
    setAction('snapshot');
    setError(null);
    setMessage(null);
    try {
      const meta = await rebuildRatingSnapshot(activeCredentials);
      const snapshot = await getRatingsSnapshot();
      onRatingsChange(Object.fromEntries(snapshot.ratings.map((rating) => [rating.facilityId, rating])));
      await loadStatus(activeCredentials);
      setMessage(`Snapshot yenilendi: ${formatNumber(meta.ratingCount)} cache kaydı kullanıcı datasına yazıldı.`);
    } catch {
      setError('Snapshot yenilenemedi.');
    } finally {
      setAction('');
    }
  };

  const runDeltaRefresh = async () => {
    await runEnrich('delta', stats.deltaFacilities, 'Yeni/değişmiş tesis yok.');
  };

  const runMissingRefresh = async () => {
    await runEnrich('missing', stats.missingFacilities, 'Eksik/ambiguous kayıt yok.');
  };

  const runEnrich = async (
    mode: 'delta' | 'missing',
    candidates: BenefitFacility[],
    emptyMessage: string,
  ) => {
    if (!activeCredentials) return;
    if (candidates.length === 0) {
      setMessage(emptyMessage);
      return;
    }

    setAction(mode);
    setError(null);
    setMessage(null);
    try {
      const batch = candidates.slice(0, ENRICH_BATCH_SIZE);
      const freshRatings = await adminEnrichRatings(activeCredentials, batch, mode);
      onRatingsChange(freshRatings);
      await loadStatus(activeCredentials);
      setMessage(`${formatNumber(Object.keys(freshRatings).length)} kayıt işlendi. Kullanıcıların görmesi için Snapshot yenile düğmesini çalıştır.`);
    } catch (cause) {
      const statusCode = typeof cause === 'object' && cause && 'status' in cause ? Number(cause.status) : 0;
      setError(statusCode === 429 ? 'Günlük/aylık Google Places kotası doldu.' : 'Google cache güncellemesi başarısız.');
    } finally {
      setAction('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end bg-slate-950/35 backdrop-blur-sm">
      <aside className="flex h-full w-full max-w-[440px] flex-col border-l border-[var(--border-soft)] bg-[var(--surface-panel)] text-[var(--text-primary)] shadow-2xl">
        <header className="border-b border-[var(--border-soft)] p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-[var(--accent-text)]" />
              <div>
                <h2 className="text-lg font-black">{isPluxee ? 'Pluxee admin kontrolü' : 'Admin cache kontrolü'}</h2>
                <p className="text-xs font-semibold text-[var(--text-tertiary)]">
                  {isPluxee ? 'Place ID ve canlı konum cache maliyet kontrollüdür.' : 'Google sadece bu panelden kontrollü çalışır.'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border-soft)] bg-[var(--surface-raised)]"
              aria-label="Admin paneli kapat"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="app-scrollbar flex-1 space-y-4 overflow-y-auto p-4">
          {!isLoggedIn ? (
            <form onSubmit={handleLogin} className="space-y-3 rounded-xl border border-[var(--border-soft)] bg-[var(--surface-raised)] p-4">
              <label className="block">
                <span className="text-xs font-black uppercase text-[var(--text-tertiary)]">Kullanıcı adı</span>
                <input
                  value={credentials.username}
                  onChange={(event) => setCredentials((current) => ({ ...current, username: event.target.value }))}
                  className="mt-1 h-11 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface-panel)] px-3 text-sm font-bold outline-none"
                  autoComplete="username"
                />
              </label>
              <label className="block">
                <span className="text-xs font-black uppercase text-[var(--text-tertiary)]">Şifre</span>
                <input
                  type="password"
                  value={credentials.password}
                  onChange={(event) => setCredentials((current) => ({ ...current, password: event.target.value }))}
                  className="mt-1 h-11 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface-panel)] px-3 text-sm font-bold outline-none"
                  autoComplete="current-password"
                />
              </label>
              <button type="submit" disabled={isBusy} className="action-button primary w-full disabled:opacity-60">
                {action === 'login' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                Admin girişi
              </button>
            </form>
          ) : (
            isPluxee ? (
              <>
                <section className="grid grid-cols-2 gap-2">
                  <AdminMetric label="Pluxee kayıt" value={formatNumber(pluxeeStats.total)} />
                  <AdminMetric label="Pluxee konum" value={formatNumber(pluxeeStats.nativeLocationCount)} />
                  <AdminMetric label="Place ID" value={formatNumber(pluxeeStats.googlePlaceIdCount)} />
                  <AdminMetric label="Canlı cache" value={formatNumber(pluxeeStats.googleResolvedCount)} />
                  <AdminMetric label="İlçe tahmini" value={formatNumber(pluxeeStats.approximateLocationCount)} />
                  <AdminMetric label="Konum bekliyor" value={formatNumber(pluxeeStats.googlePendingCount)} />
                  <AdminMetric label="Konumsuz" value={formatNumber(pluxeeStats.missingLocationCount)} />
                </section>

                <section className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface-raised)] p-4">
                  <div className="mb-3 flex items-center gap-2 text-sm font-black">
                    <Database className="h-4 w-4" />
                    Pluxee Google konum bütçesi
                  </div>
                  <div className="space-y-2 text-xs font-bold text-[var(--text-secondary)]">
                    <Row label="Bugünkü Place Details" value={pluxeeStatus ? `${formatNumber(pluxeeStatus.usage.daily.count)} / ${formatNumber(pluxeeStatus.usage.daily.limit)}` : '-'} />
                    <Row label="Bu ay Place Details" value={pluxeeStatus ? `${formatNumber(pluxeeStatus.usage.monthly.count)} / ${formatNumber(pluxeeStatus.usage.monthly.limit)}` : '-'} />
                    <Row label="Firestore konum cache" value={pluxeeStatus ? formatNumber(pluxeeStatus.cache.locationCount) : '-'} />
                    <Row label="Batch limiti" value={pluxeeStatus ? formatNumber(pluxeeStatus.limits.batch) : '50'} />
                    <Row label="Cache süresi" value={pluxeeStatus ? `${formatNumber(pluxeeStatus.limits.cacheDays)} gün` : '30 gün'} />
                  </div>
                </section>

                <section className="space-y-2">
                  <button type="button" disabled={isBusy} onClick={refreshPluxeeStatus} className="action-button primary w-full disabled:opacity-60">
                    {action === 'pluxeeStatus' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Pluxee durumu yenile
                  </button>
                  <p className="text-[11px] font-semibold leading-5 text-[var(--text-tertiary)]">
                    Pluxee marker konumları kullanıcı görünür listesinde 50'lik batch ile alınır. Google lat/lng statik JSON'a yazılmaz; Firestore cache en fazla 30 gün tutulur.
                  </p>
                </section>
              </>
            ) : (
            <>
              <section className="grid grid-cols-2 gap-2">
                <AdminMetric label="Tesis" value={formatNumber(facilities.length)} />
                <AdminMetric label="Cache" value={formatNumber(stats.cached)} />
                <AdminMetric label="Puanlı" value={formatNumber(stats.matched)} />
                <AdminMetric label="Saatli" value={formatNumber(stats.withHours)} />
                <AdminMetric label="Yeni/değişen" value={formatNumber(stats.deltaFacilities.length)} />
                <AdminMetric label="Eksik" value={formatNumber(stats.missingFacilities.length)} />
              </section>

              <section className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface-raised)] p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-black">
                  <Database className="h-4 w-4" />
                  Kullanım ve snapshot
                </div>
                <div className="space-y-2 text-xs font-bold text-[var(--text-secondary)]">
                  <Row label="Bugünkü Google Places" value={status ? `${formatNumber(status.usage.daily.count)} / ${formatNumber(status.usage.daily.limit)}` : '-'} />
                  <Row label="Bu ay Google Places" value={status ? `${formatNumber(status.usage.monthly.count)} / ${formatNumber(status.usage.monthly.limit)}` : '-'} />
                  <Row label="Batch limiti" value={status ? formatNumber(status.limits.batch) : formatNumber(ENRICH_BATCH_SIZE)} />
                  <Row label="Snapshot zamanı" value={formatDate(status?.snapshot?.rebuiltAt)} />
                </div>
              </section>

              <section className="space-y-2">
                <button type="button" disabled={isBusy} onClick={runSnapshotRebuild} className="action-button primary w-full disabled:opacity-60">
                  {action === 'snapshot' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
                  Snapshot yenile
                </button>
                <button type="button" disabled={isBusy || stats.deltaFacilities.length === 0} onClick={runDeltaRefresh} className="action-button secondary w-full disabled:opacity-60">
                  {action === 'delta' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Yeni/değişenleri güncelle
                </button>
                <button type="button" disabled={isBusy || stats.missingFacilities.length === 0} onClick={runMissingRefresh} className="action-button secondary w-full disabled:opacity-60">
                  {action === 'missing' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Eksik kayıtları dene
                </button>
                <p className="text-[11px] font-semibold leading-5 text-[var(--text-tertiary)]">
                  Google sorguları en fazla {formatNumber(ENRICH_BATCH_SIZE)} kayıtlık batch ile çalışır. Normal kullanıcılar bu paneli ve Google refresh endpointlerini kullanamaz.
                </p>
              </section>
            </>
            )
          )}

          {(message || error) && (
            <div className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-xs font-bold ${error ? 'border-[var(--warning-border)] bg-[var(--warning-bg)] text-[var(--warning-text)]' : 'border-[var(--accent-soft)] bg-[var(--accent-muted)] text-[var(--accent-text)]'}`}>
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error || message}</span>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function formatDate(value?: string): string {
  if (!value) return '-';
  return new Intl.DateTimeFormat('tr-TR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function AdminMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface-raised)] p-3">
      <div className="text-[10px] font-black uppercase text-[var(--text-tertiary)]">{label}</div>
      <div className="mt-1 text-base font-black">{value}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span>{label}</span>
      <span className="text-[var(--text-primary)]">{value}</span>
    </div>
  );
}
