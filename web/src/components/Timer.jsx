import { useEffect, useState } from "react";

export default function Timer({ deadline, onExpire }) {
  const [remaining, setRemaining] = useState(Math.max(0, deadline - Date.now()));

  useEffect(() => {
    const id = setInterval(() => {
      const r = Math.max(0, deadline - Date.now());
      setRemaining(r);
      if (r <= 0) {
        clearInterval(id);
        onExpire && onExpire();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [deadline, onExpire]);

  const totalSeconds = Math.floor(remaining / 1000);
  const mm = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const ss = String(totalSeconds % 60).padStart(2, "0");
  const low = totalSeconds < 5 * 60;

  return <div className={"timer" + (low ? " low" : "")}>{mm}:{ss}</div>;
}
