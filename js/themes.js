/* ==========================================================================
   themes.js — مكتبة الثيمات الجاهزة (بيانات فقط، لا تحتاج تعديلاً لكل متجر)
   --------------------------------------------------------------------------
   اختيار ثيم لمتجر:   js/config.js ← theme.preset: "اسم-الثيم"
   إضافة ثيم جديد:     انسخ أي كتلة أدناه، غيّر اسمها وألوانها، واحفظ. (أسهل طريقة: صفحة themes.html
                       تبني الثيم بالألوان وتعطيك الكود جاهزاً مع فحص التباين.)
   فحص كل الثيمات:     node tools/check-themes.js

   بنية الثيم:
     label, category, inspiredBy      وصف للعرض فقط (لا يؤثر على الموقع)
     colors                           الألوان الثمانية الأساسية (إلزامية) + أي مفتاح اختياري من theme.colors
                                      مثل headerBg / heroBg / footerBg / buttonBg / heroButtonBg ...
     fontFamily, fontWeights          خط Google Fonts يدعم العربية. ⚠️ الأوزان يجب أن يدعمها الخط فعلاً
                                      (مثلاً Almarai: 400;700 فقط) وإلا فشل تحميل الخط كله.
     radiusCard, radiusControl        استدارة البطاقات والأزرار (px). containerWidth اختياري
     cardImageRatio, cardImageFit     نسبة صورة المنتج ("1/1" "4/5" "3/4" "4/3") و"cover" أو "contain"
     cardSizes (اختياري)              أبعاد البطاقات بالبكسل لأربعة مواضع: homeProducts / homeCategories / productsPage /
                                      categoriesPage، ولكل موضع: width, height (حاسوب) و mobileWidth, mobileHeight (جوال).
                                      العرض 80–700 والطول 100–900. كل حقل اختياري؛ غير المحدد يبقى بالشكل الأصلي.
                                      مثال: cardSizes: { homeProducts: { width: 260, height: 400, mobileWidth: 165 } }

   كل ما يكتبه صاحب المتجر في config.js (ألوان/خط/استدارة) يتغلب على قيم الثيم.
   ملاحظة: الألوان "مستوحاة" من الانطباع العام لأساليب متاجر معروفة وليست نسخاً دقيقة لهوية أي علامة.
   ========================================================================== */
const STORE_THEMES = {

  /* ───────────── عام ───────────── */
  "navy-gold": {
    label: "كحلي وذهبي", category: "عام", inspiredBy: "متجر عام أنيق",
    colors: { primary: "#172554", secondary: "#2563EB", accent: "#D4A853", bg: "#F8FAFC", surface: "#FFFFFF", text: "#0F172A", textMuted: "#64748B", border: "#E2E8F0" },
    fontFamily: "Tajawal", fontWeights: "400;500;700", radiusCard: 14, radiusControl: 10, cardImageRatio: "1/1", cardImageFit: "cover"
  },
"my-theme4": {
  label: "ثيمي الجديد", category: "عام",
  colors: {
    primary: "#172554", secondary: "#2563EB", accent: "#D4A853", bg: "#F8FAFC", surface: "#FFFFFF", text: "#0F172A", textMuted: "#64748B", border: "#E2E8F0"
  },
  fontFamily: "Tajawal", fontWeights: "400;500;700", radiusCard: 14, radiusControl: 10, containerWidth: 1200, cardImageRatio: "1/1", cardImageFit: "contain",
  cardSizes: {
    homeCategories: { mobileWidth: 119, mobileHeight: 155 }
  }
},
  /* ───────────── إلكترونيات ───────────── */


"rayhana-telecom": {
    label: "ريحانة للاتصالات", category: "إلكترونيات", inspiredBy: "هوية شركة ريحانة للاتصالات (أزرق بحري وفيروزي مع لمسة ذهبية)",
    colors: { primary: "#0E4A7D", secondary: "#0294A7", accent: "#E29D38", bg: "#F4F8FA", surface: "#FFFFFF", text: "#1E293B", textMuted: "#64748B", border: "#D6E4EC" },
    fontFamily: "Tajawal", fontWeights: "400;500;700", radiusCard: 14, radiusControl: 10, cardImageRatio: "1/1", cardImageFit: "contain"
  },


  "tech-clean": {
    label: "تقنية نظيفة", category: "إلكترونيات", inspiredBy: "متاجر التقنية البيضاء الهادئة (أسلوب آبل)",
    colors: {
      primary: "#1D1D1F", secondary: "#0066CC", accent: "#F59E0B", bg: "#F5F5F7", surface: "#FFFFFF", text: "#1D1D1F", textMuted: "#6E6E73", border: "#D2D2D7",
      buttonBg: "#0071E3", buttonHoverBg: "#0058B0", heroBg: "#0B0B0D", heroButtonBg: "#0071E3"
    },
    fontFamily: "IBM Plex Sans Arabic", fontWeights: "400;500;700", radiusCard: 18, radiusControl: 12, cardImageRatio: "1/1", cardImageFit: "contain"
  },
  "electronics-market": {
    label: "سوق الإلكترونيات", category: "إلكترونيات", inspiredBy: "المتاجر الكبرى متعددة الأقسام (أسلوب أمازون)",
    colors: {
      primary: "#131921", secondary: "#007185", accent: "#FF9900", bg: "#EAEDED", surface: "#FFFFFF", text: "#0F1111", textMuted: "#565959", border: "#D5D9D9",
      headerBg: "#131921", footerBg: "#232F3E", heroBg: "#232F3E",
      buttonBg: "#FFD814", buttonText: "#0F1111", buttonHoverBg: "#F7CA00", heroButtonBg: "#FF9900", heroButtonText: "#0F1111"
    },
    fontFamily: "Almarai", fontWeights: "400;700", radiusCard: 8, radiusControl: 8, cardImageRatio: "1/1", cardImageFit: "contain"
  },
  "marketplace-yellow": {
    label: "سوق أصفر", category: "إلكترونيات / عام", inspiredBy: "الأسواق الإلكترونية الأصفر والأسود (أسلوب نون)",
    colors: {
      primary: "#1A1A1A", secondary: "#3866DF", accent: "#FEEE00", bg: "#F7F7FA", surface: "#FFFFFF", text: "#1A1A1A", textMuted: "#5F6368", border: "#E3E4E8",
      headerBg: "#FEEE00", footerBg: "#1A1A1A", heroBg: "#1A1A1A", buttonBg: "#3866DF", buttonHoverBg: "#2B50B5", heroButtonBg: "#FEEE00", heroButtonText: "#1A1A1A"
    },
    fontFamily: "Cairo", fontWeights: "400;600;700", radiusCard: 12, radiusControl: 10, cardImageRatio: "1/1", cardImageFit: "contain"
  },

  /* ───────────── ملابس وأزياء ───────────── */

"velvet-cosmetics": {
    label: "كوزمتك وفخامة", category: "تجميل وعناية", inspiredBy: "أرقى علامات التجميل العالمية والعناية بالبشرة (طابع ناعم وفخم بدرجات الوردي المترب، التوت الداكن، ولمسات الشامبانيا الذهبية)",
    colors: { primary: "#4A0E2E", secondary: "#C47B89", accent: "#D4A373", bg: "#FDF8F7", surface: "#FFFFFF", headerBg: "#FFFFFF", heroBg: "#F7ECE9", bandBg: "#4A0E2E", footerBg: "#2B061A", sidebarBg: "#3A0A23", buttonBg: "#4A0E2E", buttonText: "#FFFFFF", buttonHoverBg: "#63133D", heroButtonBg: "#4A0E2E", heroButtonText: "#FFFFFF", text: "#422831", textMuted: "#8C7079", heading: "#2B061A", price: "#4A0E2E", headerText: "#4A0E2E", heroText: "#2B061A", bandText: "#FDF8F7", footerText: "#D9B8C2", sidebarText: "#F0DDE3", border: "#EEDCDA", success: "#2E7D32", warning: "#D97706", error: "#C53030" },
    fontFamily: "Almarai", fontWeights: "300;400;700;800", fontUrl: "https://fonts.googleapis.com/css2?family=Almarai:wght@300;400;700;800&display=swap", radiusCard: 18, radiusControl: 12, containerWidth: 1280, cardImageRatio: "1/1", cardImageFit: "contain",
    cardSizes: { homeProducts: { width: "260px", height: "auto", mobileWidth: "160px", mobileHeight: "auto" }, homeCategories: { width: "190px", height: "auto", mobileWidth: "130px", mobileHeight: "auto" }, productsPage: { width: "100%", height: "auto", mobileWidth: "100%", mobileHeight: "auto" }, categoriesPage: { width: "100%", height: "auto", mobileWidth: "100%", mobileHeight: "auto" } },
    allowPreview: true
  },

   
  "fashion-mono": {
    label: "أزياء أبيض وأسود", category: "ملابس", inspiredBy: "متاجر الأزياء التحريرية الحادة (أسلوب زارا)",
    colors: {
      primary: "#111111", secondary: "#3F3F46", accent: "#E11D48", bg: "#F7F7F7", surface: "#FFFFFF", text: "#111111", textMuted: "#6B6B6B", border: "#E5E5E5",
      heroBg: "#E9E6E1", heroButtonBg: "#111111"
    },
    fontFamily: "Readex Pro", fontWeights: "400;500;700", radiusCard: 0, radiusControl: 0, cardImageRatio: "3/4", cardImageFit: "cover"
  },
  "clothing-burgundy": {
    label: "عنابي وعاجي", category: "ملابس", inspiredBy: "متاجر الأزياء الراقية الدافئة",
    colors: { primary: "#5E2A32", secondary: "#8B3A4A", accent: "#C9A45C", bg: "#FBF8F2", surface: "#FFFFFF", text: "#2B2220", textMuted: "#7B6F6A", border: "#E8DFD3" },
    fontFamily: "Tajawal", fontWeights: "400;500;700", radiusCard: 14, radiusControl: 10, cardImageRatio: "4/5", cardImageFit: "cover"
  },
  "sport-bold": {
    label: "رياضة جريئة", category: "ملابس رياضية / أحذية", inspiredBy: "متاجر الرياضة الأسود والبرتقالي (أسلوب نايكي)",
    colors: {
      primary: "#111111", secondary: "#D43F00", accent: "#FA5400", bg: "#F5F5F5", surface: "#FFFFFF", text: "#111111", textMuted: "#6B6B6D", border: "#E5E5E5",
      heroBg: "#111111", heroButtonBg: "#FFFFFF", heroButtonText: "#111111"
    },
    fontFamily: "Changa", fontWeights: "400;500;700", radiusCard: 4, radiusControl: 28, cardImageRatio: "1/1", cardImageFit: "cover"
  },

  /* ───────────── تجميل وعطور وفخامة ───────────── */

"velvet-cosmetics": {
    label: "كوزمتك وفخامة", category: "تجميل وعناية", inspiredBy: "أرقى علامات التجميل العالمية والعناية بالبشرة (طابع ناعم وفخم بدرجات الوردي المترب، التوت الداكن، ولمسات الشامبانيا الذهبية)",
    colors: { primary: "#4A0E2E", secondary: "#C47B89", accent: "#D4A373", bg: "#FDF8F7", surface: "#FFFFFF", headerBg: "#FFFFFF", heroBg: "#F7ECE9", bandBg: "#4A0E2E", footerBg: "#2B061A", sidebarBg: "#3A0A23", buttonBg: "#4A0E2E", buttonText: "#FFFFFF", buttonHoverBg: "#63133D", heroButtonBg: "#4A0E2E", heroButtonText: "#FFFFFF", text: "#422831", textMuted: "#8C7079", heading: "#2B061A", price: "#4A0E2E", headerText: "#4A0E2E", heroText: "#2B061A", bandText: "#FDF8F7", footerText: "#D9B8C2", sidebarText: "#F0DDE3", border: "#EEDCDA", success: "#2E7D32", warning: "#D97706", error: "#C53030" },
    fontFamily: "Marhey", fontWeights: "400;500;600;700", fontUrl: "https://fonts.googleapis.com/css2?family=Marhey:wght@400;500;600;700&display=swap", radiusCard: 18, radiusControl: 12, containerWidth: 1280, cardImageRatio: "1/1", cardImageFit: "contain",
    cardSizes: { homeProducts: { width: "260px", height: "auto", mobileWidth: "160px", mobileHeight: "auto" }, homeCategories: { width: "190px", height: "auto", mobileWidth: "130px", mobileHeight: "auto" }, productsPage: { width: "100%", height: "auto", mobileWidth: "100%", mobileHeight: "auto" }, categoriesPage: { width: "100%", height: "auto", mobileWidth: "100%", mobileHeight: "auto" } },
    allowPreview: true
  },


   
  "cosmetics-rose": {
    label: "وردي هادئ", category: "كوزمتك", inspiredBy: "متاجر التجميل الناعمة",
    colors: { primary: "#5B4146", secondary: "#9E5A66", accent: "#C5A46D", bg: "#FFF9F5", surface: "#FFFFFF", text: "#33302F", textMuted: "#7A7572", border: "#EBD8DA", heroButtonText: "#33302F" },
    fontFamily: "Tajawal", fontWeights: "400;500;700", radiusCard: 14, radiusControl: 10, cardImageRatio: "1/1", cardImageFit: "cover"
  },
  "beauty-glam": {
    label: "جمال وتألق", category: "كوزمتك / عطور", inspiredBy: "متاجر الجمال الأسود والتوت (أسلوب سيفورا)",
    colors: {
      primary: "#1A1A1A", secondary: "#B4144B", accent: "#F4A6C0", bg: "#FFFBFC", surface: "#FFFFFF", text: "#1A1A1A", textMuted: "#6B6168", border: "#F2DDE5",
      heroBg: "#2A0F1B", buttonBg: "#1A1A1A", buttonHoverBg: "#B4144B", heroButtonBg: "#F4A6C0", heroButtonText: "#2A0F1B"
    },
    fontFamily: "Tajawal", fontWeights: "400;500;700", radiusCard: 12, radiusControl: 24, cardImageRatio: "1/1", cardImageFit: "cover"
  },
  "luxury-gold": {
    label: "فخامة ذهبية", category: "عطور / مجوهرات / ساعات", inspiredBy: "متاجر الفخامة الأسود والذهبي الشامبانيا",
    colors: {
      primary: "#14110F", secondary: "#8A6A2F", accent: "#C9A961", bg: "#FAF7F2", surface: "#FFFFFF", text: "#1C1917", textMuted: "#6F6860", border: "#E7DFD2",
      buttonHoverBg: "#8A6A2F", heroButtonBg: "#C9A961", heroButtonText: "#14110F"
    },
    fontFamily: "El Messiri", fontWeights: "400;500;700", radiusCard: 2, radiusControl: 2, cardImageRatio: "1/1", cardImageFit: "cover"
  },

  /* ───────────── بقالة وصحة ومنزل وأطفال ───────────── */
  "grocery-fresh": {
    label: "طازج أخضر", category: "بقالة / مواد غذائية", inspiredBy: "متاجر البقالة والهايبر ماركت",
    colors: {
      primary: "#14532D", secondary: "#15803D", accent: "#F59E0B", bg: "#F6FAF4", surface: "#FFFFFF", text: "#10281A", textMuted: "#546A5B", border: "#DCE7D8",
      buttonBg: "#15803D", buttonHoverBg: "#166534", heroButtonBg: "#FACC15", heroButtonText: "#14532D"
    },
    fontFamily: "Cairo", fontWeights: "400;600;700", radiusCard: 14, radiusControl: 10, cardImageRatio: "1/1", cardImageFit: "contain"
  },
  "pharmacy-teal": {
    label: "صيدلية تركوازي", category: "صيدلية / صحة", inspiredBy: "الصيدليات والعناية الصحية",
    colors: { primary: "#172B45", secondary: "#0E7C7E", accent: "#E8A33D", bg: "#F6FAFA", surface: "#FFFFFF", text: "#172B45", textMuted: "#5E7184", border: "#DCE8EA" },
    fontFamily: "Tajawal", fontWeights: "400;500;700", radiusCard: 14, radiusControl: 10, cardImageRatio: "1/1", cardImageFit: "contain"
  },
  "home-blue-yellow": {
    label: "منزل أزرق وأصفر", category: "أثاث / ديكور / منزل", inspiredBy: "متاجر الأثاث والمنزل (أسلوب إيكيا)",
    colors: {
      primary: "#0058A3", secondary: "#0B6BCB", accent: "#FFDA1A", bg: "#F5F5F5", surface: "#FFFFFF", text: "#111111", textMuted: "#484848", border: "#DFDFDF",
      headerBg: "#FFFFFF", heroButtonBg: "#FFDA1A", heroButtonText: "#111111"
    },
    fontFamily: "Noto Kufi Arabic", fontWeights: "400;500;700", radiusCard: 2, radiusControl: 24, cardImageRatio: "4/3", cardImageFit: "contain"
  },
  "kids-playful": {
    label: "أطفال مرح", category: "ألعاب / مستلزمات أطفال", inspiredBy: "متاجر الأطفال الملونة",
    colors: {
      primary: "#312E81", secondary: "#C2410C", accent: "#FFC83D", bg: "#FFFBEB", surface: "#FFFFFF", text: "#2B2A4C", textMuted: "#66648A", border: "#F1E4B8",
      buttonBg: "#C2410C", buttonHoverBg: "#9A3412"
    },
    fontFamily: "Baloo Bhaijaan 2", fontWeights: "400;500;700", radiusCard: 24, radiusControl: 16, cardImageRatio: "1/1", cardImageFit: "cover"
  },
  "pet-olive": {
    label: "زيتوني طبيعي", category: "حيوانات أليفة / طبيعة", inspiredBy: "متاجر المنتجات الطبيعية والحيوانات الأليفة",
    colors: { primary: "#354723", secondary: "#526B32", accent: "#91AA52", bg: "#FAF9F3", surface: "#FFFFFF", text: "#26301A", textMuted: "#6B7460", border: "#E3E5D6", heroButtonText: "#1F2A12" },
    fontFamily: "Tajawal", fontWeights: "400;500;700", radiusCard: 14, radiusControl: 10, cardImageRatio: "1/1", cardImageFit: "cover"
  }

  /* أضف ثيمك الجديد هنا (لا تنسَ الفاصلة بعد الثيم الذي قبله):
  ,"my-theme": {
    label: "اسم يظهر في المعاينة", category: "نوع المتجر", inspiredBy: "ملاحظة",
    colors: { primary: "#...", secondary: "#...", accent: "#...", bg: "#...", surface: "#FFFFFF", text: "#...", textMuted: "#...", border: "#..." },
    fontFamily: "Tajawal", fontWeights: "400;500;700", radiusCard: 14, radiusControl: 10, cardImageRatio: "1/1", cardImageFit: "cover"
  }
  */
};
