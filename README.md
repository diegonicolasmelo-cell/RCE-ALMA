# KINE-RCE-NEXT · UPC-Pulse

Plataforma satélite de monitorización kinésica a pie de cama.
UCI Adulto — Hospital San Pablo de Coquimbo.

> **No reemplaza a ALMA.** Es una herramienta de trabajo del equipo de
> kinesiología cuyo producto final es la evolución que se transcribe al registro
> oficial (HIS ALMA / TrakCare). Ver `docs/PLAN-MAESTRO.md` cap. 0.

## El problema

ALMA es el registro oficial y no se puede cambiar. Lo que sí se puede cambiar es
cómo llegamos a él. Hoy: se compite por un computador, se registra en papel que
después hay que eliminar, y se transcribe a mano a un formulario que no muestra
tendencias.

| | |
|---|---|
| **Captura** | Celular a pie de cama (PWA, funciona sin señal). |
| **Lectura** | Tablero, sábana y tendencias en cualquier PC de la UCI. |
| **Transcripción** | Evolución estructurada y panel paso a paso para ALMA. |

## Dos vistas, un solo código

- **Celular** (`#celular`) — captura. Muestra **solo la cama**: el servidor no le
  entrega la identidad del paciente (otra llave).
- **PC de la UCI** (`#estacion`) — visualización. Muestra nombre y RUT, abre
  Sinapse por RUT, arma la evolución para ALMA y el informe de riesgo.

## Estado

| Parte | Estado |
|---|---|
| Núcleo clínico (`src/core`) | ✅ 300+ tests |
| Capa de datos: IndexedDB, cola offline, sincronía idempotente | ✅ |
| App del celular | ✅ |
| Vista del PC | ✅ |
| PWA instalable y sin conexión | ✅ |
| Prueba de punta a punta en navegador (`e2e/`) | ✅ 21 pruebas |
| Backend Apps Script (`backend/apps-script`) | 🔨 código listo, **sin desplegar ni probar contra Google** |
| Envío del informe de riesgo por correo a coordinación | ⬜ |

Nunca se probó contra una hoja de Google real: el cliente HTTP y el backend están
probados por separado (con un servidor simulado). El primer ensayo real de punta a
punta hay que hacerlo con datos ficticios.

### Por definir (decisiones de la unidad clínica pendientes)

- **Tabla real de escalones de sedación.** Hoy se interpolan entre los extremos 1 y
  6; lorazepam solo admite dosis libre.
- **Unidad de la amiodarona** (hoy `mg/h`, marcada “por confirmar”).
- **Turnos**: se asumen Día 08–20 y Noche 20–08 (`src/core/turnos.ts`).
- **TI, flujo e I:E** por modalidad (`src/core/catalogos.ts`), y los valores
  rápidos de la franja del teclado.
- **Criterios de la pauta APK**: transcripción de un formato en papel que debe
  ratificar la jefatura de kinesiología.
- Formato de la URL de **Sinapse** (`VITE_SINAPSE_URL`).
- RUT de la dotación: son marcadores de posición (`src/core/dotacion.ts`).

## Desarrollo

```bash
npm install
```

Sin configurar nada, la app arranca en **modo demostración**: ocho camas con
pacientes inventados, todo en el dispositivo. Ingreso: cualquier RUT de la
dotación y el PIN `0000`.

```bash
npm run dev
```

```bash
npm run check
```

`check` corre el chequeo de tipos y todos los tests. La prueba de punta a punta
levanta el build en un navegador real (requiere Playwright):

```bash
npm run build && NODE_PATH=$(npm root -g) npm run e2e
```

## Configuración y despliegue

La app se publica como sitio estático (GitHub Pages, ver
`.github/workflows/desplegar.yml`). **La URL del backend y los tokens no van en el
código publicado**: cada dispositivo los recibe una vez por un enlace de
configuración y los guarda en su navegador. Pasos y enlaces en
`backend/apps-script/README.md`.

| Qué | Cómo |
|---|---|
| Backend | Apps Script sobre una hoja de Google, ver `backend/apps-script/` |
| Conexión de un dispositivo | `#config?u=<URL codificada>&a=<APP_TOKEN>` |
| Llave de estación (solo PC) | `#estacion?t=<STATION_TOKEN>` |
| Enlace a Sinapse | variable `VITE_SINAPSE_URL` con `{rut}`, `{rutPuntos}`, `{cuerpo}`, `{dv}` |

## Arquitectura

```
CELULAR  ── llave de app ──▶  hojas: episodios · controles · eventos · apk   (sin identidad)
PC UCI   ── llave de app ──▶  (lo mismo)
PC UCI   ── llave de estación ──▶  hoja: identidad (nombre, RUT)  · se borra al alta
```

- **Local primero.** Cada escritura se guarda en IndexedDB y se encola; la subida
  es idempotente (el servidor ignora ids repetidos) con reintentos de espera
  creciente.
- **Append-only.** Nunca se edita ni se borra un control. Un episodio que cambia
  (vía aérea, transcrito a ALMA) es una versión nueva; gana la más reciente.
- **Identidad aparte.** Apps Script corre fuera del hospital y no puede filtrar
  por IP. Riesgo aceptado por el equipo: nombre y RUT viven en Google para estar
  disponibles en cualquier PC. Defensas: llave distinta (el celular nunca los
  recibe), hoja aparte, purga al alta y guarda doble (`src/core/sanitizar.ts` y
  el servidor) que rechaza identidad en el canal clínico.
- **Borradores a salvo.** Un control a medio llenar sobrevive a que el sistema
  cierre la app (12 h de vigencia).

## Reglas clínicas que el código hace cumplir

- **Lo que se lee de un monitor nace en blanco**, sin botón para copiar el valor
  anterior; los ajustes del ventilador y las infusiones se heredan.
- **El modo ventilatorio decide qué se registra**, separando lo programado de lo
  que hace el paciente. “Sig. ›” se detiene en el Modo.
- **Candado de mecánica:** con asincronía en modalidad controlada, plateau, ΔP y
  compliance se bloquean (en pantalla, sábana, tendencias y nota). Una sola fuente
  de verdad: `src/core/validez.ts`.
- **Tobin solo en espontáneas** (CPAP+PS). En PCV sin plateau, la ΔP usa la
  presión pico y lo declara.
- **Guía de protección pulmonar** en ml/kg de peso ideal (6–8 protector, menos de
  6 ultraprotector); la franja ofrece 6, 7 y 8 ml/kg ya calculados.
- **APK una vez por turno**, vale para los controles siguientes. El toque único
  registra una aserción global firmada, no N criterios marcados.
- **Vía aérea fija por episodio:** solo la cambia un evento.

## Estructura

```
src/core/        Dominio puro (sin React ni red): fisiología, candado, borrador,
                 infusiones, APK, equipos, nota ALMA, informe de riesgo, REM 28
src/datos/       IndexedDB, cola de subida, sincronía, cliente de Apps Script
src/celular/     Pantallas de captura y franja sobre el teclado
src/estacion/    Tablero, detalle, Para ALMA, estado
src/app/         Raíz, estado de interfaz, persistencia de borradores
backend/         Apps Script
e2e/             Prueba de punta a punta en navegador
docs/            Plan maestro y demo de diseño (docs/demo)
```

`docs/demo/upc-pulse-demo.html` es la maqueta interactiva con la que se acordó el
diseño; no es parte de la aplicación.
