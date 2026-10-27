-- =============================================================
--  AHORRO DEL VESTUARIO · Base de datos para Supabase
--  Cómo usarlo: Supabase → SQL Editor → New query → pega TODO este
--  archivo → Run. Se puede volver a correr sin dañar los datos.
--
--  Seguridad (Row Level Security):
--  - Solo personas con sesión iniciada ven los datos.
--  - Cada integrante ve SOLO sus propios ahorros; la tesorería ve todo.
--  - La tesorería (correos en config.admins) administra todo.
--  - Cada integrante solo anota ahorros a SU nombre y quedan
--    'pendiente' hasta que la tesorería los confirme.
--  - La primera persona que entra crea la configuración y queda
--    como tesorería.
-- =============================================================

-- ---------- Tablas ----------
create table if not exists public.config (
  id      text primary key default 'general' check (id = 'general'),
  nombre  text   not null default 'Danzantes del Cerrillo',
  meta    bigint not null default 0 check (meta >= 0),
  fecha   date   not null default '2027-01-03',
  admins  text[] not null default '{}'
);

create table if not exists public.integrantes (
  id      uuid primary key default gen_random_uuid(),
  nombre  text   not null check (char_length(nombre) between 2 and 60),
  meta    bigint not null default 0 check (meta >= 0),
  uid     uuid   references auth.users (id) on delete set null,
  email   text   not null default '',
  creado  bigint not null default (extract(epoch from now()) * 1000)::bigint
);
create unique index if not exists integrantes_uid_unico on public.integrantes (uid) where uid is not null;

create table if not exists public.aportes (
  id                 uuid primary key default gen_random_uuid(),
  integrante_id      uuid   not null references public.integrantes (id) on delete cascade,
  monto              bigint not null check (monto > 0 and monto <= 10000000),
  fecha              date   not null default current_date,
  medio              text   not null default 'Efectivo',
  nota               text   not null default '' check (char_length(nota) <= 80),
  estado             text   not null default 'pendiente' check (estado in ('pendiente', 'recibido')),
  registrado_por     uuid,
  registrado_nombre  text   not null default '',
  recibido_por       text,
  recibido_en        bigint,
  creado             bigint not null default (extract(epoch from now()) * 1000)::bigint
);
create index if not exists aportes_integrante on public.aportes (integrante_id);

-- ---------- ¿Quién es tesorería? ----------
create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.config
    where id = 'general'
      and lower(coalesce(auth.jwt() ->> 'email', '')) = any (admins)
  );
$$;

-- Un integrante que "reclama" su nombre solo puede cambiar uid y email
create or replace function public.proteger_integrante()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.es_admin() then
    if new.nombre is distinct from old.nombre
       or new.meta is distinct from old.meta
       or new.creado is distinct from old.creado then
      raise exception 'Solo la tesorería puede cambiar nombre o meta' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists proteger_integrante on public.integrantes;
create trigger proteger_integrante before update on public.integrantes
  for each row execute function public.proteger_integrante();

-- ---------- Activar seguridad por filas ----------
alter table public.config      enable row level security;
alter table public.integrantes enable row level security;
alter table public.aportes     enable row level security;

-- Limpia políticas anteriores (para poder correr el archivo otra vez)
do $$
declare p record;
begin
  for p in select policyname, tablename from pg_policies
           where schemaname = 'public' and tablename in ('config', 'integrantes', 'aportes')
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

-- config
create policy "config: leer" on public.config
  for select to authenticated using (true);
create policy "config: crear la primera vez" on public.config
  for insert to authenticated
  with check (
    id = 'general'
    and admins = array[lower(auth.jwt() ->> 'email')]
    and not exists (select 1 from public.config)
  );
create policy "config: tesorería edita" on public.config
  for update to authenticated
  using (public.es_admin())
  with check (cardinality(admins) > 0);

-- integrantes
-- Tesorería ve todo; cada quien se ve a sí mismo y los nombres libres (para unirse)
create policy "integrantes: leer" on public.integrantes
  for select to authenticated
  using (public.es_admin() or uid = auth.uid() or uid is null);
create policy "integrantes: crear" on public.integrantes
  for insert to authenticated
  with check (public.es_admin() or (uid = auth.uid() and meta = 0));
create policy "integrantes: editar o reclamar" on public.integrantes
  for update to authenticated
  using (public.es_admin() or uid is null)
  with check (public.es_admin() or uid = auth.uid());
create policy "integrantes: tesorería borra" on public.integrantes
  for delete to authenticated using (public.es_admin());

-- aportes
-- Tesorería ve todos los ahorros; cada quien ve solo los suyos
create policy "aportes: leer" on public.aportes
  for select to authenticated
  using (
    public.es_admin()
    or exists (select 1 from public.integrantes i where i.id = aportes.integrante_id and i.uid = auth.uid())
  );
create policy "aportes: anotar" on public.aportes
  for insert to authenticated
  with check (
    public.es_admin()
    or (
      estado = 'pendiente'
      and registrado_por = auth.uid()
      and exists (select 1 from public.integrantes i where i.id = integrante_id and i.uid = auth.uid())
    )
  );
create policy "aportes: tesorería confirma" on public.aportes
  for update to authenticated using (public.es_admin()) with check (public.es_admin());
create policy "aportes: borrar" on public.aportes
  for delete to authenticated
  using (public.es_admin() or (registrado_por = auth.uid() and estado = 'pendiente'));

-- Permisos básicos (los visitantes sin sesión no ven nada)
revoke all on public.config, public.integrantes, public.aportes from anon;
grant select, insert, update, delete on public.config, public.integrantes, public.aportes to authenticated;

-- ---------- Tiempo real (todos ven los cambios al instante) ----------
do $$
begin
  begin alter publication supabase_realtime add table public.config;      exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.integrantes; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.aportes;     exception when duplicate_object then null; end;
end $$;
