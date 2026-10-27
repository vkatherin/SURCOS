-- =============================================================
--  VARIAS FOTOS DEL VESTUARIO (carrusel)
--  Cómo usarlo: Supabase → SQL Editor → New query → pega TODO
--  este archivo → Run. (Se corre después de 03-foto-vestuario.sql.)
--
--  - Agrega la lista de fotos a la configuración.
--  - Si ya habías subido una foto, la pasa a la lista sin perderla.
-- =============================================================

alter table public.config add column if not exists fotos jsonb not null default '[]'::jsonb;

-- Pasar la foto que ya existía (si la hay) a la lista nueva
update public.config
set fotos = jsonb_build_array(jsonb_build_object('url', foto_url, 'ruta', coalesce(foto_ruta, ''), 'texto', ''))
where id = 'general'
  and foto_url is not null
  and jsonb_array_length(fotos) = 0;

-- Máximo 8 fotos
alter table public.config drop constraint if exists config_fotos_max;
alter table public.config add constraint config_fotos_max
  check (jsonb_typeof(fotos) = 'array' and jsonb_array_length(fotos) <= 8);
