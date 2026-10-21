/**
 * Grab MODIS → Dashboard laporan KLIEN (Google Sheets), versi aplikasi crew
 * ---------------------------------------------------------------------------
 * Pengganti MODIS_ClientDashboard.gs (yang membaca data aplikasi mandiri lama).
 * Memakai sumber data yang sama dengan halaman laporan klien (/grab/<kunci>):
 * fungsi database modis_f1_public_field, hanya angka agregat, TANPA nama / nomor HP / email.
 * Cukup memakai LINK LAPORAN KLIEN; tidak perlu kata sandi dashboard.
 *
 * Satu sheet "Dashboard Grab MODIS", diperbarui otomatis tiap 15 menit:
 *   Ringkasan, Rekap harian (+ grafik vs target), Mingguan, Bulanan, Per venue,
 *   Per kategori POI, Cek Boros (status, per unit, per venue), Hadiah per barang.
 *
 * Cara pasang: spreadsheet laporan klien > Extensions > Apps Script > hapus isi lama,
 * tempel file ini > Save > muat ulang spreadsheet > menu MODIS > Hubungkan (tempel link laporan).
 */

var CV2 = {
  SUPABASE_URL: 'https://lucjgeoaugcsxolgdsfe.supabase.co',
  SUPABASE_KEY: 'sb_publishable_cDE6vKDTsVo7XCWRKU9_0g_y1vvCYcR',
  TZ: 'Asia/Jakarta',
  SHEET: 'Dashboard Grab MODIS',
  REFRESH_MINUTES: 15,
  DEFAULT_START: '2026-10-26',
  DEFAULT_DAYS: 98,
  DAILY_TARGET: 600,
  CAMPAIGN: 'Mobile Activation PAHE (Paket Hemat) – Jakarta & Bogor',
  CLIENT: 'Grab · Milli',
  GREEN: '#005239',
  HEAD: '#494F5C',
  TOTAL_BG: '#EDF7EF',
  GRAB: '#00B14F',
  YELLOW: '#FFD902',
  COLS: 14, // kolom B..O
};

var UNITS_V2 = { mobil: 'Mobil Diskon', kiosk1: 'Kiosk Diskon 1', kiosk2: 'Kiosk Diskon 2' };
var BOROS_ORDER_V2 = ['Sangat Boros', 'Boros', 'Lumayan Boros', 'Cukup Hemat'];
var REWARD_V2 = [
  ['snack', 'Welcome snack'], ['drink', 'Welcome drink'], ['candy', 'Kupon Candy'],
  ['tier_c', 'Tier C'], ['tier_b', 'Tier B'], ['tier_a', 'Tier A'], ['golden', 'Golden'],
];
var ITEM_V2 = {
  w_roti: 'Roti', w_pisang: 'Pisang', w_telur: 'Telur', w_caffino: 'Caffino', w_isoplus: 'Isoplus', w_nobo: 'Nobo Milk',
  c_keychain: 'Acrylic keychain', c_sticker: 'Sticker pack', c_pen: 'Pen branding',
  b_tote: 'Tote bag', b_pouch: 'Travel pouch', b_lanyard: 'Lanyard',
  a_umbrella: 'Payung lipat', a_tumbler: 'Egg tumbler', a_fan: 'Mini fan USB',
  h_phone: 'Smartphone Samsung', h_gold: 'Emas Antam 0,5 g', h_tws: 'TWS', h_powerbank: 'Powerbank 10.000 mAh', h_watch: 'Smartwatch',
};
var MONTHS_V2 = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
var MON_SHORT_V2 = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

// ---------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('MODIS')
    .addItem('Hubungkan (tempel link laporan)', 'cv2Connect')
    .addItem('Perbarui dashboard sekarang', 'cv2RefreshNow')
    .addSeparator()
    .addItem('Atur periode campaign…', 'cv2SetPeriod')
    .addItem('Matikan pembaruan otomatis', 'cv2DisableAuto')
    .addToUi();
}

function cv2Connect() {
  var ui = SpreadsheetApp.getUi();
  var res = ui.prompt('Hubungkan MODIS', 'Tempel link laporan klien (https://…/grab/…):', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  var key = cv2ExtractKey_(res.getResponseText());
  if (!key) return ui.alert('Link tidak dikenali. Salin link lengkap dari tim proyek.');
  PropertiesService.getScriptProperties().setProperty('MODIS_REPORT_KEY', key);
  try {
    cv2Build_();
  } catch (e) {
    return ui.alert('Gagal membaca data: ' + e.message);
  }
  cv2InstallTrigger_();
  ui.alert('Terhubung. Dashboard diperbarui otomatis tiap ' + CV2.REFRESH_MINUTES + ' menit.');
}

function cv2RefreshNow() {
  cv2Build_();
  SpreadsheetApp.getActive().toast('Dashboard diperbarui.', 'MODIS', 4);
}

function cv2SetPeriod() {
  var ui = SpreadsheetApp.getUi();
  var p = cv2Period_();
  var a = ui.prompt('Periode campaign', 'Tanggal mulai (YYYY-MM-DD). Sekarang: ' + p.start, ui.ButtonSet.OK_CANCEL);
  if (a.getSelectedButton() !== ui.Button.OK) return;
  var start = String(a.getResponseText() || '').trim() || p.start;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return ui.alert('Format tanggal salah.');
  var b = ui.prompt('Periode campaign', 'Durasi running (hari). Sekarang: ' + p.days, ui.ButtonSet.OK_CANCEL);
  if (b.getSelectedButton() !== ui.Button.OK) return;
  var days = parseInt(String(b.getResponseText() || '').trim() || p.days, 10);
  if (!(days > 0 && days <= 366)) return ui.alert('Durasi tidak valid.');
  var props = PropertiesService.getScriptProperties();
  props.setProperty('MODIS_START', start);
  props.setProperty('MODIS_DAYS', String(days));
  cv2Build_();
  ui.alert('Periode disimpan: ' + start + ', ' + days + ' hari.');
}

function cv2DisableAuto() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'cv2AutoRefresh') ScriptApp.deleteTrigger(t);
  });
  SpreadsheetApp.getActive().toast('Pembaruan otomatis dimatikan.', 'MODIS', 4);
}

function cv2AutoRefresh() {
  cv2Build_();
}

function cv2InstallTrigger_() {
  cv2DisableAuto();
  ScriptApp.newTrigger('cv2AutoRefresh').timeBased().everyMinutes(CV2.REFRESH_MINUTES).create();
}

function cv2ExtractKey_(text) {
  var m = String(text || '').match(/[A-Za-z0-9]{32}/);
  return m ? m[0] : '';
}

// ---------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------
function cv2Fetch_(from, to) {
  var key = PropertiesService.getScriptProperties().getProperty('MODIS_REPORT_KEY');
  if (!key) throw new Error('Belum terhubung. Jalankan menu MODIS > Hubungkan.');
  var resp = UrlFetchApp.fetch(CV2.SUPABASE_URL + '/rest/v1/rpc/modis_f1_public_field', {
    method: 'post',
    contentType: 'application/json',
    headers: { apikey: CV2.SUPABASE_KEY, Authorization: 'Bearer ' + CV2.SUPABASE_KEY },
    payload: JSON.stringify({ p_key: key, p_from: from, p_to: to }),
    muteHttpExceptions: true,
  });
  var code = resp.getResponseCode();
  if (code !== 200) {
    var msg = '';
    try { msg = JSON.parse(resp.getContentText()).message || ''; } catch (e) { /* abaikan */ }
    throw new Error(msg === 'Link laporan tidak valid' ? 'Link laporan tidak valid.' : 'Gagal membaca data (' + code + ')');
  }
  return JSON.parse(resp.getContentText());
}

function cv2Period_() {
  var props = PropertiesService.getScriptProperties();
  var start = props.getProperty('MODIS_START') || CV2.DEFAULT_START;
  var days = parseInt(props.getProperty('MODIS_DAYS') || CV2.DEFAULT_DAYS, 10);
  var end = cv2AddDays_(start, days - 1);
  var today = cv2Today_();
  var report = today < start ? start : today > end ? end : today;
  return { start: start, days: days, end: end, report: report, dayNo: cv2Diff_(start, report) + 1, started: today >= start };
}

// ---------------------------------------------------------------------
// Agregasi (fungsi murni, tanpa SpreadsheetApp)
// ---------------------------------------------------------------------
function cv2Blank_() {
  return { mobil: 0, kiosk1: 0, kiosk2: 0, conv: 0, pn: 0, pl: 0, gb: 0, stamps: 0, boros: 0, borosSum: 0, reach: 0, contacts: 0 };
}

function cv2Agg_(data, p) {
  data = data || {};
  var byDate = {};
  var cell = function (d) { return byDate[d] || (byDate[d] = cv2Blank_()); };
  var byPoi = {}, byCat = {};
  var tot = cv2Blank_();
  (data.rows || []).forEach(function (r) {
    var d = r[0], u = r[1], poi = r[2] || '-', cat = r[3] || '-', t = r[4], n = Number(r[5]) || 0;
    var c = cell(d);
    c.conv += n; tot.conv += n;
    if (UNITS_V2[u]) { c[u] += n; tot[u] += n; }
    var f = t === 'pahe_new' ? 'pn' : t === 'pahe_lapsed' ? 'pl' : 'gb';
    c[f] += n; tot[f] += n;
    var pp = byPoi[poi] || (byPoi[poi] = { cat: cat, n: 0, pahe: 0, gb: 0 });
    pp.n += n; if (f === 'gb') pp.gb += n; else pp.pahe += n;
    var cc = byCat[cat] || (byCat[cat] = { n: 0, pahe: 0, gb: 0, venues: {} });
    cc.n += n; if (f === 'gb') cc.gb += n; else cc.pahe += n; cc.venues[poi] = true;
  });
  (data.reach || []).forEach(function (r) {
    var c = cell(r[0]);
    c.reach += Number(r[2]) || 0; c.contacts += Number(r[3]) || 0;
    tot.reach += Number(r[2]) || 0; tot.contacts += Number(r[3]) || 0;
  });
  (data.stamps || []).forEach(function (r) {
    var n = Number(r[2]) || 0;
    cell(r[0]).stamps += n; tot.stamps += n;
  });
  var bStatus = {}, bUnit = {}, bPoi = {};
  var bCost = 0;
  (data.boros || []).forEach(function (r) {
    var d = r[0], u = r[1], st = r[2] || '-', n = Number(r[3]) || 0, s = Number(r[4]) || 0, poi = r[5], cost = Number(r[6]) || 0;
    var c = cell(d);
    c.boros += n; c.borosSum += s; tot.boros += n; tot.borosSum += s; bCost += cost;
    var hot = st === 'Sangat Boros' || st === 'Boros' ? n : 0;
    var bs = bStatus[st] || (bStatus[st] = { n: 0, s: 0 });
    bs.n += n; bs.s += s;
    var bu = bUnit[u] || (bUnit[u] = { n: 0, s: 0, hot: 0 });
    bu.n += n; bu.s += s; bu.hot += hot;
    if (poi) {
      var bp = bPoi[poi] || (bPoi[poi] = { n: 0, s: 0, hot: 0 });
      bp.n += n; bp.s += s; bp.hot += hot;
    }
  });
  // Hari berurutan dari mulai campaign s/d hari laporan
  var days = [];
  for (var d = p.start; d <= p.report; d = cv2AddDays_(d, 1)) days.push(d);
  // Minggu (Senin) dan bulan
  var weeks = {}, months = {};
  Object.keys(byDate).forEach(function (d) {
    var v = byDate[d];
    var wk = cv2WeekStart_(d), mo = d.slice(0, 7);
    [[weeks, wk], [months, mo]].forEach(function (pair) {
      var acc = pair[0][pair[1]] || (pair[0][pair[1]] = cv2Blank_());
      Object.keys(v).forEach(function (k) { acc[k] += v[k]; });
    });
  });
  return {
    byDate: byDate, days: days, tot: tot, byPoi: byPoi, byCat: byCat, weeks: weeks, months: months,
    boros: { status: bStatus, unit: bUnit, poi: bPoi, cost: bCost },
    rewards: data.rewards || {}, merch: data.merch || {},
  };
}

function cv2WeekStart_(d) {
  var dt = cv2Date_(d);
  return cv2AddDays_(d, -((dt.getUTCDay() + 6) % 7));
}

// ---------------------------------------------------------------------
// Bangun dashboard
// ---------------------------------------------------------------------
function cv2Build_() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;
  try {
    var p = cv2Period_();
    var data = cv2Fetch_(p.start, p.report);
    var A = cv2Agg_(data, p);
    var ss = SpreadsheetApp.getActive();
    var sh = ss.getSheetByName(CV2.SHEET) || ss.insertSheet(CV2.SHEET, 0);
    sh.clear();
    sh.getCharts().forEach(function (c) { sh.removeChart(c); });
    sh.setHiddenGridlines(true);
    sh.setColumnWidth(1, 16);
    sh.setColumnWidth(2, 190);
    for (var c = 3; c <= CV2.COLS + 1; c++) sh.setColumnWidth(c, 92);
    cv2Render_(sh, A, p);
    sh.setFrozenRows(0);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
}

function cv2Render_(sh, A, p) {
  var row = 2;
  var NUM = '#,##0', RP = '"Rp"#,##0', PCT = '0%';
  // Judul
  row = cv2Bar_(sh, row, CV2.CAMPAIGN, 16, CV2.GREEN);
  var elapsed = p.started ? 'hari ke-' + p.dayNo + ' dari ' + p.days : 'belum mulai (mulai ' + cv2Fmt_(p.start) + ')';
  sh.getRange(row, 2).setValue(CV2.CLIENT + ' · ' + cv2Fmt_(p.start) + ' – ' + cv2Fmt_(p.end) + ' · ' + elapsed + ' · diperbarui ' + Utilities.formatDate(new Date(), CV2.TZ, 'd MMM HH:mm') + ' WIB').setFontColor('#5F6673');
  row += 2;

  // 1. Ringkasan
  var t = A.tot;
  var targetToDate = CV2.DAILY_TARGET * (p.started ? p.dayNo : 0);
  var targetAll = CV2.DAILY_TARGET * p.days;
  row = cv2Bar_(sh, row, 'RINGKASAN', 12, CV2.HEAD);
  row = cv2Table_(sh, row, ['Metrik', 'Nilai', 'Keterangan'], [
    ['Total conversion', t.conv, 'target s/d hari ini ' + cv2N_(targetToDate) + ' (' + (targetToDate ? Math.round((t.conv / targetToDate) * 100) : 0) + '%) · target campaign ' + cv2N_(targetAll)],
    ['PaHe New', t.pn, ''],
    ['PaHe Churned', t.pl, ''],
    ['GB Hemat', t.gb, ''],
    ['Kartu stamp lengkap', t.stamps, 'PaHe + GB Hemat di hari yang sama'],
    ['Cek Boros', t.boros, t.conv ? Math.round((t.boros / t.conv) * 100) + '% dari conversion' : ''],
    ['Rata-rata potensi hemat', t.boros ? Math.round(t.borosSum / t.boros) : 0, 'per customer per bulan dengan PAHE'],
    ['Reach', t.reach, 'dari tutup hari TL'],
    ['Contacts', t.contacts, 'dari tutup hari TL'],
  ], [null, NUM, null], { totalRow: 0 });
  sh.getRange(row - 3, 3).setNumberFormat(RP);
  row += 1;

  // 2. Rekap harian
  row = cv2Bar_(sh, row, 'REKAP HARIAN', 12, CV2.HEAD);
  var dailyHead = ['Tanggal', 'Mobil', 'Kiosk 1', 'Kiosk 2', 'Total', 'Target', '% target', 'PaHe New', 'PaHe Churned', 'GB Hemat', 'Stamp', 'Cek Boros', 'Reach', 'Contacts'];
  var dailyRows = A.days.map(function (d) {
    var v = A.byDate[d] || cv2Blank_();
    return [cv2Fmt_(d), v.mobil, v.kiosk1, v.kiosk2, v.conv, CV2.DAILY_TARGET, v.conv / CV2.DAILY_TARGET, v.pn, v.pl, v.gb, v.stamps, v.boros, v.reach, v.contacts];
  });
  var dailyTop = row;
  row = cv2Table_(sh, row, dailyHead, dailyRows, [null, NUM, NUM, NUM, NUM, NUM, PCT, NUM, NUM, NUM, NUM, NUM, NUM, NUM], {
    totalRow: dailyRows.length ? 'sum' : undefined,
  });
  if (dailyRows.length > 1) cv2Chart_(sh, dailyTop, dailyRows.length, row + 1);
  row += dailyRows.length > 1 ? 17 : 1;

  // 3. Mingguan & Bulanan
  row = cv2Bar_(sh, row, 'REKAP MINGGUAN', 12, CV2.HEAD);
  var recapHead = ['Periode', 'Conversion', 'PaHe New', 'PaHe Churned', 'GB Hemat', 'Stamp', 'Cek Boros', 'Reach', 'Contacts'];
  var recap = function (m, label) {
    return Object.keys(m).sort().map(function (k) {
      var v = m[k];
      return [label(k), v.conv, v.pn, v.pl, v.gb, v.stamps, v.boros, v.reach, v.contacts];
    });
  };
  var weekRows = recap(A.weeks, function (k) { return cv2Fmt_(k) + ' – ' + cv2Fmt_(cv2AddDays_(k, 6)); });
  row = cv2Table_(sh, row, recapHead, weekRows.length ? weekRows : [['Belum ada data', 0, 0, 0, 0, 0, 0, 0, 0]], [null, NUM, NUM, NUM, NUM, NUM, NUM, NUM, NUM]);
  row += 1;
  row = cv2Bar_(sh, row, 'REKAP BULANAN', 12, CV2.HEAD);
  var monthRows = recap(A.months, function (k) { return MONTHS_V2[Number(k.slice(5, 7)) - 1] + ' ' + k.slice(0, 4); });
  row = cv2Table_(sh, row, recapHead, monthRows.length ? monthRows : [['Belum ada data', 0, 0, 0, 0, 0, 0, 0, 0]], [null, NUM, NUM, NUM, NUM, NUM, NUM, NUM, NUM]);
  row += 1;

  // 4. Per venue & kategori POI
  row = cv2Bar_(sh, row, 'PER KATEGORI POI', 12, CV2.HEAD);
  var catRows = Object.keys(A.byCat).sort(function (a, b) { return A.byCat[b].n - A.byCat[a].n; }).map(function (k) {
    var c = A.byCat[k];
    return [k, Object.keys(c.venues).length, c.pahe, c.gb, c.n];
  });
  row = cv2Table_(sh, row, ['Kategori', 'Venue', 'PaHe', 'GB Hemat', 'Total'], catRows.length ? catRows : [['Belum ada data', 0, 0, 0, 0]], [null, NUM, NUM, NUM, NUM]);
  row += 1;
  row = cv2Bar_(sh, row, 'PER VENUE', 12, CV2.HEAD);
  var poiRows = Object.keys(A.byPoi).sort(function (a, b) { return A.byPoi[b].n - A.byPoi[a].n; }).map(function (k) {
    var c = A.byPoi[k];
    return [k, c.cat, c.pahe, c.gb, c.n];
  });
  row = cv2Table_(sh, row, ['Venue', 'Kategori', 'PaHe', 'GB Hemat', 'Total'], poiRows.length ? poiRows : [['Belum ada data', '-', 0, 0, 0]], [null, null, NUM, NUM, NUM]);
  row += 1;

  // 5. Cek Boros
  row = cv2Bar_(sh, row, 'CEK BOROS', 12, CV2.HEAD);
  var bt = A.boros;
  var n = A.tot.boros;
  var statusRows = BOROS_ORDER_V2.map(function (st) {
    var s = bt.status[st] || { n: 0, s: 0 };
    return [st, s.n, n ? s.n / n : 0, s.n ? Math.round(s.s / s.n) : 0];
  });
  statusRows.push(['Total', n, n ? 1 : 0, n ? Math.round(A.tot.borosSum / n) : 0]);
  var stTop = row;
  row = cv2Table_(sh, row, ['Status boros', 'Visitor', '%', 'Rata² hemat/bulan'], statusRows, [null, NUM, PCT, RP], { totalRow: 'last' });
  [['Sangat Boros', '#DB3735'], ['Boros', '#F79705'], ['Lumayan Boros', '#FFD902'], ['Cukup Hemat', '#00B14F']].forEach(function (x, i) {
    sh.getRange(stTop + 1 + i, 2).setBackground(x[1]).setFontColor(x[0] === 'Lumayan Boros' ? '#000000' : '#FFFFFF').setFontWeight('bold');
  });
  sh.getRange(row, 2).setValue('Rata-rata ongkos bulanan sebelum PAHE: ' + (n && bt.cost ? 'Rp' + cv2N_(Math.round(bt.cost / n)) : '-') + ' · Potensi hemat = potongan PAHE (Rp1.500 untuk ongkos s.d. Rp9.000, Rp1.000 di atasnya) × perjalanan, maks. 99x per bulan, sebelum biaya langganan Rp7.000/bulan (bulan pertama gratis).').setFontColor('#5F6673').setFontStyle('italic');
  row += 2;
  var unitRows = Object.keys(UNITS_V2).map(function (u) {
    var b = bt.unit[u] || { n: 0, s: 0, hot: 0 };
    return [UNITS_V2[u], b.n, b.n ? Math.round(b.s / b.n) : 0, b.n ? b.hot / b.n : 0];
  });
  row = cv2Table_(sh, row, ['Cek Boros per unit', 'Visitor', 'Rata² hemat', 'Boros+'], unitRows, [null, NUM, RP, PCT]);
  row += 1;
  var bpRows = Object.keys(bt.poi).sort(function (a, b) { return bt.poi[b].n - bt.poi[a].n; }).map(function (k) {
    var b = bt.poi[k];
    return [k, b.n, b.n ? Math.round(b.s / b.n) : 0, b.n ? b.hot / b.n : 0];
  });
  row = cv2Table_(sh, row, ['Cek Boros per venue', 'Visitor', 'Rata² hemat', 'Boros+'], bpRows.length ? bpRows : [['Belum ada data', 0, 0, 0]], [null, NUM, RP, PCT]);
  row += 1;

  // 6. Hadiah
  row = cv2Bar_(sh, row, 'REWARD & HADIAH PER BARANG', 12, CV2.HEAD);
  var rewardRows = REWARD_V2.map(function (r) { return [r[1], Number(A.rewards[r[0]]) || 0]; });
  row = cv2Table_(sh, row, ['Reward', 'Jumlah'], rewardRows, [null, NUM]);
  row += 1;
  var group = function (id) {
    return id.indexOf('w_') === 0 ? 'Welcome' : id.indexOf('c_') === 0 ? 'Tier C' : id.indexOf('b_') === 0 ? 'Tier B' : id.indexOf('a_') === 0 ? 'Tier A' : id.indexOf('h_') === 0 ? 'Grand prize' : 'Lainnya';
  };
  var merchRows = Object.keys(A.merch).sort(function (a, b) { return A.merch[b] - A.merch[a]; }).map(function (id) {
    return [ITEM_V2[id] || id, group(id), Number(A.merch[id]) || 0];
  });
  row = cv2Table_(sh, row, ['Barang', 'Kelompok', 'Jumlah'], merchRows.length ? merchRows : [['Belum ada hadiah keluar', '-', 0]], [null, null, NUM]);
  row += 1;
  sh.getRange(row, 2).setValue('Data otomatis dari aplikasi crew MODIS. Tanpa data pribadi customer. Cek Boros, stamp, dan rincian hadiah tampil setelah tablet crew memakai versi terbaru.').setFontColor('#8A909B').setFontStyle('italic');
}

// ---------------------------------------------------------------------
// Pembantu tampilan
// ---------------------------------------------------------------------
function cv2Bar_(sh, row, text, size, bg) {
  var r = sh.getRange(row, 2, 1, CV2.COLS);
  r.merge().setValue(text).setBackground(bg).setFontColor('#FFFFFF').setFontWeight('bold').setFontSize(size).setVerticalAlignment('middle');
  sh.setRowHeight(row, size > 12 ? 34 : 24);
  return row + 1;
}

/**
 * Tulis tabel: header + baris. fmts = format angka per kolom (null = teks).
 * opts.totalRow: 'sum' (tambah baris Total dari penjumlahan kolom angka), 'last' (baris terakhir ditebalkan), 0 (baris pertama ditebalkan).
 * Mengembalikan nomor baris berikutnya setelah tabel.
 */
function cv2Table_(sh, row, head, rows, fmts, opts) {
  opts = opts || {};
  var width = head.length;
  rows.forEach(function (r) {
    if (r.length !== width) throw new Error('Baris tabel tidak sesuai kolom: ' + r.join('|'));
  });
  var body = rows.slice();
  if (opts.totalRow === 'sum') {
    var total = ['Total'];
    for (var c = 1; c < width; c++) {
      if (fmts[c] === '#,##0' && head[c] !== 'Target') {
        var s = 0;
        rows.forEach(function (r) { s += Number(r[c]) || 0; });
        total.push(s);
      } else if (head[c] === 'Target') {
        var tg = 0;
        rows.forEach(function (r) { tg += Number(r[c]) || 0; });
        total.push(tg);
      } else if (head[c] === '% target') {
        var cv = 0, tt = 0;
        rows.forEach(function (r) { cv += Number(r[4]) || 0; tt += Number(r[5]) || 0; });
        total.push(tt ? cv / tt : 0);
      } else total.push('');
    }
    body.push(total);
  }
  var h = sh.getRange(row, 2, 1, width);
  h.setValues([head]).setBackground(CV2.HEAD).setFontColor('#FFFFFF').setFontWeight('bold').setHorizontalAlignment('center').setWrap(true);
  sh.getRange(row, 2).setHorizontalAlignment('left');
  if (body.length) {
    var b = sh.getRange(row + 1, 2, body.length, width);
    b.setValues(body).setBorder(null, null, true, null, null, true, '#E1E4E8', SpreadsheetApp.BorderStyle.SOLID);
    for (var i = 0; i < width; i++) {
      var col = sh.getRange(row + 1, 2 + i, body.length, 1);
      if (fmts && fmts[i]) col.setNumberFormat(fmts[i]).setHorizontalAlignment('right');
      else col.setHorizontalAlignment('left');
    }
    var boldRow = opts.totalRow === 'sum' || opts.totalRow === 'last' ? body.length : opts.totalRow === 0 ? 1 : 0;
    if (boldRow) sh.getRange(row + boldRow, 2, 1, width).setBackground(CV2.TOTAL_BG).setFontWeight('bold');
  }
  return row + 1 + body.length;
}

function cv2Chart_(sh, headRow, n, atRow) {
  // Kolom: B tanggal, F total, G target (header di headRow, data headRow+1 .. headRow+n)
  var cats = sh.getRange(headRow, 2, n + 1, 1);
  var total = sh.getRange(headRow, 6, n + 1, 1);
  var target = sh.getRange(headRow, 7, n + 1, 1);
  var chart = sh.newChart()
    .setChartType(Charts.ChartType.COMBO)
    .addRange(cats).addRange(total).addRange(target)
    .setNumHeaders(1)
    .setPosition(atRow, 2, 0, 0)
    .setOption('title', 'Conversion harian vs target')
    .setOption('legend', { position: 'bottom' })
    .setOption('colors', [CV2.GRAB, '#494F5C'])
    .setOption('seriesType', 'bars')
    .setOption('series', { 1: { type: 'line' } })
    .setOption('width', 860)
    .setOption('height', 300)
    .build();
  sh.insertChart(chart);
}

// ---------------------------------------------------------------------
// Tanggal & angka
// ---------------------------------------------------------------------
function cv2Today_() {
  return Utilities.formatDate(new Date(), CV2.TZ, 'yyyy-MM-dd');
}
function cv2Date_(key) {
  var p = String(key).split('-');
  return new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])));
}
function cv2AddDays_(key, n) {
  return new Date(cv2Date_(key).getTime() + n * 86400000).toISOString().slice(0, 10);
}
function cv2Diff_(a, b) {
  return Math.round((cv2Date_(b).getTime() - cv2Date_(a).getTime()) / 86400000);
}
function cv2Fmt_(key) {
  var d = cv2Date_(key);
  return d.getUTCDate() + ' ' + MON_SHORT_V2[d.getUTCMonth()];
}
function cv2N_(n) {
  return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
