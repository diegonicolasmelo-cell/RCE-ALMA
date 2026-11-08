# Plan Maestro — KINE-RCE-NEXT / UPC-Pulse

Plataforma satélite de monitorización kinésica a pie de cama
UCI Adulto — Hospital San Pablo de Coquimbo

Documento de arquitectura clínica y técnica · v1.0

---

## Revisión 2 — decisiones posteriores a la v1.1

Este plan se escribió antes de construir. Las decisiones que lo cambian, tomadas
con la unidad clínica, están implementadas en `src/`; donde algo de abajo las
contradice, **manda esta lista**.

| Tema | Decisión |
|---|---|
| **APK** | Una por **turno** (dos al día, por profesionales distintos); lo firmado vale para los controles siguientes. **Reemplaza el cap. 6**: es la pauta de papel del hospital (8 filas + siglas, marcas 1 / N/A / 0), no una aserción global. Al firmar se llena una columna de una copia fiel de la hoja (HTML apaisado, 10 fechas por página) que la estación guarda en Drive. Con vía natural, lo invasivo y la alimentación parten en N/A. Un “0” difiere la kine respiratoria. |
| **PVE** | Checklist de 8 criterios, control inicial con cronómetro, control a 30 min, y tras extubar reevaluaciones a 0/30/60/120 min y 48 h con falla post extubación. Todo derivado del log de eventos. |
| **Hoja diaria** | La app sigue el orden del papel (Monitoreo, Ventilación). S5Q, Auto PEEP (solo controladas), fechas de TrachCare/HEPA/HME y evaluaciones (MRC-ss, FSS-ICU, PIM/PEF, VISAGE…) desde un apartado aparte. El bloqueo neuromuscular va con la sedación. |
| **Modalidades** | ACVC, PCV, CPAP+PS, CNAF. El modo decide qué se registra, separando **programado** de **lo que hace el paciente** (FR total, Vt espirado, presiones). |
| **Vt/kg** | Es una **guía de titulación** (protector 6–8, ultraprotector < 6 ml/kg de peso ideal), no solo un resultante. La franja del teclado ofrece 6/7/8 ml/kg ya calculados. Exige talla de ingreso (medida o estimada). |
| **Tobin** | Solo en espontáneas (CPAP+PS). La v1 lo calculaba también en controladas: error corregido. |
| **PCV** | Sin plateau medible, la ΔP usa la presión pico y se declara. En CPAP+PS importa la presión pico, no la media. |
| **Volumen minuto** | Calculado por defecto (Vt espirado × FR total) y **editable** con lo que muestra el ventilador. |
| **Infusiones** | Un solo modelo (sedantes, DVA, inotrópicos, antiarrítmicos): apagadas por defecto, Iniciar → titular → Suspender, con deshacer. Midazolam y lorazepam como infusión; lorazepam solo dosis libre. Vasopresina en UI/min. |
| **Equipos** | Estado del episodio por modelo y número (`Savina 1`, `Vela 8`, `Meckis 3`; el Servo U es único), con evento de cambio para conservar el historial. |
| **Neuromonitoreo** | Capnografía, PIC (PPC calculado) y altura de DVE, activos por episodio. |
| **Glasgow** | Se registra aunque haya sedación; la nota lo marca “bajo sedación”. |
| **SAS / vigilia** | Evaluaciones: nacen en blanco (la v1 del prototipo las heredaba). |
| **Identidad** | **Cifrada en el navegador** (rev. 3): en la nube solo un bloque ilegible por episodio (hoja `referencia`), con la contraseña de la unidad instalada en cada PC. Las hojas APK solo en la carpeta local del PC de respaldo; el alta espera su confirmación para borrar la identidad; respaldo mensual cifrado. La URL y los tokens **no van en el código publicado**. |
| **Kine** | Respiratoria sí/no con aspiración (No, TrachCare, Set) y secreciones (aspecto, reología, cantidad). Terapia física engloba KTM + IMT. |

**Sigue pendiente de la unidad:** tabla real de escalones, unidad de la amiodarona,
horarios de turno, TI/flujo/I:E por modalidad, vocabulario de la hoja de PVE y URL de
Sinapse (lista en el README).

---

## 0. Qué problema resuelve y qué NO es

**El problema real.** ALMA (TrakCare, InterSystems) es el registro oficial y no se
puede cambiar. Lo que sí se puede cambiar es *cómo llegamos a él*: hoy el kinesiólogo
compite por un computador, registra en papel que después debe eliminar, y transcribe a
mano a un formulario que no muestra tendencias. UPC-Pulse ataca los tres cuellos de
botella: **captura** (celular a pie de cama), **lectura** (tendencias en la estación) y
**transcripción** (texto estructurado listo para pegar en ALMA).

**Qué NO es, y conviene decirlo por escrito.** UPC-Pulse **no es un registro clínico
oficial ni reemplaza a ALMA**. Es una herramienta de trabajo del equipo de kinesiología
—un ayuda-memoria estructurado del turno— cuyo producto final es la evolución que se
transcribe al registro oficial. Esta distinción no es cosmética: define las exigencias
legales que aplican, justifica la minimización de datos del capítulo 3 y es la
respuesta correcta si dirección o calidad preguntan "¿qué es esto?".

Consecuencia de diseño: **el episodio no se cierra en UPC-Pulse, se cierra en ALMA.**
El semáforo 🟢 Transcrito no es decoración, es el único indicador de que el paciente
quedó con registro oficial.

---

## 1. La decisión de infraestructura, corregida

Elegiste Google Apps Script + Sheets como base de datos, con la idea de que quedaría
"bajo la IP del hospital". Hay que corregir eso antes de construir encima:

| Supuesto | Realidad |
|---|---|
| "Apps Script corre en la intranet" | Corre en servidores de Google. Los datos salen del hospital. |
| "Queda protegido por la IP del hospital" | **Apps Script no puede leer la IP del cliente.** No existe allowlist por IP. Es técnicamente imposible. |
| "Si está protegido, puede ir el RUT" | No. Sin control de IP, poner RUT + datos de salud en una hoja de Google es exponer datos sensibles identificables a un tercero, sin convenio, desde una cuenta personal. |
| "Un web app con link privado es privado" | El link **es** la credencial. Quien lo tenga, entra. Se filtra por WhatsApp una vez y listo. |

**Pero tu restricción es real y la respeto:** informática no te va a entregar una VM, y
esperar meses un ticket mata el proyecto. Apps Script es la salida legítima para un
clínico sin presupuesto de infraestructura. La solución no es pelear con tu elección,
es **hacerla segura por diseño**.

### La arquitectura adoptada: dos canales, dos tokens

> **Revisión v1.1.** La v1.0 guardaba la identidad en el IndexedDB de *un* PC de
> estación. Era un error de topología: en la UCI hay un PC afuera de cada sala y
> varios en la estación, y se usa cualquiera. IndexedDB es almacenamiento local
> de un navegador en un equipo; no se comparte entre PC. Se reemplaza por lo siguiente.

**Decisión del equipo, riesgo aceptado:** nombre y RUT del paciente se guardan en
Google Sheets para estar disponibles en cualquier PC y abrir Sinapse por RUT desde
la tarjeta. Es comparable al uso habitual de planillas en el hospital, con una
diferencia que conviene tener presente: aquí el alojamiento es Google y no hay
filtro por IP. Por eso se agregan tres defensas que no cambian el flujo de trabajo.

```
┌──────────────────────┐                  ┌───────────────────────────┐
│ CELULAR              │                  │ CUALQUIER PC DE LA UCI    │
│ token: APP_TOKEN     │                  │ token: STATION_TOKEN      │
│ Ve: "UCI-03"         │                  │ Ve: "UCI-03 · Rojas, P."  │
│ Escribe: fisiología  │                  │ + botón "Abrir Sinapse"   │
└─────────┬────────────┘                  └───────┬──────────┬────────┘
          │ canal clínico                  clínico │          │ identidad
          ▼                                        ▼          ▼
  ┌────────────────────────────────────────────────────┐ ┌──────────────┐
  │ hojas: episodios · controles · eventos · apk       │ │ hoja:        │
  │ SIN nombre / RUT (el servidor lo rechaza)          │ │ identidad    │
  └────────────────────────────────────────────────────┘ │ nombre · RUT │
                                                         │ se purga al  │
   El celular recibe TOKEN_INVALIDO si pide ───────────▶ │ alta         │
   la hoja de identidad                                  └──────────────┘
```

1. **Dos tokens.** El celular solo tiene `APP_TOKEN`. La hoja `identidad` solo se
   entrega con `STATION_TOKEN`, que únicamente tienen los PC. Lo impone el
   *servidor*: un bug del celular no puede leer ni escribir identidad.
2. **Canal clínico limpio.** `sincronizar` rechaza cualquier llave identificable.
   La identidad tiene su propio canal (`guardarIdentidad`).
3. **Purga al alta.** `purgarIdentidad` borra la fila al dar de alta. Lo clínico
   queda des-identificado para el REM 28; la hoja no acumula pacientes históricos.

**Qué sigue sin protegerse, dicho sin maquillaje:** el token de estación es una
credencial compartida; quien lo tenga (o quien tenga acceso de edición al archivo
de Sheets) lee la identidad. Se mitiga con el mínimo de personas con acceso al
archivo y con una cuenta institucional en lugar de una personal.

**Distribución sin re-tipear:** marcador `…/estacion#t=<STATION_TOKEN>`. El
fragmento no viaja al servidor; la app lo guarda en el navegador en el primer uso.

**Enlace a Sinapse.** `enlaceSinapse(rut, plantilla)` arma la URL desde el RUT.
Si el RUT tiene dígito verificador inválido no se muestra el botón, para no abrir
la ficha de otra persona por un error de tipeo. La plantilla se configura en
`VITE_SINAPSE_URL` porque su formato depende de la instalación del hospital.

### Dónde vive cada pieza

| Pieza | Dónde | Por qué ahí |
|---|---|---|
| App (HTML/JS/CSS) | GitHub Pages, estática | Es solo código, no hay datos. Público es irrelevante. Da HTTPS gratis y, sobre todo, **service worker** → PWA instalable y offline. |
| Datos clínicos | Google Sheets + Apps Script | Hojas sin identidad; las escribe el celular. |
| Identidad paciente | Hoja `identidad` (token de estación) | Disponible en cualquier PC; el celular no puede leerla; se purga al alta. |
| Cola de escritura | IndexedDB del celular | El WiFi de la UCI se cae; la app no. |
| PIN de los 18 profesionales | Hash (bcrypt) en hoja aparte + ScriptProperties | El PIN plano nunca viaja ni se guarda. |

**El celular puede usar datos móviles.** Esto es importante y resuelve el problema más
grave: la app no depende del WiFi del hospital en absoluto. El kinesiólogo carga la PWA
una vez, queda instalada, y sincroniza por 4G/5G cuando el WiFi del box no da.

### Lo que hay que aceptar de Apps Script (sin maquillaje)

Son limitaciones reales, no pesimismo. El diseño las absorbe, pero conviene conocerlas:

- **Latencia:** 1–3 s por escritura, a veces más. → Por eso **nunca se escribe sincrónicamente.** El kine guarda, ve ✅ al instante (escritura local) y la subida ocurre en background.
- **Concurrencia:** ~20–30 ejecuciones simultáneas y `LockService` serializa las escrituras a la hoja. Con 18 profesionales podría haber contención. → Mitigado por escrituras en lote (batch) y reintento con backoff.
- **Cuotas:** cuenta personal de Gmail tiene cuota diaria baja. → Si el proyecto prospera, migrar a una cuenta Workspace del hospital, o a un servidor real.
- **Sheets no es una base de datos:** sin transacciones ni integridad referencial. → Mitigado con **log append-only** (ver cap. 4): nunca se edita una fila, solo se agregan. Eso elimina la clase entera de bugs de escritura concurrente.
- **Sin tiempo real:** no hay WebSocket ni SSE. → La estación hace *polling* cada 20–30 s. Para un tablero de visualización es más que suficiente.

**Ruta de salida:** todo el acceso a datos queda detrás de una interfaz
`RepositorioClinico`. Migrar de Apps Script a un servidor real (Node + SQLite en una VM)
es reemplazar **un** archivo adaptador, sin tocar dominio ni UI. El día que informática
entregue un equipo, es trabajo de horas, no de meses.

---

## 2. Dos instancias, un solo código

| | **Móvil — Captura** | **Estación — Visualización** |
|---|---|---|
| Ruta | `/` | `/estacion` |
| Dónde | Celular, pie de cama / post-box | PC mesón UPC, intranet |
| Operación | Pulgar. Objetivo: < 60 s por control | Mouse y pantalla grande. Lectura. |
| Identidad del paciente | **Nunca** (el servidor no se la entrega). Solo "UCI-03" | Nombre y RUT + botón Sinapse |
| Permisos | Escribe controls, APK, eventos | **Solo lectura** + nota ALMA + informe de riesgo |
| Red | Datos móviles o WiFi, tolera caídas | Intranet |

Un solo proyecto, un `npm install`, un build, un deploy. La separación es **en tiempo de
ejecución** (ruta + rol), no en tiempo de compilación, porque los datos identificables
no están en el bundle: viven en el IndexedDB de la estación. Esto evita mantener dos
apps que divergen, que es la forma clásica en que estos proyectos mueren.

---

## 3. Minimización de datos

Regla verificable en código, ajustada a la decisión del equipo:

> **Ningún dato identificable viaja por el canal clínico (el del celular).** La
> identidad tiene un canal propio, con otro token, que el celular no posee.

- **Canal clínico** (`serializarEpisodioParaNube`, `serializarControlParaNube`…):
  construido por *allowlist*, campo por campo. Un test verifica que el payload no
  contenga llaves como `nombre` o `rut`; si alguien las agrega al modelo clínico,
  el test falla antes del deploy. El servidor repite la validación.
- **Canal de identidad** (`serializarIdentidadParaNube`): único lugar donde salen
  nombre y RUT. Un test comprueba que ese mismo payload *es rechazado* por el
  canal clínico, de modo que no puede colarse por el celular.
- **Retención:** la identidad se purga al alta del paciente.
- **Texto libre de observaciones:** sigue siendo el vector débil (alguien puede
  escribir el nombre de un familiar). Es un control administrativo: la pantalla
  advierte "no escriba nombres".

---

## 4. Modelo de datos: separar lo que el prototipo mezcló

Este es el cambio más importante de ingeniería. El prototipo mete todo dentro del objeto
"atención", y por eso hay requisitos del informe que *no se pueden expresar*: si la vía
aérea es un campo de cada atención, no existe "la vía aérea del episodio"; si el prono
es un booleano por atención, no se pueden acumular horas de ciclo.

Cuatro entidades, no una:

```
Episodio ────< Control >──── (derivados calculados, nunca guardados)
    │
    ├──< EventoClinico   (vía aérea, PVE, extubación, prono, BNM, centinela)
    └──< ValidacionAPK   (pauta de seguridad firmada)
```

### 4.1 `Episodio` — el estado que persiste
Lo que es verdad *entre* controles: cama, edad, sexo, talla (→ PBW), diagnóstico,
**vía aérea actual**, calibre, fijación, días de VM, kinesiólogo titular, estado de
transcripción a ALMA, pendiente de entrega de turno.

La vía aérea vive **aquí**, no en el control. Se fija en el monitoreo de ingreso y es
inmutable para los controles de rutina: un control de las 14:00 no puede "cambiar" la vía
aérea, solo *observarla*. Únicamente un `EventoClinico` la muta. Esto es exactamente la
regla 3.B del informe, y solo es implementable con esta separación.

### 4.2 `Control` — observación inmutable en un instante
Signos vitales, soporte ventilatorio, conciencia, sedación, DVA, intervención kinésica,
observación. **Append-only: un control nunca se edita ni se borra.** Si hubo un error se
agrega un control de corrección que referencia al anterior.

Esto no es purismo: resuelve tres problemas de una vez. (1) La sincronía con Sheets se
vuelve trivial e idempotente —solo se agregan filas, el UUID generado en el cliente
deduplica—. (2) La trazabilidad y la auditoría salen gratis. (3) Desaparece toda la clase
de bugs de "dos celulares editaron el mismo registro".

### 4.3 `EventoClinico` — lo que rompe la rutina
Tipo discriminado (`union` de TypeScript), cada uno con su propia carga útil:
`CAMBIO_VIA_AEREA`, `INICIO_PVE` / `FIN_PVE`, `EXTUBACION_PROGRAMADA`,
`AUTOEXTUBACION`, `REINTUBACION`, `AJUSTE_TUBO`, `INICIO_PRONO` / `SUPINACION`,
`INICIO_BNM` / `FIN_BNM`, `EVENTO_CENTINELA`, `PCR`.

El tipo discriminado es lo que permite que el compilador obligue a manejar cada caso:
si mañana se agrega un evento nuevo, TypeScript marca error en todos los lugares que hay
que actualizar. Es la diferencia entre "funciona hoy" y "sigue funcionando en un año".

Nota clínica de diseño: `AJUSTE_TUBO` **no** cuenta como intubación en la estadística
(regla 3.B del informe), y `AUTOEXTUBACION` dispara automáticamente el flujo de riesgo
del cap. 7.

### 4.4 `ValidacionAPK` — pauta de seguridad firmada
Ver capítulo 6, que incluye una objeción de diseño que hay que resolver.

### 4.5 Derivados: calculados, jamás almacenados
PBW, PAM, PPC, ΔP, Crs, Vt/kg, Tobin, ROX, Glasgow, PaFi, semáforos.

Todos son funciones puras sobre el control. Guardarlos sería garantizar que algún día
queden desincronizados del dato que los originó. El prototipo ya lo hace bien
(`calcMetrics`); se conserva la idea y se lleva a un módulo puro con tests unitarios,
que es donde debe estar la corrección clínica.

---

## 5. Reglas clínicas de negocio

### 5.1 Anti-sesgo: casillas dinámicas en blanco — **hay un conflicto que resolver**

El informe (3.A) exige que al abrir `+ Nueva Atención` las variables dinámicas
(`FC`, `PAS`, `PAD`, `FR`, `Vt`, `P.Pico`, `P.Plateau`, `SpO2`) **nazcan vacías** (`""`),
para forzar la lectura fresca del monitor.

**El prototipo hace lo contrario:** `crearPlantillaNuevaAtencion()` las hereda del último
control (`fc: ult.fc`, `pas: ult.pas`, …). Es precisamente el sesgo de arrastre que el
informe quiere eliminar.

**Se implementa la regla del informe: en blanco.** Es la decisión correcta —un dato
heredado que nadie miró es peor que un campo vacío, porque miente con apariencia de
verdad— y es lo que especificaste.

Qué hereda y qué no:

| Nace en blanco (obligatorio leer del monitor) | Hereda (ahorro de tipeo, sin riesgo) |
|---|---|
| FC, PAS, PAD, FR, Vt, P.Pico, P.Plateau, SpO2 | Infusiones continuas (DVA, sedantes) |
| Actividades de kine motora | Vía aérea (viene del episodio, bloqueada) |
| Aspiración, contraindicaciones, eventos | Modo ventilatorio, PEEP, FiO2 |

La distinción tiene lógica: lo que cambia minuto a minuto y se lee de una pantalla se
pide fresco; lo que es un *estado* que el kine cambia deliberadamente, se hereda y se
suspende con un toque (`[⏹ Suspender]`).

### 5.2 Conciencia condicional
- **Con sedoanalgesia** → exige SAS (1–7) + titulación por escalones.
- **Sin sedación** → oculta SAS, muestra Estado de Vigilia (Vigil/Alerta, Somnoliento,
  Estuporoso, Coma).
- Glasgow con vía aérea artificial: componente verbal = **NT**, total sobre 11T. El
  prototipo ya lo resuelve bien y se conserva.

### 5.3 Sedación por escalones (1–6) + dosis libre
| Fármaco | Esc. 1 | Esc. 6 | Unidad |
|---|---|---|---|
| Fentanilo | 0.6 | 3.6 | mcg/kg/h |
| Propofol | 0.5 | 3.0 | mg/kg/h |
| Precedex | 0.2 | 1.5 | mcg/kg/h |
| Midazolam | 0.01 | 0.06 | mg/kg/h |

Los escalones se interpolan linealmente entre el 1 y el 6. **Dosis libre** siempre
disponible para coma inducido o estatus epiléptico: la plataforma no debe impedir
registrar la realidad clínica, solo acelerar el caso frecuente.

### 5.4 DVA y semáforo de riesgo
- Noradrenalina / Adrenalina: 🟢 < 0.1 · 🟡 0.1–0.3 · 🔴 > 0.3 mcg/kg/min
- Vasopresina: botones rápidos 0.01 / 0.02 / 0.03 UI/min

### 5.5 Candado de mecánica ventilatoria — el detalle que da credibilidad
Si el modo es controlado (`VCV` o `PCV`) **y** se marca `⚠️ Asincrónico`, entonces
P. Plateau, ΔP y Compliance estática quedan **invalidadas**: no se muestran, no entran
en la nota ALMA, no alimentan tendencias.

Esto se implementa como una función pura `plateauEsValido(control): boolean` en el núcleo,
consumida por UI, nota y estadística. Una sola fuente de verdad: es imposible que la
pantalla diga una cosa y la nota de ALMA diga otra.

Clínicamente es el rasgo que distingue esta plataforma de una planilla: reportar una
compliance calculada sobre un plateau contaminado por esfuerzo muscular activo no es un
dato imperfecto, es un dato falso.

### 5.6 Esfuerzo respiratorio y destete (panel condicional PSV)
P₀.₁, NIF, P_occ, P_mus, PMI, PIM (pimómetro) y **PCF** con corte institucional
≥ 55–60 L/min para éxito de extubación.

### 5.7 Prono y BNM
BNM se activa por fármaco (Atracurio, Rocuronio, Vecuronio). Prono se modela como
**ciclos** con eventos `INICIO_PRONO` / `SUPINACION`; las horas acumuladas se *derivan*
de los eventos, no se escriben a mano. Solo es posible gracias a la separación del cap. 4.

---

## 6. Módulo APK digital — con una objeción que hay que resolver

> **Superado (Revisión 2).** La unidad pidió una copia fiel de la hoja de papel con marca por criterio; se implementó así y se conserva abajo solo como historia de la objeción original.

El informe pide: "Al registrar que la APK se realizó, el sistema valida y rellena de
inmediato todos los puntos de la pauta", con firma automática por sesión.

**Tengo que plantear una objeción, y es importante.** Un clic que marca como verificados
N criterios individuales de seguridad hace que el registro **afirme** que se revisó cada
punto, con una firma nominal detrás. Si después ocurre un evento adverso y se audita la
pauta, el registro muestra criterios "verificados" que quizá nadie miró. Eso es peor que
el papel: el papel al menos no miente rápido. Y el expuesto es quien firma.

**Diseño alternativo que conserva el clic único:** el toque único **no** rellena N
casillas. Registra **una sola aserción atestiguada**:

> "Declaro haber verificado los criterios de seguridad de la pauta APK vigente
> (versión X) y no encontrar contraindicación." — Klgo. [nombre], [hora]

Es un enunciado, no N enunciados falsificables. Mismo clic, misma velocidad, pero el
registro dice la verdad de lo que ocurrió: el profesional revisó la pauta y la aprobó
globalmente, que es exactamente lo que hace en la práctica frente al paciente.

Y se agrega una vía rápida de **excepción**: si *un* criterio falla, se marca ese
criterio y la APK queda "no cumple" con el motivo. Dos toques para el caso excepcional,
uno para el caso normal.

Se guarda además la **versión de la pauta** firmada, para que un cambio futuro del
protocolo no reescriba retroactivamente lo que alguien firmó.

**Adaptación condicional por vía aérea** (como pide el informe): la pauta se discrimina
según `esViaAereaArtificial(episodio.viaAereaActual)` — pauta completa de seguridad con
soporte invasivo, criterios de vía aérea natural en el otro caso. El dato ya está en el
episodio, así que no hay llenado redundante.

---

## 7. Gestión de riesgo: celular → estación

1. **Celular (10 s).** Evento adverso crítico (p. ej. autoextubación): tipo, hora exacta,
   descripción breve. Nada más. El kinesiólogo está con un paciente sin vía aérea; no es
   el momento de llenar un formulario.
2. **Sheets.** Se registra el evento des-identificado con bandera `requiereNotificacion`.
3. **Estación.** Alerta visual 🔴 en la tarjeta de la cama.
4. **Informe pre-llenado.** Al abrirlo, la estación compone el Informe Preliminar de
   Gestión de Riesgo cruzando: evento + controles previos (contexto fisiológico de las
   horas anteriores: SAS, sedación, DVA) + identidad local. Eso es lo que convierte 40
   minutos de burocracia en una revisión de 5.
5. **Notificación.** Texto listo para copiar al sistema formal de la institución, más
   correo a coordinación.

El punto fuerte: el contexto fisiológico de las horas previas al evento **ya está
capturado**. Hoy ese contexto se reconstruye de memoria, días después.

---

## 8. Puente a ALMA

1. Se compone la nota desde los controles del turno (función pura, testeable).
2. Dos modos: **turno completo** y **última atención**.
3. Terminología clínica formal, estructura fija (hemodinamia → conciencia/sedación →
   respiratorio/vía aérea → kinesiterapia y eventos → cronología → plan de entrega).
4. `[Copiar Evolución para ALMA]` → portapapeles → pegar en TrakCare.
5. La cama pasa a 🟢 **Transcrito** con hora.
6. **Casillas individuales**: además del bloque, cada parámetro se copia por separado,
   porque ALMA tiene campos discretos. El prototipo ya lo resuelve con `PARAMETROS_ALMA`
   y el filtro "solo casillas kine"; se conserva.

El generador es una función pura `componerNotaAlma(episodio, controles, eventos, modo)`.
Es la pieza con más valor clínico por línea de código y por eso va con tests sobre casos
reales: paciente en VCV asincrónico (sin plateau), paciente en CNAF (con ROX, sin ΔP),
paciente extubado intraturno.

---

## 9. Dotación, turnos y REM 28

**Dotación** (4 turnos + subrogancia + reemplazos), login RUT + PIN propio con hash:

| Turno | Profesionales |
|---|---|
| 1 | Mauricio Ortega · Felipe Guerrero · Natalia Parra |
| 2 | Sergio Ortiz · María José Vega · Álvaro Wilson |
| 3 | Eduardo González · Diego Melo · Karen González |
| 4 | Carlos Morales · Andrés Ángel · Manuel Fuentes |
| Subrogancia / Coordinación | Rodrigo Caamaño · Magdalena Contardo |
| Reemplazos | Aline Campos · Scarlett Tabilo |

**REM 28.** Al ser el modelo append-only, el consolidado mensual es una *agregación* sobre
el log, no un contador que alguien incrementa (y que se desincroniza). Sesiones
respiratorias, aspiraciones, validaciones APK, niveles de movilización 1–4, FBC,
cultivos, autoextubaciones, ciclos de prono. Se calcula, no se acumula.

---

## 10. Stack y por qué

| Capa | Elección | Razón |
|---|---|---|
| Lenguaje | **TypeScript estricto** | El prototipo es `.tsx` pero es JavaScript plano sin un solo tipo. Con reglas condicionales clínicas (si asincrónico → invalidar plateau; si sedado → exigir SAS) los tipos discriminados no son burocracia: son lo que evita el bug que reporta un dato falso. |
| UI | React 18 + Vite | Continuidad con el prototipo, build rápido. |
| Estilos | Tailwind | El prototipo ya está escrito en Tailwind: se recupera el diseño en vez de rehacerlo. |
| Estado | Zustand | Reemplaza 18 `useState` en un componente de 2.300 líneas. |
| Local | Dexie (IndexedDB) | Cola offline en el celular, mapa de identidad en la estación. |
| PWA | vite-plugin-pwa | Instalable, offline. **Requiere service worker → por eso el shell va en GitHub Pages y no en HtmlService de Apps Script, que corre en un iframe sandbox donde el service worker no funciona.** |
| Tests | Vitest | Sobre el núcleo clínico. |
| Backend | Apps Script + Sheets | Tu elección, detrás de la interfaz `RepositorioClinico`. |

### Dictado por voz: una corrección necesaria
El prototipo usa `webkitSpeechRecognition`. Dos problemas: **manda el audio a los
servidores de Google** (no funciona sin internet, y es audio clínico saliendo del
hospital) y solo existe en navegadores Chromium.

**Decisión: se elimina ese código.** Se usa un `<textarea>` normal y **el dictado nativo
del teclado del teléfono** (iOS y Android lo traen, funciona offline en equipos
modernos, el usuario ya sabe usarlo). Menos código, mejor privacidad, funciona en más
dispositivos. El parser de números hablados en español (`parseSpokenNumber`) sí se
conserva: es útil y no depende de la nube.

---

## 11. Estructura del repositorio

```
RCE-ALMA/
├─ docs/                     Plan maestro, modelo de datos, seguridad
├─ backend/apps-script/      Código .gs + contrato de API
└─ src/
   ├─ core/                  ◄── DOMINIO PURO. Sin React. Testeado.
   │   ├─ tipos.ts              Entidades y uniones discriminadas
   │   ├─ catalogos.ts          SAS, GCS, IMS, sedantes, niveles, APK
   │   ├─ dotacion.ts           Los 18 profesionales y turnos
   │   ├─ fisiologia.ts         PBW, PAM, PPC, ΔP, Crs, Tobin, ROX, PaFi
   │   ├─ validez.ts            Candado de mecánica
   │   ├─ sedacion.ts           Escalones 1-6 + dosis libre
   │   ├─ dva.ts                Semáforos
   │   ├─ apk.ts                Pauta condicional + aserción firmada
   │   ├─ eventos.ts            Reductores: vía aérea, horas de prono
   │   ├─ nota-alma.ts          Generador de evolución
   │   ├─ rem28.ts              Agregación estadística
   │   └─ sanitizar.ts          Frontera de minimización (allowlist)
   ├─ datos/                 Repositorios: Dexie local + Apps Script
   ├─ movil/                 Vistas de captura
   ├─ estacion/              Vistas de visualización
   └─ ui/                    Componentes compartidos
```

`src/core` no importa React ni Dexie ni nada de red. Es la regla que mantiene el
proyecto sano: la corrección clínica vive en funciones puras que se pueden testear en
milisegundos y razonar sin levantar un navegador.

---

## 12. Fases de construcción

| Fase | Entregable | Estado |
|---|---|---|
| **0** | Plan maestro, decisiones de arquitectura | ✅ este documento |
| **1** | Scaffold + **núcleo clínico con tests** | 🔨 en curso |
| **2** | Repositorios: Dexie local + cola de sincronía | |
| **3** | Apps Script: API, hoja, hash de PIN, deploy | |
| **4** | Móvil: login, 6 camas, nuevo control, APK, eventos | |
| **5** | Estación: sábana 24h, tendencias, nota ALMA, riesgo | |
| **6** | PWA, REM 28, marcha blanca con datos ficticios | |

**Fase 1 primero y con tests porque es la única parte independiente de la decisión de
backend** y porque es donde vive la corrección clínica. Si el candado de mecánica o el
Glasgow condicionado están mal, da igual qué tan bonita sea la pantalla.

---

## 13. Riesgos

| Riesgo | Mitigación |
|---|---|
| **Autorización institucional** | Es un registro paralelo con datos de pacientes. Hay que presentarlo a jefatura de UPC y a calidad/informática **antes** de la marcha blanca. La minimización del cap. 3 y el encuadre del cap. 0 son exactamente los argumentos que hacen viable esa conversación. No es un trámite: es lo que separa "herramienta del equipo" de "problema". |
| Cuotas / latencia de Apps Script | Escritura local inmediata + sincronía en background + lotes. Interfaz `RepositorioClinico` para migrar a servidor real. |
| El link del web app es la credencial | PIN por profesional validado en servidor + token de app; rotación del deploy si se filtra. |
| Nombres en texto libre de observaciones | Advertencia en pantalla. Es el punto más débil del diseño y hay que decirlo. |
| Doble registro (UPC-Pulse + ALMA) | El semáforo 🟢 Transcrito es obligatorio; ninguna cama cierra turno sin él. |
| Adopción | La prueba es una sola: un control en menos de 60 segundos con una mano. Si no se cumple, se vuelve al papel. |
| Dependencia de una cuenta Google personal | Migrar a cuenta Workspace institucional en cuanto haya respaldo formal. |

---

## 14. Criterio de éxito

1. Un control completo a pie de cama en **< 60 s**, con una mano, sin computador.
2. **Cero** camas sin transcribir a ALMA al cerrar turno.
3. Informe de gestión de riesgo pre-llenado en **< 5 min** en vez de 40.
4. REM 28 mensual sin recuento manual.
5. Tendencias de 24 h legibles de un vistazo en la estación.

---

## Tablero de ventiladores (nov-2026)

Pedido de la unidad: saber dónde está cada ventilador, moverlo desde el PC y que cada colega
registre desde el celular el de su sala; un colega, el del fondo, cuida además la bodega.

- **Datos:** inventario independiente del paciente, derivado de un registro de movimientos de
  solo agregar (hoja `ventiladores` en Apps Script; tabla `movVentiladores` en la base local,
  versión 2 de Dexie). Sin datos de pacientes; pasa igual por la guarda de identidad.
- **Zonas:** pasillo, bodega, mantención (nota libre) y fuera de la unidad (servicio, salida
  y retorno con aviso de color).
- **Pantalla:** cinco ventanas fijas (1–6, 7–12, 13–18, pasillo y bodega, mantención y
  préstamo); camas 1–4 en columna, el resto en pares; recuadros de tamaño constante.
- **Pendiente de la unidad:** cuántos equipos hay en total y cuántos suelen quedar en pasillo,
  mantención y préstamo (hoy una zona con varios equipos crece); si el atraso de un préstamo
  debe llegar también a una campana de alertas; si el retorno de un préstamo necesita un botón
  «ya volvió»; fotos de cada modelo para afinar los dibujos; si hay más de un Servo U.
- **Para desplegar:** pegar `Codigo.gs` y ejecutar `inicializarLibro` (crea la hoja que falta).
