const SHEET_ID = process.env.SHEET_ID || '1DqWeZOvPhGtrt2gcpRiaLvZ2IZxyowtkV5u5vgIx_8U';
const SHEET_GID = process.env.SHEET_GID || '0';
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&gid=${SHEET_GID}`;

const parseSheetResponse = (text) => {
  const match = text.match(/google\.visualization\.Query\.setResponse\((.*)\);/s);
  if (!match) {
    throw new Error('Unable to parse Google Sheets response');
  }
  const data = JSON.parse(match[1]);
  const rows = data.table?.rows || [];
  const cols = data.table?.cols || [];
  const parsedRows = rows.map((row) => (row.c || []).map((cell) => (cell ? String(cell.v).trim() : '')));
  const hasColumnLabels = cols.some((col) => col.label && String(col.label).trim().length > 0);

  if (!hasColumnLabels && parsedRows.length > 0) {
    parsedRows.shift();
  }

  return parsedRows.map((row) => {
    const [name = '', price = '', location = ''] = row;
    return { name, price, location };
  });
};

export default async function handler(req, res) {
  try {
    const response = await fetch(SHEET_URL);
    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to fetch sheet data' });
    }

    const text = await response.text();
    const items = parseSheetResponse(text);

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
    return res.status(200).json(items);
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
