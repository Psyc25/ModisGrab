// DEPRECATED: pakai MODIS_ClientDashboardV2.gs (sumber data aplikasi crew). File ini membaca data aplikasi mandiri lama.
/**
 * MODIS Cek Boros → Dashboard laporan KLIEN (Google Sheets)
 * ---------------------------------------------------------
 * Dipasang di spreadsheet laporan klien (terpisah dari spreadsheet internal).
 * Hanya menulis satu sheet "Dashboard Cek Boros" berisi subtotal & grafik,
 * dengan gaya mengikuti tab "Dashboard Harian" di Master Timeline.
 * TIDAK ada data pribadi visitor (nama, WA, email) yang ditarik ke spreadsheet ini:
 * data diambil dalam bentuk ringkasan dari fungsi database modis_report_agg.
 *
 * Diperbarui otomatis tiap 15 menit. Cara pasang: integrations/google-sheets/README.md.
 */

var CLIENT = {
  SUPABASE_URL: 'https://lucjgeoaugcsxolgdsfe.supabase.co',
  SUPABASE_KEY: 'sb_publishable_cDE6vKDTsVo7XCWRKU9_0g_y1vvCYcR',
  DASHBOARD_EMAIL: 'dashboard@modis-cekboros.app',
  TZ: 'Asia/Jakarta',
  SHEET: 'Dashboard Cek Boros',
  REFRESH_MINUTES: 15,
  // Default periode campaign (bisa diubah lewat menu MODIS > Atur periode campaign)
  DEFAULT_START: '2026-10-26',
  DEFAULT_DAYS: 98,
  CAMPAIGN: 'Mobile Activation PAHE (Paket Hemat) – Jakarta & Bogor',
  CLIENT: 'Grab · Milli',
  // Warna dari tab Dashboard Harian
  GREEN: '#005239',
  HEAD: '#494F5C',
  TOTAL_BG: '#EDF7EF',
  INPUT_BG: '#FFF6D5',
  GRAB: '#00B14F',
  YELLOW: '#FFD902',
  COLS: 8, // kolom B..I
};

var UNITS = ['Mobil Diskon', 'Kiosk Diskon', 'Booth Event'];
var CATEGORIES = [
  ['Station', 'Stasiun'],
  ['Campus', 'Kampus & Sekolah'],
  ['Office', 'Perkantoran'],
  ['HOP & Public Space', 'HOP & Area Publik'],
];
var STATUSES = ['Sangat Boros', 'Boros', 'Lumayan Boros', 'Cukup Hemat'];
var SLOTS = { '06.30': 'Pagi', '11.00': 'Siang', '16.30': 'Sore/Malam', '10.00': 'Seharian' };

// ---------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('MODIS')
    .addItem('Hubungkan ke database (sekali)', 'clientConnect')
    .addItem('Perbarui dashboard sekarang', 'clientRefreshNow')
    .addSeparator()
    .addItem('Atur periode campaign…', 'clientSetPeriod')
    .addItem('Matikan pembaruan otomatis', 'clientDisableAuto')
    .addToUi();
}

function clientConnect() {
  var ui = SpreadsheetApp.getUi();
  var res = ui.prompt('Hubungkan MODIS', 'Masukkan kata sandi dashboard Cek Boros:', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  var pw = String(res.getResponseText() || '').trim();
  if (!pw) return ui.alert('Kata sandi kosong.');
  try {
    clientLogin_(pw, true);
  } catch (e) {
    return ui.alert('Gagal masuk: ' + e.message);
  }
  PropertiesService.getScriptProperties().setProperty('MODIS_PASSWORD', pw);
  clientInstallTrigger_();
  clientBuild_();
  ui.alert('Terhubung. Dashboard diperbarui otomatis tiap ' + CLIENT.REFRESH_MINUTES + ' menit.');
}

function clientRefreshNow() {
  clientBuild_();
  SpreadsheetApp.getActive().toast('Dashboard diperbarui.', 'MODIS', 4);
}

function clientSetPeriod() {
  var ui = SpreadsheetApp.getUi();
  var p = clientPeriod_();
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
  clientBuild_();
  ui.alert('Periode disimpan: ' + start + ', ' + days + ' hari.');
}

function clientDisableAuto() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'clientAutoRefresh') ScriptApp.deleteTrigger(t);
  });
  SpreadsheetApp.getActive().toast('Pembaruan otomatis dimatikan.', 'MODIS', 4);
}

function clientAutoRefresh() {
  clientBuild_();
}

function clientInstallTrigger_() {
  clientDisableAuto();
  ScriptApp.newTrigger('clientAutoRefresh').timeBased().everyMinutes(CLIENT.REFRESH_MINUTES).create();
}

// ---------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------
function clientLogin_(password, fresh) {
  var cache = CacheService.getScriptCache();
  if (!fresh) {
    var cached = cache.get('MODIS_TOKEN');
    if (cached) return cached;
  }
  var pw = password || PropertiesService.getScriptProperties().getProperty('MODIS_PASSWORD');
  if (!pw) throw new Error('Belum terhubung. Jalankan menu MODIS > Hubungkan ke database.');
  var resp = UrlFetchApp.fetch(CLIENT.SUPABASE_URL + '/auth/v1/token?grant_type=password', {
    method: 'post',
    contentType: 'application/json',
    headers: { apikey: CLIENT.SUPABASE_KEY },
    payload: JSON.stringify({ email: CLIENT.DASHBOARD_EMAIL, password: pw }),
    muteHttpExceptions: true,
  });
  if (resp.getResponseCode() !== 200) throw new Error('kata sandi salah atau akun dashboard belum dibuat');
  var token = JSON.parse(resp.getContentText()).access_token;
  cache.put('MODIS_TOKEN', token, 50 * 60);
  return token;
}

function clientFetch_(from, to) {
  var token = clientLogin_();
  var out = [];
  var page = 1000;
  for (var start = 0; ; start += page) {
    var resp = UrlFetchApp.fetch(CLIENT.SUPABASE_URL + '/rest/v1/rpc/modis_report_agg', {
      method: 'post',
      contentType: 'application/json',
      headers: {
        apikey: CLIENT.SUPABASE_KEY,
        Authorization: 'Bearer ' + token,
        'Range-Unit': 'items',
        Range: start + '-' + (start + page - 1),
      },
      payload: JSON.stringify({ p_from: from, p_to: to }),
      muteHttpExceptions: true,
    });
    var code = resp.getResponseCode();
    if (code === 401 && start === 0) {
      token = clientLogin_(null, true);
      start -= page;
      continue;
    }
    if (code !== 200 && code !== 206) throw new Error('Gagal membaca data (' + code + '): ' + resp.getContentText().slice(0, 200));
    var batch = JSON.parse(resp.getContentText());
    out = out.concat(batch);
    if (batch.length < page) break;
  }
  return out;
}

function clientPeriod_() {
  var props = PropertiesService.getScriptProperties();
  var start = props.getProperty('MODIS_START') || CLIENT.DEFAULT_START;
  var days = parseInt(props.getProperty('MODIS_DAYS') || CLIENT.DEFAULT_DAYS, 10);
  var end = addDaysC_(start, days - 1);
  var today = todayC_();
  var report = today < start ? start : today > end ? end : today;
  return { start: start, days: days, end: end, report: report, dayNo: diffDaysC_(start, report) + 1 };
}

// ---------------------------------------------------------------------
// Agregasi
// ---------------------------------------------------------------------
function blank_() {
  return { v: 0, r: 0, s: 0, st: 0, days: {} };
}
function add_(acc, row) {
  acc.v += Number(row.visitors) || 0;
  acc.s += Number(row.savings_sum) || 0;
  acc.st += Number(row.stamps_sum) || 0;
  if (row.reward_claimed) acc.r += Number(row.visitors) || 0;
  acc.days[row.day] = true;
}
function avgSave_(acc) {
  return acc.v ? Math.round(acc.s / acc.v) : 0;
}
function activeDays_(acc) {
  return Object.keys(acc.days).length;
}
function slotLabel_(unit, hours) {
  var h = String(hours || '');
  var slot = SLOTS[h.slice(0, 5)];
  return (unit || '—') + ' · ' + (slot ? slot + ' ' + h : h || 'jam tidak diisi');
}
function catLabel_(cat) {
  for (var i = 0; i < CATEGORIES.length; i++) if (CATEGORIES[i][0] === cat) return CATEGORIES[i][1];
  return cat || 'Lainnya';
}

// ---------------------------------------------------------------------
// Bangun dashboard
// ---------------------------------------------------------------------
function clientBuild_() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return;
  try {
    var p = clientPeriod_();
    var rows = clientFetch_(p.start, p.report);
    var yesterday = addDaysC_(p.report, -1);

    var all = blank_(), today = blank_(), yday = blank_();
    var byDay = {}, byWeek = {}, byMonth = {}, byUnit = {}, byCat = {}, byStatus = {}, byReward = {}, todaySlots = {};
    var locsAll = {}, locsToday = {};

    rows.forEach(function (r) {
      add_(all, r);
      (byDay[r.day] = byDay[r.day] || blank_()), add_(byDay[r.day], r);
      var wk = 'Wk ' + (Math.floor(diffDaysC_(p.start, r.day) / 7) + 1);
      (byWeek[wk] = byWeek[wk] || blank_()), add_(byWeek[wk], r);
      var mk = String(r.day).slice(0, 7);
      (byMonth[mk] = byMonth[mk] || blank_()), add_(byMonth[mk], r);
      var u = r.unit_type || 'Lainnya';
      (byUnit[u] = byUnit[u] || blank_()), add_(byUnit[u], r);
      var c = catLabel_(r.poi_category);
      (byCat[c] = byCat[c] || blank_()), add_(byCat[c], r);
      var st = r.boros_status || 'Lainnya';
      (byStatus[st] = byStatus[st] || blank_()), add_(byStatus[st], r);
      if (r.reward_claimed) (byReward[r.reward_claimed] = (byReward[r.reward_claimed] || 0) + (Number(r.visitors) || 0));
      if (r.poi_location) locsAll[r.poi_location] = true;
      if (r.day === p.report) {
        add_(today, r);
        if (r.poi_location) locsToday[r.poi_location] = true;
        var key = [r.unit_type, r.duty_hours, r.poi_location].join('|');
        if (!todaySlots[key]) todaySlots[key] = { label: slotLabel_(r.unit_type, r.duty_hours), loc: r.poi_location || '—', cat: catLabel_(r.poi_category), acc: blank_() };
        add_(todaySlots[key].acc, r);
      }
      if (r.day === yesterday) add_(yday, r);
    });

    var ss = SpreadsheetApp.getActive();
    var sh = ss.getSheetByName(CLIENT.SHEET);
    if (!sh) {
      sh = ss.insertSheet(CLIENT.SHEET, 0);
      sh.setTabColor(CLIENT.GRAB);
    }
    sh.getCharts().forEach(function (ch) { sh.removeChart(ch); });
    sh.clear();
    sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).breakApart();
    sh.setHiddenGridlines(true);
    var widths = [16, 250, 200, 140, 120, 120, 130, 130, 130];
    widths.forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
    sh.getRange(1, 1, sh.getMaxRows(), 9).setFontFamily('Arial').setFontSize(9).setVerticalAlignment('middle');

    // Judul
    bar_(sh, 1, 'GRAB JABO MODIS – DASHBOARD CEK BOROS', 14);
    sh.setRowHeight(1, 34);
    sh.getRange(2, 2).setValue('Ringkasan otomatis dari aplikasi Cek Boros · tanpa data pribadi visitor').setFontColor('#5E5E5E').setFontStyle('italic');

    kv_(sh, 4, 'Campaign', CLIENT.CAMPAIGN);
    kv_(sh, 5, 'Klien / Pelaksana', CLIENT.CLIENT);
    kv_(sh, 6, 'Periode Running', fmtC_(p.start) + '  –  ' + fmtC_(p.end) + '   (' + p.days + ' hari)');

    sh.getRange(8, 2, 1, 8).setValues([['TANGGAL LAPORAN', dateC_(p.report), 'Hari ke-', p.dayNo, 'dari', p.days, 'Waktu berjalan', p.dayNo / p.days]]);
    sh.getRange(8, 2, 1, 8).setFontWeight('bold');
    sh.getRange(8, 3).setNumberFormat('dd/mm/yyyy').setBackground(CLIENT.INPUT_BG).setFontColor('#0000FF');
    sh.getRange(8, 9).setNumberFormat('0%');
    sh.getRange(9, 2, 1, 2).setValues([['Diperbarui', Utilities.formatDate(new Date(), CLIENT.TZ, 'dd/MM/yyyy HH:mm') + ' WIB']]);
    sh.getRange(9, 2).setFontWeight('bold');

    // 1. Ringkasan
    var row = 11;
    bar_(sh, row++, 'RINGKASAN CEK BOROS  (s/d Tanggal Laporan)', 10);
    head_(sh, row++, ['Metrik', 'Hari ini', 'Kemarin', 's/d Hari ini', 'Rata² / hari aktif', 'Keterangan', '', '']);
    var daysAct = activeDays_(all) || 1;
    var sumRows = [
      ['Visitor Cek Boros', today.v, yday.v, all.v, all.v / daysAct, 'Visitor yang mengisi data & kuis Cek Boros'],
      ['Stamp diberikan', today.r, yday.r, all.r, all.r / daysAct, 'Visitor yang mendapat stamp'],
      ['Stamp diberikan', today.st, yday.st, all.st, all.st / daysAct, 'Stamp Kartu Sobat Hemat dari SPG'],
      ['Rata² potensi hemat / bulan', avgSave_(today), avgSave_(yday), avgSave_(all), '', 'Per visitor, dengan PAHE GrabBike'],
      ['Total potensi hemat / bulan', today.s, yday.s, all.s, all.s / daysAct, 'Akumulasi seluruh visitor'],
      ['Lokasi aktif', Object.keys(locsToday).length, '', Object.keys(locsAll).length, '', 'Jumlah POI yang tercatat'],
    ];
    sh.getRange(row, 2, sumRows.length, 6).setValues(sumRows);
    sh.getRange(row, 3, sumRows.length, 4).setNumberFormat('#,##0');
    sh.getRange(row + 3, 3, 2, 4).setNumberFormat('"Rp"#,##0');
    sh.getRange(row, 2, sumRows.length, 1).setFontWeight('bold');
    sh.getRange(row, 7, sumRows.length, 1).setFontColor('#5E5E5E');
    for (var i = 0; i < sumRows.length; i++) sh.getRange(row + i, 7, 1, 3).merge();
    box_(sh, row - 1, sumRows.length + 1);
    row += sumRows.length + 1;

    // 2. Per unit & jam jaga hari ini
    bar_(sh, row++, 'LAPORAN PER UNIT · JAM JAGA – TANGGAL LAPORAN', 10);
    head_(sh, row++, ['Unit · Jam jaga', 'Lokasi', 'Kategori POI', 'Visitor', 'Stamp', 'Rata² hemat / bln', '% visitor hari ini', '']);
    var slots = Object.keys(todaySlots).map(function (k) { return todaySlots[k]; });
    slots.sort(function (a, b) { return a.label < b.label ? -1 : a.label > b.label ? 1 : 0; });
    var slotStart = row;
    if (!slots.length) {
      sh.getRange(row, 2).setValue('Belum ada data di tanggal laporan.').setFontColor('#9A9A9A');
      row++;
    } else {
      var slotVals = slots.map(function (s) {
        return [s.label, s.loc, s.cat, s.acc.v, s.acc.r, avgSave_(s.acc), today.v ? s.acc.v / today.v : 0];
      });
      sh.getRange(row, 2, slotVals.length, 7).setValues(slotVals);
      sh.getRange(row, 5, slotVals.length, 2).setNumberFormat('#,##0');
      sh.getRange(row, 7, slotVals.length, 1).setNumberFormat('"Rp"#,##0');
      sh.getRange(row, 8, slotVals.length, 1).setNumberFormat('0%');
      row += slotVals.length;
    }
    total_(sh, row, ['TOTAL HARI INI', '', '', today.v, today.r, avgSave_(today), today.v ? 1 : 0], ['', '', '', '#,##0', '#,##0', '"Rp"#,##0', '0%']);
    box_(sh, slotStart - 1, row - slotStart + 2);
    row += 2;

    // 3. Rekap mingguan
    bar_(sh, row++, 'REKAP MINGGUAN', 10);
    head_(sh, row++, ['Minggu', 'Mulai', 'Visitor', 'Stamp', 'Rata² hemat / bln', 'Hari aktif', 'Rata² visitor / hari', '']);
    var weeks = Math.ceil(p.days / 7);
    var wkVals = [];
    for (var w = 0; w < weeks; w++) {
      var a = byWeek['Wk ' + (w + 1)] || blank_();
      var ad = activeDays_(a);
      wkVals.push(['Wk ' + (w + 1), dateC_(addDaysC_(p.start, w * 7)), a.v, a.r, avgSave_(a), ad, ad ? a.v / ad : 0]);
    }
    var wkStart = row;
    sh.getRange(row, 2, wkVals.length, 7).setValues(wkVals);
    sh.getRange(row, 3, wkVals.length, 1).setNumberFormat('dd/mm/yyyy');
    sh.getRange(row, 4, wkVals.length, 2).setNumberFormat('#,##0');
    sh.getRange(row, 6, wkVals.length, 1).setNumberFormat('"Rp"#,##0');
    sh.getRange(row, 8, wkVals.length, 1).setNumberFormat('#,##0');
    row += wkVals.length;
    total_(sh, row, ['TOTAL', '', all.v, all.r, avgSave_(all), activeDays_(all), activeDays_(all) ? all.v / activeDays_(all) : 0], ['', '', '#,##0', '#,##0', '"Rp"#,##0', '0', '#,##0']);
    box_(sh, wkStart - 1, row - wkStart + 2);
    row += 2;

    // 4. Rekap bulanan
    bar_(sh, row++, 'REKAP BULANAN  (bahan Monthly Performance Review)', 10);
    head_(sh, row++, ['Bulan', 'Visitor', 'Stamp', 'Rata² hemat / bln', 'Total potensi hemat', 'Hari aktif', '', '']);
    var months = [];
    for (var d = p.start; d <= p.end; d = addDaysC_(d, 1)) {
      var m = d.slice(0, 7);
      if (months.indexOf(m) < 0) months.push(m);
    }
    var moVals = months.map(function (m) {
      var a = byMonth[m] || blank_();
      return [dateC_(m + '-01'), a.v, a.r, avgSave_(a), a.s, activeDays_(a)];
    });
    var moStart = row;
    sh.getRange(row, 2, moVals.length, 6).setValues(moVals);
    sh.getRange(row, 2, moVals.length, 1).setNumberFormat('mmmm yyyy').setHorizontalAlignment('left');
    sh.getRange(row, 3, moVals.length, 2).setNumberFormat('#,##0');
    sh.getRange(row, 5, moVals.length, 2).setNumberFormat('"Rp"#,##0');
    row += moVals.length;
    total_(sh, row, ['TOTAL', all.v, all.r, avgSave_(all), all.s, activeDays_(all)], ['', '#,##0', '#,##0', '"Rp"#,##0', '"Rp"#,##0', '0']);
    box_(sh, moStart - 1, row - moStart + 2);
    row += 2;

    // 5. Per unit & kategori POI
    bar_(sh, row++, 'PERFORMA PER UNIT & KATEGORI POI  (s/d Tanggal Laporan)', 10);
    head_(sh, row++, ['Unit / Kategori', 'Hari aktif', 'Visitor', '% dari total', 'Stamp', 'Rata² hemat / bln', 'Visitor / hari aktif', '']);
    var perfVals = [];
    UNITS.forEach(function (u) { perfVals.push(perfRow_(u, byUnit[u] || blank_(), all.v)); });
    CATEGORIES.forEach(function (c) { perfVals.push(perfRow_(c[1], byCat[c[1]] || blank_(), all.v)); });
    var perfStart = row;
    sh.getRange(row, 2, perfVals.length, 7).setValues(perfVals);
    sh.getRange(row, 3, perfVals.length, 2).setNumberFormat('#,##0');
    sh.getRange(row, 5, perfVals.length, 1).setNumberFormat('0%');
    sh.getRange(row, 6, perfVals.length, 1).setNumberFormat('#,##0');
    sh.getRange(row, 7, perfVals.length, 1).setNumberFormat('"Rp"#,##0');
    sh.getRange(row, 8, perfVals.length, 1).setNumberFormat('#,##0');
    sh.getRange(row + UNITS.length, 2, 1, 8).setBorder(true, null, null, null, null, null, '#B7BDC5', SpreadsheetApp.BorderStyle.SOLID);
    row += perfVals.length;
    box_(sh, perfStart - 1, perfVals.length + 1);
    row += 1;

    // 6. Status boros & hadiah (berdampingan)
    bar_(sh, row++, 'STATUS BOROS VISITOR & STAMP PER TINGKAT  (s/d Tanggal Laporan)', 10);
    head_(sh, row, ['Status boros', 'Visitor', '%', 'Rata² hemat / bln', 'Stamp', 'Jumlah', '%', '']);
    var stStart = ++row;
    var stVals = STATUSES.map(function (st) {
      var a = byStatus[st] || blank_();
      return [st, a.v, all.v ? a.v / all.v : 0, avgSave_(a)];
    });
    sh.getRange(row, 2, stVals.length, 4).setValues(stVals);
    sh.getRange(row, 3, stVals.length, 1).setNumberFormat('#,##0');
    sh.getRange(row, 4, stVals.length, 1).setNumberFormat('0%');
    sh.getRange(row, 5, stVals.length, 1).setNumberFormat('"Rp"#,##0');
    var rw = Object.keys(byReward).map(function (k) { return [k, byReward[k], all.r ? byReward[k] / all.r : 0]; });
    rw.sort(function (a, b) { return b[1] - a[1]; });
    if (!rw.length) rw = [['Belum ada stamp', 0, 0]];
    sh.getRange(row, 6, rw.length, 3).setValues(rw);
    sh.getRange(row, 7, rw.length, 1).setNumberFormat('#,##0');
    sh.getRange(row, 8, rw.length, 1).setNumberFormat('0%');
    var blockRows = Math.max(stVals.length, rw.length);
    row += blockRows;
    total_(sh, row, ['TOTAL', all.v, all.v ? 1 : 0, avgSave_(all), 'TOTAL STAMP', all.r, all.r ? 1 : 0], ['', '#,##0', '0%', '"Rp"#,##0', '', '#,##0', '0%']);
    box_(sh, stStart - 1, blockRows + 2);
    row += 2;

    // 7. Grafik + 8. Rekap harian (sumber grafik)
    bar_(sh, row++, 'GRAFIK', 10);
    var chartRow = row;
    row += 40; // ruang untuk grafik
    bar_(sh, row++, 'REKAP HARIAN  (sumber grafik)', 10);
    head_(sh, row++, ['Hari ke-', 'Tanggal', 'Hari', 'Visitor', 'Kumulatif visitor', 'Stamp', 'Rata² hemat / bln', '']);
    var dayStart = row;
    var cum = 0;
    var dayVals = [];
    for (var n = 0; n < p.days; n++) {
      var dk = addDaysC_(p.start, n);
      var a2 = byDay[dk] || blank_();
      var future = dk > p.report;
      cum += a2.v;
      dayVals.push([n + 1, dateC_(dk), Utilities.formatDate(dateC_(dk), CLIENT.TZ, 'EEEE'), future ? '' : a2.v, future ? '' : cum, future ? '' : a2.r, future ? '' : avgSave_(a2)]);
    }
    sh.getRange(row, 2, dayVals.length, 7).setValues(dayVals);
    sh.getRange(row, 2, dayVals.length, 1).setHorizontalAlignment('left');
    sh.getRange(row, 3, dayVals.length, 1).setNumberFormat('dd/mm/yyyy');
    sh.getRange(row, 5, dayVals.length, 3).setNumberFormat('#,##0');
    sh.getRange(row, 8, dayVals.length, 1).setNumberFormat('"Rp"#,##0');
    var todayIdx = p.dayNo - 1;
    sh.getRange(row + todayIdx, 2, 1, 7).setBackground(CLIENT.INPUT_BG).setFontWeight('bold');
    box_(sh, dayStart - 1, dayVals.length + 1);
    row += dayVals.length;

    // Grafik
    var shown = Math.max(1, p.dayNo);
    var chart1 = sh.newChart()
      .asComboChart()
      .addRange(sh.getRange(dayStart - 1, 3, shown + 1, 1))
      .addRange(sh.getRange(dayStart - 1, 5, shown + 1, 2))
      .setNumHeaders(1)
      .setOption('title', 'Visitor Harian & Kumulatif')
      .setOption('series', {
        0: { type: 'bars', color: CLIENT.GRAB, targetAxisIndex: 0 },
        1: { type: 'line', color: CLIENT.GREEN, targetAxisIndex: 1, lineWidth: 3 },
      })
      .setOption('vAxes', { 0: { title: 'Visitor / hari' }, 1: { title: 'Kumulatif' } })
      .setOption('legend', { position: 'top' })
      .setOption('hAxis', { format: 'dd/MM', slantedText: true })
      .setPosition(chartRow, 2, 0, 0)
      .setOption('width', 1060)
      .setOption('height', 340)
      .build();
    sh.insertChart(chart1);

    var chart2 = sh.newChart()
      .asPieChart()
      .addRange(sh.getRange(stStart - 1, 2, STATUSES.length + 1, 2))
      .setNumHeaders(1)
      .setOption('title', 'Status Boros Visitor')
      .setOption('pieHole', 0.45)
      .setOption('colors', ['#DB3735', '#F79705', CLIENT.YELLOW, CLIENT.GRAB])
      .setOption('legend', { position: 'right' })
      .setPosition(chartRow + 19, 2, 0, 0)
      .setOption('width', 520)
      .setOption('height', 300)
      .build();
    sh.insertChart(chart2);

    var chart3 = sh.newChart()
      .asBarChart()
      .addRange(sh.getRange(perfStart, 2, perfVals.length, 1))
      .addRange(sh.getRange(perfStart, 4, perfVals.length, 1))
      .setNumHeaders(0)
      .setOption('title', 'Visitor per Unit & Kategori POI')
      .setOption('colors', [CLIENT.GRAB])
      .setOption('legend', { position: 'none' })
      .setPosition(chartRow + 19, 5, 40, 0)
      .setOption('width', 520)
      .setOption('height', 300)
      .build();
    sh.insertChart(chart3);

    sh.getRange(row + 1, 2).setValue('Catatan: angka dihitung otomatis dari database aplikasi Cek Boros (WIB). Potensi hemat adalah estimasi dari jawaban visitor dengan tarif PAHE GrabBike.')
      .setFontColor('#5E5E5E').setFontStyle('italic');
    sh.setFrozenRows(0);
    PropertiesService.getScriptProperties().setProperty('MODIS_LAST_BUILD', new Date().toISOString());
  } finally {
    lock.releaseLock();
  }
}

function perfRow_(label, acc, total) {
  var ad = activeDays_(acc);
  return [label, ad, acc.v, total ? acc.v / total : 0, acc.r, avgSave_(acc), ad ? acc.v / ad : 0];
}

// ---------------------------------------------------------------------
// Gaya
// ---------------------------------------------------------------------
function bar_(sh, row, text, size) {
  sh.getRange(row, 2, 1, CLIENT.COLS).merge().setValue(text).setBackground(CLIENT.GREEN).setFontColor('#FFFFFF').setFontWeight('bold').setFontSize(size);
  sh.setRowHeight(row, size > 10 ? 34 : 24);
}

function head_(sh, row, labels) {
  sh.getRange(row, 2, 1, CLIENT.COLS).setValues([labels]).setBackground(CLIENT.HEAD).setFontColor('#FFFFFF').setFontWeight('bold').setWrap(true);
  sh.setRowHeight(row, 30);
}

function total_(sh, row, vals, formats) {
  sh.getRange(row, 2, 1, vals.length).setValues([vals]);
  sh.getRange(row, 2, 1, CLIENT.COLS).setBackground(CLIENT.TOTAL_BG).setFontWeight('bold');
  formats.forEach(function (f, i) { if (f) sh.getRange(row, 2 + i).setNumberFormat(f); });
}

function box_(sh, row, rows) {
  sh.getRange(row, 2, rows, CLIENT.COLS).setBorder(true, true, true, true, null, true, '#D5D8DC', SpreadsheetApp.BorderStyle.SOLID);
}

function kv_(sh, row, k, v) {
  sh.getRange(row, 2, 1, 2).setValues([[k, v]]);
  sh.getRange(row, 2).setFontWeight('bold');
  sh.getRange(row, 3, 1, 6).merge();
}

// ---------------------------------------------------------------------
// Tanggal (WIB)
// ---------------------------------------------------------------------
function todayC_() {
  return Utilities.formatDate(new Date(), CLIENT.TZ, 'yyyy-MM-dd');
}
function addDaysC_(key, n) {
  var d = new Date(key + 'T12:00:00+07:00');
  d.setDate(d.getDate() + n);
  return Utilities.formatDate(d, CLIENT.TZ, 'yyyy-MM-dd');
}
function diffDaysC_(a, b) {
  return Math.round((new Date(b + 'T12:00:00+07:00') - new Date(a + 'T12:00:00+07:00')) / 86400000);
}
function dateC_(key) {
  return new Date(key + 'T12:00:00+07:00');
}
function fmtC_(key) {
  return Utilities.formatDate(dateC_(key), CLIENT.TZ, 'dd/MM/yyyy');
}
