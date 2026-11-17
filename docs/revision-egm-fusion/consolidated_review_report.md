# Revisión con revisores sin memoria · PRD de fusión RCE-KINE ↔ Kaptus (ex UPC-Pulse)

**Qué se revisó:** `PRD_FUSION_RCE_KINE_UPC_PULSE.md` de Manuel (8-nov-2026), con el método Elephant-Goldfish de Google (complemento EGM). Siete revisores que **no conocían ninguna conversación previa** leyeron el PRD; seis también leyeron los PRD hermanos, el estado actual de Kaptus y el código de los dos sistemas, y uno solo el PRD (prueba de comprensión). Fecha: 17-nov-2026.

**Etapas corridas:** 5 vista general (arquitecto escéptico + catalizador) · 6 comprensión · 7 crítica (diseño, estructura, estilo) · 8 vista general intermedia. La 9 (preparación para implementar) no aplica: el PRD no trae plan de implementación. Nadie modificó el PRD: esto es solo el informe.

Informes por etapa, en esta carpeta: `zoom_out_report.md`, `comprehension_report.md`, `critic_report_diseno.md`, `critic_report_estructura.md`, `critic_report_estilo.md`, `intermediate_zoom_out_report.md`.

## Veredicto

La dirección de fondo se sostiene: **un solo registro oficial (el RCE), el episodio nace en el RCE y todo se amarra por `PATIENT_ID`, sin nombre ni RUT en el teléfono, y nada cuenta para el REM sin que una persona lo confirme.** Pero el PRD **no está listo para programar la etapa 2**: describe un Kaptus que ya no existe, da por hechas piezas del RCE que aún no se construyen, marca como cerradas decisiones que Diego no ha tomado, y su mecanismo central (la confirmación de eventos) no está definido y abre un segundo camino de guardado.

## 🔴 Bloqueantes

| # | Qué | Encontrado por | Acción |
|---|---|---|---|
| 1 | **«Quién es la estación» quedó reabierto.** R8, R10 y P06 retiran la Estación B y el motor de texto de Kaptus que Diego aprobó el 15-16 nov. Hoy hay dos motores de texto en espejo. | Vista general 1 · Catalizador 1 · Vista intermedia (a) | Diego decide: cifras oficiales y motor de texto (decisiones 1 y 2). Reescribir el «Hoy» del PRD con el Kaptus real. |
| 2 | **La confirmación de eventos no está definida y duplica el guardado.** Dónde, quién, qué pasa si nadie confirma, en qué fila queda `EXT_OCURRIO`. Copiar la lógica del formulario en otro botón repite «la misma regla en cuatro sitios», y el olvido solo cambia de lugar. | Comprensión 1 · Vista general 6 · Catalizador 2 · Diseño 7 | **Guardar la evolución prellenada = confirmar.** Lo pendiente al cambio de turno, a la campana (decisión 3). |
| 3 | **La etapa 2 no reutiliza: construye.** `CONTROLES`, `HOJA_DIA` y el prellenado son del PRD de cabecera, que dice «no se programa hasta resolver P07, P09 y P20». | Vista general 2 · Vista intermedia (a) | Declarar la dependencia, o achicar la etapa 2 a un **borrador del turno** en una sola hoja. |
| 4 | **La tabla «Qué sube» cubre pocos de los ~35 tipos de evento de Kaptus** (autoextubación, prono, desvinculación, cultivos, cambio de equipos, traslado…). | Diseño 1 · Catalizador 5 | Regla por defecto: **lo que no está en la lista no sube y se queda en Kaptus**; sumar autoextubación y prono a O5. |
| 5 | **Registro en el paciente equivocado:** con una lectura vieja o un traslado aún no registrado, el control entra limpio a otro episodio abierto. | Diseño 2 | Mostrar la antigüedad de la lectura, avisar si cambió el `PATIENT_ID` de la cama; el paso por el formulario en el PC lo reduce mucho. |
| 6 | **La cola sin señal choca con la sesión que vence en el corte de turno:** un control de las 20:50 subido a las 21:10 se rechaza o queda firmado o en el turno equivocado. | Catalizador 3 · Diseño 3 | Sellar cada registro con la sesión y la hora de captura; el turno lo calcula el RCE desde esa hora. |
| 7 | **Faltan las secciones de riesgos y de alternativas** que pide el estándar; los descartes se justifican por quién lo dijo. | Estructura B1, B2 · Diseño 10 | Agregar `Alternativas consideradas` y `Riesgos y límites`. |

## 🟡 Importantes

| # | Qué | Encontrado por | Acción |
|---|---|---|---|
| 8 | Los ✅ marcan como cerrados supuestos de Manuel que Diego no confirmó (P02-P06, P09, P11, P12, R10). | Vista general 10 · Estilo 1-2 · Estructura I3 · Comprensión 7 | Tres marcas: cerrada · asumida a confirmar · le toca a Diego. |
| 9 | Turnos: el PRD dice «ya coinciden» (09-21); Kaptus usa 8-20. | Vista general 4 · Catalizador 7 | Decisión 4; si manda el RCE, Kaptus lee los cortes de su `CONFIG`. |
| 10 | La puerta principal del RCE ya está abierta a cualquiera (`AUTH_DEV_MODE=TRUE`, implementación anónima); el PIN solo protege la puerta lateral. El bloqueo por firma permite dejar fuera a todo el equipo. | Vista general 3 · Catalizador 9 · Diseño 6 | Decisión 5; espera creciente en vez de bloqueo duro; decir que el token no es seguridad. |
| 11 | Vocabulario: P03 crea «VNI sin interfaz» en unos 15 lugares del RCE, en contra de P12 («el satélite habla el idioma de la estación»); la tabla compara pero no traduce. | Vista general 5 · Catalizador 5 · Comprensión 2 · Estructura I6 | Kaptus pregunta la interfaz con VNI y usa los catálogos del RCE. |
| 12 | Alcance: R11 (escalas) y R12 (filtros) son funciones de escritura nuevas fuera del alcance, con dos escritores sobre el mismo dato. | Vista general 7 · Catalizador 4 · Comprensión 5 · Estructura I1 | Sacarlas a una etapa posterior; reutilizar «manda la última edición» (v7.05). |
| 13 | Estado intermedio: mientras la extubación espera confirmación, la lectura sigue bajando TOT/VM. | Comprensión 3 · Diseño 7 · Catalizador 10 | En el teléfono manda el evento local «pendiente de confirmar en RCE». |
| 14 | Bandeja «sin destino»: nombra cuatro cosas distintas y no tiene dueño ni alarma. | Vista general 11 · Catalizador 6 · Comprensión 4 · Estilo 5 | «Bandeja de revisión» con motivo, dueño y aviso en la campana. |
| 15 | Padre e hijos se contradicen: qué baja al teléfono y cuándo rige R1. | Vista general 8 · Estructura I5 | El padre remite a la lista permitida del contrato. |
| 16 | La promesa «con el interruptor apagado el RCE queda igual» es falsa (P03, columnas de R13, `EPISODIO_ESCALA`, pantalla de R7). | Diseño 8 | «Las cifras y el guardado del PC no cambian» + lista de lo que sí. |
| 17 | Sin criterios de paso entre etapas ni plan de reversa. | Diseño 9 · Estructura I2 | Criterios medibles y reversa por etapa. |
| 18 | Identidad del profesional y de pacientes: el PRD usa la firma; Kaptus entra con correo, cifra identidades y propone huella del RUT. | Catalizador 8 · Vista general 12 | El RCE como único dueño de identidades; migrar la autoría. |
| 19 | Sin pseudo-código «CUANDO… → ENTONCES…» en los candados. | Estructura I4 | Un bloque por candado. |

## 🟢 Menores

Cama ocupada sin `PATIENT_ID` (Diseño 4) · candado global y cuotas, a medir en el piloto (Diseño 5) · identificadores ya recibidos (Catalizador 11) · R12 compara una hora con una fecha (Diseño 11, Comprensión 11, Estilo) · demasiado detalle técnico para un PRD padre (Vista general 9) · glosario y presentación de cada sistema (Comprensión 6, 9) · tablas legibles para Diego (Estilo 3) · R13 en viñetas (Estilo 4) · reglas repetidas (Estilo 6, Estructura N3) · referencias viejas y por número de línea (Vista general 12, Estructura N5) · títulos navegables y metadatos (Estructura N1, N2, N6, N7).

## Lo que la vista intermedia considera exagerado

- Turnos: es una decisión y una línea, no un defecto de arquitectura.
- Reabrir el camino (c): en el mismo proyecto choca con `doGet` y `_hoja`; en uno aparte es el (b).
- La tabla de 35 eventos: basta la regla por defecto (punto 4).
- Candado y cuotas: con 18 camas, se mide en el piloto.

## El camino más simple que propone la vista intermedia

1. Mantener la etapa 1 ya programada (lectura de camas y `PATIENT_ID`), en 2 o 3 camas.
2. Kaptus habla el idioma del RCE (catálogos, interfaz de la VNI, cortes de turno).
3. Una sola subida: **el borrador del turno** (último control + eventos), sin duplicar, en una hoja nueva.
4. En el RCE, «Traer de Kaptus» al abrir la evolución; **guardar como siempre es confirmar**.
5. Cifras oficiales del RCE; las de Kaptus, si quedan, rotuladas «de trabajo, no oficial».
6. Escalas, filtros, hoja impresa y corte, recién con uso medido.

## Las cinco decisiones que van antes de construir (para Diego, con Manuel)

1. ¿De qué sistema salen las cifras oficiales? Las de Kaptus, ¿se apagan o quedan rotuladas «no oficial»?
2. La evolución que se copia a ALMA, ¿la escribe el RCE o Kaptus? (Un solo motor.)
3. Una extubación anotada en el teléfono, ¿cuenta al tiro o al guardar la evolución en el PC? ¿Y si nadie la confirma?
4. ¿Turnos 9-21 u 8-20?
5. ¿Se acepta la app del equipo abierta a cualquiera con PIN por funcionario, o el teléfono espera el login institucional? ¿La planilla sigue compartida «con cualquiera con el enlace»?
