import type { Metadata } from "next";
import Link from "next/link";
import {
  FileCheck2,
  ShoppingBag,
  UserRound,
  Store,
  Receipt,
  Handshake,
  ImageUp,
  Ban,
  UserX,
  Copyright,
  ShieldAlert,
  RefreshCw,
  Mail,
  MessageCircle,
  Phone,
} from "lucide-react";
import { SITE_NAME, SITE_NAME_EN } from "@/lib/site";

/**
 * جهات الاتصال المعروضة للمستخدم.
 *
 * تُقرأ اليوم من هذا الثابت لا من `app_settings`، لأن شروط الخدمة يجب أن تُعرض
 * لكل زائر — بما فيهم غير المسجَّلين — بينما جدول `app_settings` محمي بـRLS.
 * القيم مطابقة لصفحة /privacy عمداً كي لا تتضارب الصفحتان.
 */
const CONTACT = {
  email: "allameldaw0022@gmail.com",
  phone: "0911997506",
  whatsapp: "249911997506",
} as const;

const LAST_UPDATED = "٨ سبتمبر ٢٠٢٦";

export const metadata: Metadata = {
  title: "شروط الخدمة",
  description: `الشروط التي تحكم استخدام ${SITE_NAME}: الحسابات، المتاجر، الطلبات، مسؤوليات البائع والمشتري، والاستخدام الممنوع.`,
  alternates: { canonical: "/terms" },
  openGraph: {
    title: `شروط الخدمة | ${SITE_NAME}`,
    description: `الشروط التي تحكم استخدام ${SITE_NAME} للبائعين والمشترين.`,
    url: "/terms",
  },
};

type Section = {
  id: string;
  title: string;
  Icon: typeof UserRound;
  body: React.ReactNode;
};

const sections: Section[] = [
  {
    id: "acceptance",
    title: "قبول الشروط",
    Icon: FileCheck2,
    body: (
      <>
        <p>
          باستخدامك {SITE_NAME} — تصفّحاً أو تسجيلاً أو بيعاً أو شراءً — فأنت
          توافق على هذه الشروط. إن لم توافق عليها، فالرجاء عدم استخدام المنصة.
        </p>
        <p>
          تُقرأ هذه الشروط مع{" "}
          <Link
            href="/privacy"
            className="text-primary hover:text-primary-dark underline"
          >
            سياسة الخصوصية
          </Link>
          ، وهما معاً يشكّلان الاتفاق بينك وبين {SITE_NAME}.
        </p>
        <p>
          يجب أن تكون <strong>بالغاً سنّ الرشد</strong> وأهلاً قانوناً لإبرام
          العقود. إن كنت تستخدم المنصة نيابة عن منشأة، فأنت تُقرّ بأنك مخوّل
          بإلزامها بهذه الشروط.
        </p>
      </>
    ),
  },
  {
    id: "service",
    title: `تعريف خدمة ${SITE_NAME}`,
    Icon: ShoppingBag,
    body: (
      <>
        <p>
          {SITE_NAME} ({SITE_NAME_EN}) <strong>سوق إلكتروني وسيط</strong> يتيح
          للبائعين في السودان عرض منتجاتهم، ويتيح للمشترين تصفّحها وطلبها
          والتواصل مع البائع.
        </p>
        <p>
          <strong>نحن لسنا طرفاً في عقد البيع.</strong> العقد يقوم بين المشتري
          والبائع مباشرة. دورنا هو توفير المنصة التي تجمعهما وأدوات إدارة العرض
          والطلب.
        </p>
        <ul>
          <li>لا نملك المنتجات المعروضة ولا نخزّنها ولا نشحنها.</li>
          <li>لا نتحصّل ثمن الطلبات — الدفع يتم بين المشتري والبائع.</li>
          <li>لا نضمن جودة منتج ولا صحّة وصفه؛ البائع مسؤول عن ذلك.</li>
        </ul>
        <p>
          نقدّم إضافة إلى ذلك خدمات اختيارية للبائعين مثل خطط الاشتراك وتمييز
          المتاجر وبرنامج المسوّقين، ولها شروطها المعلنة داخل المنصة.
        </p>
      </>
    ),
  },
  {
    id: "accounts",
    title: "حسابات المستخدمين",
    Icon: UserRound,
    body: (
      <>
        <ul>
          <li>
            تلتزم بتقديم <strong>بيانات صحيحة</strong> عند التسجيل، وبتحديثها
            كلما تغيّرت.
          </li>
          <li>
            الحساب <strong>شخصي</strong>؛ لا تشاركه مع غيرك ولا تبعه ولا تنقله.
          </li>
          <li>
            أنت مسؤول عن سرّية كلمة مرورك وعن كل نشاط يجري عبر حسابك.
          </li>
          <li>
            إن اشتبهت في وصول غير مصرّح به إلى حسابك، أبلغنا فوراً.
          </li>
          <li>
            لا يجوز إنشاء حسابات متعددة للتحايل على قيد أو عقوبة أو لتضخيم
            التقييمات.
          </li>
          <li>
            حساب البائع يخضع لمراجعة، ولنا أن نطلب ما يثبت هوية المنشأة قبل
            تفعيله أو بعده.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "stores",
    title: "المتاجر والمنتجات",
    Icon: Store,
    body: (
      <>
        <p>إن كنت بائعاً فأنت تلتزم بأن:</p>
        <ul>
          <li>
            تعرض <strong>منتجات حقيقية تملكها أو مخوّل ببيعها</strong>، وتكون
            متاحة فعلاً بالكمية المعلنة.
          </li>
          <li>
            يكون الوصف والسعر والصور <strong>مطابقة للمنتج الفعلي</strong>؛ لا
            صور مضللة ولا مواصفات مبالغ فيها.
          </li>
          <li>
            يكون السعر المعلن هو السعر النهائي، مع بيان رسوم التوصيل بوضوح.
          </li>
          <li>
            تلتزم بأنظمة السودان في ما تعرضه، ولا تدرج سلعة يحظر تداولها.
          </li>
          <li>
            تحدّث حالة المنتج فور نفاده أو تغيّر سعره.
          </li>
        </ul>
        <p>
          نحتفظ بحق <strong>مراجعة أي منتج أو متجر وإخفائه أو رفضه</strong> إذا
          خالف هذه الشروط أو ورد بشأنه بلاغ جدّي، دون أن يترتب على ذلك تعويض.
        </p>
      </>
    ),
  },
  {
    id: "orders",
    title: "الطلبات والمعاملات",
    Icon: Receipt,
    body: (
      <>
        <p>
          عند إتمام الطلب تُرسل تفاصيله إلى البائع، وتنشأ من تلك اللحظة علاقة
          تعاقدية <strong>بين المشتري والبائع</strong>.
        </p>
        <ul>
          <li>
            <strong>الدفع:</strong> الوضع السائد على المنصة هو{" "}
            <strong>الدفع عند الاستلام</strong>، أو ما يتفق عليه الطرفان مباشرة.
            المنصة لا تستقبل ثمن الطلبات ولا تحتفظ به.
          </li>
          <li>
            <strong>التوصيل:</strong> يتولاه البائع أو من ينيبه، ويلتزم بالمدة
            والرسوم المعلنة في الطلب.
          </li>
          <li>
            <strong>الإلغاء:</strong> يجوز للمشتري الإلغاء قبل الشحن، وللبائع
            الإلغاء إذا نفد المنتج أو تعذّر الوصول للمشتري، مع بيان السبب.
          </li>
          <li>
            <strong>الإرجاع والاستبدال:</strong> يخضع لسياسة البائع المعلنة
            ولأحكام حماية المستهلك السارية.
          </li>
          <li>
            <strong>النزاعات:</strong> يُسوّى النزاع بين الطرفين أولاً. وقد
            نتدخّل عبر الدعم للمساعدة على الوصول إلى حل، دون أن يجعلنا ذلك طرفاً
            في العقد أو ضامناً لأيٍّ منهما.
          </li>
        </ul>
        <p>
          أما <strong>اشتراكات البائعين ورسوم الخدمات الاختيارية</strong> فتُدفع
          للمنصة مباشرة، وتُراجَع إيصالاتها يدوياً قبل التفعيل.
        </p>
      </>
    ),
  },
  {
    id: "duties",
    title: "مسؤوليات البائع والمشتري",
    Icon: Handshake,
    body: (
      <>
        <p>
          <strong>يلتزم البائع بأن:</strong>
        </p>
        <ul>
          <li>يجهّز الطلب ويسلّمه في المدة المعلنة.</li>
          <li>يسلّم المنتج مطابقاً لما عُرض، سليماً وبالكمية المتفق عليها.</li>
          <li>يردّ على استفسارات المشتري في وقت معقول.</li>
          <li>يحترم خصوصية بيانات المشتري ولا يستخدمها خارج تنفيذ الطلب.</li>
        </ul>
        <p>
          <strong>يلتزم المشتري بأن:</strong>
        </p>
        <ul>
          <li>يقدّم عنواناً ورقم هاتف صحيحين.</li>
          <li>يكون متاحاً لاستلام الطلب في الوقت المتفق عليه.</li>
          <li>يدفع الثمن المتفق عليه عند الاستلام.</li>
          <li>لا يقدّم طلبات وهمية أو كيدية.</li>
        </ul>
        <p>
          الإخلال المتكرر بهذه الالتزامات — من أي طرف — يعرّض الحساب للتعليق أو
          الإنهاء.
        </p>
      </>
    ),
  },
  {
    id: "content",
    title: "المحتوى والصور المرفوعة",
    Icon: ImageUp,
    body: (
      <>
        <p>
          تبقى <strong>ملكية ما ترفعه لك</strong>: صورك ونصوصك ووصف منتجاتك.
        </p>
        <p>
          وبرفعك إياها تمنح {SITE_NAME} <strong>ترخيصاً غير حصري وبلا مقابل</strong>{" "}
          لعرضها وتخزينها وتصغيرها داخل المنصة ووسائل التعريف بها، وذلك بالقدر
          اللازم لتشغيل الخدمة فقط. ينتهي هذا الترخيص عند حذفك للمحتوى، عدا ما
          يلزم بقاؤه في سجلات الطلبات المنفَّذة.
        </p>
        <p>وأنت تقرّ بأن ما ترفعه:</p>
        <ul>
          <li>من إنتاجك أو تملك حق استخدامه.</li>
          <li>لا ينتهك حق مؤلف أو علامة تجارية لأحد.</li>
          <li>لا يحتوي مادة مخالفة للنظام أو الآداب العامة.</li>
          <li>
            لا يتضمن بيانات شخصية لطرف ثالث دون إذنه، ولا مستندات هوية في الصور
            العامة.
          </li>
        </ul>
        <p>
          لنا أن نزيل أي محتوى مخالف دون إشعار مسبق، وأن نستجيب لبلاغات انتهاك
          الملكية الفكرية.
        </p>
      </>
    ),
  },
  {
    id: "prohibited",
    title: "الاستخدام الممنوع",
    Icon: Ban,
    body: (
      <>
        <p>يُمنع منعاً باتاً استخدام المنصة في أيٍّ مما يلي:</p>
        <ul>
          <li>
            عرض سلع محظورة نظاماً: المخدرات، الأسلحة، الأدوية غير المرخّصة،
            المواد الخطرة، أو ما يُحظر تداوله.
          </li>
          <li>
            بيع منتجات <strong>مقلَّدة</strong> أو منتحلة لعلامة تجارية.
          </li>
          <li>الاحتيال، أو الإعلان الكاذب، أو التلاعب بالأسعار.</li>
          <li>
            <strong>التقييمات الزائفة</strong> أو الطلبات الوهمية أو أي تضخيم
            مصطنع للسمعة.
          </li>
          <li>
            جمع بيانات المستخدمين أو استخراجها آلياً، أو محاولة الوصول إلى
            حسابات أو بيانات لا تخصّك.
          </li>
          <li>
            محاولة اختراق المنصة أو تعطيلها أو تجاوز حدودها التقنية أو اختبار
            ثغراتها دون إذن كتابي.
          </li>
          <li>
            إرسال رسائل مزعجة أو محتوى مسيء أو تحرّش بمستخدم آخر.
          </li>
          <li>
            تحويل التعامل خارج المنصة بقصد التهرّب من رسومها أو من ضوابطها.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "suspension",
    title: "تعليق الحساب أو إنهاؤه",
    Icon: UserX,
    body: (
      <>
        <p>
          لنا أن <strong>نعلّق الحساب أو ننهيه</strong> إذا خالف هذه الشروط، أو
          ورد بشأنه بلاغ جدّي، أو كان في استمراره ضرر على مستخدمين آخرين أو على
          المنصة.
        </p>
        <ul>
          <li>
            في المخالفات البسيطة نُنبّه أولاً ونمنح مهلة للتصحيح كلما أمكن.
          </li>
          <li>
            في المخالفات الجسيمة — كالاحتيال أو بيع محظور — يكون الإيقاف
            <strong> فورياً ودون إشعار مسبق</strong>.
          </li>
          <li>
            الطلبات القائمة وقت الإيقاف تبقى التزاماً على صاحب الحساب حتى
            إتمامها.
          </li>
          <li>
            الاشتراك المدفوع لا يُردّ إذا كان الإيقاف بسبب مخالفة من صاحب
            الحساب.
          </li>
        </ul>
        <p>
          ويحق لك أنت أيضاً <strong>إنهاء حسابك في أي وقت</strong> وطلب حذف
          بياناتك وفق ما هو موضّح في{" "}
          <Link
            href="/privacy#rights"
            className="text-primary hover:text-primary-dark underline"
          >
            سياسة الخصوصية
          </Link>
          .
        </p>
      </>
    ),
  },
  {
    id: "ip",
    title: "الملكية الفكرية",
    Icon: Copyright,
    body: (
      <>
        <ul>
          <li>
            اسم <strong>{SITE_NAME}</strong> و<strong>{SITE_NAME_EN}</strong>{" "}
            وشعاره وهويته البصرية وتصميم المنصة وشفرتها البرمجية — ملك للمنصة،
            ولا يجوز نسخها أو استخدامها دون إذن كتابي.
          </li>
          <li>
            محتوى المتاجر والمنتجات ملك لأصحابه من البائعين، ولكلٍّ حقوقه عليه.
          </li>
          <li>
            لا يمنحك استخدام المنصة أي حق في علاماتها أو محتواها خارج ما تتيحه
            الخدمة.
          </li>
        </ul>
        <p>
          إن رأيت محتوى ينتهك حقاً تملكه، راسلنا بتفاصيل الحق وموضع المخالفة عبر
          الوسائل أدناه، وسنتصرّف بما يلزم.
        </p>
      </>
    ),
  },
  {
    id: "liability",
    title: "حدود المسؤولية",
    Icon: ShieldAlert,
    body: (
      <>
        <p>
          تُقدَّم المنصة <strong>&laquo;كما هي&raquo;</strong>. نبذل جهداً معقولاً
          لإتاحتها وتأمينها، لكننا لا نضمن خلوّها من الأعطال أو الانقطاع.
        </p>
        <p>
          <strong>لا يتحمّل {SITE_NAME} مسؤولية:</strong>
        </p>
        <ul>
          <li>جودة المنتجات أو صحّة أوصافها أو مطابقتها للتوقعات.</li>
          <li>تأخّر التسليم أو عدمه، أو نزاع بين مشترٍ وبائع.</li>
          <li>الاتفاقات أو المدفوعات التي تتم خارج المنصة.</li>
          <li>انقطاع الخدمة لسبب خارج عن إرادتنا كعطل في شبكة أو مزوّد.</li>
          <li>الأضرار غير المباشرة أو التبعية كفوات الكسب أو فقد فرصة.</li>
        </ul>
        <p>
          وفي كل الأحوال، لا تتجاوز مسؤوليتنا — إن ثبتت — ما دفعتَه للمنصة من
          رسوم خدمات خلال الاثني عشر شهراً السابقة للواقعة.
        </p>
        <p>
          لا يحدّ هذا البند من أي حق لا يجوز نظاماً التنازل عنه أو استبعاده.
        </p>
      </>
    ),
  },
  {
    id: "changes",
    title: "تعديل الشروط",
    Icon: RefreshCw,
    body: (
      <>
        <p>
          قد نعدّل هذه الشروط كلما تطوّرت الخدمة أو تغيّرت المتطلبات النظامية.
          يظهر تاريخ آخر تحديث أعلى الصفحة دائماً.
        </p>
        <p>
          وإن كان التعديل <strong>جوهرياً</strong> — كأن يمسّ الرسوم أو
          المسؤوليات أو حقوق الإنهاء — فسنُعلمك عبر إشعار داخل المنصة أو رسالة
          إلى بريدك قبل أن يسري.
        </p>
        <p>
          استمرارك في استخدام المنصة بعد سريان التعديل يُعدّ قبولاً به. وإن لم
          توافق، فلك إنهاء حسابك.
        </p>
      </>
    ),
  },
];

export default function TermsPage() {
  return (
    <main className="flex-1 w-full">
      {/* ── ترويسة ─────────────────────────────────────────── */}
      <section className="bg-navy text-white">
        <div className="max-w-3xl mx-auto w-full px-4 py-10 sm:py-14">
          <p className="text-gold text-xs font-semibold tracking-wide mb-2">
            {SITE_NAME} · {SITE_NAME_EN}
          </p>
          <h1 className="font-extrabold text-2xl sm:text-3xl">شروط الخدمة</h1>
          <p className="text-white/70 text-sm mt-3 leading-relaxed">
            هذه الشروط تحكم استخدامك للمنصة بائعاً كنت أو مشترياً. كتبناها بلغة
            واضحة كي تعرف حقوقك والتزاماتك قبل أن تبدأ.
          </p>
          <p className="text-white/50 text-xs mt-4">آخر تحديث: {LAST_UPDATED}</p>
        </div>
      </section>

      <div className="max-w-3xl mx-auto w-full p-4 sm:py-8">
        {/* ── فهرس ─────────────────────────────────────────── */}
        <nav
          aria-label="محتويات الشروط"
          className="bg-white rounded-2xl border border-black/5 p-5 mb-4"
        >
          <h2 className="font-bold text-sm text-navy mb-3">المحتويات</h2>
          <ol className="grid sm:grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
            {sections.map((s, i) => (
              <li key={s.id} className="flex gap-2">
                <span className="text-neutral-400 tabular-nums shrink-0">
                  {i + 1}.
                </span>
                <a
                  href={`#${s.id}`}
                  className="text-primary hover:text-primary-dark hover:underline"
                >
                  {s.title}
                </a>
              </li>
            ))}
            <li className="flex gap-2">
              <span className="text-neutral-400 tabular-nums shrink-0">
                {sections.length + 1}.
              </span>
              <a
                href="#contact"
                className="text-primary hover:text-primary-dark hover:underline"
              >
                كيف تتواصل معنا
              </a>
            </li>
          </ol>
        </nav>

        {/* ── الأقسام ──────────────────────────────────────── */}
        <div className="space-y-4">
          {sections.map(({ id, title, Icon, body }, i) => (
            <section
              key={id}
              id={id}
              className="bg-white rounded-2xl border border-black/5 p-5 scroll-mt-20"
            >
              <div className="flex items-start gap-3 mb-3">
                <span
                  aria-hidden
                  className="shrink-0 grid place-items-center w-9 h-9 rounded-xl bg-primary-light text-primary"
                >
                  <Icon size={18} />
                </span>
                <h2 className="font-bold text-base sm:text-lg text-navy pt-1.5">
                  <span className="text-neutral-400 tabular-nums ms-1">
                    {i + 1}.
                  </span>{" "}
                  {title}
                </h2>
              </div>

              <div
                className="text-sm text-neutral-600 leading-loose space-y-3
                           [&_ul]:space-y-1.5 [&_ul]:ps-1
                           [&_li]:relative [&_li]:ps-5
                           [&_li]:before:absolute [&_li]:before:end-auto [&_li]:before:start-0
                           [&_li]:before:top-[0.7em] [&_li]:before:w-1.5 [&_li]:before:h-1.5
                           [&_li]:before:rounded-full [&_li]:before:bg-gold
                           [&_strong]:text-navy [&_strong]:font-semibold"
              >
                {body}
              </div>
            </section>
          ))}

          {/* ── التواصل ───────────────────────────────────── */}
          <section
            id="contact"
            className="bg-primary-light rounded-2xl border border-primary/15 p-5 scroll-mt-20"
          >
            <div className="flex items-start gap-3 mb-3">
              <span
                aria-hidden
                className="shrink-0 grid place-items-center w-9 h-9 rounded-xl bg-primary text-white"
              >
                <Mail size={18} />
              </span>
              <h2 className="font-bold text-base sm:text-lg text-navy pt-1.5">
                <span className="text-primary/50 tabular-nums ms-1">
                  {sections.length + 1}.
                </span>{" "}
                كيف تتواصل معنا
              </h2>
            </div>

            <p className="text-sm text-neutral-600 leading-loose mb-4">
              لأي سؤال عن هذه الشروط، أو لبلاغ عن مخالفة أو انتهاك لحق تملكه،
              راسلنا وسنردّ في أقرب وقت:
            </p>

            <div className="grid sm:grid-cols-2 gap-2">
              <a
                href={`mailto:${CONTACT.email}`}
                className="flex items-center gap-3 bg-white rounded-xl border border-black/5 p-3 hover:border-primary/30 transition-colors"
              >
                <Mail size={18} className="text-primary shrink-0" />
                <span className="min-w-0">
                  <span className="block text-xs text-neutral-400">
                    البريد الإلكتروني
                  </span>
                  <span
                    className="block text-sm text-navy font-medium truncate"
                    dir="ltr"
                  >
                    {CONTACT.email}
                  </span>
                </span>
              </a>

              <a
                href={`https://wa.me/${CONTACT.whatsapp}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 bg-white rounded-xl border border-black/5 p-3 hover:border-primary/30 transition-colors"
              >
                <MessageCircle size={18} className="text-primary shrink-0" />
                <span className="min-w-0">
                  <span className="block text-xs text-neutral-400">واتساب</span>
                  <span className="block text-sm text-navy font-medium" dir="ltr">
                    +{CONTACT.whatsapp}
                  </span>
                </span>
              </a>

              <a
                href={`tel:${CONTACT.phone}`}
                className="flex items-center gap-3 bg-white rounded-xl border border-black/5 p-3 hover:border-primary/30 transition-colors sm:col-span-2"
              >
                <Phone size={18} className="text-primary shrink-0" />
                <span className="min-w-0">
                  <span className="block text-xs text-neutral-400">الهاتف</span>
                  <span className="block text-sm text-navy font-medium" dir="ltr">
                    {CONTACT.phone}
                  </span>
                </span>
              </a>
            </div>
          </section>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 mt-6 text-sm">
          <Link
            href="/privacy"
            className="text-primary hover:text-primary-dark hover:underline"
          >
            سياسة الخصوصية
          </Link>
          <Link
            href="/"
            className="text-primary hover:text-primary-dark hover:underline"
          >
            ← العودة إلى {SITE_NAME}
          </Link>
        </div>
      </div>
    </main>
  );
}
