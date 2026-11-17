# PRD — Control de cabecera: la hoja del día, en el teléfono

**Estado:** Aprobado por Manuel y con las respuestas de la revisión incorporadas (2-nov-2026). No se programa hasta resolver P07, P09 y P20 · **Dueño:** Manuel Fuentes Blanco · **Decide el producto:** Diego Melo Villagrán · **Creado:** 2026-11-02

**Maqueta (datos ficticios):** `https://claude.ai/artifact/CYGQVyAULnDiq4HjHLVKc7`. Es privada: hay que compartirla para que Diego la abra.

**Alcance:** registrar desde el teléfono, junto a la cama, las casillas de las hojas del día (`RK_PG1` y `RK_PG2`, la hoja de registro de dos carillas); ver e imprimir esa hoja con lo registrado desde la app en el computador; y prellenar con ella la evolución que después se pega en ALMA.

**NO toca:** las 396 columnas de `EVOLUCIONES`, el cálculo del REM y de los indicadores, el formulario largo `#kf` (salvo el prellenado de §4), la hoja PVE, la APK, la RHB y el login real (`PRD_PWA_Y_LOGIN_REAL.md`). No hay integración con ALMA ni TrakCare.

---

## 1 · Resumen

**Hoy:** los controles de signos vitales, sedación, DVA y VM se anotan a mano en la hoja impresa, y después se vuelven a escribir en la app y en ALMA.

**Después:** cada kinesiólogo anota esas mismas casillas en el teléfono, junto a la cama. La hoja se arma sola, la evolución sale prellenada y el papel queda solo como respaldo.

## 2 · La historia

> Escrita a partir del pedido de Manuel y confirmada por él (2-nov-2026). Los detalles de la escena no se midieron.

**ANTES.** Manuel está de turno en la UCI. Junto a la cama controla a su paciente y anota los valores en la hoja impresa: frecuencia cardíaca, presión, Glasgow, SAS, DVA y los parámetros del ventilador. Al evolucionar, abre la app y vuelve a escribir lo que ya tiene en el papel. Después pega el texto en ALMA y traspasa los controles de ventilación a su formulario. El mismo dato se registró dos veces, y lo anotado durante el turno solo existe en una hoja que nadie más puede consultar desde otro lugar.

**DESPUÉS.** Manuel saca el teléfono junto a la cama y toca la cama. Aparecen las mismas casillas de su hoja, con el control anterior en gris. Cambia lo distinto y guarda. Ese control ocupa la siguiente columna de la hoja, igual que en papel. Después, en el computador, ve la hoja completa. Al evolucionar, el texto ya trae lo que anotó: solo escribe su juicio clínico y lo que la hoja no sabe, lo revisa, lo guarda y lo pega en ALMA.

## 3 · Objetivos y no-objetivos

- **O1 · Las mismas casillas.** Cada rótulo de `RK_PG1` y `RK_PG2` existe en la hoja digital con su mismo nombre; el laboratorio no se anota en el teléfono (R36). Se comprueba contra la plantilla, no a ojo.
- **O2 · Un control rápido.** Registrar un control no pasa por el formulario de la evolución ni por su guardado de 13 a 17 viajes (medido el 8-ago-2026). Su tiempo real se mide en la planilla antes de prometer una cifra.
- **O3 · Usable con una mano.** A 390 px, sin desborde horizontal y con objetivos de toque de al menos 44 px.
- **O4 · Hoja completa, en el computador.** En el computador, la hoja digital y su impresión muestran lo registrado en las mismas posiciones del papel. En el teléfono, el control solo registra.
- **O5 · Evolución prellenada.** Lo anotado llega a la evolución sin volver a escribirlo, salvo los casos de R9.
- **O6 · Cifras intactas.** El REM y los indicadores dan lo mismo antes y después de instalar esto. Registrar un control no suma sesiones: al REM llegan las atenciones declaradas, como hoy (R37).
- **O7 · Retiro con respaldo.** Retirar el papel no es opcional: la revisión lo describe como una orden prácticamente del gobierno, con ALMA como registro clínico digital (sin documento a la vista). Lo que se decide es cuándo: con piloto cumplido y plan de caída.

- **NO1 ·** No rediseña el formulario largo ni la barra móvil. El control es una entrada corta al lado de ellos.
- **NO2 ·** No cambia ni agrega columnas a `EVOLUCIONES`.
- **NO3 ·** No trae categorías del RCE a la hoja. Las casillas son las del papel. Excepciones: Glasgow O, V y M y la dosis de DVA, solo en el teléfono (R9), y la anotación de procedimientos (R33). También, los eventos de riesgo (R39) y los campos del manual de Diego (R40).
- **NO4 ·** No se integra con ALMA ni TrakCare: el paso es copiar y pegar.
- **NO5 ·** No automatiza eventos de vía aérea, que siguen siendo manuales por decisión de Diego.
- **NO6 ·** No agrega app instalable ni diseña el login aquí: eso vive en `PRD_PWA_Y_LOGIN_REAL.md`. Pero el piloto con teléfonos personales no parte con acceso abierto (P09 y P20).
- **NO7 ·** No se cachean datos clínicos entre peticiones.

## 4 · Cómo funciona hoy → cómo va a funcionar

```
HOY                                      DESPUÉS
Imprimir hoja del día                    Tocar la cama en el teléfono
Anotar a mano junto a la cama            Registrar el control (mínimo 3 por turno)
Volver a escribir en #kf                 En el PC: abrir #kf ya prellenado
Guardar evolución (13-17 viajes)         Completar y guardar evolución (igual que hoy)
Copiar texto → pegar en ALMA             En el PC: copiar evolución → pegar en ALMA; traspasar controles de VM con la vista para ALMA
La hoja queda en papel                   La hoja queda en la base; se ve en el PC e impresa si se pide
```

**Pantallas de registro, todas con rótulos del papel salvo Procedimientos (R33):**

| Pantalla | Casillas | Cuántas veces |
|---|---|---|
| Control | Monitorización: HORA, Frec. Cardiaca, P. Arterial, P. A. Media, PIC/PPC, Glasgow, S5Q, SAS/Escalón, DVA. Terapia ventilatoria: Modo, Vol. Tidial, F Max/T ins, Frecuencia, PEEP/EPAP, P Sop/IPAP, P. Máxima, P. Media, P. Plateau, P. Distensión, Compliance, Auto PEEP, Relación I:E, I. Tobin, Vol. Minuto, FiO2, SpO2, FIRMA | Mínimo 3 por turno; pueden ser más (R18) |
| Turno | Sop. ventilatorio/O2, Horario atención (4) | Día y Noche |
| Ausc./Sec. | Murmullo Pulmonar, Ruidos Agregados con Localización; Secreciones: Características, Reología y Cantidad (R35) | Una por turno |
| Submenú Cuidados neuromusculares | Contraindicación Absoluta y Relativa con Observación; MRC-ss; FSS-ICU; evaluaciones adicionales de fuerza muscular y de pacientes neurológicos y neuroquirúrgicos | Según corresponda |
| Submenú Protocolo de weaning | Parámetros de evaluación previa, INICIO PVE con su conteo (R31) y Extubación fuera de protocolo | Según corresponda |
| Procedimientos | Procedimiento, hora y detalle opcional | Los que ocurran (R33) |
| Evento de riesgo | Evento, hora y descripción breve (R39) | Los que ocurran |

**Piezas que se reutilizan:** `rkHojaHTML` y sus comodines para imprimir; `_turnoLogico` para fechar la hoja con registros (R21); `conLock`, `repoInsertar` y `_repoAsegurarFilas` para guardar; el borrador local sin identidad (`_BORR_SIN_IDENTIDAD`) ante una falla; `copiar()` para el portapapeles; `esMovil()` y el corte de 740 px; el interruptor en `CONFIG`, como `PLANTILLAS_ACTIVAS`.

**Etapas:**

1. **Piloto:** pantallas de registro en el teléfono; hoja digital e impresión llena en el computador. Se encienden por `CONFIG` en 2 o 3 camas. El papel sigue en paralelo.
2. **Evolución:** prellenado de `#kf`, que se va actualizando según R19, copia de la evolución y vista para ALMA en el computador (R23 y R24).
3. **Retiro:** se deja de imprimir en blanco, cumplido O7. Después, imprimir queda solo para el plan de caída.

## 5 · Los datos

**Disparador:** el kinesiólogo guarda un control o una pantalla de la hoja. Nada se escribe solo.

**Hoja nueva `CONTROLES`:** una fila por cada columna de la grilla.

- Identifica: identificador propio del control, `PATIENT_ID`, `ID_CAMA`, fecha de la hoja, turno y momento de guardado.
- Registra: una columna por cada casilla de Monitorización y Terapia ventilatoria, como texto tal como se escribió. Admite coma decimal y «118/64». Suma Glasgow O, V y M, la dosis de DVA y sus drogas con cantidad (R34), que no están en el papel y rellenan el formulario (R9).
- Corrige: marca de anulada y referencia a la fila que la reemplaza, igual que `EVALUACIONES` (`ANULADA`).
- No lleva nombre ni RUT.

**Hoja nueva `HOJA_DIA`:** las demás casillas (Turno, Ausc./Sec., los dos submenús y Procedimientos), una fila por casilla o por bloque según convenga al programar, con la misma identificación y las mismas reglas. El formato interno lo define el agente, cuidando que siga siendo legible en la planilla.

**Candados:**

- `CONFIG.CONTROL_CABECERA_ACTIVO` nace en `FALSE`: sin él, producción no cambia.
- Un identificador generado en el cliente evita que un reintento duplique el control.
- Las escrituras corren en `conLock`.
- No hay tope de controles: el décimo se guarda igual (R18).

**Inventario de consumidores.** Medido con `grep` sobre `develop` (`e15b5fb`). Antes de programar, hay que confirmarlo con el RAG.

| Pieza | Dónde | Qué pasa |
|---|---|---|
| Esquema | `esquema.gs` (`testEsquema`, :992) | Se agregan las hojas y sube el conteo. Exige `crearORepararEstructura()` |
| Despachador | `api.gs:12` | Acciones nuevas de lectura y escritura. Las escrituras pasan por `_auditar` |
| Reseteo | `mantenimiento.gs:161`, guardia `reset.js` | Las hojas nuevas son dato clínico y se van con el reseteo |
| Traslado de cama | `_reetiquetarEpisodioACama`, `svc_camas.gs:514`; guardia `mover_camas.js` | Debe re-estampar `ID_CAMA` en las hojas nuevas |
| Alta | `darAltaPaciente`, `svc_camas.gs:180`; `_archivarEvolucionesDeCama`, :709 | Las hojas nuevas no se archivan, como `EVALUACIONES`: quedan por `PATIENT_ID`. Hay que probarlo |
| Deshacer egreso | `desegresarPaciente`, `svc_camas.gs:364`; guardia `desegreso.js` | Tras deshacer, la hoja del episodio sigue visible. 7.06 aún no está publicada |
| Impresión | `rkHojaHTML`, `index.html:17566`; `RK_PG1` y `RK_PG2`, :17459 y :17468; `_rkConteo`, :17863; `_fechaPapel`, :17480; guardias `hoja_registro_dia.js`, `hojas_dia.js` | Llena las celdas, sin cambiar filas de 14 px ni una carilla por página. Se mide el alto. La hoja con registros usa la fecha de turno (R21); la hoja en blanco sigue con el reloj |
| Prellenado | `fillFormReplica`, `index.html:6511`; `_HER_CAMPOS`, :7157; tabla `_CASCADAS` | Etapa 2. No debe disparar cascadas clínicas ni marcar el formulario como modificado |
| Texto | `genTexto`, `index.html:10136`; `generarTextoEvolucion`, `dominio_texto.gs:42` | Los motores no cambian: leen los mismos campos del formulario, y FC y P. Arterial siguen fuera del texto (R20) |
| Tamizaje de PVE | `candidatoPve`, chips en `index.html:5255` y `:17317` | No se toca. Antes de programar R31 hay que comparar sus criterios con los del protocolo: no pueden decir cosas distintas sobre el mismo paciente |
| Procedimientos del turno | Catálogo en `index.html:11785`; hoja `PROCEDIMIENTOS` | El catálogo se reutiliza para elegir (R33). La hoja `PROCEDIMIENTOS` no se escribe desde el teléfono |
| Buzón y campana | `notifRegistrar`, `svc_notificaciones.gs:25`; hoja `NOTIFICACIONES`; guardia `buzon_campana.js` | Tipo nuevo para el evento de riesgo (R39). El registro sigue siendo de solo agregar |
| Copia de la evolución | `copiar()`, `index.html:9921`, con `data-nodirty` | Deja la marca «Transcrito» (R38) sin marcar el formulario como modificado |
| Hoja UCI | `HJ_F`, `index.html:9203`; guardia `hoja_uci.js` | Sin cambios en esta tanda: sigue con un valor por turno |
| Móvil | `abrirPanel`, `index.html:5486`; `esMovil`, :11974; guardias `movil.js`, `movil_panel.js` | Entrada nueva desde la tarjeta. El acordeón y `.mnav` no se tocan |
| Entrega al editor | `build/que_pegar.js`, `paquete.js`, cohete; nuevo `svc_*.gs` se fusiona en `servicios.gs` | Revisar nombres con `grep`: el espacio global es único |

## 6 · Reglas y promesas — el acuerdo

- **R1 · Manda el papel.** Una casilla del papel es una casilla en el teléfono, con el mismo rótulo. P. Arterial y Glasgow son una sola casilla.
- **R2 · Se guarda tal cual.** Modo, DVA y demás son texto libre. Solo SI / NO se marca, porque así viene impreso.
- **R3 · Lo impreso sigue saliendo solo.** Identificación, vía aérea artificial, VT por talla, gas importado, último cultivo y fechas de filtros no se piden.
- **R4 · Referencia, no copia.** El valor del control anterior aparece en gris y se confirma al guardar. Un control no hecho queda vacío.
- **R5 · Hora.** HORA nace con la hora actual y se puede cambiar.
- **R6 · Ayudas opcionales.** P. A. Media, P. Distensión, Compliance, Relación I:E, I. Tobin y Vol. Minuto se sugieren desde lo anotado. Lo escrito a mano manda y una sugerencia no lo pisa. Los subtotales de MRC-ss y FSS-ICU se suman solos. Las fórmulas son las que la app ya usa, no unas nuevas.
- **R7 · Firma.** FIRMA se precarga con la firma elegida en ese navegador y se trata como declarada, igual que hoy. Con login activo (P20), sale de la identidad del usuario.
- **R8 · Corrección.** Corregir no borra: la fila queda anulada y se agrega otra.
- **R9 · El teléfono rellena lo que hoy se escribe a mano (pedido de Manuel, 2-nov-2026).** Todo lo que el formulario pide y la casilla trae sin adivinar se rellena. Pasan directo: Vol. Tidial, F Max/T ins, Frecuencia, PEEP/EPAP, P Sop/IPAP, P. Máxima, P. Media, P. Plateau, Auto PEEP, FiO2, SpO2, MRC-ss, FSS-ICU y Pimáx. Pasan con una conversión segura: SAS/Escalón («4/3» a SAS 4 y escalón 3) y S5Q (0-2 o 3-5). Auscultación y secreciones pasan directo, porque usan las opciones del formulario (R35). Modo solo si el texto calza exacto con el catálogo. Lo que no calza no se adivina: el formulario lo sigue pidiendo y la app no inventa el dato. Los eventos (intubación, extubación, PVE, TQT, decanulación, prono) nunca se rellenan solos. El rellenado respeta el orden de las reglas clínicas del formulario (sedación antes que evaluaciones), porque hoy una sedación puede borrar evaluaciones ya cargadas. Glasgow y DVA: el teléfono pide O, V y M (V admite 1T) y la dosis (sin requerimientos, baja, media o alta), porque sin ese detalle no se rellenan (Manuel, 2-nov-2026). La casilla Glasgow de la hoja se arma sola, por ejemplo «9T», y la casilla DVA según R34. Frec. Cardiaca se convierte según R30.
- **R10 · La regla madre sigue.** Un control nuevo no pisa un texto editado ni una evolución guardada. La app pregunta antes.
- **R11 · Juicio clínico.** «HDN estable», interacción paciente-ventilador, plan y eventos de vía aérea los escribe el kinesiólogo.
- **R12 · Paciente nuevo, controles nuevos (revisión, 2-nov-2026).** La hoja se guarda por `PATIENT_ID` y va desde que el paciente ingresa hasta que egresa. Si ingresa otro paciente tras un egreso, o si la cama se limpia a mano, `ingresarPaciente` estrena `pid` y eso cuenta como paciente nuevo: su hoja parte vacía y su línea de tiempo no muestra los controles anteriores. El hito de ingreso que ya se escribe marca ese inicio. Los controles anteriores no se borran: siguen bajo su `pid`, y un aviso dice cuántos quedaron en el episodio anterior de la cama, sin mezclarlos. Si fue el mismo paciente re-ingresado por una limpieza a mano, también parte de cero. Esto vale para los controles; lo demás lo decide P21. Lo reproducirá una guardia.
- **R13 · Falla de red.** Si el control no se guarda, la app lo dice en el cuadro central, conserva lo escrito con el borrador local sin identidad y permite reintentar. Nunca muestra «guardado» sin confirmación del servidor.
- **R14 · Datos clínicos en el teléfono.** Lo escrito se guarda en el teléfono solo si falla el guardado, sin nombre, RUT ni diagnóstico, y se borra al confirmarse.
- **R15 · Blanco y negro.** La impresión no depende del color.
- **R16 · Prueba de cada guardia.** Cada guardia nueva se ve roja contra el código sin arreglar y usa rutas reales de la pantalla, con fechas relativas y hora fijada.
- **R17 · Lado simétrico.** Toda prueba clínica pregunta también qué dato verdadero deja de verse.
- **R18 · Controles.** El mínimo es de 3 controles por turno y pueden ser más. Las columnas se llenan en orden. El mínimo no bloquea el guardado ni genera alertas. Al llegar a 9, la app avisa, y el control siguiente se guarda igual y se ve en el computador. Al imprimir, lo que no cabe sigue en una hoja de continuación (P14).
- **R19 · La evolución sigue a los controles.** El primer control del turno prellena la evolución. Desde el segundo, cada control nuevo actualiza ese prellenado, de modo que siempre refleja el último. R9 limita qué campos se llenan y R10 sigue mandando: ante un texto editado o una evolución guardada, la app pregunta antes.
- **R20 · FC y P. Arterial.** No se narran en el texto de la evolución. Van en la tabla de controles.
- **R21 · Fecha de la hoja.** La hoja del 2 de noviembre reúne el Día del 2 y la Noche que empieza ese día, incluida la madrugada del 3. Un control de las 02:00 del 3 va en esa hoja. La hoja con registros se fecha con el turno, aunque se imprima de madrugada: hoy `_fechaPapel` usa el reloj y le pondría 3 de noviembre.
- **R22 · Teléfono y computador.** En el teléfono, el control de cabecera solo muestra las pantallas de registro, con el control anterior en gris como referencia (R4). La hoja, la impresión, la evolución y la copia hacia ALMA se usan en el computador. La vista móvil que ya existe no se retira (NO1).
- **R23 · Dos pasos en ALMA.** En ALMA se pega la evolución en el menú de nota clínica y, además, se teclean campo por campo los controles de ventilación mecánica (confirmado por Manuel, 2-nov-2026). Los controles llevan el orden propio de ALMA, distinto del de la ficha y del papel. Ese orden solo cambia cómo se muestran para traspasarlos: las casillas de la hoja siguen con el rótulo y la posición del papel (R1).
- **R24 · Vista para ALMA.** El formulario «Ventilación Mecánica Invasiva» de ALMA se llena campo por campo, con listas de búsqueda, y registra una fecha y hora por vez, con usuario y contraseña. Por eso un bloque pegado no lo llena. En ALMA se hace un registro por cada control (Manuel, 2-nov-2026), o sea al menos 3 por turno. Propuesta: en el computador, una vista permite elegir el control, muestra su fecha y hora para el registro de ALMA y sus valores en el orden de ALMA para leerlos y teclearlos, y deja en blanco lo que no se registró. No lleva un botón de copiar por campo: para un número corto, cambiar de ventana y pegar cuesta más que teclearlo. No llena ALMA por sí sola ni guarda su contraseña (NO4). Un valor solo se muestra en un campo si R25 dice a cuál corresponde: no se adivina (R9).
- **R25 · A qué campo de ALMA va cada casilla (Manuel, 2-nov-2026).** Vol. Tidial va en Vol. Corriente Programado con el modo AC, y en Espirado con presión soporte o presión control. Frecuencia va en FR programada con AC, presión control y modos parecidos, y en FR total con presión soporte. P Sop/IPAP va en Soporte con CPAP + PS, y en Control con presión control. Compliance va en Compliance Estática. P. Media va en Meseta (Pº Media). P. Plateau, P. Distensión y F Max van en Comentarios. De SAS/Escalón va solo el SAS; el escalón se omite. Si el modo anotado no es uno de los nombrados, el Vol. Tidial, la Frecuencia y P Sop/IPAP se muestran aparte, sin campo asignado, para que quien traspasa decida. Modo es casilla libre: qué escrituras cuentan como cada modo se fija al programar, con los que usa la unidad.
- **R26 · Campos de ALMA que se llenan siempre (Manuel, 2-nov-2026).** SAS, Modo, Frecuencia Respiratoria, Volumen Corriente, Volumen Minuto, Presión Pico, Presión Media, PEEP Programado, FiO2 Programado, Relación I:E, Compliance Estática, Auto PEEP y SpO2. Además, Soporte con CPAP + PS y Control con presión control. La vista para ALMA (R24) muestra estos campos, en el orden de ALMA. Plateau, distensión y flujo se muestran aparte, para Comentarios (R25).
- **R27 · Vía aérea artificial en el teléfono (pedido de Manuel, 2-nov-2026).** Mientras se registra, una franja de una línea queda fija arriba con el dispositivo y calibre, Cms., talla y peso ideal, para tener esos datos a mano (Manuel, 2-nov-2026). Al tocarla muestra Días, días de VM, Reintub. y el VT ajustado a talla. Es de solo lectura: viene de la cama y cambia solo con un evento en la evolución, que sigue siendo manual. Una cama sin vía aérea artificial muestra solo talla y peso ideal.
- **R28 · Vista en paralelo con ALMA (pedido de Manuel, 2-nov-2026).** En el computador, la vista para ALMA se abre en una ventana angosta del RCE, para dejarla al lado de ALMA. Muestra en grande el campo que toca y su valor, y bajo eso la lista completa en el orden de ALMA. «Listo, siguiente» avanza. Las marcas de avance solo ayudan a no perderse: no se guardan, no cuentan como registro y no tocan ALMA. Si el navegador no deja abrir la ventana, el mismo panel se abre en una pestaña y se acomoda con ⊞ Win + flechas. ALMA no se incrusta dentro del RCE.
- **R29 · Lo que debe cumplir el rellenado (prueba del 2-nov-2026 sobre una copia de `main`, sello 7.04, con datos ficticios y guardado simulado; sin servidor real).** El rellenado se comporta como si el kinesiólogo hubiera escrito: actualiza el cuadro de texto visible y deja el formulario marcado como modificado, para que cerrar avise. Va en este orden: sedación y SAS, Glasgow, S5Q y recién después evaluaciones; invertido, un SAS 1 borra MRC y FSS. R10 hay que programarla: hoy nada impide pisar una evolución editada o guardada, y un texto manual quedaría desfasado de los campos. La presión control de la casilla P Sop/IPAP va al campo de presión inspiratoria del formulario (`r_pinsp`), porque con ese modo no existen los de soporte. El gas no se rellena en esta versión (R36); si vuelve, debe marcar primero su casilla (`cGSA`), porque sin ella los valores se pierden. Sin probar: VNI, TQT, turno noche, Glasgow sin tubo, Pimáx, FSS con NE, secreciones y qué control usar cuando hay varios.
- **R30 · Frec. Cardiaca (revisión, 2-nov-2026).** Sobre 100 latidos por minuto es Taquicárdico, bajo 60 es Bradicárdico, y de 60 a 100, ambos incluidos, Eucárdico. Si la casilla no trae un número limpio, no se convierte y el formulario la sigue pidiendo (R9).
- **R31 · INICIO PVE se calcula (revisión, 2-nov-2026).** El rótulo fijo «cumple con 8 criterios» se reemplaza por un conteo calculado de lo que trae el protocolo, por ejemplo «cumple 5 de 7». El SI / NO de INICIO PVE lo sigue marcando el kinesiólogo: el conteo informa, no decide ni registra la prueba (NO5). Falta la lista exacta (P07).
- **R32 · Submenús (revisión, 2-nov-2026).** Cuidados neuromusculares y Protocolo de weaning se abren como submenús separados en el teléfono, para no recorrer toda la carilla 2. El nombre es el de la hoja, «Cuidados neuromusculares diurnos». Al imprimir, siguen en su posición del papel (R1).
- **R33 · Procedimientos (revisión, 2-nov-2026).** Una pantalla permite anotar lo realizado en el turno: traslado, imagenología, intubación, extubación, traqueostomía y otros. Propuesta: se elige del catálogo que la app ya tiene, con texto libre para lo que no esté, y con hora. Se imprime en «Procedimientos y observaciones». Anotarlo no registra el evento ni cuenta para el REM (R9 y O6): al abrir la evolución, la app recuerda lo anotado para que el evento se registre allí. Sin ese recordatorio, una extubación anotada parecería registrada sin estarlo.
- **R34 · DVA con droga y cantidad (Manuel, 2-nov-2026).** Bajo la dosis, cada fila pide cuál droga y qué cantidad, y un botón + suma otra, hasta 6 como el formulario. Se sugieren nombres, pero se puede escribir otro. La casilla DVA de la hoja se arma sola, por ejemplo «NA 0,1 + Vasopresina 0,03». Con dos o más drogas, el formulario queda en «drogas en paralelo» con su número. Los motores de texto no cambian, así que la evolución sigue diciendo la dosis, sin nombrar la droga. Baja, media y alta se siguen marcando a mano mientras no haya cortes (P22).
- **R35 · Auscultación y secreciones (Manuel, 2-nov-2026).** Tienen una pestaña chica propia, con las mismas opciones y reglas del RCE: Murmullo Pulmonar, Ruidos Agregados con Localización y «+ ruido», Características, Reología (bloqueada sin Características) y Cantidad. Hay un solo registro por turno, Día y Noche (Manuel, 2-nov-2026): guardar de nuevo lo corrige, sin borrar el anterior (R8). «Tose y deglute» aparece solo sin vía aérea artificial, igual que hoy. Cada registro rellena la evolución de su turno y va en su columna de la hoja.
- **R36 · Sin laboratorio en el teléfono (Manuel, 2-nov-2026).** De momento, el teléfono sirve para registrar controles y tener información rápida a mano: no anota laboratorio. El gas importado sigue saliendo en la hoja del computador (R3), y el resto del laboratorio se anota como hoy.
- **R37 · Atenciones y REM (Manuel, 2-nov-2026: «la sesion suma todas las atenciones del dia al rem»).** Todas las atenciones del día suman al REM. Hoy el cálculo ya lo hace: `svc_rem.gs` suma `RESP_KTR_CANT` y `KTM_CANT` de cada evolución, así que no cambia. Lectura de esta redacción, por confirmar en P24: un control de cabecera que solo anota parámetros no es una atención y no suma.
- **R38 · Transcrito (manual de Diego).** Cada evolución muestra en el computador si está «Pendiente» o «Transcrito». Copiarla con el botón de la app la deja «Transcrito», con hora y firma. Si después se edita, vuelve a «Pendiente». La marca dice que se copió, no que ALMA la recibió, y no cubre los controles que se teclean aparte (R24 y R28). Se guarda en `HOJA_DIA` (NO2).
- **R39 · Evento de riesgo (manual de Diego).** Desde el teléfono se elige el evento (por ejemplo, autoextubación), se pone la hora exacta y una descripción breve. Eso deja un aviso en el buzón y la campana del computador y arma un informe prellenado para copiar. El aviso nombra la cama, sin nombre ni RUT. Nada sale por correo. Igual que en R33, anotarlo no registra el evento ni cuenta para el REM o los indicadores: al abrir la evolución, la app recuerda registrarlo allí (NO5). El formato del informe depende de P25.
- **R40 · Campos nuevos (manual de Diego).** El teléfono suma, opcionales: Flujo Pico de Tos, NIF y qué bloqueador neuromuscular se usa. No están en el papel: se guardan en `HOJA_DIA` y se ven en el computador, sin agregar columnas (NO2) ni rellenar el formulario. El semáforo del Flujo Pico (55-60 L/min) es solo orientación. Ver P26.

**Promesas:**

- Con el interruptor apagado, la app se comporta igual que hoy.
- Las cifras del REM y de los indicadores no cambian.
- Un control guardado no se pierde con otra acción que no sea anularlo.
- Nombre y RUT no entran a las hojas nuevas ni a ninguna exportación.
- Ningún control se copia solo del anterior.

## 7 · Pendientes — lo que falta decidir

**Clínicas y de uso (Manuel y Diego):**

- ✅ **P01 · Las 9 columnas.** Respondido por Manuel (2-nov-2026): mínimo 3 controles, pueden ser más; el teléfono solo registra y los registros se ven en el computador. Ver R18 y R22. Lo que faltaba quedó en P14.
- ✅ **P02 · Qué control escribe la evolución.** Respondido por Manuel (2-nov-2026): se va actualizando desde el segundo control en adelante. Ver R19.
- ✅ **P03 · FC y P. Arterial en el texto.** Manuel aceptó la propuesta (2-nov-2026). Ver R20.
- ✅ **P04 · Qué se pega en ALMA y desde dónde.** Respondido por Manuel (2-nov-2026): la evolución se copia desde la app abierta en el computador y se pega en el menú de nota clínica; los controles de ventilación mecánica se teclean además campo por campo, en el orden propio de ALMA. Ver R23. Lo que falta está en P15.
- ✅ **P05 · Fecha de la hoja.** Respondido por Manuel (2-nov-2026). Ver R21.
- ✅ **P06 · Historia.** Manuel confirmó §2 (2-nov-2026), incluida la frase sobre el computador.
- ✅ **P14 · Más de 9 controles al imprimir.** Respondido por Manuel (2-nov-2026): la carilla trae 9 columnas y lo que no cabe sigue en una hoja de continuación con las mismas casillas, solo cuando haga falta.
- ✅ **P15 · Los controles en ALMA.** Manuel entregó fotos del formulario el 2-nov-2026. Orden visto (Manuel confirmó que no falta ningún campo entre CPAP y Volumen de Soporte):
  - **Sedación y equipo:** SAS · RASS · Modelo Ventilador · Monitoreo BIS · Modo de Ventilación · Tipo de Humidificación · % de Soporte.
  - **Frecuencia y volumen:** FR programada · FR total · Vol. Corriente Programado · Vol. Corriente Espirado · Vol. Minuto.
  - **Presiones:** Pico · Meseta (Pº Media) · Soporte · Soporte sobre PEEP · Control · CPAP · Volumen de Soporte · PEEP Programado · PEEP Paciente.
  - **Oxigenación y mecánica:** FiO2 Programado · Gases-PaO2 · Sensibilidad/Trigger · Relación I:E · Rampa · Compliance Estática · Compliance Dinámica · Auto PEEP · SpO2 · ETCO2 · CO2 Espirado · PaFi · IOx.
  - **Vía aérea y humidificación:** Pº Cuff · TET Comisura labial · TET Tipo · Alarmas Ventilador Activas · Alarma Presión media VA activa · Temperatura de Humidificación · Revisión Nivel de Agua Humidificación.
  - **Cierre:** Fecha, Hora, Ubicación (obligatorios) · Comentarios · Usuario · Contraseña.

  FC, P. Arterial, Glasgow y DVA no aparecen en este formulario, así que no entran en la vista. Las casillas ambiguas quedaron en R25. Los campos que se llenan siempre quedaron en R26. Manuel confirmó (2-nov-2026) que con presión soporte la Frecuencia va en FR total, que «observaciones» es el campo Comentarios de ALMA, que driving pressure y flujo son P. Distensión y F Max de la hoja, y que la presión control se anota en la casilla P Sop/IPAP, porque la hoja no trae otra.
- ✅ **P16 · Frec. Cardiaca.** Respondido en la revisión (2-nov-2026). Ver R30.
- **P17 · Ventana aparte en el hospital.** Falta probar en el Chrome del hospital que el RCE, servido por Apps Script, pueda abrir la ventana angosta, y que ALMA se pueda usar en el ancho que queda libre. Le toca a Manuel, en terreno.
- ✅ **P18 · SAS 1 y S5Q 2 frente a MRC y FSS.** Respondido en la revisión (2-nov-2026): «está bien mantenerlo así». Se lee como lo que este punto ya proponía: esos datos no se rellenan, la hoja los conserva como se anotaron y el formulario mantiene sus reglas.
- **P19 · Auto PEEP 0 se guarda vacío.** En la prueba, el guardado actual convirtió el 0 en nulo. Es independiente del control de cabecera y conviene arreglarlo aparte; falta confirmar si llega así a la planilla real. Les toca a Manuel y a Diego.
- **P22 · Unidad y cortes de DVA.** ¿En qué unidad se anota la cantidad? ¿Hay cortes por droga para calcular baja, media y alta? Le toca a Diego; mientras tanto, cantidad libre y dosis a mano. Su manual propone, para noradrenalina en mcg/kg/min: baja bajo 0,1; media de 0,1 a 0,3; alta sobre 0,3. Falta que confirme si es la regla de la unidad y qué pasa con 0,3 justo: hoy las pautas de la app dicen «≥0.3» en un lugar y «>0.3» en otro.
- **P24 · Qué es una atención para el REM.** Manuel fijó que suman todas las del día (R37). Falta confirmar con Diego que un control sin terapia no suma, y si «Horario atención» debe sugerir la cantidad de sesiones. Mientras tanto, la cantidad se declara en la evolución, como hoy.
- **P25 · Informe de evento de riesgo.** ¿Qué formato usa la unidad para la notificación y a quién se le entrega? Sin ese formato, el informe de R39 no se cierra. Le toca a Diego.
- **P26 · NIF y Pimáx.** ¿El NIF del manual es distinto del Pimáx que ya se registra (`fPIM`)? Si es lo mismo, no se agrega otra casilla. Le toca a Diego.
- **P27 · Dosis de sedantes.** Manuel aceptó registrar dosis de fármacos (2-nov-2026), lo que revierte el «no se registran dosis» de `PRD_SAS_REAL.md`, decisión de Diego. La DVA ya está en R34. Los sedantes no entran en esta tanda: tocan el formulario y los motores de texto, y necesitan su OK y su propio PRD.
- **P28 · APK digital.** Manuel confirma que técnicamente se puede (2-nov-2026). Sigue fuera de este PRD. Cuando se haga, no se valida con un solo clic como propone el manual: cada criterio se marca por separado, porque es una firma de seguridad.
- ✅ **P23 · Auscultación y secreciones por turno.** Respondido por Manuel (2-nov-2026): uno por turno. Ver R35.
- **P07 · Criterios del protocolo de weaning.** La revisión confirmó que el protocolo trae menos de 8 y que debe calcularse (R31). Falta que Diego confirme si son los 7 parámetros impresos y si la fila en blanco se elimina, y qué cuenta como «cumple» en cada uno. Mientras tanto, R31 no se programa.

**Institucionales (bloquean la etapa 3; P09 además se resuelve antes de un piloto con teléfonos personales):**

- ✅ **P08 · Autorización.** Manuel definió (2-nov-2026) que no se pedirán autorizaciones, por ser un sistema no oficial y de código abierto. El registro oficial es ALMA. La revisión indica que el retiro del papel responde a una orden prácticamente del gobierno (O7).
- **P09 · Teléfonos personales.** La revisión apunta a login y registro de actividad por usuario («probablemente»), así que la firma declarada con acceso abierto no basta para un piloto con teléfonos personales. Según `CLAUDE.md`, sigue `AUTH_DEV_MODE=TRUE`; falta revisar la planilla real. Rige la Ley 19.628. Además, queda por confirmar el cable anotado el 2-sep: que la planilla no siga compartida como «cualquiera con el enlace».
- **P20 · Alcance del login.** ¿Se exige en toda la app o solo para registrar controles? ¿Quién entrega las cuentas? ¿El registro de actividad incluye lecturas o solo escrituras? Hoy `AUDIT_LOG` guarda escrituras, y el login de Google existe apagado (`LOGIN_UI_ACTIVO`, `AUTH_DEV_MODE`), sin probar en teléfonos. `PRD_PWA_Y_LOGIN_REAL.md` espera respuestas de informática. Les toca a Diego y a Manuel; bloquea el piloto con teléfonos personales.
- **P21 · La línea de tiempo y lo demás de la cama.** La revisión pide sacar los datos del paciente anterior de la línea de tiempo de la cama. R12 lo cumple para los controles. Extenderlo a evoluciones y prono choca con la decisión del 6-ago-2026: filtrar esos lectores por `PATIENT_ID` escondió pronaciones verdaderas de un paciente re-ingresado. Queda fuera de este PRD hasta que Diego decida, con ese caso a la vista.
- **P10 · Red y plan de caída.** ¿Cómo es la señal junto a la cama? Si la app cae, ¿quién imprime la hoja con lo registrado y dónde queda? Sin red no hay guardado, así que el piloto mide cuántos controles fallan.

**Técnicos (antes de programar):**

- **P11 · Base de código.** La rama parte de `develop` (7.06, no publicada), y `main` va en 7.04. Falta confirmar qué versión corre en producción y en qué orden se publica.
- **P12 · Canal.** Antes de programar hay que leer `#mejoras-rce`: esta redacción no pudo, porque Slack no estaba conectado en la sesión.
- **P13 · Volumen.** Medir cuánto crecen las hojas nuevas con 17 camas y 9 controles diarios frente al límite de 10 millones de celdas (`v2/mantenimiento.gs:353`) y si la lectura por episodio sigue rápida. Estimación en papel, sin medir: `CONTROLES` con unas 39 columnas, las 17 camas ocupadas y 9 controles diarios suma cerca de 2,2 millones de celdas al año, sin contar `HOJA_DIA`. Falta ver cuánto ocupa hoy la planilla real y definir si `archivarAnioHistorico` también debe mover las hojas nuevas.
