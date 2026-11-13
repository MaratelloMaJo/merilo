# UI Notes — Candidate Run and Public Card

This note describes the candidate-facing workflow in `static/index.html` and the
public verification card in `static/card.html`. It is a product guide for the
demo and for future maintenance, not an API reference.

## Visual system: the measurement lab

The interface is a paper instrument, not a dashboard. Warm paper, ruled rows,
serif display type and mono measurement labels carry the metaphor; vermilion is
reserved for the measured value and the tier stamp. There are no gradients,
rounded cards, drop shadows, stock illustrations or external assets.

- Tokens live only in `static/merilo.css`:
  `--paper:#F3EFE6`, `--panel:#FAF7F0`, `--ink:#191816`,
  `--muted:#5E5A52`, `--accent:#B33A2B`, `--verified:#59624E`,
  `--rule:#CFC7B8`.
- Display type is `Georgia, "Times New Roman", serif`; labels are
  `ui-monospace, "Cascadia Mono", monospace`; body text uses the system sans
  stack. All fonts are local, so the pages render identically offline.
- The landing page opens with the thesis and three live facts (test count,
  signature scheme, language count), then the workbench, «Как это работает»,
  «Кандидату», «Компании», «Границы», FAQ and footer. «Компании» lists the
  three pilot prices exactly: `3 000 ₸`, `29 000 ₸`, `149 000 ₸`.
- The language ruler is a real measurement strip: 13 ticks, a filled tick and
  `aria-pressed` for the current language. It appears in the hero and above the
  workbench and both instances stay in sync.
- The public card is a certificate: serial `ML-2026-XXXX` derived from the
  card hash, ruled metadata rows, a vermilion tier stamp, signature block with
  the Ed25519 key fingerprint, and the defended answers.
- `docs/offline-demo.html` is a standalone snapshot of three verdicts (Gold,
  Silver, rejected at Gate 1). Its CSS is inline, it makes no network requests,
  and it says explicitly that it is not a live certificate.
- Tailwind was removed rather than vendored. Its dark color utilities would be
  unreadable on paper, and keeping it would preserve unused purple/dark tokens.
  `static/merilo.css` replaces it; `static/app.js` now sets semantic classes
  (`is-active`, `is-visible`, `is-disabled`, result/gate classes) instead of
  utility strings. The only compatibility helper left is for `hidden` and the
  `is-*` state classes.
- `tests/test_design_contract.py` enforces the tokens, fonts, absence of CDNs,
  external URLs, purple, gradients and shadows, the landing section order and
  prices, one primary CTA, the documented ids, the card serial/print contract,
  and the offline demo's three verdicts.

### Contrast log

Ratios are WCAG 2.1 relative-luminance values. Normal text needs 4.5:1; large
text and non-text UI boundaries need 3:1.

| Foreground / background | Ratio | Use | Result |
| --- | ---: | --- | --- |
| ink `#191816` / paper `#F3EFE6` | 15.46:1 | body and headings | AA |
| ink `#191816` / panel `#FAF7F0` | 16.58:1 | body on raised panels | AA |
| muted `#5E5A52` / paper `#F3EFE6` | 5.98:1 | captions, secondary text | AA |
| muted `#5E5A52` / panel `#FAF7F0` | 6.41:1 | captions on panels | AA |
| accent `#B33A2B` / paper `#F3EFE6` | 5.15:1 | measured values, links | AA |
| accent `#B33A2B` / panel `#FAF7F0` | 5.52:1 | measured values on panels | AA |
| verified `#59624E` / paper `#F3EFE6` | 5.58:1 | verified seal text | AA |
| verified `#59624E` / panel `#FAF7F0` | 5.98:1 | verified seal on panels | AA |
| paper `#F3EFE6` / accent `#B33A2B` | 5.15:1 | primary button label | AA |
| paper `#F3EFE6` / ink `#191816` | 15.46:1 | inverse chips | AA |
| rule `#CFC7B8` / paper `#F3EFE6` | 1.46:1 | hairlines, ruler ticks | decorative only |
| rule `#CFC7B8` / panel `#FAF7F0` | 1.57:1 | panel hairlines | decorative only |

`--rule` is never used for text or as the only carrier of status. Selected,
verified, rejected and disabled states all change wording and/or `aria-pressed`
in addition to color.

### Accessibility and browser verification

- Lighthouse 12.8.2 accessibility score: **100** for `/`,
  `/card/a11be1c46553` and `/p/ce77c65c7b98`. Lighthouse runs axe-core; the
  only remaining zero-weight informational audit was investigated and cleared.
- Command used:
  `npx --yes lighthouse@12 <url> --only-categories=accessibility --chrome-flags="--headless=new --no-sandbox"`.
- Real Chrome (`--headless=new`, CDP) at 1440, 1024, 768 and 390 px: no
  horizontal overflow on the landing page, workbench, card or profile; no
  console errors and no failed HTTP requests. The mobile sticky CTA, role
  toggle, language ruler, auth modal, recruiter shortlist and candidate
  verification flow were exercised.
- Offline demo: with CDP `Network.emulateNetworkConditions` set to offline and
  the page opened from `file://`, all three verdicts remain visible. The only
  request recorded was the HTML document itself.
- Print: the defended card's printable container measured 900.5 px, inside
  the 954 px working budget; `Page.printToPDF` produced exactly one page
  including the QR code, manifest and badge links.
- Evidence screenshots: `screenshots/final-1440.png`, `final-768.png`,
  `final-390.png`, `card-print.png`, plus the workbench, card, profile and
  offline-demo captures in the same directory.
- UNKNOWN: no manual screen-reader session was run; Lighthouse audits the
  candidate landing view, not the recruiter view after it replaces the markup.
  Windows High Contrast mode was not tested. These are documented gaps, not
  passed checks.

## Candidate workbench

### Language and task selection

- `#language-select` is the language of the run. It lists all 13 supported
  languages and stays in sync with `#own-code-language`.
- Catalogue tasks are loaded from `GET /api/tasks` and rendered as tabs in
  `#task-tabs`, grouped by language with Python first.
- Selecting a catalogue task locks `#language-select` to the task language. The
  tab click is the only way to change the task; reloading the page uses the deep
  link or the first catalogue task.
- `/?task=<id>` selects that task on load. An unknown or missing id silently
  falls back to the first catalogue task, so shared links never show an error
  page.

### Own code

- The `Свой код — без условия задачи` tab is a free submission mode. It hides
  the task presets and the catalogue editor, and reveals `#own-code-panel` with
  `#own-code-language` and `#own-code-editor`.
- Own-code submissions send `task_id: "own-code"` and an explicit `language`.
  Catalogue submissions omit `language` because the server derives it from the
  task definition.
- The main verification button is shared by both modes, so the gate animation,
  error handling, and result panel behave identically.

### AI disclosure

- `#ai-assisted` is unchecked by default. Its label is
  `Я использовал AI при подготовке решения`.
- The checkbox state is sent as `ai_assisted` on every verification request.
- The card reports the declaration as `AI: да` or `AI: нет`. It does not claim
  that AI use was detected or measured.

### Candidate link

- `#candidate-link` copies a task-specific URL:
  `origin + "/?task=" + task.id`.
- In own-code mode it copies the public card URL after a successful
  verification. Before verification the button explains that a card is needed
  first instead of copying an empty link.
- A short `Скопировано` confirmation is announced through
  `#candidate-link-status` (`role="status"`, `aria-live="polite"`).
- When the async Clipboard API is unavailable (for example on an insecure
  origin), a read-only `#candidate-link-fallback` input appears with the URL
  preselected so it can be copied manually.

### One-time defense

- A verified run receives three defense questions and a one-time token from
  `POST /api/submissions/verify`.
- The token is stored only in
  `sessionStorage["merilo-defense-{card_hash}"]`. It never appears in the URL,
  browser history, or `localStorage`.
- Each answer must contain 20–1200 characters. `#defense-seal` sends
  `{ answers: [q1, q2, q3] }` to `POST /api/cards/{hash}/defense` with the
  `X-Defense-Token` header.
- On success the panel shows the defense hash and the stored token is removed.
  On failure the server message is shown in `#defense-status`; the panel keeps
  the answers so the candidate can retry.
- Refreshing the workbench loses the token by design. A new verification starts
  a new challenge.

## Public card

`/card/{hash}` fetches `GET /api/cards/{hash}` and renders:

- candidate, company, task, issue date;
- language and the AI declaration;
- score, rubric version, evaluation model, and verification duration in
  `#card-metadata`;
- criterion scores, summary, signature status, and hash;
- the public defense record in `#card-defense-block` with three questions and
  answers, or `Защита не записана`;
- portable actions: manifest JSON, SVG badge, QR code, and an optional public
  profile link (`#card-profile-link` stays hidden when the API does not return
  `profile_url`);
- `#card-copy-badge-md` copies ready-to-paste GitHub Markdown:
  `[![Merilo Verified](<origin>/badge/<hash>.svg)](<origin>/card/<hash>)`, with
  a `Скопировано` confirmation in `#card-copy-badge-status` (`aria-live`).

All API-provided text is written with `textContent` or dedicated DOM nodes.
No API field is interpolated into `innerHTML`.

### Printing

`#card-print-btn` calls `window.print()`. The print stylesheet uses A4 portrait
with 10 mm margins, hides navigation and action toolbars, forces a light palette,
and keeps the QR code, manifest and badge links visible. The layout is sized for
the worst allowed defense record — three answers of ~600 characters each — and
fits on exactly one A4 page (the printable box is 277 mm ≈ 1047 px at 96 dpi;
the defended test card measured 900.5 px). Chips such as language, AI
disclosure, issue date and evaluation source drop their screen fill and print as
dark text on a transparent background with a hairline border so they stay
readable in monochrome.

## Accessibility and responsive behavior

- The workbench is usable at 1440 px and 390 px: controls keep a minimum 44 px
  touch target on mobile, task tabs collapse to one column, and the sticky
  mobile verification button forwards to the main CTA.
- Status changes use `role="status"`/`aria-live`; errors use `role="alert"`.
- The defense questions are real `<label>` elements bound to their text areas.
- Language switches (RU/KZ/EN) translate the interface while card data and
  candidate answers remain in their original language.

## Known limitations

- The public card payload does not currently include `profile_url`, so the
  profile action is present in the DOM but hidden in normal demo data.
- The defense token is intentionally tab-scoped. Opening the card in another
  tab cannot seal the defense without a fresh verification in that tab.
- The one-page print layout is tuned for the maximum defense length accepted by
  the API. Larger glyph metrics from a substituted font or unusually large
  browser zoom can still push content onto a second page.
