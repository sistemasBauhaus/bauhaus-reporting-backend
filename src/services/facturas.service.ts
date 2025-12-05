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

export async function sincronizarFacturas(fechaInicio: string, fechaFin: string) {
  const inicio = Date.now();
  let registrosTotal = 0;
  let insertadosTotal = 0;
  let actualizadosTotal = 0;

  try {
    const url = `${BASE_URL}/Facturacion/GetFacturasVenta?desdeFecha=${fechaInicio}&hastaFecha=${fechaFin}`;
    console.log(`GET Facturas: ${url}`);
    
    const response = await fetch(url, {
      headers: { 
        "Authorization": `Bearer ${TOKEN}`,
        "Content-Type": "application/json"
      },
    });

    if (!response.ok) {
      console.warn(`API Error (${response.status}): ${await response.text()}`);
      return { registros: 0, insertados: 0, actualizados: 0 };
    }

    const facturas = await response.json() as any[];

    if (!Array.isArray(facturas) || facturas.length === 0) {
      console.log(`0 facturas encontradas.`);
      return { registros: 0, insertados: 0, actualizados: 0 };
    }

    console.log(`Procesando ${facturas.length} facturas...`);

    for (const f of facturas) {
      registrosTotal++;

      const idFacturaReal = f.IdFactura || f.Numero || 0;

      const resultCab = await pool.query(
        `INSERT INTO facturas_venta (
          tipo_comprobante, punto_venta, numero, fecha, codigo, razon_social,
          numero_documento, domicilio, localidad, id_localidad, codigo_postal,
          patente, moneda, tipo_pago, neto_gravado, neto_no_gravado, iva,
          impuesto_interno, tasas, tasa_vial, jurisdiccion, percepcion_iibb,
          percepcion_iva, otras_percepciones, total, id_cliente_seleccionado,
          id_estacion, chofer, id_movimiento_fac, id_movimiento_cancelado
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
          $21,$22,$23,$24,$25,$26,$27,$28,$29,$30
        )
        ON CONFLICT (tipo_comprobante, punto_venta, numero)
        DO UPDATE SET
          fecha = EXCLUDED.fecha,
          razon_social = EXCLUDED.razon_social,
          total = EXCLUDED.total
        RETURNING id_factura, (xmax = 0) AS insertado`,
        [
          f.TipoComprobante || "FAC",
          parseInt(f.PuntoVenta || 0),
          parseInt(idFacturaReal), 
          parsearFechaAPI(f.FechaEmision || f.Fecha),
          f.Codigo || null,
          f.NombreCliente || f.RazonSocial || null,
          f.NumeroDocumento || null,
          f.Domicilio || null,
          f.Localidad || null,
          parseInt(f.IdLocalidad || 0) || null,
          parseInt(f.CodigoPostal || 0) || null,
          f.Patente || null,
          f.Moneda || "PES",
          f.TipoPago || null,
          safeNumber(f.NetoGravado),
          safeNumber(f.NetoNoGravado),
          safeNumber(f.IVA),
          safeNumber(f.ImpuestoInterno),
          safeNumber(f.Tasas),
          safeNumber(f.TasaVial),
          f.Jurisdiccion ? parseInt(f.Jurisdiccion) : null,
          safeNumber(f.PercepcionIIBB),
          safeNumber(f.PercepcionIVA),
          safeNumber(f.OtrasPercepciones),
          safeNumber(f.MontoTotal || f.Total),
          f.IdClienteSeleccionado || null,
          parseInt(f.IdEstacion || 0) || null,
          f.Chofer || null,
          parseInt(f.idMovimientoFac || 0) || null,
          f.IdMovimientoCancelado ? parseInt(f.IdMovimientoCancelado) : null,
        ]
      );

      const dbIdFactura = resultCab.rows[0].id_factura;
      if (resultCab.rows[0].insertado) insertadosTotal++;
      else actualizadosTotal++;

      const val = f.Valores || {}; 
      await pool.query(
        `INSERT INTO facturas_venta_valores (
          id_factura, efectivo, cheques_propios, cheques_terceros,
          tarjetas, transferencias, debito_automatico
        ) VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (id_factura) DO UPDATE SET
          efectivo = EXCLUDED.efectivo`,
        [
          dbIdFactura,
          safeNumber(val.Efectivo),
          parseInt(val.ChequesPropios || 0),
          safeNumber(val.ChequesTerceros),
          safeNumber(val.Tarjetas),
          parseInt(val.Transferencias || 0),
          parseInt(val.DebitoAutomatico || 0),
        ]
      );

      const detalles = Array.isArray(f.Detalle) ? f.Detalle : [];
      
      for (const d of detalles) {
        await pool.query(
          `INSERT INTO facturas_venta_detalle (
            id_movimientos_detalle_fac, id_factura, cantidad, codigo_articulo, descripcion_articulo,
            id_grupo_articulo, descripcion_grupo, precio, iva_unitario,
            impuesto_interno_unitario, tasas_unitario, tasa_vial_unitario,
            costo_unitario, id_articulo, id_caja, identificador_caja,
            id_cierre_turno, total_neto, neto_unitario, total_iva,
            total_impuesto_interno, total_tasas, total_tasa_vial,
            alicuota_iva, total_renglon
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25
          )
          ON CONFLICT DO NOTHING`,
          [
            parseInt(d.IdMovimientosDetalleFac || 0),
            dbIdFactura,
            safeNumber(d.Cantidad, 4),
            safeNumber(d.CodigoArticulo, 4),
            d.DescripcionArticulo || null,
            parseInt(d.IdGrupoArticulo || 0) || null,
            d.DescripcionGrupo || null,
            safeNumber(d.Precio, 4),
            safeNumber(d.IvaUnitario, 4),
            safeNumber(d.ImpuestoInternoUnitario, 4),
            safeNumber(d.TasasUnitario, 4),
            safeNumber(d.TasaVialUnitario, 4),
            safeNumber(d.CostoUnitario, 4),
            parseInt(d.IdArticulo || 0) || null,
            parseInt(d.IdCaja || 0) || null,
            d.IdentificadorCaja || null,
            parseInt(d.IdCierreTurno || 0),
            safeNumber(d.TotalNeto),
            safeNumber(d.NetoUnitario, 4),
            safeNumber(d.TotalIva),
            safeNumber(d.TotalImpuestoInterno),
            safeNumber(d.TotalTasas),
            safeNumber(d.TotalTasaVial),
            d.AlicuotaIva || null,
            safeNumber(d.TotalRenglon),
          ]
        );
      }
    }

    const duracion = (Date.now() - inicio) / 1000;
    
    // Log Success
    await pool.query(
      `INSERT INTO logs_ingesta (fecha, registros_insertados, estado, mensaje_error)
       VALUES (NOW(), $1, 'EXITO - FACTURAS', 'Insertados: ${insertadosTotal}, Actualizados: ${actualizadosTotal}, Duración: ${duracion.toFixed(1)}s')`,
      [registrosTotal]
    );

    return { registros: registrosTotal, insertados: insertadosTotal, actualizados: actualizadosTotal };

  } catch (error) {
    await pool.query(
      `INSERT INTO logs_ingesta (fecha, registros_insertados, estado, mensaje_error)
       VALUES (NOW(), 0, 'ERROR - FACTURAS', $1)`,
      [(error as Error).message]
    );
    throw error;
  }
}
