// Fungsi dikongsi: sambungan ke server, passkey (cap jari), GPS, format tarikh, dan mod demo.
(function () {
  'use strict';
  const CFG = window.WS_CONFIG || {};
  const DEMO = !CFG.API_URL;
  const TZ = 'Asia/Kuala_Lumpur';
  const JENIS_CUTI = ['Cuti Rehat', 'Cuti Sakit', 'Cuti Kecemasan', 'Kursus / Latihan', 'Tugas Luar', 'Cuti Lain'];

  const b64u = {
    enc(buf) {
      const b = new Uint8Array(buf);
      let s = '';
      for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
      return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    },
    dec(str) {
      str = String(str).replace(/-/g, '+').replace(/_/g, '/');
      while (str.length % 4) str += '=';
      const s = atob(str);
      const out = new Uint8Array(s.length);
      for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
      return out;
    },
  };

  async function api(action, body) {
    if (DEMO) return demoApi(action, body || {});
    let res;
    try {
      res = await fetch(CFG.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(Object.assign({ action: action }, body || {})),
      });
    } catch (e) {
      throw new Error('Tiada sambungan internet. Sila semak data / Wi-Fi dan cuba lagi.');
    }
    let j;
    try { j = await res.json(); } catch (e) { throw new Error('Server tidak memberi jawapan yang sah. Cuba lagi sebentar.'); }
    if (!j.ok) throw new Error(j.error || 'Ralat tidak diketahui.');
    return j.data;
  }

  // ---------------- Passkey (cap jari / Face ID) ----------------
  function mesejPasskey(e, jenis) {
    const n = e && e.name;
    if (n === 'NotAllowedError') return 'Imbasan dibatalkan atau tamat masa. Sila cuba lagi.';
    if (n === 'InvalidStateError' && jenis === 'create') return 'Telefon ini sudah ada passkey untuk apps ini. Tekan "Log masuk dengan cap jari".';
    if (n === 'SecurityError') return 'Alamat apps tidak sah untuk cap jari (mesti https).';
    if (n === 'NotSupportedError') return 'Telefon ini tidak menyokong passkey.';
    return (e && e.message) || 'Pengesahan cap jari gagal.';
  }

  const passkey = {
    async supported() {
      if (DEMO) return { ok: true };
      if (!window.isSecureContext || !window.PublicKeyCredential) {
        return { ok: false, msg: 'Pelayar ini tidak menyokong cap jari/Face ID. Guna Safari (iPhone) atau Chrome (Android) versi terkini.' };
      }
      try {
        const ada = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
        if (!ada) return { ok: false, msg: 'Kunci skrin telefon belum diaktifkan. Sila tetapkan cap jari / Face ID / PIN telefon dahulu, kemudian buka semula apps ini.' };
      } catch (e) { /* teruskan */ }
      return { ok: true };
    },

    async create(r) {
      if (DEMO) { await tidur(900); return { credId: 'demo-' + r.staffId, clientDataJSON: '', attestationObject: '' }; }
      let cred;
      try {
        cred = await navigator.credentials.create({ publicKey: {
          challenge: b64u.dec(r.challenge),
          rp: { name: r.rpName || 'Buku Wang Saku', id: location.hostname },
          user: { id: b64u.dec(r.userId), name: r.staffId, displayName: r.nama },
          pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
          authenticatorSelection: { authenticatorAttachment: 'platform', residentKey: 'preferred', requireResidentKey: false, userVerification: 'required' },
          attestation: 'none',
          timeout: 120000,
        } });
      } catch (e) { throw new Error(mesejPasskey(e, 'create')); }
      return {
        credId: b64u.enc(cred.rawId),
        clientDataJSON: b64u.enc(cred.response.clientDataJSON),
        attestationObject: b64u.enc(cred.response.attestationObject),
      };
    },

    async get(challenge, credId) {
      if (DEMO) { await tidur(900); return { credId: credId || demoCredPertama(), clientDataJSON: '', authenticatorData: '', signature: '' }; }
      let a;
      try {
        a = await navigator.credentials.get({ publicKey: {
          challenge: b64u.dec(challenge),
          rpId: location.hostname,
          allowCredentials: credId ? [{ type: 'public-key', id: b64u.dec(credId), transports: ['internal'] }] : [],
          userVerification: 'required',
          timeout: 60000,
        } });
      } catch (e) { throw new Error(mesejPasskey(e, 'get')); }
      return {
        credId: b64u.enc(a.rawId),
        clientDataJSON: b64u.enc(a.response.clientDataJSON),
        authenticatorData: b64u.enc(a.response.authenticatorData),
        signature: b64u.enc(a.response.signature),
      };
    },
  };

  // Cabaran diambil awal supaya imbasan cap jari berlaku terus selepas tekan butang
  // (iPhone perlukan ini — WebAuthn mesti dipanggil serta-merta selepas sentuhan).
  const cabaran = {
    _v: null, _t: 0, _p: null,
    sedia() { return this._v && Date.now() - this._t < 240000; },
    async ambil() {
      if (this.sedia()) return this._v;
      if (!this._p) {
        this._p = api('challenge').then(d => { this._v = d.challenge; this._t = Date.now(); return this._v; })
          .finally(() => { this._p = null; });
      }
      return this._p;
    },
    guna() { const v = this.sedia() ? this._v : null; this._v = null; return v; },
  };

  // ---------------- GPS ----------------
  function jarakMeter(lat1, lng1, lat2, lng2) {
    const rad = Math.PI / 180, R = 6371000;
    const dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  }
  function terdekat(pos, lokasi) {
    let best = null;
    (lokasi || []).forEach(L => {
      const d = jarakMeter(pos.lat, pos.lng, L.lat, L.lng);
      if (!best || d - L.radius < best.d - best.L.radius) best = { L: L, d: d };
    });
    if (best) best.dalam = best.d <= best.L.radius;
    return best;
  }
  function teksJarak(m) { return m < 1000 ? Math.round(m) + ' m' : (m / 1000).toFixed(1) + ' km'; }

  // ---------------- Format ----------------
  const HARI = ['Ahad', 'Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat', 'Sabtu'];
  const BULAN = ['Januari', 'Februari', 'Mac', 'April', 'Mei', 'Jun', 'Julai', 'Ogos', 'September', 'Oktober', 'November', 'Disember'];
  function bahagian(d) {
    const p = {};
    new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(d).forEach(x => { p[x.type] = x.value; });
    return p;
  }
  function isoHariIni(d) {
    const p = bahagian(d || new Date());
    return p.year + '-' + ('0' + p.month).slice(-2) + '-' + ('0' + p.day).slice(-2);
  }
  function tarikhPanjang(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return HARI[dt.getUTCDay()] + ', ' + d + ' ' + BULAN[m - 1] + ' ' + y;
  }
  function tarikhSederhana(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return d + ' ' + BULAN[m - 1] + ' ' + y;
  }
  function julatTarikh(mula, akhir) {
    if (!akhir || mula === akhir) return tarikhSederhana(mula);
    const [y1, m1, d1] = mula.split('-').map(Number), [y2, m2] = akhir.split('-').map(Number);
    if (y1 === y2 && m1 === m2) return d1 + ' – ' + tarikhSederhana(akhir);
    return tarikhSederhana(mula) + ' – ' + tarikhSederhana(akhir);
  }
  function jamKini(d) {
    const p = bahagian(d || new Date());
    return (p.hour === '24' ? '00' : p.hour) + ':' + p.minute + ':' + p.second;
  }
  function tambahHari(iso, n) {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + n));
    return dt.toISOString().slice(0, 10);
  }
  function rm(n) {
    return 'RM ' + Number(n || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function tidur(ms) { return new Promise(r => setTimeout(r, ms)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  // ---------------- MOD DEMO (tiada server) ----------------
  const DK = 'ws_demo_v2';
  function demoState() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(DK)); } catch (e) { /* abaikan */ }
    if (s && s.v === 2) return s;
    const hari = isoHariIni();
    s = {
      v: 2, office: null,
      staf: [
        ['D001', 'Pengguna Demo', 'Unit Percubaan', 'DEMO01'],
        ['K1021', 'Ahmad Faizal bin Rahman', 'Unit Penguatkuasaan', ''],
        ['K1034', 'Nurul Aina binti Kassim', 'Unit Kastam Pelanggan', ''],
        ['K1047', 'Mohd Hafiz bin Ismail', 'Unit Penguatkuasaan', ''],
        ['K1052', 'Siti Khadijah binti Omar', 'Unit Pentadbiran', ''],
        ['K1068', 'Rajesh a/l Subramaniam', 'Unit Kastam Pelanggan', ''],
        ['K1073', 'Tan Mei Ling', 'Unit Kewangan', ''],
        ['K1089', 'Muhammad Irfan bin Zulkifli', 'Unit Pentadbiran', ''],
      ].map(x => ({ id: x[0], nama: x[1], jawatan: x[2], kod: x[3], cred: x[0] === 'D001' ? '' : 'demo-' + x[0] })),
      rekod: [
        [hari, '07:41:12', 'K1021', 50, 38], [hari, '07:48:55', 'K1034', 120.5, 64],
        [hari, '07:56:03', 'K1047', 20, 112], [hari, '08:12:40', 'K1068', 300, 51],
        [hari, '08:34:18', 'K1073', 75, 23],
      ].map(r => ({ tarikh: r[0], masa: r[1], id: r[2], jumlah: r[3], jarak: r[4], lokasi: 'Pejabat Utama (demo)',
        status: r[1] > '08:30:00' ? 'Lewat' : 'Tepat Masa' })),
      cuti: [
        { id: 'C1', id_staf: 'K1052', jenis: 'Cuti Rehat', mula: hari, akhir: tambahHari(hari, 2), catatan: 'Urusan keluarga', oleh: 'Staf (cap jari)' },
        { id: 'C2', id_staf: 'K1089', jenis: 'Kursus / Latihan', mula: hari, akhir: hari, catatan: 'Kursus Pengurusan Risiko', oleh: 'Ketua' },
      ],
    };
    demoSimpan(s);
    return s;
  }
  function demoSimpan(s) { try { localStorage.setItem(DK, JSON.stringify(s)); } catch (e) { /* abaikan */ } }
  function demoCredPertama() { const s = demoState(); const st = s.staf.find(x => x.cred && x.id === 'D001'); return st ? st.cred : 'tiada'; }
  function demoErr(m) { throw new Error(m); }
  function demoPosisi() {
    return new Promise(res => {
      if (!navigator.geolocation) return res(null);
      setTimeout(() => res(null), 8000); // jika pengguna belum jawab soalan kebenaran lokasi
      navigator.geolocation.getCurrentPosition(p => res({ lat: p.coords.latitude, lng: p.coords.longitude }), () => res(null),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 });
    });
  }

  async function demoApi(action, b) {
    await tidur(250);
    const s = demoState();
    const now = new Date();
    const hari = isoHariIni(now), masa = jamKini(now);
    const cariCred = c => s.staf.find(x => x.cred && x.cred === c);
    switch (action) {
      case 'config': {
        if (!s.office) {
          // Demo: pejabat diletakkan di lokasi anda sekarang supaya anda boleh cuba aliran penuh.
          s.office = (await demoPosisi()) || { lat: 3.1390, lng: 101.6869 };
          demoSimpan(s);
        }
        return { jabatan: 'Jabatan Demo', lokasi: [{ nama: 'Pejabat Utama (demo)', lat: s.office.lat, lng: s.office.lng, radius: 200 }],
          maxAcc: 100, maxAmt: 10000, jenisCuti: JENIS_CUTI, cutiHariLepas: 3 };
      }
      case 'regBegin': {
        const st = s.staf.find(x => x.id === String(b.staffId || '').trim().toUpperCase());
        if (!st || st.kod !== String(b.code || '').trim().toUpperCase()) demoErr('No. Pekerja atau Kod Daftar salah.');
        if (st.cred) demoErr('No. Pekerja ini sudah didaftarkan pada telefon lain.');
        return { challenge: 'demo', userId: 'ZGVtbw', staffId: st.id, nama: st.nama, rpName: 'Jabatan Demo' };
      }
      case 'regFinish': {
        const st = s.staf.find(x => x.id === String(b.staffId).toUpperCase());
        st.cred = b.credId; st.kod = ''; demoSimpan(s);
        return { staffId: st.id, nama: st.nama, credId: st.cred };
      }
      case 'challenge': return { challenge: 'demo' + Math.random() };
      case 'identify': {
        const st = cariCred(b.credId);
        if (!st) demoErr('Tiada passkey berdaftar di telefon ini. Sila daftar dahulu.');
        return { staffId: st.id, nama: st.nama, credId: st.cred };
      }
      case 'status': {
        const r = s.rekod.find(x => x.tarikh === hari && x.id === String(b.staffId).toUpperCase());
        const c = cutiPada(s, hari, String(b.staffId).toUpperCase());
        return { tarikh: hari, masaServer: masa, done: !!r, masa: r ? r.masa : null, cuti: c };
      }
      case 'absen': {
        const st = cariCred(b.credId);
        if (!st) demoErr('Telefon ini tidak berdaftar. Sila daftar semula.');
        if (b.mula < tambahHari(hari, -3)) demoErr('Tarikh mula terlalu lama. Ketidakhadiran lebih 3 hari lepas perlu direkod oleh ketua.');
        return demoSimpanCuti(s, st, b, 'Staf (cap jari)');
      }
      case 'adminAbsen': {
        if (b.pin !== '123456') demoErr('PIN salah.');
        const st = s.staf.find(x => x.id === String(b.staffId).toUpperCase());
        if (!st) demoErr('Staf tidak dijumpai.');
        return demoSimpanCuti(s, st, b, 'Ketua');
      }
      case 'adminBatalAbsen': {
        if (b.pin !== '123456') demoErr('PIN salah.');
        const i = s.cuti.findIndex(x => x.id === b.id);
        if (i < 0) demoErr('Rekod tidak dijumpai atau sudah dibatalkan.');
        s.cuti.splice(i, 1); demoSimpan(s);
        return { id: b.id };
      }
      case 'clockIn': {
        const st = cariCred(b.credId);
        if (!st) demoErr('Telefon ini tidak berdaftar. Sila daftar semula.');
        const jumlah = Math.round(Number(b.amount) * 100) / 100;
        if (b.amount === '' || !isFinite(jumlah) || jumlah < 0) demoErr('Jumlah wang tidak sah.');
        if (b.lat == null) demoErr('Lokasi GPS tidak diterima.');
        if (b.accuracy > 100) demoErr('Isyarat GPS lemah (ketepatan ' + Math.round(b.accuracy) + ' m).');
        const d = jarakMeter(b.lat, b.lng, s.office.lat, s.office.lng);
        if (d > 200) demoErr('Anda berada di luar kawasan pejabat (' + Math.round(d) + ' m dari Pejabat Utama (demo)).');
        const ada = s.rekod.find(x => x.tarikh === hari && x.id === st.id);
        if (ada) demoErr('Anda sudah isi rekod hari ini pada ' + ada.masa + '. Rekod tidak boleh diubah.');
        const status = masa > '08:30:00' ? 'Lewat' : 'Tepat Masa';
        s.rekod.push({ tarikh: hari, masa: masa, id: st.id, jumlah: jumlah, jarak: Math.round(d), lokasi: 'Pejabat Utama (demo)', status: status });
        demoSimpan(s);
        return { nama: st.nama, staffId: st.id, tarikh: hari, masa: masa, jumlah: jumlah, lokasi: 'Pejabat Utama (demo)', jarak: Math.round(d), status: status };
      }
      case 'adminLogin':
        if (b.pin !== '123456') demoErr('PIN salah. (Mod demo: PIN ialah 123456)');
        return { jabatan: 'Jabatan Demo', hariIni: hari };
      case 'adminDaily': {
        if (b.pin !== '123456') demoErr('PIN salah.');
        const tarikh = b.date || hari;
        const senarai = s.staf.map(st => {
          const r = s.rekod.find(x => x.tarikh === tarikh && x.id === st.id);
          const c = cutiPada(s, tarikh, st.id);
          return { staffId: st.id, nama: st.nama, jawatan: st.jawatan, daftar: !!st.cred, done: !!r, masa: r ? r.masa : '',
            jumlah: r ? r.jumlah : 0, lokasi: r ? r.lokasi : '', jarak: r ? r.jarak : null,
            status: r ? r.status : (c ? c.jenis : 'Belum isi'), cuti: c };
        });
        const sudah = senarai.filter(x => x.done);
        const bercuti = senarai.filter(x => !x.done && x.cuti);
        return { jabatan: 'Jabatan Demo', tarikh: tarikh, dijana: tarikh + 'T' + masa, senarai: senarai, jenisCuti: JENIS_CUTI,
          ringkasan: { jumlahStaf: senarai.length, sudah: sudah.length, cuti: bercuti.length, belum: senarai.length - sudah.length - bercuti.length,
            lewat: sudah.filter(x => x.status === 'Lewat').length, jumlahWang: sudah.reduce((a, x) => a + x.jumlah, 0) } };
      }
      default: demoErr('Tindakan tidak sah.');
    }
  }
  function cutiPada(s, tarikh, id) {
    const c = s.cuti.find(x => x.id_staf === id && x.mula <= tarikh && tarikh <= x.akhir);
    return c ? { id: c.id, jenis: c.jenis, catatan: c.catatan, oleh: c.oleh, mula: c.mula, akhir: c.akhir } : null;
  }
  function demoSimpanCuti(s, st, b, oleh) {
    const mula = b.mula, akhir = b.akhir || b.mula;
    if (JENIS_CUTI.indexOf(b.jenis) < 0) demoErr('Sila pilih jenis ketidakhadiran.');
    const iso = /^\d{4}-\d{2}-\d{2}$/;
    if (!iso.test(mula || '') || !iso.test(akhir || '')) demoErr('Tarikh tidak sah.');
    if (akhir < mula) demoErr('Tarikh akhir mesti sama atau selepas tarikh mula.');
    if (b.jenis === 'Cuti Lain' && !String(b.catatan || '').trim()) demoErr('Sila nyatakan sebab dalam catatan untuk "Cuti Lain".');
    const t = s.cuti.find(x => x.id_staf === st.id && !(akhir < x.mula || mula > x.akhir));
    if (t) demoErr('Sudah ada rekod ' + t.jenis + ' (' + t.mula + ' hingga ' + t.akhir + ') yang bertindih. Minta ketua batalkan dahulu jika perlu ubah.');
    const c = { id: 'C' + Date.now(), id_staf: st.id, jenis: b.jenis, mula: mula, akhir: akhir, catatan: String(b.catatan || '').trim(), oleh: oleh };
    s.cuti.push(c); demoSimpan(s);
    return { id: c.id, staffId: st.id, nama: st.nama, jenis: c.jenis, mula: mula, akhir: akhir, catatan: c.catatan, oleh: oleh };
  }
  function demoReset() { try { localStorage.removeItem(DK); } catch (e) { /* abaikan */ } }


  window.WS = { DEMO, api, passkey, cabaran, jarakMeter, terdekat, teksJarak, isoHariIni, tarikhPanjang, tarikhSederhana,
    julatTarikh, jamKini, tambahHari, rm, esc, tidur, demoReset, JENIS_CUTI };
})();
