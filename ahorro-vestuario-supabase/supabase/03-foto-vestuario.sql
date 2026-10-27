-- =============================================================
--  FOTO DEL VESTUARIO
--  Cómo usarlo: Supabase → SQL Editor → New query → pega TODO
--  este archivo → Run. (Se corre después de esquema.sql.)
--
--  - Agrega a la configuración la foto y su descripción.
--  - Crea el espacio "vestuario" en Storage para guardar la foto.
--  - Solo la tesorería puede subir, cambiar o borrar la foto.
--  - La foto se ve con un enlace público (para que cargue rápido
--    en cualquier celular); no contiene datos de nadie.
-- =============================================================

-- Columnas nuevas en la configuración
alter table public.config add column if not exists foto_url   text;
alter table public.config add column if not exists foto_ruta  text;
alter table public.config add column if not exists foto_texto text not null default '';

-- Espacio de almacenamiento para la foto (máximo 5 MB, solo imágenes)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vestuario', 'vestuario', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

-- Reglas: solo la tesorería administra los archivos del vestuario
drop policy if exists "vestuario: ver"              on storage.objects;
drop policy if exists "vestuario: tesorería sube"   on storage.objects;
drop policy if exists "vestuario: tesorería cambia" on storage.objects;
drop policy if exists "vestuario: tesorería borra"  on storage.objects;

create policy "vestuario: ver" on storage.objects
  for select to authenticated
  using (bucket_id = 'vestuario');

create policy "vestuario: tesorería sube" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'vestuario' and public.es_admin());

create policy "vestuario: tesorería cambia" on storage.objects
  for update to authenticated
  using (bucket_id = 'vestuario' and public.es_admin())
  with check (bucket_id = 'vestuario' and public.es_admin());

create policy "vestuario: tesorería borra" on storage.objects
  for delete to authenticated
  using (bucket_id = 'vestuario' and public.es_admin());
