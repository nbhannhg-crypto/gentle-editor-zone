// تحويل الأرقام لكلمات باللهجة السعودية المنطوقة (٢٥ → خمسة وعشرين) + تصحيح أخطاء شائعة
const ONES = ["صفر","واحد","اثنين","ثلاثة","أربعة","خمسة","ستة","سبعة","ثمانية","تسعة","عشرة","احدعش","اثنعش","ثلطعش","أربعطعش","خمسطعش","ستطعش","سبعطعش","ثمنطعش","تسعطعش"];
const TENS = ["","","عشرين","ثلاثين","أربعين","خمسين","ستين","سبعين","ثمانين","تسعين"];
const HUND = ["","مية","ميتين","ثلاثمية","أربعمية","خمسمية","ستمية","سبعمية","ثمانمية","تسعمية"];
function under100(n: number): string { if (n < 20) return ONES[n]!; const o = n % 10, t = TENS[Math.floor(n / 10)]!; return o ? `${ONES[o]} و${t}` : t; }
export function saudiNum(n: number): string {
  if (!Number.isFinite(n) || n < 0 || n > 9999) return String(n);
  if (n < 100) return under100(n);
  if (n < 1000) { const h = HUND[Math.floor(n / 100)]!, r = n % 100; return r ? `${h} و${under100(r)}` : h; }
  const th = Math.floor(n / 1000), r = n % 1000; const t = th === 1 ? "ألف" : th === 2 ? "ألفين" : `${under100(th)} آلاف`;
  return r ? `${t} و${saudiNum(r)}` : t;
}
const AR = "٠١٢٣٤٥٦٧٨٩";
export function fixSpeech(t: string): string {
  return t
    .replace(/[٠-٩]/g, (d) => String(AR.indexOf(d)))
    .replace(/\d+/g, (m) => saudiNum(Number(m)))
    .replace(/(^|\s)سم(?=$|\s|[،.])/g, "$1سنتي").replace(/(^|\s)(كجم|كغ|كلغ)(?=$|\s|[،.])/g, "$1كيلو")
    .replace(/لل?ه?جدين|للهجادين|لهجادين|للجاديين/g, "للجادين")
    .replace(/(عشر|ثلاث|أربع|خمس|ست|سبع|ثمان|تسع)ون(?=$|\s|[،.])/g, "$1ين");
}
