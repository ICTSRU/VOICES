# SRU Voice v1.3 – Setup Guide | دليل التشغيل

Estimated time: **20–30 minutes**. Steps 1–3 are done once.

## 1. Create the OAuth Client ID (Google sign-in)
1. Open **Google Cloud Console** → select/create a project (e.g. `SRU-Voice`).
2. **APIs & Services → OAuth consent screen** → User type **Internal** (keeps sign-in inside the SRU Workspace) → fill app name `SRU Voice`, support e-mail, save.
   > If students sign in with `@srcolleges.org` and that domain is a **separate** Workspace, choose **External** instead; the domain check in `Code.gs` still blocks any other account.
3. **Credentials → Create credentials → OAuth client ID → Web application**.
4. **Authorised JavaScript origins:** add the GitHub Pages origin, e.g. `https://ictsru.github.io` (origin only, no path). Add `http://localhost:5500` if you test locally.
5. Copy the **Client ID** (`…apps.googleusercontent.com`).

## 2. Create the Google Sheet + backend
1. Create a Google Sheet named **`SRU Voice – Database`** (in a shared ICTD Drive).
2. **Extensions → Apps Script**. Replace `Code.gs` with `apps-script/Code.gs`.
3. **Project Settings → Show "appsscript.json"** → paste `apps-script/appsscript.json`.
4. In `Code.gs`, edit `CFG`:
   - `CLIENT_ID` → the Client ID from step 1
   - `ALLOWED_DOMAINS` → keep `['sr.edu.sa','srcolleges.org']` or reduce to `['sr.edu.sa']`
   - `PLATFORM_URL` → final GitHub Pages URL (used in e-mail buttons)
   - Notification switches and `SLA_DAYS` as needed
5. Run **`setup`** once (authorise when prompted) → the 5 sheets are created.
6. Run **`installTriggers`** once → daily 08:00 SLA reminder.
7. Add admin e-mails in the **`Admins`** sheet (column A).

## 3. Deploy the Web App
1. **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**  *(required so the GitHub page can call it; every call is still authenticated by the Google ID token)*
2. Copy the **Web app URL** ending in `/exec`.
3. After any later change to `Code.gs`: **Deploy → Manage deployments → Edit → New version** (keeps the same URL).

## 4. Configure and publish the front end
1. In `index.html`, edit the `CONFIG` block at the top:
   ```js
   API_URL: 'https://script.google.com/macros/s/XXXX/exec',
   GOOGLE_CLIENT_ID: 'XXXX.apps.googleusercontent.com',
   ```
2. Logos load from the shared ITOC Brand Kit – nothing to add. Make sure ITOC **v2.6** (official logos) is published.
3. Push the `sru-voice-v1.3` contents to the GitHub repository and enable **Settings → Pages**.

## 5. Acceptance checklist
| # | Test | Expected |
|---|---|---|
| 1 | Sign in with a personal Gmail | Rejected – "university accounts only" |
| 2 | Sign in with `@sr.edu.sa` | Enters; row added to `SignInLog` |
| 3 | Submit a suggestion (public) | Reference `SV-YYYY-0001`; ack e-mail; admin alert |
| 4 | Admin approves publishing | Idea appears in «الأفكار والتصويت» |
| 5 | Second student votes / un-votes | Count updates; owner cannot vote on own idea |
| 6 | Admin moves stage → student view | Tracker + timeline updated; student e-mailed |
| 7 | Admin sets «تم التنفيذ» with improvement text | Card appears in «أنجزنا بملاحظاتكم» |
| 8 | Submit a complaint | Never shown publicly; impact card anonymised |
| 9 | Non-admin opens `#admin` | Redirected; API returns FORBIDDEN |

## Quotas to keep in mind (Google Workspace)
- MailApp: ~1,500 recipients/day per Workspace account – disable `NOTIFY_ADMINS_ON_NEW` if volume is high and rely on the daily SLA digest.
- Apps Script: 30 simultaneous executions – adequate for a university-wide campaign; for heavier load, move storage to a database.
