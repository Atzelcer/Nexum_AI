void enviarUDP(const String &msg, IPAddress ip, uint16_t port) {
  udp.beginPacket(ip, port);
  udp.write((const uint8_t*)msg.c_str(), msg.length());
  udp.endPacket();
  Serial.println(msg);
  Serial.flush();
}

void enviarAPC(const String &msg) {
  if (pcConectada) {
    enviarUDP(msg, pcIp, PC_PORT);
  } else {
    Serial.println(msg);
    Serial.flush();
  }
}

void cargarCredenciales() {
  Preferences prefs;
  prefs.begin("nexum", true);
  wifiSsid = prefs.getString("ssid", WIFI_SSID);
  wifiPass = prefs.getString("pass", WIFI_PASS);
  prefs.end();
  if (wifiSsid.length() == 0) {
    wifiSsid = WIFI_SSID;
    wifiPass = WIFI_PASS;
  }
  Serial.println("SYS:WIFI_RED," + wifiSsid);
}

bool hexATexto(const String &hex, String &out) {
  out = "";
  if (hex.length() % 2 != 0) return false;
  for (unsigned int i = 0; i < hex.length(); i += 2) {
    char par[3] = { hex.charAt(i), hex.charAt(i + 1), 0 };
    char *fin = nullptr;
    long valor = strtol(par, &fin, 16);
    if (*fin != 0) return false;
    out += (char)valor;
  }
  return true;
}

void aplicarWifi(const String &ssidHex, const String &passHex) {
  String ssid, pass;
  if (!hexATexto(ssidHex, ssid) || !hexATexto(passHex, pass)) {
    enviarSistema("WIFI_INVALIDA,formato");
    return;
  }
  if (ssid.length() < 1 || ssid.length() > 32) {
    enviarSistema("WIFI_INVALIDA,nombre");
    return;
  }
  if (pass.length() != 0 && (pass.length() < 8 || pass.length() > 63)) {
    enviarSistema("WIFI_INVALIDA,contrasena");
    return;
  }
  Preferences prefs;
  prefs.begin("nexum", false);
  prefs.putString("ssid", ssid);
  prefs.putString("pass", pass);
  prefs.end();
  enviarSistema("WIFI_GUARDADA," + ssid);
  delay(400);
  enviarSistema("REINICIANDO_WIFI");
  delay(300);
  ESP.restart();
}

void procesarLineaSerial(String linea) {
  linea.trim();
  if (linea.startsWith("WIFI:")) {
    int sep = linea.indexOf(':', 5);
    if (sep < 0) {
      Serial.println("SYS:WIFI_INVALIDA,formato");
      return;
    }
    aplicarWifi(linea.substring(5, sep), linea.substring(sep + 1));
  } else if (linea == "WIFI_INFO") {
    Serial.println(String("SYS:WIFI_INFO,") + (apActiva ? String("AP," AP_SSID) : String("STA,") + wifiSsid));
  }
}

void leerSerial() {
  while (Serial.available()) {
    char c = (char)Serial.read();
    if (c == '\n' || c == '\r') {
      if (serialLinea.length()) procesarLineaSerial(serialLinea);
      serialLinea = "";
    } else if (serialLinea.length() < 220) {
      serialLinea += c;
    }
  }
}

bool redLista() {
  return apActiva || WiFi.status() == WL_CONNECTED;
}

IPAddress ipLocal() {
  return apActiva ? WiFi.softAPIP() : WiFi.localIP();
}

void abrirUdp() {
  udp.stop();
  udpListo = udp.begin(ESP_PORT) == 1;
  ultimoHello = 0;
  enviarSistema("WIFI_OK," + ipLocal().toString());
}

void iniciarPuntoAcceso() {
  WiFi.disconnect(true);
  WiFi.mode(WIFI_AP);
  WiFi.softAPConfig(AP_IP, AP_IP, AP_MASK);
  WiFi.softAP(AP_SSID, AP_PASS);
  apActiva = true;
  ultimoIntentoWifi = millis();
  abrirUdp();
  enviarSistema(String("AP_ACTIVO,") + AP_SSID);
}

void iniciarRed() {
  apActiva = false;
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.setAutoReconnect(true);
  WiFi.begin(wifiSsid.c_str(), wifiPass.c_str());

  Serial.print("SYS:WIFI_CONECTANDO," + wifiSsid);
  unsigned long inicio = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - inicio < 12000) {
    delay(300);
    leerSerial();
    Serial.print(".");
  }
  Serial.println();

  ultimoIntentoWifi = millis();
  if (WiFi.status() == WL_CONNECTED) {
    abrirUdp();
  } else {
    enviarSistema("WIFI_ERROR," + wifiSsid);
    iniciarPuntoAcceso();
  }
}

void enviarHello() {
  if (!redLista() || !udpListo) return;
  String msg = "MA_HELLO," + ipLocal().toString();
  if (GLOVE_HAND[0] || gloveHandId[0]) {
    msg += ",";
    msg += (gloveHandId[0] ? gloveHandId : GLOVE_HAND);
  }
  enviarUDP(msg, IPAddress(255, 255, 255, 255), PC_PORT);
  IPAddress subred = apActiva ? AP_BROADCAST : WiFi.broadcastIP();
  if (subred != IPAddress(255, 255, 255, 255) && subred != IPAddress(0, 0, 0, 0)) {
    enviarUDP(msg, subred, PC_PORT);
  }
}

void enviarEstadoCalibracion() {
  enviarSistema(sensoresCalibrados ? "ESTADO_CALIBRADO" : "ESTADO_SIN_CALIBRAR");
}

void limpiarPulsos() {
  for (uint8_t i = 0; i < NUM_SENSORES; i++) {
    ultimoEstadoEnviado[i] = "";
    pulsoActivoEnviado[i] = false;
    pulsoReposoForzado[i] = false;
    pulsoActivoDesde[i] = 0;
  }
}

void procesarComando(const String &msg) {
  if (msg.startsWith("MA_PC,")) {
    IPAddress origen = udp.remoteIP();
    ultimoUdpRx = millis();
    if (pcConectada && origen == pcIp) {
      enviarSistema("PC_CONECTADA");
      enviarEstadoCalibracion();
      return;
    }
    pcIp = origen;
    pcConectada = true;
    envioDatosHabilitado = false;
    modoComplementos = false;
    modoJuego = false;
    aplicarUmbralesJuego(false);
    limpiarPulsos();
    enviarSistema("PC_CONECTADA");
    enviarEstadoCalibracion();
    return;
  }

  if (msg == "CMD:RESET") {
    for (uint8_t i = 0; i < NUM_SENSORES; i++) {
      resetearDedo(i);
    }
    ultimoEnvioImu = 0;
    ultimoHeartbeatJuego = 0;
    enviarSistema("RESET_OK");
    enviarEstadoCalibracion();
    return;
  }

  if (msg == "CMD:CALIBRATE") {
    if (calibrando || calibracionPendiente || (millis() - ultimoCalibrateCmd < 12000)) {
      Serial.println("SYS:CALIBRATE_IGNORADO_DUPLICADO");
      Serial.flush();
      return;
    }
    ultimoCalibrateCmd = millis();
    calibracionPendiente = true;
    enviarSistema("CALIBRACION_SOLICITADA");
    return;
  }

  if (msg == "CMD:START_STREAM") {
    if (sensoresCalibrados) {
      modoComplementos = false;
      modoJuego = false;
      aplicarUmbralesJuego(false);
      envioDatosHabilitado = true;
      ultimoEnvioImu = 0;
      for (uint8_t i = 0; i < NUM_SENSORES; i++) {
        ultimoEstadoEnviado[i] = "";
        pulsoActivoEnviado[i] = false;
        pulsoReposoForzado[i] = false;
        pulsoActivoDesde[i] = 0;
        contadorEstable[i] = 0;
        estadoTemporal[i] = "reposo";
      }
      enviarSistema("STREAM_ACTIVO");
    } else {
      enviarSistema("ERROR_NO_CALIBRADO");
    }
    return;
  }

  if (msg.startsWith("CMD:MODE,")) {
    String modo = msg.substring(9);
    modo.trim();
    modoComplementos = false;
    modoJuego = (modo == "game" || modo == "juego");
    if (modoJuego) {
      aplicarUmbralesJuego(true);
    } else {
      aplicarUmbralesJuego(false);
    }
    ultimoEnvioImu = 0;
    ultimoHeartbeatJuego = 0;
    for (uint8_t i = 0; i < NUM_SENSORES; i++) {
      ultimoEstadoEnviado[i] = "";
      pulsoActivoEnviado[i] = false;
      pulsoReposoForzado[i] = false;
      pulsoActivoDesde[i] = 0;
      contadorEstable[i] = 0;
      estadoTemporal[i] = "reposo";
    }
    enviarSistema("MODO_" + modo);
    return;
  }

  if (msg == "CMD:STOP_STREAM") {
    envioDatosHabilitado = false;
    enviarSistema("STREAM_PAUSADO");
    return;
  }

  if (msg == "CMD:DISCONNECT") {
    enviarSistema("DESCONECTANDO");
    envioDatosHabilitado = false;
    modoComplementos = false;
    modoJuego = false;
    aplicarUmbralesJuego(false);
    ultimoEnvioImu = 0;
    pcConectada = false;
    pcIp = IPAddress(0, 0, 0, 0);
    ultimoHello = 0;
    ultimoUdpRx = 0;
    calibracionPendiente = false;
    calibrando = false;
    limpiarPulsos();
    Serial.println("SYS:CONEXION_CERRADA");
    Serial.flush();
    return;
  }

  if (msg.startsWith("CMD:HAND,")) {
    String hand = msg.substring(9);
    hand.trim();
    hand.toLowerCase();
    if (hand == "l" || hand == "r") {
      gloveHandId[0] = hand.charAt(0);
      gloveHandId[1] = '\0';
      enviarSistema(String("HAND_") + gloveHandId);
    }
    return;
  }

  if (msg.startsWith("CMD:WIFI,")) {
    int sep = msg.indexOf(',', 9);
    if (sep < 0) {
      enviarSistema("WIFI_INVALIDA,formato");
      return;
    }
    aplicarWifi(msg.substring(9, sep), msg.substring(sep + 1));
    return;
  }

  if (msg == "CMD:WIFI_INFO") {
    enviarSistema(String("WIFI_INFO,") + (apActiva ? String("AP," AP_SSID) : String("STA,") + wifiSsid));
    return;
  }

  if (msg == "CMD:PING") {
    enviarSistema("PONG");
  }
}

void vigilarWifi() {
  if (apActiva) {
    if (!pcConectada && WiFi.softAPgetStationNum() == 0 && millis() - ultimoIntentoWifi > AP_REINTENTO_MS) {
      Serial.println("SYS:WIFI_REINTENTO," + wifiSsid);
      udp.stop();
      udpListo = false;
      WiFi.softAPdisconnect(true);
      iniciarRed();
    }
    return;
  }
  bool conectado = WiFi.status() == WL_CONNECTED;
  if (!conectado) {
    if (udpListo || pcConectada) {
      Serial.println("SYS:WIFI_PERDIDO");
      Serial.flush();
      olvidarConexion();
      udp.stop();
      udpListo = false;
    }
    if (millis() - ultimoIntentoWifi > WIFI_RETRY_MS) {
      ultimoIntentoWifi = millis();
      if (++reintentosWifi > 3) {
        reintentosWifi = 0;
        iniciarPuntoAcceso();
        return;
      }
      Serial.println("SYS:WIFI_REINTENTO");
      WiFi.disconnect();
      WiFi.begin(wifiSsid.c_str(), wifiPass.c_str());
    }
    return;
  }
  reintentosWifi = 0;
  if (!udpListo) abrirUdp();
}

void procesarRed() {
  vigilarWifi();
  if (!udpListo) return;

  if (pcConectada && ultimoUdpRx > 0 && millis() - ultimoUdpRx > PC_TIMEOUT_MS) {
    Serial.println("SYS:PC_TIMEOUT");
    Serial.flush();
    olvidarConexion();
  }

  if (!pcConectada && millis() - ultimoHello > HELLO_MS) {
    ultimoHello = millis();
    enviarHello();
  }

  while (true) {
    int packetSize = udp.parsePacket();
    if (!packetSize) break;

    char buffer[256];
    int len = udp.read(buffer, sizeof(buffer) - 1);
    if (len <= 0) continue;
    buffer[len] = '\0';

    String msg = String(buffer);
    msg.trim();
    ultimoUdpRx = millis();
    Serial.print("SYS:UDP_RX,");
    Serial.println(msg);
    Serial.flush();
    procesarComando(msg);
  }
}

void olvidarConexion() {
  if (pcConectada) {
    enviarSistema("DESCONECTANDO");
  }
  envioDatosHabilitado = false;
  modoComplementos = false;
  modoJuego = false;
  aplicarUmbralesJuego(false);
  ultimoEnvioImu = 0;
  pcConectada = false;
  pcIp = IPAddress(0, 0, 0, 0);
  ultimoHello = 0;
  ultimoUdpRx = 0;
  calibracionPendiente = false;
  calibrando = false;
  limpiarPulsos();
  Serial.println("SYS:CONEXION_CERRADA");
  Serial.flush();
}

void enviarSistema(const String &msg) {
  enviarAPC("SYS:" + msg);
}

void enviarDato(const String &dedo, const String &estado) {
  enviarAPC(dedo + ":" + estado);
}

void enviarCalibracionProgreso(uint8_t actual, uint8_t total) {
  enviarAPC("CAL:" + String(actual) + "/" + String(total));
}
