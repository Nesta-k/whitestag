interface Props {
  title?: string;
  message?: string;
}

export default function EmptyState({
  title = "Nothing here yet",
  message,
}: Props) {
  return (
    <div className="empty-state">
      <p className="empty-state-title">{title}</p>
      {message && <p className="empty-state-msg">{message}</p>}
    </div>
  );
}

