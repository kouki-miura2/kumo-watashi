export interface StatusRepository {
  getStatus: () => Promise<{ status: string }>;
}
