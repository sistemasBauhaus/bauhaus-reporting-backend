import fetch from "node-fetch";
import { parseStringPromise } from "xml2js";

const BASE_URL = process.env.API_BASE_URL as string;
const TOKEN = process.env.API_TOKEN as string;

export let estacionesMap: Record<number, string> = {};
export let cajasMap: Record<number, string> = {};

export async function cargarMapeos() {
  // Cargar estaciones
  const estacionesResp = await fetch(`${BASE_URL}/Estaciones/GetAllEstaciones`, {
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/json" }
  });
  let estaciones: any[] = [];
  const estacionesText = await estacionesResp.text();
  try {
    estaciones = JSON.parse(estacionesText);
  } catch {
    // Si no es JSON, intenta parsear como XML
    const xml = await parseStringPromise(estacionesText, { explicitArray: false });
    if (xml && xml.Estaciones && xml.Estaciones.Estacion) {
      estaciones = Array.isArray(xml.Estaciones.Estacion) ? xml.Estaciones.Estacion : [xml.Estaciones.Estacion];
    } else if (xml && xml.Estacion) {
      estaciones = Array.isArray(xml.Estacion) ? xml.Estacion : [xml.Estacion];
    }
  }
  estacionesMap = {};
  console.log('Estaciones recibidas:', estaciones);
  for (const est of estaciones) {
    // Soporta diferentes nombres de propiedades
    const id = est.IdEstacion || est.idEstacion || est.idestacion || est.id || est.IDESTACION;
    const nombre = est.Nombre || est.nombre || est.NOMBRE;
    estacionesMap[id] = nombre;
  }

  // Cargar cajas
  const cajasResp = await fetch(`${BASE_URL}/Cajas/GetAllCajas`, {
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/json" }
  });
  let cajas: any[] = [];
  const cajasText = await cajasResp.text();
  try {
    cajas = JSON.parse(cajasText);
  } catch {
    // Si no es JSON, intenta parsear como XML
    const xml = await parseStringPromise(cajasText, { explicitArray: false });
    if (xml && xml.Cajas && xml.Cajas.Caja) {
      cajas = Array.isArray(xml.Cajas.Caja) ? xml.Cajas.Caja : [xml.Cajas.Caja];
    } else if (xml && xml.Caja) {
      cajas = Array.isArray(xml.Caja) ? xml.Caja : [xml.Caja];
    }
  }
  cajasMap = {};
  console.log('Cajas recibidas:', cajas);
  for (const caja of cajas) {
    // Soporta diferentes nombres de propiedades
    const id = caja.idCaja || caja.IdCaja || caja.idcaja || caja.id || caja.IDCAJA;
  const nombre = caja.nombreCaja || caja.NombreCaja || caja.nombrecaja || caja.nombre || caja.NOMBRECAJA || caja.descripcion;
    cajasMap[id] = nombre;
  }

  console.log('Mapeo estaciones:', estacionesMap);
  console.log('Mapeo cajas:', cajasMap);
}