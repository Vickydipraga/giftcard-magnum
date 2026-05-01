# Voucher Magnum

Web de vouchers con codigo unico, seleccion de restaurante, redireccion a WhatsApp y bloqueo real del voucher despues del canje.

## Arquitectura

El sistema ahora esta separado en 2 partes:

- `data/vouchers.json`: lista base de vouchers
- store de canjes: guarda solo que codigos ya fueron usados

Eso evita volver a escribir `vouchers.json` en produccion y elimina los errores de filesystem de solo lectura en Vercel.

## Produccion

En Vercel el proyecto necesita una persistencia real para guardar canjes. Esta version soporta:

- `REDIS_URL`
- `REDIS_REST_URL` + `REDIS_REST_TOKEN`
- `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`
- `STORAGE_REDIS_URL`
- `STORAGE_URL`
- `KV_REST_API_URL` + `KV_REST_API_TOKEN`

Si no hay una de esas opciones configurada, el canje no debe publicarse a produccion.

## Variables importantes

- `PUBLIC_WHATSAPP_NUMBER=5493513578562`
- una opcion de persistencia de la lista anterior

## Endpoints

- `GET /api/health`
- `GET /api/meta`
- `POST /api/vouchers/check`
- `POST /api/vouchers/redeem`

`/api/health` devuelve:

- `persistenceMode`
- `readyForProduction`

## Desarrollo local

```bash
node server.js
```

En local, si no configuras Redis o KV, los canjes se guardan en:

- [F:\GiftCard_Magnum\data\redemptions.json](/F:/GiftCard_Magnum/data/redemptions.json)

## Flujo correcto

1. El cliente elige restaurante.
2. Toca `Canjear`.
3. Ingresa codigo.
4. `Validar` revisa si existe y si ya fue usado.
5. `Confirmar canje` marca el voucher como usado.
6. Se abre WhatsApp.
7. Un segundo intento con el mismo codigo devuelve que ya fue canjeado.

## Archivos clave

- [F:\GiftCard_Magnum\lib\vouchers.js](/F:/GiftCard_Magnum/lib/vouchers.js)
- [F:\GiftCard_Magnum\api\vouchers\check.js](/F:/GiftCard_Magnum/api/vouchers/check.js)
- [F:\GiftCard_Magnum\api\vouchers\redeem.js](/F:/GiftCard_Magnum/api/vouchers/redeem.js)
- [F:\GiftCard_Magnum\public\app.js](/F:/GiftCard_Magnum/public/app.js)
