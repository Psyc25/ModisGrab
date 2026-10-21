import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, Pencil, RefreshCw, Trash2, X, XCircle } from 'lucide-react';
import { deleteSlotReportRemote, fetchSlotReportsRange, updateSlotReportRemote } from '../services/supabase';
import { useRealtime } from '../hooks/useRealtime';
import { getSupabaseClient } from '../services/supabase';
import { UNIT_SLOTS, Unit, scheduleFor, scheduledLocation } from '../data/schedule';
import { PlottingRaw, planFor } from '../data/plotting';

/**
 * Monitor laporan slot per hari dibanding Running Schedule,
 * plus daftar laporan yang bisa dikoreksi / dihapus owner (tercatat siapa & kapan).
 */

const nowWIB = () => {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const parts = Object.fromEntries(f.formatToParts(new Date()).map((p) => [p.type, p.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
};
const addDays = (key: string, n: number) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const fmtDay = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' });
};
const startOf = (hours: string) => (hours || '').slice(0, 5).replace('.', ':');

type Status = 'sent' | 'running' | 'upcoming' | 'missing' | 'off';

const NUM_FIELDS: { key: string; label: string }[] = [
  { key: 'reach', label: 'Reach' },
  { key: 'contact', label: 'Contact' },
  { key: 'conversion', label: 'Conversion' },
  { key: 'merch_a', label: 'Merch A' },
  { key: 'merch_b', label: 'Merch B' },
  { key: 'merch_c', label: 'Merch C' },
  { key: 'drinks', label: 'Minuman' },
];

export const SlotPanel: React.FC<{ from: string; to: string; canEdit: boolean; editorLabel: string }> = ({ from, to, canEdit, editorLabel }) => {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<any | null>(null);
  const [deleting, setDeleting] = useState<any | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchSlotReportsRange(from, to));
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'Gagal memuat laporan slot.');
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  // Aktivitas crew hari ini dari aplikasi crew baru (realtime)
  const [live, setLive] = useState<any[]>([]);
  const loadLive = useCallback(async () => {
    const sb = getSupabaseClient();
    if (!sb) return;
    const { data } = await sb
      .from('modis_conversions')
      .select('unit_id,shift,spg_name,poi_location,status,created_at')
      .eq('claim_day', nowWIB().day)
      .order('created_at', { ascending: false })
      .limit(2000);
    setLive(data || []);
  }, []);
  // Plotting terbaru yang dikirim office (jatuh ke snapshot bawaan bila belum ada)
  const [plot, setPlot] = useState<PlottingRaw | null>(null);
  const loadPlot = useCallback(async () => {
    const sb = getSupabaseClient();
    if (!sb) return;
    const { data } = await sb.rpc('modis_f1_plotting', {});
    const d = data as { days?: PlottingRaw } | null;
    if (d?.days) setPlot(d.days);
  }, []);
  const reloadAll = useCallback(() => {
    void load();
    void loadLive();
    void loadPlot();
  }, [load, loadLive, loadPlot]);
  useEffect(() => {
    reloadAll();
    const t = window.setInterval(reloadAll, 15_000);
    return () => window.clearInterval(t);
  }, [reloadAll]);
  useRealtime(['modis_slot_reports', 'modis_conversions'], reloadAll);
  const liveByUnit = useMemo(() => {
    const names: Record<string, string> = { mobil: 'Mobil Diskon', kiosk1: 'Kiosk Diskon 1', kiosk2: 'Kiosk Diskon 2' };
    return Object.keys(names).map((id) => {
      const r = live.filter((x) => x.unit_id === id && x.status !== 'conflict');
      const plan = planFor(plot, nowWIB().day, id);
      const norm = (x?: string | null) => (x || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const planned = plan?.venues.map((v) => v.name) || [];
      const places = Array.from(new Set(r.map((x) => x.poi_location).filter(Boolean))) as string[];
      const offPlan = planned.length > 0 && places.some((pl) => !planned.some((pv) => norm(pv).includes(norm(pl)) || norm(pl).includes(norm(pv))));
      return {
        id,
        name: names[id],
        plan,
        offPlan,
        n: r.length,
        last: r[0]?.created_at as string | undefined,
        poi: r[0]?.poi_location as string | undefined,
        shifts: Array.from(new Set(r.map((x) => (x.shift === 'AM' ? 'Pagi' : x.shift === 'PM' ? 'Siang–Malam' : x.shift)))),
        spgs: Array.from(new Set(r.map((x) => x.spg_name))),
      };
    });
  }, [live, plot]);

  const days = useMemo(() => {
    const out: string[] = [];
    for (let d = to; d >= from && out.length < 31; d = addDays(d, -1)) out.push(d);
    return out;
  }, [from, to]);

  const now = nowWIB();
  const units = Object.keys(UNIT_SLOTS) as Unit[];

  const matrix = useMemo(
    () =>
      days.map((day) => {
        const sched = scheduleFor(day);
        const cells = units.flatMap((u) =>
          UNIT_SLOTS[u].map((s) => {
            const reps = rows.filter((r) => String(r.report_date) === day && r.unit_type === u && startOf(r.duty_hours) === s.start);
            const planned = sched ? sched[s.col] : '';
            let status: Status;
            if (reps.length) status = 'sent';
            else if (!sched || !planned) status = 'off';
            else if (day > now.day || (day === now.day && now.time < s.start)) status = 'upcoming';
            else if (day === now.day && now.time <= s.end) status = 'running';
            else status = 'missing';
            const mismatch = reps.some((r) => planned && r.poi_location && r.poi_location !== planned);
            return { unit: u, slot: s, reps, planned, status, mismatch };
          }),
        );
        return { day, area: sched?.[1] || '', cells };
      }),
    [days, rows, now.day, now.time],
  );

  const totals = useMemo(() => {
    const t = { sent: 0, missing: 0, mismatch: 0 };
    matrix.forEach((d) => d.cells.forEach((c) => (c.status === 'sent' && t.sent++, c.status === 'missing' && t.missing++, c.mismatch && t.mismatch++)));
    return t;
  }, [matrix]);

  const statusUi: Record<Status, { cls: string; icon: React.ReactNode; label: string }> = {
    sent: { cls: 'bg-grab-tint text-grab-deep', icon: <CheckCircle2 className="w-4 h-4" />, label: 'Masuk' },
    running: { cls: 'bg-[#E8F0FE] text-[#1A56DB]', icon: <Clock3 className="w-4 h-4" />, label: 'Berjalan' },
    upcoming: { cls: 'bg-canvas text-ink-3', icon: <Clock3 className="w-4 h-4" />, label: 'Belum mulai' },
    missing: { cls: 'bg-[#FDECEA] text-modis-red', icon: <XCircle className="w-4 h-4" />, label: 'Belum lapor' },
    off: { cls: 'bg-canvas text-ink-3', icon: null, label: 'Di luar jadwal' },
  };

  const saveEdit = async () => {
    if (!editing) return;
    const patch: Record<string, unknown> = { poi_location: String(editing.poi_location || '').slice(0, 120), notes: String(editing.notes || '').slice(0, 500) || null, spg_name: String(editing.spg_name || '').slice(0, 60) };
    for (const f of NUM_FIELDS) patch[f.key] = Math.max(0, Math.min(100000, Math.round(Number(editing[f.key]) || 0)));
    const res = await updateSlotReportRemote(editing.id, patch, editorLabel);
    if (!res.ok) return setMsg(`Gagal menyimpan: ${res.error}`);
    setEditing(null);
    setMsg('Laporan slot dikoreksi.');
    load();
  };

  const doDelete = async () => {
    if (!deleting) return;
    const ok = await deleteSlotReportRemote(deleting.id);
    setDeleting(null);
    setMsg(ok ? 'Laporan slot dihapus.' : 'Gagal menghapus laporan.');
    if (ok) load();
  };

  const inp = 'h-10 px-3 rounded-xl border border-[#D5D8DC] bg-white text-[14px] outline-none focus:border-grab w-full';

  return (
    <div className="space-y-4 animate-fade-in">
      <section className="bg-white rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-[17px] font-bold">Aktivitas crew hari ini (aplikasi crew baru)</h2>
          <span className="text-[12px] font-semibold text-grab-deep flex items-center gap-1.5"><span className="live-dot" /> realtime</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {liveByUnit.map((u) => (
            <div key={u.id} className="rounded-xl bg-canvas p-3 min-w-0">
              <p className="text-[12px] text-ink-2 truncate">{u.name}</p>
              <p className="font-display text-[22px] font-extrabold tabular-nums">{u.n} <span className="text-[12px] font-semibold text-ink-3">orang/submission</span></p>
              <p className="text-[12px] text-ink-2 truncate">{u.n ? `${u.shifts.join(', ')} · ${u.spgs.join(', ')}` : 'Belum ada input hari ini'}</p>
              <p className="text-[11px] text-ink-3 break-words">{u.plan ? `Plotting: ${u.plan.shiftLabel || '-'} · ${u.plan.venues.map((v) => v.name).join(' → ') || 'venue belum diisi'}` : 'Tidak ada plotting untuk hari ini'}</p>
              {u.offPlan && <p className="text-[11px] font-semibold text-[#8A5300]">Lokasi input beda dengan plotting</p>}
              {!u.n && u.plan && <p className="text-[11px] font-semibold text-modis-red">Dijadwalkan beroperasi, belum ada input</p>}
              {u.last && <p className="text-[11px] text-ink-3 truncate">Terakhir {new Date(u.last).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' })}{u.poi ? ` · ${u.poi}` : ''}</p>}
            </div>
          ))}
        </div>
      </section>
      <details className="group space-y-4">
        <summary className="cursor-pointer list-none rounded-2xl bg-white px-4 py-3 text-[14px] font-semibold text-ink-2 hover:bg-grab-tint-2">
          Arsip: laporan slot lama (form lama) dan Running Schedule statis <span className="text-ink-3 font-normal">· klik untuk membuka</span>
        </summary>
      <section className="bg-white rounded-2xl p-4 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-[17px] font-bold">Monitor laporan slot vs Running Schedule</h2>
            <p className="text-[13px] text-ink-2">Tabel ini membaca laporan slot dari form lama dan dibandingkan dengan Running Schedule statis (mulai 26 Okt). Kartu di atas adalah pantauan utama: data crew aplikasi baru dibandingkan dengan plotting terbaru dari office.</p>
          </div>
          <button onClick={load} disabled={loading} className="h-9 px-3 rounded-lg text-grab-cta font-semibold flex items-center gap-1.5 hover:bg-grab-tint-2">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Muat ulang
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2 stagger">
          <div className="rounded-xl bg-grab-tint p-3"><p className="text-[12px] text-grab-deep">Laporan masuk</p><p className="font-display text-[22px] font-extrabold text-grab-deep">{totals.sent}</p></div>
          <div className="rounded-xl bg-[#FDECEA] p-3"><p className="text-[12px] text-modis-red">Belum lapor</p><p className="font-display text-[22px] font-extrabold text-modis-red">{totals.missing}</p></div>
          <div className="rounded-xl bg-[#FFF8E1] p-3"><p className="text-[12px] text-[#8A5300]">Lokasi beda jadwal</p><p className="font-display text-[22px] font-extrabold text-[#8A5300]">{totals.mismatch}</p></div>
        </div>
        {error && <p role="alert" className="text-[13px] text-modis-red font-medium">{error}</p>}
        {msg && <p role="status" className="text-[13px] text-grab-deep font-medium">{msg}</p>}
        <div className="overflow-x-auto -mx-4 px-4">
          <table className="w-full text-[13px] min-w-[760px]">
            <thead className="text-ink-2 text-left text-[12px] font-semibold">
              <tr>
                <th className="py-2 pr-2">Tanggal</th>
                {units.flatMap((u) => UNIT_SLOTS[u].map((s) => <th key={u + s.label} className="py-2 px-1">{u === 'Mobil Diskon' ? `Mobil ${s.label}` : u}</th>))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {matrix.map((d) => (
                <tr key={d.day}>
                  <td className="py-2 pr-2 align-top whitespace-nowrap">
                    <span className="font-semibold">{fmtDay(d.day)}</span>
                    {d.area && <span className="block text-[11px] text-ink-3">{d.area}</span>}
                  </td>
                  {d.cells.map((c) => {
                    const ui = statusUi[c.status];
                    return (
                      <td key={c.unit + c.slot.label} className="py-1.5 px-1 align-top">
                        <div className={`rounded-lg px-2 py-1.5 ${ui.cls}`} title={c.planned ? `Jadwal: ${c.planned}` : undefined}>
                          <span className="flex items-center gap-1 font-semibold">{ui.icon}{ui.label}{c.reps.length > 1 && ` ×${c.reps.length}`}</span>
                          {c.planned && <span className="block text-[11px] opacity-80 truncate max-w-[150px]">{c.planned}</span>}
                          {c.mismatch && (
                            <span className="flex items-center gap-1 text-[11px] text-[#8A5300] font-semibold"><AlertTriangle className="w-3 h-3" /> lokasi beda</span>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-white rounded-2xl overflow-hidden">
        <h2 className="px-4 pt-4 pb-2 font-display text-[17px] font-bold">Daftar laporan slot ({rows.length})</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] min-w-[900px]">
            <thead className="bg-canvas text-ink-2 text-left text-[12px] font-semibold">
              <tr>
                <th className="px-3 py-2.5">Tanggal</th>
                <th className="px-3 py-2.5">Unit · jam</th>
                <th className="px-3 py-2.5">Lokasi</th>
                <th className="px-3 py-2.5">SPG</th>
                <th className="px-3 py-2.5 text-right">Reach</th>
                <th className="px-3 py-2.5 text-right">Contact</th>
                <th className="px-3 py-2.5 text-right">Conv.</th>
                <th className="px-3 py-2.5 text-right">A/B/C</th>
                <th className="px-3 py-2.5">Koreksi</th>
                {canEdit && <th className="px-3 py-2.5" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.length === 0 && (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-ink-2">Belum ada laporan slot di periode ini.</td></tr>
              )}
              {[...rows].sort((a, b) => (String(b.report_date) + b.duty_hours).localeCompare(String(a.report_date) + a.duty_hours)).map((r) => {
                const sched = scheduledLocation(String(r.report_date), r.unit_type, startOf(r.duty_hours));
                const mismatch = sched && r.poi_location && sched.location !== r.poi_location;
                return (
                  <tr key={r.id} className="hover:bg-canvas/60">
                    <td className="px-3 py-2.5 whitespace-nowrap">{fmtDay(String(r.report_date))}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{r.unit_type} · {r.duty_hours}</td>
                    <td className="px-3 py-2.5">
                      {r.poi_location}
                      {mismatch && <span className="block text-[11px] text-[#8A5300]">Jadwal: {sched!.location}</span>}
                    </td>
                    <td className="px-3 py-2.5">{r.spg_name}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.reach}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.contact}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.conversion}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.merch_a}/{r.merch_b}/{r.merch_c}</td>
                    <td className="px-3 py-2.5 text-[12px] text-ink-3">
                      {r.edited_at ? `${r.edited_by || 'owner'} · ${new Date(r.edited_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : '—'}
                    </td>
                    {canEdit && (
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <button onClick={() => setEditing({ ...r })} aria-label="Koreksi" className="w-8 h-8 rounded-lg hover:bg-grab-tint-2 inline-flex items-center justify-center text-grab-cta"><Pencil className="w-4 h-4" /></button>
                        <button onClick={() => setDeleting(r)} aria-label="Hapus" className="w-8 h-8 rounded-lg hover:bg-[#FDECEA] inline-flex items-center justify-center text-modis-red"><Trash2 className="w-4 h-4" /></button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      </details>

      {editing && (
        <div className="fixed inset-0 z-[80] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in" onClick={() => setEditing(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-3xl p-5 space-y-3 animate-sheet-up max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display text-[18px] font-bold">Koreksi laporan slot</h3>
                <p className="text-[13px] text-ink-2">{fmtDay(String(editing.report_date))} · {editing.unit_type} · {editing.duty_hours}</p>
              </div>
              <button onClick={() => setEditing(null)} aria-label="Tutup" className="w-9 h-9 rounded-full bg-canvas flex items-center justify-center"><X className="w-4 h-4" /></button>
            </div>
            <label className="block text-[13px] text-ink-2">Lokasi<input className={`${inp} mt-1`} value={editing.poi_location || ''} onChange={(e) => setEditing({ ...editing, poi_location: e.target.value })} /></label>
            <label className="block text-[13px] text-ink-2">Nama SPG<input className={`${inp} mt-1`} value={editing.spg_name || ''} onChange={(e) => setEditing({ ...editing, spg_name: e.target.value })} /></label>
            <div className="grid grid-cols-3 gap-2">
              {NUM_FIELDS.map((f) => (
                <label key={f.key} className="block text-[13px] text-ink-2">
                  {f.label}
                  <input type="number" min={0} inputMode="numeric" className={`${inp} mt-1`} value={editing[f.key] ?? 0} onChange={(e) => setEditing({ ...editing, [f.key]: e.target.value })} />
                </label>
              ))}
            </div>
            <label className="block text-[13px] text-ink-2">Catatan<textarea rows={2} maxLength={500} className={`${inp} mt-1 h-auto py-2`} value={editing.notes || ''} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} /></label>
            <p className="text-[12px] text-ink-3">Koreksi tercatat atas nama “{editorLabel}” beserta waktunya.</p>
            <button onClick={saveEdit} className="w-full h-12 rounded-xl bg-grab-cta text-white font-bold">Simpan koreksi</button>
          </div>
        </div>
      )}

      {deleting && (
        <div className="fixed inset-0 z-[80] bg-black/50 flex items-center justify-center p-4 animate-fade-in" onClick={() => setDeleting(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm bg-white rounded-3xl p-5 space-y-3 animate-pop">
            <h3 className="font-display text-[18px] font-bold">Hapus laporan slot?</h3>
            <p className="text-[14px] text-ink-2">{fmtDay(String(deleting.report_date))} · {deleting.unit_type} · {deleting.duty_hours} · {deleting.poi_location}. Tindakan ini tidak bisa dibatalkan.</p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setDeleting(null)} className="h-11 rounded-xl border border-[#D5D8DC] font-semibold">Batal</button>
              <button onClick={doDelete} className="h-11 rounded-xl bg-modis-red text-white font-semibold">Hapus</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SlotPanel;
