
alter table public.consultas
  add column if not exists actualizado_por uuid references public.usuarios(id);

comment on column public.consultas.actualizado_por is
  'Usuario (medico/administrador) que confirmó o descartó el diagnóstico. NULL en consultas creadas antes de este cambio o aún pendientes.';
