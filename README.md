# Examen Teórico de Manejo · El Salvador

App web para estudiar y simular el examen teórico de manejo (escuela examinadora / VMT).
Backend en **Node.js + Express**, frontend en HTML/CSS/JS puro (sin frameworks).

## Qué incluye

- **Modo Estudio:** 13 módulos de teoría (62 secciones con tablas, listas y consejos), buscador, y seguimiento de módulos leídos.
- **Simulador de Examen:** 110 preguntas en 13 temas.
  - *Examen completo:* 30 preguntas repartidas entre todos los temas, con temporizador de 30 min.
  - *Examen rápido:* 10 preguntas de todos los temas.
  - *Práctica por tema:* preguntas de un solo tema (puedes abrirla desde cada módulo de estudio).
  - Retroalimentación inmediata (se puede desactivar para simular un examen real), resultados por tema, revisión pregunta por pregunta y estadísticas de progreso.
- Las opciones de cada pregunta se **mezclan en cada intento** y la respuesta correcta se valida en el servidor.

## Estructura

```
transito-sv/
├── package.json
├── server.js                 # API Express + archivos estáticos
├── data/
│   ├── teoria/               # un JSON por módulo (01-conceptos.json ...)
│   └── preguntas/            # un JSON por tema (senales.json, marcas.json ...)
└── public/
    ├── index.html
    ├── style.css
    └── app.js
```

## Instalación y ejecución

1. Instala Node.js 18 o superior: https://nodejs.org
2. `cd transito-sv`
3. `npm install`
4. `npm start`  (o `npm run dev` para recarga automática)
5. Abre http://localhost:3000

## API

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/categorias` | Temas y cantidad de preguntas de cada uno |
| GET | `/api/preguntas?cantidad=30&balanceado=1&categoria=senales` | Preguntas al azar sin respuesta; `balanceado=1` reparte entre temas; `categoria` es opcional |
| POST | `/api/verificar` | Body `{ "id": "senales-3", "respuesta": "texto de la opción" }` → `{ correcta, respuestaCorrecta, explicacion }` |
| GET | `/api/teoria` | Módulos completos del Modo Estudio |

## Agregar contenido

- **Preguntas:** edita o crea `data/preguntas/<tema>.json`. Cada elemento: `{ "pregunta", "opciones": [...], "correcta": <índice desde 0>, "explicacion" }`. El nombre del archivo debe coincidir con el `id` de un módulo de `data/teoria/`. Evita opciones del tipo «todas las anteriores», porque las opciones se mezclan.
- **Teoría:** cada módulo en `data/teoria/` tiene `id`, `orden`, `icono`, `titulo`, `resumen` y `secciones` (con `texto`, `puntos`, `tabla` y `tip` opcionales).

## Importante: verifica los datos que cambian

El contenido es material de estudio general. **No incluye** montos de multas, límites de velocidad por tipo de vía, límite de alcohol en sangre, ni requisitos de edad y costos de cada categoría de licencia, porque esas cifras han cambiado con las reformas a la ley. Antes del examen, revísalas en el texto vigente de la Ley de Transporte Terrestre, Tránsito y Seguridad Vial y en el manual del VMT, y agrégalas al banco de preguntas.

El formato del examen oficial (cantidad de preguntas, tiempo y puntaje mínimo) puede diferir: el simulador usa 30 preguntas, 30 minutos y 80% como criterio de práctica; se cambian en `MODOS` y `PORCENTAJE_APROBACION` dentro de `public/app.js`.
