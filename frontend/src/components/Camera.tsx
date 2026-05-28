import { useRef, useState } from "react";

export default function Camera({ onCapture }: any) {
  const videoRef = useRef<any>(null);
  const [image, setImage] = useState<string | null>(null);
  const [cameraEnabled, setCameraEnabled] = useState(false);

  // 🔹 start camera
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      setCameraEnabled(true);
    } catch (err) {
      alert("Camera not available");
    }
  };

  // 🔹 capture from camera
  const capture = () => {
    const video = videoRef.current;

    if (!video) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0);

    const data = canvas.toDataURL("image/jpeg", 0.5);
    setImage(data);
  };

  // 🔹 upload image
  const handleFile = (e: any) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setImage(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // 🔹 send to parent
  const send = () => {
    if (image) {
      onCapture(image);
    }
  };

  return (
  <div style={{ textAlign: "center" }}>
    
    <div style={{
      border: "2px dashed #38bdf8",
      padding: "10px",
      borderRadius: "10px",
      marginBottom: "10px"
    }}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        style={{ width: "300px", display: cameraEnabled ? "block" : "none" }}
      />
      {!cameraEnabled && <p>Cliquez sur Caméra pour démarrer</p>}
    </div>

    <div>
      <button onClick={startCamera}>📷 Camera</button>

      <input
        type="file"
        accept="image/*"
        onChange={handleFile}
        style={{ marginLeft: "10px" }}
      />
    </div>

    <br />

    <button onClick={capture}>Capture</button>

    {image && (
      <div style={{ marginTop: "10px" }}>
        <img src={image} style={{ width: "200px" }} />
        <br />
        <button onClick={send}>Upload & OCR</button>
      </div>
    )}
  </div>
);
}