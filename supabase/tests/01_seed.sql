-- بذرة اختبار: متجران + أدوار + موظفو منصة. للتطوير والاختبار فقط.

insert into auth.users (id, email, email_confirmed_at) values
  ('11111111-1111-1111-1111-111111111111','ownerA@test.local', now()),
  ('22222222-2222-2222-2222-222222222222','ownerB@test.local', now()),
  ('33333333-3333-3333-3333-333333333333','managerA@test.local', now()),
  ('44444444-4444-4444-4444-444444444444','ordersA@test.local', now()),
  ('55555555-5555-5555-5555-555555555555','productsA@test.local', now()),
  ('66666666-6666-6666-6666-666666666666','csA@test.local', now()),
  ('77777777-7777-7777-7777-777777777777','customerA@test.local', now()),
  ('88888888-8888-8888-8888-888888888888','adminOwner@test.local', now()),
  ('99999999-9999-9999-9999-999999999999','adminSupport@test.local', now()),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','adminFinance@test.local', now()),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','partner1@test.local', now());

insert into public.stores (id, owner_id, name, slug, status, published_at) values
  ('a0000000-0000-0000-0000-00000000000a','11111111-1111-1111-1111-111111111111',
   'متجر أ','store-a','active', now()),
  ('b0000000-0000-0000-0000-00000000000b','22222222-2222-2222-2222-222222222222',
   'متجر ب','store-b','active', now());

insert into public.store_settings (store_id) values
  ('a0000000-0000-0000-0000-00000000000a'),
  ('b0000000-0000-0000-0000-00000000000b');

insert into public.store_members (store_id, profile_id, role, status, accepted_at) values
  ('a0000000-0000-0000-0000-00000000000a','11111111-1111-1111-1111-111111111111','owner','active',now()),
  ('b0000000-0000-0000-0000-00000000000b','22222222-2222-2222-2222-222222222222','owner','active',now()),
  ('a0000000-0000-0000-0000-00000000000a','33333333-3333-3333-3333-333333333333','manager','active',now()),
  ('a0000000-0000-0000-0000-00000000000a','44444444-4444-4444-4444-444444444444','orders','active',now()),
  ('a0000000-0000-0000-0000-00000000000a','55555555-5555-5555-5555-555555555555','products','active',now()),
  ('a0000000-0000-0000-0000-00000000000a','66666666-6666-6666-6666-666666666666','customer_service','active',now());

insert into public.admin_members (id, profile_id, display_name, is_owner, status) values
  ('ad000000-0000-0000-0000-00000000000a','88888888-8888-8888-8888-888888888888','Admin Owner', true, 'active'),
  ('ad000000-0000-0000-0000-00000000000b','99999999-9999-9999-9999-999999999999','Support Staff', false, 'active'),
  ('ad000000-0000-0000-0000-00000000000c','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Finance Staff', false, 'active');

insert into public.admin_permissions (admin_member_id, section, level) values
  ('ad000000-0000-0000-0000-00000000000b','support','manage'),
  ('ad000000-0000-0000-0000-00000000000b','stores','view'),
  ('ad000000-0000-0000-0000-00000000000c','payments','approve'),
  ('ad000000-0000-0000-0000-00000000000c','commissions','approve'),
  ('ad000000-0000-0000-0000-00000000000c','payouts','approve'),
  ('ad000000-0000-0000-0000-00000000000c','subscriptions','approve');

insert into public.delivery_zones (store_id, name, fee) values
  ('a0000000-0000-0000-0000-00000000000a','الخرطوم', 2000),
  ('a0000000-0000-0000-0000-00000000000a','أم درمان', 2500),
  ('b0000000-0000-0000-0000-00000000000b','بورتسودان', 5000);

insert into public.store_payment_settings (store_id, bank_accounts) values
  ('a0000000-0000-0000-0000-00000000000a','[{"bank":"بنك الخرطوم","account":"A-111"}]'::jsonb),
  ('b0000000-0000-0000-0000-00000000000b','[{"bank":"بنك النيلين","account":"B-222"}]'::jsonb);
