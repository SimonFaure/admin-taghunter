import { useTranslation } from 'react-i18next';
import type { EventBooking } from '../../../../types/events';
import { Pill } from '../ui';

// Status / payment / source pills shared by the bookings list and drawer.

export function StatusPill({ b }: { b: Pick<EventBooking, 'status'> }) {
  const { t } = useTranslation('events');
  const tone = b.status === 'confirmed' ? 'green' : b.status === 'pending' ? 'blue' : 'slate';
  return <Pill tone={tone}>{t(`bookings.st.${b.status}`)}</Pill>;
}

export function PaymentPill({ b }: { b: Pick<EventBooking, 'payment_status'> }) {
  const { t } = useTranslation('events');
  const tone = ({
    paid: 'green', offline_paid: 'green', free: 'slate', none: 'slate', offline_due: 'amber', partially_refunded: 'violet', refunded: 'violet',
  } as const)[b.payment_status] ?? 'slate';
  return <Pill tone={tone}>{t(`bookings.pay.${b.payment_status}`, { defaultValue: b.payment_status })}</Pill>;
}

export function SourcePill({ b }: { b: Pick<EventBooking, 'source'> }) {
  const { t } = useTranslation('events');
  return <Pill tone={b.source === 'online' ? 'blue' : 'slate'}>{t(`bookings.src.${b.source}`, { defaultValue: b.source })}</Pill>;
}
