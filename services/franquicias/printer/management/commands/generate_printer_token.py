"""
Genera (o rota) el token del agente de impresión de UNA franquicia.

El token en claro se muestra UNA sola vez: cópialo al configurar el agente
en el PC del local. En la base de datos solo queda su hash.

Uso:
    python manage.py generate_printer_token <franquicia_id> "PC Caja Local Centro"
    python manage.py generate_printer_token <franquicia_id> "PC Caja" --reset
"""
from django.core.management.base import BaseCommand, CommandError

from printer.models import PrinterAgentToken


class Command(BaseCommand):
    help = 'Genera o rota el token del agente de impresión de una franquicia'

    def add_arguments(self, parser):
        parser.add_argument('franquicia_id', type=int, help='ID de la franquicia')
        parser.add_argument('nombre', type=str, help='Nombre/referencia del agente')
        parser.add_argument(
            '--reset', action='store_true',
            help='Si ya existe un agente con ese nombre, le rota el token')

    def handle(self, *args, **options):
        franquicia_id = options['franquicia_id']
        nombre = options['nombre']
        reset = options['reset']

        existente = PrinterAgentToken.objects.filter(
            franquicia_id=franquicia_id, nombre=nombre).first()

        if existente and not reset:
            raise CommandError(
                f'Ya existe el agente "{nombre}" para la franquicia {franquicia_id}. '
                f'Usa --reset para rotar su token.')

        if existente:
            token_claro = existente.rotar()
            agente = existente
            self.stdout.write(self.style.WARNING('⚠️  Token rotado (el anterior dejó de servir)'))
        else:
            agente, token_claro = PrinterAgentToken.crear(franquicia_id, nombre)
            self.stdout.write(self.style.SUCCESS('✅ Agente creado'))

        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS('=' * 72))
        self.stdout.write(self.style.SUCCESS('  TOKEN DEL AGENTE DE IMPRESIÓN'))
        self.stdout.write(self.style.SUCCESS('=' * 72))
        self.stdout.write(f'  Franquicia: {agente.franquicia_id}')
        self.stdout.write(f'  Agente:     {agente.nombre}')
        self.stdout.write(self.style.SUCCESS(f'  TOKEN:      {token_claro}'))
        self.stdout.write(self.style.SUCCESS('=' * 72))
        self.stdout.write('')
        self.stdout.write(self.style.WARNING('  ⚠️  Cópialo ahora: no se vuelve a mostrar.'))
        self.stdout.write(self.style.WARNING('  Configúralo en el agente como cabecera:'))
        self.stdout.write('      X-Printer-Token: <token>')
        self.stdout.write('')
