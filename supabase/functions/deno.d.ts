/**
 * تعريفٌ صغير لما نستعمله من `Deno` وحده.
 *
 * ★ لماذا هنا: `tsconfig.json` يضمّ `**\/*.ts` فيشمل الدوالّ الطرفية،
 *   و`npm run typecheck` يفحصها مع التطبيق — وهذا مطلوب، فخطأُ نوعٍ
 *   في دالّةٍ طرفية لا يظهر إلا بعد النشر. والتعريف **للنوع فقط**:
 *   لا يُنشئ شيئًا في وقت التشغيل ولا يُغري كود التطبيق باستعماله.
 */
declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): unknown;
};
