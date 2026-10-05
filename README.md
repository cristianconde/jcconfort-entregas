# JC Confort Entregas

Tablero de tareas ligero para el equipo, al estilo de Trello: tableros con
columnas de estado, tareas asignables con prioridad y fecha límite, comentarios,
historial, notificaciones en la app para el equipo y avisos por SMS al cliente
cuando su pedido sale a reparto.

**Tecnología:** Next.js 16 (App Router) · Convex (base de datos, funciones,
tiempo real, crons) · Better Auth (email y contraseña, vía
`@convex-dev/better-auth`) · Tailwind CSS 4 + shadcn/ui (Base UI).

## Puesta en marcha

Requisitos: Node.js 22+ y pnpm.

```bash
pnpm install
npx convex dev          # conecta o crea el deployment de Convex y escribe .env.local
```

`npx convex dev` añade a `.env.local` `CONVEX_DEPLOYMENT`,
`NEXT_PUBLIC_CONVEX_URL` y `NEXT_PUBLIC_CONVEX_SITE_URL`. Después configura
las variables del backend (en el deployment de Convex, no en `.env.local`):

```bash
npx convex env set BETTER_AUTH_SECRET "$(openssl rand -base64 32)"
npx convex env set SITE_URL http://localhost:3000   # URL pública de la app
npx convex env set SMS_PROVIDER log                 # en desarrollo: SMS solo al log, sin Twilio
```

Para enviar SMS reales, ver [SMS con Twilio](#sms-con-twilio).

En otra terminal (deja `npx convex dev` corriendo):

```bash
pnpm dev
```

Abre <http://localhost:3000>. Mientras no exista ningún usuario, la app te
lleva a **`/setup`** para crear la cuenta del primer administrador. Después
`/setup` deja de estar disponible.

### Comandos

| Comando      | Qué hace                                             |
| ------------ | ---------------------------------------------------- |
| `pnpm dev`   | Servidor de desarrollo de Next.js                    |
| `pnpm test`  | Tests de las funciones de Convex (vitest + convex-test) |
| `pnpm lint`  | ESLint                                               |
| `pnpm build` | Build de producción                                  |

### Despliegue

1. `npx convex deploy` (con `BETTER_AUTH_SECRET` y `SITE_URL` configurados en
   el deployment de producción; `SITE_URL` = dominio público de la app, y las
   variables de Twilio si quieres SMS).
2. Despliega Next.js (p. ej. en Vercel) con `NEXT_PUBLIC_CONVEX_URL` y
   `NEXT_PUBLIC_CONVEX_SITE_URL` del deployment de producción.
3. Abre `/setup` y crea el primer administrador.

## Roles

- **Administrador:** gestiona usuarios (alta, edición, rol, desactivación,
  restablecer contraseña) en *Usuarios*, crea y configura tableros (miembros y
  estados y sus avisos), ajusta la aplicación en *Ajustes* y revisa el registro de *Envíos de SMS*. Ve todos los tableros.
- **Miembro:** ve los tableros de los que es miembro; crea, asigna, mueve y
  comenta tareas. Solo quien crea una tarea (o un administrador) puede
  eliminarla.

No hay registro público: las cuentas las crea un administrador. Los usuarios no
se borran, se desactivan (pierden el acceso al momento, incluso con la sesión
abierta). Siempre debe quedar al menos un administrador activo.

## Tareas y tableros

- Cada tablero tiene sus propios estados (por defecto *Pendiente*, *En
  progreso*, *Bloqueada*, *Hecha*); uno de ellos es el estado «hecho».
- Vista **Tablero** (Kanban, arrastrar y soltar con ratón, dedo o teclado) y
  vista **Lista**, con filtros (*Mis tareas*, persona, *Sin asignar*,
  prioridad, *Vencidas*, búsqueda) que quedan en la URL para compartirlos.
- Las fechas límite se interpretan en la zona horaria de la aplicación
  (*Ajustes*, por defecto `Europe/Madrid`). Una fecha sin hora vence a las
  23:59 de ese día.
- Cada tarea puede llevar un **cliente** (nombre y teléfono en formato
  internacional, `+34600111222`), que se indica al crearla o en su detalle.
- *Mis tareas* reúne las tareas abiertas asignadas a ti en todos tus tableros.

## Notificaciones y SMS

### Avisos al equipo (dentro de la app)

Las notificaciones **dentro de la app** están siempre activas (campana con
contador en la cabecera). Se notifica al asignar una tarea, al cambiar su
estado o comentarla (a quien la tiene asignada y a quien la creó), cuando se
acerca la fecha límite (antelación configurable) y cuando vence. Nadie recibe
avisos de sus propias acciones. **El equipo no recibe SMS**: el teléfono de un
usuario es solo un dato de contacto.

**Avisos por etapa:** en los ajustes del tablero, la campana de cada estado
define a quién avisar cuando una tarea llega a él (persona asignada, creador
y/o usuarios concretos). Por ejemplo, «Hecha» → avisar a la oficina para
facturar. Quien recibe el aviso de etapa no recibe además el de «cambió el
estado».

### Avisos al cliente (SMS)

El SMS es para el **cliente** de la tarea: avisarle de que su pedido va en
camino y, si se sabe, a qué hora llegará.

1. **Marcar el estado.** En los ajustes del tablero, en la campana del estado
   (p. ej. «En reparto»), un administrador activa **«Avisar al cliente»** y
   revisa el mensaje. El texto admite tres marcadores:

   | Marcador    | Se sustituye por                                             |
   | ----------- | ------------------------------------------------------------ |
   | `{cliente}` | nombre del cliente de la tarea (si no hay, no deja huecos)   |
   | `{llegada}` | « Llegada estimada: hoy entre las 10:00 y las 12:00.» (o «hacia las 10:00», «mañana…», «el 5 de octubre…»); vacío si no se indica |
   | `{empresa}` | nombre de la aplicación (*Ajustes*)                          |

   Texto por defecto: `Hola {cliente}, su pedido está en camino.{llegada}
   Gracias por su compra. {empresa}`. Un marcador desconocido se rechaza
   («Marcador desconocido: {nombre}»). Una regla puede avisar solo al cliente.
2. **Confirmar al mover.** Cuando alguien mueve una tarea a ese estado
   (arrastrando en el tablero o con los botones de estado), aparece **«Aviso al
   cliente»** antes de mover:
   - el interruptor «Avisar al cliente» (activado si la tarea tiene teléfono
     de cliente);
   - el teléfono del cliente (si se cambia, se guarda en la tarea);
   - la **llegada estimada**, opcional: día (hoy, mañana u otra fecha), hora
     «desde» y, si se quiere, «hasta»;
   - el mensaje, ya rellenado, que se puede retocar solo para esa tarea, con el
     contador de caracteres (máximo 306, dos SMS).

   «Mover y avisar» mueve la tarea y envía el SMS automáticamente; «Cancelar»
   deja la tarea donde estaba y no envía ni guarda nada.
3. **Llegada estimada.** Se guarda en la tarea y se ve en su tarjeta y en su
   detalle («Llegada: hoy 10:00–12:00») mientras está abierta. El historial
   registra «avisó al cliente (llegada hoy 10:00–12:00)».

No se envía SMS al crear una tarea directamente en ese estado, al moverla
dentro del mismo estado, ni cuando se mueven tareas porque se eliminó su estado.

En *Ajustes*, **«SMS a clientes»** apaga todos los SMS de todos los tableros
(la confirmación sigue guardando la llegada estimada) y muestra si el proveedor
está configurado. En **Administración → Envíos de SMS** están los últimos
mensajes a clientes (cliente, teléfono, tarea, mensaje, estado y motivo del
fallo) y «Reintentar» en los fallidos, que envía el mismo texto al teléfono
**actual** del cliente en la tarea.

> **Consentimiento y coste.** Cada SMS tiene coste y cualquiera que pueda mover
> una tarea puede enviar uno, siempre tras confirmarlo. Avisar de una entrega a
> quien dio su teléfono para ella es un mensaje de servicio habitual, pero el
> consentimiento del cliente es responsabilidad del negocio: no uses este canal
> para publicidad. Si un cliente responde STOP, el proveedor rechaza los
> siguientes envíos y aparecen como fallidos en el registro.

### SMS con Twilio

El proveedor de SMS se elige con variables de entorno del deployment de Convex
(nunca desde la app):

```bash
npx convex env set TWILIO_ACCOUNT_SID ACxxxxxxxx
npx convex env set TWILIO_AUTH_TOKEN xxxxxxxx
npx convex env set TWILIO_FROM +34...        # número de Twilio con SMS…
# …o un Messaging Service (recomendado donde se exige remitente registrado):
npx convex env set TWILIO_FROM MGxxxxxxxx
npx convex env set SMS_PROVIDER twilio       # valor por defecto; "log" = no enviar
```

- Sin estas variables el canal SMS queda desactivado: no se crean envíos, la
  confirmación «Aviso al cliente» lo indica y todo lo demás sigue funcionando.
- Twilio avisa del estado de cada SMS en
  `https://<deployment>.convex.site/sms/twilio/status` (se indica en cada
  envío; no hay que configurar nada en la consola). Las peticiones se validan
  con la firma de Twilio.
- **Cuentas de prueba (trial)** no sirven para esta app: solo permiten
  plantillas de SMS predefinidas por Twilio (error 572006, «Invalid template
  name») y solo a números verificados (error 21608). Hay que pasar la cuenta a
  de pago (*Upgrade*) para enviar los avisos a clientes. Los errores se ven en *Envíos de
  SMS*.
- Cada SMS tiene coste. Los mensajes se escriben sin tildes en á/í/ó/ú para que
  quepan en el alfabeto GSM-7 (hasta 2 segmentos).

Para añadir otro proveedor consulta
[`convex/notifications/README.md`](convex/notifications/README.md).

### Migración a «SMS solo para clientes»

Las versiones anteriores enviaban cada aviso por SMS también al equipo, con una
preferencia «Avisos por SMS» por usuario. En un deployment con datos de esa
versión:

1. Despliega este código con `users.smsEnabled` todavía declarado como opcional
   en `convex/schema.ts` (esquema ampliado). Desde ese momento el equipo deja de
   recibir SMS y los avisos a clientes ya funcionan.
2. `npx convex run migrations:customerSmsV1` — borra la preferencia de SMS de
   cada usuario (y la antigua de WhatsApp, si queda) y descarta los SMS al
   equipo que estuvieran pendientes. No toca los envíos a clientes. Es
   idempotente; termina con `customerSmsV1: done` en los logs.
3. Despliega el esquema actual (sin `users.smsEnabled`). A partir de aquí no se
   puede volver a la versión anterior sin ampliar antes el esquema.

Un deployment nuevo no necesita nada de esto. Los envíos antiguos al equipo (y
los de WhatsApp, «WhatsApp (antiguo)») siguen en el registro, sin «Reintentar».
Un deployment que aún esté en la versión de WhatsApp debe pasar antes por la
versión anterior de este repositorio (migraciones `smsV1` y `smsV1Cleanup`).

## Seguridad

Toda la autorización se hace en las funciones de Convex a partir de la sesión
(`convex/lib/access.ts`); el `proxy.ts` de Next.js solo redirige a `/login`
como comodidad.

### El registro público está desactivado

Las cuentas solo las crea un administrador (o la configuración inicial en
`/setup`). Para comprobar que el endpoint de registro está bloqueado:

```bash
curl -i -X POST http://localhost:3000/api/auth/sign-up/email \
  -H "content-type: application/json" -H "origin: http://localhost:3000" \
  -d '{"email":"nadie@example.com","password":"supersecret1","name":"Nadie"}'
# → HTTP 403 {"message":"El registro público no está permitido"}
```

## Estructura

```
app/(auth)/        login y configuración inicial
app/(app)/         páginas con sesión (tableros, tareas, perfil, administración)
components/        UI compartida (components/ui = shadcn/ui, components/tasks = tablero)
convex/            backend: schema, funciones, auth, crons, notificaciones
lib/               utilidades del cliente
openspec/          especificaciones y cambios (OpenSpec)
```
