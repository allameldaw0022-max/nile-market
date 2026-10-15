#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# فهرسة ملفّ معرفة الدعم — يرسل النصّ إلى دالّة support-kb-ingest.
#
#   ./scripts/kb-ingest.sh --dry-run     # يعرض الخطّة بلا كتابة ولا كلفة
#   ./scripts/kb-ingest.sh               # يفهرس فعلًا
#
# الأسرار من البيئة وحدها — لا شيء منها في هذا الملفّ:
#   SUPABASE_FUNCTIONS_URL   مثال: https://<ref>.supabase.co/functions/v1
#   SUPABASE_ANON_KEY        جواز مشغّل الدوالّ (مفتاح عامّ)
#   SUPPORT_INGEST_SECRET    سرّنا — هو الجدار الحقيقي
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

DOC="${DOC:-docs/support-knowledge-base.md}"
DRY=false
[[ "${1:-}" == "--dry-run" ]] && DRY=true

for name in SUPABASE_FUNCTIONS_URL SUPABASE_ANON_KEY SUPPORT_INGEST_SECRET; do
  [[ -n "${!name:-}" ]] || { echo "متغيّر ناقص: $name" >&2; exit 1; }
done
[[ -f "$DOC" ]] || { echo "ملفّ غير موجود: $DOC" >&2; exit 1; }

# ★ الجسم يُبنى بـjq لا بـprintf: النصّ عربيّ فيه علامات تنصيص وأسطر،
#   وبناؤه يدويًّا يُنتج JSON تالفًا فيعود 400 لا يدلّ على سببه.
command -v jq >/dev/null || { echo "jq مطلوب" >&2; exit 1; }

jq -n --arg source "$DOC" --rawfile markdown "$DOC" --argjson dryRun "$DRY" \
  '{source: $source, markdown: $markdown, dryRun: $dryRun}' \
| curl -sS --fail-with-body -X POST \
    "${SUPABASE_FUNCTIONS_URL%/}/support-kb-ingest" \
    -H "authorization: Bearer ${SUPABASE_ANON_KEY}" \
    -H "x-support-secret: ${SUPPORT_INGEST_SECRET}" \
    -H 'content-type: application/json' \
    --data-binary @- \
| jq '{dryRun, source, existing, chunks, embedded, unchanged, stale, collapsed, deleted,
       sections: [.sections[]? | select(.isNew) | {section, words, hash}]}'
