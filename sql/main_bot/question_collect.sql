-- SQL Table schema for Question Collect system
create table public.question_collect (
  id bigint generated always as identity not null,
  category text not null,
  question_text text not null,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint question_collect_pkey primary key (id)
) TABLESPACE pg_default;

alter table public.question_collect enable row level security;

create policy "Allow public read on question_collect"
  on public.question_collect for select
  using (true);
