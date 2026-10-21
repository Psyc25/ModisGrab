"""
Membuat template Excel laporan klien Cek Boros (dashboard + grafik).

Hasil:
  src/report/report-template.xlsx   template bergaya (sel kosong diisi di browser)
  src/report/report-template.map.json  peta sel & batas baris yang dipakai exportXlsx.ts

Jalankan ulang bila tata letak diubah:
  python3 scripts/build_report_template.py
"""
import io
import json
import os

from openpyxl import Workbook
from openpyxl.chart import BarChart, DoughnutChart, LineChart, Reference
from openpyxl.chart.label import DataLabelList
from openpyxl.chart.layout import Layout, ManualLayout
from openpyxl.drawing.image import Image as XLImage
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "src", "report", "report-template.xlsx")
MAP = os.path.join(ROOT, "src", "report", "report-template.map.json")

# Warna Grab / MODIS
GREEN = "00B14F"
DEEP = "005239"
TINT = "E5F7ED"
TINT2 = "F3FBF6"
HEAD = "363A45"
INK = "1C1C1C"
INK2 = "5E6672"
LINE = "DDE1E6"
YELLOW = "FFD902"
ORANGE = "F79705"
RED = "DB3735"
WHITE = "FFFFFF"

FONT = "Times New Roman"
MAX_DAILY = 400  # batas baris grafik (diubah di browser sesuai jumlah data)
MAX_ROWS = 60

thin = Side(style="thin", color=LINE)
BOX = Border(left=thin, right=thin, top=thin, bottom=thin)
BOTTOM = Border(bottom=thin)


def fill(c):
    return PatternFill("solid", fgColor=c)


def font(size=10, bold=False, color=INK, italic=False):
    return Font(name=FONT, size=size, bold=bold, color=color, italic=italic)


NUM = "#,##0"
RP = '"Rp"#,##0'
PCT = "0.0%"

wb = Workbook()
layout = {"sheets": {}, "dashboard": {}}

# ---------------------------------------------------------------------
# Lembar data (diisi di browser). Baris 2 = gaya isi, baris 3 = gaya total.
# ---------------------------------------------------------------------
HR = 4  # baris judul kolom di lembar data; data mulai HR + 1


def data_sheet(title, headers, widths, formats, total=True, tab=None, heading=None):
    ws = wb.create_sheet(title)
    ws.sheet_view.showGridLines = False
    if tab:
        ws.sheet_properties.tabColor = tab
    n = len(headers)
    # Judul lembar
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=n)
    t1 = ws.cell(row=1, column=1, value=heading or title.upper())
    t1.font = font(14, True, WHITE)
    t1.fill = fill(GREEN)
    t1.alignment = Alignment(vertical="center", indent=1)
    for i in range(2, n + 1):
        ws.cell(row=1, column=i).fill = fill(GREEN)
    ws.row_dimensions[1].height = 30
    ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=n)
    t2 = ws.cell(row=2, column=1)
    t2.font = font(10, False, INK2, True)
    t2.alignment = Alignment(vertical="center", indent=1)
    ws.row_dimensions[2].height = 20
    ws.row_dimensions[3].height = 6
    for i, (h, w) in enumerate(zip(headers, widths), start=1):
        left = i == 1 and formats[0] == "@"
        c = ws.cell(row=HR, column=i, value=h)
        c.font = font(10, True, WHITE)
        c.fill = fill(DEEP)
        c.alignment = Alignment(horizontal="left" if left else "center", vertical="center", wrap_text=True, indent=1 if left else 0)
        c.border = BOX
        ws.column_dimensions[get_column_letter(i)].width = w
        b = ws.cell(row=HR + 1, column=i)
        b.font = font(11)
        b.border = BOX
        b.number_format = formats[i - 1]
        b.alignment = Alignment(horizontal="left" if formats[i - 1] == "@" else "right", vertical="center", indent=1)
        if total:
            tt = ws.cell(row=HR + 2, column=i)
            tt.font = font(11, True, DEEP)
            tt.fill = fill(TINT)
            tt.border = BOX
            tt.number_format = formats[i - 1]
            tt.alignment = Alignment(horizontal="left" if formats[i - 1] == "@" else "right", vertical="center", indent=1)
    ws.row_dimensions[HR].height = 32
    ws.freeze_panes = ws.cell(row=HR + 1, column=2)
    ws.print_title_rows = f"{HR}:{HR}"
    ws.page_setup.orientation = "landscape"
    ws.page_setup.paperSize = ws.PAPERSIZE_A4
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.page_margins.left = ws.page_margins.right = 0.4
    layout["sheets"][title] = {"cols": n, "total": total, "subtitle": "A2"}
    return ws


ROW_HEAD = ["Nama", "Reach", "Contact", "Conversion", "Conv. rate", "Visitor", "Orang unik", "Stamp", "Rata² hemat / bln"]
ROW_FMT = ["@", NUM, NUM, NUM, PCT, NUM, NUM, NUM, RP]
ROW_W = [38, 12, 12, 13, 12, 11, 12, 11, 18]

dash = wb.active
dash.title = "Dashboard"

harian = data_sheet(
    "Harian",
    ["Tanggal", "Hari ke-", "Reach", "Contact", "Conversion", "Target Conv.", "Visitor", "Orang unik", "Stamp", "Rata² hemat / bln", "Kumulatif Conv.", "Kumulatif Target"],
    [14, 9, 11, 11, 12, 12, 10, 11, 10, 17, 15, 16],
    ["@", "0", NUM, NUM, NUM, NUM, NUM, NUM, NUM, RP, NUM, NUM],
    tab=GREEN,
)
unit = data_sheet("Unit & Slot", ROW_HEAD, ROW_W, ROW_FMT, tab=GREEN)
kat = data_sheet("Kategori POI", ROW_HEAD, ROW_W, ROW_FMT, tab=GREEN)
lok = data_sheet("Lokasi", ROW_HEAD, ROW_W, ROW_FMT, tab=GREEN)
mgg = data_sheet("Mingguan", ROW_HEAD, ROW_W, ROW_FMT, tab=GREEN)
bln = data_sheet("Bulanan", ROW_HEAD, ROW_W, ROW_FMT, tab=GREEN)
cmp_ = data_sheet(
    "Perbandingan",
    ["Hari ke-", "Tanggal A", "Conversion A", "Visitor A", "Tanggal B", "Conversion B", "Visitor B"],
    [10, 13, 14, 12, 13, 14, 12],
    ["0", "@", NUM, NUM, "@", NUM, NUM],
    total=True,
    tab=ORANGE,
)
vis = data_sheet(
    "Visitor",
    ["Waktu (WIB)", "Nama depan", "WhatsApp (tersamar)", "Lokasi", "Kategori POI", "Unit", "Jam jaga", "Status boros", "Potensi hemat / bln", "Stamp"],
    [17, 14, 18, 34, 18, 14, 13, 15, 18, 28],
    ["@", "@", "@", "@", "@", "@", "@", "@", RP, "@"],
    total=False,
    tab=INK2,
)

# Grafik perbandingan di lembar Perbandingan
lc = LineChart()
lc.title = "Conversion per hari: Periode A vs B"
lc.height, lc.width = 8.5, 22
lc.add_data(Reference(cmp_, min_col=3, min_row=HR, max_row=HR + MAX_DAILY), titles_from_data=True)
lc.add_data(Reference(cmp_, min_col=6, min_row=HR, max_row=HR + MAX_DAILY), titles_from_data=True)
lc.set_categories(Reference(cmp_, min_col=1, min_row=HR + 1, max_row=HR + MAX_DAILY))
for s, col in zip(lc.series, [GREEN, ORANGE]):
    s.graphicalProperties.line.solidFill = col
    s.graphicalProperties.line.width = 28000
    s.smooth = False
lc.x_axis.title = "Hari ke-"
lc.x_axis.delete = False
lc.y_axis.delete = False
lc.legend.position = "b"
cmp_.add_chart(lc, "I4")

# ---------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------
ws = dash
ws.sheet_view.showGridLines = False
ws.sheet_view.zoomScale = 90
ws.sheet_properties.tabColor = DEEP
COLS = 13  # A (margin) + B..M
ws.column_dimensions["A"].width = 2.5
for i in range(2, COLS + 1):
    ws.column_dimensions[get_column_letter(i)].width = 12.5
ws.column_dimensions["N"].width = 2.5

D = layout["dashboard"]


def band(row, text, h=24):
    ws.merge_cells(start_row=row, start_column=2, end_row=row, end_column=13)
    c = ws.cell(row=row, column=2, value=text)
    c.font = font(11, True, WHITE)
    c.fill = fill(DEEP)
    c.alignment = Alignment(vertical="center", indent=1)
    ws.row_dimensions[row].height = h


def merge_set(r1, c1, r2, c2, value=None, f=None, al=None, fl=None, fmt=None, border=None):
    if (r1, c1) != (r2, c2):
        ws.merge_cells(start_row=r1, start_column=c1, end_row=r2, end_column=c2)
    c = ws.cell(row=r1, column=c1)
    if value is not None:
        c.value = value
    if f:
        c.font = f
    if al:
        c.alignment = al
    if fmt:
        c.number_format = fmt
    for rr in range(r1, r2 + 1):
        for cc in range(c1, c2 + 1):
            x = ws.cell(row=rr, column=cc)
            if fl:
                x.fill = fl
            if border:
                x.border = border
    return f"{get_column_letter(c1)}{r1}"


# Header band (baris 1-4)
for r in range(1, 5):
    for cidx in range(1, 15):
        ws.cell(row=r, column=cidx).fill = fill(GREEN if r < 4 else DEEP)
    ws.row_dimensions[r].height = 22 if r < 4 else 5
ws.row_dimensions[2].height = 30

# Logo MODIS
logo_src = os.path.join(ROOT, "src", "assets", "brand", "modis-logo.webp")
im = Image.open(logo_src).convert("RGBA")
im.thumbnail((220, 112))
buf = io.BytesIO()
im.save(buf, format="PNG")
buf.seek(0)
xl_img = XLImage(buf)
xl_img.width, xl_img.height = im.size[0] * 0.62, im.size[1] * 0.62
ws.add_image(xl_img, "B1")

merge_set(1, 4, 1, 10, "REPORT TRACKING HARIAN · CEK BOROS", font(9, True, YELLOW), Alignment(vertical="bottom"))
D["title"] = merge_set(2, 4, 2, 10, None, font(18, True, WHITE), Alignment(vertical="center"))
D["subtitle"] = merge_set(3, 4, 3, 10, None, font(10, False, "E6F5EC"), Alignment(vertical="top"))
merge_set(1, 11, 1, 13, "DIUNDUH", font(8, True, "CDEFD9"), Alignment(horizontal="right", vertical="bottom"))
D["downloaded"] = merge_set(2, 11, 2, 13, None, font(10, True, WHITE), Alignment(horizontal="right", vertical="center"))
D["live_link"] = merge_set(3, 11, 3, 13, None, Font(name=FONT, size=9, bold=True, color=YELLOW, underline="single"), Alignment(horizontal="right", vertical="top"))

# Info periode (baris 6-7)
r = 6
for c1, c2, lab in [(2, 4, "PERIODE LAPORAN (A)"), (5, 7, "PEMBANDING (B)"), (8, 10, "FILTER"), (11, 13, "PROGRES CAMPAIGN")]:
    merge_set(r, c1, r, c2, lab, font(8, True, INK2), Alignment(vertical="bottom"))
ws.row_dimensions[6].height = 16
D["period"] = merge_set(7, 2, 7, 4, None, font(12, True, INK), Alignment(vertical="center"), border=BOTTOM)
D["period_b"] = merge_set(7, 5, 7, 7, None, font(12, True, INK), Alignment(vertical="center"), border=BOTTOM)
D["filters"] = merge_set(7, 8, 7, 10, None, font(10, False, INK), Alignment(vertical="center", wrap_text=True), border=BOTTOM)
D["day_no"] = merge_set(7, 11, 7, 13, None, font(12, True, INK), Alignment(vertical="center"), border=BOTTOM)
ws.row_dimensions[7].height = 26

# KPI tiles
band(9, "KPI PERIODE LAPORAN")
tiles = [
    ("reach", "REACH"), ("contact", "CONTACT"), ("conversion", "CONVERSION"), ("rate", "CONTACT RATE · CONV. RATE"),
    ("visits", "VISITOR TERDAFTAR"), ("unique", "VISITOR UNIK (1 NOMOR WA = 1 ORANG)"),
]
D["tiles"] = {}
for i, (key, label) in enumerate(tiles):
    row0 = 11 if i < 4 else 16
    # Baris 1: 4 kotak (3 kolom); baris 2: 2 kotak lebar (6 kolom)
    c1 = 2 + i * 3 if i < 4 else 2 + (i - 4) * 6
    c2 = c1 + (2 if i < 4 else 5)
    for rr in range(row0, row0 + 4):
        for cc in range(c1, c2 + 1):
            x = ws.cell(row=rr, column=cc)
            x.fill = fill(TINT2 if i < 4 else WHITE)
            x.border = Border(
                left=thin if cc == c1 else None,
                right=thin if cc == c2 else None,
                top=thin if rr == row0 else None,
                bottom=thin if rr == row0 + 3 else None,
            )
    # garis aksen kiri
    for rr in range(row0, row0 + 4):
        ws.cell(row=rr, column=c1).border = Border(left=Side(style="thick", color=GREEN if i < 4 else YELLOW),
                                                   top=thin if rr == row0 else None, bottom=thin if rr == row0 + 3 else None)
    merge_set(row0, c1, row0, c2, label, font(9, True, INK2), Alignment(vertical="bottom", indent=1))
    v = merge_set(row0 + 1, c1, row0 + 1, c2, None, font(20, True, DEEP if i < 4 else INK), Alignment(horizontal="left", vertical="center", indent=1),
                  fmt=(RP if key == "savings" else PCT if key == "rate" else NUM))
    s1 = merge_set(row0 + 2, c1, row0 + 2, c2, None, font(9, False, INK2), Alignment(vertical="center", indent=1))
    s2 = merge_set(row0 + 3, c1, row0 + 3, c2, None, font(9, True, GREEN), Alignment(vertical="top", indent=1))
    D["tiles"][key] = {"value": v, "sub": s1, "delta": s2}
for rr in (11, 16):
    ws.row_dimensions[rr].height = 18
    ws.row_dimensions[rr + 1].height = 32
    ws.row_dimensions[rr + 2].height = 16
    ws.row_dimensions[rr + 3].height = 16
ws.row_dimensions[15].height = 8

# Progres campaign
band(21, "PROGRES CAMPAIGN S/D HARI INI")
heads = [(2, 3, "KPI"), (4, 5, "Aktual"), (6, 7, "Target s/d hari ini"), (8, 9, "% vs target hari ini"), (10, 11, "Target campaign"), (12, 13, "% vs target campaign")]
for c1, c2, h in heads:
    merge_set(22, c1, 22, c2, h, font(9, True, WHITE), Alignment(horizontal="center" if c1 > 2 else "left", vertical="center", indent=0 if c1 > 2 else 1), fill(HEAD), border=BOX)
ws.row_dimensions[22].height = 22
D["progress"] = []
for j, k in enumerate(["Reach", "Contact", "Conversion"]):
    rr = 23 + j
    row = {}
    for c1, c2, h in heads:
        fmt = PCT if "%" in h else NUM
        cell = merge_set(rr, c1, rr, c2, k if c1 == 2 else None, font(11, c1 == 2 or c1 == 4, INK),
                         Alignment(horizontal="left" if c1 == 2 else "right", vertical="center", indent=1), fill(WHITE if j % 2 == 0 else TINT2), fmt, BOX)
        row[h] = cell
    D["progress"].append(row)
    ws.row_dimensions[rr].height = 22

# Grafik
band(27, "GRAFIK")
D["chart_rows"] = {"top": 28}

def style_axes(ch, zero=True):
    ch.x_axis.delete = False
    ch.y_axis.delete = False
    if zero:
        ch.y_axis.scaling.min = 0
    ch.y_axis.majorGridlines.spPr = None
    ch.legend.position = "b"


# 1. Tren harian (combo)
bar = BarChart()
bar.type = "col"
bar.title = "Tren harian: Conversion vs target & visitor"
bar.add_data(Reference(harian, min_col=5, min_row=HR, max_row=HR + MAX_DAILY), titles_from_data=True)
bar.set_categories(Reference(harian, min_col=1, min_row=HR + 1, max_row=HR + MAX_DAILY))
bar.series[0].graphicalProperties.solidFill = GREEN
bar.series[0].graphicalProperties.line.noFill = True
bar.gapWidth = 60
line = LineChart()
line.add_data(Reference(harian, min_col=6, min_row=HR, max_row=HR + MAX_DAILY), titles_from_data=True)
line.series[0].graphicalProperties.line.solidFill = INK
line.series[0].graphicalProperties.line.dashStyle = "dash"
line.series[0].graphicalProperties.line.width = 19000
line.series[0].smooth = False
line2 = LineChart()
line2.add_data(Reference(harian, min_col=7, min_row=HR, max_row=HR + MAX_DAILY), titles_from_data=True)
line2.series[0].graphicalProperties.line.solidFill = ORANGE
line2.series[0].graphicalProperties.line.width = 25000
line2.series[0].smooth = False
line2.y_axis.axId = 200
line2.y_axis.title = "Visitor"
line2.y_axis.crosses = "max"
line2.y_axis.delete = False
style_axes(bar)
bar += line
bar += line2
bar.height, bar.width = 8.2, 14.3
ws.add_chart(bar, "B28")

# 2. Kumulatif conversion vs target
cum = LineChart()
cum.title = "Kumulatif conversion vs target"
cum.add_data(Reference(harian, min_col=11, min_row=HR, max_row=HR + MAX_DAILY), titles_from_data=True)
cum.add_data(Reference(harian, min_col=12, min_row=HR, max_row=HR + MAX_DAILY), titles_from_data=True)
cum.set_categories(Reference(harian, min_col=1, min_row=HR + 1, max_row=HR + MAX_DAILY))
cum.series[0].graphicalProperties.line.solidFill = GREEN
cum.series[0].graphicalProperties.line.width = 32000
cum.series[1].graphicalProperties.line.solidFill = INK2
cum.series[1].graphicalProperties.line.dashStyle = "dash"
for _s in cum.series:
    _s.smooth = False
style_axes(cum)
cum.height, cum.width = 8.2, 14.3
ws.add_chart(cum, "H28")

# 3. Aktual vs target (dari tabel progres)
avt = BarChart()
avt.type = "bar"
avt.title = "Aktual vs target s/d hari ini"
avt.add_data(Reference(ws, min_col=4, min_row=22, max_row=25), titles_from_data=True)
avt.add_data(Reference(ws, min_col=6, min_row=22, max_row=25), titles_from_data=True)
avt.set_categories(Reference(ws, min_col=2, min_row=23, max_row=25))
avt.series[0].graphicalProperties.solidFill = GREEN
avt.series[1].graphicalProperties.solidFill = "C9CED6"
avt.gapWidth = 50
style_axes(avt)
avt.height, avt.width = 8.2, 14.3
ws.add_chart(avt, "B45")

# 4. Status boros (doughnut) dari tabel status di dashboard
STATUS_ROW = 82
dn = DoughnutChart()
dn.title = "Status boros visitor"
dn.add_data(Reference(ws, min_col=4, min_row=STATUS_ROW - 1, max_row=STATUS_ROW + 3), titles_from_data=True)
dn.set_categories(Reference(ws, min_col=2, min_row=STATUS_ROW, max_row=STATUS_ROW + 3))
dn.holeSize = 55
from openpyxl.chart.series import DataPoint
for idx, col in enumerate([RED, ORANGE, YELLOW, GREEN]):
    pt = DataPoint(idx=idx)
    pt.graphicalProperties.solidFill = col
    pt.graphicalProperties.line.solidFill = WHITE
    dn.series[0].dPt.append(pt)
dn.dataLabels = DataLabelList()
dn.dataLabels.showPercent = True
dn.dataLabels.showVal = False
dn.dataLabels.showCatName = False
dn.dataLabels.showSerName = False
dn.dataLabels.showLeaderLines = False
dn.dataLabels.showLegendKey = False
dn.legend.position = "b"
dn.height, dn.width = 8.2, 14.3
ws.add_chart(dn, "H45")

# 5. Conversion per unit & slot
us = BarChart()
us.type = "bar"
us.title = "Conversion per unit · slot"
us.add_data(Reference(unit, min_col=4, min_row=HR, max_row=HR + MAX_ROWS), titles_from_data=True)
us.set_categories(Reference(unit, min_col=1, min_row=HR + 1, max_row=HR + MAX_ROWS))
us.series[0].graphicalProperties.solidFill = GREEN
us.gapWidth = 50
us.dataLabels = DataLabelList()
us.dataLabels.showVal = True
us.dataLabels.showSerName = False
us.dataLabels.showCatName = False
us.dataLabels.showLegendKey = False
style_axes(us)
us.legend = None
us.height, us.width = 8.2, 14.3
ws.add_chart(us, "B62")

# 6. Visitor per kategori POI
kc = BarChart()
kc.type = "col"
kc.title = "Visitor Cek Boros per kategori POI"
kc.add_data(Reference(kat, min_col=6, min_row=HR, max_row=HR + MAX_ROWS), titles_from_data=True)
kc.set_categories(Reference(kat, min_col=1, min_row=HR + 1, max_row=HR + MAX_ROWS))
kc.series[0].graphicalProperties.solidFill = YELLOW
kc.gapWidth = 50
kc.dataLabels = DataLabelList()
kc.dataLabels.showVal = True
kc.dataLabels.showSerName = False
kc.dataLabels.showCatName = False
kc.dataLabels.showLegendKey = False
style_axes(kc)
kc.legend = None
kc.height, kc.width = 8.2, 14.3
ws.add_chart(kc, "H62")

# Tabel: status boros & hadiah (baris 80-)
band(79, "STATUS BOROS VISITOR  ·  STAMP PER TINGKAT")
for c1, c2, h in [(2, 3, "Status boros"), (4, 5, "Visitor"), (6, 7, "Rata² hemat / bln")]:
    merge_set(STATUS_ROW - 1, c1, STATUS_ROW - 1, c2, h, font(9, True, WHITE), Alignment(horizontal="left" if c1 == 2 else "right", vertical="center", indent=1), fill(HEAD), border=BOX)
for c1, c2, h in [(9, 11, "Tingkat stamp"), (12, 13, "Jumlah")]:
    merge_set(STATUS_ROW - 1, c1, STATUS_ROW - 1, c2, h, font(9, True, WHITE), Alignment(horizontal="left" if c1 == 9 else "right", vertical="center", indent=1), fill(HEAD), border=BOX)
ws.row_dimensions[STATUS_ROW - 2].height = 6
D["status_rows"] = []
D["reward_rows"] = []
dots = [RED, "D97A00", "B38B00", GREEN]
for j in range(4):
    rr = STATUS_ROW + j
    bg = fill(WHITE if j % 2 == 0 else TINT2)
    lab = merge_set(rr, 2, rr, 3, None, font(10, True, dots[j] if j < 3 else DEEP), Alignment(vertical="center", indent=1), bg, border=BOX)
    v = merge_set(rr, 4, rr, 5, None, font(10, True, INK), Alignment(horizontal="right", vertical="center", indent=1), bg, NUM, BOX)
    s = merge_set(rr, 6, rr, 7, None, font(10, False, INK), Alignment(horizontal="right", vertical="center", indent=1), bg, RP, BOX)
    D["status_rows"].append([lab, v, s])
    ws.row_dimensions[rr].height = 20
for j in range(6):
    rr = STATUS_ROW + j
    bg = fill(WHITE if j % 2 == 0 else TINT2)
    lab = merge_set(rr, 9, rr, 11, None, font(10, False, INK), Alignment(vertical="center", indent=1), bg, border=BOX)
    v = merge_set(rr, 12, rr, 13, None, font(10, True, INK), Alignment(horizontal="right", vertical="center", indent=1), bg, NUM, BOX)
    D["reward_rows"].append([lab, v])
    ws.row_dimensions[rr].height = 20

# Tabel: ringkasan unit & slot + stok merch
UNIT_ROW = 91
band(UNIT_ROW - 2, "RINGKASAN PER UNIT · SLOT")
ucols = [(2, 4, "Unit · slot"), (5, 5, "Reach"), (6, 6, "Contact"), (7, 7, "Conversion"), (8, 8, "Conv. rate"), (9, 9, "Visitor"), (10, 10, "Unik"), (11, 11, "Stamp"), (12, 13, "Rata² hemat / bln")]
for c1, c2, h in ucols:
    merge_set(UNIT_ROW - 1, c1, UNIT_ROW - 1, c2, h, font(9, True, WHITE), Alignment(horizontal="left" if c1 == 2 else "right", vertical="center", indent=1), fill(HEAD), border=BOX)
D["unit_rows"] = []
UNIT_MAX = 8
fmts = ["@", NUM, NUM, NUM, PCT, NUM, NUM, NUM, RP]
for j in range(UNIT_MAX + 1):  # baris terakhir = total
    rr = UNIT_ROW + j
    is_total = j == UNIT_MAX
    bg = fill(TINT if is_total else (WHITE if j % 2 == 0 else TINT2))
    row = []
    for (c1, c2, h), fm in zip(ucols, fmts):
        row.append(merge_set(rr, c1, rr, c2, None, font(10, is_total or c1 == 2, DEEP if is_total else INK),
                             Alignment(horizontal="left" if c1 == 2 else "right", vertical="center", indent=1), bg, fm, BOX))
    D["unit_rows"].append(row)
    ws.row_dimensions[rr].height = 20

MERCH_ROW = UNIT_ROW + UNIT_MAX + 4
band(MERCH_ROW - 2, "STOK MERCHANDISE (S/D HARI INI)  ·  KATEGORI POI")
for c1, c2, h in [(2, 3, "Item"), (4, 4, "Stok awal"), (5, 5, "Keluar"), (6, 6, "Sisa"), (7, 7, "% terpakai")]:
    merge_set(MERCH_ROW - 1, c1, MERCH_ROW - 1, c2, h, font(9, True, WHITE), Alignment(horizontal="left" if c1 == 2 else "right", vertical="center", indent=1), fill(HEAD), border=BOX)
for c1, c2, h in [(9, 10, "Kategori POI"), (11, 11, "Visitor"), (12, 12, "Conversion"), (13, 13, "% visitor")]:
    merge_set(MERCH_ROW - 1, c1, MERCH_ROW - 1, c2, h, font(9, True, WHITE), Alignment(horizontal="left" if c1 == 9 else "right", vertical="center", indent=1), fill(HEAD), border=BOX)
D["merch_rows"] = []
D["cat_rows"] = []
for j in range(5):
    rr = MERCH_ROW + j
    bg = fill(TINT if j == 4 else (WHITE if j % 2 == 0 else TINT2))
    if j < 5:
        row = [merge_set(rr, 2, rr, 3, None, font(10, True, DEEP if j == 4 else INK), Alignment(vertical="center", indent=1), bg, border=BOX)]
        for cc, fm in [(4, NUM), (5, NUM), (6, NUM), (7, PCT)]:
            row.append(merge_set(rr, cc, rr, cc, None, font(10, j == 4, DEEP if j == 4 else INK), Alignment(horizontal="right", vertical="center", indent=1), bg, fm, BOX))
        D["merch_rows"].append(row)
    ws.row_dimensions[rr].height = 20
for j in range(6):
    rr = MERCH_ROW + j
    is_total = j == 5
    bg = fill(TINT if is_total else (WHITE if j % 2 == 0 else TINT2))
    row = [merge_set(rr, 9, rr, 10, None, font(10, True, DEEP if is_total else INK), Alignment(vertical="center", indent=1), bg, border=BOX)]
    for cc, fm in [(11, NUM), (12, NUM), (13, PCT)]:
        row.append(merge_set(rr, cc, rr, cc, None, font(10, is_total, DEEP if is_total else INK), Alignment(horizontal="right", vertical="center", indent=1), bg, fm, BOX))
    D["cat_rows"].append(row)
    ws.row_dimensions[rr].height = 20

FOOT = MERCH_ROW + 7
D["note"] = merge_set(FOOT, 2, FOOT, 13, None, font(9, False, INK2, True), Alignment(vertical="center", wrap_text=True))
ws.row_dimensions[FOOT].height = 30
D["note2"] = merge_set(FOOT + 1, 2, FOOT + 1, 13, "Data visitor ditampilkan tersamar sesuai UU PDP. Lembar lain: Harian, Unit & Slot, Kategori POI, Lokasi, Mingguan, Bulanan, Perbandingan, Visitor.",
                       font(9, False, INK2, True), Alignment(vertical="center", wrap_text=True))

ws.freeze_panes = "A5"
from openpyxl.worksheet.pagebreak import Break
ws.row_breaks.append(Break(id=26))
ws.row_breaks.append(Break(id=STATUS_ROW - 4))
ws.print_area = f"A1:N{FOOT + 1}"
ws.page_setup.orientation = "portrait"
ws.page_setup.fitToWidth = 1
ws.page_setup.fitToHeight = 0
ws.sheet_properties.pageSetUpPr.fitToPage = True

layout["max_daily"] = MAX_DAILY
layout["data_start"] = HR + 1
layout["max_rows"] = MAX_ROWS
layout["unit_max"] = UNIT_MAX

wb.save(OUT)

# ---- Pasca-proses: font Times New Roman untuk default buku kerja & semua grafik
import re
import shutil
import zipfile

tmp = OUT + ".tmp"
A_NS = "http://schemas.openxmlformats.org/drawingml/2006/main"
TXPR = (
    f'<txPr><a:bodyPr xmlns:a="{A_NS}"/><a:lstStyle xmlns:a="{A_NS}"/><a:p xmlns:a="{A_NS}"><a:pPr><a:defRPr sz="900">'
    '<a:solidFill><a:srgbClr val="1C1C1C"/></a:solidFill>'
    f'<a:latin typeface="{FONT}"/><a:cs typeface="{FONT}"/></a:defRPr></a:pPr>'
    '<a:endParaRPr lang="id-ID"/></a:p></txPr>'
)
TITLE_RPR = f'<a:defRPr sz="1100" b="1"><a:solidFill><a:srgbClr val="005239"/></a:solidFill><a:latin typeface="{FONT}"/><a:cs typeface="{FONT}"/></a:defRPr>'
with zipfile.ZipFile(OUT) as zin, zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
    for item in zin.infolist():
        data = zin.read(item.filename)
        if re.match(r"xl/charts/chart\d+\.xml", item.filename):
            x = data.decode("utf-8")
            x = x.replace("<a:defRPr/>", TITLE_RPR)
            m = re.search(r"</chart>(<spPr>.*?</spPr>)?", x, re.S)
            x = x[: m.end()] + TXPR + x[m.end():]
            data = x.encode("utf-8")
        elif item.filename == "xl/styles.xml":
            x = data.decode("utf-8")
            x = re.sub(r'<name val="Calibri"\s*/>', f'<name val="{FONT}"/>', x, count=1)
            x = x.replace('<scheme val="minor"/>', '')
            data = x.encode("utf-8")
        zout.writestr(item, data)
shutil.move(tmp, OUT)
with open(MAP, "w") as f:
    json.dump(layout, f, indent=1)
print("OK", OUT)
