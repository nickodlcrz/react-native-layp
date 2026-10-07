import { useEffect, useState } from "react";
import { AppState } from "react-native";
export default function useClock(interval = 60000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => setNow(new Date());
    const timer = setInterval(tick, interval);
    const sub = AppState.addEventListener("change", (state) => { if (state === "active") tick(); });
    return () => { clearInterval(timer); sub.remove(); };
  }, [interval]);
  return now;
}
