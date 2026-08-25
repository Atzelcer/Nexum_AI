db = db.getSiblingDB("nexum_ai");

db.catalogo_gestos.createIndex({ codigoGesto: 1 }, { unique: true });
db.catalogo_gestos.createIndex({ tipoGesto: 1, activo: 1 });
db.catalogo_gestos.createIndex({ categoriaGesto: 1 });

db.modalidades_aplicacion.createIndex({ codigoModalidad: 1 }, { unique: true });
db.modalidades_aplicacion.createIndex({ motorDestino: 1 });
db.modalidades_aplicacion.createIndex({ estadoModalidad: 1 });

db.configuracion_guante.createIndex({ codigoGuante: 1 }, { unique: true });
db.configuracion_guante.createIndex({ calibracionActiva: 1 });

db.configuracion_vision.createIndex({ codigoCamara: 1 }, { unique: true });
db.configuracion_vision.createIndex({ configuracionActiva: 1 });

db.configuracion_sistema.createIndex({ codigoConfiguracion: 1 }, { unique: true });
db.configuracion_sistema.createIndex({ modalidadActiva: 1 });
db.configuracion_sistema.createIndex({ configuracionActiva: 1 });

db.modelos_entrenados.createIndex({ codigoModelo: 1 }, { unique: true });
db.modelos_entrenados.createIndex({ codigoModalidad: 1, tipoModelo: 1 });
db.modelos_entrenados.createIndex({ codigoModalidad: 1, modeloActivo: 1 });
db.modelos_entrenados.createIndex({ estadoModelo: 1 });

db.arquitecto_comandos.createIndex({ codigoComando: 1 }, { unique: true });
db.arquitecto_comandos.createIndex({ categoriaComando: 1, activo: 1 });
db.arquitecto_comandos.createIndex({ tipoComando: 1 });

db.arquitecto_reglas_semanticas.createIndex({ codigoRegla: 1 }, { unique: true });
db.arquitecto_reglas_semanticas.createIndex({ codigoGesto: 1, codigoComando: 1 });
db.arquitecto_reglas_semanticas.createIndex({ prioridadRegla: 1 });

db.arquitecto_configuracion.createIndex({ codigoConfiguracion: 1 }, { unique: true });
db.arquitecto_configuracion.createIndex({ configuracionActiva: 1 });

db.arquitecto_sesiones.createIndex({ codigoSesion: 1 }, { unique: true });
db.arquitecto_sesiones.createIndex({ codigoGuante: 1, fechaInicio: -1 });
db.arquitecto_sesiones.createIndex({ codigoCamara: 1, fechaInicio: -1 });
db.arquitecto_sesiones.createIndex({ estadoSesion: 1 });

db.arquitecto_muestras.createIndex({ codigoMuestra: 1 }, { unique: true });
db.arquitecto_muestras.createIndex({ codigoSesion: 1, codigoGesto: 1 });
db.arquitecto_muestras.createIndex({ fechaCaptura: -1 });
db.arquitecto_muestras.createIndex({ etiquetaValidada: 1 });

db.arquitecto_historial_comandos.createIndex({ codigoHistorial: 1 }, { unique: true });
db.arquitecto_historial_comandos.createIndex({ codigoSesion: 1, fechaEjecucion: -1 });
db.arquitecto_historial_comandos.createIndex({ codigoComando: 1 });
db.arquitecto_historial_comandos.createIndex({ codigoGestoDetectado: 1 });

db.arquitecto_telemetria.createIndex({ codigoTelemetria: 1 }, { unique: true });
db.arquitecto_telemetria.createIndex({ codigoSesion: 1, tipoTelemetria: 1 });
db.arquitecto_telemetria.createIndex({ fechaEvento: -1 });
db.arquitecto_telemetria.createIndex({ fechaExpiracion: 1 }, { expireAfterSeconds: 0 });

db.arquitecto_escenas.createIndex({ codigoEscena: 1 }, { unique: true });
db.arquitecto_escenas.createIndex({ codigoSesion: 1 });
db.arquitecto_escenas.createIndex({ estadoEscena: 1 });

db.videojuego_comandos.createIndex({ codigoComando: 1 }, { unique: true });
db.videojuego_comandos.createIndex({ categoriaComando: 1, activo: 1 });
db.videojuego_comandos.createIndex({ tipoAccion: 1 });

db.videojuego_reglas_semanticas.createIndex({ codigoRegla: 1 }, { unique: true });
db.videojuego_reglas_semanticas.createIndex({ codigoGesto: 1, codigoComando: 1 });
db.videojuego_reglas_semanticas.createIndex({ prioridadRegla: 1 });

db.videojuego_configuracion.createIndex({ codigoConfiguracion: 1 }, { unique: true });
db.videojuego_configuracion.createIndex({ configuracionActiva: 1 });

db.videojuego_sesiones.createIndex({ codigoSesion: 1 }, { unique: true });
db.videojuego_sesiones.createIndex({ codigoGuante: 1, fechaInicio: -1 });
db.videojuego_sesiones.createIndex({ codigoCamara: 1, fechaInicio: -1 });
db.videojuego_sesiones.createIndex({ estadoSesion: 1 });

db.videojuego_muestras.createIndex({ codigoMuestra: 1 }, { unique: true });
db.videojuego_muestras.createIndex({ codigoSesion: 1, codigoGesto: 1 });
db.videojuego_muestras.createIndex({ fechaCaptura: -1 });
db.videojuego_muestras.createIndex({ etiquetaValidada: 1 });

db.videojuego_historial_comandos.createIndex({ codigoHistorial: 1 }, { unique: true });
db.videojuego_historial_comandos.createIndex({ codigoSesion: 1, fechaEjecucion: -1 });
db.videojuego_historial_comandos.createIndex({ codigoComando: 1 });
db.videojuego_historial_comandos.createIndex({ codigoGestoDetectado: 1 });

db.videojuego_telemetria.createIndex({ codigoTelemetria: 1 }, { unique: true });
db.videojuego_telemetria.createIndex({ codigoSesion: 1, tipoTelemetria: 1 });
db.videojuego_telemetria.createIndex({ fechaEvento: -1 });
db.videojuego_telemetria.createIndex({ fechaExpiracion: 1 }, { expireAfterSeconds: 0 });

db.videojuego_perfil_jugador.createIndex({ codigoPerfil: 1 }, { unique: true });
db.videojuego_perfil_jugador.createIndex({ codigoSesion: 1 });
db.videojuego_perfil_jugador.createIndex({ nombreJugador: 1 });

db.hibrida_comandos.createIndex({ codigoComando: 1 }, { unique: true });
db.hibrida_comandos.createIndex({ categoriaComando: 1, activo: 1 });
db.hibrida_comandos.createIndex({ tipoEntrada: 1 });

db.hibrida_reglas_semanticas.createIndex({ codigoRegla: 1 }, { unique: true });
db.hibrida_reglas_semanticas.createIndex({ codigoGesto: 1, codigoComando: 1 });
db.hibrida_reglas_semanticas.createIndex({ prioridadRegla: 1 });

db.hibrida_configuracion.createIndex({ codigoConfiguracion: 1 }, { unique: true });
db.hibrida_configuracion.createIndex({ configuracionActiva: 1 });

db.hibrida_sesiones.createIndex({ codigoSesion: 1 }, { unique: true });
db.hibrida_sesiones.createIndex({ codigoGuante: 1, fechaInicio: -1 });
db.hibrida_sesiones.createIndex({ codigoCamara: 1, fechaInicio: -1 });
db.hibrida_sesiones.createIndex({ estadoSesion: 1 });

db.hibrida_muestras.createIndex({ codigoMuestra: 1 }, { unique: true });
db.hibrida_muestras.createIndex({ codigoSesion: 1, codigoGesto: 1 });
db.hibrida_muestras.createIndex({ fechaCaptura: -1 });
db.hibrida_muestras.createIndex({ etiquetaValidada: 1 });

db.hibrida_historial_comandos.createIndex({ codigoHistorial: 1 }, { unique: true });
db.hibrida_historial_comandos.createIndex({ codigoSesion: 1, fechaEjecucion: -1 });
db.hibrida_historial_comandos.createIndex({ codigoComando: 1 });
db.hibrida_historial_comandos.createIndex({ codigoGestoDetectado: 1 });

db.hibrida_telemetria.createIndex({ codigoTelemetria: 1 }, { unique: true });
db.hibrida_telemetria.createIndex({ codigoSesion: 1, tipoTelemetria: 1 });
db.hibrida_telemetria.createIndex({ fechaEvento: -1 });
db.hibrida_telemetria.createIndex({ fechaExpiracion: 1 }, { expireAfterSeconds: 0 });

db.hibrida_teclado_virtual.createIndex({ codigoTeclado: 1 }, { unique: true });
db.hibrida_teclado_virtual.createIndex({ codigoSesion: 1 });
db.hibrida_teclado_virtual.createIndex({ layoutTeclado: 1 });
