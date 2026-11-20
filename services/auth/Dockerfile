FROM python:3.13-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# El comando real lo define docker-compose (Daphne / ASGI).
CMD ["daphne", "-b", "0.0.0.0", "-p", "8000", "config.asgi:application"]
