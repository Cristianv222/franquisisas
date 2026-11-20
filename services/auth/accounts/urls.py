from django.urls import path

from . import views

# Rutas del servicio auth (nginx ya quitó el prefijo /api/auth/).
urlpatterns = [
    path("login/", views.LoginView.as_view(), name="login"),
    path("refresh/", views.RefreshView.as_view(), name="refresh"),
    path("logout/", views.LogoutView.as_view(), name="logout"),
    path("me/", views.MeView.as_view(), name="me"),
    path("cambiar-password/", views.CambiarPasswordView.as_view(), name="cambiar-password"),
    path(
        "usuarios/franquicia/",
        views.CrearUsuarioFranquiciaView.as_view(),
        name="crear-usuario-franquicia",
    ),
    path("usuarios/", views.UsuariosView.as_view(), name="usuarios"),
    path(
        "usuarios/<int:pk>/reset-password/",
        views.ResetPasswordView.as_view(),
        name="reset-password",
    ),
    # Gestión de usuarios por el admin de una franquicia (scoped a su franquicia).
    path(
        "usuarios/mi-franquicia/",
        views.UsuariosFranquiciaView.as_view(),
        name="usuarios-mi-franquicia",
    ),
    path(
        "usuarios/mi-franquicia/<int:pk>/reset-password/",
        views.ResetPasswordFranquiciaView.as_view(),
        name="reset-password-mi-franquicia",
    ),
]
