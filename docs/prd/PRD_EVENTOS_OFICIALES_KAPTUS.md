# PRD · Los eventos de Kaptus son los oficiales

**Estado:** borrador para revisar con Diego (y Manuel). **No programado.**
**Dueño:** Diego Melo (coordinación de kinesiología UPC Adulto).
**Fecha:** 20-nov-2026. Reemplaza la decisión 1 de la revisión del 17-nov («cifras oficiales del RCE»).
**Alcance:** Kaptus (teléfono) y RCE-KINE (estación). Toca las cifras oficiales de los dos: por eso va con PRD.

**Queda FUERA:** la identidad real con login institucional; las escalas y los filtros desde el teléfono; el capturador
de exámenes; editar un control guardado; los rangos fisiológicos (todos anotados aparte en `PLAN-MAESTRO.md`).

---

## 1. En dos líneas

**Hoy:** el colega anota el evento en el teléfono y, al llegar al PC, lo vuelve a marcar en el formulario del RCE para
que cuente. Si no lo marca, para la estadística el evento no ocurrió.

**Después:** el evento se anota una vez, en el teléfono, en el momento. Desde ahí cuenta para la estadística interna y
el REM. El RCE lo muestra, lo usa para la evolución y deja agregar lo que faltó.

## 2. La historia

**ANTES.** Jueves 19, turno día. Sergio llega a la cama 3 con el teléfono. El paciente fue extubado ayer por un colega
que todavía no usa Kaptus, así que para el teléfono sigue con tubo y no le ofrece la CNAF. Para seguir, Sergio tendría
que llenar una PVE que no ocurrió. Al final del turno, en el PC, Diego vuelve a escribir en el RCE la extubación, el
cultivo y el traslado a escáner, uno por uno. Si a alguien se le olvida ese segundo paso, la extubación no existe para
el REM de fin de mes.

**DESPUÉS.** Sergio abre la cama 3. Kaptus le pregunta «la vía aérea cambió fuera de Kaptus?» y él marca «extubado
ayer, ~16:00, queda en CNAF», sin PVE. Toma un cultivo y lo anota: se abre una ventana, elige la muestra y registra. En
el PC, la estadística ya muestra la extubación y el cultivo en el momento en que ocurrieron. Al final del turno Diego
abre la evolución en el RCE, aprieta «Traer resumen del turno» y la copia a ALMA. No vuelve a marcar nada.

## 3. Objetivos y no-objetivos

| Id | Objetivo |
|---|---|
| O1 | Un evento se registra **una sola vez**, en el teléfono, y cuenta para la estadística interna y el REM. |
| O2 | La estadística del RCE es **en tiempo real**: un evento anotado se ve al recargar, sin esperar el guardado de la evolución. |
| O3 | **Nada se cuenta dos veces**: si el colega del PC también lo marca en la evolución, sigue siendo un evento. |
| O4 | Quien **todavía no usa Kaptus** sigue registrando en el RCE como hoy, y eso también cuenta. |
| O5 | Una vía aérea que cambió **fuera de Kaptus** se corrige en el teléfono sin inventar una PVE, y queda marcada como registro tardío. |
| O6 | Registrar un evento en el teléfono es **obvio**: la ventana aparece a la vista (hecho el 20-nov). |

| Id | No-objetivo |
|---|---|
| N1 | No se borra el registro de eventos del RCE: sigue existiendo para quien no usa Kaptus (O4). |
| N2 | No se reescriben las ~12 lecturas de `EXT_OCURRIO` del RCE de una sola vez: se migran por tandas (§5.4). |
| N3 | No se automatiza ningún evento de vía aérea: se registran a mano, por decisión clínica. La app solo detecta olvidos. |
| N4 | El nombre y el RUT no viajan del teléfono al RCE, igual que en la subida de controles. |
| N5 | La «corrección tardía de vía aérea» (O5) **no** cuenta como extubación de Kaptus si ya está en el RCE: solo pone al día la vía. |

## 4. El flujo, dos veces

**Hoy**

```
Teléfono: evento ──> queda en Kaptus (cuenta solo en la estadística de Kaptus)
PC (RCE): el colega vuelve a marcarlo en el formulario ──> EVOLUCIONES.EXT_OCURRIO ──> REM, indicadores, estadística
          (si no lo marca: no ocurrió)
```

**Después**

```
Teléfono: evento ──> cola sin señal ──> RCE «subirEventos» ──> hoja KAPTUS_EVENTOS (+ hito en TIMELINE)
                                                                     │
PC (RCE): formulario (si lo marca igual) ──> EVOLUCIONES.EXT_OCURRIO  │
                                                                     ▼
                       eventosOficiales(episodio, rango) = unión de las dos fuentes, sin duplicados
                                                                     │
                                         REM · indicadores · estadística · entrega · sábana
```

## 5. Los datos

### 5.1 Qué sube

Cada evento de Kaptus viaja con: `id` (lo pone el teléfono; reintentar no duplica), `cama`, `patientId`, `tipo`,
`horaEvento` (la que anota el colega, no la de llegada), `datos` (lista cerrada por tipo: con qué queda, motivo, muestra,
nivel KTM…) y `registroTardio` (verdadero para O5). Entra por la misma puerta que los controles (`svc_pulse.gs` →
`svc_kaptus.gs`), con la misma sesión, la misma gracia de una hora tras el corte y el mismo filtro de RUT.

### 5.2 Dónde queda

- Hoja nueva **`KAPTUS_EVENTOS`** (una fila por evento, `ID_EVENTO` único, `ESTADO`: vigente · anulado · revisar).
  Sin nombre ni RUT. De solo agregar: anular es cambiar el estado, no borrar.
- Además, un **hito en `TIMELINE`** con `DATOS_JSON` (columna que ya existe desde la rama episodio/turno): así la línea
  de tiempo y el traslado de cama (`_reetiquetarEpisodioACama`) lo ven sin código nuevo.

### 5.3 Tabla de traducción (primera tanda)

| Kaptus | RCE (lo que cuenta) | Para |
|---|---|---|
| `EXTUBACION_PROGRAMADA` (con o sin PVE) | extubación, `EXT_TIPO` programada / fuera de protocolo | REM, indicadores, tiempo extubado, cierre del tramo de VM |
| `AUTOEXTUBACION` (y accidental) | autoextubación / extubación accidental | indicadores, REM |
| `REINTUBACION`, `FALLA_POST_EXTUB` | reintubación, fracaso | indicadores de fracaso |
| `INICIO_PVE`/`FIN_PVE`, `PVE_NO_REALIZADA`, `PVE_SIN_EXTUBAR` | PVE y su resultado | estadística de destete |
| `TRAQUEOSTOMIA`, `DECANULACION` | TQT, decanulación | REM, indicadores |
| `TOMA_CULTIVO`, `TRASLADO_IMAGEN` | cultivo, traslado a imagen | estadística interna |
| `TERAPIA_FISICA`, `IMT`, `EDUCACION` | KTM con nivel, IMT, educación | REM (códigos ya mapeados en Kaptus) |

Lo que no está en la tabla **no cuenta en el RCE** y se queda en Kaptus (regla por defecto de la revisión EGM).

### 5.4 Inventario de consumidores (dónde vive hoy la regla «hubo extubación»)

Leen `EXT_OCURRIO` de EVOLUCIONES: `svc_rem.gs`, `svc_indicadores.gs`, `svc_stats.gs`, `svc_entrega.gs`,
`svc_camas.gs` (archivo del episodio), `svc_evoluciones.gs` (cierre del tramo de VM), `svc_auditoria.gs`,
`dominio_texto.gs`, `dominio_validacion.gs`, `mantenimiento.gs`, `esquema.gs` e `index.html`.

**Tandas:** ① REM + indicadores + estadística (las cifras oficiales) · ② entrega y sábana · ③ archivo del episodio y
cierre del tramo de VM · ④ el resto. Cada tanda reemplaza su lectura directa por `eventosOficiales(…)` y suma su prueba.

### 5.5 El candado que evita contar dos veces

Un evento del RCE y uno de Kaptus son **el mismo** si: mismo `PATIENT_ID` · mismo tipo traducido · mismo turno lógico
(o, si los dos tienen hora, a menos de 3 horas uno del otro). En ese caso cuenta una vez, con la hora de Kaptus.

### 5.6 Interruptores

- `CONFIG.KAPTUS_EVENTOS_OFICIALES` (FALSE al nacer): con FALSE los eventos suben y se ven en la línea de tiempo, pero
  **no cuentan**; con TRUE entran a `eventosOficiales`. Permite probar con 2 o 3 camas sin tocar el REM.
- `CONFIG.PULSE_ACTIVO` (ya existe): sin puerta abierta no sube nada.

## 6. Pseudo-código (el acuerdo)

```
CUANDO llega un evento de Kaptus
  ¿la sesión vale (o está en la hora de gracia y el evento es anterior al corte)?   NO → rechazar «SESION_VENCIDA»
  ¿el tipo está en la tabla 5.3?                                                   NO → guardar, ESTADO vigente, no cuenta
  ¿el episodio es el que ocupa la cama?                                            NO → guardar con ESTADO «revisar»
  ¿ya existe ese ID?                                                               SÍ → reemplazar (solo su autor)
  ENTONCES guardar en KAPTUS_EVENTOS + hito en TIMELINE con DATOS_JSON

CUANDO alguien pide cifras (REM, indicadores, estadística) de un rango
  eventos = casillas de EVOLUCIONES del rango
          + (si KAPTUS_EVENTOS_OFICIALES) KAPTUS_EVENTOS vigentes del rango
  juntar los que son «el mismo» (5.5) → uno, con la hora de Kaptus
  contar

CUANDO el colega abre la evolución en el PC
  mostrar arriba los eventos de Kaptus del turno, ya marcados y con la etiqueta «desde Kaptus»
  al guardar: lo que vino de Kaptus NO se vuelve a escribir como evento nuevo (5.5 lo uniría igual)

CUANDO en el teléfono se corrige «la vía aérea cambió fuera de Kaptus»
  cambiar la vía del episodio con la hora aproximada · sin PVE · registroTardio = verdadero
  si el RCE ya tiene esa extubación → no cuenta de nuevo (N5) · si no la tiene → cuenta, marcada «registro tardío»
```

**Promesas**
- Un evento anotado una vez cuenta una vez, venga de donde venga.
- Con `KAPTUS_EVENTOS_OFICIALES` en FALSE, las cifras del RCE quedan exactamente como hoy.
- Ningún nombre ni RUT llega al RCE desde el teléfono.

## 7. Riesgos y límites

- **Dos fuentes por un tiempo:** mientras haya colegas sin Kaptus, la regla 5.5 es lo que sostiene las cifras. Se
  vigila con una auditoría de solo lectura (eventos «casi iguales» que no se unieron).
- **Teléfono sin señal:** el evento cuenta cuando llega, con su hora real. Una cifra mirada antes de que llegue sale
  baja; la de fin de mes, no.
- **Un evento anotado por error en el teléfono:** hay que poder anularlo (queda en ESTADO anulado). Falta decidir desde
  dónde (pregunta 4).

## 8. Alternativas consideradas

- **Escribir el evento directo en la fila de EVOLUCIONES del turno** (así nadie cambia sus lecturas): descartada, porque
  fabricaría una evolución que nadie escribió y chocaría con el guardado del colega.
- **Que el RCE deje de registrar eventos**: descartada por ahora (N1): parte del equipo todavía no usa Kaptus.

## 9. Preguntas para Diego

1. **¿Cuándo dos registros son el mismo evento?** ¿Mismo turno, o a menos de N horas? (Propuesta: mismo turno, o 3 h.)
2. **Si el teléfono y el PC no están de acuerdo** (Kaptus dice extubado y la evolución del RCE sigue con tubo), ¿quién
   manda? (Propuesta: manda el evento de Kaptus y el RCE muestra un aviso para revisar la evolución.)
3. **¿Qué eventos van en la primera tanda?** (Propuesta: la tabla 5.3.)
4. **Un evento mal anotado en el teléfono**, ¿lo anula su autor en el teléfono, coordinación en el RCE, o los dos?
5. **¿Con qué camas se prueba** antes de encender `KAPTUS_EVENTOS_OFICIALES`?
