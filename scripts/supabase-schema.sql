-- Supabase schema for Car Journal
-- Run this in the Supabase SQL Editor after creating your project.

-- 1. Tables

create table vehicles (
  id text not null,
  user_id uuid references auth.users not null,
  label text not null,
  model text,
  config jsonb not null default '{}',
  events jsonb not null default '[]',
  parts jsonb not null default '[]',
  health_config jsonb not null default '{"intervals":[]}',
  tire_config jsonb not null default '{"profiles":[],"warningPct":0.8}',
  created_at timestamptz default now(),
  primary key (user_id, id)
);

create table user_preferences (
  user_id uuid primary key references auth.users,
  active_vehicle text
);

-- 2. Row Level Security

alter table vehicles enable row level security;
alter table user_preferences enable row level security;

create policy "vehicles_select" on vehicles
  for select using (auth.uid() = user_id);

create policy "vehicles_insert" on vehicles
  for insert with check (auth.uid() = user_id);

create policy "vehicles_update" on vehicles
  for update using (auth.uid() = user_id);

create policy "vehicles_delete" on vehicles
  for delete using (auth.uid() = user_id);

create policy "prefs_select" on user_preferences
  for select using (auth.uid() = user_id);

create policy "prefs_insert" on user_preferences
  for insert with check (auth.uid() = user_id);

create policy "prefs_update" on user_preferences
  for update using (auth.uid() = user_id);

-- 3. Receipts storage bucket

insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', true);

create policy "receipts_upload" on storage.objects
  for insert with check (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "receipts_select" on storage.objects
  for select using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "receipts_delete" on storage.objects
  for delete using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
