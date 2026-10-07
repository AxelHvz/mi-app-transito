const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
//const PORT = process.env.PORT || 3000;
const PORT = process.env.PORT || 8080;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

/* ---------- Carga de datos ---------- */
function leerJsonDir(dir) {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => ({ archivo: f, data: JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) }));
}

const modulos = leerJsonDir(path.join(__dirname, "data", "teoria"))
  .map((x) => x.data)
  .sort((a, b) => a.orden - b.orden);

const tituloCategoria = new Map(modulos.map((m) => [m.id, m.titulo]));

// Cada archivo de data/preguntas/<categoria>.json es una lista de preguntas
const banco = [];
for (const { archivo, data } of leerJsonDir(path.join(__dirname, "data", "preguntas"))) {
  const categoria = archivo.replace(".json", "");
  data.forEach((p, i) => {
    if (!Array.isArray(p.opciones) || p.correcta < 0 || p.correcta >= p.opciones.length) {
      throw new Error(`Pregunta inválida en ${archivo} (posición ${i + 1})`);
    }
    banco.push({
      id: `${categoria}-${i + 1}`,
      categoria,
      pregunta: p.pregunta,
      opciones: p.opciones,
      textoCorrecto: p.opciones[p.correcta],
      explicacion: p.explicacion,
    });
  });
}
const porId = new Map(banco.map((p) => [p.id, p]));

/* ---------- Utilidades ---------- */
// Fisher-Yates: mezcla sin sesgo
function mezclar(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Reparte la selección entre categorías (una por una) para que el examen abarque todos los temas
function seleccionBalanceada(preguntas, cantidad) {
  const grupos = new Map();
  for (const p of mezclar(preguntas)) {
    if (!grupos.has(p.categoria)) grupos.set(p.categoria, []);
    grupos.get(p.categoria).push(p);
  }
  const colas = mezclar([...grupos.values()]);
  const resultado = [];
  while (resultado.length < cantidad && colas.some((c) => c.length)) {
    for (const cola of colas) {
      if (cola.length && resultado.length < cantidad) resultado.push(cola.shift());
    }
  }
  return mezclar(resultado);
}

/* ---------- API ---------- */
// Lista de categorías con su total de preguntas
app.get("/api/categorias", (_req, res) => {
  const conteo = {};
  banco.forEach((p) => (conteo[p.categoria] = (conteo[p.categoria] || 0) + 1));
  res.json({
    total: banco.length,
    categorias: modulos
      .filter((m) => conteo[m.id])
      .map((m) => ({ id: m.id, titulo: m.titulo, icono: m.icono, total: conteo[m.id] })),
  });
});

// Preguntas al azar, con las opciones mezcladas y SIN la respuesta correcta.
// ?cantidad=30  &categoria=senales  &balanceado=1
app.get("/api/preguntas", (req, res) => {
  let cantidad = parseInt(req.query.cantidad, 10);
  if (Number.isNaN(cantidad) || cantidad < 1) cantidad = 10;

  let base = banco;
  if (req.query.categoria) {
    if (!tituloCategoria.has(req.query.categoria)) {
      return res.status(400).json({ error: "Categoría desconocida" });
    }
    base = base.filter((p) => p.categoria === req.query.categoria);
  }
  cantidad = Math.min(cantidad, base.length);

  const elegidas =
    req.query.balanceado === "1"
      ? seleccionBalanceada(base, cantidad)
      : mezclar(base).slice(0, cantidad);

  res.json({
    total: elegidas.length,
    disponibles: base.length,
    preguntas: elegidas.map((p) => ({
      id: p.id,
      categoria: p.categoria,
      categoriaTitulo: tituloCategoria.get(p.categoria),
      pregunta: p.pregunta,
      opciones: mezclar(p.opciones),
    })),
  });
});

// Verifica una respuesta enviando el TEXTO de la opción elegida
app.post("/api/verificar", (req, res) => {
  const { id, respuesta } = req.body || {};
  const p = porId.get(id);
  if (!p) return res.status(404).json({ error: "Pregunta no encontrada" });
  if (typeof respuesta !== "string" || !p.opciones.includes(respuesta)) {
    return res.status(400).json({ error: "Respuesta inválida" });
  }
  res.json({
    correcta: respuesta === p.textoCorrecto,
    respuestaCorrecta: p.textoCorrecto,
    explicacion: p.explicacion,
  });
});

// Contenido del Modo Estudio (módulos completos)
app.get("/api/teoria", (_req, res) => res.json(modulos));

app.listen(PORT, () => {
  console.log(`Servidor listo en http://localhost:${PORT}`);
  console.log(`${modulos.length} módulos de teoría · ${banco.length} preguntas`);
});
