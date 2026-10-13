// Archivo oficial del backend (Apps Script). Subir con: clasp push
// 1. FUNCIÓN OBLIGATORIA PARA DESPLEGAR LA WEB APP
function doGet() {
  return HtmlService.createTemplateFromFile("Index")
    .evaluate()
    .setTitle("Captura de Calificaciones - Control Escolar")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

// 2. INCLUIR COMPONENTES HTML EN LA PLANTILLA
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
} 

/*function getDatosDocente() {
  // Obtiene el correo de la persona que inició sesión (en minúsculas y sin espacios)
  var correoUsuario = Session.getActiveUser().getEmail().toLowerCase().trim();
  var nombreDocente = "";
  
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    // Apunta a tu pestaña "docentes"
    var sheetDocentes = ss.getSheetByName("docentes"); 
    
    if (sheetDocentes) {
      var data = sheetDocentes.getDataRange().getValues();
      
      // Recorremos las filas omitiendo el encabezado (i = 1)
      for (var i = 1; i < data.length; i++) {
        // CORREGIDO: El correo institucional real está en la Columna F (índice 5)
        var correoFila = data[i][5] ? data[i][5].toString().toLowerCase().trim() : "";
        
        // Si el correo de la columna F coincide con el usuario logueado
        if (correoFila === correoUsuario) {
          // Extrae el Nombre Completo de la Columna A (índice 0)
          if (data[i][0] && data[i][0].toString().trim() !== "") {
            nombreDocente = data[i][0].toString().trim();
            break; // Coincidencia encontrada, salimos del ciclo
          }
        }
      }
    }
  } catch(e) {
    Logger.log("Error en getDatosDocente: " + e.message);
  }

  // Salvavidas estricto por si el correo no estuviera registrado en la lista
  if (!nombreDocente) {
    nombreDocente = correoUsuario.split("@")[0].replace(/\./g, " ").toUpperCase();
  }

  return {
    correo: correoUsuario,
    nombre: nombreDocente
  };
}*/

// MANTENER POR COMPATIBILIDAD: Dejamos esta función por si acaso otra parte oculta del sistema la llama
/*function getCorreoUsuario() {
  return Session.getActiveUser().getEmail();
}*/

// 4. OBTENER LAS MATERIAS Y GRUPOS ASIGNADOS AL DOCENTE
/*function getAsignacionesDocente() {
  const correoDocente = getCorreoUsuario();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hojaDocentes = ss.getSheetByName("DOCENTES");
  const datosDocentes = hojaDocentes.getDataRange().getValues();
  
  let asignaciones = [];
  
  for (let i = 1; i < datosDocentes.length; i++) {
    let fila = datosDocentes[i];
    let correoFila = fila[5] ? fila[5].toString().trim().toLowerCase() : "";
    
    if (correoFila === correoDocente.trim().toLowerCase()) {
      asignaciones.push({
        grupo: fila[1].toString().trim(),
        materia: fila[2].toString().trim()
      });
    }
  }
  return asignaciones;
}*/

// ==========================================
// FASE 1: IDENTIFICACIÓN Y ASIGNACIONES CON FIREBASE
// ==========================================

// ==========================================
// FASE 1: IDENTIFICACIÓN Y ASIGNACIONES CON FIREBASE (CORREGIDO)
// ==========================================

/**
 * Correo del visitante en la Web App (nunca usar getEffectiveUser() para roles).
 * Web App: executeAs USER_DEPLOYING (Firebase/UrlFetch como propietario) + access ANYONE.
 * El visitante debe pulsar «Ingresar» y autorizar; getActiveUser() identifica su cuenta.
 */
function obtenerCorreoSesionWebApp_() {
  var raw = Session.getActiveUser().getEmail();
  return normalizarCorreoLoginDocente(raw);
}

/** true solo si Google expuso el correo del visitante (Ingresar + autorización). */
function visitanteTieneSesionGoogleIdentificada_() {
  var mail = Session.getActiveUser().getEmail();
  return !!(mail && mail.toString().trim());
}

/** Bloquea acciones sensibles si no hay visitante identificado (nunca usar getEffectiveUser para roles). */
function assertVisitanteWebAppIdentificado_() {
  if (!visitanteTieneSesionGoogleIdentificada_()) {
    throw new Error("No se identificó su cuenta Google. Pulse «Ingresar» y autorice correo y perfil.");
  }
  var correo = obtenerCorreoSesionWebApp_();
  if (!correo) {
    throw new Error("No se pudo leer el correo de su sesión. Vuelva a ingresar.");
  }
  return correo;
}

function getCorreoUsuario() {
  return obtenerCorreoSesionWebApp_();
}

/**
 * Foto de perfil Google del usuario en sesión (Web App USER_ACCESSING).
 * Solo correo + perfil; sin directorio admin. Devuelve data URI para el navegador.
 */
function obtenerFotoPerfilPorCorreo(correo) {
  var activo = getCorreoUsuario();
  var mail = (correo || activo || "").toLowerCase().trim();
  if (!mail || !esCorreoInstitucionalUtzmg(mail)) {
    return { url: null, correo: mail };
  }
  if (activo && mail !== activo) {
    return { url: null, correo: mail };
  }

  var cache = CacheService.getUserCache();
  var cacheKey = "fotoPerfilV5_" + mail.replace(/[^a-z0-9@._-]/gi, "_");
  var cached = cache.get(cacheKey);
  if (cached) {
    try {
      var parsed = JSON.parse(cached);
      if (parsed && parsed.url) return parsed;
    } catch (eCache) {
      cache.remove(cacheKey);
    }
  }

  var fotoDataUri = buscarFotoPerfilGoogleUserInfo_(mail);
  var resultado = { url: fotoDataUri, correo: mail };
  if (fotoDataUri) {
    cache.put(cacheKey, JSON.stringify(resultado), 21600);
  }
  return resultado;
}

/** Prueba desde el editor; la autorización real ocurre al ingresar en la Web App. */
function prepararAutorizacionFotosPerfil() {
  var correo = Session.getActiveUser().getEmail();
  if (!correo) {
    return "Abra la Web App, pulse «Ingresar» y acepte ver correo y foto de perfil. No use el editor para autorizar.";
  }
  CacheService.getUserCache().remove("fotoPerfilV5_" + correo.toLowerCase().replace(/[^a-z0-9@._-]/gi, "_"));
  var r = obtenerFotoPerfilPorCorreo(correo.toLowerCase());
  return r.url
    ? "✅ Foto OK en editor para " + correo
    : "Sin foto aquí. Pruebe en la Web App tras «Ingresar» (permisos: correo + foto de perfil).";
}

function diagnosticarIdentidadSesionWebApp() {
  return {
    activeUser: Session.getActiveUser().getEmail() || "",
    effectiveUser: Session.getEffectiveUser().getEmail() || "",
    correoUsadoPorApp: obtenerCorreoSesionWebApp_() || ""
  };
}

function diagnosticarFotoPerfilEnSesion() {
  var mail = getCorreoUsuario();
  var out = {
    correoSesion: mail || "(vacío)",
    foto: null,
    notas: []
  };
  if (!mail) {
    out.notas.push("Entre en la Web App con «Ingresar» y acepte compartir correo y foto de perfil.");
    return out;
  }
  var r = obtenerFotoPerfilPorCorreo(mail);
  out.foto = r.url ? "OK" : "sin foto";
  return out;
}

function buscarFotoPerfilGoogleUserInfo_(mail) {
  var activo = getCorreoUsuario();
  if (!activo || activo !== mail) {
    return null;
  }
  try {
    var resp = UrlFetchApp.fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      method: "get",
      headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true
    });
    if (resp.getResponseCode() !== 200) {
      Logger.log("userinfo HTTP " + resp.getResponseCode());
      return null;
    }
    var info = JSON.parse(resp.getContentText());
    if (info.email && info.email.toLowerCase().trim() !== mail) {
      return null;
    }
    if (!info.picture) {
      return null;
    }
    return convertirFotoGoogleADataUri_(normalizarUrlFotoPerfilGoogle_(info.picture));
  } catch (e) {
    Logger.log("userinfo foto: " + e.message);
    return null;
  }
}

function convertirFotoGoogleADataUri_(urlOrData) {
  if (!urlOrData) return null;
  if (urlOrData.indexOf("data:image") === 0) return urlOrData;
  try {
    var token = ScriptApp.getOAuthToken();
    var resp = UrlFetchApp.fetch(urlOrData, {
      method: "get",
      headers: { Authorization: "Bearer " + token },
      muteHttpExceptions: true
    });
    if (resp.getResponseCode() >= 200 && resp.getResponseCode() < 300) {
      return blobAFotoDataUri_(resp.getBlob());
    }
  } catch (e1) {
    Logger.log("convertirFotoGoogleADataUri auth: " + e1.message);
  }
  try {
    var resp2 = UrlFetchApp.fetch(urlOrData, { muteHttpExceptions: true });
    if (resp2.getResponseCode() === 200) {
      return blobAFotoDataUri_(resp2.getBlob());
    }
  } catch (e2) {
    Logger.log("convertirFotoGoogleADataUri: " + e2.message);
  }
  return null;
}

function blobAFotoDataUri_(blob) {
  if (!blob) return null;
  var mime = blob.getContentType() || "image/jpeg";
  return "data:" + mime + ";base64," + Utilities.base64Encode(blob.getBytes());
}

function normalizarUrlFotoPerfilGoogle_(url) {
  if (!url) return null;
  var u = url.toString();
  if (u.indexOf("googleusercontent.com") >= 0) {
    u = u.replace(/=s\d+-c$/, "=s96-c").replace(/=s\d+-d$/, "=s96-d").replace(/=s\d+$/, "=s96");
    if (u.indexOf("=s") < 0 && u.indexOf("?") < 0) {
      u = u + "?sz=96";
    }
  }
  return u;
}

const URL_BASE_FIREBASE = "https://control-escolar-eaf63-default-rtdb.firebaseio.com/";
const SUFIJO_DOMINIO_INSTITUCIONAL = "@utzmg.edu.mx";
/** Contacto para incidencias técnicas y acceso a la plataforma (visible al usuario). */
const CORREO_CONTACTO_SOPORTE_TECNICO = "direccionacademica@utzmg.edu.mx";

function getCorreoContactoSoporte() {
  return CORREO_CONTACTO_SOPORTE_TECNICO;
}

function mensajeContactoSoporte(prefijo) {
  prefijo = prefijo || "Contacte a";
  return prefijo + " " + CORREO_CONTACTO_SOPORTE_TECNICO + ".";
}
const PROPIEDAD_SECRETO_FIREBASE = "FIREBASE_DB_SECRET";
const PROPIEDAD_ADMIN_CORREOS = "ADMIN_CORREOS";

function getFirebaseDatabaseSecret() {
  return PropertiesService.getScriptProperties().getProperty(PROPIEDAD_SECRETO_FIREBASE) || "";
}

function aplicarAuthFirebaseUrl(url) {
  const secret = getFirebaseDatabaseSecret();
  if (!secret) return url;
  const sep = url.indexOf("?") >= 0 ? "&" : "?";
  return url + sep + "auth=" + encodeURIComponent(secret);
}

function fetchFirebaseUrl(url, options) {
  var opts = options || {};
  if (opts.muteHttpExceptions === undefined) {
    opts.muteHttpExceptions = true;
  }
  return UrlFetchApp.fetch(aplicarAuthFirebaseUrl(url), opts);
}

/** pathRelativo: "Estudiantes", "CONFIG.json", "" (= raíz). */
function fetchFirebasePath(pathRelativo, options) {
  let p = pathRelativo === undefined || pathRelativo === null ? "" : pathRelativo.toString().trim().replace(/^\//, "");
  let suffix = p === "" ? ".json" : (p.endsWith(".json") ? p : p + ".json");
  return fetchFirebaseUrl(URL_BASE_FIREBASE + suffix, options);
}

/** TTL corto para catálogos que cambian poco (reduce descargas Firebase). */
const CACHE_FIREBASE_TTL_SEC = 600;
const CACHE_FIREBASE_MAX_BYTES = 90000;

function leerCacheFirebaseJson(claveCache) {
  try {
    const cached = CacheService.getScriptCache().get(claveCache);
    if (cached) return JSON.parse(cached);
  } catch (e) {
    Logger.log("leerCacheFirebaseJson: " + e.message);
  }
  return null;
}

function guardarCacheFirebaseJson(claveCache, objeto, ttlSec) {
  try {
    const s = JSON.stringify(objeto);
    if (s.length > CACHE_FIREBASE_MAX_BYTES) return;
    CacheService.getScriptCache().put(claveCache, s, ttlSec || CACHE_FIREBASE_TTL_SEC);
  } catch (e) {
    Logger.log("guardarCacheFirebaseJson: " + e.message);
  }
}

function cargarJsonFirebasePathConCache(pathRelativo, claveCache, ttlSec) {
  const hit = leerCacheFirebaseJson(claveCache);
  if (hit) return hit;
  const resp = fetchFirebasePath(pathRelativo, { muteHttpExceptions: true });
  if (resp.getResponseCode() !== 200) return null;
  let data = JSON.parse(resp.getContentText() || "null");
  if (data === null || data === undefined) data = {};
  guardarCacheFirebaseJson(claveCache, data, ttlSec);
  return data;
}

/** Rutas con segmentos codificados (p. ej. INDICES/.../correo_sanitizado). */
function construirUrlFirebaseSegmentos(segmentos) {
  const partes = (segmentos || []).map(function(s) {
    return encodeURIComponent(s.toString());
  });
  return URL_BASE_FIREBASE + partes.join("/") + ".json";
}

function claveCorreoIndiceEstudiante(correo) {
  return sanitizarSegmentoRutaFirebase(normalizarCorreoLoginDocente(correo));
}

function perfilEstudiantePortalDesdeRegistro(matricula, est, mailPreferido) {
  const mail = (mailPreferido || est.correo_institucional || est.correo || "").toString().toLowerCase().trim();
  return {
    matricula: matricula.toString().trim(),
    alumno: est.alumno ? est.alumno.toString().trim() : "",
    carrera: est.carrera ? est.carrera.toString().trim() : "",
    grupo_completo: est.grupo_completo ? est.grupo_completo.toString().trim() : "",
    cve_carrera: (est.cve_carrera || est.cve_carrea || "").toString().trim(),
    Grado_Actual: est.Grado_Actual !== undefined && est.Grado_Actual !== null ? est.Grado_Actual : "",
    estatus: est.estatus ? est.estatus.toString().trim().toUpperCase() : "ACTIVO",
    correo_institucional: mail
  };
}

/**
 * Índice auxiliar (no reemplaza Estudiantes.json). Si falla, el flujo anterior sigue igual.
 */
function publicarIndiceEstudiantesPorCorreo(estudiantes) {
  let publicados = 0;
  if (!estudiantes || typeof estudiantes !== "object") return publicados;
  for (let matricula in estudiantes) {
    let est = estudiantes[matricula];
    if (!est) continue;
    let mail = normalizarCorreoLoginDocente(est.correo_institucional || est.correo || "");
    if (!mail) continue;
    let key = claveCorreoIndiceEstudiante(mail);
    if (!key) continue;
    let perfil = perfilEstudiantePortalDesdeRegistro(matricula, est, mail);
    try {
      fetchFirebaseUrl(construirUrlFirebaseSegmentos(["INDICES", "ESTUDIANTES_POR_CORREO", key]), {
        method: "put",
        contentType: "application/json",
        payload: JSON.stringify(perfil),
        muteHttpExceptions: true
      });
      publicados++;
    } catch (e) {
      Logger.log("publicarIndiceEstudiantesPorCorreo " + mail + ": " + e.message);
    }
  }
  return publicados;
}

function buscarEstudiantePorCorreoDesdeIndice(correo) {
  const c = normalizarCorreoLoginDocente(correo);
  const key = claveCorreoIndiceEstudiante(c);
  if (!key) return null;
  try {
    const resp = fetchFirebaseUrl(construirUrlFirebaseSegmentos(["INDICES", "ESTUDIANTES_POR_CORREO", key]), {
      muteHttpExceptions: true
    });
    if (resp.getResponseCode() !== 200) return null;
    const hit = JSON.parse(resp.getContentText() || "null");
    if (!hit || !hit.matricula) return null;
    return {
      matricula: hit.matricula.toString().trim(),
      alumno: hit.alumno ? hit.alumno.toString().trim() : "",
      carrera: hit.carrera ? hit.carrera.toString().trim() : "",
      grupo_completo: hit.grupo_completo ? hit.grupo_completo.toString().trim() : "",
      cve_carrera: hit.cve_carrera ? hit.cve_carrera.toString().trim() : "",
      Grado_Actual: hit.Grado_Actual !== undefined && hit.Grado_Actual !== null ? hit.Grado_Actual : "",
      estatus: hit.estatus ? hit.estatus.toString().trim().toUpperCase() : "ACTIVO",
      correo_institucional: (hit.correo_institucional || c).toLowerCase().trim()
    };
  } catch (e) {
    Logger.log("buscarEstudiantePorCorreoDesdeIndice: " + e.message);
    return null;
  }
}

function claveFilaCalificacionIndice(grupo, materia, unidad) {
  return grupo.toString().trim().toUpperCase() + "|" + materia.toString().trim().toUpperCase() + "|" + unidad.toString().trim().toUpperCase();
}

function sincronizarIndiceCalificacionMatriculaDespuesDeGuardado(datos) {
  try {
    if (!datos || !datos.matricula) return;
    const cuat = (datos.cuatrimestre || getCuatrimestreActivo()).toString().trim().toUpperCase();
    const url = construirUrlFirebaseSegmentos([
      "INDICES",
      "CALIFICACIONES_POR_MATRICULA",
      sanitizarSegmentoRutaFirebase(datos.matricula),
      sanitizarSegmentoRutaFirebase(cuat)
    ]);
    let contenedor = { v: 1, cuatrimestre: cuat, filas: [] };
    const resp = fetchFirebaseUrl(url, { muteHttpExceptions: true });
    if (resp.getResponseCode() === 200) {
      let parsed = JSON.parse(resp.getContentText() || "null");
      if (parsed && parsed.filas && Array.isArray(parsed.filas)) {
        contenedor.filas = parsed.filas;
      }
    }
    const nuevaFila = {
      grupo: datos.grupo,
      materia: datos.materia,
      unidad: datos.unidad,
      calificacion: datos.calificacion,
      estadoCaptura: datos.estadoCaptura,
      cuatrimestre: cuat,
      fechaRegistro: datos.fechaRegistro || ""
    };
    const clave = claveFilaCalificacionIndice(datos.grupo, datos.materia, datos.unidad);
    let reemplazada = false;
    for (let i = 0; i < contenedor.filas.length; i++) {
      let f = contenedor.filas[i];
      if (claveFilaCalificacionIndice(f.grupo, f.materia, f.unidad) === clave) {
        contenedor.filas[i] = nuevaFila;
        reemplazada = true;
        break;
      }
    }
    if (!reemplazada) contenedor.filas.push(nuevaFila);
    fetchFirebaseUrl(url, {
      method: "put",
      contentType: "application/json",
      payload: JSON.stringify(contenedor),
      muteHttpExceptions: true
    });
  } catch (e) {
    Logger.log("sincronizarIndiceCalificacionMatricula: " + e.message);
  }
}

function convertirFilasIndiceCalificacionesAModeloPortal(filasIndice, matricula, infoModeloAlumno) {
  const filas = [];
  (filasIndice || []).forEach(function(f) {
    if (!f || !f.calificacion || f.calificacion.toString().trim() === "") return;
    const infoModelo = infoModeloAlumno || obtenerModeloEvaluacionGrupo(f.grupo);
    const escala = escalaAlfabeticaDesdeNota(f.calificacion, infoModelo.modelo);
    filas.push({
      grupo: f.grupo.toString(),
      materia: f.materia.toString(),
      unidad: f.unidad.toString(),
      calificacion: f.calificacion.toString(),
      calificacionNumerica: escala.numerico,
      calificacionAlfabetica: escala.alfabetico,
      estadoCaptura: f.estadoCaptura || "TEMPORAL",
      cuatrimestre: f.cuatrimestre || getCuatrimestreActivo(),
      fechaRegistro: f.fechaRegistro || ""
    });
  });
  return filas;
}

function recolectarFilasDesdeIndiceCalificacionesMatricula(matricula, cuatrimestre, infoModeloAlumno) {
  try {
    const url = construirUrlFirebaseSegmentos([
      "INDICES",
      "CALIFICACIONES_POR_MATRICULA",
      sanitizarSegmentoRutaFirebase(matricula),
      sanitizarSegmentoRutaFirebase(cuatrimestre || getCuatrimestreActivo())
    ]);
    const resp = fetchFirebaseUrl(url, { muteHttpExceptions: true });
    if (resp.getResponseCode() !== 200) return null;
    const data = JSON.parse(resp.getContentText() || "null");
    if (!data || !data.filas || !data.filas.length) return null;
    return convertirFilasIndiceCalificacionesAModeloPortal(data.filas, matricula, infoModeloAlumno);
  } catch (e) {
    Logger.log("recolectarFilasDesdeIndiceCalificacionesMatricula: " + e.message);
    return null;
  }
}

function fusionarFilasCalificacionesEstudiante(filasPrimarias, filasSecundarias) {
  const mapa = {};
  (filasSecundarias || []).forEach(function(f) {
    mapa[claveFilaCalificacionIndice(f.grupo, f.materia, f.unidad)] = f;
  });
  (filasPrimarias || []).forEach(function(f) {
    mapa[claveFilaCalificacionIndice(f.grupo, f.materia, f.unidad)] = f;
  });
  return Object.keys(mapa).map(function(k) { return mapa[k]; });
}

function esCorreoInstitucionalUtzmg(correo) {
  const c = (correo || "").toLowerCase().trim();
  return c.length > SUFIJO_DOMINIO_INSTITUCIONAL.length && c.slice(-SUFIJO_DOMINIO_INSTITUCIONAL.length) === SUFIJO_DOMINIO_INSTITUCIONAL;
}

function assertSesionActiva() {
  const correo = getCorreoUsuario();
  if (!correo) {
    throw new Error("No hay sesión activa. Vuelva a ingresar con su cuenta Google.");
  }
  return correo;
}

function assertCorreoInstitucional(correo) {
  correo = (correo || assertSesionActiva()).toLowerCase().trim();
  if (!esCorreoInstitucionalUtzmg(correo)) {
    throw new Error("Acceso restringido a cuentas institucionales " + SUFIJO_DOMINIO_INSTITUCIONAL + ".");
  }
  return correo;
}

/** Ejecutar una vez como admin tras crear el secreto en Firebase → Configuración → Secretos. */
function registrarFirebaseDbSecret(secreto) {
  assertUsuarioAdministrador();
  const s = secreto ? secreto.toString().trim() : "";
  if (s.length < 12) {
    throw new Error("Indique el Database secret de Firebase (mínimo 12 caracteres).");
  }
  PropertiesService.getScriptProperties().setProperty(PROPIEDAD_SECRETO_FIREBASE, s);
  Logger.log("FIREBASE_DB_SECRET registrado. Cierre lectura/escritura pública en reglas RTDB.");
  return "Secreto guardado. En Firebase RTDB → Reglas use: { \"rules\": { \".read\": false, \".write\": false } } "
    + "(solo la Web App con el secreto en propiedades podrá acceder).";
}

/** Siglas de matrícula / tira → nombre legible para el docente en el selector. */
const MAPA_NOMBRES_CARRERA = {
  "NTPA": "Paramédico",
  "NTSMF": "Sistemas de Manufactura Flexible",
  "NTDSM": "Desarrollo de Software Multiplataforma",
  "NTES": "Energía Solar",
  "NTM": "Mercadotecnia",
  "NTTU": "Turismo",
  "LPA": "Licenciatura en Protección Civil y Emergencias",
  "LTU": "Licenciatura en Gestión y Desarrollo Turístico",
  "NLNM": "Licenciatura en Negocios y Mercadotecnia",
  "LINM": "Licenciatura en Innovación de Negocios y Mercadotécnia",
  "NLPC": "Licenciatura en Protección Civil",
  "NITID": "Ingeniería en Tecnologías de la Información e Innovación Digital",
  "IMT": "Ingeniería en Mecatrónica",
  "IDGS": "Ingeniería en Desarrollo y Gestión de Software",
  "PA": "Paramédico",
  "SMF": "Sistemas de Manufactura Flexible",
  "DSM": "Desarrollo Sustentable y Medio Ambiente",
  "ES": "Energía Solar",
  "MER": "Mercadotecnia",
  "TUR": "Turismo",
  "LPCYE": "Licenciatura en Protección Civil y Emergencias",
  "LGYDT": "Licenciatura en Gestión y Desarrollo Turístico",
  "LNM": "Licenciatura en Negocios y Mercadotecnia",
  "ITIID": "Ingeniería en Tecnologías de la Información e Innovación Digital"
};

function obtenerNombreCarreraDesdeSigla(sigla) {
  const clave = sigla ? sigla.toString().trim().toUpperCase() : "";
  return MAPA_NOMBRES_CARRERA[clave] || clave;
}

/**
 * Grupos del dashboard admin: TSU (1.º–6.º) y nivel superior (7.º+) por línea curricular.
 * Siglas legado (IDGS, LINM, LPCYE, …) se reclasifican según grado y reglas institucionales.
 */
const ORDEN_SIGLAS_DASHBOARD_ADMIN = [
  "TSU_SMF", "ING_IMT", "TSU_DSM", "ING_NITID", "TSU_ES", "ING_EDS",
  "TSU_PA", "LIC_LPC", "TSU_TUR", "LIC_LTU", "TSU_MER", "LIC_LNM"
];

/** Sin grupos activos: no mostrar en gráficas del admin (siguen contando en matrícula total). */
const CLAVES_EXCLUIDAS_GRAFICAS_DASHBOARD = ["ING_EDS"];

function ordenSiglasDashboardVisibleGraficas(ordenCompleto) {
  ordenCompleto = ordenCompleto || ORDEN_SIGLAS_DASHBOARD_ADMIN;
  return ordenCompleto.filter(function (clave) {
    return CLAVES_EXCLUIDAS_GRAFICAS_DASHBOARD.indexOf(clave) === -1;
  });
}

function filtrarSeriesDashboardPorClavesVisibles(ordenCompleto, valoresPorIndice) {
  ordenCompleto = ordenCompleto || ORDEN_SIGLAS_DASHBOARD_ADMIN;
  const visibles = ordenSiglasDashboardVisibleGraficas(ordenCompleto);
  return visibles.map(function (clave) {
    const idx = ordenCompleto.indexOf(clave);
    return idx >= 0 && valoresPorIndice ? valoresPorIndice[idx] : 0;
  });
}

const ETIQUETA_CARRERA_DASHBOARD = {
  TSU_SMF: "TSU Sist. manufactura flexible",
  ING_IMT: "Ing. en Mecatrónica",
  TSU_DSM: "TSU Desarrollo software multiplataforma",
  ING_NITID: "Ing. TI e innovación digital",
  TSU_ES: "TSU Energía solar",
  ING_EDS: "Ing. Energía y desarrollo sostenible",
  TSU_PA: "TSU Paramédico",
  LIC_LPC: "Lic. en Protección civil",
  TSU_TUR: "TSU Turismo",
  LIC_LTU: "Lic. gestión y desarrollo turístico",
  TSU_MER: "TSU Mercadotecnia",
  LIC_LNM: "Lic. negocios y mercadotecnia"
};

function etiquetasCarreraDashboard(ordenClaves) {
  ordenClaves = ordenClaves || ORDEN_SIGLAS_DASHBOARD_ADMIN;
  return ordenClaves.map(function (clave) {
    return ETIQUETA_CARRERA_DASHBOARD[clave] || clave;
  });
}

function obtenerGradoNumericoEstudiante(est) {
  if (!est) return -1;
  let g = est.Grado_Actual || est.grado_actual || est.Grado || "";
  let n = parseInt(g.toString().trim(), 10);
  if (!isNaN(n) && n > 0) return n;
  const gc = (est.grupo_completo || est.Grupo_Completo || "").toString().trim();
  const m = gc.match(/^(\d+)/);
  if (m) return parseInt(m[1], 10);
  return -1;
}

function esGradoTsuDashboard(grado) {
  return grado >= 1 && grado <= 6;
}

function esGradoSuperiorDashboard(grado) {
  return grado >= 7;
}

function resolverClaveGrupoCarreraDashboard(estudiante, siglaExtra, textoCarreraExtra) {
  let sigla = (siglaExtra || "").toString().trim().toUpperCase();
  if (!sigla && estudiante) {
    sigla = (estudiante.cve_carrera || estudiante.CVE_CARRERA || "").toString().trim().toUpperCase();
  }
  if (!sigla && estudiante) {
    sigla = extraerSiglaDesdeGrupoCompletoDashboard(estudiante.grupo_completo || estudiante.Grupo_Completo);
  }
  const grado = obtenerGradoNumericoEstudiante(estudiante);

  if (sigla === "IDGS" || sigla === "NITID" || sigla === "ITIID") {
    return "ING_NITID";
  }
  if (sigla === "NTSMF" || sigla === "SMF") return "TSU_SMF";
  if (sigla === "IMT") return "ING_IMT";
  if (sigla === "NTDSM" || sigla === "DSM") return "TSU_DSM";
  if (sigla === "NTES") return "TSU_ES";
  if (sigla === "ES") {
    if (esGradoTsuDashboard(grado)) return "TSU_ES";
    return "ING_EDS";
  }
  if (sigla === "NTPA" || sigla === "PA") return "TSU_PA";
  if (sigla === "LPA" || sigla === "NLPC" || sigla === "LPCYE" || sigla === "LPC") return "LIC_LPC";
  if (sigla === "NTTU" || sigla === "TUR") return "TSU_TUR";
  if (sigla === "LTU" || sigla === "LGYDT") return "LIC_LTU";
  if (sigla === "NTM" || sigla === "MER") return "TSU_MER";
  if (sigla === "NLNM" || sigla === "LNM" || sigla === "LINM") return "LIC_LNM";

  let carTexto = textoCarreraExtra ? textoCarreraExtra.toString().trim() : "";
  if (!carTexto && estudiante && estudiante.carrera) {
    carTexto = estudiante.carrera.toString().trim();
  }
  if (carTexto) {
    const t = carTexto.toUpperCase();
    if (t.includes("MECATRÓNICA") || t.includes("MECATRONICA")) return "ING_IMT";
    if (t.includes("MANUFACTURA") || t.includes("MANTENIMIENTO")) return "TSU_SMF";
    if (t.includes("MULTIPLATAFORMA")) return "TSU_DSM";
    if (t.includes("INNOVACIÓN DIGITAL") || t.includes("INNOVACION DIGITAL") || t.includes("TECNOLOGÍAS DE LA INFORMACIÓN")) return "ING_NITID";
    if (t.includes("GESTIÓN Y DESARROLLO DE SOFTWARE")) return "ING_NITID";
    if (t.includes("ENERGÍA SOLAR") || t.includes("ENERGIA SOLAR")) {
      return esGradoSuperiorDashboard(grado) ? "ING_EDS" : "TSU_ES";
    }
    if (t.includes("DESARROLLO SOSTENIBLE") || t.includes("SUSTENTABLE")) return "ING_EDS";
    if (t.includes("PARAMÉDICO") || t.includes("PARAMEDICO")) return "TSU_PA";
    if (t.includes("PROTECCIÓN CIVIL") || t.includes("PROTECCION CIVIL") || t.includes("EMERGENCIAS")) return "LIC_LPC";
    if (t.includes("TURISMO") && !t.includes("GESTIÓN")) return "TSU_TUR";
    if (t.includes("GESTIÓN Y DESARROLLO TURÍSTICO") || t.includes("DESARROLLO TURÍSTICO")) return "LIC_LTU";
    if (t.includes("INNOVACIÓN DE NEGOCIOS") || t.includes("NEGOCIOS Y MERCADOTECNIA")) return "LIC_LNM";
    if (t.includes("MERCADOTECNIA")) return esGradoSuperiorDashboard(grado) ? "LIC_LNM" : "TSU_MER";
  }
  return "";
}

function indiceDesdeClaveGrupoCarreraDashboard(claveGrupo, ordenClaves) {
  ordenClaves = ordenClaves || ORDEN_SIGLAS_DASHBOARD_ADMIN;
  if (!claveGrupo) return -1;
  return ordenClaves.indexOf(claveGrupo);
}

function extraerSiglaDesdeGrupoCompletoDashboard(grupoCompleto) {
  if (!grupoCompleto) return "";
  const partes = grupoCompleto.toString().trim().split(/\s+/);
  if (partes.length < 2) return "";
  return partes[partes.length - 1].toUpperCase();
}

function cargarEstudiantesFirebase(urlBase) {
  urlBase = urlBase || URL_BASE_FIREBASE;
  try {
    const res = fetchFirebasePath("Estudiantes.json", { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return {};
    const data = JSON.parse(res.getContentText());
    return (data && typeof data === "object" && !Array.isArray(data)) ? data : {};
  } catch (e) {
    Logger.log("cargarEstudiantesFirebase: " + e.message);
    return {};
  }
}

function resolverIndiceCarreraDashboard(estudiante, ordenClaves, textoCarreraExtra) {
  ordenClaves = ordenClaves || ORDEN_SIGLAS_DASHBOARD_ADMIN;
  const clave = resolverClaveGrupoCarreraDashboard(estudiante, null, textoCarreraExtra);
  return indiceDesdeClaveGrupoCarreraDashboard(clave, ordenClaves);
}

/** Nombre completo de carrera para actas (catálogo de alumnos o mapa de siglas del grupo). */
function resolverNombreCarreraActa(grupoCompleto, siglaFallback) {
  const grupo = grupoCompleto ? grupoCompleto.toString().trim() : "";
  const alumnos = grupo ? getAlumnosPorGrupoSinAuth(grupo) : [];
  for (let i = 0; i < alumnos.length; i++) {
    const nombre = alumnos[i].carrera ? alumnos[i].carrera.toString().trim() : "";
    if (nombre.length > 3) return nombre;
  }
  let sigla = siglaFallback ? siglaFallback.toString().trim().toUpperCase() : "";
  if (!sigla && grupo.includes(" ")) {
    const partes = grupo.split(/\s+/);
    sigla = partes[partes.length - 1].toUpperCase();
  }
  return obtenerNombreCarreraDesdeSigla(sigla);
}

/** Ej: "01A NTPA" → "01A — Paramédico" (solo para mostrar en interfaz). */
function formatearGrupoParaMostrarDocente(grupoCompleto) {
  if (!grupoCompleto) return "";
  const texto = grupoCompleto.toString().trim();
  const ultimoEspacio = texto.lastIndexOf(" ");
  if (ultimoEspacio <= 0) return texto;
  const prefijoGrupo = texto.substring(0, ultimoEspacio);
  const sigla = texto.substring(ultimoEspacio + 1);
  return prefijoGrupo + " — " + obtenerNombreCarreraDesdeSigla(sigla);
}

function obtenerNodoDocentesFirebase(opciones) {
  const usarCache = !(opciones && opciones.sinCache === true);
  if (usarCache) {
    const data = cargarJsonFirebasePathConCache("Docentes.json", "fb_Docentes_v1", CACHE_FIREBASE_TTL_SEC);
    if (data) return data;
  }
  const respuesta = fetchFirebasePath("Docentes.json", { muteHttpExceptions: true });
  var code = respuesta.getResponseCode();
  if (code !== 200) {
    Logger.log("obtenerNodoDocentesFirebase HTTP " + code);
    var respaldoCache = leerCacheFirebaseJson("fb_Docentes_v1");
    if (respaldoCache && Object.keys(respaldoCache).length > 0) {
      return respaldoCache;
    }
    return {};
  }
  const parsed = JSON.parse(respuesta.getContentText() || "{}") || {};
  guardarCacheFirebaseJson("fb_Docentes_v1", parsed, CACHE_FIREBASE_TTL_SEC);
  return parsed;
}

function normalizarCorreoLoginDocente(valor) {
  return (valor || "")
    .toString()
    .normalize("NFKC")
    .toLowerCase()
    .trim()
    .replace(/\u200b/g, "")
    .replace(/\u00a0/g, "")
    .replace(/\uff20/g, "@")
    .replace(/\s+/g, "");
}

/** Misma regla que generar_catalogos_2026s.py → firebase_key_from_email. */
function claveDocenteFirebaseDesdeCorreo_(correo) {
  return normalizarCorreoLoginDocente(correo).replace(/[\.\#\$\[\]\s]/g, "_");
}

/** Infiere correo desde la llave RTDB (p. ej. jguerrero@utzmg_edu_mx). */
function correoDesdeLlaveDocenteFirebase_(llaveFirebase) {
  var k = (llaveFirebase || "").toString().toLowerCase().trim();
  var m = k.match(/^(.+)@utzmg_edu_mx$/);
  if (m) {
    var local = m[1].replace(/_/g, ".");
    if (local) return local + "@utzmg.edu.mx";
  }
  if (/^[a-z0-9._-]+@utzmg\.edu\.mx$/i.test(k)) {
    return normalizarCorreoLoginDocente(k);
  }
  return "";
}

/** Correos con los que puede iniciar sesión un registro de docente. */
function listarCorreosLoginDocente(docente, llaveFirebase) {
  const lista = [];
  if (!docente) return lista;
  function agregar(c) {
    c = normalizarCorreoLoginDocente(c);
    if (c && c.indexOf("@") !== -1 && lista.indexOf(c) === -1) lista.push(c);
  }
  agregar(docente.CORREO);
  agregar(docente.correo);
  agregar(docente.CORREO_ORIGINAL);
  agregar(docente.correo_original);
  if (docente.correos_alternos && Array.isArray(docente.correos_alternos)) {
    docente.correos_alternos.forEach(agregar);
  }
  agregar(correoDesdeLlaveDocenteFirebase_(llaveFirebase));
  return lista;
}

function buscarDocentePorCorreo(todosLosDocentes, correoUsuario) {
  if (!todosLosDocentes) return null;
  correoUsuario = normalizarCorreoLoginDocente(correoUsuario);
  if (!correoUsuario) return null;

  var claveDirecta = claveDocenteFirebaseDesdeCorreo_(correoUsuario);
  if (claveDirecta) {
    var porClave = todosLosDocentes[claveDirecta];
    if (porClave && typeof porClave === "object") return porClave;
  }

  for (let id in todosLosDocentes) {
    let docente = todosLosDocentes[id];
    if (!docente || typeof docente !== "object") continue;
    let correos = listarCorreosLoginDocente(docente, id);
    if (correos.length === 0) continue;
    for (let i = 0; i < correos.length; i++) {
      if (correos[i] === correoUsuario) return docente;
    }
  }
  return null;
}

/** Para diagnóstico admin: códigos de caracteres del CORREO en Firebase (detecta pegados raros). */
function describirCorreoParaDiagnostico_(valor) {
  var s = (valor == null ? "" : String(valor));
  var norm = normalizarCorreoLoginDocente(s);
  var codes = [];
  for (var i = 0; i < s.length && i < 80; i++) {
    codes.push(s.charCodeAt(i));
  }
  return { raw: s, normalizado: norm, charCodes: codes };
}

/** Soporta modelo nuevo (asignaciones[]) y legado (GRUPO/ASIGNATURA por registro). */
function extraerAsignacionesDeDocente(docente) {
  if (!docente) return [];
  if (docente.asignaciones && Array.isArray(docente.asignaciones)) {
    return docente.asignaciones.map(function(a) {
      return {
        grupo: a.grupo ? a.grupo.toString().trim() : "",
        materia: (a.asignatura || a.materia || a.ASIGNATURA || "").toString().trim(),
        clave_materia: (a.clave_materia || a.CLAVE_MATERIA || "").toString().trim()
      };
    }).filter(function(a) { return a.grupo && a.materia; });
  }
  if (docente.GRUPO || docente.ASIGNATURA) {
    return [{
      grupo: docente.GRUPO ? docente.GRUPO.toString().trim() : "",
      materia: docente.ASIGNATURA ? docente.ASIGNATURA.toString().trim() : ""
    }];
  }
  return [];
}

function iterarAsignacionesDocentesNodo(docentes, callback) {
  for (let llave in docentes) {
    let d = docentes[llave];
    if (!d || !d.CORREO) continue;
    let correoKey = d.CORREO.toString().trim().toLowerCase();
    let nombre = d.PROFESOR || "Docente";
    let asignaciones = extraerAsignacionesDeDocente(d);
    if (asignaciones.length === 0) continue;
    asignaciones.forEach(function(asig) {
      callback(correoKey, nombre, asig.grupo, asig.materia);
    });
  }
}

// 3. OBTENER DATOS DEL DOCENTE RECORRIENDO LA COLECCIÓN
function getDatosDocente() {
  assertCorreoInstitucional();
  const correoUsuario = getCorreoUsuario();
  let nombreDocente = "";

  try {
    const todosLosDocentes = obtenerNodoDocentesFirebase({ sinCache: true });
    const docente = buscarDocentePorCorreo(todosLosDocentes, correoUsuario);
    if (docente && docente.PROFESOR) {
      nombreDocente = docente.PROFESOR.toString().trim();
    }
  } catch (e) {
    Logger.log("Error al traer docente de Firebase: " + e.message);
  }

  if (!nombreDocente) {
    nombreDocente = correoUsuario.split("@")[0].replace(/\./g, " ").toUpperCase();
  }

  return {
    correo: correoUsuario,
    nombre: nombreDocente
  };
}

// 4. OBTENER LAS MATERIAS Y GRUPOS ASIGNADOS AL DOCENTE DESDE FIREBASE
function getAsignacionesDocente() {
  assertCorreoInstitucional();
  const correoDocente = getCorreoUsuario();
  let asignaciones = [];

  try {
    const todosLosDocentes = obtenerNodoDocentesFirebase({ sinCache: true });
    const docente = buscarDocentePorCorreo(todosLosDocentes, correoDocente);
    asignaciones = extraerAsignacionesDeDocente(docente).map(function(a) {
      return {
        grupo: a.grupo,
        materia: a.materia,
        grupoMostrar: formatearGrupoParaMostrarDocente(a.grupo)
      };
    });
  } catch (e) {
    Logger.log("Error al traer asignaciones de Firebase: " + e.message);
  }

  return asignaciones;
}

// 5. UNIDADES POR ASIGNATURA (configuradas por el docente según Programa de Asignatura)
/** Firebase RTDB no permite . # $ [ ] / en segmentos de ruta (p. ej. correos con puntos). */
function sanitizarSegmentoRutaFirebase(valor) {
  return valor.toString().trim().replace(/[\.\#\$\[\]\/]/g, "_");
}

function construirRutaConfigUnidades(grupo, materia, correo) {
  const g = sanitizarSegmentoRutaFirebase(grupo.toString().trim().toUpperCase());
  const m = sanitizarSegmentoRutaFirebase(materia.toString().trim().toUpperCase());
  const c = sanitizarSegmentoRutaFirebase((correo || getCorreoUsuario()).toLowerCase().trim());
  return URL_BASE_FIREBASE + "CONFIG_UNIDADES/" + g + "/" + m + "/" + c + ".json";
}

function getConfigUnidadesAsignacion(grupo, materia) {
  try {
    const resp = fetchFirebaseUrl(construirRutaConfigUnidades(grupo, materia, getCorreoUsuario()));
    const cfg = JSON.parse(resp.getContentText());
    if (!cfg || !cfg.totalUnidades) return null;
    return {
      totalUnidades: parseInt(cfg.totalUnidades, 10),
      fechaRegistro: cfg.fechaRegistro || ""
    };
  } catch (e) {
    return null;
  }
}

function guardarConfigUnidadesAsignacion(grupo, materia, totalUnidades) {
  assertCorreoInstitucional();
  assertDocenteAsignadoGrupoMateria(grupo, materia);
  if (obtenerEstadoBloqueo()) {
    throw new Error("El periodo de captura ha finalizado. No se puede modificar la configuración de unidades.");
  }
  const total = parseInt(totalUnidades, 10);
  if (isNaN(total) || total < 1 || total > 12) {
    throw new Error("Indique un número de unidades válido (entre 1 y 12).");
  }

  const cfgAnterior = getConfigUnidadesAsignacion(grupo, materia);
  if (cfgAnterior && total < cfgAnterior.totalUnidades) {
    const hayNotasFuera = existeCapturaEnUnidadesSuperiores(grupo, materia, total);
    if (hayNotasFuera) {
      throw new Error("No puede reducir las unidades: ya existen calificaciones guardadas en unidades que quedarían fuera del rango.");
    }
  }

  const payload = {
    totalUnidades: total,
    fechaRegistro: new Date().toISOString(),
    correo: getCorreoUsuario(),
    grupo: grupo.toString().trim().toUpperCase(),
    materia: materia.toString().trim()
  };

  fetchFirebaseUrl(construirRutaConfigUnidades(grupo, materia, getCorreoUsuario()), {
    method: "put",
    contentType: "application/json",
    payload: JSON.stringify(payload)
  });

  return getPeriodosPorAsignacion(grupo, materia);
}

function getPeriodosPorAsignacion(grupo, materia) {
  const cfg = getConfigUnidadesAsignacion(grupo, materia);
  if (!cfg) return { configurado: false, periodos: [], totalUnidades: 0 };
  let periodos = [];
  for (let i = 1; i <= cfg.totalUnidades; i++) {
    periodos.push({ nombre: "U" + i, estado: "HABILITADO" });
  }
  return { configurado: true, periodos: periodos, totalUnidades: cfg.totalUnidades };
}

/** Compatibilidad: ya no hay 7 unidades fijas globales. */
function getPeriodosConfig() {
  return [];
}

function existeCapturaEnUnidadesSuperiores(grupo, materia, totalPermitido) {
  const infoGrupo = grupo.toString().trim().toUpperCase();
  const infoMateria = materia.toString().trim().toUpperCase();
  const urlBase = URL_BASE_FIREBASE + "CALIFICACIONES/"
    + encodeURIComponent(infoGrupo) + "/" + encodeURIComponent(infoMateria) + "/";
  try {
    const resp = fetchFirebaseUrl(urlBase + ".json");
    const unidades = JSON.parse(resp.getContentText()) || {};
    for (let u in unidades) {
      let num = parseInt(u.toString().replace(/^U/i, ""), 10);
      if (!isNaN(num) && num > totalPermitido && unidades[u] && Object.keys(unidades[u]).length > 0) {
        return true;
      }
    }
  } catch (e) {
    Logger.log("existeCapturaEnUnidadesSuperiores: " + e.message);
  }
  return false;
}

function normalizarCalificacionNumerica(raw) {
  if (raw === null || raw === undefined) return null;
  let t = raw.toString().trim().toUpperCase();
  if (t === "" ) return null;
  if (t === "NA") return 6;
  if (t === "6" || t === "6.0") return 6;
  let n = parseFloat(t);
  if (isNaN(n)) return null;
  return n;
}

function inferirGradoSemestreGrupo(grupoCompleto, alumnos) {
  if (alumnos && alumnos.length) {
    for (let i = 0; i < alumnos.length; i++) {
      if (alumnos[i].grado_actual !== undefined && alumnos[i].grado_actual !== null && alumnos[i].grado_actual !== "") {
        let g = parseInt(alumnos[i].grado_actual, 10);
        if (!isNaN(g)) return g;
      }
    }
  }
  let t = grupoCompleto ? grupoCompleto.toString().trim() : "";
  let m = t.match(/^(\d{1,2})/);
  if (m) return parseInt(m[1], 10);
  return null;
}

function esModeloEvaluacionNuevo(grado) {
  if (grado === null || grado === undefined || isNaN(grado)) return false;
  return grado >= 1 && grado <= 7;
}

function obtenerModeloEvaluacionGrupo(grupoCompleto) {
  const alumnos = getAlumnosPorGrupoSinAuth(grupoCompleto);
  const grado = inferirGradoSemestreGrupo(grupoCompleto, alumnos);
  return {
    grado: grado,
    modelo: esModeloEvaluacionNuevo(grado) ? "NUEVO" : "ANTERIOR",
    etiqueta: esModeloEvaluacionNuevo(grado)
      ? "Modelo nuevo (1.° a 7.° cuatrimestre)"
      : "Modelo anterior (8.° cuatrimestre en adelante)"
  };
}

/** Modelo de evaluación según el grado del estudiante (portal alumno). */
function obtenerModeloEvaluacionEstudiante(est) {
  const grado = obtenerGradoNumericoEstudiante(est);
  const nuevo = esModeloEvaluacionNuevo(grado);
  return {
    grado: grado,
    modelo: nuevo ? "NUEVO" : "ANTERIOR",
    etiqueta: nuevo
      ? "Modelo nuevo (1.° a 7.° cuatrimestre)"
      : "Modelo anterior (8.° cuatrimestre en adelante)"
  };
}

function resolverNombreCarreraEstudiante(est) {
  if (!est) return "";
  const car = (est.carrera || "").toString().trim();
  if (car.length > 3) return car;
  return resolverNombreCarreraActa(est.grupo_completo || "", est.cve_carrera || "");
}

/** true si la calificación de una unidad implica no acreditada (acta de integración). */
function esCalificacionUnidadReprobada(notaRaw, modelo) {
  if (notaRaw === null || notaRaw === undefined) return false;
  let t = notaRaw.toString().trim().toUpperCase();
  if (t === "") return false;

  if (modelo === "NUEVO") {
    if (t === "NA" || t === "6" || t === "6.0") return true;
    let n = parseFloat(t);
    return !isNaN(n) && n < 7;
  }

  if (t === "NA") return true;
  let nAnt = parseFloat(t);
  if (isNaN(nAnt)) return false;
  return nAnt < 8;
}

function resultadoIntegracionAlumno(notasPorUnidad, modelo) {
  let suma = 0;
  let conteo = 0;
  let tieneReprobada = false;

  notasPorUnidad.forEach(function(notaRaw) {
    if (notaRaw === null || notaRaw === undefined || notaRaw.toString().trim() === "") return;
    if (esCalificacionUnidadReprobada(notaRaw, modelo)) tieneReprobada = true;
    let n = normalizarCalificacionNumerica(notaRaw);
    if (n !== null) {
      suma += n;
      conteo++;
    }
  });

  if (tieneReprobada) {
    if (modelo === "NUEVO") {
      return { numerico: "6.0", alfabetico: "Preformal" };
    }
    return { numerico: "NA", alfabetico: "No aprobado" };
  }

  if (conteo === 0) return { numerico: "", alfabetico: "" };
  let promedio = (suma / conteo).toFixed(1);
  return escalaAlfabeticaDesdeNota(promedio, modelo);
}

function formatearNotaNumericaActa(notaRaw) {
  let t = notaRaw === null || notaRaw === undefined ? "" : notaRaw.toString().trim();
  if (t === "") return "";
  if (t.toUpperCase() === "NA") return "6";
  let n = parseFloat(t);
  if (isNaN(n)) return t;
  if (n >= 10) return "10";
  if (n <= 6) return n % 1 === 0 ? String(Math.round(n)) : n.toFixed(1);
  return n.toFixed(1);
}

function escalaAlfabeticaNuevoDesdeNumero(n) {
  if (isNaN(n)) return "—";
  if (n < 7) return "Preformal";
  if (n < 8) return "Receptivo (R)";
  if (n < 9) return "Básico (B)";
  if (n < 10) return "Autónomo (A)";
  return "Estratégico (E)";
}

/** Escala alfabética para actas según modelo educativo del grupo. */
function escalaAlfabeticaDesdeNota(notaRaw, modelo) {
  let t = notaRaw === null || notaRaw === undefined ? "" : notaRaw.toString().trim().toUpperCase();
  if (t === "") return { numerico: "", alfabetico: "" };

  if (modelo === "NUEVO") {
    if (t === "NA") {
      return { numerico: "6", alfabetico: "Preformal" };
    }
    let n = parseFloat(t);
    if (isNaN(n)) return { numerico: t, alfabetico: "—" };
    return {
      numerico: formatearNotaNumericaActa(n),
      alfabetico: escalaAlfabeticaNuevoDesdeNumero(n)
    };
  }

  if (t === "NA") return { numerico: "NA", alfabetico: "No aprobado" };
  let nAnt = parseFloat(t);
  if (isNaN(nAnt)) return { numerico: t, alfabetico: "—" };
  let entAnt = Math.round(nAnt);
  if (entAnt <= 6) return { numerico: "NA", alfabetico: "No aprobado" };
  if (entAnt === 8) return { numerico: "8", alfabetico: "Satisfactorio" };
  if (entAnt === 9) return { numerico: "9", alfabetico: "Destacado" };
  if (entAnt >= 10) return { numerico: "10", alfabetico: "Autónomo" };
  return { numerico: String(entAnt), alfabetico: "—" };
}

function getCuatrimestreActivo() {
  try {
    const cfg = cargarJsonFirebasePathConCache("CONFIG.json", "fb_CONFIG", 300);
    if (cfg) {
      if (cfg.cuatrimestre) return cfg.cuatrimestre.toString().trim().toUpperCase();
      if (cfg.ciclo_activo) return cfg.ciclo_activo.toString().trim().toUpperCase();
    }
  } catch (e) {
    Logger.log("getCuatrimestreActivo: " + e.message);
  }
  return "2026S";
}

function construirUrlCalificacionesUnidad(grupo, materia, unidad) {
  const infoGrupo = grupo.toString().trim().toUpperCase();
  const infoMateria = materia.toString().trim().toUpperCase();
  const infoUnidad = unidad.toString().trim().toUpperCase();
  return URL_BASE_FIREBASE + "CALIFICACIONES/"
    + encodeURIComponent(infoGrupo) + "/"
    + encodeURIComponent(infoMateria) + "/"
    + infoUnidad + "/";
}

function normalizarEstadoCaptura(valor) {
  if (valor === null || valor === undefined) return null;
  let t = valor.toString().trim().toUpperCase();
  if (t === "DEFINITIVO" || t === "DEFINITIVA") return "DEFINITIVO";
  if (t === "TEMPORAL") return "TEMPORAL";
  return null;
}

function inferirEstadoCapturaDesdeNodoUnidad(notasUnidad) {
  if (!notasUnidad || typeof notasUnidad !== "object") return null;
  if (notasUnidad._meta && notasUnidad._meta.estado_captura) {
    let desdeMeta = normalizarEstadoCaptura(notasUnidad._meta.estado_captura);
    if (desdeMeta) return desdeMeta;
  }
  let totalRegistros = 0;
  let conteoDefinitivo = 0;
  let conteoTemporal = 0;
  for (let matricula in notasUnidad) {
    if (matricula === "_meta") continue;
    let rec = notasUnidad[matricula];
    if (!rec || rec.calificacion === undefined || rec.calificacion === null) continue;
    if (rec.calificacion.toString().trim() === "") continue;
    totalRegistros++;
    let est = normalizarEstadoCaptura(rec.estado_captura);
    if (est === "DEFINITIVO") conteoDefinitivo++;
    if (est === "TEMPORAL") conteoTemporal++;
  }
  if (totalRegistros > 0 && conteoDefinitivo === totalRegistros) return "DEFINITIVO";
  if (conteoTemporal > 0) return "TEMPORAL";
  if (conteoDefinitivo > 0) return "DEFINITIVO";
  return null;
}

function obtenerMetaUnidadCaptura(grupo, materia, unidad) {
  const urlMeta = construirUrlCalificacionesUnidad(grupo, materia, unidad) + "_meta.json";
  try {
    const resp = fetchFirebaseUrl(urlMeta, { muteHttpExceptions: true });
    if (resp.getResponseCode() !== 200) {
      return { estado_captura: null, cuatrimestre: getCuatrimestreActivo() };
    }
    const meta = JSON.parse(resp.getContentText());
    if (!meta) return { estado_captura: null, cuatrimestre: getCuatrimestreActivo() };
    return {
      estado_captura: normalizarEstadoCaptura(meta.estado_captura),
      fecha_registro: meta.fecha_registro || "",
      docente: meta.docente || "",
      cuatrimestre: meta.cuatrimestre || getCuatrimestreActivo()
    };
  } catch (e) {
    return { estado_captura: null, cuatrimestre: getCuatrimestreActivo() };
  }
}

function getEstadoUnidadCaptura(grupo, materia, unidad) {
  assertDocenteAsignadoGrupoMateria(grupo, materia);
  return obtenerMetaUnidadCaptura(grupo, materia, unidad);
}

function unidadTieneCalificacionesCompletas(grupo, materia, unidad, alumnos) {
  const notas = obtenerCalificacionesExistentes(grupo, materia, unidad);
  for (let a = 0; a < alumnos.length; a++) {
    let mat = alumnos[a].matricula.toString();
    let val = notas[mat];
    if (val === undefined || val === null || val.toString().trim() === "") {
      return false;
    }
  }
  return true;
}

function evaluarEstadoActaIntegracion(grupo, materia) {
  assertDocenteAsignadoGrupoMateria(grupo, materia);
  const cfg = getConfigUnidadesAsignacion(grupo, materia);
  if (!cfg) {
    return { habilitada: false, motivo: "Configure primero el número de unidades de la materia.", totalUnidades: 0 };
  }

  const alumnos = getAlumnosPorGrupo(grupo);
  if (!alumnos.length) {
    return { habilitada: false, motivo: "No hay alumnos en este grupo.", totalUnidades: cfg.totalUnidades };
  }

  let unidadesCompletas = 0;
  let unidadesDefinitivas = 0;
  for (let i = 1; i <= cfg.totalUnidades; i++) {
    const unidad = "U" + i;
    const completa = unidadTieneCalificacionesCompletas(grupo, materia, unidad, alumnos);
    if (completa) unidadesCompletas++;
    const meta = obtenerMetaUnidadCaptura(grupo, materia, unidad);
    if (completa && meta.estado_captura === "DEFINITIVO") {
      unidadesDefinitivas++;
    }
  }

  const habilitada = unidadesDefinitivas === cfg.totalUnidades;
  let motivo = "";
  if (unidadesCompletas < cfg.totalUnidades) {
    motivo = "Complete y guarde las calificaciones de todas las unidades (" + unidadesCompletas + "/" + cfg.totalUnidades + ").";
  } else if (unidadesDefinitivas < cfg.totalUnidades) {
    motivo = "Debe usar «Guardar definitivo» en cada unidad (" + unidadesDefinitivas + "/" + cfg.totalUnidades + " definitivas).";
  } else {
    motivo = "Todas las unidades están guardadas de forma definitiva.";
  }

  return {
    habilitada: habilitada,
    totalUnidades: cfg.totalUnidades,
    unidadesCompletas: unidadesCompletas,
    unidadesDefinitivas: unidadesDefinitivas,
    motivo: motivo
  };
}

function obtenerDatosActaIntegracion(grupo, materia) {
  if (obtenerEstadoBloqueo()) {
    return { exito: false, error: "El periodo de captura ha finalizado." };
  }
  assertDocenteAsignadoGrupoMateria(grupo, materia);
  const estado = evaluarEstadoActaIntegracion(grupo, materia);
  if (!estado.habilitada) {
    return { exito: false, error: estado.motivo };
  }

  const cfg = getConfigUnidadesAsignacion(grupo, materia);
  const alumnos = getAlumnosPorGrupo(grupo);
  const datosDocente = getDatosDocente();
  const infoModelo = obtenerModeloEvaluacionGrupo(grupo);
  let filasAlumnos = [];

  alumnos.forEach(function(alumno, index) {
    let notasUnidades = [];
    for (let i = 1; i <= cfg.totalUnidades; i++) {
      let notas = obtenerCalificacionesExistentes(grupo, materia, "U" + i);
      notasUnidades.push(notas[alumno.matricula]);
    }
    const resultado = resultadoIntegracionAlumno(notasUnidades, infoModelo.modelo);
    filasAlumnos.push([
      index + 1,
      alumno.matricula,
      alumno.nombre,
      resultado.numerico,
      resultado.alfabetico
    ]);
  });

  const infoModeloActa = obtenerModeloEvaluacionGrupo(grupo);
  return {
    exito: true,
    filas: filasAlumnos,
    nombreProfesor: datosDocente.nombre,
    totalUnidades: cfg.totalUnidades,
    cuatrimestre: getCuatrimestreActivo(),
    estadoCaptura: "DEFINITIVO",
    nombreCarrera: resolverNombreCarreraActa(grupo, ""),
    modeloEvaluacion: infoModeloActa.modelo,
    modeloEvaluacionEtiqueta: infoModeloActa.etiqueta
  };
}

// 6. OBTENER ESTUDIENTES FILTRADOS POR GRUPO COMPLETADO
/*function getAlumnosPorGrupo(grupoSolicitado) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hojaEstudiantes = ss.getSheetByName("ESTUDIANTES");
  const datosAlumnos = hojaEstudiantes.getDataRange().getValues();
  
  let alumnosFiltrados = [];
  
  for (let i = 1; i < datosAlumnos.length; i++) {
    let fila = datosAlumnos[i];
    let grupoCompletoAlumno = fila[7] ? fila[7].toString().trim() : "";
    
    if (grupoCompletoAlumno === grupoSolicitado.trim()) {
      let nombreCarreraLargo = fila[2] ? fila[2].toString().trim() : ""; 
      
      // Respaldo: Si el nombre largo falló o estaba vacío, buscamos en la columna de las siglas (ejemplo columna E / fila[4])
      if (nombreCarreraLargo === "" && fila[3]) {
        nombreCarreraLargo = fila[4].toString().trim();
      }

      alumnosFiltrados.push({
        matricula: fila[0] ? fila[0].toString() : "",
        nombre: fila[1] ? fila[1].toString() : "",
        carrera: nombreCarreraLargo // Enviamos el texto completo de la carrera al frontend
      });
    }
  }
  return alumnosFiltrados.sort((a, b) => a.nombre.localeCompare(b.nombre));
}*/


// 6. OBTENER ESTUDIANTES FILTRADOS POR GRUPO DESDE FIREBASE (ESTRUCTURA DETECTADA)
function getAlumnosPorGrupoSinAuth(grupoSolicitado) {
  const urlFirebase = "https://control-escolar-eaf63-default-rtdb.firebaseio.com/Estudiantes.json";
  let alumnosFiltrados = [];
  
  try {
    const respuesta = fetchFirebaseUrl(urlFirebase);
    const todosLosAlumnos = JSON.parse(respuesta.getContentText());
    
    if (todosLosAlumnos) {
      for (let id in todosLosAlumnos) {
        let alumnoObj = todosLosAlumnos[id];
        if (!alumnoObj) continue; // Protección contra huecos vacíos
        
        // 🔎 Leemos la clave exacta que vimos en tu captura: 'grupo_completo'
        let grupoAlumno = alumnoObj.grupo_completo ? alumnoObj.grupo_completo.toString().trim() : "";
        
        // Si el grupo del estudiante coincide con el que pide el profesor
        if (grupoAlumno.toUpperCase() === grupoSolicitado.trim().toUpperCase()) {
          
          alumnosFiltrados.push({
            matricula: alumnoObj.matricula ? alumnoObj.matricula.toString().trim() : id,
            nombre: alumnoObj.alumno ? alumnoObj.alumno.toString().trim() : "Sin Nombre",
            carrera: alumnoObj.carrera ? alumnoObj.carrera.toString().trim() : "",
            grado_actual: alumnoObj.Grado_Actual !== undefined && alumnoObj.Grado_Actual !== null
              ? parseInt(alumnoObj.Grado_Actual, 10) : null
          });
        }
      }
    }
  } catch(e) {
    Logger.log("Error al traer alumnos de Firebase: " + e.message);
  }
  
  // Ordenar alfabéticamente por nombre
  return alumnosFiltrados.sort((a, b) => a.nombre.localeCompare(b.nombre));
}

function getAlumnosPorGrupo(grupoSolicitado) {
  assertDocenteAsignadoGrupo(grupoSolicitado);
  return getAlumnosPorGrupoSinAuth(grupoSolicitado);
}

// EXTRA: LEER CALIFICACIONES PARA COLOCARLAS EN LA VISTA
/*function obtenerCalificacionesExistentes(grupo, materia, periodo) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hoja = ss.getSheetByName("CALIFICACIONES");
  if (!hoja) return {};
  
  const datos = hoja.getDataRange().getValues();
  let mapaCalificaciones = {};
  
  for (let i = 1; i < datos.length; i++) {
    let fMatricula = datos[i][0] ? datos[i][0].toString().trim() : "";
    let fGrupo = datos[i][2] ? datos[i][2].toString().trim() : "";
    let fMateria = datos[i][3] ? datos[i][3].toString().trim() : "";
    let fPeriodo = datos[i][5] ? datos[i][5].toString().trim() : "";
    let fNota = datos[i][7];
    
    if (fGrupo === grupo.trim() && fMateria === materia.trim() && fPeriodo === periodo.trim()) {
      mapaCalificaciones[fMatricula] = fNota;
    }
  }
  return mapaCalificaciones;
}*/
function leerCalificacionesYEstadoUnidad(grupo, materia, periodo) {
  let mapaCalificaciones = {};
  let estadoCaptura = null;

  const infoGrupo = grupo.toString().trim().toUpperCase();
  const infoMateria = materia.toString().trim().toUpperCase();
  const infoPeriodo = periodo.toString().trim().toUpperCase();

  const urlFirebase = "https://control-escolar-eaf63-default-rtdb.firebaseio.com/CALIFICACIONES/"
    + encodeURIComponent(infoGrupo) + "/"
    + encodeURIComponent(infoMateria) + "/"
    + infoPeriodo + ".json";

  try {
    const respuesta = fetchFirebaseUrl(urlFirebase, { muteHttpExceptions: true });
    if (respuesta.getResponseCode() === 200) {
      const notasUnidad = JSON.parse(respuesta.getContentText());
      if (notasUnidad) {
        estadoCaptura = inferirEstadoCapturaDesdeNodoUnidad(notasUnidad);
        for (let matricula in notasUnidad) {
          if (matricula === "_meta") continue;
          if (notasUnidad[matricula] && notasUnidad[matricula].calificacion !== undefined) {
            mapaCalificaciones[matricula] = notasUnidad[matricula].calificacion;
          }
        }
      }
    }
  } catch (e) {
    Logger.log("Error al obtener calificaciones de Firebase: " + e.message);
  }

  return { calificaciones: mapaCalificaciones, estado_captura: estadoCaptura };
}

// EXTRA: LEER CALIFICACIONES DESDE FIREBASE PARA COLOCARLAS EN LA VISTA
function obtenerCalificacionesExistentes(grupo, materia, periodo) {
  assertDocenteAsignadoGrupoMateria(grupo, materia);
  return leerCalificacionesYEstadoUnidad(grupo, materia, periodo).calificaciones;
}

/** Vista docente: calificaciones + estado de captura en una sola lectura. */
function obtenerCalificacionesExistentesParaVista(grupo, materia, periodo) {
  assertDocenteAsignadoGrupoMateria(grupo, materia);
  return leerCalificacionesYEstadoUnidad(grupo, materia, periodo);
}

// 7. GUARDAR O ACTUALIZAR EN LA PESTAÑA CENTRAL "CALIFICACIONES" (CON VALIDACIÓN DE BLOQUEO INTEGRADA)
/*function guardarCalificacionesBackend(paqueteDatos) {
  // SEGURIDAD: Validar si el sistema está bloqueado antes de procesar cambios
  if (obtenerEstadoBloqueo()) {
    throw new Error("El periodo de captura ha finalizado. No se permiten modificaciones.");
  }

  if (!paqueteDatos || paqueteDatos.length === 0) {
    return "❌ No se recibieron calificaciones.";
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let hojaCalificaciones = ss.getSheetByName("CALIFICACIONES");
  
  if (!hojaCalificaciones) {
    hojaCalificaciones = ss.insertSheet("CALIFICACIONES");
    hojaCalificaciones.appendRow(["matricula", "alumno", "grupo", "materia ", "carrera", "periodo", "evaluacion", "calificación", "docente", "fecha"]);
    SpreadsheetApp.flush();
  }
  
  const docenteReal = getCorreoUsuario();
  const fecha = new Date();
  const registrosExistentes = hojaCalificaciones.getDataRange().getValues();
  
  const infoGrupo = paqueteDatos[0].grupo;
  let infoUnidadActual = paqueteDatos[0].periodo;
  
  if (!infoUnidadActual || infoUnidadActual === "undefined") {
    infoUnidadActual = "U1"; 
  }

  paqueteDatos.forEach(item => {
    let itemPeriodo = item.periodo;
    if (!itemPeriodo || itemPeriodo === "undefined") itemPeriodo = infoUnidadActual;

    let filaDestino = -1;
    
    for(let j = 1; j < registrosExistentes.length; j++) {
      let matBase = registrosExistentes[j][0] ? registrosExistentes[j][0].toString().trim() : "";
      let matItem = item.matricula ? item.matricula.toString().trim() : "";
      let matMat = registrosExistentes[j][3] ? registrosExistentes[j][3].toString().trim() : "";
      let matMateria = item.materia ? item.materia.toString().trim() : "";
      let perBase = registrosExistentes[j][5] ? registrosExistentes[j][5].toString().trim() : "";

      if(matBase === matItem && matMat === matMateria && perBase === itemPeriodo.toString().trim()) {
        filaDestino = j + 1;
        break;
      }
    }
    
    if(filaDestino > 0) {
      hojaCalificaciones.getRange(filaDestino, 8).setValue(item.nota);
      hojaCalificaciones.getRange(filaDestino, 9).setValue(docenteReal); 
      hojaCalificaciones.getRange(filaDestino, 10).setValue(fecha);
    } else {
      hojaCalificaciones.appendRow([
        item.matricula, item.nombre, item.grupo, item.materia, item.carrera,
        itemPeriodo, "PARCIAL", item.nota, docenteReal, fecha
      ]);
    }
  });
  
  return `✅ ¡Éxito total! Las calificaciones han sido guardadas y actualizadas de forma síncrona en el concentrado.`;
}*/

function assertDocenteAsignadoGrupoMateria(grupo, materia) {
  const correo = getCorreoUsuario();
  if (esCorreoAdministrador(correo)) return;
  const g = grupo.toString().trim().toUpperCase();
  const m = materia.toString().trim().toUpperCase();
  const asignaciones = getAsignacionesDocente();
  for (let i = 0; i < asignaciones.length; i++) {
    let a = asignaciones[i];
    if (a.grupo.toString().trim().toUpperCase() === g &&
        a.materia.toString().trim().toUpperCase() === m) {
      return;
    }
  }
  throw new Error("No está autorizado para operar en este grupo o asignatura.");
}

function assertDocenteAsignadoGrupo(grupo) {
  const correo = getCorreoUsuario();
  if (esCorreoAdministrador(correo)) return;
  const g = grupo.toString().trim().toUpperCase();
  const asignaciones = getAsignacionesDocente();
  for (let i = 0; i < asignaciones.length; i++) {
    if (asignaciones[i].grupo.toString().trim().toUpperCase() === g) return;
  }
  throw new Error("No está autorizado para consultar este grupo.");
}

function esCalificacionValidaParaCaptura(notaRaw, modelo) {
  if (notaRaw === null || notaRaw === undefined) return false;
  let t = notaRaw.toString().trim().toUpperCase();
  if (t === "") return false;
  if (modelo === "NUEVO") {
    if (t === "6" || t === "6.0") return true;
    if (t === "10") return true;
    let n = parseFloat(t);
    if (isNaN(n) || n < 7 || n > 10) return false;
    let redondeado = Math.round(n * 10) / 10;
    return Math.abs(n - redondeado) < 0.001;
  }
  return t === "8" || t === "9" || t === "10" || t === "NA";
}

function validarPaqueteCalificacionesBackend(paqueteDatos, infoGrupo, infoMateria, infoUnidad) {
  assertDocenteAsignadoGrupoMateria(infoGrupo, infoMateria);
  const alumnos = getAlumnosPorGrupoSinAuth(infoGrupo);
  if (!alumnos.length) {
    throw new Error("No hay alumnos registrados en este grupo.");
  }
  const matriculasGrupo = {};
  alumnos.forEach(function(a) {
    matriculasGrupo[a.matricula.toString().trim()] = true;
  });
  if (paqueteDatos.length !== alumnos.length) {
    throw new Error("Debe enviar la calificación de todos los alumnos del grupo.");
  }
  const infoModelo = obtenerModeloEvaluacionGrupo(infoGrupo);
  const yaVistas = {};
  paqueteDatos.forEach(function(item) {
    let mat = item.matricula.toString().trim();
    if (!matriculasGrupo[mat]) {
      throw new Error("Matrícula no válida para este grupo: " + mat);
    }
    if (yaVistas[mat]) {
      throw new Error("Registro duplicado para la matrícula: " + mat);
    }
    yaVistas[mat] = true;
    if (item.grupo.toString().trim().toUpperCase() !== infoGrupo) {
      throw new Error("El grupo del paquete no coincide con la asignación.");
    }
    if (item.materia.toString().trim().toUpperCase() !== infoMateria) {
      throw new Error("La materia del paquete no coincide con la asignación.");
    }
    let periodoItem = item.periodo ? item.periodo.toString().trim().toUpperCase() : infoUnidad;
    if (periodoItem !== infoUnidad) {
      throw new Error("La unidad del paquete no coincide con la solicitud.");
    }
    if (!esCalificacionValidaParaCaptura(item.nota, infoModelo.modelo)) {
      throw new Error("Calificación no permitida: " + item.nota);
    }
  });
}

// 7. GUARDAR O ACTUALIZAR EN FIREBASE CON ARQUITECTURA OPTIMIZADA
function guardarCalificacionesBackend(paqueteDatos, tipoGuardado, opcionesExtras) {
  assertCorreoInstitucional();
  opcionesExtras = opcionesExtras || {};
  if (obtenerEstadoBloqueo()) {
    throw new Error("El periodo de captura ha finalizado. No se permiten modificaciones.");
  }

  if (!paqueteDatos || paqueteDatos.length === 0) {
    return "❌ No se recibieron calificaciones.";
  }

  let modo = (tipoGuardado || "TEMPORAL").toString().trim().toUpperCase();
  if (modo !== "TEMPORAL" && modo !== "DEFINITIVO") {
    throw new Error("Tipo de guardado no válido. Use TEMPORAL o DEFINITIVO.");
  }

  const docenteReal = getCorreoUsuario();
  const fecha = new Date().toISOString();
  const cuatrimestre = getCuatrimestreActivo();

  const infoGrupo = paqueteDatos[0].grupo.toString().trim().toUpperCase();
  const infoMateria = paqueteDatos[0].materia.toString().trim().toUpperCase();
  let infoUnidadActual = paqueteDatos[0].periodo ? paqueteDatos[0].periodo.toString().trim().toUpperCase() : "U1";

  if (!infoUnidadActual || infoUnidadActual === "UNDEFINED") {
    infoUnidadActual = "U1";
  }

  const metaPrev = obtenerMetaUnidadCaptura(infoGrupo, infoMateria, infoUnidadActual);
  const yaDefinitivo = normalizarEstadoCaptura(metaPrev.estado_captura) === "DEFINITIVO";

  if (modo === "TEMPORAL") {
    if (yaDefinitivo) {
      throw new Error("Esta unidad ya fue guardada en definitivo. No se permiten guardados temporales.");
    }
  }

  if (modo === "DEFINITIVO" && yaDefinitivo && !opcionesExtras.confirmarCorreccionDefinitiva) {
    throw new Error("Esta unidad ya está en definitivo. Confirme la corrección en la plataforma antes de volver a guardar.");
  }

  validarPaqueteCalificacionesBackend(paqueteDatos, infoGrupo, infoMateria, infoUnidadActual);

  try {
    paqueteDatos.forEach(function(item) {
      let itemPeriodo = item.periodo ? item.periodo.toString().trim().toUpperCase() : infoUnidadActual;
      if (!itemPeriodo || itemPeriodo === "UNDEFINED") itemPeriodo = infoUnidadActual;

      let matriculaAlumno = item.matricula.toString().trim();
      let rutaGrupo = encodeURIComponent(infoGrupo);
      let rutaMateria = encodeURIComponent(infoMateria);

      const urlFirebase = URL_BASE_FIREBASE + "CALIFICACIONES/"
        + rutaGrupo + "/" + rutaMateria + "/" + itemPeriodo + "/" + matriculaAlumno + ".json";

      const cuerpoNota = {
        alumno: item.nombre,
        carrera: item.carrera,
        calificacion: item.nota,
        docente: docenteReal,
        fecha_registro: fecha,
        evaluacion: "PARCIAL",
        estado_captura: modo,
        cuatrimestre: cuatrimestre
      };

      fetchFirebaseUrl(urlFirebase, {
        method: "put",
        contentType: "application/json",
        payload: JSON.stringify(cuerpoNota)
      });

      sincronizarIndiceCalificacionMatriculaDespuesDeGuardado({
        matricula: matriculaAlumno,
        grupo: infoGrupo,
        materia: infoMateria,
        unidad: itemPeriodo,
        calificacion: item.nota,
        estadoCaptura: modo,
        cuatrimestre: cuatrimestre,
        fechaRegistro: fecha
      });
    });

    const urlMeta = construirUrlCalificacionesUnidad(infoGrupo, infoMateria, infoUnidadActual) + "_meta.json";
    fetchFirebaseUrl(urlMeta, {
      method: "put",
      contentType: "application/json",
      payload: JSON.stringify({
        estado_captura: modo,
        fecha_registro: fecha,
        docente: docenteReal,
        cuatrimestre: cuatrimestre,
        grupo: infoGrupo,
        materia: infoMateria,
        unidad: infoUnidadActual
      })
    });

    if (modo === "DEFINITIVO") {
      return "✅ Calificaciones guardadas de forma DEFINITIVA para la unidad " + infoUnidadActual + ".";
    }
    return "✅ Calificaciones guardadas de forma TEMPORAL para la unidad " + infoUnidadActual + ". Puede seguir editando y descargar actas parciales con leyenda de borrador.";
  } catch (error) {
    Logger.log("Error al guardar calificaciones en la base de datos: " + error.message);
    throw new Error("Ocurrió un error al conectar con la base de datos: " + error.message);
  }
}

/**
 * Retorna las métricas generales y de segmentación para el Dashboard de Administrador
 */
/**
 * Retorna las métricas generales y el Semáforo de Docentes de forma 100% automatizada
 * Deduce el universo de unidades según el progreso real en la base de calificaciones.
 */
/*function getDatosDashboardAdmin() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hojaEstudiantes = ss.getSheetByName("ESTUDIANTES");
  const hojaDocentes = ss.getSheetByName("DOCENTES") || ss.getSheetByName("docentes");
  const hojaCalificaciones = ss.getSheetByName("CALIFICACIONES");
  
  let matriculaTotal = 0;
  let eficienciaGlobal = "0.0%";
  let alumnosEnRiesgo = 0;
  let datosCarreras = {};
  
  // 1. Conteo de Estudiantes por Carrera
  if (hojaEstudiantes) {
    const dataEst = hojaEstudiantes.getDataRange().getValues();
    matriculaTotal = dataEst.length > 1 ? dataEst.length - 1 : 0;
    let conteoTemporal = {};
    
    for (let i = 1; i < dataEst.length; i++) {
      let carreraSigla = (dataEst[i][3] || "").toString().trim().toUpperCase();
      if (carreraSigla) {
        conteoTemporal[carreraSigla] = (conteoTemporal[carreraSigla] || 0) + 1;
      }
    }
    
    const ordenDefinido = ["IMT", "SMF", "IDGS", "DSM", "ES", "LPCYE", "PA", "LINM", "MER", "LGYDT", "TUR"];
    ordenDefinido.forEach(carrera => {
      if (conteoTemporal[carrera] !== undefined && conteoTemporal[carrera] > 0) {
        datosCarreras[carrera] = conteoTemporal[carrera];
      }
    });
    
    for (let carrera in conteoTemporal) {
      if (!ordenDefinido.includes(carrera)) {
        datosCarreras[carrera] = conteoTemporal[carrera];
      }
    }
  }
  
  // 2. Analizar el histórico real en la base de calificaciones
  let mapaUnidadesPorAsignacion = {}; // Estructura interna: { "GRUPO|MATERIA": Set( "U1", "U2" ) }
  
  if (hojaCalificaciones && hojaCalificaciones.getLastRow() > 1) {
    const dataCal = hojaCalificaciones.getDataRange().getValues();
    let totalNotas = 0;
    let notesAprobadas = 0;
    let alumnosReprobadosUnicos = new Set();
    
    for (let i = 1; i < dataCal.length; i++) {
      let matricula = dataCal[i][0]; 
      let grupo = dataCal[i][2] ? dataCal[i][2].toString().trim() : "";     
      let materia = dataCal[i][3] ? dataCal[i][3].toString().trim() : "";   
      let periodo = dataCal[i][5] ? dataCal[i][5].toString().trim() : "";   
      let notaRaw = dataCal[i][7];   
      
      if (notaRaw !== undefined && notaRaw !== "") {
        totalNotas++;
        let notaNum = parseFloat(notaRaw);
        if (notaRaw === "NA" || (!isNaN(notaNum) && notaNum < 7.0)) {
          alumnosReprobadosUnicos.add(matricula.toString().trim());
        } else {
          notesAprobadas++;
        }
        
        // Mapeamos qué unidades ya registran actividad
        if (grupo && materia && periodo) {
          let llaveAsignacion = (grupo + "|" + materia).toUpperCase().trim();
          if (!mapaUnidadesPorAsignacion[llaveAsignacion]) {
            mapaUnidadesPorAsignacion[llaveAsignacion] = new Set();
          }
          mapaUnidadesPorAsignacion[llaveAsignacion].add(periodo.toUpperCase().trim());
        }
      }
    }
    alumnosEnRiesgo = alumnosReprobadosUnicos.size;
    if (totalNotas > 0) {
      eficienciaGlobal = ((notesAprobadas / totalNotas) * 100).toFixed(1) + "%";
    }
  }
  
  // 3. Procesar Semáforo de Docentes con Universo Deductivo Automático
  let mapaDocentes = {}; 

  if (hojaDocentes && hojaDocentes.getLastRow() > 1) {
    const dataDoc = hojaDocentes.getDataRange().getValues();
    for (let i = 1; i < dataDoc.length; i++) {
      let nombre = (dataDoc[i][0] || "").toString().trim();
      let grupo = (dataDoc[i][1] || "").toString().trim();                                                 
      let materia = (dataDoc[i][2] || "").toString().trim();                                                
      let correo = (dataDoc[i][5] || "").toString().trim().toLowerCase();    
      
      if (!nombre || nombre === "PROFESOR" || !grupo || !materia) continue; 
      
      let claveUnica = correo || nombre.toLowerCase();
      
      if (!mapaDocentes[claveUnica]) {
        mapaDocentes[claveUnica] = {
          nombre: nombre,
          correo: correo || "Sin Correo Registrado",
          unidadesEsperadasCalculadas: 0,
          unidadesRealizadasCalculadas: 0,
          combinacionesProcesadas: new Set()
        };
      }
      
      let llaveAsignacionUnica = (grupo + "|" + materia).toUpperCase().trim();
      
      if (!mapaDocentes[claveUnica].combinacionesProcesadas.has(llaveAsignacionUnica)) {
        mapaDocentes[claveUnica].combinacionesProcesadas.add(llaveAsignacionUnica);
        
        let unidadesRegistradas = mapaUnidadesPorAsignacion[llaveAsignacionUnica];
        
        if (!unidadesRegistradas || unidadesRegistradas.size === 0) {
          // Si el docente no ha subido NADA de este grupo, la meta base es 1 unidad (0% de avance)
          mapaDocentes[claveUnica].unidadesEsperadasCalculadas += 1;
        } else {
          // Si ya hay notas, detectamos de forma dinámica cuál es el periodo más alto que ha tocado
          let unidadMaxima = 1;
          unidadesRegistradas.forEach(uni => {
            let numeroUnidad = parseInt(uni.replace("U", ""), 10);
            if (!isNaN(numeroUnidad) && numeroUnidad > unidadMaxima) {
              unidadMaxima = numeroUnidad;
            }
          });
          
          // El "100%" de esta materia se ajusta automáticamente a ese límite máximo detectado
          mapaDocentes[claveUnica].unidadesEsperadasCalculadas += unidadMaxima;
          
          // Contamos cuántas unidades completas tiene dentro de ese rango
          for (let u = 1; u <= unidadMaxima; u++) {
            if (unidadesRegistradas.has("U" + u)) {
              mapaDocentes[claveUnica].unidadesRealizadasCalculadas += 1;
            }
          }
        }
      }
    }
  }
  
  // 4. Estructurar respuesta para el Dashboard
  let listaSemaforoDocentes = [];
  for (let key in mapaDocentes) {
    listaSemaforoDocentes.push({
      nombre: mapaDocentes[key].nombre,
      correo: mapaDocentes[key].correo,
      total: mapaDocentes[key].unidadesEsperadasCalculadas,     
      cargas: mapaDocentes[key].unidadesRealizadasCalculadas    
    });
  }
  
  listaSemaforoDocentes.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }));

  return {
    matriculaTotal: matriculaTotal,
    eficienciaGlobal: eficienciaGlobal,
    alumnosEnRiesgo: alumnosEnRiesgo,
    carrerasLabels: Object.keys(datosCarreras),
    carrerasValues: Object.values(datosCarreras),
    docentesSemaforo: listaSemaforoDocentes
  };
}*/

// ==========================================
// FASE 4: DASHBOARD ADMINISTRADOR Y SEMÁFORO CON FIREBASE
// ==========================================
function getDatosDashboardAdmin() {
  assertUsuarioAdministrador();
  assertCorreoInstitucional();
  const urlBase = URL_BASE_FIREBASE;
  let matriculaTotal = 0;
  let alumnosEnRiesgo = 0;
  let eficienciaGlobal = "0%";
  
  const ordenEstrictoSiglas = ORDEN_SIGLAS_DASHBOARD_ADMIN;
  let carrerasLabels = etiquetasCarreraDashboard(ordenEstrictoSiglas);
  let carrerasSiglas = [...ordenEstrictoSiglas];
  let carrerasValores = ORDEN_SIGLAS_DASHBOARD_ADMIN.map(function () { return 0; });
  const DASHBOARD_MATRICULA_VERSION = "2026S-matricula-v5-sin-ING-EDS-graficas";
  let carrerasAprobacionValues = [];
  let carrerasReprobacionValues = [];
  let carrerasPromediosValues = [];
  let docentesSemaforo = [];
  
  let carreraMayorReprobacion = "N/A";
  let carreraMejorPromedio = "N/A";

  // Objeto para registrar qué combinaciones de [Grupo_Materia] ya tienen notas en la BD
  let capturasActivas = {};

  try {
    // Matrícula: nodo Estudiantes directo (no depende de la descarga raíz ~3 MB)
    let estudiantes = cargarEstudiantesFirebase(urlBase);

    if (Object.keys(estudiantes).length === 0) {
      const estAlt = cargarJsonFirebasePathConCache("Estudiantes.json", "fb_Estudiantes_v1", CACHE_FIREBASE_TTL_SEC);
      if (estAlt) estudiantes = estAlt;
    }

    const docentes = obtenerNodoDocentesFirebase();

    let calificacionesDB = {};
    const respCal = fetchFirebasePath("CALIFICACIONES.json", { muteHttpExceptions: true });
    if (respCal.getResponseCode() === 200) {
      calificacionesDB = JSON.parse(respCal.getContentText() || "{}") || {};
    }
    
    // Mapeo seguro forzando la llave de la matrícula a String limpio
    let mapaEstudiantesLimpios = {};
    for (let m in estudiantes) {
      let est = estudiantes[m];
      if (est) {
        matriculaTotal++;
        let matString = m.toString().trim();
        mapaEstudiantesLimpios[matString] = est;

        let indiceSigla = resolverIndiceCarreraDashboard(est, ordenEstrictoSiglas);
        if (indiceSigla !== -1) {
          carrerasValores[indiceSigla]++;
        }
      }
    }

    // 2. ESTRUCTURA TEMPORAL PARA AGRUPAR CALIFICACIONES POR ALUMNO
    // Estructura interna planeada: { "5125140049": { idxCarrera: 2, notas: [8.5, 7.0, 9.0], tieneReprobada: false } }
    let expedienteAlumnos = {};

    // Navegación del objeto de calificaciones en Firebase
    for (let grupo in calificacionesDB) {
      let materiasObj = calificacionesDB[grupo];
      if (!materiasObj || typeof materiasObj !== 'object') continue;

      for (let materia in materiasObj) {
        let unidadesObj = materiasObj[materia];
        if (!unidadesObj || typeof unidadesObj !== 'object') continue;

        let grupoKey = grupo.toString().trim().toUpperCase();
        let materiaKey = materia.toString().trim().toUpperCase();
        capturasActivas[grupoKey + "_" + materiaKey] = true;

        for (let unidad in unidadesObj) {
          let alumnosNotas = unidadesObj[unidad];
          if (!alumnosNotas || typeof alumnosNotas !== 'object') continue;

          for (let matricula in alumnosNotas) {
            if (matricula === "_meta") continue;
            let registroNota = alumnosNotas[matricula];
            if (!registroNota) continue;

            let notaRaw = (typeof registroNota === "object" && registroNota.calificacion !== undefined) 
                          ? registroNota.calificacion 
                          : (registroNota.calificacion || registroNota);
                          
            if (notaRaw === undefined || notaRaw === null || notaRaw === "") continue;

            let matBuscar = matricula.toString().trim();
            let alumnoInfo = mapaEstudiantesLimpios[matBuscar];
            let idxCar = -1;
            
            idxCar = resolverIndiceCarreraDashboard(
              alumnoInfo,
              ordenEstrictoSiglas,
              registroNota && registroNota.carrera ? registroNota.carrera : ""
            );

            if (idxCar === -1) continue;

            let notaString = notaRaw.toString().trim().toUpperCase();
            let esReprobado = false;
            let valorNumerico = parseFloat(notaString);

            if (isNaN(valorNumerico)) {
              if (notaString === "NA") {
                esReprobado = true;
                valorNumerico = 5.0; 
              } else {
                continue; 
              }
            } else {
              if (valorNumerico < 7.0) {
                esReprobado = true;
              }
            }

            // Inicializar el expediente del alumno si no existe
            if (!expedienteAlumnos[matBuscar]) {
              expedienteAlumnos[matBuscar] = {
                idxCarrera: idxCar,
                notas: [],
                totalNotasAprobadas: 0,
                totalNotasReprobadas: 0
              };
            }

            // Guardar los datos en el expediente del alumno
            expedienteAlumnos[matBuscar].notas.push(valorNumerico);
            if (esReprobado) {
              expedienteAlumnos[matBuscar].totalNotasReprobadas++;
            } else {
              expedienteAlumnos[matBuscar].totalNotasAprobadas++;
            }
          }
        }
      }
    }

    // 3. PROCESAR EXPEDIENTES POR ALUMNO PARA SACAR MÉTRICAS DE CARRERAS
    let metricasIndexadas = {};
    for(let i = 0; i < ordenEstrictoSiglas.length; i++) {
      metricasIndexadas[i] = { totalAlumnosEvaluados: 0, alumnosAprobadosPuros: 0, alumnosConRiesgo: 0, sumaPromediosAlumnos: 0 };
    }

    let totalNotasGlobal = 0;
    let totalAprobadasGlobal = 0;

    for (let matricula in expedienteAlumnos) {
      let exp = expedienteAlumnos[matricula];
      let idxCar = exp.idxCarrera;

      if (exp.notas.length > 0) {
        // Calcular promedio individual de ESTE alumno
        let sumaNotasAlumno = exp.notas.reduce((a, b) => a + b, 0);
        let promedioIndividual = sumaNotasAlumno / exp.notas.length;

        metricasIndexadas[idxCar].totalAlumnosEvaluados++;
        metricasIndexadas[idxCar].sumaPromediosAlumnos += promedioIndividual;

        // Criterio de Riesgo: Si tiene al menos una materia reprobada en sus capturas, es Alumno en Riesgo
        if (exp.totalNotasReprobadas > 0) {
          metricasIndexadas[idxCar].alumnosConRiesgo++;
          alumnosEnRiesgo++; // Contador global
        } else {
          metricasIndexadas[idxCar].alumnosAprobadosPuros++;
        }

        // Para la eficiencia global acumulamos los totales de notas puras
        totalNotasGlobal += exp.notas.length;
        totalAprobadasGlobal += exp.totalNotasAprobadas;
      }
    }

    // 4. GENERAR ESTADÍSTICAS FINALES EN EL FORMATO DE RETORNO
    let maxPorcentajeReprobacion = -1;
    let maxPromedioGeneral = -1;

    ordenEstrictoSiglas.forEach((claveGrupo, idx) => {
      let dataCar = metricasIndexadas[idx];
      let pctAprobacion = 0;
      let pctReprobacion = 0;
      let promedioCarrera = 0;

      if (dataCar.totalAlumnosEvaluados > 0) {
        // El promedio de la carrera es la suma de los promedios de sus alumnos entre el total de alumnos
        promedioCarrera = dataCar.sumaPromediosAlumnos / dataCar.totalAlumnosEvaluados;
        
        // El porcentaje se basa en cuántos alumnos tienen materias en riesgo del total evaluados en la carrera
        pctReprobacion = (dataCar.alumnosConRiesgo / dataCar.totalAlumnosEvaluados) * 100;
        pctAprobacion = 100 - pctReprobacion;

        const etiquetaCar = ETIQUETA_CARRERA_DASHBOARD[claveGrupo] || claveGrupo;
        const omitirEnTarjetas = CLAVES_EXCLUIDAS_GRAFICAS_DASHBOARD.indexOf(claveGrupo) !== -1;
        if (!omitirEnTarjetas && pctReprobacion > maxPorcentajeReprobacion) {
          maxPorcentajeReprobacion = pctReprobacion;
          carreraMayorReprobacion = `${etiquetaCar} (${pctReprobacion.toFixed(0)}%)`;
        }

        if (!omitirEnTarjetas && promedioCarrera > maxPromedioGeneral) {
          maxPromedioGeneral = promedioCarrera;
          carreraMejorPromedio = `${etiquetaCar} (${promedioCarrera.toFixed(1)})`;
        }
      }

      carrerasAprobacionValues.push(Number(pctAprobacion.toFixed(1)));
      carrerasReprobacionValues.push(Number(pctReprobacion.toFixed(1)));
      carrerasPromediosValues.push(Number(promedioCarrera.toFixed(2)));
    });

    if (totalNotasGlobal > 0) {
      eficienciaGlobal = Math.round((totalAprobadasGlobal / totalNotasGlobal) * 100) + "%";
    }

    // 5. PROCESAR SEMÁFORO DE DOCENTES (modelo nuevo y legado)
    let mapaDocentes = {};
    iterarAsignacionesDocentesNodo(docentes, function(correoKey, nombre, grupo, materia) {
      if (!mapaDocentes[correoKey]) {
        mapaDocentes[correoKey] = { nombre: nombre, correo: correoKey, total: 0, cargas: 0 };
      }
      mapaDocentes[correoKey].total++;
      let claveCruceDocente = grupo.toString().trim().toUpperCase() + "_" + materia.toString().trim().toUpperCase();
      if (capturasActivas[claveCruceDocente]) {
        mapaDocentes[correoKey].cargas++;
      }
    });
    
    for (let c in mapaDocentes) {
      if (mapaDocentes[c].cargas > mapaDocentes[c].total) {
        mapaDocentes[c].cargas = mapaDocentes[c].total;
      }
      docentesSemaforo.push(mapaDocentes[c]);
    }
    
    docentesSemaforo.sort((a, b) => a.nombre.toString().trim().toUpperCase().localeCompare(b.nombre.toString().trim().toUpperCase(), 'es', { sensitivity: 'base' }));

  } catch (e) {
    Logger.log("Error crítico en getDatosDashboardAdmin: " + e.message);
  }

  const ordenGraficas = ordenSiglasDashboardVisibleGraficas(ordenEstrictoSiglas);
  const labelsGraficas = etiquetasCarreraDashboard(ordenGraficas);

  return {
    matriculaTotal: matriculaTotal,
    eficienciaGlobal: eficienciaGlobal,
    alumnosEnRiesgo: alumnosEnRiesgo,
    carreraMayorReprobacion: carreraMayorReprobacion,
    carreraMejorPromedio: carreraMejorPromedio,
    carrerasLabels: labelsGraficas,
    carrerasSiglas: ordenGraficas,
    carrerasValores: filtrarSeriesDashboardPorClavesVisibles(ordenEstrictoSiglas, carrerasValores),
    carrerasAprobacionValues: filtrarSeriesDashboardPorClavesVisibles(ordenEstrictoSiglas, carrerasAprobacionValues),
    carrerasReprobacionValues: filtrarSeriesDashboardPorClavesVisibles(ordenEstrictoSiglas, carrerasReprobacionValues),
    carrerasPromediosValues: filtrarSeriesDashboardPorClavesVisibles(ordenEstrictoSiglas, carrerasPromediosValues),
    docentesSemaforo: docentesSemaforo,
    dashboardVersion: DASHBOARD_MATRICULA_VERSION
  };
}

/** Ejecutar en el editor de Apps Script → Ver registros (diagnóstico matrícula por carrera). */
function diagnosticarMatriculaDashboard() {
  assertUsuarioAdministrador();
  const r = getDatosDashboardAdmin();
  const suma = (r.carrerasValores || []).reduce(function (a, b) { return a + b; }, 0);
  Logger.log(r.dashboardVersion + " | total=" + r.matriculaTotal + " | suma barras=" + suma + " | " + JSON.stringify(r.carrerasValores));
  return r;
}

/** Valor inicial si ADMIN_CORREOS aún no existe (solo migración automática una vez). */
function textoListaAdministradoresMigracionInicial() {
  return [
    "alejandra.delgado@utzmg.edu.mx",
    "lizbeth.noriega@utzmg.edu.mx",
    "hcarranza@utzmg.edu.mx",
    "escolares@utzmg.edu.mx"
  ].join(",");
}

function parseListaCorreosAdministrador(texto) {
  if (!texto) return [];
  return texto
    .toString()
    .split(/[\s,;]+/)
    .map(function (c) { return c.toLowerCase().trim(); })
    .filter(function (c) { return c.length > 0 && c.indexOf("@") !== -1; });
}

/** Lee ADMIN_CORREOS desde propiedades del script (correos separados por coma). */
function obtenerListaCorreosAdministrador() {
  const props = PropertiesService.getScriptProperties();
  let raw = props.getProperty(PROPIEDAD_ADMIN_CORREOS);
  if (!raw || !raw.toString().trim()) {
    raw = textoListaAdministradoresMigracionInicial();
    props.setProperty(PROPIEDAD_ADMIN_CORREOS, raw);
    Logger.log("ADMIN_CORREOS inicializado en propiedades del script (migración).");
  }
  return parseListaCorreosAdministrador(raw);
}

/**
 * Actualiza la lista de administradores (solo un admin ya autorizado).
 * @param {string} correosSeparadosPorComa ej. "a@utzmg.edu.mx,b@utzmg.edu.mx"
 */
function registrarListaAdministradores(correosSeparadosPorComa) {
  assertUsuarioAdministrador();
  const lista = parseListaCorreosAdministrador(correosSeparadosPorComa);
  if (lista.length === 0) {
    throw new Error("Indique al menos un correo @utzmg.edu.mx separado por comas.");
  }
  for (let i = 0; i < lista.length; i++) {
    if (!esCorreoInstitucionalUtzmg(lista[i])) {
      throw new Error("Correo no institucional: " + lista[i]);
    }
  }
  const valor = lista.join(",");
  PropertiesService.getScriptProperties().setProperty(PROPIEDAD_ADMIN_CORREOS, valor);
  return "Lista de administradores actualizada (" + lista.length + " cuenta(s)).";
}

function esCorreoAdministrador(correo) {
  if (!visitanteTieneSesionGoogleIdentificada_()) {
    return false;
  }
  const c = (correo || obtenerCorreoSesionWebApp_() || "").toLowerCase().trim();
  if (!c) {
    return false;
  }
  const activo = obtenerCorreoSesionWebApp_();
  if (activo && c !== activo) {
    return false;
  }
  return obtenerListaCorreosAdministrador().indexOf(c) !== -1;
}

function assertUsuarioAdministrador() {
  assertVisitanteWebAppIdentificado_();
  const correo = assertCorreoInstitucional();
  if (!esCorreoAdministrador(correo)) {
    throw new Error("Solo personal administrador autorizado puede realizar esta operación.");
  }
}

// ==========================================
// PORTAL ESTUDIANTE — consulta de calificaciones propias
// ==========================================

/** Matrícula y correo reservados para pruebas del portal (no asignados a alumnos reales). */
const MATRICULA_ESTUDIANTE_DEMO_PORTAL = "0000000000";
const CORREO_ESTUDIANTE_DEMO_PORTAL = "portal.demo@utzmg.edu.mx";

function buscarEstudiantePorMatricula(matricula) {
  const mat = (matricula || "").toString().trim();
  if (!mat) return null;
  const estudiantes = cargarEstudiantesFirebase();
  if (!estudiantes || typeof estudiantes !== "object") return null;
  const est = estudiantes[mat];
  if (!est) return null;
  return perfilEstudiantePortalDesdeRegistro(mat, est, est.correo_institucional || est.correo || "");
}

function codigoHttpLecturaFirebasePath_(pathRelativo) {
  try {
    return fetchFirebasePath(pathRelativo, { muteHttpExceptions: true }).getResponseCode();
  } catch (e) {
    Logger.log("codigoHttpLecturaFirebasePath_: " + e.message);
    return 0;
  }
}

/** Texto visible al usuario cuando falla la validación por problemas de conexión/consulta. */
function mensajeFalloValidacionAccesoUsuario_() {
  return "No pudimos verificar su registro en este momento. "
    + "Cierre esta página, vuelva a abrir la aplicación, pulse «Ingresar a la aplicación» "
    + "e inicie sesión con su correo institucional " + SUFIJO_DOMINIO_INSTITUCIONAL + ". "
    + "Si el problema continúa, escríba a " + CORREO_CONTACTO_SOPORTE_TECNICO + ".";
}

/** Texto visible cuando el correo no está en listas de docentes ni estudiantes del ciclo. */
function mensajeCuentaNoRegistradaUsuario_(correo) {
  return "La cuenta " + correo + " no está registrada como docente ni como estudiante en este ciclo. "
    + "Revise que haya iniciado sesión con su correo personal institucional (no otro correo de la universidad). "
    + "Si usted debe tener acceso, escríba a " + CORREO_CONTACTO_SOPORTE_TECNICO + ".";
}

function registrarDiagnosticoLoginFallido_(correo, catalogoDocentesVacio, httpEstudiantes, docentes) {
  var claveEsp = claveDocenteFirebaseDesdeCorreo_(correo);
  var totalDoc = docentes ? Object.keys(docentes).length : 0;
  Logger.log(
    "Login denegado | correo=" + correo
    + " | docentesVacio=" + catalogoDocentesVacio
    + " | httpEstudiantes=" + httpEstudiantes
    + " | totalDocentes=" + totalDoc
    + " | claveFirebase=" + claveEsp
    + " | secretoFirebase=" + (getFirebaseDatabaseSecret() ? "sí" : "no")
  );
}

function buscarEstudiantePorCorreoInstitucional(correo) {
  const c = normalizarCorreoLoginDocente(correo);
  if (!c) return null;
  const desdeIndice = buscarEstudiantePorCorreoDesdeIndice(c);
  if (desdeIndice) return desdeIndice;
  const estudiantes = cargarEstudiantesFirebase();
  for (let matricula in estudiantes) {
    let est = estudiantes[matricula];
    if (!est) continue;
    let mail = normalizarCorreoLoginDocente(est.correo_institucional || est.correo || "");
    if (mail !== c) continue;
    return perfilEstudiantePortalDesdeRegistro(matricula, est, mail);
  }
  return null;
}

function assertEstudianteAutenticado() {
  const correo = assertCorreoInstitucional();
  const est = buscarEstudiantePorCorreoInstitucional(correo);
  if (!est) {
    throw new Error("Su cuenta no está registrada como estudiante en el ciclo activo.");
  }
  if (est.estatus && est.estatus !== "ACTIVO") {
    throw new Error("Su registro estudiantil no está activo. " + mensajeContactoSoporte());
  }
  return est;
}

function extraerFilasCalificacionesGrupoParaMatricula(grupo, materiasObj, matricula, infoModeloAlumno) {
  const filas = [];
  if (!materiasObj || typeof materiasObj !== "object") return filas;
  matricula = matricula.toString().trim();
  for (let materia in materiasObj) {
    let unidadesObj = materiasObj[materia];
    if (!unidadesObj || typeof unidadesObj !== "object") continue;
    for (let unidad in unidadesObj) {
      let alumnosNotas = unidadesObj[unidad];
      if (!alumnosNotas || typeof alumnosNotas !== "object") continue;
      let registroNota = alumnosNotas[matricula];
      if (!registroNota) continue;
      let metaUnidad = alumnosNotas._meta || {};
      let notaRaw = (typeof registroNota === "object" && registroNota.calificacion !== undefined)
        ? registroNota.calificacion
        : registroNota;
      if (notaRaw === undefined || notaRaw === null || notaRaw.toString().trim() === "") continue;
      let estadoCaptura = "";
      if (typeof registroNota === "object" && registroNota.estado_captura) {
        estadoCaptura = normalizarEstadoCaptura(registroNota.estado_captura);
      }
      if (!estadoCaptura && metaUnidad.estado_captura) {
        estadoCaptura = normalizarEstadoCaptura(metaUnidad.estado_captura);
      }
      if (!estadoCaptura) estadoCaptura = "TEMPORAL";
      const infoModelo = infoModeloAlumno || obtenerModeloEvaluacionGrupo(grupo);
      const escala = escalaAlfabeticaDesdeNota(notaRaw, infoModelo.modelo);
      filas.push({
        grupo: grupo.toString(),
        materia: materia.toString(),
        unidad: unidad.toString(),
        calificacion: notaRaw.toString(),
        calificacionNumerica: escala.numerico,
        calificacionAlfabetica: escala.alfabetico,
        estadoCaptura: estadoCaptura,
        cuatrimestre: (typeof registroNota === "object" && registroNota.cuatrimestre) ? registroNota.cuatrimestre : getCuatrimestreActivo(),
        fechaRegistro: (typeof registroNota === "object" && registroNota.fecha_registro) ? registroNota.fecha_registro : ""
      });
    }
  }
  return filas;
}

function obtenerGruposCalificacionesParaEstudiante(perfilEstudiante) {
  const grupos = {};
  if (perfilEstudiante && perfilEstudiante.grupo_completo) {
    let g = perfilEstudiante.grupo_completo.toString().trim();
    grupos[normalizarTextoGrupoPortal(g)] = g;
  }
  return grupos;
}

function recolectarCalificacionesMatriculaEstudiante(matricula, perfilEstudiante) {
  matricula = matricula.toString().trim();
  let filas = [];
  const infoModeloAlumno = perfilEstudiante ? obtenerModeloEvaluacionEstudiante(perfilEstudiante) : null;
  const cuat = getCuatrimestreActivo();
  try {
    const filasIndice = recolectarFilasDesdeIndiceCalificacionesMatricula(matricula, cuat, infoModeloAlumno);
    const filasGrupo = [];
    const gruposMap = obtenerGruposCalificacionesParaEstudiante(perfilEstudiante);
    const clavesGrupo = Object.keys(gruposMap);

    if (clavesGrupo.length > 0) {
      for (let i = 0; i < clavesGrupo.length; i++) {
        let grupoTexto = gruposMap[clavesGrupo[i]];
        let urlGrupo = URL_BASE_FIREBASE + "CALIFICACIONES/" + encodeURIComponent(grupoTexto.toUpperCase()) + ".json";
        let resp = fetchFirebaseUrl(urlGrupo, { muteHttpExceptions: true });
        if (resp.getResponseCode() !== 200) continue;
        let materiasObj = JSON.parse(resp.getContentText() || "null");
        if (!materiasObj) continue;
        filasGrupo.push.apply(
          filasGrupo,
          extraerFilasCalificacionesGrupoParaMatricula(grupoTexto, materiasObj, matricula, infoModeloAlumno)
        );
      }
    } else {
      const resp = fetchFirebasePath("CALIFICACIONES.json", { muteHttpExceptions: true });
      if (resp.getResponseCode() === 200) {
        const calificacionesDB = JSON.parse(resp.getContentText()) || {};
        for (let grupo in calificacionesDB) {
          filasGrupo.push.apply(
            filasGrupo,
            extraerFilasCalificacionesGrupoParaMatricula(grupo, calificacionesDB[grupo], matricula, infoModeloAlumno)
          );
        }
      }
    }

    if (filasIndice && filasIndice.length) {
      filas = fusionarFilasCalificacionesEstudiante(filasIndice, filasGrupo);
    } else {
      filas = filasGrupo;
    }
  } catch (e) {
    Logger.log("recolectarCalificacionesMatriculaEstudiante: " + e.message);
  }
  filas.sort(function (a, b) {
    let m = a.materia.localeCompare(b.materia, "es", { sensitivity: "base" });
    if (m !== 0) return m;
    let ua = parseInt(a.unidad.replace(/^U/i, ""), 10);
    let ub = parseInt(b.unidad.replace(/^U/i, ""), 10);
    if (!isNaN(ua) && !isNaN(ub) && ua !== ub) return ua - ub;
    return a.unidad.localeCompare(b.unidad);
  });
  return filas;
}

function obtenerTotalUnidadesAsignacionPublica(grupo, materia) {
  const g = sanitizarSegmentoRutaFirebase(grupo.toString().trim().toUpperCase());
  const m = sanitizarSegmentoRutaFirebase(materia.toString().trim().toUpperCase());
  try {
    const url = URL_BASE_FIREBASE + "CONFIG_UNIDADES/" + g + "/" + m + ".json";
    const resp = fetchFirebaseUrl(url, { muteHttpExceptions: true });
    if (resp.getResponseCode() !== 200) return 0;
    const configs = JSON.parse(resp.getContentText()) || {};
    for (let k in configs) {
      if (configs[k] && configs[k].totalUnidades) {
        let n = parseInt(configs[k].totalUnidades, 10);
        if (!isNaN(n) && n > 0) return n;
      }
    }
  } catch (e) {
    Logger.log("obtenerTotalUnidadesAsignacionPublica: " + e.message);
  }
  return 0;
}

function inferirTotalUnidadesDesdeFilas(filasMateria) {
  let maxU = 0;
  (filasMateria || []).forEach(function(f) {
    let ua = parseInt((f.unidad || "").toString().replace(/^U/i, ""), 10);
    if (!isNaN(ua) && ua > maxU) maxU = ua;
  });
  return maxU;
}

function claveGrupoMateriaActaIntegracion(grupo, materia) {
  return grupo.toString().trim().toUpperCase() + "|" + materia.toString().trim();
}

function cargarIndiceActasIntegracionPublicadas(cuatrimestre) {
  const indice = {};
  const cuat = (cuatrimestre || getCuatrimestreActivo()).toString().trim().toUpperCase();
  const cacheKey = "fb_ACTAS_INT_" + cuat;
  try {
    let all = cargarJsonFirebasePathConCache("VERIFICACION_ACTAS.json", cacheKey, CACHE_FIREBASE_TTL_SEC);
    if (!all) {
      const resp = fetchFirebasePath("VERIFICACION_ACTAS.json", { muteHttpExceptions: true });
      if (resp.getResponseCode() !== 200) return indice;
      all = JSON.parse(resp.getContentText()) || {};
      guardarCacheFirebaseJson(cacheKey, all, CACHE_FIREBASE_TTL_SEC);
    }
    for (let cod in all) {
      let r = all[cod];
      if (!r) continue;
      if ((r.tipo_acta || "").toString().trim().toUpperCase() !== "INTEGRACION") continue;
      if (r.cuatrimestre && r.cuatrimestre.toString().trim().toUpperCase() !== cuat) continue;
      let g = (r.grupo || "").toString().trim().toUpperCase();
      let m = (r.materia || "").toString().trim();
      if (!g || !m) continue;
      indice[claveGrupoMateriaActaIntegracion(g, m)] = true;
    }
  } catch (e) {
    Logger.log("cargarIndiceActasIntegracionPublicadas: " + e.message);
  }
  return indice;
}

function estatusIntegracionEsNoAprobado(resultadoIntegracion, modelo) {
  if (!resultadoIntegracion) return false;
  let alfa = (resultadoIntegracion.alfabetico || "").toString().trim();
  let num = (resultadoIntegracion.numerico || "").toString().trim().toUpperCase();
  if (modelo === "NUEVO") {
    return alfa === "Preformal" || num === "6" || num === "6.0";
  }
  return alfa === "No aprobado" || num === "NA";
}

function parseNumericoPromedioIntegracion(resultadoIntegracion) {
  if (!resultadoIntegracion || !resultadoIntegracion.numerico) return null;
  let t = resultadoIntegracion.numerico.toString().trim().toUpperCase();
  if (t === "" || t === "NA") return null;
  let n = parseFloat(t);
  return isNaN(n) ? null : n;
}

function normalizarTextoGrupoPortal(valor) {
  return (valor || "").toString().trim().toUpperCase().replace(/\s+/g, " ");
}

function normalizarNombreMateriaPortal(valor) {
  return (valor || "").toString().trim().toUpperCase().replace(/\s+/g, " ");
}

/** Materias del grupo según asignaciones de docentes en Firebase (carga horaria del cuatrimestre). */
function obtenerAsignacionesMateriasGrupoEstudiante(grupoCompleto, docentesPrecargados) {
  const grupoNorm = normalizarTextoGrupoPortal(grupoCompleto);
  if (!grupoNorm) return [];
  const lista = [];
  try {
    const docentes = docentesPrecargados || obtenerNodoDocentesFirebase();
    iterarAsignacionesDocentesNodo(docentes, function(correo, nombreProf, grupo, materia) {
      if (normalizarTextoGrupoPortal(grupo) !== grupoNorm) return;
      if (!materia || !materia.toString().trim()) return;
      lista.push({
        grupo: grupo.toString().trim(),
        materia: materia.toString().trim(),
        nombreDocente: nombreProf ? nombreProf.toString().trim() : "Docente",
        correoDocente: correo
      });
    });
  } catch (e) {
    Logger.log("obtenerAsignacionesMateriasGrupoEstudiante: " + e.message);
  }
  const visto = {};
  const unicos = [];
  lista.forEach(function(a) {
    let k = normalizarNombreMateriaPortal(a.materia);
    if (visto[k]) return;
    visto[k] = true;
    unicos.push(a);
  });
  unicos.sort(function(a, b) {
    return a.materia.localeCompare(b.materia, "es", { sensitivity: "base" });
  });
  return unicos;
}

function indexarFilasCalificacionesPorMateria(filas) {
  const porMateria = {};
  (filas || []).forEach(function(f) {
    let mNorm = normalizarNombreMateriaPortal(f.materia);
    if (!porMateria[mNorm]) porMateria[mNorm] = [];
    porMateria[mNorm].push(f);
  });
  return porMateria;
}

function filasCalificacionesParaAsignacion(porMateria, asignacion) {
  const mNorm = normalizarNombreMateriaPortal(asignacion.materia);
  let candidatos = porMateria[mNorm] || [];
  if (!candidatos.length) return [];
  const gAsig = normalizarTextoGrupoPortal(asignacion.grupo);
  let filtradas = candidatos.filter(function(f) {
    return normalizarTextoGrupoPortal(f.grupo) === gAsig;
  });
  return filtradas.length ? filtradas : candidatos;
}

function resolverNombreDocenteGrupoMateria(grupo, materia, docentesPrecargados) {
  const gBus = normalizarTextoGrupoPortal(grupo);
  const mBus = normalizarNombreMateriaPortal(materia);
  if (!gBus || !mBus) return "";
  let nombre = "";
  try {
    const docentes = docentesPrecargados || obtenerNodoDocentesFirebase();
    iterarAsignacionesDocentesNodo(docentes, function(correo, nombreProf, g, m) {
      if (nombre) return;
      if (normalizarTextoGrupoPortal(g) !== gBus) return;
      if (normalizarNombreMateriaPortal(m) !== mBus) return;
      nombre = nombreProf ? nombreProf.toString().trim() : "";
    });
  } catch (e) {
    Logger.log("resolverNombreDocenteGrupoMateria: " + e.message);
  }
  return nombre;
}

function armarBloquesMateriasPortalEstudiante(est, filas, docentesPrecargados) {
  const docentes = docentesPrecargados || obtenerNodoDocentesFirebase();
  const asignaciones = obtenerAsignacionesMateriasGrupoEstudiante(est.grupo_completo, docentes);
  const porMateria = indexarFilasCalificacionesPorMateria(filas);
  const bloques = [];
  const materiasAsignadas = {};

  asignaciones.forEach(function(asig) {
    materiasAsignadas[normalizarNombreMateriaPortal(asig.materia)] = true;
    bloques.push({
      grupo: asig.grupo,
      materia: asig.materia,
      nombreDocente: asig.nombreDocente,
      filas: filasCalificacionesParaAsignacion(porMateria, asig)
    });
  });

  const mapaHuerfanos = {};
  (filas || []).forEach(function(f) {
    let mNorm = normalizarNombreMateriaPortal(f.materia);
    if (materiasAsignadas[mNorm]) return;
    let key = claveGrupoMateriaActaIntegracion(f.grupo, f.materia);
    if (!mapaHuerfanos[key]) {
      mapaHuerfanos[key] = {
        grupo: f.grupo,
        materia: f.materia,
        nombreDocente: resolverNombreDocenteGrupoMateria(f.grupo, f.materia, docentes),
        filas: []
      };
    }
    mapaHuerfanos[key].filas.push(f);
  });
  for (let key in mapaHuerfanos) {
    bloques.push(mapaHuerfanos[key]);
  }

  if (bloques.length === 0 && filas.length > 0) {
    const mapa = {};
    filas.forEach(function(f) {
      let k = claveGrupoMateriaActaIntegracion(f.grupo, f.materia);
      if (!mapa[k]) {
        mapa[k] = {
          grupo: f.grupo,
          materia: f.materia,
          nombreDocente: resolverNombreDocenteGrupoMateria(f.grupo, f.materia, docentes),
          filas: []
        };
      }
      mapa[k].filas.push(f);
    });
    for (let k in mapa) bloques.push(mapa[k]);
  }

  bloques.sort(function(a, b) {
    return a.materia.localeCompare(b.materia, "es", { sensitivity: "base" });
  });
  return bloques;
}

function construirDetalleMateriaPortalEstudiante(bloque, infoModelo, nombreCarrera, indiceActasIntegracion) {
  let totalUnidades = obtenerTotalUnidadesAsignacionPublica(bloque.grupo, bloque.materia);
  if (!totalUnidades) totalUnidades = inferirTotalUnidadesDesdeFilas(bloque.filas);

  let unidades = [];
  let unidadesDefinitivas = 0;
  let unidadesTemporales = 0;
  let notasIntegracion = [];
  let tieneUnidadReprobada = false;

  for (let i = 1; i <= totalUnidades; i++) {
    let unidadId = "U" + i;
    let fila = null;
    for (let j = 0; j < bloque.filas.length; j++) {
      if (bloque.filas[j].unidad.toString().toUpperCase() === unidadId) {
        fila = bloque.filas[j];
        break;
      }
    }
    let notaRaw = fila ? fila.calificacion : "";
    let estadoCaptura = fila ? fila.estadoCaptura : "";
    let escala = fila
      ? { numerico: fila.calificacionNumerica, alfabetico: fila.calificacionAlfabetica }
      : { numerico: "", alfabetico: "" };
    const notaPresente = notaRaw !== null && notaRaw !== undefined && notaRaw.toString().trim() !== "";
    const esDefinitivo = estadoCaptura === "DEFINITIVO" && notaPresente;
    if (esDefinitivo) {
      unidadesDefinitivas++;
      if (esCalificacionUnidadReprobada(notaRaw, infoModelo.modelo)) {
        tieneUnidadReprobada = true;
      }
      notasIntegracion.push(notaRaw);
    } else {
      notasIntegracion.push(null);
      if (notaPresente) unidadesTemporales++;
    }
    unidades.push({
      unidad: unidadId,
      calificacion: notaRaw,
      calificacionNumerica: escala.numerico,
      calificacionAlfabetica: escala.alfabetico,
      estadoCaptura: estadoCaptura || (fila ? "TEMPORAL" : "")
    });
  }

  const todasUnidadesDefinitivas = totalUnidades > 0 && unidadesDefinitivas === totalUnidades;
  const actaIntegracionPublicada = !!indiceActasIntegracion[claveGrupoMateriaActaIntegracion(bloque.grupo, bloque.materia)];
  const puedeVerPromedioMateria = todasUnidadesDefinitivas && actaIntegracionPublicada;

  let promedioIntegracion = null;
  let estatusMateria = null;
  if (puedeVerPromedioMateria) {
    promedioIntegracion = resultadoIntegracionAlumno(notasIntegracion, infoModelo.modelo);
    let noAprob = tieneUnidadReprobada || estatusIntegracionEsNoAprobado(promedioIntegracion, infoModelo.modelo);
    estatusMateria = noAprob ? "No aprobado" : "Aprobado";
  }

  return {
    grupo: bloque.grupo,
    materia: bloque.materia,
    nombreDocente: bloque.nombreDocente || "",
    nombreCarrera: nombreCarrera,
    totalUnidades: totalUnidades,
    unidadesDefinitivas: unidadesDefinitivas,
    unidadesTemporales: unidadesTemporales,
    todasUnidadesDefinitivas: todasUnidadesDefinitivas,
    actaIntegracionPublicada: actaIntegracionPublicada,
    puedeVerPromedioMateria: puedeVerPromedioMateria,
    unidades: unidades,
    promedioIntegracion: promedioIntegracion,
    estatusMateria: estatusMateria,
    tieneUnidadReprobada: tieneUnidadReprobada
  };
}

function construirMateriasPortalEstudiante(est, filas, cuatrimestre, indiceActasIntegracion, docentesPrecargados) {
  const infoModelo = obtenerModeloEvaluacionEstudiante(est);
  const nombreCarrera = resolverNombreCarreraEstudiante(est);
  const bloques = armarBloquesMateriasPortalEstudiante(est, filas, docentesPrecargados);
  const materias = [];
  for (let i = 0; i < bloques.length; i++) {
    materias.push(construirDetalleMateriaPortalEstudiante(bloques[i], infoModelo, nombreCarrera, indiceActasIntegracion));
  }
  return materias;
}

function calcularResumenFinalPortalEstudiante(materias, infoModelo) {
  const vacio = {
    visible: false,
    promedioFinalNumerico: "",
    promedioFinalAlfabetico: "",
    estatusGlobal: "",
    mensajePendiente: "",
    materiasCompletas: 0,
    totalMaterias: 0
  };
  if (!materias || materias.length === 0) {
    vacio.mensajePendiente = "Aún no hay materias con calificaciones registradas para determinar su promedio y estatus.";
    return vacio;
  }

  vacio.totalMaterias = materias.length;
  let materiasCompletas = 0;
  for (let i = 0; i < materias.length; i++) {
    if (materias[i].todasUnidadesDefinitivas) materiasCompletas++;
  }
  vacio.materiasCompletas = materiasCompletas;

  if (materiasCompletas < materias.length) {
    vacio.mensajePendiente =
      "Su promedio y estatus del cuatrimestre aún no se pueden determinar. " +
      "Debe tener calificaciones definitivas en todas las unidades de cada materia " +
      "(" + materiasCompletas + " de " + materias.length + " materias completas).";
    return vacio;
  }

  let suma = 0;
  let conteo = 0;
  let estatusGlobal = "Aprobado";

  materias.forEach(function(m) {
    let notasUnidades = (m.unidades || []).map(function(u) {
      if ((u.estadoCaptura || "").toUpperCase() === "DEFINITIVO" && u.calificacion) {
        return u.calificacion;
      }
      return null;
    });
    let promMateria = resultadoIntegracionAlumno(notasUnidades, infoModelo.modelo);
    if (m.tieneUnidadReprobada || estatusIntegracionEsNoAprobado(promMateria, infoModelo.modelo)) {
      estatusGlobal = "No aprobado";
    }
    let n = parseNumericoPromedioIntegracion(promMateria);
    if (n !== null) {
      suma += n;
      conteo++;
    }
  });

  let promedioFinalNumerico = "";
  let promedioFinalAlfabetico = "";
  if (conteo > 0) {
    let prom = (suma / conteo).toFixed(1);
    promedioFinalNumerico = prom;
    let escalaFinal = escalaAlfabeticaDesdeNota(prom, infoModelo.modelo);
    promedioFinalAlfabetico = escalaFinal.alfabetico;
    if (estatusGlobal === "Aprobado" && estatusIntegracionEsNoAprobado(escalaFinal, infoModelo.modelo)) {
      estatusGlobal = "No aprobado";
    }
  }

  return {
    visible: true,
    promedioFinalNumerico: promedioFinalNumerico,
    promedioFinalAlfabetico: promedioFinalAlfabetico,
    estatusGlobal: estatusGlobal,
    mensajePendiente: "",
    materiasCompletas: materias.length,
    totalMaterias: materias.length
  };
}

function construirRespuestaPortalEstudianteDesdePerfil(est, opciones) {
  opciones = opciones || {};
  const cuatrimestre = getCuatrimestreActivo();
  const docentesNodo = obtenerNodoDocentesFirebase();
  const filas = recolectarCalificacionesMatriculaEstudiante(est.matricula, est);
  const indiceActas = cargarIndiceActasIntegracionPublicadas(cuatrimestre);
  const infoModelo = obtenerModeloEvaluacionEstudiante(est);
  const materias = construirMateriasPortalEstudiante(est, filas, cuatrimestre, indiceActas, docentesNodo);
  const resumenFinal = calcularResumenFinalPortalEstudiante(materias, infoModelo);

  return {
    exito: true,
    alumno: est,
    cuatrimestre: cuatrimestre,
    nombreCarrera: resolverNombreCarreraEstudiante(est),
    materias: materias,
    resumenFinal: resumenFinal,
    calificaciones: filas,
    totalRegistros: filas.length,
    vistaAdmin: !!opciones.vistaAdmin,
    esAlumnoDemo: !!opciones.esAlumnoDemo
  };
}

/** Datos del portal estudiante: materias agrupadas, detalle por unidad y resumen final. */
function obtenerCalificacionesPortalEstudiante() {
  const est = assertEstudianteAutenticado();
  return construirRespuestaPortalEstudianteDesdePerfil(est, { vistaAdmin: false });
}

/**
 * Admin: ver el portal exactamente como lo vería un alumno por matrícula (solo lectura).
 * No cambia correos ni sesión del alumno.
 */
function obtenerCalificacionesPortalEstudianteVistaAdmin(matricula) {
  assertUsuarioAdministrador();
  const mat = (matricula || "").toString().trim();
  if (!mat) {
    throw new Error("Indique la matrícula del alumno a previsualizar.");
  }
  const est = buscarEstudiantePorMatricula(mat);
  if (!est) {
    throw new Error("No se encontró la matrícula «" + mat + "» en el catálogo Estudiantes del ciclo activo.");
  }
  if (est.estatus && est.estatus !== "ACTIVO") {
    throw new Error("Ese registro no está ACTIVO; no se puede previsualizar el portal.");
  }
  const resp = construirRespuestaPortalEstudianteDesdePerfil(est, {
    vistaAdmin: true,
    esAlumnoDemo: mat === MATRICULA_ESTUDIANTE_DEMO_PORTAL
  });
  return resp;
}

/** Admin: buscar alumnos por matrícula o nombre (máx. 20) para abrir vista previa. */
function buscarEstudiantesParaVistaAdmin(termino) {
  assertUsuarioAdministrador();
  const t = (termino || "").toString().trim();
  if (t.length < 2) {
    return { resultados: [], mensaje: "Escriba al menos 2 caracteres (matrícula o nombre)." };
  }
  const tNorm = t.toLowerCase();
  const estudiantes = cargarEstudiantesFirebase() || {};
  const resultados = [];
  for (let matricula in estudiantes) {
    if (resultados.length >= 20) break;
    let est = estudiantes[matricula];
    if (!est) continue;
    let nombre = (est.alumno || "").toString();
    let grupo = (est.grupo_completo || "").toString();
    let mail = (est.correo_institucional || est.correo || "").toString();
    let coincide =
      matricula.indexOf(t) >= 0 ||
      nombre.toLowerCase().indexOf(tNorm) >= 0 ||
      mail.toLowerCase().indexOf(tNorm) >= 0;
    if (!coincide) continue;
    resultados.push({
      matricula: matricula.toString(),
      alumno: nombre.trim(),
      grupo_completo: grupo.trim(),
      correo_institucional: mail.trim(),
      esDemo: matricula.toString() === MATRICULA_ESTUDIANTE_DEMO_PORTAL
    });
  }
  resultados.sort(function(a, b) {
    return a.alumno.localeCompare(b.alumno, "es", { sensitivity: "base" });
  });
  return {
    resultados: resultados,
    total: resultados.length,
    matriculaDemo: MATRICULA_ESTUDIANTE_DEMO_PORTAL,
    correoDemo: CORREO_ESTUDIANTE_DEMO_PORTAL
  };
}

/** Perfil del alumno ficticio de prueba (no modifica registros reales hasta que usted publique). */
function obtenerPerfilEstudianteDemoPortal() {
  return {
    alumno: "ALUMNO DEMO PORTAL (prueba, no real)",
    Grado_Actual: "9",
    Grupo: "A",
    cve_carrera: "IDGS",
    carrera: "Ingeniería en Desarrollo y Gestión de Software",
    grupo_completo: "09A IDGS",
    correo_institucional: CORREO_ESTUDIANTE_DEMO_PORTAL,
    estatus: "ACTIVO",
    ciclo: getCuatrimestreActivo()
  };
}

/**
 * Admin: crea/actualiza solo el registro demo en Firebase (matrícula 0000000000).
 * No altera otros alumnos ni reasigna correos existentes.
 */
function publicarEstudianteDemoPortalEnFirebase() {
  assertUsuarioAdministrador();
  const mat = MATRICULA_ESTUDIANTE_DEMO_PORTAL;
  const perfil = obtenerPerfilEstudianteDemoPortal();
  const urlEst = construirUrlFirebaseSegmentos(["Estudiantes", sanitizarSegmentoRutaFirebase(mat)]);
  let resp = fetchFirebaseUrl(urlEst, {
    method: "put",
    contentType: "application/json",
    payload: JSON.stringify(perfil),
    muteHttpExceptions: true
  });
  if (resp.getResponseCode() >= 300) {
    throw new Error("No se pudo guardar el alumno demo en Firebase (HTTP " + resp.getResponseCode() + ").");
  }
  try {
    let indicePerfil = perfilEstudiantePortalDesdeRegistro(mat, perfil, CORREO_ESTUDIANTE_DEMO_PORTAL);
    fetchFirebaseUrl(construirUrlFirebaseSegmentos([
      "INDICES", "ESTUDIANTES_POR_CORREO", claveCorreoIndiceEstudiante(CORREO_ESTUDIANTE_DEMO_PORTAL)
    ]), {
      method: "put",
      contentType: "application/json",
      payload: JSON.stringify(indicePerfil),
      muteHttpExceptions: true
    });
  } catch (e) {
    Logger.log("publicarEstudianteDemoPortalEnFirebase índice: " + e.message);
  }
  CacheService.getScriptCache().remove("fb_Estudiantes_v1");
  return "Alumno demo publicado: matrícula " + mat + ", correo " + CORREO_ESTUDIANTE_DEMO_PORTAL +
    ". Use «Vista previa portal» con esa matrícula. Las calificaciones serán las capturadas para esa matrícula en Firebase (inicialmente vacías).";
}

/**
 * Filtro de seguridad para cuentas de Administrador e inicio de sesión unificado
 */
function verificarPermisosYBloqueo() {
  let correo = obtenerCorreoSesionWebApp_();
  if (!correo) {
    return {
      accesoDenegado: true,
      mensaje: "Debe iniciar sesión. Pulse «Ingresar a la aplicación» y use su correo institucional "
        + SUFIJO_DOMINIO_INSTITUCIONAL + "."
    };
  }
  if (!esCorreoInstitucionalUtzmg(correo)) {
    return {
      accesoDenegado: true,
      mensaje: "Esta plataforma es solo para cuentas institucionales " + SUFIJO_DOMINIO_INSTITUCIONAL + ". "
        + "Cierre sesión de Google e ingrese con su correo de la universidad."
    };
  }

  let isAdmin = false;
  let estaBloqueado = false;
  let nombreUsuario = "Docente";

  if (visitanteTieneSesionGoogleIdentificada_() && esCorreoAdministrador(correo)) {
    isAdmin = true;
    nombreUsuario = "Administrador del Sistema";
    return { isAdmin: isAdmin, estaBloqueado: obtenerEstadoBloqueo(), nombre: nombreUsuario, correo: correo };
  }

  if (obtenerEstadoBloqueo()) {
    estaBloqueado = true;
  }

  let docenteLogin = null;
  let catalogoDocentesVacio = false;
  let docentes = null;

  try {
    docentes = obtenerNodoDocentesFirebase({ sinCache: true });
    if (!docentes || Object.keys(docentes).length === 0) {
      docentes = obtenerNodoDocentesFirebase({ sinCache: false }) || docentes;
    }
    if (!estaBloqueado) {
      const resBloqueados = fetchFirebasePath("Usuarios_Bloqueados.json", { muteHttpExceptions: true });
      if (resBloqueados.getResponseCode() === 200) {
        let bloqueados = {};
        try {
          bloqueados = JSON.parse(resBloqueados.getContentText() || "null") || {};
        } catch (eParseBloq) {
          Logger.log("Usuarios_Bloqueados parse: " + eParseBloq.message);
        }
        let llaveBloqueado = correo.replace(/[\.\#\$\[\]\s]/g, "_");
        if (bloqueados && bloqueados[llaveBloqueado]) {
          estaBloqueado = true;
        }
      }
    }

    if (!docentes || Object.keys(docentes).length === 0) {
      catalogoDocentesVacio = true;
    }
    docenteLogin = buscarDocentePorCorreo(docentes, correo);
    if (docenteLogin && docenteLogin.PROFESOR) {
      nombreUsuario = docenteLogin.PROFESOR.toString().trim();
    }
  } catch (e) {
    Logger.log("Error en verificarPermisosYBloqueo: " + e.message);
    catalogoDocentesVacio = true;
  }

  if (docenteLogin) {
    return {
      isAdmin: false,
      isDocente: true,
      isEstudiante: false,
      estaBloqueado: estaBloqueado,
      nombre: nombreUsuario,
      correo: correo
    };
  }

  const perfilEst = buscarEstudiantePorCorreoInstitucional(correo);
  if (perfilEst) {
    if (perfilEst.estatus && perfilEst.estatus !== "ACTIVO") {
      return {
        accesoDenegado: true,
        mensaje: "Su registro como estudiante no está activo en este ciclo. "
          + "Escríba a " + CORREO_CONTACTO_SOPORTE_TECNICO + "."
      };
    }
    return {
      isAdmin: false,
      isDocente: false,
      isEstudiante: true,
      estaBloqueado: false,
      nombre: perfilEst.alumno || "Estudiante",
      matricula: perfilEst.matricula,
      carrera: perfilEst.carrera,
      grupoCompleto: perfilEst.grupo_completo,
      correo: correo
    };
  }

  var httpEstudiantes = codigoHttpLecturaFirebasePath_("Estudiantes.json");
  if (catalogoDocentesVacio || httpEstudiantes !== 200) {
    registrarDiagnosticoLoginFallido_(correo, catalogoDocentesVacio, httpEstudiantes, docentes);
    return {
      accesoDenegado: true,
      mensaje: mensajeFalloValidacionAccesoUsuario_()
    };
  }

  registrarDiagnosticoLoginFallido_(correo, false, httpEstudiantes, docentes);
  return {
    accesoDenegado: true,
    mensaje: mensajeCuentaNoRegistradaUsuario_(correo)
  };
}

// Funciones para controlar el Bloqueo desde el Servidor
function cambiarEstadoBloqueo(bloquear) {
  assertUsuarioAdministrador();
  const propiedades = PropertiesService.getScriptProperties();
  propiedades.setProperty("SISTEMA_BLOQUEADO", bloquear ? "SI" : "NO");
  return bloquear ? "Sistema bloqueado correctamente." : "Sistema desbloqueado correctamente.";
}

function obtenerEstadoBloqueo() {
  const propiedades = PropertiesService.getScriptProperties();
  return propiedades.getProperty("SISTEMA_BLOQUEADO") === "SI";
}

function probarDashboardCompleto() {
  assertUsuarioAdministrador();
  Logger.log("--- PROBANDO CÁLCULO DE DASHBOARD GENERAL ---");
  var analitica = getDatosDashboardAdmin();
  
  Logger.log("Matrícula Total Detectada: " + analitica.matriculaTotal);
  Logger.log("Eficiencia Global de la Universidad: " + analitica.eficienciaGlobal);
  Logger.log("Alumnos en Riesgo (Reprobados): " + analitica.alumnosEnRiesgo);
  Logger.log("--- VISTA DE SEMÁFORO (Muestra de avance) ---");
  Logger.log(analitica.docentesSemaforo);
}

// --- AUTENTICIDAD DE ACTAS (código consultable en Firebase) ---
function normalizarCodigoVerificacionActa(codigo) {
  return codigo ? codigo.toString().trim().toUpperCase().replace(/\s+/g, "") : "";
}

function generarCodigoPublicoActa(cuatrimestre) {
  const ciclo = (cuatrimestre || getCuatrimestreActivo()).toString().trim().toUpperCase();
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let sufijo = "";
  for (let i = 0; i < 8; i++) {
    sufijo += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return "UTZMG-" + ciclo + "-" + sufijo;
}

function huellaContenidoActa(tipoActa, grupo, materia, unidad, cuatrimestre, correoDocente, filas) {
  const filasOrdenadas = (filas || []).slice().sort(function(a, b) {
    return String(a[1]).localeCompare(String(b[1]));
  });
  const partes = [
    tipoActa.toUpperCase(),
    grupo.toString().trim().toUpperCase(),
    materia.toString().trim().toUpperCase(),
    (unidad || "").toString().trim().toUpperCase(),
    cuatrimestre.toString().trim().toUpperCase(),
    correoDocente.toString().trim().toLowerCase()
  ];
  filasOrdenadas.forEach(function(f) {
    partes.push(String(f[1]).trim() + ":" + String(f[3]).trim() + ":" + String(f[4] || "").trim());
  });
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    partes.join("|"),
    Utilities.Charset.UTF_8
  );
  return digest.map(function(b) {
    const v = b < 0 ? b + 256 : b;
    return ("0" + v.toString(16)).slice(-2);
  }).join("");
}

function registrarCodigoAutenticidadActa(payload) {
  assertCorreoInstitucional();
  if (!payload) throw new Error("Faltan datos para registrar el acta.");
  if (obtenerEstadoBloqueo()) {
    throw new Error("El periodo de captura ha finalizado.");
  }

  const tipoActa = payload.tipoActa ? payload.tipoActa.toString().trim().toUpperCase() : "";
  const grupo = payload.grupo ? payload.grupo.toString().trim() : "";
  const materia = payload.materia ? payload.materia.toString().trim() : "";
  const unidad = payload.unidad ? payload.unidad.toString().trim().toUpperCase() : "";
  const cuatrimestre = payload.cuatrimestre || getCuatrimestreActivo();
  const filas = payload.filas || [];

  if (!tipoActa || !grupo || !materia || !filas.length) {
    throw new Error("Datos incompletos para generar el código de autenticidad.");
  }

  assertDocenteAsignadoGrupoMateria(grupo, materia);

  if (tipoActa === "PARCIAL") {
    const meta = obtenerMetaUnidadCaptura(grupo, materia, unidad);
    if (meta.estado_captura !== "DEFINITIVO") {
      return { exito: false, sinCodigo: true, mensaje: "Solo actas con guardado definitivo reciben código." };
    }
  } else if (tipoActa === "INTEGRACION") {
    const estado = evaluarEstadoActaIntegracion(grupo, materia);
    if (!estado.habilitada) {
      throw new Error(estado.motivo || "El acta de integración aún no está completa en definitivo.");
    }
  } else {
    throw new Error("Tipo de acta no válido.");
  }

  const docente = getCorreoUsuario();
  const datosDocente = getDatosDocente();
  const huella = huellaContenidoActa(tipoActa, grupo, materia, unidad, cuatrimestre, docente, filas);
  const urlIndice = URL_BASE_FIREBASE + "VERIFICACION_ACTAS_INDICE/" + huella + ".json";

  const respIndice = fetchFirebaseUrl(urlIndice, { muteHttpExceptions: true });
  if (respIndice.getResponseCode() === 200) {
    const indice = JSON.parse(respIndice.getContentText());
    if (indice && indice.codigo) {
      actualizarFechaUltimaEmisionActa(indice.codigo);
      return { exito: true, codigo: indice.codigo, reutilizado: true };
    }
  }

  let codigo = generarCodigoPublicoActa(cuatrimestre);
  for (let intento = 0; intento < 5; intento++) {
    const urlCodigo = URL_BASE_FIREBASE + "VERIFICACION_ACTAS/" + encodeURIComponent(codigo) + ".json";
    const existe = fetchFirebaseUrl(urlCodigo, { muteHttpExceptions: true });
    if (existe.getResponseCode() !== 200) break;
    codigo = generarCodigoPublicoActa(cuatrimestre);
  }

  const ahora = new Date().toISOString();
  const registro = {
    codigo: codigo,
    tipo_acta: tipoActa,
    grupo: grupo.toUpperCase(),
    materia: materia,
    unidad: unidad || (tipoActa === "INTEGRACION" ? "INTEGRACIÓN" : ""),
    cuatrimestre: cuatrimestre,
    nombre_carrera: payload.nombreCarrera || resolverNombreCarreraActa(grupo, ""),
    nombre_profesor: payload.nombreProfesor || datosDocente.nombre,
    docente: docente,
    total_alumnos: filas.length,
    huella_datos: huella,
    estado_captura: "DEFINITIVO",
    fecha_registro: ahora,
    fecha_ultima_emision: ahora
  };

  fetchFirebaseUrl(URL_BASE_FIREBASE + "VERIFICACION_ACTAS/" + encodeURIComponent(codigo) + ".json", {
    method: "put",
    contentType: "application/json",
    payload: JSON.stringify(registro)
  });
  fetchFirebaseUrl(urlIndice, {
    method: "put",
    contentType: "application/json",
    payload: JSON.stringify({ codigo: codigo, fecha_registro: ahora })
  });

  return { exito: true, codigo: codigo, reutilizado: false };
}

function actualizarFechaUltimaEmisionActa(codigo) {
  const cod = normalizarCodigoVerificacionActa(codigo);
  const url = URL_BASE_FIREBASE + "VERIFICACION_ACTAS/" + encodeURIComponent(cod) + ".json";
  try {
    const resp = fetchFirebaseUrl(url, { muteHttpExceptions: true });
    if (resp.getResponseCode() !== 200) return;
    const reg = JSON.parse(resp.getContentText());
    if (!reg) return;
    reg.fecha_ultima_emision = new Date().toISOString();
    fetchFirebaseUrl(url, {
      method: "put",
      contentType: "application/json",
      payload: JSON.stringify(reg)
    });
  } catch (e) {
    Logger.log("actualizarFechaUltimaEmisionActa: " + e.message);
  }
}

function consultarVerificacionActa(codigoEntrada) {
  assertUsuarioAdministrador();
  const codigo = normalizarCodigoVerificacionActa(codigoEntrada);
  if (!codigo || codigo.length < 10) {
    return { exito: false, mensaje: "Formato de código inválido." };
  }
  const url = URL_BASE_FIREBASE + "VERIFICACION_ACTAS/" + encodeURIComponent(codigo) + ".json";
  const resp = fetchFirebaseUrl(url, { muteHttpExceptions: true });
  if (resp.getResponseCode() !== 200) {
    return {
      exito: false,
      mensaje: "El código no está registrado en el sistema. El documento podría ser una copia no válida."
    };
  }
  const reg = JSON.parse(resp.getContentText());
  if (!reg || !reg.codigo) {
    return { exito: false, mensaje: "Registro de verificación incompleto o corrupto." };
  }
  return {
    exito: true,
    datos: {
      codigo: reg.codigo,
      tipo_acta: reg.tipo_acta,
      grupo: reg.grupo,
      materia: reg.materia,
      unidad: reg.unidad,
      cuatrimestre: reg.cuatrimestre,
      nombre_carrera: reg.nombre_carrera,
      nombre_profesor: reg.nombre_profesor,
      total_alumnos: reg.total_alumnos,
      fecha_registro: reg.fecha_registro,
      fecha_ultima_emision: reg.fecha_ultima_emision,
      estado_captura: reg.estado_captura
    }
  };
}

/** Logo institucional para actas PDF (servidor evita restricciones CORS del navegador). */
var URL_LOGO_UTZMG_ACTA = "https://utzmg.edu.mx/wp-content/uploads/2023/08/cropped-Logotipo-UTZMG_logo.png";

function getLogoActaBase64() {
  try {
    const resp = UrlFetchApp.fetch(URL_LOGO_UTZMG_ACTA, { muteHttpExceptions: true });
    if (resp.getResponseCode() !== 200) {
      return { exito: false, error: "No se pudo descargar el logo (HTTP " + resp.getResponseCode() + ")." };
    }
    const blob = resp.getBlob();
    return {
      exito: true,
      mime: blob.getContentType() || "image/png",
      data: Utilities.base64Encode(blob.getBytes())
    };
  } catch (e) {
    Logger.log("getLogoActaBase64: " + e.message);
    return { exito: false, error: e.message };
  }
}

function obtenerMetadatosListaAsistencia(grupo, materia) {
  if (obtenerEstadoBloqueo()) {
    throw new Error("El periodo de captura ha finalizado.");
  }
  assertDocenteAsignadoGrupoMateria(grupo, materia);
  const datosDocente = getDatosDocente();
  return {
    exito: true,
    nombreProfesor: datosDocente.nombre || "DOCENTE UTZMG",
    nombreCarrera: resolverNombreCarreraActa(grupo, ""),
    cuatrimestre: getCuatrimestreActivo()
  };
}

// 8. OBTENER DATOS UNIFICADOS PARA LA GENERACIÓN DE EXCEL DESDE FIREBASE
function obtenerDatosParaExcel(grupo, materia, periodo) {
  try {
    if (obtenerEstadoBloqueo()) {
      return { exito: false, error: "El periodo de captura ha finalizado." };
    }
    assertDocenteAsignadoGrupoMateria(grupo, materia);
    const alumnos = getAlumnosPorGrupoSinAuth(grupo);
    const calificaciones = obtenerCalificacionesExistentes(grupo, materia, periodo);
    const datosDocente = getDatosDocente();
    const meta = obtenerMetaUnidadCaptura(grupo, materia, periodo);

    const infoModelo = obtenerModeloEvaluacionGrupo(grupo);
    let filasAlumnos = alumnos.map(function(alumno, index) {
      let nota = calificaciones[alumno.matricula];
      if (nota === undefined || nota === null) nota = "";
      const escala = escalaAlfabeticaDesdeNota(nota, infoModelo.modelo);
      return [index + 1, alumno.matricula, alumno.nombre, escala.numerico, escala.alfabetico];
    });

    return {
      exito: true,
      filas: filasAlumnos,
      nombreProfesor: datosDocente.nombre,
      estadoCaptura: meta.estado_captura || "SIN_REGISTRO",
      cuatrimestre: meta.cuatrimestre || getCuatrimestreActivo(),
      nombreCarrera: resolverNombreCarreraActa(grupo, ""),
      modeloEvaluacion: infoModelo.modelo,
      modeloEvaluacionEtiqueta: infoModelo.etiqueta
    };
  } catch (e) {
    Logger.log("Error al compilar datos para acta: " + e.message);
    return { exito: false, error: e.message };
  }
}


/// ==========================================
// FUNCIÓN DE MANTENIMIENTO E INDEXACIÓN AUTOMÁTICA (CORREGIDA)
//Se debe subir el json plano a firebase y luego ejecutar a mano esta funcion, o puede ser que 
//se ejecute el activador que se programo. El profe dario tenia error en su correo por eso no salia completo
// ==========================================

/**
 * Obsoleta desde catálogo 2026S + INDICES/ESTUDIANTES_POR_CORREO.
 * No modifica Firebase (evita fallos en activadores programados sin sesión admin).
 * Elimine el activador de tiempo en Apps Script → Activadores.
 * Mantenimiento manual: regenerarIndiceEstudiantesPorCorreo() y publicarCatalogos2026S().
 */
function indexarColeccionesAutomaticamente() {
  const msg =
    "indexarColeccionesAutomaticamente está desactivada. Use regenerarIndiceEstudiantesPorCorreo() "
    + "o publicarCatalogos2026S(). Elimine el activador programado de esta función.";
  Logger.log(msg);
  return msg;
}

// ==========================================
// PASO 2 — CICLO 2026M → 2026S (ARCHIVO Y PUBLICACIÓN)
// ==========================================

function obtenerOCrearCarpetaRespaldosCaptura() {
  const nombre = "Respaldos Captura Calificaciones UTZMG";
  const carpetas = DriveApp.getFoldersByName(nombre);
  if (carpetas.hasNext()) return carpetas.next();
  return DriveApp.createFolder(nombre);
}

function guardarTextoEnCarpetaRespaldos(nombreArchivo, contenido) {
  const carpeta = obtenerOCrearCarpetaRespaldosCaptura();
  const existentes = carpeta.getFilesByName(nombreArchivo);
  while (existentes.hasNext()) existentes.next().setTrashed(true);
  return carpeta.createFile(nombreArchivo, contenido, MimeType.PLAIN_TEXT);
}

/**
 * 1) Copia Docentes, Estudiantes y CALIFICACIONES a ARCHIVO/2026M/
 * 2) Guarda respaldo JSON en Google Drive
 * Ejecutar ANTES de publicar 2026S.
 */
function archivarCuatrimestre2026M() {
  assertUsuarioAdministrador();
  const prefijo = "ARCHIVO/2026M/";
  const fecha = new Date().toISOString();
  const nodos = ["Docentes", "Estudiantes", "CALIFICACIONES"];
  const paqueteRespaldo = { ciclo: "2026M", fecha_archivo: fecha, nodos: {} };

  nodos.forEach(function(nodo) {
    const texto = fetchFirebasePath(nodo + ".json").getContentText();
    paqueteRespaldo.nodos[nodo] = JSON.parse(texto || "null");
    fetchFirebasePath(prefijo + nodo + ".json", {
      method: "put",
      contentType: "application/json",
      payload: texto || "null"
    });
  });

  fetchFirebasePath(prefijo + "metadata.json", {
    method: "put",
    contentType: "application/json",
    payload: JSON.stringify({
      ciclo: "2026M",
      fecha_archivo: fecha,
      descripcion: "Cierre cuatrimestre 2026M — copia de nodos activos"
    })
  });

  const archivoDrive = guardarTextoEnCarpetaRespaldos(
    "Respaldo_FIREBASE_2026M_" + fecha.slice(0, 10) + ".json",
    JSON.stringify(paqueteRespaldo)
  );

  cambiarEstadoBloqueo(true);
  return "✅ Archivado en Firebase (" + prefijo + ") y respaldo Drive: " + archivoDrive.getName();
}

/** Guarda en Script Properties los IDs de Drive de Docentes_2026S.json y Estudiantes_2026S.json */
function registrarIdsCatalogos2026S(idArchivoDocentesDrive, idArchivoEstudiantesDrive) {
  assertUsuarioAdministrador();
  const props = PropertiesService.getScriptProperties();
  props.setProperty("ID_DOCENTES_2026S", idArchivoDocentesDrive);
  props.setProperty("ID_ESTUDIANTES_2026S", idArchivoEstudiantesDrive);
  return "IDs registrados correctamente.";
}

function leerJsonDesdeDrive(fileId) {
  return JSON.parse(DriveApp.getFileById(fileId).getBlob().getDataAsString("UTF-8"));
}

function cargarDocentes2026SParaPublicacion_(idArchivoDrive) {
  if (typeof obtenerCatalogoDocentes2026SEmbebido_ === "function") {
    return obtenerCatalogoDocentes2026SEmbebido_();
  }
  var props = PropertiesService.getScriptProperties();
  var idDoc = idArchivoDrive || props.getProperty("ID_DOCENTES_2026S");
  if (!idDoc) {
    throw new Error(
      "No se encontró catálogo embebido (Docentes2026S_embed.gs). Vuelva a hacer clasp push "
      + "o pase el ID de Docentes_2026S.json en Drive: publicarSoloDocentes2026S('ID_ARCHIVO')."
    );
  }
  return leerJsonDesdeDrive(idDoc);
}

/**
 * Admin: sube Docentes_2026S a Firebase (no toca Estudiantes ni CALIFICACIONES).
 * @param {string} [idArchivoDrive] Opcional si falta el archivo Docentes2026S_embed.gs
 */
function publicarSoloDocentes2026S(idArchivoDrive) {
  assertUsuarioAdministrador();
  var docentes = cargarDocentes2026SParaPublicacion_(idArchivoDrive);
  var resp = fetchFirebasePath("Docentes.json", {
    method: "put",
    contentType: "application/json",
    payload: JSON.stringify(docentes)
  });
  try {
    CacheService.getScriptCache().remove("fb_Docentes_v1");
  } catch (eCache) {}
  var code = resp.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error("Firebase PUT Docentes HTTP " + code + ": " + resp.getContentText().slice(0, 200));
  }
  var jg = docentes["jguerrero@utzmg_edu_mx"];
  return "Publicados " + Object.keys(docentes).length + " docentes. Guerrero CORREO: "
    + (jg && jg.CORREO ? jg.CORREO : "?");
}

/**
 * Reemplaza nodos activos Docentes/Estudiantes y deja CALIFICACIONES vacío.
 * Requiere registrarIdsCatalogos2026S() o pasar IDs explícitos.
 */
function publicarCatalogos2026S(idArchivoDocentesDrive, idArchivoEstudiantesDrive) {
  assertUsuarioAdministrador();
  const props = PropertiesService.getScriptProperties();
  const idDoc = idArchivoDocentesDrive || props.getProperty("ID_DOCENTES_2026S");
  const idEst = idArchivoEstudiantesDrive || props.getProperty("ID_ESTUDIANTES_2026S");
  if (!idDoc || !idEst) {
    throw new Error("Faltan IDs de Drive. Ejecute registrarIdsCatalogos2026S(idDoc, idEst).");
  }

  const docentes = leerJsonDesdeDrive(idDoc);
  const estudiantes = leerJsonDesdeDrive(idEst);

  fetchFirebasePath("Docentes.json", {
    method: "put",
    contentType: "application/json",
    payload: JSON.stringify(docentes)
  });
  fetchFirebasePath("Estudiantes.json", {
    method: "put",
    contentType: "application/json",
    payload: JSON.stringify(estudiantes)
  });
  publicarIndiceEstudiantesPorCorreo(estudiantes);
  fetchFirebasePath("INDICES/CALIFICACIONES_POR_MATRICULA.json", {
    method: "put",
    contentType: "application/json",
    payload: "{}"
  });
  fetchFirebasePath("CALIFICACIONES.json", {
    method: "put",
    contentType: "application/json",
    payload: "{}"
  });
  fetchFirebasePath("CONFIG.json", {
    method: "put",
    contentType: "application/json",
    payload: JSON.stringify({
      ciclo_activo: "2026S",
      cuatrimestre: "2026S",
      captura_abierta: false,
      fecha_publicacion: new Date().toISOString()
    })
  });

  cambiarEstadoBloqueo(true);
  try {
    CacheService.getScriptCache().removeAll(["fb_CONFIG", "fb_Docentes_v1", "fb_Estudiantes_v1"]);
  } catch (eCache) {
    Logger.log("limpiar cache tras publicar: " + eCache.message);
  }
  return "✅ Publicados Docentes y Estudiantes 2026S. CALIFICACIONES vacío. Captura bloqueada.";
}

function publicarCatalogos2026S_desdePropiedades() {
  return publicarCatalogos2026S();
}

/**
 * Admin: reconstruye INDICES/ESTUDIANTES_POR_CORREO desde Estudiantes.json activo.
 * No modifica Estudiantes ni CALIFICACIONES. Seguro ejecutar en producción.
 */
function regenerarIndiceEstudiantesPorCorreo() {
  assertUsuarioAdministrador();
  const estudiantes = cargarEstudiantesFirebase();
  const n = publicarIndiceEstudiantesPorCorreo(estudiantes);
  return "Índice ESTUDIANTES_POR_CORREO actualizado: " + n + " registros.";
}

/** Tras editar Docentes.json en Firebase a mano, ejecute esto o espere ~10 min (caché). */
function limpiarCacheLecturasFirebase() {
  assertUsuarioAdministrador();
  try {
    CacheService.getScriptCache().removeAll(["fb_CONFIG", "fb_Docentes_v1", "fb_Estudiantes_v1"]);
  } catch (e) {
    Logger.log("limpiarCacheLecturasFirebase: " + e.message);
  }
  return "Caché de catálogos Firebase limpiada. Vuelva a intentar el login docente.";
}

/** Admin: llena caché de Docentes/Estudiantes (ejecutar tras desplegar Web App). */
function precalentarCacheCatalogosFirebase() {
  assertUsuarioAdministrador();
  var doc = obtenerNodoDocentesFirebase({ sinCache: true });
  var nDoc = doc ? Object.keys(doc).length : 0;
  cargarJsonFirebasePathConCache("Estudiantes.json", "fb_Estudiantes_v1", CACHE_FIREBASE_TTL_SEC);
  return "Caché precalentada: " + nDoc + " docentes en memoria del script (TTL "
    + CACHE_FIREBASE_TTL_SEC + " s).";
}

/** Diagnóstico: correo de sesión vs registro en Docentes (admin o el propio docente en prueba). */
function diagnosticarAccesoDocenteEnSesion() {
  const correo = assertCorreoInstitucional();
  return diagnosticarAccesoDocentePorCorreo(correo);
}

/**
 * Admin: salud de lectura Firebase → Docentes (ejecutar en el editor con lizbeth.noriega@…).
 * No usa Google Drive; solo RTDB + propiedad FIREBASE_DB_SECRET del proyecto.
 */
function diagnosticarLecturaFirebaseDocentes() {
  assertUsuarioAdministrador();
  var secret = getFirebaseDatabaseSecret();
  var resp = fetchFirebasePath("Docentes.json", { muteHttpExceptions: true });
  var httpCode = resp.getResponseCode();
  var cuerpo = resp.getContentText() || "";
  var docentes = {};
  var parseError = "";
  if (httpCode === 200) {
    try {
      docentes = JSON.parse(cuerpo || "{}") || {};
    } catch (eParse) {
      parseError = eParse.message;
    }
  }
  var total = docentes ? Object.keys(docentes).length : 0;
  var claveJg = claveDocenteFirebaseDesdeCorreo_("jguerrero@utzmg.edu.mx");
  var regJg = docentes && claveJg ? docentes[claveJg] : null;
  var hallazgos = [];
  if (!secret) {
    hallazgos.push("Falta FIREBASE_DB_SECRET en Propiedades del script → la app lee Docentes vacío.");
  }
  if (httpCode === 401 || httpCode === 403) {
    hallazgos.push("HTTP " + httpCode + " al leer Docentes.json → secreto incorrecto o reglas RTDB.");
  }
  if (httpCode === 200 && total === 0 && !parseError) {
    hallazgos.push("Docentes.json respondió 200 pero sin registros (nodo vacío en Firebase).");
  }
  if (httpCode === 200 && total > 0 && !regJg) {
    hallazgos.push("No existe la llave «" + claveJg + "» en lo que leyó Apps Script (desfase consola vs API).");
  }
  if (regJg && !buscarDocentePorCorreo(docentes, "jguerrero@utzmg.edu.mx")) {
    hallazgos.push("Hay llave Guerrero pero buscarDocentePorCorreo no coincide (revisar CORREO/caché).");
  }
  if (regJg && buscarDocentePorCorreo(docentes, "jguerrero@utzmg.edu.mx")) {
    hallazgos.push("Guerrero OK en catálogo leído por Apps Script.");
  }
  var out = {
    urlBaseFirebase: URL_BASE_FIREBASE,
    tieneFirebaseDbSecret: !!secret,
    longitudSecreto: secret ? secret.length : 0,
    httpDocentes: httpCode,
    totalDocentesLeidos: total,
    errorParseJson: parseError,
    llaveEsperadaGuerrero: claveJg,
    existeLlaveGuerrero: !!regJg,
    correoCampoGuerrero: regJg ? (regJg.CORREO || regJg.correo || "") : "",
    busquedaGuerreroOk: !!buscarDocentePorCorreo(docentes, "jguerrero@utzmg.edu.mx"),
    hallazgos: hallazgos,
    muestraLlaves: docentes ? Object.keys(docentes).slice(0, 8) : []
  };
  var resumen =
    "HTTP " + httpCode
    + " | docentes leídos: " + total
    + " | Guerrero: " + (out.busquedaGuerreroOk ? "OK" : "NO")
    + " | secreto configurado: " + (out.tieneFirebaseDbSecret ? "sí (" + out.longitudSecreto + " chars)" : "NO");
  if (hallazgos.length) {
    resumen += " | " + hallazgos.join(" ");
  }
  Logger.log("=== diagnosticarLecturaFirebaseDocentes ===");
  Logger.log(resumen);
  Logger.log(JSON.stringify(out, null, 2));
  return resumen;
}

/** Admin: probar acceso de un docente por correo (p. ej. jguerrero@utzmg.edu.mx). */
function diagnosticarAccesoDocentePorCorreo(correoConsulta) {
  assertUsuarioAdministrador();
  const correo = normalizarCorreoLoginDocente(correoConsulta);
  const docentes = obtenerNodoDocentesFirebase({ sinCache: true });
  const totalNodo = docentes ? Object.keys(docentes).length : 0;
  const docente = buscarDocentePorCorreo(docentes, correo);
  const asignaciones = extraerAsignacionesDeDocente(docente);
  var llavesGuerrero = [];
  if (docentes) {
    for (var k in docentes) {
      if (k.toLowerCase().indexOf("guerrero") !== -1 || k.toLowerCase().indexOf("jguerrero") !== -1) {
        llavesGuerrero.push(k);
      }
    }
  }
  var registroDirecto = docentes ? docentes["jguerrero@utzmg_edu_mx"] : null;
  return {
    correoConsultado: correo,
    registrosEnDocentesFirebase: totalNodo,
    docenteEncontrado: !!docente,
    nombreProfesor: docente ? (docente.PROFESOR || "") : "",
    correoEnRegistro: docente ? (docente.CORREO || "") : "",
    correosReconocidos: docente ? listarCorreosLoginDocente(docente, "jguerrero@utzmg_edu_mx") : [],
    totalAsignaciones: asignaciones.length,
    asignacionesMuestra: asignaciones.slice(0, 5),
    existeLlaveJguerrero: !!registroDirecto,
    campoCorreoEnLlaveJguerrero: registroDirecto ? (registroDirecto.CORREO || registroDirecto.correo || "") : "",
    diagnosticoCorreoEnLlaveJguerrero: registroDirecto
      ? describirCorreoParaDiagnostico_(registroDirecto.CORREO || registroDirecto.correo || "")
      : null,
    correoSesionSiEjecutaDocente: obtenerCorreoSesionWebApp_(),
    llavesFirebaseConGuerrero: llavesGuerrero
  };
}

/**
 * Admin: reconstruye índices de calificaciones por matrícula desde CALIFICACIONES activo.
 * No altera CALIFICACIONES. Lectura grande (una vez); útil tras activar índices o migración.
 */
function regenerarIndiceCalificacionesPorMatricula() {
  assertUsuarioAdministrador();
  const cuat = getCuatrimestreActivo();
  const resp = fetchFirebasePath("CALIFICACIONES.json", { muteHttpExceptions: true });
  if (resp.getResponseCode() !== 200) {
    return "No se pudo leer CALIFICACIONES.";
  }
  const calificacionesDB = JSON.parse(resp.getContentText() || "{}") || {};
  const porMatricula = {};

  for (let grupo in calificacionesDB) {
    let materiasObj = calificacionesDB[grupo];
    if (!materiasObj || typeof materiasObj !== "object") continue;
    for (let materia in materiasObj) {
      let unidadesObj = materiasObj[materia];
      if (!unidadesObj || typeof unidadesObj !== "object") continue;
      for (let unidad in unidadesObj) {
        let alumnosNotas = unidadesObj[unidad];
        if (!alumnosNotas || typeof alumnosNotas !== "object") continue;
        for (let matricula in alumnosNotas) {
          if (matricula === "_meta") continue;
          let registroNota = alumnosNotas[matricula];
          if (!registroNota) continue;
          let notaRaw = (typeof registroNota === "object" && registroNota.calificacion !== undefined)
            ? registroNota.calificacion
            : registroNota;
          if (notaRaw === undefined || notaRaw === null || notaRaw.toString().trim() === "") continue;
          let matKey = matricula.toString().trim();
          if (!porMatricula[matKey]) porMatricula[matKey] = [];
          let estadoCaptura = "TEMPORAL";
          if (typeof registroNota === "object" && registroNota.estado_captura) {
            estadoCaptura = normalizarEstadoCaptura(registroNota.estado_captura) || "TEMPORAL";
          }
          porMatricula[matKey].push({
            grupo: grupo.toString(),
            materia: materia.toString(),
            unidad: unidad.toString(),
            calificacion: notaRaw.toString(),
            estadoCaptura: estadoCaptura,
            cuatrimestre: (typeof registroNota === "object" && registroNota.cuatrimestre)
              ? registroNota.cuatrimestre : cuat,
            fechaRegistro: (typeof registroNota === "object" && registroNota.fecha_registro)
              ? registroNota.fecha_registro : ""
          });
        }
      }
    }
  }

  let archivos = 0;
  for (let mat in porMatricula) {
    let filas = porMatricula[mat];
    let contenedor = { v: 1, cuatrimestre: cuat, filas: filas };
    fetchFirebaseUrl(construirUrlFirebaseSegmentos([
      "INDICES",
      "CALIFICACIONES_POR_MATRICULA",
      sanitizarSegmentoRutaFirebase(mat),
      sanitizarSegmentoRutaFirebase(cuat)
    ]), {
      method: "put",
      contentType: "application/json",
      payload: JSON.stringify(contenedor),
      muteHttpExceptions: true
    });
    archivos++;
  }
  return "Índice CALIFICACIONES_POR_MATRICULA regenerado para " + archivos + " matrículas (cuatrimestre " + cuat + ").";
}

/** Admin: revisar si hay calificaciones en Firebase para un grupo/materia (todas las unidades). */
function diagnosticarCalificacionesGrupoMateria(grupoConsulta, materiaConsulta) {
  assertUsuarioAdministrador();
  const materia = (materiaConsulta || "NEGOCIACIÓN EMPRESARIAL").toString().trim().toUpperCase();
  const g0 = (grupoConsulta || "10B LPC").toString().trim().toUpperCase();
  const candidatos = [];
  function agregar(g) {
    g = (g || "").toString().trim().toUpperCase();
    if (g && candidatos.indexOf(g) < 0) candidatos.push(g);
  }
  agregar(g0);
  if (g0.indexOf("LPC") >= 0 && g0.indexOf("LPA") < 0) agregar(g0.replace(/\bLPC\b/g, "LPA"));
  agregar("10B LPA");
  agregar("10B LPCYE");

  const secret = getFirebaseDatabaseSecret();
  const informe = {
    materia: materia,
    grupoSolicitado: g0,
    tieneFirebaseDbSecret: !!secret,
    gruposRevisados: []
  };

  for (let i = 0; i < candidatos.length; i++) {
    const grupo = candidatos[i];
    const urlMateria = URL_BASE_FIREBASE + "CALIFICACIONES/"
      + encodeURIComponent(grupo) + "/"
      + encodeURIComponent(materia) + ".json";
    const urlGrupo = URL_BASE_FIREBASE + "CALIFICACIONES/"
      + encodeURIComponent(grupo) + ".json?shallow=true";

    let httpMateria = 0;
    let unidades = {};
    let materiasEnGrupo = null;
    try {
      const rMat = fetchFirebaseUrl(urlMateria, { muteHttpExceptions: true });
      httpMateria = rMat.getResponseCode();
      if (httpMateria === 200) {
        unidades = JSON.parse(rMat.getContentText() || "null") || {};
      }
    } catch (e1) {
      unidades = { _error: e1.message };
    }
    try {
      const rGrp = fetchFirebaseUrl(urlGrupo, { muteHttpExceptions: true });
      if (rGrp.getResponseCode() === 200) {
        materiasEnGrupo = JSON.parse(rGrp.getContentText() || "null");
      }
    } catch (e2) {
      materiasEnGrupo = { _error: e2.message };
    }

    const detalleUnidades = [];
    let totalAlumnosConNota = 0;
    if (unidades && typeof unidades === "object" && !unidades._error) {
      for (let u in unidades) {
        if (!Object.prototype.hasOwnProperty.call(unidades, u)) continue;
        const nodo = unidades[u];
        const resumen = leerCalificacionesYEstadoUnidad(grupo, materia, u);
        const n = Object.keys(resumen.calificaciones || {}).length;
        totalAlumnosConNota += n;
        if (n > 0 || resumen.estado_captura) {
          detalleUnidades.push({
            unidad: u,
            alumnosConNota: n,
            estado_captura: resumen.estado_captura || inferirEstadoCapturaDesdeNodoUnidad(nodo)
          });
        }
      }
    }

    informe.gruposRevisados.push({
      grupo: grupo,
      httpMateria: httpMateria,
      existeNodoMateria: httpMateria === 200 && unidades && typeof unidades === "object" && Object.keys(unidades).length > 0,
      clavesUnidades: unidades && typeof unidades === "object" ? Object.keys(unidades).filter(function(k) { return k !== "_error"; }) : [],
      materiasEnGrupoShallow: materiasEnGrupo,
      unidadesConDatos: detalleUnidades,
      totalRegistrosNotaEnUnidades: totalAlumnosConNota
    });
  }

  Logger.log(JSON.stringify(informe, null, 2));
  return informe;
}

/** Atajo admin: 10B LPC/LPA + Negociación empresarial (clasp run). */
function diagnosticarCalificaciones10BLpcNegociacion() {
  return diagnosticarCalificacionesGrupoMateria("10B LPC", "NEGOCIACIÓN EMPRESARIAL");
}