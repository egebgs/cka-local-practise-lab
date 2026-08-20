import { useRef, useState } from "react";

/** A draggable vertical divider. Updates are pushed to `onDragMove` on every pointer
 * move (the caller mutates a CSS variable directly via a ref for smooth 60fps dragging
 * without triggering React re-renders), and `onDragEnd` fires once on release so the
 * caller can commit the final value (e.g. to state/localStorage). */
export default function Resizer({ onDragMove, onDragEnd }) {
  const [dragging, setDragging] = useState(false);
  const draggingRef = useRef(false);

  const handleMouseDown = (e) => {
    e.preventDefault();
    draggingRef.current = true;
    setDragging(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMove = (moveEvent) => {
      if (!draggingRef.current) return;
      onDragMove(moveEvent.clientX);
    };
    const onUp = () => {
      draggingRef.current = false;
      setDragging(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      onDragEnd && onDragEnd();
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div
      className={"pane-resizer" + (dragging ? " dragging" : "")}
      onMouseDown={handleMouseDown}
      title="Drag to resize"
    />
  );
}
