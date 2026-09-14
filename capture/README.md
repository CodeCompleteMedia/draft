# Personality capture

A separate, standalone Apps Script web app. Students set five sliders and pick a
type name; it writes one row to the `Slider Responses` tab of the Team Draft Sheet,
which `Team Draft > Build Students tab from forms` then merges into `Students`.

`Index.html` is unchanged from the original and is not kept here — it lives in the
Apps Script project.

## Why this is not part of the main script

The Team Draft project is bound to the Sheet and deployed as an anonymous web app,
so that the Vercel function can reach it. Its `doGet` deliberately serves nothing.

This one has to serve a page. If the two shared a project, that page could call any
top-level function in it through `google.script.run` — including `getState('class')`,
which returns the class view with real student names and takes no PIN. Keeping them
in separate projects is what prevents that. They also both define `doGet`, which
alone would break one of them.

So: two projects, two deployments, one Sheet.

```
students ──> capture web app ──────> Slider Responses ─┐
                                                       ├─> Students ─> the draft
Google Forms ────────────────────> Form Responses 1-2 ─┘
```

## Setting it up

1. **script.google.com → New project** (signed in as the account that owns the Sheet).
   Not from the Sheet's Extensions menu — that would bind it.
2. Paste `Code.gs` into `Code.gs`, and the original `Index.html` into a new HTML
   file named `Index`.
3. Check `SPREADSHEET_ID` at the top of `Code.gs` matches the Sheet.
4. **Deploy → New deployment → Web app**, Execute as **Me**, access **Anyone**.
   Use the editor, not `clasp deploy` — a CLI-created deployment ignores the
   manifest's webapp settings and serves an Access Denied page.
5. Authorize when prompted, then give students the `/exec` URL.

## Two things not to change

- **`Type Match` and `Selected Type's Code`** in `getOrCreateSheet_`. The draft app
  routes any column ending in "Match" to a teacher-only column, so `Type Match`
  never reaches the captain dashboard. A more descriptive name like
  "Name Matches Sliders" turns it into a badge captains can read.
- **`PERIODS`** must stay in sync with the class periods on the Google Forms, and
  with `Index.html`.
