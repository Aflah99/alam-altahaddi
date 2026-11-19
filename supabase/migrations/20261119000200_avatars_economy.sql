-- ============================================================================
-- Feature 2: human avatars, legendary creatures, wearables, surprise packages,
-- duplicate conversion into upgrade points (نقاط التطوير) and six cosmetic tiers.
--
-- Everything is cosmetic and server-authoritative:
--   * package price, reward rarity and reward item are decided here with
--     cryptographic randomness; the client only sends the package id and a request id
--     (replaying the same request returns the same result and never charges twice);
--   * duplicates become upgrade points exactly once (unique ledger keys);
--   * upgrades check the expected current tier, so double taps cannot double-spend.
-- Coins still come only from gameplay. No real-money purchase exists anywhere.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Catalogue: 11 wearable slots + legendary characters, with rarity and shop flags
-- ---------------------------------------------------------------------------
alter table public.shop_items drop constraint shop_items_category_check;
alter table public.shop_items add column if not exists rarity text not null default 'common'
  check (rarity in ('common', 'rare', 'epic', 'legendary'));
alter table public.shop_items add column if not exists in_shop boolean not null default true;
alter table public.shop_items add column if not exists in_packages boolean not null default true;
alter table public.shop_items add column if not exists creature_ok boolean not null default false;

update public.shop_items set category = case
    when category = 'hat' then 'head'
    when category = 'bag' then 'back'
    when id in ('outfit-belt', 'acc-star') then 'top'
    when category = 'outfit' then 'neck'
    when category = 'accessory' then 'face'
    else category end;
alter table public.shop_items add constraint shop_items_category_check
  check (category in ('characters', 'head', 'hair', 'face', 'neck', 'top', 'gloves', 'shoes', 'cape', 'back', 'weapon', 'pet'));

alter table public.equipped_items drop constraint equipped_items_slot_check;
update public.equipped_items e set slot = s.category from public.shop_items s where s.id = e.item_id;
alter table public.equipped_items add constraint equipped_items_slot_check
  check (slot in ('head', 'hair', 'face', 'neck', 'top', 'gloves', 'shoes', 'cape', 'back', 'weapon', 'pet'));

insert into public.shop_items (id, category, name_ar, description, price, rarity, in_shop, in_packages, creature_ok, sort_order, character_id) values
  ('hat-grad', 'head', 'قبعة التخرّج', 'لمن يحبّ النجاح والتفوّق.', 120, 'common', true, true, true, 100, null),
  ('hat-straw', 'head', 'قبعة القش', 'قبعة صيفية للمغامرات الطويلة.', 80, 'common', true, true, true, 101, null),
  ('hat-crown', 'head', 'التاج الملكي', 'تاج صغير لأبطال المعرفة.', 200, 'rare', true, true, true, 102, null),
  ('hat-beanie', 'head', 'قبعة صوفية', 'قبعة زرقاء دافئة.', 60, 'common', true, true, true, 103, null),
  ('head-flowers', 'head', 'إكليل الزهور', 'إكليل من زهور الربيع الملوّنة.', 70, 'common', true, true, false, 104, null),
  ('head-wizard', 'head', 'قبعة الحكيم', 'قبعة مدبّبة مرصّعة بالنجوم.', 160, 'rare', true, true, false, 105, null),
  ('head-helmet', 'head', 'خوذة الفارس', 'خوذة لامعة بريشة ملوّنة.', 180, 'rare', true, true, false, 106, null),
  ('head-turban', 'head', 'عمامة الرحّالة', 'عمامة بيضاء بجوهرة لامعة.', 0, 'rare', false, true, false, 107, null),
  ('head-dragon', 'head', 'خوذة التنين', 'خوذة بقرنين من عالم التنانين.', 0, 'legendary', false, true, false, 108, null),
  ('hair-ribbon-red', 'hair', 'شريطة حمراء', 'شريطة لطيفة على جانب الرأس.', 40, 'common', true, true, false, 109, null),
  ('hair-ribbon-blue', 'hair', 'شريطة زرقاء', 'شريطة زرقاء بعقدة لامعة.', 40, 'common', true, true, false, 110, null),
  ('hair-flower', 'hair', 'زهرة الشعر', 'زهرة وردية تزيّن الرأس.', 45, 'common', true, true, false, 111, null),
  ('hair-star-pin', 'hair', 'مشبك النجمة', 'مشبك على شكل نجمة.', 120, 'rare', true, true, false, 112, null),
  ('hair-moon', 'hair', 'مشبك الهلال', 'هلال فضّي يلمع في الليل.', 0, 'epic', false, true, false, 113, null),
  ('acc-glasses', 'face', 'نظارة القراءة', 'نظارة دائرية لقراءة الكتب.', 90, 'common', true, true, true, 114, null),
  ('acc-sunglasses', 'face', 'نظارة شمسية', 'نظارة داكنة للأيام المشمسة.', 100, 'common', true, true, true, 115, null),
  ('face-monocle', 'face', 'المونوكل', 'عدسة أنيقة لعين واحدة.', 130, 'rare', true, true, false, 116, null),
  ('face-mask', 'face', 'قناع البطل', 'قناع مغامر يغطي العينين فقط.', 0, 'rare', false, true, false, 117, null),
  ('face-goggles', 'face', 'نظارة المخترع', 'نظارة نحاسية بعدسات ملوّنة.', 0, 'epic', false, true, false, 118, null),
  ('outfit-scarf', 'neck', 'وشاح أحمر', 'وشاح دافئ بحافة ملوّنة.', 60, 'common', true, true, true, 119, null),
  ('outfit-bowtie', 'neck', 'ربطة فراشية', 'ربطة عنق بنفسجية أنيقة.', 50, 'common', true, true, true, 120, null),
  ('neck-shemagh', 'neck', 'شماغ مربّع', 'وشاح أحمر وأبيض بنقوش مربّعة.', 70, 'common', true, true, false, 121, null),
  ('neck-medal', 'neck', 'ميدالية المعرفة', 'ميدالية لمن يتعلّم كل يوم.', 65, 'common', true, true, false, 122, null),
  ('neck-amulet', 'neck', 'تميمة الحكمة', 'قلادة بحجر يلمع بهدوء.', 0, 'rare', false, true, false, 123, null),
  ('neck-cloud', 'neck', 'وشاح الغيوم', 'وشاح ناعم كالغيم.', 0, 'epic', false, true, false, 124, null),
  ('outfit-belt', 'top', 'حزام المستكشف', 'حزام جلدي بإبزيم لامع.', 70, 'common', true, true, true, 125, null),
  ('acc-star', 'top', 'شارة النجمة', 'شارة تلمع على الصدر.', 70, 'common', true, true, true, 126, null),
  ('top-vest', 'top', 'سترة المستكشف', 'سترة بجيوب كثيرة فوق الملابس.', 75, 'common', true, true, false, 127, null),
  ('top-armor', 'top', 'درع الفارس', 'درع صدري لامع فوق الثياب.', 170, 'rare', true, true, false, 128, null),
  ('top-sash', 'top', 'وشاح الشرف', 'وشاح ملكي بجوهرة على الصدر.', 0, 'epic', false, true, false, 129, null),
  ('top-phoenix', 'top', 'درع العنقاء', 'درع من ريش العنقاء المتوهّج.', 0, 'legendary', false, true, false, 130, null),
  ('gloves-leather', 'gloves', 'قفازات جلدية', 'قفازات متينة للمغامرات.', 45, 'common', true, true, false, 131, null),
  ('gloves-white', 'gloves', 'قفازات بيضاء', 'قفازات أنيقة للمناسبات.', 45, 'common', true, true, false, 132, null),
  ('gloves-gauntlet', 'gloves', 'قفازات الفارس', 'قفازات معدنية لامعة.', 140, 'rare', true, true, false, 133, null),
  ('gloves-mage', 'gloves', 'قفازات الساحر', 'قفازات تشعّ بنور لطيف.', 0, 'epic', false, true, false, 134, null),
  ('boots-red', 'shoes', 'حذاء أحمر', 'حذاء خفيف للجري والقفز.', 50, 'common', true, true, false, 135, null),
  ('boots-cloud', 'shoes', 'حذاء الغيمة', 'حذاء أبيض ناعم كالغيم.', 55, 'common', true, true, false, 136, null),
  ('boots-knight', 'shoes', 'حذاء الفارس', 'حذاء معدني متين.', 140, 'rare', true, true, false, 137, null),
  ('boots-winged', 'shoes', 'الحذاء المجنّح', 'حذاء بجناحين صغيرين.', 0, 'epic', false, true, false, 138, null),
  ('cape-red', 'cape', 'عباءة حمراء', 'عباءة البطل الشجاع.', 70, 'common', true, true, false, 139, null),
  ('cape-blue', 'cape', 'عباءة زرقاء', 'عباءة بلون السماء.', 70, 'common', true, true, false, 140, null),
  ('cape-royal', 'cape', 'العباءة الملكية', 'عباءة بنفسجية بحافة فاخرة.', 170, 'rare', true, true, false, 141, null),
  ('cape-starry', 'cape', 'عباءة النجوم', 'عباءة ليلية تتلألأ فيها النجوم.', 0, 'epic', false, true, false, 142, null),
  ('cape-dragon', 'cape', 'عباءة التنين', 'عباءة بحراشف التنين الحمراء.', 0, 'legendary', false, true, false, 143, null),
  ('bag-school', 'back', 'حقيبة مدرسية', 'حقيبة حمراء لكتبك ودفاترك.', 80, 'common', true, true, true, 144, null),
  ('bag-books', 'back', 'حقيبة الكتب', 'حقيبة خضراء خفيفة.', 90, 'common', true, true, true, 145, null),
  ('bag-explorer', 'back', 'حقيبة المستكشف', 'حقيبة جلدية للرحلات.', 150, 'rare', true, true, true, 146, null),
  ('back-shield', 'back', 'درع الظهر', 'ترس دائري معلّق على الظهر.', 150, 'rare', true, true, false, 147, null),
  ('back-fairy', 'back', 'أجنحة الفراشة', 'أجنحة شفّافة ملوّنة.', 0, 'epic', false, true, false, 148, null),
  ('back-dragon-wings', 'back', 'أجنحة التنين', 'جناحان عظيمان لحماة المعرفة.', 0, 'legendary', false, true, false, 149, null),
  ('weapon-wood-sword', 'weapon', 'سيف خشبي', 'سيف تدريب خشبي آمن.', 60, 'common', true, true, false, 150, null),
  ('weapon-spear', 'weapon', 'رمح الحارس', 'رمح طويل بزينة ملوّنة.', 65, 'common', true, true, false, 151, null),
  ('weapon-sword', 'weapon', 'سيف الفارس', 'سيف لامع للزينة فقط.', 160, 'rare', true, true, false, 152, null),
  ('weapon-staff', 'weapon', 'عصا الحكمة', 'عصا خشبية تعلوها كرة مضيئة.', 0, 'rare', false, true, false, 153, null),
  ('weapon-bow', 'weapon', 'قوس الرامي', 'قوس خشبي بوتر فضّي.', 0, 'epic', false, true, false, 154, null),
  ('weapon-crystal', 'weapon', 'سيف البلّور', 'سيف من بلّور سحري يلمع.', 0, 'legendary', false, true, false, 155, null),
  ('pet-chick', 'pet', 'كتكوت', 'رفيق أصفر صغير يتبعك.', 80, 'common', true, true, true, 156, null),
  ('pet-bunny', 'pet', 'أرنب', 'أرنب أبيض يحبّ الجزر.', 90, 'common', true, true, true, 157, null),
  ('pet-cat', 'pet', 'قطّة', 'قطّة برتقالية فضولية.', 150, 'rare', true, true, true, 158, null),
  ('pet-puppy', 'pet', 'جرو', 'جرو مخلص لا يفارقك.', 0, 'rare', false, true, true, 159, null),
  ('pet-owlet', 'pet', 'بومة صغيرة', 'بومة صغيرة تحبّ القراءة.', 0, 'epic', false, true, true, 160, null),
  ('pet-dragon', 'pet', 'تنين صغير', 'تنين صغير لطيف يطير بجانبك.', 0, 'legendary', false, true, true, 161, null),
  ('char-green-slime', 'characters', 'سلايم الأخضر', 'كائن أسطوري هادئ يحب القفز فوق العشب.', 0, 'legendary', false, true, true, 10, 'green-slime'),
  ('char-blue-slime', 'characters', 'سلايم الأزرق', 'كائن أسطوري مبتسم دائمًا.', 0, 'legendary', false, true, true, 11, 'blue-slime'),
  ('char-little-robot', 'characters', 'الروبوت الصغير', 'مساعد أسطوري بشاشة مبتسمة.', 0, 'legendary', false, true, true, 12, 'little-robot'),
  ('char-fox', 'characters', 'الثعلب', 'ثعلب أسطوري ذكي وسريع.', 0, 'legendary', false, true, true, 13, 'fox'),
  ('char-owl', 'characters', 'البومة الحكيمة', 'بومة أسطورية تحب الكتب.', 0, 'legendary', false, true, true, 14, 'owl'),
  ('char-turtle', 'characters', 'السلحفاة الصبورة', 'سلحفاة أسطورية تتأنّى حتى تصل إلى الجواب.', 0, 'legendary', false, true, true, 15, 'turtle')

on conflict (id) do update set category = excluded.category, name_ar = excluded.name_ar, description = excluded.description,
  price = excluded.price, rarity = excluded.rarity, in_shop = excluded.in_shop, in_packages = excluded.in_packages,
  creature_ok = excluded.creature_ok, sort_order = excluded.sort_order, character_id = excluded.character_id, active = true;

-- ---------------------------------------------------------------------------
-- Inventory tiers, upgrade points, package records, parental controls
-- ---------------------------------------------------------------------------
alter table public.inventory drop constraint inventory_source_check;
alter table public.inventory add constraint inventory_source_check check (source in ('purchase', 'grant', 'package'));
alter table public.inventory add column if not exists tier smallint not null default 1 check (tier between 1 and 6);

alter table public.reward_transactions drop constraint reward_transactions_kind_check;
alter table public.reward_transactions drop constraint reward_transactions_check;
alter table public.reward_transactions add constraint reward_transactions_kind_check
  check (kind in ('question', 'mission', 'purchase', 'package', 'package_reward', 'multiplayer'));
alter table public.reward_transactions add constraint reward_transactions_check check (
     (kind in ('question', 'mission', 'multiplayer') and xp >= 0 and coins >= 0)
  or (kind in ('purchase', 'package') and xp = 0 and coins <= 0)
  or (kind = 'package_reward' and xp = 0 and coins >= 0));

create table public.upgrade_point_ledger (
  id bigint generated always as identity primary key,
  student_id uuid not null references public.student_profiles (id) on delete cascade,
  kind text not null check (kind in ('duplicate', 'package', 'upgrade')),
  ref text not null,
  points int not null check (points between -1000 and 1000 and points <> 0),
  item_id text references public.shop_items (id),
  created_at timestamptz not null default now(),
  unique (student_id, kind, ref),
  check ((kind = 'upgrade' and points < 0) or (kind <> 'upgrade' and points > 0))
);
create index upgrade_point_ledger_student_idx on public.upgrade_point_ledger (student_id, created_at desc);

create table public.package_types (
  id text primary key check (id ~ '^[a-z0-9-]{2,30}$'),
  name_ar text not null,
  description text not null default '',
  price int not null check (price between 10 and 5000),
  rolls smallint not null check (rolls between 1 and 5),
  -- Relative weights per rarity (any positive scale).
  weights jsonb not null,
  -- The last roll of every package is at least this rarity.
  guarantee text not null default 'common' check (guarantee in ('common', 'rare', 'epic', 'legendary')),
  -- Protection against long unlucky streaks: after this many opens without one, the next roll is at least epic / legendary.
  pity_epic int not null check (pity_epic between 1 and 200),
  pity_legendary int not null check (pity_legendary between 1 and 500),
  -- Chance (0–1) that a common roll is a small coin or point bundle instead of an item.
  bundle_chance numeric not null default 0.2 check (bundle_chance between 0 and 0.5),
  active boolean not null default true,
  sort_order int not null default 0
);
insert into public.package_types (id, name_ar, description, price, rolls, weights, guarantee, pity_epic, pity_legendary, bundle_chance, sort_order) values
  ('adventure', 'علبة المغامرة', 'مكافأة واحدة: غالبًا زينة شائعة، وأحيانًا نادرة أو أفضل.', 60, 1,
   '{"common": 70, "rare": 22, "epic": 7, "legendary": 1}', 'common', 10, 60, 0.2, 1),
  ('heroes', 'علبة الأبطال', 'مكافأتان، إحداهما نادرة على الأقل.', 150, 2,
   '{"common": 55, "rare": 30, "epic": 12, "legendary": 3}', 'rare', 6, 35, 0.15, 2),
  ('legends', 'علبة الأساطير', 'ثلاث مكافآت، إحداها ملحمية على الأقل، وفرصة أكبر لشخصية أسطورة.', 350, 3,
   '{"common": 35, "rare": 35, "epic": 22, "legendary": 8}', 'epic', 3, 15, 0.1, 3);

create table public.package_opens (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.student_profiles (id) on delete cascade,
  package_id text not null references public.package_types (id),
  request_id uuid not null,
  price int not null,
  rewards jsonb not null,
  created_at timestamptz not null default now(),
  unique (student_id, request_id)
);
create index package_opens_student_idx on public.package_opens (student_id, created_at desc);

create table public.package_pity (
  student_id uuid not null references public.student_profiles (id) on delete cascade,
  package_id text not null references public.package_types (id),
  since_epic int not null default 0,
  since_legendary int not null default 0,
  primary key (student_id, package_id)
);

-- Parent-set limits per child (defaults apply when there is no row).
create table public.child_controls (
  student_id uuid primary key references public.student_profiles (id) on delete cascade,
  packages_allowed boolean not null default true,
  packages_daily_limit int not null default 5 check (packages_daily_limit between 0 and 20),
  multiplayer_allowed boolean not null default true,
  reactions_allowed boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.upgrade_point_ledger enable row level security;
alter table public.package_types enable row level security;
alter table public.package_opens enable row level security;
alter table public.package_pity enable row level security;
alter table public.child_controls enable row level security;

create policy package_types_read on public.package_types for select to authenticated using (active or public.is_admin());
create policy package_types_admin on public.package_types for all to authenticated using (public.is_admin()) with check (public.is_admin());
do $$
declare t text;
begin
  foreach t in array array['upgrade_point_ledger', 'package_opens', 'package_pity', 'child_controls'] loop
    execute format('create policy %1$s_read on public.%1$s for select to authenticated using (student_id = (select auth.uid()) or public.is_parent_of(student_id) or public.is_admin())', t);
    execute format('revoke insert, update, delete on public.%1$s from authenticated', t);
    execute format('grant select on public.%1$s to authenticated', t);
  end loop;
end $$;
grant select on public.package_types to authenticated;
grant insert, update, delete on public.package_types to authenticated; -- RLS: admins only
revoke all on public.upgrade_point_ledger, public.package_types, public.package_opens, public.package_pity, public.child_controls from anon;

-- ---------------------------------------------------------------------------
-- Human avatars: two free starters; the old creatures become legendary collectibles
-- ---------------------------------------------------------------------------
alter table public.student_profiles add column if not exists appearance jsonb not null default '{"body": "boy"}'::jsonb
  check (jsonb_typeof(appearance) = 'object' and octet_length(appearance::text) <= 512);
alter table public.student_profiles alter column character_id set default 'human-boy';
-- Everyone moves to a human starter. Purchased creatures stay in their inventory and can be chosen again.
update public.student_profiles set character_id = 'human-boy' where character_id not in ('human-boy', 'human-girl');

create or replace function public.base_character_ids() returns text[] language sql immutable as $$
  select array['human-boy', 'human-girl']
$$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_role public.app_role := 'parent';
  v_meta jsonb := coalesce(new.raw_app_meta_data, '{}');
begin
  if v_meta ->> 'role' = 'student' then
    v_role := 'student';
  end if;
  insert into public.profiles (id, role) values (new.id, v_role) on conflict (id) do nothing;
  if v_role = 'student' then
    insert into public.student_profiles (id, username, nickname, character_id, appearance)
    values (
      new.id,
      v_meta ->> 'username',
      coalesce(nullif(v_meta ->> 'nickname', ''), v_meta ->> 'username'),
      case when v_meta ->> 'character_id' = 'human-girl' then 'human-girl' else 'human-boy' end,
      jsonb_build_object('body', case when v_meta ->> 'character_id' = 'human-girl' then 'girl' else 'boy' end)
    );
    if (v_meta ->> 'parent_id') is not null then
      insert into public.parent_children (parent_id, student_id)
      values ((v_meta ->> 'parent_id')::uuid, new.id) on conflict do nothing;
    end if;
  else
    insert into public.parent_settings (parent_id) values (new.id) on conflict do nothing;
  end if;
  return new;
end $$;

create or replace function public.protect_student_profile() returns trigger
language plpgsql as $$
begin
  if current_user in ('anon', 'authenticated') and (
       new.username is distinct from old.username
    or new.character_id is distinct from old.character_id -- validated by set_character() / set_appearance()
    or new.appearance is distinct from old.appearance
    or new.leaderboard_excluded is distinct from old.leaderboard_excluded
    or new.legacy_imported_at is distinct from old.legacy_imported_at
    or new.id is distinct from old.id) then
    raise exception 'field cannot be changed' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end $$;

/** Validates and saves the human avatar's look; also makes it the active character. */
create or replace function public.set_appearance(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_student uuid := public.require_student();
  v_body text := p ->> 'body';
  v jsonb;
  ok boolean;
begin
  if p is null or jsonb_typeof(p) <> 'object' or v_body not in ('boy', 'girl') then raise exception 'invalid appearance' using errcode = '22023'; end if;
  ok := jsonb_typeof(p -> 'skin') = 'number' and (p ->> 'skin')::numeric in (0, 1, 2, 3, 4, 5)
    and p ->> 'hair' in ('spiky', 'short', 'curly', 'ponytail', 'long', 'braid', 'bun', 'bob')
    and jsonb_typeof(p -> 'hairColor') = 'number' and (p ->> 'hairColor')::numeric between 0 and 7 and (p ->> 'hairColor')::numeric = floor((p ->> 'hairColor')::numeric)
    and p ->> 'theme' in ('arabian', 'medieval', 'chinese', 'eastern', 'adventurer', 'scholar')
    and jsonb_typeof(p -> 'primary') = 'number' and (p ->> 'primary')::numeric between 0 and 11 and (p ->> 'primary')::numeric = floor((p ->> 'primary')::numeric)
    and jsonb_typeof(p -> 'secondary') = 'number' and (p ->> 'secondary')::numeric between 0 and 11 and (p ->> 'secondary')::numeric = floor((p ->> 'secondary')::numeric)
    and jsonb_typeof(p -> 'hijab') = 'boolean'
    and jsonb_typeof(p -> 'hijabColor') = 'number' and (p ->> 'hijabColor')::numeric between 0 and 8 and (p ->> 'hijabColor')::numeric = floor((p ->> 'hijabColor')::numeric);
  if not coalesce(ok, false) then raise exception 'invalid appearance' using errcode = '22023'; end if;
  v := jsonb_build_object('body', v_body, 'skin', (p ->> 'skin')::int, 'hair', p ->> 'hair', 'hairColor', (p ->> 'hairColor')::int,
         'theme', p ->> 'theme', 'primary', (p ->> 'primary')::int, 'secondary', (p ->> 'secondary')::int,
         -- The hijab option exists for the female avatar only.
         'hijab', v_body = 'girl' and (p ->> 'hijab')::boolean, 'hijabColor', (p ->> 'hijabColor')::int);
  update public.student_profiles set appearance = v, character_id = 'human-' || v_body where id = v_student;
  return v;
end $$;

create or replace function public.set_character(p_character text) returns void
language plpgsql security definer set search_path = public as $$
declare v_student uuid := public.require_student();
begin
  if not (p_character = any (public.base_character_ids())) and not exists (
    select 1 from public.inventory i join public.shop_items s on s.id = i.item_id
    where i.student_id = v_student and s.category = 'characters' and s.character_id = p_character) then
    raise exception 'character locked' using errcode = '42501';
  end if;
  update public.student_profiles set character_id = p_character where id = v_student;
end $$;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
/** Uniform [0, 1) from the operating system's CSPRNG (pgcrypto). */
create or replace function public.secure_random() returns double precision
language sql volatile set search_path = public, extensions as $$
  select (('x' || encode(extensions.gen_random_bytes(6), 'hex'))::bit(48)::bigint)::double precision / 281474976710656.0
$$;

create or replace function public.rarity_rank(p text) returns int language sql immutable as $$
  select case p when 'common' then 1 when 'rare' then 2 when 'epic' then 3 when 'legendary' then 4 end
$$;

create or replace function public.duplicate_points(p_rarity text, p_category text) returns int language sql immutable as $$
  select case p_rarity when 'common' then 5 when 'rare' then 15 when 'epic' then 40
                       when 'legendary' then case when p_category = 'characters' then 150 else 120 end end
$$;

/** Points needed to reach `p_tier` (2..6) from the tier below. */
create or replace function public.upgrade_cost(p_tier int) returns int language sql immutable as $$
  select case p_tier when 2 then 20 when 3 then 45 when 4 then 90 when 5 then 160 when 6 then 280 end
$$;

create or replace function public.upgrade_points_of(p_student uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(sum(points), 0)::int from public.upgrade_point_ledger where student_id = p_student
$$;

/** Equipped items as "id@tier" keys (what the sprite renderer draws). */
create or replace function public.worn_keys(p_student uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(e.item_id || '@' || coalesce(i.tier, 1) order by e.slot), '[]'::jsonb)
  from public.equipped_items e left join public.inventory i on i.student_id = e.student_id and i.item_id = e.item_id
  where e.student_id = p_student
$$;

create or replace function public.controls_of(p_student uuid) returns public.child_controls
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select c from public.child_controls c where c.student_id = p_student),
    row(p_student, true, 5, true, true, now())::public.child_controls)
$$;

/** Weighted rarity roll, never below `p_min`. */
create or replace function public.roll_rarity(p_weights jsonb, p_min text) returns text
language plpgsql volatile set search_path = public as $$
declare
  r text;
  total numeric := 0;
  x numeric;
begin
  foreach r in array array['common', 'rare', 'epic', 'legendary'] loop
    if public.rarity_rank(r) >= public.rarity_rank(p_min) then total := total + greatest(coalesce((p_weights ->> r)::numeric, 0), 0); end if;
  end loop;
  if total <= 0 then return p_min; end if;
  x := public.secure_random() * total;
  foreach r in array array['common', 'rare', 'epic', 'legendary'] loop
    if public.rarity_rank(r) >= public.rarity_rank(p_min) then
      x := x - greatest(coalesce((p_weights ->> r)::numeric, 0), 0);
      if x < 0 then return r; end if;
    end if;
  end loop;
  return 'legendary';
end $$;

-- ---------------------------------------------------------------------------
-- Shop purchase: only items offered in the normal shop (characters come from packages)
-- ---------------------------------------------------------------------------
create or replace function public.purchase_item(p_item text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_student uuid := public.require_student();
  v_item public.shop_items%rowtype;
  v_coins int;
begin
  perform 1 from public.student_profiles where id = v_student for update;
  select * into v_item from public.shop_items where id = p_item and active and in_shop and category <> 'characters';
  if not found then raise exception 'unknown item' using errcode = 'P0002'; end if;
  if exists (select 1 from public.inventory where student_id = v_student and item_id = p_item) then
    raise exception 'already owned' using errcode = 'P0003';
  end if;
  select coins into v_coins from public.wallet_totals(v_student);
  if v_coins < v_item.price then
    raise exception 'insufficient coins' using errcode = 'P0004', detail = (v_item.price - v_coins)::text;
  end if;
  insert into public.reward_transactions (student_id, kind, ref, xp, coins) values (v_student, 'purchase', p_item, 0, -v_item.price);
  insert into public.inventory (student_id, item_id, source) values (v_student, p_item, 'purchase');
  return jsonb_build_object('item', p_item, 'price', v_item.price, 'coins', v_coins - v_item.price);
end $$;

-- ---------------------------------------------------------------------------
-- Surprise packages
-- ---------------------------------------------------------------------------
create or replace function public.open_package(p_package text, p_request uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_student uuid := public.require_student();
  v_pk public.package_types%rowtype;
  v_ctl public.child_controls;
  v_coins int;
  v_open uuid := gen_random_uuid();
  v_prev jsonb;
  v_pity public.package_pity%rowtype;
  v_rewards jsonb := '[]'::jsonb;
  v_min text;
  v_rarity text;
  v_item public.shop_items%rowtype;
  v_granted text[] := '{}';
  v_points int;
  v_amount int;
  i int;
begin
  if p_request is null then raise exception 'request id required' using errcode = '22023'; end if;
  -- One package at a time per student: no double spending from parallel taps.
  perform 1 from public.student_profiles where id = v_student for update;
  -- Same request again (double tap, retry after a lost response): same result, no new charge.
  select jsonb_build_object('open_id', id, 'package', package_id, 'price', price, 'rewards', rewards, 'replay', true)
    into v_prev from public.package_opens where student_id = v_student and request_id = p_request;
  if found then
    return v_prev || jsonb_build_object('coins', (select coins from public.wallet_totals(v_student)), 'points', public.upgrade_points_of(v_student));
  end if;
  select * into v_pk from public.package_types where id = p_package and active;
  if not found then raise exception 'unknown package' using errcode = 'P0002'; end if;
  v_ctl := public.controls_of(v_student);
  if not v_ctl.packages_allowed then raise exception 'packages disabled by parent' using errcode = '42501'; end if;
  if (select count(*) from public.package_opens where student_id = v_student and created_at >= date_trunc('day', now())) >= v_ctl.packages_daily_limit then
    raise exception 'daily package limit' using errcode = 'P0001';
  end if;
  select coins into v_coins from public.wallet_totals(v_student);
  if v_coins < v_pk.price then
    raise exception 'insufficient coins' using errcode = 'P0004', detail = (v_pk.price - v_coins)::text;
  end if;
  insert into public.reward_transactions (student_id, kind, ref, xp, coins) values (v_student, 'package', v_open::text, 0, -v_pk.price);

  insert into public.package_pity (student_id, package_id) values (v_student, v_pk.id) on conflict do nothing;
  select * into v_pity from public.package_pity where student_id = v_student and package_id = v_pk.id for update;

  for i in 1 .. v_pk.rolls loop
    v_min := case when i = v_pk.rolls then v_pk.guarantee else 'common' end;
    if v_pity.since_legendary + 1 >= v_pk.pity_legendary then v_min := 'legendary';
    elsif v_pity.since_epic + 1 >= v_pk.pity_epic and public.rarity_rank(v_min) < 3 then v_min := 'epic';
    end if;
    v_rarity := public.roll_rarity(v_pk.weights, v_min);
    v_pity.since_epic := case when public.rarity_rank(v_rarity) >= 3 then 0 else v_pity.since_epic + 1 end;
    v_pity.since_legendary := case when v_rarity = 'legendary' then 0 else v_pity.since_legendary + 1 end;

    if v_rarity = 'common' and public.secure_random() < v_pk.bundle_chance then
      -- Small bundle instead of an item: coins (rarer) or upgrade points.
      if public.secure_random() < 0.4 then
        v_amount := 15;
        insert into public.reward_transactions (student_id, kind, ref, xp, coins) values (v_student, 'package_reward', v_open::text || ':' || i, 0, v_amount);
        v_rewards := v_rewards || jsonb_build_object('kind', 'coins', 'rarity', 'common', 'coins', v_amount);
      else
        v_amount := 15;
        insert into public.upgrade_point_ledger (student_id, kind, ref, points) values (v_student, 'package', v_open::text || ':' || i, v_amount);
        v_rewards := v_rewards || jsonb_build_object('kind', 'points', 'rarity', 'common', 'points', v_amount);
      end if;
      continue;
    end if;

    select * into v_item from public.shop_items where active and in_packages and rarity = v_rarity order by public.secure_random() limit 1;
    if not found then
      v_amount := public.duplicate_points(v_rarity, 'item');
      insert into public.upgrade_point_ledger (student_id, kind, ref, points) values (v_student, 'package', v_open::text || ':' || i, v_amount);
      v_rewards := v_rewards || jsonb_build_object('kind', 'points', 'rarity', v_rarity, 'points', v_amount);
      continue;
    end if;
    if v_item.id = any (v_granted) or exists (select 1 from public.inventory where student_id = v_student and item_id = v_item.id) then
      -- Duplicate: converted automatically into upgrade points, once (unique ledger key).
      v_points := public.duplicate_points(v_item.rarity, v_item.category);
      insert into public.upgrade_point_ledger (student_id, kind, ref, points, item_id) values (v_student, 'duplicate', v_open::text || ':' || i, v_points, v_item.id);
      v_rewards := v_rewards || jsonb_build_object('kind', 'item', 'item', v_item.id, 'category', v_item.category, 'rarity', v_item.rarity, 'duplicate', true, 'points', v_points);
    else
      insert into public.inventory (student_id, item_id, source) values (v_student, v_item.id, 'package');
      v_granted := v_granted || v_item.id;
      v_rewards := v_rewards || jsonb_build_object('kind', 'item', 'item', v_item.id, 'category', v_item.category, 'rarity', v_item.rarity, 'duplicate', false);
    end if;
  end loop;

  update public.package_pity set since_epic = v_pity.since_epic, since_legendary = v_pity.since_legendary
   where student_id = v_student and package_id = v_pk.id;
  insert into public.package_opens (id, student_id, package_id, request_id, price, rewards) values (v_open, v_student, v_pk.id, p_request, v_pk.price, v_rewards);
  return jsonb_build_object('open_id', v_open, 'package', v_pk.id, 'price', v_pk.price, 'rewards', v_rewards, 'replay', false,
                            'coins', (select coins from public.wallet_totals(v_student)), 'points', public.upgrade_points_of(v_student));
end $$;

/** Package list for the shop, with the published odds (shown only when the player asks). */
create or replace function public.get_packages() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_student uuid := public.require_student();
  v_ctl public.child_controls := public.controls_of(v_student);
begin
  return jsonb_build_object(
    'packages', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name_ar, 'description', description, 'price', price, 'rolls', rolls,
                 'guarantee', guarantee, 'weights', weights, 'pity_epic', pity_epic, 'pity_legendary', pity_legendary, 'bundle_chance', bundle_chance)
               order by sort_order) from public.package_types where active), '[]'::jsonb),
    'allowed', v_ctl.packages_allowed,
    'daily_limit', v_ctl.packages_daily_limit,
    'opened_today', (select count(*) from public.package_opens where student_id = v_student and created_at >= date_trunc('day', now())),
    'pools', (select jsonb_object_agg(rarity, n) from (select rarity, count(*) n from public.shop_items where active and in_packages group by rarity) x),
    'history', coalesce((select jsonb_agg(jsonb_build_object('at', created_at, 'package', package_id, 'price', price, 'rewards', rewards) order by created_at desc)
                         from (select * from public.package_opens where student_id = v_student order by created_at desc limit 10) h), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------------------
-- Wearable upgrades (cosmetic only)
-- ---------------------------------------------------------------------------
create or replace function public.upgrade_item(p_item text, p_from_tier int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_student uuid := public.require_student();
  v_tier int;
  v_cat text;
  v_cost int;
  v_points int;
begin
  perform 1 from public.student_profiles where id = v_student for update;
  select i.tier, s.category into v_tier, v_cat from public.inventory i join public.shop_items s on s.id = i.item_id
   where i.student_id = v_student and i.item_id = p_item for update of i;
  if not found then raise exception 'not owned' using errcode = '42501'; end if;
  if v_cat = 'characters' then raise exception 'not upgradable' using errcode = '22023'; end if;
  -- The client says which tier it is upgrading from: a repeated or stale request is refused, never double-charged.
  if v_tier <> p_from_tier then raise exception 'tier changed' using errcode = 'P0003'; end if;
  if v_tier >= 6 then raise exception 'max tier' using errcode = 'P0003'; end if;
  v_cost := public.upgrade_cost(v_tier + 1);
  v_points := public.upgrade_points_of(v_student);
  if v_points < v_cost then raise exception 'insufficient points' using errcode = 'P0004', detail = (v_cost - v_points)::text; end if;
  insert into public.upgrade_point_ledger (student_id, kind, ref, points, item_id) values (v_student, 'upgrade', p_item || ':' || (v_tier + 1), -v_cost, p_item);
  update public.inventory set tier = v_tier + 1 where student_id = v_student and item_id = p_item;
  return jsonb_build_object('item', p_item, 'tier', v_tier + 1, 'cost', v_cost, 'points', v_points - v_cost);
end $$;

-- ---------------------------------------------------------------------------
-- Game state (adds avatar look, tiers, points and controls)
-- ---------------------------------------------------------------------------
create or replace function public.get_my_game_state() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_student uuid := public.require_student();
  v_p public.student_profiles%rowtype;
  v_w record;
  v_ctl public.child_controls;
begin
  select * into v_p from public.student_profiles where id = v_student;
  select * into v_w from public.wallet_totals(v_student);
  v_ctl := public.controls_of(v_student);
  return jsonb_build_object(
    'student_id', v_student, 'username', v_p.username, 'nickname', v_p.nickname, 'character_id', v_p.character_id,
    'appearance', v_p.appearance,
    'xp', v_w.xp, 'coins', v_w.coins, 'upgrade_points', public.upgrade_points_of(v_student),
    'owned', coalesce((select jsonb_agg(item_id order by acquired_at) from public.inventory where student_id = v_student), '[]'::jsonb),
    'tiers', coalesce((select jsonb_object_agg(item_id, tier) from public.inventory where student_id = v_student), '{}'::jsonb),
    'equipped', coalesce((select jsonb_object_agg(slot, item_id) from public.equipped_items where student_id = v_student), '{}'::jsonb),
    'controls', jsonb_build_object('packages_allowed', v_ctl.packages_allowed, 'packages_daily_limit', v_ctl.packages_daily_limit,
                                   'multiplayer_allowed', v_ctl.multiplayer_allowed, 'reactions_allowed', v_ctl.reactions_allowed),
    'legacy_imported', v_p.legacy_imported_at is not null,
    'mission_best', coalesce((
      select jsonb_object_agg(mission_id, best) from (
        select mission_id::text, max((summary ->> 'first_try_accuracy')::int) as best
        from public.quiz_sessions where student_id = v_student and status = 'completed' group by mission_id) b), '{}'::jsonb)
  );
end $$;

create or replace function public.group_leaderboard(p_group uuid, p_period text default 'week') returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_since timestamptz := case when p_period = 'week' then date_trunc('week', now() + interval '1 day') - interval '1 day' else '-infinity'::timestamptz end;
begin
  if not (
       exists (select 1 from public.groups g where g.id = p_group and g.owner_id = v_me)
    or exists (select 1 from public.group_members m where m.group_id = p_group and m.student_id = v_me and m.status = 'active')
    or exists (select 1 from public.group_members m where m.group_id = p_group and m.status = 'active' and public.is_parent_of(m.student_id))
    or public.is_admin()) then
    raise exception 'not a member of this group' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'group', (select jsonb_build_object('id', g.id, 'name', g.name, 'active', g.active) from public.groups g where g.id = p_group),
    'period', p_period,
    'since', case when p_period = 'week' then v_since end,
    'rows', coalesce((
      select jsonb_agg(r order by (r ->> 'rank')::int, r ->> 'nickname') from (
        select jsonb_build_object(
          'rank', rank() over (order by x.xp desc),
          'nickname', x.nickname, 'character_id', x.character_id, 'appearance', x.appearance, 'outfit', x.outfit, 'xp', x.xp, 'is_me', x.student_id = v_me) as r
        from (
          select sp.id as student_id, sp.nickname, sp.character_id, sp.appearance,
                 public.worn_keys(sp.id) as outfit,
                 coalesce((select sum(t.xp) from public.reward_transactions t
                           where t.student_id = sp.id and t.kind in ('question', 'mission') and t.created_at >= v_since), 0)::int as xp
          from public.group_members m join public.student_profiles sp on sp.id = m.student_id
          where m.group_id = p_group and m.status = 'active' and sp.show_in_leaderboards and not sp.leaderboard_excluded
        ) x
      ) ranked), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------------------
-- Parents: controls and the economy history of their children
-- ---------------------------------------------------------------------------
create or replace function public.parent_set_controls(p_student uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v public.child_controls;
begin
  if not public.is_parent_of(p_student) then raise exception 'not your child' using errcode = '42501'; end if;
  v := public.controls_of(p_student);
  insert into public.child_controls (student_id, packages_allowed, packages_daily_limit, multiplayer_allowed, reactions_allowed, updated_at)
  values (p_student,
          coalesce((p ->> 'packages_allowed')::boolean, v.packages_allowed),
          least(20, greatest(0, coalesce((p ->> 'packages_daily_limit')::int, v.packages_daily_limit))),
          coalesce((p ->> 'multiplayer_allowed')::boolean, v.multiplayer_allowed),
          coalesce((p ->> 'reactions_allowed')::boolean, v.reactions_allowed), now())
  on conflict (student_id) do update set packages_allowed = excluded.packages_allowed, packages_daily_limit = excluded.packages_daily_limit,
    multiplayer_allowed = excluded.multiplayer_allowed, reactions_allowed = excluded.reactions_allowed, updated_at = now();
  perform public.write_audit('child_controls', 'student', p_student::text, p);
  return to_jsonb(public.controls_of(p_student)) - 'student_id';
end $$;

create or replace function public.parent_child_economy(p_student uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_w record;
begin
  if not public.is_parent_of(p_student) then raise exception 'not your child' using errcode = '42501'; end if;
  select * into v_w from public.wallet_totals(p_student);
  return jsonb_build_object(
    'controls', to_jsonb(public.controls_of(p_student)) - 'student_id',
    'coins', v_w.coins, 'upgrade_points', public.upgrade_points_of(p_student),
    'spent_on_packages', coalesce((select -sum(coins) from public.reward_transactions where student_id = p_student and kind = 'package'), 0),
    'spent_in_shop', coalesce((select -sum(coins) from public.reward_transactions where student_id = p_student and kind = 'purchase'), 0),
    'packages', coalesce((select jsonb_agg(jsonb_build_object('at', o.created_at, 'name', t.name_ar, 'price', o.price, 'rewards', jsonb_array_length(o.rewards)) order by o.created_at desc)
                          from (select * from public.package_opens where student_id = p_student order by created_at desc limit 20) o
                          join public.package_types t on t.id = o.package_id), '[]'::jsonb),
    'items', (select count(*) from public.inventory where student_id = p_student));
end $$;

-- ---------------------------------------------------------------------------
-- Admin: package and shop configuration
-- ---------------------------------------------------------------------------
create or replace function public.admin_economy() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_admin();
  return jsonb_build_object(
    'packages', (select jsonb_agg(to_jsonb(t) || jsonb_build_object('opens', (select count(*) from public.package_opens o where o.package_id = t.id)) order by sort_order) from public.package_types t),
    'items', (select jsonb_agg(jsonb_build_object('id', id, 'category', category, 'name', name_ar, 'rarity', rarity, 'price', price,
                'in_shop', in_shop, 'in_packages', in_packages, 'active', active,
                'owners', (select count(*) from public.inventory i where i.item_id = s.id)) order by category, sort_order) from public.shop_items s),
    'totals', jsonb_build_object(
      'opens', (select count(*) from public.package_opens),
      'duplicates', (select count(*) from public.upgrade_point_ledger where kind = 'duplicate'),
      'upgrades', (select count(*) from public.upgrade_point_ledger where kind = 'upgrade')));
end $$;

create or replace function public.admin_set_package(p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_admin uuid := public.require_admin();
begin
  update public.package_types set
    price = coalesce((p ->> 'price')::int, price),
    active = coalesce((p ->> 'active')::boolean, active),
    pity_epic = coalesce((p ->> 'pity_epic')::int, pity_epic),
    pity_legendary = coalesce((p ->> 'pity_legendary')::int, pity_legendary)
  where id = p ->> 'id';
  if not found then raise exception 'unknown package' using errcode = 'P0002'; end if;
  perform public.write_audit('package_update', 'package', p ->> 'id', p);
end $$;

create or replace function public.admin_set_item(p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_admin uuid := public.require_admin();
begin
  update public.shop_items set
    price = coalesce((p ->> 'price')::int, price),
    in_shop = coalesce((p ->> 'in_shop')::boolean, in_shop) and category <> 'characters',
    in_packages = coalesce((p ->> 'in_packages')::boolean, in_packages),
    active = coalesce((p ->> 'active')::boolean, active)
  where id = p ->> 'id';
  if not found then raise exception 'unknown item' using errcode = 'P0002'; end if;
  perform public.write_audit('item_update', 'shop_item', p ->> 'id', p);
end $$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke execute on function public.secure_random(), public.roll_rarity(jsonb, text), public.upgrade_points_of(uuid),
  public.worn_keys(uuid), public.controls_of(uuid) from public, anon, authenticated;
revoke execute on function public.set_appearance(jsonb), public.open_package(text, uuid), public.get_packages(),
  public.upgrade_item(text, int), public.parent_set_controls(uuid, jsonb), public.parent_child_economy(uuid),
  public.admin_economy(), public.admin_set_package(jsonb), public.admin_set_item(jsonb),
  public.rarity_rank(text), public.duplicate_points(text, text), public.upgrade_cost(int) from public, anon;
grant execute on function public.set_appearance(jsonb), public.open_package(text, uuid), public.get_packages(),
  public.upgrade_item(text, int), public.parent_set_controls(uuid, jsonb), public.parent_child_economy(uuid),
  public.admin_economy(), public.admin_set_package(jsonb), public.admin_set_item(jsonb),
  public.purchase_item(text), public.set_character(text), public.get_my_game_state(), public.group_leaderboard(uuid, text),
  public.rarity_rank(text), public.duplicate_points(text, text), public.upgrade_cost(int) to authenticated;
