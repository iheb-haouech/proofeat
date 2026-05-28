import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, API_BASE } from "../api";
import { compressImage } from "../utils/compressImage";
import "../styles/proofcam.css";

type ScanItem = {
  id: string;
  imageUrl: string;
  processedUrl?: string | null;
  orderCode: string | null;
  customerName?: string | null;
  status?: string;
  createdAt: string;
  originalName?: string | null;
};

export default function ProofCam() {
  const [items, setItems] = useState<ScanItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadItems = useCallback(async () => {
    try {
      const res = await api.get<ScanItem[]>("/proofcam");
      setItems(res.data);
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => {
    loadItems();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [loadItems]);

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
      form.append("image", compressed);
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

  const downloadUrl = (url: string) => `${API_BASE}${url}`;

  const ticketLabel = (item: ScanItem) => {
    if (item.status === "processing") return "Lecture en cours…";
    if (item.status === "failed" && !item.orderCode) return "Ticket non détecté";
    return item.orderCode ?? "—";
  };

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
                <th>Date</th>
                <th>Télécharger</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => (
                <tr key={item.id} className={item.status === "processing" ? "row-processing" : ""}>
                  <td data-label="Photo">
                    <img
                      src={downloadUrl(item.imageUrl)}
                      alt="Ticket"
                      className="table-thumb"
                      loading="lazy"
                    />
                  </td>
                  <td data-label="Ticket">
                    <strong className={item.status === "processing" ? "processing" : ""}>
                      {ticketLabel(item)}
                    </strong>
                  </td>
                  <td data-label="Client">
                    {item.status === "processing"
                      ? "…"
                      : item.customerName ?? "—"}
                  </td>
                  <td data-label="Date">{new Date(item.createdAt).toLocaleString()}</td>
                  <td data-label="Télécharger">
                    <a
                      href={downloadUrl(item.imageUrl)}
                      download={item.originalName ?? "ticket.jpg"}
                      className="download-link"
                    >
                      Télécharger
                    </a>
                  </td>
                </tr>
              ))}
              {!filteredItems.length && (
                <tr>
                  <td colSpan={5} className="muted-cell">
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
