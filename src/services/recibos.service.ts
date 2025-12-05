import { pool } from "../db/connection";
import fetch from "node-fetch";
import { parseStringPromise } from "xml2js";

const BASE_URL = process.env.API_BASE_URL as string;
const TOKEN = process.env.API_TOKEN as string;

function asArray(val: any): any[] {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
}

function getArrayFromContainer(container: any, childKey: string): any[] {
  if (!container) return [];
  
  if (container[childKey]) return asArray(container[childKey]);
  
  const lowerKey = childKey.toLowerCase();
  const keys = Object.keys(container);
  const foundKey = keys.find(k => k.toLowerCase() === lowerKey);
  if (foundKey) return asArray(container[foundKey]);

  if (Array.isArray(container)) return container;
  
  return [];
}

async function parseXMLResponse(xmlData: string): Promise<any> {
  try {
    return await parseStringPromise(xmlData, {
      explicitArray: false,
      ignoreAttrs: true,
    });
  } catch (e) {
    console.error("Error parsing XML:", e);
    return null;
  }
}

function safeNumber(val: any, decimals: number = 2): number {
  const num = parseFloat(val || 0);
  return isNaN(num) ? 0 : parseFloat(num.toFixed(decimals));
}

function parsearFechaCustom(fechaStr: string): Date | null {
  if (!fechaStr) return null;
  try {
    const parts = fechaStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s(\d{1,2}):(\d{1,2}):(\d{1,2})/);
    if (parts) {
      const isoString = `${parts[3]}-${parts[2]?.padStart(2, '0')}-${parts[1]?.padStart(2, '0')}T${parts[4]?.padStart(2, '0')}:${parts[5]?.padStart(2, '0')}:${parts[6]?.padStart(2, '0')}`;
      return new Date(isoString);
    }
    const d = new Date(fechaStr);
    return isNaN(d.getTime()) ? null : d;
  } catch (e) {
    return null;
  }
}

export async function sincronizarRecibos(fechaInicio: string, fechaFin: string) {
  const inicio = Date.now();
  let registrosTotal = 0;
  let insertadosTotal = 0;
  let actualizadosTotal = 0;

  try {
    const url = `${BASE_URL}/CtaCte/GetRecibosEntreFechas?desdeFecha=${fechaInicio}&hastaFecha=${fechaFin}`;
    console.log(`GET Recibos (XML): ${url}`);
    
    const response = await fetch(url, {
      headers: { 
        "Authorization": `Bearer ${TOKEN}`,
        "Accept": "application/xml"
      },
    });

    if (!response.ok) {
      console.warn(`API Error (${response.status}): ${await response.text()}`);
      return { registros: 0, insertados: 0, actualizados: 0 };
    }

    const xmlText = await response.text();
    const result = await parseXMLResponse(xmlText);

    const rawData = result?.ArrayOfRecibos?.Recibos;
    
    if (!rawData) {
      console.log(`0 recibos encontrados.`);
      return { registros: 0, insertados: 0, actualizados: 0 };
    }

    const recibos = asArray(rawData);
    console.log(`Procesando ${recibos.length} recibos...`);

    for (const rRaw of recibos) {
      registrosTotal++;

      const numeroRecibo = parseInt(rRaw.NumeroRecibo || "0");
      const puntoVenta = parseInt(rRaw.PuntoVentaRecibo || "0");
      const fechaRecibo = parsearFechaCustom(rRaw.FechaRecibo) || new Date();

      const resultRecibo = await pool.query(
        `INSERT INTO recibos (
          fecha_recibo, punto_venta_recibo, numero_recibo, razon_social,
          numero_documento, total_efectivo, total_sin_imputar
        ) VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (punto_venta_recibo, numero_recibo)
        DO UPDATE SET
          razon_social = EXCLUDED.razon_social,
          total_efectivo = EXCLUDED.total_efectivo,
          fecha_recibo = EXCLUDED.fecha_recibo,
          total_sin_imputar = EXCLUDED.total_sin_imputar
        RETURNING id_recibo, (xmax = 0) AS insertado`,
        [
          fechaRecibo,
          puntoVenta,
          numeroRecibo,
          rRaw.RazonSocial || "Cliente Desconocido",
          rRaw.NumeroDocumento || null,
          safeNumber(rRaw.TotalEfectivo),
          safeNumber(rRaw.TotalSinImputar),
        ]
      );

      const dbIdRecibo = resultRecibo.rows[0].id_recibo;
      const esNuevo = resultRecibo.rows[0].insertado;

      if (esNuevo) insertadosTotal++;
      else actualizadosTotal++;

      const accion = esNuevo ? "RECIBO NUEVO" : "RECIBO ACTUALIZADO";
      console.log(`[${accion}] REC ${puntoVenta}-${numeroRecibo} | Cliente: ${rRaw.RazonSocial} | ID DB: ${dbIdRecibo}`);
      
      if (safeNumber(rRaw.TotalEfectivo) > 0) {
          console.log(`   -> [Efectivo] $${safeNumber(rRaw.TotalEfectivo)}`);
      }

      const comprobantes = getArrayFromContainer(rRaw.ComprobantesImputados, 'ComprobantesImputados');
      
      for (const comp of comprobantes) {
        if (safeNumber(comp.TotalImputado) === 0) continue;

        const resComp = await pool.query(
          `INSERT INTO recibos_comprobantes_imputados (
            id_recibo, fecha_comprobante, tipo_comprobante, punto_venta_comprobante,
            numero_comprobante, total_comprobante, total_imputado
          ) VALUES ($1,$2,$3,$4,$5,$6,$7)
          ON CONFLICT DO NOTHING`, 
          [
            dbIdRecibo,
            parsearFechaCustom(comp.FechaComprobante),
            comp.TipoComprobante,
            parseInt(comp.PuntoVentaComprobante || "0"),
            parseInt(comp.NumeroComprobante || "0"),
            safeNumber(comp.TotalComprobante),
            safeNumber(comp.TotalImputado),
          ]
        );
        
        if (resComp.rowCount && resComp.rowCount > 0) {
            console.log(`      -> [Imputación] ${comp.TipoComprobante} ${comp.NumeroComprobante}: $${comp.TotalImputado}`);
        }
      }

      const cheques = getArrayFromContainer(rRaw.ChequesTerceros, 'ChequesTerceros');
      
      for (const ch of cheques) {
        if (safeNumber(ch.TotalCheques) === 0) continue;

        const resCheque = await pool.query(
          `INSERT INTO recibos_cheques_terceros (
            id_recibo, fecha_cheque, banco_cheques, caja_cheque, numero_cheque,
            emisor, cuit_emisor, total_cheques, fecha_entrada, fecha_salida, rechazado
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
          ON CONFLICT DO NOTHING`,
          [
            dbIdRecibo,
            parsearFechaCustom(ch.FechaCheque),
            ch.BancoCheques || null,
            ch.CajaCheque || null,
            parseInt(ch.NumeroCheque || "0") || null,
            ch.Emisor || null,
            ch.CuitEmisor || null,
            safeNumber(ch.TotalCheques),
            parsearFechaCustom(ch.FechaEntrada),
            parsearFechaCustom(ch.FechaSalida),
            (ch.Rechazado === "true" || ch.Rechazado === "True") ? "true" : "false"
          ]
        );

        if (resCheque.rowCount && resCheque.rowCount > 0) {
            console.log(`      -> [Cheque] N°${ch.NumeroCheque} (${ch.BancoCheques}): $${ch.TotalCheques}`);
        }
      }

      const tarjetas = getArrayFromContainer(rRaw.Tarjetas, 'Tarjetas');
      
      for (const t of tarjetas) {
        if (safeNumber(t.TotalTarjetas) === 0) continue;

        const resTar = await pool.query(
          `INSERT INTO recibos_tarjetas (id_recibo, id_tarjeta, total_tarjetas)
           VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
          [
            dbIdRecibo, 
            parseInt(t.idTarjeta || "0") || null, 
            safeNumber(t.TotalTarjetas)
          ]
        );
        
        if (resTar.rowCount && resTar.rowCount > 0) {
            console.log(`      -> [Tarjeta] ID ${t.idTarjeta}: $${t.TotalTarjetas}`);
        }
      }

      const transferencias = getArrayFromContainer(rRaw.Transferencias, 'Transferencias');
      
      for (const trans of transferencias) {
        if (safeNumber(trans.TotalTransferencias) === 0) continue;

        const resTrans = await pool.query(
          `INSERT INTO recibos_transferencias (id_recibo, banco_transferencias, numero_cuenta, total_transferencias)
           VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
          [
            dbIdRecibo,
            trans.BancoTransferencias || null,
            trans.NumeroCuenta || null,
            safeNumber(trans.TotalTransferencias),
          ]
        );

        if (resTrans.rowCount && resTrans.rowCount > 0) {
            console.log(`      -> [Transferencia] ${trans.BancoTransferencias}: $${trans.TotalTransferencias}`);
        }
      }

      const retenciones = getArrayFromContainer(rRaw.Retenciones, 'Retenciones');
      
      for (const ret of retenciones) {
        if (safeNumber(ret.TotalRetenciones) === 0) continue;

        const resRet = await pool.query(
          `INSERT INTO recibos_retenciones (id_recibo, tipo_retencion, total_retenciones)
           VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
          [
            dbIdRecibo, 
            ret.TipoRetencion || null, 
            safeNumber(ret.TotalRetenciones)
          ]
        );

        if (resRet.rowCount && resRet.rowCount > 0) {
            console.log(`      -> [Retención] ${ret.TipoRetencion}: $${ret.TotalRetenciones}`);
        }
      }
    }

    const duracion = (Date.now() - inicio) / 1000;
    
    await pool.query(
      `INSERT INTO logs_ingesta (fecha, registros_insertados, estado, mensaje_error)
       VALUES (NOW(), $1, 'EXITO - RECIBOS', 'Insertados: ${insertadosTotal}, Actualizados: ${actualizadosTotal}, Duración: ${duracion.toFixed(1)}s')`,
      [registrosTotal]
    );

    return { registros: registrosTotal, insertados: insertadosTotal, actualizados: actualizadosTotal };

  } catch (error) {
    await pool.query(
      `INSERT INTO logs_ingesta (fecha, registros_insertados, estado, mensaje_error)
       VALUES (NOW(), 0, 'ERROR - RECIBOS', $1)`,
      [(error as Error).message]
    );
    throw error;
  }
}
