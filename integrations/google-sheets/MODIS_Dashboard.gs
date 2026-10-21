/**
 * Tab "Dashboard" (tab PERTAMA) untuk spreadsheet MODIS: tampilan ringkas ala Looker Studio, dibuat langsung di Google Sheet.
 * Kartu angka + grafik di atas; data lengkap ada di tab lain (Conversion, Stok, Issue, Data Cek Boros, Data Harian).
 *
 * - Diperbarui otomatis tiap sync (dipanggil dari sync_ di MODIS_FieldSync.gs lewat writeDashData_).
 * - Tab bantu "_Dash" (tersembunyi) menyimpan angka sumber grafik. Jangan dihapus / diedit.
 * - Isi Dashboard ditimpa tiap sync: jangan ketik apa pun di tab ini.
 * - Menu "MODIS Dashboard": perbarui, Mode uji (data dummy digeser mulai 26 Okt), Mode resmi.
 */
var DASH = {
  TAB: 'Dashboard',
  DATA: '_Dash',
  START: '2026-10-26',
  DAYS: 98,
  TARGET_DAY: 600,
  LAYOUT: 'v2',
  C_DARK: '#00523B',
  C_GREEN: '#00B14F',
  C_YELLOW: '#FFD902',
  C_SOFT: '#EEF6F1',
  C_MUTED: '#5F6B66',
  C_LINE: '#D5E3DC',
};
var DASH_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
var DASH_ITEM = {
  w_roti: 'Welcome snack Roti', w_pisang: 'Welcome snack Pisang', w_telur: 'Welcome snack Telur', w_caffino: 'Welcome drink Caffino', w_isoplus: 'Welcome drink Isoplus', w_nobo: 'Welcome drink Nobo Milk',
};

function dashAddDays_(iso, n) {
  var p = iso.split('-');
  var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n));
  return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2);
}
function dashDiffDays_(a, b) { // b - a (hari)
  var pa = a.split('-'), pb = b.split('-');
  return Math.round((Date.UTC(+pb[0], +pb[1] - 1, +pb[2]) - Date.UTC(+pa[0], +pa[1] - 1, +pa[2])) / 86400000);
}
function dashLabel_(iso) { var p = iso.split('-'); return (+p[2]) + ' ' + DASH_MONTHS[+p[1] - 1]; }
/** Angka dari sel. Sel angka yang salah diformat tanggal terbaca sebagai Date: dikembalikan ke angka aslinya. */
function dashNum_(v) {
  if (v instanceof Date) return Math.round((v.getTime() - Date.UTC(1899, 11, 30)) / 86400000);
  var n = Number(v);
  return isFinite(n) ? n : 0;
}
function dashPct_(a, b) { return b > 0 ? Math.round(a / b * 100) : 0; }
function dashFmt_(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
function dashRp_(n) { return 'Rp ' + dashFmt_(n); }

/**
 * Hitung seluruh angka dashboard dari baris sumber. Fungsi murni (tanpa SpreadsheetApp) supaya bisa diuji.
 * o: { start, today, daily:[{day,unit,reach,contacts,pahe,churn,gb,welcome,capsules,golden,photobooth}],
 *      conv:[{day,venue,name,phone,status}], boros:[{day,cost,save,status}], stamps:[day...], stock:[{day,item,label,used,flag}] }
 */
function dashCompute_(o) {
  var start = o.start, end = dashAddDays_(start, DASH.DAYS - 1);
  var inWin = function (d) { return d >= start && d <= end; };
  var perDay = {}, unit = {}, k = { reach: 0, contacts: 0, pahe: 0, churn: 0, gb: 0, welcome: 0, capsules: 0, golden: 0, photobooth: 0 };
  o.daily.forEach(function (r) {
    if (!inWin(r.day)) return;
    var c = r.pahe + r.churn + r.gb;
    perDay[r.day] = (perDay[r.day] || 0) + c;
    unit[r.unit] = (unit[r.unit] || 0) + c;
    ['reach', 'contacts', 'pahe', 'churn', 'gb', 'welcome', 'capsules', 'golden', 'photobooth'].forEach(function (f) { k[f] += r[f] || 0; });
  });
  var total = k.pahe + k.churn + k.gb;
  var elapsed = Math.max(0, Math.min(DASH.DAYS, dashDiffDays_(start, o.today) + 1));
  var cumTarget = elapsed * DASH.TARGET_DAY;
  var series = [];
  for (var i = 0; i < DASH.DAYS; i++) {
    var d = dashAddDays_(start, i);
    series.push([dashLabel_(d), d <= o.today ? (perDay[d] || 0) : '', DASH.TARGET_DAY]);
  }
  // venue: satu orang per hari (nama + 4 digit HP), hanya status ok
  var seen = {}, venues = {};
  o.conv.forEach(function (r) {
    if (!inWin(r.day)) return;
    if (r.status && String(r.status).trim().toLowerCase() !== 'ok') return; // sheet menulis 'OK' / 'Double claim'
    var key = r.day + '|' + String(r.name).trim().toLowerCase() + '|' + r.phone;
    if (seen[key]) return;
    seen[key] = true;
    var v = r.venue || '(tanpa venue)';
    venues[v] = (venues[v] || 0) + 1;
  });
  var venueList = Object.keys(venues).map(function (v) { return [v, venues[v]]; })
    .sort(function (a, b) { return b[1] - a[1] || (a[0] < b[0] ? -1 : 1); }).slice(0, 10);
  var unitList = ['Mobil Diskon', 'Kiosk Diskon 1', 'Kiosk Diskon 2'].map(function (u) { return [u, unit[u] || 0]; });
  // Cek Boros
  var ORDER = ['Sangat Boros', 'Boros', 'Lumayan Boros', 'Cukup Hemat'];
  var bs = {}, bn = 0, cost = 0, save = 0;
  ORDER.forEach(function (s) { bs[s] = 0; });
  o.boros.forEach(function (r) {
    if (!inWin(r.day)) return;
    bn++; cost += r.cost; save += r.save;
    if (bs[r.status] !== undefined) bs[r.status]++;
  });
  // Stok: pemakaian per item (kolom "Pakai (app)" tab Stok) dan jumlah selisih > 2%
  var use = {}, flagged = 0;
  (o.stock || []).forEach(function (r) {
    if (!inWin(r.day)) return;
    use[r.label] = (use[r.label] || 0) + r.used;
    if (r.flag) flagged++;
  });
  var itemList = Object.keys(use).map(function (n) { return [n, use[n]]; }).filter(function (x) { return x[1] > 0; })
    .sort(function (a, b) { return b[1] - a[1] || (a[0] < b[0] ? -1 : 1); }).slice(0, 8);
  var stamps = o.stamps.filter(inWin).length;
  var todayVal = perDay[o.today] || 0;
  return {
    start: start, end: end, today: o.today, dayNo: elapsed,
    total: total, cumTarget: cumTarget, totalPct: dashPct_(total, cumTarget),
    todayVal: todayVal, todayPct: dashPct_(todayVal, DASH.TARGET_DAY),
    reach: k.reach, contacts: k.contacts, pahe: k.pahe, churn: k.churn, gb: k.gb, stamps: stamps,
    welcome: k.welcome, capsules: k.capsules, golden: k.golden, photobooth: k.photobooth,
    series: series,
    types: [['PaHe New', k.pahe], ['PaHe Churned', k.churn], ['GB Hemat ride', k.gb]],
    units: unitList, venues: venueList, items: itemList, flagged: flagged,
    boros: ORDER.map(function (s) { return [s, bs[s]]; }), borosN: bn,
    avgCost: bn ? Math.round(cost / bn) : 0, avgSave: bn ? Math.round(save / bn) : 0, sumSave: save,
  };
}

// ---------- baca data dari sheet ----------
function dashDay_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, F.TZ, 'yyyy-MM-dd');
  return String(v || '').slice(0, 10);
}
function dashRead_(sheetName, cols, fn) {
  var sh = SpreadsheetApp.getActive().getSheetByName(sheetName);
  if (!sh || sh.getLastRow() < 2) return [];
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, cols).getValues(), out = [];
  vals.forEach(function (r) { if (r[0] === '' && r[1] === '') return; var x = fn(r); if (x) out.push(x); });
  return out;
}
/** Geser semua tanggal sebanyak off hari (Mode uji). */
function dashMove_(rows, off) {
  if (!off) return rows;
  return rows.map(function (r) { var c = {}; for (var k in r) c[k] = r[k]; c.day = ujiMoveDay_(r.day, off); return c; });
}

function writeDashData_() {
  var tab = typeof dailyTabName_ === 'function' ? dailyTabName_() : 'Data Harian';
  var today = Utilities.formatDate(new Date(), F.TZ, 'yyyy-MM-dd');
  var stamps = [];
  try { stamps = get_('modis_stamp_cards?select=day').map(function (r) { return { day: r.day }; }); } catch (e) { Logger.log('Stamp: ' + e.message); }
  var daily = dashRead_(tab, 20, function (r) {
    return { day: dashDay_(r[0]), unit: String(r[1]), reach: dashNum_(r[5]), contacts: dashNum_(r[6]), pahe: dashNum_(r[7]), churn: dashNum_(r[8]), gb: dashNum_(r[9]),
      welcome: dashNum_(r[10]), capsules: dashNum_(r[11]), golden: dashNum_(r[15]), photobooth: dashNum_(r[17]) };
  }).filter(function (r) { return /^\d{4}-\d{2}-\d{2}$/.test(r.day); });
  var off = typeof ujiOffset_ === 'function' ? ujiOffset_(daily) : 0; // Mode uji: hari data pertama -> 26 Okt
  var conv = dashRead_('Conversion', 13, function (r) { return { day: dashDay_(r[1]), venue: String(r[5] || ''), name: r[7], phone: r[8], status: String(r[12] || '') }; });
  var boros = dashRead_('Data Cek Boros', 9, function (r) { return { day: dashDay_(r[0]), cost: dashNum_(r[6]), save: dashNum_(r[7]), status: String(r[8]) }; });
  var stock = dashRead_('Stok', 10, function (r) { return { day: dashDay_(r[0]), item: String(r[2]), label: String(r[2]), used: dashNum_(r[5]), flag: String(r[9]) === 'YA' }; });
  var model = dashCompute_({
    start: DASH.START, today: off ? ujiMoveDay_(today, off) : today,
    daily: dashMove_(daily, off), conv: dashMove_(conv, off), boros: dashMove_(boros, off), stock: dashMove_(stock, off),
    stamps: dashMove_(stamps, off).map(function (s) { return s.day; }),
  });
  model.uji = off !== 0 || PropertiesService.getScriptProperties().getProperty('DASH_MODE') === 'UJI';
  dashRender_(model);
}

// ---------- tampilan ----------
// Kolom: A (16) | B-D kartu 1 | E (12) | F-H kartu 2 | I (12) | J-L kartu 3 | M (12) | N-P kartu 4 | Q (16). Lebar total B-P = 996 px.
function dashCard_(sh, row, col, label, value, sub) {
  sh.getRange(row, col, 1, 3).merge().setValue(label).setFontSize(10).setFontWeight('bold').setFontColor(DASH.C_MUTED).setBackground('#FFFFFF')
    .setHorizontalAlignment('left').setVerticalAlignment('bottom').setWrap(true);
  sh.getRange(row + 1, col, 1, 3).merge().setValue(value).setFontSize(28).setFontWeight('bold').setFontColor(DASH.C_DARK).setBackground('#FFFFFF')
    .setHorizontalAlignment('left').setVerticalAlignment('middle').setWrap(false);
  sh.getRange(row + 2, col, 1, 3).merge().setValue(sub).setFontSize(9).setFontWeight('normal').setFontColor(DASH.C_MUTED).setBackground('#FFFFFF')
    .setHorizontalAlignment('left').setVerticalAlignment('top').setWrap(true);
  sh.getRange(row, col, 3, 3).setBorder(true, true, true, true, false, false, DASH.C_LINE, SpreadsheetApp.BorderStyle.SOLID);
  sh.getRange(row, col, 3, 1).setBorder(null, true, null, null, null, null, DASH.C_GREEN, SpreadsheetApp.BorderStyle.SOLID_THICK);
}
function dashSection_(sh, row, text) {
  sh.getRange(row, 2, 1, 15).merge().setValue(text).setFontSize(12).setFontWeight('bold').setFontColor('#FFFFFF').setBackground(DASH.C_GREEN)
    .setVerticalAlignment('middle').setHorizontalAlignment('left');
  sh.setRowHeight(row, 28);
}
function dashCardRows_(sh, row) { sh.setRowHeight(row, 22); sh.setRowHeight(row + 1, 50); sh.setRowHeight(row + 2, 34); sh.setRowHeight(row + 3, 10); }

var DASH_ROW = { c1: 6, c2: 10, secTrend: 14, chTrend: 16, secMix: 33, chMix: 35, secVenue: 52, chVenue: 54, secBoros: 71, cBoros: 72, secStok: 77, cStok: 78, chStok: 82, secLink: 99, link: 100 };

/** Susun kerangka (format, lebar kolom, grafik) sekali; dibangun ulang hanya bila versi layout berubah. */
function dashBuild_(ss, sh, data) {
  sh.clear();
  sh.getCharts().forEach(function (c) { sh.removeChart(c); });
  sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).breakApart();
  sh.setHiddenGridlines(true);
  if (sh.getMaxRows() < 110) sh.insertRowsAfter(sh.getMaxRows(), 110 - sh.getMaxRows());
  if (sh.getMaxColumns() < 17) sh.insertColumnsAfter(sh.getMaxColumns(), 17 - sh.getMaxColumns());
  sh.getRange(1, 1, 110, 17).setBackground(DASH.C_SOFT).setFontFamily('Roboto').setFontColor('#1F2A26');
  [16, 80, 80, 80, 12, 80, 80, 80, 12, 80, 80, 80, 12, 80, 80, 80, 16].forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });

  sh.getRange(1, 2, 1, 15).merge().setValue('MODIS × GRAB | Dashboard Kampanye').setFontSize(20).setFontWeight('bold').setFontColor('#FFFFFF')
    .setBackground(DASH.C_DARK).setVerticalAlignment('middle');
  sh.setRowHeight(1, 48);
  sh.getRange(1, 2, 1, 15).setBorder(null, null, true, null, null, null, DASH.C_YELLOW, SpreadsheetApp.BorderStyle.SOLID_THICK);
  sh.getRange(2, 2, 1, 15).merge().setFontSize(10).setFontColor(DASH.C_MUTED).setVerticalAlignment('middle');
  sh.setRowHeight(2, 24);
  sh.getRange(3, 2, 1, 15).merge().setValue('Cara membaca: satu orang dihitung satu kali per hari. Conversion = PaHe New + PaHe Churned + GB Hemat ride. Rincian lengkap ada di tab-tab di sebelah kanan.')
    .setFontSize(9).setFontColor(DASH.C_MUTED).setVerticalAlignment('top').setWrap(true);
  sh.setRowHeight(3, 28);
  sh.setRowHeight(4, 6);
  dashSection_(sh, 5, 'Ringkasan conversion');
  dashCardRows_(sh, DASH_ROW.c1);
  dashCardRows_(sh, DASH_ROW.c2);
  sh.setRowHeight(13, 6);
  dashSection_(sh, DASH_ROW.secTrend, 'Conversion per hari dibanding target');
  sh.setRowHeight(15, 8);
  dashSection_(sh, DASH_ROW.secMix, 'Komposisi dan per unit');
  sh.setRowHeight(34, 8);
  dashSection_(sh, DASH_ROW.secVenue, 'Venue dan Cek Boros');
  sh.setRowHeight(53, 8);
  dashSection_(sh, DASH_ROW.secBoros, 'Hasil Cek Boros');
  dashCardRows_(sh, DASH_ROW.cBoros);
  dashSection_(sh, DASH_ROW.secStok, 'Reward, barang, dan konsumsi');
  dashCardRows_(sh, DASH_ROW.cStok);
  dashSection_(sh, DASH_ROW.secLink, 'Data lengkap (klik untuk membuka tab)');

  var base = function (type, w, h, title) {
    return sh.newChart().setChartType(type)
      .setOption('title', title).setOption('titleTextStyle', { fontSize: 13, bold: true, color: DASH.C_DARK })
      .setOption('backgroundColor', '#FFFFFF').setOption('legend', { position: 'bottom' }).setOption('chartArea', { width: '86%', height: '66%' })
      .setOption('width', w).setOption('height', h);
  };
  var n = DASH.DAYS;
  // 1) conversion per hari (kolom) + target (garis), selebar halaman
  sh.insertChart(base(Charts.ChartType.COMBO, 996, 330, 'Conversion per hari (garis kuning = target ' + DASH.TARGET_DAY + ' per hari)').addRange(data.getRange(1, 1, n + 1, 3)).setNumHeaders(1)
    .setOption('colors', [DASH.C_GREEN, '#E0B800']).setOption('series', { 0: { type: 'bars' }, 1: { type: 'line', lineWidth: 3 } })
    .setOption('hAxis', { showTextEvery: 7, slantedText: false }).setPosition(DASH_ROW.chTrend, 2, 0, 0).build());
  // 2) komposisi tipe
  sh.insertChart(base(Charts.ChartType.PIE, 492, 330, 'Komposisi tipe conversion').addRange(data.getRange(1, 5, 4, 2)).setNumHeaders(1)
    .setOption('colors', [DASH.C_GREEN, DASH.C_DARK, DASH.C_YELLOW]).setOption('pieHole', 0.45).setOption('pieSliceText', 'value')
    .setPosition(DASH_ROW.chMix, 2, 0, 0).build());
  // 3) per unit
  sh.insertChart(base(Charts.ChartType.COLUMN, 492, 330, 'Conversion per unit').addRange(data.getRange(1, 8, 4, 2)).setNumHeaders(1)
    .setOption('colors', [DASH.C_GREEN]).setOption('legend', { position: 'none' }).setOption('annotations', { alwaysOutside: true })
    .setPosition(DASH_ROW.chMix, 10, 0, 0).build());
  // 4) top 10 venue
  sh.insertChart(base(Charts.ChartType.BAR, 492, 330, '10 venue dengan conversion terbanyak').addRange(data.getRange(1, 11, 11, 2)).setNumHeaders(1)
    .setOption('colors', [DASH.C_DARK]).setOption('legend', { position: 'none' }).setOption('reverseCategories', true).setOption('chartArea', { width: '55%', height: '80%' })
    .setPosition(DASH_ROW.chVenue, 2, 0, 0).build());
  // 5) status Cek Boros
  sh.insertChart(base(Charts.ChartType.COLUMN, 492, 330, 'Sebaran status Cek Boros (jumlah orang)').addRange(data.getRange(1, 14, 5, 2)).setNumHeaders(1)
    .setOption('colors', [DASH.C_GREEN]).setOption('legend', { position: 'none' }).setPosition(DASH_ROW.chVenue, 10, 0, 0).build());
  // 6) pemakaian barang
  sh.insertChart(base(Charts.ChartType.BAR, 996, 330, 'Barang paling banyak terpakai (sesuai tab Stok)').addRange(data.getRange(1, 17, 9, 2)).setNumHeaders(1)
    .setOption('colors', [DASH.C_GREEN]).setOption('legend', { position: 'none' }).setOption('reverseCategories', true).setOption('chartArea', { width: '65%', height: '80%' })
    .setPosition(DASH_ROW.chStok, 2, 0, 0).build());

  // tautan ke tab data
  var links = [['Conversion', 'Conversion: satu baris per orang, lengkap dengan foto bukti'], ['Data Harian', 'Data Harian: angka per hari per unit'], ['Laporan Harian', 'Laporan Harian: hari sebagai kolom'],
    ['Stok', 'Stok: opening, refill, pemakaian, closing per item'], ['Issue', 'Issue: kendala dari lapangan'], ['Data Cek Boros', 'Data Cek Boros: hasil tiap Cek Boros']];
  var row = DASH_ROW.link;
  links.forEach(function (l) {
    var s = ss.getSheetByName(l[0]);
    var cell = sh.getRange(row, 2, 1, 15).merge();
    if (s) cell.setFormula('=HYPERLINK("#gid=' + s.getSheetId() + '","➜ ' + l[1] + '")');
    else cell.setValue('➜ ' + l[1] + ' (belum ada)');
    cell.setFontSize(11).setFontColor(DASH.C_DARK).setFontWeight('bold').setBackground('#FFFFFF');
    row++;
  });
}

function dashRender_(m) {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(DASH.TAB) || ss.insertSheet(DASH.TAB, 0);
  var data = ss.getSheetByName(DASH.DATA) || ss.insertSheet(DASH.DATA);

  // data sumber grafik
  var marker = String(data.getRange(1, 26).getValue());
  data.clear();
  data.getRange(1, 1, 1, 3).setValues([['Tanggal', 'Conversion', 'Target']]);
  data.getRange(2, 1, m.series.length, 3).setValues(m.series);
  data.getRange(1, 5, 1, 2).setValues([['Tipe', 'Jumlah']]);
  data.getRange(2, 5, 3, 2).setValues(m.types);
  data.getRange(1, 8, 1, 2).setValues([['Unit', 'Conversion']]);
  data.getRange(2, 8, 3, 2).setValues(m.units);
  data.getRange(1, 11, 1, 2).setValues([['Venue', 'Conversion']]);
  var v = m.venues.slice(); while (v.length < 10) v.push(['', '']);
  data.getRange(2, 11, 10, 2).setValues(v);
  data.getRange(1, 14, 1, 2).setValues([['Status', 'Jumlah']]);
  data.getRange(2, 14, 4, 2).setValues(m.boros);
  data.getRange(1, 17, 1, 2).setValues([['Barang', 'Terpakai']]);
  var it = m.items.slice(); while (it.length < 8) it.push(['', '']);
  data.getRange(2, 17, 8, 2).setValues(it);

  if (marker !== DASH.LAYOUT || sh.getCharts().length !== 6) dashBuild_(ss, sh, data);
  data.getRange(1, 26).setValue(DASH.LAYOUT);
  if (!data.isSheetHidden()) data.hideSheet();

  var mode = m.uji ? '  |  MODE UJI: data simulasi, tanggal digeser mulai 26 Okt' : '';
  var stamp = Utilities.formatDate(new Date(), F.TZ, 'd MMM yyyy HH:mm');
  sh.getRange(2, 2).setValue('Diperbarui ' + stamp + ' WIB  |  Hari ke-' + m.dayNo + ' dari ' + DASH.DAYS + ' (' + dashLabel_(m.start) + ' - ' + dashLabel_(m.end) + ')  |  Target ' + DASH.TARGET_DAY + ' conversion per hari' + mode);

  var r1 = DASH_ROW.c1, r2 = DASH_ROW.c2;
  dashCard_(sh, r1, 2, 'TOTAL CONVERSION', dashFmt_(m.total), 'Target sampai hari ini ' + dashFmt_(m.cumTarget) + ' (tercapai ' + m.totalPct + '%)');
  dashCard_(sh, r1, 6, 'CONVERSION HARI INI', dashFmt_(m.todayVal), 'Target harian ' + DASH.TARGET_DAY + ' (tercapai ' + m.todayPct + '%)');
  dashCard_(sh, r1, 10, 'REACH', dashFmt_(m.reach), 'Orang yang terjangkau booth');
  dashCard_(sh, r1, 14, 'CONTACTS', dashFmt_(m.contacts), 'Orang yang melakukan Cek Boros');
  dashCard_(sh, r2, 2, 'PaHe New', dashFmt_(m.pahe), 'Pelanggan baru PaHe');
  dashCard_(sh, r2, 6, 'PaHe Churned', dashFmt_(m.churn), 'Pelanggan lama yang kembali berlangganan');
  dashCard_(sh, r2, 10, 'GB Hemat ride', dashFmt_(m.gb), 'Pengguna GB Hemat');
  dashCard_(sh, r2, 14, 'KARTU STAMP LENGKAP', dashFmt_(m.stamps), 'Pengunjung yang menyelesaikan kartu stamp');

  var b = DASH_ROW.cBoros;
  dashCard_(sh, b, 2, 'TOTAL CEK BOROS', dashFmt_(m.borosN), 'Jumlah Cek Boros yang selesai');
  dashCard_(sh, b, 6, 'RATA-RATA ONGKOS / BULAN', dashRp_(m.avgCost), 'Ongkos transportasi online per orang');
  dashCard_(sh, b, 10, 'RATA-RATA POTENSI HEMAT', dashRp_(m.avgSave), 'Per orang per bulan dengan Grab Hemat');
  dashCard_(sh, b, 14, 'TOTAL POTENSI HEMAT', dashRp_(m.sumSave), 'Jumlah dari semua Cek Boros');

  var c = DASH_ROW.cStok;
  dashCard_(sh, c, 2, 'WELCOME DIBERIKAN', dashFmt_(m.welcome), 'Welcome snack dan drink');
  dashCard_(sh, c, 6, 'KAPSUL DIUNDI', dashFmt_(m.capsules), 'Candy, Tier C, Tier B, Tier A, Golden');
  dashCard_(sh, c, 10, 'PHOTOBOOTH', dashFmt_(m.photobooth), 'Foto yang dicetak');
  dashCard_(sh, c, 14, 'STOK SELISIH > 2%', dashFmt_(m.flagged), m.flagged ? 'Perlu dicek: lihat tab Stok' : 'Stok sesuai pemakaian');

  ss.setActiveSheet(sh);
  ss.moveActiveSheet(1);
}

// ---------- menu ----------
function dashMenu_() {
  SpreadsheetApp.getUi().createMenu('MODIS Dashboard')
    .addItem('Perbarui Dashboard sekarang', 'dashRefresh')
    .addItem('Mode uji: data dummy mulai 26 Okt', 'dashModeUji')
    .addItem('Mode resmi: data asli', 'dashModeResmi')
    .addItem('Bangun ulang tampilan', 'dashRebuild')
    .addToUi();
}
function dashRefresh() {
  if (typeof sync_ === 'function') { try { writeDaily_(dashAllDays_()); } catch (e) { Logger.log('Data Harian: ' + e.message); } }
  writeDashData_();
  SpreadsheetApp.getActive().toast('Dashboard diperbarui', 'MODIS', 4);
}
/** Semua hari yang punya data (untuk menyegarkan Data Harian saat mode berganti). */
function dashAllDays_() {
  var days = {};
  get_('modis_conversions?select=claim_day').forEach(function (r) { days[r.claim_day] = true; });
  return Object.keys(days).sort();
}
function dashModeUji() { PropertiesService.getScriptProperties().setProperty('DASH_MODE', 'UJI'); dashRefresh(); }
function dashModeResmi() { PropertiesService.getScriptProperties().deleteProperty('DASH_MODE'); dashRefresh(); }
function dashRebuild() {
  var d = SpreadsheetApp.getActive().getSheetByName(DASH.DATA);
  if (d) d.getRange(1, 26).setValue('');
  dashRefresh();
}
