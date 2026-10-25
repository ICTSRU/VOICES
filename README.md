# SRU Voice – منصة صوت الطالب · v1.5

**Sulaiman Al Rajhi University · ICTD – IT Operations Center (ITOC)**

منصة لتقديم المقترحات والشكاوى، والتصويت على الأفكار العامة، ومتابعة مراحل دراستها وتنفيذها، وإظهار التحسينات التي تحققت بناءً على ملاحظات الطلاب.

A student voice platform: submit suggestions and complaints, vote on public ideas, track each item through review → study → approval → implementation, and showcase the improvements delivered from student feedback ("You said – We did").

---

## Features | المزايا

| Module | الوحدة | Description |
|---|---|---|
| Sign-in | تسجيل الدخول | Branded ITOC sign-in screen, Google sign-in restricted to `@sr.edu.sa` / `@srcolleges.org`; every sign-in logged (e-mail, date, time) |
| Submit | تقديم مقترح أو شكوى | Suggestion or complaint, 9 categories, optional public voting, optional name hiding, daily rate limit |
| Ideas & voting | الأفكار والتصويت | Admin-approved public suggestions, one vote per student, search / filter / sort |
| My requests | طلباتي | 6-stage tracker, official response, visible stage history |
| Impact | أنجزنا بملاحظاتكم | "You said – We did" cards + completion KPIs (complaints shown anonymised) |
| Admin | لوحة الإدارة | Stage updates, assignment (SRU org structure), public approval, response, improvement note, internal note, CSV export |
| Automation | الأتمتة | Acknowledgement e-mail, admin alert on new items, student e-mail on stage change, daily SLA reminder |

**Stages | المراحل:** جديد → قيد المراجعة → قيد الدراسة → معتمد للتنفيذ → قيد التنفيذ → تم التنفيذ (or غير معتمد with a mandatory reason)

## Repository layout

```
sru-voice-v1.5/
├── index.html              # Front end (GitHub Pages) – CONFIG block at the top
├── apps-script/
│   ├── Code.gs             # Backend (Google Apps Script bound to the Google Sheet)
│   └── appsscript.json     # Manifest (Asia/Riyadh, web app settings)
├── SETUP.md                # Step-by-step deployment guide
├── CHANGELOG.md
└── README.md
```

## Branding – single shared source | الهوية من مصدر واحد

No logos are stored in this repository. The header and footer come from the shared **SRU Brand Kit** in the ITOC repository:

```html
<script src="https://ictsru.github.io/ITOC/brand/sru-brand.js"
        data-form-title="منصة صوت الطالب · SRU Voice" data-form-version="v1.5" defer></script>
```

| Logo | Shared file |
|---|---|
| Sulaiman Alrajhi University (header – right) | `https://ictsru.github.io/ITOC/assets/sru-logo.png` |
| ICTD (header – left) | `https://ictsru.github.io/ITOC/assets/ictd-logo.png` |
| ITOC (footer – bottom-left, linked to the forms hub) | `https://ictsru.github.io/ITOC/assets/itoc-logo.png` |

- To change a logo for **every** platform: replace the file in `ITOC/assets/` with the same name.
- When releasing a new SRU Voice version, update `data-form-version` and `CONFIG.VERSION` together.
- If the kit cannot load, the page draws the same header/footer itself from `CONFIG.BRAND_ASSETS`.
- If a shared logo file cannot be reached (network policy, Pages not deployed yet, offline), a compact built-in copy (~19 KB in total) is shown instead, so the logos never disappear. The shared files remain the primary source.

## Data model (Google Sheet)

| Sheet | Purpose |
|---|---|
| `Submissions` | One row per suggestion/complaint (status, votes, response, improvement…) |
| `Votes` | One row per vote (idea id, voter e-mail, time) |
| `StatusLog` | Full audit trail of stage changes and notes |
| `SignInLog` | E-mail, name, date, time, user agent of each sign-in |
| `Admins` | E-mails allowed to open the admin panel |

## Security & privacy

- Google ID token verified server-side on **every** request (audience, verified e-mail, allowed domain).
- Complaints are never public; anonymous names hidden from other students (visible to admins only).
- Internal notes never leave the admin panel; formula-injection neutralised in Sheets and CSV.
- Admin rights come only from the `Admins` sheet / `CFG.ADMIN_EMAILS`.

## Demo mode

If `API_URL` or `GOOGLE_CLIENT_ID` is empty in `index.html`, the page runs in **demo mode**: sample data, any university e-mail can sign in as admin, data kept in the browser only. Useful for review before connecting the Sheet.

## Deployment

See **[SETUP.md](SETUP.md)**.

---
© ICTD – Sulaiman Al Rajhi University · Maintained by IT Operations Center (ITOC)
