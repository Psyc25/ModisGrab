/** MODIS Laporan Sheet — SATU FILE: MODIS_FieldSync.gs + MODIS_LaporanMatrix.gs + MODIS_Dashboard.gs digabung. Tempel seluruh isi file ini ke Apps Script (menggantikan isi lama). Jangan dipasang bersama file terpisahnya. */
/**
 * MODIS Field App → Google Sheet (mirror untuk office & cadangan Google Form)
 * --------------------------------------------------------------------------
 * Pasang di spreadsheet [INT] GRAB MODIS - Internal Tracker: Extensions > Apps Script > tempel file ini > Save.
 * Lalu di spreadsheet: menu "MODIS Field" > Hubungkan (isi kata sandi dashboard) > Aktifkan sync otomatis.
 *
 * Lembar yang dibuat / diperbarui otomatis (tiap 5 menit):
 *   - Conversion   : satu baris per conversion (nomor HP hanya 4 digit akhir)
 *   - Daily Report : per hari per unit (reach, contacts, PaHe New/lapsed, GB Hemat, reward per tier, photobooth, stok)
 *   - Stok         : opening / refill / pakai / closing / selisih per item, ditandai bila lebih dari 2%
 *   - Issue        : laporan kendala dari crew (60 hari terakhir)
 * Menu "Kirim Plotting ke aplikasi crew" mengirim tab Plotting ke tablet (venue & shift hari ini).
 * Data dibaca memakai akun dashboard (hanya baca), dilindungi Row Level Security.
 */

var F = {
  SUPABASE_URL: 'https://lucjgeoaugcsxolgdsfe.supabase.co',
  SUPABASE_KEY: 'sb_publishable_cDE6vKDTsVo7XCWRKU9_0g_y1vvCYcR',
  EMAIL: 'dashboard@modis-cekboros.app',
  TZ: 'Asia/Jakarta',
  DAILY_TARGET_UNIT: 200, // 600 per hari ([EXT] Daily Report) dibagi 3 unit
};

var UNIT_NAME = { mobil: 'Mobil Diskon', kiosk1: 'Kiosk Diskon 1', kiosk2: 'Kiosk Diskon 2' };
var TYPE_NAME = { pahe_new: 'PaHe New', pahe_lapsed: 'PaHe Churned', gb_hemat: 'GB Hemat ride' };
var MERCH_NAME = { w_roti: 'Roti', w_pisang: 'Pisang', w_telur: 'Telur', w_caffino: 'Caffino', w_isoplus: 'Isoplus', w_nobo: 'Nobo Milk',
  c_keychain: 'Acrylic keychain', c_sticker: 'Sticker pack', c_pen: 'Pen branding', b_tote: 'Tote bag', b_pouch: 'Travel pouch', b_lanyard: 'Lanyard',
  a_umbrella: 'Payung lipat', a_tumbler: 'Egg tumbler', a_fan: 'Mini fan USB',
  h_phone: 'Smartphone Samsung', h_gold: 'Emas Antam 0,5 g', h_tws: 'TWS', h_powerbank: 'Powerbank 10.000 mAh', h_watch: 'Smartwatch' };
var REWARD_NAME = { snack: 'Welcome snack', drink: 'Welcome drink', candy: 'Kupon candy', tier_c: 'Kupon Tier C', tier_b: 'Kupon Tier B', tier_a: 'Kupon Tier A', golden: 'Golden coupon', none: '-' };
var STOCK_ITEMS = [
  ['w_roti', 'Welcome snack Roti'], ['w_pisang', 'Welcome snack Pisang'], ['w_telur', 'Welcome snack Telur'],
  ['w_caffino', 'Welcome drink Caffino'], ['w_isoplus', 'Welcome drink Isoplus'], ['w_nobo', 'Welcome drink Nobo Milk'],
  ['kapsul_candy', 'Kupon kapsul Candy'], ['kapsul_c', 'Kupon kapsul Tier C'], ['kapsul_b', 'Kupon kapsul Tier B'], ['kapsul_a', 'Kupon kapsul Tier A'], ['kapsul_golden', 'Golden coupon'],
  ['c_keychain', 'Tier C Acrylic keychain'], ['c_sticker', 'Tier C Sticker pack'], ['c_pen', 'Tier C Pen branding'],
  ['b_tote', 'Tier B Tote bag'], ['b_pouch', 'Tier B Travel pouch'], ['b_lanyard', 'Tier B Lanyard'],
  ['a_umbrella', 'Tier A Payung lipat'], ['a_tumbler', 'Tier A Egg tumbler'], ['a_fan', 'Tier A Mini fan USB'],
  ['candy_pcs', 'Candy (pcs)'], ['kertas_foto', 'Kertas photobooth'],
];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('MODIS Field')
    .addItem('Hubungkan (kata sandi dashboard)', 'fieldConnect')
    .addItem('Sync sekarang', 'fieldSyncNow')
    .addItem('Sync ulang semua data', 'fieldResyncAll')
    .addItem('Kirim Plotting ke aplikasi crew', 'fieldPushPlotting')
    .addSeparator()
    .addItem('Aktifkan sync otomatis (5 menit)', 'fieldEnableAuto')
    .addItem('Matikan sync otomatis', 'fieldDisableAuto')
    .addToUi();
  if (typeof dashMenu_ === 'function') dashMenu_();
  if (typeof extMenu_ === 'function') extMenu_(); // menu ke [EXT] (MODIS_ExtDailyReport.gs)
}

function fieldConnect() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.prompt('Hubungkan ke MODIS', 'Masukkan kata sandi dashboard MODIS:', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var pw = r.getResponseText().trim();
  try {
    login_(pw, true);
  } catch (e) {
    ui.alert('Gagal masuk: ' + e.message);
    return;
  }
  PropertiesService.getScriptProperties().setProperty('FIELD_PASSWORD', pw);
  ui.alert('Terhubung. Pilih "Sync sekarang" atau aktifkan sync otomatis.');
}

function fieldSyncNow() {
  var n = sync_(false);
  SpreadsheetApp.getActive().toast(n + ' conversion diperbarui', 'MODIS Field', 5);
}
function fieldResyncAll() {
  PropertiesService.getScriptProperties().deleteProperty('FIELD_CURSOR');
  var n = sync_(true);
  SpreadsheetApp.getActive().toast('Sync ulang selesai: ' + n + ' conversion', 'MODIS Field', 5);
}
function fieldEnableAuto() {
  fieldDisableAuto();
  ScriptApp.newTrigger('fieldAutoSync').timeBased().everyMinutes(5).create();
  SpreadsheetApp.getUi().alert('Sync otomatis aktif tiap 5 menit.');
}
function fieldDisableAuto() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'fieldAutoSync') ScriptApp.deleteTrigger(t);
  });
}
function fieldAutoSync() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try {
    sync_(false);
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------------
/**
 * Kirim tab "Plotting" (venue & shift per unit per hari) ke aplikasi crew.
 * Tablet menampilkan "Plotting hari ini" dan shift otomatis saat login.
 * Jalankan ulang setiap kali plotting diubah / DRAFT dikonfirmasi.
 */
function fieldPushPlotting() {
  var sh = SpreadsheetApp.getActive().getSheetByName('Plotting');
  if (!sh) throw new Error('Tab "Plotting" tidak ditemukan di spreadsheet ini.');
  var v = sh.getDataRange().getDisplayValues();
  var find = function (a, b) {
    for (var i = 0; i < v.length; i++) if (String(v[i][0]).trim() === a && (b === undefined || String(v[i][1]).trim() === b)) return v[i];
    return null;
  };
  var month = find('Month'), date = find('Date');
  if (!month || !date) throw new Error('Baris "Month" / "Date" tidak ditemukan di tab Plotting.');
  var rows = [find('Mobil Diskon', 'Shift'), find('Mobil Diskon', 'Venue 1'), find('Mobil Diskon', 'Venue 2'),
    find('Kiosk Diskon 1', 'Shift'), find('Kiosk Diskon 1', 'Venue'), find('Kiosk Diskon 2', 'Shift'), find('Kiosk Diskon 2', 'Venue')];
  var MON = { January: '01', February: '02', March: '03', April: '04', May: '05', June: '06', July: '07', August: '08', September: '09', October: '10', November: '11', December: '12' };
  var days = {}, n = 0;
  for (var c = 3; c < date.length; c++) {
    var d = String(date[c]).trim().split(' ')[0], m = String(month[c]).trim().split(' ');
    if (!d || !MON[m[0]] || !m[1]) continue;
    var cells = rows.map(function (r) { return r ? String(r[c] || '').trim() : ''; });
    if (!cells.some(function (x) { return x; })) continue;
    days[m[1] + '-' + MON[m[0]] + '-' + ('0' + d).slice(-2)] = cells;
    n++;
  }
  rpc_('modis_f1_set_setting', { p_key: 'plotting', p_value: { days: days, source: 'Plotting ' + Utilities.formatDate(new Date(), F.TZ, 'd MMM yyyy HH:mm') } });
  SpreadsheetApp.getActive().toast(n + ' hari plotting terkirim ke aplikasi crew', 'MODIS Field', 6);
}

function rpc_(fn, body) {
  var token = login_();
  var resp = UrlFetchApp.fetch(F.SUPABASE_URL + '/rest/v1/rpc/' + fn, {
    method: 'post',
    contentType: 'application/json',
    headers: { apikey: F.SUPABASE_KEY, Authorization: 'Bearer ' + token },
    payload: JSON.stringify(body),
    muteHttpExceptions: true,
  });
  if (resp.getResponseCode() === 401) {
    login_(null, true);
    return rpc_(fn, body);
  }
  if (resp.getResponseCode() >= 300) throw new Error('Gagal ' + fn + ': ' + resp.getContentText().slice(0, 200));
  var t = resp.getContentText();
  return t ? JSON.parse(t) : null;
}

function login_(password, fresh) {
  var cache = CacheService.getScriptCache();
  if (!fresh) {
    var c = cache.get('FIELD_TOKEN');
    if (c) return c;
  }
  var pw = password || PropertiesService.getScriptProperties().getProperty('FIELD_PASSWORD');
  if (!pw) throw new Error('Belum terhubung. Pilih menu MODIS Field > Hubungkan.');
  var resp = UrlFetchApp.fetch(F.SUPABASE_URL + '/auth/v1/token?grant_type=password', {
    method: 'post',
    contentType: 'application/json',
    headers: { apikey: F.SUPABASE_KEY },
    payload: JSON.stringify({ email: F.EMAIL, password: pw }),
    muteHttpExceptions: true,
  });
  if (resp.getResponseCode() !== 200) throw new Error('Kata sandi salah atau akun tidak aktif');
  var token = JSON.parse(resp.getContentText()).access_token;
  cache.put('FIELD_TOKEN', token, 50 * 60);
  return token;
}

function get_(path) {
  var token = login_();
  var out = [];
  for (var start = 0; ; start += 1000) {
    var resp = UrlFetchApp.fetch(F.SUPABASE_URL + '/rest/v1/' + path, {
      headers: { apikey: F.SUPABASE_KEY, Authorization: 'Bearer ' + token, 'Range-Unit': 'items', Range: start + '-' + (start + 999) },
      muteHttpExceptions: true,
    });
    var code = resp.getResponseCode();
    if (code === 401) {
      token = login_(null, true);
      start -= 1000;
      continue;
    }
    if (code >= 300) throw new Error('Gagal baca ' + path.split('?')[0] + ': ' + resp.getContentText().slice(0, 200));
    var rows = JSON.parse(resp.getContentText());
    out = out.concat(rows);
    if (rows.length < 1000) break;
  }
  return out;
}

function sync_(full) {
  var props = PropertiesService.getScriptProperties();
  if (!full && convNeedsMigration_()) { full = true; props.deleteProperty('FIELD_CURSOR'); } // susunan kolom Conversion berubah: tulis ulang
  var cursor = full ? null : props.getProperty('FIELD_CURSOR');
  var since = cursor ? new Date(new Date(cursor).getTime() - 2 * 60 * 1000).toISOString() : '2000-01-01T00:00:00Z';
  var cols = 'id,created_at,synced_at,claim_day,unit_id,shift,spg_name,poi_location,poi_category,phone_last4,name,type,reward,photobooth,status,photo_path,photo_archived_at,merch,reward2,merch2,prize';
  var rows = get_('modis_conversions?select=' + cols + '&synced_at=gt.' + encodeURIComponent(since) + '&order=synced_at.asc');
  writeConversions_(rows, full);
  try { copyPhotos_(); } catch (e) { Logger.log('Salin foto: ' + e.message); }

  // Hari yang berubah: dari conversion baru + close day / stok hari ini & kemarin
  var days = {};
  rows.forEach(function (r) { days[r.claim_day] = true; });
  var today = Utilities.formatDate(new Date(), F.TZ, 'yyyy-MM-dd');
  var yday = Utilities.formatDate(new Date(Date.now() - 86400000), F.TZ, 'yyyy-MM-dd');
  days[today] = true;
  days[yday] = true;
  if (full) {
    get_('modis_conversions?select=claim_day').forEach(function (r) { days[r.claim_day] = true; });
  }
  var list = Object.keys(days).sort();
  writeDaily_(list);
  try { writeIssues_(); } catch (e) { /* tabel issue belum ada: abaikan */ }
  try { writeBoros_(list); } catch (e) { Logger.log('Cek Boros: ' + e.message); }
  try { if (typeof writeDashData_ === 'function') writeDashData_(); } catch (e) { Logger.log('Dashboard: ' + e.message); }
  if (rows.length) props.setProperty('FIELD_CURSOR', rows[rows.length - 1].synced_at);
  props.setProperty('FIELD_LAST_SYNC', new Date().toISOString());
  return rows.length;
}

/**
 * Nama tab data harian otomatis: selalu "Data Harian". Tab "Daily Report" di [EXT] Project Tracker adalah tabel milik klien
 * (hari sebagai kolom) dan TIDAK boleh ditimpa. Tab "Daily Report" lama hasil skrip versi awal (header "Tanggal") diganti
 * namanya menjadi "Data Harian" supaya datanya tidak hilang.
 */
function dailyTabName_() {
  var ss = SpreadsheetApp.getActive();
  var old = ss.getSheetByName('Daily Report');
  if (old && !ss.getSheetByName('Data Harian') && String(old.getRange(1, 1).getValue()) === 'Tanggal') old.setName('Data Harian');
  return 'Data Harian';
}

/**
 * Mode uji (menu MODIS Dashboard > Mode uji): hari pertama data digeser menjadi 26 Okt (hari pertama kampanye),
 * sehingga data dummy tampil di kolom tanggal kampanye pada Laporan Harian dan [EXT] Daily Report. Mode resmi: tanpa pergeseran.
 * rows: [{day:'yyyy-MM-dd', ...}] -> salinan baru dengan day yang sudah digeser.
 */
function ujiDayNum_(iso) { var p = iso.split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
function ujiMoveDay_(iso, off) {
  var d = new Date(ujiDayNum_(iso) + off * 86400000);
  return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2);
}
/** Selisih hari agar hari data pertama menjadi 26 Okt; 0 bila bukan Mode uji atau tanpa data. */
function ujiOffset_(rows) {
  if (PropertiesService.getScriptProperties().getProperty('DASH_MODE') !== 'UJI' || !rows.length) return 0;
  var min = rows.reduce(function (m, r) { return r.day < m ? r.day : m; }, rows[0].day);
  return Math.round((ujiDayNum_('2026-10-26') - ujiDayNum_(min)) / 86400000);
}
function ujiShift_(rows) {
  var off = ujiOffset_(rows);
  if (!off) return rows;
  return rows.map(function (r) { var c = {}; for (var k in r) c[k] = r[k]; c.day = ujiMoveDay_(r.day, off); return c; });
}

function normBorosStatus_(s) {
  var k = String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!k || k === '-') return '-';
  if (k === 'sangat boros') return 'Sangat Boros';
  if (k === 'boros') return 'Boros';
  if (k === 'lumayan boros') return 'Lumayan Boros';
  if (k === 'cukup hemat' || k === 'hemat') return 'Cukup Hemat';
  return String(s).trim();
}

function sheet_(name, header, widths) {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sh.getLastRow() === 0 || sh.getRange(1, 1).getValue() !== header[0]) {
    sh.clear();
    sh.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold').setBackground('#00A651').setFontColor('#FFFFFF').setFontFamily('Times New Roman');
    sh.setFrozenRows(1);
    (widths || []).forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
  }
  return sh;
}

var CONV_HEADER = ['Waktu (WIB)', 'Tanggal', 'Unit', 'Shift', 'SPG', 'Venue', 'Kategori', 'Nama', 'HP (4 digit akhir)', 'Tipe', 'Reward', 'Photobooth', 'Status', 'Foto', 'ID'];
var CONV_WIDTHS = [140, 90, 120, 55, 110, 220, 110, 140, 90, 110, 120, 80, 80, 90, 200];
var CONV_FOTO_COL = 14, CONV_ID_COL = 15;

/** true bila tab Conversion masih memakai susunan kolom lama (ada +1 draw / Catatan / Ada foto). */
function convNeedsMigration_() {
  var sh = SpreadsheetApp.getActive().getSheetByName('Conversion');
  if (!sh || sh.getLastRow() === 0) return false;
  var cur = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), CONV_HEADER.length)).getValues()[0].slice(0, CONV_HEADER.length);
  return cur.join('|') !== CONV_HEADER.join('|');
}

/** Nama visitor dirapikan: huruf kapital di awal tiap kata ("NANDA" / "aril" -> "Nanda" / "Aril"); singkatan 2 huruf (QC, TL) dan tanda [..] dibiarkan. */
function titleName_(s) {
  return String(s || '').replace(/\s+/g, ' ').trim().split(' ').map(function (w) {
    if (!w) return w;
    if (w.charAt(0) === '[' || /^[A-Z]{1,2}$/.test(w)) return w;
    return w.split('-').map(function (p) { return p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : p; }).join('-');
  }).join(' ');
}

/** Sel Foto: tautan ke foto di Drive; "Menunggu" bila belum disalin; "Arsip PC" bila foto sudah hanya di PC kantor; "Belum" bila tidak ada foto. */
function fotoCell_(r, map) {
  if (!r.photo_path) return 'Belum';
  var fid = map[r.id];
  if (fid) return '=HYPERLINK("https://drive.google.com/file/d/' + fid + '/view","Lihat foto")';
  return r.photo_archived_at ? 'Arsip PC' : 'Menunggu';
}

function applyConvFilter_(sh) {
  if (sh.getFilter()) return; // filter dibuat sekali (dan tidak direset tiap sync supaya pilihan filter pengguna tidak hilang)
  var target = 80000; // cukup untuk seluruh kampanye; filter mencakup semua baris ini
  if (sh.getMaxRows() < target) sh.insertRowsAfter(sh.getMaxRows(), target - sh.getMaxRows());
  sh.getRange(1, 1, target, CONV_HEADER.length).createFilter();
}

function writeConversions_(rows, full) {
  var header = CONV_HEADER;
  var migrate = convNeedsMigration_();
  var sh = SpreadsheetApp.getActive().getSheetByName('Conversion');
  if (migrate) {
    var oldF = sh.getFilter();
    if (oldF) oldF.remove();
    sh.clear();
  }
  sh = sheet_('Conversion', header, CONV_WIDTHS);
  if (full && sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, header.length).clearContent();
  applyConvFilter_(sh);
  if (!rows.length) return;
  var map = fotoMap_();
  var idCol = CONV_ID_COL;
  var last = sh.getLastRow();
  var index = {};
  if (last > 1) {
    sh.getRange(2, idCol, last - 1, 1).getValues().forEach(function (v, i) { if (v[0]) index[v[0]] = i + 2; });
  }
  var append = [];
  rows.forEach(function (r) {
    var line = [
      Utilities.formatDate(new Date(r.created_at), F.TZ, 'yyyy-MM-dd HH:mm'),
      r.claim_day,
      UNIT_NAME[r.unit_id] || r.unit_id,
      r.shift,
      r.spg_name,
      r.poi_location || '',
      r.poi_category || '',
      titleName_(r.name),
      r.phone_last4 ? "'••" + r.phone_last4 : '',
      TYPE_NAME[r.type] || r.type,
      (REWARD_NAME[r.reward] || r.reward) + (r.merch || r.prize ? ' (' + (MERCH_NAME[r.merch] || r.merch || r.prize) + ')' : '') + (r.reward2 ? ' + draw 2: ' + (REWARD_NAME[r.reward2] || r.reward2) + (r.merch2 ? ' (' + (MERCH_NAME[r.merch2] || r.merch2) + ')' : '') : ''),
      r.photobooth ? 'Ya' : '',
      r.status === 'ok' ? 'OK' : 'Double claim',
      fotoCell_(r, map),
      r.id,
    ];
    if (index[r.id]) sh.getRange(index[r.id], 1, 1, line.length).setValues([line]);
    else append.push(line);
  });
  if (append.length) sh.getRange(sh.getLastRow() + 1, 1, append.length, header.length).setValues(append);
  if (sh.getLastRow() > 2) sh.getRange(2, 1, sh.getLastRow() - 1, header.length).sort({ column: 1, ascending: false });
}

// ---------------------------------------------------------------------
// Foto bukti: salin dari Supabase Storage ke folder Google Drive, tautan di kolom "Foto"
// (foto di Supabase dihapus setelah diarsipkan ke PC kantor, jadi Drive yang dilihat klien)
// ---------------------------------------------------------------------
function fotoMapSheet_() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName('_FotoMap');
  if (!sh) {
    sh = ss.insertSheet('_FotoMap');
    sh.getRange(1, 1, 1, 3).setValues([['id', 'fileId', 'waktu']]);
    sh.hideSheet();
  }
  return sh;
}
function fotoMap_() {
  var sh = fotoMapSheet_();
  var map = {};
  var n = sh.getLastRow();
  if (n > 1) sh.getRange(2, 1, n - 1, 2).getValues().forEach(function (v) { if (v[0]) map[v[0]] = v[1]; });
  return map;
}
function photoFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('FOTO_FOLDER_ID');
  var folder = null;
  if (id) { try { folder = DriveApp.getFolderById(id); } catch (e) { folder = null; } }
  if (!folder) {
    folder = DriveApp.createFolder(SpreadsheetApp.getActive().getName() + ' - Foto Bukti');
    props.setProperty('FOTO_FOLDER_ID', folder.getId());
  }
  shareFolderLikeSheet_(folder);
  return folder;
}
/** Folder foto dibagikan ke orang yang sama dengan spreadsheet ini (hanya lihat), maksimal sekali per jam. */
function shareFolderLikeSheet_(folder) {
  var props = PropertiesService.getScriptProperties();
  var at = Number(props.getProperty('FOTO_SHARED_AT') || 0);
  if (Date.now() - at < 3600 * 1000) return;
  var f = DriveApp.getFileById(SpreadsheetApp.getActive().getId());
  try {
    var acc = f.getSharingAccess();
    if (acc !== DriveApp.Access.PRIVATE) folder.setSharing(acc, DriveApp.Permission.VIEW);
  } catch (e) { /* kebijakan domain: bagikan manual */ }
  var emails = [];
  f.getViewers().concat(f.getEditors()).forEach(function (u) { var m = u.getEmail(); if (m) emails.push(m); });
  var have = {};
  folder.getViewers().concat(folder.getEditors()).forEach(function (u) { have[u.getEmail()] = true; });
  emails.forEach(function (m) { if (!have[m]) { try { folder.addViewer(m); } catch (e) { /* abaikan */ } } });
  props.setProperty('FOTO_SHARED_AT', String(Date.now()));
}

function copyPhotos_() {
  var t0 = Date.now();
  var pending = get_('modis_conversions?select=id,photo_path&photo_path=not.is.null&photo_archived_at=is.null&order=created_at.asc&limit=40');
  if (!pending.length) return 0;
  var map = fotoMap_();
  var todo = pending.filter(function (r) { return !map[r.id]; });
  if (!todo.length) return 0;
  var folder = photoFolder_();
  var token = login_();
  var mapSh = fotoMapSheet_();
  var done = [];
  for (var i = 0; i < todo.length; i++) {
    if (Date.now() - t0 > 4 * 60 * 1000) break;
    var r = todo[i];
    try {
      var url = F.SUPABASE_URL + '/storage/v1/object/authenticated/modis-proof/' + String(r.photo_path).split('/').map(encodeURIComponent).join('/');
      var resp = UrlFetchApp.fetch(url, { headers: { apikey: F.SUPABASE_KEY, Authorization: 'Bearer ' + token }, muteHttpExceptions: true });
      if (resp.getResponseCode() !== 200) continue; // sudah diarsip PC / tidak ada: biarkan
      var blob = resp.getBlob().setName(r.id + '.jpg');
      var file = folder.createFile(blob);
      done.push([r.id, file.getId(), new Date()]);
    } catch (e) { Logger.log('Foto ' + r.id + ': ' + e.message); }
  }
  if (!done.length) return 0;
  mapSh.getRange(mapSh.getLastRow() + 1, 1, done.length, 3).setValues(done);
  // Perbarui sel Foto di tab Conversion
  var sh = SpreadsheetApp.getActive().getSheetByName('Conversion');
  var last = sh.getLastRow();
  if (last > 1) {
    var ids = sh.getRange(2, CONV_ID_COL, last - 1, 1).getValues();
    var rowOf = {};
    ids.forEach(function (v, i) { if (v[0]) rowOf[v[0]] = i + 2; });
    done.forEach(function (d) {
      if (rowOf[d[0]]) sh.getRange(rowOf[d[0]], CONV_FOTO_COL).setFormula('=HYPERLINK("https://drive.google.com/file/d/' + d[1] + '/view","Lihat foto")');
    });
  }
  return done.length;
}

function writeDaily_(days) {
  if (!days.length) return;
  var from = days[0], to = days[days.length - 1];
  var conv = get_('modis_conversions?select=claim_day,created_at,unit_id,shift,poi_location,type,reward,reward2,merch,merch2,photobooth,status,name,phone_last4&claim_day=gte.' + from + '&claim_day=lte.' + to);
  var close = get_('modis_close_days?select=*&day=gte.' + from + '&day=lte.' + to);
  var stock = get_('modis_stock_moves?select=unit_id,day,kind,item,qty&day=gte.' + from + '&day=lte.' + to);

  // Kolom mengikuti tab Daily Report di [EXT] Project Tracker
  var header = ['Tanggal', 'Unit', 'Shift', 'Venue 1', 'Venue 2 (mobil)', 'Reach (pax)', 'Contacts (pax)', 'PaHe New', 'PaHe Churned', 'GB Hemat ride',
    'Welcome given', 'Capsules drawn', 'Tier C', 'Tier B', 'Tier A', 'Golden', 'Candy draws', 'Photobooth prints', 'Issue / note',
    'Conversion', 'Target', '% target', 'Double claim', 'Item stok selisih >2%', 'TL close day'];
  var sh = sheet_(dailyTabName_(), header, [90, 120, 110, 220, 220, 80, 90, 70, 110, 95, 95, 100, 60, 60, 60, 60, 85, 110, 260, 85, 60, 70, 90, 140, 110]);
  var stockHeader = ['Tanggal', 'Unit', 'Item', 'Opening', 'Refill', 'Pakai (app)', 'Seharusnya', 'Closing', 'Selisih', 'Lebih dari 2%'];
  var st = sheet_('Stok', stockHeader, [90, 120, 170, 70, 70, 85, 85, 70, 70, 95]);

  var dailyRows = [], stockRows = [];
  days.forEach(function (d) {
    Object.keys(UNIT_NAME).forEach(function (u) {
      var c = conv.filter(function (r) { return r.claim_day === d && r.unit_id === u; });
      var okRows = c.filter(function (r) { return r.status === 'ok'; }).sort(function (a, b) { return a.created_at < b.created_at ? -1 : 1; });
      var cd = close.filter(function (x) { return x.day === d && x.unit_id === u; })[0];
      var mv = stock.filter(function (x) { return x.day === d && x.unit_id === u; });
      if (!c.length && !cd && !mv.length) return;
      var n = function (f) { return okRows.filter(f).length; };
      var rw = function (k) { return n(function (r) { return r.reward === k; }) + n(function (r) { return r.reward2 === k; }); };
      var mc = function (k) { return n(function (r) { return r.merch === k; }) + n(function (r) { return r.merch2 === k; }); };
      var pb = n(function (r) { return r.photobooth; });
      var used = { kapsul_candy: rw('candy'), kapsul_c: rw('tier_c'), kapsul_b: rw('tier_b'), kapsul_a: rw('tier_a'),
        kapsul_golden: rw('golden'), candy_pcs: rw('candy') * 5, kertas_foto: pb };
      STOCK_ITEMS.forEach(function (it) { if (used[it[0]] === undefined) used[it[0]] = mc(it[0]); });
      var flagged = 0;
      STOCK_ITEMS.forEach(function (it) {
        var sum = function (k) { return mv.filter(function (m) { return m.kind === k && m.item === it[0]; }).reduce(function (a, m) { return a + m.qty; }, 0); };
        var hasClosing = mv.some(function (m) { return m.kind === 'closing' && m.item === it[0]; });
        if (!mv.some(function (m) { return m.item === it[0]; })) return;
        var op = sum('opening'), rf = sum('refill'), cl = sum('closing'), exp = op + rf - used[it[0]], diff = cl - exp;
        var flag = hasClosing && op + rf > 0 && Math.abs(diff) / (op + rf) > 0.02;
        if (flag) flagged++;
        stockRows.push([d, UNIT_NAME[u], it[1], op, rf, used[it[0]], exp, hasClosing ? cl : '', hasClosing ? diff : '', flag ? 'YA' : '']);
      });
      var venues = [];
      okRows.forEach(function (r) { if (r.poi_location && venues.indexOf(r.poi_location) < 0) venues.push(r.poi_location); });
      var shift = (cd && cd.shift) || (okRows[0] && okRows[0].shift) || '';
      // Hitungan per ORANG: nama + 4 digit nomor sama digabung; tipe utama PaHe New > PaHe Churned > GB Hemat.
      var prio = { pahe_new: 3, pahe_lapsed: 2, gb_hemat: 1 }, people = {};
      okRows.forEach(function (r) {
        var key = String(r.name || '').toLowerCase().replace(/\s+/g, ' ').trim() + '|' + String(r.phone_last4 || '');
        if (!people[key] || (prio[r.type] || 0) > (prio[people[key]] || 0)) people[key] = r.type;
      });
      var pn = 0, pl = 0, gb = 0;
      Object.keys(people).forEach(function (k) { var t = people[k]; if (t === 'pahe_new') pn++; else if (t === 'pahe_lapsed') pl++; else gb++; });
      var total = pn + pl + gb;
      dailyRows.push([d, UNIT_NAME[u], shift === 'AM' ? 'AM 05.00-14.00' : shift === 'PM' ? 'PM 12.00-21.00' : '', venues[0] || '', u === 'mobil' ? (venues[1] || '') : '',
        cd ? cd.reach : '', cd ? cd.contacts : '', pn, pl, gb,
        rw('snack') + rw('drink'), rw('candy') + rw('tier_c') + rw('tier_b') + rw('tier_a') + rw('golden'),
        rw('tier_c'), rw('tier_b'), rw('tier_a'), rw('golden'), rw('candy'), pb, cd ? (cd.notes || '') : '',
        total, F.DAILY_TARGET_UNIT, total / F.DAILY_TARGET_UNIT, c.length - okRows.length, flagged, cd ? cd.closed_by : 'Belum']);
    });
  });

  replaceDays_(sh, header.length, days, dailyRows);
  replaceDays_(st, stockHeader.length, days, stockRows);
  var lastD = sh.getLastRow();
  if (lastD > 1) {
    sh.getRange(2, 1, lastD - 1, 1).setNumberFormat('yyyy-mm-dd');
    sh.getRange(2, 6, lastD - 1, 16).setNumberFormat('0');   // Reach ... Target: angka bulat, bukan tanggal
    sh.getRange(2, 22, lastD - 1, 1).setNumberFormat('0%');
    sh.getRange(2, 23, lastD - 1, 2).setNumberFormat('0');
  }
  var lastS = st.getLastRow();
  if (lastS > 1) {
    st.getRange(2, 1, lastS - 1, 1).setNumberFormat('yyyy-mm-dd');
    st.getRange(2, 4, lastS - 1, 6).setNumberFormat('0');
  }
  if (typeof writeMatrix_ === 'function') writeMatrix_(); // tab "Laporan Harian" (MODIS_LaporanMatrix.gs)
}

/** Ganti baris untuk tanggal-tanggal tertentu, baris tanggal lain tetap. */
function replaceDays_(sh, width, days, newRows) {
  var last = sh.getLastRow();
  var keep = [];
  if (last > 1) {
    keep = sh.getRange(2, 1, last - 1, width).getValues().filter(function (r) {
      var d = r[0] instanceof Date ? Utilities.formatDate(r[0], F.TZ, 'yyyy-MM-dd') : String(r[0]);
      return days.indexOf(d) < 0 && d;
    });
    sh.getRange(2, 1, last - 1, width).clearContent();
  }
  var all = keep.concat(newRows).sort(function (a, b) {
    var da = a[0] instanceof Date ? Utilities.formatDate(a[0], F.TZ, 'yyyy-MM-dd') : String(a[0]);
    var db = b[0] instanceof Date ? Utilities.formatDate(b[0], F.TZ, 'yyyy-MM-dd') : String(b[0]);
    return da < db ? 1 : da > db ? -1 : String(a[1]).localeCompare(String(b[1]));
  });
  if (all.length) sh.getRange(2, 1, all.length, width).setValues(all).setFontFamily('Times New Roman');
}


function writeBoros_(days) {
  if (!days.length) return;
  var from = days[0], to = days[days.length - 1];
  var rows = get_('modis_boros_checks?select=day,created_at,unit_id,shift,spg_name,poi_location,monthly_cost,savings,status&day=gte.' + from + '&day=lte.' + to);
  var header = ['Tanggal', 'Waktu (WIB)', 'Unit', 'Shift', 'SPG', 'Venue', 'Ongkos / bulan (Rp)', 'Potensi hemat / bulan (Rp)', 'Status'];
  var sh = sheet_('Data Cek Boros', header, [90, 140, 120, 55, 110, 220, 130, 160, 110]);
  var out = rows.map(function (r) {
    return [r.day, Utilities.formatDate(new Date(r.created_at), F.TZ, 'yyyy-MM-dd HH:mm'), UNIT_NAME[r.unit_id] || r.unit_id, r.shift || '', r.spg_name || '',
      r.poi_location || '', Number(r.monthly_cost) || 0, Number(r.savings) || 0, normBorosStatus_(r.status)];
  });
  replaceDays_(sh, header.length, days, out);
}

function writeIssues_() {
  var from = Utilities.formatDate(new Date(Date.now() - 60 * 86400000), F.TZ, 'yyyy-MM-dd');
  var rows = get_('modis_issues?select=*&day=gte.' + from + '&order=created_at.desc');
  var header = ['Waktu (WIB)', 'Unit', 'Venue', 'Pelapor', 'Jenis', 'Keterangan', 'Status', 'Tindak lanjut'];
  var sh = sheet_('Issue', header, [140, 120, 200, 120, 150, 360, 80, 260]);
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, header.length).clearContent();
  if (!rows.length) return;
  sh.getRange(2, 1, rows.length, header.length).setValues(rows.map(function (r) {
    return [
      Utilities.formatDate(new Date(r.created_at), F.TZ, 'yyyy-MM-dd HH:mm'),
      UNIT_NAME[r.unit_id] || r.unit_id,
      r.poi_location || '',
      (r.by_name || '') + (r.role === 'tl' ? ' (TL)' : ''),
      r.category,
      r.note || '',
      r.status === 'done' ? 'Selesai' : 'Terbuka',
      r.resolved_note || '',
    ];
  }));
}

// ===== MODIS_LaporanMatrix.gs =====
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

// ===== MODIS_Dashboard.gs =====
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
