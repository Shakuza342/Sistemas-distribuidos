# Requisitos

Este proyecto es de Node.js, así que no usa `requirements.txt` como Python. Las librerías están en `package.json` y se instalan con `npm install`; las versiones exactas quedan fijadas en `package-lock.json`.

## Software para correr el proyecto

| Programa | Versión | Para qué |
|---|---|---|
| Docker Desktop (Windows/macOS) o Docker Engine + Compose (Linux) | La estable más reciente | Levantar los 3 nodos en contenedores |
| WSL 2 (solo Windows) | `wsl --update` | Docker Desktop lo necesita |
| Git | 2.40 o superior | Clonar y subir cambios |
| Navegador | Chrome, Edge, Firefox o Safari actualizados | Usar la aplicación |

## Software para desarrollar y correr las pruebas

| Programa | Versión | Para qué |
|---|---|---|
| Node.js | 22.13 o superior (recomendado 24 LTS) | Trae SQLite incluido (`node:sqlite`); necesario para `npm test`, `npm run carga`, `npm run fallos` |
| npm | El que viene con Node.js | Instalar dependencias |
| Visual Studio Code | Cualquiera reciente | Editor sugerido |
| mkcert | Opcional | HTTPS en la red local para el modo sin conexión en celulares |

Para comprobar:

```bash
docker --version
docker compose version
node -v      # v22.13.0 o mayor
git --version
```

## Dependencias de Node (package.json)

| Paquete | Versión | Uso |
|---|---|---|
| express | ^4.22.3 | Servidor HTTP y API REST |
| jsonwebtoken | ^9.0.3 | Tokens de sesión (JWT) |
| bcryptjs | ^3.0.3 | Guardar contraseñas de forma segura |
| qrcode | ^1.5.4 | Código QR de acceso al nodo |

No hay dependencias de desarrollo: las pruebas usan el ejecutor que trae Node (`node --test`).

## Equipo mínimo

PC con Windows 10/11 de 64 bits, Linux o macOS, 4 GB de RAM (8 GB recomendado), 2 GB libres en disco y virtualización activada en la BIOS (Intel VT-x o AMD-V) para Docker.
