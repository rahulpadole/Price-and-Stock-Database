import './App.css';

export default function AddProductPage({
  newItem,
  handleNewItemChange,
  handleAddItem,
  useServerApi,
  onBack,
}) {
  return (
    <main className="app-container">
      <section className="hero">
        <h1>Add New Product</h1>
        <p>Enter product details and save them to your Google Sheet.</p>
      </section>

      <section className="form-panel">
        <h2>Add new inventory item</h2>
        <form className="inventory-form" onSubmit={handleAddItem}>
          <div className="form-grid">
            <div className="form-field">
              <label htmlFor="new-name">Product Name</label>
              <input
                id="new-name"
                name="productName"
                type="text"
                placeholder="Product Name"
                value={newItem.name}
                onChange={(event) => handleNewItemChange('name', event.target.value)}
              />
            </div>

            <div className="form-field">
              <label htmlFor="new-price">Price</label>
              <input
                id="new-price"
                name="price"
                type="text"
                placeholder="Price"
                value={newItem.price}
                onChange={(event) => handleNewItemChange('price', event.target.value)}
              />
            </div>

            <div className="form-field">
              <label htmlFor="new-location">Location</label>
              <input
                id="new-location"
                name="location"
                type="text"
                placeholder="Location"
                value={newItem.location}
                onChange={(event) => handleNewItemChange('location', event.target.value)}
              />
            </div>
          </div>

          <div className="form-actions">
            <button type="submit" className="primary-button">
              Add Item
            </button>
            <button type="button" className="secondary-button" onClick={onBack}>
              Back to inventory
            </button>
          </div>
        </form>
        <p className="status-note">
          {useServerApi
            ? 'Changes are sent to the sheet API. Make sure the app is deployed with Google service account credentials for permanent saves.'
            : 'Local mode does not persist changes to the sheet. Deploy to Vercel or run a local API server with valid Google credentials for permanent saves.'}
        </p>
      </section>
    </main>
  );
}
