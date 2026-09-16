"""Redraw the README charts from site/src/data/routes.json.

    uv run --with matplotlib python docs/charts.py
"""
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs"
rows = json.loads((ROOT / "site/src/data/routes.json").read_text())

SURFACE, INK, INK2, MUTED, GRID, AXIS = "#fcfcfb", "#0b0b0b", "#52514e", "#898781", "#e1e0d9", "#c3c2b7"
BLUE, ORANGE, LIGHTBLUE = "#2a78d6", "#eb6834", "#86b6ef"
plt.rcParams.update({
    "font.family": ["Helvetica Neue", "Helvetica", "Arial", "DejaVu Sans"],
    "figure.facecolor": SURFACE, "axes.facecolor": SURFACE, "savefig.facecolor": SURFACE,
    "axes.edgecolor": AXIS, "axes.linewidth": 1, "axes.spines.top": False, "axes.spines.right": False,
    "grid.color": GRID, "grid.linewidth": 1, "axes.axisbelow": True,
    "xtick.color": MUTED, "ytick.color": MUTED, "text.color": INK, "axes.labelcolor": INK2,
    "axes.titlelocation": "left", "axes.titleweight": "bold", "axes.titlesize": 13, "axes.titlecolor": INK,
    "font.size": 10, "legend.frameon": False,
})

cable = {r["route_id"] for r in rows if "CABLE" in r["route_name"]}
quart = {k: [r for r in rows if r["income_quartile"] == k] for k in (1, 2, 3, 4)}
qlabels = ["Q1\nlowest income", "Q2", "Q3", "Q4\nhighest income"]
mean = lambda xs: sum(xs) / len(xs)


def title(fig, text, sub=None):
    fig.text(0.04, 0.95, text, fontsize=14, fontweight="bold", color=INK, va="top")
    if sub:
        fig.text(0.04, 0.895, sub, fontsize=10, color=INK2, va="top")


delay_all = [mean([r["avg_delay_min"] for r in quart[k]]) for k in (1, 2, 3, 4)]
delay_nocc = [mean([r["avg_delay_min"] for r in quart[k] if r["route_id"] not in cable]) for k in (1, 2, 3, 4)]
ontime = [mean([r["pct_on_time"] for r in quart[k]]) for k in (1, 2, 3, 4)]

fig, (a, b) = plt.subplots(1, 2, figsize=(11, 4.8), gridspec_kw={"wspace": 0.35})
fig.subplots_adjust(top=0.78, bottom=0.16, left=0.06, right=0.98)
title(fig, "Routes serving the lowest-income tracts run later, and the cable cars are most of it",
      "68 Muni routes in income quartiles of 17. Average delay per route, December 2025 to February 2026.")
x = np.arange(4)
w = 0.16
a.bar(x - 0.1, delay_all, w, color=BLUE, label="all routes")
a.bar(x + 0.1, delay_nocc, w, color=ORANGE, label="without the 3 cable cars")
for xi, v in zip(x - 0.1, delay_all):
    a.text(xi, v + 0.08, f"{v:.1f}", ha="center", va="bottom", fontsize=9, color=INK)
for xi, v in zip(x + 0.1, delay_nocc):
    a.text(xi, v + 0.08, f"{v:.1f}", ha="center", va="bottom", fontsize=9, color=INK)
a.set_xticks(x, qlabels)
a.set_yticks([])
a.spines["left"].set_visible(False)
a.set_title("Average delay, minutes")
a.legend(loc="upper right")
a.set_ylim(0, 4.6)

b.bar(x, ontime, w, color=BLUE)
for xi, v in zip(x, ontime):
    b.text(xi, v + 0.8, f"{v:.1f}%", ha="center", va="bottom", fontsize=9, color=INK)
b.set_xticks(x, qlabels)
b.set_yticks([])
b.spines["left"].set_visible(False)
b.set_title("Share of arrivals on time (1 min early to 5 min late)")
b.set_ylim(0, 68)
fig.savefig(OUT / "quartiles.png", dpi=150)
plt.close(fig)

fig, ax = plt.subplots(figsize=(11, 5.6))
fig.subplots_adjust(top=0.82, bottom=0.12, left=0.07, right=0.98)
title(fig, "Every route: neighborhood income against average delay",
      "Weighted median household income of the tracts a route stops in (ACS 2020 to 2024) vs its average delay.")
inc = np.array([r["weighted_median_income"] for r in rows]) / 1000
dly = np.array([r["avg_delay_min"] for r in rows])
is_cc = np.array([r["route_id"] in cable for r in rows])
ax.scatter(inc[~is_cc], dly[~is_cc], s=46, color=BLUE, edgecolors=SURFACE, linewidths=1.5, label="bus and rail routes", zorder=3)
ax.scatter(inc[is_cc], dly[is_cc], s=46, color=ORANGE, edgecolors=SURFACE, linewidths=1.5, label="cable cars", zorder=4)
names = {"SF:PH": "Powell-Hyde", "SF:PM": "Powell-Mason", "SF:CA": "California St"}
for r in rows:
    if r["route_id"] in names:
        ax.annotate(names[r["route_id"]], (r["weighted_median_income"] / 1000, r["avg_delay_min"]),
                    xytext=(8, 0), textcoords="offset points", va="center", fontsize=9, color=INK2)
m, c = np.polyfit(inc, dly, 1)
xs = np.linspace(inc.min(), inc.max(), 2)
ax.plot(xs, m * xs + c, color=MUTED, linewidth=1.5, zorder=2, label="linear fit, Pearson r = -0.26 (p = 0.03)")
ax.grid(axis="y")
ax.set_xlabel("Weighted median household income of the route's tracts, $ thousands")
ax.set_ylabel("Average delay, minutes")
ax.xaxis.set_major_formatter(lambda v, _: f"${v:.0f}k")
ax.legend(loc="upper right")
fig.savefig(OUT / "income-vs-delay.png", dpi=150)
plt.close(fig)

hours = list(range(5, 24))


def by_hour(rs):
    out = []
    for i, _ in enumerate(hours):
        vals = [r["delay_by_hour"][i] for r in rs if r["delay_by_hour"][i] > 0]  # 0.0 means no service that hour
        out.append(mean(vals) if vals else np.nan)
    return out


fig, ax = plt.subplots(figsize=(11, 5))
fig.subplots_adjust(top=0.8, bottom=0.14, left=0.07, right=0.98)
title(fig, "The gap by hour of day",
      "Average delay per route, by scheduled hour. 0 means no service that hour in the source and is left out.")
series = [
    ("Q1, lowest income, all 17 routes", by_hour(quart[1]), BLUE),
    ("Q1 without the cable cars", by_hour([r for r in quart[1] if r["route_id"] not in cable]), LIGHTBLUE),
    ("Q4, highest income", by_hour(quart[4]), ORANGE),
]
for label, ys, col in series:
    ax.plot(hours, ys, color=col, linewidth=2, solid_joinstyle="round", solid_capstyle="round", label=label)
ax.grid(axis="y")
ax.set_xticks(hours[::2], [f"{h}:00" for h in hours[::2]])
ax.set_ylabel("Average delay, minutes")
ax.set_ylim(bottom=0)
ax.legend(loc="upper right")
fig.savefig(OUT / "by-hour.png", dpi=150)
plt.close(fig)
print("delay_all", [round(v, 2) for v in delay_all], "delay_nocc", [round(v, 2) for v in delay_nocc], "ontime", [round(v, 1) for v in ontime])
for label, ys, _ in series:
    print(label, [None if np.isnan(v) else round(v, 1) for v in ys])
