# Identidad y anonimización: se dejan para una etapa propia

**Decisión de Diego Melo, 28 de noviembre de 2026.**

Kaptus nació del proyecto RCE-ALMA. Hasta ahora, cada funcionalidad nueva se diseñaba a la vez con
su parte de privacidad: identidad cifrada en el navegador, nada de nombre ni RUT en lo que sube a la
nube, y nombre y edad que pasan del RCE al teléfono sin guardarse.

Diego decidió **separar las dos cosas**:

> «La ley en Chile de la privacidad de datos se retrasó su lanzamiento hasta fines del otro año, así
> que podemos pensar en una estrategia para anonimizar los datos. Por el momento la anonimización la
> dejaría un poco de lado y me centraría más que nada en que funcione. Funcionando, y con robustez,
> podemos después darle la anonimización ya mucho más centrada solamente en eso, y no crear y
> anonimizar a la vez.»

## Qué significa en la práctica

- **Lo nuevo no se frena por la anonimización.** Las funcionalidades que vienen (perfil médico,
  coherencia entre el celular y el PC, extubación desde el modo) se diseñan para que funcionen y
  sean robustas. La anonimización no es requisito para terminarlas.
- **Lo que ya existe no se desarma.** Se quedan las protecciones que ya están programadas y probadas:
  - el rechazo de lotes con la llave `nombre` o con forma de RUT;
  - la identidad cifrada en el navegador;
  - el borrado del RUT en la historia antes de enviarla.

  Sacarlas sería un cambio aparte, y solo si Diego lo pide.
- **La etapa de anonimización tendrá su propio PRD**: qué datos son identificables, dónde viven, cómo
  se seudonimizan y qué ve cada perfil.

## Lo que esta decisión NO cubre

- **Mandar datos clínicos a un servicio externo nuevo** sigue siendo una decisión aparte. Un ejemplo es
  el dictado por voz de Chrome en el PC, que envía el audio a Google. Esta decisión se refiere al ritmo
  del trabajo de anonimización, no a abrir canales nuevos hacia afuera.
- La regla del RCE de que el RUT no sale en el REM, el tablero ni las exportaciones sigue igual.

## Excepción autorizada: el RUT para Synapse y cobas (28-nov-2026)

Diego: «sí, cobas y Synapse copian el RUT que alimentamos al RCE». El RUT de cada cama pasa del RCE al
celular **solo** para que los botones de Synapse y cobas lo copien al portapapeles:

- viaja en un campo propio y solo si tiene forma de RUT; nunca dentro de la historia;
- el servidor de Kaptus no lo guarda y el teléfono lo tiene solo en memoria (se borra al cerrar la app);
- no se muestra en la tarjeta ni en la lista del día del médico;
- se apaga en el RCE con `CONFIG.KAPTUS_RUT_CELULAR = FALSE`, y sin `SYNAPSE_URL` ni `LIS_URL` no viaja.
