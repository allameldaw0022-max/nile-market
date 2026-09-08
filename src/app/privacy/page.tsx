import type { Metadata } from "next";
import Link from "next/link";
import {
  UserRound,
  KeyRound,
  Store,
  ImageUp,
  Phone,
  Settings2,
  ShieldCheck,
  Share2,
  Scale,
  Cookie,
  RefreshCw,
  Mail,
  MessageCircle,
} from "lucide-react";
import { SITE_NAME, SITE_NAME_EN } from "@/lib/site";

/**
 * جهات الاتصال المعروضة للمستخدم.
 *
 * تُقرأ اليوم من هذا الثابت لا من `app_settings`، لأن سياسة الخصوصية يجب أن
 * تُعرض لكل زائر — بما فيهم غير المسجَّلين — بينما جدول `app_settings` محمي
 * بـRLS. عند إضافة سياسة قراءة عامة له يمكن تحويل هذه القيم إلى قراءة حيّة.
 */
const CONTACT = {
  email: "allameldaw0022@gmail.com",
  phone: "0911997506",
  whatsapp: "249911997506",
} as const;

const LAST_UPDATED = "٨ سبتمبر ٢٠٢٦";

export const metadata: Metadata = {
  title: "سياسة الخصوصية",
  description: `كيف يجمع ${SITE_NAME} بياناتك ويستخدمها ويحميها، وما هي حقوقك في الوصول إليها وحذفها.`,
  alternates: { canonical: "/privacy" },
  openGraph: {
    title: `سياسة الخصوصية | ${SITE_NAME}`,
    description: `كيف يجمع ${SITE_NAME} بياناتك ويستخدمها ويحميها، وما هي حقوقك.`,
    url: "/privacy",
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
    id: "account",
    title: "بيانات الحساب والتسجيل",
    Icon: UserRound,
    body: (
      <>
        <p>عند إنشاء حسابك نحفظ الحد الأدنى اللازم لتشغيل الحساب:</p>
        <ul>
          <li>الاسم الذي تختاره لعرضه.</li>
          <li>البريد الإلكتروني — يُستخدم لتسجيل الدخول واستعادة الحساب.</li>
          <li>رقم الهاتف، إن أدخلته، لتسهيل التواصل بشأن الطلبات.</li>
          <li>نوع الحساب: مشترٍ أو بائع.</li>
          <li>صورة الحساب، إن أضفتها أو جاءت من حساب Google.</li>
          <li>تاريخ الانضمام وآخر نشاط.</li>
        </ul>
        <p>
          <strong>لا نطلب ولا نخزّن كلمات المرور بصيغتها الأصلية.</strong> تُدار
          كلمات المرور بالكامل داخل نظام المصادقة الذي نستخدمه، ولا يصل إليها
          فريق {SITE_NAME}.
        </p>
      </>
    ),
  },
  {
    id: "login",
    title: "تسجيل الدخول عبر Google والبريد الإلكتروني",
    Icon: KeyRound,
    body: (
      <>
        <p>أمامك طريقتان للدخول:</p>
        <ul>
          <li>
            <strong>البريد الإلكتروني وكلمة المرور:</strong> تُخزَّن كلمة المرور
            مشفَّرة بصيغة لا يمكن عكسها، ولا يطّلع عليها أحد.
          </li>
          <li>
            <strong>حساب Google:</strong> عند اختيارك هذه الطريقة، يشاركنا Google
            اسمك وبريدك الإلكتروني وصورة حسابك فقط. <strong>لا نرى كلمة مرور
            Google الخاصة بك ولا نستطيع الوصول إلى بريدك أو ملفاتك أو جهات
            اتصالك.</strong>
          </li>
        </ul>
        <p>
          نحفظ جلسة الدخول في ملف تعريف ارتباط آمن كي لا تُضطر إلى إدخال بياناتك
          في كل زيارة. يمكنك إنهاء الجلسة في أي وقت بتسجيل الخروج.
        </p>
      </>
    ),
  },
  {
    id: "commerce",
    title: "بيانات المتاجر والمنتجات والطلبات",
    Icon: Store,
    body: (
      <>
        <p>
          {SITE_NAME} سوق يجمع بائعين ومشترين، ولذلك تُعرض بعض البيانات علناً
          بطبيعة الخدمة:
        </p>
        <ul>
          <li>
            <strong>بيانات المتجر:</strong> اسم المتجر ووصفه وشعاره وصورة غلافه
            ومدينته ووسائل تواصله — يعرضها البائع بنفسه للجمهور.
          </li>
          <li>
            <strong>بيانات المنتجات:</strong> الاسم والوصف والسعر والصور والفئة
            والموقع والكمية — تظهر لكل زائر.
          </li>
          <li>
            <strong>بيانات الطلبات:</strong> المنتجات المطلوبة والكمية والسعر
            وطريقة الدفع وعنوان التسليم واسم المستلم ورقم هاتفه وأي ملاحظات
            تكتبها.
          </li>
        </ul>
        <p>
          <strong>بيانات الطلب ليست عامة.</strong> تُشارَك مع البائع المعني
          وحده — لأنه من سيجهّز الطلب ويوصله — ومع إدارة المنصة عند الحاجة إلى
          فضّ نزاع أو دعم فني. لا يرى بائع طلبات بائع آخر.
        </p>
      </>
    ),
  },
  {
    id: "uploads",
    title: "الصور والملفات التي ترفعها",
    Icon: ImageUp,
    body: (
      <>
        <p>قد ترفع ملفات في مواضع مختلفة، ولكلٍّ منها مستوى وصول مختلف:</p>
        <ul>
          <li>
            <strong>صور المنتجات وشعارات المتاجر وأغلفتها:</strong> عامة بطبيعتها،
            لأن الغرض منها العرض على المتسوّقين.
          </li>
          <li>
            <strong>إيصالات الدفع والاشتراك:</strong> <strong>خاصة تماماً.</strong>
            تُخزَّن في مساحة مغلقة لا يُفتح منها ملف إلا برابط مؤقّت يُنشأ لحظة
            الحاجة، ولا يُتاح إلا لك ولإدارة المنصة أثناء مراجعة الطلب.
          </li>
          <li>
            <strong>مرفقات الدعم الفني:</strong> خاصة، ولا يطّلع عليها إلا فريق
            الدعم لمعالجة تذكرتك.
          </li>
        </ul>
        <p>
          نرجو ألّا ترفع في الصور العامة أي مستند يحمل بيانات شخصية حسّاسة مثل
          صور الهوية أو البطاقات المصرفية.
        </p>
      </>
    ),
  },
  {
    id: "contact-data",
    title: "بيانات التواصل",
    Icon: Phone,
    body: (
      <>
        <p>نستخدم وسائل تواصلك لغرض محدد في كل حالة:</p>
        <ul>
          <li>
            <strong>البريد الإلكتروني:</strong> تأكيد الحساب، استعادة كلمة المرور،
            وإشعارات تخصّ طلباتك أو اشتراكك.
          </li>
          <li>
            <strong>رقم الهاتف وواتساب:</strong> يظهران للبائع أو المشتري في الطلب
            المشترك بينكما فقط، ليتمكّن الطرفان من ترتيب التسليم.
          </li>
        </ul>
        <p>
          <strong>لا نبيع بياناتك ولا نؤجّرها ولا نشاركها مع معلنين</strong>، ولا
          نرسل رسائل تسويقية دون طلبك.
        </p>
      </>
    ),
  },
  {
    id: "usage",
    title: "كيف نستخدم البيانات",
    Icon: Settings2,
    body: (
      <>
        <p>نستخدم ما نجمعه لتشغيل الخدمة لا لغير ذلك:</p>
        <ul>
          <li>إنشاء حسابك وتأمين دخوله.</li>
          <li>عرض المنتجات والمتاجر وتنفيذ عمليات الشراء.</li>
          <li>إيصال الطلبات بين المشتري والبائع ومتابعة حالتها.</li>
          <li>مراجعة طلبات الاشتراك والدفع.</li>
          <li>الرد على تذاكر الدعم وحلّ النزاعات.</li>
          <li>إحصاءات مجمَّعة عن الزيارات والمبيعات لتحسين المنصة.</li>
          <li>منع الاحتيال وإساءة الاستخدام وحماية المستخدمين.</li>
        </ul>
        <p>
          الإحصاءات التي نستخدمها للتطوير <strong>مجمَّعة وغير معرِّفة للأشخاص</strong>
          — أعداد وزيارات ومبيعات، لا ملفات تتبّع فردية.
        </p>
      </>
    ),
  },
  {
    id: "security",
    title: "التخزين والحماية",
    Icon: ShieldCheck,
    body: (
      <>
        <ul>
          <li>
            جميع الاتصالات بين جهازك وخوادمنا مشفَّرة عبر HTTPS.
          </li>
          <li>
            كلمات المرور مخزَّنة بصيغة مشفَّرة لا يمكن عكسها.
          </li>
          <li>
            قاعدة البيانات محمية بقواعد وصول على مستوى الصف، فلا يستطيع أي حساب
            قراءة بيانات حساب آخر.
          </li>
          <li>
            الملفات الخاصة — كالإيصالات — مخزَّنة في مساحات مغلقة لا تُفتح إلا
            بروابط مؤقّتة.
          </li>
          <li>
            تُحفظ البيانات على خوادم مزوّدنا في أوروبا (أيرلندا) ضمن مراكز بيانات
            معتمدة.
          </li>
        </ul>
        <p>
          نبذل جهداً معقولاً لحماية بياناتك، لكن لا يوجد نظام على الإنترنت آمن
          بنسبة مئة بالمئة. إن رصدت ثغرة أو نشاطاً مريباً، أبلغنا فوراً عبر
          الوسائل أدناه.
        </p>
      </>
    ),
  },
  {
    id: "sharing",
    title: "مشاركة البيانات مع مزوّدي الخدمات",
    Icon: Share2,
    body: (
      <>
        <p>
          نعتمد على عدد محدود من مزوّدي البنية التحتية، ولا نشارك معهم إلا ما
          يلزم لأداء وظيفتهم:
        </p>
        <ul>
          <li>
            <strong>مزوّد قاعدة البيانات والمصادقة والتخزين (Supabase):</strong>
            يستضيف الحسابات والبيانات والملفات.
          </li>
          <li>
            <strong>مزوّد الاستضافة (Vercel):</strong> يشغّل الموقع ويسلّم
            الصفحات.
          </li>
          <li>
            <strong>Google:</strong> فقط إن اخترت تسجيل الدخول بحسابك لديه.
          </li>
        </ul>
        <p>
          قد نُفصح عن بيانات إذا ألزمنا بذلك أمر قضائي أو جهة رسمية مختصة، أو
          للدفاع عن حقوقنا أو حماية سلامة المستخدمين. <strong>وفيما عدا ذلك لا
          تُشارك بياناتك مع أي طرف ثالث.</strong>
        </p>
      </>
    ),
  },
  {
    id: "rights",
    title: "حقوقك وطلب حذف الحساب أو البيانات",
    Icon: Scale,
    body: (
      <>
        <p>بياناتك ملكك، ولك في أي وقت:</p>
        <ul>
          <li>الاطّلاع على ما نحتفظ به عنك.</li>
          <li>تصحيح أي معلومة غير دقيقة من صفحة حسابك.</li>
          <li>حذف منتجاتك أو محتوى متجرك.</li>
          <li>
            <strong>طلب حذف حسابك وبياناتك بالكامل.</strong>
          </li>
          <li>سحب موافقتك على استخدام بياناتك مستقبلاً.</li>
        </ul>
        <p>
          لطلب الحذف راسلنا من البريد المسجَّل في حسابك عبر الوسائل أدناه.
          ننفّذ الطلب خلال <strong>ثلاثين يوماً</strong> على الأكثر.
        </p>
        <p>
          <strong>ما قد يبقى بعد الحذف:</strong> سجلات الطلبات المكتملة والفواتير
          نحتفظ بها للمدة التي يفرضها الالتزام المحاسبي والقانوني، وذلك لحماية
          الطرف الآخر في المعاملة. تُفصل هذه السجلات عن هويتك قدر الإمكان.
        </p>
      </>
    ),
  },
  {
    id: "cookies",
    title: "ملفات تعريف الارتباط (Cookies)",
    Icon: Cookie,
    body: (
      <>
        <p>
          نستخدم ملفات تعريف ارتباط <strong>ضرورية فقط</strong>، ولا نستخدم أي
          ملفات إعلانية أو تتبّع عبر المواقع:
        </p>
        <ul>
          <li>
            <strong>ملف الجلسة:</strong> يبقيك مسجَّل الدخول بين الصفحات والزيارات.
          </li>
          <li>
            <strong>تفضيلات محلية:</strong> مثل محتويات سلّتك، وتُحفظ في متصفحك
            لا على خوادمنا.
          </li>
        </ul>
        <p>
          يمكنك حذف هذه الملفات من إعدادات متصفحك في أي وقت، لكن حذف ملف الجلسة
          سيسجّل خروجك.
        </p>
      </>
    ),
  },
  {
    id: "updates",
    title: "تحديث سياسة الخصوصية",
    Icon: RefreshCw,
    body: (
      <>
        <p>
          قد نحدّث هذه السياسة كلما تطوّرت الخدمة أو تغيّرت المتطلبات النظامية.
          يظهر تاريخ آخر تحديث أعلى الصفحة دائماً.
        </p>
        <p>
          وإن كان التغيير <strong>جوهرياً</strong> — كأن يمسّ طريقة استخدام
          بياناتك أو مشاركتها — فسنُعلمك عبر إشعار داخل المنصة أو رسالة إلى بريدك
          قبل أن يسري.
        </p>
      </>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <main className="flex-1 w-full">
      {/* ── ترويسة ─────────────────────────────────────────── */}
      <section className="bg-navy text-white">
        <div className="max-w-3xl mx-auto w-full px-4 py-10 sm:py-14">
          <p className="text-gold text-xs font-semibold tracking-wide mb-2">
            {SITE_NAME} · {SITE_NAME_EN}
          </p>
          <h1 className="font-extrabold text-2xl sm:text-3xl">سياسة الخصوصية</h1>
          <p className="text-white/70 text-sm mt-3 leading-relaxed">
            نشرح هنا بلغة واضحة أيّ بيانات نجمعها، ولماذا نجمعها، ومع من نشاركها،
            وكيف تتحكم أنت بها. لا نجمع شيئاً لا تحتاجه الخدمة.
          </p>
          <p className="text-white/50 text-xs mt-4">
            آخر تحديث: {LAST_UPDATED}
          </p>
        </div>
      </section>

      <div className="max-w-3xl mx-auto w-full p-4 sm:py-8">
        {/* ── فهرس ─────────────────────────────────────────── */}
        <nav
          aria-label="محتويات السياسة"
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
              لأي سؤال عن خصوصيتك، أو لطلب نسخة من بياناتك أو حذفها، راسلنا وسنردّ
              في أقرب وقت:
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
                  <span className="block text-sm text-navy font-medium truncate" dir="ltr">
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

        <div className="text-center mt-6">
          <Link
            href="/"
            className="inline-block text-sm text-primary hover:text-primary-dark hover:underline"
          >
            ← العودة إلى {SITE_NAME}
          </Link>
        </div>
      </div>
    </main>
  );
}
