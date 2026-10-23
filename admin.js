// Paparan Ketua: senarai harian, siapa belum isi, cuti / kursus, cetak / PDF.
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const SS_PIN = 'ws_pin';
  let pin = null, hariIni = WS.isoHariIni(), tarikh = hariIni, data = null, tapis = 'semua', carian = '';

  function tunjuk(v) { ['v-login', 'v-papan', 'v-muat'].forEach(x => { $(x).hidden = x !== v; }); }
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

  async function mula() {
    if (WS.DEMO) $('demoBanner').hidden = false;
    try { pin = sessionStorage.getItem(SS_PIN); } catch (e) { pin = null; }
    if (pin) {
      try { await masuk(pin); return; } catch (e) { /* PIN lama tidak sah */ }
    }
    tunjuk('v-login');
    $('inPin').focus();
  }

  async function masuk(p) {
    const r = await WS.api('adminLogin', { pin: p });
    pin = p;
    try { sessionStorage.setItem(SS_PIN, p); } catch (e) { /* abaikan */ }
    hariIni = r.hariIni; tarikh = r.hariIni;
    $('jabatan').textContent = r.jabatan;
    $('btnKeluar').hidden = false;
    tunjuk('v-papan');
    await muat();
  }

  $('fLogin').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = $('btnLogin');
    $('errLogin').hidden = true;
    btn.disabled = true; btn.innerHTML = '<span class="spin"></span>Menyemak…';
    try { await masuk($('inPin').value); }
    catch (err) { $('errLogin').textContent = err.message; $('errLogin').hidden = false; }
    finally { btn.disabled = false; btn.textContent = 'Masuk'; }
  });

  $('btnKeluar').onclick = () => {
    try { sessionStorage.removeItem(SS_PIN); } catch (e) { /* abaikan */ }
    location.reload();
  };

  async function muat() {
    $('inTarikh').value = tarikh;
    $('btnMuat').disabled = true;
    try {
      data = await WS.api('adminDaily', { pin: pin, date: tarikh });
      papar();
    } catch (e) {
      if (/PIN/.test(e.message)) { try { sessionStorage.removeItem(SS_PIN); } catch (x) { /* abaikan */ } tunjuk('v-login'); }
      toast(e.message);
    } finally { $('btnMuat').disabled = false; }
  }

  // Susunan: hadir (ikut masa) › cuti / kursus › belum isi
  function susun(senarai) {
    const sudah = senarai.filter(x => x.done).sort((a, b) => a.masa.localeCompare(b.masa));
    const cuti = senarai.filter(x => !x.done && x.cuti);
    const belum = senarai.filter(x => !x.done && !x.cuti);
    return sudah.concat(cuti, belum);
  }
  function kategori(x) { return x.done ? 'sudah' : (x.cuti ? 'cuti' : 'belum'); }

  function pillStatus(x) {
    if (x.done) {
      return '<span class="pill ' + (x.status === 'Lewat' ? 'warn' : 'ok') + '">' + WS.esc(x.status) + '</span>' +
        (x.cuti ? '<span class="tag">Ada rekod ' + WS.esc(x.cuti.jenis) + '</span>' : '');
    }
    if (x.cuti) {
      return '<span class="pill info">' + WS.esc(x.cuti.jenis) + '</span>' +
        '<button class="batal" data-batal="' + WS.esc(x.cuti.id) + '" data-nama="' + WS.esc(x.nama) + '">Batal</button>';
    }
    return '<span class="pill bad">Belum isi</span>' + (x.daftar ? '' : '<span class="tag">Telefon belum daftar</span>');
  }

  function infoCuti(c) {
    return WS.esc(WS.julatTarikh(c.mula, c.akhir)) + (c.catatan ? ' · ' + WS.esc(c.catatan) : '') +
      ' <span class="sub">(oleh ' + WS.esc(c.oleh) + ')</span>';
  }

  function papar() {
    const d = data, r = d.ringkasan;
    $('tajukHari').textContent = WS.tarikhPanjang(d.tarikh);
    $('dikemas').textContent = 'Dikemas kini ' + WS.jamKini() + (d.tarikh === hariIni ? ' · auto setiap minit' : (d.tarikh > hariIni ? ' · tarikh akan datang' : ''));
    $('tStaf').textContent = r.jumlahStaf;
    $('tSudah').textContent = r.sudah;
    $('tCuti').textContent = r.cuti || 0;
    $('tBelum').textContent = r.belum;
    $('tLewat').textContent = r.lewat;
    $('tWang').textContent = WS.rm(r.jumlahWang);
    const perlu = r.jumlahStaf - (r.cuti || 0);
    $('tBar').style.width = (perlu ? Math.round(r.sudah / perlu * 100) : 0) + '%';

    const q = carian.toLowerCase();
    const baris = susun(d.senarai).filter(x =>
      (tapis === 'semua' || tapis === kategori(x)) &&
      (!q || x.nama.toLowerCase().includes(q) || x.staffId.toLowerCase().includes(q)));

    $('badan').innerHTML = baris.map((x, i) => {
      const k = kategori(x);
      let lok;
      if (k === 'sudah') lok = WS.esc(x.lokasi) + (x.jarak != null ? ' <span class="sub">(' + WS.teksJarak(x.jarak) + ')</span>' : '');
      else if (k === 'cuti') lok = infoCuti(x.cuti);
      else lok = '<span class="sub">—</span>';
      return '<tr class="' + (k === 'belum' ? 'belum' : k === 'cuti' ? 'cuti' : '') + '">' +
        '<td class="bil muted">' + (i + 1) + '</td>' +
        '<td class="nmc"><div class="nm">' + WS.esc(x.nama) + '</div><div class="sub">' + WS.esc(x.staffId) + (x.jawatan ? ' · ' + WS.esc(x.jawatan) : '') + '</div></td>' +
        '<td class="masac masa">' + (x.done ? WS.esc(x.masa) : '') + '</td>' +
        '<td class="jml r">' + (x.done ? WS.rm(x.jumlah).replace('RM ', '') : '') + '</td>' +
        '<td class="lok' + (k === 'cuti' ? ' ada' : '') + '">' + lok + '</td>' +
        '<td class="st">' + pillStatus(x) + '</td>' +
        '</tr>';
    }).join('');
    $('kosong').hidden = baris.length > 0;
    paparCetak();
  }

  function paparCetak() {
    const d = data, r = d.ringkasan;
    const semua = susun(d.senarai);
    $('cetak').innerHTML =
      '<div class="kop"><div><div class="j">' + WS.esc(d.jabatan) + '</div><h1>Rekod Buku Wang Saku Harian</h1></div>' +
      '<div style="text-align:right"><b>' + WS.esc(WS.tarikhPanjang(d.tarikh)) + '</b><br>Dijana: ' + WS.esc(String(d.dijana).replace('T', ' ').slice(0, 19)) + '</div></div>' +
      '<div class="ring"><span>Jumlah staf: <b>' + r.jumlahStaf + '</b></span><span>Hadir (sudah isi): <b>' + r.sudah + '</b></span>' +
      '<span>Cuti / Kursus / Tugas luar: <b>' + (r.cuti || 0) + '</b></span><span>Belum isi: <b>' + r.belum + '</b></span>' +
      '<span>Lewat: <b>' + r.lewat + '</b></span><span>Jumlah wang: <b>' + WS.rm(r.jumlahWang) + '</b></span></div>' +
      '<table><thead><tr><th>Bil</th><th>No. Pekerja</th><th>Nama</th><th>Masa Masuk</th><th style="text-align:right">Jumlah (RM)</th><th>Lokasi / Catatan</th><th>Status</th><th>Pengesahan</th></tr></thead><tbody>' +
      semua.map((x, i) => {
        const k = kategori(x);
        const lok = k === 'sudah' ? WS.esc(x.lokasi) + (x.jarak != null ? ' (' + WS.teksJarak(x.jarak) + ')' : '')
          : k === 'cuti' ? WS.esc(WS.julatTarikh(x.cuti.mula, x.cuti.akhir)) + (x.cuti.catatan ? ' · ' + WS.esc(x.cuti.catatan) : '') : '—';
        const status = k === 'sudah' ? x.status : k === 'cuti' ? x.cuti.jenis.toUpperCase() : 'BELUM ISI';
        const sah = k === 'sudah' ? 'Biometrik' : k === 'cuti' ? (x.cuti.oleh === 'Ketua' ? 'Direkod ketua' : 'Biometrik') : '—';
        return '<tr><td>' + (i + 1) + '</td><td>' + WS.esc(x.staffId) + '</td><td>' + WS.esc(x.nama) + '</td>' +
          '<td>' + (x.done ? WS.esc(x.masa) : '—') + '</td><td class="r">' + (x.done ? WS.rm(x.jumlah).replace('RM ', '') : '—') + '</td>' +
          '<td>' + lok + '</td><td>' + WS.esc(status) + '</td><td>' + sah + '</td></tr>';
      }).join('') +
      '</tbody></table>' +
      '<div class="ttd"><div><div class="garis"></div>Disemak oleh (Tandatangan &amp; Cop)<br>Nama:<br>Jawatan:<br>Tarikh:</div><div></div></div>' +
      '<div class="kaki">Rekod dijana secara digital oleh sistem Buku Wang Saku. Masa masuk diambil dari masa server; setiap rekod disahkan dengan biometrik telefon staf (cap jari / Face ID) dan lokasi GPS dalam kawasan pejabat. Ketidakhadiran dimaklumkan oleh staf (biometrik) atau direkod oleh ketua.</div>';
  }

  // ---------- rekod / batal ketidakhadiran ----------
  function borangCuti(pilihId) {
    if (!data) return;
    const staf = data.senarai.slice().sort((a, b) => a.nama.localeCompare(b.nama));
    const jenisList = data.jenisCuti || WS.JENIS_CUTI;
    const sh = bukaSheet(
      '<h1>Rekod ketidakhadiran</h1>' +
      '<p class="muted small">Untuk staf yang tidak dapat maklum sendiri melalui apps.</p>' +
      '<label class="lbl" for="aStaf">Staf</label>' +
      '<select class="input" id="aStaf"><option value="">— Pilih staf —</option>' +
      staf.map(x => '<option value="' + WS.esc(x.staffId) + '"' + (x.staffId === pilihId ? ' selected' : '') + '>' + WS.esc(x.nama) + ' (' + WS.esc(x.staffId) + ')</option>').join('') +
      '</select>' +
      '<label class="lbl" for="aJenis">Jenis</label>' +
      '<select class="input" id="aJenis"><option value="">— Pilih jenis —</option>' + jenisList.map(j => '<option>' + WS.esc(j) + '</option>').join('') + '</select>' +
      '<div class="dua">' +
      '<div><label class="lbl" for="aMula">Dari</label><input class="input" type="date" id="aMula" value="' + tarikh + '"></div>' +
      '<div><label class="lbl" for="aAkhir">Hingga</label><input class="input" type="date" id="aAkhir" value="' + tarikh + '" min="' + tarikh + '"></div>' +
      '</div>' +
      '<label class="lbl" for="aCatatan">Catatan</label>' +
      '<textarea class="input" id="aCatatan" maxlength="200" rows="2" placeholder="cth: nama kursus, no. surat kelulusan cuti"></textarea>' +
      '<div class="err" id="errA" hidden></div>' +
      '<button class="btn btn-pri mt" id="aSimpan">Simpan</button>' +
      '<button class="btn btn-link mt-s" id="aBatal">Batal</button>');
    const q = s => sh.querySelector(s);
    const err = m => { q('#errA').textContent = m || ''; q('#errA').hidden = !m; };
    q('#aBatal').onclick = tutupSheet;
    q('#aMula').onchange = () => { const m = q('#aMula').value; q('#aAkhir').min = m; if (q('#aAkhir').value < m) q('#aAkhir').value = m; };
    q('#aSimpan').onclick = async () => {
      const body = { pin: pin, staffId: q('#aStaf').value, jenis: q('#aJenis').value, mula: q('#aMula').value,
        akhir: q('#aAkhir').value || q('#aMula').value, catatan: q('#aCatatan').value.trim() };
      if (!body.staffId) return err('Sila pilih staf.');
      if (!body.jenis) return err('Sila pilih jenis.');
      if (!body.mula) return err('Sila pilih tarikh.');
      err('');
      const b = q('#aSimpan');
      b.disabled = true; b.innerHTML = '<span class="spin"></span>Menyimpan…';
      try {
        const r = await WS.api('adminAbsen', body);
        tutupSheet();
        toast(r.jenis + ' direkod untuk ' + r.nama);
        muat();
      } catch (e) {
        err(e.message);
        b.disabled = false; b.textContent = 'Simpan';
      }
    };
  }

  $('btnRekodCuti').onclick = () => borangCuti('');
  $('badan').addEventListener('click', async e => {
    const b = e.target.closest('[data-batal]');
    if (!b) return;
    if (!confirm('Batalkan rekod ketidakhadiran untuk ' + b.dataset.nama + '?\n\nRekod asal kekal dalam Sheet bertanda "Dibatalkan".')) return;
    b.disabled = true;
    try {
      await WS.api('adminBatalAbsen', { pin: pin, id: b.dataset.batal });
      toast('Rekod dibatalkan');
      muat();
    } catch (err) { b.disabled = false; toast(err.message); }
  });

  // ---------- kawalan ----------
  $('inTarikh').addEventListener('change', e => { if (e.target.value) { tarikh = e.target.value; muat(); } });
  $('btnSebelum').onclick = () => { tarikh = WS.tambahHari(tarikh, -1); muat(); };
  $('btnSelepas').onclick = () => { tarikh = WS.tambahHari(tarikh, 1); muat(); };
  $('btnHariIni').onclick = () => { hariIni = WS.isoHariIni(); tarikh = hariIni; muat(); };
  $('btnMuat').onclick = () => muat();
  $('btnCetak').onclick = () => { if (data) window.print(); };
  $('seg').addEventListener('click', e => {
    const b = e.target.closest('button[data-t]');
    if (!b) return;
    tapis = b.dataset.t;
    $('seg').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    if (data) papar();
  });
  $('inCari').addEventListener('input', e => { carian = e.target.value.trim(); if (data) papar(); });

  // Auto muat semula setiap minit bila melihat hari ini
  setInterval(() => {
    if (pin && data && tarikh === hariIni && document.visibilityState === 'visible' && !$('v-papan').hidden && !$('lapisan').innerHTML) muat();
  }, 60000);

  mula();
})();
