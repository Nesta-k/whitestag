interface Props {
  title?: string;
  message?: string;
  retry?: () => void;
}

export default function ErrorState({
  title = "Something went wrong",
  message,
  retry,
}: Props) {
  return (
    <div className="error-state">
      <p className="error-state-title">{title}</p>
      {message && <p className="error-state-msg">{message}</p>}
      {retry && (
        <button className="btn btn-outline" onClick={retry}>
          Try again
        </button>
      )}
    </div>
  );
}

