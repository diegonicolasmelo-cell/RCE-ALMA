# Etapa 7 · Crítica: estructura

Revisor sin memoria (EGM, persona estructural), contra el estándar de especificación de funcionalidad.

**Mapa:** encabezado · §1 Resumen · §2 Historia · §3 Objetivos y no-objetivos · §4 Hoy → después · §5 Los datos · §6 Reglas, promesas y pendientes. Faltan las secciones de **alternativas** y de **riesgos**, y el **pseudo-código** que pide el método PRD del proyecto.

| # | Sev. | Dónde | Problema | Sugerencia |
|---|---|---|---|---|
| B1 | 🔴 | Todo el documento (P02, P04, P12, NO1, R8, R10) | No hay «Alternativas consideradas». P02 descarta «(b)» y «(c)» sin definirlas; la opción React/PWA se descarta sin razones; R10 se justifica con «se deduce de la imagen». | `## 7 · Alternativas consideradas`: opción · qué es · por qué se descarta. Que los pendientes la citen. |
| B2 | 🔴 | Todo el documento | No hay «Riesgos y mitigaciones». Faltan: escala de la puerta (lotes contra `conLock` y cuotas), `doPost` público, **datos clínicos en reposo en un teléfono personal** mientras esperan en la cola, reloj del teléfono (R12), dos escritores de ECF/Barthel, las 73 guardias que no ven la entrada nueva. | `## 8 · Riesgos y límites`: riesgo · dónde · mitigación (R#) · riesgo residual. |
| I1 | 🟡 | Alcance (l. 7) | No cubre R11 (escalas), R12 (filtros), R13 (PIN y sesiones) ni R10 (retiro de la Estación). | Ampliar el alcance y poner R10 como objetivo o no-objetivo con identificador. |
| I2 | 🟡 | Etapas (l. 74-79) | No se trazan contra reglas ni pendientes: `EVALUACIONES`, `CAMAS_ESTADO` y `DISP_*` sin etapa; R13 sin etapa; P07 y P08 sin decir qué bloquean. | En cada etapa «Requiere: R#, P# · Entrega: filas de ‹Qué sube›»; en cada pendiente «Bloquea: etapa N». |
| I3 | 🟡 | Pendientes (l. 158-169) | El ✅ mezcla tres estados: cerrado, asumido a confirmar y cerrado por medición. | Tres marcas con leyenda; igual para R10, R12 y la cifra de R13. |
| I4 | 🟡 | §6 | Sin pseudo-código «CUANDO… → ENTONCES…» justo en los candados encadenados (no duplicar, R11, R12, rechazo por identidad, episodio cerrado, confirmación de R7). | Un bloque de pseudo-código por candado. |
| I5 | 🟡 | Encabezado (l. 3-5), R1 | Estado «8-nov» con decisiones del 9-nov; no enlaza a los PRD hijos; **R1 contradice al PRD de la etapa 1** (que la enciende recién en la etapa 2); no refleja Kaptus ni sus choques (Estación B, texto, turnos). | Estado corto + «Qué cambió» con fechas, línea «PRD hijos», ajustar R1, nota de vigencia. |
| I6 | 🟡 | Tabla de vocabulario (l. 101-107) | Compara pero no traduce: no se ve a dónde va CNAF y la fila de O₂ termina en «…». | Tabla valor→valor con «¿equivalente seguro?» y remisión a R6. |
| I7 | 🟡 | l. 155 vs l. 114 | La promesa «no descarta nada» contradice el rechazo sin reintento de un registro con identidad. | Escribir la excepción y dónde queda auditado. |
| N1 | 🟢 | §5, §6 | Subtítulos en negrita, no navegables. | H3 numerados o pendientes en su propio `## 7`. |
| N2 | 🟢 | Reglas | Formato dispar; R13 es un párrafo de ~250 palabras. | Título en todas las reglas; incisos de R13 como lista. |
| N3 | 🟢 | NO2/R8/P05, R12/P09 | Contenido repetido. | Regla en un solo lugar y citas por identificador. |
| N4 | 🟢 | l. 109 | Mezcla medición, inventario y decisión. | La medición a P03; en §5 solo el hecho. |
| N5 | 🟢 | Referencias por línea | Medidas sobre una foto desactualizada (7.06). | Citar por nombre de función. |
| N6 | 🟢 | PRD externos | Sin ruta ni repo; sin «Creado:» ni maqueta. | Ruta completa y metadatos como los hermanos. |
| N7 | 🟢 | Objetivos | Las reglas no citan su objetivo; NO3 no tiene regla que lo vigile. | «→ O#» en cada regla. |
