import axios from 'axios';
import { parseStringPromise } from 'xml2js';

const BASE_URL = 'http://181.12.107.138:5000/api';

export interface Articulo {
  id_articulo: string;
  descripcion: string;
  es_combustible: boolean;
  es_lubricante: boolean;
  color: string;
}

export const getCombustibles = async (token: string): Promise<any[]> => {
  const url = `${BASE_URL}/Articulos/GetAllCombustibles`;

  const response = await axios.get(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  // Convertir XML a JSON
  const json = await parseStringPromise(response.data);
  return json.ArrayOfArticulo.Articulo.map((a: any) => ({
    id_articulo: a.IdArticulo[0],
    descripcion: a.Descripcion[0],
    es_combustible: a.EsCombustible[0] === 'true',
    es_lubricante: a.EsLubricante[0] === 'true',
    color: a.ColorARGB[0],
  }));
};
