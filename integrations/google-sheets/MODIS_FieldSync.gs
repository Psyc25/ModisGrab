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
