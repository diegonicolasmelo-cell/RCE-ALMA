# PRD — Fusión RCE-KINE ↔ UPC-Pulse: Pulse registra junto a la cama, RCE-KINE guarda

**Estado:** Borrador (8-nov-2026). Manuel eligió la dirección y confirmó la historia. P02 y P06 los asumió Manuel (satélite y estación central). Lo asumido se marca para que Diego lo confirme. P03 también la asumió Manuel: RCE-KINE acepta la VNI sin interfaz. P12 también: Pulse usa los modos de VNI de RCE-KINE. P04, P05 y P09 los asumió Manuel el 8-nov por la noche. P10 se cerró midiendo: la v7.00 ya está en `main` oficial desde la 7.03. P11 la asumió Manuel el 8-nov: PIN provisorio reforzado (R13).
**Dueño:** Manuel Fuentes Blanco · **Decide el producto:** Diego Melo Villagrán
**PRD hermano:** `PRD_CONTROL_DE_CABECERA.md` (repo RCE-KINE, rama `feature/prd-cabecera-respuestas-diego`, 2-nov-2026). Este documento **reemplaza sus pantallas de teléfono** por UPC-Pulse. Mantiene su modelo de datos (`CONTROLES`, `HOJA_DIA`), la hoja impresa, el prellenado de la evolución y el retiro del papel.

**Alcance:** que un control o un evento registrado en UPC-Pulse llegue a RCE-KINE, al paciente correcto y una sola vez, y que Pulse muestre las camas y los episodios que RCE-KINE tiene abiertos.

**NO toca:**
- Las 396 columnas de `EVOLUCIONES` ni el formulario largo `#kf`, salvo el prellenado que ya define el PRD de cabecera.
- El REM, los indicadores ni la estadística: siguen saliendo solo de RCE-KINE.
- El motor de texto de RCE-KINE: las evoluciones siguen saliendo de RCE-KINE (P06).
- El login real de RCE-KINE (`PRD_PWA_Y_LOGIN_REAL.md`).
- La APK y sus documentos.
- El repo público de Diego (`RCE-ALMA`): aquí no se decide qué se publica ahí (P07).

---

## 1 · Resumen

**Hoy:** UPC-Pulse y RCE-KINE son dos sistemas con camas, pacientes y planillas propias. Lo que se anota en uno hay que volver a escribirlo en el otro.

**Después:** el paciente se ingresa una vez en RCE-KINE. Pulse lo ve en su lista de camas y lo que se registra junto a la cama llega a RCE-KINE solo, como si se hubiera anotado en su hoja del día.

**La imagen (Manuel, 8-nov-2026):** Pulse es un **satélite** y RCE-KINE es la **estación central**. El satélite es el frente del celular y registra los controles junto a la cama. La estación recibe todos los datos, los recopila, los muestra y entrega las evoluciones. Y el objetivo, dicho por Manuel: **«que PULSE sea la forma en que llega la información a RCE»**. Lo que se registra junto a la cama entra a RCE-KINE por Pulse. El computador queda para revisar, confirmar y entregar.

## 2 · La historia

> Redactada por Claude a partir del PRD de cabecera y de la revisión de UPC-Pulse, y **confirmada por Manuel (8-nov-2026)**. La escena no se midió en terreno.

**ANTES.** Son las 10 de la noche y Manuel está de turno en la UCI. En la cama 7 ingresó un paciente intubado. Lo ingresó en RCE-KINE con su RUT y sus fechas. Junto a la cama abre UPC-Pulse en el teléfono y la cama 7 está vacía, así que vuelve a crear al paciente con la edad, la talla, el diagnóstico y la vía aérea. Anota tres controles durante la noche: presión, Glasgow, SAS y los parámetros del ventilador. A las 4 lo extuban y lo registra en Pulse. A las 7, en el computador, abre la evolución de RCE-KINE y vuelve a escribir los controles y la extubación. Si se le olvida marcar la extubación ahí, para el REM ese paciente nunca se extubó. Sus días de VM siguen contando, aunque Pulse lo tenga en vía aérea natural desde las 4.

**DESPUÉS.** Manuel ingresa al paciente de la cama 7 en RCE-KINE, como siempre. En el teléfono, la cama 7 de Pulse ya aparece ocupada, con la vía aérea y el soporte que dejó RCE-KINE y sin nombre ni RUT. Registra los tres controles y la extubación junto a la cama. Si no hay señal, Pulse los guarda y los manda cuando vuelve. A las 7 abre RCE-KINE en el computador. La hoja del día ya tiene las tres columnas llenas, la evolución sale prellenada y la extubación aparece como **propuesta**. La confirma con un clic y desde ahí cuenta para el REM y cierra el tramo de VM. Nada se escribió dos veces y nada contó dos veces.

## 3 · Objetivos y no-objetivos

- **O1 · Un ingreso, un paciente.** El episodio nace solo en RCE-KINE. Pulse no puede crear pacientes de la unidad por su cuenta.
- **O2 · Lo de Pulse llega una vez.** Cada control y cada evento de Pulse queda en RCE-KINE exactamente una vez, aunque el teléfono reintente diez veces o se corte la señal a la mitad.
- **O3 · Al paciente correcto.** Lo que llega se amarra por `PATIENT_ID`, nunca por número de cama. Un traslado de cama no lo separa del episodio.
- **O4 · Sin identidad en el teléfono.** Ni nombre ni RUT viajan a Pulse ni salen de RCE-KINE. Pulse ya no guarda identidades propias.
- **O5 · Un solo conteo.** Los eventos que cuentan para el REM (extubación, reintubación, TQT, decanulación, PVE) se cuentan una sola vez, en RCE-KINE, y solo cuando un kinesiólogo los confirma.
- **O6 · Lo que ya está.** Se reutiliza lo que cada lado hace bien. De Pulse, la cola sin señal, los reintentos y el identificador único por registro. De RCE-KINE, la planilla, el despachador con auditoría, el candado de escritura y el modelo de datos del PRD de cabecera.
- **NO1 ·** No reescribe RCE-KINE en React ni convierte a Pulse en el frente completo. Esa es la opción grande, la del PRD de PWA.
- **NO2 ·** Pulse no calcula cifras. Para los pacientes de la unidad se apagan su conteo de días de VM, su REM 28 y su fracaso de extubación (P05). Los días de VM que muestra son los que bajan de RCE-KINE.
- **NO3 ·** No hay sincronización de vuelta de la evolución: lo que se corrige en `#kf` no reescribe el control de Pulse.
- **NO4 ·** No se migran los datos que ya estén en la planilla propia de Pulse. Si hubo uso real, se decide aparte (P08).

## 4 · Cómo funciona hoy → cómo va a funcionar

```
HOY                                              DESPUÉS
RCE-KINE: ingresar paciente (RUT, fechas)         RCE-KINE: ingresar paciente (igual que hoy)
Pulse: crear el mismo paciente otra vez            Pulse: la cama aparece sola, sin nombre ni RUT
Pulse: registrar controles y eventos               Pulse: registrar controles y eventos (igual que hoy)
  → planilla de Pulse (JSON por fila)                → cola del teléfono → RCE-KINE, una vez
RCE-KINE: volver a escribir todo en #kf            RCE-KINE: hoja del día llena + #kf prellenado
RCE-KINE: marcar a mano la extubación              RCE-KINE: confirmar la extubación propuesta
Dos planillas, dos verdades                        Una planilla; la de Pulse deja de recibir
```

**Piezas que se reutilizan, sin inventar infraestructura:**

| Necesidad | Se toma de | Qué es |
|---|---|---|
| Dónde caen los controles | PRD de cabecera, §5 | Hojas `CONTROLES` y `HOJA_DIA`, por `PATIENT_ID`, sin nombre ni RUT, con corrección por anulación |
| Mostrar e imprimir la hoja | PRD de cabecera | `rkHojaHTML` y la hoja de dos carillas |
| Prellenar la evolución | PRD de cabecera, etapa 2 | `fillFormReplica` sin cascadas ni formulario «modificado» |
| Cola sin señal y reintentos | UPC-Pulse | Tabla `cola`, espera creciente de 2 s a 5 min, lotes de 50 |
| No duplicar | UPC-Pulse + RCE-KINE | Identificador único por registro generado en el teléfono; RCE-KINE ignora el que ya tiene |
| Escribir sin pisarse | RCE-KINE | `conLock` y el despachador con `_auditar` |
| Episodio y traslados | RCE-KINE | `PATIENT_ID` y `_reetiquetarEpisodioACama` |
| Turnos | Los dos | Día 09-21 y Noche 21-09: ya coinciden |

**Etapas:**

1. **Lectura:** Pulse muestra las camas y los episodios abiertos de RCE-KINE. Todavía no escribe nada en RCE-KINE. Así se prueba el vínculo sin riesgo.
2. **Controles:** los controles de Pulse llegan a `CONTROLES` y `HOJA_DIA`. Se enciende por `CONFIG` en 2 o 3 camas, igual que el piloto del PRD de cabecera. El papel sigue en paralelo.
3. **Eventos:** los eventos de vía aérea y de PVE llegan como propuestas que se confirman en RCE-KINE (R7).
4. **Corte:** la planilla propia de Pulse deja de recibir datos clínicos.

## 5 · Los datos

**Disparador:** el kinesiólogo guarda un control o un evento en Pulse. El envío lo hace la cola del teléfono cuando hay señal. En RCE-KINE nada se escribe solo fuera de ese envío.

**El vínculo.** El identificador de episodio de Pulse pasa a ser el `PATIENT_ID` de RCE-KINE. Hoy Pulse genera el suyo propio al crear el paciente. Después lo recibe de RCE-KINE. La cama queda como dato de ubicación, igual que en RCE-KINE.

**Qué baja de RCE-KINE a Pulse** (solo lectura): cama, `PATIENT_ID`, edad, sexo, talla, diagnóstico, vía aérea y soporte vigentes, la fecha de inicio del tramo de VM y los días de VM ya calculados (P05). También la ECF, el Barthel y el Charlson vigentes, o la marca de que faltan (P04), y las fechas de etiqueta de HME, HEPA y Trach Care con su próximo cambio (P09). Nunca `NOMBRE` ni `RUT`.

**Qué sube de Pulse a RCE-KINE:**

| De Pulse | A RCE-KINE | Nota |
|---|---|---|
| Control (signos, neuro, sedación, DVA, ventilación) | `CONTROLES` | Una fila por control, como una columna del papel |
| Kine respiratoria, terapia física, evaluaciones puntuales | `HOJA_DIA` y `EVALUACIONES` | MRC-ss, FSS-ICU y Pimáx son serie fechada con firma (hoja `EVALUACIONES`, en `main` desde la 7.03) |
| ECF y Barthel | `CAMAS_ESTADO.ECF` y `.BARTHEL`, por la acción `EPISODIO_ESCALA` | Dato único del episodio que se corrige encima, con hito «corrige X» en `TIMELINE` (P04, R11) |
| Eventos de vía aérea y PVE | `TIMELINE` como **propuesta** | Cuentan recién al confirmarse (R7) |
| HME, HEPA o Trach Care cambiado | `DISP_HME_FECHA`, `DISP_HEPA_FECHA`, `DISP_TC_FECHA` de la cama | El cambio pasa a ser la fecha de etiqueta y desde ahí corre el vencimiento de RCE-KINE (P09, R12) |

**El vocabulario no coincide y hay que traducirlo.** Es lo más delicado del documento:

| Concepto | UPC-Pulse | RCE-KINE |
|---|---|---|
| Vía aérea | `TET`, `TQT`, `NATURAL` | `TOT`, `TQT`, `Natural`, `Full Face`, `Oronasal` |
| Soporte | `VMI`, `VNI`, `CNAF`, `O2`, `AIRE` | `VM`, `VNI`, `Oxigenoterapia/OAF`, `Ambiente` |
| Dispositivo de O₂ | Naricera, mascarilla simple, reservorio, Venturi, máscara TQT | `VENT_MODO`: NRC, CNAF, MMV, MR… |
| Modo de VM | `ACVC`, `PCV`, `CPAP_PS` | Mismos modos; «CPAP/PS» con barra |
| Modo de VNI | `CPAP_PS` (hoy) → `S/T`, `AVAPS`, `CPAP` (P12) | `S/T`, `AVAPS`, `CPAP`, con IPAP/EPAP |

En RCE-KINE la vía aérea de la VNI es la interfaz (`Full Face` u `Oronasal`). Pulse pone la VNI sobre vía aérea `NATURAL` y no registra interfaz. Se resuelve con un valor nuevo de vía aérea en RCE-KINE (P03). **Medido el 8-nov-2026 sobre la foto de `develop`:** las cifras no leen la interfaz. El REM, los indicadores y los días de VM y de VNI cuentan por `VENT_SOPORTE='VNI'` (`svc_rem.gs`, `svc_evoluciones.gs`). La interfaz la leen el formulario del computador (unos 15 lugares en `index.html`: el catálogo de vía aérea y soporte, las cascadas y el deshacer de la vía aérea, el mapa de modos a vía aérea), el texto de la evolución (`dominio_texto.gs:156`, «máscara Full Face de VNI») y el ingreso de paciente (`svc_camas.gs:106`). Los modos de VNI tampoco coincidían: RCE-KINE ofrece `S/T`, `AVAPS` y `CPAP`, y Pulse solo `CPAP_PS`. Se resuelve en P12: Pulse adopta los de RCE-KINE.

**Interruptores y candados:**
- `CONFIG.PULSE_ACTIVO` nace en `FALSE`. Sin él, RCE-KINE no recibe nada y producción no cambia. Hay una lista de camas habilitadas para el piloto.
- Cada registro trae su identificador único. RCE-KINE guarda el que no tiene e ignora el repetido, y responde «ya lo tenía» para que el teléfono lo saque de la cola.
- Un registro con nombre, RUT o un campo que no está en la lista permitida se rechaza entero y el teléfono no lo reintenta. Pulse ya hace esto en su servidor (`PAYLOAD_CON_IDENTIDAD`) y se conserva.
- Un registro para un `PATIENT_ID` que ya no está abierto (alta, traslado deshecho) no se pierde: queda en una bandeja «sin destino», como la bandeja de gases sin emparejar.
- Las escrituras corren en `conLock` y pasan por `_auditar`.

**Inventario de consumidores.** Los del PRD de cabecera valen enteros: esquema, despachador, reseteo, traslado, alta, deshacer egreso, impresión, prellenado. Se suman estos:

| Pieza | Dónde | Qué pasa |
|---|---|---|
| Puerta de entrada | RCE-KINE no tiene `doPost`: el cliente llega por `google.script.run` | Hace falta una entrada nueva para un cliente que no es la página de Apps Script (P02) |
| Línea de tiempo | `TIMELINE` y `DATOS_JSON` (en `main` oficial desde la 7.03) | Las propuestas necesitan un estado «propuesto/confirmado» dentro de `DATOS_JSON` (P10) |
| Escalas del episodio | `episodioEscala` en `svc_evaluaciones.gs`, acción `EPISODIO_ESCALA` | Hoy recibe `idCama`. Para Pulse tiene que amarrar por `PATIENT_ID` (O3) y comparar el valor que vio Pulse (R11). El guardado de la evolución también escribe la ECF y el Barthel en la cama (`svc_evoluciones.gs`, `val(evo.PAC_ECF, cama.ECF)`): son dos escritores sobre el mismo dato |
| Barthel de egreso | `BARTHEL_EGRESO` en el alta (`svc_camas.gs`) | No cambia. El Barthel que manda Pulse es siempre el de ingreso (pre-UCI) |
| Vencimiento de filtros | `estadoDispositivos` (`svc_eventos.gs`), la hoja de filtros impresa, el panel «Cambios de esta noche», el chip del formulario y la campana | Ninguno cambia: todos leen la fecha de etiqueta, que es lo que escribe Pulse (R12) |
| Cifras de Pulse | `core/vm.ts`, `core/rem28.ts`, `core/pve.ts` de Pulse | Se apagan para los pacientes de la unidad (P05) |
| Conteo de extubaciones | Todos los consumidores leen `EXT_OCURRIO` | La confirmación tiene que terminar marcando `EXT_OCURRIO`. Si no, el REM no ve la extubación (R7) |
| Relojes de VM | `DIAS_VM_PREVIOS`, `diasVMReloj` | Pulse no los toca. Los cierra la confirmación en RCE-KINE |
| Lado Pulse | `src/datos/api.ts`, `sync.ts`, `nube.ts`; tablas `episodios` e `identidades` | Apunta a RCE-KINE, deja de crear episodios y deja de guardar identidades |
| Guardias | 73 guardias con navegador simulan `google.script.run` | La entrada nueva necesita su propio banco de pruebas. Las que hay no la ven |

## 6 · Reglas, promesas y pendientes — el acuerdo

**Reglas:**
- **R1 ·** Un paciente de la unidad se ingresa solo en RCE-KINE. En Pulse la opción «nuevo paciente» desaparece mientras `PULSE_ACTIVO` esté encendido.
- **R2 ·** Pulse amarra cada registro al `PATIENT_ID` que recibió. Si el paciente cambió de cama entre medio, el registro sigue al episodio, no a la cama.
- **R3 ·** El nombre y el RUT del paciente viven solo en RCE-KINE. La hoja `identidad` de Pulse y su tabla `identidades` dejan de usarse para pacientes de la unidad.
- **R4 ·** Un control de Pulse es inmutable, como hoy. Una corrección es un control nuevo que anula al anterior, y RCE-KINE lo refleja con su marca de anulada.
- **R5 ·** La vía aérea y el soporte de un paciente solo cambian por un evento registrado a mano, en los dos sistemas. La alerta detecta el olvido, pero nunca registra el evento sola.
- **R6 ·** Cuando la traducción de vocabulario no tiene equivalente seguro, el registro no se adivina. Se guarda con la marca «sin traducir» y no alimenta ninguna cifra hasta que alguien lo resuelva.
- **R7 ·** Un evento que cuenta para el REM llega como propuesta. Cuenta solo cuando un kinesiólogo lo confirma en RCE-KINE. Esa confirmación marca las mismas casillas que hoy marca el formulario. Así ningún consumidor cambia.
- **R8 ·** Pulse no calcula cifras para los pacientes de la unidad. Se apagan su conteo de días de VM, su REM 28 y su fracaso de extubación. Los días de VM que muestra son los que calculó RCE-KINE y bajan con la cama (P05).
- **R9 ·** Los cortes de turno se leen de la `CONFIG` de RCE-KINE. Si la unidad los cambia, Pulse los toma de ahí y no de su código.
- **R10 ·** Pulse queda solo con su cara de celular. Su cara de «estación» (la sábana del turno, la tendencia, la evolución para copiar y las identidades) se retira para los pacientes de la unidad, porque esa vista ya la da RCE-KINE. *Se deduce de la imagen del satélite. La asumió Manuel y falta confirmarla con Diego.*
- **R11 · ECF y Barthel desde Pulse.** Pulse muestra el valor vigente del episodio o la marca de que falta, y puede escribirlo o corregirlo. Entra por la misma puerta que usa la tarjeta de la cama (`EPISODIO_ESCALA`): se corrige encima y queda el hito «corrige X» con la firma. No es propuesta, porque estas escalas no cuentan para el REM. **Candado:** Pulse manda también el valor que tenía a la vista. Si el valor cambió mientras el registro esperaba en la cola, RCE-KINE no lo pisa y lo deja en la bandeja «sin destino» para que alguien elija. El Barthel va de 0 a 100 en múltiplos de 5 y la ECF de 1 a 9: son los rangos de RCE-KINE, y Pulse los valida antes de mandar. Es siempre el Barthel de ingreso. El de egreso se sigue pidiendo en el alta. El Charlson no existe en Pulse y no se agrega en este PRD.
- **R12 · Filtros cambiados desde Pulse.** Pulse tiene un botón de un toque por elemento: «HME cambiado», «HEPA cambiado» y «TC cambiado». Son los eventos que Pulse ya registra (`CAMBIO_HMEF` y `CAMBIO_FILTRO`). RCE-KINE marca ese filtro como cambiado y desde ese momento empieza el conteo de vencimiento. **Cómo se cuenta:** la fecha de etiqueta es el día del reloj en que se tocó el botón. Un HME cambiado a las 03:00 del 4 queda etiquetado el 4, como en el libro. El vencimiento sigue la regla vigente de RCE-KINE, por día de calendario y con aviso en `frec-1`, no por horas. Pulse no calcula el vencimiento: muestra el que baja de RCE-KINE. Un cambio con hora anterior a la etiqueta que ya tiene la cama no la retrocede y queda en la bandeja. *Interpretación de Claude, a confirmar:* «desde ese momento» se leyó como «desde ese día», para que la hoja de filtros, el panel de la noche y la campana sigan diciendo lo mismo.
- **R13 · Cómo se entra desde el teléfono, mientras no haya login real.** Se usa el PIN por funcionario que Pulse ya tiene, con cuatro refuerzos. **(a) La identidad vive en RCE-KINE:** el usuario es la `FIRMA` de `KINESIOLOGOS` y el PIN se guarda ahí, con sal y la misma huella que usa Pulse hoy (iteraciones y una pimienta en las propiedades del script, nunca en una hoja). La puerta de Pulse (P02) es la que lo valida, porque RCE-KINE es quien tiene que creerle. Un kinesiólogo inactivo no puede entrar. **(b) Sesión que vence con el turno:** el PIN correcto entrega una sesión, y toda lectura y toda subida la llevan. La firma de cada registro la pone el servidor a partir de la sesión. El teléfono no la declara. La sesión vence en el siguiente corte de turno de `CONFIG` (R9). **(c) Freno a los intentos:** después de unos intentos fallidos seguidos, ese usuario queda bloqueado un rato, y cada intento queda en `_auditar`. *Propuesta de Claude:* cinco intentos y quince minutos. **(d) Firma declarada:** lo registrado con PIN se rotula como firma declarada, igual que la firma del formulario de hoy, y no como una identidad verificada. Nadie define su primer PIN solo: coordinación lo restablece y entrega en persona un PIN temporal, que no da acceso a la lectura y obliga a definir uno propio al entrar. Si alguien olvida su PIN, se hace lo mismo. Es el patrón de las claves de coordinación. *Manuel, 9-nov: se cerraba así el hueco de que el primero en teclear una firma sin PIN la tomara.* El login institucional sigue siendo el de `PRD_PWA_Y_LOGIN_REAL.md` y reemplaza a este sin cambiar la puerta.

**Promesas:**
- Un registro de Pulse queda una sola vez en RCE-KINE, por más reintentos que haya.
- Ningún nombre ni RUT sale de RCE-KINE hacia el teléfono.
- Nada de lo que llega desde Pulse cuenta para el REM sin la confirmación de una persona.
- Con `PULSE_ACTIVO` en `FALSE`, RCE-KINE se comporta exactamente como hoy.
- Si RCE-KINE no responde, el teléfono guarda y espera. No descarta nada.

**Pendientes:**
- ✅ **P01 · La historia.** Confirmada por Manuel (8-nov-2026).
- ✅ **P02 · Por dónde entra Pulse.** *Asumida por Manuel (8-nov-2026), a confirmar con Diego.* El camino es el (a): RCE-KINE abre una puerta propia para Pulse, con su token y su protocolo de lotes, y Pulse le manda sus controles y eventos directo. Así lo dijo Manuel: «Pulse como un satélite y el RCE como la estación central que recibe y ve todos los datos». Se descartan la (b), porque deja un segundo servidor con su propia copia de los datos clínicos, y la (c), porque Pulse no se sirve desde Apps Script. Consecuencia: el servidor propio de Pulse deja de guardar datos clínicos de la unidad (etapa 4). La puerta nueva es la misma pieza que pide `PRD_PWA_Y_LOGIN_REAL.md`. Por eso tiene que nacer con número de petición, para que un reintento no escriba dos veces (O2).
- ✅ **P03 · La interfaz de la VNI.** *Asumida por Manuel (8-nov-2026), a confirmar con Diego.* RCE-KINE acepta la VNI sin interfaz. Para eso suma un valor nuevo de vía aérea, «VNI sin interfaz», que **solo admite el soporte VNI**. Así se conserva la garantía del catálogo: la VM sigue existiendo solo sobre TOT o TQT. Las cifras no cambian, porque cuentan por soporte. Lo que hay que ajustar es el formulario, el texto y el ingreso, que hoy reconocen la VNI por Full Face u Oronasal: con el valor nuevo los tres tienen que tratarlo igual que una interfaz. El texto narra la VNI sin nombrar una máscara que nadie registró. *Propuesta de Claude, a confirmar:* el valor nuevo llega solo desde Pulse. El formulario del computador sigue pidiendo Full Face u Oronasal, y desde ahí se puede completar la interfaz de un control que vino sin ella. Con esto P03 deja de frenar la etapa 2.
- ✅ **P04 · Escalas pre-UCI desde Pulse.** *Asumida por Manuel (8-nov-2026), a confirmar con Diego.* Pulse las escribe por la puerta que ya tiene RCE-KINE, como corrección del dato único y con el candado del valor que vio (R11). En Pulse dejan de ser una evaluación que se repite para los pacientes de la unidad. Se respeta la regla de Diego del 11-sep: la ECF y el Barthel describen el estado previo a la UCI y no llevan historial. Se descartaron dos caminos. Que Pulse solo las mostrara contradecía el objetivo de que la información llegue por Pulse. Que dejara de ofrecerlas repetía el problema que contó Diego el 10-sep: la escala que no se ve no se aplica.
- ✅ **P05 · Las cifras de Pulse.** *Asumida por Manuel (8-nov-2026), a confirmar con Diego.* Se apagan para los pacientes de la unidad (R8). Así no conviven dos números para el mismo paciente.
- ✅ **P06 · El texto de la evolución.** *Asumida por Manuel (8-nov-2026), a confirmar con Diego.* La evolución la entrega RCE-KINE, «la estación… nos entrega nuestras evoluciones». El motor es el de RCE-KINE (`genTexto` y `generarTextoEvolucion`), y `componerNotaAlma` de Pulse deja de usarse para los pacientes de la unidad. Queda abierto qué parte de la nota de Pulse vale la pena llevar al motor de RCE-KINE, por ejemplo sus casillas por parámetro para ALMA. Eso se resuelve en otro PRD.
- **P07 · Dónde vive el código de Pulse.** Hoy está en el repo público de Diego (`RCE-ALMA`). Las 12 correcciones están en una rama local que no se subió, y el historial de ese repo tiene RUT de funcionarios. *Le toca a Diego.*
- **P08 · Datos que ya estén en la planilla de Pulse.** ¿Hubo uso real con pacientes? Si lo hubo, ¿se migran, se archivan o se borran? *Le toca a Diego.* Si hay datos reales, rige la Ley 19.628 también para su planilla.
- ✅ **P09 · Filtros y HME.** *Asumida por Manuel (8-nov-2026), a confirmar con Diego.* El evento de Pulse pasa a ser la fecha de etiqueta de RCE-KINE, con un botón de un toque por elemento («HME cambiado», «HEPA cambiado», «TC cambiado»). RCE-KINE marca ese filtro como cambiado y desde ahí corre el vencimiento (R12). No choca con la regla de dispositivos, porque esa regla se calcula desde la fecha de etiqueta, y ese dato es justamente el que manda Pulse.
- ✅ **P10 · Orden con la v7.00.** *Cerrada por medición (8-nov-2026).* La pregunta ya no existe. La v7.00 entró a `develop` y a `main` del repo oficial en la 7.03 (`84b11f3`), y `main` va en la 7.09 (`bd88b6c`, 4-nov). `TIMELINE.DATOS_JSON`, la hoja `EVALUACIONES` y la acción `EPISODIO_ESCALA` ya están ahí. Esta fusión se programa sobre `develop` oficial. ⚠️ La foto `rce-kine/` de este repo quedó en la 7.06 (`e15b5fb`) y hay que refrescarla antes de programar.
- ✅ **P11 · Quién entra desde el teléfono.** *Asumida por Manuel (8-nov-2026), a confirmar con Diego e informática.* Sirve el PIN de Pulse como respuesta provisoria, pero reforzado (R13). Se midió antes de decidir: hoy el PIN solo protege la pantalla. El `login` de Pulse responde «ok» sin entregar sesión, las lecturas y subidas solo llevan la clave de la app, que es la misma para todos, y no hay límite de intentos fallidos. Sin los refuerzos, cualquiera con la dirección escribe a nombre de otro. Sirve también de respuesta provisoria a P09 y P20 del PRD de cabecera. 🔴 **Condición antes del piloto con teléfonos personales:** confirmar que la planilla de RCE-KINE ya no está compartida como «cualquiera con el enlace» (cable abierto desde el 2-sep), porque desde ahora ahí viven también las huellas de los PIN.
- ✅ **P12 · Los modos de la VNI.** *Asumida por Manuel (8-nov-2026), a confirmar con Diego.* Cuando el soporte es VNI, Pulse usa los modos de RCE-KINE: `S/T`, `AVAPS` y `CPAP`. Registra las mismas casillas que el formulario del computador: IPAP y EPAP en `S/T` y `AVAPS`, la IPAP máxima en `AVAPS` y una sola presión en `CPAP`. El `CPAP_PS` de Pulse queda solo para la VM. Así nada se traduce ni se adivina: el satélite habla el idioma de la estación. La presión de soporte de la VNI no se escribe, porque RCE-KINE la calcula como IPAP − EPAP (`index.html:10320`), igual que hoy. Se descartaron dos caminos. Traducir `CPAP_PS` a `S/T` habría rotulado frecuencia de respaldo a pacientes que quizá no la tienen. Sumar `CPAP/PS` a la VNI en RCE-KINE habría dejado la misma VNI escrita de dos formas en la base. El costo es cambiar la pantalla de VNI de Pulse.
