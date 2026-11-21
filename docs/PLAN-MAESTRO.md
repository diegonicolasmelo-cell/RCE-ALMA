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
   │   ├─ dotacion.ts           Dotación vigente (de la hoja) y la de demostración
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

## 15. Ideas guardadas (propuestas que Diego dejó para después)

- **Tocar «Último control» en la tarjeta del paciente abre su sábana** (propuesta del 13-nov-2026).
  Hoy la tarjeta muestra solo la hora del último control; el detalle (modo, FC, SpO₂) se ve en
  «Controles» y en la sábana. La idea era que tocar esa línea abriera directo la sábana de ese
  paciente, como al tocar una tarjeta en «Controles» (`MisControles` en `src/celular/Inicio.tsx`
  ya trae la sábana ajustada al celular con el control destacado). Diego la dejó fuera por
  ahora: teme que los toques accidentales saquen de la pantalla y prefiere un inicio más
  ordenado y controlado. Retomarla si en el uso se pide.

- **Medallas personales** (15-nov-2026, Diego: «perfecto, déjalo en memoria y pendiente»). Mockup aprobado
  en concepto: https://claude.ai/artifact/V5vCnh1T5e4sys4nnvZu1z. Galería desde el círculo con iniciales del
  panel lateral; nueve medallas con bronce/plata/oro (Cultivador, Transportista, Guardián de la PVE, Vigía post
  extubación, Asistente de FBC, Recibidor, Puntual, Noctámbulo, Voz clara). Reglas: personales y privadas, sin
  ranking; **no premian decisiones clínicas** (nada por extubar más ni por TQT: Diego propuso «Extubador» y
  «TQTeitor» y se reencauzaron a seguir el protocolo y registrar bien); se cuentan con lo ya registrado (cada
  control y evento guarda `rutAutor`); íconos SVG propios, no emojis. Falta: que Diego confirme catálogo y cifras.

- **Control en grande desde Controles** (15-nov-2026) — ✅ PROGRAMADO el mismo día: ficha montada en `.app-cel` con portal, solo desde Controles, ‹ › y «Siguiente» pasan de cama. **Falta probarlo en un iPhone instalado.** Nota original: Retomar la rama `ficha-control-celular`
  (ver sección 17) SOLO desde «Controles», con la ficha montada fuera de la lista con scroll (portal a nivel de
  `.app-cel`, `position:fixed`) para evitar el bloqueo del iPhone, y con el botón «Ver sábana». Probar en un
  iPhone real antes de darlo por bueno.

- **I:E estimada con el flujo, para cuando no se anote** (14-nov-2026, Diego: «por ahora quedémonos con
  la I:E anotada… para programarlo después»). Hoy la I:E sale de lo anotado (casilla «I:E» en ACVC y PCV) o,
  si falta, del TI y la FR. Con flujo + Vt programado + FR total se podría estimar en ACVC: TI = Vt ÷ flujo
  (onda cuadrada) o ≈ 2 × Vt ÷ flujo pico (desacelerada, según hasta dónde baje la rampa). **Por qué no se
  hizo:** en la unidad la onda es casi siempre desacelerada y a veces cuadrada, y la pausa no es de rutina;
  sin saber la onda el error llega casi al doble. Para retomarla haría falta una casilla «onda de flujo»
  en ACVC y estimar SOLO con onda cuadrada, mostrándola como «≈ 1:x (estimada)». En PCV no aplica (el flujo
  no se programa). Alternativa más simple: hacer obligatoria la I:E en ACVC/PCV.

- **Proyecto asociado: registro de la reanimación (PCR) con metrónomo** (13-nov-2026).
  Diego tiene en Claude Design una app para el paro cardiorrespiratorio: un metrónomo de
  compresiones que puede sincronizarse con música precargada (o usar solo el metrónomo) y que deja
  registro de lo que se hace durante la reanimación. La idea es enlazarla con Kapta: en Eventos,
  «Paro cardiorrespiratorio» (hoy evento adverso con alerta al PC, y que además abre su control de
  monitorización) abriría el modal de registro de la reanimación. Queda como proyecto asociado, para
  cuando la app de Kapta esté más terminada. Para retomarlo hace falta que Diego comparta ese
  proyecto (enlace o exportación en HTML): desde aquí no se ven los proyectos de Claude Design.

## 16. Dictado por voz en el control (en prueba, 14-nov-2026)

Dictado continuo con revisión. El dictado guiado campo por campo queda para una etapa siguiente.

- **Apagado por defecto.** Cada persona lo activa en su cuenta («Dictado por voz · en prueba»),
  en su celular, después de leer el aviso: el audio lo procesa el servicio de voz del teléfono
  (Google en Android, Apple en iPhone) y sale del celular. Kapta no graba audio ni guarda el texto.
  No usar con pacientes reales hasta que la unidad e informática lo autoricen.
- **Dónde funciona:** donde el navegador ofrece reconocimiento de voz y fuera de Apps Script (en
  el `/exec` el micrófono está bloqueado y el botón no aparece). El teclado no cambia.
- **Qué hace:** signos vitales (FC, PA, SpO₂), Glasgow, infusiones (dosis, «escalón N» o
  «suspendida»), SAS (solo con sedación en curso) y ventilación (modo y las casillas del modo).
  Reglas de la unidad (Diego, 14-nov): «PIP» es PEEP; «frecuencia» a secas es la FR total; los
  valores imposibles o fuera de rango no se aplican (quedan en «No se aplican»); «igual», «sin
  cambios» o «se mantiene» repiten el valor del control anterior. Solo se pregunta cuando un
  mismo dato se dijo con valores distintos. Nada de lo dictado es obligatorio.
- **Glasgow:** siempre ocular, verbal, motor («2 1 4», «uno ocular, tubo y cuatro», «456»); con
  tubo o TQT el verbal es T (si dicen 1 es el del tubo); un total dicho junto se deja de lado.
- **Infusiones:** «infusiones / drogas activas sin cambios» repite todas las que están en curso;
  una por una con «sin cambios», «mismo escalón», la dosis o «escalón N».
- **Modos según la vía:** ACVC/«acbc», ACPC; «CPAP» con tubo o TQT es CPAP + PS y con vía natural
  es VNI CPAP («CPAP 8» = presión de la interfaz); «VNI/BNI» con vía natural pregunta CPAP o S/T;
  CNAF («cenaf») por TQT es alto flujo por TQT; naricera, Venturi («multivent»), reservorio,
  BiPAP/S-T y AVAPS. «Aire ambiente» aún no existe como modalidad.
- **Guía visual:** mientras se habla, una franja baja muestra el texto y las píldoras de los datos
  del modo (verde lo ya dicho, ámbar lo dudoso); el formulario queda a la vista, cada dato oído
  aparece en gris junto a su casilla sin escribirla, y la pantalla baja sola hasta él salvo que la
  persona esté moviendo el formulario.
- **Nada se guarda por voz:** «Aplicar» solo llena las casillas confirmadas (marcadas en azul, con
  «Deshacer»); el control se guarda con el botón de siempre y pasa por las mismas validaciones.

## 17. Ficha del control en el celular (ARCHIVADA, 14-nov-2026)

**Estado:** archivada por Diego («déjalo archivado, trabaja en ello pero no lo programes»). El código vive
en la rama `ficha-control-celular` y **no está en `main`**: el equipo volvió a la sábana completa.

**Qué es:** al tocar un control (en Controles o en la hora del último control de la tarjeta) se abre una
pantalla sin scroll con tres pestañas: *Último control* (FC, PA, Glasgow, SAS, SpO₂ y FiO₂ arriba; los
campos de VM en el orden del formulario de ALMA abajo), *Sábana* (24 h o toda la estadía) y *Evaluaciones*.
Sirve para pasar los datos a ALMA desde el celular sin abrir el PC.

**Qué pasó en el hospital:** en Android se vio bien; **en iPhone «se quedaba pegado»**. Interfirió con el
trabajo del turno y se retiró el mismo día.

**Hipótesis, de más a menos probable (leídas en el código, sin iPhone para comprobarlas):**
1. **La capa se dibuja DENTRO de la lista que se desplaza.** La ficha es `position:absolute; inset:0`, pero
   se monta dentro de `.cel-cuerpo` (la lista de camas o de controles, con `overflow-y:auto`). En Chrome se
   ubica contra `.app-cel` y tapa la pantalla. Safari de iPhone tiene fallas conocidas con capas absolutas
   dentro de un contenedor con scroll: la capa puede quedar corrida hacia arriba (la X fuera de la vista) o
   los toques pueden llegar a la lista de abajo en vez de a la ficha. Eso se ve exactamente como «pegado».
   Pesa más en Pacientes, donde se toca una tarjeta que suele estar abajo en la lista.
   *Arreglo a evaluar:* montar la ficha fuera de la lista (al nivel de `.app-cel`, o con un portal) y usar
   `position:fixed` con los márgenes del notch.
2. **Filas que se reparten el alto con `grid` + botones al 100 %.** Las versiones de Safari anteriores a
   iOS 16 calculan mal la altura de un hijo al 100 % dentro de una fila `minmax(0,1fr)`: la lista puede
   quedar con alto cero o desbordada sin poder desplazarse.
   *Arreglo a evaluar:* filas con alto fijo calculado (alto disponible ÷ número de campos) en vez de 100 %.
3. **La barra de abajo y la del sistema tapan los botones del pie.** En la app instalada en iPhone, el
   indicador de inicio y la barra de navegación de Kápta pueden quedar encima de «Sábana completa» y
   «Copiar evolución». No explica por sí sola el «pegado», pero suma.

**Cómo se prueba antes de volver a publicarla (sin tocar `main`):**
- Publicarla en una dirección de prueba aparte (otra rama de Pages o un artefacto con datos ficticios) y
  abrirla en un iPhone del equipo, en Safari Y en la app instalada.
- Probar desde Controles y desde Pacientes, con la lista desplazada hacia abajo antes de tocar.
- Anotar la versión de iOS de cada teléfono.
- Agregar una guardia de punta a punta con el motor de Safari (WebKit), que hoy no se usa: las pruebas
  corren solo en Chromium, y por eso este fallo no se detectó.

**Respuesta de Diego (14-nov):** se pegó **al abrirla, desde Pacientes, en la app instalada** del iPhone.
Eso coincide con la hipótesis 1: la tarjeta de Pacientes está dentro de la lista con scroll y la ficha se
montaba ahí adentro. Falta solo la versión de iOS. **Sigue sin programarse** hasta que Diego lo pida.

**Preguntas que quedaban:** ① ¿Se quedó pegado al abrirla, o al intentar cerrarla o cambiar de
pestaña? ② ¿Desde Controles, desde la tarjeta de la cama, o las dos? ③ ¿En Safari o en la app instalada?
④ ¿Qué versión de iOS tenía el teléfono (Ajustes → General → Información)?

## 18. Estación en tres grupos (15-nov-2026, opción B aprobada por Diego)

**Turno:** Tablero · Entrega · Para ALMA · **Cifras:** Estadística · Indicadores · REM 28 · **Archivo:** Archivados · Estado.
Un solo motor (`src/core/estadistica.ts`) para Estadística, Indicadores y Archivados; el registro no cambia.

- **Estadística** (feedback de lo hecho, por cama): KTR = controles, KTM / IMT = terapia física realizada (o su motivo),
  modo ventilatorio, APK, eventos con la PVE incluida y quién firmó. Periodo turno/turno anterior/hoy/7 días/mes y filtro por kinesiólogo.
- **Indicadores**: definiciones del tablero del RCE (Manuel). Fracaso = reintubación ≤ 48 h tras extubación programada
  (meta 15 %, fijada por Diego); autoextubaciones /100 días-VM (meta 1–2); fuera de protocolo (meta < 25 %); PVE /100 días-pac.
  Día-VM = día con un control en VMI. **Pendientes:** cargar el histórico mensual del RCE (Diego exporta
  `INDICADORES_HISTORICO` en CSV) y los reingresos por **huella del RUT** en el PC (aprobada; no identifica al paciente).
- **Entrega**: ficha por cama armada con lo registrado (cómo queda · eventos del turno · atención) + pendiente editable,
  impresión en B/N y «Guardar como entregada» (queda en ese PC).
- **Archivados**: egresados sin nombre ni RUT, con sábana completa; **deshacer alta** dentro de 24 h y con la cama libre.
- **Válvula de fonación**: modo nuevo solo con TQT, O₂ adicional en L/min; cuenta turnos con válvula. **Sin cuff** (decisión de Diego).
- **RUT fuera del repositorio**: pendiente de confirmación de Diego para reescribir el historial.

## 19. Paisaje Kaptus con logros secretos (GUARDADO para después, 16-nov-2026)

Reemplaza a las «medallas» y al «museo con vitrinas». Diego aprobó la idea y pidió dejarla para programarla después.

- **Paisaje único** de la Región de Coquimbo, de izquierda a derecha: costa de Punta de Choros con su isla y rocas, faro de
  La Serena, bosque de niebla de Fray Jorge, valle y cordillera. Cada personaje tiene su lugar fijo; los que faltan son
  huecos punteados con «?». Al tocar uno se ve su historia (el secreto descubierto, o quién lo regaló y su mensaje).
- **16 personajes chibi**: degú, cururo, zorro culpeo, guanaco, chinchilla, pelícano, chungungo, pingüino de Humboldt,
  delfín nariz de botella, chuncho, quisco, añañuca, *Copiapoa coquimbana*, papayo de La Serena, olivillo de Fray Jorge y
  el desierto florido. Ojo: la *Lophophora* (peyote) es mexicana; no va.
- **Logros secretos**: nadie sabe cómo se gana un personaje hasta descubrirlo; solo quien lo ganó conoce el secreto. La
  unidad ve una franja con «Chuncho · 2 personas» sin decir cómo. Ejemplo de Diego: «el noctámbulo» = control registrado
  **en vivo** entre 03:00 y 05:00 (nunca premiar registrar tarde ni registrar de más).
- **Repetidos**: se ponen junto al otro en el paisaje o se **regalan a un colega con un mensaje**. El regalo lleva el
  personaje, nunca el secreto. **Solo por la app, sin QR** (Diego, 16-nov).
- **Logro de la unidad**: cuando entre todos sumen 10 secretos distintos descubiertos, florece el desierto en todos los paisajes.
- Sin datos de pacientes en ninguna ficha; personal, sin ranking.
- Mockups: museo https://claude.ai/artifact/NtJiDCax2hgeB1CRdZ4v2v · paisaje https://claude.ai/artifact/3Lq8HyLyA9ZQg5a9H1tYJ2
  (la tabla de 15 secretos del mockup es un borrador para que Diego la ajuste).
- **Dibujos**: Diego los genera con el prompt maestro (estilo fijo + una línea por especie + el paisaje), en PNG con fondo
  transparente y sin suelo; se limpian aquí si vienen con cuadriculado o piso. Mientras tanto sirven los SVG del mockup.
- Abierto: ¿un secreto se gana varias veces? ¿la franja muestra nombres o solo cuántos?

## 20. Llenar el control con una foto del monitor y del ventilador (EN ESTUDIO, 16-nov-2026)

Pedido de Diego: sacar la foto de la pantalla y que el control se llene solo, como con el dictado. La foto **no se guarda**:
se extrae el dato, se confirma y se descarta. Las infusiones siguen manuales.

- **Propuesta (opción A)**: lectura dentro del celular, sin internet. Cámara en vivo con marco guía; la imagen vive solo en
  memoria y se borra al leerla (no galería, no caché, no nube). Un **molde por equipo** con la ubicación de cada número; el
  del ventilador se elige solo con el equipo que la cama tiene registrado. Siempre se **confirma antes de llenar**.
- **Descartada sin aprobación institucional (opción B)**: mandar la foto a una IA en internet. El monitor puede mostrar el
  nombre del paciente (Ley 19.628).
- **Equipos**: monitor **Nihon Kohden** (todos iguales; falta el modelo exacto). Ventiladores: Savina, Vela, Servo U,
  PB 840, PB 980, Avea, Meckis y el **V60** (VNI, ya está en el catálogo de equipos).
- **Orden**: primero el monitor (un solo molde) para medir la precisión real; después los ventiladores, uno por uno.
- **Falta de Diego**: el modelo exacto del monitor y 5 a 10 fotos por equipo, sin nombre ni RUT a la vista (equipo en modo
  demostración o en espera, o el nombre tapado).
- **Decisiones de Diego (16-nov)**: dos botones (monitor y ventilador). Del monitor: FC, PA, SpO₂ y FR; **EtCO₂ y PIC solo
  cuando el paciente los tiene** (Kaptus ya lo sabe por el monitoreo del episodio: capnografía y PIC) y la foto los muestra.
  Un número dudoso **solo se marca en ámbar**, no bloquea el botón.
- Mockup: https://claude.ai/artifact/KPaEWPiE7SkrwZXwYooaGS
- **Más de Diego (16-nov)**: la unidad configurará los ventiladores para que las mediciones aparezcan en la pantalla
  principal; lo que exige maniobra (plateau) se fotografía cuando el valor medido está a la vista. Glasgow y lo clínico
  quedan fuera de la foto. **En la confirmación, cada casilla en ámbar ofrece también el dictado**: se toca y se escribe
  o se dice el número («25»).
- **Factibilidad (respuesta del 16-nov)**: monitor, alta (un solo molde, números grandes); ventiladores, media y distinta
  por modelo. Antes de programar la pantalla se mide con las fotos de Diego cuántos valores se leen bien por equipo.

## 21. Motor de texto con la prosa del RCE (EN CURSO, 16-nov-2026)

Decisiones de Diego: el texto sigue la **prosa corta del RCE** (el equipo la conoce); **sin firma** (estorba al copiar a ALMA,
igual que en BUDA); se mantienen los dos modos, **último control** y **resumen del turno**.

- Referencia: `dominio_texto.gs` del RCE (Manuel). Se traen sus reglas: lo vacío no se escribe; el negativo evaluado sí
  («sin secreciones»); evento = antes → evento → queda con (en Kaptus, con el control ligado al evento); siglas intactas;
  coma decimal; nunca «Otro» como motivo; orden fijo del texto. **No** se traen dos motores en espejo ni las plantillas con
  comodines (en el RCE se apagaron por mala experiencia).
- El resumen del turno deja fuera la «producción» (eso vive en Estadística) y cuenta solo lo que cambió.
- **Paso 1 (hecho)**: comparación del mismo paciente, motor actual vs propuesta numerada línea por línea:
  https://claude.ai/artifact/KSmbi1E3XyxzBbvmKnFoRT — espera las correcciones de Diego.
- Errores del motor actual encontrados: «Glasgow 11T/11T» (con tubo es 10T), la KTM como evento no aparece en el
  resumen («Terapia física realizada: 0»), «(sbc)» en minúscula, «Sin secreciones» repetido, «Días de VM: sin VM» en un
  paciente que estuvo en VM ese turno.
- Abierto: ¿«HDN estable» sin dato de estable/inestable? ¿día de estadía 6 o 7? ¿agregar la fase clínica? ¿encabezado?
- Pasos siguientes: 2 motor por bloques con pruebas de pacientes fijos · 3 narrar eventos con «queda con» · 4 separar de la
  estadística · 5 completar datos faltantes (fase clínica, gases).
- **Decisiones de Diego (16-nov, tras el paso 1)**: «HDN s/DVA» sin estable/inestable · el día del ingreso es el **día 1**
  de estadía · **fase clínica en texto libre** en el episodio (se escribe en la ficha del paciente en el PC) · **sin
  encabezado** · la auscultación sigue en texto libre (Diego tiene dudas; no se tocó).
- **Paso 2 PROGRAMADO (16-nov)**: `src/core/texto-evolucion.ts` (un solo motor, por bloques) reemplaza al texto viejo de
  `nota-alma.ts`; `componerNotaAlma` lo llama. El resumen es solo del turno del último control. Corrección: el «11T» del
  Glasgow con tubo era correcto (el RCE cuenta el verbal como 1T); solo sobraba el «/11T».

## 22. Kaptus como captura del RCE: Manuel ya lo diseñó (hallado el 17-nov-2026)

Diego propuso que Kaptus llene el modal de evolución del RCE. Manuel ya lo tenía escrito (repo
`fuentessmanuel/rce-kine-unificado`, carpeta `docs/`, y ramas del RCE oficial), con Kaptus bajo su nombre anterior
«UPC-Pulse»:
- `PRD_FUSION_RCE_KINE_UPC_PULSE.md` (8-nov): **Pulse es el satélite, RCE la estación central**; «que PULSE sea la forma en
  que llega la información a RCE». Cuatro etapas: 1 lectura · 2 controles a las hojas `CONTROLES` y `HOJA_DIA` del RCE,
  con la evolución `#kf` prellenada (`fillFormReplica`) · 3 eventos de vía aérea y PVE como **propuestas** que se
  confirman en el RCE · 4 corte de la planilla propia de Pulse.
- **Etapa 1 programada** en el RCE (`v2/svc_pulse.gs`): `doPost` con token, PIN por firma de `KINESIOLOGOS`, sesión que
  vence con el turno y acción `lectura` (camas + última evolución, sin nombre ni RUT). Interruptor `CONFIG.PULSE_ACTIVO`.
- Hermanos: `PRD_ETAPA1_PULSE_LECTURA.md`, `PRD_VISTA_TELEFONO_CONTROL.md` (rediseño del control del teléfono),
  `PRD_CONTROL_DE_CABECERA.md` y `PRD_PANEL_CONTROLES.md` (panel del RCE junto a ALMA).
- **Asumido por Manuel y pendiente de que Diego lo confirme**: P02 puerta propia · P03 VNI sin interfaz · P04 ECF/Barthel
  desde el teléfono · **P05/R8 Kaptus no calcula cifras** · **P06 la evolución la da el RCE** · **R10 se retira la
  Estación de Kaptus** · P09 filtros · P11/R13 PIN reforzado · P12 modos de VNI del RCE. Suyos: P07 y P08.
- **Choques con lo hecho en Kaptus del 15 al 16-nov**: Estación B (estadística, indicadores, archivados, entrega) y el
  motor de texto para ALMA quedarían retirados por R8/R10/P06 · turnos: el PRD dice 09-21 y Kaptus usa 8-20 · la KTM, el
  IMT y la educación como eventos tienen que mapearse a las columnas `KTM_*`/`EDU_REALIZADA` del RCE · la huella del RUT
  para reingresos (Kaptus deja de guardar identidades, R3).
- Manuel dejó **9 correcciones a Pulse en una rama local** (`fix/soportes-vni-o2-dias-vm-sin-rut`, commit 5757582) que no
  están en este repo; hay una foto en `rce-kine-unificado/upc-pulse`.
- **Decisiones de Diego (17-nov), tras la revisión Elephant-Goldfish** (`docs/revision-egm-fusion/`): cifras oficiales y
  evolución para ALMA **salen del RCE**; **queda solo Kaptus móvil** (el RCE es la estación); la extubación se anota al tiro
  en el teléfono y en el RCE se confirma con el último control; turnos de la app **8-20**; app del equipo abierta con
  clave y solo como visualizador (por aclarar); **identidades en pausa** (funciona como el RCE hoy). Detalle en
  `docs/revision-egm-fusion/DECISIONES_DIEGO.md`. Se dejan de desarrollar la Estación de Kaptus y su texto para ALMA.

## 23. Pendientes anotados por Diego (GUARDADO para después, 20-nov-2026)

Diego pidió solo dejarlo en memoria, sin programar ni discutirlo todavía.

- **Editar un control ya guardado** cuando uno se equivoca. Hoy no hay forma cómoda de corregirlo. Al retomarlo: definir
  hasta cuándo se puede editar, quién (el autor, coordinación) y que quede constancia del cambio (no pisar en silencio:
  misma regla del RCE, «nada pisa lo guardado sin que se vea»).
- **Rangos fisiológicos por variable** para cazar el dato anotado en la casilla equivocada. Sus ejemplos, textuales:
  anotar la presión arterial en la frecuencia respiratoria («FR 122»), la FR en la saturación («SpO₂ 21»), o la FiO₂ en la
  saturación. Variables nombradas: FC, presión arterial, FR, SpO₂, FiO₂. Al retomarlo: definir con Diego los rangos de
  cada una, y si fuera de rango **avisa** (pide confirmar) o **bloquea**; ojo con que algunos rangos dependen del modo
  (FiO₂ 21-100 %, flujo de CNAF en L/min, etc.). Revisar primero qué valida hoy `src/core/validez.ts` para no duplicar.
- **Capturador de exámenes** (mockup «Pegar examen», 19-nov: https://claude.ai/artifact/58mrLMwvLQZxusGuFxBxuC) — es del
  RCE, no de Kaptus. Formato ya decidido: dato + número + unidad, sin rangos de referencia ni flechas. Abiertas: grupos
  en líneas separadas o una sola línea, y si además llena la GSA de la evolución. Antes de programar: página de prueba en
  el PC del hospital (que el lector de texto se descargue y cuánto tarda). Ojo: el «PO2 / FIO2» de cobas viene 100 veces
  más chico (divide por FiO₂ en %): la PaFi se calcula, no se copia.
- **Sugerencia de un colega (Álvaro, 19-nov-2026), por WhatsApp a Diego** — anotada, sin programar:
  · **Visor en el teléfono «como Kaironda»** (Kaironda es un gestor de turnos con visor de equipo e individual): poder
    ver **el global de la unidad o el de cada funcionario**.
    · **Al menos los controles de MI turno, por paciente.** Hoy se ven todos mezclados y no sirve para la entrega.
    · Su motivo: no tiene la hoja a mano ni hay PC disponible, y quiere ir comentando la evolución del turno desde el
      teléfono. No hace falta las 24 h: basta el turno.
    · Al retomarlo: la sábana del RCE (pestaña del Historial, v7.11) ya ordena por paciente y por turno; en Kaptus
      existe `SabanaVista` (rango 24 h). Lo que pide es un filtro «mi turno / mis camas» y una vista por funcionario.
- **Eventos con texto libre** (Diego, 20-nov-2026): en Eventos debe haber también una opción de texto libre para consignar
  algo puntual que no calza en el catálogo. Al retomarlo: ver si basta el comentario que ya llevan los eventos o si va
  como evento propio «Otro / nota», y que no cuente para ninguna cifra (como las «Anotaciones del turno» del RCE, v5.97).
- **Sábana más corta, por bloques desplegables** (Diego, 20-nov-2026): «para que la sábana no sea tan extensa, que sea
  desplegable lo del ventilatorio, cama, etc.». Cada grupo (Monitorización, Terapia ventilatoria, Kinesiología…) se abre
  y se cierra. Vale para la sábana de Kaptus (`SabanaVista`) y para la del RCE (v7.11): al retomarlo, que las dos usen los
  mismos grupos y que se recuerde qué dejó abierto cada uno.
- **Más sugerencias de Álvaro (20-nov-2026, por WhatsApp a Diego)** — anotadas, sin programar:
  · **Los cm del TOT visibles en Monitorización.** «Se me olvidó como 3 veces en pacientes y me devolvía.» Hoy la
    fijación (cm) no está a la vista donde se anota el control.
  · **APK digital: separar lo fijo de lo opcional.** Lo que va sí o sí, a la vista y sin tocar; lo que puede ser «NA»
    (p. ej. detención de la alimentación, uso de O₂), escondido y seleccionable solo si hace falta.
  · **Aviso al llegar al tope de la hoja imprimible**: antes de seguir anotando, que avise «imprime primero» para no
    perder lo que ya no cabe en la hoja.
- **Y otras de Álvaro (19-nov-2026, por WhatsApp a Diego)** — anotadas, sin programar:
  · **Si se elimina la hoja de papel: un segmento de Laboratorio** en la app, con aviso para los **valores de riesgo**,
    «como ALMA, que sale un símbolo chiquito», pensado para decidir la **motora o la PVE** (p. ej. Hb baja, K⁺
    alterado). Conecta con el capturador de exámenes del RCE (mockup «Pegar examen») y con los cortes ya acordados para la
    hoja impresa (Hb < 7, plaquetas < 100.000, K⁺ < 3,5 o > 5,5…).
  · **La naricera (NRC) no muestra la FiO₂ teórica** al anotar los L/min. Al retomarlo: mostrarla calculada (regla
    habitual ≈ 21 % + 4 % por litro, con tope) como referencia, sin guardarla como medida.

## 24. 🔴 Kaptus es la fuente oficial de los eventos (decisión de Diego, 20-nov-2026)

**Reemplaza** la decisión del 17-nov («cifras oficiales del RCE»). Textual: «desde Kaptus hay que tratar de que sea lo
oficial… todas las opciones que se marquen en Kaptus deberían ser las que se reflejan en el RCE… controlo a través de
Kaptus, anoto los eventos, si algo cambió… ahí quedan registrados para la estadística y para el REM… y luego, cuando
voy al RCE, es para rescatar la evolución o registrar algo que me faltó». Lo que busca: **estadística en tiempo real**
(una extubación, un cultivo o un escáner se ven al tiro).

- **Kaptus registra**: controles y eventos, en el momento, desde el teléfono. Alimenta la estadística interna y el REM.
- **El RCE visualiza**: la sábana, la evolución para ALMA y lo que faltó anotar. No es donde «se registra» la extubación.
- **Por eso el registro de eventos en el teléfono tiene que ser muy bueno.** Primer arreglo (20-nov): el formulario de
  cada evento se abre en una ventana que sube desde abajo (antes salía arriba de la pantalla y quien tocaba un evento
  abajo creía que no se había registrado).
- **PRD escrito (20-nov, sin programar):** `docs/prd/PRD_EVENTOS_OFICIALES_KAPTUS.md` · https://claude.ai/artifact/HaP31MxvseLQKbjK1zrQGk
- **Consecuencias para el enlace con el RCE** (rama `enlace-kaptus`, v7.11): la subida de controles queda igual, pero
  además hay que **subir los eventos como oficiales**, y el RCE tiene que contarlos en sus cifras sin pedir que alguien
  los vuelva a marcar en el formulario. Hay que diseñar cómo conviven con los colegas que todavía no usan Kaptus (ellos
  siguen marcando en el RCE): regla para no contar dos veces el mismo evento. Necesita PRD antes de programar.
- **Caso real que lo motivó (Sergio, 20-nov)**: un paciente extubado el día anterior por alguien que no usaba Kaptus;
  para Kaptus seguía con tubo. Salida inmediata: «Extubación fuera de protocolo» con motivo «Otro» y comentario.
  Pendiente: un «la vía aérea cambió fuera de Kaptus» (cambiar TOT → natural con hora aproximada, sin PVE, marcado como
  registro tardío) y una pregunta al abrir una cama que lleva muchas horas sin controles: «¿cambió algo?».

## 25. Viabilidad de las sugerencias pendientes (21-nov-2026)

Ya hechas: aire ambiente (19-nov) · salas sin ventilador · perfil de interno · eventos en ventana · «Mis controles»
4 h más · fila C1·C2·C3 con todos los controles del paciente · sábana del PC compacta · abreviaturas en la sábana ·
sábana desde la tarjeta de cualquier cama (21-nov).

| Sugerencia | De | Tamaño | Lo que falta decidir |
|---|---|---|---|
| FiO₂ teórica de la naricera (21 % + 4 % por litro) | Álvaro | chico | tope (¿44 % a 6 L?) y si se muestra solo como referencia |
| Eventos con texto libre («Nota») | Diego | chico | si cuenta como evento o solo como constancia (propuesta: constancia, no cuenta) |
| Sábana por bloques desplegables | Diego | chico | qué bloques parten abiertos |
| Pregunta «¿cambió algo?» al abrir una cama con muchas horas sin controles | Sergio | chico | cuántas horas (propuesta: 8) |
| cm del TOT a la vista al anotar el control | Álvaro | chico | hoy salen en la cabecera, pero se esconde al escribir: llevarlos a una fila fija de Monitorización |
| Rangos fisiológicos por variable | Diego | mediano | los rangos de cada variable y si avisa o bloquea (propuesta: avisa y pide confirmar) |
| APK: lo fijo a la vista, lo que puede ser NA escondido | Álvaro | mediano | la lista de qué ítems son fijos y cuáles opcionales |
| Aviso «imprime primero» al llenarse la hoja | Álvaro | mediano | qué hoja y cuántas columnas tiene |
| Visor por funcionario (como Kaironda) | Álvaro | mediano | si basta un filtro «de este colega» sobre la lista de camas y la sábana |
| Cambio de vía aérea fuera de Kaptus (sin PVE, registro tardío) | Sergio | mediano | va en el PRD de eventos oficiales |
| Editar un control guardado | Diego | mediano-grande | hasta cuándo, quién, y que quede constancia del cambio |
| Segmento de laboratorio con aviso de riesgo | Álvaro | grande | depende de cómo entren los exámenes (capturador del RCE); no antes |
| Eventos oficiales al RCE | Diego | grande | PRD listo (`docs/prd/PRD_EVENTOS_OFICIALES_KAPTUS.md`); falta Manuel y las camas de prueba |
