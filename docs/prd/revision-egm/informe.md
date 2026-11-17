# Revisión Elephant-Goldfish del PRD de acceso (v1 → v2), 17-nov-2026

Tres revisores sin memoria (vista general, diseño y comprensión) leyeron la v1. Todos sus hallazgos se incorporaron en la v2.

## Diseño (no aprobado tal como estaba)
1. 🔴 **`autorizar()` no es el único punto de entrada**: en Apps Script, el navegador puede llamar a cualquier función cuyo nombre no termine en «_». Hay 224 así en el RCE (verificado), entre ellas `obtenerTodasLasCamas`, `episodiosPorRut`, `pulseLectura`, `resetearBaseDeDatosCONFIRMAR` y `testFlujoCamas`. → Paso 0b.
2. 🔴 PIN de 4 dígitos expuesto sin el token de la app: probando al azar, unas 480 pruebas al día por firma; además cualquiera puede bloquear al equipo. → 6 dígitos, límite global, contadores separados, aviso.
3. 🔴 Reutilizar la sesión de Kaptus tal cual la vuelve llave del RCE completo y el tope de 3 sesiones expulsa la del teléfono. → Sesión propia del RCE.
4. 🟡 El primer ingreso con PIN temporal no cerraba. → `ACCESO_DEFINIR_PIN` y censo de PIN.
5. 🟡 En modo aviso un equipo sin marca no tiene identificador, y el criterio «lista vacía» nunca se cumple. → Llave desde la primera carga, filas pendientes, criterio por nombre.
6. 🟡 No está medido si la marca sobrevive en los PC del hospital. → Se mide en el modo aviso.
7. 🟡 Círculo sin salida de coordinación en un equipo sin aprobar. → Entrar primero con la clave personal; aprobar desde otro equipo.
8. 🟡 Lecturas extra en cada pedido y escritura de último uso dentro de un pedido. → Caché de 5 min y bandera.
9. 🟡 La sesión vence en el corte de turno, justo al evolucionar, y el cliente reconoce el error por el texto. → Hora de gracia y código de error.
10. 🟢 Faltaban alternativas, riesgos y el origen en la auditoría. → Agregados.

## Vista general (aprobado con cambios)
1. 🔴 Sesiones RCE/Kaptus compitiendo (igual que diseño 3).
2. 🔴 Primer ingreso con PIN temporal (igual que diseño 4).
3. 🟡 Combinación de los dos interruptores sin tabla; el login de Google debe seguir siendo vía válida. → Tabla §5.4.
4. 🟡 Un solo campo para tres credenciales. → Prefijos `eq:`/`ses:`.
5. 🟡 Modo aviso sin identificador (igual que diseño 5). → Un solo mecanismo: aprobar filas pendientes.
6. 🟡 Caché como `firmaDeEmail`. → §5.1.
7. 🟡 Coordinación detrás del candado y el cliente reconoce el rechazo por texto. → Inventario.
8. 🟢 Pseudo-código con detalle de código. → Esquema de huellas en las promesas.

## Comprensión (lector clínico, solo el PRD)
Marca por navegador y no por computador · cómo reconocer los equipos de la unidad · «firma» con dos sentidos · quién tiene PIN · duración de la sesión con horas reales · quién es coordinación · qué planilla es la del paso 0 · jerga (huella, implementación) y la opción A que no aparecía. → Sección «Palabras que usa este documento», ejemplos de horas, inventario rotulado para Manuel.
