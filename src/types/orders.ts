// Commandes (equipment sale + rental order requests). Backend: backend/api/orders.php.

export type OrderLang = 'fr' | 'en' | 'es';
export type I18nText = Record<OrderLang, string | null>;
export type OrderKind = 'sale' | 'rent';
export type OrderApp = 'playground' | 'go' | 'spot';
export type OrderStatus = 'new' | 'confirmed' | 'shipped' | 'done' | 'cancelled';
export type OrderMode = 'post' | 'in_person';

export interface OrderImage {
  file: string;
  url: string; // relative "/media/orders/<file>"
}

export interface OrderCategory {
  id: number;
  name_i18n: I18nText;
  sort_order: number;
}

/** A priced option of a product; null price = not offered in that mode. */
export interface OrderVariant {
  id: number;
  label_i18n: I18nText;
  sku: string | null;
  sale_price_cents: number | null;
  rent_price_cents_per_day: number | null;
  image: OrderImage | null;
  sort_order: number;
}

export interface OrderProduct {
  id: number;
  sku: string | null;
  category_id: number | null;
  name_i18n: I18nText;
  sale_enabled: boolean;
  sale_price_cents: number | null;
  sale_description_i18n: I18nText;
  rent_enabled: boolean;
  rent_price_cents_per_day: number | null;
  rent_description_i18n: I18nText;
  apps: OrderApp[];
  images: OrderImage[];
  visible?: boolean; // admin only
  sort_order: number;
  /** When non-empty, prices come from the variants (product prices unused). */
  variants: OrderVariant[];
}

export interface OrderContact {
  company: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
}

export interface OrderRequestLine {
  id: number;
  product_id: number | null;
  variant_id: number | null;
  sku: string | null;
  name: string;
  display_name: string;
  unit_price_cents: number;
  quantity: number;
  total_cents: number;
}

export interface OrderRequestEvent {
  id: number;
  type: 'created' | 'status' | 'edited';
  status: OrderStatus | null;
  note: string | null;
  actor: 'client' | 'admin';
  created_at: string;
}

export interface OrderRequestSummary {
  id: number;
  number: string;
  kind: OrderKind;
  status: OrderStatus;
  client_id: number;
  client_name: string | null;
  rent_start: string | null;
  rent_end: string | null;
  days: number;
  line_count: number;
  total_cents: number;
  created_at: string;
  updated_at: string;
}

export interface OrderRequestDetail extends OrderRequestSummary, OrderContact {
  lines: OrderRequestLine[];
  pickup_mode: OrderMode | null;
  return_mode: OrderMode | null;
  message: string | null;
  language: OrderLang;
  events: OrderRequestEvent[];
}

export interface OrderSubmitInput extends OrderContact {
  kind: OrderKind;
  lang: string;
  lines: { product_id: number; variant_id?: number; quantity: number }[];
  rent_start?: string;
  rent_end?: string;
  pickup_mode?: OrderMode;
  return_mode?: OrderMode;
  message?: string;
}

export interface AdminLineInput {
  id?: number;
  product_id?: number | null;
  sku: string | null;
  name: string;
  unit_price_cents: number;
  quantity: number;
}
