/**
 * MODIS → [EXT] GRAB MODIS - Project Tracker, tab "Daily Report" (tabel hari sebagai kolom)
 * --------------------------------------------------------------------------------------
 * Pasang di spreadsheet [INT] (yang sudah memakai MODIS_FieldSync.gs): Extensions > Apps Script >
 * tambah file baru > tempel isi file ini > Save. Tidak mengubah apa pun sampai dijalankan lewat menu.
 *
 * Cara kerja: membaca tab "Daily Report" milik [INT] (diisi otomatis oleh MODIS_FieldSync.gs, per hari per unit,
 * conversion per ORANG) lalu mengisi sel biru di [EXT] Daily Report: Shift, Venue 1/2, Reach, Contacts,
 * PaHe new, PaHe lapsed re-subs, GB Hemat ride, Welcome given, Capsules drawn, Tier C/B/A, Golden, Candy draws,
 * Photobooth prints, Issue / note. Baris TOTAL, target, dan kumulatif di [EXT] adalah rumus dan tidak disentuh.
 *
 * KEAMANAN (supaya data uji tidak masuk ke sheet klien):
 *   - Secara bawaan hanya boleh menulis ke SHEET UJI (salinan [EXT]). Isi ID salinan lewat menu "Atur sheet tujuan".
 *   - Menulis ke [EXT] asli hanya setelah menu "Buka kunci [EXT] asli (H-1/H-2)" dijalankan.
 *   - Hanya tanggal yang punya kolom di [EXT] (mulai 26 Okt 2026) yang diisi; data uji 16-19 Okt otomatis terlewat.
 */
var X = {
  REAL_EXT_ID: '1ob3u9yZxJPW5CIegyVz6PiTvdknYQ95eA_ytDfIiHQE',
  TAB: 'Daily Report',
  TZ: 'Asia/Jakarta',
  YEAR_START: 2026,
};
// Urutan metrik di [EXT] -> indeks kolom di tab Daily Report [INT]
//   [INT] kolom (nomor mulai 1): A Tanggal, B Unit, C Shift, D Venue1, E Venue2, F Reach, G Contacts, H PaHe New, I PaHe Churned, J GB,
//   K Welcome, L Capsules, M Tier C, N Tier B, O Tier A, P Golden, Q Candy, R Photobooth, S Issue
var X_METRICS = [
  ['Shift (text)', 3], ['Venue 1 (text)', 4], ['Venue 2 (text, mobil only)', 5], ['Reach (pax)', 6], ['Contacts (pax)', 7],
  ['PaHe new', 8], ['PaHe lapsed re-subs', 9], ['GB Hemat ride', 10], ['Welcome given', 11], ['Capsules drawn', 12],
  ['Tier C', 13], ['Tier B', 14], ['Tier A', 15], ['Golden', 16], ['Candy draws', 17], ['Photobooth prints', 18], ['Issue / note (text)', 19],
];
var X_UNITS = ['Mobil Diskon', 'Kiosk Diskon 1', 'Kiosk Diskon 2'];

function extMenu_() {
  SpreadsheetApp.getUi()
    .createMenu('MODIS → [EXT]')
    .addItem('Atur sheet tujuan (salinan uji)', 'extSetTarget')
    .addItem('Kirim Daily Report ke tujuan', 'extPush')
    .addItem('Isi data dummy ke sheet uji', 'extDummy')
    .addSeparator()
    .addItem('Buka kunci [EXT] asli (H-1/H-2)', 'extUnlockReal')
    .addItem('Kunci lagi (kembali ke sheet uji)', 'extLock')
    .addItem('Aktifkan kirim otomatis (30 menit)', 'extEnableAuto')
    .addItem('Matikan kirim otomatis', 'extDisableAuto')
    .addToUi();
}
/** Dipanggil dari onOpen yang sudah ada (tambahkan baris: extMenu_();) atau jalankan sekali secara manual. */
function onOpen_ExtDailyReport() { extMenu_(); }

function extProps_() { return PropertiesService.getScriptProperties(); }
function extTargetId_() {
  var p = extProps_();
  var live = p.getProperty('EXT_LIVE') === 'YA';
  if (live) return X.REAL_EXT_ID;
  var id = p.getProperty('EXT_TEST_ID');
  if (!id) throw new Error('Sheet uji belum diatur. Pakai menu "Atur sheet tujuan" (tempel link salinan [EXT]).');
  if (id === X.REAL_EXT_ID) throw new Error('Itu sheet [EXT] asli. Gunakan salinan untuk uji, atau "Buka kunci [EXT] asli".');
  return id;
}
function extSetTarget() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.prompt('Sheet uji', 'Tempel link / ID salinan [EXT] Project Tracker (File > Make a copy):', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var m = String(r.getResponseText()).match(/[-\w]{25,}/);
  if (!m) { ui.alert('ID tidak dikenali.'); return; }
  if (m[0] === X.REAL_EXT_ID) { ui.alert('Itu sheet [EXT] asli. Buat salinan dulu untuk uji.'); return; }
  extProps_().setProperty('EXT_TEST_ID', m[0]);
  ui.alert('Sheet uji tersimpan.');
}
function extUnlockReal() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.alert('Buka kunci [EXT] asli', 'Data lapangan akan ditulis ke sheet KLIEN. Selama masa demo, data dummy boleh dikirim (Mode uji menggeser tanggalnya ke 26 Okt dst). Sebelum 26 Okt: hapus data dummy, pilih Mode resmi, lalu kirim ulang. Lanjut?', ui.ButtonSet.YES_NO);
  if (r === ui.Button.YES) { extProps_().setProperty('EXT_LIVE', 'YA'); ui.alert('Terbuka. Kirim berikutnya menulis ke [EXT] asli.'); }
}
function extLock() { extProps_().deleteProperty('EXT_LIVE'); SpreadsheetApp.getActive().toast('Kembali menulis ke sheet uji', 'MODIS → [EXT]', 5); }
function extEnableAuto() {
  extDisableAuto();
  ScriptApp.newTrigger('extAuto').timeBased().everyMinutes(30).create();
  SpreadsheetApp.getUi().alert('Kirim otomatis aktif tiap 30 menit.');
}
function extDisableAuto() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'extAuto') ScriptApp.deleteTrigger(t); });
}
function extAuto() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try { extPushCore_(extSourceRows_()); } finally { lock.releaseLock(); }
}
function extPush() {
  var n = extPushCore_(extSourceRows_());
  SpreadsheetApp.getActive().toast(n + ' sel diperbarui di tujuan', 'MODIS → [EXT]', 6);
}

/** Baris dari tab Daily Report [INT]: [{day, unit, vals:[...]}] */
function extSourceRows_() {
  var sh = SpreadsheetApp.getActive().getSheetByName(typeof dailyTabName_ === 'function' ? dailyTabName_() : X.TAB);
  if (!sh) throw new Error('Tab "Daily Report" [INT] belum ada. Jalankan "Sync sekarang" di menu MODIS Field dulu.');
  var v = sh.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < v.length; i++) {
    var d = v[i][0] instanceof Date ? Utilities.formatDate(v[i][0], X.TZ, 'yyyy-MM-dd') : String(v[i][0]).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    out.push({ day: d, unit: String(v[i][1]).trim(), vals: v[i] });
  }
  return typeof ujiShift_ === 'function' ? ujiShift_(out) : out;
}

var X_MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, mei: 5, jun: 6, jul: 7, aug: 8, agu: 8, sep: 9, oct: 10, okt: 10, nov: 11, dec: 12, des: 12 };
/** Nilai sel tanggal ([EXT]: "26 Oct" / Date) -> yyyy-MM-dd; tahun mengikuti kampanye (Okt-Des 2026, Jan 2027). */
function extDayOf_(cell) {
  if (cell instanceof Date) return Utilities.formatDate(cell, X.TZ, 'yyyy-MM-dd');
  var m = String(cell || '').trim().toLowerCase().match(/^(\d{1,2})\s+([a-z]{3})/);
  if (!m || !X_MON[m[2]]) return '';
  var mo = X_MON[m[2]], y = mo >= 9 ? X.YEAR_START : X.YEAR_START + 1;
  return y + '-' + ('0' + mo).slice(-2) + '-' + ('0' + m[1]).slice(-2);
}

/** Tulis ke tujuan. Hanya sel milik tanggal yang punya kolom; mengembalikan jumlah sel yang ditulis. */
function extPushCore_(rows) {
  var ss = SpreadsheetApp.openById(extTargetId_());
  var sh = ss.getSheetByName(X.TAB);
  if (!sh) throw new Error('Tab "Daily Report" tidak ada di sheet tujuan.');
  var v = sh.getDataRange().getValues();
  // Baris tanggal & kolom per tanggal
  var dateRow = -1;
  for (var i = 0; i < v.length; i++) if (String(v[i][0]).trim() === 'Date') { dateRow = i; break; }
  if (dateRow < 0) throw new Error('Baris "Date" tidak ditemukan di tab Daily Report tujuan.');
  var colOf = {};
  for (var c = 2; c < v[dateRow].length; c++) { var k = extDayOf_(v[dateRow][c]); if (k) colOf[k] = c; }
  // Baris metrik per unit (cari header unit di kolom A, lalu label di kolom B)
  var rowOf = {};
  X_UNITS.forEach(function (u) {
    var start = -1;
    for (var i = 0; i < v.length; i++) if (String(v[i][0]).trim() === u) { start = i; break; }
    if (start < 0) return;
    rowOf[u] = {};
    for (var j = start + 1; j < Math.min(v.length, start + 25); j++) {
      var a = String(v[j][0]).trim();
      if (a) break; // header unit berikutnya / TOTAL
      var lab = String(v[j][1]).trim();
      if (lab) rowOf[u][lab] = j;
    }
  });
  var n = 0;
  rows.forEach(function (r) {
    var col = colOf[r.day];
    var map = rowOf[r.unit];
    if (col === undefined || !map) return;
    X_METRICS.forEach(function (mt) {
      var row = map[mt[0]];
      if (row === undefined) return;
      if (mt[0] === 'Venue 2 (text, mobil only)' && r.unit !== 'Mobil Diskon') return;
      var val = r.vals[mt[1] - 1];
      if (val === '' || val === null || val === undefined) return;
      sh.getRange(row + 1, col + 1).setValue(val);
      n++;
    });
  });
  return n;
}

/** Data dummy 26-28 Okt untuk menguji tampilan [EXT]. Hanya ke sheet uji (tidak pernah ke [EXT] asli). */
function extDummy() {
  if (extProps_().getProperty('EXT_LIVE') === 'YA') { SpreadsheetApp.getUi().alert('Kunci dulu (kembali ke sheet uji) sebelum mengisi dummy.'); return; }
  var rows = [];
  ['2026-10-26', '2026-10-27', '2026-10-28'].forEach(function (d, i) {
    X_UNITS.forEach(function (u, k) {
      var pn = 120 + i * 7 + k * 5, pl = 30 + k * 3, gb = 45 + i * 4;
      rows.push({ day: d, unit: u, vals: [d, u, k === 0 ? 'AM 05.00-14.00' : 'PM 12.00-21.00', 'Halte TransJakarta CSW', k === 0 ? 'Halte TransJakarta Cawang UKI' : '',
        2400 + i * 100, 640 + k * 20, pn, pl, gb, pn + pl, pn + pl + gb, 40, 18, 6, 1, 55, 70, '[DUMMY]'] });
    });
  });
  var n = extPushCore_(rows);
  SpreadsheetApp.getActive().toast('Dummy terisi: ' + n + ' sel di sheet uji', 'MODIS → [EXT]', 6);
}
