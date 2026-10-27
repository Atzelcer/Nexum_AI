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

void abrirUdp() {
  udp.stop();
  udpListo = udp.begin(ESP_PORT) == 1;
  ultimoHello = 0;
  enviarSistema("WIFI_OK," + WiFi.localIP().toString());
}

void iniciarRed() {
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  Serial.print("SYS:WIFI_CONECTANDO");
  unsigned long inicio = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - inicio < 12000) {
    delay(300);
    Serial.print(".");
  }
  Serial.println();

  ultimoIntentoWifi = millis();
  if (WiFi.status() == WL_CONNECTED) {
    abrirUdp();
  } else {
    enviarSistema("WIFI_ERROR");
  }
}

void enviarHello() {
  if (WiFi.status() != WL_CONNECTED || !udpListo) return;
  String msg = "MA_HELLO," + WiFi.localIP().toString();
  if (GLOVE_HAND[0] || gloveHandId[0]) {
    msg += ",";
    msg += (gloveHandId[0] ? gloveHandId : GLOVE_HAND);
  }
  enviarUDP(msg, IPAddress(255, 255, 255, 255), PC_PORT);
  IPAddress subred = WiFi.broadcastIP();
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

  if (msg == "CMD:PING") {
    enviarSistema("PONG");
  }
}

void vigilarWifi() {
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
      Serial.println("SYS:WIFI_REINTENTO");
      WiFi.disconnect();
      WiFi.begin(WIFI_SSID, WIFI_PASS);
    }
    return;
  }
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

    char buffer[160];
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
