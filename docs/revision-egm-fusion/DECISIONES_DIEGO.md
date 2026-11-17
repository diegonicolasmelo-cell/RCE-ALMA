# Decisiones de Diego sobre la fusión (17-nov-2026)

Respuesta a las cinco decisiones previas de la revisión Elephant-Goldfish (`consolidated_review_report.md`).

| # | Pregunta | Decisión de Diego |
|---|---|---|
| 1 | ¿De qué sistema salen las cifras oficiales? | **Del RCE.** Kaptus alimenta el RCE y del RCE salen el REM, los indicadores y los días de VM. |
| 2 | ¿Quién escribe la evolución para ALMA? | **El RCE.** «Uno lo puede traer directamente de ahí.» El motor de texto de Kaptus se retira para los pacientes de la unidad. |
| — | ¿Qué queda de Kaptus? | **Solo Kaptus móvil.** El RCE es la estación (confirma R10 del PRD de Manuel: se retira la Estación de Kaptus). |
| 3 | Una extubación anotada en el teléfono | **Se anota de inmediato en el teléfono**, y después en el RCE solo se confirma cómo quedó, con el último control. Encaja con «guardar la evolución prellenada es confirmar». |
| 4 | Horario de turnos | **8 a 20 en la app.** Así, al cerrar el turno de la app (20:00) la evolución del RCE ya está armada antes de su corte (21:00) y no hay que llenar casilla por casilla. |
| 5 | Acceso | La app del equipo puede quedar abierta a cualquiera, con clave, y **solo como visualizador**, con las funciones que se usan hoy. *(Por aclarar el alcance exacto.)* |
| — | Identidades (nombre, RUT, huella para reingresos) | **En pausa.** Mientras tanto funciona como el RCE hoy. La protección de datos se prepara después, según Diego porque la nueva ley chilena de datos personales rige recién desde el próximo año. |

## Lo que esto deja

- Se adopta la dirección del PRD de Manuel (Kaptus satélite, RCE estación) con el **camino simple** de la revisión: lectura (etapa 1, ya programada) → borrador del turno desde Kaptus → «Traer de Kaptus» en la evolución del RCE → guardar es confirmar.
- **Se dejan de desarrollar en Kaptus**: Estación B (estadística, indicadores, REM, archivados, entrega), el texto para ALMA y la huella del RUT. No se borran todavía: quedan hasta que el puente funcione en el piloto.
- Pendiente de aclarar: cómo convive el turno 8-20 de la app con el turno 9-21 del RCE (a qué evolución del RCE va un control de las 08:30 o de las 20:30), y qué significa exactamente «solo como visualizador».
