import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPluxeeSnapshot,
  normalizePluxeeMerchant,
  parseCoordinatesFromDetailHtml,
  parsePluxeeDetailHtml,
  resolvePluxeeLocationTargets,
} from '../scripts/lib/pluxee-import.mjs';

const detailHtml = `
  <div class="company-name center">
    <h3>G&#220;LL&#220;OĞLU BAKLAVALARI</h3>
    <span>KARAK&#214;Y/BEYOĞLU/İSTANBUL - PASTANE / FIRIN / B&#214;REK</span>
  </div>
  <li>Bugün 08:00-  20:00</li>
  <li>HAFTAİ&#199;İ ve HAFTASONU</li>
  <h4 class="font-primary-5">Telefon</h4>
  <li>02122499680</li>
  <h4 class="font-primary-5">Adres</h4>
  <li>MUMHANE CAD.NO:171</li>
  <a class="font-primary-6" target="_blank" href="https://www.google.com/maps?q=41.025944,28.980533&amp;z=14.5">Haritada Göster</a>
`;

test('parses coordinates from Pluxee detail Google Maps link', () => {
  assert.deepEqual(parseCoordinatesFromDetailHtml(detailHtml), {
    lat: 41.025944,
    lng: 28.980533,
  });
});

test('normalizes a Pluxee merchant with deterministic id and detail fields', () => {
  const merchant = normalizePluxeeMerchant({
    serviceId: '3',
    sourcePage: 1,
    row: {
      display_name: 'GÜLLÜOĞLU BAKLAVALARI',
      kitchen_type: 'PASTANE / FIRIN / BÖREK',
      is_open: true,
      has_promotion: true,
      display_location: 'KARAKÖY/BEYOĞLU/İSTANBUL',
      display_distance: '1.56',
      icon: 'firin',
      url: '/uye-isyerleri/gulluoglu-baklavalari_1oe3JD',
    },
    detail: parsePluxeeDetailHtml(detailHtml),
  });

  assert.match(merchant.id, /^pluxee:[a-f0-9]{16}$/);
  assert.equal(merchant.name, 'GÜLLÜOĞLU BAKLAVALARI');
  assert.equal(merchant.city, 'İstanbul');
  assert.equal(merchant.cityDistrict, 'Beyoğlu');
  assert.equal(merchant.neighborhood, 'Karaköy');
  assert.equal(merchant.address, 'MUMHANE CAD.NO:171');
  assert.equal(merchant.phone, '02122499680');
  assert.equal(merchant.lat, 41.025944);
  assert.equal(merchant.lng, 28.980533);
  assert.deepEqual(merchant.services, ['3']);
  assert.equal(merchant.pluxeePlus, true);
  assert.equal(merchant.isOpenNow, true);
});

test('builds a deduped snapshot and keeps unmapped merchants as map candidates', () => {
  const first = normalizePluxeeMerchant({
    serviceId: '3',
    sourcePage: 1,
    row: {
      display_name: 'BARIŞ BÜFE',
      kitchen_type: 'BÜFE',
      is_open: false,
      has_promotion: false,
      display_location: 'ŞAŞKINBAKKAL/KADIKÖY/İSTANBUL',
      display_distance: '11.09',
      icon: 'bufe',
      url: '/uye-isyerleri/baris-bufe_3lo648',
    },
    detail: { lat: 40.971, lng: 29.067, address: 'Bağdat Cad.', phone: '02160000000' },
  });
  const duplicate = normalizePluxeeMerchant({
    serviceId: '4',
    sourcePage: 2,
    row: {
      display_name: 'BARIŞ BÜFE',
      kitchen_type: 'BÜFE',
      is_open: true,
      has_promotion: true,
      display_location: 'ŞAŞKINBAKKAL/KADIKÖY/İSTANBUL',
      display_distance: '11.09',
      icon: 'bufe',
      url: '/uye-isyerleri/baris-bufe_3lo648',
    },
    detail: { lat: 40.971, lng: 29.067, address: 'Bağdat Cad.', phone: '02160000000' },
  });
  const unmapped = normalizePluxeeMerchant({
    serviceId: '9',
    sourcePage: 1,
    row: {
      display_name: 'KOORDİNATSIZ MARKET',
      kitchen_type: 'TÜKETİME HAZIR GIDA',
      is_open: false,
      has_promotion: false,
      display_location: 'SEYHAN/SEYHAN/ADANA',
      display_distance: '705.82',
      icon: 'market',
      url: '/uye-isyerleri/koordinatsiz-market_abc123',
    },
    detail: {},
  });

  const snapshot = buildPluxeeSnapshot([first, duplicate, unmapped], {
    sourceServices: ['3', '4', '9'],
    sourceCounts: { '3': 1, '4': 1, '9': 1 },
    runId: 'test-run',
    generatedAt: '2026-05-28T00:00:00.000Z',
  });

  assert.equal(snapshot.index.length, 2);
  assert.equal(snapshot.unmapped.length, 1);
  assert.deepEqual(snapshot.index[0].services, ['3', '4']);
  assert.equal(snapshot.index[0].pluxeePlus, true);
  assert.equal(snapshot.index[0].isOpenNow, true);
  assert.equal(snapshot.manifest.totalMapped, 1);
  assert.equal(snapshot.manifest.totalUnmapped, 1);
  assert.equal(snapshot.manifest.totalRecords, 2);
  assert.equal(snapshot.cityShards.istanbul.length, 1);
  assert.equal(snapshot.cityShards.adana.length, 1);
  assert.equal(snapshot.index[1].locationStatus, 'google_pending');
});

test('resolves Pluxee city aliases to location codes for regional imports', () => {
  assert.deepEqual(resolvePluxeeLocationTargets(['edirne', 'Çanakkale', 'tekirdag']), [
    { code: '73', label: 'Edirne', city: 'Edirne' },
    { code: '20', label: 'Çanakkale', city: 'Çanakkale' },
    { code: '59', label: 'Tekirdağ', city: 'Tekirdağ' },
  ]);
});
