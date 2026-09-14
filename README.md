# Team Draft Day

A blind team draft for class projects, run like a sports draft. A wheel of names picks
each team captain. The captain chooses teammates from a private dashboard that shows
each student's traits, personality, and e-skills but no names. The class watches the
names get revealed on the projector, and the teacher runs everything from a
drag-and-drop admin board.

Three screens stay in sync:

| Screen | Where | URL |
|---|---|---|
| Class view | Projector | `…/exec?view=class` |
| Captain dashboard | A shared Chromebook the captain walks up to | `…/exec?view=captain` |
| Admin board | Teacher's computer (PIN protected) | `…/exec?view=admin` |

Built with Svelte 5 + Vite, GSAP for the wheel, and Google Apps Script for the backend.
The whole app is bound to the unified student Sheet.

## How the draft runs

1. **Spin.** The wheel lands on a student. Confirm them as captain, or re-spin if they're absent.
2. **Choose.** The captain goes to the captain station and picks one anonymous card.
3. **Lock it in.** The pick shows up as pending on the admin board. Drag it onto the
   captain's team, or click Confirm. The class view reveals the name.
4. Repeat until every team has a captain.
5. After that, captains take turns in the order they were spun (1-2-3-1-2-3) until the pool is empty.
6. **Finish.** The teams are written to the `Teams` tab.

On the admin board you can also:
- **Undo a pick** by dragging a teammate back to the pool. Undoing the most recent pick gives the turn back.
- **Move** a teammate to another team.
- **Bench** an absent student by dragging them to "Not here", and place them on a team later.

## Privacy: what each screen receives

The server builds a separate response for each screen, so opening DevTools doesn't reveal anything extra.

- **Captain dashboard:** anonymous codes and traits for unpicked students. Names only for the captain's own team, during their turn.
- **Class view:** names only. No traits and no card codes.
- **Admin board:** everything, after the PIN is entered.

These rules are covered by `tests/service.test.js`.

The captain station is signed into the teacher's Google account, so a student there
could open a new tab and browse Drive. Keep the station in full screen and in view.

## Development

```bash
npm install
npm run dev
```

Open these in three tabs. They sync the same way the deployed app does, using fake students.

- http://localhost:5173/?view=admin (PIN `1234`)
- http://localhost:5173/?view=class
- http://localhost:5173/?view=captain

```bash
npm test
```

The tests cover the draft rules and the per-screen privacy checks.

## Sheet setup

The `Students` tab is the unified sheet, with one row per student. The app finds the key
columns by their headers, so the headers from the Google Forms work as they are:

| Needs | Headers it recognizes |
|---|---|
| Student ID | `Email Address`, or any header containing "email". Matched in lowercase. |
| Name | `First Name` + `Last Name` (or a single `Name`). The projector shows "Maya R." unless two students in a period would look the same. |
| Period | `What's Your Class Period?`, any header with "period", or `What's Your Class?`. The forms' "1st", "2nd Period", "2rd Period", and "5th" become 1, 2, and 5. |

Every other column can show on the captain dashboard. `Timestamp` columns are ignored.
A layout that matches the personality capture script's **Slider Responses** tab plus the
two surveys:

```
First Name | Last Name | Email | Class |
Type | Type Code | Identity Letter | Selected Type's Code | Type Match |
Energy (as shown) | ... | Identity (as shown) |
Energy 0-100 (0=Extraverted, 100=Introverted) | ... | Identity 0-100 (0=Assertive, 100=Turbulent) |
eSkill #1 | eSkill #2 | eSkill #3 |
My First Business Trait | My Second Business Trait | My Third Business Trait
```

Use the capture script's `Slider Responses` tab, not `Form Responses 1`.

Messy data never stops a draft. If a student submitted a form twice, the later row wins.
If a header is repeated (as in `Form Responses 1`, from editing the form), the first
column with that name is read and the rest ignored. A student who skipped a form, or
whose answers contradict each other, still drafts with whatever they gave.

1. Deploy the script (below), then reload the Sheet. A **Team Draft** menu appears.
2. Run **Team Draft → Set up draft tabs**. It creates the tabs below and fills `Columns` from
   your headers:
   - **Personality type:** taken from `Type Code`, which the capture script builds from the
     sliders. `INTP-T` shows as `INTP Logician` with its role group (Analysts) and identity
     (Turbulent). Captains can filter by preference, identity, or role group. The old
     dropdown's "Architect - (INTJ-A / INTJ-T)" still works, minus the identity letter.
   - **The five sliders** become diverging meters. The bar grows out from the middle
     toward whichever side the student leans, blue one way and amber the other, with the
     reading beside it ("66% Extraverted"). Direction reads from across the room; the
     number is there when a captain looks closer.
   - **Repeats stay hidden:** `Type`, `Identity Letter`, `Selected Type's Code`, and the
     `(as shown)` columns all repeat something the card works out from the type code.
   - **`Type Match`** is kept for you but never sent to the captain dashboard. It shows in
     a student's expanded details on the admin board, with no warnings and nothing to act
     on: a student whose sliders disagree with the type they picked still drafts normally.
   - **Combined questions:** `eSkill #1–#3` become one **eSkills** list, and the three business
     trait questions become one **Business Traits** list. In the `Columns` tab they're written
     as `eSkill #1 + eSkill #2 + eSkill #3`. A choice that carries its own explanation, like
     "Persistence - A person who never gives up.", shows as *Persistence*.
   - **Descriptions:** the captain station has a "What these mean" list with the eSkill and
     trait descriptions from the forms. If the forms' choices change, update
     `src/shared/formOptions.js`.
   - **Quiz score:** a `Score` column starts hidden. Long free-text answers do too, because
     they're the easiest way to recognize who wrote them.

   | Tab | What it's for |
   |---|---|
   | `Columns` | What captains see. Label, group, type (`badge`, `tags`, `personality`, `score`, `text`), and a Show checkbox. |
   | `Periods` | How many teams each period gets. |
   | `Picks` | Every draft action, in order. |
   | `Teams` | Final teams. |

3. Run **Team Draft → Set admin PIN…**.
4. For a dry run, make a copy of the Sheet and use **Add fake students for testing**.

If a student skipped a form, their card says "No answer yet" for that part. If you edit the
Sheet while screens are open, **Refresh cached data** makes them pick up the change.

## Deploying to Apps Script

1. Open the Sheet and go to **Extensions → Apps Script**. Under **Project Settings**, copy the Script ID.
2. Copy `.clasp.json.example` to `.clasp.json` and paste the Script ID into it.
3. Log in to clasp once, then build and push:

   ```bash
   npx clasp login
   ```

   ```bash
   npm run push
   ```

   `npm run push` builds the app, copies it and the shared draft code into `gas/`, and uploads everything.
4. In the Apps Script editor, go to **Deploy → New deployment → Web app**. Do this in
   the editor, **not** with `clasp deploy` — a CLI-created deployment does not reliably
   pick up the `webapp` settings from `appsscript.json`, and silently answers every
   request with a Drive "Access Denied" page even though the manifest looks right.
   Set "Execute as: Me" and "Who has access: Anyone". The front end is hosted on
   Vercel and calls this URL server-to-server, with no Google identity to present,
   so it has to answer anonymous requests. What guards it is the proxy secret in
   step 5 — the URL itself is never sent to a browser.
5. In the Sheet, run **Team Draft → Set proxy secret** and copy the value it shows.
6. Run **Team Draft → Set admin PIN** and choose at least 6 digits.

After later changes, run `npm run push`, then use **Deploy → Manage deployments → Edit → New version**.

The `/exec` URL deliberately does **not** serve the app — opening it shows a one-line
notice. Because the deployment accepts anonymous requests, a page served from there
could call `getState('class')` through `google.script.run` and read real student names
without ever presenting the proxy secret, which only guards `doPost`. The app is served
by Vercel; this URL is the data connection only. Still treat it as a secret.

## Hosting on Vercel

The front end is served by Vercel; the Sheet stays behind Apps Script. A serverless
route (`api/gas.js`) is the only thing that talks to Apps Script — it adds the shared
secret to every call, so neither the secret nor the `/exec` URL ever reaches the page.

```
browser → /api/gas (Vercel, holds the secret) → /exec (Apps Script) → the Sheet
```

1. Import the GitHub repo at [vercel.com/new](https://vercel.com/new). The Vite preset
   is detected automatically: `npm run build` → `dist`.
2. Under **Settings → Environment Variables**, add `GAS_EXEC_URL` and
   `GAS_PROXY_SECRET` (see `.env.example`). Neither may be named `VITE_*`; those are
   compiled into the page.
3. Redeploy, then open `?view=admin`, `?view=class`, and `?view=captain` on the
   Vercel URL.

To run the whole thing locally against the real Sheet, copy `.env.example` to
`.env.local` and use `npx vercel dev` instead of `npm run dev`. (`npm run dev` on
its own always uses the fake students — it never touches the Sheet.)

### Two build targets

| Command | Output | Used by |
| --- | --- | --- |
| `npm run build` | `dist/` — normal chunked assets | Vercel |
| `npm run build:gas` | `dist-gas/` — one inlined HTML file, copied to `gas/` | clasp / Apps Script |

`npm run push` runs `build:gas` for you.

### If it says the server is missing GAS_EXEC_URL or GAS_PROXY_SECRET

The route is running but the environment variables aren't reaching it. In order of
likelihood:

1. **They were added after the last deploy.** Vercel only gives a deployment the
   variables that existed when it was built. Saving them is not enough — redeploy
   from **Deployments → ⋯ → Redeploy**.
2. **They're set for the wrong environment.** Tick Production, Preview, *and*
   Development when adding them. A `vercel.app` preview URL from a branch does not
   read Production variables.
3. **They're named `VITE_GAS_...`.** That prefix exposes a value to the browser and
   makes it invisible to the serverless function. These two must have no prefix.

### What to know before draft day

- **Apps Script needs a `User-Agent`.** A POST without one gets an intermittent 404
  HTML page from Google — about one request in five. Node's `fetch` sends none by
  default, so `api/gas.js` sets one explicitly. Don't remove it.
- **Reads retry, writes don't.** Apps Script can answer with a 404 page *after*
  `doPost` has already run, so retrying `act`, `submitPick`, or `startDraft` would
  apply the action twice and corrupt the pick log. Only `getVersion`, `getState`,
  and `checkPin` are retried.

- **Rotating the secret locks things out.** Running **Set proxy secret** again
  invalidates the old value; every call fails with "Not authorized" until Vercel's
  env var is updated and the project redeployed.
- **Polling costs Apps Script executions.** Each screen checks `getVersion` every
  1.5 s — about 2,000 calls per screen per class period. Three screens is
  comfortable; that's the number to watch if you add devices.
- **The admin PIN is the only thing protecting the admin board.** `api/gas.js`
  cuts off an address after ten wrong PINs, but that counter lives in one
  serverless instance's memory, so it's a speed bump, not a guarantee. Use a long PIN.
- **If your school's Workspace blocks anonymous web apps**, step 4 won't be
  available and this setup can't work as written — the fallback is to read the
  Sheet from Vercel with a service account instead.
