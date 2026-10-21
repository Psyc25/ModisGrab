/**
 * Unduh laporan Cek Boros sebagai Excel ber-dashboard.
 *
 * Template (report-template.xlsx) dibuat oleh scripts/build_report_template.py dan sudah berisi
 * tata letak, warna, dan 7 grafik Excel asli. Di sini kita hanya mengisi sel dan tabel datanya,
 * lalu menyesuaikan rentang grafik dengan jumlah baris data. Grafik ikut berubah bila angka
 * di lembar data diubah.
 */
import JSZip from 'jszip';
import tplUrl from './report-template.xlsx?url';
import MAP from './report-template.map.json';
import { Agg, RecentVisitor, ReportSettings, Row, Summary, avgSavings, campaignDayNo, fmtDay, fmtRange, rate } from './engine';

type Cell = string | number | null | undefined | { formula: string; text: string };

const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';

export interface ExportOptions {
  settings: ReportSettings;
  A: Summary;
  B?: Summary | null;
  campaignToDate: Summary;
  filtersLabel: string;
  recent?: RecentVisitor[];
  fileName: string;
  /** Link halaman report live (dicantumkan di Excel) */
  liveUrl?: string;
  /** Laporan klien: Conversion ditampilkan sebagai "Diverifikasi SPG (PAHE aktif)". */
  clientLabels?: boolean;
}

/** Ganti istilah di semua teks lembar & grafik (hanya isi teks, bukan rumus/atribut). */
const CLIENT_TERMS: [RegExp, string][] = [
  [/CONVERSION/g, 'DIVERIFIKASI SPG (PAHE AKTIF)'],
  [/CONV\. RATE/g, 'VERIF. RATE'],
  [/Conversion/g, 'Diverifikasi SPG'],
  [/conversion/g, 'verifikasi SPG'],
  [/Conv\. rate/g, 'Verif. rate'],
  [/Conv\./g, 'Verif.'],
];
function relabelXml(xml: string, terms: [RegExp, string][]): string {
  return xml.replace(/>([^<]+)</g, (_m, t: string) => '>' + terms.reduce((acc, [re, to]) => acc.replace(re, to), t) + '<');
}

// ---------------------------------------------------------------------
// Utilitas XML lembar kerja
// ---------------------------------------------------------------------
type Dom = { parse: (s: string) => Document; serialize: (d: Document) => string };

function defaultDom(): Dom {
  return {
    parse: (s) => new DOMParser().parseFromString(s, 'application/xml'),
    serialize: (d) => new XMLSerializer().serializeToString(d),
  };
}

function colNum(ref: string): number {
  const letters = ref.match(/^[A-Z]+/)![0];
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}
function colName(n: number): string {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
const rowNum = (ref: string) => Number(ref.replace(/^[A-Z]+/, ''));

const els = (parent: Element | Document, tag: string): Element[] => Array.from(parent.getElementsByTagNameNS(NS, tag));

function clean(s: string): string {
  // Karakter kontrol tidak boleh ada di XML
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

function writeValue(doc: Document, c: Element, v: Cell) {
  while (c.firstChild) c.removeChild(c.firstChild);
  c.removeAttribute('t');
  if (v === null || v === undefined || v === '') return;
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return;
    const el = doc.createElementNS(NS, 'v');
    el.textContent = String(Math.round(v * 1e6) / 1e6);
    c.appendChild(el);
    return;
  }
  if (typeof v === 'object') {
    c.setAttribute('t', 'str');
    const f = doc.createElementNS(NS, 'f');
    f.textContent = v.formula;
    const val = doc.createElementNS(NS, 'v');
    val.textContent = clean(v.text);
    c.appendChild(f);
    c.appendChild(val);
    return;
  }
  c.setAttribute('t', 'inlineStr');
  const is = doc.createElementNS(NS, 'is');
  const t = doc.createElementNS(NS, 't');
  t.setAttribute('xml:space', 'preserve');
  t.textContent = clean(String(v));
  is.appendChild(t);
  c.appendChild(is);
}

function getRow(doc: Document, sheetData: Element, r: number): Element {
  const rows = els(sheetData, 'row');
  for (const row of rows) {
    const n = Number(row.getAttribute('r'));
    if (n === r) return row;
    if (n > r) {
      const nr = doc.createElementNS(NS, 'row');
      nr.setAttribute('r', String(r));
      sheetData.insertBefore(nr, row);
      return nr;
    }
  }
  const nr = doc.createElementNS(NS, 'row');
  nr.setAttribute('r', String(r));
  sheetData.appendChild(nr);
  return nr;
}

function getCell(doc: Document, row: Element, ref: string): Element {
  const target = colNum(ref);
  for (const c of els(row, 'c')) {
    const n = colNum(c.getAttribute('r')!);
    if (n === target) return c;
    if (n > target) {
      const nc = doc.createElementNS(NS, 'c');
      nc.setAttribute('r', ref);
      row.insertBefore(nc, c);
      return nc;
    }
  }
  const nc = doc.createElementNS(NS, 'c');
  nc.setAttribute('r', ref);
  row.appendChild(nc);
  return nc;
}

function setCells(doc: Document, values: Record<string, Cell>) {
  const sheetData = els(doc, 'sheetData')[0];
  for (const [ref, v] of Object.entries(values)) {
    const row = getRow(doc, sheetData, rowNum(ref));
    writeValue(doc, getCell(doc, row, ref), v);
  }
}

const START: number = (MAP as any).data_start || 2;

/** Tulis tabel mulai baris START. Gaya per kolom diambil dari baris START (isi) dan START+1 (total) template. */
function writeTable(doc: Document, cols: number, body: Cell[][], total?: Cell[]) {
  const sheetData = els(doc, 'sheetData')[0];
  const rows = els(sheetData, 'row');
  const styleOf = (r: number) => {
    const row = rows.find((x) => Number(x.getAttribute('r')) === r);
    const map: Record<number, string> = {};
    if (row) for (const c of els(row, 'c')) map[colNum(c.getAttribute('r')!)] = c.getAttribute('s') || '';
    return map;
  };
  const bodyStyle = styleOf(START);
  const totalStyle = styleOf(START + 1);
  const heights: Record<number, string | null> = {};
  for (const row of rows) {
    const r = Number(row.getAttribute('r'));
    if (r >= START) {
      heights[r] = row.getAttribute('ht');
      sheetData.removeChild(row);
    }
  }
  const all = total ? [...body, total] : body;
  all.forEach((vals, i) => {
    const r = i + START;
    const isTotal = !!total && i === all.length - 1;
    const style = isTotal ? totalStyle : bodyStyle;
    const row = doc.createElementNS(NS, 'row');
    row.setAttribute('r', String(r));
    row.setAttribute('ht', '18');
    row.setAttribute('customHeight', '1');
    for (let c = 1; c <= cols; c++) {
      const cell = doc.createElementNS(NS, 'c');
      cell.setAttribute('r', `${colName(c)}${r}`);
      if (style[c]) cell.setAttribute('s', style[c]);
      writeValue(doc, cell, vals[c - 1]);
      row.appendChild(cell);
    }
    sheetData.appendChild(row);
  });
  const dim = els(doc, 'dimension')[0];
  if (dim) dim.setAttribute('ref', `A1:${colName(cols)}${Math.max(START, all.length + START - 1)}`);
}

function hideRows(doc: Document, rows: number[]) {
  const sheetData = els(doc, 'sheetData')[0];
  for (const r of rows) getRow(doc, sheetData, r).setAttribute('hidden', '1');
}

const xmlEsc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const reEsc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Ganti batas baris rentang grafik untuk satu lembar, mis. 'Harian'!$A$2:$A$401 -> $A$2:$A$9 */
function setChartEnd(xml: string, sheet: string, end: number): string {
  const name = reEsc(xmlEsc(sheet));
  const re = new RegExp(`('${name}'!\\$[A-Z]+\\$${START}:\\$[A-Z]+\\$)(\\d+)`, 'g');
  return xml.replace(re, (_m, p1) => `${p1}${Math.max(START, end)}`);
}

// ---------------------------------------------------------------------
// Isi laporan
// ---------------------------------------------------------------------
const pct = (n: number) => `${(n * 100).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`;
const num = (n: number) => Math.round(n).toLocaleString('id-ID');
const rp = (n: number) => `Rp${num(n)}`;

/** Periode B dibanding Periode A, sama seperti di halaman web: (B − A) / A. */
function deltaText(a: number, b: number | undefined, fmt: (n: number) => string = num): string {
  if (b === undefined) return '';
  let change = '';
  if (!a) change = b ? '(baru)' : '(sama)';
  else {
    const d = (b - a) / a;
    change = Math.abs(d) < 0.0005 ? '(sama)' : `(${d > 0 ? '▲' : '▼'} ${pct(Math.abs(d))})`;
  }
  return `Periode B: ${fmt(b)} ${change}`;
}

const rowLabel = (r: Row) => (r.sub ? `${r.label} (${r.sub})` : r.label);

function rowCells(r: { label: string; agg: Agg }): Cell[] {
  const a = r.agg;
  return [r.label, a.reach, a.contact, a.conversion, rate(a.conversion, a.contact), a.visits, a.unique, a.rewards, avgSavings(a)];
}

function rowsSheet(rows: Row[], total: Agg): { body: Cell[][]; total: Cell[] } {
  return {
    body: rows.map((r) => rowCells({ label: rowLabel(r), agg: r.agg })),
    total: rowCells({ label: 'Total', agg: total }),
  };
}

export async function buildReportXlsx(opts: ExportOptions, deps?: { template?: ArrayBuffer; dom?: Dom }): Promise<Uint8Array> {
  const dom = deps?.dom || defaultDom();
  const tpl: ArrayBuffer = deps?.template ?? (await fetch(tplUrl).then((r) => r.arrayBuffer()));
  const zip = await JSZip.loadAsync(tpl);

  // Peta nama lembar -> file XML
  const wbDoc = dom.parse(await zip.file('xl/workbook.xml')!.async('string'));
  const rels = dom.parse(await zip.file('xl/_rels/workbook.xml.rels')!.async('string'));
  const relMap: Record<string, string> = {};
  for (const r of Array.from(rels.getElementsByTagName('Relationship'))) relMap[r.getAttribute('Id')!] = r.getAttribute('Target')!;
  const sheetFile: Record<string, string> = {};
  for (const s of els(wbDoc, 'sheet')) {
    const rid = s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || s.getAttribute('r:id')!;
    const target = relMap[rid].replace(/^\/?xl\//, '');
    sheetFile[s.getAttribute('name')!] = `xl/${target}`;
  }

  const docs: Record<string, Document> = {};
  const sheet = async (name: string) => {
    if (!docs[name]) docs[name] = dom.parse(await zip.file(sheetFile[name])!.async('string'));
    return docs[name];
  };

  const { settings: S, A, B, campaignToDate: C } = opts;
  const D = (MAP as any).dashboard;
  const ends: Record<string, number> = {};

  // ---- Harian
  let cumConv = 0;
  let cumTarget = 0;
  const harianBody: Cell[][] = A.daily.map((d) => {
    cumConv += d.agg.conversion;
    cumTarget += d.target.conversion;
    const no = campaignDayNo(S, d.day);
    return [
      fmtDay(d.day, { weekday: 'short', day: 'numeric', month: 'short' }),
      no >= 1 && no <= S.campaign.days ? no : null,
      d.agg.reach,
      d.agg.contact,
      d.agg.conversion,
      d.target.conversion,
      d.agg.visits,
      d.agg.unique,
      d.agg.rewards,
      avgSavings(d.agg),
      cumConv,
      cumTarget,
    ];
  });
  const T = A.total;
  writeTable(await sheet('Harian'), 12, harianBody, ['Total', null, T.reach, T.contact, T.conversion, A.target.conversion, T.visits, T.unique, T.rewards, avgSavings(T), cumConv, cumTarget]);
  ends['Harian'] = harianBody.length + START - 1;

  // ---- Lembar baris (unit, kategori, lokasi, mingguan, bulanan)
  const rowSheets: [string, Row[]][] = [
    ['Unit & Slot', A.unitSlot],
    ['Kategori POI', A.category],
    ['Lokasi', A.location],
    ['Mingguan', A.weeks],
    ['Bulanan', A.months],
  ];
  for (const [name, rows] of rowSheets) {
    const t = rowsSheet(rows, T);
    writeTable(await sheet(name), 9, t.body.length ? t.body : [['Belum ada data di periode ini']], t.total);
    ends[name] = Math.max(1, t.body.length) + START - 1;
  }

  // ---- Perbandingan
  if (B) {
    const n = Math.max(A.daily.length, B.daily.length);
    const body: Cell[][] = [];
    for (let i = 0; i < n; i++) {
      const a = A.daily[i];
      const b = B.daily[i];
      body.push([i + 1, a ? fmtDay(a.day) : null, a?.agg.conversion ?? null, a?.agg.visits ?? null, b ? fmtDay(b.day) : null, b?.agg.conversion ?? null, b?.agg.visits ?? null]);
    }
    writeTable(await sheet('Perbandingan'), 7, body, ['Total', fmtRange(A.from, A.to), A.total.conversion, A.total.visits, fmtRange(B.from, B.to), B.total.conversion, B.total.visits]);
    ends['Perbandingan'] = n + START - 1;
  } else {
    writeTable(await sheet('Perbandingan'), 7, [['Tidak ada periode pembanding. Pilih "Bandingkan periode" di halaman laporan sebelum mengunduh.']]);
    ends['Perbandingan'] = START;
  }

  // ---- Visitor
  const vis = opts.recent || [];
  writeTable(
    await sheet('Visitor'),
    10,
    vis.length
      ? vis.map((v) => [
          new Date(v.ts).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
          v.name,
          v.phone,
          v.loc,
          v.cat ? (v.cat in CAT ? CAT[v.cat] : v.cat) : '',
          v.unit,
          v.hours,
          v.status,
          v.savings,
          v.reward,
        ])
      : [['Daftar visitor tersamar hanya tersedia di unduhan halaman klien.']]
  );

  // ---- Subjudul lembar data
  const periodText = `Periode ${fmtRange(A.from, A.to)}${B ? ` · pembanding ${fmtRange(B.from, B.to)}` : ''} · Filter: ${opts.filtersLabel || 'semua data'}`;
  for (const name of ['Harian', 'Unit & Slot', 'Kategori POI', 'Lokasi', 'Mingguan', 'Bulanan', 'Perbandingan']) {
    setCells(await sheet(name), { A2: `${S.campaign.name} · ${periodText}` });
  }
  setCells(await sheet('Visitor'), {
    A2: vis.length ? `${vis.length} visitor terbaru di periode ini · nama depan & nomor WA disamarkan sesuai UU PDP` : 'Data visitor lengkap hanya di sistem internal tim proyek.',
  });

  // ---- Dashboard
  const dash: Record<string, Cell> = {};
  const now = new Date();
  dash[D.title] = S.campaign.name;
  dash[D.subtitle] = `${S.campaign.client} · Grab MODIS · Cek Boros`;
  dash[D.downloaded] = now.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' WIB';
  if (opts.liveUrl) dash[D.live_link] = { formula: `HYPERLINK("${opts.liveUrl.replace(/"/g, '')}","Buka laporan live ›")`, text: 'Buka laporan live ›' };
  dash[D.period] = fmtRange(A.from, A.to);
  dash[D.period_b] = B ? fmtRange(B.from, B.to) : 'Tidak dibandingkan';
  dash[D.filters] = opts.filtersLabel || 'Semua data';
  const today = C.to;
  const dayNo = campaignDayNo(S, today);
  dash[D.day_no] =
    dayNo < 1 ? `Belum mulai · mulai ${fmtDay(S.campaign.start, { day: 'numeric', month: 'short', year: 'numeric' })}` : dayNo > S.campaign.days ? `Selesai (${S.campaign.days} hari)` : `Hari ke-${dayNo} dari ${S.campaign.days}`;

  const t = D.tiles;
  const Bt = B?.total;
  const tile = (key: string, value: number, sub: string, a: number, b?: number, fmt?: (n: number) => string) => {
    dash[t[key].value] = value;
    dash[t[key].sub] = sub;
    dash[t[key].delta] = deltaText(a, b, fmt);
  };
  tile('reach', T.reach, `Target periode ${num(A.target.reach)} · ${pct(rate(T.reach, A.target.reach))}`, T.reach, Bt?.reach);
  tile('contact', T.contact, `Target periode ${num(A.target.contact)} · ${pct(rate(T.contact, A.target.contact))}`, T.contact, Bt?.contact);
  tile('conversion', T.conversion, `Target periode ${num(A.target.conversion)} · ${pct(rate(T.conversion, A.target.conversion))}`, T.conversion, Bt?.conversion);
  tile('rate', rate(T.contact, T.reach), `Conv. rate ${pct(rate(T.conversion, T.contact))}`, rate(T.contact, T.reach), Bt ? rate(Bt.contact, Bt.reach) : undefined, pct);
  tile('visits', T.visits, 'Total pendaftaran Cek Boros (setiap kunjungan dihitung)', T.visits, Bt?.visits);
  tile('unique', T.unique, T.visits ? `Orang berbeda · ${pct(rate(T.unique, T.visits))} dari visitor terdaftar` : 'Orang berbeda berdasarkan nomor WA', T.unique, Bt?.unique);

  const CTt = C.total;
  const prog: [number, number, number][] = [
    [CTt.reach, C.target.reach, S.targets.reach],
    [CTt.contact, C.target.contact, S.targets.contact],
    [CTt.conversion, C.target.conversion, S.targets.conversion],
  ];
  D.progress.forEach((row: Record<string, string>, i: number) => {
    const [act, tgtToday, tgtAll] = prog[i];
    dash[row['Aktual']] = act;
    dash[row['Target s/d hari ini']] = tgtToday;
    dash[row['% vs target hari ini']] = rate(act, tgtToday);
    dash[row['Target campaign']] = tgtAll;
    dash[row['% vs target campaign']] = rate(act, tgtAll);
  });

  D.status_rows.forEach((cells: string[], i: number) => {
    const r = A.status[i];
    dash[cells[0]] = r ? r.label : '';
    dash[cells[1]] = r ? r.agg.visits : null;
    dash[cells[2]] = r ? avgSavings(r.agg) : null;
  });
  const rewards = [...A.reward].sort((x, y) => y.agg.visits - x.agg.visits);
  D.reward_rows.forEach((cells: string[], i: number) => {
    const r = rewards[i];
    dash[cells[0]] = r ? r.label : i === 0 ? 'Belum ada stamp diberikan' : '';
    dash[cells[1]] = r ? r.agg.visits : null;
  });

  const unitMax: number = (MAP as any).unit_max;
  D.unit_rows.forEach((cells: string[], i: number) => {
    const isTotal = i === unitMax;
    const src = isTotal ? { label: 'Total', agg: T } : A.unitSlot[i] ? { label: rowLabel(A.unitSlot[i]), agg: A.unitSlot[i].agg } : null;
    const vals: Cell[] = src ? rowCells(src) : [i === 0 ? 'Belum ada data' : '', null, null, null, null, null, null, null, null];
    cells.forEach((ref, k) => (dash[ref] = vals[k]));
  });

  const stock = S.merch_stock;
  const merch: [string, number, number][] = [
    ['Merch Tier A', stock.a, CTt.a],
    ['Merch Tier B', stock.b, CTt.b],
    ['Merch Tier C', stock.c, CTt.c],
    ['Minuman / Refreshment', stock.drinks, CTt.drinks],
  ];
  const mTot = merch.reduce((acc, m) => [acc[0] + m[1], acc[1] + m[2]], [0, 0]);
  [...merch, ['Total', mTot[0], mTot[1]] as [string, number, number]].forEach((m, i) => {
    const cells: string[] = D.merch_rows[i];
    dash[cells[0]] = m[0];
    dash[cells[1]] = m[1];
    dash[cells[2]] = m[2];
    dash[cells[3]] = m[1] ? m[1] - m[2] : null;
    dash[cells[4]] = m[1] ? rate(m[2], m[1]) : null;
  });

  D.cat_rows.forEach((cells: string[], i: number) => {
    const isTotal = i === D.cat_rows.length - 1;
    const r = isTotal ? { label: 'Total', agg: T } : A.category[i];
    dash[cells[0]] = r ? r.label : '';
    dash[cells[1]] = r ? r.agg.visits : null;
    dash[cells[2]] = r ? r.agg.conversion : null;
    dash[cells[3]] = r ? rate(r.agg.visits, T.visits) : null;
  });

  dash[D.note] = S.live_sheet_url
    ? { formula: `HYPERLINK("${S.live_sheet_url.replace(/"/g, '')}","File ini adalah salinan saat diunduh. Versi Excel live (Google Sheets) yang selalu terbarui: klik di sini ›")`, text: 'File ini adalah salinan saat diunduh. Versi Excel live: klik di sini ›' }
    : 'File ini adalah salinan data saat diunduh. Untuk angka terbaru, buka link laporan live di pojok kanan atas.';

  const dashDoc = await sheet('Dashboard');
  setCells(dashDoc, dash);

  // Sembunyikan baris tabel yang kosong supaya rapi
  const hide: number[] = [];
  D.unit_rows.forEach((cells: string[], i: number) => {
    if (i < unitMax && i >= Math.max(1, A.unitSlot.length)) hide.push(rowNum(cells[0]));
  });
  D.reward_rows.forEach((cells: string[], i: number) => {
    if (i >= 4 && i >= rewards.length) hide.push(rowNum(cells[0]));
  });
  hideRows(dashDoc, hide);

  // ---- Simpan lembar
  for (const [name, doc] of Object.entries(docs)) zip.file(sheetFile[name], dom.serialize(doc));
  if (opts.clientLabels) {
    for (const path of Object.values(sheetFile)) {
      const f = zip.file(path);
      if (f) zip.file(path, relabelXml(await f.async('string'), CLIENT_TERMS));
    }
  }

  // ---- Rentang grafik
  for (const path of Object.keys(zip.files).filter((p) => /^xl\/charts\/chart\d+\.xml$/.test(p))) {
    let xml = await zip.file(path)!.async('string');
    for (const [name, end] of Object.entries(ends)) xml = setChartEnd(xml, name, end);
    if (opts.clientLabels) xml = relabelXml(xml, CLIENT_TERMS);
    zip.file(path, xml);
  }

  // Excel menghitung ulang saat dibuka (untuk rumus HYPERLINK)
  let wbXml = await zip.file('xl/workbook.xml')!.async('string');
  if (!/<calcPr/.test(wbXml)) wbXml = wbXml.replace('</workbook>', '<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>');
  zip.file('xl/workbook.xml', wbXml);

  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

const CAT: Record<string, string> = {
  Station: 'Stasiun',
  Campus: 'Kampus',
  Office: 'Perkantoran',
  'HOP & Public Space': 'HOP & Area Publik',
};

export async function exportReportXlsx(opts: ExportOptions) {
  const bytes = await buildReportXlsx(opts);
  const blob = new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = opts.fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
