const PORCENTAJE_APROBACION = 80; // puntaje mínimo de práctica (el oficial puede variar)

const MODOS = [
  { id: "completo", nombre: "Examen completo", desc: "30 preguntas de todos los temas", cantidad: 30, minutos: 30, balanceado: true },
  { id: "rapido", nombre: "Examen rápido", desc: "10 preguntas de todos los temas", cantidad: 10, minutos: 10, balanceado: true },
  { id: "tema", nombre: "Práctica por tema", desc: "10 preguntas de un solo tema", cantidad: 10, minutos: 10, balanceado: false },
];

const $ = (sel) => document.querySelector(sel);
const vistas = document.querySelectorAll(".vista");

function el(tag, clase, texto) {
  const e = document.createElement(tag);
  if (clase) e.className = clase;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

function mostrar(id) {
  vistas.forEach((v) => v.classList.toggle("activa", v.id === id));
  window.scrollTo({ top: 0 });
}

async function api(url, opciones) {
  const res = await fetch(url, opciones);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/* ---------- Almacenamiento local (seguro si no está disponible) ---------- */
function leerLS(clave, defecto) {
  try {
    const v = localStorage.getItem(clave);
    return v ? JSON.parse(v) : defecto;
  } catch {
    return defecto;
  }
}
function guardarLS(clave, valor) {
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    /* sin almacenamiento: se ignora */
  }
}

/* ---------- Estado ---------- */
let teoria = [];
let categorias = [];
let moduloActual = 0;

let modo = MODOS[0];
let preguntas = [];
let indice = 0;
let historial = [];
let bloqueado = false;
let mostrarFeedback = true;
let temporizador = null;
let finTiempo = 0;
let inicioExamen = 0;
let filtroRevision = "todas";

/* ---------- Navegación general ---------- */
document.querySelectorAll("[data-volver]").forEach((b) =>
  b.addEventListener("click", () => {
    detenerReloj();
    irMenu();
  })
);

function irMenu() {
  mostrar("menu");
  pintarEstadisticas();
}

$("#btn-estudio").addEventListener("click", abrirEstudio);
$("#btn-simulador").addEventListener("click", abrirConfig);
$("#volver-indice").addEventListener("click", () => mostrar("estudio"));

async function cargarDatos() {
  if (!teoria.length) teoria = await api("/api/teoria");
  if (!categorias.length) categorias = (await api("/api/categorias")).categorias;
}

/* =========================================================
   MODO ESTUDIO
   ========================================================= */
async function abrirEstudio() {
  try {
    await cargarDatos();
  } catch {
    alert("No se pudo cargar la teoría. ¿Está corriendo el servidor?");
    return;
  }
  $("#buscador").value = "";
  pintarIndice();
  mostrar("estudio");
}

function leidos() {
  return new Set(leerLS("leidos", []));
}

function pintarIndice() {
  const cont = $("#indice-modulos");
  cont.innerHTML = "";
  $("#resultados-busqueda").innerHTML = "";
  cont.classList.remove("oculto");
  const vistos = leidos();
  $("#progreso-estudio").textContent = `Módulos leídos: ${vistos.size} de ${teoria.length}`;

  teoria.forEach((m, i) => {
    const tarjeta = el("button", "tarjeta-modulo" + (vistos.has(m.id) ? " leido" : ""));
    tarjeta.append(
      el("span", "num", `${m.icono} Módulo ${i + 1}`),
      el("strong", "", m.titulo),
      el("small", "", m.resumen),
      el("span", "estado", vistos.has(m.id) ? "✔ Leído" : "Pendiente")
    );
    tarjeta.addEventListener("click", () => abrirModulo(i));
    cont.appendChild(tarjeta);
  });
}

function abrirModulo(i) {
  moduloActual = i;
  const m = teoria[i];
  const cont = $("#contenido-modulo");
  cont.innerHTML = "";

  cont.appendChild(el("h2", "", `${m.icono} ${m.titulo}`));
  cont.appendChild(el("p", "resumen", m.resumen));

  m.secciones.forEach((s) => {
    const bloque = el("div", "bloque");
    bloque.appendChild(el("h3", "", s.titulo));
    (s.texto || []).forEach((t) => bloque.appendChild(el("p", "", t)));

    if (s.tabla) {
      const envoltura = el("div", "tabla-envoltura");
      const tabla = el("table");
      const cab = el("tr");
      s.tabla.cab.forEach((c) => cab.appendChild(el("th", "", c)));
      const thead = el("thead");
      thead.appendChild(cab);
      const tbody = el("tbody");
      s.tabla.filas.forEach((f) => {
        const tr = el("tr");
        f.forEach((celda) => tr.appendChild(el("td", "", celda)));
        tbody.appendChild(tr);
      });
      tabla.append(thead, tbody);
      envoltura.appendChild(tabla);
      bloque.appendChild(envoltura);
    }

    if (s.puntos) {
      const ul = el("ul");
      s.puntos.forEach((p) => ul.appendChild(el("li", "", p)));
      bloque.appendChild(ul);
    }
    if (s.tip) bloque.appendChild(el("div", "tip", "💡 " + s.tip));
    cont.appendChild(bloque);
  });

  const vistos = leidos();
  vistos.add(m.id);
  guardarLS("leidos", [...vistos]);

  $("#mod-anterior").disabled = i === 0;
  $("#mod-siguiente").disabled = i === teoria.length - 1;
  mostrar("modulo");
}

$("#mod-anterior").addEventListener("click", () => abrirModulo(moduloActual - 1));
$("#mod-siguiente").addEventListener("click", () => abrirModulo(moduloActual + 1));
$("#mod-practicar").addEventListener("click", async () => {
  await abrirConfig();
  seleccionarModo("tema");
  $("#tema").value = teoria[moduloActual].id;
  actualizarResumen();
});
$("#btn-repasar").addEventListener("click", abrirEstudio);

/* Búsqueda en la teoría */
function textoModulo(m) {
  const partes = [];
  m.secciones.forEach((s) => {
    partes.push({ sec: s.titulo, txt: s.titulo });
    (s.texto || []).forEach((t) => partes.push({ sec: s.titulo, txt: t }));
    (s.puntos || []).forEach((t) => partes.push({ sec: s.titulo, txt: t }));
    if (s.tip) partes.push({ sec: s.titulo, txt: s.tip });
    if (s.tabla) s.tabla.filas.forEach((f) => partes.push({ sec: s.titulo, txt: f.join(": ") }));
  });
  return partes;
}

function normalizar(t) {
  return t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

$("#buscador").addEventListener("input", (e) => {
  const q = normalizar(e.target.value.trim());
  const res = $("#resultados-busqueda");
  res.innerHTML = "";
  if (q.length < 3) {
    $("#indice-modulos").classList.remove("oculto");
    return;
  }
  $("#indice-modulos").classList.add("oculto");

  let total = 0;
  teoria.forEach((m, i) => {
    textoModulo(m)
      .filter((p) => normalizar(p.txt).includes(q))
      .slice(0, 4)
      .forEach((p) => {
        total++;
        const item = el("button", "resultado-busqueda");
        item.append(el("small", "", `${m.icono} ${m.titulo} › ${p.sec}`), el("span", "", p.txt));
        item.addEventListener("click", () => abrirModulo(i));
        res.appendChild(item);
      });
  });
  if (!total) res.appendChild(el("p", "nota", "No se encontraron coincidencias."));
});

/* =========================================================
   CONFIGURACIÓN DEL SIMULADOR
   ========================================================= */
async function abrirConfig() {
  try {
    await cargarDatos();
  } catch {
    alert("No se pudo conectar con el servidor.");
    return;
  }
  const sel = $("#tema");
  if (!sel.options.length) {
    categorias.forEach((c) => {
      const o = el("option", "", `${c.icono} ${c.titulo} (${c.total})`);
      o.value = c.id;
      sel.appendChild(o);
    });
    sel.addEventListener("change", actualizarResumen);
  }
  pintarModos();
  mostrar("config");
}

function pintarModos() {
  const cont = $("#modos");
  cont.innerHTML = "";
  MODOS.forEach((m) => {
    const b = el("button", "modo" + (m.id === modo.id ? " activo" : ""));
    b.dataset.id = m.id;
    b.append(el("strong", "", m.nombre), el("small", "", m.desc));
    b.addEventListener("click", () => seleccionarModo(m.id));
    cont.appendChild(b);
  });
  $("#fila-tema").classList.toggle("oculto", modo.id !== "tema");
  actualizarResumen();
}

function seleccionarModo(id) {
  modo = MODOS.find((m) => m.id === id);
  pintarModos();
}

function actualizarResumen() {
  const partes = [`${modo.cantidad} preguntas`];
  if ($("#chk-tiempo").checked) partes.push(`${modo.minutos} minutos`);
  partes.push(`aprobado con ${PORCENTAJE_APROBACION}% o más (criterio de práctica)`);
  $("#resumen-config").textContent = partes.join(" · ");
}
$("#chk-tiempo").addEventListener("change", actualizarResumen);

/* =========================================================
   EXAMEN
   ========================================================= */
$("#btn-iniciar").addEventListener("click", iniciarExamen);
$("#btn-reintentar").addEventListener("click", abrirConfig);
$("#btn-siguiente").addEventListener("click", siguiente);
$("#btn-abandonar").addEventListener("click", () => {
  if (confirm("¿Abandonar el examen? Se perderá el progreso.")) {
    detenerReloj();
    irMenu();
  }
});

async function iniciarExamen() {
  mostrarFeedback = $("#chk-feedback").checked;
  const usarReloj = $("#chk-tiempo").checked;

  let url = `/api/preguntas?cantidad=${modo.cantidad}`;
  if (modo.balanceado) url += "&balanceado=1";
  if (modo.id === "tema") url += `&categoria=${encodeURIComponent($("#tema").value)}`;

  try {
    const data = await api(url);
    preguntas = data.preguntas;
  } catch {
    alert("No se pudieron cargar las preguntas. ¿Está corriendo el servidor?");
    return;
  }

  indice = 0;
  historial = [];
  inicioExamen = Date.now();
  mostrar("examen");
  renderPregunta();

  detenerReloj();
  const reloj = $("#reloj");
  if (usarReloj) {
    finTiempo = Date.now() + modo.minutos * 60 * 1000;
    reloj.classList.remove("oculto");
    pintarReloj();
    temporizador = setInterval(pintarReloj, 500);
  } else {
    reloj.classList.add("oculto");
  }
}

function pintarReloj() {
  const restante = Math.max(0, Math.round((finTiempo - Date.now()) / 1000));
  const m = String(Math.floor(restante / 60)).padStart(2, "0");
  const s = String(restante % 60).padStart(2, "0");
  const reloj = $("#reloj");
  reloj.textContent = `⏱ ${m}:${s}`;
  reloj.classList.toggle("urgente", restante <= 60);
  if (restante === 0) {
    detenerReloj();
    alert("Se acabó el tiempo. Se mostrarán tus resultados.");
    terminar();
  }
}

function detenerReloj() {
  if (temporizador) clearInterval(temporizador);
  temporizador = null;
}

function renderPregunta() {
  bloqueado = false;
  const p = preguntas[indice];
  $("#contador").textContent = `Pregunta ${indice + 1} de ${preguntas.length}`;
  $("#barra").style.width = `${(indice / preguntas.length) * 100}%`;
  $("#etiqueta-tema").textContent = p.categoriaTitulo;
  $("#pregunta").textContent = p.pregunta;
  $("#feedback").className = "feedback oculto";
  const sig = $("#btn-siguiente");
  sig.classList.add("oculto");
  sig.textContent = indice === preguntas.length - 1 ? "Ver resultados" : "Siguiente";

  const cont = $("#opciones");
  cont.innerHTML = "";
  p.opciones.forEach((texto) => {
    const b = el("button", "opcion", texto);
    b.addEventListener("click", () => responder(texto, b));
    cont.appendChild(b);
  });
}

async function responder(texto, boton) {
  if (bloqueado) return;
  bloqueado = true;
  const p = preguntas[indice];
  const botones = [...document.querySelectorAll(".opcion")];
  botones.forEach((b) => (b.disabled = true));

  let r;
  try {
    r = await api("/api/verificar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: p.id, respuesta: texto }),
    });
  } catch {
    alert("Error de conexión con el servidor.");
    bloqueado = false;
    botones.forEach((b) => (b.disabled = false));
    return;
  }

  historial.push({
    pregunta: p.pregunta,
    categoria: p.categoria,
    categoriaTitulo: p.categoriaTitulo,
    elegida: texto,
    correcta: r.respuestaCorrecta,
    ok: r.correcta,
    explicacion: r.explicacion,
  });

  if (mostrarFeedback) {
    botones.forEach((b) => {
      if (b.textContent === r.respuestaCorrecta) b.classList.add("correcta");
    });
    if (!r.correcta) boton.classList.add("incorrecta");
    const fb = $("#feedback");
    fb.className = `feedback ${r.correcta ? "ok" : "mal"}`;
    fb.textContent = `${r.correcta ? "✅ ¡Correcto! " : "❌ Incorrecto. "}${r.explicacion}`;
  } else {
    boton.classList.add("elegida");
  }
  $("#btn-siguiente").classList.remove("oculto");
}

function siguiente() {
  indice++;
  if (indice >= preguntas.length) return terminar();
  renderPregunta();
}

/* =========================================================
   RESULTADOS
   ========================================================= */
function terminar() {
  detenerReloj();
  // Preguntas sin responder (por tiempo agotado) cuentan como incorrectas
  for (let i = historial.length; i < preguntas.length; i++) {
    const p = preguntas[i];
    historial.push({
      pregunta: p.pregunta,
      categoria: p.categoria,
      categoriaTitulo: p.categoriaTitulo,
      elegida: null,
      correcta: null,
      ok: false,
      explicacion: "",
    });
  }

  const total = preguntas.length;
  const aciertos = historial.filter((h) => h.ok).length;
  const pct = Math.round((aciertos / total) * 100);
  const aprobado = pct >= PORCENTAJE_APROBACION;
  const segundos = Math.round((Date.now() - inicioExamen) / 1000);

  $("#puntaje").textContent = `${aciertos} / ${total} (${pct}%)`;
  const v = $("#veredicto");
  v.textContent = aprobado
    ? "🎉 ¡Aprobado! Vas muy bien preparado."
    : `Necesitas al menos ${PORCENTAJE_APROBACION}% para aprobar. ¡Sigue practicando!`;
  v.className = `veredicto ${aprobado ? "aprobado" : "reprobado"}`;
  $("#tiempo-usado").textContent = `Tiempo empleado: ${Math.floor(segundos / 60)} min ${segundos % 60} s · ${modo.nombre}`;
  $("#barra").style.width = "100%";

  pintarPorTema();
  filtroRevision = "todas";
  document.querySelectorAll("[data-filtro]").forEach((b) => b.classList.toggle("activo", b.dataset.filtro === "todas"));
  pintarRevision();

  const hist = leerLS("historial", []);
  hist.push({ fecha: Date.now(), modo: modo.id, aciertos, total, pct });
  guardarLS("historial", hist.slice(-50));

  mostrar("resultados");
}

function pintarPorTema() {
  const grupos = new Map();
  historial.forEach((h) => {
    const g = grupos.get(h.categoriaTitulo) || { ok: 0, total: 0 };
    g.total++;
    if (h.ok) g.ok++;
    grupos.set(h.categoriaTitulo, g);
  });
  const cont = $("#por-tema");
  cont.innerHTML = "";
  [...grupos.entries()]
    .sort((a, b) => a[1].ok / a[1].total - b[1].ok / b[1].total)
    .forEach(([titulo, g]) => {
      const pct = Math.round((g.ok / g.total) * 100);
      const fila = el("div", "fila-tema");
      const info = el("div", "fila-info");
      info.append(el("span", "", titulo), el("strong", "", `${g.ok}/${g.total}`));
      const barra = el("div", "mini-barra");
      const relleno = el("div", pct >= PORCENTAJE_APROBACION ? "relleno bien" : "relleno mal");
      relleno.style.width = `${pct}%`;
      barra.appendChild(relleno);
      fila.append(info, barra);
      cont.appendChild(fila);
    });
}

function pintarRevision() {
  const cont = $("#detalle");
  cont.innerHTML = "";
  const lista = historial
    .map((h, i) => ({ ...h, n: i + 1 }))
    .filter((h) => filtroRevision === "todas" || !h.ok);
  if (!lista.length) {
    cont.appendChild(el("p", "nota", "¡Sin errores! Respondiste todo correctamente."));
    return;
  }
  lista.forEach((h) => {
    const d = el("div", `item-detalle ${h.ok ? "ok" : "mal"}`);
    d.appendChild(el("strong", "", `${h.n}. ${h.pregunta}`));
    d.appendChild(el("small", "", h.categoriaTitulo));
    if (h.elegida === null) {
      d.appendChild(el("div", "", "Sin responder (tiempo agotado)."));
    } else {
      d.appendChild(el("div", "", `${h.ok ? "✅" : "❌"} Tu respuesta: ${h.elegida}`));
      if (!h.ok) d.appendChild(el("div", "", `✔ Correcta: ${h.correcta}`));
      d.appendChild(el("div", "expl", h.explicacion));
    }
    cont.appendChild(d);
  });
}

document.querySelectorAll("[data-filtro]").forEach((b) =>
  b.addEventListener("click", () => {
    filtroRevision = b.dataset.filtro;
    document.querySelectorAll("[data-filtro]").forEach((x) => x.classList.toggle("activo", x === b));
    pintarRevision();
  })
);

/* =========================================================
   ESTADÍSTICAS EN EL MENÚ
   ========================================================= */
function pintarEstadisticas() {
  const hist = leerLS("historial", []);
  const cont = $("#estadisticas");
  if (!hist.length) {
    cont.classList.add("oculto");
    return;
  }
  const mejor = Math.max(...hist.map((h) => h.pct));
  const ultimos = hist.slice(-5);
  const prom = Math.round(ultimos.reduce((s, h) => s + h.pct, 0) / ultimos.length);
  cont.classList.remove("oculto");
  cont.innerHTML = "";
  cont.append(
    el("h3", "", "Tu progreso"),
    el("p", "", `Exámenes realizados: ${hist.length} · Mejor puntaje: ${mejor}% · Promedio de los últimos ${ultimos.length}: ${prom}%`)
  );
}

/* Inicio */
irMenu();
fetch("/api/categorias")
  .then((r) => r.json())
  .then((d) => {
    $("#info-simulador").textContent = `${d.total} preguntas en el banco · retroalimentación inmediata`;
  })
  .catch(() => {});
