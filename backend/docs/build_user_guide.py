"""
Build the MeterSquare User Guide PDF from backend/docs/user_guide/*.md.

The same Markdown files feed the in-app Guide Assistant, so the PDF and the
assistant always say the same thing.

Requires: pandoc and weasyprint on PATH (or the weasyprint Python package).

Usage:
    python backend/docs/build_user_guide.py
    python backend/docs/build_user_guide.py --out path/to/guide.pdf

Flow diagrams: a fenced block marked `flow` with one "Role: step" per line is
drawn as a role-coloured flowchart in the PDF, e.g.

    ```flow
    Estimator: Create the project and BOQ
    Technical Director: Approve the BOQ
    ```

Screenshots: a line on its own like `![Caption](images/est-new.jpg)` becomes a captioned
figure. Images live in user_guide/images/ and show sample data only (the PDF is public).
The build also copies them to frontend/public/user-guide-images/, where the in-app assistant
(Structo) shows them inside answers.
"""

import argparse
import datetime
import html
import os
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
GUIDE_DIR = os.path.join(HERE, 'user_guide')
REPO_ROOT = os.path.dirname(os.path.dirname(HERE))
DEFAULT_OUT = os.path.join(REPO_ROOT, 'frontend', 'public', 'MeterSquare-User-Guide.pdf')
IMAGES_OUT = os.path.join(REPO_ROOT, 'frontend', 'public', 'user-guide-images')

ROLE_COLORS = {
    'admin': '#475569',
    'technical director': '#7c3aed',
    'td': '#7c3aed',
    'estimator': '#0369a1',
    'project manager': '#1d4ed8',
    'pm': '#1d4ed8',
    'mep supervisor': '#0e7490',
    'site engineer': '#c2410c',
    'se': '#c2410c',
    'procurement': '#047857',
    'buyer': '#047857',
    'production manager': '#b45309',
    'client': '#be185d',
    'vendor': '#4d7c0f',
    'system': '#6b7280',
}

CSS = """
@page {
  size: A4;
  margin: 22mm 18mm 20mm 18mm;
  @top-right { content: "MeterSquare User Guide"; font-size: 8pt; color: #9ca3af; }
  @bottom-center { content: counter(page); font-size: 9pt; color: #6b7280; }
}
@page :first { @top-right { content: none; } @bottom-center { content: none; } }
html { font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif; font-size: 10.5pt; color: #1f2937; line-height: 1.5; }
.cover { page-break-after: always; height: 240mm; display: flex; flex-direction: column; justify-content: center; }
.cover .brand { color: #243d8a; font-weight: 800; letter-spacing: .12em; font-size: 12pt; }
.cover h1 { font-size: 34pt; margin: 8mm 0 4mm; color: #111827; border: 0; }
.cover .sub { font-size: 13pt; color: #4b5563; max-width: 140mm; }
.cover .meta { margin-top: 18mm; font-size: 9.5pt; color: #6b7280; }
.cover .bar { height: 3mm; width: 40mm; background: #243d8a; border-radius: 2mm; margin-bottom: 6mm; }
nav#TOC { page-break-after: always; }
nav#TOC::before { content: "Contents"; display: block; font-size: 20pt; font-weight: 800; color: #111827; margin-bottom: 6mm; }
nav#TOC ul { list-style: none; padding-left: 0; margin: 0; }
nav#TOC ul ul { padding-left: 6mm; }
nav#TOC li { margin: 1.2mm 0; }
nav#TOC > ul > li > a { font-weight: 700; }
nav#TOC ul ul ul { display: none; }
nav#TOC a { color: #1f2937; text-decoration: none; }
nav#TOC a::after { content: leader('.') target-counter(attr(href), page); color: #6b7280; }
h1 { page-break-before: always; font-size: 22pt; color: #243d8a; border-bottom: 2px solid #243d8a; padding-bottom: 2mm; margin-top: 0; }
h2 { font-size: 15pt; color: #111827; margin-top: 8mm; page-break-after: avoid; }
h3 { font-size: 12pt; color: #243d8a; margin-top: 6mm; page-break-after: avoid; }
p, li { orphans: 3; widows: 3; }
strong { color: #111827; }
code { background: #f3f4f6; padding: 0 1mm; border-radius: 1mm; font-size: 9pt; }
table { border-collapse: collapse; width: 100%; margin: 3mm 0 5mm; font-size: 9.5pt; page-break-inside: auto; }
th { background: #243d8a; color: #fff; text-align: left; padding: 2mm 2.5mm; }
td { border-bottom: 1px solid #e5e7eb; padding: 1.8mm 2.5mm; vertical-align: top; }
tr { page-break-inside: avoid; }
tr:nth-child(even) td { background: #f9fafb; }
ol, ul { padding-left: 6mm; }
li { margin: .8mm 0; }
.flow { margin: 4mm 0 6mm; page-break-inside: avoid; }
.flow .step { display: flex; align-items: stretch; border: 1px solid #e5e7eb; border-radius: 2mm; overflow: hidden; }
.flow .role { color: #fff; font-weight: 700; font-size: 8.5pt; padding: 2mm 3mm; width: 38mm; flex-shrink: 0; display: flex; align-items: center; }
.flow .text { padding: 2mm 3mm; font-size: 9.5pt; background: #fff; }
.flow .num { font-weight: 800; margin-right: 1.5mm; opacity: .85; }
figure.shot { margin: 3mm 0 5mm; page-break-inside: avoid; }
figure.shot img { display: block; width: 100%; border: 1px solid #d1d5db; border-radius: 2mm; }
figure.shot figcaption { margin-top: 1.5mm; font-size: 8.5pt; color: #6b7280; font-style: italic; }
.flow .arrow { text-align: center; color: #9ca3af; font-size: 10pt; line-height: 1; margin: .6mm 0; padding-left: 16mm; text-align: left; }
"""


def flow_to_html(block):
    rows = [l.strip() for l in block.strip().splitlines() if l.strip()]
    parts = ['<div class="flow">']
    for i, row in enumerate(rows, 1):
        role, _, text = row.partition(':')
        if not text:
            role, text = '', role
        color = ROLE_COLORS.get(role.strip().lower(), '#243d8a')
        if i > 1:
            parts.append('<div class="arrow">▼</div>')
        parts.append(
            f'<div class="step"><div class="role" style="background:{color}">'
            f'<span class="num">{i}</span>{html.escape(role.strip())}</div>'
            f'<div class="text">{html.escape(text.strip())}</div></div>'
        )
    parts.append('</div>')
    return '\n'.join(parts)


PDF_IMAGE_WIDTH = 1000  # px: sharp at A4 width, keeps the PDF small (the assistant uses the full-size files)
_pdf_image_dir = {'path': None}


def _pdf_image(path):
    """A smaller copy of a screenshot for the PDF (falls back to the original without Pillow)."""
    out_dir = _pdf_image_dir['path']
    if not out_dir:
        return path
    try:
        from PIL import Image
    except ImportError:
        return path
    out = os.path.join(out_dir, os.path.basename(path))
    if not os.path.exists(out):
        img = Image.open(path).convert('RGB')
        if img.width > PDF_IMAGE_WIDTH:
            img = img.resize((PDF_IMAGE_WIDTH, round(img.height * PDF_IMAGE_WIDTH / img.width)), Image.LANCZOS)
        img.save(out, quality=72, optimize=True, progressive=True)
    return out


def figure_to_html(caption, src):
    path = os.path.join(GUIDE_DIR, src)
    if not os.path.isfile(path):
        sys.exit(f'Missing screenshot: {path}')
    uri = pathlib.Path(_pdf_image(path)).resolve().as_uri()
    return (f'<figure class="shot"><img src="{uri}" alt="{html.escape(caption)}">'
            f'<figcaption>{html.escape(caption)}</figcaption></figure>')


def preprocess(markdown_text):
    """Turn ```flow blocks into HTML flowcharts and screenshot lines into captioned figures
    (pandoc passes raw HTML through)."""
    text = re.sub(r"```flow\n(.*?)```", lambda m: '\n' + flow_to_html(m.group(1)) + '\n', markdown_text, flags=re.S)
    return re.sub(r'^!\[([^\]]*)\]\(([^)]+)\)\s*$', lambda m: '\n' + figure_to_html(m.group(1), m.group(2)) + '\n',
                  text, flags=re.M)


def cover_html():
    today = datetime.date.today().strftime('%d %B %Y')
    return f"""<div class="cover">
<div class="bar"></div>
<div class="brand">METERSQUARE ERP</div>
<h1 class="cover-title">User Guide</h1>
<div class="sub">Complete guide to every role, screen and process: from estimating and BOQ approval to purchasing,
the M2 Store, site delivery, returns, assets, labour and payroll.</div>
<div class="meta">Version {today}<br>For all MeterSquare users</div>
</div>
"""


def build(out_path):
    if not shutil.which('pandoc'):
        sys.exit('pandoc is required (https://pandoc.org).')
    files = sorted(f for f in os.listdir(GUIDE_DIR) if f.endswith('.md'))
    if not files:
        sys.exit(f'No guide files found in {GUIDE_DIR}')

    with tempfile.TemporaryDirectory() as tmp:
        _pdf_image_dir['path'] = os.path.join(tmp, 'pdf-images')
        os.makedirs(_pdf_image_dir['path'])
        combined = os.path.join(tmp, 'guide.md')
        with open(combined, 'w', encoding='utf-8') as out:
            for f in files:
                with open(os.path.join(GUIDE_DIR, f), encoding='utf-8') as fh:
                    out.write(preprocess(fh.read()).strip() + '\n\n')
        css_path = os.path.join(tmp, 'guide.css')
        with open(css_path, 'w', encoding='utf-8') as fh:
            fh.write(CSS)
        cover_path = os.path.join(tmp, 'cover.html')
        with open(cover_path, 'w', encoding='utf-8') as fh:
            fh.write(cover_html())
        html_path = os.path.join(tmp, 'guide.html')
        subprocess.run([
            'pandoc', combined, '-f', 'gfm+attributes', '-t', 'html5', '-s',
            '--toc', '--toc-depth=2', '--metadata', 'title=MeterSquare User Guide',
            '--variable', 'title=', '-B', cover_path, '-o', html_path,
        ], check=True)
        # pandoc puts the TOC before body content; move the cover in front of it
        with open(html_path, encoding='utf-8') as fh:
            doc = fh.read()
        cover = cover_html()
        if cover.strip() in doc:
            doc = doc.replace(cover.strip(), '', 1)
            doc = doc.replace('<body>', '<body>\n' + cover, 1)
        doc = re.sub(r'<header id="title-block-header">.*?</header>', '', doc, flags=re.S)
        # Steps split by screenshots continue their numbering (WeasyPrint ignores <ol start>)
        doc = re.sub(r'<ol start="(\d+)"',
                     lambda m: f'<ol start="{m.group(1)}" style="counter-reset: list-item {int(m.group(1)) - 1}"', doc)
        # embed the stylesheet (file links are unreliable across platforms)
        doc = doc.replace('</head>', '<style>\n' + CSS + '\n</style>\n</head>', 1)
        with open(html_path, 'w', encoding='utf-8') as fh:
            fh.write(doc)

        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        try:
            from weasyprint import HTML  # type: ignore
            HTML(html_path, base_url=tmp).write_pdf(out_path)
        except ImportError:
            if not shutil.which('weasyprint'):
                sys.exit('weasyprint is required (pip install weasyprint).')
            subprocess.run(['weasyprint', html_path, out_path], check=True)
    print(f'Built {out_path}')
    publish_images()


def publish_images():
    """Copy the screenshots next to the PDF so the in-app assistant (Structo) can show them."""
    src = os.path.join(GUIDE_DIR, 'images')
    if os.path.isdir(IMAGES_OUT):
        shutil.rmtree(IMAGES_OUT)
    shutil.copytree(src, IMAGES_OUT)
    print(f'Copied {len(os.listdir(IMAGES_OUT))} screenshots to {IMAGES_OUT}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Build the MeterSquare User Guide PDF')
    parser.add_argument('--out', default=DEFAULT_OUT)
    build(parser.parse_args().out)
