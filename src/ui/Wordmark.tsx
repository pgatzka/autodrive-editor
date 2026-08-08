/**
 * A route between two waypoints, drawn as one stroke that crests like a hill —
 * road, path and field contour at once. Three shapes, so it survives to 16 px.
 */
export function Mark({ size = 20 }: { size?: number }) {
  const small = size <= 16;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3.5 18.5C7 18.5 8.5 5.5 12 5.5C15.5 5.5 17 18.5 20.5 18.5"
        stroke="var(--accent)"
        strokeWidth={small ? 3.2 : 2.2}
        strokeLinecap="round"
      />
      {!small && (
        <>
          <circle cx="3.5" cy="18.5" r="2.1" fill="var(--accent)" />
          <circle cx="20.5" cy="18.5" r="2.1" fill="var(--accent)" />
        </>
      )}
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="wordmark">
      <Mark />
      AutoDrive <span className="muted">Editor</span>
    </span>
  );
}
