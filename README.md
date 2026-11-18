# Red de veeduría ciudadana P2P

Red distribuida para registrar y hacer seguimiento a las quejas de un conjunto residencial. Proyecto de Sistemas Distribuidos, Ingeniería de Software, Universidad Manuela Beltrán (2026).

Equipo: Joseph Vanegas, Samith Amariles y Juan Gomez. Docente: Juan Jose Osorio Tabares.

Cada nodo guarda su propia copia de las quejas en SQLite y se sincroniza directamente con los demás, sin servidor central. Las quejas no se pueden borrar ni editar desde la aplicación, y cada registro va encadenado con SHA-256, así que si alguien altera una base por fuera, los otros nodos lo notan y conservan la versión original. Los vecinos entran desde el celular o el navegador a una PWA que sirve cada nodo.

## Alcance de esta entrega

Por tiempo y presupuesto, todo corre en **un solo computador**: tres nodos independientes a nivel lógico, cada uno en un contenedor Docker con su propio volumen y su propia base. Se comunican entre ellos por HTTP dentro de la red interna de Docker. No se usan Raspberry Pi, otros computadores ni servidores en la nube. Las pruebas de tolerancia a fallos son de contenedores individuales, no del computador anfitrión.

| Contenedor | Nodo | Dirección |
|---|---|---|
| veeduria-nodo1 | Nodo Administración | http://localhost:3001 |
| veeduria-nodo2 | Nodo Vecino Torre 1 | http://localhost:3002 |
| veeduria-nodo3 | Nodo Consejo de administración | http://localhost:3003 |

## Requisitos

Ver [REQUIREMENTS.md](REQUIREMENTS.md). En resumen: Docker Desktop (con WSL 2 en Windows), Git y, para las pruebas automáticas, Node.js 22.13 o superior (recomendado 24 LTS).

## Inicio rápido con Docker

```bash
cp .env.example .env              # en Windows: copy .env.example .env
# edite .env: HOST_IP = IP del PC en la wifi, CLAVE_RED y JWT_SECRETO propias
docker compose up -d --build
docker compose ps                 # esperar a que los 3 digan (healthy)
docker exec veeduria-nodo1 node scripts/datos-demo.js http://nodo1:3001 http://nodo2:3002
```

Usuarios de prueba:

| Rol | Correo | Clave |
|---|---|---|
| Administración | admin@conjunto.co | admin123 |
| Consejo | consejo@conjunto.co | consejo123 |
| Vecino | laura@conjunto.co | vecino123 |

Desde un celular en la misma wifi: `http://IP-DEL-PC:3001` o el código QR que muestra la app. En Windows hay que abrir los puertos 3001 a 3003 en el firewall (ver GUIA.md).

## Comandos útiles

```bash
docker stop veeduria-nodo3        # simular la caída de un nodo
docker start veeduria-nodo3       # vuelve y se pone al día solo
docker compose logs -f nodo3      # ver lo que hace un nodo
docker exec veeduria-nodo2 node scripts/manipular.js --config nodos/docker/nodo2.json --modo editar
docker compose down               # apagar conservando datos
docker compose down -v            # apagar y borrar todo
```

## Sin Docker

```bash
npm install
npm run red       # 3 nodos en localhost:3001, 3002 y 3003
npm run demo      # en otra terminal: quejas de ejemplo
```

No corra `npm run red` con los contenedores prendidos: usan los mismos puertos.

## Pruebas

```bash
npm test          # 15 pruebas funcionales y de integración
npm run fallos    # tolerancia a fallos  -> resultados/fallos.json
npm run carga     # concurrencia y rendimiento -> resultados/carga.json
npm run docker:prueba   # escenarios con los contenedores -> resultados/docker.json
```

## Estructura

```
src/           nodo: servidor, API REST, sincronización, integridad, auth
src/rutas/     endpoints /api/v1
public/        PWA (HTML, CSS, JS, service worker)
nodos/         configuración de cada nodo (nodos/docker/ para contenedores)
scripts/       red de prueba, datos demo, carga, fallos, manipulación
test/          pruebas automáticas (node:test)
resultados/    resultados JSON de las pruebas
docs/          diagramas
```

## Cómo trabajar en equipo

1. Pídale a Joseph que lo agregue como colaborador (Settings → Collaborators en GitHub) y acepte la invitación que llega al correo.
2. Clone el repositorio una vez:
   ```bash
   git clone https://github.com/Shakuza342/Sistemas-distribuidos.git
   cd Sistemas-distribuidos
   npm install
   ```
3. Antes de empezar a trabajar, traiga lo último: `git pull`.
4. Trabaje en una rama propia, no directo en `main`:
   ```bash
   git checkout -b nombre/cambio      # ej: samith/pantalla-reportes
   # ... cambios ...
   npm test                           # que sigan pasando las 15
   git add .
   git commit -m "Qué cambió, en una línea"
   git push -u origin nombre/cambio
   ```
5. En GitHub abra un Pull Request hacia `main` y avise al grupo para que alguien lo revise antes de unirlo.

Reglas cortas: no subir el archivo `.env` ni las bases de `datos/` (ya están en `.gitignore`); si cambia la API o la base, actualice GUIA.md; si cambia algo de `public/`, suba la versión en `public/sw.js` para que los navegadores no se queden con la copia vieja.

## Documentación

La guía completa (cómo se construyó, cómo se ejecuta, HTTPS para celulares, pruebas de manipulación y problemas frecuentes) está en [GUIA.md](GUIA.md).
