/**
 * قوالب البريد.
 *
 * عربية وRTL، ونصّية بجانب HTML: بعض عملاء البريد في السودان يفتحون
 * النص فقط، ورسالة بلا نسخة نصية تصل فارغة.
 *
 * ★ كل قيمة قادمة من القاعدة تمر بـ`escape` قبل إدراجها في HTML —
 * اسم زبون فيه `<script>` لا يصير سكربتًا في صندوق بريد التاجر.
 */

export type RenderedEmail = { subject: string; html: string; text: string };
export type EmailPayload = Record<string, unknown>;
export type BrandContext = { siteName: string; siteUrl: string };

function escape(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const money = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n)
    ? `${new Intl.NumberFormat('ar-SD', { maximumFractionDigits: 2 }).format(n)} ج.س`
    : '—';
};

/** إطار موحّد: ترويسة بسيطة، متن، وتذييل بالمصدر. */
function layout(brand: BrandContext, title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>${escape(title)}</title></head>
<body style="margin:0;background:#F5F7FA;font-family:system-ui,'Segoe UI',Tahoma,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
         style="background:#F5F7FA;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="max-width:560px;background:#ffffff;border:1px solid #E2E8F0;
                    border-radius:12px;overflow:hidden;">
        <tr><td style="background:#0B1F3A;padding:16px 20px;color:#ffffff;
                       font-weight:800;font-size:16px;">
          ${escape(brand.siteName)}
        </td></tr>
        <tr><td style="padding:20px;color:#0B1F3A;font-size:15px;line-height:1.8;">
          ${bodyHtml}
        </td></tr>
        <tr><td style="padding:14px 20px;border-top:1px solid #E2E8F0;
                       color:#64748B;font-size:12px;">
          وصلتك هذه الرسالة من
          <a href="${escape(brand.siteUrl)}" style="color:#0B5ED7;">${escape(brand.siteName)}</a>.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

const button = (href: string, label: string) =>
  `<p style="margin:20px 0;">
     <a href="${escape(href)}"
        style="display:inline-block;background:#0B5ED7;color:#ffffff;
               text-decoration:none;padding:10px 20px;border-radius:8px;
               font-weight:700;">${escape(label)}</a>
   </p>`;

type Template = (p: EmailPayload, brand: BrandContext) => RenderedEmail;

const TEMPLATES: Record<string, Template> = {
  order_created: (p, brand) => {
    const orderNumber = String(p.order_number ?? '');
    const subject = `طلب جديد ${orderNumber} — ${p.store_name ?? brand.siteName}`;
    return {
      subject,
      html: layout(brand, subject, `
        <p>وصلك طلب جديد في متجر <strong>${escape(p.store_name)}</strong>.</p>
        <table role="presentation" cellpadding="6" cellspacing="0"
               style="width:100%;border:1px solid #E2E8F0;border-radius:8px;">
          <tr><td style="color:#64748B;">رقم الطلب</td>
              <td style="font-weight:700;" dir="ltr">${escape(orderNumber)}</td></tr>
          <tr><td style="color:#64748B;">الزبون</td>
              <td style="font-weight:700;">${escape(p.customer)}</td></tr>
          <tr><td style="color:#64748B;">الإجمالي</td>
              <td style="font-weight:700;">${escape(money(p.total))}</td></tr>
        </table>
        ${button(`${brand.siteUrl}/dashboard/orders`, 'فتح لوحة الطلبات')}
        <p style="color:#64748B;font-size:13px;">
          تواصل مع الزبون لتأكيد الطلب في أقرب وقت.
        </p>`),
      text: [
        `وصلك طلب جديد في متجر ${p.store_name}.`,
        `رقم الطلب: ${orderNumber}`,
        `الزبون: ${p.customer}`,
        `الإجمالي: ${money(p.total)}`,
        `${brand.siteUrl}/dashboard/orders`,
      ].join('\n'),
    };
  },

  subscription_expiring: (p, brand) => {
    const subject = `اشتراك ${p.store_name ?? 'متجرك'} يقارب الانتهاء`;
    return {
      subject,
      html: layout(brand, subject, `
        <p>اشتراك متجر <strong>${escape(p.store_name)}</strong> ينتهي في
           <strong>${escape(p.ends_at)}</strong>.</p>
        <p>بعد الانتهاء يبقى متجرك ومنتجاتك وطلباتك كما هي، ويتوقف الشراء
           منه حتى التجديد.</p>
        ${button(`${brand.siteUrl}/dashboard/subscription`, 'تجديد الاشتراك')}`),
      text: [
        `اشتراك متجر ${p.store_name} ينتهي في ${p.ends_at}.`,
        'بعد الانتهاء يبقى متجرك وبياناته كما هي، ويتوقف الشراء حتى التجديد.',
        `${brand.siteUrl}/dashboard/subscription`,
      ].join('\n'),
    };
  },

  subscription_approved: (p, brand) => {
    const subject = `تم تفعيل اشتراك ${p.store_name ?? 'متجرك'}`;
    return {
      subject,
      html: layout(brand, subject, `
        <p>اعتمدنا تحويلك، وفُعِّلت باقة <strong>${escape(p.plan_name)}</strong>
           لمتجر <strong>${escape(p.store_name)}</strong>.</p>
        <p>ينتهي الاشتراك في <strong>${escape(p.ends_at)}</strong>.</p>
        ${button(`${brand.siteUrl}/dashboard`, 'فتح لوحة التحكم')}`),
      text: [
        `فُعِّلت باقة ${p.plan_name} لمتجر ${p.store_name}.`,
        `ينتهي الاشتراك في ${p.ends_at}.`,
        `${brand.siteUrl}/dashboard`,
      ].join('\n'),
    };
  },

  team_invitation: (p, brand) => {
    const subject = `دعوة للانضمام إلى فريق ${p.store_name ?? 'متجر'}`;
    return {
      subject,
      html: layout(brand, subject, `
        <p>دعاك <strong>${escape(p.inviter)}</strong> للانضمام إلى فريق
           متجر <strong>${escape(p.store_name)}</strong> بدور
           <strong>${escape(p.role_label)}</strong>.</p>
        ${button(String(p.invite_url ?? brand.siteUrl), 'قبول الدعوة')}
        <p style="color:#64748B;font-size:13px;">
          الرابط صالح 7 أيام. إن لم تكن تتوقع هذه الدعوة، تجاهل الرسالة.
        </p>`),
      text: [
        `دعاك ${p.inviter} للانضمام إلى فريق متجر ${p.store_name} بدور ${p.role_label}.`,
        `${p.invite_url}`,
        'الرابط صالح 7 أيام.',
      ].join('\n'),
    };
  },

  payout_status: (p, brand) => {
    const subject = `تحديث على طلب صرف عمولتك`;
    return {
      subject,
      html: layout(brand, subject, `
        <p>طلب الصرف بمبلغ <strong>${escape(money(p.amount))}</strong>
           أصبح: <strong>${escape(p.status_label)}</strong>.</p>
        ${p.reason ? `<p style="color:#64748B;">السبب: ${escape(p.reason)}</p>` : ''}
        ${button(`${brand.siteUrl}/partner`, 'فتح لوحة الشريك')}`),
      text: [
        `طلب الصرف بمبلغ ${money(p.amount)} أصبح: ${p.status_label}.`,
        p.reason ? `السبب: ${p.reason}` : '',
        `${brand.siteUrl}/partner`,
      ].filter(Boolean).join('\n'),
    };
  },

  support_reply: (p, brand) => {
    const subject = `رد جديد على تذكرتك ${p.ticket_number ?? ''}`;
    return {
      subject,
      html: layout(brand, subject, `
        <p>وصلك رد على تذكرة الدعم
           <strong dir="ltr">${escape(p.ticket_number)}</strong>.</p>
        <blockquote style="margin:12px 0;padding:10px 14px;border-inline-start:3px solid #0B5ED7;
                           background:#F5F7FA;color:#0B1F3A;">
          ${escape(p.excerpt)}
        </blockquote>
        ${button(`${brand.siteUrl}/support`, 'فتح التذكرة')}`),
      text: [
        `وصلك رد على تذكرة الدعم ${p.ticket_number}.`,
        String(p.excerpt ?? ''),
        `${brand.siteUrl}/support`,
      ].join('\n'),
    };
  },
};

/** يعيد null لقالب غير معروف — لا رسالة مبهمة تُرسل للمستخدم. */
export function renderEmail(
  template: string, payload: EmailPayload, brand: BrandContext,
): RenderedEmail | null {
  const render = TEMPLATES[template];
  if (!render) return null;
  return render(payload ?? {}, brand);
}

export const EMAIL_TEMPLATE_KEYS = Object.keys(TEMPLATES);
