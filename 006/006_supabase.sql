-- =============================================================================
-- 006 · CONJUNTOS (propiedad horizontal) — base de datos completa
-- Pegar COMPLETO en Supabase > SQL Editor > Run. Es re-ejecutable.
--
-- Seguridad (mismo patrón que el 070):
--   * Todas las tablas tienen RLS ACTIVADO y SIN políticas: anon y authenticated
--     no pueden leer ni escribir nada directamente.
--   * Solo la Edge Function "conjuntos-service" (con service_role) entra.
--   * Las funciones de dinero son atómicas y solo las puede ejecutar service_role.
-- =============================================================================
create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------- conjuntos
create table if not exists conjuntos_conjuntos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  ciudad text,
  direccion text,
  nit text,
  telefono text,
  whatsapp_comprobantes text,
  comprobante_modo text not null default 'whatsapp' check (comprobante_modo in ('whatsapp','referencia')),
  pago_nequi text,
  pago_daviplata text,
  pago_llave text,
  pago_banco text,
  pago_titular text,
  pago_notas text,
  pago_qr text,
  dia_vence int not null default 10 check (dia_vence between 1 and 28),
  mora_pct numeric(5,2) not null default 0 check (mora_pct >= 0 and mora_pct <= 10),
  plan_mensual numeric(12,0) not null default 0,
  vence date,
  estado text not null default 'activo' check (estado in ('activo','suspendido')),
  creado_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------- casas / unidades
create table if not exists conjuntos_casas (
  id uuid primary key default gen_random_uuid(),
  conjunto_id uuid not null references conjuntos_conjuntos(id) on delete cascade,
  codigo text not null,
  propietario text,
  telefono text,
  correo text,
  coeficiente numeric(9,5) not null default 0,
  notas text,
  activa boolean not null default true,
  saldo_favor numeric(14,2) not null default 0,
  creado_at timestamptz not null default now(),
  unique (conjunto_id, codigo)
);
create index if not exists conjuntos_casas_conj_idx on conjuntos_casas (conjunto_id);

-- ----------------------------------------------------------------------------- usuarios (admin, casa, guardia)
create table if not exists conjuntos_usuarios (
  id uuid primary key default gen_random_uuid(),
  conjunto_id uuid not null references conjuntos_conjuntos(id) on delete cascade,
  casa_id uuid references conjuntos_casas(id) on delete cascade,
  rol text not null check (rol in ('admin','casa','guardia')),
  usuario text not null,
  nombre text,
  clave_hash text not null,
  estado text not null default 'activo' check (estado in ('activo','bloqueado')),
  ultimo_acceso timestamptz,
  creado_at timestamptz not null default now()
);
create unique index if not exists conjuntos_usuarios_usuario_uk on conjuntos_usuarios (lower(usuario));
create index if not exists conjuntos_usuarios_conj_idx on conjuntos_usuarios (conjunto_id);

-- ----------------------------------------------------------------------------- sesiones propias (token)
create table if not exists conjuntos_sesiones (
  token_hash text primary key,
  usuario_id uuid references conjuntos_usuarios(id) on delete cascade,
  rol text not null,
  conjunto_id uuid,
  expira timestamptz not null,
  creado_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------- servicios / conceptos de cobro
-- reparto: igual (total ÷ casas) | fijo (valor por casa) | coeficiente (total × coef)
--          seleccion (solo algunas casas) | manual (valor distinto por casa)
-- detalle (jsonb): seleccion -> {"casas":[ids], "cada":bool} | manual -> {"montos":{id:valor}}
create table if not exists conjuntos_conceptos (
  id uuid primary key default gen_random_uuid(),
  conjunto_id uuid not null references conjuntos_conjuntos(id) on delete cascade,
  nombre text not null,
  reparto text not null default 'fijo' check (reparto in ('igual','fijo','coeficiente','seleccion','manual')),
  monto numeric(14,2) not null default 0,
  detalle jsonb not null default '{}'::jsonb,
  recurrente boolean not null default true,
  activo boolean not null default true,
  creado_at timestamptz not null default now()
);
create index if not exists conjuntos_conceptos_conj_idx on conjuntos_conceptos (conjunto_id);

-- ----------------------------------------------------------------------------- cobros (lo que debe cada casa)
create table if not exists conjuntos_cobros (
  id uuid primary key default gen_random_uuid(),
  conjunto_id uuid not null references conjuntos_conjuntos(id) on delete cascade,
  casa_id uuid not null references conjuntos_casas(id) on delete cascade,
  concepto_id uuid references conjuntos_conceptos(id) on delete set null,
  periodo text not null,
  descripcion text not null,
  monto numeric(14,2) not null check (monto >= 0),
  pagado numeric(14,2) not null default 0 check (pagado >= 0),
  vence date,
  creado_at timestamptz not null default now()
);
create index if not exists conjuntos_cobros_conj_per_idx on conjuntos_cobros (conjunto_id, periodo);
create index if not exists conjuntos_cobros_casa_idx on conjuntos_cobros (casa_id);
create index if not exists conjuntos_cobros_concepto_idx on conjuntos_cobros (concepto_id, periodo);

-- ----------------------------------------------------------------------------- pagos (reportados por la casa o registrados por admin)
create table if not exists conjuntos_pagos (
  id uuid primary key default gen_random_uuid(),
  conjunto_id uuid not null references conjuntos_conjuntos(id) on delete cascade,
  casa_id uuid not null references conjuntos_casas(id) on delete cascade,
  monto numeric(14,2) not null check (monto > 0),
  metodo text not null default 'transferencia',
  referencia text,
  nota text,
  estado text not null default 'por_validar' check (estado in ('por_validar','aprobado','rechazado')),
  reportado_por text not null default 'casa',
  motivo_rechazo text,
  creado_at timestamptz not null default now(),
  validado_at timestamptz
);
create index if not exists conjuntos_pagos_conj_idx on conjuntos_pagos (conjunto_id, estado, creado_at desc);
create index if not exists conjuntos_pagos_casa_idx on conjuntos_pagos (casa_id);

-- ----------------------------------------------------------------------------- caja del conjunto (otros ingresos y egresos)
create table if not exists conjuntos_movimientos (
  id uuid primary key default gen_random_uuid(),
  conjunto_id uuid not null references conjuntos_conjuntos(id) on delete cascade,
  tipo text not null check (tipo in ('ingreso','egreso')),
  categoria text not null default 'General',
  concepto text not null,
  monto numeric(14,2) not null check (monto > 0),
  fecha date not null default ((now() at time zone 'America/Bogota')::date),
  proveedor text,
  nota text,
  creado_at timestamptz not null default now()
);
create index if not exists conjuntos_movs_conj_idx on conjuntos_movimientos (conjunto_id, fecha desc);

-- ----------------------------------------------------------------------------- portería: visitas
-- estado: por_autorizar (lo anunció la portería) | esperado | adentro | salio | rechazado | cancelado
create table if not exists conjuntos_visitas (
  id uuid primary key default gen_random_uuid(),
  conjunto_id uuid not null references conjuntos_conjuntos(id) on delete cascade,
  casa_id uuid not null references conjuntos_casas(id) on delete cascade,
  nombre text not null,
  documento text,
  placa text,
  tipo text not null default 'visita',
  fecha date not null,
  hasta date,
  nota text,
  estado text not null default 'esperado' check (estado in ('por_autorizar','esperado','adentro','salio','rechazado','cancelado')),
  creada_por text not null default 'casa',
  ingreso_at timestamptz,
  salida_at timestamptz,
  respondido_at timestamptz,
  creado_at timestamptz not null default now()
);
create index if not exists conjuntos_visitas_conj_idx on conjuntos_visitas (conjunto_id, estado, fecha);
create index if not exists conjuntos_visitas_casa_idx on conjuntos_visitas (casa_id, creado_at desc);

-- ----------------------------------------------------------------------------- portería: paquetes
create table if not exists conjuntos_paquetes (
  id uuid primary key default gen_random_uuid(),
  conjunto_id uuid not null references conjuntos_conjuntos(id) on delete cascade,
  casa_id uuid not null references conjuntos_casas(id) on delete cascade,
  descripcion text not null,
  empresa text,
  recibido_at timestamptz not null default now(),
  entregado_at timestamptz,
  entregado_a text
);
create index if not exists conjuntos_paquetes_conj_idx on conjuntos_paquetes (conjunto_id, entregado_at);

-- ----------------------------------------------------------------------------- comunicados
create table if not exists conjuntos_comunicados (
  id uuid primary key default gen_random_uuid(),
  conjunto_id uuid not null references conjuntos_conjuntos(id) on delete cascade,
  titulo text not null,
  cuerpo text not null,
  importante boolean not null default false,
  creado_at timestamptz not null default now()
);
create index if not exists conjuntos_comunicados_conj_idx on conjuntos_comunicados (conjunto_id, creado_at desc);

-- ----------------------------------------------------------------------------- plataforma (tus datos de cobro, una sola fila)
create table if not exists conjuntos_plataforma (
  id int primary key default 1 check (id = 1),
  titular text,
  nequi text,
  daviplata text,
  llave text,
  banco text,
  whatsapp text,
  horario text,
  notas text,
  qr text,
  actualizado_at timestamptz not null default now()
);
insert into conjuntos_plataforma (id) values (1) on conflict (id) do nothing;

-- ----------------------------------------------------------------------------- pagos de suscripción (admin -> creador)
create table if not exists conjuntos_suscripcion_pagos (
  id uuid primary key default gen_random_uuid(),
  conjunto_id uuid not null references conjuntos_conjuntos(id) on delete cascade,
  meses int not null check (meses between 1 and 36),
  monto numeric(12,0) not null default 0,
  referencia text,
  nota text,
  estado text not null default 'por_validar' check (estado in ('por_validar','aprobado','rechazado')),
  respuesta text,
  creado_at timestamptz not null default now(),
  revisado_at timestamptz
);
create index if not exists conjuntos_sus_pagos_conj_idx on conjuntos_suscripcion_pagos (conjunto_id, creado_at desc);
create index if not exists conjuntos_sus_pagos_estado_idx on conjuntos_suscripcion_pagos (estado);

-- ----------------------------------------------------------------------------- RLS sin políticas
do $$
declare t text;
begin
  foreach t in array array['conjuntos_conjuntos','conjuntos_casas','conjuntos_usuarios','conjuntos_sesiones',
    'conjuntos_conceptos','conjuntos_cobros','conjuntos_pagos','conjuntos_movimientos','conjuntos_visitas',
    'conjuntos_paquetes','conjuntos_comunicados','conjuntos_plataforma','conjuntos_suscripcion_pagos']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on %I from anon, authenticated', t);
  end loop;
end $$;

-- =============================================================================
-- FUNCIONES ATÓMICAS (solo service_role)
-- =============================================================================

-- Usa el saldo a favor de una casa para pagar sus cobros pendientes (del más viejo al más nuevo).
create or replace function conjuntos_aplicar_saldo(p_casa uuid)
returns numeric language plpgsql security definer set search_path = public as $$
declare
  v_saldo numeric;
  r record;
  v_abono numeric;
begin
  select saldo_favor into v_saldo from conjuntos_casas where id = p_casa for update;
  if v_saldo is null or v_saldo <= 0 then return coalesce(v_saldo, 0); end if;
  for r in
    select id, monto - pagado as falta from conjuntos_cobros
     where casa_id = p_casa and pagado < monto
     order by vence nulls last, creado_at
     for update
  loop
    exit when v_saldo <= 0;
    v_abono := least(v_saldo, r.falta);
    update conjuntos_cobros set pagado = pagado + v_abono where id = r.id;
    v_saldo := v_saldo - v_abono;
  end loop;
  update conjuntos_casas set saldo_favor = v_saldo where id = p_casa;
  return v_saldo;
end $$;

-- Aprueba un pago: suma al saldo de la casa y lo aplica a sus deudas.
create or replace function conjuntos_aprobar_pago(p_pago uuid)
returns numeric language plpgsql security definer set search_path = public as $$
declare v_pago record;
begin
  select * into v_pago from conjuntos_pagos where id = p_pago for update;
  if v_pago is null then raise exception 'Pago no encontrado'; end if;
  if v_pago.estado <> 'por_validar' then raise exception 'Este pago ya fue revisado'; end if;
  update conjuntos_pagos set estado = 'aprobado', validado_at = now() where id = p_pago;
  update conjuntos_casas set saldo_favor = saldo_favor + v_pago.monto where id = v_pago.casa_id;
  return conjuntos_aplicar_saldo(v_pago.casa_id);
end $$;

-- Deuda por casa (total, vencida y del periodo).
create or replace function conjuntos_saldos(p_conjunto uuid, p_periodo text)
returns table (casa_id uuid, deuda numeric, vencido numeric, cobrado_mes numeric, pagado_mes numeric)
language sql stable security definer set search_path = public as $$
  select c.id,
    coalesce(sum(cb.monto - cb.pagado), 0),
    coalesce(sum(cb.monto - cb.pagado) filter (where cb.vence < (now() at time zone 'America/Bogota')::date), 0),
    coalesce(sum(cb.monto) filter (where cb.periodo = p_periodo), 0),
    coalesce(sum(cb.pagado) filter (where cb.periodo = p_periodo), 0)
  from conjuntos_casas c
  left join conjuntos_cobros cb on cb.casa_id = c.id
  where c.conjunto_id = p_conjunto
  group by c.id
$$;

-- Métricas del tablero del administrador (todo agregado en Postgres: rápido y liviano).
create or replace function conjuntos_metricas(p_conjunto uuid, p_periodo text)
returns jsonb language sql stable security definer set search_path = public as $$
  with hoy as (select (now() at time zone 'America/Bogota')::date as d),
  casas as (
    select s.* from conjuntos_saldos(p_conjunto, p_periodo) s
    join conjuntos_casas c on c.id = s.casa_id and c.activa
  )
  select jsonb_build_object(
    'facturado_mes', (select coalesce(sum(monto),0) from conjuntos_cobros where conjunto_id = p_conjunto and periodo = p_periodo),
    'recaudado_mes', (select coalesce(sum(pagado),0) from conjuntos_cobros where conjunto_id = p_conjunto and periodo = p_periodo),
    'cartera', (select coalesce(sum(monto - pagado),0) from conjuntos_cobros where conjunto_id = p_conjunto),
    'cartera_vencida', (select coalesce(sum(monto - pagado),0) from conjuntos_cobros, hoy where conjunto_id = p_conjunto and vence < hoy.d),
    'casas_total', (select count(*) from casas),
    'casas_pagadas', (select count(*) from casas where cobrado_mes > 0 and pagado_mes >= cobrado_mes),
    'casas_parciales', (select count(*) from casas where pagado_mes > 0 and pagado_mes < cobrado_mes),
    'casas_pendientes', (select count(*) from casas where cobrado_mes > 0 and pagado_mes = 0),
    'casas_morosas', (select count(*) from casas where vencido > 0),
    'entradas_mes', (select coalesce(sum(monto),0) from conjuntos_pagos where conjunto_id = p_conjunto and estado = 'aprobado'
                      and to_char(validado_at at time zone 'America/Bogota','YYYY-MM') = p_periodo),
    'otros_ingresos_mes', (select coalesce(sum(monto),0) from conjuntos_movimientos where conjunto_id = p_conjunto and tipo = 'ingreso' and to_char(fecha,'YYYY-MM') = p_periodo),
    'egresos_mes', (select coalesce(sum(monto),0) from conjuntos_movimientos where conjunto_id = p_conjunto and tipo = 'egreso' and to_char(fecha,'YYYY-MM') = p_periodo),
    'pagos_por_validar', (select count(*) from conjuntos_pagos where conjunto_id = p_conjunto and estado = 'por_validar'),
    'visitas_hoy', (select count(*) from conjuntos_visitas, hoy where conjunto_id = p_conjunto and fecha = hoy.d),
    'paquetes_pendientes', (select count(*) from conjuntos_paquetes where conjunto_id = p_conjunto and entregado_at is null),
    'serie_recaudo', (select coalesce(jsonb_agg(x order by x.periodo), '[]'::jsonb) from (
        select periodo, sum(monto) as facturado, sum(pagado) as recaudado from conjuntos_cobros
         where conjunto_id = p_conjunto and periodo <= p_periodo
         group by periodo order by periodo desc limit 6) x),
    'serie_caja', (select coalesce(jsonb_agg(x order by x.mes), '[]'::jsonb) from (
        select m.mes,
          (select coalesce(sum(monto),0) from conjuntos_pagos where conjunto_id = p_conjunto and estado = 'aprobado'
             and to_char(validado_at at time zone 'America/Bogota','YYYY-MM') = m.mes)
          + (select coalesce(sum(monto),0) from conjuntos_movimientos where conjunto_id = p_conjunto and tipo = 'ingreso' and to_char(fecha,'YYYY-MM') = m.mes) as ingresos,
          (select coalesce(sum(monto),0) from conjuntos_movimientos where conjunto_id = p_conjunto and tipo = 'egreso' and to_char(fecha,'YYYY-MM') = m.mes) as egresos
        from (select to_char((to_date(p_periodo || '-01','YYYY-MM-DD') - (g || ' month')::interval),'YYYY-MM') as mes
                from generate_series(0,5) g) m) x),
    'por_concepto', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select descripcion as nombre, sum(monto) as facturado, sum(pagado) as recaudado from conjuntos_cobros
         where conjunto_id = p_conjunto and periodo = p_periodo
         group by descripcion order by sum(monto) desc limit 10) x),
    'egresos_categoria', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select categoria as nombre, sum(monto) as total from conjuntos_movimientos
         where conjunto_id = p_conjunto and tipo = 'egreso' and to_char(fecha,'YYYY-MM') = p_periodo
         group by categoria order by sum(monto) desc limit 8) x)
  )
$$;

do $$
declare f text;
begin
  foreach f in array array['conjuntos_aplicar_saldo(uuid)','conjuntos_aprobar_pago(uuid)',
    'conjuntos_saldos(uuid, text)','conjuntos_metricas(uuid, text)']
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- Si ya tenías instalado el módulo, esta línea añade la imagen/QR de pago del conjunto sin borrar nada:
alter table conjuntos_conjuntos add column if not exists pago_qr text;

-- =============================================================================
-- PASES CON QR (10/2026). Se puede correr solo este bloque si ya tenías el módulo.
-- Invitados: se reutiliza conjuntos_visitas (mismo listado de portería) con 5 columnas extra.
-- Residentes: tabla pequeña; su QR cambia cada 30 s y lo firma el servidor (no se guarda nada por QR).
-- =============================================================================
alter table conjuntos_visitas add column if not exists pase_codigo text;
alter table conjuntos_visitas add column if not exists valido_desde timestamptz;
alter table conjuntos_visitas add column if not exists valido_hasta timestamptz;
alter table conjuntos_visitas add column if not exists telefono text;
alter table conjuntos_visitas add column if not exists entradas int not null default 0;
create unique index if not exists conjuntos_visitas_pase_idx on conjuntos_visitas (pase_codigo) where pase_codigo is not null;

create table if not exists conjuntos_residentes (
  id uuid primary key default gen_random_uuid(),
  conjunto_id uuid not null references conjuntos_conjuntos(id) on delete cascade,
  casa_id uuid not null references conjuntos_casas(id) on delete cascade,
  nombre text not null,
  documento text,
  placa text,
  adentro boolean not null default true,
  mov_at timestamptz,
  activo boolean not null default true,
  creado_at timestamptz not null default now()
);
create index if not exists conjuntos_residentes_casa_idx on conjuntos_residentes (casa_id, activo);
alter table conjuntos_residentes enable row level security;
revoke all on conjuntos_residentes from anon, authenticated;

-- Limpieza de sesiones vencidas (se puede correr cuando quieras)
-- delete from conjuntos_sesiones where expira < now();
