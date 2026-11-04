<div dir="rtl">

# פסיפס — השרת (API)

שרת ה־REST API של **פסיפס**, ארכיון הזיכרונות הכיתתי: הרשמה והתחברות, כיתות וחברות, פרסומים, תגובות, העלאת תמונות וממשק מנהלת מערכת.

- 🌐 **האתר החי:** https://psifas.onrender.com
- 🖥️ **מאגר הקליינט (React):** https://github.com/ESTY123SWID/psifas-client

---

## על פסיפס

**פסיפס** הוא מקום משותף לזיכרונות של כיתה. כל כיתה היא מרחב פרטי שמצטרפים אליו עם קוד הצטרפות. בתוך הכיתה מפרסמים **משפטים** ו**תמונות**, צופים בהם ברשימה עם חיפוש, סינון ומיון ובגלריית תמונות, ומגיבים בשמונה תגובות רגשיות — תגובה אחת לכל משתמשת בכל פרסום. מנהלת מערכת מנהלת את המשתמשות והכיתות מממשק ניהול נפרד.

---

## סוגי משתמשים והרשאות

שתי שכבות הרשאה **נפרדות**, ושתיהן נבדקות מול מסד הנתונים בכל בקשה:

| שכבה | שדה | ערכים | נאכף ב־ |
|---|---|---|---|
| **תפקיד מערכתי** | `User.role` (`GlobalRole`) | `User` · `SystemAdmin` | `requireAuth`, `requireSystemAdmin` ([`src/middleware/auth.ts`](src/middleware/auth.ts)) |
| **תפקיד בכיתה** | `ClassMember.role` (`ClassRole`) | `Member` · `ClassManager` | `requireClassMember`, `requireClassManager` ([`src/middleware/classAccess.ts`](src/middleware/classAccess.ts)) |

| סוג | איך מקבלים | מה מותר | מה חסום |
|---|---|---|---|
| **משתמשת (`User`)** | כל הרשמה | פרופיל, שינוי סיסמה, יצירת כיתה, הצטרפות בקוד, רשימת הכיתות שלה | כל כיתה שאינה חברה בה (`403`), כל `/api/admin/*` (`403`) |
| **חברה בכיתה (`Member`)** | הצטרפות עם קוד ההצטרפות | צפייה בכיתה, בחברות ובכל הפרסומים; פרסום; עריכה ומחיקה של הפרסומים **שלה**; תגובות; עזיבת הכיתה | קוד ההצטרפות, שינוי שם, תפקידים, הסרת חברות, מחיקת הכיתה, עריכת פרסומים של אחרות |
| **מנהלת כיתה (`ClassManager`)** | יוצרת הכיתה, או מינוי על ידי מנהלת כיתה / מנהלת מערכת | בנוסף: קוד ההצטרפות והחלפתו, שינוי שם, מינוי והורדה של מנהלות, הסרת חברות, עריכה ומחיקה של **כל** פרסום בכיתה, מחיקת הכיתה | כל כיתה אחרת; ממשק ניהול המערכת |
| **מנהלת מערכת (`SystemAdmin`)** | `npm run seed:admin` או עדכון במסד הנתונים; לאחר מכן מנהלת מערכת יכולה לקדם אחרות בממשק הניהול. **אין** נתיב ציבורי שמעניק את התפקיד | `/api/admin/*`: נתונים כלליים, ניהול משתמשות (תפקיד, מחיקה) וניהול כיתות (שם, חברות, תפקידים, מחיקה) | שינוי התפקיד של עצמה או מחיקת עצמה; הורדה או מחיקה של מנהלת המערכת האחרונה; מחיקת משתמשת שהיא המנהלת האחרונה של כיתה. צפייה בפרסומים של כיתה מחייבת חברות בה, כמו לכל משתמשת |

**כללי שמירה:**
- בכל כיתה חייבת להישאר לפחות מנהלת אחת. הכלל נאכף בטרנזקציה עם נעילת שורה, גם מול בקשות מקבילות, וגם בפעולות מממשק הניהול.
- תפקיד מערכתי משתנה רק מממשק הניהול או דרך `seed:admin`. ההרשמה ו־`PATCH /auth/me` מעדכנים רק שם, אימייל וסיסמה, ושדה כמו `role` מסונן מהקלט.
- השרת טוען את המשתמשת ואת התפקיד ממסד הנתונים בכל בקשה, ולכן שינוי תפקיד חל מיד, בלי התחברות מחדש.

---

## מבנה המערכת

```text
דפדפן ──► psifas.onrender.com  (Render Static Site — הקליינט)
              │  /api/*  ──►  psifas-api.onrender.com  (Render Web Service — השרת הזה)
              │                    ├──► Neon PostgreSQL   (נתונים)
              │                    └──► Cloudinary        (תמונות פרטיות)
```

| טכנולוגיה | שימוש |
|---|---|
| **Node.js** + **Express 5** + **TypeScript** | שרת ה־API |
| **PostgreSQL** (Neon בענן) | מסד הנתונים |
| **Prisma 7** (עם `@prisma/adapter-pg`) | ORM ו־Migrations |
| **Zod** | ולידציה של כל קלט ושל משתני הסביבה |
| **JWT** ב־**HttpOnly Cookie** | התחברות ו־Session |
| **argon2id** | Hash לסיסמאות |
| **Multer** + **Cloudinary** | העלאת תמונות ואחסון קבוע |
| **Helmet**, **CORS**, **express-rate-limit** | אבטחה |
| **Vitest** + **Supertest** | בדיקות אינטגרציה מול PostgreSQL אמיתי |
| **embedded-postgres** | PostgreSQL מקומי לפיתוח, ללא התקנה |

### שכבות ותיקיות

```text
src/
├── server.ts / app.ts   ← הפעלה והרכבת ה־middleware
├── config/              ← משתני סביבה (נבדקים ב־Zod בעלייה)
├── routes/              ← הגדרת הנתיבים וה־middleware של כל נתיב
├── middleware/          ← הזדהות, הרשאות כיתה, CSRF, Rate Limit, העלאה, טיפול בשגיאות
├── controllers/         ← קריאת הבקשה והחזרת התשובה
├── schemas/             ← סכמות Zod לקלט
├── services/            ← לוגיקה עסקית וכללי הרשאה (טרנזקציות)
├── repositories/        ← גישה למסד הנתונים דרך Prisma
├── storage/             ← אחסון תמונות: local (פיתוח) / cloudinary (פרודקשן)
├── lib/, utils/, types/ ← Prisma Client, עזרים וטיפוסים
└── generated/           ← Prisma Client שנוצר (לא ב־Git)
```

בקשה עוברת: `route → middleware (auth / class access / validation) → controller → service → repository → Prisma`.

### תקשורת עם הקליינט
- REST ב־JSON תחת `/api`; העלאת תמונות ב־`multipart/form-data`.
- ה־Session נשמר ב־Cookie מסוג HttpOnly (בענן: `__Host-psifas_session`, `Secure`, `SameSite=Lax`).
- כל בקשה משנה (POST/PATCH/DELETE) חייבת `Origin` מורשה ואת הכותרת `X-Requested-With` (הגנת CSRF).
- בענן הקליינט פונה ל־`https://psifas.onrender.com/api`, והאתר הסטטי מעביר את הבקשה לשרת. לכן ה־Cookie שייך לאותו אתר ואין צורך ב־CORS בין אתרים.

---

## ה־API

כל הנתיבים תחת `/api`. כל שגיאה מוחזרת במבנה אחיד: `{ code, message, details? }`.
`401` = אין התחברות תקפה · `403` = מחוברת אך ללא הרשאה · `404` = לא נמצא · `409` = התנגשות · `400` = קלט לא תקין · `413` = קובץ גדול מדי.

| קבוצה | נתיבים עיקריים | הרשאה |
|---|---|---|
| **התחברות** | `POST /auth/register` · `POST /auth/login` · `POST /auth/logout` · `GET/PATCH /auth/me` · `POST /auth/me/password` | ציבורי / מחוברת |
| **כיתות** | `GET /classes/my` · `POST /classes` · `POST /classes/join` · `GET/PATCH/DELETE /classes/:classId` · `GET /classes/:classId/invite-code` · `POST /classes/:classId/invite-code/regenerate` | מחוברת / חברה / מנהלת הכיתה |
| **חברות** | `GET /classes/:classId/members` · `PATCH/DELETE /classes/:classId/members/:memberId` · `DELETE /classes/:classId/members/me` | חברה / מנהלת הכיתה |
| **פרסומים** | `GET/POST /classes/:classId/posts` (חיפוש, סינון, מיון, עימוד) · `GET /classes/:classId/posts/recent` · `GET /classes/:classId/featured` · `GET/PATCH/DELETE /classes/:classId/posts/:postId` | חברה (עריכה ומחיקה: הכותבת או מנהלת הכיתה) |
| **תגובות** | `POST /posts/:postId/reactions` (הוספה / החלפה / הסרה) | חברה בכיתה של הפרסום |
| **ניהול מערכת** | `GET /admin/dashboard` · `GET /admin/users` · `GET/PATCH/DELETE /admin/users/:userId` · `GET /admin/classes` · `GET/PATCH/DELETE /admin/classes/:classId` · `GET /admin/classes/:classId/members` · `PATCH/DELETE /admin/classes/:classId/members/:userId` | מנהלת מערכת |
| **תמונות (פיתוח)** | `GET /media/*` — קישורים חתומים עם תוקף, רק עם אחסון `local` | בעלת קישור חתום |
| **תקינות** | `GET /health` · `GET /api/health` | ציבורי |

---

## מסד הנתונים

PostgreSQL דרך Prisma — הסכמה: [`prisma/schema.prisma`](prisma/schema.prisma).

| ישות | תיאור |
|---|---|
| **User** | שם, אימייל ייחודי, Password Hash, תפקיד מערכתי, `sessionVersion` |
| **Class** | שם וקוד הצטרפות ייחודי |
| **ClassMember** | חברות של משתמשת בכיתה ותפקידה בה (מפתח משולב — ללא כפילויות) |
| **Post** | כיתה, מפרסמת, סוג (`quote` / `image`), כותרת, תוכן, מפתח תמונה, תאריכים |
| **Reaction** | תגובה אחת לכל משתמשת בכל פרסום (מפתח משולב) |

מחיקת כיתה מוחקת את כל התוכן שלה. מחיקת משתמשת שומרת את הפרסומים שלה ללא פרטים מזהים. במסד מוגדרים גם אינדקסים ואילוצי CHECK.

---

## תמונות

- JPG, PNG ו־WebP עד 5MB. הסוג נבדק לפי תוכן הקובץ (Magic Bytes), לא לפי השם או ה־MIME שנשלח, ולכל קובץ ניתן שם אקראי.
- שכבת האחסון מופרדת ב־[`src/storage/`](src/storage/) מאחורי הממשק `StorageService`, ובוחרים אותה ב־`STORAGE_DRIVER`:
  - **`cloudinary`** (פרודקשן) — קבצים פרטיים (`type: authenticated`) בתיקייה `psifas/classes/<id>/`, שמוצגים רק דרך קישורים חתומים. בקשה ללא חתימה נדחית.
  - **`local`** (פיתוח בלבד) — דיסק השרת, מוגש דרך `/api/media` עם קישורים חתומים ובעלי תוקף.
- הקבצים נמחקים מהאחסון עם מחיקת הפרסום, החלפת התמונה או מחיקת הכיתה.
- **כיוון התמונה:** השרת שומר את הקובץ כפי שהתקבל, ו־Cloudinary מגיש אותו כמו שהוא (ללא טרנספורמציות). תמונות מטלפון מוצגות נכון כי הדפדפן מיישם את נתון ה־EXIF Orientation. סיבוב ידני נעשה בקליינט לפני ההעלאה, והקובץ המסובב נשלח בלי EXIF, כך שאין סיבוב כפול.

---

## הרצה מקומית

**דרישות מקדימות:** Node.js 20.19 ומעלה. לפיתוח אין צורך להתקין PostgreSQL.

```bash
git clone https://github.com/ESTY123SWID/psifas-server.git
cd psifas-server
npm install                      # מתקין ומייצר את Prisma Client
cp .env.example .env             # ולמלא ערכים (ראו "משתני סביבה")

npm run db:local                 # PostgreSQL מקומי על פורט 5433 — להשאיר פתוח

# בחלון נוסף:
npm run migrate:deploy           # יצירת הטבלאות
npm run dev                      # http://localhost:4000/api
```

לאחר מכן מריצים את [הקליינט](https://github.com/ESTY123SWID/psifas-client).

### מנהלת המערכת הראשונה
אין חשבון מנהלת קבוע בקוד. נרשמים באתר כרגיל, ואז:

```bash
ADMIN_EMAIL="your-email@example.com" npm run seed:admin
```

הפקודה הופכת חשבון קיים למנהלת מערכת בלי לגעת בסיסמה. ליצירת חשבון חדש מוסיפים `ADMIN_NAME`, והסיסמה מוקלדת בשורה נסתרת — היא לא מוצגת ולא נשמרת בקובץ.

### פקודות
| פקודה | תיאור |
|---|---|
| `npm run dev` | שרת פיתוח עם טעינה מחדש |
| `npm run build` / `npm start` | יצירת Prisma Client וקומפילציה ל־`dist` / הרצת הגרסה המקומפלת |
| `npm run typecheck` | בדיקת TypeScript |
| `npm test` | בדיקות אינטגרציה |
| `npm run db:local` | PostgreSQL מקומי לפיתוח |
| `npm run seed:admin` | הגדרת מנהלת המערכת הראשונה |

### Prisma Migrations
| פקודה | מתי |
|---|---|
| `npm run migrate:deploy` | החלת ה־Migrations הקיימות (פיתוח ופרודקשן) — לא מוחקת נתונים |
| `npm run migrate:dev -- --name <שם>` | יצירת Migration חדשה אחרי שינוי בסכמה |
| `npm run migrate:status` | אילו Migrations הוחלו |
| `npm run prisma:generate` | יצירה מחדש של Prisma Client |

---

## משתני סביבה

תבנית מלאה: [`.env.example`](.env.example). הערכים האמיתיים נשמרים רק ב־`.env` מקומי שאינו נכנס ל־Git, ובענן — בהגדרות השירות ב־Render.

| משתנה | חובה | תיאור |
|---|---|---|
| `DATABASE_URL` | ✅ | חיבור ל־PostgreSQL |
| `JWT_SECRET` | ✅ | מחרוזת אקראית של 32 תווים לפחות |
| `CLIENT_ORIGINS` | | כתובות הקליינט המורשות, מופרדות בפסיק |
| `API_PUBLIC_URL` | | הכתובת הציבורית של ה־API כולל `/api` |
| `PORT`, `NODE_ENV` | | פורט וסביבה |
| `SESSION_TTL_DAYS` | | משך ה־Session (ברירת מחדל: 7 ימים) |
| `COOKIE_SECURE`, `COOKIE_SAMESITE` | | הגדרות ה־Cookie |
| `TRUST_PROXY` | | מספר ה־Proxies (`1` ב־Render) |
| `STORAGE_DRIVER` | | `local` (פיתוח) או `cloudinary` (פרודקשן) |
| `CLOUDINARY_URL` | עם `cloudinary` | מחרוזת החיבור של Cloudinary (מתוך לוח הבקרה, API Keys) |
| `UPLOADS_DIR`, `MEDIA_URL_SECRET` | | אחסון מקומי וחתימת קישורים (פיתוח) |
| `AUTH_RATE_LIMIT_MAX` | | מגבלת ניסיונות התחברות ל־IP |
| `TEST_DATABASE_URL` | לבדיקות | מסד נתונים נפרד לבדיקות |

```bash
# יצירת JWT_SECRET אקראי
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

---

## בדיקות

```bash
npm test
```

66 בדיקות אינטגרציה מול PostgreSQL אמיתי, במסד נתונים **נפרד** (`TEST_DATABASE_URL`, ששמו חייב לכלול `test`). הן מכסות:
- התחברות ו־Sessions, ו־`401` מול `403`
- CSRF, CORS ו־Rate Limiting
- הרשאות בין כיתות, תפקידים והגנת המנהלת האחרונה (כולל בקשות מקבילות)
- CRUD של פרסומים עם חיפוש, סינון, מיון ועימוד, ותגובות
- העלאת תמונות, קישורים חתומים ודרייבר Cloudinary (ללא רשת)
- כל פעולות הניהול, כולל חסימת משתמשת רגילה מכל נתיב `/api/admin`

---

## אבטחה

- סיסמאות: Hash של argon2id.
- Session: JWT ב־Cookie מסוג HttpOnly, עם `Secure`/`SameSite` לפי סביבה.
- המשתמשת והתפקיד נטענים ממסד הנתונים בכל בקשה, ושינוי סיסמה מבטל את כל ה־Sessions.
- הגנת CSRF: בדיקת `Origin` והכותרת `X-Requested-With`.
- CORS רק לכתובות מורשות, Rate Limiting, ולידציה ב־Zod, Helmet.
- תמונות פרטיות עם קישורים חתומים.
- כל הסודות מגיעים ממשתני סביבה בלבד.

---

## פריסה לענן

הפריסה מוגדרת ב־[`render.yaml`](render.yaml), במסלולים חינמיים בלבד:

| רכיב | שירות | כתובת |
|---|---|---|
| הקליינט | Render Static Site | https://psifas.onrender.com |
| השרת | Render Web Service (Frankfurt) | https://psifas-api.onrender.com |
| מסד הנתונים | Neon PostgreSQL (Frankfurt) | — |
| תמונות | Cloudinary | — |

- **Build:** `npm ci --include=dev && npm run build && npm run migrate:deploy` · **Start:** `npm start` · **Health check:** `GET /health` (לא ניגש למסד הנתונים).
- כל פריסה מחילה את ה־Migrations החדשות בלבד (`migrate deploy`), בלי למחוק נתונים.
- האתר הסטטי מעביר את `/api/*` לשרת, וכל נתיב אחר מוגש כ־`index.html`.
- `DATABASE_URL`, `CLOUDINARY_URL` ו־`JWT_SECRET` מוגדרים רק בהגדרות השירות ב־Render, לא בקוד.
- כל Push לענף `main` מפעיל פריסה מחדש אוטומטית.
- במסלול החינמי השרת "נרדם" אחרי כ־15 דקות ללא שימוש, והבקשה הראשונה אחרי הפסקה עשויה להימשך עד כדקה.

</div>
