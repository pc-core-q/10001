# STORE_AI_GUIDE — الدليل الشامل لقالب المتجر الإلكتروني

> **إلى الذكاء الاصطناعي الذي يقرأ هذا الملف:** هذا الملف يصف المشروع كاملاً (الهيكلة، البيانات، الربط بالخدمات، طرق التعديل، وحل المشاكل).
> اعتمد عليه بدل طلب الملفات. إذا طلبت تعديلاً فاذكر اسم الملف والدالة بالضبط (كلها موثقة هنا).
> **لا تضع مفاتيح حقيقية في أي رد.** كل المفاتيح في هذا الدليل أمثلة (`YOUR_...`).
> **آخر تحديث:** 2026-10-30 — **مطابق لنسخة `10000-main` (`?v=93`).** الجديد: **(1) مراجعة وإصلاح أدوات الذكاء الاصطناعي بالكامل (القسم 24 أُعيدت كتابته):** المفاتيح **ليست** في `config.js` بل في متغيرات بيئة Cloudflare؛ الوسيط `functions/api/ai.js` صار **مقصوراً على الأدمن** (كان مفتوحاً لأي زائر)؛ كل ناتج من النموذج يُنظَّف ويُتحقَّق منه قبل أن تراه `admin.js`؛ وأُصلحت أخطاء التسعير والاستيراد التي كانت مسجّلة (القسم 15 بنود 27–33 صارت ✅)؛ **(2) بروتوكول دقة للذكاء الاصطناعي الذي يعدّل المشروع (القسم 0-أ)**؛ **(3) `tests/ai-tests.js`** (18 اختباراً) وإصلاح اختبار boot الفاشل (القسم 18 صف 34). **توحيد الإعدادات (2026-10-21):** كل ما يخص متجراً بعينه (هويته، الشعار، Firebase، ImgBB، ImageKit، Google Analytics، Algolia، الأدمن، **الثيم والألوان والخط**، SEO، سطر المطوّر) صار في **ملف واحد: `js/config.js`**، ويطبّقه المحرّك الجديد `js/boot.js` على كل الصفحات. **لتسليم القالب لمتجر جديد اقرأ القسم 0-ب فقط.** النسخة الأساسية: `test3-main` (كل روابط CSS/JS `?v=93` في **كل** الصفحات). يشمل: فحص `ws_meta_v` و`ws_index/v` كل **5 دقائق** (بدل كاش 30 دقيقة القديم)، السعر القديم، الهاتف الثاني ورابط الخرائط، وإصلاح بطء لوحة الأدمن في قسم المنتجات (**القسم 20**). الأصناف والدوال في الملحق (القسم 16) مستخرجة من الكود الفعلي. ⚠️ **المتجر يحتاج قاعدتين في Firebase Rules: `ws_index` و`ws_meta_v` (القسم 9)**، وإلا يعمل بالطريقة الأثقل ويستهلك Firebase أكثر.
> ما تغيّر في المراجعة الأخيرة مذكور في **القسم 18**، وما بقي مفتوحاً في **القسم 15**.
> للتعديلات البصرية اقرأ **القسم 5-ب (نظام التصميم)** أولاً. **لا تكتب أي قيمة خاصة بمتجر داخل HTML/CSS/JS — مكانها `js/config.js` حصراً (القاعدة 20 في القسم 13).**

---

## 0. ملخص سريع (اقرأ هذا أولاً)

| البند | القيمة |
|---|---|
| نوع المشروع | قالب متجر إلكتروني **عربي RTL** يُخصَّص لكل عميل (ملابس، كوزمتك، كهربائيات، مواد غذائية...) |
| التقنية | HTML + CSS + JavaScript خام (Vanilla). **لا يوجد build ولا npm ولا إطار عمل** |
| قاعدة البيانات | **Firebase Realtime Database** (ليس Firestore) |
| تسجيل دخول الأدمن | **Firebase Authentication** (Email/Password) |
| رفع الصور | **ImgBB** (رفع) ← **ImageKit** (CDN وضغط وتحويل WebP) |
| بحث/فرز/فلترة المتجر | **فهرس خفيف `ws_index`** في Firebase يُنزَّل مرة ويُخزَّن محلياً، والبحث والفرز يعملان في المتصفح على كل المنتجات (يكفي حتى ~10,000 منتج حسب تعليق `config.js`). **Algolia اختياري ومعطّل افتراضياً** (`useAlgolia:false`) |
| تحديث البيانات عند الزوار | **فحص رقمي خفيف كل 5 دقائق** (300 ثانية) والتبويب مفتوح: `ws_meta_v` (أقسام/إعدادات/إعلانات) و`ws_index/v` (المنتجات). لا يُنزَّل شيء إن لم يتغيّر الرقم. تعديلات الأدمن تصل للزوار خلال ≈5 دقائق كحد أقصى؛ والمنتجات تصل كتغييرات جزئية فقط (القسم 23) |
| إتمام الطلب | رسالة **واتساب** (`wa.me`) + تسجيل نسخة من الطلب في Firebase |
| تخزين محلي | `localStorage` كـ كاش لكل شيء + السلة |
| الاستضافة | أي استضافة ملفات ثابتة (Cloudflare Pages / Vercel / Netlify / GitHub Pages). الملف `_headers` خاص بـ Cloudflare Pages/Netlify |
| الدفع الإلكتروني | غير موجود (الدفع عند الاستلام عبر التواصل بواتساب) |
| ملف إعدادات المتجر | **`js/config.js` وحده** (هوية + خدمات + ثيم + SEO). النسخة الفارغة الجاهزة لمتجر جديد: `js/config.template.js` |
| الثيم | `config.js ← theme { preset, colors, fontFamily, ... }` ← يبنيه `js/boot.js` كمتغيرات CSS لكل الصفحات (المتجر + الأدمن + الدخول). **مكتبة 15 ثيماً جاهزاً في `js/themes.js`** (كل ثيم = ألوان + خط + استدارة + نسبة صور) + ألوان مخصصة. معرض ومحرّر الثيمات: `themes.html` |
| الاختبارات والأدوات | `node tests/run-tests.js` (المنطق، 21 اختباراً) · `node tests/boot-tests.js` (الثيم/الخدمات، 27 اختباراً) · `node tests/ai-tests.js` (أدوات الذكاء الاصطناعي، 35 اختباراً) · `node tests/enrich-tests.js` (جودة الاستخراج والإثراء وكتابة الأوصاف: عميل+خادم حقيقيان بـ fetch وهمي، 24 اختباراً) · `node tests/browser-enrich.js` (اختياري: متصفح Chrome حقيقي بدون واجهة، 13 اختباراً) · `node tests/scale-tests.js` (التوسّع حتى 10,000 منتج، 32 اختباراً) · `node tools/check-config.js` (فحص الإعدادات قبل التسليم) · `node tools/set-version.js N` (رفع `?v=` في كل الصفحات) · `node tools/load-test.js --dry` (تقدير الحمل/حصة Firebase). بلا اعتماديات، لا تُنشر ولا تُحمَّل من أي صفحة |
| الذكاء الاصطناعي (الأدمن فقط) | `js/ai.js` (`window.StoreAI`، يُحمَّل في `admin.html` وحده) ← `POST /api/ai` ← `functions/api/ai.js` (Cloudflare Pages Function، **مقصور على الأدمن**) ← **Groq** للنصوص (وصف المنتج، أوامر التسعير) و**Gemini** للصور/PDF/الجداول. **المفاتيح في متغيرات بيئة Cloudflare لا في `config.js`** ويعمل **على Cloudflare Pages فقط** (القسم 24) |

**القاعدة الذهبية لفهم المشروع:** كل القراءة والكتابة للبيانات تمر عبر الكائن `Store` في `js/store.js`. الصفحات لا تتكلم مع Firebase مباشرة (باستثناء `auth.js`، و`admin.js` في تحديث الطلبات ورفع `ws_meta_v` عبر `bumpMetaVersion()`، و`products.js` في استعلام Algolia العام عند تفعيله).

### 0-أ. بروتوكول الدقة لأي ذكاء اصطناعي يعدّل هذا المشروع (إلزامي)

1. **لا تفترض — تحقق من الكود الحالي.** قد يتأخر هذا الدليل عن الكود؛ **عند التعارض الكود هو الحقيقة** (وأبلغ المستخدم بالتعارض). افتح الملف (قراءة أو `grep`) قبل أن تقول «الدالة X تفعل Y» أو تعدّلها. لا تذكر اسم دالة أو معرّف عنصر أو مفتاح إعداد إلا إن رأيته فعلاً في الملف.
2. **لا تعدّل ما لم يُطلب.** أقل عدد ممكن من الملفات، ولا تعدّل `config.js` بقيم حقيقية ولا تنسخ قيمه في ردودك (القسم 0-ب).
3. **بعد كل تعديل شغّل ما يغطيه:** `node --check <ملف.js>` لكل ملف تغيّر، و`node tests/run-tests.js` دائماً، و`node tests/ai-tests.js` + `node tests/enrich-tests.js` (+ `node tests/browser-enrich.js` إن توفر Chrome) إن لمست `ai.js`/`functions/api/ai.js`/التسعير/الاستيراد/الإثراء، و`node tests/boot-tests.js` + `node tools/check-config.js` إن لمست `boot.js`/`config.js`، و`node tests/scale-tests.js` إن لمست `store.js`/الفهرس. ثم ارفع `?v=` بـ `node tools/set-version.js N`.
4. **افصل في تقريرك بين ما شغّلته فعلاً وما لم تستطع تشغيله** (المتصفح، Firebase، Cloudflare، Groq/Gemini، ImgBB). لا تكتب «تم الاختبار» لشيء لم يُشغَّل، ولا «أصلحت» قبل أن يمرّ اختبار يثبت ذلك.
5. **لا تخترع أرقاماً أو أسماء نماذج أو روابط أو حدوداً.** تحقق من وثائق المزوّد الرسمية (القسم 24.2 يذكر ما تم التحقق منه وتاريخه).
6. **ناتج أي نموذج ذكاء اصطناعي داخل المتجر بيانات غير موثوقة:** يُنظَّف ويُتحقَّق منه (أرقام، روابط http(s)، أقسام موجودة، إجراءات مسموحة) ثم **معاينة وتأكيد من المدير** قبل أي كتابة (القسم 24.5 والقاعدة 24).
7. **عند الالتباس لا تخمّن:** إن احتمل الطلب معنيين فاسأل سؤالاً واحداً محدداً، أو اكتب افتراضك صراحةً في أول الرد. (الأوامر الجماعية خصوصاً: تسعير، حذف، استيراد.)
8. **عند إصلاح خطأ** اكتب له اختباراً يفشل بدون الإصلاح (كما في `tests/ai-tests.js`) وسجّله في القسم 18.
9. **لا تُعد كتابة الدليل من الذاكرة:** حدّث الأجزاء المتأثرة فقط، واستخرج الأسماء والأرقام من الكود (القسم 16 مستخرج منه).

---

## 0-ب. تسليم القالب لمتجر جديد — ملف واحد فقط (`js/config.js`)

> **المبدأ:** كل ما يختلف بين متجر وآخر موجود في `js/config.js`، ولا شيء غيره. لا تفتح `index.html` ولا `style.css` ولا أي `.js` لتخصيص متجر. إن وجدت قيمة خاصة بمتجر مكتوبة في ملف آخر فهذا خلل في القالب يجب نقل قيمتها إلى `config.js` (القاعدة 20).

### ماذا يتحكم به `config.js`؟

| القسم في الملف | ما يتحكم به | أين يظهر أثره |
|---|---|---|
| 1) هوية المتجر | `storeName` `storeTagline` `storeDescription` `logo` `assetVersion` `currencySymbol` `lang` | الهيدر، الفوتر، **عنوان كل صفحة** (`<title>`)، وسوم المشاركة، favicon، رمز العملة في كل الأسعار ورسائل واتساب |
| 2) التواصل | `whatsappNumber` `phone` `phone2` `instagram` `tiktok` `address` `mapUrl` `workingHours` `deliveryInfo` | قيم **افتراضية**: إن حفظ صاحب المتجر قيمة غير فارغة من لوحة التحكم فهي تتغلب، وإن ترك الحقل فارغاً تعود قيمة `config.js` |
| 3.1) Firebase | `firebaseApiKey` … `firebaseAppId` `firebaseDatabaseURL` | قاعدة البيانات + تسجيل دخول الأدمن + `preconnect` تلقائي + الجلب المبكر |
| 3.2) الأدمن | `adminEmails` | من يُسمح له بدخول `admin.html` |
| 3.3) ImgBB | `imgbbApiKey` | رفع الصور من لوحة التحكم |
| 3.4) ImageKit | `imageKitEndpoint` | ضغط الصور وتحويلها WebP عبر CDN + `preconnect` تلقائي |
| 3.5) Google Analytics | `googleAnalyticsId` | يُحقن تلقائياً في **كل صفحات المتجر** (لا في `admin.html` و`login.html`)؛ فارغ = معطّل |
| 3.6) Algolia | `useAlgolia` `algoliaAppId` `algoliaSearchKey` `algoliaIndexName` | بحث اختياري للمتاجر الضخمة (معطّل افتراضياً) |
| 3.7) الذكاء الاصطناعي | `aiEnabled` `aiBilingualNames` `aiEnrich` `aiEnrichMax` | `aiEnabled:false` ← تختفي كل أدوات الذكاء الاصطناعي من الأدمن (شريط الأدوات وزر الوصف واستيراد الإكسل). `aiBilingualNames:false` ← اسم المنتج المستخرج بلغة المصدر دون «عربي / English». `aiEnrich:false` ← لا بحث في الإنترنت بعد الاستيراد (يفتح المراجعة مباشرة). `aiEnrichMax` (افتراضي 40) أقصى عدد منتجات يُثرى في العملية. **المفاتيح ليست هنا** بل في متغيرات بيئة Cloudflare: `GEMINI_API_KEY` `GROQ_API_KEY` `FIREBASE_API_KEY` `ADMIN_EMAILS` (القسم 24.2) |
| 4) الثيم | `theme.preset` `theme.colors.*` `theme.fontFamily` `theme.fontWeights` `theme.fontUrl` `theme.radiusCard` `theme.radiusControl` `theme.containerWidth` `theme.cardImageRatio` `theme.cardImageFit` `theme.allowPreview` | ألوان وخط وشكل **المتجر + لوحة الأدمن + صفحة الدخول** دفعة واحدة |
| 5) SEO | `siteUrl` | `og:url` و`og:image` وروابط المشاركة |
| 6) حقوق المطوّر | `credit { show, name, instagram, instagramLabel, phone }` | سطر الفوتر السفلي (`show:false` يخفيه) |
| 7) حدود وإصدارات | `dataVersion` `maxExcelImportCount` | الكاش. ⚠️ `maxExcelImportCount` **لم يعد يُقرأ من أي ملف** (استيراد الإكسل بلا سقف الآن) |

### الخطوات (بالترتيب)

1. **انسخ مجلد القالب كاملاً** إلى مجلد جديد باسم المتجر (لكل متجر نسخة ومشروع Firebase مستقلان — القسم 11).
2. **ابدأ من الملف الفارغ:** انسخ `js/config.template.js` فوق `js/config.js` (كل القيم فيه `YOUR_...`، وهذا يضمن ألا تبقى مفاتيح متجر سابق بالخطأ).
3. **الهوية (القسم 1 في الملف):** `storeName` و`storeTagline` و`storeDescription` و`currencySymbol`. **الشعار:** ضع ملف PNG مربعاً (512×512 مثالياً) في `assets/logo/logo.png` (أو غيّر `logo` إلى مساره). ثم ارفع `assetVersion` كما في الخطوة 12.
4. **Firebase** (التفاصيل الكاملة والقواعد في **القسم 9**):
   - أنشئ مشروعاً جديداً ثم **Project settings ← Your apps ← Web** وانسخ `firebaseConfig`:

     | في Firebase | في `config.js` |
     |---|---|
     | `apiKey` | `firebaseApiKey` |
     | `authDomain` | `firebaseAuthDomain` |
     | `projectId` | `firebaseProjectId` |
     | `storageBucket` | `firebaseStorageBucket` |
     | `messagingSenderId` | `firebaseMessagingSenderId` |
     | `appId` | `firebaseAppId` |
     | رابط **Realtime Database** (ليس Firestore) | `firebaseDatabaseURL` |

   - فعّل **Authentication ← Email/Password** وأنشئ حساب الأدمن، وضع إيميله في `adminEmails`.
   - الصق **Rules** (القسم 9، الخطوة 7) بعد استبدال `ADMIN_UID`، وأضف نطاق الموقع إلى **Authorized domains**.
5. **ImgBB:** من `api.imgbb.com` ← Get API key ← `imgbbApiKey`. (مفتاح مستقل لكل متجر.)
6. **ImageKit:** أنشئ حساباً ← **External storage ← Add origin** من نوع **Web Folder** وعنوانه `https://i.ibb.co` (ليس Web Proxy) ← انسخ **URL endpoint** إلى `imageKitEndpoint` بلا `/` أخيرة. (القسم 8.3؛ اتركه `""` لتعطيل الضغط — تعمل الصور من ImgBB مباشرة.)
7. **Google Analytics:** Analytics ← Admin ← Data streams ← Web ← **Measurement ID** (يبدأ بـ `G-`) ← `googleAnalyticsId`. اتركه `""` إن لم يرغب المتجر بالتتبع. لا تلصق أي كود `gtag` في HTML: `boot.js` يفعل ذلك.
8. **الثيم (القسم 4 في الملف):**
   - اختر `theme.preset` من المكتبة (افتح **`themes.html`** لمعاينتها كلها): **عام** `navy-gold` · **إلكترونيات** `tech-clean` `electronics-market` `marketplace-yellow` · **ملابس** `fashion-mono` `clothing-burgundy` `sport-bold` · **تجميل وفخامة** `cosmetics-rose` `beauty-glam` `luxury-gold` · **بقالة/صحة/منزل/أطفال** `grocery-fresh` `pharmacy-teal` `home-blue-yellow` `kids-playful` `pet-olive`. كل ثيم يحمل معه **الألوان والخط واستدارة الزوايا ونسبة صورة المنتج**، فيكفي كتابة اسمه.
   - للون خاص بالمتجر اكتب `#RRGGBB` في `theme.colors` (أي لون تتركه `""` يؤخذ من القالب). التخصيص **مستقل لكل طبقة**: الخلفيات (`heroBg` `footerBg` `headerBg`…)، الأزرار (`buttonBg` `buttonText` `buttonHoverBg` `heroButtonBg`)، النصوص (`heading` `price` `headerText`…) — التفاصيل في القسم 5-ب. الدرجات المشتقة (hover، الخلفيات الفاتحة، لون النص فوق الأساسي، الظلال…) تُحسب تلقائياً، ويُختار تلقائياً لون النص فوق `primary` (أبيض أو داكن) حسب سطوعه.
   - **الخط والشكل يأتيان من الثيم** ما لم تكتب في `config.js` قيمة تتغلب عليه: `theme.fontFamily` (و`fontWeights` إن لزم) و`radiusCard` و`radiusControl` و`cardImageRatio` (`"4/5"` للملابس…) و`cardImageFit` (`"contain"` لصور الخلفية البيضاء). اتركها `""` لتتبع الثيم؛ `fontFamily: "system"` = خط النظام بلا تحميل. ⚠️ عند تخصيص `fontWeights` تأكد أن الخط يدعم تلك الأوزان وإلا فشل تحميله (Almarai مثلاً: `400;700` فقط).
   - **للعرض على العميل المحتمل:** اجعل `theme.allowPreview: true` ثم افتح `index.html?theme=pharmacy-teal` (أو أي قالب) فيتغير المظهر في جهازك فقط دون تعديل الملف؛ `?theme=off` يلغي المعاينة. **عطّله (`false`) في النسخة النهائية.**
9. **التواصل:** يكفي تعبئة `whatsappNumber` (صيغة دولية بلا `+`، مثل `9647801234567`) أو تركه ليملأه صاحب المتجر من لوحة التحكم ← الإعدادات. بدون رقم واتساب لا يُقبل إتمام الطلب.
10. **`siteUrl`** = الدومين النهائي (`https://mystore.com` بلا `/`)، و**`credit`** = بياناتك كمطوّر (أو `show:false`).
11. **`dataVersion`:** ابدأ بـ `1`. (يُرفع فقط بعد حذف/تعديل شامل للمنتجات.)
12. **ارفع رقم النسخة** ليتحدث الشعار/CSS عند الزوار: `node tools/set-version.js 2` (يبدّل `?v=` في كل صفحات HTML و`assetVersion` معاً).
13. **افحص قبل التسليم:**
    ```
    node tools/check-config.js     # يتحقق من كل مفتاح وصيغته والألوان والقالب ويحذّر من الأخطاء الأمنية
    node tests/run-tests.js        # منطق المتجر
    node tests/boot-tests.js       # الثيم والخدمات
    node tests/ai-tests.js         # أدوات الذكاء الاصطناعي (التنظيف/التسعير/الخادم الوهمي)
    ```
    `check-config.js` يعطي ✗ لأي قيمة ناقصة أو ما زالت `YOUR_...`، و`!` للتحذيرات (مثل `algoliaAdminKey` معبّأ أو `allowPreview` مفعّل أو إيميل الأدمن التجريبي).
14. **انشر** (القسم 10) ثم: سجّل الدخول للأدمن، واملأ **الإعدادات** (واتساب أولاً)، وأضف الأقسام والمنتجات.
    - **الذكاء الاصطناعي (اختياري):** اضبط متغيرات Cloudflare الأربعة (القسم 24.2) ثم أعد النشر. بدونها تعمل لوحة الأدمن عادياً لكن بلا الأدوات الذكية.

### قواعد سريعة عند التسليم

- **ما يتغير بين المتاجر:** `js/config.js` + `assets/logo/logo.png` فقط. لا تغيّر أي ملف آخر.
- **نصوص صفحات HTML** (عنوان الصفحة، وصف الرئيسية، وسوم المشاركة) تأخذ الاسم والوصف والرابط من `config.js` عبر الرموز `{{storeName}}` `{{storeTagline}}` `{{storeDescription}}` `{{siteUrl}}` `{{logoUrl}}` `{{currencySymbol}}` (يستبدلها `boot.js`). أي عنصر نصي بسمة `data-cfg="storeName"` يمتلئ تلقائياً، وأي `<img data-logo>` يأخذ مسار الشعار من `config.logo`.
- **نصوص الهيرو والمزايا** في `index.html` وصفحة `about.html` نصوص تسويقية عامة (ليست إعدادات)؛ تعديلها لعميل بعينه يتم في ملف نسخته فقط، وإن تكرر الطلب فانقلها إلى مفاتيح جديدة في `config.js` (القسم 12 — وصفة "إضافة مفتاح إعداد").
- **لا تضع أسراراً في `config.js`:** الملف عام يراه كل زائر. مفاتيح Firebase (الويب) وImgBB وAlgolia-Search مقبولة بطبيعتها، أما **`algoliaAdminKey` فاتركه فارغاً دائماً**.
- **حدود "ملف واحد":** وسوم المشاركة (`og:*`) تُملأ بالجافاسكربت؛ فيسبوك/واتساب/تويتر لا تنفّذ الجافاسكربت عند جلب المعاينة وستظهر الرموز غير مستبدلة. محركات البحث الحديثة (Google) تنفّذه. إن كانت معاينة الروابط في واتساب مهمة جداً لمتجر معيّن فاكتب وسوم `og:*` ثابتة في `index.html` لنسخته.

---

## 1. شجرة الملفات ودور كل ملف

```
/
├── index.html        الرئيسية (فيها سكربت مضمّن كبير: السلايدر، الأقسام، المنتجات المميزة/العروض/الجديد)
├── products.html     المتجر: بحث + ترتيب + تبويبات الأقسام + "تحميل المزيد"
├── product.html      تفاصيل منتج (?id=prd_xxx) — تُرسم بالكامل من products.js
├── categories.html   كل الأقسام الرئيسية مع الفرعية (سكربت مضمّن)
├── cart.html         السلة + زر "طلب عبر واتساب"
├── about.html        من نحن (سكربت مضمّن يقرأ الإعدادات)
├── contact.html      تواصل معنا (بطاقات تُبنى من الإعدادات)
├── login.html        دخول الأدمن (Firebase Auth)
├── themes.html            (للمطوّر فقط) معرض كل الثيمات + أداة بناء ثيم جديد بمعاينة حية وفحص تباين وكود جاهز للنسخ — لا يرتبط بالمتجر
├── admin.html        لوحة التحكم (7 لوحات: dashboard/products/categories/outofstock/ads/orders/settings + 4 نوافذ منبثقة: منتج/قسم/إعلان/**معاينة الاستيراد `#shelfScanModal`**) + شريط أدوات الذكاء الاصطناعي في لوحة المنتجات
├── _headers          ترويسات الكاش (Cloudflare Pages/Netlify): `/assets/*` أسبوع immutable، `/css/*` يوم، **`/js/*` بلا كاش (no-cache)**. لا يؤثر على `?v=` (يبقى مطلوباً لـ CSS)
├── firebase-database.rules.json  قواعد Firebase الجاهزة (القسم 9) — تُلصق في Realtime Database ← Rules
├── cosmetics_10000_products.json  ملف بيانات تجريبي (≈10.8MB، 10,000 منتج) لاختبار التوسّع — ليس جزءاً من الموقع ولا يُنشر
├── assets/logo/logo.png   الشعار: favicon + الهيدر + الفوتر + الدخول + الصورة الافتراضية للهيرو (المسار يُضبط من `config.logo`)
├── css/
│   ├── style.css     نظام التصميم كاملاً: متغيرات الألوان (:root) + كل المكوّنات + لوحة الأدمن + الاستجابة (الملف الوحيد الذي يحمّله login.html)
│   └── refresh.css   طبقة صغيرة تُحمَّل بعد style.css: تحسينات الجوال/التابلت فقط (سلايدرات سحب، شريط شراء ثابت، فوتر مضغوط)
├── functions/api/ai.js   وسيط الذكاء الاصطناعي (Cloudflare Pages Function): يتحقق أن الطالب أدمن (Firebase ID Token + `ADMIN_EMAILS`) ثم يكلّم Groq/Gemini بمفاتيح البيئة — القسم 24
├── tests/
│   ├── run-tests.js  اختبارات Node بلا اعتماديات (المخزون، الكاش، حماية الكتابة، safeUrl/escapeHtml، دمج الإعدادات) — للتطوير فقط
│   ├── boot-tests.js اختبارات المحرّك boot.js ومكتبة الثيمات (الثيم، القوالب، الخط، GA، الرموز، الجلب المبكر) — للتطوير فقط
│   ├── enrich-tests.js   اختبار تكاملي: `js/ai.js` مع `functions/api/ai.js` الحقيقي (جودة الاستخراج، التأسيس على مصادر، رفض التخمين، الأقسام، الشرح الإعلاني) — 24 اختباراً
│   ├── browser-enrich.js اختياري: Chrome حقيقي يحمّل `ai.js`+`admin.js` ويمرّر منتجات عبر الإثراء ← المراجعة ← الحفظ (يحتاج puppeteer-core وChrome) — 13 اختباراً
│   ├── ai-tests.js   اختبارات أدوات الذكاء الاصطناعي (`js/ai.js`: تنظيف المخرجات، التحقق من خطة التسعير، تقطيع الجداول، الاتصال بالخادم بـ fetch وهمي، التراجع عن التسعير، مطابقة الأقسام) — 35 اختباراً
│   ├── scale-tests.js اختبارات بنية التوسّع (الفهرس الخفيف، IndexedDB، المزامنة التفاضلية، الكتابة الجزئية) — القسم 23
│   └── load-test.js  نسخة مكررة من `tools/load-test.js` (محتوى متطابق عدا نهايات الأسطر) — الأصل المعتمد في `tools/`
├── tools/
│   ├── check-config.js  فحص `config.js` قبل التسليم (مفاتيح ناقصة/صيغ خاطئة/ألوان/تحذيرات أمنية)
│   ├── check-themes.js  فحص كل ثيمات `themes.js` (تباين النص والروابط والأزرار، أوزان الخطوط، المفاتيح الناقصة)
│   ├── set-version.js   رفع `?v=` في كل صفحات HTML + `assetVersion` دفعة واحدة
│   └── load-test.js     اختبار حمل: يحاكي زواراً ويقدّر استهلاك حصة Firebase (القسم 23-ح)
└── js/
    ├── config.js     **ملف الإعدادات الوحيد لكل متجر** (هوية، تواصل، خدمات، ثيم، SEO) ← الملف الوحيد الذي يُعدَّل لكل عميل
    ├── config.template.js  نسخة فارغة (`YOUR_...`) تُنسخ فوق `config.js` عند بدء متجر جديد
    ├── themes.js     **مكتبة الثيمات الجاهزة** (بيانات فقط): 15 ثيماً، وفيها مكان إضافة ثيم جديد
    ├── boot.js       محرّك التهيئة (لا يُعدَّل لكل متجر): يبني الثيم (متغيرات CSS) + الخط + favicon + preconnect + Google Analytics + رموز `{{...}}` + الجلب المبكر للرئيسية
    ├── icons.js      أيقونات SVG + iconSvg(key) + CATEGORY_ICON_KEYS
    ├── store.js      طبقة البيانات (Store) + تهيئة Firebase (SDK اختياري) + قراءة REST + الكاش + **الفهرس الخفيف ws_index** + seed
    ├── whatsapp.js   formatPrice + نافذة التوصيل + بناء رسائل واتساب + تسجيل الطلب
    ├── app.js        مشترك: escapeHtml/jsStr/getIkUrl، الهيدر، الفوتر، القائمة الجانبية، البحث العام، Toast
    ├── products.js   بطاقة المنتج، صفحة المتجر (فهرس خفيف محلي، أو Algolia إن فُعّل، + pagination)، صفحة تفاصيل المنتج
    ├── cart.js       منطق cart.html
    ├── auth.js       Firebase Auth: حارس الأدمن + صفحة الدخول
    ├── ai.js         **عميل الذكاء الاصطناعي (أدمن فقط، بلا مفاتيح):** `window.StoreAI` ← `generateDescription` `parsePriceCommand` `scanInvoice` `scanShelf`(غير موصولة) + `prepareImage` `preparePdf` + أدوات التنظيف `normalizeItems` `normalizePricePlan` (القسم 24)
    └── admin.js      كل منطق لوحة التحكم (منتجات، أقسام، إعلانات، طلبات، إعدادات، إكسل، رفع صور، مزامنة Algolia، **أدوات الذكاء الاصطناعي، نافذة المعاينة الموحّدة، مطابقة الأسماء والأقسام**)
```

### ترتيب تحميل السكربتات (مهم جداً — لا تغيّره)

الترتيب المنطقي دائماً: **(في `<head>` بعد روابط CSS مباشرة) `config → themes → boot`** ثم في آخر الصفحة `icons → firebase-app → [firebase-auth] → firebase-database → store → whatsapp → app → سكربت الصفحة`. `config.js` و`themes.js` و`boot.js` متزامنة (بلا `defer`) في **كل** الصفحات الـ9 ليُطبَّق الثيم قبل أول رسم.

| الصفحة | السكربتات بعد المشتركة | ملاحظات |
|---|---|---|
| `index.html` | سكربت مضمّن (لا يحمّل `products.js`) | كل السكربتات بـ `defer`؛ يبدأ **جلب مبكر** عبر `window.__early` من `boot.js` (يعمل فقط في الصفحة التي تحمل `<html data-early-fetch>`) قبل تحميل `store.js` (يلتقطه `takeEarly`) |
| `products.html` | `products.js` | **لا يحمّل Firebase SDK** — القراءة عبر REST (`restGet`) والطلبات تُرسل بـ REST (`postOrderRest`) |
| `product.html` | `products.js` | بلا Firebase SDK (REST) |
| `cart.html` | `cart.js` + سكربت مضمّن صغير | بلا Firebase SDK (REST) |
| `categories.html` / `about.html` / `contact.html` | سكربت مضمّن لكل صفحة | |
| `login.html` | `firebase-auth-compat` + `auth.js` | لا يحمّل `refresh.css`؛ `<html data-no-analytics>` |
| `admin.html` | (`<html data-no-analytics>`) مكتبة **SheetJS** (xlsx@0.18.5 من jsDelivr) + `firebase-auth-compat` + `auth.js` + **`ai.js`** (قبل `admin.js` دائماً) + `admin.js` + سكربت مضمّن | `firebase-auth` **يجب** أن يسبق `store.js` وإلا لن يُنشأ `firebaseAuth` |

- **الخط يُحمَّل من `boot.js`** حسب `config.theme.fontFamily` / `fontWeights` (Google Fonts، غير حاجب للرسم: `media=print onload`) أو من `theme.fontUrl`؛ لا توجد روابط خطوط في HTML. الافتراضي Tajawal (400/500/700). `--font-display` و`--font-body` يضبطهما `boot.js` أيضاً.
- نسخة Firebase المستخدمة: **10.12.2 (compat)** من `gstatic.com`.
- `?v=NN` في روابط CSS/JS هو **cache-busting يدوي** — **استعمل `node tools/set-version.js NN`** فهو يبدّله في كل الصفحات ويحدّث `assetVersion` (الذي يضيفه `boot.js` لروابط الشعار/favicon). القيمة الحالية **93 في كل الصفحات (وفي كل الملفات داخل الصفحة الواحدة)**. ⚠️ كانت الصفحات تحمل أرقاماً مختلفة (68 و71...) فيُحمَّل نفس الملف بعنوانين مختلفين ويُهدَر الكاش — **ارفع الرقم دائماً في كل صفحات HTML معاً** (أمر مقترح: استبدال `?v=93` بالرقم الجديد في كل `*.html`). عند تعديل أي JS/CSS: ارفع الرقم في كل صفحة HTML تستدعي ذلك الملف.

---

## 2. `js/config.js` — شرح كل مفتاح

**هذا هو الملف الوحيد الذي يختلف بين متجر وآخر** (انظر جدول القسم 0-ب). نسخته الفارغة: `js/config.template.js`. التعليقات داخل الملف بالعربية وتشرح مصدر كل قيمة.

```js
const STORE_CONFIG = {
  // 1) هوية المتجر
  storeName: "...", storeTagline: "...", storeDescription: "...",
  logo: "assets/logo/logo.png", assetVersion: 93, currencySymbol: "د.ع", lang: "ar",

  // 2) تواصل (قيم افتراضية؛ لوحة التحكم تتغلب عليها إن حُفظت فيها قيمة غير فارغة)
  whatsappNumber: "",             // دولي بلا + وبلا مسافات: 9647xxxxxxxxx
  phone: "", phone2: "", instagram: "", tiktok: "", address: "", mapUrl: "", workingHours: "", deliveryInfo: "",

  // 3.1) Firebase Web App (من Project settings ← Your apps) — مفاتيح عامة بطبيعتها
  firebaseApiKey: "YOUR_API_KEY", firebaseAuthDomain: "YOUR_PROJECT.firebaseapp.com",
  firebaseProjectId: "YOUR_PROJECT", firebaseStorageBucket: "YOUR_PROJECT.firebasestorage.app", // غير مستخدم فعلياً
  firebaseMessagingSenderId: "...", firebaseAppId: "1:...:web:...",
  firebaseDatabaseURL: "https://YOUR_PROJECT-default-rtdb.REGION.firebasedatabase.app/",

  // 3.2) الأدمن (فحص واجهة فقط — الحماية الحقيقية في Rules)
  adminEmails: ["admin@example.com"],

  // 3.3 / 3.4) الصور
  imgbbApiKey: "YOUR_IMGBB_KEY",                      // ظاهر للزوار — القسم 15
  imageKitEndpoint: "https://ik.imagekit.io/YOUR_ID", // بدون / في النهاية

  // 3.5) Google Analytics 4 — "" = معطّل
  googleAnalyticsId: "G-XXXXXXXXXX",

  // 3.6) Algolia (اختياري ومعطّل افتراضياً)
  useAlgolia: false, algoliaAppId: "", algoliaSearchKey: "",
  algoliaAdminKey: "",            // ⛔ اتركه فارغاً دائماً
  algoliaIndexName: "products", algoliaThreshold: 2000, // ⚠️ algoliaThreshold لم يعد مستخدماً

  // 4) الثيم
  theme: {
    preset: "navy-gold",          // أي اسم من js/themes.js (15 ثيماً) — معرض: themes.html
    colors: { primary: "", secondary: "", accent: "",
              bg: "", surface: "", headerBg: "", heroBg: "", bandBg: "", footerBg: "", sidebarBg: "",
              buttonBg: "", buttonText: "", buttonHoverBg: "", heroButtonBg: "", heroButtonText: "",
              text: "", textMuted: "", heading: "", price: "", headerText: "", heroText: "", bandText: "", footerText: "", sidebarText: "",
              border: "", success: "", warning: "", error: "" },   // "" = من القالب؛ #RRGGBB = لون مخصص
    fontFamily: "", fontWeights: "", fontUrl: "",   // "" = من الثيم
    radiusCard: "", radiusControl: "", containerWidth: "",   // "" = من الثيم
    cardImageRatio: "", cardImageFit: "",                    // "" = من الثيم
    allowPreview: false           // معاينة ?theme=... للعرض على العملاء (عطّلها في النسخة النهائية)
  },

  // 5) SEO
  siteUrl: "",                    // https://domain بلا / — فارغ = يؤخذ من المتصفح

  // 6) حقوق المطوّر في الفوتر
  credit: { show: true, name: "...", instagram: "https://instagram.com/...", instagramLabel: "@...", phone: "..." },

  // 7) حدود وإصدارات
  dataVersion: 3, maxExcelImportCount: 100   // ⚠️ maxExcelImportCount لم يعد يُقرأ في admin.js (بقية)
};
```

**حالة `config.js` في النسخة المرفقة (حقائق):** يحوي بيانات مشروع اختبار (معرّف Firebase `project-3144490496471593863`، واسم المتجر `Test10000`) كمثال عامل، **ولا يحوي أي مفتاح ذكاء اصطناعي** (مكانها متغيرات بيئة Cloudflare — القسم 24.2). `useAlgolia:false` و`algoliaAdminKey:""` (تم تفريغ المفتاح الإداري الذي كان معبّأً سابقاً — **إن سبق نشره فبدّله من لوحة Algolia**). لا تنسخ قيم `config.js` إلى أي ذكاء اصطناعي ولا إلى مستودع عام قدر الإمكان. لمتجر جديد ابدأ دائماً من `config.template.js`.

**كيف تُستخدم القيم النصية (الاسم، الواتساب…):** `Store.getSettings()` تُرجع **قيم `config.js` كقيم افتراضية** (`storeName`، `whatsappNumber→whatsapp`، `phone`، `phone2`، `instagram`، `tiktok`، `address`، `mapUrl`، `workingHours`، `deliveryInfo`، `currencySymbol`…)، وتتغلب عليها **أي قيمة غير فارغة** محفوظة في `ws_settings` (من لوحة الإعدادات). حقل فارغ في لوحة التحكم ← تعود قيمة `config.js`. `saveSettings` يكتب على المحفوظ فقط (لا يثبّت قيم `config.js` في Firebase). تغيير `config.js` يؤثر فوراً على كل الزوار ما لم يكن صاحب المتجر قد حفظ قيمة خاصة به من اللوحة. (ملاحظة: `seedIfNeeded` لا يستخدم هذه الحقول؛ يستخدم `dataVersion` فقط.)

- إن كان `firebaseDatabaseURL` فارغاً → يعمل الموقع **محلياً فقط** على `localStorage` (بلا Firebase).
- المصادقة تُفعَّل فقط إذا اكتملت: `apiKey` و`authDomain` و`projectId` و`appId`.
- **`useAlgolia`:** الافتراضي `false`. عندها لا يُستدعى Algolia إطلاقاً (لا بحث ولا مزامنة ولا نافذة مفتاح إداري). عند `true` (مع `algoliaAppId` و`algoliaSearchKey`) يصبح الاستعلام مباشراً من Algolia لكل المتجر. `algoliaThreshold` **لم يعد يحدد شيئاً**.
- **`algoliaAdminKey` (أمان، يُهم فقط مع `useAlgolia:true`):** `config.js` يُحمَّل لكل زائر، ومفتاح Algolia الإداري يتيح حذف/تعديل الفهرس كاملاً. لذلك يبقى فارغاً، ولوحة الأدمن (`requestAlgoliaAdminKey` في `admin.js`) تطلبه بنافذة `prompt` **مرة لكل جلسة** وتحفظه في `sessionStorage` فقط. الإلغاء = تخطي المزامنة. إن وُجدت قيمة قديمة في `config.js` ما زالت تُستعمل مع تحذير — **احذفها وأنشئ مفتاحاً جديداً** إن سبق نشرها (`check-config.js` يعدّه خطأ).
- مزامنة Algolia (عند `useAlgolia:true` فقط) تحدث عند **كل حفظ/حذف/استيراد** من الأدمن (للمنتجات المتأثرة فقط) وتحذف غير المتاحة من فهرس Algolia. ملؤه لأول مرة للكتالوج الموجود **يدوي** (القسم 15).

### ما يفعله `js/boot.js` (المحرّك الذي يقرأ الإعدادات)
يُحمَّل بعد `config.js` في `<head>` كل صفحة، وينفّذ بالترتيب: (1) يبني متغيرات الثيم ويحقنها في `<style id="store-theme">` بالمحدِّد `:root:root` (فيتغلب على قيم `style.css` الاحتياطية)، (2) لون شريط المتصفح `theme-color`، (3) الخط (Google Fonts أو `fontUrl`)، (4) favicon وapple-touch-icon من `logo` + `assetVersion`، (5) `preconnect` لـ Firebase وImageKit، (6) Google Analytics إن وُجد `googleAnalyticsId` ولم تحمل الصفحة `data-no-analytics`، (7) استبدال رموز `{{...}}` في `<title>` ووسوم `<meta>`، وملء `[data-cfg]` و`img[data-logo]` بعد تحميل DOM، (8) الجلب المبكر لبيانات الرئيسية (فقط مع `data-early-fetch`). يعرض أيضاً `window.StoreBoot = { presets, activePreset, vars }` للفحص من الكونسول.

---

## 3. طبقة البيانات `Store` (`js/store.js`)

### 3.1 الكائنات والحقول

**المنتج** (`ws_products`)
```js
{
  id: "prd_xxxxx",            // يُولَّد بـ uid("prd"). ممنوع أن يحتوي الرمز | (لأنه يدخل في itemKey)
  barcode: "", sku: "",       // يُحفظان بنفس القيمة معاً
  name, description, price: Number, categoryId,
  stock: Number,              // إجمالي المخزون (محسوب من inventory إذا وُجدت ألوان/مقاسات)
  available: true,            // تفعيل/إخفاء يدوي
  featured: false, isNew: false, isOffer: false,
  oldPrice: 0,                // السعر قبل الخصم (اختياري): يظهر مشطوباً بجانب السعر فقط إذا isOffer=true و oldPrice > price
  image: "url",               // الصورة الرئيسية
  images: ["url", ...],       // صور إضافية
  colors: [{ name, hex, image }],
  sizes: ["S","M","L"],       // أو أي خيار نصي: "128GB" / "50ml" ...
  inventory: { "أسود||M": 5, "أسود||L": 2 },   // مفتاح = "اللون||المقاس" والرمز "_" عند غياب أحدهما
  variants: [], variantImages: {}              // قديم (Legacy): يُعرض إن وُجد لكن لوحة الأدمن لا تنشئه
}
```
- منطق التوفر: `Store.isProductAvailable(p)` = `p.available !== false` **و** مخزون حقيقي > 0. إن وُجدت ألوان/مقاسات **وكان `inventory` موجوداً** يُحسب من مجموع `inventory` (ولا يُعتدّ بـ `stock` القديم)، وإلا من `stock`.
- إذا وُجدت ألوان أو مقاسات → المخزون يُقرأ من `inventory` (`hasVariantMatrix`)، وإلا من `stock`. `stock` لهذه المنتجات = مجموع الشبكة (تحسبه لوحة الأدمن عند الحفظ).
- **الفهرس الخفيف `ws_index`** (انظر **القسم 19**): عقدة Firebase `{ v, items }` تحوي سجلاً صغيراً لكل منتج. يبنيه الأدمن تلقائياً ويحدّثه مع كل حفظ للمنتجات، ويحمّله الزائر مرة ويخزنه في `ws_index_items`. `stock` في السجل = **المخزون الحقيقي الكلي** (`totalStockOf`) لأنه لا يحمل `inventory`.

**القسم** (`ws_categories`): `{ id:"cat_xxx", name, icon:"box", image:null|url, parentId:""|catId }` — مستويان فقط (رئيسي/فرعي).

**الإعلان** (`ws_ads`): `{ id:"ad_xxx", image, link, order }` — يظهر في سلايدر الهيرو بالرئيسية.

**الإعدادات** (`ws_settings`): `storeName, storeTagline, storeDescription, whatsapp, instagram, tiktok, phone, phone2, address, mapUrl, workingHours, deliveryInfo, currencySymbol` (phone2 هاتف ثانٍ اختياري؛ mapUrl رابط خرائط جوجل اختياري يجعل العنوان قابلاً للضغط في الفوتر وصفحة تواصل معنا ويقبل http/https فقط)

**الطلب** (`ws_orders`)
```js
{ id:"ord_xxx", date:"ISO", type:"single"|"cart",
  customer:{ gov, area, landmark, phone, notes },
  items:[{ productId, name, qty, price, color, size, variant }],
  total, status:"pending"|"prepared"|"cancelled", stockDeducted:true|false }
```

**عنصر السلة** (`ws_cart` محلي فقط): `{ itemKey, productId, qty, color, size, variant }` حيث `itemKey = productId|c:اللون|s:المقاس|v:الخيار`.

### 3.2 شجرة Firebase Realtime Database

```
/ws_categories   [ {...}, {...} ]          ← مصفوفة (تُكتب كاملة بـ set)
/ws_products     { "<id>": {...}, "<id>": {...} } ← **كائن مفتاحه معرّف المنتج** (كل منتج عقدة مستقلة؛ القسم 23). المتاجر القديمة (مصفوفة) تُرحَّل تلقائياً عند أول حفظ
/ws_settings     { storeName: ..., ... }
/ws_ads          [ {...} ]
/ws_orders       { "-Nabc...": {order}, ... } ← تُضاف بـ push() (SDK) أو POST عبر REST (صفحات المتجر بلا SDK) — مفتاح Firebase منفصل عن order.id
/ws_index        { v: عدّاد يرتفع ذرّياً مع كل كتابة, e: حقبة (تتغير عند إعادة البناء الكامل), items: { "<id>": سجل مصغّر + u } } ← يكتبه الأدمن فقط مع ws_products (تحديث ذرّي متعدد المسارات)
/ws_meta_v       رقم (Date.now()) ← "إصدار" الأقسام/الإعدادات/الإعلانات. يرفعه الأدمن بعد كل تعديل فيها (bumpMetaVersion). الزائر يقرؤه فقط (≈13 بايت) ليعرف هل يُنزِّل الأقسام أم لا
```
`firebaseValueToArray()` تحوّل أي شكل (مصفوفة أو كائن) إلى مصفوفة — لأن Firebase يحوّل المصفوفات المتفرقة إلى كائنات.

### 3.3 مفاتيح localStorage (كاش)

| المفتاح | الاستخدام |
|---|---|
| `ws_categories`, `ws_products`, `ws_settings`, `ws_ads` | نسخة محلية من البيانات |
| `ws_cart` | السلة (محلي فقط، لا يذهب لـ Firebase) |
| `ws_orders` | نسخة محلية من الطلبات (للأدمن) |
| `ws_seeded_v1`, `ws_data_version` | علامات التهيئة وإصدار البيانات |
| `last_meta_pull_time` | وقت آخر فحص لـ `ws_meta_v` (كول داون **5 دقائق** = `META_PULL_MS = 300*1000` في `store.js`) |
| `ws_meta_v` | رقم نسخة الأقسام/الإعدادات/الإعلانات المحلي؛ إن طابق الخادم لا يُنزَّل شيء (يُمسح عند رفع `dataVersion`) |
| `ws_admin_update_seen` | علامة إشعار «تم تحديث الموقع» في الأدمن (انظر القسم 7؛ النافذة غير موجودة في `admin.html` الحالي) |
| `ws_products_all_time` | وقت آخر **تحميل كامل** لكل المنتجات (يُكتب عند `loadAllProductsFromFirebase`: في الأدمن دائماً، وفي المتجر فقط حين يغيب `ws_index`) |
| `ws_index_v`, `ws_index_u`, `ws_index_e`, `ws_index_checked` | أرقام الفهرس الخفيف في localStorage للفحص المتزامن: النسخة، آخر `u` وصلنا إليه، الحقبة، وآخر وقت فحص. **عناصر الفهرس نفسها في IndexedDB** (قاعدة `ws_store` ← `kv`: `items` + `meta`). `ws_index_items` لم يعد يُستعمل إلا كاحتياط عند تعذّر IndexedDB (يُمسح كل ذلك عند رفع `dataVersion`) |
| `ws_products_count_meta`, `ws_products_count_time` | عدد منتجات المتجر (من تحميل كامل أو `?shallow=true`). ⚠️ **لم يعد يُستخدم لقرار الـ Algolia** (دوال `getProductsCount/isProductsCountStale/fetchRemoteProductsCount` باقية بلا استدعاء من الصفحات). `ws_mini_index` ما زال يُنشأ فارغاً في `seedIfNeeded` ويُمسح — بقية من النظام القديم |
| `ws_products_filter_*`, `ws_products_category_*` (+ `_time`) | نسخ عرض فوري لأقسام الرئيسية (مميز/عروض/جديد). تُعاد تعبئتها من الفهرس المحلي عند كل تحديث؛ تُمسح مع `pruneStaleCaches` عند تنزيل فهرس جديد (خارج جلسة الأدمن) |
| `ws_pending_orders` | طلبات فشل إرسالها عبر REST تُعاد محاولتها (`flushPendingOrders`) |
| `sessionStorage.ws_admin_session` | علامة جلسة الأدمن |

### 3.4 دوال `Store` الأساسية

- أقسام: `getCategories, saveCategories, addCategory, updateCategory, deleteCategory, getCategoryName`
- منتجات: `getProducts, getProduct, saveProducts, addProduct, updateProduct, deleteProduct` — الثلاثة `save/update/delete` **تُعيد Promise<boolean>** (نجاح الكتابة في Firebase). `addProduct` تعيد المنتج؛ استعمل `Store.whenProductsSaved()` لمعرفة نتيجة آخر كتابة.
- **حماية الكتابة:** `Store.canWriteProducts()` تعيد `false` إذا كان Firebase مفعّلاً ولم يكتمل تحميل **كل** المنتجات في هذه الصفحة (`loadAllProductsFromFirebase` الناجح)؛ عندها `saveProducts` ترفض الكتابة (تعيد `false` ولا تلمس الكاش). السبب: الكتابة تستبدل `ws_products` كاملة، والكاش قد يكون جزئياً.
- `_removeFromLocalCache(id)`: تزيل منتجاً من الكاش المحلي **فقط** (تُستعمل حين يتبيّن أن المنتج حُذف من الخادم).
- تحميل من Firebase (REST عند غياب SDK): `loadProductsPage(size,cursor)`، `loadProductsPageByCategory(catId,size,cursor)`، `loadProductsPageByCategories(ids,...)`، `loadProductsPageByField(field,value,size,cursor)` (مميز/عروض/جديد)، `loadProductById(id, forceRefresh)`، `loadAllProductsFromFirebase(forceRefresh)` (كل المنتجات؛ **محلي فقط — لا يكتب إلى Firebase**)، `ensureAllProductsFresh()` (يعيد تحميل كل المنتجات دائماً بلا فحص زمني؛ يُستعمل كاحتياط فقط حين يغيب `ws_index` على الخادم).
- الفهرس الخفيف: `getIndexItems()` (السجلات الجاهزة للبحث `_k` والفرز `_n`)، `ensureIndexFresh(force)`، `hasIndexLocal()`، `rebuildIndex(force)` (للأدمن). `getMiniIndex()` اسم قديم يعيد `getIndexItems()`. عدّاد: `getProductsCount()`, `isProductsCountStale()`, `fetchRemoteProductsCount()` (غير مستخدمة حالياً).
- مخزون: `hasVariantMatrix, getTotalStock, getVariantStock(p,color,size), isProductAvailable`
- إعدادات/إعلانات: `getSettings, saveSettings(patch), getAds, saveAds, addAd, deleteAd`
- سلة: `getCart, addToCart(itemKey,qty,meta), setQty, removeFromCart, clearCart, cartCount` (تطلق حدث `cart:updated`)
- طلبات: `getOrders, loadOrdersFromFirebase, logOrder(order)`
- أدمن: `login(email,pass), logout(), isLoggedIn()`

**كل `save*` يكتب `localStorage` ثم يزامن العقدة كاملة إلى Firebase بـ `set()`** (`syncNodeToFirebase` — تعيد Promise<boolean> ولا ترفع استثناء). كتابة المنتجات خاضعة لـ `canWriteProducts()` أعلاه.

---

## 4. تدفق التحميل والكاش (لتشخيص "لماذا لا تظهر تعديلاتي؟")

**الثوابت (أعلى `store.js`):** `META_PULL_MS = 20s` (فحص الأقسام/الإعدادات/الإعلانات) · `INDEX_CHECK_MS = 20s` (فحص الفهرس) · `QUERY_CACHE_MS = 15s` (ذاكرة مؤقتة داخل الصفحة للاستعلامات) · `FETCH_TIMEOUT_MS = 15s` · `PRODUCT_CACHE_LIMIT = 5000` (سقف المنتجات في الكاش المحلي). `META_CACHE_MS = 60s` و`REFRESH_MS` **بقايا لا تؤثر** (الأول تستعمله دوال العدّاد غير المستخدمة، والثاني غير مستعمل).

1. **تحميل الصفحة:** `store.js` يهيّئ Firebase SDK **إن وُجد** (صفحتا `admin.html` و`login.html` فقط؛ باقي الصفحات بلا SDK وتقرأ عبر REST `restGet`). ثم `seedIfNeeded()` ثم `pullFromFirebase()`.
2. **الجلب المبكر (`window.__early`) — صار في `js/boot.js` (يعمل فقط في الصفحة التي تحمل `<html data-early-fetch>`، أي `index.html`)، ويسبق تحميل `store.js`:**
   - أول زيارة (لا `ws_categories` محلياً): يجلب `ws_categories` و`ws_settings` و`ws_ads`.
   - زائر عائد: يجلب `ws_meta_v` فقط (إن مرّت أكثر من 5 دقائق على آخر فحص) و`ws_index/v` فقط (إن لم يوجد فهرس محلي أو مرّت 5 دقائق).
   - بلا فهرس محلي: يجلب 5 منتجات لكل من `featured` و`isOffer` و`isNew` (استعلام `orderBy/equalTo`). يلتقطها `takeEarly` في `store.js` بدل طلب جديد.
3. **`seedIfNeeded()`:** إن اختلف `ws_data_version` عن `STORE_CONFIG.dataVersion` → **يمسح** كاش المنتجات والأقسام والإعلانات والفهرس المحلي (`ws_index_*`) و`ws_meta_v` و`last_meta_pull_time` وكاشات الاستعلامات (لا يمسح الإعدادات ولا السلة ولا الطلبات). ثم يزرع قيماً أولية في أول زيارة.
4. **`pullFromFirebase(force)` (الأقسام/الإعدادات/الإعلانات):**
   - بلا `force` ومرّ أقل من 5 دقائق على آخر فحص ← لا شيء.
   - وإلا `GET ws_meta_v` (بضعة بايتات). إن وُجدت أقسام محلية و**طابق** الرقمُ المحليَّ ← يحدّث وقت الفحص فقط.
   - وإلا (اختلف الرقم، أو **الرقم غير موجود/غير مقروء على الخادم**) ← ينزّل `ws_categories + ws_settings + ws_ads` ويخزّنها ويحفظ الرقم الجديد، ويطلق **`store:synced`** إن تغيّر المحتوى. الأدمن (جلسة فعّالة) يسحب الطلبات أيضاً.
   - ⚠️ **إن لم تكن `ws_meta_v` موجودة في Firebase (أو قاعدة قراءتها ناقصة) فكل زائر سينزّل الأقسام والإعدادات والإعلانات كاملة عند كل فحص** — استهلاك مرتفع جداً. الحل: القسم 9 (قاعدة `ws_meta_v`) ثم احفظ أي قسم/إعلان/إعدادات من الأدمن مرة لينشئ الرقم.
5. **أقسام الرئيسية (`loadHomeSection` لكل عنصر في `HOME_SECTIONS`: مميز/عروض/جديد):** يعرض كاش `ws_products_filter_*` فوراً؛ إن وُجد **فهرس محلي** يملأ القسم منه (`getSectionFromIndex`) **بلا أي استعلام**؛ وإلا يستعلم `loadProductsPageByField(field,true,4)`؛ وعند الخطأ يرجع للفهرس. بعد `ensureIndexFresh()` تُعاد التعبئة (`syncSectionsFromFreshIndex`)، وعند `store:synced` تُعاد (`onStoreSynced`).
6. **المتجر والبحث العام (الفهرس الخفيف `ws_index`):** `queryProductsUnified` ← افتراضياً `queryFallbackStore`: `Store.ensureIndexFresh()` ثم `buildShopList` من `getIndexItems()` محلياً (بحث بالاسم والباركود مع توحيد الحروف، فلتر قسم **يشمل فرعياته**، تبويبات مميز/عروض/جديد، ترتيب سعر/اسم، تقطيع 24). **غير المتاح يُخفى.**
   - `ensureIndexFresh`: فهرس محلي وفُحص خلال آخر 5 دقائق ← **صفر طلبات**. وإلا `GET ws_index/v`؛ نفس النسخة ← تحديث وقت الفحص؛ اختلاف/غياب محلي ← تنزيل `ws_index/items` كاملاً + `pruneStaleCaches` + `store:synced`.
   - **احتياط:** `ws_index` غير موجود على الخادم ← تنزيل كل المنتجات وبناء فهرس مؤقت في الذاكرة (ثقيل).
   - `useAlgolia:true` ← `queryAlgoliaDirect` (غير مفعّل في النسخة الحالية).
7. **المراقبة الخلفية (آخر `store.js`):** `recheck()` يشغّل `ensureIndexFresh()` و`pullFromFirebase()` **كل 5 دقائق (`Math.min(INDEX_CHECK_MS, META_PULL_MS)`) والتبويب ظاهر**، وعند العودة للتبويب (`visibilitychange`) وعند `pageshow` (من bfcache) وعند عودة الاتصال (`online`). كل مرة لا يتغيّر فيها شيء = طلبان صغيران فقط.
8. **صفحة المنتج:** تعرض النسخة المحلية فوراً ثم تتحقق من الخادم (`loadProductById(id,true)`) وتعيد الرسم إن تغيّر السعر/المخزون/الصور/الخيارات؛ وتعرض "غير موجود" إن حُذف.
9. **السلة:** `cart.js` يجلب نسخة حديثة لكل سطر (`loadProductById(id,true)`) قبل العرض.
10. **لوحة الأدمن:** `pullFromFirebase(true)` + `loadAllProductsFromFirebase(true)` (**كل** المنتجات) + `loadOrdersFromFirebase(300)` عند الفتح، ثم `Store.rebuildIndex(false)` (يبني `ws_index` مرة واحدة إن لم يوجد). إن فشل تحميل المنتجات يُمنع حفظ/حذف المنتجات (`canWriteProducts`). مراقبة الـ 5 دقائق تعمل في الأدمن أيضاً لكن `pruneStaleCaches` لا يمسح شيئاً أثناء جلسة الأدمن.

**نتائج عملية:**
- تعديل **قسم/إعدادات/إعلان** ← يرفع الأدمن `ws_meta_v` فيظهر لدى الزوار الذين تبويبهم مفتوح خلال ≤5 دقائق، ولدى من يفتح الموقع لاحقاً فوراً عند التحميل.
- تعديل **منتج** (سعر/مخزون/إضافة/حذف) ← يتغيّر `ws_index/v` مع الحفظ، فيظهر في المتجر والرئيسية خلال ≤5 دقائق، وفي صفحة المنتج عند فتحها، وفي السلة فوراً.
- **كلفة Firebase للزائر العائد:** طلبان صغيران كل 5 دقائق طالما التبويب مفتوح وظاهر (≈0.4 طلب/دقيقة)، ولا تنزيل لقوائم كاملة إلا عند تغيّر الرقم. التبويب المخفي/المغلق = صفر. إن أردت تقليل الطلبات ارفع الفواصل (القسم 12 «تغيير مدة الكاش»).
- بعد **حذف شامل أو تغيير هيكلة** للبيانات: ارفع `dataVersion` (3, 4, ...) ثم افتح الأدمن (لإعادة بناء الفهرس إن لزم).
- ملاحظة: عناوين بعض الاختبارات في `tests/run-tests.js` قد تذكر «30 دقيقة» لكن الاختبارات تنجح (21/21 عند آخر تشغيل) على السلوك الحالي.

---

## 5. الصفحات: ما الذي يرسم ماذا

كل صفحة فيها `<div id="site-header" data-active="KEY">` و`<div id="site-footer">`؛ يرسمهما `app.js`. قيم `data-active`: `home | products | categories | about | contact`.

### app.js (المشترك)
- `escapeHtml(str)` / `jsStr(v)` ← **إلزامي** لأي نص ديناميكي داخل `innerHTML` أو `onclick`.
- `window.getIkUrl(url,width,quality)` ← يعيد كتابة رابط ImageKit ليضيف `tr:w-X,q-Y,f-webp`. لا يمس أي رابط لا يحتوي `ik.imagekit.io`.
- `NAV_LINKS` ← مصفوفة روابط القائمة (الهيدر + القائمة الجانبية). أضف رابطاً جديداً هنا.
- `renderHeader()` (+ بحث عام Overlay) / `renderFooter()` / `renderSidebarNav()` (فيها الأقسام الرئيسية والفرعية) / `showToast(msg,'success'|'error')` / `updateCartBadge()` / `initBackToTop()`.
- **البحث العام** (الأيقونة في الهيدر): يستدعي `Store.ensureIndexFresh()` ثم يبحث في **الفهرس الخفيف كله** (`getIndexItems()`، بالاسم/الباركود، كل كلمة يجب أن تظهر، مع توحيد الحروف العربية)، ويعرض أول 8 نتائج متاحة. **لا يبحث في الوصف** (غير موجود في الفهرس). `safeUrl(url)`: يزيل الأحرف الخفية ثم يسمح فقط بـ `http(s)/tel/mailto`/المسارات النسبية — **إلزامي** لأي رابط يأتي من الإعدادات/الإعلانات.
- `safeUrl(url)`: يزيل الأحرف الخفية ثم يسمح فقط بـ `http(s)/tel/mailto`/المسارات النسبية — **إلزامي** لأي رابط يأتي من الإعدادات/الإعلانات.
- سطر حقوق المبرمج يُبنى في `buildCreditHtml()` من `STORE_CONFIG.credit` (`show:false` يخفيه) — لا يُكتب ثابتاً في الكود.

### index.html (الرئيسية)
- لا يحمّل `products.js`؛ يعيد تعريف `productMediaHtml/productHasOptions/renderHomeProductCard/quickAddToCart/renderGridInto` **داخل السكربت المضمّن** (⚠️ تكرار — أي تعديل على شكل بطاقة المنتج يجب أن يُطبَّق في `products.js` **و** `index.html`).
- `initHome()` تستدعي: `renderHomeSocial()` (روابط التواصل)، `renderHomeCategories()` (الأقسام الرئيسية في `#homeCategories`)، `renderAdsSlider()`، ثم `loadHomeSection(sec)` لكل عنصر في `HOME_SECTIONS` (المميزة `#featuredGrid` والعروض `#offerGrid` والجديد `#newGrid`، 4 منتجات لكل قسم؛ المصدر الأول الفهرس المحلي ثم `loadProductsPageByField`). أيقونات المزايا `__ICON_*__` تُستبدل نصياً. تفاصيل التدفق في القسم 4 (البند 5).
- `renderAdsSlider()`: يدمج إعلانات الأدمن مع `CODE_ADS` (متغير اختياري غير معرّف حالياً — خطاف لإعلانات ثابتة في الكود) ويرتبها بـ `order` ويرسمها في `#heroPromoContainer` (تبديل تلقائي كل 4 ثوانٍ (يتوقف مع إخفاء التبويب أو `prefers-reduced-motion`) + سحب باللمس). إن لم توجد إعلانات يظهر الشعار.
- نصوص الهيرو والمزايا مكتوبة ثابتة في HTML (عدّلها لكل عميل).

### products.html + `products.js` (المتجر)
- عناصر: `#searchInput #sortSelect #filterCategories #shopGrid #resultCount`، وزر "تحميل المزيد" يُنشأ برمجياً.
- `shopState` = `{search, categoryId, sort, filterMode, pagination}`؛ `SHOP_PAGE_SIZE = 24`.
- الرابط يقبل: `?cat=<categoryId>` / `?q=...` / `?filter=featured|offer|new`.
- `fetchNextShopBatch(token)` ← `queryProductsUnified(page)` (الفهرس الخفيف افتراضياً، أو Algolia إن فُعّل؛ انظر القسم 4). `token` يلغي الطلبات القديمة عند تغيير الفلتر.
- **الوضع الافتراضي (الفهرس الخفيف):** البحث/الفلاتر (مميز/عرض/جديد/قسم مع فرعياته)/الترتيب (`price-asc`/`price-desc`/`name`) تعمل على **كل المنتجات**. نتيجة القائمة تُخزَّن مؤقتاً (`_listMemo`) حسب المرشحات. بحث بلا ترتيب محدد: من يبدأ اسمه بالكلمة أولاً. **وضع Algolia:** الترتيب بالاسم غير مدعوم (يُتجاهل).
- `renderProductCard(p)`: الشارات (عرض > جديد > مميز، + غير متوفر)، نقاط الألوان (أول 4)، وزر بعرض البطاقة كاملة بأيقونة + نص `<span class="btn-label">`: «أضف للسلة» / «اختر الخيارات» (إن كان للمنتج ألوان/مقاسات، ويحوّل لصفحة المنتج) / «غير متوفر» (معطّل). نفس الماركاب في `renderHomeProductCard` بـ `index.html`.

### product.html + `initProductDetailPage()`
- يقرأ `?id=` (`initProductDetailPage` تقرر وتتحقق من الخادم، `renderProductDetail` ترسم)، يبني المعرض (الرئيسية + الإضافية + مصغرات)، الألوان (swatches تغيّر الصورة والمخزون)، المقاسات، (القائمة المنسدلة للـ legacy variants)، الكمية (تُقيَّد بمخزون التركيبة المختارة **حتى لو كُتبت يدوياً**: `readSelectedQty`)، أزرار "أضف للسلة" و"طلب عبر واتساب".
- `refreshAvailabilityUI()` يعيد حساب التوفر عند تغيير اللون/المقاس.

### cart.html + `cart.js`
- `renderCartPage()` تقرأ السلة وتطابقها مع `Store.getProducts()` (بعد `loadProductById` لكل سطر). المنتج غير المتاح يظهر بتحذير ويُستبعد من الطلب. الكمية تُقيَّد بالمخزون.
- زر `#checkoutBtn` ← `orderCartViaWhatsApp()`.

### categories.html
- يبني بطاقات الأقسام الرئيسية + شرائح الفرعية. عدّاد "N منتج متوفر" يُحسب من المنتجات **المحمّلة محلياً** فقط (قد لا يكون دقيقاً للزائر الجديد).

### about.html / contact.html
- تقرآن `Store.getSettings()`؛ contact يبني بطاقات (واتساب/إنستغرام/تيك توك/هاتف/عنوان) تظهر فقط إن كانت القيمة موجودة.

### login.html + `auth.js`
- `initAdminAuthGuard()` (في كل صفحة تحمّل auth.js): يسمح فقط لإيميل ضمن `adminEmails`، وإلا يطرد إلى `login.html` عند وجود `#adminApp`.
- `Store.login()`: `signInWithEmailAndPassword` ثم يتحقق من `adminEmails` ويحفظ `ws_admin_session`.

---

## 5-ب. نظام التصميم (CSS) — الثيم يُدار من `config.js`

### المبدأ
- **`css/style.css`** هو نظام التصميم الكامل (متغيرات + مكوّنات + أدمن + استجابة). **`css/refresh.css`** طبقة صغيرة فوقه للجوال فقط. لا توجد أي كتلة `<style>` داخل صفحات HTML؛ تعديل **المكوّنات** يتم في هذين الملفين، أما **الألوان والخط والشكل** فتُدار من `config.js` فقط.
- **لا تُعدَّل الألوان داخل `style.css`.** كتلة `:root` في أعلاه صارت **قيماً احتياطية محايدة** (تُستعمل فقط لو تعطّل JavaScript أو لم يُحمَّل `config.js`)؛ `boot.js` يتجاوز كل متغيراتها في **كل** الصفحات (المتجر + الأدمن + الدخول) بالمحدِّد `:root:root`.
- لا ألوان ثابتة داخل القواعد: كل لون يأتي من متغير. الاستثناءات المقصودة: لون النص الأبيض فوق شارات `--error` و`--secondary` و`--success`، وبقع بيضاء فوق الصور (`.promo-dot`, `.badge-variants`)، وألوان بيانات المنتج نفسها (لون المنتج `hex`).

### تغيير هوية عميل = `config.theme` فقط
1. اختر `theme.preset` من **مكتبة `js/themes.js`** (15 ثيماً: `navy-gold` · `tech-clean` · `electronics-market` · `marketplace-yellow` · `fashion-mono` · `clothing-burgundy` · `sport-bold` · `cosmetics-rose` · `beauty-glam` · `luxury-gold` · `grocery-fresh` · `pharmacy-teal` · `home-blue-yellow` · `kids-playful` · `pet-olive`). الثيم الواحد يشمل: الألوان الثمانية الأساسية + ألواناً اختيارية (هيدر/هيرو/فوتر/أزرار…) + الخط وأوزانه + استدارة البطاقات والأزرار + نسبة صورة المنتج. افتح `themes.html` لمعاينة الجميع.
2. (اختياري) اكتب ألواناً مخصصة في `theme.colors` — **كل مفتاح اختياري**، وأي لون غير فارغ يتغلب على القالب، وأي مفتاح فارغ يتبع الألوان الأساسية. النص فوق أي خلفية تخصصها يُحسب تلقائياً (أبيض أو داكن حسب سطوعها) ما لم تحدده بنفسك. التخصيص مقسّم إلى طبقات مستقلة:

**أ) الألوان الأساسية** (تؤثر على كل شيء ما لم تُخصَّص بالأسفل)

| المفتاح | المتغير | الاستخدام |
|---|---|---|
| `primary` | `--primary` | الأصل الداكن: الأزرار، العناوين، الفوتر، الهيرو، الشريط الجانبي (ما لم تخصصها) |
| `secondary` | `--secondary` | الروابط، التحويم، حلقة التركيز، العناصر المحددة، شارة "جديد" |
| `accent` | `--accent` | شارة "مميز"، عدّاد السلة، خط الفوتر، تمييز عنصر الأدمن النشط |

**ب) الخلفيات** (كل منطقة مستقلة)

| المفتاح | المتغير | المنطقة |
|---|---|---|
| `bg` / `surface` | `--bg` / `--surface` | خلفية الصفحة / البطاقات والحقول والنوافذ |
| `headerBg` | `--header-bg` | الهيدر العلوي (فارغ = `surface`) |
| `heroBg` | `--hero-bg` | الإعلان في أعلى الرئيسية (الاسم القديم `hero` ما زال يعمل) |
| `bandBg` | `--band-bg` | شريط التواصل الملوّن في الرئيسية |
| `footerBg` | `--footer-bg` | الفوتر |
| `sidebarBg` | `--sidebar-bg` | الشريط الجانبي للوحة التحكم |

**ج) الأزرار**

| المفتاح | المتغير | الاستخدام |
|---|---|---|
| `buttonBg` | `--btn-bg` | الأزرار الرئيسية (`.btn-primary`)، التبويبات والمقاسات المحددة، زر العودة للأعلى، التوست |
| `buttonText` | `--btn-text` | نص هذه الأزرار (فارغ = تلقائي حسب سطوع `buttonBg`) |
| `buttonHoverBg` | `--btn-hover-bg` | عند تمرير الماوس (فارغ = أغمق من `buttonBg`، أو `secondary` إن لم تخصص `buttonBg`) |
| `heroButtonBg` / `heroButtonText` | `--hero-btn-bg` / `--hero-btn-text` | زر "تسوق الآن" داخل الإعلان (الافتراضي `accent`) |

**د) النصوص**

| المفتاح | المتغير | الاستخدام |
|---|---|---|
| `text` / `textMuted` | `--text` / `--text-2` | النص الأساسي / الثانوي |
| `heading` | `--heading-color` | العناوين h1–h4، اسم المتجر، أسماء الأقسام، الأيقونات، الأزرار المحدَّدة بإطار (فارغ = `primary`) |
| `price` | `--price-color` | الأسعار وإجمالي السلة (فارغ = `primary`) |
| `headerText` | داخل `.site-header` | نص وأيقونات الهيدر؛ إن كانت `headerBg` داكنة يصبح أبيض تلقائياً |
| `heroText` / `bandText` / `footerText` / `sidebarText` | `--on-primary*` داخل كل منطقة | نص كل منطقة (فارغ = تلقائي حسب خلفيتها) |

**هـ) الحدود والحالات:** `border` ← `--border`، و`success` `warning` `error` ← ألوان الحالات (تُشتق خلفياتها وحدودها).

> **مثال:** هيرو بني دافئ وأزرار برتقالية وأسعار حمراء مع بقاء بقية المتجر على القالب:
> `heroBg: "#6B4423", buttonBg: "#C2410C", price: "#B91C1C"`

**يشتقّ `boot.js` تلقائياً (بلا تدخل):** `--primary-hover`, `--secondary-hover`, `--secondary-50/100`, `--accent-soft`, `--accent-ink` (نسخة داكنة للنصوص)، `--accent-hover`, `--surface-2`, `--border-soft`, `--border-strong`, `--on-primary` (+ `-soft/-muted/-dim/-rgb`: نص وطبقات شفافة فوق الأساسي)، `--primary-rgb/--secondary-rgb/--accent-rgb/--text-rgb` (للظلال وتدرجات الهيرو وحلقة التركيز)، درجات `--ink-*`، وألوان `--info*`.

3. **الخط:** من الثيم (`fontFamily` + `fontWeights`) ← `--font-display` و`--font-body`؛ وما تكتبه في `config.theme.fontFamily` يتغلب عليه (مع أوزان افتراضية آمنة `400;500;700`، أو `fontWeights` الذي تحدده، أو `fontUrl` لخط مستضاف).
4. **الشكل:** `radiusCard` ← `--r-card`، `radiusControl` ← `--r-ctl`، `containerWidth` ← `--container`.
5. **بطاقة المنتج:** `cardImageRatio` ← `--card-image-ratio` (`1/1`؛ `4/5` أو `3/4` للأزياء؛ `4/3` للأثاث)، `cardImageFit` ← `--card-image-fit` (`cover` أو `contain` لصور المنتج ذات الخلفية البيضاء). القيمة من الثيم ما لم تكتب غيرها في `config.js`.

### مكتبة الثيمات `js/themes.js` — الأسلوب وطريقة إضافة ثيم جديد

**كل ثيم** هو كائن في `STORE_THEMES`:
```js
"my-theme": {
  label: "الاسم بالعربية", category: "نوع المتجر", inspiredBy: "ملاحظة",          // للعرض فقط
  colors: { primary:"#..", secondary:"#..", accent:"#..", bg:"#..", surface:"#FFFFFF", text:"#..", textMuted:"#..", border:"#..",
            /* اختيارية: headerBg heroBg footerBg buttonBg buttonText buttonHoverBg heroButtonBg heroButtonText ... */ },
  fontFamily: "Tajawal", fontWeights: "400;500;700",   // ⚠️ الأوزان يجب أن يدعمها الخط
  radiusCard: 14, radiusControl: 10, cardImageRatio: "1/1", cardImageFit: "cover"
}
```
**الطريقة الأسهل (موصى بها):** افتح `themes.html` ← قسم "بناء ثيم جديد": اختر الألوان والخط (أو ابدأ من ثيم موجود بزر "افتح في البناء")، شاهد المتجر المصغّر فوراً مع **فحص التباين الحي**، ثم اضغط "نسخ الكود" والصقه في `js/themes.js` (قبل `};` الأخيرة، وضع فاصلة بعد الثيم الذي قبله).
**ثم:** `node tools/check-themes.js اسم-الثيم` (✗ = عيب يجب إصلاحه)، وعدّل `theme.preset` في `config.js`، وأضف الاسم لتعليق القائمة في `config.js` و`config.template.js`.

**قواعد جودة الثيم (يفحصها `check-themes.js` آلياً):**
- النص الأساسي على الخلفية ≥ 7، والنص الثانوي على البطاقة ≥ 4.5.
- `secondary` على البطاقة ≥ 4.5 (يُستعمل لنص الروابط وشارة "جديد").
- `primary` على البطاقة ≥ 4.5 (يُستعمل للعناوين والأسعار) وأن يكون **داكناً** إن لم تخصص `heroBg`/`footerBg`.
- نص الأزرار على خلفيتها، ونص الهيرو وزر الهيرو والفوتر ≥ 4.5. إن كان `accent` فاتحاً فاكتب `heroButtonText` داكناً (كما في `cosmetics-rose`).
- الخط عربي من Google Fonts وأوزانه مدعومة (القائمة المفحوصة داخل `check-themes.js`؛ أضف خطاً جديداً إليها بعد التأكد منه).
- اسم الثيم: حروف إنجليزية صغيرة وأرقام وشرطات.

**ملاحظة:** الألوان مستوحاة من **الانطباع العام** لأساليب متاجر معروفة (إلكترونيات، أزياء، رياضة، تجميل، بقالة، أثاث، أطفال…) وليست نسخاً دقيقة لهوية أي علامة؛ استعملها كنقطة بداية ثم خصّصها بألوان شعار العميل.

**الظلال والحدود الشفافة:** في CSS تُكتب `rgba(var(--text-rgb), .12)` و`rgba(var(--secondary-rgb), .22)` و`rgba(var(--on-primary-rgb), .1)` (فوق الأسطح بلون `primary`) — **لا** `rgba(15,23,42,…)` ولا `rgba(255,255,255,…)` إلا فوق الصور.

**حالات النظام:** `--success|warning|error|info` + `-bg` + `-line` + `-ink` لكل حالة (شارات الأدمن، التنبيهات، التوست).

**المتغيرات الثابتة في CSS (لا يغيّرها `config`):** `--radius-sm/md/lg/xl/pill`، `--shadow-soft/card/lift`، `--ring`، `--overlay` (تعتمد على متغيرات الألوان فتتبع الثيم تلقائياً).

### أسماء المتغيرات القديمة (Aliases) — لا تحذفها
ملفات HTML/JS ما زالت تستعمل أنماطاً مضمّنة مثل `style="color:var(--olive-700)"`. لذلك بقيت الأسماء القديمة كاختصارات للمتغيرات الجديدة:
`--teal→secondary`, `--teal-deep→primary`, `--teal-light→secondary-50`, `--teal-wash→surface-2`, `--navy→primary`, `--olive-900/800/700→primary`, `--olive-600/500→secondary`, `--olive-400→درجة رمادية يشتقها boot.js`, `--olive-100→secondary-50`, `--olive-50→surface-2`, `--sand-500→accent-ink`, `--sand-100→accent-soft`, `--cream→bg`, `--white→surface`, `--ink-900…300` (درجات الرمادي/النص), `--line/--line-strong/--line-soft→border…`, `--danger→error`.
**في أي كود جديد استخدم الأسماء الجديدة (`--primary` إلخ).** (الأسماء القديمة `--olive-*`/`--teal-*`/`--sand-*` تتبع الثيم الجديد تلقائياً لأنها اختصارات للمتغيرات التي يضبطها `boot.js`.)

### فهرس المكوّنات (الأصناف المهمة في `style.css`)
| المنطقة | الأصناف |
|---|---|
| الهيدر | `.site-header .header-inner .brand .main-nav (a.active) .header-actions .btn-icon .cart-count(.has-items)` — القائمة الجانبية: `.sidebar-nav(.active) .sidebar-overlay` (تنزلق من اليسار الفيزيائي بجانب زر القائمة) |
| الهيرو (شريط كحلي) | `.hero .hero-copy .hero-eyebrow-free .hero-cta .hero-trust .hero-art .promo-slider-container .promo-dot`; زر `.btn-primary` داخل الهيرو ذهبي تلقائياً |
| الأقسام | `.section(.section-alt) .section-head .cat-scroller .cat-chip .cat-icon .category-grid` |
| بطاقة المنتج | `.product-grid .product-card .product-media .badge(.badge-offer/.badge-new/.badge-featured/.badge-out-abs/.badge-variants) .product-body .product-cat .product-name .card-color-dot .product-foot .price .product-actions .btn-label` + أصناف محجوزة `.price-old .price-sale` (تُستعمل داخل `priceHtml(product)` في `whatsapp.js`: السعر القديم مشطوب يظهر فقط إذا `isOffer` و`oldPrice > price`) |
| المنتج غير المتاح | يُكتشف بـ `.product-card:has(.badge-out-abs)` فتصبح الصورة رمادية باهتة (لا يحتاج صنفاً إضافياً) |
| المتجر | `.shop-toolbar .search-box .sort-select .shop-layout .filter-panel .shop-tab-btn(.active) .cat-sub-chip(.active) .empty-state` |
| الأقسام (صفحة) | `.cat-main-card .cat-card-header .cat-card-img .cat-sub-chips` |
| تفاصيل المنتج | `.detail-grid .detail-media .detail-gallery(-img) .gallery-thumb(.active) .color-swatch(.is-selected) .size-btn(.is-selected) .qty-stepper .detail-price .detail-actions` |
| السلة | `.cart-layout .cart-items-wrapper .cart-item .summary-card .summary-row(.total) .remove-btn` |
| نماذج/تنبيهات | `.form-card .field .form-error .toast(.toast-success/.toast-error) .modal-overlay(.open) .modal-card .modal-head .close-modal` |
| الأدمن | `.admin-shell .admin-sidebar .admin-nav(button.active) .admin-main .admin-topbar .admin-stats .stat-card(.num/.label) .admin-panel .panel-head .admin-table .row-actions .pill(-ok/-off/-warn/-info) .order-status-select .order-items .order-item .order-item-qty .order-item-name .inventory-cell .image-upload .icon-picker` |

### نقاط تقنية يجب معرفتها قبل تعديل CSS
1. **بطاقة المنتج مكررة في JS** (`products.js` و`index.html`) لكن **قواعد CSS واحدة** — لا تكتب CSS خاصاً بصفحة واحدة للبطاقة.
2. **مواضع `!important` مقصودة** لأن HTML/JS يضع أنماطاً مضمّنة تتعارض: حقول البحث/الترتيب في `products.html` (`#searchInput/#sortSelect`)، قائمة الخيارات المنسدلة في `product.html` (`#dropdownBtn/#dropdownList/#descToggle/#descFade`)، `.modal-overlay .modal-card` (الأدمن يضع `max-width:90vw` مضمّناً)، نوافذ المنتج/القسم/الإعلان، وتلوين `select.order-status-select`. إن أردت إزالة `!important` فعدّل الأنماط المضمّنة في HTML/JS أولاً.
3. **تلوين حالة الطلب في الأدمن** بدون JS: القائمة `select.order-status-select` تتلوّن عبر `:has(option[value="pending|prepared|cancelled"]:checked)` (أصفر / أخضر / أحمر). قيم الـ `option` يجب أن تبقى كما هي.
4. **`:has()`** مستخدم في: المنتج غير المتاح، حالة المخزون `.stock-line`، تلوين الطلبات، و`body:has(#adminApp)` (منع التمرير الأفقي في الأدمن). المتصفحات المدعومة: Chrome 105+ / Safari 15.4+ / Firefox 121+.
5. **RTL:** الشارات ومواضع العناصر تستخدم خصائص منطقية (`inset-inline-*`). الاستثناءات الفيزيائية المقصودة: القائمة الجانبية للمتجر (تنزلق من اليسار بجانب الزر)، وزر العودة للأعلى `#backToTopBtn` (يمين)، وأيقونة البحث داخل الحقل.
6. **قواعد الأدمن** (التي كانت في `<style>` داخل `admin.html`) أصبحت في قسم "Admin dashboard" داخل `style.css`. عمود التاريخ في جدول الطلبات يُثبَّت عبر `#ordersTableBody td:first-child`.
7. **نقاط التوقف:** `style.css`: 1050 / 1024 (إخفاء القائمة وإظهار زر القائمة) / 900 (عمود واحد + الأدمن يصبح درجاً جانبياً) / 768 / 650 (جوال: بطاقتان في الصف) / 420. `refresh.css`: `hover:none` / 767 / 900 / 768 / 650 / 360. القاعدة: الأساس في `style.css` والتحسين الجوّال في `refresh.css`.
8. **الأداء:** الانتقالات على `transform/opacity/box-shadow/border-color/background` فقط، بلا `backdrop-filter` ولا مكتبات. `prefers-reduced-motion` يلغي كل الحركة. أبعاد الصور تحجزها `aspect-ratio` لتجنب القفزات.
9. **الأيقونات:** كلها SVG من `icons.js` (`stroke="currentColor"`)؛ `style.css` يوحّد سماكة الخط (1.75) ونهايات الخطوط المدوّرة لكل `svg[stroke="currentColor"]`.
10. أنماط مضمّنة ما زالت في JS (القائمة الجانبية، نقاط ألوان صفحة المنتج، سطر الفوتر، صفوف الأدمن مثل `pill-off` المضمّنة) — تعمل مع الألوان الجديدة عبر الأسماء القديمة، ولا تحتاج تعديلاً.

---

## 6. الطلب عبر واتساب (`js/whatsapp.js`)

1. المستخدم يضغط "طلب عبر واتساب" (من صفحة المنتج: `orderSingleProductViaWhatsApp`، أو السلة: `orderCartViaWhatsApp`).
2. تظهر نافذة معلومات التوصيل `showDeliveryModal` (المحافظة، المنطقة، أقرب نقطة، الهاتف، ملاحظات).
3. يُسجَّل الطلب: `Store.logOrder({...})` ← localStorage + `push` إلى `ws_orders` (SDK) أو POST عبر REST عند غياب SDK (مع طابور `ws_pending_orders` عند الفشل).
4. يُفتح `https://wa.me/<digits>?text=<encoded>` بنص منسق (`buildProductWhatsAppLink` / `buildCartWhatsAppLink`)، وتُفرَّغ السلة في طلب السلة.
5. الرقم يُؤخذ من `Store.getSettings().whatsapp` (يُخزَّن أرقاماً فقط عبر `whatsappDigitsOnly`).
6. `formatPrice(n)` = `n.toLocaleString("en-US") + " " + currencySymbol` (أرقام إنجليزية دائماً). `priceHtml(product)` (في `whatsapp.js` أيضاً) تبني HTML السعر لبطاقات المتجر والرئيسية وصفحة المنتج والبحث العام. `safeMapUrl(url)` يقبل روابط `http/https` فقط (يُستعمل في الفوتر وصفحة تواصل معنا وحفظ الإعدادات).

**⚠️ أمان الأسعار:** لا يوجد خادم وسيط، فسعر/إجمالي الطلب المسجَّل **قادم من المتصفح** ويُعدّ إرشادياً؛ تحقّق منه عند التواصل مع الزبون. نافذة التوصيل: التحقق اللحظي من الهاتف (07xxxxxxxxx) يعمل الآن فعلياً (كان معطلاً بسبب إعادة استبدال النموذج).

**ملاحظات:** حقول التوصيل (محافظة/منطقة) مخصصة للعراق — لتغييرها عدّل `showDeliveryModal` ودوال بناء الرسائل وجدول الطلبات في `admin.js`. المخزون **لا يُخصم عند الطلب**؛ يُخصم عندما يغيّر الأدمن الحالة إلى "تم التجهيز".

---

## 7. لوحة الأدمن (`admin.html` + `admin.js`)

**البوابة:** `requireAdminAuth()` ← إن لم يكن المستخدم أدمن يُحوَّل إلى `login.html`. بعدها تُحمَّل كل المنتجات والطلبات من Firebase. إن فشل تحميل المنتجات يظهر تنبيه أعلى اللوحة ويُمنع حفظ/حذف المنتجات (`ensureProductsWritable`).

**اللوحات** (`data-panel`): `dashboard` (إحصائيات + آخر الطلبات) | `products` | `categories` | `outofstock` (نفذ من المتجر — القسم 22) | `ads` | `orders` | `settings`. `renderOrdersTable()` تكتب الآن مباشرة في جدولين: `#ordersTableBody` (الطلبات) و`#ordersTableBody2` (الرئيسية) — وتعرض آخر **300** طلب فقط.

**جدول المنتجات (محسَّن للأداء — القسم 20):** لا يُرسم إلا **40 صفاً** في كل مرة (`ADMIN_PRODUCTS_PAGE_SIZE`) مع زر «عرض المزيد (X من Y)»؛ البحث مؤجَّل 250ms (debounce) ويعيد العرض لأول صفحة؛ الصور مصغّرة (`getIkUrl(...,96,60)`) و`loading="lazy" decoding="async"`؛ أزرار التعديل/الحذف/المزيد تعمل بمستمع واحد على `#productsTableBody` (أزرار `data-act="edit|del|more"` + `data-id`) بدل `onclick` في كل صف. دوال الجدول: `adminProductMatches`, `adminProductRowHtml`, `renderProductsTable`, `wireProductsTableEvents`.

**رفع إصدار البيانات للزوار:** كل حفظ/حذف لقسم أو إعلان أو إعدادات يستدعي `bumpMetaVersion()` (يكتب `Date.now()` في `ws_meta_v` عبر SDK). **أي ميزة أدمن جديدة تعدّل الأقسام/الإعلانات/الإعدادات يجب أن تستدعيها**، وإلا لن يرى الزوار التعديل حتى يتغيّر الرقم لسبب آخر. المنتجات لا تحتاجها (تحدّث `ws_index/v` تلقائياً عند الحفظ).

**إشعار «تم تحديث الموقع» (`showUpdateNotice`):** كود الإشعار موجود في `admin.js` (`UPDATE_NOTICE_ID`، يُحفظ في `localStorage.ws_admin_update_seen`) لكنه يبحث عن عناصر `#updateModal` / `#closeUpdateModal` / `#updateModalOk` **وهي غير موجودة في `admin.html` ولا CSS خاص بها في النسخة الحالية**، فالدالة تخرج بصمت ولا يظهر شيء. لتفعيله أضف نافذة بنفس المعرّفات (بنية `.modal-overlay > .modal-card` مثل `#adModal`) وغيّر `UPDATE_NOTICE_ID` لإظهاره مجدداً.

**المنتجات:** نافذة `#productModal` (باركود، اسم، وصف، سعر، قسم، صورة رئيسية، صور إضافية، ألوان [اسم+درجة+صورة]، مقاسات [نص مفصول بفواصل]، **شبكة مخزون** لكل لون×مقاس، كمية كلية، متاح/مميز/جديد/عرض).
- إذا وُجدت ألوان أو مقاسات: الكمية الكلية **للقراءة فقط** ومحسوبة من الشبكة.
- إن لم تُرفع صورة رئيسية تُؤخذ أول صورة إضافية، ثم أول صورة لون.
- بعد الحفظ تنتظر اللوحة نتيجة الكتابة (`Store.whenProductsSaved()`)؛ عند الفشل تبقى النافذة مفتوحة مع رسالة خطأ بدل إعلان نجاح كاذب.

**الأقسام:** اسم + أيقونة (من `CATEGORY_ICON_KEYS`) + صورة اختيارية + "يتبع لقسم" (فرعي، مستوى واحد). **حذف قسم له أقسام فرعية ممنوع** (يجب حذفها/نقلها أولاً)، وقسم له فرعيات لا يمكن جعله فرعياً.

**الإعلانات:** صورة بانر (تُرفع بقياس `w-1400`) + رابط + ترتيب.

**الطلبات:** تغيير الحالة (`changeOrderStatus`): عند اختيار "تم التجهيز" لأول مرة يُخصم المخزون تلقائياً (من `inventory[لون||مقاس]` أو `stock`) **بكتابة واحدة** لقائمة المنتجات، ثم يُعلَّم `stockDeducted:true`. إن لم يكفِ مخزون بند أو حُذف منتجه تظهر رسالة بالبنود التي لم تُخصم. التحديث يُكتب عبر `updateOrderInFirebase` (يبحث بـ `orderByChild("id")`، يكتب في Firebase أولاً ثم محلياً، ويعيد `true/false`)؛ عند الفشل تُعاد القائمة المنسدلة للحالة السابقة. **لا يُعاد المخزون عند الإلغاء بعد التجهيز** (انظر القسم 15).

**شكل منتجات الطلب في جدول الطلبات:** كل بند سطر `li.order-item` فيه شارة كمية `.order-item-qty` بصيغة `×N` (دائرية، لون `--secondary-50`) ثم الاسم `.order-item-name` بخط عريض والخيارات (لون/مقاس) داخل `<small>` بخط أخف. القائمة `.order-items` بلا نقاط ولها `min-width:220px` كي لا ينضغط الاسم في عمود ضيق. القواعد في `style.css` بجانب `#ordersTableBody td:first-child`، والماركاب في `renderOrdersTable` (`admin.js`) ويُستعمل لجدولي الطلبات (`#ordersTableBody` و`#ordersTableBody2`).

**الإعدادات:** نموذج `#settingsForm` (أسماء الحقول = مفاتيح `ws_settings`).

**شريط «التحكم الذكي بالمنتجات والأسعار» (`.ai-toolkit-bar` أعلى لوحة المنتجات):** `🖼️ رفع صورة` (`#aiImageInput`) و`📄 رفع ملف` (`#aiFileInput`: PDF/إكسل/CSV) ← `wireSmartMediaScanner`؛ وزر `📊 استيراد إكسل` (`#excelSyncInput` ← `wireExcelSync` ← `handleExcelFileWithAI`) — الثلاثة تنتهي بنافذة المراجعة نفسها؛ حقل أمر التسعير + «تطبيق التسعير الذكي» (`#aiPriceCommandInput` / `#btnExecutePriceCommand` ← `wireAiPricing`)؛ وزر `✨ توليد بالذكاء الاصطناعي` بجانب حقل «الوصف» في نافذة المنتج (`#btnAiGenDesc`). (`scanShelf` موجودة في `ai.js` لكنها **غير موصولة بأي زر** حالياً.) إن لم يُحمَّل `ai.js` أو لم تُضبط متغيرات Cloudflare أو لم تكن على Cloudflare Pages تظهر رسالة خطأ واضحة ولا يتعطل باقي اللوحة (التفاصيل: **القسم 24**).

**نافذة المعاينة الموحّدة (`#shelfScanModal` + `renderBatchReviewCards(items, title)`):** كل مسارات الاستيراد (إكسل/CSV، صورة، PDF) **لا تكتب شيئاً مباشرة**؛ بل تبني مصفوفة عناصر وتعرضها كبطاقات للمراجعة. في كل بطاقة (بصنف `.shelf-item-card`): خانة تحديد، الاسم `.shelf-item-name`، القسم `.shelf-item-category` (مع إنشاء قسم جديد فوراً `fastAddCategory` — يستدعي `bumpMetaVersion()` ويحدّث كل القوائم)، الوصف، الألوان والمقاسات (نص مفصول بفواصل)، السعر، الكمية، ربط صورة (رابط أو رفع)، ولمنتج موجود شارة «تحديث رصيد (+N)» مع عرض الرصيد الحالي. أزرار: «تحديد الكل»، «إلغاء»، «حفظ المنتجات المحددة في المتجر» (`#btnSaveShelfProducts`). عند الحفظ: `ensureProductsWritable()` ثم `ensureFullCatalogForBulk()` ثم شاشة انتظار (`showProcessLoader/hideProcessLoader` — مضمّنة الأنماط وتستعمل متغيرات الثيم) ثم لكل عنصر محدد:
- **المطابقة مع منتج موجود:** بـ `data-existing-id` إن وُجد، وإلا بالباركود/SKU، وإلا بالاسم بعد التطبيع `cleanNameForMatch` (توحيد `أإآ→ا` و`ة→ه` و`ى→ي` وتحويل الفواصل لمسافة).
- **منتج موجود:** السعر يُحدَّث إن كان > 0؛ القسم والوصف إن أُدخلا؛ الصورة تُعبَّأ فقط إن لم يكن له صورة؛ الألوان والمقاسات **تُدمج** (تُضاف الجديدة بلا حذف القديمة)؛ **الكمية الواردة تُضاف (+) إلى الرصيد الحالي**؛ وإن وُجدت ألوان/مقاسات يُدمج `inventory` وتُعاد حساب الكمية الكلية من مجموعه؛ ويُضبط `available:true` إن صارت الكمية > 0.
- **منتج جديد:** يُنشأ بـ `Store.addProduct` (`isNew:true`, `available:true`) — الشرط الوحيد وجود اسم (لا يُشترط سعر ولا كمية ولا قسم).
- **مطابقة القسم المقترح من الذكاء الاصطناعي:** `matchCategory(name, categories)` في `admin.js` — تطابق تام أولاً، ثم تطابق جزئي **وحيد** فقط؛ وإلا يُترك «بدون قسم» وتظهر شريحة «قسم مقترح» بزر إنشاء. (القديم كان يأخذ أول قسم يحوي الكلمة: «عطور» ← «عطور رجالية» حتى مع وجود «عطور نسائية».)
- **الحفظ:** زر الحفظ يُعطَّل أثناء العملية (لا إنشاء مزدوج)؛ نتيجة `Store.saveProducts` تُفحص (`false` ← رسالة فشل بدل نجاح كاذب)؛ فشل رفع ImgBB ← يُحفظ المنتج **بلا صورة** مع تنبيه بالعدد (لا يُخزَّن `data:` base64 في Firebase)؛ وتُوزَّع الكمية على توليفات اللون×المقاس **بمجموع يساوي الكمية الواردة تماماً** (كان يرفع كل توليفة إلى 1 على الأقل فيتضخم الرصيد).
- **التحذيرات:** إن فشلت دفعة من جدول كبير، أو قُطع رد النموذج، أو دُمجت سطور مكررة ← يظهر ⚠️ في رأس نافذة المراجعة (`#shelfScanStatus`) وليس في توست عابر فقط، كي لا يحفظ المدير ناقصاً دون أن يعلم.
- **تنقية الألوان `cleanColorName`:** كانت لا تحذف الكلمات العربية («مائي/شفاف») لأن `\b` في JavaScript لا يتعرّف على الحروف العربية؛ أُصلحت بحدود صريحة (القسم 18 صف 34).
- **الألوان/المقاسات والمخزون:** الألوان تُحوَّل إلى درجة Hex عبر `COLOR_HEX_MAP` (أسود، أبيض، أحمر…؛ غير المعروف يأخذ `#7c9a4c`). عند وجود ألوان/مقاسات تُوزَّع الكمية بالتساوي على التركيبات: `max(1, floor(الكمية ÷ عدد التركيبات))` لكل تركيبة — ⚠️ فقد يتجاوز المجموع الكمية المُدخلة (مثلاً كمية 2 وأربع تركيبات ← 4).
- **الصور:** الصور المقصوصة (رف) أو المرفوعة تكون `data:` URL في المعاينة، وتُرفع إلى ImgBB عند الحفظ (`dataURLtoBlob` ← `uploadToImgBB`)؛ ⚠️ **إن فشل الرفع يُحفظ المنتج بالصورة كـ data URL كاملة داخل Firebase** (تُضخّم القاعدة وتبطئ الفهرس).
- النهاية: `Store.saveProducts(Store.getProducts())` (كتابة جماعية) ثم `syncProductsToAlgolia` ثم رسالة «أُضيف X وحُدّث رصيد Y».

**استيراد Excel/CSV (`wireExcelSync`، حقل `#excelSyncInput`):** يقرأ أول ورقة بمكتبة SheetJS ويبني عناصر المعاينة أعلاه (**بدل التحديث المباشر القديم**). أسماء الأعمدة المقبولة (غير حساسة لحالة الأحرف الإنجليزية):
- باركود: `الباركود | باركود | كود المادة | كود | barcode | sku`
- اسم: `اسم المنتج | الاسم | المادة | name`
- سعر: `السعر | سعر البيع | سعر المفرد | price`
- كمية: `الكمية | المخزون | الرصيد | stock | qty`
- قسم: `القسم | التصنيف | category`
- وصف: `الوصف | وصف | description | desc`
- ألوان: `الألوان | الالوان | لون | اللون | colors | color`
- مقاسات: `المقاسات | المقاس | الاحجام | الحجم | sizes | size`
- صورة: `الصورة | صورة | رابط الصورة | image | img`

قواعد الاستيراد الحالية:
- الأرقام تقبل الأرقام العربية/الفارسية وفواصل الآلاف (`1,500`). **السعر الفارغ ← يبقى سعر المنتج الموجود (أو 0 للجديد). الكمية الفارغة ← 1** (تغيّر عن السلوك القديم الذي كان «لا تغيّر»).
- ⚠️ **تغيّر جوهري: الكمية في الإكسل صارت «واردة» تُضاف إلى الرصيد الحالي، لا قيمة نهائية تستبدله** (كان القديم يضبطها). تحميل الملف نفسه مرتين يضاعف الرصيد. وكمية 0 لا تصفّر شيئاً. لتصحيح/تصفير رصيد عدّل المنتج من نافذته.
- الأقسام: يُطابَق نص القسم بالاسم المطبَّع أو بالاحتواء؛ ما لا يطابق يظهر بدون قسم ويمكنك إنشاؤه من المعاينة.
- ⚠️ `maxExcelImportCount` (100 في `config.js`) **لم يعد يُطبَّق**؛ لا سقف على عدد الصفوف الآن (الصفوف الكثيرة تعني بطاقات كثيرة في المعاينة).
- ⚠️ مكتبة SheetJS 0.18.5 من jsDelivr لها ثغرات معروفة عند فتح ملفات غير موثوقة؛ استعمل ملفاتك أنت فقط (القسم 15).

**الكتابة لـ Firebase من الأدمن:** كل تعديل يكتب **عقدة المنتج المتغيّر فقط** `ws_products/{id}` مع سجله في `ws_index/items/{id}` ورفع `ws_index/v` في `update()` واحد (القسم 23). الحماية: لا كتابة قبل اكتمال تحميل كل المنتجات (`canWriteProducts`).

**الأمان في العرض:** كل قيمة ديناميكية في جداول الأدمن (صور، معرّفات داخل `onclick`، أسماء، `it.qty`، روابط) تمر الآن عبر `escapeHtml/jsStr/safeUrl`. هذا مهم بوجه خاص لجدول الطلبات لأن **أي زائر يستطيع كتابة طلب** في `ws_orders` (حقول الطلب غير موثوقة).

---

## 8. نظام الصور: ImgBB ← ImageKit

### 8.1 المسار الكامل
```
اختيار ملف في لوحة الأدمن
  → uploadToImgBB(file, isBanner)          [admin.js]  POST https://api.imgbb.com/1/upload?key=...
  → يرجع https://i.ibb.co/<HASH>/<NAME>.jpg
  → إن كان imageKitEndpoint معبّأً: يُحوَّل الرابط إلى
    https://ik.imagekit.io/<ID>/tr:w-900,q-85,f-webp/<HASH>/<NAME>.jpg     (البانر: tr:w-1400,q-90,f-webp)
  → هذا الرابط هو ما يُخزَّن في Firebase (image / images / colors[].image / category.image / ad.image)
عند العرض: getIkUrl(url, width, quality) يستبدل مقطع tr: بحسب الحجم المطلوب
  (بطاقة 700، تفاصيل 1000، مصغرات وسلة وبحث 150 ...)
```
- إن لم يُضبط `imageKitEndpoint` يُخزَّن رابط ImgBB الخام (ويعمل الموقع لكن بلا ضغط/WebP).
- كل الرفع يمر من دالة واحدة `uploadToImgBB` ← **تبديل مزود الرفع = تعديل هذه الدالة فقط** (أماكن استدعائها: صورة المنتج، الصور الإضافية، صورة اللون، صورة القسم، صورة الإعلان).
- صورة بديلة عند فشل التحميل: `placehold.co` (في `productMediaHtml`).

### 8.2 إعداد ImgBB
1. أنشئ حساباً في imgbb.com ثم افتح صفحة API (`api.imgbb.com`) واحصل على **API key**.
2. ضعه في `config.js` → `imgbbApiKey`.
3. الصور لا تنتهي صلاحيتها (الكود لا يمرر `expiration`).
4. ⚠️ المفتاح ظاهر لأي زائر (موقع ثابت). استخدم مفتاحاً مخصصاً لكل عميل وبدّله إن تسرّب.

### 8.3 إعداد ImageKit (الشرط الحاسم)
الكود **يحذف نطاق `i.ibb.co` ويُلصق المسار فقط** بعد الـ endpoint، لذلك يجب أن يكون المصدر في ImageKit من نوع **Web Folder** (يُسمّى أيضاً Web server) وليس Web Proxy:

1. سجّل في imagekit.io (الخطة المجانية تكفي للبداية).
2. Dashboard ← **External storage** ← **Add origin**.
3. اختر النوع **Web Folder** وضع الـ Base URL: `https://i.ibb.co` (بدون `/` في النهاية).
4. عند إضافة أول origin يُربط تلقائياً بالـ URL endpoint الافتراضي؛ إن كان لديك origins أخرى فعدّل قائمة الأفضلية (origin preference) أو أنشئ URL endpoint مستقلاً للمتجر.
5. انسخ الـ **URL endpoint**، شكله `https://ik.imagekit.io/YOUR_ID` ← ضعه في `imageKitEndpoint` (إن كان الـ endpoint يحمل معرّف origin فأضِفه كما هو).
6. اختبار: افتح في المتصفح `https://ik.imagekit.io/YOUR_ID/tr:w-300/<HASH>/<NAME>.jpg` (ببيانات صورة ImgBB موجودة). يجب أن تظهر الصورة.

> لو اختار أحدهم **Web Proxy** بدل Web Folder فسيصبح الشكل `endpoint/tr:.../https://i.ibb.co/...` ولن يطابق الكود الحالي (ستفشل الصور بـ 404). وثائق ImageKit نفسها تحذّر من أن Web Proxy يتيح لأي شخص استخدام حسابك لخدمة أي صورة، وWeb Folder مقيّد بنطاق واحد وأأمن لهذا الاستخدام.

### 8.4 بدائل عند تعطل ImgBB (مثل Cloudinary)
ضمن `uploadToImgBB` يكفي استبدال الطلب بـ (Unsigned upload preset):
```js
const fd = new FormData();
fd.append("file", file);
fd.append("upload_preset", "YOUR_UNSIGNED_PRESET");
const r = await fetch("https://api.cloudinary.com/v1_1/YOUR_CLOUD/image/upload", { method: "POST", body: fd });
const d = await r.json();
if (!d.secure_url) throw new Error((d.error && d.error.message) || "فشل الرفع");
return d.secure_url;   // getIkUrl لن يعدّل هذا الرابط لأنه ليس ImageKit
```
(ثم أضف مفاتيح `cloudinaryCloudName/cloudinaryPreset` في `config.js`.) لو أردت بقاء ImageKit فاجعل الـ origin Web Folder بقاعدة `https://res.cloudinary.com` وأعد بناء المسار بنفس أسلوب الدالة الحالية.

---

## 9. إعداد Firebase خطوة بخطوة (مشروع جديد لعميل جديد)

1. **console.firebase.google.com** ← Add project (يمكن تعطيل Analytics).
2. **Project settings ← General ← Your apps ← Web (`</>`)** ← سجّل التطبيق ← انسخ `firebaseConfig` ووزّعه على (كلها في `js/config.js` — الجدول الكامل في القسم 0-ب):
   `apiKey→firebaseApiKey`, `authDomain→firebaseAuthDomain`, `projectId→firebaseProjectId`, `storageBucket→firebaseStorageBucket`, `messagingSenderId→firebaseMessagingSenderId`, `appId→firebaseAppId`.
3. **Build ← Realtime Database ← Create database** (ليس Firestore). اختر منطقة قريبة من الزبائن (مثلاً `europe-west1`) وابدأ بوضع Locked. انسخ العنوان من أعلى صفحة البيانات ← `firebaseDatabaseURL`.
   - أوروبا/آسيا: `https://PROJECT-default-rtdb.REGION.firebasedatabase.app/`، وأمريكا: `https://PROJECT-default-rtdb.firebaseio.com/`.
4. **Build ← Authentication ← Get started ← Sign-in method ← Email/Password ← Enable.**
5. **Authentication ← Users ← Add user**: أنشئ حساب الأدمن (إيميل + كلمة مرور قوية) **قبل نشر الموقع**، وانسخ الـ **UID**. ضع الإيميل في `adminEmails`.
6. **Authentication ← Settings ← Authorized domains**: أضف نطاق الإنتاج (مثل `xxx.vercel.app` والدومين المخصص). بدونها يفشل تسجيل الدخول على الموقع المنشور (`localhost` موجود افتراضياً).
7. **Realtime Database ← Rules**: الصق القواعد التالية (استبدل `ADMIN_UID`) ثم Publish:

```json
{
  "rules": {
    "ws_categories": {
      ".read": true,
      ".write": "auth != null && auth.uid === 'ADMIN_UID'"
    },
    "ws_products": {
      ".read": true,
      ".write": "auth != null && auth.uid === 'ADMIN_UID'",
      ".indexOn": ["categoryId", "featured", "isOffer", "isNew", "id"],
      "$pid": { ".validate": "newData.hasChildren(['id']) && newData.child('id').val() === $pid" }
    },
    "ws_settings": {
      ".read": true,
      ".write": "auth != null && auth.uid === 'ADMIN_UID'"
    },
    "ws_ads": {
      ".read": true,
      ".write": "auth != null && auth.uid === 'ADMIN_UID'"
    },
    "ws_index": {
      ".read": true,
      ".write": "auth != null && auth.uid === 'ADMIN_UID'",
      "items": { ".indexOn": ["u"] }
    },
    "ws_meta_v": {
      ".read": true,
      ".write": "auth != null && auth.uid === 'ADMIN_UID'"
    },
    "ws_orders": {
      ".read": "auth != null && auth.uid === 'ADMIN_UID'",
      ".indexOn": ["id"],
      "$orderKey": {
        ".write": "auth != null && auth.uid === 'ADMIN_UID' || (!data.exists() && newData.exists())",
        ".validate": "newData.hasChildren(['id', 'date', 'items', 'total'])",
        "id":    { ".validate": "newData.isString() && newData.val().length <= 64" },
        "date":  { ".validate": "newData.isString() && newData.val().length <= 40" },
        "type":  { ".validate": "newData.val() === 'single' || newData.val() === 'cart'" },
        "total": { ".validate": "newData.isNumber() && newData.val() >= 0" },
        "items": {
          ".validate": "newData.hasChildren() && newData.numChildren() <= 100",
          "$i": {
            "qty":   { ".validate": "newData.isNumber() && newData.val() > 0 && newData.val() <= 9999" },
            "price": { ".validate": "newData.isNumber() && newData.val() >= 0" },
            "name":  { ".validate": "newData.isString() && newData.val().length <= 300" }
          }
        },
        "customer": { "$f": { ".validate": "newData.isString() && newData.val().length <= 300" } },
        "status": { ".validate": "newData.isString() && (newData.val() === 'pending' || (auth != null && auth.uid === 'ADMIN_UID'))" },
        "stockDeducted": { ".validate": "newData.isBoolean() && (newData.val() === false || (auth != null && auth.uid === 'ADMIN_UID'))" }
      }
    }
  }
}
```
> ⚠️ **قواعد `ws_orders` المشدّدة أعلاه (حدود الأحجام/الأنواع ومنع الزائر من تعيين حالة التجهيز) أُضيفت في هذه المراجعة ولم تُختبر على Firebase الحقيقي.** الصقها واختبر طلباً تجريبياً + Rules Playground قبل الاعتماد عليها؛ حقول الطلب الحالية التي يكتبها الموقع: `id,date,type,customer{gov,area,landmark,phone,notes},items[{productId,name,qty,price,color,size,variant}],total`. القواعد القديمة (أول 3 سطور من `$orderKey`) تعمل أيضاً لكنها تسمح بأي حجم/محتوى.

**قاعدة `ws_index` إلزامية للنسخة الحالية:** المتجر يقرأ `ws_index/v` و`ws_index/items` بلا تسجيل دخول (تحتاج `.read: true`)، والأدمن يكتبها مع `ws_products` في تحديث واحد. بدونها: الزائر يحمّل كل المنتجات (النظام القديم)، والأدمن يرى تنبيه "تعذّر إنشاء/قراءة فهرس المتجر"، وحفظ المنتجات يستمر لكن الفهرس يبقى قديماً. **لا تحتاج `.indexOn` للفهرس.**

**قاعدة `ws_meta_v` إلزامية أيضاً:** الزائر يقرأ الرقم بلا تسجيل دخول، والأدمن يكتبه بعد كل تعديل على الأقسام/الإعلانات/الإعدادات. **بدونها (أو إن لم يُنشأ الرقم بعد) ينزّل كل زائر الأقسام والإعلانات والإعدادات كاملة عند كل فحص** (انظر القسم 4 البند 4). بعد إضافة القاعدة احفظ أي قسم أو إعداد من الأدمن مرة واحدة لإنشاء الرقم، ثم تحقق في Firebase Console أن `ws_meta_v` موجود. **لا تحتاج `.indexOn`.**

**لماذا هذه القواعد:**
- الزائر يقرأ الكتالوج فقط، ولا يكتب شيئاً.
- الزائر يستطيع **إنشاء** طلب جديد في `ws_orders` فقط (لا تعديل ولا حذف ولا قراءة) — لذلك **اعتبر كل حقل في الطلب غير موثوق** (الواجهة تهربه الآن، والقواعد تحدّ الحجم/النوع). لا يوجد حد لمعدل الإرسال، فالطلبات الوهمية ممكنة.
- فقط الأدمن (بحسب UID) يكتب/يقرأ الطلبات ويعدّل الكتالوج.
- `.indexOn` ضروري لاستعلامات `orderByChild` التي يستخدمها الموقع؛ **بدونه** يظهر تحذير `Using an unspecified index` في الـ Console ويقوم Firebase بتنزيل العقدة كلها ثم الفلترة محلياً (بطيء). **أي حقل جديد تستعلم عنه أضِفه هنا.**
- `adminEmails` في `config.js` مجرد حارس واجهة؛ **الأمان الحقيقي هو هذه القواعد**.

8. اختبر: افتح `login.html` ← ادخل ← أضف قسماً ومنتجاً ← افتح الرئيسية في نافذة خاصة وتأكد من ظهورهما ← جرّب طلباً تجريبياً وتأكد من ظهوره في لوحة الأدمن (وفي Firebase تحت `ws_orders`).
   - يمكن استخدام **Rules Playground** في تبويب Rules للتأكد من القواعد.

---

## 10. النشر (Vercel كمثال)

- ارفع المجلد إلى GitHub ← Vercel ← Import ← Framework: **Other** ← بلا Build Command ← Output: الجذر.
- المسارات نسبية (`css/..`, `js/..`, `assets/..`) فيجب أن تكون الملفات في جذر الموقع.
- المنتج يُفتح بـ `product.html?id=` فلا حاجة لـ rewrites.
- بعد أول نشر: أضف نطاق Vercel إلى **Authorized domains** في Firebase (الخطوة 6 أعلاه).
- **Cloudflare Pages:** المشروع بلا build (Framework: None، Output: الجذر). ملف `_headers` يُقرأ تلقائياً: `/js/*` بلا كاش (فيُطبَّق أي تعديل في JS فوراً)، و`/css/*` يوم واحد (لذا `?v=` ضروري لـ CSS)، و`/assets/*` أسبوع immutable (غيّر اسم الشعار أو أضف `?v=` عند استبداله). `index.html` يحوي `speculationrules` (prefetch للروابط الداخلية).
- لتجربة محلية استخدم أي خادم ثابت (`npx serve` أو Live Server) — فتح الملفات مباشرة بـ `file://` قد يكسر Firebase.

---

## 11. تخصيص القالب لعميل جديد (Checklist)

> الخطوات التفصيلية (مع جدول مطابقة مفاتيح Firebase) في **القسم 0-ب**. هذا ملخص للمراجعة السريعة:

1. نسخة مستقلة من المجلد + **مشروع Firebase جديد** لكل عميل (القسم 9) + حسابا ImgBB وImageKit (الأفضل فصلهما لكل عميل).
2. انسخ `js/config.template.js` فوق `js/config.js` وعبّئ **كل** الأقسام (هوية، Firebase، `adminEmails`، `imgbbApiKey`، `imageKitEndpoint`، `googleAnalyticsId`، `theme`، `siteUrl`، `credit`، `dataVersion` يبدأ بـ 1).
3. **الشعار:** استبدل `assets/logo/logo.png` (أو غيّر `logo`) وارفع الإصدار: `node tools/set-version.js N`.
4. **الألوان والخط والشكل:** `config.theme` فقط (`preset` أو `colors`) — لا تلمس `style.css` ولا `refresh.css`.
5. **عناوين الصفحات ووسوم المشاركة:** تلقائية من `storeName`/`storeTagline`/`storeDescription`/`siteUrl` عبر الرموز `{{...}}`.
6. **النصوص التسويقية الثابتة** (هيرو ومزايا الرئيسية، صفحة `about.html`): نصوص عامة تصلح لأغلب المتاجر؛ عدّلها في نسخة العميل عند الحاجة.
7. **أيقونات الأقسام**: `icons.js` يحتوي أيقونات قديمة لمتجر حيوانات أليفة (`paw, bone, fish, feather, toy, bed, cage, collar, brush, spray, bag`) ولا تظهر في منتقي الأدمن؛ المنتقي يقرأ `CATEGORY_ICON_KEYS = ["box","bag","tag","shirt","ruler","layers","gauge","truck","home"]`. لإضافة أيقونة: أضف SVG إلى `ICONS` وأضف مفتاحها إلى `CATEGORY_ICON_KEYS`.
8. **حقول التوصيل ورسالة واتساب**: عدّل `whatsapp.js` إن كان العميل خارج العراق أو يريد صيغة أخرى.
9. **سطر المبرمج في الفوتر**: `config.credit` (`show:false` لإخفائه).
10. شغّل `node tools/check-config.js` و`node tests/run-tests.js` و`node tests/boot-tests.js`.
11. بعد النشر: تسجيل الدخول، تعبئة **الإعدادات** من لوحة الأدمن (الواتساب أولاً، وإلا يرفض الموقع إكمال الطلب)، وإضافة نطاق الموقع إلى Authorized domains.

### ملاءمة القالب لأنواع المتاجر

| نوع المتجر | كيف يُضبط |
|---|---|
| **ملابس** | ألوان (مع صورة لكل لون) + مقاسات `S, M, L, XL` + شبكة المخزون لكل لون×مقاس |
| **كوزمتك** | بلا ألوان/مقاسات (مخزون بسيط)، أو ألوان كـ"درجات" (hex)، أو "المقاسات" كأحجام `50ml, 100ml` |
| **كهربائيات/موبايلات** | "المقاسات" كسعات `128GB, 256GB`، والألوان للألوان، والباركود/SKU + **استيراد Excel** لتحديث الأسعار والمخزون بسرعة |
| **مواد/سوبرماركت** | باركود + استيراد Excel + أقسام رئيسية/فرعية كثيرة |

---

## 12. وصفات التعديل الشائعة (أين أعدّل بالضبط؟)

**إضافة حقل جديد للمنتج (مثلاً `brand`)**
1. `admin.html`: أضف `<input id="productBrand">` داخل `#productForm`.
2. `admin.js`: في `openProductModal` املأ القيمة عند التعديل، وفي `saveProductForm` أضفها إلى كائن `data`.
3. (اختياري) `store.js` → `Store.addProduct` لقيمة افتراضية.
4. العرض: `products.js` → `renderProductCard` و`initProductDetailPage`، **وكذلك** `renderHomeProductCard` في `index.html`.
5. إن كنت ستفلتر/تستعلم به: أضفه إلى `.indexOn` في Rules.

**إضافة تبويب فلتر جديد في المتجر (مثل "الأكثر مبيعاً")**
- `products.js`: `renderCategoryFilterPanel` (زر `data-filter`) + الخريطة `map` داخل `fetchNextShopBatch` + رسالة `emptyMsg` في `renderShopResults` + حقل boolean جديد في المنتج + `.indexOn`.

**إضافة صفحة جديدة**
- انسخ بنية `about.html` (head + `#site-header data-active` + main + `#site-footer` + ترتيب السكربتات)، أضف الرابط في `NAV_LINKS` (`app.js`) بمفتاح جديد.

**إضافة إعداد جديد للمتجر (مثل رابط فيسبوك)**
1. `store.js` → كائن الـ seed في `seedIfNeeded` (اختياري).
2. `admin.html` → حقل داخل `#settingsForm` باسم `name="facebook"`.
3. `admin.js` → `fillSettingsForm` و`wireSettingsForm` (داخل `patch`).
4. الاستخدام: `Store.getSettings().facebook` (مثل فوتر/اتصال).

**تغيير نص رسالة واتساب** ← `buildProductWhatsAppLink` و`buildCartWhatsAppLink` في `whatsapp.js`.

**تغيير عدد المنتجات في المتجر/الرئيسية** ← `SHOP_PAGE_SIZE` في `products.js`، والرقم `4` في استدعاءات `loadProductsPageByField` (في `index.html`).

**تغيير سرعة/سلوك سلايدر الإعلانات** ← `renderAdsSlider` في `index.html` (الرقم `4000`).

**تغيير عدد صفوف جدول منتجات الأدمن** ← `ADMIN_PRODUCTS_PAGE_SIZE` في `admin.js` (الافتراضي 40).

**تغيير سرعة التحديث/مدة الكاش** ← ثلاثة أماكن يجب أن تتفق: (1) `META_PULL_MS` و(2) `INDEX_CHECK_MS` في أعلى `store.js` (كلاهما `300 * 1000` حالياً = 5 دقائق)، و(3) الرقم `300000` (مرتين) في كتلة «الجلب المبكر» داخل `js/boot.js`. فاصل `setInterval` في آخر `store.js` **لم يعد رقماً مستقلاً**: يستعمل `Math.min(INDEX_CHECK_MS, META_PULL_MS)`. خفض الفاصل يعني طلبات Firebase أكثر.

**إضافة عملة/تنسيق أرقام** ← الرمز من `config.currencySymbol`؛ التنسيق في `formatPrice` في `whatsapp.js`.

**تبديل قالب ألوان أو لون واحد لمتجر** ← `config.js ← theme.preset` أو `theme.colors.<اسم>` (القسم 5-ب). لا شيء آخر.

**إضافة مفتاح إعداد جديد خاص بالمتجر (مثل رابط فيسبوك أو لون شريط الإعلان)**
1. أضفه إلى `config.js` **و`config.template.js`** مع تعليق عربي يشرح مصدره وصيغته.
2. استعمله في الكود عبر `STORE_CONFIG.<المفتاح>` مع قيمة احتياطية آمنة (الاختبارات تحقن كائناً بسيطاً بدون كل المفاتيح).
3. إن كان قيمة تظهر في عنوان/وسوم الصفحة فأضفه إلى `TOKENS` في `boot.js`، أو استعمل `data-cfg` للنصوص.
4. إن كان لوناً فأضفه إلى `theme.colors` و`buildVars()` في `boot.js` ثم استخدم المتغير في CSS (لا لون ثابت).
5. أضف تحققه إلى `tools/check-config.js` واختباراً في `tests/boot-tests.js` (أو `run-tests.js` إن كان يخص `Store`).

---

## 13. قواعد إلزامية عند أي تعديل (للذكاء الاصطناعي)

1. **لا تُدخل إطار عمل أو أداة build.** يبقى المشروع ملفات ثابتة.
2. مرّر كل قراءة/كتابة بيانات عبر `Store`؛ لا تكتب في `localStorage` أو Firebase مباشرة إلا حيث يفعل الكود الحالي ذلك (`admin.js → updateOrderInFirebase` و`store.js` نفسه).
3. كل نص قادم من المستخدم/قاعدة البيانات داخل `innerHTML` ← `escapeHtml(...)`. وفي `onclick="fn(...)"` ← `jsStr(...)`.
4. بطاقة المنتج مكررة في `products.js` و`index.html` ← عدّل الاثنين (الماركاب فقط؛ الشكل في CSS واحد).
5. بعد تعديل أي `.js/.css` ← ارفع `?v=` في **كل** الصفحات التي تستدعيه.
6. بعد تغيير شكل البيانات أو حذف جماعي ← ارفع `STORE_CONFIG.dataVersion`.
7. أي حقل جديد يُستعلم عنه بـ `orderByChild` ← أضفه إلى `.indexOn`.
8. لا تغيّر ترتيب السكربتات (القسم 1) ولا تحمّل `firebase-auth` بعد `store.js`.
9. الواجهة عربية RTL: حافظ على `dir="rtl"` واستخدم خصائص منطقية (`padding-inline`, `margin-inline`) عند الإمكان.
10. لا تكتب مفاتيح حقيقية في الردود أو الدليل؛ استخدم `YOUR_...`.
11. **لا تضع ألواناً ثابتة** في CSS أو أنماط مضمّنة جديدة: استعمل متغيرات الثيم (`--primary`, `--text-rgb`, `--on-primary`… القسم 5-ب). لا تضف كتل `<style>` داخل HTML. **لا تعدّل ألوان `:root` في `style.css`** لتخصيص متجر — هذا من `config.theme`.
12. عند اقتراح تعديل اذكر: اسم الملف، اسم الدالة، **الكود الكامل للدالة بعد التعديل** (لا شظايا)، وهل يلزم رفع `dataVersion` أو تعديل Rules.
13. **لا تستدعِ `Store.saveProducts/deleteProduct/updateProduct` من صفحات الزوار** ولا تكتب قائمة المنتجات إلى Firebase من كاش قد يكون جزئياً. الكتابة للأدمن فقط وبعد `Store.canWriteProducts()`. لإزالة منتج من الكاش فقط استعمل `Store._removeFromLocalCache(id)`.
14. لا تضع مفتاح Algolia الإداري ولا أي سر في `config.js` (الملف عام).
15. نتيجة `save*` للمنتجات قد تكون `false`: لا تعلن نجاحاً قبل `await Store.whenProductsSaved()`.
16. شغّل `node tests/run-tests.js` بعد أي تعديل في `store.js`/`app.js`، و`node tests/boot-tests.js` بعد أي تعديل في `boot.js`/`config.js`.
17. **أي تعديل على الأقسام/الإعلانات/الإعدادات من الأدمن** ← استدعِ `bumpMetaVersion()` بعده (القسم 7)، وإلا لن يصل للزوار.
18. **لوحة الأدمن:** لا ترسم قوائم كاملة بلا تقسيم (صفحات/«عرض المزيد»)، ولا تضع `onclick` في كل صف بل مستمعاً واحداً، ولا تربط `render` بحدث `input` مباشرة (استعمل debounce)، وحرّك العناصر بـ `transform` لا بـ `left/right/width` (القسم 20).
19. ارفع `?v=` **بنفس الرقم في كل صفحات HTML** (القسم 1) بالأمر `node tools/set-version.js N`؛ أرقام مختلفة بين الصفحات تُهدر الكاش.
20. **كل قيمة خاصة بمتجر (اسم، شعار، رابط، مفتاح خدمة، معرّف تحليلات، لون، خط، رقم هاتف، دومين، اسم مطوّر…) مكانها `js/config.js` حصراً.** ممنوع كتابتها في HTML أو CSS أو JS أو الاختبارات (باستثناء أمثلة `YOUR_...` في الدليل). عند اكتشاف قيمة كهذه منقولة في ملف آخر: انقلها إلى `config.js` (و`config.template.js`) واستبدلها بقراءة من `STORE_CONFIG`.
21. **لا تلصق أكواد طرف ثالث** (Google Analytics، بكسل، خطوط، favicon، `preconnect`) داخل صفحات HTML؛ أضفها عبر `boot.js` مدفوعة بمفتاح في `config.js`. صفحات HTML تحمل فقط: `style.css` + `refresh.css` + `config.js` + `boot.js` في `<head>`.
22. **لا تعدّل `config.template.js` بقيم حقيقية أبداً** (فقط `YOUR_...`)، وحافظ على تطابق مفاتيحه مع `config.js` (يتحقق `check-config.js` من القالب عند نسخه فوق `config.js`).
23. شغّل `node tests/boot-tests.js` و`node tools/check-config.js` بعد أي تعديل على `boot.js` أو `config.js`.
24. **الذكاء الاصطناعي:** كل استدعاء لـ Groq/Gemini يمرّ عبر `window.StoreAI` ← `/api/ai` فقط (لا `fetch` لهذه الخدمات داخل `admin.js`، ولا مفاتيح في أي ملف يصل للمتصفح). ممنوع وضع مفاتيح حقيقية في أي رد أو ملف يُشارَك. أي أداة ذكاء اصطناعي تعدّل بيانات يجب أن تمرّ بخطوة **معاينة/تأكيد** قبل الكتابة (بطاقات المراجعة في الاستيراد، و`confirm` بعدد المنتجات الفعلي في التسعير) ولا تكتب مباشرة. وكل ناتج من النموذج يمرّ عبر `normalizeItems`/`normalizePricePlan` قبل الاستعمال.
25. **أي مسار جديد للاستيراد أو التعديل الجماعي** يستعمل `renderBatchReviewCards` + `ensureProductsWritable()` + `ensureFullCatalogForBulk()` + `Store.saveProducts`، ويستدعي `bumpMetaVersion()` إن أنشأ أقساماً.
26. **لا تثق بملخص النموذج:** الجملة التي تُعرض للمدير للتأكيد تُبنى من الخطة **المتحقَّق منها** (`describePlan`) لا من حقل `summary` الذي يكتبه النموذج (قد يناقض الفعل الحقيقي). وأي التباس (قسم غير موجود/ملتبس، قيمة صفرية، عملية مزدوجة) ← **خطأ صريح ولا تنفيذ**، لا تخمين.
27. **أي تعديل على `ai.js` أو خادم `/api/ai` أو أوامر التسعير/الاستيراد:** شغّل `node tests/ai-tests.js` وأضف اختباراً للسلوك الجديد. وغيّر النموذج بمتغيرات البيئة `GEMINI_MODEL`/`GROQ_MODEL` لا بتعديل الكود.
28. **`ADMIN_EMAILS` (بيئة Cloudflare) و`adminEmails` (config.js) مصدران منفصلان لنفس القائمة:** عند تغيير أدمن حدّثهما معاً.

---

## 14. استكشاف الأخطاء (عَرَض ← سبب ← حل)

| العَرَض | السبب المحتمل | الحل |
|---|---|---|
| تعديلي في الأقسام/الإعدادات/الإعلانات لا يظهر للزوار | لم يُرفع `ws_meta_v` (قاعدة الكتابة ناقصة أو `bumpMetaVersion` فشل)، أو الزائر تبويبه مخفي (الفحص كل 5 دقائق للتبويب الظاهر) | افحص Console في الأدمن عن `Failed to bump ws_meta_v`؛ أضف قاعدة `ws_meta_v` (القسم 9)؛ للاختبار امسح `ws_meta_v` من localStorage أو ارفع `dataVersion` + `?v=` |
| تغيّر السعر ولا يظهر في صفحة المنتج لزائر قديم | النسخة المحلية تُعرض أولاً ثم تُصحَّح من الخادم خلال لحظات | افتح الصفحة وانتظر ثانية؛ إن استمر فتحقق من Rules/الاتصال (Console) |
| `Firebase Authentication غير مهيأ` عند الدخول | `firebase-auth-compat` لم يُحمَّل قبل `store.js`، أو حقول `apiKey/authDomain/projectId/appId` ناقصة | صحّح ترتيب السكربتات أو أكمل `config.js` |
| `auth/invalid-credential` | إيميل/كلمة مرور خاطئة أو المستخدم غير موجود | أنشئ المستخدم في Authentication ← Users |
| الدخول ينجح لكن يعود إلى `login.html` | الإيميل غير موجود في `adminEmails` (مقارنة بأحرف صغيرة) | أضفه |
| `auth/unauthorized-domain` | الدومين غير مضاف | Authentication ← Settings ← Authorized domains |
| `PERMISSION_DENIED` في الـ Console | Rules لا تسمح (أو UID خاطئ أو المستخدم غير مسجّل دخول) | راجع القواعد (القسم 9) واختبرها بـ Rules Playground |
| تحذير `Using an unspecified index` وبطء التحميل | نقص `.indexOn` | أضف الحقول المذكورة في القسم 9 |
| الموقع فارغ ولا شيء في Firebase | `firebaseDatabaseURL` فارغ/خاطئ، أو DB لم تُنشأ، أو المنطقة تغيّر رابطها | صحّح الرابط (يجب أن يكون مطابقاً لما في لوحة Realtime Database) |
| لا تُرفع الصور / `فشل رفع الصورة` | مفتاح ImgBB خاطئ، أو ImgBB تحت الصيانة، أو لا اتصال | جرّب لاحقاً/بدّل المزود (القسم 8.4)؛ افحص Network tab لطلب `api.imgbb.com` |
| الصور تُرفع لكن لا تظهر (404 من ImageKit) | الـ origin ليس **Web Folder** بقاعدة `https://i.ibb.co`، أو `imageKitEndpoint` خاطئ، أو الـ origin غير مربوط بالـ endpoint | القسم 8.3 |
| الصور تظهر بحجم كبير/غير مضغوطة | رابط ImgBB خام (لم يُضبط `imageKitEndpoint`) أو الصورة قديمة بلا `tr:` | اضبط الـ endpoint وأعد رفع الصور |
| زر الطلب يقول "لم يتم إعداد رقم واتساب" | `ws_settings.whatsapp` فارغ | لوحة الأدمن ← الإعدادات |
| المنتج يظهر "غير متوفر" رغم وجود كمية | `available=false`، أو للمنتج ألوان/مقاسات ومخزون التركيبة المختارة 0 | افحص شبكة المخزون |
| زر "تحميل المزيد" لا يظهر/لا يعمل | `pagination.done=true` أو فشل الاستعلام (Rules/Index) | افحص Console |
| أقسام تظهر بدون منتجات أو عدّاد خاطئ في `categories.html` | العدّاد يعتمد على المنتجات المحمّلة محلياً فقط | سلوك معروف (القسم 15) |
| منتجاتي اختفت/تراجعت بعد حفظ من الأدمن | الكتابة تستبدل المصفوفة كاملة (last-write-wins): جهازان أدمن في نفس الوقت | لا تعدّل من جهازين معاً؛ حدّث الصفحة قبل التعديل (الكاش الجزئي لم يعد يُكتب: `canWriteProducts`) |
| رسالة "لم يكتمل تحميل المنتجات... أُوقف الحفظ" في الأدمن | فشل تحميل كل المنتجات من Firebase (اتصال/Rules/فهرس) | حدّث الصفحة؛ افحص Console وقواعد القراءة لـ `ws_products` |
| رسالة "لم يُحفظ المنتج على الخادم" | رُفضت الكتابة (`PERMISSION_DENIED` أو انقطاع) | افحص تسجيل الدخول/UID في Rules/الاتصال ثم أعد المحاولة |
| نافذة تطلب مفتاح Algolia في الأدمن | `useAlgolia:true` و`algoliaAdminKey` غير موجود في `config.js` (أمان) | أدخل المفتاح لهذه الجلسة، أو إلغاء لتخطي المزامنة، أو اجعل `useAlgolia:false` |
| منتج نفد/تغيّر سعره ولا يظهر في المتجر | الزائر لم يفحص `ws_index/v` بعد (≤5 دقائق والتبويب ظاهر)، أو **لم يُحفَظ الفهرس** مع المنتجات (قاعدة `ws_index` ناقصة فكتبت المنتجات وحدها) | تأكد من القاعدة (القسم 9) ثم احفظ أي منتج؛ للاختبار امسح `ws_index_checked` من localStorage |
| تنبيه في الأدمن "تعذّر إنشاء/قراءة فهرس المتجر ws_index" | قاعدة `ws_index` غير مضافة في Firebase Rules | أضفها (القسم 9/19) ثم حدّث لوحة الأدمن |
| الزائر يحمّل كل المنتجات (استهلاك مرتفع) وفي Console تحذير `ws_index غير موجود` | الفهرس لم يُبنَ بعد أو القراءة مرفوضة | افتح الأدمن مرة بعد إضافة القاعدة |
| الاستيراد من Excel لا يحدّث شيئاً | الباركود/الاسم لا يطابق، أو أسماء الأعمدة غير مدعومة، أو المنتج بألوان/مقاسات (لا تُحدَّث كميته)، أو السعر/الكمية فارغان | راجع التقرير بعد الاستيراد وأسماء الأعمدة (القسم 7) |
| الخطوط/الألوان تختلف بين الصفحات أو لا تتغير | صفحة لا تحمل `config.js` + `boot.js` في `<head>` (صفحة جديدة)، أو خطأ في `config.js` يوقف الملف (افتح Console: ابحث عن `[theme]`)، أو `?v=` قديم | ضع `<script src="js/config.js">` ثم `<script src="js/boot.js">` بعد روابط CSS في `<head>` كباقي الصفحات، ثم `node tools/check-config.js` و`node tools/set-version.js N` |
| الثيم لا يتغير رغم تعديل `config.js` | كاش المتصفح لـ `config.js` (الاستضافة)، أو لون غير صالح فتجاهله `boot.js`؛ أو اسم `preset` غير موجود في `themes.js` (يظهر تحذير `[theme] قالب غير معروف` ويُستخدم `navy-gold`)، أو `js/themes.js` غير محمَّل في `<head>` | تحقق من Console (`[theme] لون غير صالح…`) وصيغة `#RRGGBB`؛ `_headers` يجعل `/js/*` بلا كاش على Cloudflare/Netlify |
| يظهر `navy-gold` بدل الثيم المختار | اسم `theme.preset` غير مطابق لاسم في `js/themes.js` (خطأ إملائي)، أو `themes.js` قديم/غير محمَّل، أو معاينة `?theme=` عالقة في نفس التبويب (`sessionStorage`) | افتح Console: يظهر `[theme] الثيم «…» غير موجود… هل تقصد: …`؛ وعند فتح الملف محلياً (`file://`/localhost) يظهر شريط أحمر على الصفحة بنفس الرسالة. الأحرف الكبيرة والمسافات والشرطة السفلية تُصحَّح تلقائياً. اكتب `StoreBoot.activePreset` في Console لمعرفة الثيم المطبَّق، و`?theme=off` لإلغاء المعاينة العالقة، و`node tools/check-config.js` يعرض الأسماء الصحيحة |
| ألوان الأدمن/المتجر لا تتغير بعد تعديل CSS | الكاش: لم يُرفع `?v=` | ارفع الرقم في كل صفحة تحمّل الملف |
| استهلاك Firebase مرتفع: الزائر ينزّل الأقسام/الإعلانات عند كل فحص | `ws_meta_v` غير موجود أو غير مقروء (القاعدة ناقصة) فيعتبرها الكود «تغيّرت» دائماً | القسم 9: قاعدة `ws_meta_v` + احفظ أي قسم من الأدمن لإنشاء الرقم |
| «إعداد ناقص: أضف FIREBASE_API_KEY و ADMIN_EMAILS…» أو «GEMINI_API_KEY/GROQ_API_KEY غير مضبوط…» | متغيرات بيئة Cloudflare ناقصة | القسم 24.2 ثم **أعد النشر** (المتغيرات لا تُطبَّق على نشر قديم) |
| «يلزم تسجيل الدخول…» (401) أو «انتهت جلسة الدخول» | لم تسجّل دخولاً أو انتهى التوكن | أعد تسجيل الدخول من `login.html` |
| «هذا الحساب غير مصرّح…» (403) | إيميل الأدمن غير موجود في `ADMIN_EMAILS` (بيئة Cloudflare) | أضفه هناك (مصدر مستقل عن `adminEmails`) وأعد النشر |
| «خدمة /api/ai غير موجودة على هذه الاستضافة» (404/405) | المشروع ليس على Cloudflare Pages أو مجلد `functions/` لم يُنشر | انشر على Cloudflare Pages مع المجلد؛ الأدوات الذكية لا تعمل على استضافة ثابتة أخرى |
| «رفض Firebase الكتابة (PERMISSION_DENIED)…» عند حفظ منتجات/تسعير | قواعد Firebase ما زالت تحوي `ADMIN_UID` كما هي أو لا تطابق UID حساب الأدمن الذي سجّلت به | Firebase ← Authentication ← Users: انسخ **UID** حسابك، ثم Realtime Database ← Rules: استبدل `ADMIN_UID` به في كل المواضع ثم Publish. (قبل 2026-10-31 كان الكود يعلن «نجاح» كاذباً والمنتجات تبقى في كاش المتصفح فقط) |
| اسم لون يظهر ككود (`E07A5F`) بدرجة زرقاء في منتج محفوظ سابقاً | استيراد قبل 2026-11-01 | افتح المنتج: يتحول الاسم تلقائياً إلى عربي بدرجته (والمخزون يتبعه) ثم احفظ |
| «اسم لون أو مقاس يحوي رمزاً غير مسموح» | اسم يحوي `. $ # [ ] /` (مثل «1.5L») في بيانات قديمة | عدّل الاسم؛ الواجهة الجديدة تستبدله تلقائياً («1٫5L») |
| «النموذج … لا يدعم البحث في Google لحسابك» (`no_grounding`) | `GEMINI_ENRICH_MODEL` الافتراضي غير متاح لحسابك | عيّن `GEMINI_ENRICH_MODEL` بنموذج Gemini 3 يدعم البحث، أو `aiEnrich:false` لإيقاف الإثراء (الاستيراد يعمل بدونه) |
| شارة «لم يُعثر على المنتج في الإنترنت» | الاسم غامض/نادر أو لم تجد المصادر المنتج نفسه | اكتب الاسم أوضح (ماركة + نوع + حجم) أو أكمل البيانات يدوياً؛ هذا سلوك مقصود بدل التخمين |
| ⚠️ في نافذة المراجعة «فشلت الدفعة N من M» | خطأ مؤقت أو حد طلبات في دفعة من جدول كبير | أعد استيراد الملف (أو الصفوف المذكورة فقط)؛ لا تحفظ قبل مراجعة النقص |
| «ملف js/ai.js غير محمل أو لا يدعم …» | `ai.js` غير مُدرج في `admin.html` أو يأتي بعد `admin.js`، أو خطأ صياغة فيه | تأكد من `<script src="js/ai.js?v=…">` قبل `admin.js` وراجع Console |
| خطأ من المزوّد عن النموذج (404/400 «model») | النموذج الافتراضي غير متاح لحسابك أو سُحب (Qwen 3.8 على Groq موسوم Preview في وثائقه) | عيّن `GROQ_MODEL` أو `GEMINI_MODEL` في بيئة Cloudflare (القسم 24.2) دون تعديل الكود |
| الإكسل «ضاعف» الكميات أو لم يصفّر المخزون | الكمية في الإكسل صارت **واردة تُضاف للرصيد** (القسم 7) | لا تحمّل الملف نفسه مرتين؛ صحّح الرصيد من نافذة المنتج |
| أمر تسعير ذكي يرفض بـ «لم أجد قسماً مطابقاً…» | اسم القسم في الأمر لا يطابق أي قسم، أو ينطبق على أكثر من قسم | اكتب اسم القسم كما هو في المتجر. (منذ 2026-10-30 لا يُنفَّذ شيء عند الالتباس، وكان قبلها يطال كل المنتجات — القسم 15 بند 28) |
| لوحة الأدمن ثقيلة والقائمة الجانبية بالكاد تفتح عند الدخول لقسم المنتجات | كان الجدول يرسم كل المنتجات + صورها دفعة واحدة، وإعادة رسم كاملة مع كل حرف بحث، وتحريك القائمة بخاصية `right` | **أُصلح** (القسم 20). إن عاد البطء: افحص عدد صفوف `#productsTableBody` (يجب ≤ 40 + زر المزيد) |
| إشعار «تم تحديث الموقع» لا يظهر في الأدمن | عناصر `#updateModal` غير موجودة في `admin.html` | القسم 7 (إشعار «تم تحديث الموقع») |

---

## 15. مشاكل معروفة وقيود (حقائق من الكود الحالي بعد المراجعة)

**أمنية / تتطلب إجراءً منك**
1. 🔴 **مفتاح Algolia الإداري كان مكشوفاً في `config.js`** (يُحمَّل لكل زائر). أُزيل من الملف، لكن **المفتاح القديم يجب اعتباره مسرّباً: أنشئ مفتاحاً إدارياً جديداً من لوحة Algolia وألغِ القديم**، وإن كان الموقع منشوراً في مستودع عام فالمفتاح موجود في تاريخ Git أيضاً.
2. 🟠 مفتاح ImgBB ظاهر لأي زائر بالضرورة (موقع ثابت): يمكن استنزاف حصتك. استعمل مفتاحاً مخصصاً لكل عميل وبدّله إن تسرّب.
3. 🟠 `ws_orders` قابلة للإنشاء من أي زائر بلا حد معدّل: ممكن إغراقها بطلبات وهمية. القواعد المقترحة (القسم 9) تحدّ الحجم/النوع لا المعدل. الواجهة تعرض آخر 300 طلب فقط.
4. 🟠 **أسعار وإجماليات الطلب قادمة من المتصفح** (لا خادم وسيط) — تحقق منها عند التأكيد مع الزبون. الدفع غير مدمج.
5. 🟡 مكتبة **SheetJS 0.18.5** (jsDelivr) لها ثغرات معروفة (prototype pollution / ReDoS) عند فتح ملفات غير موثوقة. النسخ الأحدث تُوزَّع من `cdn.sheetjs.com` فقط (لم أستبدلها لأنني لم أستطع اختبار الرابط). الخطر محدود لأن الاستيراد للأدمن بملفاته.
6. 🟡 تحقق الأدمن في الواجهة (`adminEmails`) شكلي؛ الأمان الحقيقي = Rules + UID.

**وظيفية / تصميمية**
7. **كتابة المنتجات** أصبحت جزئية (عقدة لكل منتج، القسم 23)؛ جهازا أدمن يعدّلان منتجين مختلفين لا يتعارضان، وعلى المنتج نفسه آخر كاتب يفوز.
8. **خصم المخزون** يحدث عند تغيير الحالة من الأدمن (من المتصفح، بلا معاملات)، ولا **يُعاد** عند الإلغاء بعد التجهيز. القاعدة التجارية غير محددة في الكود فلم أضف إعادة المخزون.
9. **Algolia (اختياري، `useAlgolia:true`):** المزامنة تحدث للمنتجات المعدَّلة فقط؛ **ملء فهرس Algolia للكتالوج الموجود يدوي**، وإلا ستظهر القائمة ناقصة. الترتيب بالاسم غير مدعوم فيه. مفتاحه الإداري لا يُوضع في `config.js`.
10. **الفهرس الخفيف:** يُنزَّل كاملاً للزائر الجديد فقط (≈ 1.6MB خام لكل 10,000 منتج؛ يقلّ كثيراً مع ضغط gzip)، ثم يصله **التغيير فقط** (مزامنة تفاضلية بحقل `u`). إن فشلت كتابة `ws_index` مع المنتجات يبقى الفهرس قديماً بصمت (يظهر خطأ في Console فقط). `ws_index` يُكتب من متصفح الأدمن؛ جهازان أدمن بنسختين مختلفتين قد يستبدلان بعضهما (last-write-wins).
11. `categories.html` عدّاد المنتجات في كل قسم يعتمد على المنتجات المحمّلة محلياً فقط (لم يُنقل إلى الفهرس الخفيف). البحث لا يشمل الوصف.
12. الاستيراد من Excel: لا يحدّث `inventory`، و`available` يُضبط `true` للمنتجات الموجودة التي كميتها > 0 (قد يُظهر منتجاً أخفاه الأدمن يدوياً) — **سلوك أبقيته كما كان؛ قرّر إن كنت تريد غيره**.
13. بطاقة المنتج مكررة في `products.js` و`index.html` (عدّل الاثنين).
14. `CODE_ADS` غير معرّف (خطاف اختياري). `iconSvg("image")` غير موجود في `ICONS` (يعرض `box`).
15. ~~`--font-display` يذكر IBM Plex Sans Arabic غير المحمَّل~~ ← **حُلّت (2026-10-21):** الخط من `config.theme.fontFamily` وهو الذي يُحمَّل فعلاً.
16. ~~`og:url`/`og:image`/`preconnect` ثابتة في `index.html`~~ ← **حُلّت (2026-10-21):** صارت من `config.siteUrl` و`config.logo` و`firebaseDatabaseURL`. بقي قيد: وسوم `og:*` تُملأ بالجافاسكربت فلا تظهر في معاينات واتساب/فيسبوك (القسم 18-ب).
17. `localStorage` محدود (~5MB): الكتالوجات الكبيرة قد تُحفظ في الذاكرة فقط لتلك الجلسة (يعاد تحميلها في الزيارة التالية).
18. أسماء المتغيرات القديمة (`--olive-*` ...) باقية كاختصارات للتوافق (انظر 5-ب).
21. **بقايا غير مستخدمة:** `algoliaThreshold` في `config.js`؛ دوال `getProductsCount/isProductsCountStale/fetchRemoteProductsCount`؛ مفتاح `ws_mini_index` في `seedIfNeeded`؛ `getMiniIndex` (اسم قديم). لا تؤذي لكنها قد تضلّل — احذفها عند التنظيف.
22. ✅ (حُلّت) `algoliaAdminKey` في `config.js` الحالي فارغ الآن. (إن سبق نشره قبل التفريغ فبدّله من لوحة Algolia.)
23. 🟡 **الفحص كل 5 دقائق:** كل تبويب ظاهر يرسل ≈0.4 طلب/دقيقة لـ Firebase حتى بلا تغيير (صغيرة جداً). كان الدليل يذكر 20 ثانية خطأً. لمتاجر كثيرة الزوار يمكن رفع الفواصل (القسم 12).
24. 🟡 نافذة «تم تحديث الموقع» غير موجودة في `admin.html` (الكود فقط) — القسم 7.
25. ✅ (حُلّت 2026-10-21) كانت `og:url`/`og:image` تشير لنطاق عميل آخر و`preconnect` يحمل عنوان Firebase مضمّناً؛ الآن كلها من `config.js`.
26. 🟡 بقايا إضافية: `META_CACHE_MS` (تستعمله دوال العدّاد غير المستخدمة فقط) و`REFRESH_MS` غير مستعمل، وعناوين الاختبارات تذكر «30 دقيقة».
27. ✅ **(أُصلح 2026-10-30)** مفاتيح الذكاء الاصطناعي لم تعد في `config.js` ولا في أي ملف يصل للمتصفح؛ هي في متغيرات بيئة Cloudflare، و`/api/ai` يرفض غير الأدمن (401/403). **إن كانت نسخة أقدم من المشروع نُشرت وفيها `geminiApiKey`/`groqApiKey` فبدّل المفتاحين من لوحة Google AI Studio وGroq** (المفتاح المنشور يبقى مكشوفاً في تاريخ الملفات).
28. ✅ **(أُصلح 2026-10-30)** أمر التسعير الذكي لا يُنفَّذ إن لم يطابق القسم أي قسم أو التبس؛ يشمل الأقسام الفرعية؛ والمعاينة تعرض عدد المنتجات الفعلي ومثالاً قبل التأكيد، والملخص مبني من الخطة المتحقَّق منها (القسم 24.6).
29. 🟠 **تغيّر سلوك الكمية في الإكسل:** صارت تُضاف للرصيد (القسم 7). و`maxExcelImportCount` في `config.js` بلا أثر. (و«الكمية الفارغة = 1» قد تضيف وحدة لكل صف بلا عمود كمية.)
30. ✅ **(أُصلح 2026-10-30)** فشل رفع ImgBB لم يعد يحفظ الصورة base64 داخل المنتج؛ يُحفظ المنتج بلا صورة مع تنبيه بالعدد.
31. 🟡 **حدود أدوات الذكاء الاصطناعي المتبقية:** (أ) دقة القراءة تعتمد على جودة الصورة/الخط (الخط اليدوي والصور المائلة أو المعتمة أقل دقة) — **بطاقة المراجعة هي خط الدفاع الأخير فاقرأها**؛ (ب) قد يخطئ النموذج في الاسم الإنجليزي أو القسم؛ (ج) صور HEIC خارج سفاري تُرسل كما هي إن كانت صغيرة؛ (د) حدود الطلبات عند المزوّد (429) تُعرض برسالة وتُعاد المحاولة مرة واحدة؛ (هـ) مسح الرف `scanShelf` غير موصول بأي واجهة؛ (و) الحد الأقصى 1000 منتج في عملية استيراد واحدة وPDF بحد 12MB.
32. ✅ **(لم يعد مشكلة 2026-10-30)** `config.template.js` لا يحتاج مفاتيح ذكاء اصطناعي لأنها خرجت من `config.js` أصلاً (القسم 24.2).
33. ✅ **(أُصلح 2026-10-30)** اختبار `boot-tests.js` «preconnect لـ Firebase و ImageKit» يحدّد عنوان القاعدة داخل الاختبار نفسه فلا يتأثر بتغيّر `config.js` (النتيجة الآن 27 نجح / 0 فشل).
34. 🟡 **نظافة الحزمة:** الأرشيف المرفوع يحوي `tests/test3-main/` (نسخة كاملة قديمة من المشروع) و`tests/test3-main-updated (13).zip` وملف `cosmetics_10000_products.json` (≈10.8MB)؛ لا تنشرها، وملف `_headers` الموصوف في القسم 1 لم يكن ضمن الأرشيف المرفوع.
35. **السعر القديم موجود الآن:** حقل `oldPrice` في المنتج (يظهر مشطوباً بجانب السعر فقط عند `isOffer` و`oldPrice > price`). الإدخال من نافذة المنتج في الأدمن، والعرض عبر `priceHtml`.
36. لم أستطع **تشغيل المتصفح أو Firebase أو Cloudflare أو Algolia أو ImgBB أو Groq/Gemini** في بيئة المراجعة (لا شبكة للتطبيق نفسه): سلوك الواجهة والخدمات الخارجية لم يُختبر حياً؛ خادم `/api/ai` اختُبر بـ `fetch` وهمي فقط (انظر القسم 18).
37. 🟡 **`ADMIN_EMAILS` مصدر ثانٍ للأدمن:** الخادم يتحقق من الإيميل في متغير بيئة Cloudflare بينما الواجهة تتحقق من `adminEmails` في `config.js`؛ نسيان تحديث أحدهما يعطي 403 من `/api/ai` رغم نجاح الدخول (القاعدة 28).
38. 🟡 **لا تحديد معدّل خاص بنا على `/api/ai`:** الحماية = الأدمن فقط + حدود الحجم + حد المزوّد. أدمن واحد يضغط بشكل متكرر قد يستهلك الحصة المجانية؛ راقب لوحة Google/Groq.
39. 🟡 **التحقق من الدخول يستدعي Google في كل طلب** (`accounts:lookup`) — زمن إضافي صغير (~100–300ms) ولا يُخزَّن.

---

## 16. ملحق: مرجع سريع للدوال حسب الملف (مستخرج من الكود الفعلي)

**store.js (دوال عامة):** `parseJSON, memoParse, uid, buildCartItemKey, takeEarly, productQuery, restGet, firebaseValueToArray, compareKeys, entriesFromValue, buildPage, wholeProductsEntries, matchEntries, matchAll, syncNodeToFirebase, fetchNode, fetchProductsByFieldFromFirebase, fetchProductsPageByCategoryFromFirebase, fetchProductsPageByCategoriesFromFirebase, fetchProductsPageByFieldFromFirebase, fetchProductsPageFromFirebase, fetchProductByIdFromFirebase, fetchAllProductsFromFirebase, pullFromFirebase, _pullFromFirebase, emitStoreEvent, seedIfNeeded, inventoryKey, sumInventory, dedupe, totalStockOf, writeProductsLocal(list, isFullSnapshot), normalizeSearch, buildIndexRecord, buildIndexPayload, hydrateIndexRecord, storeIndexLocal, syncProductsAndIndex, pruneStaleCaches, postOrderRest, queuePendingOrder, flushPendingOrders`

**كائن `Store`:** `getProductsCount, isProductsCountStale, fetchRemoteProductsCount, getIndexItems, getMiniIndex, hasIndexLocal, ensureIndexFresh, rebuildIndex, getCategories, saveCategories, addCategory, updateCategory, deleteCategory, getCategoryName, getProducts, canWriteProducts, whenProductsSaved, saveProducts, getProduct, updateProduct, deleteProduct, _removeFromLocalCache, getFieldCache, setFieldCache, loadProductsByField, loadProductsPageByCategory, loadProductsPageByCategories, loadProductsPageByField, loadProductsPage, _localPage, _cacheLoadedProducts, loadProductsByCategory, loadProductById, loadAllProductsFromFirebase, ensureAllProductsFresh, addProduct, hasVariantMatrix, getTotalStock, getVariantStock, isProductAvailable, getSettings, saveSettings, getAds, saveAds, addAd, deleteAd, getCart, saveCart, addToCart, setQty, removeFromCart, clearCart, cartCount, getOrders, loadOrdersFromFirebase, logOrder, login, isLoggedIn, logout`

**app.js:** `escapeHtml, safeUrl, jsStr, getIkUrl, initProgressiveImages, initSidebarDOM, renderHeader, renderSidebarNav, toggleSidebar, toggleSubmenu, initGlobalSearch, renderFooter, initMobileNav, updateCartBadge, showToast, initBackToTop, refreshChrome, bootChrome`

**products.js:** `productMediaHtml, renderSkeletonCards, productHasOptions, renderProductCard, quickAddToCart, renderGridInto, setupScrollPreservation, restoreShopScrollPosition, resetShopPagination, showShopLoading, ensureShopPaginationUI, queryProductsUnified, queryAlgoliaDirect, categoryIdsWithChildren, buildShopList, queryFallbackStore, fetchNextShopBatch, renderShopResults, loadNextShopPage, initShopPage, updateCategory, renderCategoryFilterPanel, initHomeCollections (غير مستخدمة في index), productNotFoundHtml, productDetailSignature, refreshDetailCategoryLabels, initProductDetailPage, renderProductDetail`

**cart.js:** `cartLineMediaUrl, cartLineVariantLabel, cartLineHtml, cartMissingLineHtml, renderCartPage, stepCartQty, setCartQty, removeCartLine, initCartPage`

**whatsapp.js:** `formatPrice, priceHtml, safeMapUrl, whatsappDigitsOnly, showDeliveryModal, variantLineText, getOrderableCartLines, isWhatsAppConfigured, buildProductWhatsAppLink, buildCartWhatsAppLink, buildWhatsAppUrl, orderSingleProductViaWhatsApp, orderCartViaWhatsApp`

**auth.js:** `isAllowedAdminEmail, initAdminAuthGuard, initLoginPage, requireAdminAuth, handleAdminLogout`

**admin.js:** `bumpMetaVersion, initAdminPage, showUpdateNotice, showAdminBanner, ensureProductsWritable, algoliaConfigured, getAlgoliaAdminKey, requestAlgoliaAdminKey, syncProductsToAlgolia, deleteProductFromAlgolia, wireExcelSync, wireAiPricing, renderBatchReviewCards, wireSmartMediaScanner, handleExcelFileWithAI, processAndOpenBatchReview, matchCategory, getColorHex, cleanNameForMatch, fastAddCategory, refreshAllBatchCategorySelects, showProcessLoader, hideProcessLoader, dataURLtoBlob, uploadToImgBB, wireSidebarNav, toggleAdminSidebar, renderStats, adminProductMatches, adminProductRowHtml, renderProductsTable, wireProductsTableEvents, deleteProductConfirm, populateCategorySelect, currentSizesFromInput, renderColorsList, removeColorRow, inventoryKeyFor, renderInventoryGrid, updateComputedStock, wireProductModal, removeExtraImage, openProductModal, closeProductModal, saveProductForm, renderCategoriesTable, deleteCategoryConfirm, populateIconPicker, syncIconPickerActive, wireCategoryModal, openCategoryModal, closeCategoryModal, saveCategoryForm, renderAdsTable, deleteAdConfirm, wireAdModal, openAdModal, closeAdModal, saveAdForm, orderInventoryKey, changeOrderStatus, updateOrderInFirebase, renderOrdersTable, fillSettingsForm, wireSettingsForm`

**ai.js:** `StoreAI` (يُصدَّر على `window.StoreAI` وعلى `module.exports` للاختبارات): `generateDescription(productName, categoryName)` · `parsePriceCommand(commandText, categoryNames)` · `scanInvoice(inputData, mimeType, storeCategories, opts)` ← `{items, warnings}` · `scanShelf(base64, mime)` (غير موصولة) · `prepareImage(file)` · `preparePdf(file)` · `normalizeItems` · `normalizePricePlan` · `toNumber` · `splitCsvRows` · `cleanDescription` · `normKey` — داخلياً: `callServerApi, getIdToken, buildInvoicePrompt, resolveCategoryName, describePlan`. **`functions/api/ai.js`:** `onRequestPost` · `requireAdmin` · `geminiVision` · `groqChat` · `extractJson` · `salvageJson` · `stripThinking`. **`admin.js` (الذكاء الاصطناعي):** `wireAiPricing` · `wireSmartMediaScanner` · `wireExcelSync` · `handleExcelFileWithAI` · `processAndOpenBatchReview(rawItems, title, warnings)` · `renderBatchReviewCards` · `matchCategory` · `cleanColorName` · `isTransparentOrInvalidColor`.

**أحداث مخصصة:** `store:synced` (اكتمل سحب الأقسام/الإعدادات/الإعلانات) · `store:sync-error` · `cart:updated` · `admin:auth-ready`.

---

## 17. قالب طلب مساعدة (انسخه عند التواصل مع أي ذكاء اصطناعي)

```
أرفقت لك STORE_AI_GUIDE.md وهو يصف مشروعي كاملاً. 
المطلوب: [وصف التعديل أو المشكلة]
الصفحة/الملف المتأثر (إن عرفته): [..]
رسالة الخطأ من Console (إن وجدت): [..]
أعطني: اسم الملف + الدالة + الكود الكامل بعد التعديل + هل أحتاج رفع dataVersion أو تعديل Firebase Rules.
لا تطلب مني بقية الملفات إلا إذا كان الدليل لا يكفي، وحدّد بالضبط أي دالة تريد رؤيتها.
```

## 18. سجلّ المراجعة (Audit) — ما أُصلح وما تم التحقق منه

**أُصلح (كلها في الملفات الحالية):**

| # | المشكلة | الملف |
|---|---|---|
| 1 | 🔴 **XSS مخزَّن عبر الطلبات:** أي زائر يكتب طلباً بمعرّف/كمية خبيثة فيُنفَّذ كوده في جلسة الأدمن عند فتح الطلبات (`onclick` و`it.qty` بلا تهريب) | `admin.js` |
| 2 | 🔴 مفتاح Algolia الإداري مكشوف في `config.js` ← صار يُطلب في الأدمن لكل جلسة (`sessionStorage`) | `config.js`, `admin.js` |
| 3 | تهريب كل القيم الديناميكية في جداول الأدمن (صور، معرّفات، ألوان، خيارات القسم، روابط الإعلانات بـ `safeUrl`) | `admin.js` |
| 4 | XSS في `deliveryInfo` بصفحة السلة | `cart.js` |
| 5 | `safeUrl` كان يُخدَع بـ `java\nscript:` | `app.js` |
| 6 | 🔴 **خطر فقدان الكتالوج:** `loadAllProductsFromFirebase` كانت تعيد كتابة كل المنتجات إلى Firebase بعد كل قراءة (كل فتح للأدمن)، والحفظ بكاش جزئي يستبدل القاعدة ← الآن محلي فقط + `canWriteProducts` | `store.js` |
| 7 | حذف منتج من الكاش (عند اكتشاف حذفه من الخادم) كان يمر عبر `saveProducts` ← `_removeFromLocalCache` | `store.js` |
| 8 | نجاح كاذب: كل حفظ/حذف/استيراد/تغيير حالة طلب كان يعلن النجاح حتى لو فشلت الكتابة ← تُنتظر النتيجة وتُعرض الأخطاء | `store.js`, `admin.js` |
| 9 | الفهرس المصغر كان يحوّل المخزون 0 إلى 1 (`stock \|\| 1`) فتظهر المنتجات النافدة كمتاحة ← مخزون حقيقي؛ منتجات الألوان تعتمد `inventory` | `store.js` |
| 10 | `productsCount` كان يُستبدل بعدد المنتجات **المحمّلة** فيُعتبر إجمالي المتجر (تحويل Algolia خاطئ/قائمة ناقصة) ← يُكتب فقط من لقطة كاملة أو `shallow` | `store.js` |
| 11 | قائمة المتجر لا تُحدَّث أبداً لزائر عائد (كاتالوج >24) ← تحديث دوري (`ensureAllProductsFresh`، وصار لاحقاً عبر `ensureIndexFresh` كل 30 دقيقة) + فحص العدد بـ TTL بدل طلب شبكة في كل صفحة | `store.js`, `products.js` |
| 12 | الترتيب بالاسم لا يعمل في المتجر | `products.js` |
| 13 | صفحة المنتج تعرض سعراً/مخزوناً قديماً ← تحقق خلفي من الخادم وإعادة رسم | `products.js` |
| 14 | كمية يدوية أكبر من المخزون (أو كسرية) تُرسل في الطلب ← تُقيَّد | `products.js` |
| 15 | `.src` كان يُهرَّب بـ `escapeHtml` فتنكسر الروابط التي فيها `&` | `products.js` |
| 16 | إعادة رسم صفحة المنتج عند `store:synced` تمسح اختيار الزائر وتكرّر مستمع النقر ← تحديث اسم القسم فقط | `products.js` |
| 17 | `addToCart` يسمح بإضافة منتج نفد؛ و`available` المفقود كان يعني "غير متاح" في السلة/واتساب | `store.js`, `cart.js`, `whatsapp.js` |
| 18 | التحقق اللحظي من هاتف التوصيل معطّل (عناصر مفصولة بعد `cloneNode`) | `whatsapp.js` |
| 19 | استيراد Excel: سعر 0 يُكتب فوق السعر عند غياب العمود، `1,500` تُقرأ 1، المنتج الذي كميته 0 لا يُصفَّر، تعارض `stock/inventory` للمنتجات ذات الخيارات | `admin.js` |
| 20 | حذف قسم رئيسي يترك فرعياته يتيمة (تختفي مع منتجاتها) ← ممنوع؛ ومنع جعل قسم له فرعيات فرعياً | `admin.js` |
| 21 | خصم المخزون: كتابة كاملة لكل بند، بند ناقص يُتجاوز بصمت، `order.items` ناقص يكسر الدالة ← كتابة واحدة + تقرير بالبنود | `admin.js` |
| 22 | مراقبة هشّة: `renderOrdersTable` كانت تُعاد كتابتها من سكربت في `admin.html` ← الدالة تكتب في الجدولين مباشرة وتحدّ العرض بـ 300 | `admin.js`, `admin.html` |
| 23 | نص `__ICON_WHATSAPP__` يومض في زر السلة قبل تحميل JS | `cart.html` |
| 24 | خط Cairo يُحمَّل ولا يُستخدم؛ وسوم `viewport` مكررة في 4 صفحات | `*.html` |
| 25 | أصناف تحميل بلا CSS (`skeleton-line/chip`, `img-fade`, `load-error`) — أُضيف تنسيق shimmer يحترم `prefers-reduced-motion` | `css/style.css` |
| 26 | أُضيفت اختبارات `tests/run-tests.js` (اليوم 16 اختباراً) ورُفع `?v=` (إلى 61 ثم 62 في كل الصفحات) | — |
| 27 | **تحديث لاحق (مطابق للنسخة الحالية):** نظام الفهرس الخفيف `ws_index` يحل محل الفهرس المصغر المحلي وتحويل Algolia عند 2000؛ Algolia صار اختيارياً بـ `useAlgolia`؛ كاش 30 دقيقة؛ البحث العام على الفهرس؛ فلتر القسم يشمل فرعياته | `store.js`, `products.js`, `app.js`, `admin.js`, `config.js` |
| 28 | 🟠 **بطء لوحة الأدمن في قسم المنتجات** (القائمة الجانبية بالكاد تفتح والموقع يتقطّع): جدول يرسم كل المنتجات مع صورها دفعة واحدة + إعادة رسم كاملة مع كل حرف بحث + تحريك القائمة الجانبية بـ `right` ← تقسيم لصفحات (40) + debounce + مستمع واحد + صور lazy مصغّرة + `transform` للقائمة (القسم 20) | `admin.js`, `css/style.css` |
| 29 | توحيد `?v=` إلى 73 في كل الصفحات (كانت 68/69/70/71 متفرقة فيُهدَر الكاش) | `*.html` |
| 30 | عرض منتجات الطلب في جدول الأدمن كان بلا تنسيق (نقاط قائمة، `1×` ملتصقة بالاسم، التفاف سيئ) ← شارة `×N` + اسم عريض + خيارات خفيفة؛ ورُفع `?v=` إلى 73 | `admin.js`, `css/style.css`, `*.html` |
| 31 | **احتياطي ImageKit ← ImgBB (القسم 21)** + توحيد `?v=` إلى 76 (كان 73/74/75) + اختبار جديد (اليوم 20 اختباراً) | `app.js`, `*.html`, `tests/run-tests.js` |
| 32 | الصورة البديلة صارت SVG مضمّنة `window.IMG_PLACEHOLDER` (في `app.js`) بدل `placehold.co` الخارجي؛ و`?v=` إلى 77 | `app.js`, `products.js`, `index.html`, `*.html` |
| 33 | **تحديث 2026-10-30 (مراجعة الدليل مقابل الكود):** أُضيف `js/ai.js` وأدوات الذكاء الاصطناعي ونافذة المعاينة الموحّدة وتغيّر سلوك الإكسل (+ للرصيد)؛ `?v=` صار 85؛ صُحّحت فترة الفحص إلى 5 دقائق (كانت 20 ثانية في الدليل فقط)؛ أُضيف `tools/load-test.js` و`tests/scale-tests.js` للدليل. **ما تحقق فعلاً:** `node tests/run-tests.js` ← 21 نجح/0 فشل، `tests/scale-tests.js` ← 32/0، `tests/boot-tests.js` ← 26 نجح/1 فشل (القسم 15 بند 33)، `tools/check-config.js` ← 0 أخطاء و4 تحذيرات (`storeName` تجريبي، `whatsappNumber` فارغ، `adminEmails` تجريبي، `siteUrl` فارغ). **لم يُختبر:** تشغيل الأدمن في متصفح، Groq/Gemini، Firebase، `tools/load-test.js` (لا شبكة). | `admin.js`, `admin.html`, `ai.js`, `config.js` |
| 34 | **2026-10-30 — مراجعة وإصلاح الذكاء الاصطناعي:** (1) `functions/api/ai.js` مقصور على الأدمن (Firebase ID Token + `ADMIN_EMAILS`) بعد أن كان مفتوحاً لأي زائر يستهلك رصيد المفاتيح؛ حدود حجم/نوع؛ مفتاح Gemini في ترويسة لا في الرابط؛ (2) Qwen 3.8: `reasoning_effort:"none"` (وضع التفكير الافتراضي كان يستهلك `max_tokens:1500` فيُقطع الرد أو يخرج فارغاً/ملوثاً بـ`<think>`) + إزالة `<think>` + استخراج JSON وإنقاذ المقطوع؛ (3) Gemini: `temperature 0` و`maxOutputTokens` وكشف القطع (`partial`)؛ (4) `js/ai.js` أُعيدت كتابته: تنظيف كل ناتج وأرقام عربية، دمج المكرر، تقطيع الجداول (40 صفاً/دفعة) وقراءة **كل** أوراق الإكسل (كانت الأولى فقط)، تصغير الصور، موجّهات أدق تمنع اختراع الأسعار/الباركود/الأسماء، تحقق صارم من خطة التسعير؛ (5) `admin.js`: معاينة التسعير بالعدد الفعلي والأقسام الفرعية، فحص نتيجة الحفظ، منع الضغط المزدوج، عدم حفظ `data:` URL، توزيع المخزون بلا تضخيم، `matchCategory`، إصلاح `cleanColorName` (`\b` لا يعمل مع العربية)؛ (6) `tests/ai-tests.js` (18) وإصلاح اختبار boot؛ (7) `?v=` ← 86 و`assetVersion` في `config.template.js` (كان 77) | `functions/api/ai.js`, `js/ai.js`, `js/admin.js`, `tests/ai-tests.js`, `tests/boot-tests.js`, `js/config.template.js`, `*.html` |

| 35 | **2026-10-31 — تعليق شاشة «جارٍ حفظ البيانات» عند الاستيراد مع صور:** مسار الصور كان نفسه (`uploadToImgBB` ← ImgBB ← رابط ImageKit يُكتب في Firebase) لكن بلا مهلة فيعلّق للأبد عند بطء الشبكة، والصور الكبيرة تُرفع كاملة أو تُرفض (>4MB). الإصلاح داخل `uploadToImgBB` نفسها فيستفيد منه كل مسار (منتج مفرد، لون، قسم، إعلان، استيراد): تصغير تلقائي `compressImageForUpload` (≤1600px، البانر 2000، JPEG 0.85)، مهلة 45 ثانية + محاولة ثانية؛ والحفظ الجماعي يرفع 3 صور بالتوازي مع عدّاد «رفع الصور N من M»، ومهلة 90 ثانية لكتابة Firebase، وصور بطاقة المراجعة تُصغَّر عند اختيارها. الروابط الخارجية http(s) (من الملف أو «🔗 رابط») تُحفظ كما هي ولا تُرفع إلى ImgBB. `?v=` ← 87 | `js/admin.js`, `*.html` |

| 36 | **2026-10-31 — دمج الرفع الفوري في بطاقات المراجعة:** اختيار صورة (📁 رفع) في بطاقة يرفعها فوراً عبر `uploadToImgBB` (تصغير + مهلة + إعادة محاولة) ويكتب رابط ImageKit في `data-crop`؛ والبطاقة تحمل `data-uploading="1"` أثناء الرفع و«حفظ» يرفض حتى تنتهي. `?v=` ← 88 | `js/admin.js`, `*.html` |

| 37 | **2026-10-31 — تحسينات الذكاء الاصطناعي:** (1) زر «تراجع عن آخر تسعير» بلقطة قبل/بعد تحمي التعديلات اليدوية اللاحقة؛ (2) مخطط JSON (`responseJsonSchema` لـ Gemini و`json_schema` لـ Groq) مع رجوع تلقائي عند الرفض؛ (3) الأقسام تُرسل بمسار «الأب › الفرعي» و`matchCategory`/`resolveCategoryName` يعدّان التكرار التباساً؛ (4) مفتاحا `aiEnabled` و`aiBilingualNames` في `config.js` و`config.template.js` و`applyAiAvailability`؛ (5) 7 اختبارات جديدة (المجموع 25) وتجربة الخادم بمخطط مرفوض؛ `?v=` ← 89 | `functions/api/ai.js`, `js/ai.js`, `js/admin.js`, `admin.html`, `js/config.js`, `js/config.template.js`, `tests/ai-tests.js` |

| 38 | **2026-10-31 — إثراء المنتجات من الإنترنت (⚠️ صور البحث وزر الإكمال أُلغيا في الصف 39):** `gemini_search` (Gemini + Google Search + مخطط، نموذج `GEMINI_ENRICH_MODEL`) و`resolve_image` (اختيار صورة المنتج من صفحات المصادر بأمان SSRF) في `functions/api/ai.js`؛ `enrichItems`/`applyEnrichment`/`buildEnrichPrompt` في `js/ai.js`؛ `enrichAndOpen` و`wireCompleteMissing` و`enrichBadgesHtml` و`findExistingFor` في `js/admin.js`؛ `uploadToImgBB` يقبل رابطاً؛ زر `#btnCompleteMissing`؛ مفتاحا `aiEnrich` و`aiEnrichMax`؛ `tests/enrich-tests.js` (20) و`tests/browser-enrich.js` (7، Chrome حقيقي)؛ `?v=` ← 90 | `functions/api/ai.js`, `js/ai.js`, `js/admin.js`, `admin.html`, `js/config.js`, `js/config.template.js`, `tests/*` |

| 39 | **2026-10-31 — جودة الاستخراج + إلغاء الصور وإكمال الناقص (بطلب المالك):** (1) لقطة من الإنتاج أظهرت اسم المنتج في خانة الوصف و«10% + 1%» كمقاس وسيروم بشرة في «العناية بالشعر» ← موجّه استخراج جديد (التراكيز جزء من الاسم، الوصف من المصدر فقط، النوع ثم الماركة ثم الاقتراح، عبوة/رف) + حقلا `brand` و`productType` + مدققات `isNameEcho`/`isValidSize`/`isValidColor`؛ (2) وصف رسمي من البحث ثم **شرح إعلاني تلقائي** (`completeDescriptions`) لما بقي بلا وصف مع شارة `descKind`؛ (3) حذف `resolve_image` وزر `#btnCompleteMissing` و`wireCompleteMissing` وبحث الصور و`uploadToImgBB(url)`؛ (4) إصلاح سباق `hideProcessLoader` (الطبقة كانت تعود بعد الإخفاء وتبتلع النقرات)؛ (5) الاختبارات: `enrich-tests.js` (23) و`browser-enrich.js` (9)؛ `?v=` ← 91 | `js/ai.js`, `js/admin.js`, `functions/api/ai.js`, `admin.html`, `js/config*.js`, `tests/*` |

| 40 | **2026-10-31 — رسالة «تعذّر حفظ المنتجات على الخادم» بلا سبب:** (1) `Store` يسجّل سبب فشل الكتابة (`classifyWriteError` ← `PERMISSION`/`KEY`/`NETWORK`/`OTHER` + `NOT_READY`/`STRUCTURE`) ويكشفه بـ`Store.getLastWriteError()`؛ و`writeFailureMessage()` في `admin.js` تعرضه بنص عربي مفهوم في توستات الحفظ الجماعي والتسعير والتراجع وحفظ المنتج؛ (2) **اسم اللون/المقاس يصير مفتاحاً داخل `inventory`** (`لون||مقاس`) وFirebase يرفض أي مفتاح فيه `. $ # [ ] /` فيفشل **حفظ الدفعة كلها** (تحديث متعدد المسارات ذرّي)؛ لذلك `safeVariantName` (النقطة العشرية ← «٫» والباقي ← «-») داخل `cleanColorName` و`currentSizesFromInput` ومسار الاستيراد؛ (3) اختبارات: تصنيف الأخطاء، التعقيم، ورسالة الصلاحيات في المتصفح؛ وإصلاح اختبار المتصفح (كان `app.js` الحقيقي يستبدل `showToast` الوهمية فتصير فحوصات «لا أخطاء» بلا أثر)؛ `?v=` ← 92 | `js/store.js`, `js/admin.js`, `tests/*`, `*.html` |

| 41 | **2026-11-01 — ألوان الأكواد وإخفاء رسائل البحث:** (1) لقطة من الإنتاج: لون الملف `E07A5F` يُحفظ **اسماً** بدرجة زرقاء ← `parseHexColor`/`hexToColorName`/`splitColorEntry` في `ai.js`، `colorHex` في العناصر والبطاقة والحفظ، `getColorHex` يفهم الأكواد، `repairHexColorNames` لإصلاح المنتجات القديمة وعند مغادرة الحقل؛ (2) حذف رسالة «فشل إثراء N منتج…» (كانت تشير لزر أُلغي) وكل تحذيرات البحث/الأوصاف من الواجهة (Console فقط) وجملة التلميح من `admin.html`؛ (3) إعادة محاولة البحث حتى 3 مرات؛ (4) اختبارات: 7 جديدة في `ai-tests.js` (35)، واحد في `enrich-tests.js` (24)، 3 في `browser-enrich.js` (13) مع تجارب كسر مقصود؛ `?v=` ← 93 | `js/ai.js`, `js/admin.js`, `admin.html`, `tests/*`, `*.html` |

**التحقق الفعلي لتحديث 34:** `node --check` لكل ملفات `js/` و`tools/` و`tests/` و`functions/api/ai.js` (نجح)؛ `tests/run-tests.js` 21/0؛ `tests/boot-tests.js` 27/0؛ `tests/scale-tests.js` 32/0؛ `tests/ai-tests.js` 18/0؛ `tools/check-config.js` 0 أخطاء و4 تحذيرات (قيم تجريبية)؛ `tools/check-themes.js` سليم. اختُبر خادم `/api/ai` بـ `fetch` وهمي: رفض بلا توكن (401) ولغير الأدمن (403) ومع متغيرات ناقصة (500)، وإنقاذ JSON مقطوع، وإزالة `<think>`، ورفض MIME غير مدعوم. **لم يُختبر:** Cloudflare الفعلي، Gemini/Groq الحقيقيان (لا شبكة)، المتصفح (دوال `admin.js` المعتمدة على DOM فُحصت بالقراءة وفحص الصياغة). **جرّب يدوياً بعد النشر:** وصف منتج، أمر تسعير على قسم صغير، استيراد جدول صغير ثم كبير، وصورة فاتورة.

**التحقق الفعلي الذي نُفّذ:** `node --check` لكل ملفات `js/` والسكربتات المضمّنة في كل صفحات HTML (نجح)، فحص توازن أقواس CSS (نجح)، فحص وجود كل `id` تستخدمه `getElementById` وكل معالج `onclick/onchange` وكل ملف CSS/JS مُشار إليه (لا نقص)، و`node tests/run-tests.js` على النسخة الحالية (19/19 نجح) وفحص `node --check` للنسخة الحالية (نجح).

**ما لم يُتحقق منه (لا شبكة ولا متصفح):** تشغيل الصفحات فعلياً، Firebase (قراءة/كتابة/Rules/Auth)، Algolia، ImgBB/ImageKit، واتساب، رسوم CSS. دوال `admin.js` المعتمدة على DOM لم تُختبر آلياً (فُحصت بالقراءة وفحص الصياغة فقط). **جرّب يدوياً:** تسجيل دخول الأدمن، إضافة/تعديل/حذف منتج، استيراد Excel، تجهيز طلب، طلب من السلة، صفحة المنتج، المتجر مع البحث والترتيب.

**ملاحظة بيئة:** المشروع بلا `package.json` (لا build/lint/typecheck)، فلا توجد أوامر لها لتُشغَّل غير الاختبارات المضافة.

---

### 18-ب. توحيد الإعدادات في ملف واحد (2026-10-21)

| # | ما تغيّر | الملفات |
|---|---|---|
| 1 | **`config.js` صار مصدر كل ما يخص المتجر:** هوية + شعار + تواصل + Firebase + ImgBB + ImageKit + Google Analytics + Algolia + أدمن + **ثيم** + SEO + حقوق المطوّر. نسخة فارغة `config.template.js` | `js/config.js`, `js/config.template.js` |
| 2 | **محرّك `boot.js`** يطبّق الإعدادات: ثيم (15 ثيماً من `themes.js` + ألوان مخصصة + اشتقاق تلقائي للدرجات والتباين)، خط، favicon، `preconnect`، GA، رموز `{{...}}`، جلب مبكر | `js/boot.js` |
| 3 | **HTML:** حُذفت من الصفحات التسع كل الأكواد الثابتة (GA بمعرّف ثابت — وكان غائباً عن `product/categories/contact`، روابط favicon، `preconnect` بعنوان Firebase الثابت، روابط الخطوط، سكربت الجلب المبكر) وحلّ محلها `config.js` + `boot.js`. عناوين الصفحات ووسوم `og:*` صارت رموزاً `{{storeName}}`… | `*.html` |
| 4 | **CSS:** كل ما كان ثابتاً (`rgba(15,23,42,…)`, `rgba(37,99,235,…)`, `rgba(255,255,255,…)` فوق الأسطح الأساسية، `#B6C2D6`, `#CBD5E1`, `#94A3B8`, `#E0BA6E`, `color:#fff` فوق `--primary`) صار متغيرات يشتقها `boot.js`؛ فصار تغيير الثيم يشمل الهيرو والفوتر وشريط الأدمن | `css/style.css`, `css/refresh.css` |
| 5 | **JS:** `Store.getSettings()` تدمج قيم `config.js` كافتراضيات؛ سطر المطوّر في الفوتر من `config.credit` (كان اسماً ورقماً ثابتين في `app.js`)؛ الشعار من `config.logo`؛ ألوان مضمّنة في `admin.js`/`products.js`/`cart.js` صارت متغيرات | `store.js`, `app.js`, `admin.js`, `products.js`, `cart.js` |
| 6 | `algoliaAdminKey` فُرّغ في `config.js` (كان مفتاحاً إدارياً حقيقياً ظاهراً لكل زائر) و`useAlgolia:false` صريح | `js/config.js` |
| 7 | أدوات وفحوص: `tools/check-config.js`، `tools/set-version.js`، `tests/boot-tests.js` (14 اختباراً)، واختبار دمج الإعدادات في `run-tests.js` (إجمالي 21 + 14) | `tools/`, `tests/` |

**حدود معروفة:** (أ) وسوم `og:*` تُملأ بالجافاسكربت فلا تراها معاينات واتساب/فيسبوك. (ب) نصوص الهيرو والمزايا في `index.html` وصفحة `about.html` ما زالت نصوصاً تسويقية ثابتة (ليست إعدادات). (ج) `?v=` في روابط HTML يدوي لكن `set-version.js` يبدّله دفعة واحدة. (د) ألوان **بيانات المنتج** (`hex` لون المنتج) ليست جزءاً من الثيم.

---

## 19. الفهرس الخفيف `ws_index` (البنية، القواعد، التشغيل)

> ⚠️ **حُدِّث بالقسم 23:** الفهرس الآن سجلات مصغّرة في IndexedDB بمزامنة تفاضلية، و`ws_products` كائن مفتاحه المعرّف، وفحص كل 5 دقائق. التفاصيل أدناه تاريخية حيث تتعارض معه.

**الفكرة:** بدل تنزيل كل تفاصيل المنتجات لعرض المتجر والبحث، يحتفظ Firebase بعقدة صغيرة `ws_index` فيها سجل خفيف لكل منتج. الزائر يفحص رقمها فقط، وينزّلها مرة ثم يبحث ويفرز ويفلتر في المتصفح.

**البنية على Firebase:**
```
/ws_index
  v: 1760000000000            ← رقم النسخة (Date.now() عند آخر بناء/حفظ)
  items: [ { id, name, price, stock, categoryId?, image?, barcode?, available?:false, featured?, isOffer?, oldPrice? (يُكتب فقط عند isOffer وأكبر من price), isNew?, colors?:[{name,hex}], sizes?, vc? }, ... ]
```
- الحقول الاختيارية لا تُكتب إذا كانت فارغة/افتراضية (`available` تُكتب فقط عند `false`). `vc` = عدد الخيارات القديمة (variants).
- `stock` = المخزون الحقيقي الكلي (من `inventory` إن وُجدت ألوان/مقاسات).
- لا يحوي الوصف ولا الصور الإضافية ولا `inventory`؛ تفاصيل المنتج تُجلب بصفحته (`loadProductById`).

**الكتابة (الأدمن فقط):**
- `Store.saveProducts` تبني `buildIndexPayload` وتكتب `ws_products` + `ws_index` بتحديث ذرّي واحد (`syncProductsAndIndex` ← `database.ref().update`). إن فشل التحديث (قاعدة ناقصة) تكتب المنتجات وحدها.
- عند فتح لوحة الأدمن: `Store.rebuildIndex(false)` تبني الفهرس إن لم يكن موجوداً (مرة واحدة). `rebuildIndex(true)` تعيد بناءه بالقوة (من الكونسول: `Store.rebuildIndex(true)` بعد تحميل الأدمن).

**القراءة (الزائر):** `Store.ensureIndexFresh()`:
1. محلي + فُحص خلال آخر 5 دقائق (`INDEX_CHECK_MS`) ← لا شيء.
2. وإلا: `GET ws_index/v`. نفس النسخة ← تحديث وقت الفحص فقط. نسخة مختلفة ← `GET ws_index/items` وتخزين في `ws_index_items/ws_index_v/ws_index_checked` (وتنظيف `ws_products` المحلي إن زاد عن ~1MB).
3. `ws_index` غير موجود ← احتياط: تحميل كل المنتجات وبناء فهرس مؤقت في الذاكرة (يُسجَّل تحذير).

**خطوات التفعيل لمتجر جديد/قائم:**
1. أضف قاعدة `ws_index` في Firebase Rules (القسم 9) وانشرها.
2. افتح لوحة الأدمن مرة واحدة (يُبنى الفهرس تلقائياً) — أو احفظ أي منتج.
3. تحقق من Firebase Console: وجود `ws_index/v` و`ws_index/items`.
4. افتح المتجر في نافذة خاصة: يجب أن يظهر طلب شبكة لـ `ws_index/items` فقط (لا `ws_products` كاملة).

**التشخيص:**
- تنبيه الأدمن "تعذّر إنشاء/قراءة فهرس المتجر" ← القاعدة ناقصة أو لا صلاحية كتابة.
- تحذير Console `ws_index غير موجود على Firebase` عند الزائر ← الفهرس لم يُبنَ بعد.
- تعديل لا يظهر للزوار ← تأكد أن `ws_index/v` تغيّر بعد الحفظ (وإلا فالفهرس لم يُكتب)، ثم انتظر ≤5 دقائق (والتبويب ظاهر) أو امسح `ws_index_checked` للاختبار.
- تغيير بنية السجل (حقل جديد في الفهرس): عدّل `buildIndexRecord` و`hydrateIndexRecord` في `store.js`، ثم أعد البناء (`Store.rebuildIndex(true)`) وارفع `dataVersion` ليُمسح الفهرس المحلي القديم.

**الاختبارات:** `node tests/run-tests.js` تغطي: توحيد الحروف العربية، حجم الفهرس مقابل المنتجات الكاملة، زائر جديد (الفهرس فقط)، زائر عائد (صفر طلبات ثم فحص رقم)، وغياب الفهرس على الخادم.

---

## 20. أداء لوحة الأدمن (قسم المنتجات) — سبب البطء والإصلاح

**العَرَض:** بعد الدخول للوحة الأدمن والذهاب إلى «المنتجات» تثقل اللوحة، والقائمة الجانبية بالكاد تفتح وتغلق، والموقع يتقطّع. لا يحدث في الأقسام الأخرى.

**الأسباب (في `admin.js` و`style.css` قبل الإصلاح):**
1. `renderProductsTable()` كانت تبني `<tr>` **لكل** المنتجات وتكتبها في `innerHTML` مرة واحدة (مئات/آلاف الصفوف، كل صف بصورة وأزرار و`onclick`). تخطيط الجداول الكبيرة مكلف، وكل صورة تبدأ تحميلاً فوراً.
2. حقل البحث `#adminProductSearch` كان يستدعي `renderProductsTable` **مع كل حرف** (إعادة بناء كاملة).
3. القائمة الجانبية في الجوال/التابلت (`≤900px`) كانت تُحرَّك بتحويل خاصية `right` (`transition: right`) وهي تُجبر المتصفح على إعادة حساب التخطيط في كل إطار، وهذا يتضاعف ثمنه عندما تكون الصفحة ضخمة DOM.

**الإصلاح الحالي:**
- `admin.js`: ثابت `ADMIN_PRODUCTS_PAGE_SIZE = 40` + `adminProductsShown`؛ يُرسم أول 40 صفاً فقط مع صف «عرض المزيد (X من Y)» (زر `data-act="more"` يزيد 40). تغيّر نص البحث يعيد العدّ لـ 40، أما الحفظ/الحذف فيُبقيان عدد الصفوف الظاهرة.
- بحث مؤجَّل 250ms (`adminProductsSearchTimer`).
- مستمع نقر واحد على `#productsTableBody` (`wireProductsTableEvents`) يتعامل مع `edit | del | more` عبر `data-act` و`data-id` (المعرّف يُهرَّب بـ `escapeHtml`).
- مصغرات الصور: `getIkUrl(image, 96, 60)` مع `width/height` و`loading="lazy"` و`decoding="async"`.
- `style.css` (داخل `@media (max-width:900px)`): `.admin-sidebar` ثابتة عند `right:0` وتُخفى بـ `transform: translateX(110%)` + `visibility:hidden`، وتُفتح بـ `.open { transform:none; visibility:visible }`؛ الانتقال على `transform` فقط (مسرَّع بالـ GPU) مع `will-change: transform`.
- رُفع `?v=` إلى **73** في كل الصفحات.

**اختبار الإصلاح:** `node tests/run-tests.js` (19/19) + اختبار دخان بمحاكاة DOM: 500 منتج ← 40 صفاً أولاً، «المزيد» ← 80، بحث «منتج 49» ← 11 نتيجة، وأزرار التعديل/الحذف تستدعي الدالتين بالمعرّف الصحيح. **لم يُقَس الأداء في متصفح حقيقي** (لا متصفح في بيئة المراجعة) — قِس بـ DevTools ← Performance أثناء فتح القائمة بعد تفعيل المنتجات.

**قواعد للمستقبل (لأي لوحة قوائم):**
- لا تُرسم قائمة طويلة كاملة: صفحات أو «عرض المزيد» أو تمرير افتراضي.
- مستمع حدث واحد على الحاوية (event delegation) بدل `onclick` لكل صف.
- debounce لحقول البحث (200–300ms).
- الصور في الجداول: `loading="lazy"` و`decoding="async"` وأبعاد ثابتة ومصغّرة ImageKit.
- التحريك بـ `transform/opacity` فقط، لا بـ `left/right/top/width/height`.
- إن احتجت عرض آلاف الصفوف فعلاً فاستعمل التمرير الافتراضي (virtual scrolling) أو بحثاً من جهة الفهرس.

**إن استمر البطء بعد هذا:** افتح DevTools ← Performance، سجّل أثناء فتح القائمة؛ وتحقق من (أ) عدد عقد DOM (`document.querySelectorAll('*').length`)، (ب) أن مراقبة الـ 5 دقائق لا تعيد تنزيل الفهرس بلا داعٍ (Network: `ws_index/items` يجب ألا يتكرر)، (ج) حجم `localStorage` (`ws_index_items`، `ws_products`).

---

## 21. احتياطي الصور: ImageKit ← ImgBB (باقة ImageKit المجانية)

**المشكلة:** الباقة المجانية لـ ImageKit لها حد شهري صارم للـ bandwidth؛ عند تجاوزه يتوقف التسليم حتى الشهر التالي. المحفوظ في Firebase هو **رابط ImageKit** (يُحوَّل في `admin.js` عند الرفع)، فلولا هذا الاحتياطي لظهرت صور بديلة بدل المنتجات.

**الحل (كله في `js/app.js`، بلا تدخل يدوي):**
- `window.ikToOrigin(url)`: يحوّل `ik.imagekit.io/ID/[tr:...]/PATH` إلى `https://i.ibb.co/PATH` (يرجع `""` إن لم يكن رابط ImageKit).
- مستمع `error` عام (مرحلة الالتقاط) على كل `<img>`: عند فشل صورة ImageKit يجرّب رابط ImgBB مرة واحدة (`data-ik-fallback`) ويوقف معالج `onerror` الأصلي؛ فإن فشل ImgBB أيضاً يعمل `onerror` الأصلي (الصورة البديلة).
- **قاطع الدائرة:** بعد 3 إخفاقات من ImageKit دون نجاح أي صورة في الصفحة، يُخزَّن `sessionStorage.ws_ik_down` لمدة 30 دقيقة، وتُرجع `getIkUrl` رابط ImgBB مباشرة (بلا انتظار فشل كل صورة).
- **لا يغطي:** صور رُفعت مباشرة إلى ImageKit (ليست من ImgBB) — مساراتها لا تنتج رابط ImgBB صالحاً فتظهر الصورة البديلة.
- الاختبار: `node tests/run-tests.js` (يغطي `ikToOrigin` والقاطع).
- **الصورة البديلة النهائية:** `window.IMG_PLACEHOLDER` (SVG مضمّن في `app.js`، بلا طلب شبكة). تُستعمل في `onerror` ببطاقات `products.js` و`index.html` بعد فشل ImageKit وImgBB معاً. تُقرأ وقت الخطأ (ليس وقت تحميل السكربت) لأن سكربت `index.html` المضمّن يعمل قبل `app.js`.

---

## 22. أبعاد البطاقات (cardSizes) + قسم «نفذ من المتجر» في الأدمن

### أ) أبعاد البطاقات — إعداد مطوّر مثل الألوان (ليس من لوحة الأدمن)
- **أين:** في الثيم داخل `js/themes.js` (خاصية `cardSizes` الاختيارية) ويمكن تجاوزها من `js/config.js` ← `theme.cardSizes` (القيمة غير الفارغة تتغلب على الثيم، كبقية الألوان والخط). أسهل طريقة لبنائها بصرياً: `themes.html` ← مجموعة «أبعاد البطاقات».
- **المواضع الأربعة:** `homeProducts` (المميزة/العروض/الجديدة) · `homeCategories` · `productsPage` · `categoriesPage`. لكل موضع أربعة حقول بالبكسل: `width`, `height` (حاسوب ≥768px) و`mobileWidth`, `mobileHeight` (جوال ≤767px). العرض 80–700 والطول 100–900. كل حقل اختياري؛ غير المحدد = الشكل الأصلي المتجاوب بلا أي تغيير.
```js
cardSizes: {
  homeProducts:   { width: 260, height: 400, mobileWidth: 165, mobileHeight: 280 },
  homeCategories: { width: 170, height: 200 },
  productsPage:   { width: 280, height: 430 },
  categoriesPage: { width: 340, height: 220 }
}
```
- **السلوك:** بطاقة المنتج بالعرض والطول المحدّدين تماماً (تتمدد الصورة لتملأ ما يتبقى من الطول). بطاقة القسم في الرئيسية بالعرض والطول، وتُكبَّر الأيقونة تلقائياً بما يناسبها. في صفحة الأقسام الطول **حدّ أدنى** لأن البطاقة تتمدد بمحتواها (الأقسام الفرعية). في صفوف الرئيسية على الجوال (السحب الأفقي) يحدد `mobileWidth` عرض البطاقة، وفي صفحات الشبكة يحدد عرض العمود فتتوزّع البطاقات في الوسط.
- **التنفيذ:** `js/boot.js` (دالة `cs` + `CARD_PLACES` داخل `buildVars`) تولّد قواعد CSS بـ `@media` للحقول المحددة فقط وتضيفها مع متغيرات الثيم. لا تعديل في `style.css`. نفس المنطق منقول داخل `themes.html` (المحرر والمعاينة).
- **الفحص:** `node tools/check-themes.js` (المدى والمواضع المجهولة) و`node tools/check-config.js` (لـ theme.cardSizes في config.js).
- **ملاحظة:** `categories.html` لم يعد فيه `style` مباشر على `#categoriesGrid` كي تعمل الأبعاد (القاعدة الأصلية في `.category-grid` بنفس القيم).

### ب) قسم «نفذ من المتجر» (admin)
- زر جديد في القائمة الجانبية (`data-panel="outofstock"`) بعدّاد، ولوحة `#panel-outofstock`.
- يعرض كل منتج لا يمرّ من `Store.isProductAvailable` (نفس منطق «غير متوفر» عند الزبون): **نفدت الكمية** (المخزون أو مجموع مصفوفة الألوان/المقاسات = 0) أو **مخفي يدوياً** (`available === false`). بحث بالاسم/الباركود + فلتر السبب + زر «تعديل» يفتح نافذة المنتج.
- الدوال في `js/admin.js`: `renderOutOfStock` · `wireOutOfStock`؛ وتُستدعى `renderOutOfStock()` من `renderStats()` فتتحدث تلقائياً بعد أي حفظ/حذف/استيراد.
- بعد أي تعديل: `node tests/run-tests.js` و`node tests/boot-tests.js` و`node tools/check-config.js` و`node tools/check-themes.js`، ثم `node tools/set-version.js N`.

### ج) بطاقات منتجات موحّدة الحجم
- اسم المنتج: **سطران** على الشاشات العريضة (768px فأكثر) و**سطر واحد** على الضيقة (الجوال)، ويُقطع بـ «…» بعد ذلك؛ ويُحجز ارتفاع سطرين دائماً على العريضة فتتساوى كل البطاقات حتى مع الأسماء القصيرة. التصنيف سطر واحد دائماً، وصف الألوان بارتفاع ثابت (20px) وتحجز البطاقات بلا ألوان المساحة نفسها، فيتساوى ارتفاع كل البطاقات وموضع السعر والزر مهما طال الاسم أو زاد عدد الألوان.
- القواعد في آخر `css/refresh.css` («Uniform product cards») ومحصورة بـ `.product-card` كي لا تتأثر صفحات أخرى. لا تعدّل القوالب في `index.html`/`products.js`.
- **صفحة تفاصيل المنتج والسلة:** الاسم الطويل (حتى المتصل بلا مسافات) **يلتف** لسطر ثانٍ ولا يوسّع الصفحة (`overflow-wrap:anywhere` + `min-width:0` على أعمدة `.detail-grid` و`.cart-item`، آخر `css/refresh.css`). القطع بـ «…» في البطاقات فقط.

### د) «غيّرت الثيم ولا يتغير شيء في الموقع»
- **السبب الأشهر:** التعديل تم في `js/config.template.js`. هذا قالب فارغ للمتاجر الجديدة **لا تحمّله أي صفحة**؛ الموقع يقرأ `js/config.js` وحده. (أُضيف تنبيه في أعلى القالب.)
- **الحل:** عدّل `theme.preset` في `js/config.js`، أو نفّذ `node tools/set-theme.js اسم-الثيم` (يتأكد أن الثيم موجود ثم يكتبه في config.js؛ بدون اسم يعرض الثيم الحالي والمتاح).
- **أسباب أخرى:** معاينة عالقة في التبويب (`?theme=` تبقى طوال الجلسة؛ افتح `?theme=off`)، أو ألوان/خط مكتوبة في `theme.colors` / `theme.fontFamily` في config.js (تتغلب على الثيم)، أو خطأ إملائي في الاسم (يظهر تحذير `[theme]` في الكونسول ويُستعمل navy-gold).

---

## 23. التوسّع إلى 10,000 منتج (IndexedDB + كتابة جزئية + مزامنة تفاضلية)

### أ) ما الذي تغيّر
| الموضوع | قبل | الآن |
|---|---|---|
| تخزين الفهرس عند الزائر | `localStorage` (`ws_index_items`، حدّ ~5MB) | **IndexedDB** (`ws_store/kv`: `items` + `meta` بمعاملة واحدة)، وتبقى أرقام النسخة في localStorage. احتياطي تلقائي: localStorage ثم الذاكرة (تصفح خاص/متصفح قديم). نسخة localStorage القديمة تُرحَّل وتُفرَّغ تلقائياً |
| سجل الفهرس | مفاتيح كاملة | مصغّر: `i n p c s m b a f o d w cl z vc t u` وتُحذف كل القيم الافتراضية/الفارغة؛ والقراءة تقبل الشكل القديم |
| `ws_products` | مصفوفة تُكتب كاملة عند كل حفظ | كائن `ws_products/{id}`؛ الحفظ يكتب العقدة المتغيّرة فقط |
| تحديث الفهرس عند الزوار | تنزيل كامل عند كل تغيير | تنزيل كامل مرة واحدة، ثم **التغييرات فقط** (`orderBy="u"&startAt=…`) |
| فحص التحديثات | كل 60 ث | كل **300 ث** (`INDEX_CHECK_MS` و`META_PULL_MS` في store.js، و`boot.js` للجلب المبكر) |
| كاش المنتجات الكاملة عند الزائر | 5000 | **400** (آخر ما فُتح)؛ الفهرس الخفيف يغطي الباقي |
| البحث العام والقوائم | تصفية كل الفهرس | **خروج مبكر** عند اكتمال النتائج (8 للبحث العام، 4 للرئيسية، الشريحة المطلوبة +1 للمتجر) |

### ب) سجل الفهرس المصغّر
`i`=id · `n`=name · `p`=price · `c`=categoryId · `s`=المخزون (يُحذف إن صفر) · `m`=image · `b`=barcode · `a`=0 (غير متاح فقط) · `f`/`o`/`w`=مميز/عرض/جديد (1) · `d`=السعر القديم (للعرض فقط) · `cl`=الألوان `[[اسم,hex]]` · `z`=المقاسات · `vc`=عدد التركيبات · `t`=`createdAt` (الترتيب: الأحدث أولاً) · `u`=وقت الخادم لآخر تعديل · `x:1`=قبر (منتج محذوف).
في `ws_index/items/{id}` لا يُكرَّر `i` (المفتاح هو المعرّف). `_k` و`_n` (للبحث العربي) تُحسب في الذاكرة عند التهيئة ولا تُخزَّن. **الحجم الفعلي** يتوقف أساساً على طول رابط الصورة واسم المنتج: ≈ 120–160 بايتاً/منتج (≈ 1.2–1.6MB خام لكل 10,000؛ يصل الزائر مضغوطاً gzip عادةً بنحو الثلث). أما 70–80 بايتاً فتتحقق فقط إن حُذف رابط الصورة والباركود من الفهرس.

### ج) الكتابة من الأدمن (`js/store.js`)
- `commitProductNodes(upsert, removeIds)`: لكل منتج يكتب `ws_products/{id}` و`ws_index/items/{id}` (+`u: ServerValue.TIMESTAMP`)، وللحذف `null` + قبر `{x:1,u}`، ثم `ws_index/v = ServerValue.increment(1)` — كله في `database.ref().update()` متعدد المسارات (ذرّي)، وبدفعات 150 منتجاً كحدّ أقصى للطلب.
- `updateProduct/addProduct/deleteProduct` تكتب منتجاً واحداً. `saveProducts(list)` (الاستيراد/خصم المخزون) تقارن **ببصمة آخر حالة متزامنة** (`_syncedHash`) لا بالكائنات المحلية، لأن `admin.js` يعدّل الكائنات في مكانها قبل الاستدعاء؛ فيُكتب المتغيّر والجديد والمحذوف فقط.
- الفهرس المحلي (عند الأدمن أيضاً) يُحدَّث لسجل واحد (`applyLocalIndexChange`) دون إعادة بناء.
- ترتيب «الأحدث أولاً» صار بحقل `createdAt` (يُضبط عند الإضافة) لأن مفاتيح الكائن معرّفات لا فهارس.
- `Store.rebuildIndex(true)`: يعيد بناء الفهرس كاملاً ويرفع الحقبة `e` ويُسقط القبور (يُنزَّل كاملاً مرة واحدة عند الزوار). مفيد إن تراكمت قبور كثيرة.

### د) الترحيل التلقائي غير المدمِّر
عند أول حفظ في أدمن ما زال `ws_products` عنده مصفوفة (أو مفاتيحه ≠ `id`):
1. يتحقق أن الخادم لم يتغيّر منذ تحميل الصفحة (عقدة غريبة ⇒ **إيقاف دون كتابة**).
2. ينقل المنتجات بدفعات ذرّية (حذف المفتاح الرقمي + كتابة `ws_products/{id}` في الطلب نفسه) فلا يضيع منتج إن انقطع الاتصال، ويُستأنف عند الحفظ التالي.
3. يعطي المنتجات `createdAt` ثابتاً يحفظ ترتيب المصفوفة القديمة؛ والمعرّفات المكررة/غير الصالحة تُحوَّل لأسماء فريدة (`dup-2`, `a_b_c`) مع تحذير في Console بدل أن يضيع أي منتج.
4. يعيد بناء `ws_index` بالشكل الجديد ويرفع `e` (يُنزَّل عند الزوار مرة واحدة).
يظهر تنبيه في الأدمن قبل الترحيل وإشعارات أثناءه (`store:migration-start/done/failed`). **خذ نسخة احتياطية قبل أول حفظ** (Firebase Console ← Realtime Database ← ⋮ ← Export JSON).

### هـ) قواعد Firebase (إلزامية: `.indexOn` على `ws_index/items/u`)
الملف الجاهز: `firebase-database.rules.json` (استبدل `ADMIN_UID` ثم انشره). الجديد فقط:
```json
"ws_products": {
  ".read": true,
  ".write": "auth != null && auth.uid === 'ADMIN_UID'",
  ".indexOn": ["categoryId", "featured", "isOffer", "isNew", "id"],
  "$pid": { ".validate": "newData.hasChildren(['id']) && newData.child('id').val() === $pid" }
},
"ws_index": {
  ".read": true,
  ".write": "auth != null && auth.uid === 'ADMIN_UID'",
  "items": { ".indexOn": ["u"] }
}
```
- `$pid.validate` يفرض أن مفتاح العقدة = `id` المنتج (يحمي بنية `ws_products/{id}`)، ويرفض أي نسخة قديمة تحاول كتابة المصفوفة كاملة.
- دون `.indexOn: ["u"]` يعمل المتجر لكن يعود تلقائياً للتنزيل الكامل عند كل تغيير (HTTP 400 ← احتياط).
- قراءة منتج بالمعرّف (`product.html`) صارت عقدة مباشرة `ws_products/{id}`؛ ويبقى الاستعلام بالحقل `id` احتياطاً للبنية القديمة.

### و) حدود معروفة
- الأدمن لم يعد يحمّل كل `ws_products` (القسم 23-ز)، لكن الاستيراد وبناء الفهرس لأول مرة والترحيل لمرة واحدة تحمّلها كاملة عند الحاجة (≈ 10–20MB عند 10,000 منتج).
- تحديثات أدمن آخر تصل لقائمتك عند فتح اللوحة (مزامنة تفاضلية بلا تهدئة) أو بتحديث الصفحة؛ والتعديل نفسه يجلب المنتج طازجاً من الخادم فلا تضيع تعديلات جهاز آخر.
- حقل `u` يعتمد وقت الخادم، فلا تأثير لساعة الجهاز. أما `createdAt` فوقت جهاز الأدمن (للترتيب فقط).
- الفهرس الكامل للزائر الجديد ≈ 1.6MB خام/10,000؛ مع 10,000 زائر جديد شهرياً ≈ 16GB خام (≈ 5GB مضغوطاً) قرب حد Spark (10GB/شهر): راقب الاستهلاك أو انتقل لخطة Blaze عند النمو.
- اختبارات: `node tests/scale-tests.js` (26 اختباراً: الفهرس المصغّر، IndexedDB والاحتياطي، المزامنة التفاضلية، الكتابة الجزئية، الترحيل، الخروج المبكر).

### ز) لوحة الأدمن الخفيفة (بدل تحميل كل المنتجات)
- **عند الفتح:** `Store.loadAdminCatalog()` ← كشف البنية بطلب عقدة واحدة (`orderBy="$key"&limitToFirst=1`) + مزامنة الفهرس الخفيف (تفاضلية بعد أول مرة، بلا تهدئة 5 دقائق). لا يُحمَّل `ws_products` كاملاً. إن تعذّر الفهرس (قواعد/شبكة) يعود تلقائياً للوضع القديم (تحميل كل المنتجات).
- **الجدول والإحصاءات والبحث وقسم «نفذ من المتجر» وعدّاد الأقسام:** من `Store.getAdminProducts()` (سجلات الفهرس: الاسم/السعر/المخزون الإجمالي/الباركود أو SKU/القسم/التوفر…). الجدول مقسّم لصفحات فلا يُرسم 10,000 صف.
- **تعديل منتج:** `openProductForEdit(id)` يجلب النسخة الكاملة الطازجة من عقدتها `ws_products/{id}` (~2KB) ثم يفتح النافذة. الحفظ يكتب هذه العقدة وحدها؛ والحقول التي لا يحملها الفهرس (الوصف، الصور، مخزون التركيبات…) تبقى لأن الكتابة تدمج على النسخة الكاملة.
- **خصم المخزون عند تجهيز الطلب:** يجلب منتجات الطلب فقط طازجة ويكتب عقدة لكل منتج (`updateProduct`)؛ أدقّ من الكتالوج المحلي وأخف بكثير.
- **الاستيراد (والعمليات الجماعية `saveProducts`):** يحمّل الكتالوج كاملاً عند الحاجة فقط (`ensureFullCatalogForBulk`) لأن المطابقة واكتشاف المحذوف يتطلبان كل المنتجات؛ وفي الوضع الخفيف `saveProducts` مرفوضة حمايةً من قائمة جزئية.
- **الصلاحيات:** `canWriteNode()` (منتج واحد: يكفيه فهرس جاهز) و`canWriteProducts()` (جماعي: كتالوج كامل).
- **الترحيل:** إن اكتُشفت بنية المصفوفة القديمة يظهر تنبيه، وعند أول حفظ يُحمَّل الكتالوج كاملاً مرة واحدة ليُرحَّل (القسم 23-د).
- **اختبارات:** `tests/scale-tests.js` (32). والصفحة الحقيقية `admin.html` جُرّبت في Chromium مع بديل لـ Firebase SDK: الفتح بلا `ws_products` كاملة، البحث، التعديل، الحذف، «نفذ من المتجر»، خصم المخزون، الاستيراد.

### ح) اختبار الحمل: `tools/load-test.js` (نسخة مكررة في `tests/load-test.js`)
يحاكي زواراً (جدداً وعائدين) بنفس طلبات المتجر الفعلية لقاعدة Firebase، ويقيس زمن الاستجابة والأخطاء والتنزيل ونسبة ما استُهلك من حصة Spark (10GB/شهر)، ويقدّر عدد الزوار الفريدين الشهري الممكن.
```
node tools/load-test.js --dry                                   # تقدير فقط بلا أي حمل (يرسل طلباً واحداً لقياس حجم الفهرس)
node tools/load-test.js --visitors 200 --concurrency 10        # تجربة فعلية
node tools/load-test.js --visitors 1000 --new-ratio 0.5 --yes  # يلزم --yes إن قُدِّر التنزيل > 100MB
```
- قيود أمان: يستهدف فقط `firebaseDatabaseURL` في `js/config.js` (نطاق firebaseio.com / firebasedatabase.app؛ أو localhost للتجارب المحلية)، سقف 5000 زائر و50 اتصالاً متزامناً.
- **كل زائر «جديد» يحمّل الفهرس كاملاً ويُحسب من حصتك الحقيقية** (10,000 منتج ≈ 1.5MB): 1000 زائر جديد ≈ 1.5GB. لا تشغّله على قاعدة لا تملكها، ولا تكرره كثيراً في الشهر نفسه.


---

## 24. الذكاء الاصطناعي في لوحة الأدمن (`js/ai.js` + `functions/api/ai.js`)

**آخر مراجعة: 2026-10-31.** أُعيدت كتابة هذا القسم بعد فحص الكود الفعلي. المعمارية القديمة (مفاتيح `geminiApiKey`/`groqApiKey` داخل `config.js`) **لم تعد موجودة**.

### 24.1 المعمارية

`admin.js` ← `window.StoreAI` (`js/ai.js`) ← `POST /api/ai` مع ترويسة `Authorization: Bearer <Firebase ID Token>` ← `functions/api/ai.js` (Cloudflare Pages Function) ← **Groq** (نصوص: وصف، تسعير) أو **Gemini** (صور، PDF، جداول).

- المفاتيح تبقى في الخادم فقط (متغيرات بيئة Cloudflare) ولا تمر بالمتصفح ولا بـ `config.js`.
- **يعمل على Cloudflare Pages فقط** (مجلد `functions/` يُنشر تلقائياً). على استضافة ثابتة أخرى (Vercel/Netlify/GitHub Pages) أو بفتح الملفات محلياً تظهر رسالة «خدمة /api/ai غير موجودة» وبقية المتجر يعمل عادياً.
- `ai.js` لا يلمس `Store` ولا Firebase (عدا قراءة توكن الدخول)؛ يُرجع بيانات منظَّفة فقط، و`admin.js` هو الذي يعرضها للمراجعة ثم يكتب.

### 24.2 الإعداد (لكل متجر)

Cloudflare ← Pages ← المشروع ← Settings ← Environment variables (Production) ثم **أعد النشر** (المتغيرات لا تنطبق على نشر سابق):

| المتغير | القيمة | ملاحظة |
|---|---|---|
| `GEMINI_API_KEY` | مفتاح Google AI Studio | الرؤية: صور/PDF/جداول |
| `GROQ_API_KEY` | مفتاح Groq | النصوص |
| `FIREBASE_API_KEY` | نفس `firebaseApiKey` في `config.js` | للتحقق من هوية الأدمن فقط (مفتاح ويب عام بطبيعته) |
| `ADMIN_EMAILS` | إيميلات الأدمن مفصولة بفاصلة | ⚠️ مصدر **منفصل** عن `adminEmails` في `config.js` — حدّثهما معاً |
| `GEMINI_MODEL` / `GROQ_MODEL` | اختياري | لتغيير النموذج دون تعديل الكود |
| `GEMINI_ENRICH_MODEL` | اختياري (افتراضي `gemini-3.5-flash`) | نموذج «الإثراء» ببحث Google (24.10). يجب أن يدعم أداة البحث مع المخطط (موثّق لنماذج Gemini 3)؛ إن لم يدعمها حسابك تظهر «لا يدعم البحث» |

**مفاتيح `config.js` (القسم 3.7):** `aiEnabled` (افتراضي `true`) يخفي كل الأدوات عند `false` — استعمله لمتجر لم تُضبط له متغيرات Cloudflare أو لا يريدها؛ و`aiBilingualNames` (افتراضي `true`) يتحكم بصيغة الاسم المستخرج. كلاهما يُقرأ من `STORE_CONFIG` في `ai.js` و`admin.js` (`applyAiAvailability`).
- **النماذج الافتراضية** (تحقّقتُ منها في وثائق المزوّدين بتاريخ 2026-10-30): `gemini-3.5-flash-lite` (إصدار GA منذ 2026-07-21، يقبل الصور والنص) و`qwen/qwen3.8-27b` على Groq (موجود في وثائق Groq لكنه موسوم **Preview**؛ النماذج التجريبية قد تُسحب — إن توقف فعيّن `GROQ_MODEL`).
- **Qwen 3.8 يعمل افتراضياً بوضع «التفكير»** وتفكيره يستهلك من `max_tokens`، فكان الرد يُقطع أو يخرج فارغاً أو ملوثاً بـ`<think>`؛ لذلك يرسل الخادم `reasoning_effort:"none"` (وضع مباشر)، ويعيد الطلب بدونه إن رفضه النموذج، وينزع أي `<think>` متبقٍّ.
- أي متغير ناقص ← رد خطأ واضح من الخادم (`auth_not_configured` / `no_gemini_key` / `no_groq_key`) يظهر كتوست في الأدمن.

### 24.3 الأمان

- `/api/ai` يرفض الطلب إلا إذا: وُجد توكن (401)، وتحقق Google منه عبر `accounts:lookup` (401)، وكان إيميل صاحبه ضمن `ADMIN_EMAILS` (403). **قبل 2026-10-30 كان مفتوحاً لأي زائر** يستهلك رصيد المفاتيح.
- حدود الخادم: نص التعليمات ≤ 40,000 حرف، جدول CSV ≤ 150,000 حرف للدفعة، ملف base64 ≤ ≈13.5MB، الأنواع المسموحة JPEG/PNG/WEBP/HEIC/HEIF/PDF، مهلة 55 ثانية. مفتاح Gemini يُرسل في ترويسة `x-goog-api-key` (لا يظهر في الروابط ولا السجلات).
- الحماية هنا مبنية على الإيميل؛ **الأمان الحقيقي لبيانات المتجر يبقى قواعد Firebase** (القسم 9). لا يوجد تحديد معدّل خاص بنا (القسم 15 بند 38).

### 24.4 الأدوات

| الأداة | الواجهة (admin.html) ← الدالة | دالة `ai.js` (المزوّد) | ما ترجعه | ما تفعله `admin.js` به |
|---|---|---|---|---|
| توليد الوصف | `#btnAiGenDesc` في نافذة المنتج | `generateDescription(name, categoryName)` (Groq) | نص عربي من جملتين منظَّف | يضعه في `#productDescription` ويطلق `input`؛ لا يحفظ حتى تحفظ النافذة |
| التسعير بالأوامر | `#aiPriceCommandInput` + `#btnExecutePriceCommand` ← `wireAiPricing` | `parsePriceCommand(text, categoryNames)` (Groq JSON) | خطة **متحقَّق منها** `{action, value, category, minPrice, maxPrice, summary}` | معاينة بالعدد الفعلي ← `confirm` ← تطبيق (24.6) |
| استيراد من صورة | `#aiImageInput` ← `wireSmartMediaScanner` | `prepareImage(file)` ثم `scanInvoice(base64, mime, categories)` (Gemini) | `{items[], warnings[]}` | `processAndOpenBatchReview` ← بطاقات المراجعة |
| استيراد من PDF | `#aiFileInput` (PDF) | `preparePdf(file)` ثم `scanInvoice(...)` | نفسه | نفسه |
| استيراد من إكسل/CSV | `#aiFileInput` أو `#excelSyncInput` ← `handleExcelFileWithAI` | `scanInvoice(csvText, "text/csv", categories)` لكل ورقة | نفسه | نفسه (الأوراق كلها) |
| بحث المواصفات الرسمية بعد الاستيراد | تلقائي بعد الصورة/PDF/الإكسل ← `enrichAndOpen` | `enrichItems` (`gemini_search`) | نفس العناصر مع `enriched` ووصف `descKind:"official"` | القسم 24.10 |
| الشرح الإعلاني للناقص | تلقائي بعد البحث | `completeDescriptions` (Groq، دفعات 8) | وصف `descKind:"ad"` | القسم 24.10 |
| مسح الرف | *(غير موصولة بأي زر)* | `scanShelf(base64, mime)` | `{products:[{name,category,box_2d}]}` بإحداثيات 0–1000 مُتحقَّق منها | — |

عناصر `item` الراجعة: `{name, category, price, qty, barcode, colors[], sizes[], description, image}` — كلها منظَّفة (24.5). لا شيء يُكتب في Firebase قبل زر «حفظ المنتجات المحددة».

### 24.5 ضمانات الدقة (ما يفعله الكود الآن)

**على الخادم (`functions/api/ai.js`):**
- Gemini: `temperature 0` و`maxOutputTokens 32768` و`responseMimeType: application/json`؛ يقرأ كل الأجزاء ويتجاهل أجزاء «التفكير»، ويكشف القطع (`finishReason: MAX_TOKENS`) فيرجع `partial:true`.
- استخراج JSON متسامح: ينزع أسوار ```json والنص المحيط، وإن قُطع الرد يُنقذ **العناصر المكتملة فقط** ويُعلِم العميل (`partial`).
- **مخطط JSON:** العميل يرسل `schema` (JSON Schema) مع طلبات الفواتير/الرف/التسعير؛ الخادم يمرّره لـ Gemini كـ`responseJsonSchema` ولـ Groq كـ`response_format: json_schema` فيأتي الرد مطابقاً للشكل. إن رفضه النموذج (400 يذكر schema) يُعاد الطلب تلقائياً بدونه (Groq ← `json_object`) ويبقى تنظيف العميل كحماية ثانية.
- Groq: `temperature 0` للـJSON و0.5 للنص، `max_tokens 2048`، ورفض صريح إن انقطع الرد (`finish_reason: length`).

**في العميل (`ai.js`) — «مخرجات النموذج بيانات غير موثوقة»:**
- `normalizeItem`: الاسم إلزامي (حرفان فأكثر)؛ السعر عبر `toNumber` (يفهم «25,000» و«٢٥٬٠٠٠» ولا يرجع NaN أبداً)؛ الكمية عدد صحيح ≥ 0 (الافتراضي 1)؛ الباركود حروف/أرقام فقط؛ الألوان والمقاسات قوائم فريدة؛ **الصورة تُقبل فقط إن كانت رابط `http(s)`**.
- `normalizeItems`: يدمج السطور المكررة (نفس الباركود أو نفس الاسم بعد توحيد ة/ه وأ/إ/ا وى/ي والتشكيل) بجمع الكميات ودمج الألوان والمقاسات بدل إنشاء منتجين، ويبلغ بالعدد.
- **الجداول الكبيرة:** تُقطَّع إلى دفعات 40 صفاً مع تكرار صف العناوين في كل دفعة (حتى لا يُقطع الرد)، وتُقرأ **كل أوراق** الإكسل. فشل دفعة لا يُخفى: يظهر تحذير «فشلت الدفعة N (صفوف a–b)» في رأس نافذة المراجعة وتُحفظ بقية النتائج؛ وإن فشلت كلها يظهر الخطأ.
- **الصور:** تُصغَّر إلى ضلع ≤ 2000px وJPEG 0.9 قبل الإرسال (أسرع وأدق وأبعد عن حدود الحجم) على خلفية بيضاء؛ PDF ≤ 12MB.
- **الموجّهات (`buildInvoicePrompt`):** «استخرج فقط ما هو مكتوب»، ممنوع اختراع سعر/كمية/باركود/رابط/وصف، تجاهل أسطر المجاميع والضريبة والشحن، سعر الوحدة لا إجمالي السطر، تحويل الأرقام العربية، الاسم ثنائي اللغة فقط إن كان النموذج متأكداً (وإلا لغته الأصلية)، والألوان: كلمات القوام (شفاف/مائي/جل…) ليست ألواناً. الوصف: جملتان بلا مواصفات مخترعة ولا ادعاءات طبية.
- **شجرة الأقسام:** الأقسام تُرسل للنموذج بمسار «الأب › الفرعي» (`categoryLabels()` في `admin.js`) ويُطلب نسخها حرفياً؛ `matchCategory` يطابق المسار الكامل أو الاسم، ونفس الاسم تحت أبوين مختلفين بلا ذكر الأب = **التباس** (`null`/خطأ في التسعير)، لا تخمين.
- **نظافة ثانية في الأدمن:** `cleanColorName` + `isTransparentOrInvalidColor` يحذفان ألوان القوام حتى لو أخطأ النموذج؛ `matchCategory` يطابق القسم تاماً أو جزئياً **وحيداً** فقط.

### 24.6 قواعد أوامر التسعير (`wireAiPricing` + `normalizePricePlan`)

- **التحقق:** الإجراء ضمن القائمة (`discount_percent`/`discount_fixed`/`increase_percent`/`increase_fixed`/`reset_discount`)؛ القيمة > 0 (ما عدا `reset_discount`)؛ خصم النسبة ≤ 90% وزيادتها ≤ 300% (غير ذلك يُرفض مع طلب التنفيذ يدوياً)؛ `minPrice` ≤ `maxPrice`؛ الأمر المزدوج أو الغامض يرجع `unclear` فيُرفض مع سببه.
- **القسم:** يجب أن يطابق قسماً **موجوداً** (تطابق تام أو جزئي وحيد). غير موجود أو ملتبس ← «لم أجد قسماً مطابقاً… لم يُنفَّذ شيء». ويشمل القسم المختار **أقسامه الفرعية**. (القديم كان يطبّق على كل المنتجات عند عدم التطابق.)
- **المعاينة:** يُحسب كل شيء أولاً دون تعديل، ثم يُعرض «عدد المنتجات المتأثرة من الإجمالي + مثال سعر قبل/بعد»، والملخص مبني من الخطة المتحقَّق منها (لا من كلام النموذج). التعديل والحفظ بعد التأكيد فقط، ونتيجة `saveProducts` تُفحص.
- **الحساب:** الخصم يحفظ السعر الحالي في `oldPrice` (إن لم يكن هناك `oldPrice` أكبر منه) ويضع `isOffer:true` ويقرّب `Math.round`؛ الخصم الثابت لا ينزل عن 0؛ الزيادة إن لحق السعر الجديد `oldPrice` تلغي العرض (`oldPrice:0`, `isOffer:false`)؛ `reset_discount` يعيد `oldPrice` إلى السعر ويلغي العرض؛ المنتج الذي لا يتغير سعره لا يُحتسب ولا يُكتب.

**التراجع عن آخر تسعير (`↩️ تراجع عن آخر تسعير` — `#btnUndoPriceCommand`):** بعد كل أمر ناجح تُحفظ لقطة «قبل/بعد» لكل منتج متأثر في `localStorage` (`ws_price_undo_v1`، وفي الذاكرة إن امتلأ التخزين) ويظهر الزر. التراجع (`planPriceUndo`): يُرجع السعر والسعر القديم والعرض لكل منتج **لم يتغير سعره منذ ذلك**؛ ما عُدّل يدوياً بعد التسعير يُتجاهل (يُعرض عدده في التأكيد) والمحذوف يُعدّ ولا يُمسّ؛ تُفحص نتيجة `saveProducts` ثم تُمسح اللقطة. لقطة واحدة فقط (آخر أمر).

### 24.7 تدفق الاستيراد

اختيار الملف ← (`prepareImage`/`preparePdf`/قراءة الأوراق) ← `StoreAI.scanInvoice` (تقطيع + تنظيف + دمج) ← `processAndOpenBatchReview` (مطابقة مع الموجود بالباركود ثم الاسم، ومطابقة القسم، وتنقية الألوان والروابط) ← `renderBatchReviewCards` (المراجعة، مع ⚠️ التحذيرات في الرأس) ← تأكيد المدير ← رفع الصور إلى ImgBB (الفاشل يُحفظ بلا صورة) ← `Store.saveProducts` (يُفحص ناتجه). القسم 7 يشرح الدمج والمخزون (الكمية الواردة **تُضاف** للرصيد).

### 24.8 تعديل/توسيع

- **أداة جديدة:** دالة في `ai.js` تنظّف ناتجها وتُعاد من `api`؛ تُستدعى من `admin.js` بعد فحص `window.StoreAI?.<fn>`؛ تمرّ عبر معاينة/تأكيد (القاعدتان 24 و26)؛ وأضف لها اختباراً في `tests/ai-tests.js` (القاعدة 27).
- **تغيير النموذج:** متغير `GEMINI_MODEL`/`GROQ_MODEL` في Cloudflare (لا تعدّل الكود). **تغيير الحرارة/الطول:** في `geminiVision`/`groqChat` داخل `functions/api/ai.js`.
- **إخفاء الأدوات لمتجر لا يريدها:** أزل الكتلة `.ai-toolkit-bar` وزر `#btnAiGenDesc` من `admin.html` وسطر `ai.js` (دوال `wire*` تتحقق من وجود العناصر وتخرج بصمت) ولا تضبط متغيرات البيئة.
- **ارفع `?v=`** بعد أي تعديل (`node tools/set-version.js N`).

### 24.9 حدود لا يستطيع الكود إصلاحها

القراءة الآلية قد تخطئ (خط يدوي، صورة مائلة/معتمة، جدول بأعمدة غامضة، اسم تجاري نادر)، لذلك **نافذة المراجعة إلزامية وليست شكلية**: راجع الأسعار والكميات والأقسام قبل «حفظ». راجع أيضاً القسم 15 بند 31.

### 24.10 جودة الاستخراج والمواصفات الرسمية والشرح الإعلاني

**المشكلة التي يحلها:** ملف مبيعات الزبون يحوي غالباً الاسم والكود والسعر والعدد فقط، وكان النموذج أحياناً يضع اسم المنتج في خانة الوصف، و«10% + 1%» في المقاسات، ويصنّف سيروم بشرة تحت «العناية بالشعر». الآن يفعل الموقع كل شيء تلقائياً بعد الاستيراد (إكسل/صورة/PDF) دون أن يمرّر الزبون الملف إلى Gemini بنفسه.

**المسار (3 مراحل، كلها قابلة للمراجعة قبل الحفظ):**
1. **الاستخراج** (`scanInvoice`، Gemini بمخطط JSON): الاسم التجاري الكامل (ماركة + اسم + نوع، **والتراكيز/النسب جزء من الاسم**)، `brand`، `productType`، القسم (نوع المنتج أولاً ← ثم ماركته ← ثم اسم مقترح؛ **ممنوع إجبار المنتج على قسم لا يناسبه**)، الألوان والمقاسات الحقيقية فقط، والوصف **فقط إن وُجد في المصدر فعلاً**. صورة عبوة/رف: يقرأ الاسم من العبوة نفسها.
2. **المواصفات الرسمية** (`enrichItems` ← `gemini_search`: Gemini + `google_search` + مخطط، نموذج `GEMINI_ENRICH_MODEL`): للمنتج الذي بلا وصف، يرجع وصفاً رسمياً + ألواناً + مقاسات + قسماً، **مع المصادر الفعلية** من `groundingMetadata`. الوصف الناتج `descKind:"official"`.
3. **الشرح الإعلاني** (`completeDescriptions` ← Groq، دفعات 8 منتجات): لكل منتج بقي بلا وصف (لم تتوفر مواصفات رسمية) يُكتب شرح إعلاني عام من جملتين إلى ثلاث حسب نوع المنتج (تجميل/عناية/إلكترونيات/ملابس/أجهزة/غيرها) — `descKind:"ad"`، وتظهر في البطاقة شارة «✍️ شرح إعلاني عام (لم تتوفر مواصفات رسمية)».

**ضمانات الدقة (مختبَرة في `tests/enrich-tests.js` و`tests/browser-enrich.js`):**
- **تنظيف الاستخراج** (`normalizeItem`): `isNameEcho` يمسح الوصف الذي يكرر الاسم (قصير + يشارك الاسم كلمتين مميّزتين)؛ `isValidSize` يقبل فقط رقم+وحدة (50ml، 30 مل، 256GB، 12 قطعة، 2×50ml) ومقاسات الملابس وأرقام الأحذية (4–60) ويرفض النسب والتراكيز (`10% + 1%`)؛ `isValidColor` يرفض كلمات القوام (شفاف/مائي/جل) والأحجام والنسب.
- **لا يُعتمد أي رد بحث غير مؤسَّس:** `grounded` من وجود مصادر بحث فعلية في رد Google، و`found=true` بلا مصادر = «لم يُعثر عليه». الثقة المنخفضة أو عدم العثور ← لا تُملأ الحقول (ويُكتب بدلها شرح إعلاني عام).
- **وصف البحث الذي يكرر الاسم يُرفض**، وكذلك الشرح الإعلاني الذي يكرر الاسم.
- **لا يستبدل ما كتبه التاجر:** يكمل الناقص فقط؛ الاسم الرسمي يُعرض كاقتراح بزر «[استخدمه]»؛ السعر والكمية والباركود لا تُمس؛ ومنتج المتجر الموجود بوصف لا يُبحث له ولا يُكتب له وصف جديد (`findExistingFor`).
- **القسم:** يُتحقق أن اختيار النموذج موجود في أقسام المتجر (`resolveCategoryName`) وإلا يظهر كاقتراح «[+ إنشاء]».
- **الشرح الإعلاني (`AD_SYSTEM`):** ممنوع اختراع مواصفات رقمية أو مكوّنات أو سعات أو ضمان أو بلد صنع، وممنوع الادعاءات الطبية والمبالغات، ولا تكرار للاسم، بلا إيموجي ولا سعر.
- **الحدود:** `aiEnrichMax` (40) منتجاً للبحث؛ الشرح الإعلاني حتى 120 منتجاً؛ إن كان خطأ البحث إعدادياً (`no_grounding`، مفاتيح ناقصة، 401/403) يتوقف البحث بتحذير واحد، **والاستيراد لا يتعطل أبداً بسبب الإثراء** (تُفتح المراجعة مع تحذير).

**ألوان بصيغة كود (HEX):** ملفات المبيعات تكتب الدرجة ككود (`E07A5F`). `splitColorEntry` يقبل `E07A5F` و`#E07A5F` و`0xE07A5F` و`#E75` و`rgb(...)` و`#E07A5F - تيراكوتا`، ويحوّل الكود **حسابياً** (`hexToColorName`: أقرب اسم عربي في `COLOR_NAMES` بمسافة redmean، مع مراسٍ للألوان الصريحة) إلى اسم عربي (`تيراكوتا`، `بني`، `بيج`…) ويحتفظ بالكود كـ**درجة فعلية** (`item.colorHex` ← `data-color-hex` في البطاقة ← `colors[].hex` عند الحفظ) بدل الأزرق الافتراضي. اخترنا خوارزمية لا نموذجاً لغوياً لأن تسمية اللون من الكود حساب لا يجيده النموذج (الموجّه يطلب منه إبقاء الكود كما هو). كودان بنفس الاسم ← «بني» و«بني 2». الست خانات بلا `#` لا تُعدّ كوداً إلا إن حوت رقماً (فلا تُفهم كلمة مثل facade لوناً). `getColorHex('E07A5F')` يرجع `#E07A5F`. **إصلاح بيانات قديمة:** عند فتح منتج لونه مخزَّن باسم كود (`repairHexColorNames`) أو عند مغادرة حقل اسم اللون، يتحول الاسم إلى عربي وتُعاد تسمية مفاتيح المخزون (`كود||مقاس` ← `اسم||مقاس`) بنفس الكميات، ويُحفظ عند «حفظ».

**رسائل الإثراء:** فشل البحث أو عدم العثور أو ثقة منخفضة **لا تُعرض كرسالة** للمدير (تُسجَّل في Console فقط `[إثراء]`/`[أوصاف]`)؛ تكفي شارة كل بطاقة. يبقى ظاهراً فقط ما يخص الاستخراج (دفعة جدول فشلت، سطور مكررة دُمجت، عناصر أُهملت). والبحث يعيد المحاولة حتى 3 مرات بتأخير 2.5 ثانية ثم 5 (أخطاء الحصة المؤقتة 429/502/504 شائعة مع بحث متوازٍ) قبل أن يُعدّ المنتج «بلا بحث». أُزيلت جملة «يمكنك تعديل الاسم، السعر…» من نافذة المراجعة.

**ما أُلغي (2026-10-31، بطلب المالك):** البحث عن صور المنتجات بالذكاء الاصطناعي (`resolve_image` حُذف من الخادم نهائياً فلا سطح SSRF)، وزر «إكمال البيانات الناقصة» للمنتجات الموجودة. الصور تبقى: من الملف نفسه (رابط/هايبرلينك) أو الرفع اليدوي من البطاقة (📁 رفع) أو 🔗 رابط.

**⚠️ تنبيه للمدير (يظهر في البطاقة):** الألوان/المقاسات المقترحة من الإنترنت تُدخل المنتج في نظام «المصفوفة» (`Store.hasVariantMatrix`) فتُوزَّع الكمية بالتساوي عليها (مجموعها = الكمية الواردة)؛ مثال: 10 قطع و12 درجة ← 10 درجات بقطعة وواحدة بصفر. امسح حقل الألوان/المقاسات في البطاقة لتعطيلها، أو عدّل المخزون من نافذة المنتج بعد الحفظ.

**لتحسين دقة قراءة الصور أكثر:** عيّن `GEMINI_MODEL=gemini-3.5-flash` في Cloudflare (النموذج الأقوى من `flash-lite` في القراءة البصرية، أبطأ وأغلى قليلاً). لم يُقارَن حياً.

**لم يُختبر حياً (لا شبكة في بيئة التطوير):** اسم النموذج `gemini-3.5-flash` مع `google_search` + `responseJsonSchema` على حسابك (موثّق لنماذج Gemini 3 لكن لم تُجرَّب الدعوة الفعلية). بعد النشر جرّب **منتجين** أولاً قبل ملف كبير.
