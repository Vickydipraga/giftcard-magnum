# Voucher Magnum

Web simple para validar y canjear vouchers con codigo unico.

## Incluye

- Validacion de codigo unico
- Seleccion entre `De Botanas` y `Del Mon`
- Flyer visual de consumicion por `$60.000`
- Canje de una sola vez
- Desactivacion automatica del voucher luego del canje
- Notificacion por WhatsApp mediante Twilio
- Vigencia del `2026-04-20` al `2026-06-30`

## Como usar

1. Configura las variables del archivo `.env.example` en tu entorno si quieres aviso por WhatsApp.
2. Ejecuta `node server.js`
3. Abre `http://localhost:3000`

## Despliegue en Vercel

El proyecto ya queda listo para desplegar en Vercel con archivos estaticos desde `public/` y funciones serverless en `api/`.

### Variables necesarias en Vercel

- `PUBLIC_WHATSAPP_NUMBER=5493513578562`
- `KV_REST_API_URL=...`
- `KV_REST_API_TOKEN=...`

### Importante

En Vercel los vouchers no deben guardarse en disco porque el filesystem no es persistente. Por eso la version de produccion usa `Vercel KV` cuando detecta `KV_REST_API_URL` y `KV_REST_API_TOKEN`.

### Flujo recomendado

1. Crea el proyecto en Vercel conectando este repositorio.
2. Agrega una base `Vercel KV` al proyecto.
3. Copia las variables `KV_REST_API_URL` y `KV_REST_API_TOKEN` a los Environment Variables del proyecto.
4. Agrega `PUBLIC_WHATSAPP_NUMBER=5493513578562`.
5. Haz el deploy.

La primera vez que corra en produccion, el sistema sembrara automaticamente los vouchers desde [data/vouchers.json](/F:/GiftCard_Magnum/data/vouchers.json) hacia KV.

## Datos

Los vouchers viven en [data/vouchers.json](/F:/GiftCard_Magnum/data/vouchers.json).

## Crear mas vouchers

Ejecuta:

```bash
node scripts/generate-vouchers.js 20
```

Eso agrega 20 vouchers nuevos al archivo de datos.
