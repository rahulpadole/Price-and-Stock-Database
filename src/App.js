import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import './App.css';

const SHEET_ID = '1DqWeZOvPhGtrt2gcpRiaLvZ2IZxyowtkV5u5vgIx_8U';
const SHEET_NAME = 'Sheet1';
const SHEET_API_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(SHEET_NAME)}`;

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

  return parsedRows.map((row, index) => {
    const [name = '', price = '', location = ''] = row;
    const rowNumber = index + 2;
    return { id: `row-${rowNumber}`, rowNumber, name, price, location };
  });
};

const normalizeRows = (rows) =>
  rows.map((row, index) => ({
    id: row.id || (row.rowNumber ? `row-${row.rowNumber}` : `item-${index}-${Date.now()}`),
    rowNumber: row.rowNumber,
    name: String(row.name || '').trim(),
    price: String(row.price || '').trim(),
    location: String(row.location || '').trim(),
  }));

function App() {
  const [items, setItems] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [newItem, setNewItem] = useState({ name: '', price: '', location: '' });
  const [editingId, setEditingId] = useState(null);
  const [editingItem, setEditingItem] = useState({ name: '', price: '', location: '' });

  const forceUseServerApi = process.env.REACT_APP_USE_SERVER_API === 'true';
  const useServerApi = forceUseServerApi || !['localhost', '127.0.0.1'].includes(window.location.hostname);
  const inventoryUrl = useServerApi ? '/api/inventory' : SHEET_API_URL;
  const saveUrl = useServerApi ? '/api/inventory' : null;

  useEffect(() => {
    const controller = new AbortController();

    const fetchInventory = async () => {
      setLoading(true);
      setError(null);
      setStatusMessage('');

      try {
        const response = await fetch(inventoryUrl, { signal: controller.signal });
        if (!response.ok) {
          throw new Error(`Failed to load inventory (${response.status})`);
        }

        const text = await response.text();
        const data = useServerApi ? JSON.parse(text) : parseSheetResponse(text);
        setItems(Array.isArray(data) ? normalizeRows(data) : []);
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
  }, [inventoryUrl, useServerApi]);

  const deferredSearchTerm = useDeferredValue(searchTerm);

  const filteredItems = useMemo(() => {
    const normalizedSearch = deferredSearchTerm.trim().toLowerCase();
    if (!normalizedSearch) {
      return items;
    }
    return items.filter((item) => item.name.toLowerCase().includes(normalizedSearch));
  }, [items, deferredSearchTerm]);

  const handleNewItemChange = (field, value) => {
    setNewItem((prev) => ({ ...prev, [field]: value }));
  };

  const saveSheetChange = async (method, payload) => {
    if (!saveUrl) {
      throw new Error('Sheet save is not available in local mode');
    }

    setError(null);
    setStatusMessage('');
    setLoading(true);

    try {
      const response = await fetch(saveUrl, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || 'Unable to save sheet data');
      }

      const data = await response.json();
      setItems(Array.isArray(data) ? normalizeRows(data) : []);
      return data;
    } finally {
      setLoading(false);
    }
  };

  const handleAddItem = async (event) => {
    event.preventDefault();
    const trimmedName = newItem.name.trim();
    if (!trimmedName) {
      return;
    }

    if (saveUrl) {
      try {
        await saveSheetChange('POST', {
          name: trimmedName,
          price: newItem.price.trim(),
          location: newItem.location.trim(),
        });
        setStatusMessage('Item saved to Google Sheet.');
        setNewItem({ name: '', price: '', location: '' });
      } catch (err) {
        setError(err.message || 'Unable to save item');
      }
      return;
    }

    setItems((prev) => [
      {
        id: `new-${Date.now()}`,
        name: trimmedName,
        price: newItem.price.trim(),
        location: newItem.location.trim(),
      },
      ...prev,
    ]);
    setStatusMessage('Local mode: add is temporary until deploying with API support.');
    setNewItem({ name: '', price: '', location: '' });
  };

  const startEditing = (item) => {
    setEditingId(item.id);
    setEditingItem({ name: item.name, price: item.price, location: item.location });
    setStatusMessage('');
  };

  const handleEditChange = (field, value) => {
    setEditingItem((prev) => ({ ...prev, [field]: value }));
  };

  const saveEdit = async (id) => {
    const itemToUpdate = items.find((item) => item.id === id);
    if (!itemToUpdate) return;

    const trimmedName = editingItem.name.trim();
    if (!trimmedName) {
      setError('Product Name is required');
      return;
    }

    if (saveUrl && itemToUpdate.rowNumber) {
      try {
        await saveSheetChange('PUT', {
          rowNumber: itemToUpdate.rowNumber,
          name: trimmedName,
          price: editingItem.price.trim(),
          location: editingItem.location.trim(),
        });
        setStatusMessage('Item updated on Google Sheet.');
      } catch (err) {
        setError(err.message || 'Unable to update item');
      }
    } else {
      setItems((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                name: trimmedName,
                price: editingItem.price.trim(),
                location: editingItem.location.trim(),
              }
            : item
        )
      );
      setStatusMessage('Local edit saved temporarily. Deploy to persist to the sheet.');
    }

    setEditingId(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  return (
    <div className="App">
      <main className="app-container">
        <section className="hero">
          <h1>Price and Stock Database</h1>
          <p>Search inventory pulled from your Google Sheet, and save changes permanently when deployed.</p>
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

        <section className="form-panel">
          <h2>Add new inventory item</h2>
          <form className="inventory-form" onSubmit={handleAddItem}>
            <label htmlFor="new-name" className="visually-hidden">Product Name</label>
            <input
              id="new-name"
              name="productName"
              type="text"
              placeholder="Product Name"
              value={newItem.name}
              onChange={(event) => handleNewItemChange('name', event.target.value)}
            />
            <label htmlFor="new-price" className="visually-hidden">Price</label>
            <input
              id="new-price"
              name="price"
              type="text"
              placeholder="Price"
              value={newItem.price}
              onChange={(event) => handleNewItemChange('price', event.target.value)}
            />
            <label htmlFor="new-location" className="visually-hidden">Location</label>
            <input
              id="new-location"
              name="location"
              type="text"
              placeholder="Location"
              value={newItem.location}
              onChange={(event) => handleNewItemChange('location', event.target.value)}
            />
            <button type="submit" className="primary-button">
              Add Item
            </button>
          </form>
          <p className="status-note">
            {useServerApi
              ? 'Changes are sent to the sheet API. Make sure the app is deployed with Google service account credentials for permanent saves.'
              : 'Local mode does not persist changes to the sheet. Deploy to Vercel or run a local API server with valid Google credentials for permanent saves.'}
          </p>
        </section>

        {statusMessage && <div className="status-banner">{statusMessage}</div>}

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
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.length > 0 ? (
                    filteredItems.map((item) => (
                      <tr key={item.id}>
                        {editingId === item.id ? (
                          <>
                            <td>
                              <input
                                name="editName"
                                id={`edit-name-${item.id}`}
                                value={editingItem.name}
                                onChange={(event) => handleEditChange('name', event.target.value)}
                              />
                            </td>
                            <td>
                              <input
                                name="editPrice"
                                id={`edit-price-${item.id}`}
                                value={editingItem.price}
                                onChange={(event) => handleEditChange('price', event.target.value)}
                              />
                            </td>
                            <td>
                              <input
                                name="editLocation"
                                id={`edit-location-${item.id}`}
                                value={editingItem.location}
                                onChange={(event) => handleEditChange('location', event.target.value)}
                              />
                            </td>
                            <td className="table-actions">
                              <button type="button" className="small-button" onClick={() => saveEdit(item.id)}>
                                Save
                              </button>
                              <button type="button" className="small-button secondary" onClick={cancelEdit}>
                                Cancel
                              </button>
                            </td>
                          </>
                        ) : (
                          <>
                            <td>{item.name}</td>
                            <td>{item.price}</td>
                            <td>{item.location}</td>
                            <td className="table-actions">
                              <button type="button" className="small-button" onClick={() => startEditing(item)}>
                                Edit
                              </button>
                            </td>
                          </>
                        )}
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="4" className="empty-state">
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
