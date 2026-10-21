-- =====================================================================
-- MODIS Cek Boros - alat dashboard internal (9 Okt 2026)
-- 1. Catatan siapa yang mengoreksi laporan slot
-- 2. Bersihkan data uji (khusus owner)
-- Aman dijalankan ulang.
-- =====================================================================

alter table public.modis_slot_reports add column if not exists edited_by text;
alter table public.modis_slot_reports add column if not exists edited_at timestamptz;
alter table public.modis_slot_reports drop constraint if exists modis_slot_reports_edited_by_len;
alter table public.modis_slot_reports add constraint modis_slot_reports_edited_by_len check (coalesce(length(edited_by), 0) <= 80);

-- Hapus data uji: visitor [QC] / qc-dummy, dan (opsional) semua data sebelum tanggal tertentu.
create or replace function public.modis_purge_test_data(p_qc boolean default true, p_before date default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vis int := 0;
  v_slot int := 0;
  v_pos int := 0;
  n int;
begin
  if not public.modis_is_owner() then
    raise exception 'Hanya owner yang boleh menghapus data' using errcode = '42501';
  end if;
  if p_qc then
    delete from public.modis_visitors where device_id = 'qc-dummy' or full_name like '[QC]%';
    get diagnostics n = row_count; v_vis := v_vis + n;
  end if;
  if p_before is not null then
    delete from public.modis_visitors where (created_at at time zone 'Asia/Jakarta')::date < p_before;
    get diagnostics n = row_count; v_vis := v_vis + n;
    delete from public.modis_slot_reports where report_date < p_before;
    get diagnostics n = row_count; v_slot := v_slot + n;
    delete from public.modis_position_log where (created_at at time zone 'Asia/Jakarta')::date < p_before;
    get diagnostics n = row_count; v_pos := v_pos + n;
    delete from public.modis_device_positions where (updated_at at time zone 'Asia/Jakarta')::date < p_before;
  end if;
  return jsonb_build_object('visitors', v_vis, 'slot_reports', v_slot, 'positions', v_pos);
end;
$$;
revoke all on function public.modis_purge_test_data(boolean, date) from public, anon;
grant execute on function public.modis_purge_test_data(boolean, date) to authenticated;
