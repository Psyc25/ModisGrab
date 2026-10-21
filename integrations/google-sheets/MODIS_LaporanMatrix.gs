/**
 * Tab "Laporan Harian" (hari sebagai kolom) di spreadsheet laporan MODIS yang tersinkron.
 * Susunan sama dengan tab Daily Report di [EXT] Project Tracker: per unit (Mobil Diskon, Kiosk Diskon 1,
 * Kiosk Diskon 2) lalu blok TOTAL (rumus: total, target 600/hari, kumulatif, % target).
 * Diisi otomatis dari tab "Daily Report" (per hari per unit, conversion per ORANG) setiap kali sync berjalan
 * (dipanggil dari writeDaily_ di MODIS_FieldSync.gs). Aman dijalankan berulang: seluruh tab ditulis ulang dari data.
 */
var M = {
  TAB: 'Laporan Harian',
  START: '2026-10-26', // hari pertama kampanye
  DAYS: 98,
  TARGET_DAY: 600,
};
var M_UNITS = ['Mobil Diskon', 'Kiosk Diskon 1', 'Kiosk Diskon 2'];
// [label, indeks kolom di tab Daily Report (mulai 1)]
var M_METRICS = [
  ['Shift (text)', 3], ['Venue 1 (text)', 4], ['Venue 2 (text, mobil only)', 5], ['Reach (pax)', 6], ['Contacts (pax)', 7],
  ['PaHe new', 8], ['PaHe Churned (lapsed re-subs)', 9], ['GB Hemat ride', 10], ['Welcome given', 11], ['Capsules drawn', 12],
  ['Tier C', 13], ['Tier B', 14], ['Tier A', 15], ['Golden', 16], ['Candy draws', 17], ['Photobooth prints', 18], ['Issue / note (text)', 19],
];
var M_NUMERIC_FROM = 3; // metrik ke-4 dst (Reach...) berupa angka; 3 pertama teks
var M_TOTAL_LABELS = ['Reach (pax)', 'Contacts (pax)', 'PaHe new', 'PaHe Churned (lapsed re-subs)', 'GB Hemat ride', 'Welcome given', 'Capsules drawn',
  'Tier C', 'Tier B', 'Tier A', 'Golden', 'Candy draws', 'Photobooth prints'];

function mColLetter_(n) {
  var s = '';
  while (n > 0) { var r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}
function mAddDays_(iso, n) {
  var p = iso.split('-');
  var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n));
  return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2);
}

/** Susun isi tab (array 2 dimensi) dari baris Daily Report; dipisah supaya bisa diuji. */
function buildMatrix_(srcRows) {
  var days = [];
  for (var i = 0; i < M.DAYS; i++) days.push(mAddDays_(M.START, i));
  var W = 2 + days.length;
  var grid = [];
  var blank = function () { var r = []; for (var c = 0; c < W; c++) r.push(''); return r; };
  var put = function (r) { grid.push(r); return grid.length; }; // mengembalikan nomor baris (mulai 1)
  var row = blank(); row[0] = 'LAPORAN HARIAN | Pencapaian per unit, hari sebagai kolom (otomatis dari aplikasi crew)'; put(row);
  row = blank(); row[0] = 'Terisi otomatis tiap sync (conversion per ORANG per hari). Jangan ketik di tab ini: akan ditimpa. Target per hari ' + M.TARGET_DAY + '.'; put(row);
  row = blank(); row[0] = 'Week'; days.forEach(function (d, i) { row[2 + i] = 'W' + (Math.floor(i / 7) + 1); }); put(row);
  var DOW = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
  row = blank(); row[0] = 'Day'; days.forEach(function (d, i) { row[2 + i] = DOW[new Date(d + 'T00:00:00Z').getUTCDay()]; }); put(row);
  row = blank(); row[0] = 'Date'; days.forEach(function (d, i) { row[2 + i] = d; }); var dateRowNo = put(row);

  var by = {};
  srcRows.forEach(function (r) { by[r.day + '|' + r.unit] = r.vals; });
  var unitRows = {}; // label -> [nomor baris per unit]
  M_UNITS.forEach(function (u) {
    var h = blank(); h[0] = u; put(h);
    M_METRICS.forEach(function (mt, mi) {
      var r = blank(); r[1] = mt[0];
      days.forEach(function (d, i) {
        var v = by[d + '|' + u];
        if (!v) return;
        if (mt[0] === 'Venue 2 (text, mobil only)' && u !== 'Mobil Diskon') return;
        var x = v[mt[1] - 1];
        r[2 + i] = x === undefined || x === null ? '' : x;
      });
      var no = put(r);
      (unitRows[mt[0]] = unitRows[mt[0]] || []).push(no);
    });
  });
  var t = blank(); t[0] = 'TOTAL'; put(t);
  var totNo = {};
  M_TOTAL_LABELS.forEach(function (lab) {
    var r = blank(); r[1] = lab;
    for (var i = 0; i < days.length; i++) {
      var L = mColLetter_(3 + i);
      r[2 + i] = '=' + unitRows[lab].map(function (n) { return L + n; }).join('+');
    }
    totNo[lab] = put(r);
  });
  var conv = blank(); conv[1] = 'Conversion hari ini (PaHe new + PaHe Churned + GB Hemat)';
  for (var i = 0; i < days.length; i++) {
    var L = mColLetter_(3 + i);
    conv[2 + i] = '=' + L + totNo['PaHe new'] + '+' + L + totNo['PaHe Churned (lapsed re-subs)'] + '+' + L + totNo['GB Hemat ride'];
  }
  var convNo = put(conv);
  var tg = blank(); tg[1] = 'Target per hari'; for (var i = 0; i < days.length; i++) tg[2 + i] = M.TARGET_DAY; var tgNo = put(tg);
  var cu = blank(); cu[1] = 'Kumulatif conversion';
  var ct = blank(); ct[1] = 'Kumulatif target';
  var pc = blank(); pc[1] = '% target (kumulatif)';
  for (var i = 0; i < days.length; i++) {
    var L = mColLetter_(3 + i), P = mColLetter_(2 + i);
    cu[2 + i] = i === 0 ? '=' + L + convNo : '=' + P + (grid.length + 1) + '+' + L + convNo;
    ct[2 + i] = i === 0 ? '=' + L + tgNo : '=' + P + (grid.length + 2) + '+' + L + tgNo;
    pc[2 + i] = '=IF(' + L + (grid.length + 2) + '=0,0,' + L + (grid.length + 1) + '/' + L + (grid.length + 2) + ')';
  }
  var cuNo = put(cu), ctNo = put(ct), pcNo = put(pc);
  return { grid: grid, W: W, dateRowNo: dateRowNo, convNo: convNo, cuNo: cuNo, ctNo: ctNo, pcNo: pcNo, totalStart: totNo['Reach (pax)'] - 1 };
}

/** Baca tab "Daily Report" lalu tulis ulang tab "Laporan Harian". */
function writeMatrix_() {
  var ss = SpreadsheetApp.getActive();
  var src = ss.getSheetByName(typeof dailyTabName_ === 'function' ? dailyTabName_() : 'Daily Report');
  if (!src) return;
  var v = src.getDataRange().getValues();
  var rows = [];
  for (var i = 1; i < v.length; i++) {
    var d = v[i][0] instanceof Date ? Utilities.formatDate(v[i][0], 'Asia/Jakarta', 'yyyy-MM-dd') : String(v[i][0]).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    rows.push({ day: d, unit: String(v[i][1]).trim(), vals: v[i] });
  }
  if (typeof ujiShift_ === 'function') rows = ujiShift_(rows);
  var m = buildMatrix_(rows);
  var sh = ss.getSheetByName(M.TAB) || ss.insertSheet(M.TAB);
  sh.clear();
  sh.getRange(1, 1, m.grid.length, m.W).setValues(m.grid);
  // Tampilan
  sh.setFrozenRows(5);
  sh.setFrozenColumns(2);
  sh.setColumnWidth(1, 120);
  sh.setColumnWidth(2, 290);
  sh.getRange(1, 1).setFontSize(14).setFontWeight('bold').setFontColor('#00523B');
  sh.getRange(2, 1).setFontStyle('italic').setFontColor('#5F6673');
  sh.getRange(3, 1, 3, m.W).setBackground('#00B14F').setFontColor('#FFFFFF').setFontWeight('bold');
  M_UNITS.forEach(function (u, k) {
    var r = 6 + k * (M_METRICS.length + 1);
    sh.getRange(r, 1, 1, m.W).setBackground('#E6F4EA').setFontWeight('bold');
  });
  sh.getRange(m.totalStart, 1, 1, m.W).setBackground('#E6F4EA').setFontWeight('bold');
  sh.getRange(m.convNo, 1, 1, m.W).setFontWeight('bold');
  sh.getRange(m.pcNo, 3, 1, m.W - 2).setNumberFormat('0%');
  sh.getRange(1, 3, m.grid.length, m.W - 2).setHorizontalAlignment('center');
  sh.getRange(m.dateRowNo, 3, 1, m.W - 2).setNumberFormat('@');
}
