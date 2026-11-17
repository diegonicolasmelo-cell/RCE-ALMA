# PRD — Panel de controles de la unidad, al lado de ALMA

> **Anexo de `PRD_CONTROL_DE_CABECERA.md`** (rama `feature/prd-cabecera-respuestas-diego`). Reutiliza su hoja `CONTROLES`, su vista para ALMA (R24-R26) y su ventana angosta (R28). Sin el PRD madre este anexo no se sostiene: se programa junto con él o después.

**Estado:** borrador, pedido y bosquejado por Manuel (8-nov-2026). Las decisiones D1, D2 y D4 de §6 las tomó Manuel de forma **provisoria** (D3 es firme) para no detener el diseño; Diego puede cambiarlas · **Dueño:** Manuel Fuentes Blanco · **Decide el producto:** Diego Melo Villagrán · **Creado:** 2026-11-08

**Maqueta (pacientes ficticios, tema claro):** `https://claude.ai/artifact/SzHB3got4Rx9GSDS2Mp5eV` (versión 2: mosaico según el boceto en papel de Manuel). Es privada: hay que compartirla para que Diego la abra.

**Alcance:** una pestaña del RCE, para el computador, que muestra los controles de todas las camas a la vez (vista general en mosaico) y la carilla 1 de la hoja de cada cama (hoja por cama), pensada para dejarla en media pantalla al lado de ALMA y traspasar los controles.

**FUERA:** registrar controles (eso es el teléfono: PRD madre, o UPC-Pulse según `PRD_FUSION_RCE_KINE_UPC_PULSE.md`); llenar ALMA de forma automática; incrustar ALMA; alertas clínicas nuevas; las 396 columnas de `EVOLUCIONES`; el REM y los indicadores.

---

## 1 · Resumen

**Hoy:** cada control queda en la hoja de papel de la cama. Para pasarlo a ALMA, el colega va a la cama, lee el papel y teclea. Nadie más ve los controles desde otro lugar.

**Después:** los controles guardados se ven en una pestaña del RCE, abierta en media pantalla al lado de ALMA. Toda la unidad cabe en un mosaico; un clic lleva al paciente y a sus valores en el orden de ALMA. El papel deja de ser la fuente.

## 2 · La historia

> Escrita a partir del pedido de Manuel (8-nov-2026). Los detalles de la escena no se midieron.

**ANTES.** Son las 12:40 y Manuel tiene que dejar en ALMA los controles de la mañana de tres pacientes. ALMA está abierto en el Chrome del puesto. Los valores están en tres hojas de papel, cada una al lado de su cama. Va a la cama 7, vuelve, teclea; se da cuenta de que no sabe si el control de las 10:20 ya lo pasó la colega que lo tomó. Lo pregunta en voz alta. Mientras, otro colega quiere saber cómo va la FiO₂ de la cama 12 y tiene que ir a mirar el papel.

**DESPUÉS.** Manuel deja ALMA a la izquierda y el panel del RCE a la derecha (⊞ Win + ← y ⊞ Win + →). En el mosaico ve las 18 camas: la 7 dice «2 ALMA» en ámbar. La toca, aparece la cama 7 junto a la 5 y el control de las 10:20 ya está elegido, con sus valores en el orden del formulario de ALMA. Los teclea, marca «pasado a ALMA», y la app salta al control de las 12:15. El otro colega, desde otro computador, mira el mismo mosaico y ve la FiO₂ de la cama 12 sin moverse.

## 3 · Objetivos y no-objetivos

- **OP1 · La unidad de un vistazo** (la UCI tiene 18 camas, Manuel 8-nov-2026; el número sale de `CAMAS_ESTADO`, no se escribe fijo). Un recuadro por cama, en el orden de la unidad, con soporte, valores clave, hora del último control y lo pendiente de pasar a ALMA. Las camas libres se ven como libres.
- **OP2 · Cabe al lado de ALMA.** Usable a la mitad de una pantalla de 1366 px (unos 680 px), sin desborde horizontal de la página.
- **OP3 · Ir a una cama en un toque.** Selector de camas siempre visible arriba, en las dos vistas.
- **OP4 · Una cama por página, como la hoja.** La vista individual es la carilla 1 del papel (R6), con «Anterior» y «Siguiente» (y flechas del teclado) en el orden de las camas ocupadas.
- **OP5 · Nadie teclea dos veces el mismo control.** Cada control lleva su marca «pasado a ALMA», con firma y hora, visible para todo el equipo (decisión provisoria D1).
- **OP6 · Solo lectura de lo clínico.** El panel no cambia ningún valor de un control. Lo único que escribe es la marca de OP5.

- **NOP1 ·** No registra ni corrige controles: un valor equivocado se corrige donde se registró (PRD madre, R-anulación de `CONTROLES`).
- **NOP2 ·** No llena ALMA, no guarda su contraseña y no lo incrusta (NO4 y R28 del PRD madre; ALMA es TrakCare y no se deja incrustar).
- **NOP3 ·** No crea alertas clínicas nuevas. Los dos resaltados de la maqueta (SpO₂ bajo 90, último control con más de 4 horas) son lectura, no campana ni bloqueo; si Diego no los quiere, se quitan (P-P3).
- **NOP4 ·** No cambia la hoja impresa, la Hoja UCI ni la evolución.
- **NOP5 ·** No muestra el RUT ni el nombre completo, nunca: solo iniciales y número de cama (D3). Vale también para UPC-Pulse.
- **NOP6 ·** No se actualiza solo en esta versión (D2).

## 4 · Cómo funciona hoy → cómo va a funcionar

```
HOY                                        DESPUÉS
Control anotado en el papel de la cama     Control guardado desde el teléfono (CONTROLES)
Para verlo: ir a la cama                   Pestaña «Controles» → mosaico de la unidad
Para pasarlo a ALMA: leer el papel         Clic en la cama → su hoja (carilla 1), una por página  
  y teclear en el orden de ALMA              → control elegido, valores en el orden de ALMA (R26)
¿Ya lo pasó alguien? Preguntar             Marca «pasado a ALMA» con firma y hora, visible a todos
```

**Las dos vistas (maqueta):**

| Vista | Qué muestra | Para qué |
|---|---|---|
| General (mosaico) | Un recuadro por cama 1..N: número, soporte (VMI/VNI/O2), iniciales del paciente, vía aérea, modo, día de VM, el **resumen** (R4), hora del último control, «n de 3» controles del turno y «k ALMA» pendientes o «Al día». Libres, punteadas | Ver la unidad y elegir cama |
| Hoja por cama | La **carilla 1 de la hoja de kinesiología** (Cuidados respiratorios, `RK_PG1`), una cama por página (R6) | Ver la hoja del paciente y traspasar a ALMA |

**Al abrir la vista por paciente**, cada tarjeta trae elegido el primer control pendiente; si no hay, el último. Marcar uno pasa al siguiente pendiente.

**Piezas que se reutilizan:** la vista para ALMA de R24-R26 (orden y campos), la ventana angosta de R28, el sistema de pestañas con portada `.tbanner` (`index.html:2371` y siguientes), el despachador `api()` (`api.gs`), `conLock` y `_auditar` para la única escritura, y el interruptor en `CONFIG` como `PLANTILLAS_ACTIVAS` (`esquema.gs:888`).

## 5 · Los datos

**Lee:** `CONTROLES` del PRD madre (filas no anuladas de la hoja del día, por `PATIENT_ID`, con su `ID_CAMA`), el estado de las camas que ya entrega el arranque (`GET_BOOT` → `obtenerBoot`, `api.gs:52` y `:265`: quién está en cada cama, soporte, vía aérea, días de VM) y, del paciente, solo sus iniciales calculadas en el servidor (D3).

**Escribe (solo con D1):** la marca de traspaso. Propuesta: dos columnas al final de `CONTROLES`, `ALMA_FIRMA` y `ALMA_TS`; vacías = pendiente. Como `CONTROLES` todavía no existe, se agregan al crearla y no exigen un `crearORepararEstructura()` aparte.

**Disparador:** abrir la pestaña o tocar «Actualizar» (lectura); tocar «Marcar pasado a ALMA» o «Deshacer» (escritura).

**Interruptores:** `CONFIG.PANEL_CONTROLES_ACTIVO`, nace en `FALSE`; sin él la pestaña no existe y producción no cambia. Depende además de `CONTROL_CABECERA_ACTIVO` del PRD madre: sin controles no hay nada que mostrar.

**Candados:**
- La marca se escribe en `conLock`, pasa por `_auditar` y **solo si la casilla está vacía** (o la vacía «Deshacer» de la misma firma): si dos colegas marcan a la vez, el segundo recibe «ya lo marcó MCC a las 12:41» y no pisa.
- La marca no toca ningún valor clínico de la fila.
- Un control anulado no se muestra ni se puede marcar.

**Inventario de consumidores** (medido con `git grep` sobre `develop` = `7abad22`, 8-nov-2026; confirmar con el RAG antes de programar):

| Pieza | Dónde | Qué pasa |
|---|---|---|
| Despachador | `api.gs` (`GET_BOOT` en :52) | Dos acciones nuevas: una lectura de los controles del día de todas las camas y una escritura de la marca. La escritura pasa por `_auditar` |
| Arranque | `obtenerBoot`, `api.gs:265` | No cambia. El panel pide sus controles aparte, al abrir la pestaña, para no engordar el arranque de todos |
| Pestañas | `index.html:2371-2555` (`.tbanner` `bnG`, `bnP`, `bnD`, `bnE`, `bnA`) | Pestaña nueva con su portada, visible solo con el interruptor |
| `CONTROLES` | PRD madre §5 | Suma `ALMA_FIRMA` y `ALMA_TS` al final. Traslado, alta, desegreso y reseteo heredan las reglas del PRD madre |
| Vista para ALMA | PRD madre R24-R26 | Se usa la misma tabla de orden y correspondencia (R25). Un campo sin correspondencia se muestra «sin dato», no se adivina |
| Firma | PRD madre R7 | La marca usa la firma elegida en ese navegador (declarada, no verificada mientras no haya login) |
| Entrega al editor | `build/que_pegar.js`, cohete | Un servicio nuevo se fusiona en `servicios.gs`; revisar nombres con `grep` |

## 6 · Reglas y promesas — el acuerdo

- **D1 · La marca «pasado a ALMA» se guarda** (provisoria, Manuel 8-nov-2026). Por control, con firma y hora, visible para todo el equipo. ⚠️ **Contradice R28 del PRD madre** («las marcas de avance no se guardan»). Si Diego la confirma, R28 se corrige para decir que las marcas de *avance campo por campo* no se guardan, pero la marca de *control traspasado* sí. Promesa: la marca dice que alguien declaró haberlo tecleado, no que ALMA lo recibió (igual que «Transcrito», R38).
- **D2 · Se actualiza con el botón** (provisoria). Leer al abrir la pestaña y al tocar «Actualizar», con la hora de la última lectura a la vista. Sin sondeo automático: no gasta cuota de Apps Script ni guarda datos clínicos entre peticiones (NO7 del PRD madre).
- **D3 · Solo iniciales y número de cama** (decisión de Manuel, 8-nov-2026; reemplaza la propuesta anterior de mostrar el nombre). Las páginas de Controles **y las de UPC-Pulse** muestran del paciente únicamente sus iniciales (p. ej. «R.E.T.») y el número de cama: ni nombre completo ni RUT. Las iniciales se arman al vuelo desde el nombre del episodio y no se guardan. En ALMA el paciente se ubica por la cama. ⚠️ Promesa a cumplir al programar: la acción de lectura del panel **no envía el nombre al navegador**; las iniciales se calculan en el servidor, para que el nombre no viaje aunque no se pinte.
- **D4 · Una cama por página** (Manuel, 8-nov-2026; reemplaza «dos pacientes por página»): la vista individual es la carilla 1 de la hoja (R6), que no cabe dos veces en media pantalla. ← → recorren las camas ocupadas en orden; elegir una cama en el selector o en el mosaico abre su hoja.
- **R1 · Lo que no se registró queda vacío.** Un recuadro o un campo sin dato muestra «—» o «sin dato»; el panel nunca rellena con el control anterior.
- **R2 · El turno es el de la hoja.** El panel muestra la hoja del día según R21 del PRD madre (el Día y la Noche que empieza ese día, incluida la madrugada siguiente).
- **R4 · Datos de resumen (Manuel, 8-nov-2026).** Del último control, en cuatro filas y en este orden: ① FC · PA (PAS/PAD) · PAM ② DVA (una o varias, tal como se escribieron; vacío = «Sin DVA») ③ PEEP · FiO₂ · SAT ④ VT · FR · PP · DP. Es el mismo resumen en el mosaico y en la tarjeta por paciente. PP = P. Plateau (confirmado por Manuel, 8-nov-2026) y DP = P. Distensión (driving pressure) de la hoja. Lo que no se registró sale «—» (R1). **Neuro (Manuel, 8-nov-2026):** después de la DVA va una fila con Glasgow (solo el total, tal como se anota, por ejemplo «9T»), SAS y escalón de sedación, tomados de las casillas Glasgow y SAS/Escalón de la hoja. **Modo ventilatorio (Manuel, 8-nov-2026):** solo si el paciente está en VMI o VNI, el modo se agrega como primera fila del segmento Mecánica en la vista por paciente, y en el mosaico va dentro de la etiqueta del soporte (verde = VMI, por ejemplo «AC/VC»; azul = VNI, por ejemplo «VNI BIPAP»). Con oxigenoterapia o CNAF no se muestra modo, y la etiqueta dice «O2».
- **R5 · Vista estática (Manuel, 8-nov-2026).** Ninguna de las dos vistas obliga a desplazarse ni a deslizar: todo cabe en la ventana de media pantalla (medido en la maqueta a 683×650 y 683×720 px: sin barra de desplazamiento ni texto cortado). La hoja por cama (R6) mantiene **filas por dato y columnas por horario**, encuadradas por segmento (Monitorización y Terapia ventilatoria) con el nombre en vertical. Caben nueve controles, como el papel; con más, se ven los nueve últimos y un aviso «+n controles anteriores». La grilla se estira para ocupar el alto disponible. «Para ALMA» reemplaza la hoja en el mismo espacio (botón «Ver para ALMA» / «Ver controles») en vez de alargarla. El mosaico usa un recuadro compacto por cama con el mismo resumen en celdas separadas.
- **R6 · La vista individual es la carilla 1 de la hoja (Manuel, 8-nov-2026).** Al entrar a una cama se ve la primera plana del papel con lo registrado, con los mismos rótulos y en el mismo orden de `RK_PG1`: franja CAMA · EDAD · PACIENTE · INGRESO · DÍAS · FECHA (con **iniciales** en vez de nombre y **sin RUT**, D3); DIAGNÓSTICO; y la grilla MONITORIZACIÓN (Frec. Cardiaca, P. Arterial, P. A. Media, PIC/PPC, Glasgow, S5Q, SAS/Escalón, DVA) + TERAPIA VENTILATORIA (Modo … SpO2, FIRMA) con **nueve columnas de horario como el papel**; las que no tienen control quedan en blanco. La fila HORA es además el selector del control, con «ALMA ✓» o «pendiente» bajo cada hora. Abajo, en una línea: fechas de Trachcare, HEPA y HME, talla, peso ideal y 6 ml/kg. **Lo que la pantalla no trae del papel:** el bloque de turno con la vía aérea artificial (Sop. ventilatorio/O2, Auscultación, Sec. Bronquiales; TOT/TQT, calibre, días, cms., reintubaciones, días de VM), que Manuel pidió quitar (8-nov-2026); el bloque LABORATORIO (no se registra en el teléfono, R36 del PRD madre), los logos y la nota del pie. Medido en la maqueta: cabe sin desplazamiento a 683×650 (filas de 15 px, cifras de 12 px) y las filas crecen solas en una ventana más alta.
- **R7 · Sin vista «Para ALMA» en el panel (Manuel, 8-nov-2026).** Se quitó el botón «Ver para ALMA»: el traspaso se hace leyendo la hoja por cama (R6). El panel conserva solo la marca por control («Marcar … en ALMA» / «Deshacer», D1). La vista en el orden de ALMA de R24-R26 del PRD madre queda fuera de este panel.
- **R8 · El recuadro de cada cama es una ficha en lista (Manuel eligió la opción C entre cuatro, 8-nov-2026).** Rótulo a la izquierda y valor a la derecha, un dato por renglón y siempre en el mismo orden: FC · PA · PAM · DVA · GCS · SAS/Escalón · PEEP · FiO₂ · SAT · VT · FR · PP · DP, con el fondo de color de su bloque (hemodinamia, neuro, oxigenación, mecánica). Arriba, cama, iniciales y la etiqueta de soporte con el modo; abajo, hora del último control y lo pendiente de ALMA. Las camas se muestran por segmento (R9). **Valores alineados (Manuel, 8-nov-2026):** los rótulos van en una columna de ancho fijo y las cifras a la derecha con dígitos de igual ancho, así todas terminan en el mismo borde (medido: las 13 cifras de una ficha terminan en el mismo píxel y la columna de valores parte igual en todas las fichas); en la hoja por cama las cifras de la grilla también van a la derecha, y Modo y Firma centrados. **DVA con varias drogas:** una droga por línea («NA 0,22 / + VP 0,03 / + DBT 5»), tal como se escribieron; el renglón DVA crece hasta caberlas y mide lo mismo en todas las camas del segmento, para que los demás renglones sigan alineados (medido: SAT a la misma altura en las 6 fichas, con tres drogas en una cama). La app elige cuántas columnas usar para que cada recuadro tenga al menos 66 × 230 px y las letras crecen con el espacio. Medido sin desplazamiento: 8 camas a 683×650 (cifras de 13,5 px) y la unidad llena, 18 camas, a 683×650 (9 columnas, cifras de 10,5 px; la DVA se acorta con «…» y sale completa al pasar el mouse). Opciones descartadas: pizarra (filas = camas), monitor y rótulos una sola vez.
- **R9 · La vista general va por segmentos de camas (Manuel, 8-nov-2026).** Las 18 camas se dividen en segmentos y se ve uno a la vez, con las flechas ← → (botones o teclado) para pasar de un segmento a otro; en la hoja por cama las mismas flechas pasan de cama en cama. Cada segmento muestra todas sus camas en posición fija por número, también las libres (recuadro punteado «Libre»), para que nada se mueva cuando una cama se desocupa; en el selector de arriba se marcan las camas del segmento visible, y junto a las flechas se lee «Camas 7–12 · 2 de 3 · 5 sin ALMA». **Confirmado por Manuel (8-nov-2026):** tres segmentos de 6 camas, 1–6, 7–12 y 13–18; al programarlo, los segmentos salen de `CONFIG` (lista editable, sin tocar código). Medido: a 683×650 las 6 fichas van en una fila con renglones alineados entre camas (cifras de 13,4 px), sin desplazamiento. Esto reemplaza «solo camas ocupadas» de R8.
- **R10 · Estética: vidrio esmerilado con relieve (Manuel eligió entre 5 paletas y 4 estilos de botón, 12 y 13-nov-2026).** Tema claro. Dos colores base, **grafito** (#2e3a46) y **perla** (#f3f4f6), y un color de detalle, **ámbar** (#e0a000), para lo pendiente y la columna elegida. Paneles y botones de vidrio translúcido con desenfoque sobre un fondo con manchas suaves de los tres colores; el botón activo en degradado grafito con brillo arriba. Letra **Manrope** con cifras de ancho fijo. ⚠️ Manrope se carga desde Google Fonts: confirmar que el Chrome del hospital la recibe; si no, cae a la letra del sistema sin romper nada. Reemplaza la piel de UPC-Pulse que tenía esta regla el 12-nov.
- **R3 · Ventana aparte.** Igual que R28: se abre en su propia ventana de Chrome y se acomoda con ⊞ Win + flechas; si el navegador no deja abrirla, funciona en una pestaña.

**Pseudo-código (acuerdo, no implementación):**

```
CUANDO se abre la pestaña Controles o se toca «Actualizar»
  ¿PANEL_CONTROLES_ACTIVO y CONTROL_CABECERA_ACTIVO?  si no → la pestaña no existe
  ENTONCES leer CONTROLES de la hoja del día (no anulados), agrupar por cama ocupada
           pintar mosaico: por cama, último control + cuántos + cuántos sin ALMA_TS

CUANDO se toca «Marcar pasado a ALMA» sobre el control X
  ¿X existe, no está anulado y ALMA_TS está vacía?   si no → avisar quién lo marcó y cuándo
  ENTONCES en conLock: escribir ALMA_FIRMA y ALMA_TS; _auditar
           elegir el siguiente control pendiente de esa cama

CUANDO se toca «Deshacer» sobre el control X
  ¿la marca es de la misma firma?                     si no → no se deshace
  ENTONCES en conLock: vaciar ALMA_FIRMA y ALMA_TS; _auditar

PROMESAS: el panel no cambia valores clínicos · solo iniciales y cama, sin nombre ni RUT · no toca ALMA ·
          las cifras del REM e indicadores no cambian
```

## 7 · Pendientes

- **P-P1 · D1 contra R28** (Diego). ¿Se guarda la marca de control traspasado?
- **P-P2 · D2** (Diego). ¿Botón o actualización sola? (D3 ya la cerró Manuel: solo iniciales y cama.)
- **P-P3 · Resaltados** (Diego). ¿Se quedan el borde rojo con SpO₂ bajo 90 y la hora en rojo con más de 4 horas? Son lectura, no alertas (NOP3), pero son criterio clínico y los fija él.
- **P-P4 · Orden real de ALMA** (Manuel, en terreno). La maqueta usa el orden de R26; confirmar contra el formulario «Ventilación Mecánica Invasiva» de ALMA.
- **P-P5 · Media pantalla en el hospital** (Manuel, en terreno). Es la P17 del PRD madre: probar en el Chrome del puesto que el panel y ALMA conviven a la mitad de la pantalla.
- **P-P6 · Fuente de los controles.** Si se sigue `PRD_FUSION_RCE_KINE_UPC_PULSE.md`, los controles los registra UPC-Pulse y el RCE los guarda en `CONTROLES`: este panel no cambia, pero depende de que esa entrada exista.
