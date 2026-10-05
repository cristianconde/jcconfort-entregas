# Notificaciones

Hay dos destinatarios, con caminos distintos:

- **El equipo** recibe notificaciones **dentro de la app**, siempre activas, por
  cada evento (asignación, cambio de estado, llegada a una etapa con regla,
  comentario, recordatorio, tarea vencida). Nunca recibe SMS.
- **El cliente** de una tarea recibe un **SMS** cuando alguien confirma el
  «Aviso al cliente» al mover la tarea a un estado marcado «Avisar al cliente».
  Cada SMS es un registro en `deliveries` que se envía solo.

## Avisos al equipo

1. Una mutación llama a `notify(ctx, { recipients, kind, task, actorId, text })`
   (`notify.ts`) dentro de la misma transacción que el cambio.
   - Los cambios de estado y las tareas creadas pasan por `notifyStatusEntry`
     (`stage.ts`): los destinatarios de la regla del estado (`statusRules`)
     reciben `stage_reached`; en un movimiento, asignado y creador que no estén
     en la regla reciben `status_changed`.
2. `notify` descarta al autor de la acción y a usuarios inactivos e inserta en
   `notifications`. No crea envíos externos.

Los recordatorios los lanza el cron `deadline reminders` (`crons.ts`, cada 15
minutos) sobre `reminders.run`, que evita duplicados con `reminderSentFor` /
`overdueSentFor` en la tarea.

## Avisos al cliente

1. **Regla.** `boards.setStatusRule` guarda en `statusRules` `notifyCustomer` y
   `customerTemplate` (validada con `validateTemplate`: 1–306 caracteres y solo
   los marcadores `{cliente}`, `{llegada}`, `{empresa}`; sin texto se usa
   `DEFAULT_CUSTOMER_TEMPLATE`). `boards.get` expone por estado
   `notifiesCustomer` y `customerTemplate`, y `customerSmsAvailable`.
2. **Confirmación.** El cliente web (`components/tasks/customer-notice-dialog.tsx`)
   abre «Aviso al cliente» cuando el estado de destino tiene `notifiesCustomer`
   y solo entonces llama a `tasks.move` con `customerNotice`:

   ```ts
   { send: boolean, phone?: string, message?: string,
     eta?: { date: "YYYY-MM-DD", from: "HH:mm", to?: "HH:mm" } }
   ```

3. **`tasks.move`** aplica el movimiento y, en la misma transacción, llama a
   `applyCustomerNotice` (`customer.ts`), que:
   - valida y guarda (o borra) la llegada estimada en la tarea (`etaDate`,
     `etaFrom`, `etaTo`, cadenas locales en la zona horaria de la app);
   - guarda el teléfono del cliente si cambió;
   - si `send` y el canal está disponible (`smsChannel.isAvailable(settings)`:
     «SMS a clientes» activado y proveedor configurado), inserta un `deliveries`
     `{ recipient: "customer", taskId, to, recipientName, message, state:
     "pending" }` y programa `internal.notifications.send.deliver`;
   - registra la actividad `customer_notice` (`from`: `sms` / `sin sms`, `to`:
     la ventana).

   El servidor tiene la última palabra sobre el texto: usa el `message` editado
   o renderiza la plantilla (`renderCustomerMessage`), lo pasa a GSM-7
   (`toGsm7`) y rechaza un mensaje vacío o de más de 306 septetos; nunca lo
   recorta. Sin `customerNotice` (clientes antiguos, scripts) la tarea se mueve y
   no se envía nada. Un `customerNotice` para un estado sin `notifyCustomer` se
   rechaza. `tasks.create`, los movimientos dentro del mismo estado y
   `boards.removeStatus` nunca envían SMS.
4. **Envío.** `send.deliver` (`send.ts`): `claim` toma el envío (solo una vez,
   así un `deliver` duplicado no envía dos veces), llama a `provider.send` y
   `record` lo deja `sent` (o `delivered`), `failed` con el error, o lo
   reintenta si el proveedor no lo aceptó (429/5xx): máximo 3 intentos, esperas
   de 30 s y 2 min. Un timeout o error de red **no** se reintenta («Resultado
   desconocido»). `send.ts` solo conoce `to` y `message`: no sabe quién es el
   destinatario.
5. **Estado.** El proveedor avisa en `POST /sms/<proveedor>/status`
   (`convex/http.ts`); `send.applyStatus` busca por `providerMessageId` y solo
   avanza el estado (`sent` → `delivered`/`failed`). Si el cliente responde
   STOP, Twilio rechaza los siguientes envíos (error 21610): quedan `failed`,
   sin reintento.
6. **Administración.** `deliveries.log` (últimos 100; el nombre sale de
   `recipientName` y la tarea de `taskId`; las filas antiguas al equipo, sin
   `recipient`, se resuelven por `userId` / `notificationId`) y
   `deliveries.retry` (solo `failed` de clientes; reenvía el mismo texto al
   `customerPhone` **actual** de la tarea y se niega con «La tarea ya no
   existe»). `settings.providerStatus` indica el proveedor activo y si está
   configurado. Al eliminar una tarea, sus envíos a clientes **se conservan**
   (rastro de coste y auditoría).

El renderizado vive en `convex/lib/customerMessage.ts` y lo comparten el
servidor y la vista previa del diálogo, para que lo que se ve sea lo que se
envía.

## Canal y proveedor

Dos capas separadas:

- **Canal** (`channels.ts`, `channels/sms.ts`): solo dice si se puede enviar
  ahora. Qué se envía y a quién lo decide quien crea el envío (`customer.ts`).

  ```ts
  interface DeliveryChannel {
    id: "sms";
    label: string;
    isAvailable(settings): boolean;   // interruptor global + proveedor configurado
  }
  ```

- **Proveedor** (`providers/`): *cómo* se transporta. Lo elige la variable de
  entorno `SMS_PROVIDER` (por defecto `twilio`; `log` solo escribe en el log y
  lo da por entregado, para desarrollo y tests).

  ```ts
  interface SmsProvider {
    id: "twilio" | "log";
    label: string;                               // se muestra en Ajustes
    isConfigured(): boolean;                     // variables de entorno presentes
    send({ to, body, statusCallbackUrl }): Promise<
      | { ok: true; providerMessageId: string; delivered?: boolean }
      | { ok: false; retryable: boolean; error: string }>;
    parseStatusCallback(req: Request): Promise<
      { providerMessageId; state: "sent" | "delivered" | "failed"; error? } | "invalid">;
  }
  ```

  `providers/twilio.ts` usa la API REST de Twilio con `fetch` (sin SDK) y valida
  la firma `X-Twilio-Signature` con Web Crypto.

## Añadir un proveedor de SMS

1. Crea `convex/notifications/providers/<id>.ts` que implemente `SmsProvider`.
   Sus credenciales son variables de entorno de Convex declaradas en
   `convex/convex.config.ts` y leídas con `env`. `send` solo debe devolver
   `retryable: true` cuando esté seguro de que el mensaje no se aceptó.
2. Añade el id a `providerIdValidator` (`convex/schema.ts`) y el adaptador a
   `PROVIDERS` (`providers/index.ts`). La ruta del webhook
   `/sms/<id>/status` se registra sola en `convex/http.ts`.
3. Actívalo con `npx convex env set SMS_PROVIDER <id>`.

Ni los avisos al cliente (`customer.ts`), ni las reglas de etapa, ni la interfaz cambian.

## Añadir otro canal (p. ej. email al cliente)

1. Añade su id a `channelIdValidator` y a `deliveryChannelValidator` en
   `convex/schema.ts`.
2. Implementa `DeliveryChannel` en `channels/<canal>.ts` y regístralo en
   `CHANNELS`.
3. Crea sus envíos donde corresponda (hoy `applyCustomerNotice` solo crea SMS),
   dale su propio envío (hoy `send.deliver` es específico de SMS) y el
   interruptor en `/admin/ajustes` (`settings.enabledChannels`).

## Migración

`npx convex run migrations:customerSmsV1` (`convex/migrations.ts`) borra la
antigua preferencia de SMS por usuario y descarta los SMS al equipo que
quedaran pendientes. Pasos completos en el `README.md` de la raíz.
