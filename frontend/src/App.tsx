import { useEffect, useState } from "react";
import api from "./services/api";

type HealthResponse = {
  status: string;
  message: string;
};

export default function App() {
  const [data, setData] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        setLoading(true);
        const res = await api.get<HealthResponse>("/health");
        setData(res.data);
      } catch (err) {
        setError("Frontend Running.\nFailed to reach backend");
      } finally {
        setLoading(false);
      }
    };

    fetchHealth();
  }, []);

  if (loading) {
    return <div>Checking backend...</div>;
  }

  if (error) {
    return <div style={{ color: "red" }}>{error}</div>;
  }

  return (
    <div>
      <h1>Frontend Running</h1>
      <p>Backend Status: {data?.status}</p>
      <p>Message: {data?.message}</p>
      <p>Time: {Date.now()}</p>
    </div>
  );
}
