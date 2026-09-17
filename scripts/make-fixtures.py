"""Builds three fixture PDFs that exercise the layouts the pipeline must survive."""
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter

W, H = letter

NOVEL_TEXT = [
    ("Chapter One", "heading"),
    ("It was a bright cold day in April, and the clocks were striking thir-", "line-indent"),
    ("teen. Winston Smith, his chin nuzzled into his breast in an effort to", "line"),
    ("escape the vile wind, slipped quickly through the glass doors.", "line"),
    ("The hallway smelt of boiled cabbage and old rag mats. At one end", "line-indent"),
    ("of it a coloured poster, too large for indoor display, had been tacked", "line"),
    ("to the wall. It depicted simply an enormous face, more than a metre", "line"),
    ("wide. Winston made for the stairs. It was no use trying the lift.", "line"),
    ("Chapter Two", "heading"),
    ("Outside, even through the shut window-pane, the world looked cold.", "line-indent"),
    ("Down in the street little eddies of wind were whirling dust and torn", "line"),
    ("paper into spirals, and though the sun was shining the sky had a harsh", "line"),
    ("blue look. The patrols did not matter, however.", "line"),
]

def novel(path):
    c = canvas.Canvas(path, pagesize=letter)
    page = 1
    y = 0
    def new_page():
        nonlocal y
        c.setFont("Times-Italic", 9)
        c.drawString(72, H - 40, "NINETEEN EIGHTY-FOUR")          # running header
        c.setFont("Times-Roman", 9)
        c.drawCentredString(W / 2, 40, str(page))                   # page number
        y = H - 90
    new_page()
    for text, kind in NOVEL_TEXT:
        if kind == "heading":
            if y < H - 120:
                c.showPage(); page += 1; new_page()
            c.bookmarkPage(f"ch{page}-{text}")
            c.addOutlineEntry(text, f"ch{page}-{text}", level=0)
            y -= 24
            c.setFont("Times-Bold", 16)
            c.drawString(72, y, text)
            y -= 28
        else:
            c.setFont("Times-Roman", 11)
            x = 72 + (18 if kind == "line-indent" else 0)
            c.drawString(x, y, text)
            y -= 15
        if y < 90:
            c.showPage(); page += 1; new_page()
    c.showPage()
    c.save()

PAPER_LEFT = [
    "We introduce a model architecture that dispenses with",
    "recurrence entirely [12]. Prior work relied on convolu-",
    "tional encoders [3-5], which scale poorly with sequence",
    "length. Our approach reaches 28.4 BLEU, an improve-",
    "ment of > 2 points over the best reported result.",
    "Training took 12 hours on 8 GPUs, approx. 1/4 of the",
    "cost reported by Chen et al. See Fig. 2 for details.",
]
PAPER_RIGHT = [
    "The attention function maps a query and a set of key-",
    "value pairs to an output, where the weights are com-",
    "puted as a softmax over scaled dot products. We set",
    "the scaling factor to 1/√d, with d = 64 in all runs.",
    "Ablations in Section 3.2 show that removing the scal-",
    "ing term degrades quality, i.e. the gradients vanish for",
    "large values of d. Results are summarised below.",
]

def paper(path):
    c = canvas.Canvas(path, pagesize=letter)
    for page in range(1, 4):
        c.setFont("Helvetica", 8)
        c.drawString(72, H - 36, "Preprint. Under review.")          # running header
        c.drawCentredString(W / 2, 36, f"{page}")                     # page number
        if page == 1:
            c.setFont("Helvetica-Bold", 17)
            c.drawCentredString(W / 2, H - 80, "Attention Is All You Need")   # spans both columns
            c.setFont("Helvetica", 10)
            c.drawCentredString(W / 2, H - 100, "A. Vaswani, N. Shazeer, N. Parmar")
        top = H - 140
        c.setFont("Times-Roman", 10)
        for i, line in enumerate(PAPER_LEFT):
            c.drawString(60, top - i * 14, line)
        for i, line in enumerate(PAPER_RIGHT):
            c.drawString(320, top - i * 14, line)
        # footnotes, smaller font, bottom of the page
        c.setFont("Times-Roman", 7)
        c.drawString(60, 70, "1 Equal contribution. Listing order is random.")
        c.drawString(60, 60, "2 Code available at https://github.com/example/repo")
        c.showPage()
    c.save()

def report(path):
    c = canvas.Canvas(path, pagesize=letter)
    c.setFont("Helvetica-Bold", 18)
    c.drawString(72, H - 80, "Quarterly Platform Report")
    c.setFont("Helvetica", 11)
    body = [
        "Revenue grew 18% quarter over quarter, driven mainly by self-serve",
        "sign-ups. Churn held flat at 2.1%. The table below breaks the quarter",
        "down by region; note that EMEA excludes the UK.",
    ]
    y = H - 120
    for line in body:
        c.drawString(72, y, line)
        y -= 16
    y -= 20
    rows = [("Region", "Revenue", "Growth"), ("North America", "$4.2M", "+12%"),
            ("EMEA", "$2.8M", "+24%"), ("APAC", "$1.1M", "+31%")]
    for row in rows:
        c.setFont("Helvetica-Bold" if row[0] == "Region" else "Helvetica", 10)
        for x, cell in zip((72, 260, 400), row):
            c.drawString(x, y, cell)
        y -= 16
    y -= 20
    c.setFont("Helvetica", 11)
    for line in ["• Hiring: 6 open roles, 2 offers out.", "• Risk: one enterprise renewal at risk."]:
        c.drawString(72, y, line)
        y -= 16
    c.setFont("Helvetica", 9)
    c.drawCentredString(W / 2, 40, "1")
    c.showPage()
    c.save()

import sys
out = sys.argv[1]
novel(f"{out}/novel.pdf")
paper(f"{out}/paper.pdf")
report(f"{out}/report.pdf")
print("wrote novel.pdf, paper.pdf, report.pdf")
