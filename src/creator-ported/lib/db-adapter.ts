import { authService } from '../services/authService';
import { mediaStorage } from './mediaAdapter';

const isElectron = typeof window !== 'undefined' && (window as any).electron?.isElectron;
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';

// ---------------------------------------------------------------------------
// MySQL adapter (Electron path) - legacy, kept for Electron builds.
// ---------------------------------------------------------------------------
class MySQLQueryBuilder {
  private tableName: string;
  private operation: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private selectColumns: string = '*';
  private whereConditions: Array<{ column: string; operator: string; value: any }> = [];
  private orderByClause: string = '';
  private insertData: any = null;
  private updateData: any = null;
  private shouldReturnInserted: boolean = false;

  constructor(tableName: string) {
    this.tableName = tableName;
  }

  select(columns: string = '*') {
    if (this.operation === 'insert') {
      this.shouldReturnInserted = true;
      this.selectColumns = columns;
    } else {
      this.operation = 'select';
      this.selectColumns = columns;
    }
    return this;
  }

  insert(data: any) {
    this.operation = 'insert';
    this.insertData = Array.isArray(data) ? data : [data];
    return this;
  }

  update(data: any) {
    this.operation = 'update';
    this.updateData = data;
    return this;
  }

  upsert(_data: any, _options?: { onConflict?: string }) {
    throw new Error('upsert is not implemented in the MySQL (Electron) adapter');
  }

  delete() {
    this.operation = 'delete';
    return this;
  }

  eq(column: string, value: any) {
    this.whereConditions.push({ column, operator: '=', value });
    return this;
  }

  neq(column: string, value: any) {
    this.whereConditions.push({ column, operator: '!=', value });
    return this;
  }

  in(column: string, values: any[]) {
    this.whereConditions.push({ column, operator: 'IN', value: values });
    return this;
  }

  order(column: string, options: { ascending?: boolean } = {}) {
    const direction = options.ascending === false ? 'DESC' : 'ASC';
    this.orderByClause = `ORDER BY ${column} ${direction}`;
    return this;
  }

  limit(_n: number) {
    // Not currently wired into buildQuery; add if an Electron caller needs it.
    return this;
  }

  async maybeSingle() {
    const result = await this.execute();
    if (result.error) return result;
    return {
      data: result.data && result.data.length > 0 ? result.data[0] : null,
      error: null
    };
  }

  async single() {
    const result = await this.execute();
    if (result.error) return result;
    if (!result.data || result.data.length === 0) {
      return { data: null, error: { message: 'No rows found' } };
    }
    return {
      data: result.data[0],
      error: null
    };
  }

  then(resolve: any, reject: any) {
    return this.execute().then(resolve, reject);
  }

  private convertValue(value: any): any {
    if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)) {
      return new Date(value).toISOString().slice(0, 19).replace('T', ' ');
    }
    if (typeof value === 'object' && value !== null) {
      return JSON.stringify(value);
    }
    return value;
  }

  private buildQuery(): { sql: string; params: any[] } {
    const params: any[] = [];
    let sql = '';

    switch (this.operation) {
      case 'select':
        sql = `SELECT ${this.selectColumns} FROM ${this.tableName}`;
        if (this.whereConditions.length > 0) {
          const whereClauses = this.whereConditions.map(cond => {
            if (cond.operator === 'IN') {
              const placeholders = cond.value.map(() => '?').join(', ');
              params.push(...cond.value);
              return `${cond.column} IN (${placeholders})`;
            } else {
              params.push(cond.value);
              return `${cond.column} ${cond.operator} ?`;
            }
          });
          sql += ` WHERE ${whereClauses.join(' AND ')}`;
        }
        if (this.orderByClause) {
          sql += ` ${this.orderByClause}`;
        }
        break;

      case 'insert':
        if (this.insertData && this.insertData.length > 0) {
          const columns = Object.keys(this.insertData[0]);
          const placeholders = columns.map(() => '?').join(', ');
          sql = `INSERT INTO ${this.tableName} (${columns.join(', ')}) VALUES `;

          const valueSets = this.insertData.map((row: any) => {
            params.push(...columns.map(col => this.convertValue(row[col])));
            return `(${placeholders})`;
          });

          sql += valueSets.join(', ');
        }
        break;

      case 'update':
        if (this.updateData) {
          const setClauses = Object.keys(this.updateData).map(key => {
            params.push(this.convertValue(this.updateData[key]));
            return `${key} = ?`;
          });
          sql = `UPDATE ${this.tableName} SET ${setClauses.join(', ')}`;

          if (this.whereConditions.length > 0) {
            const whereClauses = this.whereConditions.map(cond => {
              params.push(cond.value);
              return `${cond.column} ${cond.operator} ?`;
            });
            sql += ` WHERE ${whereClauses.join(' AND ')}`;
          }
        }
        break;

      case 'delete':
        sql = `DELETE FROM ${this.tableName}`;
        if (this.whereConditions.length > 0) {
          const whereClauses = this.whereConditions.map(cond => {
            params.push(cond.value);
            return `${cond.column} ${cond.operator} ?`;
          });
          sql += ` WHERE ${whereClauses.join(' AND ')}`;
        }
        break;
    }

    return { sql, params };
  }

  private async execute() {
    try {
      const { sql, params } = this.buildQuery();
      const result = await (window as any).electron.db.query(sql, params);

      if (result.error) return { data: null, error: { message: result.error } };

      let data = result.rows || [];

      if (this.operation === 'insert' && this.shouldReturnInserted && result.rows && result.rows.insertId) {
        const insertId = result.rows.insertId;
        const affectedRows = result.rows.affectedRows || 1;
        const selectSql = affectedRows === 1
          ? `SELECT ${this.selectColumns} FROM ${this.tableName} WHERE id = ?`
          : `SELECT ${this.selectColumns} FROM ${this.tableName} WHERE id >= ? AND id < ?`;
        const selectParams = affectedRows === 1 ? [insertId] : [insertId, insertId + affectedRows];
        const selectResult = await (window as any).electron.db.query(selectSql, selectParams);
        if (selectResult.error) return { data: null, error: { message: selectResult.error } };
        data = selectResult.rows || [];
      }

      return { data, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message || 'Database error' } };
    }
  }
}

// ---------------------------------------------------------------------------
// PHP adapter - routes builder-style queries to the admin backend via
// /backend/api/query.php (a generic, whitelisted dispatcher).
// ---------------------------------------------------------------------------

type WhereTuple = [string, string, any];
type OrderTuple = [string, 'asc' | 'desc'];

class PhpQueryBuilder {
  private tableName: string;
  private op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
  private selectColumns: string = '*';
  private where: WhereTuple[] = [];
  private orderBy: OrderTuple[] = [];
  private limitVal: number | null = null;
  private values: any = null;
  private onConflict: string | null = null;
  private returning: boolean = false;

  constructor(tableName: string) {
    this.tableName = tableName;
  }

  select(columns: string = '*') {
    if (this.op === 'insert' || this.op === 'update' || this.op === 'upsert') {
      // `.insert(...).select()` returns the affected rows.
      this.returning = true;
      if (columns && columns !== '*') this.selectColumns = columns;
      return this;
    }
    this.op = 'select';
    this.selectColumns = columns || '*';
    return this;
  }

  insert(data: any) {
    this.op = 'insert';
    this.values = data;
    return this;
  }

  update(data: any) {
    this.op = 'update';
    this.values = data;
    return this;
  }

  upsert(data: any, options?: { onConflict?: string }) {
    this.op = 'upsert';
    this.values = data;
    this.onConflict = options?.onConflict ?? null;
    return this;
  }

  delete() {
    this.op = 'delete';
    return this;
  }

  eq(column: string, value: any)  { this.where.push([column, 'eq',  value]); return this; }
  neq(column: string, value: any) { this.where.push([column, 'neq', value]); return this; }
  in(column: string, values: any[]) { this.where.push([column, 'in', values]); return this; }

  order(column: string, options: { ascending?: boolean } = {}) {
    this.orderBy.push([column, options.ascending === false ? 'desc' : 'asc']);
    return this;
  }

  limit(n: number) { this.limitVal = n; return this; }

  async maybeSingle() {
    return this.send({ maybeSingle: true });
  }

  async single() {
    return this.send({ single: true });
  }

  then(resolve: any, reject: any) {
    return this.send().then(resolve, reject);
  }

  private async send(extra: Record<string, any> = {}): Promise<{ data: any; error: any }> {
    const body: Record<string, any> = {
      table: this.tableName,
      op: this.op,
      ...extra,
    };

    if (this.op === 'select') {
      body.select = this.selectColumns;
      if (this.where.length) body.where = this.where;
      if (this.orderBy.length) body.order = this.orderBy;
      if (this.limitVal !== null) body.limit = this.limitVal;
    } else if (this.op === 'insert') {
      body.values = this.values;
      if (this.returning) body.returning = true;
    } else if (this.op === 'update') {
      body.values = this.values;
      if (this.where.length) body.where = this.where;
      if (this.returning) body.returning = true;
    } else if (this.op === 'upsert') {
      body.values = this.values;
      if (this.onConflict) body.onConflict = this.onConflict;
      if (this.returning) body.returning = true;
    } else if (this.op === 'delete') {
      if (this.where.length) body.where = this.where;
    }

    try {
      const authHeaders = authService.getAuthHeaders() as Record<string, string>;
      const response = await fetch(`${API_BASE_URL}/query.php`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify(body),
      });

      const text = await response.text();
      let json: any;
      try {
        json = JSON.parse(text);
      } catch {
        return { data: null, error: { message: `Invalid JSON from query.php: ${text.slice(0, 200)}` } };
      }

      if (!response.ok) {
        const message = json?.error?.message || json?.error || `HTTP ${response.status}`;
        return { data: null, error: { message } };
      }

      // query.php's INSERT/UPDATE/UPSERT return arrays even with single/maybeSingle.
      // Unwrap to a single object when requested.
      let data = json.data ?? null;
      const wantSingle = !!extra.single || !!extra.maybeSingle;
      if (wantSingle && this.op !== 'select' && Array.isArray(data)) {
        data = data.length > 0 ? data[0] : null;
        if (extra.single && data === null) {
          return { data: null, error: { message: 'No rows returned' } };
        }
      }
      return { data, error: json.error ?? null };
    } catch (error: any) {
      return { data: null, error: { message: error?.message || 'Network error' } };
    }
  }
}

// ---------------------------------------------------------------------------

export const createDbAdapter = (legacyClient: any) => {
  if (isElectron && (window as any).electron?.db?.query) {
    return {
      from: (tableName: string) => new MySQLQueryBuilder(tableName),
      storage: legacyClient?.storage,
    };
  }

  if (legacyClient) {
    return legacyClient;
  }

  // Default for browser web-app mode: route all .from(...) table calls through
  // admin /query.php, and storage calls through /media.php.
  return {
    from: (tableName: string) => new PhpQueryBuilder(tableName),
    storage: mediaStorage,
  };
};
