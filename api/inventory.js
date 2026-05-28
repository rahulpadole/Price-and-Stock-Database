import crypto from 'crypto';

const SHEET_ID = process.env.SHEET_ID || '1DqWeZOvPhGtrt2gcpRiaLvZ2IZxyowtkV5u5vgIx_8U';
const SHEET_NAME = process.env.SHEET_NAME || 'Sheet1';
const GOOGLE_KEY = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

const base64Url = (value) =>
  Buffer.from(value)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

const createJwt = (privateKey, clientEmail) => {
  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: clientEmail,
    scope: SCOPES.join(' '),
    aud: GOOGLE_TOKEN_URL,
    exp: now + 3600,
    iat: now,
  };

  const unsignedToken = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsignedToken);
  signer.end();

  const signature = signer.sign(privateKey, 'base64');
  return `${unsignedToken}.${signature.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}`;
};

const getAccessToken = async () => {
  if (!GOOGLE_KEY) {
    throw new Error('Google service account key is not configured');
  }

  const key = typeof GOOGLE_KEY === 'string' ? JSON.parse(GOOGLE_KEY) : GOOGLE_KEY;
  const privateKey = key.private_key.replace(/\\n/g, '\n');
  const jwt = createJwt(privateKey, key.client_email);

  const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    throw new Error(`Google token request failed: ${errorText}`);
  }

  const tokenData = await tokenResponse.json();
  return tokenData.access_token;
};

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

  return parsedRows.map((row, index) => {
    const [name = '', price = '', location = ''] = row;
    const rowNumber = index + 2;
    return { id: `row-${rowNumber}`, rowNumber, name, price, location };
  });
};

const getSheetUrl = () => `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(SHEET_NAME)}`;

const appendSheetRow = async (values, accessToken) => {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(
    `${SHEET_NAME}!A:C`
  )}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ values: [values] }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to append sheet row: ${errorText}`);
  }
};

const updateSheetRow = async (rowNumber, values, accessToken) => {
  const range = `${SHEET_NAME}!A${rowNumber}:C${rowNumber}`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ values: [values] }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to update sheet row: ${errorText}`);
  }
};

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const response = await fetch(getSheetUrl());
      if (!response.ok) {
        return res.status(response.status).json({ error: 'Failed to fetch sheet data' });
      }

      const text = await response.text();
      const items = parseSheetResponse(text);
      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
      return res.status(200).json(items);
    }

    if (!GOOGLE_KEY) {
      return res.status(500).json({ error: 'Google service account key is missing' });
    }

    const accessToken = await getAccessToken();

    if (req.method === 'POST') {
      const { name, price, location } = req.body || {};
      if (!name) {
        return res.status(400).json({ error: 'Name is required' });
      }

      await appendSheetRow([name, price || '', location || ''], accessToken);
      const response = await fetch(getSheetUrl());
      const text = await response.text();
      const items = parseSheetResponse(text);
      return res.status(200).json(items);
    }

    if (req.method === 'PUT') {
      const { rowNumber, name, price, location } = req.body || {};
      if (!rowNumber) {
        return res.status(400).json({ error: 'rowNumber is required for update' });
      }
      if (!name) {
        return res.status(400).json({ error: 'Name is required' });
      }

      await updateSheetRow(rowNumber, [name, price || '', location || ''], accessToken);
      const response = await fetch(getSheetUrl());
      const text = await response.text();
      const items = parseSheetResponse(text);
      return res.status(200).json(items);
    }

    res.setHeader('Allow', 'GET, POST, PUT');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
