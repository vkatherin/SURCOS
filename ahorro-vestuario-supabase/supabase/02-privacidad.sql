-- =============================================================
--  PRIVACIDAD · cada integrante ve solo lo suyo
--  Cómo usarlo: Supabase → SQL Editor → New query → pega TODO
--  este archivo → Run. (Se corre después de esquema.sql.)
--
--  Después de esto:
--  - La TESORERÍA ve a todos los integrantes y todos los ahorros.
--  - Cada INTEGRANTE ve solo su propio registro y sus propios
--    ahorros. Además ve los nombres que todavía no tienen cuenta,
--    para poder elegir el suyo la primera vez.
-- =============================================================

-- Integrantes: tesorería ve todo; cada quien se ve a sí mismo
-- y los nombres libres (sin cuenta) para poder unirse.
drop policy if exists "integrantes: leer" on public.integrantes;
create policy "integrantes: leer" on public.integrantes
  for select to authenticated
  using (public.es_admin() or uid = auth.uid() or uid is null);

-- Ahorros: tesorería ve todo; cada quien ve solo los suyos.
drop policy if exists "aportes: leer" on public.aportes;
create policy "aportes: leer" on public.aportes
  for select to authenticated
  using (
    public.es_admin()
    or exists (
      select 1 from public.integrantes i
      where i.id = aportes.integrante_id and i.uid = auth.uid()
    )
  );
