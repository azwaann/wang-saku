// Paparan Ketua: senarai harian, siapa belum isi, cetak / PDF.
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
    $('btnSelepas').disabled = tarikh >= hariIni;
    $('btnMuat').disabled = true;
    try {
      data = await WS.api('adminDaily', { pin: pin, date: tarikh });
      papar();
    } catch (e) {
      if (/PIN/.test(e.message)) { try { sessionStorage.removeItem(SS_PIN); } catch (x) { /* abaikan */ } tunjuk('v-login'); }
      toast(e.message);
    } finally { $('btnMuat').disabled = false; }
  }

  function susun(senarai) {
    const sudah = senarai.filter(x => x.done).sort((a, b) => a.masa.localeCompare(b.masa));
    const belum = senarai.filter(x => !x.done);
    return sudah.concat(belum);
  }

  function pillStatus(x) {
    if (!x.done) return '<span class="pill bad">Belum isi</span>' + (x.daftar ? '' : '<span class="tag">Telefon belum daftar</span>');
    return '<span class="pill ' + (x.status === 'Lewat' ? 'warn' : 'ok') + '">' + WS.esc(x.status) + '</span>';
  }

  function papar() {
    const d = data, r = d.ringkasan;
    $('tajukHari').textContent = WS.tarikhPanjang(d.tarikh);
    $('dikemas').textContent = 'Dikemas kini ' + WS.jamKini() + (d.tarikh === hariIni ? ' · auto setiap minit' : '');
    $('tStaf').textContent = r.jumlahStaf;
    $('tSudah').textContent = r.sudah;
    $('tBelum').textContent = r.belum;
    $('tLewat').textContent = r.lewat;
    $('tWang').textContent = WS.rm(r.jumlahWang);
    $('tBar').style.width = (r.jumlahStaf ? Math.round(r.sudah / r.jumlahStaf * 100) : 0) + '%';

    const q = carian.toLowerCase();
    const baris = susun(d.senarai).filter(x =>
      (tapis === 'semua' || (tapis === 'sudah') === x.done) &&
      (!q || x.nama.toLowerCase().includes(q) || x.staffId.toLowerCase().includes(q)));

    $('badan').innerHTML = baris.map((x, i) =>
      '<tr class="' + (x.done ? '' : 'belum') + '">' +
      '<td class="bil muted">' + (i + 1) + '</td>' +
      '<td class="nmc"><div class="nm">' + WS.esc(x.nama) + '</div><div class="sub">' + WS.esc(x.staffId) + (x.jawatan ? ' · ' + WS.esc(x.jawatan) : '') + '</div></td>' +
      '<td class="masac masa">' + (x.done ? WS.esc(x.masa) : '') + '</td>' +
      '<td class="jml r">' + (x.done ? WS.rm(x.jumlah).replace('RM ', '') : '') + '</td>' +
      '<td class="lok">' + (x.done ? WS.esc(x.lokasi) + (x.jarak != null ? ' <span class="sub">(' + WS.teksJarak(x.jarak) + ')</span>' : '') : '<span class="sub">—</span>') + '</td>' +
      '<td class="st">' + pillStatus(x) + '</td>' +
      '</tr>').join('');
    $('kosong').hidden = baris.length > 0;
    paparCetak();
  }

  function paparCetak() {
    const d = data, r = d.ringkasan;
    const semua = susun(d.senarai);
    $('cetak').innerHTML =
      '<div class="kop"><div><div class="j">' + WS.esc(d.jabatan) + '</div><h1>Rekod Buku Wang Saku Harian</h1></div>' +
      '<div style="text-align:right"><b>' + WS.esc(WS.tarikhPanjang(d.tarikh)) + '</b><br>Dijana: ' + WS.esc(String(d.dijana).replace('T', ' ').slice(0, 19)) + '</div></div>' +
      '<div class="ring"><span>Jumlah staf: <b>' + r.jumlahStaf + '</b></span><span>Sudah isi: <b>' + r.sudah + '</b></span>' +
      '<span>Belum isi: <b>' + r.belum + '</b></span><span>Lewat: <b>' + r.lewat + '</b></span><span>Jumlah wang: <b>' + WS.rm(r.jumlahWang) + '</b></span></div>' +
      '<table><thead><tr><th>Bil</th><th>No. Pekerja</th><th>Nama</th><th>Masa Masuk</th><th style="text-align:right">Jumlah (RM)</th><th>Lokasi</th><th>Status</th><th>Pengesahan</th></tr></thead><tbody>' +
      semua.map((x, i) => '<tr><td>' + (i + 1) + '</td><td>' + WS.esc(x.staffId) + '</td><td>' + WS.esc(x.nama) + '</td>' +
        '<td>' + (x.done ? WS.esc(x.masa) : '—') + '</td><td class="r">' + (x.done ? WS.rm(x.jumlah).replace('RM ', '') : '—') + '</td>' +
        '<td>' + (x.done ? WS.esc(x.lokasi) + (x.jarak != null ? ' (' + WS.teksJarak(x.jarak) + ')' : '') : '—') + '</td>' +
        '<td>' + WS.esc(x.done ? x.status : 'BELUM ISI') + '</td><td>' + (x.done ? 'Biometrik' : '—') + '</td></tr>').join('') +
      '</tbody></table>' +
      '<div class="ttd"><div><div class="garis"></div>Disemak oleh (Tandatangan &amp; Cop)<br>Nama:<br>Jawatan:<br>Tarikh:</div><div></div></div>' +
      '<div class="kaki">Rekod dijana secara digital oleh sistem Buku Wang Saku. Masa masuk diambil dari masa server; setiap rekod disahkan dengan biometrik telefon staf (cap jari / Face ID) dan lokasi GPS dalam kawasan pejabat.</div>';
  }

  // ---------- kawalan ----------
  $('inTarikh').addEventListener('change', e => { if (e.target.value) { tarikh = e.target.value > hariIni ? hariIni : e.target.value; muat(); } });
  $('btnSebelum').onclick = () => { tarikh = WS.tambahHari(tarikh, -1); muat(); };
  $('btnSelepas').onclick = () => { if (tarikh < hariIni) { tarikh = WS.tambahHari(tarikh, 1); muat(); } };
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
    if (pin && data && tarikh === hariIni && document.visibilityState === 'visible' && !$('v-papan').hidden) muat();
  }, 60000);

  mula();
})();
