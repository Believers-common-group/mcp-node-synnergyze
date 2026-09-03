export interface RegistryPostgresQueryResultV1<T> {
  rows: T[];
  rowCount: number;
}

export interface RegistryPostgresQueryExecutorV1 {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<RegistryPostgresQueryResultV1<T>>;
}
