# NEXUM AI — Guía de ejecución del sistema

Esta guía describe, en orden, el procedimiento para poner en marcha NEXUM AI: preparación del entorno, base de datos MongoDB, configuración WiFi del guante desde el panel, arranque de los servicios, emparejamiento y uso de las tres modalidades de interacción.

---

## Contenido

1. [Arquitectura general](#1-arquitectura-general)
2. [Requisitos](#2-requisitos)
3. [Preparación inicial (una sola vez)](#3-preparación-inicial-una-sola-vez)
4. [Orden de arranque](#4-orden-de-arranque)
5. [Emparejamiento y calibración del guante](#5-emparejamiento-y-calibración-del-guante)
6. [Uso de las modalidades](#6-uso-de-las-modalidades)
7. [Base de datos MongoDB](#7-base-de-datos-mongodb)
8. [Navegación entre módulos](#8-navegación-entre-módulos)
9. [Apagado del sistema](#9-apagado-del-sistema)
10. [Solución de problemas](#10-solución-de-problemas)
11. [Referencia rápida](#11-referencia-rápida)

---

## 1. Arquitectura general

NEXUM AI se compone de cinco elementos que trabajan en conjunto: el guante con sensores (ESP32), el puente unificado en Python, el servidor web local, la base de datos MongoDB y los paneles que se ejecutan en el navegador.

```mermaid
flowchart LR
    subgraph HW["Hardware"]
        G["Guante ESP32<br/>5 sensores MPU + TCA"]
        CAM["Cámara web"]
    end

    subgraph PC["Computadora"]
        B["Puente unificado<br/>nexum_bridge.py"]
        H["Servidor web<br/>nexum_http.py :8090"]
        subgraph NAV["Navegador"]
            P0["Portal"]
            P1["Interacción híbrida<br/>teclado y cursor"]
            P2["Arquitecto 3D"]
            P3["Videojuego"]
        end
        OS["Sistema operativo<br/>teclado y mouse"]
        DB[("MongoDB :27017<br/>base nexum_ai")]
    end

    G <-->|"UDP 5005 / 5006<br/>WiFi 2.4 GHz"| B
    B <-->|"WebSocket 8765"| P1
    B -.->|"estado del sistema"| P0
    H -->|"HTTP"| NAV
    P1 -->|"modal Red WiFi"| B
    B -->|"UDP o USB serie"| G
    CAM --> P1
    CAM --> P2
    CAM --> P3
    B --> OS
    B -->|"sesiones e historial<br/>de la modalidad híbrida"| DB
    H <-->|"usuarios, sesiones,<br/>historial y escenas"| DB
```

El guante se utiliza desde el panel de **Interacción híbrida**, donde se configura la red WiFi, se calibra y se escribe. Los paneles de **Arquitecto 3D** y **Videojuego** se controlan con la cámara, mediante visión artificial que se ejecuta en el navegador.

| Componente | Archivo | Función |
|---|---|---|
| Firmware del guante | `modulo_teclado/hardware-firdware/ManuelAssistGlove/` | Lee la flexión de cada dedo, guarda la red WiFi en NVS y la envía por UDP |
| Puente unificado | `scripts/nexum_bridge.py` | Recibe los datos del guante, interpreta gestos, configura WiFi y distribuye a los paneles |
| Servidor web | `scripts/nexum_http.py` | Sirve el portal, los paneles y la API de autenticación, datos y red |
| Detección WiFi | `scripts/nexum_wifi.py` | Detecta la red de la PC, sugiere 2.4 GHz y envía credenciales por USB |
| Acceso a datos | `scripts/nexum_db.py` | Conexión a MongoDB, esquema, sesiones, historial y escenas |
| Esquema de la base | `project/bd/` | `nexum_ai_completo.js` (fuente), `nexum_ai_esquema.json` y `exportar_esquema.js` |
| Portal | `index.html` | Inicio de sesión y acceso a los módulos |
| Interacción híbrida | `modulo_teclado/laboratorio-web/` | Modal WiFi, escritura con el guante y cursor con la cámara |
| Arquitecto 3D | `modulo_arquitecto/panel/` | Edición de escenas tridimensionales mediante gestos |
| Videojuego | `modulo_game/panel/` | Control de juegos Neo Geo con cámara y guante |

---

## 2. Requisitos

### 2.1 Hardware

| Elemento | Especificación |
|---|---|
| Computadora | Windows 10/11 o Linux (Ubuntu 22.04/24.04), 8 GB de RAM como mínimo |
| Guante NEXUM | ESP32 con multiplexor TCA9548A y cinco sensores MPU |
| Cámara web | Integrada o USB, 720p recomendado |
| Red WiFi | Cualquier red de 2.4 GHz (la PC y el guante en la misma red) |
| Cable USB | Carga del firmware y, si hace falta, configuración WiFi desde el panel |

### 2.2 Software

| Herramienta | Versión | Uso |
|---|---|---|
| Python | 3.10 | Puente y servidor web |
| MongoDB Community Server | 7.0 o superior | Base de datos del sistema |
| Node.js | 18 o superior (opcional) | Solo para regenerar el esquema JSON si se modifica el script de la base |
| Navegador | Chrome o Edge actualizado | Paneles y visión por cámara |
| Arduino IDE o arduino-cli | 2.x / ESP32 core | Carga del firmware (una sola vez) |
| pyserial | incluido en `requirements.txt` | Configuración WiFi del guante por cable USB |

### 2.3 Conectividad

- La computadora y el guante deben estar conectados a la misma red WiFi. La red se configura desde el panel de interacción híbrida (sección 5.4); si no se configuró, el guante usa `ModoB`.
- El ESP32 solo funciona con redes de 2.4 GHz. Las redes de 5 GHz no son visibles para el guante.
- Los paneles descargan Three.js y MediaPipe desde CDN, por lo que la red debe tener acceso a Internet.

---

## 3. Preparación inicial (una sola vez)

Estos pasos se realizan solo la primera vez que se instala el sistema en una computadora.

```mermaid
flowchart TD
    A["Crear entorno virtual"] --> B["Instalar dependencias"]
    B --> M["Instalar MongoDB<br/>e inicializar la base"]
    M --> C["Cargar firmware al ESP32"]
    C --> D["Preparar el emulador web<br/>(solo modalidad Videojuego)"]
    D --> E["Sistema listo"]
```

### 3.1 Crear el entorno virtual e instalar dependencias

Abrir una terminal en la carpeta raíz del proyecto (`NEXUM_AI`) y ejecutar:

**PowerShell**

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

**Git Bash**

```bash
python -m venv .venv
source .venv/Scripts/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
```

**Linux**

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
```

### 3.2 Instalar MongoDB e inicializar la base

El sistema guarda los usuarios, las sesiones, el historial de comandos y las escenas en MongoDB. El servicio debe quedar escuchando en `127.0.0.1:27017`.

**Windows**

```powershell
winget install --id MongoDB.Server --exact
winget install --id MongoDB.Shell --exact
```

El instalador registra MongoDB como servicio de Windows y lo deja iniciado. Se puede comprobar con `sc query MongoDB`.

**Linux (Ubuntu 22.04 / 24.04)**

```bash
sudo apt-get install -y gnupg curl
curl -fsSL https://www.mongodb.org/static/pgp/server-8.0.asc | \
  sudo gpg -o /usr/share/keyrings/mongodb-server-8.0.gpg --dearmor
echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg ] https://repo.mongodb.org/apt/ubuntu $(lsb_release -cs)/mongodb-org/8.0 multiverse" | \
  sudo tee /etc/apt/sources.list.d/mongodb-org-8.0.list
sudo apt-get update
sudo apt-get install -y mongodb-org
sudo systemctl enable --now mongod
systemctl status mongod
```

**Inicializar la base (ambos sistemas)**

Con el entorno virtual activo, desde la raíz del proyecto:

```bash
python scripts/nexum_db_init.py
```

El comando crea la base `nexum_ai` con sus 31 colecciones, validadores e índices. También carga los catálogos iniciales (gestos, comandos, reglas, configuraciones y el modelo entrenado) y crea las cuentas de prueba. Puede ejecutarse varias veces sin duplicar datos.

| Opción | Efecto |
|---|---|
| `python scripts/nexum_db_init.py --estado` | Muestra la conexión y la cantidad de documentos por colección |
| `python scripts/nexum_db_init.py --reset` | Elimina la base y la vuelve a crear desde cero |

### 3.3 Cargar el firmware al guante

El firmware se carga una sola vez. A partir de entonces la red WiFi se cambia desde el panel, sin volver a abrir Arduino.

1. Abrir Arduino IDE.
2. Abrir el archivo `modulo_teclado/hardware-firdware/ManuelAssistGlove/ManuelAssistGlove.ino`.
3. Seleccionar la placa **ESP32 Dev Module** y el puerto COM correspondiente.
4. Presionar **Subir** y esperar el mensaje de carga completada.
5. Desconectar el cable USB y alimentar el guante con su batería.

También se puede cargar desde la terminal con `arduino-cli`, desde la carpeta del firmware:

```bash
arduino-cli compile --upload -p COM3 --fqbn esp32:esp32:esp32 .
```

Reemplazar `COM3` por el puerto del guante (`/dev/ttyUSB0` en Linux).

### 3.4 Preparar el emulador web (modalidad Videojuego)

Este paso solo es necesario si las carpetas `modulo_game/panel/ejs/cores/` o `modulo_game/panel/web-roms/` no existen.

```bash
python modulo_game/scripts/download_ejs.py
python modulo_game/scripts/prepare_web_roms.py
```

El primer comando descarga el emulador y sus núcleos. El segundo convierte las ROM ubicadas en `modulo_game/gameNeogeo/NeoRAGEx 5.2a/ROMs/` al formato que usa el navegador.

---

## 4. Orden de arranque

Cada vez que se utilice el sistema, el arranque debe seguir este orden. Respetarlo garantiza que el guante encuentre al puente y que los paneles se conecten correctamente.

```mermaid
flowchart TD
    S0["0. Verificar que MongoDB esté activo"] --> S1["1. Conectar la PC a WiFi 2.4 GHz"]
    S1 --> S2["2. Iniciar el servidor web"]
    S2 --> S3["3. Iniciar el puente unificado"]
    S3 --> S4["4. Encender el guante"]
    S4 --> S5["5. Abrir el portal en el navegador"]
    S5 --> S6["6. Iniciar sesión"]
    S6 --> S7["7. Elegir la modalidad"]
    S7 --> S8["8. Configurar WiFi si hace falta,<br/>calibrar e iniciar"]
```

### Paso 0. Verificar MongoDB

MongoDB se inicia solo con el sistema operativo. Si se detuvo, iniciarlo con `net start MongoDB` en Windows o `sudo systemctl start mongod` en Linux.

### Paso 1. Conectar la computadora a la red

Conectar la computadora a la misma red WiFi de 2.4 GHz a la que se conecta el guante. Si el guante debe usar otra red, se configura desde el panel de interacción híbrida (sección 5.4).

### Paso 2. Iniciar el servidor web

En una primera terminal, desde la raíz del proyecto:

```bash
.venv/Scripts/python.exe -u scripts/nexum_http.py
```

Resultado esperado:

```text
[DB] MongoDB lista: nexum_ai en mongodb://127.0.0.1:27017
NEXUM HTTP http://127.0.0.1:8090/  (COOP/COEP solo emulador)
MongoDB mongodb://127.0.0.1:27017/nexum_ai: conectada
```

### Paso 3. Iniciar el puente unificado

En una segunda terminal, desde la raíz del proyecto:

```bash
.venv/Scripts/python.exe -u scripts/nexum_bridge.py
```

Resultado esperado:

```text
NEXUM Bridge unificado
UDP guante: 5005
Laboratorio: ws://127.0.0.1:8765
Juego:       ws://127.0.0.1:8766
Arquitecto:  ws://127.0.0.1:8767
NeoRageX: ...
MongoDB:     mongodb://127.0.0.1:27017/nexum_ai
[UDP] escuchando 0.0.0.0:5005
[UDP] buscar ESP32 (bridge_start, hard=True)
```

> Ambas terminales deben permanecer abiertas mientras se use el sistema. Solo puede haber un puente en ejecución, porque el puerto UDP 5005 es exclusivo.

### Paso 4. Encender el guante

Encender el guante. En pocos segundos se conecta a la red y saluda al puente. En la terminal del puente aparecen estas líneas:

```text
[UDP RX] 192.168.x.x -> MA_HELLO,...
[UDP RX] 192.168.x.x -> SYS:PC_CONECTADA
[GLOVE] guante enlazado: 192.168.x.x
```

### Paso 5. Abrir el portal

Abrir el navegador en la siguiente dirección:

```text
http://127.0.0.1:8090/
```

> Se debe usar siempre esta dirección. Si se abren los archivos HTML con doble clic, los paneles no podrán acceder a la cámara ni al puente.

### Paso 6. Iniciar sesión

Presionar **Iniciar sesion** en la esquina superior. La primera vez, crear un usuario en la pestaña **Crear cuenta**. Las cuentas se guardan en la colección `usuarios` de MongoDB, con la contraseña protegida mediante SHA-256 con sal. Las cuentas de prueba son `samuel@gmail.com` y `atzel@nexum.ai`, ambas con la contraseña `1234`.

El portal muestra un indicador de estado que confirma que el servidor, el puente, el guante y la cámara están disponibles.

### Paso 7. Elegir la modalidad

Desde el portal, seleccionar una de las tres modalidades: **Interacción**, **Arquitecto 3D** o **Videojuego**.

### Paso 8. Configurar WiFi, calibrar e iniciar

Al abrir **Interacción híbrida**, aparece el modal **Red WiFi**: la red y la contraseña de la PC se completan solas; basta con revisarlas y pulsar **Configurar guante** (sección 5.4). Si el guante ya está enlazado, el modal se cierra solo. Después, calibrar e iniciar como se indica en la sección 5. Las modalidades **Arquitecto 3D** y **Videojuego** solo requieren activar la cámara (sección 6).

---

## 5. Emparejamiento y calibración del guante

### 5.1 Secuencia de emparejamiento

El emparejamiento ocurre automáticamente al encender el guante con el puente ya en ejecución.

```mermaid
sequenceDiagram
    participant G as Guante ESP32
    participant B as Puente unificado
    participant P as Panel web

    B->>G: CMD:PING (difusión en la red)
    G->>B: MA_HELLO,ip,mano
    B->>G: MA_PC,ip_de_la_pc
    G->>B: SYS:PC_CONECTADA
    B->>P: connected (guante enlazado)
    P->>B: calibrate
    B->>G: CMD:CALIBRATE
    G->>B: CAL:1/5 ... CAL:5/5
    G->>B: SYS:CALIBRACION_OK
    P->>B: start
    B->>G: CMD:START_STREAM y CMD:MODE
    G->>B: SYS:STREAM_ACTIVO
    loop Durante el uso
        G->>B: dedo:activo / dedo:reposo
        B->>P: finger, preview, confirm
    end
```

### 5.2 Calibración

1. Abrir el panel de **Interacción** y presionar **Conectar puente** si el panel no lo hizo automáticamente.
2. Verificar que el indicador de conexión muestre el guante como enlazado.
3. Presionar **Calibrar**.
4. Mantener la mano relajada y extendida mientras la barra avanza de 0 % a 100 %.
5. Al llegar al 100 %, el guante queda calibrado y no es necesario repetir el proceso mientras siga encendido.

### 5.3 Inicio de la transmisión

Presionar **Iniciar**. A partir de ese momento, cada flexión de un dedo se refleja en el panel y se convierte en una acción.

| Botón | Efecto |
|---|---|
| **Conectar puente** | Establece la conexión entre el panel y el puente |
| **Calibrar** | Registra la posición de reposo de cada dedo |
| **Iniciar** | Activa el envío continuo de datos desde el guante |
| **Pausar** | Detiene el envío sin desconectar el guante |
| **Cerrar** | Desconecta el guante del puente |

### 5.4 Configurar la red WiFi del guante desde el panel

Al entrar al panel de interacción híbrida aparece el modal **Red WiFi**. También se abre con el botón **Red WiFi del guante**. Desde ahí se configura la red del guante sin tocar Arduino. Si el guante ya está enlazado al entrar, el modal avisa y se cierra solo.

> El guante y esta computadora deben estar conectados a la misma red WiFi, y esa red debe ser de 2.4 GHz.

**Pasos**

1. El modal coloca automáticamente el nombre de la red de la PC. Si la PC está en 5 GHz (por ejemplo `MiCasa-5G`), sugiere la red 2.4 GHz del mismo router (`MiCasa`). El campo se puede editar.
2. La contraseña se completa sola si Windows o Linux la tienen guardada para esa red; también se puede editar o revelar con **Ver**.
3. Presionar **Configurar guante**. El modal muestra cuatro pasos (enviar, guardar, conectar a la red, enlazar con la PC) y se cierra solo cuando el guante queda enlazado.

El puente elige el camino automáticamente:

| Estado del guante | Cómo recibe la red |
|---|---|
| Enlazado por WiFi | Por UDP (`CMD:WIFI`) |
| Conectado por cable USB | Por el puerto serie (requiere `pyserial`); el panel informa si el guante logró conectarse o si la contraseña fue rechazada |

```mermaid
sequenceDiagram
    participant P as Panel
    participant B as Puente
    participant G as Guante ESP32
    P->>B: wifi_config (red y contraseña)
    B->>G: CMD:WIFI por UDP o WIFI: por USB
    G->>G: Guarda en memoria NVS
    G-->>B: SYS:WIFI_GUARDADA
    G->>G: Reinicia y se conecta a la nueva red
    G-->>B: SYS:WIFI_OK,<ip> o SYS:WIFI_ERROR
    G-->>B: MA_HELLO (enlace con la PC)
    B-->>P: Guante enlazado
```

**Si el guante no aparece**

La forma más simple es conectarlo por cable USB y presionar **Configurar guante**. Sin cable, cuando el guante no logra conectarse a su red crea su propia red de configuración:

| Dato | Valor |
|---|---|
| Red | `NEXUM-GUANTE` |
| Contraseña | `nexum1234` |
| IP del guante | `192.168.50.1` |

1. Conectar la PC a `NEXUM-GUANTE` y esperar a que el guante aparezca enlazado en el modal.
2. Escribir la red definitiva y presionar **Configurar guante**.
3. Volver a conectar la PC a esa red.

La red queda guardada en el guante aunque se apague. Si no se configuró ninguna, usa `ModoB`.

---

## 6. Uso de las modalidades

### 6.1 Interacción híbrida (teclado y cursor)

El panel funciona en tres modos: letras (**ABC**), números (**123**) y cursor (**CUR**).

```mermaid
stateDiagram-v2
    direction LR
    ABC: ABC (letras)
    NUM: 123 (números)
    CUR: CUR (cursor por cámara)
    RUEDA: Rueda de modos

    ABC --> RUEDA: acorde de 4 o más dedos
    NUM --> RUEDA: acorde de 4 o más dedos
    CUR --> RUEDA: acorde de 4 o más dedos
    RUEDA --> ABC: confirmación
    RUEDA --> NUM: confirmación
    RUEDA --> CUR: confirmación
```

**Escritura con el guante (ABC y 123)**

Cada dedo tiene asignado un grupo de caracteres. Los toques repetidos con el mismo dedo recorren el grupo, y el carácter se escribe automáticamente 2.5 segundos después del último toque.

| Dedo | Letras (ABC) | Números (123) |
|---|---|---|
| Pulgar | a b c d e f | 1 2 + |
| Índice | g h i j k l | 3 4 - |
| Medio | m n ñ o p | 5 6 * |
| Anular | q r s t u | 7 8 / |
| Meñique | v w x y z | 9 0 . ; |

**Cambio de modo**

1. Levantar cuatro o más dedos casi a la vez para abrir la rueda de modos.
2. Bajar la mano. Cada toque posterior avanza a la siguiente opción.
3. La opción seleccionada se confirma sola tras dos segundos sin tocar, o al repetir el acorde de cuatro dedos.

**Modo cursor (CUR)**

En este modo, el puntero del sistema se controla con la cámara.

| Gesto ante la cámara | Acción |
|---|---|
| Mover la mano derecha | Desplazar el puntero |
| Levantar solo el meñique | Clic izquierdo |
| Levantar solo el pulgar | Clic derecho |
| Mano izquierda completamente abierta, sostenida | Tecla Windows |
| Puño | Borrar; si se mantiene, borra de forma continua |

> Solo un panel puede usar la cámara a la vez. Al activarla en un módulo, los demás la liberan automáticamente.

### 6.2 Arquitecto 3D

1. Presionar **Activar camara**.
2. Colocarse frente a la cámara, con ambas manos visibles.
3. Usar los gestos para seleccionar, mover, rotar, escalar y duplicar módulos de la escena.
4. Alternar entre los modos **Edicion**, **Navegacion** y **Vista previa** según la tarea.
5. Usar **Guardar**, **Cargar**, **Exportar JSON** e **Importar JSON** para conservar el trabajo. **Guardar** almacena la maqueta en MongoDB (colección `arquitecto_escenas`) y también en el navegador; **Cargar** recupera la última maqueta guardada en la base.

### 6.3 Videojuego

1. Elegir un juego del catálogo, filtrando por **Acción**, **Pelea** o **Naves** si se desea, y presionar **Jugar**.
2. Presionar **Activar cámara**.
3. Colocarse frente a la cámara con ambas manos visibles.

| Gesto ante la cámara | Acción en el juego |
|---|---|
| Índice izquierdo hacia un costado | Movimiento izquierda o derecha |
| Puño de la mano izquierda | Start |
| Mano derecha abierta | Disparo |
| Puño de la mano derecha | Salto |
| Mano derecha apuntando hacia abajo | Agacharse |

El panel también ofrece botones en pantalla para las direcciones y las acciones.

---

## 7. Base de datos MongoDB

### 7.1 Qué se registra

Cada modalidad abre una sesión al empezar a usarse y la cierra al terminar. Durante la sesión, cada comando reconocido se guarda en el historial junto con el gesto que lo originó.

```mermaid
flowchart LR
    subgraph HIB["Interacción híbrida (puente)"]
        H1["Iniciar transmisión"] --> HS[("hibrida_sesiones")]
        H2["Letra, número, clic,<br/>cambio de modo"] --> HH[("hibrida_historial_comandos")]
        H3["Modo y última tecla"] --> HT[("hibrida_teclado_virtual")]
        H4["Emparejamiento<br/>y calibración"] --> HG[("configuracion_guante")]
    end
    subgraph ARQ["Arquitecto 3D (panel)"]
        A1["Abrir el panel"] --> AS[("arquitecto_sesiones")]
        A2["Seleccionar, mover,<br/>rotar, orbitar"] --> AH[("arquitecto_historial_comandos")]
        A3["Guardar maqueta"] --> AE[("arquitecto_escenas")]
    end
    subgraph VID["Videojuego (panel)"]
        V1["Jugar / Detener"] --> VS[("videojuego_sesiones")]
        V2["Disparo, salto,<br/>movimiento"] --> VH[("videojuego_historial_comandos")]
        V3["Fin de partida"] --> VP[("videojuego_perfil_jugador")]
    end
    P["Portal"] --> U[("usuarios")]
```

| Momento | Modalidad | Colección | Contenido |
|---|---|---|---|
| Iniciar sesión o crear cuenta | Portal | `usuarios` | Nombre, correo, sal y hash de la contraseña |
| **Iniciar** / **Pausar** en el panel | Interacción híbrida | `hibrida_sesiones` | Inicio, fin, guante, cámara y teclado virtual de la sesión |
| Cada carácter escrito | Interacción híbrida | `hibrida_historial_comandos` | Dedo, cantidad de toques, mano, modo y tecla escrita |
| Cada clic o tecla por cámara | Interacción híbrida | `hibrida_historial_comandos` | Gesto de la cámara y acción ejecutada |
| Abrir y cerrar el panel | Arquitecto 3D | `arquitecto_sesiones` | Inicio, fin y modelo clasificador utilizado |
| Cada cambio de comando | Arquitecto 3D | `arquitecto_historial_comandos` | Comando, gesto y módulo afectado |
| **Guardar** | Arquitecto 3D | `arquitecto_escenas` | Módulos con posición, rotación y escala, y la cámara |
| **Jugar** / **Detener** | Videojuego | `videojuego_sesiones` | Juego, inicio, fin y puntuación |
| Cada botón presionado | Videojuego | `videojuego_historial_comandos` | Botón y gesto o fuente (cámara, teclado o pantalla) |
| Fin de partida con usuario | Videojuego | `videojuego_perfil_jugador` | Acciones acumuladas por comando y partidas jugadas |

El puente escribe en segundo plano: si MongoDB no responde, el guante sigue funcionando con normalidad y la terminal muestra un aviso.

### 7.2 Catálogos iniciales

`nexum_db_init.py` carga la configuración base del sistema, que el resto de los registros referencia por código.

| Colección | Contenido inicial |
|---|---|
| `modalidades_aplicacion` | Las tres modalidades y sus gestos permitidos |
| `catalogo_gestos` | Gestos del guante, del cursor, del arquitecto y del videojuego |
| `hibrida_comandos`, `arquitecto_comandos`, `videojuego_comandos` | Comandos de cada modalidad |
| `*_reglas_semanticas` | Relación entre cada gesto y el comando que dispara |
| `configuracion_guante` | Guante `GUANTE-NEXUM-01`: TCA9548A, cinco MPU-6050 en los canales 2 a 6, UDP 5006 |
| `configuracion_vision` | Cámara `CAMARA-WEB-01` con MediaPipe Hand Landmarker |
| `configuracion_sistema`, `*_configuracion` | Parámetros generales y de cada modalidad |
| `modelos_entrenados` | Clasificador `arch_vision_pos3_v1` del arquitecto |

### 7.3 Configuración de la conexión

La conexión se configura con variables de entorno. Si no se definen, se usan los valores por defecto.

| Variable | Valor por defecto | Uso |
|---|---|---|
| `NEXUM_MONGO_URI` | `mongodb://127.0.0.1:27017` | Dirección del servidor MongoDB |
| `NEXUM_MONGO_DB` | `nexum_ai` | Nombre de la base |

Ejemplo en Linux con un servidor remoto que requiere usuario:

```bash
export NEXUM_MONGO_URI="mongodb://usuario:clave@192.168.1.20:27017/?authSource=admin"
python scripts/nexum_http.py
```

Para revisar los datos se puede usar `mongosh`:

```bash
mongosh nexum_ai --eval "db.hibrida_historial_comandos.find().sort({fechaEjecucion:-1}).limit(5)"
```

### 7.4 Modificar el esquema

El script `project/bd/nexum_ai_completo.js` es la definición oficial de la base. El sistema lee una copia en JSON (`nexum_ai_esquema.json`) para no depender de `mongosh`. Después de modificar el script:

```bash
node project/bd/exportar_esquema.js
python scripts/nexum_db_init.py
```

El primer comando regenera el JSON y el segundo aplica los validadores e índices nuevos sin borrar los datos existentes.

### 7.5 API de datos

El servidor web expone estas rutas, que usan los paneles:

| Método | Ruta | Uso |
|---|---|---|
| GET | `/api/db/estado` | Estado de la conexión y documentos por colección |
| GET | `/api/red/wifi` | Red actual de la PC, banda, redes cercanas, sugerencia 2.4 GHz y puertos USB del guante |
| GET | `/api/red/wifi/clave?ssid=…` | Contraseña guardada en la PC para esa red (solo desde el panel local) |
| POST | `/api/auth/login`, `/api/auth/register` | Inicio de sesión y registro |
| POST | `/api/sesiones/iniciar` | Abre una sesión (`modalidad`: `hibrida`, `arquitecto` o `videojuego`) |
| POST | `/api/sesiones/finalizar` | Cierra una sesión y actualiza el perfil del jugador |
| POST | `/api/historial` | Registra un lote de comandos ejecutados |
| POST | `/api/arquitecto/escenas` | Guarda la maqueta de la sesión |
| GET | `/api/arquitecto/escenas/ultima` | Devuelve la última maqueta guardada |

---

## 8. Navegación entre módulos

Todos los paneles comparten una rueda de navegación.

| Acción | Resultado |
|---|---|
| Mantener la tecla **E** | Abrir la rueda; al soltarla se navega a la opción resaltada |
| Teclas **0**, **1**, **2**, **3** con la rueda abierta | Inicio, Interacción, Arquitecto 3D, Videojuego |
| Flechas y **Enter** | Seleccionar y confirmar |
| **Escape** | Cerrar la rueda sin cambiar de módulo |

```mermaid
flowchart LR
    R(("Rueda<br/>tecla E"))
    R -->|0| I["Inicio"]
    R -->|1| T["Interacción"]
    R -->|2| A["Arquitecto 3D"]
    R -->|3| V["Videojuego"]
```

---

## 9. Apagado del sistema

El apagado sigue el orden inverso al arranque.

```mermaid
flowchart LR
    A["Pausar o Cerrar<br/>en el panel"] --> B["Apagar el guante"]
    B --> C["Cerrar el navegador"]
    C --> D["Detener el puente<br/>Ctrl + C"]
    D --> E["Detener el servidor web<br/>Ctrl + C"]
```

---

## 10. Solución de problemas

| Síntoma | Causa probable | Solución |
|---|---|---|
| `puerto 5005 ocupado` al iniciar el puente | Ya hay otro puente en ejecución | Cerrar la otra terminal del puente o finalizar el proceso `python.exe` correspondiente |
| El guante no aparece como enlazado | El guante y la PC están en redes distintas | Abrir el modal **Red WiFi del guante** (sección 5.4). Con cable USB o conectando la PC a `NEXUM-GUANTE`, pulsar **Configurar guante** y luego unir la PC a esa misma red |
| El guante no se conecta a la red configurada | La red es de 5 GHz o la contraseña es incorrecta | Usar una red de 2.4 GHz. El guante abre `NEXUM-GUANTE` (clave `nexum1234`) para volver a configurarlo |
| El modal no completa la contraseña | La PC no tiene esa red guardada | Escribirla a mano; en Windows debe existir el perfil WiFi con clave |
| Mensaje "Otro ESP32 intenta emparejarse" | Hay un segundo guante encendido | Apagar el guante que no se utiliza |
| La barra de calibración no avanza | Se perdió la conexión durante la calibración | Esperar unos segundos, presionar **Cerrar** y volver a **Calibrar** |
| El panel de Interacción no se conecta al puente | El puente no está en ejecución | Iniciar `nexum_bridge.py`, recargar la página y presionar **Conectar puente** |
| La cámara no se activa | Otro panel o programa está usando la cámara | Cerrar las demás pestañas o aplicaciones que la usan y conceder el permiso en el navegador |
| Los modelos 3D o la visión no cargan | No hay acceso a Internet | Conectar una red con salida a Internet para descargar Three.js y MediaPipe |
| El emulador muestra una pantalla negra | Faltan los núcleos o las ROM web | Ejecutar los scripts de la sección 3.4 |
| `MongoDB ... SIN CONEXION` al iniciar el servidor web | El servicio de MongoDB está detenido | Windows: `net start MongoDB`. Linux: `sudo systemctl start mongod`. Luego recargar el portal |
| "Base de datos no disponible" al iniciar sesión | El servidor web no alcanza MongoDB | Verificar el servicio y la variable `NEXUM_MONGO_URI`; ejecutar `python scripts/nexum_db_init.py --estado` |
| `Document failed validation` en la terminal | Se envió un campo que el esquema no permite | Ajustar `nexum_ai_completo.js`, regenerar el JSON (sección 7.4) y ejecutar `nexum_db_init.py` |

---

## 11. Referencia rápida

### Comandos

| Acción | Comando |
|---|---|
| Inicializar la base | `.venv/Scripts/python.exe scripts/nexum_db_init.py` |
| Ver el estado de la base | `.venv/Scripts/python.exe scripts/nexum_db_init.py --estado` |
| Iniciar servidor web | `.venv/Scripts/python.exe -u scripts/nexum_http.py` |
| Iniciar puente | `.venv/Scripts/python.exe -u scripts/nexum_bridge.py` |
| Abrir el portal | `http://127.0.0.1:8090/` |

En Linux, reemplazar `.venv/Scripts/python.exe` por `.venv/bin/python`.

### Puertos

| Puerto | Protocolo | Uso |
|---|---|---|
| 8090 | HTTP | Portal, paneles y API de autenticación y datos |
| 27017 | TCP | MongoDB |
| 5005 | UDP | Guante hacia la PC |
| 5006 | UDP | PC hacia el guante |
| 8765 | WebSocket | Panel de interacción híbrida y estado del portal |
| 8766 | WebSocket | Canal del módulo de videojuego |
| 8767 | WebSocket | Canal del módulo Arquitecto 3D |

### Direcciones de los paneles

| Módulo | Dirección |
|---|---|
| Portal | `http://127.0.0.1:8090/` |
| Interacción híbrida | `http://127.0.0.1:8090/modulo_teclado/laboratorio-web/` |
| Arquitecto 3D | `http://127.0.0.1:8090/modulo_arquitecto/panel/` |
| Videojuego | `http://127.0.0.1:8090/modulo_game/panel/` |

### Estructura del repositorio

| Ruta | Contenido |
|---|---|
| `scripts/` | Puente, servidor HTTP, MongoDB, WiFi y autenticación |
| `project/bd/` | Esquema MongoDB (`nexum_ai_completo.js`, JSON y exportador) |
| `modulo_teclado/` | Firmware del guante y panel de interacción híbrida |
| `modulo_arquitecto/` | Panel Arquitecto 3D |
| `modulo_game/` | Panel de videojuego y emulador |
| `portal/` | Recursos del portal (animación, estilos compartidos) |
| `index.html` | Portal de inicio |
