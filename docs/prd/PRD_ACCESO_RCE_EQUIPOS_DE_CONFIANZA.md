# PRD — Acceso al RCE: computadores de confianza y clave personal

**Estado:** borrador v2 (17-nov-2026), corregido con la revisión de tres revisores sin memoria (método Elephant-Goldfish; informes en `revision-egm/`). Propuesta A, aceptada por Diego. · **Decide el producto:** Diego Melo Villagrán · **Programa:** Manuel Fuentes Blanco (repo RCE-KINE, por su flujo de ramas) · **Redactó:** Claude.

**Alcance:** que el RCE entregue datos solo a computadores aprobados por coordinación o a quien entre con su clave personal, sin cambiar cómo se trabaja hoy en los computadores de la unidad. Incluye cerrar las funciones del RCE que hoy se pueden llamar saltándose cualquier control.

**Queda FUERA:**
- El login institucional de Google (`PRD_PWA_Y_LOGIN_REAL.md`). Este PRD es un paso intermedio y lo deja funcionando como vía válida (ver §5.4).
- Las identidades de los pacientes (nombre, RUT): siguen como hoy, por decisión de Diego del 17-nov.
- Permisos distintos por persona: quien entra ve y registra lo mismo que hoy.

## Palabras que usa este documento

- **Firma:** el código corto de cada kinesiólogo en la hoja `KINESIOLOGOS` (por ejemplo, MCC). Sirve de usuario para entrar y es la que hoy cada uno escribe en la evolución.
- **Firma declarada:** la que se escribe en el formulario. Hoy nadie la verifica.
- **Coordinación:** las tres firmas con clave de coordinación (MCC, DMV y MFB), que entran a la pestaña 🔐 del RCE con esa clave.
- **Kaptus:** la app de celular de la unidad. Entra al RCE por una puerta propia, con firma y PIN (programada por Manuel en `svc_pulse.gs`).
- **Huella:** una versión cifrada de una llave o un PIN. Sirve para comprobar que alguien tiene la llave, pero si alguien la copia no le sirve para entrar.
- **Marca:** la llave que queda guardada **en un navegador de un computador** (no en el computador entero: otro navegador, otro usuario de Windows o una ventana de incógnito no la tienen).

---

## 1 · Resumen

**Hoy:** cualquiera con el enlace del RCE entra a todo, con nombres y RUT, desde cualquier equipo y sin clave. Además, 224 funciones del RCE se pueden llamar directamente desde el navegador sin pasar por ningún control. Entre ellas: leer todas las camas, buscar por RUT y borrar la base de datos.

**Después:** primero se cierran esas funciones sueltas. Luego, los computadores de la unidad aprobados por coordinación entran directo, como hoy. Cualquier otro equipo pide la firma y el PIN personal. Sin ninguna de las dos cosas, la página abre pero no muestra ningún dato.

## 2 · La historia

**ANTES.** Un viernes en la noche, alguien que alguna vez recibió el enlace del RCE por WhatsApp lo abre desde su casa. Ve las 18 camas con nombres, RUT y diagnósticos. Nadie se entera: el RCE no sabe desde qué equipo se entró ni quién era.

**DESPUÉS.** Magdalena abre el RCE en el computador de la estación, como siempre, y entra directo: ese navegador está aprobado. Diego, desde su casa, abre el enlace y el RCE le pide su firma y su PIN. Entra, y la sesión le dura hasta el cambio de turno, con una hora de gracia si estaba evolucionando. Quien recibió el enlace por WhatsApp ve la pantalla de clave y nada más. Si un computador de la unidad se reinstala, cualquier colega entra con su clave personal y coordinación lo vuelve a aprobar.

## 3 · Objetivos y no-objetivos

- **O1 · Sin permiso, sin datos.** Ningún dato del RCE sale sin un permiso válido. Para eso, **todo** pedido tiene que pasar por `autorizar()`. Hoy eso no es así (§4, paso 0b).
- **O2 · La unidad no nota el cambio.** En un navegador aprobado de la unidad, el RCE abre igual que hoy, sin pedir nada.
- **O3 · Una sola clave por persona.** El PIN es el mismo que el de Kaptus. Lo que se comparte es solo la comprobación del PIN: las sesiones del RCE y de Kaptus son distintas y no se sirven una a la otra (§5.2).
- **O4 · Se enciende sin riesgo y se mide antes.** Primero un modo aviso que deja entrar a todos, anota desde dónde y mide si las marcas sobreviven en los computadores del hospital. Un interruptor de CONFIG vuelve todo a como está hoy.
- **O5 · Se puede dar de baja y se sabe quién entró.** Coordinación ve la lista de equipos con su último uso y quita cualquiera. Cada escritura queda en la auditoría con su origen: el nombre del equipo o la firma de la sesión.
- **NO1 ·** No distingue a los colegas que usan un mismo computador aprobado: quien se sienta en él entra, igual que hoy, con su firma declarada.
- **NO2 ·** No toca el formulario, el guardado, las cifras ni la entrega.
- **NO3 ·** No reemplaza cerrar la planilla en Drive: eso se hace antes, a mano (paso 0a).

## 4 · Cómo funciona hoy → cómo va a funcionar

```
HOY                                              DESPUÉS (candado encendido)
Abrir el enlace → la página carga                  Igual
Pedidos por api() → autorizar() deja pasar todo    Pedidos por api() → autorizar() exige permiso (§6)
224 funciones se llaman directo, sin api()          Solo doGet, doPost y api se pueden llamar desde fuera
```

**Puesta en marcha, en orden:**

0. **Cerrar los dos agujeros que existen hoy**, antes que nada:
   - **0a · La planilla.** La planilla de producción del RCE, la que tiene las hojas de camas y evoluciones, tiene que quedar compartida como «solo personas con acceso». La cierra su dueño en Drive, sin tocar código. Antes de cerrarla, revisar quién la abre hoy directamente: esas personas perderían el acceso.
   - **0b · Las funciones sueltas.** En Apps Script, el navegador puede llamar a **cualquier** función del proyecto cuyo nombre no termine en «_», no solo a `api()`. Hoy hay 224 así, entre ellas `obtenerTodasLasCamas`, `episodiosPorRut`, `pulseLectura` (sin su token), `resetearBaseDeDatosCONFIRMAR` y `testFlujoCamas`. El cierre tiene tres partes:
     - todo lo que no sea `doGet`, `doPost` o `api` pasa a terminar en «_»;
     - las rutinas que se corren desde el editor llevan una guardia que solo deja correrlas al dueño del proyecto;
     - una guardia de la batería falla si aparece una función pública fuera de esa lista.

     Este paso vale por sí solo, aunque el candado nunca se encienda.
1. **Modo aviso** (`CONFIG.ACCESO_CANDADO = AVISO`). Todos entran como hoy. Cada navegador crea su llave en la primera carga y la manda siempre, y el RCE la anota en `EQUIPOS_CONFIANZA` como «pendiente», con la fecha, la firma declarada y el navegador. La pestaña 🔐 muestra el código corto de ese equipo, para reconocerlo.
2. **Aprobar los computadores de la unidad.** Coordinación aprueba las filas pendientes que son de la unidad y les pone nombre («Estación 1»). Puede hacerlo desde cualquier equipo, porque el código corto identifica cuál es cuál. Mientras tanto se mide cuántos equipos conservan su llave de un día para otro.
3. **Censo de PIN.** Todas las firmas activas tienen PIN definido (lo entrega coordinación en persona, como en Kaptus).
4. **Candado** (`ACCESO_CANDADO = ACTIVO`) cuando se cumplan las dos condiciones: todos los computadores de la unidad, por nombre, están aprobados y con uso en los últimos 7 días, y el censo de PIN está completo. Los accesos desde casa siguen apareciendo como pendientes y no frenan el encendido.
5. **Vuelta atrás:** `ACCESO_CANDADO` vacío deja todo como hoy, sin pegar código.

## 5 · Los datos

### 5.1 La marca del computador

Cada navegador crea una llave al azar en su primera carga y la guarda localmente. Al servidor viaja siempre la llave, pero en la planilla solo se guarda su **huella**: SHA-256 con un secreto en las propiedades del script, nunca en CONFIG, con el mismo esquema que las claves de coordinación y los PIN. La hoja nueva es `EQUIPOS_CONFIANZA`:

| Columna | Qué es |
|---|---|
| `ID`, `CODIGO` | Identificador y código corto visible en 🔐 |
| `NOMBRE` | Nombre legible que pone coordinación al aprobar («Estación 1») |
| `HUELLA` | Huella de la llave (nunca la llave) |
| `ESTADO` | `PENDIENTE` · `APROBADO` · `BAJA` |
| `VISTO_EN`, `ULTIMO_USO`, `NAVEGADOR`, `FIRMA_DECLARADA` | Para reconocerlo y saber si se sigue usando |
| `APROBADO_POR`, `APROBADO_EN` | Firma de coordinación y fecha |

La búsqueda «huella → aprobado» se guarda en caché 5 minutos, igual que `firmaDeEmail`. Una baja borra ese caché, así que hace efecto de inmediato. `ULTIMO_USO` se escribe como máximo una vez al día, con una bandera en caché y fuera del candado de escritura del guardado.

### 5.2 La clave personal

- Se reutiliza **solo la comprobación del PIN** de Kaptus: la huella del PIN, el PIN temporal entregado por coordinación y el bloqueo.
- El RCE abre **su propia sesión**, guardada aparte de las de Kaptus, con su propio tope. Un token de Kaptus no sirve en el RCE ni al revés, así que entrar al RCE desde la casa no expulsa la sesión del teléfono.
- Acciones públicas nuevas:
  - `ACCESO_LOGIN`;
  - `ACCESO_DEFINIR_PIN`, para el primer ingreso con PIN temporal, como `definirPin` de Kaptus;
  - `ACCESO_ESTADO`.

  Exigen las mismas precondiciones que la puerta de Kaptus: que la pimienta del PIN exista en las propiedades del script.
- **Contra los intentos al azar.** El PIN para entrar al RCE desde fuera tiene que tener al menos 6 dígitos. Hay además un límite **global** de intentos de `ACCESO_LOGIN` por ventana de tiempo, con espera creciente, y coordinación recibe un aviso ante ráfagas de fallos.
- **Contadores de fallos separados** de los de Kaptus, para que nadie pueda dejar fuera al equipo en las dos apps a la vez.
- **Duración:** la sesión vence en el siguiente corte de turno de CONFIG. Hoy los cortes son a las 09:00 y a las 21:00, con **una hora de gracia**. Ejemplo: quien entra a las 20:55 queda con sesión hasta las 22:00; quien entra a las 23:50, hasta las 10:00 del día siguiente.

### 5.3 Las credenciales viajan con su tipo

El puente `api(accion, datos, token)` sigue llevando un solo campo, pero con prefijo: `eq:` para la marca del equipo, `ses:` para la sesión personal, y sin prefijo para el token de Google. `autorizar()` reparte según el prefijo, y cada rama usa una función que ya existe.

### 5.4 Cómo se combinan los interruptores

| `ACCESO_CANDADO` | `AUTH_DEV_MODE=TRUE` (hoy) | `AUTH_DEV_MODE=FALSE` (login de Google) |
|---|---|---|
| vacío | Como hoy: entra cualquiera | Como está programado: solo Google |
| `AVISO` | Entra cualquiera y se anotan los equipos | Google, y se anotan los equipos |
| `ACTIVO` | Solo equipo aprobado o sesión personal | Equipo aprobado, sesión personal **o** Google |

### 5.5 Inventario de consumidores (sección técnica, para Manuel)

| Pieza | Dónde | Qué cambia |
|---|---|---|
| Funciones públicas | Todos los `.gs` | Sufijo «_» o guardia de editor; guardia estática con lista blanca (paso 0b) |
| Punto de permiso | `autorizar()`, `infra_auth.gs` | Reparte por tipo de credencial (§5.3) según la tabla §5.4 |
| Puente del cliente | `api()` y `gs()` en `index.html` (~5295) | Manda la credencial con prefijo. Reconoce `NO_AUTORIZADO` **por su código**, no por el texto, y abre la clave sin cerrar el formulario (el borrador local se conserva) |
| Arranque | `GET_BOOT`/`WHOAMI`, `mostrarLogin()` | Sin permiso muestra «Ingresa tu clave», no el aviso de reconexión |
| Acciones públicas | `api.gs` | `ACCESO_LOGIN`, `ACCESO_DEFINIR_PIN`, `ACCESO_ESTADO`, sin datos clínicos |
| Coordinación | 🔐, `svc_coordinacion.gs` | En un equipo sin aprobar, se entra primero con la clave personal y desde ahí a 🔐. Lista de equipos con aprobar y dar de baja |
| Auditoría | `_auditar` | El contexto lleva el origen: `equipo:<NOMBRE>` o `clave:<FIRMA>` |
| Kaptus | `svc_pulse.gs` | Comparte solo la comprobación del PIN; sus sesiones y contadores no cambian |
| Guardias | `build/checks` | Nuevas: funciones públicas, sesiones separadas, candado vacío/aviso/activo, coordinación en un equipo sin aprobar, error reconocido por código |

## 6 · El acuerdo (pseudo-código)

```
CUANDO llega un pedido por api() (salvo las acciones públicas):
  SI ACCESO_CANDADO está vacío → como hoy (AUTH_DEV_MODE decide).
  SEGÚN el prefijo de la credencial:
    eq:  → SI su huella está APROBADA → pasa; firma = la declarada; origen = equipo:<NOMBRE>
           SI es nueva y el modo es AVISO → se anota PENDIENTE
    ses: → SI la sesión del RCE está viva (con su hora de gracia) → pasa; firma = la de la sesión;
           SI el formulario declara otra firma → «tu firma es X» (no se registra a nombre de otro desde fuera)
    sin prefijo → token de Google, como está programado hoy
  SI nada valió:
    AVISO  → pasa como hoy (y la llave quedó anotada)
    ACTIVO → NO_AUTORIZADO, sin ningún dato

CUANDO alguien entra con firma y PIN:
  SI el límite global de intentos está superado → «intenta en unos minutos»
  SI el PIN es temporal → pide definir uno nuevo de 6 dígitos o más
  SI está bien → abre una sesión del RCE (no de Kaptus)

CUANDO coordinación aprueba un equipo pendiente → ESTADO = APROBADO, con nombre
CUANDO coordinación da de baja un equipo → ESTADO = BAJA y se borra su caché
```

**Promesas:**
- Con `ACCESO_CANDADO` vacío, el RCE se comporta como hoy (salvo el paso 0b, que solo cierra lo que nunca debió estar abierto).
- La llave del computador y el PIN nunca se guardan en la planilla: solo sus huellas.
- Ninguna respuesta sin permiso lleva un dato clínico, y ninguna función del RCE se puede llamar saltándose `api()`.
- Una sesión de Kaptus no abre el RCE ni la del RCE abre Kaptus.

## 7 · Alternativas consideradas

| Opción | Por qué no |
|---|---|
| **A · Equipos aprobados + clave personal** | **La propuesta de este PRD.** |
| B · Una clave de la unidad para todos | Se comparte de boca en boca y no se sabe quién entró; cambiarla obliga a avisar a todos. |
| C · Login institucional de Google | El más seguro, pero depende de informática (correo institucional). Sigue siendo una vía válida en §5.4. |
| Solo PIN, sin aprobar equipos | Obliga a escribir el PIN en cada turno en la unidad: rompe O2. |
| Llave firmada por el servidor (sin hoja) | Ahorra la hoja, pero no permite ver la lista ni dar de baja un equipo puntual. |
| Implementación restringida a cuentas de Google | Exige correo para todos y deja fuera a Kaptus, que entra sin cuenta de Google. |
| Restringir por red del hospital | Apps Script no ve la red del computador que pide: no se puede. |

## 8 · Riesgos y límites

| Riesgo | Mitigación | Lo que queda |
|---|---|---|
| Funciones llamadas directo, saltándose `api()` | Paso 0b, con su guardia | Ninguno, si la guardia corre en cada entrega |
| PIN adivinado probando desde fuera | 6 dígitos, límite global, espera creciente, aviso a coordinación | Bajo |
| Alguien bloquea a propósito a todo el equipo | Límite global, contadores separados de Kaptus, las sesiones abiertas no se cortan | Una espera de minutos |
| Los computadores del hospital pierden la marca (perfiles que se borran al cerrar, usuarios compartidos) | Se mide en el modo aviso antes del candado; cualquiera entra con su clave y coordinación vuelve a aprobar, incluso desde otro equipo | Si la medición sale mal, no se enciende el candado |
| La sesión vence mientras se guarda una evolución | Hora de gracia; el error se reconoce por código y el borrador local se conserva | Volver a poner el PIN |
| Más lecturas por pedido | Caché de 5 minutos para las huellas y el último uso; se mide con `medirArranque` antes y después | Unos milisegundos, a medir |
| La página vacía se sigue pudiendo abrir | Es necesario para Kaptus; lo que se cierra son los datos | Ninguno clínico |

## 9 · Pendientes

- **P1 · Quién aprueba equipos:** ¿cualquiera de las tres firmas de coordinación? *Propuesta: sí.*
- **P2 · Hora de gracia:** ¿una hora después del corte está bien? *Propuesta: sí.*
- **P3 · Paso 0a:** confirmar quién es el dueño de la planilla en Drive y quién la abre hoy directamente.
- **P4 · Acciones con firma ajena:** listar qué acciones llevan la firma de otra persona (ingresos, entregas, correcciones hechas desde casa) y cómo se resuelven con la regla «tu firma es X».
- **P5 · Paso 0b antes que todo:** ¿Manuel lo programa como entrega propia, ya, sin esperar el resto?
