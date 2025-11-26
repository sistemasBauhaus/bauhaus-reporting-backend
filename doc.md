GET    /api/CtaCte/GetRecibosEntreFechas

DESCRIPCIÓN
Devuelve una lista de recibos emitidos entre dos fechas específicas, proporcionando una herramienta esencial para análisis financiero y conciliaciones.

AUTORIZACIÓN
{
  "tipo": "Bearer Token",
  "descripcion": "Token de autenticación Bearer necesario para acceder al endpoint. Requiere autenticación para garantizar la seguridad y privacidad de la información financiera."
}
HEADERS
{
  "nombre": "Authorization",
  "descripcion": "Token de autenticación Bearer.",
  "tipo": "string",
  "requerido": true
}
,
PARAMETROS DE CONSULTA
{
  "nombre": "desdeFecha",
  "tipo": "string",
  "descripcion": "Fecha inicial del intervalo para buscar recibos, en formato YYYY-MM-DD.",
  "requerido": true
}
,
{
  "nombre": "hastaFecha",
  "tipo": "string",
  "descripcion": "Fecha final del intervalo para buscar recibos, en formato YYYY-MM-DD.",
  "requerido": true
}
,
ESTRUCTURA DE RESPUESTA
Arreglo de objetos Recibos, cada uno representando un recibo emitido dentro del rango de fechas especificado.

{
  "nombre": "IdRecibo",
  "tipo": "int",
  "descripcion": "Identificador único del recibo."
}
,
{
  "nombre": "FechaEmision",
  "tipo": "DateTime",
  "descripcion": "Fecha en la que fue emitido el recibo."
}
,
{
  "nombre": "Monto",
  "tipo": "decimal",
  "descripcion": "Monto total del recibo."
}
,
{
  "nombre": "IdCliente",
  "tipo": "int",
  "descripcion": "Identificador del cliente asociado al recibo."
}
,
{
  "nombre": "NombreCliente",
  "tipo": "string",
  "descripcion": "Nombre o denominación del cliente asociado al recibo."
}

GET    /api/CtaCte/GetRecibosEntreFechas

DESCRIPCIÓN
Devuelve una lista de recibos emitidos entre dos fechas específicas, proporcionando una herramienta esencial para análisis financiero y conciliaciones.

AUTORIZACIÓN
{
  "tipo": "Bearer Token",
  "descripcion": "Token de autenticación Bearer necesario para acceder al endpoint. Requiere autenticación para garantizar la seguridad y privacidad de la información financiera."
}
HEADERS
{
  "nombre": "Authorization",
  "descripcion": "Token de autenticación Bearer.",
  "tipo": "string",
  "requerido": true
}
,
PARAMETROS DE CONSULTA
{
  "nombre": "desdeFecha",
  "tipo": "string",
  "descripcion": "Fecha inicial del intervalo para buscar recibos, en formato YYYY-MM-DD.",
  "requerido": true
}
,
{
  "nombre": "hastaFecha",
  "tipo": "string",
  "descripcion": "Fecha final del intervalo para buscar recibos, en formato YYYY-MM-DD.",
  "requerido": true
}
,
ESTRUCTURA DE RESPUESTA
Arreglo de objetos Recibos, cada uno representando un recibo emitido dentro del rango de fechas especificado.

{
  "nombre": "IdRecibo",
  "tipo": "int",
  "descripcion": "Identificador único del recibo."
}
,
{
  "nombre": "FechaEmision",
  "tipo": "DateTime",
  "descripcion": "Fecha en la que fue emitido el recibo."
}
,
{
  "nombre": "Monto",
  "tipo": "decimal",
  "descripcion": "Monto total del recibo."
}
,
{
  "nombre": "IdCliente",
  "tipo": "int",
  "descripcion": "Identificador del cliente asociado al recibo."
}
,
{
  "nombre": "NombreCliente",
  "tipo": "string",
  "descripcion": "Nombre o denominación del cliente asociado al recibo."
}