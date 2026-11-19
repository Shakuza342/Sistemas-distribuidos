# Red de veeduría ciudadana P2P

Red distribuida para registrar y hacer seguimiento a las quejas de un conjunto residencial. Proyecto de Sistemas Distribuidos, Ingeniería de Software, Universidad Manuela Beltrán (2026).

Equipo: Joseph Vanegas, Samith Amariles y Juan Gomez. Docente: Juan Jose Osorio Tabares.

Cada nodo guarda su propia copia de las quejas en SQLite y se sincroniza directamente con los demás, sin servidor central. Las quejas no se pueden borrar ni editar desde la aplicación. Los registros utilizan hashes SHA-256 y encadenamiento para detectar alteraciones realizadas directamente sobre la base de datos.

Al sincronizar, los nodos comparan sus copias y conservan evidencia de las diferencias. La detección de una manipulación no implica que cualquier alteración se repare automáticamente. Los vecinos acceden desde el celular o el navegador a una PWA servida por cada nodo.

## Alcance de esta entrega

Por tiempo y presupuesto, todo corre en **un solo computador**: tres nodos independientes a nivel lógico, cada uno en un contenedor Docker con su propio volumen y su propia base.

Se comunican por HTTP dentro de la red interna de Docker. No se utilizan Raspberry Pi, otros computadores ni servidores en la nube en esta demostración. Las pruebas de tolerancia a fallos corresponden a contenedores individuales, no al computador anfitrión.

| Contenedor | Nodo | Dirección |
|---|---|---|
| veeduria-nodo1 | Nodo Administración | http://localhost:3001 |
| veeduria-nodo2 | Nodo Vecino Torre 1 | http://localhost:3002 |
| veeduria-nodo3 | Nodo Consejo de administración | http://localhost:3003 |

## Requisitos

Ver [REQUIREMENTS.md](REQUIREMENTS.md).

- Docker Desktop funcionando, con WSL 2 configurado en Windows.
- Git.
- Un navegador y los puertos 3001, 3002 y 3003 disponibles.
- Para ejecutar sin Docker o realizar pruebas desde el computador: Node.js 22.13 o superior y npm.

Con Docker no es necesario instalar Node.js ni ejecutar `npm install` en el computador. SQLite funciona dentro de cada nodo y no requiere un servidor de base de datos separado.

## Inicio rápido con Docker

**1. Abre Docker Desktop y clona el repositorio:**

```powershell
git clone https://github.com/Shakuza342/Sistemas-distribuidos.git
cd Sistemas-distribuidos
```

Si ya tienes el proyecto, abre su carpeta y utiliza una terminal ubicada en ella.

**2. Crea `.env` solamente si todavía no existe:**

En PowerShell:

```powershell
Copy-Item .env.example .env
```

En Linux o macOS:

```bash
cp .env.example .env
```

Revisa `HOST_IP` y establece valores propios para `CLAVE_RED` y `JWT_SECRETO`. No sobrescribas una configuración existente.

**3. Inicia los nodos:**

```powershell
docker compose up -d --build
docker compose ps
```

Espera a que los tres contenedores aparezcan activos y saludables (`healthy`).

**4. Abre la aplicación:**

http://localhost:3001

Usuarios iniciales de prueba:

| Rol | Correo | Clave |
|---|---|---|
| Administración | admin@conjunto.co | admin123 |
| Consejo | consejo@conjunto.co | consejo123 |
| Vecino | laura@conjunto.co | vecino123 |

Si las credenciales fueron modificadas, utiliza las actuales. Estas cuentas son para demostración.

**5. Carga datos de ejemplo, si los necesitas:**

```powershell
docker compose exec nodo1 node scripts/datos-demo.js http://nodo1:3001 http://nodo2:3002
```

Este comando agrega quejas, comentarios, apoyos y estados. No es necesario ejecutarlo cada vez que inicies el proyecto.

### Acceso desde el celular

1. Conecta el celular y el computador a la misma red.
2. Ejecuta `ipconfig` en PowerShell.
3. Busca la IPv4 del adaptador Wi-Fi o Ethernet. No uses la dirección de Docker, WSL ni una VPN.
4. En `.env`, configura `HOST_IP` con esa IPv4, sin protocolo ni puerto.
5. Guarda y ejecuta:

   ```powershell
   docker compose up -d --build
   ```

6. Abre en el celular `http://TU_IPV4:3001`, reemplazando `TU_IPV4` por la dirección real.
7. Después de comprobar el enlace, prueba el QR de la pantalla **Conexión**.

Si anteriormente asignaste `$env:HOST_IP` en PowerShell, abre una terminal nueva para que esa variable no prevalezca sobre `.env`.

El QR contiene la dirección de acceso. Si cambia la IP del computador, actualiza `HOST_IP` y repite el comando anterior.

Si no abre, revisa el firewall y comprueba que la red no aísle los dispositivos. Para acceder a los tres nodos se utilizan los puertos 3001 a 3003. Consulta HTTPS y funciones de PWA en [GUIA.md](GUIA.md).

## Comandos útiles

Ejecuta estos comandos desde la carpeta del proyecto:

```bash
# Iniciar una instalación existente
docker compose up -d

# Aplicar cambios en los archivos
docker compose up -d --build

# Consultar el estado
docker compose ps

# Consultar los últimos registros del nodo 2
docker compose logs --tail=80 nodo2

# Seguir sus registros en tiempo real
docker compose logs -f nodo2

# Detener e iniciar un nodo
docker compose stop nodo2
docker compose start nodo2

# Apagar conservando los datos
docker compose down
```

Después de cambiar la interfaz, actualiza la versión de caché en `public/sw.js`, reconstruye los contenedores y recarga con `Ctrl + F5`.

Si la aplicación entra directamente al sistema, utiliza **Cerrar sesión**: el navegador puede conservar una sesión anterior.

**Borrado completo de datos de prueba:**

```bash
docker compose down -v
```

Este comando elimina los volúmenes y sus bases de datos. **No lo utilices si necesitas conservar las quejas, usuarios y demás registros.** Reiniciar Docker sin borrar volúmenes tampoco revierte las manipulaciones guardadas.

## Sin Docker

No ejecutes esta modalidad mientras los contenedores estén utilizando los mismos puertos.

Desde la carpeta del proyecto:

```bash
npm install
npm run red
```

Mantén esa terminal abierta. En otra terminal, si necesitas quejas de ejemplo:

```bash
npm run demo
```

Abre http://localhost:3001. Los otros nodos estarán disponibles en los puertos 3002 y 3003.

## Pruebas

Para ejecutar las pruebas desde el computador, instala las dependencias con `npm install`.

```bash
npm test                 # 15 pruebas funcionales y de integración
npm run fallos           # tolerancia a fallos -> resultados/fallos.json
npm run carga            # concurrencia y rendimiento -> resultados/carga.json
npm run docker:prueba    # escenarios con contenedores -> resultados/docker.json
```

Ejecuta las pruebas de escenarios con datos de demostración. La prueba Docker interactúa con los contenedores e incluye manipulación de datos.

### Simular la caída de un nodo

1. Con los tres nodos funcionando, detén el nodo 2:

   ```bash
   docker compose stop nodo2
   ```

2. Crea una queja en http://localhost:3001 y comprueba que se replica en http://localhost:3003.
3. Inicia nuevamente el nodo 2:

   ```bash
   docker compose start nodo2
   ```

4. Espera la sincronización y comprueba que recibe la queja creada durante su desconexión.

La sincronización está configurada cada 30 segundos, aunque los reintentos pueden aumentar la espera.

La PWA podría mostrar una interfaz guardada aunque su servidor esté detenido. Esto no significa que el nodo esté disponible.

### Simular una manipulación

**Utiliza datos de prueba: el comando modifica realmente una queja.**

1. Mantén los tres nodos encendidos y comprueba que exista una queja replicada.
2. Altera la descripción de la queja más reciente del nodo 2 sin recalcular el hash:

   ```bash
   docker compose exec nodo2 node scripts/manipular.js --config nodos/docker/nodo2.json --modo editar
   ```

3. Revisa la salida de la terminal para identificar el registro modificado.
4. Abre http://localhost:3002 con una cuenta autorizada.
5. Entra a **Integridad** y pulsa **Verificar de nuevo**.
6. Después de sincronizar, revisa también los conflictos registrados en los demás nodos.

| Resultado | Significado |
|---|---|
| Hash alterado | El contenido no coincide con su hash guardado |
| Cadena rota | Se detectó una inconsistencia en la cadena |
| Versión distinta entre nodos | Las copias del registro presentan diferencias |
| Registro restaurado | Se recuperó un registro desde otro nodo |

Revisa siempre el nodo que modificaste. Otro nodo puede mostrar el conflicto sin tener un hash local alterado.

“Problemas en este nodo” indica un problema de integridad, no una caída del contenedor.

Otros modos disponibles en `scripts/manipular.js`:

- `--modo rehash`: cambia el título y recalcula su hash.
- `--modo estado`: elimina el último cambio de estado.
- `--modo borrar`: elimina una queja y sus registros relacionados.

Para probarlos, sustituye `--modo editar` en el comando anterior. Ejecuta cada escenario por separado.

La recuperación por sincronización necesita otra copia disponible y no corrige automáticamente todas las alteraciones. Los conflictos históricos se conservan como evidencia.

## Estructura

```text
src/           nodo: servidor, API REST, sincronización, integridad, auth
src/rutas/     endpoints /api/v1
public/        PWA: HTML, CSS, JavaScript y Service Worker
nodos/         configuración de cada nodo; nodos/docker/ para contenedores
scripts/       red de prueba, datos demo, carga, fallos y manipulación
test/          pruebas automáticas con node:test
resultados/    resultados JSON de las pruebas
docs/          diagramas
```

Las bases de Docker se almacenan en volúmenes. No se transfieren automáticamente al clonar el repositorio en otro computador.

## Cómo trabajar en equipo

1. Pídele a Joseph que te agregue como colaborador desde **Settings → Collaborators** en GitHub y acepta la invitación.

2. Clona el repositorio una vez:

   ```bash
   git clone https://github.com/Shakuza342/Sistemas-distribuidos.git
   cd Sistemas-distribuidos
   npm install
   ```

3. Antes de empezar una tarea, comprueba que tu trabajo anterior esté guardado:

   ```bash
   git status
   ```

   Con el directorio de trabajo limpio, actualiza `main`:

   ```bash
   git switch main
   git pull --ff-only
   ```

4. Crea una rama propia y realiza los cambios:

   ```bash
   git switch -c nombre/cambio
   ```

   Sustituye `nombre/cambio` por tu rama; por ejemplo, `samith/pantalla-reportes`.

5. Ejecuta las pruebas, revisa los archivos y sube el cambio:

   ```bash
   npm test
   git status
   git add .
   git commit -m "Describe el cambio realizado"
   git push -u origin nombre/cambio
   ```

   Utiliza el mismo nombre de rama creado anteriormente.

6. Abre un Pull Request hacia `main` y solicita la revisión de otro integrante antes de fusionarlo.

Reglas del equipo:

- No subir `.env`, secretos ni bases de `datos/`; revisar las exclusiones de `.gitignore`.
- Si cambia la API o la base, actualizar `GUIA.md`.
- Si cambia algo de `public/`, actualizar la versión de caché en `public/sw.js`.
- Revisar los archivos antes de cada commit.
- Los cambios locales deben subirse a GitHub para que los demás puedan obtenerlos.

## Documentación

La guía completa sobre construcción, ejecución, HTTPS para celulares, pruebas de manipulación y problemas frecuentes está en [GUIA.md](GUIA.md).

Los requisitos del entorno están en [REQUIREMENTS.md](REQUIREMENTS.md).