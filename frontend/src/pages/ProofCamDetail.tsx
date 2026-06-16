import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, API_BASE } from "../api";
import { useAuth } from "../hooks/useAuth";
import "../styles/proofcam.css";

type ParsedItem = {
  name: string;
  quantity: number;
  unitPrice?: number | null;
  totalPrice?: number | null;
};

type ValidationAnomaly = {
  type: string;
  message?: string;
  item?: string;
};

type ValidationSummary = {
  isValid?: boolean;
  confidence?: number | null;
  summary?: {
    ticketTotal?: number | null;
    computedTotal?: number | null;
    itemsCount?: number | null;
    anomaliesCount?: number | null;
  };
  anomalies?: ValidationAnomaly[];
};

type ParsedData = {
  phoneNumber?: string | null;
  ticketDate?: string | null;
  totalAmount?: number | null;
  items?: ParsedItem[];
};

type ScanItem = {
  id: string;
  imageUrl: string;
  processedUrl?: string | null;
  orderCode: string | null;
  customerName?: string | null;
  status?: string;
  createdAt: string;
  originalName?: string | null;
  rawText?: string | null;
  parsedData?: ParsedData;
  scannedBy?: string | null;
  validation?: ValidationSummary | null;
};

export default function ProofCamDetail() {
  const { user } = useAuth();
  const canSeePrices = user?.role === "ADMIN";
  const { id } = useParams<{ id: string }>();
  const [item, setItem] = useState<ScanItem | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (!id) return;

    const fetchScan = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await api.get<ScanItem>(`/proofcam/${id}`);
        setItem(res.data);
      } catch (err) {
        setError("Impossible de charger les détails du ticket.");
      } finally {
        setLoading(false);
      }
    };

    fetchScan();
  }, [id]);

  const retryScan = async () => {
    if (!id) return;
    setRetrying(true);
    setError("");
    try {
      const res = await api.post<ScanItem>(`/proofcam/${id}/reprocess`);
      setItem(res.data);
    } catch (err) {
      setError("Erreur lors de la relance du scan. Vérifiez le service OCR.");
    } finally {
      setRetrying(false);
    }
  };

  if (!id) {
    return (
      <div className="proofcam-page">
        <div className="proofcam-card">
          <p>ID de ticket manquant.</p>
          <Link to="/proofcam" className="btn-secondary">
            Retour
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="proofcam-page">
      <div className="proofcam-header">
        <div>
          <h1>Détails du ticket</h1>
          <p>Visualisez le ticket scanné, l&apos;OCR brut, et les données détectées.</p>
        </div>
      </div>

      <div className="proofcam-card">
        <div className="section-title">
          <h2>Informations</h2>
        </div>

        {loading ? (
          <div className="alert info">Chargement...</div>
        ) : error ? (
          <div className="alert error">{error}</div>
        ) : item ? (
          <>
            <div className="detail-actions">
              <Link to="/proofcam" className="btn-secondary">
                Retour aux scans
              </Link>
              <a
                href={API_BASE + item.imageUrl}
                download={item.originalName ?? "ticket.jpg"}
                className="btn-primary"
              >
                Télécharger l&apos;image
              </a>
              {(item.status === "failed" || !item.orderCode) && !retrying ? (
                <button type="button" onClick={retryScan} className="btn-secondary">
                  Relancer le scan
                </button>
              ) : null}
              {retrying ? (
                <button type="button" className="btn-secondary" disabled>
                  Relance en cours...
                </button>
              ) : null}
            </div>

            <div className="ticket-details">
              <div className="ticket-details-meta">
                <p>
                  <strong>Ticket :</strong> {item.orderCode ?? "—"}
                </p>
                <p>
                  <strong>Client :</strong> {item.customerName ?? "—"}
                </p>
                <p>
                  <strong>Statut :</strong> {item.status ?? "—"}
                </p>
                <p>
                  <strong>Date scan :</strong> {new Date(item.createdAt).toLocaleString()}
                </p>
                <p>
                  <strong>Date ticket :</strong>{" "}
                  {item.parsedData?.ticketDate
                    ? new Date(item.parsedData.ticketDate).toLocaleString()
                    : "—"}
                </p>
                {canSeePrices ? (
                  <p>
                    <strong>Total détecté :</strong>{" "}
                    {item.parsedData?.totalAmount != null
                      ? `${item.parsedData.totalAmount.toFixed(2)}€`
                      : "—"}
                  </p>
                ) : null}
                <p>
                  <strong>Téléphone :</strong> {item.parsedData?.phoneNumber ?? "—"}
                </p>
                <p>
                  <strong>Scanné par :</strong> {item.scannedBy ?? "—"}
                </p>
                </div>

              {item.processedUrl ? (
                <div className="preview-wrap">
                  <h3>Image traitée</h3>
                  <img src={API_BASE + item.processedUrl} alt="Image traitée" className="preview-image" />
                </div>
              ) : null}

              <div className="preview-wrap">
                <h3>Image originale</h3>
                <img src={API_BASE + item.imageUrl} alt="Image originale" className="preview-image" />
              </div>

              {item.validation && (
                <div className={`validation-card ${item.validation.isValid ? "valid" : "invalid"}`}>
                  <div className="validation-header">
                    <h3>Validation commande</h3>
                    <span className={`confidence-badge ${(item.validation.confidence || 0) >= 80 ? "high" : "low"}`}>
                      Confiance : {item.validation.confidence || 0}%
                    </span>
                  </div>
                  {item.validation.summary && (
                    <div className="validation-summary">
                      <p><strong>Articles :</strong> {item.validation.summary.itemsCount ?? 0}</p>
                      <p><strong>Anomalies :</strong> {item.validation.summary.anomaliesCount ?? 0}</p>
                      {item.validation.summary.ticketTotal != null && (
                        <p>
                          <strong>Total ticket :</strong> {item.validation.summary.ticketTotal.toFixed(2)}€
                          {item.validation.summary.computedTotal != null && (
                            <span> vs menu {item.validation.summary.computedTotal.toFixed(2)}€</span>
                          )}
                        </p>
                      )}
                    </div>
                  )}
                  {item.validation.anomalies && item.validation.anomalies.length > 0 && (
                    <div className="anomalies-list">
                      {item.validation.anomalies.map((anomaly, idx) => (
                        <div key={`${item.id}-anomaly-${idx}`} className={`anomaly-item ${anomaly.type}`}>
                          <span className="anomaly-type">{anomaly.type}</span>
                          <span className="anomaly-message">{anomaly.message}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {item.parsedData?.items?.length ? (
                <div className="section-title">
                  <h2>Articles détectés</h2>
                </div>
              ) : null}


              {item.parsedData?.items?.length ? (
                <table className="item-table">
                  <thead>
                    <tr>
                      <th>Article</th>
                      <th>Quantité</th>
                      <th>Prix unitaire</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {item.parsedData.items.map((line, idx) => (
                      <tr key={`${item.id}-detail-${idx}`}>
                        <td>{line.name}</td>
                        <td>{line.quantity ?? 1}</td>
                            <td>
                          {canSeePrices && line.unitPrice != null
                            ? `${line.unitPrice.toFixed(2)}€`
                            : "—"}
                        </td>
                        <td>
                          {canSeePrices && line.totalPrice != null
                            ? `${line.totalPrice.toFixed(2)}€`
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="ticket-no-items">Aucun article détecté.</div>
              )}

              <div className="ticket-rawtext">
                <h4>Texte OCR brut</h4>
                <pre>{item.rawText ?? "Aucun texte disponible"}</pre>
              </div>
            </div>
          </>
        ) : (
          <div className="alert error">Aucun ticket trouvé.</div>
        )}
      </div>
    </div>
  );
}
