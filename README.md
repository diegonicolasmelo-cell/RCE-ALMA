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
- **Unidad de la amiodarona** (hoy `mg/h`, marcada “por confirmar”: la ficha técnica
  la expresa en mg/min y muchas unidades en mg/h). La milrinona va en mcg/kg/min.
- **Corte del S5Q** para la lectura en el PC (hoy ≥ 3, por confirmar).
- **Turnos**: se asumen Día 08–20 y Noche 20–08 (`src/core/turnos.ts`).
- **TI, flujo e I:E** por modalidad (`src/core/catalogos.ts`), y los valores
  rápidos de la franja del teclado.
- **Vocabulario de la hoja de PVE**: la hoja dice solo “Trabajo respiratorio”,
  “Secreciones bronquiales” y “Manejo de secreciones”; las opciones del celular
  (sin aumento/aumentado, escasas/moderadas/abundantes, maneja/no maneja) son
  provisorias. Los 8 criterios del checklist son los del papel, pero sus umbrales
  (PaFi, DVA, volumen minuto) los define la unidad.
- **Escalas de evaluación**: VISAGE y el score de cuidados de vía aérea se guardan
  como un puntaje único (la hoja da solo el corte). Falta la contraindicación
  neuromuscular absoluta/relativa y el laboratorio (GSA, lactato…), que se dejó
  para después.
- **Protección de la identidad (opción B)**: nombre y RUT se **cifran en el navegador**
  (AES-GCM, clave derivada de una contraseña de la unidad con PBKDF2) antes de subirse;
  en el Sheet queda una hoja `referencia` con un solo bloque ilegible por episodio, sin
  columnas que digan nombre ni RUT, y el servidor rechaza todo lo que no sea un bloque
  cifrado. La contraseña es una sola para los 12 PC, se escribe una vez en cada uno
  (Estado) y no va al Sheet, a Drive ni al código; solo la guarda una persona, en papel.
  Un PC sin la contraseña ve las camas sin nombre. **Los nombres descifrados viven solo en
  la memoria de la página**: nunca se escriben en el disco del navegador; al cerrar la
  pestaña desaparecen y al abrir la estación se descargan y descifran de nuevo (por eso
  hace falta red para ver nombres). Sin prueba contra Google real.
- **Hojas APK solo en la carpeta local** del PC de respaldo (Chrome o Edge, perfil
  exclusivo con la estación abierta; sin Drive). Si estuvo cerrado, se pone al día al
  abrir. **El alta no borra la identidad hasta que ese PC confirme que guardó la hoja
  final** (`apkArchivada`); mientras tanto sigue cifrada. En Estado se puede borrar
  “de todas formas”. El selector de carpeta no se automatiza: probar a mano.
- **Respaldo mensual cifrado**: Estado → «Generar el respaldo de la carpeta» arma un
  solo archivo `.upcres` cifrado con la contraseña de la unidad (se puede enviar por
  correo o guardar en disco); «Abrir un respaldo» lo lee en cualquier PC con la clave.
  Falta confirmar con informática el almacenamiento institucional permitido.
- Almacenamiento institucional para el respaldo (consulta pendiente a informática).
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

### Montar la app en Google Apps Script

La app también se sirve desde el **mismo proyecto de Apps Script** que guarda los datos:
una sola URL `/exec` es página y servidor. Ahí habla con el servidor por
`google.script.run` (no por la URL), y los enlaces de conexión siguen siendo
fragmentos (`#config?a=…`, `#estacion?t=…`) que se leen de la barra de afuera del
iframe y se borran de ella.

```bash
npm run gas
```

Deja en `dist-gas/` lo que se pega en el editor: `index.html` (la app en formato
«cohete»: cargador ASCII + app en base64, para que el analizador de Google no la
rompa), `Codigo.gs` y `LEEME.txt` con el paso a paso
(`backend/apps-script/LEEME-MONTAJE.txt`). `?demo=1` abre la demostración en una
base local aparte. La prueba de arranque carga ese `index.html` en Chromium con el
`Codigo.gs` real simulado detrás:

```bash
npm run gas && NODE_PATH=$(npm root -g) npm run e2e:gas
```

Dentro de Apps Script no hay modo sin conexión de PWA ni selector de carpeta local
(Chrome los bloquea dentro del marco de Google).

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
  anterior. De un control a otro solo se hereda el **modo ventilatorio y la FiO₂**, y las
  **infusiones en curso** (si no, un control nuevo las daría por suspendidas). El resto de
  los ajustes del ventilador nace en blanco; «Usar lo anterior» rellena solo los que siguen
  vacíos y solo con la misma modalidad.
- **El modo ventilatorio decide qué se registra**, separando lo programado de lo
  que hace el paciente. “Sig. ›” se detiene en el Modo.
- **Candado de mecánica:** con asincronía en modalidad controlada, plateau, ΔP y
  compliance se bloquean (en pantalla, sábana, tendencias y nota). Una sola fuente
  de verdad: `src/core/validez.ts`.
- **Tobin solo en espontáneas** (CPAP+PS). En PCV sin plateau, la ΔP usa la
  presión pico y lo declara.
- **Guía de protección pulmonar** en ml/kg de peso ideal (6–8 protector, menos de
  6 ultraprotector); la franja ofrece 6, 7 y 8 ml/kg ya calculados.
- **Cada control es una atención kinésica** (así se cuenta en la estadística): no se
  pregunta si hubo kine respiratoria ni aspiración; se registran auscultación y
  secreciones (aspecto con 12 tipos más «sin secreciones», reología y cantidad, en listas desplegables; reología y cantidad solo se habilitan si hay secreciones) y manejo de secreciones (tos eficiente/deficiente con flujo pico de tos, y deglución presente/esporádica/ausente, esta última por confirmar). La auscultación es
  texto libre con sugerencias desplegables (las sugerencias son provisorias).
- **Kine motora aparte**: la terapia física tiene su pestaña y solo se registra
  cuando se hace (no es obligatoria para guardar).
- **Teclado**: mientras se escribe se ocultan la cabecera y el pie para ver el cuadro
  completo; «Sig.» va de casilla en casilla y, en la última, al cuadro siguiente
  (aunque no tenga casillas). Las lecturas nacen en blanco, sin el valor anterior.
- **Bloqueo neuromuscular** como infusión (rocuronio, vecuronio, atracurio) con
  dosis; unidades por confirmar. **CNAF**: flujo, temperatura, FiO₂, FR, SpO₂ y uso
  de musculatura accesoria en el mismo cuadro (ROX en el PC).
- **APK una vez por turno y por kinesiólogo**: se firma con un toque (fecha, hora y
  siglas de quien inició sesión) y vale para todos sus controles del turno; un colega
  firma la suya. Queda con la fecha del día en que empezó el turno. Es la pauta de
  papel del hospital (8 filas + siglas), con marca por fila: **1** sí, **N/A** no
  aplica, **0** no. Con vía aérea artificial parte todo en 1; con vía natural, lo
  invasivo y la alimentación parten en N/A. Al firmar se llena una columna de la
  hoja digital (copia fiel, 10 fechas por página, con RUN), que la estación guarda
  en Drive y se puede imprimir o descargar. Un “0” difiere la kine respiratoria.
- **PVE**: checklist de 8 criterios → control inicial (arranca el cronómetro) →
  control a los 30 min → fin → extubación → reevaluaciones a 0, 30, 60, 120 min y
  48 h → falla post extubación (sí/no, hipótesis, observaciones).
- **Control en formato hoja**: una sola pestaña «Control» con todo en el orden del papel
  (Monitorización y Terapia ventilatoria): etiqueta a la izquierda, casilla a la derecha
  y, en tablet, el control anterior como columna aparte. «Sig.» o Enter van de casilla
  en casilla por toda la hoja. Las drogas van en su fila (FC con inotrópicos y
  antiarrítmicos, PA con vasoactivos, SAS con sedación y bloqueo). Kine resp. · APK,
  Kine motora, PVE y Eventos siguen en sus pestañas. Auto PEEP solo en modalidades
  controladas. TrachCare y HEPA duran 3 días, el HME 2: se anota solo el cambio.
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
