export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <output className="toast" aria-live="polite">
      {message}
    </output>
  );
}
