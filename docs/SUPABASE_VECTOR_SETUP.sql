-- Enable pgvector extension
create extension if not exists vector;

-- Store parsed PDF chunks and embeddings
create table if not exists public.material_chunks (
  id text primary key,
  material_id text not null,
  subject text not null,
  chapter text,
  source_type text,
  page int,
  chunk_index int,
  content text not null,
  embedding vector(1536) not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_material_chunks_subject on public.material_chunks(subject);

-- Vector similarity search RPC
create or replace function public.match_material_chunks(
  query_embedding vector(1536),
  match_subject text,
  match_count int default 3
)
returns table (
  id text,
  material_id text,
  subject text,
  chapter text,
  source_type text,
  page int,
  chunk_index int,
  content text,
  similarity float
)
language sql
stable
as $$
  select
    c.id,
    c.material_id,
    c.subject,
    c.chapter,
    c.source_type,
    c.page,
    c.chunk_index,
    c.content,
    1 - (c.embedding <=> query_embedding) as similarity
  from public.material_chunks c
  where c.subject = match_subject
  order by c.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;
