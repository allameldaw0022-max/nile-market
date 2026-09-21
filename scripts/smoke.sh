#!/usr/bin/env bash
# اختبار دخان لحدود الأمان في التوجيه. يحتاج خادم تطوير يعمل.
# لا يتطلب اتصالًا بـSupabase — يفحص طبقة الـproxy والرؤوس فقط.
set -u
BASE=${BASE:-http://localhost:3000}
fail=0
check() { # path | host | expected | label
  local code
  if [ -n "$2" ]; then code=$(curl -s -o /dev/null -w "%{http_code}" -H "Host: $2" "$BASE$1")
  else code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$1"); fi
  if [ "$code" = "$3" ]; then echo "  ✓ $4"; else echo "  ✗ $4 ⇒ $code (متوقع $3)"; fail=1; fi
}
echo "── حدود التوجيه متعدد المستأجرين ──"
check "/sites/x"    ""                     404 "/sites/* مرفوض من دومين المنصة"
check "/dashboard"  "s.nilemarket.online"  404 "/dashboard مرفوض من دومين مستأجر"
check "/admin"      "s.nilemarket.online"  404 "/admin مرفوض من دومين مستأجر"
check "/partner"    "s.nilemarket.online"  404 "/partner مرفوض من دومين مستأجر"
check "/onboarding" "s.nilemarket.online"  404 "/onboarding مرفوض من دومين مستأجر"
echo "── رؤوس الأمان ──"
for h in x-frame-options x-content-type-options referrer-policy strict-transport-security permissions-policy; do
  if curl -sI "$BASE/" | grep -qi "^$h:"; then echo "  ✓ $h"; else echo "  ✗ $h مفقود"; fail=1; fi
done
[ $fail -eq 0 ] && echo "══ اختبار الدخان مرّ ══" || { echo "══ فشل ══"; exit 1; }
