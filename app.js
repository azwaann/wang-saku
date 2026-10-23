// Apps staf: daftar telefon, clock in dengan cap jari + GPS + jumlah wang.
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const LS_SAYA = 'ws_staf_v1';
  const LS_HINT = 'ws_hint_tutup';

  let conf = null;     // { jabatan, lokasi[], maxAcc, maxAmt }
  let saya = null;     // { staffId, nama, credId }
  let reg = null;      // data dari regBegin
  let pos = null;      // { lat, lng, acc, t }
  let posErr = null;
  let watchId = null;
  let gpsSah = false;
  let siapHariIni = false;
  let hariSemasa = WS.isoHariIni();
  let promptPasang = null;

  // ---------- storan ----------
  function bacaSaya() { try { return JSON.parse(localStorage.getItem(LS_SAYA)); } catch (e) { return null; } }
  function simpanSaya(x) { saya = x; try { localStorage.setItem(LS_SAYA, JSON.stringify(x)); } catch (e) { /* abaikan */ } }
  function buangSaya() { saya = null; try { localStorage.removeItem(LS_SAYA); } catch (e) { /* abaikan */ } }

  // ---------- paparan ----------
  function tunjuk(v) {
    ['v-muat', 'v-ralat', 'v-daftar', 'v-utama', 'v-resit'].forEach(x => { $(x).hidden = x !== v; });
    window.scrollTo(0, 0);
  }
  function ralat(tajuk, mesej) {
    $('ralatTajuk').textContent = tajuk;
    $('ralatMesej').textContent = mesej;
    tunjuk('v-ralat');
  }
  function tunjukErr(id, msg) { const el = $(id); el.textContent = msg || ''; el.hidden = !msg; }
  function sibuk(btn, teks) {
    if (!btn._asal) btn._asal = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spin"></span>' + WS.esc(teks);
  }
  function lepas(btn) { if (btn._asal) btn.innerHTML = btn._asal; btn.disabled = false; }
  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast'; t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3200);
  }

  function bukaSheet(html) {
    const L = $('lapisan');
    L.innerHTML = '<div class="backdrop" data-tutup></div><div class="sheet" role="dialog" aria-modal="true"><div class="grip"></div>' + html + '</div>';
    L.querySelector('[data-tutup]').onclick = tutupSheet;
    return L.querySelector('.sheet');
  }
  function tutupSheet() { $('lapisan').innerHTML = ''; }

  // ---------- mula ----------
  async function mula() {
    if (WS.DEMO) { $('demoBanner').hidden = false; $('demoKod').hidden = false; }
    const sok = await WS.passkey.supported();
    try {
      conf = await WS.api('config');
    } catch (e) {
      return ralat('Tidak dapat sambung ke server', e.message);
    }
    $('jabatan').textContent = conf.jabatan;
    if (!sok.ok) return ralat('Telefon tidak disokong', sok.msg);
    saya = bacaSaya();
    $('btnMenu').hidden = false;
    if (saya && saya.credId) keUtama(); else keDaftar();
  }

  // ---------- daftar ----------
  function keDaftar() {
    reg = null;
    $('daftar1').hidden = false; $('daftar2').hidden = true;
    tunjukErr('errDaftar1'); tunjukErr('errDaftar2'); tunjukErr('errLogMasuk');
    tunjuk('v-daftar');
    WS.cabaran.ambil().catch(() => {});
  }

  $('fDaftar').addEventListener('submit', async e => {
    e.preventDefault();
    const id = $('inId').value.trim(), kod = $('inKod').value.trim();
    if (!id || !kod) return tunjukErr('errDaftar1', 'Sila isi No. Pekerja dan Kod Daftar.');
    tunjukErr('errDaftar1');
    const btn = $('btnSemak');
    sibuk(btn, 'Menyemak…');
    try {
      reg = await WS.api('regBegin', { staffId: id, code: kod });
      reg.kod = kod;
      $('regNama').textContent = reg.nama;
      $('regId').textContent = 'No. Pekerja ' + reg.staffId;
      $('daftar1').hidden = true; $('daftar2').hidden = false;
      tunjukErr('errDaftar2');
    } catch (err) {
      tunjukErr('errDaftar1', err.message);
    } finally { lepas(btn); }
  });

  $('inKod').addEventListener('input', e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });

  $('btnBukanSaya').onclick = () => { reg = null; $('daftar1').hidden = false; $('daftar2').hidden = true; };

  $('btnDaftarCap').onclick = async () => {
    if (!reg) return;
    const btn = $('btnDaftarCap');
    tunjukErr('errDaftar2');
    sibuk(btn, 'Menunggu cap jari…');
    try {
      const c = await WS.passkey.create(reg); // mesti dipanggil terus selepas tekan butang
      sibuk(btn, 'Menyimpan…');
      const d = await WS.api('regFinish', Object.assign({ staffId: reg.staffId, code: reg.kod }, c));
      simpanSaya({ staffId: d.staffId, nama: d.nama, credId: d.credId });
      $('inId').value = ''; $('inKod').value = '';
      toast('Pendaftaran berjaya');
      keUtama();
    } catch (err) {
      let m = err.message;
      if (/Sesi/.test(m)) { m += ' Tekan "Bukan saya — kembali" dan mula semula.'; }
      tunjukErr('errDaftar2', m);
    } finally { lepas(btn); }
  };

  $('btnLogMasuk').onclick = async () => {
    const btn = $('btnLogMasuk');
    tunjukErr('errLogMasuk');
    const ch = WS.cabaran.guna();
    if (!ch) {
      sibuk(btn, 'Bersedia…');
      WS.cabaran.ambil().then(() => { lepas(btn); toast('Sedia. Sila tekan sekali lagi.'); })
        .catch(e => { lepas(btn); tunjukErr('errLogMasuk', e.message); });
      return;
    }
    sibuk(btn, 'Menunggu cap jari…');
    try {
      const a = await WS.passkey.get(ch, null);
      sibuk(btn, 'Menyemak…');
      const d = await WS.api('identify', a);
      simpanSaya({ staffId: d.staffId, nama: d.nama, credId: d.credId });
      toast('Selamat kembali, ' + d.nama);
      keUtama();
    } catch (err) {
      tunjukErr('errLogMasuk', err.message);
    } finally {
      lepas(btn);
      WS.cabaran.ambil().catch(() => {});
    }
  };

  // ---------- utama ----------
  function salam() {
    const h = Number(WS.jamKini().slice(0, 2));
    return h < 12 ? 'Selamat pagi,' : h < 14 ? 'Selamat tengah hari,' : h < 19 ? 'Selamat petang,' : 'Selamat malam,';
  }

  function keUtama() {
    $('salam').textContent = salam();
    $('namaSaya').textContent = saya.nama;
    $('idSaya').textContent = 'No. Pekerja ' + saya.staffId;
    $('kadSiap').hidden = true; $('kadBorang').hidden = true;
    tunjuk('v-utama');
    tunjukHintPasang();
    muatStatus();
  }

  async function muatStatus() {
    hariSemasa = WS.isoHariIni();
    try {
      const s = await WS.api('status', { staffId: saya.staffId });
      setSiap(s.done, s.masa);
    } catch (e) {
      setSiap(false);
      toast(e.message);
    }
  }

  function setSiap(done, masa) {
    siapHariIni = !!done;
    $('kadSiap').hidden = !done;
    $('kadBorang').hidden = !!done;
    $('notaMasa').hidden = !!done;
    if (done) {
      $('siapMasa').textContent = masa || '';
      hentiGps();
    } else {
      mulaGps();
      WS.cabaran.ambil().catch(() => {});
      kemaskiniButang();
    }
  }

  // jam
  function detik() {
    $('jam').textContent = WS.jamKini();
    const h = WS.isoHariIni();
    $('tarikh').textContent = WS.tarikhPanjang(h);
    if (h !== hariSemasa && saya && !$('v-utama').hidden) muatStatus(); // hari baru
  }
  setInterval(detik, 1000); detik();

  // ---------- GPS ----------
  function mulaGps() {
    if (watchId !== null) return;
    posErr = null;
    if (!navigator.geolocation) { posErr = 'TIADA'; paparGps(); return; }
    paparGps();
    watchId = navigator.geolocation.watchPosition(p => {
      pos = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, t: Date.now() };
      posErr = null;
      paparGps();
    }, err => {
      posErr = err.code === 1 ? 'DITOLAK' : 'GAGAL';
      if (err.code === 1) hentiGps();
      paparGps();
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 });
  }
  function hentiGps() {
    if (watchId !== null && navigator.geolocation) navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }

  function paparGps() {
    let kelas = '', t = '', s = '', aksi = false;
    gpsSah = false;
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (posErr === 'DITOLAK') {
      kelas = 'bad'; t = 'Akses lokasi ditolak'; aksi = true;
      s = ios ? 'Buka Tetapan › Privasi & Keselamatan › Perkhidmatan Lokasi › Safari › "Semasa Guna", kemudian Cuba lagi.'
        : 'Tekan ikon di sebelah alamat (atau Tetapan apps) › Kebenaran › Lokasi › Benarkan, kemudian Cuba lagi.';
    } else if (posErr === 'TIADA') {
      kelas = 'bad'; t = 'Telefon tidak menyokong GPS'; s = 'Rekod tidak boleh dihantar tanpa lokasi.';
    } else if (!pos && posErr === 'GAGAL') {
      kelas = 'warn'; t = 'Lokasi belum dapat dikesan'; s = 'Hidupkan GPS / lokasi telefon dan pastikan isyarat baik.'; aksi = true;
    } else if (!pos) {
      t = 'Mencari lokasi anda…'; s = 'Pastikan GPS / lokasi telefon dihidupkan.';
    } else {
      const n = WS.terdekat(pos, conf.lokasi);
      const acc = Math.round(pos.acc);
      if (!n) {
        kelas = 'bad'; t = 'Lokasi pejabat belum ditetapkan'; s = 'Hubungi pentadbir sistem.';
      } else if (pos.acc > conf.maxAcc) {
        kelas = 'warn'; t = 'Isyarat GPS lemah (±' + acc + ' m)'; s = 'Tunggu sebentar atau bergerak dekat tingkap / luar bangunan.';
      } else if (n.dalam) {
        kelas = 'ok'; t = 'Dalam kawasan pejabat'; s = n.L.nama + ' · ' + WS.teksJarak(n.d) + ' · ketepatan ±' + acc + ' m';
        gpsSah = true;
      } else {
        kelas = 'bad'; t = 'Di luar kawasan pejabat';
        s = WS.teksJarak(n.d) + ' dari ' + n.L.nama + '. Rekod hanya boleh dihantar di pejabat.';
      }
    }
    $('gps').className = 'gps ' + kelas;
    $('gpsT').textContent = t;
    $('gpsS').textContent = s;
    $('gpsAksi').hidden = !aksi;
    kemaskiniButang();
  }
  $('btnGps').onclick = () => { hentiGps(); pos = null; mulaGps(); };

  // ---------- jumlah wang ----------
  function bacaWang() {
    const v = $('inWang').value.trim();
    if (v === '' || v === '.') return null;
    const n = Number(v);
    return isFinite(n) ? n : null;
  }
  $('inWang').addEventListener('input', e => {
    let v = e.target.value.replace(/,/g, '.').replace(/[^0-9.]/g, '');
    const i = v.indexOf('.');
    if (i >= 0) v = v.slice(0, i + 1) + v.slice(i + 1).replace(/\./g, '').slice(0, 2);
    if (/^0\d/.test(v)) v = v.replace(/^0+(?=\d)/, '');
    if (v.length > 9) v = v.slice(0, 9);
    e.target.value = v;
    const n = bacaWang();
    tunjukErr('errWang', n !== null && n > conf.maxAmt ? 'Melebihi had ' + WS.rm(conf.maxAmt) + '.' : '');
    kemaskiniButang();
  });
  $('inWang').addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); });

  function kemaskiniButang() {
    const n = bacaWang();
    $('btnHantar').disabled = !(gpsSah && n !== null && n >= 0 && n <= conf.maxAmt && !siapHariIni);
  }

  // ---------- hantar ----------
  $('btnHantar').onclick = async () => {
    const n = bacaWang();
    if (n === null || !gpsSah) return;
    const btn = $('btnHantar');
    sibuk(btn, 'Bersedia…');
    try { await WS.cabaran.ambil(); } catch (e) { lepas(btn); kemaskiniButang(); return toast(e.message); }
    lepas(btn); kemaskiniButang();
    const n2 = WS.terdekat(pos, conf.lokasi);
    const sh = bukaSheet(
      '<h1>Semak sebelum hantar</h1>' +
      '<dl class="rows">' +
      '<div><dt>Nama</dt><dd>' + WS.esc(saya.nama) + '</dd></div>' +
      '<div><dt>Jumlah wang</dt><dd style="font-size:20px">' + WS.rm(n) + '</dd></div>' +
      '<div><dt>Lokasi</dt><dd>' + WS.esc(n2.L.nama) + '</dd></div>' +
      '</dl>' +
      '<div class="amaran"><svg><use href="#i-amaran"/></svg><span>Selepas dihantar, rekod <b>tidak boleh diubah</b>. Pastikan jumlah betul.</span></div>' +
      '<div class="err" id="errSheet" hidden></div>' +
      '<button class="btn btn-pri mt" id="btnImbas"><svg><use href="#i-cap"/></svg>Imbas cap jari &amp; hantar</button>' +
      '<button class="btn btn-link mt-s" id="btnBatal">Batal</button>');
    sh.querySelector('#btnBatal').onclick = tutupSheet;
    sh.querySelector('#btnImbas').onclick = () => hantar(n, sh);
  };

  async function hantar(jumlah, sh) {
    const btn = sh.querySelector('#btnImbas');
    const errEl = sh.querySelector('#errSheet');
    errEl.hidden = true;
    const ch = WS.cabaran.guna();
    if (!ch) {
      sibuk(btn, 'Bersedia…');
      WS.cabaran.ambil().then(() => { lepas(btn); toast('Sedia. Sila tekan sekali lagi.'); })
        .catch(e => { lepas(btn); errEl.textContent = e.message; errEl.hidden = false; });
      return;
    }
    const p = pos;
    if (!p || Date.now() - p.t > 120000) {
      errEl.textContent = 'Lokasi sudah lama. Tunggu lokasi dikemas kini, kemudian cuba lagi.';
      errEl.hidden = false;
      return;
    }
    sibuk(btn, 'Menunggu cap jari…');
    sh.querySelector('#btnBatal').hidden = true;
    try {
      const a = await WS.passkey.get(ch, saya.credId); // mesti dipanggil terus selepas tekan butang
      sibuk(btn, 'Menghantar…');
      const r = await WS.api('clockIn', Object.assign({ amount: jumlah, lat: p.lat, lng: p.lng, accuracy: p.acc }, a));
      tutupSheet();
      $('inWang').value = '';
      tunjukResit(r);
    } catch (err) {
      lepas(btn);
      sh.querySelector('#btnBatal').hidden = false;
      errEl.textContent = err.message;
      errEl.hidden = false;
      if (/tidak berdaftar/.test(err.message)) {
        btn.innerHTML = 'Daftar semula telefon ini';
        btn.onclick = () => { tutupSheet(); buangSaya(); keDaftar(); };
      } else if (/sudah isi rekod/.test(err.message)) {
        btn.innerHTML = 'Tutup';
        btn.onclick = () => { tutupSheet(); muatStatus(); };
      }
    } finally {
      WS.cabaran.ambil().catch(() => {});
    }
  }

  function tunjukResit(r) {
    const pill = r.status === 'Lewat' ? 'warn' : 'ok';
    $('resitRows').innerHTML =
      '<div><dt>Nama</dt><dd>' + WS.esc(r.nama) + '</dd></div>' +
      '<div><dt>No. Pekerja</dt><dd>' + WS.esc(r.staffId) + '</dd></div>' +
      '<div><dt>Tarikh</dt><dd>' + WS.esc(WS.tarikhPanjang(r.tarikh)) + '</dd></div>' +
      '<div><dt>Masa masuk</dt><dd style="font-size:20px">' + WS.esc(r.masa) + '</dd></div>' +
      '<div><dt>Jumlah wang</dt><dd style="font-size:20px">' + WS.rm(r.jumlah) + '</dd></div>' +
      '<div><dt>Lokasi</dt><dd>' + WS.esc(r.lokasi) + ' <span class="muted small">(' + WS.teksJarak(r.jarak) + ')</span></dd></div>' +
      '<div><dt>Status</dt><dd><span class="pill ' + pill + '">' + WS.esc(r.status) + '</span></dd></div>' +
      '<div><dt>Pengesahan</dt><dd>Cap jari / Face ID</dd></div>';
    siapHariIni = true;
    hentiGps();
    tunjuk('v-resit');
    if (navigator.vibrate) navigator.vibrate(40);
    $('btnSelesai').onclick = () => { keUtama(); setSiap(true, r.masa); };
  }

  // ---------- menu ----------
  $('btnMenu').onclick = () => {
    let h = '<h2 style="margin-bottom:6px">Menu</h2>';
    h += '<button class="menu-item" id="mPasang"><svg width="20" height="20"><use href="#i-pasang"/></svg>Cara pasang di skrin utama</button>';
    if (saya) h += '<button class="menu-item bahaya" id="mKeluar">Log keluar dari telefon ini</button>';
    if (WS.DEMO) h += '<button class="menu-item" id="mDemo">Set semula data demo</button>';
    h += '<button class="menu-item" id="mTutup">Tutup</button>';
    const sh = bukaSheet(h);
    sh.querySelector('#mPasang').onclick = caraPasang;
    sh.querySelector('#mTutup').onclick = tutupSheet;
    const k = sh.querySelector('#mKeluar');
    if (k) k.onclick = () => {
      if (!confirm('Log keluar? Anda boleh log masuk semula dengan cap jari.')) return;
      tutupSheet(); buangSaya(); hentiGps(); keDaftar();
    };
    const d = sh.querySelector('#mDemo');
    if (d) d.onclick = () => { WS.demoReset(); buangSaya(); location.reload(); };
  };

  // ---------- pasang di skrin utama ----------
  function standalone() { return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; }
  function tunjukHintPasang() {
    let tutup = false;
    try { tutup = localStorage.getItem(LS_HINT) === '1'; } catch (e) { /* abaikan */ }
    $('kadPasang').hidden = standalone() || tutup;
  }
  $('btnTutupPasang').onclick = () => { try { localStorage.setItem(LS_HINT, '1'); } catch (e) { /* abaikan */ } $('kadPasang').hidden = true; };
  $('btnCaraPasang').onclick = caraPasang;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); promptPasang = e; });

  function caraPasang() {
    if (promptPasang) { tutupSheet(); promptPasang.prompt(); promptPasang = null; return; }
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const sh = bukaSheet('<h1>Pasang di skrin utama</h1>' + (ios
      ? '<p class="muted">iPhone (Safari):</p><ol class="langkah"><li>Tekan butang <b>Kongsi</b> (petak dengan anak panah ke atas) di bawah skrin.</li><li>Pilih <b>Tambah ke Skrin Utama</b> (Add to Home Screen).</li><li>Tekan <b>Tambah</b>.</li></ol>'
      : '<p class="muted">Android (Chrome):</p><ol class="langkah"><li>Tekan menu <b>⋮</b> di penjuru kanan atas.</li><li>Pilih <b>Pasang apl</b> / <b>Tambah ke skrin Utama</b>.</li><li>Tekan <b>Pasang</b>.</li></ol>') +
      '<button class="btn btn-pri mt" id="okPasang">Faham</button>');
    sh.querySelector('#okPasang').onclick = tutupSheet;
  }

  // ---------- kembali ke apps ----------
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !saya || $('v-utama').hidden) return;
    $('salam').textContent = salam();
    muatStatus();
  });

  $('btnCubaLagi').onclick = () => location.reload();

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  mula();
})();
