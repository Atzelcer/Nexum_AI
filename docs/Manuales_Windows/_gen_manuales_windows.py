# -*- coding: utf-8 -*-
"""Genera los 6 manuales NEXUM AI para PC Windows (DOCX + ODT) con capturas reales."""
from __future__ import annotations

from pathlib import Path

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Inches, Pt, RGBColor

ROOT = Path(__file__).resolve().parent
CAPS = ROOT / "capturas"
OUT = ROOT


def set_run_black(run) -> None:
    run.font.color.rgb = RGBColor(0, 0, 0)
    run.font.name = "Calibri"
    run._element.rPr.rFonts.set(qn("w:eastAsia"), "Calibri")


def add_title(doc, text: str) -> None:
    p = doc.add_heading(text, level=0)
    for run in p.runs:
        set_run_black(run)
        run.font.size = Pt(18)


def add_h(doc, text: str, level: int = 1) -> None:
    p = doc.add_heading(text, level=level)
    for run in p.runs:
        set_run_black(run)


def add_p(doc, text: str):
    p = doc.add_paragraph(text)
    for run in p.runs:
        set_run_black(run)
        run.font.size = Pt(11)
    return p


def add_img(doc, name: str, width: float = 5.8, caption: str | None = None) -> None:
    path = CAPS / name
    if not path.exists():
        add_p(doc, f"[Imagen no disponible: {name}]")
        return
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run()
    run.add_picture(str(path), width=Inches(width))
    if caption:
        c = doc.add_paragraph(caption)
        c.alignment = WD_ALIGN_PARAGRAPH.CENTER
        for r in c.runs:
            set_run_black(r)
            r.font.size = Pt(9)
            r.italic = True


def add_table(doc, headers, rows) -> None:
    t = doc.add_table(rows=1 + len(rows), cols=len(headers))
    t.style = "Table Grid"
    for i, h in enumerate(headers):
        cell = t.rows[0].cells[i]
        cell.text = h
        for p in cell.paragraphs:
            for r in p.runs:
                set_run_black(r)
                r.bold = True
        shd = OxmlElement("w:shd")
        shd.set(qn("w:fill"), "EEEEEE")
        shd.set(qn("w:val"), "clear")
        cell._tc.get_or_add_tcPr().append(shd)
    for ri, row in enumerate(rows):
        for ci, val in enumerate(row):
            cell = t.rows[ri + 1].cells[ci]
            cell.text = str(val)
            for p in cell.paragraphs:
                for r in p.runs:
                    set_run_black(r)
    doc.add_paragraph()


def new_doc():
    doc = Document()
    section = doc.sections[0]
    section.top_margin = Cm(1.8)
    section.bottom_margin = Cm(1.8)
    section.left_margin = Cm(2)
    section.right_margin = Cm(2)
    return doc


REPO_URL = "https://github.com/Atzelcer/Nexum_AI"
REPO_GIT = "https://github.com/Atzelcer/Nexum_AI.git"


def build_install():
    d = new_doc()
    add_title(d, "NEXUM AI — Manual de instalacion (Windows)")
    add_p(
        d,
        "Guia para dejar NEXUM AI listo en una computadora con Windows 10/11. "
        "Todo corre de forma nativa en el PC (sin maquina virtual).",
    )

    add_h(d, "1. Repositorio en GitHub")
    add_table(
        d,
        ["Dato", "Valor"],
        [
            ["URL del proyecto", REPO_URL],
            ["Clonar con Git", f"git clone {REPO_GIT}"],
            ["Rama principal", "main"],
            ["Autor / cuenta", "Atzelcer"],
        ],
    )
    add_p(
        d,
        "Tambien puedes descargar el ZIP desde GitHub (Code → Download ZIP) "
        "o usar la carpeta 02_Codigo_fuente de la entrega NEXUM_ENTREGA.",
    )

    add_h(d, "2. Que vas a instalar")
    add_table(
        d,
        ["Componente", "Rol"],
        [
            ["Python 3.10 + .venv", "Puente, servidor web y dependencias IA"],
            ["MongoDB", "Usuarios, sesiones, historial y escenas"],
            ["nexum_http.py", "Portal y paneles en el navegador (:8090)"],
            ["nexum_bridge.py", "Guante UDP + WebSockets de los 3 modulos"],
            ["Chrome o Edge", "Interfaz, camara y vision MediaPipe"],
            ["Driver USB CP210x/CH340", "Primera configuracion WiFi del guante"],
        ],
    )

    add_h(d, "3. Requisitos")
    add_table(
        d,
        ["Elemento", "Detalle"],
        [
            ["Sistema", "Windows 10 o 11 (64 bits)"],
            ["RAM", "8 GB minimo · 16 GB recomendado para vision"],
            ["Disco", "~3 GB libres (venv + modelos)"],
            ["Red", "WiFi 2.4 GHz (guante y PC en la misma red) + Internet (CDN)"],
            ["Camara", "Integrada o USB 720p para vision"],
            ["USB", "Cable al ESP32 para primera config WiFi"],
            ["Git (opcional)", "Para clonar desde GitHub"],
        ],
    )

    add_h(d, "4. Preparacion (una sola vez)")
    add_h(d, "4.0 Obtener el codigo", 2)
    add_table(
        d,
        ["Paso", "Comando / accion"],
        [
            ["1", f"git clone {REPO_GIT}"],
            ["2", "cd Nexum_AI"],
            ["3", "O usar NEXUM_ENTREGA\\02_Codigo_fuente si viene en la entrega"],
        ],
    )
    add_p(d, "Abrir PowerShell o Git Bash en la carpeta raiz del proyecto.")
    add_h(d, "4.1 Entorno Python", 2)
    add_table(
        d,
        ["Paso", "Comando"],
        [
            ["1", "python -m venv .venv"],
            ["2", ".\\.venv\\Scripts\\Activate.ps1"],
            ["3", "python -m pip install --upgrade pip"],
            ["4", "pip install -r requirements.txt"],
        ],
    )
    add_h(d, "4.2 MongoDB", 2)
    add_table(
        d,
        ["Paso", "Accion"],
        [
            ["1", "winget install --id MongoDB.Server --exact"],
            ["2", "Comprobar: sc query MongoDB  (o net start MongoDB)"],
            ["3", "python scripts/nexum_db_init.py"],
            ["4", "Opcional: python scripts/nexum_db_init.py --estado"],
        ],
    )
    add_p(
        d,
        "La init crea la base nexum_ai, indices y cuentas de prueba. "
        "Puede ejecutarse varias veces sin duplicar datos.",
    )
    add_h(d, "4.3 Firmware del guante (solo si es la primera carga)", 2)
    add_p(
        d,
        "Carga el firmware del ESP32 una sola vez con Arduino IDE "
        "(carpeta modulo_teclado/hardware-firdware/ManuelAssistGlove/). "
        "Despues la red WiFi se cambia desde el panel, sin volver a abrir Arduino.",
    )
    add_h(d, "4.4 Driver USB", 2)
    add_p(
        d,
        "Conecta el ESP32. En Administrador de dispositivos debe aparecer un "
        "puerto COM (Silicon Labs CP210x o CH340). Si no: instala el driver "
        "del fabricante y vuelve a enchufar.",
    )

    add_h(d, "5. Arranque diario")
    add_table(
        d,
        ["Orden", "Accion"],
        [
            ["0", "MongoDB activo (servicio Windows)"],
            ["1", "PC en WiFi 2.4 GHz"],
            ["2", "Terminal A: .venv\\Scripts\\python.exe -u scripts\\nexum_http.py"],
            ["3", "Terminal B: .venv\\Scripts\\python.exe -u scripts\\nexum_bridge.py"],
            ["4", "Navegador: http://127.0.0.1:8090/  (no abras HTML a doble clic)"],
        ],
    )
    add_p(
        d,
        "Deja las dos terminales abiertas. Solo un puente a la vez "
        "(el UDP 5005 es exclusivo).",
    )
    add_table(
        d,
        ["Servicio", "Salida esperada (resumen)"],
        [
            ["HTTP", "NEXUM HTTP http://127.0.0.1:8090/  · MongoDB conectada"],
            ["Bridge", "UDP 5005 · Laboratorio :8765 · Juego :8766 · Arquitecto :8767"],
        ],
    )

    add_h(d, "6. Primera comprobacion")
    add_img(d, "01_portal_login.png", 5.5, "Figura 1. Portal NEXUM AI — iniciar sesion")
    add_table(
        d,
        ["Dato", "Valor de prueba"],
        [
            ["Portal", "http://127.0.0.1:8090/"],
            ["Usuario", "Atzel / samuel@gmail.com / atzel@nexum.ai"],
            ["Contrasena", "1234"],
        ],
    )
    add_img(d, "03_portal_modulos.png", 5.8, "Figura 2. Tras login y Conectar fuente: modulos listos")
    add_p(
        d,
        "Barra inferior: Servidor en linea, Puente, Fuente y Cuenta. "
        "Si Servidor o Puente fallan, revisa las terminales.",
    )

    add_h(d, "7. Puertos usados")
    add_table(
        d,
        ["Puerto", "Servicio"],
        [
            ["8090", "Portal HTTP y paneles"],
            ["8765", "WebSocket laboratorio"],
            ["8766", "WebSocket juego"],
            ["8767", "WebSocket arquitecto"],
            ["27017", "MongoDB"],
            ["5005 / 5006", "UDP guante"],
        ],
    )

    add_h(d, "8. Apagado")
    add_p(
        d,
        "Cierra las pestanas del navegador y deten las dos terminales con Ctrl+C. "
        "MongoDB puede quedar como servicio de Windows.",
    )
    add_h(d, "9. Enlace permanente")
    add_p(d, f"Codigo fuente y actualizaciones: {REPO_URL}")
    d.save(OUT / "01_Manual_de_Instalacion.docx")
    return "01_Manual_de_Instalacion.docx"


def build_uso():
    d = new_doc()
    add_title(d, "NEXUM AI — Manual de uso (Windows)")
    add_p(
        d,
        "Guia completa del portal y de las tres modalidades en PC Windows: "
        "que hace cada modulo, como se entra y todos los movimientos "
        "(guante, camara, mouse y teclado).",
    )
    add_p(d, f"Codigo fuente: {REPO_URL}")

    add_h(d, "1. Iniciar sesion")
    add_img(d, "01_portal_login.png", 5.2, "Figura 1. Ventana Iniciar sesion")
    add_table(
        d,
        ["Campo", "Ejemplo"],
        [
            ["Nombre o correo", "Atzel"],
            ["Contrasena", "1234"],
        ],
    )

    add_h(d, "2. Configurar fuente")
    add_img(d, "02_portal_configurar.png", 5.2, "Figura 2. Elegir Hardware (guante) o Vision")
    add_table(
        d,
        ["Fuente", "Cuando usarla"],
        [
            ["Hardware (guante)", "ESP32 en la misma WiFi 2.4 GHz que el PC"],
            ["Vision MediaPipe", "Control con camara web (manos)"],
        ],
    )
    add_p(d, "Pulsa Conectar fuente para desbloquear las modalidades.")

    add_h(d, "3. Vista general de los 3 modulos")
    add_img(d, "03_portal_modulos.png", 5.8, "Figura 3. Portal con sesion activa y modulos listos")
    add_table(
        d,
        ["Modulo", "Entrada principal", "Para que sirve"],
        [
            [
                "01 Interaccion hibrida",
                "Guante (+ camara en modo CUR)",
                "Escribir letras/numeros y controlar el mouse del PC",
            ],
            [
                "02 Arquitecto 3D",
                "Camara (2 manos) o mouse/teclado",
                "Armar y editar una casa modular en 3D",
            ],
            [
                "03 Videojuego",
                "Camara (2 manos) o teclado",
                "Jugar titulos Neo Geo / arcade con gestos",
            ],
        ],
    )
    add_p(
        d,
        "Atajos del portal: teclas 1, 2 y 3 entran a cada modalidad. "
        "Boton Cerrar o el logo NEXUM vuelven al portal.",
    )

    # ——— MODULO 01 ———
    add_h(d, "4. Modulo 01 — Interaccion hibrida")
    add_img(d, "05_lab_conectado.png", 5.8, "Figura 4. Laboratorio: brazo 3D, puente y mapa de letras")
    add_p(
        d,
        "Es el laboratorio del guante. El modelo 3D refleja la mano; "
        "abajo aparece el texto que escribes; a la derecha estan el enlace "
        "(puente / guante / calibrado / activo) y la ayuda de escritura.",
    )

    add_h(d, "4.1 Arranque del laboratorio", 2)
    add_table(
        d,
        ["Paso", "Accion"],
        [
            ["1", "Entrar a Interaccion hibrida desde el portal"],
            ["2", "Configurar WiFi del guante (modal) o Omitir si ya esta enlazado"],
            ["3", "Pulsa Conectar puente (debe quedar Puente: conectado)"],
            ["4", "Enciende el guante y espera el emparejamiento WiFi"],
            ["5", "Pulsa Calibrar (barra al 100%) y luego Iniciar"],
        ],
    )

    add_h(d, "4.2 Como escribir con el guante (modo ABC)", 2)
    add_table(
        d,
        ["Paso", "Movimiento"],
        [
            ["1", "Levanta UN dedo: cada toque avanza a la siguiente letra de su grupo"],
            ["2", "Quedate quieto 2.5 s: la letra se confirma sola"],
            ["3", "Levanta 4 dedos a la vez: se abre la rueda ABC · 123 · CUR"],
            ["4", "Con la rueda abierta, toca 1 dedo para pasar a la siguiente opcion"],
            ["5", "Espera 2 s o vuelve a levantar 4 dedos para confirmar el modo"],
        ],
    )

    add_h(d, "4.3 Mapa de letras por dedo (modo ABC)", 2)
    add_table(
        d,
        ["Dedo", "Letras (toques 1, 2, 3…)"],
        [
            ["Pulgar", "a b c d e f"],
            ["Indice", "g h i j k l"],
            ["Medio", "m n ñ o p"],
            ["Anular", "q r s t u"],
            ["Menique", "v w x y z"],
        ],
    )

    add_h(d, "4.4 Mapa de numeros por dedo (modo 123)", 2)
    add_table(
        d,
        ["Dedo", "Simbolos"],
        [
            ["Pulgar", "1  2  +"],
            ["Indice", "3  4  -"],
            ["Medio", "5  6  *"],
            ["Anular", "7  8  /"],
            ["Menique", "9  0  .  ;"],
        ],
    )

    add_h(d, "4.5 Modo CUR — cursor con la camara", 2)
    add_p(
        d,
        "En modo CUR el mouse del Windows se controla con la camara (MediaPipe). "
        "Activa la vision en el laboratorio si pide permiso de camara.",
    )
    add_table(
        d,
        ["Gesto (camara)", "Accion"],
        [
            ["Indice", "Mover el cursor"],
            ["Menique", "Clic izquierdo"],
            ["Pulgar", "Clic derecho"],
            ["Punio", "Borrar (mantener = repetir)"],
            ["Mano izquierda abierta", "Tecla Windows"],
        ],
    )

    add_h(d, "4.6 Botones utiles del laboratorio", 2)
    add_table(
        d,
        ["Boton", "Que hace"],
        [
            ["Conectar puente", "Abre el WebSocket con nexum_bridge"],
            ["Calibrar / Iniciar / Pausar", "Flujo del guante"],
            ["Red WiFi del guante", "Reabre el modal de red / USB COM"],
            ["Demo", "Recorre letras de ejemplo sin guante"],
            ["Reset / Centrar", "Reinicia pose 3D o centra la camara orbit"],
            ["Copiar / Borrar / Limpiar", "Gestionan el texto de salida"],
        ],
    )

    # ——— MODULO 02 ———
    add_h(d, "5. Modulo 02 — Arquitecto 3D")
    add_img(d, "06_arquitecto.png", 5.8, "Figura 5. Casa modular y panel de gestos")
    add_p(
        d,
        "Editas una maqueta (Sala, Cocina, Dormitorio, Terraza, Escalera…). "
        "La mano izquierda elige el modulo; la derecha lo transforma. "
        "Tambien puedes trabajar solo con mouse y teclado.",
    )

    add_h(d, "5.1 Arranque", 2)
    add_table(
        d,
        ["Paso", "Accion"],
        [
            ["1", "Entrar a Arquitecto 3D"],
            ["2", "Pulsa Activar camara (si vas a usar gestos)"],
            ["3", "Ponte a un brazo de la webcam, con luz de frente"],
            ["4", "Pinza izquierda para elegir modulo; palma derecha para mover"],
        ],
    )

    add_h(d, "5.2 Gestos con camara (2 manos)", 2)
    add_table(
        d,
        ["Gesto", "Mano", "Accion"],
        [
            ["Pinza (pulgar+indice)", "Izquierda", "Elegir / pasar al siguiente modulo"],
            ["Mano abierta", "Izquierda", "Previsualizar el proximo modulo"],
            ["Punio", "Izquierda", "Cancelar"],
            ["Palma deslizada ←→", "Derecha", "Mover en horizontal (eje X)"],
            ["Palma ↑↓", "Derecha", "Subir / bajar (altura)"],
            ["Indice girando", "Derecha", "Rotar el modulo"],
            ["Paz (V)", "Derecha", "Duplicar"],
            ["Punio", "Derecha", "Confirmar"],
            ["2 pinzas a la vez", "Ambas", "Escalar (+ rotar)"],
            ["2 palmas abiertas", "Ambas", "Orbitar la escena"],
        ],
    )

    add_h(d, "5.3 Mouse y teclado", 2)
    add_table(
        d,
        ["Control", "Accion"],
        [
            ["Clic + arrastrar", "Mover el modulo"],
            ["Flechas", "Mover · Shift+flechas = altura"],
            ["R / Q", "Rotar"],
            ["+ / -", "Escalar"],
            ["Tab", "Cambiar de modulo"],
            ["G", "Alinear"],
            ["Ctrl+D", "Duplicar"],
            ["Supr", "Eliminar"],
            ["Ctrl+Z / Ctrl+S", "Deshacer / Guardar"],
            ["1–4", "Herramientas (mover, subir, rotar, escalar)"],
            ["V / P / F / L", "Vistas 3D / Planta / Frente / Lado"],
        ],
    )

    # ——— MODULO 03 ———
    add_h(d, "6. Modulo 03 — Control de videojuego")
    add_img(d, "07_juego.png", 5.8, "Figura 6. Biblioteca Neo Geo, mando virtual y camara")
    add_p(
        d,
        "Elige un juego de la biblioteca (Metal Slug, KOF, etc.), pulsa Jugar "
        "y controla con camara o teclado. Mano izquierda = movimiento; "
        "mano derecha = acciones (disparo, salto…).",
    )

    add_h(d, "6.1 Arranque", 2)
    add_table(
        d,
        ["Paso", "Accion"],
        [
            ["1", "Entrar a Videojuego"],
            ["2", "Elige un titulo en Biblioteca (o doble clic)"],
            ["3", "Pulsa Jugar"],
            ["4", "Opcional: Activar camara (o deja que se encienda al jugar)"],
            ["5", "Punio izquierdo = moneda + START para comenzar la partida"],
        ],
    )

    add_h(d, "6.2 Gestos — mano izquierda (mover)", 2)
    add_table(
        d,
        ["Gesto", "Accion en el juego"],
        [
            ["Indice a la derecha", "Avanza"],
            ["Indice a la izquierda", "Retrocede / cubrirse"],
            ["Solo menique", "Arriba / accion extra"],
            ["Punio", "Moneda + START"],
        ],
    )

    add_h(d, "6.3 Gestos — mano derecha (actuar)", 2)
    add_table(
        d,
        ["Gesto", "Accion en el juego"],
        [
            ["Palma abierta", "Disparo / golpe (rafaga)"],
            ["Punio", "Salto / patada"],
            ["Indice hacia abajo", "Agacharse"],
        ],
    )

    add_h(d, "6.4 Teclado (sin camara)", 2)
    add_table(
        d,
        ["Tecla", "Accion"],
        [
            ["Flechas", "Mover"],
            ["Z X C V", "Botones A B C D"],
            ["Enter", "START"],
            ["5", "Moneda"],
            ["Espacio", "Pausa"],
            ["M", "Sonido"],
            ["F", "Pantalla completa"],
        ],
    )

    add_h(d, "7. Consejos generales")
    add_table(
        d,
        ["Tema", "Consejo"],
        [
            ["Luz", "Iluminacion de frente; evita contraluz fuerte"],
            ["Distancia", "Un brazo de la webcam; ambas manos dentro del cuadro"],
            ["Guante", "Misma WiFi 2.4 GHz; USB ayuda la primera configuracion"],
            ["Vision lenta", "Cierra otras apps; 16 GB RAM ayuda con MediaPipe"],
            ["Permisos", "Permite camara en Windows y en Chrome/Edge"],
        ],
    )

    d.save(OUT / "02_Manual_de_Uso.docx")
    return "02_Manual_de_Uso.docx"


def build_personal():
    d = new_doc()
    add_title(d, "NEXUM AI — Manual de uso personal (Windows)")
    add_p(
        d,
        "Rutina practica de 15 minutos para entrenar solo. "
        "Para el detalle completo de gestos usa el Manual de uso (02).",
    )

    add_h(d, "1. Antes de empezar (2 min)")
    add_table(
        d,
        ["Check", "Accion"],
        [
            ["MongoDB", "Servicio activo (net start MongoDB si hace falta)"],
            ["Terminales", "nexum_http.py + nexum_bridge.py corriendo"],
            ["Navegador", "http://127.0.0.1:8090/"],
            ["Login", "Atzel / 1234 (o crea tu cuenta)"],
            ["Fuente", "Vision (camara) o Hardware (guante) → Conectar"],
        ],
    )
    add_img(d, "01_portal_login.png", 4.8, "Figura 1. Login de practica")

    add_h(d, "2. Rutina de 15 minutos")
    add_img(d, "03_portal_modulos.png", 5.5, "Figura 2. Portal listo — elige 1, 2 o 3")
    add_table(
        d,
        ["Minutos", "Modulo", "Que practicar"],
        [
            ["0–2", "Portal", "Login + Conectar fuente"],
            ["2–7", "01 Hibrida", "Puente → calibrar → escribir tu nombre · rueda ABC/123/CUR"],
            ["7–11", "02 Arquitecto", "Activar camara · pinza izq elige · palma der mueve un modulo"],
            ["11–15", "03 Juego", "Jugar · punio izq START · o teclado flechas + Z X C V"],
        ],
    )

    add_h(d, "3. Mini-mapa de movimientos (recordatorio)")
    add_h(d, "3.1 Interaccion hibrida", 2)
    add_table(
        d,
        ["Movimiento", "Efecto"],
        [
            ["1 dedo arriba", "Cambia letra del grupo"],
            ["Quieto 2.5 s", "Confirma letra"],
            ["4 dedos", "Abre rueda ABC · 123 · CUR"],
            ["CUR: indice / menique / pulgar", "Mover cursor / clic izq / clic der"],
        ],
    )
    add_h(d, "3.2 Arquitecto 3D", 2)
    add_table(
        d,
        ["Movimiento", "Efecto"],
        [
            ["Pinza izquierda", "Siguiente modulo"],
            ["Palma derecha ←→ / ↑↓", "Mover / subir-bajar"],
            ["Indice derecho", "Rotar"],
            ["2 pinzas / 2 palmas", "Escalar / orbitar"],
        ],
    )
    add_h(d, "3.3 Videojuego", 2)
    add_table(
        d,
        ["Movimiento", "Efecto"],
        [
            ["Indice izq ←→", "Mover personaje"],
            ["Punio izquierdo", "Moneda + START"],
            ["Palma / punio derecho", "Disparo / salto"],
            ["Teclado Z X C V", "Botones A B C D"],
        ],
    )
    add_img(d, "05_lab_conectado.png", 5.2, "Figura 3. Practica en laboratorio")
    add_img(d, "06_arquitecto.png", 5.2, "Figura 4. Practica en arquitecto")
    add_img(d, "07_juego.png", 5.2, "Figura 5. Practica en videojuego")

    add_h(d, "4. Consejos para practicar solo")
    add_table(
        d,
        ["Tema", "Consejo"],
        [
            ["Luz", "De frente a la webcam; evita contraluz"],
            ["Distancia", "Un brazo; ambas manos en el cuadro"],
            ["Sin guante", "Usa Vision + Demo / teclado en cada modulo"],
            ["Con guante", "Misma WiFi 2.4 GHz; USB la primera vez"],
            ["Cansancio", "Si la vision falla, pausa 30 s y reactiva camara"],
            ["Detalle", "Lee Manual 02 para tablas completas de gestos"],
        ],
    )
    d.save(OUT / "03_Manual_de_Uso_Personal.docx")
    return "03_Manual_de_Uso_Personal.docx"


def build_guante():
    d = new_doc()
    add_title(d, "NEXUM AI — Manual del guante y la red (Windows)")
    add_p(
        d,
        "Como enlazar el ESP32 con el PC Windows: WiFi 2.4 GHz, USB (COM), "
        "modal del laboratorio, calibracion y verificacion.",
    )

    add_h(d, "1. Requisitos")
    add_table(
        d,
        ["Requisito", "Detalle"],
        [
            ["Banda", "Solo WiFi 2.4 GHz (el ESP32 no ve 5 GHz)"],
            ["Misma red", "PC y guante en el mismo SSID"],
            ["Puente", "nexum_bridge.py en ejecucion"],
            ["USB", "Puerto COM visible (CP210x / CH340) para primera config"],
            ["Firmware", "Cargado una vez; luego la red se cambia desde el panel"],
        ],
    )

    add_h(d, "2. Fuente Hardware en el portal")
    add_img(d, "02_portal_configurar.png", 5.0, "Figura 1. Activar Hardware (guante) y Conectar fuente")
    add_p(
        d,
        "En Configurar elige Hardware → Conectar fuente. "
        "El estado del portal debe mostrar el puente listo.",
    )

    add_h(d, "3. Modal Red WiFi del guante")
    add_img(d, "04_lab_wifi_modal.png", 5.4, "Figura 2. Modal Red WiFi — USB COM detectado")
    add_table(
        d,
        ["Paso", "Accion"],
        [
            ["1", "Entra a Interaccion hibrida"],
            ["2", "Se abre el modal (o pulsa Red WiFi del guante)"],
            ["3", "Revisa SSID y contrasena sugeridos (red del PC)"],
            ["4", "Con cable USB: el sistema detecta COM y envia la config"],
            ["5", "Sin cable: solo funciona si el guante ya esta en la misma red"],
            ["6", "Espera WIFI_OK / datos del guante; el modal se cierra al verificar"],
            ["7", "Mueve un dedo si pide verificacion antes de cerrar"],
        ],
    )
    add_p(
        d,
        "Prioridad USB: es el camino mas rapido y fiable la primera vez. "
        "Si el COM no aparece o dice ocupado: libera el USB de VirtualBox "
        "al host Windows, reinstala/activa el driver y reenchufa.",
    )

    add_h(d, "4. Emparejamiento y calibracion")
    add_img(d, "05_lab_conectado.png", 5.8, "Figura 3. Puente conectado — esperando guante / calibrar")
    add_table(
        d,
        ["Paso", "Que mirar"],
        [
            ["Conectar puente", "Badge Puente: conectado"],
            ["Encender guante", "Mensaje de emparejamiento / guante enlazado"],
            ["Calibrar", "Barra al 100%"],
            ["Iniciar", "Flujo activo: dedos escriben letras"],
            ["Pausar / Cerrar", "Detiene o corta el enlace del panel"],
        ],
    )
    add_p(
        d,
        "En la terminal del puente deberias ver trafico UDP (MA_HELLO, "
        "SYS:PC_CONECTADA, guante enlazado con su IP).",
    )

    add_h(d, "5. Alternativa sin cable (resumen)")
    add_p(
        d,
        "Si el guante ya guardo una red y esta en la misma WiFi 2.4 GHz "
        "que el PC, el puente lo encuentra por UDP. El modal puede "
        "auto-verificar cuando llegan datos de dedos. Si no hay enlace, "
        "vuelve al cable USB.",
    )

    add_h(d, "6. Puertos y servicios")
    add_table(
        d,
        ["Puerto", "Servicio"],
        [
            ["8090", "Portal HTTP"],
            ["8765", "WebSocket laboratorio (guante)"],
            ["8766 / 8767", "WebSocket juego / arquitecto"],
            ["5005 / 5006", "UDP del guante"],
            ["COMx", "Serie USB (numero variable: COM3, COM4…)"],
        ],
    )

    add_h(d, "7. Fallos tipicos del guante")
    add_table(
        d,
        ["Sintoma", "Que hacer"],
        [
            ["COM ausente", "Driver CP210x/CH340; otro cable USB de datos"],
            ["COM ocupado", "Cierra Arduino/Serial Monitor; libera VirtualBox USB"],
            ["Sin WIFI_OK", "SSID 2.4 GHz correcto; contrasena sin errores"],
            ["Puente sin guante", "Reinicia bridge; enciende guante cerca del router"],
            ["Dedos no escriben", "Calibrar al 100% e Iniciar; modo ABC activo"],
        ],
    )
    d.save(OUT / "04_Manual_Guante_y_Red.docx")
    return "04_Manual_Guante_y_Red.docx"


def build_problemas():
    d = new_doc()
    add_title(d, "NEXUM AI — Solucion de problemas (Windows)")
    add_p(
        d,
        "Guia de fallos frecuentes en PC Windows: servicios, portal, guante, "
        "camara y vision. Revisa primero la barra de estado del portal.",
    )
    add_p(d, f"Repositorio y actualizaciones: {REPO_URL}")
    add_img(d, "03_portal_modulos.png", 5.5, "Figura 1. Servidor / Puente / Fuente / Cuenta")

    add_h(d, "1. Portal y servicios")
    add_table(
        d,
        ["Sintoma", "Causa probable", "Que hacer"],
        [
            ["No abre el portal", "HTTP apagado", "Arrancar nexum_http.py; curl http://127.0.0.1:8090/"],
            ["Servidor offline", "Puerto 8090 ocupado o script caido", "netstat -ano | findstr :8090; reiniciar HTTP"],
            ["Puente apagado", "Bridge no corre / firewall", "Reiniciar nexum_bridge.py; permitir Python"],
            ["Modulos bloqueados", "Sin sesion o sin fuente", "Login + Configurar → Conectar fuente"],
            ["Pagina en blanco", "Sin Internet (CDN)", "Conecta Internet; recarga forzada Ctrl+F5"],
            ["HTML a doble clic", "file:// sin camara ni WS", "Usa siempre http://127.0.0.1:8090/"],
        ],
    )

    add_h(d, "2. Guante, WiFi y USB")
    add_img(d, "04_lab_wifi_modal.png", 5.2, "Figura 2. Modal WiFi — revisa COM y SSID 2.4 GHz")
    add_table(
        d,
        ["Sintoma", "Que hacer"],
        [
            ["Guante no conecta", "Misma WiFi 2.4 GHz; USB primera vez; reinicia bridge"],
            ["COM no aparece", "Driver CP210x/CH340; cable de datos; otro puerto USB"],
            ["COM ocupado / Captured", "Liberar USB de VirtualBox al host Windows"],
            ["WIFI_ERROR", "SSID/clave; evita redes solo 5 GHz"],
            ["Calibracion trabada", "Reinicia guante; Reset en el lab; vuelve a Calibrar"],
            ["Escribe mal / nada", "Modo ABC; quieto 2.5 s; revisa mapeo de dedos"],
        ],
    )

    add_h(d, "3. Camara y vision")
    add_table(
        d,
        ["Sintoma", "Que hacer"],
        [
            ["Sin camara", "Permisos Windows + Chrome/Edge; cierra Zoom/Teams que la bloqueen"],
            ["Gestos no responden", "Luz de frente; un brazo; ambas manos en cuadro; reactivar camara"],
            ["Vision lenta / OOM", "Cierra Chrome pesado; 16 GB RAM; una sola pestana de vision"],
            ["Arquitecto no elige", "Pinza clara (pulgar+indice); espera el badge de comando"],
            ["Juego no dispara", "Palma derecha abierta bien visible; perfil del titulo"],
        ],
    )

    add_h(d, "4. MongoDB y login")
    add_table(
        d,
        ["Sintoma", "Que hacer"],
        [
            ["Error de base", "net start MongoDB; python scripts/nexum_db_init.py --estado"],
            ["No inicia sesion", "Usuario/clave 1234 de prueba; o Crear cuenta"],
            ["Datos raros", "python scripts/nexum_db_init.py (seguro) o --reset (borra todo)"],
        ],
    )

    add_h(d, "5. Comandos utiles (PowerShell)")
    add_table(
        d,
        ["Comando", "Uso"],
        [
            ["netstat -ano | findstr :8090", "HTTP escuchando"],
            ["netstat -ano | findstr :8765", "Puente escuchando"],
            ["curl http://127.0.0.1:8090/", "Probar portal"],
            ["sc query MongoDB", "Estado MongoDB"],
            ["python scripts/nexum_db_init.py --estado", "Colecciones / conexion"],
            ["Get-PnpDevice -Class Ports", "Listar puertos COM"],
        ],
    )

    add_h(d, "6. Orden de recuperacion rapida")
    add_table(
        d,
        ["#", "Accion"],
        [
            ["1", "Reinicia nexum_http.py y nexum_bridge.py"],
            ["2", "Recarga el portal con Ctrl+F5"],
            ["3", "Login + Conectar fuente"],
            ["4", "Si hay guante: USB → modal WiFi → Calibrar → Iniciar"],
            ["5", "Si hay vision: permitir camara y luz estable"],
        ],
    )
    add_img(d, "05_lab_conectado.png", 5.2, "Figura 3. Laboratorio sano: Puente conectado")
    d.save(OUT / "05_Solucion_de_Problemas.docx")
    return "05_Solucion_de_Problemas.docx"


def build_referencia():
    d = new_doc()
    add_title(d, "NEXUM AI — Referencia rapida (Windows)")
    add_p(d, "Hoja de consulta: accesos, checklist, rutas y gestos clave.")

    add_h(d, "1. Accesos")
    add_table(
        d,
        ["Elemento", "Valor"],
        [
            ["GitHub", REPO_URL],
            ["Clonar", f"git clone {REPO_GIT}"],
            ["Portal", "http://127.0.0.1:8090/"],
            ["Login prueba", "Atzel / 1234"],
            ["HTTP", ".venv\\Scripts\\python.exe -u scripts\\nexum_http.py"],
            ["Bridge", ".venv\\Scripts\\python.exe -u scripts\\nexum_bridge.py"],
            ["Manuales", "docs\\Manuales_Windows\\"],
        ],
    )
    add_img(d, "03_portal_modulos.png", 5.5, "Figura 1. Portal")

    add_h(d, "2. Checklist de arranque")
    add_table(
        d,
        ["#", "Pregunta", "Si/No"],
        [
            ["1", "MongoDB activo?", ""],
            ["2", "HTTP :8090 y bridge :8765 arriba?", ""],
            ["3", "Puedo iniciar sesion?", ""],
            ["4", "Fuente conectada (Hardware o Vision)?", ""],
            ["5", "Camara permitida (si usas vision)?", ""],
            ["6", "COM USB visible (si usas guante)?", ""],
        ],
    )

    add_h(d, "3. Rutas de modulos")
    add_table(
        d,
        ["Modulo", "Ruta", "Tecla portal"],
        [
            ["Portal", "/", "—"],
            ["Interaccion hibrida", "/modulo_teclado/laboratorio-web/", "1"],
            ["Arquitecto 3D", "/modulo_arquitecto/panel/", "2"],
            ["Videojuego", "/modulo_game/panel/", "3"],
        ],
    )

    add_h(d, "4. Gestos clave (resumen)")
    add_table(
        d,
        ["Modulo", "Movimientos esenciales"],
        [
            ["01 Hibrida", "1 dedo=letra · 2.5 s confirma · 4 dedos=rueda ABC/123/CUR"],
            ["01 CUR", "Indice mover · Menique clic izq · Pulgar clic der · Punio borrar"],
            ["02 Arquitecto", "Pinza izq elige · Palma der mueve/eleva · Indice rota · 2 pinzas escala"],
            ["03 Juego", "Indice izq mueve · Punio izq START · Palma der dispara · Punio der salta"],
            ["03 Teclado", "Flechas · Z X C V · Enter START · 5 moneda"],
        ],
    )
    add_img(d, "05_lab_conectado.png", 5.0, "Figura 2. Laboratorio")
    add_img(d, "06_arquitecto.png", 5.0, "Figura 3. Arquitecto")
    add_img(d, "07_juego.png", 5.0, "Figura 4. Videojuego")

    add_h(d, "5. Puertos")
    add_table(
        d,
        ["Puerto", "Uso"],
        [
            ["8090", "HTTP portal"],
            ["8765 / 8766 / 8767", "WS lab / juego / arquitecto"],
            ["5005 / 5006", "UDP guante"],
            ["27017", "MongoDB"],
        ],
    )

    add_h(d, "6. Capturas del paquete")
    add_table(
        d,
        ["Archivo", "Contenido"],
        [
            ["01_portal_login.png", "Login"],
            ["02_portal_configurar.png", "Fuentes Hardware / Vision"],
            ["03_portal_modulos.png", "Modulos desbloqueados"],
            ["04_lab_wifi_modal.png", "Modal WiFi + COM"],
            ["05_lab_conectado.png", "Laboratorio con puente"],
            ["06_arquitecto.png", "Arquitecto 3D"],
            ["07_juego.png", "Videojuego"],
        ],
    )
    d.save(OUT / "06_Referencia_Rapida.docx")
    return "06_Referencia_Rapida.docx"


def write_readme() -> None:
    readme = OUT / "README.md"
    readme.write_text(
        "\n".join(
            [
                "# Manuales NEXUM AI — Windows",
                "",
                "Documentacion para computadoras con **Windows 10/11** (sin VM).",
                "Formato: **solo DOCX** (Word). Capturas en `capturas/`.",
                "",
                "## Repositorio GitHub",
                "",
                f"- Proyecto: {REPO_URL}",
                f"- Clonar: `git clone {REPO_GIT}`",
                "",
                "## Contenido",
                "",
                "| # | Archivo | Tema |",
                "|---|---------|------|",
                "| 01 | `01_Manual_de_Instalacion.docx` | Instalacion y arranque |",
                "| 02 | `02_Manual_de_Uso.docx` | Uso + movimientos de los 3 modulos |",
                "| 03 | `03_Manual_de_Uso_Personal.docx` | Rutina personal 15 min |",
                "| 04 | `04_Manual_Guante_y_Red.docx` | Guante, WiFi y USB COM |",
                "| 05 | `05_Solucion_de_Problemas.docx` | Fallos frecuentes |",
                "| 06 | `06_Referencia_Rapida.docx` | Hoja de consulta |",
                "",
                "## Regenerar",
                "",
                "```bash",
                ".venv/Scripts/python.exe docs/Manuales_Windows/_gen_manuales_windows.py",
                "```",
                "",
            ]
        ),
        encoding="utf-8",
    )


def main() -> None:
    created = [
        build_install(),
        build_uso(),
        build_personal(),
        build_guante(),
        build_problemas(),
        build_referencia(),
    ]
    write_readme()
    # Quitar ODT si quedaran de versiones anteriores
    for odt in OUT.glob("*.odt"):
        odt.unlink(missing_ok=True)
    print("CREATED DOCX:")
    for name in created:
        p = OUT / name
        print(f"  {name}  {p.stat().st_size if p.exists() else 0}")
    print("capturas:", sorted(x.name for x in CAPS.glob("*.png")))


if __name__ == "__main__":
    main()
