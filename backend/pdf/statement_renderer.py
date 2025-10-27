# backend/pdf/statement_renderer.py
from __future__ import annotations

import os
from datetime import date as _date
from typing import Optional, Dict, Any

from reportlab.lib.pagesizes import LETTER
from reportlab.pdfgen import canvas
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.platypus import Table, TableStyle
from reportlab.lib.utils import ImageReader


# ---------------- paths ----------------
def _default_out_dir() -> str:
    pkg_root = os.path.dirname(os.path.dirname(__file__))  # backend/
    out_dir = os.path.join(pkg_root, "generated_statements")
    return os.path.abspath(out_dir)


# ---------------- formatting helpers ----------------

def _money(x) -> str:
    try:
        v = float(x or 0)
    except Exception:
        return "—"
    # Use a leading minus (e.g., -10,640.51) instead of parentheses
    return f"-{abs(v):,.2f}" if v < 0 else f"{v:,.2f}"


def _pct(x, digits=4) -> str:
    if x is None:
        return "—"
    try:
        return f"{float(x):.{digits}f}%"
    except Exception:
        return "—"

def _roi(x) -> str:
    if x is None:
        return "—"
    try:
        v = float(x)
        sign = "- " if v < 0 else ""
        return f"{sign}{abs(v):.3f} %"
    except Exception:
        return "—"

def _month_label(d: _date) -> str:
    # Sample shows abbreviated months with a trailing dot
    return d.strftime("%b.") if not d.strftime("%b").endswith(".") else d.strftime("%b")

def _ordinal(n: int) -> str:
    if 10 <= n % 100 <= 20:
        suf = "th"
    else:
        suf = {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suf}"

def _period_label(start: _date, end: _date) -> str:
    return f"({_month_label(start)} {start.day}, {start.year} – {_month_label(end)} {end.day}, {end.year})"

def _today_str() -> str:
    return f"{_month_label(_date.today())} {_ordinal(_date.today().day)}, {_date.today().year}"


# ---------------- header drawing ----------------
def _draw_letterhead(c: canvas.Canvas, x: float, y: float, brand: Dict[str, Any]) -> float:
    """
    Draw logo (top-left), address beneath, and date (top-right).
    Returns the y coordinate below the block.
    """
    page_w, _ = LETTER
    margin = 0.75 * inch

    # Right: date
    c.setFont("Helvetica", 11)
    c.drawRightString(page_w - margin, y, _today_str())

    # Left: logo above address
    LOGO_MAX_H = 60.0
    LOGO_MAX_W = 1.8 * inch
    LOGO_BOTTOM_MARGIN = 16.0

    addr_top_y = y
    logo_path = brand.get("logo_path")
    if logo_path and os.path.exists(logo_path):
        try:
            img = ImageReader(logo_path)
            nat_w, nat_h = img.getSize()
            scale = LOGO_MAX_H / float(nat_h) if nat_h else 1.0
            w = nat_w * scale
            h = nat_h * scale
            if w > LOGO_MAX_W:
                scale = LOGO_MAX_W / float(nat_w)
                w = LOGO_MAX_W
                h = nat_h * scale
            # draw with top aligned at y
            c.drawImage(logo_path, x, y - h, width=w, height=h,
                        preserveAspectRatio=True, mask="auto")
            addr_top_y = y - h - LOGO_BOTTOM_MARGIN
        except Exception:
            addr_top_y = y

    # Address under logo
    c.setFont("Helvetica", 11)
    yy = addr_top_y
    for line in (brand.get("entity_address_lines") or [])[:5]:
        c.drawString(x, yy, line)
        yy -= 13

    # leave some air below header block
    return min(yy, addr_top_y) - 10


def _draw_re_salutation_and_intro(
    c: canvas.Canvas,
    x: float,
    y: float,
    entity_name: str,
    investor_display: str,
    current_period_label: str,
) -> float:
    """
    RE aligned with the date on the right; then salutation + paragraph on the left.
    """
    page_w, _ = LETTER
    margin = 0.75 * inch

    # RE on the RIGHT (exactly aligned with the date)
    c.setFont("Helvetica", 12)
    c.drawRightString(page_w - margin, y, f"RE: {investor_display}")
    y -= 22  # spacing under RE

    # Dear ... on the left
    c.setFont("Helvetica", 11)
    c.drawString(x, y, f"Dear {investor_display}:")
    y -= 16

    # Intro paragraph (wrap ~95 chars)
    c.setFont("Helvetica", 11)
    para = (
        f"Enclosed you will find the book allocation information pertaining to your capital account in "
        f"{entity_name} for the current period from {current_period_label.strip('()')}. "
        "Please retain this information for your records."
    )
    max_chars = 95
    line = ""
    for word in para.split():
        nxt = (line + " " + word).strip()
        if len(nxt) <= max_chars:
            line = nxt
        else:
            c.drawString(x, y, line)
            y -= 14
            line = word
    if line:
        c.drawString(x, y, line)
        y -= 14

    return y - 12



def _column_headers(
    c: canvas.Canvas,
    x: float,
    y: float,
    label_w: float,
    cur_w: float,
    ytd_w: float,
    cur_label: str,
    ytd_label: str,
) -> float:
    # Main titles
    c.setFont("Helvetica-Bold", 12)
    cur_cx = x + label_w + cur_w / 2 + 6
    ytd_cx = x + label_w + cur_w + ytd_w / 2 + 12
    c.drawCentredString(cur_cx, y, "Current Period")
    c.drawCentredString(ytd_cx, y, "Year-to-Date")
    y -= 14

    # Date ranges under titles (gray)
    c.setFont("Helvetica", 10)
    c.setFillColor(colors.HexColor("#6b7280"))
    c.drawCentredString(cur_cx, y, cur_label)
    c.drawCentredString(ytd_cx, y, ytd_label)
    c.setFillColor(colors.black)

    # thin rule across entire content width (like sample)
    y -= 14
    page_w, _ = LETTER
    c.setLineWidth(0.6)
    c.setStrokeColor(colors.HexColor("#e5e7eb"))
    total_w = label_w + cur_w + ytd_w + (0.18 * inch) * 2   # include $ columns
    c.line(x, y, x + total_w, y)
    y -= 6
    return y


# ---------------- main renderer ----------------
def render_investor_statement_pdf(
    stmt,
    current_period_label: str,
    ytd: Dict[str, Any],
    brand: Optional[Dict[str, Any]] = None,
    out_dir: Optional[str] = None,
) -> str:
    """
    Render the statement to a PDF matching the provided sample.
    """
    out_dir = out_dir or _default_out_dir()
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, f"statement_{stmt.investor_id}_{stmt.period_end.isoformat()}.pdf")

    page_w, page_h = LETTER
    margin = 0.75 * inch
    x = margin
    y = page_h - margin
    c = canvas.Canvas(out_path, pagesize=LETTER)

    # Header (logo + address left, date right)
    brand = brand or {
        "logo_path": None,
        "entity_address_lines": [
            stmt.entity_name or "Elpis Opportunity Fund LP",
            "7190 E. 106th Street",
            "Fishers, IN 46038",
        ],
    }
    y = _draw_letterhead(c, x, y, brand)

    # RE centered + salutation + intro
    y = _draw_re_salutation_and_intro(
        c,
        x,
        y,
        stmt.entity_name or "",
        stmt.investor_name or "",
        current_period_label,
    )

    # Column widths to match sample
    label_w = 2.70 * inch
    sym_w   = 0.18 * inch
    cur_w   = 1.90 * inch
    ytd_w   = 1.90 * inch

    y = _column_headers(
        c,
        x,
        y,
        label_w + sym_w,
        cur_w,
        ytd_w,
        current_period_label,
        ytd.get("label_range") or f"(Jan. 1, {stmt.period_end.year} – {_month_label(stmt.period_end)} {stmt.period_end.day}, {stmt.period_end.year})",
    )

    # Totals (for “Total cash/deemed flows”)
    cur_cash = (stmt.contributions or 0) - (stmt.distributions or 0)
    ytd_cash = (ytd.get("contributions", 0) or 0) - (ytd.get("distributions", 0) or 0)

    # Build rows: [label, $, current, $, ytd]
    def sym(label: str) -> tuple[str, str]:
        return ("$", " ") if label in {"Beginning balance", "Ending balance"} else ("", "")

    rows = [
        ["Beginning balance", *sym("Beginning balance"),
         _money(stmt.beginning_balance), _money(ytd.get("beginning_balance", 0))],

        ["Contributions", *sym("Contributions"),
         _money(stmt.contributions), _money(ytd.get("contributions", 0))],

        ["(Distributions)", *sym("(Distributions)"),
         _money(ytd.get("distributions_cur_override", stmt.distributions)),
         _money(ytd.get("distributions", 0))],

        ["Total cash/deemed\nflows", *sym("Total cash/deemed\nflows"),
         _money(cur_cash), _money(ytd_cash)],

        ["", "", "", "", ""],

        ["Net Income / (Loss):", "", "", "", ""],

        ["Unrealized\nGain/(Loss)", *sym("Unrealized\nGain/(Loss)"),
         _money(stmt.unrealized_gl), _money(ytd.get("unrealized_gl", 0))],

        ["Incentive Fees", *sym("Incentive Fees"),
         _money(getattr(stmt, "incentive_fees", 0)), _money(ytd.get("incentive_fees", 0))],

        ["(Management Fees)", *sym("(Management Fees)"),
         _money(getattr(stmt, "management_fees", 0)),
         _money(ytd.get("management_fees", 0))],

        ["(Operating Expenses)", *sym("(Operating Expenses)"),
         _money(getattr(stmt, "operating_expenses", 0)),
         _money(ytd.get("operating_expenses", 0))],

        ["(Adjustment)", *sym("(Adjustment)"),
         _money(getattr(stmt, "adjustment", 0)), _money(ytd.get("adjustment", 0))],

        ["Total net income/\n(loss)", *sym("Total net income/\n(loss)"),
         _money(getattr(stmt, "net_income_loss", 0)), _money(ytd.get("net_income_loss", 0))],

        ["Ending balance", *sym("Ending balance"),
         _money(stmt.ending_balance), _money(ytd.get("ending_balance", 0))],
    ]

    # Optional rows in sample (sometimes present)
    if getattr(stmt, "ownership_percent", None) is not None:
        rows.append(["Percent", "", "", _pct(float(stmt.ownership_percent or 0.0)), _pct(float(stmt.ownership_percent or 0.0))])
    if getattr(stmt, "roi_pct", None) is not None:
        rows.append(["ROI", "", "", _roi(stmt.roi_pct), _roi(stmt.roi_pct)])

    table = Table(rows, colWidths=[label_w, sym_w, cur_w, sym_w, ytd_w])

    # ---------- robust index lookup by label (avoids None crashes) ----------
    label_to_index = {r[0]: i for i, r in enumerate(rows)}
    def idx(label: str) -> Optional[int]:
        return label_to_index.get(label)

    idx_begin    = idx("Beginning balance")
    idx_cash     = idx("Total cash/deemed\nflows")
    idx_blank    = rows.index(["", "", "", "", ""]) if ["", "", "", "", ""] in rows else None
    idx_heading  = idx("Net Income / (Loss):")
    idx_adj      = idx("(Adjustment)")
    idx_totalni  = idx("Total net income/\n(loss)")
    idx_endbal   = idx("Ending balance")
    idx_roi      = idx("ROI")

    # Base style
    ts = TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("ALIGN", (2, 0), (-1, -1), "RIGHT"),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),  # $ columns right aligned
        ("ALIGN", (3, 0), (3, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        # light line at very bottom (sample has faint rule)
        ("LINEBELOW", (0, -1), (-1, -1), 0.25, colors.HexColor("#e5e7eb")),
    ])

    # Bold rows (only when present)
    for i in (idx_begin, idx_heading, idx_totalni, idx_endbal, idx_roi):
        if i is not None:
            ts.add("FONTNAME", (0, i), (-1, i), "Helvetica-Bold")

    # Italic for subtotals
    if idx_cash is not None:
        ts.add("FONTNAME", (0, idx_cash), (0, idx_cash), "Helvetica-Oblique")
    if idx_totalni is not None:
        ts.add("FONTNAME", (0, idx_totalni), (0, idx_totalni), "Helvetica-Oblique")

    # Thin rules where the sample shows them (only when rows exist)
    if idx_cash is not None:
        ts.add("LINEABOVE", (2, idx_cash), (4, idx_cash), 0.6, colors.HexColor("#c7cdd4"))
    if idx_adj is not None:
        ts.add("LINEABOVE", (2, idx_adj), (4, idx_adj), 0.6, colors.HexColor("#c7cdd4"))

    # Spacing around the section header
    if idx_blank is not None:
        ts.add("BOTTOMPADDING", (0, idx_blank), (-1, idx_blank), 10)
    if idx_heading is not None:
        ts.add("TOPPADDING", (0, idx_heading), (-1, idx_heading), 4)

    table.setStyle(ts)

    # Lay down the table
    avail_h = y - margin
    w, h = table.wrapOn(c, page_w - 2 * margin, avail_h)
    if h > avail_h:
        c.showPage()
        y = page_h - margin
    table.drawOn(c, x, y - h)

    c.save()
    return out_path


# ---------------- compatibility wrapper ----------------
def render_statement_pdf(stmt, out_dir: str | None = None, **kwargs) -> str:
    cur_label = _period_label(stmt.period_start, stmt.period_end)
    ytd = kwargs.get("ytd") or {
        "label_range": f"(Jan. 1, {stmt.period_end.year} – {_month_label(stmt.period_end)} {stmt.period_end.day}, {stmt.period_end.year})",
        "beginning_balance": getattr(stmt, "beginning_balance", 0),
        "contributions": getattr(stmt, "contributions", 0),
        "distributions": getattr(stmt, "distributions", 0),
        "unrealized_gl": getattr(stmt, "unrealized_gl", 0),
        "incentive_fees": getattr(stmt, "incentive_fees", 0),
        "management_fees": getattr(stmt, "management_fees", 0),
        "operating_expenses": getattr(stmt, "operating_expenses", 0),
        "adjustment": getattr(stmt, "adjustment", 0),
        "net_income_loss": getattr(stmt, "net_income_loss", 0),
        "ending_balance": getattr(stmt, "ending_balance", 0),
    }
    brand = kwargs.get("brand") or {
        "logo_path": None,
        "entity_address_lines": [stmt.entity_name or "Elpis Opportunity Fund LP", "7190 E. 106th Street", "Fishers, IN 46038"],
    }
    return render_investor_statement_pdf(
        stmt, current_period_label=cur_label, ytd=ytd, brand=brand, out_dir=out_dir
    )
