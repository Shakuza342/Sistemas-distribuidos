# Red de veeduría ciudadana P2P — Guía de construcción y ejecución

Proyecto de Sistemas Distribuidos, Ingeniería de Software, Universidad Manuela Beltrán.
Equipo: Joseph Stiven Vanegas Pedraza (backend, BD y arquitectura P2P), Samith Shekina Amariles Nieto (frontend/UX, PWA) y Juan Gomez (requerimientos y documentación).

Esta guía tiene dos partes. El documento técnico de entrega (Word) explica además la arquitectura, las pruebas con sus resultados y el presupuesto. La primera explica paso a paso cómo se construyó el sistema y por qué se tomó cada decisión, siguiendo lo que propone el documento del proyecto. La segunda explica cómo instalarlo, ejecutarlo y hacer las pruebas que piden las métricas de éxito (sección 8 del documento). Al final hay una tabla que relaciona cada requerimiento con el archivo donde se cumple, las diferencias con el documento y un guion para la sustentación.

---

## Índice

1. Qué es lo que se construyó
2. Requisitos
3. Estructura del proyecto
4. Cómo se realizó, paso a paso
5. Cómo se ejecuta, paso a paso
6. Requerimientos del documento y dónde se cumplen
7. Decisiones y diferencias respecto al documento
8. Solución de problemas
9. Guion sugerido para la demo de la sustentación

---

## 1. Qué es lo que se construyó

Es el MVP funcional de la red de quejas del conjunto residencial. Tiene tres piezas:

**Nodos.** Cada nodo es un programa en Node.js con su propia base SQLite. En esta versión cada nodo corre en un contenedor Docker: los tres nodos (administración, vecino y consejo) se levantan en un solo computador con `docker compose`. La entrega se limita a ese escenario: un solo computador físico y tres nodos independientes a nivel lógico. Todos los nodos son iguales: ninguno es el servidor central y ninguno tiene más privilegios que otro.

**Sincronización P2P.** Cada cierto tiempo (30 segundos por defecto) cada nodo se conecta directamente con sus pares por la red local e intercambia los registros que le faltan a cada uno. Si un nodo no tiene red, la sincronización también se puede hacer con una memoria USB, exportando e importando un archivo.

**Aplicación web progresiva (PWA).** Es lo que usan los vecinos, la administración y el consejo desde el celular o el computador, entrando por un código QR. Guarda una copia local de las quejas y deja registrar quejas sin conexión. Cuando vuelve la red, las envía solas.

Todo esto se apoya en dos garantías que vienen del documento. La primera es que nada se borra ni se edita (RF-04): solo se agregan registros nuevos. La segunda es que cada registro lleva un hash SHA-256 encadenado con el anterior (RNF-02). Si alguien altera la base de datos de un nodo, ese nodo lo detecta en su propia cadena y los demás nodos lo detectan al comparar sus copias. Además, el registro alterado no se propaga a los demás nodos.

---

## 2. Requisitos

- **Node.js 22.13 o superior** (se recomienda la versión LTS 24). Se descarga de https://nodejs.org. Para comprobar la versión instalada, abra una terminal y escriba `node -v`. Las versiones 18 y 20 **no sirven**, porque el proyecto usa el módulo SQLite que viene integrado en Node a partir de la 22.13.
- Un navegador moderno: Chrome, Edge o Firefox en el computador y Chrome en Android o Safari en iPhone.
- Opcional, solo para usar la app desde celulares con todas sus funciones: **mkcert**, que genera certificados HTTPS válidos en la red local (ver 5.10).

No hace falta instalar ningún motor de base de datos ni compilar nada. Todas las dependencias son JavaScript puro y ya vienen dentro del zip, en la carpeta `node_modules`.

---

## 3. Estructura del proyecto

```
veeduria-p2p/
├── package.json            dependencias y comandos (npm run ...)
├── GUIA.md                 esta guía
├── README.md               resumen corto
├── nodos/                  configuración de cada nodo de prueba
│   ├── nodo1.json          Nodo Administración   (puerto 3001, crea los usuarios iniciales)
│   ├── nodo2.json          Nodo Vecino Torre 1   (puerto 3002)
│   ├── nodo3.json          Nodo Consejo de administración (puerto 3003)
│   └── docker/             configuraciones que usan los contenedores
├── datos/                  aquí se crean los archivos SQLite (nodo1.db, nodo2.db, ...)
├── certs/                  aquí van los certificados HTTPS si se usan
├── src/                    backend del nodo
│   ├── server.js           punto de entrada: lee la config y levanta HTTP/HTTPS
│   ├── app.js              arma la aplicación Express y el ciclo de sincronización
│   ├── config.js           carga el archivo de configuración del nodo
│   ├── db.js               esquema SQLite, triggers append-only y tablas replicables
│   ├── hash.js             funciones SHA-256 de cada tipo de registro
│   ├── modelo.js           reglas de negocio: quejas, estados, comentarios, apoyos
│   ├── auth.js             JWT, control de acceso por rol y clave de red
│   ├── sync.js             protocolo de sincronización P2P y paquete USB
│   ├── integridad.js       verificación de las cadenas de hash
│   ├── reportes.js         reporte agregado y métricas
│   ├── semilla.js          usuarios de prueba
│   └── rutas/              endpoints de la API REST /api/v1
├── public/                 la PWA (cliente)
│   ├── index.html
│   ├── manifest.webmanifest
│   ├── sw.js               service worker (funcionamiento sin conexión)
│   ├── css/estilos.css
│   ├── fuentes/            tipografías incluidas (Archivo, Atkinson Hyperlegible, IBM Plex Mono)
│   ├── iconos/             logo del árbol (SVG) e íconos de la app
│   ├── js/app.js           vistas por rol
│   ├── js/api.js           comunicación con el nodo y cola sin conexión
│   ├── js/almacen.js       copia local en IndexedDB
│   ├── js/iconos.js        íconos SVG de la interfaz
├── scripts/
│   ├── red.js              levanta los 3 nodos a la vez
│   ├── datos-demo.js       carga quejas de ejemplo
│   ├── manipular.js        simula un ataque directo al SQLite (métrica de integridad)
│   └── reiniciar.js        borra las bases de prueba
└── test/red.test.js        13 pruebas automáticas de toda la red
```

---

## 4. Cómo se realizó, paso a paso

### Paso 1. Crear el proyecto e instalar dependencias

Se creó la carpeta del proyecto y se inicializó con npm:

```bash
mkdir veeduria-p2p
cd veeduria-p2p
npm init -y
npm install express@4 jsonwebtoken bcryptjs qrcode
```

En `package.json` se puso `"type": "module"` para usar `import`/`export`, y se agregaron los comandos `nodo1`, `nodo2`, `nodo3`, `red`, `demo`, `manipular`, `reiniciar` y `test`.

Cada dependencia tiene una razón concreta:

- **express**: el framework de la API, tal como dice la tabla 3.2 del documento.
- **jsonwebtoken**: los tokens JWT de la sección 7.3.
- **bcryptjs**: el hash de contraseñas que pide el campo `hash_password`. Se usó la versión en JavaScript puro para no tener que compilar nada en Windows.
- **qrcode**: genera el código QR de acceso del copropietario (tabla 3.2).

Para SQLite **no** se instaló ningún paquete, porque Node 22.13+ trae `node:sqlite` integrado. Esto evita el problema típico de `better-sqlite3` o `sqlite3`, que necesitan compilarse y suelen fallar en Windows. Sigue siendo SQLite de verdad, con un archivo `.db` por nodo, como pide el documento.

### Paso 2. Configuración por nodo

Cada nodo se describe en un archivo JSON dentro de `nodos/`. Así se pueden correr varios nodos en el mismo computador (uno por puerto) o en computadores distintos:

```json
{
  "nombre": "Nodo Administración",
  "puerto": 3001,
  "host": "0.0.0.0",
  "db": "datos/nodo1.db",
  "urlPublica": "http://localhost:3001",
  "peers": ["http://localhost:3002", "http://localhost:3003"],
  "intervaloSyncSegundos": 30,
  "claveRed": "clave-compartida-del-conjunto-cambiar",
  "jwtSecreto": "secreto-jwt-del-conjunto-cambiar",
  "semilla": true,
  "https": null
}
```

`peers` son los otros nodos con los que este se sincroniza. `claveRed` es una clave que comparten todos los nodos del conjunto, para que un nodo desconocido no pueda inyectar registros. `semilla: true` hace que el nodo cree los usuarios de prueba la primera vez que arranca. `src/config.js` lee este archivo y completa los valores que falten.

### Paso 3. Base de datos

El esquema está en `src/db.js` y sigue las tablas 3, 4 y 5 del documento:

- `usuario`: id UUID, nombre, correo, hash_password (bcrypt), rol con `CHECK IN ('vecino','administrador','auditor')`, unidad_residencial y nodo_id.
- `queja`: id UUID generado en el nodo de origen, título, descripción, categoría con su `CHECK`, ubicacion_lat/lng, fecha_creacion ISO 8601, autor_id, nodo_origen, `hash` (UNIQUE) y `hash_anterior`.
- `historial_estado`: id, queja_id, estado con `CHECK IN ('nueva','vista','en_proceso','resuelta')`, responsable_id, fecha, nodo_origen, hash y hash_anterior.

El MER del documento habla de ocho entidades, así que se agregaron las tablas que faltaban en el modelo físico:

- `nodo`: los nodos conocidos, con `ultima_sync` (Nodo.ultima_sync del diccionario de datos, que solo actualiza el módulo de sincronización).
- `comentario` y `apoyo`: las clases Comentario y Apoyo del diagrama de clases. Cada una lleva su hash.
- `foto`: las fotografías de RF-01. Se guardan como texto base64 dentro del SQLite para que viajen en la misma sincronización, y cada una tiene un hash que cubre su contenido. Así se cierra el hueco de que una foto se pudiera cambiar sin detección.
- `conflicto`: la bitácora de lo que detecta la sincronización (manipulaciones, registros restaurados, etc.).
- `meta`: guarda el id propio del nodo, que se genera una sola vez.

**RF-04 a nivel de base de datos.** Además de que la API no tiene ninguna ruta DELETE ni PUT, se crearon triggers sobre las tablas queja, historial_estado, comentario, apoyo y foto que abortan cualquier `UPDATE` o `DELETE`:

```sql
CREATE TRIGGER queja_sin_update BEFORE UPDATE ON queja
BEGIN SELECT RAISE(ABORT, 'registro append-only: no se permite modificar queja'); END;
```

Alguien con acceso al archivo puede borrar los triggers, y por eso la verdadera protección es el hash más la replicación (pasos 4 y 8). El script `manipular.js` hace justamente eso para demostrarlo.

### Paso 4. Hash encadenado (RNF-02)

En `src/hash.js` está la fórmula de cada tipo de registro. Para la queja es exactamente la del documento:

```
hash = SHA-256( id + titulo + descripcion + categoria + fecha_creacion + autor_id + hash_anterior )
hash historial = SHA-256( id + queja_id + estado + responsable_id + fecha + hash_anterior )
```

La "concatenación normalizada" que menciona el diccionario de datos se hace serializando los campos como un arreglo JSON (`["id","titulo",...]`) antes de calcular el hash. Si solo se pegaran los textos, "ab"+"c" y "a"+"bc" darían el mismo resultado. Con el arreglo eso no pasa.

El `hash_anterior` es el hash del último registro **creado por ese mismo nodo** en esa tabla. Así cada nodo tiene su propia cadena de quejas y su propia cadena de cambios de estado, que es lo que dice el documento ("encadenamiento local"). El último registro se busca como la punta de la cadena: el registro propio al que ningún otro registro propio apunta (`puntaDeCadena` en `modelo.js`).

Con esto, si alguien borra un registro intermedio, el siguiente queda apuntando a un hash que ya no existe (**eslabón faltante**). Si alguien intercala un registro, quedan dos registros apuntando al mismo anterior (**bifurcación**). Y si alguien edita un campo, el hash ya no coincide con el contenido (**hash alterado**).

### Paso 5. Reglas de negocio

`src/modelo.js` implementa lo que pide cada requerimiento funcional:

- **Crear queja (RF-01, RF-02).** Valida título, descripción, categoría y hasta 3 fotos. El servidor calcula el hash y el hash_anterior **sin confiar en lo que mande el cliente**, como dice la nota de la tabla 7. La operación es **idempotente**: el id lo genera el celular, y si la misma queja llega dos veces (por ejemplo, al reenviarla desde la cola sin conexión), no se duplica.
- **Cambiar estado (RF-05).** Solo la administración puede hacerlo. Cada cambio es un registro nuevo en historial_estado con quién y cuándo, nunca una actualización. El estado **solo avanza** (nueva → vista → en_proceso → resuelta), como dice el diccionario de datos. Se puede saltar estados, pero no retroceder. Si dos administradores en nodos distintos cambian el estado al mismo tiempo, el estado vigente es el más avanzado, así que no hay conflicto que resolver.
- **Comentarios y apoyos (RF-09).** Se agregan sin tocar la queja original. Cada vecino puede apoyar una queja una sola vez (`UNIQUE(queja_id, autor_id)`).
- **Tablero (RF-06).** Lista las quejas con su estado vigente, número de apoyos, comentarios y fotos, con filtros por categoría y estado.

### Paso 6. Autenticación y autorización (sección 7.3)

En `src/auth.js`:

- **Login.** Se valida la contraseña con bcrypt y se devuelve un JWT firmado (válido por 12 horas) con el id y el rol del usuario.
- **Autenticación.** Cada petición lleva `Authorization: Bearer <token>`. Si el token falta o es inválido, la respuesta es 401.
- **Autorización.** No va en el token sino en cada endpoint, con `permitir('administrador')`, `permitir('vecino')`, etc. Si el rol no puede hacer la acción, la respuesta es 403.
- **Clave de red.** El endpoint de sincronización entre nodos no usa JWT, porque no lo llama una persona sino otro nodo. Exige el encabezado `X-Clave-Red`, que deben compartir todos los nodos del conjunto.

### Paso 7. API REST

Todos los endpoints van bajo `/api/v1`, en JSON y con fechas ISO 8601 UTC (sección 7.1):

| Método | Endpoint | Rol | Qué hace |
|---|---|---|---|
| POST | /auth/login | ninguno | Devuelve el JWT |
| GET | /auth/yo | cualquiera autenticado | Datos del token |
| POST | /quejas | vecino | Registra una queja y calcula su hash (RF-01) |
| GET | /quejas | vecino, administrador, auditor | Tablero (RF-06). Filtros: `?categoria=`, `?estado=`, `?mias=1` |
| GET | /quejas/{id} | todos | Detalle con fotos y comentarios |
| POST | /quejas/{id}/estados | administrador | Agrega un registro a HistorialEstado (RF-05, RF-04) |
| GET | /quejas/{id}/historial | todos | Cadena de hashes con validación de cada eslabón |
| POST | /quejas/{id}/comentarios | vecino, administrador | Comentario o respuesta (RF-09) |
| POST | /quejas/{id}/apoyos | vecino | Apoyo a la queja |
| POST | /nodos/sincronizar | nodo con clave de red | Recibe el paquete de otro nodo y resuelve conflictos (409 si hay) |
| GET | /nodos | administrador, auditor | Nodos conocidos y estado de la sincronización |
| POST | /nodos | administrador | Agrega un par por URL |
| POST | /nodos/sincronizar-ahora | administrador, vecino | Fuerza la sincronización con los pares |
| GET | /nodos/exportar | administrador | Descarga el paquete para USB |
| POST | /nodos/importar | administrador | Carga un paquete desde USB |
| GET | /reportes/agregado | auditor (consejo), administrador | Reporte consolidado (RF-07, RF-08) |
| GET | /integridad | auditor, administrador | Verificación completa de las cadenas |
| GET | /usuarios, POST /usuarios | administrador | Consulta y registro de usuarios |
| GET | /estado | público | Nombre e id del nodo |

Los códigos HTTP son los de la sección 7.1: 200, 201, 400, 401, 403, 404 y 409. **No existe ninguna ruta DELETE, PUT ni PATCH**: si alguien intenta `DELETE /api/v1/quejas/x`, la respuesta es 404, porque la ruta no existe.

### Paso 8. Sincronización P2P (el corazón del sistema)

Está en `src/sync.js`. La idea clave es que, como los registros nunca se modifican ni se borran, el conjunto de registros de cada tabla solo crece. En la teoría de sistemas distribuidos esto es un **CRDT de tipo G-Set** (conjunto que solo crece): para que dos réplicas converjan basta con unir lo que tiene cada una, y no existen versiones contradictorias de un mismo registro que haya que reconciliar. Eso es lo que garantiza la **consistencia eventual** del glosario.

El protocolo entre el nodo A (el que inicia) y el nodo B funciona así:

1. A calcula su **resumen**: para cada registro, su id y una **huella** SHA-256 calculada a partir del contenido actual. Se calcula desde el contenido y no desde el hash guardado para que una edición directa en el archivo cambie la huella, aunque el atacante no haya tocado el hash.
2. A envía a B `POST /nodos/sincronizar` con su identificación, los nodos que conoce y su resumen.
3. B compara los dos resúmenes y responde con tres cosas: los registros que A no tiene (completos), la lista de ids que a B le faltan y su propio resumen.
4. A valida e inserta lo que recibió. Si B le pidió registros, A hace un segundo `POST` con esos registros.

Al recibir cada registro, el nodo hace estas validaciones:

- **El hash coincide con el contenido.** Si no coincide, el registro se rechaza y se anota `hash_invalido`. Así un registro alterado nunca se propaga.
- **Ya existe un registro con ese id pero con otro contenido.** No se sobrescribe ninguno de los dos: se anota `version_distinta` en ambos nodos. El nodo cuya copia no cuadra con su propio hash sabe que fue él el alterado y lo deja escrito en el detalle. Con tres o más nodos, la versión correcta es la que tiene la mayoría.
- **Llega un registro que este mismo nodo creó y que ya no estaba en su base.** Alguien lo borró a la fuerza. Se restaura y se anota `registro_restaurado`.
- **El registro viola una restricción**, por ejemplo un correo repetido. Se anota `rechazado`.

Cada nodo corre este proceso con todos sus pares cada `intervaloSyncSegundos`. Si un par no responde, se anota el error y se reintenta en el siguiente ciclo: eso es la tolerancia a fallos. Los registros también llegan **de forma transitiva**: si A solo conoce a B y B conoce a C, lo que se crea en C llega a A pasando por B.

**Sincronización por USB.** `GET /nodos/exportar` genera un archivo JSON con todos los registros (el mismo formato que viaja por la red) y `POST /nodos/importar` lo aplica con las mismas validaciones. Es la "sync LAN/USB" de la Figura 3.

### Paso 9. Verificación de integridad

`src/integridad.js` recorre todas las tablas y revisa cuatro cosas. Primero, que cada hash corresponda a su contenido. Segundo, que cada `hash_anterior` exista dentro de la cadena de ese nodo emisor. Tercero, que no haya dos registros apuntando al mismo anterior. Cuarto, que ningún comentario, apoyo, foto o estado apunte a una queja que no existe. Devuelve el porcentaje de registros verificables (la métrica 2 del documento), el estado de cada cadena por nodo y la bitácora de conflictos.

En la app, cada queja muestra su **historial verificable**, con el sello "hash válido / enlace válido" en cada eslabón.

### Paso 10. Reportes y métricas (sección 8)

`src/reportes.js` calcula directamente desde la base de datos:

- **Métrica 1:** tiempo entre la creación de la queja y el primer cambio de estado (promedio y mediana), quejas que nunca recibieron respuesta y quejas con más de 72 horas sin respuesta.
- **Métrica 2:** porcentaje de la cadena que es verificable.
- **Métrica 3:** se mide con las pruebas sin conexión (5.6 y `npm test`).
- **Métrica 4:** cobertura de auditoría, es decir, cuántas de las quejas que hay en la base aparecen en el reporte (debe dar 100%).

También incluye la distribución por categoría y por estado, el tiempo hasta la resolución y las quejas con más apoyos. La vista de reportes tiene un botón de imprimir o guardar como PDF para llevarla a la asamblea.

### Paso 11. La PWA

La interfaz está en `public/` y usa HTML, CSS y JavaScript sin frameworks (tabla 3.2). Las vistas cambian según el rol:

- **Vecino:** tablero, nueva queja (con hasta 3 fotos que se comprimen en el celular antes de enviarse y ubicación opcional), mis quejas, detalle con historial verificable, comentarios y botón de apoyar.
- **Administración:** tablero, cambio de estado (solo hacia adelante y con confirmación), respuesta a la queja, reportes, integridad, nodos (con el QR, los pares, "sincronizar ahora" y exportar o importar por USB) y registro de usuarios.
- **Consejo (auditor):** solo lectura: tablero, detalle, reportes, integridad y nodos.

El modo **sin conexión (RNF-01, RF-02)** se resuelve en tres capas:

1. `sw.js` (service worker) guarda la interfaz en caché. La app abre aunque no haya red.
2. `almacen.js` guarda en IndexedDB la última copia del tablero y de cada queja consultada. Sin conexión se muestra esa copia con un aviso.
3. `api.js` tiene una **cola de pendientes**. Si al registrar una queja, comentar o apoyar no hay conexión, la operación se guarda en el dispositivo con su id ya generado y aparece en el tablero como "En cola". Cuando vuelve la red (evento `online`, cada 20 segundos o con el botón ⟳), se envía sola. Como el id viene del dispositivo, el nodo no la duplica.

El `manifest.webmanifest` y los íconos permiten instalar la app en el celular o el computador sin tienda de aplicaciones (RNF-06). El QR de acceso se genera en `/qr.png`. Si la URL del nodo es `localhost`, el QR usa automáticamente la IP de la red local para que funcione desde un celular.

**Diseño visual.** La interfaz se pensó como un *libro de registro*, que es justamente lo que es el sistema: un registro donde solo se agregan cosas. Por eso el tablero es una hoja con renglones: cada queja tiene a la izquierda la fecha (día y mes) y debajo de la categoría muestra su **folio**, que son los primeros caracteres de su hash. El estado aparece como un **sello** de oficina, un poco inclinado. Las hojas tienen una segunda hoja asomando detrás, para dar profundidad sin recurrir a sombras genéricas.

La paleta es solo azul, verde, amarillo y blanco. El azul se usa para la estructura y las acciones principales; el verde, para lo resuelto o íntegro; el amarillo, para lo que está en proceso o necesita atención, y como acento en el encabezado. El fondo es blanco hueso, como papel. Cada queja lleva una marca lateral del color de su estado, y cada categoría tiene su propio ícono de línea con su color. Los íconos son SVG propios (`public/js/iconos.js`).

El logo es un árbol (`public/iconos/arbol.svg`): la comunidad que crece desde sus raíces. A partir de ese mismo SVG se generaron los íconos de la app.

Las tipografías van incluidas en `public/fuentes` para que funcionen sin conexión. **Archivo**, en su versión variable, se usa con ancho condensado para títulos, sellos y cifras. **Atkinson Hyperlegible** se usa para el texto: la diseñó el Braille Institute para personas con baja visión, lo que encaja con RNF-03, porque buena parte de los copropietarios son adultos mayores, y por eso su cero lleva una marca que lo distingue de la O. **IBM Plex Mono** se usa para hashes y folios. Las tres tienen licencia libre SIL OFL; sus archivos de licencia están en la misma carpeta.

Todo el texto que escribe un usuario se escapa antes de mostrarse (función `esc`), para evitar inyección de HTML.

### Paso 12. Pruebas y scripts

`test/red.test.js` levanta cuatro nodos reales en memoria y comprueba 13 escenarios: replicación, encadenamiento, RF-04, estados que solo avanzan, permisos por rol, trabajo sin conexión sin duplicados, detección de edición directa, detección de edición con hash recalculado, restauración de registros borrados, cobertura de auditoría, USB y rechazo de nodos con otra clave. Los scripts de `scripts/` sirven para la demo manual.

---

## 5. Cómo se ejecuta, paso a paso

Todos los comandos se escriben en una terminal (PowerShell o CMD en Windows, Terminal en Mac o Linux) **dentro de la carpeta del proyecto**.

### 5.0 Forma principal: con Docker (sin instalar Node.js)

Es la forma que usamos para la entrega, porque no exige comprar equipos: los tres nodos corren como contenedores en un solo computador.

1. Instale **Docker Desktop** (Windows o Mac, gratuito para uso educativo; en Windows activa WSL2 durante la instalación) o Docker Engine en Linux. Conviene tener 4 GB de RAM libres.
2. En la carpeta del proyecto copie `.env.example` como `.env` y ponga en `HOST_IP` la IP del computador en el wifi (`ipconfig` en Windows). Es la dirección que usará el código QR para los celulares. Cambie también `CLAVE_RED` y `JWT_SECRETO`.
3. Levante la red:
   ```bash
   docker compose up -d --build
   docker compose ps          # los tres deben quedar "healthy"
   ```
4. Cargue datos de ejemplo desde dentro de un contenedor:
   ```bash
   docker exec veeduria-nodo1 node scripts/datos-demo.js http://nodo1:3001 http://nodo2:3002
   ```
5. Abra `http://localhost:3001` (administración), `3002` (vecino) o `3003` (consejo). Desde un celular en el mismo wifi use `http://IP-DEL-PC:3001` o el QR de la pantalla Nodos. Si Windows pregunta por el firewall, permita el acceso en redes privadas.

Comandos útiles para la demostración:

```bash
docker stop veeduria-nodo3       # simula la caída de un nodo
docker start veeduria-nodo3      # vuelve y se pone al día solo
docker compose logs -f nodo3     # ver la sincronización en vivo
docker exec veeduria-nodo2 node scripts/manipular.js --config nodos/docker/nodo2.json --modo editar
docker compose down              # apaga todo (los datos quedan en los volúmenes)
docker compose down -v           # apaga y borra los datos
```

Con Node.js instalado en el computador también se puede correr `npm run docker:prueba`, que apaga y prende contenedores, altera una base y deja los tiempos medidos en `resultados/docker.json`.

**Un nodo por portátil (fuera del alcance de la entrega).** Queda como base para el trabajo futuro. Si cada integrante quiere correr un nodo en su propio equipo (todos en el mismo wifi), use `docker-compose.portatil.yml`. Cada uno pone en su `.env` el nombre del nodo, su IP en `HOST_IP`, las direcciones de los otros en `PEERS` separadas por comas y `SEMILLA=true` solo en uno de los equipos, y ejecuta `docker compose -f docker-compose.portatil.yml up -d --build`.

**Desde los celulares** la aplicación funciona por HTTP para registrar y consultar quejas. El modo sin conexión y la instalación como app necesitan HTTPS (sección 5.10); en el navegador del propio PC (`localhost`) sí funcionan sin configurar nada.

Las secciones que siguen explican la forma sin Docker, con Node.js directamente, que es la que usan las pruebas automáticas.

### 5.1 Instalación

1. Descomprima el zip. Va a quedar la carpeta `veeduria-p2p`.
2. Abra una terminal en esa carpeta. En Windows: abra la carpeta en el Explorador, escriba `cmd` en la barra de dirección y presione Enter.
3. Verifique la versión de Node:
   ```bash
   node -v
   ```
   Debe ser `v22.13.0` o superior.
4. Las dependencias ya vienen en `node_modules`. Si por algún motivo falta esa carpeta, o si la borró, ejecute:
   ```bash
   npm install
   ```

### 5.2 Ejecutar un solo nodo

```bash
npm start
```

La terminal muestra algo así:

```
Nodo Administración  (id 0226f66e-...)
  config:     nodos/nodo1.json
  base:       .../datos/nodo1.db
  local:      http://localhost:3001
  red LAN:    http://192.168.1.10:3001
  peers:      http://localhost:3002, http://localhost:3003
  semilla:    5 usuarios de prueba creados
```

Abra **http://localhost:3001** en el navegador. Los mensajes "sin conexión (ECONNREFUSED)" son normales: los nodos 2 y 3 todavía no están encendidos, y el nodo 1 sigue funcionando igual (eso también es tolerancia a fallos). Para detener el nodo, presione `Ctrl + C`.

Usuarios de prueba (también aparecen en la pantalla de ingreso, en "Usuarios de prueba"):

| Correo | Contraseña | Rol |
|---|---|---|
| admin@conjunto.co | admin123 | Administración |
| consejo@conjunto.co | consejo123 | Consejo de administración (auditor) |
| laura@conjunto.co | vecino123 | Vecina, Torre 1 - Apto 302 |
| carlos@conjunto.co | vecino123 | Vecino, Torre 2 - Apto 504 |
| diana@conjunto.co | vecino123 | Vecina, Torre 3 - Apto 101 |

### 5.3 Ejecutar la red completa (3 nodos en el mismo PC)

```bash
npm run red
```

Se levantan los tres nodos, cada uno con su color en la terminal:

- http://localhost:3001: Nodo Administración
- http://localhost:3002: Nodo Vecino Torre 1
- http://localhost:3003: Nodo Consejo de administración

Los usuarios se crean en el nodo 1 y llegan a los otros en la primera sincronización (unos segundos después de arrancar). Si prefiere ver cada nodo en una terminal aparte, abra tres terminales y ejecute `npm run nodo1`, `npm run nodo2` y `npm run nodo3`.

### 5.4 Cargar datos de ejemplo

Con la red encendida, abra **otra** terminal en la misma carpeta y ejecute:

```bash
npm run demo
```

Crea 7 quejas repartidas entre el nodo 1 y el nodo 2, con fechas de los últimos días. Luego la administración atiende algunas, los vecinos comentan y apoyan, y todo se sincroniza. Con eso los reportes ya muestran tiempos de respuesta reales.

### 5.5 Recorrido por roles

1. **Vecino.** En http://localhost:3002 entre como `laura@conjunto.co`. Pulse "Nueva queja", llene el formulario, adjunte una foto y registre. En el detalle se ve el hash y la cadena.
2. **Replicación.** En otra ventana (o en una ventana de incógnito, para tener otra sesión) abra http://localhost:3001 como `admin@conjunto.co`. Espere hasta 30 segundos o pulse ⟳: la queja de Laura aparece en el nodo de la administración.
3. **Administración.** Abra la queja, pulse "Marcar como vista" o "Pasar a en proceso" y escriba una respuesta. Fíjese en que no hay ningún botón para borrar o editar.
4. **Consejo.** En http://localhost:3003 entre como `consejo@conjunto.co`. En Reportes verá los tiempos de respuesta y la cobertura, y en Integridad que todo está íntegro. Esto se hace desde otro nodo, sin depender de la administración.

### 5.6 Probar el modo sin conexión (RNF-01)

**En el computador:**
1. Entre como vecino y abra el tablero una vez, para que quede la copia local.
2. Presione F12 para abrir las herramientas de desarrollador, vaya a **Network** (Red) y marque **Offline**.
3. Recargue la página: la app abre igual, desde el service worker, y muestra la copia guardada.
4. Registre una queja: aparece con el sello "En cola" y el indicador de arriba dice "sin conexión · 1 en cola".
5. Quite la marca de Offline: en unos segundos la queja se envía sola, aparece el aviso "Se enviaron 1 operación(es)…" y ya no se duplica.

**Un nodo completo sin conexión:** detenga el nodo 3 con `Ctrl + C` (si usa `npm run red`, mejor corra los nodos en terminales separadas para esto). Registre quejas en los nodos 1 y 2, vuelva a encender el nodo 3 con `npm run nodo3` y verá en su terminal "recibidos N": recupera todo lo que se perdió.

### 5.7 Probar la detección de manipulación (métrica de integridad)

Este es el punto más fuerte para la sustentación. Con la red encendida y los datos de ejemplo cargados, en otra terminal:

```bash
npm run manipular -- --config nodos/nodo2.json --modo editar
```

El script abre directamente el archivo SQLite del nodo 2, borra los triggers de protección, cambia la descripción de una queja **sin pasar por la aplicación**, y vuelve a crear los triggers para no dejar rastro. Después:

1. Entre al nodo 2 (http://localhost:3002) como `consejo@conjunto.co` y vaya a **Integridad**: sale "Se detectaron posibles manipulaciones" con el registro marcado como **hash alterado** y el porcentaje verificable por debajo de 100%.
2. Pulse ⟳ o espere el ciclo de sincronización. En **Integridad** de los nodos 1 y 3 aparece el conflicto **versión distinta entre nodos**, y en ellos la queja sigue con su texto original: la alteración **no se propagó**.

Los otros modos del script son:

```bash
npm run manipular -- --config nodos/nodo1.json --modo rehash
npm run manipular -- --config nodos/nodo1.json --modo estado
npm run manipular -- --config nodos/nodo1.json --modo borrar
```

- **rehash:** cambia el título y **recalcula el hash** para que localmente parezca válido. El nodo alterado no lo nota, pero los demás sí, al comparar huellas en la siguiente sincronización. Esto demuestra por qué la replicación es necesaria y no basta con el hash.
- **estado:** borra el último cambio de estado, como si la administración quisiera esconder que una queja ya había sido vista. En la siguiente sincronización los otros nodos se lo devuelven.
- **borrar:** elimina una queja con todo su historial, comentarios y apoyos. En la siguiente sincronización los demás nodos la restauran y queda anotado como **registro restaurado**. Exactamente lo que el documento quería evitar: que la administración borre algo "sin que nadie se dé cuenta".

### 5.8 Pruebas automáticas

```bash
npm test
```

Resultado esperado:

```
ok 1 - los usuarios creados en el nodo A llegan a B y C por sincronización
ok 2 - RF-01/RF-03: una queja creada en B se replica a A y C con el mismo hash
...
ok 13 - Un nodo con otra clave de red es rechazado
# pass 13
# fail 0
```

Las pruebas usan bases temporales y no tocan las de `datos/`. Sirven como evidencia de las métricas 2, 3 y 4 de la sección 8.

### 5.8b Pruebas de carga y de tolerancia a fallos

```bash
npm run carga      # concurrencia y rendimiento: 300 quejas, 1000 consultas, sincronización, nodo nuevo
npm run carga -- 600   # con otro número de quejas
npm run fallos     # caída de nodos, peer colgado (timeout y circuit breaker), edición y borrado forzados, intruso
```

Cada script levanta sus propios nodos en una carpeta temporal (puertos 4101-4104 y 4201-4203), así que no toca los datos de `datos/`. Los resultados quedan en la carpeta `resultados/` en formato JSON.

### 5.8c Contenedores (opcional)

El proyecto trae `Dockerfile` y `docker-compose.yml` con los tres nodos (configuraciones en `nodos/docker/`):

```bash
docker compose up --build
```

### 5.9 Varios computadores en la misma red (despliegue real)

1. Conecte todos los equipos al mismo Wi-Fi o a la misma red del conjunto.
2. En cada equipo copie la carpeta del proyecto.
3. Averigüe la IP de cada equipo. Al encender un nodo, la terminal la muestra en la línea `red LAN`. También se puede ver con `ipconfig` en Windows o `ip a` en Linux.
4. Edite el archivo de configuración de cada equipo para que `peers` tenga las IPs de los demás. Por ejemplo, en el PC de la administración (192.168.1.10):
   ```json
   "urlPublica": "http://192.168.1.10:3001",
   "peers": ["http://192.168.1.11:3002", "http://192.168.1.12:3003"]
   ```
   Todos deben tener la **misma** `claveRed` y el **mismo** `jwtSecreto`. Cámbielos por valores propios y largos. Solo **un** nodo debe tener `"semilla": true`.
5. Arranque cada nodo con su configuración, por ejemplo `npm run nodo1` en el PC de la administración y `npm run nodo2` en el del vecino.
6. Cuando Windows pregunte, **permita** el acceso de Node.js en el firewall para redes privadas.

También se pueden agregar pares sin editar archivos: entre como administración, vaya a **Nodos** y use "Agregar par".

### 5.10 Usar la app desde celulares (QR y HTTPS)

Desde un celular en la misma red ya se puede abrir `http://IP-del-PC:3001`, o escanear el QR que aparece en **Nodos**, y usar la app normalmente. Pero el navegador del celular solo activa el service worker (modo sin conexión), la instalación como app y la ubicación GPS cuando la página viene por **HTTPS**. Así se configura HTTPS en la red local con mkcert:

1. Instale mkcert en el PC del nodo:
   - Windows: `choco install mkcert`, o descargue el ejecutable desde https://github.com/FiloSottile/mkcert/releases
   - Mac: `brew install mkcert`
2. Cree la autoridad certificadora local:
   ```bash
   mkcert -install
   ```
3. Genere el certificado para la IP del PC (cambie la IP por la suya):
   ```bash
   mkcert -cert-file certs/nodo1.pem -key-file certs/nodo1-key.pem localhost 127.0.0.1 192.168.1.10
   ```
4. En `nodos/nodo1.json` ponga:
   ```json
   "urlPublica": "https://192.168.1.10:3001",
   "https": { "cert": "certs/nodo1.pem", "key": "certs/nodo1-key.pem" }
   ```
   Y en los `peers` de todos los nodos use `https://` para los nodos que tengan certificado.
5. Instale la autoridad en el celular. El archivo es `rootCA.pem`, que está en la carpeta que muestra el comando `mkcert -CAROOT`. Envíelo al celular:
   - **Android:** Ajustes → Seguridad → Cifrado y credenciales → Instalar un certificado → Certificado de CA.
   - **iPhone:** abra el archivo para instalar el perfil, luego Ajustes → General → Información → Ajustes de confianza de certificados, y active la confianza.
6. Para que los **nodos** confíen entre sí por HTTPS, arranque cada nodo con la variable que apunta a esa autoridad:
   - Windows (PowerShell): `$env:NODE_EXTRA_CA_CERTS="C:\ruta\a\rootCA.pem"; npm run nodo1`
   - Mac/Linux: `NODE_EXTRA_CA_CERTS=/ruta/a/rootCA.pem npm run nodo1`
7. Escanee el QR de la vista **Nodos** con el celular. Ahora en el menú del navegador aparece "Instalar aplicación" o "Agregar a pantalla de inicio".

Esta configuración se hace una sola vez. Conviene dejarla lista desde temprano, antes de la semana de integración.

### 5.11 Empezar de cero

Detenga los nodos y ejecute:

```bash
npm run reiniciar
```

Esto borra las bases de `datos/`. La próxima vez que arranquen, los nodos se crean vacíos (el nodo 1 vuelve a crear los usuarios de prueba). En el navegador conviene cerrar sesión, porque la copia local queda guardada en el dispositivo.

---

## 6. Requerimientos del documento y dónde se cumplen

| Requerimiento | Cómo se cumple | Dónde |
|---|---|---|
| RF-01 Registrar queja con título, descripción, categoría, fotos y fecha | Formulario con hasta 3 fotos comprimidas, validación en el servidor | `public/js/app.js` (vistaNueva), `src/modelo.js` (crearQueja) |
| RF-02 Almacenar la queja localmente en el dispositivo | IndexedDB con copia del tablero, los detalles y la cola de pendientes | `public/js/almacen.js`, `public/js/api.js` |
| RF-03 Replicar a los demás nodos | Protocolo de resúmenes y huellas, ciclo automático y transitivo | `src/sync.js`, `src/app.js` |
| RF-04 Nadie elimina, solo se agregan estados | Sin rutas DELETE/PUT, triggers append-only, restauración desde pares | `src/rutas/quejas.js`, `src/db.js`, `src/sync.js` |
| RF-05 La administración responde y cambia estado con registro de quién y cuándo | historial_estado con responsable_id y fecha; respuesta como comentario de la administración | `src/modelo.js` (agregarEstado, comentar) |
| RF-06 Tablero con quejas, historial y estado | Tablero con filtros e historial verificable por queja | vistaTablero, vistaDetalle |
| RF-07 / RF-08 Auditoría y reporte agregado (consejo y asamblea) | Reporte calculado desde la BD, imprimible a PDF | `src/reportes.js`, vistaReportes |
| RF-09 Comentar y apoyar | Tablas comentario y apoyo con hash | `src/modelo.js` |
| RNF-01 Disponibilidad sin conexión | Service worker, copia local, cola de pendientes, nodos que reintentan | `public/sw.js`, `public/js/api.js`, `src/sync.js` |
| RNF-02 Integridad SHA-256 encadenada | hash + hash_anterior por nodo emisor; verificación y comparación entre nodos | `src/hash.js`, `src/integridad.js` |
| RNF-03 Usabilidad | Formularios simples, estados con color, interfaz para celular | `public/css/estilos.css` |
| RNF-04 Seguridad | bcrypt, JWT, roles por endpoint, clave de red, HTTPS opcional, escape de HTML | `src/auth.js`, `src/server.js` |
| RNF-05 Escalabilidad | Agregar nodos es agregar una URL; los ids UUID evitan colisiones | `src/rutas/nodos.js` |
| RNF-06 Portabilidad PWA | Manifest, íconos, service worker, acceso por QR | `public/manifest.webmanifest`, `/qr.png` |

Métricas de la sección 8:

| Métrica | Cómo se mide |
|---|---|
| Tiempo hasta la primera respuesta | Reportes → "Primera respuesta (promedio)" y tabla de tiempos de gestión |
| % de la cadena verificable tras sincronizar | Integridad → porcentaje, y `npm run manipular` + pruebas 8 a 10 |
| Quejas offline sincronizadas sin pérdida ni duplicados | Paso 5.6 y prueba 7 de `npm test` |
| Cobertura de auditoría | Reportes → "Cobertura de auditoría" (debe dar 100%) y prueba 11 |

---

## 7. Decisiones y diferencias respecto al documento

Hay pocos cambios frente a lo documentado, y conviene reflejarlos en el documento final para que el código y el texto coincidan:

1. **Roles "consejo" y "asamblea" del endpoint `/reportes/agregado`.** El campo `usuario.rol` solo admite vecino, administrador y auditor, así que el consejo usa el rol **auditor**. Para la asamblea, el reporte se imprime o se guarda en PDF desde la vista de reportes. La administración también puede consultarlo.
2. **"Responder queja".** HistorialEstado no tiene un campo de respuesta, así que la administración responde con un **comentario**. En la app se muestra destacado como "Respuesta de la administración". Por eso `POST /quejas/{id}/comentarios` acepta vecino y administrador.
3. **Sincronización entre nodos con clave de red en lugar de JWT.** La tabla 7.2 pone como rol "administrador, vecino (nodo local)". Como quien llama es otro nodo y no una persona, se usa una clave compartida del conjunto. "Sincronizar ahora" sí lo pide una persona con su JWT.
4. **Tablas agregadas al modelo físico:** nodo, comentario, apoyo, foto, conflicto y meta. Todas salen del MER y del diagrama de clases.
5. **Endpoints agregados:** `/auth/yo`, `/estado`, `/integridad`, `/usuarios`, `/nodos` (GET y POST), `/nodos/sincronizar-ahora`, `/nodos/exportar` y `/nodos/importar`. La ruta de comentarios va en minúscula (`/comentarios`).
6. **Hash.** Se mantuvo la fórmula del documento para queja e historial. Las fotos, comentarios y apoyos tienen su propio hash. La comparación entre nodos usa una huella del contenido completo de cada registro, así que cualquier campo alterado se detecta en la sincronización, incluso los que no entran en la fórmula del documento.
7. **Ubicación.** Se guarda en `ubicacion_lat` y `ubicacion_lng` con el GPS del celular (opcional), y en el detalle se puede abrir en un mapa.

---

## 8. Solución de problemas

| Problema | Causa y solución |
|---|---|
| `Se necesita Node.js 22.13 o superior` o `Cannot find module 'node:sqlite'` | Actualice Node a la versión LTS desde nodejs.org |
| `EADDRINUSE` | El puerto está ocupado, probablemente por otro nodo que quedó abierto. Ciérrelo o cambie `puerto` en el JSON |
| "El usuario no existe en este nodo" | El nodo todavía no se sincronizó con el nodo 1. Espere 30 s o pulse ⟳ en el nodo 1 |
| En la terminal: `sin conexión (ECONNREFUSED)` | Ese par está apagado. Es normal; se reintenta solo |
| Desde otro PC o celular no carga | Revise el firewall (permitir Node.js en red privada), que estén en la misma red y que use la IP y no `localhost` |
| No aparece "Instalar app" en el celular o no funciona offline | Se necesita HTTPS (ver 5.10). Por HTTP solo funciona en `localhost` |
| `npm run demo` falla | La red no está encendida. Ejecute `npm run red` en otra terminal primero |
| La app muestra datos viejos después de reiniciar | Cierre sesión (⏻) para limpiar la copia local, o use una ventana de incógnito |
| Clave de red incorrecta (401) | Todos los nodos deben tener la misma `claveRed` |

---

## 9. Guion sugerido para la demo de la sustentación

Son unos 8 a 10 minutos. Antes de la presentación se ejecuta `npm run reiniciar`, luego se abren tres terminales con `npm run nodo1`, `npm run nodo2` y `npm run nodo3` (así se puede apagar un nodo sin apagar los demás) y en una cuarta terminal se ejecuta `npm run demo`.

1. **Arquitectura (1 min).** Mostrar las terminales de los tres nodos y explicar que cada uno tiene su propio SQLite y que no hay servidor central.
2. **Vecino (2 min).** Desde el celular o el nodo 2, registrar una queja con foto. Mostrar el hash y la cadena.
3. **Replicación (1 min).** Abrir el nodo 1 y mostrar que la queja llegó. Apagar el nodo 3 con Ctrl+C en su terminal, crear otra queja, volver a encenderlo con `npm run nodo3` y mostrar en su terminal "recibidos 1".
4. **Sin conexión (1 min).** Marcar Offline en las herramientas del navegador, registrar una queja, mostrar el "En cola", reconectar y ver que se envía sola.
5. **Administración (1 min).** Cambiar el estado, responder y mostrar que no existe la opción de borrar.
6. **Ataque (2 min).** Ejecutar `npm run manipular -- --config nodos/nodo1.json --modo borrar` y explicar que es la administración borrando una queja directamente en su base. Sincronizar y mostrar en Integridad que la queja volvió y que quedó la evidencia como "registro restaurado". Luego ejecutar `--modo rehash` y mostrar que, aunque se recalcule el hash, los otros nodos detectan la versión distinta.
7. **Consejo (1 min).** Abrir Reportes desde el nodo 3 y mostrar los tiempos de respuesta, la cobertura del 100% y la integridad. Cerrar con `npm test` en pantalla: 13 de 13.
