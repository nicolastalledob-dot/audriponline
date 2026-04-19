-- AudRip Online - Supabase Schema (BYOB)
-- Run this in your Supabase SQL Editor
-- Since each user owns their own Supabase project, RLS is not needed.

-- Tracks table
create table if not exists tracks (
    id uuid primary key default gen_random_uuid(),
    user_id text not null,
    title text not null default 'Untitled',
    artist text not null default 'Unknown Artist',
    album text not null default 'Unknown Album',
    cover_art text,
    duration real not null default 0,
    storage_path text not null,
    file_url text not null,
    file_name text not null,
    created_at timestamptz not null default now()
);

-- Playlists table
create table if not exists playlists (
    id uuid primary key default gen_random_uuid(),
    user_id text not null,
    name text not null,
    description text not null default '',
    cover_art text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- Playlist tracks junction table
create table if not exists playlist_tracks (
    playlist_id uuid not null references playlists(id) on delete cascade,
    track_id uuid not null references tracks(id) on delete cascade,
    position int not null default 0,
    primary key (playlist_id, track_id)
);

-- FX Presets table
create table if not exists fx_presets (
    id uuid primary key default gen_random_uuid(),
    user_id text not null,
    name text not null,
    bass real not null default 0,
    reverb real not null default 0,
    pitch real not null default 1,
    delay real not null default 0,
    stereo_width real not null default 0,
    distort real not null default 0
);

-- Storage: Create 'songs' bucket (public)
insert into storage.buckets (id, name, public)
values ('songs', 'songs', true)
on conflict (id) do nothing;

-- Storage policies: allow all operations on songs bucket
create policy "Allow all uploads"
    on storage.objects for insert
    with check (bucket_id = 'songs');

create policy "Allow all reads"
    on storage.objects for select
    using (bucket_id = 'songs');

create policy "Allow all deletes"
    on storage.objects for delete
    using (bucket_id = 'songs');
