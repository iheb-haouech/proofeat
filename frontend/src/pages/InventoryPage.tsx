import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useAuth } from "../hooks/useAuth";
import "../styles/inventory.css";

type Product = {
  id: number;
  name: string;
  price: number;
  stockQuantity: number;
  stockUnit: "CARTON" | "KG";
  alertThreshold: number;
  createdAt: string;
};

type AlertItem = {
  id: number;
  message: string;
  isRead: boolean;
  createdAt: string;
  product?: {
    id: number;
    name: string;
  };
};

type InvoiceBackup = {
  id: number;
  imageUrl: string;
  originalName?: string | null;
  amount?: number | null;
  createdAt: string;
  uploadedBy?: {
    id: number;
    email: string;
    role: string;
  } | null;
};

export default function InventoryPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  const [products, setProducts] = useState<Product[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [invoiceBackups, setInvoiceBackups] = useState<InvoiceBackup[]>([]);
  const [loading, setLoading] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  const [productForm, setProductForm] = useState({
    name: "",
    price: "",
    stockQuantity: "",
    stockUnit: "CARTON" as "CARTON" | "KG",
    alertThreshold: "",
  });

  const [usageForm, setUsageForm] = useState({
    productId: "",
    quantity: "",
    unit: "CARTON" as "CARTON" | "KG",
  });

  const [editingProductId, setEditingProductId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({
    price: "",
    alertThreshold: "",
  });

  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [invoiceAmount, setInvoiceAmount] = useState("");

  async function loadData() {
    setLoading(true);
    try {
      const requests: Promise<any>[] = [
        api.get("/inventory/products"),
        api.get("/inventory/alerts"),
      ];

      if (isAdmin) {
        requests.push(api.get("/inventory/invoice-backups"));
      }

      const results = await Promise.all(requests);
      setProducts(results[0].data || []);
      setAlerts(results[1].data || []);
      setInvoiceBackups(isAdmin ? results[2]?.data || [] : []);
    } catch (err) {
      console.error("Inventory load error:", err);
      setProducts([]);
      setAlerts([]);
      setInvoiceBackups([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [isAdmin]);

  async function handleCreateProduct(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post("/inventory/products", {
        name: productForm.name,
        price: Number(productForm.price),
        stockQuantity: Number(productForm.stockQuantity),
        stockUnit: productForm.stockUnit,
        alertThreshold: Number(productForm.alertThreshold),
      });

      setProductForm({
        name: "",
        price: "",
        stockQuantity: "",
        stockUnit: "CARTON",
        alertThreshold: "",
      });

      await loadData();
    } catch (err) {
      console.error("Create product error:", err);
      alert("Impossible de créer le produit");
    }
  }

  async function handleAddUsage(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post("/inventory/usage", {
        productId: Number(usageForm.productId),
        quantity: Number(usageForm.quantity),
        unit: usageForm.unit,
      });

      setUsageForm({
        productId: "",
        quantity: "",
        unit: "CARTON",
      });

      await loadData();
    } catch (err) {
      console.error("Usage error:", err);
      alert("Impossible d'enregistrer l'utilisation");
    }
  }

  async function markAlertRead(id: number) {
    try {
      await api.post(`/inventory/alerts/${id}/read`);
      await loadData();
    } catch (err) {
      console.error("Alert read error:", err);
    }
  }

  function startEdit(product: Product) {
    setEditingProductId(product.id);
    setEditForm({
      price: String(product.price ?? ""),
      alertThreshold: String(product.alertThreshold ?? ""),
    });
  }

  async function saveEdit(productId: number) {
    try {
      await api.patch(`/inventory/products/${productId}`, {
        price: Number(editForm.price),
        alertThreshold: Number(editForm.alertThreshold),
      });
      setEditingProductId(null);
      await loadData();
    } catch (err) {
      console.error("Update product error:", err);
      alert("Impossible de modifier le produit");
    }
  }

  async function removeProduct(productId: number) {
    const confirmed = window.confirm("Supprimer ce produit ?");
    if (!confirmed) return;

    try {
      await api.delete(`/inventory/products/${productId}`);
      await loadData();
    } catch (err) {
      console.error("Delete product error:", err);
      alert("Impossible de supprimer le produit");
    }
  }

  async function uploadInvoice(e: React.FormEvent) {
    e.preventDefault();

    if (!invoiceFile) {
      alert("Choisissez une image de facture");
      return;
    }

    try {
      const formData = new FormData();
      formData.append("file", invoiceFile);

      if (invoiceAmount.trim() !== "") {
        formData.append("amount", invoiceAmount);
      }

      await api.post("/inventory/invoice-backups/upload", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      setInvoiceFile(null);
      setInvoiceAmount("");
      await loadData();
    } catch (err) {
      console.error("Upload invoice error:", err);
      alert("Impossible d'envoyer la facture");
    }
  }

  const unreadAlerts = useMemo(() => alerts.filter((a) => !a.isRead), [alerts]);

  return (
    <div className="inventory-page">
      <div className="inventory-shell">
        <div className="inventory-hero">
          <div>
            <h1>Gestion de stock</h1>
            <p>
              {isAdmin
                ? "Créez des produits, surveillez les alertes de stock et archivez les factures d'achat."
                : "Déclarez la quantité utilisée pour les produits disponibles."}
            </p>
          </div>

          {isAdmin && (
            <div className="inventory-hero-actions" style={{ position: "relative" }}>
              <button
                type="button"
                className="inventory-bell"
                onClick={() => setShowNotifications((prev) => !prev)}
                aria-label="Ouvrir les notifications"
              >
                🔔
                {unreadAlerts.length > 0 && (
                  <span className="inventory-bell-badge">{unreadAlerts.length}</span>
                )}
              </button>

              {showNotifications && (
                <div className="inventory-notifications">
                  <div className="inventory-notifications-title">Notifications</div>

                  {!unreadAlerts.length && (
                    <div className="inventory-muted">Aucune nouvelle alerte.</div>
                  )}

                  {unreadAlerts.map((alertItem) => (
                    <div key={alertItem.id} className="inventory-notification-item">
                      <strong>{alertItem.product?.name ?? "Produit"}</strong>
                      <p>{alertItem.message}</p>

                      <div className="inventory-actions">
                        <small className="inventory-muted">
                          {new Date(alertItem.createdAt).toLocaleString()}
                        </small>
                        <button
                          type="button"
                          className="inventory-btn inventory-btn-secondary"
                          onClick={() => markAlertRead(alertItem.id)}
                        >
                          Marquer lu
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {loading && (
          <div className="inventory-card inventory-section">
            <p className="inventory-muted">Chargement...</p>
          </div>
        )}

        {isAdmin && (
          <div className="inventory-grid">
            <div className="inventory-card">
              <h2>Ajouter un produit</h2>

              <form onSubmit={handleCreateProduct} className="inventory-form-grid">
                <div className="inventory-field">
                  <label>Nom</label>
                  <input
                    className="inventory-input"
                    type="text"
                    value={productForm.name}
                    onChange={(e) =>
                      setProductForm((prev) => ({ ...prev, name: e.target.value }))
                    }
                    required
                  />
                </div>

                <div className="inventory-field">
                  <label>Prix (€)</label>
                  <input
                    className="inventory-input"
                    type="number"
                    step="0.01"
                    min="0"
                    value={productForm.price}
                    onChange={(e) =>
                      setProductForm((prev) => ({ ...prev, price: e.target.value }))
                    }
                    required
                  />
                </div>

                <div className="inventory-field">
                  <label>Stock initial</label>
                  <input
                    className="inventory-input"
                    type="number"
                    step="0.01"
                    min="0"
                    value={productForm.stockQuantity}
                    onChange={(e) =>
                      setProductForm((prev) => ({
                        ...prev,
                        stockQuantity: e.target.value,
                      }))
                    }
                    required
                  />
                </div>

                <div className="inventory-field">
                  <label>Unité</label>
                  <select
                    className="inventory-select"
                    value={productForm.stockUnit}
                    onChange={(e) =>
                      setProductForm((prev) => ({
                        ...prev,
                        stockUnit: e.target.value as "CARTON" | "KG",
                      }))
                    }
                  >
                    <option value="CARTON">Carton</option>
                    <option value="KG">KG</option>
                  </select>
                </div>

                <div className="inventory-field">
                  <label>Seuil alerte</label>
                  <input
                    className="inventory-input"
                    type="number"
                    step="0.01"
                    min="0"
                    value={productForm.alertThreshold}
                    onChange={(e) =>
                      setProductForm((prev) => ({
                        ...prev,
                        alertThreshold: e.target.value,
                      }))
                    }
                    required
                  />
                </div>

                <div className="inventory-field" style={{ justifyContent: "end" }}>
                  <span>&nbsp;</span>
                  <button type="submit" className="inventory-btn inventory-btn-primary">
                    Ajouter
                  </button>
                </div>
              </form>
            </div>

            <div className="inventory-card">
              <h2>Backup factures stock</h2>

              <div className="inventory-upload-box">
                <form
                  onSubmit={uploadInvoice}
                  className="inventory-form-grid inventory-form-grid--compact"
                >
                  <div className="inventory-field">
                    <label>Image facture</label>
                    <input
                      className="inventory-file"
                      type="file"
                      accept="image/*"
                      onChange={(e) => setInvoiceFile(e.target.files?.[0] || null)}
                    />
                  </div>

                  <div className="inventory-field">
                    <label>Montant facture (optionnel)</label>
                    <input
                      className="inventory-input"
                      type="number"
                      step="0.01"
                      min="0"
                      value={invoiceAmount}
                      onChange={(e) => setInvoiceAmount(e.target.value)}
                      placeholder="Ex: 120.50"
                    />
                  </div>

                  <div className="inventory-field" style={{ justifyContent: "end" }}>
                    <span>&nbsp;</span>
                    <button type="submit" className="inventory-btn inventory-btn-primary">
                      Envoyer
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        <div className="inventory-card inventory-section">
          <div className="inventory-toolbar">
            <div>
              <h2>{isAdmin ? "Produits en stock" : "Déclarer une utilisation"}</h2>
              <p>
                {isAdmin
                  ? "Modifiez rapidement les prix, seuils et gérez les suppressions."
                  : "Sélectionnez un produit puis enregistrez la quantité utilisée."}
              </p>
            </div>
          </div>

          {!isAdmin && (
            <form
              onSubmit={handleAddUsage}
              className="inventory-form-grid inventory-section"
            >
              <div className="inventory-field">
                <label>Produit</label>
                <select
                  className="inventory-select"
                  value={usageForm.productId}
                  onChange={(e) =>
                    setUsageForm((prev) => ({ ...prev, productId: e.target.value }))
                  }
                  required
                >
                  <option value="">Sélectionner</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} ({product.stockQuantity} {product.stockUnit})
                    </option>
                  ))}
                </select>
              </div>

              <div className="inventory-field">
                <label>Quantité utilisée</label>
                <input
                  className="inventory-input"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={usageForm.quantity}
                  onChange={(e) =>
                    setUsageForm((prev) => ({ ...prev, quantity: e.target.value }))
                  }
                  required
                />
              </div>

              <div className="inventory-field">
                <label>Unité</label>
                <select
                  className="inventory-select"
                  value={usageForm.unit}
                  onChange={(e) =>
                    setUsageForm((prev) => ({
                      ...prev,
                      unit: e.target.value as "CARTON" | "KG",
                    }))
                  }
                >
                  <option value="CARTON">Carton</option>
                  <option value="KG">KG</option>
                </select>
              </div>

              <div className="inventory-field" style={{ justifyContent: "end" }}>
                <span>&nbsp;</span>
                <button type="submit" className="inventory-btn inventory-btn-primary">
                  Enregistrer
                </button>
              </div>
            </form>
          )}

          <div className="inventory-table-wrap">
            <table className="inventory-table">
              <thead>
                <tr>
                  <th>Produit</th>
                  <th>Prix</th>
                  <th>Stock</th>
                  <th>Unité</th>
                  <th>Seuil</th>
                  {isAdmin && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {products.map((product) => {
                  const isEditing = editingProductId === product.id;
                  const isLowStock = Number(product.stockQuantity) <= Number(product.alertThreshold);

                  return (
                    <tr key={product.id}>
                      <td>
                        <strong>{product.name}</strong>
                      </td>

                      <td>
                        {isEditing ? (
                          <input
                            className="inventory-inline-input"
                            type="number"
                            step="0.01"
                            value={editForm.price}
                            onChange={(e) =>
                              setEditForm((prev) => ({ ...prev, price: e.target.value }))
                            }
                          />
                        ) : (
                          <span className="inventory-price-chip">
                            {Number(product.price).toFixed(2)}€
                          </span>
                        )}
                      </td>

                      <td>
                        <span
                          className={`inventory-stock-chip ${isLowStock ? "low" : ""}`}
                        >
                          {product.stockQuantity}
                        </span>
                      </td>

                      <td>{product.stockUnit}</td>

                      <td>
                        {isEditing ? (
                          <input
                            className="inventory-inline-input"
                            type="number"
                            step="0.01"
                            value={editForm.alertThreshold}
                            onChange={(e) =>
                              setEditForm((prev) => ({
                                ...prev,
                                alertThreshold: e.target.value,
                              }))
                            }
                          />
                        ) : (
                          <span className="inventory-alert-chip">
                            {product.alertThreshold}
                          </span>
                        )}
                      </td>

                      {isAdmin && (
                        <td>
                          <div className="inventory-actions">
                            {isEditing ? (
                              <>
                                <button
                                  type="button"
                                  className="inventory-btn inventory-btn-primary"
                                  onClick={() => saveEdit(product.id)}
                                >
                                  Sauvegarder
                                </button>
                                <button
                                  type="button"
                                  className="inventory-btn inventory-btn-secondary"
                                  onClick={() => setEditingProductId(null)}
                                >
                                  Annuler
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  className="inventory-btn inventory-btn-secondary"
                                  onClick={() => startEdit(product)}
                                >
                                  Modifier
                                </button>
                                <button
                                  type="button"
                                  className="inventory-btn inventory-btn-danger"
                                  onClick={() => removeProduct(product.id)}
                                >
                                  Supprimer
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}

                {!products.length && (
                  <tr>
                    <td colSpan={isAdmin ? 6 : 5} className="inventory-empty">
                      Aucun produit.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {isAdmin && (
          <div className="inventory-history-grid">
            <div className="inventory-card inventory-section">
              <h2>Archives des factures</h2>

              <div className="inventory-table-wrap">
                <table className="inventory-table">
                  <thead>
                    <tr>
                      <th>Fichier</th>
                      <th>Montant</th>
                      <th>Ajouté par</th>
                      <th>Date</th>
                      <th>Télécharger</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoiceBackups.map((backup) => (
                      <tr key={backup.id}>
                        <td>{backup.originalName || `Facture #${backup.id}`}</td>
                        <td>
                          {backup.amount != null
                            ? `${Number(backup.amount).toFixed(2)}€`
                            : "—"}
                        </td>
                        <td>{backup.uploadedBy?.email ?? "—"}</td>
                        <td>{new Date(backup.createdAt).toLocaleString()}</td>
                        <td>
                          <a
                            href={backup.imageUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inventory-btn inventory-btn-secondary"
                            style={{
                              textDecoration: "none",
                              display: "inline-flex",
                              alignItems: "center",
                            }}
                          >
                            Ouvrir
                          </a>
                        </td>
                      </tr>
                    ))}

                    {!invoiceBackups.length && (
                      <tr>
                        <td colSpan={5} className="inventory-empty">
                          Aucune facture enregistrée.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="inventory-card inventory-section">
              <h2>Historique alertes stock</h2>

              <div className="inventory-table-wrap">
                <table className="inventory-table">
                  <thead>
                    <tr>
                      <th>Produit</th>
                      <th>Message</th>
                      <th>Date</th>
                      <th>Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alerts.map((alertItem) => (
                      <tr key={alertItem.id}>
                        <td>{alertItem.product?.name ?? "—"}</td>
                        <td>{alertItem.message}</td>
                        <td>{new Date(alertItem.createdAt).toLocaleString()}</td>
                        <td>{alertItem.isRead ? "Lu" : "Non lu"}</td>
                      </tr>
                    ))}

                    {!alerts.length && (
                      <tr>
                        <td colSpan={4} className="inventory-empty">
                          Aucune alerte.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}