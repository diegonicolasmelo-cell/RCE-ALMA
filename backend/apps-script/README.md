# Backend Apps Script — instalación

> **Lee esto primero.** Este backend corre en servidores de Google, **no** en la
> intranet del hospital, y Apps Script **no puede restringir por IP**. Por eso la
> hoja solo almacena datos des-identificados: cama, edad, sexo, talla y
> fisiología. El nombre y el RUT del paciente viven únicamente en el PC de la
> estación. Ver `docs/PLAN-MAESTRO.md` cap. 1 y 3.

## Pasos

1. Crea una hoja de cálculo nueva en Google Sheets. Nómbrala `UPC-Pulse · Datos`.
2. `Extensiones → Apps Script`. Borra el contenido de `Código.gs` y pega
   `backend/apps-script/Codigo.gs`.
3. Ejecuta la función `inicializarLibro` una vez. Crea las hojas, los
   encabezados, el `APP_TOKEN` y la pimienta de los PIN.
4. Abre `Ver → Registro` y **copia el `APP_TOKEN`**. Es el token que la app
   envía en cada petición.
5. Ejecuta `cargarDotacion` una vez. Carga a los 16 profesionales sin PIN; cada
   uno define el suyo en su primer ingreso.
6. **Reemplaza los RUT de marcador de posición** por los reales, en la hoja
   `usuarios` y en `src/core/dotacion.ts`.
7. `Implementar → Nueva implementación → Aplicación web`:
   - *Ejecutar como*: **Yo**
   - *Quién tiene acceso*: **Cualquier persona**
8. Copia la URL `/exec` resultante. Esa URL y el `APP_TOKEN` van en el archivo
   `.env` del frontend, nunca en el repositorio.

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

### `POST` · `{ accion: "sincronizar", episodios[], controles[], eventos[], apk[] }`
Append-only e **idempotente**: los `id` ya presentes se ignoran, por lo que
reintentar una sincronía interrumpida es seguro.

→ `{ ok: true, controles: { insertados, duplicados }, ... }`
→ `{ ok: false, error: "PAYLOAD_CON_IDENTIDAD", llaves: [...] }` si el payload
trae un dato identificable. **Esto es una red de seguridad, no el control
primario**: el cliente ya filtra con `src/core/sanitizar.ts`.
→ `{ ok: false, error: "OCUPADO_REINTENTAR" }` ante contención del lock;
el cliente reintenta con backoff.

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
