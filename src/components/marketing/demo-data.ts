/**
 * بيانات عرض للموقع العام — **ليست بيانات إنتاج**.
 *
 * ★ تعيش في ملفّ واحد مسمّى بوضوح حتى لا تختلط بأي استعلام حقيقي،
 * ولا تُستورد خارج `components/marketing/`.
 *
 * ★ الأرقام متواضعة وواقعية لمتجر سوداني صغير في شهره الأول. لم
 * تُنفخ لتجميل التصميم: متجر يعرض «١٢٤ مليون جنيه مبيعات» في لقطة
 * تسويقية يكذب على التاجر الذي يقرأ، ويصنع توقّعًا يُخيّب حين يبدأ.
 * ما يُعرض هنا هو ما قد يراه تاجر فعلي بعد أسابيع من العمل.
 */

export const DEMO_STORE = 'متجر أم درمان للعطور';

export type DemoOrder = {
  number: string; customer: string; city: string;
  total: number; status: 'new' | 'confirmed' | 'shipped' | 'delivered';
  minutesAgo: number;
};

export const DEMO_ORDERS: DemoOrder[] = [
  { number: '1047', customer: 'سارة عبد الرحمن', city: 'الخرطوم',  total: 47_500, status: 'new',       minutesAgo: 4 },
  { number: '1046', customer: 'محمد الطيب',      city: 'أم درمان', total: 128_000, status: 'confirmed', minutesAgo: 38 },
  { number: '1045', customer: 'هبة إدريس',       city: 'بحري',     total: 62_000, status: 'shipped',   minutesAgo: 95 },
  { number: '1044', customer: 'عمر الفاتح',      city: 'الخرطوم',  total: 35_000, status: 'delivered', minutesAgo: 210 },
];

export const DEMO_PRODUCTS = [
  { name: 'عطر صندل أصلي 50مل', price: 47_500, stock: 12, sold: 38 },
  { name: 'بخور معمول فاخر',     price: 28_000, stock: 3,  sold: 64 },
  { name: 'دهن عود مركّز 12مل',  price: 96_000, stock: 0,  sold: 21 },
  { name: 'مسك أبيض 30مل',       price: 22_500, stock: 27, sold: 15 },
];

/** مبيعات ١٤ يومًا — الأحدث آخرًا. */
export const DEMO_SALES: { label: string; value: number }[] = [
  { label: 'الأحد',    value: 118_000 }, { label: 'الاثنين',  value: 96_500 },
  { label: 'الثلاثاء', value: 142_000 }, { label: 'الأربعاء', value: 88_000 },
  { label: 'الخميس',   value: 176_500 }, { label: 'الجمعة',   value: 61_000 },
  { label: 'السبت',    value: 134_000 }, { label: 'الأحد',    value: 152_000 },
  { label: 'الاثنين',  value: 119_500 }, { label: 'الثلاثاء', value: 168_000 },
  { label: 'الأربعاء', value: 145_000 }, { label: 'الخميس',   value: 197_000 },
  { label: 'الجمعة',   value: 84_500 },  { label: 'السبت',    value: 173_000 },
];

export const DEMO_TOTALS = {
  revenue: 1_875_500,   // مجموع الأسبوعين أعلاه
  orders: 47,
  customers: 31,
  averageOrder: 39_900,
};
