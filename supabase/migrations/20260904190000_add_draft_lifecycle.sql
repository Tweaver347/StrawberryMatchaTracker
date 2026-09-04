alter table public.matcha_entries
  add column if not exists status text not null default 'complete',
  add column if not exists draft_step smallint not null default 1,
  add column if not exists completed_at timestamptz;

alter table public.matcha_entries
  alter column place_name drop not null,
  alter column rating drop not null,
  alter column vibe drop not null,
  alter column would_order_again drop not null,
  alter column would_order_again drop default;

update public.matcha_entries
set completed_at = coalesce(completed_at, created_at)
where status = 'complete';

alter table public.matcha_entries
  drop constraint if exists matcha_entries_status_check,
  drop constraint if exists matcha_entries_draft_step_check,
  drop constraint if exists matcha_entries_complete_minimum_check,
  drop constraint if exists matcha_entries_drafts_private_check;

alter table public.matcha_entries
  add constraint matcha_entries_status_check
    check (status in ('draft', 'complete')),
  add constraint matcha_entries_draft_step_check
    check (draft_step between 1 and 3),
  add constraint matcha_entries_complete_minimum_check
    check (
      status = 'draft'
      or (
        status = 'complete'
        and photo_path is not null
        and place_name is not null
        and char_length(btrim(place_name)) between 1 and 160
        and rating between 1 and 5
      )
    ),
  add constraint matcha_entries_drafts_private_check
    check (status = 'complete' or share_community = false);

create index if not exists matcha_entries_owner_status_updated_idx
  on public.matcha_entries (owner_sub, status, updated_at desc);
