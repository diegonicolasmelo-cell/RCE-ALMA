# Estado actual de Kaptus (antes llamado UPC-Pulse), extracto del plan del proyecto al 17-nov-2026

Kaptus es la app de celular y PC que el PRD llama «UPC-Pulse». Su código vive en /home/user/RCE-ALMA/src.

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
