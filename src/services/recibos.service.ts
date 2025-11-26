// src/services/recibos.service.ts
import fetch from "node-fetch";
import { parseStringPromise } from "xml2js";
import { pool } from "../db/connection";

const BASE_URL = process.env.API_BASE_URL as string;
const TOKEN = process.env.API_TOKEN as string;

interface Recibo {
  FechaRecibo: string;
  PuntoVentaRecibo: string;
  NumeroRecibo: string;
  RazonSocial: string;
  NumeroDocumento?: string;
  ComprobantesImputados?: any;
  TotalEfectivo?: string;
  ChequesTerceros?: any;
  Tarjetas?: any;
  Transferencias?: any;
  Retenciones?: any;
  TotalSinImputar?: string;
}

// Función auxiliar para parsear fecha del formato de la API
function parsearFechaAPI(fechaStr: string): Date {
  if (!fechaStr || typeof fechaStr !== "string") {
    return new Date();
  }

  // Si es formato ISO (contiene T), parsearlo directamente
  if (fechaStr.includes("T")) {
    return new Date(fechaStr);
  }

  // Dividir por espacio para separar fecha y hora
  const partes = fechaStr.trim().split(" ");
  const fechaParte = partes[0] || "";
  let horaParte = partes[1] || "00:00:00";

  if (!fechaParte) {
    return new Date();
  }

  // Parsear fecha en formato DD/MM/YYYY
  const fechaPartes = fechaParte.split("/");
  const dia = fechaPartes[0] || "01";
  const mes = fechaPartes[1] || "01";
  const anio = fechaPartes[2] || "1970";
  
  if (!dia || !mes || !anio) {
    return new Date();
  }

  // Formatear hora con padding - asegurar que tenga formato HH:mm:ss
  const partesTiempo = horaParte.split(":");
  const horas = String(partesTiempo[0] || "00").padStart(2, "0");
  const minutos = String(partesTiempo[1] || "00").padStart(2, "0");
  const segundos = String(partesTiempo[2] || "00").padStart(2, "0");
  const horaFormateada = `${horas}:${minutos}:${segundos}`;

  // Construir ISO string: YYYY-MM-DDTHH:mm:ss
  // Sin conversión de zona horaria - guardar exactamente como viene
  const diaStr = String(dia).padStart(2, "0");
  const mesStr = String(mes).padStart(2, "0");
  const anioStr = String(anio);
  const isoString = `${anioStr}-${mesStr}-${diaStr}T${horaFormateada}`;
  
  // Retornar como Date - PostgreSQL lo interpretará correctamente
  return new Date(isoString);
}

// Convertir fecha YYYY-MM-DD o ISO (2025-11-24T00:00:00.000Z) manteniendo el formato para la API
function convertirFechaParaAPI(fecha: string): string {

  if (fecha.includes("T")) {
    return fecha;
  }
  // Si es solo YYYY-MM-DD, devolverlo tal cual
  return fecha;
}

// Función para convertir valores null/undefined a 0
function safeNumber(val: any, decimals: number = 2): number {
  const num = parseFloat(val || 0);
  return isNaN(num) ? 0 : parseFloat(num.toFixed(decimals));
}

/**
 * Sincroniza recibos desde la API de Caldén Oil
 */
export async function sincronizarRecibos(fechaInicio: string, fechaFin: string): Promise<{
  registros: number;
  insertados: number;
  actualizados: number;
}> {
  const inicio = Date.now();
  let registrosTotal = 0;
  let insertadosTotal = 0;
  let actualizadosTotal = 0;

  try {
    const desdeFecha = convertirFechaParaAPI(fechaInicio);
    const hastaFecha = convertirFechaParaAPI(fechaFin);

    console.log(`📥 Sincronizando recibos desde ${desdeFecha} hasta ${hastaFecha}`);

    const url = `${BASE_URL}/CtaCte/GetRecibosEntreFechas?desdeFecha=${desdeFecha}&hastaFecha=${hastaFecha}`;
    console.log(`🔗 URL de la API: ${url}`);
    
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });

    // Si hay error 500 o similar, loguearlo pero continuar con 0 registros
    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`⚠️ Advertencia en API (${response.status}):`, errorText.substring(0, 300));
      console.log(`📊 Se obtuvieron 0 recibos (error en la API externa)`);
      return {
        registros: 0,
        insertados: 0,
        actualizados: 0,
      };
    }

    const xmlText = await response.text();
    
    // Validar que la respuesta sea XML válido
    if (!xmlText || xmlText.trim().length === 0) {
      console.log(`📊 Se obtuvieron 0 recibos (respuesta vacía)`);
      return {
        registros: 0,
        insertados: 0,
        actualizados: 0,
      };
    }

    console.log(`📝 Respuesta recibida (${xmlText.length} caracteres)`);
    console.log(`📝 Primeros 300 caracteres:`, xmlText.substring(0, 300));
    
    const parsedData = await parseStringPromise(xmlText, { mergeAttrs: true, explicitArray: false });
    console.log(`✅ XML parseado correctamente`);
    console.log(`📋 Estructura raíz:`, Object.keys(parsedData || {}));
    
    // Extraer recibos del XML parseado - intentar múltiples caminos
    let recibos: Recibo[] = [];
    
    // Intenta varios caminos posibles en la estructura XML
    if (parsedData?.root?.Recibos) {
      recibos = Array.isArray(parsedData.root.Recibos) 
        ? parsedData.root.Recibos 
        : [parsedData.root.Recibos];
    } else if (parsedData?.Recibos) {
      recibos = Array.isArray(parsedData.Recibos) 
        ? parsedData.Recibos 
        : [parsedData.Recibos];
    } else if (parsedData?.ArrayOfRecibos?.Recibos) {
      recibos = Array.isArray(parsedData.ArrayOfRecibos.Recibos)
        ? parsedData.ArrayOfRecibos.Recibos
        : [parsedData.ArrayOfRecibos.Recibos];
    }

    console.log(`📊 Se obtuvieron ${recibos.length} recibos`);

    for (const recibo of recibos) {
      // Insertar o actualizar recibo
      const resultRecibo = await pool.query(
        `INSERT INTO recibos (
          id_recibo, fecha_recibo, punto_venta_recibo, razon_social,
          numero_documento, total_efectivo, total_sin_imputar
        ) VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (punto_venta_recibo, numero_recibo)
        DO UPDATE SET
          razon_social = EXCLUDED.razon_social,
          total_efectivo = EXCLUDED.total_efectivo,
          total_sin_imputar = EXCLUDED.total_sin_imputar
        RETURNING id_recibo, (xmax = 0) AS insertado`,
        [
          parseInt(recibo.NumeroRecibo || "0"),
          parsearFechaAPI(recibo.FechaRecibo),
          parseInt(recibo.PuntoVentaRecibo || "0"),
          recibo.RazonSocial,
          recibo.NumeroDocumento || null,
          safeNumber(recibo.TotalEfectivo),
          safeNumber(recibo.TotalSinImputar),
        ]
      );

      const idRecibo = resultRecibo.rows[0].id_recibo;
      const esNuevo = resultRecibo.rows[0].insertado;

      registrosTotal++;
      if (esNuevo) insertadosTotal++;
      else actualizadosTotal++;

      // Insertar comprobantes imputados
      const comprobantes = Array.isArray(recibo.ComprobantesImputados?.ComprobantesImputados)
        ? recibo.ComprobantesImputados.ComprobantesImputados
        : recibo.ComprobantesImputados?.ComprobantesImputados
        ? [recibo.ComprobantesImputados.ComprobantesImputados]
        : [];

      for (const comp of comprobantes) {
        await pool.query(
          `INSERT INTO recibos_comprobantes_imputados (
            id_recibo, fecha_comprobante, tipo_comprobante, punto_venta_comprobante,
            numero_comprobante, total_comprobante, total_imputado
          ) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
          [
            idRecibo,
            parsearFechaAPI(comp.FechaComprobante),
            comp.TipoComprobante,
            parseInt(comp.PuntoVentaComprobante || "0"),
            parseInt(comp.NumeroComprobante || "0"),
            safeNumber(comp.TotalComprobante),
            safeNumber(comp.TotalImputado),
          ]
        );
      }

      // Insertar cheques de terceros
      const cheques = Array.isArray(recibo.ChequesTerceros?.ChequesTerceros)
        ? recibo.ChequesTerceros.ChequesTerceros
        : recibo.ChequesTerceros?.ChequesTerceros
        ? [recibo.ChequesTerceros.ChequesTerceros]
        : [];

      for (const cheque of cheques) {
        await pool.query(
          `INSERT INTO recibos_cheques_terceros (
            id_recibo, fecha_cheque, banco_cheques, caja_cheque, numero_cheque,
            emisor, cuit_emisor, total_cheques, fecha_entrada, fecha_salida, rechazado
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT DO NOTHING`,
          [
            idRecibo,
            cheque.FechaCheque ? parsearFechaAPI(cheque.FechaCheque) : null,
            cheque.BancoCheques || null,
            cheque.CajaCheque || null,
            parseInt(cheque.NumeroCheque || "0") || null,
            cheque.Emisor || null,
            cheque.CuitEmisor || null,
            safeNumber(cheque.TotalCheques),
            cheque.FechaEntrada ? parsearFechaAPI(cheque.FechaEntrada) : null,
            cheque.FechaSalida ? parsearFechaAPI(cheque.FechaSalida) : null,
            cheque.Rechazado || "false",
          ]
        );
      }

      // Insertar tarjetas
      const tarjetas = Array.isArray(recibo.Tarjetas?.Tarjetas)
        ? recibo.Tarjetas.Tarjetas
        : recibo.Tarjetas?.Tarjetas
        ? [recibo.Tarjetas.Tarjetas]
        : [];

      for (const tarjeta of tarjetas) {
        await pool.query(
          `INSERT INTO recibos_tarjetas (id_recibo, id_tarjeta, total_tarjetas)
           VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
          [idRecibo, parseInt(tarjeta.idTarjeta || "0") || null, safeNumber(tarjeta.TotalTarjetas)]
        );
      }

      // Insertar transferencias
      const transferencias = Array.isArray(recibo.Transferencias?.Transferencias)
        ? recibo.Transferencias.Transferencias
        : recibo.Transferencias?.Transferencias
        ? [recibo.Transferencias.Transferencias]
        : [];

      for (const trans of transferencias) {
        await pool.query(
          `INSERT INTO recibos_transferencias (id_recibo, banco_transferencias, numero_cuenta, total_transferencias)
           VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
          [
            idRecibo,
            trans.BancoTransferencias || null,
            trans.NumeroCuenta || null,
            safeNumber(trans.TotalTransferencias),
          ]
        );
      }

      // Insertar retenciones
      const retenciones = Array.isArray(recibo.Retenciones?.Retenciones)
        ? recibo.Retenciones.Retenciones
        : recibo.Retenciones?.Retenciones
        ? [recibo.Retenciones.Retenciones]
        : [];

      for (const ret of retenciones) {
        await pool.query(
          `INSERT INTO recibos_retenciones (id_recibo, tipo_retencion, total_retenciones)
           VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
          [idRecibo, ret.TipoRetencion || null, safeNumber(ret.TotalRetenciones)]
        );
      }
    }

    const duracion = (Date.now() - inicio) / 1000;

    await pool.query(
      `INSERT INTO logs_ingesta (fecha, registros_insertados, estado, mensaje_error)
       VALUES (NOW(), $1, 'EXITO - RECIBOS', 'Insertados: ${insertadosTotal}, Actualizados: ${actualizadosTotal}, Duración: ${duracion.toFixed(1)}s')`,
      [registrosTotal]
    );

    console.log(`✅ Recibos sincronizados: ${insertadosTotal} nuevos, ${actualizadosTotal} actualizados (${duracion.toFixed(1)}s)`);

    return {
      registros: registrosTotal,
      insertados: insertadosTotal,
      actualizados: actualizadosTotal,
    };
  } catch (error) {
    const mensaje = (error as Error).message;

    await pool.query(
      `INSERT INTO logs_ingesta (fecha, registros_insertados, estado, mensaje_error)
       VALUES (NOW(), $1, 'ERROR - RECIBOS', $2)`,
      [registrosTotal, mensaje]
    );

    throw error;
  }
}