// Licensee notifications (home bell) - backend/api/notifications.php,
// shaped by backend/utils/LicenseeNotifications.php::listFor().
import type { OrderKind, OrderStatus } from './orders';

interface Base {
  /** Stable per event ('n12' = licensee_notifications row, 'o34' = order event). */
  key: string;
  created_at: string;
  unread: boolean;
  /** Studio route to open. */
  link: string;
}

export type NotificationApp = 'playground' | 'go' | 'spot';

/** A Tag Hunter product published, or newly available in GO / Spot. */
export interface ScenarioNotification extends Base {
  type: 'scenario';
  title: string;
  game_type: string;
  /** Which of the licensee's apps it concerns (playground = newly published). */
  apps: NotificationApp[];
}

/** A new Playground version, on the stable or the test channel. */
export interface ReleaseNotification extends Base {
  type: 'release';
  version: string;
  channel: 'stable' | 'test';
}

/** A game type that became available to the licensee. */
export interface GameTypeNotification extends Base {
  type: 'game_type';
  code: string;
  name: string;
}

/** Tag Hunter updated one of the licensee's equipment requests. */
export interface OrderUpdateNotification extends Base {
  type: 'order';
  event: 'status' | 'edited';
  status: OrderStatus | null;
  note: string | null;
  number: string;
  kind: OrderKind;
}

export type LicenseeNotification =
  | ScenarioNotification
  | ReleaseNotification
  | GameTypeNotification
  | OrderUpdateNotification;

export interface NotificationsFeed {
  items: LicenseeNotification[];
  unread_count: number;
}
