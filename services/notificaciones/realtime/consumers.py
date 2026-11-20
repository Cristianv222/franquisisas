from channels.generic.websocket import AsyncJsonWebsocketConsumer


class NotificacionesConsumer(AsyncJsonWebsocketConsumer):
    """WS autenticado por JWT. Une al cliente al grupo de su franquicia (o 'admins')."""

    async def connect(self):
        claims = self.scope.get("claims")
        if not claims:
            # Sin token válido → se rechaza la conexión.
            await self.close(code=4001)
            return

        self.role = claims.get("role")
        self.franquicia_id = claims.get("franquicia_id")
        self.grupos = []
        if self.role == "FRANQUICIA" and self.franquicia_id is not None:
            self.grupos.append(f"franquicia_{self.franquicia_id}")
        if self.role == "ADMIN":
            self.grupos.append("admins")

        for grupo in self.grupos:
            await self.channel_layer.group_add(grupo, self.channel_name)

        await self.accept()
        await self.send_json(
            {
                "tipo": "conectado",
                "role": self.role,
                "franquicia_id": self.franquicia_id,
                "grupos": self.grupos,
            }
        )

    async def disconnect(self, code):
        for grupo in getattr(self, "grupos", []):
            await self.channel_layer.group_discard(grupo, self.channel_name)

    async def receive_json(self, content, **kwargs):
        # Eco simple (útil para pruebas desde el cliente).
        await self.send_json({"tipo": "eco", "data": content})

    # Handler de group_send con type="notificar".
    async def notificar(self, event):
        await self.send_json({"tipo": "notificacion", "payload": event["payload"]})
