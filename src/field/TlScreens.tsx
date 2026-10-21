import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, ClipboardCheck, Copy, MessageCircle, Package, Send, TriangleAlert } from 'lucide-react';
import {
  ConvType,
  DAILY_TARGET_PER_UNIT,
  FieldSession,
  ISSUE_CATEGORIES,
  MERCH,
  WELCOME_DRINKS,
  WELCOME_SNACKS,
  Reward,
  STOCK_ITEMS,
  StockKind,
  UnitToday,
  fieldApi,
  openingDefault,
  OPENING_MANUAL_ONLY,
  usageFromRewards,
  shiftInfo,
  shiftText,
} from './api';
import { enqueueOp, getContacts, getLog, groupPeople, getOps, onQueueChange, todayWIB } from './store';

/** Data hari ini untuk unit: server (semua tablet) bila online, ditambah yang masih antre di tablet ini. */
export function useUnitDay(session: FieldSession) {
  const [server, setServer] = useState<UnitToday | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const off = onQueueChange(() => setTick((t) => t + 1));
    return () => void off();
  }, []);
  useEffect(() => {
    if (!navigator.onLine) return;
    fieldApi.unitToday(session.token).then(setServer).catch(() => {});
  }, [session.token, tick]);

  return useMemo(() => {
    const day = todayWIB();
    const log = getLog().filter((e) => e.day === day && e.unit_id === session.unit_id);
    const queued = log.filter((e) => e.status === 'queued');
    const useServer = server && server.day === day;
    const base = useServer ? log.filter((e) => e.status === 'queued') : log.filter((e) => e.status !== 'conflict');
    const byType: Record<ConvType, number> = { pahe_new: 0, pahe_lapsed: 0, gb_hemat: 0 };
    const byReward: Partial<Record<Reward, number>> = {};
    const byMerch: Record<string, number> = {};
    let photobooth = 0;
    if (useServer) {
      Object.entries(server!.by_type).forEach(([k, v]) => (byType[k as ConvType] += v || 0));
      Object.entries(server!.by_reward).forEach(([k, v]) => (byReward[k as Reward] = (byReward[k as Reward] || 0) + (v || 0)));
      Object.entries(server!.by_merch || {}).forEach(([k, v]) => (byMerch[k] = (byMerch[k] || 0) + (v || 0)));
      photobooth += server!.photobooth || 0;
    }
    base.forEach((e) => {
      byType[e.type] += 1;
      byReward[e.reward] = (byReward[e.reward] || 0) + 1;
      if (e.reward2) byReward[e.reward2] = (byReward[e.reward2] || 0) + 1;
      [e.merch, e.merch2].forEach((m) => m && (byMerch[m] = (byMerch[m] || 0) + 1));
      if (e.photobooth) photobooth += 1;
    });
    // Hitungan conversion = per ORANG (nama + 4 digit sama digabung), bukan per submission
    const people = groupPeople(log.filter((e) => e.status !== 'conflict'));
    if (people.length) {
      byType.pahe_new = 0;
      byType.pahe_lapsed = 0;
      byType.gb_hemat = 0;
      people.forEach((g) => (byType[g.type] += 1));
    }
    // Stok: server + operasi tablet yang belum terkirim
    const stock: Record<string, number> = { ...(useServer ? server!.stock : {}) };
    getOps()
      .filter((o) => o.day === day && o.unit_id === session.unit_id && o.kind !== 'close' && o.kind !== 'issue' && o.kind !== 'boros' && (!useServer || !o.sent))
      .forEach((o) =>
        Object.entries(o.items || {}).forEach(([item, q]) => {
          const key = `${o.kind}:${item}`;
          // Opening & closing: nilai terakhir per item (simpan ulang = koreksi). Refill: ditambahkan.
          stock[key] = o.kind === 'refill' ? (stock[key] || 0) + q : q;
        }),
      );
    const venues = Array.from(new Set([...log.map((e) => e.poi), session.poi_location].filter(Boolean))) as string[];
    return { byType, byReward, byMerch, photobooth, stock, poolMix: useServer ? server!.pool_mix ?? null : null, prevClosing: useServer ? server!.prev_closing ?? null : null, whToday: useServer ? server!.wh_today ?? null : null, welcome: useServer ? server!.welcome ?? null : null, byHour: useServer ? server!.by_hour || {} : {}, openIssues: useServer ? server!.open_issues || 0 : 0, queued: queued.length, conflicts: useServer ? server!.conflicts : log.filter((e) => e.status === 'conflict').length, venues, online: Boolean(useServer) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server, tick, session.unit_id]);
}

export function stockRows(stock: Record<string, number>, byReward: Partial<Record<Reward, number>>, byMerch: Record<string, number> = {}, photobooth = 0) {
  const used = usageFromRewards(byReward, byMerch, photobooth);
  return STOCK_ITEMS.map((it) => {
    const opening = stock[`opening:${it.id}`] || 0;
    const refill = stock[`refill:${it.id}`] || 0;
    const hasClosing = `closing:${it.id}` in stock;
    const closing = stock[`closing:${it.id}`] || 0;
    const expected = opening + refill - used[it.id];
    const diff = hasClosing ? closing - expected : 0;
    const flag = hasClosing && opening + refill > 0 && Math.abs(diff) / (opening + refill) > 0.02;
    return { ...it, opening, refill, used: used[it.id], expected, closing, hasClosing, diff, flag };
  });
}

const Shell: React.FC<{ title: string; icon: React.ReactNode; onBack: () => void; children: React.ReactNode; footer?: React.ReactNode }> = ({ title, icon, onBack, children, footer }) => (
  <div className="min-h-[100dvh] bg-canvas flex flex-col">
    <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-line px-4 h-14 box-content pt-[env(safe-area-inset-top)] flex items-center gap-3">
      <button onClick={onBack} aria-label="Kembali" className="w-10 h-10 -ml-2 rounded-full hover:bg-canvas flex items-center justify-center">
        <ArrowLeft className="w-5 h-5" />
      </button>
      <h1 className="flex-1 font-display text-[18px] font-bold flex items-center gap-2">
        {icon} {title}
      </h1>
    </header>
    <div className="flex-1 w-full max-w-2xl mx-auto px-4 py-4 space-y-3 stagger">{children}</div>
    {footer && <div className="sticky bottom-0 z-20 bg-white/95 backdrop-blur border-t border-line p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"><div className="max-w-2xl mx-auto">{footer}</div></div>}
  </div>
);

// ---------------------------------------------------------------------
// Stok unit
// ---------------------------------------------------------------------
export const StockScreen: React.FC<{ session: FieldSession; onBack: () => void }> = ({ session, onBack }) => {
  const d = useUnitDay(session);
  const hasOpening = STOCK_ITEMS.some((it) => `opening:${it.id}` in d.stock);
  const [kind, setKind] = useState<StockKind>(hasOpening ? 'refill' : 'opening');
  const [form, setForm] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [dirty, setDirty] = useState(false);
  // Sumber isi otomatis opening: closing terakhir unit dan/atau kiriman gudang hari ini
  const hasSource = !OPENING_MANUAL_ONLY && Boolean((d.prevClosing && Object.keys(d.prevClosing).length) || (d.whToday && Object.keys(d.whToday).length));
  const sopPlan = openingDefault(session.shift, d.poolMix, { day: todayWIB(), welcome: d.welcome });
  const autoValues = hasSource ? openingDefault(session.shift, d.poolMix, { day: todayWIB(), welcome: d.welcome, prevClosing: d.prevClosing, whToday: d.whToday }) : null;
  // Nilai yang sudah tersimpan hari ini untuk opening / closing (untuk dikoreksi)
  const saved: Record<string, number> = kind === 'refill' ? {} : Object.fromEntries(STOCK_ITEMS.filter((it) => `${kind}:${it.id}` in d.stock).map((it) => [it.id, d.stock[`${kind}:${it.id}`]]));
  const hasSaved = Object.keys(saved).length > 0;
  const initial = hasSaved ? saved : kind === 'opening' && autoValues ? autoValues : {};
  const initialKey = JSON.stringify(initial);

  // Isi awal hanya saat ganti tab, atau saat data datang dan TL belum mengetik apa pun.
  // Refresh data di latar belakang TIDAK boleh menghapus angka yang sedang diketik.
  useEffect(() => {
    setDirty(false);
    setChecked(false);
    setMsg(null);
    setForm(Object.fromEntries(Object.entries(initial).map(([k, v]) => [k, String(v)])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, session.unit_id]);
  useEffect(() => {
    if (dirty) return;
    setForm(Object.fromEntries(Object.entries(initial).map(([k, v]) => [k, String(v)])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialKey]);

  const rows = stockRows(d.stock, d.byReward, d.byMerch, d.photobooth);
  const submit = () => {
    const items = Object.fromEntries(
      Object.entries(form)
        .filter(([, v]) => v !== '' && !Number.isNaN(Number(v)))
        .map(([k, v]) => [k, Math.max(0, Math.round(Number(v)))]),
    );
    // Koreksi: kirim hanya item yang angkanya berubah dari yang sudah tersimpan
    if (hasSaved) Object.keys(items).forEach((k) => saved[k] === items[k] && delete items[k]);
    if (!Object.keys(items).length) return setMsg(hasSaved ? 'Tidak ada angka yang berubah.' : 'Isi minimal satu item.');
    if (kind === 'opening' && !checked) return setMsg('Centang "Sudah dicocokkan dengan barang fisik" dulu.');
    enqueueOp(session, kind, { items });
    setDirty(false);
    setChecked(false);
    if (kind === 'refill') setForm({});
    setMsg(`${kind === 'opening' ? 'Opening' : kind === 'refill' ? 'Refill' : 'Closing'} tersimpan${navigator.onLine ? '' : ' di tablet, dikirim saat ada sinyal'}.${kind === 'refill' ? '' : ' Bila ada yang salah, ubah angkanya lalu simpan lagi (menggantikan, tidak dobel).'}`)
  };

  const label: Record<StockKind, string> = { opening: 'Opening', refill: 'Refill', closing: 'Closing' };
  return (
    <Shell
      title="Stok unit"
      icon={<Package className="w-5 h-5 text-grab" />}
      onBack={onBack}
      footer={
        <div className="space-y-2">
          {kind === 'opening' && (
            <label className="flex items-center gap-3 rounded-2xl border-2 px-3 h-12 text-[14px] font-semibold border-[#E1E4E8] has-[:checked]:border-grab has-[:checked]:bg-grab-tint">
              <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="w-5 h-5 accent-[#00B14F]" />
              Sudah dicocokkan dengan barang fisik
            </label>
          )}
          <button
            onClick={submit}
            disabled={kind === 'opening' && !checked}
            className="w-full h-14 rounded-2xl bg-grab-cta text-white font-bold text-[17px] flex items-center justify-center gap-2 active:scale-[0.99] disabled:bg-[#C9CDD2]"
          >
            <Check className="w-5 h-5" /> Simpan {label[kind].toLowerCase()}
          </button>
        </div>
      }
    >
      <div className="bg-white rounded-3xl p-1.5 grid grid-cols-3 gap-1">
        {(['opening', 'refill', 'closing'] as StockKind[]).map((k) => (
          <button key={k} onClick={() => setKind(k)} aria-pressed={kind === k} className={`h-11 rounded-2xl text-[15px] font-semibold ${kind === k ? 'bg-grab-cta text-white' : 'text-ink-2'}`}>
            {label[k]}
          </button>
        ))}
      </div>
      <p className="text-[13px] text-ink-2 px-1">
        {kind === 'opening'
          ? hasSaved
            ? 'Opening hari ini sudah tersimpan (angka di bawah). Ubah bila salah lalu simpan lagi. Stok dihitung per unit per hari, jadi pindah venue tidak perlu opening ulang.'
            : OPENING_MANUAL_ONLY
            ? 'Hitung semua barang fisik di unit, lalu isi jumlahnya di tiap kolom. Cukup sekali per hari di venue pertama, pindah venue tidak perlu opening ulang.'
            : d.prevClosing && Object.keys(d.prevClosing).length
            ? `Terisi otomatis dari closing terakhir${d.whToday && Object.keys(d.whToday).length ? ' + kiriman gudang hari ini' : ''}. Cukup cocokkan dengan barang fisik, ubah bila beda.`
            : d.whToday && Object.keys(d.whToday).length
            ? 'Terisi otomatis dari kiriman gudang hari ini (dicatat office). Cocokkan dengan barang fisik, ubah bila beda.'
            : 'Belum ada data closing / kiriman gudang. Hitung barang fisik dan isi semua kolom (angka SOP di bawah kolom hanya patokan).'
          : kind === 'refill'
          ? 'Isi jumlah yang ditambahkan dari gudang / mobil.'
          : hasSaved
          ? 'Closing hari ini sudah tersimpan. Ubah bila salah lalu simpan lagi.'
          : 'Hitung sisa stok saat tutup (di venue terakhir hari ini). App menghitung selisih otomatis.'}
      </p>
      {msg && <p className="text-[14px] font-semibold text-grab-deep bg-grab-tint rounded-2xl p-3">{msg}</p>}
      <section className="bg-white rounded-3xl p-4 grid grid-cols-2 gap-3">
        {STOCK_ITEMS.map((it) => (
          <label key={it.id} className="block">
            <span className="block text-[13px] font-semibold text-ink-2">{it.label}</span>
            <input
              inputMode="numeric"
              value={form[it.id] ?? ''}
              onChange={(e) => {
                setDirty(true);
                setForm((f) => ({ ...f, [it.id]: e.target.value.replace(/\D/g, '').slice(0, 5) }));
              }}
              placeholder={kind === 'closing' ? String(Math.max(0, rows.find((r) => r.id === it.id)!.expected)) : kind === 'opening' && !autoValues ? 'hitung' : '0'}
              className={`mt-1 w-full h-12 px-3 rounded-xl bg-canvas text-[18px] font-semibold outline-none border-2 focus:border-grab focus:bg-white ${
                kind === 'opening' && autoValues && (form[it.id] ?? '') !== String(autoValues[it.id] ?? '') && (form[it.id] ?? '') !== '' ? 'border-modis-orange' : 'border-transparent'
              }`}
            />
            {kind === 'opening' && !autoValues && !OPENING_MANUAL_ONLY && sopPlan[it.id] !== undefined && <span className="block text-[11px] text-ink-3 mt-0.5">SOP: {sopPlan[it.id]}</span>}
            {kind === 'opening' && autoValues && (form[it.id] ?? '') !== String(autoValues[it.id] ?? '') && (form[it.id] ?? '') !== '' && (
              <span className="block text-[11px] text-[#8A5300] mt-0.5">sistem: {autoValues[it.id] ?? 0}</span>
            )}
          </label>
        ))}
      </section>

      <section className="bg-white rounded-3xl overflow-hidden">
        <h2 className="px-4 pt-4 pb-2 text-[16px] font-bold">Rekap stok hari ini</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] tabular-nums">
            <thead className="bg-canvas text-ink-2 text-[11px] uppercase">
              <tr>
                <th className="text-left px-3 py-2">Item</th>
                <th className="text-right px-2">Open</th>
                <th className="text-right px-2">Refill</th>
                <th className="text-right px-2">Pakai</th>
                <th className="text-right px-2">Harus</th>
                <th className="text-right px-2">Closing</th>
                <th className="text-right px-3">Selisih</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id} className={r.flag ? 'bg-[#FDECEA]' : ''}>
                  <td className="px-3 py-2 font-semibold">{r.label}</td>
                  <td className="text-right px-2">{r.opening}</td>
                  <td className="text-right px-2">{r.refill}</td>
                  <td className="text-right px-2">{r.used}</td>
                  <td className="text-right px-2">{r.expected}</td>
                  <td className="text-right px-2">{r.hasClosing ? r.closing : '-'}</td>
                  <td className={`text-right px-3 font-bold ${r.flag ? 'text-modis-red' : ''}`}>
                    {r.hasClosing ? (r.diff > 0 ? `+${r.diff}` : r.diff) : '-'}
                    {r.flag && <TriangleAlert className="inline w-3.5 h-3.5 ml-1" />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-4 py-3 text-[12px] text-ink-3">Pakai = dari reward yang diinput di app (permen = 5 per kupon candy). Selisih lebih dari 2% ditandai merah.</p>
      </section>
    </Shell>
  );
};

// ---------------------------------------------------------------------
// Close day
// ---------------------------------------------------------------------
const fmtDay = (key: string) => {
  const [y, m, dd] = key.split('-').map(Number);
  return new Date(y, m - 1, dd).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
};
const nf = (n: number) => n.toLocaleString('id-ID');

export const CloseDayScreen: React.FC<{ session: FieldSession; onBack: () => void }> = ({ session, onBack }) => {
  const d = useUnitDay(session);
  const day = todayWIB();
  const already = getOps().find((o) => o.kind === 'close' && o.day === day && o.unit_id === session.unit_id);
  const [reach, setReach] = useState<string>(String((already?.close?.reach as number) || ''));
  // Contacts terisi otomatis dari jumlah Cek Boros di tablet ini; TL tinggal koreksi bila perlu
  const [contacts, setContacts] = useState<string>(already?.close?.contacts !== undefined ? String(already.close.contacts) : getContacts(session.unit_id) ? String(getContacts(session.unit_id)) : '');
  const [notes, setNotes] = useState<string>(String(already?.close?.notes || ''));
  const [copied, setCopied] = useState(false);
  const [done, setDone] = useState(Boolean(already));

  const total = d.byType.pahe_new + d.byType.pahe_lapsed + d.byType.gb_hemat;
  const r = (k: Reward) => d.byReward[k] || 0;
  const rows = stockRows(d.stock, d.byReward, d.byMerch, d.photobooth);
  const flagged = rows.filter((x) => x.flag);
  const missingClosing = rows.filter((x) => (x.opening || x.refill) && !x.hasClosing);

  // Format mengikuti tab Daily Report di [EXT] Project Tracker (satu baris per item)
  const capsules = r('candy') + r('tier_c') + r('tier_b') + r('tier_a');
  const shiftTxt = shiftText(session.shift);
  const text = [
    `*Daily Report Grab MODIS*`,
    `${fmtDay(day)} · ${session.unit_name}`,
    `TL: ${session.spg_name}`,
    ``,
    `Shift: ${shiftTxt}`,
    `Venue 1: ${d.venues[0] || '-'}`,
    ...(session.unit_id === 'mobil' ? [`Venue 2: ${d.venues[1] || '-'}`] : []),
    `Reach (pax): ${nf(Number(reach) || 0)}`,
    `Contacts (pax): ${nf(Number(contacts) || 0)}`,
    `PaHe new: ${nf(d.byType.pahe_new)}`,
    `PaHe Churned: ${nf(d.byType.pahe_lapsed)}`,
    `GB Hemat ride: ${nf(d.byType.gb_hemat)}`,
    `Welcome given: ${nf(r('snack') + r('drink'))}`,
    `Capsules drawn: ${nf(capsules)}`,
    `Tier C: ${nf(r('tier_c'))}`,
    `Tier B: ${nf(r('tier_b'))}`,
    `Tier A: ${nf(r('tier_a'))}`,
    `Candy draws: ${nf(r('candy'))}`,
    `Photobooth prints: ${nf(d.photobooth)}`,
    `Issue / note: ${notes.trim() || '-'}`,
    ``,
    `Conversion hari ini: ${nf(total)} / target ${DAILY_TARGET_PER_UNIT} (${Math.round((total / DAILY_TARGET_PER_UNIT) * 100)}%)`,
    `Stok: ${flagged.length ? `${flagged.length} item selisih lebih dari 2%` : 'sesuai'}`,
    ...flagged.map((x) => `- ${x.label}: closing ${x.closing}, seharusnya ${x.expected} (selisih ${x.diff > 0 ? '+' : ''}${x.diff})`),
    ...(d.conflicts ? [`Double claim ditandai: ${d.conflicts}`] : []),
  ].join('\n');

  const submit = () => {
    enqueueOp(session, 'close', {
      close: {
        reach: Number(reach) || 0,
        contacts: Number(contacts) || 0,
        notes: notes.trim(),
        summary: { day, by_type: d.byType, by_reward: d.byReward, photobooth: d.photobooth, conflicts: d.conflicts, venues: d.venues, stock: rows.map(({ id, opening, refill, used, closing, diff, flag }) => ({ id, opening, refill, used, closing, diff, flag })), text },
      },
    });
    setDone(true);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const inp = 'mt-1 w-full h-12 px-3 rounded-xl bg-canvas text-[18px] font-semibold outline-none border-2 border-transparent focus:border-grab focus:bg-white';
  return (
    <Shell
      title="Close day"
      icon={<ClipboardCheck className="w-5 h-5 text-grab" />}
      onBack={onBack}
      footer={
        <div className="grid grid-cols-2 gap-2">
          <button onClick={copy} className="h-14 rounded-2xl border-2 border-grab text-grab-deep font-bold text-[15px] flex items-center justify-center gap-2">
            {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />} {copied ? 'Tersalin' : 'Salin teks WA'}
          </button>
          <button onClick={submit} className="h-14 rounded-2xl bg-grab-cta text-white font-bold text-[15px] flex items-center justify-center gap-2">
            <Send className="w-5 h-5" /> {done ? 'Kirim ulang' : 'Kirim close day'}
          </button>
        </div>
      }
    >
      {done && (
        <p className="text-[14px] font-semibold text-grab-deep bg-grab-tint rounded-2xl p-3">
          Close day tersimpan{navigator.onLine ? ' dan dikirim' : ' di tablet, dikirim saat ada sinyal'}. Salin teks lalu kirim ke grup internal.
        </p>
      )}
      {(d.queued > 0 || missingClosing.length > 0) && (
        <div className="text-[13px] bg-[#FFF3E0] rounded-2xl p-3 space-y-1">
          {d.queued > 0 && (
            <p className="flex items-start gap-2">
              <TriangleAlert className="w-4 h-4 text-modis-orange shrink-0 mt-0.5" /> {d.queued} data di tablet ini belum terkirim. Cari sinyal lalu sync sebelum close day.
            </p>
          )}
          {missingClosing.length > 0 && (
            <p className="flex items-start gap-2">
              <TriangleAlert className="w-4 h-4 text-modis-orange shrink-0 mt-0.5" /> Closing stok belum diisi untuk {missingClosing.length} item. Isi di menu Stok unit.
            </p>
          )}
        </div>
      )}

      <section className="bg-white rounded-3xl p-4 grid grid-cols-2 gap-3">
        <label className="block">
          <span className="block text-[13px] font-semibold text-ink-2">Reach (hitung manual)</span>
          <input inputMode="numeric" value={reach} onChange={(e) => setReach(e.target.value.replace(/\D/g, '').slice(0, 6))} className={inp} />
        </label>
        <label className="block">
          <span className="block text-[13px] font-semibold text-ink-2">Contacts (orang yang diajak bicara)</span>
          <input inputMode="numeric" value={contacts} onChange={(e) => setContacts(e.target.value.replace(/\D/g, '').slice(0, 6))} className={inp} />
          <span className="block text-[11px] text-ink-3 mt-1">Terisi otomatis dari Cek Boros di tablet ini ({getContacts(session.unit_id)}x). Tambahkan bila ada customer yang diajak bicara tanpa Cek Boros / dari tablet lain.</span>
        </label>
        <label className="block col-span-2">
          <span className="block text-[13px] font-semibold text-ink-2">Catatan / issue</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value.slice(0, 500))} rows={2} className="mt-1 w-full p-3 rounded-xl bg-canvas text-[15px] outline-none border-2 border-transparent focus:border-grab focus:bg-white" />
        </label>
      </section>

      <section className="bg-white rounded-3xl p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[16px] font-bold">Ringkasan</h2>
          <span className="text-[12px] text-ink-3">{d.online ? 'semua tablet unit' : 'tablet ini (offline)'}</span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {[
            ['Conversion', total],
            ['PaHe New', d.byType.pahe_new],
            ['PaHe Churned', d.byType.pahe_lapsed],
            ['GB Hemat', d.byType.gb_hemat],
            ['Photobooth', d.photobooth],
            ['Double claim', d.conflicts],
          ].map(([k, v]) => (
            <div key={String(k)} className="rounded-2xl bg-canvas p-3">
              <p className="text-[12px] text-ink-2">{k}</p>
              <p className="font-display text-[22px] font-extrabold tabular-nums">{nf(Number(v))}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white rounded-3xl p-4">
        <h2 className="text-[16px] font-bold flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-grab" /> Teks untuk grup WA
        </h2>
        <pre className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed bg-canvas rounded-2xl p-3 font-sans">{text}</pre>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(text)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 h-12 rounded-2xl bg-[#25D366] text-white font-bold text-[15px] flex items-center justify-center gap-2"
        >
          <MessageCircle className="w-5 h-5" /> Buka WhatsApp
        </a>
      </section>
    </Shell>
  );
};

// ---------------------------------------------------------------------
// Sisa stok unit (SPG & TL, hanya lihat)
// ---------------------------------------------------------------------
export const StockViewScreen: React.FC<{ session: FieldSession; onBack: () => void; onOpenStock?: () => void }> = ({ session, onBack, onOpenStock }) => {
  const d = useUnitDay(session);
  const rows = stockRows(d.stock, d.byReward, d.byMerch, d.photobooth);
  const hasAny = rows.some((r) => r.opening + r.refill > 0);
  const plan = openingDefault(session.shift, d.poolMix, { day: todayWIB(), welcome: d.welcome });
  return (
    <Shell
      title="Sisa stok unit"
      icon={<Package className="w-5 h-5 text-grab" />}
      onBack={onBack}
      footer={
        onOpenStock ? (
          <button onClick={onOpenStock} className="w-full h-14 rounded-2xl bg-grab-cta text-white font-bold text-[17px] flex items-center justify-center gap-2">
            <Package className="w-5 h-5" /> Input opening / refill / closing
          </button>
        ) : undefined
      }
    >
      {!hasAny ? (
        <p className="bg-[#FFF3E0] rounded-2xl p-3 text-[14px] flex items-start gap-2">
          <TriangleAlert className="w-4 h-4 text-modis-orange shrink-0 mt-0.5" />
          Opening stok hari ini belum diinput Team Leader{d.online ? '' : ' (atau tablet sedang offline)'}.
        </p>
      ) : (
        <p className="text-[13px] text-ink-2 px-1">Sisa = opening + refill − reward yang sudah diinput hari ini. Angka perkiraan; hitungan fisik tetap di closing TL.</p>
      )}
      <section className="bg-white rounded-3xl divide-y divide-line">
        {rows
          .filter((r) => r.id !== 'stamp_card')
          .map((r) => {
            const inn = r.opening + r.refill;
            const left = Math.max(0, r.expected);
            const low = inn > 0 && (left <= 0 || left / inn <= 0.15);
            const pct = inn > 0 ? Math.min(100, (left / inn) * 100) : 0;
            return (
              <div key={r.id} className="px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[14px] font-semibold">{r.label}</span>
                  <span className={`font-display text-[20px] font-extrabold tabular-nums ${low ? 'text-modis-red' : ''}`}>
                    {inn > 0 ? left : '-'}
                    <span className="text-[12px] font-medium text-ink-3"> / {inn || plan[r.id] || 0}</span>
                  </span>
                </div>
                <div className="mt-1.5 h-2 rounded-full bg-canvas overflow-hidden">
                  <div className={`h-full rounded-full ${low ? 'bg-modis-red' : 'bg-grab'}`} style={{ width: `${pct}%` }} />
                </div>
                <p className="mt-1 text-[12px] text-ink-3">
                  Terpakai {r.used}
                  {low ? (left <= 0 ? ' · HABIS, minta refill' : ' · hampir habis, minta refill') : ''}
                </p>
              </div>
            );
          })}
      </section>
      {d.poolMix && (
        <p className="text-[12px] text-ink-3 px-1">
          Rencana kapsul per hari dari office: Candy {plan.kapsul_candy} · C {plan.kapsul_c} · B {plan.kapsul_b} · A {plan.kapsul_a}
        </p>
      )}
    </Shell>
  );
};

/** Sisa stok per jenis reward (untuk peringatan di form customer). null = belum ada opening. */
export function rewardLeft(d: ReturnType<typeof useUnitDay>): Record<string, number> | null {
  const rows = stockRows(d.stock, d.byReward, d.byMerch, d.photobooth);
  if (!rows.some((r) => r.opening + r.refill > 0)) return null;
  // Hanya dilaporkan bila menipis (≤15% dari stok masuk) atau habis
  const get = (id: string) => {
    const r = rows.find((x) => x.id === id);
    if (!r) return Infinity;
    const inn = r.opening + r.refill;
    const left = Math.max(0, r.expected);
    return inn > 0 && (left <= 0 || left / inn <= 0.15) ? left : Infinity;
  };
  const out: Record<string, number> = {
    candy: get('kapsul_candy'),
    tier_c: get('kapsul_c'),
    tier_b: get('kapsul_b'),
    tier_a: get('kapsul_a'),
  };
  [...MERCH.tier_c, ...MERCH.tier_b, ...MERCH.tier_a, ...WELCOME_SNACKS, ...WELCOME_DRINKS].forEach((m) => (out[m.id] = get(m.id)));
  return out;
}

// ---------------------------------------------------------------------
// Laporan issue lapangan
// ---------------------------------------------------------------------
export const IssueScreen: React.FC<{ session: FieldSession; onBack: () => void }> = ({ session, onBack }) => {
  const [cat, setCat] = useState<string>('');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const off = onQueueChange(() => setTick((t) => t + 1));
    return () => void off();
  }, []);
  const day = todayWIB();
  const mine = useMemo(
    () => getOps().filter((o) => o.kind === 'issue' && o.day === day && o.unit_id === session.unit_id).reverse(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tick, day, session.unit_id],
  );
  const ok = cat && note.trim().length >= 5;
  const submit = () => {
    if (!ok) return;
    enqueueOp(session, 'issue', { issue: { category: cat, note: note.trim(), poi_location: session.poi_location } });
    setMsg(`Issue terkirim ke office${navigator.onLine ? '' : ' saat ada sinyal'}.`);
    setCat('');
    setNote('');
    setTick((t) => t + 1);
  };
  return (
    <Shell
      title="Laporkan issue"
      icon={<TriangleAlert className="w-5 h-5 text-modis-orange" />}
      onBack={onBack}
      footer={
        <button onClick={submit} disabled={!ok} className="w-full h-14 rounded-2xl bg-grab-cta text-white font-bold text-[17px] disabled:bg-[#C9CDD2] flex items-center justify-center gap-2">
          <Send className="w-5 h-5" /> {cat ? (note.trim().length >= 5 ? 'Kirim ke office' : 'Tulis keterangan singkat') : 'Pilih jenis issue'}
        </button>
      }
    >
      <p className="text-[13px] text-ink-2 px-1">Untuk kendala saat shift: stok, tablet, sinyal, venue, customer. Office langsung melihatnya di dashboard.</p>
      {msg && <p className="text-[14px] font-semibold text-grab-deep bg-grab-tint rounded-2xl p-3">{msg}</p>}
      <section className="bg-white rounded-3xl p-4 space-y-3">
        <h2 className="text-[15px] font-bold">Jenis issue</h2>
        <div className="flex flex-wrap gap-2">
          {ISSUE_CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              aria-pressed={cat === c}
              className={`h-10 px-3.5 rounded-full border-2 text-[14px] font-semibold ${cat === c ? 'border-grab bg-grab-tint text-grab-deep' : 'border-[#E1E4E8]'}`}
            >
              {c}
            </button>
          ))}
        </div>
        <label className="block">
          <span className="block text-[15px] font-bold mb-1.5">Keterangan</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 1000))}
            rows={4}
            placeholder="Contoh: kupon Tier B habis jam 14.00, sudah minta refill ke gudang"
            className="w-full p-3 rounded-2xl bg-canvas text-[15px] outline-none border-2 border-transparent focus:border-grab focus:bg-white"
          />
        </label>
        <p className="text-[12px] text-ink-3">
          {session.unit_name} · {session.poi_location || 'venue belum dipilih'} · {session.spg_name}
        </p>
      </section>
      {mine.length > 0 && (
        <section className="bg-white rounded-3xl divide-y divide-line">
          <h2 className="px-4 pt-4 pb-2 text-[15px] font-bold">Issue hari ini dari tablet ini</h2>
          {mine.map((o) => (
            <div key={o.op} className="px-4 py-3">
              <p className="text-[14px] font-semibold">
                {o.issue?.category}{' '}
                <span className="text-[12px] font-normal text-ink-3">
                  · {new Date(o.at).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' })} · {o.sent ? 'terkirim' : 'belum terkirim'}
                </span>
              </p>
              <p className="text-[13px] text-ink-2">{o.issue?.note}</p>
            </div>
          ))}
        </section>
      )}
    </Shell>
  );
};

// ---------------------------------------------------------------------
// Progres per jam (dashboard TL)
// ---------------------------------------------------------------------
export const HourlyCard: React.FC<{ session: FieldSession }> = ({ session }) => {
  const d = useUnitDay(session);
  const day = todayWIB();
  const counts: Record<number, number> = {};
  Object.entries(d.byHour || {}).forEach(([h, n]) => (counts[Number(h)] = (counts[Number(h)] || 0) + (n as number)));
  getLog()
    .filter((e) => e.day === day && e.unit_id === session.unit_id && (d.online ? e.status === 'queued' : e.status !== 'conflict'))
    .forEach((e) => {
      const h = Number(new Date(e.at).toLocaleString('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', hour12: false }));
      counts[h] = (counts[h] || 0) + 1;
    });
  const si = shiftInfo(session.shift);
  const start = Math.floor(si.start);
  const hours = Array.from({ length: Math.ceil(si.end) - start }, (_, i) => start + i);
  const perHour = Math.ceil(DAILY_TARGET_PER_UNIT / 10);
  const max = Math.max(perHour, ...hours.map((h) => counts[h] || 0));
  const nowH = Number(new Date().toLocaleString('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', hour12: false }));
  return (
    <section className="bg-white rounded-3xl p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[16px] font-bold">Per jam</h2>
        <span className="text-[12px] text-ink-3">target ±{perHour}/jam</span>
      </div>
      <div className="mt-3 flex items-end gap-1.5 h-28" role="img" aria-label="Conversion per jam">
        {hours.map((h) => {
          const n = counts[h] || 0;
          const hit = n >= perHour;
          return (
            <div key={h} className="flex-1 flex flex-col items-center justify-end h-full gap-1">
              <span className="text-[11px] font-semibold tabular-nums text-ink-2">{n || ''}</span>
              <div
                className={`w-full rounded-t-md ${h === nowH ? 'ring-2 ring-modis-yellow' : ''} ${hit ? 'bg-grab' : n ? 'bg-[#8FD9AE]' : 'bg-canvas'}`}
                style={{ height: `${Math.max(4, (n / max) * 100)}%` }}
              />
              <span className={`text-[11px] tabular-nums ${h === nowH ? 'font-bold text-ink' : 'text-ink-3'}`}>{String(h).padStart(2, '0')}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
};
