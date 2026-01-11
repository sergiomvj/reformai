-- Limpar tabelas existentes para garantir a nova estrutura (CUIDADO: Isso apaga os dados atuais)
drop table if exists public.history_entries;
drop table if exists public.tasks;
drop table if exists public.projects;
drop table if exists public.categories;

-- Tabela de Categorias de Obra
create table public.categories (
  id uuid default gen_random_uuid() primary key,
  name text not null unique,
  description text,
  icon text
);

-- Inserir Categorias Iniciais
insert into public.categories (name) values 
('PINTURA'), ('ELÉTRICA'), ('HIDRÁULICA'), ('PISO'), ('JARDINAGEM'), ('MARCENARIA'), ('ESTRUTURAL');

-- Tabela de Obras (Projetos)
create table public.projects (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) not null,
  name text not null,
  description text,
  address text,
  status text default 'active',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Tabela de Tarefas da Obra
create table public.tasks (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references public.projects(id) on delete cascade not null,
  category_id uuid references public.categories(id),
  user_id uuid references auth.users(id) not null,
  title text not null,
  room text not null,
  description text,
  priority text not null,
  status text default 'pending',
  sub_tasks jsonb default '[]'::jsonb, 
  photos text[] default array[]::text[],
  video_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Tabela de Histórico de Atividades
create table public.history_entries (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) not null,
  project_id uuid references public.projects(id) on delete cascade,
  action text not null,
  type text not null, 
  details text,
  user_name text,
  created_timestamp bigint not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Políticas de Segurança (RLS)
alter table public.projects enable row level security;
alter table public.categories enable row level security;
alter table public.tasks enable row level security;
alter table public.history_entries enable row level security;

-- Políticas para Categorias (Todos autenticados podem ver)
create policy "Anyone can view categories" on public.categories for select using (true);

-- Políticas para Obras
create policy "Users can manage their own projects" 
on public.projects for all 
using (auth.uid() = user_id);

-- Políticas para Tarefas
create policy "Users can manage tasks of their own projects" 
on public.tasks for all 
using (auth.uid() = user_id);

-- Políticas para Histórico
create policy "Users can manage history of their own projects" 
on public.history_entries for all 
using (auth.uid() = user_id);
