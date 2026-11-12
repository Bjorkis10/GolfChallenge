import { StorageHealthMode } from '../storage/settingsStorage';

interface StorageBannerProps {
  readonly health: StorageHealthMode;
  readonly message: string | null;
  readonly onResetCorruptedStorage: () => void;
}

export function StorageBanner({
  health,
  message,
  onResetCorruptedStorage,
}: StorageBannerProps) {
  if (health === 'ok' && !message) {
    return null;
  }

  const isLocked = health === 'corrupted_preserved_locked';
  const bannerClass = isLocked
    ? 'status-banner status-banner--danger'
    : 'status-banner';

  const titleByHealth: Record<StorageHealthMode, string> = {
    ok: 'Storage Notice',
    storage_unavailable: 'Browser Local Storage Unavailable',
    corrupted_backed_up: 'Unreadable Saved Data Backed Up',
    corrupted_preserved_locked: 'Unreadable Saved Data Preserved — Saving Paused',
  };

  return (
    <section className={bannerClass} role="alert">
      <div>
        <h2 className="status-banner__title">{titleByHealth[health]}</h2>
        <p className="status-banner__body">{message}</p>
      </div>

      {isLocked && (
        <div className="status-banner__actions">
          <button
            type="button"
            className="btn btn--danger"
            onClick={onResetCorruptedStorage}
          >
            Reset Corrupted Storage to Defaults
          </button>
        </div>
      )}
    </section>
  );
}
