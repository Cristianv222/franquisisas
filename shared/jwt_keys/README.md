# Claves JWT (RS256)

Aquí viven las claves con las que `auth` firma los JWT y los demás servicios los
validan.

- `private.pem` — clave privada. **Solo `auth`** la usa (firma). **No se versiona.**
- `public.pem` — clave pública. La usan `franquicias` y `notificaciones` para
  validar los tokens sin llamar a `auth`.

Se generan en el **paso 2** (quedan git-ignored por `.gitignore`). Comando de
referencia:

```bash
openssl genpkey -algorithm RSA -out private.pem -pkeyopt rsa_keygen_bits:2048
openssl rsa -in private.pem -pubout -out public.pem
```

En producción, genera un par **distinto** y guárdalo de forma segura (no reutilices
las claves de desarrollo).
