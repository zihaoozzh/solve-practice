# Entrenador Redrock · Sea Wolf

Aplicación web local para practicar las dos pruebas de McKinsey Solve que, según la investigación, son las habituales hoy: Redrock Study y Sea Wolf. Reproduce la mecánica y la presión de tiempo con contenido 100 % original, generado con semilla. No tiene backend: el único "servidor" es el de Vite en tu ordenador, que guarda tus intentos en un fichero local.

La investigación en la que se basa (fuentes, contradicciones y lo que no se ha podido confirmar) está en [`research/solve-2026.md`](research/solve-2026.md).

## Arrancar

Requisito: Node.js 18 o superior.

```bash
npm install
npm run dev
```

Abre http://localhost:5173.

## Comandos

- `npm test`: tests de generadores y validadores con Vitest.
- `npm run check`: genera 50 escenarios por módulo, dificultad e idioma y comprueba que ninguno falla el validador de coherencia (`npm run check -- 200` para más).
- `npm run build`: versión estática en `dist/`. `npm run preview` la sirve en local (y también guarda los intentos en el fichero).

## Qué incluye

- **Modos:** Redrock (35 min), Sea Wolf (30 min) y Simulación completa (65 min, Redrock y después Sea Wolf).
- **Sesión:**
  - **Práctica:** pistas, guía de tiempo por fase y por mini-caso, ayudas opcionales en Sea Wolf, la solución de cada mini-caso al momento y la eficacia de cada tratamiento.
  - **Examen:** reloj real, sin pistas, sin guía ni ayudas, y corrección solo al final.
- **Idioma de la prueba:** español o inglés. La misma semilla da el mismo escenario en los dos idiomas. Las correcciones siempre se muestran en español.
- **Redrock:**
  - Las fases son Investigación, Análisis, Informe y 6 mini-casos. Se puede ir y volver entre Investigación y Análisis; al entrar en el Informe ya no se puede volver.
  - El diario tiene un límite de 8 cifras (este límite no está confirmado) y puede guardar cálculos de la calculadora.
  - La calculadora es básica, sin potencias ni porcentaje.
  - Las respuestas del estudio se dan con 2 decimales.
  - El Informe es un párrafo con huecos (incluida la conclusión y su justificación), más un gráfico de barras, líneas o tarta.
- **Sea Wolf:**
  - Hay 3 sitios. En cada uno se clasifican 10 microbios ("este sitio", "siguiente sitio" o "rechazar"), el pool admite hasta 6 y luego se completa con 4 rondas de "elige 1 de 3".
  - El tratamiento es de 3 microbios. Cada microbio tiene un rasgo de 4 posibles, y la media de cada atributo debe caer en su rango.
  - Cada sitio garantiza al menos un trío válido alcanzable.
- **Validador de coherencia:** cada escenario de Redrock se contrasta consigo mismo (texto, tablas, notas al pie, papel de cada sitio y respuestas recalculadas desde los datos). Si no pasa, se descarta y se genera otro. Lo mismo vale para los sitios de Sea Wolf.
- **Evolución:** cada intento se guarda en `data/intentos.json`, con fecha, modo, semilla, tiempos y aciertos por fase y por tipo de mini-caso. La pantalla "Ver evolución" muestra la tendencia. Sin el servidor de Vite (por ejemplo, abriendo `dist/` desde otro servidor), los intentos se guardan en el navegador y se pueden exportar a JSON.

## Semillas

Deja el campo vacío para un escenario nuevo, o escribe una semilla (por ejemplo `ABC123`) para repetir exactamente el mismo. La semilla no guarda la partida: sirve para volver a jugar el mismo escenario desde cero.

Las cifras usan punto decimal y coma de miles (1,920.5). Al responder puedes escribir `41.1` o `41,1`.
