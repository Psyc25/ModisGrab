-- Hapus semua data uji [QC] (jalankan di Supabase SQL editor). Foto uji ikut dihapus lewat skrip PC atau panel office.
begin;
delete from public.modis_stamp_cards where pahe_id like 'qc\_%';
delete from public.modis_boros_checks where op_id like 'qc\_%';
delete from public.modis_issues where id like 'qc\_%';
delete from public.modis_stock_moves where by_name like '[QC]%';
delete from public.modis_close_days where closed_by like '[QC]%';
delete from public.modis_conversions where id like 'qc\_%' or spg_name like '[QC]%';
commit;
