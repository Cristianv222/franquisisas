# Convenciones de base de datos — `franquisisas`

Reglas obligatorias para **todas** las bases y servicios. El objetivo es que
cualquiera que abra la base entienda la estructura sin perderse. No se improvisan
nombres: lo que no esté aquí, se consulta o se agrega a este documento.

---

## 0. Principios

- **Idioma:** español en todo (tablas, columnas, constraints).
- **Estilo:** `snake_case` en minúsculas. Nada de camelCase ni mayúsculas en
  nombres de objetos.
- **Sin abreviaturas crípticas:** `franquicia`, no `frq`; `direccion`, no `dir`.
- **Consistencia entre servicios:** las mismas reglas en `auth_db`,
  `franquicias_db` y `notificaciones_db`.

---

## 1. Bases de datos

| Base | Servicio |
|---|---|
| `auth_db` | `auth` |
| `franquicias_db` | `franquicias` |
| `notificaciones_db` | `notificaciones` |

Patrón: `<servicio>_db`. Cada servicio tiene su propio usuario y clave; **sin
foreign keys entre bases** (el enlace entre servicios es por `id` + el JWT).

---

## 2. Tablas

- Nombre en **singular**, snake_case, español: `franquicia`, `sucursal`,
  `venta`, `usuario`.
- **Sin el prefijo de app de Django.** Por defecto Django nombra
  `franquicias_venta`; lo forzamos a `venta` con `Meta.db_table`.
- Tablas de relación M2M: `<tabla_a>_<tabla_b>` → `usuario_rol`.

---

## 3. Columnas

| Tipo | Regla | Ejemplo |
|---|---|---|
| Clave primaria | siempre `id` (bigint autoincremental) | `id` |
| Clave foránea | `<entidad>_id` | `franquicia_id`, `sucursal_id` |
| Booleano | prefijo `es_` / `tiene_` | `es_activo`, `tiene_descuento` |
| Timestamp de evento | sufijo `_en` | `creado_en`, `actualizado_en` |
| Fecha de negocio | prefijo `fecha_` | `fecha_venta` |
| Monto / cantidad | sufijo `_total` o prefijo `monto_` | `monto_total` |
| Texto corto nombre | `nombre`, `razon_social`, etc. | `nombre` |
| Estado / enumerado | columna `estado`, valores en MAYÚSCULA | `ACTIVA`, `SUSPENDIDA` |

Reglas extra:
- Toda columna de dinero: `DecimalField` (nunca `float`).
- Enumerados con `TextChoices` de Django y valores estables en MAYÚSCULA.

---

## 4. Auditoría estándar (en TODA tabla de negocio)

Toda tabla hereda estas columnas desde un modelo base abstracto:

```python
class ModeloBase(models.Model):
    creado_en = models.DateTimeField(auto_now_add=True)
    actualizado_en = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True
```

- `creado_en` — cuándo se creó la fila (no cambia).
- `actualizado_en` — última modificación.
- `eliminado_en` (opcional, `null=True`) — solo si la tabla usa **borrado
  lógico** en vez de borrado físico.

---

## 5. Índices y constraints (siempre con nombre explícito)

Nunca dejar que Django genere nombres automáticos ilegibles. Prefijos:

| Objeto | Patrón | Ejemplo |
|---|---|---|
| Índice | `ix_<tabla>_<cols>` (máx. 30 caracteres) | `ix_venta_franq_fecha` |
| Único | `uq_<tabla>_<cols>` | `uq_usuario_email` |
| Foránea | `fk_<tabla>_<tabla_ref>` | `fk_sucursal_franquicia` |
| Check | `ck_<tabla>_<regla>` | `ck_venta_monto_positivo` |

En Django:

```python
class Meta:
    indexes = [
        models.Index(fields=["franquicia_id", "fecha_venta"],
                     name="ix_venta_franq_fecha"),  # nombres de índice: máx 30 car.
    ]
    constraints = [
        models.UniqueConstraint(fields=["email"], name="uq_usuario_email"),
        models.CheckConstraint(condition=models.Q(monto_total__gte=0),
                               name="ck_venta_monto_positivo"),
    ]
```

---

## 6. Regla de oro del modelo multi-franquicia (modelo A)

- **Toda** tabla de negocio en `franquicias_db` lleva `franquicia_id`.
- **Toda** consulta se filtra por el `franquicia_id` que viene en el **JWT
  firmado**, nunca por un parámetro del frontend.
- Índice compuesto `(franquicia_id, <columna de filtro habitual>)` en cada tabla
  grande (p. ej. `(franquicia_id, fecha_venta)` en `venta`).

---

## 7. Ejemplo completo

```python
class Venta(ModeloBase):
    franquicia_id = models.BigIntegerField()          # scoping multi-tenant
    sucursal = models.ForeignKey("Sucursal", on_delete=models.PROTECT,
                                 db_column="sucursal_id")
    fecha_venta = models.DateField()
    monto_total = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        db_table = "venta"
        indexes = [
            models.Index(fields=["franquicia_id", "fecha_venta"],
                         name="ix_venta_franq_fecha"),
        ]
        constraints = [
            models.CheckConstraint(condition=models.Q(monto_total__gte=0),
                                   name="ck_venta_monto_positivo"),
        ]
```

Tabla resultante `venta`:

| columna | tipo |
|---|---|
| `id` | bigint PK |
| `franquicia_id` | bigint |
| `sucursal_id` | bigint FK → `sucursal.id` |
| `fecha_venta` | date |
| `monto_total` | numeric(12,2) |
| `creado_en` | timestamptz |
| `actualizado_en` | timestamptz |

---

## 8. Imágenes

- Columna `imagen` (`ImageField`), con `upload_to="<entidad>/"` (p. ej.
  `items/`, `solicitudes/`).
- Se guardan en el volumen de medios (`MEDIA_ROOT=/media`) y nginx las sirve en
  `/media/`. Requiere `Pillow`.
- En la solicitud, la imagen es **obligatoria** (junto con `nombre`, `precio` y
  `razon`).
- **Límite:** máximo **2 MB** por imagen y formatos **JPG / PNG / WebP**
  (validado en `core.validators.validar_imagen`). nginx corta en 5 MB
  (`client_max_body_size`) como primera barrera.

---

## 9. Catálogo de tablas de `franquicias_db`

Resumen de las tablas del dominio (todas heredan `creado_en` / `actualizado_en`).

**Estructura**
- `franquicia` (`nombre`, `propietario`, `identificacion`, `telefono`, `email`,
  `direccion`, `ciudad`, `logo`, `estado`, `num_mesas`)
- `sucursal` (`franquicia_id`, `nombre`, `direccion`)
- `mesa` (`franquicia_id`, `numero`, `pos_x`, `pos_y`, `forma`, `capacidad`) —
  único por (`franquicia_id`, `numero`); es el croquis del local (posiciones en %)
- `cliente` (`franquicia_id`, `cedula`, `nombre`, `telefono`, `email`) — único por
  (`franquicia_id`, `cedula`) cuando la cédula no está vacía

**Catálogo global / bodega general — gestiona el ADMIN**
- `menu` (`nombre`, `descripcion`, `estado`)
- `franquicia_menu` (`franquicia_id`, `menu_id`) — único por par
- `item` (`nombre`, `descripcion`, `precio`, `imagen`, `estado`, `menu_id` o
  `franquicia_id`) — precio global
- `materia_prima` (`nombre`, `unidad`, `precio`, `stock_central`) — `nombre` único;
  `stock_central` es el stock de la **bodega general** (almacén central del admin)
- `receta` (`item_id`, `materia_prima_id`, `cantidad`) — único por par

**Por franquicia — scoping por `franquicia_id` del JWT**
- `inventario` (`franquicia_id`, `materia_prima_id`, `cantidad_actual ≥ 0`,
  `umbral_minimo`) — único por par; `umbral_minimo` alimenta el semáforo y la
  alerta de stock bajo
- `venta` (`franquicia_id`, `numero_orden`, `sucursal_id?`, `cliente_id?`,
  `tipo_entrega`, `mesa?`, `fecha_venta`, `metodo_pago`, `monto_total`,
  `monto_recibido?`) — `numero_orden` es continuo por franquicia; `cliente_id`
  nulo = Consumidor Final; `monto_recibido` sirve para calcular el vuelto
- `detalle_venta` (`venta_id`, `item_id`, `cantidad`, `precio_unitario`, `subtotal`)
- `movimiento_inventario` (`franquicia_id?`, `materia_prima_id`, `tipo`, `cantidad`,
  `venta_id?`, `motivo`) — `franquicia_id` nulo = movimiento de la bodega general
  (compra al proveedor o salida al transferir)
- `solicitud` (`franquicia_id`, `nombre`, `precio`, `imagen`, `razon`, `estado`,
  `respuesta_admin`, `item_creado_id?`) — la franquicia pide un producto nuevo al menú
- `solicitud_insumo` (`franquicia_id`, `materia_prima_id`, `cantidad`, `razon`,
  `estado`, `respuesta_admin`) — la franquicia pide aumento de stock de un insumo;
  al aprobar, el admin transfiere desde la bodega general

**Enumerados (valores en MAYÚSCULA)**
- `franquicia.estado`: `ACTIVA`, `SUSPENDIDA`
- `menu.estado` / `item.estado`: `ACTIVO`, `INACTIVO`
- `materia_prima.unidad`: `UNIDAD`, `PORCION`, `PRESA`, `GRAMO`, `KILOGRAMO`, `MILILITRO`, `LITRO`
- `mesa.forma`: `CUADRADA`, `REDONDA`, `BARRA`
- `venta.metodo_pago`: `EFECTIVO`, `TRANSFERENCIA`, `DEUNA`, `TARJETA`
- `venta.tipo_entrega`: `MESA`, `LLEVAR`
- `movimiento_inventario.tipo`: `ENTRADA`, `SALIDA`, `AJUSTE`, `COMPRA`, `TRANSFERENCIA`
- `solicitud.estado`: `PENDIENTE`, `APROBADA`, `RECHAZADA`, `ATENDIDA`
- `solicitud_insumo.estado`: `PENDIENTE`, `APROBADA`, `RECHAZADA`

---

## 10. Catálogo de `auth_db`

- `usuario` (`username`, `email`, `password`, `rol`, `sub_rol`, `franquicia_id?`,
  `debe_cambiar_password`, más los flags estándar de Django) — tabla `usuario`

**Enumerados**
- `usuario.rol`: `ADMIN`, `FRANQUICIA`
- `usuario.sub_rol`: `ADMIN_FRAN`, `CAJERO` — solo aplica a usuarios `FRANQUICIA`
  (vacío para `ADMIN`). El `ADMIN_FRAN` gestiona los usuarios de su franquicia; el
  `CAJERO` solo registra ventas y ve reportes.
