#!/usr/bin/env bash
# =====================================================================
# اختبار تزامن حقيقي — جلسات PostgreSQL متوازية لا محاكاة.
#
# ما لا يستطيع اختبار داخل معاملة واحدة إثباته: السباق بين قراءة
# المخزون وحجزه، وبين قراءة مفتاح التكرار وإدراجه. هذه تحتاج اتصالات
# منفصلة تتنافس فعلًا على نفس الصفوف.
#
# ★ لا تنظيف بالحذف: الطلبات والقيود المالية جداول إلحاقية لا تُحذف
# (وهذا صحيح). فكل تشغيل يستخدم بادئة فريدة ويقيس صفوفه هو.
# =====================================================================
set -uo pipefail
PGH=${PGH:-/tmp/claude-0}; PGP=${PGP:-5433}; DB=${DB:-nile_test}
Q="psql -h $PGH -p $PGP -U postgres -d $DB -At"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT

SID='a0000000-0000-0000-0000-00000000000a'
PID='d1000000-0000-0000-0000-000000000001'
ZID='d0000000-0000-0000-0000-0000000000f1'
RUN="r$(date +%s)$$"          # بادئة فريدة لهذا التشغيل
fail=0

ok()   { echo "  ✓ $1"; }
bad()  { echo "  ✗ FAIL: $1"; fail=1; }
check(){ [ "$2" = "$3" ] && ok "$1" || bad "$1 (توقّعنا $3 ووجدنا $2)"; }

# ★ الترتيب مهمّ: المحجوز يُصفَّر قبل خفض الكمية، وإلا خالف القيد
# `reserved <= quantity` أثناء الخفض.
setstock() {
  $Q -c "update inventory set reserved = 0 where product_id='$PID'" >/dev/null
  local cur d
  cur=$($Q -c "select quantity from inventory where product_id='$PID'")
  d=$(( $1 - cur ))
  if [ "$d" -ne 0 ]; then
    $Q -c "insert into inventory_movements (store_id, product_id, delta, reason)
           values ('$SID','$PID',$d,'correction')" >/dev/null
  fi
}

order_sql() {   # $1 = مفتاح، $2 = لاحقة هاتف، $3 = كوبون (اختياري)
  local coup="null"; [ -n "${3:-}" ] && coup="'$3'"
  cat <<EOF
set role anon;
select order_number from create_order('$SID',
  jsonb_build_array(jsonb_build_object('product_id','$PID','quantity',1)),
  '$ZID', jsonb_build_object('name','تزامن','phone','09000000$2'),
  jsonb_build_object('line1','ع'), 'cash_on_delivery', $coup, '$1');
EOF
}

$Q -c "insert into delivery_zones (id, store_id, name, fee)
       values ('$ZID','$SID','تزامن',0) on conflict (id) do nothing" >/dev/null

echo "── سباق المخزون: ثلاث جلسات على قطعة واحدة ──"
setstock 1
for i in 1 2 3; do
  order_sql "$RUN-stock-$i" "1$i" > "$TMP/s$i.sql"
  ( $Q -f "$TMP/s$i.sql" >"$TMP/s$i.out" 2>&1 ) &
done
wait
check "★★ طلب واحد فقط ينجح على مخزون = ١" \
      "$($Q -c "select count(*) from orders where idempotency_key like '$RUN-stock-%'")" "1"
check "★★ والمتاح يصير صفرًا لا سالبًا" \
      "$($Q -c "select quantity - reserved from inventory where product_id='$PID'")" "0"
check "والجلستان الأخريان تتلقّيان «نفاد المخزون»" \
      "$(cat "$TMP"/s*.out | grep -c OUT_OF_STOCK)" "2"

echo "── سباق مفتاح التكرار: خمس جلسات بنفس المفتاح ──"
setstock 50
for i in 1 2 3 4 5; do
  order_sql "$RUN-idem" "2$i" > "$TMP/i$i.sql"
  ( $Q -f "$TMP/i$i.sql" >"$TMP/i$i.out" 2>&1 ) &
done
wait
check "★★ طلب واحد فقط يُنشأ" \
      "$($Q -c "select count(*) from orders where idempotency_key='$RUN-idem'")" "1"
# ★ الجوهري: لا جلسة تتلقّى خطأ قيد فريد خامًا. كانت تتلقّاه قبل 0039،
# فيظنّ الزبون أن الطلب فشل فيطلب من جديد ⇒ طلب مكرّر حقيقي.
check "★★★ ولا جلسة تتلقّى خطأ قيد فريد خامًا" \
      "$(cat "$TMP"/i*.out | grep -c 'duplicate key value')" "0"
check "★★ وكل الجلسات الخمس تعيد رقم الطلب نفسه" \
      "$(cat "$TMP"/i*.out | grep -c '^A-')" "5"
check "وهو رقم واحد لا أكثر" \
      "$(cat "$TMP"/i*.out | grep '^A-' | sort -u | wc -l | tr -d ' ')" "1"

echo "── سباق الكوبون: أربع جلسات على حدّ استخدام = ١ ──"
CODE="RACE${RUN^^}"
$Q -c "insert into coupons (store_id, code, type, value, usage_limit_total)
       values ('$SID','$CODE','fixed',1000,1)" >/dev/null
setstock 50
for i in 1 2 3 4; do
  order_sql "$RUN-cp-$i" "3$i" "$CODE" > "$TMP/c$i.sql"
  ( $Q -f "$TMP/c$i.sql" >"$TMP/c$i.out" 2>&1 ) &
done
wait
check "★★ الخصم يُطبَّق مرّة واحدة فقط" \
      "$($Q -c "select count(*) from orders where idempotency_key like '$RUN-cp-%' and discount_total > 0")" "1"
check "★★ واستخدام واحد مسجَّل لا أكثر" \
      "$($Q -c "select count(*) from coupon_redemptions cr join coupons c on c.id=cr.coupon_id where c.code='$CODE'")" "1"
check "وبقيّة الطلبات تمرّ بلا خصم لا أن تُلغى" \
      "$($Q -c "select count(*) from orders where idempotency_key like '$RUN-cp-%'")" "4"

setstock 50
[ $fail -eq 0 ] && echo "✓ اختبارات التزامن مرّت" || { echo "✗ فشل اختبار تزامن"; exit 1; }
