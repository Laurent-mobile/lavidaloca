"use client";

export default function DateDisplay() {
  return (
    <div className="text-xs font-medium bg-white/10 px-3 py-1.5 rounded-full backdrop-blur-sm">
      {new Date().toLocaleDateString("fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })}
    </div>
  );
}
