import secrets

from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .email import enviar_credenciales
from .models import Usuario


class TokenPersonalizadoSerializer(TokenObtainPairSerializer):
    """Agrega claims (role, franquicia_id, debe_cambiar) y permite login por correo."""

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["username"] = user.get_username()
        token["role"] = user.rol
        token["sub_rol"] = user.sub_rol
        token["franquicia_id"] = user.franquicia_id
        token["debe_cambiar"] = user.debe_cambiar_password
        return token

    def validate(self, attrs):
        login = attrs.get(self.username_field)
        if login and "@" in login:
            usuario = Usuario.objects.filter(email__iexact=login).first()
            if usuario:
                attrs[self.username_field] = usuario.get_username()
        return super().validate(attrs)


class UsuarioSerializer(serializers.ModelSerializer):
    class Meta:
        model = Usuario
        fields = ["id", "username", "email", "rol", "sub_rol", "franquicia_id", "debe_cambiar_password"]


class CrearUsuarioFranquiciaSerializer(serializers.ModelSerializer):
    """Alta del usuario de una franquicia. Si no se da password, se autogenera.
    Devuelve 'password_generada' para mostrarla/copiarla en el panel."""

    password = serializers.CharField(write_only=True, required=False, min_length=8)
    password_generada = serializers.CharField(read_only=True)

    class Meta:
        model = Usuario
        fields = ["id", "username", "email", "password", "password_generada", "franquicia_id"]

    def create(self, validated_data):
        password = validated_data.pop("password", None) or secrets.token_urlsafe(9)
        # El usuario que se crea al dar de alta la franquicia es su administrador.
        usuario = Usuario(
            rol=Usuario.Rol.FRANQUICIA,
            sub_rol=Usuario.SubRol.ADMIN_FRAN,
            debe_cambiar_password=True,
            **validated_data,
        )
        usuario.set_password(password)
        usuario.save()
        usuario.password_generada = password
        enviar_credenciales(usuario.email, usuario.get_username(), password)
        return usuario


class UsuarioFranquiciaSerializer(serializers.ModelSerializer):
    """Alta/listado de usuarios de una franquicia por su propio administrador.

    El rol y la franquicia los fija la vista (no el cliente); solo elige el
    subrol: administrador de franquicia o cajero.
    """

    password = serializers.CharField(write_only=True, required=False, min_length=8)
    password_generada = serializers.CharField(read_only=True)
    sub_rol = serializers.ChoiceField(choices=Usuario.SubRol.choices)

    class Meta:
        model = Usuario
        fields = [
            "id", "username", "email", "sub_rol",
            "password", "password_generada", "debe_cambiar_password",
        ]
        read_only_fields = ["debe_cambiar_password"]

    def create(self, validated_data):
        password = validated_data.pop("password", None) or secrets.token_urlsafe(9)
        usuario = Usuario(
            rol=Usuario.Rol.FRANQUICIA,
            franquicia_id=self.context["franquicia_id"],
            debe_cambiar_password=True,
            **validated_data,
        )
        usuario.set_password(password)
        usuario.save()
        usuario.password_generada = password
        enviar_credenciales(usuario.email, usuario.get_username(), password)
        return usuario


class CambiarPasswordSerializer(serializers.Serializer):
    password_actual = serializers.CharField()
    password_nueva = serializers.CharField(min_length=8)


class UsuarioAdminSerializer(serializers.ModelSerializer):
    """Alta de usuarios por rol desde el panel admin (admin o franquicia)."""

    password = serializers.CharField(write_only=True, required=False, min_length=8)
    password_generada = serializers.CharField(read_only=True)

    class Meta:
        model = Usuario
        fields = [
            "id", "username", "email", "rol", "franquicia_id",
            "password", "password_generada", "debe_cambiar_password",
        ]
        read_only_fields = ["debe_cambiar_password"]

    def create(self, validated_data):
        password = validated_data.pop("password", None) or secrets.token_urlsafe(9)
        usuario = Usuario(debe_cambiar_password=True, **validated_data)
        if usuario.rol == Usuario.Rol.ADMIN:
            usuario.is_staff = True
        usuario.set_password(password)
        usuario.save()
        usuario.password_generada = password
        enviar_credenciales(usuario.email, usuario.get_username(), password)
        return usuario
