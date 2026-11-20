from django.db import migrations


def marcar_admin_franquicia(apps, schema_editor):
    """Los usuarios de franquicia que ya existían son el admin de su franquicia."""
    Usuario = apps.get_model("accounts", "Usuario")
    Usuario.objects.filter(rol="FRANQUICIA", sub_rol="").update(sub_rol="ADMIN_FRAN")


def revertir(apps, schema_editor):
    Usuario = apps.get_model("accounts", "Usuario")
    Usuario.objects.filter(rol="FRANQUICIA", sub_rol="ADMIN_FRAN").update(sub_rol="")


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0004_usuario_sub_rol"),
    ]

    operations = [
        migrations.RunPython(marcar_admin_franquicia, revertir),
    ]
