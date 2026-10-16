# Entrenador McKinsey Solve: Redrock · Sea Wolf · SFL

Aplicación web local para practicar las pruebas de McKinsey Solve: Redrock Study, Sea Wolf y el Sustainable Futures Lab (SFL), tanto la versión Island de las invitaciones de 95 min como la clásica de las de 85 min. Reproduce la mecánica y la presión de tiempo con contenido 100 % original, generado con semilla. No tiene backend: el único "servidor" es el de Vite en tu ordenador, que guarda tus intentos y el registro de cada partida en ficheros locales. Nada sale de tu ordenador.

La investigación en la que se basa (fuentes, contradicciones y lo que no se ha podido confirmar) está en [`research/solve-2026.md`](research/solve-2026.md). El SFL está en la sección 9.

## Arrancar

Requisito: Node.js 18 o superior.

```bash
npm install
npm run dev
```

Abre http://localhost:5173.

Para probar qué pasa cuando se acaba el tiempo, añade `?segundos=N` a la dirección (por ejemplo http://localhost:5173/?segundos=60): cada prueba dura entonces N segundos.

## Comandos

- `npm test`: tests de generadores, validadores, rúbricas y detector de patrones con Vitest.
- `npm run check`: genera 50 escenarios por módulo (Redrock, Sea Wolf, SFL Island y SFL Classic), dificultad e idioma, y comprueba que ninguno falla su validador (`npm run check -- 200` para más).
- `npm run build`: versión estática en `dist/`. `npm run preview` la sirve en local (y también guarda los intentos y los registros en ficheros).

## Modos

| Modo | Duración | Contenido |
| --- | --- | --- |
| Redrock Study | 35 min | Investigación, Análisis, Informe y 6 mini-casos |
| Sea Wolf | 30 min | 3 sitios: perfil, clasificación, rondas y tratamiento |
| SFL Island | 30 min | 3 días gestionando a 4 investigadores en 4 estaciones |
| SFL Classic | 20 min | Briefing, ranking de 4 iniciativas y 12 decisiones encadenadas |
| Simulación 65 min | 65 min | Redrock → Sea Wolf |
| Simulación 95 min | 95 min | Redrock → Sea Wolf → SFL Island, con vuelta al menú entre pruebas |

Entre pruebas de una simulación aparece una pantalla intermedia, como el menú de tareas de la prueba real. Ninguna fuente describe una pausa formal con cronómetro, así que la pausa dura lo que tú quieras y el tiempo sobrante no pasa a la siguiente prueba.

- **Práctica:** pistas, guía de tiempo, ayudas opcionales en Sea Wolf, la solución de cada mini-caso al momento, el resumen de cada día del SFL Island y la respuesta de cada decisión del SFL Classic.
- **Examen:** reloj real, sin pistas ni feedback, y corrección solo al final.
- **Idioma de la prueba:** español o inglés. La misma semilla da el mismo escenario en los dos idiomas. Las correcciones siempre se muestran en español.

## Las pruebas

- **Redrock:**
  - Se puede ir y volver entre Investigación y Análisis; al entrar en el Informe ya no se puede volver.
  - El diario admite 8 cifras (límite no confirmado) y puede guardar cálculos de la calculadora, que es básica.
  - El Informe es un párrafo con huecos más un gráfico de barras, líneas o tarta.
- **Sea Wolf:** en cada sitio eliges el perfil (2 características), clasificas 10 microbios (pool de hasta 6), completas el pool con 4 rondas de "elige 1 de 3" y eliges un tratamiento de 3. Cada sitio garantiza un trío válido alcanzable siguiendo la regla de clasificación.
- **SFL Island:**
  - Cada día tiene un objetivo (atender a las personas, cubrir las estaciones o equilibrar ambas cosas) y 4 fases:
    - **Explorar:** 3, 3 y 2 preguntas según el día. Cada persona o estación responde a una sola pregunta al día, y las notas se borran por la noche.
    - **Asignar:** cada movimiento pide un motivo de una lista cerrada.
    - **Apoyar:** 4 peticiones al día (conflicto, sobrecarga, datos contradictorios, dependencias, bienestar o delegación). Una de ellas es urgente, y el orden en que las atiendes cuenta.
    - **Reflexionar:** valoras el ánimo o la carga de cada investigador, con "No lo sé" como opción.
  - Lo que contestas a una petición cambia el ánimo de esa persona al día siguiente.
  - Las cifras dudosas (preguntas por día, notas que se borran, peticiones por día) se pueden cambiar en `ISLAND_CONFIG`, en `src/sfl/island.ts`.
- **SFL Classic:**
  - El briefing no se puede volver a leer, así que hay un panel de notas.
  - El ranking de 4 iniciativas se hace con los pesos del comité y respetando las dependencias.
  - Después vienen 12 decisiones que acaban en la de escalar o no. Algunas dependen de las anteriores:
    - Alargar el análisis en la 6 te deja sin margen en la 8.
    - Un mal indicador en la 2 te obliga a corregir en la 11.
    - Poner primero una iniciativa que necesita otra bloquea el piloto en la 12.

## Validadores

Cada escenario se comprueba antes de mostrarse. Si no pasa, se descarta y se genera otro.
- **Redrock:** texto, tablas, notas al pie y respuestas recalculadas desde los datos.
- **Sea Wolf:** solución alcanzable, perfil sin empates y la regla de clasificación lleva a una solución.
- **SFL Island:** cada día tiene una asignación óptima única, con margen sobre la segunda. Esa asignación:
  - es distinta de la que sugieren los cargos visibles;
  - se puede deducir con las preguntas clave, que caben en el presupuesto del día;
  - no se acierta sin explorar.

  Además, cada petición tiene exactamente una mejor respuesta y otra aceptable.
- **SFL Classic:** el ranking tiene un orden claro, cada pantalla tiene una mejor respuesta y una aceptable, y las respuestas sobre segmentos y escalado salen de los datos mostrados.

## Corrección y análisis

Al terminar ves, en este orden:

1. **Nota global.** En una simulación es la media de las pruebas, y cada una pesa lo mismo. Debajo tienes la nota de cada prueba y de cada parte, y la tendencia frente a tus intentos anteriores del mismo modo.
2. **3 consejos concretos** para el siguiente intento, sacados de tus fallos más caros y de tus patrones.
3. **Dónde se fueron los puntos** (como el "points off your score" de Road to Offer). Es la lista de fallos ordenada por lo que restan, con el motivo de cada uno. La columna "% de la nota" suma exactamente 100 menos tu nota.
4. **La rúbrica completa** de cada prueba, desplegable:
   - Redrock (100): diario 10, con penalización por distractor; Análisis 9 por pregunta; Informe 3 por hueco, más el tipo y los valores del gráfico; mini-casos 5 cada uno.
   - Sea Wolf (100 por sitio): Perfil 10, Clasificación 20 (2 por microbio), Pool 20 (todo o nada) y Tratamiento 50 (10 por comprobación). Cada microbio mal clasificado muestra sus valores frente al rango, la regla que incumple y lo que tocaba.
   - SFL Island (100 por día): Explorar 20, Asignar 30, Motivos 10, Apoyar 30 y Reflexionar 10.
   - SFL Classic (100): Ranking 10, por parejas, y 7,5 por cada una de las 12 decisiones (la aceptable vale 3,5).
5. **Tiempo** por parte frente a la referencia, las decisiones más lentas y los periodos sin actividad.
6. **Patrones del proceso:**
   - Mirar datos que no usas, o usar datos que no miraste.
   - Cambios de opinión.
   - Decisiones rápidas que fallan.
   - En Sea Wolf, en qué ronda perdiste la solución y qué microbio la habría salvado.
   - En el SFL: preguntas gastadas en información irrelevante o demasiado pronto, asignaciones por intuición sin la información, reflexión sin pruebas y errores tempranos que arrastras.
7. **Mapa de calor del ratón** y **repetición** de cada fase, a x1, x4 o x8.
8. **Revisión detallada:**
   - Redrock y Sea Wolf, paso a paso.
   - SFL, decisión a decisión: tu respuesta, la mejor, por qué, qué información la justificaba y cuándo había que conseguirla.

**Evolución** ("Ver evolución") muestra la nota por parte de la rúbrica con su tendencia, el tiempo por parte y la frecuencia de cada tipo de error (últimos 5 intentos frente a los 5 anteriores).

## Dónde se guarda todo

- `data/intentos.json`: un resumen por intento (modo, semilla, nota, partes, tiempos y errores). Sin el servidor de Vite, los intentos se guardan en el navegador y se pueden exportar a JSON.
- `data/sesiones/<fecha>-<semilla>.json`: el registro completo de cada partida. Incluye:
  - ratón (muestreado cada 100 ms como mucho), clics, scroll y hovers de más de 300 ms sobre datos, microbios, tablas y preguntas;
  - aperturas y cierres;
  - diario;
  - decisiones con su tiempo, y cambios de opinión;
  - fases;
  - periodos sin actividad de más de 10 s;
  - operaciones de la calculadora.

  Se escribe por lotes al final de cada fase.

La carpeta `data/` no se sube a git.

## Semillas

Deja el campo vacío para un escenario nuevo, o escribe una semilla (por ejemplo `ABC123`) para repetir exactamente el mismo. La semilla no guarda la partida: sirve para volver a jugar el mismo escenario desde cero.

Las cifras usan punto decimal y coma de miles (1,920.5). Al responder puedes escribir `41.1` o `41,1`.
