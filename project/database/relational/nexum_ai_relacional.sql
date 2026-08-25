-- NEXUM AI - Modelo relacional equivalente (PostgreSQL 15+)
-- 30 tablas: 6 compartidas + 8 por cada una de las 3 modalidades.
-- Solo crea estructura, restricciones e índices. NO inserta datos.

BEGIN;

CREATE SCHEMA IF NOT EXISTS nexum_ai;
SET search_path TO nexum_ai;

-- ============================================================================
-- NÚCLEO COMPARTIDO
-- ============================================================================

CREATE TABLE catalogo_gestos (
  codigo_gesto VARCHAR(64) PRIMARY KEY,
  nombre_gesto VARCHAR(120) NOT NULL,
  tipo_gesto VARCHAR(20) NOT NULL CHECK (tipo_gesto IN ('estatico', 'dinamico')),
  categoria_gesto VARCHAR(30) NOT NULL,
  descripcion_gesto TEXT,
  dedos_involucrados JSONB NOT NULL DEFAULT '[]',
  requiere_vision BOOLEAN NOT NULL DEFAULT FALSE,
  requiere_inercia BOOLEAN NOT NULL DEFAULT FALSE,
  requiere_fusion BOOLEAN NOT NULL DEFAULT FALSE,
  duracion_minima_ms INTEGER CHECK (duracion_minima_ms >= 0),
  duracion_maxima_ms INTEGER CHECK (duracion_maxima_ms >= duracion_minima_ms),
  umbral_confianza NUMERIC(5,4) CHECK (umbral_confianza BETWEEN 0 AND 1),
  ventana_temporal_ms INTEGER CHECK (ventana_temporal_ms >= 0),
  secuencia_movimiento JSONB NOT NULL DEFAULT '[]',
  gestos_relacionados JSONB NOT NULL DEFAULT '[]',
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  fecha_registro TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE modalidades_aplicacion (
  codigo_modalidad VARCHAR(64) PRIMARY KEY CHECK (
    codigo_modalidad IN (
      'arquitecto_tridimensional',
      'control_videojuego',
      'interaccion_hibrida'
    )
  ),
  nombre_modalidad VARCHAR(120) NOT NULL,
  descripcion_modalidad TEXT,
  motor_destino VARCHAR(20) NOT NULL CHECK (
    motor_destino IN ('threejs', 'unity', 'navegador')
  ),
  categorias_comando JSONB NOT NULL DEFAULT '[]',
  gestos_permitidos JSONB NOT NULL DEFAULT '[]',
  coleccion_comandos VARCHAR(80) NOT NULL,
  coleccion_sesiones VARCHAR(80) NOT NULL,
  permite_dos_manos BOOLEAN NOT NULL DEFAULT FALSE,
  tiempo_debounce_ms INTEGER NOT NULL DEFAULT 0 CHECK (tiempo_debounce_ms >= 0),
  sensibilidad_movimiento NUMERIC(8,4) CHECK (sensibilidad_movimiento >= 0),
  estado_modalidad VARCHAR(20) NOT NULL CHECK (
    estado_modalidad IN ('activa', 'inactiva', 'mantenimiento')
  ),
  fecha_registro TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE configuracion_guante (
  codigo_guante VARCHAR(64) PRIMARY KEY,
  codigo_esp32 VARCHAR(64) NOT NULL,
  codigo_multiplexor VARCHAR(64),
  cantidad_sensores INTEGER NOT NULL CHECK (cantidad_sensores > 0),
  mapa_sensores JSONB NOT NULL DEFAULT '{}',
  posicion_neutral JSONB NOT NULL DEFAULT '{}',
  rangos_movimiento JSONB NOT NULL DEFAULT '{}',
  frecuencia_muestreo_hz INTEGER CHECK (frecuencia_muestreo_hz > 0),
  tipo_filtro VARCHAR(50),
  protocolo_comunicacion VARCHAR(50),
  puerto_comunicacion INTEGER CHECK (puerto_comunicacion BETWEEN 1 AND 65535),
  version_firmware VARCHAR(40),
  calibracion_estable BOOLEAN NOT NULL DEFAULT FALSE,
  puntaje_calidad NUMERIC(5,4) CHECK (puntaje_calidad BETWEEN 0 AND 1),
  calibracion_activa BOOLEAN NOT NULL DEFAULT FALSE,
  fecha_calibracion TIMESTAMPTZ,
  fecha_registro TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE configuracion_vision (
  codigo_camara VARCHAR(64) PRIMARY KEY,
  resolucion_captura VARCHAR(30),
  frecuencia_captura_fps INTEGER CHECK (frecuencia_captura_fps > 0),
  modelo_deteccion VARCHAR(100) NOT NULL,
  cantidad_manos_maxima SMALLINT CHECK (cantidad_manos_maxima BETWEEN 1 AND 2),
  confianza_deteccion NUMERIC(5,4) CHECK (confianza_deteccion BETWEEN 0 AND 1),
  confianza_seguimiento NUMERIC(5,4) CHECK (confianza_seguimiento BETWEEN 0 AND 1),
  espejo_horizontal BOOLEAN NOT NULL DEFAULT FALSE,
  normalizar_coordenadas BOOLEAN NOT NULL DEFAULT TRUE,
  configuracion_activa BOOLEAN NOT NULL DEFAULT FALSE,
  fecha_registro TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE configuracion_sistema (
  codigo_configuracion VARCHAR(64) PRIMARY KEY,
  modalidad_activa VARCHAR(64) NOT NULL
    REFERENCES modalidades_aplicacion(codigo_modalidad),
  desfase_vision_imu_ms INTEGER,
  tamano_ventana_ms INTEGER CHECK (tamano_ventana_ms > 0),
  tamano_buffer INTEGER CHECK (tamano_buffer > 0),
  confianza_minima_global NUMERIC(5,4)
    CHECK (confianza_minima_global BETWEEN 0 AND 1),
  tiempo_debounce_global_ms INTEGER CHECK (tiempo_debounce_global_ms >= 0),
  frecuencia_actualizacion_hud_ms INTEGER
    CHECK (frecuencia_actualizacion_hud_ms > 0),
  mostrar_telemetria BOOLEAN NOT NULL DEFAULT FALSE,
  mostrar_confianza BOOLEAN NOT NULL DEFAULT TRUE,
  mostrar_historial BOOLEAN NOT NULL DEFAULT TRUE,
  ttl_telemetria_dias INTEGER NOT NULL DEFAULT 30 CHECK (ttl_telemetria_dias > 0),
  ruta_archivos TEXT,
  configuracion_activa BOOLEAN NOT NULL DEFAULT FALSE,
  fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE modelos_entrenados (
  codigo_modelo VARCHAR(64) PRIMARY KEY,
  codigo_modalidad VARCHAR(64) NOT NULL
    REFERENCES modalidades_aplicacion(codigo_modalidad),
  nombre_modelo VARCHAR(120) NOT NULL,
  tipo_modelo VARCHAR(20) NOT NULL
    CHECK (tipo_modelo IN ('clasificador', 'lstm', 'gru')),
  version_modelo VARCHAR(40) NOT NULL,
  precision_modelo NUMERIC(5,4) CHECK (precision_modelo BETWEEN 0 AND 1),
  gestos_entrenados JSONB NOT NULL DEFAULT '[]',
  estado_modelo VARCHAR(20) NOT NULL
    CHECK (estado_modelo IN ('entrenando', 'listo', 'archivado')),
  modelo_activo BOOLEAN NOT NULL DEFAULT FALSE,
  ruta_archivo TEXT,
  fecha_entrenamiento TIMESTAMPTZ,
  fecha_registro TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- MODALIDAD 1: ARQUITECTO TRIDIMENSIONAL (THREE.JS)
-- ============================================================================

CREATE TABLE arquitecto_comandos (
  codigo_comando VARCHAR(64) PRIMARY KEY,
  nombre_comando VARCHAR(120) NOT NULL,
  categoria_comando VARCHAR(30) NOT NULL
    CHECK (categoria_comando IN ('manipulacion', 'navegacion')),
  descripcion_comando TEXT,
  tipo_comando VARCHAR(30) NOT NULL
    CHECK (tipo_comando IN ('accion', 'transformacion', 'navegacion')),
  gestos_sugeridos JSONB NOT NULL DEFAULT '[]',
  requiere_objetivo_seleccionado BOOLEAN NOT NULL DEFAULT FALSE,
  ejes_permitidos JSONB NOT NULL DEFAULT '[]',
  parametros_comando JSONB NOT NULL DEFAULT '{}',
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  fecha_registro TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE arquitecto_reglas_semanticas (
  codigo_regla VARCHAR(64) PRIMARY KEY,
  codigo_gesto VARCHAR(64) NOT NULL REFERENCES catalogo_gestos(codigo_gesto),
  codigo_comando VARCHAR(64) NOT NULL
    REFERENCES arquitecto_comandos(codigo_comando),
  prioridad_regla INTEGER NOT NULL CHECK (prioridad_regla >= 0),
  confianza_minima NUMERIC(5,4) NOT NULL
    CHECK (confianza_minima BETWEEN 0 AND 1),
  estado_aplicacion VARCHAR(30) NOT NULL
    CHECK (estado_aplicacion IN ('edicion', 'navegacion', 'vista_previa')),
  eje_transformacion VARCHAR(10)
    CHECK (eje_transformacion IN ('x', 'y', 'z', 'libre')),
  parametros_ejecucion JSONB NOT NULL DEFAULT '{}',
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  fecha_registro TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (codigo_gesto, codigo_comando, estado_aplicacion)
);

CREATE TABLE arquitecto_configuracion (
  codigo_configuracion VARCHAR(64) PRIMARY KEY,
  motor_destino VARCHAR(20) NOT NULL DEFAULT 'threejs'
    CHECK (motor_destino = 'threejs'),
  grid_visible BOOLEAN NOT NULL DEFAULT TRUE,
  unidad_medida VARCHAR(30),
  modo_camara VARCHAR(30)
    CHECK (modo_camara IN ('orbita', 'primera_persona', 'ortografica')),
  snap_activado BOOLEAN NOT NULL DEFAULT FALSE,
  sensibilidad_rotacion NUMERIC(8,4) CHECK (sensibilidad_rotacion >= 0),
  sensibilidad_zoom NUMERIC(8,4) CHECK (sensibilidad_zoom >= 0),
  permite_dos_manos BOOLEAN NOT NULL DEFAULT FALSE,
  tiempo_debounce_ms INTEGER CHECK (tiempo_debounce_ms >= 0),
  configuracion_activa BOOLEAN NOT NULL DEFAULT FALSE,
  fecha_registro TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE arquitecto_sesiones (
  codigo_sesion VARCHAR(64) PRIMARY KEY,
  codigo_guante VARCHAR(64) NOT NULL
    REFERENCES configuracion_guante(codigo_guante),
  codigo_camara VARCHAR(64) NOT NULL
    REFERENCES configuracion_vision(codigo_camara),
  codigo_configuracion VARCHAR(64) NOT NULL
    REFERENCES arquitecto_configuracion(codigo_configuracion),
  codigo_modelo_clasificador VARCHAR(64)
    REFERENCES modelos_entrenados(codigo_modelo),
  fecha_inicio TIMESTAMPTZ NOT NULL,
  fecha_fin TIMESTAMPTZ,
  estado_sesion VARCHAR(20) NOT NULL
    CHECK (estado_sesion IN ('activa', 'finalizada', 'error')),
  objetos_seleccionados JSONB NOT NULL DEFAULT '[]',
  fecha_registro TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (fecha_fin IS NULL OR fecha_fin >= fecha_inicio)
);

CREATE TABLE arquitecto_muestras (
  codigo_muestra VARCHAR(64) PRIMARY KEY,
  codigo_sesion VARCHAR(64) NOT NULL
    REFERENCES arquitecto_sesiones(codigo_sesion) ON DELETE CASCADE,
  codigo_gesto VARCHAR(64) NOT NULL REFERENCES catalogo_gestos(codigo_gesto),
  fecha_captura TIMESTAMPTZ NOT NULL,
  datos_vision JSONB NOT NULL DEFAULT '{}',
  datos_inercia JSONB NOT NULL DEFAULT '{}',
  confianza_vision NUMERIC(5,4) CHECK (confianza_vision BETWEEN 0 AND 1),
  confianza_inercia NUMERIC(5,4) CHECK (confianza_inercia BETWEEN 0 AND 1),
  confianza_fusion NUMERIC(5,4) CHECK (confianza_fusion BETWEEN 0 AND 1),
  etiqueta_validada BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE arquitecto_historial_comandos (
  codigo_historial VARCHAR(64) PRIMARY KEY,
  codigo_sesion VARCHAR(64) NOT NULL
    REFERENCES arquitecto_sesiones(codigo_sesion) ON DELETE CASCADE,
  codigo_gesto_detectado VARCHAR(64) NOT NULL
    REFERENCES catalogo_gestos(codigo_gesto),
  codigo_comando VARCHAR(64) NOT NULL
    REFERENCES arquitecto_comandos(codigo_comando),
  fecha_ejecucion TIMESTAMPTZ NOT NULL,
  confianza_deteccion NUMERIC(5,4)
    CHECK (confianza_deteccion BETWEEN 0 AND 1),
  codigo_objetivo_afectado VARCHAR(100),
  parametros_ejecutados JSONB NOT NULL DEFAULT '{}',
  resultado_ejecucion VARCHAR(60)
);

CREATE TABLE arquitecto_telemetria (
  codigo_telemetria VARCHAR(64) PRIMARY KEY,
  codigo_sesion VARCHAR(64) NOT NULL
    REFERENCES arquitecto_sesiones(codigo_sesion) ON DELETE CASCADE,
  tipo_telemetria VARCHAR(20) NOT NULL
    CHECK (tipo_telemetria IN ('vision', 'inercia', 'fusion', 'render')),
  fecha_evento TIMESTAMPTZ NOT NULL,
  fecha_expiracion TIMESTAMPTZ NOT NULL,
  latencia_ms NUMERIC(12,4) CHECK (latencia_ms >= 0),
  payload JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE arquitecto_escenas (
  codigo_escena VARCHAR(64) PRIMARY KEY,
  codigo_sesion VARCHAR(64) NOT NULL
    REFERENCES arquitecto_sesiones(codigo_sesion) ON DELETE CASCADE,
  nombre_escena VARCHAR(120) NOT NULL,
  objetos_escena JSONB NOT NULL DEFAULT '[]',
  camara_activa JSONB NOT NULL DEFAULT '{}',
  estado_escena VARCHAR(20) NOT NULL
    CHECK (estado_escena IN ('borrador', 'activa', 'archivada')),
  fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- MODALIDAD 2: CONTROL DE VIDEOJUEGO (UNITY)
-- ============================================================================

CREATE TABLE videojuego_comandos (
  codigo_comando VARCHAR(64) PRIMARY KEY,
  nombre_comando VARCHAR(120) NOT NULL,
  categoria_comando VARCHAR(30) NOT NULL
    CHECK (categoria_comando IN ('combate', 'navegacion')),
  descripcion_comando TEXT,
  tipo_accion VARCHAR(30) NOT NULL
    CHECK (tipo_accion IN ('accion', 'ataque', 'defensa', 'movimiento', 'habilidad')),
  gestos_sugeridos JSONB NOT NULL DEFAULT '[]',
  magnitud_default NUMERIC(10,4) CHECK (magnitud_default >= 0),
  cooldown_ms INTEGER CHECK (cooldown_ms >= 0),
  slot_habilidad INTEGER CHECK (slot_habilidad >= 0),
  parametros_comando JSONB NOT NULL DEFAULT '{}',
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  fecha_registro TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE videojuego_reglas_semanticas (
  codigo_regla VARCHAR(64) PRIMARY KEY,
  codigo_gesto VARCHAR(64) NOT NULL REFERENCES catalogo_gestos(codigo_gesto),
  codigo_comando VARCHAR(64) NOT NULL
    REFERENCES videojuego_comandos(codigo_comando),
  prioridad_regla INTEGER NOT NULL CHECK (prioridad_regla >= 0),
  confianza_minima NUMERIC(5,4) NOT NULL
    CHECK (confianza_minima BETWEEN 0 AND 1),
  estado_aplicacion VARCHAR(20) NOT NULL
    CHECK (estado_aplicacion IN ('juego', 'menu', 'pausa')),
  ventana_combo_ms INTEGER CHECK (ventana_combo_ms >= 0),
  parametros_ejecucion JSONB NOT NULL DEFAULT '{}',
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  fecha_registro TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (codigo_gesto, codigo_comando, estado_aplicacion)
);

CREATE TABLE videojuego_configuracion (
  codigo_configuracion VARCHAR(64) PRIMARY KEY,
  motor_destino VARCHAR(20) NOT NULL DEFAULT 'unity'
    CHECK (motor_destino = 'unity'),
  sensibilidad_movimiento NUMERIC(8,4) CHECK (sensibilidad_movimiento >= 0),
  ventana_combo_ms INTEGER CHECK (ventana_combo_ms >= 0),
  magnitud_ataque_default NUMERIC(10,4) CHECK (magnitud_ataque_default >= 0),
  mapeo_botones JSONB NOT NULL DEFAULT '{}',
  permite_dos_manos BOOLEAN NOT NULL DEFAULT FALSE,
  tiempo_debounce_ms INTEGER CHECK (tiempo_debounce_ms >= 0),
  configuracion_activa BOOLEAN NOT NULL DEFAULT FALSE,
  fecha_registro TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE videojuego_sesiones (
  codigo_sesion VARCHAR(64) PRIMARY KEY,
  codigo_guante VARCHAR(64) NOT NULL
    REFERENCES configuracion_guante(codigo_guante),
  codigo_camara VARCHAR(64) NOT NULL
    REFERENCES configuracion_vision(codigo_camara),
  codigo_configuracion VARCHAR(64) NOT NULL
    REFERENCES videojuego_configuracion(codigo_configuracion),
  codigo_modelo_clasificador VARCHAR(64)
    REFERENCES modelos_entrenados(codigo_modelo),
  nombre_partida VARCHAR(120),
  fecha_inicio TIMESTAMPTZ NOT NULL,
  fecha_fin TIMESTAMPTZ,
  estado_sesion VARCHAR(20) NOT NULL
    CHECK (estado_sesion IN ('activa', 'finalizada', 'error')),
  puntuacion_sesion INTEGER NOT NULL DEFAULT 0 CHECK (puntuacion_sesion >= 0),
  fecha_registro TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (fecha_fin IS NULL OR fecha_fin >= fecha_inicio)
);

CREATE TABLE videojuego_muestras (
  codigo_muestra VARCHAR(64) PRIMARY KEY,
  codigo_sesion VARCHAR(64) NOT NULL
    REFERENCES videojuego_sesiones(codigo_sesion) ON DELETE CASCADE,
  codigo_gesto VARCHAR(64) NOT NULL REFERENCES catalogo_gestos(codigo_gesto),
  fecha_captura TIMESTAMPTZ NOT NULL,
  datos_vision JSONB NOT NULL DEFAULT '{}',
  datos_inercia JSONB NOT NULL DEFAULT '{}',
  confianza_vision NUMERIC(5,4) CHECK (confianza_vision BETWEEN 0 AND 1),
  confianza_inercia NUMERIC(5,4) CHECK (confianza_inercia BETWEEN 0 AND 1),
  confianza_fusion NUMERIC(5,4) CHECK (confianza_fusion BETWEEN 0 AND 1),
  etiqueta_validada BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE videojuego_historial_comandos (
  codigo_historial VARCHAR(64) PRIMARY KEY,
  codigo_sesion VARCHAR(64) NOT NULL
    REFERENCES videojuego_sesiones(codigo_sesion) ON DELETE CASCADE,
  codigo_gesto_detectado VARCHAR(64) NOT NULL
    REFERENCES catalogo_gestos(codigo_gesto),
  codigo_comando VARCHAR(64) NOT NULL
    REFERENCES videojuego_comandos(codigo_comando),
  fecha_ejecucion TIMESTAMPTZ NOT NULL,
  confianza_deteccion NUMERIC(5,4)
    CHECK (confianza_deteccion BETWEEN 0 AND 1),
  magnitud_ejecutada NUMERIC(10,4) CHECK (magnitud_ejecutada >= 0),
  es_combo BOOLEAN NOT NULL DEFAULT FALSE,
  parametros_ejecutados JSONB NOT NULL DEFAULT '{}',
  resultado_ejecucion VARCHAR(60)
);

CREATE TABLE videojuego_telemetria (
  codigo_telemetria VARCHAR(64) PRIMARY KEY,
  codigo_sesion VARCHAR(64) NOT NULL
    REFERENCES videojuego_sesiones(codigo_sesion) ON DELETE CASCADE,
  tipo_telemetria VARCHAR(20) NOT NULL
    CHECK (tipo_telemetria IN ('vision', 'inercia', 'fusion', 'input_lag')),
  fecha_evento TIMESTAMPTZ NOT NULL,
  fecha_expiracion TIMESTAMPTZ NOT NULL,
  latencia_ms NUMERIC(12,4) CHECK (latencia_ms >= 0),
  payload JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE videojuego_perfil_jugador (
  codigo_perfil VARCHAR(64) PRIMARY KEY,
  codigo_sesion VARCHAR(64) NOT NULL UNIQUE
    REFERENCES videojuego_sesiones(codigo_sesion) ON DELETE CASCADE,
  nombre_jugador VARCHAR(120) NOT NULL,
  nivel_experiencia VARCHAR(40),
  combos_registrados JSONB NOT NULL DEFAULT '[]',
  estadisticas_combate JSONB NOT NULL DEFAULT '{}',
  fecha_registro TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- MODALIDAD 3: INTERACCIÓN HÍBRIDA (NAVEGADOR)
-- ============================================================================

CREATE TABLE hibrida_comandos (
  codigo_comando VARCHAR(64) PRIMARY KEY,
  nombre_comando VARCHAR(120) NOT NULL,
  categoria_comando VARCHAR(30) NOT NULL
    CHECK (categoria_comando IN ('navegacion', 'escritura')),
  descripcion_comando TEXT,
  tipo_entrada VARCHAR(30) NOT NULL
    CHECK (tipo_entrada IN ('tecla', 'desplazamiento', 'confirmacion', 'cancelacion')),
  gestos_sugeridos JSONB NOT NULL DEFAULT '[]',
  tecla_equivalente VARCHAR(40),
  modo_desplazamiento VARCHAR(20)
    CHECK (modo_desplazamiento IN ('horizontal', 'vertical', 'libre')),
  parametros_comando JSONB NOT NULL DEFAULT '{}',
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  fecha_registro TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE hibrida_reglas_semanticas (
  codigo_regla VARCHAR(64) PRIMARY KEY,
  codigo_gesto VARCHAR(64) NOT NULL REFERENCES catalogo_gestos(codigo_gesto),
  codigo_comando VARCHAR(64) NOT NULL
    REFERENCES hibrida_comandos(codigo_comando),
  prioridad_regla INTEGER NOT NULL CHECK (prioridad_regla >= 0),
  confianza_minima NUMERIC(5,4) NOT NULL
    CHECK (confianza_minima BETWEEN 0 AND 1),
  estado_aplicacion VARCHAR(20) NOT NULL
    CHECK (estado_aplicacion IN ('navegacion', 'escritura', 'formulario')),
  tecla_equivalente VARCHAR(40),
  parametros_ejecucion JSONB NOT NULL DEFAULT '{}',
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  fecha_registro TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (codigo_gesto, codigo_comando, estado_aplicacion)
);

CREATE TABLE hibrida_configuracion (
  codigo_configuracion VARCHAR(64) PRIMARY KEY,
  motor_destino VARCHAR(20) NOT NULL DEFAULT 'navegador'
    CHECK (motor_destino = 'navegador'),
  layout_teclado VARCHAR(30)
    CHECK (layout_teclado IN ('qwerty', 'numerico', 'personalizado')),
  velocidad_desplazamiento NUMERIC(8,4) CHECK (velocidad_desplazamiento >= 0),
  sensibilidad_scroll NUMERIC(8,4) CHECK (sensibilidad_scroll >= 0),
  tecla_confirmacion VARCHAR(40),
  tecla_cancelacion VARCHAR(40),
  permite_dos_manos BOOLEAN NOT NULL DEFAULT FALSE,
  tiempo_debounce_ms INTEGER CHECK (tiempo_debounce_ms >= 0),
  configuracion_activa BOOLEAN NOT NULL DEFAULT FALSE,
  fecha_registro TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE hibrida_sesiones (
  codigo_sesion VARCHAR(64) PRIMARY KEY,
  codigo_guante VARCHAR(64) NOT NULL
    REFERENCES configuracion_guante(codigo_guante),
  codigo_camara VARCHAR(64) NOT NULL
    REFERENCES configuracion_vision(codigo_camara),
  codigo_configuracion VARCHAR(64) NOT NULL
    REFERENCES hibrida_configuracion(codigo_configuracion),
  codigo_modelo_clasificador VARCHAR(64)
    REFERENCES modelos_entrenados(codigo_modelo),
  url_aplicacion TEXT,
  fecha_inicio TIMESTAMPTZ NOT NULL,
  fecha_fin TIMESTAMPTZ,
  estado_sesion VARCHAR(20) NOT NULL
    CHECK (estado_sesion IN ('activa', 'finalizada', 'error')),
  fecha_registro TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (fecha_fin IS NULL OR fecha_fin >= fecha_inicio)
);

CREATE TABLE hibrida_muestras (
  codigo_muestra VARCHAR(64) PRIMARY KEY,
  codigo_sesion VARCHAR(64) NOT NULL
    REFERENCES hibrida_sesiones(codigo_sesion) ON DELETE CASCADE,
  codigo_gesto VARCHAR(64) NOT NULL REFERENCES catalogo_gestos(codigo_gesto),
  fecha_captura TIMESTAMPTZ NOT NULL,
  datos_vision JSONB NOT NULL DEFAULT '{}',
  datos_inercia JSONB NOT NULL DEFAULT '{}',
  confianza_vision NUMERIC(5,4) CHECK (confianza_vision BETWEEN 0 AND 1),
  confianza_inercia NUMERIC(5,4) CHECK (confianza_inercia BETWEEN 0 AND 1),
  confianza_fusion NUMERIC(5,4) CHECK (confianza_fusion BETWEEN 0 AND 1),
  etiqueta_validada BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE hibrida_historial_comandos (
  codigo_historial VARCHAR(64) PRIMARY KEY,
  codigo_sesion VARCHAR(64) NOT NULL
    REFERENCES hibrida_sesiones(codigo_sesion) ON DELETE CASCADE,
  codigo_gesto_detectado VARCHAR(64) NOT NULL
    REFERENCES catalogo_gestos(codigo_gesto),
  codigo_comando VARCHAR(64) NOT NULL
    REFERENCES hibrida_comandos(codigo_comando),
  fecha_ejecucion TIMESTAMPTZ NOT NULL,
  confianza_deteccion NUMERIC(5,4)
    CHECK (confianza_deteccion BETWEEN 0 AND 1),
  tecla_ejecutada VARCHAR(40),
  caracter_ingresado VARCHAR(20),
  parametros_ejecutados JSONB NOT NULL DEFAULT '{}',
  resultado_ejecucion VARCHAR(60)
);

CREATE TABLE hibrida_telemetria (
  codigo_telemetria VARCHAR(64) PRIMARY KEY,
  codigo_sesion VARCHAR(64) NOT NULL
    REFERENCES hibrida_sesiones(codigo_sesion) ON DELETE CASCADE,
  tipo_telemetria VARCHAR(20) NOT NULL
    CHECK (tipo_telemetria IN ('vision', 'inercia', 'fusion', 'dom_event')),
  fecha_evento TIMESTAMPTZ NOT NULL,
  fecha_expiracion TIMESTAMPTZ NOT NULL,
  latencia_ms NUMERIC(12,4) CHECK (latencia_ms >= 0),
  payload JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE hibrida_teclado_virtual (
  codigo_teclado VARCHAR(64) PRIMARY KEY,
  codigo_sesion VARCHAR(64) NOT NULL UNIQUE
    REFERENCES hibrida_sesiones(codigo_sesion) ON DELETE CASCADE,
  layout_teclado VARCHAR(30) NOT NULL,
  filas_teclado JSONB NOT NULL DEFAULT '[]',
  tecla_activa VARCHAR(40),
  posicion_cursor JSONB NOT NULL DEFAULT '{}',
  fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- ÍNDICES OPERATIVOS
-- ============================================================================

CREATE INDEX idx_gestos_tipo_activo
  ON catalogo_gestos(tipo_gesto, activo);
CREATE INDEX idx_modelos_modalidad_activo
  ON modelos_entrenados(codigo_modalidad, modelo_activo);

CREATE UNIQUE INDEX uq_config_sistema_activa
  ON configuracion_sistema(configuracion_activa)
  WHERE configuracion_activa = TRUE;
CREATE UNIQUE INDEX uq_config_arquitecto_activa
  ON arquitecto_configuracion(configuracion_activa)
  WHERE configuracion_activa = TRUE;
CREATE UNIQUE INDEX uq_config_videojuego_activa
  ON videojuego_configuracion(configuracion_activa)
  WHERE configuracion_activa = TRUE;
CREATE UNIQUE INDEX uq_config_hibrida_activa
  ON hibrida_configuracion(configuracion_activa)
  WHERE configuracion_activa = TRUE;

CREATE INDEX idx_arq_sesion_fecha
  ON arquitecto_sesiones(codigo_guante, fecha_inicio DESC);
CREATE INDEX idx_arq_muestra_sesion_gesto
  ON arquitecto_muestras(codigo_sesion, codigo_gesto);
CREATE INDEX idx_arq_historial_sesion_fecha
  ON arquitecto_historial_comandos(codigo_sesion, fecha_ejecucion DESC);
CREATE INDEX idx_arq_telemetria_sesion_tipo
  ON arquitecto_telemetria(codigo_sesion, tipo_telemetria);

CREATE INDEX idx_vid_sesion_fecha
  ON videojuego_sesiones(codigo_guante, fecha_inicio DESC);
CREATE INDEX idx_vid_muestra_sesion_gesto
  ON videojuego_muestras(codigo_sesion, codigo_gesto);
CREATE INDEX idx_vid_historial_sesion_fecha
  ON videojuego_historial_comandos(codigo_sesion, fecha_ejecucion DESC);
CREATE INDEX idx_vid_telemetria_sesion_tipo
  ON videojuego_telemetria(codigo_sesion, tipo_telemetria);

CREATE INDEX idx_hib_sesion_fecha
  ON hibrida_sesiones(codigo_guante, fecha_inicio DESC);
CREATE INDEX idx_hib_muestra_sesion_gesto
  ON hibrida_muestras(codigo_sesion, codigo_gesto);
CREATE INDEX idx_hib_historial_sesion_fecha
  ON hibrida_historial_comandos(codigo_sesion, fecha_ejecucion DESC);
CREATE INDEX idx_hib_telemetria_sesion_tipo
  ON hibrida_telemetria(codigo_sesion, tipo_telemetria);

COMMIT;
