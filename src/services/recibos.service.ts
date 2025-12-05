import { pool } from "../db/connection";
import fetch from "node-fetch";

const BASE_URL = process.env.API_BASE_URL as string;
const TOKEN = process.env.API_TOKEN as string;

// Convierte valores a Float seguro (maneja nulls y strings vacíos)
function safeNumber(val: any, decimals: number = 2): number {
  const num = parseFloat(val || 0);
  return isNaN(num) ? 0 : parseFloat(num.toFixed(decimals));
}

// Parsea fechas. Si viene null o vacío, devuelve null (o fecha actual si es crítico)
function parsearFechaAPI(fechaStr: string): Date {
  if (!fechaStr) return new Date();
  const d = new Date(fechaStr);
  return isNaN(d.getTime()) ? new Date() : d;
}

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
    // URL con parámetros de fecha YYYY-MM-DD
    const url = `${BASE_URL}/CtaCte/GetRecibosEntreFechas?desdeFecha=${fechaInicio}&hastaFecha=${fechaFin}`;
    console.log(`GET Recibos: ${url}`);
    
    const response = await fetch(url, {
      headers: { 
        "Authorization": `Bearer ${TOKEN}`,
        "Content-Type": "application/json"
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`API Error (${response.status}):`, errorText.substring(0, 300));
      return { registros: 0, insertados: 0, actualizados: 0 };
    }

    const recibos = await response.json() as any[];

    if (!Array.isArray(recibos) || recibos.length === 0) {
      console.log(`0 recibos encontrados.`);
      return { registros: 0, insertados: 0, actualizados: 0 };
    }

    console.log(`Procesando ${recibos.length} recibos...`);

    for (const recibo of recibos) {
      registrosTotal++;
      
      const numeroRecibo = parseInt(recibo.IdRecibo || recibo.NumeroRecibo || "0");
      const puntoVenta = parseInt(recibo.PuntoVentaRecibo || "0"); // Default 0 si no viene en docs

      const resultRecibo = await pool.query(
        `INSERT INTO recibos (
          fecha_recibo, punto_venta_recibo, numero_recibo, razon_social,
          numero_documento, total_efectivo, total_sin_imputar
        ) VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (punto_venta_recibo, numero_recibo)
        DO UPDATE SET
          razon_social = EXCLUDED.razon_social,
          total_efectivo = EXCLUDED.total_efectivo,
          fecha_recibo = EXCLUDED.fecha_recibo
        RETURNING id_recibo, (xmax = 0) AS insertado`,
        [
          parsearFechaAPI(recibo.FechaEmision || recibo.FechaRecibo),
          puntoVenta,
          numeroRecibo,
          recibo.NombreCliente || recibo.RazonSocial || "Cliente Desconocido",
          recibo.NumeroDocumento || null,
          safeNumber(recibo.Monto || recibo.TotalEfectivo),
          safeNumber(recibo.TotalSinImputar),
        ]
      );

      const idRecibo = resultRecibo.rows[0].id_recibo;
      const esNuevo = resultRecibo.rows[0].insertado;

      if (esNuevo) insertadosTotal++;
      else actualizadosTotal++;

      const comprobantes = Array.isArray(recibo.ComprobantesImputados) ? recibo.ComprobantesImputados : [];
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

      // Cheques Terceros
      const cheques = Array.isArray(recibo.ChequesTerceros) ? recibo.ChequesTerceros : [];
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
            cheque.Rechazado ? "true" : "false", // Convertir boolean a string si la DB lo requiere
          ]
        );
      }

      // Tarjetas
      const tarjetas = Array.isArray(recibo.Tarjetas) ? recibo.Tarjetas : [];
      for (const tarjeta of tarjetas) {
        await pool.query(
          `INSERT INTO recibos_tarjetas (id_recibo, id_tarjeta, total_tarjetas)
           VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
          [
            idRecibo, 
            parseInt(tarjeta.idTarjeta || "0") || null, 
            safeNumber(tarjeta.TotalTarjetas)
          ]
        );
      }

      // Transferencias
      const transferencias = Array.isArray(recibo.Transferencias) ? recibo.Transferencias : [];
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

      // Retenciones
      const retenciones = Array.isArray(recibo.Retenciones) ? recibo.Retenciones : [];
      for (const ret of retenciones) {
        await pool.query(
          `INSERT INTO recibos_retenciones (id_recibo, tipo_retencion, total_retenciones)
           VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
          [
            idRecibo, 
            ret.TipoRetencion || null, 
            safeNumber(ret.TotalRetenciones)
          ]
        );
      }
    }

    const duracion = (Date.now() - inicio) / 1000;

    // Log de éxito
    await pool.query(
      `INSERT INTO logs_ingesta (fecha, registros_insertados, estado, mensaje_error)
       VALUES (NOW(), $1, 'EXITO - RECIBOS', 'Insertados: ${insertadosTotal}, Actualizados: ${actualizadosTotal}, Duración: ${duracion.toFixed(1)}s')`,
      [registrosTotal]
    );

    console.log(`Recibos sincronizados: ${insertadosTotal} nuevos, ${actualizadosTotal} actualizados (${duracion.toFixed(1)}s)`);

    return {
      registros: registrosTotal,
      insertados: insertadosTotal,
      actualizados: actualizadosTotal,
    };

  } catch (error) {
    const mensaje = (error as Error).message;

    // Log de error
    await pool.query(
      `INSERT INTO logs_ingesta (fecha, registros_insertados, estado, mensaje_error)
       VALUES (NOW(), 0, 'ERROR - RECIBOS', $1)`,
      [mensaje]
    );

    throw error;
  }
}
