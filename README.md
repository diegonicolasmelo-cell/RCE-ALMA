# KINE-RCE-NEXT · UPC-Pulse

Plataforma satélite de monitorización kinésica a pie de cama.
UCI Adulto — Hospital San Pablo de Coquimbo.

> **No reemplaza a ALMA.** Es una herramienta de trabajo del equipo de
> kinesiología cuyo producto final es la evolución que se transcribe al registro
> oficial (HIS ALMA / TrakCare). Ver `docs/PLAN-MAESTRO.md` cap. 0.

## El problema

ALMA es el registro oficial y no se puede cambiar. Lo que sí se puede cambiar es
cómo llegamos a él. Hoy: se compite por un computador, se registra en papel que
después hay que eliminar, y se transcribe a mano a un formulario que no muestra
tendencias. UPC-Pulse ataca los tres cuellos de botella:

| | |
|---|---|
| **Captura** | Celular a pie de cama. Un control en menos de 60 s, con una mano. |
| **Lectura** | Sábana de 24 h y tendencias en el PC de la estación. |
| **Transcripción** | Evolución estructurada lista para pegar en ALMA, en un clic. |

## Dos instancias, un solo código

- **Móvil** (`/`) — captura. Muestra **solo el número de cama**, nunca datos del
  paciente. Si se pierde el teléfono, no hay un solo dato identificable en él.
- **Estación** (`/estacion`) — visualización. Muestra los datos personales,
  dentro del hospital, cruzando los datos clínicos con un mapa de identidad que
  vive **solo en ese PC** y nunca se sincroniza.

## Arquitectura en una línea

PWA estática (GitHub Pages) → datos **des-identificados** en Google Sheets vía
Apps Script → identidad del paciente **solo** en IndexedDB del PC de la estación.

El detalle, y por qué la protección "bajo la IP del hospital" no es
implementable en Apps Script, está en `docs/PLAN-MAESTRO.md` cap. 1.

## Estado

| Fase | Entregable | Estado |
|---|---|---|
| 0 | Plan maestro y decisiones de arquitectura | ✅ |
| 1 | Núcleo clínico con tests | ✅ 143 tests |
| 2 | Repositorios: Dexie local + cola de sincronía | ⬜ |
| 3 | Apps Script: API, hoja, hash de PIN, deploy | 🔨 código listo, sin desplegar |
| 4 | Móvil: login, 6 camas, control, APK, eventos | ⬜ |
| 5 | Estación: sábana 24 h, tendencias, nota ALMA, riesgo | ⬜ |
| 6 | PWA, REM 28, marcha blanca con datos ficticios | ⬜ |

## Desarrollo

```bash
npm install
```

```bash
npm test
```

```bash
npm run typecheck
```

```bash
npm run dev
```

## El núcleo clínico

`src/core/` no importa React, ni Dexie, ni nada de red. Es la regla que mantiene
el proyecto sano: la corrección clínica vive en funciones puras que se testean en
milisegundos y se razonan sin levantar un navegador.

| Módulo | Qué resuelve |
|---|---|
| `tipos.ts` | Episodio / Control / EventoClínico / APK como entidades separadas |
| `fisiologia.ts` | PBW, PAM, PPC, ΔP, Crs, Vt/kg, Tobin, ROX, Glasgow condicionado |
| `validez.ts` | **Candado de mecánica**: invalida plateau, ΔP y compliance si hay asincronía en modo controlado |
| `borrador.ts` | **Regla anti-sesgo**: las variables dinámicas nacen en blanco |
| `eventos.ts` | Vía aérea vigente, cronómetro de PVE, horas de prono, BNM |
| `sedacion.ts` | Escalones 1–6 con dosis libre |
| `apk.ts` | Pauta condicional por vía aérea + aserción atestiguada |
| `nota-alma.ts` | Generador de evolución y casillas discretas |
| `rem28.ts` | Agregación estadística (se calcula, no se acumula) |
| `sanitizar.ts` | **Frontera de minimización**: lo que puede y no puede salir del hospital |

### Tres decisiones que conviene conocer

**La mecánica ventilatoria se bloquea, no se reporta a medias.** Si el modo es
VCV o PCV y el paciente está asincrónico, el plateau está contaminado por
esfuerzo muscular activo. La nota para ALMA no reporta ΔP ni compliance, y dice
por qué. Un dato falso es peor que un dato ausente.

**Los signos vitales nacen en blanco.** El prototipo los heredaba del control
anterior, que es el sesgo de arrastre que había que eliminar. Lo que se hereda
es el estado continuo (infusiones, modo ventilatorio); lo que se lee de un
monitor se pide fresco.

**La APK no marca casillas de a una.** Un clic que marca N criterios de
seguridad como verificados hace que el registro afirme revisiones que quizá
nadie hizo, con una firma nominal detrás. En su lugar se registra una aserción
global atestiguada, con vía rápida de excepción si un criterio falla. Mismo
clic, registro verdadero. Ver `docs/PLAN-MAESTRO.md` cap. 6.

## Documentación

- `docs/PLAN-MAESTRO.md` — arquitectura clínica y técnica, decisiones y riesgos
- `backend/apps-script/README.md` — instalación del backend y contrato de la API

## Pendiente no técnico, y no menor

Esto es un registro paralelo con datos de pacientes. Hay que presentarlo a
jefatura de UPC y a calidad/informática **antes** de la marcha blanca. La
minimización de datos y el encuadre como herramienta de trabajo son
precisamente los argumentos que hacen viable esa conversación.
