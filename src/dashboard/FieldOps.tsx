import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRealtime } from '../hooks/useRealtime';
import { Check, ClipboardCopy, Plus, RefreshCw, Save, ShieldAlert, Trash2, TriangleAlert, UserPlus, Warehouse } from 'lucide-react';
import { getSupabaseClient } from '../services/supabase';
import { POI_BY_CATEGORY } from '../data/schedule';
import { CAMPAIGN_START, CrewMember, ConvType, DOW_NAMES, WelcomeCfg, POOL_ITEMS, PoiItem, REWARD_LABEL, Reward, STOCK_ITEMS, TYPE_LABEL, campaignWeek, fieldApi, openingDefault, shiftText, ACTIVE_SHIFTS, Jadwal, Shift, applyJadwal } from '../field/api';

/**
 * Dashboard office, fase 2–3 spec: issue lapangan, mutasi stok gudang, ringkasan harian & draft mingguan,
 * pool mix, master crew & venue, akun office per orang, retensi data pribadi.
 */

const UNITS: Record<string, string> = { mobil: 'Mobil Diskon', kiosk1: 'Kiosk Diskon 1', kiosk2: 'Kiosk Diskon 2' };
const card = 'bg-white rounded-2xl';
const th = 'px-3 py-2.5 text-[11px] font-semibold text-ink-2 uppercase tracking-wide whitespace-nowrap text-left';
const td = 'px-3 py-2.5 text-[13px] tabular-nums';
const inp = 'h-10 px-3 rounded-xl bg-canvas text-[14px] outline-none border-2 border-transparent focus:border-grab focus:bg-white';
const btn = 'h-10 px-4 rounded-xl text-[14px] font-semibold flex items-center gap-1.5 disabled:opacity-50';
const nf = (n: number) => n.toLocaleString('id-ID');
const todayWIB = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
const tWIB = (iso: string) => new Date(iso).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const longDay = (d: string) => new Date(`${d}T12:00:00+07:00`).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

export interface Issue {
  id: string;
  created_at: string;
  day: string;
  unit_id: string;
  shift: string;
  by_name: string;
  role: string;
  poi_location: string | null;
  category: string;
  note: string | null;
  status: 'open' | 'done';
  resolved_note: string | null;
}

export interface ConvLite {
  claim_day: string;
  created_at: string;
  unit_id: string;
  poi_location: string | null;
  spg_name: string;
  type: ConvType;
  reward: Reward;
  photobooth: boolean;
  status: 'ok' | 'conflict';
  shift?: string;
  reward2?: Reward | null;
}

export function useIssues(from: string, to: string) {
  const [issues, setIssues] = useState<Issue[]>([]);
  const load = useCallback(async () => {
    const sb = getSupabaseClient();
    if (!sb) return;
    const { data } = await sb
      .from('modis_issues')
      .select('*')
      .or(`status.eq.open,and(day.gte.${from},day.lte.${to})`)
      .order('created_at', { ascending: false })
      .limit(500);
    setIssues((data || []) as Issue[]);
  }, [from, to]);
  useEffect(() => {
    load();
    const t = window.setInterval(load, 15_000);
    return () => window.clearInterval(t);
  }, [load]);
  useRealtime(['modis_issues'], load);
  return { issues, reload: load };
}

// ---------------------------------------------------------------------
// Issue lapangan
// ---------------------------------------------------------------------
export const IssuesPanel: React.FC<{ issues: Issue[]; reload: () => void; isOwner: boolean }> = ({ issues, reload, isOwner }) => {
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const open = issues.filter((i) => i.status === 'open');
  const done = issues.filter((i) => i.status === 'done').slice(0, 20);
  const resolve = async (id: string) => {
    try {
      await fieldApi.issueResolve(id, notes[id] || '');
      reload();
    } catch (e: any) {
      setErr(e?.message || 'Gagal');
    }
  };
  return (
    <section className={`${card} overflow-hidden`}>
      <div className="px-4 pt-4 pb-2 flex items-center justify-between gap-2">
        <h3 className="text-[15px] font-bold flex items-center gap-2">
          <TriangleAlert className="w-4 h-4 text-modis-orange" /> Issue lapangan
          {open.length > 0 && <span className="px-2 py-0.5 rounded-full bg-[#FDECEA] text-modis-red text-[12px]">{open.length} terbuka</span>}
        </h3>
        <button onClick={reload} className="text-[13px] font-semibold text-grab-cta flex items-center gap-1">
          <RefreshCw className="w-3.5 h-3.5" /> Muat ulang
        </button>
      </div>
      {err && <p className="px-4 text-[13px] text-modis-red">{err}</p>}
      {issues.length === 0 ? (
        <p className="px-4 pb-4 text-[14px] text-ink-3">Belum ada issue dari crew.</p>
      ) : (
        <ul className="divide-y divide-line">
          {[...open, ...done].map((i) => (
            <li key={i.id} className={`px-4 py-3 ${i.status === 'open' ? '' : 'opacity-60'}`}>
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-[14px] font-bold">{i.category}</span>
                <span className="text-[12px] text-ink-3">
                  {tWIB(i.created_at)} · {UNITS[i.unit_id] || i.unit_id} · {i.poi_location || '-'} · {i.by_name} {i.role === 'tl' ? '(TL)' : ''}
                </span>
              </div>
              {i.note && <p className="text-[14px] text-ink-2 mt-0.5">{i.note}</p>}
              {i.status === 'done' ? (
                <p className="text-[12px] text-grab-deep mt-1 flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" /> Selesai{i.resolved_note ? `: ${i.resolved_note}` : ''}
                </p>
              ) : (
                isOwner && (
                  <div className="mt-2 flex gap-2">
                    <input
                      value={notes[i.id] || ''}
                      onChange={(e) => setNotes({ ...notes, [i.id]: e.target.value })}
                      placeholder="Tindak lanjut (opsional)"
                      className={`${inp} flex-1 min-w-0`}
                    />
                    <button onClick={() => resolve(i.id)} className={`${btn} bg-grab-cta text-white shrink-0`}>
                      <Check className="w-4 h-4" /> Selesai
                    </button>
                  </div>
                )
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

// ---------------------------------------------------------------------
// Mutasi stok gudang
// ---------------------------------------------------------------------
interface WhMove {
  id: number;
  day: string;
  unit_id: string;
  kind: 'in' | 'out' | 'return';
  item: string;
  qty: number;
  note: string | null;
  created_at: string;
}

export const WarehousePanel: React.FC<{ from: string; to: string; isOwner: boolean; stock: any[] }> = ({ from, to, isOwner, stock }) => {
  const [moves, setMoves] = useState<WhMove[]>([]);
  const [day, setDay] = useState(todayWIB());
  const [unit, setUnit] = useState('mobil');
  const [kind, setKind] = useState<'in' | 'out' | 'return'>('out');
  const [balance, setBalance] = useState<Record<string, number>>({});
  const [form, setForm] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const sb = getSupabaseClient();
    if (!sb) return;
    const { data } = await sb.from('modis_warehouse_moves').select('*').gte('day', from).lte('day', to).order('created_at', { ascending: false });
    setMoves((data || []) as WhMove[]);
    // Saldo gudang sepanjang campaign: masuk − keluar + kembali
    const { data: all } = await sb.from('modis_warehouse_moves').select('kind,item,qty').limit(20000);
    const bal: Record<string, number> = {};
    (all || []).forEach((m: any) => (bal[m.item] = (bal[m.item] || 0) + (m.kind === 'out' ? -m.qty : m.qty)));
    setBalance(bal);
  }, [from, to]);
  useEffect(() => {
    load();
  }, [load]);
  useRealtime(['modis_warehouse_moves'], load);

  const save = async () => {
    const items = Object.fromEntries(Object.entries(form).filter(([, v]) => Number(v) > 0).map(([k, v]) => [k, Math.round(Number(v))]));
    if (!Object.keys(items).length) return setMsg('Isi minimal satu item.');
    try {
      await fieldApi.warehouse(day, unit, kind, items, note);
      setForm({});
      setNote('');
      setMsg('Mutasi tersimpan.');
      load();
    } catch (e: any) {
      setMsg(e?.message || 'Gagal menyimpan');
    }
  };
  const del = async (id: number) => {
    await fieldApi.warehouseDelete(id).catch(() => {});
    load();
  };

  // Rekonsiliasi: keluar gudang (netto) vs refill + opening yang dicatat TL di hari yang sama
  const recon = useMemo(() => {
    const keys = Array.from(new Set(moves.filter((m) => m.kind !== 'in').map((m) => `${m.day}|${m.unit_id}`))).sort().reverse();
    return keys.map((k) => {
      const [d, u] = k.split('|');
      const items = STOCK_ITEMS.map((it) => {
        const out = moves.filter((m) => m.day === d && m.unit_id === u && m.kind !== 'in' && m.item === it.id).reduce((a, m) => a + (m.kind === 'out' ? m.qty : -m.qty), 0);
        const tl = stock.filter((s) => s.day === d && s.unit_id === u && s.item === it.id && s.kind === 'refill').reduce((a, s) => a + s.qty, 0);
        return { ...it, out, tl, diff: tl - out };
      }).filter((r) => r.out !== 0 || r.tl !== 0);
      return { day: d, unit: u, items };
    });
  }, [moves, stock]);

  return (
    <section className={`${card} overflow-hidden`}>
      <h3 className="px-4 pt-4 pb-1 text-[15px] font-bold flex items-center gap-2">
        <Warehouse className="w-4 h-4 text-grab" /> Mutasi stok gudang
      </h3>
      <p className="px-4 pb-3 text-[12px] text-ink-3">Format sama dengan tab Stock & Gudang [INT]: barang masuk dari vendor (IN), keluar ke unit (OUT), atau kembali. Barang keluar dibandingkan dengan refill yang dicatat TL di tablet pada hari yang sama.</p>
      {isOwner && (
        <div className="px-4 pb-4 space-y-3 border-b border-line">
          <div className="flex flex-wrap gap-2">
            <input type="date" value={day} onChange={(e) => setDay(e.target.value)} className={inp} />
            <select value={kind} onChange={(e) => setKind(e.target.value as 'in' | 'out' | 'return')} className={inp}>
              <option value="in">Masuk dari vendor (IN)</option>
              <option value="out">Keluar ke unit (OUT)</option>
              <option value="return">Kembali ke gudang</option>
            </select>
            <select value={unit} onChange={(e) => setUnit(e.target.value)} disabled={kind === 'in'} className={`${inp} disabled:opacity-40`}>
              {Object.entries(UNITS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
            {STOCK_ITEMS.map((it) => (
              <label key={it.id} className="block">
                <span className="block text-[11px] font-semibold text-ink-2 truncate">{it.label}</span>
                <input
                  inputMode="numeric"
                  value={form[it.id] || ''}
                  onChange={(e) => setForm({ ...form, [it.id]: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                  className={`${inp} w-full mt-0.5`}
                  placeholder="0"
                />
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Catatan (no. surat jalan, pengirim)" className={`${inp} flex-1 min-w-[200px]`} />
            <button onClick={save} className={`${btn} bg-grab-cta text-white`}>
              <Save className="w-4 h-4" /> Simpan mutasi
            </button>
          </div>
          {msg && <p className="text-[13px] font-semibold text-grab-deep">{msg}</p>}
        </div>
      )}
      {Object.keys(balance).length > 0 && (
        <div className="px-4 py-3 border-b border-line">
          <p className="text-[13px] font-bold mb-2">Saldo gudang saat ini (masuk − keluar + kembali)</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
            {STOCK_ITEMS.filter((it) => it.id in balance).map((it) => (
              <div key={it.id} className={`rounded-xl p-2.5 ${balance[it.id] < 0 ? 'bg-[#FDECEA]' : 'bg-canvas'}`}>
                <p className="text-[11px] text-ink-2 truncate">{it.label}</p>
                <p className={`text-[18px] font-extrabold tabular-nums ${balance[it.id] < 0 ? 'text-modis-red' : ''}`}>{nf(balance[it.id])}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      {recon.length === 0 ? (
        <p className="px-4 py-4 text-[14px] text-ink-3">Belum ada barang keluar ke unit di rentang tanggal ini.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-canvas">
              <tr>
                <th className={th}>Hari · unit</th>
                <th className={th}>Item</th>
                <th className={`${th} text-right`}>Keluar gudang</th>
                <th className={`${th} text-right`}>Refill dicatat TL</th>
                <th className={`${th} text-right`}>Selisih</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {recon.flatMap((g) =>
                g.items.map((r, i) => (
                  <tr key={`${g.day}${g.unit}${r.id}`} className={r.diff !== 0 ? 'bg-[#FFF3E0]' : ''}>
                    <td className={`${td} whitespace-nowrap`}>{i === 0 ? `${g.day} · ${UNITS[g.unit] || g.unit}` : ''}</td>
                    <td className={td}>{r.label}</td>
                    <td className={`${td} text-right`}>{nf(r.out)}</td>
                    <td className={`${td} text-right`}>{nf(r.tl)}</td>
                    <td className={`${td} text-right font-bold ${r.diff !== 0 ? 'text-modis-orange' : ''}`}>{r.diff > 0 ? `+${r.diff}` : r.diff}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      )}
      {isOwner && moves.length > 0 && (
        <details className="px-4 py-3 border-t border-line">
          <summary className="text-[13px] font-semibold cursor-pointer">Riwayat input ({moves.length})</summary>
          <ul className="mt-2 space-y-1 text-[13px]">
            {moves.map((m) => (
              <li key={m.id} className="flex items-center gap-2">
                <span className="flex-1">
                  {m.day} · {m.kind === 'in' ? 'Gudang' : UNITS[m.unit_id]} · {m.kind === 'in' ? 'masuk' : m.kind === 'out' ? 'keluar' : 'kembali'} · {STOCK_ITEMS.find((s) => s.id === m.item)?.label || m.item} {m.qty}
                  {m.note ? ` · ${m.note}` : ''}
                </span>
                <button onClick={() => del(m.id)} aria-label="Hapus" className="w-8 h-8 rounded-lg hover:bg-canvas flex items-center justify-center text-ink-3">
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
};

// ---------------------------------------------------------------------
// Ringkasan harian otomatis & draft laporan mingguan (agregat, tanpa data pribadi)
// ---------------------------------------------------------------------
export const SummaryPanel: React.FC<{ rows: ConvLite[]; closeDays: any[]; issues: Issue[]; from: string; to: string }> = ({ rows, closeDays, issues, from, to }) => {
  const [mode, setMode] = useState<'day' | 'ext' | 'week'>('day');
  const [copied, setCopied] = useState(false);
  const text = useMemo(() => {
    const ok = rows.filter((r) => r.status === 'ok');
    const conflicts = rows.filter((r) => r.status === 'conflict');
    const byType = (list: ConvLite[]) => (['pahe_new', 'pahe_lapsed', 'gb_hemat'] as ConvType[]).map((t) => `${TYPE_LABEL[t]} ${nf(list.filter((r) => r.type === t).length)}`).join(' · ');
    const rewardLine = (list: ConvLite[]) =>
      (['snack', 'drink', 'candy', 'tier_c', 'tier_b', 'tier_a'] as Reward[])
        .map((k) => [k, list.filter((r) => r.reward === k).length] as const)
        .filter(([, n]) => n > 0)
        .map(([k, n]) => `${REWARD_LABEL[k]} ${nf(n)}`)
        .join(' · ') || '-';
    if (mode === 'ext') {
      // Satu kolom untuk ditempel ke tab Daily Report [EXT] pada kolom tanggal yang sama
      const d = to;
      const out: string[] = [];
      Object.keys(UNITS).forEach((u) => {
        const list = ok.filter((r) => r.claim_day === d && r.unit_id === u).sort((a, b) => a.created_at.localeCompare(b.created_at));
        const cd = closeDays.find((c) => c.day === d && c.unit_id === u);
        const venues = Array.from(new Set(list.map((r) => r.poi_location).filter(Boolean))) as string[];
        const rc = (k: Reward) => list.filter((r) => r.reward === k).length + list.filter((r) => r.reward2 === k).length;
        const shift = cd?.shift || list[0]?.shift || '';
        out.push(
          '',
          shiftText(shift),
          venues[0] || '',
          u === 'mobil' ? venues[1] || '' : '',
          String(cd?.reach ?? ''),
          String(cd?.contacts ?? ''),
          String(list.filter((r) => r.type === 'pahe_new').length),
          String(list.filter((r) => r.type === 'pahe_lapsed').length),
          String(list.filter((r) => r.type === 'gb_hemat').length),
          String(rc('snack') + rc('drink')),
          String(rc('candy') + rc('tier_c') + rc('tier_b') + rc('tier_a') + rc('golden')),
          String(rc('tier_c')),
          String(rc('tier_b')),
          String(rc('tier_a')),
          String(rc('golden')),
          String(rc('candy')),
          String(list.filter((r) => r.photobooth).length),
          (cd?.notes || '').replace(/\s+/g, ' '),
        );
      });
      return out.join('\n');
    }
    if (mode === 'day') {
      const d = to;
      const day = ok.filter((r) => r.claim_day === d);
      const cd = closeDays.filter((c) => c.day === d);
      const lines = [
        `*Ringkasan harian Grab MODIS*`,
        longDay(d),
        '',
        `Total conversion: *${nf(day.length)}* dari target 600 (${Math.round((day.length / 600) * 100)}%)`,
        byType(day),
        '',
        '*Per unit*',
        ...Object.entries(UNITS).map(([u, label]) => {
          const list = day.filter((r) => r.unit_id === u);
          const venues = Array.from(new Set(list.map((r) => r.poi_location).filter(Boolean))).join(', ') || '-';
          const c = cd.find((x) => x.unit_id === u);
          return `• ${label}: ${nf(list.length)} (${venues})${c ? ` · reach ${nf(c.reach || 0)} · contacts ${nf(c.contacts || 0)}` : ' · close day belum masuk'}`;
        }),
        '',
        `Reward: ${rewardLine(day)}`,
        `Photobooth: ${nf(day.filter((r) => r.photobooth).length)}`,
        `Double claim ditandai: ${nf(conflicts.filter((r) => r.claim_day === d).length)}`,
        `Issue lapangan: ${nf(issues.filter((i) => i.day === d).length)} (${nf(issues.filter((i) => i.status === 'open').length)} masih terbuka)`,
      ];
      return lines.join('\n');
    }
    const days = Array.from(new Set(ok.map((r) => r.claim_day))).sort();
    const perDay = days.map((d) => [d, ok.filter((r) => r.claim_day === d).length] as const);
    const best = [...perDay].sort((a, b) => b[1] - a[1])[0];
    const nDays = Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1);
    const venues = new Map<string, number>();
    ok.forEach((r) => venues.set(r.poi_location || '-', (venues.get(r.poi_location || '-') || 0) + 1));
    const top = Array.from(venues.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const reach = closeDays.reduce((a, c) => a + (c.reach || 0), 0);
    const contacts = closeDays.reduce((a, c) => a + (c.contacts || 0), 0);
    return [
      `*Draft laporan mingguan Grab MODIS*`,
      `${longDay(from)} s.d. ${longDay(to)}`,
      '',
      `1. Hasil utama`,
      `• Total conversion ${nf(ok.length)} dari target ${nf(600 * nDays)} (${Math.round((ok.length / (600 * nDays)) * 100)}%), rata-rata ${nf(Math.round(ok.length / nDays))}/hari`,
      `• ${byType(ok)}`,
      best ? `• Hari terbaik ${longDay(best[0])}: ${nf(best[1])}` : '',
      reach ? `• Reach ${nf(reach)} · contacts ${nf(contacts)} (dari close day TL)` : '',
      '',
      `2. Per unit`,
      ...Object.entries(UNITS).map(([u, label]) => `• ${label}: ${nf(ok.filter((r) => r.unit_id === u).length)}`),
      '',
      `3. Venue terbaik`,
      ...top.map(([v, n], i) => `${i + 1}. ${v}: ${nf(n)}`),
      '',
      `4. Reward keluar`,
      rewardLine(ok),
      '',
      `5. Catatan operasional`,
      `• Double claim ditandai: ${nf(conflicts.length)}`,
      `• Issue lapangan: ${nf(issues.filter((i) => i.day >= from && i.day <= to).length)}`,
      `• [isi insight & rencana minggu depan]`,
    ]
      .filter((l) => l !== '')
      .join('\n')
      .replace(/\n(\d\. )/g, '\n\n$1');
  }, [mode, rows, closeDays, issues, from, to]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* abaikan */
    }
  };
  return (
    <section className={`${card} p-4 space-y-3`}>
      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-[15px] font-bold">Ringkasan otomatis</h3>
          <span className="text-[12px] text-ink-3 truncate">{mode === 'day' ? to : mode === 'ext' ? `Daily Report · ${to}` : `${from} – ${to}`}</span>
        </div>
        <div className="grid grid-cols-3 gap-1 bg-canvas rounded-xl p-1" role="tablist">
          {(
            [
              ['day', 'Harian'],
              ['ext', 'Kolom EXT'],
              ['week', 'Mingguan'],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={`h-9 rounded-lg text-[13px] font-semibold whitespace-nowrap transition-colors ${mode === m ? 'bg-white text-grab-deep shadow-sm' : 'text-ink-2 hover:text-ink'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <pre key={mode} className="animate-tab-swap whitespace-pre-wrap break-words text-[13px] leading-relaxed bg-canvas rounded-xl p-3 font-sans max-h-[420px] overflow-y-auto">{text}</pre>
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
        <button onClick={copy} className={`${btn} bg-grab-cta text-white shrink-0 self-start`}>
          <ClipboardCopy className="w-4 h-4" /> {copied ? 'Tersalin' : 'Salin teks'}
        </button>
        <p className="text-[12px] text-ink-3">
          {mode === 'ext'
            ? 'Klik sel baris "Mobil Diskon" pada kolom tanggal di tab Daily Report [EXT], lalu tempel. Urutan baris sama persis (Mobil, Kiosk 1, Kiosk 2).'
            : 'Hanya angka agregat, tanpa nama atau nomor customer. Draft mingguan memakai rentang tanggal di atas.'}
        </p>
      </div>
    </section>
  );
};

// ---------------------------------------------------------------------
// Pengaturan office lanjutan
// ---------------------------------------------------------------------
export const FieldAdmin: React.FC = () => {
  return (
    <div className="space-y-4">
      <PoolMixCard />
      <CrewCard />
      <PoiCard />
      <JadwalCard />
      <WelcomeCard />
      <RetentionCard />
    </div>
  );
};

async function readSettings(keys: string[]): Promise<Record<string, any>> {
  const sb = getSupabaseClient();
  if (!sb) return {};
  const { data } = await sb.from('modis_settings').select('key,value').in('key', keys);
  return Object.fromEntries((data || []).map((r: any) => [r.key, r.value]));
}

const PoolMixCard: React.FC = () => {
  const def = openingDefault('AM');
  const [mix, setMix] = useState<Record<string, string>>(Object.fromEntries(POOL_ITEMS.map((k) => [k, String(def[k])])));
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    readSettings(['pool_mix']).then((s) => s.pool_mix && setMix(Object.fromEntries(POOL_ITEMS.map((k) => [k, String(s.pool_mix[k] ?? def[k])]))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const total = POOL_ITEMS.reduce((a, k) => a + (Number(mix[k]) || 0), 0);
  const save = async () => {
    try {
      await fieldApi.setSetting('pool_mix', Object.fromEntries(POOL_ITEMS.map((k) => [k, Math.max(0, Math.round(Number(mix[k]) || 0))])));
      setMsg('Pool mix tersimpan. Berlaku untuk saran opening TL berikutnya.');
    } catch (e: any) {
      setMsg(e?.message || 'Gagal');
    }
  };
  return (
    <section className={`${card} p-4 space-y-3`}>
      <h3 className="text-[15px] font-bold">Pool mix kapsul (per unit per hari)</h3>
      <p className="text-[12px] text-ink-3">Komposisi kupon di mesin gacha. Dipakai sebagai saran opening TL dan rencana di layar stok crew. Spec: ±88 draw per unit per hari.</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {POOL_ITEMS.map((k) => (
          <label key={k} className="block">
            <span className="block text-[12px] font-semibold text-ink-2">{STOCK_ITEMS.find((s) => s.id === k)?.label}</span>
            <input inputMode="numeric" value={mix[k]} onChange={(e) => setMix({ ...mix, [k]: e.target.value.replace(/\D/g, '').slice(0, 4) })} className={`${inp} w-full mt-0.5`} />
          </label>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <button onClick={save} className={`${btn} bg-grab-cta text-white`}>
          <Save className="w-4 h-4" /> Simpan
        </button>
        <span className="text-[13px] text-ink-2">Total {total} kapsul/unit/hari</span>
      </div>
      {msg && <p className="text-[13px] font-semibold text-grab-deep">{msg}</p>}
    </section>
  );
};

const CrewCard: React.FC = () => {
  const [list, setList] = useState<CrewMember[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  useEffect(() => {
    const sb = getSupabaseClient();
    sb?.from('modis_crew')
      .select('unit_id,name,role')
      .eq('active', true)
      .order('name')
      .then(({ data }) => setList((data || []) as CrewMember[]));
  }, []);
  const add = (u: string) => {
    const n = (draft[u] || '').trim();
    if (n.length < 2 || list.some((c) => c.unit_id === u && c.name === n)) return;
    setList([...list, { unit_id: u, name: n, role: 'spg' }]);
    setDraft({ ...draft, [u]: '' });
  };
  const save = async () => {
    try {
      await fieldApi.crewSave(list);
      setMsg('Daftar crew tersimpan. Nama muncul sebagai pilihan di layar login tablet.');
    } catch (e: any) {
      setMsg(e?.message || 'Gagal');
    }
  };
  return (
    <section className={`${card} p-4 space-y-3`}>
      <h3 className="text-[15px] font-bold">Daftar crew per unit</h3>
      <p className="text-[12px] text-ink-3">Spec: tiap unit 2 SPG + 1 TL. Nama tampil sebagai pilihan saat login, supaya penulisan nama konsisten di laporan. Crew pengganti tetap bisa mengetik nama sendiri.</p>
      <div className="grid md:grid-cols-3 gap-3">
        {Object.entries(UNITS).map(([u, label]) => (
          <div key={u} className="rounded-xl bg-canvas p-3 space-y-2">
            <p className="text-[13px] font-bold">{label}</p>
            {list
              .filter((c) => c.unit_id === u)
              .map((c) => (
                <div key={c.name} className="flex items-center gap-2 bg-white rounded-lg px-2 py-1.5">
                  <span className="flex-1 text-[14px] truncate">{c.name}</span>
                  <select
                    value={c.role}
                    onChange={(e) => setList(list.map((x) => (x === c ? { ...x, role: e.target.value as 'spg' | 'tl' } : x)))}
                    className="h-8 rounded-md bg-canvas text-[12px] px-1"
                  >
                    <option value="spg">SPG</option>
                    <option value="tl">TL</option>
                  </select>
                  <button onClick={() => setList(list.filter((x) => x !== c))} aria-label={`Hapus ${c.name}`} className="w-8 h-8 rounded-md hover:bg-canvas flex items-center justify-center text-ink-3">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            <div className="flex gap-1.5">
              <input
                value={draft[u] || ''}
                onChange={(e) => setDraft({ ...draft, [u]: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && add(u)}
                placeholder="Nama"
                className={`${inp} flex-1 min-w-0 bg-white`}
              />
              <button onClick={() => add(u)} aria-label="Tambah" className="w-10 h-10 rounded-xl bg-white flex items-center justify-center">
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
      <button onClick={save} className={`${btn} bg-grab-cta text-white`}>
        <Save className="w-4 h-4" /> Simpan daftar crew
      </button>
      {msg && <p className="text-[13px] font-semibold text-grab-deep">{msg}</p>}
    </section>
  );
};

const CAT_LABEL: Record<string, string> = { Station: 'Stasiun', Campus: 'Kampus', Office: 'Perkantoran', 'HOP & Public Space': 'HOP & Publik' };

const PoiCard: React.FC = () => {
  const [all, setAll] = useState<(PoiItem & { active: boolean })[]>([]);
  const [q, setQ] = useState('');
  const [newName, setNewName] = useState('');
  const [newCat, setNewCat] = useState<PoiItem['category']>('Station');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const sb = getSupabaseClient();
    if (!sb) return;
    const out: any[] = [];
    for (let f = 0; ; f += 1000) {
      const { data } = await sb.from('modis_pois').select('name,category,active').order('name').range(f, f + 999);
      out.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    setAll(out);
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  const importDefault = async () => {
    setBusy(true);
    try {
      const items = Object.entries(POI_BY_CATEGORY).flatMap(([c, arr]) => arr.map((name) => ({ name, category: c as PoiItem['category'], active: true })));
      for (let i = 0; i < items.length; i += 150) await fieldApi.poisSave(items.slice(i, i + 150));
      setMsg(`${items.length} venue dari jadwal diimpor.`);
      load();
    } catch (e: any) {
      setMsg(e?.message || 'Gagal');
    } finally {
      setBusy(false);
    }
  };
  const toggle = async (p: PoiItem & { active: boolean }) => {
    await fieldApi.poisSave([{ name: p.name, category: p.category, active: !p.active }]).catch((e) => setMsg(e?.message));
    load();
  };
  const addNew = async () => {
    if (newName.trim().length < 2) return;
    await fieldApi.poisSave([{ name: newName.trim(), category: newCat, active: true }]).catch((e) => setMsg(e?.message));
    setNewName('');
    setMsg('Venue ditambahkan.');
    load();
  };
  const shown = all.filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase())).slice(0, 40);
  return (
    <section className={`${card} p-4 space-y-3`}>
      <h3 className="text-[15px] font-bold">Daftar venue (POI)</h3>
      <p className="text-[12px] text-ink-3">
        Pilihan venue di tablet crew. {all.length ? `${all.filter((p) => p.active).length} aktif dari ${all.length}.` : 'Belum diisi: tablet masih memakai daftar bawaan jadwal.'}
      </p>
      {all.length === 0 && (
        <button onClick={importDefault} disabled={busy} className={`${btn} bg-modis-yellow text-ink`}>
          <Plus className="w-4 h-4" /> {busy ? 'Mengimpor…' : 'Impor daftar bawaan dari jadwal'}
        </button>
      )}
      <div className="flex flex-wrap gap-2">
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nama venue baru" className={`${inp} flex-1 min-w-[180px]`} />
        <select value={newCat} onChange={(e) => setNewCat(e.target.value as PoiItem['category'])} className={inp}>
          {Object.entries(CAT_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <button onClick={addNew} className={`${btn} bg-grab-cta text-white`}>
          <Plus className="w-4 h-4" /> Tambah
        </button>
      </div>
      {all.length > 0 && (
        <>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari venue untuk dinonaktifkan / diaktifkan" className={`${inp} w-full`} />
          <ul className="divide-y divide-line max-h-72 overflow-y-auto rounded-xl border border-line">
            {shown.map((p) => (
              <li key={p.name} className="flex items-center gap-2 px-3 py-2">
                <span className={`flex-1 text-[14px] ${p.active ? '' : 'line-through text-ink-3'}`}>
                  {p.name} <span className="text-[12px] text-ink-3">· {CAT_LABEL[p.category]}</span>
                </span>
                <button onClick={() => toggle(p)} className={`h-8 px-3 rounded-lg text-[12px] font-semibold ${p.active ? 'bg-canvas' : 'bg-grab-tint text-grab-deep'}`}>
                  {p.active ? 'Nonaktifkan' : 'Aktifkan'}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {msg && <p className="text-[13px] font-semibold text-grab-deep">{msg}</p>}
    </section>
  );
};

const toInput = (jam: string, i: 0 | 1) => (jam.split('–')[i] || '').replace('.', ':');
const hours = (jam: string) => {
  const [a, b] = jam.split('–').map((x) => { const m = /^(\d{1,2})[.:](\d{2})$/.exec(x || ''); return m ? Number(m[1]) + Number(m[2]) / 60 : NaN; });
  return isNaN(a) || isNaN(b) ? null : b - a;
};
const fmtD = (d: string) => `${d.slice(8)}/${d.slice(5, 7)}`;
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const names = (s: string) => s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);

/** Jadwal kerja crew: shift berbasis TIM. Tiap tim mendapat shift (atau libur) per minggu kampanye dan bergantian. Satu shift = 9 jam. */
const JadwalCard: React.FC = () => {
  const [sh, setSh] = useState(() => ACTIVE_SHIFTS.map((s) => ({ id: s.id, name: s.name, jam: s.jam })));
  const [teams, setTeams] = useState<Record<string, { tl: string; spg: string }>>({});
  const [rot, setRot] = useState<Record<string, Shift | ''>[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    readSettings(['jadwal']).then((s) => {
      const j: Jadwal | undefined = s.jadwal;
      if (!j) return;
      applyJadwal(j);
      setSh(ACTIVE_SHIFTS.map((x) => ({ id: x.id, name: x.name, jam: x.jam })));
      setTeams(Object.fromEntries(Object.entries(j.teams || {}).map(([t, m]) => [t, { tl: (m.tl || []).join(', '), spg: (m.spg || []).join(', ') }])));
      setRot(j.rotation || []);
    });
  }, []);
  const teamIds = Object.keys(teams).sort();
  const cfg = (): Jadwal => ({
    shifts: Object.fromEntries(sh.map((s) => [s.id, { name: s.name, jam: s.jam }])) as Jadwal['shifts'],
    teams: Object.fromEntries(teamIds.map((t) => [t, { tl: names(teams[t].tl), spg: names(teams[t].spg) }])),
    rotation: rot,
  });
  const save = async () => {
    try {
      await fieldApi.setSetting('jadwal', cfg());
      applyJadwal(cfg());
      setMsg('Jadwal tersimpan. Tablet memuat jadwal terbaru saat dibuka dengan sinyal.');
    } catch (e: any) {
      setMsg(e?.message || 'Gagal');
    }
  };
  const setJam = (id: Shift, i: 0 | 1, v: string) =>
    setSh(sh.map((s) => {
      if (s.id !== id) return s;
      const parts = [toInput(s.jam, 0), toInput(s.jam, 1)];
      parts[i] = v;
      return { ...s, jam: `${parts[0].replace(':', '.')}–${parts[1].replace(':', '.')}` };
    }));
  const select = 'h-9 px-2 rounded-lg border border-[#D5D8DC] bg-white text-[13px] font-semibold';
  const shName = (id: Shift | '') => (id ? sh.find((s) => s.id === id)?.name || id : 'Libur');
  const chipCls = (id: Shift | '') => (id === 'AM' ? 'bg-[#E8F5E9] text-grab-deep' : id === 'PM' ? 'bg-[#E3F2FD] text-[#1565C0]' : id === 'MID' ? 'bg-[#FFF8E1] text-[#B45309]' : 'bg-[#F1F3F5] text-ink-3');
  const nowWeek = campaignWeek(todayWIB());
  const startMon = todayWIB() < CAMPAIGN_START ? CAMPAIGN_START : addDays(CAMPAIGN_START, (nowWeek - 1) * 7);
  const weeks = Array.from({ length: 6 }, (_, i) => {
    const wk = (todayWIB() < CAMPAIGN_START ? 1 : nowWeek) + i;
    return { wk, from: addDays(startMon, i * 7), to: addDays(startMon, i * 7 + 6), plan: rot.length ? rot[(wk - 1) % rot.length] : {} };
  });
  return (
    <section className={`${card} p-4 space-y-4`}>
      <div>
        <h3 className="text-[15px] font-bold">Jadwal kerja crew (shift tim)</h3>
        <p className="text-[12px] text-ink-3">Shift ditentukan per tim per minggu kampanye (mulai {fmtD(CAMPAIGN_START)}), lalu bergantian. Satu shift 9 jam. Saat login, SPG/TL yang namanya ada di tim otomatis mendapat shift tim itu, atau libur.</p>
      </div>
      <div className="space-y-2">
        <p className="text-[13px] font-bold">Jam tiap shift</p>
        {sh.map((s) => {
          const h = hours(s.jam);
          return (
            <div key={s.id} className="flex flex-wrap items-center gap-2">
              <input value={s.name} maxLength={20} onChange={(e) => setSh(sh.map((x) => (x.id === s.id ? { ...x, name: e.target.value } : x)))} className="h-9 w-32 px-2 rounded-lg border border-[#D5D8DC] text-[13px] font-semibold" />
              <input type="time" value={toInput(s.jam, 0)} onChange={(e) => setJam(s.id, 0, e.target.value)} className={select} />
              <span className="text-ink-3">–</span>
              <input type="time" value={toInput(s.jam, 1)} onChange={(e) => setJam(s.id, 1, e.target.value)} className={select} />
              <span className={`text-[12px] font-semibold ${h === 9 ? 'text-grab-deep' : 'text-ink-3'}`}>{h === null ? '' : `${h} jam`}</span>
            </div>
          );
        })}
      </div>
      <div className="space-y-2">
        <p className="text-[13px] font-bold">Tim <span className="font-normal text-ink-3">(nama harus sama dengan daftar crew, pisahkan dengan koma)</span></p>
        {teamIds.length === 0 && <p className="text-[12px] text-ink-3">Belum ada tim.</p>}
        {teamIds.map((t) => (
          <div key={t} className="rounded-xl border border-[#E1E4E8] p-3 space-y-2">
            <p className="text-[13px] font-bold">Tim {t} <span className="font-normal text-ink-3">· {names(teams[t].tl).length} TL · {names(teams[t].spg).length} SPG</span></p>
            <input value={teams[t].tl} onChange={(e) => setTeams({ ...teams, [t]: { ...teams[t], tl: e.target.value } })} placeholder="TL" className="w-full h-9 px-2 rounded-lg border border-[#D5D8DC] text-[13px]" />
            <textarea value={teams[t].spg} onChange={(e) => setTeams({ ...teams, [t]: { ...teams[t], spg: e.target.value } })} placeholder="SPG" rows={2} className="w-full px-2 py-1.5 rounded-lg border border-[#D5D8DC] text-[13px]" />
          </div>
        ))}
        <button onClick={() => { const id = String.fromCharCode(65 + teamIds.length); setTeams({ ...teams, [id]: { tl: '', spg: '' } }); setRot(rot.map((r) => ({ ...r, [id]: '' }))); }} disabled={teamIds.length >= 6} className={`${btn} border border-[#D5D8DC]`}>
          <Plus className="w-4 h-4" /> Tim
        </button>
      </div>
      <div className="space-y-2">
        <p className="text-[13px] font-bold">Rotasi mingguan <span className="font-normal text-ink-3">(berulang sesuai urutan)</span></p>
        <div className="overflow-x-auto">
          <table className="text-[13px] w-full">
            <thead>
              <tr className="text-left text-ink-3 text-[12px]">
                <th className="py-1 pr-3">Minggu</th>
                {teamIds.map((t) => <th key={t} className="py-1 pr-3">Tim {t}</th>)}
                <th />
              </tr>
            </thead>
            <tbody>
              {rot.map((r, i) => (
                <tr key={i} className="border-t border-[#F1F3F5]">
                  <td className="py-1.5 pr-3 font-semibold">Minggu {i + 1}</td>
                  {teamIds.map((t) => (
                    <td key={t} className="py-1.5 pr-3">
                      <select value={r[t] || ''} onChange={(e) => setRot(rot.map((x, j) => (j === i ? { ...x, [t]: e.target.value as Shift | '' } : x)))} className={select}>
                        <option value="">Libur</option>
                        {sh.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </td>
                  ))}
                  <td className="py-1.5">{rot.length > 1 && <button onClick={() => setRot(rot.filter((_, j) => j !== i))} className="text-[12px] text-ink-3 hover:text-modis-red">Hapus</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button onClick={() => setRot([...rot, Object.fromEntries(teamIds.map((t) => [t, '' as const]))])} disabled={rot.length >= 8 || !teamIds.length} className={`${btn} border border-[#D5D8DC]`}>
          <Plus className="w-4 h-4" /> Minggu
        </button>
      </div>
      {rot.length > 0 && teamIds.length > 0 && (
        <div className="space-y-2">
          <p className="text-[13px] font-bold">Gambaran 6 minggu ke depan</p>
          <div className="space-y-1.5">
            {weeks.map((w) => (
              <div key={w.wk} className="flex flex-wrap items-center gap-2 text-[13px]">
                <span className="w-40 font-semibold">Minggu {w.wk} <span className="font-normal text-ink-3">{fmtD(w.from)}–{fmtD(w.to)}</span></span>
                {teamIds.map((t) => (
                  <span key={t} className={`px-2.5 py-1 rounded-full text-[12px] font-semibold ${chipCls((w.plan as any)[t] || '')}`}>Tim {t}: {shName((w.plan as any)[t] || '')}</span>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
      <button onClick={save} className={`${btn} bg-grab-cta text-white`}>
        <Save className="w-4 h-4" /> Simpan jadwal
      </button>
      {msg && <p className="text-[13px] font-semibold text-grab-deep">{msg}</p>}
    </section>
  );
};

const WelcomeCard: React.FC = () => {
  // Roti selalu ada tiap hari. Seminggu sekali ada hari menu lengkap (Roti + Pisang + Telur) yang ditentukan office dengan mengetik nomor.
  const [every, setEvery] = useState<string>('');
  const [rows, setRows] = useState<{ week: string; dow: string }[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    readSettings(['welcome']).then((s) => {
      const w = s.welcome as WelcomeCfg | undefined;
      if (!w) return;
      setEvery(w.every_dow ? String(w.every_dow) : '');
      setRows(Object.entries(w.weeks || {}).sort((x, y) => Number(x[0]) - Number(y[0])).map(([week, dow]) => ({ week, dow: String(dow) })));
    });
  }, []);
  const num = (v: string) => (v.trim() === '' ? NaN : Number(v));
  const validDow = (v: string, allowZero = false) => Number.isInteger(num(v)) && num(v) >= (allowZero ? 0 : 1) && num(v) <= 7;
  const save = async () => {
    if (every.trim() !== '' && !validDow(every)) return setMsg('Hari harus angka 1–7 (1 = Senin ... 7 = Minggu).');
    const weeks: Record<string, number> = {};
    for (const r of rows) {
      if (r.week.trim() === '' && r.dow.trim() === '') continue;
      if (!Number.isInteger(num(r.week)) || num(r.week) < 1 || num(r.week) > 30) return setMsg('Nomor minggu harus angka 1–30.');
      if (!validDow(r.dow, true)) return setMsg('Hari harus angka 1–7 (0 = tidak ada menu lengkap minggu itu).');
      weeks[String(num(r.week))] = num(r.dow);
    }
    try {
      // "rotation" tetap dikirim (['w_roti']) hanya agar lolos validasi server lama; tidak dipakai aplikasi.
      await fieldApi.setSetting('welcome', { rotation: ['w_roti'], every_dow: every.trim() === '' ? null : num(every), weeks });
      setMsg('Jadwal welcome snack tersimpan. Tablet crew memakainya setelah sinkron.');
    } catch (e: any) {
      setMsg(e?.message || 'Gagal');
    }
  };
  const nowWeek = campaignWeek(todayWIB());
  const inp = 'h-10 w-20 rounded-xl border border-[#D5D8DC] px-3 text-[15px] font-semibold text-center tabular-nums';
  return (
    <section className={`${card} p-4 space-y-3`}>
      <h3 className="text-[15px] font-bold">Welcome snack</h3>
      <p className="text-[12px] text-ink-3">
        Roti selalu ada setiap hari. Seminggu sekali ada hari dengan menu lengkap (Roti, Pisang, Telur). Isi nomor harinya: 1 = Senin, 2 = Selasa, 3 = Rabu, 4 = Kamis, 5 = Jumat, 6 = Sabtu, 7 = Minggu. Minggu kampanye dihitung mulai {CAMPAIGN_START}.
      </p>
      <label className="flex items-center gap-3 text-[14px] font-semibold">
        <span className="w-56">Hari menu lengkap tiap minggu</span>
        <input inputMode="numeric" value={every} onChange={(e) => setEvery(e.target.value.replace(/\D/g, '').slice(0, 1))} placeholder="1–7" className={inp} />
        <span className="text-[13px] text-ink-2 font-normal">{validDow(every) ? DOW_NAMES[num(every)] : 'kosong = tidak ada'}</span>
      </label>
      <div className="space-y-2">
        <p className="text-[13px] font-semibold text-ink-2">Pengecualian per minggu (opsional)</p>
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2 text-[14px]">
            <span className="w-24">Minggu ke-</span>
            <input inputMode="numeric" value={r.week} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, week: e.target.value.replace(/\D/g, '').slice(0, 2) } : x)))} className={inp} />
            <span>hari ke-</span>
            <input inputMode="numeric" value={r.dow} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, dow: e.target.value.replace(/\D/g, '').slice(0, 1) } : x)))} className={inp} />
            <span className="text-[13px] text-ink-2">{validDow(r.dow, true) ? DOW_NAMES[num(r.dow)] || 'tidak ada menu lengkap' : ''}</span>
            <button onClick={() => setRows(rows.filter((_, j) => j !== i))} className="ml-auto text-[12px] text-ink-3 hover:text-modis-red">Hapus</button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => setRows([...rows, { week: '', dow: '' }])} className={`${btn} border border-[#D5D8DC]`}>+ Pengecualian minggu</button>
        <button onClick={save} className={`${btn} bg-grab-cta text-white`}>
          <Save className="w-4 h-4" /> Simpan
        </button>
        <span className="text-[13px] text-ink-2">Sekarang minggu ke-{nowWeek}</span>
      </div>
      {msg && <p className="text-[13px] font-semibold text-grab-deep">{msg}</p>}
    </section>
  );
};

const RetentionCard: React.FC = () => {
  const [end, setEnd] = useState('');
  const [before, setBefore] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    readSettings(['program']).then((s) => s.program?.end_date && setEnd(s.program.end_date));
  }, []);
  const purgeDay = end ? new Date(Date.parse(`${end}T00:00:00Z`) + 90 * 86400000).toISOString().slice(0, 10) : null;
  const saveEnd = async () => {
    try {
      await fieldApi.setSetting('program', { end_date: end });
      setMsg(`Tersimpan. Data pribadi otomatis dihapus mulai ${purgeDay}.`);
    } catch (e: any) {
      setMsg(e?.message || 'Gagal');
    }
  };
  const purge = async () => {
    if (confirm !== 'HAPUS' || !before) return;
    setBusy(true);
    try {
      const r = await fieldApi.purgePersonal(before);
      if (r.photos?.length) await fieldApi.deletePhotos(r.photos);
      setMsg(`${r.rows} data pribadi dihapus, ${r.photos?.length || 0} foto bukti dihapus.`);
      setConfirm('');
    } catch (e: any) {
      setMsg(e?.message || 'Gagal');
    } finally {
      setBusy(false);
    }
  };
  const cleanQc = async () => {
    setBusy(true);
    try {
      const sb = getSupabaseClient();
      await sb?.rpc('modis_purge_test_data', { p_qc: true, p_before: null });
      await sb?.rpc('modis_f1_purge_qc_extra');
      setMsg('Data uji [QC] dibersihkan.');
    } catch (e: any) {
      setMsg(e?.message || 'Gagal');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className={`${card} p-4 space-y-3`}>
      <h3 className="text-[15px] font-bold flex items-center gap-2">
        <ShieldAlert className="w-4 h-4 text-grab" /> Retensi data pribadi (UU PDP)
      </h3>
      <p className="text-[12px] text-ink-3">
        Nama dan nomor HP customer dihapus 90 hari setelah program selesai; foto bukti ikut dihapus. Angka agregat untuk laporan tetap ada.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-[13px] font-semibold">Tanggal akhir program</label>
        <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className={inp} />
        <button onClick={saveEnd} disabled={!end} className={`${btn} bg-grab-cta text-white`}>
          <Save className="w-4 h-4" /> Simpan
        </button>
        {purgeDay && <span className="text-[13px] text-ink-2">Hapus otomatis mulai {purgeDay}</span>}
      </div>
      <details className="rounded-xl bg-canvas p-3">
        <summary className="text-[13px] font-semibold cursor-pointer">Hapus manual sekarang</summary>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-[13px]">Data sebelum</span>
          <input type="date" value={before} onChange={(e) => setBefore(e.target.value)} className={`${inp} bg-white`} />
          <input value={confirm} onChange={(e) => setConfirm(e.target.value.toUpperCase())} placeholder='Ketik "HAPUS"' className={`${inp} bg-white w-36`} />
          <button onClick={purge} disabled={busy || confirm !== 'HAPUS' || !before} className={`${btn} bg-modis-red text-white`}>
            <Trash2 className="w-4 h-4" /> Hapus permanen
          </button>
        </div>
      </details>
      <button onClick={cleanQc} disabled={busy} className={`${btn} border border-[#D5D8DC]`}>
        <Trash2 className="w-4 h-4" /> Bersihkan data uji [QC]
      </button>
      {msg && <p className="text-[13px] font-semibold text-grab-deep">{msg}</p>}
    </section>
  );
};

// ---------------------------------------------------------------------
// Tanda kejanggalan otomatis (anti-curang)
// ---------------------------------------------------------------------
export const AnomalyPanel: React.FC<{ rows: (ConvLite & { spg_name: string; backfill?: boolean })[]; stock: any[] }> = ({ rows, stock }) => {
  const flags = useMemo(() => {
    const out: { level: 'tinggi' | 'sedang'; text: string }[] = [];
    const ok = rows.filter((r) => r.status === 'ok');
    // 1. Opening hari ini tidak sama dengan closing hari sebelumnya (barang "hilang" semalam)
    const days = Array.from(new Set(stock.map((s) => s.day))).sort();
    days.forEach((d, i) => {
      if (!i) return;
      const prev = days[i - 1];
      Object.keys(UNITS).forEach((u) => {
        STOCK_ITEMS.forEach((it) => {
          const cl = stock.filter((s) => s.day === prev && s.unit_id === u && s.item === it.id && s.kind === 'closing');
          const op = stock.filter((s) => s.day === d && s.unit_id === u && s.item === it.id && s.kind === 'opening');
          if (!cl.length || !op.length) return;
          const a = cl.reduce((x, s) => x + s.qty, 0);
          const b = op.reduce((x, s) => x + s.qty, 0);
          if (b < a) out.push({ level: a - b > 5 ? 'tinggi' : 'sedang', text: `${UNITS[u]} · ${it.label}: closing ${prev} = ${a}, opening ${d} = ${b} (kurang ${a - b})` });
        });
      });
    });
    // 2. SPG dengan input jauh di atas rata-rata
    const per = new Map<string, number>();
    ok.forEach((r) => per.set(r.spg_name, (per.get(r.spg_name) || 0) + 1));
    const vals = Array.from(per.values()).sort((a, b) => a - b);
    const median = vals.length ? vals[Math.floor(vals.length / 2)] : 0;
    per.forEach((n, spg) => {
      if (vals.length >= 3 && n >= 20 && n > median * 2) out.push({ level: 'sedang', text: `${spg}: ${n} conversion, lebih dari 2× median SPG lain (${median}). Cek foto bukti.` });
    });
    // 3. Input beruntun terlalu cepat oleh SPG yang sama (≥3 dalam 60 detik)
    const bySpg = new Map<string, number[]>();
    rows.forEach((r) => bySpg.set(r.spg_name, [...(bySpg.get(r.spg_name) || []), Date.parse(r.created_at)]));
    bySpg.forEach((ts, spg) => {
      ts.sort((a, b) => a - b);
      let bursts = 0;
      for (let i = 2; i < ts.length; i++) if (ts[i] - ts[i - 2] <= 60_000) bursts++;
      if (bursts) out.push({ level: 'sedang', text: `${spg}: ${bursts}× tiga input dalam 1 menit. Normalnya 1 customer ±1–2 menit.` });
    });
    // 4. Reward kupon tinggi sering muncul
    const tierA = ok.filter((r) => r.reward === 'tier_a' || r.reward2 === 'tier_a').length;
    const draws = ok.filter((r) => r.type === 'gb_hemat').length + ok.filter((r) => r.reward2).length;
    if (draws >= 30 && tierA / draws > 0.08) out.push({ level: 'tinggi', text: `Tier A keluar ${tierA} dari ${draws} draw (${Math.round((tierA / draws) * 100)}%), di atas komposisi mesin ±4%.` });
    // 5. Banyak input susulan
    const bf = rows.filter((r) => r.backfill).length;
    if (bf >= 10) out.push({ level: 'sedang', text: `${bf} data input susulan di rentang ini. Pastikan sesuai Google Form / kertas.` });
    return out;
  }, [rows, stock]);

  return (
    <section className={`${card} p-4 space-y-2`}>
      <h3 className="text-[15px] font-bold flex items-center gap-2">
        <ShieldAlert className="w-4 h-4 text-modis-red" /> Tanda kejanggalan
        {flags.length > 0 && <span className="px-2 py-0.5 rounded-full bg-[#FDECEA] text-modis-red text-[12px]">{flags.length}</span>}
      </h3>
      {flags.length === 0 ? (
        <p className="text-[14px] text-ink-3">Tidak ada yang janggal di rentang ini.</p>
      ) : (
        <ul className="space-y-1.5">
          {flags.map((f, i) => (
            <li key={i} className={`text-[13px] rounded-xl px-3 py-2 ${f.level === 'tinggi' ? 'bg-[#FDECEA] text-[#9B1C1C]' : 'bg-[#FFF3E0] text-[#8A5300]'}`}>
              {f.text}
            </li>
          ))}
        </ul>
      )}
      <p className="text-[12px] text-ink-3">Dicek otomatis: opening vs closing kemarin, SPG dengan input jauh di atas rata-rata, input beruntun terlalu cepat, Tier A terlalu sering, dan input susulan.</p>
    </section>
  );
};
