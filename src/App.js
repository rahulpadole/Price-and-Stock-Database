import { useEffect, useMemo, useState } from 'react';
import './App.css';

const SHEET_ID = '1DqWeZOvPhGtrt2gcpRiaLvZ2IZxyowtkV5u5vgIx_8U';
const SHEET_GID = '0';
const SHEET_API_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&gid=${SHEET_GID}`;

const parseSheetResponse = (text) => {
  const match = text.match(/google\.visualization\.Query\.setResponse\((.*)\);/s);
  if (!match) {
    throw new Error('Unexpected sheet response format');
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

function App() {
  const [items, setItems] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const useDirectSheet = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const inventoryUrl = useDirectSheet ? SHEET_API_URL : '/api/inventory';

  useEffect(() => {
    const controller = new AbortController();

    const fetchInventory = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(inventoryUrl, { signal: controller.signal });
        if (!response.ok) {
          throw new Error(`Failed to load inventory (${response.status})`);
        }

        const text = await response.text();
        const data = useDirectSheet ? parseSheetResponse(text) : JSON.parse(text);
        setItems(Array.isArray(data) ? data : []);
      } catch (err) {
        if (err.name !== 'AbortError') {
          setError(err.message || 'Unable to load inventory');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchInventory();
    return () => controller.abort();
  }, [inventoryUrl, useDirectSheet]);

  const filteredItems = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    if (!normalizedSearch) {
      return items;
    }
    return items.filter((item) => item.name.toLowerCase().includes(normalizedSearch));
  }, [items, searchTerm]);

  return (
    <div className="App">
      <main className="app-container">
        <section className="hero">
          <h1>Price and Stock Database</h1>
          <p>Search inventory pulled live from your Google Sheet.</p>
        </section>

        <section className="search-panel">
          <label htmlFor="search">Search product</label>
          <input
            id="search"
            type="search"
            placeholder="Enter product name..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </section>

        {loading ? (
          <div className="status-message">Loading inventory…</div>
        ) : error ? (
          <div className="status-message status-error">
            <strong>Error:</strong> {error}
          </div>
        ) : (
          <>
            <div className="summary-bar">
              <span>{filteredItems.length} result{filteredItems.length === 1 ? '' : 's'}</span>
              <span>{items.length} total item{items.length === 1 ? '' : 's'}</span>
            </div>
            <div className="table-wrapper">
              <table className="inventory-table">
                <thead>
                  <tr>
                    <th>Product Name</th>
                    <th>Price</th>
                    <th>Location</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.length > 0 ? (
                    filteredItems.map((item, index) => (
                      <tr key={`${item.name}-${index}`}>
                        <td>{item.name}</td>
                        <td>{item.price}</td>
                        <td>{item.location}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="3" className="empty-state">
                        No matching products found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default App;
