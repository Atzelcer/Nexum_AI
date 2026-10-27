#include <Arduino.h>
#include <Wire.h>
#include <WiFi.h>
#include <WiFiUdp.h>
#include <Preferences.h>
#include <math.h>

#define SDA_PIN 21
#define SCL_PIN 22

#define TCA_ADDR 0x70
#define MPU_ADDR_1 0x68
#define MPU_ADDR_2 0x69

#define REG_PWR_MGMT_1    0x6B
#define REG_SMPLRT_DIV    0x19
#define REG_CONFIG        0x1A
#define REG_GYRO_CONFIG   0x1B
#define REG_ACCEL_CONFIG  0x1C
#define REG_ACCEL_XOUT_H  0x3B

#define WIFI_SSID "ModoB"
#define WIFI_PASS "1234567899"
#define AP_SSID "NEXUM-GUANTE"
#define AP_PASS "nexum1234"

String wifiSsid = WIFI_SSID;
String wifiPass = WIFI_PASS;
bool apActiva = false;
uint8_t reintentosWifi = 0;
String serialLinea = "";
const IPAddress AP_IP(192, 168, 50, 1);
const IPAddress AP_MASK(255, 255, 255, 0);
const IPAddress AP_BROADCAST(192, 168, 50, 255);
const unsigned long AP_REINTENTO_MS = 60000;

const char* GLOVE_HAND = "";
char gloveHandId[3] = "";

const uint16_t PC_PORT = 5005;
const uint16_t ESP_PORT = 5006;
const uint8_t NUM_SENSORES = 5;

const uint8_t canales[NUM_SENSORES] = {2, 3, 4, 5, 6};
const char* dedos[NUM_SENSORES] = {
  "menique",
  "anular",
  "medio",
  "indice",
  "pulgar"
};

const uint8_t MENIQUE = 0;
const uint8_t ANULAR  = 1;
const uint8_t MEDIO   = 2;
const uint8_t INDICE  = 3;
const uint8_t PULGAR  = 4;

bool sensorOK[NUM_SENSORES];
uint8_t sensorAddr[NUM_SENSORES];

float gyroOffsetX[NUM_SENSORES];
float gyroOffsetY[NUM_SENSORES];
float gyroOffsetZ[NUM_SENSORES];

float neutralAngleX[NUM_SENSORES];
float neutralAngleY[NUM_SENSORES];

float angleX[NUM_SENSORES];
float angleY[NUM_SENSORES];
float angleXFilt[NUM_SENSORES];
float angleYFilt[NUM_SENSORES];
float gyroRateX[NUM_SENSORES];
float gyroRateY[NUM_SENSORES];
float gyroRateZ[NUM_SENSORES];

String estadoTemporal[NUM_SENSORES];
String estadoConfirmado[NUM_SENSORES];
String ultimoEstadoEnviado[NUM_SENSORES];
bool pulsoActivoEnviado[NUM_SENSORES];
bool pulsoReposoForzado[NUM_SENSORES];
unsigned long pulsoActivoDesde[NUM_SENSORES];

uint8_t contadorEstable[NUM_SENSORES];
unsigned long lastTime = 0;
unsigned long ultimoEnvioImu = 0;
unsigned long ultimoHeartbeatJuego = 0;
unsigned long ultimoCalibrateCmd = 0;

bool calibracionPendiente = false;
bool calibrando = false;
bool sensoresCalibrados = false;
bool envioDatosHabilitado = false;
bool modoComplementos = false;
bool modoJuego = false;

WiFiUDP udp;
IPAddress pcIp;
bool pcConectada = false;
bool udpListo = false;
unsigned long ultimoHello = 0;
unsigned long ultimoUdpRx = 0;
unsigned long ultimoIntentoWifi = 0;
const unsigned long PC_TIMEOUT_MS = 45000;
const unsigned long HELLO_MS = 1000;
const unsigned long WIFI_RETRY_MS = 10000;

const float ALPHA_ANGLE = 0.28;
const float DEADZONE_GYRO = 2.0;
const float COMPLEMENTARY = 0.96;

float ACTIVAR_ON[NUM_SENSORES] = {
  5.5,
  4.0,
  5.5,
  6.5,
  3.2
};

float ACTIVAR_OFF[NUM_SENSORES] = {
  2.5,
  2.0,
  2.5,
  3.0,
  1.4
};

const float ACTIVAR_ON_LAB[NUM_SENSORES] = { 5.5, 4.0, 5.5, 6.5, 3.2 };
const float ACTIVAR_OFF_LAB[NUM_SENSORES] = { 2.5, 2.0, 2.5, 3.0, 1.4 };
const float ACTIVAR_ON_JUEGO[NUM_SENSORES] = { 5.5, 22.0, 5.0, 6.5, 3.2 };
const float ACTIVAR_OFF_JUEGO[NUM_SENSORES] = { 2.8, 12.0, 2.5, 3.2, 1.4 };

void aplicarUmbralesJuego(bool juego) {
  const float *on = juego ? ACTIVAR_ON_JUEGO : ACTIVAR_ON_LAB;
  const float *off = juego ? ACTIVAR_OFF_JUEGO : ACTIVAR_OFF_LAB;
  for (uint8_t i = 0; i < NUM_SENSORES; i++) {
    ACTIVAR_ON[i] = on[i];
    ACTIVAR_OFF[i] = off[i];
  }
}

const uint8_t FRAMES_CONFIRMACION = 2;
const uint8_t FRAMES_REPOSO_RAPIDO = 1;
const unsigned long PULSO_ACTIVO_MS = 800;
const unsigned long IMU_CURSOR_MS = 18;
const unsigned long IMU_JUEGO_MS = 40;
const unsigned long HEARTBEAT_JUEGO_MS = 280;

const int   CAL_WARMUP       = 80;
const int   CAL_MUESTRAS     = 500;
const int   CAL_MAX_INTENTOS = 4;
const float CAL_MAX_STD_GYRO = 3.0;

void cargarCredenciales();
void leerSerial();
void iniciarRed();
void abrirUdp();
void vigilarWifi();
void procesarRed();
void enviarEstadoCalibracion();
void limpiarPulsos();
void enviarSistema(const String &msg);
void enviarDato(const String &dedo, const String &estado);
void enviarCalibracionProgreso(uint8_t actual, uint8_t total);
void olvidarConexion();

void tcaSelect(uint8_t channel);
bool existsI2C(uint8_t addr);

bool writeByte(uint8_t addr, uint8_t reg, uint8_t val);
int16_t to16(uint8_t h, uint8_t l);
bool read14(uint8_t addr, uint8_t* buf);
bool readMPU(uint8_t addr, float &ax, float &ay, float &az, float &gx, float &gy, float &gz);
bool configurarMPU(uint8_t addr);
float deadzone(float v);

void resetearDedo(uint8_t i);
String clasificarMovimiento(uint8_t i);
void confirmarEstado(uint8_t i, String nuevoEstado);

void detectarSensores();
bool calibrarDedoUnaVez(uint8_t i);
void calibrarSensores();

void actualizarDedo(uint8_t i, float dt);
void enviarCambios();
void enviarImuCursor();
void enviarImuJuego();
void enviarHeartbeatJuego();

void setup() {
  Serial.begin(115200);
  delay(1000);

  Wire.begin(SDA_PIN, SCL_PIN);
  Wire.setClock(100000);
#if defined(WIRE_HAS_TIMEOUT) || defined(ESP32)
  Wire.setTimeOut(80);
#endif

  cargarCredenciales();
  iniciarRed();

  gloveHandId[0] = 0;
  if (GLOVE_HAND[0] == 'l' || GLOVE_HAND[0] == 'r') {
    gloveHandId[0] = GLOVE_HAND[0];
    gloveHandId[1] = 0;
  }

  enviarSistema("DETECTANDO");
  detectarSensores();
  enviarSistema("SISTEMA_LISTO_SIN_CALIBRAR");

  for (uint8_t i = 0; i < NUM_SENSORES; i++) {
    ultimoEstadoEnviado[i] = "";
    pulsoActivoEnviado[i] = false;
    pulsoReposoForzado[i] = false;
    pulsoActivoDesde[i] = 0;
    gyroRateX[i] = 0;
    gyroRateY[i] = 0;
    gyroRateZ[i] = 0;
  }

  lastTime = millis();
}

void loop() {
  leerSerial();
  procesarRed();

  if (calibracionPendiente) {
    calibracionPendiente = false;
    calibrando = true;
    envioDatosHabilitado = false;
    calibrarSensores();
    sensoresCalibrados = true;
    calibrando = false;
    ultimoCalibrateCmd = millis();
    if (pcConectada) ultimoUdpRx = millis();
    procesarRed();
  }

  unsigned long now = millis();
  float dt = (now - lastTime) / 1000.0;
  lastTime = now;

  if (dt <= 0 || dt > 0.15) {
    dt = 0.02;
  }

  for (uint8_t i = 0; i < NUM_SENSORES; i++) {
    actualizarDedo(i, dt);
  }

  if (sensoresCalibrados && envioDatosHabilitado) {
    enviarCambios();
    if (modoJuego) {
      enviarImuJuego();
      enviarHeartbeatJuego();
    }
  }
  delay(6);
}
