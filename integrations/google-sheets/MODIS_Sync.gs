/**
 * MODIS Cek Boros → Google Sheets (laporan harian live)
 * -----------------------------------------------------
 * Data visitor tetap tersimpan di Supabase. Script ini menyalinnya ke spreadsheet ini
 * setiap 5 menit:
 *   - satu sheet per hari, mis. "Data 2026-10-09" (sheet baru dibuat otomatis tiap hari)
 *   - "Ringkasan Harian": satu baris per tanggal
 *   - "Rekap SPG": per tanggal × lokasi × SPG × jam jaga
 * Hari ini dan kemarin selalu ditulis ulang dari database, jadi data yang telat terkirim
 * (tablet sempat offline) tetap masuk.
 *
 * Cara pasang: lihat integrations/google-sheets/README.md.
 * Kata sandi dashboard TIDAK ditulis di sini; diminta sekali lewat menu MODIS > Hubungkan
 * dan disimpan di Script Properties (hanya bisa dibaca editor script).
 */

var MODIS = {
  SUPABASE_URL: 'https://lucjgeoaugcsxolgdsfe.supabase.co',
  // Publishable key: memang untuk dipakai publik, data tetap dilindungi Row Level Security.
  SUPABASE_KEY: 'sb_publishable_cDE6vKDTsVo7XCWRKU9_0g_y1vvCYcR',
  DASHBOARD_EMAIL: 'dashboard@modis-cekboros.app',
  TZ: 'Asia/Jakarta',
  SYNC_EVERY_MINUTES: 5,
  DAILY_PREFIX: 'Data ',
  SUMMARY_SHEET: 'Ringkasan Harian',
  RECAP_SHEET: 'Rekap SPG',
  GREEN: '#00523B',
  GREEN_LIGHT: '#E5F7ED',
  YELLOW: '#FFD902',
};

var COLUMNS = [
  ['No', 40, null],
  ['Waktu (WIB)', 130, 'datetime'],
  ['Nama', 170, null],
  ['WhatsApp', 130, 'text'],
  ['Email', 200, null],
  ['GrabBike / hari', 110, null],
  ['Ongkos / trip', 100, null],
  ['Trip / bulan', 90, 'int'],
  ['Ongkos normal / bln', 140, 'rp'],
  ['Potensi hemat / bln', 140, 'rp'],
  ['Status boros', 110, null],
  ['Stamp', 60, 'int'],
  ['Stamp', 190, null],
  ['Lokasi', 200, null],
  ['Kategori', 110, null],
  ['Unit', 110, null],
  ['SPG', 110, null],
  ['Jam jaga', 100, null],
];

// ---------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('MODIS')
    .addItem('Hubungkan ke database (sekali)', 'modisConnect')
    .addItem('Sinkron sekarang', 'modisSyncNow')
    .addSeparator()
    .addItem('Aktifkan sinkron otomatis (tiap 5 menit)', 'modisEnableAutoSync')
    .addItem('Matikan sinkron otomatis', 'modisDisableAutoSync')
    .addSeparator()
    .addItem('Tarik ulang tanggal tertentu…', 'modisSyncDatePrompt')
    .addToUi();
}

function modisConnect() {
  var ui = SpreadsheetApp.getUi();
  var res = ui.prompt('Hubungkan MODIS', 'Masukkan kata sandi dashboard Cek Boros:', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  var pw = String(res.getResponseText() || '').trim();
  if (!pw) return ui.alert('Kata sandi kosong.');
  try {
    login_(pw, true);
  } catch (e) {
    return ui.alert('Gagal masuk: ' + e.message);
  }
  PropertiesService.getScriptProperties().setProperty('MODIS_PASSWORD', pw);
  installTrigger_();
  var n = syncDays_([todayKey_(), addDays_(todayKey_(), -1)]);
  ui.alert('Terhubung. Sinkron otomatis aktif tiap ' + MODIS.SYNC_EVERY_MINUTES + ' menit.\n' + n + ' data visitor ditulis.');
}

function modisSyncNow() {
  var n = syncDays_([todayKey_(), addDays_(todayKey_(), -1)]);
  SpreadsheetApp.getActive().toast(n + ' data visitor tersinkron.', 'MODIS', 5);
}

function modisSyncDatePrompt() {
  var ui = SpreadsheetApp.getUi();
  var res = ui.prompt('Tarik ulang', 'Tanggal (format YYYY-MM-DD), mis. ' + todayKey_() + ':', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  var d = String(res.getResponseText() || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return ui.alert('Format tanggal salah. Contoh: ' + todayKey_());
  var n = syncDays_([d], true);
  ui.alert(n + ' data visitor ditulis untuk ' + d + '.');
}

function modisEnableAutoSync() {
  installTrigger_();
  SpreadsheetApp.getActive().toast('Sinkron otomatis aktif tiap ' + MODIS.SYNC_EVERY_MINUTES + ' menit.', 'MODIS', 5);
}

function modisDisableAutoSync() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'modisAutoSync') ScriptApp.deleteTrigger(t);
  });
  SpreadsheetApp.getActive().toast('Sinkron otomatis dimatikan.', 'MODIS', 5);
}

/** Dipanggil trigger waktu. */
function modisAutoSync() {
  syncDays_([todayKey_(), addDays_(todayKey_(), -1)]);
}

function installTrigger_() {
  modisDisableAutoSync();
  ScriptApp.newTrigger('modisAutoSync').timeBased().everyMinutes(MODIS.SYNC_EVERY_MINUTES).create();
}

// ---------------------------------------------------------------------
// Supabase
// ---------------------------------------------------------------------
function login_(password, fresh) {
  var cache = CacheService.getScriptCache();
  if (!fresh) {
    var cached = cache.get('MODIS_TOKEN');
    if (cached) return cached;
  }
  var pw = password || PropertiesService.getScriptProperties().getProperty('MODIS_PASSWORD');
  if (!pw) throw new Error('Belum terhubung. Jalankan menu MODIS > Hubungkan ke database.');
  var resp = UrlFetchApp.fetch(MODIS.SUPABASE_URL + '/auth/v1/token?grant_type=password', {
    method: 'post',
    contentType: 'application/json',
    headers: { apikey: MODIS.SUPABASE_KEY },
    payload: JSON.stringify({ email: MODIS.DASHBOARD_EMAIL, password: pw }),
    muteHttpExceptions: true,
  });
  if (resp.getResponseCode() !== 200) throw new Error('kata sandi salah atau akun dashboard belum dibuat');
  var token = JSON.parse(resp.getContentText()).access_token;
  cache.put('MODIS_TOKEN', token, 50 * 60);
  return token;
}

function fetchDay_(token, dayKey) {
  var from = new Date(dayKey + 'T00:00:00+07:00').toISOString();
  var to = new Date(addDays_(dayKey, 1) + 'T00:00:00+07:00').toISOString();
  var rows = [];
  var page = 1000;
  for (var start = 0; ; start += page) {
    var url =
      MODIS.SUPABASE_URL +
      '/rest/v1/modis_visitors?select=*' +
      '&created_at=gte.' + encodeURIComponent(from) +
      '&created_at=lt.' + encodeURIComponent(to) +
      '&order=created_at.asc';
    var resp = UrlFetchApp.fetch(url, {
      headers: { apikey: MODIS.SUPABASE_KEY, Authorization: 'Bearer ' + token, 'Range-Unit': 'items', Range: start + '-' + (start + page - 1) },
      muteHttpExceptions: true,
    });
    var code = resp.getResponseCode();
    if (code === 401) throw new Error('TOKEN_EXPIRED');
    if (code !== 200 && code !== 206) throw new Error('Gagal membaca data (' + code + '): ' + resp.getContentText().slice(0, 200));
    var batch = JSON.parse(resp.getContentText());
    rows = rows.concat(batch);
    if (batch.length < page) break;
  }
  return rows;
}

// ---------------------------------------------------------------------
// Sinkron
// ---------------------------------------------------------------------
function syncDays_(days, forceCreate) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return 0;
  try {
    var token = login_();
    var total = 0;
    days.forEach(function (d) {
      var rows;
      try {
        rows = fetchDay_(token, d);
      } catch (e) {
        if (e.message !== 'TOKEN_EXPIRED') throw e;
        token = login_(null, true);
        rows = fetchDay_(token, d);
      }
      var ss = SpreadsheetApp.getActive();
      var exists = ss.getSheetByName(MODIS.DAILY_PREFIX + d);
      if (rows.length === 0 && !exists && !forceCreate) return;
      writeDaySheet_(d, rows);
      writeSummary_(d, rows);
      writeRecap_(d, rows);
      total += rows.length;
    });
    PropertiesService.getScriptProperties().setProperty('MODIS_LAST_SYNC', new Date().toISOString());
    return total;
  } finally {
    lock.releaseLock();
  }
}

function writeDaySheet_(dayKey, rows) {
  var ss = SpreadsheetApp.getActive();
  var name = MODIS.DAILY_PREFIX + dayKey;
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name, Math.min(2, ss.getNumSheets()));
    sh.setTabColor(MODIS.GREEN);
  }

  var data = rows.map(function (r, i) {
    return [
      i + 1,
      new Date(r.created_at),
      r.full_name || '',
      r.phone_number ? "'" + r.phone_number : '',
      r.email || '',
      r.daily_bike_trips || '',
      r.avg_trip_cost || '',
      r.monthly_trips || 0,
      r.monthly_cost_normal || 0,
      r.monthly_savings || 0,
      r.boros_status || '',
      r.stamps_count || 0,
      r.reward_claimed || '',
      r.poi_location || '',
      r.poi_category || '',
      r.unit_type || '',
      r.spg_name || '',
      r.duty_hours || '',
    ];
  });

  var rewards = rows.filter(function (r) { return r.reward_claimed; }).length;

  sh.clear();
  sh.getRange(1, 1).setValue('Data visitor Cek Boros · ' + longDate_(dayKey));
  sh.getRange(2, 1).setValue(
    rows.length + ' visitor · ' + rewards + ' stamp · diperbarui ' +
      Utilities.formatDate(new Date(), MODIS.TZ, 'HH:mm') + ' WIB'
  );
  sh.getRange(1, 1).setFontSize(14).setFontWeight('bold').setFontColor(MODIS.GREEN);
  sh.getRange(2, 1).setFontColor('#5E5E5E');

  var header = COLUMNS.map(function (c) { return c[0]; });
  var hr = sh.getRange(4, 1, 1, header.length);
  hr.setValues([header]).setFontWeight('bold').setFontColor('#FFFFFF').setBackground(MODIS.GREEN).setVerticalAlignment('middle').setWrap(true);
  sh.setRowHeight(4, 34);

  if (data.length) {
    var body = sh.getRange(5, 1, data.length, header.length);
    body.setValues(data).setVerticalAlignment('middle');
    COLUMNS.forEach(function (c, i) {
      var col = sh.getRange(5, i + 1, data.length, 1);
      if (c[2] === 'datetime') col.setNumberFormat('dd/mm/yyyy hh:mm');
      if (c[2] === 'rp') col.setNumberFormat('"Rp"#,##0');
      if (c[2] === 'int') col.setNumberFormat('0');
    });
    sh.getRange(5, 1, data.length, header.length)
      .applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, false, false);
  }
  COLUMNS.forEach(function (c, i) { sh.setColumnWidth(i + 1, c[1]); });
  sh.setFrozenRows(4);
  sh.setFrozenColumns(3);
  var filterRange = sh.getRange(4, 1, Math.max(1, data.length) + 1, header.length);
  if (sh.getFilter()) sh.getFilter().remove();
  filterRange.createFilter();
}

function writeSummary_(dayKey, rows) {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(MODIS.SUMMARY_SHEET);
  var header = ['Tanggal', 'Hari', 'Visitor', 'Stamp diberikan', 'Rata-rata potensi hemat / bln', 'Jumlah lokasi', 'Jumlah SPG', 'Diperbarui (WIB)'];
  if (!sh) {
    sh = ss.insertSheet(MODIS.SUMMARY_SHEET, 0);
    sh.setTabColor(MODIS.YELLOW);
  }
  styleHeader_(sh, header, 'Ringkasan harian Cek Boros', [110, 90, 80, 120, 190, 110, 100, 140]);

  var rewards = rows.filter(function (r) { return r.reward_claimed; }).length;
  var avg = rows.length ? Math.round(rows.reduce(function (a, r) { return a + (r.monthly_savings || 0); }, 0) / rows.length) : 0;
  var locs = uniq_(rows.map(function (r) { return r.poi_location; }));
  var spgs = uniq_(rows.map(function (r) { return r.spg_name; }));
  var line = [
    dayKey,
    Utilities.formatDate(new Date(dayKey + 'T12:00:00+07:00'), MODIS.TZ, 'EEEE'),
    rows.length,
    rewards,
    avg,
    locs.length,
    spgs.length,
    Utilities.formatDate(new Date(), MODIS.TZ, 'dd/MM/yyyy HH:mm'),
  ];
  upsertRows_(sh, header.length, function (r) { return r[0] === dayKey; }, [line]);
  sortBody_(sh, header.length, 1, false);
  var n = Math.max(0, sh.getLastRow() - 3);
  if (n) {
    sh.getRange(4, 5, n, 1).setNumberFormat('"Rp"#,##0');
    sh.getRange(4, 1, n, 1).setNumberFormat('@');
  }
}

function writeRecap_(dayKey, rows) {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(MODIS.RECAP_SHEET);
  var header = ['Tanggal', 'Lokasi', 'Unit', 'SPG', 'Jam jaga', 'Visitor', 'Stamp diberikan'];
  if (!sh) {
    sh = ss.insertSheet(MODIS.RECAP_SHEET, Math.min(1, ss.getNumSheets()));
    sh.setTabColor('#F79705');
  }
  styleHeader_(sh, header, 'Rekap per SPG, lokasi & jam jaga', [110, 220, 110, 120, 110, 80, 120]);

  var groups = {};
  rows.forEach(function (r) {
    var key = [r.poi_location, r.unit_type, r.spg_name, r.duty_hours].join('|');
    if (!groups[key]) groups[key] = [dayKey, r.poi_location || '', r.unit_type || '', r.spg_name || '', r.duty_hours || '', 0, 0];
    var g = groups[key];
    g[5] += 1;
    if (r.reward_claimed) g[6] += 1;
  });
  var lines = Object.keys(groups).map(function (k) { return groups[k]; });
  lines.sort(function (a, b) { return b[5] - a[5]; });
  upsertRows_(sh, header.length, function (r) { return r[0] === dayKey; }, lines);
  sortBody_(sh, header.length, 1, false);
  var n = Math.max(0, sh.getLastRow() - 3);
  if (n) sh.getRange(4, 1, n, 1).setNumberFormat('@');
}

// ---------------------------------------------------------------------
// Utilitas sheet
// ---------------------------------------------------------------------
function styleHeader_(sh, header, title, widths) {
  // Susunan kolom berubah (versi lama): kosongkan sheet supaya tidak ada kolom basi.
  var current = sh.getLastColumn() ? sh.getRange(3, 1, 1, Math.max(sh.getLastColumn(), header.length)).getValues()[0] : [];
  if (current.join('|').replace(/\|+$/, '') !== header.join('|')) sh.clear();
  sh.getRange(1, 1).setValue(title).setFontSize(14).setFontWeight('bold').setFontColor(MODIS.GREEN);
  sh.getRange(3, 1, 1, header.length).setValues([header]).setFontWeight('bold').setFontColor('#FFFFFF').setBackground(MODIS.GREEN).setWrap(true).setVerticalAlignment('middle');
  sh.setRowHeight(3, 32);
  sh.setFrozenRows(3);
  widths.forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
}

/** Ganti semua baris yang cocok (mis. tanggal yang sama) dengan baris baru. Data mulai baris 4. */
function upsertRows_(sh, width, match, newRows) {
  var last = sh.getLastRow();
  var existing = last >= 4 ? sh.getRange(4, 1, last - 3, width).getValues() : [];
  var keep = existing.filter(function (r) { return r[0] !== '' && !match(r.map(function (v, i) { return i === 0 ? normDate_(v) : v; })); });
  var all = keep.map(function (r) { r[0] = normDate_(r[0]); return r; }).concat(newRows);
  if (last >= 4) sh.getRange(4, 1, last - 3, width).clearContent();
  if (all.length) sh.getRange(4, 1, all.length, width).setValues(all);
}

function sortBody_(sh, width, col, asc) {
  var last = sh.getLastRow();
  if (last > 4) sh.getRange(4, 1, last - 3, width).sort({ column: col, ascending: asc });
}

function normDate_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, MODIS.TZ, 'yyyy-MM-dd');
  return String(v);
}

function uniq_(arr) {
  var seen = {};
  return arr.filter(function (x) { if (!x || seen[x]) return false; seen[x] = true; return true; });
}

function todayKey_() {
  return Utilities.formatDate(new Date(), MODIS.TZ, 'yyyy-MM-dd');
}

function addDays_(key, n) {
  var d = new Date(key + 'T12:00:00+07:00');
  d.setDate(d.getDate() + n);
  return Utilities.formatDate(d, MODIS.TZ, 'yyyy-MM-dd');
}

function longDate_(key) {
  return Utilities.formatDate(new Date(key + 'T12:00:00+07:00'), MODIS.TZ, 'EEEE, d MMMM yyyy');
}
