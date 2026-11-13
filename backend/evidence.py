"""Self-contained HTML rendering for the dated evidence documents.

The landing page links to ``/evidence/{name}``. Serving raw Markdown there made
the CTA look broken in a browser, so the route now returns a small, dependency
free HTML page. The renderer covers only the Markdown used by ``docs/``:
headings, paragraphs, lists, blockquotes, fenced code, tables and inline
code/emphasis/links. No third-party package is added to the runtime.
"""

from __future__ import annotations

import html
import re
from typing import Iterable

EVIDENCE_TITLES: dict[str, str] = {
    "evidence": "Evidence — что и чем подтверждено",
    "pilot": "Пилот: оффер, план и метрики",
    "interviews": "Интервью: скрипты и статус",
    "api": "API Merilo",
}

_HEADING = re.compile(r"^(#{1,6})\s+(.*)$")
_FENCE = re.compile(r"^```([\w+-]*)\s*$")
_HR = re.compile(r"^\s*---+\s*$")
_BULLET = re.compile(r"^\s*[-*]\s+(.*)$")
_ORDERED = re.compile(r"^\s*\d+\.\s+(.*)$")
_TABLE_SEPARATOR = re.compile(r"^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$")
_CODE_SPAN = re.compile(r"`([^`]+)`")
_LINK = re.compile(r"\[([^\]]+)\]\(([^)\s]+)\)")
_BOLD = re.compile(r"\*\*([^*]+)\*\*")
_ITALIC = re.compile(r"(?<!\*)\*([^*\n]+)\*(?!\*)")


def _escape(value: str) -> str:
    return html.escape(value, quote=False)


def _safe_href(url: str) -> str:
    if url.strip().lower().startswith(("javascript:", "data:")):
        return "#"
    return url


def _inline(text: str) -> str:
    """Escape text, then restore code spans and the tiny inline subset we use."""
    escaped = _escape(text)
    code_spans: list[str] = []

    def stash_code(match: re.Match[str]) -> str:
        code_spans.append(f"<code>{match.group(1)}</code>")
        return f"\x00CODE{len(code_spans) - 1}\x00"

    escaped = _CODE_SPAN.sub(stash_code, escaped)
    escaped = _LINK.sub(
        lambda match: f'<a href="{_safe_href(match.group(2))}">{match.group(1)}</a>',
        escaped,
    )
    escaped = _BOLD.sub(r"<strong>\1</strong>", escaped)
    escaped = _ITALIC.sub(r"<em>\1</em>", escaped)
    for index, span in enumerate(code_spans):
        escaped = escaped.replace(f"\x00CODE{index}\x00", span)
    return escaped


def _is_block_start(line: str) -> bool:
    return bool(
        _HEADING.match(line)
        or _FENCE.match(line)
        or _HR.match(line)
        or _BULLET.match(line)
        or _ORDERED.match(line)
        or line.lstrip().startswith("|")
        or line.lstrip().startswith(">")
    )


def _table_cells(line: str) -> list[str]:
    return [cell.strip() for cell in line.strip().strip("|").split("|")]


def _render_table(header: list[str], rows: list[list[str]]) -> str:
    head = "".join(f"<th>{_inline(cell)}</th>" for cell in header)
    body = "".join(
        "<tr>" + "".join(f"<td>{_inline(cell)}</td>" for cell in row) + "</tr>"
        for row in rows
    )
    return f"<table><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table>"


def render_markdown(text: str) -> str:
    """Render the Markdown subset used by the evidence documents."""
    lines = text.splitlines()
    out: list[str] = []
    index = 0

    while index < len(lines):
        line = lines[index]

        if not line.strip():
            index += 1
            continue

        fence = _FENCE.match(line)
        if fence:
            language = fence.group(1)
            index += 1
            code: list[str] = []
            while index < len(lines) and not _FENCE.match(lines[index]):
                code.append(lines[index])
                index += 1
            index += 1  # closing fence
            class_attr = f' class="language-{_escape(language)}"' if language else ""
            out.append(f"<pre><code{class_attr}>{_escape(chr(10).join(code))}</code></pre>")
            continue

        heading = _HEADING.match(line)
        if heading:
            level = len(heading.group(1))
            out.append(f"<h{level}>{_inline(heading.group(2))}</h{level}>")
            index += 1
            continue

        if _HR.match(line):
            out.append("<hr>")
            index += 1
            continue

        if line.lstrip().startswith("|") and index + 1 < len(lines) and _TABLE_SEPARATOR.match(lines[index + 1]):
            header = _table_cells(line)
            index += 2
            rows: list[list[str]] = []
            while index < len(lines) and lines[index].lstrip().startswith("|"):
                rows.append(_table_cells(lines[index]))
                index += 1
            out.append(_render_table(header, rows))
            continue

        if line.lstrip().startswith(">"):
            quoted: list[str] = []
            while index < len(lines) and lines[index].lstrip().startswith(">"):
                quoted.append(lines[index].lstrip()[1:].lstrip())
                index += 1
            out.append(f"<blockquote><p>{_inline(' '.join(quoted))}</p></blockquote>")
            continue

        bullet = _BULLET.match(line)
        ordered = _ORDERED.match(line)
        if bullet or ordered:
            tag = "ul" if bullet else "ol"
            pattern = _BULLET if bullet else _ORDERED
            items: list[str] = []
            while index < len(lines):
                match = pattern.match(lines[index])
                if not match:
                    break
                items.append(f"<li>{_inline(match.group(1))}</li>")
                index += 1
            out.append(f"<{tag}>" + "".join(items) + f"</{tag}>")
            continue

        paragraph: list[str] = [line]
        index += 1
        while index < len(lines) and lines[index].strip() and not _is_block_start(lines[index]):
            paragraph.append(lines[index])
            index += 1
        out.append(f"<p>{_inline(' '.join(paragraph))}</p>")

    return "\n".join(out)


_PAGE_CSS = """
:root{--paper:#F3EFE6;--panel:#FAF7F0;--ink:#191816;--muted:#5E5A52;--accent:#B33A2B;--rule:#CFC7B8;
--serif:Georgia,"Times New Roman",serif;--mono:ui-monospace,"Cascadia Mono",monospace;
--sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif}
*{box-sizing:border-box}html{background:var(--paper)}body{margin:0;background:var(--paper);color:var(--ink);
font-family:var(--sans);font-size:15px;line-height:1.6;-webkit-font-smoothing:antialiased}
a{color:var(--ink);text-underline-offset:.2em}a:hover{color:var(--accent)}
header{border-bottom:1px solid var(--ink)}.bar{width:min(100% - 2rem,920px);margin:0 auto;display:flex;
flex-wrap:wrap;gap:.5rem 1.2rem;align-items:baseline;justify-content:space-between;padding-block:.8rem}
.brand{font-family:var(--serif);font-size:1.3rem;letter-spacing:.12em;font-weight:700;text-decoration:none}
.nav{font-family:var(--mono);font-size:.68rem;letter-spacing:.06em;text-transform:uppercase}
main{width:min(100% - 2rem,920px);margin:0 auto;padding-block:1.6rem 3rem}
.eyebrow{margin:0 0 .4rem;font-family:var(--mono);font-size:.64rem;letter-spacing:.1em;
text-transform:uppercase;color:var(--muted)}
h1{margin:0 0 .5rem;font-family:var(--serif);font-weight:400;
font-size:clamp(1.9rem,1.4rem + 1.8vw,2.8rem);line-height:1.08}
.note{font-family:var(--mono);font-size:.68rem;color:var(--muted);border-left:3px solid var(--accent);
background:var(--panel);padding:.55rem .7rem;margin:0 0 1.4rem}
article h1,article h2,article h3,article h4{font-family:var(--serif);font-weight:400;line-height:1.2;
margin:1.6rem 0 .5rem}
article h2{font-size:1.45rem;border-bottom:1px solid var(--rule);padding-bottom:.25rem}
article h3{font-size:1.15rem}
article p{margin:.65rem 0}
article ul,article ol{margin:.6rem 0;padding-left:1.4rem}
article li{margin:.3rem 0}
article blockquote{margin:.9rem 0;border-left:3px solid var(--rule);background:var(--panel);padding:.6rem .8rem}
article blockquote p{margin:0}
article code{font-family:var(--mono);font-size:.82em;background:var(--panel);
border:1px solid var(--rule);padding:.05rem .25rem}
article pre{overflow:auto;background:#1E1C19;color:#F3EFE6;padding:.8rem;border-radius:2px}
article pre code{background:none;border:0;padding:0;color:inherit;font-size:.78rem}
article table{width:100%;border-collapse:collapse;margin:.9rem 0;font-size:.78rem}
article th,article td{border:1px solid var(--rule);padding:.4rem .5rem;text-align:left;vertical-align:top}
article th{background:var(--panel);font-family:var(--mono);font-size:.68rem;
text-transform:uppercase;letter-spacing:.04em}
article hr{border:0;border-top:1px solid var(--rule);margin:1.4rem 0}
footer{border-top:1px solid var(--rule);font-family:var(--mono);font-size:.64rem;color:var(--muted)}
footer .bar{padding-block:1rem}
"""


def _page(title: str, body: str, source: str | None = None) -> str:
    source_note = (
        f'Источник: <code>docs/{_escape(source)}</code>. '
        if source
        else "Оглавление evidence-слоя. "
    )
    return f"""<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <link rel="icon" href="data:,">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{_escape(title)} — Merilo</title>
  <style>{_PAGE_CSS}</style>
</head>
<body>
  <header><div class="bar"><a class="brand" href="/">MERILO</a>
    <a class="nav" href="/evidence">Evidence</a></div></header>
  <main>
    <p class="eyebrow">Evidence · HTML-рендер</p>
    <h1>{_escape(title)}</h1>
    <p class="note">{source_note}Это читаемое HTML-представление dated-документа, а не live-сертификат.
      <a href="/">На главную</a></p>
    <article>
{body}
    </article>
  </main>
  <footer><div class="bar">MERILO © 2026 · evidence-слой · значения не являются live-метриками</div></footer>
</body>
</html>
"""


def render_evidence_document(name: str, filename: str, markdown: str) -> str:
    title = EVIDENCE_TITLES.get(name, filename)
    return _page(title, render_markdown(markdown), source=filename)


def render_evidence_index(documents: Iterable[tuple[str, str]]) -> str:
    links = "".join(
        f'<li><a href="/evidence/{_escape(name)}">{_escape(EVIDENCE_TITLES.get(name, name))}</a></li>'
        for name, _filename in documents
    )
    body = (
        "<p>Датед-документы, на которые ссылается лендинг. Каждый открывается как HTML; "
        "машинный снимок рынка остаётся JSON.</p>"
        f"<ul>{links}<li><a href=\"/evidence/labor_market.json\">labor_market.json</a> — снимок hh.kz, JSON</li></ul>"
    )
    return _page("Evidence — документы", body)
