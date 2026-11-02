<div dir="rtl">

# פסיפס — השרת (API)

שרת ה־REST API של **פסיפס**, ארכיון הזיכרונות הכיתתי: הרשמה והתחברות, כיתות וחברות, פרסומים, תגובות, העלאת תמונות וממשק מנהלת מערכת.

- 🖥️ **מאגר הקליינט (React):** https://github.com/ESTY123SWID/psifas-client
- 🌐 **האתר החי:** *יתווסף לאחר הפרסום בענן*

---

## טכנולוגיות

| טכנולוגיה | שימוש |
|---|---|
| **Node.js** + **Express 5** + **TypeScript** | שרת ה־API |
| **PostgreSQL** | מסד הנתונים |
| **Prisma 7** (עם `@prisma/adapter-pg`) | ORM ו־Migrations |
| **Zod** | ולידציה של כל קלט |
| **JWT** ב־**HttpOnly Cookie** | התחברות ו־Session |
| **argon2id** | Hash לסיסמאות |
| **Multer** | העלאת תמונות |
| **Helmet**, **CORS**, **express-rate-limit** | אבטחה |
| **Vitest** + **Supertest** | בדיקות אינטגרציה מול PostgreSQL אמיתי |
| **embedded-postgres** | PostgreSQL מקומי לפיתוח, ללא התקנה |

---

## ה־API

כל הנתיבים תחת `/api`. כל שגיאה מוחזרת במבנה אחיד: `{ code, message, details? }`.
`401` = אין התחברות תקפה · `403` = מחוברת אך ללא הרשאה · `404` = לא נמצא · `409` = התנגשות · `400` = קלט לא תקין · `413` = קובץ גדול מדי.

| קבוצה | נתיבים עיקריים | הרשאה |
|---|---|---|
| **התחברות** | `POST /auth/register` · `POST /auth/login` · `POST /auth/logout` · `GET/PATCH /auth/me` · `POST /auth/me/password` | ציבורי / מחוברת |
| **כיתות** | `GET /classes/my` · `POST /classes` · `POST /classes/join` · `GET/PATCH/DELETE /classes/:classId` · `GET /classes/:classId/invite-code` · `POST /classes/:classId/invite-code/regenerate` | חברה / מנהלת הכיתה |
| **חברות** | `GET /classes/:classId/members` · `PATCH/DELETE /classes/:classId/members/:memberId` · `DELETE /classes/:classId/members/me` | חברה / מנהלת הכיתה |
| **פרסומים** | `GET/POST /classes/:classId/posts` (חיפוש, סינון, מיון, עימוד) · `GET /classes/:classId/posts/recent` · `GET /classes/:classId/featured` · `GET/PATCH/DELETE /classes/:classId/posts/:postId` | חברה (עריכה ומחיקה: הכותבת או מנהלת הכיתה) |
| **תגובות** | `POST /posts/:postId/reactions` (הוספה / החלפה / הסרה) | חברה בכיתה של הפרסום |
| **ניהול מערכת** | `GET /admin/dashboard` · `GET /admin/users` · `GET/PATCH/DELETE /admin/users/:userId` · `GET /admin/classes` · `GET/PATCH/DELETE /admin/classes/:classId` · `GET /admin/classes/:classId/members` · `PATCH/DELETE /admin/classes/:classId/members/:userId` | מנהלת מערכת |
| **תמונות** | `GET /media/*` — קישורים חתומים עם תוקף | בעלת קישור חתום |
| **תקינות** | `GET /health` · `GET /api/health` | ציבורי |

### הרשאות
- **תפקיד גלובלי** (`User.role`): `User` או `SystemAdmin`.
- **תפקיד בכיתה** (`ClassMember.role`): `Member` או `ClassManager` — נשמר על החברות, כך שמשתמשת יכולה לנהל כיתה אחת ולהיות חברה רגילה בכיתה אחרת.
- כל ההרשאות נבדקות מול מסד הנתונים בכל בקשה. בכיתה חייבת להישאר לפחות מנהלת אחת (נאכף בטרנזקציה עם נעילת שורה).

---

## מסד הנתונים

PostgreSQL דרך Prisma — הסכמה: [`prisma/schema.prisma`](prisma/schema.prisma).

| ישות | תיאור |
|---|---|
| **User** | שם, אימייל ייחודי, Password Hash, תפקיד גלובלי, `sessionVersion` |
| **Class** | שם וקוד הצטרפות ייחודי |
| **ClassMember** | חברות של משתמשת בכיתה ותפקידה בה (מפתח משולב — ללא כפילויות) |
| **Post** | כיתה, מפרסמת, סוג (`quote` / `image`), כותרת, תוכן, מפתח תמונה, תאריכים |
| **Reaction** | תגובה אחת לכל משתמשת בכל פרסום (מפתח משולב) |

מחיקת כיתה מוחקת את כל התוכן שלה; מחיקת משתמשת שומרת את הפרסומים שלה ללא פרטים מזהים. במסד מוגדרים גם אינדקסים ואילוצי CHECK.

---

## התקנה והרצה

**דרישות:** Node.js 20.19 ומעלה. אין צורך להתקין PostgreSQL לפיתוח.

```bash
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

---

## Prisma Migrations

| פקודה | מתי |
|---|---|
| `npm run migrate:deploy` | החלת ה־Migrations הקיימות (פיתוח ופרודקשן) — לא מוחקת נתונים |
| `npm run migrate:dev -- --name <שם>` | יצירת Migration חדשה אחרי שינוי בסכמה |
| `npm run migrate:status` | אילו Migrations הוחלו |
| `npm run prisma:generate` | יצירה מחדש של Prisma Client |

---

## בדיקות

```bash
npm test
```

63 בדיקות אינטגרציה מול PostgreSQL אמיתי, במסד נתונים **נפרד** (`TEST_DATABASE_URL`, ששמו חייב לכלול `test`). מכסות התחברות ו־Sessions, `401` מול `403`, CSRF, CORS ו־Rate Limiting, הרשאות בין כיתות, תפקידים והגנת המנהלת האחרונה (כולל בקשות מקבילות), CRUD של פרסומים עם חיפוש, סינון, מיון ועימוד, תגובות, העלאת תמונות וקישורים חתומים, וכל פעולות הניהול.

---

## משתני סביבה

תבנית מלאה: [`.env.example`](.env.example). הערכים האמיתיים נשמרים רק ב־`.env` מקומי שאינו נכנס ל־Git.

| משתנה | חובה | תיאור |
|---|---|---|
| `DATABASE_URL` | ✅ | חיבור ל־PostgreSQL |
| `JWT_SECRET` | ✅ | מחרוזת אקראית של 32 תווים לפחות |
| `CLIENT_ORIGINS` | | כתובות הקליינט המורשות, מופרדות בפסיק |
| `API_PUBLIC_URL` | | הכתובת הציבורית של ה־API כולל `/api` (לקישורי התמונות) |
| `PORT`, `NODE_ENV` | | פורט וסביבה |
| `SESSION_TTL_DAYS` | | משך ה־Session (ברירת מחדל: 7 ימים) |
| `COOKIE_SECURE`, `COOKIE_SAMESITE` | | הגדרות ה־Cookie |
| `TRUST_PROXY` | | מספר ה־Proxies (בדרך כלל `1` בענן) |
| `STORAGE_DRIVER`, `UPLOADS_DIR`, `MEDIA_URL_SECRET` | | אחסון תמונות וחתימת קישורים |
| `AUTH_RATE_LIMIT_MAX` | | מגבלת ניסיונות התחברות ל־IP |
| `TEST_DATABASE_URL` | לבדיקות | מסד נתונים נפרד לבדיקות |

```bash
# יצירת JWT_SECRET אקראי
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

---

## תמונות

JPG, PNG ו־WebP עד 5MB; הסוג נבדק לפי תוכן הקובץ (Magic Bytes); שמות קבצים אקראיים; הגשה דרך קישורים חתומים עם תוקף; מחיקת הקבצים עם מחיקת הפרסום או הכיתה.

שכבת האחסון מופרדת ב־[`src/storage/`](src/storage/) מאחורי הממשק `StorageService`. המימוש הקיים כותב לדיסק המקומי ומיועד **לפיתוח בלבד** — לפני פרסום בענן יש להוסיף מימוש לשירות אחסון קבוע (S3, Cloudflare R2, Supabase Storage).

---

## אבטחה

Hash של argon2id לסיסמאות · JWT ב־Cookie מסוג HttpOnly עם `Secure`/`SameSite` לפי סביבה · טעינת המשתמשת והתפקיד ממסד הנתונים בכל בקשה · ביטול Sessions בשינוי סיסמה · הגנת CSRF (בדיקת `Origin` וכותרת `X-Requested-With`) · CORS רק לכתובות מורשות · Rate Limiting · ולידציה ב־Zod · Helmet · כל הסודות ממשתני סביבה.

---

## פריסה לענן (טרם בוצעה)

1. PostgreSQL מנוהל (Neon / Supabase / Render) → `DATABASE_URL`.
2. Build: `npm ci && npm run build` · Start: `npm start` · בכל פריסה: `npm run migrate:deploy`.
3. משתנים: `NODE_ENV=production`, `JWT_SECRET`, `DATABASE_URL`, `CLIENT_ORIGINS`, `API_PUBLIC_URL`, `TRUST_PROXY=1`.
4. בדיקת תקינות: `GET /health`.
5. אם הקליינט והשרת על אתרים שונים: `COOKIE_SAMESITE=none` (מחייב HTTPS); עדיף דומיין משותף.

</div>
