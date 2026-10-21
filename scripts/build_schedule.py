"""
Membuat src/data/runningSchedule.ts dari Master Timeline (tab Running Schedule 98 Hari & List POI).
Pemakaian: python3 scripts/build_schedule.py /path/2026_GRAB_MODIS_Master-Timeline.xlsx
Hanya jadwal & nama POI yang diambil (tanpa kontak PIC).
"""
import json
import sys
from datetime import datetime

import openpyxl

src = sys.argv[1]
wb = openpyxl.load_workbook(src, data_only=True)

CAT = {"Stasiun": "Station", "Kampus & Sekolah": "Campus", "Perkantoran": "Office", "HOP & Area Publik": "HOP & Public Space"}

poi = {}
ws = wb["List POI"]
for r in ws.iter_rows(min_row=2, values_only=True):
    name, cat, area = r[6], r[5], r[2]
    if name and cat:
        poi[str(name).strip()] = {"cat": CAT.get(str(cat).strip(), "HOP & Public Space"), "area": str(area or "").strip()}

days = []
ws = wb["Running Schedule 98 Hari"]
for r in ws.iter_rows(min_row=5, values_only=True):
    if not isinstance(r[0], (int, float)) or not r[1]:
        continue
    d = datetime.strptime(str(r[1]), "%d/%m/%Y").strftime("%Y-%m-%d")
    days.append([d, str(r[4] or ""), *(str(x or "").strip() for x in r[5:10])])

import re


def guess(name):
    n = name.lower()
    if re.match(r"(st\.|stasiun|halte|terminal|lrt|mrt|pool bus|krl)", n):
        return "Station"
    if re.search(r"(universitas|institut|politeknik|sma |smk |sekolah|kampus|akademi|stie|stmik|binus|college)", n):
        return "Campus"
    if re.search(r"(perkantoran|kantor|balai kota|gedung|tower|office|science center|bri n|pemkot|walikota)", n):
        return "Office"
    return "HOP & Public Space"


missing = sorted({loc for d in days for loc in d[2:] if loc and loc not in poi})
for d in days:
    for loc in d[2:]:
        if loc and loc not in poi:
            poi[loc] = {"cat": guess(loc), "area": d[1]}
out = f"""/**
 * Running Schedule 98 hari (26 Okt 2026 – 31 Jan 2027) dari Master Timeline.
 * Dibuat otomatis oleh scripts/build_schedule.py — jangan diedit manual.
 * Tiap hari: [tanggal, area, Mobil Pagi, Mobil Siang, Mobil Sore/Malam, Kiosk 1, Kiosk 2]
 */
export type ScheduleDay = [string, string, string, string, string, string, string];

export const RUNNING_SCHEDULE: ScheduleDay[] = {json.dumps(days, ensure_ascii=False, indent=0)};

/** Nama POI -> kategori aplikasi & wilayah (dari tab List POI). */
export const POI_INDEX: Record<string, {{ cat: 'Station' | 'Campus' | 'Office' | 'HOP & Public Space'; area: string }}> = {json.dumps(poi, ensure_ascii=False, indent=0)};
"""
open("src/data/runningSchedule.ts", "w").write(out)
print(len(days), "hari,", len(poi), "POI; POI jadwal tanpa kategori:", len(missing), missing[:10])
