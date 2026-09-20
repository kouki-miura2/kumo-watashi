/** Raw storage shape — whatever shape the datastore actually returns, before the repository maps it to a domain type. */
export interface SampleRecord {
  id: string
  label: string
}

export interface SampleDao {
  findById: (id: string) => Promise<SampleRecord | null>
}
