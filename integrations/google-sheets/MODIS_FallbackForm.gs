/**
 * MODIS — Google Form cadangan (fallback spec bagian 9)
 * --------------------------------------------------------------------------
 * Membuat Google Form dengan field yang sama seperti aplikasi crew:
 * unit, SPG, venue, nomor HP, nama, tipe, reward, photobooth, consent (+ foto bukti).
 * Jawaban masuk ke tab baru di spreadsheet ini. Malam harinya TL memasukkan ulang
 * lewat menu "Input susulan" di aplikasi (data tercatat dengan jam & SPG asli).
 *
 * Cara pakai (sekali saja, dari akun Milli):
 *   1. Buka spreadsheet MODIS > Extensions > Apps Script > tambah file ini > Save.
 *   2. Jalankan fungsi createFallbackForm (izinkan akses saat diminta).
 *   3. Buka Form yang dibuat (link muncul di log & di tab "Info Form"), lalu tambahkan
 *      satu pertanyaan "Unggah file" bernama "Foto bukti" (Apps Script tidak bisa membuatnya otomatis).
 *   4. Kirim link Form ke HP setiap unit dan simpan sebagai bookmark.
 */

var FORM_UNITS = ['Mobil Diskon', 'Kiosk Diskon 1', 'Kiosk Diskon 2'];

function createFallbackForm() {
  var ss = SpreadsheetApp.getActive();
  var form = FormApp.create('MODIS — Form cadangan crew');
  form.setDescription(
    'Dipakai HANYA saat aplikasi crew tidak bisa dibuka. Field sama dengan aplikasi. ' +
    'Malamnya TL memasukkan ulang lewat menu "Input susulan" di aplikasi.'
  );
  form.setCollectEmail(false);
  form.setProgressBar(false);

  form.addCheckboxItem()
    .setTitle('Consent customer')
    .setHelpText('Customer setuju nama dan nomor HP-nya dicatat untuk program Grab MODIS (cek klaim reward dan laporan program). Data dihapus 90 hari setelah program selesai. Sesuai UU PDP.')
    .setChoiceValues(['Customer setuju'])
    .setRequired(true);
  form.addListItem().setTitle('Unit').setChoiceValues(FORM_UNITS).setRequired(true);
  form.addTextItem().setTitle('Nama SPG').setRequired(true);
  form.addTextItem().setTitle('Venue').setRequired(true);

  var hp = form.addTextItem().setTitle('Nomor HP customer').setHelpText('Mulai 08, 10–13 digit').setRequired(true);
  hp.setValidation(FormApp.createTextValidation().requireTextMatchesPattern('^(\\+?62|0)8[0-9]{8,11}$').setHelpText('Nomor HP tidak valid').build());
  form.addTextItem().setTitle('Nama customer').setRequired(true);
  form.addMultipleChoiceItem().setTitle('Tipe').setChoiceValues(['PaHe New', 'PaHe Churned', 'GB Hemat ride']).setRequired(true);
  form.addMultipleChoiceItem()
    .setTitle('Reward')
    .setHelpText('PaHe = welcome snack/drink. GB Hemat = kupon dari gacha.')
    .setChoiceValues(['Welcome snack', 'Welcome drink', 'Kupon Candy', 'Kupon Tier C', 'Kupon Tier B', 'Kupon Tier A'])
    .setRequired(true);
  form.addCheckboxItem().setTitle('Tambahan').setChoiceValues(['Ikut photobooth', 'Sudah share ke 2 grup WA (+1 gacha)']);

  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());

  var info = ss.getSheetByName('Info Form') || ss.insertSheet('Info Form');
  info.clear();
  info.getRange(1, 1, 4, 2).setValues([
    ['Link isi form (kirim ke crew)', form.getPublishedUrl()],
    ['Link edit form (office)', form.getEditUrl()],
    ['Langkah manual', 'Tambahkan pertanyaan "Unggah file" bernama "Foto bukti" di form.'],
    ['Dibuat', Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd HH:mm')],
  ]);
  info.setColumnWidth(1, 240);
  info.setColumnWidth(2, 520);
  Logger.log('Form crew: ' + form.getPublishedUrl());
  Logger.log('Edit form: ' + form.getEditUrl());
}
