# Etapa 6 · Comprensión (un lector que solo tiene el PRD)

El revisor leyó **solo** el PRD, sin ningún otro documento ni el código. La prueba es si el documento se entiende por sí mismo.

## Qué propone (paráfrasis del revisor)

Que UPC-Pulse (la app de celular, hoy Kaptus) sea la única vía por la que los controles y eventos registrados junto a la cama llegan a RCE-KINE. RCE-KINE sigue como sistema central: guarda, muestra, cuenta las cifras y entrega las evoluciones. El paciente se ingresa solo en RCE-KINE; Pulse recibe camas y episodios por `PATIENT_ID`, sin nombre ni RUT, y sube controles, escalas, cambios de filtro y eventos por una puerta nueva, una sola vez cada registro. Los eventos que cuentan para el REM llegan como propuesta y cuentan al confirmarse. Pulse deja de calcular cifras, de crear pacientes y de guardar identidades. Cuatro etapas: lectura, controles, eventos y corte, detrás de `CONFIG.PULSE_ACTIVO`, con PIN reforzado mientras no haya login real.

## Cómo funciona hoy, según el documento (paráfrasis del revisor)

Dos sistemas independientes, cada uno con camas, pacientes y planilla propios. Pulse guarda JSON por fila, genera su propio episodio, guarda identidades y calcula sus cifras. RCE-KINE es Apps Script sobre una planilla, sin `doPost`, con despachador auditado y candado; sus cifras salen de casillas como `EXT_OCURRIO` y del soporte. Hoy se reescribe en `#kf` lo anotado en Pulse, y si se olvida un evento no cuenta y los relojes de VM siguen.

## Hallazgos

| # | Sev. | Dónde | Lo que un lector nuevo no entiende | Sugerencia |
|---|---|---|---|---|
| 1 | 🔴 | R7, O5, «Conteo de extubaciones», «NO toca» (l. 10) | **El paso central, la confirmación, no se describe**: dónde, quién, qué pasa si se rechaza o nadie confirma, y en qué fila queda `EXT_OCURRIO` si `EVOLUCIONES` «no se toca». La historia sugiere que ocurre dentro de la evolución prellenada; las reglas no lo dicen. | Secuencia completa en pseudo-código: ¿se escribe la fila del turno? ¿en qué turno cae un evento de las 04:00? ¿se cierra `DIAS_VM_PREVIOS`? ¿y si se rechaza o nunca se confirma? |
| 2 | 🟡 | Vocabulario (l. 99-109), R6 | La tabla pone los vocabularios lado a lado sin correspondencia fila por fila (¿O2 → Oxigenoterapia/OAF? ¿CNAF soporte → modo? ¿AIRE → Ambiente? ¿máscara TQT?). Sin eso, R6 no se puede aplicar. | Tabla Pulse → RCE-KINE → «seguro / sin traducir». |
| 3 | 🟡 | R5 vs historia | La vía cambia «en los dos sistemas», pero la extubación queda propuesta de 04:00 a 07:00: no se dice qué muestra Pulse entretanto ni si los días de VM siguen. | Definir el estado «propuesto, no confirmado» en las dos pantallas. |
| 4 | 🟡 | l. 115, 141, 146, 147 | Bandejas «sin destino» y «sin traducir»: dónde viven, quién las revisa, qué acciones permiten, si son la misma. | Subsección «Bandejas» con dueño, lugar y acciones. |
| 5 | 🟡 | l. 124, R11 | Dos escritores de ECF y Barthel: el candado solo protege lo que viene de Pulse; no se dice cuál manda si luego una evolución lo pisa. | Regla de precedencia o pendiente propio. |
| 6 | 🟡 | Todo | UPC-Pulse nunca se presenta (qué es, dónde corre, dónde guarda); RCE-KINE tampoco más allá de «Apps Script». | Un párrafo por sistema al inicio. |
| 7 | 🟡 | l. 3, §6 | ✅ en supuestos sin confirmar; la l. 3 enumera P02-P12 antes de que se sepa qué son. | Marcas distintas y tabla de estado después de §6. |
| 8 | 🟡 | P02, R13, etapa 1 | No se dice cada cuánto baja la lectura ni qué tan vieja puede estar; cuatro mecanismos sin relación explicada (token, lotes, sesión por PIN, clave de la app, número de petición vs identificador por registro); no se dice en qué etapa rige R13. | Tabla del protocolo: credencial, unidad de reintento, frecuencia, etapa. |
| 9 | 🟡 | Todo | Siglas clínicas y piezas internas sin definir (`#kf`, `conLock`, `fillFormReplica`, «cascadas», ALMA…); `CONTROLES` y `HOJA_DIA` dependen enteras del PRD hermano. | Glosario breve y resumen de una línea de esas hojas. |
| 10 | 🟢 | P04, P07, P10, P11 | Referencias a contexto ausente: «la regla del 11-sep», «cable abierto desde el 2-sep», «las 12 correcciones», versiones y commits. | Explicar cada una en media frase o quitarla. |
| 11 | 🟢 | R12 | Compara una hora con una etiqueta que es un día; «03:00 del 4 queda etiquetado el 4» choca con el turno noche (que es del día 3); «como en el libro» no se explica. | Aclarar que la etiqueta usa el día calendario y cómo se compara. |
| 12 | 🟢 | P03 vs «NO toca» | «VNI sin interfaz» cambia el catálogo y `#kf`, que el documento promete no tocar. | Agregar la excepción. |
