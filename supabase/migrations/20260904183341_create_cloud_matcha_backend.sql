create table if not exists public.app_users (
  google_sub text primary key,
  email text not null,
  display_name text not null,
  picture_url text,
  settings jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_users_settings_object check (jsonb_typeof(settings) = 'object')
);

create table if not exists public.matcha_entries (
  id uuid primary key default gen_random_uuid(),
  owner_sub text not null references public.app_users(google_sub) on delete cascade,
  owner_name text not null,
  owner_picture text,
  place_name text not null,
  location_label text,
  latitude double precision,
  longitude double precision,
  location_source text,
  rating smallint not null,
  vibe smallint not null,
  price_cents integer,
  drink_size text,
  milk_type text,
  sweetness text,
  visit_date date,
  wait_minutes smallint,
  add_ons text[] not null default '{}'::text[],
  notes text not null default '',
  would_order_again boolean not null default false,
  share_community boolean not null default false,
  photo_path text,
  photo_mime_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint matcha_entries_place_name_length check (char_length(place_name) between 1 and 160),
  constraint matcha_entries_location_label_length check (location_label is null or char_length(location_label) <= 400),
  constraint matcha_entries_latitude_range check (latitude is null or latitude between -90 and 90),
  constraint matcha_entries_longitude_range check (longitude is null or longitude between -180 and 180),
  constraint matcha_entries_location_source_length check (location_source is null or char_length(location_source) <= 24),
  constraint matcha_entries_rating_range check (rating between 1 and 5),
  constraint matcha_entries_vibe_range check (vibe between 1 and 5),
  constraint matcha_entries_price_range check (price_cents is null or price_cents between 0 and 1000000),
  constraint matcha_entries_drink_size_length check (drink_size is null or char_length(drink_size) <= 40),
  constraint matcha_entries_milk_type_length check (milk_type is null or char_length(milk_type) <= 60),
  constraint matcha_entries_sweetness_length check (sweetness is null or char_length(sweetness) <= 40),
  constraint matcha_entries_wait_range check (wait_minutes is null or wait_minutes between 0 and 600),
  constraint matcha_entries_notes_length check (char_length(notes) <= 500),
  constraint matcha_entries_add_ons_limit check (cardinality(add_ons) <= 12)
);

create table if not exists public.matcha_favorites (
  user_sub text not null references public.app_users(google_sub) on delete cascade,
  entry_id uuid not null references public.matcha_entries(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_sub, entry_id)
);

create index if not exists matcha_entries_owner_date_idx
  on public.matcha_entries (owner_sub, visit_date desc nulls last, created_at desc);
create index if not exists matcha_entries_community_date_idx
  on public.matcha_entries (share_community, created_at desc);
create index if not exists matcha_entries_coordinates_idx
  on public.matcha_entries (latitude, longitude)
  where latitude is not null and longitude is not null;
create index if not exists matcha_favorites_user_idx
  on public.matcha_favorites (user_sub, created_at desc);

create or replace function public.set_matcha_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists app_users_set_updated_at on public.app_users;
create trigger app_users_set_updated_at
before update on public.app_users
for each row execute function public.set_matcha_updated_at();

drop trigger if exists matcha_entries_set_updated_at on public.matcha_entries;
create trigger matcha_entries_set_updated_at
before update on public.matcha_entries
for each row execute function public.set_matcha_updated_at();

alter table public.app_users enable row level security;
alter table public.matcha_entries enable row level security;
alter table public.matcha_favorites enable row level security;

revoke all on table public.app_users from anon, authenticated;
revoke all on table public.matcha_entries from anon, authenticated;
revoke all on table public.matcha_favorites from anon, authenticated;
grant all on table public.app_users to service_role;
grant all on table public.matcha_entries to service_role;
grant all on table public.matcha_favorites to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'matcha-photos',
  'matcha-photos',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

comment on table public.app_users is 'Google-authenticated Strawberry Matcha Tracker accounts and synced display preferences.';
comment on table public.matcha_entries is 'Private and community-published strawberry matcha logs.';
comment on table public.matcha_favorites is 'Per-user favorites for visible strawberry matcha entries.';
