# Etapa 8 · Vista general intermedia (después de todos los hallazgos)

Revisor sin memoria que leyó el PRD y los cinco informes anteriores.

## (a) ¿Sigue en pie «Kaptus satélite, RCE estación central»?

**A medias.** Se sostiene: el episodio nace en el RCE y todo se amarra por `PATIENT_ID`; nombre y RUT nunca llegan al teléfono; el REM y los días de VM tienen un solo dueño; nada cuenta sin que una persona lo confirme. **No se sostiene** «Kaptus es solo un frente de celular»: desde el 8-nov creció con la Estación B y su motor de texto, aprobados por Diego, y R8, R10 y P06 los retirarían.

- **A favor:** hoy la extubación se escribe dos veces y, si se olvida en el RCE, el REM y el reloj de VM quedan mal. Solo un registro oficial único lo arregla.
- **En contra:** la etapa 2 no reutiliza, construye (`CONTROLES`, `HOJA_DIA` y el prellenado son de un PRD que aún no se programa), y la confirmación de R7 sería un segundo camino de guardado que copia lo que hoy hace el formulario. Si nadie confirma, el olvido solo cambia de lugar.

## (b) Un camino más simple

1. Mantener la etapa 1 ya programada: Kaptus lee camas y `PATIENT_ID` del RCE, en 2 o 3 camas, y deja de crear pacientes de la unidad.
2. Kaptus habla el idioma del RCE: sus catálogos, la interfaz de la VNI (Full Face u Oronasal) y los cortes de turno de la `CONFIG`. Desaparecen P03 y la marca «sin traducir».
3. Una sola subida: **el borrador del turno**, un JSON por paciente y turno con el último control y los eventos, sin duplicar (pid + turno + id), en una sola hoja nueva.
4. En el RCE, al abrir la evolución de esa cama, **«Traer de Kaptus»** prellena el formulario, incluida la vía aérea, con el aviso de transición que ya existe. **Guardar la evolución como siempre es la confirmación.** Un borrador sin usar al cambio de turno sale en la campana.
5. Cifras oficiales: las del RCE. Las de Kaptus pueden quedar a la vista como «de trabajo, no oficial».
6. Recién con uso medido: hoja impresa desde los controles, escalas (R11), filtros (R12) y el corte de la planilla de Kaptus.

## (c) Las cinco decisiones previas, en orden

1. ¿De qué sistema salen las cifras oficiales? Las de Kaptus, ¿se apagan o siguen rotuladas «no oficial»?
2. La evolución que se copia a ALMA, ¿la escribe el RCE o Kaptus? Un solo motor de texto.
3. Una extubación anotada en el teléfono, ¿cuenta al tiro o recién al guardar la evolución en el PC? ¿Y si nadie la confirma al terminar el turno?
4. ¿Horario oficial de los turnos: 9-21 u 8-20?
5. ¿Se acepta que la dirección de la app del equipo quede abierta a «cualquier persona» con PIN por funcionario, o el teléfono espera al login institucional? ¿La planilla sigue compartida como «cualquiera con el enlace»?

## (d) Hallazgos que el revisor considera exagerados

- **Turnos 8-20 vs 9-21:** el propio código de Kaptus lo marca «supuesto a confirmar»; es una decisión y una línea, no un defecto de arquitectura.
- **Reabrir el camino (c):** en el mismo proyecto choca con `doGet` y `_hoja`; en un proyecto aparte es el camino (b). La `/exec` ya es anónima con `AUTH_DEV_MODE=TRUE`: el riesgo es esa puerta, y va como decisión 5.
- **Tabla exhaustiva de ~35 eventos:** basta la regla «lo que no está en la lista no sube y se queda en Kaptus»; se suben uno por uno cuando haga falta.
- **Candado y cuotas:** prematuro con 18 camas; se mide en el piloto.
- **Glosario, títulos y metadatos:** correctos pero menores.
- **Paciente equivocado:** no es exagerado, pero el camino simple lo reduce mucho, porque el dato pasa por los ojos de una persona en el formulario antes de contar.
