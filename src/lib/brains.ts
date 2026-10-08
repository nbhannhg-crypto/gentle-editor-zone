// Built-in specialist brains catalog (browser-safe)
export type Specialist = { id: string; emoji: string; name: string; job: string; tab?: string };

export const SPECIALISTS: Specialist[] = [
  { id: "sales", emoji: "🛒", name: "عقل المبيعات", job: "يبيع منتجات التاجر، يرد على الزبائن، يقنع ويغلق الصفقات", tab: "products" },
  { id: "whatsapp", emoji: "💬", name: "عقل ربط الواتس", job: "يعلم التاجر يربط رقم واتساب خطوة بخطوة (تصوير الكود من استوديو الأصوات) ويشغل الرد التلقائي", tab: "studio" },
  { id: "shipping", emoji: "📦", name: "عقل الشحن", job: "يعرض شركات الشحن في السعودية والخليج (سمسا، أرامكس، SPL، ناقل، J&T، سبل، ريد بوكس، DHL، UPS) بالأسعار التقريبية والمدة، ويعلم كيف يربطها بالمتجر", tab: "products" },
  { id: "tiktok", emoji: "🎵", name: "عقل تيك توك", job: "يعلم ربط حساب تيك توك، يكتب ردود على التعليقات والرسائل لأي يوزر، وأفكار فيديوهات وبث", tab: "channels" },
  { id: "instagram", emoji: "📸", name: "عقل انستقرام", job: "يربط انستقرام ويرد على الدايركت والتعليقات ويكتب كابشنات", tab: "channels" },
  { id: "snap", emoji: "👻", name: "عقل سناب", job: "يربط سناب شات ويكتب سنابات ويرد على المتابعين", tab: "channels" },
  { id: "x", emoji: "✖️", name: "عقل إكس", job: "يكتب تغريدات وردود ويربط حساب إكس", tab: "channels" },
  { id: "telegram", emoji: "✈️", name: "عقل تيليقرام", job: "يربط بوت تيليقرام ويرد على الرسائل", tab: "channels" },
  { id: "facebook", emoji: "📘", name: "عقل فيسبوك", job: "يربط صفحة فيسبوك ويرد على ماسنجر", tab: "channels" },
  { id: "call", emoji: "📞", name: "عقل الاتصال", job: "يجهز مكالمة واتساب/هاتف لرقم محدد ويكتب سكربت المكالمة", tab: "studio" },
  { id: "voice", emoji: "🎙️", name: "عقل الصوت", job: "يكتب رسالة صوتية (مثل مساء الخير) ويولدها بصوت سعودي ويسمعها قبل الإرسال", tab: "studio" },
  { id: "design", emoji: "🎨", name: "عقل التصميم", job: "يصمم أفكار شعارات، بوسترات، ألوان، ونصوص إعلانات جاهزة", tab: "bots" },
  { id: "live", emoji: "🔴", name: "عقل البث المباشر", job: "يدير البث المباشر: سكربت افتتاح، ردود على التعليقات لحظياً، عروض أثناء البث، خطة كاملة", tab: "channels" },
  { id: "publish", emoji: "📣", name: "عقل النشر", job: "يكتب جدول نشر ومنشورات لكل منصة ويجهز الحملات", tab: "campaigns" },
  { id: "review", emoji: "🗂️", name: "عقل المراجعة والحفظ", job: "يراجع الردود ويصححها ويحفظ المعلومات المهمة ما ينساها أبداً", tab: "train" },
  { id: "training", emoji: "🎓", name: "عقل التدريب", job: "يعلّم الموظفة الذكية ردود جديدة ويحولها لقواعد محفوظة", tab: "train" },
  { id: "reader", emoji: "🔍", name: "عقل قراءة المحادثات", job: "يقرأ صورة/لصق محادثة بين التاجر وزبون ويفهمها ويكمل المحادثة بالرد المثالي بدون غلط", tab: "deals" },
  { id: "builder", emoji: "🏗️", name: "عقل إنشاء العقول", job: "يسأل التاجر أسئلة ذكية واحد واحد ويبني له عقل موظف جديد مخصص ويحفظه", tab: "" },
];

export const SOURCES = [["ai", "🤖 ذكاء اصطناعي"], ["library", "📚 من مكتبتي فقط"], ["both", "✨ الاثنين"]] as const;
