void enviarCambios() {
  unsigned long now = millis();

  for (uint8_t i = 0; i < NUM_SENSORES; i++) {
    if (modoJuego) {
      if (estadoConfirmado[i] != ultimoEstadoEnviado[i]) {
        enviarDato(dedos[i], estadoConfirmado[i]);
        ultimoEstadoEnviado[i] = estadoConfirmado[i];
      }
      pulsoActivoEnviado[i] = false;
      pulsoReposoForzado[i] = false;
      pulsoActivoDesde[i] = 0;
      continue;
    }

    if (estadoConfirmado[i] == "activo") {
      if (!pulsoActivoEnviado[i]) {
        enviarDato(dedos[i], "activo");
        ultimoEstadoEnviado[i] = "activo";
        pulsoActivoDesde[i] = now;
        pulsoActivoEnviado[i] = true;
        pulsoReposoForzado[i] = false;
      } else if (!pulsoReposoForzado[i] && now - pulsoActivoDesde[i] >= PULSO_ACTIVO_MS) {
        enviarDato(dedos[i], "reposo");
        ultimoEstadoEnviado[i] = "reposo";
        pulsoReposoForzado[i] = true;
      }
      continue;
    }

    if (pulsoActivoEnviado[i]) {
      pulsoActivoEnviado[i] = false;
      pulsoReposoForzado[i] = false;
      pulsoActivoDesde[i] = 0;
    }

    if (ultimoEstadoEnviado[i] != "reposo") {
      enviarDato(dedos[i], "reposo");
      ultimoEstadoEnviado[i] = "reposo";
    }
  }
}

void enviarImuCursor() {
  unsigned long now = millis();
  if (now - ultimoEnvioImu < IMU_CURSOR_MS) return;
  ultimoEnvioImu = now;
  if (!sensorOK[INDICE]) return;

  String msg = "IMU:";
  msg += dedos[INDICE];
  msg += ",";
  msg += String(angleXFilt[INDICE], 2);
  msg += ",";
  msg += String(angleYFilt[INDICE], 2);
  msg += ",";
  msg += String(gyroRateX[INDICE], 2);
  msg += ",";
  msg += String(gyroRateY[INDICE], 2);
  msg += ",";
  msg += estadoConfirmado[INDICE];
  enviarAPC(msg);
}

void enviarImuJuego() {
  unsigned long now = millis();
  if (now - ultimoEnvioImu < IMU_JUEGO_MS) return;
  ultimoEnvioImu = now;

  if (sensorOK[MENIQUE]) {
    String msg = "IMU:";
    msg += dedos[MENIQUE];
    msg += ",";
    msg += String(angleXFilt[MENIQUE], 2);
    msg += ",";
    msg += String(angleYFilt[MENIQUE], 2);
    msg += ",";
    msg += String(gyroRateX[MENIQUE], 2);
    msg += ",";
    msg += String(gyroRateY[MENIQUE], 2);
    msg += ",";
    msg += estadoConfirmado[MENIQUE];
    enviarAPC(msg);
  }
}

void enviarHeartbeatJuego() {
  unsigned long now = millis();
  if (now - ultimoHeartbeatJuego < HEARTBEAT_JUEGO_MS) return;
  ultimoHeartbeatJuego = now;
  for (uint8_t i = 0; i < NUM_SENSORES; i++) {
    enviarDato(dedos[i], estadoConfirmado[i]);
    ultimoEstadoEnviado[i] = estadoConfirmado[i];
  }
}
