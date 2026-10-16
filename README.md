# Entrenador Redrock · Sea Wolf

Aplicación web local para practicar dos pruebas de razonamiento con presión de tiempo: un estudio ecológico (Redrock Study) y la selección de tratamientos microbianos (Sea Wolf). Todo el contenido es original y se genera de forma procedural con semilla. Funciona sin conexión y sin backend.

## Requisitos

- Node.js 18 o superior

## Arrancar

```bash
npm install
npm run dev
```

Abre la URL que muestra la terminal (por defecto http://localhost:5173).

## Otros comandos

- `npm test`: tests de los generadores con Vitest (500 semillas por modo y dificultad).
- `npm run build`: genera una versión estática en `dist/`. Puedes abrirla con `npm run preview` o servir la carpeta con cualquier servidor estático.

## Uso

- **Modos:** Redrock (35 min), Sea Wolf (30 min) y Simulación completa (las dos seguidas, 65 min).
- **Dificultad:** Normal o Difícil. En Difícil hay más material trampa y, en Sea Wolf, solo 1–3 combinaciones válidas por zona y muchas casi válidas.
- **Semilla:** déjala vacía para un escenario nuevo, o escribe una (por ejemplo `ABC123`) para repetir exactamente el mismo escenario. La semilla usada aparece en la cabecera, en los resultados y en el historial.
- **Ayudas de práctica (Sea Wolf):** muestran sumas parciales y rangos de suma. Desactivadas por defecto, como en la prueba real. Si las usas, el intento queda marcado en el historial.
- **Historial:** se guarda en el `localStorage` del navegador.

Todo está en español: el contenido de las pruebas, los menús, las correcciones y las explicaciones. Las cifras usan punto decimal y coma de miles (por ejemplo, 1,920.5); al responder puedes escribir 41.1 o 41,1.
