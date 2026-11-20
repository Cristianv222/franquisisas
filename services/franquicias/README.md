# Servicio `franquicias`

Dominio de negocio: franquicias, menús, items, materia prima, inventario, ventas,
reportes y solicitudes. Es el servicio más grande del sistema.

Los modelos ya están en `franquicias/models.py` siguiendo
[docs/CONVENCIONES_BD.md](../../docs/CONVENCIONES_BD.md):

- **Estructura:** `Franquicia`, `Sucursal`.
- **Catálogo global (gestiona el ADMIN):** `Menu`, `FranquiciaMenu` (asignación),
  `Item` (precio global + imagen; de menú o exclusivo de franquicia),
  `MateriaPrima`, `Receta` (ficha técnica).
- **Por franquicia (scoping por JWT):** `Inventario`, `Venta` (+ método de pago),
  `DetalleVenta`, `MovimientoInventario`, `Solicitud`.

**Reglas de negocio (se implementan en su paso):**
- Validar el JWT con la clave pública (`/keys/public.pem`).
- CRUD de catálogo e inventario: solo rol `ADMIN`.
- Venta: descuenta inventario por receta y registra `MovimientoInventario` SALIDA.
- Bloqueo por stock: un item no se vende si su inventario no cubre la receta.
- Reportes y solicitudes con scoping por `franquicia_id` del token.
- Imágenes en el volumen `/media` (servidas por nginx en `/media/`).
