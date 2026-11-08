# Backend Apps Script — instalación

> **Lee esto primero.** Este backend corre en servidores de Google, **no** en la
> intranet del hospital, y Apps Script **no puede restringir por IP**. Por
> decisión del equipo (riesgo aceptado), el nombre y el RUT del paciente se
> guardan **cifrados** (un solo bloque ilegible, hoja `referencia`) para estar disponibles en cualquier PC con la clave y abrir
> Sinapse por RUT. Las defensas: **dos tokens** (el celular nunca recibe esa
> hoja), **hojas separadas** y **purga al alta**. Ver `docs/PLAN-MAESTRO.md` cap. 1 y 3.
>
> **Quién ve la hoja de cálculo:** cualquiera con acceso de edición al archivo
> ve la hoja `identidad`. Mantén el archivo con el mínimo de personas y, si se
> puede, en una cuenta institucional y no personal.

## Pasos

1. Crea una hoja de cálculo nueva en Google Sheets. Nómbrala `UPC-Pulse · Datos`.
2. `Extensiones → Apps Script`. Borra el contenido de `Código.gs` y pega
   `backend/apps-script/Codigo.gs`.
3. Ejecuta la función `inicializarLibro` una vez. Crea las hojas, los
   encabezados, el `APP_TOKEN` y la pimienta de los PIN.
4. Abre `Ver → Registro` y copia los dos tokens:
   - `APP_TOKEN` → celulares.
   - `STATION_TOKEN` → solo PC. **Nunca** va en un celular: es lo que impide que
     un teléfono lea la identidad.
5. Ejecuta `cargarDotacion` una vez. Carga a los 16 profesionales sin PIN; cada
   uno define el suyo en su primer ingreso.
6. **Reemplaza los RUT de marcador de posición** por los reales, en la hoja
   `usuarios` y en `src/core/dotacion.ts`.
7. `Implementar → Nueva implementación → Aplicación web`:
   - *Ejecutar como*: **Yo**
   - *Quién tiene acceso*: **Cualquier persona**
8. Copia la URL `/exec` resultante.
9. **Arma los dos enlaces de configuración** (cada uno se usa una vez por dispositivo):

   | Para | Enlace |
   |---|---|
   | **Celulares** | `https://<sitio>/#config?u=<URL /exec codificada>&a=<APP_TOKEN>` |
   | **PC de la UCI** | `https://<sitio>/#config?u=<URL /exec codificada>&a=<APP_TOKEN>` y después `https://<sitio>/#estacion?t=<STATION_TOKEN>` |

   La URL va codificada (`encodeURIComponent`). Todo viaja en el fragmento
   (`#…`), que el navegador **nunca envía al servidor**: la app lo guarda en ese
   dispositivo y lo borra de la barra de direcciones. Así **ni la URL ni los
   tokens quedan dentro del código publicado** (un sitio público los mostraría a
   cualquiera) y no hay que re-tipear nada por turno.

   Para despliegues privados se pueden poner en `.env` (`VITE_API_URL`,
   `VITE_APP_TOKEN`), pero en un sitio público **no lo hagas**.

   Para olvidar la configuración de un equipo: pestaña *Estado* del PC →
   “Borrar la configuración y las llaves de este equipo”.

## Por qué "cualquier persona" y qué implica

El celular no está autenticado contra Google, así que el web app debe aceptar
peticiones anónimas. **La URL es la credencial:** quien la tenga puede llamar a
la API. De ahí que existan tres capas encima:

1. `APP_TOKEN` — evita que un escaneo casual escriba en la hoja.
2. PIN por profesional — la autenticación real de quien registra y firma.
3. Minimización de datos — aunque todo lo anterior falle, lo expuesto son
   números asociados a "UCI-03", sin identidad.

Si la URL se filtra, se crea una implementación nueva (URL nueva) y se rota el
`APP_TOKEN` desde `Configuración del proyecto → Propiedades del script`.

## Límite honesto del hash del PIN

Apps Script no ofrece bcrypt ni scrypt. Se usa SHA-256 con sal por usuario,
pimienta y 1.000 iteraciones. Para un PIN de 4–6 dígitos, eso **no resiste** a
alguien que obtenga la hoja y tenga tiempo: el espacio de búsqueda es chico.
Sirve contra la suplantación casual entre colegas, que es la amenaza real aquí.
Si la firma APK llega a tener valor médico-legal formal, hay que migrar a login
institucional (LDAP/AD) o a un servidor propio.

## Contrato de la API

Todas las peticiones llevan `token`.

### `POST` · `{ accion: "login", rut, pin }`
→ `{ ok: true, rut }` · `{ ok: false, error: "PIN_INCORRECTO" | "PIN_NO_DEFINIDO" | "USUARIO_NO_ENCONTRADO" }`

### `POST` · `{ accion: "definirPin", rut, pinActual, pinNuevo }`
Primer PIN sin `pinActual`; los cambios posteriores lo exigen.

### `POST` · `{ accion: "sincronizar", episodios[], controles[], eventos[], apk[], ventiladores[] }`
Append-only e **idempotente**: los `id` ya presentes se ignoran, por lo que
reintentar una sincronía interrumpida es seguro.

`ventiladores[]` es el registro de movimientos de los equipos (donde está cada ventilador).
No lleva datos de pacientes. Si el libro ya estaba instalado, vuelve a pegar `Codigo.gs` y
ejecuta `inicializarLibro` de nuevo: solo crea la hoja `ventiladores` que falta, no toca lo demás.

→ `{ ok: true, controles: { insertados, duplicados }, ... }`
→ `{ ok: false, error: "PAYLOAD_CON_IDENTIDAD", llaves: [...] }` si el payload
trae un dato identificable. **Esto es una red de seguridad, no el control
primario**: el cliente ya filtra con `src/core/sanitizar.ts`.
→ `{ ok: false, error: "OCUPADO_REINTENTAR" }` ante contención del lock;
el cliente reintenta con backoff.

### Referencias cifradas (token de estación)
La identidad del paciente (nombre y RUT) **no se guarda en claro**: el PC la cifra en el
navegador con la contraseña de la unidad y el servidor solo ve un bloque `v1.<iv>.<datos>`.
- `POST { accion: "guardarReferencia", token: STATION_TOKEN, referencias[] }` — upsert por `episodioId`. Rechaza con `DATO_NO_CIFRADO` todo lo que no tenga forma de bloque cifrado.
- `POST { accion: "purgarReferencia", token: STATION_TOKEN, episodioIds[] }` — se llama al alta (cuando la hoja APK final ya fue guardada por el PC de respaldo).
- `GET ?recurso=referencia&token=STATION_TOKEN` — el celular, con `APP_TOKEN`, recibe `TOKEN_INVALIDO`.
- La fila `_verificacion` sirve para comprobar que la contraseña escrita en un PC es la correcta.
- Las hojas APK **ya no se guardan en Drive**: viven solo en la carpeta local del PC de respaldo.

### `GET` · `?token=...&desde=<ISO 8601>`
Lectura incremental para la estación. Sin `desde` devuelve todo.

## Mantenimiento

- **Respaldo:** `Archivo → Descargar → .xlsx` cada semana, guardado dentro del
  hospital. Google no es un respaldo del hospital.
- **Crecimiento:** una fila por control. Con ~20 camas y ~4 controles por turno
  son unas 2.400 filas al mes. Sheets aguanta años, pero conviene archivar el
  año anterior en un libro aparte.
- **Si `OCUPADO_REINTENTAR` se vuelve frecuente**, es la señal de que Sheets ya
  no da el ancho y toca migrar a un servidor real. El núcleo no cambia: solo el
  adaptador de repositorio.
