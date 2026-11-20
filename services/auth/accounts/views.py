import secrets

from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .email import enviar_credenciales
from .models import Usuario
from .permissions import EsAdmin, EsAdminFranquicia
from .serializers import (
    CambiarPasswordSerializer,
    CrearUsuarioFranquiciaSerializer,
    TokenPersonalizadoSerializer,
    UsuarioAdminSerializer,
    UsuarioFranquiciaSerializer,
    UsuarioSerializer,
)


class LoginView(TokenObtainPairView):
    """POST /login — emite access + refresh (con claims role y franquicia_id)."""

    serializer_class = TokenPersonalizadoSerializer


class RefreshView(TokenRefreshView):
    """POST /refresh — renueva el access a partir del refresh."""


class MeView(generics.RetrieveAPIView):
    """GET /me — datos del usuario autenticado."""

    serializer_class = UsuarioSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        return self.request.user


class LogoutView(APIView):
    """POST /logout — invalida el refresh token (blacklist)."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        refresh = request.data.get("refresh")
        if not refresh:
            return Response(
                {"detail": "Falta el token 'refresh'."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            RefreshToken(refresh).blacklist()
        except Exception:
            return Response(
                {"detail": "Token inválido."}, status=status.HTTP_400_BAD_REQUEST
            )
        return Response(status=status.HTTP_205_RESET_CONTENT)


class CrearUsuarioFranquiciaView(generics.CreateAPIView):
    """POST /usuarios/franquicia/ — alta de usuario de franquicia (solo ADMIN)."""

    serializer_class = CrearUsuarioFranquiciaSerializer
    permission_classes = [IsAuthenticated, EsAdmin]


class UsuariosView(generics.ListCreateAPIView):
    """GET lista de usuarios / POST alta por rol (solo ADMIN)."""

    queryset = Usuario.objects.all().order_by("username")
    serializer_class = UsuarioAdminSerializer
    permission_classes = [IsAuthenticated, EsAdmin]


class ResetPasswordView(APIView):
    """POST /usuarios/<pk>/reset-password/ — el admin resetea la contraseña."""

    permission_classes = [IsAuthenticated, EsAdmin]

    def post(self, request, pk):
        try:
            usuario = Usuario.objects.get(pk=pk)
        except Usuario.DoesNotExist:
            return Response({"detail": "Usuario no existe."}, status=status.HTTP_404_NOT_FOUND)
        nueva = secrets.token_urlsafe(9)
        usuario.set_password(nueva)
        usuario.debe_cambiar_password = True
        usuario.save(update_fields=["password", "debe_cambiar_password"])
        enviar_credenciales(usuario.email, usuario.get_username(), nueva)
        return Response(
            {"usuario": usuario.get_username(), "password_generada": nueva, "email": usuario.email}
        )


class UsuariosFranquiciaView(generics.ListCreateAPIView):
    """GET/POST /usuarios/mi-franquicia/ — el admin de una franquicia lista y
    crea los usuarios (cajeros u otros admins) de SU franquicia."""

    serializer_class = UsuarioFranquiciaSerializer
    permission_classes = [IsAuthenticated, EsAdminFranquicia]

    def get_queryset(self):
        return Usuario.objects.filter(
            rol=Usuario.Rol.FRANQUICIA, franquicia_id=self.request.user.franquicia_id
        ).order_by("username")

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx["franquicia_id"] = self.request.user.franquicia_id
        return ctx


class ResetPasswordFranquiciaView(APIView):
    """POST /usuarios/mi-franquicia/<pk>/reset-password/ — el admin de la
    franquicia resetea la contraseña de un usuario de SU franquicia."""

    permission_classes = [IsAuthenticated, EsAdminFranquicia]

    def post(self, request, pk):
        usuario = Usuario.objects.filter(
            pk=pk,
            rol=Usuario.Rol.FRANQUICIA,
            franquicia_id=request.user.franquicia_id,
        ).first()
        if not usuario:
            return Response(
                {"detail": "Usuario no existe en tu franquicia."},
                status=status.HTTP_404_NOT_FOUND,
            )
        nueva = secrets.token_urlsafe(9)
        usuario.set_password(nueva)
        usuario.debe_cambiar_password = True
        usuario.save(update_fields=["password", "debe_cambiar_password"])
        enviar_credenciales(usuario.email, usuario.get_username(), nueva)
        return Response(
            {"usuario": usuario.get_username(), "password_generada": nueva, "email": usuario.email}
        )


class CambiarPasswordView(APIView):
    """POST /cambiar-password/ — el usuario cambia su propia contraseña."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        s = CambiarPasswordSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        usuario = request.user
        if not usuario.check_password(s.validated_data["password_actual"]):
            return Response(
                {"detail": "La contraseña actual no es correcta."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        usuario.set_password(s.validated_data["password_nueva"])
        usuario.debe_cambiar_password = False
        usuario.save(update_fields=["password", "debe_cambiar_password"])
        return Response({"ok": True})
