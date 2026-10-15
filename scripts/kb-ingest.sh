#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# فهرسة ملفّ معرفة الدعم — وقياس الاسترجاع.
#
#   ./scripts/kb-ingest.sh --dry-run          # الخطّة بلا كتابة ولا كلفة
#   ./scripts/kb-ingest.sh                    # يفهرس فعلًا
#   ./scripts/kb-ingest.sh --probe "سؤال" …   # أقرب المقاطع ودرجة تشابهها
#
# الأسرار من البيئة وحدها — لا شيء منها في هذا الملفّ:
#   SUPABASE_FUNCTIONS_URL   مثال: https://<ref>.supabase.co/functions/v1
#   SUPABASE_ANON_KEY        جواز مشغّل الدوالّ (مفتاح عامّ)
#   SUPPORT_INGEST_SECRET    سرّنا — هو الجدار الحقيقي
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

DOC="${DOC:-docs/support-knowledge-base.md}"
MODE=ingest
[[ "${1:-}" == "--dry-run" ]] && { MODE=dry; shift; }
[[ "${1:-}" == "--probe" ]] && { MODE=probe; shift; }

for name in SUPABASE_FUNCTIONS_URL SUPABASE_ANON_KEY SUPPORT_INGEST_SECRET; do
  [[ -n "${!name:-}" ]] || { echo "متغيّر ناقص: $name" >&2; exit 1; }
done
command -v jq >/dev/null || { echo "jq مطلوب" >&2; exit 1; }

# ★ الجسم يُبنى بـjq لا بـprintf: النصّ عربيّ فيه علامات تنصيص وأسطر،
#   وبناؤه يدويًّا يُنتج JSON تالفًا فيعود 400 لا يدلّ على سببه.
if [[ "$MODE" == probe ]]; then
  [[ $# -gt 0 ]] || { echo "الاستعمال: --probe \"سؤال\" [\"سؤال\" …]" >&2; exit 1; }
  BODY=$(jq -n '$ARGS.positional | {probe: .}' --args "$@")
  FILTER='.probe[] | "\n❖ \(.question)", (.matches[] | "   \(.similarity)  \(.section)  — \(.head)")'
else
  [[ -f "$DOC" ]] || { echo "ملفّ غير موجود: $DOC" >&2; exit 1; }
  DRY=false; [[ "$MODE" == dry ]] && DRY=true
  BODY=$(jq -n --arg source "$DOC" --rawfile markdown "$DOC" --argjson dryRun "$DRY" \
    '{source: $source, markdown: $markdown, dryRun: $dryRun}')
  FILTER='{dryRun, source, existing, chunks, embedded, unchanged, stale, collapsed, deleted,
           new: [.sections[]? | select(.isNew) | {section, words, hash}]}'
fi

printf '%s' "$BODY" \
| curl -sS --fail-with-body -X POST \
    "${SUPABASE_FUNCTIONS_URL%/}/support-kb-ingest" \
    -H "authorization: Bearer ${SUPABASE_ANON_KEY}" \
    -H "x-support-secret: ${SUPPORT_INGEST_SECRET}" \
    -H 'content-type: application/json' \
    --data-binary @- \
| jq -r "$FILTER"
