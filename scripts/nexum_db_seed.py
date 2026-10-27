from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import nexum_db

ROOT = Path(__file__).resolve().parents[1]
DEDOS = ["menique", "anular", "medio", "indice", "pulgar"]


def _gesto(code, name, tipo, categoria, desc, **extra):
    return {
        "codigoGesto": code,
        "nombreGesto": name,
        "tipoGesto": tipo,
        "categoriaGesto": categoria,
        "descripcionGesto": desc,
        "activo": True,
        **extra,
    }


GESTOS = [
    *[
        _gesto(
            f"dedo_{d}", f"Flexion {d}", "dinamico", "escritura",
            f"Flexion repetida del dedo {d}; cada toque avanza una letra del grupo",
            dedosInvolucrados=[d], requiereInercia=True, requiereVision=False, ventanaTemporalMs=900,
        )
        for d in DEDOS
    ],
    _gesto(
        "acorde_4_dedos", "Acorde de cuatro dedos", "dinamico", "navegacion",
        "Cuatro dedos flexionados a la vez abren la rueda de modos",
        dedosInvolucrados=DEDOS[:4], requiereInercia=True, ventanaTemporalMs=600,
    ),
    _gesto("cursor_indice", "Indice extendido", "dinamico", "navegacion",
           "El indice guia el puntero del sistema", requiereVision=True),
    _gesto("cursor_menique", "Solo menique", "estatico", "navegacion",
           "Clic izquierdo del puntero", requiereVision=True),
    _gesto("cursor_pulgar", "Solo pulgar", "estatico", "navegacion",
           "Clic derecho del puntero", requiereVision=True),
    _gesto("mano_izq_abierta", "Mano izquierda abierta", "estatico", "navegacion",
           "Pulsa la tecla Windows", requiereVision=True),
    _gesto("punio_cursor", "Puno cerrado", "estatico", "escritura",
           "Borra el ultimo caracter", requiereVision=True),
    _gesto("pinza_izq", "Pinza izquierda", "estatico", "manipulacion", "Selecciona el siguiente modulo", requiereVision=True),
    _gesto("mano_abierta_izq", "Mano abierta izquierda", "estatico", "manipulacion", "Previsualiza el modulo a seleccionar", requiereVision=True),
    _gesto("indice_der", "Indice derecho", "dinamico", "manipulacion", "Rota el modulo seleccionado", requiereVision=True),
    _gesto("palma_slide_der", "Palma derecha lateral", "dinamico", "manipulacion", "Desplaza el modulo en X", requiereVision=True),
    _gesto("palma_elev_der", "Palma derecha vertical", "dinamico", "manipulacion", "Sube o baja el modulo", requiereVision=True),
    _gesto("pinza_der", "Pinza derecha", "dinamico", "manipulacion", "Arrastra el modulo apuntando", requiereVision=True),
    _gesto("paz_der", "Paz derecha", "estatico", "manipulacion", "Duplica el modulo", requiereVision=True),
    _gesto("dos_pinzas", "Dos pinzas", "dinamico", "manipulacion", "Escala y rota con ambas manos", requiereVision=True),
    _gesto("dos_palmas", "Dos palmas", "estatico", "navegacion", "Orbita la camara", requiereVision=True),
    _gesto("punio_der", "Puno derecho", "estatico", "manipulacion", "Confirma la accion", requiereVision=True),
    _gesto("punio_izq", "Puno izquierdo", "estatico", "manipulacion", "Cancela la accion", requiereVision=True),
    _gesto("posicion_izq", "Posicion izquierda", "estatico", "navegacion", "Enfoca la zona Sala", requiereVision=True),
    _gesto("posicion_centro", "Posicion centro", "estatico", "navegacion", "Enfoca la zona Cocina", requiereVision=True),
    _gesto("posicion_der", "Posicion derecha", "estatico", "navegacion", "Enfoca la zona Escalera", requiereVision=True),
    _gesto("indice_izq_lateral", "Indice izquierdo lateral", "dinamico", "navegacion", "Mueve al personaje", requiereVision=True),
    _gesto("punio_izq_juego", "Puno izquierdo (juego)", "estatico", "navegacion", "Pulsa Start", requiereVision=True),
    _gesto("mano_der_abierta", "Mano derecha abierta", "estatico", "combate", "Disparo", requiereVision=True),
    _gesto("punio_der_juego", "Puno derecho (juego)", "estatico", "combate", "Salto", requiereVision=True),
    _gesto("mano_der_abajo", "Mano derecha hacia abajo", "estatico", "combate", "Agacharse", requiereVision=True),
    _gesto("mano_der_arriba", "Mano derecha hacia arriba", "estatico", "combate", "Apuntar arriba", requiereVision=True),
]

MODALIDADES = [
    {
        "codigoModalidad": "interaccion_hibrida",
        "nombreModalidad": "Interaccion hibrida",
        "descripcionModalidad": "Teclado virtual con guante y control del puntero por camara",
        "motorDestino": "navegador",
        "categoriasComando": ["escritura", "navegacion"],
        "gestosPermitidos": [f"dedo_{d}" for d in DEDOS] + ["acorde_4_dedos", "cursor_indice", "cursor_menique",
                                                         "cursor_pulgar", "mano_izq_abierta", "punio_cursor"],
        "coleccionComandos": "hibrida_comandos",
        "coleccionSesiones": "hibrida_sesiones",
        "permiteDosManos": True,
        "tiempoDebounceMs": 120,
        "estadoModalidad": "activa",
    },
    {
        "codigoModalidad": "arquitecto_tridimensional",
        "nombreModalidad": "Arquitecto 3D",
        "descripcionModalidad": "Edicion de escenas Three.js con gestos de camara",
        "motorDestino": "threejs",
        "categoriasComando": ["manipulacion", "navegacion"],
        "gestosPermitidos": ["pinza_izq", "mano_abierta_izq", "indice_der", "palma_slide_der", "palma_elev_der",
                             "pinza_der", "paz_der", "dos_pinzas", "dos_palmas", "punio_der", "punio_izq",
                             "posicion_izq", "posicion_centro", "posicion_der"],
        "coleccionComandos": "arquitecto_comandos",
        "coleccionSesiones": "arquitecto_sesiones",
        "permiteDosManos": True,
        "tiempoDebounceMs": 150,
        "estadoModalidad": "activa",
    },
    {
        "codigoModalidad": "control_videojuego",
        "nombreModalidad": "Control de videojuego",
        "descripcionModalidad": "Mando arcade por camara sobre el emulador del navegador",
        "motorDestino": "navegador",
        "categoriasComando": ["combate", "navegacion"],
        "gestosPermitidos": ["indice_izq_lateral", "punio_izq_juego", "mano_der_abierta", "punio_der_juego",
                             "mano_der_abajo", "mano_der_arriba"],
        "coleccionComandos": "videojuego_comandos",
        "coleccionSesiones": "videojuego_sesiones",
        "permiteDosManos": True,
        "tiempoDebounceMs": 60,
        "estadoModalidad": "activa",
    },
]


def _cmd_h(code, name, entrada, cat, desc, gestos, **extra):
    return {"codigoComando": code, "nombreComando": name, "tipoEntrada": entrada, "categoriaComando": cat,
            "descripcionComando": desc, "gestosSugeridos": gestos, "activo": True, **extra}


COMANDOS_HIBRIDA = [
    _cmd_h("escribir_letra", "Escribir letra", "tecla", "escritura", "Escribe la letra elegida con el guante",
           [f"dedo_{d}" for d in DEDOS]),
    _cmd_h("escribir_numero", "Escribir numero", "tecla", "escritura", "Escribe el numero o simbolo elegido",
           [f"dedo_{d}" for d in DEDOS]),
    _cmd_h("cambiar_modo", "Cambiar modo", "confirmacion", "navegacion", "Alterna letras, numeros y cursor",
           ["acorde_4_dedos"]),
    _cmd_h("mover_cursor", "Mover puntero", "desplazamiento", "navegacion", "Desplaza el puntero del sistema",
           ["cursor_indice"], modoDesplazamiento="libre"),
    _cmd_h("clic_izquierdo", "Clic izquierdo", "confirmacion", "navegacion", "Clic principal", ["cursor_menique"]),
    _cmd_h("clic_derecho", "Clic derecho", "confirmacion", "navegacion", "Menu contextual", ["cursor_pulgar"]),
    _cmd_h("tecla_windows", "Tecla Windows", "tecla", "navegacion", "Abre el menu inicio", ["mano_izq_abierta"],
           teclaEquivalente="windows"),
    _cmd_h("borrar", "Borrar", "cancelacion", "escritura", "Borra el ultimo caracter", ["punio_cursor"],
           teclaEquivalente="backspace"),
]


def _cmd_a(code, name, tipo, cat, desc, gestos, **extra):
    return {"codigoComando": code, "nombreComando": name, "tipoComando": tipo, "categoriaComando": cat,
            "descripcionComando": desc, "gestosSugeridos": gestos, "activo": True, **extra}


COMANDOS_ARQUITECTO = [
    _cmd_a("seleccionar", "Seleccionar modulo", "accion", "manipulacion", "Avanza la seleccion de modulo", ["pinza_izq"]),
    _cmd_a("preview_modulo", "Previsualizar modulo", "accion", "manipulacion", "Resalta el siguiente modulo",
           ["mano_abierta_izq"]),
    _cmd_a("orbitar", "Orbitar camara", "navegacion", "navegacion", "Rota la camara alrededor de la escena",
           ["dos_palmas"]),
    _cmd_a("transformar", "Escalar y rotar", "transformacion", "manipulacion", "Transformacion bimanual",
           ["dos_pinzas"], requiereObjetivoSeleccionado=True, ejesPermitidos=["x", "y", "z"]),
    _cmd_a("rotar", "Rotar modulo", "transformacion", "manipulacion", "Rota sobre el eje vertical", ["indice_der"],
           requiereObjetivoSeleccionado=True, ejesPermitidos=["y"]),
    _cmd_a("elevar", "Elevar modulo", "transformacion", "manipulacion", "Sube o baja el modulo", ["palma_elev_der"],
           requiereObjetivoSeleccionado=True, ejesPermitidos=["y"]),
    _cmd_a("mover", "Mover modulo", "transformacion", "manipulacion", "Desplaza el modulo en el plano",
           ["palma_slide_der", "pinza_der"], requiereObjetivoSeleccionado=True, ejesPermitidos=["x", "z"]),
    _cmd_a("duplicar", "Duplicar modulo", "accion", "manipulacion", "Clona el modulo seleccionado", ["paz_der"],
           requiereObjetivoSeleccionado=True),
    _cmd_a("confirmar", "Confirmar", "accion", "manipulacion", "Fija la transformacion", ["punio_der"]),
    _cmd_a("cancelar", "Cancelar", "accion", "manipulacion", "Revierte la transformacion", ["punio_izq"]),
    _cmd_a("enfocar_zona", "Enfocar zona", "navegacion", "navegacion", "Centra la camara en una zona",
           ["posicion_izq", "posicion_centro", "posicion_der"]),
    _cmd_a("vista_reset", "Restablecer vista", "navegacion", "navegacion", "Vuelve a la perspectiva inicial", []),
]


def _cmd_v(code, name, tipo, cat, desc, gestos, **extra):
    return {"codigoComando": code, "nombreComando": name, "tipoAccion": tipo, "categoriaComando": cat,
            "descripcionComando": desc, "gestosSugeridos": gestos, "activo": True, **extra}


COMANDOS_VIDEOJUEGO = [
    _cmd_v("btn_A", "Disparo", "ataque", "combate", "Boton A", ["mano_der_abierta"], magnitudDefault=1.0),
    _cmd_v("btn_B", "Salto", "movimiento", "combate", "Boton B", ["punio_der_juego"]),
    _cmd_v("btn_C", "Granada", "habilidad", "combate", "Boton C", [], slotHabilidad=1),
    _cmd_v("btn_D", "Accion especial", "habilidad", "combate", "Boton D", [], slotHabilidad=2),
    _cmd_v("start", "Start", "accion", "navegacion", "Inicia o pausa la partida", ["punio_izq_juego"]),
    _cmd_v("coin", "Insertar moneda", "accion", "navegacion", "Agrega un credito", []),
    _cmd_v("arriba", "Arriba", "movimiento", "navegacion", "Direccion arriba / apuntar", ["mano_der_arriba"]),
    _cmd_v("abajo", "Abajo", "movimiento", "navegacion", "Direccion abajo / agacharse", ["mano_der_abajo"]),
    _cmd_v("izquierda", "Izquierda", "movimiento", "navegacion", "Direccion izquierda", ["indice_izq_lateral"]),
    _cmd_v("derecha", "Derecha", "movimiento", "navegacion", "Direccion derecha", ["indice_izq_lateral"]),
]


def _reglas(prefix: str, comandos: list[dict], estado: str) -> list[dict]:
    reglas = []
    for cmd in comandos:
        for prioridad, gesto in enumerate(cmd["gestosSugeridos"], start=1):
            reglas.append({
                "codigoRegla": f"{prefix}-{cmd['codigoComando']}-{gesto}",
                "codigoGesto": gesto,
                "codigoComando": cmd["codigoComando"],
                "prioridadRegla": prioridad,
                "confianzaMinima": 0.7,
                "estadoAplicacion": estado,
                "activo": True,
            })
    return reglas


def _modelo_arquitecto() -> dict[str, Any] | None:
    path = ROOT / "modulo_arquitecto" / "models" / "vision" / "metadata.json"
    if not path.exists():
        return None
    meta = json.loads(path.read_text(encoding="utf-8"))
    tipo = meta.get("tipo_modelo")
    estado = meta.get("estado_modelo")
    model_path = path.with_name("model.json")
    doc = {
        "codigoModelo": meta.get("codigo_modelo") or nexum_db.CODIGO_MODELO_ARQUITECTO,
        "codigoModalidad": meta.get("codigo_modalidad") or "arquitecto_tridimensional",
        "nombreModelo": meta.get("descripcion") or "Clasificador de posiciones",
        "tipoModelo": tipo if tipo in ("clasificador", "lstm", "gru") else "clasificador",
        "versionModelo": "1",
        "gestosEntrenados": list(meta.get("clases") or []),
        "estadoModelo": estado if estado in ("entrenando", "listo", "archivado") else "listo",
        "modeloActivo": True,
        "rutaArchivo": "modulo_arquitecto/models/vision/model.json",
    }
    if model_path.exists():
        doc["fechaEntrenamiento"] = datetime.fromtimestamp(model_path.stat().st_mtime, timezone.utc)
    return doc


def _upsert(database, coll: str, key: str, docs: list[dict], stamp_field: str = "fechaRegistro") -> None:
    stamp = nexum_db.now()
    for doc in docs:
        database[coll].update_one(
            {key: doc[key]}, {"$set": doc, "$setOnInsert": {stamp_field: stamp}}, upsert=True
        )


def seed(database) -> None:
    stamp = nexum_db.now()
    _upsert(database, "catalogo_gestos", "codigoGesto", GESTOS)
    _upsert(database, "modalidades_aplicacion", "codigoModalidad", MODALIDADES)
    _upsert(database, "hibrida_comandos", "codigoComando", COMANDOS_HIBRIDA)
    _upsert(database, "arquitecto_comandos", "codigoComando", COMANDOS_ARQUITECTO)
    _upsert(database, "videojuego_comandos", "codigoComando", COMANDOS_VIDEOJUEGO)
    _upsert(database, "hibrida_reglas_semanticas", "codigoRegla", _reglas("RHI", COMANDOS_HIBRIDA, "escritura"))
    _upsert(database, "arquitecto_reglas_semanticas", "codigoRegla", _reglas("RAR", COMANDOS_ARQUITECTO, "edicion"))
    _upsert(database, "videojuego_reglas_semanticas", "codigoRegla", _reglas("RVI", COMANDOS_VIDEOJUEGO, "juego"))

    database["configuracion_guante"].update_one(
        {"codigoGuante": nexum_db.CODIGO_GUANTE},
        {
            "$set": {
                "codigoMultiplexor": "TCA9548A@0x70",
                "cantidadSensores": 5,
                "mapaSensores": {d: {"canal": c, "sensor": "MPU-6050"} for d, c in zip(DEDOS, [2, 3, 4, 5, 6])},
                "tipoFiltro": "complementario",
                "protocoloComunicacion": "UDP",
                "puertoComunicacion": 5006,
                "versionFirmware": "ManuelAssistGlove",
            },
            "$setOnInsert": {"codigoEsp32": "ESP32", "calibracionActiva": False, "fechaRegistro": stamp},
        },
        upsert=True,
    )
    _upsert(database, "configuracion_vision", "codigoCamara", [{
        "codigoCamara": nexum_db.CODIGO_CAMARA,
        "resolucionCaptura": "1280x720",
        "frecuenciaCapturaFps": 30,
        "modeloDeteccion": "mediapipe_hand_landmarker",
        "cantidadManosMaxima": 2,
        "confianzaDeteccion": 0.6,
        "confianzaSeguimiento": 0.5,
        "espejoHorizontal": True,
        "normalizarCoordenadas": True,
        "configuracionActiva": True,
    }])
    database["configuracion_sistema"].update_one(
        {"codigoConfiguracion": "CFG-SISTEMA-01"},
        {"$set": {
            "modalidadActiva": "interaccion_hibrida",
            "tamanoBuffer": 256,
            "confianzaMinimaGlobal": 0.7,
            "tiempoDebounceGlobalMs": 120,
            "ttlTelemetriaDias": 7,
            "rutaArchivos": "project/bd",
            "configuracionActiva": True,
        }, "$setOnInsert": {"fechaActualizacion": stamp}},
        upsert=True,
    )
    _upsert(database, "hibrida_configuracion", "codigoConfiguracion", [{
        "codigoConfiguracion": "CFG-HIBRIDA-01", "motorDestino": "navegador", "layoutTeclado": "personalizado",
        "teclaConfirmacion": "auto", "teclaCancelacion": "backspace", "permiteDosManos": True,
        "tiempoDebounceMs": 120, "configuracionActiva": True,
    }])
    _upsert(database, "arquitecto_configuracion", "codigoConfiguracion", [{
        "codigoConfiguracion": "CFG-ARQUITECTO-01", "motorDestino": "threejs", "gridVisible": True,
        "unidadMedida": "metros", "modoCamara": "orbita", "snapActivado": True, "permiteDosManos": True,
        "tiempoDebounceMs": 150, "configuracionActiva": True,
    }])
    _upsert(database, "videojuego_configuracion", "codigoConfiguracion", [{
        "codigoConfiguracion": "CFG-VIDEOJUEGO-01", "motorDestino": "navegador",
        "mapeoBotones": {"disparo": "btn_A", "salto": "btn_B", "granada": "btn_C", "inicio": "start"},
        "permiteDosManos": True, "tiempoDebounceMs": 60, "configuracionActiva": True,
    }])
    modelo = _modelo_arquitecto()
    if modelo:
        _upsert(database, "modelos_entrenados", "codigoModelo", [modelo])
