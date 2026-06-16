import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, API_BASE } from "../api";
import { useAuth } from "../hooks/useAuth";
import { compressImage } from "../utils/compressImage";
import "../styles/proofcam.css";

type ParsedItem = {
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
};

type ParsedData = {
  phoneNumber?: string | null;
  ticketDate?: string | null;
  totalAmount?: number | null;
  items?: ParsedItem[];
};

type ValidationSummary = {
  isValid?: boolean;
  confidence?: number | null;
  summary?: {
    ticketNumber?: string | null;
    customerName?: string | null;
    ticketTotal?: number | null;
    computedTotal?: number | null;
    totalMatch?: boolean | null;
    totalDiff?: number | null;
    itemsCount?: number | null;
    anomaliesCount?: number | null;
  };
  anomalies?: Array<{ type: string; message: string }>;
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

type DatasetStatus = {
  available: boolean;
  availableFrom?: string;
  availableUntil?: string;
  hoursLeft?: number;
};

type DatasetStats = {
  total: number;
  labeled: number;
  unlabeled: number;
  processing: number;
  failed: number;
};

function TicketInput({
  item,
  onSave,
}: {
  item: ScanItem;
  onSave: (id: string, code: string) => Promise<void>;
}) {
  const isMissing = item.status !== "processing" && !item.orderCode;
  const rawInitial = item.orderCode?.replace(/^#/, "") ?? "";

  const [value, setValue] = useState(rawInitial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    setValue(item.orderCode?.replace(/^#/, "") ?? "");
  }, [item.orderCode]);

  if (item.status === "processing") {
    return <span className="processing">Lecture en cours…</span>;
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const clean = e.target.value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    setValue(clean);
    setSaved(false);
    setErr("");
  };

  const handleSave = async () => {
    const trimmed = value.trim();

    if (!trimmed) {
      setErr("Le numéro de ticket est obligatoire.");
      return;
    }

    const finalCode = `#${trimmed}`;
    setSaving(true);
    setErr("");

    try {
      await onSave(item.id, finalCode);
      setSaved(true);
    } catch {
      setErr("Erreur lors de la sauvegarde.");
    } finally {
      setSaving(false);
    }
  };

  const isDirty = value.trim() !== rawInitial;

  return (
    <div className="ticket-input-wrap">
      <div className="ticket-input-row">
        <span className="ticket-hash">#</span>
        <input
          type="text"
          className={`ticket-code-input${isMissing ? " required" : ""}${saved ? " saved" : ""}`}
          value={value}
          onChange={handleChange}
          placeholder={isMissing ? "Requis…" : ""}
          maxLength={30}
          aria-label="Numéro de ticket"
        />
        {(isDirty || isMissing) && (
          <button
            type="button"
            className="btn-save-code"
            onClick={handleSave}
            disabled={saving}
            title="Sauvegarder le numéro"
          >
            {saving ? "…" : "✓"}
          </button>
        )}
        {saved && !isDirty && <span className="saved-badge">✓</span>}
      </div>

      {isMissing && !value && (
        <span className="ticket-required-hint">Numéro obligatoire</span>
      )}

      {err && <span className="ticket-error-hint">{err}</span>}
    </div>
  );
}

export default function ProofCam() {
  const { user } = useAuth();

  const role = String(user?.role || "").toUpperCase();
  const canSeePrices = role === "ADMIN" || role === "SUPERADMIN";
  const canManageDataset = role === "ADMIN" || role === "SUPERADMIN";

  const [items, setItems] = useState<ScanItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [systemStatus, setSystemStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [search, setSearch] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [datasetStats, setDatasetStats] = useState<DatasetStats | null>(null);
  const [datasetStatsError, setDatasetStatsError] = useState("");
  const [datasetStatus, setDatasetStatus] = useState<DatasetStatus | null>(null);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [exportingJson, setExportingJson] = useState(false);

  const loadItems = useCallback(async () => {
    try {
      const res = await api.get<ScanItem[]>("/proofcam");
      setItems(res.data);
    } catch {
      setItems([]);
    }
  }, []);

  const loadSystemStatus = useCallback(async () => {
    try {
      const res = await api.get<{ ok: boolean }>("/health");
      const message = res.data.ok ? "OCR service disponible" : "OCR service indisponible";
      setSystemStatus({ ok: res.data.ok, message });
    } catch {
      setSystemStatus({ ok: false, message: "Échec de la connexion au service OCR" });
    }
  }, []);

  const loadDatasetStats = useCallback(async () => {
    if (!canManageDataset) {
      setDatasetStats(null);
      return;
    }

    try {
      const res = await api.get<DatasetStats>("/proofcam/dataset/stats");
      setDatasetStats(res.data);
      setDatasetStatsError("");
    } catch {
      setDatasetStatsError("Impossible de charger les statistiques du dataset.");
    }
  }, [canManageDataset]);

  const loadDatasetStatus = useCallback(async () => {
    if (!canManageDataset) {
      setDatasetStatus(null);
      return;
    }

    try {
      const res = await api.get<DatasetStatus>("/proofcam/dataset/status");
      setDatasetStatus(res.data);
    } catch {
      setDatasetStatus({ available: false });
    }
  }, [canManageDataset]);

  useEffect(() => {
    loadItems();
    loadSystemStatus();
    loadDatasetStats();
    loadDatasetStatus();

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [loadItems, loadSystemStatus, loadDatasetStats, loadDatasetStatus]);

  useEffect(() => {
    const hasProcessing = items.some((i) => i.status === "processing");

    if (hasProcessing && !pollRef.current) {
      pollRef.current = setInterval(loadItems, 1500);
    }

    if (!hasProcessing && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, [items, loadItems]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const saveOrderCode = useCallback(
    async (id: string, code: string) => {
      await api.patch(`/proofcam/${id}`, { orderCode: code });

      setItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, orderCode: code } : item))
      );

      await loadDatasetStats();
      await loadDatasetStatus();
    },
    [loadDatasetStats, loadDatasetStatus]
  );

  const downloadDataset = async (format: "csv" | "json") => {
    const setter = format === "csv" ? setExportingCsv : setExportingJson;
    setter(true);

    try {
      const res = await api.get(`/proofcam/dataset/${format}`, {
        responseType: "blob",
      });

      const blob = new Blob([res.data], {
        type: format === "csv" ? "text/csv" : "application/json",
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `proofcam_dataset_${Date.now()}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError(`Erreur lors de l'export ${format.toUpperCase()}.`);
    } finally {
      setter(false);
    }
  };

  const sortedItems = useMemo(
    () => [...items].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
    [items]
  );

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sortedItems;

    return sortedItems.filter((item) => {
      const code = (item.orderCode ?? "").toLowerCase();
      const name = (item.customerName ?? "").toLowerCase();
      const file = (item.originalName ?? "").toLowerCase();
      return code.includes(q) || name.includes(q) || file.includes(q);
    });
  }, [sortedItems, search]);

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setError("");
    setPreviewUrl(URL.createObjectURL(file));
  };

  const confirmUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    setError("");

    try {
      const compressed = await compressImage(selectedFile);
      const form = new FormData();
      form.append("file", compressed, compressed.name);

      const res = await api.post<ScanItem>("/proofcam/upload", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setItems((prev) => [res.data, ...prev]);
      setSelectedFile(null);

      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return "";
      });

      if (fileRef.current) fileRef.current.value = "";
    } catch (err: unknown) {
      const msg =
        err &&
        typeof err === "object" &&
        "response" in err &&
        err.response &&
        typeof err.response === "object" &&
        "data" in err.response &&
        err.response.data &&
        typeof err.response.data === "object" &&
        "message" in err.response.data
          ? String((err.response.data as { message?: string }).message)
          : "Échec de l'envoi. Vérifiez que le serveur tourne.";

      setError(msg);
    } finally {
      setUploading(false);
    }
  };

  const deleteScan = async (id: string) => {
    if (!window.confirm("Supprimer ce ticket scanné ? Cette action est irréversible.")) return;

    try {
      await api.delete(`/proofcam/${id}`);
      setItems((prev) => prev.filter((item) => item.id !== id));
      await loadDatasetStats();
      await loadDatasetStatus();
    } catch {
      setError("Impossible de supprimer le ticket. Réessayez plus tard.");
    }
  };

  const downloadUrl = (url: string) => `${API_BASE}${url}`;

  const datasetPct =
    datasetStats && datasetStats.total > 0
      ? Math.round((datasetStats.labeled / datasetStats.total) * 100)
      : 0;

  return (
    <div className="proofcam-page">
      <div className="proofcam-header">
        <div>
          <h1>ProofCam</h1>
          <p>
            Photographiez le ticket Uber Eats et la commande. L&apos;image est enregistrée
            tout de suite ; le numéro (#F544, etc.) apparaît en quelques secondes.
          </p>
        </div>
      </div>

      <div className="proofcam-card health-card">
        <h2>Statut du service</h2>
        <div className={systemStatus?.ok ? "alert ok" : "alert error"}>
          {systemStatus ? systemStatus.message : "Vérification du service OCR..."}
        </div>
      </div>

      <div className="proofcam-card upload-card">
        <h2>Scanner un ticket</h2>
        <p className="muted">Caméra ou fichier — image compressée pour un envoi plus rapide.</p>

        <div className="actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            Choisir / caméra
          </button>

          <button
            type="button"
            className="btn-primary"
            onClick={confirmUpload}
            disabled={!selectedFile || uploading}
          >
            {uploading ? "Envoi…" : "Confirmer l'envoi"}
          </button>

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden-input"
            onChange={onPick}
          />
        </div>

        {error && <div className="alert error">{error}</div>}

        {uploading && (
          <div className="alert info">
            Envoi de l&apos;image… La lecture du ticket continue en arrière-plan.
          </div>
        )}

        {selectedFile && !uploading && (
          <div className="alert ok">Sélectionné : {selectedFile.name}</div>
        )}

        {previewUrl && (
          <div className="preview-wrap">
            <h3>Aperçu</h3>
            <img src={previewUrl} alt="Aperçu" className="preview-image" />
          </div>
        )}
      </div>

      {canManageDataset && (
        <div className="proofcam-card dataset-panel">
          <div className="dataset-panel-header">
            <div>
              <h2>Dataset IA</h2>
              <p className="muted">
                Chaque ticket avec un numéro confirmé est automatiquement inclus dans le
                dataset d&apos;entraînement.
              </p>
            </div>
            <span className="dataset-badge">ADMIN</span>
          </div>

          {datasetStatsError && <div className="alert error">{datasetStatsError}</div>}

          {datasetStatus?.available ? (
            <div className="alert ok">
              Dataset disponible jusqu’au{" "}
              {datasetStatus.availableUntil
                ? new Date(datasetStatus.availableUntil).toLocaleString()
                : "—"}
              {datasetStatus.hoursLeft != null ? ` (${datasetStatus.hoursLeft}h restantes)` : ""}
            </div>
          ) : (
            <div className="alert info">Aucun dataset téléchargeable pour le moment.</div>
          )}

          {datasetStats && (
            <>
              <div className="dataset-stats-grid">
                <div className="stat-card stat-labeled">
                  <span className="stat-value">{datasetStats.labeled}</span>
                  <span className="stat-label">Étiquetés ✓</span>
                </div>
                <div className="stat-card stat-unlabeled">
                  <span className="stat-value">{datasetStats.unlabeled}</span>
                  <span className="stat-label">Sans étiquette</span>
                </div>
                <div className="stat-card stat-total">
                  <span className="stat-value">{datasetStats.total}</span>
                  <span className="stat-label">Total</span>
                </div>
              </div>

              <div className="dataset-progress-wrap">
                <div className="dataset-progress-bar-bg">
                  <div
                    className="dataset-progress-bar-fill"
                    style={{ width: `${datasetPct}%` }}
                  />
                </div>
                <span className="dataset-progress-label">{datasetPct}% étiquetés</span>
              </div>
            </>
          )}

          {!datasetStats && !datasetStatsError && (
            <p className="muted">Chargement des statistiques…</p>
          )}

          <div className="dataset-export-row">
            <button
              type="button"
              className="btn-export csv"
              onClick={() => downloadDataset("csv")}
              disabled={
                exportingCsv ||
                !datasetStats ||
                datasetStats.labeled === 0 ||
                !datasetStatus?.available
              }
            >
              {exportingCsv
                ? "Export…"
                : `📄 Exporter CSV${datasetStats ? ` (${datasetStats.labeled})` : ""}`}
            </button>

            <button
              type="button"
              className="btn-export json"
              onClick={() => downloadDataset("json")}
              disabled={
                exportingJson ||
                !datasetStats ||
                datasetStats.labeled === 0 ||
                !datasetStatus?.available
              }
            >
              {exportingJson
                ? "Export…"
                : `🗂️ Exporter JSON${datasetStats ? ` (${datasetStats.labeled})` : ""}`}
            </button>
          </div>

          <p className="muted dataset-note">
            Les chemins d&apos;images sont relatifs depuis <code>proofeat/backend/uploads/</code>.
            Seuls les tickets avec un numéro confirmé sont inclus.
          </p>
        </div>
      )}

      <div className="proofcam-card history-card">
        <div className="section-title">
          <h2>Historique</h2>
          <div className="search-box">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Ticket, client, fichier…"
            />
          </div>
        </div>

        <div className="table-wrap">
          <table className="proofcam-table">
            <thead>
              <tr>
                <th>Photo</th>
                <th>Ticket</th>
                <th>Client</th>
                <th>Total</th>
                <th>Validation</th>
                <th>Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => (
                <Fragment key={item.id}>
                  <tr className={item.status === "processing" ? "row-processing" : ""}>
                    <td data-label="Photo">
                      <img
                        src={downloadUrl(item.imageUrl)}
                        alt="Ticket"
                        className="table-thumb"
                        loading="lazy"
                      />
                    </td>

                    <td data-label="Ticket">
                      <TicketInput item={item} onSave={saveOrderCode} />
                    </td>

                    <td data-label="Client">
                      {item.status === "processing" ? "…" : item.customerName ?? "—"}
                    </td>

                    <td data-label="Total">
                      {canSeePrices && item.parsedData?.totalAmount != null
                        ? `${item.parsedData.totalAmount.toFixed(2)}€`
                        : "—"}
                    </td>

                    <td data-label="Validation">
                      {item.status === "processing" ? (
                        <span className="processing">…</span>
                      ) : item.validation ? (
                        <span className={`validation-badge ${item.validation.isValid ? "valid" : "invalid"}`}>
                          {item.validation.isValid ? "Validé" : "Anomalie"}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>

                    <td data-label="Date">{new Date(item.createdAt).toLocaleString()}</td>

                    <td data-label="Actions">
                      <div className="action-buttons">
                        <Link to={`/proofcam/${item.id}`} className="download-link">
                          Détails
                        </Link>

                        <a
                          href={downloadUrl(item.imageUrl)}
                          download={item.originalName ?? "ticket.jpg"}
                          className="download-link"
                        >
                          Télécharger
                        </a>

                        <button
                          type="button"
                          className="btn-secondary btn-small"
                          onClick={() => deleteScan(item.id)}
                        >
                          Supprimer
                        </button>
                      </div>
                    </td>
                  </tr>
                </Fragment>
              ))}

              {!filteredItems.length && (
                <tr>
                  <td colSpan={6} className="muted-cell">
                    Aucun scan pour le moment.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}